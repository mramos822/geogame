// ── VERSUS MODE ───────────────────────────────────────────────────────────────
// Matchmaking, Realtime channel, y lógica de partida 1v1.
let _vsCurrentMode = 'flags';
function _startSeededRandom(seed, mode) {
  _vsCurrentMode = mode || 'flags';
  if (_vsCurrentMode === 'shapes') {
    if (typeof window.shapesSetSeed === 'function') window.shapesSetSeed(seed);
  } else if (_vsCurrentMode === 'cities') {
    window.citiesSetSeed?.(seed);
  } else if (_vsCurrentMode === 'monuments') {
    window.monumentsSetSeed?.(seed);
  } else {
    if (typeof window.flagsSetSeed === 'function') window.flagsSetSeed(seed);
  }
}
function _restoreRandom() {
  if (_vsCurrentMode === 'shapes') {
    if (typeof window.shapesClearSeed === 'function') window.shapesClearSeed();
  } else if (_vsCurrentMode === 'cities') {
    window.citiesClearSeed?.();
  } else if (_vsCurrentMode === 'monuments') {
    window.monumentsClearSeed?.();
  } else {
    if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
  }
}

window.VS = (() => {
  let _matchId   = null;
  let _role      = null; // 'host' | 'guest'
  let _channel   = null;
  let _match     = null;
  let _onInvite  = null; // cb(match) — notifica al guest de una invitación entrante
  let _onInviteCancel = null; // cb(match) — el host canceló/expiró el reto
  let _onStart   = null; // cb(match) — ambos jugadores arrancan
  let _onScore   = null; // cb(hostScore, guestScore)
  let _onEnd     = null; // cb(winnerId)
  let _onOppLeft = null; // cb() — el rival se desconectó/abandonó
  let _onWrong   = null; // cb() — el rival falló una pregunta
  let _onGameEnd = null; // cb({role, score}) — el rival terminó SU cronómetro (ver reportGameEnd)
  let _pollId    = null;
  let _started   = false; // evita que _onStart se dispare más de una vez
  let _oppGoneTimer = null; // gracia antes de declarar abandono por presencia
  const OPP_GRACE_MS = 6000;
  // El rival avisó (broadcast 'gameend', ver reportGameEnd) que terminó SU
  // cronómetro y va a soltar su canal para espectarme de prestado
  // (_enterWaitAsSpectator) — esa desconexión de su lado es ESPERADA, no un
  // abandono. Sin esta bandera, el handler de presence 'leave' de más abajo
  // no tiene forma de distinguir "el rival cerró la pestaña" de "el rival
  // cambió de canal para espectarme", y terminaba arrancando la cuenta
  // regresiva de abandono igual (el "aun reconoce como si abandonara"
  // reportado, viéndose desde el lado del que sigue jugando).
  let _oppFinishedGameEnd = false;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _myId() { return window._sbUserId || null; }

  async function _getMatch(id) {
    const { data, error } = await window.sb
      .from('matches').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  // Cuenta espectadores conectados (presence keys 'spectator-*') y expone el
  // total para el ícono de ojo + contador en el HUD del jugador espectado.
  function _updateSpectatorCount() {
    if (!_channel) return;
    try {
      const state = _channel.presenceState();
      const n = Object.keys(state).filter(k => k.indexOf('spectator-') === 0).length;
      window._vsSpectatorCount = n;
      if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(n);
    } catch (e) {}
  }

  // ── Canal Realtime ─────────────────────────────────────────────────────────

  function _subscribe(matchId) {
    if (_channel) _channel.unsubscribe();
    const uid = _myId();
    _channel = window.sb
      .channel('match-' + matchId, { config: { presence: { key: uid || 'anon' } } })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: 'id=eq.' + matchId,
      }, payload => {
        const m = payload.new;
        _match = m;
        if (m.status === 'active' && _onStart && !_started) { _started = true; _onStart(m); }
        if (m.status === 'finished' && _onEnd)  _onEnd(m.winner_id);
        // Abandono explícito del rival (escribió status=abandoned con winner=nosotros)
        if (m.status === 'abandoned' && _onOppLeft) { clearTimeout(_oppGoneTimer); _onOppLeft(); }
        if (m.status === 'active' && _onScore) _onScore(m.host_score, m.guest_score);
        // Guest rechazó / no está disponible → notificar al host
        if ((m.status === 'declined' || m.status === 'expired') && _role === 'host' && !_started) {
          _hideOutgoingPopup();
          const T2 = (k, d) => (typeof t === 'function' ? t(k) : d);
          if (typeof window.showVersusToast === 'function') {
            window.showVersusToast(m.status === 'declined'
              ? T2('vs.guestUnavailable', 'No está disponible ahora')
              : T2('vs.inviteExpired',    'El reto expiró sin respuesta'));
          }
          cleanup();
        }
      })
      // Score en tiempo real del rival: broadcast inmediato (no espera el WAL de postgres_changes)
      .on('broadcast', { event: 'score' }, ({ payload }) => {
        if (!payload || !_match) return;
        if (_role === 'host') _match.guest_score = payload.score || 0;
        else                  _match.host_score  = payload.score || 0;
        if (_onScore) _onScore(_match.host_score, _match.guest_score);
      })
      // El rival falló → señal visual en mi pantalla
      .on('broadcast', { event: 'wrong' }, () => { if (_onWrong) _onWrong(); })
      // El rival terminó SU cronómetro (ver reportGameEnd/_vsHandleGameEnd) —
      // el bonus de "+5s" por dots corre de forma independiente en cada
      // jugador, así que los dos relojes pueden desincronizarse: uno puede
      // terminar antes que el otro. Sin esta señal, el primero en terminar
      // mostraba resultado YA (con el rival todavía jugando sus segundos de
      // bonus) — o peor, marcaba la partida 'finished' en la base y le
      // cortaba esos segundos al rival de golpe (el "5 segundos más, pero
      // termina en post" reportado). Ahora cada lado espera a que AMBOS
      // hayan avisado que terminaron antes de mostrar el resultado.
      .on('broadcast', { event: 'gameend' }, ({ payload }) => {
        if (!payload) return;
        _oppFinishedGameEnd = true;
        if (_onGameEnd) _onGameEnd(payload);
      })
      // Selección exacta del rival (índice/opción elegida) — consumido por el
      // modo espectador para recrear el click en tiempo real; no afecta al juego.
      .on('broadcast', { event: 'answer' }, ({ payload }) => {
        if (window._onVsAnswer && payload) window._onVsAnswer(payload);
      })
      // Presencia: detecta cierre de pestaña / pérdida de conexión del rival.
      .on('presence', { event: 'leave' }, ({ key }) => {
        // Un espectador que se desconecta (key 'spectator-{uid}', ver
        // Spectate.watch()) comparte este MISMO canal — sin este filtro,
        // cualquier espectador que cerrara su sesión disparaba este mismo
        // "leave" acá, y este código lo trataba como si el RIVAL real se
        // hubiera ido: arrancaba la cuenta regresiva de OPP_GRACE_MS y
        // terminaba declarando abandono/victoria falsa, cortando una
        // partida que en realidad seguía en curso entre los dos jugadores
        // reales (el "el espectador salió y termina el juego" reportado).
        if (!key || key === uid || key.indexOf('spectator-') === 0) return;
        // Ver _oppFinishedGameEnd arriba: si el rival ya avisó que terminó su
        // cronómetro, esta desconexión es él soltando su canal para
        // espectarme de prestado — no un abandono real. Nada que declarar acá.
        if (_oppFinishedGameEnd) return;
        clearTimeout(_oppGoneTimer);
        // Gris permanente: mostrar desconexión visual inmediatamente
        if (typeof window.flagsSetVsDisconnected === 'function') window.flagsSetVsDisconnected(true);
        if (typeof window.shapesSetVsDisconnected === 'function') window.shapesSetVsDisconnected(true);
        if (typeof window.citiesSetVsDisconnected === 'function') window.citiesSetVsDisconnected(true);
        _oppGoneTimer = setTimeout(() => { if (_onOppLeft) _onOppLeft(); }, OPP_GRACE_MS);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (!key) return;
        if (key.indexOf('spectator-') === 0) {
          // Pequeño delay: recién se unió, dar tiempo a que sus propios
          // listeners de broadcast terminen de registrarse antes de reenviar.
          // Antes eran 150ms — sus listeners (_wireCommonCallbacks) ya
          // quedan registrados ANTES de siquiera intentar la conexión, así
          // que ese margen era más de lo necesario; se achica para que
          // _enterWaitAsSpectator (vs.js) no sienta esta demora sumada a las
          // demás (soltar canal + reconectar) como "tarda la vida" en
          // mostrar al rival.
          setTimeout(_resendStateTo, 40);
          return;
        }
        if (key !== uid) clearTimeout(_oppGoneTimer); // rival volvió a tiempo; gris queda permanente
      })
      // Contador de espectadores: 'sync' (no join/leave) porque es el único
      // evento que garantiza que presenceState() ya está consistente — leerlo
      // dentro del handler de 'leave' a veces todavía traía al que se fue
      // (race de timing), por eso el contador no bajaba al salir alguien.
      .on('presence', { event: 'sync' }, () => { _updateSpectatorCount(); })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await _channel.track({ uid: uid, t: Date.now() }); } catch (e) {}
          // Catch-up: si el rival aceptó mientras la suscripción se confirmaba,
          // el evento realtime ya pasó; verificamos el estado actual en DB.
          if (_matchId && _onStart && !_started) {
            try {
              const m = await _getMatch(_matchId);
              if (m && m.status === 'active') { _match = m; _started = true; _onStart(m); }
            } catch (e) {}
          }
        }
      });
  }

  // ── Escuchar invitaciones entrantes (guest) ────────────────────────────────
  // Suscribe al usuario a cambios de matches donde es guest y status=pending.

  let _inviteChannel = null;

  function listenForInvites(onInvite, onInviteCancel) {
    _onInvite = onInvite;
    _onInviteCancel = onInviteCancel || null;
    const uid = _myId();
    if (!uid) return;
    if (_inviteChannel) _inviteChannel.unsubscribe();
    _inviteChannel = window.sb
      .channel('invites-' + uid)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'matches',
        filter: 'guest_id=eq.' + uid,
      }, payload => {
        const m = payload.new;
        if (m.status === 'pending' && _onInvite) _onInvite(m);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: 'guest_id=eq.' + uid,
      }, payload => {
        const m = payload.new;
        // El host canceló/expiró el reto antes de que yo respondiera → descartar la noti
        if ((m.status === 'expired' || m.status === 'declined' || m.status === 'cancelled') && _onInviteCancel) _onInviteCancel(m);
      })
      .subscribe();
  }

  function stopListeningForInvites() {
    if (_inviteChannel) { _inviteChannel.unsubscribe(); _inviteChannel = null; }
  }

  // ── Crear invitación (host) ────────────────────────────────────────────────

  async function invite(guestId, mode = 'flags') {
    const uid = _myId();
    if (!uid) throw new Error('not logged in');
    const seed = Math.floor(Math.random() * 1_000_000);
    const { data, error } = await window.sb
      .from('matches')
      .insert({ host_id: uid, guest_id: guestId, seed, mode, status: 'pending' })
      .select().single();
    if (error) throw error;
    _matchId = data.id;
    _role    = 'host';
    _match   = data;
    _subscribe(_matchId);
    if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('sent', mode);
    // Auto-expirar si el guest no responde en 30s
    setTimeout(() => expire(), 30000);
    return data;
  }

  // ── Aceptar invitación (guest) ─────────────────────────────────────────────

  // START_DELAY_MS: margen entre "el guest aceptó" y "arrancan los dos" —
  // suficiente para que la notificación realtime le llegue al HOST con
  // tiempo de sobra sin importar la latencia de red. Antes cada cliente
  // arrancaba apenas SU PROPIO lado se enteraba: el guest, apenas terminaba
  // su propio accept() (~instantáneo, es su propia escritura); el host,
  // recién cuando la notificación de esa escritura le llegaba por Realtime
  // (WAL + broadcast, con latencia real de red de por medio) — el guest
  // siempre arrancaba antes, de milisegundos a veces hasta un segundo entero
  // (el "es injusto" reportado). Ahora ambos esperan al MISMO started_at
  // (reloj de pared, no "cuando me enteré yo") antes de arrancar de verdad.
  const START_DELAY_MS = 1500;

  async function accept(matchId) {
    try {
      _matchId = matchId;
      _role    = 'guest';
      _match   = await _getMatch(matchId);
      if (!_match || _match.status !== 'pending') throw new Error('match_not_available');
      _subscribe(matchId);
      const startedAt = new Date(Date.now() + START_DELAY_MS).toISOString();
      // Solo actualiza si todavía está pending; expirado/cancelado devuelve 0 filas
      const { data: updated, error } = await window.sb
        .from('matches').update({ status: 'active', started_at: startedAt }).eq('id', matchId).eq('status', 'pending').select();
      if (error) throw error;
      if (!updated || !updated.length) throw new Error('match_not_available');
      _match = updated[0];
      if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('accepted', _match.mode);
    } catch (e) {
      if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('accept_failed');
      cleanup(); // limpiar estado sucio si falló a mitad
      throw e;
    }
  }

  // ── Rechazar invitación (guest) ────────────────────────────────────────────

  async function decline(matchId) {
    await window.sb.from('matches')
      .update({ status: 'declined' }).eq('id', matchId || _matchId);
    if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('declined');
    cleanup();
  }

  // ── Expirar (host, sin respuesta) ─────────────────────────────────────────

  async function expire() {
    if (!_matchId) return;
    const current = await _getMatch(_matchId);
    if (current.status === 'pending') {
      await window.sb.from('matches')
        .update({ status: 'expired' }).eq('id', _matchId);
      if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('expired', current.mode);
      cleanup();
    }
  }

  // ── Cancelar el reto (host, con el botón back del popup de "esperando") ─────
  // Marca el match como expirado para que al guest se le descarte la notificación.
  async function cancelInvite() {
    const id = _matchId;
    cleanup();
    if (id) { try { await window.sb.from('matches').update({ status: 'expired' }).eq('id', id); } catch (e) {} }
  }

  // ── Reportar score (ambos) ─────────────────────────────────────────────────
  // `detail` (opcional) es la selección exacta de esta ronda —
  // { index, pick, correct } — usada solo por el modo espectador para recrear
  // el click en tiempo real. No afecta el scoring ni requiere que el llamador
  // lo pase (flags/shapes/monuments siguen funcionando igual si se omite).

  async function reportScore(score, detail) {
    if (!_matchId || !_role) return;
    const scoreField = _role === 'host' ? 'host_score' : 'guest_score';
    const stateField = _role === 'host' ? 'host_state'  : 'guest_state';
    // Broadcast inmediato para que el rival (y espectadores) vean el score sin
    // esperar el WAL de postgres_changes. Faltaba 'role' acá — el handler del
    // espectador (Spectate.watch()) decide a qué campo (host_score/
    // guest_score) aplicar este score revisando payload.role; sin él, NINGUNA
    // rama coincidía nunca y el broadcast rápido quedaba mudo (el puntaje
    // solo terminaba actualizándose cuando llegaba el postgres_changes más
    // lento, o directamente no se notaba el cambio en la sesión).
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'score', payload: { role: _role, score } }); } catch (e) {} }
    const update = { [scoreField]: score };
    if (detail) {
      update[stateField] = { ...detail, ts: Date.now() };
      if (_channel) { try { _channel.send({ type: 'broadcast', event: 'answer', payload: { role: _role, ...detail } }); } catch (e) {} }
    }
    await window.sb.from('matches').update(update).eq('id', _matchId);
  }

  function sendWrong() {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'wrong', payload: { role: _role } }); } catch (e) {} }
  }

  // Libera el canal de Realtime de ESTE jugador (sin tocar _matchId/_role —
  // reportScore/reportGameEnd/finish siguen escribiendo bien en la base,
  // solo el .send() de broadcast queda mudo, ver los try/catch de arriba) —
  // usado por _enterWaitAsSpectator (vs.js, "VERSUS UI") cuando el jugador
  // termina antes que el rival y quiere mirarlo en tiempo real de prestado
  // vía openSpectator: Supabase Realtime no deja tener DOS canales
  // suscriptos al mismo tema 'match-{id}' desde el mismo cliente (tirar
  // "cannot add postgres_changes callbacks... after subscribe()" si se
  // intenta) — hay que soltar este canal para que el de Spectate.watch()
  // pueda tomar ese mismo tema.
  // async + esperando el unsubscribe de verdad: antes esto era "fire and
  // forget" (no esperaba nada), así que Spectate.watch() podía intentar
  // suscribirse al MISMO tema 'match-{id}' ANTES de que el servidor de
  // Realtime terminara de procesar la salida de este canal — la carrera
  // dependía de timing de red, así que a veces funcionaba (como en las
  // pruebas) y a veces no (en juego real, con menos demora incidental de por
  // medio) — cuando fallaba, Spectate.watch() tiraba el mismo error de
  // "cannot add postgres_changes callbacks... after subscribe()" que ya se
  // había diagnosticado, openSpectator(..., {instant:true}) lo tragaba en
  // silencio sin re-suscribir nada, y el jugador quedaba sin ver a su rival
  // — atascado hasta el salvavidas de 12s, que entonces mostraba resultado
  // con datos incompletos y lo mandaba derecho a la pantalla de resultado en
  // vez de dejarlo viendo al rival (el "lo kickea al menu de frente"
  // reportado).
  async function releaseChannel() {
    if (_channel) {
      const ch = _channel;
      _channel = null;
      try { await ch.unsubscribe(); } catch (e) {}
    }
  }

  // Avisa que MI cronómetro llegó a 0 — ver comentario largo en el .on(
  // 'broadcast', {event:'gameend'}...) de más arriba. También lo persiste en
  // host_state/guest_state (igual mecanismo que reportScore con `detail`)
  // para que alguien que llegue tarde (reconexión) pueda leerlo desde la fila
  // en vez de depender solo del broadcast efímero.
  // revealAt (opcional): reloj de pared en el que TODOS (ambos jugadores y
  // cualquier espectador) deben mostrar el resultado — ver comentario largo
  // en _tryShowVsResultWhenBothDone (vs.js, "VERSUS UI"). Solo lo manda
  // quien YA SABE que ambos terminaron al momento de llamar esta función
  // (el segundo en terminar, que se entera de que el primero ya había
  // avisado apenas llama a esto) — el otro lado lo recibe acá mismo, en el
  // mismo broadcast que le confirma que el rival terminó.
  function reportGameEnd(score, revealAt) {
    if (!_matchId || !_role) return;
    const payload = { role: _role, score };
    if (revealAt) payload.revealAt = revealAt;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'gameend', payload }); } catch (e) {} }
    const stateField = _role === 'host' ? 'host_state' : 'guest_state';
    window.sb.from('matches').update({ [stateField]: { finished: true, score, ts: Date.now() } }).eq('id', _matchId).then(() => {}, () => {});
  }

  // ── Anunciar el inicio de una ronda (solo para el modo espectador) ─────────
  // No persiste en DB (es efímero, como 'score'/'wrong') — el espectador lo usa
  // para mostrar las mismas opciones antes de que el jugador responda.
  // Se cachea la última ronda/tick transmitidos: si un espectador entra a
  // mitad de ronda (el jugador ya está pensando, no clickeó nada todavía) no
  // hay ningún evento 'round' nuevo en camino — sin este cache se quedaría
  // pegado en la pantalla de carga hasta la SIGUIENTE ronda. Al detectar un
  // 'join' de espectador se reenvía el último round conocido.
  // _lastPhase es cuál de los tres estados mutuamente excluyentes está
  // vigente ahora mismo (ronda en curso / cuenta 3-2-1 / resultados) — un
  // espectador que se une tarde necesita saber CUÁL de los tres reenviar, no
  // solo la última ronda: si se une mientras el jugador está mirando su
  // pantalla de resultados (que puede durar varios segundos), antes se
  // quedaba sin nada hasta la ronda SIGUIENTE en vez de ver los resultados
  // actuales de una.
  let _lastPhase         = null; // 'round' | 'pregame' | 'postgame'
  let _lastRoundPayload  = null;
  let _lastTick          = null;
  let _lastPregamePayload  = null;
  let _lastPostgamePayload = null;

  // Guarda una FOTO completa del estado en curso (fase + round + pregame +
  // postgame) en host_state/guest_state — antes esto vivía SOLO en la
  // memoria de ESTE cliente, y quien quisiera verlo (un espectador nuevo)
  // tenía que esperar un "join" de presence + un resend en vivo del rival
  // (con latencia de red real de por medio, sumada a la de soltar/reconectar
  // el propio canal en _enterWaitAsSpectator) — ahora cualquiera que
  // consulte la fila de la partida (una sola llamada REST, sin esperar nada
  // en tiempo real) puede reconstruir el estado actual de una. Pensado
  // también para el futuro carrusel de POVs en versus grupal: cambiar de
  // jugador ahí va a necesitar exactamente este mismo mecanismo.
  function _persistLiveState() {
    if (!_matchId || !_role) return;
    const stateField = _role === 'host' ? 'host_state' : 'guest_state';
    const snapshot = {
      phase: _lastPhase,
      round: _lastRoundPayload,
      pregame: _lastPregamePayload,
      postgame: _lastPostgamePayload,
      ts: Date.now(),
    };
    window.sb.from('matches').update({ [stateField]: snapshot }).eq('id', _matchId).then(() => {}, () => {});
  }

  function reportRound(payload) {
    if (!_channel || !_role) return;
    _lastPhase = 'round';
    _lastRoundPayload = payload;
    try { _channel.send({ type: 'broadcast', event: 'round', payload: { role: _role, ...payload } }); } catch (e) {}
    _persistLiveState();
  }

  // Tiempo restante (1x/seg) — solo para que el modo espectador muestre el
  // mismo contador que ve el jugador; no se persiste, es efímero como 'score'.
  function reportTick(timeLeft) {
    if (!_channel || !_role) return;
    _lastTick = timeLeft;
    try { _channel.send({ type: 'broadcast', event: 'tick', payload: { role: _role, timeLeft } }); } catch (e) {}
  }

  // Reenvía SOLO la fase vigente a quien se acaba de unir como espectador (no
  // al rival, que ya está sincronizado por su propio juego).
  function _resendStateTo() {
    // El 'round' es lo único que trae `mode` — onPregame/onRound del lado
    // espectador usan `_mode` para decidir qué UI real montar (banderas vs
    // siluetas), y esa variable arranca en 'flags' por default hasta que
    // llega un round de verdad. Si alguien se une justo durante el 3-2-1 (o
    // mirando resultados) y acá se reenviaba SOLO pregame/postgame sin el
    // round de esa misma pregunta, `_mode` se quedaba mal (en 'flags') hasta
    // que llegaba el round REAL varios segundos después — el jugador veía
    // texturas de banderas durante todo el 3-2-1 de siluetas. _lastRoundPayload
    // siempre corresponde a la MISMA pregunta que el pregame/postgame vigente
    // (se cachea justo antes, en el mismo broadcast real), así que reenviarlo
    // primero es seguro.
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
  }

  // Se acabó el tiempo de esta ronda de juego (no la partida versus completa)
  // — el espectador muestra el mismo cartel "TIME'S UP" con su sonido.
  function reportTimesUp() {
    if (!_channel || !_role) return;
    try { _channel.send({ type: 'broadcast', event: 'timesup', payload: { role: _role } }); } catch (e) {}
  }

  // Cuenta 3-2-1 antes de que arranque la ronda — el espectador reproduce la
  // MISMA animación (runFlagsPregame) en su cliente; el payload solo trae la
  // duración total (para mostrar el número correcto desde el arranque, antes
  // de que llegue el primer 'tick').
  function reportPregame(payload) {
    if (!_channel || !_role) return;
    _lastPhase = 'pregame';
    _lastPregamePayload = payload || {};
    try { _channel.send({ type: 'broadcast', event: 'pregame', payload: { role: _role, ...(payload || {}) } }); } catch (e) {}
    _persistLiveState();
  }

  // Pantalla de resultados — el W/L final del duelo, llamado desde
  // _showVsResult() en el momento en que cada cliente decide su outcome
  // localmente (ver ahí el detalle del payload host/guest).
  function reportPostgame(payload) {
    if (!_channel || !_role) return;
    _lastPhase = 'postgame';
    _lastPostgamePayload = payload;
    try { _channel.send({ type: 'broadcast', event: 'postgame', payload: { role: _role, ...payload } }); } catch (e) {}
    _persistLiveState();
  }

  // ── Terminar partida (host cierra, decide winner) ──────────────────────────

  async function finish() {
    if (!_matchId) return;
    const m = await _getMatch(_matchId);
    const winnerId = m.host_score >= m.guest_score ? m.host_id : m.guest_id;
    await window.sb.from('matches')
      .update({ status: 'finished', winner_id: winnerId }).eq('id', _matchId);
    if (window.Analytics && typeof window.Analytics.logVersus === 'function') {
      window.Analytics.logVersus(m.mode || null);
    }
  }

  // ── Abandonar (yo me voy → el rival gana) ──────────────────────────────────
  // best-effort: notifica al rival por DB; la presencia del canal lo cubre igual.
  async function abandon() {
    if (!_matchId || !_role) { cleanup(); return; }
    const winnerId = _role === 'host' ? (_match && _match.guest_id) : (_match && _match.host_id);
    try {
      await window.sb.from('matches')
        .update({ status: 'abandoned', winner_id: winnerId || null }).eq('id', _matchId);
      if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('abandoned', _match && _match.mode);
    } catch (e) {}
    cleanup();
  }

  // ── Limpiar estado ─────────────────────────────────────────────────────────

  function cleanup() {
    if (_channel) { _channel.unsubscribe(); _channel = null; }
    clearInterval(_pollId);
    clearTimeout(_oppGoneTimer);
    _oppFinishedGameEnd = false;
    _matchId = _role = _match = null;
    _onStart = _onScore = _onEnd = _onOppLeft = _onWrong = _onGameEnd = null;
    _started = false;
    _lastPhase = null;
    _lastRoundPayload = null;
    _lastTick = null;
    _lastPregamePayload = null;
    _lastPostgamePayload = null;
    _restoreRandom();
  }

  // ── API pública ────────────────────────────────────────────────────────────

  return {
    invite,
    accept,
    decline,
    finish,
    abandon,
    cancelInvite,
    reportScore,
    sendWrong,
    reportGameEnd,
    releaseChannel,
    reportRound,
    reportTick,
    reportTimesUp,
    reportPregame,
    reportPostgame,
    listenForInvites,
    stopListeningForInvites,
    cleanup,
    onStart:   cb => {
      _onStart = cb;
      // invite() llama a _subscribe() de forma NO bloqueante (no espera a que
      // el canal quede 'SUBSCRIBED') y recién DESPUÉS quien invitó registra
      // este callback — con latencia de red real (ej. rival en Chile
      // aceptando casi al instante), el 'SUBSCRIBED'/catch-up de _subscribe()
      // podía llegar y encontrar _onStart TODAVÍA null, perdiendo la única
      // notificación real de que el duelo arrancó — el host se quedaba sin
      // entrar nunca a la partida mientras al guest (que arranca por su
      // propio accept(), sin depender de Realtime) sí le funcionaba siempre
      // (reportado). Cierra la otra mitad de esa carrera: si para cuando
      // esto se registra el match YA está activo, disparar ya mismo.
      if (_match && _match.status === 'active' && !_started) { _started = true; cb(_match); }
    },
    onScore:   cb => { _onScore = cb; },
    onEnd:     cb => { _onEnd = cb; },
    onOppLeft: cb => { _onOppLeft = cb; },
    onWrong:   cb => { _onWrong = cb; },
    onGameEnd: cb => { _onGameEnd = cb; },
    getMatch: () => _match,
    getRole:  () => _role,
    getMatchId: () => _matchId,
    getSeed:  () => _match ? _match.seed : null,
    isHost:   () => _role === 'host',
  };
})();

