// ── SFX ───────────────────────────────────────────────────────────────────────
const sfxPin       = new Audio('sfx/pin.mp3');
const sfxCountdown = new Audio('sfx/cuentaregresiva.mp3');
const sfxError     = new Audio('sfx/error.mp3');
const sfxAcertar   = new Audio('sfx/acertar.mp3');
const sfxVeryNice  = new Audio('sfx/verynice.mp3');
const sfxTag       = new Audio('sfx/tag.mp3');
const sfxBonus     = new Audio('sfx/bonus.mp3');
const sfxTickdown  = new Audio('sfx/countdown.mp3');
const sfxTimesUp   = new Audio('sfx/timesup.mp3');
const sfxCheck     = new Audio('sfx/check.mp3');
const sfxPostgame  = new Audio('sfx/postgameloop.mp3');
sfxPostgame.loop   = true;

function playMusic(track) {
  [sfxPostgame].forEach(t => { if (t !== track) { t.pause(); t.currentTime = 0; } });
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
const btnRestart        = document.getElementById('btn-restart');
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
const imgMap  = new Image(); imgMap.src  = 'images/mapimage.png';
const imgPin1 = new Image(); imgPin1.src = 'images/pin1.png';
const imgPin2 = new Image(); imgPin2.src = 'images/pin2.png';
const imgStar  = new Image(); imgStar.src  = 'images/stareffect.png';
const imgCheck       = new Image(); imgCheck.src       = 'images/check.png';
const imgBadgeGold   = new Image(); imgBadgeGold.src   = 'images/badges/goldbadge.png';
const imgBadgeGreen  = new Image(); imgBadgeGreen.src  = 'images/badges/greenbadge.png';
const imgBadgeRed    = new Image(); imgBadgeRed.src    = 'images/badges/redbadge.png';
const imgBadgeBlue   = new Image(); imgBadgeBlue.src   = 'images/badges/bluebadge.png';
const imgBadgeGarnet = new Image(); imgBadgeGarnet.src = 'images/badges/garnetbadge.png';
const imgBadgeYellow = new Image(); imgBadgeYellow.src = 'images/badges/yellowbadge.png';
const imgBadgeSilver = new Image(); imgBadgeSilver.src = 'images/badges/silverbadge.png';

// ── STATE ────────────────────────────────────────────────────────────────────
let state          = null;
let animFrameId    = null;
let timerIntervalId = null;
let speedBonusHideId = null;

let highscore = parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10);
highscoreEl.textContent = highscore.toLocaleString();

function updateSplashHighscore() {
  if (splashHighscoreEl) {
    splashHighscoreEl.textContent = highscore > 0 ? highscore.toLocaleString() : '—';
  }
}
updateSplashHighscore();

// El autoplay requiere interacción previa — arrancamos pregame en el primer toque
function startPregameMusic() {
  playMusic(sfxPostgame);
  splashScreen.removeEventListener('click', startPregameMusic);
}
splashScreen.addEventListener('click', startPregameMusic);

// ── LEADERBOARD ──────────────────────────────────────────────────────────────────────────────
const LB_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
                    '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a'];
const mockPlayers = Array.from({ length: 10 }, (_, i) => ({
  id: `mock${i}`,
  score: Math.floor(Math.random() * 9500) + 400,
  color: LB_COLORS[i],
  initial: 'ABCDEFGHIJ'[i],
}));

// Perfil del highscore propio (entrada 11)
const highscorePlayer = { id: 'best', score: highscore, color: '#6a0dad', initial: '★' };

// Ventana visible y fila de anclaje del player
const LB_WINDOW  = 5;
const LB_PIN_ROW = 2;
const LB_GAP     = 4; // px
let lbElements   = {};

const EMOTE_SRCS = [
  'images/emotes/Gemini_Generated_Image_9dly9v9dly9v9dly (2).png',
  'images/emotes/Gemini_Generated_Image_9uavb19uavb19uav.png',
  'images/emotes/Gemini_Generated_Image_b2kisyb2kisyb2ki.png',
  'images/emotes/Gemini_Generated_Image_o8jl8no8jl8no8jl.png',
  'images/emotes/Gemini_Generated_Image_omvaevomvaevomva.png',
  'images/emotes/Gemini_Generated_Image_wuzcs6wuzcs6wuzc.png',
];

