const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// User.lastLoginAt'i mevcut denetim kayitlarindan bir kez doldurur.
//
// Neden: "son giris" bilgisi bugune kadar yalnizca AuditLog'dan
// turetiliyordu ve o tablo her gun budaniyor - 30 gunden eski kayitlar
// siliniyor. Kalici kolon yeni eklendigi icin bos; doldurulmazsa son 30
// gunde giris yapmis kullanicilarin bilgisi de bir sonraki budamada
// kaybolacak.
//
// Yeniden kosulabilir: yalnizca lastLoginAt'i BOS olanlari dolduruyor.
// Kolon dolduktan sonra tekrar calistirmak hicbir sey degistirmez - canli
// bir girisin uzerine eski bir denetim kaydini yazmak geri donulemez
// olurdu.
async function main() {
  const kayitlar = await prisma.auditLog.groupBy({
    by: ['actorId'],
    where: { action: 'auth.login_success' },
    _max: { createdAt: true },
  });

  let yazilan = 0;
  for (const k of kayitlar) {
    if (!k.actorId || !k._max.createdAt) continue;
    const sonuc = await prisma.user.updateMany({
      where: { id: k.actorId, lastLoginAt: null },
      data: { lastLoginAt: k._max.createdAt },
    });
    yazilan += sonuc.count;
  }

  console.log(`✓ ${kayitlar.length} kullanicinin denetim kaydi tarandi, ${yazilan} tanesine son giris yazildi`);
  console.log('  Zaten dolu olanlara dokunulmadi.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
