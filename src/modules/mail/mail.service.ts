import { Injectable, Logger } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { IntegrationsService } from '../integrations/integrations.service';
import { ErrorLogsService } from '../error-logs/error-logs.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly appUrl = 'https://motorya.com.tr';
  private readonly adminUrl = process.env.ADMIN_URL ?? 'https://admin.motorya.com.tr';

  constructor(private integrations: IntegrationsService, private errorLogs: ErrorLogsService) {}

  private async getSgConfig(): Promise<{ apiKey: string; from: string } | null> {
    const cfg = await this.integrations.getConfig('sendgrid');
    const apiKey = cfg.api_key || process.env.SENDGRID_API_KEY;
    const from = cfg.from_email || 'noreply@motorya.com.tr';
    if (!apiKey) return null;
    return { apiKey, from };
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

  private async send(to: string, subject: string, html: string) {
    const cfg = await this.getSgConfig();
    if (!cfg) {
      this.logger.warn('SendGrid yapılandırılmamış, mail atlanıyor');
      this.errorLogs.log({
        source: 'integration',
        message: `SendGrid yapılandırılmamış — mail gönderilemedi: "${subject}"`,
        context: { provider: 'sendgrid', to, subject },
      });
      return;
    }
    try {
      sgMail.setApiKey(cfg.apiKey);
      await sgMail.send({ to, from: { email: cfg.from, name: 'Motorya' }, subject, html });
    } catch (err: any) {
      this.logger.error(`Mail gönderilemedi (${to}): ${err?.message}`);
      this.errorLogs.log({
        source: 'integration',
        message: `SendGrid gönderim hatası (${to}): ${err?.message ?? 'bilinmeyen hata'}`,
        stack: err?.stack ?? null,
        context: { provider: 'sendgrid', to, subject },
      });
    }
  }
}
