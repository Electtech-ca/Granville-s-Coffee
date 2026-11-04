#!/usr/bin/env bash
# Nightly PostgreSQL backup (includes uploaded photos, which live in the database).
# Installed as /usr/local/bin/granvilles-backup. Restore with:
#   sudo -u postgres pg_restore --clean --if-exists -d granvilles /var/backups/granvilles/<file>.dump
set -euo pipefail
umask 077
DIR=/var/backups/granvilles
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DIR" && chmod 700 "$DIR"
FILE="$DIR/granvilles-$(date +%Y-%m-%d-%H%M).dump"
runuser -u postgres -- pg_dump -Fc granvilles > "$FILE"
find "$DIR" -name 'granvilles-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Backup saved: $FILE ($(du -h "$FILE" | cut -f1))"
