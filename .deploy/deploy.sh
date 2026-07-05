#!/usr/bin/env bash
# Simple deploy script for Boston's Studio on Ubuntu-like VPS
set -euo pipefail

REPO="https://github.com/awais2317/content-engine.git"
APP_DIR="/opt/bostons-studio"
DOMAIN="187.124.158.203"

if [ -z "$REPO" ] || [ "$REPO" = "REPO_URL_HERE" ]; then
  echo "Set REPO variable at top of this script to your Git clone URL." >&2
  exit 1
fi

sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
else
  cd "$APP_DIR" && git fetch --all && git reset --hard origin/main
fi

cd "$APP_DIR"

# Python venv
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
if [ -f pyproject.toml ]; then
  pip install -e .
elif [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi

# Node build
cd dashboard
npm ci
npm run build
cd ..

# Copy example env if missing
if [ ! -f .env ]; then
  cp .deploy/.env.example .env
  echo "Please edit $APP_DIR/.env with production secrets (UPLOAD_POST keys, etc)."
fi

sudo cp .deploy/backend.service /etc/systemd/system/bostons-backend.service
sudo cp .deploy/frontend.service /etc/systemd/system/bostons-frontend.service
sudo systemctl daemon-reload
sudo systemctl enable --now bostons-backend.service
sudo systemctl enable --now bostons-frontend.service

# Nginx
sudo mkdir -p /var/www/letsencrypt
sudo cp .deploy/nginx-site.conf /etc/nginx/sites-available/bostons-studio
sudo ln -sf /etc/nginx/sites-available/bostons-studio /etc/nginx/sites-enabled/bostons-studio
sudo nginx -t
sudo systemctl reload nginx

echo "Deployment finished. Run certbot to obtain SSL certs and update nginx site 'server_name'."
echo "Example: sudo certbot --nginx -d $DOMAIN"
