// ═══════════════════════════════════════════════════════════════════════════
//  InnovateIT Courses — kirish boti
//  Oqim: web "Telegram orqali kirish" → t.me/Bot?start=login_<token>
//        → bot /start'ni oladi (Telegram ID soxtalashtirib bo'lmaydi)
//        → backendga bot-check → "✅ Tasdiqlayman" tugmasi → bot-confirm
// ═══════════════════════════════════════════════════════════════════════════
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const TOKEN  = process.env.KURS_BOT_TOKEN;
const SECRET = process.env.BOT_SECRET;
const API    = (process.env.API_BASE || 'http://127.0.0.1:3010/api').replace(/\/$/, '');

if (!TOKEN)                      { console.error('❌ KURS_BOT_TOKEN yo\'q (.env)'); process.exit(1); }
if (!SECRET || SECRET.length < 24) { console.error('❌ BOT_SECRET yo\'q yoki qisqa (.env)'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });

async function api(path, body) {
  const r = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': SECRET },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  return r.json();
}

// Web panel manzili (https). Telegram http:// havolali tugmalarni qabul qilmaydi — Mini App tugmasi faqat https bo'lsa ishlaydi.
const WEB_URL = String(process.env.WEB_URL || '').trim().replace(/\/+$/, '');

// «Tizimga kirish» tugmasi → web/miniapp.html (imzolangan initData tekshiriladi) va foydalanuvchi to'g'ridan-to'g'ri
// o'z paneliga (Mini App oynasining o'zida) o'tadi. Tugma faqat https bo'lsa ishlaydi.
const MINIAPP_URL = /^https:\/\//i.test(WEB_URL) ? WEB_URL + '/miniapp.html' : null;
const miniAppRow = MINIAPP_URL ? [[{ text: '🔐 Tizimga kirish', web_app: { url: MINIAPP_URL } }]] : [];

