#!/usr/bin/env bash
# Granville's Coffee: one-command install on an OVH VPS (Ubuntu 22.04/24.04 or Debian 12).
#
# Run as root on a fresh VPS:
#   curl -fsSL https://raw.githubusercontent.com/Electtech-ca/Granville-s-Coffee/claude/project-thread-2lig8f/deploy/ovh/install.sh -o install.sh
#   sudo DOMAIN=example.com EMAIL=you@example.com bash install.sh
#
# DOMAIN and EMAIL are optional. Without them the site runs on http://<server-ip>/ and you can
# rerun the script with them later to switch on HTTPS. Running it again is safe: it keeps your
# database, password and settings, and updates the code.
set -euo pipefail

DOMAIN="${DOMAIN:-}"                # e.g. granvillescoffee.ca (point its DNS A record at this server first)
EMAIL="${EMAIL:-}"                  # for Let's Encrypt certificate notices
REPO="${REPO:-https://github.com/Electtech-ca/Granville-s-Coffee.git}"
BRANCH="${BRANCH:-claude/project-thread-2lig8f}"
BUSINESS_TZ="${BUSINESS_TZ:-America/Vancouver}"
FIREWALL="${FIREWALL:-yes}"         # set to "no" to leave the firewall alone
APP_USER=granvilles
APP_DIR=/opt/granvilles
ENV_DIR=/etc/granvilles
ENV_FILE=$ENV_DIR/granvilles.env
PORT=3000

say()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mxx  %s\033[0m\n' "$*" >&2; exit 1; }
as_app() { runuser -u "$APP_USER" -- env HOME="$APP_DIR" "$@"; }
has_systemd() { [ -d /run/systemd/system ]; }

[ "$(id -u)" -eq 0 ] || die "Run this as root (sudo bash install.sh)."
. /etc/os-release
case "${ID:-}" in ubuntu|debian) ;; *) die "This installer supports Ubuntu and Debian. Found: ${PRETTY_NAME:-unknown}." ;; esac

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg nginx postgresql postgresql-contrib cron openssl ufw >/dev/null

node_major() { command -v node >/dev/null && node -p 'process.versions.node.split(".")[0]' || echo 0; }
if [ "$(node_major)" -lt 20 ]; then
  say "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v), $(psql --version | head -1)"

say "Creating the app user and fetching the code"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" && chown "$APP_USER:$APP_USER" "$APP_DIR"
if [ -d "$APP_DIR/app/.git" ]; then
  as_app git -C "$APP_DIR/app" fetch -q origin "$BRANCH"
  as_app git -C "$APP_DIR/app" reset -q --hard "origin/$BRANCH"
else
  as_app git clone -q --branch "$BRANCH" "$REPO" "$APP_DIR/app"
fi
(cd "$APP_DIR/app" && as_app npm ci --omit=dev --no-audit --no-fund --loglevel=error)

say "Setting up PostgreSQL"
if has_systemd; then systemctl enable --now postgresql >/dev/null 2>&1; else service postgresql start >/dev/null; fi
for _ in $(seq 1 20); do runuser -u postgres -- pg_isready -q && break; sleep 1; done
mkdir -p "$ENV_DIR"
if [ -f "$ENV_FILE" ]; then
  echo "Keeping existing settings in $ENV_FILE"
  DB_PASS=$(sed -n 's|^DATABASE_URL=postgres://[^:]*:\([^@]*\)@.*|\1|p' "$ENV_FILE")
else
  DB_PASS=$(openssl rand -hex 24)
fi
if ! runuser -u postgres -- psql -tAc "select 1 from pg_roles where rolname='granvilles'" | grep -q 1; then
  runuser -u postgres -- psql -q -c "create role granvilles login password '$DB_PASS'"
else
  runuser -u postgres -- psql -q -c "alter role granvilles password '$DB_PASS'"
fi
runuser -u postgres -- psql -tAc "select 1 from pg_database where datname='granvilles'" | grep -q 1 \
  || runuser -u postgres -- createdb -O granvilles granvilles

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<CONF
# Granville's Coffee server settings. After editing: systemctl restart granvilles
DATABASE_URL=postgres://granvilles:$DB_PASS@127.0.0.1:5432/granvilles
PORT=$PORT
NODE_ENV=production
BUSINESS_TZ=$BUSINESS_TZ
# Code asked for by the first-run setup screen at /admin/
SETUP_TOKEN=$(openssl rand -hex 6)
# Paste a key from console.anthropic.com to switch on the AI assistant
ANTHROPIC_API_KEY=
# Set to 1 once to load sample data (removable from Settings in the admin)
SEED_DEMO=0
CONF
fi
chown root:"$APP_USER" "$ENV_FILE" && chmod 640 "$ENV_FILE"

