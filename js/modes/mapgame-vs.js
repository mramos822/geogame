// ============================================================================
// modes/mapgame-vs.js — capa VS/lobby de los modos de mapa (Ciudades y
// Monumentos): buildFriendPlayers (arma la barra de rivales), hooks de VS 1v1
// y de lobby grupal (score del rival, wrong/timesup, desconexión), hardReset
// de cada modo, y el RNG sembrado de Monumentos (monumentsSetSeed).
// Extraído de monuments.js (fase 11). Carga antes que monuments.js; usa
// getFriends (friends.js), y comparte lbElements/positionLeaderboard/state/
// gameAborted... con monuments.js por el scope global (todo en runtime).
// ============================================================================

const LB_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
                    '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a'];
// La barra de amigos ingame se construye desde la capa de datos compartida
// (js/friends.js -> getFriends()), la misma que usan las pantallas results/final.
// friends.js se carga antes que este archivo, así getFriends() ya tiene datos.
function buildFriendPlayers() {
  // En lobby grupal: todos los rivales de la sala
  if (window._lobbyActive && Array.isArray(window._lobbyMembers)) {
    return window._lobbyMembers.map(m => ({
      id: 'lob' + m.id,
      name: m.name,
      score: m.score || 0,
      avatar: m.avatar || '',
      color: '#888',
      initial: (m.name && m.name[0]) ? m.name[0].toUpperCase() : '?',
      cardCode: m.cardCode || '0001',
    }));
  }
  // En VS 1v1 (shapes): solo el rival
  if (window._vsActive && window._vsOpponent) {
    const o = window._vsOpponent;
    return [{
      id: 'vsopp',
      name: o.name,
      score: window._vsOppScore || 0,
      avatar: o.avatar || '',
      color: '#888',
      initial: (o.name && o.name[0]) ? o.name[0].toUpperCase() : '?',
      cardCode: o.cardCode || '0001',
    }];
  }
  const src = (typeof getFriends === 'function') ? getFriends() : [];
  return src.map((f, i) => ({
    id: `friend${i}`,
    name: f.name,
    score: f.score,
    avatar: f.avatar || '',
    color: LB_COLORS[i % LB_COLORS.length],
    initial: (f.name && f.name[0]) ? f.name[0].toUpperCase() : '?',
    cardCode: f.cardCode || '0001',
  }));
}

// ── Hooks VS para modo Cities ─────────────────────────────────────────────────
window.citiesSetVsDisconnected = function(disconnected) {
  const el = typeof lbElements !== 'undefined' ? lbElements['lb-vsopp'] : null;
  if (!el) return;
  el.classList.toggle('is-disconnected', !!disconnected);
};
window.citiesSetVsOpponentScore = function(score) {
  window._vsOppScore = score;
  if (typeof window._lbUpdateEntry === 'function') window._lbUpdateEntry('vsopp', score);
  // Durante el espectador, el leaderboard lo posiciona el renderer de
  // espectador (_renderGroupLeaderboard / citiesSpectatorReposition), NO el
  // positionLeaderboard normal anclado ABAJO — llamarlo acá lo hacía pelear
  // con el de grupo (anclado arriba) y las celdas saltaban de posición (el
  // "se buguea la posición de las celdas al pasar de jugador a espectador"
  // reportado). Ver también el render loop y el resize, ya guardados.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function' && state) positionLeaderboard(state.score, true);
};
window.citiesTriggerOpponentWrong = function() {
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect('vsopp');
};
window.monumentsSetVsOpponentScore = function(score) {
  window._vsOppScore = score;
  if (typeof window._lbUpdateEntry === 'function') window._lbUpdateEntry('vsopp', score);
  // Ver comentario en citiesSetVsOpponentScore — mismo motivo.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function' && state) positionLeaderboard(state.score, true);
};
window.monumentsTriggerOpponentWrong = function() {
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect('vsopp');
};

