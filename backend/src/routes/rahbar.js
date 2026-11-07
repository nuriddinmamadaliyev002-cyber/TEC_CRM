// ─── O'quv markaz rahbari (superadmin): BARCHA filiallar bo'yicha jamlama va ro'yxatlar ───────────────────────────
//  GET /api/rahbar/jamlama?oy=YYYY-MM        — filiallar kesimida tushum, yig'ilish, qarz, o'qituvchi haqi, natija
//  GET /api/rahbar/oyliklar?oy=YYYY-MM       — barcha filial o'qituvchilarining oyligi (+ /excel)
//  GET /api/rahbar/vakansiyalar | /nomzodlar | /fanlar — barcha filiallar (har qatorda filial_id va filial_nomi)
// Ma'lumotni o'zgartirish (vakansiya/nomzod tahriri va h.k.) filial bo'yicha mavjud routelar orqali, X-Filial-Id sarlavhasi bilan bajariladi.
// Hisob-kitob panel.js dagi bir xil funksiyalardan olinadi — filial paneli va jamlamada ikki xil son chiqmasin.
const { Router } = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/jwt');
const { bad, wrap } = require('../util');
const panel = require('./panel');

const { reestrRows, rejaHisobot, oqituvchiHisobot, oyOk } = panel.helpers;
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
      oylik: oylik.jami, haq_belgilanmagan: oylik.items.filter(x => !x.haq_turi).length,
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
  const per = await Promise.all(fl.map(async f => ({ f, h: await oqituvchiHisobot(oy, f.id) })));
  const items = per.flatMap(({ f, h }) => h.items.map(x => ({ ...x, filial_id: f.id, filial_nomi: f.nomi })));
  const filialJami = per.map(({ f, h }) => ({ id: f.id, nomi: f.nomi, faol: f.faol, jami: h.jami, oqituvchilar: h.items.length }));
  return { oy, items, filiallar: filialJami, jami: sum(items, x => x.summa) };
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
    { header: "Guruhlarga tushgan to'lov", key: 'tush', width: 22 }, { header: 'Hisoblangan summa', key: 'sum', width: 20 }, { header: 'Eslatma', key: 'og', width: 44 },
  ];
  h.items.forEach((x, i) => {
    const r = ws.addRow({ n: i + 1, fl: x.filial_nomi, oq: `${x.familiya} ${x.ism}`.trim() + (x.faol ? '' : ' (nofaol)'), fan: x.fan_nomi, tur: TUR[x.haq_turi] || 'Belgilanmagan',
      st: stavka(x), dr: x.darslar, soat: x.soat, tush: x.tushum, sum: x.summa, og: x.ogohlantirish.join('; ') });
    r.getCell('st').numFmt = x.haq_turi === 'foiz' ? '0.##%' : '#,##0';
  });
  ws.addRow({ oq: 'JAMI', tush: sum(h.items, x => x.tushum), sum: h.jami }).font = { bold: true };
  ['tush', 'sum'].forEach(k => { ws.getColumn(k).numFmt = '#,##0'; });
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
