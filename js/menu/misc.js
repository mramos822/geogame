// ============================================================================
// menu/misc.js — loose global-UI IIFEs: Social panel "account required" popup,
// fullscreen button (with iOS toast), loading-screen zoom/scroll lock,
// screen-too-small warning, and the test hook to open the results screen.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// ── Social panel "account required" popup ────────────────────────────────────
(function () {
  const popup = document.getElementById('social-lock-popup');
  document.getElementById('social-lock-close')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    popup?.classList.remove('open');
  });
  document.getElementById('social-lock-login')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    popup?.classList.remove('open');
    // Open the account modal straight to the login view
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

  // Prefixed fallbacks (Opera, Safari): not all expose the unprefixed API.
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
    // Fullscreen the whole page (the centered stage fills it). In Opera the API
    // usually needs the webkit prefix; without it the button did nothing.
    if (!fsElement()) {
      requestFs(document.documentElement);
    } else {
      exitFs();
    }
  });
})();

// ── LOCK LOADING SCREEN ZOOM & POSITION ───────────────────────────────────────
// DISABLED: the fixed-aspect #app-stage already handles scaling/position. This
// block set inline width/height/transform on loading-screen on every
// visualViewport resize (= innerWidth), throwing off everything inside the stage.
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
    // Used to show Spanish and English at once, hardcoded. Now a single
    // language, the game's current one — re-applied if the player switches
    // language live (see onLangChange, js/i18n.js) without reloading.
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
