// ── RESULTS SCREEN ───────────────────────────────────────────────────────────

const resultsScreen  = document.getElementById('results-screen');
const resultsConfirm = document.querySelector('.results-confirm-wrap');
const resultsRank      = document.getElementById('results-rank');
const resultsRankLabel = document.getElementById('results-rank-label');
const resultsBackWrap  = document.getElementById('results-back-wrap');
const resultsPointsWrap = document.getElementById('results-points-wrap');

const sfxCheer = new Audio('sfx/endgamecheeryay.mp3');
const sfxLoop  = new Audio('sfx/endgameloop.mp3');
sfxLoop.loop = true;

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

function triggerRankUp(rank) {
  resultsRank.src = rank.img;
  resultsRankLabel.textContent = rank.name;
  resultsRank.classList.remove('rank-up');
  resultsRankLabel.classList.remove('visible', 'instant');
  void resultsRank.offsetWidth;
  resultsRank.classList.add('rank-up');
  resultsRankLabel.classList.add('visible', 'instant');
}

function animateTotal(target) {
  const totalEl = document.getElementById('results-total-score');
  if (!totalEl || target === 0) { if (totalEl) renderDigits(totalEl, 0); return; }
  const duration = Math.sqrt(target / 100) * 1000;
  const start = performance.now();

  // rank cycling: always starts at rank 0, goes up one per second
  clearInterval(rankInterval);
  const finalRankIdx = RANKS.indexOf(getRank(target));
  let currentRankIdx = 0;
  if (finalRankIdx > 0) {
    rankInterval = setInterval(() => {
      currentRankIdx++;
      triggerRankUp(RANKS[currentRankIdx]);
      if (currentRankIdx >= finalRankIdx) {
        clearInterval(rankInterval);
        resultsBackWrap.classList.add('visible');
      }
    }, 700);
  } else {
    resultsBackWrap.classList.add('visible');
  }

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = Math.pow(t, 1.5);
    const current = Math.round(ease * target);
    renderDigits(totalEl, current);
    if (t < 1) { countRaf = requestAnimationFrame(tick); }
    else { renderDigits(totalEl, target); }
  }
  cancelAnimationFrame(countRaf);
  countRaf = requestAnimationFrame(tick);
}

sfxCheer.addEventListener('timeupdate', () => {
  if (!loopStarted && sfxCheer.duration && sfxCheer.currentTime >= sfxCheer.duration - 0.22) {
    loopStarted = true;
    sfxLoop.currentTime = 0;
    sfxLoop.play().catch(e => console.error('loop play failed:', e));
  }
});

resultsConfirm?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  const a = new Audio('sfx/check.mp3'); a.volume = isMuted ? 0 : 1; a.play();
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
    resultsRank.src = RANKS[0].img;
    resultsRankLabel.textContent = RANKS[0].name;
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
  const a = new Audio('sfx/check.mp3'); a.volume = isMuted ? 0 : 1; a.play();
  resultsBackWrap.classList.add('confirm-pressed');
  setTimeout(() => resultsBackWrap.classList.remove('confirm-pressed'), 50);
  hideResultsScreen();
  document.getElementById('loading-screen').style.display = '';
});
resultsBackWrap?.addEventListener('mouseenter', playSelect);
resultsBackWrap?.addEventListener('mouseleave', playSelect);

function updateHighscores() {
  const hs = {
    1: parseInt(localStorage.getItem('flagsHighscore'))        || 0,
    2: parseInt(localStorage.getItem('shapesHighscore'))       || 0,
    3: parseInt(localStorage.getItem('geochallenge_highscore'))|| 0,
    4: parseInt(localStorage.getItem('monumentsHighscore'))    || 0,
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
  resultsRank.classList.remove('visible', 'rank-up');
  resultsRankLabel.classList.remove('visible');
  resultsBackWrap.classList.remove('visible');
  resultsPointsWrap.classList.remove('visible');
  resultsConfirm.classList.remove('visible', 'slide-out');
  resultsScreen.classList.remove('results-animating');
  void resultsScreen.offsetWidth;
  resultsScreen.classList.add('results-animating');
  updateHighscores();
  loopStarted = false;
  sfxLoop.pause();
  sfxLoop.currentTime = 0;
  sfxCheer.currentTime = 0;
  sfxCheer.play().catch(e => console.error('cheer play failed:', e));
  clearTimeout(confirmTimeout);
  confirmTimeout = setTimeout(() => resultsConfirm.classList.add('visible'), 300);
}

function hideResultsScreen() {
  resultsScreen.style.display = 'none';
  resultsConfirm.classList.remove('visible');
  clearTimeout(confirmTimeout);
  sfxCheer.pause();
  sfxCheer.currentTime = 0;
  sfxLoop.pause();
  sfxLoop.currentTime = 0;
  loopStarted = false;
}
