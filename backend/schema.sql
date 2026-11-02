-- Today Education Centre — to'liq sxema (qayta ishga tushirish xavfsiz)

-- ═══ Migratsiya: «kurslar» → «fanlar» (eski bazalar uchun; yangi bazada hech narsa qilmaydi) ═══
DO $$
BEGIN
  IF to_regclass('public.kurslar') IS NOT NULL AND to_regclass('public.fanlar') IS NULL THEN
    ALTER TABLE kurslar RENAME TO fanlar;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='guruhlar' AND column_name='kurs_id') THEN
    ALTER TABLE guruhlar RENAME COLUMN kurs_id TO fan_id;
  END IF;
END $$;
DROP INDEX IF EXISTS idx_guruhlar_kurs;

-- Adminlar (interfeysda «Admin»; jadval nomi tarixiy: kurs_adminlar). Login + parol bilan kiradi,
-- ularni superadmin yaratadi. Superadmin .env da, jadvalda emas.
CREATE TABLE IF NOT EXISTS kurs_adminlar (
  id          SERIAL PRIMARY KEY,
  ism         TEXT NOT NULL,
  familiya    TEXT NOT NULL DEFAULT '',
  telefon     TEXT NOT NULL DEFAULT '',
  telegram_id BIGINT UNIQUE,
  login       TEXT,
  parol_hash  TEXT,
  faol        BOOLEAN NOT NULL DEFAULT TRUE,
  yaratilgan  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  oxirgi_kirish TIMESTAMPTZ
);
-- Eski bazalar: Telegram ID endi kirish uchun kerak emas; login/parol qo'shiladi (login'siz eski adminlar superadmin tayinlaguncha kira olmaydi)
ALTER TABLE kurs_adminlar ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE kurs_adminlar ADD COLUMN IF NOT EXISTS login TEXT;
ALTER TABLE kurs_adminlar ADD COLUMN IF NOT EXISTS parol_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kurs_adminlar_login ON kurs_adminlar(LOWER(login)) WHERE login IS NOT NULL;

-- Telegram orqali kirish bekor qilindi: eski bir martalik tokenlar jadvali kerak emas
DROP TABLE IF EXISTS login_tokenlar;

