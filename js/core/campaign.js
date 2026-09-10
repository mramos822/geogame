// ============================================================================
// core/campaign.js — Gira Mundial (window.campaign, campaignBase,
// _commitCampaignHighscores, startCampaign) + the global _setPlaying helper
// (is_playing in Supabase + /stats label) and preloadNextModeAssets.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// Human-readable "what is being played" label for /stats (see sbSetPlayingMode
// in sb.js) — best-effort from the context available at microtask time (after
// the _setPlaying caller finished setting pendingGameMode/campaign/_vsActive in
// its own synchronous function).
const _MODE_NAME_LABELS = { flags: 'Banderas', shapes: 'Figuras', game: 'Ciudades', monuments: 'Monumentos', globequiz: 'GlobeQuiz' };
function _computePlayingLabel(isPracticing) {
  const modeName = _MODE_NAME_LABELS[window.pendingGameMode] || null;
  if (window._vsActive) return 'VS' + (modeName ? ' · ' + modeName : '');
  if (window.campaign && window.campaign.active) return 'Gira Mundial';
  if (isPracticing) return 'Práctica' + (modeName ? ' · ' + modeName : '');
  return modeName || 'Jugando';
}

// Global helper: updates is_playing in Supabase if there's an active session
window._setPlaying = function(playing) {
  window._isPlaying = !!playing;
  const isPracticing = !!(window.practiceConfig && window.practiceConfig.active);
  if (window._sbUserId) {
    window.sbSetPlaying(window._sbUserId, playing, playing && isPracticing).catch(() => {});
  } else if (window.Analytics && typeof window.Analytics.guestSetPlaying === 'function') {
    // Guest (no account): same heartbeat as sbSetPlaying but to
    // guest_presence — the only thing that lets /stats "online now" /
    // "playing now" see them, see js/analytics.js.
    window.Analytics.guestSetPlaying(playing, null);
  }
  if (playing) {
    window._scoresUploadedThisGame = false;
    window._gameSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    // Deferred to a microtask: the caller (vs.js/lobby.js) sets
    // _vsActive/_lobbyActive a few lines after calling _setPlaying(true) in the
    // SAME synchronous function — deciding here would always see those flags
    // still false and open a "solo" spectator channel even for a versus/lobby.
    // Opening the channel makes no sense in practice mode either: there's no eye
    // to click (is_practicing hides it) and the session isn't a "real" game.
    Promise.resolve().then(() => {
      // sbSetPlayingMode goes FIRST in its own try/catch: if SoloSpectate.start()
      // below throws, it must not cut this off midway (that's exactly what
      // happened before this change — the mode never reached /stats).
      try {
        if (window._isPlaying && window._sbUserId && typeof window.sbSetPlayingMode === 'function') {
          window.sbSetPlayingMode(window._sbUserId, _computePlayingLabel(isPracticing)).catch(() => {});
        } else if (window._isPlaying && !window._sbUserId && window.Analytics && typeof window.Analytics.guestSetPlaying === 'function') {
          window.Analytics.guestSetPlaying(true, _computePlayingLabel(isPracticing));
        }
      } catch (e) {}
      try {
        if (window._isPlaying && !window._vsActive && !window._lobbyActive && !isPracticing && typeof window.SoloSpectate !== 'undefined') {
          window.SoloSpectate.start();
        }
      } catch (e) {}
    });
  } else {
    if (typeof window.SoloSpectate !== 'undefined') window.SoloSpectate.stop();
    if (window._sbUserId && typeof window.sbSetPlayingMode === 'function') window.sbSetPlayingMode(window._sbUserId, null).catch(() => {});
    // Back from a game: deliver invites that arrived while playing
    if (typeof window.flushQueuedInvite === 'function') window.flushQueuedInvite();
  }
};

