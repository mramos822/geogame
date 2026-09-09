// ============================================================================
// modes/cities-spectate.js — Cities spectator mode (1v1 VS, group lobby and
// 'waiting for rival'). Reuses the real screen
// (state/render/advanceDot/leaderboard) and repopulates the spectated player's
// data. window.citiesSpectator* + _specBuildCountRow (shared with
// monuments-spectate.js) + _citiesSpec* state.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// ═════════════════════════════════════════════════════════════════════════════
// ── SPECTATOR MODE: CITIES ──────────────────────────────────────────────────
// Unlike flags/shapes (discrete options, own DOM), Cities uses a <canvas> shared
// with the real player (#game-canvas / ctx / state / render()) — the only
// practical way to "see" the animated pins is to REUSE that same machinery
// (render() already draws pin1Anim/pin2Anim/dots entirely from `state`,
// regardless of who populates it) instead of reimplementing a separate map
// renderer. Spectating and really playing are mutually exclusive in a tab (same
// assumption as flags/shapes), so reassigning
// `state`/`canvas.style.pointerEvents` here is safe.
//
// Unlike shapes (where 'round' arrives BEFORE 'pregame' in the real order), in
// Cities nextCity() — and thus 'round' — is only called AFTER the real 3-2-1
// ends (see runPregameCountdown(...) inside startGame()), like flags. Since
// #game-wrapper contains ALL the visuals (tag+canvas), keeping it hidden during
// the 3-2-1 and revealing it only in the real onDone is enough — no explicit
// gate (_flagsSpecCountdownDone/_shapesSpecPendingReveal) like the other two
// modes needed: here "hidden" already covers any possible arrival order.
//
// _specBuildCountRow: rebuilds a row of icons (correct/wrong) for the
// Cities/Monuments spectator postgame — replicates the real
// buildChecksRow()/buildWrongsRow() EXACTLY (same compressed gap if >12, same
// per-icon staggered margins/animation-delay/z-index, same fade of the big
// icon + number only once the row finishes entering) but from the payload
// instead of gradeCounts/wrongCount (the player's LOCAL state, which doesn't
// exist here). This used to be a simplified version without any of that — all
// icons appeared at once, spaced with the class's default gap instead of the
// compressed one, and the big icon/number never faded (appeared already visible).
// startOffset: initial delay in seconds (the real buildWrongsRow only starts
// once the correct row finishes entering).
// Returns the moment (seconds) when THIS row's whole animation ends, so the
// next one can be chained (like the real checksEndTime).
function _specBuildCountRow(rowEl, staticEl, countEl, count, imgSrc, startOffset) {
  if (!rowEl) return startOffset;
  rowEl.innerHTML = '';
  rowEl.style.gap = '0px';
  const IMG_W = 6.4, BASE_GAP = 0.33; // vmin, same as .checks-row/.wrongs-row img
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = count > 1 ? (count > 12 ? (MAX_W - count * IMG_W) / (count - 1) : BASE_GAP) : 0;

  if (count === 0) {
    const none = document.createElement('span');
    none.textContent = (typeof t === 'function') ? t('profile.none') : 'Ninguna';
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:0.77cqmin #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:4.5cqmin;font-weight:bold;position:relative;left:2.2cqmin;opacity:0;';
    rowEl.appendChild(none);
    if (staticEl) staticEl.style.opacity = '0';
    if (countEl)  countEl.style.opacity  = '0';
    setTimeout(() => {
      none.style.opacity = '1';
      if (staticEl) staticEl.style.opacity = '1';
      if (countEl)  countEl.style.opacity  = '1';
    }, startOffset * 1000);
    return startOffset;
  }

  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = '';
    img.style.animationDelay = `${startOffset + i * 0.1}s`;
    img.style.zIndex = 16 + i;
    if (i < count - 1) img.style.marginRight = `${gap}cqmin`;
    rowEl.appendChild(img);
  }

  if (staticEl) staticEl.style.opacity = '0';
  if (countEl)  countEl.style.opacity  = '0';
  const revealDelay = startOffset + (count - 1) * 0.1 + 0.2 + 0.2;
  setTimeout(() => {
    if (staticEl) staticEl.style.opacity = '1';
    if (countEl)  countEl.style.opacity  = '1';
  }, revealDelay * 1000);
  return revealDelay;
}

