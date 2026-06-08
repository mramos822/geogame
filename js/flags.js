// ── MODO BANDERAS ─────────────────────────────────────────────────────────────
document.addEventListener('contextmenu', e => {
  if (e.target.closest('#flags-luggage-wrap')) e.preventDefault();
});

['flags-luggage-group', 'flags-luggage-left-group', 'flags-luggage-right-group',
 'flags-luggage-bl-group', 'flags-luggage-bc-group', 'flags-luggage-br-group'].forEach(id => {
  document.getElementById(id)?.addEventListener('mouseenter', () => {
    if (!flagsRunning) return;
    if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxSelect.play(); }
  });
});

const FLAGS_GAME_DURATION = 60;

const flagsWrapper       = document.getElementById('flags-wrapper');
const flagsScoreDisplay  = document.getElementById('flags-score-display');
const flagsRightPanel    = document.getElementById('flags-right-panel');
const mainRightPanel     = document.getElementById('right-panel');
const flagsMachine       = document.getElementById('flags-machine');
const flagsMachine2      = document.getElementById('flags-machine2');
const flagsMachine3      = document.getElementById('flags-machine3');
const flagsMachine3b     = document.getElementById('flags-machine3b');
const flagsFindLuggage   = document.getElementById('flags-findluggage');
flagsFindLuggage.addEventListener('dragstart', e => e.preventDefault());
const flagsLuggageWrap   = document.getElementById('flags-luggage-wrap');
flagsLuggageWrap.addEventListener('dragstart', e => e.preventDefault());

// El maletín y sus banderas usan un sistema de coordenadas en px (offsets de los
// grupos, clip-path: path(...) y matrix3d) que NO se puede expresar en vmin. Para
// que escale con el viewport como el resto, se escala el wrap completo como unidad.
// Factor = min(vw,vh)/911 → 1.0 en el viewport de referencia (9.11px por vmin).
// IMPORTANTE: usamos documentElement.clientWidth/clientHeight (viewport de LAYOUT,
// la misma base que el `vmin` de CSS) y NO window.innerWidth/innerHeight (viewport
// VISUAL). En iOS la barra de Safari hace que ambos difieran, dejando el maletín
// con distinta proporción que findluggage (que está en vmin). Con clientW/H la
// proporción maletín/findluggage es idéntica en PC e iOS.
function flagsLuggageScale() {
  const de = document.documentElement;
  return Math.min(de.clientWidth, de.clientHeight) / 911;
}
function scaleFlagsLuggage() {
  flagsLuggageWrap.style.transform = `translate(-50%, -50%) scale(${flagsLuggageScale()})`;
}
window.addEventListener('resize', scaleFlagsLuggage);
scaleFlagsLuggage();
const flagsFlagImg       = document.getElementById('flags-flag-img');
const flagsFlagidWrap    = document.getElementById('flags-flagid-wrap');
const flagsFlagidLabel   = document.getElementById('flags-flagid-label');
const flagsPregameEl     = document.getElementById('flags-pregame-countdown');
const flagsPregameImg    = document.getElementById('flags-pregame-countdown-img');
const flagsTimeupEl      = document.getElementById('flags-timeup-overlay');
const flagsTimerEl       = document.getElementById('flags-timer-number');
const flagsTimerImg      = document.querySelector('#flags-countdown-widget > img');
const flagsScoreEl       = document.getElementById('flags-score-value');
const flagsResultLabel   = document.getElementById('flags-result-label');

let flagsTimerIntervalId = null;
let flagsTimeLeft        = FLAGS_GAME_DURATION;
let flagsScore           = 0;
let flagsDisplayedScore  = 0;
let flagsScoreRafId      = null;
let flagsRunning         = false;
let flagsWrongCount      = 0;

const FLAGS_PREGAME_STEPS = [
  { src: 'images/countdown/3.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/2.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/1.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/go.png', hold: 950,  size: 54 },
];

