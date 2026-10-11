-- Alicinin alisverisi onayladigi an.
--
-- "Satildi" bugune kadar yalnizca saticinin beyaniydi: alicidan onay
-- alinmiyordu ve salesCount kosulsuz artiyordu. Bu kolon, iki tarafin da
-- kabul ettigi alisverisleri beyandan ayirmayi saglar.
--
-- Eklemeli degisiklik: eski kod bu kolonu tanimaz, varligi onu etkilemez.
-- Yeniden kosulabilir.
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "buyerConfirmedAt" TIMESTAMP(3);

-- Satici profilinde "alici onayli" sayisini hesaplarken kullanilan sorgu
-- sellerId + buyerConfirmedAt uzerinden gidiyor.
CREATE INDEX IF NOT EXISTS "Listing_sellerId_buyerConfirmedAt_idx"
  ON "Listing" ("sellerId", "buyerConfirmedAt");
