# Phase 1 Deployment Guide

## Automated Deployment

### Option 1: Using Existing deploy.sh (Recommended)
SSH into production server and execute:

```bash
ssh boston@187.124.158.203
cd /opt/bostons-studio
bash deploy.sh
```

The script will:
✅ Pull latest code from GitHub (commit: 4a3859f)  
✅ Install new Python dependencies (loguru, google-api-python-client, google-auth-oauthlib)  
✅ Restart backend service (bostons-backend.service)  
✅ Restart frontend service (bostons-frontend.service)  

### Option 2: Manual Deployment (Step-by-Step)

#### Step 1: Connect to Production Server
```bash
ssh boston@187.124.158.203
cd /opt/bostons-studio
```

#### Step 2: Pull Latest Code
```bash
git pull origin main
# Expected output:
# remote: Enumerating objects...
# From github.com:bostons-studio/content-engine
#    706eab7..4a3859f  main       -> origin/main
# Updating 706eab7..4a3859f
# ... (13 files changed)
```

#### Step 3: Install Dependencies
```bash
source .venv/bin/activate
pip install -r requirements.txt
# Should install:
# - loguru==0.7.3
# - google-api-python-client==2.187.0
# - google-auth-oauthlib==1.2.2
```

#### Step 4: Configure Environment Variables (CRITICAL)
```bash
# Set HeyGen credentials
export HEYGEN_API_KEY="your-heygen-api-key"

# Set YouTube credentials
export YOUTUBE_API_KEY="your-youtube-api-key"
export YOUTUBE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
export YOUTUBE_CLIENT_SECRET="your-client-secret"
export YOUTUBE_REFRESH_TOKEN="your-refresh-token"

# Optional: Save to systemd service file for persistence
sudo nano /etc/systemd/system/bostons-backend.service
# Add under [Service] section:
# Environment="HEYGEN_API_KEY=..."
# Environment="YOUTUBE_API_KEY=..."
# ... (etc)
```

#### Step 5: Restart Services
```bash
# Restart backend
sudo systemctl restart bostons-backend.service

# Restart frontend
sudo systemctl restart bostons-frontend.service

# Verify services are running
sudo systemctl status bostons-backend.service
sudo systemctl status bostons-frontend.service
```

#### Step 6: Smoke Tests
```bash
# Test HeyGen endpoint
curl -X GET http://localhost:8000/api/v1/platform/avatar/avatars

# Test YouTube status endpoint
curl -X GET "http://localhost:8000/api/v1/platform/youtube/status/test"

# Test Analytics dashboard
curl -X GET http://localhost:8000/api/v1/platform/analytics/dashboard

# Expected: All endpoints respond with JSON (no 500 errors)
```

## What Changed in This Deployment

### New Services
- `app/services/avatar_generator.py` - HeyGen integration (308 lines)
- `app/services/youtube_uploader.py` - YouTube integration (248 lines)
- `app/services/analytics.py` - Analytics aggregation (200 lines)

### New API Endpoints (11 Total)
```
POST   /api/v1/platform/avatar/generate        - Generate avatar video
GET    /api/v1/platform/avatar/avatars         - List avatars
GET    /api/v1/platform/avatar/voices          - List voices

POST   /api/v1/platform/youtube/upload         - Upload to YouTube
GET    /api/v1/platform/youtube/status/{id}    - Get video status

GET    /api/v1/platform/analytics/dashboard    - Full summary
GET    /api/v1/platform/analytics/videos       - Video stats
GET    /api/v1/platform/analytics/storage      - Storage breakdown
GET    /api/v1/platform/analytics/llm          - LLM distribution
GET    /api/v1/platform/analytics/channel/{id} - Per-channel metrics
GET    /api/v1/platform/analytics/export       - Full export
```

### Modified Files
- `app/router.py` - Added platform router
- `app/models/schema.py` - Added avatar/YouTube VideoParams fields
- `app/services/task.py` - Integrated avatar prepending + YouTube upload
- `app/services/scheduler.py` - Pass channel settings to tasks
- `app/services/channel_store.py` - 8 new persistent fields
- `app/controllers/v1/channels.py` - Channel API extended
- `app/config/config.py` - Config sections [heygen] and [youtube]
- `requirements.txt` - 3 new dependencies
- `dashboard/src/lib/api.ts` - Frontend types updated

### New Dependencies
```
loguru==0.7.3                       # Structured logging
google-api-python-client==2.187.0   # YouTube API
google-auth-oauthlib==1.2.2         # OAuth 2.0
```

## Rollback Plan

If deployment fails, rollback to previous commit:

```bash
cd /opt/bostons-studio
git reset --hard 706eab7
pip install -r requirements.txt
sudo systemctl restart bostons-backend.service
sudo systemctl restart bostons-frontend.service
```

## Troubleshooting

### Issue: `ModuleNotFoundError: loguru`
**Solution**: `pip install loguru` (should be auto-installed via requirements.txt)

### Issue: YouTube upload returns 401 Unauthorized
**Solution**: 
- Verify YOUTUBE_REFRESH_TOKEN is set correctly
- Run: `python -c "from app.services.youtube_uploader import YouTubeUploader; YouTubeUploader.setup_oauth()"`
- This will generate a new refresh token

### Issue: HeyGen API returns 402 Payment Required
**Solution**: 
- Check HeyGen account balance
- Verify HEYGEN_API_KEY is correct
- Test: `curl -H "X-Api-Key: $HEYGEN_API_KEY" https://api.heygen.com/v1/avatars`

### Issue: Services restart but don't come online
**Solution**:
- Check logs: `sudo journalctl -u bostons-backend.service -f`
- Verify port 8000 is free: `sudo lsof -i :8000`
- Verify frontend port 3000 is free: `sudo lsof -i :3000`

## Verification Checklist

After deployment, verify:

- [ ] Backend service is running (`systemctl status bostons-backend.service`)
- [ ] Frontend service is running (`systemctl status bostons-frontend.service`)
- [ ] Git commit shows 4a3859f (`git log -1 --oneline`)
- [ ] New packages installed (`pip list | grep -E 'loguru|google'`)
- [ ] Environment variables set (`echo $HEYGEN_API_KEY | wc -c` > 1)
- [ ] API endpoints responding (`curl http://localhost:8000/api/v1/platform/analytics/dashboard`)
- [ ] Dashboard loads at https://app.example.com
- [ ] Channel settings page shows new avatar/YouTube fields
- [ ] Analytics dashboard page loads without errors

## Performance Expectations

After deployment:

| Metric | Expected | Notes |
|--------|----------|-------|
| Backend startup time | <5 seconds | Loading services |
| API response time | <200ms | Most endpoints |
| HeyGen generation | 30-120 seconds | Depends on video length |
| YouTube upload | 1-5 minutes | Depends on file size |
| Analytics query | <500ms | Artifact scanning |

## Support Contact

For deployment issues:
- Check PHASE1_IMPLEMENTATION.md for detailed documentation
- Review logs in `/opt/bostons-studio/logs/`
- Contact: devops@bostons-studio.com