let _citiesSpecMode = false;
let _citiesSpecTimesUpT1 = null, _citiesSpecTimesUpT2 = null;
// Same mechanism as flags.js/shapes.js: the first round after entering waits a
// short window to confirm whether a pregame is really coming (arrives shortly
// after, same real broadcast order) — only used to decide WHEN to start
// sfxGameMusic. If there's a pregame, its own onDone starts it when the 3-2-1
// ends; if none appears in that window, it's a join mid-game and it must start
// HERE — without this, a spectator joining mid-game was left with sfxMenuMusic
// playing forever, because citiesSpectatorShowPregame() (the only place that
// started sfxGameMusic) never ran.
let _citiesSpecIsFirstRound = true;
let _citiesSpecPregameSeen  = false;
// Same guard flags.js/shapes.js already have for sfxTickdown: by VALUE (same
// timeLeft repeated) and by REAL TIME elapsed (the mid-game join resend + the
// next live tick can arrive back-to-back with DIFFERENT values, neither blocked
// by the value-only guard) — without this the last-10s beep played
// repeated/choppy when joining right in that window.
let _citiesSpecLastTick = null;
let _citiesSpecLastTickSoundAt = 0;

window.citiesSpectatorEnter = function () {
  _citiesSpecMode = true;
  window._isSpectating = true;
  _citiesSpecLastTick = null;
  _citiesSpecLastTickSoundAt = 0;
  _citiesSpecIsFirstRound = true;
  _citiesSpecPregameSeen  = false;
  window.pendingGameMode = 'game';
  _citiesSpecLastCard = null;
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';
  if (typeof loadGameSFX === 'function') loadGameSFX();
  if (typeof loadBadges === 'function') loadBadges();
  // Leftovers from other modes spectated earlier in this tab without going
  // through their own Exit — same case already handled in flags.js/shapes.js.
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
  clearTimeout(_citiesSpecTimesUpT1); clearTimeout(_citiesSpecTimesUpT2);
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
  // mode/spectated game in this tab, since nothing else touches them until the
  // NEXT correct answer. progressContainer may also have been left with the
  // classes of an in-progress emptying cycle.
  progressContainer.classList.remove('train-animation', 'dots-fade-out');
  updateDotsUI();
  timerNumberEl.textContent = GAME_DURATION;
  timerNumberEl.classList.remove('timer-number-infinity');
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown.png';
  countdownImg.style.animationPlayState = 'running';

  // Visible right away, whether or not a 3-2-1 is running — #pregame-countdown
  // is a TRANSPARENT overlay (no background, see CSS), so the real player sees
  // the map behind the number from the first instant of the 3-2-1.
  // citiesSpectatorShowPregame() used to hide it again thinking the map should
  // be covered during the count — leaving the spectator with a blank screen
  // until it finished, unlike the real player.
  gameWrapper.style.display = 'block';
  // redimensionarJuego() bails immediately (does NOTHING) if gameWrapper is
  // still display:none — so it must go AFTER showing it, not before. With the
  // old order this call was a silent no-op: the map kept the OLD
  // transform/scale (from the last time it was computed, or none) through the
  // whole 3-2-1, only corrected when citiesSpectatorShowPregame() called it
  // again in its onDone — the reported "mapimage misplaced during the
  // 3-2-1-GO, only settles when the game starts".
  redimensionarJuego();
  cityTagEl.style.visibility = 'hidden';
  // slideMonumentIn() leaves cityTagEl POSITIONED at its visible landing point
  // (left:-50/top:-55, see that function) — visibility:hidden only covers it,
  // it's still "standing" there. slideTagIn() (the real Cities entry) animates
  // FROM the element's current position TO the landing one — if it already
  // starts at the landing one (the Monuments one, which visually coincides),
  // there's nothing to travel: the tag appeared instantly, already in place
  // ("in the middle"), instead of sliding left to right as it should. Same
  // start-position reset the real startGame() does.
  cityTagEl.style.transition = 'none';
  cityTagEl.style.left = tpx(-525);
  cityTagEl.style.top  = tpx(-163);
  monumentImgEl.style.display = 'none';
  // Reset the sign's <img> to tag3.png — slideTagIn() NEVER touches it (assumes
  // it's already tag3.png, as the real startGame() leaves it); if the spectator
  // was watching Monuments in this tab, slideMonumentIn had left it at
  // photo.png and it stayed stuck there forever in Cities.
  const _cityTagImg = cityTagEl.querySelector('img');
  // slideMonumentIn() leaves the 'monument-appear' class (scale animation, see
  // @keyframes in style.css) on this same <img> — unlike the real startGame()
  // (below in this file), this spectator reset never removed it. With the class
  // still on, the next Cities slideTagIn() fires ITS entry animation (movement)
  // ON TOP of the pending monument-appear one — two overlapping entry
  // animations, the old (monuments, feels like a "zoom out" on
  // finishing/reverting) and the correct one (the reported "tag3 does two entry
  // animations in spectator mode" — only there, because the real player goes
  // through startGame(), which already removed it).
  if (_cityTagImg) { _cityTagImg.src = 'images/tag3.png'; _cityTagImg.style.width = ''; _cityTagImg.style.height = ''; _cityTagImg.classList.remove('monument-appear'); }
  monumentImgEl.classList.remove('monument-appear');
  cityTagText.style.display = '';
  // Hide/clear the MONUMENT name (monumentNameEl, a DIFFERENT element from
  // cityTagText) — if the spectator was watching Monuments, that name stayed
  // visible over the Cities sign (the reported "still shows the monument name
  // in the cities tag3"). CRITICAL: also cancel slideMonumentIn's delayed
  // setTimeout (_nameTimer) — that timer sets monumentNameEl.textContent AFTER
  // a delay for the animation; if pending on the transition to Cities, it fired
  // later and RE-WROTE the monument name over the city sign, even after we
  // cleared it here.
  if (typeof slideMonumentIn === 'function' && slideMonumentIn._nameTimer) {
    clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null;
  }
  if (monumentNameEl) { monumentNameEl.textContent = ''; monumentNameEl.style.opacity = '0'; }
  // Remove any sign "ghost" left over from Monuments — it's a clone of
  // #city-tag (which includes a clone of #monument-name with its text) and
  // self-removes after ~800ms, but during that time it would show the monument
  // name over Cities.
  document.querySelectorAll('.city-tag-ghost').forEach(g => g.remove());

  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(render);

  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// switchingMode=true: the spectated player's campaign chained to ANOTHER mode —
// see long comment in flagsSpectatorExit (same mechanism here).
window.citiesSpectatorExit = function (switchingMode) {
  _citiesSpecMode = false;
  if (!switchingMode) window._isSpectating = false;
  // See long comment in flagsSpectatorExit.
  document.getElementById('cities-spec-lb-entry')?.remove();
  document.getElementById('cities-spec-lb-opp')?.remove();
  // Like the REAL quit: without this, the 3-2-1's showStep() kept running in
  // the background (never aborted), and eventually reached its onDone() — which
  // starts sfxGameMusic — OVERWRITING the menu music closeSpectator() had just
  // set. The countdown beep (sfxCountdown) also kept playing because nothing
  // paused it.
  pregameAborted = true;
  clearTimeout(pregameTimeout); pregameTimeout = null;
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  _citiesSpecLastCard = null;
  mapGameOver = true;
  clearTimeout(_citiesSpecTimesUpT1); clearTimeout(_citiesSpecTimesUpT2);
  window.citiesSpectatorHidePostgame();
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  // window._vsShowingResult (see _exitWaitAsSpectator in vs.js, same guard in
  // flagsSpectatorExit/shapesSpectatorExit): this exit isn't an EXTERNAL
  // spectator closing their session — it's THE PLAYER themselves about to see
  // THEIR OWN duel result. Without this guard, the game map/state disappeared
  // (gameWrapper hidden + state=null) before the result overlay showed, instead
  // of staying frozen in the background (the reported "background assets get
  // removed", same bug as flags/shapes).
  if (!window._vsShowingResult) {
    gameWrapper.style.display = 'none';
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

// 3-2-1 count: reuses 100% of runPregameCountdown (same pattern as
// runFlagsPregame/runShapesPregame in their own files).
window.citiesSpectatorShowPregame = function (payload) {
  if (!_citiesSpecMode) return;
  // Synchronous, as soon as the broadcast arrives — used by
  // citiesSpectatorShowRound's "fallback" timer to decide whether a 3-2-1 is
  // really running or nobody will send a pregame (mid-game join).
  _citiesSpecPregameSeen = true;
  window.citiesSpectatorHidePostgame();
  // Do NOT hide gameWrapper here — see the long comment in
  // citiesSpectatorEnter(). The map must stay visible BEHIND the 3-2-1 from the
  // first instant, like the real player sees.
  cityTagEl.style.visibility = 'hidden';
  // Do NOT hide #countdown-widget here — same reason as gameWrapper above: the
  // real startGame() leaves it VISIBLE from the start (only hidden in the
  // special Monuments "recording-mode" case, which doesn't apply to Cities),
  // just pauses its animation via animationPlayState — that part is replicated
  // below.
  if (payload) {
    timerNumberEl.classList.toggle('timer-number-infinity', !!payload.infinite);
    timerNumberEl.textContent = payload.infinite ? '∞' : (payload.duration != null ? payload.duration : '');
  }
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown.png';
  countdownImg.style.animationPlayState = 'paused';
  if (typeof playMusic === 'function') playMusic(null);
  // The real player already shows their accumulated campaign score from the
  // start of the 3-2-1 (doesn't start at 0 unless it's the first mode) — here
  // without animation, the base state before the first answer. render() only
  // animates displayedScore->score when they differ, so starting both equal
  // triggers no extra tween.
  if (payload && typeof payload.campaignBaseAtStart === 'number' && state) {
    state.score = payload.campaignBaseAtStart;
    state.displayedScore = payload.campaignBaseAtStart;
    scoreValueEl.textContent = payload.campaignBaseAtStart.toLocaleString();
  }
  let elapsedMs = (payload && typeof payload.startedAt === 'number') ? (Date.now() - payload.startedAt) : 0;
  // Same clamp as flags/shapes: without it, clock skew or a late resend could
  // inflate elapsedMs past the total 3-2-1 duration and jump STRAIGHT to onDone
  // showing none of the count.
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

// payload = { mode:'game', index, cityName, countryCode, lat, lon, timeLeft }
window.citiesSpectatorShowRound = function (payload) {
  if (!_citiesSpecMode || !state) return;
  // Same waiting spinner flags.js/shapes.js turn off here (see
  // _showVsWaitSpinner/_hideVsWaitSpinner in vs.js) — cities/monuments didn't
  // have it, so in a group room it stayed stuck until a separate timeout.
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  // NOTE: pin1Anim/pin2Anim/resultLabel are NOT touched here — the REAL
  // nextCity() doesn't touch them either. The real player calls nextCity()
  // ~750ms after the click (300ms until pin2 appears + ~100ms until it "lands"
  // + ~350ms more in onLanded), well BEFORE the pins start fading on their own
  // (that begins around 1000-1300ms after the click, with its own independent
  // setTimeouts set in citiesSpectatorResolvePick). Clearing them here as soon
  // as the next round arrived would cut their fade in half — they visibly
  // vanished instead of fading out, the reported "no animation". Leave them:
  // they clear naturally when their own fade ends (opacity<=0 →
  // state.pinXAnim=null, see render()).
  state.phase = 'waiting';
  state.cityShownAt = Date.now();
  state.currentCity = { name: payload.cityName, country: payload.countryCode, lat: payload.lat, lon: payload.lon };
  // Ensure the MONUMENT name (monumentNameEl, child of #city-tag) is clear on
  // EVERY Cities round — not just on enter. If the spectator was watching
  // Monuments, that name could still have text/opacity (and slideTagIn clones
  // #city-tag for its ghost, carrying it along). Also cancel slideMonumentIn's
  // delayed timer in case it's pending.
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  if (monumentNameEl) { monumentNameEl.textContent = ''; monumentNameEl.style.opacity = '0'; }
  slideTagIn(payload.cityName, payload.countryCode);
  if (typeof payload.timeLeft === 'number') {
    state.timeLeft = payload.timeLeft;
    timerNumberEl.textContent = payload.timeLeft;
    timerNumberEl.classList.remove('timer-number-infinity');
  }
  // Same mechanism as flags.js/shapes.js: only on the first round after
  // entering, a short window to confirm whether a pregame is really coming
  // (arrives shortly after, same real broadcast order). If none appears, it's a
  // mid-game join — only then, with the round already shown, does game music
  // start (if there's a pregame, its own onDone starts it when the 3-2-1 ends)
  // — without this, a spectator joining mid-game was left with sfxMenuMusic
  // playing forever.
  if (_citiesSpecIsFirstRound) {
    _citiesSpecIsFirstRound = false;
    setTimeout(() => {
      // Guard against the reported "game music keeps playing" in VS: if by the
      // time this timer fires the spectator mode was already exited (e.g. the
      // player watching on loan already saw the final result, see
      // _exitWaitAsSpectator in vs.js), don't overwrite the postgameloop
      // _showVsResult() already set playing.
      if (!_citiesSpecMode) return;
      if (!_citiesSpecPregameSeen && typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') {
        playMusic(sfxGameMusic);
      }
    }, 400);
  }
};

// payload = { correct, score, grade, clickX, clickY, correctX, correctY, distKm, totalGained, bonusAmt }
// Recreates pin1Anim/pin2Anim EXACTLY like the real click handler — same canvas
// coordinates (portable 1:1, same DISPLAY_W/H) — so render() animates and
// interpolates them on its own, untouched.
window.citiesSpectatorResolvePick = function (payload) {
  if (!_citiesSpecMode || !state || !state.currentCity) return;
  const { grade, clickX, clickY, correctX, correctY, distKm, totalGained, bonusAmt } = payload;
  if (typeof clickX !== 'number' || typeof correctX !== 'number') return;
  state.phase = 'animating';
  if (typeof sfxPin !== 'undefined' && typeof sfxPlay === 'function') { sfxPin.currentTime = 0; sfxPlay(sfxPin); }

  // payload.score ALREADY has campaignBase() added (see _specReportAnswer in the
  // real player) — just update state.score, render() animates
  // state.displayedScore toward it on its own, like the player sees. This was
  // never set here before (spectate.js's dispatch only calls resolvePick, not
  // updateScore, for solo/campaign spectating) — the scoreboard stayed frozen
  // the whole round.
  if (typeof payload.score === 'number') state.score = payload.score;

  // Floating "+points" — ONLY the hit value, WITHOUT the inRowBonus (shown
  // separately in the "IN A ROW" badge), like the real player.
  const _hitPoints = totalGained - (payload.inRowBonus || 0);
  if (typeof totalGained === 'number' && _hitPoints > 0 && typeof showScorePopup === 'function') {
    showScorePopup(_hitPoints);
  }
  // Speed-bonus sign — same toggle as the real click handler.
  if (typeof bonusAmt === 'number' && bonusAmt > 0) {
    clearTimeout(speedBonusHideId);
    speedBonusText.classList.remove('visible');
    void speedBonusText.offsetWidth;
    speedBonusText.classList.add('visible');
    speedBonusHideId = setTimeout(() => speedBonusText.classList.remove('visible'), 1600);
  }

  let _dotFontSize = 11;
  ctx.font = `bold ${_dotFontSize}px Georgia`;
  const _dotLabel = (typeof tCity === 'function') ? tCity(state.currentCity.name) : state.currentCity.name;
  while (_dotFontSize > 7 && ctx.measureText(_dotLabel).width > 90) {
    _dotFontSize--;
    ctx.font = `bold ${_dotFontSize}px Georgia`;
  }
  state.placedDots.push({
    x: correctX, y: correctY, name: state.currentCity.name,
    labelOpacity: 1, labelBorn: Date.now(),
    permanent: grade === 'perfect', fontSize: _dotFontSize,
  });

  // advanceDot() (the same function the real player uses) does EVERYTHING: adds
  // the point, draws the train, and if it reaches 10 fires the "+5s" with its
  // popup and the emptying animation — reusing it here avoids reimplementing
  // that sequence by hand. payload.dots carries the spectated player's REAL
  // post-increment value — the local counter is overwritten BEFORE calling
  // advanceDot() (which does state.dots++ internally) so it lands exactly at
  // payload.dots, so the train fills/empties at the same moment the real player
  // sees, regardless of when the spectator joined.
  if (grade !== 'wayoff' && typeof advanceDot === 'function') {
    if (typeof payload.dots === 'number') state.dots = payload.dots - 1;
    advanceDot();
  }

  state.pin1Anim = { x: clickX, y: clickY, targetX: correctX, targetY: correctY,
    distKm, grade, progress: 0, lineProgress: 0, opacity: 1, fading: false,
    wobbleTime: 0, sunburstSpawned: false };
  const capturedPin1 = state.pin1Anim;

  setTimeout(() => {
    if (!_citiesSpecMode || state.pin1Anim !== capturedPin1) return; // round already changed
    state.pin2Anim = { x: correctX, y: correctY, progress: 0, opacity: 1, fading: false,
      wobbleTime: 0, starsSpawned: false,
      onLanded: () => {
        spawnStars(correctX, correctY);
        setTimeout(() => {
          if (!_citiesSpecMode) return;
          showResultLabel(correctX, correctY, grade, 0, 0);
          // "IN A ROW" badge — same mechanism as the Monuments spectator (see
          // monumentsSpectatorResolvePick): payload.streak travels as a number
          // and getBadgeImg rebuilds it locally. Cities now also sends real
          // streak/inRowBonus (see Cities scoring), so the badge looks the same
          // as for the player.
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

window.citiesSpectatorUpdateTimer = function (timeLeft) {
  if (!_citiesSpecMode || !state) return;
  state.timeLeft = timeLeft;
  timerNumberEl.textContent = timeLeft;
  timerNumberEl.classList.remove('timer-number-infinity');
  if (timeLeft <= 10) {
    timerNumberEl.style.color = '#ffffff';
    countdownImg.src = 'images/countdownred.png';
    const _nowTick = Date.now();
    if (timeLeft > 0 && timeLeft !== _citiesSpecLastTick && (_nowTick - _citiesSpecLastTickSoundAt) > 700
        && typeof sfxTickdown !== 'undefined') {
      sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown);
      _citiesSpecLastTickSoundAt = _nowTick;
    }
  } else {
    timerNumberEl.style.color = '';
    countdownImg.src = 'images/countdown.png';
  }
  _citiesSpecLastTick = timeLeft;
};

// score = the real player's current score (from the 'answer' broadcast). The
// "counting up" to it is animated by render() on its own (compares
// state.displayedScore vs state.score each frame) — nothing else needed here.
// This dispatch (fns.updateScore) is used to "catch up" on joining mid-round
// (onScoreSync, see spectate.js), not for a live answer (that goes through
// citiesSpectatorResolvePick, which also sets state.score but lets render()
// animate the rise). Here displayedScore is also set so it appears directly,
// with no animated jump from 0 on connecting.
window.citiesSpectatorUpdateScore = function (score, dots) {
  if (!_citiesSpecMode || !state) return;
  state.score = score;
  state.displayedScore = score;
  scoreValueEl.textContent = (score + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
  // dots: the train's ALREADY-accumulated progress at the moment of connecting
  // — without this, someone joining mid-game saw an empty train until the real
  // player's NEXT correct answer, instead of the real progress already made.
  if (typeof dots === 'number') {
    state.dots = Math.max(0, Math.min(dots, DOTS_NEEDED - 1));
    updateDotsUI();
  }
};

// Single card in #leaderboard for the spectated REAL player — same pattern as
// flagsSpectatorSetPlayerCard/shapesSpectatorSetPlayerCard, but here the real
// leaderboard already has the guard `if (window._isSpectating) return;` in
// initLeaderboard() (added there with this case in mind). #leaderboard IS shared
// with the normal Cities/Monuments resize/zoom logic (see
// window.addEventListener('resize', ...) below, which now calls
// citiesSpectatorReposition() instead of positionLeaderboard() while
// spectating) — so name/avatar/score are cached, to reapply the correct 1-row
// height without needing that data again.
let _citiesSpecLastCard = null;
// oppName/oppAvatar/oppScore (optional): in versus, the spectated friend's
// rival — this function used to only show the friend (redundant with the main
// scoreboard, which ALREADY shows it), and the rival didn't appear anywhere.
// Now it builds a SECOND row (same lb-vsopp style the real player uses for
// theirs), so the spectator sees both cells updating live, like the real
// players do.
window.citiesSpectatorSetPlayerCard = function (name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode) {
  if (!_citiesSpecMode) return;
  _citiesSpecLastCard = { name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode };
  const lb = document.getElementById('leaderboard');
  if (!lb) return;
  const rowH = getLbRowHeight();
  const showOpp = !!oppName;
  // #leaderboard clips anything outside its own height with
  // clip-path:inset(0 -300px) (0 top/bottom — the CSS notes: "clips only
  // vertically, lets the globe through on the left"). The wrongEffect
  // emote-bubble draws ABOVE its row (bottom:calc(80%-...), "above the entry"
  // per the CSS) — if the top row sits exactly at the container's top:0 (as it
  // did here, no extra margin), that bubble is born already clipped by the
  // clip-path before it can show. TOP_MARGIN reserves headroom so it has
  // somewhere to draw — the real leaderboard doesn't suffer this because its
  // multi-row window usually leaves plenty of margin above the emoting row.
  const TOP_MARGIN = Math.round(rowH * 0.4);
  lb.style.height = (showOpp ? rowH * 2 + LB_GAP + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';
  let el = document.getElementById('cities-spec-lb-entry');
  if (!el) {
    el = document.createElement('div');
    el.className = 'lb-entry lb-player';
    el.id = 'cities-spec-lb-entry';
    el.style.top = TOP_MARGIN + 'px';
    el.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" id="cities-spec-lb-avatar" src="images/profilepic/ppdefault.png"></div>`
      + `<span class="lb-name" id="cities-spec-lb-name"></span>`
      + `<span class="lb-score" id="cities-spec-lb-score">0</span>`;
    lb.appendChild(el);
  }
  const nameEl = document.getElementById('cities-spec-lb-name');
  if (nameEl) nameEl.textContent = name || 'Jugador';
  const avatarEl = document.getElementById('cities-spec-lb-avatar');
  if (avatarEl && avatar) avatarEl.src = avatar;
  const scoreEl = document.getElementById('cities-spec-lb-score');
  if (scoreEl) scoreEl.textContent = (score || 0).toLocaleString();
  window.CustomizeAssets?.applyCard(el, cardCode || '0001');

  let oppEl = document.getElementById('cities-spec-lb-opp');
  if (showOpp) {
    if (!oppEl) {
      oppEl = document.createElement('div');
      oppEl.className = 'lb-entry lb-vsopp';
      oppEl.id = 'cities-spec-lb-opp';
      oppEl.style.top = (TOP_MARGIN + rowH + LB_GAP) + 'px';
      oppEl.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" id="cities-spec-lb-opp-avatar" src="images/profilepic/ppdefault.png"></div>`
        + `<span class="lb-name" id="cities-spec-lb-opp-name"></span>`
        + `<span class="lb-score" id="cities-spec-lb-opp-score">0</span>`;
      lb.appendChild(oppEl);
    }
    window.CustomizeAssets?.applyCard(oppEl, oppCardCode || '0001');
    const oppNameEl = document.getElementById('cities-spec-lb-opp-name');
    if (oppNameEl) oppNameEl.textContent = oppName || 'Rival';
    const oppAvatarEl = document.getElementById('cities-spec-lb-opp-avatar');
    if (oppAvatarEl && oppAvatar) oppAvatarEl.src = oppAvatar;
    const oppScoreEl = document.getElementById('cities-spec-lb-opp-score');
    if (oppScoreEl) oppScoreEl.textContent = (oppScore || 0).toLocaleString();
    // Reorder by current rank — same rule as the real positionLeaderboard()
    // (higher score on top), using .lb-entry's CSS transition:top so the rank
    // change animates rather than snapping. The two rows used to ALWAYS stay in
    // a fixed order (friend on top, rival below) regardless of who was winning.
    const friendOnTop = (score || 0) >= (oppScore || 0);
    el.style.top    = (TOP_MARGIN + (friendOnTop ? 0 : rowH + LB_GAP)) + 'px';
    oppEl.style.top = (TOP_MARGIN + (friendOnTop ? rowH + LB_GAP : 0)) + 'px';
  } else if (oppEl) {
    oppEl.remove();
  } else {
    el.style.top = TOP_MARGIN + 'px';
  }
};

// "wrong" flash on the spectator row — target: 'friend' | 'opponent'.
// Same visual mechanism as _lbWrongEffect (lb-wrong-flash/lb-shake animation +
// emote), but on the spectator's own rows instead of lbElements (those don't
// exist while spectating, initLeaderboard() is blocked by the
// window._isSpectating guard).
window.citiesSpectatorWrongEffect = function (target) {
  if (!_citiesSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'cities-spec-lb-opp' : 'cities-spec-lb-entry');
  if (!el) return;
  el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // Raised z-index for the emote's duration — both rows (.lb-player/.lb-vsopp)
  // share the same base z-index, so which is "on top" in a tie depends on DOM
  // order, not on who has the active emoji. Without this temporary boost, the
  // row with the emoji could be covered by the other during the rank-reorder
  // animation (top transition), which briefly overlaps them.
  const prevZ = el.style.zIndex;
  el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 1800);
  if (typeof spawnEmoteBubble === 'function') spawnEmoteBubble(el);
};

// Reapply the card's height/position after a resize/zoom — see the
// addEventListener('resize', ...) below. Not needed if no card was ever shown
// (_citiesSpecLastCard null).
window.citiesSpectatorReposition = function () {
  if (!_citiesSpecMode || !_citiesSpecLastCard) return;
  window.citiesSpectatorSetPlayerCard(_citiesSpecLastCard.name, _citiesSpecLastCard.avatar, _citiesSpecLastCard.score);
};

window.citiesSpectatorShowTimesUp = function () {
  if (!_citiesSpecMode) return;
  clearTimeout(_citiesSpecTimesUpT1);
  clearTimeout(_citiesSpecTimesUpT2);
  if (typeof playMusic === 'function') playMusic(null);
  if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
  countdownImg.style.animationPlayState = 'paused';
  timeupOverlay.style.display = 'flex';
  timeupOverlay.classList.remove('timeup-out');
  timeupOverlay.classList.add('timeup-in');
  _citiesSpecTimesUpT1 = setTimeout(() => {
    if (!_citiesSpecMode) return;
    timeupOverlay.classList.remove('timeup-in');
    timeupOverlay.classList.add('timeup-out');
    _citiesSpecTimesUpT2 = setTimeout(() => {
      if (!_citiesSpecMode) return;
      timeupOverlay.style.display = 'none';
      timeupOverlay.classList.remove('timeup-out');
    }, 400);
  }, 1800);
};

// Results screen (solo/campaign path only — versus has its own W/L screen, not
// covered here). Read-only: pointer-events:none + hidden confirm, like flags/shapes.
window.citiesSpectatorShowPostgame = function (payload) {
  if (!_citiesSpecMode) return;
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'none';
  gameoverScreen.classList.remove('mode-flags', 'mode-shapes', 'mode-monuments');
  gameoverScreen.style.pointerEvents = 'none';
  // Same sprite swap the real player's loading-play-btn does — elements SHARED
  // between modes.
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level3complete.png');
  // Same swap for the big correct/wrong icons — was missing entirely here
  // (unlike the sprites above, which were updated), so they stayed with what
  // ANOTHER mode left (e.g. Shapes' check2/wrong2) instead of Cities'
  // check3/wrong3.
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check3.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong3.png');
  if (typeof window.hideGameoverConfirm === 'function') window.hideGameoverConfirm();
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = 'none';
  gameoverScreen.style.display = 'flex';
  const label = gameoverScreen.querySelector('.gameover-text1-label');
  if (label) label.textContent = (typeof t === 'function') ? t('gameover.cities') : 'City Blitz';
  if (finalScoreEl) finalScoreEl.textContent = (payload.totalScore || 0).toLocaleString();
  if (newHighscoreBanner) newHighscoreBanner.style.display = payload.isNewHighscore ? 'flex' : 'none';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'none';
  // Rebuild the individual icon rows (correct/wrong) with the spectated
  // player's real counts — the real buildChecksRow()/buildWrongsRow() use
  // gradeCounts/wrongCount (the player's LOCAL state, which doesn't exist
  // here), so build an own simple version reusing
  // getModeCheckImg()/getModeWrongImg() (already return check3/wrong3 for
  // 'game' via window.pendingGameMode). Without this, the rows kept the count
  // AND icon from the LAST time they were really built.
  {
    const nCorrect = payload.correctCount || 0;
    const checksEndTime = _specBuildCountRow(
      document.getElementById('gameover-checks-row'),
      gameoverScreen.querySelector('.game-bg-check3'),
      gameoverScreen.querySelector('.grade-count-total'),
      nCorrect, (typeof getModeCheckImg === 'function') ? getModeCheckImg() : 'images/check3.png', 0);
    _specBuildCountRow(
      document.getElementById('gameover-wrongs-row'),
      gameoverScreen.querySelector('.game-bg-wrong3'),
      gameoverScreen.querySelector('.wrong-count-total'),
      payload.wrongCount || 0, (typeof getModeWrongImg === 'function') ? getModeWrongImg() : 'images/wrong3.png',
      // Like the real endGame(): the wrongs only start once the correct row
      // finishes entering, not both at once.
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
  // Like the real endGame(): the scoreboard makes no sense on the results
  // screen either — without this it stayed stuck, visible in the background.
  scoreDisplayEl.style.display = 'none';
  if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
};

window.citiesSpectatorHidePostgame = function () {
  if (gameoverScreen) { gameoverScreen.style.display = 'none'; gameoverScreen.style.pointerEvents = ''; }
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = '';
};
// ═════════════════════════════════════════════════════════════════════════════
