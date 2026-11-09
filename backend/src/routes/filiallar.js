// Superadmin: filiallarni boshqarish. Har filialning ma'lumotlari alohida; filialga admin tayinlanadi (kursAdminlar.js).
const { Router } = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/jwt');
const { str, int, bad, wrap } = require('../util');
const audit = require('../audit');

const router = Router();
router.use(requireAuth(['superadmin']));

router.get('/', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT f.id, f.nomi, f.faol, f.yaratilgan,
      (SELECT COUNT(*)::int FROM kurs_adminlar a WHERE a.filial_id=f.id AND a.faol)              AS adminlar,
      (SELECT COUNT(*)::int FROM guruhlar g WHERE g.filial_id=f.id AND g.holat<>'yopilgan')      AS guruhlar,
      (SELECT COUNT(*)::int FROM oquvchilar o WHERE o.filial_id=f.id AND o.faol)                 AS oquvchilar,
      (SELECT COUNT(*)::int FROM oqituvchilar q WHERE q.filial_id=f.id AND q.faol)               AS oqituvchilar,
      (SELECT COALESCE(SUM(t.summa),0)::float FROM tolovlar t JOIN oquvchilar o ON o.id=t.oquvchi_id
        WHERE o.filial_id=f.id AND date_trunc('month',t.sana)=date_trunc('month',(NOW() AT TIME ZONE 'Asia/Tashkent')::date))  AS oy_tushum,
      (SELECT COUNT(*)::int FROM lidlar l WHERE l.filial_id=f.id AND l.holat='yangi')            AS yangi_lidlar,
      (SELECT COUNT(*)::int FROM nomzodlar n WHERE n.filial_id=f.id AND n.holat='yangi')         AS yangi_nomzodlar
      FROM filiallar f ORDER BY f.id`);
  res.json({ ok: true, items: r.rows });
}));

function body(b) {
  const nomi = str(b.nomi, 100);
  if (!nomi) return { err: 'Filial nomi majburiy' };
  return { v: [nomi, b.faol !== false] };
}
router.post('/', wrap(async (req, res) => {
  const { err, v } = body(req.body); if (err) return bad(res, err);
  try {
    const r = await pool.query('INSERT INTO filiallar(nomi,faol) VALUES($1,$2) RETURNING id', v);
    await audit.log(req, { amal: 'yaratdi', obyekt: 'filial', id: r.rows[0].id, filial_id: r.rows[0].id, tavsif: `Filial yaratildi: ${v[0]}` });
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { if (e.code === '23505') return bad(res, 'Bu nomli filial bor', 409); throw e; }
}));
router.put('/:id', wrap(async (req, res) => {
  const { err, v } = body(req.body); if (err) return bad(res, err);
  try {
    const id = int(req.params.id) || 0, old = (await pool.query('SELECT nomi, faol FROM filiallar WHERE id=$1', [id])).rows[0];
    const r = await pool.query('UPDATE filiallar SET nomi=$1, faol=$2 WHERE id=$3', [...v, id]);
    if (!r.rowCount) return bad(res, 'Topilmadi', 404);
    const d = audit.diff(old, { nomi: v[0], faol: v[1] }, ['nomi', 'faol']);
    if (d) await audit.log(req, { amal: 'ozgartirdi', obyekt: 'filial', id, filial_id: id, tavsif: `Filial o'zgartirildi: ${v[0]}`, ...d });
    res.json({ ok: true });
  } catch (e) { if (e.code === '23505') return bad(res, 'Bu nomli filial bor', 409); throw e; }
}));
// Faqat butunlay bo'sh filialni (admin ham, ma'lumot ham yo'q) o'chirish mumkin; aks holda nofaol qilinadi.
router.delete('/:id', wrap(async (req, res) => {
  try {
    const id = int(req.params.id) || 0, old = (await pool.query('SELECT nomi, faol FROM filiallar WHERE id=$1', [id])).rows[0];
    const r = await pool.query('DELETE FROM filiallar WHERE id=$1', [id]);
    if (!r.rowCount) return bad(res, 'Topilmadi', 404);
    await audit.log(req, { amal: 'ochirdi', obyekt: 'filial', id, filial_id: id, filial_nomi: old && old.nomi, tavsif: `Filial o'chirildi: ${old && old.nomi}`, eski: old });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23503') return bad(res, "Filialda adminlar yoki ma'lumotlar bor. O'chirish o'rniga uni nofaol qiling", 409);
    throw e;
  }
}));

module.exports = router;
