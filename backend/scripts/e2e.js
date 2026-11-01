// End-to-end tekshiruv (ishlayotgan server + baza kerak):  node scripts/e2e.js
// Kerakli muhit: PORT, BOT_SECRET, SUPERADMIN_USERNAME=superadmin (parol: TestParol123 — hash .env da).
// Server VA test LOGIN_MAX_ATTEMPTS=100 bilan ishga tushirilsin (aks holda test o'zi login cheklovi ostiga tushadi). KURS_BOT_TOKEN ixtiyoriy.
require('dotenv').config();
const B = `http://127.0.0.1:${process.env.PORT || 3010}/api`;
let pass = 0, fail = 0;
const t = (name, ok, extra) => { ok ? pass++ : fail++; console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : '  → ' + JSON.stringify(extra)}`); };
async function call(m, p, body, tok, hdr = {}) {
  const r = await fetch(B + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...hdr }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})) };
}
const BOT = { 'X-Bot-Secret': process.env.BOT_SECRET };
const YDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);   // kecha (to'lov/davomat sanasi)
const LMAX = Math.max(1, parseInt(process.env.LOGIN_MAX_ATTEMPTS, 10) || 10);
const SFX = Math.random().toString(36).slice(2, 7);                        // login nomlari takrorlanmasin
(async () => {
  // — superadmin
  let r = await call('POST', '/auth/login', { username: 'superadmin', parol: 'xato' }); t('noto\'g\'ri parol → 401', r.s === 401, r);
  r = await call('POST', '/auth/login', { username: 'boshqa', parol: 'TestParol123' }); t('noto\'g\'ri login → 401', r.s === 401, r);
  r = await call('POST', '/auth/login', {}); t('bo\'sh login → 401', r.s === 401, r);
  r = await call('POST', '/auth/login', { username: 'superadmin', parol: 'TestParol123' }); t('superadmin login', r.s === 200 && r.d.token && r.d.role === 'superadmin', r);
  const SU = r.d.token;
  r = await call('GET', '/kurs-adminlar'); t('tokensiz → 401', r.s === 401, r);
  r = await call('GET', '/auth/me', null, SU); t('/auth/me superadmin', r.d.role === 'superadmin', r);

  // — Telegram orqali kirish butunlay olib tashlangan
  for (const p of ['/auth/telegram/start', '/auth/telegram/miniapp', '/auth/telegram/bot-roles', '/auth/telegram/bot-check']) {
    r = await call('POST', p, {}, SU); t(`eski ${p} yo'q → 404`, r.s === 404, r);
  }
  r = await call('GET', '/oqituvchi-panel/stats', null, SU); t('o\'qituvchi paneli API yo\'q', r.s === 401 || r.s === 404, r);
  r = await call('GET', '/oquvchi-panel/stats', null, SU); t('o\'quvchi paneli API yo\'q', r.s === 401 || r.s === 404, r);

  // — superadmin admin yaratadi (login + parol)
  const LOGIN = 'ali_' + SFX;
  r = await call('POST', '/kurs-adminlar', { ism: '', login: LOGIN, parol: 'Parol12345' }, SU); t('ismsiz → 400', r.s === 400, r);
  r = await call('POST', '/kurs-adminlar', { ism: 'Ali', login: 'ab', parol: 'Parol12345' }, SU); t('qisqa login → 400', r.s === 400, r);
  r = await call('POST', '/kurs-adminlar', { ism: 'Ali', login: 'a b c d', parol: 'Parol12345' }, SU); t('bo\'sh joyli login → 400', r.s === 400, r);
  r = await call('POST', '/kurs-adminlar', { ism: 'Ali', login: LOGIN, parol: 'qisqa' }, SU); t('qisqa parol → 400', r.s === 400, r);
  r = await call('POST', '/kurs-adminlar', { ism: 'Ali', login: LOGIN }, SU); t('parolsiz → 400', r.s === 400, r);
  r = await call('POST', '/kurs-adminlar', { ism: 'Ali', login: 'SuperAdmin', parol: 'Parol12345' }, SU); t('superadmin logini band → 400', r.s === 400, r);
  r = await call('POST', '/kurs-adminlar', { ism: 'Ali', familiya: 'Valiyev', telefon: '+998901234567', login: LOGIN, parol: 'Parol12345' }, SU);
  t('admin yaratish', r.s === 200 && r.d.admin.login === LOGIN && r.d.admin.parol_bor === true, r);
  t('javobda parol/hash yo\'q', !JSON.stringify(r.d).includes('parol_hash') && !JSON.stringify(r.d).includes('Parol12345'), r.d);
  const AID = r.d.admin && r.d.admin.id;
  r = await call('POST', '/kurs-adminlar', { ism: 'Dublikat', login: LOGIN.toUpperCase(), parol: 'Parol12345' }, SU); t('takroriy login (katta-kichik harfsiz) → 409', r.s === 409, r);
  r = await call('GET', '/kurs-adminlar', null, SU); t('ro\'yxatda hash yo\'q', r.s === 200 && !JSON.stringify(r.d).includes('$2'), r);

  // — admin kirishi
  r = await call('POST', '/auth/login', { username: LOGIN, parol: 'noto\'g\'ri' }); t('admin: noto\'g\'ri parol → 401', r.s === 401, r);
  const msgBad = r.d.error;
  r = await call('POST', '/auth/login', { username: 'yoq_' + SFX, parol: 'Parol12345' }); t('mavjud bo\'lmagan login: bir xil xabar', r.s === 401 && r.d.error === msgBad, r);
  r = await call('POST', '/auth/login', { username: LOGIN.toUpperCase(), parol: 'Parol12345' }); t('admin login (katta-kichik harfga befarq)', r.s === 200 && r.d.role === 'kurs_admin' && r.d.ism === 'Valiyev Ali' && !!r.d.token, r);
  const KA = r.d.token;
  r = await call('GET', '/auth/me', null, KA); t('/auth/me admin', r.d.role === 'kurs_admin', r);

  // — rol ajratish
  r = await call('GET', '/kurs-adminlar', null, KA); t('admin superadmin API\'ga kira olmaydi → 403', r.s === 403, r);
  r = await call('GET', '/stats', null, KA); t('admin panel API\'ga kiradi', r.s === 200, r);
  r = await call('GET', '/stats', null, SU); t('superadmin ham panel API\'ga kiradi', r.s === 200, r);
  r = await call('GET', '/stats'); t('tokensiz panel API → 401', r.s === 401, r);

  // — panel CRUD
  r = await call('POST', '/fanlar', { nomi: '' }, KA); t('nomsiz fan → 400', r.s === 400, r);
  r = await call('POST', '/fanlar', { nomi: 'Python', tavsif: '<b>x</b>', narx: 600000, davomiylik_oy: 3 }, KA); t('fan yaratish (narx/davomiylik e\'tiborga olinmaydi)', r.s === 200, r);
  const KID = r.d.id;
  r = await call('GET', '/fanlar', null, KA); t('fan ro\'yxatida narx/davomiylik yo\'q', r.d.fanlar && r.d.fanlar[0].nomi && !('narx' in r.d.fanlar[0]) && !('davomiylik_oy' in r.d.fanlar[0]), r);
  r = await call('GET', '/kurslar', null, KA); t('eski /kurslar yo\'li yo\'q → 404', r.s === 404, r);
  const FID2 = (await call('POST', '/fanlar', { nomi: 'Matematika' }, KA)).d.id; // boshqa fan (fan↔o'qituvchi tekshiruvlari uchun)
  r = await call('POST', '/oqituvchilar', { ism: 'Fansiz' }, KA); t('fansiz o\'qituvchi → 400', r.s === 400, r);
  r = await call('POST', '/oqituvchilar', { ism: 'X', fan_id: 99999 }, KA); t('mavjud bo\'lmagan fan bilan o\'qituvchi → 400', r.s === 400, r);
  r = await call('POST', '/oqituvchilar', { ism: 'Sardor', familiya: 'Karimov', fan_id: KID }, KA); t('o\'qituvchi yaratish (fan_id bilan)', r.s === 200, r);
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
  r = await call('PUT', `/oqituvchilar/${TID}`, { ism: 'Sardor', familiya: 'Karimov', fan_id: FID2 }, KA); t('o\'qituvchi fani boshqa fan guruhida dars berayotganda o\'zgarmaydi → 409', r.s === 409, r);
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
  r = await call('POST', '/tolovlar', { oquvchi_id: ids[0], guruh_id: GID, summa: 600000, usul: 'karta', sana: YDAY }, KA); t('to\'lov kiritish', r.s === 200, r);
  r = await call('GET', '/tolovlar', null, KA); t('to\'lovlar ro\'yxati', r.d.items && r.d.items[0].summa === 600000 && r.d.items[0].kiritgan === 'Valiyev Ali', r);
  r = await call('GET', '/stats', null, KA); t('statistika', r.d.stats.jami_tushum >= 600000 && r.d.stats.oquvchilar >= 3, r);
  r = await call('GET', '/guruhlar/abc/oquvchilar', null, KA); t('noto\'g\'ri id → 400 (500 emas)', r.s === 400, r);
  r = await call('GET', '/guruhlar', null, KA); t('guruhlar: sanoq to\'g\'ri', r.d.guruhlar.find(g => g.id === GID).oquvchilar_soni === 2, r);



  // — DAVOMAT (admin panelida)
  r = await call('GET', `/guruhlar/${GID}/davomat?sana=${YDAY}`, null, KA); t('davomat o\'qish: guruh o\'quvchilari, holat null', r.s === 200 && r.d.items.length === 2 && r.d.items.every(x => x.holat === null), r);
  r = await call('PUT', `/guruhlar/${GID}/davomat`, { sana: '2026-02-31', items: [{ oquvchi_id: ids[0], holat: 'keldi' }] }, KA); t('mavjud bo\'lmagan sana → 400', r.s === 400, r);
  r = await call('PUT', `/guruhlar/${GID}/davomat`, { sana: '2099-01-01', items: [{ oquvchi_id: ids[0], holat: 'keldi' }] }, KA); t('kelajak sanasi → 400', r.s === 400, r);
  r = await call('PUT', `/guruhlar/${GID}/davomat`, { sana: YDAY, items: [{ oquvchi_id: ids[0], holat: 'yoq' }] }, KA); t('noto\'g\'ri holat → 400', r.s === 400, r);
  r = await call('PUT', `/guruhlar/${GID}/davomat`, { sana: YDAY, items: [] }, KA); t('bo\'sh davomat → 400', r.s === 400, r);
  r = await call('PUT', `/guruhlar/99999/davomat`, { sana: YDAY, items: [{ oquvchi_id: ids[0], holat: 'keldi' }] }, KA); t('mavjud bo\'lmagan guruh → 404', r.s === 404, r);
  r = await call('GET', '/guruhlar/abc/davomat', null, KA); t('noto\'g\'ri guruh id → 400', r.s === 400, r);
  r = await call('PUT', `/guruhlar/${GID}/davomat`, { sana: YDAY, items: [{ oquvchi_id: ids[0], holat: 'keldi' }, { oquvchi_id: ids[1], holat: 'kelmadi' }, { oquvchi_id: ids[2], holat: 'keldi' }] }, KA);
  t('davomat saqlash (guruhda yo\'q o\'quvchi e\'tiborga olinmaydi)', r.s === 200 && r.d.saqlandi === 2, r);
  r = await call('PUT', `/guruhlar/${GID}/davomat`, { sana: YDAY, items: [{ oquvchi_id: ids[1], holat: 'sababli' }] }, KA); t('davomatni qayta saqlash', r.s === 200, r);
  r = await call('GET', `/guruhlar/${GID}/davomat?sana=${YDAY}`, null, KA);
  t('davomat o\'qish: saqlangan va yangilangan holatlar', r.d.items.find(x => x.id === ids[0]).holat === 'keldi' && r.d.items.find(x => x.id === ids[1]).holat === 'sababli', r);

  // — O'qituvchi/o'quvchi formalarida Telegram ID yo'q
  r = await call('POST', '/oquvchilar', { ism: 'TG', telegram_id: '123456' }, KA); t('o\'quvchi: telegram_id e\'tiborga olinmaydi', r.s === 200, r);
  { const x = (await call('GET', '/oquvchilar', null, KA)).d.items.find(o => o.id === r.d.id); t('telegram_id saqlanmadi', x && x.telegram_id === null, x); ids.push(r.d.id); }

  // — BOT API
  r = await call('GET', '/bot/kurslar'); t('bot API sirsiz → 403', r.s === 403, r);
  r = await call('GET', '/bot/kurslar', null, KA); t('bot API admin tokeni bilan → 403', r.s === 403, r);
  r = await call('GET', '/bot/kurslar', null, null, { 'X-Bot-Secret': 'x'.repeat(40) }); t('bot API noto\'g\'ri sir → 403', r.s === 403, r);
  r = await call('GET', '/bot/kurslar', null, null, BOT);
  { t('bot: fanlar ro\'yxati (200)', r.s === 200 && Array.isArray(r.d.fanlar), r);
    t('bot: faqat to\'lgan guruhi bor fan (Python, 2/2) ro\'yxatda yo\'q', !r.d.fanlar.some(f => f.id === KID), r.d.fanlar);
    const m = r.d.fanlar.find(f => f.id === FID2), gm = m && m.guruhlar.find(x => x.id === GMAT);
    t('bot: ochiq guruh: jadval, narx, o\'qituvchi, bo\'sh joy', gm && gm.jadval === 'Se-Pay 10:00' && gm.oylik_narx === 300000 && gm.oqituvchi === 'Teacher Mat' && gm.bosh_joy === 20 && JSON.stringify(gm.kunlar) === '[2,4]', gm); }
  r = await call('POST', '/bot/lid', { guruh_id: GMAT, ism: 'L', telefon: '+998901112233' }, null, BOT); t('lid: qisqa ism → 400', r.s === 400, r);
  r = await call('POST', '/bot/lid', { guruh_id: GMAT, ism: 'Lid Birinchi', telefon: '12' }, null, BOT); t('lid: noto\'g\'ri telefon → 400', r.s === 400, r);
  r = await call('POST', '/bot/lid', { guruh_id: 99999, ism: 'Lid Birinchi', telefon: '+998901112233' }, null, BOT); t('lid: mavjud bo\'lmagan guruh → 404', r.s === 404, r);
  r = await call('POST', '/bot/lid', { guruh_id: GMAT, ism: 'Lid Birinchi', telefon: '+998 90 111-22-33', telegram_id: 777001, username: '@lid_user' }, null, BOT); t('lid yaratish (telefon tozalanadi)', r.s === 200 && r.d.id, r);
  const LID1 = r.d.id;
  r = await call('POST', '/bot/lid', { guruh_id: GMAT, ism: 'Lid Birinchi', telefon: '+998901112233', telegram_id: 777001 }, null, BOT); t('lid: takroriy ariza → takror:true, yangi yozuv yo\'q', r.s === 200 && r.d.takror === true, r);
  r = await call('GET', '/lidlar', null, KA);
  { const l = r.d.items.find(x => x.id === LID1);
    t('admin: lid ro\'yxatda (holat yangi, fan/guruh, @ olib tashlangan)', l && l.holat === 'yangi' && l.fan_nomi === 'Matematika' && l.guruh_nomi === 'MAT-1' && l.telefon === '+998901112233' && l.username === 'lid_user' && l.jadval === 'Se-Pay 10:00' && l.oqituvchi_nomi === 'Teacher Mat', l);
    t('lidlar bitta (takror qo\'shilmagan)', r.d.items.filter(x => x.telegram_id === '777001').length === 1, r.d.items); }
  r = await call('GET', '/stats', null, KA); t('statistika: yangi lidlar', r.d.stats.yangi_lidlar >= 1, r.d.stats);
  r = await call('PUT', `/lidlar/${LID1}`, { holat: 'xxx' }, KA); t('lid: noto\'g\'ri holat → 400', r.s === 400, r);
  r = await call('PUT', `/lidlar/${LID1}`, { holat: 'aloqada', izoh: 'Telefon qilindi' }, KA); t('lid holati/izohi', r.s === 200, r);
  r = await call('POST', `/lidlar/${LID1}/oquvchi`, {}, KA); t('lid → o\'quvchi (guruhga qo\'shiladi)', r.s === 200 && r.d.oquvchi_id && r.d.guruhga_qoshildi === true, r);
  { const oid = r.d.oquvchi_id; ids.push(oid);
    r = await call('GET', `/guruhlar/${GMAT}/oquvchilar`, null, KA); t('yangi o\'quvchi guruhda (ism=Lid, familiya=Birinchi)', r.d.items.some(x => x.id === oid && x.ism === 'Lid' && x.familiya === 'Birinchi' && x.telefon === '+998901112233'), r); }
  r = await call('POST', `/lidlar/${LID1}/oquvchi`, {}, KA); t('lidni ikkinchi marta aylantirib bo\'lmaydi → 409', r.s === 409, r);
  r = await call('GET', '/lidlar', null, KA); t('aylantirilgan lid holati «yozildi»', r.d.items.find(x => x.id === LID1).holat === 'yozildi', r);
  r = await call('POST', '/lidlar/99999/oquvchi', {}, KA); t('mavjud bo\'lmagan lid → 404', r.s === 404, r);
  // guruh o'chsa ham lid qoladi
  r = await call('POST', '/bot/lid', { guruh_id: GMAT, ism: 'Lid Ikkinchi', telefon: '+998909998877', telegram_id: 777002 }, null, BOT); const LID2 = r.d.id;
  r = await call('POST', '/guruhlar', { oylik_narx: 1, nomi: 'Vaqtincha', fan_id: FID2 }, KA); const GTMP = r.d.id;
  r = await call('POST', '/bot/lid', { guruh_id: GTMP, ism: 'Lid Uchinchi', telefon: '+998905554433' }, null, BOT); const LID3 = r.d.id;
  await call('DELETE', `/guruhlar/${GTMP}`, null, KA);
  r = await call('GET', '/lidlar', null, KA); { const l = r.d.items.find(x => x.id === LID3); t('guruh o\'chirilsa lid qoladi (nomi saqlanadi, guruh_id null)', l && l.guruh_id === null && l.guruh_nomi === 'Vaqtincha', l); }
  r = await call('POST', `/lidlar/${LID3}/oquvchi`, {}, KA); t('guruhi o\'chgan lidni ham o\'quvchiga aylantirish mumkin (guruhsiz)', r.s === 200 && r.d.guruhga_qoshildi === false, r); ids.push(r.d.oquvchi_id);
  r = await call('DELETE', `/lidlar/${LID2}`, null, KA); t('lidni o\'chirish', r.s === 200, r);
  r = await call('DELETE', `/lidlar/${LID2}`, null, KA); t('qayta o\'chirish → 404', r.s === 404, r);

  // — VAKANSIYALAR va NOMZODLAR
  r = await call('POST', '/vakansiyalar', { nomi: '' }, KA); t('vakansiya nomsiz → 400', r.s === 400, r);
  r = await call('POST', '/vakansiyalar', { nomi: 'X', fan_id: 99999 }, KA); t('vakansiya: mavjud bo\'lmagan fan → 400', r.s === 400, r);
  r = await call('POST', '/vakansiyalar', { nomi: 'Ingliz tili o\'qituvchisi', fan_id: KID, maosh: '4–6 mln', tavsif: 'Tavsif <b>x</b>', talablar: 'IELTS 7', faol: true }, KA); t('vakansiya yaratish', r.s === 200, r);
  const VID = r.d.id;
  r = await call('POST', '/vakansiyalar', { nomi: 'Yopiq vakansiya', faol: false }, KA); const VCLOSED = r.d.id;
  r = await call('GET', '/bot/vakansiyalar', null, null, BOT); t('bot: faqat faol vakansiyalar', r.s === 200 && r.d.items.some(x => x.id === VID && x.fan_nomi === 'Python' && x.maosh === '4–6 mln') && !r.d.items.some(x => x.id === VCLOSED), r);
  r = await call('POST', '/bot/nomzod', { vakansiya_id: VCLOSED, ism: 'Nomzod Bir', telefon: '+998901000001' }, null, BOT); t('yopiq vakansiyaga ariza → 404', r.s === 404, r);
  r = await call('POST', '/bot/nomzod', { vakansiya_id: VID, ism: 'N', telefon: '+998901000001' }, null, BOT); t('nomzod: qisqa ism → 400', r.s === 400, r);
  r = await call('POST', '/bot/nomzod', { vakansiya_id: VID, ism: 'Nomzod Bir', telefon: 'abc' }, null, BOT); t('nomzod: noto\'g\'ri telefon → 400', r.s === 400, r);
  r = await call('POST', '/bot/nomzod', { vakansiya_id: VID, ism: 'Nomzod Bir', telefon: '+998901000001', tajriba: '5 yil IELTS o\'qitganman', telegram_id: 888001, username: 'nomzod1', rezyume_file_id: 'BQACAgIAAx0Cfake', rezyume_nomi: 'cv.pdf' }, null, BOT);
  t('nomzod arizasi (rezyume bilan)', r.s === 200 && r.d.id, r);
  const NID = r.d.id;
  r = await call('POST', '/bot/nomzod', { vakansiya_id: VID, ism: 'Nomzod Bir', telefon: '+998901000001', telegram_id: 888001 }, null, BOT); t('nomzod: takroriy ariza → takror:true', r.s === 200 && r.d.takror === true, r);
  r = await call('POST', '/bot/nomzod', { vakansiya_id: VID, ism: 'Nomzod Ikki', telefon: '+998901000002', tajriba: 'Yangi boshlovchi' }, null, BOT); t('nomzod arizasi (rezyumesiz)', r.s === 200, r);
  const NID2 = r.d.id;
  r = await call('GET', '/nomzodlar', null, KA);
  { const n = r.d.items.find(x => x.id === NID); t('admin: nomzod ro\'yxatda (yangi, rezyume_bor, file_id oshkor emas)', n && n.holat === 'yangi' && n.rezyume_bor === true && n.vakansiya_nomi === 'Ingliz tili o\'qituvchisi' && !JSON.stringify(r.d).includes('BQACAgIAAx0Cfake'), n);
    t('rezyumesiz nomzod: rezyume_bor=false', r.d.items.find(x => x.id === NID2).rezyume_bor === false, r.d.items); }
  r = await call('GET', '/stats', null, KA); t('statistika: yangi nomzodlar, vakansiyalar', r.d.stats.yangi_nomzodlar >= 2 && r.d.stats.vakansiyalar >= 1, r.d.stats);
  r = await call('PUT', `/nomzodlar/${NID}`, { holat: 'xxx' }, KA); t('nomzod: noto\'g\'ri holat → 400', r.s === 400, r);
  r = await call('PUT', `/nomzodlar/${NID}`, { holat: 'suhbat', izoh: 'Juma kuni suhbat' }, KA); t('nomzod holati/izohi', r.s === 200, r);
  r = await call('GET', `/nomzodlar/${NID2}/rezyume`, null, KA); t('rezyumesiz nomzod → 404', r.s === 404, r);
  r = await call('GET', `/nomzodlar/${NID}/rezyume`, null, SU); t('rezyume: Telegramdan olib bo\'lmasa → 5xx emas, 502 (yoki bot sozlanmagan 500)', r.s === 502 || r.s === 500, r);
  r = await call('GET', '/vakansiyalar', null, KA); t('vakansiyalar: nomzodlar_soni', r.d.items.find(x => x.id === VID).nomzodlar_soni === 2, r);
  r = await call('PUT', `/vakansiyalar/${VID}`, { nomi: 'Ingliz tili (yopildi)', fan_id: '', faol: false }, KA); t('vakansiyani tahrirlash/yopish', r.s === 200, r);
  r = await call('GET', '/bot/vakansiyalar', null, null, BOT); t('yopilgan vakansiya botdan yo\'qoladi', !r.d.items.some(x => x.id === VID), r);
  r = await call('DELETE', `/vakansiyalar/${VID}`, null, KA); t('vakansiyani o\'chirish', r.s === 200, r);
  r = await call('GET', '/nomzodlar', null, KA); t('vakansiya o\'chsa nomzod qoladi (nomi saqlanadi)', r.d.items.find(x => x.id === NID).vakansiya_nomi === 'Ingliz tili o\'qituvchisi' && r.d.items.find(x => x.id === NID).vakansiya_id === null, r);
  await call('DELETE', `/vakansiyalar/${VCLOSED}`, null, KA);
  r = await call('DELETE', `/nomzodlar/${NID}`, null, KA); t('nomzodni o\'chirish', r.s === 200, r);
  await call('DELETE', `/nomzodlar/${NID2}`, null, KA);

  // — admin parolini almashtirish / nofaol qilish
  r = await call('PUT', `/kurs-adminlar/${AID}`, { ism: 'Ali', familiya: 'Valiyev', login: LOGIN, parol: '', faol: true }, SU); t('parol bo\'sh = o\'zgarmaydi', r.s === 200, r);
  r = await call('POST', '/auth/login', { username: LOGIN, parol: 'Parol12345' }); t('eski parol hamon ishlaydi', r.s === 200, r);
  r = await call('PUT', `/kurs-adminlar/${AID}`, { ism: 'Ali', familiya: 'Valiyev', login: LOGIN, parol: 'qisqa' }, SU); t('yangi parol qisqa → 400', r.s === 400, r);
  r = await call('PUT', `/kurs-adminlar/${AID}`, { ism: 'Ali', familiya: 'Valiyev', login: LOGIN, parol: 'YangiParol777' }, SU); t('parolni almashtirish', r.s === 200, r);
  r = await call('POST', '/auth/login', { username: LOGIN, parol: 'Parol12345' }); t('eski parol endi ishlamaydi', r.s === 401, r);
  r = await call('POST', '/auth/login', { username: LOGIN, parol: 'YangiParol777' }); t('yangi parol ishlaydi', r.s === 200, r);
  const KA2 = r.d.token;
  r = await call('PUT', `/kurs-adminlar/99999`, { ism: 'X', login: 'xxxx_' + SFX, parol: 'Parol12345' }, SU); t('mavjud bo\'lmagan admin → 404', r.s === 404, r);
  r = await call('PUT', `/kurs-adminlar/${AID}`, { ism: 'Ali', familiya: 'Valiyev', login: LOGIN, faol: false }, SU); t('nofaol qilish', r.s === 200, r);
  r = await call('GET', '/stats', null, KA2); t('nofaol adminning eski tokeni → 403', r.s === 403, r);
  r = await call('POST', '/auth/login', { username: LOGIN, parol: 'YangiParol777' }); t('nofaol admin kira olmaydi → 401', r.s === 401, r);
  r = await call('PUT', `/kurs-adminlar/${AID}`, { ism: 'Ali', familiya: 'Valiyev', login: LOGIN, faol: true }, SU); t('qayta faollashtirish', r.s === 200, r);
  r = await call('POST', '/auth/login', { username: LOGIN, parol: 'YangiParol777' }); t('faollashtirilgach kiradi', r.s === 200, r);

  // — tozalash
  await call('DELETE', `/guruhlar/${GID}`, null, SU); await call('DELETE', `/guruhlar/${GMAT}`, null, SU);
  await call('DELETE', `/oqituvchilar/${TID}`, null, SU); await call('DELETE', `/oqituvchilar/${TMAT}`, null, SU);
  r = await call('DELETE', `/fanlar/${KID}`, null, SU); t('guruh va o\'qituvchisiz fanni o\'chirish', r.s === 200, r); await call('DELETE', `/fanlar/${FID2}`, null, SU);
  for (const id of ids) await call('DELETE', `/oquvchilar/${id}`, null, SU);
  r = await call('DELETE', `/kurs-adminlar/${AID}`, null, SU); t('adminni o\'chirish', r.s === 200, r);
  await call('DELETE', '/lidlar/' + LID1, null, SU);
  // — brute-force cheklovi
  let last; for (let i = 0; i < LMAX + 3; i++) last = await call('POST', '/auth/login', { username: 'superadmin', parol: 'x' + i });
  t('ko\'p urinishdan so\'ng → 429', last.s === 429, last);
  console.log(`\n${pass} o'tdi, ${fail} xato`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
