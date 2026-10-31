// Umumiy yordamchilar: API, token, toast, modal, forma
(function () {
  const K = { t: 'ic_token', r: 'ic_role', n: 'ic_ism' };
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
    clear() { ls.del(K.t); ls.del(K.r); ls.del(K.n); },
  };
  // Telegram Mini App ichida ochilganmi (telegram-web-app.js yuklangan va imzolangan initData bor)
  const tgApp = () => { const t = window.Telegram && window.Telegram.WebApp; return t && t.initData ? t : null; };
  // «Chiqish»: Mini App ichida oynani yopadi (kirish sahifasi ko'rsatilmaydi); oddiy brauzerda superadmin kirish sahifasiga qaytaradi.
  function logout() {
    session.clear();
    const t = tgApp();
    if (t && typeof t.close === 'function') { try { t.close(); return; } catch (_) {} }
    location.href = 'index.html';
  }
  // Sessiya muddati tugadi / yaroqsiz: Mini App ichida jimgina qayta kiradi (miniapp.html), brauzerda kirish sahifasiga
  function relogin() { session.clear(); location.replace(tgApp() ? 'miniapp.html' : 'index.html'); }

  async function api(method, path, body) {
    const h = { 'Content-Type': 'application/json' };
    const t = session.token(); if (t) h.Authorization = 'Bearer ' + t;
    let r, d;
    try {
      r = await fetch('/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      d = await r.json();
    } catch (_) { throw new Error("Server bilan aloqa yo'q"); }
    if (r.status === 401 && d.expired && t) { relogin(); throw new Error('Sessiya tugadi'); }
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Xatolik');
    return d;
  }

  // Autentifikatsiyali fayl yuklab olish (Excel va h.k.)
  async function download(path, filename) {
    const t = session.token(); let r;
    try { r = await fetch('/api' + path, { headers: t ? { Authorization: 'Bearer ' + t } : {} }); }
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
  //   placeholder (select: birinchi bo'sh variant matni), dependsOn (select: boshqa select maydoni kaliti; options[].group shu qiymatga teng bo'lganlari ko'rinadi)}
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
      inp = `<input id="${id}" type="${f.type || 'text'}" value="${esc(v)}"${req}${ex}${f.inputmode ? ` inputmode="${f.inputmode}"` : ''}>`;
    }
    return `<div class="fld"><label for="${id}">${esc(f.label)}${f.req ? ' *' : ''}</label>${inp}</div>`;
  }
  function readForm(fields, root) {
    const o = {};
    fields.forEach(f => {
      const el = root.querySelector('#f_' + f.k);
      if (f.type === 'days') o[f.k] = [...el.querySelectorAll('input:checked')].map(i => Number(i.value));
      else o[f.k] = f.type === 'checkbox' ? el.checked : el.value.trim();
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

  window.IC = { api, esc, money, fdate, isoDay, session, logout, relogin, tgApp, download, toast, formModal, confirmBox, ask, header, requireRole };
})();
