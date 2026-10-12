/**
 * Ilan ret nedenleri — tek dogruluk kaynagi.
 *
 * Ret nedeni daha once yalnizca serbest metin olarak tutuluyordu
 * (AuditLog.meta.note). Moderator oraya "Ahmet'in ilani, aciklamaya telefon
 * yazmis" gibi kisisel veri yazabildigi icin o metin analitige alinamiyordu;
 * dolayisiyla "neden reddediyoruz" sorusu olculemiyordu. Kod listesi bu
 * boslugu kapatiyor: raporda kirilim gosterilebiliyor, serbest metin
 * yalnizca saticiya giden aciklamada kaliyor.
 *
 * Kodlar sabit kalmali; etiket degisebilir. Gecmis kayitlar kodla sakli
 * oldugu icin etiketi duzeltmek eski sayilari bozmuyor.
 */
export const RET_NEDENLERI = {
  'yasakli-urun': 'Platformda satilamayan urun',
  'replika-sahte': 'Replika / sahte urun',
  'yetersiz-fotograf': 'Fotograf urunu gostermiyor (stok, ekran goruntusu, bulanik)',
  'yanlis-kategori': 'Yanlis kategori',
  'eksik-aciklama': 'Aciklama yetersiz',
  'iletisim-bilgisi': 'Aciklamada telefon / sosyal medya (platform disina yonlendirme)',
  'fiyat-gercekdisi': 'Gercek disi fiyat',
  'mukerrer': 'Ayni ilan tekrar verilmis',
  'diger': 'Diger',
} as const;

export type RetNedeniKodu = keyof typeof RET_NEDENLERI;

export const RET_NEDENI_KODLARI = Object.keys(RET_NEDENLERI) as RetNedeniKodu[];

export function retNedeniEtiketi(kod?: string | null): string | null {
  if (!kod) return null;
  return (RET_NEDENLERI as Record<string, string>)[kod] ?? null;
}
