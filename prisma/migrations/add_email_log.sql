-- Gönderilen maillerin üstveri kaydı.
-- Eklemeli değişiklik: yeni tablo, hiçbir mevcut sorguyu etkilemez.
-- Önce VERİTABANI, sonra kod.
CREATE TABLE IF NOT EXISTS "EmailLog" (
  "id"        TEXT PRIMARY KEY,
  "alici"     TEXT NOT NULL,
  "tur"       TEXT NOT NULL,
  "etiket"    TEXT NOT NULL,
  "konu"      TEXT NOT NULL,
  "durum"     TEXT NOT NULL,
  "hata"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_tur_idx"       ON "EmailLog" ("tur");
CREATE INDEX IF NOT EXISTS "EmailLog_alici_idx"     ON "EmailLog" ("alici");
