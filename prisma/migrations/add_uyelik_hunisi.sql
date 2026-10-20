-- Uyelik hunisi: kayit girisimini olusan hesaba baglamak icin.
--
-- NEDEN GEREKLI
-- E-posta dogrulamasi kayittan saatler sonra, bambaska bir cihazda ya da
-- sekmede olabiliyor. O anda istemcideki girisim kimligi elimizde yok.
-- Hesaba yazilmis olmasi, dogrulamayi dogru girisime baglamanin tek
-- guvenilir yolu - ve bu baglanti YALNIZCA sunucuda kuruluyor.
--
-- kayitGirisimId: kisa omurlu, tahmin edilemez olcum kimligi (flowId).
--   Yetki, oturum ya da kimlik dogrulama araci DEGIL. Cihazlar arasi
--   kalici bir takip kimligi degil; tek bir kayit girisimine ait.
-- kayitYontemi:   'form' | 'google'. Kayit yontemi ile DOGRULAMA yontemi
--   ayri seyler: Google hesaplari ayrica e-posta dogrulamasi
--   gerektirmiyor, bu yuzden huni kaybi gibi gosterilmemeli.
--
-- EKLEMELI DEGISIKLIK: ikisi de nullable, varsayilan yok. Eski kod bu
-- kolonlari tanimiyor ama varliklari onu rahatsiz etmiyor; bu yuzden
-- once VERITABANI, sonra kod.
--
-- Gecmis kayitlar NULL kaliyor - geriye donuk kaynak uydurulmuyor.
-- Raporda bu hesaplar "iliskilendirilemedi" olarak ayri gosteriliyor.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kayitGirisimId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kayitYontemi"  TEXT;

-- Huni sorgusu girisim kimliginden hesaba gidiyor.
CREATE INDEX IF NOT EXISTS "User_kayitGirisimId_idx" ON "User" ("kayitGirisimId");
