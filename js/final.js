// ── FINAL ────────────────────────────────────────────────────────────────────

const finalScreen = document.getElementById('final-screen');

function fitRankLabel(id, maxWidthVmin) {
  const el = document.getElementById(id);
  if (!el) return;
  // All in vmin so it scales with the viewport. maxWidthVmin in vmin → px.
  const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
  const maxW = maxWidthVmin * vminPx;
  el.style.fontSize = '';
  let size = 4.39; // vmin (= 40px ref)
  el.style.fontSize = size + 'cqmin';
  while (el.scrollWidth > maxW && size > 1.54) {
    size -= 0.11;
    el.style.fontSize = size + 'cqmin';
  }
}

let finalBackTimeout = null;
let _finalRanking = null;
let _finalPos = 0;
let _finalTotal = 0;
let _guestRankPromise = null;

function _onFinalResize() {
  if (!finalScreen || finalScreen.style.display === 'none') return;
  if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
}

function showFinalScreen() {
  // Google Ads "play daily game" conversion: completing a whole Gira Mundial is
  // the real engagement signal we chose to use instead of just starting a game.
  // typeof-check in case an ad blocker stops gtag.js from loading — it must not
  // break the rest of the final screen.
  if (typeof gtag === 'function') {
    gtag('event', 'conversion', {
      'send_to': 'AW-18355179202/cZ38COS379ccEMKdt7BE',
      'value': 0.0,
      'currency': 'USD',
    });
  }
  finalScreen.style.display = 'block';
  if (typeof window._setPlaying === 'function') window._setPlaying(false);
  // Local mirror ALWAYS (with or without an account): if the server save fails
  // (offline), the profile must not show 0 — it falls back to this.
  localStorage.setItem('playCount', String(parseInt(localStorage.getItem('playCount') || '0', 10) + 1));
  const backWrap = document.getElementById('final-confirm-back-wrap');
  if (backWrap) {
    backWrap.classList.remove('visible');
    clearTimeout(finalBackTimeout);
    finalBackTimeout = setTimeout(() => backWrap.classList.add('visible'), 3000);
  }
  const cs = (window.campaign && window.campaign.scores) ? window.campaign.scores : {};
  const hs1  = (cs.flags     != null) ? cs.flags     : (parseInt(localStorage.getItem('flagsHighscore'))         || 0);
  const hs2  = (cs.shapes    != null) ? cs.shapes    : (parseInt(localStorage.getItem('shapesHighscore'))        || 0);
  const hs3  = (cs.game      != null) ? cs.game      : (parseInt(localStorage.getItem('geochallenge_highscore')) || 0);
  const hs4  = (cs.monuments != null) ? cs.monuments : (parseInt(localStorage.getItem('monumentsHighscore'))     || 0);
  // Accumulate for per-mode averages (second loading column) — local mirror
  // always, same reason as playCount above.
  [['flags', hs1], ['shapes', hs2], ['game', hs3], ['monuments', hs4]].forEach(([k, v]) => {
    localStorage.setItem('avgSum_' + k,   String(parseInt(localStorage.getItem('avgSum_' + k)   || '0', 10) + v));
    localStorage.setItem('avgCount_' + k, String(parseInt(localStorage.getItem('avgCount_' + k) || '0', 10) + 1));
  });
  const total = hs1 + hs2 + hs3 + hs4;
  // Preload the position in the real ranking as soon as the final screen shows
  // (not when the popup opens): so by the time the player taps "back" — usually
  // a few seconds later because of the animations — the data is ready and the
  // popup doesn't open with a blank message waiting on the Supabase query.
  if (!window._accountLoggedIn) _guestRankPromise = _guestRankPosition(total);
  const rank  = typeof getRank === 'function' ? getRank(total) : null;
  const label = document.getElementById('final-rank-label');
  if (label && rank) { label.textContent = rank.name; fitRankLabel('final-rank-label', 52.7); }
  const scoreEl = document.getElementById('final-points-score');
  if (scoreEl) scoreEl.textContent = total.toLocaleString();
  const playerName = localStorage.getItem('playerName') || 'John';
  const profilePhoto = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
  const avatarImg = document.querySelector('.final-avatar-img');
  if (avatarImg) avatarImg.src = profilePhoto;
  const nameEl = document.getElementById('final-player-name');
  if (nameEl) {
    nameEl.textContent = playerName;
    nameEl.style.fontSize = '';
    requestAnimationFrame(() => {
      const avatarEl = document.querySelector('.final-avatar');
      if (!avatarEl) return;
      const group  = document.getElementById('final-group');
      const groupW = group ? group.offsetWidth : (window.STAGE_W || window.innerWidth);
      const maxNameW = groupW * 0.52;
      let fs = parseFloat(getComputedStyle(nameEl).fontSize);
      while (nameEl.scrollWidth > maxNameW && fs > 8) {
        fs -= 0.5;
        nameEl.style.fontSize = fs + 'px';
      }
      const avatarRect = avatarEl.getBoundingClientRect();
      const nameRect   = nameEl.getBoundingClientRect();
      const GAP = 36; // px gap between photo and name
      const overlap = avatarRect.right - nameRect.left + GAP;
      if (overlap > 0) {
        const pct = overlap / groupW * 100;
        const cur = parseFloat(getComputedStyle(avatarEl).left) / groupW * 100;
        avatarEl.style.left = Math.max(10, cur - pct) + '%';
      }
    });
  }

  const friends = (window._accountLoggedIn && typeof getFriends === 'function') ? getFriends() : [];
  const ranking = [...friends, { name: playerName, score: total }]
    .sort((a, b) => b.score - a.score);
  const pos = ranking.findIndex(p => p.name === playerName && p.score === total) + 1;
  const posEl = document.getElementById('final-position');
  if (posEl) posEl.textContent = pos;

  _finalRanking = ranking;
  _finalPos     = pos;
  _finalTotal   = total;
  window.removeEventListener('resize', _onFinalResize);
  window.addEventListener('resize', _onFinalResize);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', _onFinalResize);
    window.visualViewport.addEventListener('resize', _onFinalResize);
  }

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (typeof window.letterboxRefresh === 'function') {
      window.letterboxRefresh();
      getComputedStyle(document.documentElement).getPropertyValue('--app-fit');
    }
    buildFriendClouds(ranking, pos);
    // iOS: visualViewport can be stale on the first render. A second refresh at
    // 300ms ensures the viewport has stabilized.
    setTimeout(() => {
      if (finalScreen.style.display === 'none') return;
      if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
      buildFriendClouds(ranking, pos);
    }, 300);
  }));
}

