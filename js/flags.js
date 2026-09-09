// ── FLAGS MODE ──────────────────────────────────────────────────────────────
document.addEventListener('contextmenu', e => {
  if (e.target.closest('#flags-luggage-wrap')) e.preventDefault();
});

['flags-luggage-group', 'flags-luggage-left-group', 'flags-luggage-right-group',
 'flags-luggage-bl-group', 'flags-luggage-bc-group', 'flags-luggage-br-group'].forEach(id => {
  document.getElementById(id)?.addEventListener('mouseenter', () => {
    if (!flagsRunning) return;
    if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
  });
});

const FLAGS_GAME_DURATION = window.GAME_DURATION;

const flagsWrapper       = document.getElementById('flags-wrapper');
const flagsScoreDisplay  = document.getElementById('flags-score-display');
const flagsRightPanel    = document.getElementById('flags-right-panel');
const mainRightPanel     = document.getElementById('right-panel');
const flagsMachine       = document.getElementById('flags-machine');
const flagsMachine2      = document.getElementById('flags-machine2');
const flagsMachine3      = document.getElementById('flags-machine3');
const flagsMachine3b     = document.getElementById('flags-machine3b');
const flagsFindLuggage   = document.getElementById('flags-findluggage');
flagsFindLuggage.addEventListener('dragstart', e => e.preventDefault());
const flagsLuggageWrap   = document.getElementById('flags-luggage-wrap');
flagsLuggageWrap.addEventListener('dragstart', e => e.preventDefault());

// The suitcase and its flags use a px coordinate system (group offsets, clip-path:
// path(...) and matrix3d) that CANNOT be expressed in vmin. To scale with the
// viewport like everything else, the whole wrap is scaled as a unit.
// Factor = min(vw,vh)/911 → 1.0 at the reference viewport (9.11px per vmin).
function flagsLuggageScale() {
  return Math.min(window.STAGE_W, window.STAGE_H) / 911;
}
function scaleFlagsLuggage() {
  flagsLuggageWrap.style.transform = `translate(-50%, -50%) scale(${flagsLuggageScale()})`;
}
window.addEventListener('resize', scaleFlagsLuggage);
scaleFlagsLuggage();
const flagsFlagImg       = document.getElementById('flags-flag-img');
const flagsFlagidWrap    = document.getElementById('flags-flagid-wrap');
const flagsFlagidLabel   = document.getElementById('flags-flagid-label');
const flagsPregameEl     = document.getElementById('flags-pregame-countdown');
const flagsPregameImg    = document.getElementById('flags-pregame-countdown-img');
const flagsTimeupEl      = document.getElementById('flags-timeup-overlay');
const flagsTimerEl       = document.getElementById('flags-timer-number');
const flagsTimerImg      = document.querySelector('#flags-countdown-widget > img');
const flagsScoreEl       = document.getElementById('flags-score-value');
const flagsResultLabel   = document.getElementById('flags-result-label');

let flagsTimerIntervalId = null;
let flagsTimeLeft        = FLAGS_GAME_DURATION;
// The timer's real source of truth (see startFlagsTimer) — flagsTimeLeft is
// just the derived value that's displayed.
let flagsTimerDuration   = FLAGS_GAME_DURATION;
let flagsTimerStartedAt  = 0;
let flagsScore           = 0;
let flagsDisplayedScore  = 0;
let flagsScoreRafId      = null;
let flagsRunning         = false;
let flagsWrongCount      = 0;

const FLAGS_PREGAME_STEPS = [
  { src: 'images/countdown/3.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/2.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/1.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/go.png', hold: 950,  size: 54 },
];

