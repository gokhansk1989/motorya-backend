import * as os from 'os';
import * as fs from 'fs';

/**
 * Sunucunun kaynak durumu.
 *
 * Neden os.freemem() değil de /proc/meminfo: os.freemem() Linux'ta MemFree
 * okuyor, yani geri kazanılabilir önbelleği "dolu" sayıyor. 908MB'lık bu
 * makinede MemFree 51MB gösterirken gerçekte 273MB kullanılabilir alan vardı.
 * OOM'u tahmin eden doğru metrik MemAvailable.
 *
 * Docker'da bellek limiti tanımlı olmadığı için container host'un değerlerini
 * görüyor (ölçerek doğrulandı: container 267MB, host 273MB).
 */

export interface SystemMetrics {
  memory: { totalMb: number; availableMb: number; usedPercent: number };
  swap: { totalMb: number; usedMb: number; usedPercent: number };
  disk: { totalGb: number; freeGb: number; usedPercent: number };
  load: { avg1: number; avg5: number; avg15: number; cores: number; perCore5: number };
  uptimeHours: number;
}

function readMeminfo(): Record<string, number> {
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const out: Record<string, number> = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^(\w+):\s+(\d+)\s*kB/);
      if (m) out[m[1]] = Number(m[2]);
    }
    return out;
  } catch {
    return {};
  }
}

const mb = (kb: number) => Math.round(kb / 1024);
const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0);

export function collectSystemMetrics(): SystemMetrics {
  const mi = readMeminfo();

  // /proc/meminfo yoksa (macOS'ta yerel geliştirme) os modülüne düşüyoruz.
  const memTotalKb = mi.MemTotal ?? Math.round(os.totalmem() / 1024);
  const memAvailKb = mi.MemAvailable ?? Math.round(os.freemem() / 1024);
  const swapTotalKb = mi.SwapTotal ?? 0;
  const swapFreeKb = mi.SwapFree ?? 0;
  const swapUsedKb = Math.max(0, swapTotalKb - swapFreeKb);

  let totalGb = 0;
  let freeGb = 0;
  try {
    const s = fs.statfsSync('/');
    totalGb = (s.blocks * s.bsize) / 1073741824;
    freeGb = (s.bavail * s.bsize) / 1073741824;
  } catch {
    /* statfs yoksa disk 0 kalır, eşik kontrolü atlanır */
  }

  const [avg1, avg5, avg15] = os.loadavg();
  const cores = os.cpus().length || 1;

  return {
    memory: {
      totalMb: mb(memTotalKb),
      availableMb: mb(memAvailKb),
      usedPercent: pct(memTotalKb - memAvailKb, memTotalKb),
    },
    swap: {
      totalMb: mb(swapTotalKb),
      usedMb: mb(swapUsedKb),
      usedPercent: pct(swapUsedKb, swapTotalKb),
    },
    disk: {
      totalGb: Math.round(totalGb * 10) / 10,
      freeGb: Math.round(freeGb * 10) / 10,
      usedPercent: totalGb > 0 ? pct(totalGb - freeGb, totalGb) : 0,
    },
    load: {
      avg1: Math.round(avg1 * 100) / 100,
      avg5: Math.round(avg5 * 100) / 100,
      avg15: Math.round(avg15 * 100) / 100,
      cores,
      perCore5: Math.round((avg5 / cores) * 100) / 100,
    },
    uptimeHours: Math.round((os.uptime() / 3600) * 10) / 10,
  };
}

/**
 * Eşikler 908MB / 2 çekirdek / 47GB'lık bu sunucuya göre seçildi.
 *
 * Yük için 1 dakikalık değil 5 dakikalık ortalamayı kullanıyoruz: anlık
 * trafik dalgalanması ya da bir cron işi yüzünden gece yarısı alarm çalmasın,
 * yalnızca gerçekten sürekli bir baskı varsa uyarsın.
 */
export const THRESHOLDS = {
  memAvailableMb: 120,   // bunun altında OOM riski başlıyor
  diskUsedPercent: 90,
  loadPerCore5: 4,
  swapUsedPercent: 90,   // swap da dolduysa çöküş yakın
};

export function evaluateHealth(m: SystemMetrics): { healthy: boolean; failing: string[] } {
  const failing: string[] = [];
  if (m.memory.availableMb < THRESHOLDS.memAvailableMb) failing.push('memory');
  if (m.disk.totalGb > 0 && m.disk.usedPercent >= THRESHOLDS.diskUsedPercent) failing.push('disk');
  if (m.load.perCore5 > THRESHOLDS.loadPerCore5) failing.push('load');
  if (m.swap.totalMb > 0 && m.swap.usedPercent >= THRESHOLDS.swapUsedPercent) failing.push('swap');
  return { healthy: failing.length === 0, failing };
}
