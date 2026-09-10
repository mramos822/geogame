// ============================================================================
// modes/mapgame-core.js — shared core of the map modes (Cities and Monuments):
// quitToMenu + ingame power.png button, game and scoring constants, Mercator
// projection + calibration, DOM refs, map camera/zoom/drag, Image() assets, game
// state (state, highscore, gradeCounts, correctCount/wrongCount, canvas, ctx...),
// badge overlay, releaseGameMemory, buildChecksRow/buildWrongsRow.
// MUST load AFTER letterbox.js (window.STAGE_W/H, GAME_DURATION) and places.js
// (MONUMENTS).
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// End the current game (any mode) and return to the main menu without reloading.
function quitToMenu() {
  window._setPlaying(false);
  // Leaving an in-progress versus game: tell the rival (they win by abandon)
  if (window._vsActive && typeof window._vsAbandon === 'function') {
    try { window._vsAbandon(); } catch (e) {}
  }
  // Leaving an in-progress lobby game: leave the room
  if (window._lobbyActive && typeof window._lobbyAbandon === 'function') {
    try { window._lobbyAbandon(); } catch (e) {}
  }
  // Invalidate any in-flight deferred callback (nextCity, pins, badges, etc.)
  window.gameSession = (window.gameSession || 0) + 1;

  // 1) Stop loops (timers/animations) of every mode
  window.gameStoppers.forEach(fn => { try { fn(); } catch (e) {} });

  // Capture _wasInPractice BEFORE gameStoppers (in case one touches practiceConfig)
  const _wasInPractice = window.practiceConfig && window.practiceConfig.active;

  // 2) Stop ALL game audio and play the menu music
  [sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus,
   sfxTickdown, sfxTimesUp, sfxGameMusic].forEach(s => {
    try { if (s) { s.pause(); s.currentTime = 0; } } catch (e) {}
  });
  try { playMusic(sfxMenuMusic); } catch (e) {}

  // 3) Reset the monuments/cities game state
  // Disable practice BEFORE resetState so it doesn't filter the normal queues
  const _practiceScore = (() => {
    let sc = 0;
    try { sc = (typeof state !== 'undefined' && state) ? state.score : 0; } catch(e) {}
    try { if (window.pendingGameMode === 'flags'  && typeof flagsScore  !== 'undefined') sc = Math.round(flagsScore); } catch(e) {}
    try { if (window.pendingGameMode === 'shapes' && typeof shapesScore !== 'undefined') sc = Math.round(shapesScore); } catch(e) {}
    return sc;
  })();
  if (_wasInPractice) { window.practiceConfig.active = false; document.body.classList.remove('practice-mode'); }
  try { resetState(); } catch (e) {}

  // 4) Clear dialogs, overlays, animations and ingame movement
  const reset = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  reset('city-tag',         el => { el.style.left = tpx(-525); });
  reset('result-label',     el => { el.textContent = ''; el.style.animation = ''; });
  reset('coord-tooltip',    el => { el.style.display = 'none'; });
  reset('monument-img',     el => { el.style.display = 'none'; });
  reset('speed-bonus-text', el => el.classList.remove('visible'));
  reset('flags-speed-bonus-text', el => el.classList.remove('visible'));
  // Refresh friends before rebuilding the bar — same reason as flags.js:
  // without this, each friend's cardCode/avatar stayed stuck at the last time
  // the list was loaded (login or social panel), and a friend's recent card
  // change wasn't reflected for the whole session.
  if (typeof loadFriends === 'function') loadFriends();
  // Rebuild the friends bar (don't empty it: shapes/cities don't re-init it
  // per game, only reposition, so emptying it would leave it empty).
  try { initLeaderboard(); } catch (e) {}
  reset('pregame-countdown',       el => { el.style.display = 'none'; });
  reset('flags-pregame-countdown', el => { el.style.display = 'none'; });
  reset('timeup-overlay',       el => { el.style.display = 'none'; el.classList.remove('timeup-in','timeup-out'); });
  reset('flags-timeup-overlay', el => { el.style.display = 'none'; el.classList.remove('timeup-in','timeup-out'); });
  reset('powerquit-overlay',    el => { el.style.display = 'none'; el.classList.remove('timeup-in','timeup-out'); });
  reset('flags-check-overlay',  el => { el.classList.remove('animate'); el.style.display = 'none'; el.style.opacity = ''; });
  reset('flags-wrong-overlay',  el => { el.classList.remove('animate'); el.style.display = 'none'; el.style.opacity = ''; });
  // Turn off the progress dots and the "train" (all modes)
  document.querySelectorAll('.dot').forEach(d => d.classList.remove('filled'));
  ['progress-dots','flags-progress-dots'].forEach(id => {
    document.getElementById(id)?.classList.remove('train-animation', 'dots-fade-out');
  });
  // Clear the main canvas (drawn dots, pins, particles, badges)
  try { if (typeof ctx !== 'undefined' && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (e) {}

  // 5) Reset the splash dialog state (pregame)
  try { confirmStep = 0; } catch (e) {}
  document.querySelector('.splash-howtoplay-wrap')?.classList.remove('slide-down');
  const lbl = document.querySelector('.splash-text2-label');
  if (lbl) { lbl.classList.remove('step2'); lbl.textContent = ''; }
  document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap')
    .forEach(el => el.classList.remove('animate-in'));

  // 6) Stop campaign music/animations
  // Abandoned midway: discard this run's pending highscores (not persisted
  // until the whole Gira Mundial is completed).
  if (window.campaign) { window.campaign.active = false; window.campaign.pendingHS = {}; }

  // 7) Hide all game/results screens and the HUD
  ['game-wrapper','flags-wrapper','splash-screen','gameover-screen','results-screen',
   'final-screen','score-display','right-panel','flags-score-display',
   'flags-right-panel','new-highscore-banner','countdown-widget',
   'flags-countdown-widget','shapes-countdown-widget'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // 8) Show the clean main menu
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();

  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.display = _wasInPractice ? 'flex' : ''; ls.style.opacity = '1'; ls.classList.remove('table-shown'); }

  // Quitting via power from practice mode → score popup + practice panel
  if (_wasInPractice) {
    const _pm = window.pendingGameMode;
    const [_prCorrect, _prWrong] = _pm === 'flags'
      ? [(typeof flagsCorrectCount !== 'undefined' ? flagsCorrectCount : 0), (typeof flagsWrongCount !== 'undefined' ? flagsWrongCount : 0)]
      : _pm === 'shapes'
      ? [(typeof shapesCorrectCount !== 'undefined' ? shapesCorrectCount : 0), (typeof shapesWrongAnswerCount !== 'undefined' ? shapesWrongAnswerCount : 0)]
      : [correctCount || 0, wrongCount || 0];
    window.endPracticeSession(_practiceScore, _prCorrect, _prWrong);
    return;
  }
  ['loading-table-group','loading-social-group','loading-friend-group','loading-addfriend-group','loading-blocked-group','loading-sent-group']
    .forEach(id => document.getElementById(id)?.classList.add('table-gone'));
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
}
window.quitToMenu = quitToMenu;

// ── Ingame power.png (fixed top-center, like the mute button) ────────────────
// Visible only in pre/in/postgame; hidden in loading, results and final.
(() => {
  const powerEl = document.getElementById('ingame-power');
  if (!powerEl) return;
  const isVisible = id => {
    const el = document.getElementById(id);
    return el && getComputedStyle(el).display !== 'none';
  };
  const powerIconEl = document.getElementById('ingame-power-icon');
  const backIconEl  = document.getElementById('ingame-back-icon');
  const refreshIngamePower = () => {
    // lobby-result-screen: same reason as vs-result-screen (1v1) — the FINAL
    // group ranking (real or spectator mirror, see _showGroupResultMirror in
    // spectate.js) has its OWN back (#lobby-result-back, with the same
    // _isSpectating check as #vs-result-back) — the top one is redundant and
    // overlapped it (the reported "remove the top back").
    const blocked = isVisible('loading-screen') || isVisible('results-screen') || isVisible('final-screen') || isVisible('vs-result-screen') || isVisible('lobby-result-screen');
    const prepost = isVisible('splash-screen') || isVisible('gameover-screen');
    // score-display / flags-score-display are visible during any mode's game
    // (shapes adds its pieces to the body, doesn't use game-wrapper).
    // globequiz-screen NEVER takes part in this for the REAL PLAYER (it has its
    // own #gq-power-btn) — only added here when _isSpectating, for the GlobeQuiz
    // spectator, who has no other visible back (the reported "back button
    // doesn't appear": #gq-power-btn is hidden on purpose for the spectator,
    // see globequizSpectatorEnter).
    const gqSpecIngame = window._isSpectating && isVisible('globequiz-screen');
    const ingame  = prepost || isVisible('game-wrapper') || isVisible('flags-wrapper') ||
                    isVisible('score-display') || isVisible('flags-score-display') || gqSpecIngame;
    powerEl.style.display = (ingame && !blocked) ? 'block' : 'none';
    // In pre/postgame it sits a bit further right than during the game
    powerEl.style.left = prepost ? '82%' : '74%';
    // Spectating: power (end MY game) doesn't apply — replaced by a back that
    // just closes the spectator and returns to the menu.
    if (powerIconEl) powerIconEl.style.display = window._isSpectating ? 'none' : 'block';
    if (backIconEl)  backIconEl.style.display  = window._isSpectating ? 'block' : 'none';
  };
  window.refreshIngamePower = refreshIngamePower;

  // Click on power: opens the confirm tab (the game keeps running) — except in
  // spectator mode, which returns straight to the menu with no popup (no own
  // game to abandon).
  const quitPopup = document.getElementById('ingame-quit-popup');
  powerEl.addEventListener('click', () => {
    sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
    if (window._isSpectating) {
      // Same "press" flash as the rest of the game's back buttons.
      if (backIconEl) {
        backIconEl.classList.add('confirm-pressed');
        setTimeout(() => backIconEl.classList.remove('confirm-pressed'), 150);
      }
      if (typeof window.closeSpectator === 'function') window.closeSpectator();
      return;
    }
    if (quitPopup) quitPopup.style.display = 'flex';
    document.body.classList.add('quit-open');
  });
  document.getElementById('ingame-quit-cancel')?.addEventListener('click', () => {
    sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
    if (quitPopup) quitPopup.style.display = 'none';
    document.body.classList.remove('quit-open');
  });
  document.getElementById('ingame-quit-confirm')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    if (quitPopup) quitPopup.style.display = 'none';
    document.body.classList.remove('quit-open');

    // Stop timers but don't clear the screen yet (the flag stops hardReset from hiding the UI)
    window._powerQuitOverlay = true;
    window.gameStoppers.forEach(fn => { try { fn(); } catch(e) {} });
    window._powerQuitOverlay = false;

    // In pregame (splash visible) or outside practice: exit directly, no overlay
    const inPregame = isVisible('splash-screen') ||
                      isVisible('flags-pregame-countdown') ||
                      isVisible('pregame-countdown') ||
                      ((isVisible('score-display') || isVisible('flags-score-display')) && sfxGameMusic.paused);
    const inPractice = window.practiceConfig && window.practiceConfig.active;
    const goOverlay = document.getElementById('powerquit-overlay');
    if (!goOverlay || inPregame || !inPractice) { quitToMenu(); return; }

    sfxGameMusic.pause();
    sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp);
    goOverlay.style.display = 'flex';
    goOverlay.classList.remove('timeup-out');
    goOverlay.classList.add('timeup-in');

    setTimeout(() => {
      goOverlay.classList.remove('timeup-in');
      goOverlay.classList.add('timeup-out');
      setTimeout(() => {
        goOverlay.style.display = 'none';
        goOverlay.classList.remove('timeup-out');
        quitToMenu();
      }, 400);
    }, 1800);
  });
  // React to any display change (screens are toggled via inline style)
  const obs = new MutationObserver(refreshIngamePower);
  ['loading-screen','splash-screen','game-wrapper','flags-wrapper',
   'gameover-screen','results-screen','final-screen','score-display',
   'flags-score-display','vs-result-screen','globequiz-screen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['style'] });
  });
  refreshIngamePower();

  // Escape = back/power. Priority order: quit popup → nested panels → power.
  const _hasClass = (id, cls) => { const el = document.getElementById(id); return el && el.classList.contains(cls); };
  const _clickBack = (id) => { document.getElementById(id)?.click(); };
  const _panelVisible = (id) => !_hasClass(id, 'table-gone');
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const active = document.activeElement;
    const tag = active && active.tagName;
    if (tag === 'TEXTAREA') return;
    if (tag === 'INPUT' && active.type !== 'range') return;
    if (tag === 'INPUT' && active.type === 'range') active.blur();
    const _closeOpenModal = () => {
      const acct = document.getElementById('account-modal');
      if (acct && acct.classList.contains('open')) {
        const closeBtn = document.getElementById('account-modal-close');
        if (closeBtn && getComputedStyle(closeBtn).display !== 'none') { closeBtn.click(); return true; }
        // If the button is hidden (noCloseViews) do nothing
        return true;
      }
      const lock = document.getElementById('social-lock-popup');
      if (lock && lock.classList.contains('open')) { document.getElementById('social-lock-close')?.click(); return true; }
      return false;
    };
    const gqQuitPopup = document.getElementById('gq-quit-popup');
    const _modeSelPop = document.getElementById('vs-mode-select-popup');
    if (_modeSelPop && _modeSelPop.style.display !== 'none') {
      sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
      _modeSelPop.style.display = 'none';
    } else if (gqQuitPopup && gqQuitPopup.style.display === 'flex') {
      _clickBack('gq-quit-cancel');
    } else if (document.getElementById('globequiz-screen')?.style.display === 'block') {
      _clickBack('gq-power-btn');
    } else if (quitPopup && quitPopup.style.display === 'flex') {
      sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
      quitPopup.style.display = 'none';
      document.body.classList.remove('quit-open');
    } else if (_panelVisible('loading-customize-group')) {
      // Customize opens AS a SUB-panel of the profile modal (see
      // loading-customize-btn) — without this check, _closeOpenModal() below
      // closed the whole profile modal directly and skipped this step.
      _clickBack('customize-back-wrap');
    } else if (_closeOpenModal()) {
      // account modal closed
    } else if (_panelVisible('loading-friend-group'))    { _clickBack('loading-friend-back-wrap'); }
    else if (_hasClass('chat-conversation-modal', 'open')) { _clickBack('loading-chat-back'); }
    else if (_panelVisible('loading-addfriend-group'))   { _clickBack('loading-addfriend-back-wrap'); }
    else if (_panelVisible('loading-blocked-group'))     { _clickBack('loading-blocked-back-wrap'); }
    else if (_panelVisible('loading-sent-group'))        { _clickBack('loading-sent-back-wrap'); }
    else if (_panelVisible('loading-rankings-group'))    { _clickBack('loading-rankings-back-wrap'); }
    else if (_panelVisible('loading-social-group'))      { _clickBack('loading-social-back-wrap'); }
    else if (_hasClass('chat-inbox-modal', 'open'))      { _clickBack('chat-inbox-close'); }
    else if (_panelVisible('loading-table-group')) {
      const sub = document.getElementById('loading-panel2-back');
      if (sub && sub.style.display !== 'none') _clickBack('loading-panel2-back');
      else _clickBack('loading-play-confirm-wrap');
    }
    else if (_panelVisible('loading-versus-group'))      { _clickBack('versus-back-wrap'); }
    else if (document.getElementById('loading-practice-group')?.style.display !== 'none') { _clickBack('practice-back-wrap'); }
    else if (powerEl.style.display !== 'none')           { powerEl.click(); }
  });
})();

