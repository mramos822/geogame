// ============================================================================
// menu/entrance-anim.js — animaciones de entrada/salida del loading screen
// (avión, azafata, sombra, logo, planeta), reset al volver de una partida,
// versión estática para el panel 2 de práctica, y el efecto universal de
// "se acabó el tiempo" sobre una cartilla del leaderboard.
// Extraído de monuments.js (fase 7). Todo son window.* — sin estado propio.
// ============================================================================

// Efecto UNIVERSAL de "se acabó el tiempo" sobre una cartilla del leaderboard:
// temblorcito (reusa lb-shake, el mismo del efecto de "wrong") + un ícono de
// cronómetro encima que hace fade in y fade out unos segundos después. Recibe
// el elemento de la cartilla ya resuelto — cada contexto (versus 1v1/grupo,
// espectador 1v1/grupo) lo llama con la celda del jugador que se quedó sin
// tiempo, igual que el emote de "wrong" pero disparado por el timesup.
window._applyTimesUpEffect = function (el) {
  if (!el) return;
  el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'lb-shake 0.45s ease-in-out';
  setTimeout(() => { if (el.style.animation && el.style.animation.indexOf('lb-shake') !== -1) el.style.animation = ''; }, 480);
  const prev = el.querySelector('.lb-timesup-icon');
  if (prev) { clearTimeout(prev._t1); clearTimeout(prev._t2); prev.remove(); }
  const icon = document.createElement('div');
  icon.className = 'lb-timesup-icon';
  icon.textContent = '⏱️';
  el.appendChild(icon);
  requestAnimationFrame(() => icon.classList.add('show'));
  icon._t1 = setTimeout(() => {
    icon.classList.remove('show');
    icon._t2 = setTimeout(() => { icon.remove(); }, 400);
  }, 2400);
};

window.resetEntranceElements = function () {
  // Cancelar cualquier timer pendiente de hidePracticePanel para evitar race conditions
  if (typeof _hidePracticeTimer !== 'undefined') { clearTimeout(_hidePracticeTimer); _hidePracticeTimer = null; }
  const fa = document.querySelector('.flightatt-loading');
  const sh = document.querySelector('.flightatt-loading-shadow');
  const pw = document.querySelector('.loading-plane-wrap');
  const lg = document.querySelector('.loading-logo');
  const pl = document.querySelector('.loading-planet-wrap');
  [fa, sh, pw, lg, pl].forEach(el => el && el.getAnimations().forEach(a => a.cancel()));
  if (fa) { fa.classList.remove('entered');               fa.style.transform = 'translate(-50%,-50%) scaleX(-1) translateX(55cqmin)'; }
  if (sh) { sh.classList.remove('entered');               sh.style.transform = 'translate(-50%,-50%) translateX(-55cqmin)'; }
  if (pw) { pw.classList.remove('plane-ready','plane-above'); pw.style.transform = 'translate(-50%,-50%) translateY(32cqmin)'; pw.style.display = ''; }
  if (lg) { lg.classList.remove('logo-ready','panel2-logo'); lg.style.opacity = '0'; lg.style.transform = 'translateX(-50%) scale(1.5)'; lg.style.display = ''; }
  if (pl) { pl.classList.remove('planet-ready');          pl.style.opacity = '0'; pl.style.transform = 'translateX(-50%) scale(1.25)'; }
  // Restaurar elementos del primer panel que pudo haber ocultado el Play
  const ver = document.getElementById('loading-version');
  if (ver) ver.style.display = '';
  const back2 = document.getElementById('loading-panel2-back');
  if (back2) back2.style.display = 'none';
  const wt2 = document.getElementById('loading-panel2-worldtour');
  if (wt2) wt2.style.display = 'none';
  const vs2 = document.getElementById('loading-panel2-versus');
  if (vs2) vs2.style.display = 'none';
  const pr2 = document.getElementById('loading-panel2-practice');
  if (pr2) pr2.style.display = 'none';
  const t2r = document.getElementById('loading-panel2-text2');
  if (t2r) t2r.style.display = 'none';
  const lpg = document.getElementById('loading-practice-group');
  if (lpg) lpg.style.display = 'none';
  // Cerrar cualquier sub-panel que haya quedado abierto (profile, social, amigos…)
  ['loading-table-group','loading-social-group','loading-friend-group',
   'loading-addfriend-group','loading-blocked-group','loading-sent-group']
    .forEach(id => document.getElementById(id)?.classList.add('table-gone'));
  document.getElementById('loading-screen')?.classList.remove('table-shown');
  if (typeof window.hideVersusPanel === 'function') window.hideVersusPanel();
};

