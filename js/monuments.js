// ── LOADING SCREEN ───────────────────────────────────────────────────────────
(function () {
  const IMAGES = [
    'images/checkerrortable.png','images/check3.png','images/wrong3.png',
    'images/bg/sky.png','images/bg/cloud1.png','images/bg/cloud2.png',
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

  // Cada promesa representa un asset completamente cargado
  const promises = [];

  IMAGES.forEach(src => {
    promises.push(new Promise(resolve => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = src;
    }));
  });

  // fetch garantiza descarga completa del archivo de audio
  AUDIO.forEach(src => {
    promises.push(
      fetch(src).then(r => r.arrayBuffer()).catch(() => {})
    );
  });

  // Fuentes completamente renderizadas
  promises.push(document.fonts.ready);

  // Página y todos sus sub-recursos listos
  promises.push(new Promise(resolve => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  }));

  const total = promises.length;
  let done = 0;

  function tick() {
    done++;
    const pct = Math.min(100, Math.round(done / total * 100));
    barFill.style.width = pct + '%';
    pctEl.textContent   = pct + '%';
    if (done >= total) {
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
    }
  }

  promises.forEach(p => Promise.resolve(p).then(tick, tick));

})();

// ── SFX ───────────────────────────────────────────────────────────────────────
// Solo check y postgame se necesitan en el splash — el resto se difiere al primer juego
const sfxCheck     = new Audio('sfx/check.mp3');
const sfxPostgame  = new Audio('sfx/postgameloop.mp3');
sfxPostgame.loop   = true;
const sfxGameMusic = new Audio('sfx/gamemusic.mp3');
sfxGameMusic.loop  = true;
const sfxSelect    = new Audio('sfx/select.mp3');
if (localStorage.getItem('muted') === 'true') { sfxCheck.volume = 0; sfxPostgame.volume = 0; sfxGameMusic.volume = 0; sfxSelect.volume = 0; }

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
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check3.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong3.png');
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

