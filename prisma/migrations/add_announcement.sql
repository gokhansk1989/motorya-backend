-- Duyuru mailleri. Gonderilenin kaydi tutulmazsa ayni duyuru ikinci kez
-- gonderilebilir; status + sentAt bunu engelliyor (gonderilmis duyuru
-- yeniden gonderilemez).
CREATE TABLE IF NOT EXISTS "Announcement" (
  "id"         TEXT PRIMARY KEY,
  "title"      TEXT NOT NULL,
  "subject"    TEXT NOT NULL,
  "heading"    TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "imageUrl"   TEXT,
  "ctaText"    TEXT,
  "ctaUrl"     TEXT,
  "audience"   TEXT NOT NULL DEFAULT 'MARKETING',
  "status"     TEXT NOT NULL DEFAULT 'DRAFT',
  "sentCount"  INTEGER NOT NULL DEFAULT 0,
  "failCount"  INTEGER NOT NULL DEFAULT 0,
  "sentAt"     TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Announcement_status_createdAt_idx"
  ON "Announcement" ("status", "createdAt");