// Generates one cloud5 per position on a 2:1 diagonal, leaving a gap at my spot.
// The trail enters from the right and stops when my gap reaches the center.
function buildFriendClouds(ranking, playerPos) {
  const container = document.getElementById('final-clouds5');
  if (!container) return;
  container.innerHTML = '';
  const CQW = window.STAGE_W / 100; // 1cqw in px (19.2 in the 1920 design)
  const STEP_X = 22 * CQW;  // px per position
  const STEP_Y = -11 * CQW; // px per position (2:1)
  const playerName = localStorage.getItem('playerName') || 'John';

  // Window of 10 positions (me included as a gap): 4 above + me + 5 below.
  // At the edges it shifts to keep 10 (if there are enough).
  const WINDOW = 10;
  const fullN = ranking.length;
  let start = playerPos - Math.floor((WINDOW - 1) / 2); // 4 above
  let end   = start + WINDOW - 1;
  if (start < 1)      { end += (1 - start);     start = 1; }
  if (end > fullN)    { start -= (end - fullN); end = fullN; }
  if (start < 1)      start = 1;
  const windowed = ranking.slice(start - 1, end); // still sorted desc
  const N = windowed.length;                       // <= 10
  const localPlayerPos = playerPos - start + 1;    // my spot within the window

  for (let i = N - 1; i >= 0; i--) {
    const entry = windowed[i];
    const realPos = start + i; // real position in the full ranking
    // leave a gap at my spot
    if ((i + 1) === localPlayerPos && entry.name === playerName) continue;
    const k = (N - 1) - i; // 0 = lowest
    const rk = typeof getRank === 'function' ? getRank(entry.score) : null;
    const labelId = `final-fc-label-${i}`;

    const group = document.createElement('div');
    group.className = 'final-group5';
    group.style.transform = `translate(${k * STEP_X}px, ${k * STEP_Y}px) scale(0.9)`;

    group.innerHTML =
      `<img class="final-cloud5" src="images/bg/cloud5.png" alt="" draggable="false" oncontextmenu="return false">` +
      `<span class="final2-position">${realPos}</span>` +
      `<span class="final2-player-name">${entry.name}</span>` +
      `<span class="final2-rank-label" id="${labelId}">${rk ? rk.name : ''}</span>` +
      `<div class="final2-avatar"><img class="final2-avatar-img" src="${entry.avatar || 'images/profilepic/ppdefault.png'}" alt="" draggable="false" oncontextmenu="return false"></div>` +
      `<div class="final2-points-wrap">` +
        `<img class="final2-points-img" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="final2-points-score">${entry.score.toLocaleString()}</span>` +
      `</div>`;
    container.appendChild(group);
    fitRankLabel(labelId, 39.5);
    group.dataset.k = k;
    const cloudImg = group.querySelector('.final-cloud5');
    if (cloudImg) {
      const dur = 6 + Math.random() * 5;       // 6–11s
      const delay = -Math.random() * dur;      // start at a random phase
      cloudImg.style.animationDuration = dur.toFixed(2) + 's';
      cloudImg.style.animationDelay = delay.toFixed(2) + 's';
    }
  }

  // my spot from the bottom (0 = lowest), relative to the window
  const playerK = N - localPlayerPos;
  const endX = -(playerK * STEP_X);
  const endY = -(playerK * STEP_Y);
  const startX = endX + 240 * CQW;
  const startY = endY - 120 * CQW;

  // CSS transition instead of the Web Animations API — on iOS the WAAPI puts
  // the element under the compositor before the display:block layout is
  // committed, causing a wrong position. CSS transition + rAF is more reliable:
  // the rAF guarantees the initial transform was painted before the transition
  // is added.
  container.style.transform = `translate(${startX}px, ${startY}px)`;

  const ANIM_DUR   = 7500;
  const ANIM_DELAY = 3000;
  const groups = Array.from(container.querySelectorAll('.final-group5'));
  function easeOutQ(t) { return 1 - (1 - t) * (1 - t); }
  function checkPassMath(ep) {
    groups.forEach(g => {
      if (g.classList.contains('passed')) return;
      const gk = parseInt(g.dataset.k);
      if (isNaN(gk) || gk >= playerK) return;
      const threshold = 1 - (playerK - gk - 0.5) * STEP_X / (240 * CQW);
      if (ep >= threshold) g.classList.add('passed');
    });
  }

  let loopActive = false;
  let loopStart  = null;
  function loop(ts) {
    if (!loopStart) loopStart = ts;
    const f = Math.min(1, (ts - loopStart) / ANIM_DUR);
    checkPassMath(easeOutQ(f));
    if (f < 1 && loopActive) requestAnimationFrame(loop);
    else checkPassMath(1);
  }

  // rAF so iOS commits the initial transform before the transition is added
  requestAnimationFrame(() => {
    const tid = setTimeout(() => {
      container.style.transition = `transform ${ANIM_DUR}ms ease-out`;
      container.style.transform  = `translate(${endX}px, ${endY}px)`;
      container.addEventListener('transitionend', () => {
        container.style.transition = '';
      }, { once: true });
      loopActive = true;
      requestAnimationFrame(loop);
    }, ANIM_DELAY);
    // expose for cleanup if the final is hidden before it finishes
    container._animTid = tid;
  });
}

