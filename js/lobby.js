// ── LOBBY (versus grupal hasta 10 jugadores) ────────────────────────────────────
// Salas para partidas de 2 a 10 jugadores. Soporta:
//   • Privadas: con código compartible + invitar amigos.
//   • Públicas: aparecen en la lista de salas abiertas (aleatorio).
// El HOST controla la sala: ve el roster, kickea y decide cuándo empezar.
// Todos juegan las MISMAS preguntas (RNG sembrado, igual que el 1v1) y compiten
// en el leaderboard en vivo. Al final se muestra un ranking.

// ── Backend (Supabase) ──────────────────────────────────────────────────────────
window.LB = (() => {
  let _lobbyId  = null;
  let _hostId   = null;
  let _channel  = null;
  let _members  = [];     // [{id, name, avatar, score, isHost, is_playing}]
  let _memberProfilesChannel = null;
  let _publicSignalCh = null;      // canal para ENVIAR señales a viewers del panel público (host)
  let _publicSignalChReady = false; // true cuando el canal está en estado SUBSCRIBED

  // Reconectar al volver de 2do plano — los navegadores throttlean los
  // timers de una pestaña en background (a veces a 1/min), de los que
  // depende el heartbeat que la librería de Realtime manda para mantener
  // vivo el WebSocket; si se demora demasiado, el servidor puede cerrar el
  // socket o la presencia de este cliente parece "caerse" para los demás
  // (el "me kickeó de la nada" reportado, mismo origen). En vez de esperar
  // a que Realtime lo note solo (puede tardar o no pasar), se chequea el
  // estado del canal apenas la pestaña vuelve a primer plano y se fuerza un
  // resubscribe si no está realmente conectado.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!_lobbyId) return;
    if (!(_channel && _channel.state === 'joined')) _subscribe();
    // Cuenta regresiva de arranque: el countdown en sí ya se calcula contra
    // el reloj real (until - Date.now()), no contando ticks, así que el
    // NÚMERO mostrado siempre se corrige solo apenas el setInterval vuelve a
    // disparar. El problema es OTRO: el disparo real de la partida
    // (window.LB.start()) solo lo hace el HOST, y solo puede pasar DENTRO de
    // ese mismo _cdInterval — si la pestaña del host está en 2do plano, el
    // navegador puede throttlear ese timer a mucho más de 200ms, así que
    // start() no llega a llamarse hasta que el timer por fin dispare (podía
    // tardar bastante) aunque para el resto ya pasó de sobra el tiempo — el
    // "se descoordina con el resto" reportado: todos los demás ya llegaron a
    // 0 y quedan esperando a que el host, atrasado, recién ahí arranque.
    // Forzar el chequeo YA al volver a primer plano evita esa espera.
    if (_counting && _cdTick) _cdTick();
  });

  // Envía un room-update al canal público; si el canal aún no está listo, reintenta hasta 3s
  function _sendRoomUpdate(payload) {
    if (!_publicSignalCh) return;
    if (_publicSignalChReady) { _publicSignalCh.send({ type: 'broadcast', event: 'room-update', payload }); return; }
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      if (_publicSignalChReady && _publicSignalCh) {
        _publicSignalCh.send({ type: 'broadcast', event: 'room-update', payload });
        clearInterval(iv);
      } else if (attempts >= 6) clearInterval(iv); // 6 × 500ms = 3s máximo
    }, 500);
  }
  let _lobby    = null;   // fila de la tabla lobbies
  let _seed     = null;
  let _onMembers   = null;
  let _onStart     = null;
  let _onClosed    = null;  // me kickearon ('kicked') o el host cerró ('closed')
  let _onCountdown = null;  // host inició la cuenta regresiva
  let _onCancel    = null;  // se canceló la cuenta regresiva
  let _onNotReady  = null;  // alguien marcó "no estoy listo"
  let _onWrong      = null;  // alguien falló una pregunta → señal visual
  let _onVisibility = null;  // host cambió la sala de pública a privada o viceversa
  let _onName       = null;  // host cambió el nombre de la sala
  let _onModes      = null;  // host cambió el modo de juego
  let _onFinished   = null;  // un miembro terminó su partida → coordinación fin grupal
  let _onReveal     = null;  // {revealAt, isFinal} — reloj de pared compartido para mostrar resultados TODOS a la vez (ver _checkAllFinished)
  let _onScore      = null;  // score en vivo de otro miembro → actualizar leaderboard
  let _onPlayerGone = null;  // miembro perdió presencia durante partida activa
  let _onPlayerBack = null;  // miembro recuperó presencia durante partida activa
  let _onAlone      = null;  // todos los demás se fueron durante partida activa → quedé solo
  let _aloneCalledThisGame = false; // guard: _onAlone sólo dispara una vez por partida
  // ── Broadcast ronda-a-ronda para el modo espectador GRUPAL (ver GroupSpectate
  // en spectate.js) — mismo mecanismo que ya usa VS para 1v1 (reportRound/
  // reportTick/reportPregame/reportPostgame/reportAnswer), pero acá cada
  // miembro manda SU propio uid en vez de un rol binario host/guest, porque
  // puede haber hasta 10 jugadores en la misma sala. Antes esto no existía:
  // _specReportRound/etc (spectate.js) no tenían ninguna rama para
  // window._lobbyActive, así que un espectador de grupo solo podía ver el
  // score acumulado (lbscore), nunca la ronda/tablero real de cada miembro.
  let _onRound      = null;  // {uid, ...payload} — un miembro arrancó una ronda nueva
  let _onTick       = null;  // {uid, timeLeft}
  let _onPregame    = null;  // {uid, ...payload} — 3-2-1 de un miembro
  let _onPostgame   = null;  // {uid, ...payload} — resultados de un miembro
  let _onAnswer     = null;  // {uid, ...detail} — un miembro respondió
  let _onTimesUp    = null;  // {uid}
  let _onSplash     = null;  // {uid, ...payload} — un miembro está en instrucciones
  let _onAdvancing  = null;  // {uid} — un miembro confirmó salir del postgame hacia el siguiente modo
  let _resubTime    = 0;     // timestamp del último _subscribe(); guard contra kicks falsos
  const _pendingKicks = new Set(); // miembros que se desconectaron durante la partida
  // uids cuyo PRÓXIMO 'leave' de presence es esperado/intencional (ver
  // markExpectedLeave, llamado desde _enterGroupWaitAsSpectator en lobby.js
  // justo antes de soltar su propio canal para espectar de prestado a los
  // que siguen jugando) — sin esto, el 'leave' handler de más abajo trataba
  // esa desconexión temporal como si el miembro hubiera abandonado la
  // partida DE VERDAD: lo sumaba a _pendingKicks, y _checkAllFinished()
  // (window.Lobby) resta pendingKicksCount del total de gente a esperar —
  // con un jugador todavía jugando restado del total sin querer, la sala
  // podía terminar (mostrar el ranking) ANTES de que ese jugador de verdad
  // terminara (el "le quedaba tiempo y saltó GANASTE de una" reportado).
  const _expectedLeaves = new Set();

  function _myId() { return window._sbUserId || null; }
  function isHost()      { return !!_hostId && _hostId === _myId(); }
  function getMembers()  { return _members; }
  function getLobby()    { return _lobby; }
  function getCode()     { return _lobby ? _lobby.code : null; }
  function getId()       { return _lobbyId; }
  function getSeed()     { return _seed; }

  function _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin I/O/0/1 (ambiguos)
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }

  // is_playing solo es confiable si last_active es reciente — si el flag quedó
  // pegado en true (browser cerrado/crash a mitad de partida sin el UPDATE final),
  // last_active deja de actualizarse y esto lo trata como "no jugando" igual.
  function _isActuallyPlaying(p) {
    if (!p || !p.is_playing || !p.last_active) return false;
    return (Date.now() - new Date(p.last_active)) / 1000 < 120;
  }

  async function _fetchMembers() {
    if (!_lobbyId) return;
    const { data, error } = await window.sb.from('lobby_members')
      .select('user_id, score, joined_at, p:user_id(username, avatar_url, is_playing, last_active, frame_code, card_code, cell_code)')
      .eq('lobby_id', _lobbyId).order('joined_at');
    if (error) { console.warn('[LB] fetchMembers:', error.message); return; }
    _members = (data || []).map(m => ({
      id:        m.user_id,
      name:      (m.p && m.p.username) || '?',
      avatar:    (m.p && m.p.avatar_url) || 'images/profilepic/ppdefault.png',
      score:     m.score || 0,
      isHost:    m.user_id === _hostId,
      is_playing: _isActuallyPlaying(m.p),
      joined_at: m.joined_at,
      // Personalización real de cada miembro (frame=aro de la pfp, card=
      // ficha del leaderboard in-game, cell=fondo de la fila en la sala de
      // espera) — ver _renderMembers y buildFriendPlayers/buildFlagsFriendPlayers.
      frameCode: (m.p && m.p.frame_code) || '0001',
      cardCode:  (m.p && m.p.card_code)  || '0001',
      cellCode:  (m.p && m.p.cell_code)  || '0001',
    }));
    // Si la sala quedó totalmente vacía (todos se fueron sin avisar), cerrarla.
    if (_members.length === 0 && _lobbyId && !window._lobbyActive) {
      try { await window.sb.from('lobbies').update({ status: 'closed' }).eq('id', _lobbyId); } catch (e) {}
      cleanup();
      return;
    }
    // Si ya no figuro entre los miembros (y la partida no empezó) → me kickearon.
    const uid = _myId();
    if (uid && _lobbyId && !window._lobbyActive && !_members.some(m => m.id === uid)) {
      const cb = _onClosed; cleanup(); if (cb) cb('kicked');
      return;
    }
    if (_onMembers) _onMembers(_members);
    _subscribeToMemberProfiles();
  }

  function _subscribeToMemberProfiles() {
    if (_memberProfilesChannel) {
      try { window.sb.removeChannel(_memberProfilesChannel); } catch (e) {}
      _memberProfilesChannel = null;
    }
    const ids = _members.map(m => m.id).filter(Boolean);
    if (!ids.length || !_lobbyId) return;
    _memberProfilesChannel = window.sb
      .channel('lobby-profiles-' + _lobbyId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=in.(${ids.join(',')})`,
      }, (payload) => {
        const updated = payload.new;
        const m = _members.find(x => x.id === updated.id);
        if (!m) return;
        m.is_playing = _isActuallyPlaying(updated);
        if (_onMembers) _onMembers(_members);
      })
      .subscribe();
  }

  // Purga CUALQUIER canal (de este cliente) con el mismo topic 'lobby-{id}'
  // que haya quedado registrado — no solo nuestra propia referencia _channel.
  // GroupSpectate (spectate.js) se suscribe al MISMO topic mientras este
  // jugador espectea de prestado (ver _enterGroupWaitAsSpectator en este
  // archivo); aun llamando GroupSpectate.stop()→removeChannel() y esperando
  // su promesa, supabase-js puede tardar en reflejar la baja en su registro
  // interno de canales — si _subscribe() crea un canal nuevo para ese mismo
  // topic ANTES de que el registro se limpie de verdad, el SDK devuelve la
  // instancia VIEJA (ya suscripta una vez) en vez de una nueva, y cualquier
  // `.on('postgres_changes', ...)` sobre ella explota ("cannot add
  // postgres_changes callbacks ... after subscribe()") — dejando el canal
  // roto para el resto del modo (scores/wrong nunca llegaban a nadie,
  // reportado). Se purga TODO lo que matchee el topic, con reintento breve,
  // antes de crear el canal real.
  async function _purgeStaleChannel(lid) {
    const topic = 'realtime:lobby-' + lid;
    for (let attempt = 0; attempt < 10; attempt++) {
      const stale = (typeof window.sb.getChannels === 'function' ? window.sb.getChannels() : [])
        .filter(c => c && c.topic === topic);
      if (!stale.length) return;
      await Promise.all(stale.map(c => { try { return window.sb.removeChannel(c); } catch (e) { return Promise.resolve(); } }));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async function _subscribe() {
    if (_channel) { try { await window.sb.removeChannel(_channel); } catch (e) {} _channel = null; }
    await _purgeStaleChannel(_lobbyId);
    // Suscribirse al canal público para poder emitir señales de actualización a los viewers
    if (_publicSignalCh) { try { _publicSignalCh.unsubscribe(); } catch(e) {} }
    // Nombre diferente a 'public-lobbies-watch' para no interferir con _publicChannel del viewer
    _publicSignalCh = window.sb.channel('pub-room-signals', { config: { broadcast: { self: false } } })
      .subscribe((status) => { if (status === 'SUBSCRIBED') _publicSignalChReady = true; });
    _publicSignalChReady = false;
    _resubTime = Date.now();
    const lid = _lobbyId;
    const uid = _myId();
    _channel = window.sb.channel('lobby-' + lid, { config: { broadcast: { self: true }, presence: { key: uid || 'anon' } } })
      // Ver comentario largo en markExpectedLeave — hay que registrarlo ANTES
      // de que llegue el 'leave' real de presence de ese mismo uid.
      .on('broadcast', { event: 'expectleave' }, ({ payload }) => { if (payload && payload.uid) _expectedLeaves.add(payload.uid); })
      // Cuenta regresiva sincronizada (efímera, sin tocar la DB)
      .on('broadcast', { event: 'cd' },       ({ payload }) => { if (_onCountdown) _onCountdown(payload || {}); })
      .on('broadcast', { event: 'cancel' },   () => { if (_onCancel) _onCancel(); })
      .on('broadcast', { event: 'notready' }, ({ payload }) => { if (_onNotReady) _onNotReady(payload || {}); })
      .on('broadcast', { event: 'wrong' },      ({ payload }) => { if (_onWrong) _onWrong(payload?.uid || null); })
      .on('broadcast', { event: 'visibility' }, ({ payload }) => {
        if (_lobby) _lobby.is_public = !!payload?.isPublic;
        if (_onVisibility) _onVisibility(payload?.isPublic);
      })
      .on('broadcast', { event: 'name' }, ({ payload }) => {
        if (_lobby) _lobby.name = payload?.name || _lobby.name;
        if (_onName) _onName(payload?.name);
      })
      .on('broadcast', { event: 'modes' }, ({ payload }) => {
        if (_lobby && payload) {
          if (payload.mode)  _lobby.mode  = payload.mode;
          if (payload.modes !== undefined) _lobby.modes = payload.modes;
        }
        if (_onModes) _onModes(payload?.modes || [payload?.mode || 'flags'], !!payload?.changed);
      })
      .on('broadcast', { event: 'finished' }, ({ payload }) => {
        if (_onFinished) _onFinished(payload?.uid, payload?.score);
      })
      // Reloj de pared compartido para el ranking de fin de ronda — ver
      // comentario largo en _checkAllFinished/lobby.js. Sin esto, cada
      // cliente presentaba el resultado apenas SE ENTERABA (localmente) de
      // que todos terminaron, y quien se enteraba por un camino más lento
      // (ej. un espectador de prestado, con más saltos de por medio) lo
      // veía tarde — "antes funcionaba, al meter el espectador se
      // estropeó" reportado.
      .on('broadcast', { event: 'reveal' }, ({ payload }) => {
        if (_onReveal && payload && typeof payload.revealAt === 'number') _onReveal(payload.revealAt, !!payload.isFinal);
      })
      .on('broadcast', { event: 'lbscore' }, ({ payload }) => {
        if (_onScore && payload?.uid !== _myId()) _onScore(payload?.uid, payload?.score ?? 0);
      })
      // Ver comentario largo en los _on* declarados arriba — mismo mecanismo
      // que VS (vs.js) pero taggeado por uid en vez de role host/guest, para
      // que GroupSpectate (spectate.js) pueda mostrar el tablero real de
      // CUALQUIER miembro, no solo su score acumulado.
      .on('broadcast', { event: 'round' },     ({ payload }) => { if (payload && _onRound) _onRound(payload); })
      .on('broadcast', { event: 'gtick' },     ({ payload }) => { if (payload && _onTick) _onTick(payload); })
      .on('broadcast', { event: 'pregame' },   ({ payload }) => { if (payload && _onPregame) _onPregame(payload); })
      .on('broadcast', { event: 'postgame' },  ({ payload }) => { if (payload && _onPostgame) _onPostgame(payload); })
      .on('broadcast', { event: 'ganswer' },   ({ payload }) => { if (payload && _onAnswer) _onAnswer(payload); })
      .on('broadcast', { event: 'timesup' },   ({ payload }) => { if (payload && _onTimesUp) _onTimesUp(payload); })
      .on('broadcast', { event: 'splash' },    ({ payload }) => { if (payload && _onSplash) _onSplash(payload); })
      .on('broadcast', { event: 'advancing' }, ({ payload }) => { if (payload && _onAdvancing) _onAdvancing(payload); })
      // Cualquier cambio de miembros (alta/baja/score) → re-consultar a la sala.
      // _fetchMembers detecta si me kickearon (ya no figuro en la lista). No filtramos
      // por lobby_id en cliente porque el payload de DELETE no siempre trae las columnas.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, () => {
        _fetchMembers();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lobbies',
        filter: 'id=eq.' + lid }, payload => {
        if (!payload.new) return;
        _hostId = payload.new.host_id;
        _lobby  = payload.new;
        // Solo lanzar el juego si la seed cambió (cambio de host_id no debe relanzar)
        if (payload.new.status === 'active' && _onStart && payload.new.seed !== _seed) { _seed = payload.new.seed; _onStart(payload.new); }
        else if (payload.new.status === 'closed' && _onClosed) { const cb = _onClosed; cleanup(); cb('closed'); }
        else { _fetchMembers(); } // cambió el host (u otro campo) → re-render con el nuevo host
      })
      // Presencia: si alguien refresca o cierra la pestaña, su presencia "cae".
      // key.indexOf('spectator-')===0: un ESPECTADOR externo (GroupSpectate,
      // ver spectate.js) se desconectó/cambió de sala — nunca un miembro real
      // de ESTA sala. Sin este filtro, cerrar una sesión de espectador
      // disparaba toda la lógica de "un miembro se fue" (kick, herencia de
      // host, chequeo de "quedé solo") como si un JUGADOR real hubiera
      // abandonado — bug expuesto recién ahora que hay espectadores
      // compartiendo este mismo canal 'lobby-{id}'.
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!key || key === uid || key.indexOf('spectator-') === 0) return;
        if (_expectedLeaves.delete(key)) return; // desconexión intencional (ver markExpectedLeave) — no es un abandono real
        clearTimeout(_graceTimers[key]);
        if (window._lobbyActive || window._lobbyInTransition) {
          // ACTIVE_GAME_GRACE_MS (no 300ms) antes de tratar esto como abandono
          // real. Antes este margen era de solo 300ms — pensado nada más para
          // la carrera de red del broadcast 'expectleave' (ver markExpectedLeave,
          // desconexión intencional al pasar a espectar de prestado) — pero
          // eso también dejaba SIN NINGÚN margen real un simple blip de
          // presencia por wifi o por la pestaña pasando a 2do plano (el
          // throttling del navegador atrasa el heartbeat de Realtime): un
          // jugador que minimiza y vuelve unos segundos después llegaba a
          // reconectar recién DESPUÉS de que este timeout ya lo hubiera
          // comprometido a _pendingKicks — quedaba "kickeado de la nada" y
          // espectando para siempre, sin forma de volver a la partida
          // (reportado). Guardar el timer en _graceTimers (igual que la sala
          // de espera) hace que el handler de 'join' de más abajo lo cancele
          // solo si el 'join' llega a tiempo.
          _graceTimers[key] = setTimeout(() => {
            if (_expectedLeaves.delete(key)) return; // llegó tarde pero llegó — no es abandono real
            delete _graceTimers[key];
            _pendingKicks.add(key);
            if (_onPlayerGone) _onPlayerGone(key);
            // Si el HOST se fue, promover al heredero (mismo algoritmo que _handleMemberGone)
            if (key === _hostId) {
              const myId2 = _myId();
              const heir = _members.find(m => m.id !== key && !_pendingKicks.has(m.id));
              if (heir && heir.id === myId2) {
                // Solo el heredero hace el UPDATE para evitar race conditions
                _hostId = myId2;
                window.sb.from('lobbies').update({ host_id: myId2 }).eq('id', _lobbyId).then(() => {}).catch(() => {});
              }
            }
            // Verificar si quedé solo — dos métodos complementarios:
            // 1) presenceState: clave de presencia ES el uid, usar Object.keys directamente
            const state = _channel?.presenceState?.() || {};
            const presentNow = new Set(Object.keys(state));
            presentNow.delete(key); // ya salió
            presentNow.delete(uid); // yo mismo no cuento
            // 2) pendingKicks como fallback: todos los demás ya en la lista de bajas
            const myId = _myId();
            const othersKicked = _members.length > 0 && _members.filter(m => m.id !== myId)
              .every(m => m.id === key || _pendingKicks.has(m.id));
            if (!_aloneCalledThisGame && (presentNow.size === 0 || othersKicked)) {
              _aloneCalledThisGame = true;
              if (_onAlone) _onAlone();
            }
          }, ACTIVE_GAME_GRACE_MS);
          return;
        }
        _graceTimers[key] = setTimeout(() => _handleMemberGone(key), GRACE_MS);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (!key || key === uid || key.indexOf('spectator-') === 0) return;
        if (_graceTimers[key]) { clearTimeout(_graceTimers[key]); delete _graceTimers[key]; }
        // Red de seguridad: si el 'join' llega tarde (ya se había comprometido
        // el kick en _pendingKicks antes de que reconecte), sacarlo igual —
        // volvió, así que no estaba realmente afuera.
        _pendingKicks.delete(key);
        if (window._lobbyActive && _onPlayerBack) _onPlayerBack(key);
      })
      // Contador de espectadores GLOBAL de la sala — en grupo los espectados
      // se tratan como algo global: el símbolo de "te están espectando"
      // aparece en TODOS los miembros por igual mientras haya al menos un
      // espectador mirando la sala, y desaparece en todos cuando se van. Se
      // cuenta cada clave de presencia 'spectator-*', sin filtrar por a quién
      // mira (antes se filtraba por pov===mi uid, lo que además obligaba al
      // espectador a re-trackear en cada cambio de POV — eso desconectaba el
      // canal, ver GroupSpectate). Ahora el espectador trackea su presencia
      // UNA sola vez y no toca nada más al cambiar de POV.
      .on('presence', { event: 'sync' }, () => {
        try { _applySpectatorBadge(); } catch (e) {}
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        try { await _channel.track({ uid: uid, t: Date.now() }); } catch (e) {}
        // Dar 5s para que todos los conectados trackeen presencia, luego purgar ausentes
        const snapLobbyId = _lobbyId;
        setTimeout(async () => {
          if (!_channel || _lobbyId !== snapLobbyId || window._lobbyActive) return;
          const state = _channel.presenceState();
          const presentIds = new Set(Object.values(state).flat().map(p => p.uid).filter(Boolean));
          if (!presentIds.size) return; // presencia todavía no recibida
          // Excluir a quien se unió hace muy poco (< 10s): su presencia puede
          // no haber llegado TODAVÍA a la foto de este cliente en particular
          // (propagación no es instantánea, y este chequeo puede dispararse
          // por una re-suscripción de ESTE cliente —p.ej. al volver de 2do
          // plano— justo mientras alguien más recién se está uniendo) — sin
          // este margen, un amigo que entraba en ese instante podía quedar
          // marcado "ausente" y ser expulsado de la sala casi al segundo de
          // haber entrado (reportado).
          const now = Date.now();
          const absent = _members.filter(m => {
            if (m.id === uid || presentIds.has(m.id)) return false;
            const joinedMs = m.joined_at ? new Date(m.joined_at).getTime() : 0;
            return !joinedMs || (now - joinedMs) > 10000;
          });
          if (!absent.length) return;
          await Promise.all(absent.map(m =>
            Promise.resolve(window.sb.from('lobby_members').delete()
              .eq('lobby_id', snapLobbyId).eq('user_id', m.id)).catch(() => {})
          ));
          _fetchMembers();
        }, 5000);
      });
  }

  // Limpieza por desconexión (refresh/cierre de pestaña) durante la espera.
  const GRACE_MS = 5000;
  // Margen más largo específico para un 'leave' DURANTE la partida (ver el
  // handler de presence 'leave' más arriba) — tiene que sobrevivir el
  // throttling típico de una pestaña minimizada reconectando su WebSocket de
  // Realtime, no solo la carrera de red del broadcast 'expectleave'.
  const ACTIVE_GAME_GRACE_MS = 8000;
  const _graceTimers = {};
  async function _handleMemberGone(goneId) {
    delete _graceTimers[goneId];
    if (window._lobbyActive) { _pendingKicks.add(goneId); return; } // presence.leave ya lo manejó
    if (!_lobbyId) return;
    if (!_lobby || _lobby.status !== 'waiting') return;
    // No expulsar en plena cuenta regresiva de arranque (sendCountdown, 10s
    // antes de pasar a 'active') — un simple blip de presencia (wifi,
    // pestaña que pasa a 2do plano y throttlea el heartbeat) de apenas más
    // de GRACE_MS bastaba para que el host lo borrara de lobby_members DE
    // VERDAD aunque su conexión real estuviera bien y volviera enseguida
    // (el "me kickeó de la nada en plena cuenta regresiva" reportado).
    // Reintentar el mismo chequeo más adelante en vez de decidir ahora —
    // cuando la cuenta termine (arranca la partida → _lobbyActive lo agarra
    // arriba; o se cancela → vuelve al flujo normal de espera) esto se
    // resuelve solo con el criterio de siempre.
    if (window._lobbyCountingDown) {
      _graceTimers[goneId] = setTimeout(() => _handleMemberGone(goneId), GRACE_MS);
      return;
    }
    if (Date.now() - _resubTime < 9000) return;            // ignorar drops falsos post-resubscripción
    // Si el miembro tiene presencia activa, se reingresó antes de expirar el timer → no expulsar
    if (_channel) {
      const ps = _channel.presenceState?.() || {};
      if (ps[goneId] && ps[goneId].length > 0) return;
    }
    const present = _members.map(m => m.id);
    if (!present.includes(goneId)) return;                  // ya no estaba (otro proceso lo eliminó)
    if (goneId === _hostId) {
      // Se fue el HOST: lo promueve el miembro vivo que se unió primero (excluyendo al ido).
      const heir = _members.filter(m => m.id !== goneId)[0];
      if (heir && heir.id === _myId()) {
        try {
          await window.sb.from('lobbies').update({ host_id: _myId() }).eq('id', _lobbyId);
          await window.sb.from('lobby_members').delete().eq('lobby_id', _lobbyId).eq('user_id', goneId);
        } catch (e) {}
      } else if (!heir) {
        // no queda nadie vivo → cerrar (lo intenta cualquiera)
        try { await window.sb.from('lobbies').update({ status: 'closed' }).eq('id', _lobbyId); } catch (e) {}
      }
    } else if (isHost()) {
      // Se fue un miembro normal: lo saca el host.
      try {
        await window.sb.from('lobby_members').delete().eq('lobby_id', _lobbyId).eq('user_id', goneId);
        _fetchMembers(); // forzar re-render inmediato sin esperar postgres_changes
      } catch (e) {}
    }
  }

  // Borra/cierra salas abandonadas:
  //  • las mías anteriores "waiting" (un host = máx. 1 sala en espera)
  //  • cualquier "waiting" global con más de 2h sin empezar
  //  • cualquier "active" global con más de 45 min (partida zombie por cierre de pestaña)
  async function _cleanupStale() {
    const uid = _myId();
    const cutoff30m = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const cutoff45m = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    try {
      // Borrar salas propias viejas — el RLS siempre lo permite
      if (uid) {
        let q = window.sb.from('lobbies').delete().eq('host_id', uid).in('status', ['waiting', 'closed', 'active']);
        if (_lobbyId) q = q.neq('id', _lobbyId);
        await q;
        // Borrar matches propios terminales (con el mismo cutoff de 30 min que el
        // fallback global de abajo, para no destruir el historial reciente apenas
        // se crea la próxima sala — los conteos de stats ya no dependen de esta
        // tabla, pero conviene no seguir siendo más agresivos de lo necesario).
        await window.sb.from('matches').delete().eq('player1_id', uid)
          .in('status', ['abandoned', 'declined', 'expired', 'finished', 'cancelled'])
          .lt('created_at', cutoff30m);
        await window.sb.from('matches').delete().eq('player2_id', uid)
          .in('status', ['abandoned', 'declined', 'expired', 'finished', 'cancelled'])
          .lt('created_at', cutoff30m);
      }
      // Intentar borrado global vía RPC (SECURITY DEFINER, bypasea RLS)
      try { await window.sb.rpc('cleanup_stale_lobbies'); } catch (_) {}
      // Fallback directo lobbies (puede fallar por RLS en salas ajenas)
      await window.sb.from('lobbies').delete().in('status', ['waiting', 'closed']).lt('created_at', cutoff30m);
      // Salas active muy viejas → cerrar
      await window.sb.from('lobbies').update({ status: 'closed' }).eq('status', 'active').lt('created_at', cutoff45m);
      // Matches terminales o active muy viejos (global, puede fallar por RLS)
      await window.sb.from('matches').delete()
        .in('status', ['abandoned', 'declined', 'expired', 'finished', 'cancelled'])
        .lt('created_at', cutoff30m);
      await window.sb.from('matches').update({ status: 'abandoned' })
        .eq('status', 'active').lt('created_at', cutoff45m);
    } catch (e) {}
  }

  async function create(isPublic) {
    const uid = _myId();
    if (!uid) throw new Error('not logged in');
    await _cleanupStale();
    const { data, error } = await window.sb.from('lobbies')
      .insert({ host_id: uid, code: _genCode(), is_public: !!isPublic, mode: 'flags', status: 'waiting', max_players: 10 })
      .select().single();
    if (error) throw error;
    _lobbyId = data.id; _hostId = uid; _lobby = data; _seed = null;
    await window.sb.from('lobby_members').insert({ lobby_id: _lobbyId, user_id: uid, score: 0 });
    // No guardamos nombre localizado en DB: se construye desde i18n al mostrar (lobby.roomName)
    _subscribe();
    await _fetchMembers();
    return data;
  }

  // Restaura una sala en espera de la que sigo siendo miembro (tras recargar/volver).
  async function restoreActive() {
    const uid = _myId();
    if (!uid || _lobbyId) return null;
    const { data, error } = await window.sb.from('lobby_members')
      .select('lobby_id, l:lobby_id(*)').eq('user_id', uid).limit(10);
    if (error) return null;
    const row = (data || []).find(r => r.l && r.l.status === 'waiting');
    if (!row) return null;
    const lobby = row.l;
    _lobbyId = lobby.id; _hostId = lobby.host_id; _lobby = lobby; _seed = null;
    _subscribe();
    await _fetchMembers();
    return lobby;
  }

  // Al (re)iniciar sesión: limpiar salas en espera que hosteaba en una sesión previa
  // (p. ej. refresqué la web). Si tenían gente, transfiero el host; si no, cierro.
  async function cleanupMine() {
    const uid = _myId();
    if (!uid) return;
    try {
      const { data: hosted } = await window.sb.from('lobbies')
        .select('id').eq('host_id', uid).eq('status', 'waiting');
      for (const lob of (hosted || [])) {
        const { data: mems } = await window.sb.from('lobby_members')
          .select('user_id, joined_at').eq('lobby_id', lob.id).order('joined_at');
        const others = (mems || []).filter(m => m.user_id !== uid);
        if (others.length) await window.sb.from('lobbies').update({ host_id: others[0].user_id }).eq('id', lob.id);
        else               await window.sb.from('lobbies').update({ status: 'closed' }).eq('id', lob.id);
        await window.sb.from('lobby_members').delete().eq('lobby_id', lob.id).eq('user_id', uid);
      }
    } catch (e) {}
  }

  async function setPublic(isPublic) {
    if (!isHost() || !_lobbyId) return;
    try {
      await window.sb.from('lobbies').update({ is_public: !!isPublic }).eq('id', _lobbyId);
      if (_lobby) _lobby.is_public = !!isPublic;
      sendVisibility(!!isPublic);
      _sendRoomUpdate({ id: _lobbyId });
    } catch (e) {}
  }
  function isPublic() { return !!(_lobby && _lobby.is_public); }

  async function setName(name) {
    if (!isHost() || !_lobbyId) return;
    try {
      await window.sb.from('lobbies').update({ name: name }).eq('id', _lobbyId);
      if (_lobby) _lobby.name = name;
      sendName(name);
      _sendRoomUpdate({ id: _lobbyId, name });
    } catch (e) {}
  }
  function getName() { return (_lobby && _lobby.name) || ''; }

  async function joinByCode(code) {
    if (!_myId()) throw new Error('not logged in');
    const { data, error } = await window.sb.from('lobbies')
      .select('*').eq('code', (code || '').toUpperCase())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) throw new Error('not_found');
    if (data.status !== 'waiting') throw new Error('started');
    return _joinLobby(data);
  }

  async function joinById(id) {
    const { data, error } = await window.sb.from('lobbies')
      .select('*').eq('id', id).eq('status', 'waiting').maybeSingle();
    if (error || !data) throw new Error('not found');
    return _joinLobby(data);
  }

  async function _joinLobby(lobby) {
    const uid = _myId();
    const { count } = await window.sb.from('lobby_members')
      .select('*', { count: 'exact', head: true }).eq('lobby_id', lobby.id);
    if (count != null && count >= (lobby.max_players || 10)) throw new Error('full');
    _lobbyId = lobby.id; _hostId = lobby.host_id; _lobby = lobby; _seed = null;
    await window.sb.from('lobby_members').upsert({ lobby_id: lobby.id, user_id: uid, score: 0 });
    _subscribe();
    await _fetchMembers();
    return lobby;
  }

  async function leave() {
    const uid = _myId();
    const lid = _lobbyId;
    if (!lid) return;
    const wasHost = isHost();
    // El que se unió primero entre los que quedan (los miembros vienen por joined_at)
    const heir = _members.filter(m => m.id !== uid)[0] || null;
    cleanup(); // limpiar el estado local YA: oculta "Mi sala" sin esperar a la red
    try {
      if (wasHost) {
        if (heir) await window.sb.from('lobbies').update({ host_id: heir.id }).eq('id', lid); // transferir host
        else      await window.sb.from('lobbies').update({ status: 'closed' }).eq('id', lid);  // sala vacía → cerrar
      }
      await window.sb.from('lobby_members').delete().eq('lobby_id', lid).eq('user_id', uid);
    } catch (e) {}
  }

  // Transferir el host a otro miembro (manual, botón 👑)
  async function transferHost(userId) {
    if (!isHost() || !_lobbyId || userId === _myId()) return;
    try {
      await window.sb.from('lobbies').update({ host_id: userId }).eq('id', _lobbyId);
      _hostId = userId; if (_lobby) _lobby.host_id = userId;
      _fetchMembers();
    } catch (e) {}
  }

  async function kick(userId) {
    if (!isHost() || !_lobbyId) return;
    try { await window.sb.from('lobby_members').delete().eq('lobby_id', _lobbyId).eq('user_id', userId); } catch (e) {}
    _fetchMembers();
  }

  async function start() {
    if (!isHost() || !_lobbyId) return;
    if (_members.length < 2) return; // hace falta al menos 2
    const seed = Math.floor(Math.random() * 1_000_000);
    await window.sb.from('lobbies').update({ status: 'active', seed }).eq('id', _lobbyId);
    _sendRoomUpdate({ id: _lobbyId, started: true });
    // El propio host arranca por el realtime UPDATE, igual que el resto.
  }

  async function reportScore(score) {
    if (!_lobbyId) return;
    try { await window.sb.from('lobby_members').update({ score }).eq('lobby_id', _lobbyId).eq('user_id', _myId()); } catch (e) {}
  }

  // Cuenta los espectadores GLOBALES (claves de presencia 'spectator-*') y
  // aplica el badge de "te están espectando". Se llama en cada 'sync' de
  // presence Y explícitamente al arrancar cada modo (refreshSpectatorCount,
  // más abajo) — porque refreshVsSpectatorBadge apunta al badge del modo
  // ACTIVO, y en una transición de modo no hay ningún 'sync' que lo vuelva a
  // aplicar, así que el badge del modo nuevo arrancaba apagado aunque hubiera
  // espectadores (reportado, "en cada transición se les quita el símbolo").
  function _applySpectatorBadge() {
    if (!_channel) return;
    const state = _channel.presenceState();
    let n = 0;
    Object.keys(state).forEach(k => { if (k.indexOf('spectator-') === 0) n++; });
    if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(n);
  }

  // ── Broadcast efímero (cuenta regresiva / no estoy listo) ──────────────────────
  function _bcast(event, payload) {
    // Devuelve la promesa de send() (en vez de fire-and-forget) — necesario
    // para markExpectedLeave/'expectleave', que tiene que terminar de
    // encolarse en el socket ANTES de que releaseChannel() lo desuscriba
    // (ver comentario largo ahí). Para el resto de los usos de _bcast (que
    // nunca esperan el resultado), no cambia nada.
    if (_channel) { try { return _channel.send({ type: 'broadcast', event, payload: payload || {} }); } catch (e) { return Promise.resolve(); } }
    return Promise.resolve();
  }
  function sendCountdown(until) { _bcast('cd', { until }); }
  function sendCancel()         { _bcast('cancel'); }
  function sendNotReady(name)   { _bcast('notready', { name }); }
  function sendWrong()          { _bcast('wrong', { uid: _myId() }); }
  function sendVisibility(pub)  { _bcast('visibility', { isPublic: !!pub }); }
  function sendName(name)       { _bcast('name', { name }); }
  function sendFinished(score)  { _bcast('finished', { uid: _myId(), score }); }
  function sendReveal(revealAt, isFinal) { _bcast('reveal', { revealAt, isFinal: !!isFinal }); }
  function sendScore(score)     { _bcast('lbscore',  { uid: _myId(), score }); }
  function sendModes(modes, changed = true) { _bcast('modes', { modes, mode: modes && modes.length > 1 ? modes.join('+') : ((modes && modes[0]) || 'flags'), changed: !!changed }); }

  // ── Estado en vivo persistido (ver group_live_state.sql) ────────────────────
  // Mismo mecanismo que _persistLiveState en vs.js (1v1): sin esto, un
  // espectador que recién se conecta a GroupSpectate O que cambia de POV con
  // las flechas no tenía forma de saber en qué fase está CADA miembro hasta
  // que le llegara su PRÓXIMO broadcast en vivo — se quedaba viendo nada/lo
  // viejo hasta que esa persona hiciera algo (el "recién funciona cuando
  // cometen una acción, tiene que ser al instante como en el 1v1" reportado).
  let _lastPhase          = null; // 'round' | 'pregame' | 'postgame' | 'splash' | 'timesup'
  let _lastRoundPayload   = null;
  let _lastPregamePayload = null;
  let _lastPostgamePayload = null;
  // Separado de _lastPhase a propósito — ver comentario largo en
  // _persistLiveState. sendPostgame() TAMBIÉN se usa para el ranking de
  // TODA la sala (kind:'intermediate'/'final', ver _showLobbyResult), que se
  // manda DESPUÉS de mi propio sendTimesUp() — si "finished" saliera de
  // `_lastPhase === 'timesup'` en cada persistencia, ESE sendPostgame
  // posterior pisaba _lastPhase a 'postgame' y el finished:true recién
  // guardado volvía a false en la DB, justo cuando el poll de respaldo
  // (_startGroupWaitPoll en lobby.js) más lo necesitaba — el "se quedan
  // congelados, nunca sale el panel" seguía pasando incluso con el poll ya
  // agregado.
  let _finishedFlag = false;
  function _persistLiveState() {
    if (!_lobbyId) return;
    // finished:true es lo que le permite a GroupSpectate (spectate.js
    // _fetchMembers) Y al poll de respaldo (lobby.js) saber, desde una sola
    // consulta REST, que este miembro YA NO tiene nada que espectar hasta el
    // próximo modo — sin esto, si el broadcast efímero de 'timesup' se
    // perdía (ventana de reconexión al entrar/salir de espectar de prestado,
    // ver _enterGroupWaitAsSpectator en lobby.js), las flechas de otro
    // espectador seguían ofreciendo mirarlo indefinidamente (el "aun les
    // permite cambiar a POVs de gente que ya terminó" reportado).
    const snapshot = {
      phase: _lastPhase, round: _lastRoundPayload, pregame: _lastPregamePayload, postgame: _lastPostgamePayload,
      finished: _finishedFlag, ts: Date.now(),
    };
    window.sb.from('lobby_members').update({ live_state: snapshot }).eq('lobby_id', _lobbyId).eq('user_id', _myId()).then(() => {}, () => {});
  }

  // ── Broadcast ronda-a-ronda para GroupSpectate (ver _on* de más arriba) ────────
  // Mismo patrón que VS.reportRound/reportTick/etc (vs.js), pero taggeado por
  // uid en vez de role — cualquier miembro puede estar siendo mirado.
  function sendRound(payload)     { _lastPhase = 'round'; _lastRoundPayload = payload; _finishedFlag = false; _bcast('round', { uid: _myId(), ...(payload || {}) }); _persistLiveState(); }
  function sendTick(timeLeft)     { _bcast('gtick',      { uid: _myId(), timeLeft }); }
  function sendPregame(payload)   { _lastPhase = 'pregame'; _lastPregamePayload = payload || {}; _finishedFlag = false; _bcast('pregame', { uid: _myId(), ...(payload || {}) }); _persistLiveState(); }
  // NO toca _finishedFlag — ver comentario largo más arriba (sendPostgame
  // también transporta el ranking de sala, que se manda DESPUÉS de terminar).
  function sendPostgame(payload)  {
    _lastPhase = 'postgame'; _lastPostgamePayload = payload;
    const full = { uid: _myId(), ...(payload || {}) };
    _bcast('postgame', full);
    _persistLiveState();
    // El ranking de sala (kind intermediate/final) es lo ÚNICO que le dice al
    // espectador EXTERNO que muestre la tabla — y lo recibe por un solo
    // broadcast. Si el canal del espectador tenía un blip justo en ese
    // instante, lo perdía y se quedaba CONGELADO sin tabla (reportado, "esa
    // vez no se le mostró"). Los jugadores no dependen de esto (calculan su
    // resultado local). Reenviarlo un par de veces más sube muchísimo la
    // probabilidad de que llegue, sin lógica de fallback compleja.
    if (payload && (payload.kind === 'intermediate' || payload.kind === 'final')) {
      setTimeout(() => _bcast('postgame', full), 500);
      setTimeout(() => _bcast('postgame', full), 1500);
    }
  }
  function sendAnswer(detail)     { _bcast('ganswer',    { uid: _myId(), ...(detail || {}) }); }
  function sendTimesUp()          { _lastPhase = 'timesup'; _finishedFlag = true; _bcast('timesup', { uid: _myId() }); _persistLiveState(); }
  function sendSplash(payload)    { _lastPhase = 'splash'; _finishedFlag = false; _bcast('splash', { uid: _myId(), ...(payload || {}) }); _persistLiveState(); }
  function sendAdvancing()        { _bcast('advancing', { uid: _myId() }); }

  async function setModes(modes) {
    if (!isHost() || !_lobbyId) return;
    const mode = (modes && modes[0]) || 'flags';
    // Codificar la lista en `mode` como "flags+shapes" — persiste aunque no exista columna `modes`
    const modeEncoded = modes && modes.length > 1 ? modes.join('+') : mode;
    // Supabase devuelve { error } en vez de lanzar excepción — hay que chequearlo explícitamente
    const { error } = await window.sb.from('lobbies').update({ mode: modeEncoded, modes }).eq('id', _lobbyId);
    if (error) {
      // Columna `modes` no existe (42703) u otro error → solo actualizar `mode`
      await window.sb.from('lobbies').update({ mode: modeEncoded }).eq('id', _lobbyId);
    }
    // Estado local y broadcast siempre, aunque el DB falle
    if (_lobby) { _lobby.mode = modeEncoded; _lobby.modes = modes; }
    sendModes(modes);
    _sendRoomUpdate({ id: _lobbyId });
  }

  function getModes() {
    if (!_lobby) return ['flags'];
    if (_lobby.modes) {
      const arr = Array.isArray(_lobby.modes) ? _lobby.modes : String(_lobby.modes).split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) return arr;
    }
    if (!_lobby.mode) return ['flags'];
    if (_lobby.mode.includes('+')) return _lobby.mode.split('+').map(s => s.trim()).filter(Boolean);
    return [_lobby.mode];
  }

  // ── Invitación push a un amigo (broadcast a su canal personal) ──────────────────
  function sendInvite(toUser, payload) {
    if (!toUser) return;
    const ch = window.sb.channel('lobbyinv-' + toUser);
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'invite', payload: payload || {} })
          .finally(() => setTimeout(() => { try { ch.unsubscribe(); } catch (e) {} }, 1500));
      }
    });
  }

  let _inviteChannel = null;
  function listenForInvites(onInvite) {
    const uid = _myId();
    if (!uid) return;
    if (_inviteChannel) _inviteChannel.unsubscribe();
    _inviteChannel = window.sb.channel('lobbyinv-' + uid)
      .on('broadcast', { event: 'invite' }, ({ payload }) => { if (onInvite) onInvite(payload || {}); })
      .subscribe();
  }

  async function listPublic() {
    _cleanupStale().catch(() => {}); // cerrar salas zombie en segundo plano
    let lobbies = null, error = null;
    ({ data: lobbies, error } = await window.sb.from('lobbies')
      .select('id, code, name, host_id, max_players, mode, modes, created_at')
      .eq('is_public', true).eq('status', 'waiting')
      .order('created_at', { ascending: false }).limit(30));
    // Fallback: si alguna columna no existe en el schema
    if (error && error.code === '42703') {
      ({ data: lobbies, error } = await window.sb.from('lobbies')
        .select('id, code, host_id, max_players, mode, created_at')
        .eq('is_public', true).eq('status', 'waiting')
        .order('created_at', { ascending: false }).limit(30));
    }
    if (error) { console.warn('[LB] listPublic:', error.message); return []; }
    if (!lobbies || !lobbies.length) return [];
    const ids = lobbies.map(l => l.id);
    const counts = {};
    const hostNames = {};
    try {
      const { data: mems } = await window.sb.from('lobby_members').select('lobby_id').in('lobby_id', ids);
      (mems || []).forEach(m => { counts[m.lobby_id] = (counts[m.lobby_id] || 0) + 1; });
    } catch (e) {}
    try {
      const hostIds = [...new Set(lobbies.map(l => l.host_id))];
      const { data: hosts } = await window.sb.from('profiles').select('id, username').in('id', hostIds);
      (hosts || []).forEach(h => { hostNames[h.id] = h.username; });
    } catch (e) {}
    const result = lobbies.map(l => ({
      id: l.id, code: l.code, name: l.name ?? '',
      hostName: hostNames[l.host_id] || '?',
      count: counts[l.id] || 0,
      max: l.max_players || 10,
      mode: l.mode || 'flags', modes: l.modes || null,
    }));
    // Borrar salas vacías (todos se desconectaron sin cerrar) de forma silenciosa
    const emptyIds = result.filter(l => l.count === 0).map(l => l.id);
    if (emptyIds.length) Promise.resolve(window.sb.from('lobbies').delete().in('id', emptyIds)).catch(() => {});
    return result.filter(l => l.count > 0 && l.count < l.max);
  }

  function cleanup() {
    window._lobbyCountingDown = false;
    if (_memberProfilesChannel) { try { window.sb.removeChannel(_memberProfilesChannel); } catch (e) {} _memberProfilesChannel = null; }
    if (_channel) { try { window.sb.removeChannel(_channel); } catch (e) {} _channel = null; }
    if (_publicSignalCh) { try { window.sb.removeChannel(_publicSignalCh); } catch(e) {} _publicSignalCh = null; _publicSignalChReady = false; }
    Object.values(_graceTimers).forEach(clearTimeout);
    for (const k in _graceTimers) delete _graceTimers[k];
    _pendingKicks.clear();
    _aloneCalledThisGame = false;
    _lobbyId = _hostId = _lobby = _seed = null;
    _members = [];
    _onMembers = _onStart = _onClosed = _onCountdown = _onCancel = _onNotReady = _onWrong = _onVisibility = _onName = _onModes = _onFinished = _onScore = _onPlayerGone = _onPlayerBack = _onAlone = null;
  }

  // Libera SOLO la conexión realtime de este cliente al canal 'lobby-{id}',
  // sin tocar _lobbyId/_members/etc — usado por _enterGroupWaitAsSpectator
  // (lobby.js) antes de que GroupSpectate.watch() se suscriba al MISMO tema
  // desde este mismo cliente: Supabase Realtime no deja dos canales
  // suscriptos al mismo tema desde el mismo cliente (mismo motivo que
  // VS.releaseChannel en vs.js, 1v1). resubscribeChannel() ya existente es
  // la contraparte para recuperar la conexión al volver.
  async function releaseChannel() {
    if (_channel) {
      const ch = _channel;
      _channel = null;
      try { await window.sb.removeChannel(ch); } catch (e) {}
    }
  }

  // Ver comentario largo en _expectedLeaves — llamar SIEMPRE justo antes de
  // releaseChannel() cuando el motivo es "voy a espectar de prestado", no un
  // abandono real. _expectedLeaves es una variable LOCAL de cada cliente —
  // agregar acá el propio uid no le sirve de nada a los DEMÁS clientes, que
  // son los que en realidad van a recibir y evaluar MI 'leave' de presence.
  // Por eso esto también broadcastea el aviso: todos (incluido yo mismo,
  // broadcast self:true) lo agregan a su propio _expectedLeaves antes de que
  // llegue el 'leave' real — sin este broadcast, cada jugador que entraba a
  // espectar de prestado hacía que el que quedaba jugando viera "todos
  // abandonaron la partida" (el _onAlone disparándose en falso, reportado).
  // Async a propósito: el broadcast tiene que terminar de encolarse en el
  // socket ANTES de que quien llama a esto pase a releaseChannel() —
  // marcado con `await` (ver _enterGroupWaitAsSpectator en lobby.js). Antes
  // era fire-and-forget: si el broadcast todavía no había salido cuando el
  // canal se desuscribía un instante después (síncrono, la línea
  // siguiente), el aviso se perdía en silencio — los DEMÁS clientes nunca
  // agregaban este uid a su propio _expectedLeaves, así que veían su 'leave'
  // de presence como un abandono REAL. Con varios jugadores terminando casi
  // juntos (todos entrando a espectar de prestado a la vez, ver el margen de
  // 600ms en _lobbyHandleGameEnd), esta carrera se perdía para varios a la
  // vez — inflando _pendingKicks de más, lo que corrompía el total de
  // _checkAllFinished (o directamente disparaba el "quedé solo" de
  // _onAlone, tapando toda la partida) — el "no salieron los paneles a
  // nadie" reportado.
  async function markExpectedLeave(memberUid) {
    _expectedLeaves.add(memberUid);
    await _bcast('expectleave', { uid: memberUid });
  }

  return {
    create, joinByCode, joinById, leave, kick, start, reportScore, listPublic, cleanup, releaseChannel, markExpectedLeave,
    sendCountdown, sendCancel, sendNotReady, sendWrong, sendVisibility, sendName, sendFinished, sendReveal, sendScore, setPublic, isPublic, restoreActive, transferHost, cleanupMine,
    sendRound, sendTick, sendPregame, sendPostgame, sendAnswer, sendTimesUp, sendSplash, sendAdvancing,
    sendInvite, listenForInvites, setName, getName, setModes, getModes, sendModes,
    isHost, getMembers, getLobby, getCode, getId, getSeed,
    refreshMembers: () => _fetchMembers(),
    // _subscribe() por sí sola solo vuelve a ESCUCHAR cambios futuros — no trae
    // los que pasaron MIENTRAS el canal estaba suelto (ver releaseChannel,
    // usado por _enterGroupWaitAsSpectator). Sin este _fetchMembers() acá, el
    // que volvía de "espectar de prestado" seguía viendo el score de sus
    // rivales congelado en lo que era ANTES de soltar el canal (ej. a mitad
    // de la ronda que estaba mirando) — quedaba pegado así hasta el próximo
    // cambio real en lobby_members, que podía no llegar antes de arrancar el
    // siguiente modo (el "puntaje y cards en 0 al entrar al modo siguiente"
    // reportado).
    resubscribeChannel: () => { if (_lobbyId) { _subscribe(); _fetchMembers(); } },
    refreshSpectatorCount: () => { try { _applySpectatorBadge(); } catch (e) {} },
    getPendingKicksCount: () => _pendingKicks.size,
    clearPendingKicks: () => { _pendingKicks.clear(); },
    processPendingKicks: async () => {
      if (_pendingKicks.size && isHost()) {
        const toKick = new Set(_pendingKicks);
        _pendingKicks.clear();
        const lid = _lobbyId;
        toKick.forEach(async uid => {
          try { await window.sb.from('lobby_members').delete().eq('lobby_id', lid).eq('user_id', uid); } catch (e) {}
        });
        setTimeout(() => _fetchMembers(), 500);
      } else { _pendingKicks.clear(); }
    },
    resetToWaiting: async () => {
      if (!_lobbyId || !_myId()) return;
      try {
        await window.sb.from('lobbies')
          .update({ status: 'waiting', seed: null })
          .eq('id', _lobbyId)
          .eq('host_id', _myId());
        if (_lobby) { _lobby.status = 'waiting'; _lobby.seed = null; }
      } catch (e) { console.warn('[LB] resetToWaiting failed:', e); }
    },
    onMembers:   cb => { _onMembers = cb; },
    onStart:     cb => { _onStart = cb; },
    onClosed:    cb => { _onClosed = cb; },
    onCountdown: cb => { _onCountdown = cb; },
    onCancel:    cb => { _onCancel = cb; },
    onNotReady:  cb => { _onNotReady = cb; },
    onWrong:      cb => { _onWrong = cb; },
    onVisibility: cb => { _onVisibility = cb; },
    onName:       cb => { _onName = cb; },
    onModes:      cb => { _onModes = cb; },
    onFinished:   cb => { _onFinished = cb; },
    onReveal:     cb => { _onReveal = cb; },
    onScore:      cb => { _onScore = cb; },
    onPlayerGone: cb => { _onPlayerGone = cb; },
    onPlayerBack: cb => { _onPlayerBack = cb; },
    onAlone:      cb => { _onAlone = cb; if (cb) _aloneCalledThisGame = false; },
    resetAloneGuard: () => { _aloneCalledThisGame = false; },
    onRound:      cb => { _onRound = cb; },
    onTick:       cb => { _onTick = cb; },
    onPregame:    cb => { _onPregame = cb; },
    onPostgame:   cb => { _onPostgame = cb; },
    onAnswer:     cb => { _onAnswer = cb; },
    onTimesUp:    cb => { _onTimesUp = cb; },
    onSplash:     cb => { _onSplash = cb; },
    onAdvancing:  cb => { _onAdvancing = cb; },
  };
})();

// ── UI + integración de juego ────────────────────────────────────────────────────
window.Lobby = (() => {
  const T = (k, d) => (typeof t === 'function' ? t(k) : d);

  // ── Roster del lobby ──────────────────────────────────────────────────────────
  function _buildMemberRow(m, host, myId) {
    const row = document.createElement('div');
    row.className = 'lobby-member-row' + (m.isHost ? ' is-host' : '') + (m.id !== myId ? ' clickable' : '') + (m.is_playing ? ' is-playing' : '')
      + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(m.cellCode) ? ' cell-light-text' : '');
    row.dataset.memberId = m.id;
    row.innerHTML =
      `<div class="lobby-member-avatar-wrap"><img class="lobby-member-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false"></div>` +
      `<span class="lobby-member-name">${m.name}${m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : ''}</span>` +
      (m.isHost    ? `<span class="lobby-member-badge">${T('lobby.host', 'HOST')}</span>` : '') +
      (m.is_playing ? `<span class="lobby-member-playing-badge">${T('social.playing', 'Jugando')}</span>` : '') +
      ((host && !m.isHost) ? `<button class="lobby-host-btn" data-id="${m.id}" title="${T('lobby.makeHost', 'Hacer host')}">👑</button>` : '') +
      ((host && !m.isHost) ? `<button class="lobby-kick-btn" data-id="${m.id}" title="${T('lobby.kick', 'Expulsar')}">✕</button>` : '');
    // Marco real de cada miembro (aro de la pfp) + celda real de fondo de la
    // fila. applyCellForStatus (no applyCell) para que titile con la
    // variante -green mientras is_playing, igual que en el panel de "Retar"/
    // invitar.
    window.CustomizeAssets?.applyFrame(row.querySelector('.lobby-member-avatar-wrap'), m.frameCode || '0001');
    window.CustomizeAssets?.applyCellForStatus(row, m.cellCode || '0001', m.is_playing ? 'playing' : 'online');
    if (m.id !== myId) {
      row.addEventListener('click', async e => {
        if (e.target.closest('.lobby-kick-btn, .lobby-host-btn')) return;
        if (typeof window.openFriendProfile !== 'function' || !window.sbGetProfile) return;
        try {
          const p = await window.sbGetProfile(m.id);
          window.openFriendProfile({
            id: p.id,
            name: p.username || m.name,
            avatar: p.avatar_url || m.avatar || 'images/profilepic/ppdefault.png',
            score: p.hs_total || ((p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0)),
            play_count: p.play_count || 0,
            vs_wins: p.vs_wins || 0,
            vs_losses: p.vs_losses || 0,
            hs_flags: p.hs_flags || 0,
            hs_shapes: p.hs_shapes || 0,
            hs_cities: p.hs_cities || 0,
            hs_monuments: p.hs_monuments || 0,
            last_active: p.last_active || null,
            is_playing: p.is_playing || false,
            frameCode: p.frame_code || '0001',
          });
        } catch (err) {
          console.warn('[lobby] no se pudo abrir perfil:', err);
        }
      });
    }
    const kickBtn = row.querySelector('.lobby-kick-btn');
    if (kickBtn) kickBtn.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.LB.kick(kickBtn.dataset.id);
    });
    const hostBtn = row.querySelector('.lobby-host-btn');
    if (hostBtn) hostBtn.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.LB.transferHost(hostBtn.dataset.id);
      if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.hostTransferred', 'Host transferido'));
    });
    return row;
  }
  function _renderMembers(members) {
    const list = document.getElementById('lobby-members');
    if (!list) return;
    const host = window.LB.isHost();
    const myId = window._sbUserId;

    // Actualizar caché de nombres antes de comparar (para recuperar nombres de quienes salgan)
    members.forEach(m => { if (m.id && m.name) _memberNameCache[m.id] = m.name; });

    // Detectar quién entró/salió respecto al render anterior
    if (_prevMemberIds.length > 0 && typeof window.showVersusToast === 'function') {
      const newIds  = members.map(m => m.id);
      const joined  = members.filter(m => !_prevMemberIds.includes(m.id) && m.id !== myId);
      const leftIds = _prevMemberIds.filter(id => !newIds.includes(id) && id !== myId);
      joined.forEach(m => {
        window.showVersusToast((m.name || '?') + ' ' + T('lobby.memberJoined', 'se unió a la sala'));
        delete _inviteCooldowns[m.id]; // se unió → habilitar re-invitación si se va
      });
      leftIds.forEach(id => {
        const name = _memberNameCache[id] || T('lobby.someone', 'Alguien');
        window.showVersusToast(name + ' ' + T('lobby.memberLeft', 'salió de la sala'));
      });
      // Si alguien entra o sale durante la cuenta regresiva, el host la cancela para todos
      if (_counting && window.LB.isHost() && (leftIds.length > 0 || joined.length > 0)) {
        window.LB.sendCancel();
      }
      // El host re-emite los modos cuando entra alguien nuevo, por si el guest
      // se unió tarde y perdió el broadcast original.
      if (joined.length > 0 && window.LB.isHost()) {
        const modes = window.LB.getModes();
        if (modes.length > 1 || modes[0] !== 'flags') window.LB.sendModes(modes, false);
      }
    }
    _prevMemberIds = members.map(m => m.id);

    // Diff incremental (no list.innerHTML='' + reconstruir todo) — mismo fix
    // que _renderOnlineFriends (js/vs.js): esta lista se re-renderiza sola
    // seguido (cada cambio de score/is_playing/presence de CUALQUIER
    // miembro), y recrear el nodo DOM de una fila reinicia su animación CSS
    // desde 0% aunque nada haya cambiado en ESA fila puntual — el "titilo
    // verde se reinicia cada rato random" reportado.
    const hostChanged = host !== _prevHostFlag;
    _prevHostFlag = host;
    const existingRows = hostChanged ? new Map() : new Map(
      Array.from(list.querySelectorAll('.lobby-member-row[data-member-id]')).map(el => [el.dataset.memberId, el])
    );
    if (hostChanged) list.innerHTML = ''; // los botones host/kick dependen de "host" global, no de esta fila puntual

    let prevEl = null;
    members.forEach(m => {
      const key = String(m.id);
      let row = existingRows.get(key);
      if (row) {
        existingRows.delete(key);
        const samePlaying = row.classList.contains('is-playing') === !!m.is_playing;
        const sameHostBadge = row.classList.contains('is-host') === !!m.isHost;
        if (samePlaying && sameHostBadge) {
          // Solo actualizar lo que puede cambiar sin afectar clases/animación.
          const nameEl = row.querySelector('.lobby-member-name');
          const wantedName = m.name + (m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : '');
          if (nameEl && nameEl.textContent !== wantedName) nameEl.textContent = wantedName;
          const avatarEl = row.querySelector('.lobby-member-avatar');
          if (avatarEl && avatarEl.src !== m.avatar) avatarEl.src = m.avatar;
          const wantsLightText = !!window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(m.cellCode);
          row.classList.toggle('cell-light-text', wantsLightText);
          window.CustomizeAssets?.applyFrame(row.querySelector('.lobby-member-avatar-wrap'), m.frameCode || '0001');
          window.CustomizeAssets?.applyCellForStatus(row, m.cellCode || '0001', m.is_playing ? 'playing' : 'online');
        } else {
          // Transición real (empezó/dejó de jugar, o cambió el host) — acá
          // sí corresponde recrear, las clases/botones cambian de verdad.
          const fresh = _buildMemberRow(m, host, myId);
          list.replaceChild(fresh, row);
          row = fresh;
        }
      } else {
        row = _buildMemberRow(m, host, myId);
        list.appendChild(row);
      }
      // Reordenar sin recrear: insertBefore de un nodo YA EN EL DOM no
      // reinicia sus animaciones CSS.
      const wantedNext = prevEl ? prevEl.nextSibling : list.firstChild;
      if (wantedNext !== row) list.insertBefore(row, wantedNext);
      prevEl = row;
    });
    existingRows.forEach(el => el.remove()); // miembros que ya no están
    // Contador y estado del botón empezar
    const cnt = document.getElementById('lobby-count');
    if (cnt) cnt.textContent = members.length + '/10';
    const anyPlaying = members.some(m => m.is_playing);
    const startBtn = document.getElementById('lobby-start-btn');
    if (startBtn) {
      const blocked = members.length < 2 || anyPlaying;
      startBtn.disabled = blocked;
      startBtn.classList.toggle('disabled', blocked);
      startBtn.title = anyPlaying ? T('lobby.someoneIsPlaying', 'A member is currently in a game') : '';
    }
    // Cancelar cuenta regresiva si algún miembro inicia una partida durante ella
    if (_counting && window.LB.isHost() && anyPlaying) {
      window.LB.sendCancel();
    }
    // Mostrar los botones según haya o no cuenta regresiva en curso
    _applyCountdownButtons(_counting);
    _refreshLobbyName();
    _updateVisibilityBtn();
    _updateInviteBtn();
    // Si el popup de invitar está abierto, refrescarlo para reflejar quién entró/salió
    const ip = document.getElementById('lobby-invite-popup');
    if (ip && ip.style.display !== 'none') _openInvitePopup();
  }

  // ── Estado multi-modo ─────────────────────────────────────────────────────────
  let _currentModeIdx  = 0;
  let _lobbyModes      = [];  // secuencia de modos para la sesión de juego actual
  let _baseSeed        = null;
  let _modeAccScore    = 0;   // puntaje acumulado de todos los modos del jugador local
  // La campaña de UN JUGADOR usa window.campaignBase (definida en monuments.js:
  // devuelve window.campaign.base). El modo grupo la PISA con () => _modeAccScore
  // mientras dura la partida de sala, y al terminar la restaura a ESTA función
  // original — antes la seteaba en null, DESTRUYENDO la de monuments.js, así que
  // después de un versus de grupo el campaign de un jugador se quedaba sin base
  // y el score se reiniciaba entre modos (reportado). Se captura la primera vez
  // que se pisa (ahí todavía es la de monuments.js).
  let _origCampaignBase = null;
  let _intermediateTimer = null;
  let _pendingModesOrder = []; // estado del picker antes de guardar
  let _savedLobbyModes  = []; // modos confirmados por broadcast; más fiable que el DB al arrancar

  // ── Cuenta regresiva de inicio (10s, cancelable) ───────────────────────────────
  let _counting = false;
  let _cdInterval = null;
  let _cdUntil = null;
  let _cdTick = null; // referencia al tick actual, para poder forzar un chequeo inmediato (ver visibilitychange)

  function _applyCountdownButtons(active) {
    const host    = window.LB.isHost();
    const cd       = document.getElementById('lobby-countdown');
    const startB   = document.getElementById('lobby-start-btn');
    const cancelB  = document.getElementById('lobby-cancel-btn');
    const nrB      = document.getElementById('lobby-notready-btn');
    const wait     = document.getElementById('lobby-wait-msg');
    if (cd)      cd.style.display      = active ? '' : 'none';
    if (startB)  startB.style.display  = (!active && host)  ? '' : 'none';
    if (cancelB) cancelB.style.display = (active && host)   ? '' : 'none';
    if (nrB)     nrB.style.display     = (active && !host)  ? '' : 'none';
    if (wait)    wait.style.display    = (!active && !host) ? '' : 'none';
    // Bloquear controles del host durante el countdown
    const modeEditBtn  = document.getElementById('lobby-mode-edit-btn');
    const inviteBtn    = document.getElementById('lobby-invite-btn');
    const visibilityBtn = document.getElementById('lobby-visibility-btn');
    if (modeEditBtn)   modeEditBtn.disabled   = active;
    if (inviteBtn)     inviteBtn.disabled     = active;
    if (visibilityBtn) visibilityBtn.disabled = active;
  }

  // ── Barra global de cuenta regresiva (visible fuera del panel de grupo) ────────
  let _globalCdEl = null;
  function _showGlobalCdBar(text) {
    if (!_globalCdEl) {
      _globalCdEl = document.createElement('div');
      _globalCdEl.className = 'lobby-cd-global-bar';
      document.body.appendChild(_globalCdEl);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (_globalCdEl) _globalCdEl.style.opacity = '1'; }));
    }
    _globalCdEl.textContent = text;
  }
  function _hideGlobalCdBar() {
    if (!_globalCdEl) return;
    _globalCdEl.style.opacity = '0';
    const el = _globalCdEl;
    _globalCdEl = null;
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 300);
  }

  function _startCountdown(until) {
    _counting = true;
    _cdUntil = until;
    window._lobbyCountingDown = true;
    _applyCountdownButtons(true);
    clearInterval(_cdInterval);
    _cdTick = () => {
      const remain = Math.ceil((until - Date.now()) / 1000);
      const text = T('lobby.starting', 'Empezando en') + ' ' + Math.max(0, remain) + '…';
      const cd = document.getElementById('lobby-countdown');
      if (cd) cd.textContent = text;
      // Solo mostrar la barra global si el panel de la sala NO está visible
      const lobbyPanelVisible = !!document.getElementById('versus-screen-lobby')?.offsetParent;
      if (!lobbyPanelVisible) _showGlobalCdBar(text);
      else _hideGlobalCdBar();
      if (remain <= 0) {
        clearInterval(_cdInterval); _cdInterval = null; _cdTick = null;
        // No iniciar si el host está en otro juego (versus 1v1 o cualquier otro modo)
        if (window.LB.isHost() && !window._isPlaying) window.LB.start();
      }
    };
    _cdTick();
    _cdInterval = setInterval(_cdTick, 200);
  }

  function _stopCountdown() {
    _counting = false;
    _cdUntil = null; _cdTick = null;
    window._lobbyCountingDown = false;
    clearInterval(_cdInterval); _cdInterval = null;
    _hideGlobalCdBar();
    _applyCountdownButtons(false);
  }

  // Tracking de miembros previos para detectar joins/leaves y mostrar toasts
  let _prevMemberIds = [];
  let _memberNameCache = {}; // id → name, para recuperar el nombre de quien salió
  let _prevHostFlag = null; // último "¿soy host?" — ver _renderMembers, fuerza rebuild completo si cambió

  // ── Entrar al lobby (tras crear/unirse) ────────────────────────────────────────
  function _updateInviteBtn() {
    const inviteBtn = document.getElementById('lobby-invite-btn');
    if (!inviteBtn) return;
    // Host siempre puede invitar; miembros solo si la sala es pública
    inviteBtn.disabled = !(window.LB.isHost() || window.LB.isPublic());
  }

  function enterLobby() {
    if (!window.LB.getId()) _savedLobbyModes = []; // reset solo si no hay sala activa
    const codeEl = document.getElementById('lobby-code');
    if (codeEl) codeEl.textContent = window.LB.getCode() || '------';
    _updateInviteBtn();
    _updateVisibilityBtn();
    _refreshLobbyName();

    // No resetear _counting: si el host vuelve al panel con countdown activo debe verse el estado correcto
    _applyCountdownButtons(_counting);
    window.LB.onMembers(_renderMembers);
    window.LB.onStart(lobby => _launchLobbyGame(lobby.seed));
    window.LB.onClosed(reason => {
      // Si todavía no empezó la partida, avisar y volver a la lista
      if (!window._lobbyActive) {
        _stopCountdown();
        _backToVersusFromLobby();
        if (typeof window.showVersusToast === 'function') {
          window.showVersusToast(reason === 'kicked'
            ? T('lobby.kicked', 'Te expulsaron de la sala')
            : T('lobby.closed', 'El host cerró la sala'));
        }
      }
    });
    // Cuenta regresiva sincronizada
    window.LB.onCountdown(p => { if (p && p.until) _startCountdown(p.until); });
    window.LB.onCancel(() => {
      _stopCountdown();
      if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.cancelled', 'Cuenta regresiva cancelada'));
    });
    window.LB.onNotReady(p => {
      if (typeof window.showVersusToast === 'function') {
        window.showVersusToast(((p && p.name) || T('lobby.someone', 'Alguien')) + ' ' + T('lobby.notReadyMsg', 'no está listo'));
      }
    });
    window.LB.onVisibility(isPublic => {
      if (typeof window.showVersusToast === 'function') {
        window.showVersusToast(isPublic ? T('lobby.nowPublic', 'Sala ahora PÚBLICA') : T('lobby.nowPrivate', 'Sala ahora PRIVADA'));
      }
      _updateInviteBtn();
      _updateVisibilityBtn();
      if (!isPublic && !window.LB.isHost()) {
        const pop = document.getElementById('lobby-invite-popup');
        if (pop && pop.style.display !== 'none') pop.style.display = 'none';
      }
    });
    window.LB.onName(() => _refreshLobbyName());
    window.LB.onModes((modes, changed) => {
      if (Array.isArray(modes) && modes.length) _savedLobbyModes = [...modes];
      _refreshLobbyName();
      if (changed && typeof window.showVersusToast === 'function') {
        const names = (Array.isArray(modes) ? modes : window.LB.getModes())
          .map(m => (_MODE_NAMES[m] || (() => m))()).join(' → ');
        window.showVersusToast(T('lobby.pickMode', 'Modos de juego') + ': ' + names);
      }
    });
    // Re-suscribir el canal en caso de haberse desconectado durante una partida previa
    window.LB.resubscribeChannel?.();
    _prevMemberIds = [];
    _memberNameCache = {};
    _renderMembers(window.LB.getMembers()); // render inmediato con caché
    // Forzar fetch fresco de la DB para asegurar estado actual post-partida
    window.LB.refreshMembers?.().catch(() => {});
  }

  function _backToVersusFromLobby() {
    if (typeof window.versusGoTo === 'function') window.versusGoTo('amistoso', true);
  }

  // ── Lista de salas públicas (aleatorio) ────────────────────────────────────────
  // silent=true → omite el spinner de "Cargando salas…" (para actualizaciones en segundo plano)
  let _publicListLoading = false; // evita solicitudes simultáneas
  async function loadPublicList(silent = false) {
    const list  = document.getElementById('versus-public-list');
    const empty = document.getElementById('versus-public-empty');
    if (!list) return;
    if (_publicListLoading) return; // ya hay una consulta en vuelo
    _publicListLoading = true;

    if (!silent) {
      list.innerHTML = `<div class="versus-empty-inline">${T('lobby.loading', 'Cargando salas…')}</div>`;
      if (empty) empty.style.display = 'none';
    }

    let rooms = [];
    try {
      const _p = window.LB.listPublic();
      // Viñeta de conexión solo en la carga inicial (silent=false); el polling en
      // segundo plano no debe interrumpir al jugador por un timeout puntual.
      rooms = (!silent && typeof window.withConnCheck === 'function')
        ? (await window.withConnCheck(_p, 6000)) || []
        : await _p;
    } catch (e) {}
    _publicListLoading = false;

    // Construir el nuevo contenido en un fragment para un swap atómico (sin flicker)
    const myLobbyId = window.LB.getId();
    const frag = document.createDocumentFragment();
    rooms.forEach(r => {
      const isMine = myLobbyId && myLobbyId === r.id;
      const row = document.createElement('div');
      row.className = 'versus-friend-row';
      row.dataset.lobbyId = r.id;
      const roomModes = _getActiveModes(r);
      const modeIconsHtml = _modeIconsHtml(roomModes, 'public-room-mode-icon');
      const displayName = r.name || _roomNameCache.get(String(r.id)) || (typeof t === 'function' ? t('lobby.roomName', { name: r.hostName }) : ('Sala de ' + r.hostName));
      row.innerHTML =
        `<div class="versus-friend-info">` +
          `<div class="public-room-name-row">` +
            `<span class="versus-friend-name">${displayName}</span>` +
            `<div class="public-room-mode-icons">${modeIconsHtml}</div>` +
          `</div>` +
          `<span class="versus-friend-status">${r.count}/${r.max} ${T('lobby.players', 'jugadores')}</span>` +
        `</div>` +
        `<button class="versus-challenge-btn${isMine ? ' joined' : ''}" data-id="${r.id}"${isMine ? ' disabled' : ''}>${isMine ? T('lobby.joined', 'Unido') : T('lobby.join', 'Unirse')}</button>`;
      frag.appendChild(row);
    });

    // Swap atómico: reemplaza el contenido sin flash intermedio
    list.innerHTML = '';
    if (!rooms.length) {
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      list.appendChild(frag);
    }

    list.querySelectorAll('.versus-challenge-btn:not(.joined)').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        try {
          await window.LB.joinById(btn.dataset.id);
          if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
          enterLobby();
        } catch (e) {
          if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.joinError', 'No se pudo unir a la sala'));
        }
      });
    });
  }

  // ── Lanzar la partida de banderas en modo lobby ────────────────────────────────
  function _launchLobbyGame(seed, modeIdx) {
    modeIdx = modeIdx !== undefined ? modeIdx : 0;
    _currentModeIdx = modeIdx;
    // Limpiar SIEMPRE, antes de arrancar CUALQUIER modo (primero o siguiente,
    // juego nuevo o transición) — así no queda NUNCA nada del modo/juego
    // anterior pegado, sin importar la combinación (monuments→banderas,
    // banderas del juego previo mezcladas, etc. — todo reportado). Resetear
    // window._vsShowingResult PRIMERO para que los hardReset (gameStoppers =
    // todos los modos) sí oculten los assets (algunos los preservan mientras
    // ese flag está en true). _modeAccScore/campaignBase NO se tocan acá, así
    // que el puntaje acumulado entre modos se preserva.
    window._vsShowingResult = false;
    if (Array.isArray(window.gameStoppers)) window.gameStoppers.forEach(fn => { try { fn(); } catch (e) {} });
    if (modeIdx === 0) {
      // _savedLobbyModes viene del broadcast y es más fiable que el DB (que puede estar desactualizado
      // si el postgres_changes de start() llegó antes que el de setModes, pisando _lobby.mode)
      _lobbyModes   = _savedLobbyModes.length ? [..._savedLobbyModes] : _getActiveModes(window.LB.getLobby());
      _baseSeed     = seed;
      _modeAccScore = 0;
    }
    // Semilla determinística por modo (igual en todos los dispositivos)
    const modeSeed = Math.floor(Math.abs(_baseSeed + modeIdx * 7919) % 1_000_000);
    const mode = _lobbyModes[modeIdx] || 'flags';

    _stopCountdown();
    _lobbyInTransition = false;
    window.practiceConfig = window.practiceConfig || {};
    window.practiceConfig.active = false;
    window.pendingGameMode = mode === 'cities' ? 'game' : mode;
    if (typeof window._setPlaying === 'function') window._setPlaying(true);

    const _ls = document.getElementById('loading-screen');
    if (_ls) { _ls.style.display = 'none'; _ls.classList.remove('lobby-interim-bg'); }
    document.getElementById('loading-versus-group')?.classList.add('table-gone');
    document.getElementById('loading-versus-group')?.classList.remove('panel-visible');
    document.getElementById('splash-screen').style.display = 'none';

    // Estado de modo lobby: leaderboard con TODOS los rivales, RNG sembrado.
    window._lobbyActive = true;
    _finishedPlayers = new Map();
    _resultPresented = false;
    // _revealAt/_revealTimer (reloj de pared compartido, ver
    // _checkAllFinished) son variables de módulo que sobreviven entre
    // partidas — el único otro lugar donde se limpian es en el paso al
    // SIGUIENTE modo dentro de la MISMA sala (_currentModeIdx = nextIdx) y
    // en _returnFromLobbyResult/_lobbyAbandon. Si por lo que sea quedaban
    // con un valor de una partida ANTERIOR sin pasar por esos caminos,
    // _checkAllFinished() se auto-bloqueaba para siempre en la partida
    // NUEVA (su guard de arriba es `if (_resultPresented || _revealTimer)
    // return`) — nadie recibía nunca el panel de resultados, coincidiendo
    // con el "ahora a NINGUNO le sale la tabla" reportado. Acá, en el
    // arranque de CUALQUIER modo (primero o siguiente), es el lugar más
    // seguro para garantizar un estado limpio pase lo que pase antes.
    _revealAt = null;
    if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    // Al inicio de una nueva campaña forzar scores a 0 en la caché local para no mostrar
    // valores residuales de la partida anterior mientras llega el primer _fetchMembers
    if (modeIdx === 0) window.LB.getMembers().forEach(m => { m.score = 0; });
    _refreshLobbyOpponents();

    // Cuando cambian los scores de la sala (realtime) → actualizar leaderboard
    window.LB.onMembers(() => {
      _refreshLobbyOpponents();
      const scoresFn = mode === 'monuments' ? window.monumentsSetLobbyScores : mode === 'shapes' ? window.shapesSetLobbyScores : mode === 'cities' ? window.citiesSetLobbyScores : window.flagsSetLobbyScores;
      if (typeof scoresFn === 'function') scoresFn(window._lobbyMembers);
      if (_finishedPlayers.size > 0) _checkAllFinished();
    });
    // Cuando un miembro termina su partida → registrar y verificar si todos terminaron
    window.LB.onFinished((uid, score) => {
      if (uid) _finishedPlayers.set(uid, score ?? 0);
      _checkAllFinished();
    });
    // Reloj de pared compartido — ver comentario largo en _checkAllFinished.
    window.LB.onReveal((revealAt, isFinal) => _handleRevealBroadcast(revealAt, isFinal));
    // Score en vivo de otro jugador → actualizar leaderboard inmediatamente
    window.LB.onScore((uid, score) => {
      const lm = (window._lobbyMembers || []).find(m => m.id === uid);
      if (lm) lm.score = score;
      const scoresFn = mode === 'monuments' ? window.monumentsSetLobbyScores : mode === 'shapes' ? window.shapesSetLobbyScores : mode === 'cities' ? window.citiesSetLobbyScores : window.flagsSetLobbyScores;
      if (typeof scoresFn === 'function') scoresFn(window._lobbyMembers || []);
    });
    // Alguien en la sala falló → glow en su tarjeta específica del lb
    window.LB.onWrong(uid => {
      const wrongFn = mode === 'monuments' ? window.monumentsSetLobbyWrongFor : mode === 'shapes' ? window.shapesSetLobbyWrongFor : mode === 'cities' ? window.citiesSetLobbyWrongFor : window.flagsTriggerLobbyWrongFor;
      if (typeof wrongFn === 'function') wrongFn(uid);
    });
    // A alguien en la sala se le acabó el tiempo → temblor + cronómetro en su
    // tarjeta (MISMO sistema que el 'wrong', ver _applyTimesUpEffect).
    window.LB.onTimesUp(payload => {
      const uid = payload && payload.uid;
      const tuFn = mode === 'monuments' ? window.monumentsSetLobbyTimesUpFor : mode === 'shapes' ? window.shapesSetLobbyTimesUpFor : mode === 'cities' ? window.citiesSetLobbyTimesUpFor : window.flagsTriggerLobbyTimesUpFor;
      if (typeof tuFn === 'function') tuFn(uid);
    });
    // Alguien perdió/recuperó presencia → mostrar/ocultar estado desconectado en su tarjeta
    window.LB.onPlayerGone(uid => {
      const goneFn = mode === 'monuments' ? window.monumentsSetLobbyDisconnected : mode === 'shapes' ? window.shapesSetLobbyDisconnected : mode === 'cities' ? window.citiesSetLobbyDisconnected : window.flagsSetLobbyDisconnected;
      if (typeof goneFn === 'function') goneFn(uid, true);
    });
    window.LB.onPlayerBack(uid => {
      const backFn = mode === 'monuments' ? window.monumentsSetLobbyDisconnected : mode === 'shapes' ? window.shapesSetLobbyDisconnected : mode === 'cities' ? window.citiesSetLobbyDisconnected : window.flagsSetLobbyDisconnected;
      if (typeof backFn === 'function') backFn(uid, false);
    });
    // Si quedé solo (todos los demás abandonaron durante la partida) → volver a sala
    window.LB.onAlone(() => {
      if (!window._lobbyActive && !_lobbyInTransition) return;
      // Si estamos en la pantalla intermedia entre modos, limpiar su timer y overlay
      if (_lobbyInTransition) {
        _lobbyInTransition = false;
        clearInterval(_intermediateTimer); _intermediateTimer = null;
        const interScreen = document.getElementById('lobby-intermediate-screen');
        if (interScreen) interScreen.style.display = 'none';
      }
      _stopCountdown();
      _teardownCurrentMode();
      // Ocultar HUD del juego que hardReset no limpia + popup de confirmación de salida
      ['score-display','flags-score-display','countdown-widget',
       'flags-countdown-widget','pregame-countdown','flags-pregame-countdown',
       'timeup-overlay','flags-timeup-overlay','game-wrapper','ingame-quit-popup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      window._lobbyActive = false;
      window._lobbyMembers = [];
      if (typeof window._setPlaying === 'function') window._setPlaying(false);
      window.LB.onScore(null);
      window.LB.onWrong(null);
      window.LB.onPlayerGone(null);
      window.LB.onPlayerBack(null);
      window.LB.onAlone(null);
      _resultPresented = false;
      _currentModeIdx = 0; _lobbyModes = []; _baseSeed = null; _modeAccScore = 0;
      _savedLobbyModes = [];
      if (_origCampaignBase) window.campaignBase = _origCampaignBase; // restaurar la de monuments.js (campaña 1 jugador), NO destruirla
      if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
      // Restaurar lobby a estado de espera: eliminar kicks pendientes + status→waiting
      window.LB.reportScore?.(0).catch?.(() => {});
      window.LB.processPendingKicks?.();
      window.LB.resetToWaiting?.();
      // Restaurar loading screen y panel de sala (igual que _presentFinalResult)
      const ls = document.getElementById('loading-screen');
      if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; ls.classList.remove('lobby-interim-bg'); ls.classList.add('table-shown'); }
      try { if (typeof playMusic === 'function' && typeof sfxMenuMusic !== 'undefined') playMusic(sfxMenuMusic); } catch(e) {}
      if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
      if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
      enterLobby();
      window.LB.refreshMembers?.();
      // Mostrar panel de "quedaste solo"
      const aloneTitle = document.querySelector('#lobby-alone-screen [data-i18n="lobby.alone.title"]');
      const aloneSub   = document.querySelector('#lobby-alone-screen [data-i18n="lobby.allLeft"]');
      if (aloneTitle) aloneTitle.textContent = T('lobby.alone.title', 'QUEDASTE SOLO');
      if (aloneSub)   aloneSub.textContent   = T('lobby.allLeft', 'Todos abandonaron la partida');
      const aloneScreen = document.getElementById('lobby-alone-screen');
      if (aloneScreen) aloneScreen.style.display = 'flex';
    });

    // Base acumulada de modos previos: permite mostrar puntaje total en pantalla desde el inicio del modo
    // Capturar la campaignBase ORIGINAL (monuments.js) la primera vez, para
    // poder restaurarla al terminar (ver _origCampaignBase).
    if (_origCampaignBase === null && typeof window.campaignBase === 'function') _origCampaignBase = window.campaignBase;
    window.campaignBase = () => _modeAccScore;

    if (mode === 'shapes') {
      if (typeof window.shapesSetSeed === 'function') window.shapesSetSeed(modeSeed);
      if (typeof showShapesMode === 'function') showShapesMode();
    } else if (mode === 'cities') {
      if (typeof window.citiesSetSeed === 'function') window.citiesSetSeed(modeSeed);
      if (typeof startGame === 'function') startGame();
    } else if (mode === 'monuments') {
      if (typeof window.monumentsSetSeed === 'function') window.monumentsSetSeed(modeSeed);
      if (typeof startGame === 'function') startGame();
    } else {
      if (typeof window.flagsSetSeed === 'function') window.flagsSetSeed(modeSeed);
      if (typeof showFlagsMode === 'function') showFlagsMode();
    }
    // Re-aplicar el badge de espectadores para el modo recién arrancado — el
    // badge apunta al modo ACTIVO (window.pendingGameMode) y solo se refresca
    // solo en eventos de presence 'sync'; en una transición de modo no hay
    // ninguno, así que el badge del modo nuevo arrancaba apagado aunque
    // hubiera espectadores (reportado, "en cada transición se les quita el
    // símbolo"). Pequeño delay para que el HUD del modo termine de montar.
    setTimeout(() => { try { window.LB.refreshSpectatorCount?.(); } catch (e) {} }, 300);
  }

  // Construye window._lobbyMembers = rivales (todos menos yo)
  function _refreshLobbyOpponents() {
    const myId = window._sbUserId;
    window._lobbyMembers = window.LB.getMembers()
      .filter(m => m.id !== myId)
      .map(m => ({
        id: m.id, name: m.name, avatar: m.avatar, score: m.score || 0,
        cardCode: m.cardCode || '0001',
      }));
  }

  // Reporte de respuesta desde flags.js / shapes.js
  window._lobbyReportAnswer = function(correct, score) {
    if (!window.LB.getId()) return;
    const base = (typeof window.campaignBase === 'function') ? window.campaignBase() : 0;
    const cumScore = score + base;
    window.LB.reportScore(cumScore);
    window.LB.sendScore(cumScore);
    if (!correct) window.LB.sendWrong();
  };

  // ── Fin de partida grupal: esperar a todos antes de mostrar resultados ─────────
  let _finishedPlayers = new Map(); // uid → finalScore
  let _resultPresented   = false;
  let _waitingTimeout    = null;
  let _lobbyInTransition = false; // true entre modos (pantalla intermedia): alone sigue activo
  Object.defineProperty(window, '_lobbyInTransition', { get: () => _lobbyInTransition, set: v => { _lobbyInTransition = v; }, configurable: true });

  function _showLobbyWaiting() {
    const el  = document.getElementById('lobby-waiting-overlay');
    const txt = document.getElementById('lobby-waiting-text');
    if (txt) txt.textContent = T('lobby.waitingOthers', 'Esperando a los otros miembros…');
    if (el)  el.style.display = 'flex';
  }
  function _hideLobbyWaiting() {
    const el = document.getElementById('lobby-waiting-overlay');
    if (el) el.style.display = 'none';
  }

  // Reloj de pared compartido para el ranking de fin de ronda — antes cada
  // cliente presentaba el resultado apenas SE ENTERABA (localmente) de que
  // todos terminaron, sin coordinarse con nadie más. Eso ya funcionaba
  // "bien" cuando todos estaban conectados normalmente (los 'finished' les
  // llegan a todos casi al mismo tiempo), pero con el espectador de
  // prestado (que se entera por caminos más lentos: bridge de
  // GroupSpectate, poll de 3s) alguien podía terminar viendo el panel
  // varios segundos después que el resto — "antes funcionaba, al meter el
  // espectador se estropeó" reportado. Ahora, quien PRIMERO detecta que
  // todos terminaron calcula un instante futuro compartido (revealAt) y lo
  // manda a todos (por LB Y por GroupSpectate, para que le llegue incluso a
  // quien esté espectando de prestado con su canal propio suelto) — cada
  // cliente programa su propio _presentIntermediateResult/_presentFinalResult
  // para ESE mismo instante, así el panel les aparece a todos a la vez.
  const REVEAL_BUFFER_MS = 700;
  const REVEAL_MAX_WAIT_MS = 2000; // tope de espera por desfasaje de reloj (ver _clampRevealAt) — bajado de 4s: el margen real es 700ms + latencia, 4s se sentía "tarde"
  let _revealAt = null;
  let _revealTimer = null;
  // El revealAt que llega de OTRO cliente (LB.onReveal/GroupSpectate.onReveal)
  // se calculó con el reloj de ESA máquina — si los relojes de sistema no
  // están bien sincronizados entre dispositivos, un revealAt ajeno podía
  // caer varios segundos (o más) en el futuro respecto al reloj de acá,
  // haciendo que este cliente esperara ese desfasaje entero antes de mostrar
  // nada — se sentía como "congelado para siempre" sin serlo técnicamente.
  // Ningún reveal legítimo debería necesitar más que REVEAL_BUFFER_MS de
  // margen de sobra por la latencia de red — si el valor recibido implica
  // esperar más que eso, se lo recorta a un máximo razonable en vez de
  // confiar ciegamente en el reloj de otra máquina.
  function _clampRevealAt(revealAt) {
    const now = Date.now();
    if (typeof revealAt !== 'number' || !isFinite(revealAt)) return now + REVEAL_BUFFER_MS;
    return Math.min(revealAt, now + REVEAL_MAX_WAIT_MS);
  }
  function _checkAllFinished() {
    try {
      if (_resultPresented || _revealTimer) return; // ya presentado o ya programado
      const total = Math.max(1, window.LB.getMembers().length - (window.LB.getPendingKicksCount?.() || 0));
      if (!total) return;
      if (_finishedPlayers.size >= total) {
        const isFinal = _currentModeIdx >= _lobbyModes.length - 1;
        if (!_revealAt) {
          _revealAt = Date.now() + REVEAL_BUFFER_MS;
          window.LB.sendReveal(_revealAt, isFinal);
          if (window.GroupSpectate && typeof window.GroupSpectate.sendReveal === 'function') window.GroupSpectate.sendReveal(_revealAt, isFinal);
        }
        _scheduleReveal(isFinal);
      }
    } catch (e) {
      // Red de seguridad: si CUALQUIER cosa de acá arriba tira una excepción
      // (geometría/estado inesperado), forzar el resultado en vez de dejar
      // la sala congelada sin panel ni assets — _presentFinalResult/
      // _presentIntermediateResult ya son idempotentes (_resultPresented).
      console.warn('[LB] _checkAllFinished failed, forzando resultado:', e);
      if (!_resultPresented) {
        if (_currentModeIdx >= _lobbyModes.length - 1) _presentFinalResult(); else _presentIntermediateResult();
      }
    }
  }
  function _scheduleReveal(isFinal) {
    if (_revealTimer || _resultPresented) return;
    const delay = Math.max(0, (_revealAt || Date.now()) - Date.now());
    _revealTimer = setTimeout(() => {
      _revealTimer = null;
      try {
        if (isFinal) _presentFinalResult(); else _presentIntermediateResult();
      } catch (e) {}
    }, delay);
  }
  // Llamado cuando llega el revealAt de OTRO cliente (por LB.onReveal o
  // GroupSpectate.onReveal) — el PRIMERO que llega gana (no se pisa un
  // _revealAt ya calculado localmente), así todos terminan sincronizados al
  // mismo instante sin importar quién lo haya calculado.
  function _handleRevealBroadcast(revealAt, isFinal) {
    if (_resultPresented || _revealTimer) return;
    if (!_revealAt) _revealAt = _clampRevealAt(revealAt);
    _scheduleReveal(isFinal);
  }

  // Limpia el modo de juego actual (flags o shapes) sin cerrar el lobby
  function _teardownCurrentMode() {
    const teardownMode = _lobbyModes[_currentModeIdx] || 'flags';
    if (teardownMode === 'shapes') {
      window.shapesHardReset?.();
      if (typeof window.shapesClearSeed === 'function') window.shapesClearSeed();
    } else if (teardownMode === 'cities') {
      window.citiesHardReset?.();
      if (typeof window.citiesClearSeed === 'function') window.citiesClearSeed();
    } else if (teardownMode === 'monuments') {
      window.monumentsHardReset?.();
      if (typeof window.monumentsClearSeed === 'function') window.monumentsClearSeed();
    } else {
      // flagsHardReset cancels all timers/intervals/abort flags; hideFlagsMode alone leaves flagsEndTimeout running
      window.flagsHardReset?.();
      if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
    }
  }

  // Pantalla intermedia entre modos: muestra ranking parcial + cuenta regresiva 10s
  function _presentIntermediateResult() {
    if (_resultPresented) return;
    _resultPresented = true;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    // _stopGroupWaitPoll() directo acá TAMBIÉN — _exitGroupWaitAsSpectator
    // (más abajo) solo lo frena si de verdad se había entrado a espectar de
    // prestado (_waitingAsGroupSpectator); ahora el poll también corre para
    // cualquier jugador que solo esté esperando sin espectar a nadie (ver
    // _startGroupWaitPoll), así que hay que pararlo desde acá para ese caso.
    _stopGroupWaitPoll();
    // Si estaba mirando a un compañero de prestado (ver _enterGroupWaitAsSpectator),
    // sacarlo de ahí ANTES de armar la pantalla de resultados — mismo orden
    // que _onOpponentAbandoned en vs.js. En try/catch — mismo motivo que en
    // _presentFinalResult: una falla acá no debe impedir mostrar la tabla.
    try { _exitGroupWaitAsSpectator(); } catch (e) { console.warn('[LB] exitGroupWait failed:', e); }
    _hideLobbyWaiting();
    if (typeof window._setPlaying === 'function') window._setPlaying(false);
    window._lobbyActive = false;
    _lobbyInTransition = true;
    window.LB.resetAloneGuard?.();
    window._lobbyMembers = [];
    window.LB.onScore(null);
    window.LB.onWrong(null);
    window.LB.onPlayerGone(null);
    window.LB.onPlayerBack(null);

    const nextIdx  = _currentModeIdx + 1;
    const nextMode = _lobbyModes[nextIdx];
    const screen   = document.getElementById('lobby-intermediate-screen');
    const list     = document.getElementById('lobby-intermediate-list');
    const modeTag  = document.getElementById('lobby-intermediate-mode-tag');
    const nextEl   = document.getElementById('lobby-intermediate-next');
    const nextIcon = document.getElementById('lobby-intermediate-next-icon');
    const nextName = document.getElementById('lobby-intermediate-next-name');

    if (modeTag) {
      const _activeMode = _lobbyModes[_currentModeIdx] || window.pendingGameMode;
      const modeName = (_MODE_NAMES[_activeMode] || (() => _activeMode))();
      modeTag.textContent = modeName + '  ·  ' + (_currentModeIdx + 1) + '/' + _lobbyModes.length;
    }
    if (nextEl && nextMode) {
      nextEl.style.display = 'flex';
      if (nextIcon) nextIcon.src = _MODE_ICONS[nextMode] || 'images/game1.png';
      if (nextName) nextName.textContent = (_MODE_NAMES[nextMode] || (() => nextMode))();
    } else if (nextEl) {
      nextEl.style.display = 'none';
    }

    // Construir ranking con scores acumulados hasta ahora
    const members = window.LB.getMembers().map(m => ({
      ...m,
      score: _finishedPlayers.has(m.id) ? _finishedPlayers.get(m.id) : (m.score || 0),
    }));
    members.sort((a, b) => b.score - a.score);
    // Avisar a un posible espectador (GroupSpectate en spectate.js) que ESTE
    // miembro está viendo la pantalla intermedia — sin esto, el espectador se
    // quedaba sin nada que mostrar en la transición entre modos (el "no sale
    // nada" reportado). Se llama desde CADA cliente que llega acá (todos lo
    // hacen independientemente, ver _checkAllFinished) — inofensivo, mismo
    // patrón que reportPostgame en vs.js. _MODE_NAMES/_MODE_ICONS son
    // privados de este módulo — se resuelven ACÁ y se mandan ya listos,
    // porque spectate.js no tiene acceso a esas tablas.
    window.LB.sendPostgame({
      kind: 'intermediate', members,
      currentModeIdx: _currentModeIdx, totalModes: _lobbyModes.length,
      modeLabel: (_MODE_NAMES[_lobbyModes[_currentModeIdx] || window.pendingGameMode] || (() => ''))(),
      nextModeName: nextMode ? (_MODE_NAMES[nextMode] || (() => nextMode))() : null,
      nextModeIcon: nextMode ? (_MODE_ICONS[nextMode] || 'images/game1.png') : null,
    });
    const myId    = window._sbUserId;
    const medals  = ['🥇', '🥈', '🥉'];
    if (list) {
      list.innerHTML = '';
      members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'lobby-result-row' + (m.id === myId ? ' is-me' : '');
        row.innerHTML =
          `<span class="lobby-result-pos">${medals[i] || (i + 1)}</span>` +
          `<div class="lobby-result-avatar-wrap"><img class="lobby-result-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false"></div>` +
          `<span class="lobby-result-name">${m.name}${m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : ''}</span>` +
          `<span class="lobby-result-score">${(m.score || 0).toLocaleString()}</span>`;
        // Marco real de cada miembro — antes esta fila siempre mostraba el
        // aro crema hardcodeado de siempre (mismo bug ya resuelto en
        // .lobby-member-row/.lobby-result-avatar).
        window.CustomizeAssets?.applyFrame(row.querySelector('.lobby-result-avatar-wrap'), m.frameCode || '0001');
        list.appendChild(row);
      });
    }

    // Fondo mínimo: solo nubes/planeta/degradados (lobby-interim-bg oculta UI innecesaria)
    const ls = document.getElementById('loading-screen');
    if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; ls.classList.add('lobby-interim-bg'); }

    if (screen) screen.style.display = 'flex';
    // Ocultar el countdown/timer de la ronda y demás HUD del juego que
    // quedaba encima del panel intermedio (reportado, "el último que queda ve
    // el countdown sobre la tabla temporal"). Mismos ids que _showLobbyResult.
    ['countdown-widget','flags-countdown-widget','shapes-countdown-widget',
     'pregame-countdown','flags-pregame-countdown','score-display','flags-score-display',
     'timeup-overlay','flags-timeup-overlay'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    try { if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame); } catch(e) {}

    // Teardown DESPUÉS de mostrar el overlay para que los assets del juego
    // permanezcan visibles hasta que la transición los cubra. En try/catch:
    // llamado sobre un jugador que estaba espectando de prestado, los
    // *HardReset asumen estado de juego normal y pueden tirar — la tabla ya
    // se mostró arriba, así que una falla acá no debe romper nada.
    try { _teardownCurrentMode(); } catch (e) { console.warn('[LB] intermediate teardown failed:', e); }

    // Cuenta regresiva 10s con barra animada
    const bar  = document.getElementById('lobby-intermediate-bar');
    const cdEl = document.getElementById('lobby-intermediate-cd');
    const INTER_MS = 10000;
    const start = Date.now();
    if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; }
    if (cdEl) cdEl.textContent = '10';
    requestAnimationFrame(() => {
      if (bar) { bar.style.transition = `width ${INTER_MS}ms linear`; bar.style.width = '0%'; }
    });
    clearInterval(_intermediateTimer);
    _intermediateTimer = setInterval(() => {
      const remain = Math.ceil((INTER_MS - (Date.now() - start)) / 1000);
      if (cdEl) cdEl.textContent = Math.max(0, remain);
      if (remain <= 0) {
        clearInterval(_intermediateTimer); _intermediateTimer = null;
        if (screen) screen.style.display = 'none';
        // Los assets del modo anterior que el jugador que espectó de prestado
        // dejó visibles detrás del overlay intermedio (flagsSpectatorExit/etc.
        // NO los oculta mientras window._vsShowingResult está en true — ver
        // ese guard, es a propósito para no vaciar el fondo bajo la tabla de
        // resultados) hay que limpiarlos AHORA, antes de arrancar el siguiente
        // modo — si no, quedan pegados atrás (reportado, "justo en los 2 que
        // pasaron a espectador"). Resetear el flag y re-hacer el teardown del
        // modo VIEJO (acá _currentModeIdx todavía apunta a él, antes de
        // avanzar) — ahora sí oculta los assets.
        // La limpieza de assets del modo anterior la hace ahora _launchLobbyGame
        // (corre gameStoppers SIEMPRE al arrancar cualquier modo) — ver ahí.
        // Arrancar el siguiente modo
        _currentModeIdx = nextIdx;
        _finishedPlayers = new Map();
        _resultPresented = false;
        _revealAt = null; _revealTimer = null;
        _launchLobbyGame(_baseSeed, _currentModeIdx);
      }
    }, 200);
  }

  function _presentFinalResult() {
    if (_resultPresented) return;
    _resultPresented = true;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    _stopGroupWaitPoll();
    // CADA paso de teardown en su propio try/catch — CRÍTICO. Antes esto
    // corría todo seguido y _showLobbyResult (mostrar la TABLA) recién al
    // final. _teardownCurrentMode() llama a flagsHardReset/monumentsHardReset,
    // que asumen estado de JUEGO normal — llamado sobre un jugador que estaba
    // espectando de prestado a otro (A/B que terminaron antes, ver
    // _enterGroupWaitAsSpectator), tiraba una excepción, y como
    // _resultPresented ya estaba en true y la tabla se mostraba DESPUÉS,
    // nunca llegaba a mostrarse: freeze permanente sin tabla (el "los que
    // terminan antes se quedan congelados, solo el último y el espectador
    // reciben la tabla" reportado — el último y el externo nunca pasan por
    // este estado de "espectando de prestado"). Ahora una falla en cualquier
    // paso se loguea pero NO impide llegar a _showLobbyResult.
    try { _exitGroupWaitAsSpectator(); } catch (e) { console.warn('[LB] exitGroupWait failed:', e); }
    try { _hideLobbyWaiting(); } catch (e) {}
    try { _teardownCurrentMode(); } catch (e) { console.warn('[LB] final teardown failed:', e); }
    try { if (typeof window._setPlaying === 'function') window._setPlaying(false); } catch (e) {}
    window._lobbyActive = false;
    _lobbyInTransition = false;
    window._lobbyMembers = [];
    try {
      // Procesar desconexiones que ocurrieron durante la partida (usa LB API para acceder a _pendingKicks)
      window.LB.processPendingKicks?.();
      window.LB.onFinished(null);
      window.LB.onScore(null);
      window.LB.onPlayerGone(null);
      window.LB.onPlayerBack(null);
      window.LB.resetToWaiting?.();
    } catch (e) { console.warn('[LB] final cleanup failed:', e); }
    // Resetear estado multi-modo para la próxima partida
    _currentModeIdx = 0; _lobbyModes = []; _baseSeed = null; _modeAccScore = 0;
    try {
      // Fondo loading screen
      const ls = document.getElementById('loading-screen');
      if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; ls.classList.add('table-shown'); }
      if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
      if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
    } catch (e) { console.warn('[LB] final nav failed:', e); }
    // El paso crítico — fuera de todos los try de arriba, garantizado de correr.
    const members = (window.LB.getMembers() || []).map(m => ({
      ...m,
      score: _finishedPlayers.has(m.id) ? _finishedPlayers.get(m.id) : (m.score || 0),
    }));
    members.sort((a, b) => b.score - a.score);
    _showLobbyResult(members);
  }

  window._lobbyHandleGameEnd = function(myFinalScore) {
    const myId = window._sbUserId;
    // Acumular puntaje de todos los modos jugados hasta ahora
    _modeAccScore += myFinalScore;
    if (window.LB.getId()) window.LB.reportScore(_modeAccScore);
    _finishedPlayers.set(myId, _modeAccScore);
    window.LB.sendFinished(_modeAccScore);
    // Timeout de seguridad: si alguien se desconecta y no reporta, avanzar
    // igual. Bajado de 30s a 12s — ahora hay DOS caminos redundantes para
    // enterarse de que todos terminaron mientras se espectea de prestado
    // (ver GroupSpectate.onFinished y _lobbyReceiveGroupResult, ambos en
    // _enterGroupWaitAsSpectator), así que este salvavidas casi nunca debería
    // llegar a disparar de verdad — 30s se sentía como "nunca" si por algún
    // motivo los dos caminos fallaban a la vez (el "se quedan congelados"
    // reportado).
    _armGroupWaitFallback();
    _showLobbyWaiting();
    _startGroupWaitPoll();
    _checkAllFinished();
    // Si _checkAllFinished ya determinó que todos terminaron (era el
    // último en terminar, o todos terminaron casi juntos), no hay nadie más
    // jugando a quien mirar — no entrar a espectar. Antes esto chequeaba
    // SOLO _resultPresented, pero desde que _checkAllFinished pasó a
    // PROGRAMAR el resultado para un instante futuro compartido (revealAt,
    // ver _scheduleReveal) en vez de mostrarlo ya mismo, _resultPresented
    // seguía en false en este mismo instante SIEMPRE (recién se pone true
    // cuando el timer programado dispara, ms después) — este chequeo nunca
    // frenaba nada, así que se entraba a espectar de prestado incluso
    // cuando ya se sabía que todos habían terminado (típicamente cuando
    // terminan casi juntos, ver _revealTimer). Ahí adentro no quedaba nadie
    // vivo a quien mirar y las flechas no tenían a dónde saltar — se
    // quedaba trabado esperando indefinidamente en vez de mostrar la tabla
    // (el "si todos acaban al mismo tiempo no muestra tabla ni acaba la
    // sesión" reportado).
    //
    // Margen corto (600ms) antes de comprometerse a espectar — MISMO patrón
    // que _vsHandleGameEnd en vs.js (1v1), que funciona bien: ahí, si el
    // chequeo de "el rival también terminó" se hacía DE UNA (sin esperar
    // nada), un final casi simultáneo entre AMBOS jugadores hacía que los
    // DOS soltaran su canal para espectarse mutuamente al mismo tiempo —
    // ninguno quedaba generando tick/round real, y se quedaban
    // mutuamente esperándose sin ninguna señal (documentado ahí como "los
    // dos quieren espectear al otro"). En grupo pasa EXACTAMENTE lo mismo
    // pero con más de dos: si 3+ jugadores terminan casi juntos, cada uno
    // ve (en el instante síncrono de su propio _checkAllFinished, ANTES de
    // que lleguen los 'finished' de los demás por la red) que TODAVÍA hay
    // "alguien más jugando" — en realidad ya terminó también, solo que su
    // broadcast no llegó todavía — y entra a espectarlo. Si TODOS hacen
    // esto a la vez, nadie queda jugando de verdad y todos quedan
    // mutuamente a la espera sin ningún asset ni resultado (el "todos
    // quedan congelados sin ningún asset" reportado). Esperar este margen
    // le da tiempo a los 'finished' de los demás (y al _revealTimer que
    // eso dispara) de llegar ANTES de comprometerse a espectar a nadie.
    setTimeout(() => {
      if (!_resultPresented && !_revealTimer) _enterGroupWaitAsSpectator();
    }, 600);
  };

  // ── Espectar de prestado a los compañeros que siguen jugando ────────────────
  // Mismo mecanismo que _enterWaitAsSpectator en vs.js (1v1), pero mirando a
  // CUALQUIERA de los miembros que todavía no terminaron esta ronda de modos,
  // con flechas para rotar entre ellos (GroupSpectate ya excluye de la
  // rotación a quien tenga su propio 'timesup', ver _finishedUids). Al
  // terminar todos, _presentIntermediateResult/_presentFinalResult sacan a
  // este jugador de acá ANTES de mostrar la tabla de resultados.
  let _waitingAsGroupSpectator = false;
  async function _enterGroupWaitAsSpectator() {
    if (_waitingAsGroupSpectator || _resultPresented) return;
    if (typeof window.openSpectatorGroup !== 'function') return;
    const lobbyId = window.LB.getId();
    if (!lobbyId) return;
    const myId = window._sbUserId;
    // Cualquier miembro que no sea yo y que todavía no figure en
    // _finishedPlayers (los que ya terminaron ANTES que yo) — GroupSpectate
    // necesita esta lista de entrada (preFinishedUids) porque recién se está
    // conectando ahora, nunca vio esos 'timesup' pasados.
    const stillPlaying = window.LB.getMembers().filter(m => m.id !== myId && !_finishedPlayers.has(m.id));
    if (!stillPlaying.length) return; // nadie más jugando (no debería pasar, _checkAllFinished ya lo habría resuelto)
    _waitingAsGroupSpectator = true;
    // Soltar MI conexión al canal 'lobby-{id}' ANTES de que GroupSpectate se
    // suscriba al MISMO tema (ver releaseChannel en LB, mismo motivo que
    // VS.releaseChannel en vs.js/1v1: Supabase Realtime no deja dos canales
    // suscriptos al mismo tema desde el mismo cliente). markExpectedLeave
    // PRIMERO es crítico: sin eso, mi propio 'leave' de presence se
    // interpretaba como un abandono REAL — quedaba en _pendingKicks, y
    // _checkAllFinished() resta ese conteo del total de gente a esperar, así
    // que la sala podía mostrar resultados con OTRO jugador todavía jugando
    // de verdad (el "le quedaba tiempo y saltó GANASTE" reportado). Con
    // markExpectedLeave, ese 'leave' puntual se descarta sin tocar
    // _pendingKicks ni ningún estado de "se fue".
    await window.LB.markExpectedLeave(myId);
    // Margen extra chico: await arriba solo garantiza que el broadcast se
    // terminó de ENCOLAR en el socket local, no que el servidor ya lo
    // propagó a los demás clientes — con varios jugadores terminando casi
    // juntos (todos soltando su canal a la vez), más vale un poco de
    // margen de sobra acá que arriesgarse a que este 'leave' llegue a
    // alguien ANTES que su 'expectleave', que es justo la carrera que
    // rompía todo (ver comentario largo en markExpectedLeave/lobby.js).
    await new Promise(resolve => setTimeout(resolve, 150));
    await window.LB.releaseChannel();
    if (_resultPresented) return; // se resolvió mientras esperaba
    window.openSpectatorGroup(lobbyId, stillPlaying[0], {
      instant: true,
      preFinishedUids: Array.from(_finishedPlayers.keys()),
    });
    // Mientras dure el "de prestado", este es el camino PRINCIPAL para
    // enterarme de que alguien más terminó — mi propio canal de LB está
    // suelto, así que _onFinished normal (registrado más abajo en
    // _launchGroupGame) nunca dispara para mí. GroupSpectate reenvía el
    // mismo evento 'finished' por su canal separado — alimentando
    // _finishedPlayers y _checkAllFinished() acá, igual que lo haría un
    // cliente conectado normal, en vez de depender ÚNICAMENTE de que otro
    // jugador me mande el ranking ya armado (kind:'intermediate'/'final',
    // ver _lobbyReceiveGroupResult) — si ESE broadcast puntual se perdía,
    // antes no había ningún otro camino hasta el salvavidas de 30s (el "se
    // quedan congelados, nunca les sale el panel" reportado).
    // Enganchar el latido: cada tick/ronda de CUALQUIER miembro que siga
    // jugando (no solo el que miro — ver onAnyActivity en spectate.js)
    // reprograma el salvavidas de 12s hacia adelante — ver comentario largo
    // en _armGroupWaitFallback. CRÍTICO que sea "cualquier miembro" y no solo
    // el POV: si terminé casi junto con otro y quedé mirándolo a ÉL (que ya
    // acabó, no manda nada) en vez del que sigue jugando, el POV no genera
    // ningún latido — pero el que SÍ sigue jugando manda ticks que igual
    // llegan a GroupSpectate, y así el salvavidas no dispara antes de tiempo
    // (el "los 2 que terminan antes se congelan" reportado).
    window._groupSpectatorHeartbeat = _armGroupWaitFallback;
    window.GroupSpectate.onAnyActivity(() => { if (_waitingAsGroupSpectator && !_resultPresented) _armGroupWaitFallback(); });
    window.GroupSpectate.onFinished((finishedUid, score) => {
      if (!_waitingAsGroupSpectator || _resultPresented) return;
      _finishedPlayers.set(finishedUid, score || 0);
      _checkAllFinished();
    });
    // Reloj de pared compartido — ver comentario largo en _checkAllFinished.
    // Necesario acá TAMBIÉN (no solo LB.onReveal): mientras se espectea de
    // prestado, el canal propio de LB está suelto, así que ese broadcast
    // nunca llegaría por esa vía — GroupSpectate lo reenvía por su propio
    // canal (mismo topic).
    window.GroupSpectate.onReveal((revealAt, isFinal) => {
      if (!_waitingAsGroupSpectator) return;
      _handleRevealBroadcast(revealAt, isFinal);
    });
    // Respaldo por REST, independiente de cualquier broadcast en tiempo
    // real — ambos caminos de arriba (onFinished reenviado y
    // _lobbyReceiveGroupResult) dependen de que un mensaje efímero llegue
    // bien, y en la práctica seguían sin disparar a veces (el "se quedan
    // congelados, nunca sale el panel" reportado, incluso después de agregar
    // esos dos caminos). Este poll consulta directo la tabla cada 3s — sin
    // depender de NINGÚN canal realtime — y usa live_state.finished (mismo
    // campo que ya persiste LB.sendTimesUp) para saber quién más terminó.
    _startGroupWaitPoll();
  }

  // Salvavidas de 12s — REARMABLE (mismo patrón que _armGameEndFallback en
  // vs.js/1v1, que ya resolvió exactamente este bug). Antes se armaba UNA
  // sola vez, fijo, contado desde el instante en que YO terminé, sin importar
  // cuánto le quedara de verdad al que sigo mirando de prestado. Si a ese
  // jugador todavía le quedaban, digamos, 15s (rachas de bonus +5s alargan
  // bastante una ronda), a los 12s este salvavidas disparaba igual —
  // llamando a _presentFinalResult ANTES de que el otro terminara de verdad,
  // que con el canal propio suelto y GroupSpectate a mitad de camino dejaba
  // la pantalla trabada sin tabla (el "2s antes del times up del que sigue
  // jugando se les congela todo y nunca sale la tabla" reportado). Ahora
  // cada tick/ronda REAL del jugador que miro de prestado (ver el latido en
  // los callbacks de grupo de spectate.js) reprograma este mismo timer 12s
  // hacia adelante — así solo dispara si ese jugador de verdad se quedó en
  // silencio 12s seguidos (glitch de red/desconexión real), no simplemente
  // porque le quedaba más tiempo de juego que el salvavidas original.
  function _armGroupWaitFallback() {
    clearTimeout(_waitingTimeout);
    _waitingTimeout = setTimeout(() => {
      _waitingTimeout = null;
      if (!window._lobbyActive && !_resultPresented) return; // ya se procesó
      if (window._lobbyActive) {
        if (_currentModeIdx >= _lobbyModes.length - 1) _presentFinalResult(); else _presentIntermediateResult();
      }
    }, 12000);
  }

  let _groupWaitPollTimer = null;
  // Antes este poll solo corría para quien estuviera espectando de prestado
  // (_waitingAsGroupSpectator) — un jugador que YA sabía (localmente) que no
  // quedaba nadie más jugando (y por eso nunca entraba a espectar, ver el
  // margen de 600ms en _lobbyHandleGameEnd) dependía ENTERAMENTE de recibir
  // el broadcast 'reveal'/'finished' de otro por su canal de LB normal — si
  // ESE mensaje puntual se perdía por cualquier motivo de red, no tenía
  // NINGÚN otro camino hasta el salvavidas de 12s (bastante más lento que
  // los demás jugadores, que si entraban a espectar tenían este mismo poll
  // de 3s de respaldo) — el "hubo uno que se descoordinó y no le salió la
  // pantalla" reportado. Ahora corre para CUALQUIER jugador que esté
  // esperando (lo arranca _lobbyHandleGameEnd para todos, no solo para quien
  // entra a espectar), y solo se frena cuando el resultado ya se presentó.
  function _startGroupWaitPoll() {
    clearInterval(_groupWaitPollTimer);
    _groupWaitPollTimer = setInterval(async () => {
      if (_resultPresented) { clearInterval(_groupWaitPollTimer); _groupWaitPollTimer = null; return; }
      try {
        const lobbyId = window.LB.getId();
        if (!lobbyId) return;
        const { data, error } = await window.sb.from('lobby_members').select('user_id, score, live_state').eq('lobby_id', lobbyId);
        if (error || !data) return;
        data.forEach(m => {
          if (m.live_state && m.live_state.finished) _finishedPlayers.set(m.user_id, m.score || 0);
        });
        _checkAllFinished();
      } catch (e) {}
    }, 3000);
  }
  function _stopGroupWaitPoll() {
    clearInterval(_groupWaitPollTimer);
    _groupWaitPollTimer = null;
  }
  async function _exitGroupWaitAsSpectator() {
    if (!_waitingAsGroupSpectator) return;
    _waitingAsGroupSpectator = false;
    if (window._groupSpectatorHeartbeat === _armGroupWaitFallback) window._groupSpectatorHeartbeat = null;
    _stopGroupWaitPoll();
    // Mismo flag que ya respeta flagsSpectatorExit/shapesSpectatorExit/etc
    // (ver _vsShowingResult en vs.js/spectate.js) — no hay que borrar los
    // assets de fondo del juego antes de que la pantalla de resultados los
    // tape, _teardownCurrentMode() ya se encarga del reset real después.
    window._vsShowingResult = true;
    // Teardown VISUAL del espectador PRIMERO y SÍNCRONO — CRÍTICO. Esta
    // función se llama (sin await) al principio de _presentFinalResult/
    // _presentIntermediateResult, que ACTO SEGUIDO muestran la tabla de
    // resultados. Antes acá se hacía `await GroupSpectate.stop()` ANTES de
    // closeSpectator — ese await cedía el hilo, así que _presentFinalResult
    // seguía y mostraba la tabla, y RECIÉN DESPUÉS (cuando el await resolvía)
    // corría closeSpectator, desmontando la UI de espectador ENCIMA de la
    // tabla ya mostrada — la tapaba, y el jugador quedaba "congelado" sin ver
    // el panel (confirmado por logs: `_presentFinalResult called` salía ANTES
    // que `channel CLOSED`). El 1v1 (vs.js _exitWaitAsSpectator) hace
    // closeSpectator SÍNCRONO primero, por eso ahí nunca falló. closeSpectator
    // (rama silent, _groupMode) ya llama a GroupSpectate.stop() internamente.
    if (typeof window.closeSpectator === 'function') window.closeSpectator(null, true);
    // El release REAL del canal + reconexión del propio va async (no bloquea
    // lo visual) — esperar que GroupSpectate suelte de verdad su canal ANTES
    // de resubscribeChannel evita la carrera de "dos canales al mismo tema".
    if (window.GroupSpectate) { try { await window.GroupSpectate.stop(); } catch (e) {} }
    window.LB.resubscribeChannel?.();
  }

  // Llamado desde spectate.js (GroupSpectate.onPostgame) cuando ESTE mismo
  // jugador está mirando de prestado y llega el ranking real de fin de
  // ronda (kind:'intermediate'/'final') — reemplaza al salvavidas de 30s
  // (_waitingTimeout, más abajo en _lobbyHandleGameEnd) como forma de
  // enterarse de que todos terminaron: mientras dura el "de prestado", el
  // canal propio de LB está SUELTO (ver releaseChannel en
  // _enterGroupWaitAsSpectator), así que el 'finished' que dispararía
  // _checkAllFinished() por su cuenta nunca le llega — sin este puente, este
  // jugador se quedaba viendo el mirror NEUTRAL de spectate.js hasta que el
  // salvavidas de 30s recién ahí mostrara su resultado real (el "reciben
  // GANA USUARIO como espectadores, su resultado real tarda 10-15s más"
  // reportado). Se sincroniza _finishedPlayers con los scores que ya vienen
  // en el payload (calculados por quien mandó el broadcast) para que el
  // cálculo de "mi puesto" salga bien, y se llama a la función real
  // correspondiente — misma pantalla personalizada que ve cualquier jugador.
  window._lobbyReceiveGroupResult = function (payload) {
    if (!_waitingAsGroupSpectator || _resultPresented || !payload) return;
    (payload.members || []).forEach(m => { if (m && m.id) _finishedPlayers.set(m.id, m.score || 0); });
    // NO llamar a _presentFinalResult/_presentIntermediateResult DIRECTO acá
    // — eso mostraba el resultado apenas llegaba ESTE broadcast puntual, sin
    // coordinarse con el reloj de pared compartido (_revealAt, ver
    // _checkAllFinished/_scheduleReveal) que sí respetan los otros dos
    // caminos (GroupSpectate.onFinished y el poll de respaldo). Con eso,
    // este jugador podía terminar viendo el panel en un instante DISTINTO
    // (antes o después) que el resto de la sala — justo el "tienen que
    // recibirlo TODOS al mismo tiempo" reportado. _checkAllFinished() ya
    // tiene la misma guarda de "recién programar si no hay uno ya en curso".
    _checkAllFinished();
  };

  function _showLobbyResult(members) {
    _hideLobbyWaiting();
    // Ver comentario largo en _presentIntermediateResult — mismo aviso, esta
    // vez para el ranking FINAL de la sala.
    window.LB.sendPostgame({ kind: 'final', members });
    const myId   = window._sbUserId;
    const screen = document.getElementById('lobby-result-screen');
    const list   = document.getElementById('lobby-result-list');
    const title  = document.getElementById('lobby-result-title');
    if (!screen || !list) return;
    const myRank = members.findIndex(m => m.id === myId) + 1;
    if (title) {
      title.textContent = myRank === 1
        ? T('vs.result.win', '¡GANASTE!')
        : T('lobby.placed', 'Quedaste #{n}').replace('{n}', myRank);
      title.className = 'vs-result-title ' + (myRank === 1 ? 'win' : 'lose');
    }
    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = '';
    members.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'lobby-result-row' + (m.id === myId ? ' is-me' : '');
      row.innerHTML =
        `<span class="lobby-result-pos">${medals[i] || (i + 1)}</span>` +
        `<div class="lobby-result-avatar-wrap"><img class="lobby-result-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false"></div>` +
        `<span class="lobby-result-name">${m.name}${m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : ''}</span>` +
        `<span class="lobby-result-score">${(m.score || 0).toLocaleString()}</span>`;
      window.CustomizeAssets?.applyFrame(row.querySelector('.lobby-result-avatar-wrap'), m.frameCode || '0001');
      list.appendChild(row);
    });
    screen.style.display = 'flex';
    // Ocultar el widget de countdown/timer de la ronda (y demás HUD del
    // juego) que _teardownCurrentMode/hardReset no siempre limpia — sin esto
    // el countdown quedaba visible ENCIMA de la tabla final y seguía pegado
    // incluso al volver al menú de inicio (reportado por el ÚLTIMO jugador en
    // terminar, que va por este camino real, no por el desmontaje de
    // espectador). Mismos ids que oculta _lobbyAbandon.
    ['countdown-widget','flags-countdown-widget','shapes-countdown-widget',
     'pregame-countdown','flags-pregame-countdown','score-display','flags-score-display',
     'timeup-overlay','flags-timeup-overlay'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    try { if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame); } catch (e) {}
  }

  function _returnFromLobbyResult() {
    const screen = document.getElementById('lobby-result-screen');
    if (screen) screen.style.display = 'none';
    // Seguro extra al volver al menú: ocultar cualquier HUD de juego que
    // haya quedado (countdown/timer, etc.) — reportado que el countdown se
    // veía incluso en el menú de inicio.
    ['countdown-widget','flags-countdown-widget','shapes-countdown-widget',
     'pregame-countdown','flags-pregame-countdown','score-display','flags-score-display',
     'timeup-overlay','flags-timeup-overlay'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    // Mismo reset que _vsReturnToMenu (vs.js, 1v1) — _exitGroupWaitAsSpectator
    // lo pone en true y nada más en el flujo grupal lo devolvía a false,
    // así que quedaba pegado para siempre (bloqueando de más el mirror de
    // resultados de la PRÓXIMA sala, o incluso el hardReset normal de un
    // modo solo/campaña en esta misma pestaña).
    window._vsShowingResult = false;
    _finishedPlayers = new Map();
    _resultPresented = false;
    _revealAt = null; if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    _currentModeIdx = 0; _lobbyModes = []; _baseSeed = null; _modeAccScore = 0;
    _savedLobbyModes = [];
    if (_origCampaignBase) window.campaignBase = _origCampaignBase; // restaurar la de monuments.js (campaña 1 jugador), NO destruirla
    clearInterval(_intermediateTimer); _intermediateTimer = null;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    const lid = window.LB.getId();
    if (lid) window.LB.reportScore(0).catch(() => {});
    window.LB.resetToWaiting?.();
    if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
    if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
    enterLobby();
    try { if (typeof playMusic === 'function' && typeof sfxMenuMusic !== 'undefined') playMusic(sfxMenuMusic); } catch(e) {}
  }

  // Salir de una partida lobby en curso (botón power/quit)
  window._lobbyAbandon = function() {
    _hideLobbyWaiting();
    const intScreen = document.getElementById('lobby-intermediate-screen');
    if (intScreen) intScreen.style.display = 'none';
    clearInterval(_intermediateTimer); _intermediateTimer = null;
    _stopGroupWaitPoll();
    window._vsShowingResult = false; // ver comentario largo en _returnFromLobbyResult
    _finishedPlayers = new Map();
    _resultPresented = false;
    _revealAt = null; if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    _currentModeIdx = 0; _lobbyModes = []; _baseSeed = null; _modeAccScore = 0;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    window._lobbyActive = false;
    window._lobbyMembers = [];
    window.LB.clearPendingKicks?.();
    _savedLobbyModes = [];
    if (_origCampaignBase) window.campaignBase = _origCampaignBase; // restaurar la de monuments.js (campaña 1 jugador), NO destruirla
    if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
    if (typeof window.shapesClearSeed === 'function') window.shapesClearSeed();
    if (typeof window.monumentsClearSeed === 'function') window.monumentsClearSeed();
    if (window.LB.getId()) { try { window.LB.leave(); } catch (e) {} }
  };

  document.addEventListener('DOMContentLoaded', () => {
    // Empezar → dispara cuenta regresiva de 10s (no inicia ya); el host puede cancelar.
    document.getElementById('lobby-start-btn')?.addEventListener('click', () => {
      if (window.LB.getMembers().length < 2) return;
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.LB.sendCountdown(Date.now() + 10000);
    });
    // Cancelar la cuenta regresiva (host)
    document.getElementById('lobby-cancel-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.LB.sendCancel();
    });
    // "No estoy listo" (cualquier jugador) → avisa a todos; el host decide cancelar
    document.getElementById('lobby-notready-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const myName = localStorage.getItem('playerName') || T('lobby.someone', 'Alguien');
      window.LB.sendNotReady(myName);
    });
    document.getElementById('lobby-leave-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _stopCountdown();
      window.LB.leave();
      if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.leftRoom', 'Has abandonado la sala'));
      _backToVersusFromLobby();
    });
    // Nombre de la sala (host): ✎ editar, ✓ confirmar (Enter también confirma)
    document.getElementById('lobby-name-edit-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _beginEditName();
    });
    document.getElementById('lobby-name-confirm-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _confirmEditName();
    });
    document.getElementById('lobby-name-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); _confirmEditName(); }
    });
    // Mismo botón reusado para el espectador (ver _showGroupResultMirror en
    // spectate.js, mismo patrón que #vs-result-back en vs.js): si está
    // espectando, cierra ESA sesión en vez de _returnFromLobbyResult() (que
    // resetearía el estado de una sala REAL que este cliente no tiene).
    document.getElementById('lobby-result-back')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (window._isSpectating) {
        if (typeof window.closeSpectator === 'function') window.closeSpectator();
        return;
      }
      _returnFromLobbyResult();
    });
    document.getElementById('lobby-alone-back')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      document.getElementById('lobby-alone-screen').style.display = 'none';
    });
    const _copyCode = () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const code = window.LB.getCode();
      if (code && navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
      if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.copied', '¡Código copiado!'));
    };
    document.getElementById('lobby-code-copy')?.addEventListener('click', _copyCode);

    // "+ Invitar": abre el popup con amigos conectados + copiar link
    document.getElementById('lobby-invite-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _openInvitePopup();
    });
    document.getElementById('lobby-copylink-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _copyJoinLink();
    });
    document.getElementById('lobby-invite-close')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const p = document.getElementById('lobby-invite-popup'); if (p) p.style.display = 'none';
    });

    // Toggle público/privado (solo host)
    document.getElementById('lobby-visibility-btn')?.addEventListener('click', async () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      await window.LB.setPublic(!window.LB.isPublic());
      _updateVisibilityBtn();
      _updateInviteBtn();
      // El toast lo recibe todo el mundo via broadcast onVisibility (incluyendo el host con self:true)
    });

    // Deep-link: ?join=CÓDIGO → recordar para unirse cuando haya sesión
    try {
      const params = new URLSearchParams(location.search);
      const code = params.get('join');
      if (code) {
        _pendingJoinCode = code.toUpperCase();
        // limpiar la URL para no reintentar al recargar
        params.delete('join');
        const qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      }
    } catch (e) {}
    tryPendingJoin();
  });

  // ── Botón visibilidad (host) ───────────────────────────────────────────────────
  function _updateVisibilityBtn() {
    const btn = document.getElementById('lobby-visibility-btn');
    if (!btn) return;
    if (!window.LB.isHost()) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    btn.textContent = window.LB.isPublic() ? T('lobby.public', '🌐 Pública') : T('lobby.private', '🔒 Privada');
    btn.classList.toggle('is-public', window.LB.isPublic());
  }

  // Nombre de la sala: el host lo edita con ✎/✓; para el resto es texto en vivo.
  let _editingName = false;
  const _MODE_ICONS = { flags: 'images/game1.png', shapes: 'images/game2.png', cities: 'images/game3.png', monuments: 'images/game4.png' };
  const _MODE_NAMES = { flags: () => T('nav.flags', 'Banderas'), shapes: () => T('nav.shapes', 'Siluetas'), cities: () => T('nav.cities', 'Ciudades'), monuments: () => T('nav.monuments', 'Monumentos') };
  const _ALL_MODES  = ['flags', 'shapes', 'cities', 'monuments'];

  // Genera el HTML de íconos de modo en orden de partida
  function _modeIconsHtml(modes, cls = '') {
    return modes.map(m => `<img ${cls ? `class="${cls}"` : ''} src="${_MODE_ICONS[m] || 'images/game1.png'}" alt="${m}">`).join('');
  }

  function _getActiveModes(lobby) {
    if (!lobby) return ['flags'];
    // Column `modes` (array en Supabase o string CSV)
    if (lobby.modes) {
      const arr = Array.isArray(lobby.modes) ? lobby.modes : String(lobby.modes).split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) return arr;
    }
    if (!lobby.mode) return ['flags'];
    if (lobby.mode === 'all') return _ALL_MODES;
    // Fallback: modos codificados como "flags+shapes" en el campo `mode`
    if (lobby.mode.includes('+')) return lobby.mode.split('+').map(s => s.trim()).filter(Boolean);
    return [lobby.mode];
  }
  function _refreshLobbyName() {
    const text  = document.getElementById('lobby-name-text');
    const edit  = document.getElementById('lobby-name-edit-btn');
    const input = document.getElementById('lobby-name-input');
    const conf  = document.getElementById('lobby-name-confirm-btn');
    if (!text) return;
    const host = window.LB.isHost();
    const storedName = window.LB.getName();
    let name;
    if (storedName) {
      name = storedName;
    } else {
      const hostMember = window.LB.getMembers().find(m => m.isHost);
      const hostN = (hostMember && hostMember.name) || T('lobby.unnamed', 'Sala');
      name = (typeof t === 'function') ? t('lobby.roomName', { name: hostN }) : hostN;
    }
    if (_editingName && host) return; // no pisar mientras edita
    text.textContent = name;
    const iconsEl = document.getElementById('lobby-mode-icons');
    if (iconsEl) {
      const modes = _getActiveModes(window.LB.getLobby());
      iconsEl.innerHTML = _modeIconsHtml(modes);
    }
    text.style.display   = '';
    if (input) input.style.display = 'none';
    if (conf)  conf.style.display  = 'none';
    if (edit)  edit.style.display  = host ? '' : 'none';
    const modeEditBtn = document.getElementById('lobby-mode-edit-btn');
    if (modeEditBtn) modeEditBtn.style.display = host ? '' : 'none';
  }
  function _beginEditName() {
    if (!window.LB.isHost()) return;
    _editingName = true;
    const text  = document.getElementById('lobby-name-text');
    const edit  = document.getElementById('lobby-name-edit-btn');
    const input = document.getElementById('lobby-name-input');
    const conf  = document.getElementById('lobby-name-confirm-btn');
    if (text) text.style.display = 'none';
    if (edit) edit.style.display = 'none';
    if (input) { input.style.display = ''; input.value = window.LB.getName() || ''; input.focus(); input.select(); }
    if (conf) conf.style.display = '';
  }
  async function _confirmEditName() {
    const input = document.getElementById('lobby-name-input');
    const val = input ? (input.value || '').trim() : '';
    _editingName = false;
    if (val) await window.LB.setName(val); // propaga a todos por realtime
    _refreshLobbyName();
  }

  // ── Mode picker (multi-select + orden) ────────────────────────────────────────

  function _renderPickerOrderList() {
    const section = document.getElementById('lobby-mode-order-section');
    const list    = document.getElementById('lobby-mode-order-list');
    if (!section || !list) return;
    section.style.display = _pendingModesOrder.length > 1 ? '' : 'none';
    list.innerHTML = '';
    _pendingModesOrder.forEach((mode, idx) => {
      const item = document.createElement('div');
      item.className = 'lobby-mode-order-item';
      item.dataset.mode = mode;
      item.innerHTML =
        `<span class="lobby-mode-drag-handle">⠿</span>` +
        `<span class="lobby-mode-order-num">${idx + 1}</span>` +
        `<img src="${_MODE_ICONS[mode] || 'images/game1.png'}" alt="${mode}">` +
        `<span class="lobby-mode-order-name">${(_MODE_NAMES[mode] || (() => mode))()}</span>`;
      list.appendChild(item);
    });
  }

  // Drag-and-drop estilo iOS: ítem levita, siblings se deslizan suavemente
  function _setupOrderListDrag() {
    const list = document.getElementById('lobby-mode-order-list');
    if (!list) return;
    let drag = null;

    list.addEventListener('pointerdown', e => {
      if (drag) return;
      const item = e.target.closest('.lobby-mode-order-item');
      if (!item || !list.contains(item)) return;
      e.preventDefault();
      item.setPointerCapture(e.pointerId);

      const allItems = [...list.querySelectorAll('.lobby-mode-order-item')];
      const fromIdx  = allItems.indexOf(item);
      const rects    = allItems.map(el => el.getBoundingClientRect());

      // Factor de escala: #app-stage usa transform:scale(); getBoundingClientRect
      // devuelve coordenadas de viewport (post-scale) pero translateY opera en
      // coordenadas locales (pre-scale). Hay que dividir todos los deltas por scale.
      const scale = rects[0].width / item.offsetWidth || 1;

      const itemH = rects[0].height;
      const gap   = allItems.length > 1 ? rects[1].top - rects[0].bottom : 0;
      // slotH en coordenadas locales (lo que translateY entiende)
      const slotH = (itemH + gap) / scale;

      // Levantar el ítem con animación (lift)
      item.style.transition = 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s';
      item.style.transform  = 'scale(1.06)';
      item.style.boxShadow  = '0 10px 30px rgba(0,0,0,0.55)';
      item.style.zIndex     = '20';
      item.style.position   = 'relative';

      // Habilitar transición suave en los siblings
      allItems.forEach(el => {
        if (el !== item) el.style.transition = 'transform 0.15s cubic-bezier(0.25,0.46,0.45,0.94)';
      });

      drag = { item, allItems, fromIdx, toIdx: fromIdx, rects, slotH, scale, startY: e.clientY, lifted: false };
    });

    list.addEventListener('pointermove', e => {
      if (!drag) return;
      e.preventDefault();
      // deltaY en coordenadas locales
      const deltaY = (e.clientY - drag.startY) / drag.scale;

      // Primera vez que se mueve: quitar transición de transform para seguir el dedo sin lag
      if (!drag.lifted) {
        drag.lifted = true;
        drag.item.style.transition = 'box-shadow 0.18s';
      }
      drag.item.style.transform = `translateY(${deltaY}px) scale(1.06)`;

      // Calcular índice destino comparando e.clientY con centros originales (viewport)
      let toIdx = 0;
      drag.rects.forEach((r, i) => { if (e.clientY > r.top + r.height / 2) toIdx = i; });
      toIdx = Math.max(0, Math.min(drag.allItems.length - 1, toIdx));

      if (toIdx !== drag.toIdx) {
        drag.toIdx = toIdx;
        drag.allItems.forEach((el, i) => {
          if (el === drag.item) return;
          if (drag.fromIdx < toIdx && i > drag.fromIdx && i <= toIdx) {
            el.style.transform = `translateY(-${drag.slotH}px)`;
          } else if (drag.fromIdx > toIdx && i >= toIdx && i < drag.fromIdx) {
            el.style.transform = `translateY(${drag.slotH}px)`;
          } else {
            el.style.transform = '';
          }
        });
      }
    });

    const _finishDrag = () => {
      if (!drag) return;
      const { item, allItems, fromIdx, toIdx } = drag;
      drag = null;
      allItems.forEach(el => {
        el.style.transition = '';
        el.style.transform  = '';
        el.style.zIndex     = '';
        el.style.position   = '';
        el.style.boxShadow  = '';
      });
      if (toIdx !== fromIdx) {
        const [moved] = _pendingModesOrder.splice(fromIdx, 1);
        _pendingModesOrder.splice(toIdx, 0, moved);
      }
      _renderPickerOrderList();
      _renderPickerGridBadges();
    };

    list.addEventListener('pointerup',     _finishDrag);
    list.addEventListener('pointercancel', _finishDrag);
  }

  function _renderPickerGridBadges() {
    document.querySelectorAll('.lobby-mode-pick-btn').forEach(btn => {
      const mode = btn.dataset.mode;
      const idx  = _pendingModesOrder.indexOf(mode);
      const numEl = btn.querySelector('.lobby-mode-pick-num');
      btn.classList.toggle('is-selected', idx >= 0);
      if (numEl) {
        numEl.style.display = idx >= 0 ? 'flex' : 'none';
        numEl.textContent   = idx >= 0 ? String(idx + 1) : '';
      }
    });
  }

  function _showModePicker() {
    const pop = document.getElementById('lobby-mode-picker-popup');
    if (!pop) return;
    _pendingModesOrder = [..._getActiveModes(window.LB.getLobby())];
    _renderPickerGridBadges();
    _renderPickerOrderList();
    pop.style.display = 'flex';
  }

  document.addEventListener('DOMContentLoaded', () => {
    _setupOrderListDrag();

    document.getElementById('lobby-mode-edit-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _showModePicker();
    });

    // Toggle de modo en el grid
    document.getElementById('lobby-mode-picker-popup')?.addEventListener('click', e => {
      const btn = e.target.closest('.lobby-mode-pick-btn');
      if (btn && !btn.disabled) {
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const mode = btn.dataset.mode;
        const idx  = _pendingModesOrder.indexOf(mode);
        if (idx >= 0) {
          _pendingModesOrder.splice(idx, 1); // deseleccionar
        } else {
          _pendingModesOrder.push(mode); // seleccionar al final
        }
        _renderPickerGridBadges();
        _renderPickerOrderList();
        return;
      }
    });

    // Guardar
    document.getElementById('lobby-mode-picker-save')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (_pendingModesOrder.length === 0) return; // al menos 1 modo
      window.LB.setModes([..._pendingModesOrder]);
      document.getElementById('lobby-mode-picker-popup').style.display = 'none';
      if (typeof window.showVersusToast === 'function') {
        const names = _pendingModesOrder.map(m => (_MODE_NAMES[m] || (() => m))()).join(' → ');
        window.showVersusToast(names);
      }
    });

    // Click en el overlay (fondo) cierra sin guardar
    document.getElementById('lobby-mode-picker-popup')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        document.getElementById('lobby-mode-picker-popup').style.display = 'none';
      }
    });
  });

  // ── Link de invitación + deep-link ─────────────────────────────────────────────
  function _buildJoinLink() {
    const code = window.LB.getCode();
    if (!code) return '';
    return location.origin + location.pathname + '?join=' + code;
  }
  function _copyJoinLink(friendName) {
    const link = _buildJoinLink();
    if (link && navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
    if (typeof window.showVersusToast === 'function') {
      window.showVersusToast(friendName
        ? T('lobby.sharedWith', 'Compartí el link con {name}').replace('{name}', friendName)
        : T('lobby.linkCopied', '¡Link copiado!'));
    }
  }

  let _pendingJoinCode = null;
  function tryPendingJoin() {
    if (!_pendingJoinCode) return;
    if (!window._accountLoggedIn || !window._sbUserId) return; // se reintenta al loguear
    const code = _pendingJoinCode;
    _pendingJoinCode = null;
    (async () => {
      try {
        await window.LB.joinByCode(code);
        if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
        if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
        enterLobby();
      } catch (e) {
        const msg = e && e.message === 'started'
          ? T('lobby.started', 'La partida ya empezó')
          : T('lobby.notFound', 'Sala no encontrada');
        if (typeof window.showVersusToast === 'function') window.showVersusToast(msg);
      }
    })();
  }
  window.tryPendingLobbyJoin = tryPendingJoin;

  // Restaura mi sala en espera al iniciar sesión (para que aparezca "Mi sala")
  async function tryRestore() {
    try {
      const lobby = await window.LB.restoreActive();
      if (lobby) enterLobby(); // cablea callbacks y renderiza (oculto hasta abrir)
    } catch (e) {}
  }
  window.tryRestoreLobby = tryRestore;

  // ── Popup de invitar amigos (con cooldown de 30s por amigo) ─────────────────────
  const INVITE_COOLDOWN_MS = 30000;
  const _inviteCooldowns = {}; // friendId → timestamp de expiración

  function _setInviteBtnCooldown(btn, friendId) {
    const until = _inviteCooldowns[friendId] || 0;
    const remain = Math.ceil((until - Date.now()) / 1000);
    if (remain <= 0) {
      btn.disabled = false;
      btn.classList.remove('disabled');
      btn.textContent = T('lobby.invite', '+ Invitar');
      return false;
    }
    btn.disabled = true;
    btn.classList.add('disabled');
    btn.textContent = T('lobby.disabled', 'Inhabilitado') + ' ' + remain + 's';
    clearTimeout(btn._cdT);
    btn._cdT = setTimeout(() => _setInviteBtnCooldown(btn, friendId), 1000);
    return true;
  }

  function _renderInviteList(list, empty) {
    Array.from(list.children).forEach(el => { if (el.id !== 'lobby-invite-empty') el.remove(); });
    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const memberIds = new Set(window.LB.getMembers().map(m => m.id));
    const statusOf = f => (typeof getStatusObj === 'function')
      ? getStatusObj(f).cls
      : ((f.last_active && (Date.now() - new Date(f.last_active)) / 1000 < 120) ? (f.is_playing ? 'playing' : 'online') : 'offline');
    const shown = friends.filter(f => statusOf(f) !== 'offline');
    if (!shown.length) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    shown.forEach(f => {
      const inRoom  = memberIds.has(f.id);
      const playing = statusOf(f) === 'playing';
      const statusTxt = playing ? T('social.playing', 'Jugando') : T('versus.online', 'Conectado');
      const row = document.createElement('div');
      row.className = 'versus-friend-row' + (playing ? ' playing' : '')
        + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(f.cellCode) ? ' cell-light-text' : '');
      const btnHtml = inRoom
        ? `<button class="versus-challenge-btn disabled" disabled>${T('lobby.inRoom', 'En la sala')}</button>`
        : `<button class="versus-challenge-btn" data-id="${f.id}" data-name="${f.name}">${T('lobby.invite', '+ Invitar')}</button>`;
      row.innerHTML =
        `<div class="versus-friend-avatar-wrap"><img class="versus-friend-avatar" src="${f.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false"></div>` +
        `<div class="versus-friend-info"><span class="versus-friend-name">${f.name}</span>` +
        `<span class="versus-friend-status${playing ? ' playing' : ''}"><span class="versus-friend-dot${playing ? ' playing' : ''}"></span>${statusTxt}</span></div>` +
        btnHtml;
      // Marco real (aro de la pfp) + celda real de fondo — antes esta fila
      // siempre mostraba el aro/fondo hardcodeados de siempre (mismo bug ya
      // resuelto en _renderMembers/.lobby-member-row). applyCellForStatus
      // (no cellUrl directo) para que titile con la variante -green si
      // está jugando, igual que en el panel social.
      window.CustomizeAssets?.applyFrame(row.querySelector('.versus-friend-avatar-wrap'), f.frameCode || '0001');
      window.CustomizeAssets?.applyCellForStatus(row, f.cellCode || '0001', playing ? 'playing' : 'online');
      list.appendChild(row);
    });
    list.querySelectorAll('.versus-challenge-btn[data-id]').forEach(btn => {
      _setInviteBtnCooldown(btn, btn.dataset.id);
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const fid = btn.dataset.id;
        const myName = localStorage.getItem('playerName') || T('lobby.someone', 'Alguien');
        window.LB.sendInvite(fid, { code: window.LB.getCode(), lobbyId: window.LB.getId(), fromName: myName });
        if (typeof window.showVersusToast === 'function') {
          window.showVersusToast(T('lobby.sentInvite', 'Invitación enviada a {name}').replace('{name}', btn.dataset.name));
        }
        _inviteCooldowns[fid] = Date.now() + INVITE_COOLDOWN_MS;
        _setInviteBtnCooldown(btn, fid);
      });
    });
  }

  function _openInvitePopup() {
    const pop   = document.getElementById('lobby-invite-popup');
    const list  = document.getElementById('lobby-invite-list');
    const empty = document.getElementById('lobby-invite-empty');
    if (!pop || !list) return;
    _renderInviteList(list, empty);
    pop.style.display = 'flex';
  }

  // Llamado desde el handler de realtime en monuments.js cuando un amigo cambia is_playing
  window._refreshLobbyInviteList = function() {
    const pop   = document.getElementById('lobby-invite-popup');
    const list  = document.getElementById('lobby-invite-list');
    const empty = document.getElementById('lobby-invite-empty');
    if (!pop || !list || pop.style.display === 'none' || !pop.offsetParent) return;
    _renderInviteList(list, empty);
  };

  // ── Notificación NO bloqueante arriba (genérica: invitaciones a sala y retos 1v1) ─
  // La barra cuenta UNA sola vez (10s) desde que llega; entrar/salir de paneles NO la
  // reinicia. ✓ acepta, ✗ rechaza, y al expirar se ejecuta el rechazo.
  const NOTIF_MS = 10000;
  let _notifTimer   = null;
  let _notifAccept  = null;
  let _notifDecline = null;
  let _queuedNotif  = null;  // invitación recibida mientras jugaba → se muestra al volver

  // Entregar la invitación encolada al terminar la partida (la llama _setPlaying(false))
  window.flushQueuedInvite = function() {
    if (_queuedNotif && !window._isPlaying && !window._lobbyActive && !window._vsActive) {
      const o = _queuedNotif; _queuedNotif = null; showInviteNotif(o);
    }
  };

  function _setInviteBadges(show) {
    ['play-invite-badge', 'versus-invite-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = show ? 'flex' : 'none';
    });
  }

  // opts: { name, sub, onAccept, onDecline }  (onDecline también corre al expirar)
  function showInviteNotif(opts) {
    opts = opts || {};
    // Si estoy jugando, encolar y entregar cuando termine la partida.
    if (window._isPlaying || window._lobbyActive || window._vsActive) { _queuedNotif = opts; return; }
    const banner = document.getElementById('lobby-invite-notif');
    const bar    = document.getElementById('lobby-notif-bar');
    if (!banner) return;
    _notifAccept  = opts.onAccept  || null;
    _notifDecline = opts.onDecline || null;
    const nameEl = document.getElementById('lobby-notif-name');
    if (nameEl) nameEl.textContent = opts.name || T('lobby.someone', 'Alguien');
    const subEl = document.getElementById('lobby-notif-sub');
    if (subEl) subEl.textContent = opts.sub || T('lobby.invitedYou', 'te invitó a su sala');
    banner.style.display = 'block';
    _setInviteBadges(true);
    if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
      void bar.offsetWidth; // forzar reflow para que el 100% quede aplicado antes de animar
      bar.style.transition = 'width ' + NOTIF_MS + 'ms linear';
      bar.style.width = '0%';
    }
    clearTimeout(_notifTimer);
    if (!opts.persistent) {
      _notifTimer = setTimeout(() => { _dismissNotif(); }, NOTIF_MS);
    }
  }
  function _dismissNotif() {
    const banner = document.getElementById('lobby-invite-notif');
    if (banner) {
      banner.classList.add('leaving');
      setTimeout(() => { banner.style.display = 'none'; banner.classList.remove('leaving'); }, 300);
    }
    _setInviteBadges(false);
    clearTimeout(_notifTimer);
    _notifAccept = _notifDecline = null;
  }
  window.showInviteNotif = showInviteNotif;
  window.dismissInviteNotif = _dismissNotif; // p. ej. cuando el host cancela el reto

  // ── Inbox de notificaciones ────────────────────────────────────────────────
  const INBOX_TTL = 5 * 60 * 1000; // 5 minutos; se borra también al cerrar/refrescar (sessionStorage)

  function _inboxKey() { return window._sbUserId ? ('vs_inbox_' + window._sbUserId) : null; }

  function _loadInbox() {
    const key = _inboxKey(); if (!key) return [];
    try { return (JSON.parse(sessionStorage.getItem(key) || '[]')).filter(x => x && x.ts && (Date.now() - x.ts < INBOX_TTL)); }
    catch { return []; }
  }

  function _saveInbox(items) {
    const key = _inboxKey(); if (!key) return;
    try { sessionStorage.setItem(key, JSON.stringify(items.filter(x => Date.now() - x.ts < INBOX_TTL).slice(0, 20))); } catch {}
  }

  function _pushToInbox(item) {
    const inbox = _loadInbox();
    if (inbox.find(x => x.id === item.id)) return;
    inbox.unshift(item);
    _saveInbox(inbox);
    _refreshBell();
  }

  function _removeFromInbox(id) {
    _saveInbox(_loadInbox().filter(x => x.id !== id));
    _refreshBell();
  }

  function _refreshBell() {
    const badge = document.getElementById('versus-notif-badge');
    if (!badge) return;
    const count = _loadInbox().length;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? '' : 'none';
  }

  window.addVersusNotif    = _pushToInbox;
  window.removeVersusNotif = _removeFromInbox;
  window.refreshVersusBell = _refreshBell;

  // Declina automáticamente todos los retos 1v1 pendientes del inbox (p. ej. al empezar a jugar)
  window._autoDismissVsInvites = function() {
    const inbox = _loadInbox();
    const vsItems = inbox.filter(x => x.type === 'vs');
    if (!vsItems.length) return;
    vsItems.forEach(item => {
      _removeFromInbox(item.id);
      if (window.VS && typeof window.VS.decline === 'function') window.VS.decline(item.matchId).catch(() => {});
    });
    _dismissNotif();
    _closeNotifPanel();
  };

  function _timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return T('notif.timeNow', 'Ahora');
    return T('notif.timeMin', 'Hace {n} min').replace('{n}', diff);
  }

  let _notifPanelOpen = false;

  function _closeNotifPanel() {
    const p = document.getElementById('versus-notif-panel');
    if (p) p.style.display = 'none';
    _notifPanelOpen = false;
  }

  function _renderNotifList() {
    const list  = document.getElementById('versus-notif-list');
    const empty = document.getElementById('versus-notif-empty');
    if (!list) return;

    const inbox = _loadInbox();
    list.innerHTML = '';
    if (empty) empty.style.display = inbox.length ? 'none' : '';

    inbox.forEach(item => {
      const typeLabel = item.type === 'vs'
        ? T('notif.vs1v1', 'Reto 1v1')
        : T('notif.lobbyInvite', 'Invitación a sala');
      const row = document.createElement('div');
      row.className = 'versus-notif-item';
      row.innerHTML =
        `<img class="versus-notif-avatar" src="${item.fromAvatar || 'images/profilepic/ppdefault.png'}" onerror="this.src='images/profilepic/ppdefault.png'">` +
        `<div class="versus-notif-info">` +
          `<span class="versus-notif-name">${item.fromName || '?'}</span>` +
          `<span class="versus-notif-type">${typeLabel}</span>` +
          `<span class="versus-notif-time">${_timeAgo(item.ts)}</span>` +
        `</div>` +
        `<div class="versus-notif-btns">` +
          `<button class="versus-notif-btn accept" data-id="${item.id}">✓</button>` +
          `<button class="versus-notif-btn decline" data-id="${item.id}">✗</button>` +
        `</div>`;
      list.appendChild(row);
    });

    list.querySelectorAll('.versus-notif-btn.accept').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const item = _loadInbox().find(x => x.id === btn.dataset.id);
        if (!item) return;
        _removeFromInbox(item.id);
        _dismissNotif(); // cerrar también el popup banner si está visible
        _closeNotifPanel();
        if (item.type === 'vs') {
          if (typeof window._vsAcceptFromInbox === 'function') await window._vsAcceptFromInbox(item.matchId);
        } else {
          try {
            await window.LB.joinByCode(item.code);
            if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
            if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
            enterLobby();
          } catch(e2) {
            const msg = (e2 && e2.message === 'started') ? T('lobby.started', 'La partida ya empezó') : T('lobby.notFound', 'Sala no encontrada');
            if (typeof window.showVersusToast === 'function') window.showVersusToast(msg);
          }
        }
      });
    });

    list.querySelectorAll('.versus-notif-btn.decline').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const item = _loadInbox().find(x => x.id === btn.dataset.id);
        _removeFromInbox(btn.dataset.id);
        if (item && item.type === 'vs' && window.VS) window.VS.decline(item.matchId);
        _renderNotifList();
      });
    });
  }

  // Abre el panel YA con lo que hay en caché (sessionStorage) — no espera al
  // servidor para eso, así el botón de campanita nunca "no hace nada" si la
  // conexión está colgada. La consulta a la DB por invitaciones nuevas corre
  // aparte, con timeout, y actualiza la lista si llega a tiempo.
  async function _renderNotifPanel() {
    const panel = document.getElementById('versus-notif-panel');
    if (!panel) return;
    _renderNotifList();
    panel.style.display = '';
    _notifPanelOpen = true;

    const uid = window._sbUserId;
    if (uid && window.sb) {
      try {
        const _p = window.sb.from('matches')
          .select('id, host_id, created_at').eq('guest_id', uid).eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(5);
        const res = typeof window.withConnCheck === 'function' ? await window.withConnCheck(_p, 6000) : await _p;
        const data = res ? res.data : null;
        if (data) {
          data.forEach(m => {
            const friends = (typeof getFriends === 'function') ? getFriends() : [];
            const host = friends.find(f => f.id === m.host_id);
            _pushToInbox({
              type: 'vs', id: m.id, matchId: m.id,
              fromName: host ? host.name : 'Alguien',
              fromAvatar: host ? host.avatar : 'images/profilepic/ppdefault.png',
              ts: new Date(m.created_at).getTime() || Date.now()
            });
          });
          if (_notifPanelOpen) _renderNotifList();
        }
      } catch {}
    }
  }

  // Invitación a sala (grupo): usa el banner genérico
  function showIncomingInvite(payload) {
    if (!payload || !payload.code) return;
    // Guardar en inbox
    _pushToInbox({
      type: 'lobby', id: payload.code, code: payload.code,
      fromName: payload.fromName || '?',
      fromAvatar: payload.fromAvatar || 'images/profilepic/ppdefault.png',
      ts: Date.now()
    });
    showInviteNotif({
      name: payload.fromName,
      sub:  T('lobby.invitedYou', 'te invitó a su sala'),
      onAccept: async () => {
        _removeFromInbox(payload.code);
        _closeNotifPanel(); // cerrar inbox si estaba abierto
        try {
          await window.LB.joinByCode(payload.code);
          if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
          if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
          enterLobby();
        } catch (e) {
          const msg = (e && e.message === 'started') ? T('lobby.started', 'La partida ya empezó') : T('lobby.notFound', 'Sala no encontrada');
          if (typeof window.showVersusToast === 'function') window.showVersusToast(msg);
        }
      },
      onDecline: () => { _removeFromInbox(payload.code); },
    });
  }
  window.showLobbyIncomingInvite = showIncomingInvite;

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lobby-notif-accept')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const a = _notifAccept; _dismissNotif(); if (a) a();
    });
    document.getElementById('lobby-notif-decline')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const d = _notifDecline; _dismissNotif(); if (d) d();
    });

    // Bell del panel versus: abre/cierra el inbox de invitaciones
    document.getElementById('versus-notif-bell')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (_notifPanelOpen) { _closeNotifPanel(); return; }
      _renderNotifPanel();
    });
    // Cerrar el panel al hacer clic fuera de él
    document.addEventListener('click', (e) => {
      if (!_notifPanelOpen) return;
      const panel = document.getElementById('versus-notif-panel');
      if (panel && !panel.contains(e.target)) _closeNotifPanel();
    });
  });

  // Mantener el popup de invitar al día con el estado real de los amigos (conectado/
  // jugando/en la sala), igual que el panel social. Se re-renderiza con cada refresco.
  if (typeof onFriendsUpdate === 'function') {
    onFriendsUpdate(() => {
      const p = document.getElementById('lobby-invite-popup');
      if (p && p.style.display !== 'none') _openInvitePopup();
    });
  }

  // Re-render room names when language switches (names are derived from i18n, not stored in DB)
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      _refreshLobbyName();
      const screen = document.getElementById('versus-screen-aleatorio');
      if (screen && screen.style.display !== 'none') loadPublicList(true);
    });
  }

  // ── Realtime del panel de salas públicas ──────────────────────────────────────
  // _publicChannel: postgres_changes (lobby_members/lobbies) → refresh periódico
  // _publicSignalReceiveCh: recibe broadcasts del host (canal diferente para no colisionar)
  let _publicChannel = null;
  let _publicSignalReceiveCh = null;

  // Cache local de nombres personalizados recibidos por broadcast.
  // Sobrevive los re-renders de loadPublicList para que el nombre no se pierda.
  const _roomNameCache = new Map(); // lobbyId → nombre personalizado

  let _publicRefreshTimer = null;
  function _schedulePublicRefresh(msg) {
    const p = msg?.payload;
    if (p?.id && typeof p.name !== 'undefined') {
      // Nombre actualizado por el host: cachear y aplicar al DOM ahora
      _roomNameCache.set(String(p.id), p.name);
      const list = document.getElementById('versus-public-list');
      if (list) {
        const rowEl = list.querySelector(`.versus-friend-row[data-lobby-id="${p.id}"]`);
        const nameSpan = rowEl?.querySelector('.versus-friend-name');
        if (nameSpan) nameSpan.textContent = p.name;
      }
      // No re-renderizar: el cache garantiza que loadPublicList también use el nombre correcto
      return;
    }
    clearTimeout(_publicRefreshTimer);
    _publicRefreshTimer = setTimeout(() => loadPublicList(true), 400);
  }

  let _publicPollTimer = null;

  function startPublicRealtime() {
    if (_publicChannel || _publicSignalReceiveCh) return;
    // Canal postgres_changes — distinto nombre a 'pub-room-signals' para no interferir
    _publicChannel = window.sb.channel('public-lobbies-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobbies' }, _schedulePublicRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, _schedulePublicRefresh)
      .subscribe();
    // Canal de señales del host: recibe broadcasts cuando el host cambia nombre/modo/visibilidad
    _publicSignalReceiveCh = window.sb.channel('pub-room-signals')
      .on('broadcast', { event: 'room-update' }, _schedulePublicRefresh)
      .subscribe();
    // Polling de respaldo: por si postgres_changes no está habilitado en Supabase
    _publicPollTimer = setInterval(() => loadPublicList(true), 6000);
  }

  function stopPublicRealtime() {
    if (_publicChannel) { try { _publicChannel.unsubscribe(); } catch (e) {} _publicChannel = null; }
    if (_publicSignalReceiveCh) { try { _publicSignalReceiveCh.unsubscribe(); } catch (e) {} _publicSignalReceiveCh = null; }
    clearInterval(_publicPollTimer);
    _publicPollTimer = null;
    // No limpiar _roomNameCache: sobrevive entre aperturas del panel para que el nombre persista
  }

  return { enterLobby, loadPublicList, startPublicRealtime, stopPublicRealtime, tryPendingJoin, tryRestore, showIncomingInvite, showInviteNotif, cancelCountdown: _stopCountdown };
})();
