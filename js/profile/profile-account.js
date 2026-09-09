// ============================================================================
// profile/profile-account.js — modal de cuenta (login/registro/recuperación/
// cambio de usuario|contraseña|correo|logout), primer ingreso (name-prompt),
// cambio de foto de perfil, popups de bienvenida (normal y Fundador),
// _onSessionReady (sync al restaurar sesión) y _updateProfileBtnLabel.
// Extraído de monuments.js (fase 4). Se carga antes que monuments.js.
// Las funciones sociales que usa _onSessionReady (_subscribeFriendshipChanges,
// _startSocialListPoll) viven aún en monuments.js y se invocan sólo después del
// primer await de _onSessionReady, con monuments.js ya cargado.
// ============================================================================

// ── MODAL CUENTA ─────────────────────────────────────────────────────────────
(function () {
  const btn   = document.getElementById('profile-account-btn');
  const modal = document.getElementById('account-modal');
  const close = document.getElementById('account-modal-close');
  const login = document.getElementById('account-modal-login');
  const reg   = document.getElementById('account-modal-register');
  if (!modal) return;

  const viewMain           = document.getElementById('account-view-main');
  const viewLogin          = document.getElementById('account-view-login');
  const viewRegister       = document.getElementById('account-view-register');
  const viewLoading        = document.getElementById('account-view-loading');
  const viewVerify         = document.getElementById('account-view-verify');
  const viewWelcome        = document.getElementById('account-view-welcome');
  const viewLoggedIn       = document.getElementById('account-view-loggedin');
  const viewChangePass     = document.getElementById('account-view-change-pass');
  const viewChangePassOk   = document.getElementById('account-view-change-pass-ok');
  const viewChangeEmail    = document.getElementById('account-view-change-email');
  const viewChangeEmailSent  = document.getElementById('account-view-change-email-sent');
  const viewLogoutConfirm    = document.getElementById('account-view-logout-confirm');
  const viewForgot           = document.getElementById('account-view-forgot');
  const viewForgotCode       = document.getElementById('account-view-forgot-code');
  const viewChangeUsername        = document.getElementById('account-view-change-username');
  const viewChangeUsernameConfirm = document.getElementById('account-view-change-username-confirm');
  const viewChangeUsernameOk      = document.getElementById('account-view-change-username-ok');

  const allViews = [viewMain, viewLogin, viewRegister, viewLoading, viewVerify, viewWelcome,
                    viewLoggedIn, viewChangePass, viewChangePassOk, viewChangeEmail, viewChangeEmailSent, viewLogoutConfirm,
                    viewForgot, viewForgotCode, viewChangeUsername, viewChangeUsernameConfirm, viewChangeUsernameOk];

  const box = modal.querySelector('.account-modal-box');
  let currentView = null;

  const noCloseViews = new Set([viewLoading, viewWelcome, viewChangeEmailSent]);
  // backMap: X button goes to parent view; null = close modal
  const backMap = new Map([
    [viewMain,            null],
    [viewLoggedIn,        null],
    [viewLogin,           viewMain],
    [viewRegister,        viewMain],
    [viewChangePass,      viewLoggedIn],
    [viewChangePassOk,    viewLoggedIn],
    [viewChangeEmail,     viewLoggedIn],
    [viewLogoutConfirm,   viewLoggedIn],
    [viewChangeUsername,        viewLoggedIn],
    [viewChangeUsernameConfirm, viewChangeUsername],
    [viewChangeUsernameOk,      viewLoggedIn],
    [viewForgot,          viewLogin],
    [viewForgotCode,      viewForgot],
  ]);

  function showView(v) {
    allViews.forEach(el => { if (el) el.style.display = 'none'; });
    if (v) v.style.display = 'flex';
    currentView = v;
    if (box) {
      const forceHideClose = v === viewChangePass && !!window._isPasswordReset;
      box.classList.toggle('hide-close', noCloseViews.has(v) || forceHideClose);
      box.style.animation = 'none'; box.offsetWidth; box.style.animation = '';
    }
  }
  function isLoggedIn() {
    return !!(window._accountLoggedIn || document.body.classList.contains('account-logged'));
  }
  function openModal() {
    if (isLoggedIn()) {
      const nameEl = document.getElementById('account-linked-name');
      if (nameEl) nameEl.textContent = (window._sbProfile?.username) || localStorage.getItem('playerName') || '';
      showView(viewLoggedIn || document.getElementById('account-view-loggedin'));
    } else {
      showView(viewMain);
    }
    modal.classList.add('open');
  }
  function closeModal() { modal.classList.remove('open'); }

  // Expuesto para que el name-prompt abra el modal directamente en login o register
  window.openAccountModal = function (startView) {
    if (startView === 'login')    { showView(viewLogin);    modal.classList.add('open'); return; }
    if (startView === 'register') { showView(viewRegister); modal.classList.add('open'); return; }
    openModal();
  };

  // Expuesto para que sb.js abra la vista de "nueva contraseña" tras una recuperación
  // (evento PASSWORD_RECOVERY), reusando el pipeline real de showView (animación, X oculta, etc.)
  window._openRecoveryChangePassView = function () {
    ['chpass-current','chpass-new','chpass-confirm'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.value = ''; el.classList.remove('input-error'); }
    });
    document.querySelectorAll('[id^="chpass-err"]').forEach(el => { el.textContent = ''; });
    const strengthWrap = document.getElementById('chpass-strength-wrap');
    if (strengthWrap) strengthWrap.style.display = 'none';
    const currentWrap = document.getElementById('chpass-current-wrap');
    if (currentWrap) currentWrap.style.display = 'none';
    window._isPasswordReset = true;
    showView(viewChangePass);
    modal.classList.add('open');
  };

  if (!btn) return;
  btn.addEventListener('click', () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); openModal(); });
  close.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const back = backMap.get(currentView);
    if (back === undefined || back === null) closeModal();
    else showView(back);
  });

  login?.addEventListener('click', () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); showView(viewLogin); });
  reg?.addEventListener('click',   () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); showView(viewRegister); });

  document.getElementById('reg-verify-ok')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    if (_pendingLoginFill) {
      const userEl = document.getElementById('login-user');
      const passEl = document.getElementById('login-pass');
      if (userEl) userEl.value = _pendingLoginFill.username;
      if (passEl) passEl.value = _pendingLoginFill.password;
      const errU = document.getElementById('login-err-user');
      const errP = document.getElementById('login-err-pass');
      if (errU) errU.textContent = '';
      if (errP) errP.textContent = '';
      _pendingLoginFill = null;
    }
    showView(viewLogin);
  });

  document.getElementById('login-forgot-btn')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const userEl = document.getElementById('forgot-user');
    if (userEl) userEl.value = document.getElementById('login-user')?.value || '';
    const errEl = document.getElementById('forgot-err-user');
    if (errEl) errEl.textContent = '';
    showView(viewForgot);
  });

  document.getElementById('forgot-back')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLogin);
  });

  let _forgotEmail = null;
  let _forgotResendCooldown = false;

  document.getElementById('forgot-submit')?.addEventListener('click', async () => {
    const userEl = document.getElementById('forgot-user');
    const errEl  = document.getElementById('forgot-err-user');
    const username = userEl?.value.trim() || '';
    if (!username) { if (errEl) errEl.textContent = t('account.errLoginUser') || 'Ingresa tu usuario.'; return; }
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLoading);
    try {
      const { data: profile, error } = await window.sb.from('profiles').select('email').eq('username', username).single();
      if (error || !profile?.email) {
        showView(viewForgot);
        if (errEl) errEl.textContent = t('account.errUserNotFound') || 'Este usuario no existe.';
        return;
      }
      await window.sbResetPassword(profile.email);
      _forgotEmail = profile.email;
      const codeEl = document.getElementById('forgot-code');
      const codeErrEl = document.getElementById('forgot-err-code');
      if (codeEl) codeEl.value = '';
      if (codeErrEl) codeErrEl.textContent = '';
      showView(viewForgotCode);
    } catch(e) {
      showView(viewForgot);
      if (errEl) errEl.textContent = (e.message && e.message !== '{}') ? e.message : 'Error al enviar el correo.';
    }
  });

  document.getElementById('forgot-code')?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  document.getElementById('forgot-code-back')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewForgot);
  });

  document.getElementById('forgot-code-submit')?.addEventListener('click', async () => {
    const codeEl = document.getElementById('forgot-code');
    const errEl  = document.getElementById('forgot-err-code');
    const code = codeEl?.value.trim() || '';
    if (!_forgotEmail) { showView(viewForgot); return; }
    if (!/^\d{6}$/.test(code)) {
      if (errEl) errEl.textContent = t('account.errCodeInvalid') || 'Ingresa el código de 6 dígitos.';
      return;
    }
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    if (errEl) errEl.textContent = '';
    showView(viewLoading);
    try {
      const { error } = await window.sb.auth.verifyOtp({ email: _forgotEmail, token: code, type: 'recovery' });
      if (error) throw error;
      localStorage.setItem('_pendingPasswordReset', '1');
      _forgotEmail = null;
      // El listener de PASSWORD_RECOVERY en sb.js abre la vista de nueva contraseña.
    } catch(e) {
      showView(viewForgotCode);
      if (errEl) errEl.textContent = t('account.errCodeInvalid') || 'Código inválido o expirado.';
    }
  });

  document.getElementById('forgot-code-resend')?.addEventListener('click', async () => {
    const resendBtn = document.getElementById('forgot-code-resend');
    if (_forgotResendCooldown || !_forgotEmail) return;
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    _forgotResendCooldown = true;
    try {
      await window.sbResetPassword(_forgotEmail);
      const errEl = document.getElementById('forgot-err-code');
      if (errEl) { errEl.classList.add('account-error-ok'); errEl.textContent = t('account.codeResent') || 'Código reenviado.'; }
    } catch(e) { /* silencioso: no bloquea el flujo */ }
    if (resendBtn) resendBtn.classList.add('disabled');
    setTimeout(() => {
      _forgotResendCooldown = false;
      if (resendBtn) resendBtn.classList.remove('disabled');
      const errEl = document.getElementById('forgot-err-code');
      if (errEl) { errEl.classList.remove('account-error-ok'); errEl.textContent = ''; }
    }, 20000);
  });

  document.getElementById('login-welcome-ok')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    closeModal();
    // Login manual (no restauración de sesión al recargar, esa pasa por
    // _onSessionReady): si la cuenta ya calificaba de antes (founder con al
    // menos 1 Vuelta Mundial COMPLETA jugada — campaigns_completed, GlobeQuiz
    // no cuenta), se la mostramos apenas cierra este modal y pisa el menú —
    // mismo criterio que _onSessionReady.
    const p = window._sbProfile;
    if (p && p.is_founder && !p.founder_popup_seen && (p.campaigns_completed || 0) > 0) {
      setTimeout(() => { if (typeof window.showFounderWelcomePopup === 'function') window.showFounderWelcomePopup(); }, 500);
    }
  });

  ['login-user','login-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-submit')?.click();
    });
  });
  document.getElementById('login-submit')?.addEventListener('click', () => {
    const userEl  = document.getElementById('login-user');
    const passEl  = document.getElementById('login-pass');
    const errU    = document.getElementById('login-err-user');
    const errP    = document.getElementById('login-err-pass');

    let ok = true;
    const setErr = (input, el, msg) => {
      el.textContent = msg;
      input.classList.toggle('input-error', !!msg);
      if (msg) ok = false;
    };

    const uVal = userEl.value.trim();
    if (!uVal) {
      setErr(userEl, errU, t('account.errLoginUser'));
    } else if (!/^[a-zA-Z0-9]{4,12}$/.test(uVal)) {
      setErr(userEl, errU, t('account.errLoginUserInvalid'));
    } else {
      setErr(userEl, errU, '');
    }

    const pVal = passEl.value;
    if (pVal.length < 6) setErr(passEl, errP, t('account.errPassShort'));
    else setErr(passEl, errP, '');

    if (ok) {
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      showView(viewLoading);
      (typeof window.withConnTimeout === 'function' ? window.withConnTimeout(window.sbLogin(uVal, pVal), 6000) : window.sbLogin(uVal, pVal))
        .then(async data => {
          if (!data) { showView(viewLogin); return; } // timeout: ya se mostró la viñeta de error de conexión
          window._accountLoggedIn = true;
          window._sbUserId = data.user.id;
          document.body.classList.add('account-logged');
          if (typeof window.sbClaimAnonymousEvents === 'function') window.sbClaimAnonymousEvents();
          try {
            await syncLocalDataToAccount(data.user.id);
            const profile = await window.sbGetProfile(data.user.id);
            window._sbProfile = profile;
            if (profile.username) localStorage.setItem('playerName', profile.username);
            if (profile.avatar_url) {
              localStorage.setItem('profilePhoto', profile.avatar_url);
              applyStoredProfilePic();
            }
            syncHsFromProfile(profile);   // hs locales ← max(local, supabase)
            clearLocalScores();           // solo avgs/playcount → 0
            if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
            if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
            _ensureCountryCode(profile);
            if (typeof _updateProfileBtnLabel === 'function') _updateProfileBtnLabel();
            if (typeof loadFriends === 'function') loadFriends();
            if (typeof window.sbUpdateLastActive === 'function') window.sbUpdateLastActive(data.user.id).catch(() => {});
            // Escuchar invitaciones versus en tiempo real
            // Session guard DESACTIVADO (ver mismo comentario en sb.js) — la
            // cuenta debe poder usarse en varios dispositivos a la vez.
            if (typeof window._vsStartListening === 'function') window._vsStartListening();
            if (window.LB && typeof window.LB.listenForInvites === 'function') {
              window.LB.listenForInvites(p => { if (typeof window.showLobbyIncomingInvite === 'function') window.showLobbyIncomingInvite(p); });
            }
            setTimeout(() => { if (typeof window.refreshVersusBell === 'function') window.refreshVersusBell(); }, 600);
            // Heartbeat: actualiza last_active cada 45s mientras el usuario esté logueado
            clearInterval(window._presenceHeartbeat);
            window._presenceHeartbeat = setInterval(() => {
              if (window._sbUserId && typeof window.sbUpdateLastActive === 'function')
                window.sbUpdateLastActive(window._sbUserId).catch(() => {});
            }, 45000);
            const displayName = profile.username || uVal;
            const nameEl   = document.getElementById('account-welcome-name');
            const prefixEl = document.getElementById('account-welcome-prefix');
            const descEl   = document.getElementById('account-welcome-desc');
            if (prefixEl) prefixEl.textContent = t('account.welcomePrefix');
            if (nameEl)   nameEl.textContent   = displayName;
            if (descEl)   descEl.innerHTML     = t('account.welcomeDesc');
          } catch(e) {}
          showView(viewWelcome);
        })
        .catch(err => {
          showView(viewLogin);
          const errU = document.getElementById('login-err-user');
          const errP = document.getElementById('login-err-pass');
          const userEl = document.getElementById('login-user');
          const passEl = document.getElementById('login-pass');
          if (err.message === '__user_not_found__') {
            if (errU) errU.textContent = t('account.errUserNotFound');
            if (userEl) userEl.classList.add('input-error');
          } else {
            if (errP) errP.textContent = t('account.errWrongPass');
            if (passEl) passEl.classList.add('input-error');
          }
        });
    }
  });

  // Contraseña == usuario + variación trivial (ej. "mateo" / "Mateo01") no
  // debería pasar de "débil" nunca, por más que sume puntos de largo/dígitos/
  // mayúsculas — el username es de por sí público (aparece en Rankings,
  // Amigos, etc.), así que agregarle un sufijo simple no suma seguridad
  // real. Basta con que la contraseña CONTENGA el usuario completo
  // (normalizando mayúsculas) para considerarla insegura; variaciones que no
  // incluyan el usuario entero (anagramas, palabras distintas, etc.) no caen
  // en esta regla. Usuario de 1-2 caracteres no cuenta (demasiado corto para
  // que "contenerlo" signifique algo).
  function _passContainsUsername(pass, username) {
    if (!pass || !username || username.length < 3) return false;
    return pass.toLowerCase().includes(username.toLowerCase());
  }

  document.getElementById('reg-pass')?.addEventListener('input', function () {
    const wrap  = document.getElementById('pass-strength-wrap');
    const fill  = document.getElementById('pass-strength-fill');
    const label = document.getElementById('pass-strength-label');
    const v = this.value;
    if (!v) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    let score = 0;
    if (v.length >= 8)  score++;
    if (v.length >= 12) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^a-zA-Z0-9]/.test(v)) score++;
    // Penalizar contraseñas comunes, repeticiones y secuencias
    const commonPasswords = ['123456','1234567','12345678','123456789','password','contraseña','111111','000000','qwerty','abc123','654321','987654','112233','123123','aaaaaa','888888','666666','999999','pass123'];
    const isCommon    = commonPasswords.includes(v.toLowerCase());
    const isRepeating = /^(.)\1+$/.test(v);
    const isSequential = /^(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(v);
    const usernameEl = document.getElementById('reg-username');
    const hasUsername = _passContainsUsername(v, usernameEl ? usernameEl.value.trim() : '');
    if (isCommon || isRepeating || isSequential || hasUsername) score = 0;
    if (score <= 1)      { fill.style.width = '33%';  fill.style.background = '#e74c3c'; label.style.color = '#e74c3c'; label.textContent = t('account.passWeak'); }
    else if (score <= 3) { fill.style.width = '66%';  fill.style.background = '#f39c12'; label.style.color = '#c87800'; label.textContent = t('account.passMedium'); }
    else                 { fill.style.width = '100%'; fill.style.background = '#2bd14b'; label.style.color = '#1a7a30'; label.textContent = t('account.passStrong'); }
  });
  // Si el usuario termina de escribir el username DESPUÉS de la contraseña,
  // el meter quedó calculado con el username viejo (vacío) — reevaluar la
  // contraseña también cuando cambia el usuario.
  document.getElementById('reg-username')?.addEventListener('input', () => {
    document.getElementById('reg-pass')?.dispatchEvent(new Event('input'));
  });

  // Credenciales recién registradas, para precargar el login apenas se
  // confirma el email (ver reg-submit más abajo y reg-verify-ok más arriba)
  // — solo en memoria, nunca en localStorage.
  let _pendingLoginFill = null;

  document.getElementById('reg-submit')?.addEventListener('click', () => {
    const username = document.getElementById('reg-username');
    const email    = document.getElementById('reg-email');
    const pass     = document.getElementById('reg-pass');
    const pass2    = document.getElementById('reg-pass2');
    const errU  = document.getElementById('reg-err-username');
    const errE  = document.getElementById('reg-err-email');
    const errP  = document.getElementById('reg-err-pass');
    const errP2 = document.getElementById('reg-err-pass2');

    let ok = true;
    const setErr = (input, el, msg) => {
      el.textContent = msg;
      input.classList.toggle('input-error', !!msg);
      if (msg) ok = false;
    };

    const uVal = username.value.trim();
    if (uVal.length < 4 || uVal.length > 12)
      setErr(username, errU, t('account.errUserChars'));
    else if (!/^[a-zA-Z0-9]+$/.test(uVal))
      setErr(username, errU, t('account.errUserInvalid'));
    else if (typeof window.containsBadWord === 'function' && window.containsBadWord(uVal))
      setErr(username, errU, t('account.errUserBadWord'));
    else setErr(username, errU, '');

    const eVal = email.value.trim();
    if (!/^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.(com|net|edu|org|io|co|es|mx|ar|uk|de|fr|br|ca|jp|au)(\.[a-z]{2})?$/i.test(eVal))
      setErr(email, errE, t('account.errEmailInvalid'));
    else setErr(email, errE, '');

    const pVal = pass.value;
    if (pVal.length < 6)
      setErr(pass, errP, t('account.errPassShort'));
    else if (_passContainsUsername(pVal, uVal))
      setErr(pass, errP, t('account.errPassContainsUser'));
    else setErr(pass, errP, '');

    const p2Val = pass2.value;
    if (p2Val !== pVal)
      setErr(pass2, errP2, t('account.errPassMismatch'));
    else setErr(pass2, errP2, '');

    if (ok) {
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      showView(viewLoading);
      const _regUsername = document.getElementById('reg-username').value.trim();
      const _regPassword = document.getElementById('reg-pass').value;
      // Se guardan para precargar el login apenas confirme el email (ver
      // reg-verify-ok más abajo) — así no tiene que volver a tipear lo mismo
      // que acaba de escribir dos segundos antes. Solo vive en memoria,
      // nunca en localStorage, y se borra apenas se usa una vez.
      _pendingLoginFill = { username: _regUsername, password: _regPassword };
      const _regPromise = window.sbRegister(_regUsername, document.getElementById('reg-email').value.trim(), _regPassword);
      // 18s en vez de los 6s del resto de las llamadas: signUp() no es una
      // consulta simple, dispara el trigger que crea el profile Y el envío
      // del email de verificación — con SMTP lento eso solía tardar más de
      // 6s y el timeout mostraba "no pudimos conectar" aunque la cuenta se
      // terminara creando bien del lado del servidor (quedaba huérfana:
      // creada en Supabase pero el jugador nunca veía la pantalla de
      // verificar email).
      (typeof window.withConnTimeout === 'function' ? window.withConnTimeout(_regPromise, 18000) : _regPromise)
       .then(result => { if (result) showView(viewVerify); else showView(viewRegister); }) // undefined = timeout, viñeta ya mostrada
       .catch(err => {
         showView(viewRegister);
         const errU = document.getElementById('reg-err-username');
         if (errU) errU.textContent = err.message;
       });
    }
  });

  // ── Vista logueado: botones de acción ──────────────────────────────────────
  document.getElementById('account-go-change-pass')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    ['chpass-current','chpass-new','chpass-confirm'].forEach(id => { const el = document.getElementById(id); if (el) { el.value = ''; el.classList.remove('input-error'); } });
    const wrap = document.getElementById('chpass-strength-wrap');
    if (wrap) wrap.style.display = 'none';
    const currentWrap = document.getElementById('chpass-current-wrap');
    if (currentWrap) currentWrap.style.display = '';
    window._isPasswordReset = false;
    ['chpass-err-current','chpass-err-new','chpass-err-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    showView(viewChangePass);
  });

  // ── Cambiar nombre de usuario (1 vez cada 30 días, ver RPC change_username) ─
  let _pendingNewUsername = null;

  function _usernameCooldownRemainingMs() {
    const changedAt = window._sbProfile?.username_changed_at;
    if (!changedAt) return 0;
    const nextEligible = new Date(changedAt).getTime() + 30 * 24 * 60 * 60 * 1000;
    return Math.max(0, nextEligible - Date.now());
  }

  document.getElementById('account-go-change-username')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const inp = document.getElementById('chusername-new');
    const err = document.getElementById('chusername-err');
    if (inp) { inp.value = ''; inp.classList.remove('input-error'); }
    const remainingMs = _usernameCooldownRemainingMs();
    if (remainingMs > 0) {
      const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
      if (err) err.textContent = tn('account.errUsernameCooldown', days);
      if (inp) inp.disabled = true;
      const submitBtn = document.getElementById('chusername-submit');
      if (submitBtn) submitBtn.classList.add('disabled');
    } else {
      if (err) err.textContent = '';
      if (inp) inp.disabled = false;
      const submitBtn = document.getElementById('chusername-submit');
      if (submitBtn) submitBtn.classList.remove('disabled');
    }
    showView(viewChangeUsername);
  });

  document.getElementById('chusername-submit')?.addEventListener('click', () => {
    if (_usernameCooldownRemainingMs() > 0) return;
    const inp = document.getElementById('chusername-new');
    const err = document.getElementById('chusername-err');
    const uVal = inp?.value.trim() || '';
    const setErr = (msg) => { if (err) err.textContent = msg; inp?.classList.toggle('input-error', !!msg); };
    if (uVal.length < 4 || uVal.length > 12) { setErr(t('account.errUserChars')); return; }
    if (!/^[a-zA-Z0-9]+$/.test(uVal)) { setErr(t('account.errUserInvalid')); return; }
    if (typeof window.containsBadWord === 'function' && window.containsBadWord(uVal)) { setErr(t('account.errUserBadWord')); return; }
    if (uVal === (window._sbProfile?.username || '')) { setErr(t('account.errSameUsername')); return; }
    setErr('');
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    _pendingNewUsername = uVal;
    const descEl = document.getElementById('account-change-username-confirm-desc');
    if (descEl) descEl.textContent = t('account.changeUsernameConfirmDesc', { name: uVal });
    showView(viewChangeUsernameConfirm);
  });

  document.getElementById('chusername-confirm-no')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewChangeUsername);
  });

  document.getElementById('chusername-confirm-yes')?.addEventListener('click', () => {
    if (!_pendingNewUsername) return;
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLoading);
    const newName = _pendingNewUsername;
    window.sbChangeUsername(newName)
      .then((changedAt) => {
        _pendingNewUsername = null;
        if (window._sbProfile) {
          window._sbProfile.username = newName;
          window._sbProfile.username_changed_at = changedAt || new Date().toISOString();
        }
        localStorage.setItem('playerName', newName);
        const nameEl = document.getElementById('loading-player-name');
        if (nameEl) nameEl.textContent = newName;
        const linkedNameEl = document.getElementById('account-linked-name');
        if (linkedNameEl) linkedNameEl.textContent = newName;
        if (typeof window._updateProfileBtnLabel === 'function') window._updateProfileBtnLabel();
        if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
        const okDescEl = document.getElementById('account-change-username-ok-desc');
        if (okDescEl) okDescEl.textContent = t('account.changeUsernameOkDesc', { name: newName });
        showView(viewChangeUsernameOk);
      })
      .catch(err => {
        showView(viewChangeUsername);
        const errEl = document.getElementById('chusername-err');
        const msg = err.message || '';
        let friendly = t('account.errGeneric') || 'Ocurrió un error. Intenta de nuevo.';
        if (msg.startsWith('__cooldown_active__')) {
          const iso = msg.split(':').slice(1).join(':');
          const days = Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
          friendly = tn('account.errUsernameCooldown', days);
          if (window._sbProfile) window._sbProfile.username_changed_at = new Date(new Date(iso).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const inp = document.getElementById('chusername-new');
          if (inp) inp.disabled = true;
          document.getElementById('chusername-submit')?.classList.add('disabled');
        } else if (msg === '__username_taken__') {
          friendly = t('account.errUserTaken') || 'Ese nombre de usuario ya está en uso.';
        } else if (msg === '__same_username__') {
          friendly = t('account.errSameUsername');
        } else if (msg === '__invalid_username__') {
          friendly = t('account.errUserInvalid');
        }
        if (errEl) errEl.textContent = friendly;
      });
  });

  document.getElementById('chusername-ok-close')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLoggedIn);
  });

  document.getElementById('account-go-change-email')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const inp = document.getElementById('chemail-new');
    if (inp) inp.value = '';
    const err = document.getElementById('chemail-err');
    if (err) err.textContent = '';
    showView(viewChangeEmail);
  });

  document.getElementById('account-logout-btn')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLogoutConfirm || document.getElementById('account-view-logout-confirm'));
  });

  document.getElementById('account-logout-cancel')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLoggedIn || document.getElementById('account-view-loggedin'));
  });

  async function _doLogout() {
    if (window._sbUserId) window.sbSetPlaying(window._sbUserId, false).catch(() => {});
    if (window._sbUserId && typeof window.sbSetPlayingMode === 'function') window.sbSetPlayingMode(window._sbUserId, null).catch(() => {});
    if (window.LB?.getId?.()) { try { await window.LB.leave(); } catch (e) {} }
    window.sbStopSessionGuard?.();
    localStorage.removeItem('_sbSessionToken');
    if (_friendRealtimeChannel)  { window.sb.removeChannel(_friendRealtimeChannel);  _friendRealtimeChannel = null; }
    if (_friendshipsChannel)     { window.sb.removeChannel(_friendshipsChannel);     _friendshipsChannel = null; }
    await window.sbLogout?.();
    window._accountLoggedIn = false;
    window._sbUserId = null;
    window._sbProfile = null;
    document.body.classList.remove('account-logged');
    localStorage.removeItem('profilePhoto');
    applyStoredProfilePic();
    // Personalización (marco/tarjeta/panel/celda): _applyFounderFrame cae a
    // este caché local cuando no hay perfil logueado — sin borrarlo acá, un
    // invitado que juega después de cerrar sesión seguía viendo el marco,
    // la carta del leaderboard y el panel de la cuenta anterior.
    localStorage.removeItem('cust_frame_code');
    localStorage.removeItem('cust_card_code');
    localStorage.removeItem('cust_panel_code');
    localStorage.removeItem('cust_cell_code');
    if (typeof window._applyFounderFrame === 'function') window._applyFounderFrame();
    // Racha de invitado de GlobeQuiz + visitor_id: si no se resetean acá,
    // el próximo que juegue de invitado en este mismo dispositivo (sin
    // loguearse) hereda la racha y el visitor_id de la cuenta que se
    // acaba de ir, mezclando su historial con el de otra persona.
    localStorage.removeItem('gq_streak_count');
    localStorage.removeItem('gq_streak_last_date');
    window.Analytics?.resetVisitorId?.();
    if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
    clearLocalScores(true);
    // clearLocalScores solo borra localStorage — las variables `highscore`/
    // `monumentsHighscore` (ver ~línea 5054) se leen de ahí UNA sola vez al
    // cargar la página y después viven solo en memoria. Sin este reset, si
    // se juega de invitado justo después de cerrar sesión (sin recargar),
    // el splash de Cities/Monumentos seguía mostrando el récord de la
    // cuenta anterior y la comparación de "nuevo récord" al final de la
    // partida se hacía contra ese valor viejo en vez de contra 0.
    if (typeof highscore !== 'undefined') {
      highscore = 0;
      if (typeof highscoreEl !== 'undefined' && highscoreEl) highscoreEl.textContent = '0';
      if (typeof updateSplashHighscore === 'function') updateSplashHighscore();
    }
    if (typeof monumentsHighscore !== 'undefined') monumentsHighscore = 0;
    if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
    _updateProfileBtnLabel();
  }

  // Logout forzado por sesión duplicada en otro dispositivo
  window._forceSessionLogout = async function() {
    if (!window._accountLoggedIn) return;
    if (typeof closeModal === 'function') closeModal();
    if (typeof window.showVersusToast === 'function')
      window.showVersusToast('Sesión iniciada en otro dispositivo. Cerrando sesión…');
    await _doLogout();
  };

  document.getElementById('account-logout-confirm')?.addEventListener('click', async () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    closeModal();
    await _doLogout();
  });

  // ── Cambiar contraseña ─────────────────────────────────────────────────────
  document.getElementById('chpass-new')?.addEventListener('input', function () {
    const wrap  = document.getElementById('chpass-strength-wrap');
    const fill  = document.getElementById('chpass-strength-fill');
    const label = document.getElementById('chpass-strength-label');
    const v = this.value;
    if (!v) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    let score = 0;
    if (v.length >= 8)  score++;
    if (v.length >= 12) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^a-zA-Z0-9]/.test(v)) score++;
    const _common2 = ['123456','1234567','12345678','123456789','password','contraseña','111111','000000','qwerty','abc123','654321','987654','112233','123123','aaaaaa','888888','666666','999999','pass123'];
    const hasUsername2 = _passContainsUsername(v, window._sbProfile?.username || '');
    if (_common2.includes(v.toLowerCase()) || /^(.)\1+$/.test(v) || /^(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(v) || hasUsername2) score = 0;
    if (score <= 1)      { fill.style.width = '33%';  fill.style.background = '#e74c3c'; label.style.color = '#e74c3c'; label.textContent = t('account.passWeak'); }
    else if (score <= 3) { fill.style.width = '66%';  fill.style.background = '#f39c12'; label.style.color = '#c87800'; label.textContent = t('account.passMedium'); }
    else                 { fill.style.width = '100%'; fill.style.background = '#2bd14b'; label.style.color = '#1a7a30'; label.textContent = t('account.passStrong'); }
  });

  document.getElementById('chpass-submit')?.addEventListener('click', () => {
    const curInp  = document.getElementById('chpass-current');
    const newInp  = document.getElementById('chpass-new');
    const conf    = document.getElementById('chpass-confirm');
    const errCur  = document.getElementById('chpass-err-current');
    const errNew  = document.getElementById('chpass-err-new');
    const errConf = document.getElementById('chpass-err-confirm');
    let ok = true;
    const setErr = (inp, el, msg) => { el.textContent = msg; inp.classList.toggle('input-error', !!msg); if (msg) ok = false; };
    const isReset = !!window._isPasswordReset;

    if (!isReset) {
      if (!curInp.value) setErr(curInp, errCur, t('account.errLoginUser'));
      else setErr(curInp, errCur, '');
    }

    if (newInp.value.length < 6) setErr(newInp, errNew, t('account.errPassShort'));
    else if (_passContainsUsername(newInp.value, window._sbProfile?.username || '')) setErr(newInp, errNew, t('account.errPassContainsUser'));
    else setErr(newInp, errNew, '');

    if (conf.value !== newInp.value) setErr(conf, errConf, t('account.errPassMismatch'));
    else setErr(conf, errConf, '');

    if (ok) {
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      showView(viewLoading);
      const doChange = () => window.sbChangePassword(newInp.value)
        .then(() => { window._isPasswordReset = false; localStorage.removeItem('_pendingPasswordReset'); showView(viewChangePassOk); })
        .catch(err => {
          showView(viewChangePass);
          if (errNew) errNew.textContent = err.message || t('account.errPassShort');
        });
      if (isReset) {
        doChange();
      } else {
        const username = (window._sbProfile?.username) || localStorage.getItem('playerName') || '';
        window.sbLogin(username, curInp.value)
          .then(doChange)
          .catch(err => {
            showView(viewChangePass);
            if (err.message === '__wrong_password__' || err.message === '__user_not_found__') {
              if (errCur) { errCur.textContent = t('account.errWrongPass'); curInp.classList.add('input-error'); }
            } else {
              if (errNew) errNew.textContent = err.message || t('account.errPassShort');
            }
          });
      }
    }
  });

  document.getElementById('chpass-ok-close')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const nameEl = document.getElementById('account-linked-name');
    if (nameEl) nameEl.textContent = (window._sbProfile?.username) || localStorage.getItem('playerName') || '';
    showView(viewLoggedIn);
  });

  // ── Cambiar correo ─────────────────────────────────────────────────────────
  document.getElementById('chemail-submit')?.addEventListener('click', () => {
    const inp = document.getElementById('chemail-new');
    const err = document.getElementById('chemail-err');
    const eVal = inp.value.trim();
    if (!/^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.(com|net|edu|org|io|co|es|mx|ar|uk|de|fr|br|ca|jp|au)(\.[a-z]{2})?$/i.test(eVal)) {
      err.textContent = t('account.errEmailInvalid');
      inp.classList.add('input-error');
      return;
    }
    err.textContent = '';
    inp.classList.remove('input-error');
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLoading);
    window.sbChangeEmail(eVal)
      .then(() => showView(viewChangeEmailSent))
      .catch(e => {
        showView(viewChangeEmail);
        if (err) err.textContent = e.message === '__same_email__'
          ? (t('account.errSameEmail') || 'Este correo es igual al actual.')
          : (e.message || t('account.errEmailInvalid'));
      });
  });

  document.getElementById('chemail-sent-ok')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    closeModal();
  });
})();

