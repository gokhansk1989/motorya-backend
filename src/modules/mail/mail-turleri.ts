/**
 * Mail türleri: her gönderim fonksiyonu için insan-okur bir etiket.
 *
 * ── NEDEN ÇAĞIRAN FONKSİYONDAN ────────────────────────────────────
 *
 * `send()` yalnızca alıcı/konu/gövde görüyor; hangi tür mail olduğunu
 * bilmiyor. Her çağrı noktasına tür parametresi eklemek 27 yerde elle
 * değişiklik ve biri unutulursa sessiz bir "bilinmeyen" demek olurdu.
 * Bunun yerine çağıran fonksiyonun adını yığından (stack) okuyup bu
 * tabloyla eşliyoruz. Yeni bir mail fonksiyonu eklenip tabloya
 * yazılmazsa 'diger' olarak yine KAYDA GİRİYOR — kayıp olmuyor, yalnızca
 * etiketi ham fonksiyon adı oluyor. Bu, görünmez kalmaktan iyidir.
 *
 * Derlenmiş kod minify edilmediği için (NestJS tsc, mangling yok)
 * fonksiyon adları yığında korunuyor.
 */
export const MAIL_TURLERI: Record<string, { tur: string; etiket: string; konuGizle?: boolean }> = {
  sendVerificationEmail:            { tur: 'dogrulama',        etiket: 'E-posta doğrulama' },
  sendWelcomeGuideEmail:            { tur: 'hos_geldin',       etiket: 'Hoş geldin rehberi' },
  sendFirstListingReminderEmail:    { tur: 'ilk_ilan_hatirlat',etiket: 'İlk ilan hatırlatma' },
  sendReengagementEmail:            { tur: 'yeniden_etkilesim',etiket: 'Yeniden etkileşim' },
  sendListingPendingEmail:          { tur: 'ilan_incelemede',  etiket: 'İlan incelemeye alındı' },
  sendModerationQueueEmail:         { tur: 'moderasyon_kuyruk', etiket: 'Moderasyon: onay bekliyor' },
  sendListingApprovedEmail:         { tur: 'ilan_onaylandi',   etiket: 'İlan onaylandı' },
  sendListingRejectedEmail:         { tur: 'ilan_reddedildi',  etiket: 'İlan reddedildi' },
  sendPasswordResetEmail:           { tur: 'sifre_sifirlama',  etiket: 'Şifre sıfırlama' },
  sendAdminWelcomeEmail:            { tur: 'admin_hos_geldin', etiket: 'Admin hoş geldin' },
  sendAdminMfaEmail:                { tur: 'admin_giris_kodu', etiket: 'Admin giriş kodu', konuGizle: true },
  sendSavedSearchMatchEmail:        { tur: 'arama_eslesme',    etiket: 'Kayıtlı arama eşleşmesi' },
  sendFavoritePriceDropEmail:       { tur: 'fiyat_dustu',      etiket: 'Favoride fiyat düştü' },
  sendListingFavoritedEmail:        { tur: 'ilan_favorilendi', etiket: 'İlanın favorilendi' },
  sendUnreadMessagesEmail:          { tur: 'okunmamis_mesaj',  etiket: 'Okunmamış mesaj' },
  sendOfferReceivedEmail:           { tur: 'teklif_geldi',     etiket: 'Teklif geldi' },
  sendOfferAnsweredEmail:           { tur: 'teklif_yanit',     etiket: 'Teklif yanıtlandı' },
  sendOfferExpiringEmail:           { tur: 'teklif_suresi',    etiket: 'Teklif süresi doluyor' },
  sendFollowedSellerListingEmail:   { tur: 'takip_yeni_ilan',  etiket: 'Takip edilen satıcı yeni ilan' },
  sendStaleListingEmail:            { tur: 'ilan_bayat',       etiket: 'İlan uzun süredir yayında' },
  sendReportEmail:                  { tur: 'sikayet',          etiket: 'Şikâyet bildirimi' },
  sendModerationWeeklySummaryEmail: { tur: 'moderasyon_haftalik',etiket: 'Haftalık moderasyon özeti' },
  sendReportResolvedEmail:          { tur: 'sikayet_sonuc',    etiket: 'Şikâyet sonuçlandı' },
  sendReviewInviteEmail:            { tur: 'degerlendirme_davet',etiket: 'Değerlendirme daveti' },
  sendAnnouncementEmail:            { tur: 'duyuru',           etiket: 'Duyuru / kampanya' },
  sendSavedSearchWeeklyEmail:       { tur: 'arama_haftalik',   etiket: 'Haftalık arama özeti' },
  sendSecurityAlertEmail:           { tur: 'guvenlik_uyari',   etiket: 'Güvenlik uyarısı' },
};

/**
 * Yığından `send()`'i çağıran mail fonksiyonunun adını bulur.
 *
 * Yığın satırları "at MailService.sendWelcomeGuideEmail (...)" biçiminde.
 * `send`'in kendisini (tam "send") atlayıp ilk `sendXxx`'i alıyoruz.
 */
export function cagiranMail(): string | undefined {
  const yigin = new Error().stack ?? '';
  for (const satir of yigin.split('\n')) {
    // Sınıf metodu 'at MailService.sendXxx' ya da (bazı ortamlarda)
    // 'at sendXxx' — sınıf öneki opsiyonel, send'den sonra büyük harf
    // şartı 'send'in kendisini eler.
    const m = satir.match(/at (?:\w+\.)?(send[A-Z]\w+)/);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * Alıcıyı maskeler: a***@site.com.
 *
 * Ham adres DB'de duruyor (filtre için), ama panelde tam görünmesin.
 * Yerel kısmın yalnızca ilk harfi kalıyor; tek harfli yerelde o da
 * yıldıza dönüyor ki tek harf bile sızmasın.
 */
export function maskeAlici(adres: string): string {
  const [yerel, alan] = adres.split('@');
  if (!alan) return '***';
  const bas = yerel.length <= 1 ? '' : yerel[0];
  return `${bas}***@${alan}`;
}
