-- Coklu sekme yenileme yarisi icin kisa gecerlilik penceresi.
--
-- Eklemeli degisiklik: iki kolon da nullable. Eski kod bunlari bilmiyor;
-- once VERITABANI, sonra kod yayina alinabilir.
--
-- Eski cihaz kayitlarinda NULL kalir; o durumda pencere yok sayilir ve
-- davranis bugunku gibi (yalnizca guncel token gecerli) olur.
--
-- Geri alma: kolonlari dusurmek yerine kodu revert etmek yeterli.
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "oncekiTokenHash"  TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "oncekiGecerlilik" TIMESTAMP(3);