// ── "Se acabó el tiempo" (timesup) — MISMO sistema que el "wrong", pero
// disparado cuando a un jugador se le termina el tiempo (temblor + cronómetro,
// ver window._applyTimesUpEffect). Cities y Monuments comparten #leaderboard.
window._lbTimesUpEffect = function(id) {
  if (typeof window._applyTimesUpEffect === 'function' && typeof lbElements !== 'undefined') window._applyTimesUpEffect(lbElements['lb-' + id]);
};
window.citiesSetLobbyTimesUpFor = window.monumentsSetLobbyTimesUpFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'player' : ('lob' + uid);
  window._lbTimesUpEffect(key);
};
window.citiesTriggerOpponentTimesUp = window.monumentsTriggerOpponentTimesUp = function() {
  window._lbTimesUpEffect('vsopp');
};

// ── Hooks Lobby para modo Cities ──────────────────────────────────────────────
window.citiesSetLobbyScores = function(members) {
  if (!Array.isArray(members) || typeof window._lbUpdateEntry !== 'function') return;
  members.forEach(m => window._lbUpdateEntry('lob' + m.id, m.score || 0));
  // Ver comentario en citiesSetVsOpponentScore — mismo motivo.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function' && state) positionLeaderboard(state.score, true);
};
window.citiesSetLobbyWrongFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'player' : ('lob' + uid);
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect(key);
};
window.citiesSetLobbyDisconnected = function(uid, disconnected) {
  const el = typeof lbElements !== 'undefined' ? lbElements['lb-lob' + uid] : null;
  if (!el) return;
  el.classList.toggle('is-disconnected', !!disconnected);
};
window.citiesHardReset = function() {
  try { gameAborted = true; } catch(e) {}
  try { pregameAborted = true; clearTimeout(pregameTimeout); pregameTimeout = null; } catch(e) {}
  try { clearTimeout(endGameTimeout1); clearTimeout(endGameTimeout2); } catch(e) {}
  try { clearInterval(timerIntervalId); timerIntervalId = null; } catch(e) {}
  try { if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; } } catch(e) {}
  const _sbt = document.getElementById('speed-bonus-text');
  if (_sbt) _sbt.classList.remove('visible');
  const _tuo = document.getElementById('timeup-overlay');
  if (_tuo) { _tuo.style.display = 'none'; _tuo.classList.remove('timeup-in','timeup-out'); }
};

// ── Monuments lobby hooks (idéntico al patrón de cities) ─────────────────────
let _monumentsSeededRand = null;
function monumentsRand() { return _monumentsSeededRand ? _monumentsSeededRand() : Math.random(); }
window.monumentsSetSeed = function(seed) {
  let s = seed >>> 0; if (!s) s = 1;
  _monumentsSeededRand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
};
window.monumentsClearSeed = function() { _monumentsSeededRand = null; };

window.monumentsHardReset = function() {
  try { gameAborted = true; } catch(e) {}
  try { pregameAborted = true; clearTimeout(pregameTimeout); pregameTimeout = null; } catch(e) {}
  try { clearTimeout(endGameTimeout1); clearTimeout(endGameTimeout2); } catch(e) {}
  try { clearInterval(timerIntervalId); timerIntervalId = null; } catch(e) {}
  try { if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; } } catch(e) {}
  const _sbt = document.getElementById('speed-bonus-text');
  if (_sbt) _sbt.classList.remove('visible');
  const _tuo = document.getElementById('timeup-overlay');
  if (_tuo) { _tuo.style.display = 'none'; _tuo.classList.remove('timeup-in','timeup-out'); }
};

window.monumentsSetLobbyScores = function(members) {
  if (!Array.isArray(members) || typeof window._lbUpdateEntry !== 'function') return;
  members.forEach(m => window._lbUpdateEntry('lob' + m.id, m.score || 0));
  // Ver comentario en citiesSetVsOpponentScore — mismo motivo.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function' && state) positionLeaderboard(state.score, true);
};
window.monumentsSetLobbyWrongFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'player' : ('lob' + uid);
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect(key);
};
window.monumentsSetLobbyDisconnected = function(uid, disconnected) {
  const el = typeof lbElements !== 'undefined' ? lbElements['lb-lob' + uid] : null;
  if (!el) return;
  el.classList.toggle('is-disconnected', !!disconnected);
};
