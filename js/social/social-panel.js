// ============================================================================
// social/social-panel.js — Panel Social del loading: lista de amigos y sus estados, pestañas
// Amigos/Solicitudes, perfil de un amigo, botones de relación (fav / agregar /
// aceptar / eliminar / bloquear), tableros de Bloqueados y Enviadas, buscador/orden,
// panel Añadir Amigo, notificación banner de solicitud.
// Carga tras i18n-data.js (usa onLangChange al registrar).
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

document.getElementById('loading-social-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-social-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-social-group')?.classList.add('table-gone');
  document.getElementById('loading-screen').classList.remove('table-shown');
  _updateSocialBadge();
});

// ── Lista de amigos del panel social ─────────────────────────────────────────

let socialActiveTab = 'friends';
let socialSort = localStorage.getItem('socialSort') || 'conn';

// Cache de datos sociales cargado desde Supabase
let socialData = { friends: [], requests: [], sent: [], blocked: [], blockedMe: [] };

// Respaldo local (ver loadSocialData): si el pedido al servidor falla, se usa
// lo último guardado acá en vez de dejar el panel de amigos vacío.
function _loadCachedSocialData() {
  try { return JSON.parse(localStorage.getItem('cachedSocialData') || 'null'); } catch (e) { return null; }
}

// Favoritos persistidos en localStorage por user ID
function getSocialFavs() {
  try { return new Set(JSON.parse(localStorage.getItem('socialFavs') || '[]')); } catch { return new Set(); }
}
function saveSocialFavs(set) { localStorage.setItem('socialFavs', JSON.stringify([...set])); }

// El amigo cuyo perfil está abierto
let currentFriendProfile = null;

function relStatus(f) {
  if (!f) return 'none';
  const id = f.id;
  if (socialData.blocked.some(b => b.id === id))  return 'blocked';
  if (socialData.friends.some(x => x.id === id))  return 'friend';
  if (socialData.requests.some(r => r.id === id)) return 'request';
  if (socialData.sent.some(s => s.id === id))     return 'sent';
  return 'none';
}

function getStatusObj(f) {
  if (!f || !f.last_active) return { cls: 'offline', minsAgo: 9999 };
  const secsAgo = (Date.now() - new Date(f.last_active)) / 1000;
  if (secsAgo > 120) return { cls: 'offline', minsAgo: secsAgo / 60 };
  if (f.is_playing) return { cls: 'playing', minsAgo: 0 };
  return { cls: 'online', minsAgo: 0 };
}

function socialStatusText(f) {
  if (!f || !f.last_active) return t('social.offline') || 'Sin conexión';
  const secsAgo  = (Date.now() - new Date(f.last_active)) / 1000;
  const minsAgo  = secsAgo / 60;
  const hoursAgo = minsAgo / 60;
  const daysAgo  = hoursAgo / 24;
  const monthsAgo = daysAgo / 30.5;
  const yearsAgo  = daysAgo / 365;
  // is_playing usa la misma ventana de 120s que getStatusObj (no los 20s de
  // "online" de acá abajo) — sin esto, un jugador inactivo un rato en plena
  // partida (sin tocar nada 20-120s) seguía con la celda titilando en verde
  // (getStatusObj todavía lo clasifica "playing") pero el texto ya cambiaba
  // a "Hace 1 minuto" en vez de "Jugando", pese a seguir jugando de verdad.
  if (f.is_playing && secsAgo <= 120) return t('social.playing') || 'Jugando';
  if (secsAgo <= 20) return t('social.online') || 'En línea';
  let n, unit;
  if (yearsAgo >= 1)       { n = Math.round(yearsAgo);  unit = t(n === 1 ? 'social.unitYear'  : 'social.unitYears');  }
  else if (monthsAgo >= 1) { n = Math.round(monthsAgo); unit = t(n === 1 ? 'social.unitMonth' : 'social.unitMonths'); }
  else if (daysAgo >= 1)   { n = Math.round(daysAgo);   unit = t(n === 1 ? 'social.unitDay'   : 'social.unitDays');   }
  else if (hoursAgo >= 1)  { n = Math.round(hoursAgo);  unit = t(n === 1 ? 'social.unitHour'  : 'social.unitHours');  }
  else                     { n = Math.max(1, Math.round(minsAgo)); unit = t(n === 1 ? 'social.unitMin' : 'social.unitMins'); }
  return t('social.ago', { n, unit });
}

function updateSocialTabCounts() {
  const friendsTab  = document.getElementById('loading-social-tab-friends');
  const requestsTab = document.getElementById('loading-social-tab-requests');
  if (friendsTab)  friendsTab.textContent = `${t('social.tab.friends')} (${socialData.friends.length})`;
  if (requestsTab) requestsTab.textContent = `${t('social.tab.requests')} (${socialData.requests.length})`;
  _updateSocialBadge();
}

function _updateSocialBadge() {
  const badge = document.getElementById('social-notif-badge');
  if (!badge) return;
  const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
  const hasRequests = socialData.requests.length > 0;
  if (hasRequests && !panelOpen) {
    if (badge.style.display === 'none') {
      badge.style.display = 'flex';
      // re-trigger animation on each new appearance
      badge.style.animation = 'none';
      void badge.offsetWidth;
      badge.style.animation = '';
    }
  } else {
    badge.style.display = 'none';
  }

  // Detectar solicitudes nuevas y mostrar notificación banner (solo si panel cerrado)
  const currentIds = new Set(socialData.requests.map(r => r.friendshipId));
  if (_knownRequestIds !== null && panelOpen === false) {
    const newReqs = socialData.requests.filter(r => !_knownRequestIds.has(r.friendshipId));
    if (newReqs.length > 0) {
      _showFriendRequestNotif(newReqs[newReqs.length - 1]);
    }
  }
  _knownRequestIds = currentIds;
}