// Lanza un globo de emote sobre el elemento del leaderboard indicado.
// El globo es hijo del entry para seguir su movimiento automaticamente.
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

// Alto de una fila = ancho del panel * 1.5 (aspect-ratio 4/6) + gap
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

  // Entrada del highscore propio
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

  // Primer frame: posicionar sin animar; segundo frame: habilitar transicion
  requestAnimationFrame(() => {
    positionLeaderboard(0, false);
    requestAnimationFrame(() => {
      Object.values(lbElements).forEach(el => {
        el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)';
      });
    });
  });
}

// Posiciona todas las entradas segun el score. animate=false omite la transicion.
function positionLeaderboard(playerScore, animate) {
  const lb   = document.getElementById('leaderboard');
  const rowH = getLbRowHeight();

  lb.style.height = (LB_WINDOW * rowH - LB_GAP) + 'px';

  const all = [...mockPlayers, { id: 'best', score: highscorePlayer.score }, { id: 'player', score: playerScore }];
  all.sort((a, b) => b.score - a.score);

  const playerRank = all.findIndex(p => p.id === 'player');

  // Detectar a todos los que el player acaba de superar y lanzar un globo a cada uno
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

  // El player se ancla en LB_PIN_ROW; cerca del final la ventana se corre
  // para que el player suba fisicamente las primeras posiciones ganadas.
  let windowStart = Math.max(0, playerRank - LB_PIN_ROW);
  let windowEnd   = Math.min(all.length, windowStart + LB_WINDOW);
  windowStart     = Math.max(0, windowEnd - LB_WINDOW);

  if (!animate) {
    Object.values(lbElements).forEach(el => { el.style.transition = 'none'; });
  }

  // Cada entrada se posiciona en su fila de la cadena completa.
  // Las que quedan fuera de la ventana quedan ocultas por overflow:hidden.
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
function slideTagIn(cityName) {
  const wasVisible = cityTagEl.style.left !== '' && cityTagEl.style.left !== '-420px';
  if (wasVisible) {
    const ghost = cityTagEl.cloneNode(true);
    ghost.className = 'city-tag-ghost';
    ghost.style.visibility = 'visible';
    ghost.style.zIndex = '9';
    ghost.style.transition = 'none';
    ghost.style.top  = cityTagEl.style.top  || '10px';
    ghost.style.left = cityTagEl.style.left || '-80px';
    gameWrapper.appendChild(ghost);
    setTimeout(() => {
      ghost.style.transition = 'opacity 0.3s';
      ghost.style.opacity = '0';
      setTimeout(() => ghost.remove(), 350);
    }, 450);
  }

  cityTagText.textContent = cityName;
  // Reduce el font-size progresivamente si el nombre es largo, mínimo 14px
  const baseSize = 26;
  const maxWidth = 230; // px disponibles en el tag
  cityTagText.style.fontSize = baseSize + 'px';
  let fs = baseSize;
  while (fs > 14 && cityTagText.scrollWidth > maxWidth) {
    fs--;
    cityTagText.style.fontSize = fs + 'px';
  }
  cityTagEl.style.visibility = 'hidden';
  cityTagEl.style.transition = 'none';
  cityTagEl.style.top  = '-130px';
  cityTagEl.style.left = '-420px';
  setTimeout(() => { sfxTag.currentTime = 0; sfxTag.play(); }, 200);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cityTagEl.style.visibility = 'visible';
      cityTagEl.style.transition = 'left 0.45s cubic-bezier(0.22,1,0.36,1), top 0.45s cubic-bezier(0.22,1,0.36,1)';
      cityTagEl.style.left = '-80px';
      cityTagEl.style.top  = '10px';
    });
  });
}

// ── DOTS ─────────────────────────────────────────────────────────────────────
function updateDotsUI() {
  progressDots.forEach((d, i) => d.classList.toggle('filled', i < state.dots));
}

