/**
 * Kampanya (UTM) etiketleri — tek dogruluk kaynagi.
 *
 * ── ILISKILENDIRME KURALI ────────────────────────────────────────────
 *
 * Iki AYRI kapsam var ve bunlar birbirine karistirilmamali:
 *
 * 1. ZIYARET KAPSAMI (olaylar)
 *    Kampanya, sayfa oturumu boyunca BELLEKTE tutuluyor. Cerez,
 *    localStorage ve sessionStorage KULLANILMIYOR - olcum sistemimizin
 *    tamaminda oldugu gibi cihazda hicbir sey saklanmiyor, dolayisiyla
 *    bu takip yeni bir izin gerektirmiyor.
 *    Son temas kazanir: ziyaret sirasinda yeni bir kampanya baglantisi
 *    acilirsa oncekinin yerini alir.
 *    SURE: sayfa yenilenene ya da sekme kapanana kadar. Yenilemeden
 *    sonra kaynak "belirlenemedi" olur - tahminle doldurmuyoruz.
 *
 * 2. HESAP KAPSAMI (sunucu tarafi donusumler)
 *    Kullanici kampanya etkinken KAYIT OLURSA, kampanya User satirina
 *    bir kez damgalaniyor (ILK TEMAS) ve bir daha degismiyor. Ilk mesaj
 *    ve teklif gibi sunucu tarafi gercekler bu damgayla iliskilendiriliyor.
 *    SURE: kalici. Hesap silinince damga da gidiyor.
 *
 * Oranlar YALNIZCA ayni kapsam icinde hesaplaniyor. Ziyaret bazli bir
 * payi hesap bazli bir paydaya bolmek anlamsiz sayi uretirdi.
 *
 * ── DOGRUDAN ZIYARET ─────────────────────────────────────────────────
 *
 * UTM etiketi olmayan bir acilis, bellekteki kampanyayi SILMEZ: kampanya
 * baglantisindan gelip sonra site icinde gezinen kullanici kaynagini
 * kaybetmemeli. Yalnizca yeni bir UTM'li acilis mevcut kampanyanin yerini
 * alir.
 *
 * Hic kampanya yoksa ve yonlendiren de taninmiyorsa kaynak
 * "Doğrudan / kaynak belirlenemedi" olur. Bu Instagram ya da Facebook
 * SAYILMAZ.
 *
 * ── GUVENLIK ─────────────────────────────────────────────────────────
 *
 * UTM degerleri kullanicinin elinde: adres cubugundan istedigini yazabilir.
 * Yalnizca olcum bilgisi olarak kullaniliyor; hicbir yetki, erisim ya da
 * fiyat karari bunlara bakmiyor.
 */

/** Izin verilen kaynaklar. Liste disi deger "diger" olarak normalize edilir. */
export const KAYNAKLAR = ['instagram', 'facebook', 'diger'] as const;
export type Kaynak = (typeof KAYNAKLAR)[number];

/** Yerlesim: utm_content'ten cikarilan kaba grup. */
export const YERLESIMLER = ['profil', 'story', 'gonderi', 'diger'] as const;
export type Yerlesim = (typeof YERLESIMLER)[number];

export interface Kampanya {
  kaynak: Kaynak;
  ortam: string;
  kampanya: string;
  icerik: string;
  yerlesim: Yerlesim;
}

/** Etiket bicimi: kucuk harf, rakam, alt tire ve tire. */
const ETIKET = /^[a-z0-9_-]{1,40}$/;

/**
 * Tek bir UTM degerini temizler.
 *
 * Kullanicidan gelen her sey gibi guvenilmez: uzunluk siniri var, izin
 * verilmeyen karakterler atiliyor, Turkce harfler sadelestiriliyor ki
 * "Dolapta_Yer_Yok" ile "dolapta_yer_yok" ayri kampanya sayilmasin.
 *
 * Bos string donerse etiket yok sayilir - kirpilmis bir degeri saklamak,
 * raporda var olmayan bir kampanya uretmekten iyidir degil.
 */
export function etiketTemizle(deger: unknown): string {
  if (typeof deger !== 'string') return '';
  const sade = deger
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);
  return ETIKET.test(sade) ? sade : '';
}

/** Kaynak adini bilinen listeye indirger. */
export function kaynagiNormalle(deger: unknown): Kaynak | null {
  const t = etiketTemizle(deger);
  if (!t) return null;
  if (t === 'instagram' || t === 'ig') return 'instagram';
  if (t === 'facebook' || t === 'fb') return 'facebook';
  return 'diger';
}

/**
 * utm_content'ten yerlesim cikarir.
 *
 * Raporda "profil / story / gonderi" ayrimi isteniyor ama bu bilgi ayri
 * bir etiket olarak gelmiyor; icerik etiketinin icinde gecıyor
 * (story_01, gonderi_03, bio, sayfa). Kaba eslesme yapiyoruz; tutmazsa
 * "diger" oluyor - uydurmuyoruz.
 */
export function yerlesimCikar(icerik: string, kampanya: string): Yerlesim {
  const h = `${icerik} ${kampanya}`;
  if (/\bstory/.test(h)) return 'story';
  if (/\bgonderi|\bpost\b/.test(h)) return 'gonderi';
  if (/\bbio\b|\bprofil|\bsayfa\b/.test(h)) return 'profil';
  return 'diger';
}

/**
 * Sorgu parametrelerinden kampanyayi cikarir.
 *
 * utm_source olmadan kampanya YOK sayiliyor: ortam ya da kampanya adi tek
 * basina "bu ziyaret nereden geldi" sorusunu cevaplamiyor.
 */
export function kampanyaCikar(
  params: Record<string, string | undefined> | URLSearchParams,
): Kampanya | null {
  const al = (k: string) =>
    params instanceof URLSearchParams ? (params.get(k) ?? undefined) : params[k];

  const kaynak = kaynagiNormalle(al('utm_source'));
  if (!kaynak) return null;

  const kampanya = etiketTemizle(al('utm_campaign')) || 'adsiz';
  const icerik = etiketTemizle(al('utm_content')) || 'adsiz';
  return {
    kaynak,
    ortam: etiketTemizle(al('utm_medium')) || 'adsiz',
    kampanya,
    icerik,
    yerlesim: yerlesimCikar(icerik, kampanya),
  };
}

/**
 * Yonlendiren alan adindan kaba kaynak cikarir.
 *
 * UTM yoksa yardimci sinyal. Her zaman gelmiyor: Instagram uygulama ici
 * tarayicisi cogu durumda yonlendiren gondermiyor, dolayisiyla bunun
 * bos olmasi "kaynak yok" anlamina GELMEZ, yalnizca "bilemiyoruz".
 */
export function yonlendirenKaynak(referrer: string | undefined | null): Kaynak | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLocaleLowerCase('en');
  } catch {
    return null;
  }
  if (/(^|\.)instagram\.com$/.test(host) || host === 'l.instagram.com') return 'instagram';
  if (/(^|\.)facebook\.com$/.test(host) || host === 'lm.facebook.com' || host === 'l.facebook.com') {
    return 'facebook';
  }
  return null;
}

/** Raporda kaynagi belirsiz olan her sey icin tek etiket. */
export const KAYNAK_YOK = 'dogrudan';
