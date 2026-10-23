/**
 * Kapak kadraji: dogrulama ve normallestirme.
 *
 * Kadraj ORANSAL saklaniyor (0..1), piksel degil. Sebebi somut: ayni
 * fotograf kartta 145 px, Story'de 1080 px genisliginde cizilyor ve
 * kullanici her cihazda farkli bir ekranda kadrajliyor. Piksel saklamak,
 * "hangi ekranin pikseli" sorusunu cevapsiz birakirdi.
 *
 * Kirpma TURETILMIS DOSYA URETMIYOR. Orijinal dosya oldugu gibi duruyor;
 * kart bu dikdortgeni CSS ile gosteriyor. Boylece:
 *   - detay galerisi orijinali gosterebiliyor,
 *   - kadraj her zaman geri alinabiliyor (crop = null),
 *   - fotograf temizleme gorevi icin "kullanilan dosya" tanimi
 *     degismiyor; ortada ikinci bir dosya yok.
 */

export type Kadraj = { x: number; y: number; w: number; h: number };

const sayiMi = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** 0..1 araligina sikistirir; kayan nokta artiklarini da temizler. */
const sinirla = (v: number) => Math.min(1, Math.max(0, Math.round(v * 1e6) / 1e6));

/**
 * Istemciden gelen kadraji dogrular.
 *
 * Gecersizse `null` doner - yani "kadraj yok". Hata firlatmiyoruz:
 * bozuk bir kadraj yuzunden ilanin tamaminin reddedilmesi, kadrajsiz
 * kaydedilmesinden daha kotu. Kadrajin kendisi guvenlik siniri degil,
 * yalnizca sunum bilgisi.
 */
export function kadrajiCoz(ham: unknown): Kadraj | null {
  if (!ham || typeof ham !== 'object') return null;
  const o = ham as Record<string, unknown>;
  if (!sayiMi(o.x) || !sayiMi(o.y) || !sayiMi(o.w) || !sayiMi(o.h)) return null;

  const x = sinirla(o.x), y = sinirla(o.y);
  const w = sinirla(o.w), h = sinirla(o.h);

  // Sifir ya da negatif alan anlamsiz.
  if (w <= 0 || h <= 0) return null;
  // Cerceve fotografin disina tasamaz.
  if (x + w > 1.000001 || y + h > 1.000001) return null;
  // Tam kare kaplayan bir "kadraj" aslinda kadrajsizlik; NULL saklamak
  // hem daha dogru hem de "orijinale don" ile ayni duruma denk geliyor.
  if (x === 0 && y === 0 && w === 1 && h === 1) return null;

  return { x, y, w, h };
}

/**
 * Adres -> kadraj eslemesini dogrular.
 *
 * Eslemeyi DIZIYE degil ADRESE bagliyoruz: fotograf sirasi degisince
 * kadrajlar karismasin. Kapak degistirmek bir fotografin kadrajini
 * baska bir fotografa tasimamali.
 */
export function kadrajHaritasiniCoz(ham: unknown, gecerliAdresler?: string[]): Record<string, Kadraj> {
  if (!ham || typeof ham !== 'object' || Array.isArray(ham)) return {};
  const izinli = gecerliAdresler ? new Set(gecerliAdresler) : null;
  const cikti: Record<string, Kadraj> = {};
  for (const [adres, deger] of Object.entries(ham as Record<string, unknown>)) {
    if (typeof adres !== 'string' || adres.length > 512) continue;
    // Artik listede olmayan bir fotografin kadrajini tasimiyoruz:
    // aksi halde silinen fotograflarin kadrajlari sonsuza kadar
    // birikirdi.
    if (izinli && !izinli.has(adres)) continue;
    const k = kadrajiCoz(deger);
    if (k) cikti[adres] = k;
  }
  return cikti;
}
