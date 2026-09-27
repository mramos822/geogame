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
// The friends list lives in js/friends.js (server-ready data layer). Accessed
// via getFriends(); MOCK_FRIENDS stays there as a fallback.

function buildResultsMessage(total) {
  const playerName = localStorage.getItem('playerName') || 'John';
  const prevBest   = (resultsScreen._prevBest !== undefined) ? resultsScreen._prevBest : (parseInt(localStorage.getItem(TOTAL_HS_KEY)) || 0);
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
// A single <img> + src swap: no flash when the screen shows.
const _resultsFaBase = 'images/characters/flightattpost/';
const _resultsFaSrcs = Array.from({length: 15}, (_, i) => _resultsFaBase + (i + 1) + '.png');
const resultsFaImg   = document.querySelector('.results-flightatt');
let resultsFaTimeout = null;
// Pre-decode frames 2-15 in the background
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

// Pending timeouts of the count/rank-up animation (besides countRaf/
// rankInterval) — the skip button needs to cancel them all at once, otherwise
// the final "reveal" fires twice (once from the skip, once from the original
// timeout still running in the background).
let _resultsAnimTimeouts = [];
function _clearResultsAnimTimers() {
  clearInterval(rankInterval);
  cancelAnimationFrame(countRaf);
  _resultsAnimTimeouts.forEach(id => clearTimeout(id));
  _resultsAnimTimeouts = [];
}

function _revealResultsBack() {
  if (resultsBackWrap.classList.contains('visible')) return;
  resultsBackWrap.classList.add('visible');
  resultsTable.classList.add('shifted');
  resultsScreen.querySelector('.results-content')?.classList.add('shifted');
  applyShift();
  hideResultsSkipButton();
}

function showResultsSkipButton() { document.getElementById('results-skip-wrap')?.classList.add('visible'); }
function hideResultsSkipButton() { document.getElementById('results-skip-wrap')?.classList.remove('visible'); }

// Jump straight to the final score and final rank, as if the count animation
// had already finished — same visual result, no waiting.
function skipResultsAnimation() {
  if (resultsScreen._skipTarget === undefined) return;
  const target = resultsScreen._skipTarget;
  const finalRank = resultsScreen._skipFinalRank;
  _clearResultsAnimTimers();
  const totalEl = document.getElementById('results-total-score');
  if (totalEl) renderDigits(totalEl, target);
  if (finalRank) triggerRankUp(finalRank, true);
  _revealResultsBack();
}
window.skipResultsAnimation = skipResultsAnimation;

function animateTotal(target) {
  const totalEl = document.getElementById('results-total-score');
  if (!totalEl || target === 0) { if (totalEl) renderDigits(totalEl, 0); return; }
  const duration = Math.sqrt(target / 100) * 1000;
  const start = performance.now();

  // rank cycling: always starts at rank 0, goes up one per second
  clearInterval(rankInterval);
  const finalRankIdx = (typeof rankIndex === 'function') ? rankIndex(target) : RANKS.indexOf(getRank(target));
  const finalRank = (typeof rankAt === 'function') ? rankAt(finalRankIdx) : getRank(target);
  resultsScreen._skipTarget = target;
  resultsScreen._skipFinalRank = finalRank;
  showResultsSkipButton();
  let currentRankIdx = 0;
  if (finalRankIdx > 0) {
    const intervalMs = (duration - 300) / finalRankIdx;
    rankInterval = setInterval(() => {
      currentRankIdx++;
      const isFinal = currentRankIdx >= finalRankIdx;
      triggerRankUp((typeof rankAt === 'function') ? rankAt(currentRankIdx) : RANKS[currentRankIdx], isFinal);
      if (isFinal) {
        clearInterval(rankInterval);
        _resultsAnimTimeouts.push(setTimeout(_revealResultsBack, 300 + 1000));
      }
    }, intervalMs);
  } else {
    _resultsAnimTimeouts.push(setTimeout(() => {
      resultsRank.classList.remove('rank-up', 'rank-final');
      void resultsRank.offsetWidth;
      resultsRank.classList.add('rank-final');
    }, Math.max(0, duration - 300)));
    _resultsAnimTimeouts.push(setTimeout(_revealResultsBack, duration + 1000));
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
  sfxLoop.volume = (typeof window.getMusicVolumeLevel === 'function') ? window.getMusicVolumeLevel() : ((typeof isMuted !== 'undefined' && isMuted) ? 0 : 1); sfxLoop.muted = (typeof isMusicMuted !== 'undefined' ? isMusicMuted : (typeof isMuted !== 'undefined' && isMuted));
  sfxPlay(sfxLoop).catch(e => console.error('loop play failed:', e));
}

// Start the loop a touch before the cheer ends (smooth overlap)…
sfxCheer.addEventListener('timeupdate', () => {
  if (!loopStarted && sfxCheer.duration && sfxCheer.currentTime >= sfxCheer.duration - 0.22) {
    startResultsLoop();
  }
});
// …and a robust fallback: if timeupdate didn't fire (rare on iOS, and duration
// is sometimes NaN), start the loop when the cheer ends.
sfxCheer.addEventListener('ended', startResultsLoop);

resultsConfirm?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  resultsConfirm.classList.add('confirm-pressed');
  setTimeout(() => resultsConfirm.classList.remove('confirm-pressed'), 50);
  // Coins earned this run burst out of the "+N" on the board and fly into a coin
  // bar (js/coins-reward.js); only then does the screen move on.
  const earned = resultsScreen._coinsEarned || 0;
  const xpEarned = resultsScreen._xpEarned || 0;
  const src = document.querySelector('.results-earn-coins img');
  const xpSrc = document.querySelector('.results-earn-xp img');
  if ((earned > 0 || xpEarned > 0) && src && xpSrc && typeof window.playRewardPair === 'function') {
    // Starts synchronously (origin measured before the board hides) and runs in
    // parallel with the rank reveal — it doesn't hold the flow up. Level-ups open a popup
    // (with the level's coin bonus) and pause the XP bar until it is closed.
    // The menu HUD is hidden right now: bring it to its final values straight away, so it is
    // already correct the moment the player is back on the menu (no flash of the old XP).
    const xpStart0 = window.__topbarsXp || 0, coinsStart0 = window.__topbarsCoins || 0;   // captured BEFORE the HUD is bumped
    if (window.setTopbars) window.setTopbars({ xp: xpStart0 + xpEarned, coins: coinsStart0 + earned });
    // for a minute, a HUD refresh from the server can't show less than this (its data may lag the game)
    window.__topbarsFloor = { xp: xpStart0 + xpEarned, coins: coinsStart0 + earned, t: Date.now() };
    window.playRewardPair({ screen: resultsScreen, fromCoins: src, fromXp: xpSrc, coins: earned, xp: xpEarned,
      coinsStart: coinsStart0, xpStart: xpStart0, deferLevelUp: true })
      .then((res) => { if (res && window.setTopbars) window.setTopbars({ xp: res.xp, coins: res.coins }); })   // menu HUD already up to date on return
      .catch(() => {});
  }
  _leaveResultsBoard();
});