// ── SHOW / HIDE ───────────────────────────────────────────────────────────────
// Pre-decodes all flags in the background on entering the mode.
// Doesn't block the main thread. Higher concurrency (16 instead of 4) for the
// spectator: unlike the real player (who arrives here after a while on the
// loading screen, with the manifest already amply preloaded), they can enter
// at any time — more parallel streams shortens the window in which the current
// round's flags haven't finished downloading.
function prewarmFlagTextures(concurrency) {
  const urls = Object.values(COUNTRY_FLAGS);
  let i = 0;
  function next() {
    if (i >= urls.length) return;
    const img = new Image();
    img.src = urls[i++];
    (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(next);
  }
  for (let k = 0; k < (concurrency || 4); k++) next();
}

function showFlagsMode() {
  prewarmFlagTextures();
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  if (typeof playMusic !== 'undefined') playMusic(null);
  const gameCanvas = document.getElementById('game-canvas');

  flagsWrapper.style.position  = '';
  flagsWrapper.style.left      = '';
  flagsWrapper.style.top       = '';
  flagsWrapper.style.margin    = '';
  flagsWrapper.style.width     = gameCanvas.width  + 'px';
  flagsWrapper.style.height    = gameCanvas.height + 'px';
  flagsWrapper.style.display   = 'block';

  // Apply the same scale redimensionarJuego computes
  const anchoVentana = window.STAGE_W;
  const altoVentana  = window.STAGE_H;
  const margenHorizontal = anchoVentana * 0.35;
  const escalaW = (anchoVentana - margenHorizontal) / gameCanvas.width;
  const escalaH = (altoVentana - altoVentana * 0.08) / gameCanvas.height;
  const escala  = Math.min(escalaW, escalaH) * 0.92;
  flagsWrapper.style.transform       = `translate(-50%, -50%) scale(${escala})`;
  flagsWrapper.style.transformOrigin = 'center center';
  flagsScoreDisplay.style.display = 'block';
  flagsSpeedBonusText.style.display = '';
  document.getElementById('flags-countdown-widget').style.display = 'block';
  flagsRightPanel.style.display   = 'flex';
  mainRightPanel.style.display    = 'none';
  flagsMachine.style.display      = 'block';
  flagsMachine2.style.display     = 'block';
  flagsMachine3.style.display     = 'block';
  flagsMachine3b.style.display    = 'block';
  flagsFindLuggage.style.display  = 'none';
  flagsLuggageWrap.style.display  = 'none';
  flagsFlagidWrap.style.display   = 'none';

  { const _pc = window.practiceConfig; const _inf = _pc && _pc.active && _pc.timer === 0; flagsTimerEl.textContent = _pc && _pc.active ? (_inf ? '∞' : _pc.timer) : FLAGS_GAME_DURATION; flagsTimerEl.classList.toggle('timer-number-infinity', !!_inf); }
  flagsTimerEl.style.color = '';
  flagsTimerImg.src = 'images/countdown2.png';
  flagsTimerImg.style.animationPlayState = 'paused';

  if (typeof loadBadges !== 'undefined') loadBadges();

  // Reset the score BEFORE the countdown so the widget doesn't show the
  // previous game's score during the count.
  flagsScore          = 0;
  flagsDisplayedScore = 0;
  flagsScoreEl.textContent = (((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
  flagsLastLbScore = -1;

  // Refresh friends before building the bar: without reloading here, the list
  // keeps the cardCode/avatar from the last login (or the last time the social
  // panel was opened) — a friend who changed their card only in their previous
  // session still showed the old one here.
  if (typeof loadFriends === 'function') loadFriends();
  initFlagsLeaderboard();

  if (typeof window._specReportPregame === 'function') {
    // startedAt: so a spectator joining mid 3-2-1 can compute how much passed
    // and start at the right number.
    // mode:'flags' — it "got away with" not having this field before because
    // _mode in spectate.js starts at 'flags' by default (always the first
    // campaign mode), but that was luck of ordering, not a real guarantee —
    // see the same field added in js/modes/mapgame-play.js (Cities), where it
    // was genuinely needed.
    // campaignBaseAtStart: the real player shows this number from the start of
    // the 3-2-1 (before any answer) — the spectator has no way of its own to
    // know it, so it travels here to start the scoreboard at the right value
    // instead of 0.
    window._specReportPregame({
      mode: 'flags',
      duration: flagsTimerEl.textContent,
      infinite: flagsTimerEl.classList.contains('timer-number-infinity'),
      startedAt: Date.now(),
      campaignBaseAtStart: (typeof window.campaignBase === 'function') ? window.campaignBase() : 0,
    });
  }
  runFlagsPregame(() => {
    flagsFindLuggage.style.display  = 'block';
    flagsFindLuggage.classList.remove('scrolling');
    void flagsFindLuggage.offsetWidth;
    flagsFindLuggage.classList.add('scrolling');
    flagsLuggageWrap.style.display  = 'block';
    flagsLuggageWrap.style.pointerEvents = '';
    flagsLuggageWrap.classList.remove('flags-game-ended');
    flagsFlagidWrap.style.display   = 'block';
    flagsFlagidLabel.textContent = '';
    flagsTimerImg.style.animationPlayState = 'running';
    if (typeof playMusic !== 'undefined') playMusic(sfxGameMusic);
    if (window._practiceStats) window._practiceStats.startTime = Date.now();
    flagsMachine3.classList.add('scrolling');
    flagsMachine3b.classList.add('scrolling');
    flagsStreak = 0;
    flagsDots = 0;
    flagsUpdateDotsUI();
    flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
    flagsEasyUnlocked = false;
    flagsSixUnlocked = false;
    flagsMediumUnlocked = false;
    flagsHardUnlocked   = false;
    flagsInsaneUnlocked = false;
    flagsCorrectCount = 0;
    flagsIsFirstRound = true;
    flagsAnswered = new Set();
    flagsLastChosen = null;
    if (_flagsSyncedVersus()) flagsVsIndex = 0;
    if (window.practiceConfig && window.practiceConfig.active) {
      // Reset unlocks so the first round always starts at inicio
      flagsEasyUnlocked = false; flagsMediumUnlocked = false;
      flagsHardUnlocked = false; flagsInsaneUnlocked = false;
      flagsCorrectCount = 0;
      flagsPracticePool = buildFlagsPracticePool(window.practiceConfig.continents, window.practiceConfig.difficulty);
      flagsPracticeRemaining = [...flagsPracticePool];
      flagsPracticeCurrent = flagsPracticePickNext(null);
    }
    flagsGroupIds = flagsTopGroupIds.slice();
    flagsLuggageWrap.classList.remove('flags-six-mode');
    // Reset all group inline styles that may be stuck from a previous game's
    // mid-round cleanup being skipped by the !flagsRunning guard.
    clearFlagsElimination();
    ;[...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
      const g = document.getElementById(id);
      if (!g) return;
      g.style.animation  = '';
      g.style.transition = '';
      g.style.transform  = '';
      g.style.transformOrigin = '';
      g.style.opacity    = '';
      g.style.willChange = '';
      g.classList.remove('flags-faded');
    });
    flagsBottomGroupIds.forEach(id => {
      const g = document.getElementById(id);
      if (g) g.style.display = 'none';
    });
    ['flags-check-overlay','flags-wrong-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('animate'); el.style.display = ''; el.style.opacity = ''; }
    });
    startFlagsRound();
    startFlagsTimer();
  });
}

// ── SPECTATOR MODE: the SAME screen the player sees ─────────────────────────
// Instead of a separate mini-panel, we show the real #flags-wrapper (machine,
// suitcases, flags) and drive it by hand with the data arriving by broadcast —
// it never runs flagsRunning/flagsScore/the real timer, so it can't overwrite
// a real game's state if this same tab plays afterward.
let _flagsSpecMode = false;
// Same mechanism as shapes.js: the first round after entering waits a short
// margin to confirm a pregame is really coming (arrives shortly after, same
// real broadcast order) — only used to decide WHEN to start sfxGameMusic (if
// there's a pregame, its own onDone starts it when the 3-2-1 ends; if not, a
// mid-round join is confirmed and it starts here).
let _flagsSpecIsFirstRound = true;
let _flagsSpecPregameSeen  = false;
// Gate against the "local 3-2-1 ends before the real 'round' arrives over the
// network" race (and vice versa): revealing suitcases/findluggage/flagid (see
// _flagsSpecRevealAfterPregame) can only happen once both things happened — the
// local countdown ended AND we have real round data. _flagsSpecShowRound()
// keeps populating the DOM (hidden) as soon as the broadcast arrives regardless
// of order; the reveal is triggered by whichever of the two conditions arrives
// SECOND. Both start true (mid-round join, no pregame, already revealed by
// flagsSpectatorEnter) — flagsSpectatorShowPregame resets them to false when
// the 3-2-1 starts.
let _flagsSpecCountdownDone = true;
let _flagsSpecRevealed      = true;
// true once flagsSpectatorShowRound() populated the DOM (hidden or not) with
// the current 'round' data — reset to false at the start of each 3-2-1.
let _flagsSpecShowRoundApplied = true;
let _flagsSpecEliminationTimeouts = [];
function _flagsSpecClearElimination() {
  _flagsSpecEliminationTimeouts.forEach(clearTimeout);
  _flagsSpecEliminationTimeouts = [];
}

// Scoreboard count-up animation — same mechanism as flagsAnimateScore()
// (above, real player): interpolates _flagsSpecDisplayedScore toward
// _flagsSpecTargetScore instead of jumping. _flagsSpecTargetScore ALREADY has
// campaignBase() added by the broadcaster (see _specReportAnswer/
// _specReportPregame in the real player) — no need to add it again here.
let _flagsSpecTargetScore    = 0;
let _flagsSpecDisplayedScore = 0;
let _flagsSpecScoreRafId     = null;
function _flagsSpecAnimateScore() {
  if (_flagsSpecScoreRafId) return;
  let last = null;
  function tick(ts) {
    if (!_flagsSpecMode) { _flagsSpecScoreRafId = null; return; }
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    const diff = _flagsSpecTargetScore - _flagsSpecDisplayedScore;
    if (diff <= 0) { _flagsSpecScoreRafId = null; flagsScoreEl.textContent = _flagsSpecTargetScore.toLocaleString(); return; }
    _flagsSpecDisplayedScore = Math.min(_flagsSpecTargetScore, _flagsSpecDisplayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    flagsScoreEl.textContent = _flagsSpecDisplayedScore.toLocaleString();
    _flagsSpecScoreRafId = requestAnimationFrame(tick);
  }
  _flagsSpecScoreRafId = requestAnimationFrame(tick);
}

window.flagsSpectatorEnter = function () {
  _flagsSpecMode = true;
  window._isSpectating = true;
  _flagsSpecIsFirstRound = true;
  _flagsSpecPregameSeen  = false;
  _flagsSpecCountdownDone = true;
  _flagsSpecRevealed = true;
  _flagsSpecShowRoundApplied = true;
  // getModeCheckImg()/getModeWrongImg() (used on the results screen) pick the
  // image by window.pendingGameMode — without this it kept what THIS tab last
  // played (or undefined), and the spectator postgame showed check3/wrong3
  // (the default) instead of flags' check1/wrong1.
  window.pendingGameMode = 'flags';
  // #loading-screen has z-index 200 (opaque background) and #flags-wrapper has
  // z-index 15 — if the loading-screen isn't hidden (with whatever
  // friends/menu panel is open at that moment) it covers the whole game.
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';
  // sfxError/sfxAcertar/etc. are lazily initialized here (they're `let`
  // unassigned until the first real game) — without this they were undefined
  // and the typeof check in flagsSpectatorResolvePick silently blocked ALL
  // sound, even the check that always exists.
  if (typeof loadGameSFX === 'function') loadGameSFX();
  // imgBadgeGold/etc. are Image() with no .src until here (lazy load) —
  // without this getBadgeImg(streak) returns a blank image and drawImage draws
  // nothing, without throwing.
  if (typeof loadBadges === 'function') loadBadges();
  if (typeof prewarmFlagTextures === 'function') prewarmFlagTextures(16);
  flagsWrapper.style.display     = 'block';
  flagsMachine.style.display     = 'block';
  flagsMachine2.style.display    = 'block';
  flagsMachine3.style.display    = 'block';
  flagsMachine3b.style.display   = 'block';
  flagsLuggageWrap.style.display = 'block';
  flagsLuggageWrap.classList.remove('flags-game-ended', 'flags-six-mode');
  // The spectator is read-only: reuses the same class the real game uses on
  // game end to turn off suitcase hover/cursor (there's no click to make, it
  // must not look clickable).
  flagsLuggageWrap.classList.add('flags-game-ended');
  // mainRightPanel is the Cities/Monuments panel, not flags' — always hidden
  // here. flagsRightPanel IS shown, but with a single hand-built card
  // (flagsSpectatorSetPlayerCard) with the REAL player's data — the normal
  // leaderboard (initFlagsLeaderboard) always adds a "you" card with your own
  // profile, which would be wrong here.
  mainRightPanel.style.display  = 'none';
  flagsRightPanel.style.display = 'flex';
  const specLb = document.getElementById('flags-leaderboard');
  if (specLb) specLb.innerHTML = '';
  flagsScoreDisplay.style.display = 'block';
  // Placeholder until the first real data arrives (pregame with
  // campaignBaseAtStart, or an answer if it's a mid-round join) —
  // flagsSpectatorShowPregame/flagsSpectatorResolvePick correct it.
  _flagsSpecTargetScore = 0;
  _flagsSpecDisplayedScore = 0;
  flagsScoreEl.textContent = '0';
  // Shapes leftovers if this tab played/spectated that earlier in this same
  // session without going through shapesSpectatorExit — same case as flags'
  // findluggage leaking into shapes, now in reverse.
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
  document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
  document.getElementById('shapes-countdown-widget')?.remove();
  // In case this tab already played a real game: hideIngameHud() leaves this
  // sign stuck at display:none (see the speed-bonus bug where it didn't
  // appear after the first game).
  flagsSpeedBonusText.style.display = '';
  const cw = document.getElementById('flags-countdown-widget');
  if (cw) cw.style.display = 'block';
  flagsTimerEl.textContent = '';
  flagsTimerEl.style.color = '';
  flagsTimerImg.src = 'images/countdown2.png';
  flagsTimerImg.style.animationPlayState = 'running';
  // findluggage-scroll is a 'forwards' animation (not infinite) — if the tab
  // already ran a real game, it may have been left at display:none or with the
  // 'scrolling' class already applied (which then does NOT restart on its
  // own). Clean reset with a forced reflow, like showFlagsMode() does for the
  // real player. NOTE: they are NOT shown here — only with REAL round data (in
  // flagsSpectatorShowRound/ShowPregame). This used to show them right away,
  // with whatever src was left in the <img>s from an earlier session of THIS
  // SAME tab (or just empty) — a moment of suitcases with old/empty flags
  // before the rival's real round arrived over the network and only then
  // replaced them (the reported "empty flagid and suitcases with random flags,
  // the middle one empty").
  flagsFindLuggage.style.display = 'none';
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  flagsFlagidWrap.style.display = 'none';
  flagsFlagidLabel.textContent  = '';
  flagsGroupIds = flagsTopGroupIds.slice();
  [...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
    const g = document.getElementById(id);
    if (!g) return;
    g.style.pointerEvents = 'none'; // just watches, no clicking
    g.classList.remove('flags-faded');
    g.style.opacity = '';
    g.style.transform  = '';
    g.style.transition = '';
    g.style.willChange = '';
    // Clear any old flag from a previous session of this tab — without this,
    // even if the WRAPPER was hidden, the inner <img> kept the src of the last
    // flag this tab ever showed.
    const imgId = flagsSlotImgIds[id];
    const img = imgId && document.getElementById(imgId);
    if (img) { img.src = ''; img.style.display = 'none'; }
  });
  flagsBottomGroupIds.forEach(id => { const g = document.getElementById(id); if (g) g.style.display = 'none'; });
  // Points train: start clean (if the tab played a real game before, it could
  // be left with filled dots or mid train-animation).
  const dotsContainer = document.getElementById('flags-progress-dots');
  if (dotsContainer) {
    dotsContainer.classList.remove('train-animation', 'dots-fade-out');
    dotsContainer.querySelectorAll('.dot').forEach(d => d.classList.remove('filled'));
  }
  // NOTE: sfxGameMusic is NOT started here — Enter() runs while the spectator
  // loading screen is still showing, before knowing whether what follows is a
  // pregame (which must be silent until GO) or a round already in progress. It
  // starts only in flagsSpectatorShowRound, at the exact point where no
  // pregame is confirmed (mid-round join) — "you enter where you should", not
  // before.
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// switchingMode=true: the spectated player's campaign chained to ANOTHER mode
// (flags → shapes/etc.) — only the flags DOM needs tearing down, without
// touching _isSpectating or showing the loading-screen (we're still
// spectating, another mode is about to mount over it at the same instant).
// Without this, switching modes closed the whole spectator session midway.
window.flagsSpectatorExit = function (switchingMode) {
  _flagsSpecMode = false;
  if (!switchingMode) window._isSpectating = false;
  // Extra leaderboard rows (friend/rival, see flagsSpectatorSetPlayerCard)
  // were left orphaned in #flags-leaderboard if nobody removed them on close —
  // the rival's one didn't even show visually (normal mode doesn't touch it),
  // but with "player finished first and enters on loan to spectate the rival"
  // (see vs.js _enterWaitAsSpectator) the SAME player plays another game after,
  // and found these old rows still there.
  document.getElementById('flags-spec-lb-entry')?.remove();
  document.getElementById('flags-spec-lb-opp')?.remove();
  // Like flagsHardReset() (the REAL quit): without this, the 3-2-1's
  // showStep() kept running in the background (never aborted), and eventually
  // reached its onDone() — which starts sfxGameMusic — OVERWRITING the menu
  // music closeSpectator() had just set. The countdown beep (sfxCountdown)
  // also kept playing because nothing paused it.
  flagsAborted = true;
  clearTimeout(flagsPregameTimeout); flagsPregameTimeout = null;
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  _flagsSpecClearElimination();
  _flagsSpecPendingElimination = null;
  _flagsSpecLastTick = null;
  _flagsSpecLastTickSoundAt = 0;
  clearTimeout(_flagsSpecTimesUpTimeout1);
  clearTimeout(_flagsSpecTimesUpTimeout2);
  window.flagsSpectatorHidePostgame();
  if (flagsPregameEl) flagsPregameEl.style.display = 'none';
  flagsTimeupEl.style.display = 'none';
  flagsTimeupEl.classList.remove('timeup-in', 'timeup-out');
  // window._vsShowingResult (see _exitWaitAsSpectator in vs.js): this exit
  // isn't an EXTERNAL spectator closing their session to return to the menu —
  // it's THE PLAYER themselves who was watching their rival on loan, about to
  // see THEIR OWN duel result. flagsHardReset() already respects this same
  // flag to not delete the background assets when the rival abandons
  // (_onOpponentAbandoned) — without the same respect here, the normal path
  // (both finish their timer) DID delete them, leaving the result overlay over
  // an empty background instead of the frozen game behind (the reported
  // "background assets get removed if I lose").
  if (!window._vsShowingResult) {
    flagsWrapper.style.display     = 'none';
    flagsMachine.style.display     = 'none';
    flagsMachine2.style.display    = 'none';
    flagsMachine3.style.display    = 'none';
    flagsMachine3b.style.display   = 'none';
    flagsLuggageWrap.style.display = 'none';
    flagsFlagidWrap.style.display  = 'none';
  }
  flagsScoreDisplay.style.display = 'none';
  flagsRightPanel.style.display   = 'none';
  const specLb = document.getElementById('flags-leaderboard');
  if (specLb) specLb.innerHTML = '';
  const cw = document.getElementById('flags-countdown-widget');
  if (cw) cw.style.display = 'none';
  if (!switchingMode && !window._vsShowingResult) {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'flex';
  }
  // Reset ALL animation state left by the spectated game — unlike a real game
  // ending (flagsHardReset), we never go through that reset here because it's
  // not "my" game, so if it isn't explicitly cleared here it stays stuck
  // (train with filled dots, machine2 paused/desynced, countdown with the black
  // blink jammed) when the next real game starts.
  [flagsMachine, flagsMachine2, flagsMachine3, flagsMachine3b].forEach(m => {
    if (!m) return;
    m.style.animationPlayState = '';
    m.classList.remove('scrolling');
  });
  // findluggage/machine are LOOSE elements (siblings of #flags-wrapper, not
  // children — hiding flagsWrapper doesn't cover them) — without this
  // display:none they stayed visible over the menu after exiting the
  // spectator. As above, if window._vsShowingResult it shouldn't be hidden: it
  // must stay frozen in the background behind the result overlay.
  if (!window._vsShowingResult) flagsFindLuggage.style.display = 'none';
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  // Loose suitcases with residual transform/transition from a pick of THIS
  // session (see flagsSpectatorResolvePick, which moves the chosen suitcase
  // toward findluggage with inline translate3d) — flagsSpectatorEnter() already
  // cleans this on re-entry, but it's also cleaned HERE, on exit, so as not to
  // depend on that order: if in the future something enters a real UI without
  // going through flagsSpectatorEnter (e.g. the POV switch between the two
  // friends of the same versus, which reopens openSpectator with a different
  // friend on the SAME game), the suitcase must not keep animating toward a
  // position from the PREVIOUS SESSION (the reported "findluggage position not
  // coordinated").
  [...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
    const g = document.getElementById(id);
    if (!g) return;
    g.style.transform    = '';
    g.style.transition   = '';
    g.style.animation    = '';
    g.style.willChange   = '';
    g.classList.remove('luggage-enter-active', 'flags-faded');
  });
  const specConfirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (specConfirmWrap) specConfirmWrap.style.display = '';
  if (flagsProgressDots) flagsProgressDots.forEach(d => d.classList.remove('filled'));
  if (flagsProgressContainer) flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
  flagsDots = 0;
  _flagsSpecDots = 0;
  if (flagsTimerImg) {
    flagsTimerImg.src = 'images/countdown2.png';
    flagsTimerImg.style.animationPlayState = 'running';
  }
  flagsTimerEl.textContent = '';
  flagsTimerEl.style.color = '';
  flagsTimerEl.classList.remove('timer-number-infinity');
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// Single card in the right panel with the spectated REAL player (name, avatar,
// score) — replaces the normal leaderboard, which would add your own card as
// if you were playing.
// oppName/oppAvatar/oppScore: in versus, the spectated friend's rival — see
// long comment in citiesSpectatorSetPlayerCard (same reason/pattern).
window.flagsSpectatorSetPlayerCard = function (name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode) {
  if (!_flagsSpecMode) return;
  const lb = document.getElementById('flags-leaderboard');
  if (!lb) return;
  // #flags-leaderboard has no normal-flow content (its rows are
  // position:absolute), so without an explicit height it measures 0 — and
  // since #flags-right-panel is anchored by `bottom`, with height:0 its origin
  // sits at the very bottom, pushing any row at top:0 off screen. The real
  // leaderboard always sets this height (flagsPositionLeaderboard) — here one
  // row is enough.
  const rowH = getFlagsLbRowHeight();
  const showOpp = !!oppName;
  // TOP_MARGIN: see long comment in citiesSpectatorSetPlayerCard —
  // #flags-leaderboard has the same clip-path:inset(0 -300px) that clips the
  // wrongEffect emote-bubble if the top row is at top:0.
  const TOP_MARGIN = Math.round(rowH * 0.4);
  lb.style.height = (showOpp ? rowH * 2 + FLAGS_LB_GAP + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';
  let el = document.getElementById('flags-spec-lb-entry');
  if (!el) {
    el = document.createElement('div');
    el.className = 'lb-entry lb-player';
    el.id = 'flags-spec-lb-entry';
    el.style.top = TOP_MARGIN + 'px';
    el.innerHTML = `<span class="lb-rank rank-other"></span>`
      + `<div class="lb-avatar"><img class="lb-avatar-img" id="flags-spec-lb-avatar" src="images/profilepic/ppdefault.png"></div>`
      + `<span class="lb-name" id="flags-spec-lb-name"></span>`
      + `<span class="lb-score" id="flags-spec-lb-score">0</span>`;
    lb.appendChild(el);
  }
  document.getElementById('flags-spec-lb-name').textContent = name || 'Jugador';
  const avatarEl = document.getElementById('flags-spec-lb-avatar');
  if (avatarEl && avatar) avatarEl.src = avatar;
  document.getElementById('flags-spec-lb-score').textContent = (score || 0).toLocaleString();
  window.CustomizeAssets?.applyCard(el, cardCode || '0001');

  let oppEl = document.getElementById('flags-spec-lb-opp');
  if (showOpp) {
    if (!oppEl) {
      oppEl = document.createElement('div');
      oppEl.className = 'lb-entry lb-vsopp';
      oppEl.id = 'flags-spec-lb-opp';
      oppEl.style.top = (TOP_MARGIN + rowH + FLAGS_LB_GAP) + 'px';
      oppEl.innerHTML = `<span class="lb-rank rank-other"></span>`
        + `<div class="lb-avatar"><img class="lb-avatar-img" id="flags-spec-lb-opp-avatar" src="images/profilepic/ppdefault.png"></div>`
        + `<span class="lb-name" id="flags-spec-lb-opp-name"></span>`
        + `<span class="lb-score" id="flags-spec-lb-opp-score">0</span>`;
      lb.appendChild(oppEl);
    }
    window.CustomizeAssets?.applyCard(oppEl, oppCardCode || '0001');
    document.getElementById('flags-spec-lb-opp-name').textContent = oppName || 'Rival';
    const oppAvatarEl = document.getElementById('flags-spec-lb-opp-avatar');
    if (oppAvatarEl && oppAvatar) oppAvatarEl.src = oppAvatar;
    document.getElementById('flags-spec-lb-opp-score').textContent = (oppScore || 0).toLocaleString();
    // Reorder by rank — see long comment in citiesSpectatorSetPlayerCard.
    const friendOnTop = (score || 0) >= (oppScore || 0);
    el.style.top    = (TOP_MARGIN + (friendOnTop ? 0 : rowH + FLAGS_LB_GAP)) + 'px';
    oppEl.style.top = (TOP_MARGIN + (friendOnTop ? rowH + FLAGS_LB_GAP : 0)) + 'px';
    // Rank number (1st/2nd) — same mechanism as the real leaderboard
    // (positionLeaderboard: rankEl.textContent + className rank-1/rank-2).
    // Was missing entirely here: the <span class="lb-rank"> stayed empty with
    // the generic "rank-other" class set on creation, regardless of who was
    // winning. And EVEN if the text were set, .lb-rank is display:none by
    // default in CSS — only shown by the rule
    // "#flags-leaderboard.vs-active .lb-rank", a class initLeaderboard() adds
    // (blocked while spectating, see window._isSpectating there) — so in
    // spectator that class was NEVER activated and the number stayed invisible
    // even with the text/class set right. Forced here with inline display,
    // not depending on that class.
    const elRankEl  = el.querySelector('.lb-rank');
    const oppRankEl = oppEl.querySelector('.lb-rank');
    if (elRankEl)  { elRankEl.textContent  = friendOnTop ? '1' : '2'; elRankEl.className  = 'lb-rank ' + (friendOnTop ? 'rank-1' : 'rank-2'); elRankEl.style.display  = 'block'; }
    if (oppRankEl) { oppRankEl.textContent = friendOnTop ? '2' : '1'; oppRankEl.className = 'lb-rank ' + (friendOnTop ? 'rank-2' : 'rank-1'); oppRankEl.style.display = 'block'; }
  } else if (oppEl) {
    oppEl.remove();
  } else {
    el.style.top = TOP_MARGIN + 'px';
  }
};

window.flagsSpectatorWrongEffect = function (target) {
  if (!_flagsSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'flags-spec-lb-opp' : 'flags-spec-lb-entry');
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

// "Time's up" on the 1v1 spectator card (friend/rival) — same mechanism as
// flagsSpectatorWrongEffect but with the stopwatch.
window.flagsSpectatorTimesUpEffect = function (target) {
  if (!_flagsSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'flags-spec-lb-opp' : 'flags-spec-lb-entry');
  if (!el) return;
  const prevZ = el.style.zIndex;
  el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
};

// dots = the real player's flagsDots after adding this round — the points
// "train" and the +5s bonus are derived locally from the same threshold
// (FLAGS_DOTS_NEEDED) flagsAdvanceDot() uses, with no extra data needed.
let _flagsSpecDots = 0;
window.flagsSpectatorAdvanceDot = function (dots) {
  if (!_flagsSpecMode) return;
  // Last known value — the reset below re-reads it LIVE here (not the "dots"
  // captured by closure when the setTimeout was set). Without this, if a new
  // dot arrived WHILE the full train animation was running (2.5s), the reset
  // overwrote it with the old value and that dot was lost visually — the real
  // flagsAdvanceDot() re-reads flagsDots live for the same reason.
  _flagsSpecDots = dots;
  const container = document.getElementById('flags-progress-dots');
  if (!container) return;
  container.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < dots));
  if (dots >= FLAGS_DOTS_NEEDED && !container.classList.contains('train-animation')) {
    container.classList.add('train-animation');
    if (typeof playTimeBonus === 'function') playTimeBonus(document.getElementById('flags-time-bonus'), FLAGS_BONUS_TIME);
    // Same green flash the real flagsAdvanceDot() does on the timer number
    // when earning the +time bonus — was missing here entirely, the
    // train/"+5s" popup showed but the number never changed color, unlike what
    // the real player sees.
    const origColor = flagsTimerEl.style.color;
    flagsTimerEl.style.color = '#00ff88';
    setTimeout(() => {
      if (!_flagsSpecMode) return;
      container.classList.add('dots-fade-out');
      setTimeout(() => {
        if (!_flagsSpecMode) return;
        container.classList.remove('train-animation', 'dots-fade-out');
        const finalDots = Math.max(0, _flagsSpecDots - FLAGS_DOTS_NEEDED);
        container.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < finalDots));
        // _flagsSpecLastTick: last known real timeLeft (see
        // flagsSpectatorUpdateTimer) — decides whether it goes back to white
        // (last 10s) or the original color, like the real player.
        if (_flagsSpecLastTick != null && _flagsSpecLastTick > 0 && _flagsSpecLastTick <= 10) {
          flagsTimerEl.style.color = '#ffffff';
        } else {
          flagsTimerEl.style.color = origColor;
        }
      }, 500);
    }, 2000);
  }
};

// Time's up for this game round — the same "TIME'S UP" sign the real player
// sees (reuses #flags-timeup-overlay), with its sound and cutting the music.
// Unlike the real player's endFlagsGame(), it does NOT call hideFlagsMode() —
// the spectator waits for the next round (if still in flags) or the real end
// of the game/session (onEnd).
let _flagsSpecTimesUpTimeout1 = null, _flagsSpecTimesUpTimeout2 = null;
window.flagsSpectatorShowTimesUp = function () {
  if (!_flagsSpecMode) return;
  clearTimeout(_flagsSpecTimesUpTimeout1);
  clearTimeout(_flagsSpecTimesUpTimeout2);
  if (typeof playMusic === 'function') playMusic(null);
  if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
  // Same step as the real player's endFlagsGame(): stop the countdown's
  // red/black blink — without this it keeps blinking behind the overlay.
  if (flagsTimerImg) flagsTimerImg.style.animationPlayState = 'paused';
  flagsTimeupEl.classList.remove('timeup-out');
  flagsTimeupEl.classList.add('timeup-in');
  flagsTimeupEl.style.display = 'flex';
  _flagsSpecTimesUpTimeout1 = setTimeout(() => {
    if (!_flagsSpecMode) return;
    flagsTimeupEl.classList.remove('timeup-in');
    flagsTimeupEl.classList.add('timeup-out');
    _flagsSpecTimesUpTimeout2 = setTimeout(() => {
      if (!_flagsSpecMode) return;
      flagsTimeupEl.style.display = 'none';
      flagsTimeupEl.classList.remove('timeup-out');
    }, 400);
  }, 1800);
};

// 3-2-1 count before the round: reuses 100% of the real animation
// (runFlagsPregame already lives in this file, with nothing that depends on
// "my" game) — the spectator sees exactly the same count as the player, with
// the same sound. Empty onDone: the first 'round' that arrives after handles
// showing the real round.
window.flagsSpectatorShowPregame = function (payload) {
  if (!_flagsSpecMode) return;
  // Synchronous, as soon as the broadcast arrives — used by
  // flagsSpectatorShowRound's "fallback" timer to decide whether a 3-2-1 is
  // really running or nobody will send a pregame (mid-round join).
  _flagsSpecPregameSeen = true;
  _flagsSpecCountdownDone = false;
  _flagsSpecRevealed = false;
  _flagsSpecShowRoundApplied = false;
  window.flagsSpectatorHidePostgame();
  // Like the real player's showFlagsMode() right before runFlagsPregame:
  // suitcases/findluggage/flagid hidden until the count ends — they used to
  // stay visible (empty) from the previous round through the whole 3-2-1.
  flagsFindLuggage.style.display = 'none';
  flagsLuggageWrap.style.display = 'none';
  flagsFlagidWrap.style.display  = 'none';
  const cw = document.getElementById('flags-countdown-widget');
  if (cw) cw.style.display = 'block';
  flagsTimerEl.classList.toggle('timer-number-infinity', !!(payload && payload.infinite));
  flagsTimerEl.textContent = (payload && payload.infinite) ? '∞' : (payload && payload.duration) || '';
  flagsTimerEl.style.color = '';
  flagsTimerImg.src = 'images/countdown2.png';
  flagsTimerImg.style.animationPlayState = 'paused';
  // Like real showFlagsMode() (line just before runFlagsPregame): no music
  // during the 3-2-1, only the countdown beep.
  if (typeof playMusic === 'function') playMusic(null);
  // The real player already shows their accumulated campaign score from the
  // start of the 3-2-1 (doesn't start at 0 unless it's the first mode) — here
  // without animation, the base state before the first answer.
  if (payload && typeof payload.campaignBaseAtStart === 'number') {
    _flagsSpecTargetScore = payload.campaignBaseAtStart;
    _flagsSpecDisplayedScore = payload.campaignBaseAtStart;
    flagsScoreEl.textContent = payload.campaignBaseAtStart.toLocaleString();
  }
  // flagsSpectatorEnter() starts this scroll immediately (for the case of
  // joining mid-round already in progress, with no pregame) — during the real
  // 3-2-1 the ID machine does NOT move yet, only in onDone. Without this
  // brake, the machine was seen moving from the start.
  flagsMachine3.classList.remove('scrolling');
  flagsMachine3b.classList.remove('scrolling');
  // If the spectator joined mid 3-2-1 (e.g. the real player is already on
  // "1"), payload.startedAt lets us compute how much passed and start right
  // there (number AND audio), instead of always showing "3".
  let elapsedMs = (payload && typeof payload.startedAt === 'number') ? (Date.now() - payload.startedAt) : 0;
  // Safeguard against clock skew between the real player's machine and this
  // client's (Date.now() isn't guaranteed synced between two different
  // computers) or against a late resend pushing the calc past the total 3-2-1
  // duration — without this clamp, an inflated elapsedMs made runFlagsPregame
  // jump STRAIGHT to onDone showing none of the count (same fix applied in
  // shapes.js).
  const _pregameTotalMs = FLAGS_PREGAME_STEPS.reduce((s, x) => s + x.hold, 0);
  if (elapsedMs > _pregameTotalMs - 400) elapsedMs = Math.max(0, _pregameTotalMs - 400);
  runFlagsPregame(() => {
    _flagsSpecCountdownDone = true;
    // _flagsSpecShowRoundApplied (seteado dentro de flagsSpectatorShowRound)
    // says whether the real 'round' already arrived and populated the DOM
    // (hidden) while this 3-2-1 was running — normal case, with plenty of
    // margin. If it hasn't arrived yet (latency/resend right at the edge),
    // NOTHING is revealed here: doing so would show empty suitcases or the OLD
    // round's flags. flagsSpectatorShowRound() reveals as soon as the real
    // data arrives (same _flagsSpecCountdownDone+_flagsSpecRevealed check at
    // the end of that function).
    if (!_flagsSpecRevealed && _flagsSpecShowRoundApplied) {
      _flagsSpecRevealAfterPregame();
      _flagsSpecRevealed = true;
    }
  }, elapsedMs);
};

// Progressive-elimination data pending scheduling — stored here instead of
// building the setTimeout directly in flagsSpectatorShowRound(), which can run
// while the local 3-2-1 is STILL on screen (data arrived but the round is
// still hidden behind the count). Scheduling it there would leave the fade
// running "in the background" before the spectator saw anything, desynced from
// the real player — it's built only in _flagsSpecRevealAfterPregame(),
// relative to the moment the round ACTUALLY becomes visible, not to when the
// broadcast arrived.
let _flagsSpecPendingElimination = null; // { slotCount, order }

// Shared reveal: shows suitcases/findluggage/flagid, starts music and
// schedules progressive elimination — triggered by flagsSpectatorShowRound()
// the first time there's real data to show after a 3-2-1 (see the
// _flagsSpecCountdownDone gate).
function _flagsSpecRevealAfterPregame() {
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  // How much REAL time already passed since the round really started
  // (mid-round join: _enterWaitAsSpectator, a reconnection, or openSpectator's
  // initial snapshot with host_state/guest_state already in progress) —
  // without this, findluggage ALWAYS started its travel from frame 0 (the
  // start) regardless of how far the real player's had traveled, even though
  // the progressive elimination below DOES account for this same
  // roundStartedAt — they were desynced from each other (the reported
  // "findluggage isn't in the right place, always appears at the start").
  // A NEGATIVE animation-delay skips the animation straight to that point
  // instead of restarting it from the beginning (same trick
  // flagsSpectatorShowPregame already uses with the 3-2-1, see elapsedMs there).
  const _roundStartedAt = _flagsSpecPendingElimination && _flagsSpecPendingElimination.roundStartedAt;
  const _elapsedMs = _roundStartedAt ? Math.min(FLAGS_ROUND_TIME * 1000, Math.max(0, Date.now() - _roundStartedAt)) : 0;
  const _seekDelay = _elapsedMs ? `-${_elapsedMs}ms` : '';
  flagsFindLuggage.style.display = 'block';
  flagsFindLuggage.classList.remove('scrolling');
  flagsFindLuggage.style.animationDelay = _seekDelay;
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.classList.add('scrolling');
  flagsLuggageWrap.style.display = 'block';
  flagsFlagidWrap.style.display  = 'block';
  flagsMachine3.classList.add('scrolling');
  flagsMachine3b.classList.add('scrolling');
  flagsTimerImg.style.animationPlayState = 'running';
  if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
  _flagsSpecIsFirstRound = false;
  if (_flagsSpecPendingElimination) {
    const { slotCount, order, roundStartedAt } = _flagsSpecPendingElimination;
    _flagsSpecPendingElimination = null;
    const fadeSlot = (slotIdx) => {
      const g = document.getElementById(flagsGroupIds[slotIdx]);
      if (g) g.classList.add('flags-faded');
    };
    const roundMs = FLAGS_ROUND_TIME * 1000;
    // How much REAL time already passed since the round really started (see
    // roundStartedAt in _specReportRound, flags.js) — if the spectator joined
    // mid-round (e.g. _enterWaitAsSpectator, or a reconnection), this can be
    // several seconds, not zero. Every elimination threshold that ALREADY
    // passed is applied IMMEDIATELY (no setTimeout); the remaining ones are
    // scheduled with the real time left, not the full time. This used to
    // always schedule from 0, showing all 6 options intact even though the
    // real player already had only 2 (the reported "when I see 6, my rival
    // actually has 2").
    const elapsed = Math.max(0, Date.now() - roundStartedAt);
    const scheduleFade = (thresholdMs, slots) => {
      if (elapsed >= thresholdMs) { slots.forEach(fadeSlot); return; }
      _flagsSpecEliminationTimeouts.push(setTimeout(() => slots.forEach(fadeSlot), thresholdMs - elapsed));
    };
    if (slotCount >= 6 && order.length) {
      [1, 2].forEach(step => scheduleFade(roundMs * step / 3, order.slice((step - 1) * 2, step * 2)));
    } else if (slotCount === 3 && order.length) {
      scheduleFade(roundMs / 2, [order[0]]);
    }
  }
}

// Results screen (solo/campaign path of hideFlagsMode() only — versus has its
// own W/L screen, not covered here yet). Read-only: pointer-events:none +
// confirm1/confirm2 hidden, because the spectator can't advance the spectated
// player's REAL campaign with that button.
window.flagsSpectatorShowPostgame = function (payload) {
  if (!_flagsSpecMode) return;
  const gameoverScreen = document.getElementById('gameover-screen');
  if (!gameoverScreen) return;
  // Like real hideFlagsMode(): the countdown makes no sense here.
  const cw = document.getElementById('flags-countdown-widget');
  if (cw) cw.style.display = 'none';
  // Like real hideFlagsMode(): the scoreboard makes no sense either — without
  // this it stayed stuck, visible in the background of the results screen.
  flagsScoreDisplay.style.display = 'none';
  gameoverScreen.classList.add('mode-flags');
  gameoverScreen.classList.remove('mode-shapes', 'mode-monuments');
  gameoverScreen.style.pointerEvents = 'none';
  // Same sprite swap the real player's #loading-flags-btn click does — these
  // characters are SHARED elements between modes (shapes/cities/monuments give
  // them other images), so without this swap here you see whatever the last
  // mode that touched them set, not flags'.
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men3.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men4.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl3.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl4.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women2.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women3.png');
  document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level1complete.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check1.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong1.png');
  if (typeof window.hideGameoverConfirm === 'function') window.hideGameoverConfirm();
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = 'none';
  gameoverScreen.style.display = 'flex';
  const label = gameoverScreen.querySelector('.gameover-text1-label');
  if (label) label.textContent = (typeof t === 'function') ? t('gameover.flags') : 'Suitcase Shuffle';
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
window.flagsSpectatorHidePostgame = function () {
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) { gameoverScreen.style.display = 'none'; gameoverScreen.style.pointerEvents = ''; }
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = '';
};

// tick = the player's real time remaining (broadcast every 1s from startFlagsTimer).
let _flagsSpecLastTick = null;
// On top of the VALUE guard above: joining mid-game triggers a
// 'round'+'tick' resend (see _resendStateTo in spectate.js) almost
// immediately, and the NEXT live tick arrives at its normal 1s cadence — but
// measured from the player's previous REAL tick, not from this resend. If the
// resend lands, say, 800ms after the last real tick, the next live tick can
// arrive only ~200ms after the resend — two DIFFERENT values (7 and 6),
// neither blocked by the guard above (which only stops EQUAL values),
// playing the beep twice back-to-back instead of once per second — the
// reported "cuts hard, sounds repeated".
let _flagsSpecLastTickSoundAt = 0;
window.flagsSpectatorUpdateTimer = function (timeLeft) {
  if (!_flagsSpecMode) return;
  flagsTimerEl.classList.remove('timer-number-infinity');
  flagsTimerEl.textContent = timeLeft;
  if (timeLeft <= 10) {
    flagsTimerEl.style.color = '#ffffff';
    flagsTimerImg.src = 'images/countdownred2.png';
    // Value guard (not just per-call): the round carries timeLeft and the 1x/s
    // tick can repeat the same second — without this it would sound twice.
    // + real-time guard (see _flagsSpecLastTickSoundAt): covers the case of
    // two DIFFERENT values arriving back-to-back from the mid-game join resend.
    const _nowTick = Date.now();
    if (timeLeft > 0 && timeLeft !== _flagsSpecLastTick && (_nowTick - _flagsSpecLastTickSoundAt) > 700
        && typeof sfxTickdown !== 'undefined' && typeof sfxPlay === 'function') {
      sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown);
      _flagsSpecLastTickSoundAt = _nowTick;
    }
  } else {
    flagsTimerEl.style.color = '';
    flagsTimerImg.src = 'images/countdown2.png';
  }
  _flagsSpecLastTick = timeLeft;
};

