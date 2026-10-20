-- Vitrin icin elle sira.
--
-- Eklemeli degisiklik: kolon nullable, varsayilani yok. Eski kod bu
-- kolonu hic bilmiyor ve varligi onu rahatsiz etmiyor; bu yuzden once
-- VERITABANI, sonra kod yayina alinabilir.
--
-- Bos (NULL) birakilan ilanlar sirali olanlarin ardina dusuyor; yani
-- migration calistiktan sonra, kod yayina cikana kadar da, cikinca da
-- vitrinin mevcut dizilisi degismiyor. Sira verilmedigi surece davranis
-- bugunku haliyle ayni.
--
-- Geri alma: kolonu dusurmek yerine kodu revert etmek yeterli.
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "featuredOrder" INTEGER;
CREATE INDEX IF NOT EXISTS "Listing_featuredOrder_idx" ON "Listing" ("featuredOrder");
