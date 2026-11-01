import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * İç ağdan (SSR) gelen istekleri throttle'dan muaf tutan guard.
 *
 * ── NEDEN ─────────────────────────────────────────────────────────
 *
 * Next.js, kategori ve şehir sayfalarını sunucuda üretirken API'yi
 * KENDİ docker IP'sinden (172.18.x.1) çağırıyor ve bir ziyaretçi
 * isteği olmadığı için `X-Forwarded-For` eklemiyor. Sonuç: API tüm SSR
 * trafiğini TEK istemci sayıyordu ve hepsi 100 istek/dakikalık ortak
 * kotayı paylaşıyordu. Kota dolunca 429 dönüyor, o sayfa BOŞ render
 * ediliyordu -- Googlebot'un boş sayfa gördüğü de kayıtlarda vardı.
 *
 * ── NEDEN GÜVENLİ ─────────────────────────────────────────────────
 *
 * Bu guard yalnızca docker köprüsünün KENDİ geçit adresinden gelen
 * isteği muaf tutuyor. O adresi dışarıdan taklit etmek mümkün değil:
 * `trust proxy` yalnızca nginx'e güveniyor ve istemcinin gönderdiği
 * X-Forwarded-For'a itibar etmiyor; bu IP'yi ancak docker-proxy'nin
 * kendisi üretiyor. Dolayısıyla internetten gelen hiçbir istek bu
 * muafiyete giremez.
 *
 * Dış kötüye kullanım koruması AYNEN duruyor: gerçek ziyaretçi IP'si
 * taşıyan istekler (giriş denemeleri, /users/me, /auth/refresh) eskisi
 * gibi kişi başına throttle oluyor.
 */
@Injectable()
export class IcAgThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: Parameters<ThrottlerGuard['shouldSkip']>[0]): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (icAgMi(req?.ip)) return true;
    return super.shouldSkip(context);
  }
}

/**
 * İstek docker köprüsünün geçidinden mi geliyor?
 *
 * `trust proxy` gerçek istemciyi çözebildiğinde `req.ip` o ziyaretçinin
 * IP'si olur ve bu kontrol `false` döner -- yani muafiyet yalnızca
 * XFF'siz, iç kaynaklı SSR isteğinde devreye giriyor. Adres hem düz
 * IPv4 hem IPv4-mapped IPv6 (`::ffff:172.18.0.1`) biçiminde gelebildiği
 * için ikisini de yakalıyoruz; 172.16/12 docker'ın özel ağ aralığı.
 */
export function icAgMi(ip?: string): boolean {
  if (!ip) return false;
  const sade = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (sade === '127.0.0.1' || sade === '::1') return true;
  const m = sade.match(/^172\.(\d+)\./);
  return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31;
}
