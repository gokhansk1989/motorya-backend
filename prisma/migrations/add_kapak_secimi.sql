-- Kapak secimini fotograf sirasindan ayirir.
--
-- Eklemeli degisiklik: uc kolon da varsayilanli/nullable. Eski kod bu
-- kolonlari bilmiyor; once VERITABANI, sonra kod yayina alinabilir.
--
-- ESKI ILANLAR: hicbir satirda isCover=true olmuyor. Sunucu bu durumda
-- sortOrder'i en kucuk olan fotografi kapak sayiyor - yani bugunku
-- davranisin tipatip aynisi. Hicbir ilanin kapagi degismiyor.
--
-- Geri alma: kolonlari dusurmek yerine kodu revert etmek yeterli.
-- Kod geri alinirsa isCover okunmaz, kapak yine "ilk fotograf" olur.
ALTER TABLE "ListingImage"       ADD COLUMN IF NOT EXISTS "isCover"  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ListingDraft"       ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
ALTER TABLE "ListingPendingEdit" ADD COLUMN IF NOT EXISTS "coverUrl" TEXT;
