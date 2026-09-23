// ============================================================================
// core/audio.js — SFX, looping music (HTML5 <audio> on PC, Web Audio on iOS),
// global mute and platform detection (IS_IOS / IS_MOBILE / IS_CHROME_IOS).
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// ── SFX ───────────────────────────────────────────────────────────────────────
// Only check and postgame are needed on the splash — the rest is deferred to the first game
const sfxCheck     = new Audio('sfx/check.mp3');
const sfxPostgame  = new Audio('sfx/postgameloop.mp3');
sfxPostgame.loop   = true;
// Splash/pre-round (before playing) — distinct from sfxPostgame (results screen);
// both used to reuse postgameloop.mp3 for both.
const sfxPregame   = new Audio('sfx/pregameloop.mp3');
sfxPregame.loop    = true;
const sfxGameMusic = new Audio('sfx/gamemusic.mp3');
sfxGameMusic.loop  = true;
const sfxMenuMusic = new Audio('sfx/menuloop.mp3');
sfxMenuMusic.loop  = true;
window.sfxMenuMusic = sfxMenuMusic;
window.startMenuMusic = function () {
  const m = window.sfxMenuMusic;
  if (!m) return;
  m.loop = true;
  m.currentTime = 0;
  m.muted = (typeof isMusicMuted !== 'undefined') ? isMusicMuted : (localStorage.getItem('muted') === 'true');
  const p = m.play();
  if (p && typeof p.then === 'function') {
    p.catch(() => {
      const onGesture = () => {
        m.currentTime = 0;
        m.play().catch(() => {});
        document.removeEventListener('click',      onGesture, true);
        document.removeEventListener('touchstart', onGesture, true);
        document.removeEventListener('keydown',    onGesture, true);
      };
      document.addEventListener('click',      onGesture, { once: true, capture: true });
      document.addEventListener('touchstart', onGesture, { once: true, capture: true });
      document.addEventListener('keydown',    onGesture, { once: true, capture: true });
    });
  }
};
const sfxSelect    = new Audio('sfx/select.mp3');
if (localStorage.getItem('muted') === 'true') { sfxCheck.volume = 0; sfxPostgame.volume = 0; sfxPregame.volume = 0; sfxGameMusic.volume = 0; sfxMenuMusic.volume = 0; sfxSelect.volume = 0; }
[sfxCheck, sfxSelect].forEach(sfx => { sfx.load(); });

// ── LOOPING MUSIC: Web Audio engine on iOS ONLY ──────────────────────────────
// PC uses the plain <audio loop> (untouched, no risk). On iOS <audio loop> leaves
// gaps on repeat, lags, or freezes; there we decode the buffer once and play it
// with AudioBufferSourceNode.loop (gapless).
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_MOBILE = IS_IOS || navigator.maxTouchPoints > 1;
if (IS_IOS)    document.body.classList.add('is-ios');
if (IS_MOBILE) document.body.classList.add('is-mobile');

// Chrome for iOS ('CriOS' in the UA) runs on the same WebKit as Safari but is a
// different Apple/Google build — a player reported (Ver.3.5.41, iPhone 13 Pro
// Max, 6GB, not an old/weak device) that the tab process crashes ("Can't open
// this page") on the 1st confirm of the 1st game, right at howtoVideo.play() —
// the session's first video decode, nothing accumulated before it (all prior
// iOS-crash investigation, see project_ios_crash_investigation, was on Safari,
// never Chrome-iOS). Unable to reproduce it or test on more devices, the safest
// mitigation is not to depend on the video decoder for THIS combo: show a static
// poster frame of the tutorial instead of playing it — see swapHowtoVideo and
// the confirm handler (~confirmStep 0→1) below.
const IS_CHROME_IOS = IS_IOS && /CriOS/i.test(navigator.userAgent);