// ── PROACTIVE PRELOAD FOR CAMPAIGN TRANSITIONS ───────────────────────────────
// Called when mode N's gameover shows, so mode N+1's assets reach the HTTP
// cache before the user clicks Confirm.
window.preloadNextModeAssets = function (nextMode) {
  const assetMap = {
    shapes: [
      'images/howtoplay/howtoplay2.mp4',
      'images/bg/level2complete.png',
      'images/check2.png',
      'images/wrong2.png',
    ],
    game: [
      'images/howtoplay/howtoplay3.mp4',
      'images/bg/level3complete.png',
      'images/check3.png',
      'images/wrong3.png',
    ],
    monuments: [
      'images/howtoplay/howtoplay4.mp4',
      'images/bg/level4complete.png',
      'images/bg/level4complete2.png',
      'images/check4.png',
      'images/wrong4.png',
    ],
  };
  const list = assetMap[nextMode];
  if (!list) return Promise.resolve();
  // Videos excluded from proactive preload: too heavy to keep in RAM while the
  // previous mode hasn't freed its memory yet → OOM on iOS.
  const images = list.filter(url => !url.endsWith('.mp4'));
  if (!images.length) return Promise.resolve();
  // Mobile: fetch() to warm the HTTP cache without decoding the bitmap into RAM,
  // so decoded memory doesn't pile up before the previous mode frees its own.
  // PC: new Image() to decode proactively (faster to render).
  if (IS_MOBILE) {
    return Promise.all(
      images.map(url => fetch(url, { cache: 'force-cache' }).catch(() => {}))
    ).then(() => {});
  }
  return new Promise(resolve => {
    let done = 0;
    images.forEach(url => {
      const img = new Image();
      img.onload = img.onerror = () => { if (++done === images.length) resolve(); };
      img.src = url;
    });
  });
};

// ── CAMPAIGN: 4 chained modes ────────────────────────────────────────────────
window.campaign = {
  active: false,
  idx: 0,
  base: 0,
  btns:  ['loading-flags-btn', 'loading-shapes-btn', 'loading-play-btn', 'loading-mode4-btn'],
  modes: ['flags', 'shapes', 'game', 'monuments'],
  scores: {},
  // Per-mode highscores earned DURING an in-progress campaign: kept here instead
  // of localStorage until the whole campaign completes. If abandoned midway they
  // are discarded (see quitToMenu) and the persisted highscore doesn't change.
  pendingHS: {},
};
// accumulated score from previous rounds (0 if no active campaign)
window.campaignBase = function () {
  return (window.campaign && window.campaign.active) ? (window.campaign.base || 0) : 0;
};
// Commit to localStorage the per-mode highscores earned during the just-completed
// campaign. Only called once all 4 modes are finished.
window._commitCampaignHighscores = function () {
  const pending = window.campaign && window.campaign.pendingHS;
  if (!pending) return;
  const LS_KEYS = { flags: 'flagsHighscore', shapes: 'shapesHighscore', game: 'geochallenge_highscore', monuments: 'monumentsHighscore' };
  Object.keys(pending).forEach(mode => {
    const key = LS_KEYS[mode];
    if (!key) return;
    const prev = parseInt(localStorage.getItem(key) || '0', 10);
    if (pending[mode] > prev) {
      localStorage.setItem(key, String(pending[mode]));
      if (mode === 'game' && typeof highscore !== 'undefined') {
        highscore = pending[mode];
        const hsEl = document.getElementById('highscore-value');
        if (hsEl) hsEl.textContent = highscore.toLocaleString();
        if (typeof updateSplashHighscore === 'function') updateSplashHighscore();
      }
      if (mode === 'monuments' && typeof monumentsHighscore !== 'undefined') {
        monumentsHighscore = pending[mode];
      }
    }
  });
  window.campaign.pendingHS = {};
};

window.startCampaign = function () {
  // Free GlobeQuiz's WebGL contexts (globe + starfield) before the campaign
  // begins — they stay alive after leaving GlobeQuiz and, stacked under the
  // transformed #app-stage, pushed iOS over the edge on the shapes->cities hop
  // (reported: GlobeQuiz then Gira Mundial crashes).
  if (typeof window.globequizReleaseGL === 'function') {
    try { window.globequizReleaseGL(); } catch (e) {}
  }
  window.campaign.active = true;
  window.campaign.idx = 0;
  window.campaign.base = 0;
  window.campaign.scores = {};
  window.campaign.pendingHS = {};
  window.lastModeScore = 0;
  document.getElementById('loading-flags-btn').click();
};
