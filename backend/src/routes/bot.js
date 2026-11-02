// ─── Telegram bot uchun API (faqat X-Bot-Secret bilan) ──────────────────────
//  GET  /api/bot/filiallar                 — faol filiallar (bot avval filialni tanlatadi)
//  GET  /api/bot/kurslar?filial_id=        — filialning faol fanlari va ochiq (joy bor) guruhlari
//  POST /api/bot/lid                       — kursga yozilish arizasi (shu guruh filialining «Lidlar»iga tushadi)
//  GET  /api/bot/vakansiyalar?filial_id=   — filialning faol vakansiyalari
//  GET  /api/bot/vakansiya/:id             — bitta faol vakansiya
//  POST /api/bot/nomzod                    — vakansiyaga ariza (shu vakansiya filialining «Nomzodlar»iga tushadi)
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

router.get('/filiallar', wrap(async (req, res) => {
  const r = await pool.query('SELECT id, nomi FROM filiallar WHERE faol ORDER BY id');
  res.json({ ok: true, items: r.rows });
}));

router.get('/kurslar', wrap(async (req, res) => {
  const filial = int(req.query.filial_id); if (!filial) return bad(res, 'Filialni tanlang');
  const fl = await pool.query('SELECT id, nomi FROM filiallar WHERE id=$1 AND faol', [filial]);
  if (!fl.rowCount) return bad(res, 'Filial topilmadi', 404);
  const r = await pool.query(`
    SELECT f.id AS fan_id, f.nomi AS fan_nomi, f.tavsif,
           g.id, g.nomi, g.jadval, g.kunlar, g.soat, to_char(g.boshlanish,'YYYY-MM-DD') AS boshlanish,
           g.oylik_narx::float AS oylik_narx, g.max_oquvchi,
           TRIM(CONCAT(q.familiya, ' ', q.ism)) AS oqituvchi,
           (SELECT COUNT(*)::int FROM guruh_oquvchilari x WHERE x.guruh_id=g.id) AS band
      FROM guruhlar g
      JOIN fanlar f ON f.id=g.fan_id AND f.faol
      LEFT JOIN oqituvchilar q ON q.id=g.oqituvchi_id
     WHERE g.holat <> 'yopilgan' AND g.filial_id=$1
       AND EXISTS (SELECT 1 FROM filiallar fl WHERE fl.id=g.filial_id AND fl.faol)
     ORDER BY f.nomi, g.id`, [filial]);
  const fans = new Map();
  for (const x of r.rows) {
    if (x.band >= x.max_oquvchi) continue; // to'lgan guruhga yozilib bo'lmaydi
    if (!fans.has(x.fan_id)) fans.set(x.fan_id, { id: x.fan_id, nomi: x.fan_nomi, tavsif: x.tavsif, guruhlar: [] });
    fans.get(x.fan_id).guruhlar.push({ id: x.id, nomi: x.nomi, jadval: x.jadval, kunlar: x.kunlar, soat: x.soat, boshlanish: x.boshlanish,
      oylik_narx: x.oylik_narx, oqituvchi: x.oqituvchi, bosh_joy: x.max_oquvchi - x.band });
  }
  res.json({ ok: true, filial: fl.rows[0], fanlar: [...fans.values()] });
}));

