// Kichik yordamchilar: kiritishni tozalash va xatolik javoblari
const str = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const int = v => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
const num = v => (v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const tgId = v => { const s = String(v == null ? '' : v).trim(); return /^\d{1,15}$/.test(s) && Number(s) > 0 ? s : null; };
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
// Telefon: bo'sh joy, qavs, chiziqchalar olib tashlanadi; 9–15 raqam (ixtiyoriy boshidagi +). Noto'g'ri bo'lsa null.
const phone = v => { const s = String(v == null ? '' : v).replace(/[\s()\-.]/g, ''); return /^\+?\d{9,15}$/.test(s) ? s : null; };
const bad = (res, msg, code = 400) => res.status(code).json({ ok: false, error: msg });
// async handler: xatoni Express error handler'ga uzatadi
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// «Bugun» — doim Toshkent vaqti bilan (server/baza vaqt mintaqasiga bog'liq emas)
const todayISO = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
module.exports = { str, int, num, tgId, phone, date, bad, wrap, todayISO };
