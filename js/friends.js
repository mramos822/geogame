// ── FRIENDS DATA LAYER ────────────────────────────────────────────────────────
// Única fuente de verdad de la lista de amigos (barra ingame + pantallas
// results/final). Hoy sirve datos mock; cuando exista el backend con amigos
// reales basta con poner FRIENDS_API_ENABLED = true y apuntar FRIENDS_API_URL.
//
// Consumo en el resto del juego:
//   getFriends()                -> array actual [{name, score}] (síncrono, siempre listo)
//   loadFriends()               -> Promise; trae del servidor y refresca la cache
//   onFriendsUpdate(cb)         -> se llama cada vez que la lista cambia (p.ej. al
//                                  llegar datos reales del server) para reconstruir UI
//
// Este archivo se carga ANTES que los consumidores (monuments/results/final),
// así getFriends() ya tiene datos en el primer render, sin hacks de timing.

const FRIENDS_API_ENABLED = false;            // ← flip cuando el backend esté listo
const FRIENDS_API_URL     = '/api/friends';   // ← endpoint real (devuelve la lista de amigos)

// Datos de respaldo / desarrollo. Mismo formato que devolverá el servidor: {name, score}.
const MOCK_FRIENDS = [
  { name: 'Alex', score: 3147 }, { name: 'Sam', score: 5392 },
  { name: 'Robin', score: 7681 }, { name: 'Charlie', score: 9923 },
  { name: 'Jordan', score: 12418 }, { name: 'Skyler', score: 14706 },
  { name: 'Taylor', score: 17852 }, { name: 'Reese', score: 20439 },
  { name: 'Morgan', score: 23671 }, { name: 'Dakota', score: 26284 },
  { name: 'Parker', score: 28917 }, { name: 'Casey', score: 31263 },
  { name: 'Hayden', score: 33548 }, { name: 'Emerson', score: 36192 },
  { name: 'Finley', score: 38734 }, { name: 'Riley', score: 41879 },
  { name: 'Rowan', score: 44906 }, { name: 'Sage', score: 47538 },
  { name: 'Blake', score: 50821 }, { name: 'Drew', score: 54677 },
  { name: 'Phoenix', score: 57943 }, { name: 'River', score: 60518 },
  { name: 'Remy', score: 63892 }, { name: 'Quinn', score: 67341 },
  { name: 'Marlowe', score: 70286 }, { name: 'Lennox', score: 73159 },
  { name: 'Tatum', score: 75824 }, { name: 'Avery', score: 78663 },
  { name: 'Ellis', score: 81207 }, { name: 'Sawyer', score: 83548 },
];

// Cache viva que consume todo el juego. Arranca con el mock como semilla.
let _friendsCache = MOCK_FRIENDS.slice();

// Normaliza cualquier forma que devuelva el server a {name, score}.
// Ajustá los campos (username/points/etc.) cuando se defina el contrato real.
function normalizeFriend(f) {
  return {
    name:  String(f && (f.name ?? f.username ?? f.displayName) || '?'),
    score: Math.max(0, Math.round(Number(f && (f.score ?? f.points ?? f.total) || 0))),
  };
}

// Accesor síncrono usado en todas partes. Siempre devuelve la lista vigente.
function getFriends() { return _friendsCache; }

// Listeners que reconstruyen UI cuando cambia la lista (al llegar datos reales).
const _friendsListeners = [];
function onFriendsUpdate(cb) { if (typeof cb === 'function') _friendsListeners.push(cb); }
function _notifyFriends() {
  _friendsListeners.forEach(cb => { try { cb(_friendsCache); } catch (e) { /* noop */ } });
}

// Carga async desde el servidor. Con la API deshabilitada, reafirma el mock.
// Ante cualquier error, hace fallback al mock para no romper el juego.
async function loadFriends() {
  if (!FRIENDS_API_ENABLED) {
    _friendsCache = MOCK_FRIENDS.slice();
    _notifyFriends();
    return _friendsCache;
  }
  try {
    const res = await fetch(FRIENDS_API_URL, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.friends || data.results || []);
    _friendsCache = list.map(normalizeFriend);
  } catch (e) {
    console.warn('[friends] no se pudo cargar del servidor, usando mock:', e.message);
    _friendsCache = MOCK_FRIENDS.slice();
  }
  _notifyFriends();
  return _friendsCache;
}

// Namespace opcional por si se prefiere acceso agrupado.
window.Friends = { getFriends, loadFriends, onFriendsUpdate, normalizeFriend };
