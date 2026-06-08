// ── LOADING SCREEN ───────────────────────────────────────────────────────────
(function () {
  const IMAGES = [
    'images/checkerrortable.png','images/check3.png','images/wrong3.png',
    'images/bg/sky.png','images/bg/sky2.png','images/bg/cloud1.png','images/bg/cloud2.png',
    'images/bg/level3complete.png','images/bg/level4complete.png','images/bg/level4complete2.png','images/bg/stairs.png',
    'images/bg/plane.png','images/bg/plane2.png','images/bg/plane3.png',
    'images/bg/plane4.png','images/bg/plane5.png','images/bg/plane6.png',
    'images/characters/people.png','images/characters/men1.png','images/characters/men2.png',
    'images/characters/women1.png','images/characters/girl1.png','images/characters/girl2.png',
    'images/characters/flightattpost2/1.png','images/characters/flightattpost2/2.png',
    'images/characters/flightattpost2/3.png','images/characters/flightattpost2/4.png',
    'images/characters/flightattpost2/5.png','images/characters/flightattpost2/6.png',
    'images/characters/flightattpost2/7.png','images/characters/flightattpost2/8.png',
    'images/characters/flightattpost2/9.png','images/characters/flightattpost2/10.png',
    'images/characters/flightattpost2/11.png',
    'images/characters/flightattpost/1.png','images/characters/flightattpost/2.png',
    'images/characters/flightattpost/3.png','images/characters/flightattpost/4.png',
    'images/characters/flightattpost/5.png','images/characters/flightattpost/6.png',
    'images/characters/flightattpost/7.png','images/characters/flightattpost/8.png',
    'images/characters/flightattpost/9.png','images/characters/flightattpost/10.png',
    'images/characters/flightattpost/11.png','images/characters/flightattpost/12.png',
    'images/characters/flightattpost/13.png','images/characters/flightattpost/14.png',
    'images/characters/flightattpost/15.png',
    'images/howtoplaytable.png','images/confirm1.png','images/confirm2.png',
    'images/text1.png','images/text2.png',
    'images/tag3.png','images/countdown4.png','images/points.png',
    'images/countdown/1.png','images/countdown/2.png','images/countdown/3.png',
    'images/countdown/go.png','images/countdown/timeup.png',
    'images/badges/bluebadge.png','images/badges/garnetbadge.png',
    'images/badges/goldbadge.png','images/badges/greenbadge.png',
    'images/badges/redbadge.png','images/badges/silverbadge.png',
    'images/badges/yellowbadge.png',
    'images/mapimage.png','images/countdownred4.png',
    'images/pin1.png','images/pin2.png',
    'images/vol1.png','images/vol2.png','images/logo.png',
  ];

  const AUDIO = [
    'sfx/check.mp3','sfx/postgameloop.mp3','sfx/pin.mp3',
    'sfx/countdown.mp3','sfx/cuentaregresiva.mp3','sfx/error.mp3',
    'sfx/acertar.mp3','sfx/verynice.mp3','sfx/tag.mp3',
    'sfx/bonus.mp3','sfx/timesup.mp3','sfx/gamemusic.mp3','sfx/select.mp3',
  ];

  const barFill = document.getElementById('loading-bar-fill');
  const pctEl   = document.getElementById('loading-pct');
  const playBtn = document.getElementById('loading-play-btn');

  const planet = document.querySelector('.loading-planet');
  if (planet) {
    const randomDeg = Math.floor(Math.random() * 360);
    planet.style.animation = 'none';
    planet.getBoundingClientRect();
    planet.style.animation = `planet-spin 25s linear -${(randomDeg / 360) * 25}s infinite`;
  }

  // Lista COMPLETA de assets: usa el manifest auto-generado (todos los archivos de
  // images/ y sfx/). Si por algo falta, cae a la lista mínima embebida.
  const M = window.ASSET_MANIFEST || {};
  const imgList   = (M.images && M.images.length) ? M.images : IMAGES;
  const audioList = (M.audio  && M.audio.length)  ? M.audio  : AUDIO;
  const videoList = M.video || [];

  // Mantener vivas las imágenes ya decodificadas para que el navegador no las
  // descarte de memoria antes de usarlas en el juego (evita el "titileo").
  window.__preloadedImages = window.__preloadedImages || [];

  // Carga una imagen y la decodifica por completo (decode() evita el flash al
  // pintarla por primera vez).
  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      const finish = () => { window.__preloadedImages.push(img); resolve(); };
      img.onload = () => { (img.decode ? img.decode().then(finish, finish) : finish()); };
      img.onerror = finish;
      img.src = src;
    });
  }

  // Ejecuta tareas con un límite de concurrencia para no saturar la red/decoder.
  function runPool(items, worker, concurrency, onEach) {
    let i = 0;
    const next = () => {
      if (i >= items.length) return Promise.resolve();
      const item = items[i++];
      return worker(item).then(() => { onEach(); return next(); });
    };
    const runners = [];
    for (let k = 0; k < Math.min(concurrency, items.length); k++) runners.push(next());
    return Promise.all(runners);
  }

  const total = imgList.length + audioList.length + videoList.length + 2; // +fonts +load
  let done = 0;

  function tick() {
    done++;
    const pct = Math.min(100, Math.round(done / total * 100));
    barFill.style.width = pct + '%';
    pctEl.textContent   = pct + '%';
    if (done >= total) {
      const actions = document.getElementById('loading-actions');
      if (actions) actions.style.display = 'flex';
      document.getElementById('loading-play-wrap').style.display = 'flex';
      playBtn.addEventListener('animationend', () => playBtn.classList.add('loaded'), { once: true });
      const flagsBtn = document.getElementById('loading-flags-btn');
      document.getElementById('loading-flags-wrap').style.display = 'flex';
      flagsBtn.addEventListener('animationend', () => flagsBtn.classList.add('loaded'), { once: true });
      const shapesBtn = document.getElementById('loading-shapes-btn');
      document.getElementById('loading-shapes-wrap').style.display = 'flex';
      shapesBtn.addEventListener('animationend', () => shapesBtn.classList.add('loaded'), { once: true });
      const mode4Btn = document.getElementById('loading-mode4-btn');
      document.getElementById('loading-mode4-wrap').style.display = 'flex';
      mode4Btn.addEventListener('animationend', () => mode4Btn.classList.add('loaded'), { once: true });

      const fmt = v => v > 0 ? '🏆 ' + v.toLocaleString() : '';
      const playHs      = parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10);
      const flagsHs     = parseInt(localStorage.getItem('flagsHighscore')         || '0', 10);
      const shapesHs    = parseInt(localStorage.getItem('shapesHighscore')        || '0', 10);
      const monumentsHs = parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10);
      const elPlay      = document.getElementById('loading-play-hs');
      const elFlags     = document.getElementById('loading-flags-hs');
      const elShapes    = document.getElementById('loading-shapes-hs');
      const elMode4     = document.getElementById('loading-mode4-hs');
      if (elPlay)   elPlay.textContent   = fmt(playHs);
      if (elFlags)  elFlags.textContent  = fmt(flagsHs);
      if (elShapes) elShapes.textContent = fmt(shapesHs);
      if (elMode4)  elMode4.textContent  = fmt(monumentsHs);
      if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
    }
  }

  // Imágenes: hasta 24 en paralelo, decodificadas. Audio/video: descarga completa.
  runPool(imgList, loadImage, 24, tick);
  runPool(audioList, src => fetch(src).then(r => r.arrayBuffer()).catch(() => {}), 8, tick);
  runPool(videoList, src => fetch(src).then(r => r.blob()).catch(() => {}), 3, tick);

  // Fuentes completamente renderizadas
  Promise.resolve(document.fonts.ready).then(tick, tick);

  // Página y todos sus sub-recursos listos
  (document.readyState === 'complete')
    ? tick()
    : window.addEventListener('load', tick, { once: true });

})();

// ── OPTIMIZACIÓN ANTI-TITILEO ────────────────────────────────────────────────
// El preloader decodifica copias Image() (para tener el recurso en caché), pero
// los <img> reales del DOM se decodifican recién al mostrarse → titilan. Acá los
// decodificamos de antemano y marcamos como decoding="sync" las imágenes cuyo
// src se intercambia entre modos, para que al cambiar de juego no muestren un
// frame en blanco.
window.addEventListener('load', () => {
  // Warming: decodificar todos los <img> ya presentes en el DOM.
  document.querySelectorAll('img').forEach(img => {
    if (img.decode) img.decode().catch(() => {});
  });
  // Imágenes que cambian de src al pasar de modo: decodificación síncrona.
  document.querySelectorAll(
    '.game-bg-city, .game-bg-check3, .game-bg-wrong3, .game-bg-men, ' +
    '.game-bg-girl, .game-bg-women, #pregame-countdown-img, #flags-pregame-countdown-img'
  ).forEach(img => { img.decoding = 'sync'; });
}, { once: true });

// Actualiza el panel de perfil (nombre, veces jugadas, promedios, highscores,
// rango). Se llama al cargar y cada vez que se vuelve al loading screen, para
// que refleje los datos guardados de la última partida.
window.refreshProfileStats = function () {
  const playHs      = parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10);
  const flagsHs     = parseInt(localStorage.getItem('flagsHighscore')         || '0', 10);
  const shapesHs    = parseInt(localStorage.getItem('shapesHighscore')        || '0', 10);
  const monumentsHs = parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10);
  const elName = document.getElementById('loading-player-name');
  if (elName) elName.textContent = localStorage.getItem('playerName') || 'John';
  const elPlays = document.getElementById('loading-play-count');
  if (elPlays) elPlays.textContent = `¡Has jugado ${parseInt(localStorage.getItem('playCount') || '0', 10)} veces!`;
  const gamesHs = { 1: flagsHs, 2: shapesHs, 3: playHs, 4: monumentsHs };
  // Columna derecha: highscore de cada modo
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('loading-games-avg' + i);
    if (el) el.textContent = gamesHs[i].toLocaleString();
  });
  // Columna izquierda: promedio de puntaje de cada modo
  const avgKeys = { 1: 'flags', 2: 'shapes', 3: 'game', 4: 'monuments' };
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('loading-games-hs' + i);
    if (!el) return;
    const sum   = parseInt(localStorage.getItem('avgSum_' + avgKeys[i])   || '0', 10);
    const count = parseInt(localStorage.getItem('avgCount_' + avgKeys[i]) || '0', 10);
    el.textContent = (count > 0 ? Math.round(sum / count) : 0).toLocaleString();
  });
  const rankEl = document.getElementById('loading-games-rank');
  if (rankEl && typeof getRank === 'function') {
    const totalHs = flagsHs + shapesHs + playHs + monumentsHs;
    const totalEl = document.getElementById('loading-games-total');
    if (totalEl) totalEl.textContent = totalHs.toLocaleString();
    const rk = getRank(totalHs);
    if (rk) rankEl.src = rk.img;
    const rankLabel = document.getElementById('loading-games-rank-label');
    if (rankLabel && rk) {
      rankLabel.textContent = rk.name;
      // Achicar el texto poco a poco si se sale del ancho del rank.png.
      // Trabajamos en vmin para que el rango escale igual que el resto del menú.
      const maxWidth = (document.getElementById('loading-games-rank')?.offsetWidth || 240) * 1.15;
      let size = 4; // vmin
      rankLabel.style.fontSize = size + 'vmin';
      while (rankLabel.scrollWidth > maxWidth && size > 1.6) {
        size -= 0.1;
        rankLabel.style.fontSize = size + 'vmin';
      }
    }
  }
};

// ── SFX ───────────────────────────────────────────────────────────────────────
// Solo check y postgame se necesitan en el splash — el resto se difiere al primer juego
const sfxCheck     = new Audio('sfx/check.mp3');
const sfxPostgame  = new Audio('sfx/postgameloop.mp3');
sfxPostgame.loop   = true;
const sfxGameMusic = new Audio('sfx/gamemusic.mp3');
sfxGameMusic.loop  = true;
const sfxSelect    = new Audio('sfx/select.mp3');
if (localStorage.getItem('muted') === 'true') { sfxCheck.volume = 0; sfxPostgame.volume = 0; sfxGameMusic.volume = 0; sfxSelect.volume = 0; }

// ── MÚSICA EN LOOP: motor Web Audio SOLO en iOS ───────────────────────────────
// En PC se usa el <audio loop> de siempre (camino intacto, sin riesgo). En iOS el
// <audio loop> deja gaps al repetir, llega tarde o se congela; ahí decodificamos
// el buffer una vez y lo reproducimos con AudioBufferSourceNode.loop (gapless).
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (IS_IOS) document.body.classList.add('is-ios');

const _iosMusicURL = new Map([
  [sfxGameMusic, 'sfx/gamemusic.mp3'],
  [sfxPostgame,  'sfx/postgameloop.mp3'],
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
  [sfxPostgame, sfxGameMusic].forEach(t => t.pause());
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
  sfxSelect.currentTime = 0; sfxSelect.play();
});

document.getElementById('loading-play-btn').addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  window.pendingGameMode = 'game';
  document.getElementById('splash-screen').classList.remove('mode-flags', 'mode-shapes', 'mode-monuments');
  document.getElementById('gameover-screen').classList.remove('mode-flags', 'mode-shapes', 'mode-monuments');
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level3complete.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check3.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong3.png');
  const howtoVideoCity = document.querySelector('.splash-howtoplay-video');
  if (howtoVideoCity) { howtoVideoCity.pause(); howtoVideoCity.src = 'images/howtoplay/howtoplay3.mp4'; howtoVideoCity.load(); }
  const howtoTitleCity = document.querySelector('.splash-howtoplay-title');
  if (howtoTitleCity) howtoTitleCity.textContent = 'City Blitz';
  const label = document.querySelector('.splash-text2-label');
  if (label) { label.textContent = '¡Veamos a qué ciudad va cada uno! Aquí es donde tú entras a formar parte.'; label.classList.remove('step2'); }
  document.getElementById('loading-screen').style.display = 'none';
  const splashElCity = document.getElementById('splash-screen');
  splashElCity.style.display = 'flex';
  const animElsCity = splashElCity.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animElsCity.forEach(el => el.classList.remove('animate-in'));
  void splashElCity.offsetWidth;
  animElsCity.forEach(el => el.classList.add('animate-in'));
  playMusic(sfxPostgame);
});

