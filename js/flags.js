// ── MODO BANDERAS ─────────────────────────────────────────────────────────────
document.addEventListener('contextmenu', e => {
  if (e.target.closest('#flags-luggage-wrap')) e.preventDefault();
});

['flags-luggage-group', 'flags-luggage-left-group', 'flags-luggage-right-group',
 'flags-luggage-bl-group', 'flags-luggage-bc-group', 'flags-luggage-br-group'].forEach(id => {
  document.getElementById(id)?.addEventListener('mouseenter', () => {
    if (!flagsRunning) return;
    if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
  });
});

const FLAGS_GAME_DURATION = window.GAME_DURATION;

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
function flagsLuggageScale() {
  return Math.min(window.STAGE_W, window.STAGE_H) / 911;
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
// Pre-decodifica todas las banderas en background al entrar al modo.
// 4 streams paralelos; no bloquea el main thread.
function prewarmFlagTextures() {
  const urls = Object.values(COUNTRY_FLAGS);
  let i = 0;
  function next() {
    if (i >= urls.length) return;
    const img = new Image();
    img.src = urls[i++];
    (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(next);
  }
  for (let k = 0; k < 4; k++) next();
}

function showFlagsMode() {
  prewarmFlagTextures();
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
  const anchoVentana = window.STAGE_W;
  const altoVentana  = window.STAGE_H;
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

  { const _pc = window.practiceConfig; const _inf = _pc && _pc.active && _pc.timer === 0; flagsTimerEl.textContent = _pc && _pc.active ? (_inf ? '∞' : _pc.timer) : FLAGS_GAME_DURATION; flagsTimerEl.classList.toggle('timer-number-infinity', !!_inf); }
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
    if (window._practiceStats) window._practiceStats.startTime = Date.now();
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
    if (_flagsSyncedVersus()) flagsVsIndex = 0;
    if (window.practiceConfig && window.practiceConfig.active) {
      // Reiniciar desbloqueos para que la primera ronda siempre empiece en inicio
      flagsEasyUnlocked = false; flagsMediumUnlocked = false;
      flagsHardUnlocked = false; flagsInsaneUnlocked = false;
      flagsCorrectCount = 0;
      flagsPracticePool = buildFlagsPracticePool(window.practiceConfig.continents, window.practiceConfig.difficulty);
      flagsPracticeRemaining = [...flagsPracticePool];
      flagsPracticeCurrent = flagsPracticePickNext(null);
    }
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
      g.style.transformOrigin = '';
      g.style.opacity    = '';
      g.style.willChange = '';
      g.classList.remove('flags-faded');
    });
    flagsBottomGroupIds.forEach(id => {
      const g = document.getElementById(id);
      if (g) g.style.display = 'none';
    });
    ['flags-check-overlay','flags-wrong-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('animate'); el.style.display = ''; el.style.opacity = ''; }
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

function disableAllLuggageGroups() {
  [...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
    const g = document.getElementById(id);
    if (g) {
      g.style.pointerEvents = 'none';
      g.style.cursor = 'default';
      g.classList.remove('luggage-enter-active');
      g.style.animation = 'none';
    }
  });
  flagsLuggageWrap.style.pointerEvents = 'none';
  flagsLuggageWrap.style.cursor = 'default';
}
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

// ── RNG SEMBRADO PARA VERSUS ──────────────────────────────────────────────────
// En versus, la selección de bandera/distractores/slots debe ser idéntica para
// ambos jugadores. Para eso usamos un RNG dedicado (solo lo consume la selección),
// independiente de cualquier otra llamada a Math.random (animaciones, emotes, etc.)
// que ocurriría en distinto orden en cada cliente y desincronizaría todo.
let flagsVsIndex = 0;          // índice de ronda compartido (mismo en ambos)
let _flagsSeededRand = null;   // generador determinista (null ⇒ usa Math.random)
function _flagsSyncedVersus() { return window._vsActive || window._lobbyActive; }
function flagsRand() { return (_flagsSyncedVersus() && _flagsSeededRand) ? _flagsSeededRand() : Math.random(); }
function flagsShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(flagsRand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
window.flagsSetSeed = function(seed) {
  let s = (seed >>> 0) || 1;
  _flagsSeededRand = function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  flagsVsIndex = 0;
};
window.flagsClearSeed = function() { _flagsSeededRand = null; flagsVsIndex = 0; };

let flagsPracticePool = [];
let flagsPracticeRemaining = [];
let flagsPracticeCurrent = null;

// Picks the next practice country using the same tier-unlock logic as normal mode,
// capped at practiceConfig.difficulty. Excludes `exc` (pass current when wrong, null when correct).
function flagsPracticePickNext(exc) {
  const diff = (window.practiceConfig && window.practiceConfig.difficulty) || 'dificil';
  const pool = exc ? flagsPracticeRemaining.filter(c => c !== exc) : flagsPracticeRemaining;
  const fallback = pool.length ? pool : flagsPracticeRemaining;
  const unlockedTiers = ['inicio'];
  if (flagsEasyUnlocked   && diff !== 'inicio')                          unlockedTiers.push('easy');
  if (flagsMediumUnlocked && (diff === 'medio' || diff === 'dificil'))   unlockedTiers.push('medium');
  if (flagsHardUnlocked   && diff === 'dificil')                         unlockedTiers.push('hard');
  if (flagsInsaneUnlocked && diff === 'dificil')                         unlockedTiers.push('insane');
  // Filter to unlocked tiers; if continent has no countries there, expand progressively
  const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];
  const tierSet = new Set(unlockedTiers.flatMap(t => COUNTRIES[t] || []));
  let tiered = fallback.filter(c => tierSet.has(c));
  if (!tiered.length) {
    for (const tier of ALL_TIERS) {
      if (unlockedTiers.includes(tier)) continue;
      (COUNTRIES[tier] || []).forEach(c => tierSet.add(c));
      tiered = fallback.filter(c => tierSet.has(c));
      if (tiered.length) break;
    }
  }
  const pick = tiered.length ? tiered : fallback;
  return pick[Math.floor(Math.random() * pick.length)] || null;
}

function buildFlagsPracticePool(continents, difficulty) {
  const sh = a => { for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; };
  const hasFlag = c => !!COUNTRY_FLAGS[c];
  const inCont  = c => !continents || continents.has(FLAG_COUNTRY_CONTINENT[c]);
  const ok      = c => hasFlag(c) && inCont(c);
  const diff = difficulty || 'dificil';
  const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];

  // Tiers allowed by difficulty ceiling (cumulative)
  const allowedTiers = ['inicio'];
  if (diff !== 'inicio') allowedTiers.push('easy');
  if (diff === 'medio' || diff === 'dificil') allowedTiers.push('medium');
  if (diff === 'dificil') { allowedTiers.push('hard'); allowedTiers.push('insane'); }

  const seen = new Set();
  const pool = [];
  const add = c => { if (!seen.has(c)) { seen.add(c); pool.push(c); } };

  // Step 1: add allowed tiers filtered by continent
  for (const tier of allowedTiers) (COUNTRIES[tier] || []).filter(ok).forEach(add);

  // Step 2: if pool is thin (<6), supplement from next harder tiers (still continent-filtered)
  if (pool.length < 6) {
    for (const tier of ALL_TIERS) {
      if (allowedTiers.includes(tier)) continue;
      (COUNTRIES[tier] || []).filter(ok).forEach(add);
      if (pool.length >= 6) break;
    }
  }

  // Step 3: final fallback — drop continent filter if still too few
  if (pool.length < 6) {
    for (const tier of ALL_TIERS) {
      (COUNTRIES[tier] || []).filter(hasFlag).forEach(add);
      if (pool.length >= 6) break;
    }
  }

  return sh(pool);
}

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
  // En modo lobby el leaderboard muestra a TODOS los rivales de la sala, en vivo.
  if (window._lobbyActive && Array.isArray(window._lobbyMembers)) {
    return window._lobbyMembers.map((m, i) => ({
      id: 'lob' + m.id,
      name: m.name,
      score: m.score || 0,
      avatar: m.avatar || '',
      color: FLAGS_LB_COLORS[i % FLAGS_LB_COLORS.length],
      initial: (m.name && m.name[0]) ? m.name[0].toUpperCase() : '?',
    }));
  }
  // En modo versus 1v1 el leaderboard compite SOLO contra el oponente, en vivo.
  if (window._vsActive && window._vsOpponent) {
    const o = window._vsOpponent;
    return [{
      id: 'vsopp',
      name: o.name,
      score: window._vsOppScore || 0,
      avatar: o.avatar || '',
      color: FLAGS_LB_COLORS[0],
      initial: (o.name && o.name[0]) ? o.name[0].toUpperCase() : '?',
    }];
  }
  const src = (typeof getFriends === 'function') ? getFriends() : [];
  return src.map((f, i) => ({
    id: `friend${i}`,
    name: f.name,
    score: f.score,
    avatar: f.avatar || '',
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
  // offsetWidth (no getBoundingClientRect): el rect viene escalado por el transform
  // del #app-stage y, al usarse como px de layout, se re-escalaría (entradas apretadas).
  return Math.round(panel.offsetWidth * 1.5) + FLAGS_LB_GAP;
}

function initFlagsLeaderboard() {
  const lb = document.getElementById('flags-leaderboard');
  lb.innerHTML = '';
  lb.classList.toggle('vs-active', _flagsSyncedVersus());
  flagsLbElements = {};
  flagsLastLbScore = -1;
  flagsLastPlayerRank = -1;
  flagsMockPlayers = buildFlagsFriendPlayers(); // refrescar con la lista real de amigos

  if (!window.practiceConfig || !window.practiceConfig.active) {
    flagsMockPlayers.forEach(p => {
      const el = document.createElement('div');
      el.className = 'lb-entry';
      el.id = `flags-lb-${p.id}`;
      el.innerHTML = `<span class="lb-rank rank-other"></span>`
        + (p.avatar
          ? `<div class="lb-avatar lb-avatar-img-wrap"><img class="lb-avatar-img" src="${p.avatar}" onerror="this.parentNode.innerHTML='${p.initial}';this.parentNode.style.background='${p.color}'"></div>`
          : `<div class="lb-avatar" style="background:${p.color}">${p.initial}</div>`)
        + `<span class="lb-score">${p.score.toLocaleString()}</span>`;
      el.style.transition = 'none';
      el.style.top = '-9999px';
      flagsLbElements[el.id] = el;
      lb.appendChild(el);
    });
  }

  const playerEl = document.createElement('div');
  playerEl.className = 'lb-entry lb-player';
  playerEl.id = 'flags-lb-player';
  playerEl.innerHTML = `<span class="lb-rank rank-other"></span>`
                     + `<div class="lb-avatar"><img class="lb-avatar-img" src="${localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png'}"></div>`
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
  onFriendsUpdate(() => { if (flagsRunning && !_flagsSyncedVersus()) initFlagsLeaderboard(); });
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

  // Emote automático de adelantamiento solo en modo normal (no en versus/lobby)
  if (!_flagsSyncedVersus() && animate && flagsLastPlayerRank !== -1 && playerRank < flagsLastPlayerRank) {
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

  // Anclar las filas ABAJO: si hay menos filas que la ventana (p.ej. versus = 2),
  // empujarlas hacia el fondo en vez de dejarlas flotando arriba con hueco abajo.
  const visibleRows  = windowEnd - windowStart;
  const bottomOffset = Math.max(0, FLAGS_LB_WINDOW - visibleRows) * rowH;

  if (!animate) Object.values(flagsLbElements).forEach(el => { el.style.transition = 'none'; });

  all.forEach((p, rank) => {
    const el = flagsLbElements[`flags-lb-${p.id}`];
    if (el) el.style.top = ((rank - windowStart) * rowH + bottomOffset) + 'px';
  });

  // Actualizar número de posición en cada fila del leaderboard
  all.forEach((p, rank) => {
    const el = flagsLbElements[`flags-lb-${p.id}`];
    if (!el) return;
    const rankEl = el.querySelector('.lb-rank');
    if (!rankEl) return;
    rankEl.textContent = rank + 1;
    rankEl.className = 'lb-rank ' + (rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : 'rank-other');
  });

  const scoreEl = flagsLbElements['flags-lb-player']?.querySelector('.lb-score');
  if (scoreEl) scoreEl.textContent = playerScore.toLocaleString();
}

function sortFlagsLeaderboard(playerScore) {
  if (playerScore === flagsLastLbScore) return;
  flagsLastLbScore = playerScore;
  if (window.practiceConfig && window.practiceConfig.active) {
    const sc = playerScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0);
    const scoreEl = flagsLbElements['flags-lb-player']?.querySelector('.lb-score');
    if (scoreEl) scoreEl.textContent = sc.toLocaleString();
    return;
  }
  flagsPositionLeaderboard(playerScore, true);
}

// Versus: actualizar el score del oponente en el leaderboard y reordenar con animación
// (misma animación de adelantamiento/emotes que la barra de amigos normal).
function flagsSetVsOpponentScore(score) {
  window._vsOppScore = score;
  const opp = flagsMockPlayers.find(p => p.id === 'vsopp');
  if (!opp) return;
  opp.score = score;
  const el = flagsLbElements['flags-lb-vsopp'];
  if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = score.toLocaleString(); }
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, true);
}
window.flagsSetVsOpponentScore = flagsSetVsOpponentScore;

