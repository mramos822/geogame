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
  m.muted = localStorage.getItem('muted') === 'true';
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

// ── VOLUME TOGGLE ─────────────────────────────────────────────────────────────
let isMuted = localStorage.getItem('muted') === 'true';

// On iOS, currentTime=0 can reset the muted state. Always apply muted right
// before play() so it persists.
function sfxPlay(sfx) {
  sfx.muted = isMuted;
  try { sfx.volume = isMuted ? 0 : 1; } catch(e) {}
  return sfx.play();
}

function getAllSfx() {
  return [sfxCheck, sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic, sfxSelect, sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp,
    typeof sfxLevel2  !== 'undefined' ? sfxLevel2        : null,
    window.sfxCheer  || null,
    window.sfxLoop   || null,
  ].filter(Boolean);
}

document.addEventListener('DOMContentLoaded', () => {
  if (isMuted) {
    const img = document.getElementById('vol-img');
    if (img) img.src = 'images/vol2.png';
  }
});

// ── HOVER SOUNDS ──────────────────────────────────────────────────────────────
function playSelect() { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }

[
  document.getElementById('loading-play-btn'),
  document.querySelector('.splash-confirm-wrap'),
  document.querySelector('.gameover-confirm-wrap'),
  document.getElementById('vol-btn'),
].forEach(el => el?.addEventListener('mouseenter', playSelect));

[
  document.querySelector('.splash-confirm-wrap'),
  document.querySelector('.gameover-confirm-wrap'),
].forEach(el => el?.addEventListener('mouseleave', playSelect));

document.getElementById('vol-btn')?.addEventListener('click', () => {
  isMuted = !isMuted;
  localStorage.setItem('muted', isMuted);
  const vol = isMuted ? 0 : 1;
  getAllSfx().forEach(sfx => { sfx.volume = vol; sfx.muted = isMuted; });
  applyMusicMute(); // iOS: music runs through Web Audio (gain); no-op on PC
  document.getElementById('vol-img').src = isMuted ? 'images/vol2.png' : 'images/vol1.png';
  const _a = new Audio('sfx/check.mp3'); _a.play();
});

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
  if (isMuted) getAllSfx().forEach(sfx => { sfx.volume = 0; sfx.muted = true; });
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

function iosMusicMuted() {
  return (typeof isMuted !== 'undefined') ? isMuted : (localStorage.getItem('muted') === 'true');
}

function applyMusicMute() {
  if (_iosGain) _iosGain.gain.value = iosMusicMuted() ? 0 : 1;
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
  const startVol = isMuted ? 0 : (track.volume || 1);
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
  const vol = isMuted ? 0 : 1;
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
