// ── MENSAJES DEL CREADOR (pop-up en el menú) ─────────────────────────────────
// Canal para escribirle a cualquier jugador desde el backend. El admin inserta
// una fila por SQL en `public.guest_messages` y acá se muestra como un pop-up
// centrado sobre la pantalla de inicio.
//
// Destino de cada fila:
//   user_id    no nulo  -> solo esa cuenta registrada
//   visitor_id no nulo  -> solo ese dispositivo (sirve para invitados sin cuenta)
//   ambos nulos          -> broadcast: SOLO a los que están conectados al enviar
//
// Comportamiento:
//   - Al abrir el juego se consultan los mensajes DIRIGIDOS (visitor_id/user_id).
//     Los broadcast no se consultan: no deben aparecerle a cada persona nueva.
//   - Suscripción realtime: si el jugador ya tiene esta versión cargada, el
//     pop-up aparece en ~1s sin recargar. Es la única vía de los broadcast, y
//     solo se muestran si el jugador está en el menú en ese instante (no se
//     encolan: si está jugando o fuera del juego, se descartan).
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

  function isBroadcast(row) { return !row.user_id && !row.visitor_id; }

  function enqueue(row) {
    if (!row || row.id == null || isSeen(row.id) || !matchesTarget(row)) return;
    // Un broadcast ("a todos") solo se muestra si el jugador está en el menú
    // AHORA. No se encola: si está jugando o fuera del juego, se descarta —
    // así solo lo reciben los que están conectados en el momento del envío.
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
      // Post-partida siempre vuelve al menú; reintentar hasta que se vea.
      if (!_waitTimer) _waitTimer = setInterval(function () {
        if (loadingVisible()) { clearInterval(_waitTimer); _waitTimer = null; pump(); }
      }, 1000);
      return;
    }
    _showing = true;
    render(_queue.shift());
  }

  // Mismo lenguaje visual que las viñetas del juego (.account-modal-box /
  // #chat-conversation-modal): backdrop oscuro + caja crema con borde marrón,
  // fuente VAGRoundBold, animacion welcomePopIn (definida en style.css) y el
  // boton confirm1/confirm2.png de siempre (hover muestra confirm2). Va en px
  // (no cqmin) porque el overlay es fixed, fuera del #app-stage.
  var FONT = "'VAGRoundBold','Arial Black',sans-serif";
  var _keyframesInjected = false;
  function injectKeyframes() {
    if (_keyframesInjected) return;
    _keyframesInjected = true;
    // welcomePopIn ya vive en style.css, pero se replica por si acaso + el
    // fade-out propio del cierre.
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

    // Boton confirm1/confirm2.png de siempre (mismo patron que .founder-popup-confirm).
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
      // Read receipt en el servidor (para saber que ya lo vio).
      // OJO: en supabase-js v2 .rpc() es un thenable perezoso; si no se le
      // encadena .then()/await, el request NUNCA se envia. Por eso el visto
      // se quedaba eternamente en pendiente.
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
    // Solo se recuperan los mensajes DIRIGIDOS a este dispositivo o cuenta.
    // Los broadcast (visitor_id y user_id nulos) NO se consultan acá: solo
    // llegan por realtime a quien está conectado en el momento del envío. Así
    // un mensaje "a todos los invitados" no le aparece a cada persona nueva
    // que entra después.
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
    // El login puede resolverse después de que corra este script: re-consultar
    // cuando la sesión esté lista (trae los mensajes dirigidos a la cuenta) y
    // de nuevo un poco más tarde por si el evento ya había pasado.
    document.addEventListener('sbSessionReady', function () { fetchPending(sb); });
    setTimeout(function () { if (currentUid()) fetchPending(sb); }, 4000);
  }

  start(0);
})();
