// ─── Auth ───────────────────────────────────────────────────────────────────
//  POST /api/auth/login               — superadmin (username + parol)
//  POST /api/auth/telegram/start      — kurs admin / o'qituvchi / o'quvchi ({rol:'oqituvchi'|'oquvchi'}): bir martalik token + t.me havola
//  GET  /api/auth/telegram/poll/:tok  — brauzer holatni so'raydi; approved bo'lsa JWT
//  POST /api/auth/telegram/bot-check  — BOT: token + telegramId → ruxsat bormi?
//  POST /api/auth/telegram/bot-confirm— BOT: foydalanuvchi "Tasdiqlayman" bosdi
//  POST /api/auth/telegram/miniapp    — Telegram Mini App: imzolangan initData → JWT (yoki rol tanlash)
//  GET  /api/auth/telegram/web-login  — botdagi login_url tugmasi: Telegram imzosi → brauzerda to'g'ridan-to'g'ri panelga
//  POST /api/auth/telegram/miniapp-handoff — Mini App: imzolangan initData → bir martalik havola (tashqi brauzerda ochiladi)
//  GET  /api/auth/me                  — joriy foydalanuvchi
//
//  Telegram ID FAQAT botdan (X-Bot-Secret bilan) keladi — brauzer uni
//  yubora olmaydi, shuning uchun ID'ni taxmin qilib kirib bo'lmaydi.
const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { generateToken, requireAuth } = require('../middleware/jwt');
const { verifyInitData, verifyLoginUrl } = require('../telegramWebApp');
const { bad } = require('../util');

const router = Router();

// Telegram orqali kiradigan rollar: qaysi jadvalda qidiriladi va tokenda qaysi ustunga yoziladi.
// (Jadval/ustun nomlari FAQAT shu yerdagi qat'iy qiymatlardan olinadi — foydalanuvchi kiritmasidan emas.)
const ROLLAR = {
  kurs_admin: { tbl: 'kurs_adminlar', col: 'kurs_admin_id' },
  oqituvchi:  { tbl: 'oqituvchilar',  col: 'oqituvchi_id' },
  oquvchi:    { tbl: 'oquvchilar',    col: 'oquvchi_id' },
};
const rolOf = v => (typeof v === 'string' && Object.prototype.hasOwnProperty.call(ROLLAR, v) ? v : null);

const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ─── Oddiy xotiradagi cheklov (brute-force / spam) ───────────────────────────
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, 60000).unref();
  return (req, res, next) => {
    const k = req.ip, n = Date.now();
    const h = hits.get(k) && hits.get(k).reset > n ? hits.get(k) : { c: 0, reset: n + windowMs };
    h.c++; hits.set(k, h);
    if (h.c > max) return res.status(429).json({ ok: false, error: "Juda ko'p urinish. Birozdan so'ng qayta urining" });
    next();
  };
}

function botOnly(req, res, next) {
  const s = process.env.BOT_SECRET || '';
  if (s.length < 24 || !eq(req.headers['x-bot-secret'] || '', s))
    return res.status(403).json({ ok: false, error: "Ruxsat yo'q" });
  next();
}

// ─── Superadmin ──────────────────────────────────────────────────────────────
router.post('/login', limiter(10, 15 * 60 * 1000), async (req, res) => {
  const { username, parol } = req.body || {};
  const U = process.env.SUPERADMIN_USERNAME, H = process.env.SUPERADMIN_PASSWORD_HASH;
  // Foydalanuvchi noto'g'ri bo'lsa ham hash solishtiramiz (vaqt farqi bilmasin)
  const hash = H && H.startsWith('$2') ? H : '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
  const okPass = await bcrypt.compare(String(parol || ''), hash);
  const okUser = U && eq(String(username || '').trim(), U);
  if (!okPass || !okUser || !H) return res.status(401).json({ ok: false, error: "Username yoki parol noto'g'ri" });

  const ism = process.env.SUPERADMIN_NAME || 'Superadmin';
  res.json({ ok: true, token: generateToken({ role: 'superadmin', ism }), role: 'superadmin', ism });
});