-- Fanlar: o'quv markazda o'tiladigan fanlar nomenklaturasi
CREATE TABLE IF NOT EXISTS fanlar (
  id            SERIAL PRIMARY KEY,
  nomi          TEXT NOT NULL,
  tavsif        TEXT NOT NULL DEFAULT '',
  faol          BOOLEAN NOT NULL DEFAULT TRUE,
  yaratilgan    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Eski «kurslar» dan qolgan narx va davomiylik endi kerak emas
ALTER TABLE fanlar DROP COLUMN IF EXISTS narx;
ALTER TABLE fanlar DROP COLUMN IF EXISTS davomiylik_oy;

CREATE TABLE IF NOT EXISTS oqituvchilar (
  id          SERIAL PRIMARY KEY,
  ism         TEXT NOT NULL,
  familiya    TEXT NOT NULL DEFAULT '',
  telefon     TEXT NOT NULL DEFAULT '',
  telegram_id BIGINT,
  fan_id      INTEGER REFERENCES fanlar(id) ON DELETE RESTRICT,
  faol        BOOLEAN NOT NULL DEFAULT TRUE,
  yaratilgan  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oquvchilar (
  id          SERIAL PRIMARY KEY,
  ism         TEXT NOT NULL,
  familiya    TEXT NOT NULL DEFAULT '',
  telefon     TEXT NOT NULL DEFAULT '',
  telegram_id BIGINT,
  faol        BOOLEAN NOT NULL DEFAULT TRUE,
  yaratilgan  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guruhlar (
  id            SERIAL PRIMARY KEY,
  nomi          TEXT NOT NULL,
  fan_id        INTEGER NOT NULL REFERENCES fanlar(id) ON DELETE RESTRICT,
  oqituvchi_id  INTEGER REFERENCES oqituvchilar(id) ON DELETE SET NULL,
  jadval        TEXT NOT NULL DEFAULT '',          -- ko'rsatish uchun matn (kunlar+soat'dan hosil bo'ladi): Du-Chor-Ju 19:00
  kunlar        SMALLINT[] NOT NULL DEFAULT '{}',  -- 1=Du, 2=Se, 3=Chor, 4=Pay, 5=Ju, 6=Sha, 7=Yak
  soat          TEXT,                              -- dars boshlanish vaqti 'HH:MM'
  boshlanish    DATE,
  max_oquvchi   INTEGER NOT NULL DEFAULT 20 CHECK (max_oquvchi > 0),
  holat         TEXT NOT NULL DEFAULT 'ochiq' CHECK (holat IN ('ochiq','boshlangan','yopilgan')),
  yaratilgan    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guruhlar_fan ON guruhlar(fan_id);

CREATE TABLE IF NOT EXISTS guruh_oquvchilari (
  guruh_id    INTEGER NOT NULL REFERENCES guruhlar(id)   ON DELETE CASCADE,
  oquvchi_id  INTEGER NOT NULL REFERENCES oquvchilar(id) ON DELETE CASCADE,
  qoshilgan   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guruh_id, oquvchi_id)
);

CREATE TABLE IF NOT EXISTS tolovlar (
  id          SERIAL PRIMARY KEY,
  oquvchi_id  INTEGER NOT NULL REFERENCES oquvchilar(id) ON DELETE CASCADE,
  guruh_id    INTEGER REFERENCES guruhlar(id) ON DELETE SET NULL,
  summa       NUMERIC(14,2) NOT NULL CHECK (summa > 0),
  sana        DATE NOT NULL DEFAULT CURRENT_DATE,
  usul        TEXT NOT NULL DEFAULT 'naqd' CHECK (usul IN ('naqd','karta','otkazma')),
  izoh        TEXT NOT NULL DEFAULT '',
  kiritgan    TEXT NOT NULL DEFAULT '',
  yaratilgan  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tolovlar_oquvchi ON tolovlar(oquvchi_id);
CREATE INDEX IF NOT EXISTS idx_tolovlar_sana    ON tolovlar(sana);

-- ═══ Davomat (migratsiya: qayta ishga tushirish xavfsiz) ═══════════
ALTER TABLE oqituvchilar   ADD COLUMN IF NOT EXISTS oxirgi_kirish TIMESTAMPTZ;

-- Davomat: guruh + o'quvchi + kun bo'yicha bitta yozuv
CREATE TABLE IF NOT EXISTS davomat (
  guruh_id    INTEGER NOT NULL REFERENCES guruhlar(id)   ON DELETE CASCADE,
  oquvchi_id  INTEGER NOT NULL REFERENCES oquvchilar(id) ON DELETE CASCADE,
  sana        DATE NOT NULL,
  holat       TEXT NOT NULL CHECK (holat IN ('keldi','kelmadi','sababli')),
  yangilangan TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guruh_id, oquvchi_id, sana)
);
CREATE INDEX IF NOT EXISTS idx_davomat_guruh_sana ON davomat(guruh_id, sana);
CREATE INDEX IF NOT EXISTS idx_guruhlar_oqituvchi ON guruhlar(oqituvchi_id);

-- ═══ Indekslar (migratsiya: qayta ishga tushirish xavfsiz) ═════════════
ALTER TABLE oquvchilar     ADD COLUMN IF NOT EXISTS oxirgi_kirish TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_davomat_oquvchi ON davomat(oquvchi_id, sana);

-- ═══ Fanlar + dars jadvali (migratsiya: qayta ishga tushirish xavfsiz) ═══════
ALTER TABLE oqituvchilar ADD COLUMN IF NOT EXISTS fan_id INTEGER REFERENCES fanlar(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_oqituvchilar_fan ON oqituvchilar(fan_id);
-- Eski matnli «fan» ustunini nomi mos kelgan fanga bog'laymiz (katta-kichik harf farqi inobatga olinmaydi), so'ng ustunni olib tashlaymiz.
-- Mos kelmaganlarning fani bo'sh qoladi — admin uni tahrirlashda tanlaydi.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='oqituvchilar' AND column_name='fan') THEN
    UPDATE oqituvchilar o SET fan_id = f.id FROM fanlar f
     WHERE o.fan_id IS NULL AND LOWER(TRIM(o.fan)) = LOWER(TRIM(f.nomi));
    ALTER TABLE oqituvchilar DROP COLUMN fan;
  END IF;
END $$;
ALTER TABLE guruhlar ADD COLUMN IF NOT EXISTS kunlar SMALLINT[] NOT NULL DEFAULT '{}';
ALTER TABLE guruhlar ADD COLUMN IF NOT EXISTS soat TEXT;

-- ═══ Oylik to'lov reestri (migratsiya: qayta ishga tushirish xavfsiz) ═════════
-- Guruhning oylik to'lov narxi (so'm)
ALTER TABLE guruhlar ADD COLUMN IF NOT EXISTS oylik_narx NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (oylik_narx >= 0);

-- O'quvchi qaysi sanada nofaol qilingan: shu oydan boshlab to'lovlar reestrida ko'rinmaydi, oldingi oylarda esa ko'rinadi
ALTER TABLE oquvchilar ADD COLUMN IF NOT EXISTS nofaol_sana DATE;
UPDATE oquvchilar SET nofaol_sana = (NOW() AT TIME ZONE 'Asia/Tashkent')::date WHERE NOT faol AND nofaol_sana IS NULL;

-- Admin qaydlari: (guruh, o'quvchi, oy) bo'yicha — telefon qilinganda yozib boriladigan ma'lumot va sanalar
CREATE TABLE IF NOT EXISTS tolov_eslatmalar (
  guruh_id          INTEGER NOT NULL REFERENCES guruhlar(id)   ON DELETE CASCADE,
  oquvchi_id        INTEGER NOT NULL REFERENCES oquvchilar(id) ON DELETE CASCADE,
  oy                DATE    NOT NULL,                 -- oyning 1-sanasi
  qaydnoma          TEXT    NOT NULL DEFAULT '',
  ehtimoliy_sana    DATE,                             -- qaysi kuni to'lov qilishi kutilmoqda
  gaplashilgan_sana DATE,                             -- qaysi kuni gaplashilgan
  yangilangan       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guruh_id, oquvchi_id, oy)
);

-- Guruhi ko'rsatilmagan eski to'lovlar: o'quvchi aynan bitta guruhda bo'lsa, shu guruhga biriktiramiz
UPDATE tolovlar t SET guruh_id = (SELECT x.guruh_id FROM guruh_oquvchilari x WHERE x.oquvchi_id = t.oquvchi_id)
 WHERE t.guruh_id IS NULL AND (SELECT COUNT(*) FROM guruh_oquvchilari x WHERE x.oquvchi_id = t.oquvchi_id) = 1;

-- ═══ Telegram bot: lidlar (kursga yozilish), vakansiyalar va nomzodlar ═══════
-- Lid: botda o'quvchi tanlagan fan/guruh bo'yicha qoldirgan ariza. Guruh o'chsa ham yozuv qoladi (nomi nusxalanadi).
CREATE TABLE IF NOT EXISTS lidlar (
  id            SERIAL PRIMARY KEY,
  ism           TEXT NOT NULL,
  telefon       TEXT NOT NULL,
  telegram_id   BIGINT,
  username      TEXT NOT NULL DEFAULT '',
  guruh_id      INTEGER REFERENCES guruhlar(id) ON DELETE SET NULL,
  fan_nomi      TEXT NOT NULL DEFAULT '',
  guruh_nomi    TEXT NOT NULL DEFAULT '',
  holat         TEXT NOT NULL DEFAULT 'yangi' CHECK (holat IN ('yangi','aloqada','yozildi','rad')),
  izoh          TEXT NOT NULL DEFAULT '',
  oquvchi_id    INTEGER REFERENCES oquvchilar(id) ON DELETE SET NULL,
  yaratilgan    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lidlar_holat ON lidlar(holat, yaratilgan DESC);
CREATE INDEX IF NOT EXISTS idx_lidlar_guruh ON lidlar(guruh_id);

-- Vakansiyalar: o'qituvchi ish o'rinlari (admin yaratadi, bot ko'rsatadi)
CREATE TABLE IF NOT EXISTS vakansiyalar (
  id          SERIAL PRIMARY KEY,
  nomi        TEXT NOT NULL,
  fan_id      INTEGER REFERENCES fanlar(id) ON DELETE SET NULL,
  tavsif      TEXT NOT NULL DEFAULT '',
  talablar    TEXT NOT NULL DEFAULT '',
  maosh       TEXT NOT NULL DEFAULT '',
  faol        BOOLEAN NOT NULL DEFAULT TRUE,
  yaratilgan  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nomzodlar: vakansiyaga botdan kelgan arizalar (rezyume — Telegram file_id; admin panel uni bot orqali yuklab oladi)
CREATE TABLE IF NOT EXISTS nomzodlar (
  id             SERIAL PRIMARY KEY,
  vakansiya_id   INTEGER REFERENCES vakansiyalar(id) ON DELETE SET NULL,
  vakansiya_nomi TEXT NOT NULL DEFAULT '',
  ism            TEXT NOT NULL,
  telefon        TEXT NOT NULL,
  tajriba        TEXT NOT NULL DEFAULT '',
  telegram_id    BIGINT,
  username       TEXT NOT NULL DEFAULT '',
  rezyume_file_id TEXT,
  rezyume_nomi   TEXT NOT NULL DEFAULT '',
  holat          TEXT NOT NULL DEFAULT 'yangi' CHECK (holat IN ('yangi','korildi','suhbat','qabul','rad')),
  izoh           TEXT NOT NULL DEFAULT '',
  yaratilgan     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nomzodlar_holat ON nomzodlar(holat, yaratilgan DESC);
CREATE INDEX IF NOT EXISTS idx_nomzodlar_vakansiya ON nomzodlar(vakansiya_id);

-- ═══ Filiallar (migratsiya: qayta ishga tushirish xavfsiz) ═══════════════════
-- Har bir filialning o'z adminlari, fanlari, o'qituvchilari, o'quvchilari, guruhlari, lidlari, vakansiyalari va nomzodlari bor.
-- To'lov, davomat, guruh a'zoligi, to'lov qaydlari filialga guruh/o'quvchi orqali bog'lanadi.
-- Mavjud ma'lumotlar avtomatik birinchi («Bosh filial») filialga o'tadi.
CREATE TABLE IF NOT EXISTS filiallar (
  id         SERIAL PRIMARY KEY,
  nomi       TEXT NOT NULL,
  faol       BOOLEAN NOT NULL DEFAULT TRUE,
  yaratilgan TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_filiallar_nomi ON filiallar(LOWER(nomi));
INSERT INTO filiallar(nomi) SELECT 'Bosh filial' WHERE NOT EXISTS (SELECT 1 FROM filiallar);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['kurs_adminlar','fanlar','oqituvchilar','oquvchilar','guruhlar','lidlar','vakansiyalar','nomzodlar'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS filial_id INTEGER REFERENCES filiallar(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE %I SET filial_id = (SELECT MIN(id) FROM filiallar) WHERE filial_id IS NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN filial_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_filial ON %I(filial_id)', t, t);
  END LOOP;
END $$;

-- ═══ O'quvchilar: yashash manzili va o'qishni to'xtatish sababi (migratsiya: qayta ishga tushirish xavfsiz) ═══
ALTER TABLE oquvchilar ADD COLUMN IF NOT EXISTS manzil       TEXT NOT NULL DEFAULT '';
ALTER TABLE oquvchilar ADD COLUMN IF NOT EXISTS nofaol_sabab TEXT NOT NULL DEFAULT '';  -- faqat nofaol o'quvchida to'ldirilgan

-- ═══ Lidlar: yashash manzili (migratsiya: qayta ishga tushirish xavfsiz) ═══
ALTER TABLE lidlar ADD COLUMN IF NOT EXISTS manzil TEXT NOT NULL DEFAULT '';
