/**
 * Login başarısızlık sayacı — 5. fail'den sonra Turnstile zorunlu.
 * Bellek içi Map (tek API instance'ı olduğu için yeterli); TTL 30dk.
 */

const THRESHOLD = 5;
const TTL_MS = 30 * 60 * 1000;

interface Entry { count: number; resetAt: number; }
const attempts = new Map<string, Entry>();

function normalize(email: string) {
  return email.trim().toLowerCase();
}

function purge(key: string): Entry | undefined {
  const e = attempts.get(key);
  if (!e) return undefined;
  if (e.resetAt < Date.now()) {
    attempts.delete(key);
    return undefined;
  }
  return e;
}

export function requiresCaptcha(email: string): boolean {
  const e = purge(normalize(email));
  return !!e && e.count >= THRESHOLD;
}

export function recordFailed(email: string): void {
  const key = normalize(email);
  const e = purge(key);
  if (e) {
    e.count += 1;
    e.resetAt = Date.now() + TTL_MS;
  } else {
    attempts.set(key, { count: 1, resetAt: Date.now() + TTL_MS });
  }
}

export function resetAttempts(email: string): void {
  attempts.delete(normalize(email));
}
