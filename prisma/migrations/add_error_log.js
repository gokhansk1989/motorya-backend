const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ErrorLog" (
      "id"         TEXT NOT NULL,
      "source"     TEXT NOT NULL,
      "message"    TEXT NOT NULL,
      "stack"      TEXT,
      "path"       TEXT,
      "method"     TEXT,
      "statusCode" INTEGER,
      "userId"     TEXT,
      "context"    JSONB,
      "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ErrorLog_source_createdAt_idx" ON "ErrorLog"("source", "createdAt");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ErrorLog_createdAt_idx" ON "ErrorLog"("createdAt");`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
