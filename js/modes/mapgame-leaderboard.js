// ============================================================================
// modes/mapgame-leaderboard.js — barra de amigos/rivales ingame de los modos de
// mapa (Ciudades y Monumentos): mockPlayers, getTotalHighscore, highscorePlayer,
// emotes (spawnEmoteBubble), initLeaderboard (arma la barra + expone
// window._lbUpdateEntry/_lbWrongEffect), positionLeaderboard, sortLeaderboard.
// Extraído de monuments.js (fase 14). DEBE cargar DESPUÉS de friends.js
// (getFriends/onFriendsUpdate/loadFriends — se llaman en parse) y de mapgame-vs.js
// (buildFriendPlayers), antes de monuments.js.
// ============================================================================

let mockPlayers = buildFriendPlayers();

// Highscore global = mejor total de campaña (suma de los 4 modos), guardado por
// results.js en localStorage 'totalHighscore'. La barra es universal, así que la
// entrada ★ best usa ese total, no el highscore de un modo individual.
function getTotalHighscore() {
  if (window._sbProfile && window._accountLoggedIn) {
    const p = window._sbProfile;
    return (p.hs_flags||0) + (p.hs_shapes||0) + (p.hs_cities||0) + (p.hs_monuments||0);
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
  // offsetWidth (no getBoundingClientRect): el rect viene escalado por el transform
  // del #app-stage y, al usarse como px de layout, se re-escalaría (entradas apretadas).
  return Math.round(panel.offsetWidth * 1.5) + LB_GAP;
}

function initLeaderboard() {
  // #leaderboard es compartido con el espectador de siluetas/etc. — sin este
  // guard, cualquier actualización de la lista de amigos (onFriendsUpdate,
  // que dispara seguido mientras se espeta a un amigo cuyo score/estado
  // cambia en vivo) pisaba la tarjeta armada por
  // shapesSpectatorSetPlayerCard/flagsSpectatorSetPlayerCard con esta
  // reconstrucción genérica — que SIEMPRE agrega una tarjeta "Tú" con el
  // perfil del espectador. Ese era el "sale mi cartilla" reportado.
  if (window._isSpectating) return;
  const lb = document.getElementById('leaderboard');
  lb.innerHTML = '';
  lb.classList.toggle('vs-active', !!(window._vsActive || window._lobbyActive));
  lbElements = {};
  mockPlayers = buildFriendPlayers(); // refrescar; en VS devuelve solo al rival
  highscorePlayer.score = getTotalHighscore(); // ★ best = highscore global de campaña

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
      // Todas las filas traen su cardCode real ahora (ver buildFriendPlayers:
      // rival de VS 1v1, cada rival de lobby grupal, Y los amigos reales de
      // la barra ingame en Gira Mundial solo — antes esto último se
      // quedaba afuera, con la carta default sin importar qué tuviera
      // equipado de verdad cada amigo). applyCard ya cae a '0001' si no hay
      // cardCode, así que aplicarlo siempre es seguro.
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
  // La barra es universal para toda la campaña: el jugador compite con el puntaje
  // acumulado (base de modos previos + modo actual), no con el de cada juego.
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

  // Número de posición en cada fila (1°/2°/…) — mismo mecanismo que
  // flagsPositionLeaderboard. Faltaba acá, así que en versus/lobby de
  // cities/monuments/shapes (todos usan #leaderboard) el número de puesto en
  // vivo no aparecía; solo funcionaba en banderas (reportado). El CSS
  // #leaderboard.vs-active .lb-rank lo hace visible en versus.
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
// Cuando la capa de datos refresque la lista (p.ej. al llegar amigos reales del
// servidor vía loadFriends), reconstruir la barra automáticamente.
// Guard: durante una Vuelta Mundial en curso, un evento de red (status/score
// de un amigo cambiando en tiempo real) puede llegar en CUALQUIER momento,
// incluso justo en medio de una transición entre modos — y esta reconstrucción
// tira TODA la barra y la vuelve a armar (imágenes/tarjetas Founder incluidas),
// sumando trabajo de golpe justo donde ya hay más carga por el cambio de modo.
// No hace falta precisión en vivo ahí: cada modo ya llama a initLeaderboard()
// por su cuenta al arrancar, así que alcanza con saltear el rebuild reactivo
// mientras la campaña está activa y dejar que el próximo modo la refresque.
if (typeof onFriendsUpdate === 'function') onFriendsUpdate(() => {
  if (window.campaign && window.campaign.active) return;
  initLeaderboard();
});
if (typeof loadFriends === 'function') loadFriends();