// score = the player's current score (from the existing score broadcast).
// dots = the train's ALREADY-accumulated progress at the moment of connecting
// — without this, someone joining mid-game saw empty dots until the real
// player's NEXT answer, instead of the real progress already made (same fix
// already applied in Cities/Monuments).
window.flagsSpectatorUpdateScore = function (score, dots) {
  if (!_flagsSpecMode) return;
  // Direct snap (no animation) — used to "catch up" on joining mid-round, not
  // for a live answer (that goes through flagsSpectatorResolvePick →
  // _flagsSpecAnimateScore). Also syncs the animation state — otherwise the
  // NEXT real answer would try to animate from the old value (0) instead of
  // from here.
  _flagsSpecTargetScore = score || 0;
  _flagsSpecDisplayedScore = score || 0;
  flagsScoreEl.textContent = (score || 0).toLocaleString();
  // Clamp so a simple catch-up doesn't retroactively fire the "reached 10"
  // animation — flagsSpectatorAdvanceDot already snaps directly (doesn't
  // increment), works as-is for this.
  if (typeof dots === 'number' && typeof window.flagsSpectatorAdvanceDot === 'function') {
    window.flagsSpectatorAdvanceDot(Math.max(0, Math.min(dots, FLAGS_DOTS_NEEDED - 1)));
  }
};

// payload = { prompt, correctSlot, options, eliminationOrder } — already fully
// resolved by the real player's flags.js (same seed), no need to re-derive it
// here; eliminationOrder is the same progressive-fade order running on their
// screen, so it looks the same and at the same time (timing is relative to the
// round start, FLAGS_ROUND_TIME is fixed).
window.flagsSpectatorShowRound = function (payload) {
  if (!_flagsSpecMode) return;
  _flagsSpecClearElimination();
  // Only HERE are they revealed (flagsSpectatorEnter leaves them hidden on
  // purpose, see long comment there) — there's real data to show, so it all
  // appears at once fully complete, without the moment of empty/old-flag
  // suitcases seen before.
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  flagsFindLuggage.style.display = 'block';
  flagsFlagidWrap.style.display  = 'block';
  const options   = payload.options || [];
  const slotCount = options.length;
  flagsGroupIds = slotCount > 3 ? [...flagsTopGroupIds, ...flagsBottomGroupIds] : flagsTopGroupIds.slice();
  flagsLuggageWrap.classList.toggle('flags-six-mode', slotCount > 3);
  flagsBottomGroupIds.forEach(id => {
    const g = document.getElementById(id);
    if (g) g.style.display = slotCount > 3 ? '' : 'none';
  });
  // Resume the belt scroll — exact same pattern as the real player's
  // startFlagsRound(): the full 'animation' must be reset (not just
  // 'transition'), because the previous round's pick leaves
  // animationPlayState:'paused' set — without this reset that pause stays stuck
  // and the next round's 'scrolling' animation never starts even after re-adding
  // the class.
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.classList.add('scrolling');
  flagsMachine2.style.animationPlayState  = 'running';
  flagsMachine3.style.animationPlayState  = 'running';
  flagsMachine3b.style.animationPlayState = 'running';
  flagsFlagidLabel.textContent = (typeof tCountry === 'function') ? tCountry(payload.prompt) : payload.prompt;
  // Fit the size if the name is long — same mechanism as the real game (see
  // flagsShowRound below); was missing here entirely, so a long name (e.g.
  // "República Dominicana") spilled out of the flagid card instead of
  // shrinking to fit.
  {
    const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
    const maxW = 41.7 * vminPx;
    let fs = 4.2;
    flagsFlagidLabel.style.fontSize = fs + 'cqmin';
    flagsFlagidLabel.style.letterSpacing = '';
    while (flagsFlagidLabel.scrollWidth > maxW && fs > 1.8) {
      fs -= 0.22;
      flagsFlagidLabel.style.fontSize = fs + 'cqmin';
      if (fs < 3.3) flagsFlagidLabel.style.letterSpacing = '-1px';
      if (fs < 2.4) flagsFlagidLabel.style.letterSpacing = '-2px';
    }
  }
  flagsGroupIds.forEach((id, i) => {
    const imgId  = flagsSlotImgIds[id];
    const img    = document.getElementById(imgId);
    const group  = document.getElementById(id);
    if (!img || !group) return;
    img.src = COUNTRY_FLAGS[options[i]] || '';
    img.style.display = 'block';
    group.style.display = '';
    group.style.pointerEvents = 'none';
    group.classList.remove('flags-faded', 'luggage-enter-active');
    // Full reset — if THIS suitcase was the one chosen in a previous round,
    // flagsSpectatorResolvePick left style.animation='none' (inline) on it to
    // animate the flight by transition instead of the CSS entry animation. An
    // inline animation:'none' blocks ANY class animation forever on that
    // element until cleared here — that's why the entry stopped working only on
    // the slot that had already been clicked.
    group.style.animation  = '';
    group.style.opacity    = '';
    group.style.willChange = '';
    group.style.transformOrigin = '';
    group.style.transform  = 'none';
    group.style.transition = 'none';
  });
  // Forced reflow before the rAF: guarantees the browser registered the
  // 'luggage-enter-active' class removed BEFORE re-adding it.
  void flagsLuggageWrap.offsetWidth;
  requestAnimationFrame(() => {
    if (!_flagsSpecMode) return;
    flagsGroupIds.forEach(id => {
      const g = document.getElementById(id);
      if (g) { g.style.transform = ''; g.style.transition = ''; g.classList.add('luggage-enter-active'); }
    });
  });

  // Progressive elimination — same visual pattern as the real game (fadeSlot).
  // The setTimeout is NOT scheduled here: if the local 3-2-1 is still on screen
  // when this data arrives, the fade would run "in the background" before the
  // spectator saw the round, desynced from the real player — it's stored so
  // _flagsSpecRevealAfterPregame() schedules it only when the round is really
  // revealed.
  const order = payload.eliminationOrder || [];
  _flagsSpecPendingElimination = { slotCount, order, roundStartedAt: payload.roundStartedAt || Date.now() };

  // Same mechanism as shapes.js: only on the first round after entering, a
  // short margin to confirm a pregame is really coming (arrives shortly after,
  // same real broadcast order). If none appears, it's a mid-round join — only
  // then, with the round already shown, does game music start (if there's a
  // pregame, its own onDone starts it when the 3-2-1 ends).
  if (_flagsSpecIsFirstRound) {
    _flagsSpecIsFirstRound = false;
    setTimeout(() => {
      // Guard against the reported "game music keeps playing" in VS: if by the
      // time this timer fires the spectator mode was already exited (e.g. the
      // player waiting on loan already saw the final result, see
      // _exitWaitAsSpectator in vs.js), don't overwrite the postgameloop
      // _showVsResult() already set playing.
      if (!_flagsSpecMode) return;
      if (!_flagsSpecPregameSeen && typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') {
        playMusic(sfxGameMusic);
      }
    }, 400);
  }
  // The DOM is already populated with this round's real data (above, whether
  // or not the containers are hidden) — if the local 3-2-1 already ended and
  // wasn't revealed yet (we got here AFTER the onDone, which found no data and
  // waited), reveal right now with the data already set. If the 3-2-1 is still
  // running, its own onDone triggers the reveal when it ends
  // (_flagsSpecShowRoundApplied is now true).
  _flagsSpecShowRoundApplied = true;
  // NOTE: this used to only reveal the FIRST time per session (gate
  // `!_flagsSpecRevealed`, meant only for the 3-2-1→round transition). The
  // pregame (3-2-1) is transmitted ONCE at mode start, not before each
  // question — so with that gate, ALL rounds after the first never called
  // _flagsSpecRevealAfterPregame() again: the ID machine never started its
  // scroll if this round was the first the spectator saw (mid-game join, no
  // pregame) and, even when it did, no later round scheduled its OWN
  // progressive option elimination (round 1's stayed stuck) — the reported
  // "the machine doesn't move / wrong suitcases don't disappear when joining
  // mid-game". With no 3-2-1 running right now, each new round must reveal
  // immediately.
  if (_flagsSpecCountdownDone) {
    _flagsSpecRevealAfterPregame();
    _flagsSpecRevealed = true;
  }
};

