-- Marka - kategori eslemesi.
--
-- Eklemeli degisiklik: yeni tablo, mevcut hicbir tabloya ve kolona
-- dokunmuyor. Sira VERITABANI -> KOD. Eski kod bu tabloyu tanimiyor ama
-- varligi onu rahatsiz etmiyor.
--
-- Uygulama:
--   (echo "SET lock_timeout='3s';"; cat prisma/migrations/add_brand_category.sql) \
--     | ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -v ON_ERROR_STOP=1 -f -"
--
-- Yabanci anahtarlar Brand ve Category uzerinde kisa bir yazma kilidi alir
-- (tablolar kucuk, milisaniyeler); lock_timeout kilit kuyrugunu engelliyor.
--
-- Esleme VERISI bu betikte DEGIL: prisma/migrations/seed_brand_category.js
-- icinde, tekrar kosulabilir sekilde duruyor. Boylece esleme degistiginde
-- sema migration'i tekrar kosulmuyor.
--
-- Yeniden kosulabilir.

CREATE TABLE IF NOT EXISTS "BrandCategory" (
  "brandId"    TEXT         NOT NULL,
  "categoryId" TEXT         NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BrandCategory_pkey" PRIMARY KEY ("brandId", "categoryId")
);

CREATE INDEX IF NOT EXISTS "BrandCategory_categoryId_idx"
  ON "BrandCategory"("categoryId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandCategory_brandId_fkey') THEN
    ALTER TABLE "BrandCategory"
      ADD CONSTRAINT "BrandCategory_brandId_fkey"
      FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandCategory_categoryId_fkey') THEN
    ALTER TABLE "BrandCategory"
      ADD CONSTRAINT "BrandCategory_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
