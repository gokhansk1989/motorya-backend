import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

function validateTcKimlik(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const digit10 = ((odd * 7) - even) % 10;
  if (digit10 < 0 || digit10 !== d[9]) return false;
  const sum10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return (sum10 % 10) === d[10];
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

// Onay metinleri güncellendiğinde sürüm artırılmalı — geçmiş onaylar hangi metne
// verildiğini kaybetmesin diye eski UserConsent satırları değiştirilmez, yenisi eklenir.
const TERMS_VERSION = 'v1';
const KVKK_VERSION = 'v1';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mail: MailService,
    private audit: AuditService,
    private settings: SettingsService,
  ) {}

  async register(dto: RegisterDto, ip?: string): Promise<{ message: string }> {
    if (await this.settings.get('maintenance_mode')) {
      throw new ServiceUnavailableException('Sistem bakımda, lütfen daha sonra tekrar deneyin.');
    }
    if (!(await this.settings.get('new_registrations'))) {
      throw new ServiceUnavailableException('Yeni kayıtlar şu anda kapalı.');
    }
    if (dto.tcKimlik && !validateTcKimlik(dto.tcKimlik)) {
      throw new BadRequestException('Geçersiz TC Kimlik numarası');
    }

    const [byEmail, byTc, byPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      dto.tcKimlik ? this.prisma.user.findFirst({ where: { tcKimlik: dto.tcKimlik } }) : null,
      this.prisma.user.findUnique({ where: { phone: dto.phone } }),
    ]);

    if (byEmail) throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
    if (byTc) throw new ConflictException('Bu TC Kimlik numarası zaten kayıtlı');
    if (byPhone) throw new ConflictException('Bu telefon numarası zaten kayıtlı');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const token = generateToken();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hashedPassword,
        displayName: dto.displayName,
        tcKimlik: dto.tcKimlik,
        phone: dto.phone,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        gender: dto.gender,
        city: dto.city,
        district: dto.district,
        status: 'PENDING',
        emailVerificationToken: token,
        emailVerificationExpiry: expiry,
      },
    });

    // Onay kayıtları — değişmez log, ileride hukuki ispat için kullanılır.
    await this.prisma.userConsent.createMany({
      data: [
        { userId: user.id, type: 'TERMS', accepted: true, version: TERMS_VERSION, ip },
        { userId: user.id, type: 'KVKK', accepted: true, version: KVKK_VERSION, ip },
        { userId: user.id, type: 'MARKETING', accepted: !!dto.acceptedMarketing, version: KVKK_VERSION, ip },
      ],
    });

    await this.mail.sendVerificationEmail(user.email, user.displayName, token);

    return { message: 'Kayıt başarılı. E-posta adresinize doğrulama linki gönderdik.' };
  }

  async verifyEmail(token: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { emailVerificationToken: token } });
    if (!user) throw new BadRequestException('Geçersiz doğrulama linki');
    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      throw new BadRequestException('Doğrulama linkinin süresi dolmuş. Yeni link talep edebilirsin.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
    };
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return { message: 'İşlem tamamlandı.' };

    const token = generateToken();
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: token, emailVerificationExpiry: expiry },
    });

    await this.mail.sendVerificationEmail(user.email, user.displayName, token);
    return { message: 'Doğrulama linki tekrar gönderildi.' };
  }

  async login(dto: LoginDto, isAdminPanel = false, ip?: string, userAgent?: string): Promise<AuthResponseDto> {
    if (!isAdminPanel && (await this.settings.get('maintenance_mode'))) {
      throw new ServiceUnavailableException('Sistem bakımda, lütfen daha sonra tekrar deneyin.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('E-posta veya şifre hatalı');

    if (!user.passwordHash) throw new UnauthorizedException('Bu hesap Google ile oluşturulmuştur. Google ile giriş yapın.');
    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      this.audit.log({ actorId: user.id, action: 'auth.login_failed', entity: 'User', entityId: user.id, ip, userAgent });
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('E-posta adresinizi doğrulamanız gerekiyor. Lütfen gelen kutunuzu kontrol edin.');
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new UnauthorizedException('Hesabınız askıya alınmıştır.');
    }

    // MFA sadece admin panelinden gelen isteklerde ve admin rolündeyse devreye girer
    const isAdminUser = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(user.role);
    if (isAdminPanel && isAdminUser) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { adminMfaOtp: otp, adminMfaOtpExpiry: expiry },
      });
      this.mail.sendAdminMfaEmail(user.email, user.displayName, otp).catch(() => null);
      return { mfaRequired: true, email: user.email } as any;
    }

    this.audit.log({ actorId: user.id, action: 'auth.login_success', entity: 'User', entityId: user.id, ip, userAgent });

    // Mobil cihazdan giriş: kısa ömürlü access token + Device kaydına bağlı refresh token
    if (dto.platform) {
      const { deviceId, refreshToken } = await this.issueDeviceSession(user.id, dto.platform, dto.deviceModel, dto.appVersion);
      const accessToken = this.jwtService.sign({ sub: user.id, email: user.email }, { expiresIn: '2h' });
      return {
        accessToken,
        refreshToken,
        deviceId,
        user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
      };
    }

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
    };
  }

  // Web girişinde Device kaydı yok (cookie/JWT 24h yeterli) — sadece mobil için.
  private async issueDeviceSession(userId: string, platform: 'IOS' | 'ANDROID', deviceModel?: string, appVersion?: string) {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const device = await this.prisma.device.create({
      data: { userId, platform, model: deviceModel, appVersion, refreshTokenHash },
    });
    return { deviceId: device.id, refreshToken };
  }

  async refreshAccessToken(deviceId: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.revokedAt) throw new UnauthorizedException('Oturum geçersiz, lütfen tekrar giriş yapın');

    const valid = await bcrypt.compare(refreshToken, device.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Oturum geçersiz, lütfen tekrar giriş yapın');

    const user = await this.prisma.user.findUnique({ where: { id: device.userId } });
    if (!user || user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new UnauthorizedException('Hesabınız askıya alınmıştır.');
    }

    // Rotasyon: her refresh'te yeni refresh token üretilir, eskisi artık geçersiz.
    const newRefreshToken = generateRefreshToken();
    const newHash = await bcrypt.hash(newRefreshToken, 10);
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { refreshTokenHash: newHash, lastSeenAt: new Date() },
    });

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email }, { expiresIn: '2h' });
    return { accessToken, refreshToken: newRefreshToken };
  }

  async revokeDevice(userId: string, deviceId: string): Promise<{ ok: boolean }> {
    await this.prisma.device.updateMany({
      where: { id: deviceId, userId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async loginWithGoogle(profile: {
    googleId: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  }): Promise<AuthResponseDto> {
    const { googleId, email, displayName, avatarUrl } = profile;

    let user = await this.prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      // e-posta eşleşmesi varsa mevcut hesabı bağla
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId, avatarUrl: byEmail.avatarUrl ?? avatarUrl, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(), status: byEmail.status === 'PENDING' ? 'ACTIVE' : byEmail.status },
        });
      } else {
        // Yeni Google kullanıcısı oluştur
        user = await this.prisma.user.create({
          data: {
            email,
            googleId,
            displayName,
            avatarUrl,
            passwordHash: null,
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
          },
        });
      }
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new UnauthorizedException('Hesabınız askıya alınmıştır.');
    }

    const termsConsent = await this.prisma.userConsent.findFirst({ where: { userId: user.id, type: 'TERMS' } });

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
      needsConsent: !termsConsent,
    };
  }

  // Google ile kayıt sözleşme/KVKK onaylarını atlıyor — ilk girişte ayrı bir ekranla tamamlanır.
  async recordConsents(userId: string, dto: { acceptedTerms: boolean; acceptedKvkk: boolean; acceptedMarketing?: boolean }, ip?: string) {
    if (!dto.acceptedTerms || !dto.acceptedKvkk) {
      throw new BadRequestException("Üyelik Sözleşmesi ve KVKK Aydınlatma Metni'ni kabul etmeniz gerekiyor");
    }
    await this.prisma.userConsent.createMany({
      data: [
        { userId, type: 'TERMS', accepted: true, version: TERMS_VERSION, ip },
        { userId, type: 'KVKK', accepted: true, version: KVKK_VERSION, ip },
        { userId, type: 'MARKETING', accepted: !!dto.acceptedMarketing, version: KVKK_VERSION, ip },
      ],
    });
    return { ok: true };
  }

  async verifyAdminMfa(email: string, otp: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.adminMfaOtp) throw new UnauthorizedException('Geçersiz doğrulama isteği');

    if (user.adminMfaOtp !== otp) throw new UnauthorizedException('Doğrulama kodu hatalı');
    if (!user.adminMfaOtpExpiry || user.adminMfaOtpExpiry < new Date()) {
      throw new UnauthorizedException('Doğrulama kodu süresi dolmuş. Tekrar giriş yapın.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { adminMfaOtp: null, adminMfaOtpExpiry: null },
    });

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email });
    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerifiedAt: user.emailVerifiedAt ?? null },
    };
  }

  async forgotPassword(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { message: 'Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi.' };

    const token = generateToken();
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    await this.mail.sendPasswordResetEmail(user.email, user.displayName, token);
    return { message: 'Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi.' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { passwordResetToken: token } });
    if (!user) throw new BadRequestException('Geçersiz veya süresi dolmuş link');
    if (user.passwordResetExpiry && user.passwordResetExpiry < new Date()) {
      throw new BadRequestException('Şifre sıfırlama linkinin süresi dolmuş');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpiry: null },
    });

    return { message: 'Şifreniz başarıyla güncellendi.' };
  }
}
