// «Tizimga kirish»: Telegram bergan `initData` (bot tokeni bilan imzolangan) backendga yuboriladi; Telegram ID'ni backend
// shu imzodan oladi (soxtalashtirib bo'lmaydi). Backend JWT qaytaradi va foydalanuvchi Mini App oynasining o'zida,
// oraliq oynasiz, o'z paneliga (kurs admin / o'qituvchi / o'quvchi) o'tadi.
(function () {
  const $ = id => document.getElementById(id);
  const views = ['v-load', 'v-roles', 'v-none', 'v-err'];
  const show = id => views.forEach(v => $(v).classList.toggle('hidden', v !== id));

  const NOM = { kurs_admin: '🛠 Kurs admin paneli', oqituvchi: "🧑‍🏫 O'qituvchi paneli", oquvchi: "🎓 O'quvchi paneli" };
  const dest = r => (r === 'oqituvchi' ? 'oqituvchi.html' : r === 'oquvchi' ? 'oquvchi.html' : 'panel.html');

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch (_) {} }
  const initData = (tg && tg.initData) || '';

  function fail(msg) { $('err-msg').textContent = msg; show('v-err'); }

  async function login(rol) {
    show('v-load');
    try {
      const d = await IC.api('POST', '/auth/telegram/miniapp', rol ? { initData, rol } : { initData });
      if (!d.found) { $('tgid').textContent = d.telegramId || ''; return show('v-none'); }
      if (d.multiple) {
        $('roles').innerHTML = d.roles.map(r =>
          `<button class="btn" type="button" data-r="${IC.esc(r.rol)}" style="margin-bottom:10px">${IC.esc(NOM[r.rol] || r.rol)}<span class="muted" style="font-weight:500"> · ${IC.esc(r.ism)}</span></button>`).join('');
        return show('v-roles');
      }
      IC.session.save(d.token, d.role, d.ism);
      // Sessiya saqlanmasa (brauzer xotirasi yopiq), panel yana shu sahifaga qaytaradi — cheksiz aylana bo'lmasin
      if (IC.session.token() !== d.token) return fail("Sessiyani saqlab bo'lmadi (brauzer xotirasi yopiq). Telegram'ni yangilab, qayta urinib ko'ring.");
      location.replace(dest(d.role));
    } catch (x) { fail(x.message); }
  }

  $('roles').onclick = e => { const b = e.target.closest('button[data-r]'); if (b) login(b.dataset.r); };
  $('retry').onclick = () => (initData ? login() : location.reload());
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('tgid').textContent); IC.toast('Nusxalandi'); }
    catch (_) { IC.toast("Nusxalab bo'lmadi — ID'ni qo'lda belgilab oling", true); }
  };

  // Aylanani aniqlash: 20 soniyada 4 martadan ko'p ochilsa — to'xtatib, sababni ko'rsatamiz
  let loop = false;
  try {
    const now = Date.now(), L = JSON.parse(sessionStorage.getItem('ic_mini') || '[]').filter(t => now - t < 20000);
    L.push(now); sessionStorage.setItem('ic_mini', JSON.stringify(L)); loop = L.length > 4;
  } catch (_) {}
  if (loop) { try { sessionStorage.removeItem('ic_mini'); } catch (_) {} IC.session.clear(); fail("Panel qayta-qayta kirish sahifasiga qaytaryapti. Server logini tekshiring yoki «Qayta urinish»ni bosing."); }
  else if (!initData) fail("Bu sahifa Telegram ichida ochilishi kerak. Botdagi «Tizimga kirish» tugmasini bosing.");
  else login();
})();
