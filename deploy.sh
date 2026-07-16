#!/bin/bash
# deploy.sh — pull latest code from GitHub and restart services
# Usage: bash /opt/bostons-studio/deploy.sh

set -e
echo '=== Boston Studio Deploy ==='

cd /opt/bostons-studio

echo '--- Pulling latest code ---'
git pull origin main

echo '--- Installing Python deps if changed ---'
if git diff HEAD~1 --name-only 2>/dev/null | grep -q 'requirements'; then
    source .venv/bin/activate 2>/dev/null || true
    pip install -r requirements.txt -q
fi

echo '--- Installing Node deps if changed ---'
if git diff HEAD~1 --name-only 2>/dev/null | grep -q 'package.json'; then
    cd dashboard && npm install && cd ..
fi

echo '--- Restarting services ---'
systemctl restart bostons-backend.service
systemctl restart bostons-frontend.service

sleep 3

echo
echo 'Backend:' 
echo 'Frontend:' 
echo '=== Deploy complete ==='
