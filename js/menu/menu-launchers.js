// ============================================================================
// menu/menu-launchers.js — listeners de los botones de navegación del loading
// screen: lanzar Ciudades / GlobeQuiz (+ su power/quit), abrir results, panel 2
// ("Un jugador": World Tour / Versus / Práctica / back), confirm de play, abrir
// el panel Social. Extraído de monuments.js (fase 20). Todo son listeners; el
// cuerpo corre en runtime usando módulos ya cargados (_setPlaying, startCampaign,
// loadSocialData, swapHowtoVideo, i18n, audio...).
// ============================================================================

document.getElementById('loading-play-btn').addEventListener('click', () => {
  window._autoDismissVsInvites?.();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  window._setPlaying(true);
  window.pendingGameMode = 'game';
  // Avisar a un posible espectador que entramos a las instrucciones de este
  // modo — ver comentario largo (con la explicación del defer a microtask)
  // en el mismo punto de flags.js. Cities todavía no tiene UI real de
  // espectador (REAL_UI_MODES no lo lista), así que esto solo evita que se
  // quede viendo la pantalla de "Conectando..." trabada — no podrá ver la
  // ronda en sí hasta que se integre ese modo.
  Promise.resolve().then(() => {
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: 'game' });
  });
  window.resetSplashEntry?.();
  // Transición visual inmediata — ocultar loading y mostrar splash en este frame
  document.getElementById('loading-screen').style.display = 'none';
  const splashElCity = document.getElementById('splash-screen');
  splashElCity.style.display = 'flex';
  window.showSplashConfirm();
  const animElsCity = splashElCity.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animElsCity.forEach(el => el.classList.remove('animate-in'));
  void splashElCity.offsetWidth;
  animElsCity.forEach(el => el.classList.add('animate-in'));
  playMusic(sfxPregame);
  // Setup no visual diferido al siguiente frame para no bloquear la transición
  requestAnimationFrame(() => {
    document.getElementById('splash-screen').classList.remove('mode-flags', 'mode-shapes', 'mode-monuments');
    document.getElementById('gameover-screen').classList.remove('mode-flags', 'mode-shapes', 'mode-monuments');
    document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
    document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
    document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
    document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
    document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women1.png');
    document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women1.png');
    document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level3complete.png');
    document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check3.png');
    document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong3.png');
    window.swapHowtoVideo('images/howtoplay/howtoplay3.mp4');
    const howtoTitleCity = document.querySelector('.splash-howtoplay-title');
    if (howtoTitleCity) howtoTitleCity.textContent = 'City Blitz';
    const label = document.querySelector('.splash-text2-label');
    { const _pk = (window.practiceConfig && window.practiceConfig.active) ? 'splash.practice.cities.1' : 'splash.cities.1'; if (label) { label.textContent = t(_pk); label.classList.remove('step2'); } }
  });
});

// ── preloadNextModeAssets / campaña (window.campaign, campaignBase,
//    _commitCampaignHighscores) → js/core/campaign.js (fase 9)

document.getElementById('loading-results-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('loading-screen').style.display = 'none';
  if (typeof showResultsScreen === 'function') showResultsScreen();
});

document.getElementById('loading-play-single')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  [
    document.getElementById('loading-actions'),
    document.getElementById('loading-version'),
    document.querySelector('.loading-plane-wrap'),
    document.getElementById('profile-account-btn'),
    document.getElementById('globequiz-btn'),
    document.getElementById('loading-messages-btn'),
  ].forEach(el => { if (el) el.style.display = 'none'; });
  const lg = document.querySelector('.loading-logo');
  if (lg) {
    lg.getAnimations().forEach(a => a.cancel());
    lg.classList.add('logo-ready', 'panel2-logo');
  }
  const back = document.getElementById('loading-panel2-back');
  if (back) back.style.display = 'block';
  const wt = document.getElementById('loading-panel2-worldtour');
  if (wt) wt.style.display = 'block';
  const vs = document.getElementById('loading-panel2-versus');
  if (vs) vs.style.display = 'block';
  const pr = document.getElementById('loading-panel2-practice');
  if (pr) pr.style.display = 'block';
  const t2 = document.getElementById('loading-panel2-text2');
  if (t2) t2.style.display = 'block';
});