function hideFinalScreen() {
  finalScreen.style.display = 'none';
  window.removeEventListener('resize', _onFinalResize);
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', _onFinalResize);
  clearTimeout(finalBackTimeout);
  document.getElementById('final-confirm-back-wrap')?.classList.remove('visible');
  const c = document.getElementById('final-clouds5');
  if (c && c._animTid) { clearTimeout(c._animTid); c._animTid = null; }
}

document.getElementById('final-confirm-back-wrap')?.addEventListener('click', () => {
  if (typeof confirmCooldown !== 'undefined' && confirmCooldown) return;
  if (typeof confirmCooldownLock === 'function') confirmCooldownLock();
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  const w = document.getElementById('final-confirm-back-wrap');
  w.classList.add('confirm-pressed');
  setTimeout(() => w.classList.remove('confirm-pressed'), 50);
  if (typeof window.stopResultsMusic === 'function') window.stopResultsMusic();
  hideFinalScreen();
  if (typeof window.startMenuMusic === 'function') window.startMenuMusic();
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen').classList.remove('table-shown');
  document.getElementById('loading-table-group')?.classList.add('table-gone');
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  // Free the just-finished campaign's RAM (backgrounds/characters/ranks/canvas/
  // video). So the app doesn't accumulate memory between sessions and the next
  // game or opening social starts with a low baseline, with no page reload.
  if (typeof window.releaseGameMemory === 'function') window.releaseGameMemory();
  if (!window._accountLoggedIn && localStorage.getItem('hideGuestRankPopup') !== '1') {
    showGuestRankPopup(_finalTotal || 0);
  }
  // Founder popup: only here, back at the menu after finishing a full Gira
  // Mundial (flag set in js/modes/mapgame-misc.js when the campaign closes) —
  // window._sbProfile is already fresh from the results save (see
  // js/results.js). Only unlocks, equips nothing (see showFounderWelcomePopup).
  if (window._pendingFounderPopupCheck) {
    window._pendingFounderPopupCheck = false;
    const p = window._sbProfile;
    if (p && p.is_founder && !p.founder_popup_seen && typeof window.showFounderWelcomePopup === 'function') {
      setTimeout(() => window.showFounderWelcomePopup(), 500);
    }
  }
});
document.getElementById('final-confirm-back-wrap')?.addEventListener('mouseenter', () => { if (typeof playSelect === 'function') playSelect(); });
document.getElementById('final-confirm-back-wrap')?.addEventListener('mouseleave', () => { if (typeof playSelect === 'function') playSelect(); });