router.post('/lid', wrap(async (req, res) => {
  const b = req.body || {};
  const ism = str(b.ism, 100), tel = phone(b.telefon), gid = int(b.guruh_id), tg = tgOrNull(b.telegram_id);
  if (ism.length < 2) return bad(res, "Ism noto'g'ri");
  if (!tel) return bad(res, "Telefon raqami noto'g'ri");
  if (!gid) return bad(res, 'Guruhni tanlang');
  const g = await pool.query(`SELECT g.id, g.nomi, g.filial_id, f.nomi AS fan_nomi FROM guruhlar g JOIN fanlar f ON f.id=g.fan_id AND f.faol
                               JOIN filiallar fl ON fl.id=g.filial_id AND fl.faol
                               WHERE g.id=$1 AND g.holat<>'yopilgan'`, [gid]);
  if (!g.rowCount) return bad(res, 'Guruh topilmadi yoki yopilgan', 404);
  // Bir odam bir guruhga ketma-ket bosib ariza to'ldirmasin
  if (tg && (await pool.query("SELECT 1 FROM lidlar WHERE telegram_id=$1 AND guruh_id=$2 AND holat IN ('yangi','aloqada')", [tg, gid])).rowCount)
    return res.json({ ok: true, takror: true });
  const r = await pool.query(
    'INSERT INTO lidlar(ism,telefon,telegram_id,username,guruh_id,fan_nomi,guruh_nomi,filial_id,manzil) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [ism, tel, tg, uname(b.username), gid, g.rows[0].fan_nomi, g.rows[0].nomi, g.rows[0].filial_id, str(b.manzil, 300)]);
  res.json({ ok: true, id: r.rows[0].id });
}));

const VAK = `SELECT v.id, v.nomi, v.tavsif, v.talablar, v.maosh, f.nomi AS fan_nomi
               FROM vakansiyalar v LEFT JOIN fanlar f ON f.id=v.fan_id
               JOIN filiallar fl ON fl.id=v.filial_id AND fl.faol`;
router.get('/vakansiyalar', wrap(async (req, res) => {
  const filial = int(req.query.filial_id); if (!filial) return bad(res, 'Filialni tanlang');
  const fl = await pool.query('SELECT id, nomi FROM filiallar WHERE id=$1 AND faol', [filial]);
  if (!fl.rowCount) return bad(res, 'Filial topilmadi', 404);
  const r = await pool.query(`${VAK} WHERE v.faol AND v.filial_id=$1 ORDER BY v.id DESC`, [filial]);
  res.json({ ok: true, filial: fl.rows[0], items: r.rows });
}));
router.get('/vakansiya/:id', wrap(async (req, res) => {
  const r = await pool.query(`${VAK} WHERE v.faol AND v.id=$1`, [int(req.params.id) || 0]);
  r.rowCount ? res.json({ ok: true, item: r.rows[0] }) : bad(res, 'Vakansiya topilmadi', 404);
}));

router.post('/nomzod', wrap(async (req, res) => {
  const b = req.body || {};
  const ism = str(b.ism, 100), tel = phone(b.telefon), vid = int(b.vakansiya_id), tg = tgOrNull(b.telegram_id);
  if (ism.length < 2) return bad(res, "Ism noto'g'ri");
  if (!tel) return bad(res, "Telefon raqami noto'g'ri");
  if (!vid) return bad(res, 'Vakansiyani tanlang');
  const v = await pool.query(`SELECT v.id, v.nomi, v.filial_id FROM vakansiyalar v JOIN filiallar fl ON fl.id=v.filial_id AND fl.faol
                               WHERE v.id=$1 AND v.faol`, [vid]);
  if (!v.rowCount) return bad(res, 'Vakansiya topilmadi yoki yopilgan', 404);
  if (tg && (await pool.query("SELECT 1 FROM nomzodlar WHERE telegram_id=$1 AND vakansiya_id=$2 AND holat='yangi'", [tg, vid])).rowCount)
    return res.json({ ok: true, takror: true });
  const r = await pool.query(
    `INSERT INTO nomzodlar(vakansiya_id,vakansiya_nomi,ism,telefon,tajriba,telegram_id,username,rezyume_file_id,rezyume_nomi,filial_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [vid, v.rows[0].nomi, ism, tel, str(b.tajriba, 2000), tg, uname(b.username),
     b.rezyume_file_id ? str(b.rezyume_file_id, 300) : null, str(b.rezyume_nomi, 200), v.rows[0].filial_id]);
  res.json({ ok: true, id: r.rows[0].id });
}));

module.exports = router;
