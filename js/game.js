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
const canvas         = document.getElementById('game-canvas');
const ctx            = canvas.getContext('2d');
const cityTagEl      = document.getElementById('city-tag');
const cityTagText    = document.getElementById('city-tag-text');
const timerNumberEl  = document.getElementById('timer-number');
const countdownImg   = document.querySelector('#countdown-widget img');
const progressDots   = document.querySelectorAll('.dot');
const scoreValueEl   = document.getElementById('score-value');
const speedBonusText = document.getElementById('speed-bonus-text');
const coordTooltip   = document.getElementById('coord-tooltip');
const resultLabel    = document.getElementById('result-label');
const finalScoreEl   = document.getElementById('final-score-value');
const highscoreEl        = document.getElementById('highscore-value');
const splashHighscoreEl  = document.getElementById('splash-highscore-value');
const newHighscoreBanner = document.getElementById('new-highscore-banner');
const newHighscoreScore  = document.getElementById('new-highscore-score');
const profileCurrentEl   = null; // removed
const btnStart       = document.getElementById('btn-start');
const btnRestart     = document.getElementById('btn-restart');
const progressContainer = document.getElementById('progress-dots');

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

function canvasToLatLon(x, y) {
  const lon = MAP_LON_LEFT + (x / DISPLAY_W) * (MAP_LON_RIGHT - MAP_LON_LEFT);
  const m   = MERC_TOP - (y / DISPLAY_H) * (MERC_TOP - MERC_BOT);
  const lat = (Math.atan(Math.exp(m)) - Math.PI / 4) * 360 / Math.PI;
  return { lat, lon };
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
                          if (badgeColor) state.badgeAnim = { t: 0, img: badgeColor, streak: state.streak, inRowBonus };
                        }, 200);
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
function getInRowBonus(streak) {
  const milestones = [3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
  const idx = milestones.indexOf(streak);
  if (idx !== -1) return (idx + 1) * 100;
  if (streak >= 60 && streak % 5 === 0) return (12 + (streak - 55) / 5) * 100;
  return 0;
}

function getBadgeStrokeColor(streak) {
  if (streak === 5)  return '#3d5806';
  if (streak === 10) return '#5c0000';
  if (streak === 20) return '#104696';
  if (streak === 30) return '#6b0015';
  if (streak === 40) return '#ac7600';
  if (streak === 50) return '#383838';
  return '#623103'; // gold: 3, 15, 25, 35, 45, 55, 60, 65, 70...
}

function getBadgeImg(streak) {
  if (streak === 3)  return imgBadgeGold;
  if (streak === 5)  return imgBadgeGreen;
  if (streak === 10) return imgBadgeRed;
  if (streak === 15) return imgBadgeGold;
  if (streak === 20) return imgBadgeBlue;
  if (streak === 25) return imgBadgeGold;
  if (streak === 30) return imgBadgeGarnet;
  if (streak === 35) return imgBadgeGold;
  if (streak === 40) return imgBadgeYellow;
  if (streak === 45) return imgBadgeGold;
  if (streak === 50) return imgBadgeSilver;
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

// ── DIBUJO PIN 1 ────────────────────────
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

  if (state.pin1Anim) {
    const dist   = 220 * (1 - p.progress);
    const scale  = 10 - 9 * p.progress;
    const curW   = PIN_W * scale;
    const curH   = PIN_H * scale;
    const tipX   = p.x + dist;
    const tipY   = p.y - dist;

    // ── LÓGICA DE ROTACIÓN (WOBBLE) ──
    let angle = 0;
    if (p.progress >= 1) { // El movimiento de caída ha terminado
      p.wobbleTime += dt;
      const duration = 0.08; // 0.08 segundos de animación
      if (p.wobbleTime < duration) {
        const half = duration / 2;
        const maxRad = (3 * Math.PI) / 180; // Convertimos 3° a radianes

        // Efecto elástico: va de 0 a 3° y vuelve a 0
        if (p.wobbleTime < half) {
          angle = (p.wobbleTime / half) * maxRad;
        } else {
          angle = maxRad - ((p.wobbleTime - half) / half) * maxRad;
        }
      }
    }

    const hf = 1 - p.progress;
    const shadowAlpha = Math.max(0, (p.progress - 0.1) / 0.9) * 0.30 * p.opacity;
    
    // Sombra (mantenemos tu lógica de transformación)
    if (shadowAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = shadowAlpha;
      ctx.filter = 'brightness(0) blur(1.5px)';
      ctx.translate(tipX, tipY);

      ctx.rotate(angle);

      ctx.transform(1, 0, -hf * 1.2, 0.08, 0, 0);
      ctx.drawImage(imgPin1, -curW * PIN1_TIP.x, -curH * PIN1_TIP.y, curW, curH);
      ctx.restore();
    }

    // Pin con rotación en la punta
    ctx.save();
    ctx.globalAlpha = p.opacity;
    
    // 1. Trasladamos el contexto a la punta (punto de impacto)
    ctx.translate(tipX, tipY);
    // 2. Rotamos el contexto los grados calculados
    ctx.rotate(angle);
    // 3. Dibujamos desplazando la imagen según su punto de anclaje (TIP)
    ctx.drawImage(imgPin1, -curW * PIN1_TIP.x, -curH * PIN1_TIP.y, curW, curH);
    
    ctx.restore();
    ctx.globalAlpha = 1;
  }
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

    if (state.pin2Anim) {
      const dist   = 220 * (1 - p.progress);
      const scale  = 10 - 9 * p.progress;
      const curW   = PIN_W * scale;
      const curH   = PIN_H * scale;
      const tipX   = p.x - dist;
      const tipY   = p.y - dist;

      // ── LÓGICA DE ROTACIÓN (WOBBLE) ──
      let angle = 0;
      if (p.progress >= 1) { // Solo cuando termina de caer
        p.wobbleTime += dt;
        const duration = 0.08; // Duración total deseada
        if (p.wobbleTime < duration) {
          const half = duration / 2;
          const maxRad = (3 * Math.PI) / 180; // 3 grados a radianes

          // Triangulamos la rotación: sube a 3° y baja a 0°
          if (p.wobbleTime < half) {
            angle = (p.wobbleTime / half) * maxRad;
          } else {
            angle = maxRad - ((p.wobbleTime - half) / half) * maxRad;
          }
        }
      }

      const hf = 1 - p.progress;
      const shadowAlpha = Math.max(0, (p.progress - 0.1) / 0.9) * 0.30 * p.opacity;
      
      // Sombra (se queda igual)
      if (shadowAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.filter = 'brightness(0) blur(1.5px)';
        ctx.translate(tipX, tipY);
        ctx.transform(1, 0, -hf * 1.2, 0.08, 0, 0);
        ctx.drawImage(imgPin2, -curW * PIN2_TIP.x, -curH * PIN2_TIP.y, curW, curH);
        ctx.restore();
      }
      
      // Pin con efecto de rotación
      ctx.save();
      ctx.globalAlpha = p.opacity;
      
      // 1. Trasladamos a la punta del pin
      ctx.translate(tipX, tipY);
      // 2. Aplicamos la rotación
      ctx.rotate(angle);
      // 3. Dibujamos el pin centrado en su punta (usando los offsets negativos de PIN2_TIP)
      ctx.drawImage(imgPin2, -curW * PIN2_TIP.x, -curH * PIN2_TIP.y, curW, curH);
      
      ctx.restore();
      ctx.globalAlpha = 1;
    }
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
    const IN_END = 0.2, HOLD_END = 0.50, SHRINK_DUR = 0.22, TOTAL = HOLD_END + SHRINK_DUR;
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
      const BZ_IN = 0.18, BZ_HOLD = 0.42, BZ_OUT = 0.62;
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

  setTimeout(() => {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
    gameWrapper.style.display = 'none';
    document.getElementById('score-display').style.display = 'none';
    finalScoreEl.textContent = state.score.toLocaleString();
    const isNewHighscore = state.score > highscore;
    if (isNewHighscore) {
      highscore = state.score;
      localStorage.setItem('geochallenge_highscore', highscore);
      highscoreEl.textContent = highscore.toLocaleString();
      // Actualizar perfil del highscore en el leaderboard
      highscorePlayer.score = highscore;
      const bestScoreEl = document.getElementById('lb-best-score');
      if (bestScoreEl) bestScoreEl.textContent = highscore.toLocaleString();
      updateSplashHighscore();
    }
    // Mostrar u ocultar banner de nuevo récord
    newHighscoreBanner.style.display = isNewHighscore ? 'flex' : 'none';
    if (isNewHighscore) {
      newHighscoreScore.textContent = highscore.toLocaleString();
    }
    gameoverScreen.style.display = 'flex';
  }, 600);
}

// ── ESCALADO RESPONSIVE ───────────────────────────────────────────────────────
function redimensionarJuego() {
  const wrapper = document.getElementById('game-wrapper');
  if (!wrapper || wrapper.style.display === 'none') return;

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

  wrapper.style.transform = `scale(${escalaFinal})`;
  wrapper.style.transformOrigin = 'center center';
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
  { src: 'images/countdown/3.png', hold: 900,  size: 420 },
  { src: 'images/countdown/2.png', hold: 900,  size: 420 },
  { src: 'images/countdown/1.png', hold: 900,  size: 420 },
  { src: 'images/countdown/go.png', hold: 1000, size: 490 },
];

function runPregameCountdown(onDone) {
  pregameCountdownEl.style.display = 'flex';
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
  clearInterval(timerIntervalId);
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }

  splashScreen.style.display    = 'none';
  gameoverScreen.style.display  = 'none';
  newHighscoreBanner.style.display = 'none';
  gameWrapper.style.display     = 'block';
  document.getElementById('score-display').style.display = 'block';

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

  animFrameId = requestAnimationFrame(render);

  // Pausar el pulso del timer hasta que arranque el juego real
  countdownImg.style.animationPlayState = 'paused';

  // Cuenta regresiva antes de arrancar el timer y la primera ciudad
  runPregameCountdown(() => {
    startTimer();
    setTimeout(nextCity, 100);
  });
}

btnStart.addEventListener('click', startGame);
btnRestart.addEventListener('click', startGame);

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