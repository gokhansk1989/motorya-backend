import { Controller, Post, Get, Body, Query, Headers, UseGuards, Request, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, LogoutDeviceDto } from './dto/auth.dto';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength, Equals } from 'class-validator';
import { ConfigService } from '@nestjs/config';

class ForgotPasswordDto { @IsEmail() email: string; }
class ResetPasswordDto { @IsString() token: string; @IsString() @MinLength(8) password: string; }
class ResendVerificationDto { @IsEmail() email: string; }
class AdminMfaVerifyDto { @IsEmail() email: string; @IsString() otp: string; }
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

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto, @Request() req) {
    return this.authService.register(dto, req.ip);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  login(@Body() dto: LoginDto, @Request() req, @Headers('x-client') client?: string) {
    return this.authService.login(dto, client === 'admin-panel', req.ip, req.headers['user-agent']);
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin-mfa-verify')
  verifyAdminMfa(@Body() dto: AdminMfaVerifyDto) {
    return this.authService.verifyAdminMfa(dto.email, dto.otp);
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Request() req, @Res() res) {
    const { accessToken, user, needsConsent } = req.user as any;
    const frontendUrl = this.config.get('FRONTEND_URL', 'https://motorya.com.tr');
    const userEncoded = encodeURIComponent(JSON.stringify(user));
    return res.redirect(`${frontendUrl}/callback?token=${accessToken}&user=${userEncoded}&needsConsent=${!!needsConsent}`);
  }

  @Post('consents')
  @UseGuards(AuthGuard('jwt'))
  recordConsents(@Request() req, @Body() dto: ConsentsDto) {
    return this.authService.recordConsents(req.user.id, dto, req.ip);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
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
