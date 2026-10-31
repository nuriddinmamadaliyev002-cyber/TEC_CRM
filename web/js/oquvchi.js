(function () {
  if (!IC.requireRole(['oquvchi'])) return;
  IC.header("O'quvchi");

  const esc = IC.esc, view = document.getElementById('view');
  const api = (p) => IC.api('GET', '/oquvchi-panel' + p);
  const HOLAT = { ochiq: ['Ochiq', 'ok'], boshlangan: ['Boshlangan', 'warn'], yopilgan: ['Yopilgan', ''] };
  const DAV = { keldi: ['Keldi', 'ok'], kelmadi: ['Kelmadi', 'off'], sababli: ['Sababli', 'warn'] };
  const USUL = { naqd: 'Naqd', karta: 'Karta', otkazma: "Hisob raqamga o'tkazma" };
  const foiz = v => (v == null ? '—' : v + '%');
  const holatBadge = (map, k) => { const m = map[k] || [k, '']; return `<span class="badge ${m[1]}">${esc(m[0])}</span>`; };

  const S = {};

  S.dash = async () => {
    const d = await api('/stats'), s = d.stats;
    const it = [['Faol guruhlarim', s.guruhlar], ['Davomatim', foiz(s.davomat_foiz)], ["To'langan", IC.money(s.tolangan)]];
    view.innerHTML = `<div class="head"><h2>Salom, ${esc(d.ism)} 👋</h2></div>
      <div class="stats">${it.map(([l, v]) => `<div class="card stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  };

  S.guruhlar = async () => {
    const items = (await api('/guruhlar')).guruhlar;
    view.innerHTML = `<div class="head"><h2>Guruhlarim</h2></div>
      <div class="card tw"><table class="rt"><thead><tr><th>Guruh</th><th>O'qituvchi</th><th>Jadval</th><th>Boshlanish</th><th>Holat</th><th>To'langan</th><th>Davomat</th></tr></thead>
      <tbody>${items.map(x => `<tr>
        <td data-l=""><b>${esc(x.nomi)}</b><div class="muted" style="font-size:13px">${esc(x.fan_nomi)}</div></td>
        <td data-l="O'qituvchi">${esc(x.oqituvchi) || '—'}</td><td data-l="Jadval">${esc(x.jadval) || '—'}</td><td data-l="Boshlanish">${IC.fdate(x.boshlanish)}</td>
        <td data-l="Holat">${holatBadge(HOLAT, x.holat)}</td>
        <td data-l="To'langan">${IC.money(x.tolangan)}</td>
        <td data-l="Davomat">${foiz(x.davomat_foiz)}</td></tr>`).join('')}</tbody></table>
      <div class="empty ${items.length ? 'hidden' : ''}">Siz hali birorta guruhga qo'shilmagansiz</div></div>`;
  };

  S.davomat = async () => {
    const gs = (await api('/guruhlar')).guruhlar;
    if (!gs.length) { view.innerHTML = `<div class="head"><h2>Davomatim</h2></div><div class="card"><div class="empty">Siz hali birorta guruhga qo'shilmagansiz</div></div>`; return; }
    view.innerHTML = `<div class="head"><h2>Davomatim</h2></div>
      <div class="card" style="padding:16px"><div class="fld" style="max-width:360px"><label for="g">Guruh</label>
        <select id="g">${gs.map(g => `<option value="${g.id}">${esc(g.nomi)} — ${esc(g.fan_nomi)}</option>`).join('')}</select></div>
        <div id="out" style="margin-top:12px"></div></div>`;
    const out = document.getElementById('out'), sel = document.getElementById('g');
    const load = async () => {
      out.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      try {
        const d = await api('/davomat?guruh_id=' + encodeURIComponent(sel.value)), h = d.hisob;
        out.innerHTML = `<div class="stats" style="margin-bottom:12px">${[['Keldi', h.keldi], ['Kelmadi', h.kelmadi], ['Sababli', h.sababli], ['Davomat', foiz(h.foiz)]]
          .map(([l, v]) => `<div class="card stat"><b>${esc(v)}</b><span>${l}</span></div>`).join('')}</div>
          ${d.items.length ? `<div class="tw"><table class="rt"><thead><tr><th>Sana</th><th>Holat</th></tr></thead><tbody>${d.items.map(x => `<tr><td data-l="Sana">${IC.fdate(x.sana)}</td><td data-l="Holat">${holatBadge(DAV, x.holat)}</td></tr>`).join('')}</tbody></table></div>`
            : '<div class="empty">Hali davomat belgilanmagan</div>'}`;
      } catch (x) { out.innerHTML = `<div class="empty">${esc(x.message)}</div>`; }
    };
    sel.onchange = load; await load();
  };

  S.tolovlar = async () => {
    const d = await api('/tolovlar');
    view.innerHTML = `<div class="head"><h2>To'lovlarim <span class="count">${d.items.length ? `· jami ${esc(IC.money(d.jami))}` : ''}</span></h2></div>
      <div class="card tw"><table class="rt"><thead><tr><th>Sana</th><th>Summa</th><th>Usul</th><th>Guruh</th><th>Izoh</th></tr></thead>
      <tbody>${d.items.map(x => `<tr><td data-l="Sana">${IC.fdate(x.sana)}</td><td data-l="Summa"><b>${IC.money(x.summa)}</b></td><td data-l="Usul">${esc(USUL[x.usul] || x.usul)}</td>
        <td data-l="Guruh">${esc(x.guruh_nomi) || '—'}</td><td data-l="Izoh">${esc(x.izoh) || '—'}</td></tr>`).join('')}</tbody></table>
      <div class="empty ${d.items.length ? 'hidden' : ''}">Hali to'lov kiritilmagan</div></div>`;
  };

  const TABS = [['dash', '🏠 Bosh sahifa'], ['guruhlar', '👥 Guruhlarim'], ['davomat', '✅ Davomat'], ['tolovlar', "💳 To'lovlar"]];
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(([k, t]) => `<button class="tab" data-k="${k}" type="button">${t}</button>`).join('');
  async function go(k) {
    if (!S[k]) k = 'dash';
    nav.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    try { history.replaceState(null, '', '#' + k); } catch (_) {}
    view.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
    try { await S[k](); } catch (x) { view.innerHTML = `<div class="empty">${esc(x.message)}</div>`; }
  }
  nav.onclick = e => { const b = e.target.closest('.tab'); if (b) go(b.dataset.k); };
  go(location.hash.slice(1) || 'dash');
})();
