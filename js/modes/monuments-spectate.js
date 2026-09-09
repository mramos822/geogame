// ============================================================================
// modes/monuments-spectate.js — Monuments spectator mode (1v1 VS, group lobby,
// 'waiting for rival'). Same pattern as cities-spectate.js, changes the round
// reveal (slideMonumentIn) and the assets. Also includes
// citiesSpectatorTimesUpEffect. Loads AFTER cities-spectate.js (uses
// _specBuildCountRow).
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// ── MONUMENTS SPECTATOR (solo-game spectator) ───────────────────────────────
// Exact same pattern as the Cities block above — same real screen
// (#game-wrapper/canvas/leaderboard), same minimal `state`, same reuse of
// render()/advanceDot(). Only the round reveal changes (slideMonumentIn instead
// of slideTagIn — monument image instead of city name+flag), the assets
// (check4/wrong4/countdown4/countdownred4, level4complete/level4complete2
// background) and the results text ('gameover.monuments').
let _monumentsSpecMode = false;
let _monumentsSpecTimesUpT1 = null, _monumentsSpecTimesUpT2 = null;
let _monumentsSpecIsFirstRound = true;
let _monumentsSpecPregameSeen  = false;
let _monumentsSpecLastTick = null;
let _monumentsSpecLastTickSoundAt = 0;

window.monumentsSpectatorEnter = function () {
  _monumentsSpecMode = true;
  window._isSpectating = true;
  _monumentsSpecLastTick = null;
  _monumentsSpecLastTickSoundAt = 0;
  _monumentsSpecIsFirstRound = true;
  _monumentsSpecPregameSeen  = false;
  window.pendingGameMode = 'monuments';
  _monumentsSpecLastCard = null;
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';
  if (typeof loadGameSFX === 'function') loadGameSFX();
  if (typeof loadBadges === 'function') loadBadges();
  // Leftovers from other modes spectated earlier in this tab without going
  // through their own Exit — same case already handled in
  // flags.js/shapes.js/cities.
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
  document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
  document.getElementById('shapes-countdown-widget')?.remove();
  document.getElementById('flags-wrapper')?.style.setProperty('display', 'none');
  document.getElementById('flags-luggage-wrap')?.style.setProperty('display', 'none');
  document.getElementById('flags-flagid-wrap')?.style.setProperty('display', 'none');
  ['flags-machine', 'flags-machine2', 'flags-machine3', 'flags-machine3b'].forEach(id => {
    const m = document.getElementById(id);
    if (m) { m.style.display = 'none'; m.style.animationPlayState = ''; m.classList.remove('scrolling'); }
  });
  document.getElementById('flags-countdown-widget')?.style.setProperty('display', 'none');
  document.getElementById('flags-right-panel')?.style.setProperty('display', 'none');

  mapGameOver = false;
  gameAborted = false;
  clearInterval(timerIntervalId); timerIntervalId = null;
  clearTimeout(pregameTimeout);
  clearTimeout(_monumentsSpecTimesUpT1); clearTimeout(_monumentsSpecTimesUpT2);
  canvas.style.pointerEvents = 'none'; // read-only: no click to resolve
  if (canvas.width < DISPLAY_W) { canvas.width = DISPLAY_W; canvas.height = DISPLAY_H; }
  if (badgeOverlay.width < DISPLAY_W) { badgeOverlay.width = DISPLAY_W; badgeOverlay.height = DISPLAY_H; }

  scoreDisplayEl.style.display = 'block';
  scoreValueEl.textContent = '0';
  speedBonusText.style.display = '';
  speedBonusText.classList.remove('visible');
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) { cwEl.style.display = 'block'; cwEl.style.visibility = ''; }
  const rpEl = document.getElementById('right-panel');
  if (rpEl) { rpEl.style.display = 'flex'; rpEl.style.visibility = ''; }
  const lb = document.getElementById('leaderboard');
  if (lb) lb.innerHTML = '';
  timeupOverlay.style.display = 'none';
  timeupOverlay.classList.remove('timeup-in', 'timeup-out');
  resultLabel.className = '';
  resultLabel.classList.remove('visible');

  // Build a MINIMAL own `state` (not resetState(), which builds
  // cities/monuments/practice pools meant for a REAL game) — render() only needs
  // these fields.
  state = {
    phase: 'waiting',
    timeLeft: GAME_DURATION,
    score: 0, displayedScore: 0, dots: 0,
    currentCity: null, cityShownAt: 0,
    placedDots: [], pin1Anim: null, pin2Anim: null,
    starParticles: [], sunburst: null, badgeAnim: null,
    lastTimestamp: null, streak: 0, mapDrawn: false,
  };
  // updateDotsUI() reads state.dots (just 0) to un-fill the train dots —
  // without this they stayed "filled" with the last value left by another
  // mode/spectated game in this tab.
  progressContainer.classList.remove('train-animation', 'dots-fade-out');
  updateDotsUI();
  timerNumberEl.textContent = GAME_DURATION;
  timerNumberEl.classList.remove('timer-number-infinity');
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown4.png';
  countdownImg.style.animationPlayState = 'running';

  // Visible right away, whether or not a 3-2-1 is running — same reason as
  // citiesSpectatorEnter (#pregame-countdown is transparent).
  gameWrapper.style.display = 'block';
  // See long comment in citiesSpectatorEnter: redimensionarJuego() does nothing
  // while gameWrapper is still display:none, so it must go AFTER showing it —
  // with the old order the map was mispositioned throughout the 3-2-1.
  redimensionarJuego();
  cityTagEl.style.visibility = 'hidden';
  monumentImgEl.style.display = 'none';

  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(render);

  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// switchingMode=true: the spectated player's campaign chained to ANOTHER mode —