// ranks.js loads after this file; wait until everything is ready so getRank()
// exists when painting each friend's rank.
window.addEventListener('load', () => renderSocial());
// Like initLeaderboard below: a network event can arrive at any time, even
// mid-game/mid campaign-transition. This used to rebuild the WHOLE friends list
// (with its Founder cards/cells) even with the panel closed — pointless work in
// bulk on top of the transition. If the panel isn't open there's nothing
// visible to update: skip it, and renderSocial() is already called on panel
// open (see loading-social-btn).
if (typeof onFriendsUpdate === 'function') onFriendsUpdate(() => {
  const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
  if (panelOpen) renderSocial();
});

// ── CONFIG ──────────────────────────────────────────────────────────────────
const GAME_DURATION   = window.GAME_DURATION;
const BONUS_TIME      = 5;
const DOTS_NEEDED     = 10;
const SPEED_BONUS_WIN = 3;

// Pixel thresholds on the DISPLAYED canvas. Base +1 on perfect for everyone;
// mobile gets extra leeway on every grade (fat-finger taps vs. mouse clicks):
// perfect +3, good +5, fair +7.
const PERFECT_PX = 6  + (IS_MOBILE ? 3 : 0);
const GOOD_PX    = 20 + (IS_MOBILE ? 5 : 0);
const FAIR_PX    = 45 + (IS_MOBILE ? 7 : 0);

