// ============================================================================
// modes/mapgame-leaderboard.js — ingame friends/rivals bar for the map modes:
// mockPlayers, getTotalHighscore, highscorePlayer, emotes (spawnEmoteBubble),
// initLeaderboard (+ exposes window._lbUpdateEntry/_lbWrongEffect),
// positionLeaderboard, sortLeaderboard.
// MUST load AFTER friends.js (getFriends/onFriendsUpdate/loadFriends) and
// mapgame-vs.js (buildFriendPlayers).
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

let mockPlayers = buildFriendPlayers();

// Global highscore = best campaign total (sum of the 4 modes), stored by
// results.js in localStorage 'totalHighscore'. The bar is universal, so the
// ★ best entry uses that total, not an individual mode's highscore.
function getTotalHighscore() {
  if (window._sbProfile && window._accountLoggedIn) {
    // hs_total, not a sum of each mode's own best game — those can come from
    // 4 different sessions never actually played together as one campaign.
    return window._sbProfile.hs_total || 0;
  }
  return parseInt(localStorage.getItem('totalHighscore') || '0', 10) || 0;
}
const highscorePlayer = { id: 'best', score: getTotalHighscore(), color: '#6a0dad', initial: '★' };

const LB_WINDOW  = 5;
const LB_PIN_ROW = 2;
const LB_GAP     = 4;
let lbElements   = {};

const EMOTE_SRCS = [
  'images/emotes/1.png',
  'images/emotes/2.png',
  'images/emotes/3.png',
  'images/emotes/4.png',
  'images/emotes/5.png',
  'images/emotes/6.png',
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
  // offsetWidth (not getBoundingClientRect): the rect is scaled by the
  // #app-stage transform and, used as layout px, would re-scale (cramped entries).
  return Math.round(panel.offsetWidth * 1.5) + LB_GAP;
}