// Ícono de ojo + contador en el HUD del jugador espectado — actualizado tanto
// por vs.js (partida versus) como por SoloSpectate (partida individual/Gira
// Mundial) cada vez que un espectador entra/sale.
window.refreshVsSpectatorBadge = function (n) {
  const isFlags = window.pendingGameMode === 'flags';
  const badge   = document.getElementById(isFlags ? 'flags-vs-spectator-badge' : 'vs-spectator-badge');
  const countEl = document.getElementById(isFlags ? 'flags-vs-spectator-count' : 'vs-spectator-count');
  // El OTRO badge (el del modo que ya no está activo) se apaga siempre,
  // explícito — la campaña cambia de modo (banderas→siluetas→ciudades) sin
  // que esta función necesariamente se vuelva a llamar en ese instante (solo
  // reacciona a cambios de presence), así que sin esto el badge del modo
  // VIEJO se quedaba pegado visible para siempre si alguna vez había llegado
  // a mostrarse — el jugador seguía viendo "te están espectando" después de
  // cambiar de modo, después de salir al menú (SoloSpectate.stop() llama acá
  // con n=0, pero solo apagaba el badge del modo ACTUAL), y al reconectar el
  // espectador se veían dos badges a la vez (uno de cada modo).
  const otherBadge = document.getElementById(isFlags ? 'vs-spectator-badge' : 'flags-vs-spectator-badge');
  if (otherBadge) otherBadge.style.display = 'none';
  if (!badge) return;
  const show = n > 0 && window._isPlaying;
  badge.style.display = show ? 'flex' : 'none';
  if (countEl) countEl.textContent = n;
};

