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

export const OLAYLAR = {
  // ── Ilan verme akisi ──────────────────────────────────────────────────
  ilan_akis_basladi: {
    aciklama: 'Kullanici ilan verme formunu acti.',
    akisGerekli: true,
    alanlar: {},
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
    alanlar: { listingId: 'kimlik' },
  },

  // ── Arama ve kesif ────────────────────────────────────────────────────
  arama_yapildi: {
    aciklama:
      'Arama sonucu sunucudan dondu. Serbest arama metni kaydedilmiyor; yalnizca sorgunun olup olmadigi, kategori, kullanilan filtre turleri ve sonuc sayisi.',
    alanlar: {
      sonucSayisi: 'tamsayi',
      sifirSonuc: 'bayrak',
      metinVar: 'bayrak',
      kategori: 'kod',
      filtreler: 'kodListesi',
    },
  },
  arama_sonuc_tiklandi: {
    aciklama:
      'Arama sonuc listesinden bir ilana gecildi. Gecis kendi basina olay olarak olculuyor; oturum birlestirmeye gerek kalmiyor.',
    alanlar: { listingId: 'kimlik' },
  },
  ilan_detay_goruntulendi: {
    aciklama:
      'Ilan detay sayfasi goruntulendi. kaynak: arama, liste, dogrudan. kendiIlani true ise donusum hesaplarindan cikariliyor.',
    alanlar: { listingId: 'kimlik', kaynak: 'kod', kendiIlani: 'bayrak' },
  },

  // ── Saticiya ulasma ───────────────────────────────────────────────────
  mesaj_butonu_tiklandi: {
    aciklama:
      'Ilan detayinda mesaj gonderme eylemine tiklandi. Gonderilmis mesaj DEGILDIR; mesajin kaydi Message tablosundan okunuyor.',
    alanlar: { listingId: 'kimlik', kendiIlani: 'bayrak' },
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
