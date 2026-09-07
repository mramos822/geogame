// ── MENSAJES DEL CREADOR (pop-up en el menú) ─────────────────────────────────
// Canal para escribirle a cualquier jugador desde el backend. El admin inserta
// una fila por SQL en `public.guest_messages` y acá se muestra como un pop-up
// centrado sobre la pantalla de inicio.
//
// Destino de cada fila:
//   user_id    no nulo  -> solo esa cuenta registrada
//   visitor_id no nulo  -> solo ese dispositivo (sirve para invitados sin cuenta)
//   ambos nulos          -> todos
//
// Comportamiento:
//   - Al abrir el juego se consultan los mensajes pendientes (fallback fiable).
//   - Suscripción realtime: si el jugador ya tiene esta versión cargada, el
//     pop-up aparece en ~1s sin recargar.
//   - Solo se muestra en el MENÚ (#loading-screen visible). Si llega durante una
//     partida queda en cola y aparece al volver al menú.
//   - Cada mensaje se muestra una sola vez por dispositivo (ids en localStorage).
//
// RLS: SELECT público para anon, sin INSERT (solo el admin por SQL).
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

  // ¿Esta fila es para este jugador?
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

  function enqueue(row) {
    if (!row || row.id == null || isSeen(row.id) || !matchesTarget(row)) return;
    for (var i = 0; i < _queue.length; i++) if (_queue[i].id === row.id) return;
    _queue.push(row);
    pump();
  }

  function pump() {
    if (_showing || !_queue.length) return;
    if (!loadingVisible()) {
      // Post-partida siempre vuelve al menú; reintentar hasta que se vea.
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

  function fetchPending(sb) {
    var vid = visitorId();
    var uid = currentUid();
    var ors = ['visitor_id.is.null'];   // los broadcast tienen visitor_id nulo
    if (vid) ors.push('visitor_id.eq.' + vid);
    if (uid) ors.push('user_id.eq.' + uid);
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
    // El login puede resolverse después de que corra este script: re-consultar
    // cuando la sesión esté lista (trae los mensajes dirigidos a la cuenta) y
    // de nuevo un poco más tarde por si el evento ya había pasado.
    document.addEventListener('sbSessionReady', function () { fetchPending(sb); });
    setTimeout(function () { if (currentUid()) fetchPending(sb); }, 4000);
  }

  start(0);
})();
