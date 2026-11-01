// ─── Auth ───────────────────────────────────────────────────────────────────
//  POST /api/auth/login  — login + parol. Ikki xil foydalanuvchi:
//     • superadmin (bitta, .env da)  → role 'superadmin'
//     • admin (superadmin yaratadi, kurs_adminlar jadvalida) → role 'kurs_admin'
//  GET  /api/auth/me     — joriy foydalanuvchi
const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { generateToken, requireAuth } = require('../middleware/jwt');

const router = Router();

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ─── Oddiy xotiradagi cheklov (brute-force) ──────────────────────────────────
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, 60000).unref();
  return (req, res, next) => {
    const k = req.ip, n = Date.now();
    const h = hits.get(k) && hits.get(k).reset > n ? hits.get(k) : { c: 0, reset: n + windowMs };
    h.c++; hits.set(k, h);
    if (h.c > max) return res.status(429).json({ ok: false, error: "Juda ko'p urinish. Birozdan so'ng qayta urining" });
    next();
  };
}

// Mavjud bo'lmagan foydalanuvchi uchun ham hash solishtiramiz (javob vaqti bo'yicha login topilib qolmasin)
const DUMMY_HASH = '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
const FAIL = { ok: false, error: "Login yoki parol noto'g'ri" };

// Bir IP dan 15 daqiqada ruxsat etilgan urinishlar (LOGIN_MAX_ATTEMPTS bilan o'zgartiriladi; e2e test uchun)
const LOGIN_MAX = Math.max(1, parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 10);
router.post('/login', limiter(LOGIN_MAX, 15 * 60 * 1000), async (req, res) => {
  try {
    const username = String((req.body || {}).username || '').trim().slice(0, 100);
    const parol = String((req.body || {}).parol || '').slice(0, 200);
    const U = process.env.SUPERADMIN_USERNAME, H = process.env.SUPERADMIN_PASSWORD_HASH;

    // 1) Superadmin
    if (U && H && eq(username, U)) {
      const ok = await bcrypt.compare(parol, H.startsWith('$2') ? H : DUMMY_HASH);
      if (!ok) return res.status(401).json(FAIL);
      const ism = process.env.SUPERADMIN_NAME || 'Superadmin';
      return res.json({ ok: true, token: generateToken({ role: 'superadmin', ism }), role: 'superadmin', ism });
    }

    // 2) Admin (kurs_adminlar jadvali)
    const r = username
      ? await pool.query('SELECT id, ism, familiya, parol_hash, faol FROM kurs_adminlar WHERE LOWER(login)=LOWER($1)', [username])
      : { rowCount: 0, rows: [] };
    const a = r.rows[0];
    const ok = await bcrypt.compare(parol, a && a.parol_hash ? a.parol_hash : DUMMY_HASH);
    if (!a || !a.parol_hash || !ok || !a.faol) return res.status(401).json(FAIL);

    const ism = `${a.familiya} ${a.ism}`.trim(); // FI: Familiya Ism
    await pool.query('UPDATE kurs_adminlar SET oxirgi_kirish=NOW() WHERE id=$1', [a.id]);
    res.json({ ok: true, role: 'kurs_admin', ism, token: generateToken({ role: 'kurs_admin', entityId: a.id, ism }) });
  } catch (e) { console.error('login:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

router.get('/me', requireAuth(['superadmin', 'kurs_admin']), (req, res) => {
  res.json({ ok: true, role: req.user.role, ism: req.user.ism });
});

module.exports = router;
