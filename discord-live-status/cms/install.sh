#!/usr/bin/env bash
# Executed from the staged release; all persistent content stays outside APP.
set -euo pipefail
umask 077
APP=/home/robfin/Homepage/discord-live-status
STAGE=/home/robfin/.local/share/robfin-deploy
DATA=/home/robfin/.local/share/robfin-cms
BACKUP=/home/robfin/.local/share/robfin-deploy-backups/$(date -u +%Y%m%dT%H%M%S)-$$
mkdir -p "$BACKUP"
tar --exclude=node_modules --exclude=__pycache__ -czf "$BACKUP/site.tar.gz" -C "$APP" .
cd "$STAGE"
npm ci --omit=dev
python3 cms/test_backend.py
node --check index.js
node --check cms/admin/app.js
pm2 stop robfin-editor >/dev/null 2>&1 || true
if [ -f "$DATA/content.sqlite3" ]; then
  python3 -c 'import sqlite3,sys; a=sqlite3.connect(sys.argv[1]); b=sqlite3.connect(sys.argv[2]); a.backup(b); a.close(); b.close()' "$DATA/content.sqlite3" "$BACKUP/content.sqlite3"
fi
rollback() {
  trap - ERR
  echo 'Deployment failed; restoring the previous website.' >&2
  pm2 stop robfin-editor >/dev/null 2>&1 || true
  mkdir -p "$BACKUP/restore"
  tar -xzf "$BACKUP/site.tar.gz" -C "$BACKUP/restore"
  rsync -rlt --delete --exclude=node_modules/ "$BACKUP/restore/" "$APP/"
  if [ -f "$BACKUP/content.sqlite3" ]; then
    cp "$BACKUP/content.sqlite3" "$DATA/content.sqlite3"
    rm -f "$DATA/content.sqlite3-wal" "$DATA/content.sqlite3-shm"
  fi
  cd "$APP"
  npm ci --omit=dev || true
  docker restart discord-status
  if [ -f cms/ecosystem.config.cjs ]; then
    pm2 startOrRestart cms/ecosystem.config.cjs --update-env
  else
    pm2 delete robfin-editor >/dev/null 2>&1 || true
  fi
  pm2 save
  exit 1
}
trap rollback ERR
docker stop discord-status
pm2 stop robfin-app --watch >/dev/null 2>&1 || true
rsync -rlt --delete --exclude=.env --exclude=__pycache__/ "$STAGE/" "$APP/"
cd "$APP"
bash cms/deploy.sh
echo "Deployment complete. Private code/database backup: $BACKUP"
