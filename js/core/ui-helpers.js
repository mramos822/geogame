// ============================================================================
// core/ui-helpers.js — UI helpers reusable from any screen: splash/gameover
// confirms, howtoplay video (swapHowtoVideo), resetSplashEntry, hideIngameHud,
// nudgeRepaint (Opera workaround), showGlobalToast.
// Uses IS_MOBILE / IS_CHROME_IOS (core/audio.js) and confirmStep
// (modes/mapgame-misc.js, read at runtime under try/catch).
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// Show/hide the gameover confirm (revealed after next mode's assets load).
window.showGameoverConfirm = function () {
  const w = document.querySelector('.gameover-confirm-wrap');
  if (w) w.classList.add('confirm-ready');
};
window.hideGameoverConfirm = function () {
  const w = document.querySelector('.gameover-confirm-wrap');
  if (w) w.classList.remove('confirm-ready');
};

// Show/hide the pre-game splash confirm.
window.showSplashConfirm = function () {
  const w = document.querySelector('.splash-confirm-wrap');
  if (w) w.classList.add('confirm-ready');
};
window.hideSplashConfirm = function () {
  const w = document.querySelector('.splash-confirm-wrap');
  if (w) w.classList.remove('confirm-ready');
};

// Hide the splash confirm, reveal it once the howtoplay video can play.
window.waitForHowtoVideo = function () {
  window.hideSplashConfirm();
  const v = document.querySelector('.splash-howtoplay-video');
  // Chrome-iOS never plays the video (static poster), so don't wait for load
  // events that will never fire.
  if (!v || v.readyState >= 3 || IS_CHROME_IOS) { window.showSplashConfirm(); return; }
  let done = false;
  const reveal = () => { if (!done) { done = true; window.showSplashConfirm(); } };
  v.addEventListener('canplaythrough', reveal, { once: true });
  v.addEventListener('loadeddata',     reveal, { once: true });
  v.addEventListener('error',          reveal, { once: true });
  setTimeout(reveal, 5000); // safety fallback
};

// Swap the howtoplay video. On mobile, RECREATE the whole element (don't reuse
// the same <video> with src+load): a real crash log showed the flags→shapes
// swap is literally the last thing to run before the iOS crash — WebKit doesn't
// reliably free the previous video's decoder/IOSurface when its src is
// overwritten while still mounted. Confirmed and fixed this way in the original
// 1.64 investigation; reverted to a simple swap in the 1.71 cleanup assuming it
// was no longer needed — it is. See project_ios_crash_investigation.
window.swapHowtoVideo = function (newSrc) {
  const old = document.querySelector('.splash-howtoplay-video');
  if (!old) return;
  if (!IS_MOBILE) {
    try { old.src = newSrc; old.load(); } catch (e) {}
    return;
  }
  try {
    old.pause();
    old.removeAttribute('src');
    old.load();
    const fresh = document.createElement('video');
    fresh.className = old.className;
    fresh.loop = true;
    fresh.muted = true;
    fresh.setAttribute('playsinline', '');
    fresh.setAttribute('preload', 'none');
    // Chrome-iOS never calls .play() on this element, so without a poster it
    // would render blank instead of the animated tutorial.
    if (IS_CHROME_IOS) fresh.poster = newSrc.replace(/howtoplay(\d)\.mp4$/, 'howtoplay$1-poster.jpg');
    old.replaceWith(fresh);
    fresh.src = newSrc;
    // No fresh.load() here — the crash log showed it still crashes at the same
    // point even when recreating the element, so also defer the decode: with
    // preload="none" nothing is downloaded/decoded until playback is actually
    // requested, which happens on the second splash tap (confirmStep 0→1,
    // howtoVideo.play() below) — well separated from the synchronous mode
    // transition burst.
  } catch (e) {}
};

// Reset splash state when ENTERING a mode (before showing it). Needed because
// after a campaign (results/final) confirmStep is left at 1 and the howtoplay
// table slide-down; without this the next game skips step2 and the table
// visibly "rises". Called while the splash is still display:none so removing
// slide-down doesn't trigger the transition animation.
window.resetSplashEntry = function () {
  try { confirmStep = 0; } catch (e) {}
  const w = document.querySelector('.splash-howtoplay-wrap');
  if (w) w.classList.remove('slide-down');
  const l = document.querySelector('.splash-text2-label');
  if (l) l.classList.remove('step2');
  // Hide any ingame HUD left visible from a previous game (mainly the
  // friends/leaderboard panel after a Versus or lobby); otherwise it bleeds
  // over the splash/pre and never disappears.
  if (typeof window.hideIngameHud === 'function') window.hideIngameHud();
};

// Hide ALL game HUD (score, countdown, friends/leaderboard panel for both mode
// sets). Reused from splash entry and VS teardowns.
window.hideIngameHud = function () {
  ['right-panel','flags-right-panel','score-display','flags-score-display',
   'countdown-widget','flags-countdown-widget','shapes-countdown-widget',
   'speed-bonus-text','flags-speed-bonus-text'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
};

// Force the compositor to present a fresh frame of the scaled stage. In Opera
// (Chromium) the screen can FREEZE when the countdown starts: the main thread
// stays alive but the compositor stops presenting until the user moves the
// window. Re-applying the transform with a visually identical translateZ(0)
// commits a new GPU layer and unblocks rendering. Harmless in Chrome/Edge/Firefox.
window.nudgeRepaint = function () {
  const root = document.documentElement;
  // Toggle --app-nudge (imperceptible translateZ in the stage transform):
  // commits a new GPU layer and unblocks Opera's frozen render without
  // touching the centering/scale managed by letterbox.js.
  root.style.setProperty('--app-nudge', '0.01px');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { root.style.setProperty('--app-nudge', '0px'); });
  });
};

// Global toast: visible from any screen (position:fixed on body).
window.showGlobalToast = function(msg) {
  const item = document.createElement('div');
  item.className = 'global-toast-item';
  item.textContent = msg;
  document.body.appendChild(item);
  requestAnimationFrame(() => requestAnimationFrame(() => { item.style.opacity = '1'; }));
  setTimeout(() => {
    item.style.opacity = '0';
    setTimeout(() => { try { item.remove(); } catch (e) {} }, 280);
  }, 3200);
};
