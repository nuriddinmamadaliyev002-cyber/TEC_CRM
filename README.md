# Today Education Centre

Online kurslar boshqaruvi — **CRM'dan mustaqil** project (alohida baza, alohida jarayon).

```
backend/   Express + PostgreSQL API  (port 3010) — web/ ni ham xizmat qiladi
web/       index (kirish) · miniapp (Telegram Mini App) · superadmin · panel (kurs admin) · oqituvchi · oquvchi
bot/       Kirish boti (Telegram) — alohida jarayon
deploy/    PM2, nginx, deploy.sh
```

## Rollar
| Rol | Kirish | Imkoniyat |
|---|---|---|
| Superadmin (bitta, `.env`da) | username + parol | Kurs adminlarini boshqarish, butun panel |
| Kurs admin | **Telegram bot orqali** | Fanlar, guruhlar, o'quvchilar, o'qituvchilar, to'lovlar |
| O'qituvchi | **Telegram bot orqali** | Faqat o'z guruhlari: o'quvchilar ro'yxati va davomat (to'lov/narx ko'rinmaydi) |
| O'quvchi | **Telegram bot orqali** | Faqat o'z ma'lumoti: guruhlari, davomati va to'lovlari (faqat ko'rish) |

## Fanlar, o'qituvchilar va dars jadvali
- **Fan** — o'quv markazda o'tiladigan fanlar nomenklaturasi (nomi, tavsif, faol). Narx va davomiylik yo'q.
- **O'qituvchi** bitta fanga biriktiriladi (dropdown). Guruh yaratishda o'qituvchilar ro'yxati tanlangan fanga qarab chiqadi; API ham
  boshqa fan o'qituvchisini guruhga qo'yishga yo'l qo'ymaydi.
- **Dars jadvali** — kunlar (`kunlar`: 1=Du … 7=Yak) va boshlanish vaqti (`soat`: `HH:MM`). Ko'rsatish uchun `jadval` matni
  (masalan `Du-Chor-Ju 19:00`) shulardan serverda hosil qilinadi.
- Eski bazalar `schema.sql` ishga tushganda avtomatik migratsiya qilinadi: `kurslar` → `fanlar`, `guruhlar.kurs_id` → `fan_id`,
  `narx`/`davomiylik_oy` olib tashlanadi, o'qituvchining matnli `fan` qiymati nomi mos kelgan fanga bog'lanadi.

## Telegram orqali kirish (xavfsiz oqim)
Kurs admin, o'qituvchi va o'quvchi shu oqimdan foydalanadi; farqi — kirish sahifasidagi tugma (`rol`) va tekshiriladigan jadval
(`kurs_adminlar`, `oqituvchilar` yoki `oquvchilar`). O'qituvchi/o'quvchi kira olishi uchun kurs admin uni panelda qo'shib,
**Telegram ID**'sini kiritishi va «Faol» qoldirishi kerak (ID o'qituvchilar orasida ham, o'quvchilar orasida ham takrorlanmaydi). Bot kodi o'zgarmagan.

1. Web: «Telegram orqali kirish» → backend bir martalik token yaratadi (5 daqiqa).
2. Brauzer `t.me/<bot>?start=login_<token>` ni ochadi va tokenni so'rab turadi.
3. Bot `/start`ni oladi — **Telegram ID'ni Telegramning o'zi beradi** (soxtalashtirib bo'lmaydi) — va backendga `X-Bot-Secret` bilan yuboradi.
4. Backend ID `kurs_adminlar`da faol ekanini tekshiradi → bot «✅ Tasdiqlayman» tugmasini beradi.
5. Tasdiqlangach brauzer JWT oladi (token bir marta beriladi va o'chiriladi).

## Botdan to'g'ridan-to'g'ri kirish
Telegram ID'si biriktirilgan faol foydalanuvchi botga `/start` yozsa, bot unga **faqat «🔐 Tizimga kirish» tugmasini** beradi
(`POST /auth/telegram/bot-roles` rolni aniqlaydi, token/havola yaratmaydi). Xabar boshqa odamga yuborilsa ham u orqali kirib bo'lmaydi:
tugma har bosgan odamning O'Z imzolangan Telegram ID'sini tekshiradi.

## Kirish (yakuniy tartib)
- **Superadmin** — faqat saytning o'zida (`/index.html`): username + parol. Bu sahifada boshqa kirish usuli yo'q.
- **Kurs admin / o'qituvchi / o'quvchi** — faqat Telegram botdagi **«🔐 Tizimga kirish»** tugmasi orqali (Mini App). Tugma:
  botga `/start` yozilganda yuboriladi va chatda **qadab qo'yiladi (pin)**, chat menyu tugmasi ham shu; istalgan matn yozilsa bot tugmani qayta beradi.
  Tugmaning muddati yo'q — har bosganda Telegram yangi imzolangan `initData` beradi.
- Oqim: Mini App `initData`ni `POST /api/auth/telegram/miniapp`ga yuboradi (HMAC imzo `backend/src/telegramWebApp.js`da tekshiriladi) →
  JWT olinadi → oraliq oynasiz to'g'ridan-to'g'ri panelga o'tadi. Bir nechta rol bo'lsa, rol tanlanadi; ID biriktirilmagan bo'lsa ID ko'rsatiladi.
- **Chiqish** Mini App'da oynani yopadi (kirish sahifasi ko'rsatilmaydi). Sessiya muddati tugasa, Mini App jimgina qayta kiradi.
- Qoida: ID `kurs_adminlar` / `oqituvchilar` / `oquvchilar` da **faol** va jadvalda **aynan bitta** bo'lishi shart.
- **Sozlash:** `backend/.env` va `bot/.env` ikkalasida `KURS_BOT_TOKEN` (bir xil), ikkalasida `WEB_URL=https://...` bo'lsin.
- Eski brauzer-orqali Telegram kirish endpoint'lari (`/telegram/start`, `poll`, `bot-check`, `bot-confirm`, `bot-direct`, `miniapp-handoff`) backendda qoldirilgan, lekin web sahifa va bot endi ishlatmaydi.
- ngrok bepul domenida birinchi ochilishda «Visit Site» ogohlantirishi chiqishi mumkin.

## Ishga tushirish (lokal)
```bash
# 1) Baza
sudo -u postgres psql -c "CREATE USER today_edu_user WITH PASSWORD 'KUCHLI_PAROL'" \
                      -c "CREATE DATABASE today_edu OWNER today_edu_user"

# 2) Backend
cd backend && npm install && cp .env.example .env
#    .env: DB_PASSWORD, JWT_SECRET, BOT_SECRET (har biri uzun tasodifiy), KURS_BOT_USERNAME
npm run hash -- "superadmin_parol"      # chiqqan qiymatni SUPERADMIN_PASSWORD_HASH ga qo'ying
npm run db:setup && npm start           # http://127.0.0.1:3010

# 3) Bot  (avval @BotFather'da yangi bot yarating)
cd ../bot && npm install && cp .env.example .env   # KURS_BOT_TOKEN, BOT_SECRET (backenddagi bilan bir xil)
npm start
```
Tasodifiy sir: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Deploy
`deploy/` ichidagi `ecosystem.config.js`, `nginx-courses.conf`, `deploy.sh` ga qarang.
`.env` fayllari gitga **qo'shilmaydi**.

## Docker (lokal ishlab chiqish)
```bash
cp .env.docker.example .env        # ildizdagi .env: DB_PASSWORD (postgres va backend uchun bitta parol)
# backend/.env va bot/.env ni .env.example'lardan to'ldiring.
# bot/.env ga ham WEB_URL=https://... qo'shing (Mini App va «Web panel» tugmalari shundan chiqadi)
docker compose up -d --build
docker compose logs -f backend bot
```
- Hammasi **http://localhost:3010** da (backend `web/` ni ham beradi). ngrok: `ngrok http 3010`, so'ng `WEB_URL` ni
  `backend/.env` va `bot/.env` da yangilab, `docker compose up -d` qiling.
- Konteynerda `HOST`, `DB_HOST`, `API_BASE` avtomatik to'g'rilanadi (`docker-compose.yml` dagi `environment`), `.env` dagi `localhost` qiymatlari ta'sir qilmaydi.
- Sxema backend har ishga tushganda qo'llanadi (`db:setup`, qayta ishga tushirish xavfsiz). Baza ma'lumotlari `pgdata` volume'ida saqlanadi.
- `web/Dockerfile` endi ishlatilmaydi (alohida `web` servisi olib tashlandi) — o'chirib yuborishingiz mumkin.
