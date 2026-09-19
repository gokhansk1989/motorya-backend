import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

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
  private async sendFirstListingReminders() {
    const now = Date.now();
    const from = new Date(now - 8 * 24 * 60 * 60 * 1000);
    const to = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
        createdAt: { gte: from, lt: to },
        listings: { none: {} },
        notifications: { none: { type: 'lifecycle.first_listing' } },
      },
      select: { id: true, email: true, displayName: true },
      take: 200,
    });

    if (candidates.length === 0) return;

    // Bildirimi mailden ÖNCE yazıyoruz: mail gönderimi yarıda kalsa bile
    // aynı kullanıcıya ikinci kez yazılmasın (spam riski > kaçan mail riski).
    await this.prisma.notification.createMany({
      data: candidates.map(u => ({
        userId: u.id,
        type: 'lifecycle.first_listing',
        title: 'İlk ilanını vermeye ne dersin?',
        body: 'Kullanmadığın ekipmanı Motorya\'da ücretsiz satabilirsin.',
        payload: {},
      })),
    });

    let sent = 0;
    for (const u of candidates) {
      const ok = await this.mail
        .sendFirstListingReminderEmail(u.email, u.displayName)
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    this.logger.log(`Sent ${sent}/${candidates.length} first-listing reminder(s)`);
  }

  /** Kayıttan 30 gün sonra, ilgi göstermiş ama hâlâ ilan vermemiş üyelere. */
  private async sendReengagementReminders() {
    const now = Date.now();
    const from = new Date(now - 31 * 24 * 60 * 60 * 1000);
    const to = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        emailVerifiedAt: { not: null },
        createdAt: { gte: from, lt: to },
        listings: { none: {} },
        notifications: { none: { type: 'lifecycle.reengagement' } },
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

    if (candidates.length === 0) return;

    await this.prisma.notification.createMany({
      data: candidates.map(u => ({
        userId: u.id,
        type: 'lifecycle.reengagement',
        title: 'Senin için yenilikler var',
        body: 'İlgilendiğin kategorilerde yeni ilanlar eklendi.',
        payload: {},
      })),
    });

    let sent = 0;
    for (const u of candidates) {
      const ok = await this.mail
        .sendReengagementEmail(u.email, u.displayName, {
          favorites: u._count.favorites,
          savedSearches: u._count.savedSearches,
        })
        .then(() => true)
        .catch(() => false);
      if (ok) sent++;
    }
    this.logger.log(`Sent ${sent}/${candidates.length} re-engagement mail(s)`);
  }

  // Günlük: 30 günden eski audit log kayıtlarını sil (saklama süresi)
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
