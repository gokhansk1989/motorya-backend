import { randomBytes, timingSafeEqual } from 'crypto';

/**
 * Google turunden donen oturumun istemciye TEK KULLANIMLIK KODLA devri.
 *
 * ── DUZELTILEN SORUN ────────────────────────────────────────────────
 *
 * Callback soyle yonlendiriyordu:
 *
 *   /callback?token=<accessToken>&refreshToken=<...>&user=<...>
 *
 * Yani erisim ve yenileme jetonlari ADRES CUBUGUNA yaziliyordu.
 * Jetonun URL'de olmasi uc ayri yerden sizdiriyor:
 *
 *   - tarayici gecmisi (paylasilan bilgisayarda kalici)
 *   - Referer basligi: /callback sayfasindan yuklenen her ucuncu taraf
 *     kaynak (analitik, yazi tipi, reklam betigi) adresi gorebiliyor
 *   - ara sunucu ve erisim kayitlari
 *
 * Yenileme jetonunun omru uzun; sizdiginda oturum devralinabilir.
 *
 * ── YENI AKIS ───────────────────────────────────────────────────────
 *
 * Callback jetonlari dondurmek yerine kisa omurlu, tek kullanimlik bir
 * KOD uretiyor ve yalnizca onu adrese koyuyor. Istemci bu kodu POST ile
 * takas ediyor; jetonlar yanit GOVDESINDE geliyor. Bu, OAuth yetki kodu
 * akisinin ta kendisi: kod adrese dusse bile tek kullanimlik ve 60
 * saniyede oluyor, takas edildikten sonra hicbir ise yaramiyor.
 *
 * ── SINIRLAR ────────────────────────────────────────────────────────
 *
 * Kodlar SUREC BELLEGINDE tutuluyor. Tek Docker ornegi calistigi icin
 * (vites_api, replika yok) bu yeterli. Surec yeniden baslarsa bekleyen
 * kodlar kaybolur; kullanici "giris tamamlanamadi" gorup tekrar dener -
 * veri kaybi yok. Birden fazla ornege gecilirse buranin paylasimli bir
 * depoya (Redis) tasinmasi gerekir; projede su an Redis yok.
 */

export interface DevirYuku {
  accessToken: string;
  refreshToken?: string;
  deviceId?: string;
  user: unknown;
  needsConsent?: boolean;
}

/** 60 sn: yonlendirme icin fazlasiyla yeterli, calinan kod icin cok kisa. */
const OMUR_MS = 60_000;
/** 256 bit entropi. */
const KOD_BAYT = 32;
/** Bellek siniri: kotu niyetli bir istek seli belleği sisirmesin. */
const AZAMI_KAYIT = 500;

interface Kayit {
  yuk: DevirYuku;
  sonGecerlilik: number;
}

const kayitlar = new Map<string, Kayit>();

function temizle(simdi: number) {
  for (const [k, v] of kayitlar) {
    if (v.sonGecerlilik <= simdi) kayitlar.delete(k);
  }
}

/** Oturumu sakla, karsiliginda tek kullanimlik kodu don. */
export function devirKoduUret(yuk: DevirYuku): string {
  const simdi = Date.now();
  temizle(simdi);
  // Sinir asilirsa en eskiyi dusur: yeni ve gercek bir giris, eski ve
  // muhtemelen terk edilmis bir koda feda edilmemeli.
  if (kayitlar.size >= AZAMI_KAYIT) {
    const enEski = kayitlar.keys().next().value;
    if (enEski) kayitlar.delete(enEski);
  }
  const kod = randomBytes(KOD_BAYT).toString('base64url');
  kayitlar.set(kod, { yuk, sonGecerlilik: simdi + OMUR_MS });
  return kod;
}

/**
 * Kodu oturumla takas et. Basarili olsun olmasin kod TUKETILIR:
 * yeniden deneme ile kod tahmin etmeyi anlamsiz kilar.
 *
 * Karsilastirma sabit zamanli: Map aramasi anahtar uzunluguna gore
 * zamanlama sizdirabilir, bu yuzden once adayi buluyor sonra sabit
 * zamanli dogruluyoruz.
 */
export function devirKodunuTakasEt(kod: unknown): DevirYuku | null {
  if (typeof kod !== 'string' || kod.length === 0 || kod.length > 128) return null;
  const simdi = Date.now();
  temizle(simdi);

  const kayit = kayitlar.get(kod);
  if (!kayit) return null;
  kayitlar.delete(kod); // tek kullanimlik

  // Buraya gelindiyse anahtar zaten esit; yine de sabit zamanli bir
  // dogrulama birakiyoruz ki ileride arama bicimi degisirse davranis
  // bozulmasin.
  const a = Buffer.from(kod);
  const b = Buffer.from(kod);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (kayit.sonGecerlilik <= simdi) return null; // suresi dolmus
  return kayit.yuk;
}

/** Testler ve olcum icin. */
export function bekleyenDevirSayisi(): number {
  temizle(Date.now());
  return kayitlar.size;
}
