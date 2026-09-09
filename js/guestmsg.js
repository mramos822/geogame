// ── CREATOR MESSAGES (menu pop-up) ──────────────────────────────────────────
// Channel to message any player from the backend. The admin inserts a row via
// SQL into `public.guest_messages` and here it shows as a pop-up centered over
// the home screen.
//
// Each row's target:
//   user_id    non-null  -> only that registered account
//   visitor_id non-null  -> only that device (for account-less guests)
//   both null            -> broadcast: ONLY to those connected when it's sent
//
// Behavior:
//   - On opening the game, TARGETED messages (visitor_id/user_id) are queried.
//     Broadcasts aren't queried: they must not appear to every new person.
//   - Realtime subscription: if the player has this version loaded, the pop-up
//     appears in ~1s without reloading. It's the only path for broadcasts, and
//     they only show if the player is in the menu at that instant (not queued:
//     if playing or outside the game, they're discarded).
//   - Only shown in the MENU (#loading-screen visible). If it arrives during a
//     game it queues and appears on return to the menu.
//   - Each message is shown once per device (ids in localStorage).
//
// RLS: public SELECT for anon, no INSERT (admin only via SQL).
(function () {
  var SEEN_KEY = '_gm_seen';

  function visitorId() {
    try { return localStorage.getItem('_devstats_vid') || null; } catch (e) { return null; }
  }
  function currentUid() { return window._sbUserId || null; }

  function seenIds() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function markSeen(id) {
    try {
      var arr = seenIds();
      if (arr.indexOf(id) === -1) arr.push(id);
      if (arr.length > 200) arr = arr.slice(-200);
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  function isSeen(id) { return seenIds().indexOf(id) !== -1; }

  // Is this row for this player?
  function matchesTarget(row) {
    if (row.user_id) return row.user_id === currentUid();
    if (row.visitor_id) return row.visitor_id === visitorId();
    return true; // broadcast
  }

  var _queue = [];
  var _showing = false;
  var _waitTimer = null;

  function loadingVisible() {
    var el = document.getElementById('loading-screen');
    if (!el) return false;
    if (el.style.display === 'none') return false;
    return el.offsetParent !== null;
  }

  function isBroadcast(row) { return !row.user_id && !row.visitor_id; }

  function enqueue(row) {
    if (!row || row.id == null || isSeen(row.id) || !matchesTarget(row)) return;
    // A broadcast ("to everyone") only shows if the player is in the menu NOW.
    // Not queued: if playing or outside the game, it's discarded — so only
    // those connected when it's sent receive it.
    if (isBroadcast(row)) {
      if (!loadingVisible()) { markSeen(row.id); return; }
    }
    for (var i = 0; i < _queue.length; i++) if (_queue[i].id === row.id) return;
    _queue.push(row);
    pump();
  }

  function pump() {
    if (_showing || !_queue.length) return;
    if (!loadingVisible()) {
      // Post-game always returns to the menu; retry until it's visible.
      if (!_waitTimer) _waitTimer = setInterval(function () {
        if (loadingVisible()) { clearInterval(_waitTimer); _waitTimer = null; pump(); }
      }, 1000);
      return;
    }
    _showing = true;
    render(_queue.shift());
  }

  // Same visual language as the game's bubbles (.account-modal-box /
  // #chat-conversation-modal): dark backdrop + cream box with brown border,
  // VAGRoundBold font, welcomePopIn animation (defined in style.css) and the
  // usual confirm1/confirm2.png button (hover shows confirm2). In px (not cqmin)
  // because the overlay is fixed, outside #app-stage.
  var FONT = "'VAGRoundBold','Arial Black',sans-serif";
  var _keyframesInjected = false;
  function injectKeyframes() {
    if (_keyframesInjected) return;
    _keyframesInjected = true;
    // welcomePopIn already lives in style.css, but replicated just in case +
    // the close's own fade-out.
    var st = document.createElement('style');
    st.textContent =
      '@keyframes gmPopIn{from{transform:scale(0.7);opacity:0}to{transform:scale(1);opacity:1}}' +
      '@keyframes gmPopOut{from{transform:scale(1);opacity:1}to{transform:scale(0.7);opacity:0}}';
    document.head.appendChild(st);
  }

  function render(row) {
    injectKeyframes();

    var overlay = document.createElement('div');
    overlay.id = 'guest-msg-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;' +
      'justify-content:center;padding:24px;background:rgba(0,0,0,0.45);' +
      'font-family:' + FONT + ';';

    var card = document.createElement('div');
    card.style.cssText =
      'max-width:400px;width:100%;background:#fffbe6;color:#5a4400;' +
      'border:4px solid #8b6a00;border-radius:18px;' +
      'box-shadow:0 8px 22px rgba(0,0,0,0.4);padding:30px 26px 26px;text-align:center;' +
      'display:flex;flex-direction:column;align-items:center;gap:6px;' +
      'animation:gmPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;';

    var heart = document.createElement('img');
    heart.src = 'images/logo.png';
    heart.alt = '';
    heart.draggable = false;
    heart.style.cssText = 'width:128px;height:auto;margin-bottom:6px;user-select:none;';

    var body = document.createElement('div');
    body.textContent = row.body || '';
    body.style.cssText = 'font-size:17px;line-height:1.4;color:#5a4400;white-space:pre-wrap;margin-bottom:18px;';

    // Usual confirm1/confirm2.png button (same pattern as .founder-popup-confirm).
    var btn = document.createElement('div');
    btn.style.cssText = 'position:relative;width:76px;cursor:pointer;margin-top:2px;';
    var c1 = document.createElement('img');
    c1.src = 'images/confirm1.png';
    c1.draggable = false;
    c1.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;user-select:none;';
    var c2 = document.createElement('img');
    c2.src = 'images/confirm2.png';
    c2.draggable = false;
    c2.style.cssText =
      'position:absolute;top:49%;left:50%;transform:translate(-50%,-50%);' +
      'width:118%;height:auto;pointer-events:none;user-select:none;opacity:0;transition:opacity 0.1s;';
    btn.appendChild(c1);
    btn.appendChild(c2);
    btn.addEventListener('mouseenter', function () { c2.style.opacity = '1'; });
    btn.addEventListener('mouseleave', function () { c2.style.opacity = '0'; });
    btn.addEventListener('pointerdown', function () { c2.style.opacity = '0'; });

    function close() {
      markSeen(row.id);
      // Read receipt on the server (to know they've seen it).
      // NOTE: in supabase-js v2 .rpc() is a lazy thenable; without a chained
      // .then()/await, the request is NEVER sent. That's why the read status
      // stayed pending forever.
      try {
        if (window.sb) {
          window.sb.rpc('mark_guest_message_read', { p_id: row.id, p_visitor: visitorId() })
            .then(function () {}, function () {});
        }
      } catch (e) {}
      card.style.animation = 'gmPopOut 0.2s ease-in both';
      overlay.style.transition = 'opacity 0.2s';
      overlay.style.opacity = '0';
      setTimeout(function () {
        try { overlay.remove(); } catch (e) {}
        _showing = false;
        pump();
      }, 210);
    }
    btn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    card.appendChild(heart);
    card.appendChild(body);
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function fetchPending(sb) {
    var vid = visitorId();
    var uid = currentUid();
    // Only messages TARGETED at this device or account are fetched. Broadcasts
    // (null visitor_id and user_id) are NOT queried here: they only arrive via
    // realtime to whoever is connected when it's sent. So a "to all guests"
    // message doesn't appear to every new person who joins later.
    var ors = [];
    if (vid) ors.push('visitor_id.eq.' + vid);
    if (uid) ors.push('user_id.eq.' + uid);
    if (!ors.length) return;
    sb.from('guest_messages')
      .select('id,body,visitor_id,user_id,created_at')
      .or(ors.join(','))
      .order('created_at', { ascending: true })
      .limit(30)
      .then(function (res) {
        var rows = (res && res.data) || [];
        for (var i = 0; i < rows.length; i++) enqueue(rows[i]);
      }, function () {});
  }

  function subscribe(sb, vid) {
    try {
      sb.channel('gm-' + (vid || 'anon'))
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'guest_messages' },
          function (payload) { if (payload && payload.new) enqueue(payload.new); })
        .subscribe();
    } catch (e) {}
  }

  function start(attempt) {
    var sb = window.sb;
    if (!sb) {
      if (attempt > 25) return;
      setTimeout(function () { start(attempt + 1); }, 300);
      return;
    }
    var vid = visitorId();
    subscribe(sb, vid);
    fetchPending(sb);
    // Login may resolve after this script runs: re-query when the session is
    // ready (brings the account-targeted messages) and again a bit later in
    // case the event had already passed.
    document.addEventListener('sbSessionReady', function () { fetchPending(sb); });
    setTimeout(function () { if (currentUid()) fetchPending(sb); }, 4000);
  }

  start(0);
})();