// ── CAMPAÑA: 4 modos encadenados ─────────────────────────────────────────────
window.campaign = {
  active: false,
  idx: 0,
  base: 0,
  btns:  ['loading-flags-btn', 'loading-shapes-btn', 'loading-play-btn', 'loading-mode4-btn'],
  modes: ['flags', 'shapes', 'game', 'monuments'],
  scores: {},
};
// puntaje acumulado de rondas anteriores (0 si no hay campaña activa)
window.campaignBase = function () {
  return (window.campaign && window.campaign.active) ? (window.campaign.base || 0) : 0;
};

document.getElementById('loading-play-single')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  window.campaign.active = true;
  window.campaign.idx = 0;
  window.campaign.base = 0;
  window.campaign.scores = {};
  window.lastModeScore = 0;
  document.getElementById('loading-flags-btn').click();
});

document.getElementById('loading-play-confirm-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const wrap = document.getElementById('loading-play-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  const screen = document.getElementById('loading-screen');
  const tableGroup = document.getElementById('loading-table-group');
  tableGroup.classList.add('table-gone');
  screen.classList.remove('table-shown');
});

document.getElementById('loading-name-edit')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const wrap  = document.getElementById('loading-name-wrap');
  const input = document.getElementById('loading-name-input');
  input.value = localStorage.getItem('playerName') || 'John';
  wrap.classList.add('editing');
  input.focus();
  input.select();
});

function confirmNameChange() {
  const wrap  = document.getElementById('loading-name-wrap');
  const input = document.getElementById('loading-name-input');
  const limpio = input.value.trim().slice(0, 12);
  if (limpio) {
    localStorage.setItem('playerName', limpio);
    const el = document.getElementById('loading-player-name');
    if (el) el.textContent = limpio;
  }
  wrap.classList.remove('editing');
}

document.getElementById('loading-name-confirm')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const c = document.getElementById('loading-name-confirm');
  c.classList.add('confirm-pressed');
  setTimeout(() => c.classList.remove('confirm-pressed'), 50);
  confirmNameChange();
});

document.getElementById('loading-name-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmNameChange(); }
});

document.getElementById('loading-profile-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  document.getElementById('loading-table-group')?.classList.remove('table-gone');
  document.getElementById('loading-screen').classList.add('table-shown');
});

document.getElementById('loading-social-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  document.getElementById('loading-social-group')?.classList.remove('table-gone');
  document.getElementById('loading-screen').classList.add('table-shown');
});

document.getElementById('loading-social-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const wrap = document.getElementById('loading-social-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-social-group')?.classList.add('table-gone');
  document.getElementById('loading-screen').classList.remove('table-shown');
});

// ── Lista de amigos del panel social ─────────────────────────────────────────
const SOCIAL_AVATARS = [
  'images/characters/men1.png', 'images/characters/girl1.png',
  'images/characters/women1.png', 'images/characters/men2.png',
  'images/characters/girl2.png', 'images/characters/women2.png',
  'images/characters/men3.png', 'images/characters/girl3.png',
];
// rank: orden de conexión (0 = más "presente"). minsAgo: antigüedad para
// desempatar a los desconectados (menor = visto hace menos tiempo).
const SOCIAL_STATUSES = [
  { cls: 'playing', text: 'Jugando',            rank: 0, minsAgo: 0 },
  { cls: 'online',  text: 'En línea',           rank: 1, minsAgo: 0 },
  { cls: 'offline', text: 'Última vez hace 2h', rank: 2, minsAgo: 120 },
  { cls: 'offline', text: 'Última vez ayer',    rank: 2, minsAgo: 1440 },
  { cls: 'online',  text: 'En línea',           rank: 1, minsAgo: 0 },
  { cls: 'offline', text: 'Última vez hace 5h', rank: 2, minsAgo: 300 },
];

// Solicitudes de amistad pendientes (mock; reemplazar con datos del backend).
let SOCIAL_REQUESTS = [
  { name: 'Diego',  score: 4820 },
  { name: 'Valentina', score: 19250 },
  { name: 'Mateo',  score: 11340 },
];

let socialActiveTab = 'friends';
let socialSort = localStorage.getItem('socialSort') || 'conn';

// ── Estado de relaciones (favoritos / bloqueados) ────────────────────────────
// Mock persistido en localStorage; al haber backend, reemplazar por datos reales.
// Estado de relaciones: MOCK en memoria (se reinicia al recargar). NO se persiste:
// más adelante esto vendrá del backend/servidor. Ver project_social_backend_todo.
let socialFavorites = new Set();      // nombres marcados como mejor amigo
let socialBlocked   = [];             // [{name,score}] bloqueados
let socialSent      = [];             // [{name,score}] solicitudes que YO envié
function saveSocialRel() { /* no-op: mock en memoria, sin persistir (futuro: server) */ }
function isBlockedName(name) { return socialBlocked.some(b => b.name === name); }
function isSentName(name)    { return socialSent.some(s => s.name === name); }
function isFriendName(name)  { return (typeof getFriends === 'function' ? getFriends() : []).some(f => f.name === name); }
function hasRequestName(name){ return SOCIAL_REQUESTS.some(r => r.name === name); }
function relStatus(name) {
  if (isBlockedName(name))  return 'blocked';
  if (isFriendName(name))   return 'friend';
  if (hasRequestName(name)) return 'request';   // solicitud que me enviaron a mí
  if (isSentName(name))     return 'sent';      // solicitud que yo envié (pendiente)
  return 'none';
}

// El amigo cuyo perfil está abierto (para los botones de relación).
let currentFriendProfile = null;

function updateSocialTabCounts() {
  const friendsTab  = document.getElementById('loading-social-tab-friends');
  const requestsTab = document.getElementById('loading-social-tab-requests');
  if (friendsTab)  friendsTab.textContent  = `Mis Amigos (${(typeof getFriends === 'function' ? getFriends() : []).length})`;
  if (requestsTab) requestsTab.textContent = `Solicitudes (${SOCIAL_REQUESTS.length})`;
}

// Pinta la pestaña activa (amigos o solicitudes).
function renderSocial(filter = '') {
  if (socialActiveTab === 'requests') renderSocialRequests(filter);
  else renderSocialFriends(filter);
}

