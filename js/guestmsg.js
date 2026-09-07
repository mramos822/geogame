// ── MENSAJES DEL CREADOR PARA INVITADOS ──────────────────────────────────────
// Un invitado (sin cuenta) no tiene fila en `profiles` ni en `direct_messages`,
// así que no hay forma de escribirle nada. Esta tabla (`guest_messages`) es el
// único canal: el admin inserta una fila por SQL (dirigida a un visitor_id, o
// con visitor_id NULL para todos los invitados) y acá se muestra como un
// cartelito sobre la pantalla de inicio.
//
//   - Al abrir el juego se consultan los mensajes pendientes (fallback fiable).
//   - Además hay una suscripción realtime: si el invitado ya tiene esta versión
//     cargada, el cartel aparece en ~1s sin recargar.
//   - Cada mensaje se muestra una sola vez por dispositivo (ids en localStorage).
//
// RLS: SELECT público, sin INSERT para anon (solo el admin por SQL).
(function () {
  var SEEN_KEY = '_gm_seen';

  function visitorId() {
    try { return localStorage.getItem('_devstats_vid') || null; } catch (e) { return null; }
  }
  function seenIds() {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') || []; } catch (e) { return []; }
  }
  function markSeen(id) {
    try {
      var arr = seenIds();
      if (arr.indexOf(id) === -1) arr.push(id);
      // no dejar crecer sin límite
      if (arr.length > 200) arr = arr.slice(-200);
      localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  function isSeen(id) { return seenIds().indexOf(id) !== -1; }

  var _queue = [];
  var _showing = false;
  var _waitTimer = null;

  function loadingVisible() {
    var el = document.getElementById('loading-screen');
    if (!el) return false;
    if (el.style.display === 'none') return false;
    return el.offsetParent !== null;
  }

  function enqueue(row) {
    if (!row || row.id == null || isSeen(row.id)) return;
    for (var i = 0; i < _queue.length; i++) if (_queue[i].id === row.id) return;
    _queue.push(row);
    pump();
  }

  function pump() {
    if (_showing || !_queue.length) return;
    if (!loadingVisible()) {
      // Post-partida siempre vuelve al loading; reintentar hasta que se vea.
      if (!_waitTimer) _waitTimer = setInterval(function () {
        if (loadingVisible()) { clearInterval(_waitTimer); _waitTimer = null; pump(); }
      }, 1000);
      return;
    }
    _showing = true;
    render(_queue.shift());
  }

  function render(row) {
    var overlay = document.createElement('div');
    overlay.id = 'guest-msg-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;' +
      'justify-content:center;padding:24px;background:rgba(0,0,0,0.55);' +
      'opacity:0;transition:opacity 0.35s;font-family:system-ui,-apple-system,sans-serif;';

    var card = document.createElement('div');
    card.style.cssText =
      'max-width:420px;width:100%;background:linear-gradient(160deg,#2b2f3a,#20232c);' +
      'color:#f4f1e8;border:1px solid rgba(255,255,255,0.12);border-radius:18px;' +
      'box-shadow:0 18px 50px rgba(0,0,0,0.5);padding:26px 24px 22px;text-align:center;' +
      'transform:translateY(14px) scale(0.97);transition:transform 0.35s;';

    var heart = document.createElement('div');
    heart.textContent = '🌍';
    heart.style.cssText = 'font-size:34px;line-height:1;margin-bottom:12px;';

    var body = document.createElement('div');
    body.textContent = row.body || '';
    body.style.cssText = 'font-size:16px;line-height:1.5;white-space:pre-wrap;margin-bottom:20px;';

    var btn = document.createElement('button');
    btn.textContent = '¡Gracias!';
    btn.style.cssText =
      'appearance:none;border:0;cursor:pointer;font:inherit;font-size:15px;font-weight:600;' +
      'color:#20232c;background:#f4c95d;padding:11px 30px;border-radius:999px;' +
      'box-shadow:0 4px 0 rgba(0,0,0,0.25);transition:transform 0.1s;';
    btn.addEventListener('pointerdown', function () { btn.style.transform = 'translateY(2px)'; });
    btn.addEventListener('pointerup', function () { btn.style.transform = ''; });

    function close() {
      markSeen(row.id);
      overlay.style.opacity = '0';
      card.style.transform = 'translateY(14px) scale(0.97)';
      setTimeout(function () {
        try { overlay.remove(); } catch (e) {}
        _showing = false;
        pump();
      }, 350);
    }
    btn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    card.appendChild(heart);
    card.appendChild(body);
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
      overlay.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
    });
  }

  function fetchPending(sb, vid) {
    sb.from('guest_messages')
      .select('id,body,visitor_id,created_at')
      .or('visitor_id.is.null,visitor_id.eq.' + vid)
      .order('created_at', { ascending: true })
      .limit(20)
      .then(function (res) {
        var rows = (res && res.data) || [];
        for (var i = 0; i < rows.length; i++) enqueue(rows[i]);
      }, function () {});
  }

  function subscribe(sb, vid) {
    try {
      sb.channel('gm-' + vid)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'guest_messages' },
          function (payload) {
            var row = payload && payload.new;
            if (!row) return;
            if (row.visitor_id && row.visitor_id !== vid) return;
            enqueue(row);
          })
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
    if (!vid) return; // sin id de dispositivo no hay a quién dirigirlo
    fetchPending(sb, vid);
    subscribe(sb, vid);
  }

  start(0);
})();