// payload = { index, correct } — the suitcase the real player clicked. Recreates
// the same flight to the belt the player sees (same calc as handleLuggagePick,
// measuring the real DOM here instead of there).
window.flagsSpectatorResolvePick = function (payload) {
  if (!_flagsSpecMode) return;
  // payload.score ALREADY has campaignBase() added (see _specReportAnswer in
  // the real player) — animate toward that value instead of jumping, like the
  // player sees (flagsAnimateScore()).
  if (typeof payload.score === 'number') {
    _flagsSpecTargetScore = payload.score;
    _flagsSpecAnimateScore();
  }
  _flagsSpecClearElimination();
  const group = document.getElementById(flagsGroupIds[payload.index]);
  // Everything in here is fragile geometry (getBoundingClientRect, DOMMatrix
  // over transforms that may not be set yet) — if something throws here, it
  // must NOT block what comes after (overlay/sound/score/train). A throw here
  // used to leave the train un-updated until the NEXT correct answer ("two
  // dots lighting up together one click behind").
  try { if (group) {
    flagsGroupIds.forEach(id => { const g = document.getElementById(id); if (g) g.style.pointerEvents = 'none'; });
    // KEY: remove the entry class BEFORE measuring/animating. Its animation
    // has fill-mode:forwards on finish, and while the class stays on that
    // animation keeps "winning" over the inline transform we set below — that's
    // why the suitcase was never seen traveling toward findluggage.
    group.classList.remove('luggage-enter-active');
    group.style.animation  = 'none';
    group.style.transition = 'none';
    group.style.transform  = 'none';
    group.style.transformOrigin = '0 0';
    const lugImg   = group.querySelector('#flags-luggage, .flags-luggage-side');
    const lugRect  = (lugImg || group).getBoundingClientRect();
    const grpRect  = group.getBoundingClientRect();
    const findRect = flagsFindLuggage.getBoundingClientRect();
    const lugScale = flagsLuggageWrap.getBoundingClientRect().width / 220;
    const fit  = lugRect.width ? (findRect.width / lugRect.width) : 1;
    const lugCx  = (lugRect.left + lugRect.width  / 2 - grpRect.left) / lugScale;
    const lugCy  = (lugRect.top  + lugRect.height / 2 - grpRect.top)  / lugScale;
    const findCx = (findRect.left + findRect.width  / 2 - grpRect.left) / lugScale;
    const findCy = (findRect.top  + findRect.height / 2 - grpRect.top)  / lugScale;
    const dx = findCx - fit * lugCx;
    const dy = findCy - fit * lugCy;
    group.style.willChange = 'transform';
    requestAnimationFrame(() => {
      group.style.transition = 'transform 0.1s linear';
      group.style.transform  = `translate3d(${dx}px, ${dy}px, 0) scale(${fit})`;
    });
    flagsMachine2.style.animationPlayState  = 'paused';
    flagsMachine3.style.animationPlayState  = 'paused';
    flagsMachine3b.style.animationPlayState = 'paused';
    // Without pausing findluggage itself, its own 'scrolling' animation kept
    // running and overwrote the transform we set here — that's why the suitcase
    // was never seen reaching its destination nor the final "whoosh".
    flagsFindLuggage.style.animationPlayState = 'paused';
    // Tracked in _flagsSpecEliminationTimeouts (cleared on exit and at the
    // start of each new round) — without this, if the spectator exited or
    // another round arrived BEFORE these 600ms passed, this callback still ran
    // after and overwrote the new round's animationPlayState/transform.
    _flagsSpecEliminationTimeouts.push(setTimeout(() => {
      if (!_flagsSpecMode) return;
      flagsMachine2.style.animationPlayState  = 'running';
      flagsMachine3.style.animationPlayState  = 'running';
      flagsMachine3b.style.animationPlayState = 'running';
      const mat = new DOMMatrix(getComputedStyle(flagsFindLuggage).transform);
      flagsFindLuggage.classList.remove('scrolling');
      flagsFindLuggage.style.transform = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e},${mat.f})`;
      void flagsFindLuggage.offsetWidth;
      flagsFindLuggage.style.transition = 'transform 0.15s linear';
      flagsFindLuggage.style.transform  = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e - 1000},${mat.f})`;
      group.style.transition = 'transform 0.15s linear';
      group.style.transform  = `translate3d(${dx - 1000 / lugScale}px, ${dy}px, 0) scale(${fit})`;
    }, 600));
  } } catch (e) {}
  const overlay = document.getElementById(payload.correct ? 'flags-check-overlay' : 'flags-wrong-overlay');
  if (overlay) {
    overlay.style.display = '';
    overlay.classList.remove('animate');
    void overlay.offsetWidth;
    overlay.classList.add('animate');
    setTimeout(() => { overlay.classList.remove('animate'); overlay.style.display = 'none'; }, 820);
  }
  // Like real handleLuggagePick: correct plays check+acertar together,
  // incorrect just error.
  if (typeof sfxPlay === 'function') {
    if (payload.correct) {
      if (typeof sfxCheck   !== 'undefined') { sfxCheck.currentTime   = 0; sfxPlay(sfxCheck); }
      if (typeof sfxAcertar !== 'undefined') { sfxAcertar.currentTime = 0; sfxPlay(sfxAcertar); }
    } else if (typeof sfxError !== 'undefined') {
      sfxError.currentTime = 0; sfxPlay(sfxError);
    }
  }
  // Floating "+points" and the speed-bonus sign — same as the real player sees
  // (they travel in the 'answer' broadcast along with the chosen index).
  if (payload.correct && typeof payload.points === 'number' && typeof showScorePopup === 'function') {
    showScorePopup(payload.points);
  }
  if (payload.speedBonus > 0) {
    clearTimeout(flagsSpeedBonusHideId);
    flagsSpeedBonusText.classList.remove('visible');
    requestAnimationFrame(() => flagsSpeedBonusText.classList.add('visible'));
    flagsSpeedBonusHideId = setTimeout(() => flagsSpeedBonusText.classList.remove('visible'), 1600);
  }
  // "X IN A ROW" streak — getBadgeImg(streak) returns a preloaded Image object
  // (not broadcast-serializable), but since it's a pure function of the streak,
  // the spectator resolves it locally with the same streak the player
  // transmits — no need to send the image, only the number.
  if (payload.hasBadge && typeof getBadgeImg === 'function' && typeof showFlagsBadge === 'function') {
    const badgeImg = getBadgeImg(payload.streak || 0);
    if (badgeImg) showFlagsBadge(badgeImg, payload.inRowBonus || 0, payload.streak || 0);
  }
  // Points train + +5s bonus
  if (payload.correct && typeof payload.dots === 'number' && typeof window.flagsSpectatorAdvanceDot === 'function') {
    window.flagsSpectatorAdvanceDot(payload.dots);
  }
};

const FLAGS_SPEED_WIN  = 2.0;   // seconds to earn the speed bonus
const FLAGS_SPEED_MULT = 1.5;   // multiplier

const flagsSpeedBonusText = document.getElementById('flags-speed-bonus-text');
let flagsSpeedBonusHideId = null;
let flagsRoundStartTime   = null;

// Visually similar flag groups — used as distractors from correct #23 onward
const FLAG_SIMILAR_GROUPS = [
  ["Chad", "Andorra", "Rumanía", "Moldova"],
  ["Italia", "México", "Costa de Marfil", "Irlanda"],
  ["Paraguay", "Países Bajos", "Luxemburgo", "Croacia"],
  ["Rusia", "Eslovenia", "Eslovaquia", "Serbia"],
  ["Catar", "Baréin"],
  ["Indonesia", "Mónaco", "Singapur", "Polonia"],
  ["Bélgica", "Alemania"],
  ["Colombia", "Ecuador", "Venezuela"],
  ["Bolivia", "Colombia", "Ecuador"],
  ["Noruega", "Islandia", "Suecia", "Dinamarca", "Finlandia"],
  ["Australia", "Nueva Zelanda"],
  ["Irak", "Siria", "Sudán", "Yemen", "Egipto"],
  ["Guinea", "Mali", "Senegal", "Ghana", "Costa de Marfil"],
  ["Estonia", "Finlandia", "Eslovenia"],
  ["Corea del Norte", "Corea del Sur"],
  ["China", "Vietnam"],
  ["India", "Níger"],
  ["República Dominicana", "Cuba", "Puerto Rico"],
  ["Grecia", "Uruguay"],
  ["Irlanda", "Costa de Marfil"],
  ["Lituania", "Bolivia", "Ghana"],
  ["Nigeria", "Armenia"],
  ["Israel", "El Salvador"],
  ["Filipinas", "Cuba"],
  ["Perú", "Japón", "Bangladesh", "Georgia"],
  ["Austria", "Letonia"],
  ["Bulgaria", "Hungría"],
  ["Bielorrusia", "Rusia"],
  ["Argelia", "Pakistán"],
  ["Brunéi", "Malasia"],
  ["Camboya", "Sri Lanka"],
  ["Chad", "Rumanía"],
  ["Burkina Faso", "Mali", "Guinea"],
  ["Nicaragua", "Honduras", "El Salvador"],
  ["Costa Rica", "Nicaragua", "Honduras"],
];

// Build the inverse map: country → array of similars
const FLAG_SIMILAR = {};
for (const group of FLAG_SIMILAR_GROUPS) {
  for (const country of group) {
    if (!FLAG_SIMILAR[country]) FLAG_SIMILAR[country] = new Set();
    for (const other of group) {
      if (other !== country) FLAG_SIMILAR[country].add(other);
    }
  }
}

const flagsTopGroupIds    = ['flags-luggage-left-group', 'flags-luggage-group', 'flags-luggage-right-group'];
const flagsBottomGroupIds = ['flags-luggage-bl-group', 'flags-luggage-bc-group', 'flags-luggage-br-group'];
let flagsGroupIds = flagsTopGroupIds.slice();

function disableAllLuggageGroups() {
  [...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
    const g = document.getElementById(id);
    if (g) {
      g.style.pointerEvents = 'none';
      g.style.cursor = 'default';
      g.classList.remove('luggage-enter-active');
      g.style.animation = 'none';
    }
  });
  flagsLuggageWrap.style.pointerEvents = 'none';
  flagsLuggageWrap.style.cursor = 'default';
}
let flagsStreak = 0;
let flagsEasyUnlocked = false;
let flagsSixUnlocked = false;   // 6 suitcases from correct #3
let flagsMediumUnlocked = false; // medium pool from correct #5
let flagsHardUnlocked   = false;
let flagsInsaneUnlocked = false;
let flagsCorrectCount = 0;
let flagsIsFirstRound = true;
let flagsAnswered = new Set();
let flagsLastChosen = null;

// ── SEEDED RNG FOR VERSUS ───────────────────────────────────────────────────
// In versus, the flag/distractor/slot selection must be identical for both
// players. For that we use a dedicated RNG (only the selection consumes it),
// independent of any other Math.random call (animations, emotes, etc.) that
// would happen in a different order on each client and desync everything.
let flagsVsIndex = 0;          // shared round index (same on both)
let _flagsSeededRand = null;   // deterministic generator (null ⇒ uses Math.random)
function _flagsSyncedVersus() { return window._vsActive || window._lobbyActive; }
// Was: `(_flagsSyncedVersus() && _flagsSeededRand) ? ... : Math.random()`.
// window._lobbyActive/_vsActive are STATE flags that change at other points in
// the code (round end, transition to spectate-on-loan, etc.) — shapes/cities/
// monuments NEVER check a state flag here, only whether the seeded generator
// (_xSeededRand) is set or not, set and cleared explicitly by
// flagsSetSeed/flagsClearSeed. If ANY flagsRand() call landed in the window
// where the seed was already set but _lobbyActive wasn't yet (or no longer)
// true, that call consumed Math.random() instead of advancing the seeded
// stream — desyncing the ENTIRE deterministic RNG for that client from then on
// (not just that round): the reported "some people get different questions
// than the rest". _flagsSeededRand is already null except between
// flagsSetSeed()/flagsClearSeed(), so this extra check was redundant and risky.
function flagsRand() { return _flagsSeededRand ? _flagsSeededRand() : Math.random(); }
function flagsShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(flagsRand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
window.flagsSetSeed = function(seed) {
  let s = (seed >>> 0) || 1;
  _flagsSeededRand = function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  flagsVsIndex = 0;
};
window.flagsClearSeed = function() { _flagsSeededRand = null; flagsVsIndex = 0; };

let flagsPracticePool = [];
let flagsPracticeRemaining = [];
let flagsPracticeCurrent = null;

// Picks the next practice country using the same tier-unlock logic as normal mode,
// capped at practiceConfig.difficulty. Excludes `exc` (pass current when wrong, null when correct).
function flagsPracticePickNext(exc) {
  const diff = (window.practiceConfig && window.practiceConfig.difficulty) || 'dificil';
  const pool = exc ? flagsPracticeRemaining.filter(c => c !== exc) : flagsPracticeRemaining;
  const fallback = pool.length ? pool : flagsPracticeRemaining;
  const unlockedTiers = ['inicio'];
  if (flagsEasyUnlocked   && diff !== 'inicio')                          unlockedTiers.push('easy');
  if (flagsMediumUnlocked && (diff === 'medio' || diff === 'dificil'))   unlockedTiers.push('medium');
  if (flagsHardUnlocked   && diff === 'dificil')                         unlockedTiers.push('hard');
  if (flagsInsaneUnlocked && diff === 'dificil')                         unlockedTiers.push('insane');
  // Filter to unlocked tiers; if continent has no countries there, expand progressively
  const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];
  const tierSet = new Set(unlockedTiers.flatMap(t => COUNTRIES[t] || []));
  let tiered = fallback.filter(c => tierSet.has(c));
  if (!tiered.length) {
    for (const tier of ALL_TIERS) {
      if (unlockedTiers.includes(tier)) continue;
      (COUNTRIES[tier] || []).forEach(c => tierSet.add(c));
      tiered = fallback.filter(c => tierSet.has(c));
      if (tiered.length) break;
    }
  }
  const pick = tiered.length ? tiered : fallback;
  return pick[Math.floor(Math.random() * pick.length)] || null;
}

function buildFlagsPracticePool(continents, difficulty) {
  const sh = a => { for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; };
  const hasFlag = c => !!COUNTRY_FLAGS[c];
  const inCont  = c => !continents || continents.has(FLAG_COUNTRY_CONTINENT[c]);
  const ok      = c => hasFlag(c) && inCont(c);
  const diff = difficulty || 'dificil';
  const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];

  // Tiers allowed by difficulty ceiling (cumulative)
  const allowedTiers = ['inicio'];
  if (diff !== 'inicio') allowedTiers.push('easy');
  if (diff === 'medio' || diff === 'dificil') allowedTiers.push('medium');
  if (diff === 'dificil') { allowedTiers.push('hard'); allowedTiers.push('insane'); }

  const seen = new Set();
  const pool = [];
  const add = c => { if (!seen.has(c)) { seen.add(c); pool.push(c); } };

  // Step 1: add allowed tiers filtered by continent
  for (const tier of allowedTiers) (COUNTRIES[tier] || []).filter(ok).forEach(add);

  // Step 2: if pool is thin (<6), supplement from next harder tiers (still continent-filtered)
  if (pool.length < 6) {
    for (const tier of ALL_TIERS) {
      if (allowedTiers.includes(tier)) continue;
      (COUNTRIES[tier] || []).filter(ok).forEach(add);
      if (pool.length >= 6) break;
    }
  }

  // Step 3: final fallback — drop continent filter if still too few
  if (pool.length < 6) {
    for (const tier of ALL_TIERS) {
      (COUNTRIES[tier] || []).filter(hasFlag).forEach(add);
      if (pool.length >= 6) break;
    }
  }

  return sh(pool);
}

// Answer window per round, in seconds. Must match the duration of the
// #flags-findluggage.scrolling animation (css/style.css) that marks the wrong
// on delay.
const FLAGS_ROUND_TIME = 8.15;
// Progressive elimination of wrong options (they fade out and become unselectable).
let flagsEliminationTimeouts = [];
function clearFlagsElimination() {
  flagsEliminationTimeouts.forEach(clearTimeout);
  flagsEliminationTimeouts = [];
}

const flagsSlotImgIds = {
  'flags-luggage-left-group':  'flags-flag-img-left',
  'flags-luggage-group':       'flags-flag-img',
  'flags-luggage-right-group': 'flags-flag-img-right',
  'flags-luggage-bl-group':    'flags-flag-img-bl',
  'flags-luggage-bc-group':    'flags-flag-img-bc',
  'flags-luggage-br-group':    'flags-flag-img-br',
};

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
const FLAGS_LB_COLORS  = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e8c','#00bcd4','#8bc34a'];
const FLAGS_LB_WINDOW  = 5;
const FLAGS_LB_PIN_ROW = 2;
const FLAGS_LB_GAP     = 4;

