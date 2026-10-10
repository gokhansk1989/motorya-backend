import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { getJwtSecret } from '../../common/jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: { sub: string; email: string; iat?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    // Hesabı silinmiş veya yasaklanmış kullanıcının elindeki access token,
    // süresi dolana kadar (2 saat) geçerli kalmasın.
    if (user.deletedAt) {
      throw new UnauthorizedException('Bu hesap silinmiş');
    }
    if (user.status === 'BANNED' || user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Bu hesap askıya alınmış');
    }
    // Sifre degisiminde cihazlar (refresh) iptal ediliyor, ama imzali access
    // token durumsuz oldugu icin suresi dolana kadar calismaya devam
    // ediyordu: hesabini kurtaran kullanici saldirgani iki saat daha
    // disari atamiyordu. Jeton sifre degisiminden onceyse reddediyoruz.
    if (user.passwordChangedAt && payload.iat) {
      // iat saniye cinsinden; bir saniyelik tolerans birakiyoruz ki ayni
      // saniyede uretilen taze jeton yanlislikla reddedilmesin.
      if (payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
        throw new UnauthorizedException('Şifre değişti, lütfen tekrar giriş yapın');
      }
    }
    return user;
  }
}
