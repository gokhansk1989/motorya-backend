const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Review tablosunu Order bağımlılığından kurtar: orderId → listingId
  // Önce Review tablosuna listingId sütunu ekle
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "listingId" TEXT;
  `);

  // Mevcut review kayıtlarını order → listing üzerinden güncelle (Order tablosu varsa)
  const orderExists = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Order' LIMIT 1;
  `;
  if (orderExists.length > 0) {
    await prisma.$executeRawUnsafe(`
      UPDATE "Review" r
      SET "listingId" = o."listingId"
      FROM "Order" o
      WHERE r."orderId" = o."id"
      AND r."listingId" IS NULL;
    `);
  }

  // listingId NOT NULL yap (eğer nullable ise)
  const isNullable = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Review' AND column_name = 'listingId' AND is_nullable = 'YES' LIMIT 1;
  `;
  if (isNullable.length > 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Review" ALTER COLUMN "listingId" SET NOT NULL;
    `);
  }

  // Eski unique constraint kaldır, yeni unique ekle
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_orderId_direction_key";
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_listingId_direction_key";
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Review" ADD CONSTRAINT "Review_listingId_direction_key" UNIQUE ("listingId", "direction");
  `);

  // orderId sütununu kaldır
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Review" DROP COLUMN IF EXISTS "orderId";
  `);

  // Review → Listing FK ekle
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_listingId_fkey";
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Review" ADD CONSTRAINT "Review_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE;
  `);

  // Review index güncelle
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS "Review_targetUserId_createdAt_idx";
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Review_targetUserId_createdAt_idx" ON "Review"("targetUserId", "createdAt");
  `);

  // 2. Listing tablosuna reservedUntil ekle
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "reservedUntil" TIMESTAMP(3);
  `);

  // 3. Dispute/DisputeMessage/Payout/Payment/Shipment/Order tabloları — bağımlılık sırasıyla
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "DisputeMessage" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Dispute" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Payout" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Payment" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Shipment" CASCADE;`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Order" CASCADE;`);

  console.log('Migration tamamlandı: B akışına geçildi.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