// Friends from the shared data layer (js/friends.js -> getFriends()), the same
// one the monuments bar and the results/final screens use.
function buildFlagsFriendPlayers() {
  // In lobby mode the leaderboard shows ALL the room's rivals, live.
  if (window._lobbyActive && Array.isArray(window._lobbyMembers)) {
    return window._lobbyMembers.map((m, i) => ({
      id: 'lob' + m.id,
      name: m.name,
      score: m.score || 0,
      avatar: m.avatar || '',
      color: FLAGS_LB_COLORS[i % FLAGS_LB_COLORS.length],
      initial: (m.name && m.name[0]) ? m.name[0].toUpperCase() : '?',
      cardCode: m.cardCode || '0001',
    }));
  }
  // In 1v1 versus mode the leaderboard competes ONLY against the opponent, live.
  if (window._vsActive && window._vsOpponent) {
    const o = window._vsOpponent;
    return [{
      id: 'vsopp',
      name: o.name,
      score: window._vsOppScore || 0,
      avatar: o.avatar || '',
      color: FLAGS_LB_COLORS[0],
      initial: (o.name && o.name[0]) ? o.name[0].toUpperCase() : '?',
      cardCode: o.cardCode || '0001',
    }];
  }
  const src = (typeof getFriends === 'function') ? getFriends() : [];
  return src.map((f, i) => ({
    id: `friend${i}`,
    name: f.name,
    score: f.score,
    avatar: f.avatar || '',
    color: FLAGS_LB_COLORS[i % FLAGS_LB_COLORS.length],
    initial: (f.name && f.name[0]) ? f.name[0].toUpperCase() : '?',
    cardCode: f.cardCode || '0001',
  }));
}
let flagsMockPlayers = buildFlagsFriendPlayers();

let flagsLbElements    = {};
let flagsLastLbScore   = -1;
let flagsLastPlayerRank = -1;

function getFlagsLbRowHeight() {
  const panel = document.getElementById('flags-right-panel');
  if (!panel) return 84;
  // offsetWidth (not getBoundingClientRect): the rect is scaled by the
  // #app-stage transform and, used as layout px, would re-scale (cramped entries).
  return Math.round(panel.offsetWidth * 1.5) + FLAGS_LB_GAP;
}

function initFlagsLeaderboard() {
  const lb = document.getElementById('flags-leaderboard');
  lb.innerHTML = '';
  lb.classList.toggle('vs-active', _flagsSyncedVersus());
  flagsLbElements = {};
  flagsLastLbScore = -1;
  flagsLastPlayerRank = -1;
  flagsMockPlayers = buildFlagsFriendPlayers(); // refresh with the real friends list

  if (!window.practiceConfig || !window.practiceConfig.active) {
    flagsMockPlayers.forEach(p => {
      const el = document.createElement('div');
      el.className = 'lb-entry';
      el.id = `flags-lb-${p.id}`;
      el.innerHTML = `<span class="lb-rank rank-other"></span>`
        + (p.avatar
          ? `<div class="lb-avatar lb-avatar-img-wrap"><img class="lb-avatar-img" src="${p.avatar}" onerror="this.parentNode.innerHTML='${p.initial}';this.parentNode.style.background='${p.color}'"></div>`
          : `<div class="lb-avatar" style="background:${p.color}">${p.initial}</div>`)
        + `<span class="lb-name">${p.name}</span>`
        + `<span class="lb-score">${p.score.toLocaleString()}</span>`;
      el.style.transition = 'none';
      el.style.top = '-9999px';
      // Every row carries its real cardCode now (same fix as
      // buildFriendPlayers/initLeaderboard in js/modes/mapgame-leaderboard.js) —
      // the real friends in the solo Gira Mundial ingame bar used to be left
      // out of this check and always showed the default card.
      window.CustomizeAssets?.applyCard(el, p.cardCode || '0001');
      flagsLbElements[el.id] = el;
      lb.appendChild(el);
    });
  }

  const playerEl = document.createElement('div');
  playerEl.className = 'lb-entry lb-player';
  playerEl.id = 'flags-lb-player';
  const _myNameFlags = window._sbProfile?.name || localStorage.getItem('playerName') || 'Tú';
  playerEl.innerHTML = `<span class="lb-rank rank-other"></span>`
                     + `<div class="lb-avatar"><img class="lb-avatar-img" src="${localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png'}"></div>`
                     + `<span class="lb-name">${_myNameFlags}</span>`
                     + `<span class="lb-score" id="flags-lb-player-score">0</span>`;
  playerEl.style.transition = 'none';
  playerEl.style.top = '-9999px';
  flagsLbElements['flags-lb-player'] = playerEl;
  lb.appendChild(playerEl);
  if (typeof window._applyFounderFrame === 'function') window._applyFounderFrame();

  requestAnimationFrame(() => {
    flagsPositionLeaderboard(0, false);
    requestAnimationFrame(() => {
      Object.values(flagsLbElements).forEach(el => {
        el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)';
      });
    });
  });
}

// If the friends list changes (real server data) while playing flags, rebuild
// its bar. Outside flags it rebuilds itself on game start.
if (typeof onFriendsUpdate === 'function') {
  onFriendsUpdate(() => { if (flagsRunning && !_flagsSyncedVersus()) initFlagsLeaderboard(); });
}

function flagsPositionLeaderboard(playerScore, animate) {
  // Universal bar: the player competes with the accumulated campaign score
  // (previous modes' base + current mode), not just flags'.
  playerScore += ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0);
  const lb   = document.getElementById('flags-leaderboard');
  const rowH = getFlagsLbRowHeight();
  lb.style.height = (FLAGS_LB_WINDOW * rowH - FLAGS_LB_GAP) + 'px';

  const all = [...flagsMockPlayers, { id: 'player', score: playerScore }];
  all.sort((a, b) => b.score - a.score);

  const playerRank = all.findIndex(p => p.id === 'player');

  // Automatic overtaking emote only in normal mode (not versus/lobby)
  if (!_flagsSyncedVersus() && animate && flagsLastPlayerRank !== -1 && playerRank < flagsLastPlayerRank) {
    let bubbleIndex = 0;
    for (let r = flagsLastPlayerRank; r >= playerRank + 1; r--) {
      const overtaken = all[r];
      if (overtaken && overtaken.id !== 'player') {
        const overtakenEl = flagsLbElements[`flags-lb-${overtaken.id}`];
        if (overtakenEl && typeof spawnEmoteBubble !== 'undefined') {
          setTimeout(() => spawnEmoteBubble(overtakenEl), 200 + bubbleIndex * 100);
          bubbleIndex++;
        }
      }
    }
  }
  flagsLastPlayerRank = playerRank;

  let windowStart = Math.max(0, playerRank - FLAGS_LB_PIN_ROW);
  let windowEnd   = Math.min(all.length, windowStart + FLAGS_LB_WINDOW);
  windowStart     = Math.max(0, windowEnd - FLAGS_LB_WINDOW);

  // Anchor the rows to the BOTTOM: if there are fewer rows than the window
  // (e.g. versus = 2), push them to the bottom instead of leaving them floating
  // at the top with a gap below.
  const visibleRows  = windowEnd - windowStart;
  const bottomOffset = Math.max(0, FLAGS_LB_WINDOW - visibleRows) * rowH;

  if (!animate) Object.values(flagsLbElements).forEach(el => { el.style.transition = 'none'; });

  all.forEach((p, rank) => {
    const el = flagsLbElements[`flags-lb-${p.id}`];
    if (el) el.style.top = ((rank - windowStart) * rowH + bottomOffset) + 'px';
  });

  // Update the position number on each leaderboard row
  all.forEach((p, rank) => {
    const el = flagsLbElements[`flags-lb-${p.id}`];
    if (!el) return;
    const rankEl = el.querySelector('.lb-rank');
    if (!rankEl) return;
    rankEl.textContent = rank + 1;
    rankEl.className = 'lb-rank ' + (rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : 'rank-other');
  });

  const scoreEl = flagsLbElements['flags-lb-player']?.querySelector('.lb-score');
  if (scoreEl) scoreEl.textContent = playerScore.toLocaleString();
}

function sortFlagsLeaderboard(playerScore) {
  if (playerScore === flagsLastLbScore) return;
  flagsLastLbScore = playerScore;
  if (window.practiceConfig && window.practiceConfig.active) {
    const sc = playerScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0);
    const scoreEl = flagsLbElements['flags-lb-player']?.querySelector('.lb-score');
    if (scoreEl) scoreEl.textContent = sc.toLocaleString();
    return;
  }
  flagsPositionLeaderboard(playerScore, true);
}

// Versus: update the opponent's score in the leaderboard and reorder with
// animation (same overtaking/emote animation as the normal friends bar).
function flagsSetVsOpponentScore(score) {
  window._vsOppScore = score;
  const opp = flagsMockPlayers.find(p => p.id === 'vsopp');
  if (!opp) return;
  opp.score = score;
  const el = flagsLbElements['flags-lb-vsopp'];
  if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = score.toLocaleString(); }
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, true);
}
window.flagsSetVsOpponentScore = flagsSetVsOpponentScore;

// Applies glow + shake + random emote to the card of the player who missed.
// Both animations go in a single inline style.animation; otherwise the CSS
// cascade only runs the last one, ignoring the other.
function _applyWrongEffects(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // Random emote of the 6 available
  const srcs = ['images/emotes/1.png','images/emotes/2.png','images/emotes/3.png',
                 'images/emotes/4.png','images/emotes/5.png','images/emotes/6.png'];
  const bubble = document.createElement('div');
  bubble.className = 'emote-bubble';
  const img = document.createElement('img');
  img.src = srcs[Math.floor(Math.random() * srcs.length)];
  img.className = 'emote-img';
  bubble.appendChild(img);
  el.appendChild(bubble);
  bubble.addEventListener('animationend', () => bubble.remove(), { once: true });
}

// Red glow only on the rival's card (1v1).
window.flagsTriggerOpponentWrong = function() {
  _applyWrongEffects(flagsLbElements['flags-lb-vsopp']);
};

// Red glow on the right card for lobby: uid of whoever missed.
window.flagsTriggerLobbyWrongFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'flags-lb-player' : ('flags-lb-lob' + uid);
  _applyWrongEffects(flagsLbElements[key]);
};

// ── "Time's up" (timesup) — SAME system as "wrong" but for timesup
// (shake + stopwatch, see window._applyTimesUpEffect).
window.flagsTriggerOpponentTimesUp = function() {
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(flagsLbElements['flags-lb-vsopp']);
};
window.flagsTriggerLobbyTimesUpFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'flags-lb-player' : ('flags-lb-lob' + uid);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(flagsLbElements[key]);
};

// Lobby: live-refresh ALL rivals' scores and reorder with animation.
function flagsSetLobbyScores(members) {
  if (!Array.isArray(members)) return;
  members.forEach(m => {
    const p = flagsMockPlayers.find(x => x.id === 'lob' + m.id);
    if (p) {
      p.score = m.score || 0;
      const el = flagsLbElements['flags-lb-lob' + m.id];
      if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = (m.score || 0).toLocaleString(); }
    }
  });
  // While spectating the leaderboard is positioned by the spectator renderer
  // (_renderGroupLeaderboard) — not the player's normal one, which would fight
  // for the same position and make the cells jump (see same fix in
  // js/modes/mapgame-vs.js/citiesSetVsOpponentScore).
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, true);
}
window.flagsSetLobbyScores = flagsSetLobbyScores;

function flagsSetLobbyDisconnected(uid, disconnected) {
  const el = flagsLbElements['flags-lb-lob' + uid];
  if (!el) return;
  if (disconnected) {
    el.classList.add('is-disconnected');
    if (!el.querySelector('.lb-disconnected-icon')) {
      const icon = document.createElement('div');
      icon.className = 'lb-disconnected-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 2.5 5.09 3.91l2.59 2.59-2.09 2.09A3.003 3.003 0 0 0 6 14.83V17H4v2h2v2h2v-2h2v-2h.17c.93 0 1.76-.37 2.37-.96l-.01-.01 2.06 2.06 1.41-1.41-9.5-9.5zm1.59 9.09A1.003 1.003 0 0 1 8 10.83V9.41l1.5 1.5-.41.68H8.09zm5.72 1.64-.01-.01c.13-.29.2-.61.2-.93V9.17c0-.93-.37-1.76-.96-2.37L11.66 5h2.59L19 9.75l-3.17 3.17.02.01zM19.07 4.93l-1.41 1.42L19 7.68l1.5-1.5-1.43-1.25z"/></svg>';
      el.appendChild(icon);
    }
  } else {
    el.classList.remove('is-disconnected');
    el.querySelector('.lb-disconnected-icon')?.remove();
  }
}
window.flagsSetLobbyDisconnected = flagsSetLobbyDisconnected;

window.flagsSetVsDisconnected = function(disconnected) {
  const el = flagsLbElements['flags-lb-vsopp'];
  if (!el) return;
  if (disconnected) {
    el.classList.add('is-disconnected');
    if (!el.querySelector('.lb-disconnected-icon')) {
      const icon = document.createElement('div');
      icon.className = 'lb-disconnected-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 2.5 5.09 3.91l2.59 2.59-2.09 2.09A3.003 3.003 0 0 0 6 14.83V17H4v2h2v2h2v-2h2v-2h.17c.93 0 1.76-.37 2.37-.96l-.01-.01 2.06 2.06 1.41-1.41-9.5-9.5zm1.59 9.09A1.003 1.003 0 0 1 8 10.83V9.41l1.5 1.5-.41.68H8.09zm5.72 1.64-.01-.01c.13-.29.2-.61.2-.93V9.17c0-.93-.37-1.76-.96-2.37L11.66 5h2.59L19 9.75l-3.17 3.17.02.01zM19.07 4.93l-1.41 1.42L19 7.68l1.5-1.5-1.43-1.25z"/></svg>';
      el.appendChild(icon);
    }
  } else {
    el.classList.remove('is-disconnected');
    el.querySelector('.lb-disconnected-icon')?.remove();
  }
};

const flagsProgressContainer = document.getElementById('flags-progress-dots');
const flagsProgressDots      = flagsProgressContainer ? flagsProgressContainer.querySelectorAll('.dot') : [];
const FLAGS_DOTS_NEEDED = 10;
const FLAGS_BONUS_TIME  = 5;
let flagsDots = 0;

function flagsUpdateDotsUI() {
  flagsProgressDots.forEach((d, i) => d.classList.toggle('filled', i < flagsDots));
}

function flagsAdvanceDot() {
  if (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0) return;
  flagsDots++;
  flagsUpdateDotsUI();

  if (flagsDots >= FLAGS_DOTS_NEEDED && !flagsProgressContainer.classList.contains('train-animation')) {
    flagsProgressContainer.classList.add('train-animation');

    const _flagsInfNow = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    if (!_flagsInfNow) {
      // Adjust flagsTimerDuration (source of truth, see startFlagsTimer), not
      // flagsTimeLeft directly — otherwise the next tick would overwrite it
      // with the value computed against flagsTimerStartedAt, losing the bonus.
      const elapsed = Math.floor((Date.now() - flagsTimerStartedAt) / 1000);
      const newTimeLeft = Math.min(flagsTimeLeft + FLAGS_BONUS_TIME, 99);
      flagsTimerDuration = elapsed + newTimeLeft;
      flagsTimeLeft = newTimeLeft;
      flagsTimerEl.textContent = flagsTimeLeft;
    }
    if (typeof playTimeBonus === 'function') playTimeBonus(document.getElementById('flags-time-bonus'), FLAGS_BONUS_TIME);
    const prevColor = flagsTimerEl.style.color;
    flagsTimerEl.style.color = '#00ff88';

    setTimeout(() => {
      flagsProgressContainer.classList.add('dots-fade-out');
      setTimeout(() => {
        flagsDots = Math.max(0, flagsDots - FLAGS_DOTS_NEEDED);
        flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
        flagsUpdateDotsUI();
        if (flagsTimeLeft > 0 && flagsTimeLeft <= 10) {
          flagsTimerEl.style.color = '#ffffff';
          flagsTimerImg.src = 'images/countdownred2.png';
        } else if (flagsTimeLeft > 10) {
          flagsTimerEl.style.color = prevColor;
          flagsTimerImg.src = 'images/countdown2.png';
        }
      }, 500);
    }, 2000);
  }
}

