#!/bin/bash
# NOMAD Auto-Deploy — runs via cron on GREEN-LAB every minute.
# Cron: */1 * * * * /home/greenm/docker/nomad/auto-deploy.sh >> /home/greenm/docker/nomad/deploy.log 2>&1
#
# Robust to transient DNS / TCP errors (cron env occasionally races
# Tailscale / overloads conntrack — symptoms documented 2026-05-19/20).
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

DEPLOY_BRANCH="${DEPLOY_BRANCH:-functional-mvp}"

# Ensure HEAD is on DEPLOY_BRANCH (avoids cross-branch rebuild loop, cf.
# incident 2026-05-08). No-op if already on the branch.
git checkout -q "$DEPLOY_BRANCH" 2>/dev/null || true

# Retry network ops because intermittent DNS / TCP fails happen from cron
# even when the same command works fine from an interactive shell.
# Stay silent on retries — only the final attempt logs, to keep the log
# from growing 50MB+ on a bad week.
retry() {
  local attempts=3
  local sleep_between=15
  local i=1
  while [ "$i" -le "$attempts" ]; do
    if "$@" 2>/tmp/nomad-deploy-net.err; then
      return 0
    fi
    if [ "$i" -lt "$attempts" ]; then
      sleep "$sleep_between"
    fi
    i=$((i + 1))
  done
  # All attempts failed — emit the last error once and exit cleanly so the
  # next cron tick gets a fresh shot without `set -e` killing us mid-pipe.
  echo "[$(date)] git network op failed after $attempts attempts:"
  cat /tmp/nomad-deploy-net.err
  return 1
}

if ! retry git fetch origin "$DEPLOY_BRANCH" --quiet; then
  exit 0
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$DEPLOY_BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[$(date)] Deploying: $LOCAL → $REMOTE"

if ! retry git pull origin "$DEPLOY_BRANCH" --quiet; then
  exit 0
fi

# Rebuild and restart with env file for build args.
docker compose --env-file backend/.env build --no-cache
docker compose --env-file backend/.env up -d

# Anti-saturation SSD : --no-cache laisse 2 images dangling par build
# (cf. incident 2026-05-08).
docker image prune -f

echo "[$(date)] Deploy complete"
