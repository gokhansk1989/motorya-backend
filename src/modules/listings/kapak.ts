/**
 * Kapak sirasi.
 *
 * ── NEDEN AYRI BIR KAVRAM ─────────────────────────────────────────
 *
 * Kapak eskiden "dizinin ilk ogesi" demekti. Ikinci fotografi kapak
 * yapmak onu basa tasiyordu, yani saticinin kurdugu SIRAYI bozuyordu.
 * Ayni sekilde siralamayi degistirmek kapagi degistiriyordu. Ikisi
 * birbirinden bagimsiz iki karar olmali.
 *
 * Artik `sortOrder` saticinin sirasini, `isCover` ise hangi fotografin
 * kart ve Story'de gorunecegini tutuyor.
 *
 * ── NEDEN YINE DE KAPAK ONDE DONUYOR ──────────────────────────────
 *
 * Gorseller (isCover DESC, sortOrder ASC) ile donuyor. Boylece
 * `images[0]` her yerde kapak olmaya devam ediyor: kart, mesaj listesi,
 * profil, paylasim karti ve og:image gibi onlarca cagri yeri kapak
 * kavramini hic bilmeden dogru calisiyor.
 *
 * Eski ilanlarda hicbir satir isaretli degil; `false` tum satirlarda
 * esit oldugu icin siralama sortOrder'a dusuyor ve kapak yine ilk
 * fotograf oluyor - yani mevcut kapaklar aynen korunuyor.
 */
export const KAPAK_SIRASI = [
  { isCover: 'desc' as const },
  { sortOrder: 'asc' as const },
];

/**
 * Adres listesi ve secilen kapaktan ListingImage satirlari uretir.
 *
 * `sortOrder` GELEN SIRAYI koruyor; kapak yalnizca bayrakla
 * isaretleniyor. Secilen kapak listede yoksa (ornegin o fotograf
 * silinmisse) ilk fotograf kapak oluyor.
 */
export function gorselSatirlari<T extends Record<string, unknown>>(
  urller: string[],
  kapakUrl: string | null | undefined,
  kadrajlar: Record<string, unknown>,
  ek: T,
) {
  const kapak = kapakUrl && urller.includes(kapakUrl) ? kapakUrl : urller[0];
  return urller.map((url, i) => ({
    ...ek,
    url,
    sortOrder: i,
    isCover: url === kapak,
    crop: (kadrajlar[url] as any) ?? undefined,
  }));
}
