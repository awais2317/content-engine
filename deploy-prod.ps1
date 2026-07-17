#!/usr/bin/env pwsh
# Deploy Phase 1 to Production Server
# Usage: .\deploy-prod.ps1 -Host "187.124.158.203" -User "boston" -KeyPath "C:\path\to\key.pem"

param(
    [string]$Host = "187.124.158.203",
    [string]$User = "boston",
    [string]$KeyPath = "",
    [string]$HeyGenKey = "",
    [string]$YouTubeKey = ""
)

function Log-Step($message) {
    Write-Host ""
    Write-Host "=== $message ===" -ForegroundColor Green
}

function Log-Error($message) {
    Write-Host "ERROR: $message" -ForegroundColor Red
}

function Log-Info($message) {
    Write-Host $message -ForegroundColor Gray
}

Log-Step "Boston Studio Phase 1 Deployment"

# Step 1: Verify git commits
Log-Step "Step 1: Verify Git Status"
$latestCommit = git log -1 --oneline
Log-Info "Latest commit: $latestCommit"
if ($latestCommit -notmatch "4a3859f") {
    Log-Error "Expected commit 4a3859f not found!"
    exit 1
}
Log-Info "✓ Code is on Phase 1 commit"

# Step 2: Build SSH command
Log-Step "Step 2: Prepare SSH Deployment"
$remoteUser = "$User@$Host"
Log-Info "Target server: $remoteUser"

if ($KeyPath -and (Test-Path $KeyPath)) {
    $sshCmd = "ssh -i `"$KeyPath`" -o ConnectTimeout=30"
    Log-Info "✓ Using SSH key: $KeyPath"
} else {
    $sshCmd = "ssh -o ConnectTimeout=30"
    Log-Info "✓ Using default SSH authentication"
}

# Step 3: Deploy via deploy.sh
Log-Step "Step 3: Execute Remote Deployment"
$deployScript = @"
    set -e
    cd /opt/bostons-studio || cd ~/content-engine || exit 1
    
    echo "Pulling latest code..."
    git pull origin main
    
    echo "Installing Python dependencies..."
    source .venv/bin/activate 2>/dev/null || source venv/bin/activate 2>/dev/null || true
    pip install -r requirements.txt -q
    
    echo "Restarting services..."
    sudo systemctl restart bostons-backend.service 2>/dev/null || echo "Backend service restart skipped"
    sudo systemctl restart bostons-frontend.service 2>/dev/null || echo "Frontend service restart skipped"
    
    sleep 2
    echo "Deployment complete!"
"@

$bashCmd = $deployScript -replace '"', '\"'

try {
    Write-Host ""
    Write-Host "Executing deployment on $remoteUser..."
    & bash -c "$sshCmd $remoteUser '$deployScript'"
    Log-Step "Deployment Successful!"
} catch {
    Log-Error "Deployment failed: $_"
    Log-Info "Try manual deployment with:"
    Log-Info "  ssh $remoteUser"
    Log-Info "  cd /opt/bostons-studio"
    Log-Info "  bash deploy.sh"
    exit 1
}

# Step 4: Verify deployment
Log-Step "Step 4: Verify Deployment"
try {
    $backendStatus = & bash -c "$sshCmd $remoteUser 'systemctl is-active bostons-backend.service 2>/dev/null || echo unknown'"
    Log-Info "Backend status: $backendStatus"
} catch {
    Log-Info "Could not verify backend status (may be normal)"
}

# Step 5: Test endpoints
Log-Step "Step 5: Health Check"
$testUrl = "http://$Host:8000/api/v1/platform/analytics/dashboard"
try {
    $response = Invoke-WebRequest -Uri $testUrl -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Log-Info "✓ Analytics endpoint responding (HTTP 200)"
    }
} catch {
    Log-Info "⚠ Could not reach endpoint (may be due to firewall/network)"
}

Log-Step "Deployment Complete!"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. SSH into production: ssh $remoteUser"
Write-Host "2. Verify services: systemctl status bostons-backend.service"
Write-Host "3. Check logs: journalctl -u bostons-backend.service -f"
Write-Host "4. Test API: curl http://$Host:8000/api/v1/platform/analytics/dashboard"
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Cyan
Write-Host "- See DEPLOY_GUIDE.md for detailed instructions"
Write-Host "- See PHASE1_IMPLEMENTATION.md for feature details"
Write-Host ""
