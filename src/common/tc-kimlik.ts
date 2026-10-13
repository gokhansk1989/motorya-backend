// T.C. kimlik numarasinin bicim ve saglama dogrulamasi.
//
// Kayit formundan TC alani kaldirildi; numara artik profil guncelleme
// uzerinden giriyor. Dogrulama yalnizca kayit akisinda durdugu icin profil
// yolundan gecersiz bir numara kaydedilebiliyordu. Tek kaynak buraya alindi.
//
// Not: bu yalnizca numaranin kendi icinde tutarli olup olmadigini soyler.
// Numaranin gercekten o kisiye ait oldugunu DOGRULAMAZ; sistemde kimlik
// dogrulama akisi yoktur ve hicbir metinde oyleymis gibi anlatilmamalidir.
export function gecerliTcKimlik(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  const onuncu = ((tek * 7) - cift) % 10;
  if (onuncu < 0 || onuncu !== d[9]) return false;
  const toplam = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return (toplam % 10) === d[10];
}

/**
 * T.C. numarasi baska bir hesapta kayitliysa gosterilen mesaj.
 *
 * Numaranin kendisini, diger hesabin e-postasini ya da herhangi bir kullanici
 * bilgisini icermiyor: bu uc kimlik dogrulamasi gerektirmiyor, dolayisiyla
 * mesaj numaranin sahibi hakkinda bilgi sizdirmamali. Buna karsilik
 * kullanicinin sikisip kalmamasi icin iki cikis yolu soyluyor.
 */
export const TC_CAKISMA_MESAJI =
  'Bu T.C. kimlik numarası başka bir hesapta kayıtlı. Daha önce üye olduysan o hesapla giriş yapabilirsin; ' +
  'numaranın size ait olduğunu düşünüyorsanız destek@motorya.com.tr adresine yazın.';
