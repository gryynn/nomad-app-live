#!/bin/bash
# NOMAD Auto-Deploy — runs via cron on GREEN-LAB
# Crontab: */1 * * * * cd ~/docker/nomad && ./auto-deploy.sh >> /var/log/nomad-deploy.log 2>&1

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

DEPLOY_BRANCH="${DEPLOY_BRANCH:-functional-mvp}"

# Ensure HEAD is on DEPLOY_BRANCH (avoids cross-branch rebuild loop, cf. incident 2026-05-08).
# No-op if already on the branch; fails (set -e) if worktree is dirty — which is OK,
# this repo is dedicated to deploy and shouldn't have local modifications.
git checkout -q "$DEPLOY_BRANCH" 2>/dev/null || true

git fetch origin "$DEPLOY_BRANCH" --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$DEPLOY_BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date)] Deploying: $LOCAL → $REMOTE"
git pull origin "$DEPLOY_BRANCH" --quiet

# Rebuild and restart with env file for build args
docker compose --env-file backend/.env build --no-cache
docker compose --env-file backend/.env up -d

# Anti-saturation SSD : --no-cache laisse 2 images dangling par build (cf. incident 2026-05-08)
docker image prune -f

echo "[$(date)] Deploy complete"
