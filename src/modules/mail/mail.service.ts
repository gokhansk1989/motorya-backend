import { Injectable, Logger } from '@nestjs/common';
import sgMail from '@sendgrid/mail';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from = 'noreply@motorya.com.tr';
  private readonly appUrl = 'https://motorya.com.tr';

  constructor() {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
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

  private async send(to: string, subject: string, html: string) {
    try {
      await sgMail.send({ to, from: { email: this.from, name: 'Motorya' }, subject, html });
    } catch (err: any) {
      this.logger.error(`Mail gönderilemedi (${to}): ${err?.message}`);
    }
  }
}