const _FREQ_NOTIF_MS = 10000;
let _freqNotifTimer   = null;
let _freqNotifReqId   = null;
let _freqNotifAcceptCb = null;
let _freqNotifDeclineCb = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('friend-req-notif-accept')?.addEventListener('click', () => {
    if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    const cb = _freqNotifAcceptCb;
    _dismissFriendRequestNotif();
    if (cb) cb();
  });
  document.getElementById('friend-req-notif-decline')?.addEventListener('click', () => {
    if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    const cb = _freqNotifDeclineCb;
    _dismissFriendRequestNotif();
    if (cb) cb();
  });
});

function _showFriendRequestNotif(req) {
  const banner = document.getElementById('friend-req-notif');
  const bar    = document.getElementById('friend-req-notif-bar');
  const nameEl = document.getElementById('friend-req-notif-name');
  const subEl  = document.getElementById('friend-req-notif-sub');
  if (!banner) return;

  _freqNotifReqId = req.friendshipId;

  const capturedFriendshipId = req.friendshipId;
  _freqNotifAcceptCb = async () => {
    try {
      await window.sbAcceptRequest(capturedFriendshipId);
      loadSocialData(false);
    } catch (e) { console.warn('[friendReqNotif] accept error:', e); }
  };
  _freqNotifDeclineCb = async () => {
    try {
      await window.sbDeleteFriendship(capturedFriendshipId);
      loadSocialData(false);
    } catch (e) { console.warn('[friendReqNotif] decline error:', e); }
  };

  if (nameEl) nameEl.textContent = req.name || '?';
  if (subEl)  subEl.textContent  = typeof t === 'function'
    ? t('social.sentYouRequest', 'te envió una solicitud de amistad')
    : 'te envió una solicitud de amistad';

  banner.style.display = 'block';
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }

  if (bar) {
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = 'width ' + _FREQ_NOTIF_MS + 'ms linear';
    bar.style.width = '0%';
  }

  clearTimeout(_freqNotifTimer);
  _freqNotifTimer = setTimeout(() => { _dismissFriendRequestNotif(); }, _FREQ_NOTIF_MS);
}

function _dismissFriendRequestNotif() {
  const banner = document.getElementById('friend-req-notif');
  if (banner) {
    banner.classList.add('leaving');
    setTimeout(() => { banner.style.display = 'none'; banner.classList.remove('leaving'); }, 300);
  }
  clearTimeout(_freqNotifTimer);
  _freqNotifReqId    = null;
  _freqNotifAcceptCb = null;
  _freqNotifDeclineCb = null;
}

// Carga todos los datos sociales desde Supabase y re-renderiza.
async function loadSocialData(showLoader = true) {
  if (!window._accountLoggedIn || !window._sbUserId) {
    socialData = { friends: [], requests: [], sent: [], blocked: [], blockedMe: [] };
    _knownRequestIds = null;
    renderSocial(); updateSocialTabCounts(); return;
  }
  if (showLoader) {
    const list = document.getElementById('loading-social-list');
    if (list) list.innerHTML = `<div class="loading-social-empty">${t('social.loadingUsers')}</div>`;
  }
  try {
    const _social = typeof window.withConnCheck === 'function'
      ? await window.withConnCheck(window.sbLoadSocialData(window._sbUserId), 6000)
      : await window.sbLoadSocialData(window._sbUserId);
    if (!_social) {
      // Sin conexión (viñeta de error ya mostrada): caer al último dato
      // guardado localmente en vez de dejar el panel vacío.
      const cached = _loadCachedSocialData();
      if (cached) socialData = cached;
      renderSocial(); updateSocialTabCounts(); return;
    }
    socialData = _social;
    try { localStorage.setItem('cachedSocialData', JSON.stringify(socialData)); } catch (e) {}
    if (typeof window.Friends !== 'undefined') {
      // Conservar id/last_active/is_playing: los paneles de invitar usan getFriends()
      // y necesitan el estado en vivo (conectado/jugando), igual que el panel social.
      // OJO: hay que llevar TAMBIÉN frameCode/cardCode/cellCode/panelCode y los
      // campos gq_* — si no, este _setCache (que corre en cada loadSocialData,
      // bastante seguido por el poll) pisa el caché más completo que arma
      // loadFriends() en friends.js y los deja undefined. Sin esto, la barra
      // de amigos in-game de GlobeQuiz (buildGqFriendRows) nunca encontraba a
      // ningún amigo con racha de hoy aunque sí la tuviera en el server.
      window.Friends._setCache(socialData.friends.map(f => ({
        id: f.id, name: f.name, score: f.score, avatar: f.avatar || '',
        last_active: f.last_active || null, is_playing: f.is_playing || false,
        is_practicing: f.is_practicing || false,
        frameCode: f.frameCode || '0001', cardCode: f.cardCode || '0001',
        cellCode: f.cellCode || '0001', panelCode: f.panelCode || '0001',
        gqStreakCount: f.gqStreakCount || 0,
        gqStreakLastDate: f.gqStreakLastDate || null,
        gqTodayTimeMs: (typeof f.gqTodayTimeMs === 'number') ? f.gqTodayTimeMs : null,
      })));
    }
  } catch (e) {
    console.warn('[social] error cargando:', e.message);
  }
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
  updateSocialTabCounts();
  if (!document.getElementById('loading-blocked-group')?.classList.contains('table-gone')) renderBlockedList();
  if (!document.getElementById('loading-sent-group')?.classList.contains('table-gone'))    renderSentList();
  _subscribeFriendStatuses(socialData.friends.map(f => f.id));
  _startSocialListPoll();
  // Si el panel de detalle de amigo está abierto, sincronizar friendshipId y botones
  if (currentFriendProfile) {
    const all = [...socialData.friends, ...socialData.requests, ...socialData.sent, ...socialData.blocked];
    const fresh = all.find(x => x.id === currentFriendProfile.id);
    if (fresh) currentFriendProfile.friendshipId = fresh.friendshipId;
    if (typeof updateFriendButtons === 'function') updateFriendButtons();
  }
  window._socialDataFetched = true;
}

// Pinta la pestaña activa.
function renderSocial(filter = '') {
  if (socialActiveTab === 'requests') renderSocialRequests(filter);
  else renderSocialFriends(filter);
}

