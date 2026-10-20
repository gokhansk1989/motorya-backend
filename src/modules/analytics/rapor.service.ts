import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KONTROL_ICERIKLERI, KONTROL_KAMPANYALARI, kontrolAciklamasi } from './kontrol-kampanyalari';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Yonetici huni raporu.
 *
 * Iki kaynak birlestiriliyor:
 *
 * - "veritabani": ilan gonderimi, moderasyon sonucu, ilk mesaj, satici yaniti
 *   ve teklifler zaten Listing/Message/Offer tablolarinda. Bunlar olay olarak
 *   bir kez daha yazilmiyor; rapor dogrudan tablolardan hesapliyor. Faydasi:
 *   bu metrikler olcum sistemi kurulmadan ONCEKI donem icin de dogru.
 * - "olay": formun hangi adiminda birakildigi, aramanin sonuc uretip
 *   uretmedigi, mesaj dugmesine basilip mesaj gonderilmedigi. Bunlarin hicbiri
 *   baska hicbir yerde iz birakmiyor. Yalnizca AnalyticsEvent tablosunun
 *   basladigi tarihten sonrasi icin anlamli.
 */

/** Altinda oranin yaniltici oldugu paya/payda sinirini belirler. */
const ASGARI_PAYDA = 20;

/** Bir ilan verme girisimini tanimlayan bosluk: ayni kullanicinin bu sureden
 *  kisa araliklarla acip kapattigi form, tek girisim sayiliyor. Yenileme ve
 *  tekrar denemeler boylece sayiyi sismiyor. */
const AKIS_BOSLUK_DK = 30;

/** Bir akisin olaylarinin toplanacagi ust sure. Gece yarisini asan ya da
 *  yarin devam eden formlar da dogru girisime bagli kalsin. */
const AKIS_PENCERE_SA = 24;

/** Yanit/yayin beklemenin "gecikme" sayilmaya basladigi sure. Bu suresi
 *  dolmamis kayitlar oran paydasina girmiyor: dun gelen ve henuz
 *  yanitlanmamis bir mesaj, bir aydir yanitlanmayanla ayni degil. */
const OLGUNLASMA_SA = 48;

export type MetrikKaynagi = 'olay' | 'veritabani' | 'karma';

export interface Metrik {
  ad: string;
  tanim: string;
  /** Oran metrikleri icin pay. Sayim metriklerinde null. */
  pay: number | null;
  /** Oran metrikleri icin payda. Sayim metriklerinde null. */
  payda: number | null;
  /** 0-1 arasi oran, ya da sure/sayim degeri. Yeterli veri yoksa null. */
  deger: number | null;
  birim: 'oran' | 'sayi' | 'saat';
  kaynak: MetrikKaynagi;
  /** false ise arayuz "Yeterli veri yok" gosteriyor. */
  yeterliVeri: boolean;
  not?: string;
}

function oranMetrigi(
  ad: string,
  tanim: string,
  pay: number,
  payda: number,
  kaynak: MetrikKaynagi,
  not?: string,
): Metrik {
  const yeterli = payda >= ASGARI_PAYDA;
  return {
    ad,
    tanim,
    pay,
    payda,
    deger: yeterli && payda > 0 ? pay / payda : null,
    birim: 'oran',
    kaynak,
    yeterliVeri: yeterli,
    not,
  };
}

function sayiMetrigi(ad: string, tanim: string, deger: number, kaynak: MetrikKaynagi, not?: string): Metrik {
  // Sayimlarda "yeterli veri" esigi yok: 3 teklif olduysa dogru cevap 3'tur,
  // gizlenmesi gereken yaniltici bir oran degil.
  return { ad, tanim, pay: null, payda: null, deger, birim: 'sayi', kaynak, yeterliVeri: true, not };
}

function sureMetrigi(
  ad: string,
  tanim: string,
  saat: number | null,
  ornekSayisi: number,
  kaynak: MetrikKaynagi,
  not?: string,
): Metrik {
  const yeterli = ornekSayisi >= ASGARI_PAYDA && saat !== null;
  return {
    ad,
    tanim,
    pay: null,
    payda: ornekSayisi,
    deger: yeterli ? saat : null,
    birim: 'saat',
    kaynak,
    yeterliVeri: yeterli,
    not,
  };
}

/**
 * Tarih parametresini SQL'e belirsizlik birakmadan tasir.
 *
 * Prisma $queryRaw'da bir JS Date'i, "timestamp without time zone" kolonlar
 * icin yerel duvar saatine cevirip gonderiyor. Kolonlar UTC tutuyor, dolayisiyla
 * tum pencere sinirlari saat dilimi ofseti kadar (Turkiye'de 3 saat) kayiyordu:
 * donem kenarlarindaki kayitlar yanlis tarafta kaliyor, 48 saatlik olgunlasma
 * siniri 45 saat gibi davraniyordu. Siniri olay verisinin basladigi ana esit
 * verdigimizde hata gorunur oldu - hicbir satir eslesmedi.
 *
 * ISO metnini dogrudan timestamp'e cevirerek surucunun donusumunu devre disi
 * birakiyoruz.
 */
function ts(d: Date) {
  return Prisma.sql`${d.toISOString().replace('Z', '')}::timestamp`;
}

