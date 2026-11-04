(function () {
  if (!IC.requireRole(['kurs_admin', 'superadmin'])) return;
  const isSu = IC.session.role() === 'superadmin';
  if (isSu && !IC.filial.id()) { location.replace('superadmin.html'); return; } // superadmin avval filialni tanlaydi
  IC.header(isSu ? 'Superadmin' : 'Admin');
  if (isSu) document.getElementById('back-su').classList.remove('hidden');
  // Sarlavhada filial nomi: admin uchun server aytadi (/auth/me), superadmin uchun tanlagani
  const setFilial = n => { const el = document.querySelector('.brand small'); if (el && n) el.textContent = n; document.title = (n ? n + ' — ' : '') + 'Admin paneli'; };
  if (isSu) setFilial(IC.filial.nomi());
  else IC.api('GET', '/auth/me').then(d => setFilial(d.filial && d.filial.nomi)).catch(() => {});

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
    // cfg.tabs: [{ k, t, test(x), empty }] — ro'yxat bo'limlarga bo'linadi (masalan, Faol / Yopilgan); tanlangan bo'lim cfg.tab da eslab qolinadi
    const tabs = cfg.tabs || null; if (tabs && !tabs.some(t => t.k === cfg.tab)) cfg.tab = tabs[0].k;
    view.innerHTML = `<div class="head"><h2>${cfg.title} <span class="count" id="cnt"></span></h2><div class="spacer"></div>
      <input class="search" id="q" placeholder="Qidirish…" aria-label="Qidirish">
      ${cfg.noAdd ? '' : `<button class="btn pri" id="add" type="button">+ Qo'shish</button>`}</div>
      ${tabs ? `<div class="subtabs" role="tablist">${tabs.map(t => `<button class="subtab" role="tab" type="button" data-t="${t.k}">${t.t} <span class="n" data-n="${t.k}"></span></button>`).join('')}</div>` : ''}
      <div class="card tw"><table class="rt"><thead><tr>${cfg.cols.map(c => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody id="rows"></tbody></table>
      <div class="empty hidden" id="empty">Hozircha ma'lumot yo'q</div></div>`;
    const rows = view.querySelector('#rows');
    const draw = () => {
      const tab = tabs && tabs.find(t => t.k === cfg.tab), inTab = tab ? items.filter(tab.test) : items;
      if (tabs) view.querySelectorAll('.subtab').forEach(b => {
        const on = b.dataset.t === cfg.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
        b.querySelector('.n').textContent = items.filter(tabs.find(t => t.k === b.dataset.t).test).length;
      });
      const f = inTab.filter(x => !q || JSON.stringify(Object.values(x)).toLowerCase().includes(q));
      view.querySelector('#cnt').textContent = inTab.length ? `(${f.length})` : '';
      view.querySelector('#empty').textContent = tab && tab.empty && !q ? tab.empty : "Hozircha ma'lumot yo'q";
      view.querySelector('#empty').classList.toggle('hidden', f.length > 0);
      rows.innerHTML = f.map(x => `<tr>${cfg.cols.map((c, i) => `<td data-l="${i ? esc(c[0]) : ''}">${c[1](x)}</td>`).join('')}${cfg.actions ? cfg.actions(x) : act(x.id)}</tr>`).join('');
    };
    const load = async () => { items = await cfg.load(); draw(); };
    const edit = async x => {
      const fields = await cfg.fields(x);
      IC.formModal({ title: x ? cfg.editTitle : cfg.addTitle, fields, values: x || cfg.defaults || {},
        onSubmit: async v => {
          // beforeSave(x, v) → false bo'lsa saqlanmaydi (oyna ochiq qoladi)
          if (cfg.beforeSave && await cfg.beforeSave(x, v) === false) throw new Error('');
          x ? await IC.api('PUT', `${cfg.path}/${x.id}`, v) : await IC.api('POST', cfg.path, v); await load(); IC.toast('Saqlandi');
        } });
    };
    const addBtn = view.querySelector('#add'); if (addBtn) addBtn.onclick = () => edit(null);
    view.querySelector('#q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
    if (tabs) view.querySelector('.subtabs').onclick = e => { const b = e.target.closest('.subtab'); if (b) { cfg.tab = b.dataset.t; draw(); } };
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

  // To'lov turi (oyliklar hisobi shundan hisoblanadi): soatbay / oylik / foiz
  const HAQ_NOM = { soatbay: 'Soatbay', oylik: 'Oylik', foiz: 'Foiz' };
  const haqSub = x => (x.haq_turi === 'soatbay' ? `${IC.money(x.soat_stavka)} / soat` : x.haq_turi === 'oylik' ? IC.money(x.oylik_maosh) : x.haq_turi === 'foiz' ? `${x.foiz}%` : '');
  const haqCell = x => (x.haq_turi ? `<b>${HAQ_NOM[x.haq_turi]}</b><div class="muted" style="font-size:13px">${esc(haqSub(x))}</div>` : '<span class="badge off">Belgilanmagan</span>');
  S.oqituvchilar = () => crud({
    title: "O'qituvchilar", path: '/oqituvchilar', addTitle: "Yangi o'qituvchi", editTitle: "O'qituvchini tahrirlash", defaults: { faol: true },
    load: async () => (await IC.api('GET', '/oqituvchilar')).items,
    cols: [['FI', x => `<b>${esc(full(x))}</b>`], ['Fan', x => esc(x.fan_nomi) || '<span class="badge off">Fan tanlanmagan</span>'], ['Telefon', x => esc(x.telefon) || '—'],
      ["To'lov turi", haqCell], ['Holat', x => stat(x.faol)]],
    fields: async x => {
      const f = (await IC.api('GET', '/fanlar')).fanlar;
      // Faol fanlar; tahrirlanayotgan o'qituvchining joriy fani nofaol bo'lsa ham ro'yxatda qoladi
      return [{ k: 'familiya', label: 'Familiya', req: true }, { k: 'ism', label: 'Ism', req: true }, { k: 'telefon', label: 'Telefon', type: 'tel' },
        { k: 'fan_id', label: 'Fan', type: 'select', req: true, placeholder: '— Fanni tanlang —', options: opts(f.filter(a => a.faol || (x && a.id === x.fan_id)), 'nomi') },
        { k: 'haq_turi', label: "To'lov turi", type: 'select', req: true, placeholder: '— Tanlang —', full: true,
          options: [{ v: 'soatbay', t: 'Soatbay (dars soatiga qarab)' }, { v: 'oylik', t: "Oylik (qat'iy maosh)" }, { v: 'foiz', t: "Foiz (guruhlarga tushgan to'lovdan)" }],
          hint: "Oyliklar hisoboti shu bo'yicha hisoblanadi." },
        { k: 'soat_stavka', label: "Bir soat uchun haq (so'm)", type: 'number', inputmode: 'decimal', req: true, showIf: { k: 'haq_turi', v: 'soatbay' }, hint: '1 soat = 60 daqiqa. Dars davomiyligi guruhdan olinadi.' },
        { k: 'oylik_maosh', label: "Oylik maosh (so'm)", type: 'number', inputmode: 'decimal', req: true, showIf: { k: 'haq_turi', v: 'oylik' } },
        { k: 'foiz', label: 'Foiz (%)', type: 'number', inputmode: 'decimal', req: true, showIf: { k: 'haq_turi', v: 'foiz' }, hint: "O'quvchi soniga bog'liq emas: guruhlarga shu oyda tushgan to'lovdan hisoblanadi." },
        { k: 'faol', label: 'Faol', type: 'checkbox' }];
    },
  });

  // ═══ O'QUVCHILAR: «Faol» / «Nofaol» bo'limlari ═══
  // Ro'yxat: telefon, yashash manzili, guruh(lar), o'qituvchi va guruhga qo'shilgan (o'qishni boshlagan) sana.
  // Faol → nofaol: o'qishni to'xtatish sababi MAJBURIY. Nofaol → faol: «Faollashtirish».
  const OQ = { tab: 'faol', q: '' };
  S.oquvchilar = async () => {
    let items = [];
    view.innerHTML = `<div class="head"><h2>O'quvchilar <span class="count" id="cnt"></span></h2><div class="spacer"></div>
      <input class="search" id="q" placeholder="Qidirish…" aria-label="Qidirish" value="${esc(OQ.q)}" autocomplete="off">
      <button class="btn pri" id="add" type="button">+ Qo'shish</button></div>
      <div class="subtabs" role="tablist" aria-label="O'quvchilar bo'limi">
        ${[['faol', 'Faol'], ['nofaol', 'Nofaol']].map(([k, t]) => `<button class="subtab" role="tab" type="button" data-t="${k}">${t} <span class="n" id="n_${k}"></span></button>`).join('')}</div>
      <div class="card tw"><table class="rt"><thead id="oh"></thead><tbody id="rows"></tbody></table><div class="empty hidden" id="empty"></div></div>`;
    const $ = s => view.querySelector(s), rows = $('#rows');
    const gl = (x, f) => x.guruhlar.length ? x.guruhlar.map(g => `<div class="gl">${f(g)}</div>`).join('') : '<span class="muted">—</span>';
    const hay = x => [x.familiya, x.ism, x.telefon, x.manzil, x.nofaol_sabab, ...x.guruhlar.map(g => `${g.guruh_nomi} ${g.fan_nomi} ${g.oqituvchi_nomi || ''}`)].join(' ').toLowerCase();

    const COLS = {
      faol: [['FI', x => `<b>${esc(full(x))}</b>`], ['Telefon', x => esc(x.telefon) || '—'], ['Manzil', x => esc(x.manzil) || '—'],
        ['Guruh', x => x.guruhlar.length ? gl(x, g => `<b>${esc(g.guruh_nomi)}</b> <span class="muted">${esc(g.fan_nomi)}</span>`) : '<span class="badge off">Guruhsiz</span>'],
        ["O'qituvchi", x => gl(x, g => esc(g.oqituvchi_nomi) || '—')], ["O'qishni boshlagan", x => gl(x, g => IC.fdate(g.boshlagan))],
        ['Yuz', x => x.yuz_soni ? '<span class="badge ok">✓ Olingan</span>' : '<span class="badge off">Yo\'q</span>']],
    };
    COLS.nofaol = [...COLS.faol, ["To'xtatgan sana", x => IC.fdate(x.nofaol_sana)],
      ["To'xtatish sababi", x => `<div style="white-space:pre-wrap;max-width:260px">${esc(x.nofaol_sabab) || '—'}</div>`]];
    const actions = x => x.faol
      ? `<td class="act"><button class="btn sm" data-y="${x.id}" title="Kamera bilan davomat uchun yuzni ro'yxatga olish">📷 Yuz</button> <button class="btn sm" data-e="${x.id}">Tahrirlash</button> <button class="btn sm" data-n="${x.id}">Nofaol qilish</button> <button class="btn sm dng" data-d="${x.id}">O'chirish</button></td>`
      : `<td class="act"><button class="btn sm pri" data-a="${x.id}">Faollashtirish</button> <button class="btn sm" data-e="${x.id}">Tahrirlash</button> <button class="btn sm dng" data-d="${x.id}">O'chirish</button></td>`;

    const draw = () => {
      const tab = OQ.tab, cols = COLS[tab], list = items.filter(x => x.faol === (tab === 'faol'));
      const shown = list.filter(x => !OQ.q || hay(x).includes(OQ.q));
      if (tab === 'nofaol') shown.sort((a, b) => String(b.nofaol_sana || '').localeCompare(String(a.nofaol_sana || '')) || b.id - a.id); // oxirgi to'xtatilgan birinchi
      view.querySelectorAll('.subtab').forEach(b => { const on = b.dataset.t === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
      $('#n_faol').textContent = items.filter(x => x.faol).length; $('#n_nofaol').textContent = items.filter(x => !x.faol).length;
      $('#cnt').textContent = list.length ? `(${shown.length})` : '';
      $('#add').classList.toggle('hidden', tab !== 'faol'); // yangi o'quvchi faol bo'ladi
      $('#oh').innerHTML = `<tr>${cols.map(c => `<th>${c[0]}</th>`).join('')}<th></th></tr>`;
      rows.innerHTML = shown.map(x => `<tr>${cols.map((c, i) => `<td data-l="${i ? esc(c[0]) : ''}">${c[1](x)}</td>`).join('')}${actions(x)}</tr>`).join('');
      $('#empty').classList.toggle('hidden', shown.length > 0);
      $('#empty').textContent = OQ.q ? "Qidiruvga mos o'quvchi topilmadi" : tab === 'faol' ? "Faol o'quvchilar yo'q" : "Nofaol o'quvchilar yo'q";
    };
    const load = async () => { items = (await IC.api('GET', '/oquvchilar')).items; draw(); };

    const edit = x => IC.formModal({
      title: x ? "O'quvchini tahrirlash" : "Yangi o'quvchi", values: x || {},
      fields: [{ k: 'familiya', label: 'Familiya', req: true }, { k: 'ism', label: 'Ism', req: true }, { k: 'telefon', label: 'Telefon', type: 'tel' },
        { k: 'manzil', label: 'Yashash manzili', full: true, autocomplete: 'off' }],
      onSubmit: async v => {
        let nid = null;
        if (x) await IC.api('PUT', '/oquvchilar/' + x.id, v); else nid = (await IC.api('POST', '/oquvchilar', v)).id;
        await load(); IC.toast('Saqlandi');
        // Yangi o'quvchi: kamera bilan davomat uchun yuzini hoziroq olish taklif qilinadi (ixtiyoriy)
        if (nid && await IC.ask("Yuzini hozir olasizmi? (kamera bilan davomat uchun)", { yes: 'Ha, olish', no: 'Keyinroq' }))
          YUZ.enroll({ id: nid, ism: v.ism, familiya: v.familiya, yuz_soni: 0 }, { onDone: load });
      },
    });
    const deactivate = x => IC.formModal({
      title: `${full(x)} — o'qishni to'xtatish`, submitText: 'Nofaol qilish',
      fields: [{ k: 'sabab', label: "O'qishni to'xtatish sababi", type: 'textarea', req: true, full: true }],
      onSubmit: async v => {
        if (v.sabab.length < 3) throw new Error('Sababni batafsilroq yozing (kamida 3 belgi)');
        await IC.api('POST', `/oquvchilar/${x.id}/nofaol`, { sabab: v.sabab }); await load(); IC.toast("O'quvchi nofaol qilindi");
      },
    });

    $('#add').onclick = () => edit(null);
    $('#q').oninput = e => { OQ.q = e.target.value.trim().toLowerCase(); draw(); };
    view.querySelector('.subtabs').onclick = e => { const b = e.target.closest('.subtab'); if (b) { OQ.tab = b.dataset.t; draw(); } };
    rows.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      const x = items.find(i => String(i.id) === (b.dataset.e || b.dataset.n || b.dataset.a || b.dataset.d || b.dataset.y)); if (!x) return;
      if (b.dataset.y) return YUZ.enroll(x, { onDone: load });
      if (b.dataset.e) return edit(x);
      if (b.dataset.n) return deactivate(x);
      try {
        if (b.dataset.a) {
          if (!await IC.ask(`«${full(x)}» yana faol o'quvchilar qatoriga qaytarilsinmi?`, { yes: 'Faollashtirish' })) return;
          await IC.api('POST', `/oquvchilar/${x.id}/faol`, {}); await load(); IC.toast("O'quvchi faollashtirildi");
        } else if (b.dataset.d && await IC.confirmBox(`«${full(x)}» o'chirilsinmi? Uning to'lovlari va davomati ham o'chadi. Tarixni saqlash uchun «Nofaol qilish» dan foydalaning.`)) {
          await IC.api('DELETE', '/oquvchilar/' + x.id); await load(); IC.toast("O'chirildi");
        }
      } catch (err) { IC.toast(err.message, true); }
    };
    await load();
  };

  // Dars tugash vaqti: boshlanish (HH:MM) + davomiylik (daqiqa) → «19:00–20:30»
  const endTime = (soat, dav) => { if (!soat || !dav) return ''; const [h, m] = soat.split(':').map(Number), t = h * 60 + m + Number(dav); return `${pad2(Math.floor(t / 60) % 24)}:${pad2(t % 60)}`; };
  S.guruhlar = () => crud({
    title: 'Guruhlar', path: '/guruhlar', addTitle: 'Yangi guruh', editTitle: 'Guruhni tahrirlash', defaults: { holat: 'ochiq', max_oquvchi: 20, oylik_narx: '', boshlangan_qabul: true },
    delText: "Guruhni o'chirasizmi? (o'quvchilar guruhdan chiqariladi)",
    load: async () => (await IC.api('GET', '/guruhlar')).guruhlar,
    // Standart: faqat ochiq va boshlangan guruhlar; yopilganlar alohida bo'limda (ro'yxat to'lib ketmasin)
    tabs: [{ k: 'faol', t: 'Faol', test: x => x.holat !== 'yopilgan', empty: "Faol guruhlar yo'q" },
      { k: 'yopilgan', t: 'Yopilgan', test: x => x.holat === 'yopilgan', empty: "Yopilgan guruhlar yo'q" }],
    // Yopishdan oldin ogohlantirish: o'quvchilar to'lov reestridan chiqadi
    beforeSave: async (x, v) => {
      if (!x || x.holat === 'yopilgan' || v.holat !== 'yopilgan') return true;
      return IC.ask(`Guruhda ${x.oquvchilar_soni} ta o'quvchi bor. Yopilgach ular keyingi oylardan boshlab to'lov reestridan chiqadi (shu oygacha tarix saqlanadi), davomat esa faqat ko'riladi. Davom etasizmi?`, { yes: 'Yopish' });
    },
    cols: [['Guruh', x => `<b>${esc(x.nomi)}</b><div class="muted" style="font-size:13px">${esc(x.fan_nomi)}</div>`],
      ["O'qituvchi", x => esc(x.oqituvchi_nomi) || '—'],
      ['Jadval', x => esc(x.jadval) ? (x.davomiylik && x.soat ? esc(x.jadval.replace(/ \d\d:\d\d$/, '')) : esc(x.jadval)) + (x.davomiylik ? `<div class="muted" style="font-size:13px">${esc(x.soat)}–${endTime(x.soat, x.davomiylik)} (${x.davomiylik} daq)</div>` : '') : '—'],
      ['Boshlanish', x => IC.fdate(x.boshlanish)],
      ["Oylik narx", x => IC.money(x.oylik_narx)],
      ["O'quvchilar", x => `${x.oquvchilar_soni} / ${x.max_oquvchi}`],
      ['Holat', x => `<span class="badge ${HOLAT[x.holat][1]}">${HOLAT[x.holat][0]}</span>${x.holat === 'yopilgan' && x.yopilgan_sana ? `<div class="muted" style="font-size:13px">${IC.fdate(x.yopilgan_sana)}</div>` : ''}${x.holat === 'boshlangan' && !x.boshlangan_qabul ? '<div class="muted" style="font-size:13px">Botda yopiq</div>' : ''}`]],
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
        { k: 'davomiylik', label: 'Dars davomiyligi (daqiqa)', type: 'number', inputmode: 'numeric', req: !x || x.holat !== 'yopilgan', quick: [45, 60, 90, 120],
          hint: 'Daqiqalarda, masalan 90. Botda va davomatda dars tugash vaqti ko\'rinadi, soatbay oyliklar shundan hisoblanadi.' },
        { k: 'boshlanish', label: 'Boshlanish sanasi', type: 'date', hint: "Sana kelganda «Ochiq» guruh avtomatik «Boshlangan» bo'ladi." }, { k: 'max_oquvchi', label: "Maks. o'quvchi", type: 'number', req: true },
        { k: 'oylik_narx', label: "Oylik to'lov narxi (so'm)", type: 'number', req: true, inputmode: 'decimal' },
        { k: 'holat', label: 'Holat', type: 'select', req: true, options: [{ v: 'ochiq', t: 'Ochiq' }, { v: 'boshlangan', t: 'Boshlangan' }, { v: 'yopilgan', t: 'Yopilgan' }],
          hint: "Ochiq/Boshlangan — botda ko'rinadi. Yopilgan — botdan va to'lov reestridan (keyingi oylardan) chiqadi, o'quvchi qo'shish va davomat yozish to'xtaydi." },
        { k: 'boshlangan_qabul', label: "Dars boshlangach ham botdan yozilish mumkin", type: 'checkbox', full: true, hint: "O'chirilsa, «Boshlangan» guruh botda ko'rinmaydi (admin qo'lda qo'sha oladi)." }];
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
      ${g.holat === 'yopilgan' ? `<p class="muted" style="margin:-6px 0 12px">Guruh yopilgan${g.yopilgan_sana ? ' (' + IC.fdate(g.yopilgan_sana) + ')' : ''}: o'quvchi qo'shib bo'lmaydi. Qo'shish uchun guruhni qayta oching.</p>`
        : `<div style="display:flex;gap:8px;margin-bottom:12px"><select id="sel" aria-label="O'quvchi"></select><button class="btn pri" id="go" type="button">Qo'shish</button></div>`}
      <div class="err" role="alert"></div><div id="lst"></div><div class="mact"><button class="btn" id="x" type="button">Yopish</button></div></div>`;
    document.body.appendChild(ov);
    const $ = s => ov.querySelector(s), close = () => { ov.remove(); reload(); };
    $('#x').onclick = close; ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    const all = (await IC.api('GET', '/oquvchilar')).items.filter(o => o.faol);
    async function draw() {
      const cur = (await IC.api('GET', `/guruhlar/${g.id}/oquvchilar`)).items, ids = new Set(cur.map(c => c.id));
      if ($('#sel')) $('#sel').innerHTML = all.filter(o => !ids.has(o.id)).map(o => `<option value="${o.id}">${esc(full(o))}</option>`).join('') || '<option value="">— qo\'shiladigan o\'quvchi yo\'q —</option>';
      $('#lst').innerHTML = cur.length ? `<table><tbody>${cur.map(c => `<tr><td><b>${esc(full(c))}</b><div class="muted" style="font-size:13px">${esc(c.telefon)}</div></td><td class="act"><button class="btn sm dng" data-r="${c.id}">Chiqarish</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Guruhda o\'quvchi yo\'q</div>';
    }
    if ($('#go')) $('#go').onclick = async () => {
      $('.err').textContent = ''; const v = $('#sel').value; if (!v) return;
      try { await IC.api('POST', `/guruhlar/${g.id}/oquvchilar`, { oquvchi_id: v }); await draw(); } catch (x) { $('.err').textContent = x.message; }
    };
    $('#lst').onclick = async e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      try { await IC.api('DELETE', `/guruhlar/${g.id}/oquvchilar/${b.dataset.r}`); await draw(); } catch (x) { $('.err').textContent = x.message; }
    };
    draw().catch(x => { $('.err').textContent = x.message; });
  }


  // Davomat: guruh va sana bo'yicha har bir o'quvchi uchun keldi / kelmadi / sababli.
  // ‹ › tugmalari guruhning dars kunlari (kunlar) bo'yicha o'tkazadi; «+ Qo'shimcha dars» — kalendardan ixtiyoriy sana tanlanadi.
  async function attendance(g) {
    const KUN_N = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
    const OY_N = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
    const today = (() => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
    const dayOf = s => new Date(s + 'T00:00:00Z');
    const wd = s => dayOf(s).getUTCDay() || 7;                       // 1=Du … 7=Yak (guruh.kunlar bilan bir xil)
    const shift = (s, n) => { const d = dayOf(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const kunlar = (g.kunlar || []).map(Number);
    const closed = g.holat === 'yopilgan';   // yopilgan guruh davomati faqat ko'riladi
    const isLesson = s => kunlar.includes(wd(s));
    // Oldingi (dir=-1) / keyingi (dir=+1) dars kuni; dars kunlari belgilanmagan guruhda — oddiy ±1 kun
    const stepLesson = (s, dir) => { if (!kunlar.length) return shift(s, dir); for (let i = 0; i < 7; i++) { s = shift(s, dir); if (isLesson(s)) return s; } return null; };
    const label = s => { const d = dayOf(s); return `${KUN_N[wd(s) - 1]}, ${d.getUTCDate()} ${OY_N[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

    // Boshlang'ich sana: bugun dars kuni bo'lsa — bugun, aks holda eng oxirgi o'tgan dars kuni
    let cur = !kunlar.length || isLesson(today) ? today : (stepLesson(today, -1) || today);
    if (g.boshlanish && cur < g.boshlanish) cur = today;
    let dirty = false, rows = [];

    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="card modal" role="dialog" aria-modal="true"><h3>${esc(g.nomi)} — davomat</h3>
      ${g.soat ? `<p class="muted" style="margin:-8px 0 10px">Dars vaqti: ${esc(g.soat)}${g.davomiylik ? '–' + endTime(g.soat, g.davomiylik) + ' (' + g.davomiylik + ' daq)' : ''}</p>` : ''}
      ${closed ? `<p class="badge off" style="margin:0 0 10px;display:inline-block">Guruh yopilgan${g.yopilgan_sana ? ' · ' + esc(IC.fdate(g.yopilgan_sana)) : ''} — davomat faqat ko'riladi</p>` : ''}
      <div class="att-nav">
        <button class="btn arrow" id="pv" type="button" aria-label="Oldingi dars kuni" title="Oldingi dars kuni">‹</button>
        <div class="att-date" aria-live="polite"><b id="dl"></b><span class="badge warn hidden" id="xb">Qo'shimcha dars</span></div>
        <button class="btn arrow" id="nx" type="button" aria-label="Keyingi dars kuni" title="Keyingi dars kuni">›</button>
        <button class="btn" id="ex" type="button" aria-expanded="false">+ Qo'shimcha dars</button>
      </div>
      <div class="att-ex hidden" id="exr"><div class="fld" style="margin:0;flex:1"><label for="dt">Qo'shimcha dars sanasi</label><input type="date" id="dt" max="${today}"></div></div>
      <div style="margin-bottom:10px"><button class="btn sm" id="all" type="button">Hammasi keldi</button> <button class="btn sm" id="cm" type="button">📷 Kamera bilan</button></div>
      <div id="lst"></div><div class="err" role="alert"></div>
      <div class="mact"><button class="btn" id="x" type="button">Yopish</button><button class="btn pri" id="save" type="button">Saqlash</button></div></div>`;
    document.body.appendChild(ov);
    const $ = q => ov.querySelector(q), err = $('.err'), close = () => ov.remove();
    $('#x').onclick = close; ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('#x').focus(); // fokus oyna ichida bo'lsin (Esc ishlashi uchun)
    if (closed) { $('#all').disabled = true; $('#cm').disabled = true; $('#save').disabled = true; }

    const draw = () => {
      $('#lst').innerHTML = rows.length
        ? `<table><tbody>${rows.map(r => `<tr><td><b>${esc(full(r))}</b></td><td class="act">
            <select data-o="${r.id}" aria-label="${esc(full(r))}" style="width:auto"${closed ? ' disabled' : ''}>
              <option value="">— belgilanmagan —</option>
              ${[['keldi', 'Keldi'], ['kechikdi', 'Kechikdi'], ['kelmadi', 'Kelmadi'], ['sababli', 'Sababli']].map(([v, t]) => `<option value="${v}"${r.holat === v ? ' selected' : ''}>${t}</option>`).join('')}
            </select></td></tr>`).join('')}</tbody></table>`
        : "<div class=\"empty\">Bu sanada guruhda o'quvchi yo'q</div>";
    };
    // Sarlavha, «Qo'shimcha dars» belgisi va strelkalarning holati
    const sync = () => {
      $('#dl').textContent = label(cur);
      $('#xb').classList.toggle('hidden', !(kunlar.length && !isLesson(cur)));
      const p = stepLesson(cur, -1), n = stepLesson(cur, 1);
      $('#pv').disabled = !p || !!(g.boshlanish && p < g.boshlanish);
      $('#nx').disabled = !n || n > today; // kelajak sanasiga davomat olinmaydi
    };
    let seq = 0;
    const load = async () => {
      const my = ++seq; err.textContent = '';
      // Yuklanguncha ro'yxat tozalanadi: oldingi sana belgilari yangi sanaga saqlanib ketmasin
      rows = []; dirty = false; $('#lst').innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      let got = [], msg = '';
      try { got = (await IC.api('GET', `/guruhlar/${g.id}/davomat?sana=${encodeURIComponent(cur)}`)).items; } catch (x) { msg = x.message; }
      if (my !== seq) return; // oraliqda boshqa sana tanlangan — eskirgan javob e'tiborga olinmaydi
      rows = got; if (msg) err.textContent = msg; draw();
    };
    // Boshqa sanaga o'tish: saqlanmagan belgilar bo'lsa so'raymiz
    const goTo = async s => {
      if (!s || s === cur) return;
      if (dirty && !await IC.ask("Saqlanmagan o'zgarishlar bor. Baribir boshqa sanaga o'tasizmi?", { yes: "O'tish" })) return;
      cur = s; sync(); await load();
    };
    $('#pv').onclick = () => goTo(stepLesson(cur, -1));
    $('#nx').onclick = () => { const n = stepLesson(cur, 1); if (n && n <= today) goTo(n); };
    $('#ex').onclick = () => {
      const row = $('#exr'), open = row.classList.toggle('hidden') === false;
      $('#ex').setAttribute('aria-expanded', String(open));
      if (open) { const i = $('#dt'); i.focus(); try { i.showPicker(); } catch (_) { /* eski brauzer: oddiy maydon */ } }
    };
    $('#dt').onchange = async e => {
      const v = e.target.value; err.textContent = '';
      if (!v) return;
      if (v > today) { err.textContent = "Kelajak sanasi uchun davomat belgilab bo'lmaydi"; e.target.value = ''; return; }
      e.target.value = ''; $('#exr').classList.add('hidden'); $('#ex').setAttribute('aria-expanded', 'false');
      await goTo(v);
    };
    $('#lst').onchange = () => { dirty = true; };
    $('#all').onclick = () => { $('#lst').querySelectorAll('select').forEach(sel => { sel.value = 'keldi'; }); dirty = true; };
    // Kamera: tanilgan o'quvchilar ro'yxatda «Keldi» bo'ladi (saqlashni admin o'zi bosadi)
    $('#cm').onclick = async () => {
      err.textContent = '';
      if (!rows.length) { err.textContent = "Bu sanada guruhda o'quvchi yo'q"; return; }
      if (cur !== today && !await IC.ask(`Tanlangan sana bugun emas (${label(cur)}). Kamera natijasi shu sanaga belgilanadi. Davom etasizmi?`, { yes: 'Davom etish' })) return;
      YUZ.attendance(g, rows, ids => {
        $('#lst').querySelectorAll('select').forEach(sel => { if (ids.has(Number(sel.dataset.o))) sel.value = 'keldi'; });
        if (ids.size) dirty = true;
      });
    };
    $('#save').onclick = async () => {
      err.textContent = '';
      const items = [...$('#lst').querySelectorAll('select')].filter(sel => sel.value).map(sel => ({ oquvchi_id: Number(sel.dataset.o), holat: sel.value }));
      if (!items.length) { err.textContent = "Kamida bitta o'quvchini belgilang"; return; }
      const btn = $('#save'); btn.disabled = true;
      try { await IC.api('PUT', `/guruhlar/${g.id}/davomat`, { sana: cur, items }); IC.toast('Davomat saqlandi'); await load(); }
      catch (x) { err.textContent = x.message; }
      btn.disabled = false;
    };
    sync();
    await load();
  }

  // ═══ LIDLAR: botdan kelgan «kursga yozilish» arizalari ═════════════════════
  const dt = d => (d ? new Date(d).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const tel = t => (t ? `<a href="tel:${esc(t)}">${esc(t)}</a>` : '—');
  const tgLink = x => (x.username ? `<div class="muted" style="font-size:13px"><a href="https://t.me/${esc(x.username)}" target="_blank" rel="noopener">@${esc(x.username)}</a></div>` : '');
  const LID = { yangi: ['Yangi', 'warn'], aloqada: ['Aloqada', ''], yozildi: ['Yozildi', 'ok'], rad: ['Rad etildi', 'off'] };
  const small = t => `<div class="muted" style="font-size:13px">${t}</div>`;

  S.lidlar = () => crud({
    title: 'Lidlar', path: '/lidlar', addTitle: "Yangi lid (qo'lda)", editTitle: 'Lidni tahrirlash', delText: "Lidni o'chirasizmi?",
    load: async () => (await IC.api('GET', '/lidlar')).items,
    cols: [['Sana', x => dt(x.yaratilgan)],
      ['FI', x => `<b>${esc(x.ism)}</b>${small(tel(x.telefon))}${tgLink(x)}`],
      ['Manzil', x => esc(x.manzil) || '—'],
      ['Fan / guruh', x => `<b>${esc(x.fan_nomi)}</b>${small(esc(x.guruh_nomi) + (x.guruh_id ? '' : ' (guruh o\'chirilgan)'))}${x.jadval ? small(esc(x.jadval)) : ''}`
        + (x.guruh_id ? small(`${esc(x.oqituvchi_nomi) || ''}${x.oylik_narx ? ' · ' + esc(IC.money(x.oylik_narx)) : ''}`) : '')],
      ['Holat', x => `<span class="badge ${LID[x.holat][1]}">${LID[x.holat][0]}</span>`],
      ['Izoh', x => esc(x.izoh).slice(0, 80) || '—']],
    actions: x => `<td class="act">${x.oquvchi_id ? '' : `<button class="btn sm pri" data-o="${x.id}">O'quvchiga aylantirish</button> `}<button class="btn sm" data-e="${x.id}">Tahrirlash</button> <button class="btn sm dng" data-d="${x.id}">O'chirish</button></td>`,
    fields: async x => {
      if (x) return [{ k: 'holat', label: 'Holat', type: 'select', req: true, options: Object.entries(LID).map(([v, [t]]) => ({ v, t })) },
        { k: 'izoh', label: 'Izoh (aloqa natijasi)', type: 'textarea', full: true }];
      // Yangi lid: holat avtomatik «Yangi». Fan → guruh (guruhlar tanlangan fanga qarab chiqadi)
      const [f, g] = await Promise.all([IC.api('GET', '/fanlar'), IC.api('GET', '/guruhlar')]);
      const open = g.guruhlar.filter(a => a.holat !== 'yopilgan'), fanIds = new Set(open.map(a => a.fan_id));
      return [{ k: 'familiya', label: 'Familiya', req: true }, { k: 'ism', label: 'Ism', req: true },
        { k: 'telefon', label: 'Telefon', type: 'tel', req: true }, { k: 'manzil', label: 'Yashash manzili', autocomplete: 'off' },
        { k: 'fan_id', label: 'Fan', type: 'select', req: true, placeholder: '— Fanni tanlang —', options: opts(f.fanlar.filter(a => a.faol && fanIds.has(a.id)), 'nomi') },
        { k: 'guruh_id', label: 'Guruh', type: 'select', req: true, dependsOn: 'fan_id', noDepText: '— avval fanni tanlang —', emptyText: "— bu fanda ochiq guruh yo'q —",
          options: open.map(a => ({ v: a.id, t: `${a.nomi}${a.jadval ? ' · ' + a.jadval : ''}`, group: a.fan_id })) },
        { k: 'izoh', label: "Izoh (qachondan o'qishni boshlashi va h.k.)", type: 'textarea', full: true }];
    },
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
        <div class="sbox"><input class="search" id="q" placeholder="Ism / telefon…" aria-label="Qidirish" value="${esc(RS.q)}" autocomplete="off"></div>
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

  // ═══ OYLIKLAR: o'qituvchilar haqi (oy bo'yicha, jonli hisob) ═══
  // Soatbay: davomat belgilangan kunlar × davomiylik/60 × stavka. Oylik: qat'iy. Foiz: guruhlarga shu oy tushgan to'lovdan.
  const OYL = { oy: thisMonth(), seq: 0, open: new Set() };
  const soatFmt = n => String(Math.round(n * 100) / 100).replace('.', ',');
  const guruhDetail = x => {
    if (!x.guruhlar.length) return '<div class="muted">Guruh biriktirilmagan</div>';
    const oylik = x.haq_turi === 'oylik';
    return `<table><thead><tr><th>Guruh</th><th>Davomiylik</th><th>Darslar</th><th>Soat</th><th>Tushgan to'lov</th><th>Summa</th></tr></thead><tbody>${x.guruhlar.map(g => `<tr>
      <td><b>${esc(g.nomi)}</b><div class="muted" style="font-size:13px">${esc(g.fan_nomi)}</div></td>
      <td>${g.davomiylik ? g.davomiylik + ' daq' : '<span class="badge warn">Kiritilmagan</span>'}</td><td>${g.darslar}</td><td>${soatFmt(g.soat)}</td>
      <td>${IC.money(g.tushum)}</td><td>${oylik ? '—' : IC.money(g.summa)}</td></tr>`).join('')}</tbody></table>${oylik ? `<div class="muted" style="font-size:13px;margin-top:6px">Oylik maosh qat'iy, guruhlar bo'yicha taqsimlanmaydi.</div>` : ''}`;
  };
  S.oyliklar = async () => {
    view.innerHTML = `<div class="head"><h2>Oyliklar</h2><div class="spacer"></div>
      <div class="mnav"><button class="btn sm" id="pm" type="button" aria-label="Oldingi oy">‹</button><b id="ml"></b><button class="btn sm" id="nm" type="button" aria-label="Keyingi oy">›</button></div>
      <button class="btn" id="xl" type="button">⬇ Excel</button></div>
      <p class="muted" style="margin:-4px 0 14px">Soat = dars davomiyligi ÷ 60. Dars sifatida guruhda davomat belgilangan kunlar hisoblanadi. Foiz — guruhlarga shu oyda tushgan to'lovdan.</p>
      <div id="body"><div class="empty">Yuklanmoqda…</div></div>`;
    const $ = q => view.querySelector(q);
    const draw = d => {
      const body = $('#body'); if (!body) return;
      const warn = d.items.filter(x => x.ogohlantirish.length).length;
      const rows = d.items.map(x => {
        const open = OYL.open.has(x.id);
        return `<tr><td><b>${esc(full(x))}</b>${x.faol ? '' : ' <span class="badge off">Nofaol</span>'}<div class="muted" style="font-size:13px">${esc(x.fan_nomi)}</div>
          ${x.ogohlantirish.map(w => `<div style="margin-top:4px"><span class="badge warn">${esc(w)}</span></div>`).join('')}</td>
          <td>${haqCell(x)}</td><td>${x.darslar}</td><td>${soatFmt(x.soat)}</td><td>${IC.money(x.tushum)}</td>
          <td><b>${x.haq_turi ? IC.money(x.summa) : '—'}</b></td>
          <td class="act"><button class="btn sm" data-o="${x.id}" type="button">${open ? 'Yopish' : 'Guruhlar'}</button></td></tr>` +
          (open ? `<tr><td colspan="7">${guruhDetail(x)}</td></tr>` : '');
      }).join('');
      body.innerHTML = `<div class="stats" style="margin-bottom:14px">
        <div class="card stat"><b>${esc(IC.money(d.jami))}</b><span>Jami hisoblangan</span></div>
        <div class="card stat"><b>${d.items.length}</b><span>O'qituvchilar</span></div>
        <div class="card stat"><b>${warn}</b><span>E'tibor talab qiladi</span></div></div>
        ${d.items.length ? `<div class="card tw"><table><thead><tr><th>O'qituvchi</th><th>To'lov turi</th><th>Darslar</th><th>Soat</th><th>Tushgan to'lov</th><th>Hisoblangan</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
          : '<div class="card"><div class="empty">Bu oy uchun ma\'lumot yo\'q</div></div>'}`;
      body.onclick = e => {
        const b = e.target.closest('[data-o]'); if (!b) return;
        const id = Number(b.dataset.o); OYL.open.has(id) ? OYL.open.delete(id) : OYL.open.add(id); draw(d);
      };
    };
    const reload = async () => {
      const my = ++OYL.seq; $('#ml').textContent = oyNomi(OYL.oy); $('#body').innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      try { const d = await IC.api('GET', '/oqituvchi-hisobot?oy=' + OYL.oy); if (my === OYL.seq) draw(d); }
      catch (x) { if (my === OYL.seq && $('#body')) { $('#body').innerHTML = ''; IC.toast(x.message, true); } }
    };
    $('#pm').onclick = () => { OYL.oy = moveMonth(OYL.oy, -1); reload(); };
    $('#nm').onclick = () => { if (OYL.oy >= thisMonth()) return; OYL.oy = moveMonth(OYL.oy, 1); reload(); };
    $('#xl').onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      try { await IC.download('/oqituvchi-hisobot/excel?oy=' + OYL.oy, `oyliklar-${OYL.oy}.xlsx`); } catch (x) { IC.toast(x.message, true); }
      b.disabled = false;
    };
    await reload();
  };

  // ── Navigatsiya ──
  const TABS = [['dash', '🏠 Bosh sahifa'], ['lidlar', '📥 Lidlar'], ['fanlar', '📚 Fanlar'], ['guruhlar', '👥 Guruhlar'], ['oquvchilar', "🎓 O'quvchilar"], ['oqituvchilar', "🧑‍🏫 O'qituvchilar"],
    ['tolovlar', "💳 To'lovlar"], ['oyliklar', '💰 Oyliklar'], ['vakansiyalar', '💼 Vakansiyalar'], ['nomzodlar', '📨 Nomzodlar']];
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