const LABEL_MAP = { perfect: 'Perfecto', good: 'Bien', fair: 'Regular', wayoff: 'Muy lejos' };

// ── CITIES SCORING (new system faithful to the old game) ─────────────────────
const CITIES_SCORE_MAP  = { perfect: 36, good: 24, fair: 20, wayoff: 0 };
const CITIES_SPEED_MULT = 1.5;
const CITIES_M_TABLE = [
  [0, 1], [1, 1.5], [2, 2.5], [4, 4], [7, 5], [10, 6],
  [13, 7.5], [18, 9], [22, 11], [25, 13], [31, 15], [35, 19],
];
function getCitiesM(n) {
  let M = 1;
  for (const [min, m] of CITIES_M_TABLE) { if (n >= min) M = m; }
  return M;
}

// ── MONUMENTS SCORING (same mechanism as Cities, reverse-engineered from video:
// perfect and good always give the same score; fair sits at the reference old
// system's good/perfect ratio, 2/3). The M jumps happen at the SAME thresholds
// as CITIES_M_TABLE (counted round by round against the video, not every 10
// correct), but the sample never rose above M=11 despite passing 40 correct —
// so the table stops there and doesn't continue to 13/15/19 like Cities.
const MONUMENTS_SCORE_MAP  = { perfect: 30, good: 30, fair: 20, wayoff: 0 };
const MONUMENTS_SPEED_MULT = 1.5;
const MONUMENTS_M_TABLE = CITIES_M_TABLE.slice(0, 9); // up to [22, 11] inclusive
function getMonumentsM(n) {
  let M = 1;
  for (const [min, m] of MONUMENTS_M_TABLE) { if (n >= min) M = m; }
  return M;
}

