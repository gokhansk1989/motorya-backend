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

  // Geriye dönük doldurma: otomatik bağlama yalnızca yeni şikayetlerde
  // çalışıyor, eski şikayetler boş kalıyordu. Şikayet eden ile satıcı aynı
  // ilan üzerinden yazışmışsa bağı burada kuruyoruz. Yalnızca NULL olanlara
  // dokunuyor — script her açılışta koştuğu için tekrarı zararsız.
  const linked = await prisma.$executeRawUnsafe(`
    UPDATE "Report" r
    SET "conversationId" = c.id
    FROM "Conversation" c
    JOIN "Listing" l ON l.id = c."listingId"
    WHERE r."conversationId" IS NULL
      AND r."listingId" = c."listingId"
      AND EXISTS (
        SELECT 1 FROM "ConversationParticipant" p
        WHERE p."conversationId" = c.id AND p."userId" = r."reporterId"
      )
      AND EXISTS (
        SELECT 1 FROM "ConversationParticipant" p
        WHERE p."conversationId" = c.id AND p."userId" = l."sellerId"
      );
  `);
  console.log(`✓ Geriye dönük bağlanan şikayet sayısı: ${linked}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
