// ── MODO BANDERAS ─────────────────────────────────────────────────────────────
document.addEventListener('contextmenu', e => {
  if (e.target.closest('#flags-luggage-wrap')) e.preventDefault();
});

['flags-luggage-group', 'flags-luggage-left-group', 'flags-luggage-right-group',
 'flags-luggage-bl-group', 'flags-luggage-bc-group', 'flags-luggage-br-group'].forEach(id => {
  document.getElementById(id)?.addEventListener('mouseenter', () => {
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
const flagsLuggageWrap   = document.getElementById('flags-luggage-wrap');
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

const FLAGS_PREGAME_STEPS = [
  { src: 'images/countdown/3.png',  hold: 800,  size: 420 },
  { src: 'images/countdown/2.png',  hold: 800,  size: 420 },
  { src: 'images/countdown/1.png',  hold: 800,  size: 420 },
  { src: 'images/countdown/go.png', hold: 950,  size: 490 },
];

// ── SHOW / HIDE ───────────────────────────────────────────────────────────────
function showFlagsMode() {
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
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
  let margenHorizontal = 40;
  if (anchoVentana > 1024)     margenHorizontal = anchoVentana * 0.35;
  else if (anchoVentana > 768) margenHorizontal = anchoVentana * 0.20;
  const escalaW = (anchoVentana - margenHorizontal) / gameCanvas.width;
  const escalaH = (altoVentana - 80) / gameCanvas.height;
  const escala  = Math.min(escalaW, escalaH) * 0.92;
  flagsWrapper.style.transform       = `scale(${escala})`;
  flagsWrapper.style.transformOrigin = 'center center';
  flagsScoreDisplay.style.display = 'block';
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
  initFlagsLeaderboard();

  runFlagsPregame(() => {
    flagsFindLuggage.style.display  = 'block';
    flagsFindLuggage.classList.remove('scrolling');
    void flagsFindLuggage.offsetWidth;
    flagsFindLuggage.classList.add('scrolling');
    flagsLuggageWrap.style.display  = 'block';
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

const flagsMockPlayers = Array.from({ length: 10 }, (_, i) => ({
  id: `flagsmock${i}`,
  score: Math.floor(Math.random() * 600) + 50,
  color: FLAGS_LB_COLORS[i],
  initial: 'ABCDEFGHIJ'[i],
}));

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

function flagsPositionLeaderboard(playerScore, animate) {
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
    flagsScoreEl.textContent = flagsDisplayedScore;
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

function showFlagsBadge(badgeImg, bonus, streak) {
  const canvas = document.getElementById('flags-badge-canvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.display = 'block';
  const ctx2 = canvas.getContext('2d');
  const CX = canvas.width / 2, CY = canvas.height / 2;
  const W = 405, H = 333, CW = 477, CH = 405;
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

    let alpha, scale;
    if      (t < IN_END)   { scale = 0.25 + (t / IN_END) * 0.75; alpha = 1; }
    else if (t < HOLD_END) { scale = 1; alpha = 1; }
    else                   { const p = (t - HOLD_END) / SHRINK_DUR; scale = 1 - p; alpha = 1; }

    // check.png
    ctx2.save();
    ctx2.globalAlpha = alpha;
    ctx2.translate(CX, CY);
    ctx2.scale(scale, scale);
    ctx2.drawImage(imgCheck, -CW / 2, -CH / 2, CW, CH);
    ctx2.restore();

    // +bonus
    let bonusScale = 0;
    if      (t < BZ_IN)   bonusScale = t / BZ_IN;
    else if (t < BZ_HOLD) bonusScale = 1;
    else if (t < BZ_OUT)  bonusScale = 1 - (t - BZ_HOLD) / (BZ_OUT - BZ_HOLD);
    if (bonusScale > 0 && bonusLabel) {
      const bCY = CY + CH / 2 + 20;
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.translate(CX, bCY);
      ctx2.scale(bonusScale, bonusScale);
      ctx2.font = 'bold 52px "Arial Black", Impact, sans-serif';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      const offsets = [[-7,-7],[-7,0],[-7,7],[0,-7],[0,7],[7,-7],[7,0],[7,7]];
      ctx2.fillStyle = '#183897';
      for (const [ox,oy] of offsets) ctx2.fillText(bonusLabel, ox, oy);
      ctx2.strokeStyle = '#ffaa00'; ctx2.lineWidth = 7;
      ctx2.strokeText(bonusLabel, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillText(bonusLabel, 0, 0);
      ctx2.restore();
    }

    // badge + IN A ROW
    if (badgeImg) {
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.translate(CX + 30, CY - 30);
      ctx2.scale(scale, scale);
      ctx2.drawImage(badgeImg, -W / 2, -H / 2, W, H);
      ctx2.font = 'bold 67px Fredoka, sans-serif';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.scale(1, 1.2);
      ctx2.strokeStyle = strokeColor; ctx2.lineWidth = 11;
      ctx2.strokeText(`${streak} IN A ROW`, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillText(`${streak} IN A ROW`, 0, 0);
      ctx2.restore();
    }

    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

function startFlagsRound() {
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
    if (!flagsRunning) return;
    // Simular wrong: misma lógica que click incorrecto
    flagsGroupIds.forEach(gid => {
      const g = document.getElementById(gid);
      if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
    });
    flagsStreak = 0;
    flagsIsFirstRound = false;
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
          if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.opacity = '0'; }
        });
        setTimeout(() => {
          if (!flagsRunning) return;
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
  // Ajustar tamaño si el nombre es largo
  const maxW = 380;
  let fs = 38;
  flagsFlagidLabel.style.fontSize = fs + 'px';
  flagsFlagidLabel.style.letterSpacing = '';
  while (flagsFlagidLabel.scrollWidth > maxW && fs > 16) {
    fs -= 2;
    flagsFlagidLabel.style.fontSize = fs + 'px';
    if (fs < 30) flagsFlagidLabel.style.letterSpacing = '-1px';
    if (fs < 22) flagsFlagidLabel.style.letterSpacing = '-2px';
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
  flagsGroupIds.forEach((id, i) => {
    const group = document.getElementById(id);
    if (!group) return;
    group.onclick = () => {
      if (!flagsRunning || flagsPicked) return;
      flagsPicked = true;
      flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
      // Animate selected luggage toward findluggage position
      group.classList.remove('luggage-enter-active');
      group.style.animation  = 'none';
      void group.offsetWidth; // reflow — group is now at natural CSS position
      const groupRect = group.getBoundingClientRect();
      const findRect  = flagsFindLuggage.getBoundingClientRect();
      const dx = findRect.left - groupRect.left;
      const dy = findRect.top  - groupRect.top;
      group.style.transition = 'transform 0.1s linear';
      group.style.transform  = `translate(${dx}px, ${dy}px)`;
      flagsMachine2.style.animationPlayState = 'paused';
      flagsMachine3.style.animationPlayState = 'paused';
      flagsMachine3b.style.animationPlayState = 'paused';
      flagsFindLuggage.style.animationPlayState = 'paused';
      setTimeout(() => {
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
        group.style.transition = 'transform 0.15s linear';
        group.style.transform  = `translate(${dx - 1000}px, ${dy}px)`;
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
          allGroupIds.forEach(gid => {
            const g = document.getElementById(gid);
            if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.opacity = '0'; }
          });
          setTimeout(() => {
            if (!flagsRunning) return;
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
  flagsRightPanel.style.display   = 'none';
  mainRightPanel.style.display    = '';
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
}

// ── PREGAME COUNTDOWN ─────────────────────────────────────────────────────────
function runFlagsPregame(onDone) {
  flagsPregameEl.style.display = 'flex';
  if (typeof sfxCountdown !== 'undefined') { sfxCountdown.currentTime = 0; sfxCountdown.play(); }
  let step = 0;

  function showStep() {
    if (step >= FLAGS_PREGAME_STEPS.length) {
      flagsPregameEl.style.display = 'none';
      onDone();
      return;
    }
    const { src, hold, size } = FLAGS_PREGAME_STEPS[step++];
    flagsPregameImg.style.animation = 'none';
    flagsPregameImg.style.width     = size + 'px';
    flagsPregameImg.style.height    = size + 'px';
    flagsPregameImg.src = src;
    void flagsPregameImg.offsetWidth;
    flagsPregameImg.style.animation = '';
    setTimeout(showStep, hold);
  }

  showStep();
}

// ── TIMER ─────────────────────────────────────────────────────────────────────
function startFlagsTimer() {
  flagsTimeLeft = FLAGS_GAME_DURATION;
  flagsScore          = 0;
  flagsDisplayedScore = 0;
  flagsScoreEl.textContent = '0';
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
      if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxTimesUp.play(); }
      endFlagsGame();
    }
  }, 1000);
}

// ── GAME OVER ─────────────────────────────────────────────────────────────────
function endFlagsGame() {
  flagsTimerImg.style.animationPlayState = 'paused';
  if (typeof playMusic !== 'undefined') playMusic(null);
  flagsTimeupEl.classList.remove('timeup-out');
  flagsTimeupEl.classList.add('timeup-in');
  flagsTimeupEl.style.display = 'flex';

  setTimeout(() => {
    flagsTimeupEl.classList.remove('timeup-in');
    flagsTimeupEl.classList.add('timeup-out');
    setTimeout(() => hideFlagsMode(), 400);
  }, 1800);
}

// ── BOTÓN DE INICIO ───────────────────────────────────────────────────────────
document.getElementById('loading-flags-btn').addEventListener('click', () => {
  document.getElementById('loading-screen').style.display = 'none';
  showFlagsMode();
});

document.getElementById('loading-flags-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxSelect.play(); }
});
