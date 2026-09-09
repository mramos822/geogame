// ── MESSAGES (direct 1:1 chat between friends) ─────────────────────────────
// Deliberately does NOT use a private Realtime channel with its own policy on
// realtime.messages (like matches/solo-*, see vs.js/spectate.js) — that pattern
// was the source of a serious bug (broken topic cast + Postgres flattening an
// EXISTS in a join, bypassing the protection). Here realtime comes from
// postgres_changes on the real direct_messages table: Realtime respects the
// table RLS exactly as any normal SELECT would see it, with no topic parsing —
// much simpler and without that class of bug possible.
window.Chat = (() => {
  let _messages = [];        // thread of the open conversation
  let _activeFriend = null;  // {id, name, avatar, frameCode, ...} — see getFriends()
  let _view = 'inbox';       // 'inbox' | 'chat'
  let _activeTab = 'history'; // 'history' | 'online' | 'all'
  let _lastById = new Map();   // friendId -> last message (any direction) — recomputed on each refreshInbox
  let _unreadById = new Map(); // friendId -> count of their unread messages — see _loadUnreadCounts
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
  // Same status rule as the 1v1 Challenge / Social panel (see
  // getStatusObj/socialStatusText in js/social/social-panel.js) — reused as-is
  // so "online"/"playing"/offline means the same everywhere, instead of
  // reinventing the calc here.
  function _statusOf(f) {
    return (typeof getStatusObj === 'function') ? getStatusObj(f) : { cls: 'offline' };
  }
  function _statusText(f) {
    return (typeof socialStatusText === 'function') ? socialStatusText(f) : '';
  }

  // ── Inbox: last message per friend ────────────────────────────────────────
  // There is no separate "conversations" table/view — it is built here by
  // reading the latest messages I participate in and keeping the first (newest,
  // by the desc order) that appears for each other user. With this game's
  // typical friend limit this is more than enough; if message volume grew a
  // lot a materialized view would be worthwhile.
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

  // How many unread messages arrived from EACH friend — the row bubble shows
  // this number, not just a dot (unlike _lastById, which only checks if the
  // LAST message is unread). Light query: fetches only sender_id of the unread,
  // counts client-side.
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

  // Builds the list to show for the active tab, always reading the FRESH
  // connection status from getFriends() (not an old snapshot taken on panel
  // open) — so a re-render (see onFriendsUpdate below) is enough for
  // "online"/"playing" to update within a second, without re-fetching messages.
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

  // Requested order: name, flag, connection status — all on the first line;
  // the last received message below the name, not beside it.
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

  // ── Individual conversation ───────────────────────────────────────────────
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

  // Text for a red notification bubble, capped at 99 (99+ beyond) — the cap
  // used to be 9, showing "9+" with just 10 messages.
  function _badgeLabel(n) { return n > 99 ? '99+' : String(n); }
  // The number goes in its own <span> centered by absolute position (top/left
  // 50% + translate), NOT by the container's line-height/flex — with a display
  // font like VAGRoundBold, line-height centering was systematically off (the
  // reported "still misaligned", even after fixing line-height:1). Centering by
  // position instead of font metric is immune to that class of misfit.
  function _setBadgeCount(badge, n) {
    if (!badge) return;
    badge.innerHTML = '<span class="notif-badge-num">' + _badgeLabel(n) + '</span>';
  }

  // ── Notification bubble on the loading "Messages" button ──────────────────
  // Simple count (head:true, fetches no rows) — doesn't depend on having loaded
  // the inbox or any conversation history, so it works even if the panel was
  // never opened in the session.
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
    // Circular flag on the right of the header, like the profile one
    // (.profile-flag-badge) — unlike the inbox row (below, Rankings-style),
    // here there's no background cell in the way.
    const flagEl = document.getElementById('loading-chat-flag');
    if (flagEl) {
      const flagUrl = window.flagUrlForCountryCode?.(friend.country_code);
      if (flagUrl) { flagEl.src = flagUrl; flagEl.style.display = ''; }
      else { flagEl.style.display = 'none'; }
    }
    // The conversation opens ON TOP of the inbox — the inbox is hidden (not
    // fully closed) so "back" reopens it as it was, without two overlapping
    // .account-modal overlays at once.
    document.getElementById('chat-inbox-modal')?.classList.remove('open');
    document.getElementById('chat-conversation-modal')?.classList.add('open');
    // Empty the thread NOW (before awaiting the query) — otherwise, while
    // _loadHistory is in flight the PREVIOUS conversation's thread was still
    // visible for an instant (the reported "the old one shows then the new"),
    // because _messages still held the last messages until the new query
    // resolved.
    _messages = [];
    _renderMessages();
    const history = await _loadHistory(friend.id);
    // Race guard: if while awaiting this the player opened ANOTHER
    // conversation, this (stale) response must not overwrite the one shown now.
    if (_activeFriend !== friend) return;
    _messages = history;
    _renderMessages();
    _scrollToBottom();
    _markConversationRead(friend.id);
    const input = document.getElementById('loading-chat-input');
    if (input) { input.value = ''; input.style.height = ''; input.focus(); }
  }

  // "←" arrow: back to the inbox (still "open" in the background, see
  // openConversation). Different from closeAll() (the ✕), which closes everything.
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

  // ── Realtime: persistent for the whole logged-in session (not just with the
  // panel open) — so the notification bubble updates itself even if the player
  // never opened Messages. A single channel does both: if the panel is showing
  // the corresponding conversation/inbox it updates them live, and it always
  // refreshes the counter. */
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
          _markConversationRead(msg.sender_id); // refreshes the badge on completion
        } else {
          refreshUnreadBadge();
          if (_panelOpen && _view === 'inbox') refreshInbox();
        }
      })
      .subscribe();
  }

  // Live connection status: onFriendsUpdate already runs via the generic
  // social poll (friends.js) — hooking in here is free, same pattern as
  // _renderOnlineFriends in vs.js for the 1v1 Challenge panel.
  if (typeof onFriendsUpdate === 'function') {
    onFriendsUpdate(() => {
      if (!_panelOpen) return;
      if (_view === 'inbox') _renderCurrentTab();
      else if (_activeFriend) _renderChatHeaderStatus(_activeFriend);
    });
  }

  // Starts as soon as there's a session (event fired by sb.js on login, both a
  // fresh login and resuming a saved session) — so the badge is already correct
  // from when the loading screen loads, without waiting for the player to tap
  // the Messages button first.
  function _startSession() {
    _subscribeRealtime();
    refreshUnreadBadge();
  }
  document.addEventListener('sbSessionReady', _startSession);
  if (window._sessionReady) _startSession();

  // ── Open/close the main panel ─────────────────────────────────────────────
  async function openInbox() {
    document.getElementById('chat-inbox-modal')?.classList.add('open');
    _panelOpen = true;
    _view = 'inbox';
    _subscribeRealtime(); // no-op if already subscribed since login
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

// ── UI wiring ───────────────────────────────────────────────────────────────
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

// "←" arrow: the only exit from the conversation, back to the inbox (the "✕"
// to close everything stays only in the inbox modal, see above).
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

// The input is a <textarea> (not <input>) so a long message wraps to a second
// line instead of being clipped out of sight. No inner scrollbar on purpose
// (explicit request) — the box simply grows in height with the lines, with no
// ceiling (up to the 400-char maxlength); it returns to its minimum height
// after each send (see openConversation / the "send" handler below, which reset
// style.height).
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
// Enter sends; Shift+Enter adds a newline (like any chat) — without the
// shiftKey guard, a multi-line message was impossible to type by hand.
document.getElementById('loading-chat-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('loading-chat-send')?.click(); }
});
