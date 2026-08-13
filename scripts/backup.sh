#!/usr/bin/env bash
# Backup diario do banco (data.sqlite) e das midias (uploads/).
# Roda via cron na VPS. Guarda os ultimos $KEEP_DAYS dias em $BACKUP_DIR.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="/root/dooh-backups"
KEEP_DAYS=14
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$APP_DIR/data.sqlite" ]; then
  echo "[$STAMP] data.sqlite nao existe ainda em $APP_DIR, pulando backup." >&2
  exit 0
fi

TMP="$BACKUP_DIR/.backup-$STAMP.tar.gz"
tar -czf "$TMP" -C "$APP_DIR" data.sqlite uploads
mv "$TMP" "$BACKUP_DIR/backup-$STAMP.tar.gz"

find "$BACKUP_DIR" -name 'backup-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

echo "[$STAMP] backup ok: $BACKUP_DIR/backup-$STAMP.tar.gz"
