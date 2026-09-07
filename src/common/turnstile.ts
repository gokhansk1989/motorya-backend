/**
 * Cloudflare Turnstile doğrulama yardımcısı.
 *
 * TURNSTILE_SECRET tanımlı değilse (dev veya key alınmadan önce) verify no-op
 * true döner — endpoint'ler bozulmaz. Key eklendiğinde otomatik aktif olur.
 *
 * Kullanım: controller'da body'den cf-turnstile-response alanını okuyup
 * verifyTurnstile(token, ip) çağır; false dönerse BadRequestException.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // key yok — devre dışı
  if (!token) return false;
  try {
    const body = new URLSearchParams();
    body.append('secret', secret);
    body.append('response', token);
    if (ip) body.append('remoteip', ip);
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    const data: any = await res.json();
    return !!data?.success;
  } catch {
    return false;
  }
}