// Aplica glow + vibración + emote aleatorio a la tarjeta del jugador que falló.
// Ambas animaciones van en un solo style.animation inline; de lo contrario la cascada
// CSS deja correr solo la última, ignorando la otra.
function _applyWrongEffects(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // Emote aleatorio de los 6 disponibles
  const srcs = ['images/emotes/1.png','images/emotes/2.png','images/emotes/3.png',
                 'images/emotes/4.png','images/emotes/5.png','images/emotes/6.png'];
  const bubble = document.createElement('div');
  bubble.className = 'emote-bubble';
  const img = document.createElement('img');
  img.src = srcs[Math.floor(Math.random() * srcs.length)];
  img.className = 'emote-img';
  bubble.appendChild(img);
  el.appendChild(bubble);
  bubble.addEventListener('animationend', () => bubble.remove(), { once: true });
}

// Glow rojo solo en la tarjeta del rival (1v1).
window.flagsTriggerOpponentWrong = function() {
  _applyWrongEffects(flagsLbElements['flags-lb-vsopp']);
};

// Glow rojo en la tarjeta correcta para lobby: uid del que falló.
window.flagsTriggerLobbyWrongFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'flags-lb-player' : ('flags-lb-lob' + uid);
  _applyWrongEffects(flagsLbElements[key]);
};

