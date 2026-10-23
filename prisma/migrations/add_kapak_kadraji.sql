-- Kapak kadraji: oransal, geri alinabilir, turetilmis dosya uretmeyen.
--
-- Eklemeli degisiklik: uc kolon da nullable ya da varsayilanli. Eski kod
-- bu kolonlari bilmiyor ve varliklari onu rahatsiz etmiyor; bu yuzden
-- once VERITABANI, sonra kod yayina alinabilir.
--
-- Eski ilanlar: crop NULL kalir, yani "kadraj yok" demektir ve fotografin
-- tamami kullanilir. Bugunku davranis bu oldugu icin hicbir eski ilanin
-- gorunumu degismez.
--
-- Geri alma: kolonlari dusurmek yerine kodu revert etmek yeterli. Kod
-- geri alinirsa kadrajlar satirlarda kalir ama okunmaz; ileride kod
-- tekrar yayina girerse kaldiklari yerden calisirlar.
ALTER TABLE "ListingImage"       ADD COLUMN IF NOT EXISTS "crop"       JSONB;
ALTER TABLE "ListingDraft"       ADD COLUMN IF NOT EXISTS "imageCrops" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "ListingPendingEdit" ADD COLUMN IF NOT EXISTS "imageCrops" JSONB;
