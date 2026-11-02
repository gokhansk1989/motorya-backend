import { ErrorLogsService } from './error-logs.service';

/**
 * Zamanlanmış görevleri (@Cron) hata kaydına bağlayan decorator.
 *
 * ── NEDEN ─────────────────────────────────────────────────────────
 *
 * Cron görevleri HTTP isteği değil; AllExceptionsFilter onları GÖRMÜYOR.
 * Bir görev patlarsa (DB hatası, mail servisi down) NestJS yalnızca
 * konsola/pm2'ye yazıyor ve iz ErrorLog'a hiç düşmüyordu. Sonuç:
 * "hatırlatma mailleri gelmiyor", "süresi dolan ilanlar düşmüyor" gibi
 * sorunlar panelde GÖRÜNMEDEN günlerce sürebilirdi. 15 görevin hiçbiri
 * try/catch ile korunmuyordu.
 *
 * Bu decorator görevi sarıyor: hata olursa source='gorev' ile ErrorLog'a
 * yaziyor ve YUTUYOR — bir görevin patlaması zamanlayıcıyı durdurmasın,
 * diğer görevler çalışmaya devam etsin. Görev gövdelerine dokunulmuyor.
 *
 * `this.errorLogs` görevin ait olduğu servis örneğinden okunuyor; o
 * yüzden servis ErrorLogsService'i `errorLogs` adıyla inject etmeli.
 */
export function GorevKorumasi(): MethodDecorator {
  return (_hedef, anahtar, tanim: PropertyDescriptor) => {
    const orijinal = tanim.value;
    tanim.value = async function (this: { errorLogs?: ErrorLogsService }, ...args: unknown[]) {
      try {
        return await orijinal.apply(this, args);
      } catch (e: any) {
        this.errorLogs?.log({
          source: 'gorev',
          message: `${String(anahtar)}: ${e?.message ?? 'bilinmeyen hata'}`,
          stack: e?.stack ?? null,
        });
      }
    };
    return tanim;
  };
}