function renderSocialRequests(filter = '') {
  const list = document.getElementById('loading-social-list');
  if (!list) return;
  updateSocialTabCounts();
  const reqs = socialData.requests.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML = '';
  if (reqs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = t('social.noData');
    list.appendChild(empty);
    return;
  }
  reqs.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'loading-social-row loading-social-request' + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(f.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = f.id;
    row.style.setProperty('--cust-cell', `url('${window.CustomizeAssets.cellUrl(f.cellCode)}')`);
    row.innerHTML =
      window._socialAvatarHtml(f.avatar, f.frameCode) +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${f.name}</span>` +
        `<span class="loading-social-status">${t('social.sentYouRequest')}</span>` +
      `</div>` +
      `<div class="loading-social-req-actions">` +
        `<button class="loading-social-req-btn accept" type="button" aria-label="Aceptar">✓</button>` +
        `<button class="loading-social-req-btn reject" type="button" aria-label="Rechazar">✕</button>` +
      `</div>`;
    row.querySelector('.accept').addEventListener('click', (e) => { e.stopPropagation(); respondRequest(f, true); });
    row.querySelector('.reject').addEventListener('click', (e) => { e.stopPropagation(); respondRequest(f, false); });
    row.addEventListener('click', () => openFriendProfile(f));
    list.appendChild(row);
  });
}

function respondRequest(friend, accepted) {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const op = accepted
    ? window.sbAcceptRequest(friend.friendshipId)
    : window.sbDeleteFriendship(friend.friendshipId);
  op.then(() => loadSocialData(false)).catch(e => console.warn('[social] respondRequest:', e));
}

// Click en el ojo de un amigo "Jugando": busca su match versus activo y, si es
// de un modo soportado (flags/shapes en v1), abre el panel de espectador. La
// policy RLS "matches_select_friends" es la que realmente decide si puedo leer
// esa fila — si no somos amigos aceptados, el select no devuelve nada.
// Ninguna partida versus (flags/shapes, rondas cortas con timer propio) tiene
// sentido seguir "active" más de esto — si el cierre normal (fin de partida /
// abandono de un jugador) no llegó a marcarla como tal (pestaña cerrada de
// golpe, crash, corte de red), quedaba "active" en la base PARA SIEMPRE. Como
// openSpectatorForFriend() siempre revisa esto ANTES de ir al espectador de
// partida individual, una fila así de vieja bloqueaba para siempre poder
// espectar a esa persona en modo solo — se quedaba colgado intentando abrir
// una partida versus fantasma que nadie está jugando.
const STALE_MATCH_MS = 20 * 60 * 1000; // 20 minutos

async function openSpectatorForFriend(f) {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  try {
    const { data, error } = await window.sb
      .from('matches')
      .select('id, mode, status, created_at')
      .or(`host_id.eq.${f.id},guest_id.eq.${f.id}`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const isStale = data && (Date.now() - new Date(data.created_at).getTime()) > STALE_MATCH_MS;
    if (data && isStale) {
      // Autolimpieza: la primera persona que se topa con esto la corrige para
      // siempre (no hace falta arreglarla a mano en la base cada vez) — no se
      // espera la respuesta, no debe demorar el intento de espectar.
      window.sb.from('matches').update({ status: 'abandoned' }).eq('id', data.id).then(() => {}, () => {});
    }
    if (data && !isStale) {
      // Está en una partida VERSUS — los 4 modos ya tienen UI real de
      // espectador (REAL_UI_MODES los cubre a todos desde que se integró
      // Monuments), así que ya no hace falta filtrar por modo acá.
      if (typeof window.openSpectator === 'function') window.openSpectator(data.id, f);
      return;
    }
    // Sin match 1v1 activo — ¿está en un duelo GRUPAL (lobby de hasta 10)?
    // Requiere la policy "lobby_members_select_friends"/"lobbies_select_friends"
    // (ver supabase/group_spectator_mode.sql) para poder leerlo desde afuera.
    const { data: lobbyRows } = await window.sb
      .from('lobby_members')
      .select('lobby_id, l:lobby_id(id, status, created_at)')
      .eq('user_id', f.id)
      .limit(5);
    const activeLobby = (lobbyRows || []).map(r => r.l).find(l => l && l.status === 'active');
    if (activeLobby) {
      if (typeof window.openSpectatorGroup === 'function') window.openSpectatorGroup(activeLobby.id, f);
      return;
    }
    // Sin duelo grupal tampoco pero está "Jugando" → asumimos partida
    // individual (Gira Mundial/modo solo) y nos unimos directo a su canal
    // 'solo-{id}'.
    if (typeof window.openSpectatorSolo === 'function') window.openSpectatorSolo(f.id, f);
  } catch (e) {
    window.showGlobalToast('No se pudo abrir la partida.');
  }
}

function renderSocialFriends(filter = '') {
  const list = document.getElementById('loading-social-list');
  if (!list) return;
  updateSocialTabCounts();
  const favs = getSocialFavs();
  const sortFns = {
    conn:        (a, b) => getStatusObj(a.f).minsAgo - getStatusObj(b.f).minsAgo,
    'score-desc':(a, b) => b.f.score - a.f.score,
    'score-asc': (a, b) => a.f.score - b.f.score,
    'name-asc':  (a, b) => a.f.name.localeCompare(b.f.name),
    'name-desc': (a, b) => b.f.name.localeCompare(a.f.name),
  };
  const baseSort = sortFns[socialSort] || sortFns.conn;
  const friends = socialData.friends
    .filter(f => f.name.toLowerCase().includes(filter.toLowerCase()))
    .filter(f => !socialData.blocked.some(b => b.id === f.id))
    .map(f => ({ f }))
    .sort((a, b) => {
      const fa = favs.has(a.f.id) ? 0 : 1;
      const fb = favs.has(b.f.id) ? 0 : 1;
      return (fa - fb) || baseSort(a, b);
    });
  list.innerHTML = '';
  if (friends.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = t('social.noData');
    list.appendChild(empty);
    return;
  }
  friends.forEach(({ f }) => {
    const fav = favs.has(f.id);
    const st = getStatusObj(f);
    const row = document.createElement('div');
    row.className = 'loading-social-row status-' + st.cls + (fav ? ' is-fav' : '') + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(f.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = f.id;
    window.CustomizeAssets.applyCellForStatus(row, f.cellCode, st.cls);
    row.innerHTML =
      window._socialAvatarHtml(f.avatar, f.frameCode) +
      `<div class="loading-social-info">` +
        `<div class="loading-social-name-row">` +
          `<span class="loading-social-name">${fav ? '★ ' : ''}${f.name}</span>` +
        `</div>` +
        `<span class="loading-social-status"><span class="dot ${st.cls}"></span>${socialStatusText(f)}</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        (st.cls === 'playing' && !f.is_practicing ? `<img class="social-spectate-eye" src="images/spectate.png" alt="" draggable="false" oncontextmenu="return false" title="Ver partida">` : '') +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${f.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(f.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(f.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(f));
    const eyeBtn = row.querySelector('.social-spectate-eye');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', (e) => { e.stopPropagation(); openSpectatorForFriend(f); });
    }
    list.appendChild(row);
  });

  // Bloqueados al fondo
  socialData.blocked
    .filter(b => b.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach((b) => {
      const row = document.createElement('div');
      row.className = 'loading-social-row status-offline is-blocked-row';
      row.innerHTML =
        window._socialAvatarHtml(b.avatar, b.frameCode) +
        `<div class="loading-social-info">` +
          `<span class="loading-social-name">${b.name}</span>` +
          `<span class="loading-social-status">${t('social.blockedStatus')}</span>` +
        `</div>` +
        `<div class="loading-social-score">` +
          `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
          `<span class="loading-social-score-val">${b.score.toLocaleString()}</span>` +
        `</div>` +
        `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(b.score).name : '')}</span>` +
        `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(b.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
      row.addEventListener('click', () => openFriendProfile(b));
      list.appendChild(row);
    });
}

