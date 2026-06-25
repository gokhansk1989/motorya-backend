const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "ConsentType" AS ENUM ('TERMS', 'KVKK', 'MARKETING');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "district" TEXT;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birthDate" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gender" "Gender";`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserConsent" (
      "id"        TEXT NOT NULL,
      "userId"    TEXT NOT NULL,
      "type"      "ConsentType" NOT NULL,
      "accepted"  BOOLEAN NOT NULL,
      "version"   TEXT NOT NULL,
      "ip"        TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserConsent_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "UserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "UserConsent_userId_type_idx" ON "UserConsent"("userId","type");`);

  console.log('✓ User.district/birthDate/gender and UserConsent table added');
}

main().catch(console.error).finally(() => prisma.$disconnect());
