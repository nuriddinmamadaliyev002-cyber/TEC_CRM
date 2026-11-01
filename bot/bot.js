// ═══════════════════════════════════════════════════════════════════════════
//  Today Education Centre — Telegram bot
//  1) «📚 Kursga yozilish»: [filial] → fan → guruh (kunlar, vaqt, oylik to'lov, o'qituvchi) → ism → telefon
//     → tanlangan guruh filialining admin paneli «Lidlar» bo'limiga ariza tushadi.
//  2) «💼 Vakansiyalar»: [filial] → o'qituvchi ish o'rinlari → ism → telefon → tajriba → rezyume (ixtiyoriy)
//     → shu vakansiya filialining «Nomzodlar» bo'limiga ariza tushadi.
//  [filial] — faqat bittadan ko'p faol filial bo'lsa so'raladi (bitta bo'lsa o'tkazib yuboriladi).
//  Bot tizimga kirish uchun ishlatilmaydi. Backend bilan X-Bot-Secret orqali gaplashadi.
// ═══════════════════════════════════════════════════════════════════════════
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const TOKEN  = process.env.KURS_BOT_TOKEN;
const SECRET = process.env.BOT_SECRET;
const API    = (process.env.API_BASE || 'http://127.0.0.1:3010/api').replace(/\/$/, '');

if (!TOKEN)                        { console.error("❌ KURS_BOT_TOKEN yo'q (.env)"); process.exit(1); }
if (!SECRET || SECRET.length < 24) { console.error("❌ BOT_SECRET yo'q yoki qisqa (.env)"); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });

async function api(method, path, body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': SECRET },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  return r.json();
}

// ─── Yordamchilar ────────────────────────────────────────────────────────────
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const KUN = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const money = n => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0)).replace(/ /g, ' ') + " so'm";
const normPhone = v => { const s = String(v || '').replace(/[\s()\-.]/g, ''); return /^\+?\d{9,15}$/.test(s) ? s : null; };
const HTML = { parse_mode: 'HTML', disable_web_page_preview: true };

const BTN_COURSE = '📚 Kursga yozilish', BTN_JOBS = '💼 Vakansiyalar', BTN_CANCEL = '❌ Bekor qilish', BTN_SKIP = "⏭ O'tkazib yuborish", BTN_PHONE = '📱 Raqamni yuborish';
const menuKb = { reply_markup: { keyboard: [[BTN_COURSE], [BTN_JOBS]], resize_keyboard: true } };
const cancelKb = { reply_markup: { keyboard: [[BTN_CANCEL]], resize_keyboard: true } };
const phoneKb = { reply_markup: { keyboard: [[{ text: BTN_PHONE, request_contact: true }], [BTN_CANCEL]], resize_keyboard: true, one_time_keyboard: true } };
const skipKb = { reply_markup: { keyboard: [[BTN_SKIP], [BTN_CANCEL]], resize_keyboard: true } };

// ─── Suhbat holati (xotirada; bot qayta ishga tushsa, jarayon boshidan boshlanadi) ──
const STATE_TTL = 30 * 60 * 1000;
const state = new Map(); // chatId → { type:'lid'|'nomzod', step, data, t }
const setState = (chatId, type, step, data) => state.set(chatId, { type, step, data, t: Date.now() });
const getState = chatId => { const s = state.get(chatId); if (s && Date.now() - s.t > STATE_TTL) { state.delete(chatId); return null; } return s || null; };
setInterval(() => { const n = Date.now(); for (const [k, v] of state) if (n - v.t > STATE_TTL) state.delete(k); }, 5 * 60 * 1000).unref();

const welcome = (chatId, name) => bot.sendMessage(chatId,
  `Assalomu alaykum${name ? ', ' + esc(name) : ''}! 👋\n\n<b>Today Education Centre</b> botiga xush kelibsiz.\n\n` +
  `📚 Kursga yozilish uchun «${BTN_COURSE}» tugmasini bosing.\n💼 O'qituvchi bo'lib ishlamoqchi bo'lsangiz — «${BTN_JOBS}».`, { ...HTML, ...menuKb });
const toMenu = (chatId, text) => { state.delete(chatId); return bot.sendMessage(chatId, text, menuKb); };
const serverDown = chatId => bot.sendMessage(chatId, "⚠️ Server bilan aloqa yo'q. Birozdan so'ng qayta urinib ko'ring.", menuKb);