@Injectable()
export class RaporService {
  private readonly logger = new Logger(RaporService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * `kontrolDahil`: kontrollu test kampanyalarini da dahil et. Yalnizca
   * yoneticinin acikca istemesiyle true oluyor; varsayilan is raporu
   * bunlari DISLIYOR. Ham veriye dokunulmuyor, yalnizca bu sorgunun
   * suzgeci degisiyor.
   */
  async rapor(baslangic: Date, bitis: Date, kontrolDahil = false) {
    const simdi = new Date();
    const olgunSinir = new Date(simdi.getTime() - OLGUNLASMA_SA * 60 * 60 * 1000);

    const [ilkOlay, ilanAkisi, arama, moderasyon, iletisim, teklif, sosyal, uyelik] = await Promise.all([
      this.ilkOlayTarihi(),
      this.ilanAkisi(baslangic, bitis),
      this.aramaAkisi(baslangic, bitis),
      this.moderasyon(baslangic, bitis, olgunSinir),
      this.iletisimHazirla(baslangic, bitis, olgunSinir),
      this.teklifler(baslangic, bitis),
      this.sosyalKaynaklar(baslangic, bitis, olgunSinir, kontrolDahil),
      this.uyelikHunisi(baslangic, bitis, olgunSinir, null),
    ]);

    // Karsilastirma ilkOlay'a bagli: olcumun kuruldugu tarihi bilmeden
    // "onceki donemde sifirdi" ile "onceki donemde olculmuyordu" ayirt
    // edilemez. Bu yuzden ilk turdan SONRA cagriliyor.
    const karsilastirma = await this.donemKarsilastirmasi(baslangic, bitis, ilkOlay);

    /**
     * Olay tabanli bolumlere OLCUM DURUMU ekleniyor.
     *
     * Promise.all'dan SONRA yapiliyor cunku `ilkOlay` de ayni turda
     * cozuluyor; bolumlerin icinden erisilemiyordu.
     *
     * Veritabani kaynakli bolumler (moderasyon, teklifler) disarida:
     * onlar olay kaydina bagli degil, olcum oncesi donemler icin de
     * dogrular - "olcum calisiyor mu" sorusu onlara uygulanmiyor.
     */
    const [ilanOlcum, aramaOlcum, iletisimOlcum, uyelikOlcum] = await Promise.all([
      this.olcumDurumu(['ilan_akis_basladi', 'ilan_adim_tamamlandi', 'ilan_gonderildi'], baslangic, bitis, ilkOlay),
      this.olcumDurumu(['arama_yapildi'], baslangic, bitis, ilkOlay),
      this.olcumDurumu(['mesaj_butonu_tiklandi'], baslangic, bitis, ilkOlay),
      this.olcumDurumu(
        ['uyelik_ekran_goruntulendi', 'uyelik_hesap_olusturuldu', 'uyelik_eposta_dogrulandi'],
        baslangic, bitis, ilkOlay,
      ),
    ]);
    (ilanAkisi as any).olcum = ilanOlcum;
    (arama as any).olcum = aramaOlcum;
    (iletisim as any).olcum = iletisimOlcum;
    (uyelik as any).olcum = uyelikOlcum;

    return {
      donem: {
        baslangic: baslangic.toISOString(),
        bitis: bitis.toISOString(),
        saatDilimi: 'Europe/Istanbul',
        gun: Math.round((bitis.getTime() - baslangic.getTime()) / 86_400_000),
      },
      /** Olay tabanli metrikler bu tarihten oncesi icin bos; tahminle
       *  doldurulmuyor. */
      olayVerisiBaslangici: ilkOlay ? ilkOlay.toISOString() : null,
      karsilastirma,
      kurallar: {
        asgariPayda: ASGARI_PAYDA,
        akisBoslukDk: AKIS_BOSLUK_DK,
        akisPencereSa: AKIS_PENCERE_SA,
        olgunlasmaSa: OLGUNLASMA_SA,
        aciklamalar: [
          `Tarihler Europe/Istanbul saat diliminde yorumlanir.`,
          `Bir ilan verme girisimi: ayni kullanicinin ${AKIS_BOSLUK_DK} dakikadan kisa araliklarla acilan formlari tek girisim sayilir. Sayfa yenilemesi yeni girisim uretmez.`,
          `Bir akisa ait olaylar, akis basladiktan sonraki ${AKIS_PENCERE_SA} saat icinde toplanir.`,
          `Yayin ve yanit oranlarinin paydasinda yalnizca ${OLGUNLASMA_SA} saatten eski kayitlar var; henuz bekleyen yeni kayitlar ayri gosterilir.`,
          `Paydasi ${ASGARI_PAYDA}'nin altinda kalan oranlar "Yeterli veri yok" olarak gosterilir.`,
          `Personel (ADMIN/SUPER_ADMIN/MODERATOR) ve ANALYTICS_HARIC_KULLANICILAR listesindeki hesaplar tum hesaplardan cikarilir.`,
          `Tekrar gonderilen olaylar benzersiz olay kimligiyle bir kez sayilir.`,
          `Ilan sahibinin kendi ilanini goruntulemesi donusum hesaplarina girmez.`,
          `Teklifin kabul edilmesi gerceklesmis satis anlamina gelmez.`,
        ],
      },
      bolumler: [uyelik, ilanAkisi, moderasyon, arama, iletisim, teklif],
      sosyal,
    };
  }

  // ── Sosyal medya kaynaklari ───────────────────────────────────────

  /**
   * Instagram / Facebook kampanyalarinin urettigi hareket.
   *
   * IKI AYRI KAPSAM, bilerek ayri raporlaniyor:
   *
   *   ZIYARET  - olaylardan. Kampanya ziyaret boyunca bellekte tasiniyor
   *              (cihazda saklama yok), son temas kazaniyor. Sayfa
   *              yenilenince kaynak kayboluyor.
   *   HESAP    - User.kampanya* damgasindan. KAYIT aninda bir kez
   *              yaziliyor, kalici.
   *
   * DIKKAT: hesap kapsamindaki damga "ilk temas" DEGIL. Oyle
   * adlandirilmisti ve yanlisti: gercek ilk ziyaret kaynagi hicbir yerde
   * saklanmiyor (cihazda depolama yok). Damga, kayit aninda bellekte
   * hangi kampanya varsa onu gosterir - yani o ziyaretin son temasi.
   * Raporda adi "Kayit kampanyasi".
   *
   * Oranlar yalnizca KENDI kapsami icinde hesaplaniyor. Ziyaret bazli bir
   * payi hesap bazli bir paydaya bolmek anlamsiz bir sayi uretirdi - brief
   * de bunu acikca yasakliyor.
   *
   * Bu bolum Instagram/Facebook ICINDEKI erisimi, gosterimi ya da profil
   * goruntulemesini OLCMUYOR. Yalnizca siteye ulasan tiklamalari goruyor.
   */
  private async sosyalKaynaklar(
    baslangic: Date,
    bitis: Date,
    olgunSinir: Date,
    kontrolDahil = false,
  ) {
    /**
     * Kontrollu test kampanyalari.
     *
     * `isStaff` kullaniciya bagli oldugu icin MISAFIR olarak yapilan
     * kendi testlerimizi yakalamiyor. Bunlari burada, RAPOR ANINDA
     * cikariyoruz; ham veri oldugu gibi duruyor.
     *
     * `kontrolDahil` yalnizca yoneticinin acikca istemesiyle true olur.
     */
    const kontrolIcerik = [...KONTROL_ICERIKLERI];
    const kontrolKampanya = [...KONTROL_KAMPANYALARI];
    const kontrolVar = kontrolIcerik.length > 0 || kontrolKampanya.length > 0;

    // Prisma.sql ile parcali kosul: liste bossa kosul hic eklenmiyor.
    const kontrolSuzgeci =
      kontrolVar && !kontrolDahil
        ? Prisma.sql`
          AND LOWER(COALESCE(props->>'utmIcerik','')) <> ALL(${kontrolIcerik}::text[])
          AND LOWER(COALESCE(props->>'utmKampanya','')) <> ALL(${kontrolKampanya}::text[])`
        : Prisma.empty;

    // Kac kayit cikariliyor? Sessiz dislama olcume guveni bitirir.
    const [kontrolSayim] = kontrolVar
      ? await this.prisma.$queryRaw<{ adet: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS adet FROM "AnalyticsEvent"
          WHERE NOT "isStaff"
            AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
            AND (
              LOWER(COALESCE(props->>'utmIcerik','')) = ANY(${kontrolIcerik}::text[])
              OR LOWER(COALESCE(props->>'utmKampanya','')) = ANY(${kontrolKampanya}::text[])
            )`)
      : [{ adet: BigInt(0) }];

    // ── Ziyaret kapsami: olaylar ────────────────────────────────────
    const olayKirilimi = await this.prisma.$queryRaw<
      {
        kaynak: string;
        ortam: string;
        yerlesim: string;
        kampanya: string;
        icerik: string;
        acilis: bigint;
        detay: bigint;
        ilan_gonderimi: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        COALESCE(props->>'utmKaynak', 'dogrudan')   AS kaynak,
        -- utm_medium: ucretli/organik ayrimi. Olay sozlugu bu alani zaten
        -- tasiyordu ama rapor onu hic gruplamiyordu; ayni kampanyanin
        -- reklam ve organik hareketi TEK SATIRDA birlesiyordu.
        COALESCE(props->>'utmOrtam', 'adsiz')         AS ortam,
        COALESCE(props->>'utmYerlesim', 'bilinmiyor') AS yerlesim,
        COALESCE(props->>'utmKampanya', 'bilinmiyor') AS kampanya,
        COALESCE(props->>'utmIcerik', 'bilinmiyor')   AS icerik,
        COUNT(*) FILTER (WHERE name = 'kampanya_acilisi')        AS acilis,
        COUNT(*) FILTER (WHERE name = 'ilan_detay_goruntulendi'
                           AND COALESCE((props->>'kendiIlani')::boolean, false) = false) AS detay,
        COUNT(*) FILTER (WHERE name = 'ilan_gonderildi')         AS ilan_gonderimi
      FROM "AnalyticsEvent"
      WHERE NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
        AND props->>'utmKaynak' IS NOT NULL
        ${kontrolSuzgeci}
      GROUP BY 1, 2, 3, 4, 5
      ORDER BY acilis DESC, detay DESC
      LIMIT 200
    `);

    // ── Hesap kapsami: KAYIT kampanyasi damgasi ──────────────────────
    const hesapKirilimi = await this.prisma.$queryRaw<
      {
        kaynak: string;
        ortam: string;
        kampanya: string;
        icerik: string;
        uyelik: bigint;
        ilk_mesaj: bigint;
        teklif: bigint;
      }[]
    >(Prisma.sql`
      WITH yeni AS (
        SELECT u.id, u."kampanyaKaynak" AS kaynak,
               -- Hesap kapsaminda da ucretli/organik ayrimi: ayni
               -- kampanyadan gelen reklam uyeligiyle organik uyelik ayni
               -- satirda birlesmemeli.
               COALESCE(u."kampanyaOrtam",'adsiz') AS ortam,
               COALESCE(u."kampanyaAdi",'bilinmiyor') AS kampanya,
               COALESCE(u."kampanyaIcerik",'bilinmiyor') AS icerik
        FROM "User" u
        WHERE u."deletedAt" IS NULL
          AND u."kampanyaKaynak" IS NOT NULL
          AND NOT u."isTestAccount"
          AND u.role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
          AND u."createdAt" >= ${ts(baslangic)} AND u."createdAt" < ${ts(bitis)}
      )
      SELECT y.kaynak, y.ortam, y.kampanya, y.icerik,
        COUNT(*) AS uyelik,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Message" m
          JOIN "Conversation" c ON c.id = m."conversationId"
          JOIN "Listing" l ON l.id = c."listingId"
          WHERE m."senderId" = y.id AND m."senderId" <> l."sellerId"
        )) AS ilk_mesaj,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Offer" o WHERE o."buyerId" = y.id
        )) AS teklif
      FROM yeni y
      GROUP BY 1, 2, 3, 4
      ORDER BY uyelik DESC
      LIMIT 100
    `);

    const s = (v: bigint | null | undefined) => Number(v ?? 0);

    /**
     * utm_medium -> trafik turu.
     *
     * Yalnizca bilinen iki deger etiketleniyor. Geriye kalan her sey
     * "belirsiz": gecmis baglantilar tahminle yeniden etiketlenmiyor.
     * Ozellikle organic_social yazilmis ama aslinda reklamda kullanilmis
     * bir baglantiyi "ucretli" diye duzeltmek, olcumun kendisini
     * uydurmak olurdu.
     */
    const trafikTuru = (ortam: string): 'ucretli' | 'organik' | 'belirsiz' => {
      if (ortam === 'paid_social' || ortam === 'cpc' || ortam === 'paid') return 'ucretli';
      if (ortam === 'organic_social' || ortam === 'social' || ortam === 'organic') return 'organik';
      return 'belirsiz';
    };

    // Kaynak bazinda topla. Anahtar (kaynak + trafik turu) ikilisi:
    // Instagram organik ile Instagram reklam ayni satira dusmemeli.
    const kaynakToplami = new Map<
      string,
      { kaynak: string; trafik: string; acilis: number; detay: number; ilan: number }
    >();
    for (const r of olayKirilimi) {
      const trafik = trafikTuru(r.ortam);
      const anahtar = `${r.kaynak}|${trafik}`;
      const t = kaynakToplami.get(anahtar) ?? {
        kaynak: r.kaynak, trafik, acilis: 0, detay: 0, ilan: 0,
      };
      t.acilis += s(r.acilis);
      t.detay += s(r.detay);
      t.ilan += s(r.ilan_gonderimi);
      kaynakToplami.set(anahtar, t);
    }
    const hesapToplami = new Map<
      string,
      { kaynak: string; trafik: string; uyelik: number; mesaj: number; teklif: number }
    >();
    for (const r of hesapKirilimi) {
      const trafik = trafikTuru(r.ortam);
      const anahtar = `${r.kaynak}|${trafik}`;
      const t = hesapToplami.get(anahtar) ?? {
        kaynak: r.kaynak, trafik, uyelik: 0, mesaj: 0, teklif: 0,
      };
      t.uyelik += s(r.uyelik);
      t.mesaj += s(r.ilk_mesaj);
      t.teklif += s(r.teklif);
      hesapToplami.set(anahtar, t);
    }

    // Kaynagi belirlenemeyen UYELIKLER. Hesap kapsaminin paydasi olmadan
    // "kampanyadan 3 uyelik geldi" sayisi tek basina bir sey ifade
    // etmiyor: ayni donemde 40 etiketsiz uyelik varsa resim bambaska.
    const [kaynaksizUyelik] = await this.prisma.$queryRaw<{ adet: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS adet FROM "User" u
      WHERE u."deletedAt" IS NULL
        AND u."kampanyaKaynak" IS NULL
        AND NOT u."isTestAccount"
        AND u.role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
        AND u."createdAt" >= ${ts(baslangic)} AND u."createdAt" < ${ts(bitis)}
    `);

    // Kaynagi belirlenemeyen acilislar: raporda ayri durmali, Instagram ya
    // da Facebook sayilmamali.
    const [kaynaksiz] = await this.prisma.$queryRaw<{ adet: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS adet FROM "AnalyticsEvent"
      WHERE NOT "isStaff" AND name = 'ilan_detay_goruntulendi'
        AND props->>'utmKaynak' IS NULL
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
        ${kontrolSuzgeci}
    `);

    return {
      baslik: 'Sosyal Medya Kaynakları',
      aciklama:
        'Instagram ve Facebook bağlantılarından siteye ulaşan hareketler. Bu bölüm ' +
        'Instagram/Facebook İÇİNDEKİ erişimi, gösterimi veya profil görüntülemesini ÖLÇMEZ — ' +
        'yalnızca siteye gelen tıklamaları ve sonrasını görür.',
      /**
       * Dislama seffafligi: kac kayit, hangi gerekceyle cikarildi.
       * Panelde gorunuyor; yonetici isterse dahil edip bakabiliyor.
       */
      kontrol: {
        uygulandi: kontrolVar && !kontrolDahil,
        dahilEdildi: kontrolDahil,
        cikarilanOlay: Number(kontrolSayim?.adet ?? 0),
        aciklama: kontrolAciklamasi(),
      },
      kurallar: [
        'Ziyaret kapsamı: kampanya ziyaret boyunca yalnızca bellekte taşınır (cihazda saklanmaz). Son açılan kampanya bağlantısı öncekinin yerini alır. Sayfa yenilenince kaynak kaybolur ve "belirlenemedi" olur.',
        'Hesap kapsamı — KAYIT KAMPANYASI: kullanıcı kayıt olurken bellekte hangi kampanya varsa o damgalanır ve değişmez. Bu kişinin siteyi İLK KEZ hangi kaynaktan bulduğu DEĞİLDİR: gerçek ilk ziyaret kaynağı hiçbir yerde saklanmıyor. Kullanıcı önce doğrudan gelip gezinmiş, günler sonra bir reklam bağlantısıyla dönüp kayıt olmuş olabilir; damga o son bağlantıyı gösterir.',
        'Kampanya yalnızca bellekte taşındığı için kayıt akışı sırasında sayfa yenilenirse (ya da e-posta doğrulama bağlantısı yeni bir sekmede açılırsa) damga BOŞ kalır. Bu kayıtlar "kaynak belirlenemedi" olarak durur, tahminle doldurulmaz.',
        'Oranlar yalnızca kendi kapsamı içinde hesaplanır; ziyaret bazlı pay hesap bazlı paydaya bölünmez.',
        'Trafik türü utm_medium etiketinden okunur: paid_social = ücretli, organic_social = organik. Tanınmayan ya da boş bir değer "belirsiz" olarak durur ve tahminle sınıflandırılmaz.',
        'Sitenin TOPLAM açılış sayısı ölçülmüyor: genel bir sayfa görüntüleme olayı yok. Bu yüzden "kampanyaların trafiğin yüzde kaçını getirdiği" bu rapordan hesaplanamaz; yalnızca kampanya etiketli açılışlar ve kaynağı belirlenemeyen olaylar ayrı ayrı sayılır.',
        '"Açılış" bir OLAY sayısıdır — tekil kullanıcı ya da oturum değil. Cihaz kimliği tutulmadığı için tekil kullanıcı ölçülemiyor.',
        'UTM etiketi olmayan ziyaretler Instagram/Facebook sayılmaz; "kaynak belirlenemedi" olarak durur.',
        'Ölçümün başladığı tarihten önceki ziyaretlerin kaynağı bilinmiyor ve tahminle doldurulmuyor.',
      ],
      ziyaret: {
        kapsam: 'ziyaret',
        kaynaklar: [...kaynakToplami.values()]
          .sort((a, b) => b.acilis - a.acilis)
          .map((t) => ({
            kaynak: t.kaynak,
            trafik: t.trafik,
            acilis: t.acilis,
            ilanDetayi: t.detay,
            ilanGonderimi: t.ilan,
            /**
             * DIKKAT: bu bir DONUSUM DEGIL, OLAY ORANI.
             *
             * Pay ve payda ayri olay turleri; ikisi de ziyaret ya da
             * kullanici bazinda birlestirilmiyor (cihaz kimligi
             * tutmuyoruz, oturum kimligi de yok). Tek bir ziyaret
             * birden cok ilan detayi acabilir, dolayisiyla bu oran
             * %100'u ASABILIR. "Acilanlarin su kadari ilana bakti"
             * diye okunamaz; "her acilis basina kac detay
             * goruntulemesi dustu" diye okunur.
             */
            detayOlayOrani: t.acilis >= ASGARI_PAYDA ? t.detay / t.acilis : null,
            yeterliVeri: t.acilis >= ASGARI_PAYDA,
          })),
        kirilim: olayKirilimi.map((r) => ({
          kaynak: r.kaynak,
          ortam: r.ortam,
          trafik: trafikTuru(r.ortam),
          yerlesim: r.yerlesim,
          kampanya: r.kampanya,
          icerik: r.icerik,
          acilis: s(r.acilis),
          ilanDetayi: s(r.detay),
          ilanGonderimi: s(r.ilan_gonderimi),
        })),
        kaynagiBelirsizDetayGoruntuleme: s(kaynaksiz?.adet),
      },
      hesap: {
        kapsam: 'hesap',
        // Ayni donemde kampanya damgasi OLMAYAN uyelik sayisi.
        kaynagiBelirsizUyelik: s(kaynaksizUyelik?.adet),
        kaynaklar: [...hesapToplami.values()]
          .sort((a, b) => b.uyelik - a.uyelik)
          .map((t) => ({
            kaynak: t.kaynak,
            trafik: t.trafik,
            uyelik: t.uyelik,
            ilkMesajGonderen: t.mesaj,
            teklifVeren: t.teklif,
            mesajOrani: t.uyelik >= ASGARI_PAYDA ? t.mesaj / t.uyelik : null,
            yeterliVeri: t.uyelik >= ASGARI_PAYDA,
          })),
        kirilim: hesapKirilimi.map((r) => ({
          kaynak: r.kaynak,
          ortam: r.ortam,
          trafik: trafikTuru(r.ortam),
          kampanya: r.kampanya,
          icerik: r.icerik,
          uyelik: s(r.uyelik),
          ilkMesajGonderen: s(r.ilk_mesaj),
          teklifVeren: s(r.teklif),
        })),
      },
    };
  }

  private async ilkOlayTarihi(): Promise<Date | null> {
    const ilk = await this.prisma.analyticsEvent.findFirst({
      orderBy: { occurredAt: 'asc' },
      select: { occurredAt: true },
    });
    return ilk?.occurredAt ?? null;
  }

  // ── 1. Ilan verme akisi (olay) ────────────────────────────────────────
  /**
   * Bir bolumun OLCUM DURUMU.
   *
   * ── NEDEN GEREKLI ─────────────────────────────────────────────────
   *
   * Panelde "0" ucu birden anlama geliyordu ve ayirt edilemiyordu:
   *
   *   a) gercekten hic olmadi
   *   b) olcum bozuk / olay hic gonderilmiyor
   *   c) bu donem olcum baslamadan oncesine ait
   *
   * Canlida olculdu: `ilan_%` olaylarinin TAMAMI isStaff=true (189 olay,
   * hepsi personel). Yani ilan verme akisindaki 0 "bozuk olcum" degil,
   * "olcum calisiyor ama gercek kullanici hic denememis" demek. Bu ikisi
   * tamamen farkli kararlar gerektiriyor: biri hata ayiklama, digeri
   * urun/pazarlama isi.
   *
   * Ayrimi su sekilde kuruyoruz: ayni olay turunden HIC personel kaydi
   * var mi? Varsa olcum hatti calisiyor demektir.
   */
  /**
   * UYELIK HUNISI.
   *
   * IKI AYRI GORUNUM, bilerek karistirilmiyor:
   *
   *   GIRISIM HUNISI  - secilen donemde BASLAYAN kayit girisimleri ve
   *                     onlarin nereye kadar gittigi. Donemden sonra
   *                     tamamlanan adimlar gozlem suresi icinde ayni
   *                     girisime baglaniyor.
   *   DONEM HAREKETI  - secilen tarihlerde GERCEKLESEN hesap olusturma
   *                     ve dogrulama sayilari. Bunlar ayni kohortun
   *                     donusumu DEGIL ve oyle sunulmuyor.
   *
   * Tarih siniri: baslangic DAHIL, bitis HARIC (half-open), Europe/
   * Istanbul. Boylece ardisik donemler ne bosluk birakiyor ne de
   * ustusuyor.
   */
  private async uyelikHunisi(baslangic: Date, bitis: Date, olgunSinir: Date, ilkOlay: Date | null) {
    // ── GIRISIM HUNISI ──────────────────────────────────────────────
    // Girisim = flowId. Donemde EKRAN GORUNTULEME olayi olan girisimler
    // kohortu olusturuyor; sonraki adimlar gozlem suresi icinde ayni
    // flowId ile bagleniyor.
    const [girisim] = await this.prisma.$queryRaw<{
      ekran: bigint; basladi: bigint; gonderildi: bigint;
      hesap: bigint; dogrulandi: bigint; olgunlasmamis: bigint;
    }[]>(Prisma.sql`
      WITH kohort AS (
        SELECT DISTINCT "flowId", MIN("occurredAt") AS ilk
        FROM "AnalyticsEvent"
        WHERE name = 'uyelik_ekran_goruntulendi' AND NOT "isStaff" AND "flowId" IS NOT NULL
          AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
        GROUP BY "flowId"
      ),
      adim AS (
        SELECT k."flowId", k.ilk,
          BOOL_OR(e.name = 'uyelik_basladi')             AS basladi,
          BOOL_OR(e.name = 'uyelik_gonderildi')          AS gonderildi,
          BOOL_OR(e.name = 'uyelik_hesap_olusturuldu')   AS hesap,
          BOOL_OR(e.name = 'uyelik_eposta_dogrulandi')   AS dogrulandi
        FROM kohort k
        LEFT JOIN "AnalyticsEvent" e
          ON e."flowId" = k."flowId" AND NOT e."isStaff"
         -- Gozlem suresi: girisimden sonraki OLGUNLASMA_SA saat.
         AND e."occurredAt" >= k.ilk
         AND e."occurredAt" < k.ilk + (${OLGUNLASMA_SA} || ' hours')::interval
        GROUP BY k."flowId", k.ilk
      )
      SELECT COUNT(*) AS ekran,
             COUNT(*) FILTER (WHERE basladi)    AS basladi,
             COUNT(*) FILTER (WHERE gonderildi) AS gonderildi,
             COUNT(*) FILTER (WHERE hesap)      AS hesap,
             COUNT(*) FILTER (WHERE dogrulandi) AS dogrulandi,
             -- Gozlem suresini henuz doldurmamis girisimler: "birakti"
             -- denemez, daha vakti var.
             COUNT(*) FILTER (WHERE ilk > ${ts(olgunSinir)}) AS olgunlasmamis
      FROM adim
    `);

    // ── DONEM HAREKETLERI (veritabani gercegi) ──────────────────────
    const [hareket] = await this.prisma.$queryRaw<{
      hesap: bigint; dogrulama_gerekli: bigint; dogrulanan: bigint;
      bekleyen: bigint; iliskisiz: bigint;
      medyan_saat: number | null; ornek: bigint;
    }[]>(Prisma.sql`
      WITH yeni AS (
        SELECT id, "createdAt", "emailVerifiedAt", "kayitYontemi", "kayitGirisimId"
        FROM "User"
        WHERE "deletedAt" IS NULL
          AND NOT "isTestAccount"
          AND role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
          AND "createdAt" >= ${ts(baslangic)} AND "createdAt" < ${ts(bitis)}
      )
      SELECT
        COUNT(*) AS hesap,
        -- Google hesaplari ayrica dogrulama GEREKTIRMIYOR; huni kaybi
        -- gibi sayilmamalari icin paydadan cikariliyor.
        COUNT(*) FILTER (WHERE COALESCE("kayitYontemi",'form') <> 'google') AS dogrulama_gerekli,
        COUNT(*) FILTER (WHERE COALESCE("kayitYontemi",'form') <> 'google'
                           AND "emailVerifiedAt" IS NOT NULL) AS dogrulanan,
        COUNT(*) FILTER (WHERE COALESCE("kayitYontemi",'form') <> 'google'
                           AND "emailVerifiedAt" IS NULL) AS bekleyen,
        COUNT(*) FILTER (WHERE "kayitGirisimId" IS NULL) AS iliskisiz,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM ("emailVerifiedAt" - "createdAt")) / 3600.0
        ) FILTER (WHERE "emailVerifiedAt" IS NOT NULL) AS medyan_saat,
        COUNT(*) FILTER (WHERE "emailVerifiedAt" IS NOT NULL) AS ornek
      FROM yeni
    `);

    /** Dogrulama bekleyenlerin yas araliklari. */
    const bekleyenYas = await this.prisma.$queryRaw<{ aralik: string; adet: bigint }[]>(Prisma.sql`
      SELECT CASE
               WHEN now() - "createdAt" < interval '1 hour'  THEN '0-1 saat'
               WHEN now() - "createdAt" < interval '24 hours' THEN '1-24 saat'
               WHEN now() - "createdAt" < interval '7 days'   THEN '1-7 gün'
               ELSE '7+ gün'
             END AS aralik,
             COUNT(*) AS adet
      FROM "User"
      WHERE "deletedAt" IS NULL AND NOT "isTestAccount"
        AND role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
        AND "emailVerifiedAt" IS NULL
        AND COALESCE("kayitYontemi",'form') <> 'google'
      GROUP BY 1
    `);

    /** Mail durumlari ve yeniden gonderim. */
    const mailDurum = await this.prisma.$queryRaw<{ durum: string; tekrar: boolean; adet: bigint }[]>(Prisma.sql`
      SELECT COALESCE(props->>'durum','bilinmiyor') AS durum,
             COALESCE((props->>'tekrar')::boolean, false) AS tekrar,
             COUNT(*) AS adet
      FROM "AnalyticsEvent"
      WHERE name = 'uyelik_dogrulama_maili' AND NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
      GROUP BY 1,2 ORDER BY adet DESC
    `);

    /** Kampanya ve yontem kirilimi — hesap bazinda, VERITABANINDAN. */
    const kirilim = await this.prisma.$queryRaw<{
      kaynak: string; ortam: string; kampanya: string; icerik: string;
      yontem: string; hesap: bigint; dogrulanan: bigint;
    }[]>(Prisma.sql`
      SELECT COALESCE("kampanyaKaynak",'(belirlenemedi)') AS kaynak,
             COALESCE("kampanyaOrtam",'-')   AS ortam,
             COALESCE("kampanyaAdi",'-')     AS kampanya,
             COALESCE("kampanyaIcerik",'-')  AS icerik,
             COALESCE("kayitYontemi",'form') AS yontem,
             COUNT(*) AS hesap,
             COUNT(*) FILTER (WHERE "emailVerifiedAt" IS NOT NULL) AS dogrulanan
      FROM "User"
      WHERE "deletedAt" IS NULL AND NOT "isTestAccount"
        AND role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
        AND "createdAt" >= ${ts(baslangic)} AND "createdAt" < ${ts(bitis)}
      GROUP BY 1,2,3,4,5 ORDER BY hesap DESC LIMIT 30
    `);

    const n = (v: bigint | null | undefined) => Number(v ?? 0);
    const hataKodlari = await this.prisma.$queryRaw<{ kod: string; adet: bigint }[]>(Prisma.sql`
      SELECT COALESCE(props->>'kod','bilinmiyor') AS kod, COUNT(*) AS adet
      FROM "AnalyticsEvent"
      WHERE name = 'uyelik_hatasi' AND NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
      GROUP BY 1 ORDER BY adet DESC LIMIT 8
    `);

    return {
      baslik: 'Üyelik hunisi',
      kaynak: 'karma' as MetrikKaynagi,
      aciklama:
        'İki ayrı görünüm: GİRİŞİM HUNİSİ dönemde başlayan kayıt girişimlerini izler; ' +
        'DÖNEM HAREKETİ seçilen tarihlerde gerçekleşen hesap/doğrulama sayılarıdır. ' +
        'İkisi aynı kohort değildir ve birbirine bölünmez. Tarih sınırı: başlangıç dahil, ' +
        'bitiş hariç, Europe/Istanbul.',
      girisimHunisi: {
        adimlar: [
          { adim: 1, etiket: 'Kayıt ekranı görüntülendi', adet: n(girisim?.ekran), kapsam: 'girişim' },
          { adim: 2, etiket: 'Kayıt başladı (ilk anlamlı etkileşim)', adet: n(girisim?.basladi), kapsam: 'girişim' },
          { adim: 3, etiket: 'Form gönderildi', adet: n(girisim?.gonderildi), kapsam: 'girişim' },
          { adim: 4, etiket: 'Hesap oluşturuldu (sunucu)', adet: n(girisim?.hesap), kapsam: 'girişim' },
          { adim: 5, etiket: 'E-posta doğrulandı (sunucu)', adet: n(girisim?.dogrulandi), kapsam: 'girişim' },
        ],
        olgunlasmamis: n(girisim?.olgunlasmamis),
        gozlemSaati: OLGUNLASMA_SA,
        not:
          `Girişim = tek bir kayıt denemesi (flowId). Sonraki adımlar girişimden itibaren ` +
          `${OLGUNLASMA_SA} saatlik gözlem süresi içinde aynı girişime bağlanır. Gözlem süresini ` +
          `doldurmamış girişimler "henüz tamamlanmadı"dır; "bıraktı" DEĞİLDİR.`,
      },
      donemHareketi: {
        hesap: n(hareket?.hesap),
        dogrulamaGerekli: n(hareket?.dogrulama_gerekli),
        dogrulanan: n(hareket?.dogrulanan),
        bekleyen: n(hareket?.bekleyen),
        iliskilendirilemeyen: n(hareket?.iliskisiz),
        medyanSaat: hareket?.medyan_saat ?? null,
        medyanOrnek: n(hareket?.ornek),
        bekleyenYas: bekleyenYas.map((b) => ({ aralik: b.aralik, adet: n(b.adet) })),
        not:
          'Bu sayılar seçilen tarihlerde GERÇEKLEŞEN hareketlerdir; aynı dönem kohortunun ' +
          'dönüşümü değildir. Google ile açılan hesaplar ayrıca e-posta doğrulaması ' +
          'gerektirmediği için doğrulama paydasına girmez — huni kaybı sayılmazlar.',
      },
      mailDurumlari: mailDurum.map((m) => ({ durum: m.durum, tekrar: m.tekrar, adet: n(m.adet) })),
      mailNotu:
        'Sağlayıcının kabul etmesi TESLİM EDİLDİ demek değildir. Resend webhook\'u kurulu ' +
        'olmadığı için teslim, bounce ve şikâyet durumu BİLİNMİYOR. Açılma pikseli yok; ' +
        'spam klasörüne düşmeyi bu olaylardan ölçtüğümüzü iddia etmiyoruz.',
      hataKodlari: hataKodlari.map((h) => ({ kod: h.kod, adet: n(h.adet) })),
      kirilim: kirilim.map((k) => ({
        kaynak: k.kaynak, ortam: k.ortam, kampanya: k.kampanya, icerik: k.icerik,
        yontem: k.yontem, hesap: n(k.hesap), dogrulanan: n(k.dogrulanan),
      })),
      metrikler: [] as Metrik[],
    };
  }

  private async olcumDurumu(
    olayAdlari: string[],
    baslangic: Date,
    bitis: Date,
    ilkOlay: Date | null,
  ) {
    const [satir] = await this.prisma.$queryRaw<
      { donem_gercek: bigint; donem_personel: bigint; hic_toplam: bigint }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE NOT "isStaff"
          AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}) AS donem_gercek,
        COUNT(*) FILTER (WHERE "isStaff"
          AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}) AS donem_personel,
        COUNT(*) AS hic_toplam
      FROM "AnalyticsEvent"
      WHERE name = ANY(${olayAdlari}::text[])
    `);

    const gercek = Number(satir?.donem_gercek ?? 0);
    const personel = Number(satir?.donem_personel ?? 0);
    const hicToplam = Number(satir?.hic_toplam ?? 0);

    // Donem tamamen olcum baslangicindan onceyse hicbir sey beklenemez.
    const donemOncesi = !!ilkOlay && bitis <= ilkOlay;

    let durum: 'veri_var' | 'gercek_sifir' | 'olcum_dogrulanamadi' | 'donem_oncesi';
    let aciklama: string;

    if (donemOncesi) {
      durum = 'donem_oncesi';
      aciklama = 'Bu dönem ölçümün başladığı tarihten önce. Veri yokluğu bir sonuç değil.';
    } else if (gercek > 0) {
      durum = 'veri_var';
      aciklama = `Dönemde ${gercek} gerçek kullanıcı olayı kaydedildi.`;
    } else if (personel > 0 || hicToplam > 0) {
      durum = 'gercek_sifir';
      aciklama =
        `Ölçüm çalışıyor — bu olay türünden toplam ${hicToplam} kayıt var` +
        (personel > 0 ? ` (dönemde ${personel}'i personel/test)` : '') +
        `. Dönemde gerçek kullanıcıdan hiç gelmedi: bu GERÇEK bir sıfır, bozuk ölçüm değil.`;
    } else {
      durum = 'olcum_dogrulanamadi';
      aciklama =
        'Bu olay türünden hiç kayıt yok — ne gerçek kullanıcıdan ne personelden. ' +
        'Ölçümün çalıştığı doğrulanamıyor; sıfır olarak yorumlanmamalı.';
    }

    return { durum, aciklama, donemdeGercek: gercek, donemdePersonel: personel, hicZamanToplam: hicToplam };
  }

  private async ilanAkisi(baslangic: Date, bitis: Date) {
    // Akislar once girisimlere katlaniyor (AKIS_BOSLUK_DK), sonra her
    // girisimin ulastigi en yuksek adim ve gonderip gonderemedigi cikariliyor.
    // userId NULL olan akis yok - ilan vermek oturum aciyor gerektiriyor -
    // ama yine de dislaniyor, yoksa tum anonimler tek kullanici gibi
    // katlanirdi.
    const satirlar = await this.prisma.$queryRaw<
      {
        gk: string;
        enyuksekadim: number;
        gonderildi: boolean;
        fotohata: boolean;
        formhata: boolean;
      }[]
    >(Prisma.sql`
      WITH akis AS (
        SELECT "flowId", "userId", MIN("occurredAt") AS basladi
        FROM "AnalyticsEvent"
        WHERE name = 'ilan_akis_basladi'
          AND NOT "isStaff"
          AND "userId" IS NOT NULL
          AND "occurredAt" >= ${ts(baslangic)}
          AND "occurredAt" < ${ts(bitis)}
        GROUP BY "flowId", "userId"
      ),
      isaretli AS (
        SELECT a.*,
          CASE
            WHEN LAG(basladi) OVER (PARTITION BY "userId" ORDER BY basladi) IS NULL
              OR basladi - LAG(basladi) OVER (PARTITION BY "userId" ORDER BY basladi)
                 > (${AKIS_BOSLUK_DK} || ' minutes')::interval
            THEN 1 ELSE 0
          END AS yeni
        FROM akis a
      ),
      girisim AS (
        SELECT i.*, SUM(yeni) OVER (PARTITION BY "userId" ORDER BY basladi) AS no
        FROM isaretli i
      ),
      esleme AS (
        SELECT "flowId", basladi, "userId" || ':' || no AS gk FROM girisim
      )
      SELECT m.gk AS gk,
        COALESCE(MAX(CASE WHEN e.name = 'ilan_adim_tamamlandi'
                          THEN (e.props->>'adim')::int END), 0) AS enyuksekadim,
        BOOL_OR(e.name = 'ilan_gonderildi')  AS gonderildi,
        BOOL_OR(e.name = 'ilan_foto_hata')   AS fotohata,
        BOOL_OR(e.name = 'ilan_form_hatasi') AS formhata
      FROM esleme m
      JOIN "AnalyticsEvent" e
        ON e."flowId" = m."flowId"
       AND NOT e."isStaff"
       AND e."occurredAt" >= m.basladi
       AND e."occurredAt" < m.basladi + (${AKIS_PENCERE_SA} || ' hours')::interval
      GROUP BY m.gk
    `);

    const girisim = satirlar.length;
    const gonderilen = satirlar.filter((s) => s.gonderildi).length;

    // Adim 4 (Fiyat) "tamamlandi" olayi uretmiyor - o adimda gonder dugmesi
    // var. Dolayisiyla 4. adimin tamamlanmasi = ilanin gonderilmesi.
    const ADIMLAR = ['Kategori', 'Fotograflar', 'Detaylar', 'Fiyat'];
    const adimlar = ADIMLAR.map((etiket, i) => {
      const n = i + 1;
      const ulasan = satirlar.filter((s) => s.enyuksekadim >= n - 1).length;
      const tamamlayan =
        n === 4 ? gonderilen : satirlar.filter((s) => s.enyuksekadim >= n).length;
      return {
        adim: n,
        etiket,
        ulasan,
        tamamlayan,
        birakan: ulasan - tamamlayan,
        oran: ulasan >= ASGARI_PAYDA ? tamamlayan / ulasan : null,
        yeterliVeri: ulasan >= ASGARI_PAYDA,
      };
    });

    // Yukleme denemesi bazinda foto hata orani: istemci her denemede ya
    // basari ya hata olayi uretiyor, ikisinin toplami deneme sayisi.
    const [fotoBasari, fotoHata, formHataSayisi] = await Promise.all([
      this.olaySayisi('ilan_foto_yuklendi', baslangic, bitis),
      this.olaySayisi('ilan_foto_hata', baslangic, bitis),
      this.olaySayisi('ilan_form_hatasi', baslangic, bitis),
    ]);

    const hataKirilimi = await this.prisma.$queryRaw<{ alan: string; adet: bigint }[]>(Prisma.sql`
      SELECT COALESCE(props->>'alan', 'bilinmiyor') AS alan, COUNT(*) AS adet
      FROM "AnalyticsEvent"
      WHERE name = 'ilan_form_hatasi' AND NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
      GROUP BY 1 ORDER BY adet DESC LIMIT 8
    `);

    const fotoKirilimi = await this.prisma.$queryRaw<{ kod: string; adet: bigint }[]>(Prisma.sql`
      SELECT COALESCE(props->>'hataKodu', 'bilinmiyor') AS kod, COUNT(*) AS adet
      FROM "AnalyticsEvent"
      WHERE name = 'ilan_foto_hata' AND NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
      GROUP BY 1 ORDER BY adet DESC LIMIT 8
    `);

    /**
     * Form ONCESI adimlar.
     *
     * Eski huni formun acilmasiyla basliyordu; oysa "ilan ver"e basan
     * kullanicinin onunde uc ayri kapi var: giris, T.C. kimlik ve yarim
     * kalmis taslak. Bu kapilarda kaybedilenler olculmedigi surece
     * tamamlama orani oldugundan iyi gorunuyordu - cunku paydaya hic
     * girmiyorlardi.
     *
     * Olay bazli sayilar; girisim bazli DEGIL. Aralarinda yuzde
     * basilmiyor cunku kapilar ayni kisiye hepsi birden uygulanmiyor:
     * uye kullanici giris kapisini hic gormez, numarasi kayitli olan
     * kimlik kapisini gormez.
     */
    const [on] = await this.prisma.$queryRaw<{
      sayfa: bigint; sayfa_uye: bigint; sayfa_misafir: bigint;
      giris_gerekti: bigint; girisden_donuldu: bigint;
      kimlik_gerekti: bigint; kimlik_tamamlandi: bigint; kimlik_hatasi: bigint;
      taslak_soruldu: bigint; form_acildi: bigint;
      form_taslak: bigint; form_yeni: bigint; form_taslaksiz: bigint;
    }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE name = 'ilan_sayfasi_acildi') AS sayfa,
        COUNT(*) FILTER (WHERE name = 'ilan_sayfasi_acildi'
                           AND COALESCE((props->>'uyeMi')::boolean, false) = true)  AS sayfa_uye,
        COUNT(*) FILTER (WHERE name = 'ilan_sayfasi_acildi'
                           AND COALESCE((props->>'uyeMi')::boolean, true)  = false) AS sayfa_misafir,
        COUNT(*) FILTER (WHERE name = 'ilan_giris_gerekti')     AS giris_gerekti,
        COUNT(*) FILTER (WHERE name = 'ilan_girisden_donuldu')  AS girisden_donuldu,
        COUNT(*) FILTER (WHERE name = 'ilan_kimlik_gerekti')    AS kimlik_gerekti,
        COUNT(*) FILTER (WHERE name = 'ilan_kimlik_tamamlandi') AS kimlik_tamamlandi,
        COUNT(*) FILTER (WHERE name = 'ilan_kimlik_hatasi')     AS kimlik_hatasi,
        COUNT(*) FILTER (WHERE name = 'ilan_taslak_soruldu')    AS taslak_soruldu,
        COUNT(*) FILTER (WHERE name = 'ilan_form_acildi')       AS form_acildi,
        COUNT(*) FILTER (WHERE name = 'ilan_form_acildi' AND props->>'kaynak' = 'taslak')    AS form_taslak,
        COUNT(*) FILTER (WHERE name = 'ilan_form_acildi' AND props->>'kaynak' = 'yeni')      AS form_yeni,
        COUNT(*) FILTER (WHERE name = 'ilan_form_acildi' AND props->>'kaynak' = 'taslaksiz') AS form_taslaksiz
      FROM "AnalyticsEvent"
      WHERE NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
    `);
    const n = (v: bigint | undefined) => Number(v ?? 0);

    return {
      baslik: 'Ilan verme akisi',
      kaynak: 'olay' as MetrikKaynagi,
      aciklama:
        'Formun hangi adiminda birakildigi baska hicbir tabloda iz birakmiyor; bu bolum tamamen olay kaydina dayanir ve olcumun kuruldugu tarihten oncesi icin bostur.',
      metrikler: [
        oranMetrigi(
          'Baslangic -> basarili gonderim',
          'Pay: ilani sunucuya basariyla gonderen girisim sayisi. Payda: formu acan girisim sayisi. Dugmeye tiklama degil, sunucunun islemi tamamlamasi sayilir.',
          gonderilen,
          girisim,
          'olay',
        ),
        oranMetrigi(
          'Fotograf yukleme hata orani',
          'Pay: basarisiz yukleme olayi. Payda: tum yukleme denemeleri (basarili + basarisiz). Olay bazlidir, girisim bazli degil.',
          Number(fotoHata),
          Number(fotoBasari) + Number(fotoHata),
          'olay',
        ),
        oranMetrigi(
          'Form hatasi goren girisim orani',
          'Pay: en az bir dogrulama hatasi goren girisim. Payda: formu acan girisim sayisi. Yalnizca alan adi ve hata kodu kaydedilir, girilen deger kaydedilmez.',
          satirlar.filter((s) => s.formhata).length,
          girisim,
          'olay',
        ),
        sayiMetrigi('Form dogrulama hatasi (olay)', 'Donemdeki toplam dogrulama hatasi olayi sayisi.', Number(formHataSayisi), 'olay'),
      ],
      adimlar,
      onAdimlar: {
        sayfa: n(on?.sayfa),
        sayfaUye: n(on?.sayfa_uye),
        sayfaMisafir: n(on?.sayfa_misafir),
        girisGerekti: n(on?.giris_gerekti),
        girisdenDonuldu: n(on?.girisden_donuldu),
        kimlikGerekti: n(on?.kimlik_gerekti),
        kimlikTamamlandi: n(on?.kimlik_tamamlandi),
        kimlikHatasi: n(on?.kimlik_hatasi),
        taslakSoruldu: n(on?.taslak_soruldu),
        formAcildi: n(on?.form_acildi),
        taslakKirilimi: {
          taslak: n(on?.form_taslak),
          yeni: n(on?.form_yeni),
          taslaksiz: n(on?.form_taslaksiz),
        },
        not:
          'Olay bazli sayilar. Kapilar herkese uygulanmadigi icin (uye giris kapisini, numarasi kayitli olan kimlik kapisini gormez) aralarinda yuzde hesaplanmiyor.',
      },
      hataKirilimi: hataKirilimi.map((h) => ({ alan: h.alan, adet: Number(h.adet) })),
      fotoKirilimi: fotoKirilimi.map((h) => ({ kod: h.kod, adet: Number(h.adet) })),
    };
  }


  /**
   * Onceki esit donemle karsilastirma.
   *
   * ── NEDEN AYRI BIR SORGU ──────────────────────────────────────────
   *
   * "Son 7 gunde 12 ilan" tek basina hicbir sey soylemiyor: cok mu az,
   * iyi mi? Anlam kazanmasi icin bir onceki esit uzunluktaki donem
   * gerekiyor. Esit uzunluk sart - 7 gunu 30 gunle karsilastirmak
   * sayilari oldugundan kotu gosterirdi.
   *
   * ── NEDEN YALNIZCA BIRKAC SAYI ────────────────────────────────────
   *
   * Her metrigin yanina yuzde koymak cazip ama yaniltici: payda kucukken
   * (bu sitede cogu zaman oyle) "%200 artis" iki olaydan alti olaya
   * cikmak demek. Bu yuzden yalnizca basliga cikan, veritabanindan
   * gelen ve payda buyudukce anlamlanan sayilar karsilastiriliyor;
   * ASGARI_PAYDA'nin altinda kalan degisim orani `null` donuyor ve
   * panelde yuzde yerine ham fark gosteriliyor.
   *
   * Olay tabanli satirlar, ONCEKI donem olcumun kuruldugu tarihten
   * onceyse "olculemez" isaretleniyor - sifir gibi gosterip "her sey
   * dusmus" dedirtmek, en kotu rapor hatasi olurdu.
   */
  private async donemKarsilastirmasi(baslangic: Date, bitis: Date, ilkOlay: Date | null) {
    const uzunlukMs = bitis.getTime() - baslangic.getTime();
    const oncekiBaslangic = new Date(baslangic.getTime() - uzunlukMs);
    const oncekiBitis = baslangic;

    /** Olay tabanli satir, onceki donemde olculebilir miydi? */
    const olayOlculebilir = !!ilkOlay && ilkOlay.getTime() <= oncekiBaslangic.getTime();

    const pencere = async (b: Date, s: Date) => {
      const [[r], [a]] = await Promise.all([
        this.prisma.$queryRaw<{ hesap: bigint; ilan: bigint; mesaj: bigint }[]>(Prisma.sql`
          SELECT
            (SELECT COUNT(*) FROM "User" u
               WHERE u."deletedAt" IS NULL AND NOT u."isTestAccount"
                 AND u.role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
                 AND u."createdAt" >= ${ts(b)} AND u."createdAt" < ${ts(s)}) AS hesap,
            (SELECT COUNT(*) FROM "Listing" l
               JOIN "User" u ON u.id = l."sellerId"
               WHERE NOT u."isTestAccount"
                 AND u.role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
                 AND l."createdAt" >= ${ts(b)} AND l."createdAt" < ${ts(s)}) AS ilan,
            (SELECT COUNT(*) FROM "Message" m
               JOIN "User" u ON u.id = m."senderId"
               WHERE NOT u."isTestAccount"
                 AND u.role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
                 AND m."createdAt" >= ${ts(b)} AND m."createdAt" < ${ts(s)}) AS mesaj
        `),
        this.prisma.$queryRaw<{ arama: bigint; ilan_sayfasi: bigint }[]>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE name = 'arama_yapildi')       AS arama,
            COUNT(*) FILTER (WHERE name = 'ilan_sayfasi_acildi') AS ilan_sayfasi
          FROM "AnalyticsEvent"
          WHERE NOT "isStaff"
            AND "occurredAt" >= ${ts(b)} AND "occurredAt" < ${ts(s)}
        `),
      ]);
      return {
        hesap: Number(r?.hesap ?? 0),
        ilan: Number(r?.ilan ?? 0),
        mesaj: Number(r?.mesaj ?? 0),
        arama: Number(a?.arama ?? 0),
        ilanSayfasi: Number(a?.ilan_sayfasi ?? 0),
      };
    };

    const [simdi, onceki] = await Promise.all([
      pencere(baslangic, bitis),
      pencere(oncekiBaslangic, oncekiBitis),
    ]);

    const satir = (
      anahtar: keyof typeof simdi,
      etiket: string,
      kaynak: MetrikKaynagi,
    ) => {
      const olculebilir = kaynak === 'olay' ? olayOlculebilir : true;
      const s = simdi[anahtar];
      const o = onceki[anahtar];
      return {
        etiket,
        kaynak,
        simdi: s,
        onceki: olculebilir ? o : null,
        fark: olculebilir ? s - o : null,
        // Yuzde yalnizca payda anlamliyken; kucuk sayilarda ham fark
        // dogruyu daha iyi anlatiyor.
        degisim: olculebilir && o >= ASGARI_PAYDA ? (s - o) / o : null,
        olculebilir,
      };
    };

    return {
      onceki: { baslangic: oncekiBaslangic.toISOString(), bitis: oncekiBitis.toISOString() },
      gun: Math.round(uzunlukMs / 86_400_000),
      satirlar: [
        satir('hesap', 'Yeni hesap', 'veritabani'),
        satir('ilan', 'Yayinlanan ilan', 'veritabani'),
        satir('mesaj', 'Gonderilen mesaj', 'veritabani'),
        satir('arama', 'Arama', 'olay'),
        satir('ilanSayfasi', 'Ilan verme sayfasi acilisi', 'olay'),
      ],
      not: olayOlculebilir
        ? 'Onceki donem esit uzunlukta ve hemen oncesinde. Yuzde yalnizca onceki donem degeri ' +
          ASGARI_PAYDA +
          "'den buyukse hesaplaniyor; altinda ham fark gosteriliyor."
        : 'Olay tabanli satirlar onceki donemde henuz olculmuyordu; sifir gibi gosterilmiyor, "olculemez" isaretleniyor.',
    };
  }

  private async olaySayisi(name: string, baslangic: Date, bitis: Date): Promise<number> {
    return this.prisma.analyticsEvent.count({
      where: { name, isStaff: false, occurredAt: { gte: baslangic, lt: bitis } },
    });
  }

  // ── 2. Moderasyon (veritabani) ────────────────────────────────────────
  private async moderasyon(baslangic: Date, bitis: Date, olgunSinir: Date) {
    // Personel ilanlari disarida: kendi test ilanlarimiz yayin oranini
    // sisirir.
    const personelVeya = Prisma.sql`l."sellerId" IN (
      SELECT id FROM "User" WHERE role IN ('ADMIN','SUPER_ADMIN','MODERATOR')
    )`;

    const [satir] = await this.prisma.$queryRaw<
      {
        gonderilen: bigint;
        olgun: bigint;
        olgunyayinlanan: bigint;
        reddedilen: bigint;
        beklemede: bigint;
        medyansaat: number | null;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) AS gonderilen,
        COUNT(*) FILTER (WHERE l."createdAt" < ${ts(olgunSinir)}) AS olgun,
        COUNT(*) FILTER (WHERE l."createdAt" < ${ts(olgunSinir)} AND l."publishedAt" IS NOT NULL) AS olgunyayinlanan,
        COUNT(*) FILTER (WHERE l.status = 'REJECTED') AS reddedilen,
        COUNT(*) FILTER (WHERE l."publishedAt" IS NULL AND l.status = 'PENDING_REVIEW') AS beklemede,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (l."publishedAt" - l."createdAt")) / 3600.0
        ) FILTER (WHERE l."publishedAt" IS NOT NULL) AS medyansaat
      FROM "Listing" l
      WHERE l."deletedAt" IS NULL
        AND l."createdAt" >= ${ts(baslangic)} AND l."createdAt" < ${ts(bitis)}
        AND NOT (${personelVeya})
    `);

    // Ret nedeni kirilimi. Kod girilmemis eski retler NULL; onlari ayri bir
    // satir olarak gosteriyoruz, "diger"e yikmak gecmisi uydurmak olurdu.
    const retKirilimi = await this.prisma.$queryRaw<{ kod: string; adet: bigint }[]>(Prisma.sql`
      SELECT COALESCE(l."rejectionReason", 'kod-girilmemis') AS kod, COUNT(*) AS adet
      FROM "Listing" l
      WHERE l."deletedAt" IS NULL
        AND l.status = 'REJECTED'
        AND l."createdAt" >= ${ts(baslangic)} AND l."createdAt" < ${ts(bitis)}
        AND NOT (${personelVeya})
      GROUP BY 1 ORDER BY adet DESC LIMIT 12
    `);

    const g = Number(satir?.gonderilen ?? 0);
    const olgun = Number(satir?.olgun ?? 0);
    const yayin = Number(satir?.olgunyayinlanan ?? 0);

    return {
      baslik: 'Gonderim -> yayin (moderasyon)',
      kaynak: 'veritabani' as MetrikKaynagi,
      aciklama:
        'Listing tablosundan hesaplanir; olay kaydi gerekmez, bu yuzden olcum oncesi donemler icin de dogrudur. Ilanin gonderilmesi ile yayina alinmasi bilerek ayri gosterilir.',
      metrikler: [
        sayiMetrigi('Gonderilen ilan', 'Donemde olusturulan, silinmemis ilan sayisi (personel hesaplari haric).', g, 'veritabani'),
        oranMetrigi(
          'Gonderilen -> yayina alinan',
          `Pay: yayina alinmis ilan. Payda: ${OLGUNLASMA_SA} saatten once gonderilmis ilanlar. Yeni gonderilenler paydada yok; moderasyon suresi dolmadan "yayinlanmadi" saymak orani yanlis gosterir.`,
          yayin,
          olgun,
          'veritabani',
        ),
        sayiMetrigi('Hala onay bekleyen', 'Donemde gonderilmis ve su an PENDING_REVIEW olan ilan sayisi.', Number(satir?.beklemede ?? 0), 'veritabani'),
        sayiMetrigi(
          'Reddedilen',
          'Donemde gonderilip reddedilen ilan sayisi. Neden kirilimi asagida.',
          Number(satir?.reddedilen ?? 0),
          'veritabani',
          'Neden kodu alani eklenmeden once reddedilen ilanlar kirilimda "kod-girilmemis" olarak gorunur; geriye donuk tahminle doldurulmadi.',
        ),
        sureMetrigi(
          'Medyan yayina alinma suresi',
          'Yayina alinmis ilanlarda publishedAt - createdAt degerlerinin medyani (saat).',
          satir?.medyansaat ?? null,
          yayin,
          'veritabani',
        ),
      ],
      retKirilimi: retKirilimi.map((r) => ({ kod: r.kod, adet: Number(r.adet) })),
    };
  }

  // ── 3. Arama ve kesif (olay) ──────────────────────────────────────────
  private async aramaAkisi(baslangic: Date, bitis: Date) {
    const [satir] = await this.prisma.$queryRaw<
      { arama: bigint; sifir: bigint; metinli: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(*) AS arama,
             COUNT(*) FILTER (WHERE (props->>'sifirSonuc')::boolean) AS sifir,
             COUNT(*) FILTER (WHERE (props->>'metinVar')::boolean) AS metinli
      FROM "AnalyticsEvent"
      WHERE name = 'arama_yapildi' AND NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
    `);

    const tiklama = await this.olaySayisi('arama_sonuc_tiklandi', baslangic, bitis);

    const filtreler = await this.prisma.$queryRaw<{ filtre: string; adet: bigint }[]>(Prisma.sql`
      SELECT f AS filtre, COUNT(*) AS adet
      FROM "AnalyticsEvent" e,
           LATERAL jsonb_array_elements_text(COALESCE(e.props->'filtreler', '[]'::jsonb)) AS f
      WHERE e.name = 'arama_yapildi' AND NOT e."isStaff"
        AND e."occurredAt" >= ${ts(baslangic)} AND e."occurredAt" < ${ts(bitis)}
      GROUP BY 1 ORDER BY adet DESC LIMIT 12
    `);

    /**
     * SONUCSUZ ARAMA KIRILIMLARI.
     *
     * Olay zaten `kategori`, `filtreler` ve `sonucSayisi` tasiyordu; eksik
     * olan yalnizca raporlamaydi. Serbest arama METNI hicbir yerde
     * saklanmiyor - mevcut gizlilik yaklasimi aynen korunuyor.
     *
     * Her kirilimda TOPLAM arama ve SONUCSUZ arama birlikte donuyor:
     * tek basina "bu kategoride 5 sonucsuz arama" bir sey ifade etmiyor,
     * o kategoride toplam 6 arama mi yoksa 600 mu oldugu belirleyici.
     */
    const kategoriKirilimi = await this.prisma.$queryRaw<
      { kategori: string; toplam: bigint; sifir: bigint }[]
    >(Prisma.sql`
      SELECT COALESCE(NULLIF(props->>'kategori',''), '(kategorisiz)') AS kategori,
             COUNT(*) AS toplam,
             COUNT(*) FILTER (WHERE (props->>'sifirSonuc')::boolean) AS sifir
      FROM "AnalyticsEvent"
      WHERE name = 'arama_yapildi' AND NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
      GROUP BY 1 HAVING COUNT(*) FILTER (WHERE (props->>'sifirSonuc')::boolean) > 0
      ORDER BY sifir DESC, toplam DESC LIMIT 15
    `);

    /** Filtre turu bazinda: hangi filtreler sonucu bosaltiyor? */
    const filtreSifir = await this.prisma.$queryRaw<
      { filtre: string; toplam: bigint; sifir: bigint }[]
    >(Prisma.sql`
      SELECT f AS filtre,
             COUNT(*) AS toplam,
             COUNT(*) FILTER (WHERE (e.props->>'sifirSonuc')::boolean) AS sifir
      FROM "AnalyticsEvent" e,
           LATERAL jsonb_array_elements_text(COALESCE(e.props->'filtreler', '[]'::jsonb)) AS f
      WHERE e.name = 'arama_yapildi' AND NOT e."isStaff"
        AND e."occurredAt" >= ${ts(baslangic)} AND e."occurredAt" < ${ts(bitis)}
      GROUP BY 1 HAVING COUNT(*) FILTER (WHERE (e.props->>'sifirSonuc')::boolean) > 0
      ORDER BY sifir DESC LIMIT 12
    `);

    /**
     * Filtreli / filtresiz ayrimi ve sonuc sayisi araligi.
     * "0 sonuc" ile "1-3 sonuc" ayri sorunlar: ilki envanter yoklugu,
     * ikincisi secenek darligi.
     */
    const [bicimler] = await this.prisma.$queryRaw<
      {
        filtresiz_toplam: bigint; filtresiz_sifir: bigint;
        filtreli_toplam: bigint; filtreli_sifir: bigint;
        metinli_toplam: bigint; metinli_sifir: bigint;
        az_sonuc: bigint; bol_sonuc: bigint;
      }[]
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(props->'filtreler'),0) = 0) AS filtresiz_toplam,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(props->'filtreler'),0) = 0
                           AND (props->>'sifirSonuc')::boolean) AS filtresiz_sifir,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(props->'filtreler'),0) > 0) AS filtreli_toplam,
        COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(props->'filtreler'),0) > 0
                           AND (props->>'sifirSonuc')::boolean) AS filtreli_sifir,
        COUNT(*) FILTER (WHERE (props->>'metinVar')::boolean) AS metinli_toplam,
        COUNT(*) FILTER (WHERE (props->>'metinVar')::boolean
                           AND (props->>'sifirSonuc')::boolean) AS metinli_sifir,
        COUNT(*) FILTER (WHERE COALESCE((props->>'sonucSayisi')::int, -1) BETWEEN 1 AND 3) AS az_sonuc,
        COUNT(*) FILTER (WHERE COALESCE((props->>'sonucSayisi')::int, -1) > 3) AS bol_sonuc
      FROM "AnalyticsEvent"
      WHERE name = 'arama_yapildi' AND NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
    `);

    const n = (v: bigint | null | undefined) => Number(v ?? 0);

    const arama = Number(satir?.arama ?? 0);

    return {
      /**
       * Sonucsuz arama kirilimlari. Her satirda toplam ve sonucsuz
       * birlikte; az ornekten kesin sonuc cikarilmasin diye ham adetler
       * gorunur tutuluyor ve oran hesaplanmiyor.
       */
      sifirKirilimi: {
        kategori: kategoriKirilimi.map((k) => ({
          ad: k.kategori, toplam: n(k.toplam), sifir: n(k.sifir),
        })),
        filtre: filtreSifir.map((f) => ({
          ad: f.filtre, toplam: n(f.toplam), sifir: n(f.sifir),
        })),
        bicim: [
          { ad: 'Filtresiz arama', toplam: n(bicimler?.filtresiz_toplam), sifir: n(bicimler?.filtresiz_sifir) },
          { ad: 'Filtreli arama',  toplam: n(bicimler?.filtreli_toplam),  sifir: n(bicimler?.filtreli_sifir) },
          { ad: 'Metin girilmiş',  toplam: n(bicimler?.metinli_toplam),   sifir: n(bicimler?.metinli_sifir) },
        ],
        sonucAraligi: [
          { ad: '0 sonuç',    adet: Number(satir?.sifir ?? 0) },
          { ad: '1-3 sonuç',  adet: n(bicimler?.az_sonuc) },
          { ad: '4+ sonuç',   adet: n(bicimler?.bol_sonuc) },
        ],
        not:
          'Serbest arama metni kaydedilmiyor. Her satırda toplam ve sonuçsuz birlikte verilir; ' +
          'az örnekten kesin sonuç çıkarmamak için oran hesaplanmaz.',
      },
      baslik: 'Arama ve kesif',
      kaynak: 'olay' as MetrikKaynagi,
      aciklama:
        'Serbest arama metni kaydedilmiyor. Kullanici arama kutusuna telefon ya da e-posta yazabildigi icin ilk surumde yalnizca kategori, filtre turleri ve sonuc sayisi olculuyor.',
      metrikler: [
        sayiMetrigi('Arama sayisi', 'Donemde sunucudan sonuc donen arama olayi sayisi.', arama, 'olay'),
        oranMetrigi(
          'Sifir sonuc orani',
          'Pay: hic sonuc dondurmemis arama. Payda: tum aramalar. Aramanin sonuc uretip uretmedigini gosteren temel metrik.',
          Number(satir?.sifir ?? 0),
          arama,
          'olay',
        ),
        oranMetrigi(
          'Arama -> ilan detayi gecisi',
          'Pay: arama sonuc listesinden ilana yapilan tiklama sayisi. Payda: arama sayisi. OLAY oranidir, oturum orani degil: bir arama birden fazla tiklama uretebilir, bu yuzden %100 asabilir. Oturum kimligi tutulmadigi icin kullanici bazli hesaplanmiyor.',
          tiklama,
          arama,
          'olay',
        ),
        oranMetrigi(
          'Metin yazilan arama orani',
          'Pay: serbest metin girilen arama. Payda: tum aramalar. Metnin kendisi kaydedilmez, yalnizca var olup olmadigi.',
          Number(satir?.metinli ?? 0),
          arama,
          'olay',
        ),
      ],
      filtreler: filtreler.map((f) => ({ filtre: f.filtre, adet: Number(f.adet) })),
    };
  }

  // ── 4. Saticiya ulasma (karma) ────────────────────────────────────────
  /** Olay baslangicini okuyup iletisim bolumune tasir. */
  private async iletisimHazirla(baslangic: Date, bitis: Date, olgunSinir: Date) {
    const ilkOlay = await this.ilkOlayTarihi();
    return this.iletisim(baslangic, bitis, olgunSinir, ilkOlay);
  }

  private async iletisim(baslangic: Date, bitis: Date, olgunSinir: Date, ilkOlay: Date | null) {
    // Olay tarafi: kendi ilanini goruntuleyen satici donusum hesabinda yok.
    const [olaySatir] = await this.prisma.$queryRaw<{
      detay: bigint; buton: bigint; buton_uye: bigint; buton_misafir: bigint;
      giris_gerekti: bigint; girisden_donuldu: bigint;
      gonderim_denendi: bigint; gonderim_hatasi: bigint;
    }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE name = 'ilan_detay_goruntulendi'
                           AND COALESCE((props->>'kendiIlani')::boolean, false) = false) AS detay,
        COUNT(*) FILTER (WHERE name = 'mesaj_butonu_tiklandi'
                           AND COALESCE((props->>'kendiIlani')::boolean, false) = false) AS buton,
        -- Misafir / uye ayrimi: misafirin onunde giris duvari var.
        COUNT(*) FILTER (WHERE name = 'mesaj_butonu_tiklandi'
                           AND COALESCE((props->>'kendiIlani')::boolean, false) = false
                           AND COALESCE((props->>'uyeMi')::boolean, false) = true) AS buton_uye,
        COUNT(*) FILTER (WHERE name = 'mesaj_butonu_tiklandi'
                           AND COALESCE((props->>'kendiIlani')::boolean, false) = false
                           AND COALESCE((props->>'uyeMi')::boolean, true) = false) AS buton_misafir,
        COUNT(*) FILTER (WHERE name = 'mesaj_giris_gerekti')     AS giris_gerekti,
        COUNT(*) FILTER (WHERE name = 'mesaj_girisden_donuldu')  AS girisden_donuldu,
        COUNT(*) FILTER (WHERE name = 'mesaj_gonderim_denendi')  AS gonderim_denendi,
        COUNT(*) FILTER (WHERE name = 'mesaj_gonderim_hatasi')   AS gonderim_hatasi
      FROM "AnalyticsEvent"
      WHERE NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
    `);

    /** Gonderim hatalarinin kaba kodlari — kisisel veri icermez. */
    const hataKodlari = await this.prisma.$queryRaw<{ kod: string; adet: bigint }[]>(Prisma.sql`
      SELECT COALESCE(props->>'kod','bilinmiyor') AS kod, COUNT(*) AS adet
      FROM "AnalyticsEvent"
      WHERE name = 'mesaj_gonderim_hatasi' AND NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
      GROUP BY 1 ORDER BY adet DESC LIMIT 8
    `);

    // Veritabani tarafi: ilan uzerinden acilmis konusmada alicinin ilk
    // mesaji ve saticinin ilk yaniti. Saticinin kendi konusmasi (gonderen =
    // satici) zaten disarida.
    const [konusma] = await this.prisma.$queryRaw<
      { toplam: bigint; olgun: bigint; olgunyanitlanan: bigint; medyansaat: number | null }[]
    >(Prisma.sql`
      WITH ilk AS (
        SELECT c.id AS conv, l."sellerId" AS satici, MIN(m."createdAt") AS ilkmesaj
        FROM "Conversation" c
        JOIN "Listing" l ON l.id = c."listingId"
        JOIN "Message" m ON m."conversationId" = c.id AND m."senderId" <> l."sellerId"
        JOIN "User" u ON u.id = m."senderId"
        WHERE c."listingId" IS NOT NULL
          AND u.role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
        GROUP BY c.id, l."sellerId"
      ),
      yanit AS (
        SELECT i.conv, i.ilkmesaj, MIN(m."createdAt") AS ilkyanit
        FROM ilk i
        LEFT JOIN "Message" m
          ON m."conversationId" = i.conv
         AND m."senderId" = i.satici
         AND m."createdAt" > i.ilkmesaj
        GROUP BY i.conv, i.ilkmesaj
      )
      SELECT
        COUNT(*) AS toplam,
        COUNT(*) FILTER (WHERE ilkmesaj < ${ts(olgunSinir)}) AS olgun,
        COUNT(*) FILTER (WHERE ilkmesaj < ${ts(olgunSinir)} AND ilkyanit IS NOT NULL) AS olgunyanitlanan,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (ilkyanit - ilkmesaj)) / 3600.0
        ) FILTER (WHERE ilkyanit IS NOT NULL) AS medyansaat
      FROM yanit
      WHERE ilkmesaj >= ${ts(baslangic)} AND ilkmesaj < ${ts(bitis)}
    `);

    // Karma oranin payi veritabanindan (geriye donuk dogru), paydasi olay
    // kaydindan (yalnizca olcumun kuruldugu tarihten sonra) geliyor. Donem
    // olay verisinden onceye uzaniyorsa pay payday cok asiyor ve oran
    // %300 gibi anlamsiz bir deger uretiyor. Bu yuzden karsilastirma
    // yalnizca iki tarafin da veri urettigi aralikta yapiliyor.
    const karmaBaslangic = ilkOlay && ilkOlay > baslangic ? ilkOlay : baslangic;
    const karmaKapsiyor = !!ilkOlay && ilkOlay < bitis;
    const [karma] = karmaKapsiyor
      ? await this.prisma.$queryRaw<{ ilkmesaj: bigint }[]>(Prisma.sql`
          WITH ilk AS (
            SELECT c.id AS conv, MIN(m."createdAt") AS ilkmesaj
            FROM "Conversation" c
            JOIN "Listing" l ON l.id = c."listingId"
            JOIN "Message" m ON m."conversationId" = c.id AND m."senderId" <> l."sellerId"
            JOIN "User" u ON u.id = m."senderId"
            WHERE c."listingId" IS NOT NULL
              AND u.role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
            GROUP BY c.id
          )
          SELECT COUNT(*) AS ilkmesaj FROM ilk
          WHERE ilkmesaj >= ${ts(karmaBaslangic)} AND ilkmesaj < ${ts(bitis)}
        `)
      : [{ ilkmesaj: BigInt(0) }];
    const [karmaButon] = karmaKapsiyor
      ? await this.prisma.$queryRaw<{ buton: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS buton FROM "AnalyticsEvent"
          WHERE name = 'mesaj_butonu_tiklandi' AND NOT "isStaff"
            AND COALESCE((props->>'kendiIlani')::boolean, false) = false
            AND "occurredAt" >= ${ts(karmaBaslangic)} AND "occurredAt" < ${ts(bitis)}
        `)
      : [{ buton: BigInt(0) }];

    const [karmaDetay] = karmaKapsiyor
      ? await this.prisma.$queryRaw<{ detay: bigint }[]>(Prisma.sql`
          SELECT COUNT(*) AS detay FROM "AnalyticsEvent"
          WHERE name = 'ilan_detay_goruntulendi' AND NOT "isStaff"
            AND COALESCE((props->>'kendiIlani')::boolean, false) = false
            AND "occurredAt" >= ${ts(karmaBaslangic)} AND "occurredAt" < ${ts(bitis)}
        `)
      : [{ detay: BigInt(0) }];

    const detay = Number(olaySatir?.detay ?? 0);
    const buton = Number(olaySatir?.buton ?? 0);
    const ilkMesaj = Number(konusma?.toplam ?? 0);
    const olgun = Number(konusma?.olgun ?? 0);
    const yanitlanan = Number(konusma?.olgunyanitlanan ?? 0);

    const n = (v: bigint | null | undefined) => Number(v ?? 0);
    const butonUye = n(olaySatir?.buton_uye);
    const butonMisafir = n(olaySatir?.buton_misafir);
    const girisGerekti = n(olaySatir?.giris_gerekti);
    const girisdenDonuldu = n(olaySatir?.girisden_donuldu);
    const gonderimDenendi = n(olaySatir?.gonderim_denendi);
    const gonderimHatasi = n(olaySatir?.gonderim_hatasi);

    /**
     * MESAJLASMA ADIMLARI.
     *
     * Her adim AYRI bir olay sayisi; ziyaret ya da kullanici bazinda
     * birlestirilmiyor. Bu yuzden adimlar arasinda yuzde HESAPLANMIYOR -
     * "su kadari dustu" demek icin ayni kisileri adimdan adima takip
     * etmek gerekirdi, bunun icin de cihaz/oturum kimligi; tutmuyoruz.
     * Ham adetler yan yana duruyor, dusus GOZLE okunuyor.
     *
     * Son adim (kaydedilmis ilk mesaj) VERITABANINDAN geliyor - gonderme
     * dugmesine basmak basari sayilmiyor.
     *
     * "Devami iliskilendirilemedi": giris duvarina carpip geri donusu
     * olculemeyenler. Bu kisiler BIRAKTI demek DEGIL - baska bir
     * cihazda/sekmede tamamlamis ya da olcum isareti kaybolmus olabilir.
     */
    const adimlar = [
      { adim: 1, etiket: 'İlan detayı görüntülendi', adet: detay, kapsam: 'olay' },
      { adim: 2, etiket: 'Mesaj düğmesine tıklandı', adet: buton, kapsam: 'olay',
        alt: [
          { etiket: 'üye', adet: butonUye },
          { etiket: 'misafir', adet: butonMisafir },
        ] },
      { adim: 3, etiket: 'Giriş/kayıt ekranına yönlendirildi (yalnızca misafir)', adet: girisGerekti, kapsam: 'olay' },
      { adim: 4, etiket: 'Kimlik doğrulaması sonrası ilana döndü', adet: girisdenDonuldu, kapsam: 'olay' },
      { adim: 5, etiket: 'Gönderme denendi', adet: gonderimDenendi, kapsam: 'olay' },
      { adim: 6, etiket: 'Sunucuda kaydedilmiş ilk mesaj', adet: ilkMesaj, kapsam: 'veritabanı' },
    ];

    return {
      mesajAkisi: {
        adimlar,
        gonderimHatasi,
        hataKodlari: hataKodlari.map((h) => ({ kod: h.kod, adet: Number(h.adet) })),
        /**
         * Giris duvarina carpip donusu gorulemeyenler. "Biraktilar"
         * DEMEK DEGIL: baska cihazda tamamlamis ya da olcum isareti
         * kaybolmus olabilir. Ayri gosteriliyor, dusus gibi sayilmiyor.
         */
        iliskilendirilemeyen: Math.max(0, girisGerekti - girisdenDonuldu),
        not:
          'Adımlar ayrı olay sayılarıdır; ziyaret ya da kullanıcı bazında birleştirilmez. ' +
          'Bu yüzden aralarında yüzde hesaplanmaz — aynı kişileri adımdan adıma takip etmek ' +
          'cihaz/oturum kimliği gerektirirdi, tutulmuyor. Son adım veritabanından gelir: ' +
          'gönderme düğmesine basmak başarı sayılmaz. Aynı konuşmadaki sonraki mesajlar ' +
          'yeni iletişim sayılmaz.',
      },
      baslik: 'Saticiya ulasma',
      kaynak: 'karma' as MetrikKaynagi,
      aciklama:
        'Mesaj dugmesine tiklama olay kaydindan, sunucuda kaydedilmis ilk mesaj ve satici yaniti Message tablosundan geliyor. Dugmeye tiklama gonderilmis mesaj sayilmiyor; ayni konusmadaki sonraki mesajlar yeni iletisim baslangici sayilmiyor.',
      metrikler: [
        oranMetrigi(
          'Ilan detayi -> mesaj dugmesi',
          'Pay: mesaj gonderme eylemine tiklama. Payda: ilan detay goruntulemesi. Ikisi de ilan sahibinin kendi ilanini goruntulemesi haric. OLAY oranidir.',
          buton,
          detay,
          'olay',
        ),
        oranMetrigi(
          'Ilan detayi -> ilk mesaj gonderimi',
          `Pay: sunucuda kaydedilmis ilk alici mesaji. Payda: ilan detay goruntulemesi (ilan sahibinin kendi ilani haric). Hunin ucundan ucuna orani; asagidaki iki metrik ayni yolu dugme tiklamasindan bolerek dususun nerede oldugunu gosteriyor. KARMA kaynakli: yalnizca iki tarafin da veri urettigi aralikta hesaplanir${
            ilkOlay && ilkOlay > baslangic ? ` (${karmaBaslangic.toISOString().slice(0, 10)} sonrasi)` : ''
          }.`,
          Number(karma?.ilkmesaj ?? 0),
          Number(karmaDetay?.detay ?? 0),
          'karma',
          karmaKapsiyor ? undefined : 'Donemde olay kaydi yok; bu oran hesaplanamiyor.',
        ),
        oranMetrigi(
          'Mesaj dugmesi -> kaydedilmis ilk mesaj',
          `Pay: sunucuda kaydedilmis ilk alici mesaji (Message tablosu). Payda: mesaj dugmesi tiklamasi (olay kaydi). KARMA kaynakli oran: iki taraf ayri sistemlerden geldigi icin yalnizca ikisinin de veri urettigi aralikta hesaplanir${
            ilkOlay && ilkOlay > baslangic ? ` (${karmaBaslangic.toISOString().slice(0, 10)} sonrasi)` : ''
          }. Dugmeye tiklayip mesaj gondermeyenleri gosterir.`,
          Number(karma?.ilkmesaj ?? 0),
          Number(karmaButon?.buton ?? 0),
          'karma',
          karmaKapsiyor
            ? undefined
            : 'Donemde olay kaydi yok; bu oran hesaplanamiyor.',
        ),
        sayiMetrigi(
          'Kaydedilmis ilk mesaj',
          'Donemde ilan uzerinden acilan konusmalarda alicinin ilk mesaji. Her konusma bir kez sayilir.',
          ilkMesaj,
          'veritabani',
        ),
        oranMetrigi(
          'Satici yanit orani',
          `Pay: saticinin yanitladigi konusma. Payda: ilk mesaji ${OLGUNLASMA_SA} saatten eski konusmalar. Henuz yanit bekleyen yeni konusmalar paydada degil.`,
          yanitlanan,
          olgun,
          'veritabani',
        ),
        sureMetrigi(
          'Medyan satici yanit suresi',
          'Yanitlanmis konusmalarda ilk yanit - ilk mesaj degerlerinin medyani (saat).',
          konusma?.medyansaat ?? null,
          yanitlanan,
          'veritabani',
        ),
        sayiMetrigi(
          'Yanit bekleyen yeni konusma',
          `Ilk mesaji ${OLGUNLASMA_SA} saatten yeni oldugu icin yanit oraninin paydasina alinmayan konusma sayisi.`,
          ilkMesaj - olgun,
          'veritabani',
        ),
      ],
    };
  }

  // ── 5. Teklifler (veritabani) ─────────────────────────────────────────
  private async teklifler(baslangic: Date, bitis: Date) {
    const [satir] = await this.prisma.$queryRaw<{ olusan: bigint; kabul: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS olusan,
             COUNT(*) FILTER (WHERE o.status = 'ACCEPTED') AS kabul
      FROM "Offer" o
      JOIN "User" u ON u.id = o."buyerId"
      WHERE o."createdAt" >= ${ts(baslangic)} AND o."createdAt" < ${ts(bitis)}
        AND u.role NOT IN ('ADMIN','SUPER_ADMIN','MODERATOR')
    `);

    const olusan = Number(satir?.olusan ?? 0);
    const kabul = Number(satir?.kabul ?? 0);

    return {
      baslik: 'Teklifler',
      kaynak: 'veritabani' as MetrikKaynagi,
      aciklama:
        'Offer tablosundan hesaplanir. Teklif notu ve tutarlari analitige kopyalanmiyor; yalnizca sayilar okunuyor.',
      metrikler: [
        sayiMetrigi('Olusturulan teklif', 'Donemde olusturulan teklif sayisi (personel aliciler haric).', olusan, 'veritabani'),
        sayiMetrigi(
          'Kabul edilen teklif',
          'Donemde olusturulan tekliflerden su an kabul edilmis olanlar. Ayni kohort uzerinden sayilir.',
          kabul,
          'veritabani',
          'Kabul edilmis teklif gerceklesmis satis degildir; odeme ve teslim platform disinda.',
        ),
        oranMetrigi(
          'Teklif kabul orani',
          'Pay: kabul edilen teklif. Payda: donemde olusturulan teklif.',
          kabul,
          olusan,
          'veritabani',
        ),
      ],
    };
  }
}
