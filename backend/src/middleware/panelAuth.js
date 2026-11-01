// Panel API'lari uchun: superadmin yoki FAOL admin.
// Admin o'chirilgan/nofaol qilingan bo'lsa, eski token ham darhol o'tmaydi.
const pool = require('../db');
const { requireAuth } = require('./jwt');

const base = requireAuth(['superadmin', 'kurs_admin']);
module.exports = function panelAuth(req, res, next) {
  base(req, res, async () => {
    if (req.user.role === 'superadmin') return next();
    try {
      const r = await pool.query('SELECT faol FROM kurs_adminlar WHERE id=$1', [req.user.entityId]);
      if (!r.rowCount || !r.rows[0].faol) return res.status(403).json({ ok: false, error: "Hisobingiz faol emas", expired: true });
      next();
    } catch (e) { res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
  });
};
