const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// İlk 100 üyeye kalıcı "Kurucu Üye" rozeti. Kayıt akışı bundan sonrasını
// otomatik yapıyor; bu script yalnızca mevcut üyeleri geriye dönük işaretler.
// Tekrar çalıştırılabilir: zaten rozetli olanlar kontenjandan düşülür.
const LIMIT = 100;

async function main() {
  const already = await prisma.user.count({ where: { isFounder: true } });
  const remaining = LIMIT - already;
  if (remaining <= 0) {
    console.log(`✓ Kontenjan dolu (${already}/${LIMIT}), değişiklik yok`);
    return;
  }

  const candidates = await prisma.user.findMany({
    where: { isFounder: false, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: remaining,
    select: { id: true, email: true, createdAt: true },
  });

  if (candidates.length === 0) {
    console.log('✓ Rozet verilecek üye yok');
    return;
  }

  await prisma.user.updateMany({
    where: { id: { in: candidates.map(u => u.id) } },
    data: { isFounder: true },
  });

  console.log(`✓ ${candidates.length} üyeye Kurucu Üye rozeti verildi`);
  console.log(`  toplam: ${already + candidates.length}/${LIMIT}`);
  candidates.slice(0, 5).forEach(u => console.log(`    · ${u.email}`));
  if (candidates.length > 5) console.log(`    · ...ve ${candidates.length - 5} kişi daha`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