function flagsAnimateScore() {
  if (flagsScoreRafId) return;
  let last = null;
  function tick(ts) {
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    const diff = flagsScore - flagsDisplayedScore;
    if (diff <= 0) { flagsScoreRafId = null; return; }
    flagsDisplayedScore = Math.min(flagsScore, flagsDisplayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    flagsScoreEl.textContent = (flagsDisplayedScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
    flagsScoreRafId = requestAnimationFrame(tick);
  }
  flagsScoreRafId = requestAnimationFrame(tick);
}

function getFlagsRoundPoints(streak) {
  if (streak >= 15) return 120;
  if (streak >= 10) return 60;
  if (streak >= 5)  return 35;
  if (streak >= 2)  return 15;
  return 10;
}

function showFlagsBadge(badgeImg, bonus, streak, cxOverride, scaleOverride) {
  const canvas = document.getElementById('flags-badge-canvas');
  if (!canvas) return;
  canvas.width  = window.STAGE_W;
  canvas.height = window.STAGE_H;
  canvas.style.display = 'block';
  const ctx2 = canvas.getContext('2d');
  const CX = cxOverride !== undefined ? cxOverride : canvas.width / 2, CY = (scaleOverride !== undefined ? canvas.height * 0.44 : canvas.height / 2);
  // Measures in vmin (px = vmin_value * vmin) so it scales with the viewport.
  const vmin = Math.min(window.STAGE_W, window.STAGE_H) / 100;
  const W = 44.5 * vmin, H = 36.6 * vmin, CW = 52.4 * vmin, CH = 44.5 * vmin;
  const IN_END = 0.2, HOLD_END = 0.60, SHRINK_DUR = 0.22, TOTAL = HOLD_END + SHRINK_DUR;
  const BZ_IN = 0.18, BZ_HOLD = 0.42, BZ_OUT = 0.72;
  const strokeColor = typeof getBadgeStrokeColor !== 'undefined' ? getBadgeStrokeColor(streak) : '#623103';
  const bonusLabel = bonus > 0 ? `+${bonus}` : '';
  let t = 0, last = null, rafId;

  setTimeout(() => { if (typeof sfxBonus !== 'undefined') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); } }, 800);

  function frame(ts) {
    if (!last) last = ts;
    t += (ts - last) / 1000;
    last = ts;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    if (t >= TOTAL) { canvas.style.display = 'none'; return; }

    const sxMult = scaleOverride !== undefined ? scaleOverride : 1;
    let alpha, scale;
    if      (t < IN_END)   { scale = (0.25 + (t / IN_END) * 0.75) * sxMult; alpha = 1; }
    else if (t < HOLD_END) { scale = 1 * sxMult; alpha = 1; }
    else                   { const p = (t - HOLD_END) / SHRINK_DUR; scale = (1 - p) * sxMult; alpha = 1; }

    // The check is already shown by flags-check-overlay on each answer; here we
    // only draw the badge + "IN A ROW" + bonus so as not to duplicate the check.

    // +bonus
    let bonusScale = 0;
    if      (t < BZ_IN)   bonusScale = t / BZ_IN;
    else if (t < BZ_HOLD) bonusScale = 1;
    else if (t < BZ_OUT)  bonusScale = 1 - (t - BZ_HOLD) / (BZ_OUT - BZ_HOLD);
    if (bonusScale > 0 && bonusLabel) {
      const bCY = CY + CH / 2 + 2.2 * vmin;
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.translate(CX, bCY);
      ctx2.scale(bonusScale, bonusScale);
      ctx2.font = `${11.4 * vmin}px Dimbo, "Arial Black", sans-serif`;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.strokeStyle = '#073A79'; ctx2.lineWidth = 1.54 * vmin;
      ctx2.strokeText(bonusLabel, 0, 0);
      ctx2.strokeStyle = '#FD9C1A'; ctx2.lineWidth = 0.77 * vmin;
      ctx2.strokeText(bonusLabel, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillText(bonusLabel, 0, 0);
      ctx2.restore();
    }

    // badge + IN A ROW
    if (badgeImg) {
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.translate(CX + 3.3 * vmin, CY - 3.3 * vmin);
      ctx2.scale(scale, scale);
      ctx2.drawImage(badgeImg, -W / 2, -H / 2, W, H);
      ctx2.font = `bold ${7.4 * vmin}px Fredoka, sans-serif`;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.scale(1, 1.2);
      ctx2.strokeStyle = strokeColor; ctx2.lineWidth = 1.21 * vmin;
      ctx2.strokeText(`${streak} IN A ROW`, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillText(`${streak} IN A ROW`, 0, 0);
      ctx2.restore();
    }

    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

// Scripted sequence for recording the promo reel: 5 fixed rounds with
// increasing difficulty (the 4th is a deliberate "trap": similar flags).
// Each round waits a scripted delay and then simulates the click on the
// correct slot — so it can be recorded in OBS without playing live, as many
// takes as needed, always with the same result.
const FLAGS_REC_SEQUENCE = [
  { flags: ['España', 'Francia', 'Alemania'],        correct: 0, delayMs: 2200 },
  { flags: ['Japón', 'Corea del Sur', 'China'],       correct: 0, delayMs: 2000 },
  { flags: ['Argentina', 'Brasil', 'Portugal'],       correct: 1, delayMs: 2400 },
  { flags: ['Chad', 'Rumanía', 'Andorra'],            correct: 1, delayMs: 4500 }, // trap: Chad/Rumanía nearly identical
  { flags: ['Mónaco', 'Indonesia', 'Polonia'],        correct: 1, delayMs: 3800 }, // trap: Mónaco/Indonesia nearly identical
];

let flagsRecScore = 0;

function startFlagsRoundRecording(recIndex) {
  recIndex = recIndex || 0;
  const round = FLAGS_REC_SEQUENCE[recIndex];

  if (!round) {
    // End of the sequence: final result screen for the reel's closing shot.
    flagsFlagidLabel.textContent = `Score: ${flagsRecScore}`;
    flagsFlagidLabel.style.fontSize = '4.2cqmin';
    flagsTopGroupIds.forEach(id => {
      const g = document.getElementById(id);
      if (g) { g.style.pointerEvents = 'none'; g.style.display = 'none'; }
    });
    return;
  }

  if (recIndex === 0) flagsRecScore = 0;

  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.classList.add('scrolling');

  flagsFlagidLabel.textContent         = `Flag ${recIndex + 1}/${FLAGS_REC_SEQUENCE.length}`;
  flagsFlagidLabel.style.fontSize      = '4.2cqmin';
  flagsFlagidLabel.style.letterSpacing = '';

  flagsTopGroupIds.forEach((id, i) => {
    const group = document.getElementById(id);
    if (!group) return;
    group.style.display       = '';
    group.style.opacity       = '';
    group.style.pointerEvents = 'none'; // scripted: no manual clicks
    group.style.cursor        = 'default';
    group.style.animation     = '';
    group.style.transition    = '';
    group.style.transform     = '';
    group.style.willChange    = '';
    group.classList.remove('luggage-enter-active');
    void group.offsetWidth;
    group.classList.add('luggage-enter-active');

    const imgId = flagsSlotImgIds[id];
    const img   = document.getElementById(imgId);
    if (img) { img.src = COUNTRY_FLAGS[round.flags[i]] || ''; img.style.display = 'block'; }
  });

  setTimeout(() => {
    if (!document.body.classList.contains('recording-mode')) return;
    const group = document.getElementById(flagsTopGroupIds[round.correct]);
    if (!group) return;
    flagsRecScore += 100;
    // Like the real game: immediate freeze + translate toward findluggage
    group.classList.remove('luggage-enter-active');
    group.style.animation = 'none';
    group.style.transition = 'none';
    group.style.transform  = 'none';
    group.style.transformOrigin = '0 0';
    void group.offsetWidth;
    const lugImg    = group.querySelector('#flags-luggage, .flags-luggage-side');
    const lugRect   = (lugImg || group).getBoundingClientRect();
    const grpRect   = group.getBoundingClientRect();
    const findRect  = flagsFindLuggage.getBoundingClientRect();
    const lugScale  = flagsLuggageWrap.getBoundingClientRect().width / 220;
    const fit = lugRect.width ? (findRect.width / lugRect.width) : 1;
    const lugCx  = (lugRect.left + lugRect.width  / 2 - grpRect.left) / lugScale;
    const lugCy  = (lugRect.top  + lugRect.height / 2 - grpRect.top)  / lugScale;
    const findCx = (findRect.left + findRect.width  / 2 - grpRect.left) / lugScale;
    const findCy = (findRect.top  + findRect.height / 2 - grpRect.top)  / lugScale;
    const dx = findCx - fit * lugCx;
    const dy = findCy - fit * lugCy;
    group.style.willChange = 'transform';
    group.style.transformOrigin = '0 0';
    group.style.transition = 'transform 0.1s linear';
    group.style.transform  = `translate3d(${dx}px, ${dy}px, 0) scale(${fit})`;
    flagsMachine2.style.animationPlayState     = 'paused';
    flagsMachine3.style.animationPlayState     = 'paused';
    flagsMachine3b.style.animationPlayState    = 'paused';
    flagsFindLuggage.style.animationPlayState  = 'paused';

    setTimeout(() => {
      if (!document.body.classList.contains('recording-mode')) return;
      flagsMachine2.style.animationPlayState     = 'running';
      flagsMachine3.style.animationPlayState     = 'running';
      flagsMachine3b.style.animationPlayState    = 'running';
      startFlagsRoundRecording(recIndex + 1);
    }, 900);
  }, round.delayMs);
}

function startFlagsRound() {
  if (document.body.classList.contains('recording-mode')) {
    return startFlagsRoundRecording();
  }
  // Versus: difficulty/unlocks are driven by the SHARED round index, not
  // individual correct answers, so both players see the SAME flag in the same
  // round even if one is winning.
  if (_flagsSyncedVersus()) {
    flagsIsFirstRound   = flagsVsIndex === 0;
    flagsEasyUnlocked   = flagsVsIndex >= 1;
    flagsSixUnlocked    = flagsVsIndex >= 3;
    flagsMediumUnlocked = flagsVsIndex >= 10;
    flagsHardUnlocked   = flagsVsIndex >= 20;
    flagsInsaneUnlocked = flagsVsIndex >= 30;
    flagsGroupIds = flagsSixUnlocked
      ? [...flagsTopGroupIds, ...flagsBottomGroupIds]
      : flagsTopGroupIds.slice();
  }
  // Reset findluggage to initial position and restart scroll animation
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.classList.add('scrolling');

  // If the animation ends without anything selected → wrong
  const onFindLuggageEnd = () => {
    flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
    clearTimeout(flagsRoundFallbackTimeout);
    clearFlagsElimination();
    if (!flagsRunning) return;
    flagsPicked = true; // block clicks until the next question
    // Simulate wrong: same logic as an incorrect click
    flagsGroupIds.forEach(gid => {
      const g = document.getElementById(gid);
      if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
    });
    flagsStreak = 0;
    flagsIsFirstRound = false;
    flagsWrongCount++;
    if (typeof sfxError !== 'undefined') { sfxError.currentTime = 0; sfxPlay(sfxError); }
    // Automatic wrong by time (no click) — the spectator has no suitcase index
    // to animate, only the error flash.
    // + campaignBase(): the spectator has no way of its own to know how much
    // the player accumulated in earlier campaign modes — without adding it
    // here, it saw the score start from 0 in each mode instead of continuing.
    if (typeof window._specReportAnswer === 'function') window._specReportAnswer(false, Math.round(flagsScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)), { index: -1, timeout: true });
    if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(false, Math.round(flagsScore));
    const overlay = document.getElementById('flags-wrong-overlay');
    if (overlay) {
      overlay.classList.remove('animate');
      void overlay.offsetWidth;
      overlay.classList.add('animate');
      setTimeout(() => {
        overlay.classList.remove('animate');
        if (!flagsRunning) return;
        const allGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
        allGroupIds.forEach(gid => {
          const g = document.getElementById(gid);
          if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.transformOrigin = ''; g.style.opacity = '0'; g.style.willChange = ''; }
        });
        setTimeout(() => {
          if (!flagsRunning) return;
          if (document.body.classList.contains('recording-mode')) return;
          allGroupIds.forEach(gid => {
            const g = document.getElementById(gid);
            if (g) g.style.opacity = '';
          });
          if (!flagsSixUnlocked) {
            flagsBottomGroupIds.forEach(id => {
              const g = document.getElementById(id);
              if (g) g.style.display = 'none';
            });
          }
          if (window.practiceConfig && window.practiceConfig.active && flagsPracticeRemaining.length > 1) {
            const others = flagsPracticeRemaining.filter(x => x !== flagsPracticeCurrent);
            flagsPracticeCurrent = others[Math.floor(Math.random() * others.length)];
          }
          startFlagsRound();
        }, 50);
      }, 750);
    }
  };
  flagsFindLuggage.addEventListener('animationend', onFindLuggageEnd);
  // Real-clock fallback (same pattern as _flagsTimerTick with Date.now()):
  // this 8.15s window per question depends ONLY on the findluggage-scroll
  // animationend event to advance — unlike the game's general timer, it had no
  // fallback. If that event doesn't arrive properly on return from a
  // background tab (CSS/compositor animation resumption), the question froze
  // forever with no visual cue (reported: "I come back and the game doesn't
  // respond, everything looks normal"). With this fallback timeout, if the
  // event never arrives, the same "wrong by time" path is forced a few ms
  // after it should have finished.
  clearTimeout(flagsRoundFallbackTimeout);
  flagsRoundFallbackTimeout = setTimeout(() => {
    flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
    onFindLuggageEnd();
  }, FLAGS_ROUND_TIME * 1000 + 600);

  const _practiceContFilter = c => {
    if (!window.practiceConfig || !window.practiceConfig.active) return true;
    return window.practiceConfig.continents.has(FLAG_COUNTRY_CONTINENT[c]);
  };
  let inicioCountries  = (COUNTRIES.inicio  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  let easyCountries    = (COUNTRIES.easy    || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const mediumCountries  = (COUNTRIES.medium  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const hardCountries    = (COUNTRIES.hard    || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const insaneCountries  = (COUNTRIES.insane  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  // Fallback: if the continent has few inicio flags, fill from easy with no filter
  if (window.practiceConfig && window.practiceConfig.active && inicioCountries.length < 3) {
    const easyAll = (COUNTRIES.easy || []).filter(c => COUNTRY_FLAGS[c] && !inicioCountries.includes(c));
    inicioCountries = [...inicioCountries, ...easyAll].slice(0, Math.max(inicioCountries.length + easyAll.length, 6));
  }
  if (window.practiceConfig && window.practiceConfig.active && easyCountries.length < 3) {
    const easyAll = (COUNTRIES.easy || []).filter(c => COUNTRY_FLAGS[c] && !easyCountries.includes(c));
    easyCountries = [...easyCountries, ...easyAll];
  }

  const easyInitPool = [...inicioCountries, ...easyCountries];
  const fullPool = flagsIsFirstRound
    ? inicioCountries
    : flagsInsaneUnlocked
      ? [...easyInitPool, ...mediumCountries, ...hardCountries, ...insaneCountries]
      : flagsHardUnlocked
        ? [...easyInitPool, ...mediumCountries, ...hardCountries]
        : flagsMediumUnlocked
          ? [...easyInitPool, ...mediumCountries]
          : flagsEasyUnlocked
            ? easyInitPool
            : inicioCountries;

  const excluded = c => flagsAnswered.has(c) || c === flagsLastChosen;

  function weightedPick(partsA, poolA, partsB, poolB) {
    const avA = poolA.filter(c => !excluded(c));
    const avB = poolB.filter(c => !excluded(c));
    let wp = [...Array(partsA).fill(avA).flat(), ...Array(partsB).fill(avB).flat()];
    if (!wp.length) {
      flagsAnswered.clear();
      const rA = poolA.filter(c => c !== flagsLastChosen);
      const rB = poolB.filter(c => c !== flagsLastChosen);
      wp = [...Array(partsA).fill(rA).flat(), ...Array(partsB).fill(rB).flat()];
    }
    if (!wp.length) wp = fullPool;
    return wp[Math.floor(flagsRand() * wp.length)];
  }

  // In versus/lobby the difficulty curve is driven by the shared round index.
  const selCount = _flagsSyncedVersus() ? flagsVsIndex : flagsCorrectCount;

  let chosen;
  if (window.practiceConfig && window.practiceConfig.active) {
    if (!flagsPracticeCurrent || flagsPracticeRemaining.length === 0) {
      clearInterval(flagsTimerIntervalId);
      flagsRunning = false;
      clearFlagsElimination();
      disableAllLuggageGroups();
      flagsLuggageWrap.classList.add('flags-game-ended');
      if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
      if (typeof window._specReportTimesUp === 'function') window._specReportTimesUp();
      endFlagsGame();
      return;
    }
    chosen = flagsPracticeCurrent;
  } else if (flagsInsaneUnlocked) {
    // insane vs hard+lower — 1:5 at 30 → 5:1 at 50
    const insaneParts = Math.min(Math.floor((selCount - 30) / 5) + 1, 5);
    const lowerParts  = Math.max(6 - insaneParts, 1);
    const lowerPool   = [...easyInitPool, ...mediumCountries, ...hardCountries];
    chosen = weightedPick(insaneParts, insaneCountries, lowerParts, lowerPool);
  } else if (flagsHardUnlocked) {
    // hard vs medium+easy+inicio — 1:5 at 20 → 5:1 at 40
    const hardParts  = Math.min(Math.floor((selCount - 20) / 5) + 1, 5);
    const lowerParts = Math.max(6 - hardParts, 1);
    const lowerPool  = [...easyInitPool, ...mediumCountries];
    chosen = weightedPick(hardParts, hardCountries, lowerParts, lowerPool);
  } else if (flagsMediumUnlocked) {
    // medium vs easy+inicio
    // 1:5 at 10 correct → 5:1 at 22 correct
    const mediumParts = Math.min(Math.floor((selCount - 10) / 3) + 1, 5);
    const easyParts   = Math.max(6 - mediumParts, 1);
    chosen = weightedPick(mediumParts, mediumCountries, easyParts, easyInitPool);
  } else {
    let chosenPool = fullPool.filter(c => !excluded(c));
    if (!chosenPool.length) { flagsAnswered.clear(); chosenPool = fullPool.filter(c => c !== flagsLastChosen); }
    if (!chosenPool.length) chosenPool = fullPool;
    // Final fallback: if the continent has nothing, use global easy
    if (!chosenPool.length) {
      chosenPool = [...(COUNTRIES.inicio || []), ...(COUNTRIES.easy || [])].filter(c => COUNTRY_FLAGS[c]);
    }
    chosen = chosenPool[Math.floor(flagsRand() * chosenPool.length)];
  }
  if (!chosen) return; // pool completely empty, don't start a round
  flagsLastChosen = chosen;
  // Versus: record the shown flag and advance the shared index, so the
  // exclusion list and difficulty stay identical on all clients.
  const _flagsRoundIdx = flagsVsIndex;
  if (_flagsSyncedVersus()) { flagsAnswered.add(chosen); flagsVsIndex++; }
  flagsFlagidLabel.textContent = (typeof tCountry === 'function') ? tCountry(chosen) : chosen;
  // Fit the size if the name is long. All in vmin to scale with the viewport
  // like the flagid image (49.4cqmin); maxW = 41.7cqmin in px.
  const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
  const maxW = 41.7 * vminPx;
  let fs = 4.2;
  flagsFlagidLabel.style.fontSize = fs + 'cqmin';
  flagsFlagidLabel.style.letterSpacing = '';
  while (flagsFlagidLabel.scrollWidth > maxW && fs > 1.8) {
    fs -= 0.22;
    flagsFlagidLabel.style.fontSize = fs + 'cqmin';
    if (fs < 3.3) flagsFlagidLabel.style.letterSpacing = '-1px';
    if (fs < 2.4) flagsFlagidLabel.style.letterSpacing = '-2px';
  }

  // Distractors: prefer visually similar flags from correcta 23 onward
  const _inPractice = window.practiceConfig && window.practiceConfig.active;
  const _practiceContFilter2 = _inPractice
    ? c => COUNTRY_FLAGS[c] && window.practiceConfig.continents.has(FLAG_COUNTRY_CONTINENT[c])
    : () => true;
  const useSimilar = !_inPractice && selCount >= 35 && FLAG_SIMILAR[chosen];
  const similarAvailable = useSimilar
    ? [...(FLAG_SIMILAR[chosen] || [])].filter(c => COUNTRY_FLAGS[c] && c !== chosen)
    : [];
  // Build distractor base: in practice, limit to unlocked tiers (same as pick logic)
  let _distractorBase;
  if (_inPractice) {
    const _dUnlocked = ['inicio'];
    const _diff2 = (window.practiceConfig && window.practiceConfig.difficulty) || 'dificil';
    if (flagsEasyUnlocked   && _diff2 !== 'inicio')                          _dUnlocked.push('easy');
    if (flagsMediumUnlocked && (_diff2 === 'medio' || _diff2 === 'dificil')) _dUnlocked.push('medium');
    if (flagsHardUnlocked   && _diff2 === 'dificil')                         _dUnlocked.push('hard');
    if (flagsInsaneUnlocked && _diff2 === 'dificil')                         _dUnlocked.push('insane');
    const _dSet = new Set(_dUnlocked.flatMap(t => COUNTRIES[t] || []));
    _distractorBase = flagsPracticePool.filter(c => _dSet.has(c));
    // Expand to next tiers if too few for slot count
    const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];
    for (const tier of ALL_TIERS) {
      if (_distractorBase.length >= flagsGroupIds.length + 2) break;
      if (_dUnlocked.includes(tier)) continue;
      (COUNTRIES[tier] || []).forEach(c => { if (COUNTRY_FLAGS[c] && !_dSet.has(c)) { _dSet.add(c); if (flagsPracticePool.includes(c)) _distractorBase.push(c); } });
    }
    if (_distractorBase.length < flagsGroupIds.length) _distractorBase = flagsPracticePool;
  } else {
    _distractorBase = fullPool;
  }
  const nonsimilar = flagsShuffle(_distractorBase.filter(c => c !== chosen && !similarAvailable.includes(c)));
  flagsShuffle(similarAvailable);
  // Fill distractors with similars first, then pad with filtered pool, then pad with easy (continent-filtered in practice)
  // Dedupe: if a country appears twice in the source lists (e.g. in more than
  // one tier), it ended up duplicated in two different suitcases with the SAME
  // flag — the assignment index (below) doesn't re-check uniqueness, so it must
  // be guaranteed here before use.
  let distractorPool = [...new Set([...similarAvailable, ...nonsimilar])];
  if (distractorPool.length < flagsGroupIds.length - 1) {
    const fallbackBase = _inPractice
      ? _distractorBase
      : [...(COUNTRIES.inicio || []), ...(COUNTRIES.easy || [])];
    const globalEasy = flagsShuffle(fallbackBase
      .filter(c => COUNTRY_FLAGS[c] && c !== chosen && !distractorPool.includes(c) && _practiceContFilter2(c)));
    distractorPool = [...distractorPool, ...globalEasy];
  }

  const slotCount = flagsGroupIds.length;
  const correctSlot = Math.floor(flagsRand() * slotCount);
  // Progressive elimination order — computed HERE (not below) so it can be
  // included in the round broadcast and the spectator fades the same options
  // at the same moment as the real player.
  const wrongSlots = [];
  for (let s = 0; s < slotCount; s++) if (s !== correctSlot) wrongSlots.push(s);
  flagsShuffle(wrongSlots);

  // Apply six-mode layout before animations so positions are correct when luggages drop
  if (flagsSixUnlocked) flagsLuggageWrap.classList.add('flags-six-mode');

  // Prepare groups and assign flags
  const activeGroupIds = flagsSixUnlocked
    ? [...flagsTopGroupIds, ...flagsBottomGroupIds]
    : flagsTopGroupIds;

  // Assign flags to slots first — src before the animation so the decode
  // happens concurrent with the drop (200ms of animation is enough margin).
  const _flagsSlotCountries = [];
  flagsGroupIds.forEach((id, i) => {
    const imgId = flagsSlotImgIds[id];
    const img = document.getElementById(imgId);
    const country = i === correctSlot ? chosen : (distractorPool[i < correctSlot ? i : i - 1] || '');
    _flagsSlotCountries[i] = country;
    if (!img) return;
    const flagUrl = COUNTRY_FLAGS[country] || '';
    // Retry on load error (e.g. image evicted from memory on mobile, network
    // hiccup): without this, a network failure left the suitcase with the OLD
    // flag from the previous round (or blank) the rest of the round, with no
    // visual cue that it was a different country than shown.
    img.onerror = () => {
      img.onerror = null;
      setTimeout(() => { if (img.src !== flagUrl) img.src = flagUrl; else { img.src = ''; img.src = flagUrl; } }, 400);
    };
    img.src = flagUrl;
    img.style.display = 'block';
    if (img.decode) img.decode().catch(() => {}); // fire-and-forget: prewarms the GPU texture
  });
  // Spectator mode: announce the round (options + correct answer) before the
  // player answers, so watchers see the same thing in realtime.
  if (typeof window._specReportRound === 'function') {
    // roundStartedAt: wall-clock time when THIS round starts — the spectator
    // uses it to compute how much of the 8.15s window already passed at the
    // moment of receiving/reprocessing this round (see flagsSpectatorShowRound),
    // and apply the progressive elimination already advanced instead of from
    // zero. Without this, someone entering mid-round (e.g. _enterWaitAsSpectator,
    // or VS._resendStateTo resending this same payload to a late-joining
    // spectator) saw all 6 options intact even though the real player already
    // had only 2 for the little time left in the round (the reported "when I
    // see 6, my rival actually has 2").
    window._specReportRound({ index: _flagsRoundIdx, mode: 'flags', prompt: chosen, correctSlot, options: _flagsSlotCountries, eliminationOrder: wrongSlots.slice(), timeLeft: flagsTimeLeft, roundStartedAt: Date.now() });
  }

  // Start the animation on the next frame: the browser committed the
  // luggage-enter-active removal in the previous frame (no void offsetWidth needed).
  activeGroupIds.forEach(id => {
    const group = document.getElementById(id);
    if (!group) return;
    group.style.display = '';
    group.style.pointerEvents = 'auto';
    group.style.cursor = 'pointer';
    group.classList.remove('flags-faded', 'luggage-enter-active');
  });
  requestAnimationFrame(() => {
    if (!flagsRunning) return;
    activeGroupIds.forEach(id => {
      const group = document.getElementById(id);
      if (group) group.classList.add('luggage-enter-active');
    });
  });

  flagsRoundStartTime = performance.now() + 200; // starts counting after the entry animation

  let flagsPicked = false;
  // findluggage scrolls in X. On iOS the click arrives ~300ms late (touch lag)
  // and by then findluggage has moved → the suitcase dropped at a later X. We
  // freeze it on pointerdown (real, immediate touch). Only affects X; Y doesn't
  // change because findluggage doesn't move vertically.
  let flagsTapFindRect = null;

  // ── Progressive elimination of wrong options ─────────────────────────────────
  // 6 options: every 1/3 of the time, 2 wrong ones fade out (0.3s) and become
  //            unselectable, until only 2 remain (correct + 1 wrong).
  // 3 options: at 1/2 the time, 1 wrong one fades out, leaving 2.
  clearFlagsElimination();
  const fadeSlot = (slotIdx) => {
    const g = document.getElementById(flagsGroupIds[slotIdx]);
    if (g) { g.classList.add('flags-faded'); g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
  };
  const roundMs = FLAGS_ROUND_TIME * 1000;
  if (slotCount >= 6) {
    [1, 2].forEach(step => {
      const slice = wrongSlots.slice((step - 1) * 2, step * 2);
      flagsEliminationTimeouts.push(setTimeout(() => {
        if (!flagsRunning || flagsPicked) return;
        slice.forEach(fadeSlot);
      }, roundMs * step / 3));
    });
  } else if (slotCount === 3) {
    flagsEliminationTimeouts.push(setTimeout(() => {
      if (!flagsRunning || flagsPicked) return;
      fadeSlot(wrongSlots[0]);
    }, roundMs / 2));
  }

  flagsGroupIds.forEach((id, i) => {
    const group = document.getElementById(id);
    if (!group) return;
    // pointerup = on RELEASING the suitcase, immediate on iOS (without the
    // click's 300ms). Freezes findluggage AND runs the action in the same event.
    group.onpointerup = (ev) => {
      if (!flagsRunning || flagsPicked || group.classList.contains('flags-faded')) return;
      ev.preventDefault(); // prevents a following click on iOS
      // On iOS the compositor animates findluggage asynchronously: pausing the
      // animation and forcing a reflow isn't enough to sync the visual position
      // when the user answers very fast (layout returns the base X, not the
      // animated X). Fix: capture the compositor's exact matrix with
      // getComputedStyle BEFORE touching anything, then set the inline transform
      // → getBCR reflects the real X.
      const _fmat = new DOMMatrix(window.getComputedStyle(flagsFindLuggage).transform);
      flagsFindLuggage.classList.remove('scrolling');
      flagsFindLuggage.style.animation  = 'none';
      flagsFindLuggage.style.transition = 'none';
      flagsFindLuggage.style.transform  = `matrix(${_fmat.a},${_fmat.b},${_fmat.c},${_fmat.d},${_fmat.e},${_fmat.f})`;
      flagsMachine2.style.animationPlayState  = 'paused';
      flagsMachine3.style.animationPlayState  = 'paused';
      flagsMachine3b.style.animationPlayState = 'paused';
      flagsTapFindRect = flagsFindLuggage.getBoundingClientRect(); // getBCR forces layout — void offsetWidth unnecessary
      // Defer the heavy work to the next frame: the browser paints the frozen
      // state immediately and the main thread stays free for the compositor.
      requestAnimationFrame(handleLuggagePick);
    };
    function handleLuggagePick() {
      if (!flagsRunning || flagsPicked || group.classList.contains('flags-faded')) return;
      flagsPicked = true;
      clearFlagsElimination();
      flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
      // Animate selected luggage toward findluggage position
      // Reset to the BASE position (no transform/transition) BEFORE measuring:
      // on iOS the entry animation left a residual transform and we measured
      // shifted → the suitcase was misplaced "sometimes". This way we always
      // measure the real base.
      group.classList.remove('luggage-enter-active');
      group.style.animation  = 'none';
      group.style.transition = 'none';
      group.style.transform  = 'none';
      group.style.transformOrigin = '0 0';
      // getBCR forces layout and commits the reset (no void offsetWidth).
      // Measures are computed here; the transition is applied on the next rAF so
      // the browser has painted transform:none before the animation starts.
      const lugImg    = group.querySelector('#flags-luggage, .flags-luggage-side');
      const lugRect   = (lugImg || group).getBoundingClientRect();
      const grpRect   = group.getBoundingClientRect();
      const findRect  = flagsTapFindRect || flagsFindLuggage.getBoundingClientRect();
      flagsTapFindRect = null;
      const lugScale  = flagsLuggageWrap.getBoundingClientRect().width / 220;
      const fit = lugRect.width ? (findRect.width / lugRect.width) : 1;
      const lugCx  = (lugRect.left + lugRect.width  / 2 - grpRect.left) / lugScale;
      const lugCy  = (lugRect.top  + lugRect.height / 2 - grpRect.top)  / lugScale;
      const findCx = (findRect.left + findRect.width  / 2 - grpRect.left) / lugScale;
      const findCy = (findRect.top  + findRect.height / 2 - grpRect.top)  / lugScale;
      let dx = findCx - fit * lugCx;
      let dy = findCy - fit * lugCy;
      group.style.willChange = 'transform';
      group.style.transformOrigin = '0 0';
      // Next frame: transform:none is already painted → the transition animates clean
      requestAnimationFrame(() => {
        group.style.transition = 'transform 0.1s linear';
        group.style.transform  = `translate3d(${dx}px, ${dy}px, 0) scale(${fit})`;
      });
      flagsMachine2.style.animationPlayState = 'paused';
      flagsMachine3.style.animationPlayState = 'paused';
      flagsMachine3b.style.animationPlayState = 'paused';
      flagsFindLuggage.style.animationPlayState = 'paused';
      setTimeout(() => {
        if (document.body.classList.contains('recording-mode')) return;
        flagsMachine2.style.animationPlayState = 'running';
        flagsMachine3.style.animationPlayState = 'running';
        flagsMachine3b.style.animationPlayState = 'running';
        // Freeze findluggage at its current paused position then whoosh -900px
        const mat = new DOMMatrix(window.getComputedStyle(flagsFindLuggage).transform);
        flagsFindLuggage.classList.remove('scrolling');
        flagsFindLuggage.style.transform = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e},${mat.f})`;
        void flagsFindLuggage.offsetWidth;
        flagsFindLuggage.style.transition = 'transform 0.15s linear';
        flagsFindLuggage.style.transform  = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e - 1000},${mat.f})`;
        // Whoosh selected group -1000px from findluggage position
        if (!document.body.classList.contains('recording-mode')) {
          group.style.transition = 'transform 0.15s linear';
          group.style.transform  = `translate3d(${dx - 1000 / lugScale}px, ${dy}px, 0) scale(${fit})`;
        }
      }, 600);
      flagsGroupIds.forEach(gid => {
        const g = document.getElementById(gid);
        if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
      });
      const correct = i === correctSlot;
      if (correct) {
        flagsStreak++;
        flagsCorrectCount++;
        flagsAnswered.add(chosen);
        flagsEasyUnlocked = true;
        flagsIsFirstRound = false;
        if (flagsCorrectCount >= 3 && !flagsSixUnlocked) {
          flagsSixUnlocked = true;
          flagsGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
        }
        if (flagsCorrectCount >= 10 && !flagsMediumUnlocked) {
          flagsMediumUnlocked = true;
        }
        if (flagsCorrectCount >= 20) flagsHardUnlocked = true;
        if (flagsCorrectCount >= 30) flagsInsaneUnlocked = true;
        flagsAdvanceDot();
        if (typeof sfxCheck   !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        if (typeof sfxAcertar !== 'undefined') { sfxAcertar.currentTime = 0; sfxPlay(sfxAcertar); }
        const badgeImg   = typeof getBadgeImg    !== 'undefined' ? getBadgeImg(flagsStreak)   : null;
        const inRowBonus = typeof getInRowBonus  !== 'undefined' ? getInRowBonus(flagsStreak) : 0;
        const pts = getFlagsRoundPoints(flagsCorrectCount);
        const elapsed = Math.max(0, (performance.now() - flagsRoundStartTime) / 1000);
        const GRACE = 0.8;
        const ratio = elapsed <= GRACE ? 1 : Math.max(0, 1 - (elapsed - GRACE) / (FLAGS_SPEED_WIN - GRACE));
        const _flagsPracticeInf = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
        const speedBonus = (!_flagsPracticeInf && ratio > 0) ? Math.round(pts * (FLAGS_SPEED_MULT - 1) * ratio) : 0;
        flagsScore += pts + speedBonus + inRowBonus;
        flagsAnimateScore();
        sortFlagsLeaderboard(flagsScore);
        // + campaignBase(): see comment in the timeout above.
        if (typeof window._specReportAnswer === 'function') window._specReportAnswer(true, Math.round(flagsScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)), { index: i, points: pts + speedBonus, speedBonus, hasBadge: !!badgeImg, inRowBonus, streak: flagsStreak, dots: flagsDots });
        if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(true, Math.round(flagsScore));
        if (typeof showScorePopup !== 'undefined') showScorePopup(pts + speedBonus);
        if (speedBonus > 0) {
          clearTimeout(flagsSpeedBonusHideId);
          flagsSpeedBonusText.classList.remove('visible');
          requestAnimationFrame(() => flagsSpeedBonusText.classList.add('visible'));
          flagsSpeedBonusHideId = setTimeout(() => flagsSpeedBonusText.classList.remove('visible'), 1600);
        }
        if (badgeImg) showFlagsBadge(badgeImg, inRowBonus, flagsStreak);
      } else {
        flagsStreak = 0;
        flagsIsFirstRound = false;
        flagsWrongCount++;
        if (typeof sfxError !== 'undefined') { sfxError.currentTime = 0; sfxPlay(sfxError); }
        // + campaignBase(): see comment in the timeout above.
        if (typeof window._specReportAnswer === 'function') window._specReportAnswer(false, Math.round(flagsScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)), { index: i });
        if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(false, Math.round(flagsScore));
        // In 1v1: effects on my own card (lobby handles it via broadcast self:true)
        if (window._vsActive) _applyWrongEffects(flagsLbElements['flags-lb-player']);
      }
      const overlay = document.getElementById(correct ? 'flags-check-overlay' : 'flags-wrong-overlay');
      if (overlay) {
        overlay.classList.remove('animate');
        void overlay.offsetWidth;
        overlay.classList.add('animate');
        setTimeout(() => {
          overlay.classList.remove('animate');
          if (!flagsRunning) return;
          // Hide all current groups
          const allGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
          const _practiceLastOne = window.practiceConfig && window.practiceConfig.active && correct && flagsPracticeRemaining.length === 1;
          if (!document.body.classList.contains('recording-mode') && !_practiceLastOne) {
            allGroupIds.forEach(gid => {
              const g = document.getElementById(gid);
              if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.transformOrigin = ''; g.style.opacity = '0'; g.style.willChange = ''; }
            });
          }
          setTimeout(() => {
            if (!flagsRunning) return;
            if (document.body.classList.contains('recording-mode')) return;
            if (window.practiceConfig && window.practiceConfig.active) {
              if (correct) {
                flagsPracticeRemaining = flagsPracticeRemaining.filter(x => x !== flagsPracticeCurrent);
                flagsPracticeCurrent = flagsPracticeRemaining.length ? flagsPracticePickNext(null) : null;
              } else if (flagsPracticeRemaining.length > 1) {
                flagsPracticeCurrent = flagsPracticePickNext(flagsPracticeCurrent);
              }
              // wrong + 1 remaining: keep flagsPracticeCurrent as-is
              // If pool exhausted, don't restore luggage visibility — let startFlagsRound end the game
              if (!flagsPracticeCurrent) {
                startFlagsRound();
                return;
              }
            }
            allGroupIds.forEach(gid => {
              const g = document.getElementById(gid);
              if (g) g.style.opacity = '';
            });
            // Hide bottom row if not yet unlocked
            if (!flagsSixUnlocked) {
              flagsBottomGroupIds.forEach(id => {
                const g = document.getElementById(id);
                if (g) g.style.display = 'none';
              });
            }
            startFlagsRound();
          }, 50);
        }, 750);
      }
    }
    group.onclick = handleLuggagePick;
  });
}

function _flagsCleanupVisuals() {
  flagsWrapper.style.display      = 'none';
  flagsMachine.style.display      = 'none';
  flagsMachine2.style.display     = 'none';
  flagsMachine3.style.display     = 'none';
  flagsMachine3b.style.display    = 'none';
  flagsMachine3.classList.remove('scrolling');
  flagsMachine3b.classList.remove('scrolling');
  flagsFindLuggage.style.display  = 'none';
  flagsFindLuggage.classList.remove('scrolling');
  flagsLuggageWrap.style.display  = 'none';
  flagsLuggageWrap.classList.remove('flags-six-mode');
  flagsFlagImg.style.display      = 'none';
  flagsFlagImg.src                = '';
  flagsFlagidWrap.style.display   = 'none';
  flagsBottomGroupIds.forEach(id => {
    const g = document.getElementById(id);
    if (g) g.style.display = 'none';
  });
}

function hideFlagsMode() {
  // Always: hide score/UI/overlays and stop timers
  flagsScoreDisplay.style.display = 'none';
  document.getElementById('flags-countdown-widget').style.display = 'none';
  flagsRightPanel.style.display   = 'none';
  mainRightPanel.style.display    = 'none';
  flagsTimeupEl.style.display     = 'none';
  if (flagsScoreRafId) { cancelAnimationFrame(flagsScoreRafId); flagsScoreRafId = null; }
  clearTimeout(flagsSpeedBonusHideId);
  flagsSpeedBonusText.classList.remove('visible');
  clearInterval(flagsTimerIntervalId);
  flagsRunning = false;
  clearFlagsElimination();

  const finalScore = Math.round(flagsScore);
  window.lastModeScore = finalScore;

  if (window._suppressGameover) { window._suppressGameover = false; _flagsCleanupVisuals(); return; }

  // ── LOBBY (group): ranking instead of the normal gameover ──
  if (window._lobbyActive && typeof window._lobbyHandleGameEnd === 'function') {
    _flagsCleanupVisuals();
    window._lobbyHandleGameEnd(finalScore);
    return;
  }
  // ── VERSUS 1v1: W/L result screen instead of the normal gameover ──
  // Keep visual assets (machines, flag, luggage) alive as background during W/L result.
  // flagsHardReset (via quitToMenu) handles cleanup when user exits.
  if (window._vsActive && typeof window._vsHandleGameEnd === 'function') {
    window._vsHandleGameEnd(finalScore);
    return;
  }

  _flagsCleanupVisuals();

  // ── PRACTICE: redirect to the panel ───────────────────────
  if (window.practiceConfig && window.practiceConfig.active) {
    window.endPracticeSession(finalScore, flagsCorrectCount, flagsWrongCount);
    return;
  }
  // ──────────────────────────────────────────────────────────

  // Log the single-player flags game for stats.
  if (window.Analytics) window.Analytics.logGame('flags', finalScore);

  const base = (typeof window.campaignBase === 'function') ? window.campaignBase() : 0;
  const finalScoreEl = document.getElementById('final-score-value');
  if (finalScoreEl) finalScoreEl.textContent = (finalScore + base).toLocaleString();

  const LS_HIGHSCORE = 'flagsHighscore';
  const prevHighscore = parseInt(localStorage.getItem(LS_HIGHSCORE) || '0', 10);
  const newHSBanner = document.getElementById('new-highscore-banner');
  const newHSScore  = document.getElementById('new-highscore-score');
  if (finalScore > prevHighscore) {
    // During an in-progress campaign it isn't persisted yet: kept as pending
    // and only committed to localStorage once the whole Gira Mundial completes
    // (see window._commitCampaignHighscores in js/core/campaign.js).
    if (window.campaign && window.campaign.active) {
      window.campaign.pendingHS.flags = finalScore;
    } else {
      localStorage.setItem(LS_HIGHSCORE, String(finalScore));
    }
    if (newHSBanner) newHSBanner.style.display = 'flex';
    if (newHSScore)  newHSScore.textContent = finalScore.toLocaleString();
  } else {
    if (newHSBanner) newHSBanner.style.display = 'none';
  }

  if (typeof window._specReportPostgame === 'function') {
    window._specReportPostgame({
      totalScore: finalScore + base,
      finalScore,
      correctCount: flagsCorrectCount,
      wrongCount: flagsWrongCount,
      isNewHighscore: finalScore > prevHighscore,
    });
  }

  if (typeof setModeCounts !== 'undefined') setModeCounts(flagsCorrectCount, flagsWrongCount);
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) {
    window.hideGameoverConfirm?.();
    gameoverScreen.style.display = 'flex';
    const label = gameoverScreen.querySelector('.gameover-text1-label');
    if (label) label.textContent = t('gameover.flags');
  }
  if (typeof restartFlightAtt !== 'undefined') restartFlightAtt();
  if (typeof buildChecksRow !== 'undefined') buildChecksRow();
  const checksEndTime = (flagsCorrectCount > 0 ? (flagsCorrectCount - 1) * 0.1 + 0.2 : 0) + 0.4;
  if (typeof buildWrongsRow !== 'undefined') buildWrongsRow(checksEndTime);
  if (typeof playMusic !== 'undefined') playMusic(sfxPostgame);
  if (window.campaign && window.campaign.active && typeof window.preloadNextModeAssets === 'function') {
    window.preloadNextModeAssets('shapes').then(() => window.showGameoverConfirm?.());
  } else {
    setTimeout(() => window.showGameoverConfirm?.(), 800);
  }
}

// ── PREGAME COUNTDOWN ─────────────────────────────────────────────────────────
let flagsPregameTimeout = null;
let flagsRoundFallbackTimeout = null;
let flagsAborted = false;

// elapsedMs (optional): how much of the 3-2-1 already passed on the REAL
// player's side — used by the spectator joining mid-count (see
// flagsSpectatorShowPregame) to start at the right number/audio, instead of
// always from "3".
function runFlagsPregame(onDone, elapsedMs) {
  flagsAborted = false;
  flagsPregameEl.style.display = 'flex';
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
    for (let i = 0; i < FLAGS_PREGAME_STEPS.length; i++) {
      const stepEnd = acc + FLAGS_PREGAME_STEPS[i].hold;
      if (elapsedMs < stepEnd) { step = i; firstStepRemaining = stepEnd - elapsedMs; break; }
      acc = stepEnd;
      step = i + 1;
    }
    if (step >= FLAGS_PREGAME_STEPS.length) { flagsPregameEl.style.display = 'none'; onDone(); return; }
  }
  if (typeof sfxCountdown !== 'undefined') {
    try { sfxCountdown.currentTime = elapsedMs > 0 ? elapsedMs / 1000 : 0; } catch (e) {}
    sfxPlay(sfxCountdown);
  }

  function showStep() {
    if (flagsAborted) return; // game abandoned during the 3-2-1
    if (step >= FLAGS_PREGAME_STEPS.length) {
      flagsPregameEl.style.display = 'none';
      onDone();
      return;
    }
    const { src, hold, size } = FLAGS_PREGAME_STEPS[step++];
    const thisHold = firstStepRemaining != null ? firstStepRemaining : hold;
    firstStepRemaining = null;
    flagsPregameImg.style.animation = 'none';
    flagsPregameImg.style.width     = size + 'cqmin';
    flagsPregameImg.style.height    = size + 'cqmin';
    flagsPregameImg.src = src;
    void flagsPregameImg.offsetWidth;
    flagsPregameImg.style.animation = '';
    flagsPregameTimeout = setTimeout(showStep, thisHold);
  }

  showStep();
}

// Stops and resets ALL of flags mode (no scoring or gameover). Used by quitToMenu.
function flagsHardReset() {
  flagsAborted = true;
  flagsRunning = false;
  flagsDots = 0;
  clearTimeout(flagsEndTimeout1); clearTimeout(flagsEndTimeout2);
  clearTimeout(flagsRoundFallbackTimeout); flagsRoundFallbackTimeout = null;
  if (flagsProgressDots) flagsProgressDots.forEach(d => d.classList.remove('filled'));
  if (flagsProgressContainer) flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
  clearTimeout(flagsPregameTimeout); flagsPregameTimeout = null;
  clearInterval(flagsTimerIntervalId);
  if (flagsScoreRafId) { cancelAnimationFrame(flagsScoreRafId); flagsScoreRafId = null; }
  clearTimeout(flagsSpeedBonusHideId);
  try { clearFlagsElimination(); } catch (e) {}
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  if (window._powerQuitOverlay) {
    // Only pause animations; keep the UI visible behind the overlay
    [flagsMachine, flagsMachine2, flagsMachine3, flagsMachine3b, flagsFindLuggage].forEach(m => {
      if (m) m.style.animationPlayState = 'paused';
    });
    // Disable suitcases: no hover or click during the game-over overlay
    disableAllLuggageGroups();
    if (flagsLuggageWrap) flagsLuggageWrap.classList.add('flags-game-ended');
    // Stop the countdown blink
    if (flagsTimerImg) flagsTimerImg.style.animationPlayState = 'paused';
  } else if (!window._vsShowingResult) {
    // Hide/stop machine, luggage, flags, overlays and countdown
    [flagsMachine, flagsMachine2, flagsMachine3, flagsMachine3b].forEach(m => {
      if (!m) return;
      m.style.display = 'none';
      m.style.animationPlayState = '';
      m.classList.remove('scrolling');
    });
    flagsFindLuggage.style.display = 'none';
    flagsFindLuggage.classList.remove('scrolling');
    flagsLuggageWrap.style.display = 'none';
    flagsLuggageWrap.classList.remove('flags-six-mode');
    flagsFlagImg.style.display = 'none'; flagsFlagImg.src = '';
    flagsFlagidWrap.style.display = 'none';
    flagsPregameEl.style.display = 'none';
    flagsTimeupEl.style.display = 'none';
    flagsSpeedBonusText.classList.remove('visible');
    ['flags-check-overlay','flags-wrong-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('animate'); el.style.display = ''; el.style.opacity = ''; }
    });
    flagsBottomGroupIds.forEach(id => { const g = document.getElementById(id); if (g) g.style.display = 'none'; });
  }
}
window.gameStoppers = window.gameStoppers || [];
window.gameStoppers.push(flagsHardReset);
window.flagsHardReset = flagsHardReset;

