// ── RESULTS SCREEN ───────────────────────────────────────────────────────────

const resultsScreen  = document.getElementById('results-screen');
const resultsConfirm = document.querySelector('.results-confirm-wrap');
const resultsRank      = document.getElementById('results-rank');
const resultsRankLabel = document.getElementById('results-rank-label');
const resultsBackWrap  = document.getElementById('results-back-wrap');
const resultsPointsWrap     = document.getElementById('results-points-wrap');
const resultsTable          = document.querySelector('.results-table');
const resultsReveal         = document.getElementById('results-reveal');
let resultsBackStep = 0;

const TOTAL_HS_KEY = 'totalHighscore';
// La lista de amigos vive en js/friends.js (capa de datos lista para servidor).
// Se accede con getFriends(); MOCK_FRIENDS queda como respaldo allí.

function buildResultsMessage(total) {
  const playerName = localStorage.getItem('playerName') || 'John';
  const prevBest   = parseInt(localStorage.getItem(TOTAL_HS_KEY)) || 0;
  const isNewBest  = total > prevBest;
  if (isNewBest) localStorage.setItem(TOTAL_HS_KEY, total);

  if (isNewBest) {
    return t('results.newRecordMsg', { name: playerName });
  }

  const all = [...getFriends(), { name: playerName, score: total }]
    .sort((a, b) => b.score - a.score);
  const pos    = all.findIndex(p => p.name === playerName && p.score === total) + 1;
  const above  = all[pos - 2];
  const below  = all[pos];
  const record = prevBest.toLocaleString();

  let friendMsg = '';
  if (above && pos > 1) {
    friendMsg = t('results.friendAbove', { name: above.name });
  } else if (below) {
    friendMsg = t('results.friendBelow', { name: below.name });
  }

  return t('results.notBestMsg', { name: playerName, record, pos, friendMsg });
}

const sfxCheer = new Audio('sfx/endgamecheeryay.mp3');
const sfxLoop  = new Audio('sfx/endgameloop.mp3');
sfxLoop.loop = true;
window.sfxCheer = sfxCheer;
window.sfxLoop  = sfxLoop;


let loopStarted     = false;
let confirmTimeout  = null;
let countRaf        = null;
let rankInterval    = null;

function renderDigits(el, value) {
  const str = value.toLocaleString();
  el.innerHTML = [...str].map(ch =>
    ch === ',' || ch === '.'
      ? `<span class="comma">${ch}</span>`
      : `<span class="digit">${ch}</span>`
  ).join('');
}

// ── RESULTS FLIGHT ATTENDANT ─────────────────────────────────────────────────
const RESULTS_FA_TIMELINE = [
  [1,150],[2,100],[3,150],[4,100],[5,100],[6,100],[7,150],[8,50],[9,50],[10,50],
  [11,100],[12,100],[11,100],[12,100],[11,100],[12,100],[13,100],[14,100],[15,100],
  [6,100],[5,100],[4,100],[3,100],[2,100],
];
// Un único <img> + swap de src: sin flash al mostrarse la pantalla.
const _resultsFaBase = 'images/characters/flightattpost/';
const _resultsFaSrcs = Array.from({length: 15}, (_, i) => _resultsFaBase + (i + 1) + '.png');
const resultsFaImg   = document.querySelector('.results-flightatt');
let resultsFaTimeout = null;
// Pre-decodificar frames 2-15 en background
_resultsFaSrcs.forEach((src, i) => {
  if (i > 0) { const m = new Image(); m.src = src; if (m.decode) m.decode().catch(() => {}); }
});

function resultsFaShow(n) {
  if (resultsFaImg) resultsFaImg.src = _resultsFaSrcs[n - 1];
}

function startResultsFlightAtt() {
  clearTimeout(resultsFaTimeout);
  resultsFaShow(1);
  if (resultsFaImg) resultsFaImg.classList.add('active');
  const rank = getRank(resultsScreen._total || 0);
  const descEl = document.getElementById('results-rank-desc');
  if (descEl) descEl.textContent = rank.desc || '';
  document.querySelector('.results-text3-wrap')?.classList.add('active');
  let step = 0;
  function tick() {
    const [f, d] = RESULTS_FA_TIMELINE[step];
    resultsFaShow(f);
    step++;
    if (step >= RESULTS_FA_TIMELINE.length) {
      step = 0;
      resultsFaTimeout = setTimeout(() => {
        resultsFaShow(RESULTS_FA_TIMELINE[0][0]);
        step = 1;
        resultsFaTimeout = setTimeout(tick, 1500);
      }, d);
    } else {
      resultsFaTimeout = setTimeout(tick, d);
    }
  }
  resultsFaTimeout = setTimeout(tick, RESULTS_FA_TIMELINE[0][1]);
}

function stopResultsFlightAtt() {
  clearTimeout(resultsFaTimeout);
  if (resultsFaImg) resultsFaImg.classList.remove('active');
  document.querySelector('.results-text3-wrap')?.classList.remove('active');
  const descEl2 = document.getElementById('results-rank-desc');
  if (descEl2) descEl2.textContent = '';
}