document.getElementById('globequiz-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  // Gate: GlobeQuiz requiere cuenta, y con cuenta requiere haber completado
  // al menos 1 Gira Mundial alguna vez (ver el incremento de
  // campaigns_completed al terminar la campaña, más arriba en este archivo).
  if (!window._accountLoggedIn || !window._sbUserId) {
    const textEl = document.getElementById('globequiz-locked-text');
    if (textEl) { textEl.setAttribute('data-i18n', 'globequiz.lockedNoAccount'); textEl.textContent = t('globequiz.lockedNoAccount'); }
    const popup = document.getElementById('globequiz-locked-popup');
    if (popup) popup.style.display = 'flex';
    return;
  }
  if (!((window._sbProfile && window._sbProfile.campaigns_completed) || 0)) {
    const textEl = document.getElementById('globequiz-locked-text');
    if (textEl) { textEl.setAttribute('data-i18n', 'globequiz.lockedNoCampaign'); textEl.textContent = t('globequiz.lockedNoCampaign'); }
    const popup = document.getElementById('globequiz-locked-popup');
    if (popup) popup.style.display = 'flex';
    return;
  }
  if (typeof window.preloadGlobeQuiz === 'function') window.preloadGlobeQuiz();
  [
    document.getElementById('loading-actions'),
    document.getElementById('loading-version'),
    document.querySelector('.loading-plane-wrap'),
    document.getElementById('profile-account-btn'),
    document.getElementById('globequiz-btn'),
    document.getElementById('loading-messages-btn'),
  ].forEach(el => { if (el) el.style.display = 'none'; });
  const lg = document.querySelector('.loading-logo');
  if (lg) {
    lg.getAnimations().forEach(a => a.cancel());
    lg.classList.add('logo-ready', 'panel2-logo');
  }
  const back = document.getElementById('loading-panel2-back');
  if (back) back.style.display = 'block';
  const t2 = document.getElementById('loading-globequiz-text2');
  if (t2) t2.style.display = 'block';
  const gqDesc = document.getElementById('loading-globequiz-desc');
  const gqCountdown = document.getElementById('loading-globequiz-countdown');
  // Si ya jugó hoy, la burbuja de saludo Y la descripción avisan que vuelva
  // mañana en vez de invitarlo a buscar el país (igual puede jugar de nuevo,
  // solo no suma racha) — y ahí recién aparece el countdown a "nuevo día".
  // Si NO jugó hoy, ambas quedan con su texto normal de invitación y el
  // countdown ni se muestra (no tiene sentido mostrarlo si todavía puede
  // sumar la racha de hoy jugando).
  if (gqCountdown) gqCountdown.style.display = 'none';
  if (typeof window.gqHasPlayedToday === 'function') {
    const played = window.gqHasPlayedToday();
    const g1 = t2 ? t2.querySelector('[data-i18n="panel2.globequizGreet1"]') : null;
    const g2 = t2 ? t2.querySelector('[data-i18n="panel2.globequizGreet2"]') : null;
    if (g1 && g2) {
      if (played) {
        g1.setAttribute('data-i18n', 'panel2.globequizGreetPlayed1');
        g1.textContent = t('panel2.globequizGreetPlayed1');
        g2.setAttribute('data-i18n', 'panel2.globequizGreetPlayed2');
        g2.textContent = t('panel2.globequizGreetPlayed2');
      } else {
        g1.setAttribute('data-i18n', 'panel2.globequizGreet1');
        g1.textContent = t('panel2.globequizGreet1');
        g2.setAttribute('data-i18n', 'panel2.globequizGreet2');
        g2.textContent = t('panel2.globequizGreet2');
      }
    }
    if (gqDesc) {
      const descKey = played ? 'panel2.globequizDescPlayed' : 'panel2.globequizDesc';
      gqDesc.setAttribute('data-i18n', descKey);
      gqDesc.textContent = t(descKey);
    }
    if (played && gqCountdown) {
      gqCountdown.style.display = 'block';
      if (typeof window.startGlobeQuizMenuCountdown === 'function') window.startGlobeQuizMenuCountdown();
    }
  }
  const gqTable = document.getElementById('loading-globequiz-table');
  if (gqTable) gqTable.style.display = 'block';
  const gqTitle = document.getElementById('loading-globequiz-title');
  if (gqTitle) gqTitle.style.display = 'block';
  const gqGlobe = document.getElementById('loading-globequiz-globe');
  if (gqGlobe) gqGlobe.style.display = 'block';
  if (gqDesc) gqDesc.style.display = 'block';
  const gqPlay = document.getElementById('loading-globequiz-play-wrap');
  if (gqPlay) gqPlay.style.display = 'block';
});

