const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "district" TEXT;`);
  console.log('✓ Listing.district added');
}
main().catch(console.error).finally(() => prisma.$disconnect());
