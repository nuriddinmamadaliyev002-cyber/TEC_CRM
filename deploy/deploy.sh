#!/bin/bash
# Ishlatish (serverda):  cd /var/www/TEC && bash deploy/deploy.sh
set -e
cd "$(dirname "$0")/.."
# Oldingi deploy'da yozilgan ?v= versiyalari git'ni "o'zgargan" qilmasin (aks holda pull to'xtaydi)
git checkout -- web
git pull origin main
(cd backend && npm install --omit=dev --silent && npm run db:setup)
(cd bot && npm install --omit=dev --silent)
# Cloudflare eski JS/CSS'ni keshda ushlab qolmasligi uchun: manzillarga joriy commit raqamini yozamiz (faqat serverda, git'ga tushmaydi)
V=$(git rev-parse --short HEAD)
sed -i -E "s#(js/[a-z]+\.js)(\?v=[0-9a-f]+)?\"#\1?v=$V\"#; s#(css/app\.css)(\?v=[0-9a-f]+)?\"#\1?v=$V\"#" web/*.html
pm2 startOrReload deploy/ecosystem.config.js --update-env && pm2 save
sleep 2 && curl -fsS http://127.0.0.1:3010/health && echo " OK: tec-api ishlayapti"
