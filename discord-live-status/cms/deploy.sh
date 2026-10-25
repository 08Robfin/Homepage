#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CMS_DATA_DIR="${CMS_DATA_DIR:-/home/robfin/.local/share/robfin-cms}"
pm2 stop robfin-editor >/dev/null 2>&1 || true
python3 -c 'import sys; sys.path.insert(0,"cms"); import server; server.initialize()'
pm2 startOrRestart cms/ecosystem.config.cjs --update-env
pm2 startOrRestart cms/site.ecosystem.config.cjs --update-env
pm2 save
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 http://127.0.0.1:3000/ -o /dev/null
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 http://10.0.0.87:8765/api/state -o /dev/null
