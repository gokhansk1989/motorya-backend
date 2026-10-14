-- Taslak, bekleyen duzenleme ve test isareti.
--
-- Eklemeli degisiklik: iki yeni tablo ve iki yeni kolon. Mevcut hicbir
-- kolon degismiyor, hicbir satir guncellenmiyor. Sira VERITABANI -> KOD.
--
-- Uygulama:
--   (echo "SET lock_timeout='3s';"; cat prisma/migrations/add_draft_pending_edit_test_flag.sql) \
--     | ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -v ON_ERROR_STOP=1 -f -"
--
-- Yeniden kosulabilir.
--
-- GERI DONUS: iki tabloyu dusurmek ve iki kolonu kaldirmak yeterli.
--   DROP TABLE "ListingPendingEdit"; DROP TABLE "ListingDraft";
--   ALTER TABLE "Listing" DROP COLUMN "isTest";
--   ALTER TABLE "User" DROP COLUMN "isTestAccount";
-- Kayip: bekleyen duzenlemeler ve kaydedilmis taslaklar silinir (yayindaki
-- ilanlar etkilenmez), test isaretleri kaybolur. Eski kod bu kolonlarin
-- varligindan etkilenmiyor, yani geri donus kod deploy'u beklemeden
-- yapilabilir.

-- ── Test isareti ──────────────────────────────────────────────────────
ALTER TABLE "User"    ADD COLUMN IF NOT EXISTS "isTestAccount" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "isTest"        BOOLEAN NOT NULL DEFAULT false;

-- Test ilanlari genel listelerden cikariliyor; kismi indeks sorgulari
-- "isTest = false" kosuluyla calisacagi icin tam tablo taramasi olmasin.
CREATE INDEX IF NOT EXISTS "Listing_isTest_status_idx" ON "Listing"("isTest", "status");

-- ── Taslak ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ListingDraft" (
  "id"        TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "payload"   JSONB        NOT NULL DEFAULT '{}',
  "imageUrls" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "step"      INTEGER      NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListingDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListingDraft_userId_key" ON "ListingDraft"("userId");
CREATE INDEX IF NOT EXISTS "ListingDraft_updatedAt_idx" ON "ListingDraft"("updatedAt");

-- ── Bekleyen duzenleme ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ListingPendingEdit" (
  "id"            TEXT         NOT NULL,
  "listingId"     TEXT         NOT NULL,
  "title"         TEXT,
  "description"   TEXT,
  "categoryId"    TEXT,
  "brandId"       TEXT,
  "condition"     "ListingCondition",
  "gender"        "ListingGender",
  "sizeLabel"     TEXT,
  "imageUrls"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  "imagesChanged" BOOLEAN      NOT NULL DEFAULT false,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListingPendingEdit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListingPendingEdit_listingId_key" ON "ListingPendingEdit"("listingId");
CREATE INDEX IF NOT EXISTS "ListingPendingEdit_createdAt_idx" ON "ListingPendingEdit"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ListingDraft_userId_fkey') THEN
    ALTER TABLE "ListingDraft" ADD CONSTRAINT "ListingDraft_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ListingPendingEdit_listingId_fkey') THEN
    ALTER TABLE "ListingPendingEdit" ADD CONSTRAINT "ListingPendingEdit_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
