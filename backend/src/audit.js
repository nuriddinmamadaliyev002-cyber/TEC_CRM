// Audit jurnali: kim, qachon, nimani o'zgartirdi. Jurnalga yozish xatosi asosiy amalni to'xtatmaydi (faqat konsolga chiqadi).
const pool = require('./db');

// Maxfiy qiymat kalitlari (parolning o'zi, hash, token). «parol_almashtirildi» kabi belgi-kalitlar saqlanadi.
const SECRET_KEYS = /^(parol|password|passwd|token|secret)$|(^|_)hash$/i;
// JSON ga mos, maxfiy kalitlarsiz va hajmi cheklangan nusxa
function clean(o) {
  if (o == null) return null;
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (SECRET_KEYS.test(k) || v === undefined) continue;
    out[k] = typeof v === 'string' ? v.slice(0, 500) : v;
  }
  return Object.keys(out).length ? out : null;
}
const pick = (o, keys) => { const r = {}; if (o) for (const k of keys) if (k in o) r[k] = o[k]; return r; };
// Faqat o'zgargan maydonlar: { eski, yangi } yoki o'zgarish bo'lmasa null. Qiymatlar matn ko'rinishida solishtiriladi (Date/numeric farqlari chiqmasin).
function diff(a, b, keys) {
  const eski = {}, yangi = {};
  for (const k of keys) {
    const x = a ? a[k] : undefined, y = b ? b[k] : undefined;
    if (y === undefined) continue; // yangi qiymat berilmagan maydon o'zgarmagan hisoblanadi
    if (String(x == null ? '' : x) !== String(y == null ? '' : y)) { eski[k] = x == null ? null : x; yangi[k] = y == null ? null : y; }
  }
  return Object.keys(yangi).length ? { eski, yangi } : null;
}

// req: Express so'rovi (req.user, req.filialId, req.filialNomi, req.ip). opts: { amal, obyekt, id, tavsif, eski, yangi, filial_id, filial_nomi, aktor }
async function log(req, o) {
  try {
    const u = (req && req.user) || {};
    const fid = o.filial_id != null ? o.filial_id : (req && req.filialId) || null;
    let fnomi = o.filial_nomi != null ? o.filial_nomi : (req && req.filialNomi) || '';
    if (fid && !fnomi) fnomi = ((await pool.query('SELECT nomi FROM filiallar WHERE id=$1', [fid])).rows[0] || {}).nomi || '';
    const aktor = o.aktor || { turi: u.role === 'superadmin' ? 'superadmin' : u.role ? 'admin' : 'tizim', id: u.entityId || null, nomi: u.ism || '' };
    await pool.query(
      `INSERT INTO audit_jurnali(aktor_turi,aktor_id,aktor_nomi,filial_id,filial_nomi,amal,obyekt,obyekt_id,tavsif,eski,yangi,ip)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [aktor.turi, aktor.id, String(aktor.nomi || '').slice(0, 200), fid, String(fnomi).slice(0, 200), o.amal, o.obyekt, o.id || null,
       String(o.tavsif || '').slice(0, 1000), clean(o.eski), clean(o.yangi), String((req && req.ip) || '').slice(0, 64)]);
  } catch (e) { console.error('audit:', e.message); }
}
module.exports = { log, diff, pick };
