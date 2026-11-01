// Umumiy yordamchilar: API, token, toast, modal, forma
(function () {
  const K = { t: 'ic_token', r: 'ic_role', n: 'ic_ism', f: 'ic_filial', fn: 'ic_filial_nomi' };
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
    del: k => { try { localStorage.removeItem(k); } catch (_) {} },
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => new Intl.NumberFormat('uz-UZ').format(Math.round(Number(n) || 0)) + " so'm";
  const fdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleDateString('ru-RU'); };
  const isoDay = d => (d ? String(d).slice(0, 10) : '');

  const session = {
    token: () => ls.get(K.t), role: () => ls.get(K.r), ism: () => ls.get(K.n),
    save(token, role, ism) { ls.set(K.t, token); ls.set(K.r, role); ls.set(K.n, ism || ''); },
    clear() { ls.del(K.t); ls.del(K.r); ls.del(K.n); filial.clear(); },
  };
  // Superadmin qaysi filial bilan ishlayotgani (har so'rovga X-Filial-Id bo'lib ketadi). Admin uchun kerak emas — server uni o'z filialiga bog'laydi.
  const filial = {
    id: () => ls.get(K.f), nomi: () => ls.get(K.fn),
    set(id, nomi) { ls.set(K.f, String(id)); ls.set(K.fn, nomi || ''); },
    clear() { ls.del(K.f); ls.del(K.fn); },
  };
  const filialHdr = () => (session.role() === 'superadmin' && filial.id() ? { 'X-Filial-Id': filial.id() } : {});
  // «Chiqish» va sessiya tugashi: sessiya tozalanadi va kirish sahifasiga qaytiladi
  function logout() { session.clear(); location.href = 'index.html'; }
  const relogin = logout;

  async function api(method, path, body) {
    const h = { 'Content-Type': 'application/json', ...filialHdr() };
    const t = session.token(); if (t) h.Authorization = 'Bearer ' + t;
    let r, d;
    try {
      r = await fetch('/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      d = await r.json();
    } catch (_) { throw new Error("Server bilan aloqa yo'q"); }
    if (r.status === 401 && d.expired && t) { relogin(); throw new Error('Sessiya tugadi'); }
    // Superadmin tanlagan filial o'chirilgan bo'lsa — filial tanlash sahifasiga qaytaramiz
    if (r.status === 404 && d.error === 'Filial topilmadi' && session.role() === 'superadmin') { filial.clear(); location.href = 'superadmin.html'; throw new Error(d.error); }
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Xatolik');
    return d;
  }

  // Autentifikatsiyali fayl yuklab olish (Excel va h.k.)
  async function download(path, filename) {
    const t = session.token(); let r;
    try { r = await fetch('/api' + path, { headers: { ...filialHdr(), ...(t ? { Authorization: 'Bearer ' + t } : {}) } }); }
    catch (_) { throw new Error("Server bilan aloqa yo'q"); }
    if (!r.ok) {
      let m = 'Xatolik'; try { m = (await r.json()).error || m; } catch (_) {}
      if (r.status === 401) relogin();
      throw new Error(m);
    }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  let tt;
  function toast(msg, bad) {
    document.querySelectorAll('.toast').forEach(e => e.remove());
    const el = document.createElement('div');
    el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg; el.setAttribute('role', 'status');
    document.body.appendChild(el); clearTimeout(tt); tt = setTimeout(() => el.remove(), 3200);
  }

  // Forma maydonlari: {k, label, type: text|number|tel|date|select|textarea|checkbox|days, req, options:[{v,t}], full,
  //   autocomplete (input), placeholder (select: birinchi bo'sh variant matni), dependsOn (select: boshqa select maydoni kaliti; options[].group shu qiymatga teng bo'lganlari ko'rinadi)}
  const DAYS = [['Du', 'Dushanba'], ['Se', 'Seshanba'], ['Chor', 'Chorshanba'], ['Pay', 'Payshanba'], ['Ju', 'Juma'], ['Sha', 'Shanba'], ['Yak', 'Yakshanba']];
  function fieldHTML(f, val) {
    const id = 'f_' + f.k, v = val == null ? '' : val, req = f.req ? ' required' : '';
    let inp;
    if (f.type === 'days') { // dars kunlari: Du…Yak (qiymatlar 1…7)
      const on = new Set((Array.isArray(val) ? val : []).map(Number));
      return `<div class="fld"><label id="l_${id}">${esc(f.label)}</label><div class="days" id="${id}" role="group" aria-labelledby="l_${id}">` +
        DAYS.map(([short, long], i) => `<label class="day" title="${long}"><input type="checkbox" value="${i + 1}"${on.has(i + 1) ? ' checked' : ''} aria-label="${long}"><span>${short}</span></label>`).join('') + '</div></div>';
    }
    if (f.type === 'select') {
      inp = `<select id="${id}"${req}>${f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : f.req ? '' : '<option value="">—</option>'}` +
        f.options.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(v) ? ' selected' : ''}>${esc(o.t)}</option>`).join('') + '</select>';
    } else if (f.type === 'textarea') {
      inp = `<textarea id="${id}"${req}>${esc(v)}</textarea>`;
    } else if (f.type === 'checkbox') {
      return `<div class="fld chk"><label><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${esc(f.label)}</label></div>`;
    } else {
      const ex = f.type === 'number' ? ' min="0" step="any"' : '';
      inp = `<input id="${id}" type="${f.type || 'text'}" value="${esc(v)}"${req}${ex}${f.inputmode ? ` inputmode="${f.inputmode}"` : ''}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''}>`;
    }
    return `<div class="fld"><label for="${id}">${esc(f.label)}${f.req ? ' *' : ''}</label>${inp}</div>`;
  }
  function readForm(fields, root) {
    const o = {};
    fields.forEach(f => {
      const el = root.querySelector('#f_' + f.k);
      if (f.type === 'days') o[f.k] = [...el.querySelectorAll('input:checked')].map(i => Number(i.value));
      else o[f.k] = f.type === 'checkbox' ? el.checked : f.type === 'password' ? el.value : el.value.trim(); // parol bo'sh joylari saqlanadi
    });
    return o;
  }

  // Modal: forma ko'rsatadi, onSubmit(values) xato tashlasa shu yerda ko'rsatiladi
  function formModal({ title, fields, values = {}, submitText = 'Saqlash', onSubmit }) {
    const ov = document.createElement('div'); ov.className = 'ov';
    const two = fields.length > 3;
    ov.innerHTML = `<form class="card modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" novalidate>
      <h3>${esc(title)}</h3>
      <div class="${two ? 'grid2' : ''}">${fields.map(f => (f.full && two ? '</div>' + fieldHTML(f, values[f.k]) + '<div class="grid2">' : fieldHTML(f, values[f.k]))).join('')}</div>
      <div class="err" role="alert"></div>
      <div class="mact"><button type="button" class="btn" data-x>Bekor qilish</button><button class="btn pri">${esc(submitText)}</button></div></form>`;
    document.body.appendChild(ov);
    const form = ov.firstElementChild, err = form.querySelector('.err'), close = () => ov.remove();
    form.querySelector('[data-x]').onclick = close;
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    // Bog'liq select: boshqa maydon (masalan, Fan) tanlanganda faqat unga tegishli variantlar ko'rinadi
    fields.filter(f => f.type === 'select' && f.dependsOn).forEach(f => {
      const dep = form.querySelector('#f_' + f.dependsOn), sel = form.querySelector('#f_' + f.k);
      if (!dep || !sel) return;
      const apply = () => {
        const keep = sel.value, list = f.options.filter(o => dep.value && String(o.group) === String(dep.value));
        sel.innerHTML = `<option value="">${esc(!dep.value ? (f.noDepText || '— avval tanlang —') : list.length ? '—' : (f.emptyText || '— variant yo\'q —'))}</option>` +
          list.map(o => `<option value="${esc(o.v)}"${String(o.v) === keep ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
      };
      dep.addEventListener('change', apply); apply();
    });
    const first = form.querySelector('input,select,textarea'); if (first) first.focus();
    form.onsubmit = async e => {
      e.preventDefault(); err.textContent = '';
      for (const f of fields) {
        const el = form.querySelector('#f_' + f.k);
        if (f.req && f.type !== 'checkbox' && f.type !== 'days' && !el.value.trim()) { err.textContent = `«${f.label}» majburiy`; el.focus(); return; }
      }
      const btn = form.querySelector('.pri'); btn.disabled = true;
      try { await onSubmit(readForm(fields, form)); close(); }
      catch (x) { err.textContent = x.message; btn.disabled = false; }
    };
    return { close, el: ov };
  }

  function confirmBox(text) { return Promise.resolve(window.confirm(text)); }

  // Tasdiqlash oynasi («Ha» / «Bekor qilish» tugmalari). true — Ha; false — Bekor qilish, Esc yoki tashqariga bosish.
  function ask(text, { yes = 'Ha', no = 'Bekor qilish' } = {}) {
    return new Promise(resolve => {
      const prev = document.activeElement;
      const ov = document.createElement('div'); ov.className = 'ov';
      ov.innerHTML = `<div class="card modal confirm" role="alertdialog" aria-modal="true" aria-label="${esc(text)}">
        <h3>${esc(text)}</h3>
        <div class="mact"><button type="button" class="btn" data-n>${esc(no)}</button><button type="button" class="btn pri" data-y>${esc(yes)}</button></div></div>`;
      document.body.appendChild(ov);
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } };
      const done = v => {
        document.removeEventListener('keydown', onKey, true); ov.remove();
        if (prev && prev.focus) { try { prev.focus(); } catch (_) {} }
        resolve(v);
      };
      document.addEventListener('keydown', onKey, true);
      ov.querySelector('[data-y]').onclick = () => done(true);
      ov.querySelector('[data-n]').onclick = () => done(false);
      ov.addEventListener('mousedown', e => { if (e.target === ov) done(false); });
      ov.querySelector('[data-n]').focus(); // tasodifan Enter bosilsa, o'chirilmasin
    });
  }

  function header(roleLabel) {
    document.getElementById('whoami').textContent = (session.ism() || '') + (roleLabel ? ' · ' + roleLabel : '');
    document.getElementById('logout').onclick = logout;
  }
  function requireRole(roles) {
    if (!session.token() || !roles.includes(session.role())) { relogin(); return false; }
    return true;
  }

  // Mobil: hamburger menyu (≤768px). Tugma #burger, menyu #tabs. Bo'lim tanlansa, tashqariga bosilsa yoki Esc bosilsa yopiladi.
  function initBurger() {
    const b = document.getElementById('burger'), nav = document.getElementById('tabs');
    if (!b || !nav) return;
    const set = open => { nav.classList.toggle('open', open); b.classList.toggle('on', open); b.setAttribute('aria-expanded', String(open)); };
    b.addEventListener('click', e => { e.stopPropagation(); set(!nav.classList.contains('open')); });
    nav.addEventListener('click', e => { if (e.target.closest('.tab')) set(false); });
    document.addEventListener('click', e => { if (!nav.contains(e.target) && !b.contains(e.target)) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && nav.classList.contains('open')) { set(false); b.focus(); } });
    const mq = window.matchMedia('(min-width: 769px)');
    const reset = e => { if (e.matches) set(false); };
    if (mq.addEventListener) mq.addEventListener('change', reset); else if (mq.addListener) mq.addListener(reset);
  }
  initBurger();

  window.IC = { api, esc, money, fdate, isoDay, session, filial, logout, relogin, download, toast, formModal, confirmBox, ask, header, requireRole };
})();

