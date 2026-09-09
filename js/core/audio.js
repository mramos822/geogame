// ============================================================================
// core/audio.js — SFX, música en loop (HTML5 <audio> en PC, Web Audio en iOS), mute global
// y detección de plataforma (IS_IOS / IS_MOBILE / IS_CHROME_IOS).
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

// ── SFX ───────────────────────────────────────────────────────────────────────
// Solo check y postgame se necesitan en el splash — el resto se difiere al primer juego
const sfxCheck     = new Audio('sfx/check.mp3');
const sfxPostgame  = new Audio('sfx/postgameloop.mp3');
sfxPostgame.loop   = true;
// Splash/pre-ronda (antes de jugar) — distinto de sfxPostgame (pantalla de
// resultados); antes ambos reusaban postgameloop.mp3 para las dos cosas.
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

// ── MÚSICA EN LOOP: motor Web Audio SOLO en iOS ───────────────────────────────
// En PC se usa el <audio loop> de siempre (camino intacto, sin riesgo). En iOS el
// <audio loop> deja gaps al repetir, llega tarde o se congela; ahí decodificamos
// el buffer una vez y lo reproducimos con AudioBufferSourceNode.loop (gapless).
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_MOBILE = IS_IOS || navigator.maxTouchPoints > 1;
if (IS_IOS)    document.body.classList.add('is-ios');
if (IS_MOBILE) document.body.classList.add('is-mobile');

// Chrome para iOS (token 'CriOS' en el UA) corre sobre el mismo WebKit que Safari,
// pero es un build distinto de Apple/Google — un jugador reportó (Ver.3.5.41, iPhone
// 13 Pro Max, 6GB, NO es un device viejo/débil) que el proceso de la pestaña crashea
// ("Can't open this page") apenas en el 1er confirm de la 1ra partida, justo en
// howtoVideo.play() — la primera decodificación de video de la sesión, sin nada
// acumulado de antes (toda la investigación previa del crash de iOS, ver memoria
// project_ios_crash_investigation, se probó siempre con Safari, nunca con Chrome-iOS).
// Sin poder reproducirlo ni tener más dispositivos para probar, la mitigación más
// segura es no depender del decoder de video para ESTE combo puntual: se muestra un
// frame estático (poster) del tutorial en vez de reproducirlo — ver swapHowtoVideo y
// el confirm handler (~confirmStep 0→1) más abajo en este archivo.
const IS_CHROME_IOS = IS_IOS && /CriOS/i.test(navigator.userAgent);

// ── VOLUME TOGGLE ─────────────────────────────────────────────────────────────
let isMuted = localStorage.getItem('muted') === 'true';

// En iOS, currentTime=0 puede resetear el estado muted. Siempre aplicar muted
// justo antes de play() para garantizar que el estado persiste.
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
  applyMusicMute(); // iOS: la música va por Web Audio (gain); en PC es no-op
  document.getElementById('vol-img').src = isMuted ? 'images/vol2.png' : 'images/vol1.png';
  const _a = new Audio('sfx/check.mp3'); _a.play();
});

// ── SFX de juego (lazy: se instancian en el primer juego) ─────────────────────
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
  // Forzar preload en iOS: sin .load() el primer play() dispara la descarga y decodificación
  [sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp]
    .forEach(sfx => { sfx.load(); });
}

// Camino PC (y fallback): <audio> HTML de siempre. NO TOCAR.
function playMusicHTML(track) {
  [sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic].forEach(t => { if (t !== track) { t.pause(); t.currentTime = 0; } });
  if (!track) return;
  // si el mismo track ya está sonando, dejarlo continuar (no reiniciar el loop)
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
let _iosNode   = null;        // AudioBufferSourceNode sonando
let _iosToken  = null;        // track (HTMLAudio) que representa lo que suena
let _iosWanted = null;        // último track pedido (decode es async)

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
    // sin Web Audio o track desconocido: caer al <audio> de siempre
    iosStopMusic();
    return playMusicHTML(track);
  }
  _iosWanted = track;
  // que ningún <audio> de música suene en paralelo al motor
  [sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic].forEach(t => t.pause());
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (!track) { iosStopMusic(); return; }                       // corte inmediato
  if (_iosToken === track && _iosNode) { applyMusicMute(); return; } // ya suena: no reiniciar

  iosLoadBuf(_iosMusicURL.get(track)).then(buf => {
    if (_iosWanted !== track) return;
    if (_iosToken === track && _iosNode) return;
    iosStartMusic(track, buf);
  }).catch(() => playMusicHTML(track));
}

// Desbloqueo en iOS: reanudar el contexto y precargar/decodificar los loops en el
// primer gesto, para que el primer playMusic sea instantáneo y no se quede mudo.
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
