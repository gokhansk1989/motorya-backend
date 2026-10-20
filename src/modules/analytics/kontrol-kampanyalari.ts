/**
 * Kontrollu test kampanyalari — is raporlarindan VARSAYILAN olarak cikarilir.
 *
 * ── NEDEN GEREKLI ───────────────────────────────────────────────────
 *
 * Mevcut dislama (`isStaff`) olay ANINDA vuruluyor ve uc kaynaga bakiyor:
 * personel rolu, test hesabi isareti, ortamdaki haric kullanici listesi.
 * Ucu de KULLANICIYA bagli.
 *
 * Kendi reklam baglantilarimizi misafir olarak test ettigimizde ise
 * kullanici yok: olay `isStaff = false` olarak kaydediliyor ve gercek
 * reklam performansinin icine karisiyor. Canlida olculdu: Instagram
 * ucretli satirindaki 3 acilisin 1'i `utm_content=misafir_test`
 * kontrolumuzden geliyordu - yani o satirdaki orani ucte bir oraninda
 * biz bozuyorduk.
 *
 * ── KURALLAR ────────────────────────────────────────────────────────
 *
 * 1. TAM ESLESME. "icinde test geciyorsa cikar" YAPILMIYOR: gercek bir
 *    kullanici "test surusu montu" diye bir kampanyaya tiklayabilir ya
 *    da biz "test-ride-2026" adinda gercek bir kampanya acabiliriz.
 *    Yalnizca listede birebir yazan deger cikariliyor.
 *
 * 2. RAPOR ANINDA cikariliyor, kayit aninda degil. Ham veri oldugu gibi
 *    duruyor; liste degisirse gecmis rapor da buna gore yeniden
 *    hesaplaniyor ve hicbir satir silinmiyor ya da yeniden yazilmiyor.
 *
 * 3. SIRADAN KULLANICI DEGISTIREMEZ. Liste ortam degiskeninden geliyor;
 *    panelden duzenlenebilir bir alan degil. Yoneticinin yapabilecegi
 *    tek sey raporu "kontrol kayitlari DAHIL" gormek.
 *
 * 4. DISLANAN SAYISI GORUNUR. Rapor kac kaydi hangi gerekcelerle
 *    cikardigini soyluyor; sessiz dislama olcumun kendisine guveni
 *    bitirir.
 */

/** Varsayilan: bu oturumdaki misafir incelemesinde kullanilan etiket. */
const VARSAYILAN_ICERIKLER = ['misafir_test'];

function ortamdanListe(anahtar: string, varsayilan: string[]): Set<string> {
  const ham = process.env[anahtar];
  if (ham === undefined) return new Set(varsayilan);
  // Bos string "listeyi tamamen bosalt" demek; varsayilani geri getirmez.
  return new Set(
    ham.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

/** utm_content degerleri (tam eslesme, kucuk harf). */
export const KONTROL_ICERIKLERI = ortamdanListe(
  'ANALITIK_KONTROL_ICERIKLERI',
  VARSAYILAN_ICERIKLER,
);

/** utm_campaign degerleri (tam eslesme, kucuk harf). Varsayilan bos. */
export const KONTROL_KAMPANYALARI = ortamdanListe('ANALITIK_KONTROL_KAMPANYALARI', []);

/** SQL icin: tirnaklanmis liste ya da NULL-benzeri guvenli bos deger. */
export function sqlListesi(kume: Set<string>): string[] {
  return [...kume];
}

/** Insan okunur aciklama - panelde gosteriliyor. */
export function kontrolAciklamasi(): string {
  const i = [...KONTROL_ICERIKLERI];
  const k = [...KONTROL_KAMPANYALARI];
  if (!i.length && !k.length) return 'Tanımlı kontrol kampanyası yok.';
  const parcalar: string[] = [];
  if (i.length) parcalar.push(`içerik etiketi: ${i.join(', ')}`);
  if (k.length) parcalar.push(`kampanya adı: ${k.join(', ')}`);
  return `Kontrollü test olarak işaretli (${parcalar.join(' · ')}). Tam eşleşme ile çıkarılır; adında "test" geçen her kayıt değil.`;
}
