// ============================================================================
// menu/loading-boot.js — Preloader del loading screen: barra de progreso, precarga de assets vía
// window.ASSET_MANIFEST (saltada en mobile), disparo de las animaciones de
// entrada al terminar, y el bloque anti-titileo (decode anticipado de <img>).
// DEBE cargar DESPUÉS de manifest.js.
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

// ── LOADING SCREEN ───────────────────────────────────────────────────────────
(function () {
  const IMAGES = [
    'images/checkerrortable.png','images/check3.png','images/wrong3.png',
    'images/bg/sky.png','images/bg/sky2.png','images/bg/cloud1.png','images/bg/cloud2.png',
    'images/bg/level3complete.png','images/bg/level4complete.png','images/bg/level4complete2.png','images/bg/stairs.png',
    'images/bg/plane.png','images/bg/plane2.png','images/bg/plane3.png',
    'images/bg/plane4.png','images/bg/plane5.png','images/bg/plane6.png',
    'images/characters/people.png','images/characters/men1.png','images/characters/men2.png',
    'images/characters/women1.png','images/characters/girl1.png','images/characters/girl2.png',
    'images/characters/flightattpost2/1.png','images/characters/flightattpost2/2.png',
    'images/characters/flightattpost2/3.png','images/characters/flightattpost2/4.png',
    'images/characters/flightattpost2/5.png','images/characters/flightattpost2/6.png',
    'images/characters/flightattpost2/7.png','images/characters/flightattpost2/8.png',
    'images/characters/flightattpost2/9.png','images/characters/flightattpost2/10.png',
    'images/characters/flightattpost2/11.png',
    'images/characters/flightattpost/1.png','images/characters/flightattpost/2.png',
    'images/characters/flightattpost/3.png','images/characters/flightattpost/4.png',
    'images/characters/flightattpost/5.png','images/characters/flightattpost/6.png',
    'images/characters/flightattpost/7.png','images/characters/flightattpost/8.png',
    'images/characters/flightattpost/9.png','images/characters/flightattpost/10.png',
    'images/characters/flightattpost/11.png','images/characters/flightattpost/12.png',
    'images/characters/flightattpost/13.png','images/characters/flightattpost/14.png',
    'images/characters/flightattpost/15.png',
    'images/howtoplaytable.png','images/confirm1.png','images/confirm2.png',
    'images/text1.png','images/text2.png',
    'images/tag3.png','images/countdown4.png','images/points.png',
    'images/countdown/1.png','images/countdown/2.png','images/countdown/3.png',
    'images/countdown/go.png','images/countdown/timeup.png',
    'images/badges/bluebadge.png','images/badges/garnetbadge.png',
    'images/badges/goldbadge.png','images/badges/greenbadge.png',
    'images/badges/redbadge.png','images/badges/silverbadge.png',
    'images/badges/yellowbadge.png',
    'images/mapimage.png','images/countdownred4.png',
    'images/pin1.png','images/pin2.png',
    'images/vol1.png','images/vol2.png','images/logo.png',
  ];

  const AUDIO = [
    'sfx/check.mp3','sfx/postgameloop.mp3','sfx/pregameloop.mp3','sfx/menuloop.mp3','sfx/pin.mp3',
    'sfx/countdown.mp3','sfx/cuentaregresiva.mp3','sfx/error.mp3',
    'sfx/acertar.mp3','sfx/verynice.mp3','sfx/tag.mp3',
    'sfx/bonus.mp3','sfx/timesup.mp3','sfx/gamemusic.mp3','sfx/select.mp3',
  ];

  const barFill = document.getElementById('loading-bar-fill');
  const pctEl   = document.getElementById('loading-pct');
  const playBtn = document.getElementById('loading-play-btn');

  const planet = document.querySelector('.loading-planet');
  if (planet) {
    const randomDeg = Math.floor(Math.random() * 360);
    planet.style.animation = 'none';
    planet.getBoundingClientRect();
    planet.style.animation = `planet-spin 25s linear -${(randomDeg / 360) * 25}s infinite`;
  }

  // Lista COMPLETA de assets: usa el manifest auto-generado (todos los archivos de
  // images/ y sfx/). Si por algo falta, cae a la lista mínima embebida.
  const M = window.ASSET_MANIFEST || {};
  // En mobile reducir concurrencia y saltear decode() para no picar memoria.
  const isMobile = navigator.maxTouchPoints > 1;
  // En MOBILE no precargar imágenes en absoluto. El preloader creaba un new Image()
  // por cada una de las ~880 imágenes del manifest y las retenía en
  // window.__preloadedImages → cientos de MB de bitmaps clavados en RAM desde el
  // arranque, dejando iOS al borde del límite y reiniciando la pestaña en las
  // transiciones de campaña. Las imágenes se cargan y decodifican on-demand cuando
  // se muestran, y el navegador las libera cuando ya no se usan. En desktop sí se
  // precargan (hay RAM de sobra y acelera el primer render).
  const imgList   = isMobile ? [] : ((M.images && M.images.length) ? M.images : IMAGES);
  const audioList = (M.audio  && M.audio.length)  ? M.audio  : AUDIO;
  const videoList = M.video || [];

  const imgConcurrency   = isMobile ? 4 : 24;
  const audioConcurrency = isMobile ? 4 : 8;

  window.__preloadedImages = window.__preloadedImages || [];

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      const finish = () => { window.__preloadedImages.push(img); resolve(); };
      img.onload = () => { (img.decode ? img.decode().then(finish, finish) : finish()); };
      img.onerror = finish;
      img.src = src;
    });
  }

  function runPool(items, worker, concurrency, onEach) {
    let i = 0;
    const next = () => {
      if (i >= items.length) return Promise.resolve();
      const item = items[i++];
      return worker(item).then(() => { onEach(); return next(); });
    };
    const runners = [];
    for (let k = 0; k < Math.min(concurrency, items.length); k++) runners.push(next());
    return Promise.all(runners);
  }

  // En mobile saltear el preload de video como blob — los videos se cachean igual
  // via fetch liviano y se decodifican on-demand sin acumular blobs en memoria.
  const effectiveVideoList = isMobile ? [] : videoList;
  const total = imgList.length + audioList.length + effectiveVideoList.length + 2;
  let done = 0;
  window.__loadingReady = false;

  function tick() {
    done++;
    const pct = Math.min(100, Math.round(done / total * 100));
    barFill.style.width = pct + '%';
    pctEl.textContent   = pct + '%';
    if (done >= total) {
      window.__loadingReady = true;

      function fireEntranceAnimations() {
        document.querySelectorAll('.flightatt-loading, .flightatt-loading-shadow').forEach(el => {
          requestAnimationFrame(() => el.classList.add('entered'));
        });
        const planeWrap = document.querySelector('.loading-plane-wrap');
        if (planeWrap) {
          requestAnimationFrame(() => planeWrap.classList.add('plane-ready'));
          planeWrap.addEventListener('transitionend', () => planeWrap.classList.add('plane-above'), { once: true });
        }
        const logo = document.querySelector('.loading-logo');
        if (logo) requestAnimationFrame(() => logo.classList.add('logo-ready'));
        const planetWrap = document.querySelector('.loading-planet-wrap');
        if (planetWrap) requestAnimationFrame(() => planetWrap.classList.add('planet-ready'));
        requestAnimationFrame(() => {
          barFill.closest('.loading-bar-track')?.classList.add('bar-done');
          pctEl?.classList.add('bar-done');
        });
        const actions = document.getElementById('loading-actions');
        if (actions) actions.style.display = 'flex';
        document.getElementById('loading-play-wrap').style.display = 'flex';
        playBtn.addEventListener('animationend', () => playBtn.classList.add('loaded'), { once: true });
        const flagsBtn = document.getElementById('loading-flags-btn');
        document.getElementById('loading-flags-wrap').style.display = 'flex';
        flagsBtn.addEventListener('animationend', () => flagsBtn.classList.add('loaded'), { once: true });
        const shapesBtn = document.getElementById('loading-shapes-btn');
        document.getElementById('loading-shapes-wrap').style.display = 'flex';
        shapesBtn.addEventListener('animationend', () => shapesBtn.classList.add('loaded'), { once: true });
        const mode4Btn = document.getElementById('loading-mode4-btn');
        document.getElementById('loading-mode4-wrap').style.display = 'flex';
        mode4Btn.addEventListener('animationend', () => mode4Btn.classList.add('loaded'), { once: true });
        const accountWrap = document.getElementById('profile-account-btn');
        if (accountWrap) accountWrap.style.display = 'block';
        const globequizWrap = document.getElementById('globequiz-btn');
        if (globequizWrap) globequizWrap.style.display = 'block';
        const messagesWrap = document.getElementById('loading-messages-btn');
        if (messagesWrap) messagesWrap.style.display = 'block';
        if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
        const resultsBtn = document.getElementById('loading-results-btn');
        if (resultsBtn) resultsBtn.style.display = 'block';
        // Arrancar menuloop; si autoplay bloqueado, esperar primer gesto
        window.startMenuMusic();
      }

      // Esperar a que name-prompt y account-modal estén cerrados antes de animar
      const namePrompt   = document.getElementById('name-prompt');
      const accountModal = document.getElementById('account-modal');
      const nameBlocking    = namePrompt   && namePrompt.classList.contains('visible');
      const accountBlocking = accountModal && accountModal.classList.contains('open');

      if (!nameBlocking && !accountBlocking) {
        fireEntranceAnimations();
      } else {
        let nameOk    = !nameBlocking;
        let accountOk = !accountBlocking;
        function checkAndFire() { if (nameOk && accountOk) { obs.disconnect(); fireEntranceAnimations(); } }
        const obs = new MutationObserver(() => {
          if (!nameOk    && namePrompt   && !namePrompt.classList.contains('visible')) nameOk = true;
          if (!accountOk && accountModal && !accountModal.classList.contains('open'))  accountOk = true;
          checkAndFire();
        });
        if (namePrompt)   obs.observe(namePrompt,   { attributes: true, attributeFilter: ['class', 'style'] });
        if (accountModal) obs.observe(accountModal, { attributes: true, attributeFilter: ['class'] });
      }
      const fmt = v => v > 0 ? '🏆 ' + v.toLocaleString() : '';
      const _hs = _loadingHsValues();
      const elPlay      = document.getElementById('loading-play-hs');
      const elFlags     = document.getElementById('loading-flags-hs');
      const elShapes    = document.getElementById('loading-shapes-hs');
      const elMode4     = document.getElementById('loading-mode4-hs');
      if (elPlay)   elPlay.textContent   = fmt(_hs.play);
      if (elFlags)  elFlags.textContent  = fmt(_hs.flags);
      if (elShapes) elShapes.textContent = fmt(_hs.shapes);
      if (elMode4)  elMode4.textContent  = fmt(_hs.mode4);
      if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
    }
  }

  runPool(imgList, loadImage, imgConcurrency, tick);
  runPool(audioList, src => fetch(src).then(r => r.arrayBuffer()).catch(() => {}), audioConcurrency, tick);
  runPool(effectiveVideoList, src => fetch(src).then(r => r.blob()).catch(() => {}), 3, tick);

  Promise.resolve(document.fonts.ready).then(tick, tick);
  (document.readyState === 'complete')
    ? tick()
    : window.addEventListener('load', tick, { once: true });

})();