function initLeaderboard() {
  // #leaderboard is shared with the shapes/etc. spectator — without this guard,
  // any friends-list update (onFriendsUpdate, which fires often while spectating
  // a friend whose score/status changes live) overwrote the card built by
  // shapesSpectatorSetPlayerCard/flagsSpectatorSetPlayerCard with this generic
  // rebuild — which ALWAYS adds a "You" card with the spectator's profile. That
  // was the reported "my card shows up".
  if (window._isSpectating) return;
  const lb = document.getElementById('leaderboard');
  lb.innerHTML = '';
  lb.classList.toggle('vs-active', !!(window._vsActive || window._lobbyActive));
  lbElements = {};
  mockPlayers = buildFriendPlayers(); // refresh; in VS returns rival only
  highscorePlayer.score = getTotalHighscore(); // ★ best = global campaign highscore

  if (!window.practiceConfig || !window.practiceConfig.active) {
    mockPlayers.forEach(p => {
      const el = document.createElement('div');
      el.className = 'lb-entry' + (p.id === 'vsopp' ? ' lb-vsopp' : '');
      el.id = `lb-${p.id}`;
      const avatarHTML = p.avatar
        ? `<div class="lb-avatar lb-avatar-img-wrap"><img class="lb-avatar-img" src="${p.avatar}" onerror="this.parentNode.innerHTML='${p.initial || '?'}';this.parentNode.style.background='${p.color || '#888'}'"></div>`
        : `<div class="lb-avatar" style="background:${p.color}">${p.initial}</div>`;
      el.innerHTML = `<span class="lb-rank rank-other"></span>` + avatarHTML + `<span class="lb-name">${p.name}</span>` + `<span class="lb-score">${p.score.toLocaleString()}</span>`;
      el.style.transition = 'none';
      el.style.top = '-9999px';
      // Every row carries its real cardCode now (see buildFriendPlayers: 1v1 VS
      // rival, each group-lobby rival, AND the real friends in the ingame bar in
      // solo Gira Mundial — the last used to be left out, with the default card
      // regardless of what each friend actually had equipped). applyCard falls
      // back to '0001' if there's no cardCode, so applying it always is safe.
      window.CustomizeAssets?.applyCard(el, p.cardCode || '0001');
      lbElements[el.id] = el;
      lb.appendChild(el);
    });
  }

  // ── Helpers for shapes VS to update shared leaderboard from outside ──────────
  window._lbUpdateEntry = function(id, score) {
    const p = mockPlayers.find(x => x.id === id);
    if (p) p.score = score;
    const el = lbElements['lb-' + id];
    if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = score.toLocaleString(); }
  };
  window._lbWrongEffect = function(id) {
    const el = lbElements['lb-' + id];
    if (!el) return;
    el.style.animation = 'none'; void el.offsetWidth;
    el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
    setTimeout(() => { el.style.animation = ''; }, 820);
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
  };

  const playerEl = document.createElement('div');
  playerEl.className = 'lb-entry lb-player';
  playerEl.id = 'lb-player';
  const _myName = window._sbProfile?.name || localStorage.getItem('playerName') || 'Tú';
  playerEl.innerHTML = `<span class="lb-rank rank-other"></span>`
                     + `<div class="lb-avatar"><img class="lb-avatar-img" src="${localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png'}"></div>`
                     + `<span class="lb-name">${_myName}</span>`
                     + `<span class="lb-score" id="lb-player-score">0</span>`;
  playerEl.style.transition = 'none';
  playerEl.style.top = '-9999px';
  lbElements['lb-player'] = playerEl;
  lb.appendChild(playerEl);
  if (typeof window._applyFounderFrame === 'function') window._applyFounderFrame();

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
  // The bar is universal across the whole campaign: the player competes with the
  // accumulated score (previous modes' base + current mode), not each game's.
  playerScore += (window.campaignBase ? window.campaignBase() : 0);
  const lb   = document.getElementById('leaderboard');
  const rowH = getLbRowHeight();

  lb.style.height = (LB_WINDOW * rowH - LB_GAP) + 'px';

  const all = [...mockPlayers, { id: 'player', score: playerScore }];
  all.sort((a, b) => b.score - a.score);

  const playerRank = all.findIndex(p => p.id === 'player');

  if (animate && lastPlayerRank !== -1 && playerRank < lastPlayerRank && !window._vsActive && !window._lobbyActive) {
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

  const visibleRows  = windowEnd - windowStart;
  const bottomOffset = Math.max(0, LB_WINDOW - visibleRows) * rowH;

  if (!animate) {
    Object.values(lbElements).forEach(el => { el.style.transition = 'none'; });
  }

  all.forEach((p, rank) => {
    const el = lbElements[`lb-${p.id}`];
    if (el) el.style.top = ((rank - windowStart) * rowH + bottomOffset) + 'px';
  });

  // Position number on each row (1st/2nd/…) — same mechanism as
  // flagsPositionLeaderboard. It was missing here, so in cities/monuments/shapes
  // versus/lobby (all use #leaderboard) the live rank number didn't show; it
  // only worked in flags (reported). The CSS #leaderboard.vs-active .lb-rank
  // makes it visible in versus.
  all.forEach((p, rank) => {
    const el = lbElements[`lb-${p.id}`];
    if (!el) return;
    const rankEl = el.querySelector('.lb-rank');
    if (!rankEl) return;
    rankEl.textContent = rank + 1;
    rankEl.className = 'lb-rank ' + (rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : 'rank-other');
  });

  const scoreEl = lbElements['lb-player'].querySelector('.lb-score');
  if (scoreEl) scoreEl.textContent = playerScore.toLocaleString();
}

let lastLbScore = -1;
function sortLeaderboard(playerScore) {
  if (playerScore === lastLbScore) return;
  lastLbScore = playerScore;
  if (window.practiceConfig && window.practiceConfig.active) {
    const sc = playerScore + (window.campaignBase ? window.campaignBase() : 0);
    const scoreEl = lbElements['lb-player']?.querySelector('.lb-score');
    if (scoreEl) scoreEl.textContent = sc.toLocaleString();
    return;
  }
  positionLeaderboard(playerScore, true);
}

initLeaderboard();
// When the data layer refreshes the list (e.g. real friends arriving from the
// server via loadFriends), rebuild the bar automatically.
// Guard: during an in-progress Gira Mundial, a network event (a friend's
// status/score changing live) can arrive at ANY time, even mid mode-transition
// — and this rebuild tears down the WHOLE bar and rebuilds it (images/Founder
// cards included), piling on work right where the mode switch already adds
// load. Live precision isn't needed there: each mode calls initLeaderboard()
// itself on start, so it's enough to skip the reactive rebuild while the
// campaign is active and let the next mode refresh it.
if (typeof onFriendsUpdate === 'function') onFriendsUpdate(() => {
  if (window.campaign && window.campaign.active) return;
  initLeaderboard();
});
if (typeof loadFriends === 'function') loadFriends();