function renderSocialRequests(filter = '') {
  const list = document.getElementById('loading-social-list');
  if (!list) return;
  updateSocialTabCounts();
  const reqs = SOCIAL_REQUESTS
    .map((f, i) => ({ f, i }))
    .filter(o => o.f.name.toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML = '';
  reqs.forEach(({ f, i }) => {
    const row = document.createElement('div');
    row.className = 'loading-social-row loading-social-request';
    row.innerHTML =
      `<img class="loading-social-avatar" src="${SOCIAL_AVATARS[i % SOCIAL_AVATARS.length]}" alt="" draggable="false" oncontextmenu="return false">` +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${f.name}</span>` +
        `<span class="loading-social-status">Te envió una solicitud</span>` +
      `</div>` +
      `<div class="loading-social-req-actions">` +
        `<button class="loading-social-req-btn accept" type="button" aria-label="Aceptar">✓</button>` +
        `<button class="loading-social-req-btn reject" type="button" aria-label="Rechazar">✕</button>` +
      `</div>`;
    // Click en los botones ✓/✕: acepta/rechaza inline (sin abrir el perfil).
    row.querySelector('.accept').addEventListener('click', (e) => { e.stopPropagation(); respondRequest(f, true); });
    row.querySelector('.reject').addEventListener('click', (e) => { e.stopPropagation(); respondRequest(f, false); });
    // Click en el nombre/celda: abre el perfil (ahí el botón del medio muestra
    // friendreq → al clickearlo pregunta si querés agregarlo).
    const avatar = SOCIAL_AVATARS[i % SOCIAL_AVATARS.length];
    row.addEventListener('click', () => openFriendProfile(f, { cls: 'online', text: 'En línea', rank: 1, minsAgo: 0 }, avatar));
    list.appendChild(row);
  });
}

// Acepta (suma a amigos) o rechaza una solicitud y refresca la lista.
function respondRequest(friend, accepted) {
  sfxCheck.currentTime = 0; sfxCheck.play();
  SOCIAL_REQUESTS = SOCIAL_REQUESTS.filter(r => r !== friend);
  if (accepted && typeof getFriends === 'function') {
    getFriends().push({ name: friend.name, score: friend.score });
  }
  updateSocialTabCounts();
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
}

function renderSocialFriends(filter = '') {
  const list = document.getElementById('loading-social-list');
  if (!list) return;
  updateSocialTabCounts();
  const all = (typeof getFriends === 'function' ? getFriends() : []);
  const sortFns = {
    conn:        (a, b) => (a.st.rank - b.st.rank) || (a.st.minsAgo - b.st.minsAgo),
    'score-desc':(a, b) => b.f.score - a.f.score,
    'score-asc': (a, b) => a.f.score - b.f.score,
    'name-asc':  (a, b) => a.f.name.localeCompare(b.f.name),
    'name-desc': (a, b) => b.f.name.localeCompare(a.f.name),
  };
  const baseSort = sortFns[socialSort] || sortFns.conn;
  const friends = all
    .map((f, i) => ({ f, i, st: SOCIAL_STATUSES[i % SOCIAL_STATUSES.length] }))
    .filter(o => o.f.name.toLowerCase().includes(filter.toLowerCase()))
    .filter(o => !isBlockedName(o.f.name))               // los bloqueados van aparte, al fondo
    // Favoritos (mejor amigo) SIEMPRE arriba, sin importar el sort elegido.
    .sort((a, b) => {
      const fa = socialFavorites.has(a.f.name) ? 0 : 1;
      const fb = socialFavorites.has(b.f.name) ? 0 : 1;
      return (fa - fb) || baseSort(a, b);
    });
  list.innerHTML = '';
  friends.forEach(({ f, i, st }) => {
    const fav = socialFavorites.has(f.name);
    const row = document.createElement('div');
    row.className = 'loading-social-row status-' + st.cls + (fav ? ' is-fav' : '');
    row.innerHTML =
      `<img class="loading-social-avatar" src="${SOCIAL_AVATARS[i % SOCIAL_AVATARS.length]}" alt="" draggable="false" oncontextmenu="return false">` +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${fav ? '★ ' : ''}${f.name}</span>` +
        `<span class="loading-social-status"><span class="dot ${st.cls}"></span>${st.text}</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${f.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(f.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(f.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(f, st, SOCIAL_AVATARS[i % SOCIAL_AVATARS.length]));
    list.appendChild(row);
  });

  // Bloqueados al fondo, en gris, clickeables para abrir su perfil y desbloquear.
  socialBlocked
    .filter(b => b.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach((b, k) => {
      const st = { cls: 'offline', text: 'Bloqueado', rank: 9, minsAgo: 0 };
      const avatar = SOCIAL_AVATARS[k % SOCIAL_AVATARS.length];
      const row = document.createElement('div');
      row.className = 'loading-social-row status-offline is-blocked-row';
      row.innerHTML =
        `<img class="loading-social-avatar" src="${avatar}" alt="" draggable="false" oncontextmenu="return false">` +
        `<div class="loading-social-info">` +
          `<span class="loading-social-name">${b.name}</span>` +
          `<span class="loading-social-status">Bloqueado</span>` +
        `</div>` +
        `<div class="loading-social-score">` +
          `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
          `<span class="loading-social-score-val">${b.score.toLocaleString()}</span>` +
        `</div>` +
        `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(b.score).name : '')}</span>` +
        `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(b.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
      row.addEventListener('click', () => openFriendProfile(b, st, avatar));
      list.appendChild(row);
    });
}

// Abre el table (copia del perfil) con los datos del amigo seleccionado.
function openFriendProfile(friend, st, avatarSrc) {
  sfxCheck.currentTime = 0; sfxCheck.play();
  currentFriendProfile = { name: friend.name, score: friend.score, avatar: avatarSrc, st };
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  const pic = document.getElementById('loading-friend-pic');
  if (pic) pic.src = avatarSrc;
  setText('loading-friend-name', friend.name);

  const total = friend.score;
  setText('loading-friend-total', total.toLocaleString());
  // Veces jugadas estimadas a partir del puntaje (mock; reemplazar con dato real).
  setText('loading-friend-play-count', `¡Ha jugado ${Math.max(1, Math.round(total / 1500))} veces!`);

  // Repartimos el total entre los 4 modos para los highscores y derivamos el
  // promedio (~62%). Cuando el backend traiga highscores por modo, usar esos.
  const split = [0.30, 0.20, 0.28, 0.22];
  split.forEach((p, k) => {
    const hs = Math.round(total * p);
    setText('loading-friend-avg' + (k + 1), hs.toLocaleString());          // columna Highscore
    setText('loading-friend-hs'  + (k + 1), Math.round(hs * 0.62).toLocaleString()); // columna Promedio
  });

  const rk = (typeof getRank === 'function') ? getRank(total) : null;
  const rankImg = document.getElementById('loading-friend-rank');
  if (rankImg && rk) rankImg.src = rk.img;
  const rankLabel = document.getElementById('loading-friend-rank-label');
  if (rankLabel && rk) {
    rankLabel.textContent = rk.name;
    const maxWidth = (rankImg?.offsetWidth || 240) * 1.15;
    let size = 4;
    rankLabel.style.fontSize = size + 'vmin';
    while (rankLabel.scrollWidth > maxWidth && size > 1.6) {
      size -= 0.1;
      rankLabel.style.fontSize = size + 'vmin';
    }
  }

  updateFriendButtons();
  document.getElementById('loading-friend-group')?.classList.remove('table-gone');
}

// ── Botones de relación del perfil de amigo (fav / añadir-aceptar-borrar / bloquear) ──
function updateFriendButtons() {
  const actions = document.getElementById('loading-friend-actions');
  const favBtn  = document.getElementById('loading-friend-fav');
  const relBtn  = document.getElementById('loading-friend-rel');
  const blockBtn= document.getElementById('loading-friend-block');
  if (!actions || !currentFriendProfile) return;
  const name = currentFriendProfile.name;
  const status = relStatus(name);

  // El estado (en línea/desconectado) solo se muestra si es tu amigo; si no lo
  // tenés agregado o está bloqueado, no se muestra.
  const statusEl = document.getElementById('loading-friend-status');
  if (statusEl) {
    const st = currentFriendProfile.st;
    if (status === 'friend' && st) {
      statusEl.style.display = '';
      statusEl.textContent = st.cls === 'offline' ? st.text.replace('Última vez', 'Última conexión') : st.text;
      statusEl.className = 'loading-friend-status ' + st.cls;
    } else {
      statusEl.style.display = 'none';
      statusEl.textContent = '';
    }
  }

  actions.classList.toggle('is-blocked', status === 'blocked');

  // Botón mejor amigo: solo si la persona es amiga (no bloqueada).
  if (status === 'friend') {
    favBtn.classList.remove('hidden');
    favBtn.src = socialFavorites.has(name) ? 'images/bestfriend2.png' : 'images/bestfriend.png';
  } else {
    favBtn.classList.add('hidden');
  }

  // Botón del medio según relación.
  if (status === 'friend')       relBtn.src = 'images/nofriend.png';   // borrar amigo
  else if (status === 'request') relBtn.src = 'images/friendreq.png';  // aceptar solicitud
  else if (status === 'sent')    relBtn.src = 'images/friendsent.png'; // solicitud enviada (pendiente)
  else                           relBtn.src = 'images/friendadd.png';  // añadir
  // (bloqueado: el medio queda en gris vía .is-blocked)

  // Botón de bloquear: si ya está bloqueado, muestra friendunblock.png.
  blockBtn.src = status === 'blocked' ? 'images/friendunblock.png' : 'images/friendblock.png';
}

// Popup de confirmación reutilizable (sí/no).
function showFriendConfirm(text, onYes, showClose = false, onNo = null) {
  const popup = document.getElementById('friend-confirm-popup');
  const txt   = document.getElementById('friend-confirm-text');
  const yes   = document.getElementById('friend-confirm-yes');
  const no    = document.getElementById('friend-confirm-no');
  const xbtn  = document.getElementById('friend-confirm-close');
  if (!popup) return;
  txt.textContent = text;
  popup.style.display = 'flex';
  if (xbtn) xbtn.style.display = showClose ? 'block' : 'none';  // X solo en aceptar solicitud
  const close = () => { popup.style.display = 'none'; yes.onclick = null; no.onclick = null; if (xbtn) xbtn.onclick = null; };
  yes.onclick = () => { sfxCheck.currentTime = 0; sfxCheck.play(); close(); onYes(); };
  no.onclick  = () => { sfxCheck.currentTime = 0; sfxCheck.play(); close(); if (onNo) onNo(); };  // ✕ = acción "no" (si la hay)
  if (xbtn) xbtn.onclick = () => { sfxCheck.currentTime = 0; sfxCheck.play(); close(); };          // X = cerrar sin hacer nada
}

function refreshSocialAfterRel() {
  saveSocialRel();
  updateFriendButtons();
  updateSocialTabCounts();
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
  renderBlockedList(); // mantener el tablero de bloqueados al día
  renderSentList();    // y el de solicitudes enviadas
}

// Sonido al pasar el cursor por los 3 botones de relación.
['loading-friend-fav', 'loading-friend-rel', 'loading-friend-block'].forEach(id => {
  document.getElementById(id)?.addEventListener('mouseenter', () => {
    sfxSelect.currentTime = 0; sfxSelect.play();
  });
});

// Botón mejor amigo: alterna favorito (solo si es amigo).
document.getElementById('loading-friend-fav')?.addEventListener('click', () => {
  if (!currentFriendProfile || relStatus(currentFriendProfile.name) !== 'friend') return;
  sfxCheck.currentTime = 0; sfxCheck.play();
  const name = currentFriendProfile.name;
  if (socialFavorites.has(name)) socialFavorites.delete(name); else socialFavorites.add(name);
  refreshSocialAfterRel();
});

// Botón del medio: añadir / aceptar solicitud / borrar amigo.
document.getElementById('loading-friend-rel')?.addEventListener('click', () => {
  if (!currentFriendProfile) return;
  sfxCheck.currentTime = 0; sfxCheck.play();
  const fp = currentFriendProfile;
  const status = relStatus(fp.name);
  if (status === 'blocked') return;
  if (status === 'friend') {
    showFriendConfirm(`¿Seguro que quieres eliminar a ${fp.name} de tus amigos?`, () => {
      if (typeof getFriends === 'function') {
        const arr = getFriends();
        const idx = arr.findIndex(f => f.name === fp.name);
        if (idx >= 0) arr.splice(idx, 1);
      }
      socialFavorites.delete(fp.name);
      refreshSocialAfterRel();
    });
  } else if (status === 'request') {
    showFriendConfirm(`¿Aceptar la solicitud de amistad de ${fp.name}?`, () => {
      SOCIAL_REQUESTS = SOCIAL_REQUESTS.filter(r => r.name !== fp.name);
      if (typeof getFriends === 'function') getFriends().push({ name: fp.name, score: fp.score });
      refreshSocialAfterRel();
    }, true, () => {
      // ✕ (no) = rechazar: se elimina su solicitud y vuelve friendadd para poder enviarle.
      SOCIAL_REQUESTS = SOCIAL_REQUESTS.filter(r => r.name !== fp.name);
      refreshSocialAfterRel();
    });
  } else if (status === 'sent') {
    showFriendConfirm(`¿Cancelar tu solicitud de amistad a ${fp.name}?`, () => {
      socialSent = socialSent.filter(s => s.name !== fp.name);
      refreshSocialAfterRel();
    });
  } else { // none → enviar solicitud (queda pendiente hasta que la acepten)
    socialSent.push({ name: fp.name, score: fp.score });
    refreshSocialAfterRel();
  }
});

// Botón bloquear / desbloquear.
document.getElementById('loading-friend-block')?.addEventListener('click', () => {
  if (!currentFriendProfile) return;
  sfxCheck.currentTime = 0; sfxCheck.play();
  const fp = currentFriendProfile;
  if (isBlockedName(fp.name)) {
    showFriendConfirm(`¿Quieres desbloquear a ${fp.name}?`, () => {
      socialBlocked = socialBlocked.filter(b => b.name !== fp.name);
      refreshSocialAfterRel();
    });
  } else {
    showFriendConfirm(`¿Quieres bloquear a ${fp.name}?`, () => {
      socialBlocked.push({ name: fp.name, score: fp.score });
      socialFavorites.delete(fp.name);            // pierde el favorito
      socialSent = socialSent.filter(s => s.name !== fp.name); // cancela tu solicitud enviada
      if (typeof getFriends === 'function') {      // se rompe la amistad
        const arr = getFriends();
        const idx = arr.findIndex(f => f.name === fp.name);
        if (idx >= 0) arr.splice(idx, 1);
      }
      SOCIAL_REQUESTS = SOCIAL_REQUESTS.filter(r => r.name !== fp.name); // descarta solicitud entrante
      refreshSocialAfterRel();
    });
  }
});

document.getElementById('loading-friend-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const wrap = document.getElementById('loading-friend-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-friend-group')?.classList.add('table-gone');
});

document.getElementById('loading-social-search-input')?.addEventListener('input', (e) => {
  renderSocial(e.target.value);
});

const SOCIAL_SORTS = [
  { value: 'conn',       label: 'Conexión'    },
  { value: 'score-desc', label: 'Puntaje ↓'   },
  { value: 'score-asc',  label: 'Puntaje ↑'   },
  { value: 'name-asc',   label: 'Nombre A-Z'  },
  { value: 'name-desc',  label: 'Nombre Z-A'  },
];
document.getElementById('loading-social-sort')?.addEventListener('click', () => {
  // Clonamos el audio para que clicks rápidos no se corten entre sí
  const s = sfxSelect.cloneNode();
  s.volume = sfxSelect.volume;
  s.play();
  const idx = SOCIAL_SORTS.findIndex(s => s.value === socialSort);
  const next = SOCIAL_SORTS[(idx + 1) % SOCIAL_SORTS.length];
  socialSort = next.value;
  localStorage.setItem('socialSort', socialSort);
  const btn = document.getElementById('loading-social-sort');
  if (btn) btn.textContent = next.label;
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

// Restaura la etiqueta del botón con el orden guardado
(() => {
  const btn = document.getElementById('loading-social-sort');
  const cur = SOCIAL_SORTS.find(s => s.value === socialSort);
  if (btn && cur) btn.textContent = cur.label;
})();

document.getElementById('loading-social-tab-friends')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxSelect.play();
  socialActiveTab = 'friends';
  document.querySelectorAll('.loading-social-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('loading-social-tab-friends').classList.add('active');
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

document.getElementById('loading-social-tab-requests')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxSelect.play();
  socialActiveTab = 'requests';
  document.querySelectorAll('.loading-social-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('loading-social-tab-requests').classList.add('active');
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

// ── Panel Añadir Amigo ────────────────────────────────────────────────────────
document.getElementById('loading-social-invite')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const input = document.getElementById('loading-addfriend-input');
  const fb = document.getElementById('loading-addfriend-feedback');
  if (input) input.value = '';
  if (fb) fb.className = 'loading-addfriend-feedback';
  document.getElementById('loading-addfriend-group')?.classList.remove('table-gone');
  input?.focus();
});

function sendFriendRequest() {
  const input = document.getElementById('loading-addfriend-input');
  const fb = document.getElementById('loading-addfriend-feedback');
  const name = (input?.value || '').trim();
  if (!fb) return;
  if (!name) {
    fb.textContent = 'Escribe un nombre';
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  const friends = (typeof getFriends === 'function' ? getFriends() : []);
  const taken = friends.some(f => f.name.toLowerCase() === name.toLowerCase()) ||
                SOCIAL_REQUESTS.some(r => r.name.toLowerCase() === name.toLowerCase()) ||
                socialSent.some(s => s.name.toLowerCase() === name.toLowerCase()) ||
                isBlockedName(name);
  if (taken) {
    fb.textContent = 'Ya está en tu lista';
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  sfxCheck.currentTime = 0; sfxCheck.play();
  // Queda como solicitud enviada (pendiente) → aparece en el tablero de enviadas.
  socialSent.push({ name, score: Math.floor(Math.random() * 50000) });
  saveSocialRel();
  fb.textContent = `¡Solicitud enviada a ${name}!`;
  fb.className = 'loading-addfriend-feedback ok show';
  if (input) input.value = '';
}

document.getElementById('loading-addfriend-send')?.addEventListener('click', sendFriendRequest);
document.getElementById('loading-addfriend-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendFriendRequest(); }
});

document.getElementById('loading-addfriend-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const wrap = document.getElementById('loading-addfriend-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-addfriend-group')?.classList.add('table-gone');
});

// ── Tablero de bloqueados ─────────────────────────────────────────────────────
let blockedSort = 'az'; // 'az' | 'za'
function renderBlockedList() {
  const list = document.getElementById('loading-blocked-list');
  if (!list) return;
  const filter = (document.getElementById('loading-blocked-search-input')?.value || '').toLowerCase();
  list.innerHTML = '';
  const entries = socialBlocked
    .filter(b => b.name.toLowerCase().includes(filter))
    .slice()
    .sort((a, b) => blockedSort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = socialBlocked.length === 0 ? 'No tienes a nadie bloqueado.' : 'Sin resultados.';
    list.appendChild(empty);
    return;
  }
  entries.forEach((b, k) => {
    const avatar = SOCIAL_AVATARS[k % SOCIAL_AVATARS.length];
    const row = document.createElement('div');
    row.className = 'loading-social-row is-blocked-row';
    row.innerHTML =
      `<img class="loading-social-avatar" src="${avatar}" alt="" draggable="false" oncontextmenu="return false">` +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${b.name}</span>` +
        `<span class="loading-social-status">Bloqueado</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${b.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(b.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(b.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(b, { cls: 'offline', text: 'Bloqueado', rank: 9, minsAgo: 0 }, avatar));
    list.appendChild(row);
  });
}

// Bloquea/restaura los clicks de la lista de amigos (para no clickear un amigo
// durante la transición de entrada de un sub-tablero).
function setSocialListClickable(on) {
  const list = document.getElementById('loading-social-list');
  if (list) list.style.pointerEvents = on ? '' : 'none';
}

document.getElementById('loading-social-blockbtn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  renderBlockedList();
  setSocialListClickable(false);
  document.getElementById('loading-blocked-group')?.classList.remove('table-gone');
});
document.getElementById('loading-social-blockbtn')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxSelect.play();
});

document.getElementById('loading-blocked-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const wrap = document.getElementById('loading-blocked-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-blocked-group')?.classList.add('table-gone');
  setSocialListClickable(true);
});

document.getElementById('loading-blocked-search-input')?.addEventListener('input', () => renderBlockedList());

document.getElementById('loading-blocked-sort')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  blockedSort = blockedSort === 'az' ? 'za' : 'az';
  const btn = document.getElementById('loading-blocked-sort');
  if (btn) btn.textContent = blockedSort === 'az' ? 'A-Z' : 'Z-A';
  renderBlockedList();
});
document.getElementById('loading-blocked-sort')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxSelect.play();
});

// ── Tablero de solicitudes enviadas (pendientes) ──────────────────────────────
let sentSort = 'az'; // 'az' | 'za'
function renderSentList() {
  const list = document.getElementById('loading-sent-list');
  if (!list) return;
  const filter = (document.getElementById('loading-sent-search-input')?.value || '').toLowerCase();
  list.innerHTML = '';
  const entries = socialSent
    .filter(s => s.name.toLowerCase().includes(filter))
    .slice()
    .sort((a, b) => sentSort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = socialSent.length === 0 ? 'No tienes solicitudes pendientes.' : 'Sin resultados.';
    list.appendChild(empty);
    return;
  }
  entries.forEach((s, k) => {
    const avatar = SOCIAL_AVATARS[k % SOCIAL_AVATARS.length];
    const row = document.createElement('div');
    row.className = 'loading-social-row';
    row.innerHTML =
      `<img class="loading-social-avatar" src="${avatar}" alt="" draggable="false" oncontextmenu="return false">` +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${s.name}</span>` +
        `<span class="loading-social-status">Solicitud pendiente</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${s.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(s.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(s.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(s, { cls: 'online', text: 'En línea', rank: 1, minsAgo: 0 }, avatar));
    list.appendChild(row);
  });
}

document.getElementById('loading-social-sentbtn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  renderSentList();
  setSocialListClickable(false);
  document.getElementById('loading-sent-group')?.classList.remove('table-gone');
});
document.getElementById('loading-social-sentbtn')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxSelect.play();
});

document.getElementById('loading-sent-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  const wrap = document.getElementById('loading-sent-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-sent-group')?.classList.add('table-gone');
  setSocialListClickable(true);
});

document.getElementById('loading-sent-search-input')?.addEventListener('input', () => renderSentList());

document.getElementById('loading-sent-sort')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxCheck.play();
  sentSort = sentSort === 'az' ? 'za' : 'az';
  const btn = document.getElementById('loading-sent-sort');
  if (btn) btn.textContent = sentSort === 'az' ? 'A-Z' : 'Z-A';
  renderSentList();
});
document.getElementById('loading-sent-sort')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxSelect.play();
});

// Cada modo registra aquí cómo detener sus loops (timers/animaciones)
window.gameStoppers = window.gameStoppers || [];
window.gameStoppers.push(() => {
  try { pregameAborted = true; clearTimeout(pregameTimeout); pregameTimeout = null; } catch (e) {}
  try { gameAborted = true; clearTimeout(endGameTimeout1); clearTimeout(endGameTimeout2); } catch (e) {}
  try { clearInterval(timerIntervalId); } catch (e) {}
  try { if (animFrameId) cancelAnimationFrame(animFrameId); animFrameId = null; } catch (e) {}
  try { if (typeof pregameCountdownEl !== 'undefined' && pregameCountdownEl) pregameCountdownEl.style.display = 'none'; } catch (e) {}
  try { if (typeof timeupOverlay !== 'undefined' && timeupOverlay) { timeupOverlay.style.display = 'none'; timeupOverlay.classList.remove('timeup-in','timeup-out'); } } catch (e) {}
});

// Termina la partida en curso (cualquier modo) y vuelve al menú principal sin recargar.
function quitToMenu() {
  // Invalida cualquier callback diferido (nextCity, pines, badges, etc.) en vuelo
  window.gameSession = (window.gameSession || 0) + 1;

  // 1) Detener loops (timers/animaciones) de todos los modos
  window.gameStoppers.forEach(fn => { try { fn(); } catch (e) {} });

  // 2) Cortar TODO el audio del juego y poner la música del menú
  [sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus,
   sfxTickdown, sfxTimesUp, sfxGameMusic].forEach(s => {
    try { if (s) { s.pause(); s.currentTime = 0; } } catch (e) {}
  });
  try { playMusic(sfxPostgame); } catch (e) {}

  // 3) Resetear el estado de juego de monuments/cities
  try { resetState(); } catch (e) {}

  // 4) Limpiar diálogos, overlays, animaciones y movimiento ingame
  const reset = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  reset('city-tag',         el => { el.style.left = tpx(-525); });
  reset('result-label',     el => { el.textContent = ''; el.style.animation = ''; });
  reset('coord-tooltip',    el => { el.style.display = 'none'; });
  reset('monument-img',     el => { el.style.display = 'none'; });
  reset('speed-bonus-text', el => el.classList.remove('visible'));
  reset('flags-speed-bonus-text', el => el.classList.remove('visible'));
  // Reconstruir la barra de amigos (no vaciarla: shapes/cities no la re-inicializan
  // por partida, solo la reposicionan, así que vaciarla la dejaría vacía).
  try { initLeaderboard(); } catch (e) {}
  reset('pregame-countdown',       el => { el.style.display = 'none'; });
  reset('flags-pregame-countdown', el => { el.style.display = 'none'; });
  reset('timeup-overlay',       el => { el.style.display = 'none'; el.classList.remove('timeup-in','timeup-out'); });
  reset('flags-timeup-overlay', el => { el.style.display = 'none'; el.classList.remove('timeup-in','timeup-out'); });
  reset('flags-check-overlay',  el => { el.classList.remove('animate'); el.style.display = 'none'; el.style.opacity = ''; });
  reset('flags-wrong-overlay',  el => { el.classList.remove('animate'); el.style.display = 'none'; el.style.opacity = ''; });
  // Apagar los puntos del progreso y el "trencito" (todos los modos)
  document.querySelectorAll('.dot').forEach(d => d.classList.remove('filled'));
  ['progress-dots','flags-progress-dots'].forEach(id => {
    document.getElementById(id)?.classList.remove('train-animation', 'dots-fade-out');
  });
  // Limpiar el canvas principal (puntos, pines, partículas, badges dibujados)
  try { if (typeof ctx !== 'undefined' && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (e) {}

  // 5) Resetear el estado de los diálogos del splash (pregame)
  try { confirmStep = 0; } catch (e) {}
  document.querySelector('.splash-howtoplay-wrap')?.classList.remove('slide-down');
  const lbl = document.querySelector('.splash-text2-label');
  if (lbl) { lbl.classList.remove('step2'); lbl.textContent = ''; }
  document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap')
    .forEach(el => el.classList.remove('animate-in'));

  // 6) Cortar música/animaciones de campaña
  if (window.campaign) window.campaign.active = false;

  // 7) Ocultar todas las pantallas de juego/resultados y el HUD
  ['game-wrapper','flags-wrapper','splash-screen','gameover-screen','results-screen',
   'final-screen','score-display','right-panel','flags-score-display',
   'flags-right-panel','new-highscore-banner','countdown-widget',
   'flags-countdown-widget','shapes-countdown-widget'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // 8) Mostrar el menú principal limpio
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.display = ''; ls.classList.remove('table-shown'); }
  ['loading-table-group','loading-social-group','loading-friend-group','loading-addfriend-group','loading-blocked-group','loading-sent-group']
    .forEach(id => document.getElementById(id)?.classList.add('table-gone'));
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
}
window.quitToMenu = quitToMenu;

// ── Power.png ingame (fijo arriba al centro, como el botón de silencio) ────────
// Visible solo en pre/in/postgame; oculto en loading, results y final.
(() => {
  const powerEl = document.getElementById('ingame-power');
  if (!powerEl) return;
  const isVisible = id => {
    const el = document.getElementById(id);
    return el && getComputedStyle(el).display !== 'none';
  };
  const refreshIngamePower = () => {
    const blocked = isVisible('loading-screen') || isVisible('results-screen') || isVisible('final-screen');
    const prepost = isVisible('splash-screen') || isVisible('gameover-screen');
    // score-display / flags-score-display están visibles durante el juego de
    // cualquier modo (shapes agrega sus piezas al body, no usa game-wrapper).
    const ingame  = prepost || isVisible('game-wrapper') || isVisible('flags-wrapper') ||
                    isVisible('score-display') || isVisible('flags-score-display');
    powerEl.style.display = (ingame && !blocked) ? 'block' : 'none';
    // En pre/postgame va un poco más a la derecha que durante el juego
    powerEl.style.left = prepost ? '82%' : '74%';
  };
  window.refreshIngamePower = refreshIngamePower;

  // Click en power: abre la pestañita de confirmación (el juego sigue corriendo)
  const quitPopup = document.getElementById('ingame-quit-popup');
  powerEl.addEventListener('click', () => {
    const a = new Audio('sfx/select.mp3'); a.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; a.play();
    if (quitPopup) quitPopup.style.display = 'flex';
    document.body.classList.add('quit-open');
  });
  document.getElementById('ingame-quit-cancel')?.addEventListener('click', () => {
    const a = new Audio('sfx/select.mp3'); a.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; a.play();
    if (quitPopup) quitPopup.style.display = 'none';
    document.body.classList.remove('quit-open');
  });
  document.getElementById('ingame-quit-confirm')?.addEventListener('click', () => {
    const a = new Audio('sfx/check.mp3'); a.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; a.play();
    if (quitPopup) quitPopup.style.display = 'none';
    document.body.classList.remove('quit-open');
    quitToMenu();
  });
  // Reacciona a cualquier cambio de display (las pantallas se togglean por estilo inline)
  const obs = new MutationObserver(refreshIngamePower);
  ['loading-screen','splash-screen','game-wrapper','flags-wrapper',
   'gameover-screen','results-screen','final-screen','score-display',
   'flags-score-display'].forEach(id => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['style'] });
  });
  refreshIngamePower();
})();

// ranks.js se carga después de este archivo; esperamos a que todo esté listo
// para que getRank() exista al pintar los rangos de cada amigo.
window.addEventListener('load', () => renderSocial());
if (typeof onFriendsUpdate === 'function') onFriendsUpdate(() => renderSocial());

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
  if (isMuted) getAllSfx().forEach(sfx => { sfx.volume = 0; });
}

// Camino PC (y fallback): <audio> HTML de siempre. NO TOCAR.
function playMusicHTML(track) {
  [sfxPostgame, sfxGameMusic].forEach(t => { if (t !== track) { t.pause(); t.currentTime = 0; } });
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

// ── CONFIG ──────────────────────────────────────────────────────────────────
const GAME_DURATION   = 60;
const BONUS_TIME      = 5;
const DOTS_NEEDED     = 10;
const SPEED_BONUS_WIN = 3;
const SPEED_MULT      = 1.25;

// Pixel thresholds on the DISPLAYED canvas
const PERFECT_PX = 6;
const GOOD_PX    = 20;
const FAIR_PX    = 45;

const SCORE_MAP = { perfect: 300, good: 150, fair: 50, wayoff: 0 };
const LABEL_MAP = { perfect: 'Perfecto', good: 'Bien', fair: 'Regular', wayoff: 'Muy lejos' };

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
  Math.floor((window.innerWidth  - _pad * 2) * _scale),
  Math.floor((window.innerHeight - _pad * 2) * MAP_ASPECT * _scale)
);
const DISPLAY_H = Math.round(DISPLAY_W / MAP_ASPECT);

// El cartel (tag3.png), la foto (photo.png) y la imagen del monumento estaban en
// px fijos, pero el canvas/mapa mide DISPLAY_W (variable según pantalla). En
// pantallas chicas (iOS landscape) esos px quedaban enormes respecto al mapa.
// Escalamos su geometría proporcional a DISPLAY_W, con clamp a 1 para que en
// desktop quede idéntico a antes y solo se achique en pantallas pequeñas.
// 1190 ≈ DISPLAY_W de un desktop típico; el factor 1.15 agranda el cartel/foto un
// 15% en todas las pantallas (en PC se veían algo chicos) manteniendo la
// proporción responsiva en pantallas pequeñas.
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

// Aplica la geometría del cartel/foto/monumento escalada a DISPLAY_W (ver TAG_SCALE).
// Se ejecuta una vez; los clones (ghosts) heredan estos estilos inline.
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

// Badges cargados diferido — no se necesitan hasta el gameover
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
  const IMG_W = 6.4;   // vmin (coincide con .checks-row/.wrongs-row img)
  const BASE_GAP = 0.33; // vmin
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = total > 1 ? (total > 12 ? (MAX_W - total * IMG_W) / (total - 1) : BASE_GAP) : 0;
  if (total === 0) {
    const none = document.createElement('span');
    none.textContent = 'None';
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:0.77vmin #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:4.5vmin;font-weight:bold;position:relative;left:2.2vmin;';
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
    if (i < total - 1) img.style.marginRight = `${gap}vmin`;
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
  const IMG_W = 6.4;   // vmin (coincide con .checks-row/.wrongs-row img)
  const BASE_GAP = 0.33; // vmin
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = total > 1 ? (total > 12 ? (MAX_W - total * IMG_W) / (total - 1) : BASE_GAP) : 0;

  if (total === 0) {
    const none = document.createElement('span');
    none.textContent = 'None';
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:0.77vmin #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:4.5vmin;font-weight:bold;position:relative;left:2.2vmin;opacity:0;';
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
    if (i < total - 1) img.style.marginRight = `${gap}vmin`;
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


// ── LEADERBOARD ──────────────────────────────────────────────────────────────────────────────
const LB_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
                    '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a'];
// La barra de amigos ingame se construye desde la capa de datos compartida
// (js/friends.js -> getFriends()), la misma que usan las pantallas results/final.
// friends.js se carga antes que este archivo, así getFriends() ya tiene datos.
function buildFriendPlayers() {
  const src = (typeof getFriends === 'function') ? getFriends() : [];
  return src.map((f, i) => ({
    id: `friend${i}`,
    name: f.name,
    score: f.score,
    color: LB_COLORS[i % LB_COLORS.length],
    initial: (f.name && f.name[0]) ? f.name[0].toUpperCase() : '?',
  }));
}
let mockPlayers = buildFriendPlayers();

// Highscore global = mejor total de campaña (suma de los 4 modos), guardado por
// results.js en localStorage 'totalHighscore'. La barra es universal, así que la
// entrada ★ best usa ese total, no el highscore de un modo individual.
function getTotalHighscore() {
  return parseInt(localStorage.getItem('totalHighscore') || '0', 10) || 0;
}
const highscorePlayer = { id: 'best', score: getTotalHighscore(), color: '#6a0dad', initial: '★' };

const LB_WINDOW  = 5;
const LB_PIN_ROW = 2;
const LB_GAP     = 4;
let lbElements   = {};

const EMOTE_SRCS = [
  'images/emotes/1.png',
  'images/emotes/2.png',
  'images/emotes/3.png',
  'images/emotes/4.png',
  'images/emotes/5.png',
  'images/emotes/6.png',
];

function spawnEmoteBubble(entryEl) {
  const bubble = document.createElement('div');
  bubble.className = 'emote-bubble';

  const img = document.createElement('img');
  img.src = EMOTE_SRCS[Math.floor(Math.random() * EMOTE_SRCS.length)];
  img.className = 'emote-img';
  bubble.appendChild(img);

  entryEl.appendChild(bubble);
  bubble.addEventListener('animationend', () => bubble.remove());
}

let lastPlayerRank = -1;

function getLbRowHeight() {
  const panel = document.getElementById('right-panel');
  if (!panel) return 84;
  return Math.round(panel.getBoundingClientRect().width * 1.5) + LB_GAP;
}

function initLeaderboard() {
  const lb = document.getElementById('leaderboard');
  lb.innerHTML = '';
  lbElements = {};
  mockPlayers = buildFriendPlayers(); // refrescar con la lista real de amigos
  highscorePlayer.score = getTotalHighscore(); // ★ best = highscore global de campaña

  mockPlayers.forEach(p => {
    const el = document.createElement('div');
    el.className = 'lb-entry';
    el.id = `lb-${p.id}`;
    el.innerHTML = `<div class="lb-avatar" style="background:${p.color}">${p.initial}</div>`
                 + `<span class="lb-score">${p.score.toLocaleString()}</span>`;
    el.style.transition = 'none';
    el.style.top = '-9999px';
    lbElements[el.id] = el;
    lb.appendChild(el);
  });

  const bestEl = document.createElement('div');
  bestEl.className = 'lb-entry lb-best';
  bestEl.id = 'lb-best';
  bestEl.innerHTML = `<div class="lb-avatar lb-avatar-best">★</div>`
                   + `<span class="lb-score" id="lb-best-score">${highscorePlayer.score > 0 ? highscorePlayer.score.toLocaleString() : '—'}</span>`;
  bestEl.style.transition = 'none';
  bestEl.style.top = '-9999px';
  lbElements['lb-best'] = bestEl;
  lb.appendChild(bestEl);

  const playerEl = document.createElement('div');
  playerEl.className = 'lb-entry lb-player';
  playerEl.id = 'lb-player';
  playerEl.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" src="images/ppdefault.png"></div>`
                     + `<span class="lb-score" id="lb-player-score">0</span>`;
  playerEl.style.transition = 'none';
  playerEl.style.top = '-9999px';
  lbElements['lb-player'] = playerEl;
  lb.appendChild(playerEl);

  requestAnimationFrame(() => {
    positionLeaderboard(0, false);
    requestAnimationFrame(() => {
      Object.values(lbElements).forEach(el => {
        el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)';
      });
    });
  });
}

function positionLeaderboard(playerScore, animate) {
  // La barra es universal para toda la campaña: el jugador compite con el puntaje
  // acumulado (base de modos previos + modo actual), no con el de cada juego.
  playerScore += (window.campaignBase ? window.campaignBase() : 0);
  const lb   = document.getElementById('leaderboard');
  const rowH = getLbRowHeight();

  lb.style.height = (LB_WINDOW * rowH - LB_GAP) + 'px';

  const all = [...mockPlayers, { id: 'best', score: highscorePlayer.score }, { id: 'player', score: playerScore }];
  all.sort((a, b) => b.score - a.score);

  const playerRank = all.findIndex(p => p.id === 'player');

  if (animate && lastPlayerRank !== -1 && playerRank < lastPlayerRank) {
    let bubbleIndex = 0;
    for (let r = lastPlayerRank; r >= playerRank + 1; r--) {
      const overtaken = all[r];
      if (overtaken && overtaken.id !== 'player') {
        const overtakenEl = lbElements[`lb-${overtaken.id}`];
        if (overtakenEl) {
          setTimeout(() => spawnEmoteBubble(overtakenEl), 200 + bubbleIndex * 100);
          bubbleIndex++;
        }
      }
    }
  }
  lastPlayerRank = playerRank;

  let windowStart = Math.max(0, playerRank - LB_PIN_ROW);
  let windowEnd   = Math.min(all.length, windowStart + LB_WINDOW);
  windowStart     = Math.max(0, windowEnd - LB_WINDOW);

  if (!animate) {
    Object.values(lbElements).forEach(el => { el.style.transition = 'none'; });
  }

  all.forEach((p, rank) => {
    lbElements[`lb-${p.id}`].style.top = ((rank - windowStart) * rowH) + 'px';
  });

  const scoreEl = lbElements['lb-player'].querySelector('.lb-score');
  if (scoreEl) scoreEl.textContent = playerScore.toLocaleString();
}

let lastLbScore = -1;
function sortLeaderboard(playerScore) {
  if (playerScore === lastLbScore) return;
  lastLbScore = playerScore;
  positionLeaderboard(playerScore, true);
}

initLeaderboard();
// Cuando la capa de datos refresque la lista (p.ej. al llegar amigos reales del
// servidor vía loadFriends), reconstruir la barra automáticamente.
if (typeof onFriendsUpdate === 'function') onFriendsUpdate(() => initLeaderboard());
if (typeof loadFriends === 'function') loadFriends();

function resetState() {
  state = {
    phase: 'idle',
    timeLeft: GAME_DURATION,
    score: 0,
    displayedScore: 0,
    dots: 0,
    cityPool: shuffle([...CITIES]),
    monumentPool: shuffle([...MONUMENTS_EASY]),
    monumentsCorrectCount: 0,
    monumentsUnlocked: false,
    monumentsSeen: new Set(),
    poolIndex: 0,
    currentCity: null,
    cityShownAt: 0,
    placedDots: [],
    pin1Anim: null,
    pin2Anim: null,
    starParticles: [],
    sunburst: null,
    badgeAnim: null,
    lastTimestamp: null,
    streak: 0,
  };
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function latLonToCanvas(lat, lon) {
  const x = ((lon - MAP_LON_LEFT) / (MAP_LON_RIGHT - MAP_LON_LEFT)) * DISPLAY_W;
  const y = ((MERC_TOP - mercatorY(lat)) / (MERC_TOP - MERC_BOT)) * DISPLAY_H;
  return { x, y };
}


function dist(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function classify(px) {
  if (px <= PERFECT_PX) return 'perfect';
  if (px <= GOOD_PX)    return 'good';
  if (px <= FAIR_PX)    return 'fair';
  return 'wayoff';
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1)      return n1 * t * t;
  if (t < 2 / d1)      return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1)    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

// ── TAG ANIMATION ────────────────────────────────────────────────────────────
function slideTagIn(cityName, countryCode) {
  const wasVisible = cityTagEl.style.left !== '' && cityTagEl.style.left !== tpx(-525);
  if (wasVisible) {
    const ghost = cityTagEl.cloneNode(true);
    ghost.className = 'city-tag-ghost';
    ghost.style.visibility = 'visible';
    ghost.style.zIndex = '9';
    ghost.style.transition = 'none';
    ghost.style.top  = cityTagEl.style.top  || tpx(10);
    ghost.style.left = cityTagEl.style.left || tpx(-90);
    gameWrapper.appendChild(ghost);
    setTimeout(() => {
      ghost.style.transition = 'opacity 0.3s';
      ghost.style.opacity = '0';
      setTimeout(() => ghost.remove(), 350);
    }, 450);
  }

  if (slideTagIn._countryTimer) clearTimeout(slideTagIn._countryTimer);
  slideTagIn._hintShown = false;

  function setTagText(text) {
    cityTagText.textContent = text;
    const baseSize = 26 * TAG_SCALE;
    const maxWidth = 230 * TAG_SCALE;
    const minSize  = 14 * TAG_SCALE;
    cityTagText.style.fontSize = baseSize + 'px';
    let fs = baseSize;
    while (fs > minSize && cityTagText.scrollWidth > maxWidth) {
      fs -= TAG_SCALE;
      cityTagText.style.fontSize = fs + 'px';
    }
  }

  setTagText(cityName);
  if (countryCode) {
    slideTagIn._countryTimer = setTimeout(() => {
      slideTagIn._hintShown = true;
      setTagText(`${cityName}, ${countryCode}`);
    }, 5000);
  }

  cityTagEl.style.visibility = 'hidden';
  cityTagEl.style.transition = 'none';
  cityTagEl.style.top  = tpx(-163);
  cityTagEl.style.left = tpx(-525);
  setTimeout(() => { sfxTag.currentTime = 0; sfxTag.play(); }, 200);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cityTagEl.style.visibility = 'visible';
      cityTagEl.style.transition = 'left 0.45s cubic-bezier(0.22,1,0.36,1), top 0.45s cubic-bezier(0.22,1,0.36,1)';
      cityTagEl.style.left = tpx(-90);
      cityTagEl.style.top  = tpx(-50);
    });
  });
}