// ── MAP CALIBRATION ──────────────────────────────────────────────────────────
// Mercator projection — calibrated with 4 reference cities
const MAP_LON_LEFT = -141.2;
const MAP_LON_RIGHT =  181.5;
const MAP_LAT_TOP  =   78.2;
const MAP_LAT_BOT  =  -59.7;

function mercatorY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
}
const MERC_TOP = mercatorY(MAP_LAT_TOP);
const MERC_BOT = mercatorY(MAP_LAT_BOT);

const MAP_ASPECT = 2380 / 1759;
const _pad = 24;
const _scale = 0.88;
const DISPLAY_W = Math.min(
  Math.floor((window.STAGE_W  - _pad * 2) * _scale),
  Math.floor((window.STAGE_H - _pad * 2) * MAP_ASPECT * _scale)
);
const DISPLAY_H = Math.round(DISPLAY_W / MAP_ASPECT);

// The sign (tag3.png), the photo (photo.png) and the monument image were in
// fixed px, but the canvas/map is DISPLAY_W (varies by screen). On small
// screens (iOS landscape) those px were huge relative to the map. We scale
// their geometry proportional to DISPLAY_W, clamped to 1 so on desktop it's
// identical to before and only shrinks on small screens.
// 1190 ≈ DISPLAY_W of a typical desktop; the 1.15 factor enlarges the sign/photo
// 15% on all screens (they looked a bit small on PC) while keeping the
// responsive proportion on small screens.
const TAG_SCALE = 1.15 * Math.min(1, DISPLAY_W / 1190);
const tpx = v => Math.round(v * TAG_SCALE) + 'px';

