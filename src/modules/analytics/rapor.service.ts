import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async rapor(baslangic: Date, bitis: Date) {
    const simdi = new Date();
    const olgunSinir = new Date(simdi.getTime() - OLGUNLASMA_SA * 60 * 60 * 1000);

    const [ilkOlay, ilanAkisi, arama, moderasyon, iletisim, teklif, sosyal] = await Promise.all([
      this.ilkOlayTarihi(),
      this.ilanAkisi(baslangic, bitis),
      this.aramaAkisi(baslangic, bitis),
      this.moderasyon(baslangic, bitis, olgunSinir),
      this.iletisimHazirla(baslangic, bitis, olgunSinir),
      this.teklifler(baslangic, bitis),
      this.sosyalKaynaklar(baslangic, bitis, olgunSinir),
    ]);

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
      bolumler: [ilanAkisi, moderasyon, arama, iletisim, teklif],
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
  private async sosyalKaynaklar(baslangic: Date, bitis: Date, olgunSinir: Date) {
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
    `);

    return {
      baslik: 'Sosyal Medya Kaynakları',
      aciklama:
        'Instagram ve Facebook bağlantılarından siteye ulaşan hareketler. Bu bölüm ' +
        'Instagram/Facebook İÇİNDEKİ erişimi, gösterimi veya profil görüntülemesini ÖLÇMEZ — ' +
        'yalnızca siteye gelen tıklamaları ve sonrasını görür.',
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
            detayOrani: t.acilis >= ASGARI_PAYDA ? t.detay / t.acilis : null,
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
      hataKirilimi: hataKirilimi.map((h) => ({ alan: h.alan, adet: Number(h.adet) })),
      fotoKirilimi: fotoKirilimi.map((h) => ({ kod: h.kod, adet: Number(h.adet) })),
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

    const arama = Number(satir?.arama ?? 0);

    return {
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
    const [olaySatir] = await this.prisma.$queryRaw<{ detay: bigint; buton: bigint }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE name = 'ilan_detay_goruntulendi'
                           AND COALESCE((props->>'kendiIlani')::boolean, false) = false) AS detay,
        COUNT(*) FILTER (WHERE name = 'mesaj_butonu_tiklandi'
                           AND COALESCE((props->>'kendiIlani')::boolean, false) = false) AS buton
      FROM "AnalyticsEvent"
      WHERE NOT "isStaff"
        AND "occurredAt" >= ${ts(baslangic)} AND "occurredAt" < ${ts(bitis)}
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

    return {
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