document.getElementById('loading-name-edit')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap  = document.getElementById('loading-name-wrap');
  const input = document.getElementById('loading-name-input');
  input.value = localStorage.getItem('playerName') || 'John';
  wrap.classList.add('editing');
  input.focus();
  input.select();
});

// Feedback visual cuando containsBadWord() rechaza un nombre: borde rojo +
// sacudida breve (reusa el keyframe lb-shake), sin bloquear la edición —
// el input queda como estaba, listo para que lo corrijan.
function _flashBadWordInput(input) {
  if (!input) return;
  input.classList.remove('badword-flash');
  void input.offsetWidth;
  input.classList.add('badword-flash');
  setTimeout(() => input.classList.remove('badword-flash'), 500);
}

function confirmNameChange() {
  const wrap  = document.getElementById('loading-name-wrap');
  const input = document.getElementById('loading-name-input');
  const limpio = input.value.trim().slice(0, 12);
  if (limpio && typeof window.containsBadWord === 'function' && window.containsBadWord(limpio)) {
    _flashBadWordInput(input);
    return;
  }
  if (limpio) {
    localStorage.setItem('playerName', limpio);
    const el = document.getElementById('loading-player-name');
    if (el) el.textContent = limpio;
    maybeAutoAssignPic(limpio);
    _updateProfileBtnLabel();
    // La copa ya no depende del ancho del nombre (vive en el renglón de "Has
    // jugado X veces", ese texto no cambia al renombrarse) — no hace falta
    // reposicionarla acá.
    const flagBadge = document.getElementById('profile-flag-badge');
    if (flagBadge && flagBadge.style.display !== 'none') {
      requestAnimationFrame(() => _centerBadgeWithText(wrap, flagBadge, 'after'));
    }
  }
  wrap.classList.remove('editing');
}