function applyShift() {
  resultsTable.classList.add('shifted');
  resultsScreen.querySelector('.results-content')?.classList.add('shifted');
  resultsReveal.classList.add('shifted');
  startResultsFlightAtt();
}

function resetShift() {
  resultsTable.classList.remove('shifted');
  resultsScreen.querySelector('.results-content')?.classList.remove('shifted');
  resultsReveal.classList.remove('shifted');
  stopResultsFlightAtt();
}

function triggerRankUp(rank, isFinal = false) {
  resultsRank.src = rank.img;
  resultsRankLabel.textContent = rank.name;
  resultsRank.classList.remove('rank-up', 'rank-final');
  resultsRankLabel.classList.remove('visible', 'instant', 'final');
  void resultsRank.offsetWidth;
  resultsRank.classList.add(isFinal ? 'rank-final' : 'rank-up');
  if (isFinal) {
    resultsRankLabel.classList.add('visible', 'final');
  } else {
    resultsRankLabel.classList.add('visible', 'instant');
  }
}

function animateTotal(target) {
  const totalEl = document.getElementById('results-total-score');
  if (!totalEl || target === 0) { if (totalEl) renderDigits(totalEl, 0); return; }
  const duration = Math.sqrt(target / 100) * 1000;
  const start = performance.now();

  // rank cycling: always starts at rank 0, goes up one per second
  clearInterval(rankInterval);
  const finalRankIdx = (typeof rankIndex === 'function') ? rankIndex(target) : RANKS.indexOf(getRank(target));
  let currentRankIdx = 0;
  if (finalRankIdx > 0) {
    const intervalMs = (duration - 300) / finalRankIdx;
    rankInterval = setInterval(() => {
      currentRankIdx++;
      const isFinal = currentRankIdx >= finalRankIdx;
      triggerRankUp((typeof rankAt === 'function') ? rankAt(currentRankIdx) : RANKS[currentRankIdx], isFinal);
      if (isFinal) {
        clearInterval(rankInterval);
        setTimeout(() => {
          resultsBackWrap.classList.add('visible');
          resultsTable.classList.add('shifted');
          resultsScreen.querySelector('.results-content')?.classList.add('shifted');
          applyShift();
        }, 300 + 1000);
      }
    }, intervalMs);
  } else {
    setTimeout(() => {
      resultsRank.classList.remove('rank-up', 'rank-final');
      void resultsRank.offsetWidth;
      resultsRank.classList.add('rank-final');
    }, Math.max(0, duration - 300));
    setTimeout(() => {
      resultsBackWrap.classList.add('visible');
      resultsTable.classList.add('shifted');
      resultsScreen.querySelector('.results-content')?.classList.add('shifted');
      applyShift();
    }, duration + 1000);
  }

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = Math.pow(t, 2.0);
    const current = Math.round(ease * target);
    renderDigits(totalEl, current);
    if (t < 1) { countRaf = requestAnimationFrame(tick); }
    else { renderDigits(totalEl, target); }
  }
  cancelAnimationFrame(countRaf);
  countRaf = requestAnimationFrame(tick);
}

function startResultsLoop() {
  if (loopStarted) return;
  loopStarted = true;
  sfxLoop.currentTime = 0;
  sfxLoop.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxLoop.muted = (typeof isMuted !== 'undefined' && isMuted);
  sfxPlay(sfxLoop).catch(e => console.error('loop play failed:', e));
}

// Arranca el loop un pelín antes de que termine el cheer (overlap suave)…
sfxCheer.addEventListener('timeupdate', () => {
  if (!loopStarted && sfxCheer.duration && sfxCheer.currentTime >= sfxCheer.duration - 0.22) {
    startResultsLoop();
  }
});
// …y fallback robusto: si timeupdate no disparó (en iOS es poco frecuente y a veces
// duration es NaN), arrancar el loop al terminar el cheer.
sfxCheer.addEventListener('ended', startResultsLoop);

resultsConfirm?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  resultsConfirm.classList.add('confirm-pressed');
  setTimeout(() => resultsConfirm.classList.remove('confirm-pressed'), 50);
  resultsConfirm.classList.add('slide-out');
  resultsScreen.classList.remove('results-animating');
  resultsScreen.classList.add('results-exiting');
  setTimeout(() => {
    resultsScreen.classList.remove('results-exiting');
    const content = resultsScreen.querySelector('.results-content');
    if (content) content.style.visibility = 'hidden';
  }, 300);
  setTimeout(() => {
    resultsRank.src = rankAt(0).img;
    resultsRankLabel.textContent = rankAt(0).name;
    resultsRank.style.display = 'block';
    resultsRankLabel.classList.add('visible');
    void resultsRank.offsetWidth;
    resultsRank.classList.add('visible');
    resultsPointsWrap.classList.add('visible');
    setTimeout(() => animateTotal(resultsScreen._total || 0), 300);
  }, 100);
});

resultsConfirm?.addEventListener('mouseenter', playSelect);
resultsConfirm?.addEventListener('mouseleave', playSelect);

