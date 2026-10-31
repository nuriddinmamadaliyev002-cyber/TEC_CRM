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

module.exports = { verifyInitData, signInitData, MAX_AGE_S };
