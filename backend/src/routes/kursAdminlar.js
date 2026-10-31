// Superadmin: kurs adminlarini boshqarish
const { Router } = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/jwt');
const { str, tgId, bad, wrap } = require('../util');

const router = Router();
router.use(requireAuth(['superadmin']));

const COLS = 'id, ism, familiya, telefon, telegram_id::text AS telegram_id, faol, yaratilgan, oxirgi_kirish';

router.get('/', wrap(async (req, res) => {
  const r = await pool.query(`SELECT ${COLS} FROM kurs_adminlar ORDER BY id DESC`);
  res.json({ ok: true, adminlar: r.rows });
}));

router.post('/', async (req, res) => {
  const ism = str(req.body.ism), tg = tgId(req.body.telegram_id);
  if (!ism) return bad(res, 'Ism majburiy');
  if (!tg)  return bad(res, "Telegram ID noto'g'ri (faqat raqam)");
  try {
    const r = await pool.query(
      `INSERT INTO kurs_adminlar(ism,familiya,telefon,telegram_id) VALUES($1,$2,$3,$4) RETURNING ${COLS}`,
      [ism, str(req.body.familiya), str(req.body.telefon), tg]);
    res.json({ ok: true, admin: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return bad(res, 'Bu Telegram ID allaqachon biriktirilgan', 409);
    console.error('kurs-admin POST:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

router.put('/:id', async (req, res) => {
  const ism = str(req.body.ism), tg = tgId(req.body.telegram_id);
  if (!ism) return bad(res, 'Ism majburiy');
  if (!tg)  return bad(res, "Telegram ID noto'g'ri (faqat raqam)");
  try {
    const r = await pool.query(
      `UPDATE kurs_adminlar SET ism=$1, familiya=$2, telefon=$3, telegram_id=$4, faol=$5 WHERE id=$6 RETURNING ${COLS}`,
      [ism, str(req.body.familiya), str(req.body.telefon), tg, req.body.faol !== false, req.params.id]);
    if (!r.rowCount) return bad(res, 'Topilmadi', 404);
    res.json({ ok: true, admin: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return bad(res, 'Bu Telegram ID allaqachon biriktirilgan', 409);
    console.error('kurs-admin PUT:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' });
  }
});

router.delete('/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM kurs_adminlar WHERE id=$1', [req.params.id]);
  if (!r.rowCount) return bad(res, 'Topilmadi', 404);
  res.json({ ok: true });
}));

module.exports = router;
