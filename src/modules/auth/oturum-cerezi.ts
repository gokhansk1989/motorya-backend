import type { Request, Response } from 'express';

/**
 * Yenileme tokenının çerezi.
 *
 * ── NEDEN ÇEREZ ───────────────────────────────────────────────────
 *
 * Yenileme tokenı `localStorage`'da duruyordu. Aynı origin'de çalışan
 * bir XSS ya da ele geçirilmiş üçüncü taraf betiği onu okuyup
 * kullanıcının oturumunu süresiz devralabilirdi: erişim tokenı iki
 * saatlik ama yenileme tokenıyla sonsuza kadar yenisi alınır.
 *
 * `HttpOnly` çerez XSS'i ÇÖZMEZ — saldırgan hâlâ kullanıcının
 * tarayıcısında istek atabilir. Ama tokenı dışarı sızdırıp başka bir
 * makineden, aylarca kullanmasını engeller. Aradaki fark, "oturum
 * çalındı" ile "sayfa açıkken kötü şeyler yapıldı" arasındaki farktır.
 *
 * ── NEDEN HOST-ONLY ───────────────────────────────────────────────
 *
 * `Domain=.motorya.com.tr` yazmak çerezi TÜM alt alan adlarına
 * gönderir: admin, api, ileride açılacak her şey. Alt alan adlarından
 * biri ele geçerse çerez de gider. Site API'ye kendi origin'i üzerinden
 * (`motorya.com.tr/api-backend`) konuştuğu için geniş domain'e hiç
 * ihtiyaç yok; çerez host-only kalıyor.
 *
 * ── NEDEN DAR PATH ────────────────────────────────────────────────
 *
 * Çerez yalnızca yenileme ve çıkış uçlarına gidiyor. Her ilan
 * isteğinde de gönderilseydi, tokenın geçtiği yüzey gereksizce
 * genişlerdi: ara vekiller, erişim kayıtları, hata izleme.
 *
 * ── MOBİL ─────────────────────────────────────────────────────────
 *
 * Native uygulamanın çerez kavgası yok ve `localStorage` riski de
 * taşımıyor; orada token gövdede dönmeye devam ediyor. Ayrımı
 * `Origin` başlığına bakarak yapıyoruz: tarayıcı her zaman gönderir,
 * native istemci göndermez.
 */

export const OTURUM_CEREZI = 'motorya_rt';

/**
 * Çerezin path'i ortama göre değişiyor.
 *
 * Tarayıcı çerezi İSTEĞİN YOLUNA göre gönderir. Canlıda site API'ye
 * `/api-backend/auth/...` üzerinden gidiyor; geliştirmede doğrudan
 * `/auth/...`. Sabit yazmak, geliştirmede çerezin hiç gönderilmemesine
 * yol açardı.
 */
export function cerezYolu(): string {
  return process.env.COOKIE_PATH ?? '/api-backend/auth';
}

/**
 * `Secure` bayrağı.
 *
 * Üretimde her zaman açık. `COOKIE_SECURE` ile ayrıca zorlanabiliyor:
 * TLS'i önünde bir vekil sonlandırdığında uygulama kendini "production"
 * sanmayabilir ve çerez `Secure` olmadan yazılırsa HTTPS'in getirdiği
 * koruma boşa gider. Test ortamında da bu bayrakla gerçek davranış
 * ölçülebiliyor.
 */