let _friendStatusInterval = null;

function _applyFriendPanelStatus(f) {
  const fg = document.getElementById('loading-friend-group');
  if (!fg || fg.classList.contains('table-gone')) return;
  const isOffline = getStatusObj(f).cls === 'offline';
  fg.classList.toggle('is-offline', isOffline);
  const statusEl = document.getElementById('loading-friend-status');
  if (statusEl && relStatus(f) === 'friend') {
    statusEl.textContent = socialStatusText(f);
    statusEl.className = 'loading-friend-status ' + getStatusObj(f).cls;
  }
}

function _startFriendStatusPoll(friendId) {
  clearInterval(_friendStatusInterval);
  _friendStatusInterval = setInterval(async () => {
    const fg = document.getElementById('loading-friend-group');
    if (!fg || fg.classList.contains('table-gone')) { clearInterval(_friendStatusInterval); return; }
    try {
      const { data } = await window.sb.from('profiles')
        .select('last_active,is_playing').eq('id', friendId).single();
      if (!data || !currentFriendProfile) return;
      currentFriendProfile.last_active = data.last_active;
      currentFriendProfile.is_playing  = data.is_playing;
      _applyFriendPanelStatus(currentFriendProfile);
    } catch(e) {}
  }, 10000);
}

// Abre el perfil de amigo con datos reales de Supabase.
function openFriendProfile(friend) {
  if (socialData.blockedMe.some(b => b.id === friend.id)) {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    currentFriendProfile = friend;
    _clearFriendPanel();
    const friendGroup = document.getElementById('loading-friend-group');
    if (friendGroup) friendGroup.classList.remove('table-gone');
    _showFriendPanelError(true);
    return;
  }
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  currentFriendProfile = friend;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // Racha de GloboReto del amigo — no viene en los selects de la lista de
  // amigos/rankings (son parciales), así que se pide aparte, chiquito.
  if (window.sb && friend.id) {
    window.sb.from('profiles').select('gq_streak_count,gq_streak_last_date').eq('id', friend.id).single()
      .then(({ data }) => {
        if (typeof window.gqRefreshFriendStreakBadge === 'function') window.gqRefreshFriendStreakBadge(data);
      }).catch(() => {
        if (typeof window.gqRefreshFriendStreakBadge === 'function') window.gqRefreshFriendStreakBadge(null);
      });
  } else if (typeof window.gqRefreshFriendStreakBadge === 'function') {
    window.gqRefreshFriendStreakBadge(null);
  }

  const pic = document.getElementById('loading-friend-pic');
  if (pic) pic.src = friend.avatar;
  window.CustomizeAssets?.applyFrame(document.getElementById('loading-friend-pic-wrap'), friend.frameCode || '0001');
  const friendPanelImg = document.querySelector('#loading-friend-group .loading-howtotable');
  if (friendPanelImg) friendPanelImg.src = window.CustomizeAssets?.panelUrl(friend.panelCode || '0001');
  const fBadge = document.getElementById('loading-friend-supporter-badge');
  if (fBadge) fBadge.style.display = friend.is_supporter ? '' : 'none';
  setText('loading-friend-name', friend.name);
  setText('loading-friend-total', friend.score.toLocaleString());
  setText('loading-friend-play-count', tn('profile.friendPlayed', friend.play_count || 0));
  const fvsEl = document.getElementById('loading-friend-vs-record');
  if (fvsEl) {
    const fw = friend.vs_wins || 0, fl = friend.vs_losses || 0;
    if (fw > 0 || fl > 0) {
      fvsEl.style.display = '';
      fvsEl.innerHTML = t('profile.vsRecord', { w: `<span class="vs-w">${fw}</span>`, l: `<span class="vs-l">${fl}</span>` });
    } else {
      fvsEl.style.display = 'none';
    }
  }

  const modeHs  = [friend.hs_flags||0, friend.hs_shapes||0, friend.hs_cities||0, friend.hs_monuments||0];
  const avgSums  = [friend.avg_sum_flags||0, friend.avg_sum_shapes||0, friend.avg_sum_cities||0, friend.avg_sum_monuments||0];
  const avgCounts= [friend.play_count_flags||0, friend.play_count_shapes||0, friend.play_count_cities||0, friend.play_count_monuments||0];
  modeHs.forEach((hs, k) => {
    // loading-friend-avg* = Highscore column, loading-friend-hs* = Average column (inverted IDs in HTML)
    setText('loading-friend-avg' + (k + 1), hs.toLocaleString());
    const avg = avgCounts[k] > 0 ? Math.round(avgSums[k] / avgCounts[k]) : hs;
    setText('loading-friend-hs'  + (k + 1), avg.toLocaleString());
  });

  const rk = (typeof getRank === 'function') ? getRank(friend.score) : null;
  const rankImg = document.getElementById('loading-friend-rank');
  if (rankImg && rk) rankImg.src = rk.img;
  const rankLabel = document.getElementById('loading-friend-rank-label');
  if (rankLabel && rk) {
    rankLabel.textContent = rk.name;
    const maxWidth = (rankImg?.offsetWidth || 240) * 1.15;
    let size = 4;
    rankLabel.style.fontSize = size + 'cqmin';
    while (rankLabel.scrollWidth > maxWidth && size > 1.6) {
      size -= 0.1;
      rankLabel.style.fontSize = size + 'cqmin';
    }
  }

  const friendRankBadge = document.getElementById('loading-friend-rank-badge');
  const friendPlayCountEl = document.getElementById('loading-friend-play-count');
  if (friendRankBadge) {
    if (friend.id && typeof window.getGlobalRankForId === 'function') {
      window.getGlobalRankForId(friend.id).then(pos => {
        if (currentFriendProfile !== friend || !pos) { friendRankBadge.style.display = 'none'; _centerBadgeWithText(friendPlayCountEl, friendRankBadge, 'before'); return; }
        friendRankBadge.style.display = '';
        const cupEl = document.getElementById('loading-friend-rank-cup');
        const numEl = document.getElementById('loading-friend-rank-num');
        if (cupEl) cupEl.src = `images/cups/${window._cupForRank(pos)}.png`;
        if (numEl) numEl.textContent = '#' + pos;
        _centerBadgeWithText(friendPlayCountEl, friendRankBadge, 'before');
      }).catch(() => { friendRankBadge.style.display = 'none'; _centerBadgeWithText(friendPlayCountEl, friendRankBadge, 'before'); });
    } else {
      friendRankBadge.style.display = 'none';
      _centerBadgeWithText(friendPlayCountEl, friendRankBadge, 'before');
    }
  }
  const friendFlagBadge = document.getElementById('loading-friend-flag-badge');
  if (friendFlagBadge) {
    const flagUrl = window.flagUrlForCountryCode?.(friend.country_code);
    const friendNameWrap = document.querySelector('#loading-friend-group .loading-name-wrap');
    if (flagUrl) {
      friendFlagBadge.style.display = '';
      const img = document.getElementById('loading-friend-flag-badge-img');
      if (img) img.src = flagUrl;
      _centerBadgeWithText(friendNameWrap, friendFlagBadge, 'after');
    } else {
      friendFlagBadge.style.display = 'none';
      _centerBadgeWithText(friendNameWrap, friendFlagBadge, 'after');
    }
  }

  updateFriendButtons();
  const friendGroup = document.getElementById('loading-friend-group');
  if (friendGroup) {
    friendGroup.classList.remove('table-gone');
    _applyFriendPanelStatus(friend);
  }
  if (friend.id) _startFriendStatusPoll(friend.id);
}
window.openFriendProfile = openFriendProfile;

