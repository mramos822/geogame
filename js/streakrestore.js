// GloboReto streak recovery pop-up. Shown once per page load, only in the menu
// (#loading-screen visible), for logged-in accounts. All rules (48h window,
// 3 recoveries per NY month) live in the Postgres RPCs get_gq_streak_status /
// restore_gq_streak / ack_gq_streak_lost — see the migration 20260920190000.
// Look mirrors .founder-popup-box (cream box, brown border, VAGRoundBold) and
// the menu's streak badge (streak.png + white number with red outline). In px
// because the overlay is fixed, outside #app-stage (same as guestmsg.js).
(function () {
  var FONT = "'VAGRoundBold','Arial Black',sans-serif";
  var _checked = false;
  var _armed = false;
  var _styled = false;

  function tr(key, vars) { return typeof window.t === 'function' ? window.t(key, vars) : key; }

  function loadingVisible() {
    var el = document.getElementById('loading-screen');
    if (!el || el.style.display === 'none') return false;
    return el.offsetParent !== null;
  }

  function otherPopupOpen() {
    return !!document.querySelector('#guest-msg-overlay, #founder-popup.visible, #top1-popup.visible, #top1-lost-popup.visible');
  }

  function rpc(name) {
    return window.sb.rpc(name).then(function (res) { return res && res.data; });
  }

  function injectStyle() {
    if (_styled) return;
    _styled = true;
    var st = document.createElement('style');
    st.textContent =
      '@keyframes gmPopIn{from{transform:scale(0.7);opacity:0}to{transform:scale(1);opacity:1}}' +
      '@keyframes srFlame{0%{transform:scale(0.6);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}' +
      '.sr-btn{font-family:' + FONT + ';font-size:18px;color:#fff;cursor:pointer;border-radius:14px;' +
      'padding:11px 28px;background:#7aab00;border:4px solid #00532f;box-shadow:0 4px 0 #00532f;' +
      'transition:transform .1s,filter .1s;-webkit-text-stroke:0.5px #00532f;paint-order:stroke fill}' +
      '.sr-btn:hover{transform:scale(1.06);filter:brightness(1.08)}' +
      '.sr-btn:active{transform:translateY(3px);box-shadow:0 1px 0 #00532f}' +
      '.sr-btn:disabled{filter:grayscale(1);cursor:default}' +
      '.sr-link{font-family:' + FONT + ';font-size:14px;color:#8b6a00;cursor:pointer;background:none;border:none;text-decoration:underline}' +
      '.sr-link:hover{color:#5a4400}';
    document.head.appendChild(st);
  }

  // Flame with the streak number on top, same look as the menu badge.
  function flame(num, gray, size, animate) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;width:' + size + 'px;flex:none;' +
      (animate ? 'animation:srFlame .5s cubic-bezier(0.34,1.56,0.64,1) both;' : '');
    var img = document.createElement('img');
    img.src = 'images/streak.png';
    img.alt = '';
    img.draggable = false;
    img.style.cssText = 'display:block;width:100%;height:auto;user-select:none;pointer-events:none;' +
      (gray ? 'filter:grayscale(1);opacity:0.55;' : '');
    wrap.appendChild(img);
    if (num != null) {
      var n = document.createElement('span');
      n.textContent = String(num);
      n.style.cssText =
        'position:absolute;top:64%;left:50%;transform:translate(-50%,-50%);' +
        "font-family:'Arial Black',Impact,sans-serif;font-size:" + Math.round(size * 0.5) + 'px;' +
        'color:#fff;-webkit-text-stroke:' + Math.max(2, Math.round(size * 0.075)) + 'px ' + (gray ? '#6b6b6b' : '#d81e0a') + ';' +
        'paint-order:stroke fill;pointer-events:none;' + (gray ? 'opacity:0.85;' : '');
      wrap.appendChild(n);
    }
    return wrap;
  }

  // One small flame per recovery: lit = still available, gray = used this month.
  function recoveryDots(left) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:center;';
    for (var i = 0; i < 3; i++) row.appendChild(flame(null, i >= left, 26, false));
    return row;
  }

  function okButton(onClick) {
    var btn = document.createElement('div');
    btn.style.cssText = 'position:relative;width:84px;cursor:pointer;margin-top:6px;';
    var c1 = document.createElement('img');
    c1.src = 'images/confirm1.png';
    c1.draggable = false;
    c1.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;user-select:none;';
    var c2 = document.createElement('img');
    c2.src = 'images/confirm2.png';
    c2.draggable = false;
    c2.style.cssText =
      'position:absolute;top:49%;left:50%;transform:translate(-50%,-50%);width:118%;height:auto;' +
      'pointer-events:none;user-select:none;opacity:0;transition:opacity 0.1s;';
    btn.appendChild(c1);
    btn.appendChild(c2);
    btn.addEventListener('mouseenter', function () { c2.style.opacity = '1'; });
    btn.addEventListener('mouseleave', function () { c2.style.opacity = '0'; });
    btn.addEventListener('pointerdown', function () { c2.style.opacity = '0'; });
    btn.addEventListener('click', onClick);
    return btn;
  }

  function textEl(text, css) {
    var d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = css;
    return d;
  }

  // opts: { num, gray, title, body, deadline, left, animate, buttons(close) -> [nodes] }
  function show(opts) {
    injectStyle();
    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9100;display:flex;align-items:center;justify-content:center;' +
      'padding:24px;background:rgba(0,0,0,0.45);font-family:' + FONT + ';';
    var card = document.createElement('div');
    card.style.cssText =
      'max-width:460px;width:100%;box-sizing:border-box;background:#fffbe6;border:5px solid #8b6a00;' +
      'border-radius:22px;box-shadow:0 8px 20px rgba(0,0,0,0.4);padding:30px 40px 30px;text-align:center;' +
      'display:flex;flex-direction:column;align-items:center;gap:12px;' +
      'animation:gmPopIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;';

    card.appendChild(flame(opts.num, opts.gray, 120, opts.animate));
    card.appendChild(textEl(opts.title, 'font-size:32px;color:#5a4400;line-height:1.1;'));
    card.appendChild(textEl(opts.body, 'font-size:17px;color:#7a6020;line-height:1.35;'));

    if (opts.deadline) {
      card.appendChild(textEl(opts.deadline,
        'font-size:15px;color:#b34a00;background:#ffe9b8;border:2px solid #e8b800;border-radius:12px;padding:6px 14px;'));
    }
    if (opts.left != null) {
      card.appendChild(recoveryDots(opts.left));
      card.appendChild(textEl(tr('streakRestore.left', { left: opts.left }), 'font-size:13px;color:#7a6020;margin-top:-4px;'));
    }

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:6px;';
    function close() { try { overlay.remove(); } catch (e) {} }
    opts.buttons(close).forEach(function (b) { row.appendChild(b); });
    card.appendChild(row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function showResult(title, body, num, gray, animate) {
    show({
      num: num, gray: gray, animate: animate, title: title, body: body,
      buttons: function (close) { return [okButton(close)]; },
    });
  }

  function ackAndClose(close) {
    return function () {
      try { rpc('ack_gq_streak_lost').then(function () {}, function () {}); } catch (e) {}
      close();
    };
  }

  function showRestorable(st) {
    var lang = typeof window.getLang === 'function' ? window.getLang() : 'es';
    var when = new Date(st.deadline).toLocaleString(lang === 'en' ? 'en-US' : 'es', {
      weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
    show({
      num: st.streak, gray: true,
      title: tr('streakRestore.title'),
      body: tr('streakRestore.bodyRestorable', { n: st.streak }),
      deadline: tr('streakRestore.deadline', { deadline: when }),
      left: st.restores_left,
      buttons: function (close) {
        var restore = document.createElement('button');
        restore.type = 'button';
        restore.className = 'sr-btn';
        restore.textContent = tr('streakRestore.btn');
        restore.addEventListener('click', function () {
          restore.disabled = true;
          rpc('restore_gq_streak').then(function (res) {
            close();
            if (res && res.ok) {
              var p = window._sbProfile;
              if (p) { p.gq_streak_count = res.streak; p.gq_streak_last_date = res.last_date; }
              if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
              if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
              showResult(tr('streakRestore.doneTitle'), tr('streakRestore.doneBody', { n: res.streak }), res.streak, false, true);
            } else {
              showResult(tr('streakRestore.title'), tr('streakRestore.error'), st.streak, true, false);
            }
          }, function () {
            close();
            showResult(tr('streakRestore.title'), tr('streakRestore.error'), st.streak, true, false);
          });
        });
        var later = document.createElement('button');
        later.type = 'button';
        later.className = 'sr-link';
        later.textContent = tr('streakRestore.dismiss');
        later.addEventListener('click', close);
        return [restore, later];
      },
    });
  }

  function check() {
    if (_checked || !window.sb || !window._sbUserId) return;
    _checked = true;
    rpc('get_gq_streak_status').then(function (st) {
      if (!st || st.state === 'none') return;
      if (st.state === 'restorable') return showRestorable(st);
      var key = st.state === 'no_quota' ? 'streakRestore.bodyNoQuota' : 'streakRestore.bodyExpired';
      show({
        num: st.streak, gray: true,
        title: tr('streakRestore.title'),
        body: tr(key, { n: st.streak }),
        buttons: function (close) { return [okButton(ackAndClose(close))]; },
      });
    }, function () {});
  }

  // Wait until the player is logged in AND on the menu with no other pop-up open.
  function arm() {
    if (_armed) return;
    _armed = true;
    var timer = setInterval(function () {
      if (_checked) { clearInterval(timer); return; }
      if (!window._sbUserId || !loadingVisible() || otherPopupOpen()) return;
      clearInterval(timer);
      setTimeout(function () {
        if (loadingVisible() && !otherPopupOpen()) check();
        else { _armed = false; arm(); }
      }, 1500);
    }, 1000);
  }

  document.addEventListener('sbSessionReady', arm);
  if (window._sbUserId) arm();
  else setTimeout(function () { if (window._sbUserId) arm(); }, 4000);
})();
