// Stylesheet with the countdown/train layout and the tag enter/exit
// animations — injected ONCE, the first time it's needed (real showCountryShape
// or the spectator, whichever comes first). Extracted to a shared function so
// both use EXACTLY the same CSS — the spectator never injected it (if that tab
// hadn't played a real shapes game yet), and without it .shape-tag-enter had no
// associated animation (tags stayed pinned off-screen, translateX(300%),
// because nothing fired 'animationend' to bring them into place) and
// #shapes-progress-dots had no horizontal flex layout (dots stacked in a block).
function ensureShapeTagStyle() {
  if (document.getElementById('shape-tag-style')) return;
  const st = document.createElement('style');
  st.id = 'shape-tag-style';
  st.textContent = `
    #shapes-progress-dots {
      position: absolute; bottom: 1.1cqmin; left: 1cqmin; width: 100%;
      display: flex; justify-content: center; gap: 0.44cqmin; padding: 0 0.66cqmin;
      pointer-events: none; z-index: 11; transition: opacity 0.5s ease; opacity: 1;
    }
    #shapes-progress-dots.dots-fade-out { opacity: 0; }
    #shapes-progress-dots.train-animation .dot {
      animation: trencito-colors 0.8s linear infinite !important;
      transition: none !important;
      transform: scale(1.2);
    }
    #shapes-progress-dots.train-animation .dot:nth-child(1)  { animation-delay: -0.9s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(2)  { animation-delay: -0.8s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(3)  { animation-delay: -0.7s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(4)  { animation-delay: -0.6s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(5)  { animation-delay: -0.5s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(6)  { animation-delay: -0.4s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(7)  { animation-delay: -0.3s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(8)  { animation-delay: -0.2s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(9)  { animation-delay: -0.1s !important; }
    #shapes-progress-dots.train-animation .dot:nth-child(10) { animation-delay: 0s !important; }
    @keyframes shapeTagSwingOut {
      0%   { transform: translateX(0)    scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
      100% { transform: translateX(300%) scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
    }
    .shape-tag-exit { animation: shapeTagSwingOut 0.2s ease-in forwards; transition: none !important; }
    @keyframes shapeTagSwing {
      0%   { transform: translateX(300%) scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
      60%  { transform: translateX(-6%)  scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
      80%  { transform: translateX(3%)   scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
      100% { transform: translateX(0)    scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
    }
    .shape-tag-enter { animation: shapeTagSwing 0.35s cubic-bezier(0.22,1,0.36,1) forwards; transition: none !important; }
  `;
  document.head.appendChild(st);
}

let _shapeGroupCount = 0;
const sfxLevel2 = new Audio('sfx/level2.mp3');
if (typeof isMuted !== 'undefined' && isMuted) sfxLevel2.volume = 0;
let shapesStreak = 0;
let shapesRoundStartTime = null;
let shapesTimeLeft = window.GAME_DURATION;
// The timer's real source of truth (see the shapesTimeLeft setInterval below)
// — shapesTimeLeft is just the derived value that's displayed.
let shapesTimerDuration  = window.GAME_DURATION;
let shapesTimerStartedAt = 0;
let shapesTimerIntervalId = null;
let shapesRunning = false;
let shapesGameOver = false;

function shapesBlockInput() {
  if (document.getElementById('shapes-input-blocker')) return;
  const b = document.createElement('div');
  b.id = 'shapes-input-blocker';
  b.style.cssText = 'position:absolute;inset:0;z-index:9999;pointer-events:all;cursor:default;';
  (window.appStage || document.body).appendChild(b);
}
function shapesUnblockInput() {
  document.getElementById('shapes-input-blocker')?.remove();
}
let shapesDots = 0;
let shapesTrainTimeouts = [];
let shapesCurrentImg = null, shapesCurrentImg2 = null, shapesCurrentClip = null;
let shapesCurrentBoard = null, shapesCurrentSvg = null;
let shapesCurrentAnimTimeout = null, shapesCurrentClipFadeTimeout = null;
let shapesWrongAnswerCount = 0;
let shapesSpeedBonusHideId = null;
const SHAPES_SPEED_WIN  = 2.0;
const SHAPES_SPEED_MULT = 1.5;
const SHAPES_GRACE      = 0.8;
let shapesScore = 0;
let shapesDisplayedScore = 0;
let shapesScoreRafId = null;
let shapesAnsweredSet = new Set();
let shapesWrongCooldown = new Map(); // country name → remaining questions before re-entry
let shapesCorrectCount = 0;
let shapesPracticePool = [];
let shapesPracticeRemaining = [];
let shapesPracticeCurrent = null;

// ── Seeded RNG for Versus (same questions on both clients) ──────────────────
let _shapesSeededRand = null;
function shapesRand() { return _shapesSeededRand ? _shapesSeededRand() : Math.random(); }
window.shapesSetSeed = function(seed) {
  let s = seed >>> 0; if (!s) s = 1;
  _shapesSeededRand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
};
window.shapesClearSeed = function() { _shapesSeededRand = null; };

// ═════════════════════════════════════════════════════════════════════════════
// SPECTATOR MODE — same pattern as flags.js: reuses the REAL game screen in
// read-only mode (no simplified panel), with ephemeral broadcasts
// (round/answer/tick/timesup/pregame/postgame) the rest of the system already
// uses (js/spectate.js, js/vs.js). Unlike flags, here the round elements
// (silhouette/tags/board) are dynamic DOM created/destroyed per round
// (showCountryShape) — the spectator replicates that same construction instead
// of showing/hiding fixed slots.
// ═════════════════════════════════════════════════════════════════════════════
let _shapesSpecMode = false;
let _shapesSpecTagEls = [];
let _shapesSpecSvg = null, _shapesSpecBoard = null, _shapesSpecImg = null, _shapesSpecClip = null;
let _shapesSpecTimesUpTimeout1 = null, _shapesSpecTimesUpTimeout2 = null;
let _shapesSpecLastTick = null;
// Same reason as _flagsSpecLastTickSoundAt in flags.js: the value guard above
// isn't enough if the mid-game join resend and the next live tick arrive
// back-to-back with DIFFERENT values — this real-time guard covers that case.
let _shapesSpecLastTickSoundAt = 0;
let _shapesSpecCorrectSlot = null; // correctSlot travels in the 'round' — resolvePick uses it from here, not the 'answer' payload (which doesn't send it)
// Marks the round (by its silhouette <img> element) that got resolved
// ('answer' payload) BEFORE its tags finished revealing — typical case: a
// spectator joins mid-round just as the spectated player is about to answer.
// Without this, revealTags() still showed the tags (already-old round) and
// resolvePick's swing-out-remove, scheduled 500-700ms later, ended up deleting
// the WHOLE round (freshly appeared tags + silhouette) at once — visible as a
// weird flash / "duplicate tag2".
let _shapesSpecAnsweredImg = null;
let _shapesSpecIsFirstRound = true; // first round after entering: tags wait for the 3-2-1 to end, like showShapesMode() with its startDelay
let _shapesSpecPregameSeen = false; // set true as soon as the pregame broadcast arrives (synchronous, doesn't wait for the count to end)
// Gate against the same race already fixed in flags.js: revealTags() must NOT
// be scheduled with a GUESSED wait (PREGAME_DURATION - 400) from when the round
// data arrives — if the spectator joins the 3-2-1 late (the elapsedMs clamp
// shortens it to ~400ms for them), the visual count ends fast but that guessed
// wait kept running almost 3 more seconds, leaving the board/silhouette absent
// all that time (the reported "board takes 2s to appear"). _shapesSpecCountdownDone
// starts true (mid-round join, no 3-2-1) — shapesSpectatorShowPregame sets it
// false on start and true in its REAL onDone, the only point where
// _shapesSpecPendingReveal is consumed if it was waiting.
let _shapesSpecCountdownDone = true;
let _shapesSpecPendingReveal = null;
let _shapesSpecDots = 0; // last live dots value (see same fix in flags.js: the train reset re-reads this, not a stale closure)

