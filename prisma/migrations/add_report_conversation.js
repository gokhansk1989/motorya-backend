const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Şikayeti doğduğu yazışmaya bağlar. Moderatör, Şikayetler ekranından tek
// tıkla ilgili konuşmanın mesajlarına geçebilsin diye. Nullable — eski
// şikayetler ve ilan/kullanıcı üzerinden gelen şikayetler boş kalır.
// Konuşma silinirse şikayet kaydı korunur, bağ NULL'a düşer.
async function main() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "conversationId" TEXT;`,
  );

  // Foreign key ve index yalnızca yoksa eklenir — script her açılışta koşuyor.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Report_conversationId_fkey'
      ) THEN
        ALTER TABLE "Report"
          ADD CONSTRAINT "Report_conversationId_fkey"
          FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Report_conversationId_idx" ON "Report"("conversationId");`,
  );

  console.log('✓ Report.conversationId eklendi (kolon + FK + index)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
