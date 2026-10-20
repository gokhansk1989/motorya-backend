/**
 * Olay sozlugu — olcum sisteminin tek dogruluk kaynagi.
 *
 * Istemci de sunucu da bu dosyayi okuyor. Burada olmayan bir olay adi ya da
 * burada tanimlanmamis bir alan sunucuda sessizce dusuruluyor. Boylece
 * istemciye yeni bir surum cikmadan analitige beklenmedik veri giremiyor -
 * ozellikle kisisel veri.
 *
 * Neden bu kadar az olay var: ilan gonderimi, moderasyon sonucu, ilk mesajin
 * kaydi, satici yaniti ve teklifler Listing/Message/Offer tablolarinda zaten
 * duruyor. Rapor onlari SQL ile hesapliyor; olay olarak bir kez daha yazmak
 * ayni gercegi iki yerde tutmak ve ikisinin sapma riskini almak olurdu.
 * Burada yalnizca hicbir tabloda iz birakmayan seyler var.
 */

/** Izin verilen alan tipleri. Serbest metin bilerek yok. */
type AlanTipi = 'tamsayi' | 'bayrak' | 'kimlik' | 'kod' | 'kodListesi';

export interface OlayTanimi {
  /** Raporda ve belgede gorunen aciklama. */
  aciklama: string;
  /** Akis kimligi bu olay icin zorunlu mu? */
  akisGerekli?: boolean;
  /** Alan adi -> tip. Burada olmayan alanlar atiliyor. */
  alanlar: Record<string, AlanTipi>;
}

/**
 * Kampanya alanlari. Her olaya eklenebiliyor: kullanici kampanya
 * baglantisindan geldiyse o ziyaretteki butun olaylar kaynagi tasiyor,
 * boylece "Instagram'dan gelenler ilan detayina ne kadar geciyor"
 * sorusu tek sorguyla cevaplanabiliyor.
 *
 * Degerler sunucuda ayrica normalize ediliyor (kampanya.ts): kucuk harf,
 * 40 karakter siniri, yalnizca harf/rakam/alt tire/tire.
 */
const KAMPANYA_ALANLARI = {
  utmKaynak: 'kod',
  utmOrtam: 'kod',
  utmKampanya: 'kod',
  utmIcerik: 'kod',
  utmYerlesim: 'kod',
} as const;

