import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorLogsService } from './error-logs.service';

// Backend'de oluşan hataları (login, ilan verme, vb. herhangi bir endpoint) otomatik
// olarak ErrorLog tablosuna kaydeder, ardından normal NestJS HTTP yanıtını bozmadan döner.
// - 5xx / yakalanmamış exception -> source 'api' (gerçek sunucu hatası)
// - 429 (ThrottlerGuard limit aşımı) -> source 'rate-limit' (kötüye kullanım/bot tespiti)
// - 404 -> source '404' (kırık link / silinmiş kaynak raporu)
// Diğer 4xx (validasyon, yetkisiz erişim vb. beklenen istemci hataları) loglanmaz.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private errorLogs: ErrorLogsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException ? exception.getResponse() : { message: 'Internal server error' };

    // Mesaji once cozuyoruz: islem-hatasi siniflandirmasi (giris gurultusunu
    // elemek icin) mesaja bakiyor.
    const err0 = exception as Error;
    const ham0 = typeof body === 'string' ? body : (body as any)?.message;
    const mesaj0 = status >= 500
      ? (err0?.message ?? 'Internal server error')
      : (Array.isArray(ham0) ? ham0.join('; ') : (ham0 ?? err0?.message ?? 'Unknown error'));

    const source =
      status >= 500 ? 'api'
      : status === 429 ? 'rate-limit'
      : status === 404 ? '404'
      // Kullaniciyi ENGELLEYEN akislarin beklenen hatalari bilerek loglaniyor:
      // "uye/giris/ilan yapamiyorum" sikayetlerini panelden gormenin tek yolu.
      // Diger 4xx'ler ve giris "sifre hatali" gurultusu haric.
      : this.islemHatasi(request?.originalUrl ?? '', request?.method ?? '', status, mesaj0);

    // 404 gurultusunu filtrele: bot/tarayıcı istekleri (favicon, .git,
    // meta tag'lerden URL uretimi, root path) log'a yazilmaz.
    if (source === '404' && !this.shouldLog404(request?.originalUrl ?? '', request?.headers?.referer as string | undefined)) {
      response.status(status).json(typeof body === 'string' ? { message: body } : body);
      return;
    }

    if (source) {
      const err = exception as Error;
      this.errorLogs.log({
        source,
        message: mesaj0,
        stack: source === 'api' ? err?.stack ?? null : null,
        path: request?.originalUrl,
        method: request?.method,
        statusCode: status,
        userId: (request as any)?.user?.id ?? null,
        context:
          source === 'rate-limit' ? { ip: request?.ip }
          // Parola ve diger govde alanlari ASLA loglanmiyor; yalnizca hangi
          // adresin takildigini gormek icin MASKELI e-posta.
          : (source === 'kayit' || source === 'giris') ? { email: this.maskeEposta((request?.body as any)?.email) }
          : undefined,
      });
    }

    response.status(status).json(typeof body === 'string' ? { message: body } : body);
  }

  /**
   * Kayit / Google giris akisinin loglanacak istemci hatasi mi?
   *
   * Yalnizca bu akislarin anlamli basarisizliklari: 400 (bot dogrulamasi,
   * gecersiz TC, kullanici adi), 409 (e-posta/TC/telefon zaten kayitli),
   * 503 (yeni kayitlar kapali). Diger 4xx'ler disarida.
   */
  private islemHatasi(url: string, method: string, status: number, mesaj: string): string | null {
    const yol = (url || '').split('?')[0];

    // Kayit / Google giris: zaten kayitli, bot dogrulamasi, gecersiz TC,
    // kullanici adi, giris tamamlanamadi, yeni kayitlar kapali.
    if ([400, 409, 503].includes(status) && /^\/auth\/(register|google)/.test(yol)) return 'kayit';

    // Giris ENGELLERI: Google hesabini parolayla acma, dogrulanmamis e-posta,
    // askiya alinmis hesap, gecersiz/suresi dolmus sifirlama linki, admin MFA.
    // "E-posta veya sifre hatali" HARIC: o gurultu ve brute-force korumasi
    // (rate-limit) zaten yakaliyor.
    if ([400, 401, 403].includes(status)
        && /^\/auth\/(login|admin-mfa-verify|reset-password)/.test(yol)
        && !/şifre|parola|e-posta veya/i.test(mesaj)) return 'giris';

    // ILAN VERME engelleri: TC eksik, kullanici adi eksik, kategori hatasi.
    // Yalnizca create (POST /listings); admin alt yollari ve duzenleme haric.
    if ([400, 403].includes(status) && method === 'POST' && /^\/listings\/?$/.test(yol)) return 'ilan';

    return null;
  }

  /** E-postayi maskeler (a***@site.com); parola gibi diger alanlar hic alinmiyor. */
  private maskeEposta(eposta?: unknown): string | undefined {
    if (typeof eposta !== 'string' || !eposta.includes('@')) return undefined;
    const [yerel, alan] = eposta.split('@');
    return `${yerel[0] ?? ''}***@${alan}`;
  }

  // 404'lerde mantik TERSINE cevrildi.
  //
  // Onceden "gurultulu desenleri" sayan bir liste vardi; tarayicilar surekli
  // yeni yol deniyor ve liste hep geriden geliyordu. Uretimde 11.047 hata
  // kaydinin 10.349'u (%94) bu sekilde birikmis bot 404'uydu - gercek hatalar
  // aralarinda kayboluyordu.
  //
  // Artik yalnizca BIZIM olabilecek 404'ler kaydediliyor:
  //   - sitemizden gelen bir baglanti kirildiysa (referer kendi alan adimiz)
  //   - ya da yol, uygulamanin gercek rota desenlerinden birine benziyorsa
  // Geri kalan her sey (wp-admin, .env, /metrics, rastgele tarama) yazilmaz.
  private shouldLog404(url: string, referer?: string): boolean {
    const yol = (url || '').split('?')[0];

    // Onay bekleyen ilanin sayfasi acildiginda by-slug 404 doner: sunucu
    // onaylanmamis ilani vermiyor, sayfa istemci tarafinda sahibine
    // gosteriliyor. Yani bu bir hata degil, tasarimin kendisi.
    //
    // Bu kontrol referer kontrolunden ONCE olmali: istek zaten bizim
    // sayfamizdan geliyor, dolayisiyla referer kosulu once calisinca
    // istisna hic devreye girmiyordu ve 404'ler kaydedilmeye devam
    // ediyordu (son 24 saatteki 6 kaydin 4'u buydu).
    if (yol.startsWith('/listings/by-slug')) return false;

    // Kendi sayfamizdan gelen tiklama: gercek kirik baglanti, mutlaka gorelim
    if (referer && /^https?:\/\/(www\.)?motorya\.com\.tr/.test(referer)) return true;

    // Uygulamanin gercek rota desenleri
    const bizimRotalar = /^\/(ilan|kategori|kullanici|blog|sayfa|ara|ilan-ver|ilanlarim|favoriler|mesajlarim|tekliflerim|bildirimler|profilim|alarmlarim|kategoriler|sss)(\/|$)/;
    if (bizimRotalar.test(yol)) return true;


    // API tarafinda gercekten var olabilecek kaynaklar
    if (/^\/(listings|users|offers|messages|blog|categories|brands)(\/|$)/.test(yol)) return true;

    return false;
  }
}