function _clearFriendPanel() {
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const pic = document.getElementById('loading-friend-pic');
  if (pic) pic.src = 'images/profilepic/ppdefault.png';
  const fBadge = document.getElementById('loading-friend-supporter-badge');
  if (fBadge) fBadge.style.display = 'none';
  setText('loading-friend-name', '');
  setText('loading-friend-total', '—');
  setText('loading-friend-play-count', '');
  [1,2,3,4].forEach(k => { setText('loading-friend-avg'+k,'—'); setText('loading-friend-hs'+k,'—'); });
  const rankImg = document.getElementById('loading-friend-rank');
  if (rankImg) rankImg.src = 'images/ranks/1.png';
  const rankLabel = document.getElementById('loading-friend-rank-label');
  if (rankLabel) rankLabel.textContent = '';
  const vsEl = document.getElementById('loading-friend-vs-record');
  if (vsEl) vsEl.style.display = 'none';
  const friendRankBadge = document.getElementById('loading-friend-rank-badge');
  if (friendRankBadge) friendRankBadge.style.display = 'none';
  const friendFlagBadge = document.getElementById('loading-friend-flag-badge');
  if (friendFlagBadge) friendFlagBadge.style.display = 'none';
  const statusEl = document.getElementById('loading-friend-status');
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'loading-friend-status'; }
  const actions = document.getElementById('loading-friend-actions');
  if (actions) actions.style.visibility = 'hidden';
}

function _showFriendPanelError(persistent = false) {
  const panel = document.getElementById('loading-friend-group');
  if (!panel) return;
  let overlay = panel.querySelector('.friend-error-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'friend-error-overlay';
    panel.appendChild(overlay);
  }
  overlay.textContent = typeof t === 'function'
    ? t('social.profileUnavailable', 'No se ha podido cargar el perfil, por favor inténtalo más tarde')
    : 'No se ha podido cargar el perfil, por favor inténtalo más tarde';
  overlay.classList.add('visible');
  if (!persistent) setTimeout(() => overlay.classList.remove('visible'), 3000);
}

