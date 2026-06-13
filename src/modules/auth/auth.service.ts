import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto, AuthResponseDto } from './dto/auth.dto';
import * as bcrypt from 'bcryptjs';

function validateTcKimlik(tc: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const digit10 = ((odd * 7) - even) % 10;
  if (digit10 < 0 || digit10 !== d[9]) return false;
  const sum10 = d.slice(0, 10).reduce((a, b) => a + b, 0);
  const digit11 = sum10 % 10;
  return digit11 === d[10];
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    if (!validateTcKimlik(dto.tcKimlik)) {
      throw new BadRequestException('Geçersiz TC Kimlik numarası');
    }

    const [byEmail, byTc, byPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.user.findFirst({ where: { tcKimlik: dto.tcKimlik } }),
      this.prisma.user.findUnique({ where: { phone: dto.phone } }),
    ]);

    if (byEmail) throw new ConflictException('Bu e-posta adresi zaten kayıtlı');
    if (byTc) throw new ConflictException('Bu TC Kimlik numarası zaten kayıtlı');
    if (byPhone) throw new ConflictException('Bu telefon numarası zaten kayıtlı');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: hashedPassword,
        displayName: dto.displayName,
        tcKimlik: dto.tcKimlik,
        phone: dto.phone,
        status: 'ACTIVE',
      },
    });

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email });

    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('E-posta veya şifre hatalı');

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedException('E-posta veya şifre hatalı');

    const accessToken = this.jwtService.sign({ sub: user.id, email: user.email });

    return {
      accessToken,
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }
}
