import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { buildListingSlug } from '../listings/listings.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private prisma: PrismaService, private mail: MailService) {}

  // Her 30 dakikada süresi dolan rezervasyonları kontrol et
  @Cron(CronExpression.EVERY_30_MINUTES)
  async expireReservedListings() {
    const expired = await this.prisma.listing.findMany({
      where: {
        status: 'RESERVED',
        reservedUntil: { lte: new Date() },
        deletedAt: null,
      },
      select: { id: true, title: true, sellerId: true },
    });

    if (expired.length === 0) return;

    const ids = expired.map(l => l.id);

    await this.prisma.listing.updateMany({
      where: { id: { in: ids } },
      data: { status: 'ACTIVE', reservedUntil: null },
    });

    // Satıcılara bildirim
    const notifications = expired.map(l => ({
      userId: l.sellerId,
      type: 'listing.reservation_expired',
      title: 'Rezervasyon sona erdi',
      body: `"${l.title}" ilanınızın rezervasyonu süresi doldu. İlan tekrar aktif.`,
      payload: { listingId: l.id },
    }));

    await this.prisma.notification.createMany({ data: notifications });

    this.logger.log(`Expired ${expired.length} reservation(s): ${ids.join(', ')}`);
  }

  // Saatlik: süresi dolan öne çıkarmaların bayrağını indir.
  //
  // Neden gerekli: `isFeatured` bir kez true yapılıyor ve hiçbir yerde geri
  // alınmıyordu. Liste sorgusu `featuredUntil > now()` kontrolü yaptığı için
  // ilan vitrinden düşüyor, ama alanın kendisi true kalıyor ve ilan kartıyla
  // ilan detayındaki "ÖNE ÇIKAN" rozeti bu alana bakıyor. Yani 7 günlük bir
  // öne çıkarma satıldığında rozet süresiz kalıyordu. Bu cron yazıldığında
  // veritabanında tam olarak bu durumda 12 kayıt vardı (hepsi Temmuz'da
  // süresi dolmuş, hepsi hâlâ isFeatured=true) - ilk koşuda temizlenirler.
  //
  // Saatlik, günlük değil: öne çıkarma ücretli bir şey ve "süresi bitti ama
  // hâlâ vitrinde" ile "süresi bitmedi ama vitrinden düştü" arasındaki fark
  // şikâyet konusudur. Sorgu tek indeks taraması (@@index([isFeatured,
  // featuredUntil])), saatte bir koşması bedava sayılır.
  @Cron(CronExpression.EVERY_HOUR)
  async expireFeaturedListings() {
    const sonuc = await this.prisma.listing.updateMany({
      where: {
        isFeatured: true,
        // Bitiş tarihi geçmiş VEYA hiç yok. Tarihsiz öne çıkarma zaten
        // vitrinde görünmüyor (liste sorgusu `featuredUntil > now()` arıyor),
        // yalnızca rozeti süresiz taşıyor - yani onarılması gereken aynı
        // tutarsızlığın ikinci hâli. Öne çıkarma ucu her zaman tarih yazdığı
        // için bu kombinasyon ancak elle müdahaleyle oluşur.
        OR: [{ featuredUntil: { lte: new Date() } }, { featuredUntil: null }],
      },
      data: { isFeatured: false, featuredUntil: null },
    });

    if (sonuc.count > 0) {
      this.logger.log(`Öne çıkarma süresi dolan ${sonuc.count} ilan vitrinden indirildi`);
    }
  }

  // Günlük: süresi dolan teklifleri EXPIRED'a çek
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireOffers() {
    const result = await this.prisma.offer.updateMany({
      where: {
        status: { in: ['PENDING', 'COUNTER_OFFERED'] },
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} offer(s)`);
    }
  }

  /**
   * Günlük: mesajlaşma başlamış ama hâlâ yayında duran ilanların sahiplerine
   * "satıldı mı?" hatırlatması gönderir.
   *
   * Satıcılar satışı işaretlemeyi unutuyor; ilan listeleri satılmış ürünlerle
   * doluyor, alıcılar boşuna mesaj atıyor ve karşılıklı değerlendirme akışı
   * hiç başlamıyor. Hatırlatma ilan başına yalnızca bir kez gönderilir.
   */
  @Cron(CronExpression.EVERY_DAY_AT_NOON)
  async remindStaleListings() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        createdAt: { lt: cutoff },
        conversations: { some: { createdAt: { lt: cutoff } } },
      },
      select: { id: true, title: true, sellerId: true },
      take: 200,
    });

    if (candidates.length === 0) return;

    // Daha önce hatırlatma gönderilmiş ilanları ele
    const alreadyNotified = await this.prisma.notification.findMany({
      where: {
        type: 'listing.sold_reminder',
        userId: { in: [...new Set(candidates.map(c => c.sellerId))] },
      },
      select: { payload: true },
    });
    const notifiedIds = new Set(
      alreadyNotified
        .map(n => (n.payload as { listingId?: string } | null)?.listingId)
        .filter(Boolean) as string[],
    );

    const pending = candidates.filter(c => !notifiedIds.has(c.id));
    if (pending.length === 0) return;

    await this.prisma.notification.createMany({
      data: pending.map(l => ({
        userId: l.sellerId,
        type: 'listing.sold_reminder',
        title: 'Bu ilan satıldı mı?',
        body: `"${l.title}" hâlâ yayında. Sattıysanız işaretleyin — alıcıyı seçince karşılıklı değerlendirme yapabilirsiniz.`,
        payload: { listingId: l.id },
      })),
    });

    this.logger.log(`Sent ${pending.length} sold-reminder notification(s)`);
  }

  /**
   * Üye yaşam döngüsü hatırlatmaları.
   *
   * Kural: kişi başına ömür boyu en fazla 2 mail. Alan adının gönderim
   * itibarı yeni olduğu için, ilgisiz kullanıcıya tekrar tekrar yazmak
   * doğrulama ve mesaj bildirimlerinin de spam'e düşmesine yol açar.
   *
   *  - 7. gün:  hiç ilan vermemiş herkese "ilk ilanını ver"
   *  - 30. gün: YALNIZCA ilgi göstermiş olanlara (favori / kayıtlı arama /
   *             takip) alıcı diliyle yeniden etkileşim maili. Hiç sinyal
   *             vermemiş kullanıcıya yazılmaz — getirisi sıfır, maliyeti itibar.
   *
   * Her iki mail de Notification kaydıyla tek seferliğe kilitlenir.
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async sendLifecycleReminders() {
    await this.sendFirstListingReminders();
    await this.sendReengagementReminders();
  }

  /** Kayıttan 7 gün sonra, hiç ilan vermemiş üyelere. */

  /**
   * Pazarlama izni olan kullanıcıları süzer.
   *
   * Neden gerekli: "ilk ilan hatırlatması" ve "geri kazanım" mailleri
   * işlemsel değil, pazarlama iletisi - kullanıcının başlattığı bir işin
   * sonucu değiller, biz kendiliğimizden yazıyoruz. KVKK bunlar için açık
   * rıza arıyor ve rızayı kayıt formunda zaten topluyoruz, ama bu görevler
   * o kaydı hiç sorgulamıyordu: izin vermemiş kullanıcılara da gidiyorlardı.
   *
   * İzin UserConsent tablosunda sürüm sürüm tutuluyor ve kullanıcı sonradan
   * fikir değiştirebiliyor, o yüzden "bir yerde accepted=true var mı" diye
   * bakmak yetmez - kişinin EN SON MARKETING kaydına bakmak gerekir.
   * Prisma bunu tek sorguda süzemediği için adaylar çekildikten sonra
   * kodda eleniyor; aday sayısı 200 ile sınırlı olduğu için maliyeti yok.
   */
  /**
   * Yaşam döngüsü mailleri arasında en az bu kadar gün olmalı.
   *
   * Pencere "kayıttan tam 7 gün sonra" iken bu sorun yoktu: her mail kendi
   * dar aralığında tetikleniyordu. Pencere "en az 7 gün" olunca 100 günlük
   * bir kullanıcı üç şartı da aynı anda sağlar hale geldi ve aynı sabah üç
   * ayrı mail alırdı. Aralık, sıralamayı da kendiliğinden kuruyor: önce
   * hoş geldin, birkaç gün sonra ilk ilan, sonra geri kazanım.
   */
  private static readonly LIFECYCLE_ARA_GUN = 5;

  /** Son LIFECYCLE_ARA_GUN gün içinde yaşam döngüsü maili almamış olma koşulu. */
  private lifecycleNefesPayi() {
    const esik = new Date(Date.now() - TasksService.LIFECYCLE_ARA_GUN * 24 * 60 * 60 * 1000);
    return { none: { type: { startsWith: 'lifecycle.' }, createdAt: { gte: esik } } };
  }

  private async pazarlamaIzniOlanlar<T extends { id: string }>(adaylar: T[]): Promise<T[]> {
    if (adaylar.length === 0) return [];
    const kayitlar = await this.prisma.userConsent.findMany({
      where: { userId: { in: adaylar.map(a => a.id) }, type: 'MARKETING' },
      orderBy: { createdAt: 'desc' },
      select: { userId: true, accepted: true },
    });
    // İlk görülen kayıt en yenisi (desc sıralı); sonrakiler eskisi.
    const sonDurum = new Map<string, boolean>();
    for (const k of kayitlar) {
      if (!sonDurum.has(k.userId)) sonDurum.set(k.userId, k.accepted);
    }
    return adaylar.filter(a => sonDurum.get(a.id) === true);
  }

  private async sendFirstListingReminders() {
    // Alt sınırlı koşul; gerekçesi sendWelcomeGuides'ta açıklandı.
    const esik = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
        createdAt: { lt: esik },
        listings: { none: {} },
        AND: [
          { notifications: { none: { type: 'lifecycle.first_listing' } } },
          { notifications: this.lifecycleNefesPayi() },
        ],
      },
      select: { id: true, email: true, displayName: true },
      take: 200,
    });

    const alicilar = await this.pazarlamaIzniOlanlar(candidates);
    if (alicilar.length === 0) return;

    // Bildirimi mailden ÖNCE yazıyoruz: mail gönderimi yarıda kalsa bile
    // aynı kullanıcıya ikinci kez yazılmasın (spam riski > kaçan mail riski).
    await this.prisma.notification.createMany({
      data: alicilar.map(u => ({
        userId: u.id,
        type: 'lifecycle.first_listing',
        title: 'İlk ilanını vermeye ne dersin?',
        body: 'Kullanmadığın ekipmanı Motorya\'da ücretsiz satabilirsin.',
        payload: {},
      })),
    });

    let sent = 0;
    for (const u of alicilar) {
      const ok = await this.mail
        .sendFirstListingReminderEmail(u.email, u.displayName)
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    this.logger.log(`Sent ${sent}/${alicilar.length} first-listing reminder(s)`);
  }

  /** Kayıttan 30 gün sonra, ilgi göstermiş ama hâlâ ilan vermemiş üyelere. */
  private async sendReengagementReminders() {
    // Alt sınırlı koşul; gerekçesi sendWelcomeGuides'ta açıklandı.
    const esik = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
        createdAt: { lt: esik },
        listings: { none: {} },
        AND: [
          { notifications: { none: { type: 'lifecycle.reengagement' } } },
          { notifications: this.lifecycleNefesPayi() },
        ],
        // İlgi sinyali şart — hiçbiri yoksa mail atmıyoruz.
        OR: [
          { favorites: { some: {} } },
          { savedSearches: { some: {} } },
          { following: { some: {} } },
        ],
      },
      select: {
        id: true, email: true, displayName: true,
        _count: { select: { favorites: true, savedSearches: true } },
      },
      take: 200,
    });

    const alicilar = await this.pazarlamaIzniOlanlar(candidates);
    if (alicilar.length === 0) return;

    await this.prisma.notification.createMany({
      data: alicilar.map(u => ({
        userId: u.id,
        type: 'lifecycle.reengagement',
        title: 'Senin için yenilikler var',
        body: 'İlgilendiğin kategorilerde yeni ilanlar eklendi.',
        payload: {},
      })),
    });

    let sent = 0;
    for (const u of alicilar) {
      const ok = await this.mail
        .sendReengagementEmail(u.email, u.displayName, {
          favorites: u._count.favorites,
          savedSearches: u._count.savedSearches,
        })
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    this.logger.log(`Sent ${sent}/${alicilar.length} re-engagement mail(s)`);
  }

  // Günlük: 30 günden eski audit log kayıtlarını sil (saklama süresi)
  /**
   * Okunmamış mesaj hatırlatması — 15 dakikada bir.
   *
   * Pazaryerinde satışı kapatan şey karşı tarafın zamanında dönmesi; alıcılar
   * genellikle ilk yanıt veren satıcıyla devam ediyor. Mesaj geldiğinde push
   * gidiyor ama push'u kapatmış ya da uygulamayı açmayan kullanıcıya hiçbir
   * şey ulaşmıyordu.
   *
   * Spam olmaması için üç sınır: (1) mesajın üzerinden en az 15 dakika
   * geçmeli - anında mail atmak, konuşma zaten sürerken rahatsız eder;
   * (2) aynı konuşma için günde bir mail; (3) bildirim tercihinde
   * "messages" kapalıysa hiç gitmez.
   */
  @Cron('*/15 * * * *')
  async remindUnreadMessages() {
    const simdi = Date.now();
    const esik = new Date(simdi - 15 * 60 * 1000);
    const gunOnce = new Date(simdi - 24 * 60 * 60 * 1000);

    // Okunmamış mesajı olan katılımcılar: son mesaj 15 dk'dan eski ve
    // kullanıcının lastReadAt'inden yeni.
    const katilimcilar = await this.prisma.conversationParticipant.findMany({
      where: {
        conversation: {
          messages: { some: { createdAt: { lte: esik } } },
        },
      },
      select: {
        userId: true,
        lastReadAt: true,
        conversationId: true,
        conversation: {
          select: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true, senderId: true, sender: { select: { displayName: true } } },
            },
          },
        },
      },
      take: 500,
    });

    const adaylar = katilimcilar.filter(k => {
      const son = k.conversation.messages[0];
      if (!son) return false;
      if (son.senderId === k.userId) return false;            // kendi mesajı
      if (son.createdAt > esik) return false;                  // henüz taze
      if (k.lastReadAt && k.lastReadAt >= son.createdAt) return false; // okumuş
      return true;
    });
    if (adaylar.length === 0) return;

    // Son 24 saatte bu konuşma için mail atılmış olanları ele.
    const sonHatirlatmalar = await this.prisma.notification.findMany({
      where: {
        userId: { in: adaylar.map(a => a.userId) },
        type: 'message.unread_reminder',
        createdAt: { gte: gunOnce },
      },
      select: { userId: true, payload: true },
    });
    const atlanacak = new Set(
      sonHatirlatmalar.map(n => `${n.userId}:${(n.payload as any)?.conversationId ?? ''}`),
    );

    const gonderilecek = adaylar.filter(a => !atlanacak.has(`${a.userId}:${a.conversationId}`));
    if (gonderilecek.length === 0) return;

    const kullanicilar = await this.prisma.user.findMany({
      where: {
        id: { in: gonderilecek.map(g => g.userId) },
        deletedAt: null,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
      },
      select: { id: true, email: true, displayName: true, notificationPrefs: true },
    });
    const kMap = new Map(kullanicilar.map(u => [u.id, u]));

    let sent = 0;
    for (const a of gonderilecek) {
      const u = kMap.get(a.userId);
      if (!u) continue;
      const prefs = (u.notificationPrefs as any) ?? {};
      if (prefs.messages === false) continue;

      const son = a.conversation.messages[0];
      const gonderen = son.sender?.displayName ?? 'Bir kullanıcı';

      // Kaydı mailden ÖNCE yaz: gönderim yarıda kalsa bile aynı konuşma
      // için 24 saat içinde ikinci mail çıkmasın.
      await this.prisma.notification.create({
        data: {
          userId: a.userId,
          type: 'message.unread_reminder',
          title: 'Okunmamış mesajın var',
          body: `${gonderen} sana mesaj gönderdi.`,
          payload: { conversationId: a.conversationId },
        },
      });

      const ok = await this.mail
        .sendUnreadMessagesEmail(u.email, u.displayName, 1, gonderen)
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    if (sent > 0) this.logger.log(`Sent ${sent} unread-message reminder(s)`);
  }

  /**
   * Yanıtlanmamış teklifler için son hatırlatma — her gün 09:00.
   *
   * Teklifler 48 saatte kendiliğinden düşüyor. Haberi olmayan satıcı alıcıyı
   * sessizce kaybediyor ve iki taraf da "geç kaldım" diye şikâyet ediyor.
   * Son 24 saate girmiş, hâlâ PENDING tekliflere tek bir hatırlatma.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async remindExpiringOffers() {
    const simdi = new Date();
    const yarin = new Date(simdi.getTime() + 24 * 60 * 60 * 1000);

    const teklifler = await this.prisma.offer.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { gt: simdi, lte: yarin },
      },
      select: {
        id: true,
        amount: true,
        listing: { select: { title: true, sellerId: true } },
      },
      take: 200,
    });
    if (teklifler.length === 0) return;

    const saticiIds = [...new Set(teklifler.map(t => t.listing.sellerId))];
    const saticilar = await this.prisma.user.findMany({
      where: { id: { in: saticiIds }, deletedAt: null, status: 'ACTIVE', emailVerifiedAt: { not: null } },
      select: { id: true, email: true, displayName: true, notificationPrefs: true },
    });
    const sMap = new Map(saticilar.map(u => [u.id, u]));

    let sent = 0;
    for (const t of teklifler) {
      const u = sMap.get(t.listing.sellerId);
      if (!u) continue;
      const prefs = (u.notificationPrefs as any) ?? {};
      if (prefs.offers === false) continue;
      const ok = await this.mail
        .sendOfferExpiringEmail(u.email, u.displayName, t.listing.title, Number(t.amount))
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    if (sent > 0) this.logger.log(`Sent ${sent} expiring-offer reminder(s)`);
  }

  /**
   * 30 gündür satılmamış ilanlar için satıcıya hatırlatma — her gün 11:00.
   *
   * Envanterin tazeliği arama sonuçlarının kalitesini belirliyor: aylardır
   * duran, fiyatı güncel olmayan ilanlar hem kullanıcıyı yanıltıyor hem de
   * satılmış olabiliyor. Fiyat güncellemesi ayrıca favorileyenlere "fiyat
   * düştü" bildirimi çıkarıyor, yani ilanı yeniden dolaşıma sokuyor.
   *
   * İlan başına ömür boyu tek mail - her ay hatırlatmak bunaltırdı.
   */
  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async remindLongRunningListings() {
    const esik = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const ilanlar = await this.prisma.listing.findMany({
      where: { status: 'ACTIVE', deletedAt: null, createdAt: { lt: esik } },
      select: {
        id: true, title: true, sellerId: true, createdAt: true,
        category: { select: { slug: true, name: true, parent: { select: { slug: true, name: true } } } },
        city: true, brand: { select: { name: true } },
      },
      take: 200,
    });
    if (ilanlar.length === 0) return;

    const zatenGonderilmis = await this.prisma.notification.findMany({
      where: { type: 'listing.stale_30d', userId: { in: [...new Set(ilanlar.map(i => i.sellerId))] } },
      select: { payload: true },
    });
    const gonderilmisIds = new Set(zatenGonderilmis.map(n => (n.payload as any)?.listingId));
    const kalan = ilanlar.filter(i => !gonderilmisIds.has(i.id));
    if (kalan.length === 0) return;

    const saticilar = await this.prisma.user.findMany({
      where: {
        id: { in: [...new Set(kalan.map(i => i.sellerId))] },
        deletedAt: null, status: 'ACTIVE', emailVerifiedAt: { not: null },
      },
      select: { id: true, email: true, displayName: true, notificationPrefs: true },
    });
    const sMap = new Map(saticilar.map(u => [u.id, u]));

    let sent = 0;
    for (const ilan of kalan) {
      const u = sMap.get(ilan.sellerId);
      if (!u) continue;
      const prefs = (u.notificationPrefs as any) ?? {};
      if (prefs.listingStatus === false) continue;

      const gun = Math.floor((Date.now() - ilan.createdAt.getTime()) / (24 * 60 * 60 * 1000));

      await this.prisma.notification.create({
        data: {
          userId: ilan.sellerId,
          type: 'listing.stale_30d',
          title: 'İlanını gözden geçir',
          body: `"${ilan.title}" ${gun} gündür yayında.`,
          payload: { listingId: ilan.id },
        },
      });

      const ok = await this.mail
        .sendStaleListingEmail(u.email, u.displayName, ilan.title, gun, buildListingSlug(ilan as any))
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    if (sent > 0) this.logger.log(`Sent ${sent} stale-listing reminder(s)`);
  }

  /**
   * Haftalık moderasyon özeti — pazartesi 09:00.
   *
   * Tek tek ilan mailleri "şu an ne var" sorusunu yanıtlıyor ama "bu hafta
   * ne oldu" sorusunu yanıtlamıyor. Hacim büyüyünce tek tek maillerin yerini
   * bu özet alacak; şimdilik ikisi birlikte duruyor.
   */
  @Cron('0 9 * * 1')
  async sendWeeklyModerationSummary() {
    const haftaOnce = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [bekleyen, onaylanan, reddedilen, sikayet, yeniUye, yoneticiler] = await Promise.all([
      this.prisma.listing.count({ where: { status: 'PENDING_REVIEW', deletedAt: null } }),
      this.prisma.listing.count({ where: { status: 'ACTIVE', deletedAt: null, updatedAt: { gte: haftaOnce } } }),
      this.prisma.listing.count({ where: { status: 'REJECTED', updatedAt: { gte: haftaOnce } } }),
      this.prisma.notification.count({ where: { type: 'report.received', createdAt: { gte: haftaOnce } } }),
      this.prisma.user.count({ where: { createdAt: { gte: haftaOnce }, deletedAt: null } }),
      this.prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'] }, deletedAt: null, status: 'ACTIVE' },
        select: { email: true, displayName: true },
      }),
    ]);

    await Promise.all(
      yoneticiler.map(y =>
        this.mail
          .sendModerationWeeklySummaryEmail(y.email, y.displayName, {
            bekleyen, onaylanan, reddedilen, sikayet, yeniUye,
          })
          .catch(() => null),
      ),
    );
    this.logger.log(`Weekly moderation summary sent to ${yoneticiler.length} moderator(s)`);
  }

  /**
   * Kayıttan 2 gün sonra "nasıl ilan verilir" rehberi — her gün 10:00.
   *
   * Kayıt olup hiç ilan vermeyenler en büyük kayıp havuzu ve bu kayıp ilk
   * günlerde oluyor: kişi kaydoluyor, ne yapacağını bulamıyor, bir daha
   * dönmüyor. Elimizdeki tek hatırlatma 7. gündeydi, yani çoğu kullanıcı
   * için çoktan geç kalmış oluyordu.
   *
   * Pazarlama izni şart (bkz. pazarlamaIzniOlanlar) ve kişi başına tek
   * mail - 7. gündeki hatırlatma ayrı bir bildirim tipi olduğu için ikisi
   * çakışmıyor, sırayla geliyorlar.
   */
  // 09:30 — ilk ilan hatırlatmasından (10:00) yarım saat önce.
  //
  // İkisi de 10:00'da olsaydı aynı dakikada çalışır, nefes payı kontrolü
  // ikisinde de "son 5 günde mail yok" görür ve aynı kullanıcı aynı sabah
  // iki mail alırdı. Araya zaman koymak sıralamayı garantiliyor: önce hoş
  // geldin gider, yarım saat sonra çalışan görev onu görüp o kullanıcıyı
  // atlar.
  @Cron('30 9 * * *')
  async sendWelcomeGuides() {
    // "Kayıttan EN AZ 2 gün geçmiş", "tam 2-3 gün arası" değil.
    //
    // Dar pencere, mailler devreye girmeden önce kaydolmuş herkesi kalıcı
    // olarak dışarıda bırakıyordu: 17 Eylül'de bu görevler eklendiğinde
    // Haziran ve Temmuz kullanıcıları çoktan aralığın dışına düşmüştü ve
    // onlara hiçbir zaman davet gitmeyecekti. Alt sınırlı koşul geçmişe
    // dönük herkesi bir kez yakalar, sonra "daha önce almamış olma" şartı
    // susturur. Patlamaya karşı koruma iki yerde: `take: 200` ve maillerin
    // arasındaki nefes payı.
    const esik = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
        createdAt: { lt: esik },
        listings: { none: {} },
        AND: [
          { notifications: { none: { type: 'lifecycle.welcome_guide' } } },
          { notifications: this.lifecycleNefesPayi() },
        ],
      },
      select: { id: true, email: true, displayName: true },
      take: 200,
    });

    const alicilar = await this.pazarlamaIzniOlanlar(candidates);
    if (alicilar.length === 0) return;

    // Kaydı mailden önce yaz: gönderim yarıda kalsa bile aynı kişiye ikinci
    // kez gitmesin (spam riski > kaçan mail riski).
    await this.prisma.notification.createMany({
      data: alicilar.map(u => ({
        userId: u.id,
        type: 'lifecycle.welcome_guide',
        title: 'İlk ilanın 2 dakika sürüyor',
        body: 'Kullanmadığın ekipmanı nasıl satacağını anlattık.',
        payload: {},
      })),
    });

    let sent = 0;
    for (const u of alicilar) {
      const ok = await this.mail
        .sendWelcomeGuideEmail(u.email, u.displayName)
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    this.logger.log(`Sent ${sent}/${alicilar.length} welcome guide(s)`);
  }

  /**
   * Haftalık kayıtlı arama özeti — pazar 10:00.
   *
   * Anlık eşleşme maili kişi başına günde 3 ile sınırlı (bkz.
   * saved-search.service). Bu özet o sınırın üstünde kalanları topluyor:
   * kullanıcı hiçbir eşleşmeyi kaçırmıyor ama gelen kutusu da dolmuyor.
   *
   * Hiç eşleşme olmayan haftalarda mail gitmiyor - "bu hafta 0 ilan"
   * demek için mail atmak, alarmı sildirmenin en hızlı yolu olurdu.
   */
  @Cron('0 10 * * 0')
  async sendSavedSearchWeeklySummaries() {
    const haftaOnce = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const eslesmeler = await this.prisma.notification.findMany({
      where: { type: 'saved_search.match', createdAt: { gte: haftaOnce } },
      select: { userId: true, payload: true },
    });
    if (eslesmeler.length === 0) return;

    const kisiBasi = new Map<string, string[]>();
    for (const e of eslesmeler) {
      const listingId = (e.payload as any)?.listingId;
      if (!listingId) continue;
      const mevcut = kisiBasi.get(e.userId) ?? [];
      if (!mevcut.includes(listingId)) mevcut.push(listingId);
      kisiBasi.set(e.userId, mevcut);
    }
    if (kisiBasi.size === 0) return;

    const kullanicilar = await this.prisma.user.findMany({
      where: {
        id: { in: [...kisiBasi.keys()] },
        deletedAt: null,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
      },
      select: { id: true, email: true, displayName: true },
    });

    let sent = 0;
    for (const u of kullanicilar) {
      const ids = kisiBasi.get(u.id) ?? [];
      if (ids.length === 0) continue;

      // Yalnızca hâlâ yayında olanları göster: hafta içinde satılmış ya da
      // kaldırılmış ilanı özete koymak kullanıcıyı boşuna tıklatır.
      const ilanlar = await this.prisma.listing.findMany({
        where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
        select: {
          id: true, title: true, price: true, city: true,
          category: { select: { slug: true, name: true, parent: { select: { slug: true, name: true } } } },
          brand: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      if (ilanlar.length === 0) continue;

      const toplam = await this.prisma.listing.count({
        where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
      });

      const ok = await this.mail
        .sendSavedSearchWeeklyEmail(
          u.email,
          u.displayName,
          toplam,
          ilanlar.map(i => ({
            title: i.title,
            price: Number(i.price),
            slug: buildListingSlug(i as any),
          })),
        )
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    if (sent > 0) this.logger.log(`Sent ${sent} saved-search weekly summary(ies)`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async pruneAuditLogs() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    if (result.count > 0) {
      this.logger.log(`Pruned ${result.count} audit log entr(y/ies) older than 30 days`);
    }
  }

  // Gunluk: 14 gunden eski hata kayitlarini sil.
  // Bu tablo teshis aracidir, arsiv degil: uzun vadeli hata gecmisi Sentry'de
  // duruyor. Tek bir saklama suresi tutmak, kod tarafinda da panelde de daha
  // anlasilir - "hangi kayit ne kadar duruyor" sorusu ortadan kalkiyor.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async pruneErrorLogs() {
    const sinir = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.errorLog.deleteMany({
      where: { createdAt: { lt: sinir } },
    });
    if (count > 0) this.logger.log(`Hata kaydi temizlendi: ${count} satir (14 gunden eski)`);
  }
}