// ── Botones de relación del perfil de amigo ───────────────────────────────────
function updateFriendButtons() {
  const actions  = document.getElementById('loading-friend-actions');
  const favBtn   = document.getElementById('loading-friend-fav');
  const relBtn   = document.getElementById('loading-friend-rel');
  const blockBtn = document.getElementById('loading-friend-block');
  if (!actions || !currentFriendProfile) return;
  const f = currentFriendProfile;
  const status = relStatus(f);
  const favs = getSocialFavs();

  const statusEl = document.getElementById('loading-friend-status');
  if (statusEl) {
    if (status === 'friend') {
      const st = getStatusObj(f);
      statusEl.style.display = '';
      statusEl.textContent = socialStatusText(f);
      statusEl.className = 'loading-friend-status ' + st.cls;
    } else {
      statusEl.style.display = 'none';
      statusEl.textContent = '';
    }
  }

  actions.classList.toggle('is-blocked', status === 'blocked');

  if (status === 'friend') {
    favBtn.classList.remove('hidden');
    favBtn.src = favs.has(f.id) ? 'images/bestfriend2.png' : 'images/bestfriend.png';
  } else {
    favBtn.classList.add('hidden');
  }

  if (status === 'friend')       relBtn.src = 'images/nofriend.png';
  else if (status === 'request') relBtn.src = 'images/friendreq.png';
  else if (status === 'sent')    relBtn.src = 'images/friendsent.png';
  else                           relBtn.src = 'images/friendadd.png';

  blockBtn.src = status === 'blocked' ? 'images/friendunblock.png' : 'images/friendblock.png';
}

// Popup de confirmación reutilizable (sí/no).
function showFriendConfirm(text, onYes, showClose = false, onNo = null) {
  const popup = document.getElementById('friend-confirm-popup');
  const txt   = document.getElementById('friend-confirm-text');
  const yes   = document.getElementById('friend-confirm-yes');
  const no    = document.getElementById('friend-confirm-no');
  const xbtn  = document.getElementById('friend-confirm-close');
  if (!popup) return;
  txt.textContent = text;
  popup.style.display = 'flex';
  if (xbtn) xbtn.style.display = showClose ? 'block' : 'none';
  const close = () => { popup.style.display = 'none'; yes.onclick = null; no.onclick = null; if (xbtn) xbtn.onclick = null; };
  yes.onclick = () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); close(); onYes(); };
  no.onclick  = () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); close(); if (onNo) onNo(); };
  if (xbtn) xbtn.onclick = () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); close(); };
}

function refreshSocialAfterRel() {
  updateFriendButtons();
  updateSocialTabCounts();
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
  renderBlockedList();
  renderSentList();
}

['loading-friend-fav', 'loading-friend-rel', 'loading-friend-block'].forEach(id => {
  document.getElementById(id)?.addEventListener('mouseenter', () => {
    sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  });
});

// Botón mejor amigo: alterna favorito.
document.getElementById('loading-friend-fav')?.addEventListener('click', () => {
  if (!currentFriendProfile || relStatus(currentFriendProfile) !== 'friend') return;
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const favs = getSocialFavs();
  if (favs.has(currentFriendProfile.id)) favs.delete(currentFriendProfile.id);
  else favs.add(currentFriendProfile.id);
  saveSocialFavs(favs);
  refreshSocialAfterRel();
});

// Aplica un cambio optimista a socialData y refresca el panel al instante,
// luego sincroniza con el servidor en background.
function _optimisticRelUpdate(action, fp) {
  const id = fp.id;
  const removeFromAll = () => {
    socialData.friends  = socialData.friends.filter(x => x.id !== id);
    socialData.requests = socialData.requests.filter(x => x.id !== id);
    socialData.sent     = socialData.sent.filter(x => x.id !== id);
    socialData.blocked  = socialData.blocked.filter(x => x.id !== id);
  };
  if (action === 'remove' || action === 'reject' || action === 'cancel' || action === 'unblock') {
    removeFromAll();
  } else if (action === 'block') {
    removeFromAll();
    socialData.blocked.push({ ...fp, friendshipId: fp.friendshipId });
  } else if (action === 'accept') {
    socialData.requests = socialData.requests.filter(x => x.id !== id);
    socialData.sent     = socialData.sent.filter(x => x.id !== id);
    socialData.friends.push({ ...fp });
  } else if (action === 'send') {
    socialData.sent.push({ ...fp, friendshipId: null });
  }
  updateFriendButtons();
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
  updateSocialTabCounts();
  if (!document.getElementById('loading-blocked-group')?.classList.contains('table-gone')) renderBlockedList();
  if (!document.getElementById('loading-sent-group')?.classList.contains('table-gone'))    renderSentList();
}

// Botón del medio: añadir / aceptar / cancelar / borrar amigo.
document.getElementById('loading-friend-rel')?.addEventListener('click', () => {
  if (!currentFriendProfile) return;
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const fp = currentFriendProfile;
  const status = relStatus(fp);
  if (status === 'blocked') return;
  if (status === 'friend') {
    showFriendConfirm(t('confirm.removeFriend', { name: fp.name }), () => {
      const favs = getSocialFavs(); favs.delete(fp.id); saveSocialFavs(favs);
      _optimisticRelUpdate('remove', fp);
      // No llamar loadSocialData en .then(): el delete y el re-fetch inmediato
      // tienen race condition (Supabase aún no propagó el write a la capa de lectura).
      // El optimistic update ya removió el amigo. El Realtime event confirma después.
      window.sbDeleteFriendship(fp.friendshipId, window._sbUserId, fp.id)
        .catch(e => { console.warn('[social] removeFriend:', e); loadSocialData(false); });
    });
  } else if (status === 'request') {
    showFriendConfirm(t('confirm.acceptRequest', { name: fp.name }), () => {
      _optimisticRelUpdate('accept', fp);
      window.sbAcceptRequest(fp.friendshipId)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] acceptRequest:', e); loadSocialData(false); });
    }, true, () => {
      _optimisticRelUpdate('reject', fp);
      window.sbDeleteFriendship(fp.friendshipId, window._sbUserId, fp.id)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] rejectRequest:', e); loadSocialData(false); });
    });
  } else if (status === 'sent') {
    showFriendConfirm(t('confirm.cancelSent', { name: fp.name }), () => {
      _optimisticRelUpdate('cancel', fp);
      window.sbDeleteFriendship(fp.friendshipId, window._sbUserId, fp.id)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] cancelSent:', e); loadSocialData(false); });
    });
  } else {
    _optimisticRelUpdate('send', fp);
    window.sbSendFriendRequest(window._sbUserId, fp.name)
      .then(() => loadSocialData(false))
      .catch(e => { console.warn('[social] sendRequest:', e); loadSocialData(false); _showFriendPanelError(); });
  }
});