// Scoreboard count-up animation — same mechanism as shapesAnimateScore() (real
// player): interpolates _shapesSpecDisplayedScore toward _shapesSpecTargetScore
// instead of jumping. _shapesSpecTargetScore ALREADY has campaignBase() added
// by the broadcaster (see _specReportAnswer/_specReportPregame in the real
// player) — no need to add it again here.
let _shapesSpecTargetScore    = 0;
let _shapesSpecDisplayedScore = 0;
let _shapesSpecScoreRafId     = null;
function _shapesSpecAnimateScore() {
  if (_shapesSpecScoreRafId) return;
  const el = document.getElementById('score-value');
  let last = null;
  function tick(ts) {
    if (!_shapesSpecMode) { _shapesSpecScoreRafId = null; return; }
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    const diff = _shapesSpecTargetScore - _shapesSpecDisplayedScore;
    if (diff <= 0) { _shapesSpecScoreRafId = null; if (el) el.textContent = _shapesSpecTargetScore.toLocaleString(); return; }
    _shapesSpecDisplayedScore = Math.min(_shapesSpecTargetScore, _shapesSpecDisplayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    if (el) el.textContent = _shapesSpecDisplayedScore.toLocaleString();
    _shapesSpecScoreRafId = requestAnimationFrame(tick);
  }
  _shapesSpecScoreRafId = requestAnimationFrame(tick);
}

window.shapesSpectatorEnter = function () {
  _shapesSpecMode = true;
  window._isSpectating = true;
  window.pendingGameMode = 'shapes';
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';
  if (typeof loadGameSFX === 'function') loadGameSFX();
  if (typeof loadBadges  === 'function') loadBadges();
  ensureShapeTagStyle();
  // In case this tab already played/spectated something else: clear any
  // leftover shapes round or other-mode remnant.
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
  document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
  document.getElementById('shapes-countdown-widget')?.remove();
  // findluggage/machine/flagid are LOOSE flags elements (siblings of
  // #flags-wrapper, not its children) — if this tab played/spectated a real
  // flags game before, flagsSpectatorExit() hides them, but if it NEVER went
  // through there (the spectated player's real flags game ended and chained
  // straight to shapes without this client entering flagsSpectatorEnter/Exit in
  // THIS session) they could stay visible over the silhouette. Defensive cleanup.
  const flFindLuggage = document.getElementById('flags-findluggage');
  if (flFindLuggage) {
    flFindLuggage.style.display = 'none';
    flFindLuggage.style.transition = '';
    flFindLuggage.style.animation = '';
    flFindLuggage.style.transform = '';
    flFindLuggage.classList.remove('scrolling');
  }
  document.getElementById('flags-flagid-wrap')?.style.setProperty('display', 'none');
  document.getElementById('flags-luggage-wrap')?.style.setProperty('display', 'none');
  document.getElementById('flags-wrapper')?.style.setProperty('display', 'none');
  ['flags-machine', 'flags-machine2', 'flags-machine3', 'flags-machine3b'].forEach(id => {
    const m = document.getElementById(id);
    if (m) { m.style.display = 'none'; m.style.animationPlayState = ''; m.classList.remove('scrolling'); }
  });
  _shapesSpecTagEls = [];
  _shapesSpecSvg = _shapesSpecBoard = _shapesSpecImg = _shapesSpecClip = null;
  _shapesSpecAnsweredImg = null;
  _shapesSpecIsFirstRound = true;
  _shapesSpecPregameSeen = false;
  _shapesSpecCountdownDone = true;
  _shapesSpecPendingReveal = null;
  _shapesSpecDots = 0;

  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'block';
  // Placeholder until the first real data arrives (pregame with
  // campaignBaseAtStart, or an answer if it's a mid-round join) —
  // shapesSpectatorShowPregame/shapesSpectatorResolvePick correct it.
  _shapesSpecTargetScore = 0;
  _shapesSpecDisplayedScore = 0;
  const scoreEl = document.getElementById('score-value');
  if (scoreEl) scoreEl.textContent = '0';
  const sbt = document.getElementById('speed-bonus-text');
  if (sbt) { sbt.style.display = ''; sbt.classList.remove('visible'); }
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'flex'; rightPanel.style.zIndex = '120'; rightPanel.style.visibility = ''; }
  const lb = document.getElementById('leaderboard');
  if (lb) lb.innerHTML = '';

  // NOTE: sfxGameMusic is NOT started here — Enter() runs while the spectator
  // loading screen is still showing, before knowing whether what follows is a
  // pregame (which must be silent until GO) or a round already in progress. It
  // starts only in shapesSpectatorShowRound, at the exact point where no
  // pregame is confirmed (mid-round join) — "you enter where you should", not
  // before.
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// switchingMode=true: the spectated player's campaign chained to ANOTHER mode
// — see long comment in flagsSpectatorExit (same mechanism here).
window.shapesSpectatorExit = function (switchingMode) {
  _shapesSpecMode = false;
  if (!switchingMode) window._isSpectating = false;
  // See long comment in flagsSpectatorExit.
  document.getElementById('shapes-spec-lb-entry')?.remove();
  document.getElementById('shapes-spec-lb-opp')?.remove();
  // Like the REAL shapes quit: without this, the 3-2-1's showStep() kept
  // running in the background (never aborted), and eventually reached its
  // onDone() — which starts sfxGameMusic — OVERWRITING the menu music
  // closeSpectator() had just set. The countdown beep (sfxCountdown) also kept
  // playing because nothing paused it.
  shapesAborted = true;
  clearTimeout(shapesPregameTimeout); shapesPregameTimeout = null;
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  clearTimeout(_shapesSpecTimesUpTimeout1);
  clearTimeout(_shapesSpecTimesUpTimeout2);
  window.shapesSpectatorHidePostgame();
  const pc = document.getElementById('pregame-countdown');
  if (pc) pc.style.display = 'none';
  // window._vsShowingResult (see _exitWaitAsSpectator in vs.js, and the same
  // guard in flagsSpectatorExit): this exit isn't an EXTERNAL spectator closing
  // their session — it's THE PLAYER themselves about to see THEIR OWN duel
  // result, watching the rival on loan in shapes when their own TIME'S UP hit.
  // Unlike flags (which only hides with display:none), here the shapes
  // board/tags were actually REMOVED from the DOM (.remove()) — without this
  // guard, the result overlay appeared over an empty background instead of the
  // frozen silhouette behind (the reported "the shapes game assets get
  // removed").
  if (!window._vsShowingResult) {
    document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
    document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
    document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
    document.getElementById('shapes-countdown-widget')?.remove();
  }
  _shapesSpecTagEls = [];
  _shapesSpecSvg = _shapesSpecBoard = _shapesSpecImg = _shapesSpecClip = null;
  _shapesSpecAnsweredImg = null;
  _shapesSpecPendingReveal = null;
  _shapesSpecCountdownDone = true;
  _shapesSpecDots = 0;

  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'none';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'none'; rightPanel.style.visibility = ''; }
  const lb = document.getElementById('leaderboard');
  if (lb) lb.innerHTML = '';
  const timeupEl = document.getElementById('timeup-overlay');
  if (timeupEl) { timeupEl.style.display = 'none'; timeupEl.classList.remove('timeup-in', 'timeup-out'); timeupEl.style.zIndex = ''; }
  const sbt = document.getElementById('speed-bonus-text');
  if (sbt) sbt.classList.remove('visible');

  if (!switchingMode) {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'flex';
  }
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// 3-2-1 count: reuses runShapesPregame (100% the same animation/sound as the
// real player) — same pattern as flags.js with runFlagsPregame.
window.shapesSpectatorShowPregame = function (payload) {
  if (!_shapesSpecMode) return;
  // Synchronous, as soon as the broadcast arrives — used by
  // shapesSpectatorShowRound's "fallback" timer to decide whether a 3-2-1 is
  // really running or nobody will send a pregame (mid-round join).
  _shapesSpecPregameSeen = true;
  _shapesSpecCountdownDone = false;
  window.shapesSpectatorHidePostgame();
  // The widget already exists by this point (created by
  // shapesSpectatorShowRound, which arrives BEFORE this pregame in the real
  // broadcast order) — reflect the total duration here, so it's not blank until
  // the first 'tick'. Left VISIBLE (like flags: countdown2.png with a paused
  // "60") during the 3-2-1 — it used to be hidden with visibility:hidden here,
  // inconsistent with flags (which shows it paused) and the reason for the
  // reported "countdown doesn't show during the 3-2-1-GO".
  const tEl = document.getElementById('shapes-timer-number');
  if (tEl && payload) {
    tEl.classList.toggle('timer-number-infinity', !!payload.infinite);
    tEl.textContent = payload.infinite ? '∞' : (payload.duration != null ? payload.duration : '');
  }
  if (typeof playMusic === 'function') playMusic(null);
  // The real player already shows their accumulated campaign score from the
  // start of the 3-2-1 (doesn't start at 0 unless it's the first mode) — here
  // without animation, the base state before the first answer.
  if (payload && typeof payload.campaignBaseAtStart === 'number') {
    _shapesSpecTargetScore = payload.campaignBaseAtStart;
    _shapesSpecDisplayedScore = payload.campaignBaseAtStart;
    const scoreEl = document.getElementById('score-value');
    if (scoreEl) scoreEl.textContent = payload.campaignBaseAtStart.toLocaleString();
  }
  // If the spectator joined mid 3-2-1 (e.g. the real player is already on "1"),
  // payload.startedAt lets us compute how much passed and start right there
  // (number AND audio), instead of always showing "3" from zero.
  let elapsedMs = (payload && typeof payload.startedAt === 'number') ? (Date.now() - payload.startedAt) : 0;
  // Safeguard against clock skew between the real player's machine and this
  // client's (Date.now() isn't guaranteed synced between two different
  // computers) or against a late resend pushing the calc past the total 3-2-1
  // duration — without this clamp, an inflated elapsedMs made runShapesPregame
  // jump STRAIGHT to onDone showing none of the count (the reported
  // "3-2-1-GO doesn't show").
  const _pregameTotalMs = (typeof SHAPES_PREGAME_STEPS !== 'undefined')
    ? SHAPES_PREGAME_STEPS.reduce((s, x) => s + x.hold, 0) : 3350;
  if (elapsedMs > _pregameTotalMs - 400) elapsedMs = Math.max(0, _pregameTotalMs - 400);
  runShapesPregame(() => {
    const _cwPost = document.getElementById('shapes-countdown-widget');
    if (_cwPost) _cwPost.style.visibility = '';
    const tImg = document.getElementById('shapes-timer-img');
    if (tImg) tImg.style.animationPlayState = 'running';
    if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
    _shapesSpecIsFirstRound = false;
    // The REAL 3-2-1 (local, already corrected by elapsedMs) only ends here —
    // this is the only correct moment to reveal board/silhouette/tags, not a
    // guessed wait. If shapesSpectatorShowRound() already arrived and prepared
    // the reveal (normal case), it fires NOW; if it hasn't arrived yet
    // (latency), the gate is marked and showRound() reveals as soon as it does.
    _shapesSpecCountdownDone = true;
    if (_shapesSpecPendingReveal) {
      const fn = _shapesSpecPendingReveal;
      _shapesSpecPendingReveal = null;
      fn();
    }
  }, elapsedMs);
};

// payload = { index, mode:'shapes', prompt (=country), correctSlot, options, timeLeft }
// Replicates showCountryShape()'s construction (board+silhouette+4 tags) in
// read-only mode: no real click listeners, options already resolved by the
// broadcast instead of generated with local RNG.
window.shapesSpectatorShowRound = function (payload) {
  if (!_shapesSpecMode) return;
  // See long comment in #vs-wait-spinner (css/style.css).
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  // Without this, if this tab never played a real shapes game, the tag entry
  // animation and the train's horizontal layout didn't exist — see long comment
  // in ensureShapeTagStyle().
  ensureShapeTagStyle();
  // Clear the previous round — same cleanup the real game does before starting
  // the next (tagEls.forEach(remove) + svg/img/clip.remove()). NOTE: the board
  // (countryboard.png) is NOT removed/recreated here — it's the SAME static
  // image in ALL rounds (only the silhouette on top changes), so destroying and
  // replacing it each round made it lose its paint for an instant (~0.1s) until
  // the new <img> finished decoding — the reported "disappears and reappears".
  // Created once (below) and reused between rounds.
  _shapesSpecTagEls.forEach(t => t.remove());
  _shapesSpecTagEls = [];
  if (_shapesSpecSvg)   _shapesSpecSvg.remove();
  if (_shapesSpecImg)   _shapesSpecImg.remove();
  if (_shapesSpecClip)  _shapesSpecClip.remove();
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
  _shapesSpecAnsweredImg = null; // new round: any "already resolved" mark from the previous round no longer applies

  const country = payload.prompt;
  const options = payload.options || [];
  const correctIdx = payload.correctSlot;
  _shapesSpecCorrectSlot = correctIdx;
  const c = (typeof SHAPE_COUNTRIES !== 'undefined') ? SHAPE_COUNTRIES.find(co => co.name === country) : null;
  const ext1 = (c && c.ext1) || 'png';
  const ext2 = (c && c.ext2) || 'jpg';

  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'block';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'flex'; rightPanel.style.zIndex = '120'; }

  if (!document.getElementById('shapes-countdown-widget')) {
    const cw = document.createElement('div');
    cw.id = 'shapes-countdown-widget';
    const cwImg = document.createElement('img');
    cwImg.id = 'shapes-timer-img';
    cwImg.src = 'images/countdown3.png';
    cwImg.draggable = false;
    cwImg.style.cssText = 'width:100%;height:100%;object-fit:fill;display:block;animation:pulse-img-shadow 1s infinite paused;';
    const cwNum = document.createElement('div');
    cwNum.id = 'shapes-timer-number';
    cwNum.textContent = (typeof payload.timeLeft === 'number') ? payload.timeLeft : '';
    cwNum.style.color = 'white';
    const dotsEl = document.createElement('div');
    dotsEl.id = 'shapes-progress-dots';
    for (let d = 0; d < 10; d++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      dotsEl.appendChild(dot);
    }
    const tbEl = document.createElement('div');
    tbEl.id = 'shapes-time-bonus';
    tbEl.className = 'time-bonus';
    tbEl.setAttribute('aria-hidden', 'true');
    tbEl.innerHTML = '<span class="tb-plus">+</span><span class="tb-num">5s</span>';
    cw.appendChild(cwImg); cw.appendChild(cwNum); cw.appendChild(dotsEl); cw.appendChild(tbEl);
    (window.appStage || document.body).appendChild(cw);
  }
  positionShapesCountdown();
  // Reflect the already-filled dots (in case the spectator joined mid-streak)
  // — same value that was being transmitted in the answers.
  document.getElementById('shapes-progress-dots')?.querySelectorAll('.dot')
    .forEach((d, i) => d.classList.toggle('filled', i < _shapesSpecDots));

  const clipId = 'specArchedShape_' + (_shapeGroupCount++);
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('class', 'shapes-stage-el');
  svgEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPathEl.setAttribute('id', clipId);
  clipPathEl.setAttribute('clipPathUnits', 'objectBoundingBox');
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', 'M 0.028,0 Q 0.5,0.005 0.995,0 Q 1.01,0 1.01,0.018 Q 0.99,0.5 1,0.973 Q 1,0.99 0.982,0.99 Q 0.5,0.972 0.008,0.995 Q -0.01,0.991 -0.01,0.983 Q 0.008,0.5 0.008,0.02 Q 0.008,0 0.028,0 Z');
  clipPathEl.appendChild(pathEl);
  defs.appendChild(clipPathEl);
  svgEl.appendChild(defs);
  (window.appStage || document.body).appendChild(svgEl);
  _shapesSpecSvg = svgEl;

  // Reuse the board between rounds (see long comment above) — only created if
  // it doesn't exist yet or something external removed it from the DOM
  // (postgame/exit remove it with the rest via .shapes-stage-el).
  if (!_shapesSpecBoard || !_shapesSpecBoard.isConnected) {
    const board = document.createElement('img');
    board.className = 'shapes-stage-el';
    board.src = 'images/countryboard.png';
    board.style.cssText = 'position:absolute;top:50%;left:36%;transform:translate(-50%,-50%) scaleX(0.96);width:85.15cqmin;height:auto;z-index:99;';
    board.draggable = false;
    (window.appStage || document.body).appendChild(board);
    _shapesSpecBoard = board;
  }

  const img = document.createElement('img');
  img.className = 'shapes-stage-el';
  img.src = 'images/countries/' + country + '1.' + ext1;
  // display:none until revealed with the flash/tags (see revealTags() below) —
  // SAME as real showCountryShape(). Without this the spectator saw the country
  // already revealed (spoiler) from the start of the 3-2-1, when the real
  // player still has a blank board.
  img.style.cssText = 'position:absolute;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4cqmin;height:59.4cqmin;z-index:103;transition:transform 3s linear;display:none;';
  img.draggable = false;
  (window.appStage || document.body).appendChild(img);
  _shapesSpecImg = img;

  const clip = document.createElement('div');
  clip.className = 'shapes-stage-el';
  // fallback overflow:hidden: img2 inside is 118.8cqmin (twice this container)
  // on purpose, so the clip-path (SVG silhouette) crops it to the final shape.
  // In Firefox/Gecko (Zen Browser included) a url()-referenced clip-path
  // sometimes doesn't apply to a <div> with transformed children — without the
  // overflow here, img2 shows uncropped (huge, doesn't "fit" the frame). With
  // the overflow, worst case it's a square crop instead of the silhouette, but
  // never huge.
  clip.style.cssText = 'position:absolute;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4cqmin;height:59.4cqmin;clip-path:url(#' + clipId + ');overflow:hidden;z-index:102;opacity:0;transition:opacity 2s ease;display:none;';
  (window.appStage || document.body).appendChild(clip);
  _shapesSpecClip = clip;

  const img2 = document.createElement('img');
  img2.src = 'images/countries/' + country + '2.' + ext2;
  img2.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)' + (country === 'Rusia' ? ' scale(0.5)' : '') + ';width:118.8cqmin;height:118.8cqmin;transition:transform 3s linear;';
  img2.draggable = false;
  clip.appendChild(img2);
  // The clip fade and the shrink at 6s are scheduled INSIDE revealTags()
  // (relative to the real reveal moment, not from when the round starts) —
  // same rule as real showCountryShape() with "3000+startDelay"/"6000+startDelay".

  const tagConfigs = [
    { top: '18%', right: '27%', rot: '-5deg' },
    { top: '37%', right: '27%', rot: '2deg'  },
    { top: '57%', right: '26%', rot: '-4deg' },
    { top: '76%', right: '26%', rot: '3deg'  },
  ];

  // First round after entering: tags wait for the 3-2-1 to end (like the real
  // player's startDelay=PREGAME_DURATION); later rounds appear immediately
  // (startDelay=0), like showCountryShape() with no pregame.
  const PREGAME_DURATION = (typeof SHAPES_PREGAME_STEPS !== 'undefined')
    ? SHAPES_PREGAME_STEPS.reduce((s, x) => s + x.hold, 0) : 0;

  let tagsRevealed = false;
  function revealTags() {
    if (tagsRevealed) return;
    tagsRevealed = true;
    if (!_shapesSpecMode || _shapesSpecImg !== img) return; // round already changed
    if (_shapesSpecAnsweredImg === img) {
      // The spectated player already answered this before we got to reveal it
      // (mid-round join + near-simultaneous answer) — no point showing tags of
      // an already-resolved round nobody will see "live"; clear it and wait for
      // the next round.
      if (_shapesSpecSvg)   { _shapesSpecSvg.remove();   if (_shapesSpecSvg === svgEl) _shapesSpecSvg = null; }
      if (_shapesSpecBoard) { _shapesSpecBoard.remove(); if (_shapesSpecBoard === board) _shapesSpecBoard = null; }
      if (_shapesSpecImg)   { _shapesSpecImg.remove();   if (_shapesSpecImg === img) _shapesSpecImg = null; }
      if (_shapesSpecClip)  { _shapesSpecClip.remove();  if (_shapesSpecClip === clip) _shapesSpecClip = null; }
      return;
    }

    // Only HERE (with the flash/tags, not before) is the country revealed —
    // the same exact moment as real showCountryShape().
    img.style.display  = '';
    clip.style.display = '';
    setTimeout(() => { if (_shapesSpecMode && _shapesSpecClip === clip) clip.style.opacity = '1'; }, 3000);
    if (country !== 'Rusia') {
      setTimeout(() => {
        if (!_shapesSpecMode || _shapesSpecImg !== img) return;
        img.style.transform  = 'translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01) scale(0.52)';
        img2.style.transform = 'translate(-50%,-50%) scale(0.52)';
      }, 6000);
    }

    const whiteBg = document.createElement('div');
    whiteBg.className = 'shapes-clip-overlay';
    whiteBg.style.cssText = 'position:absolute;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:62cqmin;height:62cqmin;background:#FCFAF4;clip-path:url(#' + clipId + ');z-index:100;opacity:1;transition:opacity 0.5s ease;pointer-events:none;';
    (window.appStage || document.body).appendChild(whiteBg);
    setTimeout(() => { whiteBg.style.opacity = '0'; }, 60);
    setTimeout(() => { whiteBg.remove(); }, 660);

    const flash = document.createElement('div');
    flash.className = 'shapes-clip-overlay';
    flash.style.cssText = 'position:absolute;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4cqmin;height:59.4cqmin;background:white;clip-path:url(#' + clipId + ');z-index:104;opacity:1;transition:opacity 0.5s ease;pointer-events:none;';
    (window.appStage || document.body).appendChild(flash);
    requestAnimationFrame(() => requestAnimationFrame(() => { flash.style.opacity = '0'; }));
    setTimeout(() => { flash.remove(); }, 600);
    if (typeof sfxLevel2 !== 'undefined' && typeof sfxPlay === 'function') { sfxLevel2.currentTime = 0; sfxPlay(sfxLevel2); }

    tagConfigs.forEach((cfg, i) => {
      const base = `scaleX(1.05) scaleY(0.95) rotate(${cfg.rot})`;
      const tag = document.createElement('div');
      // pointer-events:none (on top of luggage-game-ended in flags): the
      // spectator is read-only, there's no click to resolve here — the whole
      // resolution arrives by broadcast (shapesSpectatorResolvePick).
      tag.style.cssText = `position:absolute;top:${cfg.top};right:${cfg.right};width:40.4cqmin;z-index:110;pointer-events:none;transform:translateX(300%) scaleX(1.05) scaleY(0.95) rotate(${cfg.rot});transform-origin:center center;transition:transform 0.15s ease;--tag-rot:${cfg.rot};`;
      tag.classList.add('shape-tag-enter', 'shapes-tag');
      tag.style.animationDelay = `${i * 80}ms`;
      tag.addEventListener('animationend', () => {
        tag.style.transform = base;
        tag.classList.remove('shape-tag-enter');
        tag.style.animationDelay = '';
      });

      const tagImg = document.createElement('img');
      tagImg.src = 'images/tag2.png';
      tagImg.draggable = false;
      tagImg.style.cssText = 'display:block;width:100%;';

      const tagLabel = document.createElement('span');
      tagLabel.textContent = (typeof tCountry === 'function') ? tCountry(options[i]) : options[i];
      tagLabel.style.cssText = 'position:absolute;top:50%;left:52%;transform:translate(-50%,-50%);font-family:"VAGRoundBold","Arial Black",sans-serif;font-size:3.7cqmin;color:#2a1a00;font-weight:bold;white-space:nowrap;pointer-events:none;';

      tag.appendChild(tagImg);
      tag.appendChild(tagLabel);
      (window.appStage || document.body).appendChild(tag);

      const tagVminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
      const tagMaxW = 31.8 * tagVminPx;
      let fs = 3.7;
      while (tagLabel.scrollWidth > tagMaxW && fs > 1.76) {
        fs -= 0.22;
        tagLabel.style.fontSize = fs + 'cqmin';
        if (fs < 2.85) tagLabel.style.letterSpacing = '-1px';
        if (fs < 2.2) tagLabel.style.letterSpacing = '-2px';
      }
      _shapesSpecTagEls.push(tag);
    });
  }

  if (_shapesSpecIsFirstRound) {
    // Consumed HERE, not in the pregame's onDone — otherwise, when the fallback
    // below ended up revealing without having seen a pregame (mid-round join),
    // this flag stayed true forever and EVERY later round paid this block's
    // 400ms margin again.
    _shapesSpecIsFirstRound = false;
    // Short margin to confirm a pregame is really coming (in the real broadcast
    // order it arrives shortly after this round) — if no 'pregame' appears in
    // that margin, the spectator joined mid-round (no countdown).
    // NOTE: if a pregame DOES come, no guessed timer is scheduled here —
    // _shapesSpecPendingReveal is prepared and it's shapesSpectatorShowPregame's
    // REAL onDone (see there) that calls revealTags(), synced with the actual
    // 3-2-1. This used to schedule a fixed setTimeout(revealTags,
    // PREGAME_DURATION - 400) measured from when this data arrived — if the
    // spectator joined the 3-2-1 late (with elapsedMs clamped), the visual
    // count ended in ~400ms but this timer kept waiting almost the full 3.4s,
    // leaving the board absent all that time (the reported "takes 2s").
    _shapesSpecPendingReveal = revealTags;
    setTimeout(() => {
      // Guard against the reported "game music keeps playing" in VS — see the
      // same comment in citiesSpectatorShowRound/flagsSpectatorShowRound.
      if (!_shapesSpecMode) return;
      if (!_shapesSpecPregameSeen) {
        // Confirmed: no pregame coming (join mid-round already in progress) —
        // only HERE, with the real round already shown, does game music start
        // (if there were a pregame, its own onDone starts it).
        _shapesSpecCountdownDone = true;
        if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
        if (_shapesSpecPendingReveal === revealTags) { _shapesSpecPendingReveal = null; revealTags(); }
      }
    }, 400);
  } else if (_shapesSpecCountdownDone) {
    // Later rounds with no 3-2-1 (next normal question of the same game) —
    // reveal immediately, as before.
    setTimeout(revealTags, 0);
  } else {
    // The round arrived WHILE the real 3-2-1 is still running (spectator joined
    // late and the local countdown, faster due to the clamp, hasn't ended) —
    // don't reveal now: it stays pending, shapesSpectatorShowPregame's onDone
    // reveals it when the count actually ends.
    _shapesSpecPendingReveal = revealTags;
  }
};

