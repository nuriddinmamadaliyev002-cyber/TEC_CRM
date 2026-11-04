// ─── Admin paneli API (superadmin ham foydalana oladi) ─────────────────
//  /fanlar  /oqituvchilar  /oquvchilar (+yuz)  /guruhlar (+davomat, +yuzlar)  /tolovlar  /lidlar  /vakansiyalar  /nomzodlar  /stats
const { Router } = require('express');
const pool = require('../db');
const panelAuth = require('../middleware/panelAuth');
const { str, int, num, phone, date, bad, wrap, todayISO } = require('../util');

const router = Router();
router.use(panelAuth);

// 2026-02-31 kabi mavjud bo'lmagan sanalarni rad etadi
function realDate(v) {
  const s = date(v); if (!s) return null;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s ? s : null;
}
// Filial bo'yicha egalik tekshiruvlari (req.filialId panelAuth'dan keladi). Boshqa filial obyekti → «topilmadi».
const inFilial = async (table, id, filial) =>
  !!id && !!filial && (await pool.query(`SELECT 1 FROM ${table} WHERE id=$1 AND filial_id=$2`, [id, filial])).rowCount > 0; // table — faqat quyidagi qat'iy nomlar
const GURUH_YOPIQ = "Guruh yopilgan. Avval uni «Tahrirlash» orqali qayta oching";