// Lobby: refrescar el score en vivo de TODOS los rivales y reordenar con animación.
function flagsSetLobbyScores(members) {
  if (!Array.isArray(members)) return;
  members.forEach(m => {
    const p = flagsMockPlayers.find(x => x.id === 'lob' + m.id);
    if (p) {
      p.score = m.score || 0;
      const el = flagsLbElements['flags-lb-lob' + m.id];
      if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = (m.score || 0).toLocaleString(); }
    }
  });
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, true);
}
window.flagsSetLobbyScores = flagsSetLobbyScores;

function flagsSetLobbyDisconnected(uid, disconnected) {
  const el = flagsLbElements['flags-lb-lob' + uid];
  if (!el) return;
  if (disconnected) {
    el.classList.add('is-disconnected');
    if (!el.querySelector('.lb-disconnected-icon')) {
      const icon = document.createElement('div');
      icon.className = 'lb-disconnected-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 2.5 5.09 3.91l2.59 2.59-2.09 2.09A3.003 3.003 0 0 0 6 14.83V17H4v2h2v2h2v-2h2v-2h.17c.93 0 1.76-.37 2.37-.96l-.01-.01 2.06 2.06 1.41-1.41-9.5-9.5zm1.59 9.09A1.003 1.003 0 0 1 8 10.83V9.41l1.5 1.5-.41.68H8.09zm5.72 1.64-.01-.01c.13-.29.2-.61.2-.93V9.17c0-.93-.37-1.76-.96-2.37L11.66 5h2.59L19 9.75l-3.17 3.17.02.01zM19.07 4.93l-1.41 1.42L19 7.68l1.5-1.5-1.43-1.25z"/></svg>';
      el.appendChild(icon);
    }
  } else {
    el.classList.remove('is-disconnected');
    el.querySelector('.lb-disconnected-icon')?.remove();
  }
}
window.flagsSetLobbyDisconnected = flagsSetLobbyDisconnected;

window.flagsSetVsDisconnected = function(disconnected) {
  const el = flagsLbElements['flags-lb-vsopp'];
  if (!el) return;
  if (disconnected) {
    el.classList.add('is-disconnected');
    if (!el.querySelector('.lb-disconnected-icon')) {
      const icon = document.createElement('div');
      icon.className = 'lb-disconnected-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 2.5 5.09 3.91l2.59 2.59-2.09 2.09A3.003 3.003 0 0 0 6 14.83V17H4v2h2v2h2v-2h2v-2h.17c.93 0 1.76-.37 2.37-.96l-.01-.01 2.06 2.06 1.41-1.41-9.5-9.5zm1.59 9.09A1.003 1.003 0 0 1 8 10.83V9.41l1.5 1.5-.41.68H8.09zm5.72 1.64-.01-.01c.13-.29.2-.61.2-.93V9.17c0-.93-.37-1.76-.96-2.37L11.66 5h2.59L19 9.75l-3.17 3.17.02.01zM19.07 4.93l-1.41 1.42L19 7.68l1.5-1.5-1.43-1.25z"/></svg>';
      el.appendChild(icon);
    }
  } else {
    el.classList.remove('is-disconnected');
    el.querySelector('.lb-disconnected-icon')?.remove();
  }
};

const flagsProgressContainer = document.getElementById('flags-progress-dots');
const flagsProgressDots      = flagsProgressContainer ? flagsProgressContainer.querySelectorAll('.dot') : [];
const FLAGS_DOTS_NEEDED = 10;
const FLAGS_BONUS_TIME  = 5;
let flagsDots = 0;

function flagsUpdateDotsUI() {
  flagsProgressDots.forEach((d, i) => d.classList.toggle('filled', i < flagsDots));
}

