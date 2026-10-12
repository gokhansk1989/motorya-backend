-- Ilan ret nedeni kodu.
--
-- Eklemeli degisiklik: yeni nullable kolon, varsayilan yok, mevcut satirlara
-- dokunmuyor. Sira VERITABANI -> KOD. Eski kod bu kolonu tanimiyor ama
-- varligi onu rahatsiz etmiyor.
--
-- Uygulama:
--   ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -f -" < prisma/migrations/add_listing_rejection_reason.sql
--
-- Gecmis retler NULL kaliyor; rapor bunlari "kod girilmemis" olarak ayri
-- gosteriyor. Tahminle doldurmuyoruz.

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
