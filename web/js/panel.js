(function () {
  if (!IC.requireRole(['kurs_admin', 'superadmin'])) return;
  IC.header(IC.session.role() === 'superadmin' ? 'Superadmin' : 'Admin');
  if (IC.session.role() === 'superadmin') document.getElementById('back-su').classList.remove('hidden');

  const esc = IC.esc, view = document.getElementById('view');
  const full = o => `${o.familiya || ''} ${o.ism || ''}`.trim(); // FI: Familiya Ism
  const act = id => `<td class="act"><button class="btn sm" data-e="${id}">Tahrirlash</button> <button class="btn sm dng" data-d="${id}">O'chirish</button></td>`;
  const stat = f => `<span class="badge ${f ? 'ok' : 'off'}">${f ? 'Faol' : 'Nofaol'}</span>`;
  const HOLAT = { ochiq: ['Ochiq', 'ok'], boshlangan: ['Boshlangan', 'warn'], yopilgan: ['Yopilgan', ''] };
  const SOATLAR = []; // dars boshlanish vaqtlari: 07:00 … 21:30, har 30 daqiqada
  for (let h = 7; h <= 21; h++) for (const m of ['00', '30']) SOATLAR.push(String(h).padStart(2, '0') + ':' + m);

  // ── Umumiy ro'yxat sahifasi: sarlavha + qidiruv + jadval + CRUD ──
  function crud(cfg) {
    let items = [], q = '';
    view.innerHTML = `<div class="head"><h2>${cfg.title} <span class="count" id="cnt"></span></h2><div class="spacer"></div>
      <input class="search" id="q" placeholder="Qidirish…" aria-label="Qidirish">
      ${cfg.noAdd ? '' : `<button class="btn pri" id="add" type="button">+ Qo'shish</button>`}</div>
      <div class="card tw"><table class="rt"><thead><tr>${cfg.cols.map(c => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody id="rows"></tbody></table>
      <div class="empty hidden" id="empty">Hozircha ma'lumot yo'q</div></div>`;
    const rows = view.querySelector('#rows');
    const draw = () => {
      const f = items.filter(x => !q || JSON.stringify(Object.values(x)).toLowerCase().includes(q));
      view.querySelector('#cnt').textContent = items.length ? `(${f.length})` : '';
      view.querySelector('#empty').classList.toggle('hidden', f.length > 0);
      rows.innerHTML = f.map(x => `<tr>${cfg.cols.map((c, i) => `<td data-l="${i ? esc(c[0]) : ''}">${c[1](x)}</td>`).join('')}${cfg.actions ? cfg.actions(x) : act(x.id)}</tr>`).join('');
    };
    const load = async () => { items = await cfg.load(); draw(); };
    const edit = async x => {
      const fields = await cfg.fields(x);
      IC.formModal({ title: x ? cfg.editTitle : cfg.addTitle, fields, values: x || cfg.defaults || {},
        onSubmit: async v => { x ? await IC.api('PUT', `${cfg.path}/${x.id}`, v) : await IC.api('POST', cfg.path, v); await load(); IC.toast('Saqlandi'); } });
    };
    const addBtn = view.querySelector('#add'); if (addBtn) addBtn.onclick = () => edit(null);
    view.querySelector('#q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
    rows.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.e) return edit(items.find(i => String(i.id) === b.dataset.e));
      if (b.dataset.d && await IC.confirmBox(cfg.delText || "O'chirasizmi?")) {
        try { await IC.api('DELETE', `${cfg.path}/${b.dataset.d}`); await load(); IC.toast("O'chirildi"); } catch (x) { IC.toast(x.message, true); }
      }
      if (cfg.onAction) cfg.onAction(b, items, load);
    };
    return load();
  }

  const opts = (arr, t) => arr.map(o => ({ v: o.id, t: typeof t === 'function' ? t(o) : o[t] }));
  const personFields = extra => () => [
    { k: 'familiya', label: 'Familiya', req: true }, { k: 'ism', label: 'Ism', req: true },
    { k: 'telefon', label: 'Telefon', type: 'tel' },
    ...(extra ? [extra] : []), { k: 'faol', label: 'Faol', type: 'checkbox' }];

  // ═══ Bo'limlar ═══
  const S = {};

  S.dash = async () => {
    const s = (await IC.api('GET', '/stats')).stats;
    const it = [['Faol fanlar', s.fanlar], ['Faol guruhlar', s.guruhlar], ["O'quvchilar", s.oquvchilar], ["O'qituvchilar", s.oqituvchilar],
      ['Yangi lidlar', s.yangi_lidlar], ['Yangi nomzodlar', s.yangi_nomzodlar],
      ['Shu oy tushum', IC.money(s.oy_tushum)], ['Jami tushum', IC.money(s.jami_tushum)]];
    view.innerHTML = `<div class="head"><h2>Bosh sahifa</h2></div><div class="stats">${it.map(([l, v]) => `<div class="card stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;
  };

  S.fanlar = () => crud({
    title: 'Fanlar', path: '/fanlar', addTitle: 'Yangi fan', editTitle: 'Fanni tahrirlash', defaults: { faol: true },
    delText: "Fanni o'chirasizmi?",
    load: async () => (await IC.api('GET', '/fanlar')).fanlar,
    cols: [['Nomi', x => `<b>${esc(x.nomi)}</b><div class="muted" style="font-size:13px">${esc(x.tavsif).slice(0, 80)}</div>`],
      ["O'qituvchilar", x => x.oqituvchilar_soni], ['Guruhlar', x => x.guruhlar_soni], ['Holat', x => stat(x.faol)]],
    fields: async () => [{ k: 'nomi', label: 'Fan nomi', req: true }, { k: 'tavsif', label: 'Tavsif', type: 'textarea' },
      { k: 'faol', label: 'Faol', type: 'checkbox' }],
  });

  S.oqituvchilar = () => crud({
    title: "O'qituvchilar", path: '/oqituvchilar', addTitle: "Yangi o'qituvchi", editTitle: "O'qituvchini tahrirlash", defaults: { faol: true },
    load: async () => (await IC.api('GET', '/oqituvchilar')).items,
    cols: [['FI', x => `<b>${esc(full(x))}</b>`], ['Fan', x => esc(x.fan_nomi) || '<span class="badge off">Fan tanlanmagan</span>'], ['Telefon', x => esc(x.telefon) || '—'], ['Holat', x => stat(x.faol)]],
    fields: async x => {
      const f = (await IC.api('GET', '/fanlar')).fanlar;
      // Faol fanlar; tahrirlanayotgan o'qituvchining joriy fani nofaol bo'lsa ham ro'yxatda qoladi
      return personFields({ k: 'fan_id', label: 'Fan', type: 'select', req: true, placeholder: '— Fanni tanlang —',
        options: opts(f.filter(a => a.faol || (x && a.id === x.fan_id)), 'nomi') })();
    },
  });

  S.oquvchilar = () => crud({
    title: "O'quvchilar", path: '/oquvchilar', addTitle: "Yangi o'quvchi", editTitle: "O'quvchini tahrirlash", defaults: { faol: true },
    load: async () => (await IC.api('GET', '/oquvchilar')).items,
    cols: [['FI', x => `<b>${esc(full(x))}</b>`], ['Telefon', x => esc(x.telefon) || '—'], ["Qo'shilgan", x => IC.fdate(x.yaratilgan)], ['Holat', x => stat(x.faol)]],
    fields: async () => personFields(null)(),
  });

  S.guruhlar = () => crud({
    title: 'Guruhlar', path: '/guruhlar', addTitle: 'Yangi guruh', editTitle: 'Guruhni tahrirlash', defaults: { holat: 'ochiq', max_oquvchi: 20, oylik_narx: '' },
    delText: "Guruhni o'chirasizmi? (o'quvchilar guruhdan chiqariladi)",
    load: async () => (await IC.api('GET', '/guruhlar')).guruhlar,
    cols: [['Guruh', x => `<b>${esc(x.nomi)}</b><div class="muted" style="font-size:13px">${esc(x.fan_nomi)}</div>`],
      ["O'qituvchi", x => esc(x.oqituvchi_nomi) || '—'], ['Jadval', x => esc(x.jadval) || '—'], ['Boshlanish', x => IC.fdate(x.boshlanish)],
      ["Oylik narx", x => IC.money(x.oylik_narx)],
      ["O'quvchilar", x => `${x.oquvchilar_soni} / ${x.max_oquvchi}`], ['Holat', x => `<span class="badge ${HOLAT[x.holat][1]}">${HOLAT[x.holat][0]}</span>`]],
    actions: x => `<td class="act"><button class="btn sm" data-s="${x.id}">O'quvchilar</button> <button class="btn sm" data-a="${x.id}">Davomat</button> <button class="btn sm" data-e="${x.id}">Tahrirlash</button> <button class="btn sm dng" data-d="${x.id}">O'chirish</button></td>`,
    fields: async x => {
      const [f, o] = await Promise.all([IC.api('GET', '/fanlar'), IC.api('GET', '/oqituvchilar')]);
      return [{ k: 'nomi', label: 'Guruh nomi', req: true, full: true },
        { k: 'fan_id', label: 'Fan', type: 'select', req: true, placeholder: '— Fanni tanlang —',
          options: opts(f.fanlar.filter(a => a.faol || (x && a.id === x.fan_id)), 'nomi') },
        // O'qituvchilar tanlangan fanga qarab chiqadi
        { k: 'oqituvchi_id', label: "O'qituvchi", type: 'select', dependsOn: 'fan_id',
          noDepText: '— avval fanni tanlang —', emptyText: "— bu fan bo'yicha o'qituvchi yo'q —",
          options: o.items.filter(t => t.faol || (x && t.id === x.oqituvchi_id)).map(t => ({ v: t.id, t: full(t), group: t.fan_id })) },
        { k: 'kunlar', label: 'Dars kunlari', type: 'days', full: true },
        { k: 'soat', label: 'Dars vaqti', type: 'select', options: SOATLAR.map(t => ({ v: t, t })) },
        { k: 'boshlanish', label: 'Boshlanish sanasi', type: 'date' }, { k: 'max_oquvchi', label: "Maks. o'quvchi", type: 'number', req: true },
        { k: 'oylik_narx', label: "Oylik to'lov narxi (so'm)", type: 'number', req: true, inputmode: 'decimal' },
        { k: 'holat', label: 'Holat', type: 'select', req: true, options: [{ v: 'ochiq', t: 'Ochiq' }, { v: 'boshlangan', t: 'Boshlangan' }, { v: 'yopilgan', t: 'Yopilgan' }] }];
    },
    onAction: (b, items, reload) => {
      if (b.dataset.s) groupStudents(items.find(i => String(i.id) === b.dataset.s), reload);
      else if (b.dataset.a) attendance(items.find(i => String(i.id) === b.dataset.a));
    },
  });

  // Guruh o'quvchilarini boshqarish
  async function groupStudents(g, reload) {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="card modal" role="dialog" aria-modal="true"><h3>${esc(g.nomi)} — o'quvchilar</h3>
      <div style="display:flex;gap:8px;margin-bottom:12px"><select id="sel" aria-label="O'quvchi"></select><button class="btn pri" id="go" type="button">Qo'shish</button></div>
      <div class="err" role="alert"></div><div id="lst"></div><div class="mact"><button class="btn" id="x" type="button">Yopish</button></div></div>`;
    document.body.appendChild(ov);
    const $ = s => ov.querySelector(s), close = () => { ov.remove(); reload(); };
    $('#x').onclick = close; ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const all = (await IC.api('GET', '/oquvchilar')).items.filter(o => o.faol);
    async function draw() {
      const cur = (await IC.api('GET', `/guruhlar/${g.id}/oquvchilar`)).items, ids = new Set(cur.map(c => c.id));
      $('#sel').innerHTML = all.filter(o => !ids.has(o.id)).map(o => `<option value="${o.id}">${esc(full(o))}</option>`).join('') || '<option value="">— qo\'shiladigan o\'quvchi yo\'q —</option>';
      $('#lst').innerHTML = cur.length ? `<table><tbody>${cur.map(c => `<tr><td><b>${esc(full(c))}</b><div class="muted" style="font-size:13px">${esc(c.telefon)}</div></td><td class="act"><button class="btn sm dng" data-r="${c.id}">Chiqarish</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Guruhda o\'quvchi yo\'q</div>';
    }
    $('#go').onclick = async () => {
      $('.err').textContent = ''; const v = $('#sel').value; if (!v) return;
      try { await IC.api('POST', `/guruhlar/${g.id}/oquvchilar`, { oquvchi_id: v }); await draw(); } catch (x) { $('.err').textContent = x.message; }
    };
    $('#lst').onclick = async e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      try { await IC.api('DELETE', `/guruhlar/${g.id}/oquvchilar/${b.dataset.r}`); await draw(); } catch (x) { $('.err').textContent = x.message; }
    };
    draw().catch(x => { $('.err').textContent = x.message; });
  }


  // Davomat: guruh va sana bo'yicha har bir o'quvchi uchun keldi / kelmadi / sababli
  async function attendance(g) {
    const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="card modal" role="dialog" aria-modal="true"><h3>${esc(g.nomi)} — davomat</h3>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
        <div class="fld" style="margin:0;flex:1;min-width:150px"><label for="dt">Sana</label><input type="date" id="dt" value="${today()}" max="${today()}"></div>
        <button class="btn" id="all" type="button">Hammasi keldi</button></div>
      <div id="lst"></div><div class="err" role="alert"></div>
      <div class="mact"><button class="btn" id="x" type="button">Yopish</button><button class="btn pri" id="save" type="button">Saqlash</button></div></div>`;
    document.body.appendChild(ov);
    const $ = q => ov.querySelector(q), err = $('.err'), close = () => ov.remove();
    $('#x').onclick = close; ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('#dt').focus(); // fokus oyna ichida bo'lsin (Esc ishlashi uchun)
    let rows = [];
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
      err.textContent = ''; const sana = $('#dt').value;
      if (!sana) { rows = []; draw(); err.textContent = 'Sanani tanlang'; return; }
      try { rows = (await IC.api('GET', `/guruhlar/${g.id}/davomat?sana=${encodeURIComponent(sana)}`)).items; draw(); }
      catch (x) { rows = []; draw(); err.textContent = x.message; }
    };
    $('#dt').onchange = load;
    $('#all').onclick = () => $('#lst').querySelectorAll('select').forEach(sel => { sel.value = 'keldi'; });
    $('#save').onclick = async () => {
      err.textContent = ''; const sana = $('#dt').value;
      const items = [...$('#lst').querySelectorAll('select')].filter(sel => sel.value).map(sel => ({ oquvchi_id: Number(sel.dataset.o), holat: sel.value }));
      if (!sana) { err.textContent = 'Sanani tanlang'; return; }
      if (!items.length) { err.textContent = "Kamida bitta o'quvchini belgilang"; return; }
      const btn = $('#save'); btn.disabled = true;
      try { await IC.api('PUT', `/guruhlar/${g.id}/davomat`, { sana, items }); IC.toast('Davomat saqlandi'); await load(); }
      catch (x) { err.textContent = x.message; }
      btn.disabled = false;
    };
    await load();
  }

  // ═══ LIDLAR: botdan kelgan «kursga yozilish» arizalari ═════════════════════
  const dt = d => (d ? new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const tel = t => (t ? `<a href="tel:${esc(t)}">${esc(t)}</a>` : '—');
  const tgLink = x => (x.username ? `<div class="muted" style="font-size:13px"><a href="https://t.me/${esc(x.username)}" target="_blank" rel="noopener">@${esc(x.username)}</a></div>` : '');
  const LID = { yangi: ['Yangi', 'warn'], aloqada: ['Aloqada', ''], yozildi: ['Yozildi', 'ok'], rad: ['Rad etildi', 'off'] };
  const small = t => `<div class="muted" style="font-size:13px">${t}</div>`;

  S.lidlar = () => crud({
    title: 'Lidlar', path: '/lidlar', noAdd: true, editTitle: 'Lidni tahrirlash', delText: "Lidni o'chirasizmi?",
    load: async () => (await IC.api('GET', '/lidlar')).items,
    cols: [['Sana', x => dt(x.yaratilgan)],
      ['Ism', x => `<b>${esc(x.ism)}</b>${small(tel(x.telefon))}${tgLink(x)}`],
      ['Fan / guruh', x => `<b>${esc(x.fan_nomi)}</b>${small(esc(x.guruh_nomi) + (x.guruh_id ? '' : ' (guruh o\'chirilgan)'))}${x.jadval ? small(esc(x.jadval)) : ''}`
        + (x.guruh_id ? small(`${esc(x.oqituvchi_nomi) || ''}${x.oylik_narx ? ' · ' + esc(IC.money(x.oylik_narx)) : ''}`) : '')],
      ['Holat', x => `<span class="badge ${LID[x.holat][1]}">${LID[x.holat][0]}</span>`],
      ['Izoh', x => esc(x.izoh).slice(0, 80) || '—']],
    actions: x => `<td class="act">${x.oquvchi_id ? '' : `<button class="btn sm pri" data-o="${x.id}">O'quvchiga aylantirish</button> `}<button class="btn sm" data-e="${x.id}">Tahrirlash</button> <button class="btn sm dng" data-d="${x.id}">O'chirish</button></td>`,
    fields: async () => [{ k: 'holat', label: 'Holat', type: 'select', req: true, options: Object.entries(LID).map(([v, [t]]) => ({ v, t })) },
      { k: 'izoh', label: 'Izoh (aloqa natijasi)', type: 'textarea', full: true }],
    onAction: async (b, items, reload) => {
      if (!b.dataset.o) return;
      const x = items.find(i => String(i.id) === b.dataset.o);
      if (!await IC.ask(`«${x.ism}» o'quvchi sifatida qo'shilsinmi?${x.guruh_id ? ` Guruh: ${x.guruh_nomi}.` : ''}`, { yes: "Qo'shish" })) return;
      b.disabled = true;
      try { const r = await IC.api('POST', `/lidlar/${x.id}/oquvchi`, {}); IC.toast(r.guruhga_qoshildi ? "O'quvchi yaratildi va guruhga qo'shildi" : "O'quvchi yaratildi"); await reload(); }
      catch (e) { IC.toast(e.message, true); b.disabled = false; }
    },
  });

  // ═══ VAKANSIYALAR (o'qituvchi ish o'rinlari — botda ko'rinadi) ═════════════
  S.vakansiyalar = () => crud({
    title: 'Vakansiyalar', path: '/vakansiyalar', addTitle: 'Yangi vakansiya', editTitle: 'Vakansiyani tahrirlash', defaults: { faol: true },
    delText: "Vakansiyani o'chirasizmi? (kelgan nomzodlar saqlanadi)",
    load: async () => (await IC.api('GET', '/vakansiyalar')).items,
    cols: [['Nomi', x => `<b>${esc(x.nomi)}</b>${x.fan_nomi ? small(esc(x.fan_nomi)) : ''}`], ['Maosh', x => esc(x.maosh) || '—'],
      ['Nomzodlar', x => x.nomzodlar_soni], ['Holat', x => `<span class="badge ${x.faol ? 'ok' : 'off'}">${x.faol ? "Botda ko'rinadi" : 'Yopiq'}</span>`]],
    fields: async () => {
      const f = (await IC.api('GET', '/fanlar')).fanlar;
      return [{ k: 'nomi', label: 'Vakansiya nomi (masalan: Ingliz tili o\'qituvchisi)', req: true, full: true },
        { k: 'fan_id', label: 'Fan (ixtiyoriy)', type: 'select', options: opts(f, 'nomi') },
        { k: 'maosh', label: 'Maosh (matn, masalan: 4–6 mln so\'m)' },
        { k: 'tavsif', label: 'Tavsif', type: 'textarea', full: true }, { k: 'talablar', label: 'Talablar', type: 'textarea', full: true },
        { k: 'faol', label: "Faol (botda ko'rinadi, ariza qabul qilinadi)", type: 'checkbox' }];
    },
  });

  // ═══ NOMZODLAR: vakansiyaga botdan kelgan arizalar ═════════════════════════
  const NZ = { yangi: ['Yangi', 'warn'], korildi: ["Ko'rildi", ''], suhbat: ['Suhbat', ''], qabul: ['Qabul qilindi', 'ok'], rad: ['Rad etildi', 'off'] };
  S.nomzodlar = () => crud({
    title: 'Nomzodlar', path: '/nomzodlar', noAdd: true, editTitle: 'Nomzodni tahrirlash', delText: "Nomzodni o'chirasizmi?",
    load: async () => (await IC.api('GET', '/nomzodlar')).items,
    cols: [['Sana', x => dt(x.yaratilgan)],
      ['Ism', x => `<b>${esc(x.ism)}</b>${small(tel(x.telefon))}${tgLink(x)}`],
      ['Vakansiya', x => esc(x.vakansiya_nomi) || '—'],
      ['Tajriba', x => `<div style="white-space:pre-wrap;max-width:320px">${esc(x.tajriba).slice(0, 300) || '—'}</div>`],
      ['Holat', x => `<span class="badge ${NZ[x.holat][1]}">${NZ[x.holat][0]}</span>${x.izoh ? small(esc(x.izoh).slice(0, 80)) : ''}`]],
    actions: x => `<td class="act">${x.rezyume_bor ? `<button class="btn sm" data-r="${x.id}">Rezyume</button> ` : ''}<button class="btn sm" data-e="${x.id}">Tahrirlash</button> <button class="btn sm dng" data-d="${x.id}">O'chirish</button></td>`,
    fields: async () => [{ k: 'holat', label: 'Holat', type: 'select', req: true, options: Object.entries(NZ).map(([v, [t]]) => ({ v, t })) },
      { k: 'izoh', label: 'Izoh', type: 'textarea', full: true }],
    onAction: async (b, items) => {
      if (!b.dataset.r) return;
      const x = items.find(i => String(i.id) === b.dataset.r); b.disabled = true;
      try { await IC.download(`/nomzodlar/${x.id}/rezyume`, x.rezyume_nomi || `rezyume-${x.id}`); } catch (e) { IC.toast(e.message, true); }
      b.disabled = false;
    },
  });

  // ═══ TO'LOVLAR: oylik reestr ═══════════════════════════════════════════════
  // Har qator = (guruh, o'quvchi) tanlangan oy uchun. Oylar bo'yicha o'tish, filtrlar, qidiruv, Excel; qaydnoma va sanalarni
  // yacheykaga bosib tahrirlash; «To'lov qildi» yacheykasi orqali to'lov qo'shish/o'chirish.
  const OYLAR = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const pad2 = n => String(n).padStart(2, '0');
  const isoOf = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  const thisMonth = () => isoOf(new Date()).slice(0, 7);
  const moveMonth = (oy, n) => isoOf(new Date(+oy.slice(0, 4), +oy.slice(5) - 1 + n, 1)).slice(0, 7);
  const oyNomi = oy => OYLAR[+oy.slice(5) - 1] + ' ' + oy.slice(0, 4);
  const kunNomi = (d, oy) => (!d ? '' : OYLAR[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10) + (d.slice(0, 4) !== oy.slice(0, 4) ? ', ' + d.slice(0, 4) : ''));
  const pul = n => esc(IC.money(n).replace(" so'm", '')) + " <small>so'm</small>";
  const HB = { tolagan: ["To'liq", 'ok'], qisman: ['Qisman', 'warn'], yoq: ["To'lov yo'q", ''] };
  const USUL = { naqd: 'Naqd', karta: 'Karta', otkazma: "Hisob raqamga o'tkazma" };
  const RS = { oy: thisMonth(), rows: [], f: '', g: '', t: '', u: '', h: '', q: '', seq: 0 };
  const tolanganOf = x => (RS.u ? x.usul_summa[RS.u] : x.tolangan); // to'lov usuli tanlangan bo'lsa — faqat shu usul bo'yicha
  const rkey = x => x.guruh_id + '_' + x.oquvchi_id;
  let editing = null; // {td, restore} — hozir tahrirlanayotgan yacheyka

  const cellInner = (c, x) => {
    if (c === 'qay') return x.qaydnoma ? esc(x.qaydnoma) : '<span class="muted">Eslatma…</span>';
    const v = x[c === 'eh' ? 'ehtimoliy_sana' : 'gaplashilgan_sana'];
    return v ? `<span class="dv">${esc(kunNomi(v, RS.oy))}</span><button type="button" class="clr" data-clr="1" title="Tozalash" aria-label="Sanani tozalash">✕</button>` : '<span class="muted">—</span>';
  };
  const rowHTML = (x, i) => `<tr class="${x.holat === 'tolagan' ? 'r-ok' : x.holat === 'qisman' ? 'r-part' : 'r-no'}" data-r="${rkey(x)}">
    <td class="num" data-l="№">${i + 1}</td>
    <td data-l=""><b>${esc(x.familiya)}</b><div><b>${esc(x.ism)}</b>${x.faol ? '' : ' <span class="badge off">Nofaol</span>'}</div></td>
    <td data-l="Fan">${esc(x.fan_nomi) || '—'}</td>
    <td data-l="O'qituvchi">${esc(x.oqituvchi_nomi) || '—'}</td>
    <td data-l="Guruh">${esc(x.guruh_nomi)}</td>
    <td data-l="Telefon">${esc(x.telefon) || '—'}</td>
    <td data-l="Qaydnoma" class="ed qay" data-c="qay" tabindex="0" title="Yozish uchun bosing">${cellInner('qay', x)}</td>
    <td data-l="Ehtimoliy to'lov sanasi" class="ed" data-c="eh" tabindex="0" title="Sanani tanlash uchun bosing">${cellInner('eh', x)}</td>
    <td data-l="Gaplashilgan vaqt" class="ed" data-c="ga" tabindex="0" title="Sanani tanlash uchun bosing">${cellInner('ga', x)}</td>
    <td data-l="Oylik to'lov narxi" class="mny">${x.narx ? pul(x.narx) : '<span class="muted">Narx yo\'q</span>'}</td>
    <td data-l="To'lov qildi" class="ed mny" data-c="pay" tabindex="0" title="To'lovlarni ko'rish / qo'shish">${tolanganOf(x) ? pul(tolanganOf(x)) : '<span class="muted">+ To\'lov</span>'}</td>
    <td data-l="To'lov sanasi">${x.tolov_sanasi ? esc(kunNomi(x.tolov_sanasi, RS.oy)) : '—'}</td>
    <td data-l="To'lov holati"><span class="badge ${HB[x.holat][1]}">${HB[x.holat][0]}</span></td></tr>`;

  function rsDraw() {
    const rowsEl = view.querySelector('#rows'); if (!rowsEl) return; // boshqa bo'limga o'tib ketilgan
    editing = null;
    const base = RS.rows.filter(x => (!RS.f || String(x.fan_id) === RS.f) && (!RS.g || String(x.guruh_id) === RS.g) && (!RS.t || String(x.oqituvchi_id) === RS.t) && (!RS.u || x.usul_summa[RS.u] > 0) &&
      (!RS.q || [x.familiya, x.ism, x.telefon, x.fan_nomi, x.guruh_nomi, x.oqituvchi_nomi, x.qaydnoma].join(' ').toLowerCase().includes(RS.q)));
    const nPaid = base.filter(x => x.holat === 'tolagan').length, nDebt = base.filter(x => x.qarz > 0).length;
    const shown = base.filter(x => (RS.h === 'tolagan' ? x.holat === 'tolagan' : RS.h === 'qarzdor' ? x.qarz > 0 : true));
    // Yuqoridagi summalar ekrandagi (barcha filtrlar qo'llangan) qatorlar bo'yicha hisoblanadi
    const sum = f => shown.reduce((a, x) => a + f(x), 0);
    view.querySelector('#sum').innerHTML = `
      <div class="sumc need"><span>${OYLAR[+RS.oy.slice(5) - 1]} oyi bo'yicha to'lanishi kerak</span><b>${esc(IC.money(sum(x => x.narx)))}</b></div>
      <div class="sumc got"><span>To'lov qilindi${RS.u ? ' · ' + esc(USUL[RS.u]) : ''}</span><b>${esc(IC.money(sum(tolanganOf)))}</b></div>
      <div class="sumc debt"><span>Umumiy qarz</span><b>${esc(IC.money(sum(x => x.qarz)))}</b></div>
      <div class="chips" role="group" aria-label="Holat bo'yicha filtr">
        ${[['', 'Jami', base.length], ['tolagan', "To'liq to'lagan", nPaid], ['qarzdor', 'Qarzdor', nDebt]]
          .map(([k, l, n]) => `<button type="button" class="chip${RS.h === k ? ' on' : ''}" data-h="${k}"><b>${n}</b> ${l}</button>`).join('')}
      </div>`;
    view.querySelector('#nm').disabled = RS.oy >= thisMonth(); // kelajak oylariga o'tib bo'lmaydi
    view.querySelector('#qx').classList.toggle('hidden', !RS.q);
    view.querySelector('#ml').textContent = oyNomi(RS.oy);
    rowsEl.innerHTML = shown.map(rowHTML).join('');
    view.querySelector('#empty').classList.toggle('hidden', shown.length > 0);
    view.querySelector('#empty').textContent = RS.rows.length ? "Filtrga mos o'quvchi topilmadi" : "Bu oy uchun o'quvchi yo'q";
  }

  function rsOptions() {
    const fs = new Map(), gs = new Map(), ts = new Map();
    RS.rows.forEach(x => { fs.set(String(x.fan_id), x.fan_nomi); gs.set(String(x.guruh_id), x.guruh_nomi); if (x.oqituvchi_id) ts.set(String(x.oqituvchi_id), x.oqituvchi_nomi); });
    if (!fs.has(RS.f)) RS.f = ''; if (!gs.has(RS.g)) RS.g = ''; if (!ts.has(RS.t)) RS.t = '';
    const fill = (id, all, m, cur) => { const el = view.querySelector(id); if (!el) return;
      el.innerHTML = `<option value="">${all}</option>` + [...m].sort((a, b) => a[1].localeCompare(b[1])).map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join(''); };
    fill('#ff', 'Barcha fanlar', fs, RS.f); fill('#ft', "Barcha o'qituvchilar", ts, RS.t); fill('#fg', 'Barcha guruhlar', gs, RS.g);
  }

  async function rsLoad() {
    const my = ++RS.seq, oy = RS.oy;
    const d = await IC.api('GET', '/tolov-reestr?oy=' + oy);
    if (my !== RS.seq) return; // oraliqda boshqa oy tanlangan
    RS.rows = d.items; rsOptions(); rsDraw();
  }

  async function rsSave(x, patch) {
    await IC.api('PUT', '/tolov-reestr', { guruh_id: x.guruh_id, oquvchi_id: x.oquvchi_id, oy: RS.oy, ...patch });
    Object.assign(x, patch);
  }
  const endEdit = () => { if (editing) { const e = editing; editing = null; e.restore(); } };
  document.addEventListener('mousedown', e => { if (editing && !editing.td.contains(e.target)) endEdit(); });

  function startEdit(td, x) {
    const c = td.dataset.c;
    if (c === 'pay') return payModal(x);
    if (c === 'qay') {
      td.innerHTML = `<textarea aria-label="Qaydnoma" maxlength="2000" placeholder="Telefon bo'yicha ma'lumot…">${esc(x.qaydnoma)}</textarea>`;
      const ta = td.firstChild; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      let closed = false;
      const finish = async cancel => {
        if (closed) return; closed = true; editing = null;
        const v = ta.value.trim();
        if (!cancel && v !== x.qaydnoma) { try { await rsSave(x, { qaydnoma: v }); IC.toast('Saqlandi'); } catch (err) { IC.toast(err.message, true); } }
        td.innerHTML = cellInner('qay', x);
      };
      ta.onkeydown = ev => { if (ev.key === 'Escape') finish(true); else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(false); } };
      ta.onblur = () => finish(false);
      editing = { td, restore: () => finish(false) };
      return;
    }
    // Sana yacheykasi: bosilganda kalendar ochiladi
    const f = c === 'eh' ? 'ehtimoliy_sana' : 'gaplashilgan_sana';
    td.innerHTML = `<input type="date" value="${esc(x[f] || '')}" min="2000-01-01" max="2100-12-31" aria-label="Sana">`;
    const inp = td.firstChild; inp.focus();
    try { inp.showPicker(); } catch (_) { /* eski brauzer: oddiy maydon sifatida qoladi */ }
    let closed = false, timer = 0;
    const commit = async cancel => {
      if (closed) return; closed = true; clearTimeout(timer); editing = null;
      const v = inp.value || null;
      if (!cancel && v !== (x[f] || null) && (!v || v >= '2000-01-01')) { try { await rsSave(x, { [f]: v }); IC.toast('Saqlandi'); } catch (err) { IC.toast(err.message, true); } }
      td.innerHTML = cellInner(c, x);
    };
    // Qo'lda yozilganda har bir raqamda saqlab yubormaslik uchun biroz kutamiz
    inp.onchange = () => { clearTimeout(timer); timer = setTimeout(() => commit(false), 450); };
    inp.onkeydown = ev => { if (ev.key === 'Escape') commit(true); else if (ev.key === 'Enter') { ev.preventDefault(); commit(false); } };
    editing = { td, restore: () => commit(false) };
  }

  // To'lovlar oynasi: shu oydagi to'lovlar ro'yxati + yangi to'lov qo'shish
  function payModal(x0) {
    const key = rkey(x0), cur = () => RS.rows.find(r => rkey(r) === key) || x0;
    const first = RS.oy + '-01', monthEnd = RS.oy + '-' + pad2(new Date(+RS.oy.slice(0, 4), +RS.oy.slice(5), 0).getDate());
    const today = isoOf(new Date()), last = monthEnd < today ? monthEnd : today; // eng oxirgi tanlanadigan sana — bugun
    const defSana = today >= first && today <= monthEnd ? today : last;
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="card modal" role="dialog" aria-modal="true">
      <h3>${esc(full(x0))}</h3><p class="muted" style="margin:-8px 0 14px">${esc(x0.guruh_nomi)} · ${esc(oyNomi(RS.oy))}</p>
      <div class="stats" id="ps" style="margin-bottom:14px;grid-template-columns:repeat(3,1fr);gap:8px"></div><div id="pl"></div>
      <h3 style="font-size:15px;margin:16px 0 10px">Yangi to'lov</h3>
      <div class="grid2">
        <div class="fld"><label for="ps_s">Summa (so'm) *</label><input id="ps_s" type="number" min="0" step="any" inputmode="decimal"></div>
        <div class="fld"><label for="ps_d">Sana *</label><input id="ps_d" type="date" min="${first}" max="${last}" value="${defSana}"></div>
        <div class="fld"><label for="ps_u">To'lov usuli</label><select id="ps_u"><option value="naqd">Naqd</option><option value="karta">Karta</option><option value="otkazma">Hisob raqamga o'tkazma</option></select></div>
        <div class="fld"><label for="ps_i">Izoh</label><input id="ps_i" maxlength="500"></div></div>
      <div class="err" role="alert"></div>
      <div class="mact"><button class="btn" id="px" type="button">Yopish</button><button class="btn pri" id="pa" type="button">To'lov qo'shish</button></div></div>`;
    document.body.appendChild(ov);
    const $ = q => ov.querySelector(q), err = $('.err'), close = () => ov.remove();
    $('#px').onclick = close; ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const drawStats = () => { const x = cur();
      $('#ps').innerHTML = [["Oylik narx", x.narx], ["To'langan", x.tolangan], ['Qarz', x.qarz]].map(([l, v]) => `<div class="card stat" style="padding:10px"><b style="font-size:16px">${esc(IC.money(v))}</b><span>${l}</span></div>`).join(''); };
    async function refresh() {
      const q = `?guruh_id=${x0.guruh_id}&oquvchi_id=${x0.oquvchi_id}&oy=${RS.oy}`;
      const [l] = await Promise.all([IC.api('GET', '/tolov-reestr/tolovlar' + q), rsLoad()]);
      drawStats();
      $('#pl').innerHTML = l.items.length
        ? `<table><tbody>${l.items.map(t => `<tr><td><b>${IC.money(t.summa)}</b><div class="muted" style="font-size:13px">${IC.fdate(t.sana)} · ${esc(USUL[t.usul] || t.usul)}${t.izoh ? ' · ' + esc(t.izoh) : ''}</div></td>
            <td class="act"><button class="btn sm dng" data-del="${t.id}" type="button">O'chirish</button></td></tr>`).join('')}</tbody></table>`
        : "<div class=\"empty\" style=\"padding:14px\">Bu oyda to'lov kiritilmagan</div>";
    }
    $('#pl').onclick = async e => {
      const b = e.target.closest('[data-del]'); if (!b || !await IC.confirmBox("To'lovni o'chirasizmi?")) return;
      err.textContent = '';
      try { await IC.api('DELETE', '/tolovlar/' + b.dataset.del); await refresh(); IC.toast("O'chirildi"); } catch (x) { err.textContent = x.message; }
    };
    $('#pa').onclick = async () => {
      err.textContent = '';
      const summa = Number($('#ps_s').value), sana = $('#ps_d').value;
      if (!(summa > 0)) { err.textContent = "Summani kiriting"; $('#ps_s').focus(); return; }
      if (!sana || sana < first || sana > last) { err.textContent = sana > last ? "Kelajak sanasini tanlab bo'lmaydi" : `Sana ${oyNomi(RS.oy)} oyida bo'lishi kerak`; return; }
      const btn = $('#pa'); btn.disabled = true;
      try {
        await IC.api('POST', '/tolovlar', { oquvchi_id: x0.oquvchi_id, guruh_id: x0.guruh_id, summa, sana, usul: $('#ps_u').value, izoh: $('#ps_i').value.trim() });
        $('#ps_s').value = ''; $('#ps_i').value = ''; await refresh(); IC.toast("To'lov qo'shildi");
        const q = cur().qarz; if (q > 0) $('#ps_s').value = q;
      } catch (x) { err.textContent = x.message; }
      btn.disabled = false;
    };
    drawStats();
    refresh().then(() => { const q = cur().qarz; if (q > 0) $('#ps_s').value = q; $('#ps_s').focus(); }).catch(x => { err.textContent = x.message; });
  }

  S.tolovlar = async () => {
    editing = null;
    view.innerHTML = `<div class="head"><h2>To'lovlar</h2></div>
      <div class="rg-bar">
        <div class="mnav"><button class="btn sm" id="pm" type="button" aria-label="Oldingi oy">‹</button><b id="ml"></b><button class="btn sm" id="nm" type="button" aria-label="Keyingi oy">›</button></div>
        <select id="ff" aria-label="Fan"></select><select id="ft" aria-label="O'qituvchi"></select><select id="fg" aria-label="Guruh"></select>
        <select id="fu" aria-label="To'lov usuli">${[['', "Barcha to'lov usullari"], ...Object.entries(USUL)].map(([v, t]) => `<option value="${v}"${v === RS.u ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <div class="sbox"><input class="search" id="q" placeholder="Ism / telefon…" aria-label="Qidirish" value="${esc(RS.q)}" autocomplete="off"><button type="button" class="sx hidden" id="qx" aria-label="Qidiruvni tozalash" title="Tozalash">✕</button></div>
        <div class="spacer"></div><button class="btn" id="xl" type="button">⬇ Excel</button></div>
      <div class="rg-sum" id="sum"></div>
      <div class="card tw"><table class="rt rg"><thead><tr><th class="num">№</th><th>Familiya Ismi</th><th>Fan</th><th>O'qituvchi</th><th>Guruh</th><th>Telefon raqami</th><th>Qaydnoma</th>
        <th>Ehtimoliy to'lov sanasi</th><th>Gaplashilgan vaqt</th><th>Oylik to'lov narxi</th><th>To'lov qildi</th><th>To'lov sanasi</th><th>To'lov holati</th></tr></thead>
        <tbody id="rows"></tbody></table><div class="empty hidden" id="empty"></div></div>`;
    const $ = q => view.querySelector(q);
    const reload = () => { $('#ml').textContent = oyNomi(RS.oy); return rsLoad().catch(x => IC.toast(x.message, true)); };
    $('#pm').onclick = () => { RS.oy = moveMonth(RS.oy, -1); reload(); };
    $('#nm').onclick = () => { if (RS.oy >= thisMonth()) return; RS.oy = moveMonth(RS.oy, 1); reload(); };
    $('#ff').onchange = e => { RS.f = e.target.value; rsDraw(); };
    $('#fg').onchange = e => { RS.g = e.target.value; rsDraw(); };
    $('#ft').onchange = e => { RS.t = e.target.value; rsDraw(); };
    $('#fu').onchange = e => { RS.u = e.target.value; rsDraw(); };
    $('#q').oninput = e => { RS.q = e.target.value.trim().toLowerCase(); rsDraw(); };
    $('#qx').onclick = () => { $('#q').value = ''; RS.q = ''; rsDraw(); $('#q').focus(); };
    $('#sum').onclick = e => { const b = e.target.closest('[data-h]'); if (b) { RS.h = b.dataset.h; rsDraw(); } };
    $('#xl').onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      const p = new URLSearchParams({ oy: RS.oy, fan_id: RS.f, guruh_id: RS.g, oqituvchi_id: RS.t, usul: RS.u, holat: RS.h, q: RS.q });
      try { await IC.download('/tolov-reestr/excel?' + p, `tolovlar-${RS.oy}.xlsx`); } catch (x) { IC.toast(x.message, true); }
      b.disabled = false;
    };
    const rows = $('#rows');
    const rowOf = el => { const tr = el.closest('tr'); return tr && RS.rows.find(r => rkey(r) === tr.dataset.r); };
    rows.onclick = async e => {
      const td = e.target.closest('td.ed'); if (!td) return;
      const x = rowOf(td); if (!x) return;
      if (e.target.closest('[data-clr]')) { // sanani tozalash
        e.stopPropagation(); endEdit();
        if (!await IC.ask("Yozuvni rostan o'chirmoqchimisiz?")) return;
        const f = td.dataset.c === 'eh' ? 'ehtimoliy_sana' : 'gaplashilgan_sana';
        try { await rsSave(x, { [f]: null }); td.innerHTML = cellInner(td.dataset.c, x); IC.toast('Tozalandi'); } catch (err) { IC.toast(err.message, true); }
        return;
      }
      if (editing && editing.td === td) return;
      endEdit(); startEdit(td, x);
    };
    rows.onkeydown = e => { // klaviatura: yacheykada Enter bosilsa ochiladi
      const td = e.target.closest && e.target.closest('td.ed');
      if (e.key === 'Enter' && td && e.target === td) { e.preventDefault(); const x = rowOf(td); if (x) { endEdit(); startEdit(td, x); } }
    };
    $('#ml').textContent = oyNomi(RS.oy);
    await rsLoad();
  };

  // ── Navigatsiya ──
  const TABS = [['dash', '🏠 Bosh sahifa'], ['lidlar', '📥 Lidlar'], ['fanlar', '📚 Fanlar'], ['guruhlar', '👥 Guruhlar'], ['oquvchilar', "🎓 O'quvchilar"], ['oqituvchilar', "🧑‍🏫 O'qituvchilar"],
    ['tolovlar', "💳 To'lovlar"], ['vakansiyalar', '💼 Vakansiyalar'], ['nomzodlar', '📨 Nomzodlar']];
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(([k, t]) => `<button class="tab" data-k="${k}" type="button">${t}</button>`).join('');
  // Yangi (ko'rilmagan) lid va nomzodlar soni — menyuda ko'rinadi
  async function badges() {
    try {
      const s = (await IC.api('GET', '/stats')).stats;
      for (const [k, n] of [['lidlar', s.yangi_lidlar], ['nomzodlar', s.yangi_nomzodlar]]) {
        const b = nav.querySelector(`[data-k="${k}"]`); if (!b) continue;
        b.querySelector('.nb')?.remove();
        if (n > 0) b.insertAdjacentHTML('beforeend', ` <span class="badge warn nb" aria-label="${n} ta yangi">${n}</span>`);
      }
    } catch (_) {}
  }
  async function go(k) {
    if (!S[k]) k = 'dash';
    nav.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    try { history.replaceState(null, '', '#' + k); } catch (_) {}
    view.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
    try { await S[k](); } catch (x) { view.innerHTML = `<div class="empty">${esc(x.message)}</div>`; }
    badges();
  }
  nav.onclick = e => { const b = e.target.closest('.tab'); if (b) go(b.dataset.k); };
  go(location.hash.slice(1) || 'dash');
})();