function flagsAdvanceDot() {
  if (window.practiceConfig && window.practiceConfig.active) return;
  flagsDots++;
  flagsUpdateDotsUI();

  if (flagsDots >= FLAGS_DOTS_NEEDED && !flagsProgressContainer.classList.contains('train-animation')) {
    flagsProgressContainer.classList.add('train-animation');

    const _flagsInfNow = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    if (!_flagsInfNow) {
      flagsTimeLeft = Math.min(flagsTimeLeft + FLAGS_BONUS_TIME, 99);
      flagsTimerEl.textContent = flagsTimeLeft;
    }
    if (typeof playTimeBonus === 'function') playTimeBonus(document.getElementById('flags-time-bonus'), FLAGS_BONUS_TIME);
    const prevColor = flagsTimerEl.style.color;
    flagsTimerEl.style.color = '#00ff88';

    setTimeout(() => {
      flagsProgressContainer.classList.add('dots-fade-out');
      setTimeout(() => {
        flagsDots = Math.max(0, flagsDots - FLAGS_DOTS_NEEDED);
        flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
        flagsUpdateDotsUI();
        if (flagsTimeLeft > 0 && flagsTimeLeft <= 10) {
          flagsTimerEl.style.color = '#ffffff';
          flagsTimerImg.src = 'images/countdownred2.png';
        } else if (flagsTimeLeft > 10) {
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
  canvas.width  = window.STAGE_W;
  canvas.height = window.STAGE_H;
  canvas.style.display = 'block';
  const ctx2 = canvas.getContext('2d');
  const CX = cxOverride !== undefined ? cxOverride : canvas.width / 2, CY = (scaleOverride !== undefined ? canvas.height * 0.44 : canvas.height / 2);
  // Medidas en vmin (px = valor_vmin * vmin) para que escale con el viewport.
  const vmin = Math.min(window.STAGE_W, window.STAGE_H) / 100;
  const W = 44.5 * vmin, H = 36.6 * vmin, CW = 52.4 * vmin, CH = 44.5 * vmin;
  const IN_END = 0.2, HOLD_END = 0.60, SHRINK_DUR = 0.22, TOTAL = HOLD_END + SHRINK_DUR;
  const BZ_IN = 0.18, BZ_HOLD = 0.42, BZ_OUT = 0.72;
  const strokeColor = typeof getBadgeStrokeColor !== 'undefined' ? getBadgeStrokeColor(streak) : '#623103';
  const bonusLabel = bonus > 0 ? `+${bonus}` : '';
  let t = 0, last = null, rafId;

  setTimeout(() => { if (typeof sfxBonus !== 'undefined') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); } }, 800);

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
  flagsFlagidLabel.style.fontSize      = '4.2cqmin';
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
      group.style.transition = 'none';
      group.style.transform  = 'none';
      group.style.transformOrigin = '0 0';
      void group.offsetWidth;
      // Ver handler real: centrar el maletín sobre findluggage e igualar su tamaño.
      const lugImg    = group.querySelector('#flags-luggage, .flags-luggage-side');
      const lugRect   = (lugImg || group).getBoundingClientRect();
      const grpRect   = group.getBoundingClientRect();
      const findRect  = flagsFindLuggage.getBoundingClientRect();
      const lugScale  = flagsLuggageWrap.getBoundingClientRect().width / 220;
      const fit = lugRect.width ? (findRect.width / lugRect.width) : 1;
      const lugCx  = (lugRect.left + lugRect.width  / 2 - grpRect.left) / lugScale;
      const lugCy  = (lugRect.top  + lugRect.height / 2 - grpRect.top)  / lugScale;
      const findCx = (findRect.left + findRect.width  / 2 - grpRect.left) / lugScale;
      const findCy = (findRect.top  + findRect.height / 2 - grpRect.top)  / lugScale;
      const dx = findCx - fit * lugCx;
      const dy = findCy - fit * lugCy;
      group.style.willChange = 'transform';                 // capa GPU (suaviza iOS)
      group.style.transformOrigin = '0 0';
      group.style.transition = 'transform 0.1s linear';
      group.style.transform  = `translate3d(${dx}px, ${dy}px, 0) scale(${fit})`;
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
  // Versus: la dificultad/desbloqueos se rigen por el índice de ronda COMPARTIDO,
  // no por los aciertos individuales, así ambos jugadores ven la MISMA bandera en
  // la misma ronda aunque uno vaya ganando.
  if (_flagsSyncedVersus()) {
    flagsIsFirstRound   = flagsVsIndex === 0;
    flagsEasyUnlocked   = flagsVsIndex >= 1;
    flagsSixUnlocked    = flagsVsIndex >= 3;
    flagsMediumUnlocked = flagsVsIndex >= 8;
    flagsHardUnlocked   = flagsVsIndex >= 17;
    flagsInsaneUnlocked = flagsVsIndex >= 30;
    flagsGroupIds = flagsSixUnlocked
      ? [...flagsTopGroupIds, ...flagsBottomGroupIds]
      : flagsTopGroupIds.slice();
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
    flagsPicked = true; // bloquear clicks hasta la siguiente pregunta
    // Simular wrong: misma lógica que click incorrecto
    flagsGroupIds.forEach(gid => {
      const g = document.getElementById(gid);
      if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
    });
    flagsStreak = 0;
    flagsIsFirstRound = false;
    flagsWrongCount++;
    if (typeof sfxError !== 'undefined') { sfxError.currentTime = 0; sfxPlay(sfxError); }
    const overlay = document.getElementById('flags-wrong-overlay');
    if (overlay) {
      overlay.classList.remove('animate');
      void overlay.offsetWidth;
      overlay.classList.add('animate');
      setTimeout(() => {
        overlay.classList.remove('animate');
        if (!flagsRunning) return;
        const allGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
        allGroupIds.forEach(gid => {
          const g = document.getElementById(gid);
          if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.transformOrigin = ''; g.style.opacity = '0'; g.style.willChange = ''; }
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
          if (window.practiceConfig && window.practiceConfig.active && flagsPracticeRemaining.length > 1) {
            const others = flagsPracticeRemaining.filter(x => x !== flagsPracticeCurrent);
            flagsPracticeCurrent = others[Math.floor(Math.random() * others.length)];
          }
          startFlagsRound();
        }, 50);
      }, 750);
    }
  };
  flagsFindLuggage.addEventListener('animationend', onFindLuggageEnd);

  const _practiceContFilter = c => {
    if (!window.practiceConfig || !window.practiceConfig.active) return true;
    return window.practiceConfig.continents.has(FLAG_COUNTRY_CONTINENT[c]);
  };
  let inicioCountries  = (COUNTRIES.inicio  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  let easyCountries    = (COUNTRIES.easy    || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const mediumCountries  = (COUNTRIES.medium  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const hardCountries    = (COUNTRIES.hard    || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const insaneCountries  = (COUNTRIES.insane  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  // Fallback: si el continente tiene pocas banderas inicio, rellenar con easy sin filtro
  if (window.practiceConfig && window.practiceConfig.active && inicioCountries.length < 3) {
    const easyAll = (COUNTRIES.easy || []).filter(c => COUNTRY_FLAGS[c] && !inicioCountries.includes(c));
    inicioCountries = [...inicioCountries, ...easyAll].slice(0, Math.max(inicioCountries.length + easyAll.length, 6));
  }
  if (window.practiceConfig && window.practiceConfig.active && easyCountries.length < 3) {
    const easyAll = (COUNTRIES.easy || []).filter(c => COUNTRY_FLAGS[c] && !easyCountries.includes(c));
    easyCountries = [...easyCountries, ...easyAll];
  }

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
    return wp[Math.floor(flagsRand() * wp.length)];
  }

  // En versus/lobby la curva de dificultad la marca el índice de ronda compartido.
  const selCount = _flagsSyncedVersus() ? flagsVsIndex : flagsCorrectCount;

  let chosen;
  if (window.practiceConfig && window.practiceConfig.active) {
    if (!flagsPracticeCurrent || flagsPracticeRemaining.length === 0) {
      clearInterval(flagsTimerIntervalId);
      flagsRunning = false;
      clearFlagsElimination();
      disableAllLuggageGroups();
      flagsLuggageWrap.classList.add('flags-game-ended');
      if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
      endFlagsGame();
      return;
    }
    chosen = flagsPracticeCurrent;
  } else if (flagsInsaneUnlocked) {
    // insane vs hard+lower — 1:5 at 30 → 5:1 at 50
    const insaneParts = Math.min(Math.floor((selCount - 30) / 5) + 1, 5);
    const lowerParts  = Math.max(6 - insaneParts, 1);
    const lowerPool   = [...easyInitPool, ...mediumCountries, ...hardCountries];
    chosen = weightedPick(insaneParts, insaneCountries, lowerParts, lowerPool);
  } else if (flagsHardUnlocked) {
    // hard vs medium+easy+inicio — 1:5 at 17 → 5:1 at 37
    const hardParts  = Math.min(Math.floor((selCount - 17) / 5) + 1, 5);
    const lowerParts = Math.max(6 - hardParts, 1);
    const lowerPool  = [...easyInitPool, ...mediumCountries];
    chosen = weightedPick(hardParts, hardCountries, lowerParts, lowerPool);
  } else if (flagsMediumUnlocked) {
    // medium vs easy+inicio
    // 1:5 at 3 correct → 5:1 at 15 correct
    const mediumParts = Math.min(Math.floor((selCount - 8) / 3) + 1, 5);
    const easyParts   = Math.max(6 - mediumParts, 1);
    chosen = weightedPick(mediumParts, mediumCountries, easyParts, easyInitPool);
  } else {
    let chosenPool = fullPool.filter(c => !excluded(c));
    if (!chosenPool.length) { flagsAnswered.clear(); chosenPool = fullPool.filter(c => c !== flagsLastChosen); }
    if (!chosenPool.length) chosenPool = fullPool;
    // Fallback final: si el continente no tiene nada, usar easy global
    if (!chosenPool.length) {
      chosenPool = [...(COUNTRIES.inicio || []), ...(COUNTRIES.easy || [])].filter(c => COUNTRY_FLAGS[c]);
    }
    chosen = chosenPool[Math.floor(flagsRand() * chosenPool.length)];
  }
  if (!chosen) return; // pool completamente vacía, no iniciar ronda
  flagsLastChosen = chosen;
  // Versus: registrar la bandera mostrada y avanzar el índice compartido, así la
  // lista de exclusión y la dificultad quedan idénticas en todos los clientes.
  if (_flagsSyncedVersus()) { flagsAnswered.add(chosen); flagsVsIndex++; }
  flagsFlagidLabel.textContent = (typeof tCountry === 'function') ? tCountry(chosen) : chosen;
  // Ajustar tamaño si el nombre es largo. Todo en vmin para escalar con el
  // viewport igual que la imagen de flagid (49.4cqmin); maxW = 41.7cqmin en px.
  const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
  const maxW = 41.7 * vminPx;
  let fs = 4.2;
  flagsFlagidLabel.style.fontSize = fs + 'cqmin';
  flagsFlagidLabel.style.letterSpacing = '';
  while (flagsFlagidLabel.scrollWidth > maxW && fs > 1.8) {
    fs -= 0.22;
    flagsFlagidLabel.style.fontSize = fs + 'cqmin';
    if (fs < 3.3) flagsFlagidLabel.style.letterSpacing = '-1px';
    if (fs < 2.4) flagsFlagidLabel.style.letterSpacing = '-2px';
  }

  // Distractors: prefer visually similar flags from correcta 23 onward
  const _inPractice = window.practiceConfig && window.practiceConfig.active;
  const _practiceContFilter2 = _inPractice
    ? c => COUNTRY_FLAGS[c] && window.practiceConfig.continents.has(FLAG_COUNTRY_CONTINENT[c])
    : () => true;
  const useSimilar = !_inPractice && selCount >= 35 && FLAG_SIMILAR[chosen];
  const similarAvailable = useSimilar
    ? [...(FLAG_SIMILAR[chosen] || [])].filter(c => COUNTRY_FLAGS[c] && c !== chosen)
    : [];
  // Build distractor base: in practice, limit to unlocked tiers (same as pick logic)
  let _distractorBase;
  if (_inPractice) {
    const _dUnlocked = ['inicio'];
    const _diff2 = (window.practiceConfig && window.practiceConfig.difficulty) || 'dificil';
    if (flagsEasyUnlocked   && _diff2 !== 'inicio')                          _dUnlocked.push('easy');
    if (flagsMediumUnlocked && (_diff2 === 'medio' || _diff2 === 'dificil')) _dUnlocked.push('medium');
    if (flagsHardUnlocked   && _diff2 === 'dificil')                         _dUnlocked.push('hard');
    if (flagsInsaneUnlocked && _diff2 === 'dificil')                         _dUnlocked.push('insane');
    const _dSet = new Set(_dUnlocked.flatMap(t => COUNTRIES[t] || []));
    _distractorBase = flagsPracticePool.filter(c => _dSet.has(c));
    // Expand to next tiers if too few for slot count
    const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];
    for (const tier of ALL_TIERS) {
      if (_distractorBase.length >= flagsGroupIds.length + 2) break;
      if (_dUnlocked.includes(tier)) continue;
      (COUNTRIES[tier] || []).forEach(c => { if (COUNTRY_FLAGS[c] && !_dSet.has(c)) { _dSet.add(c); if (flagsPracticePool.includes(c)) _distractorBase.push(c); } });
    }
    if (_distractorBase.length < flagsGroupIds.length) _distractorBase = flagsPracticePool;
  } else {
    _distractorBase = fullPool;
  }
  const nonsimilar = flagsShuffle(_distractorBase.filter(c => c !== chosen && !similarAvailable.includes(c)));
  flagsShuffle(similarAvailable);
  // Fill distractors with similars first, then pad with filtered pool, then pad with easy (continent-filtered in practice)
  let distractorPool = [...similarAvailable, ...nonsimilar];
  if (distractorPool.length < flagsGroupIds.length - 1) {
    const fallbackBase = _inPractice
      ? _distractorBase
      : [...(COUNTRIES.inicio || []), ...(COUNTRIES.easy || [])];
    const globalEasy = flagsShuffle(fallbackBase
      .filter(c => COUNTRY_FLAGS[c] && c !== chosen && !distractorPool.includes(c) && _practiceContFilter2(c)));
    distractorPool = [...distractorPool, ...globalEasy];
  }

  const slotCount = flagsGroupIds.length;
  const correctSlot = Math.floor(flagsRand() * slotCount);

  // Apply six-mode layout before animations so positions are correct when luggages drop
  if (flagsSixUnlocked) flagsLuggageWrap.classList.add('flags-six-mode');

  // Preparar grupos y asignar banderas
  const activeGroupIds = flagsSixUnlocked
    ? [...flagsTopGroupIds, ...flagsBottomGroupIds]
    : flagsTopGroupIds;

  // Assign flags to slots primero — src antes de la animación para que el decode
  // ocurra concurrente con la caída (200ms de animación es suficiente margen).
  flagsGroupIds.forEach((id, i) => {
    const imgId = flagsSlotImgIds[id];
    const img = document.getElementById(imgId);
    if (!img) return;
    const country = i === correctSlot ? chosen : (distractorPool[i < correctSlot ? i : i - 1] || '');
    img.src = COUNTRY_FLAGS[country] || '';
    img.style.display = 'block';
    if (img.decode) img.decode().catch(() => {}); // fire-and-forget: precalienta textura GPU
  });

  // Iniciar animación en el siguiente frame: el browser commitió la remoción de
  // luggage-enter-active en el frame anterior (no se necesita void offsetWidth).
  activeGroupIds.forEach(id => {
    const group = document.getElementById(id);
    if (!group) return;
    group.style.display = '';
    group.style.pointerEvents = 'auto';
    group.style.cursor = 'pointer';
    group.classList.remove('flags-faded', 'luggage-enter-active');
  });
  requestAnimationFrame(() => {
    if (!flagsRunning) return;
    activeGroupIds.forEach(id => {
      const group = document.getElementById(id);
      if (group) group.classList.add('luggage-enter-active');
    });
  });

  flagsRoundStartTime = performance.now() + 200; // empieza a contar tras la animación de entrada

  let flagsPicked = false;
  // findluggage scrollea en X. En iOS el click llega ~300ms tarde (lag de toque) y
  // para entonces findluggage ya se corrió → el maletín caía a una X posterior. Lo
  // congelamos en pointerdown (toque real, inmediato). Solo afecta X; la Y no cambia
  // porque findluggage no se mueve en vertical.
  let flagsTapFindRect = null;

  // ── Eliminación progresiva de opciones erróneas ───────────────────────────────
  // 6 opciones: cada 1/3 del tiempo se desvanecen 2 erróneas (0.3s) y quedan
  //             deseleccionables, hasta dejar solo 2 (correcta + 1 errónea).
  // 3 opciones: a la 1/2 del tiempo se desvanece 1 errónea, dejando 2.
  clearFlagsElimination();
  const wrongSlots = [];
  for (let s = 0; s < slotCount; s++) if (s !== correctSlot) wrongSlots.push(s);
  flagsShuffle(wrongSlots);
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
    // pointerup = al SOLTAR el maletín, inmediato en iOS (sin los 300ms del click).
    // Congela findluggage Y ejecuta la acción en el mismo evento.
    group.onpointerup = (ev) => {
      if (!flagsRunning || flagsPicked || group.classList.contains('flags-faded')) return;
      ev.preventDefault(); // evita que dispare click posterior en iOS
      // En iOS el compositor anima findluggage de forma asíncrona: pausar la animación
      // y forzar reflow no es suficiente para sincronizar la posición visual cuando el
      // usuario responde muy rápido (el layout devuelve la X base, no la X animada).
      // Solución: capturar la matrix exacta del compositor con getComputedStyle ANTES
      // de tocar nada, luego fijar el transform inline → getBCR refleja la X real.
      const _fmat = new DOMMatrix(window.getComputedStyle(flagsFindLuggage).transform);
      flagsFindLuggage.classList.remove('scrolling');
      flagsFindLuggage.style.animation  = 'none';
      flagsFindLuggage.style.transition = 'none';
      flagsFindLuggage.style.transform  = `matrix(${_fmat.a},${_fmat.b},${_fmat.c},${_fmat.d},${_fmat.e},${_fmat.f})`;
      flagsMachine2.style.animationPlayState  = 'paused';
      flagsMachine3.style.animationPlayState  = 'paused';
      flagsMachine3b.style.animationPlayState = 'paused';
      flagsTapFindRect = flagsFindLuggage.getBoundingClientRect(); // getBCR fuerza layout — void offsetWidth innecesario
      // Diferir el trabajo pesado al siguiente frame: el browser pinta el estado
      // congelado inmediatamente y el main thread queda libre para el compositor.
      requestAnimationFrame(handleLuggagePick);
    };
    function handleLuggagePick() {
      if (!flagsRunning || flagsPicked || group.classList.contains('flags-faded')) return;
      flagsPicked = true;
      clearFlagsElimination();
      flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
      // Animate selected luggage toward findluggage position
      // Resetear a posición BASE (sin transform/transición) ANTES de medir: en iOS
      // la animación de entrada dejaba un transform residual y medíamos corrido →
      // el maletín quedaba descolocado "a veces". Así medimos siempre la base real.
      group.classList.remove('luggage-enter-active');
      group.style.animation  = 'none';
      group.style.transition = 'none';
      group.style.transform  = 'none';
      group.style.transformOrigin = '0 0';
      // getBCR fuerza layout y commitea el reset (sin void offsetWidth).
      // Las medidas se calculan aquí; la transición se aplica en el siguiente rAF
      // para que el browser haya pintado transform:none antes de arrancar la animación.
      const lugImg    = group.querySelector('#flags-luggage, .flags-luggage-side');
      const lugRect   = (lugImg || group).getBoundingClientRect();
      const grpRect   = group.getBoundingClientRect();
      const findRect  = flagsTapFindRect || flagsFindLuggage.getBoundingClientRect();
      flagsTapFindRect = null;
      const lugScale  = flagsLuggageWrap.getBoundingClientRect().width / 220;
      const fit = lugRect.width ? (findRect.width / lugRect.width) : 1;
      const lugCx  = (lugRect.left + lugRect.width  / 2 - grpRect.left) / lugScale;
      const lugCy  = (lugRect.top  + lugRect.height / 2 - grpRect.top)  / lugScale;
      const findCx = (findRect.left + findRect.width  / 2 - grpRect.left) / lugScale;
      const findCy = (findRect.top  + findRect.height / 2 - grpRect.top)  / lugScale;
      let dx = findCx - fit * lugCx;
      let dy = findCy - fit * lugCy;
      group.style.willChange = 'transform';
      group.style.transformOrigin = '0 0';
      // Siguiente frame: transform:none ya está pintado → la transition anima limpio
      requestAnimationFrame(() => {
        group.style.transition = 'transform 0.1s linear';
        group.style.transform  = `translate3d(${dx}px, ${dy}px, 0) scale(${fit})`;
      });
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
          group.style.transform  = `translate3d(${dx - 1000 / lugScale}px, ${dy}px, 0) scale(${fit})`;
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
        if (typeof sfxCheck   !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        if (typeof sfxAcertar !== 'undefined') { sfxAcertar.currentTime = 0; sfxPlay(sfxAcertar); }
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
        if (typeof window._vsReportAnswer === 'function') window._vsReportAnswer(true, Math.round(flagsScore));
        if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(true, Math.round(flagsScore));
        if (typeof showScorePopup !== 'undefined') showScorePopup(pts + speedBonus);
        if (speedBonus > 0) {
          clearTimeout(flagsSpeedBonusHideId);
          flagsSpeedBonusText.classList.remove('visible');
          requestAnimationFrame(() => flagsSpeedBonusText.classList.add('visible'));
          flagsSpeedBonusHideId = setTimeout(() => flagsSpeedBonusText.classList.remove('visible'), 1600);
        }
        if (badgeImg) showFlagsBadge(badgeImg, inRowBonus, flagsStreak);
      } else {
        flagsStreak = 0;
        flagsIsFirstRound = false;
        flagsWrongCount++;
        if (typeof sfxError !== 'undefined') { sfxError.currentTime = 0; sfxPlay(sfxError); }
        if (typeof window._vsReportAnswer === 'function') window._vsReportAnswer(false, Math.round(flagsScore));
        if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(false, Math.round(flagsScore));
        // En 1v1: efectos en mi propia tarjeta (lobby lo maneja por broadcast self:true)
        if (window._vsActive) _applyWrongEffects(flagsLbElements['flags-lb-player']);
      }
      const overlay = document.getElementById(correct ? 'flags-check-overlay' : 'flags-wrong-overlay');
      if (overlay) {
        overlay.classList.remove('animate');
        void overlay.offsetWidth;
        overlay.classList.add('animate');
        setTimeout(() => {
          overlay.classList.remove('animate');
          if (!flagsRunning) return;
          // Hide all current groups
          const allGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
          const _practiceLastOne = window.practiceConfig && window.practiceConfig.active && correct && flagsPracticeRemaining.length === 1;
          if (!document.body.classList.contains('recording-mode') && !_practiceLastOne) {
            allGroupIds.forEach(gid => {
              const g = document.getElementById(gid);
              if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.transformOrigin = ''; g.style.opacity = '0'; g.style.willChange = ''; }
            });
          }
          setTimeout(() => {
            if (!flagsRunning) return;
            if (document.body.classList.contains('recording-mode')) return;
            if (window.practiceConfig && window.practiceConfig.active) {
              if (correct) {
                flagsPracticeRemaining = flagsPracticeRemaining.filter(x => x !== flagsPracticeCurrent);
                flagsPracticeCurrent = flagsPracticeRemaining.length ? flagsPracticePickNext(null) : null;
              } else if (flagsPracticeRemaining.length > 1) {
                flagsPracticeCurrent = flagsPracticePickNext(flagsPracticeCurrent);
              }
              // wrong + 1 remaining: keep flagsPracticeCurrent as-is
              // If pool exhausted, don't restore luggage visibility — let startFlagsRound end the game
              if (!flagsPracticeCurrent) {
                startFlagsRound();
                return;
              }
            }
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
    }
    group.onclick = handleLuggagePick;
  });
}

function _flagsCleanupVisuals() {
  flagsWrapper.style.display      = 'none';
  flagsMachine.style.display      = 'none';
  flagsMachine2.style.display     = 'none';
  flagsMachine3.style.display     = 'none';
  flagsMachine3b.style.display    = 'none';
  flagsMachine3.classList.remove('scrolling');
  flagsMachine3b.classList.remove('scrolling');
  flagsFindLuggage.style.display  = 'none';
  flagsFindLuggage.classList.remove('scrolling');
  flagsLuggageWrap.style.display  = 'none';
  flagsLuggageWrap.classList.remove('flags-six-mode');
  flagsFlagImg.style.display      = 'none';
  flagsFlagImg.src                = '';
  flagsFlagidWrap.style.display   = 'none';
  flagsBottomGroupIds.forEach(id => {
    const g = document.getElementById(id);
    if (g) g.style.display = 'none';
  });
}

function hideFlagsMode() {
  // Always: hide score/UI/overlays and stop timers
  flagsScoreDisplay.style.display = 'none';
  document.getElementById('flags-countdown-widget').style.display = 'none';
  flagsRightPanel.style.display   = 'none';
  mainRightPanel.style.display    = 'none';
  flagsTimeupEl.style.display     = 'none';
  if (flagsScoreRafId) { cancelAnimationFrame(flagsScoreRafId); flagsScoreRafId = null; }
  clearTimeout(flagsSpeedBonusHideId);
  flagsSpeedBonusText.classList.remove('visible');
  clearInterval(flagsTimerIntervalId);
  flagsRunning = false;
  clearFlagsElimination();

  const finalScore = Math.round(flagsScore);
  window.lastModeScore = finalScore;

  if (window._suppressGameover) { window._suppressGameover = false; _flagsCleanupVisuals(); return; }

  // ── LOBBY (grupal): ranking en vez del gameover normal ──
  if (window._lobbyActive && typeof window._lobbyHandleGameEnd === 'function') {
    _flagsCleanupVisuals();
    window._lobbyHandleGameEnd(finalScore);
    return;
  }
  // ── VERSUS 1v1: pantalla de resultado W/L en vez del gameover normal ──
  // Keep visual assets (machines, flag, luggage) alive as background during W/L result.
  // flagsHardReset (via quitToMenu) handles cleanup when user exits.
  if (window._vsActive && typeof window._vsHandleGameEnd === 'function') {
    window._vsHandleGameEnd(finalScore);
    return;
  }

  _flagsCleanupVisuals();

  // ── PRÁCTICA: redirigir al panel ──────────────────────────
  if (window.practiceConfig && window.practiceConfig.active) {
    window.practiceConfig.active = false;
    document.body.classList.remove('practice-mode');
    if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
    const ls = document.getElementById('loading-screen');
    if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; }
    try { if (typeof playMusic !== 'undefined') playMusic(window.sfxMenuMusic || sfxMenuMusic); } catch(e) {}
    if (typeof window.showEntranceElementsStatic === 'function') window.showEntranceElementsStatic();
    document.getElementById('loading-practice-group').style.display = 'flex';
    document.getElementById('practice-mode-section').style.display = 'none';
    document.getElementById('practice-config-section').style.display = 'none';
    if (window._practiceStats) { window._practiceStats.correct = flagsCorrectCount; window._practiceStats.wrong = flagsWrongCount; }
    window.showPracticeScore(finalScore);
    return;
  }
  // ──────────────────────────────────────────────────────────

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
    window.hideGameoverConfirm?.();
    gameoverScreen.style.display = 'flex';
    const label = gameoverScreen.querySelector('.gameover-text1-label');
    if (label) label.textContent = t('gameover.flags');
  }
  if (typeof restartFlightAtt !== 'undefined') restartFlightAtt();
  if (typeof buildChecksRow !== 'undefined') buildChecksRow();
  const checksEndTime = (flagsCorrectCount > 0 ? (flagsCorrectCount - 1) * 0.1 + 0.2 : 0) + 0.4;
  if (typeof buildWrongsRow !== 'undefined') buildWrongsRow(checksEndTime);
  if (typeof playMusic !== 'undefined') playMusic(sfxPostgame);
  if (window.campaign && window.campaign.active && typeof window.preloadNextModeAssets === 'function') {
    window.preloadNextModeAssets('shapes').then(() => window.showGameoverConfirm?.());
  } else {
    setTimeout(() => window.showGameoverConfirm?.(), 800);
  }
}

// ── PREGAME COUNTDOWN ─────────────────────────────────────────────────────────
let flagsPregameTimeout = null;
let flagsAborted = false;

function runFlagsPregame(onDone) {
  flagsAborted = false;
  flagsPregameEl.style.display = 'flex';
  if (typeof sfxCountdown !== 'undefined') { sfxCountdown.currentTime = 0; sfxPlay(sfxCountdown); }
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
    flagsPregameImg.style.width     = size + 'cqmin';
    flagsPregameImg.style.height    = size + 'cqmin';
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
  if (window._powerQuitOverlay) {
    // Solo pausar animaciones; dejar la UI visible detrás del overlay
    [flagsMachine, flagsMachine2, flagsMachine3, flagsMachine3b, flagsFindLuggage].forEach(m => {
      if (m) m.style.animationPlayState = 'paused';
    });
    // Deshabilitar maletines: sin hover ni click durante el overlay de game over
    disableAllLuggageGroups();
    if (flagsLuggageWrap) flagsLuggageWrap.classList.add('flags-game-ended');
    // Detener el titilo del countdown
    if (flagsTimerImg) flagsTimerImg.style.animationPlayState = 'paused';
  } else {
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
      if (el) { el.classList.remove('animate'); el.style.display = ''; el.style.opacity = ''; }
    });
    flagsBottomGroupIds.forEach(id => { const g = document.getElementById(id); if (g) g.style.display = 'none'; });
  }
}
window.gameStoppers = window.gameStoppers || [];
window.gameStoppers.push(flagsHardReset);
window.flagsHardReset = flagsHardReset;

// ── TIMER ─────────────────────────────────────────────────────────────────────
function startFlagsTimer() {
  clearInterval(flagsTimerIntervalId); // defensivo: evita timer doble si se llama dos veces
  const _flagsInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
  flagsTimeLeft = _flagsInfinite ? 0 : (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer > 0)
    ? window.practiceConfig.timer
    : FLAGS_GAME_DURATION;
  flagsScore          = 0;
  flagsDisplayedScore = 0;
  flagsWrongCount     = 0;
  if (typeof setModeCounts !== 'undefined') setModeCounts(0, 0);
  flagsScoreEl.textContent = (((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
  flagsRunning  = true;
  if (_flagsInfinite) { flagsTimerEl.textContent = '∞'; flagsTimerEl.classList.add('timer-number-infinity'); }

  flagsTimerIntervalId = setInterval(() => {
    if (_flagsInfinite) return;
    flagsTimeLeft--;
    flagsTimerEl.textContent = flagsTimeLeft;
    flagsTimerEl.classList.remove('timer-number-infinity');

    if (flagsTimeLeft <= 10) {
      flagsTimerEl.style.color = '#ffffff';
      flagsTimerImg.src = 'images/countdownred2.png';
      if (flagsTimeLeft > 0 && typeof sfxTickdown !== 'undefined') { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
    }
    if (flagsTimeLeft <= 0) {
      clearInterval(flagsTimerIntervalId);
      flagsRunning = false;
      clearFlagsElimination();
      disableAllLuggageGroups();
      flagsLuggageWrap.classList.add('flags-game-ended');
      if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
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
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
  if (typeof window._setPlaying === 'function') window._setPlaying(true);
  window.pendingGameMode = 'flags';
  // Resetear estado del splash con el splash AÚN oculto (evita saltear step2 y la
  // mesa "subiendo" si veníamos de una campaña previa). Ver window.resetSplashEntry.
  window.resetSplashEntry?.();
  // Transición visual inmediata
  document.getElementById('loading-screen').style.display = 'none';
  const splashEl = document.getElementById('splash-screen');
  splashEl.style.display = 'flex';
  window.showSplashConfirm?.();
  const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
  void splashEl.offsetWidth;
  animEls.forEach(el => el.classList.add('animate-in'));
  if (typeof playMusic !== 'undefined') playMusic(sfxPostgame);
  // Setup no visual diferido
  requestAnimationFrame(() => {
    document.getElementById('splash-screen').classList.add('mode-flags');
    document.getElementById('splash-screen').classList.remove('mode-shapes', 'mode-monuments');
    document.getElementById('gameover-screen').classList.add('mode-flags');
    document.getElementById('gameover-screen').classList.remove('mode-shapes', 'mode-monuments');
    window.swapHowtoVideo?.('images/howtoplay/howtoplay1.mp4');
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
    { const _pk = (window.practiceConfig && window.practiceConfig.active) ? 'splash.practice.flags.1' : 'splash.flags.1'; if (label) { label.textContent = t(_pk); label.classList.remove('step2'); } }
    const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
    if (howtoWrap) howtoWrap.classList.remove('slide-down');
    const howtoTitle = document.querySelector('.splash-howtoplay-title');
    if (howtoTitle) howtoTitle.textContent = 'Suitcase Shuffle';
  });
});

document.getElementById('loading-flags-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
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