function _leaveResultsBoard() {
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
}

resultsConfirm?.addEventListener('mouseenter', playSelect);
resultsConfirm?.addEventListener('mouseleave', playSelect);

const resultsSkipWrap = document.getElementById('results-skip-wrap');
resultsSkipWrap?.addEventListener('click', () => {
  if (!resultsSkipWrap.classList.contains('visible')) return;
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  resultsSkipWrap.classList.add('confirm-pressed');
  setTimeout(() => resultsSkipWrap.classList.remove('confirm-pressed'), 50);
  skipResultsAnimation();
});
resultsSkipWrap?.addEventListener('mouseenter', playSelect);
resultsSkipWrap?.addEventListener('mouseleave', playSelect);

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
  // If there are game scores (campaign), use them; otherwise the stored records.
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
  resultsScreen._prevBest = parseInt(localStorage.getItem(TOTAL_HS_KEY)) || 0;
  resultsScreen._total = total;
  // Coins / XP this run earned (same formula as Analytics.coinsFromScore/xpFromScore:
  // 10 coins + 1 per 250 pts, 50 XP + 3 per 250 pts).
  const steps = Math.floor(total / 250);
  const ec = document.getElementById('results-earn-coins'), ex = document.getElementById('results-earn-xp');
  resultsScreen._coinsEarned = 10 + steps;
  resultsScreen._xpEarned = 50 + steps * 3;
  if (ec) ec.textContent = '+' + (10 + steps).toLocaleString('en-US');
  if (ex) ex.textContent = '+' + (50 + steps * 3);
  const totalEl = document.getElementById('results-total-score');
  if (totalEl) renderDigits(totalEl, 0);
}

