(function () {
  if (!IC.requireRole(['superadmin'])) return;
  IC.header('Superadmin');
  const $ = id => document.getElementById(id), esc = IC.esc;
  let filials = [], admins = [];
  const dt = d => (d ? new Date(d).toLocaleString('ru-RU') : '—');

  function stats() {
    const sum = k => filials.reduce((a, f) => a + (f[k] || 0), 0);
    const items = [['Filiallar', filials.filter(f => f.faol).length], ['Adminlar', sum('adminlar')], ['Faol guruhlar', sum('guruhlar')], ["O'quvchilar", sum('oquvchilar')],
      ["O'qituvchilar", sum('oqituvchilar')], ['Shu oy tushum', IC.money(sum('oy_tushum'))]];
    $('stats').innerHTML = items.map(([l, v]) => `<div class="card stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  }

  // ── Filiallar ──
  function renderFilials() {
    $('fcnt').textContent = filials.length ? `(${filials.length})` : '';
    $('fempty').classList.toggle('hidden', filials.length > 0);
    $('frows').innerHTML = filials.map(f => `<tr>
      <td data-l=""><b>${esc(f.nomi)}</b></td>
      <td data-l="Adminlar">${f.adminlar}</td><td data-l="Guruhlar">${f.guruhlar}</td><td data-l="O'quvchilar">${f.oquvchilar}</td>
      <td data-l="Shu oy tushum">${esc(IC.money(f.oy_tushum))}</td>
      <td data-l="Yangi">${f.yangi_lidlar || f.yangi_nomzodlar ? `<span class="badge warn">${f.yangi_lidlar} lid · ${f.yangi_nomzodlar} nomzod</span>` : '—'}</td>
      <td data-l="Holat"><span class="badge ${f.faol ? 'ok' : 'off'}">${f.faol ? 'Faol' : 'Nofaol'}</span></td>
      <td class="act"><button class="btn sm pri" data-o="${f.id}">Panelni ochish</button> <button class="btn sm" data-e="${f.id}">Tahrirlash</button> <button class="btn sm dng" data-d="${f.id}">O'chirish</button></td></tr>`).join('');
  }
  async function loadFilials() { filials = (await IC.api('GET', '/filiallar')).items; renderFilials(); stats(); }

  function editFilial(f) {
    IC.formModal({
      title: f ? 'Filialni tahrirlash' : 'Yangi filial',
      fields: [{ k: 'nomi', label: 'Filial nomi', req: true, full: true }, { k: 'faol', label: 'Faol', type: 'checkbox' }],
      values: f || { faol: true },
      onSubmit: async v => {
        f ? await IC.api('PUT', '/filiallar/' + f.id, v) : await IC.api('POST', '/filiallar', v);
        await Promise.all([loadFilials(), loadAdmins()]); IC.toast('Saqlandi');
      },
    });
  }
  $('fadd').onclick = () => editFilial(null);
  $('frows').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    const f = filials.find(x => String(x.id) === (b.dataset.o || b.dataset.e || b.dataset.d));
    if (!f) return;
    if (b.dataset.o) { IC.filial.set(f.id, f.nomi); location.href = 'panel.html'; return; }
    if (b.dataset.e) return editFilial(f);
    if (b.dataset.d && await IC.confirmBox(`«${f.nomi}» filialini o'chirasizmi?`)) {
      try { await IC.api('DELETE', '/filiallar/' + f.id); await loadFilials(); IC.toast("O'chirildi"); }
      catch (x) { IC.toast(x.message, true); }
    }
  };

  // ── Adminlar ──
  function renderAdmins() {
    $('cnt').textContent = admins.length ? `(${admins.length})` : '';
    $('empty').classList.toggle('hidden', admins.length > 0);
    $('rows').innerHTML = admins.map(a => `<tr>
      <td data-l=""><b>${esc((a.familiya + ' ' + a.ism).trim())}</b></td>
      <td data-l="Filial">${esc(a.filial_nomi)}</td>
      <td data-l="Telefon">${esc(a.telefon) || '—'}</td>
      <td data-l="Login">${a.login ? `<code>${esc(a.login)}</code>` : '<span class="badge warn">Login yo\'q</span>'}</td>
      <td data-l="Holat"><span class="badge ${a.faol ? 'ok' : 'off'}">${a.faol ? 'Faol' : 'Nofaol'}</span></td>
      <td class="muted" data-l="Oxirgi kirish">${dt(a.oxirgi_kirish)}</td>
      <td class="act"><button class="btn sm" data-e="${a.id}">Tahrirlash</button> <button class="btn sm dng" data-d="${a.id}">O'chirish</button></td></tr>`).join('');
  }
  async function loadAdmins() { admins = (await IC.api('GET', '/kurs-adminlar')).adminlar; renderAdmins(); }

  function editAdmin(a) {
    if (!filials.length) { IC.toast("Avval filial yarating", true); return; }
    IC.formModal({
      title: a ? 'Adminni tahrirlash' : 'Yangi admin',
      fields: [
        { k: 'filial_id', label: 'Filial', type: 'select', req: true, full: true, placeholder: '— Filialni tanlang —',
          options: filials.filter(f => f.faol || (a && a.filial_id === f.id)).map(f => ({ v: f.id, t: f.nomi })) },
        { k: 'familiya', label: 'Familiya', req: true }, { k: 'ism', label: 'Ism', req: true },
        { k: 'telefon', label: 'Telefon', type: 'tel' },
        { k: 'login', label: 'Login', req: true, autocomplete: 'off' },
        // Yangi adminda parol majburiy; tahrirlashda — faqat parolsiz (eski) adminda. Aks holda bo'sh = o'zgarmaydi.
        { k: 'parol', label: a && a.parol_bor ? "Yangi parol (o'zgartirish uchun)" : 'Parol (kamida 8 belgi)', type: 'password', autocomplete: 'new-password', req: !a || !a.parol_bor },
        { k: 'faol', label: 'Faol (panelga kira oladi)', type: 'checkbox' },
      ],
      values: a ? { ...a, parol: '' } : { faol: true, filial_id: filials.length === 1 ? filials[0].id : '' },
      onSubmit: async v => {
        a ? await IC.api('PUT', '/kurs-adminlar/' + a.id, v) : await IC.api('POST', '/kurs-adminlar', v);
        await Promise.all([loadAdmins(), loadFilials()]); IC.toast('Saqlandi');
      },
    });
  }
  $('add').onclick = () => editAdmin(null);
  $('rows').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.e) return editAdmin(admins.find(x => String(x.id) === b.dataset.e));
    if (b.dataset.d && await IC.confirmBox("Adminni o'chirasizmi?")) {
      try { await IC.api('DELETE', '/kurs-adminlar/' + b.dataset.d); await Promise.all([loadAdmins(), loadFilials()]); IC.toast("O'chirildi"); }
      catch (x) { IC.toast(x.message, true); }
    }
  };

  // ── Bo'limlar (rahbar: barcha filiallar bo'yicha jamlama, oyliklar, vakansiyalar, nomzodlar; filiallar va adminlar) ──
  const TABS = [['jamlama', '📊 Umumiy'], ['oyliklar', '💰 Oyliklar'], ['vakansiyalar', '💼 Vakansiyalar'], ['nomzodlar', '📨 Nomzodlar'], ['filiallar', '🏢 Filiallar va adminlar']];
  const nav = $('tabs'), rv = $('v-rahbar'), fv = $('v-filial');
  nav.innerHTML = TABS.map(([k, t]) => `<button class="tab" data-k="${k}" type="button">${t}</button>`).join('');
  function badge() { // yangi nomzodlar soni menyuda (filiallar ro'yxatidan)
    const n = filials.reduce((a, f) => a + (f.yangi_nomzodlar || 0), 0), b = nav.querySelector('[data-k="nomzodlar"]');
    if (!b) return; b.querySelector('.nb') && b.querySelector('.nb').remove();
    if (n > 0) b.insertAdjacentHTML('beforeend', ` <span class="badge warn nb" aria-label="${n} ta yangi">${n}</span>`);
  }
  let cur = '';
  async function go(k) {
    if (!TABS.some(t => t[0] === k)) k = 'jamlama';
    cur = k;
    nav.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    try { history.replaceState(null, '', '#' + k); } catch (_) {}
    const isF = k === 'filiallar';
    fv.classList.toggle('hidden', !isF); rv.classList.toggle('hidden', isF);
    if (isF) return;
    rv.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
    try { await RAHBAR[k](rv); } catch (x) { if (cur === k) rv.innerHTML = `<div class="empty">${esc(x.message)}</div>`; }
  }
  nav.onclick = e => { const b = e.target.closest('.tab'); if (b) go(b.dataset.k); };

  IC.filial.clear(); // superadmin sahifasida filial tanlanmagan; «Panelni ochish» tanlaydi
  Promise.all([loadFilials(), loadAdmins()]).then(badge).catch(x => IC.toast(x.message, true));
  go(location.hash.slice(1) || 'jamlama');
})();
