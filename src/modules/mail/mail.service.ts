import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { IntegrationsService } from '../integrations/integrations.service';
import { ErrorLogsService } from '../error-logs/error-logs.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly appUrl = 'https://motorya.com.tr';
  private readonly adminUrl = process.env.ADMIN_URL ?? 'https://admin.motorya.com.tr';

  constructor(private integrations: IntegrationsService, private errorLogs: ErrorLogsService) {}

  // Resend istemcisi API anahtarı başına önbelleklenir; panelden anahtar
  // değiştirildiğinde bir sonraki gönderimde yeni istemci kurulur.
  private client: { key: string; resend: Resend } | null = null;

  private async getMailConfig(): Promise<{ resend: Resend; from: string } | null> {
    const cfg = await this.integrations.getConfig('resend');
    const apiKey = cfg.api_key || process.env.RESEND_API_KEY;
    const from = cfg.from_email || 'noreply@motorya.com.tr';
    if (!apiKey) return null;
    if (this.client?.key !== apiKey) {
      this.client = { key: apiKey, resend: new Resend(apiKey) };
    }
    return { resend: this.client.resend, from };
  }

  async sendVerificationEmail(email: string, name: string, token: string) {
    const link = `${this.appUrl}/email-dogrula?token=${token}`;
    await this.send(email, 'E-posta adresinizi doğrulayın — Motorya', `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#f97316">Motorya'ya Hoş Geldin, ${name}!</h2>
        <p>Hesabını aktifleştirmek için aşağıdaki butona tıkla. Link <strong>24 saat</strong> geçerlidir.</p>
        <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">E-postamı Doğrula</a>
        <p style="color:#888;font-size:13px">Bu linke tıklamadıysan bu maili görmezden gelebilirsin.</p>
      </div>
    `);
  }

  /**
   * Ortak e-posta iskeleti.
   *
   * Mevcut şablonlar düz <div> ile kurulmuştu; Outlook bunları bozuyor.
   * Tablo tabanlı bu sarmalayıcı tüm istemcilerde aynı görünür.
   */
  private wrap(bodyHtml: string, footerNote?: string) {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fafafa;padding:24px 12px;">
        <tr><td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e4e6ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
            <tr><td style="padding:28px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="width:40px;"><div style="width:40px;height:40px;border-radius:10px;background:#f97316;color:#ffffff;text-align:center;line-height:40px;font-size:20px;font-weight:800;">M</div></td>
                <td style="padding-left:10px;font-size:19px;font-weight:800;color:#f97316;">MOTORYA</td>
              </tr></table>
            </td></tr>
            ${bodyHtml}
            <tr><td style="padding:26px 32px 24px;">
              <div style="border-top:1px solid #e4e6ea;padding-top:16px;font-size:12px;color:#9aa0ab;line-height:1.6;text-align:center;">
                ${footerNote ?? 'Bu e-postayı Motorya üyesi olduğunuz için aldınız.'}<br>
                <a href="${this.appUrl}/profilim" style="color:#9aa0ab;">Bildirim tercihleri</a>
                &nbsp;·&nbsp;
                <a href="${this.appUrl}" style="color:#9aa0ab;">motorya.com.tr</a>
              </div>
            </td></tr>
          </table>
        </td></tr>
      </table>`;
  }

  /** 7. gün: kayıt olmuş ama hiç ilan vermemiş üyeye tek seferlik hatırlatma. */
  async sendFirstListingReminderEmail(email: string, name: string) {
    await this.send(email, 'Garajında duran bir ekipman var mı?', this.wrap(`
      <tr><td style="padding:26px 32px 0;">
        <div style="font-size:21px;font-weight:800;color:#1a1d24;line-height:1.35;">Garajında duran bir ekipman var mı, ${name}?</div>
        <div style="font-size:15px;color:#464b57;line-height:1.65;padding-top:12px;">
          Motorya'ya katılalı bir hafta oldu. Kullanmadığın kask, mont ya da eldiven
          varsa, onu arayan biri şu an burada.
        </div>
      </td></tr>
      <tr><td style="padding:22px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff7ed;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-size:14px;color:#464b57;line-height:1.7;">
            <span style="color:#f97316;font-weight:700;">·</span> İlan vermek tamamen ücretsiz, komisyon yok<br>
            <span style="color:#f97316;font-weight:700;">·</span> Birkaç fotoğraf ve fiyat yeter, 2 dakika sürer<br>
            <span style="color:#f97316;font-weight:700;">·</span> Alıcılar seni doğrudan uygulamadan bulur
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 32px 0;" align="center">
        <a href="${this.appUrl}/ilan-ver" style="display:inline-block;background:#f97316;color:#ffffff;padding:14px 34px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">İlk İlanımı Ver</a>
      </td></tr>
      <tr><td style="padding:20px 32px 0;">
        <div style="font-size:13.5px;color:#767c89;line-height:1.6;text-align:center;">
          Ne satacağına karar veremedin mi?
          <a href="${this.appUrl}/ara" style="color:#f97316;">Nelerin satıldığına göz at</a>
        </div>
      </td></tr>
    `));
  }

  /**
   * 30. gün: yalnızca ilgi göstermiş (favori/kayıtlı arama) üyelere.
   * Satıcı diliyle değil alıcı diliyle yazılıyor — kullanıcının kendi
   * ilgisine dayanan gerçek bir haber, tekrarlanan bir dürtme değil.
   */
  async sendReengagementEmail(
    email: string,
    name: string,
    signal: { favorites: number; savedSearches: number },
  ) {
    const lead = signal.savedSearches > 0
      ? 'Kaydettiğin aramalara uyan yeni ilanlar eklendi.'
      : 'Favorilerine eklediğin ilanlarda hareket var.';
    const cta = signal.savedSearches > 0
      ? { label: 'Yeni İlanları Gör', href: `${this.appUrl}/ara` }
      : { label: 'Favorilerimi Aç', href: `${this.appUrl}/favoriler` };

    await this.send(email, `${name}, senin için yenilikler var`, this.wrap(`
      <tr><td style="padding:26px 32px 0;">
        <div style="font-size:21px;font-weight:800;color:#1a1d24;line-height:1.35;">Merhaba ${name}, buralar hareketlendi</div>
        <div style="font-size:15px;color:#464b57;line-height:1.65;padding-top:12px;">${lead}</div>
      </td></tr>
      <tr><td style="padding:24px 32px 0;" align="center">
        <a href="${cta.href}" style="display:inline-block;background:#f97316;color:#ffffff;padding:14px 34px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">${cta.label}</a>
      </td></tr>
      <tr><td style="padding:22px 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff7ed;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-size:14px;color:#464b57;line-height:1.65;">
            Bu arada — sende de satılacak bir ekipman varsa ilan vermek ücretsiz.
            <a href="${this.appUrl}/ilan-ver" style="color:#f97316;font-weight:600;">İlan ver</a>
          </td></tr>
        </table>
      </td></tr>
    `, 'Bu e-postayı Motorya\'daki ilgi alanlarınıza göre aldınız.'));
  }

  async sendListingPendingEmail(email: string, name: string, listingTitle: string) {
    await this.send(email, `İlanın incelemeye alındı: ${listingTitle}`, `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#f97316">İlanın İncelemeye Alındı ⏳</h2>
        <p>Merhaba ${name},</p>
        <p><strong>"${listingTitle}"</strong> ilanın alındı ve ekibimiz tarafından inceleniyor.</p>
        <p>İnceleme genellikle birkaç saat içinde tamamlanır. Onaylandığında sana haber vereceğiz.</p>
        <a href="${this.appUrl}/ilanlarim" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanlarıma Git</a>
      </div>
    `);
  }

  /** Moderatöre: kuyrukta onay bekleyen ilan var. */
  async sendModerationQueueEmail(email: string, name: string, listingTitle: string) {
    await this.send(email, `Onay bekleyen ilan: ${listingTitle}`, `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#f97316">Onay Bekleyen İlan 📋</h2>
        <p>Merhaba ${name},</p>
        <p><strong>"${listingTitle}"</strong> moderasyon kuyruğuna düştü ve incelemenizi bekliyor.</p>
        <p style="color:#767c89;font-size:14px">Satıcı, ilanı onaylanana kadar yayında göremiyor — hızlı inceleme kullanıcı deneyimi için önemli.</p>
        <a href="${this.adminUrl}/listings" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Moderasyon Paneline Git</a>
      </div>
    `);
  }

  async sendListingApprovedEmail(email: string, name: string, listingTitle: string, listingId: string) {
    const link = `${this.appUrl}/ilan/${listingId}`;
    await this.send(email, `İlanın onaylandı: ${listingTitle}`, `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#f97316">İlanın Yayında! 🎉</h2>
        <p>Merhaba ${name},</p>
        <p><strong>"${listingTitle}"</strong> ilanın incelendi ve yayına alındı.</p>
        <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanı Görüntüle</a>
      </div>
    `);
  }

  async sendListingRejectedEmail(email: string, name: string, listingTitle: string, reason?: string) {
    await this.send(email, `İlanın onaylanmadı: ${listingTitle}`, `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#ef4444">İlanın Onaylanmadı</h2>
        <p>Merhaba ${name},</p>
        <p><strong>"${listingTitle}"</strong> ilanın incelendi ancak yayınlanamadı.</p>
        ${reason ? `<p><strong>Sebep:</strong> ${reason}</p>` : ''}
        <p>İlanı düzenleyip tekrar gönderebilirsin.</p>
        <a href="${this.appUrl}/ilanlarim" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanlarıma Git</a>
      </div>
    `);
  }

  async sendPasswordResetEmail(email: string, name: string, token: string) {
    const link = `${this.appUrl}/sifre-sifirla?token=${token}`;
    await this.send(email, 'Şifre sıfırlama isteği — Motorya', `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#f97316">Şifreni Sıfırla</h2>
        <p>Merhaba ${name},</p>
        <p>Şifre sıfırlama isteği aldık. Aşağıdaki butona tıklayarak yeni şifreni belirleyebilirsin. Link <strong>1 saat</strong> geçerlidir.</p>
        <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Şifremi Sıfırla</a>
        <p style="color:#888;font-size:13px">Bu isteği sen yapmadıysan bu maili görmezden gelebilirsin.</p>
      </div>
    `);
  }

  async sendAdminWelcomeEmail(email: string, name: string, role: string, adminUrl: string) {
    const roleLabel: Record<string, string> = {
      MODERATOR: 'Moderatör', ADMIN: 'Admin', SUPER_ADMIN: 'Süper Admin',
    };
    await this.send(email, 'Motorya Admin Paneline Hoş Geldiniz', `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#f97316">Admin Paneline Erişim Açıldı</h2>
        <p>Merhaba ${name},</p>
        <p>Motorya platformunda sana <strong>${roleLabel[role] ?? role}</strong> yetkisi verildi. Aşağıdaki linkten yönetim paneline erişebilirsin.</p>
        <a href="${adminUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Admin Panelini Aç</a>
        <p style="color:#888;font-size:13px">Giriş yaparken e-posta adresin ve hesap şifreni kullan. Her girişte e-posta ile doğrulama kodu gönderilecektir.</p>
        <p style="color:#888;font-size:13px">Bu yetkiyi sen talep etmediysen lütfen destek ekibiyle iletişime geç.</p>
      </div>
    `);
  }

  async sendAdminMfaEmail(email: string, name: string, otp: string) {
    await this.send(email, `${otp} — Motorya Admin Giriş Kodu`, `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#f97316">Admin Giriş Doğrulama</h2>
        <p>Merhaba ${name},</p>
        <p>Motorya Admin Paneli'ne giriş için doğrulama kodun:</p>
        <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#f97316;text-align:center;padding:24px;background:#fff7ed;border-radius:12px;margin:20px 0">${otp}</div>
        <p style="color:#888;font-size:13px">Bu kod <strong>10 dakika</strong> geçerlidir. Kodu kimseyle paylaşma.</p>
        <p style="color:#888;font-size:13px">Bu giriş isteğini sen yapmadıysan şifreni hemen değiştir.</p>
      </div>
    `);
  }

  async sendSavedSearchMatchEmail(email: string, name: string, label: string, listingTitle: string, listingId: string) {
    const link = `${this.appUrl}/ilan/${listingId}`;
    await this.send(email, `🔍 Aradığın ilan yayınlandı`, `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#f97316">Aradığın İlan Yayınlandı! 🔍</h2>
        <p>Merhaba ${name},</p>
        <p><strong>"${label}"</strong> aramanla eşleşen yeni bir ilan yayınlandı:</p>
        <p style="font-size:18px;font-weight:600">${listingTitle}</p>
        <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanı Görüntüle</a>
        <p style="color:#888;font-size:13px">Bu bildirimi almak istemiyorsan kayıtlı aramalarını <a href="${this.appUrl}/fiyat-alarm" style="color:#f97316">buradan</a> yönetebilirsin.</p>
      </div>
    `);
  }

  /**
   * Favorilenen bir ilanın fiyatı düştüğünde favorileyene gider.
   *
   * Favori listesi, kullanıcının "bunu almayı düşünüyorum" dediği yer;
   * fiyatın düşmesi orada beklediği tek haber. Uygulama içi bildirim ve
   * push zaten vardı, ama ikisi de uygulamayı açmayan kullanıcıya
   * ulaşmıyordu - oysa fiyat düşüşü tam olarak geri getirme sebebi.
   */
  async sendFavoritePriceDropEmail(
    email: string,
    name: string,
    listingTitle: string,
    oldPrice: number,
    newPrice: number,
    listingSlug: string,
  ) {
    const link = `${this.appUrl}/ilan/${listingSlug}`;
    const indirim = Math.round((1 - newPrice / oldPrice) * 100);
    await this.send(email, `💰 Favorindeki ilanın fiyatı düştü: ${listingTitle}`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">Fiyat Düştü! 💰</h2>
      <p>Merhaba ${name},</p>
      <p>Favorilerindeki <strong>"${listingTitle}"</strong> ilanının fiyatı düştü:</p>
      <p style="font-size:20px;margin:16px 0">
        <span style="color:#888;text-decoration:line-through">${oldPrice.toLocaleString('tr-TR')} ₺</span>
        &nbsp;→&nbsp;
        <strong style="color:#dc2626">${newPrice.toLocaleString('tr-TR')} ₺</strong>
        <span style="background:#fee2e2;color:#dc2626;font-size:13px;font-weight:700;padding:3px 8px;border-radius:5px;margin-left:8px">%${indirim} indirim</span>
      </p>
      <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanı Görüntüle</a>
      <p style="color:#888;font-size:13px">Bu bildirimleri profilindeki bildirim ayarlarından kapatabilirsin.</p>
    `));
  }

  /**
   * İlanı favoriye eklendiğinde satıcıya gider.
   *
   * Satıcı için "ilanım ilgi görüyor" sinyali; ilanı canlı tutmaya ve
   * fiyatı gözden geçirmeye teşvik ediyor. Favoriyi KİMİN eklediği
   * bilinçli olarak yazılmıyor - alıcının hangi ilanla ilgilendiği onun
   * bilgisi, satıcıya isim vermek gereksiz bir ifşa olurdu.
   */
  async sendListingFavoritedEmail(
    email: string,
    name: string,
    listingTitle: string,
    toplamFavori: number,
    listingSlug: string,
  ) {
    const link = `${this.appUrl}/ilan/${listingSlug}`;
    await this.send(email, `⭐ İlanın favorilere eklendi: ${listingTitle}`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">İlanın İlgi Görüyor ⭐</h2>
      <p>Merhaba ${name},</p>
      <p><strong>"${listingTitle}"</strong> ilanın favorilere eklendi.</p>
      <p style="font-size:15px">Bu ilan şu ana kadar <strong>${toplamFavori} kez</strong> favorilendi.</p>
      <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanı Görüntüle</a>
      <p style="color:#888;font-size:13px">Bu bildirimleri profilindeki bildirim ayarlarından kapatabilirsin.</p>
    `));
  }


  // ---------------------------------------------------------------------
  // Etkileşim mailleri
  //
  // Ortak gerekçe: bu olayların hepsinin uygulama içi bildirimi ve push'u
  // zaten vardı, ama ikisi de yalnızca uygulamayı/siteyi açan kullanıcıya
  // ulaşıyor. Bir pazaryerinde alışverişi kapatan şey karşı tarafın zamanında
  // haberdar olması; mail, günlerce uygulamayı açmayan kullanıcıya ulaşan tek
  // kanal. Her biri ilgili bildirim tercihine bağlı - kullanıcı push'u
  // kapatmışsa mail de gitmez, yoksa kapatmanın anlamı kalmaz.
  // ---------------------------------------------------------------------

  /** Okunmamış mesaj hatırlatması (15 dk okunmadıysa, en fazla günde bir). */
  async sendUnreadMessagesEmail(email: string, name: string, okunmamis: number, gonderen: string) {
    const link = `${this.appUrl}/mesajlarim`;
    await this.send(email, `💬 ${gonderen} sana mesaj gönderdi`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">Okunmamış Mesajın Var 💬</h2>
      <p>Merhaba ${name},</p>
      <p><strong>${gonderen}</strong> sana mesaj gönderdi${okunmamis > 1 ? ` (toplam ${okunmamis} okunmamış mesajın var)` : ''}.</p>
      <p style="color:#555">Alıcılar genellikle ilk yanıt veren satıcıyla devam ediyor - hızlı dönmek satışı kapatıyor.</p>
      <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Mesajları Oku</a>
      <p style="color:#888;font-size:13px">Bu bildirimleri profilindeki bildirim ayarlarından kapatabilirsin.</p>
    `));
  }

  /** Satıcıya: ilanına teklif geldi. */
  async sendOfferReceivedEmail(email: string, name: string, listingTitle: string, tutar: number, slug: string) {
    const link = `${this.appUrl}/tekliflerim`;
    await this.send(email, `💸 İlanına teklif geldi: ${listingTitle}`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">Yeni Teklif 💸</h2>
      <p>Merhaba ${name},</p>
      <p><strong>"${listingTitle}"</strong> ilanına teklif geldi:</p>
      <p style="font-size:22px;font-weight:700;color:#16a34a;margin:12px 0">${tutar.toLocaleString('tr-TR')} ₺</p>
      <p style="color:#555">Teklif <strong>48 saat</strong> içinde yanıtlanmazsa kendiliğinden düşer.</p>
      <a href="${link}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Teklifi Görüntüle</a>
      <p style="color:#888;font-size:13px"><a href="${this.appUrl}/ilan/${slug}" style="color:#f97316">İlanı aç</a></p>
    `));
  }

  /** Alıcıya: teklifin yanıtlandı. */
  async sendOfferAnsweredEmail(
    email: string,
    name: string,
    listingTitle: string,
    durum: 'ACCEPTED' | 'REJECTED' | 'COUNTERED',
    tutar: number,
    slug: string,
  ) {
    const baslik = durum === 'ACCEPTED' ? '🎉 Teklifin kabul edildi'
      : durum === 'COUNTERED' ? '↩️ Satıcı karşı teklif verdi'
      : 'Teklifin yanıtlandı';
    const govde = durum === 'ACCEPTED'
      ? `<p><strong>"${listingTitle}"</strong> ilanı için verdiğin <strong>${tutar.toLocaleString('tr-TR')} ₺</strong> teklif kabul edildi. Satıcıyla mesajlaşarak teslimatı planlayabilirsin.</p>`
      : durum === 'COUNTERED'
        ? `<p><strong>"${listingTitle}"</strong> ilanı için satıcı <strong>${tutar.toLocaleString('tr-TR')} ₺</strong> karşı teklif verdi.</p>`
        : `<p><strong>"${listingTitle}"</strong> ilanı için verdiğin teklif kabul edilmedi. Benzer ilanlara göz atabilirsin.</p>`;
    await this.send(email, `${baslik}: ${listingTitle}`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">${baslik}</h2>
      <p>Merhaba ${name},</p>
      ${govde}
      <a href="${this.appUrl}/tekliflerim" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Tekliflerim</a>
      <p style="color:#888;font-size:13px"><a href="${this.appUrl}/ilan/${slug}" style="color:#f97316">İlanı aç</a></p>
    `));
  }

  /** Satıcıya: yanıtlanmamış teklif yarın düşecek. */
  async sendOfferExpiringEmail(email: string, name: string, listingTitle: string, tutar: number) {
    await this.send(email, `⏳ Teklif yarın düşüyor: ${listingTitle}`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">Yanıt Bekleyen Teklif ⏳</h2>
      <p>Merhaba ${name},</p>
      <p><strong>"${listingTitle}"</strong> ilanına gelen <strong>${tutar.toLocaleString('tr-TR')} ₺</strong> teklif <strong>24 saat içinde</strong> kendiliğinden düşecek.</p>
      <p style="color:#555">Kabul, ret ya da karşı teklif - hangisi olursa olsun yanıtlamak alıcıyı elde tutuyor.</p>
      <a href="${this.appUrl}/tekliflerim" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Teklifi Yanıtla</a>
    `));
  }

  /** Takipçiye: takip ettiğin satıcı yeni ilan verdi. */
  async sendFollowedSellerListingEmail(email: string, name: string, saticiAdi: string, listingTitle: string, slug: string) {
    await this.send(email, `🔔 ${saticiAdi} yeni ilan verdi`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">Takip Ettiğin Satıcıdan Yeni İlan 🔔</h2>
      <p>Merhaba ${name},</p>
      <p>Takip ettiğin <strong>${saticiAdi}</strong> yeni bir ilan yayınladı:</p>
      <p style="font-size:18px;font-weight:600;margin:12px 0">${listingTitle}</p>
      <a href="${this.appUrl}/ilan/${slug}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanı Görüntüle</a>
      <p style="color:#888;font-size:13px">Takibi bırakmak istersen satıcının profilinden yapabilirsin.</p>
    `));
  }

  /** Satıcıya: ilanın uzun süredir yayında, gözden geçir. */
  async sendStaleListingEmail(email: string, name: string, listingTitle: string, gun: number, slug: string) {
    await this.send(email, `İlanın ${gun} gündür yayında: ${listingTitle}`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">İlanını Gözden Geçir</h2>
      <p>Merhaba ${name},</p>
      <p><strong>"${listingTitle}"</strong> ilanın ${gun} gündür yayında ve henüz satılmadı.</p>
      <p style="color:#555">Fiyatı güncellemek ilanı arama sonuçlarında öne çıkarıyor ve favorileyenlere "fiyat düştü" bildirimi gönderiyor. Satıldıysa ilanı kapatmayı unutma.</p>
      <a href="${this.appUrl}/ilan/${slug}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanı Düzenle</a>
    `));
  }

  /** Moderatörlere: içerik şikâyet edildi. */
  async sendReportEmail(email: string, name: string, listingTitle: string, sebep: string, listingId: string) {
    await this.send(email, `🚩 Şikâyet: ${listingTitle}`, this.wrap(`
      <h2 style="color:#dc2626;margin:0 0 16px">İçerik Şikâyet Edildi 🚩</h2>
      <p>Merhaba ${name},</p>
      <p><strong>"${listingTitle}"</strong> ilanı şikâyet edildi.</p>
      <p style="background:#fef2f2;border-left:3px solid #dc2626;padding:10px 14px;margin:14px 0"><strong>Sebep:</strong> ${sebep}</p>
      <p style="color:#555">Kullanım şartlarımızda şikâyetleri <strong>24 saat içinde</strong> inceleyeceğimizi taahhüt ediyoruz - bu söz App Store incelemesinde de verildi.</p>
      <a href="${this.adminUrl}/listings" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlanı İncele</a>
    `));
  }

  /** Yönetime: haftalık moderasyon özeti. */
  async sendModerationWeeklySummaryEmail(
    email: string,
    name: string,
    o: { bekleyen: number; onaylanan: number; reddedilen: number; sikayet: number; yeniUye: number },
  ) {
    const satir = (etiket: string, deger: number, renk = '#1c1917') =>
      `<tr><td style="padding:7px 0;color:#555">${etiket}</td><td style="padding:7px 0;text-align:right;font-weight:700;color:${renk}">${deger}</td></tr>`;
    await this.send(email, `📊 Haftalık moderasyon özeti — Motorya`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">Haftalık Özet 📊</h2>
      <p>Merhaba ${name},</p>
      <p>Son 7 günde Motorya'da olanlar:</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0">
        ${satir('Onay bekleyen ilan', o.bekleyen, o.bekleyen > 0 ? '#dc2626' : '#16a34a')}
        ${satir('Onaylanan ilan', o.onaylanan)}
        ${satir('Reddedilen ilan', o.reddedilen)}
        ${satir('Şikâyet', o.sikayet, o.sikayet > 0 ? '#dc2626' : '#1c1917')}
        ${satir('Yeni üye', o.yeniUye)}
      </table>
      <a href="${this.adminUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Yönetim Paneli</a>
    `));
  }

  /**
   * Şikâyetçiye: bildirdiğin içerik incelendi.
   *
   * App Store 1.2 maddesi yalnızca şikâyet mekanizması istemiyor; şikâyeti
   * edene SONUCUN bildirilmesini de istiyor. Bizde şikâyet moderatöre
   * ulaşıyordu ama şikâyetçi bir daha hiçbir şey duymuyordu - taahhüdün
   * yarısı eksikti.
   *
   * Sonucun ayrıntısı bilinçli olarak verilmiyor: hangi yaptırımın
   * uygulandığı (uyarı, içerik kaldırma, hesap kapatma) şikâyet edilen
   * kişinin bilgisi. Şikâyetçinin bilmesi gereken tek şey incelendiği ve
   * işlem yapılıp yapılmadığı.
   */
  async sendReportResolvedEmail(
    email: string,
    name: string,
    listingTitle: string,
    islemYapildi: boolean,
  ) {
    const baslik = islemYapildi ? 'Şikâyetin sonuçlandı' : 'Şikâyetin incelendi';
    const govde = islemYapildi
      ? `<p>Bildirdiğin <strong>"${listingTitle}"</strong> içeriği incelendi ve kurallarımıza aykırı bulunarak <strong>gerekli işlem yapıldı</strong>.</p>
         <p style="color:#555">Uygulanan yaptırımın ayrıntısını paylaşmıyoruz; bu, ilgili kullanıcının kişisel bilgisi.</p>`
      : `<p>Bildirdiğin <strong>"${listingTitle}"</strong> içeriği incelendi. Yaptığımız değerlendirmede kurallarımıza aykırı bir durum tespit edilmedi, bu yüzden içerik yayında kalıyor.</p>
         <p style="color:#555">Katılmıyorsan ya da gözden kaçtığını düşündüğün bir şey varsa bize yazabilirsin.</p>`;
    await this.send(email, `${baslik} — Motorya`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">${baslik}</h2>
      <p>Merhaba ${name},</p>
      ${govde}
      <p style="color:#555">Bildirdiğin için teşekkürler - topluluğu güvenli tutan şey bu bildirimler.</p>
      <a href="${this.appUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Motorya'ya Dön</a>
    `));
  }

  /**
   * Satış sonrası: karşı tarafı değerlendir.
   *
   * Bağlantı ilan sayfasına değil tekliflerim'e gidiyor - değerlendirme
   * formu orada. İlan sayfasına göndermek kullanıcıyı "değerlendir" deyip
   * değerlendirecek bir şey bulamayacağı yere bırakırdı.
   */
  async sendReviewInviteEmail(email: string, name: string, listingTitle: string, rol: 'buyer' | 'seller', slug: string) {
    const kimi = rol === 'buyer' ? 'satıcıyı' : 'alıcıyı';
    const hedef = rol === 'seller' ? '/tekliflerim?tab=received' : '/tekliflerim?tab=sent';
    await this.send(email, `⭐ Alışverişin nasıl geçti? ${listingTitle}`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">Alışverişin Nasıl Geçti? ⭐</h2>
      <p>Merhaba ${name},</p>
      <p><strong>"${listingTitle}"</strong> alışverişin tamamlandı. Birkaç saniyeni ayırıp ${kimi} değerlendirir misin?</p>
      <p style="color:#555">İkinci el alışverişte insanları karar verdiren tek şey karşı tarafın geçmişi. Senin bıraktığın puan, bir sonraki alıcının güvenle alışveriş yapmasını sağlıyor.</p>
      <a href="${this.appUrl}${hedef}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Değerlendir</a>
      <p style="color:#888;font-size:13px"><a href="${this.appUrl}/ilan/${slug}" style="color:#f97316">İlanı aç</a></p>
    `));
  }

  /** Kayıttan 2 gün sonra: nasıl ilan verilir. */
  async sendWelcomeGuideEmail(email: string, name: string) {
    await this.send(email, `${name}, ilk ilanını 2 dakikada verebilirsin`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">İlk İlanın 2 Dakika Sürüyor</h2>
      <p>Merhaba ${name},</p>
      <p>Motorya'ya katıldın ama henüz ilan vermedin. Garajında duran, artık kullanmadığın bir kask ya da mont varsa birilerinin tam da onu arıyor olma ihtimali yüksek.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px 0;vertical-align:top;width:30px"><strong style="color:#f97316">1</strong></td><td style="padding:8px 0">Ürünün fotoğrafını çek — iyi ışıkta, 3-4 kare yeterli.</td></tr>
        <tr><td style="padding:8px 0;vertical-align:top"><strong style="color:#f97316">2</strong></td><td style="padding:8px 0">Kategori, marka ve bedeni seç. Bu üçü aramalarda bulunmanı sağlıyor.</td></tr>
        <tr><td style="padding:8px 0;vertical-align:top"><strong style="color:#f97316">3</strong></td><td style="padding:8px 0">Fiyatı yaz ve yayınla. Komisyon yok, ilan vermek tamamen ücretsiz.</td></tr>
      </table>
      <a href="${this.appUrl}/ilan-ver" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">İlan Ver</a>
      <p style="color:#888;font-size:13px">Satmak istemiyorsan da sorun değil - alarm kurup aradığın ürün çıkınca haber alabilirsin.</p>
    `));
  }

  /** Haftalık kayıtlı arama özeti. */
  async sendSavedSearchWeeklyEmail(
    email: string,
    name: string,
    toplam: number,
    ornekler: { title: string; price: number; slug: string }[],
  ) {
    const satirlar = ornekler.map(o => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee">
          <a href="${this.appUrl}/ilan/${o.slug}" style="color:#1c1917;text-decoration:none;font-weight:600">${o.title}</a>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;font-weight:700;color:#f97316">${o.price.toLocaleString('tr-TR')} ₺</td>
      </tr>`).join('');
    await this.send(email, `🔍 Aramalarına uyan ${toplam} yeni ilan`, this.wrap(`
      <h2 style="color:#f97316;margin:0 0 16px">Bu Hafta Senin İçin 🔍</h2>
      <p>Merhaba ${name},</p>
      <p>Kayıtlı aramalarına uyan <strong>${toplam} yeni ilan</strong> yayınlandı${ornekler.length < toplam ? ` — işte birkaçı:` : ':'}</p>
      <table style="width:100%;border-collapse:collapse;margin:14px 0">${satirlar}</table>
      <a href="${this.appUrl}/alarmlarim" style="display:inline-block;background:#f97316;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Tüm Alarmlarım</a>
      <p style="color:#888;font-size:13px">Bu özeti almak istemiyorsan alarmlarını <a href="${this.appUrl}/alarmlarim" style="color:#f97316">buradan</a> yönetebilirsin.</p>
    `));
  }

  /**
   * Güvenlik maili: parola değişti ya da yeni cihazdan giriş yapıldı.
   *
   * Hesap ele geçirilmesinde kullanıcının durumu fark etmesini sağlayan tek
   * şey bu mail. Bildirim tercihlerine BAKILMIYOR - güvenlik uyarısı
   * kapatılabilir bir tercih değil.
   */
  async sendSecurityAlertEmail(
    email: string,
    name: string,
    olay: 'password_changed' | 'new_device',
    detay: { ip?: string; cihaz?: string; tarih: Date },
  ) {
    const baslik = olay === 'password_changed' ? 'Parolan değiştirildi' : 'Yeni bir cihazdan giriş yapıldı';
    const aciklama = olay === 'password_changed'
      ? 'Hesabının parolası az önce değiştirildi.'
      : 'Hesabına daha önce kullanılmamış bir cihazdan giriş yapıldı.';
    const zaman = detay.tarih.toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
    await this.send(email, `🔐 ${baslik} — Motorya`, this.wrap(`
      <h2 style="color:#dc2626;margin:0 0 16px">🔐 ${baslik}</h2>
      <p>Merhaba ${name},</p>
      <p>${aciklama}</p>
      <table style="width:100%;border-collapse:collapse;background:#f8f8f7;border-radius:8px;margin:14px 0">
        <tr><td style="padding:10px 14px;color:#555">Tarih</td><td style="padding:10px 14px;text-align:right;font-weight:600">${zaman}</td></tr>
        ${detay.cihaz ? `<tr><td style="padding:10px 14px;color:#555">Cihaz</td><td style="padding:10px 14px;text-align:right;font-weight:600">${detay.cihaz}</td></tr>` : ''}
        ${detay.ip ? `<tr><td style="padding:10px 14px;color:#555">IP adresi</td><td style="padding:10px 14px;text-align:right;font-weight:600">${detay.ip}</td></tr>` : ''}
      </table>
      <p><strong>Bunu sen yaptıysan</strong> yapman gereken bir şey yok.</p>
      <p><strong>Sen yapmadıysan</strong> hemen parolanı değiştir ve bize yaz - hesabın risk altında olabilir.</p>
      <a href="${this.appUrl}/profilim" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Hesap Güvenliği</a>
      <p style="color:#888;font-size:13px">Bu bir güvenlik uyarısıdır; bildirim ayarlarından kapatılamaz.</p>
    `));
  }

  /**
   * Gerçek olmayan alan adlarına mail denenmez.
   *
   * RFC 2606, example.com / example.net / .test / .invalid gibi adları
   * belge ve test amacıyla AYIRMIŞTIR - bu adreslere posta teslim edilemez
   * ve Resend bunları doğrudan reddeder.
   *
   * Neden gerekli: üretim veritabanında seed döneminden kalma
   * selin@example.com gibi hesaplar duruyor ve gerçek konuşmalara
   * katılmışlar. Okunmamış mesaj hatırlatması her gün onlara mail atmaya
   * çalışıyor, Resend her seferinde hata döndürüyor ve hata günlüğü bu
   * kayıtlarla doluyordu - günde dört satır, hiçbiri eyleme dönüşebilir
   * değil. Hesaplar ne zaman temizlenirse temizlensin, gelecekte başka test
   * verisi de girebileceği için kontrol kalıcı olarak burada duruyor.
   */
  private gonderilemezAdres(to: string): boolean {
    const alan = to.split('@')[1]?.toLowerCase() ?? '';
    if (!alan) return true;
    const ayrilmis = ['example.com', 'example.net', 'example.org', 'example.edu'];
    const ayrilmisSonEk = ['.test', '.invalid', '.localhost', '.example'];
    return ayrilmis.includes(alan) || ayrilmisSonEk.some(s => alan.endsWith(s));
  }

  private async send(to: string, subject: string, html: string) {
    if (this.gonderilemezAdres(to)) {
      // Hata günlüğüne yazmıyoruz: bu bir arıza değil, beklenen bir durum.
      this.logger.debug(`Test alan adı, mail atlandı (${to})`);
      return;
    }

    const cfg = await this.getMailConfig();
    if (!cfg) {
      this.logger.warn('Resend yapılandırılmamış, mail atlanıyor');
      this.errorLogs.log({
        source: 'integration',
        message: `Resend yapılandırılmamış — mail gönderilemedi: "${subject}"`,
        context: { provider: 'resend', to, subject },
      });
      return;
    }
    try {
      // Resend hatayı fırlatmaz, { data, error } döner — error'ı elle kontrol et.
      const { error } = await cfg.resend.emails.send({
        from: `Motorya <${cfg.from}>`,
        to: [to],
        subject,
        html,
      });
      if (error) throw new Error(`${error.name}: ${error.message}`);
    } catch (err: any) {
      this.logger.error(`Mail gönderilemedi (${to}): ${err?.message}`);
      this.errorLogs.log({
        source: 'integration',
        message: `Resend gönderim hatası (${to}): ${err?.message ?? 'bilinmeyen hata'}`,
        stack: err?.stack ?? null,
        context: { provider: 'resend', to, subject },
      });
    }
  }
}