// Pupila (eye2.png) del ícono de espectadores: cada tanto "mira" un poquito a
// la derecha (transform, 0.1s) y vuelve — timing aleatorio en cada ciclo para
// que no se sienta mecánico. Corre siempre en segundo plano (los badges están
// display:none la mayor parte del tiempo, así que no cuesta nada) — cada
// instancia (vs-spectator-badge/flags-vs-spectator-badge) tiene su propio
// loop independiente, no sincronizado entre sí.
(function spectatorEyeLook() {
  const pupils = document.querySelectorAll('.spectator-badge-eye-pupil');
  pupils.forEach(pupil => {
    const randMs = (min, max) => min + Math.random() * (max - min);
    function cycle() {
      setTimeout(() => {
        pupil.classList.add('looking-right');
        setTimeout(() => {
          pupil.classList.remove('looking-right');
          cycle();
        }, randMs(1500, 3000));
      }, randMs(1500, 3000));
    }
    cycle();
  });
})();

// Parpadeo del ícono de espectadores: aplasta el ojo entero (contenedor
// .spectator-badge-eye, eye1+eye2 juntos) por un instante y vuelve — ciclo
// propio, independiente y no sincronizado con spectatorEyeLook() de arriba
// (un ojo real no mira y parpadea al mismo ritmo).
(function spectatorEyeBlink() {
  const eyes = document.querySelectorAll('.spectator-badge-eye');
  eyes.forEach(eye => {
    const randMs = (min, max) => min + Math.random() * (max - min);
    function cycle() {
      setTimeout(() => {
        eye.classList.add('blinking');
        setTimeout(() => {
          eye.classList.remove('blinking');
          cycle();
        }, 110);
      }, randMs(2000, 5000));
    }
    cycle();
  });
})();

// ── VERSUS UI ─────────────────────────────────────────────────────────────────