// ─── Filial tanlash ──────────────────────────────────────────────────────────
// Faol filiallar: 0 → xabar; 1 → to'g'ridan-to'g'ri keyingi qadam; ko'p → tanlash tugmalari (prefix: 'bc' kurs, 'bj' vakansiya)
async function withFilial(chatId, prefix, next) {
  state.delete(chatId);
  let r; try { r = await api('GET', '/bot/filiallar'); } catch (e) { console.error('filiallar:', e.message); return serverDown(chatId); }
  if (!r.ok) { console.error('filiallar:', r.error); return serverDown(chatId); }
  if (!r.items.length) return bot.sendMessage(chatId, "Hozircha ma'lumot yo'q. Keyinroq qayta urinib ko'ring.", menuKb);
  if (r.items.length === 1) return next(r.items[0].id);
  bot.sendMessage(chatId, '🏢 <b>Qaysi filial?</b>', {
    ...HTML, reply_markup: { inline_keyboard: r.items.map(f => [{ text: f.nomi.slice(0, 60), callback_data: `${prefix}:${f.id}` }]) } });
}

// ─── 1) Kursga yozilish ──────────────────────────────────────────────────────
const showFans = (chatId) => withFilial(chatId, 'bc', fid => showFanList(chatId, fid));

async function showFanList(chatId, filialId) {
  let r; try { r = await api('GET', '/bot/kurslar?filial_id=' + filialId); } catch (e) { console.error('kurslar:', e.message); return serverDown(chatId); }
  if (!r.ok) return bot.sendMessage(chatId, 'Bu filial hozircha mavjud emas.', menuKb);
  if (!r.fanlar.length) return bot.sendMessage(chatId, `🏢 ${esc(r.filial.nomi)}\n\nHozircha yozilish uchun ochiq guruhlar yo'q. Keyinroq qayta urinib ko'ring.`, { ...HTML, ...menuKb });
  bot.sendMessage(chatId, `🏢 <b>${esc(r.filial.nomi)}</b>\n\n📚 <b>Qaysi fan bo'yicha o'qimoqchisiz?</b>`, {
    ...HTML, reply_markup: { inline_keyboard: r.fanlar.map(f => [{ text: f.nomi.slice(0, 60), callback_data: `f:${filialId}:${f.id}` }]) } });
}

const MAX_GROUPS = 10;
async function showGroups(chatId, filialId, fanId) {
  let r; try { r = await api('GET', '/bot/kurslar?filial_id=' + filialId); } catch (e) { console.error('kurslar:', e.message); return serverDown(chatId); }
  const fan = r.ok && r.fanlar.find(f => f.id === fanId);
  if (!fan) return bot.sendMessage(chatId, "Bu fan bo'yicha hozircha ochiq guruh yo'q.", menuKb);
  await bot.sendMessage(chatId, `<b>${esc(fan.nomi)}</b> · 🏢 ${esc(r.filial.nomi)}${fan.tavsif ? '\n' + esc(fan.tavsif) : ''}\n\nQuyidagi guruhlardan birini tanlang 👇`, HTML);
  for (const g of fan.guruhlar.slice(0, MAX_GROUPS)) {
    const kunlar = (g.kunlar || []).map(k => KUN[k - 1]).filter(Boolean).join(', ');
    const lines = [`📘 <b>${esc(g.nomi)}</b>`,
      g.oqituvchi ? `👨‍🏫 O'qituvchi: ${esc(g.oqituvchi)}` : null,
      kunlar ? `🗓 Dars kunlari: ${esc(kunlar)}` : null,
      g.soat ? `🕒 Dars vaqti: ${esc(g.soat)}` : null,
      `💰 Oylik to'lov: ${g.oylik_narx > 0 ? money(g.oylik_narx) : 'Admin bilan kelishiladi'}`,
      g.boshlanish ? `🚀 Boshlanishi: ${esc(g.boshlanish)}` : null,
      `👥 Bo'sh joylar: ${g.bosh_joy}`].filter(Boolean);
    await bot.sendMessage(chatId, lines.join('\n'), { ...HTML, reply_markup: { inline_keyboard: [[{ text: '✅ Shu guruhga yozilaman', callback_data: 'g:' + g.id }]] } });
  }
  if (fan.guruhlar.length > MAX_GROUPS) await bot.sendMessage(chatId, "Boshqa guruhlar haqida bilish uchun admin bilan bog'laning.");
}

// ─── 2) Vakansiyalar ─────────────────────────────────────────────────────────
const showJobs = (chatId) => withFilial(chatId, 'bj', fid => showJobList(chatId, fid));

