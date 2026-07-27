const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Satış tamamlandığında alıcıyı kaydeder. Yorum hakkı yalnızca kabul edilmiş
// teklife bağlıyken, mesajlaşarak anlaşan çiftler (asıl yaygın akış) hiç
// değerlendirme bırakamıyordu.
async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "soldToUserId" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "Listing" ADD CONSTRAINT "Listing_soldToUserId_fkey"
        FOREIGN KEY ("soldToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Listing_soldToUserId_idx" ON "Listing"("soldToUserId");`);
  console.log('✓ Listing.soldToUserId + soldAt added');
}
main().catch(console.error).finally(() => prisma.$disconnect());