// Matn kiritiladigan har qanday maydonda (qidiruv, forma, jadval ichidagi tahrir) yozish boshlanishi bilan o'ng chekada ✕ chiqadi;
// bosilsa butun matn o'chadi. Maydonlar dinamik yaratilgani uchun bitta umumiy tugma fokusdagi maydon ustiga qo'yiladi (DOM o'zgarmaydi).
// Maydonni istisno qilish: data-noclr atributi. Parol va sana maydonlarida chiqmaydi (brauzerning o'z tugmalari bor).
(function () {
  const TYPES = new Set(['', 'text', 'search', 'tel', 'email', 'url', 'number']);
  let btn = null, target = null;
  const eligible = el => !!el && el.nodeType === 1 && !el.disabled && !el.readOnly && !el.hasAttribute('data-noclr') &&
    (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TYPES.has((el.getAttribute('type') || '').toLowerCase())));

  function hide() {
    if (btn) btn.classList.add('hidden');
    if (target) target.classList.remove('has-clr');
  }
  function place() {
    if (!btn || !target || !document.contains(target) || document.activeElement !== target || !target.value) return hide();
    const r = target.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return hide();
    btn.classList.remove('hidden'); target.classList.add('has-clr');
    const s = btn.offsetWidth, num = (target.getAttribute('type') || '').toLowerCase() === 'number';
    btn.style.left = Math.round(r.right - s - 6 - (num ? 18 : 0)) + 'px'; // number maydonida brauzer strelkalari bor
    btn.style.top = Math.round(target.tagName === 'TEXTAREA' ? r.top + 6 : r.top + (r.height - s) / 2) + 'px';
  }
  function make() {
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'clr-x hidden'; btn.textContent = '✕'; btn.tabIndex = -1;
    btn.title = 'Tozalash'; btn.setAttribute('aria-label', 'Matnni tozalash');
    // mousedown: maydon fokusni yo'qotmasin va jadvaldagi tahrir (document mousedown) yopilib ketmasin
    btn.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (!target) return;
      target.value = '';
      target.dispatchEvent(new Event('input', { bubbles: true })); // oninput (qidiruv va h.k.) qayta ishlasin
      target.focus(); place();
    });
    document.body.appendChild(btn);
  }
  document.addEventListener('focusin', e => {
    if (!eligible(e.target)) { hide(); target = null; return; }
    if (!btn) make();
    if (target && target !== e.target) hide();
    target = e.target; place();
  });
  document.addEventListener('focusout', () => setTimeout(() => { if (document.activeElement !== target) { hide(); } }, 0));
  document.addEventListener('input', e => { if (e.target === target) place(); });
  window.addEventListener('scroll', () => { if (target) place(); }, true);
  window.addEventListener('resize', () => { if (target) place(); });
})();
