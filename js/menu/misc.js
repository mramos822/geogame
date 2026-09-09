// ============================================================================
// menu/misc.js — IIFEs sueltos de UI global: popup "necesitás cuenta" del panel
// Social, botón de pantalla completa (con toast iOS), lock de zoom/scroll del
// loading screen, aviso de pantalla muy chica, y el hook de test para abrir la
// pantalla de results desde el loading. Extraído de monuments.js (fase 20).
// ============================================================================

// ── Popup "necesitás cuenta" del panel Social ────────────────────────────────
(function () {
  const popup = document.getElementById('social-lock-popup');
  document.getElementById('social-lock-close')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    popup?.classList.remove('open');
  });
  document.getElementById('social-lock-login')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    popup?.classList.remove('open');
    // Abre el modal de cuenta directo en la vista de login
    const accountModal = document.getElementById('account-modal');
    const viewLogin    = document.getElementById('account-view-login');
    if (accountModal && viewLogin) {
      ['account-view-main','account-view-login','account-view-register','account-view-loading','account-view-verify','account-view-welcome']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      viewLogin.style.display = 'flex';
      accountModal.classList.add('open');
    }
  });
})();


// ── FULLSCREEN ────────────────────────────────────────────────────────────────
(function () {
  const btn = document.getElementById('fs-btn');
  if (!btn) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true;

  function showIOSToast() {
    let toast = document.getElementById('ios-fs-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ios-fs-toast';
      toast.style.cssText = 'position:fixed;bottom:12%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#fff;font-family:sans-serif;font-size:14px;padding:12px 18px;border-radius:12px;z-index:99999;text-align:center;pointer-events:none;transition:opacity 0.4s;white-space:nowrap;';
      toast.innerHTML = 'Toca <b>Compartir</b> → <b>Añadir a inicio</b> para pantalla completa';
      document.body.appendChild(toast);
    }
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
  }

  // Fallbacks con prefijo (Opera, Safari): no todos exponen la API sin prefijo.
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function requestFs(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
    if (fn) { try { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }
  function exitFs() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) { try { const p = fn.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }

  function updateIcon() {
    btn.textContent = fsElement() ? '✕' : '⛶';
  }
  document.addEventListener('fullscreenchange', updateIcon);
  document.addEventListener('webkitfullscreenchange', updateIcon);

  btn.addEventListener('click', () => {
    if (isIOS) {
      if (!isStandalone) showIOSToast();
      return;
    }
    // Pantalla completa de la página entera (el stage centrado la rellena). En Opera
    // la API suele requerir el prefijo webkit; sin él, el botón no hacía nada.
    if (!fsElement()) {
      requestFs(document.documentElement);
    } else {
      exitFs();
    }
  });
})();

// ── LOCK LOADING SCREEN ZOOM & POSITION ───────────────────────────────────────
// DESACTIVADO: el #app-stage de aspecto fijo ya maneja el escalado/posición. Este
// bloque ponía width/height/transform inline al loading-screen en cada resize del
// visualViewport (= innerWidth), descuadrando todo dentro del stage.
(function () {
  return;
  const el = document.getElementById('loading-screen');
  if (!el || !window.visualViewport) return;
  const vp = window.visualViewport;
  function fix() {
    const s = 1 / vp.scale;
    el.style.left   = vp.offsetLeft + 'px';
    el.style.top    = vp.offsetTop  + 'px';
    el.style.width  = (vp.width  * vp.scale) + 'px';
    el.style.height = (vp.height * vp.scale) + 'px';
    el.style.transform = `scale(${s})`;
  }
  vp.addEventListener('resize', fix);
  vp.addEventListener('scroll', fix);
})();

// ── SCREEN WARNING ────────────────────────────────────────────────────────────
(function () {
  const warning  = document.getElementById('screen-warning');
  const isMobile = navigator.maxTouchPoints > 1;
  const MIN_W = 320, MIN_H = 220, MAX_RATIO = 2.8;

  if (isMobile) {
    document.body.classList.add('is-mobile');
    const icon = document.getElementById('screen-warning-icon');
    const msg  = document.getElementById('screen-warning-msg');
    const sub  = document.getElementById('screen-warning-sub');
    if (icon) icon.textContent = '📱';
    // Antes mostraba español e inglés a la vez, fijo. Ahora un solo idioma,
    // el actual del juego — y se re-aplica solo si el jugador cambia de
    // idioma en caliente (ver onLangChange, js/i18n.js) sin recargar.
    const applyRotateMsg = () => {
      if (msg) msg.textContent = (typeof t === 'function') ? t('screen.rotate') : 'Rotá el teléfono a horizontal para jugar.';
      if (sub) sub.textContent = '';
    };
    applyRotateMsg();
    if (typeof onLangChange === 'function') onLangChange(applyRotateMsg);
  }

  function check() {
    const vp = window.visualViewport;
    const w  = vp ? vp.width  : window.innerWidth;
    const h  = vp ? vp.height : window.innerHeight;
    let show = false;
    if (isMobile) {
      show = w < h;
    } else {
      show = w < MIN_W || h < MIN_H || w / h > MAX_RATIO || w / h < 1 / MAX_RATIO;
    }
    warning.classList.toggle('visible', show);
  }

  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => setTimeout(check, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', check);
  check();
})();

// ── TEST: open gameover screen from loading ───────────────────────────────────
(function () {
  const wrap = document.querySelector('.test-confirm-wrap');
  if (!wrap) return;
  wrap.addEventListener('click', () => {
    if (confirmCooldown) return;
    confirmCooldownLock();
    const a = new Audio('sfx/check.mp3'); a.volume = isMuted ? 0 : 1; a.muted = isMuted; a.play();
    wrap.classList.add('confirm-pressed');
    setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
    document.getElementById('loading-screen').style.display = 'none';
    if (typeof showResultsScreen === 'function') showResultsScreen();
  });
  wrap.addEventListener('mouseenter', playSelect);
  wrap.addEventListener('mouseleave', playSelect);
})();
