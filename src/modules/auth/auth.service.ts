import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException, ServiceUnavailableException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { AnalyticsService } from '../analytics/analytics.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { gecerliTcKimlik, TC_CAKISMA_MESAJI } from '../../common/tc-kimlik';
import { kampanyaCikar } from '../analytics/kampanya';
import { Prisma } from '@prisma/client';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

// Onay metinleri güncellendiğinde sürüm artırılmalı — geçmiş onaylar hangi metne
// verildiğini kaybetmesin diye eski UserConsent satırları değiştirilmez, yenisi eklenir.
const TERMS_VERSION = 'v1';
const KVKK_VERSION = 'v1';

/** "Kurucu Üye" rozeti verilecek üye sayısı. */
const FOUNDER_LIMIT = 100;

/** Dogrulama baglantisinin gecerlilik suresi (posta metninde "24 saat" yaziyor). */
const TOKEN_GECERLILIK_MS = 24 * 60 * 60 * 1000;

/** Ayni hesaba iki dogrulama postasi arasindaki en kisa sure. */
const YENIDEN_GONDERIM_BEKLEME_SN = 60;

/**
 * Kayit isteginden kampanya damgasini uretir.
 *
 * Kampanya yoksa BOS nesne doner - kolonlar null kalir ve raporda
 * "kaynak belirlenemedi" olarak gorunur. Tahminle doldurmuyoruz.
 */
/**
 * E-posta gonderim hatasini SABIT bir koda cevirir.
 *
 * Saglayicinin ham hata mesaji kaydedilmiyor: icinde alici adresi ya da
 * baska kisisel veri gecebilir. Yalnizca kaba sinif.
 */
function mailHataKodu(e: any): string {
  const m = String(e?.message ?? '').toLowerCase();
  if (m.includes('rate') || m.includes('429')) return 'hiz_siniri';
  if (m.includes('invalid') || m.includes('validation')) return 'gecersiz_adres';
  if (m.includes('auth') || m.includes('api key') || m.includes('unauthorized')) return 'saglayici_yetki';
  if (m.includes('timeout') || m.includes('network') || m.includes('fetch')) return 'ag';
  return 'saglayici';
}

function kampanyaDamgasi(gelen: unknown) {
  const k = kampanyaCikar(
    (gelen && typeof gelen === 'object' && !Array.isArray(gelen)
      ? {
          utm_source: (gelen as any).kaynak ?? (gelen as any).utm_source,
          utm_medium: (gelen as any).ortam ?? (gelen as any).utm_medium,
          utm_campaign: (gelen as any).kampanya ?? (gelen as any).utm_campaign,
          utm_content: (gelen as any).icerik ?? (gelen as any).utm_content,
        }
      : {}) as Record<string, string | undefined>,
  );
  if (!k) return {};
  return {
    kampanyaKaynak: k.kaynak,
    kampanyaOrtam: k.ortam,
    kampanyaAdi: k.kampanya,
    kampanyaIcerik: k.icerik,
    kampanyaIlkTemas: new Date(),
  };
}

/**
 * Rotasyondan sonra ÖNCEKİ yenileme tokenının kabul edildiği süre.
 *
 * Eşzamanlı sekmelerin birbirini atmasını önlüyor. Dar tutuluyor:
 * pencere büyüdükçe çalınmış bir tokenın fark edilmeden kullanılabildiği
 * aralık da büyür.
 */