const PIN_W = 48, PIN_H = 48;

// Fraction (0–1) within the image where the needle tip sits
const PIN1_TIP = { x: 0.18, y: 0.90 }; // red  — needle exits lower-left
const PIN2_TIP = { x: 0.80, y: 0.88 }; // green — needle exits lower-right

// ── DOM ──────────────────────────────────────────────────────────────────────
const splashScreen   = document.getElementById('splash-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const gameWrapper    = document.getElementById('game-wrapper');
const timeupOverlay  = document.getElementById('timeup-overlay');
const canvas         = document.getElementById('game-canvas');
const ctx            = canvas.getContext('2d');
const cityTagEl      = document.getElementById('city-tag');
const cityTagText    = document.getElementById('city-tag-text');
const monumentImgEl  = document.getElementById('monument-img');
const monumentNameEl = document.getElementById('monument-name');

// Apply the sign/photo/monument geometry scaled to DISPLAY_W (see TAG_SCALE).
// Runs once; clones (ghosts) inherit these inline styles.
(function applyTagScale() {
  cityTagEl.style.width      = tpx(525);
  cityTagEl.style.height     = tpx(163);
  cityTagText.style.fontSize = tpx(26);
  monumentNameEl.style.top      = tpx(238);
  monumentNameEl.style.left     = tpx(87);
  monumentNameEl.style.width    = tpx(282);
  monumentNameEl.style.fontSize = tpx(18);
  monumentImgEl.style.width  = tpx(282);
  monumentImgEl.style.height = tpx(180);
  monumentImgEl.style.top    = tpx(51);
  monumentImgEl.style.left   = tpx(87);
})();

// ── MAP ZOOM + DRAG (scroll / drag) ─────────────────────────────────────────
// Cities/Monuments share this canvas — the wheel zooms ONLY the map background
// up to 2x, for more precise clicking, without enlarging the dots/names/pins
// (they must read the same size at any zoom). So "zoom" is NOT a CSS transform
// of the canvas: it's a logical camera (mapCamera) that crops a portion of the
// map when drawing it (smaller the more zoom), while dots/pins/etc. draw at
// their SCREEN position (worldToScreen) but at their usual, unscaled size. With
// zoom > 1 the map can also be dragged (click and move) to pan the part that
// doesn't fit on screen.
const MAP_ZOOM_MIN  = 1;
const MAP_ZOOM_MAX  = 2;
const MAP_ZOOM_STEP = 0.08;
let mapCamera = { zoom: 1, x: 0, y: 0 };

// World coordinate (same as latLonToCanvas/state.placedDots use) → current screen pixel.
function worldToScreen(wx, wy) {
  return { x: (wx - mapCamera.x) * mapCamera.zoom, y: (wy - mapCamera.y) * mapCamera.zoom };
}
// Inverse: screen pixel (what the click already gives, via canvas.getBoundingClientRect) → world.
function screenToWorld(sx, sy) {
  return { x: sx / mapCamera.zoom + mapCamera.x, y: sy / mapCamera.zoom + mapCamera.y };
}

// Clamp camera.x/y so the view never shows anything outside the map.
function clampMapCamera() {
  const vw = DISPLAY_W / mapCamera.zoom;
  const vh = DISPLAY_H / mapCamera.zoom;
  mapCamera.x = Math.min(Math.max(mapCamera.x, 0), Math.max(0, DISPLAY_W - vw));
  mapCamera.y = Math.min(Math.max(mapCamera.y, 0), Math.max(0, DISPLAY_H - vh));
}

function resetMapZoom() {
  mapCamera.zoom = 1;
  mapCamera.x = 0;
  mapCamera.y = 0;
  _mapDrag = null;
  _mapJustDragged = false;
  canvas.style.cursor = 'crosshair';
  if (state) state.mapDrawn = false; // force a redraw even if the loop is "idle"
}

// Cursor/touch position in SCREEN pixels (canvas space).
function _canvasScreenPos(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

// Direct zoom, no animation: each 'wheel' event moves mapCamera.zoom/x/y
// immediately, already clamped, adjusting the camera so the world point under
// the cursor stays fixed (zoom "toward the mouse"). Being synchronous (no
// requestAnimationFrame in between), each event starts from the last real
// value, so wheel bursts (mouse/trackpad) accumulate fine without tracking a
// separate "target".
function _stepMapZoom(zoomDelta, screenX, screenY) {
  const nextZoom = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, mapCamera.zoom + zoomDelta));
  if (nextZoom === mapCamera.zoom) return;

  const worldPt = screenToWorld(screenX, screenY); // world point under the cursor, at the current zoom
  const vw = DISPLAY_W / nextZoom, vh = DISPLAY_H / nextZoom;
  mapCamera.zoom = nextZoom;
  mapCamera.x = Math.min(Math.max(worldPt.x - screenX / nextZoom, 0), Math.max(0, DISPLAY_W - vw));
  mapCamera.y = Math.min(Math.max(worldPt.y - screenY / nextZoom, 0), Math.max(0, DISPLAY_H - vh));
  if (state) state.mapDrawn = false;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { x: screenX, y: screenY } = _canvasScreenPos(e);
  // Normalized: a mouse-wheel "click" is around deltaY=±100; a trackpad sends
  // small continuous deltas. Clamped so no single event makes an abrupt zoom
  // jump, whatever the device.
  const norm = Math.max(-2, Math.min(2, e.deltaY / 100));
  _stepMapZoom(-norm * MAP_ZOOM_STEP, screenX, screenY);
}, { passive: false });

