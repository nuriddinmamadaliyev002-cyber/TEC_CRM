// Panel API'lari uchun: superadmin yoki FAOL admin. Har so'rovda FILIAL konteksti aniqlanadi: req.filialId.
//  • Admin — faqat o'z filiali (bazadan olinadi, so'rovdagi hech narsaga ishonilmaydi). Admin yoki uning filiali
//    nofaol/o'chirilgan bo'lsa, eski token ham darhol o'tmaydi.
//  • Superadmin — qaysi filial bilan ishlayotganini `X-Filial-Id` sarlavhasida yuboradi (mavjud filial bo'lishi shart).
const pool = require('../db');
const { requireAuth } = require('./jwt');
const { int } = require('../util');

const base = requireAuth(['superadmin', 'kurs_admin']);
module.exports = function panelAuth(req, res, next) {
  base(req, res, async () => {
    try {
      if (req.user.role === 'superadmin') {
        const fid = int(req.headers['x-filial-id']);
        if (!fid) return res.status(400).json({ ok: false, error: 'Filialni tanlang' });
        const f = await pool.query('SELECT id, nomi FROM filiallar WHERE id=$1', [fid]);
        if (!f.rowCount) return res.status(404).json({ ok: false, error: 'Filial topilmadi' });
        req.filialId = f.rows[0].id; req.filialNomi = f.rows[0].nomi;
        return next();
      }
      const r = await pool.query(
        `SELECT a.faol, a.filial_id, f.faol AS filial_faol, f.nomi AS filial_nomi
           FROM kurs_adminlar a JOIN filiallar f ON f.id=a.filial_id WHERE a.id=$1`, [req.user.entityId]);
      if (!r.rowCount || !r.rows[0].faol) return res.status(403).json({ ok: false, error: 'Hisobingiz faol emas', expired: true });
      if (!r.rows[0].filial_faol) return res.status(403).json({ ok: false, error: 'Filial faol emas', expired: true });
      req.filialId = r.rows[0].filial_id; req.filialNomi = r.rows[0].filial_nomi;
      next();
    } catch (e) { console.error('panelAuth:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
  });
};
