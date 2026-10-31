// End-to-end tekshiruv (ishlayotgan server + baza kerak):  node scripts/e2e.js
require('dotenv').config();
const B = `http://127.0.0.1:${process.env.PORT || 3010}/api`;
let pass = 0, fail = 0;
const t = (name, ok, extra) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : '  → ' + JSON.stringify(extra)}`); };
async function call(m, p, body, tok, hdr = {}) {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...hdr }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})) };
}
const bot = { 'X-Bot-Secret': process.env.BOT_SECRET };
const { signInitData } = require('../src/telegramWebApp');
const BOT_TOKEN = process.env.KURS_BOT_TOKEN;
// Mini App initData: to'g'ri imzolangan (yoki ataylab buzilgan) qator yasaydi
const initFor = (id, extra = {}, token = BOT_TOKEN) => signInitData({
  auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'AAE' + id, user: { id: Number(id), first_name: 'T' }, ...extra }, token);
(async () => {
  // — superadmin
  let r = await call('POST', '/auth/login', { username: 'superadmin', parol: 'xato' }); t('noto\'g\'ri parol → 401', r.s === 401, r);
  r = await call('POST', '/auth/login', { username: 'boshqa', parol: 'TestParol123' }); t('noto\'g\'ri username → 401', r.s === 401, r);
  r = await call('POST', '/auth/login', { username: 'superadmin', parol: 'TestParol123' }); t('superadmin login', r.s === 200 && r.d.token, r);
  const SU = r.d.token;
  r = await call('GET', '/kurs-adminlar'); t('tokensiz → 401', r.s === 401, r);

  // — kurs admin CRUD
  const TG = String(900000000 + Math.floor(Math.random() * 99999999));
  const TGT = String(800000000 + Math.floor(Math.random() * 99999999)); // o'qituvchi
  const TGS = String(600000000 + Math.floor(Math.random() * 99999999)); // o'quvchi
  r = await call('POST', '/kurs-adminlar', { ism: '', telegram_id: TG }, SU); t('ismsiz → 400', r.s === 400, r);
  r = await call('POST', '/kurs-adminlar', { ism: 'Ali', telegram_id: 'abc' }, SU); t('noto\'g\'ri TG ID → 400', r.s === 400, r);
  r = await call('POST', '/kurs-adminlar', { ism: 'Ali', familiya: 'Valiyev', telefon: '+998901234567', telegram_id: TG }, SU); t('kurs admin yaratish', r.s === 200, r);
  const AID = r.d.admin && r.d.admin.id;
  r = await call('POST', '/kurs-adminlar', { ism: 'Dublikat', telegram_id: TG }, SU); t('takroriy TG ID → 409', r.s === 409, r);

  // — Telegram login oqimi
  r = await call('POST', '/auth/telegram/start'); t('tg start', r.s === 200 && /t\.me\/TestKursBot\?start=login_/.test(r.d.botUrl), r);
  const TOK = r.d.token;
  r = await call('GET', '/auth/telegram/poll/' + TOK); t('poll → pending', r.d.holat === 'pending', r);
  r = await call('POST', '/auth/telegram/bot-check', { token: TOK, telegramId: TG }); t('botsiz (sirsiz) bot-check → 403', r.s === 403, r);
  r = await call('POST', '/auth/telegram/bot-check', { token: TOK, telegramId: TG }, null, { 'X-Bot-Secret': 'x'.repeat(40) }); t('noto\'g\'ri sir → 403', r.s === 403, r);
  // ro'yxatda yo'q odam
  const T2 = (await call('POST', '/auth/telegram/start')).d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: T2, telegramId: '111222333' }, null, bot); t('begona TG ID → allowed:false', r.d.allowed === false, r);
  r = await call('GET', '/auth/telegram/poll/' + T2); t('begona → rejected', r.d.holat === 'rejected' && !r.d.token, r);
  // ruxsat berilgan
  r = await call('POST', '/auth/telegram/bot-check', { token: TOK, telegramId: TG }, null, bot); t('kurs admin allowed', r.d.allowed === true && r.d.ism === 'Ali Valiyev', r);
  r = await call('GET', '/auth/telegram/poll/' + TOK); t('poll → awaiting (JWT yo\'q)', r.d.holat === 'awaiting' && !r.d.token, r);
  r = await call('POST', '/auth/telegram/bot-confirm', { token: TOK, telegramId: '555', approve: true }, null, bot); t('boshqa TG ID tasdiqlay olmaydi', r.d.done === false, r);
  r = await call('POST', '/auth/telegram/bot-confirm', { token: TOK, telegramId: TG, approve: true }, null, bot); t('tasdiqlash', r.d.done === true, r);
  r = await call('GET', '/auth/telegram/poll/' + TOK); t('poll → approved + JWT', r.d.holat === 'approved' && r.d.token && r.d.role === 'kurs_admin', r);
  const KA = r.d.token;
  r = await call('GET', '/auth/telegram/poll/' + TOK); t('token ikkinchi marta berilmaydi', r.d.holat === 'expired' && !r.d.token, r);
  // rad etish
  const T3 = (await call('POST', '/auth/telegram/start')).d.token;
  await call('POST', '/auth/telegram/bot-check', { token: T3, telegramId: TG }, null, bot);
  await call('POST', '/auth/telegram/bot-confirm', { token: T3, telegramId: TG, approve: false }, null, bot);
  r = await call('GET', '/auth/telegram/poll/' + T3); t('"Bekor qilish" → rejected', r.d.holat === 'rejected' && !r.d.token, r);
  r = await call('GET', '/auth/telegram/poll/nomalum'); t('noma\'lum token → expired', r.d.holat === 'expired', r);

  // — rol ajratish
  r = await call('GET', '/kurs-adminlar', null, KA); t('kurs admin superadmin API\'ga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/stats', null, KA); t('kurs admin panel API\'ga kiradi', r.s === 200, r);

  // — panel CRUD
  r = await call('POST', '/fanlar', { nomi: '' }, KA); t('nomsiz fan → 400', r.s === 400, r);
  r = await call('POST', '/fanlar', { nomi: 'Python', tavsif: '<b>x</b>', narx: 600000, davomiylik_oy: 3 }, KA); t('fan yaratish (narx/davomiylik e\'tiborga olinmaydi)', r.s === 200, r);
  const KID = r.d.id;
  r = await call('GET', '/fanlar', null, KA); t('fan ro\'yxatida narx/davomiylik yo\'q', r.d.fanlar && r.d.fanlar[0].nomi && !('narx' in r.d.fanlar[0]) && !('davomiylik_oy' in r.d.fanlar[0]), r);
  r = await call('GET', '/kurslar', null, KA); t('eski /kurslar yo\'li yo\'q → 404', r.s === 404, r);
  const FID2 = (await call('POST', '/fanlar', { nomi: 'Matematika' }, KA)).d.id; // boshqa fan (fan↔o'qituvchi tekshiruvlari uchun)
  r = await call('POST', '/oqituvchilar', { ism: 'Fansiz', telegram_id: String(500000000 + Math.floor(Math.random() * 99999999)) }, KA); t('fansiz o\'qituvchi → 400', r.s === 400, r);
  r = await call('POST', '/oqituvchilar', { ism: 'X', fan_id: 99999 }, KA); t('mavjud bo\'lmagan fan bilan o\'qituvchi → 400', r.s === 400, r);
  r = await call('POST', '/oqituvchilar', { ism: 'Sardor', familiya: 'Karimov', fan_id: KID, telegram_id: TGT }, KA); t('o\'qituvchi yaratish (fan_id bilan)', r.s === 200, r);
  const TID = r.d.id;
  r = await call('GET', '/oqituvchilar', null, KA); t('o\'qituvchi ro\'yxatida fan_nomi bor', r.d.items.find(x => x.id === TID).fan_nomi === 'Python', r);
  const TMAT = (await call('POST', '/oqituvchilar', { ism: 'Mat', familiya: 'Teacher', fan_id: FID2 }, KA)).d.id; // Matematika o'qituvchisi
  // dars jadvali: kunlar + soat
  r = await call('POST', '/guruhlar', { oylik_narx: 300000, nomi: 'PY-1', fan_id: KID, oqituvchi_id: TID, kunlar: [5, 1, 3, 3], soat: '19:00', boshlanish: '2026-11-01', max_oquvchi: 2 }, KA); t('guruh yaratish (kunlar+soat)', r.s === 200, r);
  const GID = r.d.id;
  r = await call('GET', '/guruhlar', null, KA); { const g = r.d.guruhlar.find(x => x.id === GID);
    t('jadval matni kunlar+soat\'dan hosil bo\'ladi (tartiblangan, takrorsiz)', g.jadval === 'Du-Chor-Ju 19:00' && JSON.stringify(g.kunlar) === '[1,3,5]' && g.soat === '19:00', g);
    t('guruhda fan_nomi va boshlanish YYYY-MM-DD', g.fan_nomi === 'Python' && g.boshlanish === '2026-11-01', g); }
  r = await call('POST', '/guruhlar', { oylik_narx: 300000, nomi: 'Yak', fan_id: KID, kunlar: [7], soat: '08:30' }, KA); t('yakshanba (7) qabul qilinadi', r.s === 200, r);
  { const yid = r.d.id; r = await call('GET', '/guruhlar', null, KA); t('yakshanba → «Yak 08:30»', r.d.guruhlar.find(x => x.id === yid).jadval === 'Yak 08:30', r); await call('DELETE', `/guruhlar/${yid}`, null, KA); }
  r = await call('POST', '/guruhlar', { nomi: 'X', fan_id: KID, kunlar: [0], soat: '19:00' }, KA); t('kun 0 → 400', r.s === 400, r);
  r = await call('POST', '/guruhlar', { nomi: 'X', fan_id: KID, kunlar: [8], soat: '19:00' }, KA); t('kun 8 → 400', r.s === 400, r);
  r = await call('POST', '/guruhlar', { nomi: 'X', fan_id: KID, kunlar: [1], soat: '25:00' }, KA); t('noto\'g\'ri soat → 400', r.s === 400, r);
  r = await call('POST', '/guruhlar', { nomi: 'X', fan_id: KID, kunlar: [1] }, KA); t('kunlar bor, soat yo\'q → 400', r.s === 400, r);
  r = await call('POST', '/guruhlar', { nomi: 'X', fan_id: KID, soat: '19:00' }, KA); t('soat bor, kunlar yo\'q → 400', r.s === 400, r);
  r = await call('POST', '/guruhlar', { oylik_narx: 300000, nomi: 'X', fan_id: KID }, KA); t('jadvalsiz guruh mumkin (jadval bo\'sh)', r.s === 200, r);
  { const nid = r.d.id; r = await call('GET', '/guruhlar', null, KA); const g = r.d.guruhlar.find(x => x.id === nid); t('jadvalsiz: jadval=\'\', kunlar=[], soat=null', g.jadval === '' && g.kunlar.length === 0 && g.soat === null, g); await call('DELETE', `/guruhlar/${nid}`, null, KA); }
  r = await call('POST', '/guruhlar', { nomi: 'X', fan_id: KID, oylik_narx: -5 }, KA); t('manfiy narx → 400', r.s === 400, r);
  r = await call('POST', '/guruhlar', { nomi: 'X', fan_id: KID }, KA); t('narxsiz guruh → 400', r.s === 400, r);
  r = await call('POST', '/guruhlar', { nomi: 'X', fan_id: 99999 }, KA); t('mavjud bo\'lmagan fan → 400', r.s === 400, r);
  r = await call('POST', '/guruhlar', { nomi: 'X' }, KA); t('fansiz guruh → 400', r.s === 400, r);
  // fan ↔ o'qituvchi bog'liqligi
  r = await call('POST', '/guruhlar', { oylik_narx: 300000, nomi: 'MAT-1', fan_id: FID2, oqituvchi_id: TID }, KA); t('boshqa fan o\'qituvchisini guruhga qo\'yib bo\'lmaydi → 400', r.s === 400 && /fan/.test(r.d.error), r);
  r = await call('PUT', `/guruhlar/${GID}`, { nomi: 'PY-1', fan_id: FID2, oqituvchi_id: TID, max_oquvchi: 2 }, KA); t('guruh fani o\'zgarsa o\'qituvchi mos kelishi shart → 400', r.s === 400, r);
  r = await call('PUT', `/oqituvchilar/${TID}`, { ism: 'Sardor', familiya: 'Karimov', fan_id: FID2, telegram_id: TGT }, KA); t('o\'qituvchi fani boshqa fan guruhida dars berayotganda o\'zgarmaydi → 409', r.s === 409, r);
  r = await call('POST', '/guruhlar', { oylik_narx: 300000, nomi: 'MAT-1', fan_id: FID2, oqituvchi_id: TMAT, kunlar: [2, 4], soat: '10:00' }, KA); t('mos fan o\'qituvchisi bilan guruh', r.s === 200, r);
  const GMAT = r.d.id;
  const ids = [];
  for (const n of ['A', 'B', 'C']) { r = await call('POST', '/oquvchilar', { ism: n, telefon: '90' }, KA); ids.push(r.d.id); }
  r = await call('POST', `/guruhlar/${GID}/oquvchilar`, { oquvchi_id: ids[0] }, KA); t('guruhga o\'quvchi qo\'shish', r.s === 200, r);
  r = await call('POST', `/guruhlar/${GID}/oquvchilar`, { oquvchi_id: ids[0] }, KA); t('takroriy → 409', r.s === 409, r);
  r = await call('POST', `/guruhlar/${GID}/oquvchilar`, { oquvchi_id: ids[1] }, KA);
  r = await call('POST', `/guruhlar/${GID}/oquvchilar`, { oquvchi_id: ids[2] }, KA); t('guruh to\'lganda → 409', r.s === 409, r);
  r = await call('DELETE', `/fanlar/${KID}`, null, KA); t('guruhli/o\'qituvchili fanni o\'chirib bo\'lmaydi → 409', r.s === 409, r);
  r = await call('POST', '/tolovlar', { oquvchi_id: ids[0], guruh_id: GID, summa: 0 }, KA); t('0 summa → 400', r.s === 400, r);
  r = await call('POST', '/tolovlar', { oquvchi_id: ids[0], guruh_id: GID, summa: 600000, usul: 'karta', sana: '2026-10-26' }, KA); t('to\'lov kiritish', r.s === 200, r);
  r = await call('GET', '/tolovlar', null, KA); t('to\'lovlar ro\'yxati', r.d.items && r.d.items[0].summa === 600000 && r.d.items[0].kiritgan === 'Valiyev Ali', r);
  r = await call('GET', '/stats', null, KA); t('statistika', r.d.stats.jami_tushum >= 600000 && r.d.stats.oquvchilar >= 3, r);
  r = await call('GET', '/guruhlar/abc/oquvchilar', null, KA); t('noto\'g\'ri id → 400 (500 emas)', r.s === 400, r);
  r = await call('GET', '/guruhlar', null, KA); t('guruhlar: sanoq to\'g\'ri', r.d.guruhlar.find(g => g.id === GID).oquvchilar_soni === 2, r);


  // — O'QITUVCHI PANELI
  r = await call('POST', '/oqituvchilar', { ism: 'Dublikat', fan_id: KID, telegram_id: TGT }, KA); t('takroriy o\'qituvchi TG ID → 409', r.s === 409, r);
  const TIDX = (await call('POST', '/oqituvchilar', { ism: 'Boshqa', fan_id: KID, telegram_id: String(700000000 + Math.floor(Math.random() * 99999999)) }, KA)).d.id;
  r = await call('PUT', `/oqituvchilar/${TIDX}`, { ism: 'Boshqa', fan_id: KID, telegram_id: TGT }, KA); t('tahrirda ham takroriy TG ID → 409', r.s === 409, r);
  const GX = (await call('POST', '/guruhlar', { oylik_narx: 300000, nomi: 'JS-1', fan_id: KID, oqituvchi_id: TIDX }, KA)).d.id; // BOSHQA o'qituvchi guruhi
  // login oqimi (rol: oqituvchi)
  r = await call('POST', '/auth/telegram/start', { rol: 'oqituvchi' }); const OT = r.d.token; t('o\'qituvchi tg start', r.s === 200 && !!OT, r);
  r = await call('POST', '/auth/telegram/bot-check', { token: OT, telegramId: TG }, null, bot); t('kurs admin ID\'si o\'qituvchi tokeniga kira olmaydi', r.d.allowed === false, r);
  r = await call('GET', '/auth/telegram/poll/' + OT); t('→ rejected, JWT yo\'q', r.d.holat === 'rejected' && !r.d.token, r);
  r = await call('POST', '/auth/telegram/start', { rol: 'oqituvchi' }); const OT2 = r.d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: OT2, telegramId: TGT }, null, bot); t('o\'qituvchi allowed (rol=oqituvchi)', r.d.allowed === true && r.d.rol === 'oqituvchi' && r.d.ism === 'Sardor Karimov', r);
  r = await call('POST', '/auth/telegram/bot-confirm', { token: OT2, telegramId: TGT, approve: true }, null, bot); t('o\'qituvchi tasdiqlash', r.d.done === true, r);
  r = await call('GET', '/auth/telegram/poll/' + OT2); t('o\'qituvchi JWT (role=oqituvchi)', r.d.holat === 'approved' && r.d.role === 'oqituvchi' && !!r.d.token, r);
  const OQ = r.d.token;
  // o'qituvchi tokeni kurs admin tokeni EMAS: oddiy kurs admin tokeni bilan teskari ham yopiq
  r = await call('POST', '/auth/telegram/start'); const KT = r.d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: KT, telegramId: TGT }, null, bot); t('o\'qituvchi ID\'si kurs admin tokeniga kira olmaydi', r.d.allowed === false, r);
  // rol ajratish
  r = await call('GET', '/stats', null, OQ); t('o\'qituvchi kurs paneliga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/tolovlar', null, OQ); t('o\'qituvchi to\'lovlarni ko\'ra olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/kurs-adminlar', null, OQ); t('o\'qituvchi superadmin API\'ga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/oqituvchi-panel/stats', null, KA); t('kurs admin token o\'qituvchi API\'ga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/oqituvchi-panel/stats'); t('tokensiz o\'qituvchi API → 401', r.s === 401, r);
  r = await call('GET', '/auth/me', null, OQ); t('/auth/me o\'qituvchi', r.d.role === 'oqituvchi', r);
  // o'z ma'lumoti
  r = await call('GET', '/oqituvchi-panel/stats', null, OQ); t('o\'qituvchi statistikasi', r.d.stats && r.d.stats.guruhlar === 1 && r.d.stats.oquvchilar === 2, r);
  r = await call('GET', '/oqituvchi-panel/guruhlar', null, OQ); t('faqat o\'z guruhlari', r.d.guruhlar && r.d.guruhlar.length === 1 && r.d.guruhlar[0].id === GID && r.d.guruhlar[0].oquvchilar_soni === 2, r);
  r = await call('GET', '/oqituvchi-panel/guruhlar', null, OQ); t('guruhda fan_nomi bor, narx/moliya maydoni yo\'q', r.d.guruhlar[0].fan_nomi === 'Python' && !('narx' in r.d.guruhlar[0]), r);
  r = await call('GET', `/oqituvchi-panel/guruhlar/${GID}/oquvchilar`, null, OQ); t('o\'z guruh o\'quvchilari', r.d.items && r.d.items.length === 2, r);
  r = await call('GET', `/oqituvchi-panel/guruhlar/${GX}/oquvchilar`, null, OQ); t('boshqa o\'qituvchi guruhi → 404', r.s === 404, r);
  r = await call('PUT', `/oqituvchi-panel/guruhlar/${GX}/davomat`, { sana: '2026-10-26', items: [{ oquvchi_id: ids[0], holat: 'keldi' }] }, OQ); t('boshqa guruhga davomat yozib bo\'lmaydi → 404', r.s === 404, r);
  r = await call('GET', '/oqituvchi-panel/guruhlar/abc/oquvchilar', null, OQ); t('noto\'g\'ri guruh id → 400', r.s === 400, r);
  // davomat
  r = await call('PUT', `/oqituvchi-panel/guruhlar/${GID}/davomat`, { sana: '2026-02-31', items: [{ oquvchi_id: ids[0], holat: 'keldi' }] }, OQ); t('mavjud bo\'lmagan sana → 400', r.s === 400, r);
  r = await call('PUT', `/oqituvchi-panel/guruhlar/${GID}/davomat`, { sana: '2026-10-26', items: [{ oquvchi_id: ids[0], holat: 'yoq' }] }, OQ); t('noto\'g\'ri holat → 400', r.s === 400, r);
  r = await call('PUT', `/oqituvchi-panel/guruhlar/${GID}/davomat`, { sana: '2026-10-26', items: [] }, OQ); t('bo\'sh davomat → 400', r.s === 400, r);
  r = await call('PUT', `/oqituvchi-panel/guruhlar/${GID}/davomat`, { sana: '2026-10-26', items: [{ oquvchi_id: ids[0], holat: 'keldi' }, { oquvchi_id: ids[1], holat: 'kelmadi' }, { oquvchi_id: ids[2], holat: 'keldi' }] }, OQ);
  t('davomat saqlash (guruhda yo\'q o\'quvchi e\'tiborga olinmaydi)', r.s === 200 && r.d.saqlandi === 2, r);
  r = await call('GET', `/oqituvchi-panel/guruhlar/${GID}/davomat?sana=2026-10-26`, null, OQ);
  t('davomat o\'qish', r.d.items && r.d.items.length === 2 && r.d.items.find(x => x.id === ids[0]).holat === 'keldi' && r.d.items.find(x => x.id === ids[1]).holat === 'kelmadi', r);
  r = await call('PUT', `/oqituvchi-panel/guruhlar/${GID}/davomat`, { sana: '2026-10-26', items: [{ oquvchi_id: ids[1], holat: 'sababli' }] }, OQ); t('davomatni qayta saqlash (yangilanadi)', r.s === 200, r);
  r = await call('GET', `/oqituvchi-panel/guruhlar/${GID}/davomat?sana=2026-10-26`, null, OQ); t('yangilangan holat', r.d.items.find(x => x.id === ids[1]).holat === 'sababli' && r.d.items.find(x => x.id === ids[0]).holat === 'keldi', r);
  r = await call('GET', `/oqituvchi-panel/guruhlar/${GID}/davomat?sana=2026-10-27`, null, OQ); t('boshqa kun — belgilanmagan (null)', r.d.items.every(x => x.holat === null), r);


  // — O'QUVCHI PANELI
  r = await call('PUT', `/oquvchilar/${ids[0]}`, { ism: 'A', familiya: 'Aliyev', telefon: '90', telegram_id: TGS }, KA); t('o\'quvchiga Telegram ID biriktirish', r.s === 200, r);
  r = await call('PUT', `/oquvchilar/${ids[1]}`, { ism: 'B', telegram_id: TGS }, KA); t('takroriy o\'quvchi TG ID → 409', r.s === 409, r);
  r = await call('POST', '/oquvchilar', { ism: 'Dublikat', telegram_id: TGS }, KA); t('yangi o\'quvchida ham takroriy TG ID → 409', r.s === 409, r);
  r = await call('POST', '/tolovlar', { oquvchi_id: ids[1], guruh_id: GID, summa: 100000 }, KA); t('boshqa o\'quvchiga to\'lov (izolyatsiya uchun)', r.s === 200, r);
  r = await call('POST', '/auth/telegram/start', { rol: 'oquvchi' }); const ST = r.d.token; t('o\'quvchi tg start', r.s === 200 && !!ST, r);
  r = await call('POST', '/auth/telegram/bot-check', { token: ST, telegramId: TGT }, null, bot); t('o\'qituvchi ID\'si o\'quvchi tokeniga kira olmaydi', r.d.allowed === false, r);
  r = await call('POST', '/auth/telegram/start', { rol: 'oquvchi' }); const ST2 = r.d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: ST2, telegramId: TGS }, null, bot); t('o\'quvchi allowed (rol=oquvchi)', r.d.allowed === true && r.d.rol === 'oquvchi' && r.d.ism === 'A Aliyev', r);
  r = await call('POST', '/auth/telegram/bot-confirm', { token: ST2, telegramId: TGS, approve: true }, null, bot); t('o\'quvchi tasdiqlash', r.d.done === true, r);
  r = await call('GET', '/auth/telegram/poll/' + ST2); t('o\'quvchi JWT (role=oquvchi)', r.d.holat === 'approved' && r.d.role === 'oquvchi' && !!r.d.token, r);
  const SQ = r.d.token;
  r = await call('GET', '/auth/telegram/poll/' + ST2); t('o\'quvchi tokeni qayta berilmaydi', r.d.holat === 'expired' && !r.d.token, r);
  r = await call('POST', '/auth/telegram/start', { rol: 'oquvchi' }); const ST3 = r.d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: ST3, telegramId: TG }, null, bot); t('kurs admin ID\'si o\'quvchi tokeniga kira olmaydi', r.d.allowed === false, r);
  r = await call('POST', '/auth/telegram/start', { rol: 'xxx' }); const ST4 = r.d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: ST4, telegramId: TGS }, null, bot); t('noma\'lum rol → kurs_admin sifatida, o\'quvchi kira olmaydi', r.d.allowed === false, r);
  // rol ajratish
  r = await call('GET', '/stats', null, SQ); t('o\'quvchi kurs paneliga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/tolovlar', null, SQ); t('o\'quvchi umumiy to\'lovlarni ko\'ra olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/oquvchilar', null, SQ); t('o\'quvchi o\'quvchilar ro\'yxatini ko\'ra olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/oqituvchi-panel/stats', null, SQ); t('o\'quvchi o\'qituvchi API\'siga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/oquvchi-panel/stats', null, OQ); t('o\'qituvchi tokeni o\'quvchi API\'siga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/oquvchi-panel/stats', null, KA); t('kurs admin tokeni o\'quvchi API\'siga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/oquvchi-panel/stats'); t('tokensiz o\'quvchi API → 401', r.s === 401, r);
  r = await call('GET', '/auth/me', null, SQ); t('/auth/me o\'quvchi', r.d.role === 'oquvchi', r);
  // o'z ma'lumoti
  r = await call('GET', '/oquvchi-panel/stats', null, SQ);
  t('o\'quvchi statistikasi (to\'langan 600 000, davomat 100%, qoldiq/narx yo\'q)', r.d.stats && r.d.stats.guruhlar === 1 && r.d.stats.tolangan === 600000 && !('qoldiq' in r.d.stats) && r.d.stats.davomat_foiz === 100 && r.d.ism === 'Aliyev A', r);
  r = await call('GET', '/oquvchi-panel/guruhlar', null, SQ);
  t('o\'z guruhi: fan, o\'qituvchi, jadval, to\'langan (narx/qoldiq yo\'q)', r.d.guruhlar && r.d.guruhlar.length === 1 && r.d.guruhlar[0].id === GID && r.d.guruhlar[0].oqituvchi === 'Karimov Sardor' && r.d.guruhlar[0].fan_nomi === 'Python' && r.d.guruhlar[0].jadval === 'Du-Chor-Ju 19:00' && r.d.guruhlar[0].tolangan === 600000 && !('narx' in r.d.guruhlar[0]) && !('qoldiq' in r.d.guruhlar[0]) && r.d.guruhlar[0].keldi === 1, r);
  r = await call('GET', '/oquvchi-panel/guruhlar', null, SQ); t('guruhda o\'qituvchi telefoni/Telegram ID yo\'q', !('telefon' in r.d.guruhlar[0]) && !('telegram_id' in r.d.guruhlar[0]), r);
  r = await call('GET', '/oquvchi-panel/tolovlar', null, SQ); t('faqat o\'z to\'lovlari (boshqaning 100 000 si yo\'q)', r.d.items && r.d.items.length === 1 && r.d.items[0].summa === 600000 && r.d.jami === 600000 && !('kiritgan' in r.d.items[0]), r);
  r = await call('GET', `/oquvchi-panel/davomat?guruh_id=${GID}`, null, SQ); t('o\'z davomati', r.d.items && r.d.items.length === 1 && r.d.items[0].holat === 'keldi' && r.d.hisob.foiz === 100, r);
  r = await call('GET', `/oquvchi-panel/davomat?guruh_id=${GX}`, null, SQ); t('a\'zo bo\'lmagan guruh davomati → 404', r.s === 404, r);
  r = await call('GET', '/oquvchi-panel/davomat', null, SQ); t('guruh_id yo\'q → 400', r.s === 400, r);
  r = await call('GET', '/oquvchi-panel/davomat?guruh_id=abc', null, SQ); t('noto\'g\'ri guruh_id → 400', r.s === 400, r);
  r = await call('PUT', '/oquvchi-panel/davomat', { guruh_id: GID }, SQ); t('o\'quvchi hech narsani o\'zgartira olmaydi (faqat GET)', r.s === 403 || r.s === 404, r);

  // — TELEGRAM MINI APP orqali kirish (imzolangan initData)
  if (!BOT_TOKEN) console.log('⚠️  KURS_BOT_TOKEN yo\'q — Mini App testlari o\'tkazib yuborildi');
  else {
    const mini = (body) => call('POST', '/auth/telegram/miniapp', body);
    r = await mini({}); t('initData yo\'q → 401', r.s === 401 && !r.d.token, r);
    r = await mini({ initData: 'abc' }); t('buzuq initData → 401', r.s === 401 && !r.d.token, r);
    r = await mini({ initData: initFor(TGT), telegramId: TG }); t('imzo to\'g\'ri, body\'dagi telegramId e\'tiborga olinmaydi (o\'qituvchi)', r.s === 200 && r.d.role === 'oqituvchi' && r.d.ism === 'Karimov Sardor' && !!r.d.token, r);
    const MOQ = r.d.token;
    r = await call('GET', '/oqituvchi-panel/stats', null, MOQ); t('Mini App JWT o\'qituvchi API\'sida ishlaydi', r.s === 200, r);
    r = await call('GET', '/stats', null, MOQ); t('Mini App o\'qituvchi tokeni kurs paneliga kira olmaydi → 403', r.s === 403, r);
    // soxtalashtirish
    const good = initFor(TGT);
    r = await mini({ initData: good.replace('%22id%22%3A' + TGT, '%22id%22%3A' + TG) }); t('user.id almashtirilsa (imzo buziladi) → 401', r.s === 401 && !r.d.token, r);
    r = await mini({ initData: initFor(TG, {}, 'boshqa:token') }); t('boshqa bot tokeni bilan imzolangan → 401', r.s === 401 && !r.d.token, r);
    r = await mini({ initData: good.replace(/hash=[0-9a-f]{64}/, 'hash=' + '0'.repeat(64)) }); t('noto\'g\'ri hash → 401', r.s === 401, r);
    r = await mini({ initData: good.replace(/&?hash=[0-9a-f]{64}/, '') }); t('hash yo\'q → 401', r.s === 401, r);
    r = await mini({ initData: initFor(TGT, { auth_date: String(Math.floor(Date.now() / 1000) - 7200) }) }); t('eskirgan initData (2 soat) → 401', r.s === 401 && !r.d.token, r);
    r = await mini({ initData: initFor(TGT, { auth_date: String(Math.floor(Date.now() / 1000) + 3600) }) }); t('kelajak auth_date → 401', r.s === 401, r);
    r = await mini({ initData: initFor(TGT, { user: '{"id":"abc"}' }) }); t('user.id raqam emas → 401', r.s === 401, r);
    // rollar
    r = await mini({ initData: initFor('111222333') }); t('begona ID → found:false (+ID ko\'rsatiladi), JWT yo\'q', r.s === 200 && r.d.found === false && r.d.telegramId === '111222333' && !r.d.token, r);
    r = await mini({ initData: initFor(TGS) }); t('o\'quvchi Mini App orqali kiradi', r.s === 200 && r.d.role === 'oquvchi' && !!r.d.token, r);
    const MSQ = r.d.token;
    r = await call('GET', '/oquvchi-panel/stats', null, MSQ); t('Mini App JWT o\'quvchi API\'sida ishlaydi', r.s === 200, r);
    r = await mini({ initData: initFor(TG) }); t('kurs admin Mini App orqali kiradi', r.s === 200 && r.d.role === 'kurs_admin' && !!r.d.token, r);
    r = await call('GET', '/stats', null, r.d.token); t('Mini App kurs admin JWT\'i panelda ishlaydi', r.s === 200, r);
    // bir nechta rol: kurs admin ID'si ayni vaqtda o'quvchi sifatida ham biriktirilgan
    r = await call('POST', '/oquvchilar', { ism: 'Ikki', familiya: 'Rol', telegram_id: TG }, KA); t('ikkinchi rol uchun o\'quvchi yaratish', r.s === 200, r);
    const DUALID = r.d.id; ids.push(DUALID);
    r = await mini({ initData: initFor(TG) }); t('bir nechta rol → tanlash ro\'yxati, JWT yo\'q', r.s === 200 && r.d.multiple === true && r.d.roles.length === 2 && !r.d.token, r);
    r = await mini({ initData: initFor(TG), rol: 'oquvchi' }); t('tanlangan rol (oquvchi) → JWT', r.s === 200 && r.d.role === 'oquvchi' && r.d.ism === 'Rol Ikki' && !!r.d.token, r);
    r = await mini({ initData: initFor(TG), rol: 'kurs_admin' }); t('tanlangan rol (kurs_admin) → JWT', r.s === 200 && r.d.role === 'kurs_admin' && !!r.d.token, r);
    r = await mini({ initData: initFor(TG), rol: 'oqituvchi' }); t('biriktirilmagan rolni tanlab bo\'lmaydi → 403', r.s === 403 && !r.d.token, r);
    r = await mini({ initData: initFor(TG), rol: 'superadmin' }); t('noma\'lum rol → 400', r.s === 400, r);
    r = await mini({ initData: good, rol: 'kurs_admin' }); t('boshqa odamning (o\'qituvchi) ID\'si bilan kurs_admin tanlab bo\'lmaydi → 403', r.s === 403 && !r.d.token, r);

    // — Mini App → tashqi brauzer (handoff): bir martalik havola faqat tasdiqlangan egasiga beriladi
    const hand = (body) => call('POST', '/auth/telegram/miniapp-handoff', body);
    const tokOf = u => (String(u || '').match(/#bt=([A-Za-z0-9_-]{20,64})$/) || [])[1];
    r = await hand({}); t('handoff: initData yo\'q → 401, havola yo\'q', r.s === 401 && !r.d.url, r);
    r = await hand({ initData: good.replace(/hash=[0-9a-f]{64}/, 'hash=' + '0'.repeat(64)) }); t('handoff: buzuq imzo → 401', r.s === 401 && !r.d.url, r);
    r = await hand({ initData: initFor('111222333') }); t('handoff: begona ID → found:false, havola yo\'q', r.s === 200 && r.d.found === false && !r.d.url, r);
    r = await hand({ initData: initFor(TGT), rol: 'kurs_admin' }); t('handoff: boshqa rolni so\'rab bo\'lmaydi → 403', r.s === 403 && !r.d.url, r);
    r = await hand({ initData: initFor(TGT) });
    t('handoff: o\'qituvchi → https://…/index.html#bt=<token>', r.s === 200 && r.d.role === 'oqituvchi' && /^https:\/\/.+\/index\.html#bt=[A-Za-z0-9_-]{20,64}$/.test(r.d.url || ''), r);
    const HT = tokOf(r.d.url);
    r = await call('GET', '/auth/telegram/poll/' + HT); t('handoff havolasi poll orqali JWT beradi (o\'qituvchi)', r.d.holat === 'approved' && r.d.role === 'oqituvchi' && !!r.d.token, r);
    r = await call('GET', '/oqituvchi-panel/stats', null, r.d.token); t('handoff JWT o\'qituvchi API\'sida ishlaydi', r.s === 200, r);
    r = await call('GET', '/auth/telegram/poll/' + HT); t('handoff havolasi BIR MARTA ishlaydi (qayta → expired)', r.d.holat === 'expired' && !r.d.token, r);
    r = await hand({ initData: initFor(TG) }); t('handoff: bir nechta rol → tanlash ro\'yxati, havola yo\'q', r.s === 200 && r.d.multiple === true && !r.d.url, r);
    r = await hand({ initData: initFor(TG), rol: 'kurs_admin' });
    const HA = tokOf(r.d.url); t('handoff: tanlangan rol (kurs_admin) → havola', r.s === 200 && !!HA, r);
    r = await call('GET', '/auth/telegram/poll/' + HA); t('handoff kurs admin havolasi → kurs_admin JWT', r.d.holat === 'approved' && r.d.role === 'kurs_admin' && !!r.d.token, r);
    r = await call('GET', '/stats', null, r.d.token); t('handoff kurs admin JWT\'i panelda ishlaydi', r.s === 200, r);
  }

  // — nofaol qilinsa, eski token darhol ishlamaydi
  r = await call('PUT', `/kurs-adminlar/${AID}`, { ism: 'Ali', familiya: 'Valiyev', telegram_id: TG, faol: false }, SU); t('nofaol qilish', r.s === 200, r);
  r = await call('GET', '/stats', null, KA); t('nofaol adminning eski tokeni → 403', r.s === 403, r);
  const T4 = (await call('POST', '/auth/telegram/start')).d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: T4, telegramId: TG }, null, bot); t('nofaol admin bot orqali kira olmaydi', r.d.allowed === false, r);
  // nofaol o'qituvchi
  r = await call('PUT', `/oqituvchilar/${TID}`, { ism: 'Sardor', familiya: 'Karimov', fan_id: KID, telegram_id: TGT, faol: false }, SU); t('o\'qituvchini nofaol qilish', r.s === 200, r);
  r = await call('GET', '/oqituvchi-panel/stats', null, OQ); t('nofaol o\'qituvchining eski tokeni → 403', r.s === 403, r);
  const T5 = (await call('POST', '/auth/telegram/start', { rol: 'oqituvchi' })).d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: T5, telegramId: TGT }, null, bot); t('nofaol o\'qituvchi bot orqali kira olmaydi', r.d.allowed === false, r);
  if (BOT_TOKEN) { r = await call('POST', '/auth/telegram/miniapp', { initData: initFor(TGT) }); t('nofaol o\'qituvchi Mini App orqali kira olmaydi', r.s === 200 && r.d.found === false && !r.d.token, r); }
  // nofaol o'quvchi
  r = await call('PUT', `/oquvchilar/${ids[0]}`, { ism: 'A', familiya: 'Aliyev', telefon: '90', telegram_id: TGS, faol: false }, SU); t('o\'quvchini nofaol qilish', r.s === 200, r);
  r = await call('GET', '/oquvchi-panel/stats', null, SQ); t('nofaol o\'quvchining eski tokeni → 403', r.s === 403, r);
  const T6 = (await call('POST', '/auth/telegram/start', { rol: 'oquvchi' })).d.token;
  r = await call('POST', '/auth/telegram/bot-check', { token: T6, telegramId: TGS }, null, bot); t('nofaol o\'quvchi bot orqali kira olmaydi', r.d.allowed === false, r);

  // — tozalash
  await call('DELETE', `/guruhlar/${GID}`, null, SU); await call('DELETE', `/guruhlar/${GX}`, null, SU); await call('DELETE', `/guruhlar/${GMAT}`, null, SU);
  await call('DELETE', `/oqituvchilar/${TID}`, null, SU); await call('DELETE', `/oqituvchilar/${TIDX}`, null, SU); await call('DELETE', `/oqituvchilar/${TMAT}`, null, SU);
  r = await call('DELETE', `/fanlar/${KID}`, null, SU); t('guruh va o\'qituvchisiz fanni o\'chirish', r.s === 200, r); await call('DELETE', `/fanlar/${FID2}`, null, SU);
  for (const id of ids) await call('DELETE', `/oquvchilar/${id}`, null, SU);
  r = await call('DELETE', `/kurs-adminlar/${AID}`, null, SU); t('kurs adminni o\'chirish', r.s === 200, r);
  // — brute-force cheklovi
  let last; for (let i = 0; i < 12; i++) last = await call('POST', '/auth/login', { username: 'superadmin', parol: 'x' + i });
  t('ko\'p urinishdan so\'ng → 429', last.s === 429, last);
  console.log(`\n${pass} o'tdi, ${fail} xato`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
