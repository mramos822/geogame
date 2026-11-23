// ── NEWS / WHAT'S NEW (menu button + modal) ─────────────────────────────────
// Round newspaper button next to the language and feedback buttons. Opens a
// cream modal (same look as the creator-message and feedback pop-ups) listing
// recent player-facing changes. Handwritten list: add new entries at the TOP
// of ENTRIES on each release ([date, tag, {es, en}]).
(function () {
  var FONT = "'VAGRoundBold','Arial Black',sans-serif";
  // [version, 'YYYY-MM-DD', tag, { es:[title, description], en:[title, description] }]
  var ENTRIES = [
    ['4.0.6', '2026-11-22', 'new', {
      es: ['Tu opinión cuenta', 'Nuevo botón de Feedback en el menú: cuéntanos qué modos, mejoras o ideas te gustaría ver en el juego. También estrenamos este panel de novedades y un nuevo botón de idioma.'],
      en: ['Your feedback matters', 'New Feedback button in the menu: tell us which modes, improvements or ideas you would like to see. We also launched this news panel and a new language button.']
    }],
    ['4.0.4', '2026-09-30', 'new', {
      es: ['Mensajes en tu perfil', 'El botón de Mensajes ahora está dentro de tu perfil, y el botón Perfil del menú muestra un aviso cuando tienes mensajes sin leer.'],
      en: ['Messages in your profile', 'The Messages button now lives inside your profile, and the Profile button in the menu shows a badge when you have unread messages.']
    }],
    ['4.0.0', '2026-09-27', 'new', {
      es: ['Monedas y niveles', 'Ahora tienes nivel y monedas. Al terminar una Gira Mundial o un GloboReto ganas monedas y XP que vuelan hacia tus barras, y al subir de nivel recibes un bono de monedas.'],
      en: ['Coins and levels', 'You now have a level and coins. After a World Tour or a GloboReto you earn coins and XP that fly into your bars, and leveling up gives you a coin bonus.']
    }],
    ['3.9.7', '2026-09-27', 'new', {
      es: ['Bonificación diaria', 'Entra cada día y reclama monedas: el premio crece con cada día seguido y desde el día 7 siempre recibes el máximo. Si te saltas un día, la racha empieza de nuevo.'],
      en: ['Daily bonus', 'Log in every day and claim coins: the prize grows with each day in a row, and from day 7 you always get the maximum. If you skip a day, the streak starts over.']
    }],
    ['3.9.0', '2026-09-24', 'new', {
      es: ['Emotes en duelos y salas', 'Envía emotes a tus rivales y amigos durante los versus 1 contra 1 y las salas de grupo. También con las teclas del 1 al 9 y el 0.'],
      en: ['Emotes in duels and rooms', 'Send emotes to your rivals and friends during 1-vs-1 versus and group rooms. You can also use the 1-9 and 0 keys.']
    }],
    ['3.8.5', '2026-09-24', 'new', {
      es: ['Silencia con un clic', 'Con la barra de volumen abierta, un clic silencia la música o los efectos y otro clic restaura el volumen anterior.'],
      en: ['Mute with one click', 'With the volume bar open, one click mutes the music or the sound effects and another click restores the previous volume.']
    }],
    ['3.7.0', '2026-09-19', 'new', {
      es: ['GloboReto Grupal por turnos', 'Juega GloboReto con amigos por turnos: una ruleta decide el orden, cada turno tiene cuenta regresiva y hay ronda de desempate. Tus amigos pueden mirar en vivo como espectadores.'],
      en: ['GloboReto Group, turn-based', 'Play GloboReto with friends in turns: a roulette decides the order, each turn has a countdown and there is a tiebreaker round. Your friends can watch live as spectators.']
    }],
    ['3.6.14', '2026-09-14', 'new', {
      es: ['Cuentas verificadas y marco Top 1', 'Las cuentas verificadas ahora llevan insignia, y el jugador número 1 del ranking luce un marco exclusivo.'],
      en: ['Verified accounts and Top 1 frame', 'Verified accounts now carry a badge, and the #1 ranked player wears an exclusive frame.']
    }],
    ['3.5.46', '2026-09-06', 'new', {
      es: ['Chat entre amigos', 'Escríbele directamente a tus amigos desde el panel Social.'],
      en: ['Chat with friends', 'Message your friends directly from the Social panel.']
    }],
    ['3.5.38', '2026-07-29', 'new', {
      es: ['GloboReto, Versus y Rankings', 'Llega GloboReto: adivina el país señalado en un globo 3D y mantén tu racha diaria. También se estrenan los duelos Versus 1 contra 1, los Rankings (Top 100, Global y Amigos) y el modo espectador.'],
      en: ['GloboReto, Versus and Rankings', 'GloboReto arrives: guess the country marked on a 3D globe and keep your daily streak. Versus 1-vs-1 duels, Rankings (Top 100, Global and Friends) and spectator mode also launch.']
    }]
  ];
  var STR = {
    es: { btn: 'Novedades', title: 'Novedades', sub: 'Lo último que hemos agregado a MyGeoChallenge.',
          tag: { new: 'Nuevo', fix: 'Arreglo' }, foot: 'Y mucho más en camino. ¡Gracias por jugar!',
          months: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'] },
    en: { btn: "What's new", title: "What's new", sub: 'The latest things we added to MyGeoChallenge.',
          tag: { new: 'New', fix: 'Fix' }, foot: 'And much more on the way. Thanks for playing!',
          months: ['January','February','March','April','May','June','July','August','September','October','November','December'] }
  };
  function L() { return (window.getLang && window.getLang()) === 'en' ? 'en' : 'es'; }
  function S() { return STR[L()]; }

  function injectStyles() {
    if (document.getElementById('news-styles')) return;
    var st = document.createElement('style');
    st.id = 'news-styles';
    st.textContent =
      '@keyframes newsPopIn{from{transform:scale(0.7);opacity:0}to{transform:scale(1);opacity:1}}' +
      '#news-btn{position:absolute;top:1.4cqmin;right:calc(16% + 16cqmin);z-index:8;}' +
      '#loading-screen.lobby-interim-bg #news-btn{display:none;}' +
      '.news-month{font-size:15px;color:#fffbe6;background:#8b6a00;border-radius:12px;padding:3px 14px;' +
      'display:inline-block;margin:12px 0 4px;}' +
      '.news-item{display:flex;flex-direction:column;gap:4px;text-align:left;background:#fff;' +
      'border:3px solid #e2cf8a;border-radius:14px;padding:10px 14px 11px;margin-top:8px;}' +
      '.news-item.latest{border-color:#8b6a00;}' +
      '.news-head{display:flex;align-items:center;gap:8px;}' +
      '.news-ver{font-size:13px;color:#5a4400;background:#ffd54a;border:2px solid #8b6a00;border-radius:10px;padding:0 9px;}' +
      '.news-day{margin-left:auto;font-size:12px;color:#8b6a00;}' +
      '.news-title{font-size:18px;color:#5a4400;line-height:1.2;}' +
      '.news-desc{font-family:Arial,sans-serif;font-weight:bold;font-size:13.5px;line-height:1.4;color:#5b4a1a;}' +
      '.news-tag{display:inline-block;font-family:' + FONT + ';font-size:11px;color:#fff;border-radius:10px;padding:1px 8px;}' +
      '.news-tag.new{background:#2e9e4f;}.news-tag.fix{background:#e08a00;}' +
      '#news-dot{position:absolute;top:-1px;right:-1px;width:2.4cqmin;height:2.4cqmin;border-radius:50%;' +
      'background:#e8504a;border:0.3cqmin solid #fff;pointer-events:none;}' +
      '#news-list::-webkit-scrollbar{width:8px;}#news-list::-webkit-scrollbar-thumb{background:#c9b15a;border-radius:6px;}';
    document.head.appendChild(st);
  }

  var SEEN_KEY = '_news_seen';
  function latest() { return ENTRIES[0][0]; }
  function hasUnseen() {
    try { return localStorage.getItem(SEEN_KEY) !== latest(); } catch (e) { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, latest()); } catch (e) {}
    var d = document.getElementById('news-dot');
    if (d) d.remove();
  }

  function open() {
    if (document.getElementById('news-overlay')) return;
    click('check');
    markSeen();
    var s = S();
    var overlay = document.createElement('div');
    overlay.id = 'news-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9100;display:flex;align-items:center;' +
      'justify-content:center;padding:28px;background:rgba(0,0,0,0.5);font-family:' + FONT + ';';
    var card = document.createElement('div');
    card.style.cssText = 'position:relative;width:100%;max-width:500px;max-height:86vh;background:#fffbe6;' +
      'color:#5a4400;border:4px solid #8b6a00;border-radius:18px;box-shadow:0 8px 22px rgba(0,0,0,0.4);' +
      'padding:22px 20px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;' +
      'animation:newsPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both;';

    // Red round close button, same as .account-modal-close (top-left corner).
    var x = document.createElement('button');
    x.type = 'button'; x.textContent = '\u2715';
    x.style.cssText = 'position:absolute;top:-20px;left:-20px;width:56px;height:56px;border-radius:50%;' +
      'border:4px solid #a32a26;background:#e8504a;color:#fff;font-family:' + FONT + ';font-size:32px;' +
      'line-height:1;cursor:pointer;transition:transform 0.1s;padding:0;';
    x.addEventListener('mouseenter', function () { x.style.transform = 'scale(1.1)'; });
    x.addEventListener('mouseleave', function () { x.style.transform = ''; });
    function close() { click('select'); try { overlay.remove(); } catch (e) {} }
    x.addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (!document.getElementById('news-overlay')) { document.removeEventListener('keydown', esc); return; }
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    var logo = document.createElement('img');
    logo.src = 'images/logo.png'; logo.alt = ''; logo.draggable = false;
    logo.style.cssText = 'width:96px;height:auto;user-select:none;';
    var h = document.createElement('div');
    h.textContent = s.title; h.style.cssText = 'font-size:26px;margin-top:2px;';
    var sub = document.createElement('div');
    sub.textContent = s.sub; sub.style.cssText = 'font-size:14px;';

    var list = document.createElement('div');
    list.id = 'news-list';
    list.style.cssText = 'width:100%;overflow-y:auto;margin-top:6px;padding:0 6px 4px 2px;';
    var lastMonth = '';
    ENTRIES.forEach(function (e, i) {
      var p = e[1].split('-');
      var mk = p[0] + '-' + p[1];
      if (mk !== lastMonth) {
        lastMonth = mk;
        var mh = document.createElement('div');
        mh.className = 'news-month';
        mh.textContent = s.months[parseInt(p[1], 10) - 1] + ' ' + p[0];
        list.appendChild(mh);
      }
      var row = document.createElement('div');
      row.className = 'news-item' + (i === 0 ? ' latest' : '');
      var head = document.createElement('div');
      head.className = 'news-head';
      var ver = document.createElement('span');
      ver.className = 'news-ver'; ver.textContent = 'Ver. ' + e[0];
      var tag = document.createElement('span');
      tag.className = 'news-tag ' + e[2]; tag.textContent = s.tag[e[2]] || e[2];
      var day = document.createElement('span');
      day.className = 'news-day'; day.textContent = parseInt(p[2], 10) + ' ' + s.months[parseInt(p[1], 10) - 1].slice(0, 3);
      head.appendChild(ver); head.appendChild(tag); head.appendChild(day);
      var tx = e[3][L()] || e[3].es;
      var ti = document.createElement('div');
      ti.className = 'news-title'; ti.textContent = tx[0];
      var de = document.createElement('div');
      de.className = 'news-desc'; de.textContent = tx[1];
      row.appendChild(head); row.appendChild(ti); row.appendChild(de);
      list.appendChild(row);
    });

    var foot = document.createElement('div');
    foot.textContent = s.foot; foot.style.cssText = 'font-size:13px;color:#8b6a00;margin-top:10px;';

    card.appendChild(x); card.appendChild(logo); card.appendChild(h);
    card.appendChild(sub); card.appendChild(list); card.appendChild(foot);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // Click sounds, same as the other menu buttons (sfxCheck = main menu click,
  // sfxSelect = small selections/closing). Globals from js/core/audio.js.
  function click(kind) {
    try {
      var a = kind === 'select' ? (typeof sfxSelect !== 'undefined' ? sfxSelect : null)
                                : (typeof sfxCheck !== 'undefined' ? sfxCheck : null);
      if (a && typeof sfxPlay === 'function') { a.currentTime = 0; sfxPlay(a); }
    } catch (e) {}
  }
  window._menuClickSfx = click;

  // The language/feedback/news buttons only exist on the MAIN menu: they are
  // hidden as soon as Play or GloboReto hide #loading-actions (they come back
  // with it when the player returns to the menu).
  function syncMainMenuOnly() {
    var ls = document.getElementById('loading-screen');
    var act = document.getElementById('loading-actions');
    if (!ls || !act) return;
    // Visible once the menu buttons have popped in (#loading-actions gets
    // display:flex from the boot / return-to-menu code); hidden when Play /
    // GloboReto hide the main buttons.
    var shouldShow = act.style.display === 'flex' || ls.classList.contains('table-shown');
    // While a menu panel is open the buttons stay visible but can't be clicked.
    ls.classList.toggle('menu-icons-locked', ls.classList.contains('table-shown'));
    var wasOff = ls.classList.contains('menu-icons-off');
    ls.classList.toggle('menu-icons-off', !shouldShow);
    if (shouldShow && wasOff) {
      // Pop in together with the Play / Social / Rankings buttons.
      ls.classList.remove('menu-icons-in'); void ls.offsetWidth; ls.classList.add('menu-icons-in');
    }
  }
  function watchMainMenu() {
    var act = document.getElementById('loading-actions');
    if (!act) return;
    var st = document.createElement('style');
    st.textContent = '#loading-screen.menu-icons-off #loading-lang,' +
      '#loading-screen.menu-icons-off #feedback-btn,#loading-screen.menu-icons-off #news-btn{display:none !important;}' +
      '#loading-screen.menu-icons-locked #loading-lang,#loading-screen.menu-icons-locked #feedback-btn,#loading-screen.menu-icons-locked #news-btn{pointer-events:none !important;}' +
      '#loading-screen.menu-icons-in #loading-lang .loading-icon-btn,#loading-screen.menu-icons-in #feedback-btn .loading-icon-btn,' +
      '#loading-screen.menu-icons-in #news-btn .loading-icon-btn{animation:pop-in 0.35s cubic-bezier(0.34,1.56,0.64,1) backwards;}' +
      '#loading-screen.menu-icons-in #feedback-btn .loading-icon-btn{animation-delay:0.08s;}' +
      '#loading-screen.menu-icons-in #news-btn .loading-icon-btn{animation-delay:0.16s;}';
    document.head.appendChild(st);
    new MutationObserver(syncMainMenuOnly).observe(act, { attributes: true, attributeFilter: ['style'] });
    new MutationObserver(syncMainMenuOnly).observe(document.getElementById('loading-screen'), { attributes: true, attributeFilter: ['class'] });
    syncMainMenuOnly();
    var lt = document.getElementById('loading-lang-toggle');
    if (lt) lt.addEventListener('click', function () { click('check'); });
  }

  function init() {
    var ls = document.getElementById('loading-screen');
    if (!ls) return;
    injectStyles();
    var b = document.createElement('div');
    b.id = 'news-btn';
    var inner = document.createElement('button');
    inner.type = 'button';
    inner.className = 'loading-icon-btn';
    var im = document.createElement('img');
    im.src = 'images/buttons/news.png'; im.alt = ''; im.draggable = false;
    inner.appendChild(im);
    b.appendChild(inner);
    if (hasUnseen()) { var dot = document.createElement('div'); dot.id = 'news-dot'; b.appendChild(dot); }
    b.addEventListener('click', open);
    ls.appendChild(b);
    watchMainMenu();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
