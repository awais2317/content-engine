**Boston's Studio — VPS Deployment Playbook**

Overview
- This playbook deploys the FastAPI backend and Next.js frontend to a single VPS. Copilot/OpenClaw is already configured on the same server and should remain bound to `127.0.0.1:4141`.

Quick checklist
- Clone repo to `/opt/bostons-studio`
- Create Python virtualenv and install dependencies
- Build Next.js frontend (`dashboard`)
- Place production `.env` with Upload-Post and TTS keys
- Install and enable systemd services: `bostons-backend.service` and `bostons-frontend.service`
- Configure nginx site and obtain SSL via certbot

Commands (run as sudo or a deploy user)
```bash
# Install OS deps (Ubuntu)
apt update && apt install -y git python3-venv python3-pip nodejs npm ffmpeg nginx certbot

# Run the bundled deploy script (edit REPO inside .deploy/deploy.sh first)
bash .deploy/deploy.sh

# After deploy: obtain cert
certbot --nginx -d your.domain.tld

# Check services
systemctl status bostons-backend.service
systemctl status bostons-frontend.service
journalctl -u bostons-backend.service -f

# Test API
curl -fsS http://127.0.0.1:8080/api/v1/ping
```

Copilot/OpenClaw notes
- Since Copilot OAuth is already installed on this VPS, ensure the proxy process is running and listening on `127.0.0.1:4141`. Confirm by:
```bash
ss -ltnp | grep 4141
curl -fsS http://127.0.0.1:4141/v1/models || true
```
- Ensure `.env` has: `OPENAI_BASE_URL=http://127.0.0.1:4141/v1`

Post-deploy checks
- Generate a short sample video via the dashboard and confirm final mp4 appears under `storage/tasks/<task_id>/final-1.mp4`.
- Validate publish: set `UPLOAD_POST_API_KEY` and enable `UPLOAD_POST_ENABLED=true`, then click Publish on a library card.
- Validate analytics: open the Analytics page and add an entry for the test video.

If you want, I can now:
- Generate the `systemd` units and nginx config (done) and the `deploy.sh` script (done);
- Provide a one-liner you can paste on the VPS to run the full deploy;
- Or, if you provide SSH access, I can run these steps remotely for you.
