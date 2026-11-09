// ─── O'quv markaz rahbari (superadmin): BARCHA filiallar bo'yicha jamlama va ro'yxatlar ───────────────────────────
//  GET /api/rahbar/jamlama?oy=YYYY-MM        — filiallar kesimida tushum, yig'ilish, qarz, o'qituvchi haqi, natija
//  GET /api/rahbar/oyliklar?oy=YYYY-MM       — barcha filial o'qituvchilarining oyligi (+ /excel)
//  POST /api/rahbar/oyliklar/muzlat | /och      — oyni tasdiqlash (muzlatish) / qayta ochish
//  POST /api/rahbar/oyliklar/tolov, DELETE /oyliklar/tolov/:id — o'qituvchiga haqiqatda to'langan haq (faqat tasdiqlangan oy)
//  GET /api/rahbar/audit                     — audit jurnali (kim, qachon, nimani o'zgartirdi)
//  GET /api/rahbar/vakansiyalar | /nomzodlar | /fanlar — barcha filiallar (har qatorda filial_id va filial_nomi)
// Ma'lumotni o'zgartirish (vakansiya/nomzod tahriri va h.k.) filial bo'yicha mavjud routelar orqali, X-Filial-Id sarlavhasi bilan bajariladi.
// Hisob-kitob panel.js dagi bir xil funksiyalardan olinadi — filial paneli va jamlamada ikki xil son chiqmasin.
const { Router } = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/jwt');
const { bad, wrap, int, num, str, date, todayISO } = require('../util');
const audit = require('../audit');
const panel = require('./panel');

const { reestrRows, rejaHisobot, oqituvchiHisobot, oqituvchiHisobotJonli, oyOk } = panel.helpers;
const router = Router();
router.use(requireAuth(['superadmin']));

const round2 = n => Math.round(n * 100) / 100;
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
const OY = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

async function filiallar() {
  return (await pool.query('SELECT id, nomi, faol FROM filiallar ORDER BY id')).rows;
}

router.get('/jamlama', wrap(async (req, res) => {
  const oy = String(req.query.oy || '');
  if (!oyOk(oy)) return bad(res, "Oy noto'g'ri (kelajak oyini ko'rib bo'lmaydi)");
  const bosh = oy + '-01';
  const base = await pool.query(`
    SELECT f.id, f.nomi, f.faol,
      (SELECT COUNT(*)::int FROM kurs_adminlar a WHERE a.filial_id=f.id AND a.faol)         AS adminlar,
      (SELECT COUNT(*)::int FROM guruhlar g WHERE g.filial_id=f.id AND g.holat<>'yopilgan') AS guruhlar,
      (SELECT COUNT(*)::int FROM oquvchilar o WHERE o.filial_id=f.id AND o.faol)            AS oquvchilar,
      (SELECT COUNT(*)::int FROM oqituvchilar q WHERE q.filial_id=f.id AND q.faol)          AS oqituvchilar,
      (SELECT COALESCE(SUM(t.summa),0)::float FROM tolovlar t JOIN oquvchilar o ON o.id=t.oquvchi_id
        WHERE o.filial_id=f.id AND t.sana >= $1::date AND t.sana < ($1::date + INTERVAL '1 month')) AS tushum,
      (SELECT COUNT(*)::int FROM lidlar l WHERE l.filial_id=f.id AND l.holat='yangi')       AS yangi_lidlar,
      (SELECT COUNT(*)::int FROM nomzodlar n WHERE n.filial_id=f.id AND n.holat='yangi')    AS yangi_nomzodlar
      FROM filiallar f ORDER BY f.id`, [bosh]);
  const items = await Promise.all(base.rows.map(async f => {
    const [reja, oylik] = await Promise.all([reestrRows(oy, f.id).then(rejaHisobot), oqituvchiHisobot(oy, f.id)]);
    return { ...f,
      reja: reja.reja, tolangan: reja.tolangan, qarz: round2(reja.qisman_qarz + reja.yoq_qarz), qarzdor: reja.oquvchi.qisman + reja.oquvchi.yoq, yigilish: reja.yigilish,
      oylik: oylik.jami, haq_belgilanmagan: oylik.items.filter(x => !x.haq_turi).length, oylik_muzlatilgan: !!oylik.muzlatilgan,
      natija: round2(f.tushum - oylik.jami) };
  }));
  const reja = sum(items, x => x.reja), tolangan = sum(items, x => x.tolangan);
  const jami = {
    filiallar: items.filter(x => x.faol).length, oquvchilar: sum(items, x => x.oquvchilar), guruhlar: sum(items, x => x.guruhlar), oqituvchilar: sum(items, x => x.oqituvchilar),
    tushum: round2(sum(items, x => x.tushum)), reja: round2(reja), tolangan: round2(tolangan), qarz: round2(sum(items, x => x.qarz)), qarzdor: sum(items, x => x.qarzdor),
    yigilish: reja > 0 ? Math.round(tolangan / reja * 1000) / 10 : null,
    oylik: round2(sum(items, x => x.oylik)), haq_belgilanmagan: sum(items, x => x.haq_belgilanmagan), natija: round2(sum(items, x => x.natija)),
    yangi_lidlar: sum(items, x => x.yangi_lidlar), yangi_nomzodlar: sum(items, x => x.yangi_nomzodlar),
  };
  res.json({ ok: true, oy, items, jami });
}));

