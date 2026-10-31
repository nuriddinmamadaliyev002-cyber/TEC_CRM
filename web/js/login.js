// Bu sahifa FAQAT superadmin uchun (username + parol). Kurs admin, o'qituvchi va o'quvchi Telegram botdagi «Tizimga kirish» tugmasi orqali kiradi.
(function () {
  const $ = id => document.getElementById(id);
  const dest = r => (r === 'superadmin' ? 'superadmin.html' : r === 'oqituvchi' ? 'oqituvchi.html' : r === 'oquvchi' ? 'oquvchi.html' : 'panel.html');

  // Telegram botdan kelgan bir martalik havola: index.html#bt=<token> → JWT'ga almashtiriladi va panelga o'tiladi
  const m = location.hash.match(/^#bt=([A-Za-z0-9_-]{20,64})$/);
  if (m) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} // token manzilda qolmasin
    // Kirish jarayonida hech qanday oyna/yozuv ko'rinmasin: karta yashirin, faqat xato bo'lsa ko'rsatiladi
    const card = document.querySelector('.login'); card.classList.add('hidden');
    $('v-super').classList.add('hidden');
    IC.api('GET', '/auth/telegram/poll/' + m[1]).then(d => {
      if (d.holat === 'approved' && d.token) { IC.session.save(d.token, d.role, d.ism); location.replace(dest(d.role)); }
      else throw new Error('Havola eskirgan yoki ishlatilgan. Telegram botdagi «Tizimga kirish» tugmasini qayta bosing.');
    }).catch(x => { document.querySelector('.sub').textContent = 'Online kurslar boshqaruvi'; $('bt-err').textContent = x.message; $('bt-fail').classList.remove('hidden'); card.classList.remove('hidden'); });
    return;
  }

  // Botdagi tugmadan kelgan xato: index.html#xato=<sabab>[&tg=<id>]
  const em = location.hash.match(/^#xato=([a-z]+)(?:&tg=(\d{1,15}))?$/);
  if (em) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {}
    const MSG = {
      id: "Sizning Telegram ID'ingiz" + (em[2] ? ' (' + em[2] + ')' : '') + " tizimga biriktirilmagan. Iltimos, o'quv markaz adminingizga shu ID'ni yuboring.",
      rol: "Bu rol uchun ruxsat yo'q. Botdagi tugmani qayta bosing.",
      imzo: "Telegram ma'lumoti tasdiqlanmadi. Botdagi «Tizimga kirish» tugmasini qayta bosing.",
      eskirgan: "Havola eskirgan. Botdagi «Tizimga kirish» tugmasini qayta bosing.",
      server: "Server xatoligi. Birozdan so'ng qayta urinib ko'ring.",
    };
    $('v-super').classList.add('hidden'); document.querySelector('.sub').textContent = 'Online kurslar boshqaruvi';
    $('bt-err').textContent = MSG[em[1]] || 'Kirishda xatolik. Botdagi tugmani qayta bosing.';
    $('bt-fail').classList.remove('hidden');
    return;
  }

  // Allaqachon kirgan bo'lsa — o'z sahifasiga
  if (IC.session.token() && IC.session.role()) { location.replace(dest(IC.session.role())); return; }

  $('u').focus();
  $('v-super').onsubmit = async e => {
    e.preventDefault(); $('su-err').textContent = '';
    $('su-go').disabled = true;
    try {
      const d = await IC.api('POST', '/auth/login', { username: $('u').value.trim(), parol: $('p').value });
      IC.session.save(d.token, d.role, d.ism); location.href = dest(d.role);
    } catch (x) { $('su-err').textContent = x.message; $('p').value = ''; }
    $('su-go').disabled = false;
  };
})();