document.getElementById('globequiz-locked-ok')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  const popup = document.getElementById('globequiz-locked-popup');
  if (popup) popup.style.display = 'none';
});

document.getElementById('loading-globequiz-play-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (typeof window.stopGlobeQuizMenuCountdown === 'function') window.stopGlobeQuizMenuCountdown();
  document.getElementById('loading-screen').style.display = 'none';
  const gqScreen = document.getElementById('globequiz-screen');
  if (gqScreen) gqScreen.style.display = 'block';
  if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
  if (typeof window.initGlobeQuiz === 'function') window.initGlobeQuiz();
});

document.getElementById('gq-power-btn')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  const popup = document.getElementById('gq-quit-popup');
  if (popup) popup.style.display = 'flex';
});

document.getElementById('gq-quit-cancel')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  const popup = document.getElementById('gq-quit-popup');
  if (popup) popup.style.display = 'none';
});

document.getElementById('gq-quit-confirm')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  // VS 1v1: a diferencia de flags/cities/monuments (que salen por
  // quitToMenu(), ver línea ~4642 más abajo, y ESA sí llama _vsAbandon()),
  // este botón tiene su propia secuencia de salida manual que nunca pasaba
  // por ahí — quien abandonaba un duelo de GlobeQuiz volvía al menú sin
  // avisarle nada al rival, que se quedaba esperando para siempre (el
  // reportado: "no reconoce cuando alguien se va de la partida"). Mismo
  // criterio que el resto de los modos: avisar el abandono ANTES de
  // desmontar la UI.
  if (window._vsActive && typeof window._vsAbandon === 'function') {
    try { window._vsAbandon(); } catch (e) {}
  }
  window._setPlaying(false);
  // Cortar TODO lo de GlobeQuiz (timer, rotación automática, música/sfx) —
  // mismo criterio que quitToMenu() para los demás modos.
  if (typeof window.stopGlobeQuizTimer === 'function') window.stopGlobeQuizTimer();
  if (typeof window.stopGlobeQuizAutoRotate === 'function') window.stopGlobeQuizAutoRotate();
  if (typeof window.stopGlobeQuizInertia === 'function') window.stopGlobeQuizInertia();
  if (typeof window.stopGlobeQuizCountdown === 'function') window.stopGlobeQuizCountdown();
  if (typeof window.stopGlobeQuizEndgameTimer === 'function') window.stopGlobeQuizEndgameTimer();
  if (typeof window.stopGlobeQuizEndgameCountdown === 'function') window.stopGlobeQuizEndgameCountdown();
  const gqEndgameModalEl = document.getElementById('gq-endgame-modal');
  if (gqEndgameModalEl) gqEndgameModalEl.style.display = 'none';
  // playMusic(null) corta también el AudioBufferSourceNode de iOS (Web Audio),
  // que sigue sonando si solo se pausa el <audio> HTML — mismo motivo que en
  // el submitGuess() de globequiz.js. sfxBonus es un sfx normal, no música,
  // así que a ese sí alcanza con pausarlo directo.
  if (typeof playMusic === 'function') playMusic(null);
  try { if (sfxBonus) { sfxBonus.pause(); sfxBonus.currentTime = 0; } } catch (e) {}
  const popup = document.getElementById('gq-quit-popup');
  if (popup) popup.style.display = 'none';
  const gqScreen = document.getElementById('globequiz-screen');
  if (gqScreen) gqScreen.style.display = 'none';
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen')?.classList.remove('table-shown');
  // Ocultar el panel de GlobeQuiz del menú (texto/mesa/título/globo/desc/
  // jugar) — sin esto quedaba mostrándose ENCIMA del menú principal al
  // volver, porque resetEntranceElements()/replayEntranceAnimations() no
  // conocen estos elementos (son específicos de este panel, ver el handler
  // de loading-panel2-back más abajo, que hace lo mismo para ese caso).
  ['loading-globequiz-text2', 'loading-globequiz-table', 'loading-globequiz-title',
   'loading-globequiz-globe', 'loading-globequiz-desc', 'loading-globequiz-countdown', 'loading-globequiz-play-wrap']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  if (typeof window.stopGlobeQuizMenuCountdown === 'function') window.stopGlobeQuizMenuCountdown();
  // Volver al MENÚ PRINCIPAL (panel1) con la MISMA animación de entrada que
  // usa quitToMenu() en el resto de los modos, no un salto abrupto.
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  // Y la música vuelve al loop del menú, como corresponde.
  if (typeof window.startMenuMusic === 'function') window.startMenuMusic();
  else if (typeof playMusic === 'function') playMusic(sfxMenuMusic);
});

