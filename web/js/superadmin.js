(function () {
  if (!IC.requireRole(['superadmin'])) return;
  IC.header('Superadmin');
  const $ = id => document.getElementById(id), esc = IC.esc;
  let list = [];

  const F = [
    { k: 'familiya', label: 'Familiya', req: true }, { k: 'ism', label: 'Ism', req: true },
    { k: 'telefon', label: 'Telefon', type: 'tel' },
    { k: 'login', label: 'Login', req: true, autocomplete: 'off' },
    { k: 'parol', label: 'Parol', type: 'password', autocomplete: 'new-password' }, // yangi adminda majburiy (server tekshiradi)
    { k: 'faol', label: 'Faol (panelga kira oladi)', type: 'checkbox' },
  ];

  async function stats() {
    const s = (await IC.api('GET', '/stats')).stats;
    const items = [['Fanlar', s.fanlar], ['Faol guruhlar', s.guruhlar], ["O'quvchilar", s.oquvchilar], ["O'qituvchilar", s.oqituvchilar],
      ['Adminlar', s.kurs_adminlar], ['Shu oy tushum', IC.money(s.oy_tushum)], ['Jami tushum', IC.money(s.jami_tushum)]];
    $('stats').innerHTML = items.map(([l, v]) => `<div class="card stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  }

  function render() {
    $('cnt').textContent = list.length ? `(${list.length})` : '';
    $('empty').classList.toggle('hidden', list.length > 0);
    $('rows').innerHTML = list.map(a => `<tr>
      <td data-l=""><b>${esc((a.familiya + ' ' + a.ism).trim())}</b></td>
      <td data-l="Telefon">${esc(a.telefon) || '—'}</td><td data-l="Login">${a.login ? `<code>${esc(a.login)}</code>` : '<span class="badge warn">Login yo\'q</span>'}</td>
      <td data-l="Holat"><span class="badge ${a.faol ? 'ok' : 'off'}">${a.faol ? 'Faol' : 'Nofaol'}</span></td>
      <td class="muted" data-l="Oxirgi kirish">${a.oxirgi_kirish ? new Date(a.oxirgi_kirish).toLocaleString('ru-RU') : '—'}</td>
      <td class="act"><button class="btn sm" data-e="${a.id}">Tahrirlash</button> <button class="btn sm dng" data-d="${a.id}">O'chirish</button></td></tr>`).join('');
  }
  async function load() { list = (await IC.api('GET', '/kurs-adminlar')).adminlar; render(); }

  function edit(a) {
    IC.formModal({
      title: a ? 'Adminni tahrirlash' : 'Yangi admin',
      // Yangi adminda parol majburiy; tahrirlashda — faqat parolsiz (eski) adminda. Aks holda bo'sh = o'zgarmaydi.
      fields: F.map(f => f.k === 'parol' ? { ...f, label: a && a.parol_bor ? "Yangi parol (o'zgartirish uchun)" : 'Parol (kamida 8 belgi)', req: !a || !a.parol_bor } : f),
      values: a ? { ...a, parol: '' } : { faol: true },
      onSubmit: async v => {
        a ? await IC.api('PUT', '/kurs-adminlar/' + a.id, v) : await IC.api('POST', '/kurs-adminlar', v);
        await load(); stats().catch(() => {}); IC.toast('Saqlandi');
      },
    });
  }
  $('add').onclick = () => edit(null);
  $('rows').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.e) return edit(list.find(x => String(x.id) === b.dataset.e));
    if (b.dataset.d && await IC.confirmBox("Adminni o'chirasizmi?")) {
      try { await IC.api('DELETE', '/kurs-adminlar/' + b.dataset.d); await load(); stats(); IC.toast("O'chirildi"); }
      catch (x) { IC.toast(x.message, true); }
    }
  };
  Promise.all([load(), stats()]).catch(x => IC.toast(x.message, true));
})();
