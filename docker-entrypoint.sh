#!/bin/sh
set -e

echo "[entrypoint] Running migrations..."
for f in /app/prisma/migrations/*.js; do
  echo "[entrypoint] $f"
  node "$f"
done

echo "[entrypoint] Starting application..."
exec node dist/main.js