// ═══ FANLAR (o'quv markazda o'tiladigan fanlar nomenklaturasi) ═══════════════
router.get('/fanlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT f.*,
           (SELECT COUNT(*)::int FROM guruhlar g WHERE g.fan_id=f.id)      AS guruhlar_soni,
           (SELECT COUNT(*)::int FROM oqituvchilar o WHERE o.fan_id=f.id)  AS oqituvchilar_soni
      FROM fanlar f WHERE f.filial_id=$1 ORDER BY f.id DESC`, [req.filialId]);
  res.json({ ok: true, fanlar: r.rows });
}));
function fanBody(b) {
  const nomi = str(b.nomi, 200);
  if (!nomi) return { err: 'Fan nomi majburiy' };
  return { v: [nomi, str(b.tavsif, 2000), b.faol !== false] };
}
router.post('/fanlar', wrap(async (req, res) => {
  const { err, v } = fanBody(req.body); if (err) return bad(res, err);
  const r = await pool.query('INSERT INTO fanlar(nomi,tavsif,faol,filial_id) VALUES($1,$2,$3,$4) RETURNING id', [...v, req.filialId]);
  res.json({ ok: true, id: r.rows[0].id });
}));
router.put('/fanlar/:id', wrap(async (req, res) => {
  const { err, v } = fanBody(req.body); if (err) return bad(res, err);
  const r = await pool.query('UPDATE fanlar SET nomi=$1,tavsif=$2,faol=$3 WHERE id=$4 AND filial_id=$5', [...v, int(req.params.id) || 0, req.filialId]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
router.delete('/fanlar/:id', wrap(async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM fanlar WHERE id=$1 AND filial_id=$2', [int(req.params.id) || 0, req.filialId]);
    r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
  } catch (e) {
    if (e.code === '23503') return bad(res, "Bu fanga guruhlar yoki o'qituvchilar biriktirilgan. Avval ularni o'zgartiring yoki fanni nofaol qiling", 409);
    throw e;
  }
}));

// ═══ O'QITUVCHILAR ══════════════════════════════════════════════════════════
// Har o'qituvchida haq turi belgilanadi: soatbay | oylik | foiz (oyliklar hisoboti shundan hisoblaydi).
const HAQ_TURLARI = ['soatbay', 'oylik', 'foiz'];
const MAX_SUMMA = 999999999999;
function oqituvchiBody(b) {
  const ism = str(b.ism, 100); if (!ism) return { err: 'Ism majburiy' };
  const fan = int(b.fan_id); if (!fan) return { err: 'Fanni tanlang' }; // fansiz o'qituvchini guruhga biriktirib bo'lmaydi
  const turi = HAQ_TURLARI.includes(b.haq_turi) ? b.haq_turi : null;
  if (!turi) return { err: "To'lov turini tanlang (soatbay, oylik yoki foiz)" };
  let stavka = null, oylik = null, foiz = null; // faqat tanlangan turga tegishli qiymat saqlanadi
  if (turi === 'soatbay') {
    stavka = num(b.soat_stavka);
    if (stavka == null || stavka <= 0 || stavka > MAX_SUMMA) return { err: "Bir soat uchun haqni to'g'ri kiriting" };
  } else if (turi === 'oylik') {
    oylik = num(b.oylik_maosh);
    if (oylik == null || oylik <= 0 || oylik > MAX_SUMMA) return { err: "Oylik maoshni to'g'ri kiriting" };
  } else {
    foiz = num(b.foiz);
    if (foiz == null || foiz <= 0 || foiz > 100) return { err: "Foiz 0 dan katta va 100 dan oshmaydigan bo'lsin" };
  }
  // v: 0 ism, 1 familiya, 2 telefon, 3 faol, 4 fan, 5 haq turi, 6 soat stavkasi, 7 oylik, 8 foiz
  return { v: [ism, str(b.familiya, 100), str(b.telefon, 30), b.faol !== false, fan, turi, stavka, oylik, foiz] };
}
const oqituvchilar = Router();
oqituvchilar.get('/', wrap(async (req, res) => {
  const q = await pool.query(
    `SELECT t.id, t.ism, t.familiya, t.telefon, t.faol, t.fan_id, t.haq_turi, t.soat_stavka::float AS soat_stavka,
            t.oylik_maosh::float AS oylik_maosh, t.foiz::float AS foiz, f.nomi AS fan_nomi
       FROM oqituvchilar t LEFT JOIN fanlar f ON f.id=t.fan_id WHERE t.filial_id=$1 ORDER BY t.id DESC`, [req.filialId]);
  res.json({ ok: true, items: q.rows });
}));
oqituvchilar.post('/', wrap(async (req, res) => {
  const { err, v } = oqituvchiBody(req.body); if (err) return bad(res, err);
  if (!(await inFilial('fanlar', v[4], req.filialId))) return bad(res, 'Fan topilmadi');
  try {
    const q = await pool.query(
      `INSERT INTO oqituvchilar(ism,familiya,telefon,faol,fan_id,haq_turi,soat_stavka,oylik_maosh,foiz,filial_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [...v, req.filialId]);
    res.json({ ok: true, id: q.rows[0].id });
  } catch (e) { if (e.code === '23503') return bad(res, 'Fan topilmadi'); throw e; }
}));
oqituvchilar.put('/:id', wrap(async (req, res) => {
  const { err, v } = oqituvchiBody(req.body); if (err) return bad(res, err);
  const id = int(req.params.id) || 0;
  if (!(await inFilial('fanlar', v[4], req.filialId))) return bad(res, 'Fan topilmadi');
  // Fan o'zgarsa, o'qituvchi boshqa fan guruhlarida qolib ketmasin
  if ((await pool.query('SELECT 1 FROM guruhlar WHERE oqituvchi_id=$1 AND fan_id<>$2 LIMIT 1', [id, v[4]])).rowCount)
    return bad(res, "Bu o'qituvchi boshqa fan guruhlarida dars beradi. Avval o'sha guruhlarni o'zgartiring", 409);
  try {
    const q = await pool.query(
      `UPDATE oqituvchilar SET ism=$1,familiya=$2,telefon=$3,faol=$4,fan_id=$5,haq_turi=$6,soat_stavka=$7,oylik_maosh=$8,foiz=$9 WHERE id=$10 AND filial_id=$11`,
      [...v, id, req.filialId]);
    q.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
  } catch (e) { if (e.code === '23503') return bad(res, 'Fan topilmadi'); throw e; }
}));
oqituvchilar.delete('/:id', wrap(async (req, res) => {
  const q = await pool.query('DELETE FROM oqituvchilar WHERE id=$1 AND filial_id=$2', [int(req.params.id) || 0, req.filialId]);
  q.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
router.use('/oqituvchilar', oqituvchilar);

// ═══ O'QUVCHILAR: faol / nofaol ══════════════════════════════════════════════
// Ro'yxat har bir o'quvchi uchun guruh(lar)i, o'qituvchisi va guruhga qo'shilgan (o'qishni boshlagan) sanasini ham qaytaradi.
// Faol ↔ nofaol alohida amallar bilan o'zgaradi: nofaol qilishda sabab MAJBURIY. Nofaol o'quvchi guruh a'zoligi va tarixini saqlaydi.
const oquvchilar = Router();
const oquvchiBody = b => {
  const ism = str(b.ism, 100); if (!ism) return { err: 'Ism majburiy' };
  return { v: [ism, str(b.familiya, 100), str(b.telefon, 30), str(b.manzil, 300)] };
};
oquvchilar.get('/', wrap(async (req, res) => {
  const q = await pool.query(`
    SELECT o.id, o.ism, o.familiya, o.telefon, o.manzil, o.faol, o.yaratilgan,
           to_char(o.nofaol_sana, 'YYYY-MM-DD') AS nofaol_sana, o.nofaol_sabab,
           (SELECT COUNT(*)::int FROM oquvchi_yuz y WHERE y.oquvchi_id = o.id) AS yuz_soni,
           COALESCE((SELECT json_agg(json_build_object(
                       'guruh_id', g.id, 'guruh_nomi', g.nomi, 'fan_nomi', f.nomi,
                       'oqituvchi_id', g.oqituvchi_id, 'oqituvchi_nomi', NULLIF(TRIM(CONCAT(t.familiya, ' ', t.ism)), ''),
                       'boshlagan', to_char(x.qoshilgan AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD')) ORDER BY x.qoshilgan)
                      FROM guruh_oquvchilari x
                      JOIN guruhlar g ON g.id = x.guruh_id
                      JOIN fanlar f ON f.id = g.fan_id
                      LEFT JOIN oqituvchilar t ON t.id = g.oqituvchi_id
                     WHERE x.oquvchi_id = o.id), '[]'::json) AS guruhlar
      FROM oquvchilar o WHERE o.filial_id = $1 ORDER BY o.id DESC`, [req.filialId]);
  res.json({ ok: true, items: q.rows });
}));
oquvchilar.post('/', wrap(async (req, res) => { // yangi o'quvchi doim FAOL
  const { err, v } = oquvchiBody(req.body || {}); if (err) return bad(res, err);
  const q = await pool.query('INSERT INTO oquvchilar(ism,familiya,telefon,manzil,filial_id) VALUES($1,$2,$3,$4,$5) RETURNING id', [...v, req.filialId]);
  res.json({ ok: true, id: q.rows[0].id });
}));
oquvchilar.put('/:id', wrap(async (req, res) => { // holat (faol/nofaol) bu yerda o'zgarmaydi
  const { err, v } = oquvchiBody(req.body || {}); if (err) return bad(res, err);
  const q = await pool.query('UPDATE oquvchilar SET ism=$1,familiya=$2,telefon=$3,manzil=$4 WHERE id=$5 AND filial_id=$6', [...v, int(req.params.id) || 0, req.filialId]);
  q.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
oquvchilar.delete('/:id', wrap(async (req, res) => {
  const q = await pool.query('DELETE FROM oquvchilar WHERE id=$1 AND filial_id=$2', [int(req.params.id) || 0, req.filialId]);
  q.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
// Holatni o'zgartirishdan keyin: 0 qator → yo'q (404) yoki allaqachon shu holatda (409)
const holatNatija = async (q, id, filial, res, text) => {
  if (q.rowCount) return res.json({ ok: true });
  const e = await pool.query('SELECT 1 FROM oquvchilar WHERE id=$1 AND filial_id=$2', [id, filial]);
  return e.rowCount ? bad(res, text, 409) : bad(res, 'Topilmadi', 404);
};
oquvchilar.post('/:id/nofaol', wrap(async (req, res) => {
  const id = int(req.params.id) || 0, sabab = str((req.body || {}).sabab, 500);
  if (sabab.length < 3) return bad(res, "O'qishni to'xtatish sababini yozing (kamida 3 belgi)");
  const q = await pool.query('UPDATE oquvchilar SET faol=FALSE, nofaol_sana=$3::date, nofaol_sabab=$4 WHERE id=$1 AND filial_id=$2 AND faol',
    [id, req.filialId, todayISO(), sabab]);
  await holatNatija(q, id, req.filialId, res, "O'quvchi allaqachon nofaol");
}));
oquvchilar.post('/:id/faol', wrap(async (req, res) => {
  const id = int(req.params.id) || 0;
  const q = await pool.query("UPDATE oquvchilar SET faol=TRUE, nofaol_sana=NULL, nofaol_sabab='' WHERE id=$1 AND filial_id=$2 AND NOT faol", [id, req.filialId]);
  await holatNatija(q, id, req.filialId, res, "O'quvchi allaqachon faol");
}));

// ═══ YUZ VEKTORLARI (yuzni tanib davomat olish uchun) ═══════════════════════
// Faqat 128 o'lchamli vektor saqlanadi (rasm emas). Vektorni brauzer hisoblaydi; tanish ham brauzerda. Biometrik ma'lumot — rozilik majburiy.
const YUZ_MAX = 10; // bitta o'quvchi uchun saqlanadigan namunalar soni (eskilari o'chadi)
const yuzVektor = v => Array.isArray(v) && v.length === 128 && v.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10);
oquvchilar.post('/:id/yuz', wrap(async (req, res) => {
  const id = int(req.params.id) || 0, b = req.body || {};
  const vs = Array.isArray(b.vektorlar) ? b.vektorlar : [];
  if (!vs.length || vs.length > 5 || !vs.every(yuzVektor)) return bad(res, "Yuz ma'lumoti noto'g'ri");
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const o = await c.query('SELECT yuz_rozilik FROM oquvchilar WHERE id=$1 AND filial_id=$2 FOR UPDATE', [id, req.filialId]);
    if (!o.rowCount) { await c.query('ROLLBACK'); return bad(res, 'Topilmadi', 404); }
    if (b.rozilik !== true && !o.rows[0].yuz_rozilik) { await c.query('ROLLBACK'); return bad(res, "Yuzni kiritish uchun o'quvchi (yoki ota-onasi) roziligi kerak"); }
    if (b.rozilik === true && !o.rows[0].yuz_rozilik) await c.query('UPDATE oquvchilar SET yuz_rozilik=NOW() WHERE id=$1', [id]);
    if (b.almashtir === true) await c.query('DELETE FROM oquvchi_yuz WHERE oquvchi_id=$1', [id]);
    for (const v of vs) await c.query('INSERT INTO oquvchi_yuz(oquvchi_id, vektor) VALUES($1,$2)', [id, v]);
    await c.query('DELETE FROM oquvchi_yuz WHERE oquvchi_id=$1 AND id NOT IN (SELECT id FROM oquvchi_yuz WHERE oquvchi_id=$1 ORDER BY id DESC LIMIT $2)', [id, YUZ_MAX]);
    const n = await c.query('SELECT COUNT(*)::int AS n FROM oquvchi_yuz WHERE oquvchi_id=$1', [id]);
    await c.query('COMMIT');
    res.json({ ok: true, yuz_soni: n.rows[0].n });
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}));
oquvchilar.delete('/:id/yuz', wrap(async (req, res) => { // yuz ma'lumotlarini butunlay o'chirish (rozilik ham bekor bo'ladi)
  const id = int(req.params.id) || 0;
  if (!(await inFilial('oquvchilar', id, req.filialId))) return bad(res, 'Topilmadi', 404);
  await pool.query('DELETE FROM oquvchi_yuz WHERE oquvchi_id=$1', [id]);
  await pool.query('UPDATE oquvchilar SET yuz_rozilik=NULL WHERE id=$1', [id]);
  res.json({ ok: true });
}));
router.use('/oquvchilar', oquvchilar);

// ═══ GURUHLAR ════════════════════════════════════════════════════════════════
router.get('/guruhlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT g.*, to_char(g.boshlanish, 'YYYY-MM-DD') AS boshlanish, to_char(g.yopilgan_sana, 'YYYY-MM-DD') AS yopilgan_sana,
           g.oylik_narx::float AS oylik_narx,
           f.nomi AS fan_nomi, TRIM(o.familiya||' '||o.ism) AS oqituvchi_nomi,
           (SELECT COUNT(*)::int FROM guruh_oquvchilari x WHERE x.guruh_id=g.id) AS oquvchilar_soni
      FROM guruhlar g
      JOIN fanlar f ON f.id=g.fan_id
      LEFT JOIN oqituvchilar o ON o.id=g.oqituvchi_id
     WHERE g.filial_id=$1
     ORDER BY g.id DESC`, [req.filialId]);
  res.json({ ok: true, guruhlar: r.rows });
}));

// Dars jadvali: kunlar (1=Du … 7=Yak) + boshlanish vaqti (HH:MM). `jadval` matni ulardan hosil bo'ladi (masalan: Du-Chor-Ju 19:00).
const KUN = ['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha', 'Yak'];
const SOAT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function guruhBody(b) {
  const nomi = str(b.nomi, 200), fan = int(b.fan_id), max = int(b.max_oquvchi) || 20;
  if (!nomi) return { err: 'Guruh nomi majburiy' };
  if (!fan) return { err: 'Fanni tanlang' };
  let holat = ['ochiq', 'boshlangan', 'yopilgan'].includes(b.holat) ? b.holat : 'ochiq';
  if (b.boshlanish && !date(b.boshlanish)) return { err: "Boshlanish sanasi noto'g'ri" };
  // Boshlanish sanasi kelgan «Ochiq» guruh darhol «Boshlangan» bo'ladi (fon vazifasi ham shuni qiladi — holat o'zgarib ketmasin)
  if (holat === 'ochiq' && date(b.boshlanish) && date(b.boshlanish) <= todayISO()) holat = 'boshlangan';
  // Davomiylik majburiy (soatbay oyliklar shundan hisoblanadi); eski yopilgan guruhlarni tahrirlash uchun faqat ular istisno
  let dav = null;
  if (b.davomiylik !== '' && b.davomiylik != null) {
    dav = int(b.davomiylik);
    if (!dav || dav < 15 || dav > 480) return { err: "Dars davomiyligi 15–480 daqiqa bo'lsin" };
  } else if (holat !== 'yopilgan') return { err: 'Dars davomiyligini daqiqalarda kiriting (masalan 90)' };
  const kunlar = [...new Set((Array.isArray(b.kunlar) ? b.kunlar : []).map(Number))].sort((x, y) => x - y);
  if (kunlar.some(k => !Number.isInteger(k) || k < 1 || k > 7)) return { err: "Dars kunlari noto'g'ri" };
  const soat = str(b.soat, 5);
  if (soat && !SOAT_RE.test(soat)) return { err: "Dars vaqti noto'g'ri" };
  const narx = num(b.oylik_narx);
  if (narx == null || narx < 0 || narx > 999999999999) return { err: "Oylik to'lov narxini to'g'ri kiriting" };
  if (kunlar.length && !soat) return { err: 'Dars vaqtini tanlang' };
  if (soat && !kunlar.length) return { err: 'Dars kunlarini tanlang' };
  const jadval = kunlar.length ? kunlar.map(k => KUN[k - 1]).join('-') + ' ' + soat : '';
  // v: 0 nomi, 1 fan, 2 o'qituvchi, 3 jadval, 4 kunlar, 5 soat, 6 boshlanish, 7 max, 8 holat, 9 narx, 10 davomiylik, 11 botda boshlangan guruhga yozilish
  return { v: [nomi, fan, int(b.oqituvchi_id), jadval, kunlar, soat || null, date(b.boshlanish), max, holat, narx, dav, b.boshlangan_qabul !== false] };
}
// O'qituvchi faqat o'z fani bo'yicha guruhga biriktiriladi
async function oqituvchiXato(fan, tid, filial) {
  if (!(await inFilial('fanlar', fan, filial))) return 'Fan topilmadi';
  if (!tid) return null;
  const r = await pool.query('SELECT fan_id FROM oqituvchilar WHERE id=$1 AND filial_id=$2', [tid, filial]);
  if (!r.rowCount) return "O'qituvchi topilmadi";
  return r.rows[0].fan_id === fan ? null : "Bu o'qituvchi tanlangan fan bo'yicha dars bermaydi";
}
const fkErr = (e, res) => e.code === '23503' ? bad(res, "Fan yoki o'qituvchi topilmadi") : null;
router.post('/guruhlar', wrap(async (req, res) => {
  const { err, v } = guruhBody(req.body); if (err) return bad(res, err);
  const oe = await oqituvchiXato(v[1], v[2], req.filialId); if (oe) return bad(res, oe);
  try {
    const r = await pool.query(`INSERT INTO guruhlar(nomi,fan_id,oqituvchi_id,jadval,kunlar,soat,boshlanish,max_oquvchi,holat,oylik_narx,davomiylik,boshlangan_qabul,filial_id,yopilgan_sana)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, CASE WHEN $9='yopilgan' THEN $14::date END) RETURNING id`, [...v, req.filialId, todayISO()]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { if (!fkErr(e, res)) throw e; }
}));
router.put('/guruhlar/:id', wrap(async (req, res) => {
  const { err, v } = guruhBody(req.body); if (err) return bad(res, err);
  const oe = await oqituvchiXato(v[1], v[2], req.filialId); if (oe) return bad(res, oe);
  try {
    // Yopilgan sana: yopilganda bir marta qo'yiladi (qayta saqlansa o'zgarmaydi), qayta ochilsa tozalanadi
    const r = await pool.query(`UPDATE guruhlar SET nomi=$1,fan_id=$2,oqituvchi_id=$3,jadval=$4,kunlar=$5,soat=$6,boshlanish=$7,max_oquvchi=$8,holat=$9,oylik_narx=$10,
        davomiylik=$11,boshlangan_qabul=$12, yopilgan_sana = CASE WHEN $9='yopilgan' THEN COALESCE(yopilgan_sana, $15::date) END
      WHERE id=$13 AND filial_id=$14`, [...v, int(req.params.id) || 0, req.filialId, todayISO()]);
    r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
  } catch (e) { if (!fkErr(e, res)) throw e; }
}));
router.delete('/guruhlar/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM guruhlar WHERE id=$1 AND filial_id=$2', [int(req.params.id) || 0, req.filialId]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));

// Guruh o'quvchilari
router.get('/guruhlar/:id/oquvchilar', wrap(async (req, res) => {
  if (!(await inFilial('guruhlar', int(req.params.id), req.filialId))) return bad(res, 'Guruh topilmadi', 404);
  const r = await pool.query(`
    SELECT o.id, o.ism, o.familiya, o.telefon, x.qoshilgan
      FROM guruh_oquvchilari x JOIN oquvchilar o ON o.id=x.oquvchi_id
     WHERE x.guruh_id=$1 ORDER BY o.familiya, o.ism`, [req.params.id]);
  res.json({ ok: true, items: r.rows });
}));
// Guruh o'quvchilarining yuz vektorlari (kamera bilan davomat uchun). Faqat faol o'quvchilar.
router.get('/guruhlar/:id/yuzlar', wrap(async (req, res) => {
  const gid = int(req.params.id); if (!gid) return bad(res, "Noto'g'ri guruh");
  if (!(await inFilial('guruhlar', gid, req.filialId))) return bad(res, 'Guruh topilmadi', 404);
  const r = await pool.query(`
    SELECT y.oquvchi_id, y.vektor
      FROM guruh_oquvchilari x
      JOIN oquvchilar o ON o.id = x.oquvchi_id AND o.faol
      JOIN oquvchi_yuz y ON y.oquvchi_id = o.id
     WHERE x.guruh_id = $1 ORDER BY y.oquvchi_id, y.id`, [gid]);
  const m = new Map();
  for (const x of r.rows) { if (!m.has(x.oquvchi_id)) m.set(x.oquvchi_id, []); m.get(x.oquvchi_id).push(x.vektor); }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, items: [...m].map(([oquvchi_id, vektorlar]) => ({ oquvchi_id, vektorlar })) });
}));
router.post('/guruhlar/:id/oquvchilar', wrap(async (req, res) => {
  const oid = int(req.body.oquvchi_id); if (!oid) return bad(res, "O'quvchini tanlang");
  const gid = int(req.params.id) || 0;
  if (!(await inFilial('oquvchilar', oid, req.filialId))) return bad(res, "O'quvchi topilmadi", 404);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const g = await c.query('SELECT max_oquvchi, holat FROM guruhlar WHERE id=$1 AND filial_id=$2 FOR UPDATE', [gid, req.filialId]);
    if (!g.rowCount) { await c.query('ROLLBACK'); return bad(res, 'Guruh topilmadi', 404); }
    if (g.rows[0].holat === 'yopilgan') { await c.query('ROLLBACK'); return bad(res, GURUH_YOPIQ, 409); }
    const n = await c.query('SELECT COUNT(*)::int AS n FROM guruh_oquvchilari WHERE guruh_id=$1', [gid]);
    if (n.rows[0].n >= g.rows[0].max_oquvchi) { await c.query('ROLLBACK'); return bad(res, "Guruh to'lgan", 409); }
    await c.query('INSERT INTO guruh_oquvchilari(guruh_id,oquvchi_id) VALUES($1,$2)', [gid, oid]);
    await c.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    if (e.code === '23505') return bad(res, "O'quvchi allaqachon shu guruhda", 409);
    if (e.code === '23503') return bad(res, "O'quvchi topilmadi", 404);
    throw e;
  } finally { c.release(); }
}));
router.delete('/guruhlar/:id/oquvchilar/:oid', wrap(async (req, res) => {
  if (!(await inFilial('guruhlar', int(req.params.id), req.filialId))) return bad(res, 'Guruh topilmadi', 404);
  const r = await pool.query('DELETE FROM guruh_oquvchilari WHERE guruh_id=$1 AND oquvchi_id=$2', [int(req.params.id), int(req.params.oid) || 0]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));

// ═══ DAVOMAT (admin belgilaydi) ═════════════════════════════════════════════
const DAVOMAT_HOLAT = ['keldi', 'kechikdi', 'kelmadi', 'sababli'];
// Tanlangan kun davomati: guruhdagi har bir o'quvchi + belgilangan holat (yoki null)
router.get('/guruhlar/:id/davomat', wrap(async (req, res) => {
  const gid = int(req.params.id); if (!gid) return bad(res, "Noto'g'ri guruh");
  const sana = req.query.sana ? realDate(req.query.sana) : todayISO();
  if (!sana) return bad(res, "Sana noto'g'ri");
  if (!(await inFilial('guruhlar', gid, req.filialId))) return bad(res, 'Guruh topilmadi', 404);
  const r = await pool.query(`
    SELECT o.id, o.ism, o.familiya, o.telefon, d.holat
      FROM guruh_oquvchilari x
      JOIN oquvchilar o ON o.id=x.oquvchi_id
      LEFT JOIN davomat d ON d.guruh_id=x.guruh_id AND d.oquvchi_id=o.id AND d.sana=$2::date
     WHERE x.guruh_id=$1
       AND (o.faol OR o.nofaol_sana > $2::date)   -- nofaol qilingan sanadan boshlab davomatda chiqmaydi
     ORDER BY o.familiya, o.ism`, [gid, sana]);
  res.json({ ok: true, sana, items: r.rows });
}));
// Davomatni saqlash (qayta saqlansa yangilanadi). Guruhda bo'lmagan o'quvchi e'tiborga olinmaydi.
router.put('/guruhlar/:id/davomat', wrap(async (req, res) => {
  const gid = int(req.params.id); if (!gid) return bad(res, "Noto'g'ri guruh");
  const sana = realDate((req.body || {}).sana);
  if (!sana) return bad(res, "Sana noto'g'ri");
  if (sana > todayISO()) return bad(res, "Kelajak sanasi uchun davomat belgilab bo'lmaydi");
  const items = (req.body || {}).items;
  if (!Array.isArray(items) || !items.length) return bad(res, "Davomat bo'sh");
  if (items.length > 500) return bad(res, "Juda ko'p yozuv");
  const gr = await pool.query('SELECT holat FROM guruhlar WHERE id=$1 AND filial_id=$2', [gid, req.filialId]);
  if (!gr.rowCount) return bad(res, 'Guruh topilmadi', 404);
  if (gr.rows[0].holat === 'yopilgan') return bad(res, GURUH_YOPIQ, 409); // yopilgan guruh davomati faqat ko'riladi
  const ids = [], hol = [], seen = new Set();
  for (const it of items) {
    const oid = int(it && it.oquvchi_id);
    if (!oid || !DAVOMAT_HOLAT.includes(it.holat)) return bad(res, "Davomat ma'lumoti noto'g'ri");
    if (seen.has(oid)) continue; seen.add(oid);
    ids.push(oid); hol.push(it.holat);
  }
  const r = await pool.query(`
    INSERT INTO davomat(guruh_id, oquvchi_id, sana, holat)
    SELECT $1::int, x.oid, $2::date, x.h
      FROM unnest($3::int[], $4::text[]) AS x(oid, h)
     WHERE EXISTS (SELECT 1 FROM guruh_oquvchilari go JOIN oquvchilar q ON q.id=go.oquvchi_id
                    WHERE go.guruh_id=$1::int AND go.oquvchi_id=x.oid
                      AND (q.faol OR q.nofaol_sana > $2::date))
    ON CONFLICT (guruh_id, oquvchi_id, sana) DO UPDATE SET holat=EXCLUDED.holat, yangilangan=NOW()`,
    [gid, sana, ids, hol]);
  res.json({ ok: true, saqlandi: r.rowCount });
}));

// ═══ LIDLAR (botdan kelgan «kursga yozilish» arizalari) ══════════════════════
const LID_HOLAT = ['yangi', 'aloqada', 'yozildi', 'rad'];
router.get('/lidlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT l.id, l.ism, l.telefon, l.manzil, l.username, l.telegram_id::text AS telegram_id, l.holat, l.izoh, l.yaratilgan,
           l.fan_nomi, l.guruh_nomi, l.guruh_id, l.oquvchi_id,
           g.jadval, g.oylik_narx::float AS oylik_narx, TRIM(CONCAT(q.familiya, ' ', q.ism)) AS oqituvchi_nomi
      FROM lidlar l
      LEFT JOIN guruhlar g ON g.id=l.guruh_id
      LEFT JOIN oqituvchilar q ON q.id=g.oqituvchi_id
     WHERE l.filial_id=$1
     ORDER BY (l.holat='yangi') DESC, l.id DESC LIMIT 1000`, [req.filialId]);
  res.json({ ok: true, items: r.rows });
}));
// Admin lidni qo'lda qo'shadi (botdan tashqari kelgan ariza): holat doim «yangi». FI = «Familiya Ism».
router.post('/lidlar', wrap(async (req, res) => {
  const b = req.body || {};
  const familiya = str(b.familiya, 100), ism = str(b.ism, 100), tel = phone(b.telefon), gid = int(b.guruh_id);
  if (!familiya) return bad(res, 'Familiya majburiy');
  if (!ism) return bad(res, 'Ism majburiy');
  if (!tel) return bad(res, "Telefon raqami noto'g'ri");
  if (!gid) return bad(res, 'Fan va guruhni tanlang');
  const g = await pool.query(`SELECT g.nomi, f.nomi AS fan_nomi FROM guruhlar g JOIN fanlar f ON f.id=g.fan_id
                               WHERE g.id=$1 AND g.filial_id=$2 AND g.holat<>'yopilgan'`, [gid, req.filialId]);
  if (!g.rowCount) return bad(res, 'Guruh topilmadi yoki yopilgan', 404);
  const r = await pool.query(
    `INSERT INTO lidlar(ism,telefon,manzil,guruh_id,fan_nomi,guruh_nomi,izoh,filial_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [`${familiya} ${ism}`, tel, str(b.manzil, 300), gid, g.rows[0].fan_nomi, g.rows[0].nomi, str(b.izoh, 2000), req.filialId]);
  res.json({ ok: true, id: r.rows[0].id });
}));
router.put('/lidlar/:id', wrap(async (req, res) => {
  const b = req.body || {}, id = int(req.params.id) || 0;
  if (!LID_HOLAT.includes(b.holat)) return bad(res, "Holat noto'g'ri");
  const r = await pool.query('UPDATE lidlar SET holat=$1, izoh=$2 WHERE id=$3 AND filial_id=$4', [b.holat, str(b.izoh, 2000), id, req.filialId]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
router.delete('/lidlar/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM lidlar WHERE id=$1 AND filial_id=$2', [int(req.params.id) || 0, req.filialId]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
// Lidni o'quvchiga aylantirish: yangi o'quvchi yaratiladi va (guruh hali bor bo'lsa) shu guruhga qo'shiladi. Lid «Yozildi» bo'ladi.
router.post('/lidlar/:id/oquvchi', wrap(async (req, res) => {
  const id = int(req.params.id) || 0;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const l = await c.query('SELECT * FROM lidlar WHERE id=$1 AND filial_id=$2 FOR UPDATE', [id, req.filialId]);
    if (!l.rowCount) { await c.query('ROLLBACK'); return bad(res, 'Topilmadi', 404); }
    const lid = l.rows[0];
    if (lid.oquvchi_id) { await c.query('ROLLBACK'); return bad(res, "Bu lid allaqachon o'quvchiga aylantirilgan", 409); }
    if (lid.guruh_id) { // guruhni qulflab, joy borligini tekshiramiz
      const g = await c.query('SELECT max_oquvchi, holat FROM guruhlar WHERE id=$1 FOR UPDATE', [lid.guruh_id]);
      if (g.rowCount && g.rows[0].holat === 'yopilgan') { await c.query('ROLLBACK'); return bad(res, "Lidning guruhi yopilgan. Avval guruhni qayta oching", 409); }
      const n = await c.query('SELECT COUNT(*)::int AS n FROM guruh_oquvchilari WHERE guruh_id=$1', [lid.guruh_id]);
      if (g.rowCount && n.rows[0].n >= g.rows[0].max_oquvchi) { await c.query('ROLLBACK'); return bad(res, "Guruh to'lgan", 409); }
    }
    const parts = lid.ism.split(/\s+/);               // FI tartibi: «Valiyev Ali» → familiya=Valiyev, ism=Ali
    const o = await c.query('INSERT INTO oquvchilar(ism,familiya,telefon,manzil,filial_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [parts.length > 1 ? parts.slice(1).join(' ') : parts[0], parts.length > 1 ? parts[0] : '', lid.telefon, lid.manzil, req.filialId]);
    if (lid.guruh_id && (await c.query('SELECT 1 FROM guruhlar WHERE id=$1', [lid.guruh_id])).rowCount)
      await c.query('INSERT INTO guruh_oquvchilari(guruh_id,oquvchi_id) VALUES($1,$2)', [lid.guruh_id, o.rows[0].id]);
    await c.query("UPDATE lidlar SET holat='yozildi', oquvchi_id=$2 WHERE id=$1", [id, o.rows[0].id]);
    await c.query('COMMIT');
    res.json({ ok: true, oquvchi_id: o.rows[0].id, guruhga_qoshildi: !!lid.guruh_id });
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}));

// ═══ VAKANSIYALAR (o'qituvchi ish o'rinlari) ═════════════════════════════════
router.get('/vakansiyalar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT v.*, f.nomi AS fan_nomi, (SELECT COUNT(*)::int FROM nomzodlar n WHERE n.vakansiya_id=v.id) AS nomzodlar_soni
      FROM vakansiyalar v LEFT JOIN fanlar f ON f.id=v.fan_id WHERE v.filial_id=$1 ORDER BY v.id DESC`, [req.filialId]);
  res.json({ ok: true, items: r.rows });
}));
function vakBody(b) {
  const nomi = str(b.nomi, 200); if (!nomi) return { err: 'Vakansiya nomi majburiy' };
  return { v: [nomi, int(b.fan_id), str(b.tavsif, 3000), str(b.talablar, 3000), str(b.maosh, 200), b.faol !== false] };
}
router.post('/vakansiyalar', wrap(async (req, res) => {
  const { err, v } = vakBody(req.body); if (err) return bad(res, err);
  if (v[1] && !(await inFilial('fanlar', v[1], req.filialId))) return bad(res, 'Fan topilmadi');
  try {
    const r = await pool.query('INSERT INTO vakansiyalar(nomi,fan_id,tavsif,talablar,maosh,faol,filial_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [...v, req.filialId]);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { if (e.code === '23503') return bad(res, 'Fan topilmadi'); throw e; }
}));
router.put('/vakansiyalar/:id', wrap(async (req, res) => {
  const { err, v } = vakBody(req.body); if (err) return bad(res, err);
  if (v[1] && !(await inFilial('fanlar', v[1], req.filialId))) return bad(res, 'Fan topilmadi');
  try {
    const r = await pool.query('UPDATE vakansiyalar SET nomi=$1,fan_id=$2,tavsif=$3,talablar=$4,maosh=$5,faol=$6 WHERE id=$7 AND filial_id=$8', [...v, int(req.params.id) || 0, req.filialId]);
    r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
  } catch (e) { if (e.code === '23503') return bad(res, 'Fan topilmadi'); throw e; }
}));
router.delete('/vakansiyalar/:id', wrap(async (req, res) => { // nomzodlar qoladi (vakansiya nomi nusxasi bilan)
  const r = await pool.query('DELETE FROM vakansiyalar WHERE id=$1 AND filial_id=$2', [int(req.params.id) || 0, req.filialId]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));

// ═══ NOMZODLAR (vakansiyaga botdan kelgan arizalar) ══════════════════════════
const NOMZOD_HOLAT = ['yangi', 'korildi', 'suhbat', 'qabul', 'rad'];
router.get('/nomzodlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT id, vakansiya_id, vakansiya_nomi, ism, telefon, tajriba, username, telegram_id::text AS telegram_id,
           (rezyume_file_id IS NOT NULL) AS rezyume_bor, rezyume_nomi, holat, izoh, yaratilgan
      FROM nomzodlar WHERE filial_id=$1 ORDER BY (holat='yangi') DESC, id DESC LIMIT 1000`, [req.filialId]);
  res.json({ ok: true, items: r.rows });
}));
router.put('/nomzodlar/:id', wrap(async (req, res) => {
  const b = req.body || {};
  if (!NOMZOD_HOLAT.includes(b.holat)) return bad(res, "Holat noto'g'ri");
  const r = await pool.query('UPDATE nomzodlar SET holat=$1, izoh=$2 WHERE id=$3 AND filial_id=$4', [b.holat, str(b.izoh, 2000), int(req.params.id) || 0, req.filialId]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
router.delete('/nomzodlar/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM nomzodlar WHERE id=$1 AND filial_id=$2', [int(req.params.id) || 0, req.filialId]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
// Rezyume: faylni Telegram saqlaydi (file_id). Bot tokeni bilan yuklab olib, adminga beramiz (Telegram limiti — 20 MB).
router.get('/nomzodlar/:id/rezyume', wrap(async (req, res) => {
  const r = await pool.query('SELECT rezyume_file_id, rezyume_nomi FROM nomzodlar WHERE id=$1 AND filial_id=$2', [int(req.params.id) || 0, req.filialId]);
  if (!r.rowCount || !r.rows[0].rezyume_file_id) return bad(res, 'Rezyume topilmadi', 404);
  const tok = process.env.KURS_BOT_TOKEN;
  if (!tok) return bad(res, 'Bot sozlanmagan (KURS_BOT_TOKEN)', 500);
  try {
    const g = await (await fetch(`https://api.telegram.org/bot${tok}/getFile?file_id=${encodeURIComponent(r.rows[0].rezyume_file_id)}`,
      { signal: AbortSignal.timeout(10000) })).json();
    if (!g.ok || !g.result || !g.result.file_path) return bad(res, "Rezyumeni Telegramdan olib bo'lmadi", 502);
    const f = await fetch(`https://api.telegram.org/file/bot${tok}/${g.result.file_path}`, { signal: AbortSignal.timeout(30000) });
    if (!f.ok) return bad(res, "Rezyumeni Telegramdan olib bo'lmadi", 502);
    const nom = (r.rows[0].rezyume_nomi || 'rezyume').replace(/[^\w.\- ]+/g, '_').slice(0, 100) || 'rezyume';
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(Buffer.from(await f.arrayBuffer()));
  } catch (e) { console.error('rezyume:', e.message); bad(res, "Rezyumeni olib bo'lmadi", 502); }
}));

// ═══ TO'LOVLAR ═══════════════════════════════════════════════════════════════
router.get('/tolovlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT t.id, t.summa::float AS summa, t.sana, t.usul, t.izoh, t.kiritgan,
           t.oquvchi_id, TRIM(o.familiya||' '||o.ism) AS oquvchi_nomi,
           t.guruh_id, g.nomi AS guruh_nomi
      FROM tolovlar t
      JOIN oquvchilar o ON o.id=t.oquvchi_id
      LEFT JOIN guruhlar g ON g.id=t.guruh_id
     WHERE o.filial_id=$1
     ORDER BY t.sana DESC, t.id DESC LIMIT 1000`, [req.filialId]);
  res.json({ ok: true, items: r.rows });
}));
router.post('/tolovlar', wrap(async (req, res) => {
  const b = req.body, oid = int(b.oquvchi_id), summa = num(b.summa);
  if (!oid) return bad(res, "O'quvchini tanlang");
  if (!(await inFilial('oquvchilar', oid, req.filialId))) return bad(res, "O'quvchi topilmadi", 404);
  if (summa == null || summa <= 0 || summa > 999999999999) return bad(res, "Summa noto'g'ri");
  if (b.sana && !realDate(b.sana)) return bad(res, "Sana noto'g'ri");
  if (b.sana && b.sana > todayISO()) return bad(res, "Kelajak sanasi bilan to'lov kiritib bo'lmaydi");
  const usul = ['naqd', 'karta', 'otkazma'].includes(b.usul) ? b.usul : 'naqd';
  // To'lov har doim o'quvchining BIR guruhiga tegishli (reestrda shu guruh bo'yicha hisoblanadi)
  let gid = int(b.guruh_id);
  if (!gid) {
    const g = await pool.query('SELECT guruh_id FROM guruh_oquvchilari WHERE oquvchi_id=$1', [oid]);
    if (g.rowCount !== 1) return bad(res, g.rowCount ? "Guruhni tanlang (o'quvchi bir nechta guruhda)" : "O'quvchi hech qaysi guruhda emas");
    gid = g.rows[0].guruh_id;
  } else if (!(await pool.query('SELECT 1 FROM guruh_oquvchilari WHERE guruh_id=$1 AND oquvchi_id=$2', [gid, oid])).rowCount) {
    return bad(res, "O'quvchi bu guruhda emas");
  }
  try {
    const r = await pool.query(
      'INSERT INTO tolovlar(oquvchi_id,guruh_id,summa,sana,usul,izoh,kiritgan) VALUES($1,$2,$3,$4::date,$5,$6,$7) RETURNING id',
      [oid, gid, summa, b.sana || todayISO(), usul, str(b.izoh, 500), req.user.ism || '']);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { if (e.code === '23503') return bad(res, "O'quvchi yoki guruh topilmadi"); throw e; }
}));
router.delete('/tolovlar/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM tolovlar t USING oquvchilar o WHERE t.id=$1 AND o.id=t.oquvchi_id AND o.filial_id=$2', [int(req.params.id) || 0, req.filialId]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));

// ═══ OYLIK TO'LOVLAR REESTRI ═════════════════════════════════════════════════
// Har bir qator = (guruh, o'quvchi) tanlangan oy uchun. Narx = guruhning oylik narxi, "to'lov qildi" = shu oydagi to'lovlar yig'indisi.
// O'quvchi oyda ko'rinadi, agar: guruhga shu oy tugamasidan oldin qo'shilgan, guruh shu oy tugamasidan oldin boshlangan va
// (hozir faol YOKI nofaol qilingan sana shu oydan KEYIN). Ya'ni dekabrda nofaol qilingan o'quvchi noyabrda ko'rinadi, dekabrda yo'q.
// Yopilgan guruh: yopilgan oygacha (shu oy ham) ko'rinadi, keyingi oylarda chiqadi; eski oylar tarixi saqlanadi.
const OY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const oyOk = v => OY_RE.test(String(v || '')) && String(v) <= todayISO().slice(0, 7); // kelajak oylari yo'q
const USULLAR = ['naqd', 'karta', 'otkazma'];
const holatOf = (narx, tolangan) => (tolangan <= 0 ? 'yoq' : narx > 0 && tolangan < narx ? 'qisman' : 'tolagan');

async function reestrRows(oy, filial) {
  const bosh = oy + '-01';
  const r = await pool.query(`
    SELECT x.guruh_id, x.oquvchi_id, o.ism, o.familiya, o.telefon, o.faol,
           g.nomi AS guruh_nomi, g.fan_id, f.nomi AS fan_nomi, g.oqituvchi_id, TRIM(CONCAT(q.familiya, ' ', q.ism)) AS oqituvchi_nomi,
           g.oylik_narx::float AS narx,
           COALESCE(t.summa, 0)::float AS tolangan, to_char(t.oxirgi, 'YYYY-MM-DD') AS tolov_sanasi,
           COALESCE(t.naqd, 0)::float AS u_naqd, COALESCE(t.karta, 0)::float AS u_karta, COALESCE(t.otkazma, 0)::float AS u_otkazma,
           COALESCE(e.qaydnoma, '') AS qaydnoma,
           to_char(e.ehtimoliy_sana, 'YYYY-MM-DD') AS ehtimoliy_sana,
           to_char(e.gaplashilgan_sana, 'YYYY-MM-DD') AS gaplashilgan_sana
      FROM guruh_oquvchilari x
      JOIN oquvchilar o ON o.id = x.oquvchi_id
      JOIN guruhlar g   ON g.id = x.guruh_id
      JOIN fanlar f     ON f.id = g.fan_id
      LEFT JOIN oqituvchilar q ON q.id = g.oqituvchi_id
      LEFT JOIN LATERAL (
        SELECT SUM(summa) AS summa, MAX(sana) AS oxirgi,
               SUM(summa) FILTER (WHERE usul='naqd') AS naqd, SUM(summa) FILTER (WHERE usul='karta') AS karta,
               SUM(summa) FILTER (WHERE usul='otkazma') AS otkazma
          FROM tolovlar
         WHERE oquvchi_id = x.oquvchi_id AND guruh_id = x.guruh_id
           AND sana >= $1::date AND sana < ($1::date + INTERVAL '1 month')
      ) t ON TRUE
      LEFT JOIN tolov_eslatmalar e ON e.guruh_id = x.guruh_id AND e.oquvchi_id = x.oquvchi_id AND e.oy = $1::date
     WHERE g.filial_id = $2
       AND (x.qoshilgan AT TIME ZONE 'Asia/Tashkent')::date < ($1::date + INTERVAL '1 month')
       AND (g.boshlanish IS NULL OR g.boshlanish < ($1::date + INTERVAL '1 month'))
       AND (g.yopilgan_sana IS NULL OR g.yopilgan_sana >= $1::date)   -- yopilgan guruh yopilgan oyigacha (shu oy ham) ko'rinadi
       AND (o.faol OR o.nofaol_sana >= ($1::date + INTERVAL '1 month'))
     ORDER BY g.nomi, o.familiya, o.ism`, [bosh, filial]);
  return r.rows.map(({ u_naqd, u_karta, u_otkazma, ...x }) => ({ ...x, usul_summa: { naqd: u_naqd, karta: u_karta, otkazma: u_otkazma },
    qarz: Math.max(x.narx - x.tolangan, 0), holat: holatOf(x.narx, x.tolangan) }));
}

// Filtrlar: fan_id, guruh_id, oqituvchi_id, usul (naqd | karta | otkazma), holat (tolagan | qarzdor), q (qidiruv). Excel yuklashda ham xuddi shu qoidalar ishlatiladi.
function reestrFilter(rows, qs) {
  const fid = int(qs.fan_id), gid = int(qs.guruh_id), tid = int(qs.oqituvchi_id), h = qs.holat, q = str(qs.q, 100).toLowerCase();
  const u = USULLAR.includes(qs.usul) ? qs.usul : '';
  return rows.filter(x =>
    (!fid || x.fan_id === fid) && (!gid || x.guruh_id === gid) && (!tid || x.oqituvchi_id === tid) && (!u || x.usul_summa[u] > 0) &&
    (h === 'tolagan' ? x.holat === 'tolagan' : h === 'qarzdor' ? x.qarz > 0 : true) &&
    (!q || [x.familiya, x.ism, x.telefon, x.fan_nomi, x.guruh_nomi, x.oqituvchi_nomi, x.qaydnoma].join(' ').toLowerCase().includes(q)));
}

router.get('/tolov-reestr', wrap(async (req, res) => {
  if (!oyOk(req.query.oy)) return bad(res, "Oy noto'g'ri (kelajak oyini ko'rib bo'lmaydi)");
  res.json({ ok: true, oy: req.query.oy, items: await reestrRows(req.query.oy, req.filialId) });
}));

// Qaydnoma / ehtimoliy to'lov sanasi / gaplashilgan sana: faqat yuborilgan maydonlar yangilanadi ('' yoki null = tozalash)
router.put('/tolov-reestr', wrap(async (req, res) => {
  const b = req.body || {}, gid = int(b.guruh_id), oid = int(b.oquvchi_id);
  if (!gid || !oid) return bad(res, "Noto'g'ri so'rov");
  if (!oyOk(b.oy)) return bad(res, "Oy noto'g'ri");
  const cols = [], vals = [];
  if ('qaydnoma' in b) { cols.push('qaydnoma'); vals.push(str(b.qaydnoma, 2000)); }
  for (const k of ['ehtimoliy_sana', 'gaplashilgan_sana']) {
    if (!(k in b)) continue;
    if (b[k] !== null && b[k] !== '' && !realDate(b[k])) return bad(res, "Sana noto'g'ri");
    cols.push(k); vals.push(b[k] ? b[k] : null);
  }
  if (!cols.length) return bad(res, "O'zgarish yo'q");
  if (!(await pool.query('SELECT 1 FROM guruh_oquvchilari x JOIN guruhlar g ON g.id=x.guruh_id WHERE x.guruh_id=$1 AND x.oquvchi_id=$2 AND g.filial_id=$3', [gid, oid, req.filialId])).rowCount)
    return bad(res, "O'quvchi bu guruhda emas", 404);
  const ins = ['guruh_id', 'oquvchi_id', 'oy', ...cols], ph = ins.map((_, i) => (i === 2 ? `$${i + 1}::date` : `$${i + 1}`));
  await pool.query(
    `INSERT INTO tolov_eslatmalar(${ins.join(',')}) VALUES(${ph.join(',')})
     ON CONFLICT (guruh_id, oquvchi_id, oy) DO UPDATE SET ${cols.map(c => `${c}=EXCLUDED.${c}`).join(',')}, yangilangan=NOW()`,
    [gid, oid, b.oy + '-01', ...vals]);
  res.json({ ok: true });
}));

// Bitta qatorning shu oydagi to'lovlari (modal uchun)
router.get('/tolov-reestr/tolovlar', wrap(async (req, res) => {
  const gid = int(req.query.guruh_id), oid = int(req.query.oquvchi_id);
  if (!gid || !oid || !oyOk(req.query.oy)) return bad(res, "Noto'g'ri so'rov");
  if (!(await inFilial('guruhlar', gid, req.filialId))) return bad(res, 'Guruh topilmadi', 404);
  const r = await pool.query(`
    SELECT id, summa::float AS summa, to_char(sana,'YYYY-MM-DD') AS sana, usul, izoh, kiritgan FROM tolovlar
     WHERE guruh_id=$1 AND oquvchi_id=$2 AND sana >= $3::date AND sana < ($3::date + INTERVAL '1 month')
     ORDER BY sana, id`, [gid, oid, req.query.oy + '-01']);
  res.json({ ok: true, items: r.rows });
}));

// Excel (.xlsx): ekrandagi filtrlar bilan bir xil
router.get('/tolov-reestr/excel', wrap(async (req, res) => {
  const oy = String(req.query.oy || '');
  if (!oyOk(oy)) return bad(res, "Oy noto'g'ri (kelajak oyini ko'rib bo'lmaydi)");
  const usulQ = USULLAR.includes(req.query.usul) ? req.query.usul : '';
  // To'lov usuli tanlangan bo'lsa, «To'lov qildi» faqat shu usul bo'yicha to'langan summa (ekrandagi bilan bir xil)
  const rows = reestrFilter(await reestrRows(oy, req.filialId), req.query).map(x => (usulQ ? { ...x, tolangan: x.usul_summa[usulQ] } : x));
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(oy);
  const OY = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const USUL_NOM = { naqd: 'Naqd', karta: 'Karta', otkazma: 'Hisob raqamga o\'tkazma' };
  const HOLAT = { tolagan: "To'liq", qisman: 'Qisman', yoq: "To'lov yo'q" };
  const kun = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y}`; };
  ws.columns = [
    { header: '№', key: 'n', width: 5 }, { header: 'Familiya Ismi', key: 'fi', width: 28 }, { header: 'Fan', key: 'fan', width: 20 }, { header: "O'qituvchi", key: 'oq', width: 26 },
    { header: 'Guruh', key: 'g', width: 22 }, { header: 'Telefon raqami', key: 'tel', width: 18 }, { header: 'Qaydnoma', key: 'qay', width: 40 },
    { header: "Ehtimoliy to'lov sanasi", key: 'eh', width: 18 }, { header: 'Gaplashilgan vaqt', key: 'ga', width: 18 },
    { header: "Oylik to'lov narxi", key: 'narx', width: 18 }, { header: usulQ ? `To'lov qildi (${USUL_NOM[usulQ]})` : "To'lov qildi", key: 'tol', width: 20 },
    { header: 'Qarz', key: 'qarz', width: 16 }, { header: "To'lov sanasi", key: 'ts', width: 14 }, { header: "To'lov holati", key: 'h', width: 14 },
  ];
  rows.forEach((x, i) => ws.addRow({ n: i + 1, fi: `${x.familiya} ${x.ism}`.trim() + (x.faol ? '' : ' (nofaol)'), fan: x.fan_nomi, oq: x.oqituvchi_nomi, g: x.guruh_nomi, tel: x.telefon,
    qay: x.qaydnoma, eh: kun(x.ehtimoliy_sana), ga: kun(x.gaplashilgan_sana), narx: x.narx, tol: x.tolangan, qarz: x.qarz, ts: kun(x.tolov_sanasi), h: HOLAT[x.holat] }));
  const sum = k => rows.reduce((a, x) => a + x[k], 0);
  const tot = ws.addRow({ fi: 'JAMI', narx: sum('narx'), tol: sum('tolangan'), qarz: sum('qarz') });
  tot.font = { bold: true };
  ['narx', 'tol', 'qarz'].forEach(k => { ws.getColumn(k).numFmt = '#,##0'; });
  ws.getColumn('qay').alignment = { wrapText: true, vertical: 'top' };
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F54' } }; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const fname = `tolovlar-${oy}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('X-Oy-Nomi', encodeURIComponent(`${OY[Number(oy.slice(5)) - 1]} ${oy.slice(0, 4)}`));
  await wb.xlsx.write(res);
  res.end();
}));

