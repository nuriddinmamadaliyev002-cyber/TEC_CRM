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
«Shu guruhga yozilaman» → familiya va ism → telefon (kontakt tugmasi yoki yozib) → yashash manzili → ariza admin panelning **📥 Lidlar** bo'limiga tushadi.
- To'lgan va yopilgan guruhlar, nofaol fanlar botda ko'rinmaydi.
- Bir odam bir guruhga ariza qoldirgan va u hali «Yangi/Aloqada» bo'lsa, takroriy ariza qabul qilinmaydi.
- Admin lidni **qo'lda ham qo'sha oladi** ("+ Qo'shish": familiya, ism, telefon, manzil, fan → guruh, izoh — masalan, qachondan o'qishni boshlashi). Qo'lda qo'shilgan lid doim «Yangi» holatida bo'ladi.
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
- **Dars davomiyligi** — guruhda ixtiyoriy (`davomiylik`, daqiqa, 15–480). Davomat oynasida va botda dars tugash vaqti ko'rinadi.
- **Davomat** — admin panelda: Guruhlar → «Davomat» → sana → har bir o'quvchi uchun Keldi / Kechikdi / Kelmadi / Sababli (kelajak sanasi mumkin emas).

### Guruh holati
| Holat | Ma'nosi |
|---|---|
| **Ochiq** | Boshlanish sanasi hali kelmagan; botda ko'rinadi, ariza qabul qilinadi |
| **Boshlangan** | Dars boshlangan. Boshlanish sanasi kelganda «Ochiq» guruh **avtomatik** shunga o'tadi (server har 10 daqiqada tekshiradi; sanasi o'tgan guruhni «Ochiq» qilib saqlab bo'lmaydi). Botda «⏳ Dars boshlangan» yozuvi bilan ko'rinadi. Guruhdagi **«Dars boshlangach ham botdan yozilish mumkin»** belgisi o'chirilsa, bunday guruh botda ko'rinmaydi (admin qo'lda qo'sha oladi) |
| **Yopilgan** | Botdan chiqadi. **To'lov reestridan** yopilgan oydan keyingi oylarda chiqadi (yopilgan oyning o'zi va eski oylar tarixi saqlanadi; sana `yopilgan_sana` da, qayta ochilsa tozalanadi). Yangi o'quvchi qo'shib va davomat yozib **bo'lmaydi** (ko'rish mumkin); lidni shu guruhga o'quvchiga aylantirib ham bo'lmaydi. Eski qarz uchun **to'lov qabul qilinaveradi** |

Yopishdan oldin panel ogohlantiradi («Guruhda N ta o'quvchi bor…»). Guruhlar ro'yxatida **Faol** (ochiq + boshlangan) va **Yopilgan** bo'limlari alohida.
- To'lovlar oylik reestr ko'rinishida yuritiladi, Excel'ga yuklanadi.

## Yuzni tanib davomat (kamera)
Admin telefon/planshet (orqa kamera) yoki kompyuter kamerasi bilan guruhni suratga oladi, tizim taniganlarni ro'yxatda **«Keldi»** qilib qo'yadi.
Admin natijani ko'rib, odatdagidek **«Saqlash»** ni bosadi (kelmadi / sababli ni qo'lda belgilaydi).
- **Hammasi brauzerda**: tanish `face-api` (`web/vendor/face-api/`, ~14 MB, bir marta yuklanadi) bilan bajariladi. Serverga faqat **128 raqamli yuz vektori** ketadi (`oquvchi_yuz`), rasm saqlanmaydi.
- **Yuzni ro'yxatga olish:** (a) yangi o'quvchi qo'shilgach «Yuzini hozir olasizmi?», yoki o'quvchilar ro'yxatidagi **📷 Yuz** tugmasi (3 ta namuna); (b) guruh davomatida **📷 Kamera bilan → Yuzlarni o'rgatish**: kadr qotiriladi, har bir yuz uchun o'quvchi tanlanadi (butun guruhni bir darsda o'rgatish mumkin).
- **Biometrik ma'lumot:** har bir o'quvchi uchun rozilik belgisi majburiy (server `oquvchilar.yuz_rozilik` ga vaqtni yozadi). «Yuzni o'chirish» vektorlar va rozilikni butunlay o'chiradi.
- Kamera uchun sayt **HTTPS** da bo'lishi shart (localhost bundan mustasno). iPhone'da Safari, Android'da Chrome tavsiya etiladi; Telegram ichki brauzerida kamera bloklanishi mumkin.
- Aniqlik: 10–15 o'quvchi, 3–4 m gacha masofa, yaxshi yorug'lik. Noto'g'ri tanilganni chipdagi **×** bilan olib tashlash mumkin. `web/js/yuz.js` boshidagi `MATCH` (0.5) — qat'iylik chegarasi.
- API: `POST|DELETE /api/oquvchilar/:id/yuz`, `GET /api/guruhlar/:id/yuzlar`.

## Eski bazadan o'tish
`schema.sql` har ishga tushganda avtomatik migratsiya qiladi (qayta ishga tushirish xavfsiz):
- **Filiallar:** `filiallar` jadvali yaratiladi va barcha mavjud ma'lumot (adminlar, fanlar, o'qituvchilar, o'quvchilar, guruhlar, lidlar,
  vakansiyalar, nomzodlar) avtomatik **«Bosh filial»**ga o'tadi. Keyin uni «Tahrirlash» orqali nomini o'zgartirishingiz mumkin.
- `kurs_adminlar` ga `login`, `parol_hash` qo'shiladi; `telegram_id` majburiy emas.
  **Eski adminlar login/parolsiz qoladi — superadmin har biriga «Tahrirlash» orqali login va parol belgilamaguncha kira olmaydi.**
- Eski `login_tokenlar` jadvali o'chiriladi.
- O'qituvchi/o'quvchilardagi `telegram_id` ustuni bazada qoladi (formada ko'rsatilmaydi va ishlatilmaydi).
- Yangi jadvallar: `lidlar`, `vakansiyalar`, `nomzodlar`.
- **Guruh holati:** `guruhlar` ga `yopilgan_sana`, `boshlangan_qabul`, `davomiylik` qo'shiladi; `davomat` holatlariga `kechikdi` qo'shiladi.
  Eski yopilgan guruhlarning yopilgan sanasi noma'lum — migratsiya kuni qo'yiladi (ular keyingi oydan reestrdan chiqadi).

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
LOGIN_MAX_ATTEMPTS=100 node scripts/e2e.js           # superadmin paroli: TestParol123 (hash .env da; boshqa parol bo'lsa SUPERADMIN_PASSWORD_HASH ni test uchun muhit o'zgaruvchisi bilan bering)
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