// ── TIMER ─────────────────────────────────────────────────────────────────────
// flagsTimeLeft is computed against flagsTimerStartedAt (Date.now()), not by
// subtracting 1 per tick — a background-throttled setInterval loses real ticks
// and a counter that subtracts 1 per tick falls behind real time; here it
// self-corrects in one step as soon as it ticks again (or the tab returns to
// the foreground), instead of dragging the lag.
function _flagsTimerTick() {
  // Defensive guard — same reason as _timerTick in js/modes/mapgame-play.js:
  // if flagsTimerIntervalId somehow wasn't cleared in time (tab long
  // minimized, etc.), a ghost tick from an already-finished round could fire
  // endFlagsGame() and the giant TIMES UP over the menu. flagsRunning is
  // already set false on finishing/leaving the real round.
  if (!flagsRunning) { clearInterval(flagsTimerIntervalId); return; }
  const _flagsInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
  if (_flagsInfinite) return;
  const elapsed = Math.floor((Date.now() - flagsTimerStartedAt) / 1000);
  flagsTimeLeft = Math.max(0, flagsTimerDuration - elapsed);
  flagsTimerEl.textContent = flagsTimeLeft;
  flagsTimerEl.classList.remove('timer-number-infinity');

  if (flagsTimeLeft <= 10) {
    flagsTimerEl.style.color = '#ffffff';
    flagsTimerImg.src = 'images/countdownred2.png';
    if (flagsTimeLeft > 0 && typeof sfxTickdown !== 'undefined') { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
  }
  if (typeof window._specReportTick === 'function') window._specReportTick(flagsTimeLeft);
  if (flagsTimeLeft <= 0) {
    clearInterval(flagsTimerIntervalId);
    flagsRunning = false;
    clearFlagsElimination();
    disableAllLuggageGroups();
    flagsLuggageWrap.classList.add('flags-game-ended');
    if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
    if (typeof window._specReportTimesUp === 'function') window._specReportTimesUp();
    endFlagsGame();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && flagsRunning && flagsTimerIntervalId) _flagsTimerTick();
});

