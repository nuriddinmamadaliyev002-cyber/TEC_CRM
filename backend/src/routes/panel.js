// ─── Admin paneli API (superadmin ham foydalana oladi) ─────────────────
//  /fanlar  /oqituvchilar  /oquvchilar  /guruhlar (+davomat)  /tolovlar  /lidlar  /vakansiyalar  /nomzodlar  /stats
const { Router } = require('express');
const pool = require('../db');
const panelAuth = require('../middleware/panelAuth');
const { str, int, num, date, bad, wrap } = require('../util');

const router = Router();
router.use(panelAuth);

// 2026-02-31 kabi mavjud bo'lmagan sanalarni rad etadi
function realDate(v) {
  const s = date(v); if (!s) return null;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s ? s : null;
}
// «Bugun» — doim Toshkent vaqti bilan (server/baza vaqt mintaqasiga bog'liq emas)
const tzParts = () => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' })
  .formatToParts(new Date()).map(p => [p.type, p.value]));
const todayISO = () => { const p = tzParts(); return `${p.year}-${p.month}-${p.day}`; };

// ═══ FANLAR (o'quv markazda o'tiladigan fanlar nomenklaturasi) ═══════════════
router.get('/fanlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT f.*,
           (SELECT COUNT(*)::int FROM guruhlar g WHERE g.fan_id=f.id)      AS guruhlar_soni,
           (SELECT COUNT(*)::int FROM oqituvchilar o WHERE o.fan_id=f.id)  AS oqituvchilar_soni
      FROM fanlar f ORDER BY f.id DESC`);
  res.json({ ok: true, fanlar: r.rows });
}));
function fanBody(b) {
  const nomi = str(b.nomi, 200);
  if (!nomi) return { err: 'Fan nomi majburiy' };
  return { v: [nomi, str(b.tavsif, 2000), b.faol !== false] };
}
router.post('/fanlar', wrap(async (req, res) => {
  const { err, v } = fanBody(req.body); if (err) return bad(res, err);
  const r = await pool.query('INSERT INTO fanlar(nomi,tavsif,faol) VALUES($1,$2,$3) RETURNING id', v);
  res.json({ ok: true, id: r.rows[0].id });
}));
router.put('/fanlar/:id', wrap(async (req, res) => {
  const { err, v } = fanBody(req.body); if (err) return bad(res, err);
  const r = await pool.query('UPDATE fanlar SET nomi=$1,tavsif=$2,faol=$3 WHERE id=$4', [...v, req.params.id]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
router.delete('/fanlar/:id', wrap(async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM fanlar WHERE id=$1', [req.params.id]);
    r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
  } catch (e) {
    if (e.code === '23503') return bad(res, "Bu fanga guruhlar yoki o'qituvchilar biriktirilgan. Avval ularni o'zgartiring yoki fanni nofaol qiling", 409);
    throw e;
  }
}));

// ═══ O'QITUVCHILAR / O'QUVCHILAR (bir xil shakl) ═════════════════════════════
function person(table, withFan) {
  const r = Router();
  r.get('/', wrap(async (req, res) => {
    const q = withFan
      ? await pool.query(`SELECT t.*, f.nomi AS fan_nomi FROM oqituvchilar t LEFT JOIN fanlar f ON f.id=t.fan_id ORDER BY t.id DESC`)
      : await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`);
    res.json({ ok: true, items: q.rows });
  }));
  const body = b => {
    const ism = str(b.ism, 100); if (!ism) return { err: 'Ism majburiy' };
    const fan = withFan ? int(b.fan_id) : null;
    if (withFan && !fan) return { err: 'Fanni tanlang' }; // fansiz o'qituvchini guruhga biriktirib bo'lmaydi
    return { v: [ism, str(b.familiya, 100), str(b.telefon, 30), b.faol !== false, ...(withFan ? [fan] : [])] };
  };
  // O'quvchi nofaol bo'lgan sanani yuritamiz: shu oydan boshlab to'lovlar reestrida ko'rinmaydi (oldingi oylarda ko'rinadi)
  const syncNofaol = id => withFan ? null : pool.query(
    `UPDATE oquvchilar SET nofaol_sana = CASE WHEN faol THEN NULL ELSE COALESCE(nofaol_sana, (NOW() AT TIME ZONE 'Asia/Tashkent')::date) END WHERE id=$1`, [id]);
  r.post('/', wrap(async (req, res) => {
    const { err, v } = body(req.body); if (err) return bad(res, err);
    const cols = 'ism,familiya,telefon,faol' + (withFan ? ',fan_id' : '');
    const ph = v.map((_, i) => '$' + (i + 1)).join(',');
    try {
      const q = await pool.query(`INSERT INTO ${table}(${cols}) VALUES(${ph}) RETURNING id`, v);
      await syncNofaol(q.rows[0].id);
      res.json({ ok: true, id: q.rows[0].id });
    } catch (e) { if (e.code === '23503') return bad(res, 'Fan topilmadi'); throw e; }
  }));
  r.put('/:id', wrap(async (req, res) => {
    const { err, v } = body(req.body); if (err) return bad(res, err);
    const id = int(req.params.id) || 0;
    // Fan o'zgarsa, o'qituvchi boshqa fan guruhlarida qolib ketmasin
    if (withFan && (await pool.query('SELECT 1 FROM guruhlar WHERE oqituvchi_id=$1 AND fan_id<>$2 LIMIT 1', [id, v[4]])).rowCount)
      return bad(res, "Bu o'qituvchi boshqa fan guruhlarida dars beradi. Avval o'sha guruhlarni o'zgartiring", 409);
    const sets = 'ism=$1,familiya=$2,telefon=$3,faol=$4' + (withFan ? ',fan_id=$5' : '');
    try {
      const q = await pool.query(`UPDATE ${table} SET ${sets} WHERE id=$${v.length + 1}`, [...v, id]);
      if (q.rowCount) await syncNofaol(id);
      q.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
    } catch (e) { if (e.code === '23503') return bad(res, 'Fan topilmadi'); throw e; }
  }));
  r.delete('/:id', wrap(async (req, res) => {
    const q = await pool.query(`DELETE FROM ${table} WHERE id=$1`, [int(req.params.id) || 0]);
    q.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
  }));
  return r;
}
router.use('/oqituvchilar', person('oqituvchilar', true));
router.use('/oquvchilar', person('oquvchilar', false));