// Botón bloquear / desbloquear.
document.getElementById('loading-friend-block')?.addEventListener('click', () => {
  if (!currentFriendProfile) return;
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const fp = currentFriendProfile;
  const status = relStatus(fp);
  if (status === 'blocked') {
    showFriendConfirm(t('confirm.unblock', { name: fp.name }), () => {
      _optimisticRelUpdate('unblock', fp);
      window.sbDeleteFriendship(fp.friendshipId, window._sbUserId, fp.id)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] unblock:', e); loadSocialData(false); });
    });
  } else {
    showFriendConfirm(t('confirm.block', { name: fp.name }), () => {
      const favs = getSocialFavs(); favs.delete(fp.id); saveSocialFavs(favs);
      _optimisticRelUpdate('block', fp);
      window.sbBlockUser(window._sbUserId, fp.id, fp.friendshipId)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] block:', e); loadSocialData(false); });
    });
  }
});

document.getElementById('loading-friend-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-friend-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  clearInterval(_friendStatusInterval);
  const friendGroup = document.getElementById('loading-friend-group');
  friendGroup?.classList.add('table-gone');
  friendGroup?.querySelector('.friend-error-overlay')?.classList.remove('visible');
  const actions = document.getElementById('loading-friend-actions');
  if (actions) actions.style.visibility = '';
});

document.getElementById('loading-social-search-input')?.addEventListener('input', (e) => {
  renderSocial(e.target.value);
});

const SOCIAL_SORTS = [
  { value: 'conn',       key: 'sort.conn'      },
  { value: 'score-desc', key: 'sort.scoreDesc' },
  { value: 'score-asc',  key: 'sort.scoreAsc'  },
  { value: 'name-asc',   key: 'sort.nameAsc'   },
  { value: 'name-desc',  key: 'sort.nameDesc'  },
];
function socialSortLabel() {
  const cur = SOCIAL_SORTS.find(s => s.value === socialSort);
  return cur ? t(cur.key) : t('sort.conn');
}
document.getElementById('loading-social-sort')?.addEventListener('click', () => {
  const s = sfxSelect.cloneNode();
  s.volume = sfxSelect.volume;
  s.play();
  const idx = SOCIAL_SORTS.findIndex(s => s.value === socialSort);
  const next = SOCIAL_SORTS[(idx + 1) % SOCIAL_SORTS.length];
  socialSort = next.value;
  localStorage.setItem('socialSort', socialSort);
  const btn = document.getElementById('loading-social-sort');
  if (btn) btn.textContent = socialSortLabel();
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

(() => {
  const btn = document.getElementById('loading-social-sort');
  if (btn) btn.textContent = socialSortLabel();
})();

document.getElementById('loading-social-tab-friends')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  socialActiveTab = 'friends';
  document.querySelectorAll('.loading-social-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('loading-social-tab-friends').classList.add('active');
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

document.getElementById('loading-social-tab-requests')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  socialActiveTab = 'requests';
  document.querySelectorAll('.loading-social-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('loading-social-tab-requests').classList.add('active');
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

// ── Panel Añadir Amigo ────────────────────────────────────────────────────────
document.getElementById('loading-social-invite')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const input = document.getElementById('loading-addfriend-input');
  const fb = document.getElementById('loading-addfriend-feedback');
  if (input) input.value = '';
  if (fb) fb.className = 'loading-addfriend-feedback';
  document.getElementById('loading-addfriend-group')?.classList.remove('table-gone');
  input?.focus();
});

let _sendingFriendRequest = false;
async function sendFriendRequest() {
  // Guard real: el botón se deshabilita pero el input tiene su propio listener
  // de Enter que llama esta función directo (sin pasar por el <button>), así
  // que "disabled" solo no alcanza para evitar pedidos superpuestos.
  if (_sendingFriendRequest) return;
  const input = document.getElementById('loading-addfriend-input');
  const fb = document.getElementById('loading-addfriend-feedback');
  const name = (input?.value || '').trim();
  if (!fb) return;
  if (!name) {
    fb.textContent = t('social.typeName');
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  if (!window._accountLoggedIn || !window._sbUserId) {
    fb.textContent = 'Debes iniciar sesión';
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  const myName = window._sbProfile?.username || '';
  if (name.toLowerCase() === myName.toLowerCase()) {
    fb.textContent = 'No puedes agregarte a ti mismo';
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  if (socialData.sent.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    fb.textContent = t('social.alreadySent');
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  if (socialData.friends.some(f => f.name.toLowerCase() === name.toLowerCase()) ||
      socialData.requests.some(r => r.name.toLowerCase() === name.toLowerCase())) {
    fb.textContent = t('social.alreadyInList');
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  _sendingFriendRequest = true;
  const sendBtn = document.getElementById('loading-addfriend-send');
  // Nada de texto de feedback acá: el botón ya dice "Enviando..." — mostrar lo
  // mismo abajo (sin color definido en el CSS para este estado, salía en
  // blanco/ilegible) era redundante y confuso.
  fb.textContent = '';
  fb.className = 'loading-addfriend-feedback';
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = t('social.sending');
    sendBtn.style.opacity = '0.6';
    sendBtn.style.cursor = 'not-allowed';
    sendBtn.style.pointerEvents = 'none';
  }
  if (input) input.disabled = true;
  try {
    // .then(() => true): sbSendFriendRequest resuelve undefined en éxito (no
    // retorna nada), que chocaría con el undefined que usa withConnTimeout
    // para marcar timeout — con esto, éxito real siempre es `true`.
    const _p = window.sbSendFriendRequest(window._sbUserId, name).then(() => true);
    const result = typeof window.withConnTimeout === 'function' ? await window.withConnTimeout(_p, 6000) : await _p;
    if (result === undefined) return; // timeout: viñeta de error ya mostrada, no hay nada más que decir acá
    fb.textContent = t('social.requestSent', { name });
    fb.className = 'loading-addfriend-feedback ok show';
    if (input) input.value = '';
    await loadSocialData(false);
  } catch (e) {
    fb.textContent = e.message === 'Usuario no encontrado' ? 'Usuario no encontrado' : 'Ha ocurrido un error, por favor inténtelo más tarde';
    fb.className = 'loading-addfriend-feedback err show';
  } finally {
    _sendingFriendRequest = false;
    if (input) input.disabled = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = t('social.sendRequest');
      sendBtn.style.opacity = '';
      sendBtn.style.cursor = '';
      sendBtn.style.pointerEvents = '';
    }
  }
}

document.getElementById('loading-addfriend-send')?.addEventListener('click', sendFriendRequest);
document.getElementById('loading-addfriend-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendFriendRequest(); }
});

document.getElementById('loading-addfriend-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-addfriend-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-addfriend-group')?.classList.add('table-gone');
});

// ── Tablero de bloqueados ─────────────────────────────────────────────────────
let blockedSort = 'az';
function renderBlockedList() {
  const list = document.getElementById('loading-blocked-list');
  if (!list) return;
  const filter = (document.getElementById('loading-blocked-search-input')?.value || '').toLowerCase();
  list.innerHTML = '';
  const entries = socialData.blocked
    .filter(b => b.name.toLowerCase().includes(filter))
    .slice()
    .sort((a, b) => blockedSort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = socialData.blocked.length === 0 ? t('social.noBlocked') : t('social.noResults');
    list.appendChild(empty);
    return;
  }
  entries.forEach((b) => {
    const row = document.createElement('div');
    row.className = 'loading-social-row is-blocked-row' + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(b.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = b.id;
    row.style.setProperty('--cust-cell', `url('${window.CustomizeAssets.cellUrl(b.cellCode)}')`);
    row.innerHTML =
      window._socialAvatarHtml(b.avatar, b.frameCode) +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${b.name}</span>` +
        `<span class="loading-social-status">${t('social.blockedStatus')}</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${b.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(b.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(b.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(b));
    list.appendChild(row);
  });
}

// Bloquea/restaura los clicks de la lista de amigos.
function setSocialListClickable(on) {
  const list = document.getElementById('loading-social-list');
  if (list) list.style.pointerEvents = on ? '' : 'none';
}

document.getElementById('loading-social-blockbtn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  renderBlockedList();
  setSocialListClickable(false);
  document.getElementById('loading-blocked-group')?.classList.remove('table-gone');
});
document.getElementById('loading-social-blockbtn')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

document.getElementById('loading-blocked-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-blocked-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-blocked-group')?.classList.add('table-gone');
  setSocialListClickable(true);
});

document.getElementById('loading-blocked-search-input')?.addEventListener('input', () => renderBlockedList());

document.getElementById('loading-blocked-sort')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  blockedSort = blockedSort === 'az' ? 'za' : 'az';
  const btn = document.getElementById('loading-blocked-sort');
  if (btn) btn.textContent = blockedSort === 'az' ? 'A-Z' : 'Z-A';
  renderBlockedList();
});
document.getElementById('loading-blocked-sort')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