(function() {
  const TIMEOUT_MS = 30000;
  let _resultShown = false;    // evita mostrar la pantalla de resultado dos veces
  let _endedByAbandon = false; // el match terminó por abandono del rival
  // Espera a que AMBOS jugadores terminen su propio cronómetro antes de
  // mostrar el resultado — ver comentario largo en _vsHandleGameEnd. El
  // bonus de "+5s" corre independiente en cada cliente, así que uno puede
  // terminar antes que el otro.
  let _myGameEnded = false, _oppGameEnded = false;
  let _myFinalScoreCache = null, _oppFinalScoreCache = null;
  let _gameEndFallbackTimer = null;
  let _waitingAsSpectator = false; // ver _enterWaitAsSpectator
  // Rearma el salvavidas de 12s — ver comentario largo en _vsHandleGameEnd.
  // Antes esto se armaba UNA sola vez, fijo, contado desde el instante en que
  // YO terminaba, sin importar cuánto le quedara de verdad al rival — si el
  // rival todavía tenía, por ejemplo, 15s de partida (rachas de bonus +5s
  // encadenadas alargan bastante una ronda), a los 12s este salvavidas
  // disparaba igual, mostrando MI resultado con el puntaje del rival a MITAD
  // de jugar, todavía activo — no perdido/trabado, como estaba pensado (el
  // "me kickea a mi resultado antes de tiempo, con el rival a 1-2s de
  // terminar" reportado). Cada señal REAL de que el rival sigue jugando
  // (tick/round que sí llegó, vía Spectate mientras _enterWaitAsSpectator lo
  // mira de prestado) reprograma este mismo timer 12s hacia adelante — así
  // solo se dispara si el rival de verdad se quedó en silencio ese tiempo
  // (glitch de red/desconexión), no simplemente porque le quedaba más tiempo
  // de juego que el salvavidas original.
  function _armGameEndFallback() {
    clearTimeout(_gameEndFallbackTimer);
    _gameEndFallbackTimer = setTimeout(() => _tryShowVsResultWhenBothDone(true), 12000);
  }
  // Reloj de pared compartido en el que se debe mostrar el resultado — ver
  // comentario largo en _tryShowVsResultWhenBothDone. Antes cada cliente
  // mostraba resultado apenas SE ENTERABA (localmente) de que ambos habían
  // terminado, y como esa noticia le llega a cada uno en un momento distinto
  // (el que termina segundo lo sabe al toque; el que terminó primero recién
  // cuando el broadcast del segundo le llega, con latencia de red de por
  // medio), las dos pantallas de resultado — y la del espectador — aparecían
  // en instantes distintos (el "la pantalla de perdí la recibió antes que el
  // otro" reportado).
  let _revealAt = null;
  let _revealTimer = null;
  const REVEAL_BUFFER_MS = 700;
  let _vsLaunching = false;    // evita doble lanzamiento de la partida versus
  let _vsStartScheduled = false; // ver _scheduleVersusStart — evita agendar el setTimeout de arranque dos veces
  let _outTimer = null;
  let _inTimer  = null;
  let _pendingOppName   = null; // nombre del oponente guardado para ambos lados
  let _pendingOppAvatar = null;
  let _pendingOppFrameCode = null; // marco real del oponente, ver _showDuelAcceptedPopup

  // ── Navegación de pantallas del panel ─────────────────────────────────────
  const T = (k, d) => (typeof t === 'function' ? t(k) : d);
  const VERSUS_SCREENS = ['root', 'amistoso', 'amigos', 'grupo', 'aleatorio', 'lobby'];
  const VERSUS_SUBTITLES = {
    root:      () => T('versus.subRoot', 'Elige un modo de versus'),
    amistoso:  () => T('versus.subFriendly', '¿Con quién querés jugar?'),
    amigos:    () => T('versus.subtitle', 'Reta a un amigo conectado'),
    grupo:     () => T('versus.subGroup', 'Sala privada de hasta 10 jugadores'),
    aleatorio: () => T('versus.subRandom', 'Únete a una sala pública'),
    lobby:     () => T('versus.subLobby', 'Sala de juego'),
  };
  // Pila de navegación para el botón "back"
  let _versusStack = ['root'];

  // Refresh subtitle when language changes (textContent is set via JS, not data-i18n)
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      const cur = _versusStack[_versusStack.length - 1];
      if (!cur) return;
      const sub = document.getElementById('versus-subtitle');
      if (sub) sub.textContent = (VERSUS_SUBTITLES[cur] || (() => ''))();
    });
  }

  function _showScreen(name) {
    VERSUS_SCREENS.forEach(s => {
      const el = document.getElementById('versus-screen-' + s);
      if (el) el.style.display = (s === name) ? 'flex' : 'none';
    });
    if (window.Lobby) {
      if (name === 'aleatorio') window.Lobby.startPublicRealtime?.();
      else                      window.Lobby.stopPublicRealtime?.();
    }
    const sub = document.getElementById('versus-subtitle');
    if (sub) sub.textContent = (VERSUS_SUBTITLES[name] || (() => ''))();
    // Botón "volver a mi sala": visible si tengo una sala activa y no estoy viéndola
    const ret = document.getElementById('versus-return-lobby');
    if (ret) ret.style.display = (name !== 'lobby' && window.LB && window.LB.getId()) ? 'flex' : 'none';
  }

  // Navega a una pantalla y la apila (para el back). reset=true reinicia la pila.
  function versusGoTo(name, reset) {
    if (reset) _versusStack = ['root'];
    if (_versusStack[_versusStack.length - 1] !== name) _versusStack.push(name);
    _showScreen(name);
    if (name === 'amigos') {
      if (typeof loadFriends === 'function') loadFriends().then(_renderOnlineFriends).catch(_renderOnlineFriends);
      else _renderOnlineFriends();
    } else if (name === 'aleatorio') {
      if (window.Lobby && typeof window.Lobby.loadPublicList === 'function') window.Lobby.loadPublicList();
    }
  }
  window.versusGoTo = versusGoTo;

  function _versusBack() {
    // En el lobby, "back" sale de la PANTALLA pero NO abandona la sala: podés volver
    // con el botón "Mi sala". Para abandonar de verdad está el botón "Salir".
    if (_versusStack[_versusStack.length - 1] === 'lobby') {
      _versusStack = ['root', 'amistoso'];
      _showScreen('amistoso');
      return;
    }
    _versusStack.pop();
    if (_versusStack.length === 0) { hideVersusPanel(); return; }
    _showScreen(_versusStack[_versusStack.length - 1]);
  }

  // ── Panel: Gira Competitiva ───────────────────────────────────────────────

  function showVersusPanel() {
    const panel = document.getElementById('loading-versus-group');
    if (!panel) return;
    panel.classList.remove('table-gone');
    panel.classList.add('panel-visible');
    document.getElementById('loading-screen')?.classList.add('table-shown');
    versusGoTo('root', true);
  }

  function hideVersusPanel() {
    const panel = document.getElementById('loading-versus-group');
    if (!panel) return;
    panel.classList.remove('panel-visible');
    panel.classList.add('table-gone');
    document.getElementById('loading-screen')?.classList.remove('table-shown');
    _versusStack = ['root'];
    window.Lobby?.stopPublicRealtime?.();
  }

  // Toast stack reutilizable por lobby.js — máximo 6 mensajes, opacidad escalonada
  const _TOAST_MAX = 6;
  const _TOAST_DURATION = 2800;
  let _toastEntries = [];

  function _updateToastOpacities() {
    const n = _toastEntries.length;
    _toastEntries.forEach((e, i) => { e.el.style.opacity = ((i + 1) / n).toFixed(4); });
  }

  window.showVersusToast = function(msg) {
    const stack = document.getElementById('versus-toast-stack');
    if (!stack) return;
    const item = document.createElement('div');
    item.className = 'versus-toast-item';
    item.textContent = msg;
    item.style.opacity = '0';
    stack.appendChild(item);
    const entry = { el: item, fadeTimer: null, removeTimer: null };
    _toastEntries.push(entry);
    // quitar excedente por arriba
    while (_toastEntries.length > _TOAST_MAX) {
      const old = _toastEntries.shift();
      clearTimeout(old.fadeTimer); clearTimeout(old.removeTimer);
      old.el.remove();
    }
    _updateToastOpacities();
    // auto-eliminar
    entry.fadeTimer = setTimeout(() => {
      item.style.opacity = '0';
      entry.removeTimer = setTimeout(() => {
        item.remove();
        _toastEntries = _toastEntries.filter(e => e !== entry);
        _updateToastOpacities();
      }, 320);
    }, _TOAST_DURATION);
  };

  // Confirmación modal genérica (Sí/No)
  let _confirmYes = null;
  window.versusConfirm = function(msg, onYes) {
    const pop = document.getElementById('versus-confirm-popup');
    const m   = document.getElementById('versus-confirm-msg');
    if (!pop) { if (onYes) onYes(); return; }
    if (m) m.textContent = msg;
    _confirmYes = onYes || null;
    pop.style.display = 'flex';
  };
  function _hideConfirm() { const p = document.getElementById('versus-confirm-popup'); if (p) p.style.display = 'none'; _confirmYes = null; }

  // ── Mode selector popup wiring ────────────────────────────────────────────
  document.addEventListener('click', e => {
    const msel = document.getElementById('vs-mode-select-popup');
    if (!msel || msel.style.display === 'none') return;
    const guestId     = msel.dataset.guestId;
    const guestName   = msel.dataset.guestName;
    const guestAvatar = msel.dataset.guestAvatar;
    if (e.target.closest('#vs-mode-btn-flags')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'flags');
    } else if (e.target.closest('#vs-mode-btn-shapes')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'shapes');
    } else if (e.target.closest('#vs-mode-btn-cities')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'cities');
    } else if (e.target.closest('#vs-mode-btn-monuments')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'monuments');
    } else if (e.target.closest('#vs-mode-cancel')) {
      msel.style.display = 'none';
    }
  });

  function _setBtnLoading(btn, loading) {
    if (!btn) return;
    const titleEl = btn.querySelector('.versus-menu-title');
    if (loading) {
      btn.disabled = true;
      btn.style.opacity = '0.65';
      btn.style.cursor = 'not-allowed';
      btn._origTitle = titleEl ? titleEl.textContent : null;
      if (titleEl) titleEl.textContent = T('lobby.creating', 'Creando sala…');
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
      if (titleEl && btn._origTitle != null) titleEl.textContent = btn._origTitle;
      delete btn._origTitle;
    }
  }

  // Crear sala: si ya tengo una activa, pedir confirmación para abandonarla
  async function _doCreateRoom(isPublic, btn) {
    _setBtnLoading(btn, true);
    try {
      const _p = window.LB.create(isPublic);
      const result = typeof window.withConnTimeout === 'function' ? await window.withConnTimeout(_p, 6000) : await _p;
      if (result === undefined) return; // timeout: ya se mostró la viñeta de error de conexión
      versusGoTo('lobby'); window.Lobby.enterLobby();
    }
    catch (e) { window.showVersusToast(T('lobby.createError', 'No se pudo crear la sala')); }
    finally { _setBtnLoading(btn, false); }
  }
  function _createRoomGuarded(isPublic, btn) {
    if (window.LB && window.LB.getId()) {
      window.versusConfirm(T('lobby.alreadyHave', 'Ya tenés una sala creada. ¿Abandonarla y crear una nueva?'), async () => {
        await window.LB.leave();
        _doCreateRoom(isPublic, null);
      });
    } else {
      _doCreateRoom(isPublic, btn);
    }
  }

  // Diff incremental (no destruye/recrea todo cada vez, ver comentario largo
  // más abajo en _renderOnlineFriends) — reusa la fila existente de un
  // amigo si su estado "jugando" no cambió, solo actualizando texto/foto.
  // Recrearla de cero reiniciaba la animación CSS del titileo verde desde
  // 0% en cada refresco (el "se corta de golpe y reinicia" reportado — la
  // lista se refresca sola cada pocos segundos vía onFriendsUpdate/
  // setInterval, así que el corte se notaba tipo "heartbeat").
  function _buildFriendRow(f, playing, T) {
    const statusTxt = playing ? T('social.playing', 'Jugando') : T('versus.online', 'Conectado');
    const row = document.createElement('div');
    row.dataset.friendId = f.id;
    row.innerHTML =
      `<div class="versus-friend-avatar-wrap"><img class="versus-friend-avatar" src="${f.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false"></div>` +
      `<div class="versus-friend-info">` +
        `<span class="versus-friend-name">${f.name}</span>` +
        `<span class="versus-friend-status${playing ? ' playing' : ''}"><span class="versus-friend-dot${playing ? ' playing' : ''}"></span>${statusTxt}</span>` +
      `</div>` +
      `<button class="versus-challenge-btn${playing ? ' disabled' : ''}" ${playing ? 'disabled' : ''} data-id="${f.id}" data-name="${f.name}" data-avatar="${f.avatar || ''}">${playing ? T('social.playing', 'Jugando') : T('versus.challenge', 'Retar')}</button>`;
    row.querySelector('.versus-challenge-btn').addEventListener('click', function () {
      if (this.disabled) return;
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (window._lobbyCountingDown) {
        window.showGlobalToast?.(typeof t === 'function' ? t('lobby.cdBlocked') : 'The room is about to start — wait or cancel the countdown');
        return;
      }
      _showModeSelector(this.dataset.id, this.dataset.name, this.dataset.avatar);
    });
    _applyFriendRowCustomize(row, f, playing);
    return row;
  }
  function _applyFriendRowCustomize(row, f, playing) {
    row.className = 'versus-friend-row' + (playing ? ' playing' : '')
      + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(f.cellCode) ? ' cell-light-text' : '');
    // Marco real (aro de la pfp) + celda real de fondo. applyCellForStatus
    // (no cellUrl directo) para que si está jugando y la celda tiene
    // variante -green (ver CUSTOMIZE_CELL_GREEN_VARIANTS en js/sb.js)
    // titile igual que en el panel social.
    window.CustomizeAssets?.applyFrame(row.querySelector('.versus-friend-avatar-wrap'), f.frameCode || '0001');
    window.CustomizeAssets?.applyCellForStatus(row, f.cellCode || '0001', playing ? 'playing' : 'online');
  }
  function _renderOnlineFriends() {
    const list    = document.getElementById('versus-friends-list');
    const emptyEl = document.getElementById('versus-empty-msg');
    if (!list) return;

    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const statusOf = f => (typeof getStatusObj === 'function')
      ? getStatusObj(f).cls
      : ((f.last_active && (Date.now() - new Date(f.last_active)) / 1000 < 120) ? (f.is_playing ? 'playing' : 'online') : 'offline');
    const online = friends.filter(f => statusOf(f) !== 'offline'); // conectados Y jugando

    if (online.length === 0) {
      list.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const T = (k, d) => (typeof t === 'function' ? t(k) : d);
    const existingRows = new Map();
    list.querySelectorAll('.versus-friend-row[data-friend-id]').forEach(el => existingRows.set(el.dataset.friendId, el));

    let prevEl = null;
    online.forEach(f => {
      const playing = statusOf(f) === 'playing';
      let row = existingRows.get(String(f.id));
      if (row) {
        existingRows.delete(String(f.id));
        const wasPlaying = row.classList.contains('playing');
        // Nombre/foto/celda pueden cambiar sin que cambie el estado
        // "jugando" (ej. equipó otra celda) — se actualizan siempre, pero
        // SOLO se toca className/animación si el estado realmente cambió,
        // para no cortar la animación en curso por nada.
        const nameEl = row.querySelector('.versus-friend-name');
        if (nameEl && nameEl.textContent !== f.name) nameEl.textContent = f.name;
        const avatarEl = row.querySelector('.versus-friend-avatar');
        const newAvatar = f.avatar || 'images/profilepic/ppdefault.png';
        if (avatarEl && avatarEl.src !== newAvatar) avatarEl.src = newAvatar;
        if (wasPlaying !== playing) {
          // Transición real de estado (empezó o dejó de jugar) — acá SÍ
          // corresponde recrear la fila (btn/texto/clases cambian de
          // verdad), la animación arranca de cero porque es una fila
          // "nueva" en ese estado, no un refresco de lo mismo.
          const fresh = _buildFriendRow(f, playing, T);
          list.replaceChild(fresh, row);
          row = fresh;
        } else {
          _applyFriendRowCustomize(row, f, playing);
        }
      } else {
        row = _buildFriendRow(f, playing, T);
        list.appendChild(row);
      }
      // Reordenar sin recrear: insertBefore de un nodo YA EN EL DOM no
      // reinicia sus animaciones CSS (solo crear el nodo de nuevo lo hace).
      const wantedNext = prevEl ? prevEl.nextSibling : list.firstChild;
      if (wantedNext !== row) list.insertBefore(row, wantedNext);
      prevEl = row;
    });
    // Amigos que ya no están online/existen — sacarlos.
    existingRows.forEach(el => el.remove());
  }

  // Estado de amigos en vivo en el panel de duelo 1v1 (igual que el panel social)
  if (typeof onFriendsUpdate === 'function') {
    onFriendsUpdate(() => {
      const sc = document.getElementById('versus-screen-amigos');
      if (sc && sc.style.display !== 'none') _renderOnlineFriends();
    });
  }

  // El poll social solo corre con el panel social abierto. Acá refrescamos los amigos
  // mientras el panel versus o el popup de invitar estén abiertos, para que el estado
  // "Jugando"/"Conectado" se actualice en vivo también en competitivo.
  setInterval(() => {
    if (!window._accountLoggedIn || typeof loadFriends !== 'function') return;
    const panel = document.getElementById('loading-versus-group');
    const versusOpen = panel && !panel.classList.contains('table-gone');
    const inviteOpen = document.getElementById('lobby-invite-popup')?.style.display === 'flex';
    if (versusOpen || inviteOpen) loadFriends();
  }, 5000);

  // ── Mode selector ─────────────────────────────────────────────────────────

  function _showModeSelector(guestId, guestName, guestAvatar) {
    const pop = document.getElementById('vs-mode-select-popup');
    if (!pop) { _sendInvite(guestId, guestName, guestAvatar, 'flags'); return; }
    document.getElementById('vs-mode-sel-name').textContent = guestName;
    document.getElementById('vs-mode-sel-pic').src = guestAvatar || 'images/profilepic/ppdefault.png';
    // Marco real del amigo invitado — antes siempre quedaba en el default.
    const guestFriend = (typeof getFriends === 'function') ? getFriends().find(f => f.id === guestId) : null;
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-mode-sel-pic-wrap'), guestFriend?.frameCode || '0001');
    pop.style.display = 'flex';
    pop.dataset.guestId     = guestId;
    pop.dataset.guestName   = guestName;
    pop.dataset.guestAvatar = guestAvatar || '';
  }

  // ── Outgoing invite (host) ────────────────────────────────────────────────

  async function _sendInvite(guestId, guestName, guestAvatar, mode) {
    mode = mode || 'flags';
    const guestFriend = (typeof getFriends === 'function') ? getFriends().find(f => f.id === guestId) : null;
    _pendingOppName   = guestName;
    _pendingOppAvatar = guestAvatar;
    _pendingOppFrameCode = guestFriend?.frameCode || '0001';
    try {
      await window.VS.invite(guestId, mode);
    } catch(e) { console.warn('[VS] invite error:', e); return; }

    // NO cerrar el panel competitivo: el popup de "esperando" se muestra encima y al
    // cancelar/expirar volvés al panel de amigos, no al panel 2.
    _showOutgoingPopup(guestName, guestAvatar, _pendingOppFrameCode);

    window.VS.onStart(match => {
      _hideOutgoingPopup();
      _scheduleVersusStart(match);
    });
  }

  function _showOutgoingPopup(name, avatar, frameCode) {
    const pop  = document.getElementById('vs-outgoing-popup');
    const bar  = document.getElementById('vs-out-bar');
    if (!pop) return;
    document.getElementById('vs-out-name').textContent = name;
    document.getElementById('vs-out-pic').src = avatar || 'images/profilepic/ppdefault.png';
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-out-pic-wrap'), frameCode || '0001');
    pop.style.display = 'flex';
    // Barra de countdown
    bar.style.transition = 'none';
    bar.style.width = '100%';
    requestAnimationFrame(() => {
      bar.style.transition = `width ${TIMEOUT_MS}ms linear`;
      bar.style.width = '0%';
    });
    clearTimeout(_outTimer);
    _outTimer = setTimeout(() => { _hideOutgoingPopup(); }, TIMEOUT_MS);
  }

  function _hideOutgoingPopup() {
    const pop = document.getElementById('vs-outgoing-popup');
    if (pop) pop.style.display = 'none';
    clearTimeout(_outTimer);
  }

  // ── Incoming invite (guest) ───────────────────────────────────────────────

  function _showIncomingPopup(match) {
    // Buscar datos del host en la lista de amigos
    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const host    = friends.find(f => f.id === match.host_id);
    const name    = host ? host.name   : 'Alguien';
    const avatar  = host ? host.avatar : 'images/profilepic/ppdefault.png';
    // Guardar para el leaderboard versus (el guest puede no tener la caché cargada)
    _pendingOppName   = name;
    _pendingOppAvatar = avatar;
    _pendingOppFrameCode = host?.frameCode || '0001';
    document.getElementById('vs-in-name').textContent = name;
    document.getElementById('vs-in-pic').src = avatar;
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-in-pic-wrap'), _pendingOppFrameCode);

    // Guardar en inbox para que el usuario pueda recuperar la invitación si perdió el banner
    if (typeof window.addVersusNotif === 'function') {
      window.addVersusNotif({ type: 'vs', id: match.id, matchId: match.id, fromName: name, fromAvatar: avatar, ts: Date.now() });
    }

    // Reto 1v1 → misma notificación NO bloqueante que las invitaciones a sala
    if (typeof window.showInviteNotif === 'function') {
      window.showInviteNotif({
        persistent: true,
        name,
        sub: match.mode === 'shapes'    ? T('vs.challengedShapes',    'te retó a Map Mayhem 1v1')
           : match.mode === 'cities'    ? T('vs.challengedCities',    'te retó a City Blitz 1v1')
           : match.mode === 'monuments' ? T('vs.challengedMonuments', 'te retó a Landmark Loco 1v1')
           : T('vs.challengedYou', 'te retó a Suitcase Shuffle 1v1'),
        onAccept: async () => {
          if (typeof window.removeVersusNotif === 'function') window.removeVersusNotif(match.id);
          try {
            await window.VS.accept(match.id);
            const m = window.VS.getMatch();
            if (m) _scheduleVersusStart(m);
            else throw new Error('no match');
          } catch (e) {
            console.warn('[VS] accept error:', e);
            window.showVersusToast(T('lobby.joinFailed', 'No pudiste unirte, intentá de nuevo'));
          }
        },
        onDecline: () => {
          if (typeof window.removeVersusNotif === 'function') window.removeVersusNotif(match.id);
          window.VS.decline(match.id);
        },
      });
    }
  }

  function _hideIncomingPopup() {
    const pop = document.getElementById('vs-incoming-popup');
    if (pop) pop.style.display = 'none';
    clearTimeout(_inTimer);
  }

  // ── Eventos de botones ────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const _sfx = () => { if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } };

    // Back del panel versus (navega hacia atrás en la pila de pantallas)
    document.getElementById('versus-back-wrap')?.addEventListener('click', () => {
      _sfx(); _versusBack();
    });

    // ── ROOT ──
    document.getElementById('versus-btn-amistoso')?.addEventListener('click', () => { _sfx(); versusGoTo('amistoso'); });
    // versus-btn-competitivo está deshabilitado (próximamente)

    // ── AMISTOSO ──
    document.getElementById('versus-btn-amigos')?.addEventListener('click', () => { _sfx(); versusGoTo('amigos'); });
    document.getElementById('versus-btn-grupo')?.addEventListener('click', () => { _sfx(); versusGoTo('grupo'); });
    document.getElementById('versus-btn-aleatorio')?.addEventListener('click', () => { _sfx(); versusGoTo('aleatorio'); });

    // ── GRUPO ──
    document.getElementById('versus-btn-create-private')?.addEventListener('click', function() {
      _sfx(); _createRoomGuarded(true, this);
    });

    // Confirmación (Sí/No)
    document.getElementById('versus-confirm-yes')?.addEventListener('click', () => {
      _sfx(); const cb = _confirmYes; _hideConfirm(); if (cb) cb();
    });
    document.getElementById('versus-confirm-no')?.addEventListener('click', () => {
      _sfx(); _hideConfirm();
    });
    document.getElementById('versus-btn-join-code')?.addEventListener('click', async () => {
      _sfx();
      const code = (document.getElementById('versus-join-code')?.value || '').trim();
      if (!code) return;
      try {
        const _p = window.LB.joinByCode(code);
        const result = typeof window.withConnTimeout === 'function' ? await window.withConnTimeout(_p, 6000) : await _p;
        if (result === undefined) return; // timeout: ya se mostró la viñeta de error de conexión
        versusGoTo('lobby'); window.Lobby.enterLobby();
      }
      catch (e) {
        const msg = (e && e.message === 'started') ? T('lobby.started', 'La partida ya empezó')
                  : (e && e.message === 'not_found') ? T('lobby.notFound', 'Sala no encontrada')
                  : T('lobby.joinError', 'No se pudo unir a la sala');
        window.showVersusToast(msg);
      }
    });

    // ── ALEATORIO ──
    document.getElementById('versus-btn-create-public')?.addEventListener('click', function() {
      _sfx(); _createRoomGuarded(true, this);
    });

    // Volver a mi sala (cuando navegué fuera del lobby sin abandonarlo)
    document.getElementById('versus-return-lobby')?.addEventListener('click', () => {
      _sfx();
      if (window.LB && window.LB.getId()) { versusGoTo('lobby'); window.Lobby.enterLobby(); }
    });

    // Cancelar invitación saliente (avisa al guest para que se le descarte la noti)
    document.getElementById('vs-out-cancel')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.VS.cancelInvite();
      _hideOutgoingPopup();
    });

    // Aceptar invitación
    document.getElementById('vs-in-accept')?.addEventListener('click', async () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const matchId = document.getElementById('vs-in-accept').dataset.matchId;
      _hideIncomingPopup();
      try {
        await window.VS.accept(matchId);
        // El guest arranca directamente con los datos del match ya conocidos
        const match = window.VS.getMatch();
        if (match) _scheduleVersusStart(match);
        else throw new Error('no match');
      } catch(e) {
        console.warn('[VS] accept error:', e);
        if (typeof window.showVersusToast === 'function')
          window.showVersusToast(T('lobby.joinFailed', 'No pudiste unirte, intentá de nuevo'));
      }
    });

    // Rechazar invitación
    document.getElementById('vs-in-decline')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const matchId = document.getElementById('vs-in-decline').dataset.matchId;
      window.VS.decline(matchId);
      _hideIncomingPopup();
    });

    // Volver al menú desde la pantalla de resultado versus — mismo botón
    // reusado para el espectador (ver vsSpectatorShowResult): si está
    // espectando, cierra ESA sesión en vez de _vsReturnToMenu() (que
    // finalizaría/limpiaría un match VERDADERO que este cliente no tiene).
    document.getElementById('vs-result-back')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (window._isSpectating) {
        if (typeof window.closeSpectator === 'function') window.closeSpectator();
        return;
      }
      _vsReturnToMenu();
    });
  });

  // ── Oponente en el leaderboard real de flags ───────────────────────────────
  // No hay widget aparte: el oponente entra como única "fila de amigo" en el
  // leaderboard de flags, con su score en vivo y la misma animación de
  // adelantamiento/emotes que la barra de amigos normal (ver flags.js).

  function _setupVsOpponent(match) {
    const isHost   = window.VS.isHost();
    const oppId    = isHost ? match.guest_id : match.host_id;
    const friends  = (typeof getFriends === 'function') ? getFriends() : [];
    const opp      = friends.find(f => f.id === oppId);
    window._vsOpponent = {
      id:     oppId,
      name:   opp ? opp.name   : (_pendingOppName   || 'Rival'),
      avatar: opp ? opp.avatar : (_pendingOppAvatar || 'images/profilepic/ppdefault.png'),
      // Usado por openSpectator (js/spectate.js) para aplicarle su marco
      // real al espectarlo desde acá (_armSpectatorFallback más abajo) — sin
      // esto quedaba siempre en el default, sin importar qué tuviera
      // equipado de verdad.
      frameCode: opp ? opp.frameCode : '0001',
      cardCode:  opp ? opp.cardCode  : '0001',
    };
    window._vsOppScore = 0;
  }

  function _teardownVsOpponent() {
    window._vsActive   = false;
    window._vsOpponent = null;
    window._vsOppScore = 0;
    _vsLaunching = false;
    window._vsSpectatorCount = 0;
    if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(0);
  }

  // Llamado desde flags.js/shapes.js cuando el jugador responde correcto/incorrecto.
  // `detail` (opcional) = { index, pick } — selección exacta de esta ronda, para
  // que el modo espectador pueda recrearla en tiempo real.
  window._vsReportAnswer = function(correct, score, detail) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportScore(score, detail ? { ...detail, correct } : undefined);
    if (!correct) window.VS.sendWrong();
  };

  // Llamado desde flags.js/shapes.js al arrancar una ronda nueva (antes de que
  // el jugador responda) — solo para que el modo espectador pueda mostrar las
  // mismas opciones en tiempo real. `payload` = { index, country/label, correctSlot, options }.
  window._vsReportRound = function(payload) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportRound(payload);
  };

  // Llamado 1x/seg desde startFlagsTimer() con el tiempo restante real, para
  // que el modo espectador muestre el mismo contador que el jugador.
  window._vsReportTick = function(timeLeft) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportTick(timeLeft);
  };

  window._vsReportTimesUp = function() {
    if (!window.VS.getMatchId()) return;
    window.VS.reportTimesUp();
  };

  window._vsReportPregame = function(payload) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportPregame(payload);
  };

  window._vsReportPostgame = function(payload) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportPostgame(payload);
  };

  // Ver comentario largo en #vs-wait-spinner (css/style.css) — cubre el
  // hueco de red entre "terminé, ya limpié mis assets" y "llegaron los datos
  // del rival". _showVsWaitSpinner se llama apenas se decide esperar;
  // _hideVsWaitSpinner corre desde flags.js/shapes.js en el mismo punto
  // donde se revela contenido real (flagsSpectatorShowRound/
  // _flagsSpecRevealAfterPregame y equivalentes), y como salvavidas acá
  // mismo al mostrar el resultado o al salir de la espera por abandono.
  window._showVsWaitSpinner = function () {
    const el = document.getElementById('vs-wait-spinner');
    if (el) el.style.display = 'flex';
  };
  window._hideVsWaitSpinner = function () {
    const el = document.getElementById('vs-wait-spinner');
    if (el) el.style.display = 'none';
  };

  // ── Fin de partida → pantalla de resultado W/L ─────────────────────────────
  // Llamado desde flags.js (hideFlagsMode) cuando termina el tiempo en versus.
  // El bonus de "+5s" por dots corre independiente en cada cliente (depende
  // de CUÁNTAS respuestas correctas consecutivas tuvo cada uno), así que los
  // dos relojes pueden desincronizarse — quien termina antes YA NO muestra
  // resultado de una: avisa que terminó y ESPERA a que el rival también
  // avise (ver window.VS.onGameEnd más arriba, en _launchVersus). Antes esto
  // mostraba resultado enseguida (con el rival todavía jugando su bonus) y
  // encima marcaba la partida 'finished' apenas alguien decidía su
  // resultado — cortándole esos segundos de más al rival de golpe (el "5
  // segundos más, pero termina en post" reportado).
  window._vsHandleGameEnd = function(myFinalScore) {
    if (_resultShown) return;
    _myGameEnded = true;
    _myFinalScoreCache = myFinalScore;
    // OJO: antes acá se llamaba a _flagsCleanupVisuals()/_shapesCleanupVisuals()
    // para borrar YA mis propios assets (máquina/maletines/tablero) apenas
    // termina mi cronómetro, pensado para la transición hacia
    // _enterWaitAsSpectator() — pero corría SIEMPRE que `!_oppGameEnded` en
    // este punto, incluso en un final casi simultáneo donde 600ms después se
    // termina yendo derecho al resultado sin espectar nada (ver el setTimeout
    // de más abajo), y aun en el camino normal de espera, el jugador quería
    // ver su propio tablero seguir ahí (congelado) detrás del spinner/overlay
    // de resultado, no una pantalla vacía — el "se quitan los assets del
    // juego" reportado. Ya no se borra nada acá: el tablero queda tal cual
    // hasta que, si corresponde, flagsSpectatorEnter/shapesSpectatorEnter lo
    // repueblan con los datos del rival (mismos elementos, sin parpadeo).
    if (!_oppGameEnded && typeof window._showVsWaitSpinner === 'function') window._showVsWaitSpinner();
    if (window.VS.getMatchId()) {
      window.VS.reportScore(myFinalScore);
      // Si YA sé que el rival terminó (soy el segundo en terminar), calculo
      // ahora el instante compartido de revelación y lo mando en el mismo
      // aviso — ver comentario largo en _revealAt/reportGameEnd.
      const revealAt = _oppGameEnded ? (Date.now() + REVEAL_BUFFER_MS) : null;
      if (revealAt) _revealAt = revealAt;
      window.VS.reportGameEnd(myFinalScore, revealAt);
    }
    // Salvavidas: si el broadcast/estado del rival se pierde por lo que sea
    // (glitch de red), no dejar a este jugador esperando para siempre — a
    // los 12s SIN NINGUNA señal de que el rival sigue activo se muestra el
    // resultado igual con lo último conocido de él (ver _armGameEndFallback,
    // que es quien realmente rearma este timer cada vez que sí llega una
    // señal real mientras se lo mira de prestado).
    _armGameEndFallback();
    // Margen corto antes de decidir si hay que espectar al rival de prestado
    // — cubre tanto "por si el rival YA había avisado antes de que yo
    // terminara" (ver _revealAt/REVEAL_BUFFER_MS) COMO el caso de un final
    // casi simultáneo: si el rival termina su cronómetro casi al mismo
    // instante que yo, su 'gameend' puede llegar unos cientos de ms después
    // del mío por latencia de red normal. Antes esto entraba a
    // _enterWaitAsSpectator() DE UNA, sin esperar nada — si el rival hacía
    // lo mismo conmigo al mismo tiempo, los DOS soltaban su canal para
    // "mirar de prestado" al otro simultáneamente, y ninguno de los dos
    // volvía a generar tick/round (ambos ya habían dejado de jugar) —
    // quedaban mutuamente esperándose sin ninguna señal real hasta el
    // salvavidas de 12s (el "los dos quieren espectear al otro" reportado).
    // Esperar este margen antes de comprometerse a espectar cubre ese caso:
    // si en ese ratito llega el aviso del rival, vamos derecho al resultado
    // sin pasar por el modo espectador para nada.
    setTimeout(() => {
      if (_resultShown) return;
      if (_oppGameEnded) { _tryShowVsResultWhenBothDone(); return; }
      // El rival sigue jugando de verdad, en vez de dejar al jugador mirando
      // una pantalla congelada/el overlay de TIME'S UP ya apagado, lo
      // metemos de prestado al modo espectador DE SU PROPIO RIVAL (mismo
      // pipeline que ya usan los amigos para espectar) hasta que el rival
      // también termine.
      _enterWaitAsSpectator();
    }, 600);
  };

  async function _enterWaitAsSpectator() {
    if (_waitingAsSpectator || _resultShown) return;
    const matchId = window.VS.getMatchId();
    if (typeof window.openSpectator !== 'function' || !matchId || !window._vsOpponent) return;
    _waitingAsSpectator = true;
    // Supabase Realtime no deja tener dos canales suscriptos al mismo tema
    // 'match-{id}' desde el mismo cliente (confirmado en vivo: tira "cannot
    // add postgres_changes callbacks... after subscribe()") — hay que
    // soltar el canal de ESTE jugador (VS, ya conectado desde que arrancó la
    // partida) para que Spectate.watch() pueda tomar ese mismo tema y
    // renderizar al rival. reportScore/reportGameEnd ya se mandaron arriba
    // en _vsHandleGameEnd, antes de esto — no se pierde nada de lo propio.
    // ESPERAR a que el unsubscribe termine de verdad (ver comentario largo
    // en releaseChannel) antes de que Spectate.watch() intente tomar el
    // mismo tema — si no, es una carrera que a veces fallaba en juego real
    // (el "lo kickea al menu de frente" reportado, porque Spectate.watch()
    // tiraba error y openSpectator lo tragaba en silencio sin reintentar).
    await window.VS.releaseChannel();
    if (_resultShown) return; // se resolvió mientras esperábamos (ej. abandono)
    // La detección de "el rival también terminó" ya no puede venir del
    // canal de VS (recién liberado) — se reemplaza por el mismo evento
    // 'gameend', pero recibido a través del canal que abre Spectate.watch().
    window.Spectate.onGameEnd(payload => {
      if (!payload || _resultShown) return;
      _oppGameEnded = true;
      _oppFinalScoreCache = payload.score || 0;
      if (payload.revealAt) _revealAt = payload.revealAt;
      _tryShowVsResultWhenBothDone();
    });
    // (Los assets propios ya se limpiaron arriba en _vsHandleGameEnd, apenas
    // se supo que había que esperar — ver ese comentario largo.)
    // Mientras dure este mirado-de-prestado, cada tick/round real que llegue
    // del rival (spectate.js los procesa para dibujar la UI, y de paso llama
    // a este hook — ver _wireCommonCallbacks) reprograma el salvavidas de
    // 12s — ver _armGameEndFallback. Sin esto el salvavidas original (armado
    // UNA sola vez en _vsHandleGameEnd, contado desde MI fin) disparaba igual
    // aunque el rival siguiera jugando normal con más de 12s por delante.
    window._vsSpectatorHeartbeat = _armGameEndFallback;
    window.openSpectator(matchId, window._vsOpponent, { instant: true });
    // El cartelito de "ESPECTANDO" (miniHud, ver spectator-mini-tag en
    // index.html) es para un espectador EXTERNO mirando a un amigo — acá el
    // que está mirando es EL PROPIO JUGADOR, esperando a que el rival
    // termine su cronómetro para poder ver el resultado. "ESPECTANDO" no
    // tiene sentido en ese contexto — se pisa con un mensaje de espera.
    const tagEl = document.getElementById('spectator-mini-tag');
    if (tagEl) tagEl.textContent = (typeof t === 'function') ? t('vs.waitingForOthers', 'Esperando a los otros jugadores...') : 'Esperando a los otros jugadores...';
  }

  // Saca al jugador del modo espectador "de prestado" sin pasar por la
  // pantalla de menú (ver closeSpectator(message, silent) en spectate.js) —
  // a diferencia de un espectador externo, este jugador vuelve directo a SU
  // PROPIA pantalla de resultado, no al menú.
  function _exitWaitAsSpectator() {
    if (!_waitingAsSpectator) return;
    _waitingAsSpectator = false;
    if (window._vsSpectatorHeartbeat === _armGameEndFallback) window._vsSpectatorHeartbeat = null;
    // A punto de mostrar MI PROPIO resultado del duelo — mismo flag que ya
    // usa _onOpponentAbandoned antes de su hardReset. flagsSpectatorExit()
    // (llamado adentro de closeSpectator, ver más abajo) ahora también lo
    // respeta: sin esto borraba los assets de fondo del juego (máquina/
    // maletines/banderas) antes de que apareciera el overlay de resultado,
    // dejándolo sobre un fondo vacío en vez de la partida congelada detrás
    // (el "se quitan los assets de fondo si pierdo" reportado).
    window._vsShowingResult = true;
    if (typeof window.closeSpectator === 'function') window.closeSpectator(null, true);
  }

  // Antes esto llamaba a _showVsResult() directo, apenas ESTE cliente se
  // enteraba (localmente) de que ambos habían terminado — y esa noticia le
  // llega a cada lado en un momento distinto (quien termina segundo ya lo
  // sabe al toque; quien terminó primero recién cuando el broadcast del
  // segundo le llega). Ahora ambos (y cualquier espectador, vía el mismo
  // 'gameend' relayado por Spectate.watch) esperan al MISMO _revealAt de
  // reloj de pared antes de mostrar nada — ver _revealAt más arriba.
  function _tryShowVsResultWhenBothDone(force) {
    if (_resultShown || !_myGameEnded) return;
    if (!_oppGameEnded && !force) return; // seguir esperando al rival
    clearTimeout(_gameEndFallbackTimer);
    // Sin revealAt (el broadcast del rival se perdió y llegamos acá por el
    // salvavidas de 12s, o por alguna razón nunca se calculó) — no tiene
    // sentido seguir esperando, se muestra ya con lo último conocido.
    const delay = _revealAt ? Math.max(0, _revealAt - Date.now()) : 0;
    clearTimeout(_revealTimer);
    _revealTimer = setTimeout(() => {
      if (_resultShown) return;
      window._hideVsWaitSpinner();
      _exitWaitAsSpectator();
      const isHost = window.VS.isHost();
      const m = window.VS.getMatch() || {};
      const oppScoreFromMatch = isHost ? (m.guest_score || 0) : (m.host_score || 0);
      const oppScore = _oppGameEnded ? Math.max(_oppFinalScoreCache || 0, oppScoreFromMatch) : oppScoreFromMatch;
      const myScore  = Math.max(_myFinalScoreCache || 0, isHost ? (m.host_score || 0) : (m.guest_score || 0));
      const outcome  = myScore > oppScore ? 'win' : (myScore < oppScore ? 'lose' : 'draw');
      _showVsResult(outcome, myScore, oppScore);
    }, delay);
  }

  // El rival se desconectó o abandonó → gano por abandono.
  function _onOpponentAbandoned() {
    if (_resultShown) return;
    window._hideVsWaitSpinner();
    // Si estaba mirando al rival de prestado (ver _enterWaitAsSpectator) hay
    // que sacarlo de ahí ANTES de tocar el hard reset del modo real — la UI
    // de espectador está montada sobre los mismos elementos del juego real,
    // así que hacer ambas cosas a la vez pisaría el DOM.
    _exitWaitAsSpectator();
    _endedByAbandon = true;
    // Marcar que el resultado VS está visible para que los hardResets no limpien assets
    window._vsShowingResult = true;
    // Parar timers/RAF del modo actual sin borrar assets ni ocultar elementos del juego
    // (el overlay del resultado cubre todo con su fondo oscuro)
    if (_vsCurrentMode === 'shapes') {
      if (typeof window.shapesHardReset === 'function') { try { window.shapesHardReset(); } catch(e) {} }
    } else if (_vsCurrentMode === 'cities' || _vsCurrentMode === 'monuments') {
      (_vsCurrentMode === 'monuments' ? window.monumentsHardReset : window.citiesHardReset)?.();
    } else {
      if (typeof window.flagsHardReset === 'function') { try { window.flagsHardReset(); } catch(e) {} }
    }
    const m = window.VS.getMatch() || {};
    const isHost   = window.VS.isHost();
    // MI propio puntaje NO se lee solo de m.host_score/guest_score — ese
    // valor viene del eco de postgres_changes de mi ÚLTIMO reportScore(), que
    // tarda un rato en llegar (WAL real, no instantáneo); si el rival
    // abandona justo después de que yo sumé puntos, ese eco todavía puede no
    // haber llegado y el cache queda en 0 o desactualizado — el "mi puntaje
    // final marca 0" reportado. La fuente viva (el propio contador del modo
    // en curso) es inmediata, sin esa demora.
    const liveScore = _getLiveScore();
    const myScoreFromMatch = isHost ? (m.host_score || 0) : (m.guest_score || 0);
    const myScore  = Math.max(liveScore, myScoreFromMatch);
    const oppScore = isHost ? (m.guest_score || 0) : (m.host_score || 0);
    _showVsResult('win', myScore, oppScore, 'abandon');
  }

  // Lee el puntaje EN VIVO del modo actualmente en curso, directo de la
  // variable global de cada juego (flags.js/shapes.js/monuments.js
  // comparten el mismo scope global, sin build step) — no depende de que
  // reportScore() ya haya hecho ida y vuelta a la base.
  function _getLiveScore() {
    if (_vsCurrentMode === 'shapes')    return Math.round(typeof shapesScore !== 'undefined' ? shapesScore : 0);
    if (_vsCurrentMode === 'cities' || _vsCurrentMode === 'monuments') {
      return Math.round((typeof state !== 'undefined' && state && typeof state.score === 'number') ? state.score : 0);
    }
    return Math.round(typeof flagsScore !== 'undefined' ? flagsScore : 0);
  }

  // Llamado desde quitToMenu cuando salgo de una partida versus en curso.
  window._vsAbandon = function() {
    // Quien abandona pierde: registrar derrota en mi propio record
    if (window._sbUserId && typeof window.sbRecordVersusResult === 'function') {
      window.sbRecordVersusResult(window._sbUserId, false).catch(() => {});
    }
    if (window.VS && typeof window.VS.abandon === 'function') window.VS.abandon();
    _teardownVsOpponent();
    _restoreRandom();
  };

  function _showVsResult(outcome, myScore, oppScore, reason) {
    if (_resultShown) return;
    _resultShown = true;
    // Apagar is_playing YA (no recién al volver al menú) — sin esto, el
    // ícono de espectar en la celda de este jugador dentro del panel de
    // amigos seguía visible/clickeable durante TODO el rato que se queda
    // mirando su propia pantalla de resultado, aunque la partida ya haya
    // terminado (matches.status también se adelanta acá abajo, con
    // VS.finish() — mismo motivo, dos flags distintos que hay que apagar a
    // la vez). Se llama en AMBOS clientes (no solo host): cada uno apaga su
    // PROPIO is_playing, no el del rival.
    if (typeof window._setPlaying === 'function') window._setPlaying(false);
    // Avisar a un posible espectador el resultado final — antes esto no
    // pasaba nunca (reportPostgame() estaba definida en vs.js pero nadie la
    // llamaba para versus, ver comentario viejo ahí mismo), así que el
    // espectador se quedaba con la última ronda congelada hasta que el host
    // volvía al menú (recién ahí matches.status pasaba a 'finished' y el
    // espectador cerraba la sesión con un mensaje genérico, sin ver nunca el
    // resultado real). Se llama desde AMBOS clientes (host y guest, cada uno
    // corre _showVsResult de forma independiente) — inofensivo, el
    // espectador recibe el mismo resultado dos veces.
    if (window.VS && window.VS.getMatchId() && typeof window.VS.reportPostgame === 'function') {
      const isHost = window.VS.isHost();
      const myName   = localStorage.getItem('playerName')  || 'Jugador';
      const myAvatar = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
      const opp = window._vsOpponent || {};
      const oppName   = opp.name   || 'Rival';
      const oppAvatar = opp.avatar || 'images/profilepic/ppdefault.png';
      window.VS.reportPostgame({
        hostName:   isHost ? myName   : oppName,
        hostAvatar: isHost ? myAvatar : oppAvatar,
        hostScore:  isHost ? myScore  : oppScore,
        guestName:   isHost ? oppName   : myName,
        guestAvatar: isHost ? oppAvatar : myAvatar,
        guestScore:  isHost ? oppScore  : myScore,
        reason: reason || null,
      });
      // Marcar la partida como terminada YA (no recién cuando el host vuelve
      // al menú, que es cuando _vsReturnToMenu() llamaba a esto antes) — sin
      // esto, un espectador podía seguir "entrando" a esta partida (matches.
      // status seguía en 'active') durante todo el rato que el ganador se
      // quedaba mirando su propia pantalla de resultado, viendo el mismo
      // resultado ya decidido en vez de que se le niegue el acceso, como
      // corresponde a una partida ya terminada. _endedByAbandon es false acá
      // (si fuera abandono, quien abandonó ya escribió status='abandoned'
      // directo — este código ni se llama en ese caso con _resultShown
      // todavía false). isHost: mismo dueño que ya tenía el permiso de
      // escritura en _vsReturnToMenu, no se duplica el criterio.
      if (isHost && !_endedByAbandon && typeof window.VS.finish === 'function') {
        try { window.VS.finish(); } catch (e) {}
      }
    }
    // Hide all HUD elements that could appear above the result overlay
    ['score-display','countdown-widget','flags-score-display','flags-countdown-widget',
     'shapes-countdown-widget','pregame-countdown','flags-pregame-countdown',
     'right-panel','flags-right-panel','timeup-overlay','flags-timeup-overlay',
     'speed-bonus-text','flags-speed-bonus-text','game-wrapper'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Registrar el resultado en mi propio record (las tablas no cuentan empates)
    if ((outcome === 'win' || outcome === 'lose') && window._sbUserId
        && typeof window.sbRecordVersusResult === 'function') {
      window.sbRecordVersusResult(window._sbUserId, outcome === 'win').catch(() => {});
    }
    const T = (k, d) => (typeof t === 'function' ? t(k) : d);
    const screen = document.getElementById('vs-result-screen');
    const title  = document.getElementById('vs-result-title');
    if (title) {
      title.className = 'vs-result-title ' + outcome;
      title.textContent = outcome === 'win'       ? T('vs.result.win',       '¡GANASTE!')
                        : outcome === 'lose'      ? T('vs.result.lose',      'PERDISTE')
                        : outcome === 'abandoned' ? T('vs.result.abandoned',  'QUEDASTE SOLO')
                        :                          T('vs.result.draw',       '¡EMPATE!');
    }
    const sub = document.getElementById('vs-result-sub');
    if (sub) {
      const subText = outcome === 'abandoned' ? T('vs.result.solo', 'Todos abandonaron la partida')
                    : reason === 'abandon'    ? T('vs.result.abandon', 'Tu rival abandonó la partida')
                    : '';
      sub.textContent = subText;
      sub.style.display = subText ? 'block' : 'none';
    }
    document.getElementById('vs-result-me-name').textContent  = localStorage.getItem('playerName') || T('vs.result.you', 'Tú');
    document.getElementById('vs-result-me-pic').src           = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    document.getElementById('vs-result-me-score').textContent = (myScore || 0).toLocaleString();
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-result-me-pic-wrap'), window._sbProfile?.frame_code || '0001');
    const opp = window._vsOpponent || {};
    document.getElementById('vs-result-opp-name').textContent  = opp.name || 'Rival';
    document.getElementById('vs-result-opp-pic').src           = opp.avatar || 'images/profilepic/ppdefault.png';
    document.getElementById('vs-result-opp-score').textContent = (oppScore || 0).toLocaleString();
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-result-opp-pic-wrap'), opp.frameCode || '0001');
    if (screen) screen.style.display = 'flex';
    try {
      if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
    } catch (e) {}
  }

  function _vsReturnToMenu() {
    window._vsShowingResult = false;
    const screen = document.getElementById('vs-result-screen');
    if (screen) screen.style.display = 'none';
    // Registrar el match como finalizado en la DB (solo partidas normales; el abandono
    // ya quedó marcado por el que se fue). Antes de cleanup (que borra el matchId).
    if (!_endedByAbandon && window.VS && window.VS.isHost() && typeof window.VS.finish === 'function') {
      try { window.VS.finish(); } catch (e) {}
    }
    _resultShown = false;
    _endedByAbandon = false;
    _vsLaunching = false;
    if (window.VS && typeof window.VS.cleanup === 'function') window.VS.cleanup();
    // Importante: limpiar el estado versus ANTES de quitToMenu, para que su guard de
    // abandono (if window._vsActive) no se dispare (la partida ya terminó normal).
    _teardownVsOpponent();
    _restoreRandom();
    // Si el lobby del host quedó en 'active' por la cuenta regresiva que corrió mientras
    // estaba en el versus, resetearlo a 'waiting' para que otros puedan unirse de nuevo.
    try {
      const lid = window.LB?.getId?.();
      if (lid && window.LB?.isHost?.() && window.LB?.getLobby?.()?.status === 'active') {
        window.sb?.from('lobbies').update({ status: 'waiting', seed: null }).eq('id', lid).catch(() => {});
      }
    } catch (e) {}
    // Volver al MENÚ PRINCIPAL (panel 1) con el flujo probado de quitToMenu, que resetea
    // todos los paneles del loading. Antes usábamos showEntranceElementsStatic (panel 2),
    // que dejaba el panel 1 y el 2 mezclados.
    if (typeof window.quitToMenu === 'function') {
      window.quitToMenu();
    } else if (typeof window.resetEntranceElements === 'function') {
      window.resetEntranceElements();
      const ls = document.getElementById('loading-screen');
      if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; }
      if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
    }
  }

  // ── Resultado del duelo, versión espectador ─────────────────────────────────
  // Reusa el mismo #vs-result-screen que ven los jugadores reales, pero en
  // modo neutral (host vs guest, sin "vos"/"rival") y solo-lectura (el botón
  // de volver al menú no debe reaccionar — cerraría/reiniciaría la sesión de
  // ESTE cliente, no tiene sentido para un espectador). payload viene de
  // _showVsResult() vía VS.reportPostgame(): {hostName, hostAvatar, hostScore,
  // guestName, guestAvatar, guestScore, reason}.
  window.vsSpectatorShowResult = function (payload) {
    if (!payload) return;
    const screen = document.getElementById('vs-result-screen');
    const title  = document.getElementById('vs-result-title');
    const hostScore  = payload.hostScore  || 0;
    const guestScore = payload.guestScore || 0;
    const outcome = hostScore > guestScore ? 'host' : (hostScore < guestScore ? 'guest' : 'draw');
    const winnerName = outcome === 'host' ? (payload.hostName || 'Host') : (payload.guestName || 'Guest');
    const T = (k, d, vars) => (typeof t === 'function' ? t(k, vars) : d);
    if (title) {
      title.className = 'vs-result-title win'; // color neutro (verde) — no hay "perdiste" para un espectador
      title.textContent = outcome === 'draw'
        ? T('vs.result.draw', '¡EMPATE!')
        : T('vs.result.spectatorWins', `¡GANA ${winnerName}!`, { name: winnerName });
    }
    const sub = document.getElementById('vs-result-sub');
    if (sub) {
      const subText = payload.reason === 'abandon' ? T('vs.result.abandonNeutral', 'El rival abandonó la partida') : '';
      sub.textContent = subText;
      sub.style.display = subText ? 'block' : 'none';
    }
    const meNameEl  = document.getElementById('vs-result-me-name');
    const mePicEl   = document.getElementById('vs-result-me-pic');
    const meScoreEl = document.getElementById('vs-result-me-score');
    const oppNameEl  = document.getElementById('vs-result-opp-name');
    const oppPicEl   = document.getElementById('vs-result-opp-pic');
    const oppScoreEl = document.getElementById('vs-result-opp-score');
    if (meNameEl)  meNameEl.textContent  = payload.hostName || 'Host';
    if (mePicEl)   mePicEl.src           = payload.hostAvatar || 'images/profilepic/ppdefault.png';
    if (meScoreEl) meScoreEl.textContent = hostScore.toLocaleString();
    if (oppNameEl)  oppNameEl.textContent  = payload.guestName || 'Guest';
    if (oppPicEl)   oppPicEl.src           = payload.guestAvatar || 'images/profilepic/ppdefault.png';
    if (oppScoreEl) oppScoreEl.textContent = guestScore.toLocaleString();
    // Mismo motivo que _showVsResult() real: sin esto, los countdown widgets
    // (z-index:1000) quedaban DIBUJADOS ENCIMA del panel de resultado
    // (.vs-popup-overlay, z-index:400) — el jugador real nunca lo nota porque
    // su propio _showVsResult() ya los oculta, pero acá faltaba del todo.
    ['score-display','countdown-widget','flags-score-display','flags-countdown-widget',
     'shapes-countdown-widget','pregame-countdown','flags-pregame-countdown',
     'right-panel','flags-right-panel','timeup-overlay','flags-timeup-overlay',
     'speed-bonus-text','flags-speed-bonus-text','game-wrapper'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // El botón de volver real dispara _vsReturnToMenu() (finaliza SU match,
    // limpia estado VS de ESTE cliente) — no tiene sentido para un
    // espectador. En vez de ocultarlo sin reemplazo (dejando al espectador
    // sin forma de salir de esta pantalla, el "agregá un botón de volver"
    // reportado), se reusa el mismo botón visual pero con closeSpectator()
    // como acción — ver el guard al principio del listener real, más abajo.
    const backBtn = document.getElementById('vs-result-back');
    if (backBtn) { backBtn.style.pointerEvents = ''; backBtn.style.visibility = ''; }
    if (screen) screen.style.display = 'flex';
    try {
      if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
    } catch (e) {}
  };

  window.vsSpectatorHideResult = function () {
    const screen = document.getElementById('vs-result-screen');
    if (screen) screen.style.display = 'none';
  };

  // ── Arrancar partida versus ───────────────────────────────────────────────

  // Espera hasta match.started_at (reloj de pared, seteado por accept() con
  // START_DELAY_MS de margen) antes de arrancar de verdad — sin esto, cada
  // cliente llamaba a _launchVersus() apenas SE ENTERABA de que la partida
  // ya estaba activa, y el guest siempre se enteraba antes que el host (es
  // su propia escritura vs. la notificación realtime de esa escritura
  // llegándole al host, con latencia de red real de por medio) — arrancaban
  // desincronizados, de milisegundos a veces hasta un segundo entero.
  // Popup corto ("¡Duelo aceptado!") mostrado a AMBOS jugadores (host y
  // guest) apenas se sabe que el duelo va a arrancar — llena visualmente el
  // margen de START_DELAY_MS entre "el guest aceptó" y el 3-2-1 real, que
  // antes se sentía como un salto directo/seco de "esperando respuesta" a la
  // pantalla de juego sin ninguna confirmación de por medio.
  function _showDuelAcceptedPopup() {
    const pop = document.getElementById('vs-duel-accepted-popup');
    if (!pop) return;
    const nameEl = document.getElementById('vs-duel-accepted-name');
    const picEl  = document.getElementById('vs-duel-accepted-pic');
    if (nameEl) nameEl.textContent = _pendingOppName || 'Rival';
    if (picEl) picEl.src = _pendingOppAvatar || 'images/profilepic/ppdefault.png';
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-duel-accepted-pic-wrap'), _pendingOppFrameCode || '0001');
    pop.style.display = 'flex';
  }
  function _hideDuelAcceptedPopup() {
    const pop = document.getElementById('vs-duel-accepted-popup');
    if (pop) pop.style.display = 'none';
  }

  function _scheduleVersusStart(match) {
    if (_vsLaunching) return; // ya se programó/arrancó desde otro call site
    _showDuelAcceptedPopup();
    const startedAtMs = match.started_at ? new Date(match.started_at).getTime() : Date.now();
    const delay = Math.max(0, startedAtMs - Date.now());
    if (delay <= 0) { _launchVersus(match); return; }
    // Bloquea otros call sites mientras se espera, sin marcar _vsLaunching
    // todavía (eso lo hace _launchVersus, recién cuando arranca de verdad) —
    // un flag propio evita que dos triggers casi simultáneos (ej. el
    // callback de onStart Y un resend tardío) agenden el setTimeout dos veces.
    if (_vsStartScheduled) return;
    _vsStartScheduled = true;
    setTimeout(() => { _vsStartScheduled = false; _launchVersus(match); }, delay);
  }

  function _launchVersus(match) {
    if (_vsLaunching) return;
    _vsLaunching = true;
    const mode = match.mode || 'flags';
    // Garantiza que quitToMenu no llame a _lobbyAbandon (que haría LB.leave()) al volver
    window._lobbyActive = false;
    const seed = match.seed;
    // Cancelar la cuenta regresiva del lobby si estaba corriendo
    if (window.Lobby?.cancelCountdown) window.Lobby.cancelCountdown();
    if (window.LB?.isHost?.() && window.LB.getId()) window.LB.sendCancel?.();

    window.practiceConfig = window.practiceConfig || {};
    window.practiceConfig.active = false;
    window.pendingGameMode = mode;
    if (typeof window._setPlaying === 'function') window._setPlaying(true);

    // Ocultar loading/versus/splash, dejar solo el juego
    document.getElementById('loading-screen').style.display      = 'none';
    document.getElementById('loading-versus-group')?.classList.add('table-gone');
    document.getElementById('loading-versus-group')?.classList.remove('panel-visible');
    document.getElementById('splash-screen').style.display       = 'none';
    document.getElementById('vs-outgoing-popup').style.display   = 'none';
    document.getElementById('vs-incoming-popup').style.display   = 'none';
    document.getElementById('vs-mode-select-popup').style.display = 'none';
    _hideDuelAcceptedPopup();

    window._vsActive = true;
    _resultShown = false;
    _endedByAbandon = false;
    _myGameEnded = false; _oppGameEnded = false;
    _myFinalScoreCache = null; _oppFinalScoreCache = null;
    _waitingAsSpectator = false;
    _revealAt = null;
    clearTimeout(_gameEndFallbackTimer);
    clearTimeout(_revealTimer);
    if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
    _setupVsOpponent(match);

    window.VS.onOppLeft(_onOpponentAbandoned);
    // El rival avisó que SU cronómetro llegó a 0 (ver reportGameEnd) — si yo
    // también ya terminé el mío, ahora sí se puede mostrar el resultado.
    window.VS.onGameEnd(payload => {
      if (!payload || _resultShown) return;
      _oppGameEnded = true;
      _oppFinalScoreCache = payload.score || 0;
      if (payload.revealAt) _revealAt = payload.revealAt;
      // Al rival se le acabó el tiempo (terminó su cronómetro) → temblor +
      // cronómetro en su cartilla (mismo sistema que el flash de 'wrong').
      if (mode === 'shapes') window.shapesTriggerOpponentTimesUp?.();
      else if (mode === 'cities') window.citiesTriggerOpponentTimesUp?.();
      else if (mode === 'monuments') window.monumentsTriggerOpponentTimesUp?.();
      else window.flagsTriggerOpponentTimesUp?.();
      _tryShowVsResultWhenBothDone();
    });

    // Actualizar leaderboard del oponente según el modo
    window.VS.onScore((hostScore, guestScore) => {
      const isHost   = window.VS.isHost();
      const oppScore = isHost ? guestScore : hostScore;
      if (mode === 'shapes') {
        if (typeof window.shapesSetVsOpponentScore === 'function') window.shapesSetVsOpponentScore(oppScore);
      } else if (mode === 'cities') {
        window.citiesSetVsOpponentScore?.(oppScore);
      } else if (mode === 'monuments') {
        window.monumentsSetVsOpponentScore?.(oppScore);
      } else {
        if (typeof window.flagsSetVsOpponentScore === 'function') window.flagsSetVsOpponentScore(oppScore);
      }
    });

    // Flash rojo en leaderboard del rival cuando falla
    window.VS.onWrong(() => {
      if (mode === 'shapes') {
        if (typeof window.shapesTriggerOpponentWrong === 'function') window.shapesTriggerOpponentWrong();
      } else if (mode === 'cities') {
        window.citiesTriggerOpponentWrong?.();
      } else if (mode === 'monuments') {
        window.monumentsTriggerOpponentWrong?.();
      } else {
        if (typeof window.flagsTriggerOpponentWrong === 'function') window.flagsTriggerOpponentWrong();
      }
    });

    window.VS.onEnd(() => {
      _restoreRandom();
      _teardownVsOpponent();
    });

    // Arrancar con RNG seeded → mismas preguntas para ambos
    _startSeededRandom(seed, mode);
    if (mode === 'shapes') {
      if (typeof showShapesMode === 'function') showShapesMode();
    } else if (mode === 'cities') {
      window.pendingGameMode = 'game';
      if (typeof startGame === 'function') startGame();
    } else if (mode === 'monuments') {
      if (typeof startGame === 'function') startGame();
    } else {
      if (typeof showFlagsMode === 'function') showFlagsMode();
    }
  }

  // ── Escuchar invitaciones al loguear ─────────────────────────────────────

  window._vsStartListening = function() {
    window.VS.listenForInvites(
      match => _showIncomingPopup(match),
      m => {
        if (m && typeof window.removeVersusNotif === 'function') window.removeVersusNotif(m.id);
        if (typeof window.dismissInviteNotif === 'function') window.dismissInviteNotif();
      } // host canceló / expiró
    );
    // Consulta inmediata de invitaciones pendientes que llegaron antes de conectar.
    // Solo se muestra una vez por match (localStorage evita que reaparezca al recargar).
    const uid = window._sbUserId;
    if (uid && window.sb) {
      window.sb.from('matches')
        .select('id, host_id, guest_id, status, seed')
        .eq('guest_id', uid).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => {
          if (!data || !data[0]) return;
          const match = data[0];
          const seenKey = '_seenMatchInvite_' + uid;
          const seen = JSON.parse(localStorage.getItem(seenKey) || '[]');
          if (seen.includes(match.id)) return; // ya se mostró antes
          seen.unshift(match.id);
          localStorage.setItem(seenKey, JSON.stringify(seen.slice(0, 10)));
          _showIncomingPopup(match);
        }).catch(() => {});
    }
  };

  // Aceptar una invitación 1v1 directamente desde el inbox (sin pasar por el banner)
  window._vsAcceptFromInbox = async function(matchId) {
    try {
      await window.VS.accept(matchId);
      const m = window.VS.getMatch();
      if (m) _scheduleVersusStart(m);
      else throw new Error('no match');
    } catch(e) {
      console.warn('[VS] inbox accept error:', e);
      if (typeof window.showVersusToast === 'function')
        window.showVersusToast(T('lobby.joinFailed', 'No pudiste unirte, intentá de nuevo'));
    }
  };

  // Exponer funciones para monuments.js
  window.showVersusPanel = showVersusPanel;
  window.hideVersusPanel = hideVersusPanel;
})();