function playMusic(track) {
  [sfxPostgame, sfxGameMusic].forEach(t => { if (t !== track) { t.pause(); t.currentTime = 0; } });
  if (!track) return;
  track.currentTime = 0;
  const p = track.play();
  if (p) p.catch(() => {});
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
  const IMG_W = 58;
  const BASE_GAP = 3;
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = total > 1 ? (total > 12 ? (MAX_W - total * IMG_W) / (total - 1) : BASE_GAP) : 0;
  if (total === 0) {
    const none = document.createElement('span');
    none.textContent = 'None';
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:7px #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:41px;font-weight:bold;position:relative;left:20px;';
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
    if (i < total - 1) img.style.marginRight = `${gap}px`;
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
  const IMG_W = 58;
  const BASE_GAP = 3;
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = total > 1 ? (total > 12 ? (MAX_W - total * IMG_W) / (total - 1) : BASE_GAP) : 0;

  if (total === 0) {
    const none = document.createElement('span');
    none.textContent = 'None';
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:7px #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:41px;font-weight:bold;position:relative;left:20px;opacity:0;';
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
    if (i < total - 1) img.style.marginRight = `${gap}px`;
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
const mockPlayers = Array.from({ length: 10 }, (_, i) => ({
  id: `mock${i}`,
  score: Math.floor(Math.random() * 9500) + 400,
  color: LB_COLORS[i],
  initial: 'ABCDEFGHIJ'[i],
}));

const highscorePlayer = { id: 'best', score: highscore, color: '#6a0dad', initial: '★' };

const LB_WINDOW  = 5;
const LB_PIN_ROW = 2;
const LB_GAP     = 4;
let lbElements   = {};

const EMOTE_SRCS = [
  'images/emotes/Gemini_Generated_Image_9dly9v9dly9v9dly (2).png',
  'images/emotes/Gemini_Generated_Image_9uavb19uavb19uav.png',
  'images/emotes/Gemini_Generated_Image_b2kisyb2kisyb2ki.png',
  'images/emotes/Gemini_Generated_Image_o8jl8no8jl8no8jl.png',
  'images/emotes/Gemini_Generated_Image_omvaevomvaevomva.png',
  'images/emotes/Gemini_Generated_Image_wuzcs6wuzcs6wuzc.png',
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
  const wasVisible = cityTagEl.style.left !== '' && cityTagEl.style.left !== '-525px';
  if (wasVisible) {
    const ghost = cityTagEl.cloneNode(true);
    ghost.className = 'city-tag-ghost';
    ghost.style.visibility = 'visible';
    ghost.style.zIndex = '9';
    ghost.style.transition = 'none';
    ghost.style.top  = cityTagEl.style.top  || '10px';
    ghost.style.left = cityTagEl.style.left || '-90px';
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
    const baseSize = 26;
    const maxWidth = 230;
    cityTagText.style.fontSize = baseSize + 'px';
    let fs = baseSize;
    while (fs > 14 && cityTagText.scrollWidth > maxWidth) {
      fs--;
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
  cityTagEl.style.top  = '-163px';
  cityTagEl.style.left = '-525px';
  setTimeout(() => { sfxTag.currentTime = 0; sfxTag.play(); }, 200);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cityTagEl.style.visibility = 'visible';
      cityTagEl.style.transition = 'left 0.45s cubic-bezier(0.22,1,0.36,1), top 0.45s cubic-bezier(0.22,1,0.36,1)';
      cityTagEl.style.left = '-90px';
      cityTagEl.style.top  = '-50px';
    });
  });
}

// ── DOTS ─────────────────────────────────────────────────────────────────────
function updateDotsUI() {
  progressDots.forEach((d, i) => d.classList.toggle('filled', i < state.dots));
}

function advanceDot() {
  state.dots++;
  updateDotsUI();

  if (state.dots >= DOTS_NEEDED && !progressContainer.classList.contains('train-animation')) {
    progressContainer.classList.add('train-animation');

    state.timeLeft = Math.min(state.timeLeft + BONUS_TIME, 99);
    timerNumberEl.textContent = state.timeLeft;

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
  tagImg.style.width  = '431px';
  tagImg.style.height = 'auto';
  cityTagText.style.display = 'none';
  monumentImgEl.src = `images/places/${monument.img}`;
  monumentImgEl.style.display = 'block';

  cityTagEl.style.transition  = 'none';
  cityTagEl.style.left        = '-50px';
  cityTagEl.style.top         = '-55px';
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
                          }, 300);
                        }
                        setTimeout(() => {
                          state.phase = 'waiting';
                          if (!isRecordingMonuments) nextCity();
                        }, 500);
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
    scoreValueEl.textContent = state.displayedScore.toLocaleString();
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

  badgeOverlayCtx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
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

      const W = 405, H = 333;
      const CW = 477, CH = 405;

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
        const bonusCY = DISPLAY_H / 2 + CH / 2 + 20;
        badgeOverlayCtx.save();
        badgeOverlayCtx.globalAlpha = alpha;
        badgeOverlayCtx.translate(bonusCX, bonusCY);
        badgeOverlayCtx.scale(bonusScale, bonusScale);
        badgeOverlayCtx.font = '104px Dimbo, "Arial Black", sans-serif';
        badgeOverlayCtx.textAlign = 'center';
        badgeOverlayCtx.textBaseline = 'middle';
        badgeOverlayCtx.strokeStyle = '#073A79';
        badgeOverlayCtx.lineWidth = 14;
        badgeOverlayCtx.strokeText(bonusLabel, 0, 0);
        badgeOverlayCtx.strokeStyle = '#FD9C1A';
        badgeOverlayCtx.lineWidth = 7;
        badgeOverlayCtx.strokeText(bonusLabel, 0, 0);
        badgeOverlayCtx.fillStyle = '#ffffff';
        badgeOverlayCtx.fillText(bonusLabel, 0, 0);
        badgeOverlayCtx.restore();
      }

      badgeOverlayCtx.save();
      badgeOverlayCtx.globalAlpha = alpha;
      badgeOverlayCtx.translate(DISPLAY_W / 2 + 30, DISPLAY_H / 2 - 30);
      badgeOverlayCtx.scale(scale, scale);
      badgeOverlayCtx.drawImage(ba.img, -W / 2, -H / 2, W, H);
      badgeOverlayCtx.font = 'bold 67px Fredoka, sans-serif';
      badgeOverlayCtx.textAlign = 'center';
      badgeOverlayCtx.textBaseline = 'middle';
      badgeOverlayCtx.scale(1, 1.2);
      badgeOverlayCtx.strokeStyle = getBadgeStrokeColor(ba.streak);
      badgeOverlayCtx.lineWidth = 11;
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