// payload = { index, correct, points, speedBonus, hasBadge, inRowBonus, streak, dots }
window.shapesSpectatorResolvePick = function (payload) {
  if (!_shapesSpecMode) return;
  // payload.score ALREADY has campaignBase() added (see _specReportAnswer in
  // the real player) — animate toward that value instead of jumping, like the
  // player sees (shapesAnimateScore()).
  if (typeof payload.score === 'number') {
    _shapesSpecTargetScore = payload.score;
    _shapesSpecAnimateScore();
  }
  // The 'answer' doesn't send correctSlot (only the chosen index) — use the
  // one that arrived with this question's 'round'.
  const tag = _shapesSpecTagEls[payload.index];
  const correctTag = _shapesSpecTagEls[_shapesSpecCorrectSlot];
  if (tag) {
    const img = tag.querySelector('img');
    const label = tag.querySelector('span');
    if (img) img.src = payload.correct ? 'images/tag2green.png' : 'images/tag2red.png';
    if (label) label.style.color = '#ffffff';
  }
  if (!payload.correct && typeof _shapesSpecCorrectSlot === 'number' && correctTag) {
    const cImg = correctTag.querySelector('img');
    const cLabel = correctTag.querySelector('span');
    if (cImg) cImg.src = 'images/tag2green.png';
    if (cLabel) cLabel.style.color = '#ffffff';
  }

  const overlayId = payload.correct ? 'flags-check-overlay' : 'flags-wrong-overlay';
  const overlay = document.getElementById(overlayId);
  if (overlay) {
    overlay.style.zIndex = '999';
    overlay.classList.add('shapes-pos');
    overlay.style.display = '';
    overlay.classList.remove('animate');
    void overlay.offsetWidth;
    overlay.classList.add('animate');
    setTimeout(() => { overlay.classList.remove('animate', 'shapes-pos'); overlay.style.display = 'none'; overlay.style.zIndex = ''; }, 820);
  }

  // Note: unlike flags (which plays check+acertar together), shapes plays only
  // ONE sound for correct (sfxAcertar) — no sfxCheck.
  if (typeof sfxPlay === 'function') {
    if (payload.correct) {
      if (typeof sfxAcertar !== 'undefined') { sfxAcertar.currentTime = 0; sfxPlay(sfxAcertar); }
    } else if (typeof sfxError !== 'undefined') {
      sfxError.currentTime = 0; sfxPlay(sfxError);
    }
  }

  if (payload.correct && typeof payload.points === 'number' && typeof showScorePopup === 'function') {
    showScorePopup(payload.points);
  }
  if (payload.speedBonus > 0) {
    const sbt = document.getElementById('speed-bonus-text');
    if (sbt) {
      sbt.style.zIndex = '120';
      clearTimeout(shapesSpeedBonusHideId);
      sbt.classList.remove('visible');
      void sbt.offsetWidth;
      sbt.classList.add('visible');
      shapesSpeedBonusHideId = setTimeout(() => { sbt.classList.remove('visible'); sbt.style.zIndex = ''; }, 1600);
    }
  }
  if (payload.hasBadge && typeof getBadgeImg === 'function' && typeof showFlagsBadge === 'function') {
    const badgeImg = getBadgeImg(payload.streak || 0);
    if (badgeImg) {
      const bc = document.getElementById('flags-badge-canvas');
      if (bc) bc.style.zIndex = '999';
      showFlagsBadge(badgeImg, payload.inRowBonus || 0, payload.streak || 0, window.STAGE_W * 0.39, 0.85);
    }
  }
  if (payload.correct && typeof payload.dots === 'number') {
    window.shapesSpectatorAdvanceDot(payload.dots);
  }

  if (_shapesSpecTagEls.length === 0) {
    // The answer arrived BEFORE this round finished revealing (mid-round join +
    // near-simultaneous answer by the spectated player) — no tags to animate
    // yet. Mark the round "already resolved" so revealTags() (which may still
    // be pending) clears it directly instead of showing it, rather than
    // scheduling a swing-out on tags that don't exist yet (which is what ended
    // up deleting the freshly appeared round — the reported "weird/duplicate
    // tag2").
    _shapesSpecAnsweredImg = _shapesSpecImg;
    return;
  }

  // Same timing as the real click: swing-out at 500ms, remove at 700ms.
  const roundImg = _shapesSpecImg;
  setTimeout(() => {
    if (!_shapesSpecMode) return;
    _shapesSpecTagEls.forEach(t => { t.style.transform = getComputedStyle(t).transform; t.classList.add('shape-tag-exit'); });
    setTimeout(() => {
      if (!_shapesSpecMode || _shapesSpecImg !== roundImg) return; // next round already arrived, don't overwrite
      _shapesSpecTagEls.forEach(t => t.remove());
      _shapesSpecTagEls = [];
      if (_shapesSpecSvg)   { _shapesSpecSvg.remove();   _shapesSpecSvg = null; }
      if (_shapesSpecBoard) { _shapesSpecBoard.remove(); _shapesSpecBoard = null; }
      if (_shapesSpecImg)   { _shapesSpecImg.remove();   _shapesSpecImg = null; }
      if (_shapesSpecClip)  { _shapesSpecClip.remove();  _shapesSpecClip = null; }
    }, 200);
  }, 500);
};

window.shapesSpectatorAdvanceDot = function (dots) {
  if (!_shapesSpecMode) return;
  _shapesSpecDots = dots;
  const container = document.getElementById('shapes-progress-dots');
  if (!container) return;
  container.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < dots));
  if (dots >= 10 && !container.classList.contains('train-animation')) {
    container.classList.add('train-animation');
    if (typeof playTimeBonus === 'function') playTimeBonus(document.getElementById('shapes-time-bonus'), 5);
    // Same green flash the real player does on the timer number when earning
    // the +time bonus — was missing here entirely.
    const tEl = document.getElementById('shapes-timer-number');
    const origColor = tEl ? tEl.style.color : '';
    if (tEl) tEl.style.color = '#00ff88';
    setTimeout(() => {
      if (!_shapesSpecMode) return;
      container.classList.add('dots-fade-out');
      setTimeout(() => {
        if (!_shapesSpecMode) return;
        container.classList.remove('train-animation', 'dots-fade-out');
        const finalDots = Math.max(0, _shapesSpecDots - 10);
        container.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < finalDots));
        // _shapesSpecLastTick: last known real timeLeft (see
        // shapesSpectatorUpdateTimer) — decides whether it goes back to white
        // (last 10s) or the original color, like the real player.
        if (tEl) {
          if (_shapesSpecLastTick != null && _shapesSpecLastTick > 0 && _shapesSpecLastTick <= 10) {
            tEl.style.color = '#ffffff';
          } else {
            tEl.style.color = origColor;
          }
        }
      }, 500);
    }, 2000);
  }
};

window.shapesSpectatorUpdateTimer = function (timeLeft) {
  if (!_shapesSpecMode) return;
  const tEl  = document.getElementById('shapes-timer-number');
  const tImg = document.getElementById('shapes-timer-img');
  if (tEl) {
    tEl.classList.remove('timer-number-infinity');
    tEl.textContent = timeLeft;
  }
  if (timeLeft <= 10) {
    if (tEl)  tEl.style.color = '#ffffff';
    if (tImg) tImg.src = 'images/countdownred3.png';
    const _nowTick = Date.now();
    if (timeLeft > 0 && timeLeft !== _shapesSpecLastTick && (_nowTick - _shapesSpecLastTickSoundAt) > 700
        && typeof sfxTickdown !== 'undefined' && typeof sfxPlay === 'function') {
      sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown);
      _shapesSpecLastTickSoundAt = _nowTick;
    }
  } else {
    if (tEl)  tEl.style.color = '';
    if (tImg) tImg.src = 'images/countdown3.png';
  }
  _shapesSpecLastTick = timeLeft;
};

// dots = the train's ALREADY-accumulated progress at the moment of connecting
// — same fix already applied in flags/cities: without this, someone joining
// mid-game saw empty dots until the real player's NEXT answer, instead of the
// real progress already made.
window.shapesSpectatorUpdateScore = function (score, dots) {
  if (!_shapesSpecMode) return;
  // Direct snap (no animation) — used to "catch up" on joining mid-round, not
  // for a live answer (that goes through shapesSpectatorResolvePick →
  // _shapesSpecAnimateScore). Also syncs the animation state — otherwise the
  // NEXT real answer would try to animate from the old value (0) instead of
  // from here.
  _shapesSpecTargetScore = score || 0;
  _shapesSpecDisplayedScore = score || 0;
  const el = document.getElementById('score-value');
  if (el) el.textContent = (score || 0).toLocaleString();
  // Clamp so a simple catch-up doesn't retroactively fire the "reached 10"
  // animation — shapesSpectatorAdvanceDot already snaps directly (doesn't
  // increment), works as-is for this.
  if (typeof dots === 'number' && typeof window.shapesSpectatorAdvanceDot === 'function') {
    window.shapesSpectatorAdvanceDot(Math.max(0, Math.min(dots, 9)));
  }
};

// Single card in the generic leaderboard (shared with cities/monuments) for
// the spectated REAL player — same trick as flagsSpectatorSetPlayerCard: the
// normal leaderboard (positionLeaderboard) inserts your own profile as "you",
// which would be wrong here, so a row is built by hand.
// oppName/oppAvatar/oppScore: see long comment in citiesSpectatorSetPlayerCard.
window.shapesSpectatorSetPlayerCard = function (name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode) {
  if (!_shapesSpecMode) return;
  const lb = document.getElementById('leaderboard');
  if (!lb) return;
  const rowH = (typeof getLbRowHeight === 'function') ? getLbRowHeight() : 60;
  const gap  = (typeof LB_GAP !== 'undefined') ? LB_GAP : 4;
  const showOpp = !!oppName;
  // TOP_MARGIN: see long comment in citiesSpectatorSetPlayerCard — #leaderboard
  // (shared with cities/monuments) has clip-path:inset(0 -300px) that clips the
  // wrongEffect emote-bubble if the top row is at top:0.
  const TOP_MARGIN = Math.round(rowH * 0.4);
  lb.style.height = (showOpp ? rowH * 2 + gap + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';
  let el = document.getElementById('shapes-spec-lb-entry');
  if (!el) {
    el = document.createElement('div');
    el.className = 'lb-entry lb-player';
    el.id = 'shapes-spec-lb-entry';
    el.style.top = TOP_MARGIN + 'px';
    el.innerHTML = `<span class="lb-rank rank-other"></span>`
      + `<div class="lb-avatar"><img class="lb-avatar-img" id="shapes-spec-lb-avatar" src="images/profilepic/ppdefault.png"></div>`
      + `<span class="lb-name" id="shapes-spec-lb-name"></span>`
      + `<span class="lb-score" id="shapes-spec-lb-score">0</span>`;
    lb.appendChild(el);
  }
  const nameEl = document.getElementById('shapes-spec-lb-name');
  if (nameEl && name) nameEl.textContent = name;
  const avatarEl = document.getElementById('shapes-spec-lb-avatar');
  if (avatarEl && avatar) avatarEl.src = avatar;
  document.getElementById('shapes-spec-lb-score').textContent = (score || 0).toLocaleString();
  window.CustomizeAssets?.applyCard(el, cardCode || '0001');

  let oppEl = document.getElementById('shapes-spec-lb-opp');
  if (showOpp) {
    if (!oppEl) {
      oppEl = document.createElement('div');
      oppEl.className = 'lb-entry lb-vsopp';
      oppEl.id = 'shapes-spec-lb-opp';
      oppEl.style.top = (TOP_MARGIN + rowH + gap) + 'px';
      oppEl.innerHTML = `<span class="lb-rank rank-other"></span>`
        + `<div class="lb-avatar"><img class="lb-avatar-img" id="shapes-spec-lb-opp-avatar" src="images/profilepic/ppdefault.png"></div>`
        + `<span class="lb-name" id="shapes-spec-lb-opp-name"></span>`
        + `<span class="lb-score" id="shapes-spec-lb-opp-score">0</span>`;
      lb.appendChild(oppEl);
    }
    window.CustomizeAssets?.applyCard(oppEl, oppCardCode || '0001');
    document.getElementById('shapes-spec-lb-opp-name').textContent = oppName || 'Rival';
    const oppAvatarEl = document.getElementById('shapes-spec-lb-opp-avatar');
    if (oppAvatarEl && oppAvatar) oppAvatarEl.src = oppAvatar;
    document.getElementById('shapes-spec-lb-opp-score').textContent = (oppScore || 0).toLocaleString();
    // Reorder by rank — see long comment in citiesSpectatorSetPlayerCard.
    const friendOnTop = (score || 0) >= (oppScore || 0);
    el.style.top    = (TOP_MARGIN + (friendOnTop ? 0 : rowH + gap)) + 'px';
    oppEl.style.top = (TOP_MARGIN + (friendOnTop ? rowH + gap : 0)) + 'px';
    // Rank number (1st/2nd) — see long comment in flagsSpectatorSetPlayerCard.
    const elRankEl  = el.querySelector('.lb-rank');
    const oppRankEl = oppEl.querySelector('.lb-rank');
    // .lb-rank is display:none by default in CSS (only shown via the
    // "vs-active" class on the real leaderboard) — forced here with inline
    // display, see long comment in flagsSpectatorSetPlayerCard.
    if (elRankEl)  { elRankEl.textContent  = friendOnTop ? '1' : '2'; elRankEl.className  = 'lb-rank ' + (friendOnTop ? 'rank-1' : 'rank-2'); elRankEl.style.display  = 'block'; }
    if (oppRankEl) { oppRankEl.textContent = friendOnTop ? '2' : '1'; oppRankEl.className = 'lb-rank ' + (friendOnTop ? 'rank-2' : 'rank-1'); oppRankEl.style.display = 'block'; }
  } else if (oppEl) {
    oppEl.remove();
  } else {
    el.style.top = TOP_MARGIN + 'px';
  }
};

window.shapesSpectatorWrongEffect = function (target) {
  if (!_shapesSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'shapes-spec-lb-opp' : 'shapes-spec-lb-entry');
  if (!el) return;
  el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // Raised z-index for the emote's duration — see long comment in citiesSpectatorWrongEffect (js/modes/cities-spectate.js).
  const prevZ = el.style.zIndex;
  el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 1800);
  if (typeof spawnEmoteBubble === 'function') spawnEmoteBubble(el);
};

// "Time's up" on the 1v1 spectator card (shapes) — same mechanism as
// shapesSpectatorWrongEffect but with the stopwatch.
window.shapesSpectatorTimesUpEffect = function (target) {
  if (!_shapesSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'shapes-spec-lb-opp' : 'shapes-spec-lb-entry');
  if (!el) return;
  const prevZ = el.style.zIndex; el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
};

window.shapesSpectatorShowTimesUp = function () {
  if (!_shapesSpecMode) return;
  clearTimeout(_shapesSpecTimesUpTimeout1);
  clearTimeout(_shapesSpecTimesUpTimeout2);
  if (typeof playMusic === 'function') playMusic(null);
  if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
  const tImg = document.getElementById('shapes-timer-img');
  if (tImg) tImg.style.animationPlayState = 'paused';
  // This used to delete the silhouette (.shapes-clip-overlay) IMMEDIATELY as
  // soon as the TIME'S UP arrived — in versus, this moment is only ~700ms-2s
  // before the duel result appears (see revealAt/_vsHandleGameEnd in vs.js), so
  // the waiting player (watching the rival on loan) saw the board go empty
  // BEFORE the result overlay arrived, instead of the frozen silhouette behind
  // (the reported "assets get removed on times up"). On the solo/campaign path
  // (not versus), shapesSpectatorShowPostgame() deletes it moments later anyway
  // — no need to do it early here.
  const timeupEl = document.getElementById('timeup-overlay');
  if (!timeupEl) return;
  timeupEl.style.zIndex = '300';
  timeupEl.style.display = 'flex';
  timeupEl.classList.remove('timeup-out');
  timeupEl.classList.add('timeup-in');
  _shapesSpecTimesUpTimeout1 = setTimeout(() => {
    if (!_shapesSpecMode) return;
    timeupEl.classList.remove('timeup-in');
    timeupEl.classList.add('timeup-out');
    _shapesSpecTimesUpTimeout2 = setTimeout(() => {
      if (!_shapesSpecMode) return;
      timeupEl.style.display = 'none';
      timeupEl.classList.remove('timeup-out');
      timeupEl.style.zIndex = '';
    }, 400);
  }, 1800);
};