// ═══ GURUHLAR ════════════════════════════════════════════════════════════════
router.get('/guruhlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT g.*, to_char(g.boshlanish, 'YYYY-MM-DD') AS boshlanish,
           g.oylik_narx::float AS oylik_narx,
           f.nomi AS fan_nomi, TRIM(o.familiya||' '||o.ism) AS oqituvchi_nomi,
           (SELECT COUNT(*)::int FROM guruh_oquvchilari x WHERE x.guruh_id=g.id) AS oquvchilar_soni
      FROM guruhlar g
      JOIN fanlar f ON f.id=g.fan_id
      LEFT JOIN oqituvchilar o ON o.id=g.oqituvchi_id
     ORDER BY g.id DESC`);
  res.json({ ok: true, guruhlar: r.rows });
}));

// Dars jadvali: kunlar (1=Du … 7=Yak) + boshlanish vaqti (HH:MM). `jadval` matni ulardan hosil bo'ladi (masalan: Du-Chor-Ju 19:00).
const KUN = ['Du', 'Se', 'Chor', 'Pay', 'Ju', 'Sha', 'Yak'];
const SOAT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function guruhBody(b) {
  const nomi = str(b.nomi, 200), fan = int(b.fan_id), max = int(b.max_oquvchi) || 20;
  if (!nomi) return { err: 'Guruh nomi majburiy' };
  if (!fan) return { err: 'Fanni tanlang' };
  const holat = ['ochiq', 'boshlangan', 'yopilgan'].includes(b.holat) ? b.holat : 'ochiq';
  if (b.boshlanish && !date(b.boshlanish)) return { err: "Boshlanish sanasi noto'g'ri" };
  const kunlar = [...new Set((Array.isArray(b.kunlar) ? b.kunlar : []).map(Number))].sort((x, y) => x - y);
  if (kunlar.some(k => !Number.isInteger(k) || k < 1 || k > 7)) return { err: "Dars kunlari noto'g'ri" };
  const soat = str(b.soat, 5);
  if (soat && !SOAT_RE.test(soat)) return { err: "Dars vaqti noto'g'ri" };
  const narx = num(b.oylik_narx);
  if (narx == null || narx < 0 || narx > 999999999999) return { err: "Oylik to'lov narxini to'g'ri kiriting" };
  if (kunlar.length && !soat) return { err: 'Dars vaqtini tanlang' };
  if (soat && !kunlar.length) return { err: 'Dars kunlarini tanlang' };
  const jadval = kunlar.length ? kunlar.map(k => KUN[k - 1]).join('-') + ' ' + soat : '';
  return { v: [nomi, fan, int(b.oqituvchi_id), jadval, kunlar, soat || null, date(b.boshlanish), max, holat, narx] };
}
// O'qituvchi faqat o'z fani bo'yicha guruhga biriktiriladi
async function oqituvchiXato(fan, tid) {
  if (!tid) return null;
  const r = await pool.query('SELECT fan_id FROM oqituvchilar WHERE id=$1', [tid]);
  if (!r.rowCount) return "O'qituvchi topilmadi";
  return r.rows[0].fan_id === fan ? null : "Bu o'qituvchi tanlangan fan bo'yicha dars bermaydi";
}
const fkErr = (e, res) => e.code === '23503' ? bad(res, "Fan yoki o'qituvchi topilmadi") : null;
router.post('/guruhlar', wrap(async (req, res) => {
  const { err, v } = guruhBody(req.body); if (err) return bad(res, err);
  const oe = await oqituvchiXato(v[1], v[2]); if (oe) return bad(res, oe);
  try {
    const r = await pool.query('INSERT INTO guruhlar(nomi,fan_id,oqituvchi_id,jadval,kunlar,soat,boshlanish,max_oquvchi,holat,oylik_narx) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', v);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { if (!fkErr(e, res)) throw e; }
}));
router.put('/guruhlar/:id', wrap(async (req, res) => {
  const { err, v } = guruhBody(req.body); if (err) return bad(res, err);
  const oe = await oqituvchiXato(v[1], v[2]); if (oe) return bad(res, oe);
  try {
    const r = await pool.query('UPDATE guruhlar SET nomi=$1,fan_id=$2,oqituvchi_id=$3,jadval=$4,kunlar=$5,soat=$6,boshlanish=$7,max_oquvchi=$8,holat=$9,oylik_narx=$10 WHERE id=$11', [...v, req.params.id]);
    r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
  } catch (e) { if (!fkErr(e, res)) throw e; }
}));
router.delete('/guruhlar/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM guruhlar WHERE id=$1', [req.params.id]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));

// Guruh o'quvchilari
router.get('/guruhlar/:id/oquvchilar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT o.id, o.ism, o.familiya, o.telefon, x.qoshilgan
      FROM guruh_oquvchilari x JOIN oquvchilar o ON o.id=x.oquvchi_id
     WHERE x.guruh_id=$1 ORDER BY o.familiya, o.ism`, [req.params.id]);
  res.json({ ok: true, items: r.rows });
}));
router.post('/guruhlar/:id/oquvchilar', wrap(async (req, res) => {
  const oid = int(req.body.oquvchi_id); if (!oid) return bad(res, "O'quvchini tanlang");
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const g = await c.query('SELECT max_oquvchi FROM guruhlar WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!g.rowCount) { await c.query('ROLLBACK'); return bad(res, 'Guruh topilmadi', 404); }
    const n = await c.query('SELECT COUNT(*)::int AS n FROM guruh_oquvchilari WHERE guruh_id=$1', [req.params.id]);
    if (n.rows[0].n >= g.rows[0].max_oquvchi) { await c.query('ROLLBACK'); return bad(res, "Guruh to'lgan", 409); }
    await c.query('INSERT INTO guruh_oquvchilari(guruh_id,oquvchi_id) VALUES($1,$2)', [req.params.id, oid]);
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
  const r = await pool.query('DELETE FROM guruh_oquvchilari WHERE guruh_id=$1 AND oquvchi_id=$2', [req.params.id, req.params.oid]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));

// ═══ DAVOMAT (admin belgilaydi) ═════════════════════════════════════════════
const DAVOMAT_HOLAT = ['keldi', 'kelmadi', 'sababli'];
// Tanlangan kun davomati: guruhdagi har bir o'quvchi + belgilangan holat (yoki null)
router.get('/guruhlar/:id/davomat', wrap(async (req, res) => {
  const gid = int(req.params.id); if (!gid) return bad(res, "Noto'g'ri guruh");
  const sana = req.query.sana ? realDate(req.query.sana) : todayISO();
  if (!sana) return bad(res, "Sana noto'g'ri");
  if (!(await pool.query('SELECT 1 FROM guruhlar WHERE id=$1', [gid])).rowCount) return bad(res, 'Guruh topilmadi', 404);
  const r = await pool.query(`
    SELECT o.id, o.ism, o.familiya, o.telefon, d.holat
      FROM guruh_oquvchilari x
      JOIN oquvchilar o ON o.id=x.oquvchi_id
      LEFT JOIN davomat d ON d.guruh_id=x.guruh_id AND d.oquvchi_id=o.id AND d.sana=$2::date
     WHERE x.guruh_id=$1 ORDER BY o.familiya, o.ism`, [gid, sana]);
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
  if (!(await pool.query('SELECT 1 FROM guruhlar WHERE id=$1', [gid])).rowCount) return bad(res, 'Guruh topilmadi', 404);
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
     WHERE EXISTS (SELECT 1 FROM guruh_oquvchilari go WHERE go.guruh_id=$1::int AND go.oquvchi_id=x.oid)
    ON CONFLICT (guruh_id, oquvchi_id, sana) DO UPDATE SET holat=EXCLUDED.holat, yangilangan=NOW()`,
    [gid, sana, ids, hol]);
  res.json({ ok: true, saqlandi: r.rowCount });
}));

// ═══ LIDLAR (botdan kelgan «kursga yozilish» arizalari) ══════════════════════
const LID_HOLAT = ['yangi', 'aloqada', 'yozildi', 'rad'];
router.get('/lidlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT l.id, l.ism, l.telefon, l.username, l.telegram_id::text AS telegram_id, l.holat, l.izoh, l.yaratilgan,
           l.fan_nomi, l.guruh_nomi, l.guruh_id, l.oquvchi_id,
           g.jadval, g.oylik_narx::float AS oylik_narx, TRIM(CONCAT(q.familiya, ' ', q.ism)) AS oqituvchi_nomi
      FROM lidlar l
      LEFT JOIN guruhlar g ON g.id=l.guruh_id
      LEFT JOIN oqituvchilar q ON q.id=g.oqituvchi_id
     ORDER BY (l.holat='yangi') DESC, l.id DESC LIMIT 1000`);
  res.json({ ok: true, items: r.rows });
}));
router.put('/lidlar/:id', wrap(async (req, res) => {
  const b = req.body || {}, id = int(req.params.id) || 0;
  if (!LID_HOLAT.includes(b.holat)) return bad(res, "Holat noto'g'ri");
  const r = await pool.query('UPDATE lidlar SET holat=$1, izoh=$2 WHERE id=$3', [b.holat, str(b.izoh, 2000), id]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
router.delete('/lidlar/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM lidlar WHERE id=$1', [int(req.params.id) || 0]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
// Lidni o'quvchiga aylantirish: yangi o'quvchi yaratiladi va (guruh hali bor bo'lsa) shu guruhga qo'shiladi. Lid «Yozildi» bo'ladi.
router.post('/lidlar/:id/oquvchi', wrap(async (req, res) => {
  const id = int(req.params.id) || 0;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const l = await c.query('SELECT * FROM lidlar WHERE id=$1 FOR UPDATE', [id]);
    if (!l.rowCount) { await c.query('ROLLBACK'); return bad(res, 'Topilmadi', 404); }
    const lid = l.rows[0];
    if (lid.oquvchi_id) { await c.query('ROLLBACK'); return bad(res, "Bu lid allaqachon o'quvchiga aylantirilgan", 409); }
    if (lid.guruh_id) { // guruhni qulflab, joy borligini tekshiramiz
      const g = await c.query('SELECT max_oquvchi FROM guruhlar WHERE id=$1 FOR UPDATE', [lid.guruh_id]);
      const n = await c.query('SELECT COUNT(*)::int AS n FROM guruh_oquvchilari WHERE guruh_id=$1', [lid.guruh_id]);
      if (g.rowCount && n.rows[0].n >= g.rows[0].max_oquvchi) { await c.query('ROLLBACK'); return bad(res, "Guruh to'lgan", 409); }
    }
    const parts = lid.ism.split(/\s+/);               // «Ali Valiyev» → ism=Ali, familiya=Valiyev
    const o = await c.query('INSERT INTO oquvchilar(ism,familiya,telefon) VALUES($1,$2,$3) RETURNING id',
      [parts[0], parts.slice(1).join(' '), lid.telefon]);
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
      FROM vakansiyalar v LEFT JOIN fanlar f ON f.id=v.fan_id ORDER BY v.id DESC`);
  res.json({ ok: true, items: r.rows });
}));
function vakBody(b) {
  const nomi = str(b.nomi, 200); if (!nomi) return { err: 'Vakansiya nomi majburiy' };
  return { v: [nomi, int(b.fan_id), str(b.tavsif, 3000), str(b.talablar, 3000), str(b.maosh, 200), b.faol !== false] };
}
router.post('/vakansiyalar', wrap(async (req, res) => {
  const { err, v } = vakBody(req.body); if (err) return bad(res, err);
  try {
    const r = await pool.query('INSERT INTO vakansiyalar(nomi,fan_id,tavsif,talablar,maosh,faol) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', v);
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { if (e.code === '23503') return bad(res, 'Fan topilmadi'); throw e; }
}));
router.put('/vakansiyalar/:id', wrap(async (req, res) => {
  const { err, v } = vakBody(req.body); if (err) return bad(res, err);
  try {
    const r = await pool.query('UPDATE vakansiyalar SET nomi=$1,fan_id=$2,tavsif=$3,talablar=$4,maosh=$5,faol=$6 WHERE id=$7', [...v, int(req.params.id) || 0]);
    r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
  } catch (e) { if (e.code === '23503') return bad(res, 'Fan topilmadi'); throw e; }
}));
router.delete('/vakansiyalar/:id', wrap(async (req, res) => { // nomzodlar qoladi (vakansiya nomi nusxasi bilan)
  const r = await pool.query('DELETE FROM vakansiyalar WHERE id=$1', [int(req.params.id) || 0]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));

// ═══ NOMZODLAR (vakansiyaga botdan kelgan arizalar) ══════════════════════════
const NOMZOD_HOLAT = ['yangi', 'korildi', 'suhbat', 'qabul', 'rad'];
router.get('/nomzodlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT id, vakansiya_id, vakansiya_nomi, ism, telefon, tajriba, username, telegram_id::text AS telegram_id,
           (rezyume_file_id IS NOT NULL) AS rezyume_bor, rezyume_nomi, holat, izoh, yaratilgan
      FROM nomzodlar ORDER BY (holat='yangi') DESC, id DESC LIMIT 1000`);
  res.json({ ok: true, items: r.rows });
}));
router.put('/nomzodlar/:id', wrap(async (req, res) => {
  const b = req.body || {};
  if (!NOMZOD_HOLAT.includes(b.holat)) return bad(res, "Holat noto'g'ri");
  const r = await pool.query('UPDATE nomzodlar SET holat=$1, izoh=$2 WHERE id=$3', [b.holat, str(b.izoh, 2000), int(req.params.id) || 0]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
router.delete('/nomzodlar/:id', wrap(async (req, res) => {
  const r = await pool.query('DELETE FROM nomzodlar WHERE id=$1', [int(req.params.id) || 0]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));
// Rezyume: faylni Telegram saqlaydi (file_id). Bot tokeni bilan yuklab olib, adminga beramiz (Telegram limiti — 20 MB).
router.get('/nomzodlar/:id/rezyume', wrap(async (req, res) => {
  const r = await pool.query('SELECT rezyume_file_id, rezyume_nomi FROM nomzodlar WHERE id=$1', [int(req.params.id) || 0]);
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
     ORDER BY t.sana DESC, t.id DESC LIMIT 1000`);
  res.json({ ok: true, items: r.rows });
}));
router.post('/tolovlar', wrap(async (req, res) => {
  const b = req.body, oid = int(b.oquvchi_id), summa = num(b.summa);
  if (!oid) return bad(res, "O'quvchini tanlang");
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
  const r = await pool.query('DELETE FROM tolovlar WHERE id=$1', [req.params.id]);
  r.rowCount ? res.json({ ok: true }) : bad(res, 'Topilmadi', 404);
}));

// ═══ OYLIK TO'LOVLAR REESTRI ═════════════════════════════════════════════════
// Har bir qator = (guruh, o'quvchi) tanlangan oy uchun. Narx = guruhning oylik narxi, "to'lov qildi" = shu oydagi to'lovlar yig'indisi.
// O'quvchi oyda ko'rinadi, agar: guruhga shu oy tugamasidan oldin qo'shilgan, guruh shu oy tugamasidan oldin boshlangan va
// (hozir faol YOKI nofaol qilingan sana shu oydan KEYIN). Ya'ni dekabrda nofaol qilingan o'quvchi noyabrda ko'rinadi, dekabrda yo'q.
const OY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const oyOk = v => OY_RE.test(String(v || '')) && String(v) <= todayISO().slice(0, 7); // kelajak oylari yo'q
const USULLAR = ['naqd', 'karta', 'otkazma'];
const holatOf = (narx, tolangan) => (tolangan <= 0 ? 'yoq' : narx > 0 && tolangan < narx ? 'qisman' : 'tolagan');

async function reestrRows(oy) {
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
     WHERE (x.qoshilgan AT TIME ZONE 'Asia/Tashkent')::date < ($1::date + INTERVAL '1 month')
       AND (g.boshlanish IS NULL OR g.boshlanish < ($1::date + INTERVAL '1 month'))
       AND (o.faol OR o.nofaol_sana >= ($1::date + INTERVAL '1 month'))
     ORDER BY g.nomi, o.familiya, o.ism`, [bosh]);
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
  res.json({ ok: true, oy: req.query.oy, items: await reestrRows(req.query.oy) });
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
  if (!(await pool.query('SELECT 1 FROM guruh_oquvchilari WHERE guruh_id=$1 AND oquvchi_id=$2', [gid, oid])).rowCount)
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
  const rows = reestrFilter(await reestrRows(oy), req.query).map(x => (usulQ ? { ...x, tolangan: x.usul_summa[usulQ] } : x));
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

// ═══ STATISTIKA ══════════════════════════════════════════════════════════════
router.get('/stats', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM fanlar WHERE faol)         AS fanlar,
      (SELECT COUNT(*)::int FROM guruhlar WHERE holat<>'yopilgan') AS guruhlar,
      (SELECT COUNT(*)::int FROM oquvchilar WHERE faol)     AS oquvchilar,
      (SELECT COUNT(*)::int FROM oqituvchilar WHERE faol)   AS oqituvchilar,
      (SELECT COALESCE(SUM(summa),0)::float FROM tolovlar
        WHERE date_trunc('month',sana)=date_trunc('month',CURRENT_DATE)) AS oy_tushum,
      (SELECT COALESCE(SUM(summa),0)::float FROM tolovlar) AS jami_tushum,
      (SELECT COUNT(*)::int FROM kurs_adminlar WHERE faol)  AS kurs_adminlar,
      (SELECT COUNT(*)::int FROM lidlar WHERE holat='yangi')    AS yangi_lidlar,
      (SELECT COUNT(*)::int FROM nomzodlar WHERE holat='yangi') AS yangi_nomzodlar,
      (SELECT COUNT(*)::int FROM vakansiyalar WHERE faol)       AS vakansiyalar`);
  res.json({ ok: true, stats: r.rows[0] });
}));

module.exports = router;