// ── Tablero de solicitudes enviadas (pendientes) ──────────────────────────────
let sentSort = 'az';
function renderSentList() {
  const list = document.getElementById('loading-sent-list');
  if (!list) return;
  const filter = (document.getElementById('loading-sent-search-input')?.value || '').toLowerCase();
  list.innerHTML = '';
  const entries = socialData.sent
    .filter(s => s.name.toLowerCase().includes(filter))
    .slice()
    .sort((a, b) => sentSort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = socialData.sent.length === 0 ? t('social.noSent') : t('social.noResults');
    list.appendChild(empty);
    return;
  }
  entries.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'loading-social-row' + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(s.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = s.id;
    row.style.setProperty('--cust-cell', `url('${window.CustomizeAssets.cellUrl(s.cellCode)}')`);
    row.innerHTML =
      window._socialAvatarHtml(s.avatar, s.frameCode) +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${s.name}</span>` +
        `<span class="loading-social-status">${t('social.pendingStatus')}</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${s.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(s.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(s.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(s));
    list.appendChild(row);
  });
}

document.getElementById('loading-social-sentbtn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  renderSentList();
  setSocialListClickable(false);
  document.getElementById('loading-sent-group')?.classList.remove('table-gone');
});
document.getElementById('loading-social-sentbtn')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

document.getElementById('loading-sent-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-sent-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-sent-group')?.classList.add('table-gone');
  setSocialListClickable(true);
});

document.getElementById('loading-sent-search-input')?.addEventListener('input', () => renderSentList());

document.getElementById('loading-sent-sort')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  sentSort = sentSort === 'az' ? 'za' : 'az';
  const btn = document.getElementById('loading-sent-sort');
  if (btn) btn.textContent = sentSort === 'az' ? 'A-Z' : 'Z-A';
  renderSentList();
});
document.getElementById('loading-sent-sort')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

// Al cambiar idioma, re-renderizar el contenido dinámico del panel social/perfil.
if (typeof onLangChange === 'function') onLangChange(() => {
  try { const sb = document.getElementById('loading-social-sort'); if (sb) sb.textContent = socialSortLabel(); } catch (e) {}
  try { updateSocialTabCounts(); } catch (e) {}
  try { renderSocial(document.getElementById('loading-social-search-input')?.value || ''); } catch (e) {}
  try { renderBlockedList(); } catch (e) {}
  try { renderSentList(); } catch (e) {}
  try { if (typeof refreshProfileStats === 'function') refreshProfileStats(); } catch (e) {}
  try { updateFriendButtons(); } catch (e) {}
  try { _updateProfileBtnLabel(); } catch (e) {}
});