// ── DOTS ─────────────────────────────────────────────────────────────────────
function updateDotsUI() {
  progressDots.forEach((d, i) => d.classList.toggle('filled', i < state.dots));
}

// Extra de tiempo "+Ns" bajo el contador al completar 10 dots. Genérico para los
// 4 modos (cities/monuments, flags, shapes). + (0.1s) y Ns (0.2s) hacen pop de
// 0.5x→1.75x→1x; al terminar ambos, 1s quieto y luego fade out de 0.1s.
function playTimeBonus(el, seconds) {
  if (!el) return;
  const num = el.querySelector('.tb-num');
  if (num) num.textContent = seconds + 's';
  if (el._tbT1) clearTimeout(el._tbT1);
  if (el._tbT2) clearTimeout(el._tbT2);
  el.classList.remove('show', 'fade');
  el.style.display = 'block';
  el.style.opacity = '1';
  void el.offsetWidth;            // reinicia las animaciones
  el.classList.add('show');
  el._tbT1 = setTimeout(() => {
    el.classList.add('fade');
    void el.offsetWidth;
    el.style.opacity = '0';
    el._tbT2 = setTimeout(() => {
      el.style.display = 'none';
      el.classList.remove('show', 'fade');
    }, 100);
  }, 550 + 1000);
}
window.playTimeBonus = playTimeBonus;