// Chatdagi menyu tugmasi ham xuddi shu kirishni ochsin (xato bo'lsa bot to'xtamaydi)
if (MINIAPP_URL) {
  bot.setChatMenuButton({ menu_button: JSON.stringify({ type: 'web_app', text: 'Tizimga kirish', web_app: { url: MINIAPP_URL } }) })
    .catch(e => console.error('setChatMenuButton xato:', e.message));
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

bot.onText(/^\/miniapp$/, msg => {
  if (msg.chat.type !== 'private') return;
  if (!MINIAPP_URL) return bot.sendMessage(msg.chat.id, "⚠️ Kirish tugmasi hozircha sozlanmagan (WEB_URL https:// bo'lishi kerak).");
  bot.sendMessage(msg.chat.id, "Tizimga kirish uchun quyidagi tugmani bosing. Kirish faqat sizning Telegram hisobingiz uchun ishlaydi.", { reply_markup: { inline_keyboard: miniAppRow } });
});

// «🔐 Tizimga kirish» tugmasi doimo shu chatda turadi: xabar tepaga qadaladi (pin), menyu tugmasi ham bor,
// shuningdek istalgan matn yozilsa bot tugmani qayta yuboradi. Tugma muddatsiz ishlaydi — har bosganda Telegram yangi imzolangan
// initData beradi va kirish avtomatik bajariladi (vaqt cheklovi yo'q).
async function sendLoginPrompt(chatId, userId) {
  let r;
  try { r = await api('/auth/telegram/bot-roles', { telegramId: userId }); }
  catch (e) { console.error('bot-roles xato:', e.message); }
  if (!r || !r.ok) {
    if (r) console.error('bot-roles:', r.error);
    return bot.sendMessage(chatId, "⚠️ Server bilan aloqa yo'q. Birozdan so'ng qayta urinib ko'ring.");
  }
  if (r.roles && r.roles.length) {
    if (!MINIAPP_URL) return bot.sendMessage(chatId, "⚠️ Kirish tugmasi hozircha sozlanmagan (bot/.env da WEB_URL https:// bilan bo'lishi kerak).");
    const sent = await bot.sendMessage(chatId,
      `Salom, ${r.roles[0].ism}! 👋\n\nTizimga kirish uchun quyidagi tugmani bosing. Kirish faqat sizning Telegram hisobingiz uchun ishlaydi.`,
      { reply_markup: { inline_keyboard: miniAppRow } });
    bot.pinChatMessage(chatId, sent.message_id, { disable_notification: true }).catch(() => {});
    return sent;
  }
  return bot.sendMessage(chatId,
    "Assalomu alaykum! 👋\n\nSizning Telegram ID'ingiz hali tizimga biriktirilmagan.\n" +
    "Iltimos, maktab adminingiz bilan bog'laning va ushbu Telegram ID'ingizni unga yuboring:\n\n" +
    `🆔 ${userId}`);
}

bot.onText(/^\/start(?:\s+(\S+))?$/, async (msg, m) => {
  if (msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const param = m[1] || '';

  if (!param.startsWith('login_')) {
    // To'g'ridan-to'g'ri kirish: Telegram ID biriktirilgan bo'lsa — FAQAT «Tizimga kirish» tugmasi.
    // (Bir martalik tokenli URL tugmasi berilmaydi: xabar boshqaga yuborilsa, u shu havola bilan kirib ketardi.
    //  Mini App esa har bosgan odamning o'z imzolangan ID'sini tekshiradi.)
    return sendLoginPrompt(chatId, msg.from.id);
  }

  const token = param.slice(6);
  if (!TOKEN_RE.test(token)) return bot.sendMessage(chatId, "❌ Havola noto'g'ri. Web paneldan qayta urinib ko'ring.");

  try {
    const r = await api('/auth/telegram/bot-check', { token, telegramId: msg.from.id });
    if (!r.ok) throw new Error(r.error || 'xato');
    if (!r.allowed) {
      return bot.sendMessage(chatId, r.sabab === 'ruxsat'
        ? `⛔ Sizga kirish ruxsati berilmagan.\n\n🆔 Telegram ID'ingiz: ${msg.from.id}\nUni superadminga yuboring.`
        : "⌛ Havola eskirgan yoki ishlatilgan. Web paneldan qayta urinib ko'ring.");
    }
    bot.sendMessage(chatId,
      `Salom, ${r.ism}! 👋\n\nBoshqaruv paneliga kirishni tasdiqlaysizmi?\n` +
      "Agar buni siz boshlamagan bo'lsangiz — «Bekor qilish»ni bosing.",
      { reply_markup: { inline_keyboard: [[
        { text: '✅ Tasdiqlayman', callback_data: 'ok:' + token },
        { text: '❌ Bekor qilish', callback_data: 'no:' + token },
      ]] } });
  } catch (e) {
    console.error('bot-check xato:', e.message);
    bot.sendMessage(chatId, "⚠️ Server bilan aloqa yo'q. Birozdan so'ng qayta urinib ko'ring.");
  }
});

// Istalgan boshqa matn → kirish tugmasi qayta chiqadi (tugma doim qo'l ostida bo'lsin)
bot.on('message', msg => {
  if (msg.chat.type !== 'private' || typeof msg.text !== 'string') return;
  if (/^\/(start|miniapp)(\s|$|@)/.test(msg.text)) return;
  sendLoginPrompt(msg.chat.id, msg.from.id).catch(e => console.error('prompt xato:', e.message));
});

bot.on('callback_query', async (q) => {
  const [act, token] = String(q.data || '').split(':');
  const chatId = q.message && q.message.chat.id;
  bot.answerCallbackQuery(q.id).catch(() => {});
  if (!chatId || !['ok', 'no'].includes(act) || !TOKEN_RE.test(token || '')) return;
  try {
    const r = await api('/auth/telegram/bot-confirm', { token, telegramId: q.from.id, approve: act === 'ok' });
    const text = !r.done ? "⌛ Havola eskirgan. Web paneldan qayta urinib ko'ring."
      : act === 'ok' ? '✅ Tasdiqlandi! Brauzerga qayting — panel ochiladi.' : '❌ Kirish bekor qilindi.';
    bot.editMessageText(text, { chat_id: chatId, message_id: q.message.message_id }).catch(() => {});
  } catch (e) {
    console.error('bot-confirm xato:', e.message);
    bot.sendMessage(chatId, "⚠️ Server bilan aloqa yo'q. Qayta urinib ko'ring.");
  }
});

bot.on('polling_error', e => console.error('polling xato:', e.code, e.message));
console.log('✅ Kirish boti ishga tushdi');