function endGame() {
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

  setTimeout(() => {
    timeupOverlay.classList.remove('timeup-in');
    timeupOverlay.classList.add('timeup-out');

    setTimeout(() => {
      timeupOverlay.style.display = 'none';
      timeupOverlay.classList.remove('timeup-out');

      cancelAnimationFrame(animFrameId);
      animFrameId = null;
      gameWrapper.style.display = 'none';
      scoreDisplayEl.style.display = 'none';
      finalScoreEl.textContent = state.score.toLocaleString();
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
          highscorePlayer.score = highscore;
          if (lbBestScoreEl) lbBestScoreEl.textContent = highscore.toLocaleString();
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

  let margenHorizontal = 40;
  if (anchoVentana > 1024) {
    margenHorizontal = anchoVentana * 0.35;
  } else if (anchoVentana > 768) {
    margenHorizontal = anchoVentana * 0.20;
  }

  const margenVertical = 80;

  const escalaW = (anchoVentana - margenHorizontal) / DISPLAY_W;
  const escalaH = (altoVentana - margenVertical) / DISPLAY_H;

  let escalaFinal = Math.min(escalaW, escalaH);
  escalaFinal = escalaFinal * 0.92;

  gameWrapper.style.transform = `scale(${escalaFinal})`;
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


// ── PREGAME COUNTDOWN ─────────────────────────────────────────────────────────
const pregameCountdownEl    = document.getElementById('pregame-countdown');
const pregameCountdownImg   = document.getElementById('pregame-countdown-img');
const PREGAME_STEPS = [
  { src: 'images/countdown/3.png', hold: 750,  size: 420 },
  { src: 'images/countdown/2.png', hold: 750,  size: 420 },
  { src: 'images/countdown/1.png', hold: 750,  size: 420 },
  { src: 'images/countdown/go.png', hold: 950, size: 490 },
];

function runPregameCountdown(onDone) {
  pregameCountdownEl.style.display = 'flex';
  sfxCountdown.currentTime = 0;
  sfxCountdown.play();
  let step = 0;

  function showStep() {
    if (step >= PREGAME_STEPS.length) {
      pregameCountdownEl.style.display = 'none';
      onDone();
      return;
    }
    const { src, hold, size } = PREGAME_STEPS[step++];
    pregameCountdownImg.style.animation = 'none';
    pregameCountdownImg.style.width  = size + 'px';
    pregameCountdownImg.style.height = size + 'px';
    pregameCountdownImg.src = src;
    void pregameCountdownImg.offsetWidth;
    pregameCountdownImg.style.animation = '';
    setTimeout(showStep, hold);
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
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'flex';

  redimensionarJuego();

  resetState();
  gradeCounts = { perfect: 0, good: 0, fair: 0 };
  wrongCount = 0;
  updateDotsUI();
  scoreValueEl.textContent     = '0';
  lastLbScore = -1;
  lastPlayerRank = -1;
  sortLeaderboard(0);
  resultLabel.className        = '';
  speedBonusText.classList.remove('visible');
  cityTagEl.style.transition   = 'none';
  cityTagEl.style.left         = '-525px';
  cityTagEl.style.top          = '-163px';
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
  gameoverScreen.style.display = 'none';
  document.getElementById('loading-screen').style.display = '';

  const fmt = v => v > 0 ? '🏆 ' + v.toLocaleString() : '';
  const elPlay   = document.getElementById('loading-play-hs');
  const elFlags  = document.getElementById('loading-flags-hs');
  const elShapes = document.getElementById('loading-shapes-hs');
  const elMode4  = document.getElementById('loading-mode4-hs');
  if (elPlay)   elPlay.textContent   = fmt(parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10));
  if (elFlags)  elFlags.textContent  = fmt(parseInt(localStorage.getItem('flagsHighscore')         || '0', 10));
  if (elShapes) elShapes.textContent = fmt(parseInt(localStorage.getItem('shapesHighscore')        || '0', 10));
  if (elMode4)  elMode4.textContent  = fmt(parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10));

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
(function () {
  const wrap  = document.querySelector('.splash-text2-wrap');
  const label = document.querySelector('.splash-text2-label');
  if (!wrap || !label) return;
  const ro = new ResizeObserver(() => {
    label.style.fontSize = (wrap.offsetWidth * 0.055) + 'px';
  });
  ro.observe(wrap);
})();

// ── GAMEOVER TEXT1 RESPONSIVE ─────────────────────────────────────────────────
(function () {
  const wrap  = document.querySelector('.gameover-text1-wrap');
  const label = document.querySelector('.gameover-text1-label');
  if (!wrap || !label) return;
  const ro = new ResizeObserver(() => {
    label.style.fontSize = (wrap.offsetWidth * 0.055) + 'px';
  });
  ro.observe(wrap);
})();

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
  const MIN_W   = 480;
  const MIN_H   = 320;
  const MAX_RATIO = 2.8;

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