function showTimeBonus() {
  playTimeBonus(document.getElementById('time-bonus'), BONUS_TIME);
}

function advanceDot() {
  state.dots++;
  updateDotsUI();

  if (state.dots >= DOTS_NEEDED && !progressContainer.classList.contains('train-animation')) {
    progressContainer.classList.add('train-animation');

    state.timeLeft = Math.min(state.timeLeft + BONUS_TIME, 99);
    timerNumberEl.textContent = state.timeLeft;
    showTimeBonus();

    const originalColor = timerNumberEl.style.color;
    timerNumberEl.style.color = '#00ff88';

    setTimeout(() => {
      progressContainer.classList.add('dots-fade-out');

      setTimeout(() => {
        state.dots = Math.max(0, state.dots - DOTS_NEEDED);
        progressContainer.classList.remove('train-animation', 'dots-fade-out');
        updateDotsUI();

        if (state.timeLeft <= 10) {
          timerNumberEl.style.color = '#ffffff';
          countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdownred4.png' : 'images/countdownred.png';
        } else {
          timerNumberEl.style.color = originalColor;
          countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdown4.png' : 'images/countdown.png';
        }
      }, 500);

    }, 2000);
  }
}

// ── SCORE ─────────────────────────────────────────────────────────────────────
function computeScore(grade, cityShownAt) {
  const base    = SCORE_MAP[grade];
  const elapsed = (Date.now() - cityShownAt) / 1000;
  const ratio   = base > 0 ? Math.max(0, 1 - elapsed / SPEED_BONUS_WIN) : 0;
  const bonusAmt = Math.round(base * (SPEED_MULT - 1) * ratio);
  return { base, bonusAmt, total: base + bonusAmt };
}

// ── RESULT LABEL ─────────────────────────────────────────────────────────────
function showResultLabel(cx, cy, grade, base, bonusAmt) {
  if (grade === 'wayoff')        { sfxError.currentTime    = 0; sfxError.play(); }
  else if (grade === 'perfect')  { sfxVeryNice.currentTime = 0; sfxVeryNice.play(); }
  else                           { sfxAcertar.currentTime  = 0; sfxAcertar.play(); }

  resultLabel.textContent = LABEL_MAP[grade];
  resultLabel.className = grade;

  const lx = Math.max(4, Math.min(cx - 70, DISPLAY_W - 200));
  const ly = Math.max(4, cy - 102);
  resultLabel.style.left = `${lx}px`;
  resultLabel.style.top  = `${ly}px`;

  void resultLabel.offsetWidth;
  resultLabel.classList.add('visible');
}

// ── STAR PARTICLES ───────────────────────────────────────────────────────────
function spawnStars(cx, cy) {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2;
    state.starParticles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      opacity: 1,
      size: 14 + Math.random() * 10,
      life: 0,
    });
  }
}

// ── NEXT CITY ─────────────────────────────────────────────────────────────────
function nextCity() {
  // Si se abandonó la partida (volvió al menú), no reactivar nada
  if (!state || document.getElementById('loading-screen')?.style.display !== 'none') return;
  if (window.pendingGameMode === 'monuments') {
    if (document.body.classList.contains('recording-mode')) {
      state.currentCity = MONUMENTS.find(m => m.name === 'Coliseo Romano') || MONUMENTS_EASY[0];
    } else {
      if (state.poolIndex >= state.monumentPool.length) {
        const base = state.monumentsUnlocked ? MONUMENTS : MONUMENTS_EASY;
        const unseen = base.filter(m => !state.monumentsSeen.has(m.name));
        state.monumentPool = shuffle(unseen.length ? unseen : [...base]);
        state.poolIndex = 0;
      }
      state.currentCity = state.monumentPool[state.poolIndex++];
    }
    state.cityShownAt = Date.now();
    state.phase = 'waiting';
    slideMonumentIn(state.currentCity);
  } else {
    if (state.poolIndex >= state.cityPool.length) {
      state.cityPool = shuffle([...CITIES]);
      state.poolIndex = 0;
    }
    state.currentCity = state.cityPool[state.poolIndex++];
    state.cityShownAt = Date.now();
    state.phase = 'waiting';
    slideTagIn(state.currentCity.name, state.currentCity.country);
  }
}

