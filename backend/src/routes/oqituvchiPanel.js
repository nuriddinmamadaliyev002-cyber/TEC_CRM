// ─── O'qituvchi paneli API (faqat o'qituvchining O'ZIGA biriktirilgan guruhlari) ─
//  GET /stats · GET /guruhlar · GET /guruhlar/:id/oquvchilar
//  GET|PUT /guruhlar/:id/davomat?sana=YYYY-MM-DD
//  To'lov/narx kabi moliyaviy ma'lumotlar bu yerda KO'RSATILMAYDI.
const { Router } = require('express');
const pool = require('../db');
const teacherAuth = require('../middleware/teacherAuth');
const { int, date, bad, wrap } = require('../util');

const router = Router();
router.use(teacherAuth);

const HOLATLAR = ['keldi', 'kelmadi', 'sababli'];

// 2026-02-31 kabi mavjud bo'lmagan sanalarni ham rad etadi
function realDate(v) {
  const s = date(v); if (!s) return null;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s ? s : null;
}
const todayISO = () => new Date().toISOString().slice(0, 10);

// Guruh shu o'qituvchiga tegishlimi? Boshqa o'qituvchi guruhi uchun 404 (mavjudligini ham bildirmaymiz)
async function ownGroup(req, res) {
  const id = int(req.params.id);
  if (!id) { bad(res, "Noto'g'ri guruh"); return null; }
  const r = await pool.query('SELECT id, nomi FROM guruhlar WHERE id=$1 AND oqituvchi_id=$2', [id, req.user.entityId]);
  if (!r.rowCount) { bad(res, 'Guruh topilmadi', 404); return null; }
  return r.rows[0];
}

router.get('/stats', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM guruhlar WHERE oqituvchi_id=$1 AND holat<>'yopilgan') AS guruhlar,
      (SELECT COUNT(DISTINCT x.oquvchi_id)::int
         FROM guruh_oquvchilari x JOIN guruhlar g ON g.id=x.guruh_id
        WHERE g.oqituvchi_id=$1 AND g.holat<>'yopilgan') AS oquvchilar`, [req.user.entityId]);
  res.json({ ok: true, stats: r.rows[0] });
}));

router.get('/guruhlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT g.id, g.nomi, g.jadval, g.boshlanish, g.max_oquvchi, g.holat, f.nomi AS fan_nomi,
           (SELECT COUNT(*)::int FROM guruh_oquvchilari x WHERE x.guruh_id=g.id) AS oquvchilar_soni
      FROM guruhlar g JOIN fanlar f ON f.id=g.fan_id
     WHERE g.oqituvchi_id=$1
     ORDER BY (g.holat='yopilgan'), g.id DESC`, [req.user.entityId]);
  res.json({ ok: true, guruhlar: r.rows });
}));

router.get('/guruhlar/:id/oquvchilar', wrap(async (req, res) => {
  const g = await ownGroup(req, res); if (!g) return;
  const r = await pool.query(`
    SELECT o.id, o.ism, o.familiya, o.telefon, x.qoshilgan
      FROM guruh_oquvchilari x JOIN oquvchilar o ON o.id=x.oquvchi_id
     WHERE x.guruh_id=$1 ORDER BY o.familiya, o.ism`, [g.id]);
  res.json({ ok: true, items: r.rows });
}));

// Tanlangan kun davomati: guruhdagi har bir o'quvchi + belgilangan holat (yoki null)
router.get('/guruhlar/:id/davomat', wrap(async (req, res) => {
  const g = await ownGroup(req, res); if (!g) return;
  const sana = req.query.sana ? realDate(req.query.sana) : todayISO();
  if (!sana) return bad(res, "Sana noto'g'ri");
  const r = await pool.query(`
    SELECT o.id, o.ism, o.familiya, o.telefon, d.holat
      FROM guruh_oquvchilari x
      JOIN oquvchilar o ON o.id=x.oquvchi_id
      LEFT JOIN davomat d ON d.guruh_id=x.guruh_id AND d.oquvchi_id=o.id AND d.sana=$2::date
     WHERE x.guruh_id=$1 ORDER BY o.familiya, o.ism`, [g.id, sana]);
  res.json({ ok: true, sana, items: r.rows });
}));

// Davomatni saqlash (qayta saqlansa yangilanadi). Guruhda bo'lmagan o'quvchi e'tiborga olinmaydi.
router.put('/guruhlar/:id/davomat', wrap(async (req, res) => {
  const g = await ownGroup(req, res); if (!g) return;
  const sana = realDate((req.body || {}).sana);
  if (!sana) return bad(res, "Sana noto'g'ri");
  const items = (req.body || {}).items;
  if (!Array.isArray(items) || !items.length) return bad(res, "Davomat bo'sh");
  if (items.length > 500) return bad(res, "Juda ko'p yozuv");
  const ids = [], hol = [], seen = new Set();
  for (const it of items) {
    const oid = int(it && it.oquvchi_id);
    if (!oid || !HOLATLAR.includes(it.holat)) return bad(res, "Davomat ma'lumoti noto'g'ri");
    if (seen.has(oid)) continue; seen.add(oid);
    ids.push(oid); hol.push(it.holat);
  }
  const r = await pool.query(`
    INSERT INTO davomat(guruh_id, oquvchi_id, sana, holat)
    SELECT $1::int, x.oid, $2::date, x.h
      FROM unnest($3::int[], $4::text[]) AS x(oid, h)
     WHERE EXISTS (SELECT 1 FROM guruh_oquvchilari go WHERE go.guruh_id=$1::int AND go.oquvchi_id=x.oid)
    ON CONFLICT (guruh_id, oquvchi_id, sana) DO UPDATE SET holat=EXCLUDED.holat, yangilangan=NOW()`,
    [g.id, sana, ids, hol]);
  res.json({ ok: true, saqlandi: r.rowCount });
}));

module.exports = router;
