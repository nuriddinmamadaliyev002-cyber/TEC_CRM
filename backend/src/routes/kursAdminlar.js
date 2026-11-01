// Superadmin: adminlarni boshqarish (filialga biriktirish, login + parol yaratish, parolni almashtirish, faolsizlantirish)
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth } = require('../middleware/jwt');
const { str, int, bad, wrap } = require('../util');

const router = Router();
router.use(requireAuth(['superadmin']));

const SEL = `SELECT a.id, a.ism, a.familiya, a.telefon, a.login, (a.parol_hash IS NOT NULL) AS parol_bor, a.faol, a.yaratilgan, a.oxirgi_kirish,
                    a.filial_id, f.nomi AS filial_nomi
               FROM kurs_adminlar a JOIN filiallar f ON f.id=a.filial_id`;
const LOGIN_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PAROL = 8;

// → { err } | { login, parol|null, filial }
async function creds(b, mavjud) {
  const login = str(b.login, 40);
  if (!LOGIN_RE.test(login)) return { err: "Login 3–32 belgi bo'lsin: lotin harflari, raqam, _ . -" };
  const su = String(process.env.SUPERADMIN_USERNAME || '');
  if (su && login.toLowerCase() === su.toLowerCase()) return { err: 'Bu login band' };
  const filial = int(b.filial_id);
  if (!filial || !(await pool.query('SELECT 1 FROM filiallar WHERE id=$1', [filial])).rowCount) return { err: 'Filialni tanlang' };
  const parol = typeof b.parol === 'string' ? b.parol : '';
  if (parol) {
    if (parol.length < MIN_PAROL) return { err: `Parol kamida ${MIN_PAROL} belgi bo'lsin` };
    if (parol.length > 100) return { err: 'Parol juda uzun' };
  } else if (!mavjud || !mavjud.parol_hash) return { err: 'Parolni kiriting' }; // yangi admin yoki parolsiz eski admin
  return { login, parol: parol || null, filial };
}

router.get('/', wrap(async (req, res) => {
  const r = await pool.query(`${SEL} ORDER BY a.id DESC`);
  res.json({ ok: true, adminlar: r.rows });
}));

router.post('/', wrap(async (req, res) => {
  const ism = str(req.body.ism);
  if (!ism) return bad(res, 'Ism majburiy');
  const c = await creds(req.body, null); if (c.err) return bad(res, c.err);
  const hash = await bcrypt.hash(c.parol, 12);
  try {
    const r = await pool.query(
      `INSERT INTO kurs_adminlar(ism,familiya,telefon,login,parol_hash,faol,filial_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ism, str(req.body.familiya), str(req.body.telefon, 30), c.login, hash, req.body.faol !== false, c.filial]);
    res.json({ ok: true, admin: (await pool.query(`${SEL} WHERE a.id=$1`, [r.rows[0].id])).rows[0] });
  } catch (e) {
    if (e.code === '23505') return bad(res, 'Bu login band', 409);
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const ism = str(req.body.ism), id = int(req.params.id) || 0;
  if (!ism) return bad(res, 'Ism majburiy');
  const cur = await pool.query('SELECT parol_hash FROM kurs_adminlar WHERE id=$1', [id]);
  if (!cur.rowCount) return bad(res, 'Topilmadi', 404);
  const c = await creds(req.body, cur.rows[0]); if (c.err) return bad(res, c.err);
  const hash = c.parol ? await bcrypt.hash(c.parol, 12) : null; // null → parol o'zgarmaydi
  try {
    await pool.query(
      `UPDATE kurs_adminlar SET ism=$1, familiya=$2, telefon=$3, login=$4, faol=$5, filial_id=$6, parol_hash=COALESCE($7, parol_hash)
        WHERE id=$8`,
      [ism, str(req.body.familiya), str(req.body.telefon, 30), c.login, req.body.faol !== false, c.filial, hash, id]);
    res.json({ ok: true, admin: (await pool.query(`${SEL} WHERE a.id=$1`, [id])).rows[0] });
  } catch (e) {
    if (e.code === '23505') return bad(res, 'Bu login band', 409);
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM kurs_adminlar WHERE id=$1', [int(req.params.id) || 0]);
  if (!r.rowCount) return bad(res, 'Topilmadi', 404);
  res.json({ ok: true });
}));

module.exports = router;
