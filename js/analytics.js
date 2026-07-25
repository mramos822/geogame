// ── ANALYTICS (event logging para la página admin de stats) ───────────────────
// Inserta eventos append-only en la tabla `analytics_events` vía el cliente anon
// (window.sb). RLS permite INSERT pero NO SELECT al rol anon: solo la Edge Function
// admin-stats (service role) puede leer y agregar. Fire-and-forget: nunca lanza ni
// bloquea el juego.
//
// API pública:
//   window.Analytics.logVisit()             -> 1 visita por sesión de navegador
//   window.Analytics.logGame(mode, score)   -> 1 evento por modo jugado (para el
//                                              desglose "Partidas por modo"; NO es
//                                              "1 partida" a efectos de las métricas
//                                              totales del dashboard)
//   window.Analytics.logVersus(mode)        -> 1 evento por partida versus terminada
//   window.Analytics.logCampaign(score)     -> 1 evento por Gira Mundial COMPLETA
//                                              (los 4 modos terminados); esto es lo
//                                              que cuenta como "1 partida" en los
//                                              totales del dashboard junto a versus
(function () {
  // ID anónimo estable por dispositivo (reusa el del viejo overlay si existe).
  let visitorId = localStorage.getItem('_devstats_vid');
  if (!visitorId) {
    visitorId = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('_devstats_vid', visitorId);
  }

  // Se llama al cerrar sesión (ver _doLogout, monuments.js): genera un
  // visitor_id NUEVO para este dispositivo. Sin esto, dos cuentas distintas
  // usando el mismo dispositivo como invitado (sin loguearse) compartirían
  // el mismo visitor_id, y claim_anonymous_events() podría mezclar las
  // partidas de invitado de ambas al vincular la primera cuenta que se
  // loguee (el RPC solo protege eventos que YA tienen user_id asignado, no
  // los que todavía están sueltos como invitado).
  function resetVisitorId() {
    visitorId = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    try { localStorage.setItem('_devstats_vid', visitorId); } catch (e) {}
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

  async function insertEvent(row, table) {
    const sb = window.sb;
    if (!sb) return;
    try {
      await sb.from(table || 'analytics_events').insert(row);
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

  // 'practice' (modo práctica libre) | 'campaign' (Gira Mundial, encadena los 4
  // modos) | 'standalone' (un modo suelto jugado fuera de campaña). Se lee acá
  // en vez de recibirlo como parámetro para no tener que tocar flags/shapes/
  // monuments.js: ambos flags ya son globales y están seteados cuando termina
  // la partida.
  function currentSessionType() {
    if (window.practiceConfig && window.practiceConfig.active) return 'practice';
    if (window.campaign && window.campaign.active) return 'campaign';
    return 'standalone';
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
      session_type: currentSessionType(),
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

  // Funnel de invitaciones 1v1: 1 evento por cada transición de estado de un
  // match (enviada/aceptada/rechazada/expirada/abandonada). `matches` es
  // estado efímero (se borra en la limpieza de salas, ver logVersus arriba)
  // así que sin esto no hay forma de reconstruir en qué paso se pierde la
  // gente entre "invitó" y "terminó la partida" (ver logVersus, que solo
  // cubre el desenlace final). `outcome` es uno de:
  //   sent | accepted | accept_failed | declined | expired | abandoned
  async function logVersusFunnel(outcome, mode) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'versus_funnel',
      session_type: outcome,
      mode: mode || null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
    });
  }

  // 1 evento por Gira Mundial completa (los 4 modos terminados sin salir antes).
  // Llamado por monuments.js justo cuando la campaña llega al último modo y
  // window.campaign.active pasa a false. `score` es el puntaje acumulado total.
  async function logCampaign(score) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'campaign',
      score: (typeof score === 'number' && isFinite(score)) ? Math.round(score) : null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
      session_type: 'campaign',
    });
  }

  // 1 evento por partida de GlobeQuiz GANADA. Cuenta como "1 partida" propia
  // en los totales del dashboard (junto a campaign/versus) — no es parte de
  // la Gira Mundial de 4 modos, es un modo standalone independiente.
  // `score` = cantidad de intentos, `durationMs` = tiempo hasta acertar,
  // `streak` = racha de días jugados en el momento de esta partida (0 si es
  // invitado o no se pudo leer) — para poder ver en /stats quién juega este
  // modo, cuánto tarda y qué tan seguido vuelve.
  async function logGlobequiz(score, durationMs, streak) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'globequiz',
      score: (typeof score === 'number' && isFinite(score)) ? Math.round(score) : null,
      duration_ms: (typeof durationMs === 'number' && isFinite(durationMs)) ? Math.round(durationMs) : null,
      streak: (typeof streak === 'number' && isFinite(streak)) ? Math.round(streak) : null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
    });
  }

  // Ledger de XP/monedas (currency_ledger) — arranca antes de que exista la
  // UI real del sistema de XP/monedas, para no perder historial: cuando se
  // lance, el saldo de cada cuenta se calcula sumando lo ya acumulado acá.
  // Versus amistoso NO otorga nada por ahora (a propósito, sin hook acá).
  //
  // Gira Mundial: base fija + un extra por cada 250 puntos de score (65
  // campañas históricas, promedio 17418, rango 2923-45099 → con esta fórmula
  // da ~21-190 monedas y ~83-590 xp).
  const CAMPAIGN_BASE_COINS = 10, CAMPAIGN_BASE_XP = 50;
  const CAMPAIGN_POINTS_STEP = 250, CAMPAIGN_STEP_COINS = 1, CAMPAIGN_STEP_XP = 3;
  function coinsFromScore(score) {
    const steps = Math.floor((score || 0) / CAMPAIGN_POINTS_STEP);
    return CAMPAIGN_BASE_COINS + steps * CAMPAIGN_STEP_COINS;
  }
  function xpFromScore(score) {
    const steps = Math.floor((score || 0) / CAMPAIGN_POINTS_STEP);
    return CAMPAIGN_BASE_XP + steps * CAMPAIGN_STEP_XP;
  }

  // GlobeQuiz: base fija por victoria (10 monedas / 20 xp), multiplicada
  // x1.15 cada 10 días de racha activa, hasta un tope de 10 aplicaciones
  // (racha >= 100 días ya no sigue multiplicando, mult queda fijo en
  // 1.15^10 ≈ 4.05x). Con x1.5 el multiplicador llegaba a ~57.7x y una
  // racha larga por sí sola alcanzaba nivel 50 en ~4 meses sin jugar
  // ninguna Gira Mundial — x1.15 lo deja como un bonus fuerte pero no
  // reemplaza jugar el resto de los modos.
  const GQ_BASE_COINS = 10, GQ_BASE_XP = 20;
  const GQ_MULT_STEP_DAYS = 10, GQ_MULT_FACTOR = 1.15, GQ_MULT_MAX_STEPS = 10;
  function gqMultiplier(streakDays) {
    const steps = Math.min(Math.floor((streakDays || 0) / GQ_MULT_STEP_DAYS), GQ_MULT_MAX_STEPS);
    return Math.pow(GQ_MULT_FACTOR, steps);
  }

  async function logCurrencyEvent(coins, xp, reason, refValue) {
    insertEvent({
      coins: Math.round(coins) || 0,
      xp: Math.round(xp) || 0,
      reason,
      ref_value: (typeof refValue === 'number' && isFinite(refValue)) ? Math.round(refValue) : null,
      visitor_id: visitorId,
      user_id: window._sbUserId || null,
    }, 'currency_ledger');
  }
  function logCampaignCurrency(score) {
    logCurrencyEvent(coinsFromScore(score), xpFromScore(score), 'campaign_complete', score);
  }
  // Se llama en cada victoria de GlobeQuiz (no solo cuando la racha avanza),
  // con la racha YA resuelta del día — ver showEndgameModal en globequiz.js.
  function logGlobequizCurrency(streakDays) {
    const mult = gqMultiplier(streakDays);
    logCurrencyEvent(GQ_BASE_COINS * mult, GQ_BASE_XP * mult, 'globequiz_win', streakDays);
  }

  window.Analytics = {
    logVisit, logGame, logVersus, logVersusFunnel, logCampaign, logGlobequiz,
    logCampaignCurrency, logGlobequizCurrency, resetVisitorId,
  };

  // Registrar la visita en cuanto el cliente sb esté listo.
  function tryVisit(attempt) {
    if (window.sb) { logVisit(); return; }
    if (attempt > 20) return;
    setTimeout(() => tryVisit(attempt + 1), 300);
  }
  tryVisit(0);
})();
