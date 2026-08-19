// ── SOLO SPECTATE (broadcaster) ─────────────────────────────────────────────
// Lado del jugador que está jugando SOLO (Gira Mundial / modo individual, no
// versus). No hay fila en `matches` para una partida individual, así que en
// vez de un canal por partida usamos un canal fijo por usuario: 'solo-{uid}'.
// Arranca/para desde window._setPlaying (monuments.js) y transmite ronda/click
// exactamente igual que vs.js, para que Spectate.watchSolo() del lado de quien
// mira reciba lo mismo sin importar si la partida es versus o individual.
window.SoloSpectate = (() => {
  let _channel = null;
  let _active  = false;

  function _myId() { return window._sbUserId || null; }

  function start() {
    // Idempotente: cada modo (flags/shapes/cities/monuments) llama
    // window._setPlaying(true) → SoloSpectate.start() en su propio handler de
    // splash — cuando la campaña encadena de un modo a otro (mismo
    // usuario, misma sesión), esto se llama de nuevo aunque el canal 'solo-
    // {uid}' ya estaba activo. Antes acá se hacía stop() incondicional
    // (unsubscribe + resubscribe), lo que le mostraba al espectador un
    // 'leave' de presence del jugador (interpretado como "la partida
    // terminó") seguido de un 'join' — pero para cuando volvía a llegar el
    // join, el espectador ya se había cerrado solo por el leave. Si el canal
    // ya está activo, no hay nada que reiniciar.
    if (_active && _channel) return;
    const uid = _myId();
    if (!uid) return; // sin cuenta no hay a quién autorizar a espectar
    _active = true;
    _channel = window.sb
      .channel('solo-' + uid, { config: { presence: { key: uid } } })
      // 'sync' (no join/leave): es el único evento que garantiza que
      // presenceState() ya está consistente — leerlo en el handler de 'leave'
      // a veces todavía traía al que se fue (race de timing), por eso el
      // contador no bajaba al salir un espectador.
      .on('presence', { event: 'sync' }, _updateSpectatorCount)
      // Un espectador que entra a mitad de ronda no recibe ningún 'round'
      // nuevo hasta que yo pase a la siguiente — sin esto se queda pegado en
      // la pantalla de carga si todavía no elegí nada. Al detectar su join
      // se le reenvía la última ronda/tick conocidos.
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key && key.indexOf('spectator-') === 0) setTimeout(_resendStateTo, 150);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { try { await _channel.track({ t: Date.now() }); } catch (e) {} }
      });
  }

  function _updateSpectatorCount() {
    if (!_channel) return;
    try {
      const state = _channel.presenceState();
      const n = Object.keys(state).filter(k => k !== _myId()).length;
      window._vsSpectatorCount = n;
      if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(n);
    } catch (e) {}
  }

  function stop() {
    if (_channel) { try { _channel.unsubscribe(); } catch (e) {} _channel = null; }
    _active = false;
    window._vsSpectatorCount = 0;
    _lastPhase = null;
    _lastRoundPayload = null;
    _lastTick = null;
    _lastSplashPayload = null;
    _lastPregamePayload = null;
    _lastPostgamePayload = null;
    _lastScore = null;
    _lastDots = null;
    _lastGqGuesses = null;
    if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(0);
  }

  // _lastPhase: cuál de los cuatro estados mutuamente excluyentes está vigente
  // ahora (splash de instrucciones / ronda / cuenta 3-2-1 / resultados) — ver
  // comentario largo en la versión de vs.js (mismo patrón acá para partidas
  // individuales).
  let _lastPhase           = null; // 'splash' | 'round' | 'pregame' | 'postgame'
  let _lastRoundPayload    = null;
  let _lastTick            = null;
  let _lastSplashPayload   = null;
  let _lastPregamePayload  = null;
  let _lastPostgamePayload = null;
  // Último puntaje visto en vivo (YA con campaignBase() sumado, ver
  // _specReportAnswer en flags/shapes/monuments) — 'answer' no se cachea para
  // resend entero (replicaría animaciones/sonidos de una jugada vieja a quien
  // se une recién), pero el NÚMERO sí hace falta: sin esto, alguien que entra
  // a mitad de partida veía 0 hasta la PRÓXIMA respuesta del jugador real.
  let _lastScore = null;
  // Igual motivo que _lastScore — el trencito de puntitos (state.dots, solo
  // Cities/Monuments) mostraba 0 para alguien que se unía a mitad de partida
  // hasta la PRÓXIMA respuesta correcta del jugador real, en vez de reflejar
  // el progreso YA acumulado desde el vamos.
  let _lastDots = null;
  // Lista COMPLETA (no solo el último) de guesses ya hechos en GlobeQuiz — a
  // diferencia de _lastScore/_lastDots (un número resume todo el progreso),
  // acá cada intento es un país distinto con su propia distancia, y el
  // espectador necesita verlos TODOS al unirse a mitad de partida, no solo
  // los que se hagan de ahí en más (el "no le salen los países ya escritos"
  // reportado). Sin animación/sonido al reenviarse (ver
  // globequizSpectatorSyncGuesses, separado de globequizSpectatorResolvePick
  // que sí es la ruta en VIVO) — replicar el sonido de cada intento viejo de
  // golpe sería un caos. null para cualquier otro modo (nunca la llenan).
  let _lastGqGuesses = null;
  // SOLO actualiza el caché, sin transmitir nada — el jugador real llama a
  // esto en CADA guess (junto con reportAnswer, que sí es el broadcast en
  // vivo que ya recibe cualquiera que esté mirando). Antes esto también
  // mandaba su PROPIO broadcast 'gqguesses' en cada guess, así que un
  // espectador ya conectado recibía la MISMA jugada dos veces (el 'answer'
  // en vivo + este sync "completo") y terminaba pintando el globo/la lista
  // DOS veces seguidas por guess — el lag/tirón reportado. Ahora el único
  // que dispara el broadcast de verdad es _resendStateTo() (unión a mitad de
  // partida), acá abajo.
  function updateGqGuessesCache(list) { _lastGqGuesses = list; }
  function reportGqGuesses(list) {
    _lastGqGuesses = list;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'gqguesses', payload: { list } }); } catch (e) {} }
  }
  function reportRound(payload) {
    _lastPhase = 'round';
    _lastRoundPayload = payload;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'round', payload }); } catch (e) { console.warn('[spec] reportRound send failed', e); } }
  }
  function reportScoreSync(score, dots) {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'scoresync', payload: { score, dots } }); } catch (e) {} }
  }
  function reportAnswer(payload) {
    if (payload && typeof payload.score === 'number') _lastScore = payload.score;
    if (payload && typeof payload.dots === 'number') _lastDots = payload.dots;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'answer', payload }); } catch (e) {} }
  }
  function reportTick(timeLeft) {
    _lastTick = timeLeft;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'tick', payload: { timeLeft } }); } catch (e) {} }
  }
  function reportTimesUp() {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'timesup', payload: {} }); } catch (e) {} }
  }
  // Se dispara en el instante exacto en que el jugador real confirma salir
  // del postgame para pasar al splash del siguiente modo (campaña
  // encadenando) — ANTES de que ese modo mande su propio round/pregame (eso
  // recién llega si/cuando el jugador termina de navegar SU splash, que
  // puede tardar). Sin esto el espectador se quedaba viendo el postgame
  // VIEJO todo ese rato, como si el jugador siguiera ahí cuando ya se fue.
  // No se cachea para resend: es un aviso transitorio, no un estado.
  function reportAdvancing() {
    _lastPhase = null; // ya no hay "fase vigente" que reenviarle a alguien que se une justo ahora
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'advancing', payload: {} }); } catch (e) { console.warn('[spec] reportAdvancing send failed', e); } }
  }
  // Se dispara apenas el jugador real entra a la pantalla de instrucciones
  // (splash) de un modo — antes del 3-2-1, incluso antes de que confirme y
  // arranque el pregame real. A diferencia de reportAdvancing() (aviso
  // transitorio), ESTE estado SÍ se cachea para resend: un espectador puede
  // unirse en cualquier momento mientras el jugador está leyendo las
  // instrucciones (puede tardar lo que quiera ahí), y sin este estado
  // cacheado no había NADA que reenviarle — se quedaba viendo la pantalla de
  // conexión trabada hasta que recién arrancara el 3-2-1 real.
  function reportSplash(payload) {
    _lastPhase = 'splash';
    _lastSplashPayload = payload || {};
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'splash', payload: payload || {} }); } catch (e) { console.warn('[spec] reportSplash send failed', e); } }
  }
  function reportPregame(payload) {
    _lastPhase = 'pregame';
    _lastPregamePayload = payload || {};
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'pregame', payload: payload || {} }); } catch (e) { console.warn('[spec] reportPregame send failed', e); } }
  }
  function reportPostgame(payload) {
    _lastPhase = 'postgame';
    _lastPostgamePayload = payload;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'postgame', payload }); } catch (e) {} }
  }
  function _resendStateTo() {
    // splash primero y solo: si el jugador todavía está en las instrucciones
    // no hay ronda/pregame reales que reenviar todavía (puede ser de un modo
    // ANTERIOR, ya viejo) — mostrar la espera es lo único correcto acá.
    if (_lastPhase === 'splash' && _lastSplashPayload) {
      reportSplash(_lastSplashPayload);
      return;
    }
    // Mismo fix que vs.js: 'round' es lo único que trae `mode`, y _mode del
    // lado espectador arranca en 'flags' por default — reenviarlo primero
    // asegura que quien se une durante el 3-2-1/resultados monte la UI real
    // correcta desde el vamos, no recién cuando llegue la ronda siguiente.
    if (_lastPhase === 'pregame' && _lastPregamePayload) {
      if (_lastRoundPayload) reportRound(_lastRoundPayload);
      reportPregame(_lastPregamePayload);
      return;
    }
    if (_lastPhase === 'postgame' && _lastPostgamePayload) {
      if (_lastRoundPayload) reportRound(_lastRoundPayload);
      reportPostgame(_lastPostgamePayload);
      return;
    }
    if (_lastRoundPayload) reportRound(_lastRoundPayload);
    if (_lastTick != null) reportTick(_lastTick);
    // Unión a mitad de ronda, sin pregame de por medio: 'round' no trae
    // puntaje ni dots, así que sin esto el marcador y el trencito de
    // puntitos se quedaban en 0 hasta la PRÓXIMA respuesta del jugador real.
    if (_lastScore != null || _lastDots != null) reportScoreSync(_lastScore, _lastDots);
    // Mismo motivo que arriba pero para GlobeQuiz: reenvía TODOS los guesses
    // ya hechos, no solo el próximo que llegue en vivo.
    if (_lastGqGuesses != null) reportGqGuesses(_lastGqGuesses);
  }

  return { start, stop, reportRound, reportAnswer, reportTick, reportTimesUp, reportSplash, reportPregame, reportPostgame, reportAdvancing, reportGqGuesses, updateGqGuessesCache, isActive: () => _active };
})();

// ── DISPATCHER ───────────────────────────────────────────────────────────────
// Llamado desde flags.js/shapes.js en vez de tocar VS/SoloSpectate directamente
// — decide a dónde transmitir según el contexto actual (versus vs. individual).
window._specReportRound = function (payload) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportRound === 'function') {
    window._vsReportRound(payload);
    return;
  }
  // Grupal (lobby de hasta 10) — ver GroupSpectate más abajo. Igual que VS,
  // LB.sendRound taggea el broadcast con el uid de ESTE jugador (no un rol
  // binario host/guest), así un espectador puede mirar el tablero real de
  // CUALQUIER miembro.
  if (window._lobbyActive && window.LB && typeof window.LB.sendRound === 'function') {
    window.LB.sendRound(payload);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportRound(payload);
  }
};
window._specReportAnswer = function (correct, score, detail) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportAnswer === 'function') {
    window._vsReportAnswer(correct, score, detail);
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendAnswer === 'function') {
    window.LB.sendAnswer({ ...(detail || {}), correct, score });
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportAnswer({ ...(detail || {}), correct, score });
  }
};
// GlobeQuiz-only (siempre solo, nunca VS/lobby) — actualiza el CACHÉ de la
// lista completa de guesses (para reenviarla si alguien se une a mitad de
// partida, ver reportGqGuesses/_resendStateTo en SoloSpectate), sin
// transmitir nada en vivo — el 'answer' normal (_specReportAnswer, llamado
// junto con esto en cada guess) ya es el broadcast en vivo que ve cualquier
// espectador ya conectado; duplicar el envío acá hacía que cada guess se
// pintara DOS veces seguidas del lado del espectador (el lag reportado).
window._specReportGqGuesses = function (list) {
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.updateGqGuessesCache(list);
  }
};
window._specReportTick = function (timeLeft) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportTick === 'function') {
    window._vsReportTick(timeLeft);
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendTick === 'function') {
    window.LB.sendTick(timeLeft);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportTick(timeLeft);
  }
};
window._specReportTimesUp = function () {
  // Efecto (temblor + cronómetro) en MI PROPIA cartilla del leaderboard — el
  // broadcast de 'timesup' es para los DEMÁS (no ecoa a mí), así que la mía la
  // disparo local acá. Uso la función *SetLobbyTimesUpFor del modo con mi
  // propio uid → cae en la celda 'player' (existe en versus Y lobby).
  try {
    if (window._vsActive || window._lobbyActive) {
      const m = window.pendingGameMode;
      const fn = m === 'flags' ? window.flagsTriggerLobbyTimesUpFor
               : m === 'shapes' ? window.shapesSetLobbyTimesUpFor
               : window.citiesSetLobbyTimesUpFor; // 'game' (cities) y 'monuments' comparten
      if (typeof fn === 'function') fn(window._sbUserId);
    }
  } catch (e) {}
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportTimesUp === 'function') {
    window._vsReportTimesUp();
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendTimesUp === 'function') {
    window.LB.sendTimesUp();
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportTimesUp();
  }
};
// Grupal: igual que en solo, la campaña de la sala encadena modos (ver
// _currentModeIdx/_lobbyModes en lobby.js), así que la pantalla de
// instrucciones SÍ es un estado real que un espectador puede "perderse" —
// a diferencia de 1v1, que entra directo a la ronda sincronizada.
window._specReportSplash = function (payload) {
  if (window._lobbyActive && window.LB && typeof window.LB.sendSplash === 'function') {
    window.LB.sendSplash(payload);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportSplash(payload);
  }
};
window._specReportPregame = function (payload) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportPregame === 'function') {
    window._vsReportPregame(payload);
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendPregame === 'function') {
    window.LB.sendPregame(payload);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportPregame(payload);
  }
};
window._specReportPostgame = function (payload) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportPostgame === 'function') {
    window._vsReportPostgame(payload);
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendPostgame === 'function') {
    window.LB.sendPostgame(payload);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportPostgame(payload);
  }
};
// Grupal: igual que en solo, sí encadena modos — ver comentario en
// _specReportSplash. 1v1 no llama nunca a esto (cada match termina con su
// propia pantalla W/L, sin encadenar).
window._specReportAdvancing = function () {
  if (window._lobbyActive && window.LB && typeof window.LB.sendAdvancing === 'function') {
    window.LB.sendAdvancing();
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportAdvancing();
  }
};

// ── MODO ESPECTADOR (Versus 1v1, Banderas/Siluetas) ────────────────────────────
// Espejo de solo-lectura de vs.js: se une al mismo canal realtime `match-{id}`
// que usan host/guest, pero con una presence key 'spectator-{uid}' distinta
// (así el HUD de los jugadores puede contar espectadores sin verlos como rival).
// No reporta score ni escucha clicks — solo observa.
window.Spectate = (() => {
  let _matchId = null;
  let _channel = null;
  let _match   = null;
  let _isSolo  = false; // true = mirando una partida individual (Gira Mundial), no versus
  let _watchOpts = null; // opts pasadas a watch(matchId, opts) — ver suppressPresenceGone
  let _onSnapshot = null; // cb(match) — estado inicial al empezar a mirar
  let _onScore    = null; // cb(hostScore, guestScore)
  let _onAnswer   = null; // cb({ role, index, correct }) — selección exacta de un jugador
  let _onWrong    = null; // cb(role)
  let _onEnd      = null; // cb(reason) — 'finished' | 'abandoned' | 'gone'
  let _onRound    = null; // cb({ role, index, country/label, correctSlot, options })
  let _onTick     = null; // cb(timeLeft) — tiempo restante real del jugador
  let _onTimesUp  = null; // cb() — se acabó el tiempo de la ronda de juego
  let _onSplash    = null; // cb(payload) — el jugador está en la pantalla de instrucciones de un modo, antes del 3-2-1
  let _onPregame   = null; // cb(payload) — cuenta 3-2-1 antes de la ronda
  let _onPostgame  = null; // cb(payload) — pantalla de resultados
  let _onAdvancing = null; // cb() — el jugador real confirmó salir del postgame hacia el siguiente modo (todavía sin round/pregame nuevo)
  let _onGameEnd   = null; // cb({role, score}) — SOLO versus: uno de los dos jugadores terminó su cronómetro (ver reportGameEnd en vs.js). Consumido por _enterWaitAsSpectator (vs.js) cuando el jugador que terminó primero mira al rival de prestado — ver comentario largo ahí.
  let _onScoreSync = null; // cb(score) — puntaje ya conocido reenviado a quien se une a mitad de ronda (ver SoloSpectate.reportScoreSync)
  let _onSpectatorCount = null; // cb(n) — cuántos espectadores hay mirando (a este mismo incluido), ver watchSolo
  let _onGqGuesses = null; // cb(list) — GlobeQuiz: TODOS los guesses ya hechos, reenviados a quien se une a mitad de partida (ver reportGqGuesses)

  function _myId() { return window._sbUserId || null; }

  // Trae el match. La policy RLS "matches_select_friends" es la que decide si
  // puedo ver esta fila (amigo aceptado de host o guest); si no soy amigo,
  // `data` vuelve null/[] y no hay nada más que hacer.
  async function _getMatch(id) {
    const { data, error } = await window.sb
      .from('matches').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async function watch(matchId, opts) {
    await stop(); // por si venía mirando otro match
    const match = await _getMatch(matchId);
    if (!match) throw new Error('match_not_found');
    _matchId = matchId;
    _match   = match;
    _watchOpts = opts || null;

    const uid = _myId();
    _channel = window.sb
      .channel('match-' + matchId, { config: { presence: { key: 'spectator-' + (uid || Math.random().toString(36).slice(2)) } } })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: 'id=eq.' + matchId,
      }, payload => {
        const m = payload.new;
        _match = m;
        if (_onScore) _onScore(m.host_score, m.guest_score);
        if (m.status === 'finished')  { if (_onEnd) _onEnd('finished');  stop(); }
        if (m.status === 'abandoned') { if (_onEnd) _onEnd('abandoned'); stop(); }
      })
      .on('broadcast', { event: 'score' }, ({ payload }) => {
        if (!payload || !_match) return;
        // El broadcast de score no dice de quién es directamente (lo manda cada
        // jugador con su propio rol) — nos alcanza con refrescar desde el estado
        // conocido más reciente vía postgres_changes; para no perder el tiempo
        // real igual reflejamos el valor entrante en ambos lados si coincide con
        // lo que cada jugador reportaría (host/guest se resuelve por payload.role
        // cuando viene incluido desde vs.js reportScore).
        if (payload.role === 'host') _match.host_score = payload.score;
        else if (payload.role === 'guest') _match.guest_score = payload.score;
        if (_onScore) _onScore(_match.host_score, _match.guest_score);
      })
      .on('broadcast', { event: 'wrong' }, ({ payload }) => { if (_onWrong) _onWrong(payload && payload.role); })
      .on('broadcast', { event: 'answer' }, ({ payload }) => { if (payload && _onAnswer) _onAnswer(payload); })
      .on('broadcast', { event: 'round' }, ({ payload }) => { if (payload && _onRound) _onRound(payload); })
      .on('broadcast', { event: 'tick' }, ({ payload }) => { if (payload && _onTick) _onTick(payload.timeLeft, payload.role); })
      .on('broadcast', { event: 'timesup' }, ({ payload }) => { if (_onTimesUp) _onTimesUp(payload && payload.role); })
      .on('broadcast', { event: 'pregame' }, ({ payload }) => { if (_onPregame) _onPregame(payload); })
      .on('broadcast', { event: 'postgame' }, ({ payload }) => { if (payload && _onPostgame) _onPostgame(payload); })
      .on('broadcast', { event: 'gameend' }, ({ payload }) => { if (payload && _onGameEnd) _onGameEnd(payload); })
      // Contador de espectadores — mismo mecanismo que watchSolo() (ver ese
      // comentario largo), pero acá faltaba del todo: el espectador de un
      // VERSUS nunca se enteraba de cuántos otros lo estaban mirando a él
      // también, así que el ojito+contador (_applySpectatorBadge) nunca se
      // activaba en esta sesión.
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = _channel.presenceState();
          const n = Object.keys(state).filter(k => k.indexOf('spectator-') === 0).length;
          if (_onSpectatorCount) _onSpectatorCount(n);
        } catch (e) {}
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        // Solo cerrar si ya NINGÚN jugador (host/guest) queda en el canal — un
        // solo lado desconectándose no significa que la partida terminó (vs.js
        // ya maneja el abandono real vía status='abandoned' con su propia
        // gracia); esto es solo un backup por si ambos se fueron sin que el
        // status llegara a actualizarse.
        // suppressPresenceGone (ver _enterWaitAsSpectator en vs.js): cuando
        // el que espectea es EL PROPIO JUGADOR mirando a su rival de
        // prestado, su viejo canal de VS se acaba de soltar (releaseChannel)
        // JUSTO antes de crear este — hay una ventana de carrera real donde
        // este canal nuevo puede ver el "leave" de esa presencia vieja (la
        // MÍA, no la del rival) antes de que la sync inicial refleje al
        // rival todavía presente, y "playersLeft" da 0 por un instante —
        // detectando un abandono que nunca pasó (el "detecto que el rival
        // abandonó" reportado). Con esta bandera activa, esa detección
        // heurística por presencia se desactiva del todo — el abandono real
        // sigue llegando igual por status='abandoned' (postgres_changes),
        // que no depende de presence y no tiene esta carrera.
        if (_watchOpts && _watchOpts.suppressPresenceGone) return;
        if (!key || key.indexOf('spectator-') === 0) return;
        try {
          const state = _channel.presenceState();
          const playersLeft = Object.keys(state).filter(k => k.indexOf('spectator-') !== 0).length;
          if (playersLeft === 0) { if (_onEnd) _onEnd('gone'); stop(); }
        } catch (e) {}
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await _channel.track({ t: Date.now() }); } catch (e) {}
          if (_onSnapshot) _onSnapshot(_match);
        }
      });
  }

  // Mirar una partida INDIVIDUAL (Gira Mundial / modo solo) de un amigo — no hay
  // fila en `matches`, así que nos unimos directo al canal fijo 'solo-{userId}'
  // que abre SoloSpectate del lado del jugador. Sin snapshot de DB: si el amigo
  // ya está a mitad de ronda, recién vemos la próxima ronda que se transmita.
  //
  // A diferencia de watch() (VS 1v1), este canal de Realtime no tiene ningún
  // RLS de por medio (no hay fila en `matches` que consultar primero) — sin
  // este chequeo, cualquiera logueado podía abrir la consola del navegador y
  // llamar Spectate.watchSolo('<userId-de-cualquiera>') para mirar la partida
  // en vivo de alguien sin ser su amigo, saltándose por completo el botón del
  // ojito (que solo oculta la opción en la UI, no protege nada). Mismo criterio
  // que la policy 'matches_select_friends': solo amigos aceptados, o uno mismo.
  async function _isFriendOf(userId) {
    const uid = _myId();
    if (!uid) return false;
    if (uid === userId) return true;
    try {
      const { data } = await window.sb.from('friendships').select('id')
        .or(`and(user_a.eq.${uid},user_b.eq.${userId}),and(user_a.eq.${userId},user_b.eq.${uid})`)
        .eq('status', 'accepted').maybeSingle();
      return !!data;
    } catch (e) { return false; }
  }
  async function watchSolo(userId) {
    await stop();
    if (!(await _isFriendOf(userId))) throw new Error('not_friends');
    _isSolo  = true;
    _matchId = userId;
    _match   = { mode: null, score: 0, solo: true };

    const uid = _myId();
    _channel = window.sb
      .channel('solo-' + userId, { config: { presence: { key: 'spectator-' + (uid || Math.random().toString(36).slice(2)) } } })
      // Mismo canal que ve el jugador real (dueño de 'solo-{userId}') — el
      // espectador también recibe estos eventos de presence, así que puede
      // mostrar cuánta gente hay mirando (a él mismo incluido) sin necesitar
      // un mensaje aparte del jugador. 'sync' (no join/leave) por la misma
      // razón que en SoloSpectate._updateSpectatorCount: es el único evento
      // que garantiza que presenceState() ya está consistente.
      // Usa el MISMO ícono/cartel que ve el jugador de sí mismo
      // (#vs-spectator-badge/#flags-vs-spectator-badge, misma posición fija
      // en pantalla) — no uno aparte: el espectador ve exactamente lo que
      // vería el jugador si a ÉL lo estuvieran espectando. Este módulo
      // (watchSolo) es un closure DISTINTO del que arma la UI real más abajo
      // en el archivo (loadingEl/_hideLoading/etc no existen acá) — por eso
      // se avisa con un callback registrado (_onSpectatorCount) en vez de
      // tocar el DOM directo.
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = _channel.presenceState();
          const n = Object.keys(state).filter(k => k.indexOf('spectator-') === 0).length;
          if (_onSpectatorCount) _onSpectatorCount(n);
        } catch (e) {}
      })
      .on('broadcast', { event: 'round' }, ({ payload }) => { if (payload && _onRound) { _match.mode = payload.mode || _match.mode; _onRound(payload); } })
      .on('broadcast', { event: 'answer' }, ({ payload }) => {
        if (!payload) return;
        if (typeof payload.score === 'number') _match.score = payload.score;
        if (_onAnswer) _onAnswer(payload);
        if (_onScore) _onScore(_match.score, null);
      })
      .on('broadcast', { event: 'tick' }, ({ payload }) => { if (payload && _onTick) _onTick(payload.timeLeft, payload.role); })
      .on('broadcast', { event: 'timesup' }, ({ payload }) => { if (_onTimesUp) _onTimesUp(payload && payload.role); })
      .on('broadcast', { event: 'splash' }, ({ payload }) => { if (_onSplash) _onSplash(payload || {}); })
      .on('broadcast', { event: 'pregame' }, ({ payload }) => { if (_onPregame) _onPregame(payload); })
      .on('broadcast', { event: 'postgame' }, ({ payload }) => { if (payload && _onPostgame) _onPostgame(payload); })
      .on('broadcast', { event: 'advancing' }, () => { if (_onAdvancing) _onAdvancing(); })
      .on('broadcast', { event: 'gqguesses' }, ({ payload }) => { if (payload && _onGqGuesses) _onGqGuesses(payload.list); })
      .on('broadcast', { event: 'scoresync' }, ({ payload }) => { if (payload && _onScoreSync) _onScoreSync(payload.score, payload.dots); })
      .on('presence', { event: 'leave' }, ({ key }) => {
        // Único "jugador" posible en este canal es el dueño (userId, sin prefijo
        // 'spectator-'); si se va, dejó de jugar.
        if (key && key.indexOf('spectator-') !== 0) { if (_onEnd) _onEnd('finished'); stop(); }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await _channel.track({ t: Date.now() }); } catch (e) {}
          if (_onSnapshot) _onSnapshot(_match);
          // No hay snapshot de DB para partidas individuales: si a los pocos
          // segundos no apareció el dueño del canal en presence, no está
          // jugando en realidad (badge stale) — avisar y cerrar.
          setTimeout(() => {
            if (!_channel) return;
            try {
              const state = _channel.presenceState();
              const hasOwner = Object.keys(state).some(k => k.indexOf('spectator-') !== 0);
              if (!hasOwner) { if (_onEnd) _onEnd('gone'); stop(); }
            } catch (e) {}
          }, 4000);
        }
      });
  }

  // Devuelve una promesa que resuelve recién cuando el canal viejo terminó
  // de irse de verdad (untrack + unsubscribe) — watchSolo() la espera antes
  // de abrir el canal nuevo. Antes esto era fire-and-forget: watchSolo()
  // seguía de largo mientras el untrack() todavía estaba en vuelo, así que
  // si el espectador volvía a entrar rápido, el canal NUEVO (misma key
  // 'spectator-{uid}') se suscribía mientras el VIEJO todavía no había
  // terminado de anunciar que se iba — el jugador podía llegar a ver ambos
  // superpuestos un instante, o directamente quedarse pegado en 2 si el
  // 'leave' del viejo se procesaba en el servidor DESPUÉS del 'join' del
  // nuevo (el "se duplica el ícono del ojo" reportado).
  // Nunca puede quedar colgado esperando: si untrack()/unsubscribe() del
  // canal viejo no responden (conexión rota, socket ya muerto, lo que sea),
  // watchSolo() de más abajo hace `await stop()` ANTES de abrir el canal
  // nuevo — si stop() se cuelga para siempre, el espectador se quedaba
  // trabado en "Cargando partida..." sin error ni éxito nunca (ni conecta ni
  // falla), el reportado. Con timeout, a los 2s sigue de largo igual.
  function _withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(resolve, ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
  async function stop() {
    if (_channel) {
      const chToClose = _channel;
      _channel = null;
      try { await _withTimeout(chToClose.untrack(), 2000); } catch (e) {}
      try { await _withTimeout(chToClose.unsubscribe(), 2000); } catch (e) {}
    }
    _matchId = _match = null;
    _isSolo = false;
    _watchOpts = null;
  }

  return {
    watch,
    watchSolo,
    stop,
    onSnapshot: cb => { _onSnapshot = cb; },
    onScore:    cb => { _onScore = cb; },
    onAnswer:   cb => { _onAnswer = cb; },
    onWrong:    cb => { _onWrong = cb; },
    onEnd:      cb => { _onEnd = cb; },
    onRound:    cb => { _onRound = cb; },
    onTick:     cb => { _onTick = cb; },
    onTimesUp:  cb => { _onTimesUp = cb; },
    onSplash:   cb => { _onSplash = cb; },
    onPregame:  cb => { _onPregame = cb; },
    onPostgame: cb => { _onPostgame = cb; },
    onAdvancing: cb => { _onAdvancing = cb; },
    onGameEnd:  cb => { _onGameEnd = cb; },
    onScoreSync: cb => { _onScoreSync = cb; },
    onSpectatorCount: cb => { _onSpectatorCount = cb; },
    onGqGuesses: cb => { _onGqGuesses = cb; },
    getMatch:   () => _match,
    getMatchId: () => _matchId,
    isSolo:     () => _isSolo,
  };
})();