// Results screen (solo/campaign path only — versus has its own W/L screen, out
// of scope, like in flags). Read-only: pointer-events:none + confirm1/confirm2
// hidden.
window.shapesSpectatorShowPostgame = function (payload) {
  if (!_shapesSpecMode) return;
  const gameoverScreen = document.getElementById('gameover-screen');
  if (!gameoverScreen) return;
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
  // Same _shapesCleanupVisuals() the real hideShapesMode() does before showing
  // results — without this the last round's silhouette/board peeked behind the
  // results screen.
  document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
  document.getElementById('shapes-countdown-widget')?.remove();
  _shapesSpecTagEls = [];
  _shapesSpecSvg = _shapesSpecBoard = _shapesSpecImg = _shapesSpecClip = null;
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) rightPanel.style.display = 'none';
  // Like real hideShapesMode(): the scoreboard makes no sense on the results
  // screen — without this it stayed stuck, visible in the background.
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'none';

  gameoverScreen.classList.add('mode-flags', 'mode-shapes');
  gameoverScreen.classList.remove('mode-monuments');
  gameoverScreen.style.pointerEvents = 'none';
  if (typeof window.hideGameoverConfirm === 'function') window.hideGameoverConfirm();
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = 'none';

  // Same sprite swap the real player's #loading-shapes-btn click does —
  // elements shared between modes, without this they keep what another mode
  // last set (see the same bug already fixed in flags.js).
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men5.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men6.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl5.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl6.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women4.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women5.png');
  document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level2complete.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check2.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong2.png');

  gameoverScreen.style.display = 'flex';
  const label = gameoverScreen.querySelector('.gameover-text1-label');
  if (label) label.textContent = (typeof t === 'function') ? t('gameover.shapes') : 'Map Mayhem';
  const finalScoreEl = document.getElementById('final-score-value');
  if (finalScoreEl) finalScoreEl.textContent = (payload.totalScore || 0).toLocaleString();
  const newHSBanner = document.getElementById('new-highscore-banner');
  const newHSScore  = document.getElementById('new-highscore-score');
  if (payload.isNewHighscore) {
    if (newHSBanner) newHSBanner.style.display = 'flex';
    if (newHSScore)  newHSScore.textContent = (payload.finalScore || 0).toLocaleString();
  } else if (newHSBanner) {
    newHSBanner.style.display = 'none';
  }
  if (typeof setModeCounts !== 'undefined') setModeCounts(payload.correctCount || 0, payload.wrongCount || 0);
  if (typeof restartFlightAtt !== 'undefined') restartFlightAtt();
  if (typeof buildChecksRow !== 'undefined') buildChecksRow();
  const checksEndTime = ((payload.correctCount || 0) > 0 ? (payload.correctCount - 1) * 0.1 + 0.2 : 0) + 0.4;
  if (typeof buildWrongsRow !== 'undefined') buildWrongsRow(checksEndTime);
  if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
};
window.shapesSpectatorHidePostgame = function () {
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) { gameoverScreen.style.display = 'none'; gameoverScreen.style.pointerEvents = ''; }
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = '';
};

// ── Lobby hooks (group) ────────────────────────────────────────────────────
window.shapesSetLobbyScores = function(members) {
  if (!Array.isArray(members) || typeof window._lbUpdateEntry !== 'function') return;
  members.forEach(m => window._lbUpdateEntry('lob' + m.id, m.score || 0));
  // See same fix in js/modes/mapgame-vs.js/citiesSetVsOpponentScore — while
  // spectating the leaderboard is positioned by the spectator renderer.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function') positionLeaderboard(shapesScore, true);
};
window.shapesSetLobbyWrongFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'player' : ('lob' + uid);
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect(key);
};
// "Time's up" (timesup) — same #leaderboard as monuments, reuses _lbTimesUpEffect.
window.shapesSetLobbyTimesUpFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'player' : ('lob' + uid);
  if (typeof window._lbTimesUpEffect === 'function') window._lbTimesUpEffect(key);
};
window.shapesTriggerOpponentTimesUp = function() {
  if (typeof window._lbTimesUpEffect === 'function') window._lbTimesUpEffect('vsopp');
};
window.shapesSetLobbyDisconnected = function(uid, disconnected) {
  const el = typeof lbElements !== 'undefined' ? lbElements['lb-lob' + uid] : null;
  if (!el) return;
  el.classList.toggle('is-disconnected', !!disconnected);
};
window.shapesSetVsDisconnected = function(disconnected) {
  const el = typeof lbElements !== 'undefined' ? lbElements['lb-vsopp'] : null;
  if (!el) return;
  el.classList.toggle('is-disconnected', !!disconnected);
};

// ── VS opponent hooks ─────────────────────────────────────────────────────────
window.shapesSetVsOpponentScore = function(score) {
  window._vsOppScore = score;
  if (typeof window._lbUpdateEntry === 'function') window._lbUpdateEntry('vsopp', score);
  // See same fix in js/modes/mapgame-vs.js/citiesSetVsOpponentScore.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function') positionLeaderboard(shapesScore, true);
};
window.shapesTriggerOpponentWrong = function() {
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect('vsopp');
};

function buildShapesPracticePool(continents, difficulty) {
  const sh = a => { for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; };
  const ok     = c => !continents || continents.has(SHAPE_COUNTRY_CONTINENT[c.name]);
  const inTier = (arr, c) => arr.has ? arr.has(c.name) : arr.includes(c.name);
  const ALL_POOLS = [SHAPES_POOL_INICIO, SHAPES_POOL_FACIL, SHAPES_POOL_MEDIO, SHAPES_POOL_DIFICIL];
  const diff = difficulty || 'dificil';

  // Pools allowed by difficulty ceiling (cumulative)
  const allowedPools = [SHAPES_POOL_INICIO];
  if (diff !== 'inicio') allowedPools.push(SHAPES_POOL_FACIL);
  if (diff === 'medio' || diff === 'dificil') allowedPools.push(SHAPES_POOL_MEDIO);
  if (diff === 'dificil') allowedPools.push(SHAPES_POOL_DIFICIL);

  const seen = new Set();
  const result = [];
  const add = c => { if (!seen.has(c.name)) { seen.add(c.name); result.push(c); } };

  // Step 1: add allowed pools filtered by continent
  for (const pool of allowedPools) sh(SHAPE_COUNTRIES.filter(c => inTier(pool, c) && ok(c))).forEach(add);

  // Step 2: if pool is thin (<4), supplement from next harder pools (still continent-filtered)
  if (result.length < 4) {
    for (const pool of ALL_POOLS) {
      if (allowedPools.includes(pool)) continue;
      sh(SHAPE_COUNTRIES.filter(c => inTier(pool, c) && ok(c))).forEach(add);
      if (result.length >= 4) break;
    }
  }

  // Step 3: final fallback — drop continent filter if still too few
  if (result.length < 4) {
    for (const pool of ALL_POOLS) {
      sh(SHAPE_COUNTRIES.filter(c => inTier(pool, c))).forEach(add);
      if (result.length >= 4) break;
    }
  }

  return result;
}

function positionShapesCountdown() {
  const cwEl = document.getElementById('shapes-countdown-widget');
  if (!cwEl) return;
  // Fixed overlay in vmin, like #countdown-widget (monuments/flags). Scales
  // with the viewport and doesn't move/grow on zoom like when it was anchored
  // to the scaled game-wrapper.
  cwEl.style.position      = 'absolute';
  cwEl.style.top           = '2.8cqmin';
  cwEl.style.right         = '57.5cqmin';
  cwEl.style.width         = '26.3cqmin';
  cwEl.style.height        = '14.5cqmin';
  cwEl.style.pointerEvents = 'none';
  cwEl.style.zIndex        = '1000';
}

window.addEventListener('resize', positionShapesCountdown);