// ── VOLUME ────────────────────────────────────────────────────────────────────
// Two INDEPENDENT continuous levels (0..1) — music and sfx, split at request
// ("divide entre SFX y musica"). MUSIC = the 6 looping tracks
// (endgamecheeryay/endgameloop/gamemusic/menuloop/postgameloop/pregameloop,
// see getMusicTracks below); everything else is SFX (getSfxTracks).
// `isMuted`/`isMusicMuted` are kept as DERIVED flags (level <= 0): dozens of
// call sites across the codebase (results.js, final.js, shapes.js...) still
// read `isMuted` directly as a simple boolean for their own one-off
// sfx.volume assignments, outside this file's reach — those stay binary
// (full/silent), only the ones routed through sfxPlay()/getMusicTracks()/
// getSfxTracks() (the bulk of them) and the iOS music gain actually get the
// in-between levels.
function _loadVol(key) {
  const saved = localStorage.getItem(key);
  if (saved !== null) {
    const n = parseFloat(saved);
    if (!isNaN(n)) return Math.max(0, Math.min(1, n));
  }
  // Migrates whichever OLDER flag existed before this split (the single
  // 'volumeLevel' slider from right before this, then further back the
  // plain binary 'muted') — someone who had turned it down/off before
  // shouldn't come back to full volume.
  const savedOld = localStorage.getItem('volumeLevel');
  if (savedOld !== null) {
    const n = parseFloat(savedOld);
    if (!isNaN(n)) return Math.max(0, Math.min(1, n));
  }
  return localStorage.getItem('muted') === 'true' ? 0 : 1;
}
let musicVolumeLevel = _loadVol('musicVolumeLevel');
let sfxVolumeLevel   = _loadVol('sfxVolumeLevel');
let isMuted      = sfxVolumeLevel   <= 0; // legacy flag most old call sites read — now specifically SFX
let isMusicMuted = musicVolumeLevel <= 0;

function volIconForLevel(level) {
  const pct = Math.round(level * 100);
  if (pct <= 0)  return 'images/vol2.png';
  if (pct <= 33) return 'images/vol1-3.png';
  if (pct <= 66) return 'images/vol1-2.png';
  return 'images/vol1.png';
}
// SFX icon has only 2 states (per request), not the 4-tier vol one: 0% →
// sfx2, anything else (1-100%) → sfx1.
function sfxIconForLevel(level) {
  return level <= 0 ? 'images/sfx2.png' : 'images/sfx1.png';
}

function getMusicTracks() {
  return [sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic, window.sfxCheer || null, window.sfxLoop || null].filter(Boolean);
}
function getSfxTracks() {
  return [sfxCheck, sfxSelect, sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp,
    typeof sfxLevel2 !== 'undefined' ? sfxLevel2 : null,
  ].filter(Boolean);
}
// Kept for any external/legacy caller — the union of both categories.
function getAllSfx() { return getMusicTracks().concat(getSfxTracks()); }

// Paints ONE popup's fill/handle/percentage label from a level — shared by
// both sliders, `prefix` picks which ('vol' for music, 'sfx' for sfx,
// matching their #<prefix>-slider-fill/-handle/-pct ids in play/index.html).
function _paintSlider(prefix, level) {
  const fill   = document.getElementById(prefix + '-slider-fill');
  const handle = document.getElementById(prefix + '-slider-handle');
  const pctEl  = document.getElementById(prefix + '-slider-pct');
  // Invertido a pedido: ARRIBA = menos volumen, ABAJO = más — ver el
  // comentario de #vol-slider-fill/-handle en style.css.
  const pct = Math.round(level * 100) + '%';
  if (fill)   fill.style.height = pct;
  if (handle) handle.style.top = pct;
  if (pctEl)  pctEl.textContent = pct;
}

