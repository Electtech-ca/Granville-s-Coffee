#!/usr/bin/env bash
# Pull the latest code, install dependencies and restart. Installed as /usr/local/bin/granvilles-update.
set -euo pipefail
APP_DIR=/opt/granvilles
[ "$(id -u)" -eq 0 ] || { echo "Run as root: sudo granvilles-update" >&2; exit 1; }
as_app() { runuser -u granvilles -- env HOME="$APP_DIR" "$@"; }
# Stay on the branch the installer checked out unless BRANCH is given.
BRANCH="${BRANCH:-$(as_app git -C "$APP_DIR/app" rev-parse --abbrev-ref HEAD)}"
/usr/local/bin/granvilles-backup || echo "Backup before update failed; continuing."
as_app git -C "$APP_DIR/app" fetch -q origin "$BRANCH"
as_app git -C "$APP_DIR/app" reset -q --hard "origin/$BRANCH"
(cd "$APP_DIR/app" && as_app npm ci --omit=dev --no-audit --no-fund --loglevel=error)
install -m 755 "$APP_DIR/app/deploy/ovh/backup.sh" /usr/local/bin/granvilles-backup
install -m 755 "$APP_DIR/app/deploy/ovh/update.sh" /usr/local/bin/granvilles-update
systemctl restart granvilles
for i in $(seq 1 30); do curl --noproxy "*" -fs http://127.0.0.1:3000/healthz >/dev/null && { echo "Updated to $(as_app git -C "$APP_DIR/app" log -1 --format='%h %s')"; exit 0; }; sleep 1; done
echo "The app didn't come back. See: journalctl -u granvilles -n 50" >&2; exit 1
