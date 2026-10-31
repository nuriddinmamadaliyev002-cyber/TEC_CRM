// ─── O'quvchi paneli API (faqat o'quvchining O'Z ma'lumotlari; hammasi token ichidagi id bo'yicha) ─
//  GET /stats · GET /guruhlar · GET /tolovlar · GET /davomat?guruh_id=
//  Boshqa o'quvchilar, o'qituvchi telefoni va kassir (kiritgan) ma'lumotlari ko'rsatilmaydi.
const { Router } = require('express');
const pool = require('../db');
const studentAuth = require('../middleware/studentAuth');
const { int, bad, wrap } = require('../util');

const router = Router();
router.use(studentAuth);

const pct = (keldi, jami) => (jami ? Math.round((keldi * 100) / jami) : null);

// O'quvchining guruhlari + shu guruh bo'yicha to'langan summa + davomat hisobi
async function myGroups(oid) {
  const r = await pool.query(`
    SELECT g.id, g.nomi, g.jadval, g.boshlanish, g.holat,
           f.nomi AS fan_nomi,
           TRIM(CONCAT(q.familiya, ' ', q.ism)) AS oqituvchi,
           COALESCE((SELECT SUM(t.summa) FROM tolovlar t WHERE t.oquvchi_id=$1 AND t.guruh_id=g.id), 0)::float AS tolangan,
           (SELECT COUNT(*) FROM davomat d WHERE d.oquvchi_id=$1 AND d.guruh_id=g.id AND d.holat='keldi')::int   AS keldi,
           (SELECT COUNT(*) FROM davomat d WHERE d.oquvchi_id=$1 AND d.guruh_id=g.id AND d.holat='kelmadi')::int AS kelmadi,
           (SELECT COUNT(*) FROM davomat d WHERE d.oquvchi_id=$1 AND d.guruh_id=g.id AND d.holat='sababli')::int AS sababli
      FROM guruh_oquvchilari x
      JOIN guruhlar g ON g.id=x.guruh_id
      JOIN fanlar   f ON f.id=g.fan_id
      LEFT JOIN oqituvchilar q ON q.id=g.oqituvchi_id
     WHERE x.oquvchi_id=$2
     ORDER BY (g.holat='yopilgan'), g.id DESC`, [oid, oid]);
  return r.rows.map(g => ({
    ...g,
    davomat_foiz: pct(g.keldi, g.keldi + g.kelmadi + g.sababli),
  }));
}

router.get('/stats', wrap(async (req, res) => {
  const oid = req.user.entityId;
  const gs = await myGroups(oid);
  const keldi = gs.reduce((a, g) => a + g.keldi, 0);
  const jami = gs.reduce((a, g) => a + g.keldi + g.kelmadi + g.sababli, 0);
  const t = await pool.query('SELECT COALESCE(SUM(summa),0)::float AS s FROM tolovlar WHERE oquvchi_id=$1', [oid]);
  const p = await pool.query('SELECT ism, familiya FROM oquvchilar WHERE id=$1', [oid]);
  res.json({ ok: true, ism: `${p.rows[0].familiya} ${p.rows[0].ism}`.trim(), stats: {
    guruhlar: gs.filter(g => g.holat !== 'yopilgan').length,
    davomat_foiz: pct(keldi, jami),
    tolangan: t.rows[0].s,
  } });
}));

router.get('/guruhlar', wrap(async (req, res) => {
  res.json({ ok: true, guruhlar: await myGroups(req.user.entityId) });
}));

router.get('/tolovlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT t.id, t.summa::float AS summa, t.sana, t.usul, t.izoh, g.nomi AS guruh_nomi
      FROM tolovlar t LEFT JOIN guruhlar g ON g.id=t.guruh_id
     WHERE t.oquvchi_id=$1
     ORDER BY t.sana DESC, t.id DESC LIMIT 500`, [req.user.entityId]);
  res.json({ ok: true, items: r.rows, jami: r.rows.reduce((a, x) => a + x.summa, 0) });
}));

// Faqat o'zi a'zo bo'lgan guruh bo'yicha o'z davomati (a'zo bo'lmagan guruh → 404)
router.get('/davomat', wrap(async (req, res) => {
  const gid = int(req.query.guruh_id);
  if (!gid) return bad(res, "Guruhni tanlang");
  const oid = req.user.entityId;
  const m = await pool.query('SELECT 1 FROM guruh_oquvchilari WHERE guruh_id=$1 AND oquvchi_id=$2', [gid, oid]);
  if (!m.rowCount) return bad(res, 'Guruh topilmadi', 404);
  const r = await pool.query(
    `SELECT sana, holat FROM davomat WHERE guruh_id=$1 AND oquvchi_id=$2 ORDER BY sana DESC LIMIT 400`, [gid, oid]);
  const c = h => r.rows.filter(x => x.holat === h).length;
  const s = { keldi: c('keldi'), kelmadi: c('kelmadi'), sababli: c('sababli') };
  res.json({ ok: true, items: r.rows, hisob: { ...s, jami: r.rowCount, foiz: pct(s.keldi, r.rowCount) } });
}));

module.exports = router;
