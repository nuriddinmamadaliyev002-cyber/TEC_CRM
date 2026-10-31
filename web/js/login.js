// Bu sahifa FAQAT superadmin uchun (username + parol). Kurs admin, o'qituvchi va o'quvchi Telegram botdagi «Tizimga kirish» tugmasi orqali kiradi.
(function () {
  const $ = id => document.getElementById(id);
  const dest = r => (r === 'superadmin' ? 'superadmin.html' : r === 'oqituvchi' ? 'oqituvchi.html' : r === 'oquvchi' ? 'oquvchi.html' : 'panel.html');

  // Telegram botdan kelgan bir martalik havola: index.html#bt=<token> → JWT'ga almashtiriladi va panelga o'tiladi
  const m = location.hash.match(/^#bt=([A-Za-z0-9_-]{20,64})$/);
  if (m) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} // token manzilda qolmasin
    $('v-super').classList.add('hidden'); $('bt-wait').classList.remove('hidden');
    IC.api('GET', '/auth/telegram/poll/' + m[1]).then(d => {
      if (d.holat === 'approved' && d.token) { IC.session.save(d.token, d.role, d.ism); location.replace(dest(d.role)); }
      else throw new Error('Havola eskirgan yoki ishlatilgan. Telegram botdagi «Tizimga kirish» tugmasini qayta bosing.');
    }).catch(x => { $('bt-wait').classList.add('hidden'); $('bt-err').textContent = x.message; $('bt-fail').classList.remove('hidden'); });
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