// ── SHOW / HIDE ───────────────────────────────────────────────────────────────
function showFlagsMode() {
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  if (typeof playMusic !== 'undefined') playMusic(null);
  const gameCanvas = document.getElementById('game-canvas');

  flagsWrapper.style.position  = '';
  flagsWrapper.style.left      = '';
  flagsWrapper.style.top       = '';
  flagsWrapper.style.margin    = '';
  flagsWrapper.style.width     = gameCanvas.width  + 'px';
  flagsWrapper.style.height    = gameCanvas.height + 'px';
  flagsWrapper.style.display   = 'block';

  // Aplicar el mismo scale que redimensionarJuego calcula
  const anchoVentana = window.innerWidth;
  const altoVentana  = window.innerHeight;
  const margenHorizontal = anchoVentana * 0.35;
  const escalaW = (anchoVentana - margenHorizontal) / gameCanvas.width;
  const escalaH = (altoVentana - altoVentana * 0.08) / gameCanvas.height;
  const escala  = Math.min(escalaW, escalaH) * 0.92;
  flagsWrapper.style.transform       = `translate(-50%, -50%) scale(${escala})`;
  flagsWrapper.style.transformOrigin = 'center center';
  flagsScoreDisplay.style.display = 'block';
  document.getElementById('flags-countdown-widget').style.display = 'block';
  flagsRightPanel.style.display   = 'flex';
  mainRightPanel.style.display    = 'none';
  flagsMachine.style.display      = 'block';
  flagsMachine2.style.display     = 'block';
  flagsMachine3.style.display     = 'block';
  flagsMachine3b.style.display    = 'block';
  flagsFindLuggage.style.display  = 'none';
  flagsLuggageWrap.style.display  = 'none';
  flagsFlagidWrap.style.display   = 'none';

  flagsTimerEl.textContent = FLAGS_GAME_DURATION;
  flagsTimerEl.style.color = '';
  flagsTimerImg.src = 'images/countdown2.png';
  flagsTimerImg.style.animationPlayState = 'paused';

  if (typeof loadBadges !== 'undefined') loadBadges();

  // Resetear el puntaje ANTES de la cuenta regresiva para que el widget no
  // muestre el puntaje de la partida anterior durante el conteo.
  flagsScore          = 0;
  flagsDisplayedScore = 0;
  flagsScoreEl.textContent = (((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
  flagsLastLbScore = -1;

  initFlagsLeaderboard();

  runFlagsPregame(() => {
    flagsFindLuggage.style.display  = 'block';
    flagsFindLuggage.classList.remove('scrolling');
    void flagsFindLuggage.offsetWidth;
    flagsFindLuggage.classList.add('scrolling');
    flagsLuggageWrap.style.display  = 'block';
    flagsLuggageWrap.style.pointerEvents = '';
    flagsLuggageWrap.classList.remove('flags-game-ended');
    flagsFlagidWrap.style.display   = 'block';
    flagsFlagidLabel.textContent = '';
    flagsTimerImg.style.animationPlayState = 'running';
    if (typeof playMusic !== 'undefined') playMusic(sfxGameMusic);
    flagsMachine3.classList.add('scrolling');
    flagsMachine3b.classList.add('scrolling');
    flagsStreak = 0;
    flagsDots = 0;
    flagsUpdateDotsUI();
    flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
    flagsEasyUnlocked = false;
    flagsSixUnlocked = false;
    flagsMediumUnlocked = false;
    flagsHardUnlocked   = false;
    flagsInsaneUnlocked = false;
    flagsCorrectCount = 0;
    flagsIsFirstRound = true;
    flagsAnswered = new Set();
    flagsLastChosen = null;
    flagsGroupIds = flagsTopGroupIds.slice();
    flagsLuggageWrap.classList.remove('flags-six-mode');
    // Reset all group inline styles that may be stuck from a previous game's
    // mid-round cleanup being skipped by the !flagsRunning guard.
    clearFlagsElimination();
    ;[...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
      const g = document.getElementById(id);
      if (!g) return;
      g.style.animation  = '';
      g.style.transition = '';
      g.style.transform  = '';
      g.style.opacity    = '';
      g.style.willChange = '';
      g.classList.remove('flags-faded');
    });
    flagsBottomGroupIds.forEach(id => {
      const g = document.getElementById(id);
      if (g) g.style.display = 'none';
    });
    startFlagsRound();
    startFlagsTimer();
  });
}

const FLAGS_SPEED_WIN  = 2.0;   // segundos para conseguir bonus velocidad
const FLAGS_SPEED_MULT = 1.5;   // multiplicador

const flagsSpeedBonusText = document.getElementById('flags-speed-bonus-text');
let flagsSpeedBonusHideId = null;
let flagsRoundStartTime   = null;

// Grupos de banderas visualmente similares — se usan como distractores desde correcta 23
const FLAG_SIMILAR_GROUPS = [
  ["Chad", "Andorra", "Rumanía", "Moldova"],
  ["Italia", "México", "Costa de Marfil", "Irlanda"],
  ["Paraguay", "Países Bajos", "Luxemburgo", "Croacia"],
  ["Rusia", "Eslovenia", "Eslovaquia", "Serbia"],
  ["Catar", "Baréin"],
  ["Indonesia", "Mónaco", "Singapur", "Polonia"],
  ["Bélgica", "Alemania"],
  ["Colombia", "Ecuador", "Venezuela"],
  ["Bolivia", "Colombia", "Ecuador"],
  ["Noruega", "Islandia", "Suecia", "Dinamarca", "Finlandia"],
  ["Australia", "Nueva Zelanda"],
  ["Irak", "Siria", "Sudán", "Yemen", "Egipto"],
  ["Guinea", "Mali", "Senegal", "Ghana", "Costa de Marfil"],
  ["Estonia", "Finlandia", "Eslovenia"],
  ["Corea del Norte", "Corea del Sur"],
  ["China", "Vietnam"],
  ["India", "Níger"],
  ["República Dominicana", "Cuba", "Puerto Rico"],
  ["Grecia", "Uruguay"],
  ["Irlanda", "Costa de Marfil"],
  ["Lituania", "Bolivia", "Ghana"],
  ["Nigeria", "Armenia"],
  ["Israel", "El Salvador"],
  ["Filipinas", "Cuba"],
  ["Perú", "Japón", "Bangladesh", "Georgia"],
  ["Austria", "Letonia"],
  ["Bulgaria", "Hungría"],
  ["Bielorrusia", "Rusia"],
  ["Argelia", "Pakistán"],
  ["Brunéi", "Malasia"],
  ["Camboya", "Sri Lanka"],
  ["Chad", "Rumanía"],
  ["Burkina Faso", "Mali", "Guinea"],
  ["Nicaragua", "Honduras", "El Salvador"],
  ["Costa Rica", "Nicaragua", "Honduras"],
];

// Construir mapa inverso: país → array de similares
const FLAG_SIMILAR = {};
for (const group of FLAG_SIMILAR_GROUPS) {
  for (const country of group) {
    if (!FLAG_SIMILAR[country]) FLAG_SIMILAR[country] = new Set();
    for (const other of group) {
      if (other !== country) FLAG_SIMILAR[country].add(other);
    }
  }
}

const flagsTopGroupIds    = ['flags-luggage-left-group', 'flags-luggage-group', 'flags-luggage-right-group'];
const flagsBottomGroupIds = ['flags-luggage-bl-group', 'flags-luggage-bc-group', 'flags-luggage-br-group'];
let flagsGroupIds = flagsTopGroupIds.slice();
let flagsStreak = 0;
let flagsEasyUnlocked = false;
let flagsSixUnlocked = false;   // 6 maletas desde correcta 3
let flagsMediumUnlocked = false; // pool medium desde correcta 5
let flagsHardUnlocked   = false;
let flagsInsaneUnlocked = false;
let flagsCorrectCount = 0;
let flagsIsFirstRound = true;
let flagsAnswered = new Set();
let flagsLastChosen = null;

// Ventana de respuesta por ronda, en segundos. Debe coincidir con la duración de
// la animación #flags-findluggage.scrolling (css/style.css) que marca el wrong por demora.
const FLAGS_ROUND_TIME = 8.15;
// Eliminación progresiva de opciones erróneas (se desvanecen y quedan deseleccionables).
let flagsEliminationTimeouts = [];
function clearFlagsElimination() {
  flagsEliminationTimeouts.forEach(clearTimeout);
  flagsEliminationTimeouts = [];
}

const flagsSlotImgIds = {
  'flags-luggage-left-group':  'flags-flag-img-left',
  'flags-luggage-group':       'flags-flag-img',
  'flags-luggage-right-group': 'flags-flag-img-right',
  'flags-luggage-bl-group':    'flags-flag-img-bl',
  'flags-luggage-bc-group':    'flags-flag-img-bc',
  'flags-luggage-br-group':    'flags-flag-img-br',
};

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
const FLAGS_LB_COLORS  = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e8c','#00bcd4','#8bc34a'];
const FLAGS_LB_WINDOW  = 5;
const FLAGS_LB_PIN_ROW = 2;
const FLAGS_LB_GAP     = 4;

// Amigos desde la capa de datos compartida (js/friends.js -> getFriends()),
// la misma que usan la barra de monuments y las pantallas results/final.
function buildFlagsFriendPlayers() {
  const src = (typeof getFriends === 'function') ? getFriends() : [];
  return src.map((f, i) => ({
    id: `friend${i}`,
    name: f.name,
    score: f.score,
    color: FLAGS_LB_COLORS[i % FLAGS_LB_COLORS.length],
    initial: (f.name && f.name[0]) ? f.name[0].toUpperCase() : '?',
  }));
}
let flagsMockPlayers = buildFlagsFriendPlayers();

let flagsLbElements    = {};
let flagsLastLbScore   = -1;
let flagsLastPlayerRank = -1;

function getFlagsLbRowHeight() {
  const panel = document.getElementById('flags-right-panel');
  if (!panel) return 84;
  return Math.round(panel.getBoundingClientRect().width * 1.5) + FLAGS_LB_GAP;
}

function initFlagsLeaderboard() {
  const lb = document.getElementById('flags-leaderboard');
  lb.innerHTML = '';
  flagsLbElements = {};
  flagsLastLbScore = -1;
  flagsLastPlayerRank = -1;
  flagsMockPlayers = buildFlagsFriendPlayers(); // refrescar con la lista real de amigos

  flagsMockPlayers.forEach(p => {
    const el = document.createElement('div');
    el.className = 'lb-entry';
    el.id = `flags-lb-${p.id}`;
    el.innerHTML = `<div class="lb-avatar" style="background:${p.color}">${p.initial}</div>`
                 + `<span class="lb-score">${p.score.toLocaleString()}</span>`;
    el.style.transition = 'none';
    el.style.top = '-9999px';
    flagsLbElements[el.id] = el;
    lb.appendChild(el);
  });

  const playerEl = document.createElement('div');
  playerEl.className = 'lb-entry lb-player';
  playerEl.id = 'flags-lb-player';
  playerEl.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" src="images/ppdefault.png"></div>`
                     + `<span class="lb-score" id="flags-lb-player-score">0</span>`;
  playerEl.style.transition = 'none';
  playerEl.style.top = '-9999px';
  flagsLbElements['flags-lb-player'] = playerEl;
  lb.appendChild(playerEl);

  requestAnimationFrame(() => {
    flagsPositionLeaderboard(0, false);
    requestAnimationFrame(() => {
      Object.values(flagsLbElements).forEach(el => {
        el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)';
      });
    });
  });
}

// Si la lista de amigos cambia (datos reales del servidor) mientras se juega flags,
// reconstruir su barra. Fuera de flags se reconstruye sola al iniciar la partida.
if (typeof onFriendsUpdate === 'function') {
  onFriendsUpdate(() => { if (flagsRunning) initFlagsLeaderboard(); });
}

function flagsPositionLeaderboard(playerScore, animate) {
  // Barra universal: el jugador compite con el puntaje acumulado de la campaña
  // (base de modos previos + modo actual), no solo con el de flags.
  playerScore += ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0);
  const lb   = document.getElementById('flags-leaderboard');
  const rowH = getFlagsLbRowHeight();
  lb.style.height = (FLAGS_LB_WINDOW * rowH - FLAGS_LB_GAP) + 'px';

  const all = [...flagsMockPlayers, { id: 'player', score: playerScore }];
  all.sort((a, b) => b.score - a.score);

  const playerRank = all.findIndex(p => p.id === 'player');

  if (animate && flagsLastPlayerRank !== -1 && playerRank < flagsLastPlayerRank) {
    let bubbleIndex = 0;
    for (let r = flagsLastPlayerRank; r >= playerRank + 1; r--) {
      const overtaken = all[r];
      if (overtaken && overtaken.id !== 'player') {
        const overtakenEl = flagsLbElements[`flags-lb-${overtaken.id}`];
        if (overtakenEl && typeof spawnEmoteBubble !== 'undefined') {
          setTimeout(() => spawnEmoteBubble(overtakenEl), 200 + bubbleIndex * 100);
          bubbleIndex++;
        }
      }
    }
  }
  flagsLastPlayerRank = playerRank;

  let windowStart = Math.max(0, playerRank - FLAGS_LB_PIN_ROW);
  let windowEnd   = Math.min(all.length, windowStart + FLAGS_LB_WINDOW);
  windowStart     = Math.max(0, windowEnd - FLAGS_LB_WINDOW);

  if (!animate) Object.values(flagsLbElements).forEach(el => { el.style.transition = 'none'; });

  all.forEach((p, rank) => {
    const el = flagsLbElements[`flags-lb-${p.id}`];
    if (el) el.style.top = ((rank - windowStart) * rowH) + 'px';
  });

  const scoreEl = flagsLbElements['flags-lb-player']?.querySelector('.lb-score');
  if (scoreEl) scoreEl.textContent = playerScore.toLocaleString();
}

