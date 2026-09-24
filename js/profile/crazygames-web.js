// ── CrazyGames accounts on the official web (+ email-change links) ──────────
// Two things for players whose account was created by the CrazyGames build
// (profiles.crazygames_user_id, internal cg_…@crazygames.mygeochallenge.internal
// email — see supabase/functions/crazygames-auth):
//
// 1) One-click login from the CrazyGames build: its "Go to the web" button
//    opens /play/?handoff=<single-use code>. We show "Log in as <username>"
//    and, on click, exchange the code (login-handoff Edge Function) for a
//    session, then reload so sb.js adopts it like any saved session. Founder
//    is granted on that first web login (grant_founder_on_web, js/sb.js).
//
// 2) Real email capture: those accounts have no real email to recover their
//    password with. While the account is still on the internal address, a
//    popup asks for one and verifies it with a 6-digit code (account-email
//    Edge Function); "Later" postpones it to the next session.
//
// 3) Email-change links (?email_token=, any account) and 4) the one-time
//    "keep or change your CrazyGames name" choice on the first web login.
//
// All popups reuse #account-modal's look (.account-modal/.account-modal-box,
// same container) and the menu click sound.
(function () {
  const FN_BASE = 'https://xituwurshmaqsnnnrdhx.supabase.co/functions/v1/';
  const INTERNAL_DOMAIN = '@crazygames.mygeochallenge.internal';

  const TEXT = {
    es: {
      handoffTitle: 'Iniciar sesión',
      handoffDesc: 'Vienes de CrazyGames. Inicia sesión en la web con tu cuenta:',
      handoffBtn: 'Iniciar sesión', handoffWorking: 'Iniciando sesión...',
      handoffExpired: 'Este enlace ya se usó o venció. Inicia sesión con tu usuario y contraseña.',
      handoffFail: 'No se pudo iniciar sesión. Intenta de nuevo.',
      emailTitle: 'Agrega tu correo',
      emailDesc: 'Tu cuenta viene de CrazyGames y todavía no tiene correo. Agrégalo para poder recuperar tu contraseña si la olvidas.',
      emailLabel: 'Correo electrónico', emailSend: 'Enviar código', sending: 'Enviando...',
      later: 'Más tarde',
      codeTitle: 'Revisa tu correo',
      codeDesc: 'Te enviamos un código de 6 dígitos a {email}.',
      codeLabel: 'Código', codeConfirm: 'Confirmar', confirming: 'Confirmando...',
      codeBack: 'Cambiar correo',
      okTitle: '¡Correo guardado!',
      okDesc: 'Ya puedes recuperar tu contraseña con {email} si la olvidas.',
      okBtn: 'Entendido',
      err_invalid_email: 'Correo no válido.',
      err_email_taken: 'Ese correo ya está en uso por otra cuenta.',
      err_too_soon: 'Espera un minuto antes de pedir otro código.',
      err_send_failed: 'No se pudo enviar el correo. Intenta de nuevo.',
      err_wrong_code: 'Código incorrecto.',
      err_expired: 'El código venció. Pide uno nuevo.',
      err_too_many_attempts: 'Demasiados intentos. Pide un código nuevo.',
      err_generic: 'Algo salió mal. Intenta de nuevo.',
      nameTitle: '¿Quieres mantener tu nombre?',
      nameDesc: 'Tu nombre en myGeoChallenge es {name}, el de tu cuenta de CrazyGames. Puedes mantenerlo o elegir otro.',
      nameKeep: 'Mantener nombre', nameChange: 'Cambiar nombre',
      nameNewTitle: 'Elige tu nuevo nombre', nameLabel: 'Nuevo nombre (4 a 12 letras o números)',
      nameSave: 'Guardar nombre', nameSaving: 'Guardando...', nameBack: 'Volver',
      name_invalid: 'Usa de 4 a 12 letras o números, sin espacios.',
      name_taken: 'Ese nombre ya está en uso.', name_bad: 'Ese nombre no está permitido.',
      name_cooldown: 'Ya cambiaste tu nombre hace poco; podrás volver a cambiarlo en 30 días.',
      changedTitle: '¡Correo actualizado!',
      changedDesc: 'Tu correo ahora es {email}.',
      changedFail: 'Este enlace ya se usó o venció. Vuelve a pedir el cambio de correo.',
      changedTaken: 'Ese correo ya está en uso por otra cuenta.',
    },
    en: {
      handoffTitle: 'Log in',
      handoffDesc: "You're coming from CrazyGames. Log in on the web with your account:",
      handoffBtn: 'Log in', handoffWorking: 'Logging in...',
      handoffExpired: 'This link was already used or expired. Log in with your username and password.',
      handoffFail: "Couldn't log in. Please try again.",
      emailTitle: 'Add your email',
      emailDesc: 'Your account comes from CrazyGames and has no email yet. Add one so you can recover your password if you forget it.',
      emailLabel: 'Email', emailSend: 'Send code', sending: 'Sending...',
      later: 'Later',
      codeTitle: 'Check your email',
      codeDesc: 'We sent a 6-digit code to {email}.',
      codeLabel: 'Code', codeConfirm: 'Confirm', confirming: 'Confirming...',
      codeBack: 'Change email',
      okTitle: 'Email saved!',
      okDesc: 'You can now recover your password with {email} if you forget it.',
      okBtn: 'Got it',
      err_invalid_email: 'Invalid email.',
      err_email_taken: 'That email is already used by another account.',
      err_too_soon: 'Wait a minute before asking for another code.',
      err_send_failed: "Couldn't send the email. Please try again.",
      err_wrong_code: 'Wrong code.',
      err_expired: 'The code expired. Ask for a new one.',
      err_too_many_attempts: 'Too many attempts. Ask for a new code.',
      err_generic: 'Something went wrong. Please try again.',
      nameTitle: 'Keep your name?',
      nameDesc: 'Your myGeoChallenge name is {name}, the one from your CrazyGames account. You can keep it or pick another.',
      nameKeep: 'Keep name', nameChange: 'Change name',
      nameNewTitle: 'Pick your new name', nameLabel: 'New name (4 to 12 letters or digits)',
      nameSave: 'Save name', nameSaving: 'Saving...', nameBack: 'Back',
      name_invalid: 'Use 4 to 12 letters or digits, no spaces.',
      name_taken: 'That name is already taken.', name_bad: "That name isn't allowed.",
      name_cooldown: 'You changed your name recently; you can change it again in 30 days.',
      changedTitle: 'Email updated!',
      changedDesc: 'Your email is now {email}.',
      changedFail: 'This link was already used or expired. Request the email change again.',
      changedTaken: 'That email is already used by another account.',
    },
  };
  function tx(key) {
    const lang = (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'es';
    return TEXT[lang][key] || TEXT.es[key] || '';
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function click() { try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {} }

  // Builds an .account-modal next to #account-modal (same container, so the
  // cqmin sizing and stacking match the rest of the account popups).
  function makeModal(id, inner) {
    const modal = document.createElement('div');
    modal.className = 'account-modal';
    modal.id = id;
    modal.innerHTML = '<div class="account-modal-box">' + inner + '</div>';
    const ref = document.getElementById('account-modal');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(modal, ref);
    else document.body.appendChild(modal);
    return modal;
  }
  function popIn(modal) {
    const box = modal.querySelector('.account-modal-box');
    if (box) { box.style.animation = 'none'; box.offsetWidth; box.style.animation = ''; }
  }
  function busy(btn, on, label) {
    btn.classList.toggle('disabled', on);
    btn.textContent = label;
  }

  // ── 1) Login handoff ──────────────────────────────────────────────────────
  async function callHandoff(action, code) {
    const res = await fetch(FN_BASE + 'login-handoff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, code }),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  async function initHandoff() {
    let code = null;
    try { code = new URLSearchParams(location.search).get('handoff'); } catch (e) {}
    if (!code) return;
    // Drop the code from the address bar/history right away.
    try {
      const u = new URL(location.href);
      u.searchParams.delete('handoff');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}

    const modal = makeModal('cg-handoff-modal',
      '<button class="account-modal-close" type="button" data-act="close">✕</button>' +
      '<div class="account-view">' +
      '  <span class="account-modal-title" data-t="title" style="text-align:center"></span>' +
      '  <p class="account-modal-desc" data-t="desc"></p>' +
      '  <span class="account-modal-title" data-t="user" style="font-size:3.2cqmin"></span>' +
      '  <span class="account-error" data-t="err"></span>' +
      '  <button class="account-modal-opt account-modal-login" type="button" data-act="login"></button>' +
      '</div>');
    const q = (sel) => modal.querySelector(sel);
    q('[data-t="title"]').textContent = tx('handoffTitle');
    q('[data-t="desc"]').textContent = tx('handoffDesc');
    const loginBtn = q('[data-act="login"]');
    busy(loginBtn, true, tx('handoffBtn'));
    q('[data-act="close"]').addEventListener('click', () => { click(); modal.classList.remove('open'); });
    modal.classList.add('open');
    popIn(modal);

    const peek = await callHandoff('peek', code).catch(() => ({ ok: false, data: {} }));
    if (!peek.ok || !peek.data.username) {
      q('[data-t="err"]').textContent = tx('handoffExpired');
      loginBtn.style.display = 'none';
      return;
    }
    q('[data-t="user"]').textContent = peek.data.username;
    busy(loginBtn, false, tx('handoffBtn'));
    loginBtn.addEventListener('click', async () => {
      click();
      q('[data-t="err"]').textContent = '';
      busy(loginBtn, true, tx('handoffWorking'));
      try {
        const r = await callHandoff('redeem', code);
        if (!r.ok || !r.data.tokenHash) {
          q('[data-t="err"]').textContent = tx(r.data.error === 'expired_or_used' ? 'handoffExpired' : 'handoffFail');
          busy(loginBtn, false, tx('handoffBtn'));
          return;
        }
        const { error } = await window.sb.auth.verifyOtp({ token_hash: r.data.tokenHash, type: 'magiclink' });
        if (error) throw error;
        // sb.js adopts a saved session on load (and grants founder there).
        // Store the name first: on a fresh browser the first-run name prompt
        // (profile-account.js) would otherwise ask for one before the
        // session loads.
        try { localStorage.setItem('playerName', peek.data.username); } catch (e) {}
        location.reload();
      } catch (e) {
        console.warn('[crazygames-web] handoff failed:', e);
        q('[data-t="err"]').textContent = tx('handoffFail');
        busy(loginBtn, false, tx('handoffBtn'));
      }
    });
  }

  // ── 2) Email capture ──────────────────────────────────────────────────────
  let emailPrompted = false;

  // Nothing else up (founder/top-1/welcome popups, account modals, a game).
  function menuIsClear() {
    const loading = document.getElementById('loading-screen');
    if (!loading || getComputedStyle(loading).display === 'none') return false;
    if (document.querySelector('.account-modal.open')) return false;
    for (const id of ['founder-popup', 'top1-popup', 'top1-lost-popup']) {
      const el = document.getElementById(id);
      if (el && getComputedStyle(el).display !== 'none') return false;
    }
    if (document.querySelector('#welcome-popup.visible')) return false;
    return true;
  }

  async function callEmail(payload) {
    const { data } = await window.sb.auth.getSession();
    const token = data?.session?.access_token;
    const res = await fetch(FN_BASE + 'account-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }
  function errText(code) { return tx('err_' + code) || tx('err_generic'); }

  async function maybeAskEmail() {
    // Emails aren't in profiles anymore (they were public): read our own from
    // the session.
    let email = '';
    try { email = (await window.sb.auth.getUser()).data?.user?.email || ''; } catch (e) {}
    if (emailPrompted || !window._sbProfile?.crazygames_user_id || !email.endsWith(INTERNAL_DOMAIN)) return;
    emailPrompted = true;
    // Let the founder popup (800ms after login) and friends go first.
    await new Promise((r) => setTimeout(r, 2500));
    for (let i = 0; i < 240 && !menuIsClear(); i++) await new Promise((r) => setTimeout(r, 500));
    if (!menuIsClear()) return;

    const modal = makeModal('cg-email-modal',
      '<button class="account-modal-close" type="button" data-act="close">✕</button>' +
      '<div class="account-view" data-v="email">' +
      '  <span class="account-modal-title" data-t="emailTitle" style="text-align:center"></span>' +
      '  <p class="account-modal-desc" data-t="emailDesc"></p>' +
      '  <div class="account-form">' +
      '    <label class="account-label" data-t="emailLabel"></label>' +
      '    <input class="account-input" type="email" data-i="email" maxlength="254" autocomplete="email" placeholder="tu@correo.com">' +
      '    <span class="account-error" data-e="email"></span>' +
      '    <button class="account-modal-opt account-modal-login" type="button" data-act="send"></button>' +
      '  </div>' +
      '  <button class="account-modal-back" type="button" data-act="later"></button>' +
      '</div>' +
      '<div class="account-view" data-v="code" style="display:none">' +
      '  <span class="account-modal-title" data-t="codeTitle" style="text-align:center"></span>' +
      '  <p class="account-modal-desc" data-t="codeDesc"></p>' +
      '  <div class="account-form">' +
      '    <label class="account-label" data-t="codeLabel"></label>' +
      '    <input class="account-input" type="text" inputmode="numeric" data-i="code" maxlength="6" autocomplete="one-time-code" placeholder="123456">' +
      '    <span class="account-error" data-e="code"></span>' +
      '    <button class="account-modal-opt account-modal-login" type="button" data-act="confirm"></button>' +
      '  </div>' +
      '  <button class="account-modal-back" type="button" data-act="back"></button>' +
      '</div>' +
      '<div class="account-view" data-v="ok" style="display:none">' +
      '  <span class="account-modal-title" data-t="okTitle" style="text-align:center"></span>' +
      '  <div class="account-ok-icon">✅</div>' +
      '  <p class="account-modal-desc" data-t="okDesc"></p>' +
      '  <button class="account-modal-opt account-modal-login" type="button" data-act="ok"></button>' +
      '</div>');
    const q = (sel) => modal.querySelector(sel);
    const emailIn = q('[data-i="email"]'), codeIn = q('[data-i="code"]');
    const sendBtn = q('[data-act="send"]'), confirmBtn = q('[data-act="confirm"]');
    let pendingEmail = '';

    function render() {
      ['emailTitle', 'emailDesc', 'emailLabel', 'codeTitle', 'codeLabel', 'okTitle'].forEach((k) => {
        q('[data-t="' + k + '"]').textContent = tx(k);
      });
      q('[data-t="codeDesc"]').innerHTML = esc(tx('codeDesc')).replace('{email}', '<b>' + esc(pendingEmail) + '</b>');
      q('[data-t="okDesc"]').innerHTML = esc(tx('okDesc')).replace('{email}', '<b>' + esc(pendingEmail) + '</b>');
      sendBtn.textContent = tx('emailSend');
      confirmBtn.textContent = tx('codeConfirm');
      q('[data-act="later"]').textContent = tx('later');
      q('[data-act="back"]').textContent = tx('codeBack');
      q('[data-act="ok"]').textContent = tx('okBtn');
    }
    function show(v) {
      modal.querySelectorAll('.account-view').forEach((el) => { el.style.display = el.dataset.v === v ? 'flex' : 'none'; });
      render();
      popIn(modal);
      const focusEl = v === 'email' ? emailIn : v === 'code' ? codeIn : null;
      if (focusEl) setTimeout(() => { try { focusEl.focus(); } catch (e) {} }, 60);
    }
    function setErr(which, msg) {
      q('[data-e="' + which + '"]').textContent = msg || '';
      (which === 'email' ? emailIn : codeIn).classList.toggle('input-error', !!msg);
    }
    const close = () => { click(); modal.classList.remove('open'); };
    q('[data-act="close"]').addEventListener('click', close);
    q('[data-act="later"]').addEventListener('click', close);
    q('[data-act="ok"]').addEventListener('click', close);
    q('[data-act="back"]').addEventListener('click', () => { click(); setErr('code', ''); show('email'); });

    async function send() {
      if (sendBtn.classList.contains('disabled')) return;
      click();
      setErr('email', '');
      const email = emailIn.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return setErr('email', errText('invalid_email'));
      busy(sendBtn, true, tx('sending'));
      try {
        const r = await callEmail({ action: 'send', email });
        if (!r.ok) return setErr('email', errText(r.data.error));
        pendingEmail = email.toLowerCase();
        codeIn.value = '';
        setErr('code', '');
        show('code');
      } catch (e) {
        setErr('email', errText('generic'));
      } finally {
        busy(sendBtn, false, tx('emailSend'));
      }
    }
    async function confirm() {
      if (confirmBtn.classList.contains('disabled')) return;
      click();
      setErr('code', '');
      const code = codeIn.value.trim();
      if (!/^\d{6}$/.test(code)) return setErr('code', errText('wrong_code'));
      busy(confirmBtn, true, tx('confirming'));
      try {
        const r = await callEmail({ action: 'confirm', code });
        if (!r.ok) return setErr('code', errText(r.data.error));
        show('ok');
      } catch (e) {
        setErr('code', errText('generic'));
      } finally {
        busy(confirmBtn, false, tx('codeConfirm'));
      }
    }
    sendBtn.addEventListener('click', send);
    confirmBtn.addEventListener('click', confirm);
    emailIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
    if (typeof window.onLangChange === 'function') window.onLangChange(() => { if (modal.classList.contains('open')) render(); });

    click();
    show('email');
    modal.classList.add('open');
  }

  // ── 3) Email-change confirmation link (any account) ─────────────────────
  // send-change-email mails /play/?email_token=<token>; opening it applies
  // the change server-side (no session needed — the token is the proof).
  async function initEmailChangeConfirm() {
    let token = null;
    try { token = new URLSearchParams(location.search).get('email_token'); } catch (e) {}
    if (!token) return;
    try {
      const u = new URL(location.href);
      u.searchParams.delete('email_token');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
    let ok = false, email = '', err = '';
    try {
      const res = await fetch(FN_BASE + 'send-change-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', token }),
      });
      const data = await res.json().catch(() => ({}));
      ok = res.ok && data.ok; email = data.email || ''; err = data.error || '';
    } catch (e) {}
    const modal = makeModal('email-change-result-modal',
      '<button class="account-modal-close" type="button" data-act="close">✕</button>' +
      '<div class="account-view">' +
      '  <span class="account-modal-title" data-t="title" style="text-align:center"></span>' +
      '  <div class="account-ok-icon" data-t="icon"></div>' +
      '  <p class="account-modal-desc" data-t="desc"></p>' +
      '  <button class="account-modal-opt account-modal-login" type="button" data-act="ok"></button>' +
      '</div>');
    modal.querySelector('[data-t="title"]').textContent = ok ? tx('changedTitle') : tx('err_generic');
    modal.querySelector('[data-t="icon"]').textContent = ok ? '✅' : '⚠️';
    const desc = modal.querySelector('[data-t="desc"]');
    if (ok) desc.innerHTML = esc(tx('changedDesc')).replace('{email}', '<b>' + esc(email) + '</b>');
    else desc.textContent = tx(err === 'email_taken' ? 'changedTaken' : 'changedFail');
    modal.querySelector('[data-act="ok"]').textContent = tx('okBtn');
    const close = () => { click(); modal.classList.remove('open'); };
    modal.querySelector('[data-act="close"]').addEventListener('click', close);
    modal.querySelector('[data-act="ok"]').addEventListener('click', close);
    popIn(modal);
    modal.classList.add('open');
  }

  // ── 4) Keep or change the CrazyGames name (first web login) ─────────────
  // Their username came from CrazyGames (crazygames-auth); on the web they
  // choose once whether to keep it. The choice is stored in the auth
  // user_metadata (name_choice_done) so it isn't asked again on any device.
  async function maybeAskName() {
    const p = window._sbProfile;
    if (!p?.crazygames_user_id) return;
    try {
      const { data } = await window.sb.auth.getUser();
      if (data?.user?.user_metadata?.name_choice_done) return;
    } catch (e) { return; }
    await new Promise((r) => setTimeout(r, 2500)); // founder popup (800ms) goes first
    for (let i = 0; i < 240 && !menuIsClear(); i++) await new Promise((r) => setTimeout(r, 500));
    if (!menuIsClear()) return;

    await new Promise((resolve) => {
      const modal = makeModal('cg-name-modal',
        '<div class="account-view" data-v="ask">' +
        '  <span class="account-modal-title" data-t="nameTitle" style="text-align:center"></span>' +
        '  <p class="account-modal-desc" data-t="nameDesc"></p>' +
        '  <button class="account-modal-opt account-modal-login" type="button" data-act="keep"></button>' +
        '  <button class="account-modal-opt account-modal-register" type="button" data-act="change"></button>' +
        '</div>' +
        '<div class="account-view" data-v="edit" style="display:none">' +
        '  <span class="account-modal-title" data-t="nameNewTitle" style="text-align:center"></span>' +
        '  <div class="account-form">' +
        '    <label class="account-label" data-t="nameLabel"></label>' +
        '    <input class="account-input" type="text" data-i="name" maxlength="12" autocomplete="off" spellcheck="false">' +
        '    <span class="account-error" data-e="name"></span>' +
        '    <button class="account-modal-opt account-modal-login" type="button" data-act="save"></button>' +
        '  </div>' +
        '  <button class="account-modal-back" type="button" data-act="back"></button>' +
        '</div>');
      const q = (sel) => modal.querySelector(sel);
      const input = q('[data-i="name"]'), saveBtn = q('[data-act="save"]');
      function render() {
        q('[data-t="nameTitle"]').textContent = tx('nameTitle');
        q('[data-t="nameDesc"]').innerHTML = esc(tx('nameDesc')).replace('{name}', '<b>' + esc(window._sbProfile?.username || '') + '</b>');
        q('[data-act="keep"]').textContent = tx('nameKeep');
        q('[data-act="change"]').textContent = tx('nameChange');
        q('[data-t="nameNewTitle"]').textContent = tx('nameNewTitle');
        q('[data-t="nameLabel"]').textContent = tx('nameLabel');
        saveBtn.textContent = tx('nameSave');
        q('[data-act="back"]').textContent = tx('nameBack');
      }
      function show(v) {
        modal.querySelectorAll('.account-view').forEach((el) => { el.style.display = el.dataset.v === v ? 'flex' : 'none'; });
        render();
        popIn(modal);
        if (v === 'edit') { input.value = window._sbProfile?.username || ''; setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 60); }
      }
      function setErr(msg) { q('[data-e="name"]').textContent = msg || ''; input.classList.toggle('input-error', !!msg); }
      async function finish() {
        try { await window.sb.auth.updateUser({ data: { name_choice_done: true } }); } catch (e) {}
        modal.classList.remove('open');
        resolve();
      }
      q('[data-act="keep"]').addEventListener('click', () => { click(); finish(); });
      q('[data-act="change"]').addEventListener('click', () => { click(); setErr(''); show('edit'); });
      q('[data-act="back"]').addEventListener('click', () => { click(); show('ask'); });
      async function save() {
        if (saveBtn.classList.contains('disabled')) return;
        click();
        setErr('');
        const name = input.value.trim();
        if (!/^[a-zA-Z0-9]{4,12}$/.test(name)) return setErr(tx('name_invalid'));
        if (typeof window.containsBadWord === 'function' && window.containsBadWord(name)) return setErr(tx('name_bad'));
        if (name === window._sbProfile?.username) return finish();
        busy(saveBtn, true, tx('nameSaving'));
        try {
          await window.sbChangeUsername(name);
          window._sbProfile.username = name;
          try { localStorage.setItem('playerName', name); } catch (e) {}
          const el = document.getElementById('loading-player-name');
          if (el) el.textContent = name;
          if (typeof window._updateProfileBtnLabel === 'function') window._updateProfileBtnLabel();
          if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
          finish();
        } catch (e) {
          const m = String(e?.message || '');
          setErr(tx(m.includes('__username_taken__') ? 'name_taken'
            : m.includes('__cooldown_active__') ? 'name_cooldown'
            : m.includes('__invalid_username__') ? 'name_invalid' : 'err_generic'));
        } finally {
          busy(saveBtn, false, tx('nameSave'));
        }
      }
      saveBtn.addEventListener('click', save);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      if (typeof window.onLangChange === 'function') window.onLangChange(() => { if (modal.classList.contains('open')) render(); });
      click();
      show('ask');
      modal.classList.add('open');
    });
  }

  let onboardingStarted = false;
  async function cgOnboarding() {
    if (onboardingStarted) return;
    onboardingStarted = true;
    await maybeAskName();
    await maybeAskEmail();
  }

  document.addEventListener('sbSessionReady', () => { cgOnboarding(); });
  // In case the session was already adopted before this script loaded.
  if (window._sessionReady) cgOnboarding();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initHandoff(); initEmailChangeConfirm(); });
  else { initHandoff(); initEmailChangeConfirm(); }
})();
