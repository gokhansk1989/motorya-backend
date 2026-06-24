const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SystemSetting" (
      "key"       TEXT NOT NULL,
      "value"     JSONB NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
    );
  `);

  console.log('✓ User.notificationPrefs and SystemSetting added');
}

main().catch(console.error).finally(() => prisma.$disconnect());