async function showJobList(chatId, filialId) {
  let r; try { r = await api('GET', '/bot/vakansiyalar?filial_id=' + filialId); } catch (e) { console.error('vakansiyalar:', e.message); return serverDown(chatId); }
  if (!r.ok) return bot.sendMessage(chatId, 'Bu filial hozircha mavjud emas.', menuKb);
  if (!r.items.length) return bot.sendMessage(chatId, `🏢 ${esc(r.filial.nomi)}\n\nHozircha ochiq vakansiyalar yo'q. Keyinroq qayta urinib ko'ring.`, { ...HTML, ...menuKb });
  bot.sendMessage(chatId, `🏢 <b>${esc(r.filial.nomi)}</b>\n\n💼 <b>Ochiq vakansiyalar</b>\nBatafsil ma'lumot uchun tanlang:`, {
    ...HTML, reply_markup: { inline_keyboard: r.items.slice(0, 20).map(v => [{ text: v.nomi.slice(0, 60), callback_data: 'v:' + v.id }]) } });
}
async function showJob(chatId, id) {
  let r; try { r = await api('GET', '/bot/vakansiya/' + id); } catch (e) { console.error('vakansiya:', e.message); return serverDown(chatId); }
  if (!r.ok) return bot.sendMessage(chatId, 'Bu vakansiya yopilgan.', menuKb);
  const v = r.item;
  const lines = [`💼 <b>${esc(v.nomi)}</b>`, v.fan_nomi ? `📚 Fan: ${esc(v.fan_nomi)}` : null, v.maosh ? `💰 Maosh: ${esc(v.maosh)}` : null,
    v.tavsif ? `\n${esc(v.tavsif)}` : null, v.talablar ? `\n<b>Talablar:</b>\n${esc(v.talablar)}` : null].filter(Boolean);
  bot.sendMessage(chatId, lines.join('\n'), { ...HTML, reply_markup: { inline_keyboard: [[{ text: '✍️ Ariza topshirish', callback_data: 'va:' + v.id }]] } });
}

// ─── Ariza yig'ish (ism → telefon → [tajriba → rezyume]) ─────────────────────
const who = msg => ({ telegram_id: msg.from.id, username: msg.from.username || '' });

async function submit(msg, st) {
  const chatId = msg.chat.id, d = st.data;
  state.delete(chatId);
  try {
    const r = st.type === 'lid'
      ? await api('POST', '/bot/lid', { guruh_id: d.guruh_id, ism: d.ism, telefon: d.telefon, ...who(msg) })
      : await api('POST', '/bot/nomzod', { vakansiya_id: d.vakansiya_id, ism: d.ism, telefon: d.telefon, tajriba: d.tajriba,
          rezyume_file_id: d.rezyume_file_id, rezyume_nomi: d.rezyume_nomi, ...who(msg) });
    if (!r.ok) {
      console.error('submit:', r.error);
      return bot.sendMessage(chatId, `⚠️ ${esc(r.error || 'Xatolik')}. Iltimos, qaytadan urinib ko'ring.`, menuKb);
    }
    if (r.takror) return bot.sendMessage(chatId, "ℹ️ Sizning arizangiz allaqachon qabul qilingan va ko'rib chiqilmoqda. Tez orada siz bilan bog'lanamiz.", menuKb);
    return bot.sendMessage(chatId, st.type === 'lid'
      ? "✅ Arizangiz qabul qilindi!\n\nTez orada admin siz bilan bog'lanadi."
      : "✅ Arizangiz qabul qilindi!\n\nNomzodingiz ko'rib chiqiladi va siz bilan bog'lanamiz. Rahmat!", menuKb);
  } catch (e) { console.error('submit xato:', e.message); return serverDown(chatId); }
}

