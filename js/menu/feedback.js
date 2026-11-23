// ── PLAYER FEEDBACK (menu button + modal) ───────────────────────────────────
// Small "Give feedback" button on the home screen. Opens a cream modal where
// the player picks a category and writes what they'd like to see in the game.
// Sent through the submit_feedback RPC (rate-limited server-side, table
// public.player_feedback, read by the admin via SQL).
(function () {
  var FONT = "'VAGRoundBold','Arial Black',sans-serif";
  var STR = {
    es: {
      btn: 'Tu opinión',
      title: '¡Queremos escucharte!',
      sub: 'Cuéntanos qué te gustaría ver o tener en MyGeoChallenge: nuevos modos, mejoras, errores, lo que sea.',
      cats: { idea: '💡 Idea', mode: '🎮 Modo nuevo', bug: '🐞 Error', other: '💬 Otro' },
      ph: 'Escribe aquí tu opinión o sugerencia...',
      send: 'Enviar', cancel: 'Cerrar',
      short: 'Escribe un poco más (mínimo 5 letras).',
      limit: 'Ya enviaste varias opiniones hoy. ¡Gracias! Inténtalo mañana.',
      err: 'No se pudo enviar. Inténtalo de nuevo.',
      thanks: '¡Gracias por tu opinión! La leeremos con mucho cariño.'
    },
    en: {
      btn: 'Feedback',
      title: 'We want to hear from you!',
      sub: 'Tell us what you would like to see or have in MyGeoChallenge: new modes, improvements, bugs, anything.',
      cats: { idea: '💡 Idea', mode: '🎮 New mode', bug: '🐞 Bug', other: '💬 Other' },
      ph: 'Write your feedback or suggestion here...',
      send: 'Send', cancel: 'Close',
      short: 'Please write a bit more (at least 5 characters).',
      limit: 'You already sent several messages today. Thanks! Try again tomorrow.',
      err: 'Could not send. Please try again.',
      thanks: 'Thanks for your feedback! We will read it carefully.'
    }
  };
  function S() {
    var l = (window.getLang && window.getLang()) === 'en' ? 'en' : 'es';
    return STR[l];
  }
  function lang() { return (window.getLang && window.getLang()) === 'en' ? 'en' : 'es'; }
  function visitorId() { try { return localStorage.getItem('_devstats_vid') || null; } catch (e) { return null; } }

  function injectStyles() {
    if (document.getElementById('fb-styles')) return;
    var st = document.createElement('style');
    st.id = 'fb-styles';
    st.textContent =
      '@keyframes fbPopIn{from{transform:scale(0.7);opacity:0}to{transform:scale(1);opacity:1}}' +
      '#feedback-btn{position:absolute;top:1.4cqmin;right:calc(16% + 8cqmin);z-index:8;' +
      'font-family:' + FONT + ';white-space:nowrap;}' +
            '#loading-screen.lobby-interim-bg #feedback-btn{display:none;}' +
      '.fb-cat{cursor:pointer;padding:6px 12px;border-radius:14px;border:3px solid #8b6a00;background:#fff;' +
      'color:#5a4400;font-family:' + FONT + ';font-size:14px;user-select:none;}' +
      '.fb-cat.sel{background:#ffd54a;}' +
      '.fb-act{cursor:pointer;padding:9px 22px;border-radius:14px;border:3px solid #8b6a00;' +
      'font-family:' + FONT + ';font-size:16px;user-select:none;}';
    document.head.appendChild(st);
  }

  function open() {
    if (document.getElementById('feedback-overlay')) return;
    if (window._menuClickSfx) window._menuClickSfx('check');
    var s = S(), cat = 'idea', busy = false;
    var overlay = document.createElement('div');
    overlay.id = 'feedback-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9100;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:rgba(0,0,0,0.5);font-family:' + FONT + ';';
    var card = document.createElement('div');
    card.style.cssText = 'max-width:460px;width:100%;background:#fffbe6;color:#5a4400;border:4px solid #8b6a00;' +
      'border-radius:18px;box-shadow:0 8px 22px rgba(0,0,0,0.4);padding:24px 22px 20px;text-align:center;position:relative;' +
      'display:flex;flex-direction:column;align-items:center;gap:12px;' +
      'animation:fbPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;';
    var h = document.createElement('div');
    h.textContent = s.title; h.style.cssText = 'font-size:24px;';
    var sub = document.createElement('div');
    sub.textContent = s.sub; sub.style.cssText = 'font-size:15px;line-height:1.35;';
    var cats = document.createElement('div');
    cats.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;';
    Object.keys(s.cats).forEach(function (k) {
      var c = document.createElement('div');
      c.className = 'fb-cat' + (k === cat ? ' sel' : '');
      c.textContent = s.cats[k];
      c.addEventListener('click', function () {
        cat = k;
        if (window._menuClickSfx) window._menuClickSfx('select');
        Array.prototype.forEach.call(cats.children, function (x) { x.classList.remove('sel'); });
        c.classList.add('sel');
      });
      cats.appendChild(c);
    });
    var ta = document.createElement('textarea');
    ta.maxLength = 1000; ta.placeholder = s.ph; ta.rows = 5;
    ta.style.cssText = 'width:100%;box-sizing:border-box;resize:none;border:3px solid #8b6a00;border-radius:12px;' +
      'padding:10px;font-family:Arial,sans-serif;font-size:15px;color:#3a2d00;background:#fff;outline:none;';
    var msg = document.createElement('div');
    msg.style.cssText = 'font-size:14px;min-height:18px;';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;';
    // Same confirm1/confirm2.png button as the creator-message pop-up.
    var send = document.createElement('div');
    send.style.cssText = 'position:relative;width:76px;cursor:pointer;margin-top:2px;';
    var c1 = document.createElement('img');
    c1.src = 'images/confirm1.png'; c1.draggable = false;
    c1.style.cssText = 'display:block;width:100%;height:auto;pointer-events:none;user-select:none;';
    var c2 = document.createElement('img');
    c2.src = 'images/confirm2.png'; c2.draggable = false;
    c2.style.cssText = 'position:absolute;top:49%;left:50%;transform:translate(-50%,-50%);width:118%;height:auto;' +
      'pointer-events:none;user-select:none;opacity:0;transition:opacity 0.1s;';
    send.appendChild(c1); send.appendChild(c2);
    send.addEventListener('mouseenter', function () { c2.style.opacity = '1'; });
    send.addEventListener('mouseleave', function () { c2.style.opacity = '0'; });
    send.addEventListener('pointerdown', function () { c2.style.opacity = '0'; });
    // Red round close button, same as .account-modal-close (top-left corner).
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = '✕';
    cancel.style.cssText = 'position:absolute;top:-18px;left:-18px;width:50px;height:50px;border-radius:50%;' +
      'border:4px solid #a32a26;background:#e8504a;color:#fff;font-family:' + FONT + ';font-size:28px;' +
      'line-height:1;cursor:pointer;transition:transform 0.1s;padding:0;';
    cancel.addEventListener('mouseenter', function () { cancel.style.transform = 'scale(1.1)'; });
    cancel.addEventListener('mouseleave', function () { cancel.style.transform = ''; });
    card.appendChild(cancel);
    row.appendChild(send);

    function close() { if (window._menuClickSfx) window._menuClickSfx('select'); try { overlay.remove(); } catch (e) {} }
    cancel.addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });

    send.addEventListener('click', function () {
      if (busy) return;
      if (window._menuClickSfx) window._menuClickSfx('check');
      var text = ta.value.trim();
      if (text.length < 5) { msg.style.color = '#b00020'; msg.textContent = s.short; return; }
      if (!window.sb) { msg.style.color = '#b00020'; msg.textContent = s.err; return; }
      busy = true; send.style.opacity = '0.6';
      window.sb.rpc('submit_feedback', {
        p_category: cat, p_message: text, p_visitor: visitorId(),
        p_lang: lang(), p_platform: window.GC_PLATFORM || 'web'
      }).then(function (res) {
        busy = false; send.style.opacity = '1';
        var r = res && !res.error ? res.data : null;
        if (r === 'ok') {
          card.innerHTML = '';
          var t = document.createElement('div');
          t.textContent = s.thanks; t.style.cssText = 'font-size:20px;line-height:1.4;padding:10px 0;';
          card.appendChild(t);
          setTimeout(close, 2200);
        } else if (r === 'too_short') { msg.style.color = '#b00020'; msg.textContent = s.short; }
        else if (r === 'rate_limited') { msg.style.color = '#b00020'; msg.textContent = s.limit; }
        else { msg.style.color = '#b00020'; msg.textContent = s.err; }
      }, function () { busy = false; send.style.opacity = '1'; msg.style.color = '#b00020'; msg.textContent = s.err; });
    });

    var logo = document.createElement('img');
    logo.src = 'images/logo.png'; logo.alt = ''; logo.draggable = false;
    logo.style.cssText = 'width:110px;height:auto;user-select:none;';
    card.appendChild(logo);
    card.appendChild(h); card.appendChild(sub); card.appendChild(cats);
    card.appendChild(ta); card.appendChild(msg); card.appendChild(row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 50);
  }

  function init() {
    var ls = document.getElementById('loading-screen');
    if (!ls) return;
    injectStyles();
    var b = document.createElement('div');
    b.id = 'feedback-btn';
    // Same glass-blue pill as the language selector, placed right next to it.
    var inner = document.createElement('button');
    inner.type = 'button';
    inner.className = 'loading-icon-btn';
    var im = document.createElement('img');
    im.src = 'images/buttons/feedback.png'; im.alt = ''; im.draggable = false;
    inner.appendChild(im);
    b.appendChild(inner);
    b.addEventListener('click', open);
    ls.appendChild(b);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