export const OLAYLAR = {
  /**
   * Kampanya baglantisiyla siteye giris.
   *
   * "Giris" burada ACILIS OLAYI demek - tekil kullanici ya da oturum
   * DEGIL. Cihaz kimligi tutmadigimiz icin tekil kullanici sayamiyoruz;
   * raporda da oyle adlandirilmiyor.
   */
  kampanya_acilisi: {
    aciklama:
      'Kampanya etiketli bir baglantiyla siteye girildi. Acilis olayidir; tekil kullanici ya da oturum degil.',
    alanlar: { ...KAMPANYA_ALANLARI, yol: 'kod', yonlendiren: 'kod' },
  },

  // ── Ilan verme akisi ──────────────────────────────────────────────────
  ilan_akis_basladi: {
    aciklama: 'Kullanici ilan verme formunu acti.',
    akisGerekli: true,
    alanlar: { ...KAMPANYA_ALANLARI },
  },
  ilan_adim_tamamlandi: {
    aciklama:
      'Form adimi dogrulamayi gecip sonraki adima ilerledi. adim: 1 Kategori, 2 Fotograflar, 3 Detaylar, 4 Fiyat.',
    akisGerekli: true,
    alanlar: { adim: 'tamsayi' },
  },
  ilan_foto_yuklendi: {
    aciklama: 'Fotograf yukleme istegi sunucuda basariyla tamamlandi.',
    akisGerekli: true,
    alanlar: { adet: 'tamsayi' },
  },
  ilan_foto_hata: {
    aciklama: 'Fotograf yukleme basarisiz. hataKodu: ag, sunucu, boyut, tip, limit.',
    akisGerekli: true,
    alanlar: { hataKodu: 'kod' },
  },
  ilan_form_hatasi: {
    aciklama:
      'Form dogrulama hatasi. Yalnizca alan adi ve hata kodu; girilen deger hicbir zaman gonderilmiyor.',
    akisGerekli: true,
    alanlar: { alan: 'kod', kod: 'kod' },
  },
  ilan_gonderildi: {
    aciklama:
      'Sunucu ilani olusturdu ve kimligini dondurdu. Dugmeye tiklama degil, islemin tamamlanmasi sayiliyor.',
    akisGerekli: true,
    alanlar: { ...KAMPANYA_ALANLARI, listingId: 'kimlik'},
  },

  // ── Arama ve kesif ────────────────────────────────────────────────────
  arama_yapildi: {
    aciklama:
      'Arama sonucu sunucudan dondu. Serbest arama metni kaydedilmiyor; yalnizca sorgunun olup olmadigi, kategori, kullanilan filtre turleri ve sonuc sayisi.',
    alanlar: { ...KAMPANYA_ALANLARI, sonucSayisi: 'tamsayi',
      sifirSonuc: 'bayrak',
      metinVar: 'bayrak',
      kategori: 'kod',
      filtreler: 'kodListesi',},
  },
  arama_sonuc_tiklandi: {
    aciklama:
      'Arama sonuc listesinden bir ilana gecildi. Gecis kendi basina olay olarak olculuyor; oturum birlestirmeye gerek kalmiyor.',
    alanlar: { listingId: 'kimlik' },
  },
  ilan_detay_goruntulendi: {
    aciklama:
      'Ilan detay sayfasi goruntulendi. kaynak: arama, liste, dogrudan. kendiIlani true ise donusum hesaplarindan cikariliyor.',
    alanlar: { ...KAMPANYA_ALANLARI, listingId: 'kimlik', kaynak: 'kod', kendiIlani: 'bayrak'},
  },

  // ── Saticiya ulasma ───────────────────────────────────────────────────
  mesaj_butonu_tiklandi: {
    aciklama:
      'Ilan detayinda mesaj gonderme eylemine tiklandi. Gonderilmis mesaj DEGILDIR; mesajin kaydi Message tablosundan okunuyor. uyeMi: tiklama anindaki oturum durumu - misafir ve uye akislari ayri olculuyor.',
    alanlar: { ...KAMPANYA_ALANLARI, listingId: 'kimlik', kendiIlani: 'bayrak', uyeMi: 'bayrak' },
  },

  /**
   * Misafir mesaj gondermek istedi ve giris ekranina yonlendirildi.
   *
   * `mesaj_butonu_tiklandi` ile ayni anda uretiliyor ama AYRI bir olay:
   * boylece "kac tiklama giris duvarina carpti" sorusu, uyelerin
   * tiklamalarini paydaya katmadan cevaplanabiliyor.
   */
  mesaj_giris_gerekti: {
    aciklama: 'Misafir mesaj gondermek istedi, giris/kayit ekranina yonlendirildi.',
    alanlar: { ...KAMPANYA_ALANLARI, listingId: 'kimlik' },
  },

  /**
   * Kimlik dogrulamasindan sonra ILANA geri donuldu.
   *
   * Giris/kayit/e-posta dogrulama/Google turu bittikten sonra kullanici
   * mesaj niyetiyle ayni ilana dondugunde uretiliyor. Bu adim olmadan
   * "giriste mi kaybediyoruz yoksa donuste mi" sorusu cevaplanamiyordu.
   */
  mesaj_girisden_donuldu: {
    aciklama: 'Kimlik dogrulamasi sonrasi mesaj niyetiyle ilana geri donuldu.',
    alanlar: { ...KAMPANYA_ALANLARI, listingId: 'kimlik' },
  },

  /**
   * Gonderme denendi — BASARI DEGIL.
   *
   * Basarinin tek kaniti sunucuda kaydedilmis Message satiri. Bu olay
   * yalnizca denemeyi sayiyor; ikisinin farki "yazdi ama gonderemedi"
   * grubunu gosteriyor.
   */
  mesaj_gonderim_denendi: {
    aciklama: 'Mesaj gonderme islemi baslatildi. Basari DEGILDIR; basari Message tablosundan okunuyor.',
    alanlar: { listingId: 'kimlik' },
  },

  /**
   * Gonderim basarisiz. Yalnizca HATA KODU tasiyor; mesaj metni, sunucu
   * hata mesaji ya da kisisel veri hicbir kosulda girmiyor.
   */
  mesaj_gonderim_hatasi: {
    aciklama: 'Mesaj gonderilemedi. Yalnizca kaba hata kodu tasir; mesaj metni ve sunucu mesaji gonderilmez.',
    alanlar: { listingId: 'kimlik', kod: 'kod' },
  },

  // ── Uyelik hunisi ─────────────────────────────────────────────────
  //
  // GIRISIM KIMLIGI: bu olaylarin hepsi `flowId` tasiyor ve ayni kayit
  // girisimini birbirine bagliyor. Mevcut ilan verme akisindaki
  // altyapinin aynisi - yeni bir mekanizma icat edilmedi.
  //
  // flowId kisa omurlu ve tahmin edilemez (crypto.randomUUID), YALNIZCA
  // olcum icin. Hicbir yetki, oturum ya da kimlik karari ona bakmiyor;
  // cihazlar arasi kalici bir takip kimligi DEGIL, tek bir kayit
  // girisimi boyunca yasiyor.

  /**
   * Kayit formu gercekten goruntulendi.
   *
   * Cift sayim korumasi iki katmanli: istemci her GERCEK sayfa acilisi
   * icin bir kez uretiyor (React StrictMode cift calistirsa da ayni
   * eventId gidiyor) ve sunucu eventId benzersizligiyle ikincisini
   * dusuruyor. "Gercek acilis" = yeni bir girisim kimligi uretilmesi.
   */
  uyelik_ekran_goruntulendi: {
    aciklama: 'Kayit formu goruntulendi. Yeni bir kayit girisimi baslatildi (flowId uretildi).',
    akisGerekli: true,
    alanlar: { ...KAMPANYA_ALANLARI },
  },

  /**
   * Formda ILK ANLAMLI etkilesim.
   *
   * Sayfaya gelmek ya da bir alana odaklanmak baslangic SAYILMIYOR;
   * kullanicinin gercekten bir deger girmesi gerekiyor. Girilen
   * degerler hicbir kosulda gonderilmiyor - yalnizca "basladi" bilgisi.
   * Girisim basina bir kez.
   */
  uyelik_basladi: {
    aciklama: 'Kayit formunda ilk anlamli etkilesim. Girilen degerler kaydedilmez. yontem: form | google.',
    akisGerekli: true,
    alanlar: { ...KAMPANYA_ALANLARI, yontem: 'kod' },
  },

  /**
   * Gecerli form sunucuya gonderildi. HESAP OLUSTU DEMEK DEGIL.
   * Tekrarlanan tiklama ve ag tekrarlari ayni eventId ile gidiyor,
   * yeni girisim sayilmiyor.
   */
  uyelik_gonderildi: {
    aciklama: 'Kayit formu sunucuya gonderildi. Hesap olustugu anlamina GELMEZ.',
    akisGerekli: true,
    alanlar: { ...KAMPANYA_ALANLARI },
  },

  /**
   * SUNUCU OLAYI. Yalnizca veritabaninda kullanici satiri olustuktan
   * sonra yaziliyor; istemciden gelen hicbir basari iddiasina
   * guvenilmiyor. Ayni hesap iki kez sayilmaz: eventId hesabin
   * kimliginden turetiliyor.
   */
  uyelik_hesap_olusturuldu: {
    aciklama: 'SUNUCU: kullanici kaydi veritabaninda olusturuldu. yontem: form | google.',
    alanlar: { yontem: 'kod', dogrulamaGerekli: 'bayrak' },
  },

  /**
   * SUNUCU OLAYI. Dogrulama e-postasinin durumu.
   *
   * durum: istendi | saglayici_kabul | atlandi | hata
   *   atlandi = hic denenmedi (test alan adi / saglayici yok)
   * Saglayicinin kabul etmesi TESLIM EDILDI DEMEK DEGIL. Resend
   * webhook'u kurulu olmadigi icin teslim/bounce/sikayet durumu
   * BILINMIYOR ve raporda oyle gosteriliyor. Acilma pikseli yok.
   */
  uyelik_dogrulama_maili: {
    aciklama: 'SUNUCU: dogrulama e-postasi. durum: istendi | saglayici_kabul | atlandi | hata. Saglayici kabulu TESLIM DEGIL; webhook yok, teslim durumu BILINMIYOR.',
    alanlar: { durum: 'kod', tekrar: 'bayrak', kod: 'kod' },
  },

  /**
   * SUNUCU OLAYI. Yalnizca dogrulama islemi basarili oldugunda.
   * Dogrulama sayfasinin acilmasi ya da baglantinin e-posta guvenlik
   * tarayicisi tarafindan ziyaret edilmesi basari SAYILMIYOR. Tekrar
   * acilan baglanti ayni hesabi ikinci kez dogrulanmis saymaz.
   */
  uyelik_eposta_dogrulandi: {
    aciklama: 'SUNUCU: e-posta dogrulama islemi basariyla tamamlandi.',
    alanlar: { yontem: 'kod' },
  },

  /**
   * Kayit akisindaki hatalar. YALNIZCA sabit kod; parola, e-posta,
   * telefon, kimlik numarasi, kullanici metni ya da ham hata mesaji
   * hicbir kosulda girmiyor.
   */
  uyelik_hatasi: {
    aciklama: 'Kayit akisinda hata. Yalnizca sabit kod tasir; ham hata mesaji ve kisisel veri gonderilmez.',
    alanlar: { kod: 'kod', adim: 'kod' },
  },
} satisfies Record<string, OlayTanimi>;