document.getElementById('loading-name-confirm')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const c = document.getElementById('loading-name-confirm');
  c.classList.add('confirm-pressed');
  setTimeout(() => c.classList.remove('confirm-pressed'), 50);
  confirmNameChange();
});

document.getElementById('loading-name-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmNameChange(); }
});

// Redimensiona un File de imagen a max 256×256 y devuelve un dataURL JPEG comprimido
function resizeImageFile(file, callback) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const MAX = 256;
    let w = img.width, h = img.height;
    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
    else        { w = Math.round(w * MAX / h); h = MAX; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.82));
  };
  img.src = url;
}

// Si el nombre contiene "nuti" o cualquier derivado (case-insensitive), asigna nutix.jpg automáticamente
function maybeAutoAssignPic(nombre) {
  if (/nuti/i.test(nombre)) {
    localStorage.setItem('profilePhoto', 'images/profilepic/nutix.jpg');
    applyStoredProfilePic();
  }
}

// Aplica la foto de perfil guardada en todos los sitios donde aparece el jugador
function applyStoredProfilePic() {
  const src = window._sbProfile?.avatar_url || localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
  document.querySelectorAll('.loading-profile-pic:not(#loading-friend-pic)').forEach(el => { el.src = src; });
  const modalPic = document.getElementById('name-prompt-pic');
  if (modalPic) modalPic.src = src;
  const lbImg = document.querySelector('#lb-player .lb-avatar-img');
  if (lbImg) lbImg.src = src;
}
window.applyStoredProfilePic = applyStoredProfilePic;
applyStoredProfilePic();