function advanceDot() {
  // Si la animación ya está corriendo, acumula el dot pero no re-dispara la animación
  state.dots++;
  updateDotsUI();

  if (state.dots >= DOTS_NEEDED && !progressContainer.classList.contains('train-animation')) {
    progressContainer.classList.add('train-animation');
    
    // Bonus de tiempo
    state.timeLeft = Math.min(state.timeLeft + BONUS_TIME, 99);
    timerNumberEl.textContent = state.timeLeft;
    
    const originalColor = timerNumberEl.style.color;
    timerNumberEl.style.color = '#00ff88'; 

    // 1. Esperamos los 2 segundos de la animación del "trencito"
    setTimeout(() => {
      // 2. Iniciamos el fade out añadiendo la clase de CSS
      progressContainer.classList.add('dots-fade-out');

      // 3. Esperamos a que el fade out (0.5s) termine para resetear el estado
      setTimeout(() => {
        // Conserva los dots acumulados DURANTE la animación (los que superan DOTS_NEEDED)
        state.dots = Math.max(0, state.dots - DOTS_NEEDED);
        // Quitamos ambas clases y reseteamos la UI
        progressContainer.classList.remove('train-animation', 'dots-fade-out');
        updateDotsUI();
        
        // Restaurar color del timer
        if (state.timeLeft <= 10) {
          timerNumberEl.style.color = '#ffffff';
          countdownImg.src = 'images/countdownred.png';
        } else {
          timerNumberEl.style.color = originalColor;
          countdownImg.src = 'images/countdown.png';
        }
      }, 500); // Este tiempo debe coincidir con el 'transition: opacity' de CSS

    }, 2000); // Duración de la animación de colores
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
  if (state.poolIndex >= state.cityPool.length) {
    state.cityPool = shuffle([...CITIES]);
    state.poolIndex = 0;
  }
  state.currentCity = state.cityPool[state.poolIndex++];
  state.cityShownAt = Date.now();
  state.phase = 'waiting';
  slideTagIn(state.currentCity.name);
}

// ── CLICK ─────────────────────────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
  if (!state || state.phase !== 'waiting') return;
  state.phase = 'animating';
  sfxPin.currentTime = 0;
  sfxPin.play();

  const rect    = canvas.getBoundingClientRect();
  
  // ¡CORRECCIÓN CRÍTICA! Ajustamos las coordenadas por si el canvas se escaló por CSS
  const scaleX  = canvas.width / rect.width;
  const scaleY  = canvas.height / rect.height;
  const clickX  = (e.clientX - rect.left) * scaleX;
  const clickY  = (e.clientY - rect.top) * scaleY;
  
  const correct = latLonToCanvas(state.currentCity.lat, state.currentCity.lon);
  const d       = dist(clickX, clickY, correct.x, correct.y);
  const grade   = classify(d);
  const shownAt = state.cityShownAt;

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
  const totalGained = base + bonusAmt + streakBonus + inRowBonus;
  state.score += totalGained;
  if (totalGained > 0) showScorePopup(totalGained);
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
  });

  if (grade !== 'wayoff') {
    advanceDot();
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
                        setTimeout(() => {
                          showResultLabel(correct.x, correct.y, grade, base, bonusAmt);
                          if (badgeColor) {
                            state.badgeAnim = { t: 0, img: badgeColor, streak: state.streak, inRowBonus };
                            setTimeout(() => { sfxBonus.currentTime = 0; sfxBonus.play(); }, 800);
                          }
                        }, 300);
                        setTimeout(() => {
                          state.phase = 'waiting';
                          nextCity();
                        }, 500);
                      }
                    };
    const capturedPin2 = state.pin2Anim;
    setTimeout(() => { if (state.pin2Anim === capturedPin2) capturedPin2.fading = true; }, 1000);
  }, 300);

  setTimeout(() => { if (state.pin1Anim === capturedPin1) capturedPin1.fading = true; }, 1000);
});