// ── MODO ESPECTADOR GRUPAL (lobby de hasta 10) ──────────────────────────────
// Mirror de solo-lectura del canal 'lobby-{id}' que usa LB (lobby.js) para
// transmitir ronda/tick/pregame/postgame de cada miembro (ver los sendRound/
// sendTick/etc agregados ahí). A diferencia de Spectate (1v1, un rol binario
// host/guest fijo por sesión) acá puede haber hasta 10 emisores distintos en
// el MISMO canal — en vez de "amigo/rival" se trackea _currentPovMemberId
// (cuál de los N miembros se está mirando ahora mismo), que las flechas de
// la UI (ver openSpectatorGroup más abajo) cambian en caliente SIN reconectar
// el canal, porque todos los miembros ya transmiten al mismo topic — cambiar
// de POV es simplemente empezar a aceptar los broadcasts de OTRO uid.
window.GroupSpectate = (() => {
  let _lobbyId = null;
  let _channel = null;
  let _members = []; // [{id,name,avatar}]
  let _currentPovMemberId = null;
  let _onMembers        = null; // cb(members)
  let _onRoomEmpty      = null; // cb() — no queda ningún jugador en la sala (todos se fueron)
  let _onRound          = null;
  let _onTick           = null;
  let _onPregame        = null;
  let _onPostgame       = null;
  let _onAnswer         = null;
  let _onTimesUp        = null;
  let _onTimesUpAny     = null; // cb(memberId) — a CUALQUIER miembro se le acabó el tiempo (no filtrado por POV, como _onWrong)
  let _onSplash         = null;
  let _onAdvancing      = null;
  let _onWrong          = null; // cb(memberId) — CUALQUIER miembro falló (no filtrado por POV)
  let _onSpectatorCount = null;
  let _onPovChanged     = null; // cb(memberId) — las flechas cambiaron de POV
  let _onScore          = null; // cb(memberId, score) — cartilla lateral en vivo
  let _onFinished       = null; // cb(memberId, score) — reenvío del 'finished' de LB, ver _enterGroupWaitAsSpectator en lobby.js
  let _onReveal         = null; // cb(revealAt, isFinal) — reloj de pared compartido, ver LB.sendReveal/onReveal en lobby.js
  let _onAnyActivity    = null; // cb(memberId) — CUALQUIER round/tick de CUALQUIER miembro (no solo el POV), para el latido del salvavidas de lobby.js
  const _scores = {}; // uid → score, para que la cartilla lateral sobreviva a un _fetchMembers() de por medio
  const _dots   = {}; // uid → trencito de puntos (streak), mismo motivo que _scores pero para el marcador principal
  // Último estado conocido de CADA miembro (no solo el POV actual) — todos
  // sus broadcasts ya pasan por este mismo canal aunque no se muestren, así
  // que cachearlos es gratis. Sin esto, cambiar de POV con las flechas dejaba
  // la pantalla vieja congelada hasta que la persona NUEVA hiciera algo (el
  // próximo tick, hasta 1s después) en vez de reflejar YA su estado actual —
  // el "no se cambia al instante" reportado. Mismo patrón que _resendStateTo
  // en vs.js/SoloSpectate, pero por miembro en vez de único.
  const _lastState = {}; // uid → { phase: 'round'|'pregame'|'postgame', round, tick, pregame, postgame }
  function _stateFor(uid) { return _lastState[uid] || (_lastState[uid] = { phase: null, round: null, tick: null, pregame: null, postgame: null }); }
  // Miembros que YA terminaron su cronómetro de ESTE modo (broadcast
  // 'timesup') — no hay nada que espectar de ellos hasta que arranque el
  // modo/partida siguiente (splash/pregame/round nuevo los saca de acá otra
  // vez). Las flechas (switchPov) los saltean; si el POV actual justo cae
  // acá (el propio miembro que estás mirando terminó), se salta solo al
  // próximo disponible — el "en ese preciso momento que sale times up, su
  // posibilidad de ser espectado se debe quitar" reportado.
  const _finishedUids = new Set();
  let _trackDebounceTimer = null;
  // Reconexión automática: el WebSocket de Supabase Realtime puede cerrarse
  // solo (server lo cierra por inactividad/límite, glitch de red) — el canal
  // pasa a CLOSED/CHANNEL_ERROR/TIMED_OUT y el espectador se quedaba en
  // "reconectando con Usuario" para siempre, sin recuperar (reportado). Con
  // esto, si el cierre NO fue intencional (_stopping), se re-suscribe solo
  // con backoff, preservando a quién estaba mirando. _stopping distingue el
  // cierre a propósito (stop()) del inesperado.
  let _stopping = false;
  let _reconnectTimer = null;
  let _reconnectAttempts = 0;
  let _reconnecting = false;
  let _onReconnecting = null; // cb() — se cayó el canal, reconectando
  let _onReconnected  = null; // cb() — volvió a SUBSCRIBED tras una caída
  let _postgameFallbackTimer = null; // ver _armPostgameFinalFallback (salvavidas si se pierde el postgame final)
  // Salvavidas: si tras el 'reveal' final el broadcast 'postgame' no llega en
  // ~3.5s, reconstruye la tabla FINAL con los puntajes cacheados en _members
  // (.score, alimentado por 'lbscore') y la dispara como si fuera el postgame
  // real. Así el espectador nunca queda congelado por perder ESE broadcast.
  function _armPostgameFinalFallback() {
    if (_postgameFallbackTimer) return;
    _postgameFallbackTimer = setTimeout(() => {
      _postgameFallbackTimer = null;
      if (!_onPostgame) return;
      const members = _members.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
      _onPostgame({ kind: 'final', members, _fallback: true });
    }, 3500);
  }
  // Manda el track() de presence (pov actual) recién 400ms DESPUÉS del
  // último cambio de POV, no en cada uno — ver comentario largo en
  // _movePov. Coalesce cualquier ráfaga de clicks en un solo mensaje al
  // servidor con el valor final.
  let _lastTrackAt = 0;
  let _lastTrackedPov = null;
  let _advancePovTimer = null; // margen antes de forzar cambio de POV al terminar el actual (ver 'timesup')
  // THROTTLE DURO: máx 1 track() cada 2s, y solo si el POV realmente cambió
  // desde el último. El track() de presence (contador de espectadores) NO
  // necesita ser instantáneo, y mandarlo seguido — incluso a ~1/seg cambiando
  // de POV tranquilo — parece ser lo que el server de Realtime corta (CLOSED
  // → reconexión). Cambiando de POV cada 1-1.5s antes se mandaba ~1 track/seg;
  // ahora, como mucho 1 cada 2s con el valor final.
  function _scheduleTrack() {
    clearTimeout(_trackDebounceTimer);
    const doTrack = () => {
      if (!_channel || _currentPovMemberId === _lastTrackedPov) return;
      _lastTrackedPov = _currentPovMemberId;
      _lastTrackAt = Date.now();
      _channel.track({ pov: _currentPovMemberId, t: Date.now() }).catch(() => {});
    };
    const since = Date.now() - _lastTrackAt;
    if (since >= 2000) doTrack();
    else _trackDebounceTimer = setTimeout(doTrack, 2000 - since);
  }

  function _myId() { return window._sbUserId || null; }
  function _isFromPov(uid) { return !!uid && uid === _currentPovMemberId; }

  async function _fetchMembers(lobbyId) {
    const { data, error } = await window.sb.from('lobby_members')
      .select('user_id, score, live_state, p:user_id(username, avatar_url, frame_code, card_code)').eq('lobby_id', lobbyId).order('joined_at');
    if (error) console.warn('[spec] GroupSpectate._fetchMembers error', error);
    if (error || !data) return [];
    return data.map(m => {
      // _scores (en vivo, vía broadcast 'lbscore') pisa el score de la DB si
      // ya llegó algo más reciente — la fila puede tardar en reflejar el
      // último UPDATE, el broadcast es inmediato.
      if (typeof _scores[m.user_id] !== 'number') _scores[m.user_id] = m.score || 0;
      // live_state (ver group_live_state.sql + LB._persistLiveState en
      // lobby.js): última fase/ronda/pregame/postgame que este miembro tenía
      // ANTES de que este canal se conectara — sin esto, conectarse o
      // cambiar de POV a alguien que ya está a mitad de partida no mostraba
      // nada hasta su PRÓXIMO broadcast en vivo (el "recién funciona cuando
      // cometen una acción" reportado). No pisar un _lastState ya más
      // reciente que haya llegado por broadcast mientras tanto.
      if (m.live_state && !_lastState[m.user_id]) {
        _lastState[m.user_id] = {
          phase: m.live_state.phase || null,
          round: m.live_state.round || null,
          tick: (m.live_state.round && typeof m.live_state.round.timeLeft === 'number') ? m.live_state.round.timeLeft : null,
          pregame: m.live_state.pregame || null,
          postgame: m.live_state.postgame || null,
        };
      }
      // Solo SUMA a _finishedUids, nunca saca en base a esto — _fetchMembers
      // se re-ejecuta cada vez que cambia CUALQUIER fila de lobby_members
      // (alguien entra/sale), y esa lectura puede llegar con el UPDATE de
      // live_state todavía en camino (más lento que el broadcast en vivo que
      // ya lo hubiera limpiado hace rato) — "sacar" acá en base a un dato
      // viejo reintroduciría al miembro como excluido de la rotación después
      // de que ya había vuelto a jugar de verdad.
      if (m.live_state && m.live_state.finished) _finishedUids.add(m.user_id);
      return {
        id: m.user_id,
        name: (m.p && m.p.username) || '?',
        avatar: (m.p && m.p.avatar_url) || 'images/profilepic/ppdefault.png',
        score: _scores[m.user_id] || 0,
        // frameCode: usado por el mini-HUD (spectator-mini-avatar) al mirar a
        // este miembro por POV. cardCode: usado por _renderGroupLeaderboardInner
        // para la ficha de cada miembro en el leaderboard — antes ninguno de
        // los dos se pedía acá, así que el espectador grupal siempre veía todo
        // en default sin importar qué tuviera cada jugador equipado de verdad.
        frameCode: (m.p && m.p.frame_code) || '0001',
        cardCode: (m.p && m.p.card_code) || '0001',
      };
    });
  }

  // initialMemberId: con cuál miembro arrancar el POV (ej. el que tenía el
  // ojo clickeado) — si no se pasa, el primero de la sala.
  // opts.preFinishedUids: uids que YA terminaron esta ronda de modos antes de
  // que este canal se conectara (ver _enterGroupWaitAsSpectator en lobby.js
  // — el jugador que termina primero y se pone a mirar de prestado a los que
  // siguen jugando necesita saber, desde el vamos, quién más ya terminó
  // ANTES que él, no solo enterarse de futuros 'timesup' — si no, las
  // flechas podían ofrecerle mirar a alguien que ya no tiene nada que
  // mostrar).
  async function watch(lobbyId, initialMemberId, opts) {
    await stop();          // stop() deja _stopping=true
    _stopping = false;     // arrancando/reconectando esta sesión — reconexión permitida de acá en más
    if (!(opts && opts._isReconnect)) _reconnectAttempts = 0; // sesión nueva (no reconexión) → backoff limpio
    _lobbyId = lobbyId;
    _members = await _fetchMembers(lobbyId);
    if (opts && Array.isArray(opts.preFinishedUids)) {
      opts.preFinishedUids.forEach(uid => _finishedUids.add(uid));
    }
    // Filtrar por _finishedUids acá TAMBIÉN — mismo criterio que _movePov()
    // (más abajo), que nunca elegiría a alguien ya terminado. Sin este
    // filtro, si el initialMemberId sugerido (ver _enterGroupWaitAsSpectator
    // en lobby.js) resultaba ser alguien que YA había terminado (ej. dos
    // jugadores terminan casi juntos y uno todavía no se enteró del
    // 'finished' del otro por la carrera de soltar canales al mismo
    // tiempo), el POV arrancaba fijo en un miembro que no manda NADA más
    // (ya mandó su 'timesup' antes de que este canal se conectara) — sin
    // ronda/tick nuevo, _advanceToNextAvailable() nunca se disparaba
    // (depende de recibir el 'timesup' DE NUEVO) y quedaba trabado ahí para
    // siempre — el "los dos que terminan antes se quedan congelados"
    // reportado.
    const _availInitial = _members.filter(m => !_finishedUids.has(m.id));
    _currentPovMemberId = (initialMemberId && _availInitial.some(m => m.id === initialMemberId))
      ? initialMemberId : (_availInitial[0] && _availInitial[0].id) || (_members[0] && _members[0].id) || null;
    if (_onMembers) _onMembers(_members);
    // _fetchMembers ya sembró _lastState desde live_state (DB) para quien no
    // tuviera nada cacheado todavía — reenviarlo YA en vez de esperar el
    // próximo broadcast en vivo del POV inicial (mismo motivo que en
    // switchPov, ver _resendState).
    if (_currentPovMemberId) _resendState(_currentPovMemberId);

    const uid = _myId();
    _channel = window.sb
      .channel('lobby-' + lobbyId, { config: { presence: { key: 'spectator-' + (uid || Math.random().toString(36).slice(2)) } } })
      // Mismos nombres de evento que manda LB (lobby.js sendRound/sendTick/etc)
      // — cada payload trae `uid`, filtramos acá por _currentPovMemberId en
      // vez de por role host/guest.
      .on('broadcast', { event: 'round' },     ({ payload }) => {
        if (!payload || !payload.uid) return;
        const st = _stateFor(payload.uid);
        st.phase = 'round'; st.round = payload; st.tick = null; st.pregame = null; st.postgame = null;
        _finishedUids.delete(payload.uid); // volvió a jugar (modo nuevo) — vuelve a ser espectable
        // Latido de "alguien SIGUE jugando" — dispara para CUALQUIER miembro,
        // NO solo el POV actual (ver _onAnyActivity). CRÍTICO para el
        // salvavidas de 12s de lobby.js: si estoy mirando de prestado a un
        // jugador que ya terminó (ej. 2 terminan casi juntos y quedé mirando
        // al otro que ya acabó, no al que sigue), ese jugador no manda nada,
        // así que _onRound/_onTick del POV nunca disparan — pero el que SÍ
        // sigue jugando manda ticks/rondas que llegan igual acá (mismo
        // topic), y ESTE latido no-filtrado-por-POV reprograma el salvavidas
        // para que NO dispare antes de tiempo (el "los 2 que terminan antes
        // se congelan" reportado).
        if (_onAnyActivity) _onAnyActivity(payload.uid);
        if (_isFromPov(payload.uid) && _onRound) _onRound(payload);
      })
      .on('broadcast', { event: 'gtick' },     ({ payload }) => {
        if (!payload || !payload.uid) return;
        const st = _stateFor(payload.uid);
        st.tick = payload.timeLeft;
        // Un tick real solo llega DESPUÉS de que el 3-2-1 de ESE miembro ya
        // terminó — sin esto, st.phase se quedaba en 'pregame' (lo dejó el
        // broadcast 'pregame' de esa ronda) durante TODA la ronda 1 completa,
        // hasta que llegara el 'round' de la ronda 2. _resendState() mira
        // st.phase ANTES que st.round — así que cambiar de POV en pleno medio
        // de la ronda 1 volvía a reproducir el 3-2-1/GO (y su música) cada
        // vez, en vez de mostrar el tablero ya en curso (el "en la primera
        // ronda cada cambio de POV mete el GO de nuevo, se arregla en la
        // segunda ronda" reportado — de ahí en más el 'round' de esa ronda ya
        // había puesto phase='round').
        if (st.phase === 'pregame') st.phase = 'round';
        if (_onAnyActivity) _onAnyActivity(payload.uid); // ver comentario en 'round'
        if (_isFromPov(payload.uid) && _onTick) _onTick(payload.timeLeft);
      })
      .on('broadcast', { event: 'pregame' },   ({ payload }) => {
        if (!payload || !payload.uid) return;
        const st = _stateFor(payload.uid);
        st.phase = 'pregame'; st.pregame = payload;
        _finishedUids.delete(payload.uid);
        if (_isFromPov(payload.uid) && _onPregame) _onPregame(payload);
      })
      .on('broadcast', { event: 'postgame' },  ({ payload }) => {
        if (!payload || !payload.uid) return;
        // kind:'intermediate'/'final' es el RANKING DE TODA LA SALA (ver
        // _presentIntermediateResult/_showLobbyResult en lobby.js) — no es
        // el postgame individual de un miembro (en partidas de sala nunca se
        // manda uno real, ver _lobbyHandleGameEnd), así que NUNCA se filtra
        // por POV (todos tienen que ver la tabla apenas está lista) NI se
        // cachea en _lastState[uid]: quien mandó este broadcast (típicamente
        // el último en terminar) no "queda marcado" con esto como si fuera
        // SU estado de juego — sin este guard, _resendState() podía
        // reproducirle este ranking VIEJO a un espectador que después
        // cambiara el POV hacia esa persona en un modo siguiente, tapando
        // una partida nueva ya en curso con el resultado de la ronda
        // anterior.
        if (payload.kind === 'intermediate' || payload.kind === 'final') {
          // El postgame REAL llegó — cancelar el fallback (ver reveal handler).
          clearTimeout(_postgameFallbackTimer); _postgameFallbackTimer = null;
          // intermediate = la sala pasa al SIGUIENTE modo — reiniciar el pool
          // de POVs bloqueados: en el modo nuevo TODOS vuelven a jugar, así
          // que el espectador tiene que poder verlos de nuevo a todos. Sin
          // esto, los que habían terminado antes en el modo anterior quedaban
          // bloqueados de la rotación también en el modo siguiente (reportado).
          // Los round/pregame de cada uno igual los des-bloquean uno a uno,
          // pero limpiar acá lo hace de una y sin esperar.
          if (payload.kind === 'intermediate') {
            _finishedUids.clear();
            // Limpiar el estado cacheado de TODOS los miembros — es del modo
            // ANTERIOR (ronda vieja, timer bajo=rojo, assets de cities/etc).
            // Sin esto, al arrancar el modo siguiente _resendState replayaba
            // ese estado viejo ANTES de que llegara la data nueva: se veía el
            // countdown rojo en el 60s inicial y se mezclaban assets/textos
            // del modo anterior con el nuevo (monuments↔cities, reportado).
            // El próximo round/pregame real de cada uno lo repuebla limpio.
            Object.keys(_lastState).forEach(k => delete _lastState[k]);
            // Los puntitos del bonus (streak) también son del modo anterior —
            // arrancan en 0 cada modo. Sin limpiar, el modo nuevo mostraba los
            // puntitos viejos hasta la primera respuesta. (_scores NO se limpia:
            // el puntaje es ACUMULATIVO entre modos.)
            Object.keys(_dots).forEach(k => delete _dots[k]);
          }
          if (_onPostgame) _onPostgame(payload);
          return;
        }
        const st = _stateFor(payload.uid);
        st.phase = 'postgame'; st.postgame = payload;
        if (_isFromPov(payload.uid) && _onPostgame) _onPostgame(payload);
      })
      .on('broadcast', { event: 'ganswer' },   ({ payload }) => {
        if (!payload || !payload.uid) return;
        // Cachear score/dots de CUALQUIER miembro (no solo el POV actual) —
        // mismo motivo que _scores: sin esto, cambiar de POV con las
        // flechas dejaba pegado el marcador y el trencito de puntos del
        // miembro ANTERIOR hasta que el nuevo respondiera algo (el "los
        // puntos no se prenden/apagan en vivo, reacciona recién cuando
        // cometen una acción" reportado).
        if (typeof payload.score === 'number') { _scores[payload.uid] = payload.score; const m = _members.find(x => x.id === payload.uid); if (m) m.score = payload.score; }
        if (typeof payload.dots === 'number') _dots[payload.uid] = payload.dots;
        if (_isFromPov(payload.uid) && _onAnswer) _onAnswer(payload);
      })
      .on('broadcast', { event: 'timesup' },   ({ payload }) => {
        if (!payload || !payload.uid) return;
        const wasCurrentPov = _isFromPov(payload.uid);
        _finishedUids.add(payload.uid);
        // Efecto "se acabó el tiempo" en la cartilla de ESE miembro (temblor +
        // cronómetro) — NO filtrado por POV: se ve para CUALQUIER miembro que
        // se quede sin tiempo, igual que el flash de 'wrong' (ver _onWrong).
        if (_onTimesUpAny) _onTimesUpAny(payload.uid);
        if (wasCurrentPov && _onTimesUp) _onTimesUp();
        // Si justo estaba mirando a ESTE miembro, saltar al próximo disponible
        // — pero con un MARGEN, no al instante. Los timesups llegan
        // escalonados: si TODOS terminaron casi a la par, en el momento del
        // timesup del POV actual los demás todavía no reportaron el suyo, así
        // que parecían "seguir jugando" y se forzaba un salto a uno de ellos
        // (que en realidad ya había terminado) — el "fuerza cambio de POV
        // aunque todos terminaron a la vez" reportado. Al esperar ~600ms, si
        // para entonces terminaron todos, _advanceToNextAvailable no tiene a
        // dónde saltar (no hace nada); si de verdad quedan jugando, ahí sí
        // salta. Solo se ejecuta si el POV sigue siendo este miembro.
        if (wasCurrentPov) {
          clearTimeout(_advancePovTimer);
          _advancePovTimer = setTimeout(() => {
            if (_isFromPov(payload.uid)) _advanceToNextAvailable();
          }, 600);
        }
      })
      .on('broadcast', { event: 'splash' },    ({ payload }) => {
        if (!payload || !payload.uid) return;
        const st = _stateFor(payload.uid);
        st.phase = 'splash'; st.splash = payload;
        _finishedUids.delete(payload.uid);
        if (_isFromPov(payload.uid) && _onSplash) _onSplash(payload);
      })
      .on('broadcast', { event: 'advancing' }, ({ payload }) => { if (payload && _isFromPov(payload.uid) && _onAdvancing) _onAdvancing(); })
      // Falló una pregunta — mismo evento 'wrong' que ya usa LB (lobby.js,
      // sendWrong/onWrong) para el flash que ve el jugador real en su propio
      // leaderboard cuando OTRO miembro falla. A diferencia del resto de los
      // eventos, ESTE no se filtra por POV: el jugador real ve el flash de
      // CUALQUIER miembro que falle en su cartilla lateral, esté mirándolo o
      // no en este momento — antes acá solo se avisaba si coincidía con el
      // POV actual, así que un fallo de alguien que no estabas mirando
      // quedaba mudo (el "solo funciona cuando ves a esa persona, no de la
      // sala en general" reportado). Se manda el uid para que la UI decida
      // en QUÉ fila de la cartilla flashear.
      .on('broadcast', { event: 'wrong' }, ({ payload }) => { if (payload && payload.uid && _onWrong) _onWrong(payload.uid); })
      // Score en vivo de CUALQUIER miembro (no solo el POV actual) — para la
      // cartilla lateral con todos los puntajes, igual que ve el jugador real
      // (ver LB.onScore en lobby.js, mismo evento 'lbscore').
      .on('broadcast', { event: 'lbscore' }, ({ payload }) => {
        if (!payload || !payload.uid) return;
        _scores[payload.uid] = payload.score || 0;
        const m = _members.find(x => x.id === payload.uid);
        if (m) m.score = _scores[payload.uid];
        if (_onScore) _onScore(payload.uid, _scores[payload.uid]);
      })
      // Alguien se unió/salió de la sala mientras se espectea — refrescar la
      // lista para que las flechas no ofrezcan a alguien que ya no está.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, () => {
        _fetchMembers(_lobbyId).then(m => {
          _members = m;
          if (_onMembers) _onMembers(_members);
          // Backup del handler de presence 'leave' (cubre el abandono real, que
          // borra la fila de lobby_members): con 1 o 0 miembros reales ya no
          // queda partida que espectar de verdad (mismo umbral que "quedé
          // solo" del lado jugador, ver _onAlone en lobby.js) → kick; POV
          // actual ya no está → avanzar al siguiente disponible.
          if (_members.length <= 1) { if (_onRoomEmpty) _onRoomEmpty(); return; }
          if (_currentPovMemberId && !_members.some(x => x.id === _currentPovMemberId)) _advanceToNextAvailable();
        });
      })
      // 'finished' (LB.sendFinished) — reenviado tal cual para que
      // _enterGroupWaitAsSpectator (lobby.js) pueda seguir alimentando su
      // PROPIO _checkAllFinished() mientras dura el "de prestado", aunque su
      // canal real de LB esté suelto (releaseChannel) y por eso nunca le
      // llegaría este mismo evento por esa vía. Sin esto, ese jugador
      // dependía ENTERAMENTE de que otro cliente le mandara el ranking ya
      // armado (kind:'intermediate'/'final') — si ESE broadcast se perdía
      // por lo que sea, se quedaba esperando sin ningún otro camino hasta el
      // salvavidas de 30s (el "se quedan congelados... nunca les sale el
      // panel" reportado).
      .on('broadcast', { event: 'finished' }, ({ payload }) => {
        if (!payload || !payload.uid) return;
        // Un jugador puede terminar SIN que se le acabe el reloj (responde
        // todo antes de tiempo) — ahí solo llega este 'finished', nunca
        // 'timesup'. Antes _finishedUids solo se llenaba desde 'timesup', así
        // que a este jugador el handler de presence 'leave' (más abajo) no lo
        // reconocía como fin normal cuando soltaba su canal para pasar a
        // espectar a los demás: lo sacaba de _members como si se hubiera
        // desconectado de verdad, y sin otro evento que lo repusiera quedaba
        // "perdido" (sin flash de wrong, sin score en vivo) el resto del modo
        // y arrastrado al modo siguiente (el "los que terminan antes parecen
        // desconectarse del versus" reportado).
        _finishedUids.add(payload.uid);
        if (_onFinished) _onFinished(payload.uid, payload.score);
      })
      // Reloj de pared compartido (ver LB.sendReveal/_checkAllFinished en
      // lobby.js) — mismo topic, así que llega acá igual sin importar que
      // el canal de LB propio esté suelto mientras se espectea de prestado.
      .on('broadcast', { event: 'reveal' }, ({ payload }) => {
        if (!payload || typeof payload.revealAt !== 'number') return;
        if (_onReveal) _onReveal(payload.revealAt, !!payload.isFinal);
        // FALLBACK del espectador: el 'reveal' significa que TODOS terminaron.
        // El ranking real llega por el broadcast 'postgame' (kind:'final'),
        // pero el espectador NO tiene otro camino si ese broadcast se pierde
        // (blip de canal en esa ventana) — se quedaba congelado sin tabla
        // (reportado, raro pero "en teoría nunca debe pasar"). Acá armamos un
        // salvavidas: si el postgame no llega en ~3.5s, reconstruimos la tabla
        // final con los puntajes YA cacheados (_members tienen .score de los
        // broadcasts 'lbscore'). Solo para el FINAL — el intermedio se
        // recupera solo cuando arranca el modo siguiente. Se cancela apenas
        // llega el postgame real (ver arriba).
        if (payload.isFinal) _armPostgameFinalFallback();
      })
      // Conteo GLOBAL de espectadores de la sala — en grupo se tratan como
      // algo global: el símbolo de "espectando" aparece en todos los miembros
      // por igual mientras haya al menos un espectador. Se cuenta cada clave
      // 'spectator-*', sin filtrar por a quién mira. Antes se filtraba por
      // pov, lo que obligaba a re-trackear en cada cambio de POV — y ESO
      // desconectaba el canal (el "cambio de POV me desconecta" reportado).
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = _channel.presenceState();
          let n = 0;
          Object.keys(state).forEach(k => { if (k.indexOf('spectator-') === 0) n++; });
          if (_onSpectatorCount) _onSpectatorCount(n);
        } catch (e) {}
      })
      // Un JUGADOR se fue/desconectó de la sala mientras se espectea (su
      // presencia cae). Dos cosas: (1) si era a QUIEN estaba mirando el
      // espectador, saltar el POV al siguiente disponible (no quedarse
      // congelado en una cartilla muerta); (2) si NO queda NINGÚN jugador con
      // presencia (la sala se vació — todos abandonaron/desconectaron), avisar
      // para sacar al espectador con la pantalla de "sala abandonada", igual
      // que al jugador se lo kickea por quedarse solo. Se ignoran las claves
      // 'spectator-*' (son otros espectadores, no jugadores).
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!key || key.indexOf('spectator-') === 0) return;
        // Presence NO es fuente de verdad para "la sala se vació": un jugador
        // pasando a espectar de prestado (ver _enterGroupWaitAsSpectator en
        // lobby.js) también suelta su presencia de JUGADOR real un instante,
        // sin haber abandonado — contarlo por presence confundía "está en
        // otra parte del juego" (transición interna normal) con un abandono
        // real, kickeando al espectador externo con "sala vacía" en medio de
        // una ronda (reportado). La tabla lobby_members si es la fuente de
        // verdad: se reconsulta acá y el kick real pasa por el mismo umbral
        // que "quedé solo" del lado jugador (_onAlone en lobby.js) — 1 o 0
        // miembros reales de verdad en la sala.
        _fetchMembers(_lobbyId).then(freshMembers => {
          _members = freshMembers;
          if (_onMembers) _onMembers(_members);
          if (_members.length <= 1) { if (_onRoomEmpty) _onRoomEmpty(); return; }
          delete _lastState[key]; _finishedUids.delete(key);
          if (_currentPovMemberId && !_members.some(m => m.id === _currentPovMemberId)) _advanceToNextAvailable();
        }).catch(() => {});
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          _reconnectAttempts = 0; // conexión sana — resetear el backoff
          if (_reconnecting) { _reconnecting = false; if (_onReconnected) { try { _onReconnected(); } catch (e) {} } }
          // Trackea la presencia UNA sola vez acá (al conectar/reconectar) —
          // ya no se re-trackea en cada cambio de POV (el conteo es global,
          // ver el sync de arriba). Sin pov: el conteo no lo necesita.
          try { await _channel.track({ t: Date.now() }); } catch (e) {}
        } else if ((status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !_stopping && _lobbyId) {
          // Cierre INESPERADO (no lo pedimos nosotros) — reintentar reconectar.
          _scheduleReconnect();
        }
      });
  }
  function _scheduleReconnect() {
    if (_reconnectTimer || _stopping) return;
    _reconnecting = true;
    if (_onReconnecting) { try { _onReconnecting(); } catch (e) {} }
    const lobbyId = _lobbyId;
    const povId   = _currentPovMemberId;
    const finished = Array.from(_finishedUids);
    if (!lobbyId) return;
    _reconnectAttempts++;
    const delay = Math.min(300 * _reconnectAttempts, 4000); // backoff (300,600,900...), cap 4s
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      if (_stopping || !lobbyId) return;
      // watch() re-suscribe (re-fetch de members + rebuild del canal),
      // preservando a quién se estaba mirando (povId) y quién ya terminó.
      watch(lobbyId, povId, { preFinishedUids: finished, _isReconnect: true });
    }, delay);
  }

  // Mismo mecanismo que el equivalente en lobby.js (LB): los navegadores
  // throttlean los timers de una pestaña en 2do plano, de los que depende el
  // heartbeat de Realtime — si se demora demasiado, el canal del espectador
  // puede quedar colgado sin que este cliente lo note hasta el próximo
  // intento natural de reconexión (o nunca, si el CLOSED/TIMED_OUT no llega
  // a disparar). Al volver a primer plano, forzar la reconexión YA si el
  // canal no está realmente conectado, en vez de esperar.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (_stopping || _reconnecting || !_lobbyId) return;
    if (_channel && _channel.state === 'joined') return; // conexión sana
    _reconnectAttempts = 0; // volver de background no cuenta como fallo repetido — backoff limpio
    _scheduleReconnect();
  });

  // direction: +1 (siguiente) / -1 (anterior), circular — SOLO entre
  // miembros que todavía tienen algo que mostrar (ver _finishedUids: uno que
  // ya tuvo su 'timesup' de este modo queda afuera de la rotación hasta que
  // arranque el modo/partida siguiente). Devuelve el nuevo memberId, o null
  // si no hay nadie disponible (todos terminaron esta ronda de modos).
  function _movePov(direction) {
    if (!_members.length) return null;
    const available = _members.filter(m => !_finishedUids.has(m.id));
    if (!available.length) return null;
    const idx = available.findIndex(m => m.id === _currentPovMemberId);
    const nextIdx = ((idx < 0 ? 0 : idx) + direction + available.length) % available.length;
    const newId = available[nextIdx].id;
    if (newId === _currentPovMemberId) return _currentPovMemberId; // era el único disponible
    _currentPovMemberId = newId;
    // NO se re-trackea presence al cambiar de POV. Confirmado por logs: si
    // NUNCA cambiás de POV el canal jamás se cae; en cuanto se hacen cambios,
    // los track() de presence repetidos (aun throttleados) van tirando el
    // WebSocket (CLOSED). El track() SOLO se manda una vez, al conectar (ver
    // subscribe más abajo) — suficiente para que el contador de espectadores
    // exista. La contra: ese contador queda fijo en el POV inicial y no sigue
    // los cambios de flecha — trade-off aceptable a cambio de que la conexión
    // no se caiga. (Si se quiere que el contador siga el POV, hay que hacerlo
    // por un broadcast liviano en vez de re-track de presence — pendiente.)
    // _onPovChanged INMEDIATO — es barato (nombre + leaderboard throttleado +
    // score + PUNTITOS del bonus) y NO manda nada al server (el track ya está
    // desactivado), así que no hay motivo para demorarlo: sin esto, al
    // cambiar de POV los puntitos de colores del bonus tardaban 450ms en
    // actualizarse (el "no se actualizan en tiempo real al transicionar"
    // reportado). Resetea también el dedup _lastRoundKey/_lastPregameKey, que
    // tiene que quedar reseteado ANTES de _resendState (abajo).
    try { if (_onPovChanged) _onPovChanged(_currentPovMemberId); } catch (e) { console.warn('[spec] _onPovChanged failed:', e); }
    // SOLO el render PESADO del tablero (_resendState → _onRound) queda
    // debounceado a 450ms (> cooldown de flechas 350ms) — spamear coalesce a
    // un solo render final, sin bloquear el hilo. La parte cara es esta, no
    // el score/dots de arriba.
    clearTimeout(_povUiTimer);
    _povUiTimer = setTimeout(_applyPovResend, 450);
    // Circulito de carga YA — feedback visual inmediato mientras el tablero
    // se resuelve al soltar. onRound/onTick lo ocultan al llegar el dato nuevo.
    if (typeof window._showVsWaitSpinner === 'function') window._showVsWaitSpinner();
    return _currentPovMemberId;
  }
  let _povUiTimer = null;
  // Solo el reenvío del estado (tablero) — _onPovChanged ya corrió inmediato
  // en _movePov. try/catch: _resendState toca DOM/geometría frágil.
  function _applyPovResend() {
    try { _resendState(_currentPovMemberId); } catch (e) { console.warn('[spec] _resendState failed:', e); }
  }
  function switchPov(direction) { return _movePov(direction); }

  // Emite el reloj de pared compartido (ver LB.sendReveal en lobby.js) por
  // ESTE canal — usado cuando quien primero detecta "todos terminaron"
  // mientras espectea de prestado es este mismo jugador, cuyo canal propio
  // de LB está suelto (LB.sendReveal ahí sería un no-op silencioso). Mismo
  // topic que LB, así que cualquier jugador realmente conectado lo recibe
  // igual.
  function sendReveal(revealAt, isFinal) {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'reveal', payload: { revealAt, isFinal: !!isFinal } }); } catch (e) {} }
  }
  // Se llama SOLO cuando el miembro que se estaba mirando justo terminó su
  // cronómetro (ver 'timesup' más arriba) — saltar a cualquier otro
  // disponible, no importa la dirección exacta.
  function _advanceToNextAvailable() { _movePov(1); }

  // Reenvía el último estado CONOCIDO del miembro nuevo (cacheado en
  // _lastState desde que se unió, sin importar si tenía el foco o no) — sin
  // esto, cambiar de POV dejaba la pantalla vieja congelada hasta que la
  // persona nueva hiciera algo (el próximo tick, hasta 1s después) en vez de
  // reflejar YA su estado actual (el "no se cambia al instante" reportado).
  function _resendState(uid) {
    const st = _lastState[uid];
    if (!st) return;
    if (st.phase === 'postgame' && st.postgame && _onPostgame) { _onPostgame(st.postgame); return; }
    if (st.phase === 'pregame'  && st.pregame  && _onPregame)  { _onPregame(st.pregame);  return; }
    if (st.phase === 'splash'   && st.splash   && _onSplash)   { _onSplash(st.splash);    return; }
    if (st.phase === 'round'    && st.round    && _onRound) {
      _onRound(st.round);
      if (typeof st.tick === 'number' && _onTick) _onTick(st.tick);
    }
  }

  function getCurrentMember() { return _members.find(m => m.id === _currentPovMemberId) || null; }
  function getMembers()       { return _members; }

  async function stop() {
    _stopping = true; // cierre INTENCIONAL — que el callback de status no dispare reconexión
    _reconnecting = false;
    clearTimeout(_trackDebounceTimer);
    clearTimeout(_povUiTimer); _povUiTimer = null;
    clearTimeout(_advancePovTimer); _advancePovTimer = null;
    clearTimeout(_postgameFallbackTimer); _postgameFallbackTimer = null;
    clearTimeout(_reconnectTimer); _reconnectTimer = null;
    if (_channel) {
      const ch = _channel; _channel = null;
      try { await ch.untrack(); } catch (e) {}
      // removeChannel (no solo unsubscribe): unsubscribe() deja el canal
      // 'lobby-{id}' todavía registrado en el cliente de Supabase por este
      // topic — cuando lobby.js volvía a llamar sb.channel('lobby-{id}',...)
      // para reconectar su propio canal, el SDK reutilizaba esta MISMA
      // instancia (ya suscripta antes) en vez de crear una nueva, y tirar
      // .on('postgres_changes', ...) sobre un canal ya subscribe()ado explota
      // ("cannot add postgres_changes callbacks ... after subscribe()") —
      // dejando el canal del jugador roto justo al volver de espectar de
      // prestado (scores/wrong nunca más le llegaban a nadie, reportado).
      try { await window.sb.removeChannel(ch); } catch (e) {}
    }
    _lobbyId = null; _members = []; _currentPovMemberId = null;
    _lastTrackedPov = null; _lastTrackAt = 0;
    Object.keys(_scores).forEach(k => delete _scores[k]);
    Object.keys(_dots).forEach(k => delete _dots[k]);
    Object.keys(_lastState).forEach(k => delete _lastState[k]);
    _finishedUids.clear();
    // _renderGroupLeaderboardInner (más abajo) mete filas 'group-spec-lb-{uid}'
    // DENTRO del leaderboard real del modo (#flags-leaderboard / #leaderboard)
    // — no en un overlay aparte — y solo se auto-limpian comparando contra el
    // set actual en CADA re-render mientras se sigue espectando. Al llamar
    // stop() esa función deja de correr, así que las filas del último render
    // quedaban huérfanas ahí adentro para siempre: estáticas, sin animar, por
    // detrás/entre las filas reales del jugador que vuelve a jugar (el "las
    // tablas se quedan quietas atrás" reportado). Hay que barrerlas acá,
    // fuera de los dos leaderboards posibles (uno por mode, banderas aparte).
    ['flags-leaderboard', 'leaderboard'].forEach(id => {
      const lb = document.getElementById(id);
      if (lb) Array.from(lb.querySelectorAll('[id^="group-spec-lb-"]')).forEach(el => el.remove());
    });
  }

  return {
    watch, stop, switchPov, getCurrentMember, getMembers, sendReveal,
    getDots: uid => _dots[uid],
    onMembers:        cb => { _onMembers = cb; },
    onRoomEmpty:      cb => { _onRoomEmpty = cb; },
    onRound:          cb => { _onRound = cb; },
    onTick:           cb => { _onTick = cb; },
    onPregame:        cb => { _onPregame = cb; },
    onPostgame:       cb => { _onPostgame = cb; },
    onAnswer:         cb => { _onAnswer = cb; },
    onTimesUp:        cb => { _onTimesUp = cb; },
    onTimesUpAny:     cb => { _onTimesUpAny = cb; },
    onSplash:         cb => { _onSplash = cb; },
    onAdvancing:      cb => { _onAdvancing = cb; },
    onSpectatorCount: cb => { _onSpectatorCount = cb; },
    onPovChanged:     cb => { _onPovChanged = cb; },
    onScore:          cb => { _onScore = cb; },
    onWrong:          cb => { _onWrong = cb; },
    onFinished:       cb => { _onFinished = cb; },
    onReveal:         cb => { _onReveal = cb; },
    onAnyActivity:    cb => { _onAnyActivity = cb; },
    onReconnecting:   cb => { _onReconnecting = cb; },
    onReconnected:    cb => { _onReconnected = cb; },
    isReconnecting:   () => _reconnecting,
    getLobbyId:       () => _lobbyId,
  };
})();

