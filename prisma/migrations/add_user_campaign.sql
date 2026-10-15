-- Hesabi getiren kampanya (ilk temas).
--
-- Eklemeli degisiklik: bes yeni nullable kolon, varsayilan yok, mevcut
-- satirlara dokunmuyor. Sira VERITABANI -> KOD.
--
-- Uygulama:
--   (echo "SET lock_timeout='3s';"; cat prisma/migrations/add_user_campaign.sql) \
--     | ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -v ON_ERROR_STOP=1 -f -"
--
-- Yeniden kosulabilir.
--
-- GERI DONUS: bes kolonu dusurmek yeterli. Kayip: hangi hesabin hangi
-- kampanyadan geldigi bilgisi. Ilanlar, mesajlar ve kullanicilar
-- etkilenmez. Eski kod bu kolonlarin varligindan etkilenmiyor.
--
-- GECMISE DONUK DOLDURMA YOK: kolon eklenmeden once kaydolan hesaplarin
-- kaynagi bilinmiyor ve TAHMIN EDILMIYOR; raporda "kaynak belirlenemedi"
-- olarak gorunuyorlar.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kampanyaKaynak"   TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kampanyaOrtam"    TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kampanyaAdi"      TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kampanyaIcerik"   TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kampanyaIlkTemas" TIMESTAMP(3);

-- Rapor kaynaga gore grupluyor.
CREATE INDEX IF NOT EXISTS "User_kampanyaKaynak_idx" ON "User"("kampanyaKaynak");