// ── Map drag with zoom > 1 ──────────────────────────────────────────────────
// DRAG_THRESHOLD: if the pointer moved more than this between pointerdown and
// pointerup, it's treated as a drag and the following 'click' does NOT count as
// a guess (otherwise any drag would also drop a pin).
const MAP_DRAG_THRESHOLD = 6;
let _mapDrag = null; // { startScreenX, startScreenY, startCamX, startCamY, dragged }

canvas.addEventListener('pointerdown', (e) => {
  if (mapCamera.zoom <= 1 || e.button !== 0) return;
  const pos = _canvasScreenPos(e);
  _mapDrag = {
    startScreenX: pos.x, startScreenY: pos.y,
    startClientX: e.clientX, startClientY: e.clientY,
    startCamX: mapCamera.x, startCamY: mapCamera.y, dragged: false,
  };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!_mapDrag) return;
  const pos = _canvasScreenPos(e);
  const dx = pos.x - _mapDrag.startScreenX;
  const dy = pos.y - _mapDrag.startScreenY;
  if (!_mapDrag.dragged) {
    // The threshold is measured in real SCREEN pixels (clientX/Y), not the
    // canvas's internal space (pos, in DISPLAY_W/H units): on screens smaller
    // than the reference stage (1920×911, see letterbox.js) that internal space
    // is scaled up, so a couple of real px of mouse jitter on click already
    // exceeded the threshold in canvas units and triggered "drag" instead of
    // registering the guess click.
    const clientDx = e.clientX - _mapDrag.startClientX;
    const clientDy = e.clientY - _mapDrag.startClientY;
    if (Math.hypot(clientDx, clientDy) > MAP_DRAG_THRESHOLD) {
      _mapDrag.dragged = true;
      canvas.style.cursor = 'grabbing';
    }
  }
  if (!_mapDrag.dragged) return;
  mapCamera.x = _mapDrag.startCamX - dx / mapCamera.zoom;
  mapCamera.y = _mapDrag.startCamY - dy / mapCamera.zoom;
  clampMapCamera();
  if (state) state.mapDrawn = false;
});

// Set by _endMapDrag when the gesture was a real drag — the 'click' handler
// (which fires anyway on release, moved or not) checks it so a plain map pan
// doesn't drop a guess pin at the end.
let _mapJustDragged = false;

function _endMapDrag(e) {
  if (!_mapDrag) return;
  if (_mapDrag.dragged) _mapJustDragged = true;
  if (e && e.pointerId !== undefined) { try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
  canvas.style.cursor = 'crosshair';
  _mapDrag = null;
}
canvas.addEventListener('pointerup', _endMapDrag);
canvas.addEventListener('pointercancel', _endMapDrag);

const timerNumberEl  = document.getElementById('timer-number');
const countdownImg   = document.querySelector('#countdown-widget img');
const progressDots   = document.querySelectorAll('.dot');
const scoreValueEl   = document.getElementById('score-value');
const speedBonusText = document.getElementById('speed-bonus-text');
const resultLabel    = document.getElementById('result-label');
const finalScoreEl   = document.getElementById('final-score-value');
const highscoreEl        = document.getElementById('highscore-value');
const splashHighscoreEl  = document.getElementById('splash-highscore-value');
const newHighscoreBanner = document.getElementById('new-highscore-banner');
const newHighscoreScore  = document.getElementById('new-highscore-score');
const btnStart          = document.getElementById('btn-start');
const progressContainer = document.getElementById('progress-dots');
const scoreDisplayEl    = document.getElementById('score-display');
const lbBestScoreEl     = document.getElementById('lb-best-score');

canvas.width  = DISPLAY_W;
canvas.height = DISPLAY_H;

const badgeOverlay    = document.createElement('canvas');
badgeOverlay.width    = DISPLAY_W;
badgeOverlay.height   = DISPLAY_H;
badgeOverlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:25;';
const badgeOverlayCtx = badgeOverlay.getContext('2d');
gameWrapper.appendChild(badgeOverlay);

// Proactively free game memory: release decoded bitmaps of
// backgrounds/characters/ranks (by setting src=''), shrink the canvases to 1px
// and free the howtoplay video. Called on return to the menu (and can be called
// between modes) so the app does NOT accumulate RAM across a campaign or between
// sessions — keeping the baseline flat with no page reload needed. Images re-set
// themselves when the next mode starts (handlers assign their src), so clearing
// here is safe: the menu doesn't use these game <img>s.
window.releaseGameMemory = function (opts) {
  try {
    // opts.keepBitmaps: only free the GPU-heavy surfaces (canvas pixel buffers +
    // howtoplay video decoder) and leave the decoded <img> bitmaps in place.
    // Used between campaign modes, where the next handler re-assigns the <img>
    // srcs a frame later and blanking them here would flash.
    if (!opts || !opts.keepBitmaps) {
      // Backgrounds, characters, check/wrong, skies, monument, country flags.
      // NOTE: don't include .game-bg-sky-monuments — no handler re-assigns the
      // monuments sky, so clearing it leaves it blank on mode entry.
      document.querySelectorAll(
        '.game-bg-city, .game-bg-men1, .game-bg-men2, .game-bg-girl1, .game-bg-girl2, ' +
        '.game-bg-women1, .game-bg-women2, .game-bg-check3, .game-bg-wrong3, #monument-img'
      ).forEach(el => { if (el && el.tagName === 'IMG') el.removeAttribute('src'); });
    }
    // Do NOT clear #results-screen / #final-screen img: their src are in the
    // HTML and aren't re-assigned on show, so clearing them left results/final
    // blank (no images, no confirm button). The ranks are small, not worth
    // breaking that.
    // Canvas: free the pixel buffer (GPU+CPU) by shrinking to 1px.
    if (typeof canvas !== 'undefined' && canvas) { canvas.width = 1; canvas.height = 1; }
    if (badgeOverlay) { badgeOverlay.width = 1; badgeOverlay.height = 1; }
    const fbc = document.getElementById('flags-badge-canvas');
    if (fbc) { fbc.width = 1; fbc.height = 1; }
    // Howtoplay video: free decoder/buffers.
    const v = document.querySelector('.splash-howtoplay-video');
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }
  } catch (e) {}
};

