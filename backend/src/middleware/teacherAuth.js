// O'qituvchi paneli API'lari uchun: FAQAT faol o'qituvchi.
// O'qituvchi nofaol qilinsa yoki o'chirilsa, eski token ham darhol o'tmaydi.
const pool = require('../db');
const { requireAuth } = require('./jwt');

const base = requireAuth(['oqituvchi']);
module.exports = function teacherAuth(req, res, next) {
  base(req, res, async () => {
    try {
      const r = await pool.query('SELECT faol FROM oqituvchilar WHERE id=$1', [req.user.entityId]);
      if (!r.rowCount || !r.rows[0].faol) return res.status(403).json({ ok: false, error: 'Hisobingiz faol emas', expired: true });
      next();
    } catch (e) { res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
  });
};
