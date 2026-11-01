# Today Education Centre

Online kurslar boshqaruvi — **CRM'dan mustaqil** project (alohida baza, alohida jarayon).

```
backend/   Express + PostgreSQL API  (port 3010) — web/ ni ham xizmat qiladi
web/       index (kirish) · superadmin · panel (admin)
bot/       Telegram bot: kursga yozilish va o'qituvchi vakansiyalariga ariza — alohida jarayon
deploy/    PM2, nginx, deploy.sh
```

## Filiallar
O'quv markazning bir nechta filiali bo'lishi mumkin. **Har filialning ma'lumotlari to'liq alohida**: fanlar, o'qituvchilar, o'quvchilar,
guruhlar, to'lovlar, davomat, lidlar, vakansiyalar, nomzodlar. Filial admini faqat o'z filialini ko'radi va o'zgartiradi
(boshqa filial obyektlariga murojaat «topilmadi» beradi; so'rovga filial sarlavhasini qo'shib ham filialni almashtirib bo'lmaydi).
- Superadmin **🏢 Filiallar** bo'limida filial yaratadi (nomi bilan), tahrirlaydi, nofaol qiladi va **«Panelni ochish»** orqali istalgan
  filialning to'liq admin panelini ochadi (qaytish: «← Filiallar»).
- Admin yaratilganda filial tanlanadi; filialga bir nechta admin biriktirish mumkin. Adminni boshqa filialga o'tkazish mumkin.
- Nofaol filial: adminlari kira olmaydi (eski tokenlar ham to'xtaydi), botda ko'rinmaydi. Superadmin uni baribir ko'ra oladi.
- Faqat butunlay bo'sh (admin ham, ma'lumot ham yo'q) filialni o'chirish mumkin; aks holda nofaol qilinadi.
- Fan nomlari filiallar orasida takrorlanishi mumkin (har filialning o'z fanlari).
- Bot: bittadan ko'p faol filial bo'lsa, avval «Qaysi filial?» so'raydi; bitta bo'lsa bu qadam o'tkazib yuboriladi. Lid va nomzod arizasi
  tanlangan guruh/vakansiya filialining paneliga tushadi.

## Rollar va kirish
Hamma **login + parol** bilan `/index.html` sahifasidan kiradi; server rolni o'zi aniqlaydi.

| Rol | Kim yaratadi | Imkoniyat |
|---|---|---|
| Superadmin (bitta, `backend/.env` da) | — | Filiallarni va adminlarni boshqarish (parolni almashtirish, faolsizlantirish); istalgan filial panelini ochish |
| Admin (bitta filialga biriktirilgan) | Superadmin | O'z filialida: fanlar, guruhlar, o'quvchilar, o'qituvchilar, to'lovlar, davomat, lidlar, vakansiyalar, nomzodlar |

- O'qituvchi va o'quvchilar uchun **panel yo'q** — ular admin panelida yuritiladigan yozuvlar (ism, telefon, guruh).
- Telegram orqali kirish **olib tashlangan**. Bot tizimga kirish uchun ishlatilmaydi.
- Admin login: 3–32 belgi (lotin harflari, raqam, `_ . -`), katta-kichik harfga befarq. Parol kamida 8 belgi, bcrypt bilan saqlanadi.
- Parolni unutgan adminga superadmin «Tahrirlash» orqali yangi parol belgilaydi (bo'sh qoldirilsa parol o'zgarmaydi).
- Admin nofaol qilinsa yoki o'chirilsa, eski tokeni ham darhol o'tmaydi.
- Brute-force: bir IP dan 15 daqiqada 10 ta login urinishi (`LOGIN_MAX_ATTEMPTS` bilan o'zgartiriladi).
- Interfeysda «Admin» deyiladi; bazada jadval nomi tarixiy `kurs_adminlar`, tokendagi rol `kurs_admin` bo'lib qolgan.

## Telegram bot
Bot faqat ikki ish qiladi (menyu tugmalari):

**📚 Kursga yozilish** → [filial] → fan tanlanadi → guruhlar kartochkalari (o'qituvchi, dars kunlari, vaqt, oylik to'lov, boshlanish sanasi, bo'sh joy) →
«Shu guruhga yozilaman» → ism → telefon (kontakt tugmasi yoki yozib) → ariza admin panelning **📥 Lidlar** bo'limiga tushadi.
- To'lgan va yopilgan guruhlar, nofaol fanlar botda ko'rinmaydi.
- Bir odam bir guruhga ariza qoldirgan va u hali «Yangi/Aloqada» bo'lsa, takroriy ariza qabul qilinmaydi.
- Lidda admin holatni (Yangi → Aloqada → Yozildi / Rad etildi) va izohni yuritadi, **«O'quvchiga aylantirish»** tugmasi bilan
  lid o'quvchi sifatida yaratilib, tanlagan guruhiga qo'shiladi.

**💼 Vakansiyalar** → [filial] → admin panelning **💼 Vakansiyalar** bo'limida yaratilgan faol vakansiyalar ro'yxati → tafsilot → «Ariza topshirish» →
ism → telefon → tajriba → rezyume (fayl yoki rasm, ixtiyoriy) → ariza **📨 Nomzodlar** bo'limiga tushadi.
- Nomzod holati: Yangi → Ko'rildi → Suhbat → Qabul qilindi / Rad etildi. Rezyumeni admin paneldan «Rezyume» tugmasi bilan yuklab oladi
  (backend faylni Telegram'dan bot tokeni bilan oladi; Telegram limiti — 20 MB).
- Vakansiya yopilsa (Faol emas) botdan yo'qoladi, kelgan nomzodlar saqlanadi.

Menyuda yangi (ko'rilmagan) lid va nomzodlar soni ko'rsatiladi. Bot backend bilan `X-Bot-Secret` orqali gaplashadi (`/api/bot/*`).

## Fanlar, o'qituvchilar va dars jadvali
- **Fan** — o'quv markazda o'tiladigan fanlar nomenklaturasi (nomi, tavsif, faol). Narx va davomiylik yo'q.
- **O'qituvchi** bitta fanga biriktiriladi. Guruh yaratishda o'qituvchilar ro'yxati tanlangan fanga qarab chiqadi; API ham
  boshqa fan o'qituvchisini guruhga qo'yishga yo'l qo'ymaydi.
- **Dars jadvali** — kunlar (`kunlar`: 1=Du … 7=Yak) va boshlanish vaqti (`soat`: `HH:MM`). Ko'rsatish uchun `jadval` matni
  (masalan `Du-Chor-Ju 19:00`) shulardan serverda hosil qilinadi.
- **Davomat** — admin panelda: Guruhlar → «Davomat» → sana → har bir o'quvchi uchun Keldi / Kelmadi / Sababli (kelajak sanasi mumkin emas).
- To'lovlar oylik reestr ko'rinishida yuritiladi, Excel'ga yuklanadi.

## Eski bazadan o'tish
`schema.sql` har ishga tushganda avtomatik migratsiya qiladi (qayta ishga tushirish xavfsiz):
- **Filiallar:** `filiallar` jadvali yaratiladi va barcha mavjud ma'lumot (adminlar, fanlar, o'qituvchilar, o'quvchilar, guruhlar, lidlar,
  vakansiyalar, nomzodlar) avtomatik **«Bosh filial»**ga o'tadi. Keyin uni «Tahrirlash» orqali nomini o'zgartirishingiz mumkin.
- `kurs_adminlar` ga `login`, `parol_hash` qo'shiladi; `telegram_id` majburiy emas.
  **Eski adminlar login/parolsiz qoladi — superadmin har biriga «Tahrirlash» orqali login va parol belgilamaguncha kira olmaydi.**
- Eski `login_tokenlar` jadvali o'chiriladi.
- O'qituvchi/o'quvchilardagi `telegram_id` ustuni bazada qoladi (formada ko'rsatilmaydi va ishlatilmaydi).
- Yangi jadvallar: `lidlar`, `vakansiyalar`, `nomzodlar`.

## Ishga tushirish (lokal)
```bash
# 1) Baza
sudo -u postgres psql -c "CREATE USER today_edu_user WITH PASSWORD 'KUCHLI_PAROL'" \
                      -c "CREATE DATABASE today_edu OWNER today_edu_user"

# 2) Backend
cd backend && npm install && cp .env.example .env
#    .env: DB_PASSWORD, JWT_SECRET, BOT_SECRET (har biri uzun tasodifiy), KURS_BOT_TOKEN
npm run hash -- "superadmin_parol"      # chiqqan qiymatni SUPERADMIN_PASSWORD_HASH ga qo'ying
npm run db:setup && npm start           # http://127.0.0.1:3010

# 3) Bot  (avval @BotFather'da bot yarating)
cd ../bot && npm install && cp .env.example .env   # KURS_BOT_TOKEN (backenddagi bilan bir xil), BOT_SECRET (backenddagi bilan bir xil)
npm start
```
Tasodifiy sir: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

Birinchi qadam: superadmin sifatida kiring → «Filial qo'shish» (yoki «Bosh filial»ning nomini o'zgartiring) → «Admin qo'shish» (filialni tanlab, login va parol bering) →
admin shu bilan `/index.html` dan kiradi.
Botga ma'lumot chiqishi uchun admin panelda kamida bitta **faol fan** va u bo'yicha **ochiq guruh** (o'qituvchi, jadval, narx bilan) yarating.

## Test
Ishlayotgan server va baza bilan (`LOGIN_MAX_ATTEMPTS=100` — test o'zi login cheklovi ostiga tushmasligi uchun):
```bash
cd backend && LOGIN_MAX_ATTEMPTS=100 npm start &     # alohida terminalda ham bo'ladi
LOGIN_MAX_ATTEMPTS=100 node scripts/e2e.js           # superadmin paroli: TestParol123 (hash .env da)
```

## Deploy
`deploy/` ichidagi `ecosystem.config.js`, `nginx-courses.conf`, `deploy.sh` ga qarang.
`.env` fayllari gitga **qo'shilmaydi**.

## Docker (lokal ishlab chiqish)
```bash
cp .env.docker.example .env        # ildizdagi .env: DB_PASSWORD (postgres va backend uchun bitta parol)
# backend/.env va bot/.env ni .env.example'lardan to'ldiring.
docker compose up -d --build
docker compose logs -f backend bot
```
- Hammasi **http://localhost:3010** da (backend `web/` ni ham beradi).
- Konteynerda `HOST`, `DB_HOST`, `API_BASE` avtomatik to'g'rilanadi (`docker-compose.yml` dagi `environment`), `.env` dagi `localhost` qiymatlari ta'sir qilmaydi.
- Sxema backend har ishga tushganda qo'llanadi (`db:setup`, qayta ishga tushirish xavfsiz). Baza ma'lumotlari `pgdata` volume'ida saqlanadi.
- `web/Dockerfile` ishlatilmaydi — o'chirib yuborishingiz mumkin.
