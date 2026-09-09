// ============================================================================
// modes/mapgame-misc.js — map-mode miscellany: confirmStep/confirmCooldown +
// handlers for the 'confirm' buttons on the splash (pre-game) and gameover
// (advance mode / campaign / results), and the frame-by-frame flight attendant
// animations (loading, splash, and the ingame restartFlightAtt).
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
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
    // Chrome-iOS: never decode the video (see IS_CHROME_IOS) — it stays on the
    // static poster set by swapHowtoVideo.
    if (!IS_CHROME_IOS) {
      const howtoVideo = document.querySelector('.splash-howtoplay-video');
      if (howtoVideo) howtoVideo.play();
    }
    confirmStep = 1;
    window.waitForHowtoVideo();
    // Tell a possible spectator this first confirm was pressed — without it,
    // the spectator's instructions mirror (see _showSplashMirror in
    // spectate.js) stayed stuck on step 1's text/video even after the real
    // player advanced to step 2 (help video sliding down + text changed).
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: window.pendingGameMode, step: 2 });
  } else {
    // Normal launch (not versus/lobby): make the leaderboard use friends, and
    // flag selection go back to Math.random (not the synced seed).
    window._vsActive = false;
    window._lobbyActive = false;
    // Clear leftovers from a previous Versus/lobby so no rival row survives in
    // the single-player leaderboard.
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

  // ── Campaign chaining ──
  if (window.campaign && window.campaign.active) {
    const mode = window.pendingGameMode;
    const sc = window.lastModeScore || 0; // this round's individual score
    window.campaign.scores[mode] = sc;
    window.campaign.base = (window.campaign.base || 0) + sc;
    window.campaign.idx++;
    if (window.campaign.idx < window.campaign.btns.length) {
      // Tell the spectator NOW (before _fireNext, which can lag if the manifest
      // hasn't finished preloading) that we left this mode's postgame — without
      // it, _specReportAdvancing() was never called from ANYWHERE (defined in
      // spectate.js but dead), so the spectator stayed on the OLD frozen
      // postgame until the next mode's 'round'/'pregame' arrived, if ever.
      if (typeof window._specReportAdvancing === 'function') window._specReportAdvancing();
      // Gameover stays visible and intact until _fireNext is ready. Then the
      // gameover is hidden and the next mode fired in the same synchronous
      // block (no blank intermediate frame).
      sfxCheck.volume = 0;
      const _nextBtn = window.campaign.btns[window.campaign.idx];
      const _fireNext = () => {
        // Hide gameover + reset splash + show next — all at once.
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
      // Full Gira Mundial: only now are the per-mode highscores earned during
      // this campaign committed to localStorage.
      if (typeof window._commitCampaignHighscores === 'function') window._commitCampaignHighscores();
      if (window.Analytics && typeof window.Analytics.logCampaign === 'function') {
        window.Analytics.logCampaign(window.campaign.base || 0);
      }
      if (window.Analytics && typeof window.Analytics.logCampaignCurrency === 'function') {
        window.Analytics.logCampaignCurrency(window.campaign.base || 0);
      }
      // Requirement to unlock GlobeQuiz: having completed at least 1 Gira
      // Mundial ever (see the gate in the globequiz-btn click).
      if (window._sbUserId && window._sbProfile) {
        window._sbProfile.campaigns_completed = (window._sbProfile.campaigns_completed || 0) + 1;
        window.sbUpdateProfile(window._sbUserId, { campaigns_completed: window._sbProfile.campaigns_completed }).catch(() => {});
      }
      playMusic(null);
      // Hide the monuments gameover before showing results; otherwise it sits
      // on top and blocks the confirm click to see the rank.
      gameoverScreen.style.display = 'none';
      // Without this, a watching spectator stayed on the Monuments postgame
      // frozen forever — _setPlaying(false) is the only thing that fires
      // SoloSpectate.stop(), which makes the player's presence "leave" the
      // channel and the spectator get the game-ended notice (returns to the
      // loading screen). The other path (non-campaign, below) does call it —
      // it was missing here.
      window._setPlaying(false);
      // Only here has a full Gira Mundial (all 4 modes) actually been completed
      // — the only point worth checking Founder-popup eligibility (consumed on
      // return to the menu, see js/final.js "final-confirm-back-wrap").
      window._pendingFounderPopupCheck = true;
      if (typeof showResultsScreen === 'function') showResultsScreen();
    }
    return;
  }

  gameoverScreen.style.display = 'none';
  window._setPlaying(false);
  // Free the just-finished game's RAM before returning to the menu (the video
  // is re-set below with swapHowtoVideo).
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

// ── SPLASH ANIMATE-IN (once on load) ────────────────────────────────────────
(function () {
  document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap').forEach(el => {
    el.classList.add('animate-in');
  });
})();

// ── SPLASH TEXT2 RESPONSIVE ──────────────────────────────────────────────────
// The sign text size (text2/text1) is controlled in CSS with vw: the globe is
// 25cqw/21cqw (its width:% over #splash-screen, which is full viewport), so the
// font in vw (1.375cqw/1.155cqw = 0.055×width) always stays the same proportion
// as the globe, without jamming on zoom like the ResizeObserver did.

