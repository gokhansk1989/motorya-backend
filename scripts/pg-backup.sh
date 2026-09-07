#!/usr/bin/env bash
# Postgres günlük yedeği. EC2 DB sunucusunda (18.232.136.142) cron'a eklenir:
#   0 3 * * * /home/ubuntu/pg-backup.sh >> /var/log/pg-backup.log 2>&1
#
# Ortam değişkenleri (aynı dizinde .env veya cron içinde tanımla):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, BACKUP_DIR, RETENTION_DAYS
#
# Opsiyonel S3 upload için: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET
# aws-cli kurulu ise aktifleşir; yoksa sadece lokal yedek alınır.

set -euo pipefail

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=motorya}"
: "${PGDATABASE:=motorya}"
: "${BACKUP_DIR:=/var/backups/postgres}"
: "${RETENTION_DAYS:=14}"

mkdir -p "$BACKUP_DIR"
TS=$(date -u +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/motorya-$TS.sql.gz"

echo "[$(date -u +%FT%TZ)] pg_dump başlıyor → $OUT"
PGPASSWORD="${PGPASSWORD:-}" pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  --format=plain --no-owner --no-acl \
  | gzip -9 > "$OUT"

SIZE=$(du -h "$OUT" | awk '{print $1}')
echo "[$(date -u +%FT%TZ)] tamam ($SIZE)"

# S3 upload (opsiyonel)
if command -v aws >/dev/null && [ -n "${S3_BUCKET:-}" ]; then
  echo "[$(date -u +%FT%TZ)] S3'e yükleniyor → s3://$S3_BUCKET/pg/"
  aws s3 cp "$OUT" "s3://$S3_BUCKET/pg/$(basename "$OUT")" --storage-class STANDARD_IA
fi

# Eski yedekleri sil
find "$BACKUP_DIR" -name "motorya-*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -u +%FT%TZ)] $RETENTION_DAYS gün öncesinden eski yedekler silindi"