function sortFlagsLeaderboard(playerScore) {
  if (playerScore === flagsLastLbScore) return;
  flagsLastLbScore = playerScore;
  flagsPositionLeaderboard(playerScore, true);
}

const flagsProgressContainer = document.getElementById('flags-progress-dots');
const flagsProgressDots      = flagsProgressContainer ? flagsProgressContainer.querySelectorAll('.dot') : [];
const FLAGS_DOTS_NEEDED = 10;
const FLAGS_BONUS_TIME  = 5;
let flagsDots = 0;

function flagsUpdateDotsUI() {
  flagsProgressDots.forEach((d, i) => d.classList.toggle('filled', i < flagsDots));
}

function flagsAdvanceDot() {
  flagsDots++;
  flagsUpdateDotsUI();

  if (flagsDots >= FLAGS_DOTS_NEEDED && !flagsProgressContainer.classList.contains('train-animation')) {
    flagsProgressContainer.classList.add('train-animation');

    flagsTimeLeft = Math.min(flagsTimeLeft + FLAGS_BONUS_TIME, 99);
    flagsTimerEl.textContent = flagsTimeLeft;
    if (typeof playTimeBonus === 'function') playTimeBonus(document.getElementById('flags-time-bonus'), FLAGS_BONUS_TIME);
    const prevColor = flagsTimerEl.style.color;
    flagsTimerEl.style.color = '#00ff88';

    setTimeout(() => {
      flagsProgressContainer.classList.add('dots-fade-out');
      setTimeout(() => {
        flagsDots = Math.max(0, flagsDots - FLAGS_DOTS_NEEDED);
        flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
        flagsUpdateDotsUI();
        if (flagsTimeLeft <= 10) {
          flagsTimerEl.style.color = '#ffffff';
          flagsTimerImg.src = 'images/countdownred2.png';
        } else {
          flagsTimerEl.style.color = prevColor;
          flagsTimerImg.src = 'images/countdown2.png';
        }
      }, 500);
    }, 2000);
  }
}

