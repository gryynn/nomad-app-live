#!/bin/bash
# NOMAD Auto-Deploy — runs via cron on GREEN-LAB
# Crontab: */1 * * * * cd ~/docker/nomad && ./auto-deploy.sh >> /var/log/nomad-deploy.log 2>&1

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Pull latest
git fetch origin functional-mvp --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/functional-mvp)

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date)] Deploying: $LOCAL → $REMOTE"
git pull origin functional-mvp --quiet

# Rebuild and restart with env file for build args
docker compose --env-file backend/.env build --no-cache
docker compose --env-file backend/.env up -d

echo "[$(date)] Deploy complete"