say "Starting the app"
if has_systemd; then
  cat > /etc/systemd/system/granvilles.service <<UNIT
[Unit]
Description=Granville's Coffee website and admin
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/app
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable granvilles >/dev/null 2>&1
  systemctl restart granvilles
else
  warn "systemd isn't running here (a container?), so the app is started in the background without auto-restart."
  pkill -u "$APP_USER" -f "node server/index.js" 2>/dev/null || true
  (cd "$APP_DIR/app" && set -a && . "$ENV_FILE" && set +a && exec runuser -u "$APP_USER" -- "$(command -v node)" server/index.js) >>/var/log/granvilles.log 2>&1 </dev/null &
fi
for i in $(seq 1 30); do curl --noproxy "*" -fs "http://127.0.0.1:$PORT/healthz" >/dev/null && break; [ "$i" = 30 ] && { has_systemd && journalctl -u granvilles -n 30 --no-pager || tail -30 /var/log/granvilles.log; die "The app didn't start (log above)."; }; sleep 1; done
echo "App is running on port $PORT"

say "Configuring the web server (nginx)"
NAMES="_"
LISTEN6=""; [ -s /proc/net/if_inet6 ] && LISTEN6="listen [::]:80;"
if [ -n "$DOMAIN" ]; then NAMES="$DOMAIN"; getent hosts "www.$DOMAIN" >/dev/null && NAMES="$DOMAIN www.$DOMAIN"; fi
# Keep any certificate lines certbot added on an earlier run.
if [ -f /etc/nginx/sites-available/granvilles ] && grep -q "managed by Certbot" /etc/nginx/sites-available/granvilles; then
  echo "Keeping the existing HTTPS configuration"
else
  cat > /etc/nginx/sites-available/granvilles <<NGINX
server {
    listen 80;
    $LISTEN6
    server_name $NAMES;
    client_max_body_size 8m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
NGINX
fi
ln -sf /etc/nginx/sites-available/granvilles /etc/nginx/sites-enabled/granvilles
rm -f /etc/nginx/sites-enabled/default
nginx -t -q
if has_systemd; then systemctl enable --now nginx >/dev/null 2>&1; systemctl reload nginx; else service nginx start >/dev/null 2>&1 || service nginx reload >/dev/null; fi

if [ "$FIREWALL" = "yes" ]; then
  say "Opening only SSH, HTTP and HTTPS in the firewall"
  SSH_PORT=$(sshd -T 2>/dev/null | awk '/^port /{print $2; exit}')
  ufw allow "${SSH_PORT:-22}/tcp" >/dev/null
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null 2>&1 || warn "Couldn't enable the firewall here; skipping."
fi

if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  say "Getting a free HTTPS certificate for $DOMAIN"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
  DOMAIN_ARGS="-d $DOMAIN"; [[ "$NAMES" == *"www."* ]] && DOMAIN_ARGS="$DOMAIN_ARGS -d www.$DOMAIN"
  # shellcheck disable=SC2086
  if certbot --nginx $DOMAIN_ARGS -m "$EMAIL" --agree-tos -n --redirect; then
    URL="https://$DOMAIN"
  else
    warn "Certificate failed. Check that $DOMAIN's DNS A record points at this server's IP, then run this script again."
    URL="http://$DOMAIN"
  fi
else
  IP=$(curl -fs4 --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')
  URL="http://${DOMAIN:-$IP}"
fi

say "Scheduling nightly database backups"
install -m 755 "$APP_DIR/app/deploy/ovh/backup.sh" /usr/local/bin/granvilles-backup
install -m 755 "$APP_DIR/app/deploy/ovh/update.sh" /usr/local/bin/granvilles-update
echo "15 3 * * * root /usr/local/bin/granvilles-backup >/dev/null 2>&1" > /etc/cron.d/granvilles-backup
has_systemd && systemctl enable --now cron >/dev/null 2>&1 || true

TOKEN=$(sed -n 's/^SETUP_TOKEN=//p' "$ENV_FILE")
cat <<DONE

$(printf '\033[1;32m')Granville's Coffee is live.$(printf '\033[0m')

  Website:      $URL/
  Admin portal: $URL/admin/
  Setup code:   $TOKEN   (asked for once, when you create the owner login)

  Settings file:     $ENV_FILE  (add ANTHROPIC_API_KEY here, then: systemctl restart granvilles)
  Update the site:   granvilles-update
  Backups:           nightly to /var/backups/granvilles (14 days kept); run now with: granvilles-backup
  Logs:              journalctl -u granvilles -f
DONE