// Muestra el loading en el panel2 de práctica sin animar (retorno desde práctica)
window.showEntranceElementsStatic = function () {
  const fa = document.querySelector('.flightatt-loading');
  const sh = document.querySelector('.flightatt-loading-shadow');
  const pw = document.querySelector('.loading-plane-wrap');
  const lg = document.querySelector('.loading-logo');
  const pl = document.querySelector('.loading-planet-wrap');

  [fa, sh, pw, lg, pl].forEach(el => el && el.getAnimations().forEach(a => a.cancel()));

  // Flightatt y sombra: posición final visible (panel2 las muestra)
  if (fa) { fa.style.transform = 'translate(-50%,-50%) scaleX(-1) translateX(0)'; fa.style.opacity = ''; }
  if (sh) { sh.style.transform = 'translate(-50%,-50%) translateX(0)'; sh.style.opacity = ''; }
  // Avión y logo: invisibles con opacity (display queda '', así back-button los restaura sin luchar con display:none)
  if (pw) { pw.style.display = ''; pw.style.opacity = '0'; pw.style.transform = 'translate(-50%,-50%) translateY(32cqmin)'; }
  if (lg) { lg.style.display = ''; lg.style.opacity = '0'; lg.style.transform = 'translateX(-50%) scale(1.5)'; }
  // Planeta visible
  if (pl) { pl.style.transform = 'translateX(-50%) scale(1)'; pl.style.opacity = '1'; }

  const ver = document.getElementById('loading-version');
  if (ver) ver.style.display = '';

  // Ocultar acciones panel1; mostrar panel2 directamente
  document.getElementById('loading-actions') && (document.getElementById('loading-actions').style.display = 'none');
  const back2 = document.getElementById('loading-panel2-back');
  if (back2) back2.style.display = '';
  const wt2 = document.getElementById('loading-panel2-worldtour');
  if (wt2) wt2.style.display = '';
  const vs2s = document.getElementById('loading-panel2-versus');
  if (vs2s) vs2s.style.display = '';
  const pr2 = document.getElementById('loading-panel2-practice');
  if (pr2) pr2.style.display = '';
  const t2r = document.getElementById('loading-panel2-text2');
  if (t2r) t2r.style.display = '';

  // account-btn solo en panel1 — ocultarlo en panel2
  const acct = document.getElementById('profile-account-btn');
  if (acct) acct.style.display = 'none';
  const gq = document.getElementById('globequiz-btn');
  if (gq) gq.style.display = 'none';
  const msgsBtn = document.getElementById('loading-messages-btn');
  if (msgsBtn) msgsBtn.style.display = 'none';
  const resultsBtn = document.getElementById('loading-results-btn');
  if (resultsBtn) resultsBtn.style.display = 'none';
};

window.replayEntranceAnimations = function () {
  const flightEl   = document.querySelector('.flightatt-loading');
  const shadowEl   = document.querySelector('.flightatt-loading-shadow');
  const planeWrap  = document.querySelector('.loading-plane-wrap');
  const logo       = document.querySelector('.loading-logo');
  const planetWrap = document.querySelector('.loading-planet-wrap');

  if (planeWrap) planeWrap.classList.remove('plane-above');

  // Restaurar display (puede haber quedado none por showEntranceElementsStatic)
  if (planeWrap) planeWrap.style.display = '';
  if (logo) logo.style.display = '';

  // Limpiar inline styles del reset de quitToMenu; WAAPI toma el control desde from
  [flightEl, shadowEl, planeWrap, logo, planetWrap].forEach(el => {
    if (!el) return;
    el.style.transform = '';
    el.style.opacity   = '';
  });

  const opts700 = { duration: 700, easing: 'ease-out', fill: 'forwards' };
  const opts500 = { duration: 500, easing: 'ease-out', fill: 'forwards' };

  if (flightEl) flightEl.animate([
    { transform: 'translate(-50%,-50%) scaleX(-1) translateX(55cqmin)' },
    { transform: 'translate(-50%,-50%) scaleX(-1) translateX(0)' }
  ], opts700);

  if (shadowEl) shadowEl.animate([
    { transform: 'translate(-50%,-50%) translateX(-55cqmin)' },
    { transform: 'translate(-50%,-50%) translateX(0)' }
  ], opts700);

  if (planeWrap) {
    const anim = planeWrap.animate([
      { transform: 'translate(-50%,-50%) translateY(32cqmin)' },
      { transform: 'translate(-50%,-50%) translateY(0)' }
    ], opts700);
    anim.onfinish = () => planeWrap.classList.add('plane-above');
  }

  if (logo) logo.animate([
    { transform: 'translateX(-50%) scale(1.5)', opacity: '0' },
    { transform: 'translateX(-50%) scale(1)',   opacity: '1' }
  ], opts700);

  if (planetWrap) planetWrap.animate([
    { transform: 'translateX(-50%) scale(1.25)', opacity: '0' },
    { transform: 'translateX(-50%) scale(1)',    opacity: '1' }
  ], opts500);

  const resultsBtn = document.getElementById('loading-results-btn');
  if (resultsBtn) resultsBtn.style.display = 'block';

  // Restaurar elementos del primer panel (pueden haber quedado ocultos por el panel2)
  const actions = document.getElementById('loading-actions');
  if (actions) actions.style.display = 'flex';
  const acct = document.getElementById('profile-account-btn');
  if (acct) acct.style.display = 'block';
  const gq = document.getElementById('globequiz-btn');
  if (gq) gq.style.display = 'block';
  const msgsBtn = document.getElementById('loading-messages-btn');
  if (msgsBtn) msgsBtn.style.display = 'block';
  if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
  const ver = document.getElementById('loading-version');
  if (ver) ver.style.display = '';
};