function applyMusicVolume() {
  isMusicMuted = musicVolumeLevel <= 0;
  localStorage.setItem('musicVolumeLevel', String(musicVolumeLevel));
  getMusicTracks().forEach(sfx => { sfx.volume = musicVolumeLevel; sfx.muted = isMusicMuted; });
  applyMusicMute(); // iOS: music runs through Web Audio (gain); no-op on PC
  const img = document.getElementById('vol-img');
  if (img) img.src = volIconForLevel(musicVolumeLevel);
  _paintSlider('vol', musicVolumeLevel);
}
function applySfxVolume() {
  isMuted = sfxVolumeLevel <= 0;
  localStorage.setItem('sfxVolumeLevel', String(sfxVolumeLevel));
  getSfxTracks().forEach(sfx => { sfx.volume = sfxVolumeLevel; sfx.muted = isMuted; });
  const img = document.getElementById('sfx-img');
  if (img) img.src = sfxIconForLevel(sfxVolumeLevel);
  _paintSlider('sfx', sfxVolumeLevel);
}
// Exposed so any OTHER file that wants to respect the real level (instead of
// the old binary isMuted) can.
window.getMusicVolumeLevel = () => musicVolumeLevel;
window.getSfxVolumeLevel   = () => sfxVolumeLevel;
// Legacy name from before the split — kept pointing at SFX specifically,
// since that's what almost every old `isMuted`-reading call site plays.
window.getVolumeLevel = () => sfxVolumeLevel;
function setMusicVolumeLevel(level) { musicVolumeLevel = Math.max(0, Math.min(1, level)); applyMusicVolume(); }
function setSfxVolumeLevel(level)   { sfxVolumeLevel   = Math.max(0, Math.min(1, level)); applySfxVolume(); }
window.setMusicVolumeLevel = setMusicVolumeLevel;
window.setSfxVolumeLevel   = setSfxVolumeLevel;
// Legacy name — kept pointing at SFX (see getVolumeLevel's own comment).
window.setVolumeLevel = setSfxVolumeLevel;

// On iOS, currentTime=0 can reset the muted state. Always apply muted right
// before play() so it persists. Auto-picks the right category — sfxPlay()
// is called with BOTH plain sfx AND (from results.js) the two music loops.
function sfxPlay(sfx) {
  const music = getMusicTracks().indexOf(sfx) !== -1;
  sfx.muted = music ? isMusicMuted : isMuted;
  try { sfx.volume = music ? musicVolumeLevel : sfxVolumeLevel; } catch(e) {}
  return sfx.play();
}

document.addEventListener('DOMContentLoaded', () => {
  applyMusicVolume(); // paints the music icon + slider at the saved level
  applySfxVolume();   // paints the sfx icon + slider at the saved level
});

// ── HOVER SOUNDS ──────────────────────────────────────────────────────────────
function playSelect() { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }

[
  document.getElementById('loading-play-btn'),
  document.querySelector('.splash-confirm-wrap'),
  document.querySelector('.gameover-confirm-wrap'),
  document.getElementById('vol-btn'),
  document.getElementById('sfx-btn'),
].forEach(el => el?.addEventListener('mouseenter', playSelect));

[
  document.querySelector('.splash-confirm-wrap'),
  document.querySelector('.gameover-confirm-wrap'),
].forEach(el => el?.addEventListener('mouseleave', playSelect));

// ── VOLUME SLIDER POPUPS ──────────────────────────────────────────────────────
// Clicking the icon opens/closes the vertical bar instead of toggling mute
// directly — dragging (or just clicking) inside the bar is what actually
// sets the level (via `setLevel`). Shared by both #vol-btn (music) and
// #sfx-btn (sfx) — `prefix` picks the #<prefix>-img/-slider-popup/-track ids.
const VOL_WHEEL_STEP = 0.05; // 5% por "muesca" de rueda
function _initVolSliderPopup(prefix, getLevel, setLevel) {
  const btn   = document.getElementById(prefix + '-btn');
  const img   = document.getElementById(prefix + '-img');
  const popup = document.getElementById(prefix + '-slider-popup');
  const track = document.getElementById(prefix + '-slider-track');
  if (!btn || !img || !popup || !track) return;

  // Scroll arriba/abajo con el cursor sobre el botón O la barra sube/baja el
  // volumen — `btn` (el <div> padre) contiene a ambos, así que un solo
  // listener ahí cubre los dos casos por bubbling. preventDefault evita que
  // la página (o el stage) se mueva mientras se ajusta.
  btn.addEventListener('wheel', (e) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1; // arriba = sube, abajo = baja
    setLevel(getLevel() + dir * VOL_WHEEL_STEP);
  }, { passive: false });

  img.addEventListener('click', (e) => {
    e.stopPropagation();
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    popup.classList.toggle('open');
  });

  // Invertido a pedido: 0 (menos) ARRIBA, 1 (más) ABAJO — misma convención
  // que la CSS del fill (height%)/handle (top%) ya usa.
  function levelFromPointer(clientY) {
    const rect = track.getBoundingClientRect();
    if (!rect.height) return getLevel();
    return Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  }
  let dragging = false;
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    try { track.setPointerCapture(e.pointerId); } catch (err) {}
    setLevel(levelFromPointer(e.clientY));
  });
  track.addEventListener('pointermove', (e) => {
    if (dragging) setLevel(levelFromPointer(e.clientY));
  });
  ['pointerup', 'pointercancel'].forEach(ev => track.addEventListener(ev, () => { dragging = false; }));

  // Any click OUTSIDE the popup (and outside the icon, which has its own
  // toggle above) closes it — same pattern as any other in-game popup.
  document.addEventListener('pointerdown', (e) => {
    if (!popup.classList.contains('open')) return;
    if (popup.contains(e.target) || e.target === img) return;
    popup.classList.remove('open');
  });
}
_initVolSliderPopup('vol', () => musicVolumeLevel, setMusicVolumeLevel);
_initVolSliderPopup('sfx', () => sfxVolumeLevel,   setSfxVolumeLevel);

