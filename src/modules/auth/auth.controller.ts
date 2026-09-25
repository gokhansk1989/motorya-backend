import { Controller, Post, Get, Body, Query, Headers, UseGuards, Request, Res, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { verifyTurnstile } from '../../common/turnstile';
import { requiresCaptcha, recordFailed, resetAttempts } from '../../common/login-attempts';
import { RegisterDto, LoginDto, RefreshTokenDto, LogoutDeviceDto } from './dto/auth.dto';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength, Equals } from 'class-validator';
import { ConfigService } from '@nestjs/config';

class ForgotPasswordDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() turnstileToken?: string;
}
class ResetPasswordDto { @IsString() token: string; @IsString() @MinLength(8) password: string; }
class ResendVerificationDto { @IsEmail() email: string; }
class AdminMfaVerifyDto { @IsEmail() email: string; @IsString() otp: string; }
/**
 * Turnstile jetonu tasiyan istek govdeleri.
 *
 * Onceden `@Body() dto: RegisterDto & { turnstileToken?: string }` yaziliyordu.
 * TypeScript kesisim tipi icin `design:paramtypes` olarak `Object` uretir;
 * ValidationPipe metatype'i sinif olarak goremeyince DOGRULAMAYI TUMDEN
 * ATLIYORDU. Yani /auth/register, /auth/login ve /auth/forgot-password
 * uzerinde hicbir kural islemiyordu: e-posta bicimi, sifre uzunlugu,
 * kullanici adi kurallari, hatta sozlesme onayi (@Equals(true)) bile.
 *
 * Olcum: sunucunun icinden /auth/login'e "bu-eposta-degil" gonderince
 * dogrulama hatasi degil "sifre hatali" donuyordu.
 *
 * turnstileToken zaten RegisterDto/LoginDto icinde tanimliymis, yani
 * kesisim tipi hem gereksiz hem zararliydi. Dogrudan DTO sinifi
 * kullanilinca metatype gercek bir sinif oluyor ve tum kurallar yeniden
 * devreye giriyor.
 */
class ConsentsDto {
  @IsBoolean() @Equals(true, { message: "Üyelik Sözleşmesi'ni kabul etmeniz gerekiyor" })
  acceptedTerms: boolean;

  @IsBoolean() @Equals(true, { message: "KVKK Aydınlatma Metni'ni kabul etmeniz gerekiyor" })
  acceptedKvkk: boolean;

  @IsOptional() @IsBoolean() acceptedMarketing?: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {}

  // Mobil uygulamadan gelen kayıt isteklerinde Turnstile aranmaz.
  //
  // Neden: Turnstile bir TARAYICI doğrulaması. Uygulamada bunu sağlamak için
  // widget'ı kendi alan adımızdaki bir sayfada açıp WebView'e gömmüştük.
  // Gerçek cihazda test edildiğinde doğrulama hiç tamamlanmadı: widget
  // "doğrulanıyor" durumunda takılı kaldı, jeton üretilmedi ve kayıt düğmesi
  // hiç açılmadı - yani mobil kayıt tamamen kilitliydi. Cloudflare WebView'i
  // şüpheli sayıp çözülemeyen bir challenge veriyor; bu bizim kodumuzla
  // düzeltilebilecek bir şey değil.
  //
  // Mobil tarafta kalan korumalar: dakikada 5 istek sınırı (aşağıdaki
  // @Throttle), zorunlu e-posta doğrulaması ve uygulamanın imzalı binary
  // olması. Web'de Turnstile aynen duruyor - orada çalışıyor.
  //
  // DİKKAT - bu başlık taklit edilebilir: "x-client: mobile" yazan herkes
  // Turnstile'ı atlar, yani web koruması da fiilen bu başlığın arkasına
  // düşer. Bilinçli bir ödünç: alternatif, mobil kaydın hiç çalışmaması.
  // Kalıcı çözüm Turnstile değil, App Attest / Play Integrity ile
  // uygulamanın gerçekten bizim uygulamamız olduğunu kanıtlamak.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Request() req, @Headers('x-client') client?: string) {
    if (client !== 'mobile') {
      const ok = await verifyTurnstile(dto.turnstileToken, req.ip);
      if (!ok) throw new BadRequestException('Bot doğrulaması başarısız');
    }
    return this.authService.register(dto, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto, @Request() req, @Headers('x-client') client?: string) {
    if (requiresCaptcha(dto.email)) {
      const ok = await verifyTurnstile(dto.turnstileToken, req.ip);
      if (!ok) throw new BadRequestException({ message: 'Bot doğrulaması gerekli', captchaRequired: true });
    }
    try {
      const result = await this.authService.login(dto, client === 'admin-panel', req.ip, req.headers['user-agent']);
      resetAttempts(dto.email);
      return result;
    } catch (err: any) {
      recordFailed(dto.email);
      if (requiresCaptcha(dto.email)) {
        const original = err?.response?.message ?? err?.message ?? 'Giriş başarısız';
        throw new BadRequestException({ message: original, captchaRequired: true });
      }
      throw err;
    }
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  // Şifre sıfırlamada da aynı durum: uygulama jeton üretemiyor.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Request() req, @Headers('x-client') client?: string) {
    if (client !== 'mobile') {
      const ok = await verifyTurnstile(dto.turnstileToken, req.ip);
      if (!ok) throw new BadRequestException('Bot doğrulaması başarısız');
    }
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin-mfa-verify')
  verifyAdminMfa(@Body() dto: AdminMfaVerifyDto, @Request() req) {
    // ip/userAgent denetim kaydı için: admin paneline kimin nereden girdiği
    // güvenlik incelemesinde gereken ilk bilgi.
    return this.authService.verifyAdminMfa(dto.email, dto.otp, req.ip, req.headers['user-agent']);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Request() req, @Res() res) {
    const { accessToken, refreshToken, deviceId, user, needsConsent } = req.user as any;
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://motorya.com.tr');
    const userEncoded = encodeURIComponent(JSON.stringify(user));
    const rt = refreshToken ? `&refreshToken=${encodeURIComponent(refreshToken)}` : '';
    const did = deviceId ? `&deviceId=${encodeURIComponent(deviceId)}` : '';
    return res.redirect(`${frontendUrl}/callback?token=${accessToken}${rt}${did}&user=${userEncoded}&needsConsent=${!!needsConsent}`);
  }

  @Post('consents')
  @UseGuards(AuthGuard('jwt'))
  recordConsents(@Request() req, @Body() dto: ConsentsDto) {
    return this.authService.recordConsents(req.user.id, dto, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.deviceId, dto.refreshToken);
  }

  @Post('logout-device')
  @UseGuards(AuthGuard('jwt'))
  logoutDevice(@Request() req, @Body() dto: LogoutDeviceDto) {
    return this.authService.revokeDevice(req.user.id, dto.deviceId);
  }
}
