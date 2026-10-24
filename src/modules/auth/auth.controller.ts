import { Controller, Post, Get, Body, Query, Headers, UseGuards, Request, Res, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { verifyTurnstile } from '../../common/turnstile';
import { requiresCaptcha, recordFailed, resetAttempts } from '../../common/login-attempts';
import { RegisterDto, LoginDto, RefreshTokenDto, LogoutDeviceDto } from './dto/auth.dto';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength, Equals } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { devirKoduUret, devirKodunuTakasEt } from './oauth-devir';
import {
  oturumCereziniYaz, oturumCereziniOku, oturumCereziniSil,
  istemciTuru, originKapisi, onbellegeAlma,
} from './oturum-cerezi';
import { getAllowedOrigins } from '../../common/cors-origins';

class ForgotPasswordDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() turnstileToken?: string;
}
class ResetPasswordDto { @IsString() token: string; @IsString() @MinLength(8) password: string; }
class ResendVerificationDto { @IsEmail() email: string; }
/** Google turunden donen tek kullanimlik devir kodu. */
class GoogleExchangeDto { @IsString() @MinLength(16) code: string; }
class AdminMfaVerifyDto { @IsEmail() email: string; @IsString() otp: string; }
/**
 * Turnstile jetonu tasiyan istek govdeleri.
 *
 * Onceden `@Body() dto: RegisterDto & { turnstileToken?: string }` yaziliyordu.
 * TypeScript kesisim tipi icin `design:paramtypes` olarak `Object` uretir;
 * ValidationPipe metatype'i sinif olarak goremeyince DOGRULAMAYI TUMDEN
 * ATLIYORDU. Yani /auth/register, /auth/login ve /auth/forgot-password
 * uzerinde hicbir kural islemiyordu: e-posta bicimi, sifre uzunlugu,
 * kullanici adi kurallari, hatta sozlesme onayi (@Equals(true)) bile.
 *
 * Olcum: sunucunun icinden /auth/login'e "bu-eposta-degil" gonderince
 * dogrulama hatasi degil "sifre hatali" donuyordu.
 *
 * turnstileToken zaten RegisterDto/LoginDto icinde tanimliymis, yani
 * kesisim tipi hem gereksiz hem zararliydi. Dogrudan DTO sinifi
 * kullanilinca metatype gercek bir sinif oluyor ve tum kurallar yeniden
 * devreye giriyor.
 */
class ConsentsDto {
  @IsBoolean() @Equals(true, { message: "Üyelik Sözleşmesi'ni kabul etmeniz gerekiyor" })
  acceptedTerms: boolean;

  @IsBoolean() @Equals(true, { message: "KVKK Aydınlatma Metni'ni kabul etmeniz gerekiyor" })
  acceptedKvkk: boolean;