function slideMonumentIn(monument) {
  const wasVisible = cityTagEl.style.visibility === 'visible';
  if (wasVisible) {
    const ghost = cityTagEl.cloneNode(true);
    ghost.className = 'city-tag-ghost';
    ghost.style.left       = cityTagEl.style.left;
    ghost.style.top        = cityTagEl.style.top;
    ghost.style.visibility = 'visible';
    ghost.style.zIndex     = '9';
    ghost.style.transition = 'none';
    ghost.style.opacity    = '1';
    gameWrapper.appendChild(ghost);
    const ghostImg = ghost.querySelector('img');
    if (ghostImg) ghostImg.classList.add('monument-exit');
    const ghostMonumentImg = ghost.querySelector('#monument-img');
    if (ghostMonumentImg) ghostMonumentImg.classList.add('monument-exit');
    const ghostMonumentName = ghost.querySelector('#monument-name');
    if (ghostMonumentName && ghostMonumentName.textContent) ghostMonumentName.classList.add('monument-exit');
    setTimeout(() => ghost.remove(), 300);
  }

  const tagImg = cityTagEl.querySelector('img');
  tagImg.src = 'images/photo.png';
  tagImg.style.width  = tpx(431);
  tagImg.style.height = 'auto';
  cityTagText.style.display = 'none';
  monumentImgEl.src = `images/places/${monument.img}`;
  monumentImgEl.style.display = 'block';

  cityTagEl.style.transition  = 'none';
  cityTagEl.style.left        = tpx(-50);
  cityTagEl.style.top         = tpx(-55);
  cityTagEl.style.visibility  = 'visible';
  setTimeout(() => { sfxTag.currentTime = 0; sfxTag.play(); }, 200);

  monumentNameEl.textContent = '';
  monumentNameEl.style.opacity = '0';
  if (slideMonumentIn._nameTimer) clearTimeout(slideMonumentIn._nameTimer);
  slideMonumentIn._nameTimer = setTimeout(() => {
    monumentNameEl.textContent = monument.name;
    monumentNameEl.style.opacity = '1';
  }, 3500);

  tagImg.classList.remove('monument-appear');
  monumentImgEl.classList.remove('monument-appear');
  void tagImg.offsetWidth;
  tagImg.classList.add('monument-appear');
  monumentImgEl.classList.add('monument-appear');
}

// ── CLICK ─────────────────────────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
  if (!state || state.phase !== 'waiting') return;
  state.phase = 'animating';
  const isRecordingMonuments = document.body.classList.contains('recording-mode') && window.pendingGameMode === 'monuments';
  if (slideTagIn._countryTimer) { clearTimeout(slideTagIn._countryTimer); slideTagIn._countryTimer = null; }
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  sfxPin.currentTime = 0;
  sfxPin.play();

  const rect    = canvas.getBoundingClientRect();

  const scaleX  = canvas.width / rect.width;
  const scaleY  = canvas.height / rect.height;
  const clickX  = (e.clientX - rect.left) * scaleX;
  const clickY  = (e.clientY - rect.top) * scaleY;

  const correct = latLonToCanvas(state.currentCity.lat, state.currentCity.lon);
  const d       = dist(clickX, clickY, correct.x, correct.y);
  const grade   = classify(d);
  const shownAt = state.cityShownAt;

  saveGradeCount(grade);

  if (grade === 'wayoff') {
    state.streak = 0;
  } else {
    state.streak++;
  }
  const streakMult = 1 + Math.floor(state.streak / 4) * 0.3;

  const badgeColor  = getBadgeImg(state.streak);
  const inRowBonus  = getInRowBonus(state.streak);

  const { base, bonusAmt } = computeScore(grade, shownAt);
  const streakBonus = Math.round((base + bonusAmt) * (streakMult - 1));
  const hintMult = slideTagIn._hintShown ? 0.5 : 1;
  const totalGained = Math.round((base + bonusAmt + streakBonus) * hintMult) + inRowBonus;
  state.score += totalGained;
  if (base + bonusAmt + streakBonus > 0) showScorePopup(Math.round((base + bonusAmt + streakBonus) * hintMult));
  if (bonusAmt > 0) {
    clearTimeout(speedBonusHideId);
    speedBonusText.classList.remove('visible');
    void speedBonusText.offsetWidth;
    speedBonusText.classList.add('visible');
    speedBonusHideId = setTimeout(() => speedBonusText.classList.remove('visible'), 1600);
  }

  state.placedDots.push({
    x: correct.x, y: correct.y,
    name: state.currentCity.name,
    labelOpacity: 1,
    labelBorn: Date.now(),
    permanent: grade === 'perfect' || isRecordingMonuments,
  });

  if (grade !== 'wayoff') {
    advanceDot();
    if (window.pendingGameMode === 'monuments') {
      state.monumentsSeen.add(state.currentCity.name);
      if (!state.monumentsUnlocked) {
        state.monumentsCorrectCount++;
        if (state.monumentsCorrectCount >= 3) {
          state.monumentsUnlocked = true;
          const remaining = MONUMENTS.filter(m => !state.monumentsSeen.has(m.name));
          state.monumentPool = shuffle(remaining.length ? remaining : [...MONUMENTS]);
          state.poolIndex = 0;
        }
      }
    }
  }

  state.pin1Anim = { x: clickX, y: clickY,
                    progress: 0,
                    opacity: 1,
                    fading: false,
                    wobbleTime: 0,
                    sunburstSpawned: false
                  };
  const capturedPin1 = state.pin1Anim;

  setTimeout(() => {
    state.pin2Anim = { x: correct.x, y: correct.y,
                      progress: 0,
                      opacity: 1,
                      fading: false,
                      wobbleTime: 0,
                      starsSpawned: false,
                      onLanded: () => {
                        spawnStars(correct.x, correct.y);
                        if (!isRecordingMonuments) {
                          setTimeout(() => {
                            showResultLabel(correct.x, correct.y, grade, base, bonusAmt);
                            if (badgeColor) {
                              state.badgeAnim = { t: 0, img: badgeColor, streak: state.streak, inRowBonus };
                              setTimeout(() => { sfxBonus.currentTime = 0; sfxBonus.play(); }, 800);
                            }
                          }, 200);
                        }
                        setTimeout(() => {
                          state.phase = 'waiting';
                          if (!isRecordingMonuments) nextCity();
                        }, 350);
                      }
                    };
    const capturedPin2 = state.pin2Anim;
    if (!isRecordingMonuments) setTimeout(() => { if (state.pin2Anim === capturedPin2) capturedPin2.fading = true; }, 1000);
  }, 300);

  if (!isRecordingMonuments) setTimeout(() => { if (state.pin1Anim === capturedPin1) capturedPin1.fading = true; }, 1000);
});

// ── BADGE ─────────────────────────────────────────────────────────────────────
const MILESTONE_BONUSES = { 3:100, 5:200, 10:400, 15:500, 20:600, 25:800, 30:1200, 35:1500, 40:1800, 45:2000, 50:2500, 55:3000 };
function getInRowBonus(streak) {
  if (MILESTONE_BONUSES[streak]) return MILESTONE_BONUSES[streak];
  if (streak >= 60 && streak % 5 === 0) return 3500 + ((streak - 60) / 5) * 500;
  return 0;
}

const BADGE_STROKE = { 5:'#3d5806', 10:'#5c0000', 20:'#104696', 30:'#6b0015', 40:'#ac7600', 50:'#383838' };
function getBadgeStrokeColor(streak) {
  return BADGE_STROKE[streak] ?? '#623103';
}

let BADGE_IMG = null;
function getBadgeImg(streak) {
  if (!BADGE_IMG) {
    BADGE_IMG = { 3:imgBadgeGold, 5:imgBadgeGreen, 10:imgBadgeRed, 15:imgBadgeGold,
      20:imgBadgeBlue, 25:imgBadgeGold, 30:imgBadgeGarnet, 35:imgBadgeGold,
      40:imgBadgeYellow, 45:imgBadgeGold, 50:imgBadgeSilver };
  }
  if (BADGE_IMG[streak]) return BADGE_IMG[streak];
  if (streak >= 55 && streak % 5 === 0) return imgBadgeGold;
  return null;
}

