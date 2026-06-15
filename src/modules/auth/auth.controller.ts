import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { IsEmail, IsString, MinLength } from 'class-validator';

class ForgotPasswordDto { @IsEmail() email: string; }
class ResetPasswordDto { @IsString() token: string; @IsString() @MinLength(8) password: string; }
class ResendVerificationDto { @IsEmail() email: string; }
class AdminMfaVerifyDto { @IsEmail() email: string; @IsString() otp: string; }

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('admin-mfa-verify')
  verifyAdminMfa(@Body() dto: AdminMfaVerifyDto) {
    return this.authService.verifyAdminMfa(dto.email, dto.otp);
  }
}
