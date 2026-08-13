#!/usr/bin/env bash
# Backup diario do banco (data.sqlite) e das midias (uploads/).
# Roda via cron na VPS. Guarda os ultimos $KEEP_DAYS dias em $BACKUP_DIR e,
# se o rclone estiver configurado com um remote "gdrive", manda uma copia
# tambem pro Google Drive (pasta $DRIVE_FOLDER).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="/root/dooh-backups"
DRIVE_REMOTE="gdrive:pontotela-backups"
KEEP_DAYS=14
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$APP_DIR/data.sqlite" ]; then
  echo "[$STAMP] data.sqlite nao existe ainda em $APP_DIR, pulando backup." >&2
  exit 0
fi

FILE="backup-$STAMP.tar.gz"
TMP="$BACKUP_DIR/.$FILE"
tar -czf "$TMP" -C "$APP_DIR" data.sqlite uploads
mv "$TMP" "$BACKUP_DIR/$FILE"

find "$BACKUP_DIR" -name 'backup-*.tar.gz' -mtime "+$KEEP_DAYS" -delete

if command -v rclone >/dev/null && rclone listremotes 2>/dev/null | grep -q '^gdrive:'; then
  rclone copy "$BACKUP_DIR/$FILE" "$DRIVE_REMOTE" --quiet
  rclone delete "$DRIVE_REMOTE" --min-age "${KEEP_DAYS}d" --quiet
  echo "[$STAMP] backup ok: $BACKUP_DIR/$FILE (+ enviado pro Drive)"
else
  echo "[$STAMP] backup ok: $BACKUP_DIR/$FILE (rclone/gdrive nao configurado, so local)"
fi