async function onStep(msg, st) {
  const chatId = msg.chat.id, text = typeof msg.text === 'string' ? msg.text.trim() : '';
  st.t = Date.now();
  switch (st.step) {
    case 'ism':
      if (text.length < 2 || text.length > 100) return bot.sendMessage(chatId, "Iltimos, ism va familiyangizni to'g'ri yozing (2–100 belgi).");
      st.data.ism = text; st.step = 'telefon';
      return bot.sendMessage(chatId, "📱 Telefon raqamingizni yuboring (pastdagi tugma orqali yoki yozing, masalan: +998901234567).", phoneKb);
    case 'telefon': {
      const raw = msg.contact ? (String(msg.contact.phone_number).startsWith('+') ? msg.contact.phone_number : '+' + msg.contact.phone_number) : text;
      const p = normPhone(raw);
      if (!p) return bot.sendMessage(chatId, "Telefon raqami noto'g'ri. Masalan: +998901234567", phoneKb);
      st.data.telefon = p;
      if (st.type === 'lid') return submit(msg, st);
      st.step = 'tajriba';
      return bot.sendMessage(chatId, "🧑‍🏫 O'zingiz va ish tajribangiz haqida qisqacha yozing (qaysi fan, necha yil, ish joylari, sertifikatlar).", cancelKb);
    }
    case 'tajriba':
      if (text.length < 5) return bot.sendMessage(chatId, "Iltimos, tajribangiz haqida batafsilroq yozing.");
      st.data.tajriba = text.slice(0, 2000); st.step = 'rezyume';
      return bot.sendMessage(chatId, "📎 Rezyumeni fayl (PDF, Word) yoki rasm sifatida yuboring. Yo'q bo'lsa, «O'tkazib yuborish»ni bosing.", skipKb);
    case 'rezyume':
      if (msg.document) { st.data.rezyume_file_id = msg.document.file_id; st.data.rezyume_nomi = msg.document.file_name || 'rezyume'; return submit(msg, st); }
      if (msg.photo && msg.photo.length) { st.data.rezyume_file_id = msg.photo[msg.photo.length - 1].file_id; st.data.rezyume_nomi = 'rezyume.jpg'; return submit(msg, st); }
      if (text === BTN_SKIP) return submit(msg, st);
      return bot.sendMessage(chatId, "Iltimos, fayl yoki rasm yuboring, yoki «O'tkazib yuborish»ni bosing.", skipKb);
  }
}

// ─── Xabarlar ────────────────────────────────────────────────────────────────
bot.on('message', async msg => {
  if (msg.chat.type !== 'private' || !msg.from) return;
  const chatId = msg.chat.id, text = typeof msg.text === 'string' ? msg.text.trim() : '';
  try {
    if (/^\/start(\s|$|@)/.test(text)) { state.delete(chatId); return welcome(chatId, msg.from.first_name); }
    if (text === BTN_CANCEL || /^\/cancel(\s|$|@)/.test(text)) return toMenu(chatId, 'Bekor qilindi. Asosiy menyu 👇');
    if (text === BTN_COURSE || /^\/kurs(\s|$|@)/.test(text)) return showFans(chatId);
    if (text === BTN_JOBS || /^\/vakansiya(\s|$|@)/.test(text)) return showJobs(chatId);
    const st = getState(chatId);
    if (st) return onStep(msg, st);
    return bot.sendMessage(chatId, 'Quyidagi menyudan tanlang 👇', menuKb);
  } catch (e) { console.error('message xato:', e.message); }
});

bot.on('callback_query', async q => {
  bot.answerCallbackQuery(q.id).catch(() => {});
  const chatId = q.message && q.message.chat.id;
  const m = /^(bc|bj|f|g|v|va):(\d{1,9})(?::(\d{1,9}))?$/.exec(String(q.data || ''));
  if (!chatId || !m) return;
  const id = Number(m[2]);
  try {
    if (m[1] === 'bc') return showFanList(chatId, id);
    if (m[1] === 'bj') return showJobList(chatId, id);
    if (m[1] === 'f') return m[3] ? showGroups(chatId, id, Number(m[3])) : undefined;
    if (m[1] === 'v') return showJob(chatId, id);
    if (m[1] === 'g') { setState(chatId, 'lid', 'ism', { guruh_id: id }); return bot.sendMessage(chatId, "✍️ Ism va familiyangizni yozing:", cancelKb); }
    if (m[1] === 'va') { setState(chatId, 'nomzod', 'ism', { vakansiya_id: id }); return bot.sendMessage(chatId, "✍️ Ism va familiyangizni yozing:", cancelKb); }
  } catch (e) { console.error('callback xato:', e.message); }
});

bot.setMyCommands([{ command: 'start', description: 'Boshlash' }, { command: 'kurs', description: 'Kursga yozilish' },
  { command: 'vakansiya', description: 'Vakansiyalar' }, { command: 'cancel', description: 'Bekor qilish' }]).catch(e => console.error('setMyCommands xato:', e.message));
bot.setChatMenuButton({ menu_button: JSON.stringify({ type: 'commands' }) }).catch(e => console.error('setChatMenuButton xato:', e.message));
bot.on('polling_error', e => console.error('polling xato:', e.code, e.message));
console.log('✅ Today Education Centre boti ishga tushdi');