function flagsAnimateScore() {
  if (flagsScoreRafId) return;
  let last = null;
  function tick(ts) {
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    const diff = flagsScore - flagsDisplayedScore;
    if (diff <= 0) { flagsScoreRafId = null; return; }
    flagsDisplayedScore = Math.min(flagsScore, flagsDisplayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    flagsScoreEl.textContent = (flagsDisplayedScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
    flagsScoreRafId = requestAnimationFrame(tick);
  }
  flagsScoreRafId = requestAnimationFrame(tick);
}

function getFlagsRoundPoints(streak) {
  if (streak >= 15) return 120;
  if (streak >= 10) return 60;
  if (streak >= 5)  return 35;
  if (streak >= 2)  return 15;
  return 10;
}

function showFlagsBadge(badgeImg, bonus, streak, cxOverride, scaleOverride) {
  const canvas = document.getElementById('flags-badge-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  const ctx2 = canvas.getContext('2d');
  const CX = cxOverride !== undefined ? cxOverride : canvas.width / 2, CY = (scaleOverride !== undefined ? canvas.height * 0.44 : canvas.height / 2);
  // Medidas en vmin (px = valor_vmin * vmin) para que escale con el viewport.
  const vmin = Math.min(window.innerWidth, window.innerHeight) / 100;
  const W = 44.5 * vmin, H = 36.6 * vmin, CW = 52.4 * vmin, CH = 44.5 * vmin;
  const IN_END = 0.2, HOLD_END = 0.60, SHRINK_DUR = 0.22, TOTAL = HOLD_END + SHRINK_DUR;
  const BZ_IN = 0.18, BZ_HOLD = 0.42, BZ_OUT = 0.72;
  const strokeColor = typeof getBadgeStrokeColor !== 'undefined' ? getBadgeStrokeColor(streak) : '#623103';
  const bonusLabel = bonus > 0 ? `+${bonus}` : '';
  let t = 0, last = null, rafId;

  setTimeout(() => { if (typeof sfxBonus !== 'undefined') { sfxBonus.currentTime = 0; sfxBonus.play(); } }, 800);

  function frame(ts) {
    if (!last) last = ts;
    t += (ts - last) / 1000;
    last = ts;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    if (t >= TOTAL) { canvas.style.display = 'none'; return; }

    const sxMult = scaleOverride !== undefined ? scaleOverride : 1;
    let alpha, scale;
    if      (t < IN_END)   { scale = (0.25 + (t / IN_END) * 0.75) * sxMult; alpha = 1; }
    else if (t < HOLD_END) { scale = 1 * sxMult; alpha = 1; }
    else                   { const p = (t - HOLD_END) / SHRINK_DUR; scale = (1 - p) * sxMult; alpha = 1; }

    // El check ya lo muestra flags-check-overlay en cada respuesta; aquí solo
    // dibujamos el badge + "IN A ROW" + bonus para no duplicar el check.

    // +bonus
    let bonusScale = 0;
    if      (t < BZ_IN)   bonusScale = t / BZ_IN;
    else if (t < BZ_HOLD) bonusScale = 1;
    else if (t < BZ_OUT)  bonusScale = 1 - (t - BZ_HOLD) / (BZ_OUT - BZ_HOLD);
    if (bonusScale > 0 && bonusLabel) {
      const bCY = CY + CH / 2 + 2.2 * vmin;
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.translate(CX, bCY);
      ctx2.scale(bonusScale, bonusScale);
      ctx2.font = `${11.4 * vmin}px Dimbo, "Arial Black", sans-serif`;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.strokeStyle = '#073A79'; ctx2.lineWidth = 1.54 * vmin;
      ctx2.strokeText(bonusLabel, 0, 0);
      ctx2.strokeStyle = '#FD9C1A'; ctx2.lineWidth = 0.77 * vmin;
      ctx2.strokeText(bonusLabel, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillText(bonusLabel, 0, 0);
      ctx2.restore();
    }

    // badge + IN A ROW
    if (badgeImg) {
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.translate(CX + 3.3 * vmin, CY - 3.3 * vmin);
      ctx2.scale(scale, scale);
      ctx2.drawImage(badgeImg, -W / 2, -H / 2, W, H);
      ctx2.font = `bold ${7.4 * vmin}px Fredoka, sans-serif`;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.scale(1, 1.2);
      ctx2.strokeStyle = strokeColor; ctx2.lineWidth = 1.21 * vmin;
      ctx2.strokeText(`${streak} IN A ROW`, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillText(`${streak} IN A ROW`, 0, 0);
      ctx2.restore();
    }

    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

function startFlagsRoundRecording() {
  const REC_SLOTS = ['Reino Unido', 'Brasil', 'Italia'];

  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.classList.add('scrolling');

  flagsFlagidLabel.textContent         = 'Italy';
  flagsFlagidLabel.style.fontSize      = '4.2vmin';
  flagsFlagidLabel.style.letterSpacing = '';

  flagsTopGroupIds.forEach((id, i) => {
    const group = document.getElementById(id);
    if (!group) return;
    group.style.display       = '';
    group.style.opacity       = '';
    group.style.pointerEvents = 'auto';
    group.style.cursor        = 'pointer';
    group.classList.remove('luggage-enter-active');
    void group.offsetWidth;
    group.classList.add('luggage-enter-active');

    const imgId = flagsSlotImgIds[id];
    const img   = document.getElementById(imgId);
    if (img) { img.src = COUNTRY_FLAGS[REC_SLOTS[i]] || ''; img.style.display = 'block'; }
  });

  let picked = false;
  flagsTopGroupIds.forEach(id => {
    const group = document.getElementById(id);
    if (!group) return;
    group.onclick = () => {
      if (!flagsRunning || picked) return;
      picked = true;
      // Disable further clicks
      flagsTopGroupIds.forEach(gid => {
        const g = document.getElementById(gid);
        if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
      });
      // Igual que el juego real: freeze inmediato + translate hacia findluggage
      group.classList.remove('luggage-enter-active');
      group.style.animation = 'none';
      void group.offsetWidth;
      // Ver handler real: centrar el maletín sobre findluggage (medir la imagen real).
      const lugImg    = group.querySelector('#flags-luggage, .flags-luggage-side');
      const groupRect = (lugImg || group).getBoundingClientRect();
      const findRect  = flagsFindLuggage.getBoundingClientRect();
      const lugScale  = flagsLuggageWrap.getBoundingClientRect().width / 220;
      const dx = ((findRect.left + findRect.width  / 2) - (groupRect.left + groupRect.width  / 2)) / lugScale;
      const dy = ((findRect.top  + findRect.height / 2) - (groupRect.top  + groupRect.height / 2)) / lugScale;
      group.style.willChange = 'transform';                 // capa GPU (suaviza iOS)
      group.style.transition = 'transform 0.1s linear';
      group.style.transform  = `translate3d(${dx}px, ${dy}px, 0)`;
      flagsMachine2.style.animationPlayState     = 'paused';
      flagsMachine3.style.animationPlayState     = 'paused';
      flagsMachine3b.style.animationPlayState    = 'paused';
      flagsFindLuggage.style.animationPlayState  = 'paused';
    };
  });
}

function startFlagsRound() {
  if (document.body.classList.contains('recording-mode')) {
    return startFlagsRoundRecording();
  }
  // Reset findluggage to initial position and restart scroll animation
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.classList.add('scrolling');

  // Si la animación termina sin que se haya seleccionado nada → wrong
  const onFindLuggageEnd = () => {
    flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
    clearFlagsElimination();
    if (!flagsRunning) return;
    // Simular wrong: misma lógica que click incorrecto
    flagsGroupIds.forEach(gid => {
      const g = document.getElementById(gid);
      if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
    });
    flagsStreak = 0;
    flagsIsFirstRound = false;
    flagsWrongCount++;
    if (typeof sfxError !== 'undefined') { sfxError.currentTime = 0; sfxError.play(); }
    const overlay = document.getElementById('flags-wrong-overlay');
    if (overlay) {
      overlay.style.display = '';
      overlay.classList.remove('animate');
      void overlay.offsetWidth;
      overlay.classList.add('animate');
      setTimeout(() => {
        overlay.classList.remove('animate');
        overlay.style.display = 'none';
        if (!flagsRunning) return;
        const allGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
        allGroupIds.forEach(gid => {
          const g = document.getElementById(gid);
          if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.opacity = '0'; g.style.willChange = ''; }
        });
        setTimeout(() => {
          if (!flagsRunning) return;
          if (document.body.classList.contains('recording-mode')) return;
          allGroupIds.forEach(gid => {
            const g = document.getElementById(gid);
            if (g) g.style.opacity = '';
          });
          if (!flagsSixUnlocked) {
            flagsBottomGroupIds.forEach(id => {
              const g = document.getElementById(id);
              if (g) g.style.display = 'none';
            });
          }
          startFlagsRound();
        }, 50);
      }, 750);
    }
  };
  flagsFindLuggage.addEventListener('animationend', onFindLuggageEnd);

  const inicioCountries  = (COUNTRIES.inicio  || []).filter(c => COUNTRY_FLAGS[c]);
  const easyCountries    = (COUNTRIES.easy    || []).filter(c => COUNTRY_FLAGS[c]);
  const mediumCountries  = (COUNTRIES.medium  || []).filter(c => COUNTRY_FLAGS[c]);
  const hardCountries    = (COUNTRIES.hard    || []).filter(c => COUNTRY_FLAGS[c]);
  const insaneCountries  = (COUNTRIES.insane  || []).filter(c => COUNTRY_FLAGS[c]);

  const easyInitPool = [...inicioCountries, ...easyCountries];
  const fullPool = flagsIsFirstRound
    ? inicioCountries
    : flagsInsaneUnlocked
      ? [...easyInitPool, ...mediumCountries, ...hardCountries, ...insaneCountries]
      : flagsHardUnlocked
        ? [...easyInitPool, ...mediumCountries, ...hardCountries]
        : flagsMediumUnlocked
          ? [...easyInitPool, ...mediumCountries]
          : flagsEasyUnlocked
            ? easyInitPool
            : inicioCountries;

  const excluded = c => flagsAnswered.has(c) || c === flagsLastChosen;

  function weightedPick(partsA, poolA, partsB, poolB) {
    const avA = poolA.filter(c => !excluded(c));
    const avB = poolB.filter(c => !excluded(c));
    let wp = [...Array(partsA).fill(avA).flat(), ...Array(partsB).fill(avB).flat()];
    if (!wp.length) {
      flagsAnswered.clear();
      const rA = poolA.filter(c => c !== flagsLastChosen);
      const rB = poolB.filter(c => c !== flagsLastChosen);
      wp = [...Array(partsA).fill(rA).flat(), ...Array(partsB).fill(rB).flat()];
    }
    if (!wp.length) wp = fullPool;
    return wp[Math.floor(Math.random() * wp.length)];
  }

  let chosen;
  if (flagsInsaneUnlocked) {
    // insane vs hard+lower — 1:5 at 30 → 5:1 at 50
    const insaneParts = Math.min(Math.floor((flagsCorrectCount - 30) / 5) + 1, 5);
    const lowerParts  = Math.max(6 - insaneParts, 1);
    const lowerPool   = [...easyInitPool, ...mediumCountries, ...hardCountries];
    chosen = weightedPick(insaneParts, insaneCountries, lowerParts, lowerPool);
  } else if (flagsHardUnlocked) {
    // hard vs medium+easy+inicio — 1:5 at 17 → 5:1 at 37
    const hardParts  = Math.min(Math.floor((flagsCorrectCount - 17) / 5) + 1, 5);
    const lowerParts = Math.max(6 - hardParts, 1);
    const lowerPool  = [...easyInitPool, ...mediumCountries];
    chosen = weightedPick(hardParts, hardCountries, lowerParts, lowerPool);
  } else if (flagsMediumUnlocked) {
    // medium vs easy+inicio
    // 1:5 at 3 correct → 5:1 at 15 correct
    const mediumParts = Math.min(Math.floor((flagsCorrectCount - 8) / 3) + 1, 5);
    const easyParts   = Math.max(6 - mediumParts, 1);
    chosen = weightedPick(mediumParts, mediumCountries, easyParts, easyInitPool);
  } else {
    let chosenPool = fullPool.filter(c => !excluded(c));
    if (!chosenPool.length) { flagsAnswered.clear(); chosenPool = fullPool.filter(c => c !== flagsLastChosen); }
    if (!chosenPool.length) chosenPool = fullPool;
    chosen = chosenPool[Math.floor(Math.random() * chosenPool.length)];
  }
  flagsLastChosen = chosen;
  flagsFlagidLabel.textContent = chosen;
  // Ajustar tamaño si el nombre es largo. Todo en vmin para escalar con el
  // viewport igual que la imagen de flagid (49.4vmin); maxW = 41.7vmin en px.
  const vminPx = Math.min(window.innerWidth, window.innerHeight) / 100;
  const maxW = 41.7 * vminPx;
  let fs = 4.2;
  flagsFlagidLabel.style.fontSize = fs + 'vmin';
  flagsFlagidLabel.style.letterSpacing = '';
  while (flagsFlagidLabel.scrollWidth > maxW && fs > 1.8) {
    fs -= 0.22;
    flagsFlagidLabel.style.fontSize = fs + 'vmin';
    if (fs < 3.3) flagsFlagidLabel.style.letterSpacing = '-1px';
    if (fs < 2.4) flagsFlagidLabel.style.letterSpacing = '-2px';
  }

  // Distractors: prefer visually similar flags from correcta 23 onward
  const useSimilar = flagsCorrectCount >= 35 && FLAG_SIMILAR[chosen];
  const similarAvailable = useSimilar
    ? [...(FLAG_SIMILAR[chosen] || [])].filter(c => COUNTRY_FLAGS[c] && c !== chosen)
    : [];
  const nonsimilar = fullPool.filter(c => c !== chosen && !similarAvailable.includes(c)).sort(() => Math.random() - 0.5);
  similarAvailable.sort(() => Math.random() - 0.5);
  // Fill distractors with similars first, then pad with random
  const distractorPool = [...similarAvailable, ...nonsimilar];

  const slotCount = flagsGroupIds.length;
  const correctSlot = Math.floor(Math.random() * slotCount);

  // Apply six-mode layout before animations so positions are correct when luggages drop
  if (flagsSixUnlocked) flagsLuggageWrap.classList.add('flags-six-mode');

  // Show/animate top groups; show bottom groups if medium unlocked
  flagsTopGroupIds.forEach(id => {
    const group = document.getElementById(id);
    if (!group) return;
    group.style.display = '';
    group.style.pointerEvents = 'auto';
    group.style.cursor = 'pointer';
    group.classList.remove('flags-faded');
    group.classList.remove('luggage-enter-active');
    void group.offsetWidth;
    group.classList.add('luggage-enter-active');
  });

  if (flagsSixUnlocked) {
    flagsBottomGroupIds.forEach(id => {
      const group = document.getElementById(id);
      if (!group) return;
      group.style.display = '';
      group.style.pointerEvents = 'auto';
      group.style.cursor = 'pointer';
      group.classList.remove('flags-faded');
      group.classList.remove('luggage-enter-active');
      void group.offsetWidth;
      group.classList.add('luggage-enter-active');
    });
  }

  // Assign flags to slots
  flagsGroupIds.forEach((id, i) => {
    const imgId = flagsSlotImgIds[id];
    const img = document.getElementById(imgId);
    if (!img) return;
    let country;
    if (i === correctSlot) {
      country = chosen;
    } else {
      const distIdx = i < correctSlot ? i : i - 1;
      country = distractorPool[distIdx] || '';
    }
    img.src = COUNTRY_FLAGS[country] || '';
    img.style.display = 'block';
  });

  flagsRoundStartTime = performance.now() + 200; // empieza a contar tras la animación de entrada

  let flagsPicked = false;

  // ── Eliminación progresiva de opciones erróneas ───────────────────────────────
  // 6 opciones: cada 1/3 del tiempo se desvanecen 2 erróneas (0.3s) y quedan
  //             deseleccionables, hasta dejar solo 2 (correcta + 1 errónea).
  // 3 opciones: a la 1/2 del tiempo se desvanece 1 errónea, dejando 2.
  clearFlagsElimination();
  const wrongSlots = [];
  for (let s = 0; s < slotCount; s++) if (s !== correctSlot) wrongSlots.push(s);
  wrongSlots.sort(() => Math.random() - 0.5);
  const fadeSlot = (slotIdx) => {
    const g = document.getElementById(flagsGroupIds[slotIdx]);
    if (g) { g.classList.add('flags-faded'); g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
  };
  const roundMs = FLAGS_ROUND_TIME * 1000;
  if (slotCount >= 6) {
    [1, 2].forEach(step => {
      const slice = wrongSlots.slice((step - 1) * 2, step * 2);
      flagsEliminationTimeouts.push(setTimeout(() => {
        if (!flagsRunning || flagsPicked) return;
        slice.forEach(fadeSlot);
      }, roundMs * step / 3));
    });
  } else if (slotCount === 3) {
    flagsEliminationTimeouts.push(setTimeout(() => {
      if (!flagsRunning || flagsPicked) return;
      fadeSlot(wrongSlots[0]);
    }, roundMs / 2));
  }

  flagsGroupIds.forEach((id, i) => {
    const group = document.getElementById(id);
    if (!group) return;
    group.onclick = () => {
      // Ignorar opciones ya desvanecidas: aunque el grupo tenga pointer-events:none,
      // un hijo con pointer-events:auto deja que el click burbujee hasta acá.
      if (!flagsRunning || flagsPicked || group.classList.contains('flags-faded')) return;
      flagsPicked = true;
      clearFlagsElimination();
      flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
      // Animate selected luggage toward findluggage position
      group.classList.remove('luggage-enter-active');
      group.style.animation  = 'none';
      void group.offsetWidth; // reflow — group is now at natural CSS position
      // El <div> del grupo tiene tamaño 0 (sus maletines son position:absolute),
      // así que medimos la IMAGEN del maletín (tamaño real) y centramos su centro
      // sobre el centro de findluggage. Funciona igual en PC e iOS.
      const lugImg    = group.querySelector('#flags-luggage, .flags-luggage-side');
      const groupRect = (lugImg || group).getBoundingClientRect();
      const findRect  = flagsFindLuggage.getBoundingClientRect();
      const lugScale  = flagsLuggageWrap.getBoundingClientRect().width / 220;
      // Centrar el maletín sobre findluggage (medimos la imagen real del maletín
      // porque el <div> del grupo mide 0). Correcto en PC y muy cercano en iOS.
      const dx = ((findRect.left + findRect.width  / 2) - (groupRect.left + groupRect.width  / 2)) / lugScale;
      const dy = ((findRect.top  + findRect.height / 2) - (groupRect.top  + groupRect.height / 2)) / lugScale;
      group.style.willChange = 'transform';                 // capa GPU (suaviza iOS)
      group.style.transition = 'transform 0.1s linear';
      group.style.transform  = `translate3d(${dx}px, ${dy}px, 0)`;
      flagsMachine2.style.animationPlayState = 'paused';
      flagsMachine3.style.animationPlayState = 'paused';
      flagsMachine3b.style.animationPlayState = 'paused';
      flagsFindLuggage.style.animationPlayState = 'paused';
      setTimeout(() => {
        if (document.body.classList.contains('recording-mode')) return;
        flagsMachine2.style.animationPlayState = 'running';
        flagsMachine3.style.animationPlayState = 'running';
        flagsMachine3b.style.animationPlayState = 'running';
        // Freeze findluggage at its current paused position then whoosh -900px
        const mat = new DOMMatrix(window.getComputedStyle(flagsFindLuggage).transform);
        flagsFindLuggage.classList.remove('scrolling');
        flagsFindLuggage.style.transform = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e},${mat.f})`;
        void flagsFindLuggage.offsetWidth;
        flagsFindLuggage.style.transition = 'transform 0.15s linear';
        flagsFindLuggage.style.transform  = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e - 1000},${mat.f})`;
        // Whoosh selected group -1000px from findluggage position
        if (!document.body.classList.contains('recording-mode')) {
          group.style.transition = 'transform 0.15s linear';
          group.style.transform  = `translate3d(${dx - 1000 / lugScale}px, ${dy}px, 0)`;
        }
      }, 600);
      flagsGroupIds.forEach(gid => {
        const g = document.getElementById(gid);
        if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
      });
      const correct = i === correctSlot;
      if (correct) {
        flagsStreak++;
        flagsCorrectCount++;
        flagsAnswered.add(chosen);
        flagsEasyUnlocked = true;
        flagsIsFirstRound = false;
        if (flagsCorrectCount >= 3 && !flagsSixUnlocked) {
          flagsSixUnlocked = true;
          flagsGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
        }
        if (flagsCorrectCount >= 8 && !flagsMediumUnlocked) {
          flagsMediumUnlocked = true;
        }
        if (flagsCorrectCount >= 17) flagsHardUnlocked = true;
        if (flagsCorrectCount >= 30) flagsInsaneUnlocked = true;
        flagsAdvanceDot();
        if (typeof sfxCheck   !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.play(); }
        if (typeof sfxAcertar !== 'undefined') { sfxAcertar.currentTime = 0; sfxAcertar.play(); }
        const badgeImg   = typeof getBadgeImg    !== 'undefined' ? getBadgeImg(flagsStreak)   : null;
        const inRowBonus = typeof getInRowBonus  !== 'undefined' ? getInRowBonus(flagsStreak) : 0;
        const pts = getFlagsRoundPoints(flagsCorrectCount);
        const elapsed = Math.max(0, (performance.now() - flagsRoundStartTime) / 1000);
        const GRACE = 0.8;
        const ratio = elapsed <= GRACE ? 1 : Math.max(0, 1 - (elapsed - GRACE) / (FLAGS_SPEED_WIN - GRACE));
        const speedBonus = ratio > 0 ? Math.round(pts * (FLAGS_SPEED_MULT - 1) * ratio) : 0;
        flagsScore += pts + speedBonus + inRowBonus;
        flagsAnimateScore();
        sortFlagsLeaderboard(flagsScore);
        if (typeof showScorePopup !== 'undefined') showScorePopup(pts + speedBonus);
        if (speedBonus > 0) {
          clearTimeout(flagsSpeedBonusHideId);
          flagsSpeedBonusText.classList.remove('visible');
          void flagsSpeedBonusText.offsetWidth;
          flagsSpeedBonusText.classList.add('visible');
          flagsSpeedBonusHideId = setTimeout(() => flagsSpeedBonusText.classList.remove('visible'), 1600);
        }
        if (badgeImg) showFlagsBadge(badgeImg, inRowBonus, flagsStreak);
      } else {
        flagsStreak = 0;
        flagsIsFirstRound = false;
        flagsWrongCount++;
        if (typeof sfxError !== 'undefined') { sfxError.currentTime = 0; sfxError.play(); }
      }
      const overlay = document.getElementById(correct ? 'flags-check-overlay' : 'flags-wrong-overlay');
      if (overlay) {
        overlay.style.display = '';
        overlay.classList.remove('animate');
        void overlay.offsetWidth;
        overlay.classList.add('animate');
        setTimeout(() => {
          overlay.classList.remove('animate');
          overlay.style.display = 'none';
          if (!flagsRunning) return;
          // Hide all current groups
          const allGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
          if (!document.body.classList.contains('recording-mode')) {
            allGroupIds.forEach(gid => {
              const g = document.getElementById(gid);
              if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.opacity = '0'; g.style.willChange = ''; }
            });
          }
          setTimeout(() => {
            if (!flagsRunning) return;
            if (document.body.classList.contains('recording-mode')) return;
            allGroupIds.forEach(gid => {
              const g = document.getElementById(gid);
              if (g) g.style.opacity = '';
            });
            // Hide bottom row if not yet unlocked
            if (!flagsSixUnlocked) {
              flagsBottomGroupIds.forEach(id => {
                const g = document.getElementById(id);
                if (g) g.style.display = 'none';
              });
            }
            startFlagsRound();
          }, 50);
        }, 750);
      }
    };
  });
}

function hideFlagsMode() {
  flagsWrapper.style.display      = 'none';
  flagsScoreDisplay.style.display = 'none';
  document.getElementById('flags-countdown-widget').style.display = 'none';
  flagsRightPanel.style.display   = 'none';
  mainRightPanel.style.display    = 'none';
  flagsTimeupEl.style.display     = 'none';
  flagsMachine.style.display      = 'none';
  flagsMachine2.style.display     = 'none';
  flagsMachine3.style.display     = 'none';
  flagsMachine3b.style.display    = 'none';
  flagsFindLuggage.style.display  = 'none';
  flagsFindLuggage.classList.remove('scrolling');
  flagsLuggageWrap.style.display  = 'none';
  flagsFlagImg.style.display      = 'none';
  flagsFlagImg.src                = '';
  flagsFlagidWrap.style.display   = 'none';
  flagsMachine3.classList.remove('scrolling');
  flagsMachine3b.classList.remove('scrolling');
  flagsLuggageWrap.classList.remove('flags-six-mode');
  flagsBottomGroupIds.forEach(id => {
    const g = document.getElementById(id);
    if (g) g.style.display = 'none';
  });
  if (flagsScoreRafId) { cancelAnimationFrame(flagsScoreRafId); flagsScoreRafId = null; }
  clearTimeout(flagsSpeedBonusHideId);
  flagsSpeedBonusText.classList.remove('visible');
  clearInterval(flagsTimerIntervalId);
  flagsRunning = false;
  clearFlagsElimination();

  const finalScore = Math.round(flagsScore);
  window.lastModeScore = finalScore;
  const base = (typeof window.campaignBase === 'function') ? window.campaignBase() : 0;
  const finalScoreEl = document.getElementById('final-score-value');
  if (finalScoreEl) finalScoreEl.textContent = (finalScore + base).toLocaleString();

  const LS_HIGHSCORE = 'flagsHighscore';
  const prevHighscore = parseInt(localStorage.getItem(LS_HIGHSCORE) || '0', 10);
  const newHSBanner = document.getElementById('new-highscore-banner');
  const newHSScore  = document.getElementById('new-highscore-score');
  if (finalScore > prevHighscore) {
    localStorage.setItem(LS_HIGHSCORE, String(finalScore));
    if (newHSBanner) newHSBanner.style.display = 'flex';
    if (newHSScore)  newHSScore.textContent = finalScore.toLocaleString();
  } else {
    if (newHSBanner) newHSBanner.style.display = 'none';
  }

  if (typeof setModeCounts !== 'undefined') setModeCounts(flagsCorrectCount, flagsWrongCount);
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) {
    gameoverScreen.style.display = 'flex';
    const label = gameoverScreen.querySelector('.gameover-text1-label');
    if (label) label.textContent = '¡Buen trabajo! ¡Llevemos a los turistas a la puerta de embarque!';
  }
  if (typeof restartFlightAtt !== 'undefined') restartFlightAtt();
  if (typeof buildChecksRow !== 'undefined') buildChecksRow();
  const checksEndTime = (flagsCorrectCount > 0 ? (flagsCorrectCount - 1) * 0.1 + 0.2 : 0) + 0.4;
  if (typeof buildWrongsRow !== 'undefined') buildWrongsRow(checksEndTime);
  if (typeof playMusic !== 'undefined') playMusic(sfxPostgame);
}

// ── PREGAME COUNTDOWN ─────────────────────────────────────────────────────────
let flagsPregameTimeout = null;
let flagsAborted = false;

function runFlagsPregame(onDone) {
  flagsAborted = false;
  flagsPregameEl.style.display = 'flex';
  if (typeof sfxCountdown !== 'undefined') { sfxCountdown.currentTime = 0; sfxCountdown.play(); }
  let step = 0;

  function showStep() {
    if (flagsAborted) return; // se abandonó la partida durante el 3-2-1
    if (step >= FLAGS_PREGAME_STEPS.length) {
      flagsPregameEl.style.display = 'none';
      onDone();
      return;
    }
    const { src, hold, size } = FLAGS_PREGAME_STEPS[step++];
    flagsPregameImg.style.animation = 'none';
    flagsPregameImg.style.width     = size + 'vmin';
    flagsPregameImg.style.height    = size + 'vmin';
    flagsPregameImg.src = src;
    void flagsPregameImg.offsetWidth;
    flagsPregameImg.style.animation = '';
    flagsPregameTimeout = setTimeout(showStep, hold);
  }

  showStep();
}

// Detiene y resetea TODO el modo banderas (sin scoring ni gameover). Lo usa quitToMenu.
function flagsHardReset() {
  flagsAborted = true;
  flagsRunning = false;
  flagsDots = 0;
  clearTimeout(flagsEndTimeout1); clearTimeout(flagsEndTimeout2);
  if (flagsProgressDots) flagsProgressDots.forEach(d => d.classList.remove('filled'));
  if (flagsProgressContainer) flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
  clearTimeout(flagsPregameTimeout); flagsPregameTimeout = null;
  clearInterval(flagsTimerIntervalId);
  if (flagsScoreRafId) { cancelAnimationFrame(flagsScoreRafId); flagsScoreRafId = null; }
  clearTimeout(flagsSpeedBonusHideId);
  try { clearFlagsElimination(); } catch (e) {}
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  // Ocultar/parar máquina, equipaje, banderas, overlays y countdown
  [flagsMachine, flagsMachine2, flagsMachine3, flagsMachine3b].forEach(m => {
    if (!m) return;
    m.style.display = 'none';
    m.style.animationPlayState = '';
    m.classList.remove('scrolling');
  });
  flagsFindLuggage.style.display = 'none';
  flagsFindLuggage.classList.remove('scrolling');
  flagsLuggageWrap.style.display = 'none';
  flagsLuggageWrap.classList.remove('flags-six-mode');
  flagsFlagImg.style.display = 'none'; flagsFlagImg.src = '';
  flagsFlagidWrap.style.display = 'none';
  flagsPregameEl.style.display = 'none';
  flagsTimeupEl.style.display = 'none';
  flagsSpeedBonusText.classList.remove('visible');
  ['flags-check-overlay','flags-wrong-overlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('animate'); el.style.display = 'none'; el.style.opacity = ''; }
  });
  flagsBottomGroupIds.forEach(id => { const g = document.getElementById(id); if (g) g.style.display = 'none'; });
}
window.gameStoppers = window.gameStoppers || [];
window.gameStoppers.push(flagsHardReset);

// ── TIMER ─────────────────────────────────────────────────────────────────────
function startFlagsTimer() {
  flagsTimeLeft = FLAGS_GAME_DURATION;
  flagsScore          = 0;
  flagsDisplayedScore = 0;
  flagsWrongCount     = 0;
  if (typeof setModeCounts !== 'undefined') setModeCounts(0, 0);
  flagsScoreEl.textContent = (((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
  flagsRunning  = true;

  flagsTimerIntervalId = setInterval(() => {
    flagsTimeLeft--;
    flagsTimerEl.textContent = flagsTimeLeft;

    if (flagsTimeLeft <= 10) {
      flagsTimerEl.style.color = '#ffffff';
      flagsTimerImg.src = 'images/countdownred2.png';
      if (flagsTimeLeft > 0 && typeof sfxTickdown !== 'undefined') { sfxTickdown.currentTime = 0; sfxTickdown.play(); }
    }
    if (flagsTimeLeft <= 0) {
      clearInterval(flagsTimerIntervalId);
      flagsRunning = false;
      clearFlagsElimination();
      flagsLuggageWrap.style.pointerEvents = 'none';
      flagsLuggageWrap.classList.add('flags-game-ended');
      if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxTimesUp.play(); }
      endFlagsGame();
    }
  }, 1000);
}

// ── GAME OVER ─────────────────────────────────────────────────────────────────
let flagsEndTimeout1 = null, flagsEndTimeout2 = null;
function endFlagsGame() {
  flagsAborted = false;
  flagsTimerImg.style.animationPlayState = 'paused';
  if (typeof playMusic !== 'undefined') playMusic(null);
  flagsTimeupEl.classList.remove('timeup-out');
  flagsTimeupEl.classList.add('timeup-in');
  flagsTimeupEl.style.display = 'flex';

  flagsEndTimeout1 = setTimeout(() => {
    if (flagsAborted) return;
    flagsTimeupEl.classList.remove('timeup-in');
    flagsTimeupEl.classList.add('timeup-out');
    flagsEndTimeout2 = setTimeout(() => { if (!flagsAborted) hideFlagsMode(); }, 400);
  }, 1800);
}

// ── BOTÓN DE INICIO ───────────────────────────────────────────────────────────
document.getElementById('loading-flags-btn').addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.play(); }
  window.pendingGameMode = 'flags';
  document.getElementById('splash-screen').classList.add('mode-flags');
  document.getElementById('splash-screen').classList.remove('mode-shapes', 'mode-monuments');
  document.getElementById('gameover-screen').classList.add('mode-flags');
  document.getElementById('gameover-screen').classList.remove('mode-shapes', 'mode-monuments');
  const howtoplayVideo = document.querySelector('.splash-howtoplay-video');
  if (howtoplayVideo) { howtoplayVideo.src = 'images/howtoplay/howtoplay1.mp4'; howtoplayVideo.load(); }
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men3.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men4.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl3.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl4.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women2.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women3.png');
  document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level1complete.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check1.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong1.png');
  const label = document.querySelector('.splash-text2-label');
  if (label) { label.textContent = '¡Eh, Tú! ¿Crees que podrías echarme una mano ordenando el equipaje de los turistas?'; label.classList.remove('step2'); }
  const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
  if (howtoWrap) howtoWrap.classList.remove('slide-down');
  const howtoTitle = document.querySelector('.splash-howtoplay-title');
  if (howtoTitle) howtoTitle.textContent = 'Suitcase Shuffle';
  document.getElementById('loading-screen').style.display = 'none';
  const splashEl = document.getElementById('splash-screen');
  splashEl.style.display = 'flex';
  const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
  void splashEl.offsetWidth;
  animEls.forEach(el => el.classList.add('animate-in'));
  if (typeof playMusic !== 'undefined') playMusic(sfxPostgame);
});

document.getElementById('loading-flags-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxSelect.play(); }
});


// Reposicionar la barra de amigos de banderas al hacer zoom/redimensionar
window.addEventListener('resize', () => {
  const rp = document.getElementById('flags-right-panel');
  if (!rp || getComputedStyle(rp).display === 'none') return;
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, false);
  requestAnimationFrame(() => {
    Object.values(flagsLbElements).forEach(el => { el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)'; });
  });
});