// ── Popup: ranking position for guests ──────────────────────────────────────
// Guests don't enter the real ranking (visitor_id isn't a reliable identity),
// so instead they're shown where they'd land + a CTA to create an account.
// Fires every time they return to the menu after finishing a Gira Mundial,
// unless they checked "don't show again".
async function _guestRankPosition(total) {
  if (!window.sb) return null;
  try {
    const { data } = await window.sb.from('profiles')
      .select('hs_flags,hs_shapes,hs_cities,hs_monuments,hs_total')
      .eq('hidden_from_rankings', false);
    if (!data) return null;
    const scores = data.map(p => Math.max(p.hs_total || 0, (p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0)));
    return { pos: scores.filter(s => s > total).length + 1, total: scores.length + 1 };
  } catch (e) { return null; }
}

// Cuts the wait if the request takes too long (no internet, server down, etc.):
// without this a hung fetch would leave the popup waiting indefinitely before it
// could open, since the data is now awaited before showing the bubble.
function _withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function showConnErrorPopup() {
  const popup = document.getElementById('conn-error-popup');
  if (!popup || popup.classList.contains('open')) return; // don't duplicate if already open
  popup.classList.add('open');
}
window.showConnErrorPopup = showConnErrorPopup;
document.getElementById('conn-error-popup-close')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  document.getElementById('conn-error-popup')?.classList.remove('open');
});

// Reusable utility: wraps any Supabase request with the same timeout +
// connection-error bubble the guest popup already uses. Any other part of the
// game that loads something from the server can use it:
//   const data = await window.withConnCheck(window.sb.from(...).select(...), 6000);
//   if (data === null) return; // error bubble already shown, don't continue
// IMPORTANT: in both variants below the setTimeout must be cleared once the race
// ends. If the real request resolves fast (e.g. "user not found" in a few ms)
// but the 6s timer is still alive uncleared, it fires later and shows the error
// bubble anyway — even though it already succeeded. With several clicks in a
// row, those "ghost" timers pile up and the bubble ends up appearing on its
// own, out of nowhere, several times.
const _CONN_TIMEOUT = Symbol('conn-timeout');
window.withConnCheck = function (promise, ms = 6000) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(_CONN_TIMEOUT), ms); });
  return Promise.race([Promise.resolve(promise).catch(() => _CONN_TIMEOUT), timeout])
    .then(result => {
      clearTimeout(timer);
      if (result === _CONN_TIMEOUT) { showConnErrorPopup(); return null; }
      return result;
    });
};

