const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserFollow" (
      "id"          TEXT NOT NULL,
      "followerId"  TEXT NOT NULL,
      "followingId" TEXT NOT NULL,
      "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "UserFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "UserFollow_followerId_followingId_key" ON "UserFollow"("followerId","followingId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserFollow_followerId_idx" ON "UserFollow"("followerId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserFollow_followingId_idx" ON "UserFollow"("followingId");`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserBlock" (
      "id"        TEXT NOT NULL,
      "blockerId" TEXT NOT NULL,
      "blockedId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId","blockedId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserBlock_blockerId_idx" ON "UserBlock"("blockerId");`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");`);

  console.log('✓ UserFollow and UserBlock tables created');
}

main().catch(console.error).finally(() => prisma.$disconnect());