// ─── Kurs admin: Telegram bot orqali ─────────────────────────────────────────
router.post('/telegram/start', limiter(20, 10 * 60 * 1000), async (req, res) => {
  const bot = process.env.KURS_BOT_USERNAME;
  if (!bot) return res.status(500).json({ ok: false, error: 'Bot sozlanmagan (KURS_BOT_USERNAME)' });
  const rol = rolOf((req.body || {}).rol) || 'kurs_admin'; // noma'lum qiymat → kurs_admin
  try {
    await pool.query('DELETE FROM login_tokenlar WHERE muddat < NOW()');
    const token = crypto.randomBytes(24).toString('base64url'); // 32 belgi, t.me start uchun mos
    await pool.query('INSERT INTO login_tokenlar(token, rol) VALUES($1,$2)', [token, rol]);
    res.json({ ok: true, token, botUrl: `https://t.me/${bot.replace(/^@/, '')}?start=login_${token}`, expiresIn: 300 });
  } catch (e) { console.error('tg start:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

router.get('/telegram/poll/:token', limiter(300, 10 * 60 * 1000), async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT holat, rol, kurs_admin_id, oqituvchi_id, oquvchi_id, muddat < NOW() AS eskirgan
         FROM login_tokenlar WHERE token=$1`, [req.params.token]);
    if (!r.rowCount) return res.json({ ok: true, holat: 'expired' });
    const t = r.rows[0];
    if (t.eskirgan) { await pool.query('DELETE FROM login_tokenlar WHERE token=$1', [req.params.token]); return res.json({ ok: true, holat: 'expired' }); }
    if (t.holat === 'rejected') { await pool.query('DELETE FROM login_tokenlar WHERE token=$1', [req.params.token]); return res.json({ ok: true, holat: 'rejected' }); }
    if (t.holat !== 'approved') return res.json({ ok: true, holat: t.holat });

    // approved → token BIR MARTA beriladi (atomik o'chirish)
    const del = await pool.query('DELETE FROM login_tokenlar WHERE token=$1 AND holat=\'approved\' RETURNING token', [req.params.token]);
    if (!del.rowCount) return res.json({ ok: true, holat: 'expired' });

    const R = ROLLAR[rolOf(t.rol)];
    if (!R) return res.json({ ok: true, holat: 'expired' });
    const tbl = R.tbl, pid = t[R.col];
    const p = await pool.query(`SELECT id, ism, familiya, faol FROM ${tbl} WHERE id=$1`, [pid]);
    if (!p.rowCount || !p.rows[0].faol) return res.json({ ok: true, holat: 'expired' });
    const a = p.rows[0], ism = `${a.familiya} ${a.ism}`.trim(); // FI: Familiya Ism
    await pool.query(`UPDATE ${tbl} SET oxirgi_kirish=NOW() WHERE id=$1`, [a.id]);
    res.json({ ok: true, holat: 'approved', role: t.rol, ism,
      token: generateToken({ role: t.rol, entityId: a.id, ism }) });
  } catch (e) { console.error('tg poll:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

// BOT: /start login_<token> kelganda. Foydalanuvchi token roliga mos ro'yxatda bormi?
router.post('/telegram/bot-check', botOnly, async (req, res) => {
  const { token, telegramId } = req.body || {};
  const tg = Number(telegramId);
  if (!token || !Number.isSafeInteger(tg)) return res.status(400).json({ ok: false, error: "Noto'g'ri so'rov" });
  try {
    const t = await pool.query(`SELECT holat, rol FROM login_tokenlar WHERE token=$1 AND muddat > NOW()`, [token]);
    if (!t.rowCount || t.rows[0].holat !== 'pending') return res.json({ ok: true, allowed: false, sabab: 'token' });
    const R = ROLLAR[rolOf(t.rows[0].rol)];
    if (!R) return res.json({ ok: true, allowed: false, sabab: 'token' });
    const a = await pool.query(`SELECT id, ism, familiya, faol FROM ${R.tbl} WHERE telegram_id=$1`, [tg]);
    // O'qituvchi/o'quvchida telegram_id UNIQUE emas: bir nechta mos kelsa, noaniq — kirishga RUXSAT BERILMAYDI
    if (a.rowCount !== 1 || !a.rows[0].faol) {
      await pool.query(`UPDATE login_tokenlar SET holat='rejected', telegram_id=$2 WHERE token=$1`, [token, tg]);
      return res.json({ ok: true, allowed: false, sabab: 'ruxsat' });
    }
    await pool.query(
      `UPDATE login_tokenlar SET holat='awaiting', ${R.col}=$2, telegram_id=$3 WHERE token=$1 AND holat='pending'`,
      [token, a.rows[0].id, tg]);
    res.json({ ok: true, allowed: true, rol: t.rows[0].rol, ism: `${a.rows[0].ism} ${a.rows[0].familiya}`.trim() });
  } catch (e) { console.error('bot-check:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

// BOT: to'g'ridan-to'g'ri kirish. Foydalanuvchi botga /start yozganda, Telegram ID biriktirilgan
// har bir faol rol uchun bir martalik (5 daqiqa) "approved" token yaratiladi va panel havolasi qaytariladi.
// Telegram ID botdan (X-Bot-Secret bilan) keladi — soxtalashtirib bo'lmaydi. Tokenni brauzer
// mavjud GET /telegram/poll/:token orqali bir marta JWT'ga almashtiradi.
router.post('/telegram/bot-direct', botOnly, async (req, res) => {
  const tg = Number((req.body || {}).telegramId);
  if (!Number.isSafeInteger(tg) || tg <= 0) return res.status(400).json({ ok: false, error: "Noto'g'ri so'rov" });
  const web = String(process.env.WEB_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(web)) return res.status(500).json({ ok: false, error: 'WEB_URL sozlanmagan (https:// bilan boshlanishi kerak)' });
  try {
    await pool.query("DELETE FROM login_tokenlar WHERE muddat < NOW() OR (telegram_id=$1 AND holat='approved')", [tg]);
    const links = [];
    for (const [rol, R] of Object.entries(ROLLAR)) {
      const a = await pool.query(`SELECT id, ism, familiya, faol FROM ${R.tbl} WHERE telegram_id=$1`, [tg]);
      // Bir nechta mos kelsa — noaniq, ruxsat berilmaydi (bot-check bilan bir xil qoida)
      if (a.rowCount !== 1 || !a.rows[0].faol) continue;
      const token = crypto.randomBytes(24).toString('base64url');
      await pool.query(
        `INSERT INTO login_tokenlar(token, holat, rol, ${R.col}, telegram_id) VALUES($1,'approved',$2,$3,$4)`,
        [token, rol, a.rows[0].id, tg]);
      links.push({ rol, ism: `${a.rows[0].ism} ${a.rows[0].familiya}`.trim(), url: `${web}/index.html#bt=${token}` });
    }
    res.json({ ok: true, links });
  } catch (e) { console.error('bot-direct:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

// BOT: Telegram ID qaysi rol(lar)ga biriktirilgan? Token/havola YARATMAYDI (faqat ism va rol qaytaradi).
// Bot shundan keyin faqat Mini App tugmasini beradi: u har bosgan odamning O'Z imzolangan ID'si bilan
// tekshiriladi, shuning uchun xabar boshqaga yuborilsa ham u orqali kirib bo'lmaydi.
router.post('/telegram/bot-roles', botOnly, async (req, res) => {
  const tg = Number((req.body || {}).telegramId);
  if (!Number.isSafeInteger(tg) || tg <= 0) return res.status(400).json({ ok: false, error: "Noto'g'ri so'rov" });
  try {
    const roles = [];
    for (const [rol, R] of Object.entries(ROLLAR)) {
      const a = await pool.query(`SELECT ism, familiya, faol FROM ${R.tbl} WHERE telegram_id=$1`, [tg]);
      if (a.rowCount !== 1 || !a.rows[0].faol) continue; // bir nechta mos kelsa — noaniq, ruxsat yo'q
      roles.push({ rol, ism: `${a.rows[0].ism} ${a.rows[0].familiya}`.trim() });
    }
    res.json({ ok: true, roles });
  } catch (e) { console.error('bot-roles:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

// ─── Telegram Mini App orqali kirish ─────────────────────────────────────────
// Foydalanuvchi botdagi «Mini App» tugmasini bosadi → web/miniapp.html Telegram `initData` ni shu yerga yuboradi.
// Telegram ID FAQAT bot tokeni bilan HMAC imzolangan initData'dan olinadi (telegramWebApp.js) — brauzer
// yuborgan "telegramId" ga ishonilmaydi, shuning uchun boshqa odamning ID'si bilan kirib bo'lmaydi.
// Rol(lar): Telegram ID biriktirilgan va FAOL (jadvalda aynan 1 ta mos yozuv) kurs_admin / oqituvchi / oquvchi.
//   bitta rol  → darrov JWT
//   ko'p rol   → { multiple:true, roles:[...] }; mijoz tanlab { initData, rol } bilan qayta yuboradi (imzo qayta tekshiriladi)
//   hech qaysi → { found:false, telegramId } (mini app ID'ni ko'rsatadi, admin shuni biriktiradi)
// Umumiy qism: initData imzosi + rol tanlash. Javob allaqachon yuborilgan bo'lsa (xato, found:false, multiple) → null,
// aks holda { tg, ch } (ch = tanlangan faol rol). Ichkaridan DB xatosi tashlanishi mumkin — chaqiruvchi try/catch qiladi.
async function miniAppChoose(req, res) {
  const b = req.body || {};
  const v = verifyInitData(b.initData, process.env.KURS_BOT_TOKEN);
  if (!v.ok) {
    if (v.sabab === 'sozlanmagan') res.status(500).json({ ok: false, error: 'Bot sozlanmagan (KURS_BOT_TOKEN)' });
    else if (v.sabab === 'eskirgan') res.status(401).json({ ok: false, error: 'Oyna eskirgan. Telegram\'dan qayta oching' });
    else res.status(401).json({ ok: false, error: "Telegram ma'lumoti tasdiqlanmadi" });
    return null;
  }
  const want = b.rol == null || b.rol === '' ? null : rolOf(b.rol);
  if (b.rol != null && b.rol !== '' && !want) { bad(res, "Noto'g'ri rol"); return null; }
  const tg = v.user.id;
  const roles = [];
  for (const [rol, R] of Object.entries(ROLLAR)) {
    const a = await pool.query(`SELECT id, ism, familiya, faol FROM ${R.tbl} WHERE telegram_id=$1`, [tg]);
    // Bir nechta mos kelsa — noaniq, ruxsat berilmaydi (bot-check/bot-direct bilan bir xil qoida)
    if (a.rowCount !== 1 || !a.rows[0].faol) continue;
    roles.push({ rol, id: a.rows[0].id, ism: `${a.rows[0].familiya} ${a.rows[0].ism}`.trim() }); // FI: Familiya Ism
  }
  if (!roles.length) { res.json({ ok: true, found: false, telegramId: String(tg) }); return null; }
  let ch;
  if (want) {
    ch = roles.find(r => r.rol === want);
    if (!ch) { res.status(403).json({ ok: false, error: "Bu rol uchun ruxsat yo'q" }); return null; }
  } else if (roles.length > 1) {
    res.json({ ok: true, found: true, multiple: true, roles: roles.map(r => ({ rol: r.rol, ism: r.ism })) });
    return null;
  } else ch = roles[0];
  return { tg, ch };
}

router.post('/telegram/miniapp', limiter(60, 10 * 60 * 1000), async (req, res) => {
  try {
    const r = await miniAppChoose(req, res); if (!r) return;
    const { ch } = r;
    await pool.query(`UPDATE ${ROLLAR[ch.rol].tbl} SET oxirgi_kirish=NOW() WHERE id=$1`, [ch.id]);
    res.json({ ok: true, found: true, role: ch.rol, ism: ch.ism,
      token: generateToken({ role: ch.rol, entityId: ch.id, ism: ch.ism }) });
  } catch (e) { console.error('miniapp:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

// Mini App → TASHQI BRAUZER. Mini App faqat "yo'naltiruvchi": imzolangan initData tekshiriladi (kim bosgan — Telegram'ning o'zi aytadi),
// so'ng shu odam uchun bir martalik (5 daqiqa) kirish havolasi yaratiladi va FAQAT uning o'z Mini App oynasiga qaytariladi.
// Mini App uni Telegram.WebApp.openLink() bilan oddiy brauzerda ochadi (index.html#bt=…, poll orqali JWT olinadi).
// Xabar boshqaga yuborilsa ham havola bot xabarida emas, shuning uchun u orqali kirib bo'lmaydi.
router.post('/telegram/miniapp-handoff', limiter(30, 10 * 60 * 1000), async (req, res) => {
  const web = String(process.env.WEB_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(web)) return res.status(500).json({ ok: false, error: 'WEB_URL sozlanmagan (https:// bilan boshlanishi kerak)' });
  try {
    const r = await miniAppChoose(req, res); if (!r) return;
    const { tg, ch } = r;
    await pool.query("DELETE FROM login_tokenlar WHERE muddat < NOW() OR (telegram_id=$1 AND holat='approved')", [tg]);
    const token = crypto.randomBytes(24).toString('base64url');
    await pool.query(
      `INSERT INTO login_tokenlar(token, holat, rol, ${ROLLAR[ch.rol].col}, telegram_id) VALUES($1,'approved',$2,$3,$4)`,
      [token, ch.rol, ch.id, tg]);
    res.json({ ok: true, found: true, role: ch.rol, ism: ch.ism, url: `${web}/index.html#bt=${token}`, expiresIn: 300 });
  } catch (e) { console.error('miniapp-handoff:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

// Botdagi «login_url» tugmasi → BRAUZERDA to'g'ridan-to'g'ri web panel (Mini App ochilmaydi).
// Telegram tugma bosilganda foydalanuvchini shu manzilga qaytaradi va imzolangan id/auth_date/hash qo'shadi (kalit — bot tokeni),
// shuning uchun Telegram ID soxtalashtirib bo'lmaydi va xabar boshqaga yuborilsa ham u O'Z ID'si bilan tekshiriladi.
// `rol` imzoga kirmaydi, lekin faqat foydalanuvchining O'Z faol rollaridan birini tanlaydi. Natija: bir martalik token →
// index.html#bt=… (u JWT'ga almashtirib, panelga o'tkazadi). Xato bo'lsa index.html#xato=… (sababi ko'rsatiladi).
router.get('/telegram/web-login', limiter(60, 10 * 60 * 1000), async (req, res) => {
  const web = String(process.env.WEB_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(web)) return res.status(500).json({ ok: false, error: 'WEB_URL sozlanmagan (https:// bilan boshlanishi kerak)' });
  res.setHeader('Cache-Control', 'no-store');
  const back = (k, extra = '') => res.redirect(302, `${web}/index.html#xato=${k}${extra}`);
  try {
    const v = verifyLoginUrl(req.query, process.env.KURS_BOT_TOKEN);
    if (!v.ok) return back(v.sabab === 'eskirgan' ? 'eskirgan' : 'imzo');
    const tg = v.id, want = typeof req.query.rol === 'string' ? rolOf(req.query.rol) : null;
    const roles = [];
    for (const [rol, R] of Object.entries(ROLLAR)) {
      const a = await pool.query(`SELECT id, faol FROM ${R.tbl} WHERE telegram_id=$1`, [tg]);
      if (a.rowCount !== 1 || !a.rows[0].faol) continue; // bir nechta mos kelsa — noaniq, ruxsat yo'q
      roles.push({ rol, id: a.rows[0].id });
    }
    if (!roles.length) return back('id', `&tg=${tg}`);
    const ch = want ? roles.find(r => r.rol === want) : roles.length === 1 ? roles[0] : null;
    if (!ch) return back('rol');
    await pool.query("DELETE FROM login_tokenlar WHERE muddat < NOW() OR (telegram_id=$1 AND holat='approved')", [tg]);
    const token = crypto.randomBytes(24).toString('base64url');
    await pool.query(
      `INSERT INTO login_tokenlar(token, holat, rol, ${ROLLAR[ch.rol].col}, telegram_id) VALUES($1,'approved',$2,$3,$4)`,
      [token, ch.rol, ch.id, tg]);
    res.redirect(302, `${web}/index.html#bt=${token}`);
  } catch (e) { console.error('web-login:', e.message); back('server'); }
});

// BOT: "✅ Tasdiqlayman" yoki "❌ Bekor qilish"
router.post('/telegram/bot-confirm', botOnly, async (req, res) => {
  const { token, telegramId, approve } = req.body || {};
  const tg = Number(telegramId);
  if (!token || !Number.isSafeInteger(tg)) return res.status(400).json({ ok: false, error: "Noto'g'ri so'rov" });
  try {
    const r = await pool.query(
      `UPDATE login_tokenlar SET holat=$3
        WHERE token=$1 AND telegram_id=$2 AND holat='awaiting' AND muddat > NOW() RETURNING token`,
      [token, tg, approve ? 'approved' : 'rejected']);
    res.json({ ok: true, done: r.rowCount > 0 });
  } catch (e) { console.error('bot-confirm:', e.message); res.status(500).json({ ok: false, error: 'Server xatoligi' }); }
});

router.get('/me', requireAuth(['superadmin', 'kurs_admin', 'oqituvchi', 'oquvchi']), (req, res) => {
  res.json({ ok: true, role: req.user.role, ism: req.user.ism });
});

module.exports = router;
