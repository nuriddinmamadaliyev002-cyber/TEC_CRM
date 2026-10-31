#!/bin/bash
# Ishlatish (serverda):  cd /var/www/IIS-courses && bash deploy/deploy.sh
set -e
cd "$(dirname "$0")/.."
git pull origin main
(cd backend && npm install --omit=dev --silent && npm run db:setup)
(cd bot && npm install --omit=dev --silent)
pm2 startOrReload deploy/ecosystem.config.js --update-env && pm2 save
sleep 2 && curl -fsS http://127.0.0.1:3010/health && echo " ✅ courses-api OK"