function guvenliMi(): boolean {
  if (process.env.COOKIE_SECURE === '1') return true;
  if (process.env.COOKIE_SECURE === '0') return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * İstemci türü kararı.
 *
 * ── NEDEN "ORIGIN YOKSA NATIVE" YETMİYOR ──────────────────────────
 *
 * İlk sürüm `Origin` başlığının VARLIĞINA bakıyordu: varsa tarayıcı,
 * yoksa native. Yanlış yönü şu: başlığın YOKLUĞU bir kanıt değil.
 * `Origin` göndermeyen bir tarayıcı isteği (ya da başlığı düşüren bir
 * ara vekil) "native" sayılır ve yanıt gövdesinde yenileme tokenı
 * alırdı — tam da gövdeden kaldırmaya çalıştığımız şey.
 *
 * ── YENİ KURAL: GÜVENLİ TARAF VARSAYILAN ──────────────────────────
 *
 *   1. İstekte BİZİM oturum çerezimiz varsa  → tarayıcı. Kesin:
 *      çerezi yalnızca tarayıcı taşır ve onu biz yazdık.
 *   2. `Origin` başlığı varsa                → tarayıcı.
 *   3. `x-client: mobile` VE yukarıdakilerin hiçbiri yoksa → native.
 *   4. Hiçbiri                               → tarayıcı (güvenli taraf).
 *
 * Üçüncü kural bir GÜVENLİK İDDİASI DEĞİL, uyumluluk anahtarı:
 * başlık taklit edilebilir. Ama taklit etmenin kazancı yok. Tarayıcıda
 * çalışan kötü niyetli bir sayfa bu başlığı çapraz origin ekleyemez
 * (özel başlık ön kontrol gerektirir ve CORS izin listemiz dar); kendi
 * arayüzümüz ise hiç göndermiyor. Başlığı gönderebilen biri zaten
 * kendi isteğinin yanıtını okuyabiliyor demektir — yani kendi
 * tokenını gövdede almasının kimseye zararı yok.
 *
 * Belirsiz durum — çerez VE gövde tokenı birlikte: ÇEREZ kazanıyor,
 * gövdedeki yok sayılıyor. Aksi halde saldırgan, kurbanın çerezini
 * taşıyan bir isteğe kendi gövde tokenını iliştirip hangi oturumun
 * yenileneceğini seçebilirdi.
 */
export type IstemciTuru = 'tarayici' | 'native';

export function istemciTuru(req: Request): IstemciTuru {
  if (oturumCereziVarMi(req)) return 'tarayici';
  if (typeof req.headers.origin === 'string' && req.headers.origin.length > 0) return 'tarayici';
  if (req.headers['x-client'] === 'mobile') return 'native';
  return 'tarayici';
}

/** Çerez var mı — içeriği çözmeden. */
export function oturumCereziVarMi(req: Request): boolean {
  return typeof (req as any).cookies?.[OTURUM_CEREZI] === 'string';
}

/**
 * CSRF savunması: isteğin bizim sayfamızdan geldiğini doğrular.
 *
 * `SameSite=Lax` çerezi üçüncü taraf bir sitenin POST'unda zaten
 * göndermez, yani ilk savunma orada. Bu kontrol ikinci katman:
 * `SameSite` davranışında bir tarayıcı farkı ya da ileride
 * `SameSite=None` gerektiren bir değişiklik olursa sunucu yine de
 * yabancı origin'i reddeder.
 *
 * İzin listesi CORS ile AYNI kaynaktan geliyor; iki yerde ayrı liste
 * tutmak, birinin güncellenip diğerinin unutulmasıyla sonuçlanır.
 */
export function originGecerliMi(req: Request, izinliler: (string | RegExp)[]): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) return false;
  // `Origin: null` sandbox'lı iframe'den, `data:` belgeden ve bazı
  // yönlendirme zincirlerinden gelir. Listede olmadığı için zaten
  // reddedilir; açıkça yazmak niyeti belli ediyor.
  if (origin === 'null') return false;
  return izinliler.some((i) => (typeof i === 'string' ? i === origin : i.test(origin)));
}

/**
 * Çerezle kimlik doğrulayan uçlar için ORIGIN KAPISI.
 *
 * Kural: `Origin` varsa izin listesinde OLMAK ZORUNDA. Yoksa istek
 * reddediliyor — "başlık yok, demek ki sorun yok" demiyoruz.
 *
 * Native istemcide `Origin` hiç gelmez ve orada çerez de yoktur;
 * bu kapı yalnızca çerez modundaki isteklere uygulanıyor.
 */
export function originKapisi(req: Request, izinliler: (string | RegExp)[]): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) {
    // Origin yok: yalnızca çerez de yoksa kabul (native akış).
    return !oturumCereziVarMi(req);
  }
  return originGecerliMi(req, izinliler);
}

/**
 * Çerezi yazar.
 *
 * Yenileme tokenı ve cihaz kimliği TEK çerezde: ikisi birlikte
 * anlamlı, ayrı tutmak istemcinin cihaz kimliğini okunabilir bir
 * yerde taşımasını gerektirirdi.
 */
export function oturumCereziniYaz(res: Response, deviceId: string, refreshToken: string) {
  res.cookie(OTURUM_CEREZI, `${deviceId}.${refreshToken}`, {
    httpOnly: true,
    secure: guvenliMi(),
    sameSite: 'lax',
    path: cerezYolu(),
    // Yenileme tokenının sunucudaki ömrüyle uyumlu. Tarayıcı süresi
    // dolunca kendisi siliyor; sunucu tarafı iptal buna bağlı değil.
    maxAge: 60 * 60 * 24 * 60 * 1000, // 60 gün
  });
}

/** Çerezi okur. Bozuksa null döner — hata fırlatmıyoruz, 401 yeterli. */
export function oturumCereziniOku(req: Request): { deviceId: string; refreshToken: string } | null {
  const ham = (req as any).cookies?.[OTURUM_CEREZI];
  if (typeof ham !== 'string' || !ham.includes('.')) return null;
  const ayirac = ham.indexOf('.');
  const deviceId = ham.slice(0, ayirac);
  const refreshToken = ham.slice(ayirac + 1);
  if (!deviceId || !refreshToken) return null;
  return { deviceId, refreshToken };
}

/**
 * Çerezi siler.
 *
 * `path` yazarkenkiyle AYNI olmak zorunda: farklı path ile silme
 * denemesi tarayıcıda hiçbir şey yapmaz ve çerez sessizce yaşamaya
 * devam ederdi.
 */
export function oturumCereziniSil(res: Response) {
  res.clearCookie(OTURUM_CEREZI, {
    httpOnly: true,
    secure: guvenliMi(),
    sameSite: 'lax',
    path: cerezYolu(),
  });
}

/**
 * Oturum yanıtları önbelleğe girmemeli.
 *
 * Araya giren bir vekil ya da tarayıcı geri tuşu, bir kullanıcının
 * oturum yanıtını başkasına gösterebilir.
 */
export function onbellegeAlma(res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}