document.getElementById('loading-panel2-back')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('loading-panel2-back').style.display = 'none';
  const wt = document.getElementById('loading-panel2-worldtour');
  if (wt) wt.style.display = 'none';
  const vsb = document.getElementById('loading-panel2-versus');
  if (vsb) vsb.style.display = 'none';
  const prb = document.getElementById('loading-panel2-practice');
  if (prb) prb.style.display = 'none';
  const t2b = document.getElementById('loading-panel2-text2');
  if (t2b) t2b.style.display = 'none';
  const gqt2b = document.getElementById('loading-globequiz-text2');
  if (gqt2b) gqt2b.style.display = 'none';
  const gqTableB = document.getElementById('loading-globequiz-table');
  if (gqTableB) gqTableB.style.display = 'none';
  const gqTitleB = document.getElementById('loading-globequiz-title');
  if (gqTitleB) gqTitleB.style.display = 'none';
  const gqGlobeB = document.getElementById('loading-globequiz-globe');
  if (gqGlobeB) gqGlobeB.style.display = 'none';
  const gqDescB = document.getElementById('loading-globequiz-desc');
  if (gqDescB) gqDescB.style.display = 'none';
  const gqCountdownB = document.getElementById('loading-globequiz-countdown');
  if (gqCountdownB) gqCountdownB.style.display = 'none';
  if (typeof window.stopGlobeQuizMenuCountdown === 'function') window.stopGlobeQuizMenuCountdown();
  const gqPlayB = document.getElementById('loading-globequiz-play-wrap');
  if (gqPlayB) gqPlayB.style.display = 'none';
  const lgBack = document.querySelector('.loading-logo');
  if (lgBack) {
    lgBack.style.transition = 'none';
    lgBack.classList.remove('panel2-logo');
    requestAnimationFrame(() => { lgBack.style.transition = ''; });
  }
  const actions = document.getElementById('loading-actions');
  if (actions) actions.style.display = 'flex';
  const ver = document.getElementById('loading-version');
  if (ver) ver.style.display = '';
  const acct = document.getElementById('profile-account-btn');
  if (acct) acct.style.display = 'block';
  const gq = document.getElementById('globequiz-btn');
  if (gq) gq.style.display = 'block';
  const msgsBtn = document.getElementById('loading-messages-btn');
  if (msgsBtn) msgsBtn.style.display = 'block';
  const pw = document.querySelector('.loading-plane-wrap');
  if (pw) { pw.style.display = ''; pw.style.opacity = '1'; pw.style.transform = 'translate(-50%,-50%) translateY(0)'; pw.classList.add('plane-above'); }
  const lg = document.querySelector('.loading-logo');
  if (lg) { lg.style.display = ''; lg.style.opacity = '1'; lg.style.transform = 'translateX(-50%) scale(1)'; }
});

document.getElementById('loading-panel2-worldtour')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (window._lobbyCountingDown) {
    window.showGlobalToast(t('lobby.cdBlocked'));
    return;
  }
  window.startCampaign();
});

// ── startCampaign → js/core/campaign.js (fase 9)

// ── Modal de cuenta / name-prompt / foto de perfil / _onSessionReady /
//    welcome popups / _updateProfileBtnLabel → js/profile/profile-account.js (fase 4)


document.getElementById('loading-play-confirm-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-play-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  const screen = document.getElementById('loading-screen');
  const tableGroup = document.getElementById('loading-table-group');
  tableGroup.classList.add('table-gone');
  screen.classList.remove('table-shown');
  setTimeout(() => tableGroup.classList.remove('above-rankings'), 400);
});



// ── Realtime social (canales de amigos/friendships + polls + badge)
//    → js/social/social-realtime.js (fase 5)


document.getElementById('loading-social-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (!window._accountLoggedIn) {
    document.getElementById('social-lock-popup')?.classList.add('open');
    return;
  }
  document.getElementById('loading-social-group')?.classList.remove('table-gone');
  document.getElementById('loading-screen').classList.add('table-shown');
  // Ocultar badge y notificación de solicitud al entrar al panel
  const badge = document.getElementById('social-notif-badge');
  if (badge) badge.style.display = 'none';
  _dismissFriendRequestNotif();
  loadSocialData();
});
