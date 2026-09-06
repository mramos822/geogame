// ── MENSAJES (chat directo 1:1 entre amigos) ───────────────────────────────
// A propósito NO usa un canal privado de Realtime con policy propia sobre
// realtime.messages (como matches/solo-*, ver vs.js/spectate.js) — ese
// patrón fue la fuente de un bug serio (cast de topic roto + Postgres
// aplanando un EXISTS en un join, saltándose la protección). Acá el tiempo
// real sale de postgres_changes sobre la tabla real direct_messages: Realtime
// respeta la RLS de la tabla tal cual la vería cualquier SELECT normal, sin
// ningún parseo de topic de por medio — mucho más simple y sin esa clase de
// bug posible.
window.Chat = (() => {
  let _messages = [];        // hilo de la conversación abierta
  let _activeFriend = null;  // {id, name, avatar, frameCode, ...} — ver getFriends()
  let _view = 'inbox';       // 'inbox' | 'chat'
  let _activeTab = 'history'; // 'history' | 'online' | 'all'
  let _lastById = new Map();   // friendId -> último mensaje (any direction) — recalculado en cada refreshInbox
  let _unreadById = new Map(); // friendId -> cantidad de mensajes suyos sin leer — ver _loadUnreadCounts
  let _rtChannel = null;
  let _inboxLoading = false;
  let _panelOpen = false;

  function _myId() { return window._sbUserId || null; }
  function _T(k, d, vars) { return (typeof t === 'function') ? t(k, vars) : d; }
  function _fmtTime(iso) {
    try { return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function _escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Mismo criterio de estado que el panel de Retar 1v1 / Social (ver
  // getStatusObj/socialStatusText en monuments.js) — reusado tal cual para
  // que "conectado"/"jugando"/desconectado signifique lo mismo en todos
  // lados, en vez de reinventar el cálculo acá.
  function _statusOf(f) {
    return (typeof getStatusObj === 'function') ? getStatusObj(f) : { cls: 'offline' };
  }
  function _statusText(f) {
    return (typeof socialStatusText === 'function') ? socialStatusText(f) : '';
  }

  // ── Bandeja: último mensaje por amigo ──────────────────────────────────────
  // No hay una tabla/vista de "conversaciones" separada — se arma acá mismo
  // leyendo los últimos mensajes donde participo y quedándome con el primero
  // (más nuevo, por el order desc) que aparece para cada otro usuario. Con el
  // límite de amigos típico de este juego esto alcanza de sobra; si el
  // volumen de mensajes creciera mucho convendría una vista materializada.
  async function _loadLastMessages() {
    const uid = _myId();
    if (!uid || !window.sb) return new Map();
    const { data, error } = await window.sb
      .from('direct_messages')
      .select('id, sender_id, receiver_id, content, created_at, read_at')
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) { console.warn('[chat] loadLastMessages:', error.message); return new Map(); }
    const map = new Map();
    (data || []).forEach(m => {
      const otherId = m.sender_id === uid ? m.receiver_id : m.sender_id;
      if (!map.has(otherId)) map.set(otherId, m);
    });
    return map;
  }

  // Cuántos mensajes sin leer llegaron de CADA amigo — la burbujita de la
  // fila muestra este número, no un simple puntito (a diferencia de
  // _lastById, que solo mira si el ÚLTIMO mensaje está sin leer). Consulta
  // liviana: solo trae sender_id de lo no leído, cuenta client-side.
  async function _loadUnreadCounts() {
    const uid = _myId();
    if (!uid || !window.sb) return new Map();
    const { data, error } = await window.sb
      .from('direct_messages')
      .select('sender_id')
      .eq('receiver_id', uid)
      .is('read_at', null);
    if (error) { console.warn('[chat] loadUnreadCounts:', error.message); return new Map(); }
    const map = new Map();
    (data || []).forEach(m => map.set(m.sender_id, (map.get(m.sender_id) || 0) + 1));
    return map;
  }

  async function refreshInbox() {
    if (_inboxLoading) return;
    _inboxLoading = true;
    try {
      const [lastById, unreadById] = await Promise.all([_loadLastMessages(), _loadUnreadCounts()]);
      _lastById = lastById;
      _unreadById = unreadById;
      if (_view === 'inbox') _renderCurrentTab();
    } finally {
      _inboxLoading = false;
    }
  }

  // Arma la lista a mostrar según la pestaña activa, siempre leyendo el
  // estado de conexión FRESCO desde getFriends() (no una foto vieja tomada
  // al abrir el panel) — así basta con re-renderizar (ver onFriendsUpdate
  // más abajo) para que "conectados"/"jugando" se vea al segundo, sin
  // re-pedir mensajes.
  function _rowsForTab(tab) {
    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const withMeta = friends.map(f => {
      const last = _lastById.get(f.id) || null;
      const unreadCount = _unreadById.get(f.id) || 0;
      return { friend: f, last, unreadCount, status: _statusOf(f) };
    });
    if (tab === 'history') {
      return withMeta
        .filter(r => r.last)
        .sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
    }
    if (tab === 'online') {
      return withMeta
        .filter(r => r.status.cls !== 'offline')
        .sort((a, b) => (a.status.cls === b.status.cls ? a.friend.name.localeCompare(b.friend.name) : (a.status.cls === 'playing' ? -1 : 1)));
    }
    // 'all'
    return withMeta.sort((a, b) => a.friend.name.localeCompare(b.friend.name));
  }

  // Orden pedido: nombre, bandera, estado de conexión — todo en la primera
  // línea; el último mensaje recibido abajo del nombre, no al costado.
  function _buildRow({ friend, last, unreadCount, status }) {
    const uid = _myId();
    const unread = unreadCount > 0;
    const row = document.createElement('div');
    row.className = 'versus-friend-row' + (status.cls === 'playing' ? ' playing' : '') + (unread ? ' is-unread' : '')
      + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(friend.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = friend.id;
    const statusTxt = _statusText(friend);
    const flagUrl = window.flagUrlForCountryCode?.(friend.country_code);
    const previewHtml = last
      ? `<span class="loading-messages-preview">${_escapeHtml(last.sender_id === uid ? _T('chat.you', 'Tú: ') + last.content : last.content)}</span>`
      : `<span class="loading-messages-preview loading-messages-preview-empty">${_T('chat.noPreview', 'Sin mensajes todavía')}</span>`;
    row.innerHTML =
      `<div class="versus-friend-avatar-wrap"><img class="versus-friend-avatar" src="${friend.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false"></div>` +
      `<div class="versus-friend-info">` +
        `<div class="loading-messages-topline">` +
          `<span class="versus-friend-name">${_escapeHtml(friend.name)}</span>` +
          (flagUrl ? `<img class="loading-messages-flag" src="${flagUrl}" alt="" draggable="false" oncontextmenu="return false">` : '') +
          `<span class="versus-friend-status${status.cls === 'playing' ? ' playing' : status.cls === 'offline' ? ' offline' : ''}">` +
            `<span class="versus-friend-dot${status.cls === 'playing' ? ' playing' : status.cls === 'offline' ? ' offline' : ''}"></span>${_escapeHtml(statusTxt)}` +
          `</span>` +
        `</div>` +
        previewHtml +
      `</div>` +
      (last ? `<span class="loading-messages-time">${_fmtTime(last.created_at)}</span>` : '') +
      (unread ? `<span class="loading-messages-unread-badge"><span class="notif-badge-num">${_badgeLabel(unreadCount)}</span></span>` : '');
    window.CustomizeAssets?.applyFrame(row.querySelector('.versus-friend-avatar-wrap'), friend.frameCode || '0001');
    window.CustomizeAssets?.applyCellForStatus(row, friend.cellCode || '0001', status.cls === 'playing' ? 'playing' : 'online');
    row.addEventListener('click', () => openConversation(friend));
    return row;
  }

  function _renderCurrentTab() {
    const list = document.getElementById('loading-messages-list');
    if (!list) return;
    const rows = _rowsForTab(_activeTab);
    list.innerHTML = '';
    if (!rows.length) {
      const emptyKey = _activeTab === 'online' ? 'versus.noneOnline' : _activeTab === 'history' ? 'chat.noConversations' : 'social.noData';
      const empty = document.createElement('div');
      empty.className = 'loading-messages-empty';
      empty.textContent = _T(emptyKey, _activeTab === 'online' ? 'No hay amigos conectados ahora.' : 'Agrega amigos para empezar a chatear');
      list.appendChild(empty);
      return;
    }
    rows.forEach(r => list.appendChild(_buildRow(r)));
  }

  function _setTab(tab) {
    _activeTab = tab;
    ['history', 'online', 'all'].forEach(k => {
      document.getElementById('loading-messages-tab-' + k)?.classList.toggle('active', k === tab);
    });
    _renderCurrentTab();
  }

  // ── Conversación individual ─────────────────────────────────────────────────
  async function _loadHistory(friendId) {
    const uid = _myId();
    if (!uid || !window.sb) return [];
    const { data, error } = await window.sb
      .from('direct_messages')
      .select('id, sender_id, receiver_id, content, created_at, read_at')
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${uid})`)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) { console.warn('[chat] loadHistory:', error.message); return []; }
    return data || [];
  }

  function _renderMessages() {
    const box = document.getElementById('loading-chat-messages');
    if (!box) return;
    if (!_messages.length) {
      box.innerHTML = '<div class="loading-chat-empty">' + _T('chat.noMessages', 'Todavía no hay mensajes. ¡Saluda!') + '</div>';
      return;
    }
    const uid = _myId();
    box.innerHTML = _messages.map(m => {
      const mine = m.sender_id === uid;
      const cls = 'chat-bubble' + (m._pending ? ' is-pending' : '') + (m._failed ? ' is-failed' : '');
      return `<div class="chat-bubble-row ${mine ? 'mine' : 'theirs'}">` +
        `<div class="${cls}">${_escapeHtml(m.content)}<span class="chat-bubble-time">${_fmtTime(m.created_at)}</span></div>` +
      `</div>`;
    }).join('');
  }

  function _scrollToBottom() {
    const box = document.getElementById('loading-chat-messages');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function _markConversationRead(friendId) {
    const uid = _myId();
    if (!uid || !window.sb) return;
    window.sb.from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('sender_id', friendId).eq('receiver_id', uid).is('read_at', null)
      .then(() => { refreshUnreadBadge(); }, () => {});
  }

  // Texto de una burbujita roja de notificación, con tope en 99 (99+ para
  // más) — antes el tope estaba en 9, mostraba "9+" con apenas 10 mensajes.
  function _badgeLabel(n) { return n > 99 ? '99+' : String(n); }
  // El número va en un <span> propio centrado por posición absoluta
  // (top/left 50% + translate), NO por line-height/flex del contenedor —
  // con una fuente display como VAGRoundBold el centrado por line-height
  // quedaba sistemáticamente corrido (el "aún desalineado" reportado,
  // incluso después de fijar line-height:1). Centrar por posición en vez
  // de por métrica de fuente es inmune a esa clase de desajuste.
  function _setBadgeCount(badge, n) {
    if (!badge) return;
    badge.innerHTML = '<span class="notif-badge-num">' + _badgeLabel(n) + '</span>';
  }

  // ── Burbujita de notificación en el botón "Mensajes" del loading ───────────
  // Cuenta simple (head:true, no trae filas) — no depende de haber cargado
  // la bandeja ni el historial de ninguna conversación, así que anda aunque
  // el panel nunca se haya abierto en la sesión.
  async function refreshUnreadBadge() {
    const uid = _myId();
    const badge = document.getElementById('messages-notif-badge');
    if (!badge) return;
    if (!uid || !window.sb) { badge.style.display = 'none'; return; }
    const { count, error } = await window.sb
      .from('direct_messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', uid)
      .is('read_at', null);
    if (error) { console.warn('[chat] refreshUnreadBadge:', error.message); return; }
    if (count > 0) {
      _setBadgeCount(badge, count);
      if (badge.style.display === 'none') {
        badge.style.display = 'flex';
        badge.style.animation = 'none';
        void badge.offsetWidth;
        badge.style.animation = '';
      }
    } else {
      badge.style.display = 'none';
    }
  }

  function _renderChatHeaderStatus(friend) {
    const status = _statusOf(friend);
    const dot = document.getElementById('loading-chat-status-dot');
    const txt = document.getElementById('loading-chat-status-text');
    const wrap = document.getElementById('loading-chat-status');
    if (dot) dot.className = 'versus-friend-dot' + (status.cls === 'playing' ? ' playing' : status.cls === 'offline' ? ' offline' : '');
    if (wrap) wrap.className = 'versus-friend-status' + (status.cls === 'playing' ? ' playing' : status.cls === 'offline' ? ' offline' : '');
    if (txt) txt.textContent = _statusText(friend);
  }

  async function openConversation(friend) {
    if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    _activeFriend = friend;
    _view = 'chat';
    const nameEl = document.getElementById('loading-chat-name');
    if (nameEl) nameEl.textContent = friend.name;
    const avatarEl = document.getElementById('loading-chat-avatar');
    if (avatarEl) avatarEl.src = friend.avatar || 'images/profilepic/ppdefault.png';
    window.CustomizeAssets?.applyFrame(document.getElementById('loading-chat-avatar-wrap'), friend.frameCode || '0001');
    _renderChatHeaderStatus(friend);
    // Bandera circular a la derecha del header, igual que la del perfil
    // (.profile-flag-badge) — a diferencia de la fila de la bandeja (más
    // abajo, estilo Rankings), acá no hay celda de fondo de por medio.
    const flagEl = document.getElementById('loading-chat-flag');
    if (flagEl) {
      const flagUrl = window.flagUrlForCountryCode?.(friend.country_code);
      if (flagUrl) { flagEl.src = flagUrl; flagEl.style.display = ''; }
      else { flagEl.style.display = 'none'; }
    }
    // La conversación se abre ENCIMA de la bandeja — se oculta la bandeja
    // (no se cierra del todo) para que "volver" la reabra tal cual estaba,
    // sin dos overlays .account-modal superpuestos a la vez.
    document.getElementById('chat-inbox-modal')?.classList.remove('open');
    document.getElementById('chat-conversation-modal')?.classList.add('open');
    // Vaciar el hilo YA (antes de esperar la consulta) — si no, mientras
    // _loadHistory está en vuelo se seguía viendo un instante el hilo de la
    // conversación ANTERIOR (el "sale el antiguo y de ahí el nuevo"
    // reportado), porque _messages todavía tenía los mensajes de la última
    // vez hasta que la nueva consulta resolvía.
    _messages = [];
    _renderMessages();
    const history = await _loadHistory(friend.id);
    // Guard de carrera: si mientras esto esperaba el jugador ya abrió OTRA
    // conversación, esta respuesta (de la que quedó atrás) no debe pisar la
    // que se está mostrando ahora.
    if (_activeFriend !== friend) return;
    _messages = history;
    _renderMessages();
    _scrollToBottom();
    _markConversationRead(friend.id);
    const input = document.getElementById('loading-chat-input');
    if (input) { input.value = ''; input.style.height = ''; input.focus(); }
  }

  // Flecha "←": vuelve a la bandeja (que sigue "abierta" de fondo, ver
  // openConversation). Distinto de closeAll() (la ✕), que cierra todo.
  function backToInbox() {
    document.getElementById('chat-conversation-modal')?.classList.remove('open');
    document.getElementById('chat-inbox-modal')?.classList.add('open');
    _activeFriend = null;
    _view = 'inbox';
    refreshInbox();
  }
  async function sendMessage(text) {
    const uid = _myId();
    const content = (text || '').trim();
    if (!uid || !_activeFriend || !content || !window.sb) return;
    const tempId = 'tmp-' + Date.now();
    const optimistic = {
      id: tempId, sender_id: uid, receiver_id: _activeFriend.id,
      content, created_at: new Date().toISOString(), read_at: null, _pending: true,
    };
    _messages.push(optimistic);
    _renderMessages();
    _scrollToBottom();
    const { data, error } = await window.sb
      .from('direct_messages')
      .insert({ sender_id: uid, receiver_id: _activeFriend.id, content })
      .select('id, sender_id, receiver_id, content, created_at, read_at')
      .single();
    const idx = _messages.findIndex(m => m.id === tempId);
    if (error) {
      console.warn('[chat] send error:', error.message);
      if (idx !== -1) { _messages[idx]._pending = false; _messages[idx]._failed = true; }
      if (typeof window.showGlobalToast === 'function') window.showGlobalToast(_T('chat.sendFailed', 'No se pudo enviar, inténtalo de nuevo'));
      _renderMessages();
      return;
    }
    if (idx !== -1) _messages[idx] = data;
    _renderMessages();
    refreshInbox();
  }

  // ── Realtime: persistente durante toda la sesión logueada (no solo con el
  // panel abierto) — así la burbujita de notificación se actualiza sola
  // aunque el jugador nunca haya abierto Mensajes todavía. Un solo canal
  // hace las dos cosas: si el panel está mostrando la conversación/bandeja
  // correspondiente las actualiza en vivo, y siempre refresca el contador. */
  function _subscribeRealtime() {
    const uid = _myId();
    if (!uid || !window.sb || _rtChannel) return;
    _rtChannel = window.sb
      .channel('dm-inbox-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `receiver_id=eq.${uid}` }, ({ new: msg }) => {
        if (!msg) return;
        if (_panelOpen && _view === 'chat' && _activeFriend && msg.sender_id === _activeFriend.id) {
          _messages.push(msg);
          _renderMessages();
          _scrollToBottom();
          _markConversationRead(msg.sender_id); // ya refresca el badge al terminar
        } else {
          refreshUnreadBadge();
          if (_panelOpen && _view === 'inbox') refreshInbox();
        }
      })
      .subscribe();
  }

  // Estado de conexión en vivo: onFriendsUpdate ya corre por el poll social
  // genérico (friends.js) — reengancharse acá es gratis, mismo patrón que
  // _renderOnlineFriends en vs.js para el panel de Retar 1v1.
  if (typeof onFriendsUpdate === 'function') {
    onFriendsUpdate(() => {
      if (!_panelOpen) return;
      if (_view === 'inbox') _renderCurrentTab();
      else if (_activeFriend) _renderChatHeaderStatus(_activeFriend);
    });
  }

  // Arranca apenas hay sesión (evento disparado por sb.js al loguear, tanto
  // en un login fresco como al retomar una sesión guardada) — así el badge
  // ya está correcto desde que carga el loading, sin depender de que el
  // jugador toque el botón de Mensajes primero.
  function _startSession() {
    _subscribeRealtime();
    refreshUnreadBadge();
  }
  document.addEventListener('sbSessionReady', _startSession);
  if (window._sessionReady) _startSession();

  // ── Abrir/cerrar el panel principal ─────────────────────────────────────────
  async function openInbox() {
    document.getElementById('chat-inbox-modal')?.classList.add('open');
    _panelOpen = true;
    _view = 'inbox';
    _subscribeRealtime(); // no-op si ya está suscripto desde el login
    if (typeof loadFriends === 'function') loadFriends();
    await refreshInbox();
  }
  function closeInbox() {
    document.getElementById('chat-inbox-modal')?.classList.remove('open');
    document.getElementById('chat-conversation-modal')?.classList.remove('open');
    _panelOpen = false;
    _activeFriend = null;
    _view = 'inbox';
  }

  return { openInbox, closeInbox, openConversation, backToInbox, sendMessage, setTab: _setTab };
})();

// ── Wiring de UI ─────────────────────────────────────────────────────────────
document.getElementById('loading-messages-btn')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
  if (!window._accountLoggedIn) {
    document.getElementById('social-lock-popup')?.classList.add('open');
    return;
  }
  window.Chat.openInbox();
});

document.getElementById('chat-inbox-close')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
  window.Chat.closeInbox();
});

// Flecha "←": única salida de la conversación, vuelve a la bandeja (la "✕"
// de cerrar todo queda solo en el modal de la bandeja, ver arriba).
document.getElementById('loading-chat-back')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
  window.Chat.backToInbox();
});

['history', 'online', 'all'].forEach(tab => {
  document.getElementById('loading-messages-tab-' + tab)?.addEventListener('click', () => {
    if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    window.Chat.setTab(tab);
  });
});

// El input es un <textarea> (no <input>) para que un mensaje largo pase a
// una segunda línea en vez de recortarse sin verse. Sin scrollbar interna a
// propósito (pedido explícito) — la caja simplemente crece en alto junto
// con los renglones, sin techo (hasta los 400 caracteres del maxlength);
// se vuelve a su alto mínimo después de cada envío (ver openConversation/
// el handler de "enviar" más abajo, que resetean style.height).
function _autoGrowChatInput() {
  const input = document.getElementById('loading-chat-input');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
}
document.getElementById('loading-chat-input')?.addEventListener('input', _autoGrowChatInput);

document.getElementById('loading-chat-send')?.addEventListener('click', () => {
  const input = document.getElementById('loading-chat-input');
  if (!input || !input.value.trim()) return;
  const val = input.value;
  input.value = '';
  _autoGrowChatInput();
  window.Chat.sendMessage(val);
});
// Enter envía; Shift+Enter salta de línea (igual que cualquier chat) — sin
// el guard de shiftKey, un mensaje de más de un renglón era imposible de
// escribir a mano.
document.getElementById('loading-chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('loading-chat-send')?.click(); }
});
