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
  let _members  = [];     // [{id, name, avatar, score, isHost}]
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
  let _onFinished   = null;  // un miembro terminó su partida → coordinación fin grupal
  let _onPlayerGone = null;  // miembro perdió presencia durante partida activa
  let _onPlayerBack = null;  // miembro recuperó presencia durante partida activa
  let _resubTime    = 0;     // timestamp del último _subscribe(); guard contra kicks falsos
  const _pendingKicks = new Set(); // miembros que se desconectaron durante la partida

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

  async function _fetchMembers() {
    if (!_lobbyId) return;
    const { data, error } = await window.sb.from('lobby_members')
      .select('user_id, score, joined_at, p:user_id(username, avatar_url)')
      .eq('lobby_id', _lobbyId).order('joined_at');
    if (error) { console.warn('[LB] fetchMembers:', error.message); return; }
    _members = (data || []).map(m => ({
      id:     m.user_id,
      name:   (m.p && m.p.username) || '?',
      avatar: (m.p && m.p.avatar_url) || 'images/profilepic/ppdefault.png',
      score:  m.score || 0,
      isHost: m.user_id === _hostId,
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
  }

  function _subscribe() {
    if (_channel) _channel.unsubscribe();
    _resubTime = Date.now();
    const lid = _lobbyId;
    const uid = _myId();
    _channel = window.sb.channel('lobby-' + lid, { config: { broadcast: { self: true }, presence: { key: uid || 'anon' } } })
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
      .on('broadcast', { event: 'finished' }, ({ payload }) => {
        if (_onFinished) _onFinished(payload?.uid, payload?.score);
      })
      // Cualquier cambio de miembros (alta/baja/score) → re-consultar a la sala.
      // _fetchMembers detecta si me kickearon (ya no figuro en la lista). No filtramos
      // por lobby_id en cliente porque el payload de DELETE no siempre trae las columnas.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, () => {
        _fetchMembers();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lobbies',
        filter: 'id=eq.' + lid }, payload => {
        if (!payload.new) return;
        _lobby  = payload.new;
        _hostId = payload.new.host_id;
        if (payload.new.status === 'active' && _onStart) { _seed = payload.new.seed; _onStart(payload.new); }
        else if (payload.new.status === 'closed' && _onClosed) { const cb = _onClosed; cleanup(); cb('closed'); }
        else { _fetchMembers(); } // cambió el host (u otro campo) → re-render con el nuevo host
      })
      // Presencia: si alguien refresca o cierra la pestaña, su presencia "cae".
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!key || key === uid) return;
        clearTimeout(_graceTimers[key]);
        _graceTimers[key] = setTimeout(() => {
          if (window._lobbyActive && _onPlayerGone) _onPlayerGone(key);
          _handleMemberGone(key);
        }, GRACE_MS);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (!key || key === uid) return;
        if (_graceTimers[key]) { clearTimeout(_graceTimers[key]); delete _graceTimers[key]; }
        if (window._lobbyActive && _onPlayerBack) _onPlayerBack(key);
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
          const absent = _members.filter(m => m.id !== uid && !presentIds.has(m.id));
          if (!absent.length) return;
          await Promise.all(absent.map(m =>
            window.sb.from('lobby_members').delete()
              .eq('lobby_id', snapLobbyId).eq('user_id', m.id).catch(() => {})
          ));
          _fetchMembers();
        }, 5000);
      });
  }

  // Limpieza por desconexión (refresh/cierre de pestaña) durante la espera.
  const GRACE_MS = 5000;
  const _graceTimers = {};
  async function _handleMemberGone(goneId) {
    delete _graceTimers[goneId];
    if (window._lobbyActive) { _pendingKicks.add(goneId); return; } // se procesa al terminar la partida
    if (!_lobbyId) return;
    if (!_lobby || _lobby.status !== 'waiting') return;
    if (Date.now() - _resubTime < 9000) return;            // ignorar drops falsos post-resubscripción
    const present = _members.map(m => m.id);
    if (!present.includes(goneId)) return;                  // ya no estaba
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
      if (uid) await window.sb.from('lobbies').delete().eq('host_id', uid).eq('status', 'waiting');
      await window.sb.from('lobbies').delete().eq('status', 'waiting').lt('created_at', cutoff30m);
      await window.sb.from('lobbies').update({ status: 'closed' }).eq('status', 'active').lt('created_at', cutoff45m);
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
    // Nombre por defecto: "Sala de {host}" (best-effort: si la columna no existe, se ignora)
    const myName = (window._sbProfile && window._sbProfile.username) || localStorage.getItem('playerName') || 'Host';
    const defName = ((typeof t === 'function' ? t('lobby.roomOf') : 'Sala de')) + ' ' + myName;
    try { await window.sb.from('lobbies').update({ name: defName }).eq('id', _lobbyId); _lobby.name = defName; } catch (e) {}
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
    } catch (e) {}
  }
  function isPublic() { return !!(_lobby && _lobby.is_public); }

  async function setName(name) {
    if (!isHost() || !_lobbyId) return;
    try {
      await window.sb.from('lobbies').update({ name: name }).eq('id', _lobbyId);
      if (_lobby) _lobby.name = name;
      sendName(name);
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
    _seed = seed;
    await window.sb.from('lobbies').update({ status: 'active', seed }).eq('id', _lobbyId);
    // El propio host arranca por el realtime UPDATE, igual que el resto.
  }

  async function reportScore(score) {
    if (!_lobbyId) return;
    try { await window.sb.from('lobby_members').update({ score }).eq('lobby_id', _lobbyId).eq('user_id', _myId()); } catch (e) {}
  }

  // ── Broadcast efímero (cuenta regresiva / no estoy listo) ──────────────────────
  function _bcast(event, payload) {
    if (_channel) { try { _channel.send({ type: 'broadcast', event, payload: payload || {} }); } catch (e) {} }
  }
  function sendCountdown(until) { _bcast('cd', { until }); }
  function sendCancel()         { _bcast('cancel'); }
  function sendNotReady(name)   { _bcast('notready', { name }); }
  function sendWrong()          { _bcast('wrong', { uid: _myId() }); }
  function sendVisibility(pub)  { _bcast('visibility', { isPublic: !!pub }); }
  function sendName(name)       { _bcast('name', { name }); }
  function sendFinished(score)  { _bcast('finished', { uid: _myId(), score }); }

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
    if (emptyIds.length) window.sb.from('lobbies').delete().in('id', emptyIds).catch(() => {});
    return result.filter(l => l.count > 0 && l.count < l.max);
  }

  function cleanup() {
    if (_channel) { _channel.unsubscribe(); _channel = null; }
    Object.values(_graceTimers).forEach(clearTimeout);
    for (const k in _graceTimers) delete _graceTimers[k];
    _pendingKicks.clear();
    _lobbyId = _hostId = _lobby = _seed = null;
    _members = [];
    _onMembers = _onStart = _onClosed = _onCountdown = _onCancel = _onNotReady = _onWrong = _onVisibility = _onName = _onFinished = _onPlayerGone = _onPlayerBack = null;
  }

  return {
    create, joinByCode, joinById, leave, kick, start, reportScore, listPublic, cleanup,
    sendCountdown, sendCancel, sendNotReady, sendWrong, sendVisibility, sendName, sendFinished, setPublic, isPublic, restoreActive, transferHost, cleanupMine,
    sendInvite, listenForInvites, setName, getName,
    isHost, getMembers, getLobby, getCode, getId, getSeed,
    refreshMembers: () => _fetchMembers(),
    resubscribeChannel: () => { if (_lobbyId) _subscribe(); },
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
    onFinished:   cb => { _onFinished = cb; },
    onPlayerGone: cb => { _onPlayerGone = cb; },
    onPlayerBack: cb => { _onPlayerBack = cb; },
  };
})();

