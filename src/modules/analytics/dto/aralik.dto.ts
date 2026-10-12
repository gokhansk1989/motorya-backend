import { IsIn, IsISO8601, IsOptional } from 'class-validator';

/** Olcum raporunun saat dilimi. Tum tarihler bu dilimde yorumlanir. */
const SAAT_DILIMI = 'Europe/Istanbul';

/**
 * Istanbul'daki yerel gun basinin UTC karsiligini verir.
 *
 * Yaz saati uygulamasi 2016'da kaldirildigi icin Turkiye sabit UTC+3; yine de
 * ofseti Intl'den okuyoruz ki kural degisirse rapor kaymasin.
 */
function istanbulGunBasi(tarih: Date): Date {
  const bicim = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAAT_DILIMI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const { type, value } of bicim.formatToParts(tarih)) p[type] = value;
  // Yerel duvar saati ile UTC arasindaki fark = ofset.
  const yerelMs = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const ofsetMs = yerelMs - tarih.getTime();
  // Yerel gunun 00:00'i, ofset geri alinarak UTC'ye cevriliyor.
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day) - ofsetMs);
}

export class AralikDto {
  /** Hazir pencereler. Ozel aralik icin baslangic/bitis verilir. */
  @IsOptional()
  @IsIn(['7g', '30g', 'ozel'])
  pencere?: '7g' | '30g' | 'ozel';

  @IsOptional()
  @IsISO8601()
  baslangic?: string;

  @IsOptional()
  @IsISO8601()
  bitis?: string;

  /**
   * Aralik cozumlemesi. Bitis haric (half-open): bugunun tamami dahil olsun
   * diye yarinin gun basi kullaniliyor, boylece gun icindeki saatler eksik
   * kalmiyor.
   */
  coz(): { baslangic: Date; bitis: Date } {
    const simdi = new Date();
    const bugunBasi = istanbulGunBasi(simdi);
    const yarinBasi = new Date(bugunBasi.getTime() + 86_400_000);

    if (this.pencere === 'ozel' || (this.baslangic && this.bitis)) {
      const b = this.baslangic ? istanbulGunBasi(new Date(this.baslangic)) : bugunBasi;
      const s = this.bitis
        ? new Date(istanbulGunBasi(new Date(this.bitis)).getTime() + 86_400_000)
        : yarinBasi;
      // Ters verilmis aralik bos sonuc yerine sessizce duzeltiliyor.
      return b <= s ? { baslangic: b, bitis: s } : { baslangic: s, bitis: b };
    }

    const gun = this.pencere === '30g' ? 30 : 7;
    return {
      baslangic: new Date(yarinBasi.getTime() - gun * 86_400_000),
      bitis: yarinBasi,
    };
  }
}
