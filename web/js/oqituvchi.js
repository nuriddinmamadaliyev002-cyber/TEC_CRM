(function () {
  if (!IC.requireRole(['oqituvchi'])) return;
  IC.header("O'qituvchi");

  const esc = IC.esc, view = document.getElementById('view');
  const full = o => `${o.familiya || ''} ${o.ism || ''}`.trim(); // FI: Familiya Ism
  const api = (m, p, b) => IC.api(m, '/oqituvchi-panel' + p, b);
  const HOLAT = { ochiq: ['Ochiq', 'ok'], boshlangan: ['Boshlangan', 'warn'], yopilgan: ['Yopilgan', ''] };
  const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

  // Oddiy modal: Escape / tashqariga bosish bilan yopiladi
  function modal(html, onClose) {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="card modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); if (onClose) onClose(); };
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    return { $: s => ov.querySelector(s), close };
  }

  const S = {};

  S.dash = async () => {
    const s = (await api('GET', '/stats')).stats;
    const it = [['Faol guruhlarim', s.guruhlar], ["O'quvchilarim", s.oquvchilar]];
    view.innerHTML = `<div class="head"><h2>Bosh sahifa</h2></div>
      <div class="stats">${it.map(([l, v]) => `<div class="card stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  };

  S.guruhlar = async () => {
    const items = (await api('GET', '/guruhlar')).guruhlar;
    view.innerHTML = `<div class="head"><h2>Guruhlarim <span class="count">${items.length ? `(${items.length})` : ''}</span></h2></div>
      <div class="card tw"><table class="rt"><thead><tr><th>Guruh</th><th>Jadval</th><th>Boshlanish</th><th>O'quvchilar</th><th>Holat</th><th></th></tr></thead>
      <tbody id="rows">${items.map(x => `<tr>
        <td data-l=""><b>${esc(x.nomi)}</b><div class="muted" style="font-size:13px">${esc(x.fan_nomi)}</div></td>
        <td data-l="Jadval">${esc(x.jadval) || '—'}</td><td data-l="Boshlanish">${IC.fdate(x.boshlanish)}</td><td data-l="O'quvchilar">${x.oquvchilar_soni} / ${x.max_oquvchi}</td>
        <td data-l="Holat"><span class="badge ${HOLAT[x.holat][1]}">${HOLAT[x.holat][0]}</span></td>
        <td class="act"><button class="btn sm" data-s="${x.id}">O'quvchilar</button> <button class="btn sm pri" data-a="${x.id}">Davomat</button></td></tr>`).join('')}</tbody></table>
      <div class="empty ${items.length ? 'hidden' : ''}">Sizga hali guruh biriktirilmagan</div></div>`;
    view.querySelector('#rows').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const g = items.find(i => String(i.id) === (b.dataset.s || b.dataset.a));
      if (b.dataset.s) students(g); else if (b.dataset.a) attendance(g);
    };
  };

  async function students(g) {
    const m = modal(`<h3>${esc(g.nomi)} — o'quvchilar</h3><div class="err" role="alert"></div><div id="lst"><div class="empty">Yuklanmoqda…</div></div>
      <div class="mact"><button class="btn" id="x" type="button">Yopish</button></div>`);
    m.$('#x').onclick = m.close; m.$('#x').focus();
    try {
      const cur = (await api('GET', `/guruhlar/${g.id}/oquvchilar`)).items;
      m.$('#lst').innerHTML = cur.length
        ? `<table><tbody>${cur.map(c => `<tr><td><b>${esc(full(c))}</b></td><td class="muted">${esc(c.telefon) || '—'}</td></tr>`).join('')}</tbody></table>`
        : "<div class=\"empty\">Guruhda o'quvchi yo'q</div>";
    } catch (x) { m.$('.err').textContent = x.message; m.$('#lst').innerHTML = ''; }
  }

  async function attendance(g) {
    const m = modal(`<h3>${esc(g.nomi)} — davomat</h3>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
        <div class="fld" style="margin:0;flex:1;min-width:150px"><label for="dt">Sana</label><input type="date" id="dt" value="${today()}"></div>
        <button class="btn" id="all" type="button">Hammasi keldi</button></div>
      <div id="lst"></div><div class="err" role="alert"></div>
      <div class="mact"><button class="btn" id="x" type="button">Yopish</button><button class="btn pri" id="save" type="button">Saqlash</button></div>`);
    const $ = m.$, err = $('.err');
    let rows = [];
    $('#x').onclick = m.close;

    const draw = () => {
      $('#lst').innerHTML = rows.length
        ? `<table><tbody>${rows.map(r => `<tr><td><b>${esc(full(r))}</b></td><td class="act">
            <select data-o="${r.id}" aria-label="${esc(full(r))}" style="width:auto">
              <option value="">— belgilanmagan —</option>
              ${[['keldi', 'Keldi'], ['kelmadi', 'Kelmadi'], ['sababli', 'Sababli']].map(([v, t]) => `<option value="${v}"${r.holat === v ? ' selected' : ''}>${t}</option>`).join('')}
            </select></td></tr>`).join('')}</tbody></table>`
        : "<div class=\"empty\">Guruhda o'quvchi yo'q</div>";
    };
    const load = async () => {
      err.textContent = '';
      const sana = $('#dt').value;
      if (!sana) { rows = []; draw(); err.textContent = 'Sanani tanlang'; return; }
      try { rows = (await api('GET', `/guruhlar/${g.id}/davomat?sana=${encodeURIComponent(sana)}`)).items; draw(); }
      catch (x) { rows = []; draw(); err.textContent = x.message; }
    };
    $('#dt').onchange = load;
    $('#all').onclick = () => $('#lst').querySelectorAll('select').forEach(s => { s.value = 'keldi'; });
    $('#save').onclick = async () => {
      err.textContent = '';
      const sana = $('#dt').value;
      const items = [...$('#lst').querySelectorAll('select')].filter(s => s.value).map(s => ({ oquvchi_id: Number(s.dataset.o), holat: s.value }));
      if (!sana) { err.textContent = 'Sanani tanlang'; return; }
      if (!items.length) { err.textContent = "Kamida bitta o'quvchini belgilang"; return; }
      const btn = $('#save'); btn.disabled = true;
      try { await api('PUT', `/guruhlar/${g.id}/davomat`, { sana, items }); IC.toast('Davomat saqlandi'); await load(); }
      catch (x) { err.textContent = x.message; }
      btn.disabled = false;
    };
    await load();
  }

  // ── Navigatsiya ──
  const TABS = [['dash', '🏠 Bosh sahifa'], ['guruhlar', '👥 Guruhlarim']];
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
