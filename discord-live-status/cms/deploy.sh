#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CMS_DATA_DIR="${CMS_DATA_DIR:-/home/robfin/.local/share/robfin-cms}"
pm2 stop robfin-editor >/dev/null 2>&1 || true
python3 -c 'import sys; sys.path.insert(0,"cms"); import server; server.initialize()'
pm2 startOrRestart cms/ecosystem.config.cjs --update-env
docker restart discord-status
# The public site runs in Docker behind NGINX Proxy Manager; avoid a duplicate bot.
pm2 delete robfin-app >/dev/null 2>&1 || true
pm2 save
docker exec npm-app-1 curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 http://discord-status:3000/ -o /dev/null
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 http://10.0.0.87:8765/api/state -o /dev/null
