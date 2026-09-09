// ============================================================================
// modes/mapgame-misc.js — misceláneos de los modos de mapa (Ciudades/Monumentos):
// confirmStep/confirmCooldown + handlers de los botones "confirm" del splash
// (pre-partida) y del gameover (avanzar de modo / campaña / results), y las
// animaciones frame-by-frame de la azafata (loading, splash y la ingame
// restartFlightAtt). Extraído de monuments.js (fase 16). Carga tras
// mapgame-play.js; usa startGame/resetState/pendingGameMode/campaign... en runtime.
// ============================================================================

let confirmStep = 0;
let confirmCooldown = false;
function confirmCooldownLock() {
  confirmCooldown = true;
  setTimeout(() => { confirmCooldown = false; }, 600);
}

document.querySelector('.splash-confirm-wrap')?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.querySelector('.splash-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  if (confirmStep === 0) {
    const label = document.querySelector('.splash-text2-label');
    if (window.pendingGameMode === 'flags') {
      if (label) { label.textContent = t('splash.flags.2'); label.classList.add('step2'); }
    } else if (window.pendingGameMode === 'shapes') {
      if (label) { label.textContent = t('splash.shapes.2'); label.classList.add('step2'); }
    } else if (window.pendingGameMode === 'monuments') {
      if (label) { label.textContent = t('splash.monuments.2'); label.classList.add('step2'); }
    } else {
      if (label) { label.textContent = t('splash.cities.2'); label.classList.add('step2'); }
    }
    const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
    if (howtoWrap) howtoWrap.classList.add('slide-down');
    // Chrome-iOS: nunca decodificar el video (ver IS_CHROME_IOS) — se queda
    // en el poster estático que le puso swapHowtoVideo.
    if (!IS_CHROME_IOS) {
      const howtoVideo = document.querySelector('.splash-howtoplay-video');
      if (howtoVideo) howtoVideo.play();
    }
    confirmStep = 1;
    window.waitForHowtoVideo();
    // Avisar a un posible espectador que este primer confirm ya se apretó —
    // sin esto, el mirror de instrucciones del espectador (ver
    // _showSplashMirror en spectate.js) se quedaba siempre pegado en el
    // texto/video del paso 1, aunque el jugador real ya hubiera avanzado al
    // paso 2 (video de ayuda bajando + texto cambiado).
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: window.pendingGameMode, step: 2 });
  } else {
    // Lanzamiento normal (no versus/lobby): asegurar que el leaderboard use amigos,
    // y que la selección de banderas vuelva a Math.random (no la semilla sincronizada).
    window._vsActive = false;
    window._lobbyActive = false;
    // Limpiar restos de un Versus/lobby previo para que no sobreviva una fila de
    // rival en el leaderboard de single-player. (Ver bug barra de amigos.)
    window._vsOpponent = null;
    window._lobbyMembers = null;
    if (typeof initLeaderboard === 'function') { try { initLeaderboard(); } catch (e) {} }
    if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
    window.citiesClearSeed?.();
    if (window.pendingGameMode === 'flags') {
      splashScreen.style.display = 'none';
      if (typeof showFlagsMode !== 'undefined') showFlagsMode();
    } else if (window.pendingGameMode === 'shapes') {
      splashScreen.style.display = 'none';
      if (typeof showShapesMode !== 'undefined') showShapesMode();
    } else if (window.pendingGameMode === 'monuments') {
      splashScreen.style.display = 'none';
      startGame();
    } else {
      startGame();
    }
  }
});
document.querySelector('.gameover-confirm-wrap')?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.querySelector('.gameover-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);

  // ── Encadenamiento de campaña ──
  if (window.campaign && window.campaign.active) {
    const mode = window.pendingGameMode;
    const sc = window.lastModeScore || 0; // puntaje individual de esta ronda
    window.campaign.scores[mode] = sc;
    window.campaign.base = (window.campaign.base || 0) + sc;
    window.campaign.idx++;
    if (window.campaign.idx < window.campaign.btns.length) {
      // Avisar al espectador YA (antes de _fireNext, que puede demorar si el
      // manifest todavía no terminó de precargar) que dejamos el postgame de
      // este modo — sin esto _specReportAdvancing() nunca se llamaba desde
      // NINGÚN lado del código (quedó definida en spectate.js pero muerta),
      // así que el espectador se quedaba viendo el postgame VIEJO congelado
      // hasta que -si acaso- llegaba el 'round'/'pregame' del modo siguiente.
      if (typeof window._specReportAdvancing === 'function') window._specReportAdvancing();
      // Gameover se queda visible e intacto hasta que _fireNext está listo.
      // En ese momento se oculta el gameover y se dispara el siguiente modo
      // en el mismo bloque sincrónico (sin frame intermedio en blanco).
      sfxCheck.volume = 0;
      const _nextBtn = window.campaign.btns[window.campaign.idx];
      const _fireNext = () => {
        // Ocultar gameover + resetear splash + mostrar siguiente — todo de una.
        gameoverScreen.style.display = 'none';
        confirmStep = 0;
        const howtoWrapC = document.querySelector('.splash-howtoplay-wrap');
        if (howtoWrapC) howtoWrapC.classList.remove('slide-down');
        const labelC = document.querySelector('.splash-text2-label');
        if (labelC) { labelC.classList.remove('step2'); labelC.textContent = ''; }
        document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap')
          .forEach(el => el.classList.remove('animate-in'));
        document.getElementById(_nextBtn).click();
        setTimeout(() => { sfxCheck.volume = isMuted ? 0 : 1; }, 150);
      };
      if (window.__loadingReady) {
        _fireNext();
      } else {
        const _pollId = setInterval(() => {
          if (window.__loadingReady) { clearInterval(_pollId); _fireNext(); }
        }, 100);
      }
    } else {
      window.campaign.active = false;
      // Vuelta Mundial completa: recién ahora se confirman en localStorage los
      // highscores por-modo logrados durante esta campaña.
      if (typeof window._commitCampaignHighscores === 'function') window._commitCampaignHighscores();
      if (window.Analytics && typeof window.Analytics.logCampaign === 'function') {
        window.Analytics.logCampaign(window.campaign.base || 0);
      }
      if (window.Analytics && typeof window.Analytics.logCampaignCurrency === 'function') {
        window.Analytics.logCampaignCurrency(window.campaign.base || 0);
      }
      // Requisito para desbloquear GlobeQuiz: haber completado al menos 1 Gira
      // Mundial alguna vez (ver gate en el click de globequiz-btn más abajo).
      if (window._sbUserId && window._sbProfile) {
        window._sbProfile.campaigns_completed = (window._sbProfile.campaigns_completed || 0) + 1;
        window.sbUpdateProfile(window._sbUserId, { campaigns_completed: window._sbProfile.campaigns_completed }).catch(() => {});
      }
      playMusic(null);
      // Ocultar el gameover de monuments antes de mostrar results; si no, queda
      // encima y bloquea el click del confirm para ver el rank.
      gameoverScreen.style.display = 'none';
      // Sin esto, un espectador mirando quedaba con el postgame de Monuments
      // congelado para siempre — _setPlaying(false) es lo único que dispara
      // SoloSpectate.stop(), que a su vez hace que la presencia del jugador
      // "salga" del canal y el espectador reciba el aviso de partida
      // terminada (vuelve solo a la pantalla de carga). El otro camino (no
      // campaña, más abajo) sí lo llama — acá faltaba.
      window._setPlaying(false);
      // Recién acá se completó una Vuelta Mundial entera de verdad (las 4
      // modalidades) — es el único punto donde vale chequear elegibilidad
      // para el popup de Fundador (se consume al volver al menú, ver
      // js/final.js "final-confirm-back-wrap").
      window._pendingFounderPopupCheck = true;
      if (typeof showResultsScreen === 'function') showResultsScreen();
    }
    return;
  }

  gameoverScreen.style.display = 'none';
  window._setPlaying(false);
  // Liberar la RAM del juego recién terminado antes de volver al menú (el video se
  // vuelve a setear más abajo con swapHowtoVideo).
  if (typeof window.releaseGameMemory === 'function') window.releaseGameMemory();
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen').classList.remove('table-shown');
  document.getElementById('loading-table-group')?.classList.add('table-gone');
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof playMusic !== 'undefined') playMusic(window.sfxMenuMusic || sfxMenuMusic);
  document.getElementById('loading-social-group')?.classList.add('table-gone');
  document.getElementById('loading-friend-group')?.classList.add('table-gone');
  document.getElementById('loading-addfriend-group')?.classList.add('table-gone');
  document.getElementById('loading-blocked-group')?.classList.add('table-gone');
  document.getElementById('loading-sent-group')?.classList.add('table-gone');

  const fmt = v => v > 0 ? '🏆 ' + v.toLocaleString() : '';
  const _hs2 = _loadingHsValues();
  const elPlay   = document.getElementById('loading-play-hs');
  const elFlags  = document.getElementById('loading-flags-hs');
  const elShapes = document.getElementById('loading-shapes-hs');
  const elMode4  = document.getElementById('loading-mode4-hs');
  if (elPlay)   elPlay.textContent   = fmt(_hs2.play);
  if (elFlags)  elFlags.textContent  = fmt(_hs2.flags);
  if (elShapes) elShapes.textContent = fmt(_hs2.shapes);
  if (elMode4)  elMode4.textContent  = fmt(_hs2.mode4);
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();

  confirmStep = 0;
  const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
  if (howtoWrap) howtoWrap.classList.remove('slide-down');
  const label = document.querySelector('.splash-text2-label');
  if (label) { label.classList.remove('step2'); label.textContent = ''; }
  window.swapHowtoVideo('images/howtoplay/howtoplay3.mp4');
  const animEls = document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
});