// ── Game SFX (lazy: instantiated on the first game) ──────────────────────────
let sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp;

function loadGameSFX() {
  if (sfxPin) return;
  sfxPin       = new Audio('sfx/pin.mp3');
  sfxCountdown = new Audio('sfx/cuentaregresiva.mp3');
  sfxError     = new Audio('sfx/error.mp3');
  sfxAcertar   = new Audio('sfx/acertar.mp3');
  sfxVeryNice  = new Audio('sfx/verynice.mp3');
  sfxTag       = new Audio('sfx/tag.mp3');
  sfxBonus     = new Audio('sfx/bonus.mp3');
  sfxTickdown  = new Audio('sfx/countdown.mp3');
  sfxTimesUp   = new Audio('sfx/timesup.mp3');
  // Newly-created <audio> elements default to volume:1 — apply the CURRENT
  // sfx level right away (all of these are SFX, not music), so a
  // lazily-loaded one doesn't start at full volume until the next unrelated
  // volume change.
  getSfxTracks().forEach(sfx => { sfx.volume = sfxVolumeLevel; sfx.muted = isMuted; });
  // Force preload on iOS: without .load() the first play() triggers download + decode
  [sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp]
    .forEach(sfx => { sfx.load(); });
}

// PC path (and fallback): plain HTML <audio>. DO NOT TOUCH.
function playMusicHTML(track) {
  [sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic].forEach(t => { if (t !== track) { t.pause(); t.currentTime = 0; } });
  if (!track) return;
  // if the same track is already playing, let it continue (don't restart the loop)
  if (!track.paused && !track.ended) {
    const p = track.play();
    if (p) p.catch(() => {});
    return;
  }
  track.currentTime = 0;
  const p = track.play();
  if (p) p.catch(() => {});
}

function playMusic(track) {
  if (IS_IOS) return playMusicIOS(track);
  return playMusicHTML(track);
}

const _iosMusicURL = new Map([
  [sfxGameMusic, 'sfx/gamemusic.mp3'],
  [sfxPostgame,  'sfx/postgameloop.mp3'],
  [sfxPregame,   'sfx/pregameloop.mp3'],
  [sfxMenuMusic, 'sfx/menuloop.mp3'],
]);
let _iosCtx    = null;
const _iosBufs = new Map();   // url -> AudioBuffer
let _iosGain   = null;
let _iosNode   = null;        // playing AudioBufferSourceNode
let _iosToken  = null;        // track (HTMLAudio) representing what's playing
let _iosWanted = null;        // last requested track (decode is async)

function iosCtx() {
  if (_iosCtx) return _iosCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    _iosCtx = new AC();
    _iosGain = _iosCtx.createGain();
    _iosGain.connect(_iosCtx.destination);
  } catch (e) { _iosCtx = null; }
  return _iosCtx;
}

function applyMusicMute() {
  if (_iosGain) _iosGain.gain.value = (typeof musicVolumeLevel !== 'undefined') ? musicVolumeLevel : (isMusicMuted ? 0 : 1);
}