// Cuando la sesión de Supabase se restaura al recargar: sync datos locales → cuenta
async function _onSessionReady(userId) {
  if (!userId) return;
  // Resetear is_playing por si quedó stale (ej: browser cerrado durante partida)
  if (typeof window.sbSetPlaying === 'function') window.sbSetPlaying(userId, false).catch(() => {});
  if (typeof window.sbSetPlayingMode === 'function') window.sbSetPlayingMode(userId, null).catch(() => {});
  try {
    await syncLocalDataToAccount(userId);
    const profile = await window.sbGetProfile(userId);
    window._sbProfile = profile;
    if (profile.username) localStorage.setItem('playerName', profile.username);
    if (profile.avatar_url) {
      localStorage.setItem('profilePhoto', profile.avatar_url);
      applyStoredProfilePic();
    }
    syncHsFromProfile(profile);  // hs locales ← max(local, supabase) para display en partida
    clearLocalScores();          // solo avgs/playcount
    if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
    if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
    _ensureCountryCode(profile);
    if (typeof loadFriends === 'function') loadFriends();  // poblar barra ingame con amigos reales
    _updateProfileBtnLabel();
    // Popup de Fundador: NO se dispara con solo loguearse en general — hace
    // falta al menos 1 Vuelta Mundial COMPLETA jugada (campaigns_completed >
    // 0; GlobeQuiz NO cuenta para esto). Si la cuenta ya calificaba de antes
    // (jugó antes de que existiera este popup), se muestra directo acá al
    // llegar al menú. Si todavía tiene 0 Vueltas Mundiales, no sale acá —
    // recién se pone elegible al terminar su primera Vuelta Mundial y volver
    // al menú (ver window._pendingFounderPopupCheck, puesta en la rama de
    // campaña completa de este archivo y consumida en js/final.js al volver
    // al menú).
    if (profile.is_founder && !profile.founder_popup_seen && (profile.campaigns_completed || 0) > 0) {
      setTimeout(() => { if (typeof window.showFounderWelcomePopup === 'function') window.showFounderWelcomePopup(); }, 800);
    }
  } catch(e) {}
  _subscribeFriendshipChanges(userId);
  _startSocialListPoll();
  if (typeof window._vsStartListening === 'function') window._vsStartListening();
  // Escuchar invitaciones a salas (push de amigos)
  if (window.LB && typeof window.LB.listenForInvites === 'function') {
    window.LB.listenForInvites(p => { if (typeof window.showLobbyIncomingInvite === 'function') window.showLobbyIncomingInvite(p); });
  }
  // Al recargar: cerrar/transferir mis salas en espera de la sesión anterior
  // (refresh = salir de la sala), y si entré por link de invitación, unirme.
  if (window.LB && typeof window.LB.cleanupMine === 'function') window.LB.cleanupMine();
  if (typeof window.tryPendingLobbyJoin === 'function') window.tryPendingLobbyJoin();
  setTimeout(() => { if (typeof window.refreshVersusBell === 'function') window.refreshVersusBell(); }, 600);
}
document.addEventListener('sbSessionReady', (e) => _onSessionReady(e.detail?.userId));
// Si el evento ya fue disparado antes de que este listener se registrara, ejecutar ahora
if (window._sessionReady && window._sbUserId) _onSessionReady(window._sbUserId);
// Mostrar "Cuenta/Account" si no hay sesión activa al cargar
_updateProfileBtnLabel();