// ── ASSETS ───────────────────────────────────────────────────────────────────
const MONUMENTS_EASY_NAMES = [
  "Torre Eiffel", "Estatua de la Libertad", "Taj Mahal", "Pirámides de Giza",
  "Coliseo Romano", "Gran Muralla China", "Machu Picchu", "Cristo Redentor",
  "Sagrada Família", "Stonehenge", "Big Ben", "Chichén Itzá",
];
const MONUMENTS_EASY = MONUMENTS.filter(m => MONUMENTS_EASY_NAMES.includes(m.name));

const imgMap   = new Image(); imgMap.src   = 'images/mapimage.png';
const imgMap2  = new Image(); imgMap2.src  = 'images/mapimage2.png';
const imgFlag  = new Image(); imgFlag.src  = 'images/flag.png';
const imgPin1 = new Image(); imgPin1.src = 'images/pin1.png';
const imgPin2 = new Image(); imgPin2.src = 'images/pin2.png';
const imgStar  = new Image(); imgStar.src  = 'images/stareffect.png';
const imgCheck       = new Image(); imgCheck.src = 'images/check.png';

// Badges loaded lazily — not needed until the gameover
const imgBadgeGold   = new Image();
const imgBadgeGreen  = new Image();
const imgBadgeRed    = new Image();
const imgBadgeBlue   = new Image();
const imgBadgeGarnet = new Image();
const imgBadgeYellow = new Image();
const imgBadgeSilver = new Image();

function loadBadges() {
  imgBadgeGold.src   = 'images/badges/goldbadge.png';
  imgBadgeGreen.src  = 'images/badges/greenbadge.png';
  imgBadgeRed.src    = 'images/badges/redbadge.png';
  imgBadgeBlue.src   = 'images/badges/bluebadge.png';
  imgBadgeGarnet.src = 'images/badges/garnetbadge.png';
  imgBadgeYellow.src = 'images/badges/yellowbadge.png';
  imgBadgeSilver.src = 'images/badges/silverbadge.png';
}

// ── STATE ────────────────────────────────────────────────────────────────────
let state          = null;
let animFrameId    = null;
let timerIntervalId = null;
let speedBonusHideId = null;
let gameAborted = false;
let mapGameOver = false;

let highscore = parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10);
let monumentsHighscore = parseInt(localStorage.getItem('monumentsHighscore') || '0', 10);
highscoreEl.textContent = highscore.toLocaleString();

function updateSplashHighscore() {
  if (splashHighscoreEl) {
    splashHighscoreEl.textContent = highscore > 0 ? highscore.toLocaleString() : '—';
  }
}
updateSplashHighscore();

// ── GRADE COUNTS ─────────────────────────────────────────────────────────────
let gradeCounts = { perfect: 0, good: 0, fair: 0 };
let wrongCount = 0;
let correctCount = 0;
// Round counter for the Cities spectator — correctCount isn't a unique round
// identity (only increments on hits, so two DIFFERENT cities after a
// consecutive miss would share the same value).
let _citiesSpecRoundIdx = 0;
let _monumentsSpecRoundIdx = 0;

function setModeCounts(correct, wrong) {
  gradeCounts = { perfect: correct, good: 0, fair: 0 };
  wrongCount = wrong;
  updateGradeCountsUI();
  updateWrongCountUI();
}

function updateWrongCountUI() {
  ['splash-wrong-total', 'gameover-wrong-total'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = wrongCount;
  });
}

function saveGradeCount(grade) {
  if (grade === 'perfect' || grade === 'good' || grade === 'fair') {
    gradeCounts[grade]++;
    updateGradeCountsUI();
  } else if (grade === 'wayoff') {
    wrongCount++;
    updateWrongCountUI();
  }
}