// ── RENDER ───────────────────────────────────────────────────────────────────
function render(timestamp) {
  if (!state) return;

  const dt = state.lastTimestamp ? (timestamp - state.lastTimestamp) / 1000 : 0;
  state.lastTimestamp = timestamp;

  ctx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
  const activeMap = window.pendingGameMode === 'monuments' ? imgMap2 : imgMap;
  ctx.drawImage(activeMap, 0, 0, DISPLAY_W, DISPLAY_H);

  if (state.displayedScore < state.score) {
    const diff = state.score - state.displayedScore;
    state.displayedScore = Math.min(state.score, state.displayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    scoreValueEl.textContent = (state.displayedScore + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
    sortLeaderboard(state.score);
  }

  for (const dot of state.placedDots) {
    const age = (Date.now() - dot.labelBorn) / 1000;
    dot.labelOpacity = age < 3 ? 1 : Math.max(0, 1 - (age - 3));

    const dotAlpha = dot.permanent ? 1 : dot.labelOpacity;
    ctx.globalAlpha = dotAlpha;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
    const perfectColor = window.pendingGameMode === 'monuments' ? '#000000' : '#ff2222';
    ctx.fillStyle = dot.permanent ? perfectColor : '#666666';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (dot.permanent && age >= 2 && window.pendingGameMode === 'monuments' && !document.body.classList.contains('recording-mode')) {
      const flagAlpha = Math.min(1, (age - 2) / 0.1);
      const fw = (imgFlag.naturalWidth  || 24) * 0.8;
      const fh = (imgFlag.naturalHeight || 24) * 0.8;
      const angle = (60 * (1 - flagAlpha)) * Math.PI / 180;
      ctx.globalAlpha = flagAlpha;
      ctx.save();
      ctx.translate(dot.x + 6, dot.y + 4);
      ctx.rotate(angle);
      ctx.drawImage(imgFlag, -fw / 2, -fh, fw, fh);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (age < 4) {
      ctx.globalAlpha = dot.labelOpacity;

      const maxFontSize = 11;
      const minFontSize = 7;
      let fontSize = maxFontSize;
      ctx.font = `bold ${fontSize}px Georgia`;
      while (fontSize > minFontSize && ctx.measureText(dot.name).width > 90) {
        fontSize--;
        ctx.font = `bold ${fontSize}px Georgia`;
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3;
      ctx.strokeText(dot.name, dot.x, dot.y + 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dot.name, dot.x, dot.y + 8);

      ctx.globalAlpha = 1;
    }
  }

  state.placedDots = state.placedDots.filter(dot =>
    dot.permanent || dot.labelOpacity > 0
  );

// ── SUNBURST ────────────────────────────
if (state.sunburst) {
  const sb = state.sunburst;
  sb.t += dt;
  const dur = 0.35;
  const prog = sb.t / dur;
  if (prog >= 1) {
    state.sunburst = null;
  } else {
    const TAU = Math.PI * 2;
    const alpha = Math.pow(1 - prog, 1.5) * 0.78;

    const drawLayer = (rays, innerR, outerR, tipW, rotSpeed) => {
      const angle = sb.t * rotSpeed;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sb.x, sb.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      for (let i = 0; i < rays; i++) {
        const aTip = (i / rays) * TAU;
        const aL   = aTip - tipW * TAU;
        const aR   = aTip + tipW * TAU;
        ctx.moveTo(Math.cos(aTip) * outerR, Math.sin(aTip) * outerR);
        ctx.lineTo(Math.cos(aL)   * innerR, Math.sin(aL)   * innerR);
        ctx.lineTo(Math.cos(aR)   * innerR, Math.sin(aR)   * innerR);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    drawLayer(12, 4 + prog * 6,  12 + prog * 68, 0.28 / 12,  -4.4);
    drawLayer( 8, 5 + prog * 8,   8 + prog * 50, 0.30 /  8, -2.2);
  }
}

// ── DIBUJO PINS ──────────────────────────
  function drawPin(pinState, img, tip, xDir) {
    const p = pinState;
    const d    = 220 * (1 - p.progress);
    const sc   = 10 - 9 * p.progress;
    const curW = PIN_W * sc;
    const curH = PIN_H * sc;
    const tipX = p.x + xDir * d;
    const tipY = p.y - d;

    let angle = 0;
    if (p.progress >= 1) {
      p.wobbleTime += dt;
      const duration = 0.08;
      if (p.wobbleTime < duration) {
        const half = duration / 2;
        const maxRad = (3 * Math.PI) / 180;
        angle = p.wobbleTime < half
          ? (p.wobbleTime / half) * maxRad
          : maxRad - ((p.wobbleTime - half) / half) * maxRad;
      }
    }

    const hf = 1 - p.progress;
    const shadowAlpha = Math.max(0, (p.progress - 0.1) / 0.9) * 0.30 * p.opacity;
    if (shadowAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = shadowAlpha;
      ctx.filter = 'brightness(0) blur(1.5px)';
      ctx.translate(tipX, tipY);
      ctx.rotate(angle);
      ctx.transform(1, 0, -hf * 1.2, 0.08, 0, 0);
      ctx.drawImage(img, -curW * tip.x, -curH * tip.y, curW, curH);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.drawImage(img, -curW * tip.x, -curH * tip.y, curW, curH);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  if (state.pin1Anim) {
    const p = state.pin1Anim;
    if (p.fading) {
      p.opacity = Math.max(0, p.opacity - dt / 0.1);
      if (p.opacity <= 0) { state.pin1Anim = null; }
    } else {
      p.progress = Math.min(1, p.progress + dt / 0.1);
      if (p.progress >= 1 && !p.sunburstSpawned) {
        p.sunburstSpawned = true;
        state.sunburst = { x: p.x, y: p.y, t: 0 };
      }
    }
    if (state.pin1Anim) drawPin(state.pin1Anim, imgPin1, PIN1_TIP, 1);
  }

  if (state.pin2Anim) {
    const p = state.pin2Anim;
    if (p.fading) {
      p.opacity = Math.max(0, p.opacity - dt / 0.1);
      if (p.opacity <= 0) { state.pin2Anim = null; }
    } else {
      p.progress = Math.min(1, p.progress + dt / 0.1);
      if (p.progress >= 1 && !p.starsSpawned && p.onLanded) {
        p.starsSpawned = true;
        p.onLanded();
      }
    }
    if (state.pin2Anim) drawPin(state.pin2Anim, imgPin2, PIN2_TIP, -1);
  }

  for (let i = state.starParticles.length - 1; i >= 0; i--) {
    const s = state.starParticles[i];
    s.life += dt;
    s.x    += s.vx;
    s.y    += s.vy;
    s.vy   += 0.06;
    s.opacity = Math.max(0, 1 - s.life / 0.8);
    if (s.opacity <= 0) { state.starParticles.splice(i, 1); continue; }
    ctx.globalAlpha = s.opacity;
    ctx.drawImage(imgStar, s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    ctx.globalAlpha = 1;
  }

  // Limpiar el overlay del badge solo si hay algo dibujado (o lo hubo el frame
  // anterior, para borrarlo), en vez de un clearRect full en cada frame.
  if (state.badgeAnim || render._badgeDirty) {
    badgeOverlayCtx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
  }
  render._badgeDirty = !!state.badgeAnim;
  if (state.badgeAnim) {
    const ba = state.badgeAnim;
    ba.t += dt;
    const IN_END = 0.2, HOLD_END = 0.60, SHRINK_DUR = 0.22, TOTAL = HOLD_END + SHRINK_DUR;
    if (ba.t >= TOTAL) {
      state.badgeAnim = null;
    } else {
      let alpha, scale;
      if (ba.t < IN_END) {
        const p = ba.t / IN_END;
        alpha = p;
        scale = 0.25 + p * 0.75;
      } else if (ba.t < HOLD_END) {
        alpha = 1; scale = 1;
      } else {
        const p = (ba.t - HOLD_END) / SHRINK_DUR;
        alpha = 1; scale = 1 - p;
      }

      // Escala proporcional a DISPLAY_W (clamp a 1): en desktop queda igual, en
      // pantallas chicas (iOS) el check/IN A ROW dejan de salir gigantes.
      const BADGE_K = Math.min(1, DISPLAY_W / 1190);
      const W = 405 * BADGE_K, H = 333 * BADGE_K;
      const CW = 477 * BADGE_K, CH = 405 * BADGE_K;

      badgeOverlayCtx.save();
      badgeOverlayCtx.globalAlpha = alpha;
      badgeOverlayCtx.translate(DISPLAY_W / 2, DISPLAY_H / 2);
      badgeOverlayCtx.scale(scale, scale);
      badgeOverlayCtx.drawImage(imgCheck, -CW / 2, -CH / 2, CW, CH);
      badgeOverlayCtx.restore();

      const BZ_IN = 0.18, BZ_HOLD = 0.42, BZ_OUT = 0.72;
      let bonusScale;
      if      (ba.t < BZ_IN)   bonusScale = ba.t / BZ_IN;
      else if (ba.t < BZ_HOLD) bonusScale = 1;
      else if (ba.t < BZ_OUT)  bonusScale = 1 - (ba.t - BZ_HOLD) / (BZ_OUT - BZ_HOLD);
      else                     bonusScale = 0;

      if (bonusScale > 0) {
        const bonusLabel = `+${ba.inRowBonus}`;
        const bonusCX = DISPLAY_W / 2;
        const bonusCY = DISPLAY_H / 2 + CH / 2 + 20 * BADGE_K;
        badgeOverlayCtx.save();
        badgeOverlayCtx.globalAlpha = alpha;
        badgeOverlayCtx.translate(bonusCX, bonusCY);
        badgeOverlayCtx.scale(bonusScale, bonusScale);
        badgeOverlayCtx.font = `${104 * BADGE_K}px Dimbo, "Arial Black", sans-serif`;
        badgeOverlayCtx.textAlign = 'center';
        badgeOverlayCtx.textBaseline = 'middle';
        badgeOverlayCtx.strokeStyle = '#073A79';
        badgeOverlayCtx.lineWidth = 14 * BADGE_K;
        badgeOverlayCtx.strokeText(bonusLabel, 0, 0);
        badgeOverlayCtx.strokeStyle = '#FD9C1A';
        badgeOverlayCtx.lineWidth = 7 * BADGE_K;
        badgeOverlayCtx.strokeText(bonusLabel, 0, 0);
        badgeOverlayCtx.fillStyle = '#ffffff';
        badgeOverlayCtx.fillText(bonusLabel, 0, 0);
        badgeOverlayCtx.restore();
      }

      badgeOverlayCtx.save();
      badgeOverlayCtx.globalAlpha = alpha;
      badgeOverlayCtx.translate(DISPLAY_W / 2 + 30 * BADGE_K, DISPLAY_H / 2 - 30 * BADGE_K);
      badgeOverlayCtx.scale(scale, scale);
      badgeOverlayCtx.drawImage(ba.img, -W / 2, -H / 2, W, H);
      badgeOverlayCtx.font = `bold ${67 * BADGE_K}px Fredoka, sans-serif`;
      badgeOverlayCtx.textAlign = 'center';
      badgeOverlayCtx.textBaseline = 'middle';
      badgeOverlayCtx.scale(1, 1.2);
      badgeOverlayCtx.strokeStyle = getBadgeStrokeColor(ba.streak);
      badgeOverlayCtx.lineWidth = 11 * BADGE_K;
      badgeOverlayCtx.strokeText(`${ba.streak} IN A ROW`, 0, 0);
      badgeOverlayCtx.fillStyle = '#ffffff';
      badgeOverlayCtx.fillText(`${ba.streak} IN A ROW`, 0, 0);
      badgeOverlayCtx.restore();
    }
  }

  animFrameId = requestAnimationFrame(render);
}

// ── TIMER ─────────────────────────────────────────────────────────────────────
function startTimer() {
  timerNumberEl.textContent = state.timeLeft;
  timerNumberEl.style.color = '';
  countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdown4.png' : 'images/countdown.png';
  countdownImg.style.animationPlayState = 'running';

  timerIntervalId = setInterval(() => {
    state.timeLeft--;
    timerNumberEl.textContent = state.timeLeft;

    if (state.timeLeft <= 10) {
      timerNumberEl.style.color = '#ffffff';
      countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdownred4.png' : 'images/countdownred.png';
      if (state.timeLeft > 0) { sfxTickdown.currentTime = 0; sfxTickdown.play(); }
    } else {
      timerNumberEl.style.color = '';
      countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdown4.png' : 'images/countdown.png';
    }

    if (state.timeLeft <= 0)  endGame();
  }, 1000);
}

let endGameTimeout1 = null, endGameTimeout2 = null;
function endGame() {
  gameAborted = false;
  clearInterval(timerIntervalId);
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  monumentNameEl.style.opacity = '0';
  state.phase = 'idle';
  canvas.style.pointerEvents = 'none';
  countdownImg.style.animationPlayState = 'paused';

  playMusic(null);
  sfxTimesUp.currentTime = 0; sfxTimesUp.play();
  timeupOverlay.style.display = 'flex';
  timeupOverlay.classList.remove('timeup-out');
  timeupOverlay.classList.add('timeup-in');

  endGameTimeout1 = setTimeout(() => {
    if (gameAborted) return;
    timeupOverlay.classList.remove('timeup-in');
    timeupOverlay.classList.add('timeup-out');

    endGameTimeout2 = setTimeout(() => {
      if (gameAborted) return;
      timeupOverlay.style.display = 'none';
      timeupOverlay.classList.remove('timeup-out');

      cancelAnimationFrame(animFrameId);
      animFrameId = null;
      gameWrapper.style.display = 'none';
      scoreDisplayEl.style.display = 'none';
      const cwHide = document.getElementById('countdown-widget');
      if (cwHide) cwHide.style.display = 'none';
      window.lastModeScore = state.score;
      finalScoreEl.textContent = (state.score + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
      let isNewHighscore = false;
      if (window.pendingGameMode === 'monuments') {
        isNewHighscore = state.score > monumentsHighscore;
        if (isNewHighscore) {
          monumentsHighscore = state.score;
          localStorage.setItem('monumentsHighscore', monumentsHighscore);
        }
      } else {
        isNewHighscore = state.score > highscore;
        if (isNewHighscore) {
          highscore = state.score;
          localStorage.setItem('geochallenge_highscore', highscore);
          highscoreEl.textContent = highscore.toLocaleString();
          updateSplashHighscore();
        }
      }
      newHighscoreBanner.style.display = isNewHighscore ? 'flex' : 'none';
      if (isNewHighscore) {
        newHighscoreScore.textContent = (window.pendingGameMode === 'monuments' ? monumentsHighscore : highscore).toLocaleString();
      }
      const gameoverTextLabel = document.querySelector('.gameover-text1-label');
      if (gameoverTextLabel) {
        gameoverTextLabel.textContent = window.pendingGameMode === 'monuments'
          ? '¡Buen trabajo! ¡Lo conseguimos!'
          : '¡Buen intento! ¡Todos llegaron a sus ciudades de destino!';
      }
      if (window.pendingGameMode === 'monuments') {
        gameoverScreen.classList.add('mode-monuments');
      }
      gameoverScreen.style.display = 'flex';
      const rpGO = document.getElementById('right-panel');
      if (rpGO) rpGO.style.display = 'none';
      restartFlightAtt();
      updateGradeCountsUI();
      buildChecksRow();
      const checksTotal = gradeCounts.perfect + gradeCounts.good + gradeCounts.fair;
      const checksEndTime = (checksTotal > 0 ? (checksTotal - 1) * 0.1 + 0.2 : 0) + 0.4;
      buildWrongsRow(checksEndTime);
      playMusic(sfxPostgame);
    }, 1000);
  }, 400 + 1200);
}

// ── ESCALADO RESPONSIVE ───────────────────────────────────────────────────────
function redimensionarJuego() {
  if (!gameWrapper || gameWrapper.style.display === 'none') return;

  const anchoVentana = window.innerWidth;
  const altoVentana = window.innerHeight;

  // Márgenes proporcionales (sin px fijos ni saltos por breakpoint) para que la
  // escala sea 100% proporcional al viewport y no "zoomee" de más al hacer zoom.
  const margenHorizontal = anchoVentana * 0.35;
  const margenVertical = altoVentana * 0.08;

  const escalaW = (anchoVentana - margenHorizontal) / DISPLAY_W;
  const escalaH = (altoVentana - margenVertical) / DISPLAY_H;

  let escalaFinal = Math.min(escalaW, escalaH);
  escalaFinal = escalaFinal * 0.92;

  gameWrapper.style.transform = `translate(-50%, -50%) scale(${escalaFinal})`;
  gameWrapper.style.transformOrigin = 'center center';
}

function showScorePopup(amount) {
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = '+' + amount.toLocaleString();
  el.dataset.text = '+' + amount.toLocaleString();
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

window.addEventListener('resize', redimensionarJuego);

// Reposicionar la barra de amigos al hacer zoom/redimensionar (los top se calculan
// en px desde el alto real, así que hay que recalcularlos para que la separación
// no cambie).
window.addEventListener('resize', () => {
  const rp = document.getElementById('right-panel');
  if (!rp || getComputedStyle(rp).display === 'none') return;
  positionLeaderboard(lastLbScore >= 0 ? lastLbScore : 0, false);
  requestAnimationFrame(() => {
    Object.values(lbElements).forEach(el => { el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)'; });
  });
});


// ── PREGAME COUNTDOWN ─────────────────────────────────────────────────────────
const pregameCountdownEl    = document.getElementById('pregame-countdown');
const pregameCountdownImg   = document.getElementById('pregame-countdown-img');
const PREGAME_STEPS = [
  { src: 'images/countdown/3.png', hold: 750,  size: 46 },
  { src: 'images/countdown/2.png', hold: 750,  size: 46 },
  { src: 'images/countdown/1.png', hold: 750,  size: 46 },
  { src: 'images/countdown/go.png', hold: 950, size: 54 },
];

let pregameTimeout = null;
let pregameAborted = false;
function runPregameCountdown(onDone) {
  pregameAborted = false;
  pregameCountdownEl.style.display = 'flex';
  sfxCountdown.currentTime = 0;
  sfxCountdown.play();
  let step = 0;

  function showStep() {
    if (pregameAborted) return; // se abandonó durante el 3-2-1
    if (step >= PREGAME_STEPS.length) {
      pregameCountdownEl.style.display = 'none';
      onDone();
      return;
    }
    const { src, hold, size } = PREGAME_STEPS[step++];
    pregameCountdownImg.style.animation = 'none';
    pregameCountdownImg.style.width  = size + 'vmin';
    pregameCountdownImg.style.height = size + 'vmin';
    pregameCountdownImg.src = src;
    void pregameCountdownImg.offsetWidth;
    pregameCountdownImg.style.animation = '';
    pregameTimeout = setTimeout(showStep, hold);
  }

  showStep();
}

// ── START ─────────────────────────────────────────────────────────────────────
function startGame() {
  loadBadges();
  loadGameSFX();
  clearInterval(timerIntervalId);
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  canvas.style.pointerEvents = '';

  playMusic(null);
  splashScreen.style.display    = 'none';
  gameoverScreen.style.display  = 'none';
  newHighscoreBanner.style.display = 'none';
  gameWrapper.style.display     = 'block';
  scoreDisplayEl.style.display  = 'block';
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'block';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'flex';

  redimensionarJuego();

  resetState();
  gradeCounts = { perfect: 0, good: 0, fair: 0 };
  wrongCount = 0;
  updateGradeCountsUI();
  updateWrongCountUI();
  updateDotsUI();
  scoreValueEl.textContent     = (window.campaignBase ? window.campaignBase() : 0).toLocaleString();
  lastLbScore = -1;
  lastPlayerRank = -1;
  sortLeaderboard(0);
  resultLabel.className        = '';
  speedBonusText.classList.remove('visible');
  cityTagEl.style.transition   = 'none';
  cityTagEl.style.left         = tpx(-525);
  cityTagEl.style.top          = tpx(-163);
  const tagImg = cityTagEl.querySelector('img');
  tagImg.src = 'images/tag3.png';
  tagImg.style.width  = '';
  tagImg.style.height = '';
  cityTagText.style.display = '';
  cityTagEl.querySelector('img').classList.remove('monument-appear');
  monumentImgEl.style.display = 'none';
  monumentImgEl.src = '';
  monumentNameEl.textContent = '';
  monumentNameEl.style.opacity = '0';
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  gameWrapper.querySelectorAll('.city-tag-ghost').forEach(g => g.remove());

  const tbReset = document.getElementById('time-bonus');
  if (tbReset) {
    if (tbReset._tbT1) clearTimeout(tbReset._tbT1);
    if (tbReset._tbT2) clearTimeout(tbReset._tbT2);
    tbReset.style.display = 'none';
    tbReset.classList.remove('show', 'fade');
  }

  timerNumberEl.textContent = GAME_DURATION;
  timerNumberEl.style.color = '';
  countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdown4.png' : 'images/countdown.png';

  cityTagEl.style.visibility = 'hidden';

  animFrameId = requestAnimationFrame(render);

  countdownImg.style.animationPlayState = 'paused';

  const countdownWidget = document.getElementById('countdown-widget');
  if (document.body.classList.contains('recording-mode') && window.pendingGameMode === 'monuments') {
    if (countdownWidget) countdownWidget.style.visibility = 'hidden';
  } else {
    if (countdownWidget) countdownWidget.style.visibility = '';
  }

  runPregameCountdown(() => {
    playMusic(sfxGameMusic);
    if (!(document.body.classList.contains('recording-mode') && window.pendingGameMode === 'monuments')) {
      startTimer();
    }
    setTimeout(nextCity, 100);
  });
}

btnStart.addEventListener('click', () => { sfxCheck.currentTime = 0; sfxCheck.play(); startGame(); });

let confirmStep = 0;
let confirmCooldown = false;
function confirmCooldownLock() {
  confirmCooldown = true;
  setTimeout(() => { confirmCooldown = false; }, 100);
}

document.querySelector('.splash-confirm-wrap')?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  const a = new Audio('sfx/check.mp3'); a.volume = isMuted ? 0 : 1; a.play();
  const wrap = document.querySelector('.splash-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  if (confirmStep === 0) {
    const label = document.querySelector('.splash-text2-label');
    if (window.pendingGameMode === 'flags') {
      if (label) { label.textContent = 'Haz clic sobre la bandera del país, estado o unión que corresponda al nombre que aparece arriba. ¿Todo listo? ¡Entonces haz clic sobre el icono VERDE para empezar!'; label.classList.add('step2'); }
    } else if (window.pendingGameMode === 'shapes') {
      if (label) { label.textContent = 'Observa la forma del país y haz click en el nombre correcto, ¡pero no te olvides de que cada segundo cuenta! ¡Haz click en el icono VERDE y comenzamos!'; label.classList.add('step2'); }
    } else if (window.pendingGameMode === 'monuments') {
      if (label) { label.textContent = 'Pon un pin en el mapa allí donde crees que están. ¡Haz click en el icono VERDE cuando creas que estes listo!'; label.classList.add('step2'); }
    } else {
      if (label) { label.textContent = 'Coloca un pin en el mapa donde creas que cada ciudad se ubica. ¡Haz click en el botón VERDE cuando estes listo!'; label.classList.add('step2'); }
    }
    const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
    if (howtoWrap) howtoWrap.classList.add('slide-down');
    const howtoVideo = document.querySelector('.splash-howtoplay-video');
    if (howtoVideo) howtoVideo.play();
    confirmStep = 1;
  } else {
    if (window.pendingGameMode === 'flags') {
      splashScreen.style.display = 'none';
      if (typeof showFlagsMode !== 'undefined') showFlagsMode();
    } else if (window.pendingGameMode === 'shapes') {
      splashScreen.style.display = 'none';
      if (typeof showShapesMode !== 'undefined') showShapesMode();
    } else if (window.pendingGameMode === 'monuments') {
      splashScreen.style.display = 'none';
      startGame();
    } else {
      startGame();
    }
  }
});
document.querySelector('.gameover-confirm-wrap')?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  const a = new Audio('sfx/check.mp3'); a.volume = isMuted ? 0 : 1; a.play();
  const wrap = document.querySelector('.gameover-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);

  // ── Encadenamiento de campaña ──
  if (window.campaign && window.campaign.active) {
    const mode = window.pendingGameMode;
    const sc = window.lastModeScore || 0; // puntaje individual de esta ronda
    window.campaign.scores[mode] = sc;
    window.campaign.base = (window.campaign.base || 0) + sc;
    window.campaign.idx++;
    gameoverScreen.style.display = 'none';
    // resetear estado del splash para que el segundo diálogo no se saltee
    confirmStep = 0;
    const howtoWrapC = document.querySelector('.splash-howtoplay-wrap');
    if (howtoWrapC) howtoWrapC.classList.remove('slide-down');
    const labelC = document.querySelector('.splash-text2-label');
    if (labelC) { labelC.classList.remove('step2'); labelC.textContent = ''; }
    const animElsC = document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap');
    animElsC.forEach(el => el.classList.remove('animate-in'));
    if (window.campaign.idx < window.campaign.btns.length) {
      // silenciar el check del botón del siguiente modo (ya sonó uno arriba)
      sfxCheck.volume = 0;
      document.getElementById(window.campaign.btns[window.campaign.idx]).click();
      setTimeout(() => { sfxCheck.volume = isMuted ? 0 : 1; }, 150);
    } else {
      window.campaign.active = false;
      playMusic(null);
      if (typeof showResultsScreen === 'function') showResultsScreen();
    }
    return;
  }

  gameoverScreen.style.display = 'none';
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen').classList.remove('table-shown');
  document.getElementById('loading-table-group')?.classList.add('table-gone');
  document.getElementById('loading-social-group')?.classList.add('table-gone');
  document.getElementById('loading-friend-group')?.classList.add('table-gone');
  document.getElementById('loading-addfriend-group')?.classList.add('table-gone');
  document.getElementById('loading-blocked-group')?.classList.add('table-gone');
  document.getElementById('loading-sent-group')?.classList.add('table-gone');

  const fmt = v => v > 0 ? '🏆 ' + v.toLocaleString() : '';
  const elPlay   = document.getElementById('loading-play-hs');
  const elFlags  = document.getElementById('loading-flags-hs');
  const elShapes = document.getElementById('loading-shapes-hs');
  const elMode4  = document.getElementById('loading-mode4-hs');
  if (elPlay)   elPlay.textContent   = fmt(parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10));
  if (elFlags)  elFlags.textContent  = fmt(parseInt(localStorage.getItem('flagsHighscore')         || '0', 10));
  if (elShapes) elShapes.textContent = fmt(parseInt(localStorage.getItem('shapesHighscore')        || '0', 10));
  if (elMode4)  elMode4.textContent  = fmt(parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10));
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();

  confirmStep = 0;
  const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
  if (howtoWrap) howtoWrap.classList.remove('slide-down');
  const label = document.querySelector('.splash-text2-label');
  if (label) { label.classList.remove('step2'); label.textContent = ''; }
  const howtoVideo = document.querySelector('.splash-howtoplay-video');
  if (howtoVideo) { howtoVideo.pause(); howtoVideo.src = 'images/howtoplay/howtoplay3.mp4'; howtoVideo.load(); }
  const animEls = document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
});

// ── LOADING FLIGHT ATTENDANT (flightattpost2) ────────────────────────────────
(function () {
  const TIMELINE_LOADING = [
    [1, 150], [2, 100], [3, 150], [4, 150], [5, 150],
    [6,  50], [7, 150], [8, 200], [7, 200], [8, 200],
    [11,200], [5, 200], [6, 200], [9,  50], [8, 200],
    [11,150], [10,100], [7, 150], [8, 150], [3, 150],
    [2, 150], [1, 1000],
  ];

  const frames = document.querySelectorAll('#loading-screen .flightatt-loading');
  frames.forEach(img => {
    img.style.visibility = img.dataset.frame === '1' ? 'visible' : 'hidden';
  });

  function showFrame(n) {
    frames.forEach(img => {
      img.style.visibility = img.dataset.frame === String(n) ? 'visible' : 'hidden';
    });
  }

  let step = 0;
  function tick() {
    const [frameNum, duration] = TIMELINE_LOADING[step];
    showFrame(frameNum);
    step = (step + 1) % TIMELINE_LOADING.length;
    setTimeout(tick, duration);
  }
  setTimeout(tick, TIMELINE_LOADING[0][1]);
})();

// ── SPLASH FLIGHT ATTENDANT (flightattpost2) ─────────────────────────────────
(function () {
  const TIMELINE2 = [
    [1, 150], [2, 100], [3, 150], [4, 150], [5, 150],
    [6,  50], [7, 150], [8, 200], [7, 200], [8, 200],
    [11,200], [5, 200], [6, 200], [9,  50], [8, 200],
    [11,150], [10,100], [7, 150], [8, 150], [3, 150],
    [2, 150], [1, 1000],
  ];

  const frames = document.querySelectorAll('#splash-screen .flightatt-splash');
  frames.forEach(img => {
    img.style.visibility = img.dataset.frame === '1' ? 'visible' : 'hidden';
  });

  function showFrame(n) {
    frames.forEach(img => {
      img.style.visibility = img.dataset.frame === String(n) ? 'visible' : 'hidden';
    });
  }

  let step = 0;
  function tick() {
    const [frameNum, duration] = TIMELINE2[step];
    showFrame(frameNum);
    step = (step + 1) % TIMELINE2.length;
    setTimeout(tick, duration);
  }
  setTimeout(tick, TIMELINE2[0][1]);
})();

// ── FLIGHT ATTENDANT ANIMATION ───────────────────────────────────────────────
let restartFlightAtt;
(function () {
  const TIMELINE = [
    [1,  150], [2,  100], [3,  150], [4,  100], [5,  100],
    [6,  100], [7,  150], [8,   50], [9,   50], [10,  50],
    [11, 100], [12, 100], [11, 100], [12, 100], [11, 100],
    [12, 100], [13, 100], [14, 100], [15, 100], [6,  100],
    [5,  100], [4,  100], [3,  100], [2,  100],
  ];

  const frames = document.querySelectorAll('.flightatt');

  frames.forEach(img => {
    const num = parseInt(img.src.match(/(\d+)\.png$/)[1]);
    img.style.visibility = num === 1 ? 'visible' : 'hidden';
  });

  let step = 0;
  let pendingTimeout = null;

  restartFlightAtt = function () {
    if (pendingTimeout) clearTimeout(pendingTimeout);
    step = 0;
    showFrame(1);
    pendingTimeout = setTimeout(tick, TIMELINE[0][1]);
  };

  function showFrame(n) {
    frames.forEach(img => {
      const num = parseInt(img.src.match(/(\d+)\.png$/)[1]);
      img.style.visibility = num === n ? 'visible' : 'hidden';
    });
  }

  function tick() {
    const [frameNum, duration] = TIMELINE[step];
    showFrame(frameNum);
    step++;
    if (step >= TIMELINE.length) {
      step = 0;
      showFrame(1);
      pendingTimeout = setTimeout(tick, 2000);
    } else {
      pendingTimeout = setTimeout(tick, duration);
    }
  }

  pendingTimeout = setTimeout(tick, TIMELINE[0][1]);
})();

// ── SPLASH ANIMATE-IN (una sola vez al cargar) ───────────────────────────────
(function () {
  document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap').forEach(el => {
    el.classList.add('animate-in');
  });
})();

// ── SPLASH TEXT2 RESPONSIVE ──────────────────────────────────────────────────
// El tamaño del texto de los carteles (text2/text1) se controla en CSS con vw:
// el globo mide 25vw/21vw (su width:% sobre #splash-screen, que es full viewport),
// así que la fuente en vw (1.375vw/1.155vw = 0.055×ancho) queda SIEMPRE en la
// misma proporción que el globo, sin atascarse con el zoom como el ResizeObserver.

// ── VOLUME TOGGLE ─────────────────────────────────────────────────────────────
let isMuted = localStorage.getItem('muted') === 'true';

function getAllSfx() {
  return [sfxCheck, sfxPostgame, sfxGameMusic, sfxSelect, sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp,
    typeof sfxLevel2 !== 'undefined' ? sfxLevel2 : null].filter(Boolean);
}

document.addEventListener('DOMContentLoaded', () => {
  if (isMuted) {
    const img = document.getElementById('vol-img');
    if (img) img.src = 'images/vol2.png';
  }
});

// ── HOVER SOUNDS ──────────────────────────────────────────────────────────────
function playSelect() { sfxSelect.currentTime = 0; sfxSelect.play(); }

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
  getAllSfx().forEach(sfx => { sfx.volume = vol; });
  applyMusicMute(); // iOS: la música va por Web Audio (gain); en PC es no-op
  document.getElementById('vol-img').src = isMuted ? 'images/vol2.png' : 'images/vol1.png';
  const a = new Audio('sfx/check.mp3'); a.volume = 1; a.play();
});

// ── LOCK LOADING SCREEN ZOOM & POSITION ───────────────────────────────────────
(function () {
  const el = document.getElementById('loading-screen');
  if (!el || !window.visualViewport) return;
  const vp = window.visualViewport;
  function fix() {
    const s = 1 / vp.scale;
    el.style.left   = vp.offsetLeft + 'px';
    el.style.top    = vp.offsetTop  + 'px';
    el.style.width  = (vp.width  * vp.scale) + 'px';
    el.style.height = (vp.height * vp.scale) + 'px';
    el.style.transform = `scale(${s})`;
  }
  vp.addEventListener('resize', fix);
  vp.addEventListener('scroll', fix);
})();

// ── SCREEN SIZE WARNING ───────────────────────────────────────────────────────
(function () {
  const warning = document.getElementById('screen-warning');
  const msg     = document.getElementById('screen-warning-msg');
  // TEMP: límites bajados para testear en pantallas chicas (iOS).
  // REACTIVAR a 480 / 320 / 2.8 antes de push final.
  const MIN_W   = 200;
  const MIN_H   = 150;
  const MAX_RATIO = 5;

  function check() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = w / h;
    let text = '';

    if (w < MIN_W || h < MIN_H) {
      text = 'La pantalla es demasiado pequeña para mostrar el juego.';
    } else if (ratio > MAX_RATIO) {
      text = 'La pantalla es demasiado ancha. Redimensiona la ventana verticalmente.';
    } else if (ratio < 1 / MAX_RATIO) {
      text = 'La pantalla es demasiado alta. Redimensiona la ventana horizontalmente.';
    }

    if (text) {
      msg.textContent = text;
      warning.classList.add('visible');
    } else {
      warning.classList.remove('visible');
    }
  }

  window.addEventListener('resize', check);
  check();
})();

// ── TEST: open gameover screen from loading ───────────────────────────────────
(function () {
  const wrap = document.querySelector('.test-confirm-wrap');
  if (!wrap) return;
  wrap.addEventListener('click', () => {
    if (confirmCooldown) return;
    confirmCooldownLock();
    const a = new Audio('sfx/check.mp3'); a.volume = isMuted ? 0 : 1; a.play();
    wrap.classList.add('confirm-pressed');
    setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
    document.getElementById('loading-screen').style.display = 'none';
    if (typeof showResultsScreen === 'function') showResultsScreen();
  });
  wrap.addEventListener('mouseenter', playSelect);
  wrap.addEventListener('mouseleave', playSelect);
})();