function shapesAnimateScore() {
  if (shapesScoreRafId) return;
  const el = document.getElementById('score-value');
  let last = null;
  function tick(ts) {
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    const diff = shapesScore - shapesDisplayedScore;
    if (diff <= 0) { shapesScoreRafId = null; return; }
    shapesDisplayedScore = Math.min(shapesScore, shapesDisplayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    if (el) el.textContent = (shapesDisplayedScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
    shapesScoreRafId = requestAnimationFrame(tick);
  }
  shapesScoreRafId = requestAnimationFrame(tick);
}

function showCountryShape(country, ext1, ext2, startDelay) {
  if (shapesAborted) return; // game was abandoned
  ext1 = ext1 || 'png';
  ext2 = ext2 || 'jpg';
  startDelay = startDelay || 0;

  document.getElementById('loading-screen').style.display = 'none';
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'block';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'flex'; rightPanel.style.zIndex = '120'; }

  if (!document.getElementById('shapes-countdown-widget')) {
    const cw = document.createElement('div');
    cw.id = 'shapes-countdown-widget';

    const cwImg = document.createElement('img');
    cwImg.id = 'shapes-timer-img';
    cwImg.src = 'images/countdown3.png';
    cwImg.draggable = false;
    cwImg.style.cssText = 'width:100%;height:100%;object-fit:fill;display:block;animation:pulse-img-shadow 1s infinite paused;';

    const cwNum = document.createElement('div');
    cwNum.id = 'shapes-timer-number';
    { const _inf0 = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
      cwNum.textContent = (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer > 0) ? window.practiceConfig.timer : (_inf0 ? '∞' : window.GAME_DURATION);
      if (_inf0) cwNum.classList.add('timer-number-infinity'); }
    cwNum.style.color = 'white';

    const dotsEl = document.createElement('div');
    dotsEl.id = 'shapes-progress-dots';
    for (let d = 0; d < 10; d++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      dotsEl.appendChild(dot);
    }

    const tbEl = document.createElement('div');
    tbEl.id = 'shapes-time-bonus';
    tbEl.className = 'time-bonus';
    tbEl.setAttribute('aria-hidden', 'true');
    tbEl.innerHTML = '<span class="tb-plus">+</span><span class="tb-num">5s</span>';

    cw.appendChild(cwImg);
    cw.appendChild(cwNum);
    cw.appendChild(dotsEl);
    cw.appendChild(tbEl);
    (window.appStage || document.body).appendChild(cw);
  }

  positionShapesCountdown();

  const clipId = 'archedShape_' + (_shapeGroupCount++);

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('class', 'shapes-stage-el');
  svgEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPathEl.setAttribute('id', clipId);
  clipPathEl.setAttribute('clipPathUnits', 'objectBoundingBox');
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', 'M 0.028,0 Q 0.5,0.005 0.995,0 Q 1.01,0 1.01,0.018 Q 0.99,0.5 1,0.973 Q 1,0.99 0.982,0.99 Q 0.5,0.972 0.008,0.995 Q -0.01,0.991 -0.01,0.983 Q 0.008,0.5 0.008,0.02 Q 0.008,0 0.028,0 Z');
  clipPathEl.appendChild(pathEl);
  defs.appendChild(clipPathEl);
  svgEl.appendChild(defs);
  (window.appStage || document.body).appendChild(svgEl);
  shapesCurrentSvg = svgEl;

  const board = document.createElement('img');
  board.className = 'shapes-stage-el';
  board.src = 'images/countryboard.png';
  board.style.cssText = 'position:absolute;top:50%;left:36%;transform:translate(-50%,-50%) scaleX(0.96);width:85.15cqmin;height:auto;z-index:99;';
  board.draggable = false;
  (window.appStage || document.body).appendChild(board);
  shapesCurrentBoard = board;


  const img = document.createElement('img');
  img.className = 'shapes-stage-el';
  img.src = 'images/countries/' + country + '1.' + ext1;
  img.style.cssText = 'position:absolute;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4cqmin;height:59.4cqmin;z-index:103;transition:transform 3s linear;display:none;';
  img.draggable = false;
  (window.appStage || document.body).appendChild(img);

  const clip = document.createElement('div');
  clip.className = 'shapes-stage-el';
  // fallback overflow:hidden: img2 inside is 118.8cqmin (twice this container)
  // on purpose, so the clip-path (SVG silhouette) crops it to the final shape.
  // In Firefox/Gecko (Zen Browser included) a url()-referenced clip-path
  // sometimes doesn't apply to a <div> with transformed children — without the
  // overflow here, img2 shows uncropped (huge, doesn't "fit" the frame). With
  // the overflow, worst case it's a square crop instead of the silhouette, but
  // never huge.
  clip.style.cssText = 'position:absolute;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4cqmin;height:59.4cqmin;clip-path:url(#' + clipId + ');overflow:hidden;z-index:102;opacity:0;transition:opacity 2s ease;display:none;';
  (window.appStage || document.body).appendChild(clip);

  const img2 = document.createElement('img');
  img2.src = 'images/countries/' + country + '2.' + ext2;
  img2.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)' + (country === 'Rusia' ? ' scale(0.5)' : '') + ';width:118.8cqmin;height:118.8cqmin;transition:transform 3s linear;';
  img2.draggable = false;
  clip.appendChild(img2);


  const clipFadeTimeout = setTimeout(() => { clip.style.opacity = '1'; }, 3000 + startDelay);
  shapesCurrentImg = img; shapesCurrentImg2 = img2; shapesCurrentClip = clip;
  shapesCurrentClipFadeTimeout = clipFadeTimeout;

  ensureShapeTagStyle();

  let options, correctIdx;
  if (document.body.classList.contains('recording-mode')) {
    options    = ['China', 'Germany', 'Spain', 'Egypt'];
    correctIdx = 0;
  } else {
    const correctLabel = SHAPE_COUNTRIES.find(c => c.name === country).label;
    let _distractorBase;
    if (window.practiceConfig && window.practiceConfig.active) {
      // Limit distractors to the same unlocked tiers as the pick logic
      const _sUnlocked = new Set(SHAPES_POOL_INICIO);
      const _sDiff = (window.practiceConfig && window.practiceConfig.difficulty) || 'dificil';
      if (shapesCorrectCount >= 1  && _sDiff !== 'inicio') SHAPES_POOL_FACIL.forEach(n => _sUnlocked.add(n));
      if (shapesCorrectCount >= 10 && (_sDiff === 'medio' || _sDiff === 'dificil')) {
        const limit = shapesCorrectCount >= 24 ? SHAPES_POOL_MEDIO.length : shapesCorrectCount >= 17 ? 50 : 25;
        SHAPES_POOL_MEDIO.slice(0, limit).forEach(n => _sUnlocked.add(n));
      }
      if (shapesCorrectCount >= 30 && _sDiff === 'dificil') SHAPES_POOL_DIFICIL.forEach(n => _sUnlocked.add(n));
      _distractorBase = shapesPracticePool.filter(c => _sUnlocked.has(c.name));
      // Expand if too few distractors
      if (_distractorBase.length < 4) {
        const ordered = [SHAPES_POOL_FACIL, SHAPES_POOL_MEDIO, SHAPES_POOL_DIFICIL];
        for (const tier of ordered) {
          tier.forEach(n => _sUnlocked.add(n));
          _distractorBase = shapesPracticePool.filter(c => _sUnlocked.has(c.name));
          if (_distractorBase.length >= 4) break;
        }
      }
      if (_distractorBase.length < 4) _distractorBase = shapesPracticePool;
    } else {
      _distractorBase = getActiveShapesPool();
    }
    const shuffled = _distractorBase
      .filter(c => c.name !== country && c.label !== correctLabel)
      .sort(() => shapesRand() - 0.5);
    const usedLabels = new Set([correctLabel]);
    const distractors = [];
    for (const c of shuffled) {
      if (!usedLabels.has(c.label)) {
        usedLabels.add(c.label);
        distractors.push(c.label);
        if (distractors.length === 3) break;
      }
    }
    correctIdx = Math.floor(shapesRand() * 4);
    options    = [...distractors];
    options.splice(correctIdx, 0, correctLabel);
  }

  // Spectator mode: announce the round (options + correct answer) before the
  // player answers, so watchers see the same thing in realtime.
  if (typeof window._specReportRound === 'function') {
    window._specReportRound({ index: shapesCorrectCount, mode: 'shapes', prompt: country, correctSlot: correctIdx, options: options.slice(), timeLeft: shapesTimeLeft });
  }

  const animTimeout = country !== 'Rusia' ? setTimeout(() => {
    img.style.transform  = 'translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01) scale(0.52)';
    img2.style.transform = 'translate(-50%,-50%) scale(0.52)';
    shapesCurrentAnimTimeout = null;
  }, 6000 + startDelay) : null;
  shapesCurrentAnimTimeout = animTimeout;

  const tagConfigs = [
    { top: '18%', right: '27%', rot: '-5deg' },
    { top: '37%', right: '27%', rot: '2deg'  },
    { top: '57%', right: '26%', rot: '-4deg' },
    { top: '76%', right: '26%', rot: '3deg'  },
  ];

  let anyClicked = false;
  const tagEls = [];

  shapesTagsTimeout = setTimeout(() => {
  if (shapesAborted) return; // abandoned during the 3-2-1

  const whiteBg = document.createElement('div');
  whiteBg.className = 'shapes-clip-overlay';
  whiteBg.style.cssText = 'position:absolute;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:62cqmin;height:62cqmin;background:#FCFAF4;clip-path:url(#' + clipId + ');z-index:100;opacity:1;transition:opacity 0.5s ease;pointer-events:none;';
  (window.appStage || document.body).appendChild(whiteBg);
  setTimeout(() => { whiteBg.style.opacity = '0'; }, 60);
  setTimeout(() => { whiteBg.remove(); }, 660);

  img.style.display  = '';
  clip.style.display = '';

  const flash = document.createElement('div');
  flash.className = 'shapes-clip-overlay';
  flash.style.cssText = 'position:absolute;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4cqmin;height:59.4cqmin;background:white;clip-path:url(#' + clipId + ');z-index:104;opacity:1;transition:opacity 0.5s ease;pointer-events:none;';
  (window.appStage || document.body).appendChild(flash);
  requestAnimationFrame(() => requestAnimationFrame(() => { flash.style.opacity = '0'; }));
  setTimeout(() => { flash.remove(); }, 600);
  sfxLevel2.currentTime = 0;
  sfxPlay(sfxLevel2);

  tagConfigs.forEach((cfg, i) => {
    const isCorrect = (i === correctIdx);
    const base = `scaleX(1.05) scaleY(0.95) rotate(${cfg.rot})`;
    const tag = document.createElement('div');
    tag.style.cssText = `position:absolute;top:${cfg.top};right:${cfg.right};width:40.4cqmin;z-index:110;pointer-events:auto;transform:translateX(300%) scaleX(1.05) scaleY(0.95) rotate(${cfg.rot});transform-origin:center center;transition:transform 0.15s ease;cursor:pointer;--tag-rot:${cfg.rot};`;
    tag.classList.add('shape-tag-enter', 'shapes-tag');
    tag.style.animationDelay = `${i * 80}ms`;
    tag.style.pointerEvents = 'none';
    tag.addEventListener('animationend', () => {
      tag.style.transform = base;
      tag.classList.remove('shape-tag-enter');
      tag.style.animationDelay = '';
      if (!shapesGameOver) tag.style.pointerEvents = 'auto';
      if (i === tagConfigs.length - 1) shapesRoundStartTime = performance.now();
    });

    const tagImg = document.createElement('img');
    tagImg.src = 'images/tag2.png';
    tagImg.draggable = false;
    tagImg.style.cssText = 'display:block;width:100%;';

    const tagLabel = document.createElement('span');
    tagLabel.textContent = (typeof tCountry === 'function') ? tCountry(options[i]) : options[i];
    tagLabel.style.cssText = 'position:absolute;top:50%;left:52%;transform:translate(-50%,-50%);font-family:"VAGRoundBold","Arial Black",sans-serif;font-size:3.7cqmin;color:#2a1a00;font-weight:bold;white-space:nowrap;pointer-events:none;';

    tag.addEventListener('mouseenter', () => {
      if (anyClicked || !shapesRunning || shapesGameOver) return;
      tagImg.src = 'images/tag2yellow.png';
      tag.style.transform = base + ' scale(1.1)';
      if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
    });
    tag.addEventListener('mouseleave', () => {
      if (anyClicked || !shapesRunning || shapesGameOver) return;
      tagImg.src = 'images/tag2.png';
      tag.style.transform = base;
    });
    tag.addEventListener('click', () => {
      if (anyClicked || !shapesRunning || shapesGameOver) return;
      anyClicked = true;
      tag.style.transform = base + ' scale(1.1)';
      tag.style.cursor = 'default';
      tagImg.src = isCorrect ? 'images/tag2green.png' : 'images/tag2red.png';
      tagLabel.style.color = '#ffffff';
      if (!isCorrect) {
        const correctTag = tagEls[correctIdx];
        if (correctTag) {
          correctTag.querySelector('img').src = 'images/tag2green.png';
          correctTag.querySelector('span').style.color = '#ffffff';
        }
      }

      if (document.body.classList.contains('recording-mode')) {
        tagEls.forEach(t => { t.style.pointerEvents = 'none'; t.style.cursor = 'default'; });
        return;
      }

      const overlayId = isCorrect ? 'flags-check-overlay' : 'flags-wrong-overlay';
      const overlay = document.getElementById(overlayId);
      if (overlay) {
        overlay.style.zIndex = '999';
        overlay.classList.add('shapes-pos');
        overlay.style.display = '';
        overlay.classList.remove('animate');
        void overlay.offsetWidth;
        overlay.classList.add('animate');
        setTimeout(() => { overlay.classList.remove('animate', 'shapes-pos'); overlay.style.display = 'none'; overlay.style.zIndex = ''; }, 820);
      }

      if (typeof loadGameSFX  !== 'undefined') loadGameSFX();
      if (typeof loadBadges   !== 'undefined') loadBadges();
      if (isCorrect) {
        shapesAnsweredSet.add(country);
        shapesCorrectCount++;
        shapesStreak++;
        if (sfxAcertar) { sfxAcertar.currentTime = 0; sfxPlay(sfxAcertar); }
        const pts        = typeof getFlagsRoundPoints !== 'undefined' ? getFlagsRoundPoints(shapesCorrectCount) : 10;
        const badgeImg   = typeof getBadgeImg         !== 'undefined' ? getBadgeImg(shapesStreak)         : null;
        const inRowBonus = typeof getInRowBonus       !== 'undefined' ? getInRowBonus(shapesStreak)       : 0;
        const elapsed    = shapesRoundStartTime ? Math.max(0, (performance.now() - shapesRoundStartTime) / 1000) : SHAPES_SPEED_WIN;
        const ratio      = elapsed <= SHAPES_GRACE ? 1 : Math.max(0, 1 - (elapsed - SHAPES_GRACE) / (SHAPES_SPEED_WIN - SHAPES_GRACE));
        const _shapesPracticeInf = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
        const speedBonus = (!_shapesPracticeInf && ratio > 0) ? Math.round(pts * (SHAPES_SPEED_MULT - 1) * ratio) : 0;
        shapesScore += pts + speedBonus + inRowBonus;
        shapesAnimateScore();
        if (typeof positionLeaderboard !== 'undefined') {
          if (window.practiceConfig && window.practiceConfig.active) {
            const _sc = shapesScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0);
            const _sel = typeof lbElements !== 'undefined' ? lbElements['lb-player']?.querySelector('.lb-score') : null;
            if (_sel) _sel.textContent = _sc.toLocaleString();
          } else {
            positionLeaderboard(shapesScore, true);
          }
        }
        if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(true, Math.round(shapesScore));
        const _shapesIsInf = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
        if (!_shapesIsInf) shapesDots++;
        // Reported AFTER incrementing shapesDots (like flagsAdvanceDot() in
        // flags.js) — so the spectator gets the already-updated train, not the
        // value one step behind.
        // + campaignBase(): the spectator has no way of its own to know how
        // much the player accumulated in earlier campaign modes — without
        // adding it here, it saw the score start from 0 in Shapes instead of
        // continuing from Flags.
        if (typeof window._specReportAnswer === 'function') {
          window._specReportAnswer(true, Math.round(shapesScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)), {
            index: i, points: pts + speedBonus, speedBonus, hasBadge: !!badgeImg,
            inRowBonus, streak: shapesStreak, dots: shapesDots,
          });
        }
        const dotsContainer = document.getElementById('shapes-progress-dots');
        if (dotsContainer && !_shapesIsInf) {
          dotsContainer.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < shapesDots));
          if (shapesDots >= 10 && !dotsContainer.classList.contains('train-animation')) {
            dotsContainer.classList.add('train-animation');
            const _shapesInfNow = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
            if (!_shapesInfNow) {
              // Adjust shapesTimerDuration (source of truth, see
              // _shapesTimerTick), not shapesTimeLeft directly — otherwise the
              // next tick would overwrite it with the value computed against
              // shapesTimerStartedAt, losing the bonus.
              const elapsed = Math.floor((Date.now() - shapesTimerStartedAt) / 1000);
              const newTimeLeft = Math.min(shapesTimeLeft + 5, 99);
              shapesTimerDuration = elapsed + newTimeLeft;
              shapesTimeLeft = newTimeLeft;
            }
            if (typeof playTimeBonus === 'function') playTimeBonus(document.getElementById('shapes-time-bonus'), 5);
            const tEl = document.getElementById('shapes-timer-number');
            const tImg = document.getElementById('shapes-timer-img');
            if (tEl) { const orig = tEl.style.color; if (!_shapesInfNow) tEl.textContent = shapesTimeLeft; tEl.style.color = '#00ff88';
              const t1 = setTimeout(() => {
                dotsContainer.classList.add('dots-fade-out');
                const t2 = setTimeout(() => {
                  shapesTrainTimeouts = shapesTrainTimeouts.filter(t => t !== t1 && t !== t2);
                  shapesDots = Math.max(0, shapesDots - 10);
                  dotsContainer.classList.remove('train-animation', 'dots-fade-out');
                  dotsContainer.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < shapesDots));
                  if (shapesTimeLeft > 0 && shapesTimeLeft <= 10) { tEl.style.color = '#ffffff'; if (tImg) tImg.src = 'images/countdownred3.png'; }
                  else if (shapesTimeLeft > 10) { tEl.style.color = orig; if (tImg) tImg.src = 'images/countdown3.png'; }
                }, 500);
                shapesTrainTimeouts.push(t2);
              }, 2000);
              shapesTrainTimeouts.push(t1);
            }
          }
        }
        if (typeof showScorePopup !== 'undefined') showScorePopup(pts + speedBonus);
        if (speedBonus > 0) {
          const sbt = document.getElementById('speed-bonus-text');
          if (sbt) {
            sbt.style.zIndex = '120';
            clearTimeout(shapesSpeedBonusHideId);
            sbt.classList.remove('visible');
            void sbt.offsetWidth;
            sbt.classList.add('visible');
            shapesSpeedBonusHideId = setTimeout(() => { sbt.classList.remove('visible'); sbt.style.zIndex = ''; }, 1600);
          }
        }
        if (badgeImg && typeof showFlagsBadge !== 'undefined') {
          const bc = document.getElementById('flags-badge-canvas');
          if (bc) bc.style.zIndex = '999';
          showFlagsBadge(badgeImg, inRowBonus, shapesStreak, window.STAGE_W * 0.39, 0.85);
        }
      } else {
        shapesWrongCooldown.set(country, 5);
        shapesWrongAnswerCount++;
        shapesStreak = 0;
        if (sfxError) { sfxError.currentTime = 0; sfxPlay(sfxError); }
        // + campaignBase(): see comment in the correct branch above.
        if (typeof window._specReportAnswer === 'function') window._specReportAnswer(false, Math.round(shapesScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)), { index: i });
        if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(false, Math.round(shapesScore));
        if ((window._vsActive || window._lobbyActive) && typeof window._lbWrongEffect === 'function') window._lbWrongEffect('player');
      }
      tagEls.forEach(t => { t.style.pointerEvents = 'none'; t.style.cursor = 'default'; });
      setTimeout(() => {
        tagEls.forEach(t => { t.style.transform = getComputedStyle(t).transform; t.classList.add('shape-tag-exit'); });
        setTimeout(() => {
          if (!shapesRunning) { tagEls.forEach(t => t.remove()); return; }
          if (window.practiceConfig && window.practiceConfig.active && shapesPracticePool.length) {
            if (isCorrect) {
              shapesPracticeRemaining = shapesPracticeRemaining.filter(x => x !== shapesPracticeCurrent);
            }
            if (shapesPracticeRemaining.length === 0) {
              // Pool exhausted — all correct, show timesup
              clearInterval(shapesTimerIntervalId);
              shapesRunning = false;
              shapesGameOver = true;
              shapesBlockInput();
              clearTimeout(shapesTagsTimeout); shapesTagsTimeout = null;
              document.querySelectorAll('.shapes-tag').forEach(el => { el.style.cursor = 'default'; el.style.pointerEvents = 'none'; });
              clearTimeout(shapesCurrentAnimTimeout);
              clearTimeout(shapesCurrentClipFadeTimeout);
              if (shapesCurrentImg)  shapesCurrentImg.style.transition  = 'none';
              if (shapesCurrentImg2) shapesCurrentImg2.style.transition = 'none';
              const tImg2 = document.getElementById('shapes-timer-img');
              if (tImg2) tImg2.style.animationPlayState = 'paused';
              if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
              if (typeof window._specReportTimesUp === 'function') window._specReportTimesUp();
              if (typeof playMusic  !== 'undefined') playMusic(null);
              const timeupEl2 = document.getElementById('timeup-overlay');
              if (timeupEl2) {
                timeupEl2.style.zIndex = '300';
                timeupEl2.style.display = 'flex';
                timeupEl2.classList.remove('timeup-out');
                timeupEl2.classList.add('timeup-in');
                shapesEndTimeout1 = setTimeout(() => {
                  timeupEl2.classList.remove('timeup-in');
                  timeupEl2.classList.add('timeup-out');
                  shapesEndTimeout2 = setTimeout(() => {
                    timeupEl2.style.display = 'none';
                    timeupEl2.classList.remove('timeup-out');
                    hideShapesMode();
                  }, 400);
                }, 1800);
              } else {
                hideShapesMode();
              }
              return;
            }
            // Pick next: on wrong with >1 remaining pick a different one; on wrong with 1 remaining keep same
            if (!isCorrect && shapesPracticeRemaining.length > 1) {
              shapesPracticeCurrent = shapesPracticePickNext(shapesPracticeCurrent);
            } else if (isCorrect) {
              shapesPracticeCurrent = shapesPracticePickNext(null);
            }
            // if wrong and only 1 remaining, shapesPracticeCurrent stays the same
            tagEls.forEach(t => t.remove());
            svgEl.remove(); board.remove(); img.remove(); clip.remove();
            const next = shapesPracticeCurrent;
            showCountryShape(next.name, next.ext1, next.ext2);
            return;
          }
          tagEls.forEach(t => t.remove());
          svgEl.remove();
          board.remove();
          img.remove();
          clip.remove();
          for (const [name, remaining] of shapesWrongCooldown) {
            if (remaining <= 1) shapesWrongCooldown.delete(name);
            else shapesWrongCooldown.set(name, remaining - 1);
          }
          const activePool = getActiveShapesPool();
          const pool = activePool.filter(c => !shapesAnsweredSet.has(c.name) && !shapesWrongCooldown.has(c.name));
          const src  = pool.length > 0 ? pool : activePool.filter(c => !shapesAnsweredSet.has(c.name));
          const next = (src.length > 0 ? src : activePool)[Math.floor(shapesRand() * (src.length > 0 ? src : activePool).length)];
          showCountryShape(next.name, next.ext1, next.ext2);
        }, 200);
      }, 500);
      clearTimeout(animTimeout);
      clearTimeout(clipFadeTimeout);
      // Stop the transition WITHOUT pinning the transform as a px matrix (broke
      // vmin: translate(-50%,-50%) became fixed px). Keep the current
      // style.transform, which is in %.
      const frozenOpacity = getComputedStyle(clip).opacity;
      img.style.transition  = 'none';
      img2.style.transition = 'none';
      clip.style.transition = 'none';
      clip.style.opacity    = frozenOpacity;
    });

    tag.appendChild(tagImg);
    tag.appendChild(tagLabel);
    (window.appStage || document.body).appendChild(tag);

    // Long-name fitting in vmin (not px) so it scales with the viewport like
    // the tag (40.4cqmin) and doesn't shrink differently by zoom.
    const tagVminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
    const tagMaxW = 31.8 * tagVminPx;
    let fs = 3.7;
    while (tagLabel.scrollWidth > tagMaxW && fs > 1.76) {
      fs -= 0.22;
      tagLabel.style.fontSize = fs + 'cqmin';
      if (fs < 2.85) tagLabel.style.letterSpacing = '-1px';
      if (fs < 2.2) tagLabel.style.letterSpacing = '-2px';
    }

    tagEls.push(tag);
  });
  }, startDelay);
}

