#!/bin/bash
# Gunluk veritabani yedegi. Cron: 0 3 * * * /home/ubuntu/pg-backup.sh >> /var/log/pg-backup.log 2>&1
#
# AWS'de bu betigin docker'li bir surumu vardi ama hicbir repoda degildi; sunucu
# tasinirken yedekleme sessizce geride kaldi. Bu yuzden artik repoda duruyor.
#
# Postgres burada docker'da degil, dogrudan sistemde calisiyor.
set -euo pipefail

: "${BACKUP_DIR:=/var/backups/postgres}"
: "${RETENTION_DAYS:=14}"
: "${PGDBS:=vites ortamnasil}"   # sunucudaki tum uygulama veritabanlari

mkdir -p "$BACKUP_DIR"
TS=$(date -u +%Y%m%d-%H%M%S)

for DB in $PGDBS; do
  OUT="$BACKUP_DIR/$DB-$TS.sql.gz"
  echo "[$(date -u +%FT%TZ)] pg_dump $DB -> $OUT"
  sudo -u postgres pg_dump -d "$DB" --format=plain --no-owner --no-acl | gzip -9 > "$OUT"

  # Bos/bozuk dosya sessizce birikmesin: gzip butunlugunu ve icerik varligini dogrula
  gzip -t "$OUT"
  if [ "$(zcat "$OUT" | grep -c 'CREATE TABLE')" -lt 5 ]; then
    echo "[$(date -u +%FT%TZ)] HATA: $DB yedeginde tablo yok, siliniyor" >&2
    rm -f "$OUT"
    exit 1
  fi
  echo "[$(date -u +%FT%TZ)] $DB tamam ($(du -h "$OUT" | awk '{print $1}'))"
done

find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -u +%FT%TZ)] $RETENTION_DAYS gunden eski yedekler silindi"
