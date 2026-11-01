// Superadmin va admin bir xil sahifadan kiradi (login + parol); server rolni o'zi aniqlaydi.
(function () {
  const $ = id => document.getElementById(id);
  const dest = r => (r === 'superadmin' ? 'superadmin.html' : 'panel.html');

  // Allaqachon kirgan bo'lsa — o'z sahifasiga
  if (IC.session.token() && IC.session.role()) { location.replace(dest(IC.session.role())); return; }

  $('u').focus();
  $('f').onsubmit = async e => {
    e.preventDefault(); $('err').textContent = '';
    const username = $('u').value.trim(), parol = $('p').value;
    if (!username || !parol) { $('err').textContent = 'Login va parolni kiriting'; return; }
    $('go').disabled = true;
    try {
      const d = await IC.api('POST', '/auth/login', { username, parol });
      IC.session.save(d.token, d.role, d.ism); location.href = dest(d.role); return;
    } catch (x) { $('err').textContent = x.message; $('p').value = ''; $('p').focus(); }
    $('go').disabled = false;
  };
})();