const SHAPE_COUNTRIES = [
  { name: 'China',          label: 'China',            ext1: 'png', ext2: 'jpg' },
  { name: 'Italia',         label: 'Italia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Chile',          label: 'Chile',            ext1: 'png', ext2: 'jpg' },
  { name: 'Japon',          label: 'Japón',            ext1: 'png', ext2: 'jpg' },
  { name: 'Australia',      label: 'Australia',        ext1: 'png', ext2: 'jpg' },
  { name: 'EstadosUnidos',  label: 'Estados Unidos',   ext1: 'png', ext2: 'jpg' },
  { name: 'Brasil',         label: 'Brasil',           ext1: 'png', ext2: 'jpg' },
  { name: 'China',          label: 'China',            ext1: 'png', ext2: 'jpg' },
  { name: 'India',          label: 'India',            ext1: 'png', ext2: 'jpg' },
  { name: 'Noruega',        label: 'Noruega',          ext1: 'png', ext2: 'jpg' },
  { name: 'NuevaZelanda',   label: 'Nueva Zelanda',    ext1: 'png', ext2: 'jpg' },
  { name: 'Mexico',         label: 'México',           ext1: 'png', ext2: 'jpg' },
  { name: 'Argentina',      label: 'Argentina',        ext1: 'png', ext2: 'jpg' },
  { name: 'Indonesia',      label: 'Indonesia',        ext1: 'png', ext2: 'jpg' },
  { name: 'Finlandia',      label: 'Finlandia',        ext1: 'png', ext2: 'jpg' },
  { name: 'ReinoUnido',     label: 'Reino Unido',      ext1: 'png', ext2: 'jpg' },
  { name: 'Espana',         label: 'España',           ext1: 'png', ext2: 'jpg' },
  { name: 'Francia',        label: 'Francia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Sudafrica',      label: 'Sudáfrica',        ext1: 'png', ext2: 'jpg' },
  { name: 'Egipto',         label: 'Egipto',           ext1: 'png', ext2: 'jpg' },
  { name: 'Madagascar',     label: 'Madagascar',       ext1: 'png', ext2: 'jpg' },
  { name: 'Rusia',          label: 'Rusia',            ext1: 'png', ext2: 'jpg' },
  { name: 'Canada',         label: 'Canadá',           ext1: 'png', ext2: 'jpg' },
  { name: 'Alaska',         label: 'Alaska',           ext1: 'png', ext2: 'jpg' },
  { name: 'Islandia',       label: 'Islandia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Suecia',         label: 'Suecia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Portugal',       label: 'Portugal',         ext1: 'png', ext2: 'jpg' },
  { name: 'Grecia',         label: 'Grecia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Somalia',        label: 'Somalia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Ucrania',        label: 'Ucrania',          ext1: 'png', ext2: 'jpg' },
  { name: 'Alemania',       label: 'Alemania',         ext1: 'png', ext2: 'jpg' },
  { name: 'Polonia',        label: 'Polonia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Irlanda',        label: 'Irlanda',          ext1: 'png', ext2: 'jpg' },
  { name: 'Dinamarca',      label: 'Dinamarca',        ext1: 'png', ext2: 'jpg' },
  { name: 'Rumania',        label: 'Rumanía',          ext1: 'png', ext2: 'jpg' },
  { name: 'Croacia',        label: 'Croacia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Iran',           label: 'Irán',             ext1: 'png', ext2: 'jpg' },
  { name: 'Turquia',        label: 'Turquía',          ext1: 'png', ext2: 'jpg' },
  { name: 'ArabiaSaudita',  label: 'Arabia Saudita',   ext1: 'png', ext2: 'jpg' },
  { name: 'Tailandia',      label: 'Tailandia',        ext1: 'png', ext2: 'jpg' },
  { name: 'Vietnam',        label: 'Vietnam',          ext1: 'png', ext2: 'jpg' },
  { name: 'Mongolia',       label: 'Mongolia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Kazajistan',     label: 'Kazajistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Pakistan',       label: 'Pakistán',         ext1: 'png', ext2: 'jpg' },
  { name: 'Afganistan',     label: 'Afganistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Myanmar',        label: 'Myanmar',          ext1: 'png', ext2: 'jpg' },
  { name: 'Filipinas',      label: 'Filipinas',        ext1: 'png', ext2: 'jpg' },
  { name: 'CoreaDelSur',    label: 'Corea del Sur',    ext1: 'png', ext2: 'jpg' },
  { name: 'CoreaDelNorte',  label: 'Corea del Norte',  ext1: 'png', ext2: 'jpg' },
  { name: 'Irak',           label: 'Irak',             ext1: 'png', ext2: 'jpg' },
  { name: 'Yemen',          label: 'Yemen',            ext1: 'png', ext2: 'jpg' },
  { name: 'Oman',           label: 'Omán',             ext1: 'png', ext2: 'jpg' },
  { name: 'Peru',           label: 'Perú',             ext1: 'png', ext2: 'jpg' },
  { name: 'Colombia',       label: 'Colombia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Venezuela',      label: 'Venezuela',        ext1: 'png', ext2: 'jpg' },
  { name: 'Cuba',           label: 'Cuba',             ext1: 'png', ext2: 'jpg' },
  { name: 'Bolivia',        label: 'Bolivia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Ecuador',        label: 'Ecuador',          ext1: 'png', ext2: 'jpg' },
  { name: 'Nicaragua',      label: 'Nicaragua',        ext1: 'png', ext2: 'jpg' },
  { name: 'Honduras',       label: 'Honduras',         ext1: 'png', ext2: 'jpg' },
  { name: 'Guatemala',      label: 'Guatemala',        ext1: 'png', ext2: 'jpg' },
  { name: 'Uruguay',        label: 'Uruguay',          ext1: 'png', ext2: 'jpg' },
  { name: 'Paraguay',       label: 'Paraguay',         ext1: 'png', ext2: 'jpg' },
  { name: 'Mauritania',     label: 'Mauritania',       ext1: 'png', ext2: 'jpg' },
  { name: 'Marruecos',      label: 'Marruecos',        ext1: 'png', ext2: 'jpg' },
  { name: 'Nigeria',        label: 'Nigeria',          ext1: 'png', ext2: 'jpg' },
  { name: 'Niger',          label: 'Niger',            ext1: 'png', ext2: 'jpg' },
  { name: 'Mali',           label: 'Mali',             ext1: 'png', ext2: 'jpg' },
  { name: 'Libia',          label: 'Libia',            ext1: 'png', ext2: 'jpg' },
  { name: 'Argelia',        label: 'Argelia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Etiopia',        label: 'Etiopia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Sudan',          label: 'Sudán',            ext1: 'png', ext2: 'jpg' },
  { name: 'Angola',         label: 'Angola',           ext1: 'png', ext2: 'jpg' },
  { name: 'Tanzania',       label: 'Tanzania',         ext1: 'png', ext2: 'jpg' },
  { name: 'Mozambique',     label: 'Mozambique',       ext1: 'png', ext2: 'jpg' },
  { name: 'Kenia',          label: 'Kenia',            ext1: 'png', ext2: 'jpg' },
  { name: 'RepDemCongo',    label: 'República Democrática del Congo', ext1: 'png', ext2: 'jpg' },
  { name: 'Zimbabue',       label: 'Zimbabue',         ext1: 'png', ext2: 'jpg' },
  { name: 'Namibia',        label: 'Namibia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Botsuana',       label: 'Botsuana',         ext1: 'png', ext2: 'jpg' },
  { name: 'Camerun',        label: 'Camerún',          ext1: 'png', ext2: 'jpg' },
  { name: 'Chad',           label: 'Chad',             ext1: 'png', ext2: 'jpg' },
  { name: 'PapGuinea',      label: 'Papúa Nueva Guinea', ext1: 'png', ext2: 'jpg' },
  { name: 'Groenlandia',    label: 'Groenlandia',      ext1: 'png', ext2: 'jpg' },
  { name: 'Luxemburgo',     label: 'Luxemburgo',       ext1: 'png', ext2: 'jpg' },
  { name: 'PaisesBajos',    label: 'Países Bajos',     ext1: 'png', ext2: 'jpg' },
  { name: 'Belgica',        label: 'Bélgica',          ext1: 'png', ext2: 'jpg' },
  { name: 'Hungria',        label: 'Hungría',          ext1: 'png', ext2: 'jpg' },
  { name: 'Eslovaquia',     label: 'Eslovaquia',       ext1: 'png', ext2: 'jpg' },
  { name: 'RepCheca',       label: 'Chequia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Austria',        label: 'Austria',          ext1: 'png', ext2: 'jpg' },
  { name: 'Suiza',          label: 'Suiza',            ext1: 'png', ext2: 'jpg' },
  { name: 'Kosovo',         label: 'Kosovo',           ext1: 'png', ext2: 'jpg' },
  { name: 'Albania',        label: 'Albania',          ext1: 'png', ext2: 'jpg' },
  { name: 'Bosnia',         label: 'Bosnia y Herzegovina', ext1: 'png', ext2: 'jpg' },
  { name: 'Serbia',         label: 'Serbia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Moldavia',       label: 'Moldavia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Macedonia',      label: 'Macedonia del Norte', ext1: 'png', ext2: 'jpg' },
  { name: 'Eslovenia',      label: 'Eslovenia',        ext1: 'png', ext2: 'jpg' },
  { name: 'Letonia',        label: 'Letonia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Bulgaria',       label: 'Bulgaria',         ext1: 'png', ext2: 'jpg' },
  { name: 'Estonia',        label: 'Estonia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Bielorrusia',    label: 'Bielorrusia',      ext1: 'png', ext2: 'jpg' },
  { name: 'Lituania',       label: 'Lituania',         ext1: 'png', ext2: 'jpg' },
  { name: 'Chipre',         label: 'Chipre',           ext1: 'png', ext2: 'jpg' },
  { name: 'Malta',          label: 'Malta',            ext1: 'png', ext2: 'jpg' },
  { name: 'Andorra',        label: 'Andorra',          ext1: 'png', ext2: 'jpg' },
  { name: 'Liechtenstein',  label: 'Liechtenstein',    ext1: 'png', ext2: 'jpg' },
  { name: 'Jordania',       label: 'Jordania',         ext1: 'png', ext2: 'jpg' },
  { name: 'Libano',         label: 'Líbano',           ext1: 'png', ext2: 'jpg' },
  { name: 'Siria',          label: 'Siria',            ext1: 'png', ext2: 'jpg' },
  { name: 'Israel',         label: 'Israel',           ext1: 'png', ext2: 'jpg' },
  { name: 'Tayikistan',     label: 'Tayikistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Emiratos',       label: 'Emiratos Árabes Unidos', ext1: 'png', ext2: 'jpg' },
  { name: 'Catar',          label: 'Catar',            ext1: 'png', ext2: 'jpg' },
  { name: 'Turkmenistan',   label: 'Turkmenistán',     ext1: 'png', ext2: 'jpg' },
  { name: 'Kuwait',         label: 'Kuwait',           ext1: 'png', ext2: 'jpg' },
  { name: 'Azerbaijan',     label: 'Azerbaiján',       ext1: 'png', ext2: 'jpg' },
  { name: 'Armenia',        label: 'Armenia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Palestina',      label: 'Palestina',        ext1: 'png', ext2: 'jpg' },
  { name: 'Kirguistan',     label: 'Kirguistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Uzbekistan',     label: 'Uzbekistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Georgia',        label: 'Georgia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Nepal',          label: 'Nepal',            ext1: 'png', ext2: 'jpg' },
  { name: 'Butan',          label: 'Bután',            ext1: 'png', ext2: 'jpg' },
  { name: 'Bangladesh',     label: 'Bangladesh',       ext1: 'png', ext2: 'jpg' },
  { name: 'SriLanka',       label: 'Sri Lanka',        ext1: 'png', ext2: 'jpg' },
  { name: 'Malasia',        label: 'Malasia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Laos',           label: 'Laos',             ext1: 'png', ext2: 'jpg' },
  { name: 'Cambodia',       label: 'Cambodia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Brunei',         label: 'Brunei',           ext1: 'png', ext2: 'jpg' },
  { name: 'Timor',          label: 'Timor Oriental',   ext1: 'png', ext2: 'jpg' },
  { name: 'Taiwan',         label: 'Taiwan',           ext1: 'png', ext2: 'jpg' },
  { name: 'Panama',         label: 'Panamá',           ext1: 'png', ext2: 'jpg' },
  { name: 'CostaRica',      label: 'Costa Rica',       ext1: 'png', ext2: 'jpg' },
  { name: 'Belice',         label: 'Belice',           ext1: 'png', ext2: 'jpg' },
  { name: 'ElSalvador',     label: 'El Salvador',      ext1: 'png', ext2: 'jpg' },
  { name: 'Trinidad',       label: 'Trinidad y Tobago', ext1: 'png', ext2: 'jpg' },
  { name: 'Surinam',        label: 'Surinam',          ext1: 'png', ext2: 'jpg' },
  { name: 'Guyana',         label: 'Guyana',           ext1: 'png', ext2: 'jpg' },
  { name: 'Jamaica',        label: 'Jamaica',          ext1: 'png', ext2: 'jpg' },
  { name: 'Guayana',        label: 'Guayana Francesa', ext1: 'png', ext2: 'jpg' },
  { name: 'Bahamas',        label: 'Bahamas',          ext1: 'png', ext2: 'jpg' },
  { name: 'Dominicana',     label: 'República Dominicana', ext1: 'png', ext2: 'jpg' },
  { name: 'Haiti',          label: 'Haití',            ext1: 'png', ext2: 'jpg' },
  { name: 'PuertoRico',     label: 'Puerto Rico',      ext1: 'png', ext2: 'jpg' },
  { name: 'Hawaii',         label: 'Hawaii',           ext1: 'png', ext2: 'jpg' },
  { name: 'Tunez',          label: 'Túnez',            ext1: 'png', ext2: 'jpg' },
  { name: 'Guinea',         label: 'Guinea',           ext1: 'png', ext2: 'jpg' },
  { name: 'CostaDeMarfil',  label: 'Costa de Marfil',  ext1: 'png', ext2: 'jpg' },
  { name: 'Ghana',          label: 'Ghana',            ext1: 'png', ext2: 'jpg' },
  { name: 'Liberia',        label: 'Liberia',          ext1: 'png', ext2: 'jpg' },
  { name: 'SierraLeona',    label: 'Sierra Leona',     ext1: 'png', ext2: 'jpg' },
  { name: 'GuineaBisau',    label: 'Guinea-Bisáu',     ext1: 'png', ext2: 'jpg' },
  { name: 'Gambia',         label: 'Gambia',           ext1: 'png', ext2: 'jpg' },
  { name: 'BurkinaFaso',    label: 'Burkina Faso',     ext1: 'png', ext2: 'jpg' },
  { name: 'Senegal',        label: 'Senegal',          ext1: 'png', ext2: 'jpg' },
  { name: 'Benin',          label: 'Benín',            ext1: 'png', ext2: 'jpg' },
  { name: 'Togo',           label: 'Togo',             ext1: 'png', ext2: 'jpg' },
  { name: 'Uganda',         label: 'Uganda',           ext1: 'png', ext2: 'jpg' },
  { name: 'SudanDelSur',    label: 'Sudán del Sur',    ext1: 'png', ext2: 'jpg' },
  { name: 'Congo',          label: 'República del Congo', ext1: 'png', ext2: 'jpg' },
  { name: 'Gabon',          label: 'Gabón',            ext1: 'png', ext2: 'jpg' },
  { name: 'GuineaEcuator',  label: 'Guinea Ecuatorial', ext1: 'png', ext2: 'jpg' },
  { name: 'Burundi',        label: 'Burundi',          ext1: 'png', ext2: 'jpg' },
  { name: 'Ruanda',         label: 'Ruanda',           ext1: 'png', ext2: 'jpg' },
  { name: 'Sahara',         label: 'Sahara Occidental', ext1: 'png', ext2: 'jpg' },
  { name: 'CaboVerde',      label: 'Cabo Verde',       ext1: 'png', ext2: 'jpg' },
  { name: 'IslasCanarias',  label: 'Islas Canarias',   ext1: 'png', ext2: 'jpg' },
  { name: 'Yibuti',         label: 'Yibuti',           ext1: 'png', ext2: 'jpg' },
  { name: 'Eritrea',        label: 'Eritrea',          ext1: 'png', ext2: 'jpg' },
  { name: 'Esuatini',       label: 'Esuatini',         ext1: 'png', ext2: 'jpg' },
  { name: 'Malaui',         label: 'Malaui',           ext1: 'png', ext2: 'jpg' },
  { name: 'Lesoto',         label: 'Lesoto',           ext1: 'png', ext2: 'jpg' },
  { name: 'Seychelles',     label: 'Seychelles',       ext1: 'png', ext2: 'jpg' },
  { name: 'IslasSalomon',   label: 'Islas Salomón',    ext1: 'png', ext2: 'jpg' },
  { name: 'Vanuatu',        label: 'Vanuatu',          ext1: 'png', ext2: 'jpg' },
  { name: 'NuevaCaledonia', label: 'Nueva Caledonia',  ext1: 'png', ext2: 'jpg' },
  { name: 'Fiji',           label: 'Fiji',             ext1: 'png', ext2: 'jpg' },
  { name: 'Samoa',          label: 'Samoa',            ext1: 'png', ext2: 'jpg' },
];

