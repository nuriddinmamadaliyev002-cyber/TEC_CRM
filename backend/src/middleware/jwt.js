require('dotenv').config();
const jwt = require('jsonwebtoken');

const SECRET  = process.env.JWT_SECRET;
const EXPIRES = process.env.JWT_EXPIRES || '8h';

if (!SECRET || SECRET.length < 32) {
  console.error("❌ JWT_SECRET .env da yo'q yoki 32 belgidan qisqa — server ishga tushmaydi");
  process.exit(1);
}

const generateToken = payload => jwt.sign(payload, SECRET, { expiresIn: EXPIRES, algorithm: 'HS256' });

// roles: ['superadmin'] | ['kurs_admin'] | ikkalasi
function requireAuth(roles = ['superadmin', 'kurs_admin']) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: 'Token kerak', expired: true });
    let p;
    try { p = jwt.verify(token, SECRET, { algorithms: ['HS256'] }); }
    catch (e) {
      return res.status(401).json({ ok: false, error: e.name === 'TokenExpiredError' ? 'Token muddati tugagan' : 'Token yaroqsiz', expired: true });
    }
    if (!roles.includes(p.role)) return res.status(403).json({ ok: false, error: "Ruxsat yo'q" });
    req.user = p;
    next();
  };
}
module.exports = { generateToken, requireAuth };