// see long comment in flagsSpectatorExit (same mechanism here).
window.monumentsSpectatorExit = function (switchingMode) {
  _monumentsSpecMode = false;
  if (!switchingMode) window._isSpectating = false;
  // See long comment in flagsSpectatorExit.
  document.getElementById('monuments-spec-lb-entry')?.remove();
  document.getElementById('monuments-spec-lb-opp')?.remove();
  pregameAborted = true;
  clearTimeout(pregameTimeout); pregameTimeout = null;
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  _monumentsSpecLastCard = null;
  mapGameOver = true;
  clearTimeout(_monumentsSpecTimesUpT1); clearTimeout(_monumentsSpecTimesUpT2);
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  window.monumentsSpectatorHidePostgame();
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  // window._vsShowingResult — see the same guard in citiesSpectatorExit/
  // flagsSpectatorExit/shapesSpectatorExit (the reported "background assets
  // get removed if I lose").
  if (!window._vsShowingResult) {
    gameWrapper.style.display = 'none';
    monumentImgEl.style.display = 'none';
    state = null;
  }
  scoreDisplayEl.style.display = 'none';
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'none';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'none';
  const lb = document.getElementById('leaderboard');
  if (lb) lb.innerHTML = '';
  cityTagEl.style.visibility = 'hidden';
  timeupOverlay.style.display = 'none';
  timeupOverlay.classList.remove('timeup-in', 'timeup-out');
  pregameCountdownEl.style.display = 'none';
  if (!switchingMode) {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'flex';
  }
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

window.monumentsSpectatorShowPregame = function (payload) {
  if (!_monumentsSpecMode) return;
  _monumentsSpecPregameSeen = true;
  window.monumentsSpectatorHidePostgame();
  cityTagEl.style.visibility = 'hidden';
  if (payload) {
    timerNumberEl.classList.toggle('timer-number-infinity', !!payload.infinite);
    timerNumberEl.textContent = payload.infinite ? '∞' : (payload.duration != null ? payload.duration : '');
  }
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown4.png';
  countdownImg.style.animationPlayState = 'paused';
  if (typeof playMusic === 'function') playMusic(null);
  if (payload && typeof payload.campaignBaseAtStart === 'number' && state) {
    state.score = payload.campaignBaseAtStart;
    state.displayedScore = payload.campaignBaseAtStart;
    scoreValueEl.textContent = payload.campaignBaseAtStart.toLocaleString();
  }
  let elapsedMs = (payload && typeof payload.startedAt === 'number') ? (Date.now() - payload.startedAt) : 0;
  const _pregameTotalMs = PREGAME_STEPS.reduce((s, x) => s + x.hold, 0);
  if (elapsedMs > _pregameTotalMs - 400) elapsedMs = Math.max(0, _pregameTotalMs - 400);
  runPregameCountdown(() => {
    const cwPost = document.getElementById('countdown-widget');
    if (cwPost) cwPost.style.visibility = '';
    countdownImg.style.animationPlayState = 'running';
    if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
    redimensionarJuego();
    gameWrapper.style.display = 'block';
  }, elapsedMs);
};

// payload = { mode:'monuments', index, monumentName, img, lat, lon, timeLeft }
window.monumentsSpectatorShowRound = function (payload) {
  if (!_monumentsSpecMode || !state) return;
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  // Same reason as citiesSpectatorShowRound: don't touch pin1Anim/pin2Anim
  // here, they clear themselves when their own fade ends (see render()).
  state.phase = 'waiting';
  state.cityShownAt = Date.now();
  state.currentCity = { name: payload.monumentName, img: payload.img, lat: payload.lat, lon: payload.lon };
  slideMonumentIn(state.currentCity);
  if (typeof payload.timeLeft === 'number') {
    state.timeLeft = payload.timeLeft;
    timerNumberEl.textContent = payload.timeLeft;
    timerNumberEl.classList.remove('timer-number-infinity');
  }
  if (_monumentsSpecIsFirstRound) {
    _monumentsSpecIsFirstRound = false;
    setTimeout(() => {
      // Same guard as citiesSpectatorShowRound — see comment there.
      if (!_monumentsSpecMode) return;
      if (!_monumentsSpecPregameSeen && typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') {
        playMusic(sfxGameMusic);
      }
    }, 400);
  }
};

// payload = { correct, score, grade, clickX, clickY, correctX, correctY, distKm, totalGained, bonusAmt }
window.monumentsSpectatorResolvePick = function (payload) {
  if (!_monumentsSpecMode || !state || !state.currentCity) return;
  const { grade, clickX, clickY, correctX, correctY, distKm, totalGained, bonusAmt } = payload;
  if (typeof clickX !== 'number' || typeof correctX !== 'number') return;
  state.phase = 'animating';
  if (typeof sfxPin !== 'undefined' && typeof sfxPlay === 'function') { sfxPin.currentTime = 0; sfxPlay(sfxPin); }

  if (typeof payload.score === 'number') state.score = payload.score;

  // Floating "+points" — ONLY the hit value, WITHOUT the inRowBonus (shown
  // separately in the "IN A ROW" badge), like the real player (whose popup
  // already excludes the inRowBonus).
  const _hitPoints = totalGained - (payload.inRowBonus || 0);
  if (typeof totalGained === 'number' && _hitPoints > 0 && typeof showScorePopup === 'function') {
    showScorePopup(_hitPoints);
  }
  if (typeof bonusAmt === 'number' && bonusAmt > 0) {
    clearTimeout(speedBonusHideId);
    speedBonusText.classList.remove('visible');
    void speedBonusText.offsetWidth;
    speedBonusText.classList.add('visible');
    speedBonusHideId = setTimeout(() => speedBonusText.classList.remove('visible'), 1600);
  }

  let _dotFontSize = 11;
  ctx.font = `bold ${_dotFontSize}px Georgia`;
  const _dotLabel = (typeof tMonument === 'function') ? tMonument(state.currentCity.name) : state.currentCity.name;
  while (_dotFontSize > 7 && ctx.measureText(_dotLabel).width > 90) {
    _dotFontSize--;
    ctx.font = `bold ${_dotFontSize}px Georgia`;
  }
  state.placedDots.push({
    x: correctX, y: correctY, name: state.currentCity.name,
    labelOpacity: 1, labelBorn: Date.now(),
    permanent: grade === 'perfect', fontSize: _dotFontSize,
  });

  // payload.dots carries the spectated player's REAL post-increment value —
  // the local counter is overwritten before advanceDot() (which does
  // state.dots++ internally) so the train fills/empties at the same moment the
  // real player sees, regardless of when the spectator joined.
  if (grade !== 'wayoff' && typeof advanceDot === 'function') {
    if (typeof payload.dots === 'number') state.dots = payload.dots - 1;
    advanceDot();
  }

  state.pin1Anim = { x: clickX, y: clickY, targetX: correctX, targetY: correctY,
    distKm, grade, progress: 0, lineProgress: 0, opacity: 1, fading: false,
    wobbleTime: 0, sunburstSpawned: false };
  const capturedPin1 = state.pin1Anim;

  setTimeout(() => {
    if (!_monumentsSpecMode || state.pin1Anim !== capturedPin1) return; // round already changed
    state.pin2Anim = { x: correctX, y: correctY, progress: 0, opacity: 1, fading: false,
      wobbleTime: 0, starsSpawned: false,
      onLanded: () => {
        spawnStars(correctX, correctY);
        setTimeout(() => {
          if (!_monumentsSpecMode) return;
          showResultLabel(correctX, correctY, grade, 0, 0);
          // Streak ("in row") — the real badgeColor is an <img>, not
          // broadcast-serializable; payload.streak does travel (a number), and
          // getBadgeImg() is a pure function of that streak — the spectator
          // rebuilds the same image locally. render() already draws
          // state.badgeAnim on its own (same overlay the real player uses).
          if (typeof payload.streak === 'number' && typeof getBadgeImg === 'function') {
            const badgeColor = getBadgeImg(payload.streak);
            if (badgeColor) {
              state.badgeAnim = { t: 0, img: badgeColor, streak: payload.streak, inRowBonus: payload.inRowBonus || 0 };
              setTimeout(() => { if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); } }, 800);
            }
          }
        }, 200);
      },
    };
    const capturedPin2 = state.pin2Anim;
    setTimeout(() => { if (state.pin2Anim === capturedPin2) capturedPin2.fading = true; }, 1000);
  }, 300);
  setTimeout(() => { if (state.pin1Anim === capturedPin1) capturedPin1.fading = true; }, 1000);
};

