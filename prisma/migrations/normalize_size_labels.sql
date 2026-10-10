-- Beden etiketlerini buyuk harfe sabitler ("Xl" -> "XL").
-- Arama Meilisearch'te tam eslesme yaptigi icin yazim farki filtreyi bosa dusuruyordu.
-- Yeniden kosulabilir: zaten buyuk harf olan satirlara dokunmaz.
UPDATE "Listing"
SET "sizeLabel" = upper(btrim("sizeLabel"))
WHERE "sizeLabel" IS NOT NULL
  AND "sizeLabel" <> upper(btrim("sizeLabel"));