// ── Pool system ──────────────────────────────────────────────────────────────
// Unlock thresholds: 1 correct → facil | 10 → medio (3 batches) | 30 → dificil

const SHAPES_POOL_INICIO = new Set([
  'Italia','Japon','EstadosUnidos','ReinoUnido','Mexico','Canada','China',
]);

const SHAPES_POOL_FACIL = [
  'India','Noruega','Australia','Francia','NuevaZelanda','Tailandia',
  'Rusia','Brasil','Argentina','Cuba','Irlanda','Chile','Turquia',
  'Vietnam','Polonia','Espana','Iran','Madagascar','Alemania','Suecia',
  'Finlandia','Mongolia','Sudafrica','Egipto',
];

// Ordered from most to least recognizable so the 3-batch unlock makes sense
const SHAPES_POOL_MEDIO = [
  // batch 1 (unlocks at 10 correct)
  'Groenlandia','Indonesia','Kazajistan','ArabiaSaudita','Ucrania','Pakistan',
  'Afganistan','CoreaDelSur','CoreaDelNorte','Myanmar','Filipinas','PapGuinea',
  'Peru','Colombia','Venezuela','Bolivia','Ecuador',
  'PaisesBajos','Austria','Hungria','Suiza','Grecia','Portugal','Rumania','Bulgaria',
  // batch 2 (unlocks at 17 correct)
  'Dinamarca','Islandia','Croacia','Somalia','Irak','Yemen','Oman',
  'Israel','Siria','Nepal','Bangladesh','SriLanka','Malasia','Laos','Cambodia','Taiwan',
  'Alaska','Marruecos','Nigeria','Argelia','Sudan','Etiopia','Angola','Tanzania','Kenia',
  // batch 3 (unlocks at 24 correct)
  'RepDemCongo','Niger','Mali','Libia','Mauritania','Mozambique','Namibia',
  'Zimbabue','Botsuana','Camerun','Chad',
  'Nicaragua','Honduras','Guatemala','Uruguay','Paraguay','Panama','CostaRica',
  'Haiti','Dominicana','Ghana','Senegal','CostaDeMarfil','Uganda','Tunez','SudanDelSur',
];

const SHAPES_POOL_DIFICIL = [
  'Luxemburgo','Belgica','Eslovaquia','RepCheca','Kosovo','Albania','Bosnia','Serbia',
  'Moldavia','Macedonia','Eslovenia','Letonia','Estonia','Bielorrusia','Lituania',
  'Chipre','Malta','Andorra','Liechtenstein',
  'Jordania','Libano','Tayikistan','Emiratos','Catar','Turkmenistan','Kuwait',
  'Azerbaijan','Armenia','Palestina','Kirguistan','Uzbekistan','Georgia',
  'Butan','Brunei','Timor',
  'Belice','ElSalvador','Trinidad','Surinam','Guyana','Guayana','Bahamas','PuertoRico','Hawaii','Jamaica',
  'Guinea','Liberia','SierraLeona','GuineaBisau','Gambia','BurkinaFaso','Benin','Togo',
  'Congo','Gabon','GuineaEcuator','Burundi','Ruanda',
  'Sahara','CaboVerde','IslasCanarias','Yibuti','Eritrea','Esuatini','Malaui','Lesoto','Seychelles',
  'IslasSalomon','Vanuatu','NuevaCaledonia','Fiji','Samoa',
];

function getActiveShapesPool() {
  const names = new Set(SHAPES_POOL_INICIO);
  if (shapesCorrectCount >= 1) SHAPES_POOL_FACIL.forEach(n => names.add(n));
  if (shapesCorrectCount >= 10) {
    const batch1End = 25;
    const batch2End = 50;
    const limit = shapesCorrectCount >= 24 ? SHAPES_POOL_MEDIO.length
                : shapesCorrectCount >= 17 ? batch2End
                : batch1End;
    SHAPES_POOL_MEDIO.slice(0, limit).forEach(n => names.add(n));
  }
  if (shapesCorrectCount >= 30) SHAPES_POOL_DIFICIL.forEach(n => names.add(n));
  let pool = SHAPE_COUNTRIES.filter(c => names.has(c.name));
  if (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.mode === 'shapes') {
    const conts = window.practiceConfig.continents;
    const byContinent = c => conts.has(SHAPE_COUNTRY_CONTINENT[c.name]);
    // Build a continent-filtered pool with progressive per-tier fallback
    const inicioFiltered = SHAPE_COUNTRIES.filter(c => SHAPES_POOL_INICIO.has(c.name) && byContinent(c));
    const facil          = SHAPE_COUNTRIES.filter(c => SHAPES_POOL_FACIL.includes(c.name) && byContinent(c));
    const medio          = SHAPE_COUNTRIES.filter(c => SHAPES_POOL_MEDIO.includes(c.name) && byContinent(c));
    const dificil        = SHAPE_COUNTRIES.filter(c => SHAPES_POOL_DIFICIL.includes(c.name) && byContinent(c));
    const MIN = 4;
    let filled = [...inicioFiltered];
    if (filled.length < MIN) {
      const need = MIN - filled.length;
      const extra = facil.filter(c => !filled.includes(c));
      filled = [...filled, ...extra.slice(0, need)];
    }
    if (filled.length < MIN) {
      const need = MIN - filled.length;
      const extra = medio.filter(c => !filled.includes(c));
      filled = [...filled, ...extra.slice(0, need)];
    }
    if (filled.length < MIN) {
      const need = MIN - filled.length;
      const extra = dificil.filter(c => !filled.includes(c));
      filled = [...filled, ...extra.slice(0, need)];
    }
    // Full filtered pool for the game (inicio + unlocked tiers)
    const fullFiltered = pool.filter(byContinent);
    pool = fullFiltered.length ? fullFiltered : [...filled, ...facil, ...medio];
    // Ensure the inicio ones (+ fallback) are always in the pool
    filled.forEach(c => { if (!pool.includes(c)) pool.push(c); });
  }
  return pool;
}
// ─────────────────────────────────────────────────────────────────────────────

const SHAPES_PREGAME_STEPS = [
  { src: 'images/countdown/3.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/2.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/1.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/go.png', hold: 950,  size: 54 },
];

let shapesPregameTimeout = null;
let shapesAborted = false;
let shapesEndTimeout1 = null, shapesEndTimeout2 = null;
let shapesTagsTimeout = null;
// elapsedMs (optional): how much of the 3-2-1 already passed on the REAL
// player's side — used by the spectator joining mid-count (see
// shapesSpectatorShowPregame) to start at the right number/audio, instead of
// always from "3".
function runShapesPregame(onDone, elapsedMs) {
  shapesAborted = false;
  const el  = document.getElementById('pregame-countdown');
  const img = document.getElementById('pregame-countdown-img');
  if (!el || !img) { console.warn('[spec] runShapesPregame: missing el/img, skipping straight to onDone'); onDone(); return; }
  el.style.display = 'flex';
  // Unblock the Opera compositor when the countdown starts (see
  // window.nudgeRepaint in js/core/ui-helpers.js).
  if (typeof window.nudgeRepaint === 'function') {
    window.nudgeRepaint();
    setTimeout(window.nudgeRepaint, 120);
  }
  // Locate which step (3/2/1/GO) and how much of THAT step remains to start
  // at, summing the "hold" values to find where elapsedMs falls.
  let step = 0;
  let firstStepRemaining = null;
  if (elapsedMs > 0) {
    let acc = 0;
    for (let i = 0; i < SHAPES_PREGAME_STEPS.length; i++) {
      const stepEnd = acc + SHAPES_PREGAME_STEPS[i].hold;
      if (elapsedMs < stepEnd) { step = i; firstStepRemaining = stepEnd - elapsedMs; break; }
      acc = stepEnd;
      step = i + 1;
    }
    if (step >= SHAPES_PREGAME_STEPS.length) {
      el.style.display = 'none'; onDone(); return;
    }
  }
  if (typeof sfxCountdown !== 'undefined') {
    try { sfxCountdown.currentTime = elapsedMs > 0 ? elapsedMs / 1000 : 0; } catch (e) {}
    sfxPlay(sfxCountdown);
  }
  function showStep() {
    if (shapesAborted) return; // abandoned during the 3-2-1
    if (step >= SHAPES_PREGAME_STEPS.length) { el.style.display = 'none'; onDone(); return; }
    const { src, hold, size } = SHAPES_PREGAME_STEPS[step++];
    const thisHold = firstStepRemaining != null ? firstStepRemaining : hold;
    firstStepRemaining = null;
    img.style.animation = 'none';
    img.style.width     = size + 'cqmin';
    img.style.height    = size + 'cqmin';
    img.src = src;
    void img.offsetWidth;
    img.style.animation = '';
    shapesPregameTimeout = setTimeout(showStep, thisHold);
  }
  showStep();
}

// Stops and resets ALL of shapes mode (no scoring or gameover). Used by quitToMenu.
function shapesHardReset() {
  shapesAborted = true;
  // Without this, a _shapesTimerTick tick already queued when clearInterval()
  // below was called (tab long in the background, browser had it
  // throttled/queued) passed _shapesTimerTick's "!shapesRunning" guard anyway
  // and fired the real TIMES UP after returning to the menu — and since
  // shapesAborted stays true until the next round, the setTimeouts that hide
  // the overlay (see the real timer below) also aborted themselves, leaving
  // the overlay blocking the whole page forever (see flagsHardReset, same
  // pattern).
  shapesRunning = false;
  const _cwImgReset = document.getElementById('shapes-timer-img');
  if (_cwImgReset) _cwImgReset.style.animationPlayState = 'paused';
  clearTimeout(shapesPregameTimeout); shapesPregameTimeout = null;
  clearTimeout(shapesEndTimeout1); clearTimeout(shapesEndTimeout2);
  clearTimeout(shapesTagsTimeout); shapesTagsTimeout = null;
  clearInterval(shapesTimerIntervalId);
  if (window._powerQuitOverlay) {
    // Block interactions during the game-over overlay; the tags stay visible
    shapesGameOver = true;
    shapesBlockInput();
  } else {
    shapesUnblockInput();
  }
  if (shapesScoreRafId) { cancelAnimationFrame(shapesScoreRafId); shapesScoreRafId = null; }
  clearTimeout(shapesCurrentAnimTimeout);
  clearTimeout(shapesCurrentClipFadeTimeout);
  clearTimeout(shapesSpeedBonusHideId);
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  if (!window._powerQuitOverlay && !window._vsShowingResult) {
    // Remove the in-progress silhouette/tag/board and the countdown widget
    document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
    document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
    document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
    shapesCurrentImg = shapesCurrentImg2 = shapesCurrentClip = null;
    shapesCurrentBoard = shapesCurrentSvg = null;
    document.getElementById('shapes-countdown-widget')?.remove();
    document.getElementById('pregame-countdown') && (document.getElementById('pregame-countdown').style.display = 'none');
    const shTimeup = document.getElementById('timeup-overlay');
    if (shTimeup) { shTimeup.style.display = 'none'; shTimeup.classList.remove('timeup-in','timeup-out'); shTimeup.style.zIndex = ''; }
    const sbt = document.getElementById('speed-bonus-text');
    if (sbt) sbt.classList.remove('visible');
  }
}
window.gameStoppers = window.gameStoppers || [];
window.gameStoppers.push(shapesHardReset);
window.shapesHardReset = shapesHardReset;

// Picks the next practice shape using the same tier-unlock logic as normal mode,
// capped at practiceConfig.difficulty. Excludes `exc` (pass current when wrong, null when correct).
function shapesPracticePickNext(exc) {
  const diff = (window.practiceConfig && window.practiceConfig.difficulty) || 'dificil';
  const pool = exc ? shapesPracticeRemaining.filter(c => c !== exc) : shapesPracticeRemaining;
  const fallback = pool.length ? pool : shapesPracticeRemaining;
  const unlocked = new Set(SHAPES_POOL_INICIO);
  if (shapesCorrectCount >= 1  && diff !== 'inicio') SHAPES_POOL_FACIL.forEach(n => unlocked.add(n));
  if (shapesCorrectCount >= 10 && (diff === 'medio' || diff === 'dificil')) {
    const limit = shapesCorrectCount >= 24 ? SHAPES_POOL_MEDIO.length
                : shapesCorrectCount >= 17 ? 50 : 25;
    SHAPES_POOL_MEDIO.slice(0, limit).forEach(n => unlocked.add(n));
  }
  if (shapesCorrectCount >= 30 && diff === 'dificil') SHAPES_POOL_DIFICIL.forEach(n => unlocked.add(n));
  let tiered = fallback.filter(c => unlocked.has(c.name));
  if (!tiered.length) {
    // Continent has no unlocked-tier shapes; expand progressively to next tiers
    const ordered = [SHAPES_POOL_FACIL, SHAPES_POOL_MEDIO, SHAPES_POOL_DIFICIL];
    for (const tier of ordered) {
      tier.forEach(n => unlocked.add(n));
      tiered = fallback.filter(c => unlocked.has(c.name));
      if (tiered.length) break;
    }
  }
  const pick = tiered.length ? tiered : fallback;
  return pick[Math.floor(Math.random() * pick.length)] || null;
}

// ── TIMER ─────────────────────────────────────────────────────────────────────
// shapesTimeLeft is computed against shapesTimerStartedAt (Date.now()), not by
// subtracting 1 per tick — a background-throttled setInterval loses real ticks
// and a counter that subtracts 1 per tick falls behind real time; here it
// self-corrects in one step as soon as it ticks again (or the tab returns to
// the foreground), instead of dragging the lag.
function _shapesTimerTick() {
  // Defensive guard — same reason as _timerTick (js/modes/mapgame-play.js) and
  // _flagsTimerTick (flags.js): a ghost tick from an already-finished round, if
  // the interval wasn't cleared in time, could show the giant TIMES UP over the
  // menu.
  if (!shapesRunning) { clearInterval(shapesTimerIntervalId); return; }
  const _shapesInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
  if (_shapesInfinite) return;
  const tEl  = document.getElementById('shapes-timer-number');
  const tImg = document.getElementById('shapes-timer-img');
  const elapsed = Math.floor((Date.now() - shapesTimerStartedAt) / 1000);
  shapesTimeLeft = Math.max(0, shapesTimerDuration - elapsed);
  if (tEl) { tEl.textContent = shapesTimeLeft; tEl.classList.remove('timer-number-infinity'); }
  if (shapesTimeLeft <= 10) {
    if (tEl)  tEl.style.color = '#ffffff';
    if (tImg) tImg.src = 'images/countdownred3.png';
    if (shapesTimeLeft > 0 && typeof sfxTickdown !== 'undefined') { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
  } else {
    if (tEl) tEl.style.color = '';
  }
  if (typeof window._specReportTick === 'function') window._specReportTick(shapesTimeLeft);
  if (shapesTimeLeft <= 0) {
    clearInterval(shapesTimerIntervalId);
    shapesRunning = false;
    shapesGameOver = true;
    shapesBlockInput();
    clearTimeout(shapesTagsTimeout); shapesTagsTimeout = null;
    document.querySelectorAll('.shapes-tag').forEach(el => { el.style.cursor = 'default'; el.style.pointerEvents = 'none'; });
    document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
    clearTimeout(shapesCurrentAnimTimeout);
    clearTimeout(shapesCurrentClipFadeTimeout);
    // Stop the transition without pinning the transform as a px matrix (that
    // turned translate(-50%,-50%) into fixed px and broke vmin on zoom). Keep
    // the current style.transform, already in %.
    if (shapesCurrentImg)  { shapesCurrentImg.style.transition  = 'none'; }
    if (shapesCurrentImg2) { shapesCurrentImg2.style.transition = 'none'; }
    if (shapesCurrentClip) { const f = getComputedStyle(shapesCurrentClip).opacity;   shapesCurrentClip.style.transition = 'none'; shapesCurrentClip.style.opacity   = f; }
    if (tImg) tImg.style.animationPlayState = 'paused';
    if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
    if (typeof window._specReportTimesUp === 'function') window._specReportTimesUp();
    if (typeof playMusic  !== 'undefined') playMusic(null);
    const timeupEl = document.getElementById('timeup-overlay');
    if (timeupEl) {
      timeupEl.style.zIndex = '300';
      timeupEl.style.display = 'flex';
      timeupEl.classList.remove('timeup-out');
      timeupEl.classList.add('timeup-in');
      shapesEndTimeout1 = setTimeout(() => {
        if (shapesAborted) return;
        timeupEl.classList.remove('timeup-in');
        timeupEl.classList.add('timeup-out');
        shapesEndTimeout2 = setTimeout(() => {
          if (shapesAborted) return;
          timeupEl.style.display = 'none';
          timeupEl.classList.remove('timeup-out');
          hideShapesMode();
        }, 400);
      }, 1800);
    } else {
      hideShapesMode();
    }
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && shapesRunning && shapesTimerIntervalId) _shapesTimerTick();
});

