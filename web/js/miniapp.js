// «Tizimga kirish»: Mini App faqat «yo'naltiruvchi». Telegram bergan `initData` (bot tokeni bilan imzolangan) backendga yuboriladi;
// Telegram ID'ni backend shu imzodan oladi (soxtalashtirib bo'lmaydi). Backend shu odam uchun bir martalik (5 daqiqa) havola
// qaytaradi va u Telegram.WebApp.openLink() bilan TASHQI BRAUZERDA ochiladi (index.html#bt=…) — web panel oddiy brauzerda ishlaydi.
(function () {
  const $ = id => document.getElementById(id);
  const views = ['v-load', 'v-roles', 'v-none', 'v-err', 'v-open'];
  const show = id => views.forEach(v => $(v).classList.toggle('hidden', v !== id));

  const NOM = { kurs_admin: '🛠 Kurs admin paneli', oqituvchi: "🧑‍🏫 O'qituvchi paneli", oquvchi: "🎓 O'quvchi paneli" };

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); } catch (_) {} }
  const initData = (tg && tg.initData) || '';

  function fail(msg) { $('err-msg').textContent = msg; show('v-err'); }

  let openUrl = '';
  function openPanel() {
    if (!openUrl) return;
    try { tg.openLink(openUrl); } catch (_) { window.open(openUrl, '_blank'); }
  }

  async function login(rol) {
    show('v-load');
    try {
      const d = await IC.api('POST', '/auth/telegram/miniapp-handoff', rol ? { initData, rol } : { initData });
      if (!d.found) { $('tgid').textContent = d.telegramId || ''; return show('v-none'); }
      if (d.multiple) {
        $('roles').innerHTML = d.roles.map(r =>
          `<button class="btn" type="button" data-r="${IC.esc(r.rol)}" style="margin-bottom:10px">${IC.esc(NOM[r.rol] || r.rol)}<span class="muted" style="font-weight:500"> · ${IC.esc(r.ism)}</span></button>`).join('');
        return show('v-roles');
      }
      openUrl = d.url;
      show('v-open');
      openPanel();
      // Brauzer ochilgach Mini App oynasini yopamiz (ochilmasa, «Panelni ochish» tugmasi qoladi)
      setTimeout(() => { try { tg.close(); } catch (_) {} }, 1500);
    } catch (x) { fail(x.message); }
  }

  $('roles').onclick = e => { const b = e.target.closest('button[data-r]'); if (b) login(b.dataset.r); };
  $('open').onclick = openPanel;
  $('retry').onclick = () => (initData ? login() : location.reload());
  $('copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('tgid').textContent); IC.toast('Nusxalandi'); }
    catch (_) { IC.toast("Nusxalab bo'lmadi — ID'ni qo'lda belgilab oling", true); }
  };

  if (!initData) fail("Bu sahifa Telegram ichida ochilishi kerak. Botdagi «Tizimga kirish» tugmasini bosing.");
  else login();
})();
