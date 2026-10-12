-- Huni olcumu icin olay tablosu.
--
-- Eklemeli degisiklik: yeni tablo, mevcut hicbir tabloyu ve hicbir kolonu
-- degistirmiyor. Bu yuzden motorya-db-migration duzeni geregi sira
-- VERITABANI -> KOD. Eski kod bu tabloyu tanimiyor ama varligi onu
-- rahatsiz etmiyor; yeni kod tablo olmadan olay yazmaya calisirsa
-- AnalyticsService hatayi yutuyor, kullanici etkilenmiyor.
--
-- Uygulama:
--   ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -f -" < prisma/migrations/add_analytics_event.sql
--
-- Yeniden kosulabilir: tum ifadeler IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
  "id"         TEXT         NOT NULL,
  "eventId"    TEXT         NOT NULL,
  "name"       TEXT         NOT NULL,
  "flowId"     TEXT,
  "userId"     TEXT,
  "isStaff"    BOOLEAN      NOT NULL DEFAULT false,
  "props"      JSONB        NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- Tekrar gonderilen ayni olayin iki kez sayilmasini engelleyen kisit.
-- createMany(skipDuplicates) bu indekse dayaniyor.
CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsEvent_eventId_key"
  ON "AnalyticsEvent"("eventId");

CREATE INDEX IF NOT EXISTS "AnalyticsEvent_name_occurredAt_idx"
  ON "AnalyticsEvent"("name", "occurredAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_flowId_idx"
  ON "AnalyticsEvent"("flowId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_occurredAt_idx"
  ON "AnalyticsEvent"("occurredAt");

-- Hesap silinince o hesabin olaylari da silinir. Saklama politikasinin
-- "silme" tarafi bu kisitla taniml; ayrica gunluk gorev 180 gunden
-- eskileri duserek yas sinirini uyguluyor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AnalyticsEvent_userId_fkey'
  ) THEN
    ALTER TABLE "AnalyticsEvent"
      ADD CONSTRAINT "AnalyticsEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
