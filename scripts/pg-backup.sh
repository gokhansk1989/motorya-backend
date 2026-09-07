#!/usr/bin/env bash
# Motorya Postgres günlük yedeği. App sunucusunda cron:
#   0 3 * * * /home/ubuntu/pg-backup.sh >> /var/log/pg-backup.log 2>&1
#
# Container ENV'inden POSTGRES_USER/DB otomatik okunur; PGPASSWORD gerekmez
# (docker exec trust auth). Opsiyonel S3 upload için env değişkenleri:
#   S3_BUCKET (aws-cli varsa aktifleşir)

set -euo pipefail

: "${CONTAINER:=motorya_postgres}"
: "${BACKUP_DIR:=/var/backups/postgres}"
: "${RETENTION_DAYS:=14}"

mkdir -p "$BACKUP_DIR"
TS=$(date -u +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/motorya-$TS.sql.gz"

PGUSER=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" | grep '^POSTGRES_USER=' | cut -d= -f2)
PGDB=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$CONTAINER" | grep '^POSTGRES_DB=' | cut -d= -f2)
PGUSER=${PGUSER:-postgres}
PGDB=${PGDB:-postgres}

echo "[$(date -u +%FT%TZ)] pg_dump $PGDB → $OUT"
docker exec "$CONTAINER" pg_dump -U "$PGUSER" -d "$PGDB" --format=plain --no-owner --no-acl \
  | gzip -9 > "$OUT"

SIZE=$(du -h "$OUT" | awk '{print $1}')
echo "[$(date -u +%FT%TZ)] tamam ($SIZE)"

if command -v aws >/dev/null && [ -n "${S3_BUCKET:-}" ]; then
  echo "[$(date -u +%FT%TZ)] S3'e yükleniyor → s3://$S3_BUCKET/pg/"
  aws s3 cp "$OUT" "s3://$S3_BUCKET/pg/$(basename "$OUT")" --storage-class STANDARD_IA
fi

find "$BACKUP_DIR" -name "motorya-*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -u +%FT%TZ)] $RETENTION_DAYS gün öncesinden eski yedekler silindi"