// ── BADGE ─────────────────────────────────────────────────────────────────────
const MILESTONE_BONUSES = { 3:100, 5:200, 10:300, 15:400, 20:500, 25:600, 30:700, 35:800, 40:900, 45:1000, 50:1100, 55:1200 };
function getInRowBonus(streak) {
  if (MILESTONE_BONUSES[streak]) return MILESTONE_BONUSES[streak];
  if (streak >= 60 && streak % 5 === 0) return (12 + (streak - 55) / 5) * 100;
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
  ctx.drawImage(imgMap, 0, 0, DISPLAY_W, DISPLAY_H);

  if (state.displayedScore < state.score) {
    const diff = state.score - state.displayedScore;
    state.displayedScore = Math.min(state.score, state.displayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    scoreValueEl.textContent = state.displayedScore.toLocaleString();
    sortLeaderboard(state.score);
  }

  for (const dot of state.placedDots) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff2222';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    const age = (Date.now() - dot.labelBorn) / 1000;
    if (age < 4) {
      dot.labelOpacity = age < 3 ? 1 : Math.max(0, 1 - (age - 3));
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

    // Layer 1: 12 rays, fast rotation
    drawLayer(12, 4 + prog * 6,  12 + prog * 68, 0.28 / 12,  -4.4);
    // Layer 2: 8 rays, slow rotation (opposite direction)
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
      const CW = 477, CH = 405; // tamaño del check

      badgeOverlayCtx.save();
      badgeOverlayCtx.globalAlpha = alpha;
      badgeOverlayCtx.translate(DISPLAY_W / 2, DISPLAY_H / 2);
      badgeOverlayCtx.scale(scale, scale);
      badgeOverlayCtx.drawImage(imgCheck, -CW / 2, -CH / 2, CW, CH);
      badgeOverlayCtx.restore();

      // bonus number — zoom in / hold / zoom out independiente
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
        badgeOverlayCtx.font = 'bold 52px "Arial Black", Impact, sans-serif';
        badgeOverlayCtx.textAlign = 'center';
        badgeOverlayCtx.textBaseline = 'middle';
        const shadowOffsets = [[-7,-7],[-7,0],[-7,7],[0,-7],[0,7],[7,-7],[7,0],[7,7]];
        badgeOverlayCtx.fillStyle = '#183897';
        for (const [ox, oy] of shadowOffsets) badgeOverlayCtx.fillText(bonusLabel, ox, oy);
        badgeOverlayCtx.strokeStyle = '#ffaa00';
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
  countdownImg.src = 'images/countdown.png';
  countdownImg.style.animationPlayState = 'running';

  timerIntervalId = setInterval(() => {
    state.timeLeft--;
    timerNumberEl.textContent = state.timeLeft;

    if (state.timeLeft <= 10) {
      timerNumberEl.style.color = '#ffffff';
      countdownImg.src = 'images/countdownred.png';
      if (state.timeLeft > 0) { sfxTickdown.currentTime = 0; sfxTickdown.play(); }
    } else {
      timerNumberEl.style.color = '';
      countdownImg.src = 'images/countdown.png';
    }

    if (state.timeLeft <= 0)  endGame();
  }, 1000);
}

function endGame() {
  clearInterval(timerIntervalId);
  state.phase = 'idle';
  canvas.style.pointerEvents = 'none';
  countdownImg.style.animationPlayState = 'paused';

  // Mostrar overlay timeup.png
  sfxTimesUp.currentTime = 0; sfxTimesUp.play();
  timeupOverlay.style.display = 'flex';
  timeupOverlay.classList.remove('timeup-out');
  timeupOverlay.classList.add('timeup-in');

  // Después de 1.2s de hold, animación de salida
  setTimeout(() => {
    timeupOverlay.classList.remove('timeup-in');
    timeupOverlay.classList.add('timeup-out');

    // Al segundo (350ms animación salida + ~650ms margen) ir al gameover
    setTimeout(() => {
      timeupOverlay.style.display = 'none';
      timeupOverlay.classList.remove('timeup-out');

      cancelAnimationFrame(animFrameId);
      animFrameId = null;
      gameWrapper.style.display = 'none';
      scoreDisplayEl.style.display = 'none';
      finalScoreEl.textContent = state.score.toLocaleString();
      const isNewHighscore = state.score > highscore;
      if (isNewHighscore) {
        highscore = state.score;
        localStorage.setItem('geochallenge_highscore', highscore);
        highscoreEl.textContent = highscore.toLocaleString();
        // Actualizar perfil del highscore en el leaderboard
        highscorePlayer.score = highscore;
        if (lbBestScoreEl) lbBestScoreEl.textContent = highscore.toLocaleString();
        updateSplashHighscore();
      }
      // Mostrar u ocultar banner de nuevo récord
      newHighscoreBanner.style.display = isNewHighscore ? 'flex' : 'none';
      if (isNewHighscore) {
        newHighscoreScore.textContent = highscore.toLocaleString();
      }
      gameoverScreen.style.display = 'flex';
      playMusic(sfxPostgame);
    }, 1000);
  }, 400 + 1200); // 400ms entrada + 1200ms hold
}

// ── ESCALADO RESPONSIVE ───────────────────────────────────────────────────────
function redimensionarJuego() {
  if (!gameWrapper || gameWrapper.style.display === 'none') return;

  const anchoVentana = window.innerWidth;
  const altoVentana = window.innerHeight;

  // Calculamos el margen según la pantalla para respetar las barras blancas
  let margenHorizontal = 40; 
  if (anchoVentana > 1024) {
    margenHorizontal = anchoVentana * 0.35; // 30% en barras + un margen extra
  } else if (anchoVentana > 768) {
    margenHorizontal = anchoVentana * 0.20; // Barras más chicas
  }

  const margenVertical = 80;

  // Escala necesaria para encajar en el alto y en el ancho disponible
  const escalaW = (anchoVentana - margenHorizontal) / DISPLAY_W;
  const escalaH = (altoVentana - margenVertical) / DISPLAY_H;
  
  // Math.min garantiza que el juego nunca se recorte
  let escalaFinal = Math.min(escalaW, escalaH);

  escalaFinal = escalaFinal * 0.92;

  gameWrapper.style.transform = `scale(${escalaFinal})`;
  gameWrapper.style.transformOrigin = 'center center';
}

function showScorePopup(amount) {
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = '+' + amount.toLocaleString();
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
  { src: 'images/countdown/go.png', hold: 750, size: 490 },
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
    // Forzar reflow para reiniciar la animación CSS en cada paso
    void pregameCountdownImg.offsetWidth;
    pregameCountdownImg.style.animation = '';
    setTimeout(showStep, hold);
  }

  showStep();
}

// ── START ─────────────────────────────────────────────────────────────────────
function startGame() {
  splashScreen.removeEventListener('click', startPregameMusic);
  clearInterval(timerIntervalId);
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  canvas.style.pointerEvents = '';

  playMusic(null);
  splashScreen.style.display    = 'none';
  gameoverScreen.style.display  = 'none';
  newHighscoreBanner.style.display = 'none';
  gameWrapper.style.display     = 'block';
  scoreDisplayEl.style.display = 'block';

  redimensionarJuego();

  resetState();
  updateDotsUI();
  scoreValueEl.textContent     = '0';
  lastLbScore = -1;
  lastPlayerRank = -1;
  sortLeaderboard(0);
  resultLabel.className        = '';
  speedBonusText.classList.remove('visible');
  cityTagEl.style.transition   = 'none';
  cityTagEl.style.left         = '-420px';
  cityTagEl.style.top          = '-130px';
  gameWrapper.querySelectorAll('.city-tag-ghost').forEach(g => g.remove());

  // Resetear timer visualmente antes del pregame countdown
  timerNumberEl.textContent = GAME_DURATION;
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown.png';

  // Ocultar el city tag sin transición
  cityTagEl.style.visibility = 'hidden';

  animFrameId = requestAnimationFrame(render);

  // Pausar el pulso del timer hasta que arranque el juego real
  countdownImg.style.animationPlayState = 'paused';

  // Cuenta regresiva antes de arrancar el timer y la primera ciudad
  runPregameCountdown(() => {
    startTimer();
    setTimeout(nextCity, 100);
  });
}

btnStart.addEventListener('click', () => { sfxCheck.currentTime = 0; sfxCheck.play(); startGame(); });
btnRestart.addEventListener('click', () => { sfxCheck.currentTime = 0; sfxCheck.play(); startGame(); });

/* ── COORD TOOLTIP ─────────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  
  const { lat, lon } = canvasToLatLon(x, y);
  coordTooltip.textContent = `${lat.toFixed(2)}°  ${lon.toFixed(2)}°`;
  coordTooltip.style.left = `${x}px`;
  coordTooltip.style.top  = `${y}px`;
  coordTooltip.style.display = 'block';
});

canvas.addEventListener('mouseleave', () => {
  coordTooltip.style.display = 'none';
});
*/