// Barcha filial o'qituvchilari oyligi: har filial uchun panel hisobotining o'zi (o'qituvchi qatorlariga filial qo'shiladi)
async function oyliklar(oy) {
  const fl = await filiallar();
  const [per, tol] = await Promise.all([
    Promise.all(fl.map(async f => ({ f, h: await oqituvchiHisobot(oy, f.id) }))),
    pool.query(`SELECT id, filial_id, oqituvchi_id, oqituvchi_nomi, summa::float AS summa, to_char(sana,'YYYY-MM-DD') AS sana, usul, izoh, kiritgan
                  FROM oylik_tolovlar WHERE oy=$1::date ORDER BY sana, id`, [oy + '-01']),
  ]);
  const byT = new Map();
  for (const x of tol.rows) { const k = x.filial_id + '_' + x.oqituvchi_id; if (!byT.has(k)) byT.set(k, []); byT.get(k).push(x); }
  const items = per.flatMap(({ f, h }) => h.items.map(x => {
    const tolovlar = byT.get(f.id + '_' + x.id) || [], tolangan = round2(sum(tolovlar, t => t.summa));
    return { ...x, filial_id: f.id, filial_nomi: f.nomi, tolovlar, tolangan, qoldiq: round2(Math.max(x.summa - tolangan, 0)),
      haq_holat: !h.muzlatilgan || x.summa <= 0 ? null : tolangan >= x.summa ? 'tolangan' : tolangan > 0 ? 'qisman' : 'yoq' };
  }));
  const filialJami = per.map(({ f, h }) => {
    const mine = items.filter(x => x.filial_id === f.id);
    return { id: f.id, nomi: f.nomi, faol: f.faol, jami: h.jami, oqituvchilar: h.items.length, muzlatilgan: !!h.muzlatilgan, yopilgan: h.yopilgan || null, tasdiqladi: h.tasdiqladi || '',
      tolangan: round2(sum(mine, x => x.tolangan)), qoldiq: round2(sum(mine, x => x.qoldiq)) };
  });
  return { oy, items, filiallar: filialJami, jami: sum(items, x => x.summa), tolangan: round2(sum(items, x => x.tolangan)), qoldiq: round2(sum(items, x => x.qoldiq)) };
}
router.get('/oyliklar', wrap(async (req, res) => {
  if (!oyOk(req.query.oy)) return bad(res, "Oy noto'g'ri (kelajak oyini ko'rib bo'lmaydi)");
  res.json({ ok: true, ...(await oyliklar(req.query.oy)) });
}));
router.get('/oyliklar/excel', wrap(async (req, res) => {
  const oy = String(req.query.oy || '');
  if (!oyOk(oy)) return bad(res, "Oy noto'g'ri (kelajak oyini ko'rib bo'lmaydi)");
  const h = await oyliklar(oy);
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const TUR = { soatbay: 'Soatbay', oylik: 'Oylik', foiz: 'Foiz' };
  const stavka = x => (x.haq_turi === 'soatbay' ? x.soat_stavka : x.haq_turi === 'oylik' ? x.oylik_maosh : x.haq_turi === 'foiz' ? x.foiz / 100 : null);
  const style = ws => {
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.alignment = { vertical: 'middle', wrapText: true };
    head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F54' } }; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const ws = wb.addWorksheet('Oyliklar');
  ws.columns = [
    { header: '№', key: 'n', width: 5 }, { header: 'Filial', key: 'fl', width: 20 }, { header: "O'qituvchi", key: 'oq', width: 28 }, { header: 'Fan', key: 'fan', width: 20 },
    { header: "To'lov turi", key: 'tur', width: 12 }, { header: 'Stavka', key: 'st', width: 16 }, { header: 'Darslar soni', key: 'dr', width: 12 }, { header: 'Soat', key: 'soat', width: 10 },
    { header: "Guruhlarga tushgan to'lov", key: 'tush', width: 22 }, { header: 'Hisoblangan summa', key: 'sum', width: 20 }, { header: "To'langan", key: 'tol', width: 16 }, { header: 'Qoldiq', key: 'qol', width: 16 },
    { header: 'Oy holati', key: 'hol', width: 16 }, { header: 'Eslatma', key: 'og', width: 44 },
  ];
  const HOLAT = new Map(h.filiallar.map(f => [f.id, f.muzlatilgan ? 'Tasdiqlangan' : 'Jonli hisob']));
  h.items.forEach((x, i) => {
    const r = ws.addRow({ n: i + 1, fl: x.filial_nomi, oq: `${x.familiya} ${x.ism}`.trim() + (x.faol ? '' : ' (nofaol)'), fan: x.fan_nomi, tur: TUR[x.haq_turi] || 'Belgilanmagan',
      st: stavka(x), dr: x.darslar, soat: x.soat, tush: x.tushum, sum: x.summa, tol: x.tolangan, qol: x.qoldiq, hol: HOLAT.get(x.filial_id), og: x.ogohlantirish.join('; ') });
    r.getCell('st').numFmt = x.haq_turi === 'foiz' ? '0.##%' : '#,##0';
  });
  ws.addRow({ oq: 'JAMI', tush: sum(h.items, x => x.tushum), sum: h.jami, tol: h.tolangan, qol: h.qoldiq }).font = { bold: true };
  ['tush', 'sum', 'tol', 'qol'].forEach(k => { ws.getColumn(k).numFmt = '#,##0'; });
  style(ws);
  const w2 = wb.addWorksheet('Filiallar bo\'yicha');
  w2.columns = [{ header: 'Filial', key: 'fl', width: 24 }, { header: "O'qituvchilar", key: 'oq', width: 14 }, { header: 'Jami oylik', key: 'sum', width: 18 }];
  h.filiallar.forEach(f => w2.addRow({ fl: f.nomi, oq: f.oqituvchilar, sum: f.jami }));
  w2.addRow({ fl: 'JAMI', oq: sum(h.filiallar, x => x.oqituvchilar), sum: h.jami }).font = { bold: true };
  w2.getColumn('sum').numFmt = '#,##0';
  style(w2);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="oyliklar-barcha-filiallar-${oy}.xlsx"`);
  res.setHeader('X-Oy-Nomi', encodeURIComponent(`${OY[Number(oy.slice(5)) - 1]} ${oy.slice(0, 4)}`));
  await wb.xlsx.write(res);
  res.end();
}));

// ── Oyni tasdiqlash (muzlatish) ──────────────────────────────────────────────────────────────────────────────
// Tasdiqlangan oyning hisoboti suratga olinadi: keyin o'qituvchi, stavka yoki guruh o'zgarsa ham eski oy o'zgarmaydi.
// Faqat tugagan oyni tasdiqlash mumkin. Haq belgilanmagan o'qituvchi va boshqa ogohlantirishlar bo'lsa, avval ularni tuzatish (yoki majbur=true) kerak.
const realDate = v => { const x = date(v); if (!x) return null; const d = new Date(x + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === x ? x : null; };
async function filialOf(id) { return id ? (await pool.query('SELECT id, nomi FROM filiallar WHERE id=$1', [id])).rows[0] : null; }
router.post('/oyliklar/muzlat', wrap(async (req, res) => {
  const b = req.body || {}, oy = String(b.oy || ''), f = await filialOf(int(b.filial_id));
  if (!f) return bad(res, 'Filialni tanlang', 404);
  if (!oyOk(oy)) return bad(res, "Oy noto'g'ri");
  if (oy >= todayISO().slice(0, 7)) return bad(res, "Faqat tugagan oyni tasdiqlash mumkin (joriy oy hali tugamagan)", 409);
  if ((await pool.query('SELECT 1 FROM oylik_oylar WHERE filial_id=$1 AND oy=$2::date', [f.id, oy + '-01'])).rowCount) return bad(res, 'Bu oy allaqachon tasdiqlangan', 409);
  const live = await oqituvchiHisobotJonli(oy, f.id);
  const warn = live.items.filter(x => x.ogohlantirish.length).map(x => ({ oqituvchi: `${x.familiya} ${x.ism}`.trim(), matn: x.ogohlantirish.join('; ') }));
  if (warn.length && b.majbur !== true)
    return res.status(409).json({ ok: false, error: `${warn.length} ta o'qituvchida ogohlantirish bor — avval tuzating yoki baribir tasdiqlang`, ogohlantirishlar: warn, majbur_mumkin: true });
  const r = await pool.query(`INSERT INTO oylik_oylar(filial_id, oy, jami, snapshot, tasdiqladi) VALUES($1,$2::date,$3,$4,$5) ON CONFLICT (filial_id, oy) DO NOTHING RETURNING yopilgan`,
    [f.id, oy + '-01', live.jami, JSON.stringify({ oy, items: live.items, jami: live.jami }), req.user.ism || '']);
  if (!r.rowCount) return bad(res, 'Bu oy allaqachon tasdiqlangan', 409);
  await audit.log(req, { amal: 'muzlatdi', obyekt: 'oylik', filial_id: f.id, filial_nomi: f.nomi, tavsif: `${oy} oyi o'qituvchi oyliklari tasdiqlandi: ${live.jami} so'm`,
    yangi: { oy, jami: live.jami, oqituvchilar: live.items.length, ogohlantirish_bilan: warn.length > 0 } });
  res.json({ ok: true, jami: live.jami });
}));
router.post('/oyliklar/och', wrap(async (req, res) => {
  const b = req.body || {}, oy = String(b.oy || ''), f = await filialOf(int(b.filial_id)), sabab = str(b.sabab, 500);
  if (!f) return bad(res, 'Filialni tanlang', 404);
  if (!oyOk(oy)) return bad(res, "Oy noto'g'ri");
  if (sabab.length < 3) return bad(res, "Oyni qayta ochish sababini yozing (kamida 3 belgi)");
  const cur = (await pool.query('SELECT jami::float AS jami FROM oylik_oylar WHERE filial_id=$1 AND oy=$2::date', [f.id, oy + '-01'])).rows[0];
  if (!cur) return bad(res, 'Bu oy tasdiqlanmagan', 404);
  if ((await pool.query('SELECT 1 FROM oylik_tolovlar WHERE filial_id=$1 AND oy=$2::date LIMIT 1', [f.id, oy + '-01'])).rowCount)
    return bad(res, "Bu oy uchun o'qituvchilarga haq to'langan. Avval to'lov yozuvlarini o'chiring", 409);
  await pool.query('DELETE FROM oylik_oylar WHERE filial_id=$1 AND oy=$2::date', [f.id, oy + '-01']);
  await audit.log(req, { amal: 'qayta_ochdi', obyekt: 'oylik', filial_id: f.id, filial_nomi: f.nomi, tavsif: `${oy} oyi oyliklari qayta ochildi. Sabab: ${sabab}`, eski: { oy, jami: cur.jami }, yangi: { sabab } });
  res.json({ ok: true });
}));

// ── O'qituvchiga to'langan haq (faqat tasdiqlangan oy uchun) ──
router.post('/oyliklar/tolov', wrap(async (req, res) => {
  const b = req.body || {}, oy = String(b.oy || ''), f = await filialOf(int(b.filial_id)), tid = int(b.oqituvchi_id), summa = num(b.summa);
  if (!f) return bad(res, 'Filialni tanlang', 404);
  if (!oyOk(oy)) return bad(res, "Oy noto'g'ri");
  if (!tid) return bad(res, "O'qituvchini tanlang");
  if (summa == null || summa <= 0 || summa > 999999999999) return bad(res, "Summa noto'g'ri");
  if (b.sana && !realDate(b.sana)) return bad(res, "Sana noto'g'ri");
  if (b.sana && b.sana > todayISO()) return bad(res, "Kelajak sanasi bilan to'lov kiritib bo'lmaydi");
  const usul = ['naqd', 'karta', 'otkazma'].includes(b.usul) ? b.usul : 'naqd';
  const snap = (await pool.query('SELECT snapshot FROM oylik_oylar WHERE filial_id=$1 AND oy=$2::date', [f.id, oy + '-01'])).rows[0];
  if (!snap) return bad(res, "Avval oyni tasdiqlang — haq faqat tasdiqlangan oy uchun to'lanadi", 409);
  const it = snap.snapshot.items.find(x => x.id === tid);
  if (!it) return bad(res, "Bu o'qituvchi shu oy hisobotida yo'q", 404);
  const nomi = `${it.familiya} ${it.ism}`.trim();
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT 1 FROM oylik_oylar WHERE filial_id=$1 AND oy=$2::date FOR UPDATE', [f.id, oy + '-01']); // bir vaqtda ikki to'lov hisobdan oshib ketmasin
    const paid = (await c.query('SELECT COALESCE(SUM(summa),0)::float AS s FROM oylik_tolovlar WHERE filial_id=$1 AND oy=$2::date AND oqituvchi_id=$3', [f.id, oy + '-01', tid])).rows[0].s;
    if (paid + summa > it.summa + 0.005) { await c.query('ROLLBACK'); return bad(res, `Hisoblangan summadan oshib ketadi (qoldiq: ${round2(Math.max(it.summa - paid, 0))} so'm)`, 409); }
    const r = await c.query(`INSERT INTO oylik_tolovlar(filial_id, oy, oqituvchi_id, oqituvchi_nomi, summa, sana, usul, izoh, kiritgan) VALUES($1,$2::date,$3,$4,$5,$6::date,$7,$8,$9) RETURNING id`,
      [f.id, oy + '-01', tid, nomi, summa, b.sana || todayISO(), usul, str(b.izoh, 500), req.user.ism || '']);
    await c.query('COMMIT');
    await audit.log(req, { amal: 'yaratdi', obyekt: 'oylik', id: r.rows[0].id, filial_id: f.id, filial_nomi: f.nomi, tavsif: `O'qituvchiga haq to'landi: ${nomi} — ${summa} so'm (${oy})`,
      yangi: { oqituvchi_id: tid, oy, summa, sana: b.sana || todayISO(), usul } });
    res.json({ ok: true, id: r.rows[0].id });
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}));
router.delete('/oyliklar/tolov/:id', wrap(async (req, res) => {
  const id = int(req.params.id) || 0;
  const old = (await pool.query(`DELETE FROM oylik_tolovlar WHERE id=$1 RETURNING filial_id, to_char(oy,'YYYY-MM') AS oy, oqituvchi_id, oqituvchi_nomi, summa::float AS summa, to_char(sana,'YYYY-MM-DD') AS sana, usul, izoh`, [id])).rows[0];
  if (!old) return bad(res, 'Topilmadi', 404);
  await audit.log(req, { amal: 'ochirdi', obyekt: 'oylik', id, filial_id: old.filial_id, tavsif: `O'qituvchiga to'langan haq yozuvi o'chirildi: ${old.oqituvchi_nomi} — ${old.summa} so'm (${old.oy})`, eski: old });
  res.json({ ok: true });
}));

// ── Audit jurnali ──
const AUDIT_OBYEKT = ['tolov', 'oquvchi', 'oqituvchi', 'guruh', 'fan', 'lid', 'vakansiya', 'nomzod', 'admin', 'filial', 'kirish', 'oylik'];
const AUDIT_AMAL = ['yaratdi', 'ozgartirdi', 'ochirdi', 'kirdi', 'kira_olmadi', 'muzlatdi', 'qayta_ochdi'];
router.get('/audit', wrap(async (req, res) => {
  const q = req.query, w = [], p = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replace('?', '$' + p.length)); };
  if (int(q.filial_id)) add('filial_id = ?', int(q.filial_id));
  if (AUDIT_OBYEKT.includes(q.obyekt)) add('obyekt = ?', q.obyekt);
  if (AUDIT_AMAL.includes(q.amal)) add('amal = ?', q.amal);
  if (['superadmin', 'admin', 'tizim'].includes(q.aktor)) add('aktor_turi = ?', q.aktor);
  if (realDate(q.dan)) add("(vaqt AT TIME ZONE 'Asia/Tashkent')::date >= ?::date", q.dan);
  if (realDate(q.gacha)) add("(vaqt AT TIME ZONE 'Asia/Tashkent')::date <= ?::date", q.gacha);
  const text = str(q.q, 100);
  if (text) add("(tavsif ILIKE ? OR aktor_nomi ILIKE ?)".replace('?', '$' + (p.length + 1)).replace('?', '$' + (p.length + 1)), '%' + text.replace(/[%_\\]/g, m => '\\' + m) + '%');
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const limit = Math.min(Math.max(int(q.limit) || 50, 1), 200), offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  const [rows, total] = await Promise.all([
    pool.query(`SELECT id, vaqt, aktor_turi, aktor_id, aktor_nomi, filial_id, filial_nomi, amal, obyekt, obyekt_id, tavsif, eski, yangi, ip FROM audit_jurnali ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, p),
    pool.query(`SELECT COUNT(*)::int AS n FROM audit_jurnali ${where}`, p),
  ]);
  res.json({ ok: true, items: rows.rows, total: total.rows[0].n, limit, offset });
}));

router.get('/fanlar', wrap(async (req, res) => {
  const r = await pool.query(`SELECT f.id, f.nomi, f.faol, f.filial_id, fl.nomi AS filial_nomi FROM fanlar f JOIN filiallar fl ON fl.id=f.filial_id ORDER BY fl.id, f.nomi`);
  res.json({ ok: true, items: r.rows });
}));
router.get('/vakansiyalar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT v.*, f.nomi AS fan_nomi, fl.nomi AS filial_nomi, fl.faol AS filial_faol,
           (SELECT COUNT(*)::int FROM nomzodlar n WHERE n.vakansiya_id=v.id) AS nomzodlar_soni
      FROM vakansiyalar v LEFT JOIN fanlar f ON f.id=v.fan_id JOIN filiallar fl ON fl.id=v.filial_id ORDER BY v.id DESC`);
  res.json({ ok: true, items: r.rows });
}));
router.get('/nomzodlar', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT n.id, n.filial_id, fl.nomi AS filial_nomi, n.vakansiya_id, n.vakansiya_nomi, n.ism, n.telefon, n.tajriba, n.username, n.telegram_id::text AS telegram_id,
           (n.rezyume_file_id IS NOT NULL) AS rezyume_bor, n.rezyume_nomi, n.holat, n.izoh, n.yaratilgan
      FROM nomzodlar n JOIN filiallar fl ON fl.id=n.filial_id
     ORDER BY (n.holat='yangi') DESC, n.id DESC LIMIT 2000`);
  res.json({ ok: true, items: r.rows });
}));

module.exports = router;
