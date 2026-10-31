# Build context — loyiha ILDIZI (docker-compose.yml shunday beradi), chunki backend web/ ni ham xizmat qiladi.
# Joylashuv image ichida: /app/backend (kod) va /app/web (frontend) — index.js dagi '../../web' yo'li shunga mos.
FROM node:20-alpine

WORKDIR /app/backend
ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY web/ /app/web/

USER node
EXPOSE 3010
CMD ["npm", "start"]
