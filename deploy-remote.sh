#!/bin/bash

# Pratibha Marketing - Remote Deployment Script
# For Digital Ocean App Platform

set -e

APP_URL="https://pratibha-marketing-sb8q4.ondigitalocean.app"
APP_NAME="pratibha-marketing"

echo "╔═══════════════════════════════════════════════╗"
echo "║   Pratibha Marketing - Remote Deploy          ║"
echo "║   Digital Ocean App Platform                  ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Check if there are uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo "[WARN] Warning: You have uncommitted changes"
    echo ""
    git status --short
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Get current branch
BRANCH=$(git branch --show-current)
echo "[*] Current branch: $BRANCH"

# Check if we're on main
if [[ "$BRANCH" != "main" ]]; then
    echo "[WARN] Warning: You're not on the main branch"
    read -p "Push to $BRANCH anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Push to remote
echo ""
echo "[*] Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

echo ""
echo "[OK] Code pushed successfully!"
echo ""
echo "[*] Digital Ocean App Platform will automatically deploy."
echo ""

# Check if doctl is available for deployment status
if command -v doctl &> /dev/null; then
    echo "Checking deployment status..."
    doctl apps list-deployments $(doctl apps list --format ID --no-header | head -1) --format "ID,Phase,Progress,Created" | head -5
else
    echo "[INFO] To monitor deployment:"
    echo "   1. Visit: https://cloud.digitalocean.com/apps"
    echo "   2. Click on '$APP_NAME'"
    echo "   3. Check the 'Activity' tab"
    echo ""
    echo "   Or install 'doctl' CLI:"
    echo "   brew install doctl"
    echo "   doctl auth init"
fi

echo ""
echo "[*] App URL: $APP_URL"
echo ""

# Wait and check health
echo "[...] Waiting 30 seconds for deployment..."
sleep 30

echo ""
echo "[*] Checking app health..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$APP_URL/api/health" || echo "000")

if [[ "$HTTP_STATUS" == "200" ]]; then
    echo "[OK] App is healthy! (HTTP $HTTP_STATUS)"
    curl -s "$APP_URL/api/health" | python3 -m json.tool 2>/dev/null || curl -s "$APP_URL/api/health"
elif [[ "$HTTP_STATUS" == "503" ]]; then
    echo "[WARN] App is degraded (HTTP $HTTP_STATUS) - Database may be connecting"
    curl -s "$APP_URL/api/health" | python3 -m json.tool 2>/dev/null || curl -s "$APP_URL/api/health"
else
    echo "[...] App not ready yet (HTTP $HTTP_STATUS)"
    echo "   Deployment may still be in progress."
    echo "   Check: https://cloud.digitalocean.com/apps"
fi

echo ""
echo "Done!"