function updateGradeCountsUI() {
  const total = gradeCounts.perfect + gradeCounts.good + gradeCounts.fair;
  ['splash-count-total', 'gameover-count-total'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = total;
  });
}
updateGradeCountsUI();
updateWrongCountUI();

function getModeCheckImg() {
  if (window.pendingGameMode === 'flags')     return 'images/check1.png';
  if (window.pendingGameMode === 'shapes')    return 'images/check2.png';
  if (window.pendingGameMode === 'monuments') return 'images/check4.png';
  return 'images/check3.png';
}
function getModeWrongImg() {
  if (window.pendingGameMode === 'flags')     return 'images/wrong1.png';
  if (window.pendingGameMode === 'shapes')    return 'images/wrong2.png';
  if (window.pendingGameMode === 'monuments') return 'images/wrong4.png';
  return 'images/wrong3.png';
}

function buildChecksRow() {
  const row = document.getElementById('gameover-checks-row');
  if (!row) return;
  row.innerHTML = '';
  const total = gradeCounts.perfect + gradeCounts.good + gradeCounts.fair;
  const IMG_W = 6.4;   // vmin (matches .checks-row/.wrongs-row img)
  const BASE_GAP = 0.33; // vmin
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = total > 1 ? (total > 12 ? (MAX_W - total * IMG_W) / (total - 1) : BASE_GAP) : 0;
  if (total === 0) {
    const none = document.createElement('span');
    none.textContent = t('profile.none');
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:0.77cqmin #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:4.5cqmin;font-weight:bold;position:relative;left:2.2cqmin;';
    row.appendChild(none);
    return;
  }

  row.style.gap = '0px';
  for (let i = 0; i < total; i++) {
    const img = document.createElement('img');
    img.src = getModeCheckImg();
    img.alt = '';
    img.style.animationDelay = `${i * 0.1}s`;
    img.style.zIndex = 16 + i;
    if (i < total - 1) img.style.marginRight = `${gap}cqmin`;
    row.appendChild(img);
  }

  const check3Static   = gameoverScreen.querySelector('.game-bg-check3');
  const gradeCountEl   = gameoverScreen.querySelector('.grade-count-total');
  if (check3Static)  check3Static.style.opacity  = '0';
  if (gradeCountEl)  gradeCountEl.style.opacity   = '0';

  const revealDelay = (total > 0 ? (total - 1) * 0.1 + 0.2 : 0) + 0.2;
  setTimeout(() => {
    if (check3Static)  check3Static.style.opacity  = '1';
    if (gradeCountEl)  gradeCountEl.style.opacity   = '1';
  }, revealDelay * 1000);
}

function buildWrongsRow(startOffset = 0) {
  const row = document.getElementById('gameover-wrongs-row');
  if (!row) return;
  row.innerHTML = '';
  const total = wrongCount;
  const IMG_W = 6.4;   // vmin (matches .checks-row/.wrongs-row img)
  const BASE_GAP = 0.33; // vmin
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = total > 1 ? (total > 12 ? (MAX_W - total * IMG_W) / (total - 1) : BASE_GAP) : 0;

  if (total === 0) {
    const none = document.createElement('span');
    none.textContent = t('profile.none');
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:0.77cqmin #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:4.5cqmin;font-weight:bold;position:relative;left:2.2cqmin;opacity:0;';
    row.appendChild(none);
    const w3s = gameoverScreen.querySelector('.game-bg-wrong3');
    const wce = gameoverScreen.querySelector('.wrong-count-total');
    if (w3s) w3s.style.opacity = '0';
    if (wce) wce.style.opacity = '0';
    setTimeout(() => {
      none.style.opacity = '1';
      if (w3s) w3s.style.opacity = '1';
      if (wce) wce.style.opacity = '1';
    }, startOffset * 1000);
    return;
  }

  row.style.gap = '0px';
  for (let i = 0; i < total; i++) {
    const img = document.createElement('img');
    img.src = getModeWrongImg();
    img.alt = '';
    img.style.animationDelay = `${startOffset + i * 0.1}s`;
    img.style.zIndex = 16 + i;
    if (i < total - 1) img.style.marginRight = `${gap}cqmin`;
    row.appendChild(img);
  }

  const wrong3Static   = gameoverScreen.querySelector('.game-bg-wrong3');
  const wrongCountEl   = gameoverScreen.querySelector('.wrong-count-total');
  const wrongTotalEl   = document.getElementById('gameover-wrong-total');
  if (wrongTotalEl) wrongTotalEl.textContent = total;
  const splashWrongEl = document.getElementById('splash-wrong-total');
  if (splashWrongEl) splashWrongEl.textContent = total;
  if (wrong3Static)  wrong3Static.style.opacity  = '0';
  if (wrongCountEl)  wrongCountEl.style.opacity   = '0';
  const revealDelay = startOffset + (total > 0 ? (total - 1) * 0.1 + 0.2 : 0) + 0.2;
  setTimeout(() => {
    if (wrong3Static)  wrong3Static.style.opacity  = '1';
    if (wrongCountEl)  wrongCountEl.style.opacity   = '1';
  }, revealDelay * 1000);
}

