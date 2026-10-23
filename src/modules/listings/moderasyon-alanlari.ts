/**
 * Hangi degisiklik yeniden inceleme gerektirir?
 *
 * Onceden ACTIVE bir ilanda HERHANGI bir degisiklik ilani PENDING_REVIEW'a
 * dusuruyor ve aramadan kaldiriyordu. Incelenmemis icerik yayina
 * sizmiyordu (dogru) ama fiyat indirimi yapan satici da ilanini saatlerce
 * yayindan indirmis oluyordu.
 *
 * Ayrimin olcusu su: alan, ilani GOREN kisiye ne vaat ediyor?
 *
 * - Baslik, aciklama, fotograf, kategori, marka, durum, beden, cinsiyet
 *   urunun NE OLDUGUNU anlatiyor. Bunlar incelenmeden degisirse onaydan
 *   gecmis bir ilan baska bir urune - ya da yasakli bir icerige -
 *   donusebilir. Inceleme gerektirir.
 *
 * - Fiyat, liste fiyati, il ve ilce urunun ne oldugunu degistirmiyor.
 *   Satici fiyatini istedigi zaman degistirebilmeli; yanlis fiyat zaten
 *   moderasyonun degil pazarin duzelttigi bir sey.
 *
 * KADRAJ da incelemelik: kadraj gorunuru degistirir. Satici kadraji
 * oynatarak onaydan gecmis bir fotografta bambaska bir alani one
 * cikarabilir - urunun kusurunu cerceve disinda birakmak gibi. Ustelik
 * kadraj listede YOKKEN yalnizca kadraj degistiren bir istek hicbir
 * degisiklik sayilmiyor ve sessizce dusuyordu.
 */

/** Degistiginde yeniden inceleme gereken alanlar. */
export const INCELEME_GEREKTIREN = [
  'title',
  'description',
  'imageUrls',
  'imageCrops',
  'categoryId',
  'brandId',
  'condition',
  'gender',
  'sizeLabel',
] as const;

/** Yayindaki ilanda dogrudan uygulanan alanlar. */
export const SERBEST_ALANLAR = ['price', 'originalPrice', 'city', 'district'] as const;

export type IncelemeAlani = (typeof INCELEME_GEREKTIREN)[number];

/**
 * Gonderilen degisikliklerden hangileri inceleme gerektiriyor?
 *
 * Yalnizca GERCEKTEN degisen alanlar sayiliyor: istemci formun tamamini
 * gonderdigi icin, dokunulmamis alanlar da istekte yer aliyor. Aradaki
 * farki bakmadan "baslik gonderilmis" demek, fiyatini degistiren
 * saticinin ilanini bosuna incelemeye dusururdu.
 */
export function degisenIncelemeAlanlari(
  dto: Record<string, unknown>,
  mevcut: Record<string, unknown>,
  mevcutGorseller: string[],
  mevcutKadrajlar: Record<string, unknown> = {},
): IncelemeAlani[] {
  const degisen: IncelemeAlani[] = [];

  for (const alan of INCELEME_GEREKTIREN) {
    if (alan === 'imageCrops') {
      const yeni = dto.imageCrops as Record<string, unknown> | undefined;
      if (yeni === undefined) continue;
      // Kadrajlar adrese bagli; karsilastirma sirali bir dizgeye
      // cevrilerek yapiliyor ki anahtar sirasi fark yaratmasin.
      const diz = (o: Record<string, unknown>) =>
        JSON.stringify(
          Object.keys(o).sort().map((k) => {
            const v = o[k] as Record<string, number> | null;
            if (!v) return [k, null];
            // Kucuk kayan nokta farklari degisiklik sayilmasin.
            return [k, ['x', 'y', 'w', 'h'].map((a) => Math.round((v[a] ?? 0) * 1e4))];
          }),
        );
      if (diz(yeni) !== diz(mevcutKadrajlar)) degisen.push('imageCrops');
      continue;
    }
    if (alan === 'imageUrls') {
      const yeni = dto.imageUrls as string[] | undefined;
      if (yeni === undefined) continue;
      const ayni =
        yeni.length === mevcutGorseller.length &&
        yeni.every((u, i) => u === mevcutGorseller[i]);
      if (!ayni) degisen.push('imageUrls');
      continue;
    }
    const yeni = dto[alan];
    if (yeni === undefined) continue;
    // Bos string ile null ayni anlama geliyor (alani temizlemek).
    const norm = (v: unknown) => (v === '' || v === null ? null : v);
    if (norm(yeni) !== norm(mevcut[alan])) degisen.push(alan);
  }
  return degisen;
}
