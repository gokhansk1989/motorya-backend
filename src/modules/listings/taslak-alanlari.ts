/**
 * Taslakta saklanabilecek alanlar — beyaz liste.
 *
 * Taslak istemciden gelen serbest bir nesne. Olduğu gibi saklamak, bir
 * gun istemciye eklenen herhangi bir alanin (ornegin T.C. kimlik
 * numarasinin) sessizce veritabanina yazilmasi demek olurdu. Bu yuzden
 * yalnizca burada sayilan alanlar yaziliyor; gerisi dusuruluyor.
 *
 * Listede BILEREK olmayanlar: tcKimlik, parola, oturum jetonu, kullanici
 * kimligi. Taslagin sahibi zaten satirin userId'sinden biliniyor.
 */

/** alan adi -> kabul edilen tip */
const ALANLAR = {
  categoryId: 'metin',
  altKategoriId: 'metin',
  brandId: 'metin',
  title: 'metin',
  description: 'uzunMetin',
  condition: 'metin',
  gender: 'metin',
  sizeLabel: 'metin',
  city: 'metin',
  district: 'metin',
  price: 'metin',
  originalPrice: 'metin',
} as const;

const EN_UZUN = { metin: 120, uzunMetin: 2000 } as const;

export type TaslakIcerigi = Partial<Record<keyof typeof ALANLAR, string>>;

/**
 * Gelen nesneyi beyaz listeye gore temizler.
 *
 * Hata firlatmiyor: taslak kaydetmek kullanicinin istedigi bir islem
 * degil, arka planda oluyor. Bozuk bir alan yuzunden tum taslagi
 * kaybettirmektense o alani atmak daha dogru.
 */
export function taslagiTemizle(gelen: unknown): TaslakIcerigi {
  const cikti: TaslakIcerigi = {};
  if (!gelen || typeof gelen !== 'object' || Array.isArray(gelen)) return cikti;
  const kaynak = gelen as Record<string, unknown>;

  for (const [alan, tip] of Object.entries(ALANLAR)) {
    const deger = kaynak[alan];
    if (typeof deger !== 'string') continue;
    const kirpik = deger.slice(0, EN_UZUN[tip as keyof typeof EN_UZUN]);
    if (kirpik.length) cikti[alan as keyof typeof ALANLAR] = kirpik;
  }
  return cikti;
}

/** Taslakta tutulabilecek en fazla fotograf. Formdaki sinirla ayni. */
export const TASLAK_EN_FAZLA_FOTO = 8;
