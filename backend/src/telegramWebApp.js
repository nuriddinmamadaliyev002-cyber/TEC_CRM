// Telegram Mini App (WebApp) `initData` imzosini tekshirish.
// Hujjat: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// Nega kerak: brauzer/mini app yuborgan Telegram ID'ga ishonib bo'lmaydi (`initDataUnsafe` —
// soxtalashtirish mumkin). Faqat bot tokeni bilan HMAC imzolangan `initData` ishonchli:
// uni Telegram'ning o'zi yaratadi, tokenni bilmagan odam esa to'g'ri imzo yasay olmaydi.
const crypto = require('crypto');

const MAX_AGE_S = Math.max(60, parseInt(process.env.MINIAPP_MAX_AGE_S, 10) || 3600); // initData umri (default 1 soat)
const MAX_LEN = 4096;

const eq = (a, b) => {
  const x = Buffer.from(String(a), 'hex'), y = Buffer.from(String(b), 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

// → { ok:true, user:{id,...}, authDate } | { ok:false, sabab }
function verifyInitData(initData, botToken, now = Date.now()) {
  if (!botToken) return { ok: false, sabab: 'sozlanmagan' };
  if (typeof initData !== 'string' || !initData || initData.length > MAX_LEN) return { ok: false, sabab: 'format' };

  let params;
  try { params = new URLSearchParams(initData); } catch (_) { return { ok: false, sabab: 'format' }; }
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false, sabab: 'imzo' };

  const pairs = [];
  for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
  pairs.sort(); // alifbo tartibida (kalit bo'yicha)
  const dataCheckString = pairs.join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!eq(calc, hash)) return { ok: false, sabab: 'imzo' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, sabab: 'format' };
  const age = Math.floor(now / 1000) - authDate;
  if (age > MAX_AGE_S) return { ok: false, sabab: 'eskirgan' };
  if (age < -60) return { ok: false, sabab: 'format' }; // kelajak sanasi

  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch (_) { return { ok: false, sabab: 'format' }; }
  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return { ok: false, sabab: 'format' };

  return { ok: true, user, authDate };
}

// Telegram «login_url» tugmasi (Login Widget bilan bir xil imzo): foydalanuvchi tugmani bosganda Telegram uni
// brauzerda shu manzilga qaytaradi va so'rov qatoriga id, first_name, …, auth_date, hash qo'shadi.
// Imzo kaliti — SHA256(bot tokeni); HMAC-SHA256(data_check_string) = hash. Bizning `rol` parametri imzoga KIRMAYDI.
const LOGIN_FIELDS = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];
const LOGIN_MAX_AGE_S = 600;
function loginDataString(q) {
  return LOGIN_FIELDS.filter(k => typeof q[k] === 'string').sort().map(k => `${k}=${q[k]}`).join('\n');
}
// → { ok:true, id } | { ok:false, sabab }
function verifyLoginUrl(q, botToken, now = Date.now()) {
  if (!botToken) return { ok: false, sabab: 'sozlanmagan' };
  if (!q || typeof q.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(q.hash)) return { ok: false, sabab: 'imzo' };
  const secret = crypto.createHash('sha256').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(loginDataString(q)).digest('hex');
  if (!eq(calc, q.hash)) return { ok: false, sabab: 'imzo' };
  const authDate = Number(q.auth_date), id = Number(q.id);
  if (!Number.isInteger(authDate) || authDate <= 0 || !Number.isSafeInteger(id) || id <= 0) return { ok: false, sabab: 'format' };
  const age = Math.floor(now / 1000) - authDate;
  if (age > LOGIN_MAX_AGE_S || age < -60) return { ok: false, sabab: 'eskirgan' };
  return { ok: true, id };
}
function signLoginUrl(fields, botToken) { // testlar uchun
  const q = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)]));
  const secret = crypto.createHash('sha256').update(botToken).digest();
  return { ...q, hash: crypto.createHmac('sha256', secret).update(loginDataString(q)).digest('hex') };
}

// Testlar uchun: to'g'ri imzolangan initData yasash (production kodida ishlatilmaydi)
function signInitData(fields, botToken) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) params.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const pairs = [];
  for (const [k, v] of params) pairs.push(`${k}=${v}`);
  pairs.sort();
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(pairs.join('\n')).digest('hex'));
  return params.toString();
}

module.exports = { verifyInitData, signInitData, verifyLoginUrl, signLoginUrl, MAX_AGE_S };
