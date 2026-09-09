// ============================================================================
// menu/loading-boot.js — loading-screen preloader: progress bar, asset preload
// via window.ASSET_MANIFEST (skipped on mobile), firing the entrance animations
// when done, and the anti-flicker block (early <img> decode).
// MUST load AFTER manifest.js.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
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

  // FULL asset list: uses the auto-generated manifest (every file under images/
  // and sfx/). Falls back to the minimal embedded list if it's missing.
  const M = window.ASSET_MANIFEST || {};
  // On mobile, lower concurrency and skip decode() to avoid spiking memory.
  const isMobile = navigator.maxTouchPoints > 1;
  // On MOBILE don't preload images at all. The preloader created a new Image()
  // per manifest image (~880) and held them in window.__preloadedImages →
  // hundreds of MB of bitmaps pinned in RAM from startup, leaving iOS near the
  // limit and reloading the tab on campaign transitions. Images load and decode
  // on-demand when shown, and the browser frees them when unused. Desktop does
  // preload (plenty of RAM, speeds up first render).
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

  // On mobile skip preloading video as a blob — videos still get cached via a
  // light fetch and decode on-demand without piling up blobs in memory.
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
        // Start menuloop; if autoplay is blocked, wait for the first gesture
        window.startMenuMusic();
      }

      // Wait for name-prompt and account-modal to be closed before animating
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

// ── ANTI-FLICKER OPTIMIZATION ────────────────────────────────────────────────
// The preloader decodes Image() copies (to cache the resource), but the real DOM
// <img>s only decode when shown → they flicker. Here we decode them ahead of
// time and set decoding="sync" on images whose src is swapped between modes, so
// switching games doesn't show a blank frame.
window.addEventListener('load', () => {
  // Warming: decode every <img> already in the DOM.
  // Don't on mobile: it would decode all 4 modes' backgrounds at once (each a
  // big bitmap), retained while in the DOM → adds to the RAM pressure that
  // crashes iOS. Mobile decodes on-demand.
  const _isMobileWarm = navigator.maxTouchPoints > 1;
  if (!_isMobileWarm) {
    document.querySelectorAll('img').forEach(img => {
      if (img.decode) img.decode().catch(() => {});
    });
  }
  // Images that change src on mode switch: synchronous decoding.
  document.querySelectorAll(
    '.game-bg-city, .game-bg-check3, .game-bg-wrong3, .game-bg-men, ' +
    '.game-bg-girl, .game-bg-women, #pregame-countdown-img, #flags-pregame-countdown-img'
  ).forEach(img => { img.decoding = 'sync'; });
}, { once: true });