function iosLoadBuf(url) {
  const ctx = iosCtx();
  if (!ctx) return Promise.reject();
  if (_iosBufs.has(url)) return Promise.resolve(_iosBufs.get(url));
  return fetch(url)
    .then(r => r.arrayBuffer())
    .then(ab => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
    .then(buf => { _iosBufs.set(url, buf); return buf; });
}

function iosStopMusic() {
  if (_iosNode) {
    try { _iosNode.stop(); } catch (e) {}
    try { _iosNode.disconnect(); } catch (e) {}
    _iosNode = null;
  }
  _iosToken = null;
}

function iosStartMusic(token, buf) {
  const ctx = iosCtx();
  if (!ctx) return;
  iosStopMusic();
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.loop = true;
  node.connect(_iosGain);
  applyMusicMute();
  node.start(0);
  _iosNode = node;
  _iosToken = token;
}

function playMusicIOS(track) {
  const ctx = iosCtx();
  if (!ctx || (track && !_iosMusicURL.has(track))) {
    // no Web Audio or unknown track: fall back to plain <audio>
    iosStopMusic();
    return playMusicHTML(track);
  }
  _iosWanted = track;
  // keep any music <audio> from playing alongside the engine
  [sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic].forEach(t => t.pause());
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (!track) { iosStopMusic(); return; }                       // immediate stop
  if (_iosToken === track && _iosNode) { applyMusicMute(); return; } // already playing: don't restart

  iosLoadBuf(_iosMusicURL.get(track)).then(buf => {
    if (_iosWanted !== track) return;
    if (_iosToken === track && _iosNode) return;
    iosStartMusic(track, buf);
  }).catch(() => playMusicHTML(track));
}

// iOS unlock: resume the context and preload/decode the loops on the first
// gesture, so the first playMusic is instant and not silent.
if (IS_IOS) {
  const iosUnlock = () => {
    const ctx = iosCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    _iosMusicURL.forEach((url) => iosLoadBuf(url).catch(() => {}));
  };
  ['touchend', 'pointerdown', 'click'].forEach(ev =>
    document.addEventListener(ev, iosUnlock, { once: true, passive: true })
  );
}

document.getElementById('loading-play-btn').addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

// Fade a music loop out over `ms` (default 150) then stop it — so it doesn't
// cut abruptly. Used by the GloboReto rematch transition (postgameloop.mp3
// fades with the panel). Handles both the iOS (Web Audio gain) and the plain
// <audio> paths, and restores the volume afterwards so the next play() isn't
// silent.
function fadeOutMusic(track, ms) {
  ms = ms || 150;
  if (IS_IOS && _iosGain && _iosNode) {
    try {
      const now = iosCtx().currentTime;
      const g = _iosGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.0001, now + ms / 1000);
      setTimeout(() => { iosStopMusic(); applyMusicMute(); }, ms + 40);
    } catch (e) { iosStopMusic(); }
    return;
  }
  if (!track || track.paused) return;
  const startVol = isMusicMuted ? 0 : (track.volume || musicVolumeLevel);
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    try { track.volume = startVol * (1 - k); } catch (e) {}
    if (k < 1) { requestAnimationFrame(step); return; }
    try { track.pause(); track.currentTime = 0; track.volume = startVol; } catch (e) {}
  };
  step();
}
window.fadeOutMusic = fadeOutMusic;

// Play pin.mp3 as a ~1s clip with a tiny fade-out tail — used by the GloboReto
// rematch +1 score bump. sfxPin is lazy (loadGameSFX); no-op if not loaded yet.
function playPinClip() {
  if (typeof sfxPin === 'undefined' || !sfxPin) return;
  const vol = sfxVolumeLevel;
  try {
    sfxPin.pause();
    sfxPin.currentTime = 0;
    sfxPin.muted = isMuted;
    sfxPin.volume = vol;
    const p = sfxPin.play();
    if (p) p.catch(() => {});
  } catch (e) { return; }
  const CLIP_MS = 500, FADE_MS = 120;
  const t0 = performance.now();
  const tick = () => {
    const el = performance.now() - t0;
    if (el >= CLIP_MS) {
      try { sfxPin.pause(); sfxPin.currentTime = 0; sfxPin.volume = vol; } catch (e) {}
      return;
    }
    if (el >= CLIP_MS - FADE_MS) {
      try { sfxPin.volume = vol * (1 - (el - (CLIP_MS - FADE_MS)) / FADE_MS); } catch (e) {}
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
window.playPinClip = playPinClip;
