// Superadmin: adminlarni boshqarish (login + parol yaratish, parolni almashtirish, faolsizlantirish)
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth } = require('../middleware/jwt');
const { str, bad, wrap } = require('../util');

const router = Router();
router.use(requireAuth(['superadmin']));

const COLS = 'id, ism, familiya, telefon, login, (parol_hash IS NOT NULL) AS parol_bor, faol, yaratilgan, oxirgi_kirish';
const LOGIN_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PAROL = 8;

// → { err } | { login, parol|null }
function creds(b, mavjud) {
  const login = str(b.login, 40);
  if (!LOGIN_RE.test(login)) return { err: "Login 3–32 belgi bo'lsin: lotin harflari, raqam, _ . -" };
  const su = String(process.env.SUPERADMIN_USERNAME || '');
  if (su && login.toLowerCase() === su.toLowerCase()) return { err: 'Bu login band' };
  const parol = typeof b.parol === 'string' ? b.parol : '';
  if (parol) {
    if (parol.length < MIN_PAROL) return { err: `Parol kamida ${MIN_PAROL} belgi bo'lsin` };
    if (parol.length > 100) return { err: 'Parol juda uzun' };
  } else if (!mavjud || !mavjud.parol_hash) return { err: 'Parolni kiriting' }; // yangi admin yoki parolsiz eski admin
  return { login, parol: parol || null };
}

router.get('/', wrap(async (req, res) => {
  const r = await pool.query(`SELECT ${COLS} FROM kurs_adminlar ORDER BY id DESC`);
  res.json({ ok: true, adminlar: r.rows });
}));

router.post('/', wrap(async (req, res) => {
  const ism = str(req.body.ism);
  if (!ism) return bad(res, 'Ism majburiy');
  const c = creds(req.body, null); if (c.err) return bad(res, c.err);
  const hash = await bcrypt.hash(c.parol, 12);
  try {
    const r = await pool.query(
      `INSERT INTO kurs_adminlar(ism,familiya,telefon,login,parol_hash,faol) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${COLS}`,
      [ism, str(req.body.familiya), str(req.body.telefon, 30), c.login, hash, req.body.faol !== false]);
    res.json({ ok: true, admin: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return bad(res, 'Bu login band', 409);
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const ism = str(req.body.ism);
  if (!ism) return bad(res, 'Ism majburiy');
  const cur = await pool.query('SELECT parol_hash FROM kurs_adminlar WHERE id=$1', [req.params.id]);
  if (!cur.rowCount) return bad(res, 'Topilmadi', 404);
  const c = creds(req.body, cur.rows[0]); if (c.err) return bad(res, c.err);
  const hash = c.parol ? await bcrypt.hash(c.parol, 12) : null; // null → parol o'zgarmaydi
  try {
    const r = await pool.query(
      `UPDATE kurs_adminlar SET ism=$1, familiya=$2, telefon=$3, login=$4, faol=$5, parol_hash=COALESCE($6, parol_hash)
        WHERE id=$7 RETURNING ${COLS}`,
      [ism, str(req.body.familiya), str(req.body.telefon, 30), c.login, req.body.faol !== false, hash, req.params.id]);
    res.json({ ok: true, admin: r.rows[0] });
  } catch (e) {
    if (e.code === '23505') return bad(res, 'Bu login band', 409);
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM kurs_adminlar WHERE id=$1', [req.params.id]);
  if (!r.rowCount) return bad(res, 'Topilmadi', 404);
  res.json({ ok: true });
}));

module.exports = router;