// Cambio de foto desde el panel de perfil
(function () {
  function initProfilePicChange() {
    const wrap  = document.getElementById('loading-profile-pic-wrap');
    const input = document.getElementById('loading-profile-pic-input');
    if (!wrap || !input) return;
    wrap.addEventListener('click', () => { input.value = ''; input.click(); });
    // También desde el modal de cuenta
    const accountPicWrap = document.getElementById('account-modal-pic-wrap');
    if (accountPicWrap) {
      accountPicWrap.addEventListener('click',       () => { input.value = ''; input.click(); });
      accountPicWrap.addEventListener('mouseenter',  () => accountPicWrap.classList.add('pic-hover'));
      accountPicWrap.addEventListener('mouseleave',  () => accountPicWrap.classList.remove('pic-hover'));
    }
    function _setAvatarUploading(on) {
      // Account modal pic — inline styles (CSS class-opacity breaks inside animated stacking context)
      const acctOverlay = document.getElementById('account-modal-pic-overlay');
      const acctPencil  = document.getElementById('account-modal-pic-pencil');
      const acctSpinner = document.getElementById('account-modal-pic-spinner');
      if (acctOverlay) {
        acctOverlay.style.opacity    = on ? '1' : '';
        acctOverlay.style.background = on ? 'rgba(0,0,0,0.5)' : '';
      }
      if (acctPencil)  acctPencil.style.display  = on ? 'none'  : '';
      if (acctSpinner) acctSpinner.style.display  = on ? 'block' : 'none';
      // Panel de perfil — inline styles
      const profOverlay = document.getElementById('loading-profile-pic-overlay');
      const profPencil  = document.getElementById('loading-profile-pic-pencil');
      const profSpinner = document.getElementById('loading-profile-pic-spinner');
      if (profOverlay) {
        profOverlay.style.opacity    = on ? '1' : '';
        profOverlay.style.background = on ? 'rgba(0,0,0,0.5)' : '';
      }
      if (profPencil)  profPencil.style.display  = on ? 'none'  : '';
      if (profSpinner) profSpinner.style.display  = on ? 'block' : 'none';
    }
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      if (window._accountLoggedIn && window._sbUserId) _setAvatarUploading(true);
      resizeImageFile(file, async (dataURL) => {
        localStorage.setItem('profilePhoto', dataURL);
        applyStoredProfilePic();
        if (window._accountLoggedIn && window._sbUserId) {
          try {
            const res  = await fetch(dataURL);
            const blob = await res.blob();
            const url  = await window.sbUploadAvatar(window._sbUserId, blob);
            if (window._sbProfile) window._sbProfile.avatar_url = url;
            localStorage.setItem('profilePhoto', url);
            applyStoredProfilePic();
          } catch (e) { console.warn('[avatar] upload error:', e.message); }
          finally { _setAvatarUploading(false); }
        }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProfilePicChange);
  else initProfilePicChange();
})();

// ── PRIMER INGRESO: pedir nombre obligatorio (no se puede saltar) ──────────────
(function () {
  function initNamePrompt() {
    const prompt   = document.getElementById('name-prompt');
    const input    = document.getElementById('name-prompt-input');
    const btn      = document.getElementById('name-prompt-btn');
    const picWrap  = document.getElementById('name-prompt-pic-wrap');
    const picImg   = document.getElementById('name-prompt-pic');
    const picInput = document.getElementById('name-prompt-pic-input');
    if (!prompt || !input || !btn) return;
    if (localStorage.getItem('playerName')) return; // ya tiene nombre: no mostrar

    // Cambio de foto desde el modal
    if (picWrap && picInput && picImg) {
      picWrap.addEventListener('click', () => picInput.click());
      picInput.addEventListener('change', () => {
        const file = picInput.files[0];
        if (!file) return;
        resizeImageFile(file, (data) => {
          localStorage.setItem('profilePhoto', data);
          applyStoredProfilePic();
        });
      });
    }

    prompt.classList.add('visible');
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);

    function update() { btn.disabled = input.value.trim().length === 0; }
    input.addEventListener('input', update);
    update();

    function submit() {
      const limpio = input.value.trim().slice(0, 12);
      if (!limpio) return;
      if (typeof window.containsBadWord === 'function' && window.containsBadWord(limpio)) {
        if (typeof _flashBadWordInput === 'function') _flashBadWordInput(input);
        return;
      }
      localStorage.setItem('playerName', limpio);
      // Latido directo (sin freno) para invitados: confirmar con Enter no
      // dispara 'click' (el heartbeat genérico depende de eso), y aunque
      // confirme con el botón, un clic previo (ej. entrar al input) pudo
      // haber consumido el freno de 15s dejando este sin efecto — ver
      // guestPing en js/analytics.js.
      if (!window._sbUserId && window.Analytics && typeof window.Analytics.guestPing === 'function') {
        window.Analytics.guestPing();
      }
      const el = document.getElementById('loading-player-name');
      if (el) el.textContent = limpio;
      maybeAutoAssignPic(limpio);
      if (typeof refreshProfileStats === 'function') refreshProfileStats();
      try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {}
      prompt.classList.remove('visible');
      showWelcomePopup(limpio);
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    // Botón "¿Tienes cuenta?" — oculta el name-prompt, abre el modal de cuenta
    const accountBtn = document.getElementById('name-prompt-account-btn');
    const accountModal = document.getElementById('account-modal');
    if (accountBtn && accountModal) {
      accountBtn.addEventListener('click', () => {
        try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {}
        prompt.classList.remove('visible');
        prompt.style.display = 'none';
        if (typeof window.openAccountModal === 'function') window.openAccountModal();
        else accountModal.classList.add('open');

        const observer = new MutationObserver(() => {
          if (!accountModal.classList.contains('open')) {
            observer.disconnect();
            if (window._accountLoggedIn) {
              const loggedName = localStorage.getItem('playerName');
              if (loggedName) {
                const el = document.getElementById('loading-player-name');
                if (el) el.textContent = loggedName;
              }
            } else {
              prompt.classList.add('visible');
              prompt.style.display = '';
            }
          }
        });
        observer.observe(accountModal, { attributes: true, attributeFilter: ['class'] });
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNamePrompt);
  else initNamePrompt();
})();

function showWelcomePopup(nombre) {
  const popup    = document.getElementById('welcome-popup');
  const picEl    = document.getElementById('welcome-popup-pic');
  const nameEl   = document.getElementById('welcome-popup-name');
  const subEl    = document.getElementById('welcome-popup-sub');
  const confirmW = document.getElementById('welcome-popup-confirm');
  if (!popup) return;
  const src = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
  if (picEl)  picEl.src = src;
  if (nameEl) nameEl.textContent = (typeof t === 'function') ? t('name.greet', { name: nombre }) : `¡Hola, ${nombre}!`;
  if (subEl)  subEl.textContent  = (typeof t === 'function') ? t('name.greetSub') : 'Bienvenido a myGeoChallenge.';
  popup.classList.add('visible');
  if (confirmW) {
    const onClick = () => {
      try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {}
      confirmW.classList.add('confirm-pressed');
      setTimeout(() => {
        confirmW.classList.remove('confirm-pressed');
        popup.classList.remove('visible');
      }, 120);
      confirmW.removeEventListener('click', onClick);
    };
    confirmW.addEventListener('click', onClick);
  }
}

// Popup de bienvenida para cuentas Fundador (primeras 100), una sola vez —
// el paquete (frame/card/panel/cell 0002) NO está puesto de entrada, se
// entrega recién al confirmar acá (ver el onClick del botón). Se marca
// founder_popup_seen en Supabase al cerrar para que no vuelva a salir en
// otro dispositivo/navegador (ver _onSessionReady, que llama a esto cuando
// profile.is_founder && !profile.founder_popup_seen).
function showFounderWelcomePopup() {
  const popup    = document.getElementById('founder-popup');
  const confirmW = document.getElementById('founder-popup-confirm');
  if (!popup) return;
  const CA = window.CustomizeAssets;
  if (CA) {
    const frameImg = document.getElementById('founder-popup-frame-img');
    if (frameImg) frameImg.src = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    CA.applyFrame(document.getElementById('founder-popup-frame'), '0002');
    const cardSq = document.getElementById('founder-popup-card');
    if (cardSq) cardSq.style.backgroundImage = `url('${CA.cardUrl('0002')}')`;
    const panelSq = document.getElementById('founder-popup-panel');
    if (panelSq) panelSq.style.backgroundImage = `url('${CA.panelUrl('0002')}')`;
    const cellSq = document.getElementById('founder-popup-cell');
    if (cellSq) cellSq.style.backgroundImage = `url('${CA.cellUrl('0002')}')`;
  }
  popup.classList.add('visible');
  if (confirmW) {
    const onClick = () => {
      try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {}
      confirmW.classList.add('confirm-pressed');
      setTimeout(() => {
        confirmW.classList.remove('confirm-pressed');
        popup.classList.remove('visible');
      }, 120);
      confirmW.removeEventListener('click', onClick);
      // Acá solo se DESBLOQUEA (aparece seleccionable en Personalización,
      // ver isFounder en _renderGrid) — no se equipa nada solo. El jugador
      // elige ponérselo o no como cualquier otro ítem del catálogo.
      // sbClaimFounderPack (RPC atómico), NO sbUpdateProfile directo: hay un
      // trigger en la base que bloquea en silencio cualquier UPDATE de
      // is_founder/founder_popup_seen que no pase por ese RPC — y además es
      // el que lleva la cuenta de "primeros 100 reclamos" y cierra la
      // elegibilidad del resto al llegar al cupo.
      if (window._sbProfile) window._sbProfile.founder_popup_seen = true;
      if (window._sbUserId && typeof window.sbClaimFounderPack === 'function') {
        window.sbClaimFounderPack(window._sbUserId).catch(() => {});
      }
    };
    confirmW.addEventListener('click', onClick);
  }
}
window.showFounderWelcomePopup = showFounderWelcomePopup;

function _updateProfileBtnLabel() {
  const el = document.getElementById('profile-btn-label');
  if (!el) return;
  if (window._accountLoggedIn) {
    el.textContent = (window._sbProfile?.username) || localStorage.getItem('playerName') || '';
  } else {
    el.textContent = t('nav.account');
  }
}

document.getElementById('loading-profile-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('loading-table-group')?.classList.remove('table-gone');
  document.getElementById('loading-screen').classList.add('table-shown');
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
});