function startFlagsTimer() {
  clearInterval(flagsTimerIntervalId); // defensive: avoids a double timer if called twice
  const _flagsInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
  flagsTimeLeft = _flagsInfinite ? 0 : (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer > 0)
    ? window.practiceConfig.timer
    : FLAGS_GAME_DURATION;
  flagsTimerDuration  = flagsTimeLeft;
  flagsTimerStartedAt = Date.now();
  flagsScore          = 0;
  flagsDisplayedScore = 0;
  flagsWrongCount     = 0;
  if (typeof setModeCounts !== 'undefined') setModeCounts(0, 0);
  flagsScoreEl.textContent = (((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
  flagsRunning  = true;
  if (_flagsInfinite) { flagsTimerEl.textContent = '∞'; flagsTimerEl.classList.add('timer-number-infinity'); }

  flagsTimerIntervalId = setInterval(_flagsTimerTick, 1000);
}

// ── GAME OVER ─────────────────────────────────────────────────────────────────
let flagsEndTimeout1 = null, flagsEndTimeout2 = null;
function endFlagsGame() {
  flagsAborted = false;
  flagsTimerImg.style.animationPlayState = 'paused';
  if (typeof playMusic !== 'undefined') playMusic(null);
  flagsTimeupEl.classList.remove('timeup-out');
  flagsTimeupEl.classList.add('timeup-in');
  flagsTimeupEl.style.display = 'flex';

  flagsEndTimeout1 = setTimeout(() => {
    if (flagsAborted) return;
    flagsTimeupEl.classList.remove('timeup-in');
    flagsTimeupEl.classList.add('timeup-out');
    flagsEndTimeout2 = setTimeout(() => { if (!flagsAborted) hideFlagsMode(); }, 400);
  }, 1800);
}

// ── START BUTTON ───────────────────────────────────────────────────────────
document.getElementById('loading-flags-btn').addEventListener('click', () => {
  window._autoDismissVsInvites?.();
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
  if (typeof window._setPlaying === 'function') window._setPlaying(true);
  window.pendingGameMode = 'flags';
  // Tell a possible spectator we entered this mode's instructions — they can
  // stay reading there as long as they like before confirming; without this
  // notice, a spectator joining during that time was stuck on "Connecting..."
  // until the real 3-2-1. Deferred to a microtask: _setPlaying(true) only
  // starts SoloSpectate in its OWN Promise.resolve().then() (to wait for
  // _vsActive/_lobbyActive to be set) — calling this in the same synchronous
  // tick would still see SoloSpectate.isActive()===false and the notice was
  // lost silently. Queuing ours AFTER (same pattern), _setPlaying's runs first.
  Promise.resolve().then(() => {
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: 'flags' });
  });
  // Reset splash state while the splash is STILL hidden (avoids skipping step2
  // and the table "rising" if we came from a previous campaign). See
  // window.resetSplashEntry.
  window.resetSplashEntry?.();
  // Immediate visual transition
  document.getElementById('loading-screen').style.display = 'none';
  const splashEl = document.getElementById('splash-screen');
  splashEl.style.display = 'flex';
  window.showSplashConfirm?.();
  const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
  void splashEl.offsetWidth;
  animEls.forEach(el => el.classList.add('animate-in'));
  if (typeof playMusic !== 'undefined') playMusic(sfxPregame);
  // Deferred non-visual setup
  requestAnimationFrame(() => {
    document.getElementById('splash-screen').classList.add('mode-flags');
    document.getElementById('splash-screen').classList.remove('mode-shapes', 'mode-monuments');
    document.getElementById('gameover-screen').classList.add('mode-flags');
    document.getElementById('gameover-screen').classList.remove('mode-shapes', 'mode-monuments');
    window.swapHowtoVideo?.('images/howtoplay/howtoplay1.mp4');
    document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men3.png');
    document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men4.png');
    document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl3.png');
    document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl4.png');
    document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women2.png');
    document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women3.png');
    document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level1complete.png');
    document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check1.png');
    document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong1.png');
    const label = document.querySelector('.splash-text2-label');
    { const _pk = (window.practiceConfig && window.practiceConfig.active) ? 'splash.practice.flags.1' : 'splash.flags.1'; if (label) { label.textContent = t(_pk); label.classList.remove('step2'); } }
    const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
    if (howtoWrap) howtoWrap.classList.remove('slide-down');
    const howtoTitle = document.querySelector('.splash-howtoplay-title');
    if (howtoTitle) howtoTitle.textContent = 'Suitcase Shuffle';
  });
});

document.getElementById('loading-flags-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
});


// Reposition the flags friends bar on zoom/resize
window.addEventListener('resize', () => {
  const rp = document.getElementById('flags-right-panel');
  if (!rp || getComputedStyle(rp).display === 'none') return;
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, false);
  requestAnimationFrame(() => {
    Object.values(flagsLbElements).forEach(el => { el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)'; });
  });
});
