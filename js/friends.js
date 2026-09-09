// ── FRIENDS DATA LAYER ────────────────────────────────────────────────────────
// Source of truth for the friends list used by the ingame bar + results/final.
// Loads from Supabase when there's an active session; empty if no account.
//
// Public API:
//   getFriends()          -> current [{name, score}] (synchronous)
//   loadFriends()         -> Promise; loads from Supabase and notifies
//   onFriendsUpdate(cb)   -> callback when the list changes

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
      // frameCode/cardCode already came from sbLoadSocialData but were
      // discarded here — without this, the VS rival (vs.js _setupVsOpponent
      // looks here via getFriends()) always got the default frame/card when
      // spectated, regardless of what they actually had equipped.
      frameCode: f.frameCode || '0001',
      cardCode: f.cardCode || '0001',
      cellCode: f.cellCode || '0001',
      panelCode: f.panelCode || '0001',
      // country_code: same reason as frameCode/cardCode above — came from
      // sbLoadSocialData but was discarded here, so nobody using getFriends()
      // (see the direct chat, js/chat.js) could show a friend's flag without
      // fetching it separately.
      country_code: f.country_code || null,
      gqStreakCount: f.gqStreakCount || 0,
      gqStreakLastDate: f.gqStreakLastDate || null,
      gqTodayTimeMs: (typeof f.gqTodayTimeMs === 'number') ? f.gqTodayTimeMs : null,
    }));
  } catch (e) {
    console.warn('[friends] error loading:', e.message);
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
