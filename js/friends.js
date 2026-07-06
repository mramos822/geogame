// ── FRIENDS DATA LAYER ────────────────────────────────────────────────────────
// Fuente de verdad de la lista de amigos para la barra ingame + results/final.
// Carga desde Supabase cuando hay sesión activa; vacía si no hay cuenta.
//
// API pública:
//   getFriends()          -> [{name, score}] actual (síncrono)
//   loadFriends()         -> Promise; carga de Supabase y notifica
//   onFriendsUpdate(cb)   -> callback cuando la lista cambia

let _friendsCache = [];

function getFriends() { return _friendsCache; }

const _friendsListeners = [];
function onFriendsUpdate(cb) { if (typeof cb === 'function') _friendsListeners.push(cb); }
function _notifyFriends() {
  _friendsListeners.forEach(cb => { try { cb(_friendsCache); } catch (e) {} });
}

async function loadFriends() {
  if (!window._accountLoggedIn || !window._sbUserId) {
    _friendsCache = [];
    _notifyFriends();
    return _friendsCache;
  }
  try {
    const data = await window.sbLoadSocialData(window._sbUserId);
    _friendsCache = data.friends.map(f => ({
      id: f.id, name: f.name, score: f.score,
      avatar: f.avatar || '', last_active: f.last_active || null,
      is_playing: f.is_playing || false,
      is_practicing: f.is_practicing || false,
    }));
  } catch (e) {
    console.warn('[friends] error cargando:', e.message);
    _friendsCache = [];
  }
  _notifyFriends();
  return _friendsCache;
}

function _setCache(arr) {
  _friendsCache = arr || [];
  _notifyFriends();
}

window.Friends = { getFriends, loadFriends, onFriendsUpdate, _setCache };