// ── LOADING FLIGHT ATTENDANT (flightattpost2) ────────────────────────────────
(function () {
  const TIMELINE_LOADING = [
    [1, 150], [2, 100], [3, 150], [4, 150], [5, 150],
    [6,  50], [7, 150], [8, 200], [7, 200], [8, 200],
    [11,200], [5, 200], [6, 200], [9,  50], [8, 200],
    [11,150], [10,100], [7, 150], [8, 150], [3, 150],
    [2, 150], [1, 1000],
  ];
  const BASE = 'images/characters/flightattpost2/';
  const srcs = Array.from({length: 11}, (_, i) => BASE + (i + 1) + '.png');
  const img  = document.querySelector('#loading-screen .flightatt-loading');
  if (!img) return;
  srcs.forEach((src, i) => { if (i > 0) { const m = new Image(); m.src = src; if (m.decode) m.decode().catch(() => {}); } });
  function showFrame(n) { img.src = srcs[n - 1]; }
  let step = 0;
  function tick() {
    const [frameNum, duration] = TIMELINE_LOADING[step];
    showFrame(frameNum);
    step = (step + 1) % TIMELINE_LOADING.length;
    setTimeout(tick, duration);
  }
  setTimeout(tick, TIMELINE_LOADING[0][1]);
})();