const YENILEME_PENCERESI_SN = 30;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
    private audit: AuditService,
    private settings: SettingsService,
    private analytics: AnalyticsService,
  ) {}

  async register(dto: RegisterDto, ip?: string): Promise<{ message: string }> {
    if (await this.settings.get('maintenance_mode')) {
      throw new ServiceUnavailableException('Sistem bakımda, lütfen daha sonra tekrar deneyin.');
    }
    if (!(await this.settings.get('new_registrations'))) {
      throw new ServiceUnavailableException('Yeni kayıtlar şu anda kapalı.');
    }
    if (dto.tcKimlik && !gecerliTcKimlik(dto.tcKimlik)) {
      throw new BadRequestException('Geçersiz TC Kimlik numarası');
    }

    const [byEmail, byTc, byPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      dto.tcKimlik ? this.prisma.user.findFirst({ where: { tcKimlik: dto.tcKimlik } }) : null,
      // Telefon opsiyonel: bos gelince benzersizlik sorgusu yapilmamali,
      // yoksa phone=undefined ile arama hata verir.
      dto.phone ? this.prisma.user.findUnique({ where: { phone: dto.phone } }) : null,
    ]);

    if (byEmail) throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
    if (byTc) throw new ConflictException(TC_CAKISMA_MESAJI);
    if (byPhone) throw new ConflictException('Bu telefon numarası zaten kayıtlı');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const token = generateToken();
    const expiry = new Date(Date.now() + TOKEN_GECERLILIK_MS);

    // İlk 100 üyeye kalıcı "Kurucu Üye" rozeti. Erken gelmeyi dezavantaj
    // olmaktan çıkarıp ayrıcalığa çeviriyor; rozet profilde ve ilan
    // detayında güven sinyali olarak görünüyor.
    const founderCount = await this.prisma.user.count({ where: { isFounder: true } });
    const isFounder = founderCount < FOUNDER_LIMIT;

    // Kullanici adi herkese acik tek kimlik; cakismasi karisiklik yaratir.
    const adAlinmis = await this.prisma.user.findFirst({
      where: { displayName: { equals: dto.displayName, mode: 'insensitive' } },
      select: { id: true },
    });
    if (adAlinmis) {
      throw new BadRequestException('Bu kullanıcı adı alınmış, başka bir tane deneyin');
    }

    // Yukaridaki benzersizlik kontrolleri ile bu yazma arasinda ayni
    // e-posta/T.C./telefon ile ikinci bir kayit girebilir. Kolonlar UNIQUE
    // oldugu icin veritabani ikincisini reddediyor, ama ham Prisma hatasi
    // global filtreden 500 "Internal server error" olarak cikiyordu:
    // kullanici neyin cakistigini anlamiyordu.
    const user = await this.kullaniciOlustur({
      data: {
        email: dto.email,
        passwordHash: hashedPassword,
        displayName: dto.displayName,   // herkese acik: kullanici adi
        realName: dto.realName,         // yalnizca panel/fatura
        tcKimlik: dto.tcKimlik,
        // Bos string yerine null: `phone` benzersiz bir alan, iki
        // kullanici bos string ile kayit olursa ikincisi cakisirdi.
        phone: dto.phone || null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        gender: dto.gender,
        city: dto.city,
        district: dto.district,
        status: 'PENDING',
        isFounder,
        emailVerificationToken: token,
        emailVerificationExpiry: expiry,
        // Hesabi getiren kampanya — ILK TEMAS, yalnizca kayitta yaziliyor
        // ve bir daha degismiyor. Ziyaret kapsamindaki kampanya degisebilir
        // (son temas kazanir) ama "bu hesabi hangi kampanya getirdi"
        // sorusunun tek bir cevabi olmali.
        ...kampanyaDamgasi(dto.kampanya),
        // Kayit girisimini olusan hesaba bagla. YALNIZCA sunucuda
        // kuruluyor; istemci bu bagi iddia edemiyor.
        kayitGirisimId: dto.girisimId ?? null,
        kayitYontemi: 'form',
      },
    });

    /**
     * SUNUCU OLAYI: hesap gercekten olustu.
     *
     * Istemcinin "gonderdim" olayindan AYRI: gonderim basari degil.
     * Benzersiz anahtar hesabin kimligi - ayni hesap iki kez
     * sayilamiyor. Olcum hatasi kaydi bozmasin diye await edilse bile
     * sunucuOlayi hicbir kosulda firlatmiyor.
     */
    await this.analytics.sunucuOlayi('uyelik_hesap_olusturuldu', {
      benzersizAnahtar: user.id,
      flowId: dto.girisimId ?? null,
      userId: user.id,
      props: { yontem: 'form', dogrulamaGerekli: true },
    });

    // Onay kayıtları — değişmez log, ileride hukuki ispat için kullanılır.
    await this.prisma.userConsent.createMany({
      data: [
        { userId: user.id, type: 'TERMS', accepted: true, version: TERMS_VERSION, ip },
        { userId: user.id, type: 'KVKK', accepted: true, version: KVKK_VERSION, ip },
        { userId: user.id, type: 'MARKETING', accepted: !!dto.acceptedMarketing, version: KVKK_VERSION, ip },
      ],
    });

    /**
     * Dogrulama e-postasi. UC AYRI DURUM olculuyor:
     *   istendi          - gonderim talebi yapildi
     *   saglayici_kabul  - Resend istegi kabul etti
     *   hata             - gonderilemedi
     *
     * "saglayici kabul etti" TESLIM EDILDI DEMEK DEGIL. Resend webhook'u
     * kurulu olmadigi icin teslim/bounce/sikayet BILINMIYOR ve raporda
     * oyle gosteriliyor. Acilma pikseli yok.
     */
    await this.analytics.sunucuOlayi('uyelik_dogrulama_maili', {
      benzersizAnahtar: `${user.id}:istendi:1`,
      flowId: dto.girisimId ?? null,
      userId: user.id,
      props: { durum: 'istendi', tekrar: false },
    });
    // Gonderim sonucu dogrudan mail katmanindan okunuyor; "atlandi"
    // (test alan adi ya da saglayici yapilandirilmamis) basari gibi
    // gosterilmiyor - bu ayrim olmadan olcum yanlis pozitif uretiyordu.
    const mailSonuc = await this.mail
      .sendVerificationEmail(user.email, user.displayName, token)
      .catch((e: any) => ({ durum: 'hata' as const, kod: mailHataKodu(e) }));
    await this.analytics.sunucuOlayi('uyelik_dogrulama_maili', {
      benzersizAnahtar: `${user.id}:sonuc:1`,
      flowId: dto.girisimId ?? null,
      userId: user.id,
      props:
        mailSonuc.durum === 'kabul'
          ? { durum: 'saglayici_kabul', tekrar: false }
          : mailSonuc.durum === 'atlandi'
            ? { durum: 'atlandi', tekrar: false, kod: mailSonuc.kod ?? 'bilinmiyor' }
            : { durum: 'hata', tekrar: false, kod: (mailSonuc as any).kod ?? 'bilinmiyor' },
    });

    return { message: 'Kayıt başarılı. E-posta adresinize doğrulama linki gönderdik.' };
  }

  async verifyEmail(token: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { emailVerificationToken: token } });
    if (!user) throw new BadRequestException('Geçersiz doğrulama linki');
    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      throw new BadRequestException('Doğrulama linkinin süresi dolmuş. Yeni link talep edebilirsin.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    /**
     * SUNUCU OLAYI: dogrulama GERCEKTEN tamamlandi.
     *
     * Dogrulama sayfasinin acilmasi ya da baglantinin e-posta guvenlik
     * tarayicisi tarafindan ziyaret edilmesi buraya ULASMIYOR - token
     * tuketilmeden bu satira gelinmiyor.
     *
     * Benzersiz anahtar hesabin kimligi: tekrar acilan baglanti ayni
     * hesabi ikinci kez dogrulanmis saymiyor (zaten token silindigi
     * icin ikinci cagri 'Gecersiz dogrulama linki' aliyor).
     *
     * flowId hesaptan okunuyor, ADRESTEN DEGIL: dogrulama baglantisindaki
     * hicbir parametre kayit kampanyasini ya da girisimi degistiremiyor.
     */
    await this.analytics.sunucuOlayi('uyelik_eposta_dogrulandi', {
      benzersizAnahtar: user.id,
      flowId: user.kayitGirisimId ?? null,
      userId: user.id,
      props: { yontem: 'baglanti' },
    });

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
    };
  }

  /**
   * user.create'i sarmalar ve benzersizlik cakismasini anlasilir hataya
   * cevirir. Hangi alanin cakistigi Prisma'nin meta.target'indan geliyor;
   * cakisan hesabin kendisi hakkinda hicbir bilgi donmuyor.
   */
  private async kullaniciOlustur(args: Prisma.UserCreateArgs) {
    try {
      return await this.prisma.user.create(args);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const alanlar = (e.meta?.target as string[] | undefined) ?? [];
        if (alanlar.includes('tcKimlik')) throw new ConflictException(TC_CAKISMA_MESAJI);
        if (alanlar.includes('email')) throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
        if (alanlar.includes('phone')) throw new ConflictException('Bu telefon numarası zaten kayıtlı');
        throw new ConflictException('Bu bilgi zaten kayıtlı');
      }
      throw e;
    }
  }

  /**
   * Dogrulama postasini yeniden gonderir.
   *
   * TUM yollarda ayni yanit donuyor. Onceden basarili gonderim "Doğrulama
   * linki tekrar gönderildi", digerleri "İşlem tamamlandı" donuyordu: bu fark
   * tek basina bir hesap sayim (enumeration) araciydi - bir adres listesini
   * bu uca verip hangilerinin kayitli ve dogrulanmamis oldugunu ogrenmek
   * mumkundu. Olculdu ve duzeltildi.
   */
  async resendVerification(email: string): Promise<{ message: string }> {
    // Hesap var/yok, dogrulanmis/dogrulanmamis, bekleme suresi dolmus/dolmamis
    // - hepsinde ayni cumle.
    const notrYanit = {
      message: 'Hesabın doğrulanmayı bekliyorsa doğrulama linkini tekrar gönderdik.',
    };
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Hesap yok ya da zaten dogrulanmis: ayni yanit donuyor, boylece bu uc
    // hesap varligini sizdirmiyor.
    if (!user || user.emailVerifiedAt) return notrYanit;

    // Hesap basina bekleme suresi. IP siniri tek basina yetmiyor: saldirgan
    // IP degistirerek ayni adrese postayi yagdirabilir. Son gonderimin
    // zamanini token suresinden geri hesapliyoruz; yeni kolon gerekmiyor.
    if (user.emailVerificationExpiry) {
      const sonGonderim = user.emailVerificationExpiry.getTime() - TOKEN_GECERLILIK_MS;
      const gecenSn = (Date.now() - sonGonderim) / 1000;
      if (gecenSn < YENIDEN_GONDERIM_BEKLEME_SN) {
        return notrYanit;
      }
    }

    const token = generateToken();
    const expiry = new Date(Date.now() + TOKEN_GECERLILIK_MS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: token, emailVerificationExpiry: expiry },
    });

    /**
     * YENIDEN GONDERIM — ilk gonderimden AYRI isaretleniyor (`tekrar: true`).
     *
     * Benzersiz anahtar her seferinde degisiyor (zaman damgali) cunku
     * tekrar gonderimler gercekten birden cok kez olabilir; ilk gonderim
     * ise hesap basina bir kez.
     *
     * flowId hesaptan okunuyor: yeniden gonderim istegi kayit
     * girisiminden saatler sonra, baska bir sekmeden gelebiliyor.
     */
    const damga = Date.now();
    await this.analytics.sunucuOlayi('uyelik_dogrulama_maili', {
      benzersizAnahtar: `${user.id}:istendi:${damga}`,
      flowId: user.kayitGirisimId ?? null,
      userId: user.id,
      props: { durum: 'istendi', tekrar: true },
    });
    const tekrarSonuc = await this.mail
      .sendVerificationEmail(user.email, user.displayName, token)
      .catch((e: any) => ({ durum: 'hata' as const, kod: mailHataKodu(e) }));
    await this.analytics.sunucuOlayi('uyelik_dogrulama_maili', {
      benzersizAnahtar: `${user.id}:sonuc:${damga}`,
      flowId: user.kayitGirisimId ?? null,
      userId: user.id,
      props:
        tekrarSonuc.durum === 'kabul'
          ? { durum: 'saglayici_kabul', tekrar: true }
          : tekrarSonuc.durum === 'atlandi'
            ? { durum: 'atlandi', tekrar: true, kod: tekrarSonuc.kod ?? 'bilinmiyor' }
            : { durum: 'hata', tekrar: true, kod: (tekrarSonuc as any).kod ?? 'bilinmiyor' },
    });
    return notrYanit;
  }

  async login(dto: LoginDto, isAdminPanel = false, ip?: string, userAgent?: string): Promise<AuthResponseDto> {
    if (!isAdminPanel && (await this.settings.get('maintenance_mode'))) {
      throw new ServiceUnavailableException('Sistem bakımda, lütfen daha sonra tekrar deneyin.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('E-posta veya şifre hatalı');

    if (!user.passwordHash) throw new UnauthorizedException('Bu hesap Google ile oluşturulmuştur. Google ile giriş yapın.');
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      this.audit.log({ actorId: user.id, action: 'auth.login_failed', entity: 'User', entityId: user.id, ip, userAgent });
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('E-posta adresinizi doğrulamanız gerekiyor. Lütfen gelen kutunuzu kontrol edin.');
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new UnauthorizedException('Hesabınız askıya alınmıştır.');
    }

    // MFA sadece admin panelinden gelen isteklerde ve admin rolündeyse devreye girer
    const isAdminUser = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(user.role);
    if (isAdminPanel && isAdminUser) {
      // Math.random() kriptografik degil; V8'in durumu yeterli ciktidan
      // geri cikarilabiliyor. Dogrulama kodu bir kimlik dogrulama sirri
      // oldugu icin CSPRNG kullaniyoruz. Davranis ayni: 6 haneli kod.
      const otp = String(crypto.randomInt(100000, 1000000));
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { adminMfaOtp: otp, adminMfaOtpExpiry: expiry },
      });
      this.mail.sendAdminMfaEmail(user.email, user.displayName, otp).catch(() => null);
      return { mfaRequired: true, email: user.email } as any;
    }

    this.audit.log({ actorId: user.id, action: 'auth.login_success', entity: 'User', entityId: user.id, meta: { method: 'password' }, ip, userAgent });

    // Son giriş damgası. Web, mobil web ve mobil uygulama bu aynı uçtan
    // geçiyor (platform yalnızca Device kaydını ayırıyor), dolayısıyla tek
    // yazma üç platformu da kapsıyor. Beklemiyoruz: damganın gecikmesi
    // girişi geciktirmemeli.
    this.prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => null);

    // Her cihazdan giriş: 2 saatlik access token + Device kaydı üzerinden refresh token.
    // dto.platform yoksa web varsayilir (WEB); model/appVersion yalnizca mobil icin dolu.
    const platform: 'IOS' | 'ANDROID' | 'WEB' = dto.platform ?? 'WEB';
    const { deviceId, refreshToken } = await this.issueDeviceSession(user.id, platform, dto.deviceModel, dto.appVersion);
    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email }, { expiresIn: '2h' });

    // Sozlesme/KVKK onayi olmayanlari onay ekranina yonlendirebilmek icin.
    // Bu bilgi Google girisinde zaten donuyordu ama parola ile giriste yoktu;
    // dolayisiyla onay akisi eklenmeden once kaydolan kullanicilara onay hic
    // sorulmuyordu. Olcum: 20 kullanicinin 13'unde hicbir onay kaydi yok -
    // yani onlarla iletisim kurmanin yasal zemini eksikti.
    const termsConsent = await this.prisma.userConsent.findFirst({
      where: { userId: user.id, type: 'TERMS' },
      select: { id: true },
    });

    // Kullanici adi secmemis olanlari yonlendirebilmek icin. Isaret basit:
    // gorunen ad hala gercek adla ayniysa kullanici henuz secim yapmamistir.
    // Bu kisilerin gercek adi ilan, mesaj ve teklif ekranlarinda goruntuleniyor.
    const kullaniciAdiSecilmemis = !!user.realName && user.displayName === user.realName;

    return {
      accessToken,
      refreshToken,
      deviceId,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
      needsConsent: !termsConsent,
      needsUsername: kullaniciAdiSecilmemis,
    };
  }

  // Web girişinde Device kaydı yok (cookie/JWT 24h yeterli) — sadece mobil için.
  private async issueDeviceSession(userId: string, platform: 'IOS' | 'ANDROID' | 'WEB', deviceModel?: string, appVersion?: string) {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    // Her giriş yeni bir Device satırı yazıyor, yani "kayıt var mı" sorusu
    // tek başına yeni cihazı ayırt etmiyor. Aynı platform + model son 30
    // günde hiç görülmediyse bunu gerçekten yeni bir cihaz sayıyoruz -
    // aksi halde kullanıcı her girişte güvenlik maili alır ve uyarı
    // gürültüye dönüşüp asıl işini göremez.
    const otuzGunOnce = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const tanidik = await this.prisma.device.findFirst({
      where: { userId, platform, model: deviceModel ?? null, createdAt: { gte: otuzGunOnce } },
      select: { id: true },
    });

    const device = await this.prisma.device.create({
      data: { userId, platform, model: deviceModel, appVersion, refreshTokenHash },
    });

    if (!tanidik) {
      this.yeniCihazUyarisi(userId, platform, deviceModel).catch(() => null);
    }

    return { deviceId: device.id, refreshToken };
  }

  /**
   * Tanınmayan bir cihazdan giriş yapıldığında güvenlik maili.
   *
   * Hesap ele geçirilmesinde kullanıcının durumu fark etmesini sağlayan tek
   * şey bu. Bildirim tercihine bakılmıyor: güvenlik uyarısı kapatılabilir
   * bir tercih değil.
   *
   * Yalnızca mobil girişleri kapsıyor - web girişinde Device kaydı hiç
   * tutulmuyor (cookie/JWT yeterli görülmüş), dolayısıyla webde "yeni
   * cihaz" diye bir kavram yok.
   */
  private async yeniCihazUyarisi(userId: string, platform: string, deviceModel?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { email: true, displayName: true },
    });
    if (!user) return;
    const cihaz = [deviceModel, platform === 'IOS' ? 'iOS' : platform === 'ANDROID' ? 'Android' : null]
      .filter(Boolean)
      .join(' · ');
    await this.mail
      .sendSecurityAlertEmail(user.email, user.displayName, 'new_device', {
        cihaz: cihaz || undefined,
        tarih: new Date(),
      })
      .catch(() => null);
  }

  async refreshAccessToken(deviceId: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.revokedAt) throw new UnauthorizedException('Oturum geçersiz, lütfen tekrar giriş yapın');

    const guncelMi = await bcrypt.compare(refreshToken, device.refreshTokenHash);

    /**
     * ÖNCEKİ tokenın kısa geçerlilik penceresi.
     *
     * ── ÇÖZDÜĞÜ SORUN ────────────────────────────────────────────
     *
     * Rotasyon her yenilemede yeni token üretiyor. İki sekme aynı anda
     * yenileme yaptığında ikincisi kaçınılmaz olarak ESKİ tokenı
     * sunar. Tekrar kullanım koruması bunu hırsızlık sayıp cihazı
     * iptal ederse, kullanıcı hiçbir şey yapmadığı hâlde tüm
     * sekmelerden atılır — yani koruma kendi kullanıcımızı vurur.
     *
     * ── NEDEN KORUMAYI KALDIRMIYORUZ ─────────────────────────────
     *
     * Tekrar kullanım tespiti, çalınmış bir tokenı fark etmenin tek
     * yolu. Kaldırmak yerine DARALTIYORUZ: yalnızca bir önceki token,
     * yalnızca saniyeler boyunca kabul ediliyor.
     *
     * ── KABUL EDİLEN ÖDÜNÇ ───────────────────────────────────────
     *
     * Çalınan bir token, rotasyonundan sonraki pencere içinde
     * kullanılırsa yakalanmaz. Pencere bu yüzden dar. Ondan eskisi ya
     * da hiç eşleşmeyen bir token gelirse cihaz yine iptal ediliyor.
     */
    const simdi = new Date();
    const penceredeMi =
      !guncelMi &&
      !!device.oncekiTokenHash &&
      !!device.oncekiGecerlilik &&
      device.oncekiGecerlilik > simdi &&
      (await bcrypt.compare(refreshToken, device.oncekiTokenHash));

    if (!guncelMi && !penceredeMi) {
      /**
       * TEKRAR KULLANIM TESPİTİ.
       *
       * Ne güncel token ne de pencere içindeki önceki token. Elinde
       * böyle bir token olan ya çalınmış bir kopyayı deniyordur ya da
       * çok eski bir sekmedir; ikisini ayırt edemeyiz.
       *
       * Cihazı iptal ediyoruz: en kötü durumda kullanıcı yeniden giriş
       * yapar, alternatifte hırsız oturumu kullanmaya devam eder.
       */
      await this.prisma.device.update({
        where: { id: deviceId },
        data: { revokedAt: new Date() },
      });
      // Kayitta yalnizca cihaz kimligi var; token ya da kullanici
      // verisi loga GIRMIYOR.
      new Logger(AuthService.name).warn(
        `Yenileme tokeni tekrar kullanildi, cihaz iptal edildi: ${deviceId}`,
      );
      throw new UnauthorizedException('Oturum geçersiz, lütfen tekrar giriş yapın');
    }

    const user = await this.prisma.user.findUnique({ where: { id: device.userId } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new UnauthorizedException('Hesabınız askıya alınmıştır.');
    }

    // Rotasyon: her refresh'te yeni refresh token üretilir.
    //
    // Devredilen token, kısa bir pencere boyunca "önceki" olarak
    // saklanıyor — eşzamanlı sekmeler bu pencere sayesinde atılmıyor
    // (yukarıdaki açıklama).
    const newRefreshToken = generateRefreshToken();
    const newHash = await bcrypt.hash(newRefreshToken, 10);
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        refreshTokenHash: newHash,
        oncekiTokenHash: device.refreshTokenHash,
        oncekiGecerlilik: new Date(Date.now() + YENILEME_PENCERESI_SN * 1000),
        lastSeenAt: new Date(),
      },
    });

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email }, { expiresIn: '2h' });
    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Cihazı yenileme tokenıyla iptal eder (çıkış).
   *
   * `revokeDevice` kullanıcı kimliği istiyor; çıkış yaparken erişim
   * tokenı süresi dolmuş olabilir, yani kullanıcıyı bilmiyor
   * olabiliriz. Yetki burada tokenın KENDİSİNDEN geliyor: doğru
   * tokenı sunan kişi zaten o oturumun sahibi.
   *
   * Token yanlışsa sessizce dönüyoruz — çıkış isteği hata vermemeli,
   * ama yanlış tokenla başkasının oturumunu da kapatamamalı.
   */
  async cihaziIptalEt(deviceId: string, refreshToken: string): Promise<{ ok: boolean }> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.revokedAt) return { ok: true };
    const gecerli = await bcrypt.compare(refreshToken, device.refreshTokenHash);
    if (!gecerli) return { ok: true };
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async revokeDevice(userId: string, deviceId: string): Promise<{ ok: boolean }> {
    await this.prisma.device.updateMany({
      where: { id: deviceId, userId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async loginWithGoogle(profile: {
    googleId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<AuthResponseDto> {
    const { googleId, email, displayName, avatarUrl } = profile;

    let user = await this.prisma.user.findUnique({ where: { googleId } });
    /**
     * MEVCUT hesabin Google ile girmesi YENI UYELIK DEGIL.
     *
     * Bayrak yalnizca gercekten yeni bir satir olusturuldugunda true
     * oluyor; e-posta eslesmesiyle baglanan mevcut hesap da yeni
     * sayilmiyor.
     */
    let yeniHesap = false;

    if (!user) {
      // e-posta eşleşmesi varsa mevcut hesabı bağla
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId, avatarUrl: byEmail.avatarUrl ?? avatarUrl, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(), status: byEmail.status === 'PENDING' ? 'ACTIVE' : byEmail.status },
        });
      } else {
        // Yeni Google kullanıcısı oluştur — e-posta kaydıyla aynı kurucu
        // rozeti kuralına tabi.
        const founderCount = await this.prisma.user.count({ where: { isFounder: true } });
        yeniHesap = true;
        user = await this.prisma.user.create({
          data: {
            email,
            googleId,
            displayName,
            avatarUrl,
            passwordHash: null,
            status: 'ACTIVE',
            isFounder: founderCount < FOUNDER_LIMIT,
            // Google e-postayi kendisi dogrulamis sayiyor. Bu, MOTORYA'nin
            // dogrulama baglantisina tiklanmasiyla AYNI SEY DEGIL; rapor
            // ikisini ayri yontem olarak gosteriyor ve Google hesaplarini
            // "dogrulanmamis" diye huni kaybi gibi SAYMIYOR.
            emailVerifiedAt: new Date(),
            kayitYontemi: 'google',
          },
        });
      }
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new UnauthorizedException('Hesabınız askıya alınmıştır.');
    }

    const termsConsent = await this.prisma.userConsent.findFirst({ where: { userId: user.id, type: 'TERMS' } });

    // Google girişleri de kaydedilmeliydi: aksi halde bu kullanıcılar denetim
    // kaydında hiç görünmüyor, "son giriş" bilgisi onlar için boş çıkıyordu.
    // ip/userAgent yok — Passport stratejisi request'i bu metoda taşımıyor.
    this.audit.log({
      actorId: user.id, action: 'auth.login_success', entity: 'User', entityId: user.id,
      meta: { method: 'google' },
    });

    // Google girişi parola akışından ayrı ilerliyor; damga burada da yazılmazsa
    // yalnızca Google ile giren kullanıcılar panelde "hiç giriş yok" kalırdı.
    this.prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => null);

    /**
     * SUNUCU OLAYI — yalnizca GERCEKTEN yeni hesap olustuysa.
     *
     * Mevcut hesabin Google ile girmesi ya da e-posta eslesmesiyle
     * baglanmasi yeni uyelik DEGIL ve buraya girmiyor.
     *
     * `dogrulamaGerekli: false` — Google e-postayi kendisi dogrulanmis
     * veriyor, Motorya'nin dogrulama baglantisi gonderilmiyor. Rapor bu
     * hesaplari "dogrulanmamis" diye huni kaybi gibi SAYMIYOR.
     *
     * flowId yok: Google turu siteden ayrilip donuyor, istemcideki kayit
     * girisimi kimligi bu noktada elimizde degil. Iliskilendirilemeyen
     * olarak gorunuyor - uydurulmuyor.
     */
    if (yeniHesap) {
      await this.analytics.sunucuOlayi('uyelik_hesap_olusturuldu', {
        benzersizAnahtar: user.id,
        userId: user.id,
        props: { yontem: 'google', dogrulamaGerekli: false },
      });
      await this.analytics.sunucuOlayi('uyelik_eposta_dogrulandi', {
        benzersizAnahtar: user.id,
        userId: user.id,
        // Google'in dogrulanmis e-postasi — Motorya baglantisina
        // tiklanmasiyla AYNI SEY DEGIL, ayri yontem olarak isaretli.
        props: { yontem: 'google_saglayici' },
      });
    }

    const { deviceId, refreshToken } = await this.issueDeviceSession(user.id, 'WEB');
    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email }, { expiresIn: '2h' });
    return {
      accessToken,
      refreshToken,
      deviceId,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
      needsConsent: !termsConsent,
    } as any;
  }

  // Google ile kayıt sözleşme/KVKK onaylarını atlıyor — ilk girişte ayrı bir ekranla tamamlanır.
  async recordConsents(userId: string, dto: { acceptedTerms: boolean; acceptedKvkk: boolean; acceptedMarketing?: boolean }, ip?: string) {
    if (!dto.acceptedTerms || !dto.acceptedKvkk) {
      throw new BadRequestException("Üyelik Sözleşmesi ve KVKK Aydınlatma Metni'ni kabul etmeniz gerekiyor");
    }
    await this.prisma.userConsent.createMany({
      data: [
        { userId, type: 'TERMS', accepted: true, version: TERMS_VERSION, ip },
        { userId, type: 'KVKK', accepted: true, version: KVKK_VERSION, ip },
        { userId, type: 'MARKETING', accepted: !!dto.acceptedMarketing, version: KVKK_VERSION, ip },
      ],
    });
    return { ok: true };
  }

  async verifyAdminMfa(email: string, otp: string, ip?: string, userAgent?: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.adminMfaOtp) throw new UnauthorizedException('Geçersiz doğrulama isteği');

    if (user.adminMfaOtp !== otp) throw new UnauthorizedException('Doğrulama kodu hatalı');
    if (!user.adminMfaOtpExpiry || user.adminMfaOtpExpiry < new Date()) {
      throw new UnauthorizedException('Doğrulama kodu süresi dolmuş. Tekrar giriş yapın.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { adminMfaOtp: null, adminMfaOtpExpiry: null },
    });

    // Admin paneline giriş buraya kadar hiç kaydedilmiyordu: login() MFA
    // dalında erken dönüyor ve alttaki audit.log'a hiç ulaşmıyor. Admin
    // eylemlerini kaydedip girişlerini kaydetmemek denetimde boşluk bırakıyordu.
    this.audit.log({
      actorId: user.id, action: 'auth.login_success', entity: 'User', entityId: user.id,
      meta: { method: 'admin_mfa' }, ip, userAgent,
    });

    // Panel girisi de damgalanmali. login() MFA dalinda ERKEN DONUYOR ve
    // oradaki damga satirina hic ulasmiyor; burada da yazilmazsa yalnizca
    // panelden giren bir yonetici "hic giris yapmamis" gorunuyordu.
    // Olculdu: canlida dort SUPER_ADMIN'in ikisinde hic damga yoktu.
    this.prisma.user
      .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      .catch(() => null);

    const { deviceId, refreshToken } = await this.issueDeviceSession(user.id, 'WEB');
    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email }, { expiresIn: '2h' });
    return {
      accessToken,
      refreshToken,
      deviceId,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
    } as any;
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi.' };

    const token = generateToken();
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    await this.mail.sendPasswordResetEmail(user.email, user.displayName, token);
    return { message: 'Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { passwordResetToken: token } });
    if (!user) throw new BadRequestException('Geçersiz veya süresi dolmuş link');
    if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
      throw new BadRequestException('Şifre sıfırlama linkinin süresi dolmuş');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Sifre sifirlama hesabi kurtarma yoludur: islemden sonra eski oturumlarin
    // hicbiri gecerli kalmamali. Aksi halde hesabi ele geciren birinin refresh
    // jetonu calismaya devam ediyordu - kurban sifresini degistirse bile
    // saldirgan iceride kaliyordu.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      }),
      this.prisma.device.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { message: 'Şifreniz güncellendi. Güvenlik için tüm cihazlardaki oturumlar kapatıldı.' };
  }
}