// ── UI + integración de juego ────────────────────────────────────────────────────
window.Lobby = (() => {
  const T = (k, d) => (typeof t === 'function' ? t(k) : d);

  // ── Roster del lobby ──────────────────────────────────────────────────────────
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
      joined.forEach(m => window.showVersusToast((m.name || '?') + ' ' + T('lobby.memberJoined', 'se unió a la sala')));
      leftIds.forEach(id => {
        const name = _memberNameCache[id] || T('lobby.someone', 'Alguien');
        window.showVersusToast(name + ' ' + T('lobby.memberLeft', 'salió de la sala'));
      });
    }
    _prevMemberIds = members.map(m => m.id);
    list.innerHTML = '';
    members.forEach(m => {
      const row = document.createElement('div');
      row.className = 'lobby-member-row' + (m.isHost ? ' is-host' : '') + (m.id !== myId ? ' clickable' : '');
      row.dataset.memberId = m.id;
      row.innerHTML =
        `<img class="lobby-member-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false">` +
        `<span class="lobby-member-name">${m.name}${m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : ''}</span>` +
        (m.isHost ? `<span class="lobby-member-badge">${T('lobby.host', 'HOST')}</span>` : '') +
        ((host && !m.isHost) ? `<button class="lobby-host-btn" data-id="${m.id}" title="${T('lobby.makeHost', 'Hacer host')}">👑</button>` : '') +
        ((host && !m.isHost) ? `<button class="lobby-kick-btn" data-id="${m.id}" title="${T('lobby.kick', 'Expulsar')}">✕</button>` : '');
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
            });
          } catch (err) {
            console.warn('[lobby] no se pudo abrir perfil:', err);
          }
        });
      }
      list.appendChild(row);
    });
    list.querySelectorAll('.lobby-kick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        window.LB.kick(btn.dataset.id);
      });
    });
    list.querySelectorAll('.lobby-host-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        window.LB.transferHost(btn.dataset.id);
        if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.hostTransferred', 'Host transferido'));
      });
    });
    // Contador y estado del botón empezar
    const cnt = document.getElementById('lobby-count');
    if (cnt) cnt.textContent = members.length + '/10';
    const startBtn = document.getElementById('lobby-start-btn');
    if (startBtn) {
      startBtn.disabled = members.length < 2;
      startBtn.classList.toggle('disabled', members.length < 2);
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

  // ── Cuenta regresiva de inicio (10s, cancelable) ───────────────────────────────
  let _counting = false;
  let _cdInterval = null;

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
  }

  function _startCountdown(until) {
    _counting = true;
    _applyCountdownButtons(true);
    clearInterval(_cdInterval);
    const tick = () => {
      const remain = Math.ceil((until - Date.now()) / 1000);
      const cd = document.getElementById('lobby-countdown');
      if (cd) cd.textContent = T('lobby.starting', 'Empezando en') + ' ' + Math.max(0, remain) + '…';
      if (remain <= 0) {
        clearInterval(_cdInterval); _cdInterval = null;
        // No iniciar si el host está en otro juego (versus 1v1 o cualquier otro modo)
        if (window.LB.isHost() && !window._isPlaying) window.LB.start();
      }
    };
    tick();
    _cdInterval = setInterval(tick, 200);
  }

  function _stopCountdown() {
    _counting = false;
    clearInterval(_cdInterval); _cdInterval = null;
    _applyCountdownButtons(false);
  }

  // Tracking de miembros previos para detectar joins/leaves y mostrar toasts
  let _prevMemberIds = [];
  let _memberNameCache = {}; // id → name, para recuperar el nombre de quien salió

  // ── Entrar al lobby (tras crear/unirse) ────────────────────────────────────────
  function _updateInviteBtn() {
    const inviteBtn = document.getElementById('lobby-invite-btn');
    if (!inviteBtn) return;
    // Host siempre puede invitar; miembros solo si la sala es pública
    inviteBtn.disabled = !(window.LB.isHost() || window.LB.isPublic());
  }

  function enterLobby() {
    const codeEl = document.getElementById('lobby-code');
    if (codeEl) codeEl.textContent = window.LB.getCode() || '------';
    _updateInviteBtn();
    _updateVisibilityBtn();
    _refreshLobbyName();

    _counting = false;
    window.LB.onMembers(_renderMembers);
    window.LB.onStart(lobby => _launchLobbyFlags(lobby.seed));
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
    try { rooms = await window.LB.listPublic(); } catch (e) {}
    _publicListLoading = false;

    // Construir el nuevo contenido en un fragment para un swap atómico (sin flicker)
    const myLobbyId = window.LB.getId();
    const frag = document.createDocumentFragment();
    rooms.forEach(r => {
      const isMine = myLobbyId && myLobbyId === r.id;
      const row = document.createElement('div');
      row.className = 'versus-friend-row';
      const roomModes = _getActiveModes(r);
      const modeIconsHtml = roomModes.map(m => `<img class="public-room-mode-icon" src="${_MODE_ICONS[m] || 'images/game1.png'}" alt="${m}">`).join('');
      row.innerHTML =
        `<div class="versus-friend-info">` +
          `<div class="public-room-name-row">` +
            `<div class="public-room-mode-icons">${modeIconsHtml}</div>` +
            `<span class="versus-friend-name">${r.name || (T('lobby.roomOf', 'Sala de') + ' ' + r.hostName)}</span>` +
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
  function _launchLobbyFlags(seed) {
    _stopCountdown();
    window.practiceConfig = window.practiceConfig || {};
    window.practiceConfig.active = false;
    window.pendingGameMode = 'flags';
    if (typeof window._setPlaying === 'function') window._setPlaying(true);

    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('loading-versus-group')?.classList.add('table-gone');
    document.getElementById('loading-versus-group')?.classList.remove('panel-visible');
    document.getElementById('splash-screen').style.display = 'none';

    // Estado de modo lobby: leaderboard con TODOS los rivales, RNG sembrado.
    window._lobbyActive = true;
    _finishedPlayers = new Map();
    _resultPresented = false;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    _refreshLobbyOpponents();

    // Cuando cambian los scores de la sala (realtime) → actualizar leaderboard
    window.LB.onMembers(() => {
      _refreshLobbyOpponents();
      if (typeof window.flagsSetLobbyScores === 'function') window.flagsSetLobbyScores(window._lobbyMembers);
      // Si alguien se desconectó durante la espera, re-verificar si ya terminaron todos
      if (_finishedPlayers.size > 0) _checkAllFinished();
    });
    // Cuando un miembro termina su partida → registrar y verificar si todos terminaron
    window.LB.onFinished((uid, score) => {
      if (uid) _finishedPlayers.set(uid, score ?? 0);
      _checkAllFinished();
    });
    // Alguien en la sala falló → glow en su tarjeta específica del lb
    window.LB.onWrong(uid => {
      if (typeof window.flagsTriggerLobbyWrongFor === 'function') window.flagsTriggerLobbyWrongFor(uid);
    });
    // Alguien perdió/recuperó presencia → mostrar/ocultar estado desconectado en su tarjeta
    window.LB.onPlayerGone(uid => {
      if (typeof window.flagsSetLobbyDisconnected === 'function') window.flagsSetLobbyDisconnected(uid, true);
    });
    window.LB.onPlayerBack(uid => {
      if (typeof window.flagsSetLobbyDisconnected === 'function') window.flagsSetLobbyDisconnected(uid, false);
    });
    // Si el host cierra a mitad, no hacemos nada disruptivo: la partida sigue local.

    if (typeof window.flagsSetSeed === 'function') window.flagsSetSeed(seed);
    if (typeof showFlagsMode === 'function') showFlagsMode();
  }

  // Construye window._lobbyMembers = rivales (todos menos yo)
  function _refreshLobbyOpponents() {
    const myId = window._sbUserId;
    window._lobbyMembers = window.LB.getMembers()
      .filter(m => m.id !== myId)
      .map(m => ({ id: m.id, name: m.name, avatar: m.avatar, score: m.score || 0 }));
  }

  // Reporte de respuesta desde flags.js
  window._lobbyReportAnswer = function(correct, score) {
    if (!window.LB.getId()) return;
    window.LB.reportScore(score);
    if (!correct) window.LB.sendWrong();
  };

  // ── Fin de partida grupal: esperar a todos antes de mostrar resultados ─────────
  let _finishedPlayers = new Map(); // uid → finalScore
  let _resultPresented = false;
  let _waitingTimeout  = null;

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

  function _checkAllFinished() {
    if (_resultPresented) return;
    const total = window.LB.getMembers().length;
    if (!total) return;
    if (_finishedPlayers.size >= total) _presentLobbyResult();
  }

  function _presentLobbyResult() {
    if (_resultPresented) return;
    _resultPresented = true;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    _hideLobbyWaiting();
    if (typeof hideFlagsMode === 'function') hideFlagsMode();
    if (typeof window._setPlaying === 'function') window._setPlaying(false);
    window._lobbyActive = false;
    window._lobbyMembers = [];
    if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
    // Procesar desconexiones que ocurrieron durante la partida
    if (_pendingKicks.size && isHost()) {
      const toKick = new Set(_pendingKicks);
      _pendingKicks.clear();
      toKick.forEach(async uid => {
        try { await window.sb.from('lobby_members').delete().eq('lobby_id', _lobbyId).eq('user_id', uid); } catch (e) {}
      });
      setTimeout(() => _fetchMembers(), 500);
    } else { _pendingKicks.clear(); }
    // Cortar callbacks de partida para que eventos tardíos no re-disparen nada
    window.LB.onFinished(null);
    window.LB.onPlayerGone(null);
    window.LB.onPlayerBack(null);
    // Resetear sala a 'waiting' ahora (antes de resubscribir canal) para que otros puedan unirse
    window.LB.resetToWaiting?.();
    // Mostrar loading panel-2 (nubes/cielo/mesa) como fondo del resultado
    const ls = document.getElementById('loading-screen');
    if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; ls.classList.add('table-shown'); }
    // Montar el panel del lobby detrás del overlay de resultados
    if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
    if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
    // Construir ranking con scores finales
    const members = window.LB.getMembers().map(m => ({
      ...m,
      score: _finishedPlayers.has(m.id) ? _finishedPlayers.get(m.id) : (m.score || 0),
    }));
    members.sort((a, b) => b.score - a.score);
    _showLobbyResult(members);
  }

  window._lobbyHandleGameEnd = function(myFinalScore) {
    const myId = window._sbUserId;
    if (window.LB.getId()) window.LB.reportScore(myFinalScore);
    _finishedPlayers.set(myId, myFinalScore);
    window.LB.sendFinished(myFinalScore);
    // Esperar a todos; timeout de seguridad de 30s por si alguien se desconecta
    _waitingTimeout = setTimeout(() => {
      _waitingTimeout = null;
      if (window._lobbyActive) _presentLobbyResult();
    }, 30000);
    _showLobbyWaiting();
    _checkAllFinished();
  };

  function _showLobbyResult(members) {
    _hideLobbyWaiting();
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
        `<img class="lobby-result-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false">` +
        `<span class="lobby-result-name">${m.name}${m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : ''}</span>` +
        `<span class="lobby-result-score">${(m.score || 0).toLocaleString()}</span>`;
      list.appendChild(row);
    });
    screen.style.display = 'flex';
    try { if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame); } catch (e) {}
  }

  function _returnFromLobbyResult() {
    const screen = document.getElementById('lobby-result-screen');
    if (screen) screen.style.display = 'none';
    _finishedPlayers = new Map();
    _resultPresented = false;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    const lid = window.LB.getId();
    if (lid) window.LB.reportScore(0).catch(() => {});
    // Segundo intento de reset por si falló en _presentLobbyResult (antes del resubscribeChannel)
    window.LB.resetToWaiting?.();
    // Loading screen ya está visible (mostrado en _presentLobbyResult); ir al lobby
    if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
    if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
    enterLobby();
    try { if (typeof playMusic === 'function' && typeof sfxMenuMusic !== 'undefined') playMusic(sfxMenuMusic); } catch(e) {}
  }

  // Salir de una partida lobby en curso (botón power/quit)
  window._lobbyAbandon = function() {
    _hideLobbyWaiting();
    _finishedPlayers = new Map();
    _resultPresented = false;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    window._lobbyActive = false;
    window._lobbyMembers = [];
    _pendingKicks.clear();
    if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
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
    document.getElementById('lobby-result-back')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _returnFromLobbyResult();
    });
    const _copyCode = () => {
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
  const _ALL_MODES  = ['flags', 'shapes', 'cities', 'monuments'];
  function _getActiveModes(lobby) {
    if (!lobby) return ['flags'];
    // modes field (future multi-mode): array or comma string
    if (lobby.modes) {
      const arr = Array.isArray(lobby.modes) ? lobby.modes : String(lobby.modes).split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) return arr;
    }
    // mode = 'all' → todos los 4
    if (lobby.mode === 'all') return _ALL_MODES;
    // single mode string
    return [lobby.mode || 'flags'];
  }
  function _refreshLobbyName() {
    const text  = document.getElementById('lobby-name-text');
    const edit  = document.getElementById('lobby-name-edit-btn');
    const input = document.getElementById('lobby-name-input');
    const conf  = document.getElementById('lobby-name-confirm-btn');
    if (!text) return;
    const host = window.LB.isHost();
    const name = window.LB.getName() || T('lobby.unnamed', 'Sala');
    if (_editingName && host) return; // no pisar mientras edita
    text.textContent = name;
    const iconsEl = document.getElementById('lobby-mode-icons');
    if (iconsEl) {
      const modes = _getActiveModes(window.LB.getLobby());
      iconsEl.innerHTML = modes.map(m => `<img src="${_MODE_ICONS[m] || 'images/game1.png'}" alt="${m}">`).join('');
    }
    text.style.display   = '';
    if (input) input.style.display = 'none';
    if (conf)  conf.style.display  = 'none';
    if (edit)  edit.style.display  = host ? '' : 'none';
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

  function _openInvitePopup() {
    const pop   = document.getElementById('lobby-invite-popup');
    const list  = document.getElementById('lobby-invite-list');
    const empty = document.getElementById('lobby-invite-empty');
    if (!pop || !list) return;
    // Limpiar solo las filas de amigos, sin tocar el div de "vacío" que vive adentro
    Array.from(list.children).forEach(el => { if (el.id !== 'lobby-invite-empty') el.remove(); });
    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const memberIds = new Set(window.LB.getMembers().map(m => m.id));
    const statusOf = f => (typeof getStatusObj === 'function')
      ? getStatusObj(f).cls
      : ((f.last_active && (Date.now() - new Date(f.last_active)) / 1000 < 120) ? (f.is_playing ? 'playing' : 'online') : 'offline');
    // Mostrar conectados Y jugando (como en social); ocultar offline.
    const shown = friends.filter(f => statusOf(f) !== 'offline');
    if (!shown.length) {
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      shown.forEach(f => {
        const inRoom  = memberIds.has(f.id);
        const playing = statusOf(f) === 'playing';
        const statusTxt = playing ? T('social.playing', 'Jugando') : T('versus.online', 'Conectado');
        const row = document.createElement('div');
        row.className = 'versus-friend-row' + (playing ? ' playing' : '');
        const btnHtml = inRoom
          ? `<button class="versus-challenge-btn disabled" disabled>${T('lobby.inRoom', 'En la sala')}</button>`
          : `<button class="versus-challenge-btn" data-id="${f.id}" data-name="${f.name}">${T('lobby.invite', '+ Invitar')}</button>`;
        row.innerHTML =
          `<img class="versus-friend-avatar" src="${f.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false">` +
          `<div class="versus-friend-info"><span class="versus-friend-name">${f.name}</span>` +
          `<span class="versus-friend-status${playing ? ' playing' : ''}"><span class="versus-friend-dot${playing ? ' playing' : ''}"></span>${statusTxt}</span></div>` +
          btnHtml;
        list.appendChild(row);
      });
      list.querySelectorAll('.versus-challenge-btn[data-id]').forEach(btn => {
        _setInviteBtnCooldown(btn, btn.dataset.id); // aplicar cooldown si sigue activo
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
    pop.style.display = 'flex';
  }

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
    _notifTimer = setTimeout(() => { const d = _notifDecline; _dismissNotif(); if (d) d(); }, NOTIF_MS);
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
  const INBOX_TTL = 10 * 60 * 1000; // 10 minutos; se borra también al cerrar/reiniciar (sessionStorage)

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

  async function _renderNotifPanel() {
    const panel = document.getElementById('versus-notif-panel');
    const list  = document.getElementById('versus-notif-list');
    const empty = document.getElementById('versus-notif-empty');
    if (!panel || !list) return;

    // Consultar DB por VS pendientes no cacheados aún
    const uid = window._sbUserId;
    if (uid && window.sb) {
      try {
        const { data } = await window.sb.from('matches')
          .select('id, host_id, created_at').eq('guest_id', uid).eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(5);
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
        }
      } catch {}
    }

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
        _renderNotifPanel();
      });
    });

    panel.style.display = '';
    _notifPanelOpen = true;
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

  // ── Realtime del panel de salas públicas ──────────────────────────────────────
  let _publicChannel = null;

  // Throttle: como lobby_members cambia frecuentemente (scores en partida), esperamos
  // un tick corto antes de re-renderizar para agrupar ráfagas de cambios simultáneos.
  let _publicRefreshTimer = null;
  function _schedulePublicRefresh() {
    clearTimeout(_publicRefreshTimer);
    _publicRefreshTimer = setTimeout(() => loadPublicList(true), 400);
  }

  function startPublicRealtime() {
    if (_publicChannel) return;
    _publicChannel = window.sb.channel('public-lobbies-watch')
      // Cambios de nombre, visibilidad, estado de la sala
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobbies' }, _schedulePublicRefresh)
      // Entradas y salidas de miembros → actualiza el contador de jugadores
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, _schedulePublicRefresh)
      .subscribe();
  }

  function stopPublicRealtime() {
    if (!_publicChannel) return;
    try { _publicChannel.unsubscribe(); } catch (e) {}
    _publicChannel = null;
  }

  return { enterLobby, loadPublicList, startPublicRealtime, stopPublicRealtime, tryPendingJoin, tryRestore, showIncomingInvite, showInviteNotif, cancelCountdown: _stopCountdown };
})();
