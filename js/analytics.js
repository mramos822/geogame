// ── ANALYTICS (event logging para la página admin de stats) ───────────────────
// Inserta eventos append-only en la tabla `analytics_events` vía el cliente anon
// (window.sb). RLS permite INSERT pero NO SELECT al rol anon: solo la Edge Function
// admin-stats (service role) puede leer y agregar. Fire-and-forget: nunca lanza ni
// bloquea el juego.
//
// API pública:
//   window.Analytics.logVisit()           -> 1 visita por sesión de navegador
//   window.Analytics.logGame(mode, score)  -> 1 evento por partida single-player
//   window.Analytics.logVersus(mode)       -> 1 evento por partida versus terminada
(function () {
  // ID anónimo estable por dispositivo (reusa el del viejo overlay si existe).
  let visitorId = localStorage.getItem('_devstats_vid');
  if (!visitorId) {
    visitorId = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('_devstats_vid', visitorId);
  }

  // País vía IP (cacheado en localStorage; solo se pide una vez por dispositivo).
  async function getCountryCode() {
    const cached = localStorage.getItem('_an_country');
    if (cached) return cached || null;
    try {
      const r = await fetch('https://ipinfo.io/json');
      const d = await r.json();
      if (d && d.country) {
        localStorage.setItem('_an_country', d.country);
        return d.country;
      }
    } catch (e) {}
    localStorage.setItem('_an_country', ''); // evitar reintentos en bucle
    return null;
  }

  async function insertEvent(row) {
    const sb = window.sb;
    if (!sb) return;
    try {
      await sb.from('analytics_events').insert(row);
    } catch (e) { /* silencioso: nunca debe afectar al juego */ }
  }

  async function logVisit() {
    // Una visita por sesión de pestaña/navegador.
    if (sessionStorage.getItem('_an_visit')) return;
    sessionStorage.setItem('_an_visit', '1');
    const cc = await getCountryCode();
    insertEvent({
      type: 'visit',
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
    });
  }

  async function logGame(mode, score) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'game',
      mode: mode || null,
      score: (typeof score === 'number' && isFinite(score)) ? Math.round(score) : null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
    });
  }

  // 1 evento por partida versus terminada (llamado por el host al cerrar el match).
  // Separado de `matches`: esa tabla es estado efímero y sus filas 'finished' se
  // borran en la limpieza de salas (ver lobby.js _cleanupStale), así que no sirve
  // como fuente de historial para el panel de stats.
  async function logVersus(mode) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'versus',
      mode: mode || null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
    });
  }

  window.Analytics = { logVisit, logGame, logVersus };

  // Registrar la visita en cuanto el cliente sb esté listo.
  function tryVisit(attempt) {
    if (window.sb) { logVisit(); return; }
    if (attempt > 20) return;
    setTimeout(() => tryVisit(attempt + 1), 300);
  }
  tryVisit(0);
})();
