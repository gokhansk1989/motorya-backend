const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
  `);
  console.log('Migration tamamlandı: Listing.tags kolonu eklendi.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