window.monumentsSpectatorUpdateTimer = function (timeLeft) {
  if (!_monumentsSpecMode || !state) return;
  state.timeLeft = timeLeft;
  timerNumberEl.textContent = timeLeft;
  timerNumberEl.classList.remove('timer-number-infinity');
  if (timeLeft <= 10) {
    timerNumberEl.style.color = '#ffffff';
    countdownImg.src = 'images/countdownred4.png';
    const _nowTick = Date.now();
    if (timeLeft > 0 && timeLeft !== _monumentsSpecLastTick && (_nowTick - _monumentsSpecLastTickSoundAt) > 700
        && typeof sfxTickdown !== 'undefined') {
      sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown);
      _monumentsSpecLastTickSoundAt = _nowTick;
    }
  } else {
    timerNumberEl.style.color = '';
    countdownImg.src = 'images/countdown4.png';
  }
  _monumentsSpecLastTick = timeLeft;
};

window.monumentsSpectatorUpdateScore = function (score, dots) {
  if (!_monumentsSpecMode || !state) return;
  state.score = score;
  state.displayedScore = score;
  scoreValueEl.textContent = (score + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
  // dots: same reason as citiesSpectatorUpdateScore.
  if (typeof dots === 'number') {
    state.dots = Math.max(0, Math.min(dots, DOTS_NEEDED - 1));
    updateDotsUI();
  }
};

let _monumentsSpecLastCard = null;
// oppName/oppAvatar/oppScore: see long comment in citiesSpectatorSetPlayerCard.
window.monumentsSpectatorSetPlayerCard = function (name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode) {
  if (!_monumentsSpecMode) return;
  _monumentsSpecLastCard = { name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode };
  const lb = document.getElementById('leaderboard');
  if (!lb) return;
  const rowH = getLbRowHeight();
  const showOpp = !!oppName;
  // TOP_MARGIN: see long comment in citiesSpectatorSetPlayerCard (the same
  // clip-path clips the wrongEffect emote-bubble if the top row sits at the
  // container's top:0).
  const TOP_MARGIN = Math.round(rowH * 0.4);
  lb.style.height = (showOpp ? rowH * 2 + LB_GAP + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';
  let el = document.getElementById('monuments-spec-lb-entry');
  if (!el) {
    el = document.createElement('div');
    el.className = 'lb-entry lb-player';
    el.id = 'monuments-spec-lb-entry';
    el.style.top = TOP_MARGIN + 'px';
    el.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" id="monuments-spec-lb-avatar" src="images/profilepic/ppdefault.png"></div>`
      + `<span class="lb-name" id="monuments-spec-lb-name"></span>`
      + `<span class="lb-score" id="monuments-spec-lb-score">0</span>`;
    lb.appendChild(el);
  }
  const nameEl = document.getElementById('monuments-spec-lb-name');
  if (nameEl) nameEl.textContent = name || 'Jugador';
  const avatarEl = document.getElementById('monuments-spec-lb-avatar');
  if (avatarEl && avatar) avatarEl.src = avatar;
  const scoreEl = document.getElementById('monuments-spec-lb-score');
  if (scoreEl) scoreEl.textContent = (score || 0).toLocaleString();
  window.CustomizeAssets?.applyCard(el, cardCode || '0001');

  let oppEl = document.getElementById('monuments-spec-lb-opp');
  if (showOpp) {
    if (!oppEl) {
      oppEl = document.createElement('div');
      oppEl.className = 'lb-entry lb-vsopp';
      oppEl.id = 'monuments-spec-lb-opp';
      oppEl.style.top = (TOP_MARGIN + rowH + LB_GAP) + 'px';
      oppEl.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" id="monuments-spec-lb-opp-avatar" src="images/profilepic/ppdefault.png"></div>`
        + `<span class="lb-name" id="monuments-spec-lb-opp-name"></span>`
        + `<span class="lb-score" id="monuments-spec-lb-opp-score">0</span>`;
      lb.appendChild(oppEl);
    }
    window.CustomizeAssets?.applyCard(oppEl, oppCardCode || '0001');
    const oppNameEl = document.getElementById('monuments-spec-lb-opp-name');
    if (oppNameEl) oppNameEl.textContent = oppName || 'Rival';
    const oppAvatarEl = document.getElementById('monuments-spec-lb-opp-avatar');
    if (oppAvatarEl && oppAvatar) oppAvatarEl.src = oppAvatar;
    const oppScoreEl = document.getElementById('monuments-spec-lb-opp-score');
    if (oppScoreEl) oppScoreEl.textContent = (oppScore || 0).toLocaleString();
    // Reorder by rank — see long comment in citiesSpectatorSetPlayerCard.
    const friendOnTop = (score || 0) >= (oppScore || 0);
    el.style.top    = (TOP_MARGIN + (friendOnTop ? 0 : rowH + LB_GAP)) + 'px';
    oppEl.style.top = (TOP_MARGIN + (friendOnTop ? rowH + LB_GAP : 0)) + 'px';
  } else if (oppEl) {
    oppEl.remove();
  } else {
    el.style.top = TOP_MARGIN + 'px';
  }
};

window.monumentsSpectatorWrongEffect = function (target) {
  if (!_monumentsSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'monuments-spec-lb-opp' : 'monuments-spec-lb-entry');
  if (!el) return;
  el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // Raised z-index for the emote's duration — see long comment in citiesSpectatorWrongEffect.
  const prevZ = el.style.zIndex;
  el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 1800);
  if (typeof spawnEmoteBubble === 'function') spawnEmoteBubble(el);
};

// "Time's up" on the 1v1 spectator card (cities/monuments) — same mechanism as
// *SpectatorWrongEffect but with the stopwatch.
window.citiesSpectatorTimesUpEffect = function (target) {
  if (!_citiesSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'cities-spec-lb-opp' : 'cities-spec-lb-entry');
  if (!el) return;
  const prevZ = el.style.zIndex; el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
};
window.monumentsSpectatorTimesUpEffect = function (target) {
  if (!_monumentsSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'monuments-spec-lb-opp' : 'monuments-spec-lb-entry');
  if (!el) return;
  const prevZ = el.style.zIndex; el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
};

window.monumentsSpectatorReposition = function () {
  if (!_monumentsSpecMode || !_monumentsSpecLastCard) return;
  window.monumentsSpectatorSetPlayerCard(_monumentsSpecLastCard.name, _monumentsSpecLastCard.avatar, _monumentsSpecLastCard.score);
};

window.monumentsSpectatorShowTimesUp = function () {
  if (!_monumentsSpecMode) return;
  clearTimeout(_monumentsSpecTimesUpT1);
  clearTimeout(_monumentsSpecTimesUpT2);
  if (typeof playMusic === 'function') playMusic(null);
  if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
  countdownImg.style.animationPlayState = 'paused';
  timeupOverlay.style.display = 'flex';
  timeupOverlay.classList.remove('timeup-out');
  timeupOverlay.classList.add('timeup-in');
  _monumentsSpecTimesUpT1 = setTimeout(() => {
    if (!_monumentsSpecMode) return;
    timeupOverlay.classList.remove('timeup-in');
    timeupOverlay.classList.add('timeup-out');
    _monumentsSpecTimesUpT2 = setTimeout(() => {
      if (!_monumentsSpecMode) return;
      timeupOverlay.style.display = 'none';
      timeupOverlay.classList.remove('timeup-out');
    }, 400);
  }, 1800);
};

window.monumentsSpectatorShowPostgame = function (payload) {
  if (!_monumentsSpecMode) return;
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'none';
  gameoverScreen.classList.remove('mode-flags', 'mode-shapes');
  gameoverScreen.classList.add('mode-monuments');
  gameoverScreen.style.pointerEvents = 'none';
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women1.png');
  // Own selectors (game-bg-city-monuments/2), NOT the generic .game-bg-city
  // (that's the Cities one) — so the Cities background isn't overwritten.
  document.querySelectorAll('.game-bg-city-monuments').forEach(el => el.src = 'images/bg/level4complete.png');
  document.querySelectorAll('.game-bg-city-monuments2').forEach(el => el.src = 'images/bg/level4complete2.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check4.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong4.png');
  if (typeof window.hideGameoverConfirm === 'function') window.hideGameoverConfirm();
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = 'none';
  gameoverScreen.style.display = 'flex';
  const label = gameoverScreen.querySelector('.gameover-text1-label');
  if (label) label.textContent = (typeof t === 'function') ? t('gameover.monuments') : 'Landmark Loco';
  if (finalScoreEl) finalScoreEl.textContent = (payload.totalScore || 0).toLocaleString();
  if (newHighscoreBanner) newHighscoreBanner.style.display = payload.isNewHighscore ? 'flex' : 'none';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'none';
  {
    const nCorrect = payload.correctCount || 0;
    _specBuildCountRow(
      document.getElementById('gameover-checks-row'),
      gameoverScreen.querySelector('.game-bg-check3'),
      gameoverScreen.querySelector('.grade-count-total'),
      nCorrect, (typeof getModeCheckImg === 'function') ? getModeCheckImg() : 'images/check4.png', 0);
    _specBuildCountRow(
      document.getElementById('gameover-wrongs-row'),
      gameoverScreen.querySelector('.game-bg-wrong3'),
      gameoverScreen.querySelector('.wrong-count-total'),
      payload.wrongCount || 0, (typeof getModeWrongImg === 'function') ? getModeWrongImg() : 'images/wrong4.png',
      (nCorrect > 0 ? (nCorrect - 1) * 0.1 + 0.2 : 0) + 0.4);
  }
  const wrongTotalEl = document.getElementById('gameover-wrong-total');
  if (wrongTotalEl) wrongTotalEl.textContent = payload.wrongCount || 0;
  const splashWrongEl = document.getElementById('splash-wrong-total');
  if (splashWrongEl) splashWrongEl.textContent = payload.wrongCount || 0;
  // Correct-count counterpart — same element updateGradeCountsUI() updates in
  // the real player (gradeCounts.perfect+good+fair, LOCAL state that doesn't
  // exist here) — was missing entirely, stayed with the number from the LAST
  // real game played in this tab instead of the spectated player's count.
  const correctTotalEl = document.getElementById('gameover-count-total');
  if (correctTotalEl) correctTotalEl.textContent = payload.correctCount || 0;
  const splashCorrectEl = document.getElementById('splash-count-total');
  if (splashCorrectEl) splashCorrectEl.textContent = payload.correctCount || 0;
  scoreDisplayEl.style.display = 'none';
  if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
};

window.monumentsSpectatorHidePostgame = function () {
  if (gameoverScreen) { gameoverScreen.style.display = 'none'; gameoverScreen.style.pointerEvents = ''; gameoverScreen.classList.remove('mode-monuments'); }
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = '';
};
// ═════════════════════════════════════════════════════════════════════════════
