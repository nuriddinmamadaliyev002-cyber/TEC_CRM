// O'quv markaz rahbari (superadmin) sahifalari — BARCHA filiallar bo'yicha:
//   RAHBAR.jamlama(el) · RAHBAR.oyliklar(el) · RAHBAR.vakansiyalar(el) · RAHBAR.nomzodlar(el)
// Ma'lumotni o'zgartirish filial bo'yicha mavjud API orqali bajariladi (X-Filial-Id sarlavhasi bilan).
(function () {
  const esc = IC.esc, money = IC.money;
  const OYLAR = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const moveMonth = (oy, n) => { const d = new Date(+oy.slice(0, 4), +oy.slice(5) - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const oyNomi = oy => OYLAR[+oy.slice(5) - 1] + ' ' + oy.slice(0, 4);
  const pctTxt = n => (n == null ? '—' : String(n).replace('.', ',') + '%');
  const full = o => `${o.familiya || ''} ${o.ism || ''}`.trim();
  const dt = d => (d ? new Date(d).toLocaleDateString('ru-RU') : '—');
  const small = t => `<div class="muted" style="font-size:13px">${t}</div>`;
  const fh = id => ({ 'X-Filial-Id': String(id) });
  const OY = { oy: thisMonth() }; // jamlama va oyliklar uchun umumiy oy
  const seqs = {};
  const stale = (k, n) => seqs[k] !== n;

  // Rahbar tanlangan filialning to'liq admin panelini ochadi (ixtiyoriy bo'limda)
  const openPanel = (id, nomi, tab) => { IC.filial.set(id, nomi); location.href = 'panel.html' + (tab ? '#' + tab : ''); };

  const monthBar = (title, extra) => `<div class="head"><h2>${title}</h2><div class="spacer"></div>
    <div class="mnav"><button class="btn sm" data-m="-1" type="button" aria-label="Oldingi oy">‹</button><b class="ml"></b><button class="btn sm" data-m="1" type="button" aria-label="Keyingi oy">›</button></div>${extra || ''}</div>`;
  function bindMonth(root, reload) {
    const sync = () => { root.querySelector('.ml').textContent = oyNomi(OY.oy); root.querySelector('[data-m="1"]').disabled = OY.oy >= thisMonth(); };
    root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const nx = moveMonth(OY.oy, Number(b.dataset.m)); if (nx > thisMonth()) return;
      OY.oy = nx; sync(); reload();
    });
    sync();
  }
  const filialSelect = (items, id) => `<select class="rh-sel" id="${id}" aria-label="Filial"><option value="">Barcha filiallar</option>` +
    items.map(f => `<option value="${f.id}">${esc(f.nomi)}</option>`).join('') + '</select>';

  // ═══ 1) JAMLAMA ═══════════════════════════════════════════════════════════
  async function jamlama(root) {
    root.innerHTML = monthBar('Barcha filiallar bo\'yicha jamlama') + '<div class="body"><div class="empty">Yuklanmoqda…</div></div>' +
      `<p class="muted" style="font-size:13px;margin-top:12px">Tushum — shu oyda kiritilgan barcha to'lovlar (kassa). Reja va yig'ilish — oylik narxi belgilangan guruhlar bo'yicha (filial panelidagi «To'lovlar» bilan bir xil).
      O'qituvchi haqi — «Oyliklar» hisobotidagi summa. «Tushum − haq» taxminiy: ijara, soliq va boshqa xarajatlar kiritilmagan.</p>`;
    const body = root.querySelector('.body');
    const load = async () => {
      const my = seqs.j = (seqs.j || 0) + 1; body.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      let d; try { d = await IC.api('GET', '/rahbar/jamlama?oy=' + OY.oy); } catch (x) { if (!stale('j', my)) body.innerHTML = `<div class="empty">${esc(x.message)}</div>`; return; }
      if (stale('j', my)) return;
      const t = d.jami, mx = Math.max(...d.items.map(f => f.tushum), 1);
      const card = (l, v, note) => `<div class="card stat"><b>${esc(v)}</b><span>${esc(l)}</span>${note ? `<div class="sd"><small>${esc(note)}</small></div>` : ''}</div>`;
      const n = v => esc(money(v).replace(" so'm", '')); // jadvalda «so'm» ustun sarlavhasida — ixcham bo'lsin
      const rows = d.items.map(f => `<tr>
        <td data-l=""><b>${esc(f.nomi)}</b>${f.faol ? '' : ' <span class="badge off">Nofaol</span>'}${f.yangi_lidlar || f.yangi_nomzodlar ? `<div><span class="badge warn">${f.yangi_lidlar} lid · ${f.yangi_nomzodlar} nomzod</span></div>` : ''}</td>
        <td data-l="O'quvchilar">${f.oquvchilar}${small(f.guruhlar + ' guruh')}</td>
        <td data-l="Tushum"><b>${n(f.tushum)}</b><div class="rh-bar"><span><i style="width:${Math.round(f.tushum / mx * 100)}%"></i></span></div></td>
        <td data-l="Yig'ilish">${pctTxt(f.yigilish)}${f.reja > 0 ? small('reja ' + n(f.reja)) : ''}</td>
        <td data-l="Qarz">${f.qarz > 0 ? `<span class="bad">${n(f.qarz)}</span>${small(f.qarzdor + " ta o'quvchi")}` : '—'}</td>
        <td data-l="O'qituvchi haqi">${n(f.oylik)}${f.haq_belgilanmagan ? `<div><span class="badge warn">${f.haq_belgilanmagan} ta haq yo'q</span></div>` : ''}</td>
        <td data-l="Tushum − haq"><b class="${f.natija >= 0 ? 'ok' : 'bad'}">${n(f.natija)}</b></td>
        <td class="act"><button class="btn sm pri" data-o="${f.id}" type="button">Panelni ochish</button></td></tr>`).join('');
      body.innerHTML = `<div class="stats" style="margin-bottom:16px">
        ${card('Tushum', money(t.tushum), t.filiallar + ' ta faol filial')}
        ${card("Yig'ilish", pctTxt(t.yigilish), t.reja > 0 ? 'Reja: ' + money(t.reja) : 'Oylik narx belgilanmagan')}
        ${card('Qarz', money(t.qarz), t.qarzdor ? t.qarzdor + " ta o'quvchi qarzdor" : "Qarz yo'q")}
        ${card("O'qituvchi haqi", money(t.oylik), t.haq_belgilanmagan ? t.haq_belgilanmagan + ' ta haq belgilanmagan' : '')}
        ${card('Tushum − haq', money(t.natija), 'taxminiy')}
        ${card("Faol o'quvchilar", t.oquvchilar, t.guruhlar + ' guruh · ' + t.oqituvchilar + " o'qituvchi")}</div>
        ${d.items.length ? `<div class="card tw"><table class="rt"><thead><tr><th>Filial</th><th>O'quvchilar</th><th>Tushum (so'm)</th><th>Yig'ilish</th><th>Qarz (so'm)</th><th>O'qituvchi haqi (so'm)</th><th>Tushum − haq (so'm)</th><th></th></tr></thead>
          <tbody>${rows}<tr class="rh-tot"><td data-l="">JAMI</td><td data-l="O'quvchilar">${t.oquvchilar}</td><td data-l="Tushum">${n(t.tushum)}</td>
          <td data-l="Yig'ilish">${pctTxt(t.yigilish)}</td><td data-l="Qarz">${n(t.qarz)}</td><td data-l="O'qituvchi haqi">${n(t.oylik)}</td><td data-l="Tushum − haq">${n(t.natija)}</td><td></td></tr></tbody></table></div>`
          : '<div class="card"><div class="empty">Hali filiallar yo\'q</div></div>'}`;
      body.onclick = e => { const b = e.target.closest('[data-o]'); if (!b) return; const f = d.items.find(x => String(x.id) === b.dataset.o); if (f) openPanel(f.id, f.nomi); };
    };
    bindMonth(root, load); await load();
  }

  // ═══ 2) OYLIKLAR (barcha filiallar) ═══════════════════════════════════════
  const HAQ_NOM = { soatbay: 'Soatbay', oylik: 'Oylik', foiz: 'Foiz' };
  const haqSub = x => (x.haq_turi === 'soatbay' ? `${money(x.soat_stavka)} / soat` : x.haq_turi === 'oylik' ? money(x.oylik_maosh) : x.haq_turi === 'foiz' ? `${x.foiz}%` : '');
  const haqCell = x => (x.haq_turi ? `<b>${HAQ_NOM[x.haq_turi]}</b>${small(esc(haqSub(x)))}` : '<span class="badge off">Belgilanmagan</span>');
  const open = new Set();
  async function oyliklar(root) {
    root.innerHTML = monthBar('Oyliklar — barcha filiallar', '<span id="flt"></span><button class="btn" data-xl type="button">⬇ Excel</button>') +
      '<div class="body"><div class="empty">Yuklanmoqda…</div></div>';
    const body = root.querySelector('.body'); let data = null, filial = '';
    const key = x => x.filial_id + '_' + x.id;
    const draw = () => {
      const items = data.items.filter(x => !filial || String(x.filial_id) === filial);
      const jami = items.reduce((a, x) => a + x.summa, 0), warn = items.filter(x => x.ogohlantirish.length).length;
      const rows = items.map(x => {
        const isOpen = open.has(key(x));
        const det = isOpen ? `<tr class="det"><td class="dc" colspan="8">${x.guruhlar.length ? `<table class="rt"><thead><tr><th>Guruh</th><th>Davomiylik</th><th>Darslar</th><th>Soat</th><th>Tushgan to'lov</th><th>Summa</th></tr></thead><tbody>` +
          x.guruhlar.map(g => `<tr><td data-l="">${esc(g.nomi)}</td><td data-l="Davomiylik">${g.davomiylik ? g.davomiylik + ' daq' : '—'}</td><td data-l="Darslar">${g.darslar}</td><td data-l="Soat">${g.soat}</td><td data-l="Tushgan to'lov">${esc(money(g.tushum))}</td><td data-l="Summa">${x.haq_turi === 'oylik' ? '—' : esc(money(g.summa))}</td></tr>`).join('') + '</tbody></table>' : '<span class="muted">Guruh yo\'q</span>'}</td></tr>` : '';
        return `<tr><td data-l="Filial">${esc(x.filial_nomi)}</td>
          <td data-l=""><b>${esc(full(x))}</b>${x.faol ? '' : ' <span class="badge off">Nofaol</span>'}${small(esc(x.fan_nomi))}${x.ogohlantirish.map(w => `<div class="warn-note">${esc(w)}</div>`).join('')}</td>
          <td data-l="To'lov turi">${haqCell(x)}</td><td data-l="Darslar">${x.darslar}</td><td data-l="Soat">${x.soat}</td><td data-l="Tushgan to'lov">${esc(money(x.tushum))}</td>
          <td data-l="Hisoblangan"><b>${x.haq_turi ? esc(money(x.summa)) : '—'}</b></td>
          <td class="act"><button class="btn sm" data-g="${key(x)}" type="button">${isOpen ? 'Yopish' : 'Guruhlar'}</button>${x.haq_turi ? '' : ` <button class="btn sm pri" data-h="${key(x)}" type="button">Haqni belgilash</button>`}</td></tr>${det}`;
      }).join('');
      const perF = data.filiallar.filter(f => f.oqituvchilar).map(f => `<div class="card stat"><b>${esc(money(f.jami))}</b><span>${esc(f.nomi)} · ${f.oqituvchilar} o'qituvchi</span></div>`).join('');
      body.innerHTML = `<div class="stats" style="margin-bottom:14px"><div class="card stat"><b>${esc(money(jami))}</b><span>Jami hisoblangan${filial ? '' : ' (barcha filiallar)'}</span></div>
        <div class="card stat"><b>${items.length}</b><span>O'qituvchilar</span></div><div class="card stat"><b>${warn}</b><span>E'tibor talab qiladi</span></div></div>
        ${!filial && perF ? `<div class="stats" style="margin-bottom:14px">${perF}</div>` : ''}
        ${items.length ? `<div class="card tw"><table class="rt"><thead><tr><th>Filial</th><th>O'qituvchi</th><th>To'lov turi</th><th>Darslar</th><th>Soat</th><th>Tushgan to'lov</th><th>Hisoblangan</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
          : '<div class="card"><div class="empty">Bu oy uchun ma\'lumot yo\'q</div></div>'}`;
    };
    root.querySelector('.head').onclick = async e => {
      const b = e.target.closest('[data-xl]'); if (!b) return; b.disabled = true;
      try { await IC.download('/rahbar/oyliklar/excel?oy=' + OY.oy, `oyliklar-${OY.oy}.xlsx`); } catch (x) { IC.toast(x.message, true); }
      b.disabled = false;
    };
    body.onclick = e => {
      const g = e.target.closest('[data-g]'), h = e.target.closest('[data-h]');
      if (g) { open.has(g.dataset.g) ? open.delete(g.dataset.g) : open.add(g.dataset.g); return draw(); }
      if (h) { const x = data.items.find(i => key(i) === h.dataset.h); if (x) openPanel(x.filial_id, x.filial_nomi, 'oqituvchilar'); }
    };
    const load = async () => {
      const my = seqs.o = (seqs.o || 0) + 1; body.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
      try { const d = await IC.api('GET', '/rahbar/oyliklar?oy=' + OY.oy); if (stale('o', my)) return; data = d;
        const f = root.querySelector('#flt');
        if (!f.firstChild) { f.innerHTML = filialSelect(d.filiallar, 'oflt'); f.firstChild.onchange = ev => { filial = ev.target.value; draw(); }; }
        draw(); }
      catch (x) { if (!stale('o', my)) body.innerHTML = `<div class="empty">${esc(x.message)}</div>`; }
    };
    bindMonth(root, load); await load();
  }

  // ═══ yordamchi: filial bo'yicha filtrli ro'yxat sahifasi (vakansiyalar, nomzodlar) ═══
  const FL = { v: '', n: '', nh: '' }; // tanlangan filtrlar sahifalar almashganda eslab qolinadi

  // ═══ 3) VAKANSIYALAR ══════════════════════════════════════════════════════
  async function vakansiyalar(root) {
    root.innerHTML = `<div class="head"><h2>Vakansiyalar <span class="count" id="cnt"></span></h2><div class="spacer"></div><span id="flt"></span>
      <input class="search" id="q" placeholder="Qidirish…" aria-label="Qidirish"><button class="btn pri" id="add" type="button">+ Qo'shish</button></div>
      <div class="card tw"><table class="rt"><thead><tr><th>Filial</th><th>Nomi</th><th>Maosh</th><th>Nomzodlar</th><th>Holat</th><th></th></tr></thead><tbody id="rows"></tbody></table><div class="empty hidden" id="empty">Hozircha ma'lumot yo'q</div></div>`;
    const $ = q => root.querySelector(q); let items = [], fl = [], fans = [], q = '';
    const draw = () => {
      const f = items.filter(x => (!FL.v || String(x.filial_id) === FL.v) && (!q || JSON.stringify(Object.values(x)).toLowerCase().includes(q)));
      $('#cnt').textContent = items.length ? `(${f.length})` : ''; $('#empty').classList.toggle('hidden', f.length > 0);
      $('#rows').innerHTML = f.map(x => `<tr><td data-l="Filial">${esc(x.filial_nomi)}</td><td data-l=""><b>${esc(x.nomi)}</b>${x.fan_nomi ? small(esc(x.fan_nomi)) : ''}</td>
        <td data-l="Maosh">${esc(x.maosh) || '—'}</td><td data-l="Nomzodlar">${x.nomzodlar_soni}</td>
        <td data-l="Holat"><span class="badge ${x.faol ? 'ok' : 'off'}">${x.faol ? "Botda ko'rinadi" : 'Yopiq'}</span></td>
        <td class="act"><button class="btn sm" data-e="${x.id}" type="button">Tahrirlash</button> <button class="btn sm dng" data-d="${x.id}" type="button">O'chirish</button></td></tr>`).join('');
    };
    const load = async () => {
      const [v, f, fa] = await Promise.all([IC.api('GET', '/rahbar/vakansiyalar'), IC.api('GET', '/filiallar'), IC.api('GET', '/rahbar/fanlar')]);
      items = v.items; fl = f.items; fans = fa.items;
      if (!$('#flt').firstChild) { $('#flt').innerHTML = filialSelect(fl, 'vflt'); const s = $('#flt').firstChild; s.value = FL.v; s.onchange = e => { FL.v = e.target.value; draw(); }; }
      draw();
    };
    const edit = x => {
      const fanOpts = list => list.map(a => ({ v: a.id, t: a.nomi, group: a.filial_id }));
      const common = [{ k: 'nomi', label: "Vakansiya nomi (masalan: Ingliz tili o'qituvchisi)", req: true, full: true }];
      const rest = [{ k: 'maosh', label: "Maosh (matn, masalan: 4–6 mln so'm)" }, { k: 'tavsif', label: 'Tavsif', type: 'textarea', full: true },
        { k: 'talablar', label: 'Talablar', type: 'textarea', full: true }, { k: 'faol', label: "Faol (botda ko'rinadi, ariza qabul qilinadi)", type: 'checkbox' }];
      const fields = x
        ? [...common, { k: 'fan_id', label: 'Fan (ixtiyoriy)', type: 'select', options: fanOpts(fans.filter(a => a.filial_id === x.filial_id)) }, ...rest]
        : [{ k: 'filial_id', label: 'Filial', type: 'select', req: true, full: true, placeholder: '— Filialni tanlang —', options: fl.filter(f => f.faol).map(f => ({ v: f.id, t: f.nomi })) },
          ...common, { k: 'fan_id', label: 'Fan (ixtiyoriy)', type: 'select', dependsOn: 'filial_id', options: fanOpts(fans), noDepText: '— avval filialni tanlang —', emptyText: "— bu filialda fan yo'q —" }, ...rest];
      if (!x && !fl.some(f => f.faol)) return IC.toast('Avval faol filial yarating', true);
      IC.formModal({ title: x ? 'Vakansiyani tahrirlash' : 'Yangi vakansiya', fields, values: x || { faol: true, filial_id: fl.filter(f => f.faol).length === 1 ? fl.find(f => f.faol).id : '' },
        onSubmit: async v => {
          if (x) await IC.api('PUT', '/vakansiyalar/' + x.id, v, fh(x.filial_id)); else await IC.api('POST', '/vakansiyalar', v, fh(v.filial_id));
          await load(); IC.toast('Saqlandi');
        } });
    };
    $('#add').onclick = () => edit(null);
    $('#q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
    $('#rows').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      const x = items.find(i => String(i.id) === (b.dataset.e || b.dataset.d)); if (!x) return;
      if (b.dataset.e) return edit(x);
      if (await IC.ask("Vakansiyani o'chirasizmi? (kelgan nomzodlar saqlanadi)", { yes: "O'chirish" })) {
        try { await IC.api('DELETE', '/vakansiyalar/' + x.id, null, fh(x.filial_id)); await load(); IC.toast("O'chirildi"); } catch (er) { IC.toast(er.message, true); }
      }
    };
    await load();
  }

  // ═══ 4) NOMZODLAR ═════════════════════════════════════════════════════════
  const NZ = { yangi: ['Yangi', 'warn'], korildi: ["Ko'rildi", ''], suhbat: ['Suhbat', ''], qabul: ['Qabul qilindi', 'ok'], rad: ['Rad etildi', 'off'] };
  const contact = x => `${x.telefon ? `<a href="tel:${esc(x.telefon)}">${esc(x.telefon)}</a>` : ''}${x.username ? small('@' + esc(x.username)) : ''}`;
  async function nomzodlar(root) {
    root.innerHTML = `<div class="head"><h2>Nomzodlar <span class="count" id="cnt"></span></h2><div class="spacer"></div><span id="flt"></span>
      <select class="rh-sel" id="hflt" aria-label="Holat"><option value="">Barcha holatlar</option>${Object.entries(NZ).map(([k, [t]]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <input class="search" id="q" placeholder="Qidirish…" aria-label="Qidirish"></div>
      <div class="card tw"><table class="rt nz"><thead><tr><th>Sana</th><th>FI</th><th>Telefon / Telegram</th><th>Filial</th><th>Vakansiya</th><th>Tajriba</th><th>Holat</th><th></th></tr></thead><tbody id="rows"></tbody></table><div class="empty hidden" id="empty">Hozircha ma'lumot yo'q</div></div>`;
    const $ = q => root.querySelector(q); let items = [], q = '';
    const draw = () => {
      const f = items.filter(x => (!FL.n || String(x.filial_id) === FL.n) && (!FL.nh || x.holat === FL.nh) && (!q || JSON.stringify(Object.values(x)).toLowerCase().includes(q)));
      $('#cnt').textContent = items.length ? `(${f.length})` : ''; $('#empty').classList.toggle('hidden', f.length > 0);
      $('#rows').innerHTML = f.map(x => `<tr><td data-l="Sana">${dt(x.yaratilgan)}</td><td data-l=""><b>${esc(x.ism)}</b></td><td data-l="Telefon / Telegram">${contact(x)}</td>
        <td data-l="Filial">${esc(x.filial_nomi)}</td><td data-l="Vakansiya">${esc(x.vakansiya_nomi) || '—'}</td><td data-l="Tajriba"><div class="tj">${esc(x.tajriba).slice(0, 300) || '—'}</div></td>
        <td data-l="Holat"><span class="badge ${NZ[x.holat][1]}">${NZ[x.holat][0]}</span>${x.izoh ? small(esc(x.izoh).slice(0, 80)) : ''}</td>
        <td class="act">${x.rezyume_bor ? `<button class="btn sm" data-r="${x.id}" type="button">Rezyume</button> ` : ''}<button class="btn sm" data-e="${x.id}" type="button">Tahrirlash</button> <button class="btn sm dng" data-d="${x.id}" type="button">O'chirish</button></td></tr>`).join('');
    };
    const load = async () => { items = (await IC.api('GET', '/rahbar/nomzodlar')).items; draw(); };
    const fl = (await IC.api('GET', '/filiallar')).items;
    $('#flt').innerHTML = filialSelect(fl, 'nflt'); { const s = $('#flt').firstChild; s.value = FL.n; s.onchange = e => { FL.n = e.target.value; draw(); }; }
    { const s = $('#hflt'); s.value = FL.nh; s.onchange = e => { FL.nh = e.target.value; draw(); }; }
    $('#q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
    $('#rows').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      const x = items.find(i => String(i.id) === (b.dataset.e || b.dataset.d || b.dataset.r)); if (!x) return;
      if (b.dataset.r) { b.disabled = true; try { await IC.download(`/nomzodlar/${x.id}/rezyume`, x.rezyume_nomi || `rezyume-${x.id}`, fh(x.filial_id)); } catch (er) { IC.toast(er.message, true); } b.disabled = false; return; }
      if (b.dataset.e) return IC.formModal({ title: 'Nomzodni tahrirlash', values: x,
        fields: [{ k: 'holat', label: 'Holat', type: 'select', req: true, options: Object.entries(NZ).map(([v, [t]]) => ({ v, t })) }, { k: 'izoh', label: 'Izoh', type: 'textarea', full: true }],
        onSubmit: async v => { await IC.api('PUT', '/nomzodlar/' + x.id, v, fh(x.filial_id)); await load(); IC.toast('Saqlandi'); } });
      if (await IC.ask("Nomzodni o'chirasizmi?", { yes: "O'chirish" })) {
        try { await IC.api('DELETE', '/nomzodlar/' + x.id, null, fh(x.filial_id)); await load(); IC.toast("O'chirildi"); } catch (er) { IC.toast(er.message, true); }
      }
    };
    await load();
  }

  window.RAHBAR = { jamlama, oyliklar, vakansiyalar, nomzodlar };
})();