// ── SHOW / HIDE SHAPES MODE ───────────────────────────────────────────────────
function showShapesMode() {
  shapesAborted = false; // new session: re-enable
  shapesUnblockInput();
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  if (typeof playMusic   !== 'undefined') playMusic(null);

  document.getElementById('loading-screen').style.display = 'none';
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'block';
  const shapesSbt = document.getElementById('speed-bonus-text');
  if (shapesSbt) shapesSbt.style.display = '';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'flex'; rightPanel.style.zIndex = '120'; }

  // VS / Lobby: rebuild leaderboard with opponent/rival entries
  if ((window._vsActive || window._lobbyActive) && typeof initLeaderboard === 'function') initLeaderboard();

  document.querySelectorAll('.game-bg-city').forEach(el => { el.src = 'images/bg/level2complete.png'; });
  shapesScore = 0; shapesDisplayedScore = 0; shapesStreak = 0; shapesDots = 0;
  // Initial scoreboard = ACCUMULATED score from previous modes (campaignBase)
  // — like monuments/cities/flags on start. Without this, shapesAnimateScore
  // (which only runs when there IS a gain) left the scoreboard at 0/stale until
  // the first answer, so moving from a previous mode to Shapes made the score
  // visually "reset" until the player got something right (reported,
  // flags→shapes).
  {
    const _shScoreEl = document.getElementById('score-value');
    if (_shScoreEl) _shScoreEl.textContent = ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0).toLocaleString();
  }
  shapesTrainTimeouts.forEach(clearTimeout); shapesTrainTimeouts = [];
  shapesAnsweredSet    = new Set();
  shapesWrongCooldown  = new Map();
  shapesCorrectCount   = 0;
  if (window.practiceConfig && window.practiceConfig.active) {
    if (typeof initLeaderboard !== 'undefined') initLeaderboard();
    shapesPracticePool = buildShapesPracticePool(window.practiceConfig.continents, window.practiceConfig.difficulty);
    shapesPracticeRemaining = [...shapesPracticePool];
    shapesPracticeCurrent = shapesPracticeRemaining.length ? shapesPracticePickNext(null) : null;
  }
  shapesWrongAnswerCount = 0;
  if (typeof setModeCounts !== 'undefined') setModeCounts(0, 0);

  const scoreEl = document.getElementById('score-value');
  if (scoreEl) scoreEl.textContent = (((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
  if (typeof lastLbScore    !== 'undefined') lastLbScore    = -1;
  if (typeof lastPlayerRank !== 'undefined') lastPlayerRank = -1;
  if (typeof lbElements !== 'undefined') {
    Object.values(lbElements).forEach(el => { el.style.transition = 'none'; });
  }
  requestAnimationFrame(() => {
    if (typeof positionLeaderboard !== 'undefined') positionLeaderboard(0, false);
    requestAnimationFrame(() => {
      if (typeof lbElements !== 'undefined') {
        Object.values(lbElements).forEach(el => {
          el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)';
        });
      }
    });
  });

  const PREGAME_DURATION = SHAPES_PREGAME_STEPS.reduce((s, x) => s + x.hold, 0);
  let c;
  if (document.body.classList.contains('recording-mode')) {
    c = SHAPE_COUNTRIES.find(co => co.name === 'China');
  } else if (window.practiceConfig && window.practiceConfig.active && shapesPracticePool.length) {
    if (!shapesPracticeCurrent) { clearInterval(shapesTimerIntervalId); shapesRunning = false; hideShapesMode(); return; }
    c = shapesPracticeCurrent;
  } else {
    const initActive = getActiveShapesPool();
    const initPool   = initActive.filter(co => !shapesAnsweredSet.has(co.name));
    const initSrc    = initPool.length > 0 ? initPool : initActive;
    c = initSrc[Math.floor(shapesRand() * initSrc.length)];
  }
  showCountryShape(c.name, c.ext1, c.ext2, PREGAME_DURATION);
  // The timer widget stays VISIBLE (paused, with "60" already set since
  // showCountryShape created it) during the 3-2-1-GO — like flags with its own
  // widget (countdown2.png). It used to be hidden here with visibility:hidden,
  // inconsistent with flags and the reason nothing of the timer "appeared"
  // until the round started.

  if (typeof window._specReportPregame === 'function') {
    const _specInf = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    const _specDur = _specInf ? '∞' : (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer > 0)
      ? window.practiceConfig.timer : window.GAME_DURATION;
    // startedAt: so a spectator joining mid 3-2-1 can compute how much passed
    // and start at the right number (not always "3") — see
    // runShapesPregame(onDone, elapsedMs) below.
    // mode:'shapes' just in case — here the 'round' ALREADY arrives before this
    // 'pregame' and updates the spectator's _mode, but declaring it here also
    // makes it correct regardless of that order (see the same field added in
    // flags/cities).
    // campaignBaseAtStart: the real player shows this number from the start of
    // the 3-2-1 — the spectator has no way of its own to know it.
    window._specReportPregame({
      mode: 'shapes', duration: _specDur, infinite: _specInf, startedAt: Date.now(),
      campaignBaseAtStart: (typeof window.campaignBase === 'function') ? window.campaignBase() : 0,
    });
  }
  runShapesPregame(() => {
    if (typeof playMusic !== 'undefined') playMusic(sfxGameMusic);
    if (window._practiceStats) window._practiceStats.startTime = Date.now();
    const _shapesInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    shapesTimeLeft = _shapesInfinite ? 0 : (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer > 0)
      ? window.practiceConfig.timer
      : window.GAME_DURATION;
    shapesRunning  = true;
    shapesGameOver = false;
    const tElInit = document.getElementById('shapes-timer-number');
    if (_shapesInfinite && tElInit) { tElInit.textContent = '∞'; tElInit.classList.add('timer-number-infinity'); }
    const _tImgInit = document.getElementById('shapes-timer-img');
    if (_tImgInit) _tImgInit.style.animationPlayState = 'running';
    // Reveal the timer right when the game starts
    const _cwPost = document.getElementById('shapes-countdown-widget');
    if (_cwPost) _cwPost.style.visibility = '';

    shapesTimerDuration  = shapesTimeLeft;
    shapesTimerStartedAt = Date.now();
    clearInterval(shapesTimerIntervalId);
    shapesTimerIntervalId = setInterval(_shapesTimerTick, 1000);
  }); // end runShapesPregame
}

function _shapesCleanupVisuals() {
  document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch(e) {} });
  shapesCurrentImg = shapesCurrentImg2 = shapesCurrentClip = null;
  shapesCurrentBoard = shapesCurrentSvg = null;
  document.getElementById('shapes-countdown-widget')?.remove();
}

function hideShapesMode() {
  shapesUnblockInput();
  // Remove interactive elements immediately (must not be clickable)
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());

  // hide shared UI
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'none';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'none'; rightPanel.style.visibility = ''; }
  if (shapesScoreRafId) { cancelAnimationFrame(shapesScoreRafId); shapesScoreRafId = null; }
  clearTimeout(shapesSpeedBonusHideId);
  const sbt = document.getElementById('speed-bonus-text');
  if (sbt) sbt.classList.remove('visible');

  // final score & highscore
  const finalScore = Math.round(shapesScore);
  window.lastModeScore = finalScore;

  if (window._suppressGameover) {
    _shapesCleanupVisuals();
    window._suppressGameover = false;
    return;
  }

  // ── VERSUS: keep the background PNGs until the user exits to the panel ──
  // shapesHardReset (via quitToMenu) clears .shapes-stage-el when appropriate.
  if (window._vsActive && typeof window._vsHandleGameEnd === 'function') {
    document.getElementById('shapes-countdown-widget')?.remove();
    shapesCurrentImg = shapesCurrentImg2 = shapesCurrentClip = null;
    shapesCurrentBoard = shapesCurrentSvg = null;
    window._vsHandleGameEnd(finalScore);
    return;
  }

  // ── LOBBY: report the result to the room system ─────────
  if (window._lobbyActive && typeof window._lobbyHandleGameEnd === 'function') {
    _shapesCleanupVisuals();
    window._lobbyHandleGameEnd(finalScore);
    return;
  }

  _shapesCleanupVisuals();

  // ── PRACTICE: redirect to the panel ───────────────────────
  if (window.practiceConfig && window.practiceConfig.active) {
    window.endPracticeSession(finalScore, shapesCorrectCount, shapesWrongAnswerCount);
    return;
  }
  // ──────────────────────────────────────────────────────────

  // Log the single-player shapes game for stats.
  if (window.Analytics) window.Analytics.logGame('shapes', finalScore);

  const baseShapes = (typeof window.campaignBase === 'function') ? window.campaignBase() : 0;
  const finalScoreEl = document.getElementById('final-score-value');
  if (finalScoreEl) finalScoreEl.textContent = (finalScore + baseShapes).toLocaleString();
  const LS_HS = 'shapesHighscore';
  const prevHS = parseInt(localStorage.getItem(LS_HS) || '0', 10);
  const newHSBanner = document.getElementById('new-highscore-banner');
  const newHSScore  = document.getElementById('new-highscore-score');
  if (finalScore > prevHS) {
    // During an in-progress campaign it isn't persisted yet: kept as pending
    // and only committed to localStorage once the whole Gira Mundial completes
    // (see window._commitCampaignHighscores in js/core/campaign.js).
    if (window.campaign && window.campaign.active) {
      window.campaign.pendingHS.shapes = finalScore;
    } else {
      localStorage.setItem(LS_HS, String(finalScore));
    }
    if (newHSBanner) newHSBanner.style.display = 'flex';
    if (newHSScore)  newHSScore.textContent = finalScore.toLocaleString();
  } else {
    if (newHSBanner) newHSBanner.style.display = 'none';
  }

  if (typeof window._specReportPostgame === 'function') {
    window._specReportPostgame({
      totalScore: finalScore + baseShapes,
      finalScore,
      correctCount: shapesCorrectCount,
      wrongCount: shapesWrongAnswerCount,
      isNewHighscore: finalScore > prevHS,
    });
  }

  // gameover screen
  if (typeof setModeCounts !== 'undefined') setModeCounts(shapesCorrectCount, shapesWrongAnswerCount);
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) {
    window.hideGameoverConfirm?.();
    gameoverScreen.style.display = 'flex';
    const label = gameoverScreen.querySelector('.gameover-text1-label');
    if (label) label.textContent = t('gameover.shapes');
  }
  if (typeof restartFlightAtt !== 'undefined') restartFlightAtt();
  if (typeof buildChecksRow   !== 'undefined') buildChecksRow();
  const checksEndTime = (shapesCorrectCount > 0 ? (shapesCorrectCount - 1) * 0.1 + 0.2 : 0) + 0.4;
  if (typeof buildWrongsRow   !== 'undefined') buildWrongsRow(checksEndTime);
  if (typeof playMusic        !== 'undefined') playMusic(sfxPostgame);
  // In a campaign, preload the next mode's assets (cities) while the user reads their score
  if (window.campaign && window.campaign.active && typeof window.preloadNextModeAssets === 'function') {
    window.preloadNextModeAssets('game').then(() => window.showGameoverConfirm?.());
  } else {
    setTimeout(() => window.showGameoverConfirm?.(), 800);
  }
}
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('loading-shapes-btn').addEventListener('click', () => {
  window._autoDismissVsInvites?.();
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
  if (typeof window._setPlaying === 'function') window._setPlaying(true);
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  window.pendingGameMode = 'shapes';
  // Tell a possible spectator we entered this mode's instructions — see the
  // long comment (with the microtask-defer rationale) at the same point in
  // flags.js.
  Promise.resolve().then(() => {
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: 'shapes' });
  });
  window.resetSplashEntry?.();
  document.getElementById('loading-screen').style.display = 'none';
  const splashEl = document.getElementById('splash-screen');
  splashEl.style.display = 'flex';
  window.showSplashConfirm?.();
  const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
  void splashEl.offsetWidth;
  animEls.forEach(el => el.classList.add('animate-in'));
  if (typeof playMusic !== 'undefined') playMusic(sfxPregame);
  requestAnimationFrame(() => {
    document.getElementById('splash-screen').classList.add('mode-flags', 'mode-shapes');
    document.getElementById('splash-screen').classList.remove('mode-monuments');
    document.getElementById('gameover-screen').classList.add('mode-flags', 'mode-shapes');
    document.getElementById('gameover-screen').classList.remove('mode-monuments');
    window.swapHowtoVideo?.('images/howtoplay/howtoplay2.mp4');
    document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men5.png');
    document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men6.png');
    document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl5.png');
    document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl6.png');
    document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women4.png');
    document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women5.png');
    document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level2complete.png');
    document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check2.png');
    document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong2.png');
    const label = document.querySelector('.splash-text2-label');
    { const _pk = (window.practiceConfig && window.practiceConfig.active) ? 'splash.practice.shapes.1' : 'splash.shapes.1'; if (label) { label.textContent = t(_pk); label.classList.remove('step2'); } }
    const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
    if (howtoWrap) howtoWrap.classList.remove('slide-down');
    const howtoTitle = document.querySelector('.splash-howtoplay-title');
    if (howtoTitle) howtoTitle.textContent = 'Map Mayhem';
  });
});

document.getElementById('loading-shapes-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
});

// ── MONUMENTS MODE (placeholder) ───────────────────────────────────────────
document.getElementById('loading-mode4-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
});

document.getElementById('loading-mode4-btn').addEventListener('click', () => {
  window._autoDismissVsInvites?.();
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
  if (typeof window._setPlaying === 'function') window._setPlaying(true);
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  window.pendingGameMode = 'monuments';
  // Tell a possible spectator we entered this mode's instructions — see the
  // long comment (with the microtask-defer rationale) at the same point in
  // flags.js.
  Promise.resolve().then(() => {
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: 'monuments' });
  });
  window.resetSplashEntry?.();
  document.getElementById('loading-screen').style.display = 'none';
  // Free the previous mode's (cities) RAM BEFORE loading monuments' heavy
  // assets (2 full-screen backgrounds + flicker). monuments is the heaviest
  // mode and the last of the campaign, so the memory peak hits right here.
  // releaseGameMemory releases the previous canvas, flags-badge-canvas, the
  // video and the character/background bitmaps monuments doesn't reuse; the
  // lines below re-assign only what monuments needs. monuments.startGame
  // restores the canvas.
  if (typeof window.releaseGameMemory === 'function') window.releaseGameMemory();
  // Update mode and backgrounds BEFORE showing the splash to avoid the blank
  // frame seen when transitioning from cities in a campaign.
  document.getElementById('splash-screen').classList.remove('mode-flags', 'mode-shapes');
  document.getElementById('splash-screen').classList.add('mode-monuments');
  document.getElementById('gameover-screen').classList.remove('mode-flags', 'mode-shapes');
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women1.png');
  // Release level3complete.png (different class: .game-bg-city) before decoding the monuments ones.
  document.querySelectorAll('.game-bg-city').forEach(el => { el.src = ''; });
  document.querySelectorAll('.game-bg-city-monuments').forEach(el => el.src = 'images/bg/level4complete.png');
  document.querySelectorAll('.game-bg-city-monuments2').forEach(el => el.src = 'images/bg/level4complete2.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check4.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong4.png');
  const label = document.querySelector('.splash-text2-label');
  { const _pk = (window.practiceConfig && window.practiceConfig.active) ? 'splash.practice.monuments.1' : 'splash.monuments.1'; if (label) { label.textContent = t(_pk); label.classList.remove('step2'); } }
  const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
  if (howtoWrap) howtoWrap.classList.remove('slide-down');
  const howtoTitle = document.querySelector('.splash-howtoplay-title');
  if (howtoTitle) howtoTitle.textContent = 'Landmark Loco';
  const splashEl = document.getElementById('splash-screen');
  splashEl.style.display = 'flex';
  window.showSplashConfirm?.();
  const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
  void splashEl.offsetWidth;
  animEls.forEach(el => el.classList.add('animate-in'));
  if (typeof playMusic !== 'undefined') playMusic(sfxPregame);
  window.swapHowtoVideo?.('images/howtoplay/howtoplay4.mp4');
});