// ── UI del panel espectador ─────────────────────────────────────────────────
// Es un overlay sobre el loading-screen (como el resultado de versus/lobby) —
// no toca splash/pregame porque el espectador no está "jugando", solo mirando.
// Si el modo tiene una pantalla "real" reusable (window.flagsSpectatorEnter,
// hoy solo Banderas) mostramos ESA — el #flags-wrapper de verdad, con la
// máquina/maletines/banderas reales — en vez del panel genérico de abajo, que
// queda como fallback para los modos que todavía no tienen esa integración
// (Siluetas/Cities/Monuments).
(function () {
  const screen      = document.getElementById('spectator-screen');
  if (!screen) return;
  const titleEl      = document.getElementById('spectator-title');
  const hostPic      = document.getElementById('spectator-host-pic');
  const hostPicWrap  = document.getElementById('spectator-host-pic-wrap');
  const hostNameEl   = document.getElementById('spectator-host-name');
  const hostScoreEl  = document.getElementById('spectator-host-score');
  const guestPic     = document.getElementById('spectator-guest-pic');
  const guestPicWrap = document.getElementById('spectator-guest-pic-wrap');
  const guestNameEl  = document.getElementById('spectator-guest-name');
  const guestScoreEl = document.getElementById('spectator-guest-score');
  const promptEl     = document.getElementById('spectator-prompt');
  const optionsEl    = document.getElementById('spectator-options');
  const statusEl     = document.getElementById('spectator-status');
  const closeBtn     = document.getElementById('spectator-close');

  const miniHud       = document.getElementById('spectator-mini-hud');
  const miniAvatarEl  = document.getElementById('spectator-mini-avatar');
  const miniAvatarWrap = document.getElementById('spectator-mini-avatar-wrap');
  const miniNameEl    = document.getElementById('spectator-mini-name');

  const loadingEl      = document.getElementById('spectator-loading');
  const loadingBarFill = document.getElementById('spectator-loading-bar-fill');

  // Watchdog de inactividad: si el jugador espectado pasa a un pre/post-game
  // (splash, resultados, cambio de modo dentro de la campaña, etc.) no llega
  // NINGÚN 'round'/'tick'/'answer' — sin esto el espectador se queda mirando
  // el último frame congelado sin ninguna indicación de qué está pasando.
  // Reutiliza la misma transición de carga como aviso liviano: no se desmonta
  // nada, solo se tapa hasta que vuelva a haber actividad real.
  const IDLE_MS = 3500;
  let _idleWatchdogId = null;
  let _idleShown       = false;
  let _reconnectNoticeTimer = null; // ver onReconnecting: retrasa el aviso "Reconectando..." para no molestar en blips rápidos

  // Frena el watchdog y oculta el aviso si estaba mostrándose, pero NO lo
  // rearma — para pregame/postgame/onEnd, donde ya sabemos qué está pasando
  // y no corresponde un aviso genérico encima.
  function _clearIdleWatchdog() {
    clearTimeout(_idleWatchdogId);
    clearTimeout(_reconnectNoticeTimer); _reconnectNoticeTimer = null;
    if (_idleShown) {
      _idleShown = false;
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading();
    }
  }
  function _resetIdleWatchdog() {
    _clearIdleWatchdog();
    if (_usingRealUI) _idleWatchdogId = setTimeout(_showIdleNotice, IDLE_MS);
  }
  function _showIdleNotice() {
    if (!_usingRealUI || _idleShown) return;
    _idleShown = true;
    // Si el canal grupal se está reconectando (se cayó el WebSocket, ver
    // _scheduleReconnect en GroupSpectate), el jugador NO está "en otra parte
    // del juego" — está pasando un corte de conexión; mostrar "Reconectando..."
    // en vez del aviso genérico de inactividad.
    const reconnecting = _groupMode && window.GroupSpectate && typeof window.GroupSpectate.isReconnecting === 'function' && window.GroupSpectate.isReconnecting();
    // t() devuelve el key mismo si no lo encuentra (ej. i18n.js cacheado
    // viejo) — fallback explícito para no mostrar "spectator.reconnecting".
    if (loadingTextEl) loadingTextEl.textContent = reconnecting
      ? ((typeof t === 'function' && t('spectator.reconnecting') !== 'spectator.reconnecting') ? t('spectator.reconnecting') : 'Reconectando...')
      : ((typeof t === 'function') ? t('spectator.idle', { name: _friendName || t('spectator.defaultPlayer') })
                                   : (_friendName || 'El jugador') + ' está en otra parte del juego...');
    _showLoading();
  }

  let _mode = 'flags';
  // true mientras se está espectando un duelo GRUPAL (openSpectatorGroup) en
  // vez de 1v1/solo — controla si se muestran las flechas de POV y si
  // closeSpectator() debe parar GroupSpectate en vez de Spectate.
  let _groupMode = false;
  // true cuando quien "espectea" en grupo es EL PROPIO JUGADOR mirando a sus
  // compañeros de sala de prestado (openSpectatorGroup(...,{instant:true}),
  // ver _enterGroupWaitAsSpectator en lobby.js) — a diferencia de un
  // espectador EXTERNO real. El ranking de fin de ronda (kind:'intermediate'/
  // 'final') para este caso no debe mostrarse acá con el mirror neutral: hay
  // que avisarle a lobby.js para que muestre SU PROPIO resultado
  // personalizado (GANASTE/Quedaste #2) en vez de "GANA fulano" genérico.
  let _groupInstant = false;
  // true entre el momento en que closeSpectator() decide cerrar y el momento
  // en que la sesión termina de verdad — sirve para que los handlers de
  // _wireCommonCallbacks ignoren cualquier evento que ya estuviera en vuelo
  // (llegó justo cuando se llamó Spectate.stop()) durante ese lapso.
  let _closing = false;
  // Identidad de la última ronda ya procesada (mode+prompt+options+correctSlot)
  // — un mismo espectador puede recibir el MISMO 'round' dos veces: una vez en
  // vivo (si se conecta justo cuando arranca) y otra por el resend que dispara
  // el 'join' de su propia presence 150ms después (SoloSpectate no sabe si
  // este espectador puntual ya lo vio o no, así que resend siempre manda el
  // último estado conocido). Sin este chequeo, showRound() se llamaba de
  // nuevo para la MISMA ronda — repitiendo la animación de entrada de los
  // tags/maletines y el sonido, el "se duplica" reportado.
  let _lastRoundKey = null;
  let _lastPregameKey = null; // idem, para el 3-2-1 (ver comentario en onPregame)
  let _usingRealUI = false;
  // Qué modo está montado AHORA en la UI real — separado de _mode, que puede
  // cambiar apenas llega un 'round' de un modo distinto (la campaña encadena
  // banderas→siluetas→ciudades→monumentos). Sin este seguimiento aparte,
  // _enterRealUIIfPossible('shapes') veía _usingRealUI ya en true (de
  // banderas) y no hacía NADA — ni salía de banderas ni entraba a siluetas —
  // así que las funciones de siluetas se llamaban sin haber pasado nunca por
  // shapesSpectatorEnter(), y todos sus guards `if (!_shapesSpecMode) return`
  // las dejaban en no-op silencioso (el "no reacciona" reportado).
  let _activeRealUIMode = null;
  let _friendName   = '';
  let _friendAvatar = '';
  // Código de card (images/customize/cards/<code>.png) del amigo espectado —
  // usado por *SpectatorSetPlayerCard (flags.js/shapes.js/monuments.js) para
  // que la ficha REAL de leaderboard que ve el espectador muestre la carta
  // que ese jugador tiene equipada de verdad, no el default. El marco NO va
  // acá a propósito (regla establecida: frame solo en la foto grande de
  // perfil, nunca en un avatar tipo card/leaderboard).
  let _friendCardCode = '0001';
  // Código de frame (images/customize/frames/<code>.png) del amigo
  // espectado — este SÍ va en el mini-HUD (spectator-mini-avatar), a
  // diferencia de _friendCardCode: acá es la foto de identidad "quién estoy
  // mirando", no un avatar tipo card/leaderboard, así que el marco real
  // aplica igual que en la foto grande de perfil.
  let _friendFrameCode = '0001';
  let _friendIsHost = true; // en solo siempre "host" (único jugador); en versus se resuelve al conectar
  let _lastHost = 0, _lastGuest = 0;
  // Identidad del RIVAL del amigo espectado (solo versus) — se resuelve una
  // vez al conectar (ver openSpectator/onSnapshot), consultando profiles por
  // el lado de la partida que no es el amigo. null en modo solo (no aplica).
  let _oppName = null, _oppAvatar = null;
  let _oppCardCode = '0001';
  // true cuando quien "espectea" es EL PROPIO JUGADOR mirando a su rival de
  // prestado (vs.js _enterWaitAsSpectator, opts.instant en openSpectator) —
  // ver comentario largo en el onEnd de _wireCommonCallbacks: sin esto, el
  // status='finished' que escribe el RIVAL (dentro de SU PROPIO
  // _showVsResult, vía VS.finish()) le llegaba a este jugador por este mismo
  // canal de Spectate y disparaba el "el amigo dejó de jugar → volver al
  // menú" genérico (pensado para un espectador EXTERNO) — compitiendo/
  // ganándole de carrera al _revealAt sincronizado de vs.js y mandando al
  // jugador derecho al menú en vez de dejarlo ver SU PROPIO resultado (el
  // "me kickea al menu" reportado).
  let _suppressGenericEnd = false;

  // Transición de carga tipo Clash Royale: se muestra al tocar el ojo (tapa el
  // panel/mini-hud que ya se armaron detrás) y se desvanece cuando ya estamos
  // conectados al canal en vivo. Duración mínima para que no sea un flash
  // imperceptible aunque la conexión sea casi instantánea.
  const LOADING_MIN_MS = 550;
  let _loadingShownAt   = 0;
  let _loadingTickId    = null;
  let _loadingPct       = 0;
  // IDs de los dos setTimeout encadenados de _hideLoading (espera mínima +
  // fade de 350ms) — ver comentario largo en _hideLoading más abajo.
  let _hideLoadingT1 = null, _hideLoadingT2 = null;

  function _showLoading() {
    // Cancela cualquier _hideLoading() viejo todavía en camino — sin esto,
    // ese callback pendiente podía disparar más tarde y tapar de golpe ESTA
    // transición nueva a mitad de camino (ver comentario largo en
    // _hideLoading).
    clearTimeout(_hideLoadingT1); clearTimeout(_hideLoadingT2);
    _loadingPct = 15;
    loadingBarFill.style.width = _loadingPct + '%';
    loadingEl.style.display = 'flex';
    void loadingEl.offsetWidth;
    loadingEl.classList.add('visible');
    _loadingShownAt = Date.now();
    // Progreso simulado: no sabemos cuánto falta para que el jugador termine
    // su cuenta 3-2-1 o arranque la próxima ronda, así que la barra crece de a
    // poco (tope 85%) en vez de saltar directo a 100% — se ve "cargando" de
    // verdad en vez de completarse al instante.
    clearInterval(_loadingTickId);
    _loadingTickId = setInterval(() => {
      if (_loadingPct >= 85) return;
      _loadingPct = Math.min(85, _loadingPct + 4);
      loadingBarFill.style.width = _loadingPct + '%';
    }, 180);
  }
  // immediate=true salta el tiempo mínimo de visualización (LOADING_MIN_MS) —
  // se usa al entrar al pregame: ese mínimo (550ms) + los 350ms de fade tapaban
  // hasta 900ms del 3-2-1 real (el "3" y parte del "2" nunca se llegaban a ver,
  // el espectador recién veía algo cuando el conteo ya estaba avanzado).
  // Sin trackear/cancelar estos IDs, una llamada VIEJA a _hideLoading() (ej.
  // del onRound/onPregame normal de una ronda que ya quedó atrás) podía
  // disparar su callback DESPUÉS de que closeSpectator() ya había vuelto a
  // mostrar la pantalla de carga para su PROPIA transición de cierre — la
  // tapaba de golpe (classList.remove('visible') + display:none) antes de
  // que terminara su propio tiempo, el "desaparece al instante" reportado.
  function _hideLoading(immediate) {
    clearInterval(_loadingTickId);
    clearTimeout(_hideLoadingT1); clearTimeout(_hideLoadingT2);
    loadingBarFill.style.width = '100%';
    const wait = immediate ? 0 : Math.max(0, LOADING_MIN_MS - (Date.now() - _loadingShownAt));
    _hideLoadingT1 = setTimeout(() => {
      loadingEl.classList.remove('visible');
      _hideLoadingT2 = setTimeout(() => {
        loadingEl.style.display = 'none';
        loadingBarFill.style.width = '0%';
        // Recién ahora, con la pantalla de carga ya del todo afuera, se
        // aplica el conteo de espectadores que haya llegado mientras tanto
        // — ver _applySpectatorBadge().
        _applySpectatorBadge();
      }, 350);
    }, wait);
  }

  // Cuántos espectadores hay mirando (a este mismo incluido) — mismo ícono
  // que ve el jugador de sí mismo. _lastSpectatorN se actualiza apenas llega
  // el 'sync' de presence (puede pasar en cualquier momento, incluso
  // mientras #spectator-loading todavía está tapando la pantalla, recién
  // conectando o en medio de una transición de carga) pero el DOM NO se
  // toca hasta que la carga termine de verdad — sin este freno, el badge
  // aparecía ANTES de que se destapara la pantalla real, como flotando
  // encima de la transición.
  let _lastSpectatorN = 0;
  function _applySpectatorBadge() {
    if (loadingEl.classList.contains('visible')) return;
    const isFlags = window.pendingGameMode === 'flags';
    const badge   = document.getElementById(isFlags ? 'flags-vs-spectator-badge' : 'vs-spectator-badge');
    const countEl = document.getElementById(isFlags ? 'flags-vs-spectator-count' : 'vs-spectator-count');
    // El OTRO badge (el que no corresponde al modo actual) se apaga siempre,
    // explícito — la campaña cambia de modo (banderas→siluetas→ciudades) sin
    // que necesariamente vuelva a llegar un 'sync' de presence en ese
    // instante (el estado de presence no cambió, solo el modo), así que sin
    // esto el badge del modo VIEJO quedaba pegado visible para siempre si
    // alguna vez había llegado a mostrarse — el "se duplica" reportado (dos
    // ojos en pantalla, uno de cada badge, en dos posiciones distintas).
    const otherBadge = document.getElementById(isFlags ? 'vs-spectator-badge' : 'flags-vs-spectator-badge');
    if (otherBadge) otherBadge.style.display = 'none';
    if (badge) badge.style.display = _lastSpectatorN > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = _lastSpectatorN;
  }

  // ── MIRROR DE LA PANTALLA DE INSTRUCCIONES (splash) ────────────────────────
  // Reusa el #splash-screen REAL (el mismo que ve el jugador que está jugando
  // de verdad en esta pestaña) en modo solo-lectura, en vez de la pantalla de
  // carga genérica — así el espectador ve el mismo texto/personajes/video que
  // el jugador espectado, no solo un "Cargando...". Mismos class/texto que
  // ponen los handlers reales de loading-flags-btn/loading-shapes-btn/
  // loading-play-btn/loading-mode4-btn (paso 1) y el handler de
  // .splash-confirm-wrap en monuments.js (paso 2, tras el primer confirm real
  // — ver el window._specReportSplash({mode, step:2}) agregado ahí) — ver esos
  // mismos bloques si esto se desincroniza en el futuro. .game-bg-men1/men2/
  // girl1/girl2/women1/women2 son elementos COMPARTIDOS entre los 4 modos
  // (cada uno les pone su propio sprite) — sin este swap acá, el espectador
  // veía los personajes que dejó puestos lo último que jugó/espectó ESTA
  // pestaña, no los del modo que realmente está mirando.
  const SPLASH_MODE_CLASSES = {
    flags: {
      add: ['mode-flags'], remove: ['mode-shapes', 'mode-monuments'], key1: 'splash.flags.1', key2: 'splash.flags.2',
      sprites: { men1: 'men3', men2: 'men4', girl1: 'girl3', girl2: 'girl4', women1: 'women2', women2: 'women3' },
      video: 'images/howtoplay/howtoplay1.mp4',
      bg: [['game-bg-city', 'images/bg/level1complete.png']],
    },
    shapes: {
      add: ['mode-flags', 'mode-shapes'], remove: ['mode-monuments'], key1: 'splash.shapes.1', key2: 'splash.shapes.2',
      sprites: { men1: 'men5', men2: 'men6', girl1: 'girl5', girl2: 'girl6', women1: 'women4', women2: 'women5' },
      video: 'images/howtoplay/howtoplay2.mp4',
      bg: [['game-bg-city', 'images/bg/level2complete.png']],
    },
    game: {
      add: [], remove: ['mode-flags', 'mode-shapes', 'mode-monuments'], key1: 'splash.cities.1', key2: 'splash.cities.2',
      sprites: { men1: 'men1', men2: 'men2', girl1: 'girl1', girl2: 'girl2', women1: 'women1', women2: 'women1' },
      video: 'images/howtoplay/howtoplay3.mp4',
      bg: [['game-bg-city', 'images/bg/level3complete.png']],
    },
    monuments: {
      add: ['mode-monuments'], remove: ['mode-flags', 'mode-shapes'], key1: 'splash.monuments.1', key2: 'splash.monuments.2',
      sprites: { men1: 'men1', men2: 'men2', girl1: 'girl1', girl2: 'girl2', women1: 'women1', women2: 'women1' },
      video: 'images/howtoplay/howtoplay4.mp4',
      // monuments libera .game-bg-city (fondo de cities) antes de poner el
      // suyo propio, en dos capas — mismo orden que su handler real
      // (loading-mode4-btn en shapes.js).
      bg: [['game-bg-city', ''], ['game-bg-city-monuments', 'images/bg/level4complete.png'], ['game-bg-city-monuments2', 'images/bg/level4complete2.png']],
    },
  };
  let _splashMirrorShown = false;
  // Modo actualmente montado en el mirror — si llega un 'splash' del mismo
  // modo pero step:2 (el jugador real ya apretó el primer confirm), hay que
  // poder distinguir "cambiar de paso" de "cambiar de modo" para no volver a
  // tocar el <video> (swap de src + load()) innecesariamente en cada tick.
  let _splashMirrorMode = null;

  function _showSplashMirror(mode, step) {
    const splashEl = document.getElementById('splash-screen');
    if (!splashEl) return;
    const cfg = SPLASH_MODE_CLASSES[mode] || SPLASH_MODE_CLASSES.flags;
    const isNewMode = _splashMirrorMode !== mode;
    _splashMirrorMode = mode;
    _hideLoading(true);
    screen.style.display = 'none';
    // #loading-screen (el menú real de esta pestaña) tiene z-index:200, más
    // alto que #splash-screen (z-index:100) — si quedó visible de cuando se
    // abrió el panel de espectador desde ahí, taparía el mirror por completo.
    // flagsSpectatorEnter/shapesSpectatorEnter ya lo ocultan cuando montan la
    // UI real, pero un 'splash' puede ser el PRIMER evento de la sesión (el
    // espectador se unió mientras el jugador recién estaba en instrucciones),
    // antes de que ningún *Enter() haya corrido nunca — hay que ocultarlo acá
    // también, no asumir que ya lo está.
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'none';
    cfg.add.forEach(c => splashEl.classList.add(c));
    cfg.remove.forEach(c => splashEl.classList.remove(c));
    Object.keys(cfg.sprites).forEach(key => {
      document.querySelectorAll('.game-bg-' + key).forEach(el => { el.src = 'images/characters/' + cfg.sprites[key] + '.png'; });
    });
    // Fondo (.game-bg-city / .game-bg-city-monuments) — mismo elemento
    // COMPARTIDO entre los 4 modos que los sprites de arriba: sin este swap
    // acá quedaba pegado el de la ÚLTIMA vez que esta pestaña espectó o jugó
    // algo, no el del modo que se está mirando ahora — el "el fondo de pre se
    // buguea y pone uno erróneo, sobre todo entrando varias veces" reportado.
    (cfg.bg || []).forEach(([cls, src]) => {
      document.querySelectorAll('.' + cls).forEach(el => { el.src = src; });
    });
    const label = splashEl.querySelector('.splash-text2-label');
    const howtoWrap  = splashEl.querySelector('.splash-howtoplay-wrap');
    const howtoVideo = splashEl.querySelector('.splash-howtoplay-video');
    if (isNewMode && howtoVideo && cfg.video) { try { howtoVideo.src = cfg.video; howtoVideo.load(); } catch (e) {} }
    if (step === 2) {
      // Mismo cambio visual que el paso 2 real: el video de ayuda "baja"
      // (slide-down) y el texto pasa al mensaje de instrucciones de juego.
      if (label) { label.textContent = (typeof t === 'function') ? t(cfg.key2) : ''; label.classList.add('step2'); }
      if (howtoWrap) howtoWrap.classList.add('slide-down');
      // Autoplay puede venir bloqueado sin gesto del usuario en esta pestaña
      // (normal en el espectador) — igual que sfxPlay en el resto del código,
      // se intenta y se ignora el rechazo; el video igual queda ahí, pausado
      // en su primer frame, que es mejor que nada.
      if (howtoVideo) { try { howtoVideo.play().catch(() => {}); } catch (e) {} }
    } else {
      if (label) { label.textContent = (typeof t === 'function') ? t(cfg.key1) : ''; label.classList.remove('step2'); }
      if (howtoWrap) howtoWrap.classList.remove('slide-down');
      if (howtoVideo) { try { howtoVideo.pause(); } catch (e) {} }
    }
    // Solo-lectura: ni el confirm ni ningún otro elemento de acá adentro deben
    // reaccionar a un click del espectador (arrancaría/pisaría el estado de
    // juego REAL de esta pestaña, ej. si el espectador después quiere jugar).
    splashEl.style.pointerEvents = 'none';
    // pointer-events:none del padre NO alcanza para el confirm:
    // .splash-confirm-wrap tiene su PROPIA regla `.confirm-ready {
    // pointer-events: auto; }` que la PISA en cuanto showSplashConfirm() le
    // agrega esa clase — un espectador podía clickearlo igual y disparar el
    // avance de la partida REAL de esta pestaña (típico: el jugador acaba de
    // salir de SU propia partida a medio jugar y entra a espectar a otro).
    // Un estilo inline (confirmWrap.style.pointerEvents='none') tampoco
    // alcanza del todo: si el modo siguiente de la campaña vuelve a llamar
    // showSplashConfirm() (el video de instrucciones de ESE modo termina de
    // cargar) la clase se reaplica y con ella el pointer-events:auto —
    // reapareció el bug reportado en el "pre" del modo siguiente. La clase
    // .spectator-locked con !important (ver CSS) es la única forma de ganar
    // esa pelea pase lo que pase después.
    const confirmWrap = splashEl.querySelector('.splash-confirm-wrap');
    if (confirmWrap) confirmWrap.classList.add('spectator-locked');
    splashEl.style.display = 'flex';
    _splashMirrorShown = true;
    // Animación de entrada del asistente de vuelo — mismo patrón que
    // loading-play-btn/loading-mode4-btn/_fireNext() (encadenado de campaña)
    // reales: sacar la clase, forzar reflow, volver a agregarla. Faltaba del
    // todo acá, así que el espectador nunca la veía — el splash aparecía
    // "de golpe" en vez de con la entrada animada que ve el jugador real.
    // SOLO en isNewMode (primer diálogo de este modo, mismo criterio que usa
    // el jugador real): si no, pasar del primer al segundo diálogo (step:2,
    // mismo `mode`) reiniciaba la animación de entrada cada vez que el
    // espectador le daba a "confirmar" — el jugador real NUNCA la repite ahí,
    // solo al ARRANCAR un modo nuevo.
    if (isNewMode) {
      const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
      animEls.forEach(el => el.classList.remove('animate-in'));
      void splashEl.offsetWidth;
      animEls.forEach(el => el.classList.add('animate-in'));
    }
  }

  function _hideSplashMirror() {
    if (!_splashMirrorShown) return;
    _splashMirrorShown = false;
    _splashMirrorMode = null;
    const splashEl = document.getElementById('splash-screen');
    if (splashEl) {
      splashEl.style.display = 'none';
      splashEl.style.pointerEvents = '';
      // Restaurar también el confirm — ver .spectator-locked agregada en
      // _showSplashMirror. Si no se limpia, quedaba bloqueado (con
      // !important) aunque esta misma pestaña después arrancara una partida
      // REAL (el jugador nunca podría confirmar su propio splash).
      const confirmWrap = splashEl.querySelector('.splash-confirm-wrap');
      if (confirmWrap) confirmWrap.classList.remove('spectator-locked');
    }
    // Restaurar #loading-screen incondicionalmente: si lo que sigue es la UI
    // real de un modo, su propio *Enter() ya lo oculta de nuevo (redundante
    // pero inofensivo); si lo que sigue es cerrar la sesión del todo (nadie
    // más lo va a ocultar — _exitRealUI() de closeSpectator no hace nada acá
    // porque _usingRealUI nunca llegó a ponerse en true), hace falta que
    // quede visible para no dejar al espectador con la pantalla en blanco.
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'flex';
  }

  // Modos con pantalla real reusable — Banderas, Siluetas, Cities y
  // Monuments. La key 'game' coincide con window.pendingGameMode==='game'
  // (así lo manda monuments.js en _specReportRound/_specReportSplash) — no
  // 'cities', para no tener que mapear entre nombres en ningún lado. 'monuments'
  // coincide igual con pendingGameMode==='monuments'.
  const REAL_UI_MODES = {
    flags: {
      enter: 'flagsSpectatorEnter', exit: 'flagsSpectatorExit',
      showRound: 'flagsSpectatorShowRound', resolvePick: 'flagsSpectatorResolvePick',
      updateTimer: 'flagsSpectatorUpdateTimer', updateScore: 'flagsSpectatorUpdateScore',
      setPlayerCard: 'flagsSpectatorSetPlayerCard', showTimesUp: 'flagsSpectatorShowTimesUp',
      showPregame: 'flagsSpectatorShowPregame', wrongEffect: 'flagsSpectatorWrongEffect',
      timesUpEffect: 'flagsSpectatorTimesUpEffect',
      showPostgame: 'flagsSpectatorShowPostgame', hidePostgame: 'flagsSpectatorHidePostgame',
    },
    shapes: {
      enter: 'shapesSpectatorEnter', exit: 'shapesSpectatorExit',
      showRound: 'shapesSpectatorShowRound', resolvePick: 'shapesSpectatorResolvePick',
      updateTimer: 'shapesSpectatorUpdateTimer', updateScore: 'shapesSpectatorUpdateScore',
      setPlayerCard: 'shapesSpectatorSetPlayerCard', showTimesUp: 'shapesSpectatorShowTimesUp',
      showPregame: 'shapesSpectatorShowPregame', wrongEffect: 'shapesSpectatorWrongEffect',
      timesUpEffect: 'shapesSpectatorTimesUpEffect',
      showPostgame: 'shapesSpectatorShowPostgame', hidePostgame: 'shapesSpectatorHidePostgame',
    },
    game: {
      enter: 'citiesSpectatorEnter', exit: 'citiesSpectatorExit',
      showRound: 'citiesSpectatorShowRound', resolvePick: 'citiesSpectatorResolvePick',
      updateTimer: 'citiesSpectatorUpdateTimer', updateScore: 'citiesSpectatorUpdateScore',
      setPlayerCard: 'citiesSpectatorSetPlayerCard', showTimesUp: 'citiesSpectatorShowTimesUp',
      showPregame: 'citiesSpectatorShowPregame', wrongEffect: 'citiesSpectatorWrongEffect',
      timesUpEffect: 'citiesSpectatorTimesUpEffect',
      showPostgame: 'citiesSpectatorShowPostgame', hidePostgame: 'citiesSpectatorHidePostgame',
    },
    monuments: {
      enter: 'monumentsSpectatorEnter', exit: 'monumentsSpectatorExit',
      showRound: 'monumentsSpectatorShowRound', resolvePick: 'monumentsSpectatorResolvePick',
      updateTimer: 'monumentsSpectatorUpdateTimer', updateScore: 'monumentsSpectatorUpdateScore',
      setPlayerCard: 'monumentsSpectatorSetPlayerCard', showTimesUp: 'monumentsSpectatorShowTimesUp',
      showPregame: 'monumentsSpectatorShowPregame', wrongEffect: 'monumentsSpectatorWrongEffect',
      timesUpEffect: 'monumentsSpectatorTimesUpEffect',
      showPostgame: 'monumentsSpectatorShowPostgame', hidePostgame: 'monumentsSpectatorHidePostgame',
    },
    // GlobeQuiz v1: sin globo 3D — panel simple (lista de guesses + cronómetro).
    // Omite a propósito updateTimer/updateScore/wrongEffect/timesUpEffect/
    // showTimesUp — todos los call-sites de más abajo ya chequean
    // `typeof window[fns.x] === 'function'` antes de invocar, así que faltar
    // una key es un no-op seguro. No aplican acá: no hay score numérico
    // tradicional, ni "wrong" que corte turno, ni límite de tiempo. setPlayerCard
    // SÍ aplica (identidad del amigo espectado, sin score/rival).
    globequiz: {
      enter: 'globequizSpectatorEnter', exit: 'globequizSpectatorExit',
      showRound: 'globequizSpectatorShowRound', resolvePick: 'globequizSpectatorResolvePick',
      showPregame: 'globequizSpectatorShowPregame', showPostgame: 'globequizSpectatorShowPostgame',
      hidePostgame: 'globequizSpectatorHidePostgame',
      setPlayerCard: 'globequizSpectatorSetPlayerCard',
    },
  };

  function _label(val) {
    return (typeof tCountry === 'function') ? tCountry(val) : val;
  }

  // En versus, host Y guest transmiten sus propias rondas/respuestas/ticks al
  // MISMO canal — sin filtrar por rol, el tablero del espectador terminaba
  // mostrando una MEZCLA de ambos jugadores en vez de mostrar únicamente al
  // amigo que se está espectando (el "detecta el resultado de ambos usuarios"
  // reportado). En modo solo no aplica (un solo transmisor, siempre pasa).
  function _isFromFriendSide(role) {
    if (window.Spectate.isSolo()) return true;
    if (!role) return true; // no debería pasar en versus, pero no bloquear si falta
    return role === (_friendIsHost ? 'host' : 'guest');
  }

  // El puntaje ya se ve en la tarjeta del panel derecho (flagsSpectatorSetPlayerCard)
  // — la barra de abajo (estilo Fortnite) es solo identidad, sin números.
  function _updateMiniScores() {
    // Puntaje del jugador REAL espectado (en versus puede ser host o guest
    // según de qué lado quedó el amigo; en solo siempre es el único puntaje).
    const friendScore = _friendIsHost ? _lastHost : _lastGuest;
    const fns = REAL_UI_MODES[_mode];
    if (fns && typeof window[fns.updateScore] === 'function') window[fns.updateScore](friendScore);
    // Versus: además del amigo, se pasa el puntaje del RIVAL — antes solo se
    // mostraba al amigo (ya redundante con el marcador principal de arriba),
    // y el rival no aparecía en ningún lado. Ahora ambas casillas (amigo +
    // rival) se actualizan en vivo, igual que ven los jugadores reales (cada
    // uno ve su propio marcador + la fila del rival en el leaderboard).
    const oppScore = window.Spectate.isSolo() ? null : (_friendIsHost ? _lastGuest : _lastHost);
    if (fns && typeof window[fns.setPlayerCard] === 'function') {
      window[fns.setPlayerCard](_friendName, _friendAvatar, friendScore, _oppName, _oppAvatar, oppScore, _friendCardCode, _oppCardCode);
    }
  }

  function _enterRealUIIfPossible(mode) {
    if (!mode) return;
    if (_usingRealUI && _activeRealUIMode === mode) return; // ya montado, nada que hacer
    const fns = REAL_UI_MODES[mode];
    if (!fns || typeof window[fns.enter] !== 'function') return;
    // Si veníamos de OTRO modo (campaña encadenando banderas→siluetas→etc.),
    // hay que desmontarlo primero — si no, su DOM/estado queda pegado y se
    // mezcla con el del modo nuevo.
    if (_usingRealUI && _activeRealUIMode && _activeRealUIMode !== mode) {
      const prevFns = REAL_UI_MODES[_activeRealUIMode];
      // switchingMode=true: no es un cierre real del espectador, solo se está
      // desmontando el modo anterior para montar el nuevo encima — sin este
      // flag, exit() apagaba _isSpectating y mostraba el loading-screen a
      // mitad de la transición entre modos de la campaña.
      if (prevFns && typeof window[prevFns.exit] === 'function') window[prevFns.exit](true);
    }
    _usingRealUI = true;
    _activeRealUIMode = mode;
    screen.style.display = 'none';
    window[fns.enter]();
    miniNameEl.textContent = _friendName || 'Jugador';
    if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
    window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
    // _updateMiniScores() arma la tarjeta de 2 filas fijas amigo/rival
    // (flagsSpectatorSetPlayerCard) — pensada solo para 1v1/solo. En modo
    // GRUPAL esa tarjeta terminaba conviviendo con las N filas que arma
    // _renderGroupLeaderboard() en el MISMO contenedor (#flags-leaderboard/
    // #leaderboard) — el "la plantilla de amigo se duplica y queda ahí"
    // reportado. Cada camino puebla el leaderboard a su manera, nunca los dos.
    if (_groupMode) { _renderGroupLeaderboard(); } else { _updateMiniScores(); }
    miniHud.style.display = 'flex';
    // window[fns.enter]() ya dejó window.pendingGameMode apuntando al modo
    // nuevo — reaplicar el badge de espectadores ACÁ, no solo esperar al
    // próximo 'sync' de presence (que puede no llegar nunca en este cambio
    // de modo, si nadie se unió/salió mientras tanto) — sin esto, cambiar de
    // banderas a siluetas/ciudades podía dejar el badge VIEJO pegado visible
    // (el "se duplica" reportado: dos ojos en pantalla a la vez).
    _applySpectatorBadge();
  }

  // switchingMode=true: seguimos espectando (ej. yendo al mirror de splash del
  // próximo modo), solo se desmonta el DOM del modo anterior — pasa derecho a
  // flagsSpectatorExit/shapesSpectatorExit(switchingMode), que con eso NO
  // apagan _isSpectating ni destapan el #loading-screen real de abajo (eso
  // solo corresponde cuando el espectador cierra la sesión de verdad, ver
  // closeSpectator, que llama a esto SIN el flag).
  function _exitRealUI(switchingMode) {
    if (!_usingRealUI) return;
    // OJO: usa _activeRealUIMode (lo que está MONTADO), no _mode (que puede
    // haber cambiado ya a un modo nuevo cuyo enter() todavía no corrió) — si
    // no, se llamaba el exit() del modo EQUIVOCADO.
    const fns = REAL_UI_MODES[_activeRealUIMode];
    if (fns && typeof window[fns.exit] === 'function') window[fns.exit](switchingMode);
    // switchingMode=true: seguimos espectando (yendo al splash mirror del
    // próximo modo de la campaña) — el cartel "ESPECTANDO"/nombre/contador
    // tiene que seguir ahí. Antes esto se apagaba siempre, así que
    // desaparecía apenas el jugador real entraba a las instrucciones de un
    // modo nuevo, y recién volvía a aparecer con el próximo 'round'/'pregame'
    // real — un hueco visible durante todo el splash. Solo se apaga de
    // verdad al cerrar la sesión (switchingMode falsy, ver closeSpectator).
    if (!switchingMode) miniHud.style.display = 'none';
    _usingRealUI = false;
    _activeRealUIMode = null;
  }

  function renderOptions(payload) {
    optionsEl.innerHTML = '';
    (payload.options || []).forEach((val) => {
      const box = document.createElement('div');
      box.className = 'spectator-option';
      if (_mode === 'flags' && typeof COUNTRY_FLAGS !== 'undefined' && COUNTRY_FLAGS[val]) {
        const img = document.createElement('img');
        img.src = COUNTRY_FLAGS[val];
        img.alt = '';
        box.appendChild(img);
      } else {
        const label = document.createElement('span');
        label.textContent = _label(val);
        box.appendChild(label);
      }
      optionsEl.appendChild(box);
    });
  }

  function highlightPick(payload) {
    const boxes = optionsEl.children;
    Array.prototype.forEach.call(boxes, b => b.classList.remove('picked-correct', 'picked-wrong'));
    const box = boxes[payload.index];
    if (box) box.classList.add(payload.correct ? 'picked-correct' : 'picked-wrong');
    if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined' && typeof sfxError !== 'undefined') {
      const sfx = payload.correct ? sfxCheck : sfxError;
      sfx.currentTime = 0; sfxPlay(sfx);
    }
  }

  const loadingTextEl = document.getElementById('spectator-loading-text');

  const CLOSE_TEARDOWN_DELAY_MS = 500;
  // Cuando el cierre trae un motivo (partida cortada/jugador se fue), se deja
  // el mensaje más tiempo en pantalla que un cierre normal — hay algo que leer.
  const CLOSE_MESSAGE_HOLD_MS = 1400;

  // silent=true: desmontaje SINCRÓNICO sin pantalla de carga ni "volver al
  // menú" — usado por vs.js cuando UN JUGADOR (no un espectador externo)
  // terminó su propio cronómetro antes que el rival y entró acá de prestado
  // para mirarlo en tiempo real mientras espera (ver _enterWaitAsSpectator);
  // cuando el rival también termina, este jugador no debe volver al menú
  // como haría un espectador real — vuelve directo a SU PROPIA pantalla de
  // resultado, que vs.js muestra apenas este desmontaje termina.
  function closeSpectator(message, silent) {
    if (_closing) return; // ya se está cerrando — evita doble teardown si se llama dos veces
    // Click MANUAL de "volver al menú" (#ingame-power) mientras se está
    // espectando de prestado a la sala (_groupInstant) — a diferencia de un
    // espectador externo real, acá NO hay "mi propia partida" a la que
    // volver: el teardown genérico de más abajo solo apaga GroupSpectate y
    // muestra el menú, pero deja el canal propio de LB (lobby.js) SUELTO
    // para siempre (releaseChannel, ver _enterGroupWaitAsSpectator) — nadie
    // lo vuelve a conectar porque _exitGroupWaitAsSpectator() (la única que
    // llama a resubscribeChannel) nunca corre en este camino. El jugador
    // quedaba con el ícono de "volver al menú" sin ningún efecto real (el
    // "se queda eterno en el modo espectador" reportado) porque, sin canal
    // propio, tampoco vuelve a enterarse de nada de la sala. La única salida
    // real acá es abandonar la sala de verdad.
    if (!silent && _groupMode && _groupInstant && typeof window._lobbyAbandon === 'function') {
      _closing = true;
      if (window.GroupSpectate) window.GroupSpectate.stop();
      _hideGroupPovArrows();
      _hideGroupResultMirror();
      _groupMode = false;
      _groupInstant = false;
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      _exitRealUI();
      // _exitRealUI() solo apaga el HUD si _usingRealUI era true — si el
      // espectado estaba en pregame/splash (nunca se montó una UI real de
      // ronda), esa función corta con un return temprano y esta línea nunca
      // se ejecuta, dejando "ESPECTANDO A..." pegado incluso de vuelta en
      // el menú. Se apaga acá también, sin condición.
      if (miniHud) miniHud.style.display = 'none';
      _hideSplashMirror();
      screen.style.display = 'none';
      window._isSpectating = false;
      // _lobbyAbandon (lobby.js) hace el LB.leave() real y vuelve al panel
      // de versus/lobby — a diferencia del teardown genérico de más abajo,
      // que solo mostraría el menú sin soltar la sala de verdad.
      window._lobbyAbandon();
      _closing = false;
      return;
    }
    _closing = true;
    if (silent) {
      clearTimeout(_idleWatchdogId);
      _idleShown = false;
      _lastSpectatorN = 0;
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      if (_groupMode) {
        // _exitGroupWaitAsSpectator (lobby.js) ya paró GroupSpectate antes de
        // llamar acá — esto solo limpia lo visual/flags que faltaban en este
        // camino (antes quedaban las flechas/el mirror/_groupMode pegados).
        if (window.GroupSpectate) window.GroupSpectate.stop();
        _hideGroupPovArrows();
        _hideGroupResultMirror();
        _groupMode = false;
        _groupInstant = false;
      } else if (window.Spectate) {
        window.Spectate.stop();
      }
      _exitRealUI();
      if (miniHud) miniHud.style.display = 'none'; // ver comentario largo más abajo en el camino principal
      // El cierre SILENCIOSO (silent=true) solo lo usa vs.js
      // (_exitWaitAsSpectator/_onOpponentAbandoned) para sacar al jugador del
      // modo "mirando al rival de prestado" JUSTO antes de mostrar SU PROPIA
      // pantalla de resultado (_showVsResult) — nunca para volver de verdad
      // al menú. flagsSpectatorExit()/etc. (llamado adentro de _exitRealUI())
      // igual reabre #loading-screen incondicionalmente cuando no es un
      // cambio de modo — sin este re-ocultado, ese jugador veía el menú
      // principal de fondo un instante (el "me kickea al menú" reportado) en
      // vez de quedar tapado directo por el overlay de resultado que llega
      // acto seguido.
      const ls = document.getElementById('loading-screen');
      if (ls) ls.style.display = 'none';
      _hideSplashMirror();
      screen.style.display = 'none';
      window._isSpectating = false;
      if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
      _closing = false;
      return;
    }
    // Frenar el watchdog de inactividad: si seguía corriendo y disparaba
    // _showIdleNotice() después de este cierre, reabriría la pantalla de
    // carga con nada que la vuelva a ocultar — se quedaba "trabada" ahí.
    clearTimeout(_idleWatchdogId);
    _idleShown = false;
    // Este espectador ya no está mirando a NADIE — el ícono de "cuántos me
    // están mirando" que se le mostraba a ÉL (ver _applySpectatorBadge, la
    // misma pantalla que ve el jugador espectado) no tiene sentido apenas se
    // cierra la sesión, y _applySpectatorBadge() no se vuelve a llamar sola
    // hasta el próximo evento — sin esto quedaba pegado, visible incluso de
    // vuelta en el menú.
    _lastSpectatorN = 0;
    const vsBadge = document.getElementById('vs-spectator-badge');
    const flagsBadge = document.getElementById('flags-vs-spectator-badge');
    if (vsBadge) vsBadge.style.display = 'none';
    if (flagsBadge) flagsBadge.style.display = 'none';
    // Mismo motivo — el panel de resultado del duelo (versus) no debe seguir
    // visible una vez cerrada la sesión, ni quedar bloqueando el back button
    // real si esta pestaña después arranca su PROPIA partida.
    if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
    // El canal se desuscribe YA, no en el setTimeout de más abajo (que solo
    // demora el desmontaje VISUAL detrás de la pantalla de carga) — antes
    // seguía viviendo mientras corría todo el teardownDelay (hasta 1900ms),
    // así que un broadcast tardío (round/pregame/tick que ya venía en
    // camino) todavía podía llegar y disparar _hideLoading(true) en medio de
    // ese lapso, haciendo que la pantalla de carga se cerrara sola apenas
    // terminaba su fade-in. Los handlers de _wireCommonCallbacks también
    // chequean _closing por si algo ya estaba en vuelo en el mismo instante.
    if (_groupMode) {
      if (window.GroupSpectate) window.GroupSpectate.stop();
      _hideGroupPovArrows();
      _hideGroupResultMirror();
      _groupMode = false;
      _groupInstant = false;
      // Por si se cerró la sesión justo en medio de un cambio de POV (ver
      // onPovChanged), con el spinner chiquito todavía en pantalla.
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
    } else if (window.Spectate) {
      window.Spectate.stop();
    }
    // #ingame-power tiene z-index:1600, A PROPÓSITO por encima de
    // #spectator-loading (1500) — necesario mientras se está espectando de
    // verdad (ej. el aviso de inactividad), para poder salir aunque el aviso
    // tape la pantalla. Pero acá ya se decidió cerrar del todo (teardown en
    // camino, ver más abajo) — dejarlo flotando arriba del cartel de "el
    // jugador dejó de jugar"/"volviendo al menú" durante todo el
    // teardownDelay (hasta 1900ms) se veía como un botón trabado/de más
    // encima de la pantalla de carga. _isSpectating recién se apaga (y
    // refreshIngamePower recién se vuelve a llamar) al final del teardown, así
    // que hay que ocultarlo a mano ACÁ, ya, en vez de esperar a eso.
    const powerEl = document.getElementById('ingame-power');
    if (powerEl) powerEl.style.display = 'none';
    // Misma transición tipo Clash Royale que al entrar, también al salir —
    // todo el desmontaje pasa DETRÁS de la pantalla de carga en vez de un
    // corte seco directo al menú. Si viene un motivo (ej. "el jugador dejó de
    // jugar"), se muestra ese texto en vez del genérico de "volviendo".
    if (loadingTextEl) loadingTextEl.textContent = message || ((typeof t === 'function') ? t('spectator.returning') : 'Volviendo al menú...');
    _showLoading();
    // #spectator-loading tarda 0.35s en hacer fade-in (ver CSS .visible) — si
    // el juego real se desmonta en el mismo instante que se pide el fade, se
    // ve el "salto" de la partida desapareciendo a través del overlay todavía
    // semi-transparente. Se espera a que quede totalmente opaco antes de tocar
    // nada del DOM del juego. Con motivo, además se espera un poco más para
    // que alcance a leerse antes de que el desmontaje dispare el fade-out.
    const teardownDelay = CLOSE_TEARDOWN_DELAY_MS + (message ? CLOSE_MESSAGE_HOLD_MS : 0);
    setTimeout(() => {
      // Spectate.stop() ya corrió arriba, apenas se decidió cerrar — acá solo
      // queda el desmontaje VISUAL, que sí se demora a propósito detrás de la
      // pantalla de carga.
      _exitRealUI();
      // _exitRealUI() empieza con "if (!_usingRealUI) return" — si el
      // espectado estaba en pregame/splash cuando se cerró la sesión (nunca
      // llegó a montarse una UI real de ronda, _usingRealUI seguía en
      // false), esa función corta ahí mismo SIN llegar a apagar miniHud
      // (esa línea vive adentro, después del guard). El cartel "ESPECTANDO
      // A..." quedaba pegado en pantalla incluso de vuelta en el menú
      // principal. Se apaga acá también, sin depender de ese guard.
      if (miniHud) miniHud.style.display = 'none';
      _hideSplashMirror();
      screen.style.display = 'none';
      // _exitRealUI() ya apaga esto de rebote cuando SÍ había UI real montada
      // (vía flagsSpectatorExit/shapesSpectatorExit) — pero si el cierre pasó
      // mientras solo se mostraba el splash mirror o la carga inicial
      // (_usingRealUI nunca llegó a ponerse en true), esa función no hace
      // nada y esto quedaba prendido para siempre. Apagarlo acá también,
      // incondicional, cubre ese caso.
      window._isSpectating = false;
      if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
      if (typeof playMusic === 'function' && typeof sfxMenuMusic !== 'undefined') playMusic(sfxMenuMusic);
      // _hideLoading() calcula su espera mínima (LOADING_MIN_MS) desde
      // _loadingShownAt, que quedó seteado en el _showLoading() de más arriba
      // — sin este reset, el delay de acá ya se comía casi todo ese
      // presupuesto (550ms) y la barra al 100% se veía solo un flash casi
      // instantáneo. Reiniciarlo acá le da los 550ms completos recién a
      // partir de este punto.
      _loadingShownAt = Date.now();
      _hideLoading();
    }, teardownDelay);
    setTimeout(() => { if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...'; }, teardownDelay + LOADING_MIN_MS + 400);
  }
  window.closeSpectator = closeSpectator;

  function _showEndMessage(text) {
    // Reusa la misma transición de cierre, con el motivo como texto — antes
    // esto mostraba el panel genérico plano y RECIÉN DESPUÉS la transición de
    // cierre (dos pantallas distintas seguidas); ahora es una sola.
    closeSpectator(text);
  }

  // No mostramos el panel "Conectando..." suelto — arranca TAPADO por la
  // transición de carga (_showLoading, llamada justo después de esto) y recién
  // se revela cuando ya sabemos qué vista corresponde (real UI o fallback),
  // para que no se vea un panel independiente parpadeando antes del fundido.
  function _resetPanel(friend, title) {
    _closing = false;
    _lastRoundKey = null;
    _lastPregameKey = null;
    // openSpectatorGroup lo prende explícito DESPUÉS de llamar acá — toda
    // sesión nueva (1v1/solo/grupo) arranca sin flechas hasta que se sepa
    // cuál de las tres es.
    _groupMode = false;
    _groupInstant = false;
    _hideGroupPovArrows();
    // Si ya había una UI real montada (ej. estábamos espectando a OTRO amigo
    // de este mismo match y se abrió esta sesión nueva sin esperar a que
    // closeSpectator() terminara su teardown async) hay que desmontarla DE
    // VERDAD acá — antes esto solo hacía `_usingRealUI = false` a mano, sin
    // llamar a flagsSpectatorExit/etc. ni resetear _activeRealUIMode, así que
    // _enterRealUIIfPossible() de la sesión nueva creía que no había nada
    // montado y llamaba a *SpectatorEnter() ENCIMA del DOM/estado todavía
    // vivo del amigo anterior — setTimeouts pendientes (el whoosh de 600ms de
    // flagsSpectatorResolvePick, el times-up, el 3-2-1 corriendo) sobrevivían
    // al cambio y más tarde pisaban transforms de la sesión nueva (el
    // "máquina/findluggage desincronizados al cambiar de POV" reportado).
    _exitRealUI();
    _hideSplashMirror();
    _friendName   = friend && friend.name   ? friend.name   : '';
    _friendAvatar = friend && friend.avatar ? friend.avatar : '';
    _friendCardCode = (friend && friend.cardCode) || '0001';
    _friendFrameCode = (friend && friend.frameCode) || '0001';
    _friendIsHost = true;
    _lastHost = _lastGuest = 0;
    _oppName = null; _oppAvatar = null; _oppCardCode = '0001';
    _suppressGenericEnd = false;
    miniHud.style.display = 'none';
    // Vs.js (_enterWaitAsSpectator) pisa este texto con "esperando a los
    // otros jugadores" cuando el que mira es EL PROPIO JUGADOR esperando al
    // rival — hay que devolverlo al genérico "ESPECTANDO" acá, al arrancar
    // cualquier sesión NUEVA (amigo real), para que no quede pegado de una
    // sesión anterior.
    const tagEl = document.getElementById('spectator-mini-tag');
    if (tagEl) tagEl.textContent = (typeof t === 'function') ? t('spectator.watchingTag', 'ESPECTANDO') : 'ESPECTANDO';
    screen.style.display = 'none';
    screen.classList.remove('spectator-solo');
    titleEl.textContent  = title;
    statusEl.textContent = '';
    promptEl.textContent = '';
    optionsEl.innerHTML  = '';
    hostNameEl.textContent  = 'Host';
    guestNameEl.textContent = 'Guest';
    hostScoreEl.textContent  = '0';
    guestScoreEl.textContent = '0';
    hostPic.src  = 'images/profilepic/ppdefault.png';
    guestPic.src = 'images/profilepic/ppdefault.png';
    // Arranca en el marco default — cada lado lo pisa con el suyo propio
    // (friend.frameCode / el del rival, resuelto via oppId más abajo) apenas
    // se sepa quién es quién.
    if (window.CustomizeAssets) {
      window.CustomizeAssets.applyFrame(hostPicWrap, '0001');
      window.CustomizeAssets.applyFrame(guestPicWrap, '0001');
    }
  }

  function _wireCommonCallbacks() {
    window.Spectate.onRound(payload => {
      if (_closing) return; // ver comentario largo en closeSpectator
      // Versus: esta ronda es del RIVAL del amigo espectado, no de él — ver
      // _isFromFriendSide. El rival sigue avanzando de rondas por su cuenta;
      // la próxima que sí sea del amigo llega por su propio broadcast.
      if (!_isFromFriendSide(payload && payload.role)) return;
      // Ver comentario largo en el onTick de más abajo / _armGameEndFallback
      // (vs.js) — misma señal de "el rival sigue jugando de verdad".
      if (typeof window._vsSpectatorHeartbeat === 'function') window._vsSpectatorHeartbeat();
      _hideSplashMirror();
      _mode = payload.mode || _mode;
      _enterRealUIIfPossible(_mode);
      // Recién acá _usingRealUI ya puede estar en true (lo decide la línea de
      // arriba) — si se llamaba antes, el watchdog nunca se armaba en la
      // primera ronda porque todavía veía _usingRealUI en false.
      _resetIdleWatchdog();
      // Recién ahora hay algo real para mostrar (antes podía ser pregame/cuenta
      // 3-2-1 del jugador, sin ronda todavía) — acá es cuando se desvanece la
      // pantalla de carga, no apenas se conecta el canal. immediate=true (igual
      // que onPregame/onPostgame): el contenido de la ronda YA está armado en
      // el DOM en este punto — la espera mínima artificial (LOADING_MIN_MS,
      // pensada para transiciones sin contenido real detrás) solo agregaba
      // hasta ~550ms+fade de más encima de algo que ya estaba listo para
      // mostrarse (el "se demora 1s en cargar" reportado).
      // Reset del texto por si veníamos de onSplash (que lo pisa con "está por
      // empezar...") — sin esto, la PRÓXIMA vez que se muestre el overlay por
      // otro motivo (onAdvancing no setea texto propio) se veía ese mensaje
      // viejo pegado.
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading(true);
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        // Por si veníamos de un postgame (partida anterior de la campaña) que
        // se quedó en pantalla — la ronda nueva ya arrancó, no corresponde
        // seguir mostrando resultados viejos.
        if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
        // Mismo motivo pero para el panel de resultado de versus (ver
        // onPostgame más abajo) — barato de llamar aunque no estuviera
        // mostrado (solo toca display:none).
        if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
        // Deduplicar: misma identidad que la última ronda ya mostrada = el
        // mismo 'round' llegó dos veces (en vivo + resend). Rearmar tags/
        // maletines/tablero de nuevo repetía la animación de entrada y el
        // sonido — ver comentario largo en _lastRoundKey. Se incluye
        // payload.index (flags/shapes YA lo mandan; cities también) además de
        // prompt/correctSlot/options porque cities no tiene estos últimos tres
        // — sin index, TODAS las rondas de cities colisionarían en la misma
        // key y showRound() nunca se volvería a llamar después de la primera.
        const roundKey = payload.mode + '|' + payload.index + '|' + payload.prompt + '|' + payload.cityName + '|' + payload.correctSlot + '|' + JSON.stringify(payload.options || []);
        const isDuplicate = roundKey === _lastRoundKey;
        _lastRoundKey = roundKey;
        if (!isDuplicate && fns && typeof window[fns.showRound] === 'function') window[fns.showRound](payload);
        // El broadcast de 'tick' es 1x/seg — sin esto el contador queda en
        // blanco hasta que llega el primer tick (hasta 1s después de entrar).
        // La ronda ya trae el timeLeft del momento en que arrancó, así que lo
        // mostramos de una.
        if (typeof payload.timeLeft === 'number' && fns && typeof window[fns.updateTimer] === 'function') {
          window[fns.updateTimer](payload.timeLeft);
        }
        return;
      }
      screen.style.display = 'flex';
      statusEl.textContent = '';
      promptEl.textContent = _mode === 'flags' ? _label(payload.prompt) : '¿Cuál es este país?';
      renderOptions(payload);
    });
    window.Spectate.onAnswer(payload => {
      if (_closing) return;
      // Versus: esta respuesta es del RIVAL, no del amigo espectado — el
      // tablero (picks/reveals) solo debe reaccionar a las jugadas del
      // amigo. El puntaje del rival de todos modos se actualiza aparte, vía
      // onScore (postgres_changes/broadcast:score, que sí trae ambos lados
      // correctamente separados por columna, no por este mismo payload).
      if (!_isFromFriendSide(payload && payload.role)) return;
      _resetIdleWatchdog();
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns && typeof window[fns.resolvePick] === 'function') window[fns.resolvePick](payload);
        // GlobeQuiz no tiene más rondas — payload.win=true es LITERALMENTE el
        // fin de la partida del amigo (a diferencia de un acierto cualquiera
        // en flags/shapes/cities/monuments, que solo avanza a la próxima
        // ronda), así que acá se cierra la sesión sola a los 3s en vez de
        // esperar a que el amigo, ya de vuelta en el menú, la corte por su
        // cuenta (el "no se desconecta solo" reportado). window._setPlaying(false)
        // (ver submitGuess en globequiz.js, 2s después de este mismo acierto)
        // también termina desconectando por la vía genérica de presence
        // ("dejó de jugar") si llega primero — este timeout de acá es el que
        // garantiza el corte a un tiempo fijo y predecible (3s) sin depender
        // de la latencia real de esa propagación, y con el mensaje correcto
        // ("terminó la partida", no el genérico de abandono).
        if (_mode === 'globequiz' && payload && payload.win) {
          setTimeout(() => {
            if (_closing) return;
            const who = _friendName || ((typeof t === 'function') ? t('spectator.defaultPlayer') : 'El jugador');
            const msg = (typeof t === 'function') ? t('spectator.finished', { name: who }) : `¡${who} terminó la partida!`;
            _showEndMessage(msg);
          }, 3000);
        }
        return;
      }
      highlightPick(payload);
    });
    // Señal de "falló" para la fila del leaderboard correspondiente (amigo o
    // rival, según de qué lado vino) — mismo flash/emote que ve cada jugador
    // real sobre la fila del OTRO cuando falla. Nunca se registraba nada acá
    // antes (quedó definida en spectate.js pero muerta, mismo patrón que
    // _specReportAdvancing en su momento).
    window.Spectate.onWrong(role => {
      if (_closing || !_usingRealUI || window.Spectate.isSolo()) return;
      const fns = REAL_UI_MODES[_mode];
      if (!fns || typeof window[fns.wrongEffect] !== 'function') return;
      window[fns.wrongEffect](_isFromFriendSide(role) ? 'friend' : 'opponent');
    });
    window.Spectate.onEnd(reason => {
      // Ver comentario largo en _suppressGenericEnd — vs.js (_enterWaitAsSpectator/
      // _tryShowVsResultWhenBothDone) es quien decide cuándo y cómo salir de
      // esta sesión cuando el que "espectea" es el propio jugador; este
      // handler genérico (pensado para un amigo externo) se queda afuera del
      // todo en ese caso, sin importar el motivo.
      if (_suppressGenericEnd) return;
      clearTimeout(_idleWatchdogId);
      const who = _friendName || ((typeof t === 'function') ? t('spectator.defaultPlayer') : 'El jugador');
      const msg = (typeof t === 'function')
        ? t(reason === 'finished' ? 'spectator.finished' : 'spectator.left', { name: who })
        : (reason === 'finished' ? `¡${who} terminó la partida!` : `${who} dejó de jugar`);
      _showEndMessage(msg);
    });
    window.Spectate.onTick((timeLeft, role) => {
      if (_closing) return;
      if (!_isFromFriendSide(role)) return; // el reloj del rival no es el que se muestra
      // Ver comentario largo en _armGameEndFallback (vs.js): cuando quien
      // "espectea" es EL PROPIO JUGADOR mirando a su rival de prestado
      // (_enterWaitAsSpectator), este tick real es la señal de que el rival
      // sigue jugando de verdad — rearma el salvavidas de 12s para que no
      // dispare solo porque al rival todavía le queda tiempo de partida. Para
      // un espectador externo esto queda sin definir (no-op).
      if (typeof window._vsSpectatorHeartbeat === 'function') window._vsSpectatorHeartbeat();
      _resetIdleWatchdog();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.updateTimer] === 'function') window[fns.updateTimer](timeLeft);
    });
    window.Spectate.onTimesUp(role => {
      if (_closing || !_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      // Efecto (temblor + cronómetro) en la cartilla del que se quedó sin
      // tiempo — para AMBOS lados (amigo o rival), igual que el flash de 'wrong'.
      if (fns && typeof window[fns.timesUpEffect] === 'function') window[fns.timesUpEffect](_isFromFriendSide(role) ? 'friend' : 'opponent');
      // El overlay grande "TIME'S UP" solo cuando termina la ronda del AMIGO
      // (que es la partida que se muestra en pantalla).
      if (!_isFromFriendSide(role)) return;
      if (fns && typeof window[fns.showTimesUp] === 'function') window[fns.showTimesUp]();
    });
    // Cuenta 3-2-1 antes de que arranque la ronda — puede ser lo PRIMERO que
    // llegue si el espectador se conecta justo cuando el jugador arranca una
    // partida nueva (todavía sin ningún 'round'), así que también intenta
    // entrar a la UI real acá, no solo en onRound.
    window.Spectate.onPregame(payload => {
      if (_closing) return;
      // Igual que onRound: este 3-2-1 es del rival, no del amigo espectado.
      if (!_isFromFriendSide(payload && payload.role)) return;
      _hideSplashMirror();
      // CRÍTICO: actualizar _mode ACÁ, antes de _enterRealUIIfPossible — sin
      // esto _mode quedaba pegado en lo último que dejó 'round' (el modo
      // ANTERIOR de la campaña, o el default 'flags' si este es el primer
      // 'pregame' que llega en toda la sesión), montando la UI del modo
      // EQUIVOCADO durante todo el 3-2-1 — el "muestra assets de banderas en
      // el 3-2-1 de Cities" reportado. Antes esto "zafaba" para flags (primer
      // modo de la campaña, coincide con el default) y para shapes (su
      // 'round' YA llega antes que su 'pregame' y actualiza _mode) — pero
      // Cities no tiene ninguna de esas dos casualidades a favor.
      _mode = (payload && payload.mode) || _mode;
      _enterRealUIIfPossible(_mode);
      // No _resetIdleWatchdog() (que rearma el timer): pregame/postgame ya
      // son un estado conocido y mostrado — armar el watchdog acá disparaba
      // el aviso genérico de "está en otra parte del juego" ENCIMA de la
      // cuenta 3-2-1/resultados que recién se pusieron, sin sentido si ya
      // sabemos exactamente qué está pasando. Solo se limpia lo pendiente.
      _clearIdleWatchdog();
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading(true);
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      // Deduplicar igual que onRound: mismo startedAt = el mismo 3-2-1 ya
      // procesado (en vivo + resend) — llamar showPregame() de nuevo
      // recalculaba elapsedMs más grande la segunda vez (más tiempo pasado) y
      // el conteo saltaba de golpe a un número más avanzado.
      const pregameKey = payload && payload.startedAt;
      const isDuplicatePregame = pregameKey != null && pregameKey === _lastPregameKey;
      _lastPregameKey = pregameKey != null ? pregameKey : _lastPregameKey;
      if (!isDuplicatePregame) {
        // Mismo sonido que escucha el jugador real al clickear su propio
        // confirm de splash paso 2 (arranca el 3-2-1) — gateado igual que
        // showPregame() con isDuplicatePregame para no repetirlo en un
        // resend del mismo pregame ya visto (unión a mitad del 3-2-1).
        if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        if (fns && typeof window[fns.showPregame] === 'function') window[fns.showPregame](payload);
      }
    });
    // Puntaje (y dots del trencito, solo Cities/Monuments) ya conocidos
    // reenviados SOLO a quien se une a mitad de una ronda ya en curso (sin
    // pregame de por medio) — ver SoloSpectate.reportScoreSync en
    // _resendStateTo(). 'round' no trae ninguno de los dos, así que sin esto
    // el marcador y el trencito de puntitos se quedaban en 0 hasta la
    // PRÓXIMA respuesta del jugador real.
    window.Spectate.onScoreSync((score, dots) => {
      if (_closing || !_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.updateScore] === 'function') window[fns.updateScore](score, dots);
    });
    // Cuántos espectadores hay mirando (a este mismo incluido) — mismo ícono
    // que ve el jugador de sí mismo. Se guarda el valor siempre (incluso con
    // _closing/loading todavía tapando) — _applySpectatorBadge() es la que
    // decide si corresponde tocar el DOM ahora o esperar a que la carga
    // termine (ver su propio comentario).
    window.Spectate.onSpectatorCount(n => {
      _lastSpectatorN = n;
      _applySpectatorBadge();
    });
    // Pantalla de resultados del jugador espectado — solo tiene sentido si ya
    // estábamos en la UI real de algún modo (si nunca hubo ronda, tampoco hay
    // "resultados" que mostrar de forma coherente).
    window.Spectate.onPostgame(payload => {
      if (_closing) return;
      // Ver comentario largo en _suppressGenericEnd — cuando el que "espectea"
      // es EL PROPIO JUGADOR mirando a su rival de prestado (_enterWaitAsSpectator
      // en vs.js), este mismo broadcast 'postgame' (el RIVAL corriendo SU
      // PROPIO _showVsResult, que llama VS.reportPostgame) también le llega a
      // este cliente por el canal de Spectate.watch que sigue abierto — sin
      // este guard, se llamaba vsSpectatorShowResult() (panel NEUTRAL, sin
      // "PERDISTE"/"GANASTE", con nombres host/guest en vez de "vos"/rival)
      // pisando el resultado real que el propio _tryShowVsResultWhenBothDone/
      // _showVsResult de ESTE jugador está por mostrar (o ya mostró) sobre el
      // MISMO #vs-result-screen — el "pierdo el PERDISTE y el status del
      // contrincante" reportado.
      if (_suppressGenericEnd) return;
      _hideSplashMirror();
      _clearIdleWatchdog();
      _hideLoading(true);
      // Versus: 'postgame' acá es el resultado FINAL del duelo (ver
      // VS.reportPostgame en vs.js, llamado desde _showVsResult), no la
      // pantalla de resultados de un modo solo/campaña — payload trae
      // host/guest en vez de correctCount/wrongCount, así que necesita su
      // propio panel neutral (quién ganó el duelo), no el dispatch por modo.
      if (!window.Spectate.isSolo()) {
        if (typeof window.vsSpectatorShowResult === 'function') window.vsSpectatorShowResult(payload);
        return;
      }
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.showPostgame] === 'function') window[fns.showPostgame](payload);
    });
    // Solo GlobeQuiz lo usa (ver reportGqGuesses en SoloSpectate) — lista
    // COMPLETA de guesses ya hechos, reenviada al unirse a mitad de partida
    // (el "no le salen los países ya escritos" reportado). Sin animación/
    // sonido a propósito (globequizSpectatorSyncGuesses, separada de
    // resolvePick que sí es la ruta en vivo).
    window.Spectate.onGqGuesses(list => {
      if (_closing || _mode !== 'globequiz' || !_usingRealUI) return;
      if (typeof window.globequizSpectatorSyncGuesses === 'function') window.globequizSpectatorSyncGuesses(list);
    });
    // El jugador real confirmó salir del postgame hacia el siguiente modo de
    // la campaña — todavía no hay round/pregame nuevo (puede tardar mientras
    // navega SU splash de instrucciones) pero YA NO tiene sentido seguir
    // mostrando el postgame viejo, como si el jugador siguiera ahí. Se tapa
    // con la misma transición de carga que se usa al conectar — se desvanece
    // sola apenas llegue el próximo round/pregame real ('immediate' en esos
    // handlers).
    window.Spectate.onAdvancing(() => {
      if (_closing) return;
      _clearIdleWatchdog();
      // Mismo sonido que escucha el jugador real al clickear su propio
      // confirm de postgame (gameover-confirm-wrap) — reportAdvancing() SOLO
      // se dispara desde ESE click, nunca como resend genérico, así que acá
      // siempre corresponde a una transición real, no a alguien poniéndose
      // al día. Sin esto, cada cambio de pantalla en modo espectador pasaba
      // en silencio — se sentía "raro" comparado con lo que oye el jugador.
      if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _hideSplashMirror();
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      }
      _showLoading();
    });
    // El AMIGO que se estaba espectando terminó su cronómetro y (si el rival
    // sigue jugando) cambia de prestado al modo espectador DE SU PROPIO RIVAL
    // (ver _enterWaitAsSpectator en vs.js) — deja de generar rondas/ticks
    // propios. Sin esto, un espectador EXTERNO que lo estaba mirando a ÉL se
    // quedaba sin ninguna señal nueva (el amigo ya no juega, solo mira) hasta
    // que el watchdog de inactividad terminaba mostrando "el jugador está en
    // otro lado" — en vez de eso, acá simplemente lo seguimos: pasamos a
    // mostrar al RIVAL (que sigue jugando) como si fuera la nueva "persona
    // espectada", usando la identidad que ya se había resuelto para él
    // (_oppName/_oppAvatar). No aplica en modo solo (no hay rival).
    //
    // OJO: si _suppressGenericEnd está activo, este mismo evento 'gameend' YA
    // lo maneja vs.js (_enterWaitAsSpectator/_launchVersus registró SU PROPIO
    // window.Spectate.onGameEnd ANTES de llamar acá a openSpectator) — ese es
    // el caso donde el que "espectea" es el propio jugador esperando a que
    // termine el rival, no un espectador externo. Si acá se registrara IGUAL,
    // esta llamada a onGameEnd (que solo guarda UN callback a la vez)
    // pisaría esa registración y rompería el mecanismo de _revealAt
    // sincronizado. Se salta del todo en ese caso.
    if (!_suppressGenericEnd) {
      window.Spectate.onGameEnd(payload => {
        if (_closing || window.Spectate.isSolo()) return;
        if (!_isFromFriendSide(payload && payload.role)) return; // no es el amigo que miro, no hay nada que seguir
        _friendIsHost = !_friendIsHost;
        const swapName = _oppName, swapAvatar = _oppAvatar;
        _oppName = _friendName || _oppName;
        _oppAvatar = _friendAvatar || _oppAvatar;
        _friendName = swapName || _friendName;
        _friendAvatar = swapAvatar || _friendAvatar;
        miniNameEl.textContent = _friendName || 'Jugador';
        if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
        window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
        _resetIdleWatchdog();
        if (_usingRealUI) _updateMiniScores();
      });
    }
    // El jugador real está en la pantalla de instrucciones de un modo (splash),
    // todavía sin confirmar — puede tardar lo que quiera ahí. A diferencia de
    // onAdvancing (aviso transitorio, solo tiene sentido si ya había alguien
    // mirando), este SÍ se cachea del lado del broadcaster (reportSplash) y
    // por eso puede ser el primer evento que recibe un espectador que se une
    // recién ahora. Muestra el #splash-screen REAL en modo solo-lectura (ver
    // _showSplashMirror) en vez de solo un cartel de "Cargando..." — antes de
    // esto, un espectador que se unía mientras el jugador estaba leyendo las
    // instrucciones se quedaba viendo la pantalla de "Conectando..." sin
    // ningún contenido real hasta que arrancaba el 3-2-1.
    window.Spectate.onSplash(payload => {
      if (_closing) return;
      _clearIdleWatchdog();
      // Mismo sonido que escucha el jugador real al clickear el botón de
      // modo (arranca un modo nuevo) o su propio confirm de splash paso 1
      // (avanza a instrucciones) — reportSplash() se dispara únicamente
      // desde esos dos clicks reales (más el resend a quien se une recién,
      // que de todos modos es la primera vez que ESTE espectador ve esa
      // transición). Mismo motivo que onAdvancing: sin esto, en silencio.
      if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      // A diferencia de onAdvancing/onPregame/onPostgame (que solo ocultan el
      // postgame viejo y dejan el resto de la UI real mounted, tapado por el
      // overlay), acá hay que DESMONTARLA del todo: banderas/siluetas tienen
      // piezas con z-index muy alto (ej. #flags-countdown-widget:1000) — muy
      // por encima del z-index:100 de #splash-screen — que flotarían ENCIMA
      // del mirror de instrucciones si solo se tapaban con el overlay en vez
      // de desmontarse de verdad. switchingMode=true: seguimos espectando.
      _exitRealUI(true);
      // Mismo motivo que en onPregame: actualizar _mode ya, no solo pasarlo
      // como parámetro local a _showSplashMirror — así cualquier otro código
      // que lea _mode durante este rato (ej. si llegara un 'pregame' con
      // startedAt viejo/duplicado antes de que llegue un 'round' real) ve el
      // modo correcto, no el de la campaña anterior.
      _mode = (payload && payload.mode) || _mode;
      // Mostrar el cartel "ESPECTANDO"/nombre/contador acá directo (no solo
      // dejar que _exitRealUI(true) NO lo apague) — cubre el caso de un
      // espectador que se une durante el PRIMER splash de la sesión, antes
      // de haber entrado nunca a una UI real (_usingRealUI todavía false,
      // _exitRealUI ni siquiera llega a ejecutar por el guard de arriba).
      miniNameEl.textContent = _friendName || 'Jugador';
      if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
      window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
      miniHud.style.display = 'flex';
      _showSplashMirror(payload && payload.mode, payload && payload.step);
      // Misma música que suena en la pantalla real de instrucciones (ver los
      // handlers de loading-flags-btn/loading-shapes-btn/etc., que arrancan
      // sfxPregame ahí) — antes acá no se tocaba la música para nada, y el
      // onSnapshot inicial ya había dejado sonando sfxGameMusic (el loop de
      // JUEGO) de entrada, sin importar en qué pantalla estuviera el jugador.
      if (typeof playMusic === 'function' && typeof sfxPregame !== 'undefined') playMusic(sfxPregame);
    });
  }

  // matchId: fila de `matches` (Versus 1v1) a mirar. friend: { id, name, avatar }
  // — el amigo que abrió el ojo (para saber qué lado del marcador es "él").
  // opts.instant (ver _enterWaitAsSpectator en vs.js): el que "espectea" acá
  // es EL PROPIO JUGADOR mirando a su rival de prestado apenas termina su
  // cronómetro — para él NO hay conexión nueva que esperar, ya estaba ahí
  // jugando un segundo antes. Mostrar la pantalla de "Cargando partida..."
  // como si recién se estuviera conectando se sentía como un salto/recorte
  // de más — se salta ese overlay del todo, la pantalla de juego (la última
  // que se vio, después del propio TIME'S UP) se queda tal cual hasta que
  // llega el primer 'round'/'pregame' real del rival y la reemplaza.
  window.openSpectator = function (matchId, friend, opts) {
    if (!window.Spectate) return;
    const instant = !!(opts && opts.instant);
    _resetPanel(friend, (typeof t === 'function')
      ? (friend && friend.name ? t('spectator.watchingFriend', { name: friend.name }) : t('spectator.watchingMatch'))
      : (friend && friend.name ? ('Mirando a ' + friend.name) : 'Mirando partida'));
    // Ver comentario largo en _suppressGenericEnd — tiene que ir DESPUÉS de
    // _resetPanel (que lo apaga a false por defecto para toda sesión nueva).
    _suppressGenericEnd = instant;
    // Ver comentario largo en openSpectatorSolo — mismo fix acá por las dudas
    // (versus resuelve _enterRealUIIfPossible casi al toque en onSnapshot, así
    // que la ventana sin esto era chica, pero no hay razón para dejarla).
    window._isSpectating = true;
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    // instant: el círculo de espera (#vs-wait-spinner) ya lo prendió
    // _vsHandleGameEnd (vs.js) apenas terminó mi propio cronómetro, ANTES de
    // llegar acá — y flags.js/shapes.js ya lo apagan solos en el mismo punto
    // donde revelan la ronda real del rival. No hace falta tocar nada más
    // acá, solo evitar el "Cargando partida..." de pantalla completa (se
    // sentía como un salto/reset — ver comentario más arriba).
    if (!instant) _showLoading();

    window.Spectate.onSnapshot(match => {
      _mode = match.mode || 'flags';
      _friendIsHost = !!(friend && friend.id === match.host_id);
      if (friend) {
        if (_friendIsHost) {
          hostNameEl.textContent = friend.name || 'Host';
          if (friend.avatar) hostPic.src = friend.avatar;
          window.CustomizeAssets?.applyFrame(hostPicWrap, friend.frameCode || '0001');
        } else {
          guestNameEl.textContent = friend.name || 'Guest';
          if (friend.avatar) guestPic.src = friend.avatar;
          window.CustomizeAssets?.applyFrame(guestPicWrap, friend.frameCode || '0001');
        }
      }
      _lastHost = match.host_score  || 0;
      _lastGuest = match.guest_score || 0;
      hostScoreEl.textContent  = _lastHost;
      guestScoreEl.textContent = _lastGuest;
      // Identidad del rival — la partida solo trae host_id/guest_id (ids),
      // no nombre/foto (ni frame_code, ver applyFrame más abajo); sin esto
      // el espectador nunca sabía quién era la otra persona (ver
      // citiesSpectatorSetPlayerCard etc., que ahora también muestran su
      // fila). Se resuelve una sola vez por sesión.
      const oppId = _friendIsHost ? match.guest_id : match.host_id;
      if (oppId && window.sb) {
        window.sb.from('profiles').select('username, avatar_url, frame_code, card_code').eq('id', oppId).single()
          .then(({ data }) => {
            if (!data || _closing) return;
            const oppWrap = _friendIsHost ? guestPicWrap : hostPicWrap;
            window.CustomizeAssets?.applyFrame(oppWrap, data.frame_code || '0001');
            _oppName = data.username || 'Rival';
            _oppAvatar = data.avatar_url || null;
            _oppCardCode = data.card_code || '0001';
            if (_usingRealUI) _updateMiniScores();
          })
          .catch(() => {});
      }
      // Nota: NO ocultamos la carga acá — el snapshot solo confirma que nos
      // conectamos, pero puede que el jugador siga en pregame/cuenta 3-2-1 sin
      // ninguna ronda todavía. Eso se resuelve en el primer 'onRound'.
      // OJO: tampoco arrancamos música acá — el snapshot no sabe en qué fase
      // real está el jugador (splash/pregame/ronda), así que arrancar
      // sfxGameMusic siempre de una sonaba mal (gameloop de fondo mientras el
      // jugador todavía estaba en instrucciones o en el 3-2-1). Cada fase
      // prende la música que le corresponde (onSplash→pregameloop,
      // onPregame→silencio, el reveal de onRound→gameloop).
      _enterRealUIIfPossible(_mode);
      if (_usingRealUI) _updateMiniScores();
      // Estado en vivo GUARDADO (ver _persistLiveState en vs.js) — antes lo
      // único que existía era el reenvío EN VIVO del rival al detectar mi
      // presence join (con latencia real de red de por medio, sumada a la de
      // soltar/reconectar canal en _enterWaitAsSpectator) — ahora este mismo
      // snapshot (fase + ronda/pregame/postgame vigente) ya vino con el
      // match en esta ÚNICA consulta REST, así que se puede aplicar YA,
      // sin esperar nada en tiempo real. El resend en vivo sigue llegando
      // igual poco después — es redundante pero inofensivo (mismo payload).
      const friendState = _friendIsHost ? match.host_state : match.guest_state;
      if (friendState && friendState.phase && _usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns) {
          if (friendState.round && typeof window[fns.showRound] === 'function') window[fns.showRound](friendState.round);
          if (friendState.phase === 'pregame' && friendState.pregame && typeof window[fns.showPregame] === 'function') window[fns.showPregame](friendState.pregame);
          if (friendState.phase === 'postgame' && friendState.postgame && typeof window[fns.showPostgame] === 'function') window[fns.showPostgame](friendState.postgame);
        }
      }
    });
    window.Spectate.onScore((h, g) => {
      _lastHost = h || 0; _lastGuest = g || 0;
      hostScoreEl.textContent  = _lastHost;
      guestScoreEl.textContent = _lastGuest;
      if (_usingRealUI) _updateMiniScores();
    });
    _wireCommonCallbacks();

    window.Spectate.watch(matchId, instant ? { suppressPresenceGone: true } : undefined).catch(() => {
      if (!instant) {
        _hideLoading();
        screen.style.display = 'flex';
        statusEl.textContent = (typeof t === 'function') ? t('spectator.failedToOpen') : 'No se pudo abrir la partida.';
        setTimeout(closeSpectator, 1500);
        return;
      }
      // instant (EL PROPIO JUGADOR mirando a su rival de prestado, ver
      // _enterWaitAsSpectator en vs.js): antes esto se tragaba el error en
      // silencio y no reintentaba nada — si Spectate.watch() fallaba por la
      // carrera real de Supabase (dos canales suscriptos casi a la vez al
      // mismo tema 'match-{id}', ver releaseChannel), este jugador se quedaba
      // sin NINGÚN dato en vivo del rival (ni tick ni gameend real) durante
      // TODO el resto de la espera, dependiendo a ciegas del salvavidas de
      // 12s de vs.js pase lo que pase — sin importar cuánto le quedara de
      // verdad al rival (el "me kickea siempre a los 12s" reportado). Un
      // reintento corto cubre ese caso sin arriesgar nada si de verdad no hay
      // nada que reintentar (match ya cerrado, etc. — el segundo intento
      // también falla en silencio, sin loop infinito).
      setTimeout(() => {
        if (_closing) return;
        window.Spectate.watch(matchId, { suppressPresenceGone: true }).catch(() => {});
      }, 400);
    });
  };

  // userId: dueño de una partida INDIVIDUAL (Gira Mundial/modo solo, sin fila
  // en `matches`) a mirar. friend: { id, name, avatar }. Layout de un solo lado.
  window.openSpectatorSolo = function (userId, friend) {
    if (!window.Spectate) return;
    _resetPanel(friend, (typeof t === 'function')
      ? (friend && friend.name ? t('spectator.watchingFriend', { name: friend.name }) : t('spectator.watchingMatch'))
      : (friend && friend.name ? ('Mirando a ' + friend.name) : 'Mirando partida'));
    screen.classList.add('spectator-solo');
    hostNameEl.textContent = friend && friend.name ? friend.name : 'Jugador';
    if (friend && friend.avatar) hostPic.src = friend.avatar;
    window.CustomizeAssets?.applyFrame(hostPicWrap, (friend && friend.frameCode) || '0001');
    // Antes esto quedaba en false hasta que flagsSpectatorEnter/
    // shapesSpectatorEnter lo prendían (recién al montar la ronda real) — si
    // el jugador espectado estaba en instrucciones o en el 3-2-1 largo rato,
    // el ícono de #ingame-power seguía mostrando "power" (quit de una partida
    // real inexistente) en vez de "back" (salir de espectar), dejando al
    // espectador sin forma de volver al menú durante todo ese rato. Se prende
    // ACÁ, apenas se abre la sesión — closeSpectator lo apaga de vuelta.
    window._isSpectating = true;
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    _showLoading();

    window.Spectate.onSnapshot(() => {
      // Igual que en openSpectator: conectado no es lo mismo que "hay algo para
      // mostrar" — puede estar en splash/pregame. La carga se oculta en el
      // primer round. No arrancar música acá (ver comentario largo en
      // openSpectator) — cada fase prende la que le corresponde.
    });
    window.Spectate.onScore((s) => {
      _lastHost = s || 0;
      hostScoreEl.textContent = _lastHost;
      if (_usingRealUI) _updateMiniScores();
    });
    _wireCommonCallbacks();

    window.Spectate.watchSolo(userId).catch(() => {
      _hideLoading();
      screen.style.display = 'flex';
      statusEl.textContent = (typeof t === 'function') ? t('spectator.failedToOpen') : 'No se pudo abrir la partida.';
      setTimeout(closeSpectator, 1500);
    });
  };

  // ── ESPECTADOR GRUPAL (lobby de hasta 10) ──────────────────────────────────
  const groupPovPrevEl = document.getElementById('spectator-mini-pov-prev');
  const groupPovNextEl = document.getElementById('spectator-mini-pov-next');
  const groupMiniRowEl = document.getElementById('spectator-mini-row');
  function _hideGroupPovArrows() {
    if (groupPovPrevEl) { groupPovPrevEl.style.display = 'none'; groupPovPrevEl.classList.remove('disabled'); }
    if (groupPovNextEl) { groupPovNextEl.style.display = 'none'; groupPovNextEl.classList.remove('disabled'); }
    // .group-pov (ver CSS) es lo que fija las flechas por posición absoluta
    // en vez de dejarlas fluir en el flex — sacarla acá restaura el layout
    // normal (sin ancho mínimo/padding de más) para 1v1/solo.
    if (groupMiniRowEl) groupMiniRowEl.classList.remove('group-pov');
    // Sacar el font-size chico que haya dejado _fitGroupPovName() — 1v1/solo
    // no tienen ancho reservado por flechas, así que el nombre vuelve a su
    // tamaño normal de CSS.
    if (miniNameEl) miniNameEl.style.fontSize = '';
  }
  function _showGroupPovArrows() {
    if (groupPovPrevEl) groupPovPrevEl.style.display = 'flex';
    if (groupPovNextEl) groupPovNextEl.style.display = 'flex';
    if (groupMiniRowEl) groupMiniRowEl.classList.add('group-pov');
  }
  // Actualiza nombre/avatar del mini-HUD al miembro actualmente mirado —
  // cambiar de POV (flechas) reusa el MISMO canal (todos los miembros ya
  // transmiten al mismo topic 'lobby-{id}'), así que no hace falta reconectar
  // nada, solo refrescar la identidad mostrada.
  function _applyGroupPovMember(member) {
    _friendName   = member && member.name   ? member.name   : '';
    _friendAvatar = member && member.avatar ? member.avatar : '';
    _friendFrameCode = (member && member.frameCode) || '0001';
    miniNameEl.textContent = _friendName || 'Jugador';
    if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
    window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
    _fitGroupPovName();
  }

  // Encoge el font-size del nombre hasta que entre en el ancho reservado
  // entre las flechas (ver .group-pov .spectator-mini-name en CSS) — antes
  // se cortaba con ellipsis ("Nombr...") para no pisar las flechas; ahora se
  // ve COMPLETO siempre, más chico si hace falta, en vez de truncado. Mismo
  // mecanismo que ya usa flagsFlagidLabel (flags.js) para nombres de país
  // largos en un cartel de ancho fijo.
  //
  // Medido con canvas.measureText() en vez de setear el style y leer
  // scrollWidth en cada paso del loop: esto último fuerza un reflow SÍNCRONO
  // del DOM por cada iteración (hasta ~15 por cambio de POV), y como se
  // llama en CADA switchPov() sin debounce, spamear las flechas bloqueaba el
  // hilo principal lo suficiente como para retrasar el heartbeat del
  // WebSocket de Supabase Realtime — el servidor terminaba cerrando la
  // conexión por eso (el "cambiando constantemente el POV... kickea al
  // espectador" reportado). Medir en un canvas es 100% en memoria, sin
  // tocar el árbol de layout — el DOM real solo se toca UNA vez, al final,
  // con el font-size ya calculado.
  let _measureCanvas = null;
  function _fitGroupPovName() {
    if (!miniNameEl || !_groupMode) return;
    const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
    const maxW = 24 * vminPx; // mismo valor que el max-width de .group-pov .spectator-mini-name
    const text = miniNameEl.textContent || '';
    if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
    const ctx = _measureCanvas.getContext('2d');
    const fontFamily = getComputedStyle(miniNameEl).fontFamily || 'sans-serif';
    let fs = 6.3; // tamaño base, ver .spectator-mini-name en CSS
    ctx.font = (fs * vminPx) + 'px ' + fontFamily;
    while (ctx.measureText(text).width > maxW && fs > 2.6) {
      fs -= 0.25;
      ctx.font = (fs * vminPx) + 'px ' + fontFamily;
    }
    miniNameEl.style.fontSize = fs + 'cqmin';
  }

  // Cartilla lateral con TODOS los miembros de la sala (no solo el POV
  // actual) — mismo pedido que "cómo funciona en los versus comúnmente"
  // (flagsSpectatorSetPlayerCard/etc, pero esas solo soportan 2 filas fijas
  // amigo/rival). Reusa las mismas clases CSS .lb-entry/.lb-rank/.lb-avatar/
  // .lb-name/.lb-score que ya están estilizadas (leaderboard real + tarjeta
  // 1v1), armando una fila por miembro a mano en vez de llamar a
  // *SpectatorSetPlayerCard (pensadas para exactamente 2 filas fijas).
  // Todo lo de acá adentro es DOM frágil (geometría, ids, listas que pueden
  // no estar como se espera) — envuelto en try/catch para que una excepción
  // acá NUNCA se propague hacia arriba: esto se llama desde dentro de
  // handlers de broadcast de Supabase Realtime (onRound/onScore/onPovChanged
  // en _wireGroupCallbacks) — una excepción sin atrapar ahí podía llegar a
  // romper el procesamiento de más eventos del canal (el "se rompe... y se
  // queda congelado" reportado, coincidiendo justo con los cambios de POV).
  function _renderGroupLeaderboard() {
    if (!_groupMode || !window.GroupSpectate) return;
    try { _renderGroupLeaderboardInner(); } catch (e) { console.warn('[spec] _renderGroupLeaderboard failed:', e); }
  }
  // Throttleado (150ms) — a diferencia de la tarjeta fija de 1v1 (2 filas,
  // solo actualiza texto/src de elementos que YA existen), acá se recorre
  // querySelectorAll, se crean/borran filas y se lee offsetWidth (fuerza
  // reflow) en CADA llamada — llamado sin freno desde onScore (dispara por
  // CADA respuesta de CUALQUIER miembro que siga jugando, varias veces por
  // segundo cerca del final si el que sigue jugando contesta rápido)
  // bloqueaba el hilo principal lo suficiente como para retrasar el
  // heartbeat del WebSocket y cortar la conexión — mismo mecanismo que el
  // bug de spamear las flechas de POV, pero disparado por la actividad de
  // OTRO jugador en vez de un click propio (el "se congela todo, 2s antes
  // de su propio times up" reportado — coincide con cuando el que sigue
  // jugando responde más seguido). onRound/onPregame/onPovChanged siguen
  // llamando a _renderGroupLeaderboard() directo (sin throttle): son mucho
  // menos frecuentes y ahí sí conviene que se vea al instante.
  let _renderLbThrottleTimer = null;
  let _renderLbThrottlePending = false;
  function _scheduleRenderGroupLeaderboard() {
    if (_renderLbThrottleTimer) { _renderLbThrottlePending = true; return; }
    _renderGroupLeaderboard();
    _renderLbThrottleTimer = setTimeout(() => {
      _renderLbThrottleTimer = null;
      if (_renderLbThrottlePending) { _renderLbThrottlePending = false; _renderGroupLeaderboard(); }
    }, 150);
  }
  function _renderGroupLeaderboardInner() {
    const isFlags = _mode === 'flags';
    const lb = document.getElementById(isFlags ? 'flags-leaderboard' : 'leaderboard');
    if (!lb) return;
    const rowH = isFlags
      ? (typeof getFlagsLbRowHeight === 'function' ? getFlagsLbRowHeight() : 84)
      : (typeof getLbRowHeight === 'function' ? getLbRowHeight() : 60);
    const gap = isFlags
      ? (typeof FLAGS_LB_GAP !== 'undefined' ? FLAGS_LB_GAP : 4)
      : (typeof LB_GAP !== 'undefined' ? LB_GAP : 4);
    // Mismo motivo que citiesSpectatorSetPlayerCard/etc: el leaderboard tiene
    // clip-path:inset(0 -300px) que recorta el emote-bubble si la fila de
    // arriba está en top:0.
    const TOP_MARGIN = Math.round(rowH * 0.4);
    const curId = window.GroupSpectate.getCurrentMember()?.id;
    const members = window.GroupSpectate.getMembers().slice()
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    lb.style.height = (members.length ? members.length * rowH + (members.length - 1) * gap + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';

    const keepIds = new Set();
    members.forEach((m, i) => {
      const rowId = 'group-spec-lb-' + m.id;
      keepIds.add(rowId);
      let el = document.getElementById(rowId);
      if (!el) {
        el = document.createElement('div');
        el.className = 'lb-entry';
        el.id = rowId;
        el.innerHTML = `<span class="lb-rank"></span>`
          + `<div class="lb-avatar"><img class="lb-avatar-img"></div>`
          + `<span class="lb-name"></span>`
          + `<span class="lb-score"></span>`;
      }
      // CRÍTICO: asegurar que la fila esté DENTRO del leaderboard del modo
      // ACTUAL. getElementById busca en TODO el documento — si una partida
      // anterior de OTRO modo (ej. banderas → #flags-leaderboard) dejó la fila
      // ahí, sin esto se actualizaba en el leaderboard VIEJO (oculto) y el del
      // modo nuevo quedaba vacío (el "en la 2ª partida con otros modos no sale
      // ningún amigo en el leaderboard" reportado). appendChild la MUEVE si
      // está en otro lado (o la agrega si es nueva).
      if (el.parentNode !== lb) lb.appendChild(el);
      el.style.top = (TOP_MARGIN + i * (rowH + gap)) + 'px';
      el.classList.toggle('lb-group-pov', m.id === curId);
      const rankEl = el.querySelector('.lb-rank');
      if (rankEl) {
        rankEl.textContent = String(i + 1);
        rankEl.className   = 'lb-rank ' + (i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : 'rank-other');
        rankEl.style.display = 'block';
      }
      const avatarImg = el.querySelector('.lb-avatar-img');
      if (avatarImg) avatarImg.src = m.avatar || 'images/profilepic/ppdefault.png';
      const nameEl = el.querySelector('.lb-name');
      if (nameEl) nameEl.textContent = m.name || '?';
      const scoreEl = el.querySelector('.lb-score');
      if (scoreEl) scoreEl.textContent = (m.score || 0).toLocaleString();
      // cardCode real de cada miembro (ver _fetchMembers más arriba) — sin
      // esto, cualquiera que espectara una sala grupal desde afuera veía la
      // carta default de todos, sin importar qué tuviera cada uno equipado.
      window.CustomizeAssets?.applyCard(el, m.cardCode || '0001');
    });
    // Miembros que ya no están en la sala (se fueron a mitad de partida).
    Array.from(lb.querySelectorAll('[id^="group-spec-lb-"]')).forEach(el => {
      if (!keepIds.has(el.id)) el.remove();
    });
  }

  // Flash de "falló" sobre la fila de QUIEN corresponda en la cartilla
  // lateral — mismo efecto que *SpectatorWrongEffect (flags/shapes/cities/
  // monuments), pero esas apuntan a ids fijos (ej. #flags-spec-lb-entry/
  // -opp) que no existen acá: la fila grupal usa un id por miembro (ver
  // _renderGroupLeaderboard). Se recibe el uid de quien falló (puede no ser
  // el POV actual — ver comentario largo en el listener 'wrong' de
  // GroupSpectate: el flash tiene que verse para CUALQUIER miembro de la
  // sala, no solo mientras lo estás mirando). Reusa las mismas clases/
  // animación CSS (lb-wrong-flash/lb-shake) y spawnEmoteBubble (monuments.js,
  // global).
  function _groupWrongEffect(uid) {
    if (!_groupMode || !uid) return;
    const el = document.getElementById('group-spec-lb-' + uid);
    if (!el) return;
    el.style.animation = 'none'; void el.offsetWidth;
    el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
    setTimeout(() => { el.style.animation = ''; }, 820);
    const prevZ = el.style.zIndex;
    el.style.zIndex = '50';
    setTimeout(() => { el.style.zIndex = prevZ; }, 1800);
    if (typeof spawnEmoteBubble === 'function') spawnEmoteBubble(el);
  }

  // "Se acabó el tiempo" sobre la cartilla del miembro que corresponda —
  // MISMO mecanismo que _groupWrongEffect (temblor + z-index alto), pero con
  // el cronómetro (window._applyTimesUpEffect) en vez del emote de "wrong".
  function _groupTimesUpEffect(uid) {
    if (!_groupMode || !uid) return;
    const el = document.getElementById('group-spec-lb-' + uid);
    if (!el) return;
    const prevZ = el.style.zIndex;
    el.style.zIndex = '50';
    setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
    if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
  }

  // Mirror de solo-lectura de las pantallas de ranking GRUPALES reales
  // (#lobby-intermediate-screen entre modos, #lobby-result-screen al
  // terminar la sala del todo) — ver LB.sendPostgame({kind:...}) agregado en
  // _presentIntermediateResult/_showLobbyResult (lobby.js). Antes esto no
  // existía: al transicionar de modo el espectador se quedaba sin nada en
  // pantalla durante toda la pantalla intermedia real (el "no sale nada"
  // reportado), porque _specReportPostgame nunca se llega a disparar para
  // partidas de lobby (flags.js/shapes.js/monuments.js cortan ANTES, ver
  // window._lobbyActive en hideFlagsMode/etc, y van directo a
  // _lobbyHandleGameEnd en vez del postgame individual).
  function _showGroupResultMirror(payload) {
    const isFinal  = payload.kind === 'final';
    const members  = payload.members || [];
    // Ocultar el countdown/timer de la ronda + marcador del juego espectado —
    // para AMBOS paneles. Antes solo se hacía en el final, así que en el
    // intermedio el countdown del juego quedaba encima del panel (reportado).
    // Acá NO se toca el mini-HUD/flechas del espectador (solo se muestran una
    // vez al inicio, ver openSpectatorGroup — si se ocultaran no volverían en
    // el modo siguiente); el final sí las oculta aparte (sesión terminando).
    _hideGameRoundHud();
    // Mismo sonido que escuchan los jugadores reales en este mismo panel
    // (ver _presentIntermediateResult/_showLobbyResult en lobby.js) — acá no
    // sonaba nada.
    try { if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame); } catch (e) {}
    const medals   = ['🥇', '🥈', '🥉'];
    const rowsHtml = (m, i) => `<span class="lobby-result-pos">${medals[i] || (i + 1)}</span>`
      + `<img class="lobby-result-avatar" src="${m.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false">`
      + `<span class="lobby-result-name">${m.name || '?'}</span>`
      + `<span class="lobby-result-score">${(m.score || 0).toLocaleString()}</span>`;
    if (isFinal) {
      const screen = document.getElementById('lobby-result-screen');
      const list   = document.getElementById('lobby-result-list');
      const title  = document.getElementById('lobby-result-title');
      if (!screen || !list) return;
      const winner = members[0];
      if (title) {
        // A diferencia del jugador real (que ve GANASTE/Quedaste #N según SU
        // propio puesto), acá no hay "yo" — mismo criterio neutral que
        // vsSpectatorShowResult (1v1): mostrar quién ganó, sin más.
        title.textContent = winner
          ? ((typeof t === 'function') ? t('vs.result.spectatorWins', { name: winner.name }) : ('¡GANA ' + winner.name + '!'))
          : '';
        title.className = 'vs-result-title win';
      }
      list.innerHTML = '';
      members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'lobby-result-row';
        row.innerHTML = rowsHtml(m, i);
        list.appendChild(row);
      });
      // #lobby-result-back SÍ queda clickeable acá (a diferencia de la
      // pantalla intermedia, que no tiene botón propio) — su handler en
      // lobby.js chequea window._isSpectating y cierra el espectador en vez
      // de disparar _returnFromLobbyResult() (reset de sala real), mismo
      // patrón que #vs-result-back en el 1v1.
      screen.style.display = 'flex';
      // Ocultar el HUD del juego espectado (timer/countdown, marcador,
      // mini-HUD del espectador) + refrescar el power/back — el espectador
      // externo (mirror) nunca desmonta la UI de juego, solo superpone este
      // panel encima, así que sin esto el countdown y el back que reemplaza
      // al power quedaban visibles ENCIMA de la tabla de resultados final
      // (reportado). refreshIngamePower ya oculta el back cuando
      // lobby-result-screen está visible, pero hay que LLAMARLO.
      _hideSpectatorHudForResult();
    } else {
      const screen   = document.getElementById('lobby-intermediate-screen');
      const list     = document.getElementById('lobby-intermediate-list');
      const modeTag  = document.getElementById('lobby-intermediate-mode-tag');
      const nextEl   = document.getElementById('lobby-intermediate-next');
      const nextIcon = document.getElementById('lobby-intermediate-next-icon');
      const nextName = document.getElementById('lobby-intermediate-next-name');
      if (!screen || !list) return;
      if (modeTag) modeTag.textContent = (payload.modeLabel || '') + '  ·  ' + ((payload.currentModeIdx || 0) + 1) + '/' + (payload.totalModes || 1);
      if (payload.nextModeName) {
        if (nextEl) nextEl.style.display = 'flex';
        if (nextIcon) nextIcon.src = payload.nextModeIcon || 'images/game1.png';
        if (nextName) nextName.textContent = payload.nextModeName;
      } else if (nextEl) {
        nextEl.style.display = 'none';
      }
      list.innerHTML = '';
      members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'lobby-result-row';
        row.innerHTML = rowsHtml(m, i);
        list.appendChild(row);
      });
      // El espectador no corre el timer real de lobby.js (ese vive en el
      // cliente jugador) — antes el número quedaba CONGELADO en 10 y la barra
      // llena todo el tiempo (reportado). Correr una cuenta regresiva
      // DECORATIVA de 10s acá (mismo INTER_MS que _presentIntermediateResult)
      // para que se vea igual que a los jugadores; se cierra igual cuando
      // llega el pregame/round del siguiente modo (ver _hideGroupResultMirror).
      _startMirrorInterCountdown();
      screen.style.pointerEvents = 'none';
      screen.style.display = 'flex';
    }
  }
  let _mirrorInterTimer = null;
  function _startMirrorInterCountdown() {
    clearInterval(_mirrorInterTimer);
    const bar  = document.getElementById('lobby-intermediate-bar');
    const cdEl = document.getElementById('lobby-intermediate-cd');
    const INTER_MS = 10000; // igual que _presentIntermediateResult en lobby.js
    const start = Date.now();
    if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; }
    if (cdEl) cdEl.textContent = '10';
    requestAnimationFrame(() => { if (bar) { bar.style.transition = 'width ' + INTER_MS + 'ms linear'; bar.style.width = '0%'; } });
    _mirrorInterTimer = setInterval(() => {
      const remain = Math.ceil((INTER_MS - (Date.now() - start)) / 1000);
      if (cdEl) cdEl.textContent = Math.max(0, remain);
      if (remain <= 0) { clearInterval(_mirrorInterTimer); _mirrorInterTimer = null; }
    }, 200);
  }
  function _hideGroupResultMirror() {
    clearInterval(_mirrorInterTimer); _mirrorInterTimer = null;
    const s1 = document.getElementById('lobby-result-screen');
    const s2 = document.getElementById('lobby-intermediate-screen');
    if (s1) s1.style.display = 'none';
    if (s2) s2.style.display = 'none';
  }
  // Oculta el HUD del juego espectado cuando aparece la tabla de resultados
  // FINAL — el timer/countdown de la ronda, el marcador y el mini-HUD del
  // espectador (nombre/POV/flechas) quedaban visibles encima del panel. El
  // back que reemplaza al power lo oculta refreshIngamePower (ya bloquea con
  // lobby-result-screen), pero hay que llamarlo.
  // Solo el HUD del JUEGO de la ronda (countdown/timer + marcador) — se usa
  // en AMBOS paneles (intermedio y final), ver _showGroupResultMirror. NO
  // toca el mini-HUD/flechas del espectador (esas solo se muestran una vez al
  // inicio; si se ocultaran no volverían en el modo siguiente).
  function _hideGameRoundHud() {
    ['countdown-widget','flags-countdown-widget','shapes-countdown-widget',
     'pregame-countdown','flags-pregame-countdown','score-display','flags-score-display']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  }
  // Final (sesión terminando): el HUD del juego + TAMBIÉN el mini-HUD/flechas
  // del espectador + el back que reemplaza al power (vía refreshIngamePower,
  // que ya bloquea con lobby-result-screen visible).
  function _hideSpectatorHudForResult() {
    _hideGameRoundHud();
    if (miniHud) miniHud.style.display = 'none';
    _hideGroupPovArrows();
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
  }

  function _wireGroupCallbacks() {
    // Se cayó el canal → NO mostrar "Reconectando..." al instante (molesta en
    // cada blip). Solo si el corte se PROLONGA (>2s); un reconnect rápido (lo
    // normal, ~300-600ms) queda invisible, con el último frame congelado.
    window.GroupSpectate.onReconnecting(() => {
      clearTimeout(_reconnectNoticeTimer);
      _reconnectNoticeTimer = setTimeout(() => {
        if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function' && t('spectator.reconnecting') !== 'spectator.reconnecting') ? t('spectator.reconnecting') : 'Reconectando...';
        _idleShown = true; // evita que el watchdog pise el texto con "en otra parte"
        _showLoading();
      }, 2000);
    });
    window.GroupSpectate.onReconnected(() => {
      clearTimeout(_reconnectNoticeTimer); _reconnectNoticeTimer = null;
      // No ocultar a ciegas — el primer dato real (onRound/onTick) lo hace,
      // así no se ve un flash de tablero viejo. Solo resetear el watchdog.
      _idleShown = false;
    });
    window.GroupSpectate.onMembers(() => {
      // Nombre/avatar puede haber cambiado (ej. username editado) o alguien
      // se fue de la sala — refrescar el mini-HUD con el POV actual.
      const cur = window.GroupSpectate.getCurrentMember();
      if (cur) _applyGroupPovMember(cur);
      _scheduleRenderGroupLeaderboard();
    });
    window.GroupSpectate.onScore(() => _scheduleRenderGroupLeaderboard());
    window.GroupSpectate.onWrong(uid => { if (_usingRealUI) _groupWrongEffect(uid); });
    window.GroupSpectate.onTimesUpAny(uid => { if (_usingRealUI) _groupTimesUpEffect(uid); });
    // La sala se vació (todos los jugadores se fueron/desconectaron) → sacar al
    // espectador con la pantalla de "sala abandonada", igual que al jugador se
    // lo kickea por quedarse solo. _showEndMessage cierra la sesión mostrando
    // el motivo. Guard _closing por si ya se está cerrando por otra vía.
    window.GroupSpectate.onRoomEmpty(() => {
      if (_closing) return;
      // _groupInstant = ES EL PROPIO JUGADOR espectando de prestado (no un
      // espectador externo): tiene su PROPIO flujo de fin (_presentFinalResult/
      // _exitGroupWaitAsSpectator en lobby.js) — no corresponde el kick de
      // "sala vacía" acá, lo maneja lobby.js.
      if (_groupInstant) return;
      _showEndMessage((typeof t === 'function') ? t('spectator.roomEmpty') : 'La sala se vació');
    });
    window.GroupSpectate.onRound(payload => {
      if (_closing) return;
      // Latido: cada ronda del miembro que sigo mirando de prestado le avisa
      // a lobby.js que ese jugador SIGUE VIVO, para reprogramar su salvavidas
      // de 12s hacia adelante — sin esto, el salvavidas (armado cuando YO
      // terminé) disparaba a los 12s aunque al que miro le quedara más
      // tiempo, mostrándome el resultado antes de tiempo (mismo bug que el
      // 1v1 ya resolvió con _armGameEndFallback + heartbeat, ver vs.js).
      if (typeof window._groupSpectatorHeartbeat === 'function') window._groupSpectatorHeartbeat();
      _hideSplashMirror();
      _hideGroupResultMirror();
      _mode = payload.mode || _mode;
      _enterRealUIIfPossible(_mode);
      _resetIdleWatchdog();
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading(true);
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      // *SpectatorEnter() (llamado adentro de _enterRealUIIfPossible si el
      // modo recién se montó) vacía el leaderboard con innerHTML='' — hay
      // que repoblarlo con todos los miembros después de eso, no antes.
      _renderGroupLeaderboard();
      // Mismo dedup que el 1v1/solo — ver _lastRoundKey ahí.
      const roundKey = payload.mode + '|' + payload.index + '|' + payload.prompt + '|' + payload.cityName + '|' + payload.correctSlot + '|' + JSON.stringify(payload.options || []);
      const isDuplicate = roundKey === _lastRoundKey;
      _lastRoundKey = roundKey;
      if (!isDuplicate && fns && typeof window[fns.showRound] === 'function') window[fns.showRound](payload);
      if (typeof payload.timeLeft === 'number' && fns && typeof window[fns.updateTimer] === 'function') window[fns.updateTimer](payload.timeLeft);
    });
    window.GroupSpectate.onAnswer(payload => {
      if (_closing) return;
      _resetIdleWatchdog();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.resolvePick] === 'function') window[fns.resolvePick](payload);
    });
    window.GroupSpectate.onTick(timeLeft => {
      if (_closing) return;
      // Latido — ver comentario largo en onRound. El tick es la señal más
      // frecuente de "el jugador que miro sigue vivo", así que es el que más
      // corre el salvavidas hacia adelante.
      if (typeof window._groupSpectatorHeartbeat === 'function') window._groupSpectatorHeartbeat();
      _resetIdleWatchdog();
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.updateTimer] === 'function') window[fns.updateTimer](timeLeft);
    });
    window.GroupSpectate.onTimesUp(() => {
      if (_closing || !_usingRealUI) return;
      // Frenar (sin rearmar) el watchdog de inactividad acá — después de un
      // TIMES UP no llega NINGÚN 'round'/'tick'/'answer' hasta el ranking de
      // sala (que ahora, con el reloj de pared compartido, puede demorar
      // bien más que los 3.5s del watchdog: el margen de sincronización
      // más, en el peor caso, el poll de respaldo de 3s). Sin este freno, el
      // watchdog disparaba solo (mismo aviso genérico que "el jugador
      // espectado no manda nada") tapando la pantalla con "está en otra
      // parte del juego" mientras se esperaba el resultado sincronizado — el
      // "identifica que está en otra sala" reportado.
      _clearIdleWatchdog();
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.showTimesUp] === 'function') window[fns.showTimesUp]();
    });
    window.GroupSpectate.onPregame(payload => {
      if (_closing) return;
      _hideSplashMirror();
      _hideGroupResultMirror();
      _mode = (payload && payload.mode) || _mode;
      _enterRealUIIfPossible(_mode);
      _clearIdleWatchdog();
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading(true);
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      _renderGroupLeaderboard();
      const pregameKey = payload && payload.startedAt;
      const isDuplicatePregame = pregameKey != null && pregameKey === _lastPregameKey;
      _lastPregameKey = pregameKey != null ? pregameKey : _lastPregameKey;
      if (!isDuplicatePregame) {
        if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        if (fns && typeof window[fns.showPregame] === 'function') window[fns.showPregame](payload);
      }
    });
    window.GroupSpectate.onPostgame(payload => {
      if (_closing || !payload) return;
      _hideSplashMirror();
      _clearIdleWatchdog();
      _hideLoading(true);
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      // kind:'intermediate'/'final' → ranking GRUPAL real (ver
      // _showGroupResultMirror), NO el postgame individual de un modo — el
      // flujo de lobby (_lobbyHandleGameEnd en lobby.js) nunca llega a
      // disparar ESE otro camino para partidas de sala.
      if (payload.kind === 'intermediate' || payload.kind === 'final') {
        // _groupInstant: EL PROPIO JUGADOR mirando de prestado a sus
        // compañeros (no un espectador externo real) — mientras dura eso,
        // su LB (lobby.js) tiene el canal SUELTO (ver releaseChannel en
        // _enterGroupWaitAsSpectator), así que NUNCA se entera por su cuenta
        // de que todos terminaron (el 'finished' que dispararía
        // _checkAllFinished no le llega a un canal desconectado) — dependía
        // SOLO del salvavidas de 30s (_waitingTimeout en lobby.js) para
        // mostrar su resultado real, mientras tanto se quedaba viendo este
        // mismo mirror NEUTRAL ("GANA fulano") — el "reciben GANA USUARIO
        // como espectadores, su resultado real tarda 10-15s más" reportado.
        // En vez de mostrar el mirror acá, avisarle a lobby.js para que
        // muestre YA su propio resultado personalizado (GANASTE/Quedaste
        // #2), usando los scores que ya vienen en el payload.
        if (_groupInstant) {
          if (typeof window._lobbyReceiveGroupResult === 'function') window._lobbyReceiveGroupResult(payload);
          return;
        }
        // window._vsShowingResult=true → EL PROPIO JUGADOR que espectó de
        // prestado ya está mostrando SU resultado personalizado (GANASTE/
        // Quedaste #N, vía _presentFinalResult/_showLobbyResult en lobby.js).
        // Su closeSpectator (llamado sincrónicamente ANTES de mostrar la
        // tabla, ver _exitGroupWaitAsSpectator) ya reseteó _groupInstant a
        // false — así que este mismo postgame, que sigue llegando por el
        // canal un instante más, caía acá y tapaba su resultado real con el
        // mirror NEUTRAL "GANA fulano" (reportado). El espectador EXTERNO real
        // sí tiene _vsShowingResult=false y ve el mirror normalmente.
        if (window._vsShowingResult) return;
        _showGroupResultMirror(payload);
        return;
      }
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.showPostgame] === 'function') window[fns.showPostgame](payload);
    });
    window.GroupSpectate.onAdvancing(() => {
      if (_closing) return;
      _clearIdleWatchdog();
      if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _hideSplashMirror();
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      }
      _showLoading();
    });
    window.GroupSpectate.onSplash(payload => {
      if (_closing) return;
      _clearIdleWatchdog();
      if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _exitRealUI(true);
      _mode = (payload && payload.mode) || _mode;
      miniNameEl.textContent = _friendName || 'Jugador';
      if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
      window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
      miniHud.style.display = 'flex';
      _showSplashMirror(payload && payload.mode, payload && payload.step);
      if (typeof playMusic === 'function' && typeof sfxPregame !== 'undefined') playMusic(sfxPregame);
    });
    window.GroupSpectate.onSpectatorCount(n => {
      _lastSpectatorN = n;
      _applySpectatorBadge();
    });
    // Las flechas cambiaron de POV — mismo criterio que abrir una sesión
    // nueva sobre el MISMO miembro: limpiar el dedup de ronda/pregame y
    // mostrar la transición de carga hasta que llegue el próximo evento real
    // de ESE miembro (no hay, por ahora, un "último estado conocido"
    // persistido por miembro como sí tiene VS/SoloSpectate vía host_state/
    // guest_state — así que un cambio de POV puede tardar hasta ~1s, el
    // próximo tick, en mostrar contenido real).
    window.GroupSpectate.onPovChanged(() => {
      const newMember = window.GroupSpectate.getCurrentMember();
      _applyGroupPovMember(newMember);
      // Throttleado — antes era _renderGroupLeaderboard() directo en CADA
      // cambio de POV; cambiando de POV rápido y sostenido durante un rato,
      // cada cambio forzaba un render completo del leaderboard (reflow), y el
      // hilo principal saturado retrasaba el heartbeat del WebSocket hasta
      // que el server cortaba la conexión (el "cambiando POVs me kickea en
      // cierto tiempo" reportado). Ver _scheduleRenderGroupLeaderboard.
      _scheduleRenderGroupLeaderboard();
      // El marcador GRANDE (arriba, no la fila de la cartilla lateral) es
      // aparte de _renderGroupLeaderboard — solo se actualiza vía
      // flagsSpectatorResolvePick cuando la persona mirada responde algo
      // (ganswer). Sin esto, cambiar de POV dejaba pegado el número de la
      // persona ANTERIOR hasta la PRÓXIMA respuesta de la nueva (el "no se
      // actualiza en tiempo real su puntaje al cambiar de POV" reportado) —
      // acá se salta directo al valor YA conocido (ver _scores en
      // GroupSpectate, alimentado por el mismo 'lbscore' de siempre).
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns && newMember && typeof window[fns.updateScore] === 'function') {
          // dots: el trencito de puntos (streak) — mismo motivo que el
          // score, cacheado en GroupSpectate vía el broadcast 'ganswer' de
          // CUALQUIER miembro (antes solo se prendía/apagaba cuando el POV
          // actual respondía algo).
          window[fns.updateScore](newMember.score || 0, window.GroupSpectate.getDots(newMember.id));
        }
      }
      _lastRoundKey = null;
      _lastPregameKey = null;
      // Cambiar de POV con las flechas NO es "conectar de nuevo" (el canal ya
      // está abierto, todos los miembros transmiten al mismo topic) — la
      // transición pesada tipo Clash Royale (_showLoading/_hideLoading, con
      // su mínimo de ~550ms + fade) se sentía como una carga completa cuando
      // en realidad solo hay que esperar el próximo tick/round de la persona
      // nueva. Se reemplaza acá por el mismo spinner chiquito y transparente
      // que usa vs.js mientras se espera al rival (#vs-wait-spinner) — la
      // pantalla del juego queda visible de fondo, sin ningún tapado negro,
      // y el spinner desaparece solo apenas llega el primer dato real (ver
      // _hideVsWaitSpinner en onRound/onPregame de más arriba).
      if (typeof window._showVsWaitSpinner === 'function') window._showVsWaitSpinner();
    });
  }

  // Expuestos para que cities/monuments (y cualquier otro módulo) puedan
  // chequear "¿estoy espectando un GRUPO ahora mismo?" y, si es así,
  // refrescar MI cartilla (no la de 1v1) — ver los call sites de
  // window._isSpectating + citiesSpectatorReposition() en monuments.js
  // (render loop de la animación de puntaje + resize/zoom). Antes esos dos
  // sitios llamaban SIEMPRE a la reposición de 1v1 (que en modo grupal no
  // hace nada, _citiesSpecLastCard nunca se llega a setear), así que la
  // cartilla de N filas nunca se volvía a posicionar cuando el puntaje subía
  // o al hacer zoom — quedaba con las posiciones viejas (el "se rompe la
  // posición de la tablilla de amigos" reportado).
  window._isGroupSpectating = () => _groupMode;
  // Throttleado — lo llama el render loop de monuments/cities (por frame
  // mientras el puntaje anima) y el resize; sin throttle saturaba el hilo y
  // cortaba el WebSocket (ver _scheduleRenderGroupLeaderboard).
  window._refreshGroupSpectatorLeaderboard = () => { try { _scheduleRenderGroupLeaderboard(); } catch (e) {} };

  // lobbyId: fila de `lobbies`. initialMember: {id,name,avatar} — con cuál
  // miembro arrancar el POV (ej. el que tenía el ojo clickeado en el roster).
  // opts.instant (ver openSpectator 1v1, mismo motivo): EL PROPIO JUGADOR
  // que termina antes que el resto de la sala se mete acá de prestado (ver
  // _enterGroupWaitAsSpectator en lobby.js) — no hay conexión nueva que
  // esperar (ya estaba ahí jugando), así que se salta la pantalla de
  // "Cargando partida..." y se queda en lo último que se vio hasta que
  // llegue el primer dato real de un compañero. opts.preFinishedUids se pasa
  // tal cual a GroupSpectate.watch().
  window.openSpectatorGroup = function (lobbyId, initialMember, opts) {
    if (!window.GroupSpectate) return;
    const instant = !!(opts && opts.instant);
    _resetPanel(initialMember, (typeof t === 'function')
      ? (initialMember && initialMember.name ? t('spectator.watchingFriend', { name: initialMember.name }) : t('spectator.watchingMatch'))
      : (initialMember && initialMember.name ? ('Mirando a ' + initialMember.name) : 'Mirando partida'));
    _groupMode = true;
    _groupInstant = instant;
    window._isSpectating = true;
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    if (!instant) _showLoading();
    // instant: mismo círculo de espera que usa el 1v1 (#vs-wait-spinner, ver
    // _showVsWaitSpinner/_hideVsWaitSpinner en vs.js) en vez del cartel de
    // "Cargando partida..." de pantalla completa (se sentía como un
    // salto/reset acá también) — flags.js/shapes.js ya lo apagan solos,
    // incondicionalmente, en el mismo punto donde revelan la ronda real del
    // compañero, así que alcanza con prenderlo acá.
    else if (typeof window._showVsWaitSpinner === 'function') window._showVsWaitSpinner();
    _wireGroupCallbacks();
    window.GroupSpectate.watch(lobbyId, initialMember && initialMember.id, opts).then(() => {
      if (!window.GroupSpectate.getMembers().length) throw new Error('empty_lobby');
      _showGroupPovArrows();
      _applyGroupPovMember(window.GroupSpectate.getCurrentMember());
      _renderGroupLeaderboard();
    }).catch((e) => {
      console.warn('[spec] openSpectatorGroup watch failed', e);
      if (instant) return; // ver _enterGroupWaitAsSpectator: sin popup de error acá, no había "conexión" que mostrara haber fallado
      _hideLoading();
      screen.style.display = 'flex';
      statusEl.textContent = (typeof t === 'function') ? t('spectator.failedToOpen') : 'No se pudo abrir la partida.';
      setTimeout(closeSpectator, 1500);
    });
  };

  // Cooldown chico entre clicks de flecha — sin esto, spamear el botón
  // disparaba muchos switchPov()/channel.track() casi superpuestos en el
  // mismo instante; el reenvío de estado (_resendState) ya es instantáneo
  // (viene de caché local), así que esto NO es "esperar al servidor", es
  // frenar el spam en sí — que además coincidía con que el propio canal de
  // GroupSpectate se desconectara (el "spameas el cambiar de POV y te
  // desconecta" reportado). 200ms alcanza de sobra para el caso normal
  // (datos ya cacheados); si de casualidad no había nada cacheado para el
  // nuevo POV, el spinner chiquito ya wireado en onPovChanged se queda
  // puesto hasta el próximo dato real de todos modos.
  // Subido de 200 a 350ms: el spam de flechas "por aburrimiento" cambiaba de
  // POV hasta 5 veces/seg, y ese ritmo sostenido de re-suscripciones/presence
  // + broadcasts entrantes de todos los jugadores parece que el server de
  // Realtime lo corta (CLOSED). A 350ms el ritmo baja a ~2.8/seg — bastante
  // menos carga — y la reconexión automática cubre el caso extremo si igual
  // se cae. 350ms sigue sintiéndose responsivo para un click intencional.
  const GROUP_POV_COOLDOWN_MS = 350;
  let _groupPovCooldown = false;
  function _handleGroupPovClick(direction) {
    if (_groupPovCooldown) return;
    _groupPovCooldown = true;
    if (groupPovPrevEl) groupPovPrevEl.classList.add('disabled');
    if (groupPovNextEl) groupPovNextEl.classList.add('disabled');
    if (typeof sfxSelect !== 'undefined' && typeof sfxPlay === 'function') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
    window.GroupSpectate?.switchPov(direction);
    setTimeout(() => {
      _groupPovCooldown = false;
      if (groupPovPrevEl) groupPovPrevEl.classList.remove('disabled');
      if (groupPovNextEl) groupPovNextEl.classList.remove('disabled');
    }, GROUP_POV_COOLDOWN_MS);
  }
  groupPovPrevEl?.addEventListener('click', () => _handleGroupPovClick(-1));
  groupPovNextEl?.addEventListener('click', () => _handleGroupPovClick(1));

  // Cerrar desde el panel de fallback (modos sin pantalla real todavía). En
  // real UI (flags) el cierre va por el botón de back que reemplaza al power.
  closeBtn?.addEventListener('click', () => {
    if (typeof sfxSelect !== 'undefined' && typeof sfxPlay === 'function') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
    closeSpectator();
  });
})();