// ── OPTIMIZACIÓN ANTI-TITILEO ────────────────────────────────────────────────
// El preloader decodifica copias Image() (para tener el recurso en caché), pero
// los <img> reales del DOM se decodifican recién al mostrarse → titilan. Acá los
// decodificamos de antemano y marcamos como decoding="sync" las imágenes cuyo
// src se intercambia entre modos, para que al cambiar de juego no muestren un
// frame en blanco.
window.addEventListener('load', () => {
  // Warming: decodificar todos los <img> ya presentes en el DOM.
  // En mobile NO hacerlo: forzaría decodificar a la vez los fondos de los 4 modos
  // (cada uno un bitmap grande) y al estar en el DOM quedarían retenidos → suma a
  // la presión de RAM que crashea iOS. En mobile se decodifican on-demand.
  const _isMobileWarm = navigator.maxTouchPoints > 1;
  if (!_isMobileWarm) {
    document.querySelectorAll('img').forEach(img => {
      if (img.decode) img.decode().catch(() => {});
    });
  }
  // Imágenes que cambian de src al pasar de modo: decodificación síncrona.
  document.querySelectorAll(
    '.game-bg-city, .game-bg-check3, .game-bg-wrong3, .game-bg-men, ' +
    '.game-bg-girl, .game-bg-women, #pregame-countdown-img, #flags-pregame-countdown-img'
  ).forEach(img => { img.decoding = 'sync'; });
}, { once: true });