// Variant for flows with legitimate business errors (login: wrong password;
// register: user already exists, etc.) that should NOT be treated as a
// connection failure. Unlike withConnCheck, this does NOT catch the original
// rejection — it only cuts the wait if nobody responded (neither success nor
// error) within `ms`, showing the bubble and returning undefined; the caller's
// .then/.catch keep working as usual for real errors.
window.withConnTimeout = function (promise, ms = 6000) {
  let timer;
  promise.catch(() => {}); // avoids "unhandled rejection" if the original rejects after the timeout
  const timeout = new Promise(resolve => { timer = setTimeout(() => { showConnErrorPopup(); resolve(undefined); }, ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Auto-detection: as soon as the browser loses its connection (native 'offline'
// event, not dependent on something requesting it), the bubble shows on its
// own, without waiting for the player to trigger an internet-needing action.
window.addEventListener('offline', () => showConnErrorPopup());

async function showGuestRankPopup(total) {
  // Await the data BEFORE deciding which popup to open. Uses the preload started
  // in showFinalScreen() if it's ready (the normal case, given the time until
  // "back" is tapped); otherwise fetches it now. With a timeout: if there's no
  // internet or the server doesn't respond in time, it doesn't hang waiting.
  const r = await _withTimeout(_guestRankPromise || _guestRankPosition(total), 6000);
  if (!r) { showConnErrorPopup(); return; }

  const popup = document.getElementById('guest-rank-popup');
  if (!popup) return;
  const titleEl = document.getElementById('guest-rank-popup-title');
  if (titleEl) titleEl.textContent = t('guestPopup.title', { name: localStorage.getItem('playerName') || 'John' });
  const rank = typeof getRank === 'function' ? getRank(total) : null;
  const imgEl = document.getElementById('guest-rank-popup-rankimg');
  if (imgEl && rank) imgEl.src = rank.img;
  const nameEl = document.getElementById('guest-rank-popup-rankname');
  if (nameEl && rank) nameEl.textContent = rank.name;
  const scoreEl = document.getElementById('guest-rank-popup-score');
  if (scoreEl) scoreEl.textContent = total.toLocaleString();
  const msgEl = document.getElementById('guest-rank-popup-msg');
  if (msgEl) msgEl.textContent = t('guestPopup.msg', { pos: r.pos, total: r.total });
  const dontshow = document.getElementById('guest-rank-popup-dontshow');
  if (dontshow) dontshow.checked = false;
  popup.classList.add('open');
}

function hideGuestRankPopup() {
  const popup = document.getElementById('guest-rank-popup');
  if (document.getElementById('guest-rank-popup-dontshow')?.checked) {
    localStorage.setItem('hideGuestRankPopup', '1');
  }
  popup?.classList.remove('open');
}
window.showGuestRankPopup = showGuestRankPopup;

document.getElementById('guest-rank-popup-close')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  hideGuestRankPopup();
});
document.getElementById('guest-rank-popup-register')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  document.getElementById('guest-rank-popup')?.classList.remove('open');
  if (typeof window.openAccountModal === 'function') window.openAccountModal('register');
});
document.getElementById('guest-rank-popup-login')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  document.getElementById('guest-rank-popup')?.classList.remove('open');
  if (typeof window.openAccountModal === 'function') window.openAccountModal('login');
});

document.getElementById('final-confirm-wrap')?.addEventListener('click', () => {
  if (typeof confirmCooldown !== 'undefined' && confirmCooldown) return;
  if (typeof confirmCooldownLock === 'function') confirmCooldownLock();
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  const wrap = document.getElementById('final-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-screen').style.display = 'none';
  if (typeof showResultsScreen === 'function') showResultsScreen();
});
