// Yuzni tanib davomat olish: kamera, yuzni ro'yxatga olish va guruh davomati skaneri.
// Barcha hisob-kitob BRAUZERDA (face-api, vendor/face-api/). Serverga faqat 128 raqamli yuz vektori ketadi — rasm saqlanmaydi.
// Ishlatilishi: YUZ.enroll(oquvchi, { onDone })  ·  YUZ.attendance(guruh, qatorlar, apply)
(function () {
  const esc = IC.esc, BASE = 'vendor/face-api/';
  const MATCH = 0.5;        // vektorlar orasidagi masofa shundan kichik bo'lsa — bir odam (kichik = qat'iyroq)
  const MIN_FACE = 90;      // ro'yxatga olishda yuzning eng kichik kengligi (piksel)
  const CONFIRM_HITS = 2;   // davomatda «tanildi» deyilishi uchun ketma-ket kadrlarda necha marta ko'rinishi kerak
  const SAMPLES = 3;        // bir o'quvchi uchun tavsiya etiladigan namunalar soni
  const full = o => `${o.familiya || ''} ${o.ism || ''}`.trim(); // FI: Familiya Ism
  const round = d => Array.from(d, n => Math.round(n * 1e5) / 1e5);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ── Kutubxona va modellar (bir marta, kerak bo'lganda yuklanadi) ──
  let libP = null;
  const loadScript = src => new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('face-api.js topilmadi'));
    document.head.appendChild(s);
  });
  function load() {
    if (!libP) libP = (async () => {
      if (!window.faceapi) await loadScript(BASE + 'face-api.js');
      const f = window.faceapi;
      await f.tf.ready();
      await Promise.all([f.nets.ssdMobilenetv1, f.nets.faceLandmark68Net, f.nets.faceRecognitionNet].map(n => n.loadFromUri(BASE + 'model')));
      return f;
    })().catch(e => { libP = null; throw new Error('Yuz tanish modelini yuklab bo\'lmadi (' + (e.message || e) + ')'); });
    return libP;
  }
  const detectAll = (f, src) => f.detectAllFaces(src, new f.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 40 })).withFaceLandmarks().withFaceDescriptors();

  // ── Kamera oynasi (video + ustidagi chizma) ──
  function cameraUI() {
    const box = document.createElement('div'); box.className = 'cam';
    box.innerHTML = '<video playsinline muted></video><canvas></canvas><div class="cam-msg"></div>';
    const video = box.querySelector('video'), canvas = box.querySelector('canvas'), msg = box.querySelector('.cam-msg');
    let stream = null, facing = 'environment', mirror = false;
    const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; };
    const api = {
      box, video, stop,
      say(t) { msg.textContent = t || ''; msg.classList.toggle('hidden', !t); },
      async start(want) {
        if (want) facing = want;
        stop();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
          throw new Error("Kamera ishlamaydi: sayt HTTPS orqali ochilgan bo'lishi va brauzer kamerani qo'llab-quvvatlashi kerak");
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        } catch (e) {
          throw new Error(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? "Kameraga ruxsat berilmagan. Brauzer sozlamalaridan ruxsat bering"
            : e.name === 'NotFoundError' || e.name === 'OverconstrainedError' ? 'Kamera topilmadi' : "Kamerani ochib bo'lmadi");
        }
        video.srcObject = stream;
        await video.play();
        if (!video.videoWidth) await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));
        // Old (selfi) kamera ko'zgudagidek ko'rsatiladi; orqa kamera — aks ettirilmaydi
        const fm = stream.getVideoTracks()[0].getSettings().facingMode;
        mirror = fm ? fm === 'user' : !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
        box.classList.toggle('mirror', mirror);
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        box.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
        box.style.width = `min(100%, calc(55vh * ${video.videoWidth / video.videoHeight}))`;
      },
      flip() { return api.start(facing === 'environment' ? 'user' : 'environment'); },
      // Joriy kadr (aks ettirilmagan) — tanish shu rasm ustida bajariladi
      snapshot() {
        const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
        c.getContext('2d').drawImage(video, 0, 0); return c;
      },
      // items: [{ box:{x,y,width,height}, label, ok }] — video koordinatalarida
      draw(items) {
        const c = canvas.getContext('2d'), W = canvas.width; c.clearRect(0, 0, W, canvas.height);
        const fs = Math.max(14, Math.round(W / 42));
        c.lineWidth = Math.max(2, W / 320); c.font = `600 ${fs}px sans-serif`; c.textBaseline = 'top';
        for (const it of items) {
          const b = it.box, x = mirror ? W - b.x - b.width : b.x, col = it.ok ? '#16a34a' : '#dc2626';
          c.strokeStyle = col; c.strokeRect(x, b.y, b.width, b.height);
          if (it.label) {
            const w = c.measureText(it.label).width + 10, y = Math.max(0, b.y - fs - 8);
            c.fillStyle = col; c.fillRect(x, y, w, fs + 8); c.fillStyle = '#fff'; c.fillText(it.label, x + 5, y + 4);
          }
        }
      },
    };
    return api;
  }
  // Yuz rasmidan kichik surat (ro'yxatda ko'rsatish uchun; serverga yuborilmaydi)
  function crop(src, b) {
    const pad = Math.round(b.width * 0.25), x = Math.max(0, Math.round(b.x - pad)), y = Math.max(0, Math.round(b.y - pad));
    const w = Math.min(src.width - x, Math.round(b.width + pad * 2)), h = Math.min(src.height - y, Math.round(b.height + pad * 2));
    const c = document.createElement('canvas'); c.width = 96; c.height = Math.max(1, Math.round(96 * h / w));
    c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  }
  function modal(html, onClose) {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = `<div class="card modal cam-modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(ov);
    const close = () => { if (ov.isConnected) { ov.remove(); if (onClose) onClose(); } };
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }); // tashqariga bosish bilan yopilmaydi: ish yo'qolmasin
    return { ov, $: q => ov.querySelector(q), close };
  }
  const CONSENT = `<div class="fld chk"><label><input type="checkbox" class="consent"> O'quvchi (yoki ota-onasi) yuzini tizimga kiritishga rozilik bergan</label></div>`;

  // ═══ Bitta o'quvchining yuzini ro'yxatga olish ═══════════════════════════════
  async function enroll(st, opt = {}) {
    const cam = cameraUI(), vecs = [], STEP = ["To'g'ri qarang", 'Boshingizni ozgina o\'ngga buring', 'Boshingizni ozgina chapga buring', 'Yana bitta (ixtiyoriy)', 'Yana bitta (ixtiyoriy)'];
    const m = modal(`<h3>Yuzni ro'yxatga olish</h3><p class="muted" style="margin:-8px 0 12px">${esc(full(st))}</p>
      <div id="cb"></div>
      <div class="cam-bar"><button class="btn" id="fl" type="button">🔄 Kamera</button><button class="btn pri" id="sn" type="button" disabled>📸 Rasmga olish</button></div>
      <div class="cam-step" id="stp"></div><div class="cam-thumbs" id="th"></div>
      ${st.yuz_soni ? `<div class="fld chk"><label><input type="checkbox" id="rep" checked> Eski namunalarni almashtirish (hozir ${st.yuz_soni} ta)</label></div>` : ''}
      ${CONSENT}<div class="err" role="alert"></div>
      <div class="mact">${st.yuz_soni ? '<button class="btn dng" id="del" type="button" style="margin-right:auto">Yuzni o\'chirish</button>' : ''}
        <button class="btn" id="x" type="button">Yopish</button><button class="btn pri" id="sv" type="button" disabled>Saqlash</button></div>`, cam.stop);
    const $ = m.$, err = t => { $('.err').textContent = t || ''; };
    $('#cb').appendChild(cam.box);
    const sync = () => {
      $('#stp').textContent = vecs.length >= SAMPLES ? `✅ ${vecs.length} ta namuna olindi` : `${vecs.length + 1}/${SAMPLES}: ${STEP[vecs.length]}`;
      $('#sv').disabled = vecs.length < 2;
    };
    sync();
    $('#x').onclick = m.close;
    $('#fl').onclick = async () => { err(); try { await cam.flip(); } catch (e) { err(e.message); } };
    let f = null;
    cam.say('Model yuklanmoqda…');
    try { [f] = await Promise.all([load(), cam.start('user')]); cam.say(''); $('#sn').disabled = false; } catch (e) { cam.say(''); err(e.message); }
    $('#sn').onclick = async () => {
      err(); const btn = $('#sn'); btn.disabled = true;
      try {
        const snap = cam.snapshot(), res = await detectAll(f, snap);
        if (!res.length) throw new Error("Yuz topilmadi. Yorug'roq joyda, kameraga qarab turing");
        if (res.length > 1) throw new Error("Kadrda faqat bitta yuz bo'lsin");
        const r = res[0];
        if (r.detection.box.width < MIN_FACE) throw new Error('Yuz juda kichik — kameraga yaqinroq keling');
        vecs.push(round(r.descriptor));
        $('#th').insertAdjacentHTML('beforeend', `<img alt="" src="${crop(snap, r.detection.box)}">`);
        sync();
      } catch (e) { err(e.message); }
      btn.disabled = vecs.length >= 5;
    };
    $('#sv').onclick = async () => {
      err();
      if (!$('.consent').checked) return err("Rozilik belgisini qo'ying");
      $('#sv').disabled = true;
      try {
        await IC.api('POST', `/oquvchilar/${st.id}/yuz`, { vektorlar: vecs, rozilik: true, almashtir: $('#rep') ? $('#rep').checked : false });
        IC.toast('Yuz saqlandi'); m.close(); if (opt.onDone) opt.onDone();
      } catch (e) { err(e.message); $('#sv').disabled = false; }
    };
    if ($('#del')) $('#del').onclick = async () => {
      if (!await IC.ask("Bu o'quvchining yuz ma'lumotlari butunlay o'chirilsinmi?", { yes: "O'chirish" })) return;
      try { await IC.api('DELETE', `/oquvchilar/${st.id}/yuz`); IC.toast("Yuz ma'lumotlari o'chirildi"); m.close(); if (opt.onDone) opt.onDone(); } catch (e) { err(e.message); }
    };
  }

  // ═══ Guruh davomati: kamera bilan tanish + yuzlarni o'rgatish ═════════════════
  // rows: [{ id, ism, familiya }] — davomat oynasidagi o'quvchilar; apply(Set<id>) — tanilganlarni «Keldi» qilish uchun
  async function attendance(g, rows, apply) {
    const cam = cameraUI(), confirmed = new Set(), ignored = new Set(), hits = new Map();
    let f = null, matcher = null, hasFace = new Set(), mode = 'live', running = false, stopped = false, found = [];
    const m = modal(`<h3>${esc(g.nomi)} — kamera bilan davomat</h3>
      <div class="subtabs" role="tablist"><button class="subtab on" data-m="live" type="button">Davomat</button><button class="subtab" data-m="train" type="button">Yuzlarni o'rgatish</button></div>
      <div id="cb"></div>
      <div class="cam-bar"><button class="btn" id="fl" type="button">🔄 Kamera</button><span class="muted" id="inf"></span></div>
      <div id="live"><div class="muted" style="font-size:13px;margin-bottom:6px">Tanilganlar: <b id="cnt">0</b> / ${rows.length}</div><div class="cam-rec" id="rec"></div></div>
      <div id="train" class="hidden">
        <p class="muted" style="font-size:13px;margin:0 0 8px">O'quvchilarni kadrga joylang va «Kadrni qotirish»ni bosing, so'ng har bir yuz uchun o'quvchini tanlang.</p>
        <button class="btn pri" id="sn" type="button">📸 Kadrni qotirish</button><div id="tl" class="cam-faces"></div>
        <div id="tc" class="hidden">${CONSENT}<button class="btn pri" id="ts" type="button">Tanlanganlarni saqlash</button></div></div>
      <div class="err" role="alert"></div>
      <div class="mact"><button class="btn" id="x" type="button">Yopish</button><button class="btn pri" id="ok" type="button">Tayyor</button></div>`, () => { stopped = true; cam.stop(); });
    const $ = m.$, err = t => { $('.err').textContent = t || ''; };
    $('#cb').appendChild(cam.box);
    const rowOf = id => rows.find(r => r.id === id);
    const info = () => {
      $('#inf').textContent = !matcher ? "Bu guruhda yuzi o'rgatilgan o'quvchi yo'q" : `Yuzi o'rgatilgan: ${rows.filter(r => hasFace.has(r.id)).length} / ${rows.length}`;
    };
    const renderRec = () => {
      $('#cnt').textContent = confirmed.size;
      $('#rec').innerHTML = [...confirmed].map(id => `<span class="cam-chip">✓ ${esc(full(rowOf(id)))} <button type="button" data-r="${id}" aria-label="Olib tashlash" title="Xato tanilgan bo'lsa, olib tashlang">×</button></span>`).join('')
        || '<span class="muted" style="font-size:13px">Hozircha hech kim tanilmadi — kamerani o\'quvchilarga qarating</span>';
    };
    async function loadFaces() {
      const d = await IC.api('GET', `/guruhlar/${g.id}/yuzlar`);
      hasFace = new Set(d.items.map(x => x.oquvchi_id));
      matcher = d.items.length ? new f.FaceMatcher(d.items.map(x => new f.LabeledFaceDescriptors(String(x.oquvchi_id), x.vektorlar.map(v => new Float32Array(v)))), MATCH) : null;
      info();
    }
    async function loop() {
      if (running) return; running = true;
      while (!stopped && mode === 'live') {
        try {
          const res = await detectAll(f, cam.video);
          if (stopped || mode !== 'live') break;
          cam.draw(res.map(r => {
            const b = matcher ? matcher.findBestMatch(r.descriptor) : null, id = b && b.label !== 'unknown' ? Number(b.label) : 0, row = id && rowOf(id);
            if (row && !ignored.has(id)) { const n = (hits.get(id) || 0) + 1; hits.set(id, n); if (n >= CONFIRM_HITS && !confirmed.has(id)) { confirmed.add(id); renderRec(); } }
            return { box: r.detection.box, label: row ? full(row) : '?', ok: !!row };
          }));
        } catch (e) { await wait(500); }
        await wait(100);
      }
      running = false;
    }
    $('#x').onclick = m.close;
    $('#ok').onclick = () => { const n = confirmed.size; apply(new Set(confirmed)); m.close(); if (n) IC.toast(`${n} ta o'quvchi «Keldi» deb belgilandi. Saqlash tugmasini bosing`); };
    $('#fl').onclick = async () => { err(); try { await cam.flip(); } catch (e) { err(e.message); } };
    $('#rec').onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; const id = Number(b.dataset.r); confirmed.delete(id); ignored.add(id); hits.delete(id); renderRec(); };
    m.ov.querySelector('.subtabs').onclick = e => {
      const b = e.target.closest('.subtab'); if (!b || b.dataset.m === mode) return;
      mode = b.dataset.m; err();
      m.ov.querySelectorAll('.subtab').forEach(x => x.classList.toggle('on', x === b));
      $('#live').classList.toggle('hidden', mode !== 'live'); $('#train').classList.toggle('hidden', mode !== 'train');
      $('#ok').classList.toggle('hidden', mode !== 'live');
      if (mode === 'live') { cam.draw([]); loop(); } else cam.draw([]);
    };

    // — Yuzlarni o'rgatish: kadr qotiriladi, har bir yuz uchun o'quvchi tanlanadi
    $('#sn').onclick = async () => {
      err(); const btn = $('#sn'); btn.disabled = true; $('#tl').innerHTML = ''; $('#tc').classList.add('hidden');
      try {
        const snap = cam.snapshot(), res = await detectAll(f, snap);
        found = res.filter(r => r.detection.box.width >= MIN_FACE / 2).map(r => ({ vec: round(r.descriptor), img: crop(snap, r.detection.box), w: r.detection.box.width }));
        if (!found.length) throw new Error("Yuz topilmadi. O'quvchilarni yaqinroq, yorug'roq joyga joylang");
        const opts = [...rows].sort((a, b) => hasFace.has(a.id) - hasFace.has(b.id) || full(a).localeCompare(full(b)))
          .map(r => `<option value="${r.id}">${esc(full(r))}${hasFace.has(r.id) ? ' ✓' : ''}</option>`).join('');
        $('#tl').innerHTML = found.map((x, i) => `<div class="cam-face"><img alt="" src="${x.img}"><select data-i="${i}" aria-label="O'quvchi"><option value="">— o'quvchini tanlang —</option>${opts}</select>
          ${x.w < MIN_FACE ? '<small class="muted">yuz kichik, aniqlik past bo\'lishi mumkin</small>' : ''}</div>`).join('');
        $('#tc').classList.remove('hidden');
      } catch (e) { err(e.message); }
      btn.disabled = false;
    };
    $('#ts').onclick = async () => {
      err();
      const pick = [...$('#tl').querySelectorAll('select')].map(s => ({ i: Number(s.dataset.i), id: Number(s.value) })).filter(p => p.id);
      if (!pick.length) return err('Kamida bitta yuz uchun o\'quvchini tanlang');
      if (new Set(pick.map(p => p.id)).size !== pick.length) return err("Bitta o'quvchi ikki marta tanlangan");
      if (!$('#tc .consent').checked) return err("Rozilik belgisini qo'ying");
      const btn = $('#ts'); btn.disabled = true; let n = 0;
      try {
        for (const p of pick) { await IC.api('POST', `/oquvchilar/${p.id}/yuz`, { vektorlar: [found[p.i].vec], rozilik: true }); n++; }
        IC.toast(`${n} ta yuz saqlandi`);
        $('#tl').innerHTML = ''; $('#tc').classList.add('hidden'); await loadFaces();
      } catch (e) { err(`${n} ta saqlandi, keyin xato: ${e.message}`); await loadFaces().catch(() => {}); }
      btn.disabled = false;
    };

    cam.say('Model yuklanmoqda…'); renderRec();
    try { [f] = await Promise.all([load(), cam.start('environment')]); cam.say(''); await loadFaces(); }
    catch (e) { cam.say(''); err(e.message); return; }
    loop();
  }

  window.YUZ = { enroll, attendance };
})();