export type OlayAdi = keyof typeof OLAYLAR;

export const OLAY_ADLARI = Object.keys(OLAYLAR) as OlayAdi[];

export function olayTanimli(ad: string): ad is OlayAdi {
  return Object.prototype.hasOwnProperty.call(OLAYLAR, ad);
}

/** Kod alanlarinin kabul edilen bicimi: kisa, harf/rakam/alt tire/tire. */
const KOD = /^[a-zA-Z0-9_.-]{1,40}$/;
const KIMLIK = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Gelen props'u sozluge gore temizler.
 *
 * Bilinmeyen alanlari atar, tipi uymayani atar. Hata firlatmiyor: olcumun
 * bozulmasi kullanicinin isini durdurmamali, eksik alanli bir olay hic olay
 * olmamasindan iyidir.
 */
export function propsTemizle(ad: OlayAdi, gelen: unknown): Record<string, unknown> {
  const tanim = OLAYLAR[ad] as OlayTanimi;
  const cikti: Record<string, unknown> = {};
  if (!gelen || typeof gelen !== 'object' || Array.isArray(gelen)) return cikti;
  const kaynak = gelen as Record<string, unknown>;

  for (const [alan, tip] of Object.entries(tanim.alanlar)) {
    const deger = kaynak[alan];
    if (deger === undefined || deger === null) continue;

    switch (tip) {
      case 'tamsayi':
        if (typeof deger === 'number' && Number.isFinite(deger)) {
          // Ust sinir: bozuk ya da kotu niyetli istemci sayilari sismesin.
          cikti[alan] = Math.max(0, Math.min(1_000_000, Math.trunc(deger)));
        }
        break;
      case 'bayrak':
        if (typeof deger === 'boolean') cikti[alan] = deger;
        break;
      case 'kimlik':
        if (typeof deger === 'string' && KIMLIK.test(deger)) cikti[alan] = deger;
        break;
      case 'kod':
        if (typeof deger === 'string' && KOD.test(deger)) cikti[alan] = deger;
        break;
      case 'kodListesi':
        if (Array.isArray(deger)) {
          const liste = deger
            .filter((d): d is string => typeof d === 'string' && KOD.test(d))
            .slice(0, 12);
          if (liste.length) cikti[alan] = liste;
        }
        break;
    }
  }
  return cikti;
}