// ── SPLASH FLIGHT ATTENDANT (flightattpost2) ─────────────────────────────────
(function () {
  const TIMELINE2 = [
    [1, 150], [2, 100], [3, 150], [4, 150], [5, 150],
    [6,  50], [7, 150], [8, 200], [7, 200], [8, 200],
    [11,200], [5, 200], [6, 200], [9,  50], [8, 200],
    [11,150], [10,100], [7, 150], [8, 150], [3, 150],
    [2, 150], [1, 1000],
  ];
  const BASE = 'images/characters/flightattpost2/';
  const srcs = Array.from({length: 11}, (_, i) => BASE + (i + 1) + '.png');
  const img  = document.querySelector('#splash-screen .flightatt-splash');
  if (!img) return;
  srcs.forEach((src, i) => { if (i > 0) { const m = new Image(); m.src = src; if (m.decode) m.decode().catch(() => {}); } });
  function showFrame(n) { img.src = srcs[n - 1]; }
  let step = 0;
  function tick() {
    const [frameNum, duration] = TIMELINE2[step];
    showFrame(frameNum);
    step = (step + 1) % TIMELINE2.length;
    setTimeout(tick, duration);
  }
  setTimeout(tick, TIMELINE2[0][1]);
})();

// ── FLIGHT ATTENDANT ANIMATION ───────────────────────────────────────────────
let restartFlightAtt;
(function () {
  const TIMELINE = [
    [1,  150], [2,  100], [3,  150], [4,  100], [5,  100],
    [6,  100], [7,  150], [8,   50], [9,   50], [10,  50],
    [11, 100], [12, 100], [11, 100], [12, 100], [11, 100],
    [12, 100], [13, 100], [14, 100], [15, 100], [6,  100],
    [5,  100], [4,  100], [3,  100], [2,  100],
  ];
  const BASE = 'images/characters/flightattpost/';
  const srcs = Array.from({length: 15}, (_, i) => BASE + (i + 1) + '.png');
  const img  = document.querySelector('.flightatt');
  if (!img) return;
  srcs.forEach((src, i) => { if (i > 0) { const m = new Image(); m.src = src; if (m.decode) m.decode().catch(() => {}); } });
  function showFrame(n) { img.src = srcs[n - 1]; }
  let step = 0;
  let pendingTimeout = null;
  restartFlightAtt = function () {
    if (pendingTimeout) clearTimeout(pendingTimeout);
    step = 0;
    showFrame(1);
    pendingTimeout = setTimeout(tick, TIMELINE[0][1]);
  };
  function tick() {
    const [frameNum, duration] = TIMELINE[step];
    showFrame(frameNum);
    step++;
    if (step >= TIMELINE.length) {
      step = 0;
      showFrame(1);
      pendingTimeout = setTimeout(tick, 2000);
    } else {
      pendingTimeout = setTimeout(tick, duration);
    }
  }

  pendingTimeout = setTimeout(tick, TIMELINE[0][1]);
})();

// ── SPLASH ANIMATE-IN (una sola vez al cargar) ───────────────────────────────
(function () {
  document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap').forEach(el => {
    el.classList.add('animate-in');
  });
})();

// ── SPLASH TEXT2 RESPONSIVE ──────────────────────────────────────────────────
// El tamaño del texto de los carteles (text2/text1) se controla en CSS con vw:
// el globo mide 25cqw/21cqw (su width:% sobre #splash-screen, que es full viewport),
// así que la fuente en vw (1.375cqw/1.155cqw = 0.055×ancho) queda SIEMPRE en la
// misma proporción que el globo, sin atascarse con el zoom como el ResizeObserver.

