const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserFeedback" (
      "id"           TEXT NOT NULL,
      "message"      TEXT NOT NULL,
      "page"         TEXT,
      "contactEmail" TEXT,
      "userId"       TEXT,
      "status"       TEXT NOT NULL DEFAULT 'NEW',
      "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserFeedback_status_createdAt_idx" ON "UserFeedback"("status", "createdAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserFeedback_createdAt_idx" ON "UserFeedback"("createdAt");`);
  console.log('Migration tamamlandı: UserFeedback tablosu eklendi.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