// ═══ O'QITUVCHILAR OYLIGI ═══════════════════════════════════════════════════
// Hisob jonli, oy bo'yicha:
//  • soatbay — guruhda shu oy davomat belgilangan kunlar soni × dars davomiyligi / 60 (1 soat = 60 daqiqa) × soat stavkasi;
//  • oylik   — qat'iy oylik maosh;
//  • foiz    — guruhlarga shu oyda haqiqatda tushgan to'lovlar yig'indisidan foiz (o'quvchi soniga bog'liq emas).
// Guruhning HOZIRGI o'qituvchisi hisobga olinadi (o'qituvchi almashtirilsa, eski oylar ham yangisiga o'tadi — oyni muzlatish keyingi bosqich).
async function oqituvchiHisobot(oy, filialId) {
  const bosh = oy + '-01';
  const [t, g] = await Promise.all([
    pool.query(`SELECT t.id, t.ism, t.familiya, t.faol, t.haq_turi, t.soat_stavka::float AS soat_stavka, t.oylik_maosh::float AS oylik_maosh,
                       t.foiz::float AS foiz, f.nomi AS fan_nomi
                  FROM oqituvchilar t LEFT JOIN fanlar f ON f.id=t.fan_id WHERE t.filial_id=$1 ORDER BY t.familiya, t.ism`, [filialId]),
    pool.query(`SELECT g.id, g.nomi, g.oqituvchi_id, g.davomiylik, f.nomi AS fan_nomi,
                       COALESCE(d.darslar, 0)::int AS darslar, COALESCE(p.summa, 0)::float AS tushum
                  FROM guruhlar g
                  JOIN fanlar f ON f.id = g.fan_id
                  LEFT JOIN LATERAL (SELECT COUNT(DISTINCT sana) AS darslar FROM davomat
                                      WHERE guruh_id = g.id AND sana >= $1::date AND sana < $1::date + interval '1 month') d ON TRUE
                  LEFT JOIN LATERAL (SELECT SUM(summa) AS summa FROM tolovlar
                                      WHERE guruh_id = g.id AND sana >= $1::date AND sana < $1::date + interval '1 month') p ON TRUE
                 WHERE g.filial_id = $2 AND g.oqituvchi_id IS NOT NULL
                   AND (COALESCE(d.darslar, 0) > 0 OR COALESCE(p.summa, 0) > 0
                        OR (g.holat <> 'yopilgan' AND (g.boshlanish IS NULL OR g.boshlanish < $1::date + interval '1 month')))
                 ORDER BY g.nomi`, [bosh, filialId]),
  ]);
  const byT = new Map();
  for (const x of g.rows) { if (!byT.has(x.oqituvchi_id)) byT.set(x.oqituvchi_id, []); byT.get(x.oqituvchi_id).push(x); }
  const round2 = n => Math.round(n * 100) / 100;
  const items = [];
  for (const o of t.rows) {
    const guruhlar = (byT.get(o.id) || []).map(x => {
      const soat = x.davomiylik ? round2(x.darslar * x.davomiylik / 60) : 0;
      let summa = 0;
      if (o.haq_turi === 'soatbay') summa = Math.round(soat * o.soat_stavka);
      else if (o.haq_turi === 'foiz') summa = Math.round(x.tushum * o.foiz / 100);
      return { id: x.id, nomi: x.nomi, fan_nomi: x.fan_nomi, davomiylik: x.davomiylik, darslar: x.darslar, soat, tushum: x.tushum, summa };
    });
    const faolmi = guruhlar.some(x => x.darslar > 0 || x.tushum > 0);
    if (!o.faol && !faolmi) continue; // nofaol va shu oyda ishi bo'lmagan o'qituvchi ko'rinmaydi
    const ogoh = [];
    if (!o.haq_turi) ogoh.push("To'lov turi belgilanmagan — o'qituvchini tahrirlab belgilang");
    if (o.haq_turi === 'soatbay' && guruhlar.some(x => x.darslar > 0 && !x.davomiylik)) ogoh.push("Ba'zi guruhlarda dars davomiyligi kiritilmagan — soat hisoblanmadi");
    const jamiGuruh = guruhlar.reduce((a, x) => a + x.summa, 0);
    items.push({
      id: o.id, ism: o.ism, familiya: o.familiya, faol: o.faol, fan_nomi: o.fan_nomi,
      haq_turi: o.haq_turi, soat_stavka: o.soat_stavka, oylik_maosh: o.oylik_maosh, foiz: o.foiz,
      darslar: guruhlar.reduce((a, x) => a + x.darslar, 0), soat: round2(guruhlar.reduce((a, x) => a + x.soat, 0)),
      tushum: guruhlar.reduce((a, x) => a + x.tushum, 0),
      summa: o.haq_turi === 'oylik' ? Math.round(o.oylik_maosh) : jamiGuruh,
      ogohlantirish: ogoh, guruhlar,
    });
  }
  return { oy, items, jami: items.reduce((a, x) => a + x.summa, 0) };
}
router.get('/oqituvchi-hisobot', wrap(async (req, res) => {
  if (!oyOk(req.query.oy)) return bad(res, "Oy noto'g'ri (kelajak oyini ko'rib bo'lmaydi)");
  res.json({ ok: true, ...(await oqituvchiHisobot(req.query.oy, req.filialId)) });
}));
router.get('/oqituvchi-hisobot/excel', wrap(async (req, res) => {
  const oy = String(req.query.oy || '');
  if (!oyOk(oy)) return bad(res, "Oy noto'g'ri (kelajak oyini ko'rib bo'lmaydi)");
  const h = await oqituvchiHisobot(oy, req.filialId);
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const OY = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const TUR = { soatbay: 'Soatbay', oylik: 'Oylik', foiz: 'Foiz' };
  const stavka = x => (x.haq_turi === 'soatbay' ? x.soat_stavka : x.haq_turi === 'oylik' ? x.oylik_maosh : x.haq_turi === 'foiz' ? x.foiz / 100 : null);
  const nomi = x => `${x.familiya} ${x.ism}`.trim() + (x.faol ? '' : ' (nofaol)');
  const style = ws => {
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F54' } }; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const ws = wb.addWorksheet('Oyliklar');
  ws.columns = [
    { header: '№', key: 'n', width: 5 }, { header: "O'qituvchi", key: 'oq', width: 28 }, { header: 'Fan', key: 'fan', width: 20 },
    { header: "To'lov turi", key: 'tur', width: 12 }, { header: 'Stavka', key: 'st', width: 16 }, { header: 'Darslar soni', key: 'dr', width: 12 },
    { header: 'Soat', key: 'soat', width: 10 }, { header: "Guruhlarga tushgan to'lov", key: 'tush', width: 22 }, { header: 'Hisoblangan summa', key: 'sum', width: 20 },
    { header: 'Eslatma', key: 'og', width: 44 },
  ];
  h.items.forEach((x, i) => {
    const r = ws.addRow({ n: i + 1, oq: nomi(x), fan: x.fan_nomi, tur: TUR[x.haq_turi] || 'Belgilanmagan', st: stavka(x), dr: x.darslar, soat: x.soat, tush: x.tushum, sum: x.summa, og: x.ogohlantirish.join('; ') });
    if (x.haq_turi === 'foiz') r.getCell('st').numFmt = '0.##%';
    else r.getCell('st').numFmt = '#,##0';
  });
  ws.addRow({ oq: 'JAMI', tush: h.items.reduce((a, x) => a + x.tushum, 0), sum: h.jami }).font = { bold: true };
  ['tush', 'sum'].forEach(k => { ws.getColumn(k).numFmt = '#,##0'; });
  style(ws);
  const w2 = wb.addWorksheet('Guruhlar bo\'yicha');
  w2.columns = [
    { header: "O'qituvchi", key: 'oq', width: 28 }, { header: 'Guruh', key: 'g', width: 24 }, { header: 'Fan', key: 'fan', width: 20 },
    { header: 'Davomiylik (daq)', key: 'dav', width: 16 }, { header: 'Darslar soni', key: 'dr', width: 12 }, { header: 'Soat', key: 'soat', width: 10 },
    { header: "Tushgan to'lov", key: 'tush', width: 18 }, { header: 'Summa', key: 'sum', width: 16 },
  ];
  for (const x of h.items) for (const gr of x.guruhlar)
    w2.addRow({ oq: nomi(x), g: gr.nomi, fan: gr.fan_nomi, dav: gr.davomiylik, dr: gr.darslar, soat: gr.soat, tush: gr.tushum, sum: x.haq_turi === 'oylik' ? null : gr.summa });
  ['tush', 'sum'].forEach(k => { w2.getColumn(k).numFmt = '#,##0'; });
  style(w2);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="oyliklar-${oy}.xlsx"`);
  res.setHeader('X-Oy-Nomi', encodeURIComponent(`${OY[Number(oy.slice(5)) - 1]} ${oy.slice(0, 4)}`));
  await wb.xlsx.write(res);
  res.end();
}));

// ═══ GRAFIK: o'quvchilar soni oylar bo'yicha ═════════════════════════════════
// Tarix jadvali yo'q — oldingi oylar mavjud sanalardan qayta hisoblanadi (to'lov reestridagi qoida bilan bir xil):
//  • boshlagan = o'quvchi yaratilgan yoki birinchi guruhga qo'shilgan sananing eng erta kuni;
//  • «jami» (oy oxirida faol) = oy tugamasidan oldin boshlagan VA (hozir faol YOKI nofaol qilingan sana shu oydan KEYIN);
//  • «yangi» = boshlagan oyi shu oy; «ketgan» = nofaol qilingan oyi shu oy.
// Eslatma: o'chirilgan o'quvchilar tarixdan yo'qoladi; qayta faollashtirilganning ketgan sanasi tozalanadi (shuning uchun eski oylar taxminiy).
const monthShift = (oy, n) => { const t = (+oy.slice(0, 4)) * 12 + (+oy.slice(5, 7) - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
const MAX_OY = 60;
router.get('/grafik/oquvchilar', wrap(async (req, res) => {
  const davr = String(req.query.davr || '12');
  if (!['6', '12', 'all'].includes(davr)) return bad(res, "Davr noto'g'ri");
  const cur = todayISO().slice(0, 7);
  const COMMON = `
    WITH s AS (
      SELECT o.faol, o.nofaol_sana,
             LEAST((o.yaratilgan AT TIME ZONE 'Asia/Tashkent')::date,
                   COALESCE((SELECT MIN((x.qoshilgan AT TIME ZONE 'Asia/Tashkent')::date) FROM guruh_oquvchilari x WHERE x.oquvchi_id=o.id), 'infinity'::date)) AS bosh
        FROM oquvchilar o WHERE o.filial_id=$1)`;
  let n = davr === 'all' ? 12 : Number(davr);
  if (davr === 'all') { // eng birinchi o'quvchi boshlagan oydan (ko'pi bilan MAX_OY oy)
    const f = await pool.query(`${COMMON} SELECT to_char(MIN(bosh), 'YYYY-MM') AS oy FROM s`, [req.filialId]);
    if (f.rows[0].oy) { const a = +f.rows[0].oy.slice(0, 4) * 12 + +f.rows[0].oy.slice(5) - 1, b = +cur.slice(0, 4) * 12 + +cur.slice(5) - 1; n = Math.min(Math.max(b - a + 1, 1), MAX_OY); }
  }
  const start = monthShift(cur, -(n - 1));
  const r = await pool.query(`${COMMON},
    m AS (SELECT d::date AS bosh FROM generate_series($2::date, $3::date, interval '1 month') d)
    SELECT to_char(m.bosh, 'YYYY-MM') AS oy,
      COUNT(*) FILTER (WHERE s.bosh < m.bosh + interval '1 month' AND (s.faol OR s.nofaol_sana >= m.bosh + interval '1 month'))::int AS jami,
      COUNT(*) FILTER (WHERE s.bosh >= m.bosh AND s.bosh < m.bosh + interval '1 month')::int AS yangi,
      COUNT(*) FILTER (WHERE NOT s.faol AND s.nofaol_sana >= m.bosh AND s.nofaol_sana < m.bosh + interval '1 month')::int AS ketgan
      FROM m LEFT JOIN s ON TRUE GROUP BY m.bosh ORDER BY m.bosh`, [req.filialId, start + '-01', cur + '-01']);
  res.json({ ok: true, davr, items: r.rows });
}));

// ═══ STATISTIKA ══════════════════════════════════════════════════════════════
router.get('/stats', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM fanlar WHERE faol AND filial_id=$1)         AS fanlar,
      (SELECT COUNT(*)::int FROM guruhlar WHERE holat<>'yopilgan' AND filial_id=$1) AS guruhlar,
      (SELECT COUNT(*)::int FROM oquvchilar WHERE faol AND filial_id=$1)     AS oquvchilar,
      (SELECT COUNT(*)::int FROM oqituvchilar WHERE faol AND filial_id=$1)   AS oqituvchilar,
      (SELECT COALESCE(SUM(t.summa),0)::float FROM tolovlar t JOIN oquvchilar o ON o.id=t.oquvchi_id
        WHERE o.filial_id=$1 AND date_trunc('month',t.sana)=date_trunc('month',(NOW() AT TIME ZONE 'Asia/Tashkent')::date)) AS oy_tushum,
      (SELECT COALESCE(SUM(t.summa),0)::float FROM tolovlar t JOIN oquvchilar o ON o.id=t.oquvchi_id WHERE o.filial_id=$1) AS jami_tushum,
      (SELECT COUNT(*)::int FROM kurs_adminlar WHERE faol AND filial_id=$1)  AS kurs_adminlar,
      (SELECT COUNT(*)::int FROM lidlar WHERE holat='yangi' AND filial_id=$1)    AS yangi_lidlar,
      (SELECT COUNT(*)::int FROM nomzodlar WHERE holat='yangi' AND filial_id=$1) AS yangi_nomzodlar,
      (SELECT COUNT(*)::int FROM vakansiyalar WHERE faol AND filial_id=$1)       AS vakansiyalar`, [req.filialId]);
  res.json({ ok: true, filial: { id: req.filialId, nomi: req.filialNomi }, stats: r.rows[0] });
}));

module.exports = router;
