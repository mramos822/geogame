// ============================================================================
// menu/menu-launchers.js — loading-screen nav button listeners: launch Cities /
// GlobeQuiz (+ its power/quit), open results, panel 2 (Single player: World Tour
// / Versus / Practice / back), play confirm, open the Social panel.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

document.getElementById('loading-play-btn').addEventListener('click', () => {
  window._autoDismissVsInvites?.();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  window._setPlaying(true);
  window.pendingGameMode = 'game';
  // Tell a possible spectator we entered this mode's instructions — see the long
  // comment (with the microtask-defer rationale) at the same point in flags.js.
  // Cities has no real spectator UI yet (REAL_UI_MODES doesn't list it), so this
  // only keeps them from being stuck on "Connecting..." — they won't see the
  // round itself until that mode is integrated.
  Promise.resolve().then(() => {
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: 'game' });
  });
  window.resetSplashEntry?.();
  // Immediate visual transition — hide loading and show splash this frame
  document.getElementById('loading-screen').style.display = 'none';
  const splashElCity = document.getElementById('splash-screen');
  splashElCity.style.display = 'flex';
  window.showSplashConfirm();
  const animElsCity = splashElCity.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animElsCity.forEach(el => el.classList.remove('animate-in'));
  void splashElCity.offsetWidth;
  animElsCity.forEach(el => el.classList.add('animate-in'));
  playMusic(sfxPregame);
  // Non-visual setup deferred to the next frame so it doesn't block the transition
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
  // GlobeQuiz is open to everyone now — no account and no completed Gira
  // Mundial required (the streak has a full localStorage fallback for guests,
  // see loadState/updateStreak/gqStreakAlive in js/globequiz.js). The
  // #globequiz-locked-popup + its i18n keys are kept in case the gate is
  // reinstated.
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
  // If already played today, the greeting bubble AND the description tell them
  // to come back tomorrow instead of inviting them to find the country (they can
  // still play again, it just doesn't add to the streak) — and only then does
  // the "new day" countdown appear. If NOT played today, both keep their normal
  // invitation text and the countdown isn't shown (pointless while today's
  // streak is still available by playing).
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
  // VS 1v1: unlike flags/cities/monuments (which exit via quitToMenu(), and THAT
  // calls _vsAbandon()), this button has its own manual exit sequence that never
  // went through there — abandoning a GlobeQuiz duel returned to the menu
  // without telling the rival, who waited forever (reported: "doesn't recognize
  // when someone leaves the game"). Same rule as the other modes: announce the
  // abandon BEFORE tearing down the UI.
  if (window._vsActive && typeof window._vsAbandon === 'function') {
    try { window._vsAbandon(); } catch (e) {}
  }
  window._setPlaying(false);
  // Stop EVERYTHING GlobeQuiz (timer, auto-rotate, music/sfx) — same rule as
  // quitToMenu() for the other modes.
  if (typeof window.stopGlobeQuizTimer === 'function') window.stopGlobeQuizTimer();
  if (typeof window.stopGlobeQuizAutoRotate === 'function') window.stopGlobeQuizAutoRotate();
  if (typeof window.stopGlobeQuizInertia === 'function') window.stopGlobeQuizInertia();
  if (typeof window.stopGlobeQuizCountdown === 'function') window.stopGlobeQuizCountdown();
  if (typeof window.stopGlobeQuizEndgameTimer === 'function') window.stopGlobeQuizEndgameTimer();
  if (typeof window.stopGlobeQuizEndgameCountdown === 'function') window.stopGlobeQuizEndgameCountdown();
  const gqEndgameModalEl = document.getElementById('gq-endgame-modal');
  if (gqEndgameModalEl) gqEndgameModalEl.style.display = 'none';
  // playMusic(null) also stops the iOS AudioBufferSourceNode (Web Audio), which
  // keeps playing if only the HTML <audio> is paused — same reason as in
  // globequiz.js submitGuess(). sfxBonus is a normal sfx, not music, so pausing
  // it directly is enough.
  if (typeof playMusic === 'function') playMusic(null);
  try { if (sfxBonus) { sfxBonus.pause(); sfxBonus.currentTime = 0; } } catch (e) {}
  const popup = document.getElementById('gq-quit-popup');
  if (popup) popup.style.display = 'none';
  const gqScreen = document.getElementById('globequiz-screen');
  if (gqScreen) gqScreen.style.display = 'none';
  // Release the WebGL contexts (globe + starfield): GlobeQuiz keeps its scene
  // alive across the session, but that permanent GPU allocation crashed iOS
  // when a Gira Mundial followed. Rebuilds cleanly on next entry.
  if (typeof window.globequizReleaseGL === 'function') {
    try { window.globequizReleaseGL(); } catch (e) {}
  }
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen')?.classList.remove('table-shown');
  // Hide the menu's GlobeQuiz panel (text/table/title/globe/desc/play) —
  // without this it stayed ON TOP of the main menu on return, because
  // resetEntranceElements()/replayEntranceAnimations() don't know these
  // elements (panel-specific; see the loading-panel2-back handler below, which
  // does the same for that case).
  ['loading-globequiz-text2', 'loading-globequiz-table', 'loading-globequiz-title',
   'loading-globequiz-globe', 'loading-globequiz-desc', 'loading-globequiz-countdown', 'loading-globequiz-play-wrap']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  if (typeof window.stopGlobeQuizMenuCountdown === 'function') window.stopGlobeQuizMenuCountdown();
  // Return to the MAIN MENU (panel1) with the SAME entrance animation
  // quitToMenu() uses for the other modes, not an abrupt jump.
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  // And music goes back to the menu loop.
  if (typeof window.startMenuMusic === 'function') window.startMenuMusic();
  else if (typeof playMusic === 'function') playMusic(sfxMenuMusic);

  // Guest: nudge them to create an account so their GlobeQuiz streak isn't
  // stuck in localStorage — same idea as the post-Gira-Mundial guest popup
  // (#guest-rank-popup in js/final.js), with its own "don't show again" flag.
  if (!window._accountLoggedIn && localStorage.getItem('hideGqGuestPopup') !== '1') {
    setTimeout(async () => {
      if (window._accountLoggedIn) return;
      const accountModal = document.getElementById('account-modal');
      if (accountModal && accountModal.classList.contains('open')) return;
      const numEl = document.getElementById('gq-guest-popup-streak-num');
      const wrapEl = document.getElementById('gq-guest-popup-streak');
      if (numEl && typeof window.gqReadCurrentStreak === 'function') {
        try {
          const s = await window.gqReadCurrentStreak();
          numEl.textContent = String(s || 0);
          if (wrapEl) wrapEl.style.display = (s > 0) ? 'block' : 'none';
        } catch (e) {}
      }
      document.getElementById('gq-guest-popup')?.classList.add('open');
    }, 700);
  }
});

['close', 'register', 'login'].forEach(kind => {
  document.getElementById('gq-guest-popup-' + kind)?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    if ((kind === 'close') && document.getElementById('gq-guest-popup-dontshow')?.checked) {
      localStorage.setItem('hideGqGuestPopup', '1');
    }
    document.getElementById('gq-guest-popup')?.classList.remove('open');
    if (kind === 'register' && typeof window.openAccountModal === 'function') window.openAccountModal('register');
    if (kind === 'login' && typeof window.openAccountModal === 'function') window.openAccountModal('login');
  });
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

// ── Realtime social (friends/friendships channels + polls + badge)

document.getElementById('loading-social-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (!window._accountLoggedIn) {
    document.getElementById('social-lock-popup')?.classList.add('open');
    return;
  }
  document.getElementById('loading-social-group')?.classList.remove('table-gone');
  document.getElementById('loading-screen').classList.add('table-shown');
  // Hide the request badge and notification on entering the panel
  const badge = document.getElementById('social-notif-badge');
  if (badge) badge.style.display = 'none';
  _dismissFriendRequestNotif();
  loadSocialData();
});
