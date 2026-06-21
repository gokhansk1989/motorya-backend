const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // OfferStatus enum'a COUNTER_OFFERED ekle
  await prisma.$executeRawUnsafe(`
    ALTER TYPE "OfferStatus" ADD VALUE IF NOT EXISTS 'COUNTER_OFFERED';
  `);

  // Offer tablosuna counterAmount ve counterMessage ekle
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "counterAmount" DECIMAL(12,2);
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "counterMessage" TEXT;
  `);

  console.log('Migration tamamlandı: karşı teklif alanları eklendi.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
