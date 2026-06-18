// ── VERSUS MODE ───────────────────────────────────────────────────────────────
// Matchmaking, Realtime channel, y lógica de partida 1v1.
//
// La sincronización de preguntas la maneja flags.js con un RNG sembrado DEDICADO
// (window.flagsSetSeed/flagsClearSeed). No tocamos Math.random global porque otras
// llamadas (animaciones, emotes, UI) ocurren en distinto orden en cada cliente y
// desincronizarían la secuencia. Ver flags.js → flagsRand().
function _startSeededRandom(seed) {
  if (typeof window.flagsSetSeed === 'function') window.flagsSetSeed(seed);
}
function _restoreRandom() {
  if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
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
  let _pollId    = null;
  let _started   = false; // evita que _onStart se dispare más de una vez
  let _oppGoneTimer = null; // gracia antes de declarar abandono por presencia
  const OPP_GRACE_MS = 6000;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _myId() { return window._sbUserId || null; }

  async function _getMatch(id) {
    const { data, error } = await window.sb
      .from('matches').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  // ── Canal Realtime ─────────────────────────────────────────────────────────

  function _subscribe(matchId) {
    if (_channel) _channel.unsubscribe();
    const uid = _myId();
    _channel = window.sb
      .channel('match-' + matchId, { config: { presence: { key: uid || 'anon' } } })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
      }, payload => {
        if (payload.new.id !== matchId) return;
        const m = payload.new;
        _match = m;
        if (m.status === 'active' && _onStart && !_started) { _started = true; _onStart(m); }
        if (m.status === 'finished' && _onEnd)  _onEnd(m.winner_id);
        // Abandono explícito del rival (escribió status=abandoned con winner=nosotros)
        if (m.status === 'abandoned' && _onOppLeft) { clearTimeout(_oppGoneTimer); _onOppLeft(); }
        if (m.status === 'active' && _onScore) _onScore(m.host_score, m.guest_score);
      })
      // Presencia: detecta cierre de pestaña / pérdida de conexión del rival.
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!key || key === uid) return; // el que se fue soy yo o un desconocido
        clearTimeout(_oppGoneTimer);
        _oppGoneTimer = setTimeout(() => { if (_onOppLeft) _onOppLeft(); }, OPP_GRACE_MS);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key && key !== uid) clearTimeout(_oppGoneTimer); // el rival volvió a tiempo
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await _channel.track({ uid: uid, t: Date.now() }); } catch (e) {}
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
      }, payload => {
        const m = payload.new;
        // Filtrar en cliente: solo invitaciones donde soy el guest
        if (m.guest_id === uid && m.status === 'pending' && _onInvite) _onInvite(m);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
      }, payload => {
        const m = payload.new;
        // El host canceló/expiró el reto antes de que yo respondiera → descartar la noti
        if (m.guest_id === uid && (m.status === 'expired' || m.status === 'declined' || m.status === 'cancelled') && _onInviteCancel) _onInviteCancel(m);
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
    // Auto-expirar si el guest no responde en 30s
    setTimeout(() => expire(), 30000);
    return data;
  }

  // ── Aceptar invitación (guest) ─────────────────────────────────────────────

  async function accept(matchId) {
    _matchId = matchId;
    _role    = 'guest';
    _match   = await _getMatch(matchId);
    _subscribe(matchId);
    const { error } = await window.sb
      .from('matches').update({ status: 'active' }).eq('id', matchId);
    if (error) throw error;
  }

  // ── Rechazar invitación (guest) ────────────────────────────────────────────

  async function decline(matchId) {
    await window.sb.from('matches')
      .update({ status: 'declined' }).eq('id', matchId || _matchId);
    cleanup();
  }

  // ── Expirar (host, sin respuesta) ─────────────────────────────────────────

  async function expire() {
    if (!_matchId) return;
    const current = await _getMatch(_matchId);
    if (current.status === 'pending') {
      await window.sb.from('matches')
        .update({ status: 'expired' }).eq('id', _matchId);
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

  async function reportScore(score) {
    if (!_matchId || !_role) return;
    const field = _role === 'host' ? 'host_score' : 'guest_score';
    await window.sb.from('matches')
      .update({ [field]: score }).eq('id', _matchId);
  }

  // ── Terminar partida (host cierra, decide winner) ──────────────────────────

  async function finish() {
    if (!_matchId) return;
    const m = await _getMatch(_matchId);
    const winnerId = m.host_score >= m.guest_score ? m.host_id : m.guest_id;
    await window.sb.from('matches')
      .update({ status: 'finished', winner_id: winnerId }).eq('id', _matchId);
  }

  // ── Abandonar (yo me voy → el rival gana) ──────────────────────────────────
  // best-effort: notifica al rival por DB; la presencia del canal lo cubre igual.
  async function abandon() {
    if (!_matchId || !_role) { cleanup(); return; }
    const winnerId = _role === 'host' ? (_match && _match.guest_id) : (_match && _match.host_id);
    try {
      await window.sb.from('matches')
        .update({ status: 'abandoned', winner_id: winnerId || null }).eq('id', _matchId);
    } catch (e) {}
    cleanup();
  }

  // ── Limpiar estado ─────────────────────────────────────────────────────────

  function cleanup() {
    if (_channel) { _channel.unsubscribe(); _channel = null; }
    clearInterval(_pollId);
    clearTimeout(_oppGoneTimer);
    _matchId = _role = _match = null;
    _onStart = _onScore = _onEnd = _onOppLeft = null;
    _started = false;
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
    listenForInvites,
    stopListeningForInvites,
    cleanup,
    onStart:   cb => { _onStart = cb; },
    onScore:   cb => { _onScore = cb; },
    onEnd:     cb => { _onEnd = cb; },
    onOppLeft: cb => { _onOppLeft = cb; },
    getMatch: () => _match,
    getRole:  () => _role,
    getMatchId: () => _matchId,
    getSeed:  () => _match ? _match.seed : null,
    isHost:   () => _role === 'host',
  };
})();