resultsBackWrap?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  resultsBackWrap.classList.add('confirm-pressed');
  setTimeout(() => resultsBackWrap.classList.remove('confirm-pressed'), 50);
  if (resultsBackStep === 0) {
    resultsBackStep = 1;
    const descEl = document.getElementById('results-rank-desc');
    if (descEl) descEl.textContent = buildResultsMessage(resultsScreen._total || 0);
    if (!document.querySelector('.results-text3-wrap').classList.contains('active')) {
      document.querySelector('.results-text3-wrap')?.classList.add('active');
    }
  } else {
    hideResultsScreen(true);
    if (typeof showFinalScreen === 'function') showFinalScreen();
  }
});
resultsBackWrap?.addEventListener('mouseenter', playSelect);
resultsBackWrap?.addEventListener('mouseleave', playSelect);

function updateHighscores() {
  // Si hay puntajes de la partida (campaña), usarlos; si no, los récords guardados.
  const cs = (window.campaign && window.campaign.scores) ? window.campaign.scores : {};
  const hs = {
    1: (cs.flags     != null) ? cs.flags     : (parseInt(localStorage.getItem('flagsHighscore'))         || 0),
    2: (cs.shapes    != null) ? cs.shapes    : (parseInt(localStorage.getItem('shapesHighscore'))        || 0),
    3: (cs.game      != null) ? cs.game      : (parseInt(localStorage.getItem('geochallenge_highscore')) || 0),
    4: (cs.monuments != null) ? cs.monuments : (parseInt(localStorage.getItem('monumentsHighscore'))     || 0),
  };
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('results-hs' + i);
    if (el) el.textContent = hs[i].toLocaleString();
  });
  const total = hs[1] + hs[2] + hs[3] + hs[4];
  resultsScreen._total = total;
  const totalEl = document.getElementById('results-total-score');
  if (totalEl) renderDigits(totalEl, 0);
}

function showResultsScreen() {
  resultsScreen.style.display = 'block';
  const content = resultsScreen.querySelector('.results-content');
  if (content) content.style.visibility = '';
  clearInterval(rankInterval);
  cancelAnimationFrame(countRaf);
  resultsRank.style.display = 'none';
  resultsRank.classList.remove('visible', 'rank-up', 'rank-final');
  resultsRankLabel.classList.remove('visible', 'instant', 'final');
  resultsBackWrap.classList.remove('visible');
  resultsBackStep = 0;
  resetShift();
  resultsPointsWrap.classList.remove('visible');
  resultsConfirm.classList.remove('visible', 'slide-out');
  resultsScreen.classList.remove('results-animating');
  void resultsScreen.offsetWidth;
  resultsScreen.classList.add('results-animating');
  updateHighscores();

  // Subir scores a Supabase en background (una sola vez por partida)
  if (!window._scoresUploadedThisGame && window._accountLoggedIn && window._sbUserId) {
    window._scoresUploadedThisGame = true;
    const cs = window.campaign?.scores || {};
    const payload = {};
    if (cs.flags     != null) payload.flags     = cs.flags;
    if (cs.shapes    != null) payload.shapes    = cs.shapes;
    if (cs.game      != null) payload.cities    = cs.game;
    if (cs.monuments != null) payload.monuments = cs.monuments;
    payload.total = resultsScreen._total || 0;
    if (Object.keys(payload).length > 0) {
      window.sbSaveScores(window._sbUserId, payload)
        .then(() => window.sbGetProfile(window._sbUserId))
        .then(profile => {
          window._sbProfile = profile;
          if (typeof window.syncHsFromProfile === 'function') window.syncHsFromProfile(profile);
        })
        .catch(e => console.warn('[scores] upload:', e));
    }
  }
  loopStarted = false;
  sfxLoop.pause();
  sfxLoop.currentTime = 0;
  // Primar sfxLoop DENTRO de este gesto: iOS bloquea reproducir un 2º audio fuera de
  // un gesto, así que lo "desbloqueamos" acá (play+pause) para que luego (al terminar
  // el cheer) pueda sonar sin gesto.
  sfxLoop.muted = (typeof isMuted !== 'undefined' && isMuted);
  sfxPlay(sfxLoop).then(() => { if (!loopStarted) { sfxLoop.pause(); sfxLoop.currentTime = 0; } }).catch(() => {});
  sfxCheer.currentTime = 0;
  sfxCheer.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheer.muted = (typeof isMuted !== 'undefined' && isMuted);
  sfxPlay(sfxCheer).catch(e => console.error('cheer play failed:', e));
  clearTimeout(confirmTimeout);
  confirmTimeout = setTimeout(() => resultsConfirm.classList.add('visible'), 300);
}

function hideResultsScreen(keepMusic) {
  resultsScreen.style.display = 'none';
  resultsConfirm.classList.remove('visible');
  clearTimeout(confirmTimeout);
  if (!keepMusic) {
    sfxCheer.pause();
    sfxCheer.currentTime = 0;
    sfxLoop.pause();
    sfxLoop.currentTime = 0;
    loopStarted = false;
  }
}

window.stopResultsMusic = function () {
  sfxCheer.pause();
  sfxCheer.currentTime = 0;
  sfxLoop.pause();
  sfxLoop.currentTime = 0;
  loopStarted = false;
};