function showResultsScreen() {
  // NOTE: the end-of-session ad does NOT fire here — this is only the first
  // leg of the post-campaign flow (postgame → results → final → ad → menu).
  // It fires from final.js's "final-confirm-back-wrap" handler, right before
  // returning to the menu. See window.showEndOfSessionAd's own comment in
  // core/adpanel.js.
  resultsScreen.style.display = 'block';
  const content = resultsScreen.querySelector('.results-content');
  if (content) content.style.visibility = '';
  _clearResultsAnimTimers();
  resultsRank.style.display = 'none';
  resultsRank.classList.remove('visible', 'rank-up', 'rank-final');
  resultsRankLabel.classList.remove('visible', 'instant', 'final');
  resultsBackWrap.classList.remove('visible');
  hideResultsSkipButton();
  resultsScreen._skipTarget = undefined;
  resultsScreen._skipFinalRank = undefined;
  resultsBackStep = 0;
  resetShift();
  resultsPointsWrap.classList.remove('visible');
  resultsConfirm.classList.remove('visible', 'slide-out');
  resultsScreen.classList.remove('results-animating');
  void resultsScreen.offsetWidth;
  resultsScreen.classList.add('results-animating');
  updateHighscores();

  // Upload scores to Supabase in the background (once per game).
  // Real dedup is server-side via game_logs(user_id, session_id) UNIQUE.
  if (!window._scoresUploadedThisGame && window._accountLoggedIn && window._sbUserId) {
    window._scoresUploadedThisGame = true;
    const _sid = window._gameSessionId;
    const cs = window.campaign?.scores || {};
    const payload = {};
    if (cs.flags     != null) payload.flags     = cs.flags;
    if (cs.shapes    != null) payload.shapes    = cs.shapes;
    if (cs.game      != null) payload.cities    = cs.game;
    if (cs.monuments != null) payload.monuments = cs.monuments;
    payload.total = resultsScreen._total || 0;
    if (Object.keys(payload).length > 0) {
      window.sbSaveScores(window._sbUserId, payload, _sid)
        .then(() => window.sbGetProfile(window._sbUserId))
        .then(profile => {
          window._sbProfile = profile;
          if (typeof window.syncHsFromProfile === 'function') window.syncHsFromProfile(profile);
          // The Founder popup is NOT shown here — only on return to the menu
          // (see js/final.js, "final-confirm-back-wrap" click), which finds a
          // fresh window._sbProfile thanks to this refresh.
        })
        .catch(e => console.warn('[scores] upload:', e));
    }
  }
  loopStarted = false;
  sfxLoop.pause();
  sfxLoop.currentTime = 0;
  // Prime sfxLoop INSIDE this gesture: iOS blocks playing a 2nd audio outside a
  // gesture, so we "unlock" it here (play+pause) so it can later (when the cheer
  // ends) play without a gesture.
  sfxLoop.muted = (typeof isMuted !== 'undefined' && isMuted);
  sfxPlay(sfxLoop).then(() => { if (!loopStarted) { sfxLoop.pause(); sfxLoop.currentTime = 0; } }).catch(() => {});
  sfxCheer.currentTime = 0;
  sfxCheer.volume = (typeof window.getMusicVolumeLevel === 'function') ? window.getMusicVolumeLevel() : ((typeof isMuted !== 'undefined' && isMuted) ? 0 : 1); sfxCheer.muted = (typeof isMusicMuted !== 'undefined' ? isMusicMuted : (typeof isMuted !== 'undefined' && isMuted));
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
