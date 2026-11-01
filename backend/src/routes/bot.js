// ─── Telegram bot uchun API (faqat X-Bot-Secret bilan) ──────────────────────
//  GET  /api/bot/kurslar       — faol fanlar va ularning ochiq (joy bor) guruhlari
//  POST /api/bot/lid           — kursga yozilish arizasi (admin panel «Lidlar»ga tushadi)
//  GET  /api/bot/vakansiyalar  — faol vakansiyalar
//  POST /api/bot/nomzod        — vakansiyaga ariza (admin panel «Nomzodlar»ga tushadi)
const { Router } = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { str, int, phone, bad, wrap } = require('../util');

const router = Router();

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
router.use((req, res, next) => {
  const s = process.env.BOT_SECRET || '';
  if (s.length < 24 || !eq(req.headers['x-bot-secret'] || '', s)) return bad(res, "Ruxsat yo'q", 403);
  next();
});

// Telegram ID: musbat butun son yoki null
const tgOrNull = v => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const uname = v => str(v, 64).replace(/^@/, '');

router.get('/kurslar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT f.id AS fan_id, f.nomi AS fan_nomi, f.tavsif,
           g.id, g.nomi, g.jadval, g.kunlar, g.soat, to_char(g.boshlanish,'YYYY-MM-DD') AS boshlanish,
           g.oylik_narx::float AS oylik_narx, g.max_oquvchi,
           TRIM(CONCAT(q.familiya, ' ', q.ism)) AS oqituvchi,
           (SELECT COUNT(*)::int FROM guruh_oquvchilari x WHERE x.guruh_id=g.id) AS band
      FROM guruhlar g
      JOIN fanlar f ON f.id=g.fan_id AND f.faol
      LEFT JOIN oqituvchilar q ON q.id=g.oqituvchi_id
     WHERE g.holat <> 'yopilgan'
     ORDER BY f.nomi, g.id`);
  const fans = new Map();
  for (const x of r.rows) {
    if (x.band >= x.max_oquvchi) continue; // to'lgan guruhga yozilib bo'lmaydi
    if (!fans.has(x.fan_id)) fans.set(x.fan_id, { id: x.fan_id, nomi: x.fan_nomi, tavsif: x.tavsif, guruhlar: [] });
    fans.get(x.fan_id).guruhlar.push({ id: x.id, nomi: x.nomi, jadval: x.jadval, kunlar: x.kunlar, soat: x.soat, boshlanish: x.boshlanish,
      oylik_narx: x.oylik_narx, oqituvchi: x.oqituvchi, bosh_joy: x.max_oquvchi - x.band });
  }
  res.json({ ok: true, fanlar: [...fans.values()] });
}));

router.post('/lid', wrap(async (req, res) => {
  const b = req.body || {};
  const ism = str(b.ism, 100), tel = phone(b.telefon), gid = int(b.guruh_id), tg = tgOrNull(b.telegram_id);
  if (ism.length < 2) return bad(res, "Ism noto'g'ri");
  if (!tel) return bad(res, "Telefon raqami noto'g'ri");
  if (!gid) return bad(res, 'Guruhni tanlang');
  const g = await pool.query(`SELECT g.id, g.nomi, f.nomi AS fan_nomi FROM guruhlar g JOIN fanlar f ON f.id=g.fan_id AND f.faol
                               WHERE g.id=$1 AND g.holat<>'yopilgan'`, [gid]);
  if (!g.rowCount) return bad(res, 'Guruh topilmadi yoki yopilgan', 404);
  // Bir odam bir guruhga ketma-ket bosib ariza to'ldirmasin
  if (tg && (await pool.query("SELECT 1 FROM lidlar WHERE telegram_id=$1 AND guruh_id=$2 AND holat IN ('yangi','aloqada')", [tg, gid])).rowCount)
    return res.json({ ok: true, takror: true });
  const r = await pool.query(
    'INSERT INTO lidlar(ism,telefon,telegram_id,username,guruh_id,fan_nomi,guruh_nomi) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [ism, tel, tg, uname(b.username), gid, g.rows[0].fan_nomi, g.rows[0].nomi]);
  res.json({ ok: true, id: r.rows[0].id });
}));

router.get('/vakansiyalar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT v.id, v.nomi, v.tavsif, v.talablar, v.maosh, f.nomi AS fan_nomi
      FROM vakansiyalar v LEFT JOIN fanlar f ON f.id=v.fan_id
     WHERE v.faol ORDER BY v.id DESC`);
  res.json({ ok: true, items: r.rows });
}));

router.post('/nomzod', wrap(async (req, res) => {
  const b = req.body || {};
  const ism = str(b.ism, 100), tel = phone(b.telefon), vid = int(b.vakansiya_id), tg = tgOrNull(b.telegram_id);
  if (ism.length < 2) return bad(res, "Ism noto'g'ri");
  if (!tel) return bad(res, "Telefon raqami noto'g'ri");
  if (!vid) return bad(res, 'Vakansiyani tanlang');
  const v = await pool.query('SELECT id, nomi FROM vakansiyalar WHERE id=$1 AND faol', [vid]);
  if (!v.rowCount) return bad(res, 'Vakansiya topilmadi yoki yopilgan', 404);
  if (tg && (await pool.query("SELECT 1 FROM nomzodlar WHERE telegram_id=$1 AND vakansiya_id=$2 AND holat='yangi'", [tg, vid])).rowCount)
    return res.json({ ok: true, takror: true });
  const r = await pool.query(
    `INSERT INTO nomzodlar(vakansiya_id,vakansiya_nomi,ism,telefon,tajriba,telegram_id,username,rezyume_file_id,rezyume_nomi)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [vid, v.rows[0].nomi, ism, tel, str(b.tajriba, 2000), tg, uname(b.username),
     b.rezyume_file_id ? str(b.rezyume_file_id, 300) : null, str(b.rezyume_nomi, 200)]);
  res.json({ ok: true, id: r.rows[0].id });
}));

module.exports = router;