  @IsOptional() @IsBoolean() acceptedMarketing?: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  // Mobil uygulamadan gelen kayıt isteklerinde Turnstile aranmaz.
  //
  // Neden: Turnstile bir TARAYICI doğrulaması. Uygulamada bunu sağlamak için
  // widget'ı kendi alan adımızdaki bir sayfada açıp WebView'e gömmüştük.
  // Gerçek cihazda test edildiğinde doğrulama hiç tamamlanmadı: widget
  // "doğrulanıyor" durumunda takılı kaldı, jeton üretilmedi ve kayıt düğmesi
  // hiç açılmadı - yani mobil kayıt tamamen kilitliydi. Cloudflare WebView'i
  // şüpheli sayıp çözülemeyen bir challenge veriyor; bu bizim kodumuzla
  // düzeltilebilecek bir şey değil.
  //
  // Mobil tarafta kalan korumalar: dakikada 5 istek sınırı (aşağıdaki
  // @Throttle), zorunlu e-posta doğrulaması ve uygulamanın imzalı binary
  // olması. Web'de Turnstile aynen duruyor - orada çalışıyor.
  //
  // DİKKAT - bu başlık taklit edilebilir: "x-client: mobile" yazan herkes
  // Turnstile'ı atlar, yani web koruması da fiilen bu başlığın arkasına
  // düşer. Bilinçli bir ödünç: alternatif, mobil kaydın hiç çalışmaması.
  // Kalıcı çözüm Turnstile değil, App Attest / Play Integrity ile
  // uygulamanın gerçekten bizim uygulamamız olduğunu kanıtlamak.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Request() req,
    @Res({ passthrough: true }) res,
    @Headers('x-client') client?: string,
  ) {
    if (client !== 'mobile') {
      const ok = await verifyTurnstile(dto.turnstileToken, req.ip);
      if (!ok) throw new BadRequestException('Bot doğrulaması başarısız');
    }
    // Kayıt da bir OTURUM AÇAR. `login` çerezden geçerken burası
    // geçmiyordu: yeni üyenin yenileme tokenı gövdede dönüyor ve
    // istemci onu `localStorage`'a yazabiliyordu — düzeltmenin tam
    // olarak engellemek istediği şey, yalnızca başka bir kapıdan.
    this.originiDogrula(req);
    const sonuc = await this.authService.register(dto, req.ip);
    onbellegeAlma(res);
    return this.oturumuPaketle(req, res, sonuc);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  /**
   * Giriş.
   *
   * Tarayıcıdan geldiyse yenileme tokenı GÖVDEDE DÖNMÜYOR; HttpOnly
   * çereze yazılıyor ve yanıttan çıkarılıyor. Böylece istemci onu
   * `localStorage`'a yazamaz bile.
   *
   * Native uygulamada `Origin` başlığı yok; orada davranış aynen
   * eskisi gibi, token gövdede dönüyor.
   */
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Request() req,
    @Res({ passthrough: true }) res,
    @Headers('x-client') client?: string,
  ) {
    if (requiresCaptcha(dto.email)) {
      const ok = await verifyTurnstile(dto.turnstileToken, req.ip);
      if (!ok) throw new BadRequestException({ message: 'Bot doğrulaması gerekli', captchaRequired: true });
    }
    this.originiDogrula(req);
    try {
      const result = await this.authService.login(dto, client === 'admin-panel', req.ip, req.headers['user-agent']);
      resetAttempts(dto.email);
      onbellegeAlma(res);
      return this.oturumuPaketle(req, res, result);
    } catch (err: any) {
      recordFailed(dto.email);
      if (requiresCaptcha(dto.email)) {
        const original = err?.response?.message ?? err?.message ?? 'Giriş başarısız';
        throw new BadRequestException({ message: original, captchaRequired: true });
      }
      throw err;
    }
  }

  /**
   * Oturum yanıtını istemci türüne göre paketler.
   *
   * Tarayıcı: yenileme tokenı ve cihaz kimliği çereze gider, yanıttan
   * ÇIKARILIR. Native: eskisi gibi gövdede döner.
   */
  private oturumuPaketle(req: any, res: any, sonuc: any) {
    // Varsayılan GÜVENLİ taraf: yalnızca açıkça native olarak
    // tanımlanmış istemciye gövdede token veriliyor.
    if (istemciTuru(req) === 'native') return sonuc;
    if (!sonuc?.refreshToken || !sonuc?.deviceId) return sonuc;
    oturumCereziniYaz(res, sonuc.deviceId, sonuc.refreshToken);
    const { refreshToken, deviceId, ...kalan } = sonuc;
    return kalan;
  }

  /**
   * Çerez akışındaki uçlar için origin kapısı.
   *
   * `Origin` varsa izin listesinde olmak zorunda; yoksa yalnızca
   * çerezsiz (native) istek kabul ediliyor.
   */
  private originiDogrula(req: any) {
    if (!originKapisi(req, getAllowedOrigins())) {
      throw new BadRequestException('Geçersiz istek kaynağı');
    }
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  // Bu uc tek throttle'siz auth ucuydu: global sinir dakikada 100 istek,
  // yani tek IP'den herhangi bir adrese dakikada 100 dogrulama postasi
  // gonderilebiliyordu. Bu hem o adresi postayla bombalar hem de gonderici
  // itibarini dusurur - ki itibar dusunce postalar zaten gereksiz klasorune
  // duser (bkz. 1. bulgu). IP sinirini servisteki hesap basina bekleme
  // suresi tamamliyor; IP degistirerek ayni adresi bombalamak da kapali.
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  // Şifre sıfırlamada da aynı durum: uygulama jeton üretemiyor.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Request() req, @Headers('x-client') client?: string) {
    if (client !== 'mobile') {
      const ok = await verifyTurnstile(dto.turnstileToken, req.ip);
      if (!ok) throw new BadRequestException('Bot doğrulaması başarısız');
    }
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin-mfa-verify')
  async verifyAdminMfa(
    @Body() dto: AdminMfaVerifyDto,
    @Request() req,
    @Res({ passthrough: true }) res,
  ) {
    // Admin oturumunu GERÇEKTEN açan uç bu: `login` yalnızca kodu
    // gönderiyor, oturum burada doğuyor. Çerez paketlemesinden
    // geçmediği için admin panelinde iki sorun birlikte vardı:
    // yenileme tokenı yanıt gövdesinde JavaScript'e açık dönüyordu ve
    // hiçbir çerez yazılmadığı için oturum sayfa yenilenince ölüyordu.
    this.originiDogrula(req);
    // ip/userAgent denetim kaydı için: admin paneline kimin nereden girdiği
    // güvenlik incelemesinde gereken ilk bilgi.
    const sonuc = await this.authService.verifyAdminMfa(
      dto.email,
      dto.otp,
      req.ip,
      req.headers['user-agent'],
    );
    onbellegeAlma(res);
    return this.oturumuPaketle(req, res, sonuc);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  /**
   * Google turunun donus noktasi.
   *
   * Jetonlar ARTIK ADRESE KONMUYOR. Eskiden boyleydi:
   *
   *   /callback?token=<accessToken>&refreshToken=<...>&user=<...>
   *
   * ve bu, erisim ile yenileme jetonunu tarayici gecmisine, /callback
   * sayfasindan yuklenen her ucuncu taraf kaynagin gorebilecegi Referer
   * basligina ve ara sunucu kayitlarina birakiyordu.
   *
   * Yerine tek kullanimlik, 60 saniyelik bir kod uretiliyor; istemci onu
   * POST /auth/google/exchange ile takas edip jetonlari yanit GOVDESINDE
   * aliyor. Kod adrese dusse bile takas edildikten sonra olu.
   */
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Request() req, @Res() res) {
    const { accessToken, refreshToken, deviceId, user, needsConsent } = req.user as any;
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://motorya.com.tr');
    const kod = devirKoduUret({ accessToken, refreshToken, deviceId, user, needsConsent: !!needsConsent });
    return res.redirect(`${frontendUrl}/callback?code=${encodeURIComponent(kod)}`);
  }

  /**
   * Tek kullanimlik kodu oturumla takas eder.
   *
   * Oturum ACMIYOR, yalnizca Google turunde zaten acilmis oturumu
   * istemciye teslim ediyor. Kod tek kullanimlik ve kisa omurlu;
   * gecersiz kodda ayrintı verilmiyor ("suresi doldu mu yoksa hic var
   * miydi" bilgisi saldirgana yarar).
   *
   * Hiz siniri: kod 256 bit rastgele, kaba kuvvet zaten pratik degil ama
   * bu uc kimlik dogrulamasiz oldugu icin yine de sinirli.
   */
  @Post('google/exchange')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  googleExchange(@Body() dto: GoogleExchangeDto, @Request() req, @Res({ passthrough: true }) res) {
    onbellegeAlma(res);
    this.originiDogrula(req);
    const yuk = devirKodunuTakasEt(dto.code);
    if (!yuk) throw new BadRequestException('Giriş tamamlanamadı, lütfen tekrar deneyin');
    // Google turu de aynı kurala tabi: tarayıcıda yenileme tokenı
    // çereze yazılıyor, gövdeye konmuyor.
    return this.oturumuPaketle(req, res, yuk);
  }

  @Post('consents')
  @UseGuards(AuthGuard('jwt'))
  recordConsents(@Request() req, @Body() dto: ConsentsDto) {
    return this.authService.recordConsents(req.user.id, dto, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  /**
   * Erişim tokenını yeniler.
   *
   * Kaynak önce ÇEREZ: tarayıcıdan gelen istekte gövdede token
   * beklemiyoruz, çünkü istemcinin onu okuyabilmesi gerekmiyor.
   * Çerez yoksa gövdeye düşüyoruz — native uygulama böyle çalışıyor
   * ve bu akışı bozmamak gerekiyor.
   *
   * Tarayıcıdan gelen isteklerde ORIGIN doğrulanıyor: `SameSite=Lax`
   * ilk savunma, bu ikincisi.
   */
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto, @Request() req, @Res({ passthrough: true }) res) {
    onbellegeAlma(res);
    this.originiDogrula(req);
    const cerez = oturumCereziniOku(req);

    // ÇEREZ ÖNCELİKLİ: gövdede de token gelmişse yok sayılıyor.
    // Aksi halde saldırgan, kurbanın çerezini taşıyan bir isteğe kendi
    // gövde tokenını iliştirip hangi oturumun yenileneceğini seçebilirdi.
    const deviceId = cerez?.deviceId ?? dto?.deviceId;
    const refreshToken = cerez?.refreshToken ?? dto?.refreshToken;
    if (!deviceId || !refreshToken) {
      // Çerez yoksa oturum da yok: tarayıcıya temiz bir 401 dönüyoruz.
      oturumCereziniSil(res);
      throw new UnauthorizedException('Oturum bulunamadı');
    }

    try {
      const sonuc = await this.authService.refreshAccessToken(deviceId, refreshToken);
      if (cerez) {
        // Rotasyon: yeni token çereze yazılıyor, istemciye verilmiyor.
        oturumCereziniYaz(res, deviceId, sonuc.refreshToken);
        return { accessToken: sonuc.accessToken };
      }
      return sonuc;
    } catch (e) {
      // Yenileme başarısızsa çerez de temizleniyor; aksi halde tarayıcı
      // her istekte geçersiz bir token göndermeye devam ederdi.
      if (cerez) oturumCereziniSil(res);
      throw e;
    }
  }

  /**
   * Çıkış.
   *
   * Hem sunucudaki cihaz kaydını iptal ediyor hem çerezi siliyor.
   * Yalnızca çerezi silmek, tokenın hâlâ geçerli olduğu anlamına
   * gelirdi: bir kopyası sızmışsa çıkış yapmak onu durdurmazdı.
   *
   * Kimlik doğrulaması ARANMIYOR: erişim tokenı süresi dolmuş bir
   * kullanıcı da çıkış yapabilmeli. Yetki, çerezdeki yenileme
   * tokenının kendisinden geliyor.
   */
  @Post('logout')
  async logout(@Request() req, @Res({ passthrough: true }) res) {
    onbellegeAlma(res);
    this.originiDogrula(req);
    const cerez = oturumCereziniOku(req);
    oturumCereziniSil(res);
    if (!cerez) return { ok: true };
    await this.authService.cihaziIptalEt(cerez.deviceId, cerez.refreshToken);
    return { ok: true };
  }

  @Post('logout-device')
  @UseGuards(AuthGuard('jwt'))
  logoutDevice(@Request() req, @Body() dto: LogoutDeviceDto) {
    return this.authService.revokeDevice(req.user.id, dto.deviceId);
  }
}