// ── VERSUS UI ─────────────────────────────────────────────────────────────────

(function() {
  const TIMEOUT_MS = 30000;
  let _resultShown = false;    // evita mostrar la pantalla de resultado dos veces
  let _endedByAbandon = false; // el match terminó por abandono del rival
  let _outTimer = null;
  let _inTimer  = null;
  let _pendingOppName   = null; // nombre del oponente guardado para ambos lados
  let _pendingOppAvatar = null;

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

  function _showScreen(name) {
    VERSUS_SCREENS.forEach(s => {
      const el = document.getElementById('versus-screen-' + s);
      if (el) el.style.display = (s === name) ? 'flex' : 'none';
    });
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
    versusGoTo('root', true);
  }

  function hideVersusPanel() {
    const panel = document.getElementById('loading-versus-group');
    if (!panel) return;
    panel.classList.remove('panel-visible');
    panel.classList.add('table-gone');
    _versusStack = ['root'];
  }

  // Toast efímero reutilizable por lobby.js
  let _toastTimer = null;
  window.showVersusToast = function(msg) {
    const el = document.getElementById('versus-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
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

  // Crear sala: si ya tengo una activa, pedir confirmación para abandonarla
  async function _doCreateRoom(isPublic) {
    try { await window.LB.create(isPublic); versusGoTo('lobby'); window.Lobby.enterLobby(); }
    catch (e) { window.showVersusToast(T('lobby.createError', 'No se pudo crear la sala')); }
  }
  function _createRoomGuarded(isPublic) {
    if (window.LB && window.LB.getId()) {
      window.versusConfirm(T('lobby.alreadyHave', 'Ya tenés una sala creada. ¿Abandonarla y crear una nueva?'), async () => {
        await window.LB.leave();
        _doCreateRoom(isPublic);
      });
    } else {
      _doCreateRoom(isPublic);
    }
  }

  function _renderOnlineFriends() {
    const list    = document.getElementById('versus-friends-list');
    const emptyEl = document.getElementById('versus-empty-msg');
    if (!list) return;
    list.innerHTML = '';

    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const statusOf = f => (typeof getStatusObj === 'function')
      ? getStatusObj(f).cls
      : ((f.last_active && (Date.now() - new Date(f.last_active)) / 1000 < 120) ? (f.is_playing ? 'playing' : 'online') : 'offline');
    const online = friends.filter(f => statusOf(f) !== 'offline'); // conectados Y jugando

    if (online.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const T = (k, d) => (typeof t === 'function' ? t(k) : d);
    online.forEach(f => {
      const playing = statusOf(f) === 'playing';
      const statusTxt = playing ? T('social.playing', 'Jugando') : T('versus.online', 'Conectado');
      const row = document.createElement('div');
      row.className = 'versus-friend-row' + (playing ? ' playing' : '');
      row.innerHTML =
        `<img class="versus-friend-avatar" src="${f.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false">` +
        `<div class="versus-friend-info">` +
          `<span class="versus-friend-name">${f.name}</span>` +
          `<span class="versus-friend-status${playing ? ' playing' : ''}"><span class="versus-friend-dot${playing ? ' playing' : ''}"></span>${statusTxt}</span>` +
        `</div>` +
        `<button class="versus-challenge-btn" data-id="${f.id}" data-name="${f.name}" data-avatar="${f.avatar || ''}">${T('versus.challenge', 'Retar')}</button>`;
      list.appendChild(row);
    });

    list.querySelectorAll('.versus-challenge-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const guestId   = btn.dataset.id;
        const guestName = btn.dataset.name;
        const guestAvatar = btn.dataset.avatar;
        _sendInvite(guestId, guestName, guestAvatar);
      });
    });
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

  // ── Outgoing invite (host) ────────────────────────────────────────────────

  async function _sendInvite(guestId, guestName, guestAvatar) {
    _pendingOppName   = guestName;
    _pendingOppAvatar = guestAvatar;
    try {
      await window.VS.invite(guestId);
    } catch(e) { console.warn('[VS] invite error:', e); return; }

    // NO cerrar el panel competitivo: el popup de "esperando" se muestra encima y al
    // cancelar/expirar volvés al panel de amigos, no al panel 2.
    _showOutgoingPopup(guestName, guestAvatar);

    window.VS.onStart(match => {
      _hideOutgoingPopup();
      _launchVersusFlags(match);
    });
  }

  function _showOutgoingPopup(name, avatar) {
    const pop  = document.getElementById('vs-outgoing-popup');
    const bar  = document.getElementById('vs-out-bar');
    if (!pop) return;
    document.getElementById('vs-out-name').textContent = name;
    document.getElementById('vs-out-pic').src = avatar || 'images/profilepic/ppdefault.png';
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

    // Reto 1v1 → misma notificación NO bloqueante que las invitaciones a sala
    if (typeof window.showInviteNotif === 'function') {
      window.showInviteNotif({
        name,
        sub: T('vs.challengedYou', 'te retó a un 1v1'),
        onAccept: async () => {
          try {
            await window.VS.accept(match.id);
            const m = window.VS.getMatch();
            if (m) _launchVersusFlags(m);
            else throw new Error('no match');
          } catch (e) {
            console.warn('[VS] accept error:', e);
            window.showVersusToast(T('lobby.joinFailed', 'No pudiste unirte, intentá de nuevo'));
          }
        },
        onDecline: () => { window.VS.decline(match.id); },
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
    document.getElementById('versus-btn-create-private')?.addEventListener('click', () => {
      _sfx(); _createRoomGuarded(true); // pública por defecto
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
      try { await window.LB.joinByCode(code); versusGoTo('lobby'); window.Lobby.enterLobby(); }
      catch (e) {
        const msg = (e && e.message === 'started') ? T('lobby.started', 'La partida ya empezó')
                  : (e && e.message === 'not_found') ? T('lobby.notFound', 'Sala no encontrada')
                  : T('lobby.joinError', 'No se pudo unir a la sala');
        window.showVersusToast(msg);
      }
    });

    // ── ALEATORIO ──
    document.getElementById('versus-btn-create-public')?.addEventListener('click', () => {
      _sfx(); _createRoomGuarded(true);
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
        if (match) _launchVersusFlags(match);
      } catch(e) { console.warn('[VS] accept error:', e); }
    });

    // Rechazar invitación
    document.getElementById('vs-in-decline')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const matchId = document.getElementById('vs-in-decline').dataset.matchId;
      window.VS.decline(matchId);
      _hideIncomingPopup();
    });

    // Volver al menú desde la pantalla de resultado versus
    document.getElementById('vs-result-back')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
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
    };
    window._vsOppScore = 0;
  }

  function _teardownVsOpponent() {
    window._vsActive   = false;
    window._vsOpponent = null;
    window._vsOppScore = 0;
  }

  // Llamado desde flags.js cuando el jugador responde correcto/incorrecto
  window._vsReportAnswer = function(correct, score) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportScore(score);
  };

  // ── Fin de partida → pantalla de resultado W/L ─────────────────────────────
  // Llamado desde flags.js (hideFlagsMode) cuando termina el tiempo en versus.
  // Ambos relojes arrancaron a la vez, así que ambos terminan casi simultáneos:
  // reportamos el score final, esperamos un instante a que llegue el del rival
  // por Realtime, y cada cliente decide su resultado localmente.
  window._vsHandleGameEnd = function(myFinalScore) {
    const isHost = window.VS.isHost();
    if (window.VS.getMatchId()) window.VS.reportScore(myFinalScore);
    setTimeout(() => {
      const m = window.VS.getMatch() || {};
      const oppScore = isHost ? (m.guest_score || 0) : (m.host_score || 0);
      const myScore  = Math.max(myFinalScore, isHost ? (m.host_score || 0) : (m.guest_score || 0));
      const outcome  = myScore > oppScore ? 'win' : (myScore < oppScore ? 'lose' : 'draw');
      _showVsResult(outcome, myScore, oppScore);
    }, 600);
  };

  // El rival se desconectó o abandonó → gano por abandono.
  function _onOpponentAbandoned() {
    if (_resultShown) return;
    _endedByAbandon = true;
    // Detener el juego de banderas si sigue corriendo
    if (typeof window.flagsHardReset === 'function') { try { window.flagsHardReset(); } catch (e) {} }
    // flagsHardReset no oculta el HUD (countdown/score/panel): hacerlo aquí, si no
    // el countdown (z-index 1000) queda encima de la pantalla de resultado.
    ['flags-countdown-widget', 'flags-score-display', 'flags-right-panel',
     'flags-wrapper', 'flags-timeup-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.getElementById('flags-speed-bonus-text')?.classList.remove('visible');
    const m = window.VS.getMatch() || {};
    const isHost   = window.VS.isHost();
    const myScore  = isHost ? (m.host_score || 0)  : (m.guest_score || 0);
    const oppScore = isHost ? (m.guest_score || 0) : (m.host_score || 0);
    _showVsResult('win', myScore, oppScore, 'abandon');
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
      title.textContent = outcome === 'win'  ? T('vs.result.win',  '¡GANASTE!')
                        : outcome === 'lose' ? T('vs.result.lose', 'PERDISTE')
                        :                      T('vs.result.draw', '¡EMPATE!');
    }
    const sub = document.getElementById('vs-result-sub');
    if (sub) {
      sub.textContent = reason === 'abandon' ? T('vs.result.abandon', 'Tu rival abandonó la partida') : '';
      sub.style.display = reason === 'abandon' ? 'block' : 'none';
    }
    document.getElementById('vs-result-me-name').textContent  = localStorage.getItem('playerName') || T('vs.result.you', 'Tú');
    document.getElementById('vs-result-me-pic').src           = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    document.getElementById('vs-result-me-score').textContent = (myScore || 0).toLocaleString();
    const opp = window._vsOpponent || {};
    document.getElementById('vs-result-opp-name').textContent  = opp.name || 'Rival';
    document.getElementById('vs-result-opp-pic').src           = opp.avatar || 'images/profilepic/ppdefault.png';
    document.getElementById('vs-result-opp-score').textContent = (oppScore || 0).toLocaleString();
    if (screen) screen.style.display = 'flex';
    try {
      if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
    } catch (e) {}
  }

  function _vsReturnToMenu() {
    const screen = document.getElementById('vs-result-screen');
    if (screen) screen.style.display = 'none';
    // Registrar el match como finalizado en la DB (solo partidas normales; el abandono
    // ya quedó marcado por el que se fue). Antes de cleanup (que borra el matchId).
    if (!_endedByAbandon && window.VS && window.VS.isHost() && typeof window.VS.finish === 'function') {
      try { window.VS.finish(); } catch (e) {}
    }
    _resultShown = false;
    _endedByAbandon = false;
    if (window.VS && typeof window.VS.cleanup === 'function') window.VS.cleanup();
    // Importante: limpiar el estado versus ANTES de quitToMenu, para que su guard de
    // abandono (if window._vsActive) no se dispare (la partida ya terminó normal).
    _teardownVsOpponent();
    _restoreRandom();
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

  // ── Arrancar partida versus ───────────────────────────────────────────────

  function _launchVersusFlags(match) {
    const seed = match.seed;
    // Configurar entorno igual que si el jugador hubiera clickeado flags-btn
    window.practiceConfig = window.practiceConfig || {};
    window.practiceConfig.active = false;
    window.pendingGameMode = 'flags';
    if (typeof window._setPlaying === 'function') window._setPlaying(true);

    // Ocultar loading/versus/splash, dejar solo el juego
    document.getElementById('loading-screen').style.display      = 'none';
    document.getElementById('loading-versus-group')?.classList.add('table-gone');
    document.getElementById('loading-versus-group')?.classList.remove('panel-visible');
    document.getElementById('splash-screen').style.display       = 'none';
    document.getElementById('vs-outgoing-popup').style.display   = 'none';
    document.getElementById('vs-incoming-popup').style.display   = 'none';

    // Modo versus activo: el oponente entra en el leaderboard real de flags.
    window._vsActive = true;
    _resultShown = false;
    _endedByAbandon = false;
    _setupVsOpponent(match);

    // El rival se desconectó / cerró la pestaña / abandonó → gano por abandono
    window.VS.onOppLeft(_onOpponentAbandoned);

    // Actualizar el leaderboard cuando llega score del oponente por Realtime
    window.VS.onScore((hostScore, guestScore) => {
      const isHost   = window.VS.isHost();
      const oppScore = isHost ? guestScore : hostScore;
      if (typeof window.flagsSetVsOpponentScore === 'function') {
        window.flagsSetVsOpponentScore(oppScore);
      }
    });

    window.VS.onEnd(winnerId => {
      _restoreRandom();
      _teardownVsOpponent();
    });

    // Arrancar con RNG seeded → mismas preguntas para ambos
    _startSeededRandom(seed);
    if (typeof showFlagsMode === 'function') {
      showFlagsMode();
    }
  }

  // ── Escuchar invitaciones al loguear ─────────────────────────────────────

  window._vsStartListening = function() {
    window.VS.listenForInvites(
      match => _showIncomingPopup(match),
      () => { if (typeof window.dismissInviteNotif === 'function') window.dismissInviteNotif(); } // host canceló
    );
  };

  // Exponer funciones para monuments.js
  window.showVersusPanel = showVersusPanel;
  window.hideVersusPanel = hideVersusPanel;
})();
