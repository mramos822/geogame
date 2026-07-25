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
      const playHs      = parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10);
      const flagsHs     = parseInt(localStorage.getItem('flagsHighscore')         || '0', 10);
      const shapesHs    = parseInt(localStorage.getItem('shapesHighscore')        || '0', 10);
      const monumentsHs = parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10);
      const elPlay      = document.getElementById('loading-play-hs');
      const elFlags     = document.getElementById('loading-flags-hs');
      const elShapes    = document.getElementById('loading-shapes-hs');
      const elMode4     = document.getElementById('loading-mode4-hs');
      if (elPlay)   elPlay.textContent   = fmt(playHs);
      if (elFlags)  elFlags.textContent  = fmt(flagsHs);
      if (elShapes) elShapes.textContent = fmt(shapesHs);
      if (elMode4)  elMode4.textContent  = fmt(monumentsHs);
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

// Actualiza el panel de perfil (nombre, veces jugadas, promedios, highscores,
// Sincroniza los datos locales (scores/averages/plays) a la cuenta de Supabase al iniciar sesión.
// Es idempotente: si ya estaban sincronizados (local=0 tras el último logout), no hace nada.
async function syncLocalDataToAccount(userId) {
  try {
    const profile = await window.sbGetProfile(userId);
    const localHs = {
      flags:     parseInt(localStorage.getItem('flagsHighscore')          || '0', 10),
      shapes:    parseInt(localStorage.getItem('shapesHighscore')         || '0', 10),
      cities:    parseInt(localStorage.getItem('geochallenge_highscore')  || '0', 10),
      monuments: parseInt(localStorage.getItem('monumentsHighscore')      || '0', 10),
    };
    const modeToLsKey = { flags: 'flags', shapes: 'shapes', cities: 'game', monuments: 'monuments' };
    const updates = {};
    Object.entries(localHs).forEach(([k, v]) => {
      if (v > (profile['hs_' + k] || 0)) updates['hs_' + k] = v;
    });
    Object.entries(modeToLsKey).forEach(([dbKey, lsKey]) => {
      const sum   = parseInt(localStorage.getItem('avgSum_'   + lsKey) || '0', 10);
      const count = parseInt(localStorage.getItem('avgCount_' + lsKey) || '0', 10);
      if (sum > 0 && count > 0) {
        updates['avg_sum_'    + dbKey] = (profile['avg_sum_'    + dbKey] || 0) + sum;
        updates['play_count_' + dbKey] = (profile['play_count_' + dbKey] || 0) + count;
      }
    });
    const localPlays = parseInt(localStorage.getItem('playCount') || '0', 10);
    if (localPlays > 0) updates.play_count = (profile.play_count || 0) + localPlays;
    if (Object.keys(updates).length > 0) await window.sbUpdateProfile(userId, updates);
  } catch(e) { console.warn('[sync] error:', e.message); }
}

// Copia los hs de Supabase a localStorage (toma el máximo) para que el display
// en partida muestre el récord correcto sin necesidad de llegar al final.
function syncHsFromProfile(profile) {
  const map = {
    flagsHighscore:          profile.hs_flags     || 0,
    shapesHighscore:         profile.hs_shapes    || 0,
    geochallenge_highscore:  profile.hs_cities    || 0,
    monumentsHighscore:      profile.hs_monuments || 0,
    totalHighscore:          profile.hs_total     || 0,
  };
  Object.entries(map).forEach(([k, v]) => {
    const cur = parseInt(localStorage.getItem(k) || '0', 10);
    if (v > cur) localStorage.setItem(k, String(v));
  });
}

window.syncHsFromProfile = syncHsFromProfile;

// Ruta de la bandera del país (código ISO2) para el circulito de perfil.
function flagUrlForCountryCode(cc) {
  const file = cc && window.COUNTRY_CODE_TO_FLAG ? window.COUNTRY_CODE_TO_FLAG[cc.toUpperCase()] : null;
  return file ? `images/flags/${file}.png` : null;
}
window.flagUrlForCountryCode = flagUrlForCountryCode;

// La copa (izquierda del "Has jugado X veces") y la bandera (derecha del
// nombre) viven fuera de esos textos, como elementos absolutos aparte, para
// no tener que tocar el flex interno del name-wrap. Pero eso significa que
// si solo se pega el badge al costado del texto YA centrado (left:50%), el
// conjunto [badge+texto] queda descentrado — el texto sigue en el medio y el
// badge cuelga para un lado. Acá se centra el PAR como si fuera un solo
// bloque: se corre el texto la mitad del ancho del badge (+gap) hacia el
// lado contrario, y el badge se pega justo al lado de esa nueva posición.
const BADGE_TEXT_GAP = 40; // px, separación entre el badge y el texto
function _centerBadgeWithText(textEl, badgeEl, side) {
  if (!textEl || !badgeEl) return;
  const parent = badgeEl.offsetParent;
  if (!parent) return;

  // Centro NATURAL del texto: el que le da su propio CSS sin ningún corrimiento
  // nuestro (no siempre es el 50% del panel — el name-wrap del amigo, por
  // ejemplo, se centra un poco más a la izquierda que el propio para quedar
  // entre el back y la foto). Se limpia el left inline y se mide en vivo, así
  // esto funciona sea cual sea ese centro sin tener que hardcodearlo acá.
  textEl.style.left = '';
  if (badgeEl.style.display === 'none') return;

  // getBoundingClientRect() da coordenadas de PANTALLA (post transform/zoom del
  // #app-stage, ver letterbox.js), pero `left` inline se mide en el espacio
  // LOCAL sin escalar del stage (1920×911, contra el que se calculan las cq).
  // Sin dividir por --app-fit, esta cuenta solo daba bien con la ventana al
  // tamaño de referencia exacto y se desalineaba (nombre/bandera/copa
  // "reaccionando" al resize/zoom) en cualquier otro tamaño. offsetWidth/
  // offsetHeight ya están en local (los transforms no afectan al layout), así
  // que esos no se tocan — solo los deltas que salen de getBoundingClientRect().
  const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-fit')) || 1;

  const parentRect      = parent.getBoundingClientRect();
  const naturalRect     = textEl.getBoundingClientRect();
  const naturalCenterX  = (naturalRect.left - parentRect.left) / fit + textEl.offsetWidth / 2;
  const badgeW  = badgeEl.offsetWidth;
  const textW   = textEl.offsetWidth;
  const shift   = (badgeW + BADGE_TEXT_GAP) / 2;

  let textCenterX, badgeLeftPx;
  if (side === 'before') { // badge a la izquierda del texto (la copa)
    textCenterX = naturalCenterX + shift;
    const textLeftEdge = textCenterX - textW / 2;
    badgeLeftPx = textLeftEdge - BADGE_TEXT_GAP; // badge usa translate(-100%,-50%): left = su borde derecho
  } else { // side === 'after' — badge a la derecha del texto (la bandera)
    textCenterX = naturalCenterX - shift;
    const textRightEdge = textCenterX + textW / 2;
    badgeLeftPx = textRightEdge + BADGE_TEXT_GAP; // badge usa translate(0,-50%): left = su borde izquierdo
  }
  // El transform:translate(-50%,...) que ya trae el CSS del texto termina de
  // centrarlo sobre este punto (mismo mecanismo que su 'left:50%' original).
  textEl.style.left = textCenterX + 'px';
  badgeEl.style.left = badgeLeftPx + 'px';
  const textRect = textEl.getBoundingClientRect(); // ya en su posición final (pantalla)
  badgeEl.style.top = (textRect.top - parentRect.top) / fit + textEl.offsetHeight / 2 + 'px';
}
window._centerBadgeWithText = _centerBadgeWithText;

function _repositionVisibleRankBadges() {
  // La copa vive en el renglón de "Has jugado X veces" (no en el del nombre).
  const ownBadge = document.getElementById('profile-rank-badge');
  const ownPlayCount = document.getElementById('loading-play-count');
  if (ownBadge && ownPlayCount) _centerBadgeWithText(ownPlayCount, ownBadge, 'before');
  const friendBadge = document.getElementById('loading-friend-rank-badge');
  const friendPlayCount = document.getElementById('loading-friend-play-count');
  if (friendBadge && friendPlayCount) _centerBadgeWithText(friendPlayCount, friendBadge, 'before');

  const ownWrap = document.getElementById('loading-name-wrap');
  const ownFlag = document.getElementById('profile-flag-badge');
  if (ownFlag && ownWrap) _centerBadgeWithText(ownWrap, ownFlag, 'after');
  const friendWrap = document.querySelector('#loading-friend-group .loading-name-wrap');
  const friendFlag = document.getElementById('loading-friend-flag-badge');
  if (friendFlag && friendWrap) _centerBadgeWithText(friendWrap, friendFlag, 'after');
}
window.addEventListener('resize', () => requestAnimationFrame(_repositionVisibleRankBadges));

// Si la cuenta todavía no tiene guardado el país donde fue creada (cuentas
// viejas, previas a este feature), lo detecta por IP en este login y lo
// guarda como si fuera el de creación (backfill silencioso, ver memoria).
async function _ensureCountryCode(profile) {
  if (!profile || !profile.id || profile.country_code) return;
  try {
    let cc = localStorage.getItem('_an_country');
    if (!cc) {
      const r = await fetch('https://ipinfo.io/json');
      const d = await r.json();
      cc = (d && d.country) || '';
      localStorage.setItem('_an_country', cc);
    }
    if (!cc) return;
    await window.sbUpdateProfile(profile.id, { country_code: cc });
    profile.country_code = cc;
    if (window._sbProfile && window._sbProfile.id === profile.id) window._sbProfile.country_code = cc;
    if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  } catch (e) {}
}
window._ensureCountryCode = _ensureCountryCode;

// Limpia los scores locales al cerrar sesión (quedan en cero para el perfil guest).
function clearLocalScores(full = false) {
  const keys = ['playCount','avgSum_flags','avgSum_shapes','avgSum_game','avgSum_monuments',
                 'avgCount_flags','avgCount_shapes','avgCount_game','avgCount_monuments'];
  // Solo en logout completo se borran también los hs (vuelven a 0 en modo guest)
  if (full) keys.push('geochallenge_highscore','flagsHighscore','shapesHighscore','monumentsHighscore','totalHighscore');
  keys.forEach(k => localStorage.removeItem(k));
}

// rango). Se llama al cargar y cada vez que se vuelve al loading screen, para
// que refleje los datos de la última partida (Supabase si está logueado, local si no).
window.refreshProfileStats = function () {
  const p = window._sbProfile;
  let flagsHs, shapesHs, playHs, monumentsHs, plays, avgs;
  if (p && window._accountLoggedIn) {
    flagsHs     = p.hs_flags     || 0;
    shapesHs    = p.hs_shapes    || 0;
    playHs      = p.hs_cities    || 0;
    monumentsHs = p.hs_monuments || 0;
    plays       = p.play_count   || 0;
    avgs = {
      1: p.avg_sum_flags     && (p.play_count_flags     || plays) ? Math.round(p.avg_sum_flags     / (p.play_count_flags     || plays)) : 0,
      2: p.avg_sum_shapes    && (p.play_count_shapes    || plays) ? Math.round(p.avg_sum_shapes    / (p.play_count_shapes    || plays)) : 0,
      3: p.avg_sum_cities    && (p.play_count_cities    || plays) ? Math.round(p.avg_sum_cities    / (p.play_count_cities    || plays)) : 0,
      4: p.avg_sum_monuments && (p.play_count_monuments || plays) ? Math.round(p.avg_sum_monuments / (p.play_count_monuments || plays)) : 0,
    };
  } else {
    flagsHs     = parseInt(localStorage.getItem('flagsHighscore')         || '0', 10);
    shapesHs    = parseInt(localStorage.getItem('shapesHighscore')        || '0', 10);
    playHs      = parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10);
    monumentsHs = parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10);
    plays       = parseInt(localStorage.getItem('playCount')              || '0', 10);
    const avgKeys = { 1: 'flags', 2: 'shapes', 3: 'game', 4: 'monuments' };
    avgs = {};
    [1,2,3,4].forEach(i => {
      const sum   = parseInt(localStorage.getItem('avgSum_'   + avgKeys[i]) || '0', 10);
      const count = parseInt(localStorage.getItem('avgCount_' + avgKeys[i]) || '0', 10);
      avgs[i] = count > 0 ? Math.round(sum / count) : 0;
    });
  }
  const elName = document.getElementById('loading-player-name');
  if (elName) elName.textContent = localStorage.getItem('playerName') || 'John';
  const badgeEl = document.getElementById('loading-supporter-badge');
  if (badgeEl) badgeEl.style.display = (p && p.is_supporter) ? '' : 'none';
  const elPlays = document.getElementById('loading-play-count');
  if (elPlays) elPlays.textContent = tn('profile.playedTimes', plays);
  // Record de versus (solo con cuenta; oculto si nunca jugó versus)
  const vsEl = document.getElementById('loading-vs-record');
  if (vsEl) {
    const w = (p && window._accountLoggedIn) ? (p.vs_wins || 0) : 0;
    const l = (p && window._accountLoggedIn) ? (p.vs_losses || 0) : 0;
    if (p && window._accountLoggedIn && (w > 0 || l > 0)) {
      vsEl.style.display = '';
      vsEl.innerHTML = t('profile.vsRecord', { w: `<span class="vs-w">${w}</span>`, l: `<span class="vs-l">${l}</span>` });
    } else {
      vsEl.style.display = 'none';
    }
  }
  if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
  const gamesHs = { 1: flagsHs, 2: shapesHs, 3: playHs, 4: monumentsHs };
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('loading-games-avg' + i);
    if (el) el.textContent = gamesHs[i].toLocaleString();
  });
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('loading-games-hs' + i);
    if (el) el.textContent = avgs[i].toLocaleString();
  });
  const rankEl = document.getElementById('loading-games-rank');
  if (rankEl && typeof getRank === 'function') {
    const totalHs = flagsHs + shapesHs + playHs + monumentsHs;
    const totalEl = document.getElementById('loading-games-total');
    if (totalEl) totalEl.textContent = totalHs.toLocaleString();
    const rk = getRank(totalHs);
    if (rk) rankEl.src = rk.img;
    const rankLabel = document.getElementById('loading-games-rank-label');
    if (rankLabel && rk) {
      rankLabel.textContent = rk.name;
      const maxWidth = (document.getElementById('loading-games-rank')?.offsetWidth || 240) * 1.15;
      let size = 4;
      rankLabel.style.fontSize = size + 'cqmin';
      while (rankLabel.scrollWidth > maxWidth && size > 1.6) {
        size -= 0.1;
        rankLabel.style.fontSize = size + 'cqmin';
      }
    }
  }

  // Copa + puesto global (solo cuentas registradas: los invitados no están en rankings).
  const rankBadge = document.getElementById('profile-rank-badge');
  if (rankBadge) {
    if (p && window._accountLoggedIn && p.id && typeof window.getGlobalRankForId === 'function') {
      window.getGlobalRankForId(p.id).then(pos => {
        if (!pos) { rankBadge.style.display = 'none'; _centerBadgeWithText(document.getElementById('loading-play-count'), rankBadge, 'before'); return; }
        rankBadge.style.display = '';
        const cupEl = document.getElementById('profile-rank-cup');
        const numEl = document.getElementById('profile-rank-num');
        if (cupEl) cupEl.src = `images/cups/${window._cupForRank(pos)}.png`;
        if (numEl) numEl.textContent = '#' + pos;
        _centerBadgeWithText(document.getElementById('loading-play-count'), rankBadge, 'before');
      }).catch(() => { rankBadge.style.display = 'none'; _centerBadgeWithText(document.getElementById('loading-play-count'), rankBadge, 'before'); });
    } else {
      rankBadge.style.display = 'none';
      _centerBadgeWithText(document.getElementById('loading-play-count'), rankBadge, 'before');
    }
  }

  // Bandera del país de creación de la cuenta.
  const flagBadge = document.getElementById('profile-flag-badge');
  if (flagBadge) {
    const flagUrl = (p && window._accountLoggedIn) ? window.flagUrlForCountryCode?.(p.country_code) : null;
    const nameWrap = document.getElementById('loading-name-wrap');
    if (flagUrl) {
      flagBadge.style.display = '';
      const img = document.getElementById('profile-flag-badge-img');
      if (img) img.src = flagUrl;
      _centerBadgeWithText(nameWrap, flagBadge, 'after');
    } else {
      flagBadge.style.display = 'none';
      _centerBadgeWithText(nameWrap, flagBadge, 'after');
    }
  }

  if (typeof window._applyFounderFrame === 'function') window._applyFounderFrame();
};

// ── SFX ───────────────────────────────────────────────────────────────────────
// Solo check y postgame se necesitan en el splash — el resto se difiere al primer juego
const sfxCheck     = new Audio('sfx/check.mp3');
const sfxPostgame  = new Audio('sfx/postgameloop.mp3');
sfxPostgame.loop   = true;
// Splash/pre-ronda (antes de jugar) — distinto de sfxPostgame (pantalla de
// resultados); antes ambos reusaban postgameloop.mp3 para las dos cosas.
const sfxPregame   = new Audio('sfx/pregameloop.mp3');
sfxPregame.loop    = true;
const sfxGameMusic = new Audio('sfx/gamemusic.mp3');
sfxGameMusic.loop  = true;
const sfxMenuMusic = new Audio('sfx/menuloop.mp3');
sfxMenuMusic.loop  = true;
window.sfxMenuMusic = sfxMenuMusic;
window.startMenuMusic = function () {
  const m = window.sfxMenuMusic;
  if (!m) return;
  m.loop = true;
  m.currentTime = 0;
  m.muted = localStorage.getItem('muted') === 'true';
  const p = m.play();
  if (p && typeof p.then === 'function') {
    p.catch(() => {
      const onGesture = () => {
        m.currentTime = 0;
        m.play().catch(() => {});
        document.removeEventListener('click',      onGesture, true);
        document.removeEventListener('touchstart', onGesture, true);
        document.removeEventListener('keydown',    onGesture, true);
      };
      document.addEventListener('click',      onGesture, { once: true, capture: true });
      document.addEventListener('touchstart', onGesture, { once: true, capture: true });
      document.addEventListener('keydown',    onGesture, { once: true, capture: true });
    });
  }
};
const sfxSelect    = new Audio('sfx/select.mp3');
if (localStorage.getItem('muted') === 'true') { sfxCheck.volume = 0; sfxPostgame.volume = 0; sfxPregame.volume = 0; sfxGameMusic.volume = 0; sfxMenuMusic.volume = 0; sfxSelect.volume = 0; }
[sfxCheck, sfxSelect].forEach(sfx => { sfx.load(); });

// ── MÚSICA EN LOOP: motor Web Audio SOLO en iOS ───────────────────────────────
// En PC se usa el <audio loop> de siempre (camino intacto, sin riesgo). En iOS el
// <audio loop> deja gaps al repetir, llega tarde o se congela; ahí decodificamos
// el buffer una vez y lo reproducimos con AudioBufferSourceNode.loop (gapless).
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_MOBILE = IS_IOS || navigator.maxTouchPoints > 1;
if (IS_IOS)    document.body.classList.add('is-ios');
if (IS_MOBILE) document.body.classList.add('is-mobile');

// Muestra/oculta el confirm del gameover (se revela tras cargar assets del siguiente modo).
window.showGameoverConfirm = function () {
  const w = document.querySelector('.gameover-confirm-wrap');
  if (w) w.classList.add('confirm-ready');
};
window.hideGameoverConfirm = function () {
  const w = document.querySelector('.gameover-confirm-wrap');
  if (w) w.classList.remove('confirm-ready');
};

// Muestra/oculta el confirm del splash pre-game.
window.showSplashConfirm = function () {
  const w = document.querySelector('.splash-confirm-wrap');
  if (w) w.classList.add('confirm-ready');
};
window.hideSplashConfirm = function () {
  const w = document.querySelector('.splash-confirm-wrap');
  if (w) w.classList.remove('confirm-ready');
};

// Oculta el splash confirm y lo revela cuando el video de howtoplay puede reproducirse.
window.waitForHowtoVideo = function () {
  window.hideSplashConfirm();
  const v = document.querySelector('.splash-howtoplay-video');
  if (!v || v.readyState >= 3) { window.showSplashConfirm(); return; }
  let done = false;
  const reveal = () => { if (!done) { done = true; window.showSplashConfirm(); } };
  v.addEventListener('canplaythrough', reveal, { once: true });
  v.addEventListener('loadeddata',     reveal, { once: true });
  v.addEventListener('error',          reveal, { once: true });
  setTimeout(reveal, 5000); // fallback de seguridad
};

// Cambia el video de howtoplay. En mobile RECREA el elemento entero (no
// reusa el mismo <video> con src+load) — el crash-log de una sesión real
// (18 pasos, ver project_ios_crash_investigation) mostró que el swap
// flags→shapes es LITERALMENTE lo último que corre antes del crash de iOS:
// WebKit no libera de forma confiable el decoder/IOSurface del video
// anterior al pisarle el src mientras sigue montado. Esto ya se había
// confirmado y arreglado así en la investigación original (1.64) para
// justo esta transición temprana; se había revertido a swap simple en el
// cleanup de 1.71 asumiendo que ya no hacía falta — hace falta.
window.swapHowtoVideo = function (newSrc) {
  const old = document.querySelector('.splash-howtoplay-video');
  if (!old) return;
  if (!IS_MOBILE) {
    try { old.src = newSrc; old.load(); } catch (e) {}
    return;
  }
  try {
    old.pause();
    old.removeAttribute('src');
    old.load();
    const fresh = document.createElement('video');
    fresh.className = old.className;
    fresh.loop = true;
    fresh.muted = true;
    fresh.setAttribute('playsinline', '');
    fresh.setAttribute('preload', 'none');
    old.replaceWith(fresh);
    fresh.src = newSrc;
    // NO fresh.load() acá — el crash-log mostró que sigue crasheando en el
    // mismo punto aun recreando el elemento, así que además de recrearlo se
    // difiere el decode: con preload="none" el navegador no baja/decodifica
    // nada hasta que se pide reproducir de verdad. Eso pasa recién en el
    // segundo tap del splash (confirmStep 0→1, más abajo en este archivo,
    // `howtoVideo.play()`) — un momento bien separado del burst síncrono de
    // la transición de modo, no en el medio de él.
  } catch (e) {}
};

// Resetea el estado del splash al ENTRAR a un modo (antes de mostrarlo). Necesario
// porque al terminar una campaña (results/final) confirmStep queda en 1 y la mesa del
// howtoplay en slide-down; sin esto, la siguiente partida saltea el step2 (confirm va
// directo a jugar) y la mesa "sube" visiblemente. Se llama con el splash aún oculto
// (display:none), así quitar slide-down no dispara la animación de transición.
window.resetSplashEntry = function () {
  try { confirmStep = 0; } catch (e) {}
  const w = document.querySelector('.splash-howtoplay-wrap');
  if (w) w.classList.remove('slide-down');
  const l = document.querySelector('.splash-text2-label');
  if (l) l.classList.remove('step2');
  // Ocultar cualquier HUD ingame que haya quedado visible de una partida previa
  // (sobre todo el panel de amigos/leaderboard tras un Versus o lobby): si no se
  // oculta acá, se filtra encima del splash/pre y no desaparece. Ver bug barra de amigos.
  if (typeof window.hideIngameHud === 'function') window.hideIngameHud();
};

// Oculta TODO el HUD de juego (puntaje, countdown, panel de amigos/leaderboard de
// ambos sets de modos). Reutilizable desde la entrada al splash y los teardown de VS.
window.hideIngameHud = function () {
  ['right-panel','flags-right-panel','score-display','flags-score-display',
   'countdown-widget','flags-countdown-widget','shapes-countdown-widget',
   'speed-bonus-text','flags-speed-bonus-text'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
};

// Fuerza al compositor a presentar un frame nuevo del stage escalado. En Opera
// (Chromium) la pantalla puede CONGELARSE al iniciar la cuenta regresiva: el hilo
// principal sigue vivo pero el compositor deja de presentar hasta que el usuario
// mueve la ventana. Re-aplicar el transform con un translateZ(0) (idéntico
// visualmente) commitea una nueva capa GPU y desbloquea el render, sin tener que
// mover la ventana. Inofensivo en Chrome/Edge/Firefox.
window.nudgeRepaint = function () {
  const root = document.documentElement;
  // Toggla --app-nudge (translateZ imperceptible en el transform del stage):
  // commitea una capa GPU nueva y desbloquea el render congelado de Opera, sin
  // pisar el centrado/escala que maneja letterbox.js.
  root.style.setProperty('--app-nudge', '0.01px');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { root.style.setProperty('--app-nudge', '0px'); });
  });
};

const _iosMusicURL = new Map([
  [sfxGameMusic, 'sfx/gamemusic.mp3'],
  [sfxPostgame,  'sfx/postgameloop.mp3'],
  [sfxPregame,   'sfx/pregameloop.mp3'],
  [sfxMenuMusic, 'sfx/menuloop.mp3'],
]);
let _iosCtx    = null;
const _iosBufs = new Map();   // url -> AudioBuffer
let _iosGain   = null;
let _iosNode   = null;        // AudioBufferSourceNode sonando
let _iosToken  = null;        // track (HTMLAudio) que representa lo que suena
let _iosWanted = null;        // último track pedido (decode es async)

function iosCtx() {
  if (_iosCtx) return _iosCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    _iosCtx = new AC();
    _iosGain = _iosCtx.createGain();
    _iosGain.connect(_iosCtx.destination);
  } catch (e) { _iosCtx = null; }
  return _iosCtx;
}

function iosMusicMuted() {
  return (typeof isMuted !== 'undefined') ? isMuted : (localStorage.getItem('muted') === 'true');
}

function applyMusicMute() {
  if (_iosGain) _iosGain.gain.value = iosMusicMuted() ? 0 : 1;
}

function iosLoadBuf(url) {
  const ctx = iosCtx();
  if (!ctx) return Promise.reject();
  if (_iosBufs.has(url)) return Promise.resolve(_iosBufs.get(url));
  return fetch(url)
    .then(r => r.arrayBuffer())
    .then(ab => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
    .then(buf => { _iosBufs.set(url, buf); return buf; });
}

function iosStopMusic() {
  if (_iosNode) {
    try { _iosNode.stop(); } catch (e) {}
    try { _iosNode.disconnect(); } catch (e) {}
    _iosNode = null;
  }
  _iosToken = null;
}

function iosStartMusic(token, buf) {
  const ctx = iosCtx();
  if (!ctx) return;
  iosStopMusic();
  const node = ctx.createBufferSource();
  node.buffer = buf;
  node.loop = true;
  node.connect(_iosGain);
  applyMusicMute();
  node.start(0);
  _iosNode = node;
  _iosToken = token;
}

function playMusicIOS(track) {
  const ctx = iosCtx();
  if (!ctx || (track && !_iosMusicURL.has(track))) {
    // sin Web Audio o track desconocido: caer al <audio> de siempre
    iosStopMusic();
    return playMusicHTML(track);
  }
  _iosWanted = track;
  // que ningún <audio> de música suene en paralelo al motor
  [sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic].forEach(t => t.pause());
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  if (!track) { iosStopMusic(); return; }                       // corte inmediato
  if (_iosToken === track && _iosNode) { applyMusicMute(); return; } // ya suena: no reiniciar

  iosLoadBuf(_iosMusicURL.get(track)).then(buf => {
    if (_iosWanted !== track) return;
    if (_iosToken === track && _iosNode) return;
    iosStartMusic(track, buf);
  }).catch(() => playMusicHTML(track));
}

// Desbloqueo en iOS: reanudar el contexto y precargar/decodificar los loops en el
// primer gesto, para que el primer playMusic sea instantáneo y no se quede mudo.
if (IS_IOS) {
  const iosUnlock = () => {
    const ctx = iosCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    _iosMusicURL.forEach((url) => iosLoadBuf(url).catch(() => {}));
  };
  ['touchend', 'pointerdown', 'click'].forEach(ev =>
    document.addEventListener(ev, iosUnlock, { once: true, passive: true })
  );
}

document.getElementById('loading-play-btn').addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

// Toast global: visible desde cualquier pantalla (position:fixed en body)
window.showGlobalToast = function(msg) {
  const item = document.createElement('div');
  item.className = 'global-toast-item';
  item.textContent = msg;
  document.body.appendChild(item);
  requestAnimationFrame(() => requestAnimationFrame(() => { item.style.opacity = '1'; }));
  setTimeout(() => {
    item.style.opacity = '0';
    setTimeout(() => { try { item.remove(); } catch (e) {} }, 280);
  }, 3200);
};

// Helper global: actualiza is_playing en Supabase si hay sesión activa
window._setPlaying = function(playing) {
  window._isPlaying = !!playing;
  const isPracticing = !!(window.practiceConfig && window.practiceConfig.active);
  if (window._sbUserId) window.sbSetPlaying(window._sbUserId, playing, playing && isPracticing).catch(() => {});
  if (playing) {
    window._scoresUploadedThisGame = false;
    window._gameSessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    // Diferido a un microtask: quien nos llamó (vs.js/lobby.js) recién termina de
    // setear _vsActive/_lobbyActive unas líneas después de llamar _setPlaying(true)
    // en la MISMA función síncrona — si decidiéramos acá mismo, siempre veríamos
    // esos flags todavía en false y abriríamos un canal de espectador "solo" aunque
    // en realidad sea versus/lobby. Tampoco tiene sentido abrir el canal en modo
    // práctica: no hay ojo para clickear (is_practicing lo oculta) y la sesión
    // no es una partida "real" para mostrarle a nadie.
    Promise.resolve().then(() => {
      if (window._isPlaying && !window._vsActive && !window._lobbyActive && !isPracticing && typeof window.SoloSpectate !== 'undefined') {
        window.SoloSpectate.start();
      }
    });
  } else {
    if (typeof window.SoloSpectate !== 'undefined') window.SoloSpectate.stop();
    // Al volver de una partida, entregar invitaciones que llegaron mientras jugaba
    if (typeof window.flushQueuedInvite === 'function') window.flushQueuedInvite();
  }
};

document.getElementById('loading-play-btn').addEventListener('click', () => {
  window._autoDismissVsInvites?.();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  window._setPlaying(true);
  window.pendingGameMode = 'game';
  // Avisar a un posible espectador que entramos a las instrucciones de este
  // modo — ver comentario largo (con la explicación del defer a microtask)
  // en el mismo punto de flags.js. Cities todavía no tiene UI real de
  // espectador (REAL_UI_MODES no lo lista), así que esto solo evita que se
  // quede viendo la pantalla de "Conectando..." trabada — no podrá ver la
  // ronda en sí hasta que se integre ese modo.
  Promise.resolve().then(() => {
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: 'game' });
  });
  window.resetSplashEntry?.();
  // Transición visual inmediata — ocultar loading y mostrar splash en este frame
  document.getElementById('loading-screen').style.display = 'none';
  const splashElCity = document.getElementById('splash-screen');
  splashElCity.style.display = 'flex';
  window.showSplashConfirm();
  const animElsCity = splashElCity.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animElsCity.forEach(el => el.classList.remove('animate-in'));
  void splashElCity.offsetWidth;
  animElsCity.forEach(el => el.classList.add('animate-in'));
  playMusic(sfxPregame);
  // Setup no visual diferido al siguiente frame para no bloquear la transición
  requestAnimationFrame(() => {
    document.getElementById('splash-screen').classList.remove('mode-flags', 'mode-shapes', 'mode-monuments');
    document.getElementById('gameover-screen').classList.remove('mode-flags', 'mode-shapes', 'mode-monuments');
    document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
    document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
    document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
    document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
    document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women1.png');
    document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women1.png');
    document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level3complete.png');
    document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check3.png');
    document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong3.png');
    window.swapHowtoVideo('images/howtoplay/howtoplay3.mp4');
    const howtoTitleCity = document.querySelector('.splash-howtoplay-title');
    if (howtoTitleCity) howtoTitleCity.textContent = 'City Blitz';
    const label = document.querySelector('.splash-text2-label');
    { const _pk = (window.practiceConfig && window.practiceConfig.active) ? 'splash.practice.cities.1' : 'splash.cities.1'; if (label) { label.textContent = t(_pk); label.classList.remove('step2'); } }
  });
});

// ── PRELOAD PROACTIVO PARA TRANSICIONES DE CAMPAÑA ───────────────────────────
// Se llama al mostrar el gameover del modo N para que los assets del modo N+1
// lleguen al caché HTTP antes de que el usuario haga click en Confirm.
window.preloadNextModeAssets = function (nextMode) {
  const assetMap = {
    shapes: [
      'images/howtoplay/howtoplay2.mp4',
      'images/bg/level2complete.png',
      'images/check2.png',
      'images/wrong2.png',
    ],
    game: [
      'images/howtoplay/howtoplay3.mp4',
      'images/bg/level3complete.png',
      'images/check3.png',
      'images/wrong3.png',
    ],
    monuments: [
      'images/howtoplay/howtoplay4.mp4',
      'images/bg/level4complete.png',
      'images/bg/level4complete2.png',
      'images/check4.png',
      'images/wrong4.png',
    ],
  };
  const list = assetMap[nextMode];
  if (!list) return Promise.resolve();
  // Videos excluidos del preload proactivo: son demasiado pesados para tener
  // en RAM mientras el modo anterior todavía no liberó su memoria → OOM en iOS.
  const images = list.filter(url => !url.endsWith('.mp4'));
  if (!images.length) return Promise.resolve();
  // En mobile: fetch() para calentar el HTTP cache sin decodificar el bitmap en RAM.
  // Así no se acumula memoria decodificada mientras el modo anterior todavía no liberó la suya.
  // En PC: new Image() para decodificar proactivamente (más rápido al renderizar).
  if (IS_MOBILE) {
    return Promise.all(
      images.map(url => fetch(url, { cache: 'force-cache' }).catch(() => {}))
    ).then(() => {});
  }
  return new Promise(resolve => {
    let done = 0;
    images.forEach(url => {
      const img = new Image();
      img.onload = img.onerror = () => { if (++done === images.length) resolve(); };
      img.src = url;
    });
  });
};

// ── CAMPAÑA: 4 modos encadenados ─────────────────────────────────────────────
window.campaign = {
  active: false,
  idx: 0,
  base: 0,
  btns:  ['loading-flags-btn', 'loading-shapes-btn', 'loading-play-btn', 'loading-mode4-btn'],
  modes: ['flags', 'shapes', 'game', 'monuments'],
  scores: {},
  // Highscores por-modo conseguidos DURANTE una campaña en curso: se guardan acá
  // en lugar de en localStorage hasta que la Vuelta Mundial se completa entera.
  // Si se abandona a mitad de camino, se descartan (ver quitToMenu) y el
  // highscore persistido no cambia.
  pendingHS: {},
};
// puntaje acumulado de rondas anteriores (0 si no hay campaña activa)
window.campaignBase = function () {
  return (window.campaign && window.campaign.active) ? (window.campaign.base || 0) : 0;
};
// Confirma en localStorage los highscores por-modo que se lograron durante la
// campaña recién completada. Solo se llama cuando se terminaron los 4 modos.
window._commitCampaignHighscores = function () {
  const pending = window.campaign && window.campaign.pendingHS;
  if (!pending) return;
  const LS_KEYS = { flags: 'flagsHighscore', shapes: 'shapesHighscore', game: 'geochallenge_highscore', monuments: 'monumentsHighscore' };
  Object.keys(pending).forEach(mode => {
    const key = LS_KEYS[mode];
    if (!key) return;
    const prev = parseInt(localStorage.getItem(key) || '0', 10);
    if (pending[mode] > prev) {
      localStorage.setItem(key, String(pending[mode]));
      if (mode === 'game' && typeof highscore !== 'undefined') {
        highscore = pending[mode];
        const hsEl = document.getElementById('highscore-value');
        if (hsEl) hsEl.textContent = highscore.toLocaleString();
        if (typeof updateSplashHighscore === 'function') updateSplashHighscore();
      }
      if (mode === 'monuments' && typeof monumentsHighscore !== 'undefined') {
        monumentsHighscore = pending[mode];
      }
    }
  });
  window.campaign.pendingHS = {};
};

document.getElementById('loading-results-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('loading-screen').style.display = 'none';
  if (typeof showResultsScreen === 'function') showResultsScreen();
});

document.getElementById('loading-play-single')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  [
    document.getElementById('loading-actions'),
    document.getElementById('loading-version'),
    document.querySelector('.loading-plane-wrap'),
    document.getElementById('profile-account-btn'),
    document.getElementById('globequiz-btn'),
  ].forEach(el => { if (el) el.style.display = 'none'; });
  const lg = document.querySelector('.loading-logo');
  if (lg) {
    lg.getAnimations().forEach(a => a.cancel());
    lg.classList.add('logo-ready', 'panel2-logo');
  }
  const back = document.getElementById('loading-panel2-back');
  if (back) back.style.display = 'block';
  const wt = document.getElementById('loading-panel2-worldtour');
  if (wt) wt.style.display = 'block';
  const vs = document.getElementById('loading-panel2-versus');
  if (vs) vs.style.display = 'block';
  const pr = document.getElementById('loading-panel2-practice');
  if (pr) pr.style.display = 'block';
  const t2 = document.getElementById('loading-panel2-text2');
  if (t2) t2.style.display = 'block';
});

document.getElementById('globequiz-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  // Gate: GlobeQuiz requiere cuenta, y con cuenta requiere haber completado
  // al menos 1 Gira Mundial alguna vez (ver el incremento de
  // campaigns_completed al terminar la campaña, más arriba en este archivo).
  if (!window._accountLoggedIn || !window._sbUserId) {
    const textEl = document.getElementById('globequiz-locked-text');
    if (textEl) { textEl.setAttribute('data-i18n', 'globequiz.lockedNoAccount'); textEl.textContent = t('globequiz.lockedNoAccount'); }
    const popup = document.getElementById('globequiz-locked-popup');
    if (popup) popup.style.display = 'flex';
    return;
  }
  if (!((window._sbProfile && window._sbProfile.campaigns_completed) || 0)) {
    const textEl = document.getElementById('globequiz-locked-text');
    if (textEl) { textEl.setAttribute('data-i18n', 'globequiz.lockedNoCampaign'); textEl.textContent = t('globequiz.lockedNoCampaign'); }
    const popup = document.getElementById('globequiz-locked-popup');
    if (popup) popup.style.display = 'flex';
    return;
  }
  if (typeof window.preloadGlobeQuiz === 'function') window.preloadGlobeQuiz();
  [
    document.getElementById('loading-actions'),
    document.getElementById('loading-version'),
    document.querySelector('.loading-plane-wrap'),
    document.getElementById('profile-account-btn'),
    document.getElementById('globequiz-btn'),
  ].forEach(el => { if (el) el.style.display = 'none'; });
  const lg = document.querySelector('.loading-logo');
  if (lg) {
    lg.getAnimations().forEach(a => a.cancel());
    lg.classList.add('logo-ready', 'panel2-logo');
  }
  const back = document.getElementById('loading-panel2-back');
  if (back) back.style.display = 'block';
  const t2 = document.getElementById('loading-globequiz-text2');
  if (t2) t2.style.display = 'block';
  const gqTable = document.getElementById('loading-globequiz-table');
  if (gqTable) gqTable.style.display = 'block';
  const gqTitle = document.getElementById('loading-globequiz-title');
  if (gqTitle) gqTitle.style.display = 'block';
  const gqGlobe = document.getElementById('loading-globequiz-globe');
  if (gqGlobe) gqGlobe.style.display = 'block';
  const gqDesc = document.getElementById('loading-globequiz-desc');
  if (gqDesc) gqDesc.style.display = 'block';
  const gqPlay = document.getElementById('loading-globequiz-play-wrap');
  if (gqPlay) gqPlay.style.display = 'block';
});

document.getElementById('globequiz-locked-ok')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  const popup = document.getElementById('globequiz-locked-popup');
  if (popup) popup.style.display = 'none';
});

document.getElementById('loading-globequiz-play-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('loading-screen').style.display = 'none';
  const gqScreen = document.getElementById('globequiz-screen');
  if (gqScreen) gqScreen.style.display = 'block';
  if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
  if (typeof window.initGlobeQuiz === 'function') window.initGlobeQuiz();
});

document.getElementById('gq-power-btn')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  const popup = document.getElementById('gq-quit-popup');
  if (popup) popup.style.display = 'flex';
});

document.getElementById('gq-quit-cancel')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  const popup = document.getElementById('gq-quit-popup');
  if (popup) popup.style.display = 'none';
});

document.getElementById('gq-quit-confirm')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  window._isPlaying = false;
  if (window._sbUserId) window.sbSetPlaying(window._sbUserId, false).catch(() => {});
  // Cortar TODO lo de GlobeQuiz (timer, rotación automática, música/sfx) —
  // mismo criterio que quitToMenu() para los demás modos.
  if (typeof window.stopGlobeQuizTimer === 'function') window.stopGlobeQuizTimer();
  if (typeof window.stopGlobeQuizAutoRotate === 'function') window.stopGlobeQuizAutoRotate();
  if (typeof window.stopGlobeQuizInertia === 'function') window.stopGlobeQuizInertia();
  if (typeof window.stopGlobeQuizCountdown === 'function') window.stopGlobeQuizCountdown();
  if (typeof window.stopGlobeQuizEndgameTimer === 'function') window.stopGlobeQuizEndgameTimer();
  const gqEndgameModalEl = document.getElementById('gq-endgame-modal');
  if (gqEndgameModalEl) gqEndgameModalEl.style.display = 'none';
  // playMusic(null) corta también el AudioBufferSourceNode de iOS (Web Audio),
  // que sigue sonando si solo se pausa el <audio> HTML — mismo motivo que en
  // el submitGuess() de globequiz.js. sfxBonus es un sfx normal, no música,
  // así que a ese sí alcanza con pausarlo directo.
  if (typeof playMusic === 'function') playMusic(null);
  try { if (sfxBonus) { sfxBonus.pause(); sfxBonus.currentTime = 0; } } catch (e) {}
  const popup = document.getElementById('gq-quit-popup');
  if (popup) popup.style.display = 'none';
  const gqScreen = document.getElementById('globequiz-screen');
  if (gqScreen) gqScreen.style.display = 'none';
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen')?.classList.remove('table-shown');
  // Ocultar el panel de GlobeQuiz del menú (texto/mesa/título/globo/desc/
  // jugar) — sin esto quedaba mostrándose ENCIMA del menú principal al
  // volver, porque resetEntranceElements()/replayEntranceAnimations() no
  // conocen estos elementos (son específicos de este panel, ver el handler
  // de loading-panel2-back más abajo, que hace lo mismo para ese caso).
  ['loading-globequiz-text2', 'loading-globequiz-table', 'loading-globequiz-title',
   'loading-globequiz-globe', 'loading-globequiz-desc', 'loading-globequiz-play-wrap']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  // Volver al MENÚ PRINCIPAL (panel1) con la MISMA animación de entrada que
  // usa quitToMenu() en el resto de los modos, no un salto abrupto.
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  // Y la música vuelve al loop del menú, como corresponde.
  if (typeof window.startMenuMusic === 'function') window.startMenuMusic();
  else if (typeof playMusic === 'function') playMusic(sfxMenuMusic);
});

document.getElementById('loading-panel2-back')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('loading-panel2-back').style.display = 'none';
  const wt = document.getElementById('loading-panel2-worldtour');
  if (wt) wt.style.display = 'none';
  const vsb = document.getElementById('loading-panel2-versus');
  if (vsb) vsb.style.display = 'none';
  const prb = document.getElementById('loading-panel2-practice');
  if (prb) prb.style.display = 'none';
  const t2b = document.getElementById('loading-panel2-text2');
  if (t2b) t2b.style.display = 'none';
  const gqt2b = document.getElementById('loading-globequiz-text2');
  if (gqt2b) gqt2b.style.display = 'none';
  const gqTableB = document.getElementById('loading-globequiz-table');
  if (gqTableB) gqTableB.style.display = 'none';
  const gqTitleB = document.getElementById('loading-globequiz-title');
  if (gqTitleB) gqTitleB.style.display = 'none';
  const gqGlobeB = document.getElementById('loading-globequiz-globe');
  if (gqGlobeB) gqGlobeB.style.display = 'none';
  const gqDescB = document.getElementById('loading-globequiz-desc');
  if (gqDescB) gqDescB.style.display = 'none';
  const gqPlayB = document.getElementById('loading-globequiz-play-wrap');
  if (gqPlayB) gqPlayB.style.display = 'none';
  const lgBack = document.querySelector('.loading-logo');
  if (lgBack) {
    lgBack.style.transition = 'none';
    lgBack.classList.remove('panel2-logo');
    requestAnimationFrame(() => { lgBack.style.transition = ''; });
  }
  const actions = document.getElementById('loading-actions');
  if (actions) actions.style.display = 'flex';
  const ver = document.getElementById('loading-version');
  if (ver) ver.style.display = '';
  const acct = document.getElementById('profile-account-btn');
  if (acct) acct.style.display = 'block';
  const gq = document.getElementById('globequiz-btn');
  if (gq) gq.style.display = 'block';
  const pw = document.querySelector('.loading-plane-wrap');
  if (pw) { pw.style.display = ''; pw.style.opacity = '1'; pw.style.transform = 'translate(-50%,-50%) translateY(0)'; pw.classList.add('plane-above'); }
  const lg = document.querySelector('.loading-logo');
  if (lg) { lg.style.display = ''; lg.style.opacity = '1'; lg.style.transform = 'translateX(-50%) scale(1)'; }
});

document.getElementById('loading-panel2-worldtour')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (window._lobbyCountingDown) {
    window.showGlobalToast(t('lobby.cdBlocked'));
    return;
  }
  window.startCampaign();
});

window.startCampaign = function () {
  window.campaign.active = true;
  window.campaign.idx = 0;
  window.campaign.base = 0;
  window.campaign.scores = {};
  window.campaign.pendingHS = {};
  window.lastModeScore = 0;
  document.getElementById('loading-flags-btn').click();
};

// ── MODAL CUENTA ─────────────────────────────────────────────────────────────
(function () {
  const btn   = document.getElementById('profile-account-btn');
  const modal = document.getElementById('account-modal');
  const close = document.getElementById('account-modal-close');
  const login = document.getElementById('account-modal-login');
  const reg   = document.getElementById('account-modal-register');
  if (!modal) return;

  const viewMain           = document.getElementById('account-view-main');
  const viewLogin          = document.getElementById('account-view-login');
  const viewRegister       = document.getElementById('account-view-register');
  const viewLoading        = document.getElementById('account-view-loading');
  const viewVerify         = document.getElementById('account-view-verify');
  const viewWelcome        = document.getElementById('account-view-welcome');
  const viewLoggedIn       = document.getElementById('account-view-loggedin');
  const viewChangePass     = document.getElementById('account-view-change-pass');
  const viewChangePassOk   = document.getElementById('account-view-change-pass-ok');
  const viewChangeEmail    = document.getElementById('account-view-change-email');
  const viewChangeEmailSent  = document.getElementById('account-view-change-email-sent');
  const viewLogoutConfirm    = document.getElementById('account-view-logout-confirm');
  const viewForgot           = document.getElementById('account-view-forgot');
  const viewForgotSent       = document.getElementById('account-view-forgot-sent');

  const allViews = [viewMain, viewLogin, viewRegister, viewLoading, viewVerify, viewWelcome,
                    viewLoggedIn, viewChangePass, viewChangePassOk, viewChangeEmail, viewChangeEmailSent, viewLogoutConfirm,
                    viewForgot, viewForgotSent];

  const box = modal.querySelector('.account-modal-box');
  let currentView = null;

  const noCloseViews = new Set([viewLoading, viewWelcome, viewChangeEmailSent, viewForgotSent]);
  // backMap: X button goes to parent view; null = close modal
  const backMap = new Map([
    [viewMain,            null],
    [viewLoggedIn,        null],
    [viewLogin,           viewMain],
    [viewRegister,        viewMain],
    [viewChangePass,      viewLoggedIn],
    [viewChangePassOk,    viewLoggedIn],
    [viewChangeEmail,     viewLoggedIn],
    [viewLogoutConfirm,   viewLoggedIn],
    [viewForgot,          viewLogin],
  ]);

  function showView(v) {
    allViews.forEach(el => { if (el) el.style.display = 'none'; });
    if (v) v.style.display = 'flex';
    currentView = v;
    if (box) {
      box.classList.toggle('hide-close', noCloseViews.has(v));
      box.style.animation = 'none'; box.offsetWidth; box.style.animation = '';
    }
  }
  function isLoggedIn() {
    return !!(window._accountLoggedIn || document.body.classList.contains('account-logged'));
  }
  function openModal() {
    if (isLoggedIn()) {
      const nameEl = document.getElementById('account-linked-name');
      if (nameEl) nameEl.textContent = (window._sbProfile?.username) || localStorage.getItem('playerName') || '';
      showView(viewLoggedIn || document.getElementById('account-view-loggedin'));
    } else {
      showView(viewMain);
    }
    modal.classList.add('open');
  }
  function closeModal() { modal.classList.remove('open'); }

  // Expuesto para que el name-prompt abra el modal directamente en login o register
  window.openAccountModal = function (startView) {
    if (startView === 'login')    { showView(viewLogin);    modal.classList.add('open'); return; }
    if (startView === 'register') { showView(viewRegister); modal.classList.add('open'); return; }
    openModal();
  };

  if (!btn) return;
  btn.addEventListener('click', () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); openModal(); });
  close.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const back = backMap.get(currentView);
    if (back === undefined || back === null) closeModal();
    else showView(back);
  });

  login?.addEventListener('click', () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); showView(viewLogin); });
  reg?.addEventListener('click',   () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); showView(viewRegister); });

  document.getElementById('reg-verify-ok')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLogin);
  });

  document.getElementById('login-forgot-btn')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const userEl = document.getElementById('forgot-user');
    if (userEl) userEl.value = document.getElementById('login-user')?.value || '';
    const errEl = document.getElementById('forgot-err-user');
    if (errEl) errEl.textContent = '';
    showView(viewForgot);
  });

  document.getElementById('forgot-back')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLogin);
  });

  document.getElementById('forgot-submit')?.addEventListener('click', async () => {
    const userEl = document.getElementById('forgot-user');
    const errEl  = document.getElementById('forgot-err-user');
    const username = userEl?.value.trim() || '';
    if (!username) { if (errEl) errEl.textContent = t('account.errLoginUser') || 'Ingresa tu usuario.'; return; }
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLoading);
    try {
      const { data: profile, error } = await window.sb.from('profiles').select('email').eq('username', username).single();
      if (error || !profile?.email) {
        showView(viewForgot);
        if (errEl) errEl.textContent = t('account.errUserNotFound') || 'Este usuario no existe.';
        return;
      }
      await window.sbResetPassword(profile.email);
      showView(viewForgotSent);
    } catch(e) {
      showView(viewForgot);
      if (errEl) errEl.textContent = (e.message && e.message !== '{}') ? e.message : 'Error al enviar el correo.';
    }
  });

  document.getElementById('forgot-sent-ok')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLogin);
  });

  document.getElementById('login-welcome-ok')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    closeModal();
    // Login manual (no restauración de sesión al recargar, esa pasa por
    // _onSessionReady): si la cuenta ya calificaba de antes (founder con al
    // menos 1 Vuelta Mundial COMPLETA jugada — campaigns_completed, GlobeQuiz
    // no cuenta), se la mostramos apenas cierra este modal y pisa el menú —
    // mismo criterio que _onSessionReady.
    const p = window._sbProfile;
    if (p && p.is_founder && !p.founder_popup_seen && (p.campaigns_completed || 0) > 0) {
      setTimeout(() => { if (typeof window.showFounderWelcomePopup === 'function') window.showFounderWelcomePopup(); }, 500);
    }
  });

  ['login-user','login-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-submit')?.click();
    });
  });
  document.getElementById('login-submit')?.addEventListener('click', () => {
    const userEl  = document.getElementById('login-user');
    const passEl  = document.getElementById('login-pass');
    const errU    = document.getElementById('login-err-user');
    const errP    = document.getElementById('login-err-pass');

    let ok = true;
    const setErr = (input, el, msg) => {
      el.textContent = msg;
      input.classList.toggle('input-error', !!msg);
      if (msg) ok = false;
    };

    const uVal = userEl.value.trim();
    if (!uVal) {
      setErr(userEl, errU, t('account.errLoginUser'));
    } else if (!/^[a-zA-Z0-9]{4,12}$/.test(uVal)) {
      setErr(userEl, errU, t('account.errLoginUserInvalid'));
    } else {
      setErr(userEl, errU, '');
    }

    const pVal = passEl.value;
    if (pVal.length < 6) setErr(passEl, errP, t('account.errPassShort'));
    else setErr(passEl, errP, '');

    if (ok) {
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      showView(viewLoading);
      (typeof window.withConnTimeout === 'function' ? window.withConnTimeout(window.sbLogin(uVal, pVal), 6000) : window.sbLogin(uVal, pVal))
        .then(async data => {
          if (!data) { showView(viewLogin); return; } // timeout: ya se mostró la viñeta de error de conexión
          window._accountLoggedIn = true;
          window._sbUserId = data.user.id;
          document.body.classList.add('account-logged');
          if (typeof window.sbClaimAnonymousEvents === 'function') window.sbClaimAnonymousEvents();
          try {
            await syncLocalDataToAccount(data.user.id);
            const profile = await window.sbGetProfile(data.user.id);
            window._sbProfile = profile;
            if (profile.username) localStorage.setItem('playerName', profile.username);
            if (profile.avatar_url) {
              localStorage.setItem('profilePhoto', profile.avatar_url);
              applyStoredProfilePic();
            }
            syncHsFromProfile(profile);   // hs locales ← max(local, supabase)
            clearLocalScores();           // solo avgs/playcount → 0
            if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
            if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
            _ensureCountryCode(profile);
            if (typeof _updateProfileBtnLabel === 'function') _updateProfileBtnLabel();
            if (typeof loadFriends === 'function') loadFriends();
            if (typeof window.sbUpdateLastActive === 'function') window.sbUpdateLastActive(data.user.id).catch(() => {});
            // Escuchar invitaciones versus en tiempo real
            // Session guard DESACTIVADO (ver mismo comentario en sb.js) — la
            // cuenta debe poder usarse en varios dispositivos a la vez.
            if (typeof window._vsStartListening === 'function') window._vsStartListening();
            if (window.LB && typeof window.LB.listenForInvites === 'function') {
              window.LB.listenForInvites(p => { if (typeof window.showLobbyIncomingInvite === 'function') window.showLobbyIncomingInvite(p); });
            }
            setTimeout(() => { if (typeof window.refreshVersusBell === 'function') window.refreshVersusBell(); }, 600);
            // Heartbeat: actualiza last_active cada 45s mientras el usuario esté logueado
            clearInterval(window._presenceHeartbeat);
            window._presenceHeartbeat = setInterval(() => {
              if (window._sbUserId && typeof window.sbUpdateLastActive === 'function')
                window.sbUpdateLastActive(window._sbUserId).catch(() => {});
            }, 45000);
            const displayName = profile.username || uVal;
            const nameEl   = document.getElementById('account-welcome-name');
            const prefixEl = document.getElementById('account-welcome-prefix');
            const descEl   = document.getElementById('account-welcome-desc');
            if (prefixEl) prefixEl.textContent = t('account.welcomePrefix');
            if (nameEl)   nameEl.textContent   = displayName;
            if (descEl)   descEl.innerHTML     = t('account.welcomeDesc');
          } catch(e) {}
          showView(viewWelcome);
        })
        .catch(err => {
          showView(viewLogin);
          const errU = document.getElementById('login-err-user');
          const errP = document.getElementById('login-err-pass');
          const userEl = document.getElementById('login-user');
          const passEl = document.getElementById('login-pass');
          if (err.message === '__user_not_found__') {
            if (errU) errU.textContent = t('account.errUserNotFound');
            if (userEl) userEl.classList.add('input-error');
          } else {
            if (errP) errP.textContent = t('account.errWrongPass');
            if (passEl) passEl.classList.add('input-error');
          }
        });
    }
  });

  // Contraseña == usuario + variación trivial (ej. "mateo" / "Mateo01") no
  // debería pasar de "débil" nunca, por más que sume puntos de largo/dígitos/
  // mayúsculas — el username es de por sí público (aparece en Rankings,
  // Amigos, etc.), así que agregarle un sufijo simple no suma seguridad
  // real. Basta con que la contraseña CONTENGA el usuario completo
  // (normalizando mayúsculas) para considerarla insegura; variaciones que no
  // incluyan el usuario entero (anagramas, palabras distintas, etc.) no caen
  // en esta regla. Usuario de 1-2 caracteres no cuenta (demasiado corto para
  // que "contenerlo" signifique algo).
  function _passContainsUsername(pass, username) {
    if (!pass || !username || username.length < 3) return false;
    return pass.toLowerCase().includes(username.toLowerCase());
  }

  document.getElementById('reg-pass')?.addEventListener('input', function () {
    const wrap  = document.getElementById('pass-strength-wrap');
    const fill  = document.getElementById('pass-strength-fill');
    const label = document.getElementById('pass-strength-label');
    const v = this.value;
    if (!v) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    let score = 0;
    if (v.length >= 8)  score++;
    if (v.length >= 12) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^a-zA-Z0-9]/.test(v)) score++;
    // Penalizar contraseñas comunes, repeticiones y secuencias
    const commonPasswords = ['123456','1234567','12345678','123456789','password','contraseña','111111','000000','qwerty','abc123','654321','987654','112233','123123','aaaaaa','888888','666666','999999','pass123'];
    const isCommon    = commonPasswords.includes(v.toLowerCase());
    const isRepeating = /^(.)\1+$/.test(v);
    const isSequential = /^(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(v);
    const usernameEl = document.getElementById('reg-username');
    const hasUsername = _passContainsUsername(v, usernameEl ? usernameEl.value.trim() : '');
    if (isCommon || isRepeating || isSequential || hasUsername) score = 0;
    if (score <= 1)      { fill.style.width = '33%';  fill.style.background = '#e74c3c'; label.style.color = '#e74c3c'; label.textContent = t('account.passWeak'); }
    else if (score <= 3) { fill.style.width = '66%';  fill.style.background = '#f39c12'; label.style.color = '#c87800'; label.textContent = t('account.passMedium'); }
    else                 { fill.style.width = '100%'; fill.style.background = '#2bd14b'; label.style.color = '#1a7a30'; label.textContent = t('account.passStrong'); }
  });
  // Si el usuario termina de escribir el username DESPUÉS de la contraseña,
  // el meter quedó calculado con el username viejo (vacío) — reevaluar la
  // contraseña también cuando cambia el usuario.
  document.getElementById('reg-username')?.addEventListener('input', () => {
    document.getElementById('reg-pass')?.dispatchEvent(new Event('input'));
  });

  document.getElementById('reg-submit')?.addEventListener('click', () => {
    const username = document.getElementById('reg-username');
    const email    = document.getElementById('reg-email');
    const pass     = document.getElementById('reg-pass');
    const pass2    = document.getElementById('reg-pass2');
    const errU  = document.getElementById('reg-err-username');
    const errE  = document.getElementById('reg-err-email');
    const errP  = document.getElementById('reg-err-pass');
    const errP2 = document.getElementById('reg-err-pass2');

    let ok = true;
    const setErr = (input, el, msg) => {
      el.textContent = msg;
      input.classList.toggle('input-error', !!msg);
      if (msg) ok = false;
    };

    const uVal = username.value.trim();
    if (uVal.length < 4 || uVal.length > 12)
      setErr(username, errU, t('account.errUserChars'));
    else if (!/^[a-zA-Z0-9]+$/.test(uVal))
      setErr(username, errU, t('account.errUserInvalid'));
    else setErr(username, errU, '');

    const eVal = email.value.trim();
    if (!/^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.(com|net|edu|org|io|co|es|mx|ar|uk|de|fr|br|ca|jp|au)(\.[a-z]{2})?$/i.test(eVal))
      setErr(email, errE, t('account.errEmailInvalid'));
    else setErr(email, errE, '');

    const pVal = pass.value;
    if (pVal.length < 6)
      setErr(pass, errP, t('account.errPassShort'));
    else if (_passContainsUsername(pVal, uVal))
      setErr(pass, errP, t('account.errPassContainsUser'));
    else setErr(pass, errP, '');

    const p2Val = pass2.value;
    if (p2Val !== pVal)
      setErr(pass2, errP2, t('account.errPassMismatch'));
    else setErr(pass2, errP2, '');

    if (ok) {
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      showView(viewLoading);
      const _regPromise = window.sbRegister(
        document.getElementById('reg-username').value.trim(),
        document.getElementById('reg-email').value.trim(),
        document.getElementById('reg-pass').value
      );
      (typeof window.withConnTimeout === 'function' ? window.withConnTimeout(_regPromise, 6000) : _regPromise)
       .then(result => { if (result) showView(viewVerify); else showView(viewRegister); }) // undefined = timeout, viñeta ya mostrada
       .catch(err => {
         showView(viewRegister);
         const errU = document.getElementById('reg-err-username');
         if (errU) errU.textContent = err.message;
       });
    }
  });

  // ── Vista logueado: botones de acción ──────────────────────────────────────
  document.getElementById('account-go-change-pass')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    ['chpass-current','chpass-new','chpass-confirm'].forEach(id => { const el = document.getElementById(id); if (el) { el.value = ''; el.classList.remove('input-error'); } });
    const wrap = document.getElementById('chpass-strength-wrap');
    if (wrap) wrap.style.display = 'none';
    const currentWrap = document.getElementById('chpass-current-wrap');
    if (currentWrap) currentWrap.style.display = '';
    window._isPasswordReset = false;
    ['chpass-err-current','chpass-err-new','chpass-err-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
    showView(viewChangePass);
  });

  document.getElementById('account-go-change-email')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const inp = document.getElementById('chemail-new');
    if (inp) inp.value = '';
    const err = document.getElementById('chemail-err');
    if (err) err.textContent = '';
    showView(viewChangeEmail);
  });

  document.getElementById('account-logout-btn')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLogoutConfirm || document.getElementById('account-view-logout-confirm'));
  });

  document.getElementById('account-logout-cancel')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLoggedIn || document.getElementById('account-view-loggedin'));
  });

  async function _doLogout() {
    if (window._sbUserId) window.sbSetPlaying(window._sbUserId, false).catch(() => {});
    if (window.LB?.getId?.()) { try { await window.LB.leave(); } catch (e) {} }
    window.sbStopSessionGuard?.();
    localStorage.removeItem('_sbSessionToken');
    if (_friendRealtimeChannel)  { window.sb.removeChannel(_friendRealtimeChannel);  _friendRealtimeChannel = null; }
    if (_friendshipsChannel)     { window.sb.removeChannel(_friendshipsChannel);     _friendshipsChannel = null; }
    await window.sbLogout?.();
    window._accountLoggedIn = false;
    window._sbUserId = null;
    window._sbProfile = null;
    document.body.classList.remove('account-logged');
    localStorage.removeItem('profilePhoto');
    applyStoredProfilePic();
    if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
    clearLocalScores(true);
    if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
    _updateProfileBtnLabel();
  }

  // Logout forzado por sesión duplicada en otro dispositivo
  window._forceSessionLogout = async function() {
    if (!window._accountLoggedIn) return;
    if (typeof closeModal === 'function') closeModal();
    if (typeof window.showVersusToast === 'function')
      window.showVersusToast('Sesión iniciada en otro dispositivo. Cerrando sesión…');
    await _doLogout();
  };

  document.getElementById('account-logout-confirm')?.addEventListener('click', async () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    closeModal();
    await _doLogout();
  });

  // ── Cambiar contraseña ─────────────────────────────────────────────────────
  document.getElementById('chpass-new')?.addEventListener('input', function () {
    const wrap  = document.getElementById('chpass-strength-wrap');
    const fill  = document.getElementById('chpass-strength-fill');
    const label = document.getElementById('chpass-strength-label');
    const v = this.value;
    if (!v) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'flex';
    let score = 0;
    if (v.length >= 8)  score++;
    if (v.length >= 12) score++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^a-zA-Z0-9]/.test(v)) score++;
    const _common2 = ['123456','1234567','12345678','123456789','password','contraseña','111111','000000','qwerty','abc123','654321','987654','112233','123123','aaaaaa','888888','666666','999999','pass123'];
    const hasUsername2 = _passContainsUsername(v, window._sbProfile?.username || '');
    if (_common2.includes(v.toLowerCase()) || /^(.)\1+$/.test(v) || /^(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf|zxcv)/i.test(v) || hasUsername2) score = 0;
    if (score <= 1)      { fill.style.width = '33%';  fill.style.background = '#e74c3c'; label.style.color = '#e74c3c'; label.textContent = t('account.passWeak'); }
    else if (score <= 3) { fill.style.width = '66%';  fill.style.background = '#f39c12'; label.style.color = '#c87800'; label.textContent = t('account.passMedium'); }
    else                 { fill.style.width = '100%'; fill.style.background = '#2bd14b'; label.style.color = '#1a7a30'; label.textContent = t('account.passStrong'); }
  });

  document.getElementById('chpass-submit')?.addEventListener('click', () => {
    const curInp  = document.getElementById('chpass-current');
    const newInp  = document.getElementById('chpass-new');
    const conf    = document.getElementById('chpass-confirm');
    const errCur  = document.getElementById('chpass-err-current');
    const errNew  = document.getElementById('chpass-err-new');
    const errConf = document.getElementById('chpass-err-confirm');
    let ok = true;
    const setErr = (inp, el, msg) => { el.textContent = msg; inp.classList.toggle('input-error', !!msg); if (msg) ok = false; };
    const isReset = !!window._isPasswordReset;

    if (!isReset) {
      if (!curInp.value) setErr(curInp, errCur, t('account.errLoginUser'));
      else setErr(curInp, errCur, '');
    }

    if (newInp.value.length < 6) setErr(newInp, errNew, t('account.errPassShort'));
    else if (_passContainsUsername(newInp.value, window._sbProfile?.username || '')) setErr(newInp, errNew, t('account.errPassContainsUser'));
    else setErr(newInp, errNew, '');

    if (conf.value !== newInp.value) setErr(conf, errConf, t('account.errPassMismatch'));
    else setErr(conf, errConf, '');

    if (ok) {
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      showView(viewLoading);
      const doChange = () => window.sbChangePassword(newInp.value)
        .then(() => { window._isPasswordReset = false; showView(viewChangePassOk); })
        .catch(err => {
          showView(viewChangePass);
          if (errNew) errNew.textContent = err.message || t('account.errPassShort');
        });
      if (isReset) {
        doChange();
      } else {
        const username = (window._sbProfile?.username) || localStorage.getItem('playerName') || '';
        window.sbLogin(username, curInp.value)
          .then(doChange)
          .catch(err => {
            showView(viewChangePass);
            if (err.message === '__wrong_password__' || err.message === '__user_not_found__') {
              if (errCur) { errCur.textContent = t('account.errWrongPass'); curInp.classList.add('input-error'); }
            } else {
              if (errNew) errNew.textContent = err.message || t('account.errPassShort');
            }
          });
      }
    }
  });

  document.getElementById('chpass-ok-close')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const nameEl = document.getElementById('account-linked-name');
    if (nameEl) nameEl.textContent = (window._sbProfile?.username) || localStorage.getItem('playerName') || '';
    showView(viewLoggedIn);
  });

  // ── Cambiar correo ─────────────────────────────────────────────────────────
  document.getElementById('chemail-submit')?.addEventListener('click', () => {
    const inp = document.getElementById('chemail-new');
    const err = document.getElementById('chemail-err');
    const eVal = inp.value.trim();
    if (!/^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.(com|net|edu|org|io|co|es|mx|ar|uk|de|fr|br|ca|jp|au)(\.[a-z]{2})?$/i.test(eVal)) {
      err.textContent = t('account.errEmailInvalid');
      inp.classList.add('input-error');
      return;
    }
    err.textContent = '';
    inp.classList.remove('input-error');
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    showView(viewLoading);
    window.sbChangeEmail(eVal)
      .then(() => showView(viewChangeEmailSent))
      .catch(e => {
        showView(viewChangeEmail);
        if (err) err.textContent = e.message === '__same_email__'
          ? (t('account.errSameEmail') || 'Este correo es igual al actual.')
          : (e.message || t('account.errEmailInvalid'));
      });
  });

  document.getElementById('chemail-sent-ok')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    closeModal();
  });
})();

document.getElementById('loading-play-confirm-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-play-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  const screen = document.getElementById('loading-screen');
  const tableGroup = document.getElementById('loading-table-group');
  tableGroup.classList.add('table-gone');
  screen.classList.remove('table-shown');
  setTimeout(() => tableGroup.classList.remove('above-rankings'), 400);
});

document.getElementById('loading-name-edit')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap  = document.getElementById('loading-name-wrap');
  const input = document.getElementById('loading-name-input');
  input.value = localStorage.getItem('playerName') || 'John';
  wrap.classList.add('editing');
  input.focus();
  input.select();
});

function confirmNameChange() {
  const wrap  = document.getElementById('loading-name-wrap');
  const input = document.getElementById('loading-name-input');
  const limpio = input.value.trim().slice(0, 12);
  if (limpio) {
    localStorage.setItem('playerName', limpio);
    const el = document.getElementById('loading-player-name');
    if (el) el.textContent = limpio;
    maybeAutoAssignPic(limpio);
    _updateProfileBtnLabel();
    // La copa ya no depende del ancho del nombre (vive en el renglón de "Has
    // jugado X veces", ese texto no cambia al renombrarse) — no hace falta
    // reposicionarla acá.
    const flagBadge = document.getElementById('profile-flag-badge');
    if (flagBadge && flagBadge.style.display !== 'none') {
      requestAnimationFrame(() => _centerBadgeWithText(wrap, flagBadge, 'after'));
    }
  }
  wrap.classList.remove('editing');
}

document.getElementById('loading-name-confirm')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const c = document.getElementById('loading-name-confirm');
  c.classList.add('confirm-pressed');
  setTimeout(() => c.classList.remove('confirm-pressed'), 50);
  confirmNameChange();
});

document.getElementById('loading-name-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); confirmNameChange(); }
});

// Redimensiona un File de imagen a max 256×256 y devuelve un dataURL JPEG comprimido
function resizeImageFile(file, callback) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const MAX = 256;
    let w = img.width, h = img.height;
    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
    else        { w = Math.round(w * MAX / h); h = MAX; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', 0.82));
  };
  img.src = url;
}

// Si el nombre contiene "nuti" o cualquier derivado (case-insensitive), asigna nutix.jpg automáticamente
function maybeAutoAssignPic(nombre) {
  if (/nuti/i.test(nombre)) {
    localStorage.setItem('profilePhoto', 'images/profilepic/nutix.jpg');
    applyStoredProfilePic();
  }
}

// Aplica la foto de perfil guardada en todos los sitios donde aparece el jugador
function applyStoredProfilePic() {
  const src = window._sbProfile?.avatar_url || localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
  document.querySelectorAll('.loading-profile-pic:not(#loading-friend-pic)').forEach(el => { el.src = src; });
  const modalPic = document.getElementById('name-prompt-pic');
  if (modalPic) modalPic.src = src;
  const lbImg = document.querySelector('#lb-player .lb-avatar-img');
  if (lbImg) lbImg.src = src;
}
window.applyStoredProfilePic = applyStoredProfilePic;
applyStoredProfilePic();

// Cuando la sesión de Supabase se restaura al recargar: sync datos locales → cuenta
async function _onSessionReady(userId) {
  if (!userId) return;
  // Resetear is_playing por si quedó stale (ej: browser cerrado durante partida)
  if (typeof window.sbSetPlaying === 'function') window.sbSetPlaying(userId, false).catch(() => {});
  try {
    await syncLocalDataToAccount(userId);
    const profile = await window.sbGetProfile(userId);
    window._sbProfile = profile;
    if (profile.username) localStorage.setItem('playerName', profile.username);
    if (profile.avatar_url) {
      localStorage.setItem('profilePhoto', profile.avatar_url);
      applyStoredProfilePic();
    }
    syncHsFromProfile(profile);  // hs locales ← max(local, supabase) para display en partida
    clearLocalScores();          // solo avgs/playcount
    if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
    if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
    _ensureCountryCode(profile);
    if (typeof loadFriends === 'function') loadFriends();  // poblar barra ingame con amigos reales
    _updateProfileBtnLabel();
    // Popup de Fundador: NO se dispara con solo loguearse en general — hace
    // falta al menos 1 Vuelta Mundial COMPLETA jugada (campaigns_completed >
    // 0; GlobeQuiz NO cuenta para esto). Si la cuenta ya calificaba de antes
    // (jugó antes de que existiera este popup), se muestra directo acá al
    // llegar al menú. Si todavía tiene 0 Vueltas Mundiales, no sale acá —
    // recién se pone elegible al terminar su primera Vuelta Mundial y volver
    // al menú (ver window._pendingFounderPopupCheck, puesta en la rama de
    // campaña completa de este archivo y consumida en js/final.js al volver
    // al menú).
    if (profile.is_founder && !profile.founder_popup_seen && (profile.campaigns_completed || 0) > 0) {
      setTimeout(() => { if (typeof window.showFounderWelcomePopup === 'function') window.showFounderWelcomePopup(); }, 800);
    }
  } catch(e) {}
  _subscribeFriendshipChanges(userId);
  _startSocialListPoll();
  if (typeof window._vsStartListening === 'function') window._vsStartListening();
  // Escuchar invitaciones a salas (push de amigos)
  if (window.LB && typeof window.LB.listenForInvites === 'function') {
    window.LB.listenForInvites(p => { if (typeof window.showLobbyIncomingInvite === 'function') window.showLobbyIncomingInvite(p); });
  }
  // Al recargar: cerrar/transferir mis salas en espera de la sesión anterior
  // (refresh = salir de la sala), y si entré por link de invitación, unirme.
  if (window.LB && typeof window.LB.cleanupMine === 'function') window.LB.cleanupMine();
  if (typeof window.tryPendingLobbyJoin === 'function') window.tryPendingLobbyJoin();
  setTimeout(() => { if (typeof window.refreshVersusBell === 'function') window.refreshVersusBell(); }, 600);
}
document.addEventListener('sbSessionReady', (e) => _onSessionReady(e.detail?.userId));
// Si el evento ya fue disparado antes de que este listener se registrara, ejecutar ahora
if (window._sessionReady && window._sbUserId) _onSessionReady(window._sbUserId);
// Mostrar "Cuenta/Account" si no hay sesión activa al cargar
_updateProfileBtnLabel();

// Cambio de foto desde el panel de perfil
(function () {
  function initProfilePicChange() {
    const wrap  = document.getElementById('loading-profile-pic-wrap');
    const input = document.getElementById('loading-profile-pic-input');
    if (!wrap || !input) return;
    wrap.addEventListener('click', () => { input.value = ''; input.click(); });
    // También desde el modal de cuenta
    const accountPicWrap = document.getElementById('account-modal-pic-wrap');
    if (accountPicWrap) {
      accountPicWrap.addEventListener('click',       () => { input.value = ''; input.click(); });
      accountPicWrap.addEventListener('mouseenter',  () => accountPicWrap.classList.add('pic-hover'));
      accountPicWrap.addEventListener('mouseleave',  () => accountPicWrap.classList.remove('pic-hover'));
    }
    function _setAvatarUploading(on) {
      // Account modal pic — inline styles (CSS class-opacity breaks inside animated stacking context)
      const acctOverlay = document.getElementById('account-modal-pic-overlay');
      const acctPencil  = document.getElementById('account-modal-pic-pencil');
      const acctSpinner = document.getElementById('account-modal-pic-spinner');
      if (acctOverlay) {
        acctOverlay.style.opacity    = on ? '1' : '';
        acctOverlay.style.background = on ? 'rgba(0,0,0,0.5)' : '';
      }
      if (acctPencil)  acctPencil.style.display  = on ? 'none'  : '';
      if (acctSpinner) acctSpinner.style.display  = on ? 'block' : 'none';
      // Panel de perfil — inline styles
      const profOverlay = document.getElementById('loading-profile-pic-overlay');
      const profPencil  = document.getElementById('loading-profile-pic-pencil');
      const profSpinner = document.getElementById('loading-profile-pic-spinner');
      if (profOverlay) {
        profOverlay.style.opacity    = on ? '1' : '';
        profOverlay.style.background = on ? 'rgba(0,0,0,0.5)' : '';
      }
      if (profPencil)  profPencil.style.display  = on ? 'none'  : '';
      if (profSpinner) profSpinner.style.display  = on ? 'block' : 'none';
    }
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      if (window._accountLoggedIn && window._sbUserId) _setAvatarUploading(true);
      resizeImageFile(file, async (dataURL) => {
        localStorage.setItem('profilePhoto', dataURL);
        applyStoredProfilePic();
        if (window._accountLoggedIn && window._sbUserId) {
          try {
            const res  = await fetch(dataURL);
            const blob = await res.blob();
            const url  = await window.sbUploadAvatar(window._sbUserId, blob);
            if (window._sbProfile) window._sbProfile.avatar_url = url;
            localStorage.setItem('profilePhoto', url);
            applyStoredProfilePic();
          } catch (e) { console.warn('[avatar] upload error:', e.message); }
          finally { _setAvatarUploading(false); }
        }
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initProfilePicChange);
  else initProfilePicChange();
})();

// ── PRIMER INGRESO: pedir nombre obligatorio (no se puede saltar) ──────────────
(function () {
  function initNamePrompt() {
    const prompt   = document.getElementById('name-prompt');
    const input    = document.getElementById('name-prompt-input');
    const btn      = document.getElementById('name-prompt-btn');
    const picWrap  = document.getElementById('name-prompt-pic-wrap');
    const picImg   = document.getElementById('name-prompt-pic');
    const picInput = document.getElementById('name-prompt-pic-input');
    if (!prompt || !input || !btn) return;
    if (localStorage.getItem('playerName')) return; // ya tiene nombre: no mostrar

    // Cambio de foto desde el modal
    if (picWrap && picInput && picImg) {
      picWrap.addEventListener('click', () => picInput.click());
      picInput.addEventListener('change', () => {
        const file = picInput.files[0];
        if (!file) return;
        resizeImageFile(file, (data) => {
          localStorage.setItem('profilePhoto', data);
          applyStoredProfilePic();
        });
      });
    }

    prompt.classList.add('visible');
    setTimeout(() => { try { input.focus(); } catch (e) {} }, 60);

    function update() { btn.disabled = input.value.trim().length === 0; }
    input.addEventListener('input', update);
    update();

    function submit() {
      const limpio = input.value.trim().slice(0, 12);
      if (!limpio) return;
      localStorage.setItem('playerName', limpio);
      const el = document.getElementById('loading-player-name');
      if (el) el.textContent = limpio;
      maybeAutoAssignPic(limpio);
      if (typeof refreshProfileStats === 'function') refreshProfileStats();
      try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {}
      prompt.classList.remove('visible');
      showWelcomePopup(limpio);
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });

    // Botón "¿Tienes cuenta?" — oculta el name-prompt, abre el modal de cuenta
    const accountBtn = document.getElementById('name-prompt-account-btn');
    const accountModal = document.getElementById('account-modal');
    if (accountBtn && accountModal) {
      accountBtn.addEventListener('click', () => {
        try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {}
        prompt.classList.remove('visible');
        prompt.style.display = 'none';
        if (typeof window.openAccountModal === 'function') window.openAccountModal();
        else accountModal.classList.add('open');

        const observer = new MutationObserver(() => {
          if (!accountModal.classList.contains('open')) {
            observer.disconnect();
            if (window._accountLoggedIn) {
              const loggedName = localStorage.getItem('playerName');
              if (loggedName) {
                const el = document.getElementById('loading-player-name');
                if (el) el.textContent = loggedName;
              }
            } else {
              prompt.classList.add('visible');
              prompt.style.display = '';
            }
          }
        });
        observer.observe(accountModal, { attributes: true, attributeFilter: ['class'] });
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNamePrompt);
  else initNamePrompt();
})();

function showWelcomePopup(nombre) {
  const popup    = document.getElementById('welcome-popup');
  const picEl    = document.getElementById('welcome-popup-pic');
  const nameEl   = document.getElementById('welcome-popup-name');
  const subEl    = document.getElementById('welcome-popup-sub');
  const confirmW = document.getElementById('welcome-popup-confirm');
  if (!popup) return;
  const src = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
  if (picEl)  picEl.src = src;
  if (nameEl) nameEl.textContent = (typeof t === 'function') ? t('name.greet', { name: nombre }) : `¡Hola, ${nombre}!`;
  if (subEl)  subEl.textContent  = (typeof t === 'function') ? t('name.greetSub') : 'Bienvenido a myGeoChallenge.';
  popup.classList.add('visible');
  if (confirmW) {
    const onClick = () => {
      try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {}
      confirmW.classList.add('confirm-pressed');
      setTimeout(() => {
        confirmW.classList.remove('confirm-pressed');
        popup.classList.remove('visible');
      }, 120);
      confirmW.removeEventListener('click', onClick);
    };
    confirmW.addEventListener('click', onClick);
  }
}

// Popup de bienvenida para cuentas Fundador (primeras 100), una sola vez —
// el paquete (frame/card/panel/cell 0002) NO está puesto de entrada, se
// entrega recién al confirmar acá (ver el onClick del botón). Se marca
// founder_popup_seen en Supabase al cerrar para que no vuelva a salir en
// otro dispositivo/navegador (ver _onSessionReady, que llama a esto cuando
// profile.is_founder && !profile.founder_popup_seen).
function showFounderWelcomePopup() {
  const popup    = document.getElementById('founder-popup');
  const confirmW = document.getElementById('founder-popup-confirm');
  if (!popup) return;
  const CA = window.CustomizeAssets;
  if (CA) {
    const frameImg = document.getElementById('founder-popup-frame-img');
    if (frameImg) frameImg.src = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    CA.applyFrame(document.getElementById('founder-popup-frame'), '0002');
    const cardSq = document.getElementById('founder-popup-card');
    if (cardSq) cardSq.style.backgroundImage = `url('${CA.cardUrl('0002')}')`;
    const panelSq = document.getElementById('founder-popup-panel');
    if (panelSq) panelSq.style.backgroundImage = `url('${CA.panelUrl('0002')}')`;
    const cellSq = document.getElementById('founder-popup-cell');
    if (cellSq) cellSq.style.backgroundImage = `url('${CA.cellUrl('0002')}')`;
  }
  popup.classList.add('visible');
  if (confirmW) {
    const onClick = () => {
      try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {}
      confirmW.classList.add('confirm-pressed');
      setTimeout(() => {
        confirmW.classList.remove('confirm-pressed');
        popup.classList.remove('visible');
      }, 120);
      confirmW.removeEventListener('click', onClick);
      // Acá solo se DESBLOQUEA (aparece seleccionable en Personalización,
      // ver isFounder en _renderGrid) — no se equipa nada solo. El jugador
      // elige ponérselo o no como cualquier otro ítem del catálogo.
      // sbClaimFounderPack (RPC atómico), NO sbUpdateProfile directo: hay un
      // trigger en la base que bloquea en silencio cualquier UPDATE de
      // is_founder/founder_popup_seen que no pase por ese RPC — y además es
      // el que lleva la cuenta de "primeros 100 reclamos" y cierra la
      // elegibilidad del resto al llegar al cupo.
      if (window._sbProfile) window._sbProfile.founder_popup_seen = true;
      if (window._sbUserId && typeof window.sbClaimFounderPack === 'function') {
        window.sbClaimFounderPack(window._sbUserId).catch(() => {});
      }
    };
    confirmW.addEventListener('click', onClick);
  }
}
window.showFounderWelcomePopup = showFounderWelcomePopup;

function _updateProfileBtnLabel() {
  const el = document.getElementById('profile-btn-label');
  if (!el) return;
  if (window._accountLoggedIn) {
    el.textContent = (window._sbProfile?.username) || localStorage.getItem('playerName') || '';
  } else {
    el.textContent = t('nav.account');
  }
}

document.getElementById('loading-profile-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('loading-table-group')?.classList.remove('table-gone');
  document.getElementById('loading-screen').classList.add('table-shown');
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
});

let _friendRealtimeChannel = null;
let _friendshipsChannel    = null;
let _knownRequestIds       = null; // null = primera carga, no mostrar notif
let _socialReloadTimer     = null;
function _debouncedLoadSocial() {
  clearTimeout(_socialReloadTimer);
  _socialReloadTimer = setTimeout(() => loadSocialData(false), 400);
}
let _socialListPollInterval = null;

function _patchFriendStatusInDOM(friendId) {
  const f = socialData.friends.find(x => x.id === friendId);
  if (!f) return;
  const st = getStatusObj(f);
  const rk = (typeof getRank === 'function') ? getRank(f.score) : null;
  document.querySelectorAll(`.loading-social-row[data-friend-id="${friendId}"]`).forEach(row => {
    if (row.querySelector('.loading-social-status')) {
      const prevCls = (row.className.match(/status-(\w+)/) || [])[1];
      row.className = row.className.replace(/status-\w+/, 'status-' + st.cls);
      if (prevCls !== st.cls) window.CustomizeAssets.applyCellForStatus(row, f.cellCode, st.cls);
      const statusEl = row.querySelector('.loading-social-status');
      if (statusEl && prevCls !== st.cls) {
        statusEl.innerHTML = `<span class="dot ${st.cls}"></span>${socialStatusText(f)}`;
      } else if (statusEl) {
        // Solo actualizar el texto, sin tocar el dot (no reinicia la animación)
        const textNode = statusEl.lastChild;
        const newText = socialStatusText(f);
        if (textNode && textNode.nodeType === Node.TEXT_NODE) textNode.textContent = newText;
        else if (textNode && textNode.nodeType !== Node.ELEMENT_NODE) statusEl.innerHTML = `<span class="dot ${st.cls}"></span>${newText}`;
      }
    }
    const avatarEl = row.querySelector('.loading-social-avatar');
    if (avatarEl && f.avatar) avatarEl.src = f.avatar;
    const scoreVal = row.querySelector('.loading-social-score-val');
    if (scoreVal) scoreVal.textContent = f.score.toLocaleString();
    const rankName = row.querySelector('.loading-social-rankname');
    if (rankName && rk) rankName.textContent = rk.name;
    const rankImg = row.querySelector('.loading-social-emote');
    if (rankImg && rk) rankImg.src = rk.img;
    // Ojo de espectar: agregar/quitar en vivo si cambia is_playing/is_practicing
    // mientras la fila ya está en pantalla (si no, quedaba desactualizado hasta
    // el próximo renderSocialFriends() completo). Vive DENTRO de
    // .loading-social-score (a la izquierda de points.png, ver CSS) en vez
    // de al lado del nombre.
    const scoreBox = row.querySelector('.loading-social-score');
    if (scoreBox) {
      const shouldShowEye = st.cls === 'playing' && !f.is_practicing;
      let eyeEl = scoreBox.querySelector('.social-spectate-eye');
      if (shouldShowEye && !eyeEl) {
        eyeEl = document.createElement('img');
        eyeEl.className = 'social-spectate-eye';
        eyeEl.src = 'images/spectate.png';
        eyeEl.alt = '';
        eyeEl.draggable = false;
        eyeEl.oncontextmenu = () => false;
        eyeEl.title = 'Ver partida';
        eyeEl.addEventListener('click', (e) => { e.stopPropagation(); openSpectatorForFriend(f); });
        scoreBox.insertBefore(eyeEl, scoreBox.firstChild);
      } else if (!shouldShowEye && eyeEl) {
        eyeEl.remove();
      }
    }
  });
  // Si el panel de detalle de ese amigo está abierto, actualizarlo también
  if (currentFriendProfile?.id === friendId) {
    currentFriendProfile.last_active = f.last_active;
    currentFriendProfile.is_playing  = f.is_playing;
    _applyFriendPanelStatus(currentFriendProfile);
  }
}

let _lastSubscribedFriendIds = '';
function _subscribeFriendStatuses(friendIds) {
  const key = [...friendIds].sort().join(',');
  if (_friendRealtimeChannel && key === _lastSubscribedFriendIds) return; // sin cambios
  if (_friendRealtimeChannel) { window.sb.removeChannel(_friendRealtimeChannel); _friendRealtimeChannel = null; }
  _lastSubscribedFriendIds = key;
  if (!friendIds.length) return;
  _friendRealtimeChannel = window.sb
    .channel('friend-statuses')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles',
      filter: `id=in.(${friendIds.join(',')})`,
    }, (payload) => {
      const updated = payload.new;
      const f = socialData.friends.find(x => x.id === updated.id);
      if (!f) return;
      f.last_active   = updated.last_active;
      f.is_playing    = updated.is_playing;
      f.is_practicing = updated.is_practicing;
      // Sincronizar caché de friends.js (usada por el panel de invitar del lobby)
      if (typeof getFriends === 'function') {
        const fc = getFriends().find(x => x.id === updated.id);
        if (fc) { fc.last_active = updated.last_active; fc.is_playing = updated.is_playing; fc.is_practicing = updated.is_practicing; }
      }
      // Refrescar en vivo el panel de amigos de la sala si está abierto
      window._refreshLobbyInviteList?.();
      // Actualizar avatar si cambió
      if (updated.avatar_url && updated.avatar_url !== f.avatar) {
        f.avatar = updated.avatar_url;
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.avatar = updated.avatar_url;
          const pic = document.getElementById('loading-friend-pic');
          if (pic) pic.src = updated.avatar_url;
        }
        // Parchear avatar en paneles de solicitudes/enviadas/bloqueados
        document.querySelectorAll(`.loading-social-row[data-friend-id="${updated.id}"] .loading-social-avatar`)
          .forEach(el => { el.src = updated.avatar_url; });
      }
      // Actualizar play_count si cambió
      if (updated.play_count != null && updated.play_count !== f.play_count) {
        f.play_count = updated.play_count;
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.play_count = f.play_count;
          const pcEl = document.getElementById('loading-friend-play-count');
          if (pcEl) pcEl.textContent = tn('profile.friendPlayed', f.play_count);
        }
      }
      // Actualizar score si cambió (amigo terminó partida)
      // hs_total (columna) nunca queda seteada server-side para algunas
      // cuentas (queda en 0 aunque hs_flags/hs_shapes/hs_cities/hs_monuments
      // sí tengan puntaje real) — mismo fallback que toEntry() (sb.js) y el
      // helper de más abajo en este archivo (línea ~1868, Math.max). Sin
      // este fallback ACÁ, cualquier UPDATE de perfil del amigo (is_playing,
      // avatar, lo que sea — no hace falta que cambie el score) pisaba el
      // valor correcto con 0 hasta el próximo refetch completo — el "los
      // datos van cambiando entre 0 y el detalle actual" reportado.
      const newScore = updated.hs_total || ((updated.hs_flags||0)+(updated.hs_shapes||0)+(updated.hs_cities||0)+(updated.hs_monuments||0));
      if (newScore !== f.score) {
        f.score       = newScore;
        f.hs_flags    = updated.hs_flags    || 0;
        f.hs_shapes   = updated.hs_shapes   || 0;
        f.hs_cities   = updated.hs_cities   || 0;
        f.hs_monuments= updated.hs_monuments|| 0;
        // Si el panel de detalle está abierto para este amigo, actualizar stats
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.score        = f.score;
          currentFriendProfile.hs_flags     = f.hs_flags;
          currentFriendProfile.hs_shapes    = f.hs_shapes;
          currentFriendProfile.hs_cities    = f.hs_cities;
          currentFriendProfile.hs_monuments = f.hs_monuments;
          const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
          const modeHs2   = [f.hs_flags, f.hs_shapes, f.hs_cities, f.hs_monuments];
          const avgSums2  = [f.avg_sum_flags||0, f.avg_sum_shapes||0, f.avg_sum_cities||0, f.avg_sum_monuments||0];
          const avgCounts2= [f.play_count_flags||0, f.play_count_shapes||0, f.play_count_cities||0, f.play_count_monuments||0];
          modeHs2.forEach((hs, k) => {
            setText('loading-friend-avg'+(k+1), hs.toLocaleString());
            const avg = avgCounts2[k] > 0 ? Math.round(avgSums2[k] / avgCounts2[k]) : hs;
            setText('loading-friend-hs'+(k+1), avg.toLocaleString());
          });
          setText('loading-friend-total', f.score.toLocaleString());
          const rk = (typeof getRank === 'function') ? getRank(f.score) : null;
          const rankImg = document.getElementById('loading-friend-rank');
          if (rankImg && rk) rankImg.src = rk.img;
          const rankLabel = document.getElementById('loading-friend-rank-label');
          if (rankLabel && rk) rankLabel.textContent = rk.name;
        }
      }
      // Si el sort es por conexión, re-renderizar la lista para re-ordenar en tiempo real
      if (socialSort === 'conn') {
        const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
        const friendDetailOpen = !document.getElementById('loading-friend-group')?.classList.contains('table-gone');
        if (panelOpen && !friendDetailOpen && socialActiveTab === 'friends') {
          renderSocial(document.getElementById('loading-social-search-input')?.value || '');
        }
      } else {
        _patchFriendStatusInDOM(updated.id);
      }
      // Si el panel de detalle está abierto para este amigo, actualizar status
      if (currentFriendProfile?.id === updated.id) {
        currentFriendProfile.last_active = updated.last_active;
        currentFriendProfile.is_playing  = updated.is_playing;
        if (typeof _applyFriendPanelStatus === 'function') _applyFriendPanelStatus(currentFriendProfile);
      }
    })
    .subscribe();
}

function _subscribeFriendshipChanges(userId) {
  if (_friendshipsChannel) return; // ya suscrito — no recrear
  if (!userId) return;
  _friendshipsChannel = window.sb
    .channel('friendship-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
      // Supabase no garantiza el payload completo sin REPLICA IDENTITY FULL,
      // así que recargamos siempre que llegue cualquier evento de la tabla.
      _debouncedLoadSocial();
    })
    .subscribe();
}

// Chequeo ligero del badge cuando el panel está cerrado (solo cuenta pendientes).
async function _checkRequestsBadge() {
  if (!window._accountLoggedIn || !window._sbUserId) return;
  const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
  if (panelOpen) return;
  try {
    const { data } = await window.sb.from('friendships')
      .select('id').eq('user_b', window._sbUserId).eq('status', 'pending');
    const hasRequests = (data || []).length > 0;
    const badge = document.getElementById('social-notif-badge');
    if (badge) badge.style.display = hasRequests ? 'flex' : 'none';
  } catch (e) {}
}

// Poll: re-renderiza si panel abierto; actualiza badge si cerrado.
function _startSocialListPoll() {
  clearInterval(_socialListPollInterval);
  _socialListPollInterval = setInterval(() => {
    const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
    if (!panelOpen) { _checkRequestsBadge(); return; }
    const friendDetailOpen = !document.getElementById('loading-friend-group')?.classList.contains('table-gone');
    // Resync completo cada 5s: captura cambios de friendships que Realtime perdió
    // y re-ordena la lista si el sort es por conexión.
    loadSocialData(false);
  }, 5000);
}
function _stopSocialListPoll() {
  clearInterval(_socialListPollInterval);
  _socialListPollInterval = null;
}

document.getElementById('loading-social-btn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (!window._accountLoggedIn) {
    document.getElementById('social-lock-popup')?.classList.add('open');
    return;
  }
  document.getElementById('loading-social-group')?.classList.remove('table-gone');
  document.getElementById('loading-screen').classList.add('table-shown');
  // Ocultar badge y notificación de solicitud al entrar al panel
  const badge = document.getElementById('social-notif-badge');
  if (badge) badge.style.display = 'none';
  _dismissFriendRequestNotif();
  loadSocialData();
});

// ── Panel de personalización (items por código, preparado para la tienda) ─────
// 3 slots independientes (cada uno su propia columna en profiles, ver
// migración customize_item_codes): marco de foto, tarjeta del leaderboard
// in-game, y el "recuadro" (skin del tablero, antes siempre howtoplaytable.png).
// Cada valor es un código de archivo — images/customize/<categoria>/<code>.png.
// Un solo panel con tabs arriba a la derecha + grilla de opciones, y a la
// izquierda una vista previa fija que se actualiza en vivo.
(function () {
  const CATS = {
    photo:       { field: 'frame_code' },
    leaderboard: { field: 'card_code' },
    table:       { field: 'panel_code' },
    cell:        { field: 'cell_code' },
  };
  // Catálogo de ítems disponibles por categoría. Hoy solo existe el default
  // ('0001', gratis para todos); a futuro se suma acá cada código nuevo a
  // medida que haya arte + se sume la tienda (founderOnly, price, etc.).
  const CATALOG = {
    photo:       [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    leaderboard: [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    table:       [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    cell:        [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
  };
  let _activeCat = 'photo';

  // Aplica los 3 ítems elegidos en los lugares donde se ven en vivo: la foto
  // del panel de perfil, la fila propia del leaderboard in-game (#lb-player
  // se recrea cada partida — ver initLeaderboard acá mismo — y #flags-lb-player,
  // que flags.js maneja aparte porque Banderas no reusa #lb-player) y el
  // tablero del panel de perfil. También refresca la vista previa del panel
  // de personalización si está abierto.
  function _applyFounderFrame() {
    const p = window._sbProfile;
    const CA = window.CustomizeAssets;
    if (!CA) return;
    // Respaldo local: si hay perfil de verdad, se guarda el último código
    // conocido; si no lo hay (sin conexión, todavía no cargó), se usa lo
    // último guardado — y si tampoco hay nada guardado, CustomizeAssets ya
    // cae a '0001' (el default) para que nunca quede vacío/roto.
    let frameCode, cardCode, panelCode, cellCode;
    if (p) {
      frameCode = p.frame_code || '0001';
      cardCode  = p.card_code  || '0001';
      panelCode = p.panel_code || '0001';
      cellCode  = p.cell_code  || '0001';
      try {
        localStorage.setItem('cust_frame_code', frameCode);
        localStorage.setItem('cust_card_code',  cardCode);
        localStorage.setItem('cust_panel_code', panelCode);
        localStorage.setItem('cust_cell_code',  cellCode);
      } catch (e) {}
    } else {
      frameCode = localStorage.getItem('cust_frame_code') || '0001';
      cardCode  = localStorage.getItem('cust_card_code')  || '0001';
      panelCode = localStorage.getItem('cust_panel_code') || '0001';
      cellCode  = localStorage.getItem('cust_cell_code')  || '0001';
    }

    // El marco (frame) es solo para LA FOTO GRANDE del perfil — la ficha del
    // leaderboard in-game lleva la foto plana, sin marco (ver también
    // _swatchPreview/_refreshLeftPreview, mismo criterio para las vistas
    // previas del panel de Personalizar).
    CA.applyFrame(document.getElementById('loading-profile-pic-wrap'), frameCode);
    CA.applyCard(document.getElementById('lb-player'), cardCode);
    CA.applyCard(document.getElementById('flags-lb-player'), cardCode);
    CA.applyCard(document.getElementById('gq-lb-player'), cardCode);
    const panelImg = document.querySelector('#loading-table-group .loading-howtotable');
    if (panelImg) panelImg.src = CA.panelUrl(panelCode);

    _refreshLeftPreview();
  }
  window._applyFounderFrame = _applyFounderFrame;

  // Extrae el color dominante de un PNG de panel (promedio de píxeles
  // opacos, muestreado en baja resolución) para tematizar las tabs y la
  // grilla de opciones de Personalización acorde al panel equipado.
  // Cacheado por URL porque cada panel no cambia en runtime.
  const _panelColorCache = {};
  function _extractPanelColor(url) {
    if (_panelColorCache[url] !== undefined) return Promise.resolve(_panelColorCache[url]);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let rgb = null;
        try {
          const w = 24, h = 24;
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 200) continue;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
          if (n > 0) rgb = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        } catch (e) { /* canvas tainted (file://) -> sin tema, se usa el fallback CSS */ }
        _panelColorCache[url] = rgb;
        resolve(rgb);
      };
      img.onerror = () => { _panelColorCache[url] = null; resolve(null); };
      img.src = url;
    });
  }
  function _mixRgb(rgb, target, amount) {
    return rgb.map((c, i) => Math.round(c + (target[i] - c) * amount));
  }
  let _panelThemeToken = 0;
  async function _applyPanelTheme(panelCode) {
    const CA = window.CustomizeAssets;
    const right = document.querySelector('.customize-right');
    if (!CA || !right) return;
    const token = ++_panelThemeToken;
    const rgb = await _extractPanelColor(CA.panelUrl(panelCode));
    if (token !== _panelThemeToken) return; // llegó una llamada más nueva mientras cargaba
    if (!rgb) {
      ['--panel-border', '--panel-tab-bg', '--panel-tab-hover-bg', '--panel-tab-active-bg', '--panel-grid-bg', '--panel-tab-text']
        .forEach(v => right.style.removeProperty(v));
      return;
    }
    right.style.setProperty('--panel-border', `rgb(${_mixRgb(rgb, [0, 0, 0], 0.35).join(',')})`);
    right.style.setProperty('--panel-tab-text', `rgb(${_mixRgb(rgb, [0, 0, 0], 0.65).join(',')})`);
    right.style.setProperty('--panel-tab-bg', `rgb(${_mixRgb(rgb, [255, 255, 255], 0.55).join(',')})`);
    right.style.setProperty('--panel-tab-hover-bg', `rgb(${_mixRgb(rgb, [255, 255, 255], 0.4).join(',')})`);
    right.style.setProperty('--panel-tab-active-bg', `rgb(${_mixRgb(rgb, [255, 255, 255], 0.78).join(',')})`);
    right.style.setProperty('--panel-grid-bg', `rgb(${_mixRgb(rgb, [255, 255, 255], 0.78).join(',')})`);
  }

  function _refreshLeftPreview() {
    const p = window._sbProfile;
    const CA = window.CustomizeAssets;
    const name  = localStorage.getItem('playerName') || 'John';
    const photo = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    const frameCode = p?.frame_code || localStorage.getItem('cust_frame_code') || '0001';
    const cardCode  = p?.card_code  || localStorage.getItem('cust_card_code')  || '0001';
    const panelCode = p?.panel_code || localStorage.getItem('cust_panel_code') || '0001';

    const customizePanelImg = document.querySelector('#loading-customize-group .loading-howtotable');
    if (customizePanelImg) customizePanelImg.src = CA?.panelUrl(panelCode);
    _applyPanelTheme(panelCode);

    const avatarImg = document.getElementById('customize-preview-avatar-img');
    if (avatarImg) avatarImg.src = photo;
    CA?.applyFrame(document.getElementById('customize-preview-avatar-wrap'), frameCode);
    const nameEl = document.getElementById('customize-preview-name');
    if (nameEl) nameEl.textContent = name;
    const lbImg = document.getElementById('customize-preview-lb-avatar-img');
    if (lbImg) lbImg.src = photo;
    const lbName = document.getElementById('customize-preview-lb-name');
    if (lbName) lbName.textContent = name;
    // El marco (frame) es solo para LA FOTO GRANDE del perfil — la ficha del
    // leaderboard/card lleva la foto plana, sin marco, aunque tenga uno
    // equipado.
    CA?.applyCard(document.getElementById('customize-preview-lb-card'), cardCode);
  }

  // Miniatura representativa de un código, para las tarjetas de la grilla.
  // La de "leaderboard" reusa las clases reales del juego (.lb-entry.lb-player,
  // .lb-avatar, .lb-name, .lb-score) para que sea la ficha de verdad, no una
  // inventada — mismo truco que .customize-lb-preview: se resetea position a
  // relative acá adentro porque .lb-entry es absolute para la animación in-game.
  function _swatchPreview(cat, code) {
    const CA = window.CustomizeAssets;
    const photo = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    const name  = localStorage.getItem('playerName') || 'John';
    if (cat === 'photo') {
      const frameInset = window.CUSTOMIZE_FRAME_INSET[code] || '-14.5%';
      // Tamaño fijo en cqmin, NO en % — el swatch tiene padding-bottom (deja
      // lugar al label) así que su ancho y alto de contenido ya no son
      // iguales; un width/height en % de esa caja da un óvalo en vez de
      // círculo. cqmin es relativo al contenedor de arriba (mismo para
      // ambas dimensiones), así que siempre da un cuadrado real.
      return `<div class="customize-preview-avatar-wrap cust-frame-wrap" style="width:7.5cqmin;height:7.5cqmin;--cust-frame:url('${CA.frameUrl(code)}');--cust-frame-inset:${frameInset}">`
        + `<img src="${photo}"></div>`;
    }
    if (cat === 'leaderboard') {
      // transform:scale (no width%) para que el texto se achique proporcional
      // con el resto de la ficha — igual que se ve en el juego, no una copia
      // aplastada con la misma tipografía de tamaño real metida en una caja chica.
      // Foto PLANA, sin marco — el marco es solo de la foto grande de perfil,
      // no de la ficha del leaderboard/card.
      return `<div class="customize-swatch-lb-scale">`
        + `<div class="lb-entry lb-player${window.CUSTOMIZE_CARD_LIGHT_TEXT?.has(code) ? ' card-light-text' : ''}" style="position:relative;top:auto;left:auto;width:12cqmin;transition:none;--cust-card:url('${CA.cardUrl(code)}')">`
        + `<div class="lb-avatar"><img class="lb-avatar-img" src="${photo}"></div>`
        + `<span class="lb-name">${name}</span><span class="lb-score">1234</span>`
        + `</div></div>`;
    }
    if (cat === 'cell') {
      // Mini maqueta de la fila COMPLETA de Rankings/Amigos (avatar+nombre),
      // no solo el circulito — la celda es toda la tarjeta. Tamaño FIJO
      // (no depende del largo del nombre): mismo ancho/alto para las dos
      // tarjetas de la grilla, con el nombre recortado si no entra.
      return `<div style="width:90%;height:5.4cqmin;box-sizing:border-box;display:flex;align-items:center;gap:0.8cqmin;padding:0 1cqmin;border-radius:0.8cqmin;overflow:hidden;`
        + `background-image:url('${CA.cellUrl(code)}');background-size:100% 100%;background-repeat:no-repeat;">`
        + `<img src="${photo}" style="width:4.2cqmin;height:4.2cqmin;border-radius:50%;object-fit:cover;border:0.3cqmin solid #8b6a00;flex:none;">`
        + `<span style="font-family:'VAGRoundBold','Arial Black',sans-serif;font-size:1.6cqmin;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
          + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(code)
            ? `color:#fff;-webkit-text-stroke:0.4cqmin #4a3b00;paint-order:stroke fill;`
            : `color:#5a4400;`)
          + `">${name}</span>`
        + `</div>`;
    }
    return `<img src="${CA.panelUrl(code)}" style="width:100%;height:100%;object-fit:cover;">`;
  }

  function _renderGrid(cat) {
    const grid = document.getElementById('customize-grid');
    if (!grid) return;
    const p = window._sbProfile;
    // No alcanza con is_founder: el paquete queda oculto hasta que confirma
    // el popup de bienvenida (founder_popup_seen, ver showFounderWelcomePopup)
    // — ese click solo DESBLOQUEA, no equipa nada solo; recién ahí puede
    // elegir ponérselo o no acá como cualquier otro ítem.
    const isFounder = !!(p && p.is_founder && p.founder_popup_seen);
    const field = CATS[cat].field;
    const currentCode = p?.[field] || '0001';
    grid.innerHTML = '';

    CATALOG[cat].forEach(item => {
      // Fundador es un caso especial: no es "conseguible" (nadie lo suma
      // después de las primeras 100 cuentas), así que a quien no lo tiene ni
      // se le muestra — no tiene sentido mostrar bloqueado algo que jamás va
      // a poder desbloquear. Los ítems de logro/tienda sí se muestran
      // bloqueados (con 🔒) para generar incentivo a conseguirlos.
      if (item.founderOnly && !isFounder) return;
      const locked   = item.locked && !item.unlocked;
      const selected = currentCode === item.code;
      const sw = document.createElement('div');
      sw.className = 'customize-swatch' + (selected ? ' selected' : '') + (locked ? ' locked' : '');
      sw.innerHTML = _swatchPreview(cat, item.code)
        + `<span class="customize-swatch-label">${item.code === '0001' ? t('customize.optDefault') : (item.code === '0002' ? t('customize.frameFounder') : item.code)}</span>`
        + (locked ? `<span class="customize-swatch-lock">🔒</span>` : `<div class="customize-swatch-check">✓</div>`);
      if (locked) sw.title = t('customize.locked');
      else sw.addEventListener('click', () => _selectOption(cat, item.code));
      grid.appendChild(sw);
    });
  }

  async function _selectOption(cat, code) {
    if (!window._sbProfile || !window._sbUserId) return;
    const field = CATS[cat].field;
    const prev = window._sbProfile[field];
    if (prev === code) return; // ya está seleccionado
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    window._sbProfile[field] = code; // optimista
    _applyFounderFrame();
    _renderGrid(cat);
    try {
      await window.sbUpdateProfile(window._sbUserId, { [field]: code });
    } catch (err) {
      window._sbProfile[field] = prev;
      _applyFounderFrame();
      _renderGrid(cat);
    }
  }

  document.querySelectorAll('.customize-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      document.querySelectorAll('.customize-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeCat = btn.dataset.cat;
      _renderGrid(_activeCat);
    });
  });

  document.getElementById('loading-customize-btn')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const btn = document.getElementById('loading-customize-btn');
    btn?.classList.add('confirm-pressed');
    setTimeout(() => btn?.classList.remove('confirm-pressed'), 50);
    if (!window._accountLoggedIn) { if (typeof window.openAccountModal === 'function') window.openAccountModal(); return; }
    _refreshLeftPreview();
    _renderGrid(_activeCat);
    document.getElementById('loading-customize-group')?.classList.remove('table-gone');
  });

  document.getElementById('customize-back-wrap')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const wrap = document.getElementById('customize-back-wrap');
    wrap.classList.add('confirm-pressed');
    setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
    document.getElementById('loading-customize-group')?.classList.add('table-gone');
  });

  // Las etiquetas de la grilla ("Sin personalizar"/"Marco de Fundador") se
  // arman en JS con t(), no son data-i18n estático — el refresco genérico de
  // idioma no las toca. Si el panel está abierto al cambiar de idioma, hay
  // que re-renderizar la tab activa a mano.
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      const group = document.getElementById('loading-customize-group');
      if (!group || group.classList.contains('table-gone')) return;
      _renderGrid(_activeCat);
    });
  }
})();

// ── Rankings panel ─────────────────────────────────────────────────────────────
(function () {
  let _activeRTab = 'top100';
  let _rankingsCache = {};       // tab → rows[]
  let _rankingsRawMap = {};      // tab → { id → raw profile object } for live updates
  let _rankingsRTChannel = null; // realtime channel
  let _allGlobalRows = null;     // full sorted list for rank computation

  const SEL = 'id, username, avatar_url, hs_flags, hs_shapes, hs_cities, hs_monuments, hs_total, play_count, vs_wins, vs_losses, is_supporter, avg_sum_flags, avg_sum_shapes, avg_sum_cities, avg_sum_monuments, play_count_flags, play_count_shapes, play_count_cities, play_count_monuments, country_code, is_founder, cell_code, frame_code, panel_code';

  function _totalScore(p) {
    const fromCols = (p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0);
    return Math.max(p.hs_total||0, fromCols);
  }
  function _toRow(p) {
    return {
      id: p.id, name: p.username || '?',
      avatar: p.avatar_url || 'images/profilepic/ppdefault.png',
      score: _totalScore(p),
      hs_flags: p.hs_flags||0, hs_shapes: p.hs_shapes||0,
      hs_cities: p.hs_cities||0, hs_monuments: p.hs_monuments||0,
      avg_sum_flags: p.avg_sum_flags||0, avg_sum_shapes: p.avg_sum_shapes||0,
      avg_sum_cities: p.avg_sum_cities||0, avg_sum_monuments: p.avg_sum_monuments||0,
      play_count_flags: p.play_count_flags||0, play_count_shapes: p.play_count_shapes||0,
      play_count_cities: p.play_count_cities||0, play_count_monuments: p.play_count_monuments||0,
      play_count: p.play_count||0, vs_wins: p.vs_wins||0, vs_losses: p.vs_losses||0,
      is_supporter: p.is_supporter||false, country_code: p.country_code || null,
      cellCode: p.cell_code || '0001',
      frameCode: p.frame_code || '0001',
      panelCode: p.panel_code || '0001',
    };
  }
  function _sortAndRank(profiles) {
    return profiles
      .map(p => _toRow(p))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // ── fetchers ──────────────────────────────────────────────────────────────────
  // window.withConnCheck (final.js) envuelve el pedido con timeout: si tarda
  // demasiado o no hay internet, muestra la viñeta de error de conexión sola y
  // devuelve null acá, en vez de dejar el panel de Rankings cargando para siempre.
  async function fetchTop100() {
    if (_rankingsCache.top100) return _rankingsCache.top100;
    if (!window.sb) return [];
    const res = typeof window.withConnCheck === 'function'
      ? await window.withConnCheck(window.sb.from('profiles').select(SEL).eq('hidden_from_rankings', false), 6000)
      : await window.sb.from('profiles').select(SEL).eq('hidden_from_rankings', false);
    if (!res) return [];
    const data = res.data;
    const rows = _sortAndRank(data || []).slice(0, 100);
    _rankingsCache.top100 = rows;
    _rankingsRawMap.top100 = Object.fromEntries((data||[]).map(p => [p.id, p]));
    return rows;
  }

  async function fetchTopGlobal() {
    if (_rankingsCache.global) return _rankingsCache.global;
    if (!window.sb) return [];
    const myId = window._sbProfile?.id;
    const res = typeof window.withConnCheck === 'function'
      ? await window.withConnCheck(window.sb.from('profiles').select(SEL).eq('hidden_from_rankings', false), 6000)
      : await window.sb.from('profiles').select(SEL).eq('hidden_from_rankings', false);
    if (!res) return [];
    const all = res.data;
    _allGlobalRows = _sortAndRank(all || []);
    const allRows = _allGlobalRows;
    let start = 0, end = 30;
    if (myId) {
      const myIdx = allRows.findIndex(r => r.id === myId);
      if (myIdx !== -1) {
        start = Math.max(0, myIdx - 15);
        end   = Math.min(allRows.length, start + 31);
        start = Math.max(0, end - 31);
      }
    }
    _rankingsCache.global = allRows.slice(start, end);
    _rankingsRawMap.global = Object.fromEntries((all||[]).map(p => [p.id, p]));
    return _rankingsCache.global;
  }

  async function fetchTopFriends() {
    if (_rankingsCache.friends) return _rankingsCache.friends;
    if (!window.sb || !window._accountLoggedIn) return null;
    const friends = (typeof getFriends === 'function' ? getFriends() : []);
    const friendIds = friends.map(f => f.id).filter(Boolean);
    const myId = window._sbProfile?.id;
    const allIds = myId ? [...new Set([...friendIds, myId])] : friendIds;
    if (!allIds.length) { _rankingsCache.friends = []; return []; }
    const res = typeof window.withConnCheck === 'function'
      ? await window.withConnCheck(window.sb.from('profiles').select(SEL).in('id', allIds), 6000)
      : await window.sb.from('profiles').select(SEL).in('id', allIds);
    if (!res) return [];
    const data = res.data;
    const rows = _sortAndRank(data || []);
    _rankingsCache.friends = rows;
    _rankingsRawMap.friends = Object.fromEntries((data||[]).map(p => [p.id, p]));
    return rows;
  }

  // Puesto global de un id cualquiera (para el badge de copa en los paneles
  // de perfil). Reusa el listado completo ya ordenado por fetchTopGlobal.
  async function getGlobalRankForId(id) {
    if (!id) return null;
    if (!_allGlobalRows) await fetchTopGlobal();
    if (!_allGlobalRows) return null;
    const row = _allGlobalRows.find(r => r.id === id);
    return row ? row.rank : null;
  }
  window.getGlobalRankForId = getGlobalRankForId;

  // ── copa según puesto ─────────────────────────────────────────────────────────
  function _cupForRank(rank) {
    if (rank === 1) return 'cup1';
    if (rank === 2) return 'cup2';
    if (rank === 3) return 'cup3';
    if (rank <= 9) return 'cup4';
    if (rank <= 49) return 'cup5';
    if (rank <= 99) return 'cup6';
    if (rank <= 499) return 'cup7';
    if (rank <= 999) return 'cup8';
    if (rank <= 1999) return 'cup9';
    return 'cup10';
  }
  window._cupForRank = _cupForRank;

  // Avatar circular con marco de personalización para las filas de Rankings/
  // Amigos (.loading-social-avatar) — a diferencia del .lb-avatar in-game
  // (ver _refreshLeftPreview), acá SÍ se muestra el marco equipado por cada
  // usuario, del mismo modo que en la foto grande del perfil.
  function _socialAvatarHtml(avatarUrl, frameCode) {
    const CA = window.CustomizeAssets;
    const code = frameCode || '0001';
    const inset = (window.CUSTOMIZE_FRAME_INSET && window.CUSTOMIZE_FRAME_INSET[code]) || '-14.5%';
    return `<span class="loading-social-avatar-wrap cust-frame-wrap" style="--cust-frame:url('${CA.frameUrl(code)}');--cust-frame-inset:${inset}">` +
      `<img class="loading-social-avatar" src="${avatarUrl}" onerror="this.src='images/profilepic/ppdefault.png'" alt="" draggable="false" oncontextmenu="return false">` +
      `</span>`;
  }
  window._socialAvatarHtml = _socialAvatarHtml;

  // ── renderer ──────────────────────────────────────────────────────────────────
  function renderRankings(rows, tab) {
    const list = document.getElementById('loading-rankings-list');
    if (!list) return;
    if (rows === null) { list.innerHTML = '<div class="rankings-msg">' + t('rankings.notLoggedIn') + '</div>'; return; }
    if (!rows.length) {
      list.innerHTML = '<div class="rankings-msg">' + t(tab === 'friends' ? 'rankings.noFriends' : 'rankings.noData') + '</div>';
      return;
    }
    const myId = window._sbProfile?.id;
    list.innerHTML = '';
    rows.forEach(r => {
      const isMe = myId && r.id === myId;
      const rk   = (typeof getRank === 'function') ? getRank(r.score) : { name: '', img: 'images/ranks/1.png' };
      const medalCls = r.rank === 1 ? ' rk-gold' : r.rank === 2 ? ' rk-silver' : r.rank === 3 ? ' rk-bronze' : '';
      const el = document.createElement('div');
      el.className = 'loading-social-row' + (isMe ? ' is-me-row' : '') + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(r.cellCode) ? ' cell-light-text' : '');
      el.style.setProperty('--cust-cell', `url('${window.CustomizeAssets.cellUrl(r.cellCode)}')`);
      const flagUrl = window.flagUrlForCountryCode?.(r.country_code);
      el.innerHTML =
        `<span class="rankings-pos${medalCls}">#${r.rank}</span>` +
        _socialAvatarHtml(r.avatar, r.frameCode) +
        `<div class="loading-social-info"><span class="loading-social-name">${r.name}</span></div>` +
        `<div class="loading-social-score">` +
          (flagUrl ? `<img class="loading-social-flag" src="${flagUrl}" alt="" draggable="false" oncontextmenu="return false">` : '') +
          `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
          `<span class="loading-social-score-val">${r.score.toLocaleString()}</span>` +
        `</div>` +
        `<span class="loading-social-rankname">${rk.name}</span>` +
        `<img class="loading-social-emote" src="${rk.img}" alt="" draggable="false" oncontextmenu="return false">`;
      el.addEventListener('click', async () => {
        const myId = window._sbProfile?.id;
        if (myId && r.id === myId) {
          sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
          const tg = document.getElementById('loading-table-group');
          tg?.classList.remove('table-gone');
          tg?.classList.add('above-rankings');
        } else if (typeof window.openFriendProfile === 'function') {
          // Ensure social data (friend list) is loaded before relStatus() is called inside openFriendProfile
          if (window._accountLoggedIn && !window._socialDataFetched) {
            await loadSocialData(false);
          }
          window.openFriendProfile(r);
        }
      });
      list.appendChild(el);
    });
  }

  // ── realtime ──────────────────────────────────────────────────────────────────
  function _subscribeRealtime(ids) {
    if (_rankingsRTChannel) { window.sb?.removeChannel(_rankingsRTChannel); _rankingsRTChannel = null; }
    if (!window.sb || !ids.length) return;
    _rankingsRTChannel = window.sb
      .channel('rankings-rt-' + ids.slice(0, 5).join('-'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=in.(${ids.join(',')})` }, payload => {
        const upd = payload.new;
        // Patch raw map for all tabs that contain this id
        ['top100', 'global', 'friends'].forEach(tab => {
          if (!_rankingsRawMap[tab] || !_rankingsRawMap[tab][upd.id]) return;
          Object.assign(_rankingsRawMap[tab][upd.id], upd);
          // Re-sort and re-rank from updated raw map
          const rawArr = Object.values(_rankingsRawMap[tab]);
          const newRows = _sortAndRank(rawArr);
          // For top100 slice to 100; for global re-compute window
          if (tab === 'top100') {
            _rankingsCache[tab] = newRows.slice(0, 100);
          } else if (tab === 'global') {
            const myId = window._sbProfile?.id;
            let start = 0, end = 30;
            if (myId) {
              const myIdx = newRows.findIndex(r => r.id === myId);
              if (myIdx !== -1) {
                start = Math.max(0, myIdx - 15);
                end   = Math.min(newRows.length, start + 31);
                start = Math.max(0, end - 31);
              }
            }
            _rankingsCache[tab] = newRows.slice(start, end);
          } else {
            _rankingsCache[tab] = newRows;
          }
          if (_activeRTab === tab) renderRankings(_rankingsCache[tab], tab);
        });
      })
      .subscribe();
  }

  function _unsubscribeRealtime() {
    if (_rankingsRTChannel) { window.sb?.removeChannel(_rankingsRTChannel); _rankingsRTChannel = null; }
  }

  // ── load tab ──────────────────────────────────────────────────────────────────
  async function loadTab(tab) {
    _activeRTab = tab;
    const list = document.getElementById('loading-rankings-list');
    if (list) list.innerHTML = '<div class="rankings-msg">' + t('rankings.loading') + '</div>';
    let rows;
    if (tab === 'top100')       rows = await fetchTop100();
    else if (tab === 'global')  rows = await fetchTopGlobal();
    else                        rows = await fetchTopFriends();
    if (_activeRTab !== tab) return;
    renderRankings(rows, tab);
    // Subscribe realtime to IDs now visible
    if (rows && rows.length) _subscribeRealtime(rows.map(r => r.id));
  }

  // ── open / close ──────────────────────────────────────────────────────────────
  document.getElementById('loading-rankings-btn')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    document.getElementById('loading-rankings-group')?.classList.remove('table-gone');
    document.getElementById('loading-screen').classList.add('table-shown');
    _rankingsCache = {};
    _rankingsRawMap = {};
    _allGlobalRows = null;
    loadTab(_activeRTab);
  });

  document.querySelectorAll('[data-rtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-rtab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      loadTab(btn.dataset.rtab);
    });
  });

  document.getElementById('loading-rankings-back-wrap')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const wrap = document.getElementById('loading-rankings-back-wrap');
    wrap.classList.add('confirm-pressed');
    setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
    document.getElementById('loading-rankings-group')?.classList.add('table-gone');
    document.getElementById('loading-screen').classList.remove('table-shown');
    _unsubscribeRealtime();
  });

  // ── lang change ───────────────────────────────────────────────────────────────
  if (typeof onLangChange === 'function') onLangChange(() => {
    const group = document.getElementById('loading-rankings-group');
    if (!group || group.classList.contains('table-gone')) return;
    const cached = _rankingsCache[_activeRTab];
    if (cached !== undefined) renderRankings(cached, _activeRTab);
  });
})();

(function () {
  const popup = document.getElementById('social-lock-popup');
  document.getElementById('social-lock-close')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    popup?.classList.remove('open');
  });
  document.getElementById('social-lock-login')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    popup?.classList.remove('open');
    // Abre el modal de cuenta directo en la vista de login
    const accountModal = document.getElementById('account-modal');
    const viewLogin    = document.getElementById('account-view-login');
    if (accountModal && viewLogin) {
      ['account-view-main','account-view-login','account-view-register','account-view-loading','account-view-verify','account-view-welcome']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
      viewLogin.style.display = 'flex';
      accountModal.classList.add('open');
    }
  });
})();

document.getElementById('loading-social-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-social-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-social-group')?.classList.add('table-gone');
  document.getElementById('loading-screen').classList.remove('table-shown');
  _updateSocialBadge();
});

// ── Lista de amigos del panel social ─────────────────────────────────────────

let socialActiveTab = 'friends';
let socialSort = localStorage.getItem('socialSort') || 'conn';

// Cache de datos sociales cargado desde Supabase
let socialData = { friends: [], requests: [], sent: [], blocked: [], blockedMe: [] };

// Respaldo local (ver loadSocialData): si el pedido al servidor falla, se usa
// lo último guardado acá en vez de dejar el panel de amigos vacío.
function _loadCachedSocialData() {
  try { return JSON.parse(localStorage.getItem('cachedSocialData') || 'null'); } catch (e) { return null; }
}

// Favoritos persistidos en localStorage por user ID
function getSocialFavs() {
  try { return new Set(JSON.parse(localStorage.getItem('socialFavs') || '[]')); } catch { return new Set(); }
}
function saveSocialFavs(set) { localStorage.setItem('socialFavs', JSON.stringify([...set])); }

// El amigo cuyo perfil está abierto
let currentFriendProfile = null;

function relStatus(f) {
  if (!f) return 'none';
  const id = f.id;
  if (socialData.blocked.some(b => b.id === id))  return 'blocked';
  if (socialData.friends.some(x => x.id === id))  return 'friend';
  if (socialData.requests.some(r => r.id === id)) return 'request';
  if (socialData.sent.some(s => s.id === id))     return 'sent';
  return 'none';
}

function getStatusObj(f) {
  if (!f || !f.last_active) return { cls: 'offline', minsAgo: 9999 };
  const secsAgo = (Date.now() - new Date(f.last_active)) / 1000;
  if (secsAgo > 120) return { cls: 'offline', minsAgo: secsAgo / 60 };
  if (f.is_playing) return { cls: 'playing', minsAgo: 0 };
  return { cls: 'online', minsAgo: 0 };
}

function socialStatusText(f) {
  if (!f || !f.last_active) return t('social.offline') || 'Sin conexión';
  const secsAgo  = (Date.now() - new Date(f.last_active)) / 1000;
  const minsAgo  = secsAgo / 60;
  const hoursAgo = minsAgo / 60;
  const daysAgo  = hoursAgo / 24;
  const monthsAgo = daysAgo / 30.5;
  const yearsAgo  = daysAgo / 365;
  // is_playing usa la misma ventana de 120s que getStatusObj (no los 20s de
  // "online" de acá abajo) — sin esto, un jugador inactivo un rato en plena
  // partida (sin tocar nada 20-120s) seguía con la celda titilando en verde
  // (getStatusObj todavía lo clasifica "playing") pero el texto ya cambiaba
  // a "Hace 1 minuto" en vez de "Jugando", pese a seguir jugando de verdad.
  if (f.is_playing && secsAgo <= 120) return t('social.playing') || 'Jugando';
  if (secsAgo <= 20) return t('social.online') || 'En línea';
  let n, unit;
  if (yearsAgo >= 1)       { n = Math.round(yearsAgo);  unit = t(n === 1 ? 'social.unitYear'  : 'social.unitYears');  }
  else if (monthsAgo >= 1) { n = Math.round(monthsAgo); unit = t(n === 1 ? 'social.unitMonth' : 'social.unitMonths'); }
  else if (daysAgo >= 1)   { n = Math.round(daysAgo);   unit = t(n === 1 ? 'social.unitDay'   : 'social.unitDays');   }
  else if (hoursAgo >= 1)  { n = Math.round(hoursAgo);  unit = t(n === 1 ? 'social.unitHour'  : 'social.unitHours');  }
  else                     { n = Math.max(1, Math.round(minsAgo)); unit = t(n === 1 ? 'social.unitMin' : 'social.unitMins'); }
  return t('social.ago', { n, unit });
}

function updateSocialTabCounts() {
  const friendsTab  = document.getElementById('loading-social-tab-friends');
  const requestsTab = document.getElementById('loading-social-tab-requests');
  if (friendsTab)  friendsTab.textContent = `${t('social.tab.friends')} (${socialData.friends.length})`;
  if (requestsTab) requestsTab.textContent = `${t('social.tab.requests')} (${socialData.requests.length})`;
  _updateSocialBadge();
}

function _updateSocialBadge() {
  const badge = document.getElementById('social-notif-badge');
  if (!badge) return;
  const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
  const hasRequests = socialData.requests.length > 0;
  if (hasRequests && !panelOpen) {
    if (badge.style.display === 'none') {
      badge.style.display = 'flex';
      // re-trigger animation on each new appearance
      badge.style.animation = 'none';
      void badge.offsetWidth;
      badge.style.animation = '';
    }
  } else {
    badge.style.display = 'none';
  }

  // Detectar solicitudes nuevas y mostrar notificación banner (solo si panel cerrado)
  const currentIds = new Set(socialData.requests.map(r => r.friendshipId));
  if (_knownRequestIds !== null && panelOpen === false) {
    const newReqs = socialData.requests.filter(r => !_knownRequestIds.has(r.friendshipId));
    if (newReqs.length > 0) {
      _showFriendRequestNotif(newReqs[newReqs.length - 1]);
    }
  }
  _knownRequestIds = currentIds;
}

const _FREQ_NOTIF_MS = 10000;
let _freqNotifTimer   = null;
let _freqNotifReqId   = null;
let _freqNotifAcceptCb = null;
let _freqNotifDeclineCb = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('friend-req-notif-accept')?.addEventListener('click', () => {
    if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    const cb = _freqNotifAcceptCb;
    _dismissFriendRequestNotif();
    if (cb) cb();
  });
  document.getElementById('friend-req-notif-decline')?.addEventListener('click', () => {
    if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    const cb = _freqNotifDeclineCb;
    _dismissFriendRequestNotif();
    if (cb) cb();
  });
});

function _showFriendRequestNotif(req) {
  const banner = document.getElementById('friend-req-notif');
  const bar    = document.getElementById('friend-req-notif-bar');
  const nameEl = document.getElementById('friend-req-notif-name');
  const subEl  = document.getElementById('friend-req-notif-sub');
  if (!banner) return;

  _freqNotifReqId = req.friendshipId;

  const capturedFriendshipId = req.friendshipId;
  _freqNotifAcceptCb = async () => {
    try {
      await window.sbAcceptRequest(capturedFriendshipId);
      loadSocialData(false);
    } catch (e) { console.warn('[friendReqNotif] accept error:', e); }
  };
  _freqNotifDeclineCb = async () => {
    try {
      await window.sbDeleteFriendship(capturedFriendshipId);
      loadSocialData(false);
    } catch (e) { console.warn('[friendReqNotif] decline error:', e); }
  };

  if (nameEl) nameEl.textContent = req.name || '?';
  if (subEl)  subEl.textContent  = typeof t === 'function'
    ? t('social.sentYouRequest', 'te envió una solicitud de amistad')
    : 'te envió una solicitud de amistad';

  banner.style.display = 'block';
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }

  if (bar) {
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = 'width ' + _FREQ_NOTIF_MS + 'ms linear';
    bar.style.width = '0%';
  }

  clearTimeout(_freqNotifTimer);
  _freqNotifTimer = setTimeout(() => { _dismissFriendRequestNotif(); }, _FREQ_NOTIF_MS);
}

function _dismissFriendRequestNotif() {
  const banner = document.getElementById('friend-req-notif');
  if (banner) {
    banner.classList.add('leaving');
    setTimeout(() => { banner.style.display = 'none'; banner.classList.remove('leaving'); }, 300);
  }
  clearTimeout(_freqNotifTimer);
  _freqNotifReqId    = null;
  _freqNotifAcceptCb = null;
  _freqNotifDeclineCb = null;
}

// Carga todos los datos sociales desde Supabase y re-renderiza.
async function loadSocialData(showLoader = true) {
  if (!window._accountLoggedIn || !window._sbUserId) {
    socialData = { friends: [], requests: [], sent: [], blocked: [], blockedMe: [] };
    _knownRequestIds = null;
    renderSocial(); updateSocialTabCounts(); return;
  }
  if (showLoader) {
    const list = document.getElementById('loading-social-list');
    if (list) list.innerHTML = `<div class="loading-social-empty">${t('social.loadingUsers')}</div>`;
  }
  try {
    const _social = typeof window.withConnCheck === 'function'
      ? await window.withConnCheck(window.sbLoadSocialData(window._sbUserId), 6000)
      : await window.sbLoadSocialData(window._sbUserId);
    if (!_social) {
      // Sin conexión (viñeta de error ya mostrada): caer al último dato
      // guardado localmente en vez de dejar el panel vacío.
      const cached = _loadCachedSocialData();
      if (cached) socialData = cached;
      renderSocial(); updateSocialTabCounts(); return;
    }
    socialData = _social;
    try { localStorage.setItem('cachedSocialData', JSON.stringify(socialData)); } catch (e) {}
    if (typeof window.Friends !== 'undefined') {
      // Conservar id/last_active/is_playing: los paneles de invitar usan getFriends()
      // y necesitan el estado en vivo (conectado/jugando), igual que el panel social.
      window.Friends._setCache(socialData.friends.map(f => ({
        id: f.id, name: f.name, score: f.score, avatar: f.avatar || '',
        last_active: f.last_active || null, is_playing: f.is_playing || false,
      })));
    }
  } catch (e) {
    console.warn('[social] error cargando:', e.message);
  }
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
  updateSocialTabCounts();
  if (!document.getElementById('loading-blocked-group')?.classList.contains('table-gone')) renderBlockedList();
  if (!document.getElementById('loading-sent-group')?.classList.contains('table-gone'))    renderSentList();
  _subscribeFriendStatuses(socialData.friends.map(f => f.id));
  _startSocialListPoll();
  // Si el panel de detalle de amigo está abierto, sincronizar friendshipId y botones
  if (currentFriendProfile) {
    const all = [...socialData.friends, ...socialData.requests, ...socialData.sent, ...socialData.blocked];
    const fresh = all.find(x => x.id === currentFriendProfile.id);
    if (fresh) currentFriendProfile.friendshipId = fresh.friendshipId;
    if (typeof updateFriendButtons === 'function') updateFriendButtons();
  }
  window._socialDataFetched = true;
}

// Pinta la pestaña activa.
function renderSocial(filter = '') {
  if (socialActiveTab === 'requests') renderSocialRequests(filter);
  else renderSocialFriends(filter);
}

function renderSocialRequests(filter = '') {
  const list = document.getElementById('loading-social-list');
  if (!list) return;
  updateSocialTabCounts();
  const reqs = socialData.requests.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()));
  list.innerHTML = '';
  if (reqs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = t('social.noData');
    list.appendChild(empty);
    return;
  }
  reqs.forEach((f) => {
    const row = document.createElement('div');
    row.className = 'loading-social-row loading-social-request' + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(f.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = f.id;
    row.style.setProperty('--cust-cell', `url('${window.CustomizeAssets.cellUrl(f.cellCode)}')`);
    row.innerHTML =
      window._socialAvatarHtml(f.avatar, f.frameCode) +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${f.name}</span>` +
        `<span class="loading-social-status">${t('social.sentYouRequest')}</span>` +
      `</div>` +
      `<div class="loading-social-req-actions">` +
        `<button class="loading-social-req-btn accept" type="button" aria-label="Aceptar">✓</button>` +
        `<button class="loading-social-req-btn reject" type="button" aria-label="Rechazar">✕</button>` +
      `</div>`;
    row.querySelector('.accept').addEventListener('click', (e) => { e.stopPropagation(); respondRequest(f, true); });
    row.querySelector('.reject').addEventListener('click', (e) => { e.stopPropagation(); respondRequest(f, false); });
    row.addEventListener('click', () => openFriendProfile(f));
    list.appendChild(row);
  });
}

function respondRequest(friend, accepted) {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const op = accepted
    ? window.sbAcceptRequest(friend.friendshipId)
    : window.sbDeleteFriendship(friend.friendshipId);
  op.then(() => loadSocialData(false)).catch(e => console.warn('[social] respondRequest:', e));
}

// Click en el ojo de un amigo "Jugando": busca su match versus activo y, si es
// de un modo soportado (flags/shapes en v1), abre el panel de espectador. La
// policy RLS "matches_select_friends" es la que realmente decide si puedo leer
// esa fila — si no somos amigos aceptados, el select no devuelve nada.
// Ninguna partida versus (flags/shapes, rondas cortas con timer propio) tiene
// sentido seguir "active" más de esto — si el cierre normal (fin de partida /
// abandono de un jugador) no llegó a marcarla como tal (pestaña cerrada de
// golpe, crash, corte de red), quedaba "active" en la base PARA SIEMPRE. Como
// openSpectatorForFriend() siempre revisa esto ANTES de ir al espectador de
// partida individual, una fila así de vieja bloqueaba para siempre poder
// espectar a esa persona en modo solo — se quedaba colgado intentando abrir
// una partida versus fantasma que nadie está jugando.
const STALE_MATCH_MS = 20 * 60 * 1000; // 20 minutos

async function openSpectatorForFriend(f) {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  try {
    const { data, error } = await window.sb
      .from('matches')
      .select('id, mode, status, created_at')
      .or(`host_id.eq.${f.id},guest_id.eq.${f.id}`)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const isStale = data && (Date.now() - new Date(data.created_at).getTime()) > STALE_MATCH_MS;
    if (data && isStale) {
      // Autolimpieza: la primera persona que se topa con esto la corrige para
      // siempre (no hace falta arreglarla a mano en la base cada vez) — no se
      // espera la respuesta, no debe demorar el intento de espectar.
      window.sb.from('matches').update({ status: 'abandoned' }).eq('id', data.id).then(() => {}, () => {});
    }
    if (data && !isStale) {
      // Está en una partida VERSUS — los 4 modos ya tienen UI real de
      // espectador (REAL_UI_MODES los cubre a todos desde que se integró
      // Monuments), así que ya no hace falta filtrar por modo acá.
      if (typeof window.openSpectator === 'function') window.openSpectator(data.id, f);
      return;
    }
    // Sin match 1v1 activo — ¿está en un duelo GRUPAL (lobby de hasta 10)?
    // Requiere la policy "lobby_members_select_friends"/"lobbies_select_friends"
    // (ver supabase/group_spectator_mode.sql) para poder leerlo desde afuera.
    const { data: lobbyRows } = await window.sb
      .from('lobby_members')
      .select('lobby_id, l:lobby_id(id, status, created_at)')
      .eq('user_id', f.id)
      .limit(5);
    const activeLobby = (lobbyRows || []).map(r => r.l).find(l => l && l.status === 'active');
    if (activeLobby) {
      if (typeof window.openSpectatorGroup === 'function') window.openSpectatorGroup(activeLobby.id, f);
      return;
    }
    // Sin duelo grupal tampoco pero está "Jugando" → asumimos partida
    // individual (Gira Mundial/modo solo) y nos unimos directo a su canal
    // 'solo-{id}'.
    if (typeof window.openSpectatorSolo === 'function') window.openSpectatorSolo(f.id, f);
  } catch (e) {
    window.showGlobalToast('No se pudo abrir la partida.');
  }
}

function renderSocialFriends(filter = '') {
  const list = document.getElementById('loading-social-list');
  if (!list) return;
  updateSocialTabCounts();
  const favs = getSocialFavs();
  const sortFns = {
    conn:        (a, b) => getStatusObj(a.f).minsAgo - getStatusObj(b.f).minsAgo,
    'score-desc':(a, b) => b.f.score - a.f.score,
    'score-asc': (a, b) => a.f.score - b.f.score,
    'name-asc':  (a, b) => a.f.name.localeCompare(b.f.name),
    'name-desc': (a, b) => b.f.name.localeCompare(a.f.name),
  };
  const baseSort = sortFns[socialSort] || sortFns.conn;
  const friends = socialData.friends
    .filter(f => f.name.toLowerCase().includes(filter.toLowerCase()))
    .filter(f => !socialData.blocked.some(b => b.id === f.id))
    .map(f => ({ f }))
    .sort((a, b) => {
      const fa = favs.has(a.f.id) ? 0 : 1;
      const fb = favs.has(b.f.id) ? 0 : 1;
      return (fa - fb) || baseSort(a, b);
    });
  list.innerHTML = '';
  if (friends.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = t('social.noData');
    list.appendChild(empty);
    return;
  }
  friends.forEach(({ f }) => {
    const fav = favs.has(f.id);
    const st = getStatusObj(f);
    const row = document.createElement('div');
    row.className = 'loading-social-row status-' + st.cls + (fav ? ' is-fav' : '') + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(f.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = f.id;
    window.CustomizeAssets.applyCellForStatus(row, f.cellCode, st.cls);
    row.innerHTML =
      window._socialAvatarHtml(f.avatar, f.frameCode) +
      `<div class="loading-social-info">` +
        `<div class="loading-social-name-row">` +
          `<span class="loading-social-name">${fav ? '★ ' : ''}${f.name}</span>` +
        `</div>` +
        `<span class="loading-social-status"><span class="dot ${st.cls}"></span>${socialStatusText(f)}</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        (st.cls === 'playing' && !f.is_practicing ? `<img class="social-spectate-eye" src="images/spectate.png" alt="" draggable="false" oncontextmenu="return false" title="Ver partida">` : '') +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${f.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(f.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(f.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(f));
    const eyeBtn = row.querySelector('.social-spectate-eye');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', (e) => { e.stopPropagation(); openSpectatorForFriend(f); });
    }
    list.appendChild(row);
  });

  // Bloqueados al fondo
  socialData.blocked
    .filter(b => b.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach((b) => {
      const row = document.createElement('div');
      row.className = 'loading-social-row status-offline is-blocked-row';
      row.innerHTML =
        window._socialAvatarHtml(b.avatar, b.frameCode) +
        `<div class="loading-social-info">` +
          `<span class="loading-social-name">${b.name}</span>` +
          `<span class="loading-social-status">${t('social.blockedStatus')}</span>` +
        `</div>` +
        `<div class="loading-social-score">` +
          `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
          `<span class="loading-social-score-val">${b.score.toLocaleString()}</span>` +
        `</div>` +
        `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(b.score).name : '')}</span>` +
        `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(b.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
      row.addEventListener('click', () => openFriendProfile(b));
      list.appendChild(row);
    });
}

let _friendStatusInterval = null;

function _applyFriendPanelStatus(f) {
  const fg = document.getElementById('loading-friend-group');
  if (!fg || fg.classList.contains('table-gone')) return;
  const isOffline = getStatusObj(f).cls === 'offline';
  fg.classList.toggle('is-offline', isOffline);
  const statusEl = document.getElementById('loading-friend-status');
  if (statusEl && relStatus(f) === 'friend') {
    statusEl.textContent = socialStatusText(f);
    statusEl.className = 'loading-friend-status ' + getStatusObj(f).cls;
  }
}

function _startFriendStatusPoll(friendId) {
  clearInterval(_friendStatusInterval);
  _friendStatusInterval = setInterval(async () => {
    const fg = document.getElementById('loading-friend-group');
    if (!fg || fg.classList.contains('table-gone')) { clearInterval(_friendStatusInterval); return; }
    try {
      const { data } = await window.sb.from('profiles')
        .select('last_active,is_playing').eq('id', friendId).single();
      if (!data || !currentFriendProfile) return;
      currentFriendProfile.last_active = data.last_active;
      currentFriendProfile.is_playing  = data.is_playing;
      _applyFriendPanelStatus(currentFriendProfile);
    } catch(e) {}
  }, 10000);
}

// Abre el perfil de amigo con datos reales de Supabase.
function openFriendProfile(friend) {
  if (socialData.blockedMe.some(b => b.id === friend.id)) {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    currentFriendProfile = friend;
    _clearFriendPanel();
    const friendGroup = document.getElementById('loading-friend-group');
    if (friendGroup) friendGroup.classList.remove('table-gone');
    _showFriendPanelError(true);
    return;
  }
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  currentFriendProfile = friend;
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // Racha de GloboReto del amigo — no viene en los selects de la lista de
  // amigos/rankings (son parciales), así que se pide aparte, chiquito.
  if (window.sb && friend.id) {
    window.sb.from('profiles').select('gq_streak_count,gq_streak_last_date').eq('id', friend.id).single()
      .then(({ data }) => {
        if (typeof window.gqRefreshFriendStreakBadge === 'function') window.gqRefreshFriendStreakBadge(data);
      }).catch(() => {
        if (typeof window.gqRefreshFriendStreakBadge === 'function') window.gqRefreshFriendStreakBadge(null);
      });
  } else if (typeof window.gqRefreshFriendStreakBadge === 'function') {
    window.gqRefreshFriendStreakBadge(null);
  }

  const pic = document.getElementById('loading-friend-pic');
  if (pic) pic.src = friend.avatar;
  window.CustomizeAssets?.applyFrame(document.getElementById('loading-friend-pic-wrap'), friend.frameCode || '0001');
  const friendPanelImg = document.querySelector('#loading-friend-group .loading-howtotable');
  if (friendPanelImg) friendPanelImg.src = window.CustomizeAssets?.panelUrl(friend.panelCode || '0001');
  const fBadge = document.getElementById('loading-friend-supporter-badge');
  if (fBadge) fBadge.style.display = friend.is_supporter ? '' : 'none';
  setText('loading-friend-name', friend.name);
  setText('loading-friend-total', friend.score.toLocaleString());
  setText('loading-friend-play-count', tn('profile.friendPlayed', friend.play_count || 0));
  const fvsEl = document.getElementById('loading-friend-vs-record');
  if (fvsEl) {
    const fw = friend.vs_wins || 0, fl = friend.vs_losses || 0;
    if (fw > 0 || fl > 0) {
      fvsEl.style.display = '';
      fvsEl.innerHTML = t('profile.vsRecord', { w: `<span class="vs-w">${fw}</span>`, l: `<span class="vs-l">${fl}</span>` });
    } else {
      fvsEl.style.display = 'none';
    }
  }

  const modeHs  = [friend.hs_flags||0, friend.hs_shapes||0, friend.hs_cities||0, friend.hs_monuments||0];
  const avgSums  = [friend.avg_sum_flags||0, friend.avg_sum_shapes||0, friend.avg_sum_cities||0, friend.avg_sum_monuments||0];
  const avgCounts= [friend.play_count_flags||0, friend.play_count_shapes||0, friend.play_count_cities||0, friend.play_count_monuments||0];
  modeHs.forEach((hs, k) => {
    // loading-friend-avg* = Highscore column, loading-friend-hs* = Average column (inverted IDs in HTML)
    setText('loading-friend-avg' + (k + 1), hs.toLocaleString());
    const avg = avgCounts[k] > 0 ? Math.round(avgSums[k] / avgCounts[k]) : hs;
    setText('loading-friend-hs'  + (k + 1), avg.toLocaleString());
  });

  const rk = (typeof getRank === 'function') ? getRank(friend.score) : null;
  const rankImg = document.getElementById('loading-friend-rank');
  if (rankImg && rk) rankImg.src = rk.img;
  const rankLabel = document.getElementById('loading-friend-rank-label');
  if (rankLabel && rk) {
    rankLabel.textContent = rk.name;
    const maxWidth = (rankImg?.offsetWidth || 240) * 1.15;
    let size = 4;
    rankLabel.style.fontSize = size + 'cqmin';
    while (rankLabel.scrollWidth > maxWidth && size > 1.6) {
      size -= 0.1;
      rankLabel.style.fontSize = size + 'cqmin';
    }
  }

  const friendRankBadge = document.getElementById('loading-friend-rank-badge');
  const friendPlayCountEl = document.getElementById('loading-friend-play-count');
  if (friendRankBadge) {
    if (friend.id && typeof window.getGlobalRankForId === 'function') {
      window.getGlobalRankForId(friend.id).then(pos => {
        if (currentFriendProfile !== friend || !pos) { friendRankBadge.style.display = 'none'; _centerBadgeWithText(friendPlayCountEl, friendRankBadge, 'before'); return; }
        friendRankBadge.style.display = '';
        const cupEl = document.getElementById('loading-friend-rank-cup');
        const numEl = document.getElementById('loading-friend-rank-num');
        if (cupEl) cupEl.src = `images/cups/${window._cupForRank(pos)}.png`;
        if (numEl) numEl.textContent = '#' + pos;
        _centerBadgeWithText(friendPlayCountEl, friendRankBadge, 'before');
      }).catch(() => { friendRankBadge.style.display = 'none'; _centerBadgeWithText(friendPlayCountEl, friendRankBadge, 'before'); });
    } else {
      friendRankBadge.style.display = 'none';
      _centerBadgeWithText(friendPlayCountEl, friendRankBadge, 'before');
    }
  }
  const friendFlagBadge = document.getElementById('loading-friend-flag-badge');
  if (friendFlagBadge) {
    const flagUrl = window.flagUrlForCountryCode?.(friend.country_code);
    const friendNameWrap = document.querySelector('#loading-friend-group .loading-name-wrap');
    if (flagUrl) {
      friendFlagBadge.style.display = '';
      const img = document.getElementById('loading-friend-flag-badge-img');
      if (img) img.src = flagUrl;
      _centerBadgeWithText(friendNameWrap, friendFlagBadge, 'after');
    } else {
      friendFlagBadge.style.display = 'none';
      _centerBadgeWithText(friendNameWrap, friendFlagBadge, 'after');
    }
  }

  updateFriendButtons();
  const friendGroup = document.getElementById('loading-friend-group');
  if (friendGroup) {
    friendGroup.classList.remove('table-gone');
    _applyFriendPanelStatus(friend);
  }
  if (friend.id) _startFriendStatusPoll(friend.id);
}
window.openFriendProfile = openFriendProfile;

function _clearFriendPanel() {
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const pic = document.getElementById('loading-friend-pic');
  if (pic) pic.src = 'images/profilepic/ppdefault.png';
  const fBadge = document.getElementById('loading-friend-supporter-badge');
  if (fBadge) fBadge.style.display = 'none';
  setText('loading-friend-name', '');
  setText('loading-friend-total', '—');
  setText('loading-friend-play-count', '');
  [1,2,3,4].forEach(k => { setText('loading-friend-avg'+k,'—'); setText('loading-friend-hs'+k,'—'); });
  const rankImg = document.getElementById('loading-friend-rank');
  if (rankImg) rankImg.src = 'images/ranks/1.png';
  const rankLabel = document.getElementById('loading-friend-rank-label');
  if (rankLabel) rankLabel.textContent = '';
  const vsEl = document.getElementById('loading-friend-vs-record');
  if (vsEl) vsEl.style.display = 'none';
  const friendRankBadge = document.getElementById('loading-friend-rank-badge');
  if (friendRankBadge) friendRankBadge.style.display = 'none';
  const friendFlagBadge = document.getElementById('loading-friend-flag-badge');
  if (friendFlagBadge) friendFlagBadge.style.display = 'none';
  const statusEl = document.getElementById('loading-friend-status');
  if (statusEl) { statusEl.textContent = ''; statusEl.className = 'loading-friend-status'; }
  const actions = document.getElementById('loading-friend-actions');
  if (actions) actions.style.visibility = 'hidden';
}

function _showFriendPanelError(persistent = false) {
  const panel = document.getElementById('loading-friend-group');
  if (!panel) return;
  let overlay = panel.querySelector('.friend-error-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'friend-error-overlay';
    panel.appendChild(overlay);
  }
  overlay.textContent = typeof t === 'function'
    ? t('social.profileUnavailable', 'No se ha podido cargar el perfil, por favor inténtalo más tarde')
    : 'No se ha podido cargar el perfil, por favor inténtalo más tarde';
  overlay.classList.add('visible');
  if (!persistent) setTimeout(() => overlay.classList.remove('visible'), 3000);
}

// ── Botones de relación del perfil de amigo ───────────────────────────────────
function updateFriendButtons() {
  const actions  = document.getElementById('loading-friend-actions');
  const favBtn   = document.getElementById('loading-friend-fav');
  const relBtn   = document.getElementById('loading-friend-rel');
  const blockBtn = document.getElementById('loading-friend-block');
  if (!actions || !currentFriendProfile) return;
  const f = currentFriendProfile;
  const status = relStatus(f);
  const favs = getSocialFavs();

  const statusEl = document.getElementById('loading-friend-status');
  if (statusEl) {
    if (status === 'friend') {
      const st = getStatusObj(f);
      statusEl.style.display = '';
      statusEl.textContent = socialStatusText(f);
      statusEl.className = 'loading-friend-status ' + st.cls;
    } else {
      statusEl.style.display = 'none';
      statusEl.textContent = '';
    }
  }

  actions.classList.toggle('is-blocked', status === 'blocked');

  if (status === 'friend') {
    favBtn.classList.remove('hidden');
    favBtn.src = favs.has(f.id) ? 'images/bestfriend2.png' : 'images/bestfriend.png';
  } else {
    favBtn.classList.add('hidden');
  }

  if (status === 'friend')       relBtn.src = 'images/nofriend.png';
  else if (status === 'request') relBtn.src = 'images/friendreq.png';
  else if (status === 'sent')    relBtn.src = 'images/friendsent.png';
  else                           relBtn.src = 'images/friendadd.png';

  blockBtn.src = status === 'blocked' ? 'images/friendunblock.png' : 'images/friendblock.png';
}

// Popup de confirmación reutilizable (sí/no).
function showFriendConfirm(text, onYes, showClose = false, onNo = null) {
  const popup = document.getElementById('friend-confirm-popup');
  const txt   = document.getElementById('friend-confirm-text');
  const yes   = document.getElementById('friend-confirm-yes');
  const no    = document.getElementById('friend-confirm-no');
  const xbtn  = document.getElementById('friend-confirm-close');
  if (!popup) return;
  txt.textContent = text;
  popup.style.display = 'flex';
  if (xbtn) xbtn.style.display = showClose ? 'block' : 'none';
  const close = () => { popup.style.display = 'none'; yes.onclick = null; no.onclick = null; if (xbtn) xbtn.onclick = null; };
  yes.onclick = () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); close(); onYes(); };
  no.onclick  = () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); close(); if (onNo) onNo(); };
  if (xbtn) xbtn.onclick = () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); close(); };
}

function refreshSocialAfterRel() {
  updateFriendButtons();
  updateSocialTabCounts();
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
  renderBlockedList();
  renderSentList();
}

['loading-friend-fav', 'loading-friend-rel', 'loading-friend-block'].forEach(id => {
  document.getElementById(id)?.addEventListener('mouseenter', () => {
    sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  });
});

// Botón mejor amigo: alterna favorito.
document.getElementById('loading-friend-fav')?.addEventListener('click', () => {
  if (!currentFriendProfile || relStatus(currentFriendProfile) !== 'friend') return;
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const favs = getSocialFavs();
  if (favs.has(currentFriendProfile.id)) favs.delete(currentFriendProfile.id);
  else favs.add(currentFriendProfile.id);
  saveSocialFavs(favs);
  refreshSocialAfterRel();
});

// Aplica un cambio optimista a socialData y refresca el panel al instante,
// luego sincroniza con el servidor en background.
function _optimisticRelUpdate(action, fp) {
  const id = fp.id;
  const removeFromAll = () => {
    socialData.friends  = socialData.friends.filter(x => x.id !== id);
    socialData.requests = socialData.requests.filter(x => x.id !== id);
    socialData.sent     = socialData.sent.filter(x => x.id !== id);
    socialData.blocked  = socialData.blocked.filter(x => x.id !== id);
  };
  if (action === 'remove' || action === 'reject' || action === 'cancel' || action === 'unblock') {
    removeFromAll();
  } else if (action === 'block') {
    removeFromAll();
    socialData.blocked.push({ ...fp, friendshipId: fp.friendshipId });
  } else if (action === 'accept') {
    socialData.requests = socialData.requests.filter(x => x.id !== id);
    socialData.sent     = socialData.sent.filter(x => x.id !== id);
    socialData.friends.push({ ...fp });
  } else if (action === 'send') {
    socialData.sent.push({ ...fp, friendshipId: null });
  }
  updateFriendButtons();
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
  updateSocialTabCounts();
  if (!document.getElementById('loading-blocked-group')?.classList.contains('table-gone')) renderBlockedList();
  if (!document.getElementById('loading-sent-group')?.classList.contains('table-gone'))    renderSentList();
}

// Botón del medio: añadir / aceptar / cancelar / borrar amigo.
document.getElementById('loading-friend-rel')?.addEventListener('click', () => {
  if (!currentFriendProfile) return;
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const fp = currentFriendProfile;
  const status = relStatus(fp);
  if (status === 'blocked') return;
  if (status === 'friend') {
    showFriendConfirm(t('confirm.removeFriend', { name: fp.name }), () => {
      const favs = getSocialFavs(); favs.delete(fp.id); saveSocialFavs(favs);
      _optimisticRelUpdate('remove', fp);
      // No llamar loadSocialData en .then(): el delete y el re-fetch inmediato
      // tienen race condition (Supabase aún no propagó el write a la capa de lectura).
      // El optimistic update ya removió el amigo. El Realtime event confirma después.
      window.sbDeleteFriendship(fp.friendshipId, window._sbUserId, fp.id)
        .catch(e => { console.warn('[social] removeFriend:', e); loadSocialData(false); });
    });
  } else if (status === 'request') {
    showFriendConfirm(t('confirm.acceptRequest', { name: fp.name }), () => {
      _optimisticRelUpdate('accept', fp);
      window.sbAcceptRequest(fp.friendshipId)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] acceptRequest:', e); loadSocialData(false); });
    }, true, () => {
      _optimisticRelUpdate('reject', fp);
      window.sbDeleteFriendship(fp.friendshipId, window._sbUserId, fp.id)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] rejectRequest:', e); loadSocialData(false); });
    });
  } else if (status === 'sent') {
    showFriendConfirm(t('confirm.cancelSent', { name: fp.name }), () => {
      _optimisticRelUpdate('cancel', fp);
      window.sbDeleteFriendship(fp.friendshipId, window._sbUserId, fp.id)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] cancelSent:', e); loadSocialData(false); });
    });
  } else {
    _optimisticRelUpdate('send', fp);
    window.sbSendFriendRequest(window._sbUserId, fp.name)
      .then(() => loadSocialData(false))
      .catch(e => { console.warn('[social] sendRequest:', e); loadSocialData(false); _showFriendPanelError(); });
  }
});

// Botón bloquear / desbloquear.
document.getElementById('loading-friend-block')?.addEventListener('click', () => {
  if (!currentFriendProfile) return;
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const fp = currentFriendProfile;
  const status = relStatus(fp);
  if (status === 'blocked') {
    showFriendConfirm(t('confirm.unblock', { name: fp.name }), () => {
      _optimisticRelUpdate('unblock', fp);
      window.sbDeleteFriendship(fp.friendshipId, window._sbUserId, fp.id)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] unblock:', e); loadSocialData(false); });
    });
  } else {
    showFriendConfirm(t('confirm.block', { name: fp.name }), () => {
      const favs = getSocialFavs(); favs.delete(fp.id); saveSocialFavs(favs);
      _optimisticRelUpdate('block', fp);
      window.sbBlockUser(window._sbUserId, fp.id, fp.friendshipId)
        .then(() => loadSocialData(false))
        .catch(e => { console.warn('[social] block:', e); loadSocialData(false); });
    });
  }
});

document.getElementById('loading-friend-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-friend-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  clearInterval(_friendStatusInterval);
  const friendGroup = document.getElementById('loading-friend-group');
  friendGroup?.classList.add('table-gone');
  friendGroup?.querySelector('.friend-error-overlay')?.classList.remove('visible');
  const actions = document.getElementById('loading-friend-actions');
  if (actions) actions.style.visibility = '';
});

document.getElementById('loading-social-search-input')?.addEventListener('input', (e) => {
  renderSocial(e.target.value);
});

const SOCIAL_SORTS = [
  { value: 'conn',       key: 'sort.conn'      },
  { value: 'score-desc', key: 'sort.scoreDesc' },
  { value: 'score-asc',  key: 'sort.scoreAsc'  },
  { value: 'name-asc',   key: 'sort.nameAsc'   },
  { value: 'name-desc',  key: 'sort.nameDesc'  },
];
function socialSortLabel() {
  const cur = SOCIAL_SORTS.find(s => s.value === socialSort);
  return cur ? t(cur.key) : t('sort.conn');
}
document.getElementById('loading-social-sort')?.addEventListener('click', () => {
  const s = sfxSelect.cloneNode();
  s.volume = sfxSelect.volume;
  s.play();
  const idx = SOCIAL_SORTS.findIndex(s => s.value === socialSort);
  const next = SOCIAL_SORTS[(idx + 1) % SOCIAL_SORTS.length];
  socialSort = next.value;
  localStorage.setItem('socialSort', socialSort);
  const btn = document.getElementById('loading-social-sort');
  if (btn) btn.textContent = socialSortLabel();
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

(() => {
  const btn = document.getElementById('loading-social-sort');
  if (btn) btn.textContent = socialSortLabel();
})();

document.getElementById('loading-social-tab-friends')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  socialActiveTab = 'friends';
  document.querySelectorAll('.loading-social-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('loading-social-tab-friends').classList.add('active');
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

document.getElementById('loading-social-tab-requests')?.addEventListener('click', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
  socialActiveTab = 'requests';
  document.querySelectorAll('.loading-social-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('loading-social-tab-requests').classList.add('active');
  renderSocial(document.getElementById('loading-social-search-input')?.value || '');
});

// ── Panel Añadir Amigo ────────────────────────────────────────────────────────
document.getElementById('loading-social-invite')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const input = document.getElementById('loading-addfriend-input');
  const fb = document.getElementById('loading-addfriend-feedback');
  if (input) input.value = '';
  if (fb) fb.className = 'loading-addfriend-feedback';
  document.getElementById('loading-addfriend-group')?.classList.remove('table-gone');
  input?.focus();
});

let _sendingFriendRequest = false;
async function sendFriendRequest() {
  // Guard real: el botón se deshabilita pero el input tiene su propio listener
  // de Enter que llama esta función directo (sin pasar por el <button>), así
  // que "disabled" solo no alcanza para evitar pedidos superpuestos.
  if (_sendingFriendRequest) return;
  const input = document.getElementById('loading-addfriend-input');
  const fb = document.getElementById('loading-addfriend-feedback');
  const name = (input?.value || '').trim();
  if (!fb) return;
  if (!name) {
    fb.textContent = t('social.typeName');
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  if (!window._accountLoggedIn || !window._sbUserId) {
    fb.textContent = 'Debes iniciar sesión';
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  const myName = window._sbProfile?.username || '';
  if (name.toLowerCase() === myName.toLowerCase()) {
    fb.textContent = 'No puedes agregarte a ti mismo';
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  if (socialData.sent.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    fb.textContent = t('social.alreadySent');
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  if (socialData.friends.some(f => f.name.toLowerCase() === name.toLowerCase()) ||
      socialData.requests.some(r => r.name.toLowerCase() === name.toLowerCase())) {
    fb.textContent = t('social.alreadyInList');
    fb.className = 'loading-addfriend-feedback err show';
    return;
  }
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  _sendingFriendRequest = true;
  const sendBtn = document.getElementById('loading-addfriend-send');
  // Nada de texto de feedback acá: el botón ya dice "Enviando..." — mostrar lo
  // mismo abajo (sin color definido en el CSS para este estado, salía en
  // blanco/ilegible) era redundante y confuso.
  fb.textContent = '';
  fb.className = 'loading-addfriend-feedback';
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = t('social.sending');
    sendBtn.style.opacity = '0.6';
    sendBtn.style.cursor = 'not-allowed';
    sendBtn.style.pointerEvents = 'none';
  }
  if (input) input.disabled = true;
  try {
    // .then(() => true): sbSendFriendRequest resuelve undefined en éxito (no
    // retorna nada), que chocaría con el undefined que usa withConnTimeout
    // para marcar timeout — con esto, éxito real siempre es `true`.
    const _p = window.sbSendFriendRequest(window._sbUserId, name).then(() => true);
    const result = typeof window.withConnTimeout === 'function' ? await window.withConnTimeout(_p, 6000) : await _p;
    if (result === undefined) return; // timeout: viñeta de error ya mostrada, no hay nada más que decir acá
    fb.textContent = t('social.requestSent', { name });
    fb.className = 'loading-addfriend-feedback ok show';
    if (input) input.value = '';
    await loadSocialData(false);
  } catch (e) {
    fb.textContent = e.message === 'Usuario no encontrado' ? 'Usuario no encontrado' : 'Ha ocurrido un error, por favor inténtelo más tarde';
    fb.className = 'loading-addfriend-feedback err show';
  } finally {
    _sendingFriendRequest = false;
    if (input) input.disabled = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = t('social.sendRequest');
      sendBtn.style.opacity = '';
      sendBtn.style.cursor = '';
      sendBtn.style.pointerEvents = '';
    }
  }
}

document.getElementById('loading-addfriend-send')?.addEventListener('click', sendFriendRequest);
document.getElementById('loading-addfriend-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendFriendRequest(); }
});

document.getElementById('loading-addfriend-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-addfriend-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-addfriend-group')?.classList.add('table-gone');
});

// ── Tablero de bloqueados ─────────────────────────────────────────────────────
let blockedSort = 'az';
function renderBlockedList() {
  const list = document.getElementById('loading-blocked-list');
  if (!list) return;
  const filter = (document.getElementById('loading-blocked-search-input')?.value || '').toLowerCase();
  list.innerHTML = '';
  const entries = socialData.blocked
    .filter(b => b.name.toLowerCase().includes(filter))
    .slice()
    .sort((a, b) => blockedSort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = socialData.blocked.length === 0 ? t('social.noBlocked') : t('social.noResults');
    list.appendChild(empty);
    return;
  }
  entries.forEach((b) => {
    const row = document.createElement('div');
    row.className = 'loading-social-row is-blocked-row' + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(b.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = b.id;
    row.style.setProperty('--cust-cell', `url('${window.CustomizeAssets.cellUrl(b.cellCode)}')`);
    row.innerHTML =
      window._socialAvatarHtml(b.avatar, b.frameCode) +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${b.name}</span>` +
        `<span class="loading-social-status">${t('social.blockedStatus')}</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${b.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(b.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(b.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(b));
    list.appendChild(row);
  });
}

// Bloquea/restaura los clicks de la lista de amigos.
function setSocialListClickable(on) {
  const list = document.getElementById('loading-social-list');
  if (list) list.style.pointerEvents = on ? '' : 'none';
}

document.getElementById('loading-social-blockbtn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  renderBlockedList();
  setSocialListClickable(false);
  document.getElementById('loading-blocked-group')?.classList.remove('table-gone');
});
document.getElementById('loading-social-blockbtn')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

document.getElementById('loading-blocked-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-blocked-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-blocked-group')?.classList.add('table-gone');
  setSocialListClickable(true);
});

document.getElementById('loading-blocked-search-input')?.addEventListener('input', () => renderBlockedList());

document.getElementById('loading-blocked-sort')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  blockedSort = blockedSort === 'az' ? 'za' : 'az';
  const btn = document.getElementById('loading-blocked-sort');
  if (btn) btn.textContent = blockedSort === 'az' ? 'A-Z' : 'Z-A';
  renderBlockedList();
});
document.getElementById('loading-blocked-sort')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

// ── Tablero de solicitudes enviadas (pendientes) ──────────────────────────────
let sentSort = 'az';
function renderSentList() {
  const list = document.getElementById('loading-sent-list');
  if (!list) return;
  const filter = (document.getElementById('loading-sent-search-input')?.value || '').toLowerCase();
  list.innerHTML = '';
  const entries = socialData.sent
    .filter(s => s.name.toLowerCase().includes(filter))
    .slice()
    .sort((a, b) => sentSort === 'za' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loading-social-empty';
    empty.textContent = socialData.sent.length === 0 ? t('social.noSent') : t('social.noResults');
    list.appendChild(empty);
    return;
  }
  entries.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'loading-social-row' + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(s.cellCode) ? ' cell-light-text' : '');
    row.dataset.friendId = s.id;
    row.style.setProperty('--cust-cell', `url('${window.CustomizeAssets.cellUrl(s.cellCode)}')`);
    row.innerHTML =
      window._socialAvatarHtml(s.avatar, s.frameCode) +
      `<div class="loading-social-info">` +
        `<span class="loading-social-name">${s.name}</span>` +
        `<span class="loading-social-status">${t('social.pendingStatus')}</span>` +
      `</div>` +
      `<div class="loading-social-score">` +
        `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="loading-social-score-val">${s.score.toLocaleString()}</span>` +
      `</div>` +
      `<span class="loading-social-rankname">${(typeof getRank === 'function' ? getRank(s.score).name : '')}</span>` +
      `<img class="loading-social-emote" src="${(typeof getRank === 'function' ? getRank(s.score).img : 'images/ranks/1.png')}" alt="" draggable="false" oncontextmenu="return false">`;
    row.addEventListener('click', () => openFriendProfile(s));
    list.appendChild(row);
  });
}

document.getElementById('loading-social-sentbtn')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  renderSentList();
  setSocialListClickable(false);
  document.getElementById('loading-sent-group')?.classList.remove('table-gone');
});
document.getElementById('loading-social-sentbtn')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

document.getElementById('loading-sent-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.getElementById('loading-sent-back-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-sent-group')?.classList.add('table-gone');
  setSocialListClickable(true);
});

document.getElementById('loading-sent-search-input')?.addEventListener('input', () => renderSentList());

document.getElementById('loading-sent-sort')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  sentSort = sentSort === 'az' ? 'za' : 'az';
  const btn = document.getElementById('loading-sent-sort');
  if (btn) btn.textContent = sentSort === 'az' ? 'A-Z' : 'Z-A';
  renderSentList();
});
document.getElementById('loading-sent-sort')?.addEventListener('mouseenter', () => {
  sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
});

// Al cambiar idioma, re-renderizar el contenido dinámico del panel social/perfil.
if (typeof onLangChange === 'function') onLangChange(() => {
  try { const sb = document.getElementById('loading-social-sort'); if (sb) sb.textContent = socialSortLabel(); } catch (e) {}
  try { updateSocialTabCounts(); } catch (e) {}
  try { renderSocial(document.getElementById('loading-social-search-input')?.value || ''); } catch (e) {}
  try { renderBlockedList(); } catch (e) {}
  try { renderSentList(); } catch (e) {}
  try { if (typeof refreshProfileStats === 'function') refreshProfileStats(); } catch (e) {}
  try { updateFriendButtons(); } catch (e) {}
  try { _updateProfileBtnLabel(); } catch (e) {}
});

// Efecto UNIVERSAL de "se acabó el tiempo" sobre una cartilla del leaderboard:
// temblorcito (reusa lb-shake, el mismo del efecto de "wrong") + un ícono de
// cronómetro encima que hace fade in y fade out unos segundos después. Recibe
// el elemento de la cartilla ya resuelto — cada contexto (versus 1v1/grupo,
// espectador 1v1/grupo) lo llama con la celda del jugador que se quedó sin
// tiempo, igual que el emote de "wrong" pero disparado por el timesup.
window._applyTimesUpEffect = function (el) {
  if (!el) return;
  el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'lb-shake 0.45s ease-in-out';
  setTimeout(() => { if (el.style.animation && el.style.animation.indexOf('lb-shake') !== -1) el.style.animation = ''; }, 480);
  const prev = el.querySelector('.lb-timesup-icon');
  if (prev) { clearTimeout(prev._t1); clearTimeout(prev._t2); prev.remove(); }
  const icon = document.createElement('div');
  icon.className = 'lb-timesup-icon';
  icon.textContent = '⏱️';
  el.appendChild(icon);
  requestAnimationFrame(() => icon.classList.add('show'));
  icon._t1 = setTimeout(() => {
    icon.classList.remove('show');
    icon._t2 = setTimeout(() => { icon.remove(); }, 400);
  }, 2400);
};

// Cada modo registra aquí cómo detener sus loops (timers/animaciones)
window.gameStoppers = window.gameStoppers || [];
window.gameStoppers.push(() => {
  try { pregameAborted = true; clearTimeout(pregameTimeout); pregameTimeout = null; } catch (e) {}
  try { gameAborted = true; clearTimeout(endGameTimeout1); clearTimeout(endGameTimeout2); } catch (e) {}
  try { clearInterval(timerIntervalId); timerIntervalId = null; } catch (e) {}
  try { if (animFrameId) cancelAnimationFrame(animFrameId); animFrameId = null; } catch (e) {}
  if (window._powerQuitOverlay) {
    // Bloquear canvas durante el overlay de game over de práctica
    try { mapGameOver = true; } catch (e) {}
    try { if (state) state.phase = 'idle'; } catch (e) {}
    try { if (canvas) canvas.style.pointerEvents = 'none'; } catch (e) {}
    // Detener el titilo del countdown
    try { if (countdownImg) countdownImg.style.animationPlayState = 'paused'; } catch (e) {}
  } else {
    // Sin este else, un endGame() legítimo (timeLeft llegó a 0 de verdad,
    // recalculado al volver de una pestaña en 2do plano, ver visibilitychange
    // más abajo) deja canvas.style.pointerEvents='none' puesto — startGame()
    // lo restaura recién al arrancar una ronda nueva, así que si quedaba algo
    // a medio camino (secuencia de TIMES UP interrumpida por el propio quit)
    // el canvas quedaba sordo a los clicks para siempre sin ningún indicio
    // visual (reportado: "vuelvo de otra pestaña y no puedo clickear nada,
    // se ve todo normal"). mapGameOver también se reseteaba solo en startGame().
    try { mapGameOver = false; } catch (e) {}
    try { if (canvas) canvas.style.pointerEvents = ''; } catch (e) {}
  }
  try { if (typeof pregameCountdownEl !== 'undefined' && pregameCountdownEl) pregameCountdownEl.style.display = 'none'; } catch (e) {}
  try { if (typeof timeupOverlay !== 'undefined' && timeupOverlay) { timeupOverlay.style.display = 'none'; timeupOverlay.classList.remove('timeup-in','timeup-out'); } } catch (e) {}
  // Ocultar el contenedor del juego de Cities/Monuments (#game-wrapper: canvas,
  // mapa, cartel de ciudad, nombre de monumento, etc.) — el gameStopper solo
  // paraba timers, no ocultaba los assets; al encadenar a OTRO modo (ej.
  // cities→siluetas) esos assets quedaban pegados de fondo (reportado). No se
  // toca si _vsShowingResult (assets a propósito visibles bajo la tabla de
  // resultados, igual que respetan los *HardReset) ni si _powerQuitOverlay
  // (el mapa tiene que seguir de fondo durante el game over de práctica al
  // salir con power; recién se oculta en quitToMenu() al volver al menú).
  try {
    if (!window._vsShowingResult && !window._powerQuitOverlay) {
      const gw = document.getElementById('game-wrapper');
      if (gw) gw.style.display = 'none';
    }
  } catch (e) {}
});

window.resetEntranceElements = function () {
  // Cancelar cualquier timer pendiente de hidePracticePanel para evitar race conditions
  if (typeof _hidePracticeTimer !== 'undefined') { clearTimeout(_hidePracticeTimer); _hidePracticeTimer = null; }
  const fa = document.querySelector('.flightatt-loading');
  const sh = document.querySelector('.flightatt-loading-shadow');
  const pw = document.querySelector('.loading-plane-wrap');
  const lg = document.querySelector('.loading-logo');
  const pl = document.querySelector('.loading-planet-wrap');
  [fa, sh, pw, lg, pl].forEach(el => el && el.getAnimations().forEach(a => a.cancel()));
  if (fa) { fa.classList.remove('entered');               fa.style.transform = 'translate(-50%,-50%) scaleX(-1) translateX(55cqmin)'; }
  if (sh) { sh.classList.remove('entered');               sh.style.transform = 'translate(-50%,-50%) translateX(-55cqmin)'; }
  if (pw) { pw.classList.remove('plane-ready','plane-above'); pw.style.transform = 'translate(-50%,-50%) translateY(32cqmin)'; pw.style.display = ''; }
  if (lg) { lg.classList.remove('logo-ready','panel2-logo'); lg.style.opacity = '0'; lg.style.transform = 'translateX(-50%) scale(1.5)'; lg.style.display = ''; }
  if (pl) { pl.classList.remove('planet-ready');          pl.style.opacity = '0'; pl.style.transform = 'translateX(-50%) scale(1.25)'; }
  // Restaurar elementos del primer panel que pudo haber ocultado el Play
  const ver = document.getElementById('loading-version');
  if (ver) ver.style.display = '';
  const back2 = document.getElementById('loading-panel2-back');
  if (back2) back2.style.display = 'none';
  const wt2 = document.getElementById('loading-panel2-worldtour');
  if (wt2) wt2.style.display = 'none';
  const vs2 = document.getElementById('loading-panel2-versus');
  if (vs2) vs2.style.display = 'none';
  const pr2 = document.getElementById('loading-panel2-practice');
  if (pr2) pr2.style.display = 'none';
  const t2r = document.getElementById('loading-panel2-text2');
  if (t2r) t2r.style.display = 'none';
  const lpg = document.getElementById('loading-practice-group');
  if (lpg) lpg.style.display = 'none';
  // Cerrar cualquier sub-panel que haya quedado abierto (profile, social, amigos…)
  ['loading-table-group','loading-social-group','loading-friend-group',
   'loading-addfriend-group','loading-blocked-group','loading-sent-group']
    .forEach(id => document.getElementById(id)?.classList.add('table-gone'));
  document.getElementById('loading-screen')?.classList.remove('table-shown');
  if (typeof window.hideVersusPanel === 'function') window.hideVersusPanel();
};

// Muestra el loading en el panel2 de práctica sin animar (retorno desde práctica)
window.showEntranceElementsStatic = function () {
  const fa = document.querySelector('.flightatt-loading');
  const sh = document.querySelector('.flightatt-loading-shadow');
  const pw = document.querySelector('.loading-plane-wrap');
  const lg = document.querySelector('.loading-logo');
  const pl = document.querySelector('.loading-planet-wrap');

  [fa, sh, pw, lg, pl].forEach(el => el && el.getAnimations().forEach(a => a.cancel()));

  // Flightatt y sombra: posición final visible (panel2 las muestra)
  if (fa) { fa.style.transform = 'translate(-50%,-50%) scaleX(-1) translateX(0)'; fa.style.opacity = ''; }
  if (sh) { sh.style.transform = 'translate(-50%,-50%) translateX(0)'; sh.style.opacity = ''; }
  // Avión y logo: invisibles con opacity (display queda '', así back-button los restaura sin luchar con display:none)
  if (pw) { pw.style.display = ''; pw.style.opacity = '0'; pw.style.transform = 'translate(-50%,-50%) translateY(32cqmin)'; }
  if (lg) { lg.style.display = ''; lg.style.opacity = '0'; lg.style.transform = 'translateX(-50%) scale(1.5)'; }
  // Planeta visible
  if (pl) { pl.style.transform = 'translateX(-50%) scale(1)'; pl.style.opacity = '1'; }

  const ver = document.getElementById('loading-version');
  if (ver) ver.style.display = '';

  // Ocultar acciones panel1; mostrar panel2 directamente
  document.getElementById('loading-actions') && (document.getElementById('loading-actions').style.display = 'none');
  const back2 = document.getElementById('loading-panel2-back');
  if (back2) back2.style.display = '';
  const wt2 = document.getElementById('loading-panel2-worldtour');
  if (wt2) wt2.style.display = '';
  const vs2s = document.getElementById('loading-panel2-versus');
  if (vs2s) vs2s.style.display = '';
  const pr2 = document.getElementById('loading-panel2-practice');
  if (pr2) pr2.style.display = '';
  const t2r = document.getElementById('loading-panel2-text2');
  if (t2r) t2r.style.display = '';

  // account-btn solo en panel1 — ocultarlo en panel2
  const acct = document.getElementById('profile-account-btn');
  if (acct) acct.style.display = 'none';
  const gq = document.getElementById('globequiz-btn');
  if (gq) gq.style.display = 'none';
  const resultsBtn = document.getElementById('loading-results-btn');
  if (resultsBtn) resultsBtn.style.display = 'none';
};

window.replayEntranceAnimations = function () {
  const flightEl   = document.querySelector('.flightatt-loading');
  const shadowEl   = document.querySelector('.flightatt-loading-shadow');
  const planeWrap  = document.querySelector('.loading-plane-wrap');
  const logo       = document.querySelector('.loading-logo');
  const planetWrap = document.querySelector('.loading-planet-wrap');

  if (planeWrap) planeWrap.classList.remove('plane-above');

  // Restaurar display (puede haber quedado none por showEntranceElementsStatic)
  if (planeWrap) planeWrap.style.display = '';
  if (logo) logo.style.display = '';

  // Limpiar inline styles del reset de quitToMenu; WAAPI toma el control desde from
  [flightEl, shadowEl, planeWrap, logo, planetWrap].forEach(el => {
    if (!el) return;
    el.style.transform = '';
    el.style.opacity   = '';
  });

  const opts700 = { duration: 700, easing: 'ease-out', fill: 'forwards' };
  const opts500 = { duration: 500, easing: 'ease-out', fill: 'forwards' };

  if (flightEl) flightEl.animate([
    { transform: 'translate(-50%,-50%) scaleX(-1) translateX(55cqmin)' },
    { transform: 'translate(-50%,-50%) scaleX(-1) translateX(0)' }
  ], opts700);

  if (shadowEl) shadowEl.animate([
    { transform: 'translate(-50%,-50%) translateX(-55cqmin)' },
    { transform: 'translate(-50%,-50%) translateX(0)' }
  ], opts700);

  if (planeWrap) {
    const anim = planeWrap.animate([
      { transform: 'translate(-50%,-50%) translateY(32cqmin)' },
      { transform: 'translate(-50%,-50%) translateY(0)' }
    ], opts700);
    anim.onfinish = () => planeWrap.classList.add('plane-above');
  }

  if (logo) logo.animate([
    { transform: 'translateX(-50%) scale(1.5)', opacity: '0' },
    { transform: 'translateX(-50%) scale(1)',   opacity: '1' }
  ], opts700);

  if (planetWrap) planetWrap.animate([
    { transform: 'translateX(-50%) scale(1.25)', opacity: '0' },
    { transform: 'translateX(-50%) scale(1)',    opacity: '1' }
  ], opts500);

  const resultsBtn = document.getElementById('loading-results-btn');
  if (resultsBtn) resultsBtn.style.display = 'block';

  // Restaurar elementos del primer panel (pueden haber quedado ocultos por el panel2)
  const actions = document.getElementById('loading-actions');
  if (actions) actions.style.display = 'flex';
  const acct = document.getElementById('profile-account-btn');
  if (acct) acct.style.display = 'block';
  const gq = document.getElementById('globequiz-btn');
  if (gq) gq.style.display = 'block';
  if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
  const ver = document.getElementById('loading-version');
  if (ver) ver.style.display = '';
};

// Termina la partida en curso (cualquier modo) y vuelve al menú principal sin recargar.
function quitToMenu() {
  window._setPlaying(false);
  // Si salgo de una partida versus en curso, avisar al rival (gana por abandono)
  if (window._vsActive && typeof window._vsAbandon === 'function') {
    try { window._vsAbandon(); } catch (e) {}
  }
  // Si salgo de una partida de lobby en curso, abandonar la sala
  if (window._lobbyActive && typeof window._lobbyAbandon === 'function') {
    try { window._lobbyAbandon(); } catch (e) {}
  }
  // Invalida cualquier callback diferido (nextCity, pines, badges, etc.) en vuelo
  window.gameSession = (window.gameSession || 0) + 1;

  // 1) Detener loops (timers/animaciones) de todos los modos
  window.gameStoppers.forEach(fn => { try { fn(); } catch (e) {} });

  // Capturar _wasInPractice ANTES de gameStoppers (por si alguno toca practiceConfig)
  const _wasInPractice = window.practiceConfig && window.practiceConfig.active;

  // 2) Cortar TODO el audio del juego y poner la música del menú
  [sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus,
   sfxTickdown, sfxTimesUp, sfxGameMusic].forEach(s => {
    try { if (s) { s.pause(); s.currentTime = 0; } } catch (e) {}
  });
  try { playMusic(sfxMenuMusic); } catch (e) {}

  // 3) Resetear el estado de juego de monuments/cities
  // Desactivar práctica ANTES de resetState para que no filtre las colas normales
  const _practiceScore = (() => {
    let sc = 0;
    try { sc = (typeof state !== 'undefined' && state) ? state.score : 0; } catch(e) {}
    try { if (window.pendingGameMode === 'flags'  && typeof flagsScore  !== 'undefined') sc = Math.round(flagsScore); } catch(e) {}
    try { if (window.pendingGameMode === 'shapes' && typeof shapesScore !== 'undefined') sc = Math.round(shapesScore); } catch(e) {}
    return sc;
  })();
  if (_wasInPractice) { window.practiceConfig.active = false; document.body.classList.remove('practice-mode'); }
  try { resetState(); } catch (e) {}

  // 4) Limpiar diálogos, overlays, animaciones y movimiento ingame
  const reset = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  reset('city-tag',         el => { el.style.left = tpx(-525); });
  reset('result-label',     el => { el.textContent = ''; el.style.animation = ''; });
  reset('coord-tooltip',    el => { el.style.display = 'none'; });
  reset('monument-img',     el => { el.style.display = 'none'; });
  reset('speed-bonus-text', el => el.classList.remove('visible'));
  reset('flags-speed-bonus-text', el => el.classList.remove('visible'));
  // Refrescar amigos antes de reconstruir la barra — mismo motivo que en
  // flags.js: sin esto, el cardCode/avatar de cada amigo quedaba pegado al
  // de la última vez que se cargó la lista (login o panel social), y un
  // cambio de carta reciente del amigo no se reflejaba en toda la sesión.
  if (typeof loadFriends === 'function') loadFriends();
  // Reconstruir la barra de amigos (no vaciarla: shapes/cities no la re-inicializan
  // por partida, solo la reposicionan, así que vaciarla la dejaría vacía).
  try { initLeaderboard(); } catch (e) {}
  reset('pregame-countdown',       el => { el.style.display = 'none'; });
  reset('flags-pregame-countdown', el => { el.style.display = 'none'; });
  reset('timeup-overlay',       el => { el.style.display = 'none'; el.classList.remove('timeup-in','timeup-out'); });
  reset('flags-timeup-overlay', el => { el.style.display = 'none'; el.classList.remove('timeup-in','timeup-out'); });
  reset('powerquit-overlay',    el => { el.style.display = 'none'; el.classList.remove('timeup-in','timeup-out'); });
  reset('flags-check-overlay',  el => { el.classList.remove('animate'); el.style.display = 'none'; el.style.opacity = ''; });
  reset('flags-wrong-overlay',  el => { el.classList.remove('animate'); el.style.display = 'none'; el.style.opacity = ''; });
  // Apagar los puntos del progreso y el "trencito" (todos los modos)
  document.querySelectorAll('.dot').forEach(d => d.classList.remove('filled'));
  ['progress-dots','flags-progress-dots'].forEach(id => {
    document.getElementById(id)?.classList.remove('train-animation', 'dots-fade-out');
  });
  // Limpiar el canvas principal (puntos, pines, partículas, badges dibujados)
  try { if (typeof ctx !== 'undefined' && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); } catch (e) {}

  // 5) Resetear el estado de los diálogos del splash (pregame)
  try { confirmStep = 0; } catch (e) {}
  document.querySelector('.splash-howtoplay-wrap')?.classList.remove('slide-down');
  const lbl = document.querySelector('.splash-text2-label');
  if (lbl) { lbl.classList.remove('step2'); lbl.textContent = ''; }
  document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap')
    .forEach(el => el.classList.remove('animate-in'));

  // 6) Cortar música/animaciones de campaña
  // Se abandona a mitad de camino: se descartan los highscores pendientes de
  // esta corrida (no se persisten hasta completar la Vuelta Mundial entera).
  if (window.campaign) { window.campaign.active = false; window.campaign.pendingHS = {}; }

  // 7) Ocultar todas las pantallas de juego/resultados y el HUD
  ['game-wrapper','flags-wrapper','splash-screen','gameover-screen','results-screen',
   'final-screen','score-display','right-panel','flags-score-display',
   'flags-right-panel','new-highscore-banner','countdown-widget',
   'flags-countdown-widget','shapes-countdown-widget'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // 8) Mostrar el menú principal limpio
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();

  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.display = _wasInPractice ? 'flex' : ''; ls.style.opacity = '1'; ls.classList.remove('table-shown'); }

  // Si salimos con power desde modo práctica → score popup + panel práctica
  if (_wasInPractice) {
    const _pm = window.pendingGameMode;
    const [_prCorrect, _prWrong] = _pm === 'flags'
      ? [(typeof flagsCorrectCount !== 'undefined' ? flagsCorrectCount : 0), (typeof flagsWrongCount !== 'undefined' ? flagsWrongCount : 0)]
      : _pm === 'shapes'
      ? [(typeof shapesCorrectCount !== 'undefined' ? shapesCorrectCount : 0), (typeof shapesWrongAnswerCount !== 'undefined' ? shapesWrongAnswerCount : 0)]
      : [correctCount || 0, wrongCount || 0];
    window.endPracticeSession(_practiceScore, _prCorrect, _prWrong);
    return;
  }
  ['loading-table-group','loading-social-group','loading-friend-group','loading-addfriend-group','loading-blocked-group','loading-sent-group']
    .forEach(id => document.getElementById(id)?.classList.add('table-gone'));
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
}
window.quitToMenu = quitToMenu;

// ── Power.png ingame (fijo arriba al centro, como el botón de silencio) ────────
// Visible solo en pre/in/postgame; oculto en loading, results y final.
(() => {
  const powerEl = document.getElementById('ingame-power');
  if (!powerEl) return;
  const isVisible = id => {
    const el = document.getElementById(id);
    return el && getComputedStyle(el).display !== 'none';
  };
  const powerIconEl = document.getElementById('ingame-power-icon');
  const backIconEl  = document.getElementById('ingame-back-icon');
  const refreshIngamePower = () => {
    // lobby-result-screen: mismo motivo que vs-result-screen (1v1) — el
    // ranking FINAL grupal (real o espejo de espectador, ver
    // _showGroupResultMirror en spectate.js) tiene su PROPIO back
    // (#lobby-result-back, con el mismo chequeo _isSpectating que
    // #vs-result-back) — el de arriba sobra y quedaba superpuesto encima
    // (el "quita el back de arriba" reportado).
    const blocked = isVisible('loading-screen') || isVisible('results-screen') || isVisible('final-screen') || isVisible('vs-result-screen') || isVisible('lobby-result-screen');
    const prepost = isVisible('splash-screen') || isVisible('gameover-screen');
    // score-display / flags-score-display están visibles durante el juego de
    // cualquier modo (shapes agrega sus piezas al body, no usa game-wrapper).
    const ingame  = prepost || isVisible('game-wrapper') || isVisible('flags-wrapper') ||
                    isVisible('score-display') || isVisible('flags-score-display');
    powerEl.style.display = (ingame && !blocked) ? 'block' : 'none';
    // En pre/postgame va un poco más a la derecha que durante el juego
    powerEl.style.left = prepost ? '82%' : '74%';
    // Espectando: el power (terminar MI partida) no aplica — se reemplaza por
    // un back que simplemente cierra el espectador y vuelve al menú.
    if (powerIconEl) powerIconEl.style.display = window._isSpectating ? 'none' : 'block';
    if (backIconEl)  backIconEl.style.display  = window._isSpectating ? 'block' : 'none';
  };
  window.refreshIngamePower = refreshIngamePower;

  // Click en power: abre la pestañita de confirmación (el juego sigue corriendo)
  // — salvo en modo espectador, que vuelve derecho al menú sin popup (no hay
  // partida propia que abandonar).
  const quitPopup = document.getElementById('ingame-quit-popup');
  powerEl.addEventListener('click', () => {
    sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
    if (window._isSpectating) {
      // Mismo flash de "press" que el resto de los back del juego.
      if (backIconEl) {
        backIconEl.classList.add('confirm-pressed');
        setTimeout(() => backIconEl.classList.remove('confirm-pressed'), 150);
      }
      if (typeof window.closeSpectator === 'function') window.closeSpectator();
      return;
    }
    if (quitPopup) quitPopup.style.display = 'flex';
    document.body.classList.add('quit-open');
  });
  document.getElementById('ingame-quit-cancel')?.addEventListener('click', () => {
    sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
    if (quitPopup) quitPopup.style.display = 'none';
    document.body.classList.remove('quit-open');
  });
  document.getElementById('ingame-quit-confirm')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    if (quitPopup) quitPopup.style.display = 'none';
    document.body.classList.remove('quit-open');

    // Parar timers pero no limpiar pantalla aún (el flag evita que hardReset oculte la UI)
    window._powerQuitOverlay = true;
    window.gameStoppers.forEach(fn => { try { fn(); } catch(e) {} });
    window._powerQuitOverlay = false;

    // En pregame (splash visible) o fuera de práctica: salir directo sin overlay
    const inPregame = isVisible('splash-screen') ||
                      isVisible('flags-pregame-countdown') ||
                      isVisible('pregame-countdown') ||
                      ((isVisible('score-display') || isVisible('flags-score-display')) && sfxGameMusic.paused);
    const inPractice = window.practiceConfig && window.practiceConfig.active;
    const goOverlay = document.getElementById('powerquit-overlay');
    if (!goOverlay || inPregame || !inPractice) { quitToMenu(); return; }

    sfxGameMusic.pause();
    sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp);
    goOverlay.style.display = 'flex';
    goOverlay.classList.remove('timeup-out');
    goOverlay.classList.add('timeup-in');

    setTimeout(() => {
      goOverlay.classList.remove('timeup-in');
      goOverlay.classList.add('timeup-out');
      setTimeout(() => {
        goOverlay.style.display = 'none';
        goOverlay.classList.remove('timeup-out');
        quitToMenu();
      }, 400);
    }, 1800);
  });
  // Reacciona a cualquier cambio de display (las pantallas se togglean por estilo inline)
  const obs = new MutationObserver(refreshIngamePower);
  ['loading-screen','splash-screen','game-wrapper','flags-wrapper',
   'gameover-screen','results-screen','final-screen','score-display',
   'flags-score-display','vs-result-screen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) obs.observe(el, { attributes: true, attributeFilter: ['style'] });
  });
  refreshIngamePower();

  // Escape = back/power. Orden de prioridad: quit popup → paneles anidados → power.
  const _hasClass = (id, cls) => { const el = document.getElementById(id); return el && el.classList.contains(cls); };
  const _clickBack = (id) => { document.getElementById(id)?.click(); };
  const _panelVisible = (id) => !_hasClass(id, 'table-gone');
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const active = document.activeElement;
    const tag = active && active.tagName;
    if (tag === 'TEXTAREA') return;
    if (tag === 'INPUT' && active.type !== 'range') return;
    if (tag === 'INPUT' && active.type === 'range') active.blur();
    const _closeOpenModal = () => {
      const acct = document.getElementById('account-modal');
      if (acct && acct.classList.contains('open')) {
        const closeBtn = document.getElementById('account-modal-close');
        if (closeBtn && getComputedStyle(closeBtn).display !== 'none') { closeBtn.click(); return true; }
        // Si el botón está oculto (noCloseViews) no hacer nada
        return true;
      }
      const lock = document.getElementById('social-lock-popup');
      if (lock && lock.classList.contains('open')) { document.getElementById('social-lock-close')?.click(); return true; }
      return false;
    };
    const _modeSelPop = document.getElementById('vs-mode-select-popup');
    if (_modeSelPop && _modeSelPop.style.display !== 'none') {
      sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
      _modeSelPop.style.display = 'none';
    } else if (quitPopup && quitPopup.style.display === 'flex') {
      sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
      quitPopup.style.display = 'none';
      document.body.classList.remove('quit-open');
    } else if (_closeOpenModal()) {
      // modal de cuenta cerrado
    } else if (_panelVisible('loading-friend-group'))    { _clickBack('loading-friend-back-wrap'); }
    else if (_panelVisible('loading-addfriend-group'))   { _clickBack('loading-addfriend-back-wrap'); }
    else if (_panelVisible('loading-blocked-group'))     { _clickBack('loading-blocked-back-wrap'); }
    else if (_panelVisible('loading-sent-group'))        { _clickBack('loading-sent-back-wrap'); }
    else if (_panelVisible('loading-rankings-group'))    { _clickBack('loading-rankings-back-wrap'); }
    else if (_panelVisible('loading-social-group'))      { _clickBack('loading-social-back-wrap'); }
    else if (_panelVisible('loading-table-group')) {
      const sub = document.getElementById('loading-panel2-back');
      if (sub && sub.style.display !== 'none') _clickBack('loading-panel2-back');
      else _clickBack('loading-play-confirm-wrap');
    }
    else if (_panelVisible('loading-versus-group'))      { _clickBack('versus-back-wrap'); }
    else if (document.getElementById('loading-practice-group')?.style.display !== 'none') { _clickBack('practice-back-wrap'); }
    else if (powerEl.style.display !== 'none')           { powerEl.click(); }
  });
})();

// ranks.js se carga después de este archivo; esperamos a que todo esté listo
// para que getRank() exista al pintar los rangos de cada amigo.
window.addEventListener('load', () => renderSocial());
// Igual que initLeaderboard más abajo: un evento de red puede llegar en
// cualquier momento, incluso mid-partida/mid-transición de campaña. Antes
// esto reconstruía TODA la lista de amigos (con sus tarjetas/celdas Founder)
// aunque el panel estuviera cerrado — trabajo de golpe sin motivo, sumado a
// lo que ya está pasando en la transición. Si el panel no está abierto, no
// hay nada visible que actualizar: se salta y renderSocial() ya se llama
// solo al abrir el panel (ver loading-social-btn).
if (typeof onFriendsUpdate === 'function') onFriendsUpdate(() => {
  const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
  if (panelOpen) renderSocial();
});

let sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp;

function loadGameSFX() {
  if (sfxPin) return;
  sfxPin       = new Audio('sfx/pin.mp3');
  sfxCountdown = new Audio('sfx/cuentaregresiva.mp3');
  sfxError     = new Audio('sfx/error.mp3');
  sfxAcertar   = new Audio('sfx/acertar.mp3');
  sfxVeryNice  = new Audio('sfx/verynice.mp3');
  sfxTag       = new Audio('sfx/tag.mp3');
  sfxBonus     = new Audio('sfx/bonus.mp3');
  sfxTickdown  = new Audio('sfx/countdown.mp3');
  sfxTimesUp   = new Audio('sfx/timesup.mp3');
  if (isMuted) getAllSfx().forEach(sfx => { sfx.volume = 0; sfx.muted = true; });
  // Forzar preload en iOS: sin .load() el primer play() dispara la descarga y decodificación
  [sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp]
    .forEach(sfx => { sfx.load(); });
}

// Camino PC (y fallback): <audio> HTML de siempre. NO TOCAR.
function playMusicHTML(track) {
  [sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic].forEach(t => { if (t !== track) { t.pause(); t.currentTime = 0; } });
  if (!track) return;
  // si el mismo track ya está sonando, dejarlo continuar (no reiniciar el loop)
  if (!track.paused && !track.ended) {
    const p = track.play();
    if (p) p.catch(() => {});
    return;
  }
  track.currentTime = 0;
  const p = track.play();
  if (p) p.catch(() => {});
}

function playMusic(track) {
  if (IS_IOS) return playMusicIOS(track);
  return playMusicHTML(track);
}

// ── CONFIG ──────────────────────────────────────────────────────────────────
const GAME_DURATION   = window.GAME_DURATION;
const BONUS_TIME      = 5;
const DOTS_NEEDED     = 10;
const SPEED_BONUS_WIN = 3;

// Pixel thresholds on the DISPLAYED canvas
const PERFECT_PX = 5;
const GOOD_PX    = 20;
const FAIR_PX    = 45;

const LABEL_MAP = { perfect: 'Perfecto', good: 'Bien', fair: 'Regular', wayoff: 'Muy lejos' };

// ── CITIES SCORING (nuevo sistema fiel al juego viejo) ────────────────────────
const CITIES_SCORE_MAP  = { perfect: 36, good: 24, fair: 20, wayoff: 0 };
const CITIES_SPEED_MULT = 1.5;
const CITIES_M_TABLE = [
  [0, 1], [1, 1.5], [2, 2.5], [4, 4], [7, 5], [10, 6],
  [13, 7.5], [18, 9], [22, 11], [25, 13], [31, 15], [35, 19],
];
function getCitiesM(n) {
  let M = 1;
  for (const [min, m] of CITIES_M_TABLE) { if (n >= min) M = m; }
  return M;
}

// ── MONUMENTS SCORING (mismo mecanismo que Cities, reverse-engineered de video:
// perfect y good dan siempre el mismo puntaje; fair queda en la proporción
// good/perfect del sistema viejo de referencia, 2/3). Los saltos de M pasan en
// los MISMOS umbrales que CITIES_M_TABLE (contados ronda a ronda contra el
// video, no cada 10 correctas), pero la muestra nunca subió de M=11 pese a
// superar las 40 correctas — así que la tabla corta ahí y no sigue a
// 13/15/19 como Cities.
const MONUMENTS_SCORE_MAP  = { perfect: 30, good: 30, fair: 20, wayoff: 0 };
const MONUMENTS_SPEED_MULT = 1.5;
const MONUMENTS_M_TABLE = CITIES_M_TABLE.slice(0, 9); // hasta [22, 11] inclusive
function getMonumentsM(n) {
  let M = 1;
  for (const [min, m] of MONUMENTS_M_TABLE) { if (n >= min) M = m; }
  return M;
}

// ── MAP CALIBRATION ──────────────────────────────────────────────────────────
// Mercator projection — calibrated with 4 reference cities
const MAP_LON_LEFT = -141.2;
const MAP_LON_RIGHT =  181.5;
const MAP_LAT_TOP  =   78.2;
const MAP_LAT_BOT  =  -59.7;

function mercatorY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
}
const MERC_TOP = mercatorY(MAP_LAT_TOP);
const MERC_BOT = mercatorY(MAP_LAT_BOT);

const MAP_ASPECT = 2380 / 1759;
const _pad = 24;
const _scale = 0.88;
const DISPLAY_W = Math.min(
  Math.floor((window.STAGE_W  - _pad * 2) * _scale),
  Math.floor((window.STAGE_H - _pad * 2) * MAP_ASPECT * _scale)
);
const DISPLAY_H = Math.round(DISPLAY_W / MAP_ASPECT);

// El cartel (tag3.png), la foto (photo.png) y la imagen del monumento estaban en
// px fijos, pero el canvas/mapa mide DISPLAY_W (variable según pantalla). En
// pantallas chicas (iOS landscape) esos px quedaban enormes respecto al mapa.
// Escalamos su geometría proporcional a DISPLAY_W, con clamp a 1 para que en
// desktop quede idéntico a antes y solo se achique en pantallas pequeñas.
// 1190 ≈ DISPLAY_W de un desktop típico; el factor 1.15 agranda el cartel/foto un
// 15% en todas las pantallas (en PC se veían algo chicos) manteniendo la
// proporción responsiva en pantallas pequeñas.
const TAG_SCALE = 1.15 * Math.min(1, DISPLAY_W / 1190);
const tpx = v => Math.round(v * TAG_SCALE) + 'px';

const PIN_W = 48, PIN_H = 48;

// Fraction (0–1) within the image where the needle tip sits
const PIN1_TIP = { x: 0.18, y: 0.90 }; // red  — needle exits lower-left
const PIN2_TIP = { x: 0.80, y: 0.88 }; // green — needle exits lower-right

// ── DOM ──────────────────────────────────────────────────────────────────────
const splashScreen   = document.getElementById('splash-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const gameWrapper    = document.getElementById('game-wrapper');
const timeupOverlay  = document.getElementById('timeup-overlay');
const canvas         = document.getElementById('game-canvas');
const ctx            = canvas.getContext('2d');
const cityTagEl      = document.getElementById('city-tag');
const cityTagText    = document.getElementById('city-tag-text');
const monumentImgEl  = document.getElementById('monument-img');
const monumentNameEl = document.getElementById('monument-name');

// Aplica la geometría del cartel/foto/monumento escalada a DISPLAY_W (ver TAG_SCALE).
// Se ejecuta una vez; los clones (ghosts) heredan estos estilos inline.
(function applyTagScale() {
  cityTagEl.style.width      = tpx(525);
  cityTagEl.style.height     = tpx(163);
  cityTagText.style.fontSize = tpx(26);
  monumentNameEl.style.top      = tpx(238);
  monumentNameEl.style.left     = tpx(87);
  monumentNameEl.style.width    = tpx(282);
  monumentNameEl.style.fontSize = tpx(18);
  monumentImgEl.style.width  = tpx(282);
  monumentImgEl.style.height = tpx(180);
  monumentImgEl.style.top    = tpx(51);
  monumentImgEl.style.left   = tpx(87);
})();

// ── ZOOM + ARRASTRE DEL MAPA (scroll / drag) ─────────────────────────────────
// Cities/Monuments comparten este canvas — permite acercar SOLO el fondo del
// mapa hasta el doble con la rueda, para clickear con más precisión, sin
// agrandar los puntos/nombres/pines (deben leerse igual de grandes a
// cualquier zoom). Por eso el "zoom" NO es un transform CSS del canvas: es
// una cámara lógica (mapCamera) que recorta una porción del mapa al
// dibujarlo (más chica cuanto más zoom), mientras que dots/pines/etc. se
// dibujan en su posición de PANTALLA (worldToScreen) pero con su tamaño de
// siempre, sin escalar. Con zoom > 1 también se puede arrastrar el mapa
// (click y mover) para pasear por la parte que no entra en pantalla.
const MAP_ZOOM_MIN  = 1;
const MAP_ZOOM_MAX  = 2;
const MAP_ZOOM_STEP = 0.08;
let mapCamera = { zoom: 1, x: 0, y: 0 };

// Coordenada de mundo (la misma que usan latLonToCanvas/state.placedDots) → píxel de pantalla actual.
function worldToScreen(wx, wy) {
  return { x: (wx - mapCamera.x) * mapCamera.zoom, y: (wy - mapCamera.y) * mapCamera.zoom };
}
// Inversa: píxel de pantalla (lo que ya devuelve el click, vía canvas.getBoundingClientRect) → mundo.
function screenToWorld(sx, sy) {
  return { x: sx / mapCamera.zoom + mapCamera.x, y: sy / mapCamera.zoom + mapCamera.y };
}

// Clampea camera.x/y para que la vista nunca muestre nada fuera del mapa.
function clampMapCamera() {
  const vw = DISPLAY_W / mapCamera.zoom;
  const vh = DISPLAY_H / mapCamera.zoom;
  mapCamera.x = Math.min(Math.max(mapCamera.x, 0), Math.max(0, DISPLAY_W - vw));
  mapCamera.y = Math.min(Math.max(mapCamera.y, 0), Math.max(0, DISPLAY_H - vh));
}

function resetMapZoom() {
  mapCamera.zoom = 1;
  mapCamera.x = 0;
  mapCamera.y = 0;
  _mapDrag = null;
  _mapJustDragged = false;
  canvas.style.cursor = 'crosshair';
  if (state) state.mapDrawn = false; // fuerza un redraw aunque el loop esté "idle"
}

// Posición del cursor/touch en píxeles de PANTALLA (espacio del canvas).
function _canvasScreenPos(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

// Zoom directo, sin animación: cada evento 'wheel' mueve mapCamera.zoom/x/y
// al toque, ya clampeado, ajustando la cámara para que el punto de mundo bajo
// el cursor quede fijo (zoom "hacia donde apunta el mouse"). Al ser síncrono
// (sin requestAnimationFrame de por medio) cada evento parte siempre del
// último valor real, así que ráfagas de wheel (mouse/trackpad) se acumulan
// bien sin necesidad de trackear un "target" aparte.
function _stepMapZoom(zoomDelta, screenX, screenY) {
  const nextZoom = Math.min(MAP_ZOOM_MAX, Math.max(MAP_ZOOM_MIN, mapCamera.zoom + zoomDelta));
  if (nextZoom === mapCamera.zoom) return;

  const worldPt = screenToWorld(screenX, screenY); // punto de mundo bajo el cursor, con el zoom actual
  const vw = DISPLAY_W / nextZoom, vh = DISPLAY_H / nextZoom;
  mapCamera.zoom = nextZoom;
  mapCamera.x = Math.min(Math.max(worldPt.x - screenX / nextZoom, 0), Math.max(0, DISPLAY_W - vw));
  mapCamera.y = Math.min(Math.max(worldPt.y - screenY / nextZoom, 0), Math.max(0, DISPLAY_H - vh));
  if (state) state.mapDrawn = false;
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { x: screenX, y: screenY } = _canvasScreenPos(e);
  // Normalizado: un "click" de rueda de mouse ronda deltaY=±100; un trackpad
  // manda deltas chicos y continuos. Clampeado para que ningún evento pegue
  // un salto de zoom brusco, sea cual sea el dispositivo.
  const norm = Math.max(-2, Math.min(2, e.deltaY / 100));
  _stepMapZoom(-norm * MAP_ZOOM_STEP, screenX, screenY);
}, { passive: false });

// ── Arrastre (drag) del mapa con zoom > 1 ────────────────────────────────────
// DRAG_THRESHOLD: si el puntero se movió más que esto entre el pointerdown y
// el pointerup, se considera un arrastre y el 'click' de después NO cuenta
// como intento de adivinar (si no, cualquier drag además clavaría un pin).
const MAP_DRAG_THRESHOLD = 6;
let _mapDrag = null; // { startScreenX, startScreenY, startCamX, startCamY, dragged }

canvas.addEventListener('pointerdown', (e) => {
  if (mapCamera.zoom <= 1 || e.button !== 0) return;
  const pos = _canvasScreenPos(e);
  _mapDrag = {
    startScreenX: pos.x, startScreenY: pos.y,
    startClientX: e.clientX, startClientY: e.clientY,
    startCamX: mapCamera.x, startCamY: mapCamera.y, dragged: false,
  };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!_mapDrag) return;
  const pos = _canvasScreenPos(e);
  const dx = pos.x - _mapDrag.startScreenX;
  const dy = pos.y - _mapDrag.startScreenY;
  if (!_mapDrag.dragged) {
    // El umbral se mide en píxeles de PANTALLA reales (clientX/Y), no en el
    // espacio interno del canvas (pos, en unidades DISPLAY_W/H): en pantallas
    // más chicas que el stage de referencia (1920×911, ver letterbox.js) ese
    // espacio interno queda escalado hacia arriba, así que un par de px reales
    // de temblor del mouse al clickear ya superaban el umbral en unidades de
    // canvas y activaban "arrastre" en vez de registrar el click de adivinar.
    const clientDx = e.clientX - _mapDrag.startClientX;
    const clientDy = e.clientY - _mapDrag.startClientY;
    if (Math.hypot(clientDx, clientDy) > MAP_DRAG_THRESHOLD) {
      _mapDrag.dragged = true;
      canvas.style.cursor = 'grabbing';
    }
  }
  if (!_mapDrag.dragged) return;
  mapCamera.x = _mapDrag.startCamX - dx / mapCamera.zoom;
  mapCamera.y = _mapDrag.startCamY - dy / mapCamera.zoom;
  clampMapCamera();
  if (state) state.mapDrawn = false;
});

// Seteado por _endMapDrag cuando el gesto fue un arrastre real — el handler
// de 'click' (que dispara igual tras soltar, lo haya movido o no) lo revisa
// para no clavar un pin de adivinanza al final de un simple paneo del mapa.
let _mapJustDragged = false;

function _endMapDrag(e) {
  if (!_mapDrag) return;
  if (_mapDrag.dragged) _mapJustDragged = true;
  if (e && e.pointerId !== undefined) { try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
  canvas.style.cursor = 'crosshair';
  _mapDrag = null;
}
canvas.addEventListener('pointerup', _endMapDrag);
canvas.addEventListener('pointercancel', _endMapDrag);

const timerNumberEl  = document.getElementById('timer-number');
const countdownImg   = document.querySelector('#countdown-widget img');
const progressDots   = document.querySelectorAll('.dot');
const scoreValueEl   = document.getElementById('score-value');
const speedBonusText = document.getElementById('speed-bonus-text');
const resultLabel    = document.getElementById('result-label');
const finalScoreEl   = document.getElementById('final-score-value');
const highscoreEl        = document.getElementById('highscore-value');
const splashHighscoreEl  = document.getElementById('splash-highscore-value');
const newHighscoreBanner = document.getElementById('new-highscore-banner');
const newHighscoreScore  = document.getElementById('new-highscore-score');
const btnStart          = document.getElementById('btn-start');
const progressContainer = document.getElementById('progress-dots');
const scoreDisplayEl    = document.getElementById('score-display');
const lbBestScoreEl     = document.getElementById('lb-best-score');

canvas.width  = DISPLAY_W;
canvas.height = DISPLAY_H;

const badgeOverlay    = document.createElement('canvas');
badgeOverlay.width    = DISPLAY_W;
badgeOverlay.height   = DISPLAY_H;
badgeOverlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:25;';
const badgeOverlayCtx = badgeOverlay.getContext('2d');
gameWrapper.appendChild(badgeOverlay);

// Libera proactivamente la memoria de juego: suelta los bitmaps decodificados de
// fondos/personajes/ranks (poniendo src=''), achica los canvas a 1px y libera el
// video de howtoplay. Se llama al volver al menú (y se puede llamar entre modos)
// para que la app NO acumule RAM a lo largo de una campaña ni entre sesiones — así
// el baseline queda plano y no hace falta recargar la página. Las imágenes se
// vuelven a setear solas cuando el modo siguiente arranca (los handlers asignan sus
// src), así que limpiar acá es seguro: el menú no usa estos <img> de juego.
window.releaseGameMemory = function () {
  try {
    // Fondos, personajes, check/wrong, cielos, monumento, banderas de país.
    // OJO: no incluir .game-bg-sky-monuments — el cielo de monuments no lo re-asigna
    // ningún handler, así que limpiarlo lo deja en blanco al entrar al modo.
    document.querySelectorAll(
      '.game-bg-city, .game-bg-men1, .game-bg-men2, .game-bg-girl1, .game-bg-girl2, ' +
      '.game-bg-women1, .game-bg-women2, .game-bg-check3, .game-bg-wrong3, #monument-img'
    ).forEach(el => { if (el && el.tagName === 'IMG') el.removeAttribute('src'); });
    // NO limpiar #results-screen / #final-screen img: sus src están en el HTML y no
    // se re-asignan al mostrarse, así que limpiarlos dejaba results/final en blanco
    // (sin imágenes ni botón de confirm). Los ranks son chicos, no vale romper eso.
    // Canvas: liberar el buffer de píxeles (GPU+CPU) reduciéndolo a 1px.
    if (typeof canvas !== 'undefined' && canvas) { canvas.width = 1; canvas.height = 1; }
    if (badgeOverlay) { badgeOverlay.width = 1; badgeOverlay.height = 1; }
    const fbc = document.getElementById('flags-badge-canvas');
    if (fbc) { fbc.width = 1; fbc.height = 1; }
    // Video de howtoplay: liberar decoder/buffers.
    const v = document.querySelector('.splash-howtoplay-video');
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }
  } catch (e) {}
};

// ── ASSETS ───────────────────────────────────────────────────────────────────
const MONUMENTS_EASY_NAMES = [
  "Torre Eiffel", "Estatua de la Libertad", "Taj Mahal", "Pirámides de Giza",
  "Coliseo Romano", "Gran Muralla China", "Machu Picchu", "Cristo Redentor",
  "Sagrada Família", "Stonehenge", "Big Ben", "Chichén Itzá",
];
const MONUMENTS_EASY = MONUMENTS.filter(m => MONUMENTS_EASY_NAMES.includes(m.name));

const imgMap   = new Image(); imgMap.src   = 'images/mapimage.png';
const imgMap2  = new Image(); imgMap2.src  = 'images/mapimage2.png';
const imgFlag  = new Image(); imgFlag.src  = 'images/flag.png';
const imgPin1 = new Image(); imgPin1.src = 'images/pin1.png';
const imgPin2 = new Image(); imgPin2.src = 'images/pin2.png';
const imgStar  = new Image(); imgStar.src  = 'images/stareffect.png';
const imgCheck       = new Image(); imgCheck.src = 'images/check.png';

// Badges cargados diferido — no se necesitan hasta el gameover
const imgBadgeGold   = new Image();
const imgBadgeGreen  = new Image();
const imgBadgeRed    = new Image();
const imgBadgeBlue   = new Image();
const imgBadgeGarnet = new Image();
const imgBadgeYellow = new Image();
const imgBadgeSilver = new Image();

function loadBadges() {
  imgBadgeGold.src   = 'images/badges/goldbadge.png';
  imgBadgeGreen.src  = 'images/badges/greenbadge.png';
  imgBadgeRed.src    = 'images/badges/redbadge.png';
  imgBadgeBlue.src   = 'images/badges/bluebadge.png';
  imgBadgeGarnet.src = 'images/badges/garnetbadge.png';
  imgBadgeYellow.src = 'images/badges/yellowbadge.png';
  imgBadgeSilver.src = 'images/badges/silverbadge.png';
}

// ── STATE ────────────────────────────────────────────────────────────────────
let state          = null;
let animFrameId    = null;
let timerIntervalId = null;
let speedBonusHideId = null;
let gameAborted = false;
let mapGameOver = false;

let highscore = parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10);
let monumentsHighscore = parseInt(localStorage.getItem('monumentsHighscore') || '0', 10);
highscoreEl.textContent = highscore.toLocaleString();

function updateSplashHighscore() {
  if (splashHighscoreEl) {
    splashHighscoreEl.textContent = highscore > 0 ? highscore.toLocaleString() : '—';
  }
}
updateSplashHighscore();

// ── GRADE COUNTS ─────────────────────────────────────────────────────────────
let gradeCounts = { perfect: 0, good: 0, fair: 0 };
let wrongCount = 0;
let correctCount = 0;
// Contador de ronda para el espectador de Cities — correctCount no sirve como
// identidad única de ronda (solo incrementa en aciertos, así que dos ciudades
// DISTINTAS tras un error consecutivo compartirían el mismo valor).
let _citiesSpecRoundIdx = 0;
let _monumentsSpecRoundIdx = 0;

function setModeCounts(correct, wrong) {
  gradeCounts = { perfect: correct, good: 0, fair: 0 };
  wrongCount = wrong;
  updateGradeCountsUI();
  updateWrongCountUI();
}

function updateWrongCountUI() {
  ['splash-wrong-total', 'gameover-wrong-total'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = wrongCount;
  });
}

function saveGradeCount(grade) {
  if (grade === 'perfect' || grade === 'good' || grade === 'fair') {
    gradeCounts[grade]++;
    updateGradeCountsUI();
  } else if (grade === 'wayoff') {
    wrongCount++;
    updateWrongCountUI();
  }
}

function updateGradeCountsUI() {
  const total = gradeCounts.perfect + gradeCounts.good + gradeCounts.fair;
  ['splash-count-total', 'gameover-count-total'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = total;
  });
}
updateGradeCountsUI();
updateWrongCountUI();

function getModeCheckImg() {
  if (window.pendingGameMode === 'flags')     return 'images/check1.png';
  if (window.pendingGameMode === 'shapes')    return 'images/check2.png';
  if (window.pendingGameMode === 'monuments') return 'images/check4.png';
  return 'images/check3.png';
}
function getModeWrongImg() {
  if (window.pendingGameMode === 'flags')     return 'images/wrong1.png';
  if (window.pendingGameMode === 'shapes')    return 'images/wrong2.png';
  if (window.pendingGameMode === 'monuments') return 'images/wrong4.png';
  return 'images/wrong3.png';
}

function buildChecksRow() {
  const row = document.getElementById('gameover-checks-row');
  if (!row) return;
  row.innerHTML = '';
  const total = gradeCounts.perfect + gradeCounts.good + gradeCounts.fair;
  const IMG_W = 6.4;   // vmin (coincide con .checks-row/.wrongs-row img)
  const BASE_GAP = 0.33; // vmin
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = total > 1 ? (total > 12 ? (MAX_W - total * IMG_W) / (total - 1) : BASE_GAP) : 0;
  if (total === 0) {
    const none = document.createElement('span');
    none.textContent = t('profile.none');
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:0.77cqmin #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:4.5cqmin;font-weight:bold;position:relative;left:2.2cqmin;';
    row.appendChild(none);
    return;
  }

  row.style.gap = '0px';
  for (let i = 0; i < total; i++) {
    const img = document.createElement('img');
    img.src = getModeCheckImg();
    img.alt = '';
    img.style.animationDelay = `${i * 0.1}s`;
    img.style.zIndex = 16 + i;
    if (i < total - 1) img.style.marginRight = `${gap}cqmin`;
    row.appendChild(img);
  }

  const check3Static   = gameoverScreen.querySelector('.game-bg-check3');
  const gradeCountEl   = gameoverScreen.querySelector('.grade-count-total');
  if (check3Static)  check3Static.style.opacity  = '0';
  if (gradeCountEl)  gradeCountEl.style.opacity   = '0';

  const revealDelay = (total > 0 ? (total - 1) * 0.1 + 0.2 : 0) + 0.2;
  setTimeout(() => {
    if (check3Static)  check3Static.style.opacity  = '1';
    if (gradeCountEl)  gradeCountEl.style.opacity   = '1';
  }, revealDelay * 1000);
}

function buildWrongsRow(startOffset = 0) {
  const row = document.getElementById('gameover-wrongs-row');
  if (!row) return;
  row.innerHTML = '';
  const total = wrongCount;
  const IMG_W = 6.4;   // vmin (coincide con .checks-row/.wrongs-row img)
  const BASE_GAP = 0.33; // vmin
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = total > 1 ? (total > 12 ? (MAX_W - total * IMG_W) / (total - 1) : BASE_GAP) : 0;

  if (total === 0) {
    const none = document.createElement('span');
    none.textContent = t('profile.none');
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:0.77cqmin #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:4.5cqmin;font-weight:bold;position:relative;left:2.2cqmin;opacity:0;';
    row.appendChild(none);
    const w3s = gameoverScreen.querySelector('.game-bg-wrong3');
    const wce = gameoverScreen.querySelector('.wrong-count-total');
    if (w3s) w3s.style.opacity = '0';
    if (wce) wce.style.opacity = '0';
    setTimeout(() => {
      none.style.opacity = '1';
      if (w3s) w3s.style.opacity = '1';
      if (wce) wce.style.opacity = '1';
    }, startOffset * 1000);
    return;
  }

  row.style.gap = '0px';
  for (let i = 0; i < total; i++) {
    const img = document.createElement('img');
    img.src = getModeWrongImg();
    img.alt = '';
    img.style.animationDelay = `${startOffset + i * 0.1}s`;
    img.style.zIndex = 16 + i;
    if (i < total - 1) img.style.marginRight = `${gap}cqmin`;
    row.appendChild(img);
  }

  const wrong3Static   = gameoverScreen.querySelector('.game-bg-wrong3');
  const wrongCountEl   = gameoverScreen.querySelector('.wrong-count-total');
  const wrongTotalEl   = document.getElementById('gameover-wrong-total');
  if (wrongTotalEl) wrongTotalEl.textContent = total;
  const splashWrongEl = document.getElementById('splash-wrong-total');
  if (splashWrongEl) splashWrongEl.textContent = total;
  if (wrong3Static)  wrong3Static.style.opacity  = '0';
  if (wrongCountEl)  wrongCountEl.style.opacity   = '0';
  const revealDelay = startOffset + (total > 0 ? (total - 1) * 0.1 + 0.2 : 0) + 0.2;
  setTimeout(() => {
    if (wrong3Static)  wrong3Static.style.opacity  = '1';
    if (wrongCountEl)  wrongCountEl.style.opacity   = '1';
  }, revealDelay * 1000);
}


// ── LEADERBOARD ──────────────────────────────────────────────────────────────────────────────
const LB_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c',
                    '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a'];
// La barra de amigos ingame se construye desde la capa de datos compartida
// (js/friends.js -> getFriends()), la misma que usan las pantallas results/final.
// friends.js se carga antes que este archivo, así getFriends() ya tiene datos.
function buildFriendPlayers() {
  // En lobby grupal: todos los rivales de la sala
  if (window._lobbyActive && Array.isArray(window._lobbyMembers)) {
    return window._lobbyMembers.map(m => ({
      id: 'lob' + m.id,
      name: m.name,
      score: m.score || 0,
      avatar: m.avatar || '',
      color: '#888',
      initial: (m.name && m.name[0]) ? m.name[0].toUpperCase() : '?',
      cardCode: m.cardCode || '0001',
    }));
  }
  // En VS 1v1 (shapes): solo el rival
  if (window._vsActive && window._vsOpponent) {
    const o = window._vsOpponent;
    return [{
      id: 'vsopp',
      name: o.name,
      score: window._vsOppScore || 0,
      avatar: o.avatar || '',
      color: '#888',
      initial: (o.name && o.name[0]) ? o.name[0].toUpperCase() : '?',
      cardCode: o.cardCode || '0001',
    }];
  }
  const src = (typeof getFriends === 'function') ? getFriends() : [];
  return src.map((f, i) => ({
    id: `friend${i}`,
    name: f.name,
    score: f.score,
    avatar: f.avatar || '',
    color: LB_COLORS[i % LB_COLORS.length],
    initial: (f.name && f.name[0]) ? f.name[0].toUpperCase() : '?',
    cardCode: f.cardCode || '0001',
  }));
}

// ── Hooks VS para modo Cities ─────────────────────────────────────────────────
window.citiesSetVsDisconnected = function(disconnected) {
  const el = typeof lbElements !== 'undefined' ? lbElements['lb-vsopp'] : null;
  if (!el) return;
  el.classList.toggle('is-disconnected', !!disconnected);
};
window.citiesSetVsOpponentScore = function(score) {
  window._vsOppScore = score;
  if (typeof window._lbUpdateEntry === 'function') window._lbUpdateEntry('vsopp', score);
  // Durante el espectador, el leaderboard lo posiciona el renderer de
  // espectador (_renderGroupLeaderboard / citiesSpectatorReposition), NO el
  // positionLeaderboard normal anclado ABAJO — llamarlo acá lo hacía pelear
  // con el de grupo (anclado arriba) y las celdas saltaban de posición (el
  // "se buguea la posición de las celdas al pasar de jugador a espectador"
  // reportado). Ver también el render loop y el resize, ya guardados.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function' && state) positionLeaderboard(state.score, true);
};
window.citiesTriggerOpponentWrong = function() {
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect('vsopp');
};
window.monumentsSetVsOpponentScore = function(score) {
  window._vsOppScore = score;
  if (typeof window._lbUpdateEntry === 'function') window._lbUpdateEntry('vsopp', score);
  // Ver comentario en citiesSetVsOpponentScore — mismo motivo.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function' && state) positionLeaderboard(state.score, true);
};
window.monumentsTriggerOpponentWrong = function() {
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect('vsopp');
};

// ── "Se acabó el tiempo" (timesup) — MISMO sistema que el "wrong", pero
// disparado cuando a un jugador se le termina el tiempo (temblor + cronómetro,
// ver window._applyTimesUpEffect). Cities y Monuments comparten #leaderboard.
window._lbTimesUpEffect = function(id) {
  if (typeof window._applyTimesUpEffect === 'function' && typeof lbElements !== 'undefined') window._applyTimesUpEffect(lbElements['lb-' + id]);
};
window.citiesSetLobbyTimesUpFor = window.monumentsSetLobbyTimesUpFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'player' : ('lob' + uid);
  window._lbTimesUpEffect(key);
};
window.citiesTriggerOpponentTimesUp = window.monumentsTriggerOpponentTimesUp = function() {
  window._lbTimesUpEffect('vsopp');
};

// ── Hooks Lobby para modo Cities ──────────────────────────────────────────────
window.citiesSetLobbyScores = function(members) {
  if (!Array.isArray(members) || typeof window._lbUpdateEntry !== 'function') return;
  members.forEach(m => window._lbUpdateEntry('lob' + m.id, m.score || 0));
  // Ver comentario en citiesSetVsOpponentScore — mismo motivo.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function' && state) positionLeaderboard(state.score, true);
};
window.citiesSetLobbyWrongFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'player' : ('lob' + uid);
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect(key);
};
window.citiesSetLobbyDisconnected = function(uid, disconnected) {
  const el = typeof lbElements !== 'undefined' ? lbElements['lb-lob' + uid] : null;
  if (!el) return;
  el.classList.toggle('is-disconnected', !!disconnected);
};
window.citiesHardReset = function() {
  try { gameAborted = true; } catch(e) {}
  try { pregameAborted = true; clearTimeout(pregameTimeout); pregameTimeout = null; } catch(e) {}
  try { clearTimeout(endGameTimeout1); clearTimeout(endGameTimeout2); } catch(e) {}
  try { clearInterval(timerIntervalId); timerIntervalId = null; } catch(e) {}
  try { if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; } } catch(e) {}
  const _sbt = document.getElementById('speed-bonus-text');
  if (_sbt) _sbt.classList.remove('visible');
  const _tuo = document.getElementById('timeup-overlay');
  if (_tuo) { _tuo.style.display = 'none'; _tuo.classList.remove('timeup-in','timeup-out'); }
};

// ═════════════════════════════════════════════════════════════════════════════
// ── MODO ESPECTADOR: CITIES ─────────────────────────────────────────────────
// A diferencia de flags/shapes (opciones discretas, DOM propio), Cities usa un
// <canvas> compartido con el jugador real (#game-canvas / ctx / state /
// render()) — la única forma práctica de "ver" los pines animados es REUSAR
// esa misma maquinaria (render() ya sabe dibujar pin1Anim/pin2Anim/dots
// enteramente a partir de `state`, sin importar quién la puebla) en vez de
// reimplementar un renderer de mapa aparte. Espectar y jugar de verdad son
// mutuamente excluyentes en una pestaña (mismo supuesto que flags/shapes), así
// que reasignar `state`/`canvas.style.pointerEvents` acá es seguro.
//
// A diferencia de shapes (donde 'round' llega ANTES que 'pregame' en el orden
// real), en Cities nextCity() —y por lo tanto el 'round'— solo se llama
// DESPUÉS de que termina el 3-2-1 real (ver runPregameCountdown(...) dentro de
// startGame()), igual que flags. Como #game-wrapper contiene TODO lo visual
// (tag+canvas), alcanza con tenerlo oculto durante el 3-2-1 y revelarlo recién
// en el onDone real — no hace falta el gate explícito
// (_flagsSpecCountdownDone/_shapesSpecPendingReveal) que sí hizo falta en los
// otros dos modos: acá "oculto" ya cubre cualquier orden de llegada posible.
// Reconstruye una fila de íconos (correctas/incorrectas) para el postgame del
// espectador de Cities/Monuments — replica EXACTO a buildChecksRow()/
// buildWrongsRow() reales (mismo gap comprimido si hay >12, mismos
// márgenes/animation-delay/z-index escalonados por ícono, mismo fade del
// ícono grande + número recién cuando termina de entrar la fila) pero a
// partir del payload en vez de gradeCounts/wrongCount (estado LOCAL del
// jugador, que acá no existe). Antes esto era una versión simplificada sin
// nada de esto — todos los íconos aparecían de golpe, pegados con el gap
// default de la clase en vez del comprimido, y el ícono grande/número
// nunca hacían su fade (aparecían ya visibles).
// startOffset: retraso inicial en segundos (buildWrongsRow real arranca
// recién cuando termina de entrar la fila de correctas).
// Devuelve el momento (segundos) en que termina toda la animación de ESTA
// fila, para poder encadenar la siguiente (igual que checksEndTime real).
function _specBuildCountRow(rowEl, staticEl, countEl, count, imgSrc, startOffset) {
  if (!rowEl) return startOffset;
  rowEl.innerHTML = '';
  rowEl.style.gap = '0px';
  const IMG_W = 6.4, BASE_GAP = 0.33; // vmin, igual que .checks-row/.wrongs-row img
  const MAX_W = 12 * IMG_W + 11 * BASE_GAP;
  const gap = count > 1 ? (count > 12 ? (MAX_W - count * IMG_W) / (count - 1) : BASE_GAP) : 0;

  if (count === 0) {
    const none = document.createElement('span');
    none.textContent = (typeof t === 'function') ? t('profile.none') : 'Ninguna';
    none.style.cssText = 'color:#ffffff;-webkit-text-stroke:0.77cqmin #132886;paint-order:stroke fill;font-family:VAGRoundBold,"Arial Black",Impact,sans-serif;font-size:4.5cqmin;font-weight:bold;position:relative;left:2.2cqmin;opacity:0;';
    rowEl.appendChild(none);
    if (staticEl) staticEl.style.opacity = '0';
    if (countEl)  countEl.style.opacity  = '0';
    setTimeout(() => {
      none.style.opacity = '1';
      if (staticEl) staticEl.style.opacity = '1';
      if (countEl)  countEl.style.opacity  = '1';
    }, startOffset * 1000);
    return startOffset;
  }

  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = '';
    img.style.animationDelay = `${startOffset + i * 0.1}s`;
    img.style.zIndex = 16 + i;
    if (i < count - 1) img.style.marginRight = `${gap}cqmin`;
    rowEl.appendChild(img);
  }

  if (staticEl) staticEl.style.opacity = '0';
  if (countEl)  countEl.style.opacity  = '0';
  const revealDelay = startOffset + (count - 1) * 0.1 + 0.2 + 0.2;
  setTimeout(() => {
    if (staticEl) staticEl.style.opacity = '1';
    if (countEl)  countEl.style.opacity  = '1';
  }, revealDelay * 1000);
  return revealDelay;
}

let _citiesSpecMode = false;
let _citiesSpecTimesUpT1 = null, _citiesSpecTimesUpT2 = null;
// Igual mecanismo que flags.js/shapes.js: la primera ronda tras entrar espera
// un margen corto para confirmar si de verdad viene un pregame (llega poco
// después, mismo orden real de broadcasts) — solo se usa para decidir CUÁNDO
// arrancar sfxGameMusic. Si hay pregame, lo arranca su propio onDone al
// terminar el 3-2-1; si no aparece en ese margen, es unión a mitad de una
// partida ya en curso y hay que arrancarlo ACÁ — sin esto, un espectador que
// se unía a mitad de partida se quedaba con sfxMenuMusic sonando para
// siempre, porque citiesSpectatorShowPregame() (el único lugar que arrancaba
// sfxGameMusic) nunca llegaba a correr.
let _citiesSpecIsFirstRound = true;
let _citiesSpecPregameSeen  = false;
// Mismo guard que ya tienen flags.js/shapes.js para sfxTickdown: por VALOR
// (mismo timeLeft repetido) y por TIEMPO REAL transcurrido (el resend de
// unión a mitad de partida + el próximo tick en vivo pueden llegar pegados
// con valores DISTINTOS, ninguno bloqueado por el guard de valor solo) —
// sin esto el beep de los últimos 10s sonaba repetido/cortado feo al
// unirse justo en esa ventana.
let _citiesSpecLastTick = null;
let _citiesSpecLastTickSoundAt = 0;

window.citiesSpectatorEnter = function () {
  _citiesSpecMode = true;
  window._isSpectating = true;
  _citiesSpecLastTick = null;
  _citiesSpecLastTickSoundAt = 0;
  _citiesSpecIsFirstRound = true;
  _citiesSpecPregameSeen  = false;
  window.pendingGameMode = 'game';
  _citiesSpecLastCard = null;
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';
  if (typeof loadGameSFX === 'function') loadGameSFX();
  if (typeof loadBadges === 'function') loadBadges();
  // Restos de otros modos espectados antes en esta misma pestaña sin pasar
  // por su propio Exit — mismo caso ya resuelto en flags.js/shapes.js.
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
  document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
  document.getElementById('shapes-countdown-widget')?.remove();
  document.getElementById('flags-wrapper')?.style.setProperty('display', 'none');
  document.getElementById('flags-luggage-wrap')?.style.setProperty('display', 'none');
  document.getElementById('flags-flagid-wrap')?.style.setProperty('display', 'none');
  ['flags-machine', 'flags-machine2', 'flags-machine3', 'flags-machine3b'].forEach(id => {
    const m = document.getElementById(id);
    if (m) { m.style.display = 'none'; m.style.animationPlayState = ''; m.classList.remove('scrolling'); }
  });
  document.getElementById('flags-countdown-widget')?.style.setProperty('display', 'none');
  document.getElementById('flags-right-panel')?.style.setProperty('display', 'none');

  mapGameOver = false;
  gameAborted = false;
  clearInterval(timerIntervalId); timerIntervalId = null;
  clearTimeout(pregameTimeout);
  clearTimeout(_citiesSpecTimesUpT1); clearTimeout(_citiesSpecTimesUpT2);
  canvas.style.pointerEvents = 'none'; // solo-lectura: no hay click que resolver
  if (canvas.width < DISPLAY_W) { canvas.width = DISPLAY_W; canvas.height = DISPLAY_H; }
  if (badgeOverlay.width < DISPLAY_W) { badgeOverlay.width = DISPLAY_W; badgeOverlay.height = DISPLAY_H; }

  scoreDisplayEl.style.display = 'block';
  scoreValueEl.textContent = '0';
  speedBonusText.style.display = '';
  speedBonusText.classList.remove('visible');
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) { cwEl.style.display = 'block'; cwEl.style.visibility = ''; }
  const rpEl = document.getElementById('right-panel');
  if (rpEl) { rpEl.style.display = 'flex'; rpEl.style.visibility = ''; }
  const lb = document.getElementById('leaderboard');
  if (lb) lb.innerHTML = '';
  timeupOverlay.style.display = 'none';
  timeupOverlay.classList.remove('timeup-in', 'timeup-out');
  resultLabel.className = '';
  resultLabel.classList.remove('visible');

  // Construye un `state` MÍNIMO propio (no resetState(), que arma pools de
  // ciudades/monumentos/práctica pensados para partida REAL) — render() solo
  // necesita estos campos.
  state = {
    phase: 'waiting',
    timeLeft: GAME_DURATION,
    score: 0, displayedScore: 0, dots: 0,
    currentCity: null, cityShownAt: 0,
    placedDots: [], pin1Anim: null, pin2Anim: null,
    starParticles: [], sunburst: null, badgeAnim: null,
    lastTimestamp: null, streak: 0, mapDrawn: false,
  };
  // updateDotsUI() lee state.dots (recién en 0) para des-rellenar los
  // puntitos del trencito — sin esto quedaban "filled" con lo último que
  // dejó otro modo/partida espectada antes en esta misma pestaña, ya que
  // nada más los toca hasta la PRÓXIMA respuesta correcta. progressContainer
  // también puede haber quedado con las clases del ciclo de vaciado en curso.
  progressContainer.classList.remove('train-animation', 'dots-fade-out');
  updateDotsUI();
  timerNumberEl.textContent = GAME_DURATION;
  timerNumberEl.classList.remove('timer-number-infinity');
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown.png';
  countdownImg.style.animationPlayState = 'running';

  // Visible desde ya, haya o no un 3-2-1 en curso — #pregame-countdown es un
  // overlay TRANSPARENTE (sin background, ver CSS), así que el jugador real
  // ve el mapa detrás del número desde el primer instante del 3-2-1. Antes
  // citiesSpectatorShowPregame() lo ocultaba de nuevo pensando que el mapa
  // debía estar tapado durante la cuenta — dejaba al espectador con pantalla
  // en blanco hasta que terminaba, a diferencia del jugador real.
  gameWrapper.style.display = 'block';
  // redimensionarJuego() se sale de una (no hace NADA) si gameWrapper todavía
  // tiene display:none — por eso tiene que ir DESPUÉS de mostrarlo, no antes.
  // Con el orden viejo, esta llamada era un no-op silencioso: el mapa quedaba
  // con el transform/escala VIEJO (de la última vez que se calculó, o
  // ninguno) durante todo el 3-2-1, recién corrigiéndose cuando
  // citiesSpectatorShowPregame() lo volvía a llamar en su onDone — el
  // "mapimage descolocado durante el 3-2-1-GO, recién se acomoda al empezar
  // el juego" reportado.
  redimensionarJuego();
  cityTagEl.style.visibility = 'hidden';
  // slideMonumentIn() deja cityTagEl POSICIONADO en su punto de llegada
  // visible (left:-50/top:-55, ver esa función) — visibility:hidden solo lo
  // tapa, pero sigue "parado" ahí. slideTagIn() (la entrada real de Ciudades)
  // anima DESDE la posición actual del elemento HACIA la de llegada — si ya
  // arranca en la de llegada (la de Monumentos, que coincide visualmente),
  // no hay nada que recorrer: el tag aparecía de una, ya en su lugar ("al
  // medio"), en vez de deslizarse de izquierda a derecha como corresponde.
  // Mismo reset de posición de arranque que hace startGame() real.
  cityTagEl.style.transition = 'none';
  cityTagEl.style.left = tpx(-525);
  cityTagEl.style.top  = tpx(-163);
  monumentImgEl.style.display = 'none';
  // Reset del <img> del cartel a tag3.png — slideTagIn() NUNCA lo toca (da
  // por sentado que ya vale tag3.png, como deja startGame() real); si el
  // espectador venía de mirar Monumentos en esta misma pestaña, slideMonumentIn
  // lo había dejado en photo.png y quedaba pegado ahí para siempre en Cities.
  const _cityTagImg = cityTagEl.querySelector('img');
  // slideMonumentIn() deja la clase 'monument-appear' (animación de escala,
  // ver @keyframes en style.css) puesta en este mismo <img> — a diferencia
  // de startGame() (real, ver más abajo en este archivo), este reset de
  // espectador nunca la sacaba. Con la clase todavía puesta, el próximo
  // slideTagIn() de Cities dispara SU animación de entrada (movimiento)
  // ENCIMA de la de monument-appear que quedó pendiente — dos animaciones de
  // entrada superpuestas, la vieja (monuments, da la sensación de "zoom out"
  // al terminar/revertir) y la correcta (el "el tag3 hace dos animaciones de
  // entrada en modo espectador" reportado — únicamente ahí, porque el
  // jugador real sí pasa por startGame(), que ya la sacaba).
  if (_cityTagImg) { _cityTagImg.src = 'images/tag3.png'; _cityTagImg.style.width = ''; _cityTagImg.style.height = ''; _cityTagImg.classList.remove('monument-appear'); }
  monumentImgEl.classList.remove('monument-appear');
  cityTagText.style.display = '';
  // Ocultar/limpiar el nombre del MONUMENTO (monumentNameEl, elemento
  // DISTINTO de cityTagText) — si el espectador venía de mirar Monumentos,
  // ese nombre quedaba visible encima del cartel de Cities (el "sigue
  // mostrando el nombre de monumentos en el tag3 de ciudades" reportado).
  // CRÍTICO: cancelar también el setTimeout con delay de slideMonumentIn
  // (_nameTimer) — ese timer setea monumentNameEl.textContent DESPUÉS de un
  // delay para la animación; si estaba pendiente al transicionar a Cities,
  // disparaba más tarde y RE-ESCRIBÍA el nombre del monumento encima del
  // cartel de la ciudad, aunque ya lo hubiéramos limpiado acá.
  if (typeof slideMonumentIn === 'function' && slideMonumentIn._nameTimer) {
    clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null;
  }
  if (monumentNameEl) { monumentNameEl.textContent = ''; monumentNameEl.style.opacity = '0'; }
  // Sacar cualquier "ghost" del cartel que haya quedado de Monumentos — es un
  // clon de #city-tag (que incluye un clon de #monument-name con su texto) y
  // se auto-remueve solo después de ~800ms, pero durante ese rato mostraría
  // el nombre del monumento encima de Cities.
  document.querySelectorAll('.city-tag-ghost').forEach(g => g.remove());

  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(render);

  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// switchingMode=true: la campaña del espectado encadenó a OTRO modo — ver
// comentario largo en flagsSpectatorExit (mismo mecanismo acá).
window.citiesSpectatorExit = function (switchingMode) {
  _citiesSpecMode = false;
  if (!switchingMode) window._isSpectating = false;
  // Ver comentario largo en flagsSpectatorExit.
  document.getElementById('cities-spec-lb-entry')?.remove();
  document.getElementById('cities-spec-lb-opp')?.remove();
  // Igual que el quit REAL: sin esto, el showStep() del 3-2-1 seguía
  // corriendo solo en segundo plano (nunca se abortaba), y eventualmente
  // llegaba a su onDone() — que arranca sfxGameMusic — PISANDO la música de
  // menú que closeSpectator() ya había puesto momentos antes. También el
  // beep del countdown (sfxCountdown) seguía sonando de fondo porque nada
  // lo pausaba.
  pregameAborted = true;
  clearTimeout(pregameTimeout); pregameTimeout = null;
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  _citiesSpecLastCard = null;
  mapGameOver = true;
  clearTimeout(_citiesSpecTimesUpT1); clearTimeout(_citiesSpecTimesUpT2);
  window.citiesSpectatorHidePostgame();
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  // window._vsShowingResult (ver _exitWaitAsSpectator en vs.js, mismo guard
  // en flagsSpectatorExit/shapesSpectatorExit): este exit no es un
  // espectador EXTERNO cerrando su sesión — es EL PROPIO JUGADOR a punto de
  // ver SU PROPIO resultado del duelo. Sin este guard, el mapa/estado del
  // juego desaparecía (gameWrapper oculto + state=null) antes de que
  // apareciera el overlay de resultado, en vez de quedar congelado de fondo
  // (el "se quitan los assets de fondo" reportado, mismo bug que en
  // banderas/siluetas).
  if (!window._vsShowingResult) {
    gameWrapper.style.display = 'none';
    state = null;
  }
  scoreDisplayEl.style.display = 'none';
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'none';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'none';
  const lb = document.getElementById('leaderboard');
  if (lb) lb.innerHTML = '';
  cityTagEl.style.visibility = 'hidden';
  timeupOverlay.style.display = 'none';
  timeupOverlay.classList.remove('timeup-in', 'timeup-out');
  pregameCountdownEl.style.display = 'none';
  if (!switchingMode) {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'flex';
  }
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// Cuenta 3-2-1: reusa el 100% de runPregameCountdown (mismo patrón que
// runFlagsPregame/runShapesPregame en sus propios archivos).
window.citiesSpectatorShowPregame = function (payload) {
  if (!_citiesSpecMode) return;
  // Sincrónico, apenas llega el broadcast — lo usa el timer de "fallback" de
  // citiesSpectatorShowRound para decidir si de verdad hay un 3-2-1 en curso
  // o si nadie va a mandar un pregame (unión a mitad de partida).
  _citiesSpecPregameSeen = true;
  window.citiesSpectatorHidePostgame();
  // NO ocultar gameWrapper acá — ver el comentario largo en
  // citiesSpectatorEnter(). El mapa debe quedar visible DETRÁS del 3-2-1
  // desde el primer instante, igual que ve el jugador real.
  cityTagEl.style.visibility = 'hidden';
  // NO ocultar #countdown-widget acá — mismo motivo que gameWrapper más
  // arriba: startGame() real (línea ~6040) lo deja VISIBLE desde el arranque
  // (solo se oculta en el caso especial de "recording-mode" de Monumentos,
  // que no aplica a Cities), solo pausa su animación con
  // animationPlayState — eso sí se replica un poco más abajo.
  if (payload) {
    timerNumberEl.classList.toggle('timer-number-infinity', !!payload.infinite);
    timerNumberEl.textContent = payload.infinite ? '∞' : (payload.duration != null ? payload.duration : '');
  }
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown.png';
  countdownImg.style.animationPlayState = 'paused';
  if (typeof playMusic === 'function') playMusic(null);
  // El jugador real ya muestra su puntaje acumulado de campaña desde el
  // arranque del 3-2-1 (no arranca en 0 salvo que sea el primer modo) — acá
  // sin animación, es el estado base antes de la primera respuesta. render()
  // solo anima displayedScore->score cuando difieren, así que arrancar
  // ambos iguales no dispara ningún tween de más.
  if (payload && typeof payload.campaignBaseAtStart === 'number' && state) {
    state.score = payload.campaignBaseAtStart;
    state.displayedScore = payload.campaignBaseAtStart;
    scoreValueEl.textContent = payload.campaignBaseAtStart.toLocaleString();
  }
  let elapsedMs = (payload && typeof payload.startedAt === 'number') ? (Date.now() - payload.startedAt) : 0;
  // Mismo clamp que flags/shapes: sin esto, desfasaje de reloj o un resend
  // tardío podían inflar elapsedMs más allá de la duración total del 3-2-1 y
  // saltar DIRECTO a onDone sin mostrar nada del conteo.
  const _pregameTotalMs = PREGAME_STEPS.reduce((s, x) => s + x.hold, 0);
  if (elapsedMs > _pregameTotalMs - 400) elapsedMs = Math.max(0, _pregameTotalMs - 400);
  runPregameCountdown(() => {
    const cwPost = document.getElementById('countdown-widget');
    if (cwPost) cwPost.style.visibility = '';
    countdownImg.style.animationPlayState = 'running';
    if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
    redimensionarJuego();
    gameWrapper.style.display = 'block';
  }, elapsedMs);
};

// payload = { mode:'game', index, cityName, countryCode, lat, lon, timeLeft }
window.citiesSpectatorShowRound = function (payload) {
  if (!_citiesSpecMode || !state) return;
  // Mismo círculo de espera que flags.js/shapes.js apagan acá (ver
  // _showVsWaitSpinner/_hideVsWaitSpinner en vs.js) — cities/monuments no lo
  // tenían, así que en sala grupal se quedaba pegado hasta un timeout aparte.
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  // OJO: NO se tocan pin1Anim/pin2Anim/resultLabel acá — el nextCity() REAL
  // tampoco los toca. El jugador real llama a nextCity() ~750ms después del
  // click (300ms hasta que aparece pin2 + ~100ms hasta que "aterriza" +
  // ~350ms más en el onLanded), bien ANTES de que los pines empiecen a
  // fadear solos (eso recién arranca a partir de 1000-1300ms desde el
  // click, con sus propios setTimeout independientes armados en
  // citiesSpectatorResolvePick). Si acá los borrábamos de golpe apenas
  // llegaba la ronda siguiente, les cortábamos el fade a la mitad — se
  // veían desaparecer de golpe en vez de irse apagando, el "sin animación"
  // reportado. Dejarlos solos: se limpian de forma natural cuando su propio
  // fade termina (opacity<=0 → state.pinXAnim=null, ver render()).
  state.phase = 'waiting';
  state.cityShownAt = Date.now();
  state.currentCity = { name: payload.cityName, country: payload.countryCode, lat: payload.lat, lon: payload.lon };
  // Garantizar que el nombre del MONUMENTO (monumentNameEl, hijo de #city-tag)
  // quede limpio en CADA ronda de Cities — no solo en el enter. Si el
  // espectador venía de Monumentos, ese nombre podía quedar con texto/opacidad
  // (y slideTagIn clona #city-tag para su ghost, arrastrándolo). Cancelar
  // también el timer con delay de slideMonumentIn por si quedó pendiente.
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  if (monumentNameEl) { monumentNameEl.textContent = ''; monumentNameEl.style.opacity = '0'; }
  slideTagIn(payload.cityName, payload.countryCode);
  if (typeof payload.timeLeft === 'number') {
    state.timeLeft = payload.timeLeft;
    timerNumberEl.textContent = payload.timeLeft;
    timerNumberEl.classList.remove('timer-number-infinity');
  }
  // Igual mecanismo que flags.js/shapes.js: solo en la primera ronda tras
  // entrar, un margen corto para confirmar si de verdad viene un pregame
  // (llega poco después, mismo orden real de broadcasts). Si no aparece, es
  // unión a mitad de partida — recién ahí, con la ronda ya mostrada, arranca
  // la música del juego (si hay pregame, la arranca su propio onDone al
  // terminar el 3-2-1) — sin esto, un espectador que se unía a mitad de
  // partida se quedaba con sfxMenuMusic sonando de fondo para siempre.
  if (_citiesSpecIsFirstRound) {
    _citiesSpecIsFirstRound = false;
    setTimeout(() => {
      if (!_citiesSpecPregameSeen && typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') {
        playMusic(sfxGameMusic);
      }
    }, 400);
  }
};

// payload = { correct, score, grade, clickX, clickY, correctX, correctY, distKm, totalGained, bonusAmt }
// Recrea pin1Anim/pin2Anim EXACTAMENTE como el click handler real (línea
// ~5008 de este archivo) — mismas coordenadas de canvas (portables 1:1, mismo
// DISPLAY_W/H) — así que render() los anima e interpola solo, sin tocarlo.
window.citiesSpectatorResolvePick = function (payload) {
  if (!_citiesSpecMode || !state || !state.currentCity) return;
  const { grade, clickX, clickY, correctX, correctY, distKm, totalGained, bonusAmt } = payload;
  if (typeof clickX !== 'number' || typeof correctX !== 'number') return;
  state.phase = 'animating';
  if (typeof sfxPin !== 'undefined' && typeof sfxPlay === 'function') { sfxPin.currentTime = 0; sfxPlay(sfxPin); }

  // payload.score YA viene con campaignBase() sumado (ver _specReportAnswer
  // en el jugador real) — solo hace falta actualizar state.score, render()
  // anima state.displayedScore hacia ahí solo (línea ~5340), igual que ve
  // el propio jugador. Antes esto nunca se seteaba acá (el dispatch de
  // spectate.js solo llama resolvePick, no updateScore, para espectado
  // solo/campaña) — el marcador quedaba congelado toda la ronda.
  if (typeof payload.score === 'number') state.score = payload.score;

  // "+puntos" flotante — SOLO lo del acierto, SIN el inRowBonus (que va aparte
  // en el badge "IN A ROW"), igual que el jugador real.
  const _acierto = totalGained - (payload.inRowBonus || 0);
  if (typeof totalGained === 'number' && _acierto > 0 && typeof showScorePopup === 'function') {
    showScorePopup(_acierto);
  }
  // Cartel de bonus de velocidad — mismo toggle que el click handler real.
  if (typeof bonusAmt === 'number' && bonusAmt > 0) {
    clearTimeout(speedBonusHideId);
    speedBonusText.classList.remove('visible');
    void speedBonusText.offsetWidth;
    speedBonusText.classList.add('visible');
    speedBonusHideId = setTimeout(() => speedBonusText.classList.remove('visible'), 1600);
  }

  let _dotFontSize = 11;
  ctx.font = `bold ${_dotFontSize}px Georgia`;
  const _dotLabel = (typeof tCity === 'function') ? tCity(state.currentCity.name) : state.currentCity.name;
  while (_dotFontSize > 7 && ctx.measureText(_dotLabel).width > 90) {
    _dotFontSize--;
    ctx.font = `bold ${_dotFontSize}px Georgia`;
  }
  state.placedDots.push({
    x: correctX, y: correctY, name: state.currentCity.name,
    labelOpacity: 1, labelBorn: Date.now(),
    permanent: grade === 'perfect', fontSize: _dotFontSize,
  });

  // advanceDot() (la misma función que usa el jugador real) hace TODO: suma
  // el punto, dibuja el trencito, y si llega a 10 dispara el "+5s" con su
  // popup y la animación de vaciado — reusarla acá evita reimplementar esa
  // secuencia a mano. payload.dots trae el valor REAL post-incremento del
  // jugador espectado — se pisa el contador local ANTES de llamar a
  // advanceDot() (que hace state.dots++ internamente) para que quede
  // exactamente en payload.dots, así el trencito llena/vacía en el mismo
  // momento que ve el jugador real, sin importar en qué punto de la partida
  // se unió el espectador.
  if (grade !== 'wayoff' && typeof advanceDot === 'function') {
    if (typeof payload.dots === 'number') state.dots = payload.dots - 1;
    advanceDot();
  }

  state.pin1Anim = { x: clickX, y: clickY, targetX: correctX, targetY: correctY,
    distKm, grade, progress: 0, lineProgress: 0, opacity: 1, fading: false,
    wobbleTime: 0, sunburstSpawned: false };
  const capturedPin1 = state.pin1Anim;

  setTimeout(() => {
    if (!_citiesSpecMode || state.pin1Anim !== capturedPin1) return; // ronda ya cambió
    state.pin2Anim = { x: correctX, y: correctY, progress: 0, opacity: 1, fading: false,
      wobbleTime: 0, starsSpawned: false,
      onLanded: () => {
        spawnStars(correctX, correctY);
        setTimeout(() => {
          if (!_citiesSpecMode) return;
          showResultLabel(correctX, correctY, grade, 0, 0);
          // Badge "IN A ROW" — mismo mecanismo que el espectador de Monuments
          // (ver monumentsSpectatorResolvePick): payload.streak viaja como
          // número y getBadgeImg lo reconstruye local. Ahora Cities también
          // manda streak/inRowBonus reales (ver score de Cities), así que el
          // badge se ve igual que para el jugador.
          if (typeof payload.streak === 'number' && typeof getBadgeImg === 'function') {
            const badgeColor = getBadgeImg(payload.streak);
            if (badgeColor) {
              state.badgeAnim = { t: 0, img: badgeColor, streak: payload.streak, inRowBonus: payload.inRowBonus || 0 };
              setTimeout(() => { if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); } }, 800);
            }
          }
        }, 200);
      },
    };
    const capturedPin2 = state.pin2Anim;
    setTimeout(() => { if (state.pin2Anim === capturedPin2) capturedPin2.fading = true; }, 1000);
  }, 300);
  setTimeout(() => { if (state.pin1Anim === capturedPin1) capturedPin1.fading = true; }, 1000);
};

window.citiesSpectatorUpdateTimer = function (timeLeft) {
  if (!_citiesSpecMode || !state) return;
  state.timeLeft = timeLeft;
  timerNumberEl.textContent = timeLeft;
  timerNumberEl.classList.remove('timer-number-infinity');
  if (timeLeft <= 10) {
    timerNumberEl.style.color = '#ffffff';
    countdownImg.src = 'images/countdownred.png';
    const _nowTick = Date.now();
    if (timeLeft > 0 && timeLeft !== _citiesSpecLastTick && (_nowTick - _citiesSpecLastTickSoundAt) > 700
        && typeof sfxTickdown !== 'undefined') {
      sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown);
      _citiesSpecLastTickSoundAt = _nowTick;
    }
  } else {
    timerNumberEl.style.color = '';
    countdownImg.src = 'images/countdown.png';
  }
  _citiesSpecLastTick = timeLeft;
};

// score = puntaje actual del jugador real (viene del broadcast de 'answer').
// El "conteo subiendo" hasta ahí lo anima render() solo (compara
// state.displayedScore contra state.score cada frame) — no hace falta nada
// más acá.
// Este dispatch (fns.updateScore) se usa para "ponerse al día" al unirse a
// mitad de ronda (onScoreSync, ver spectate.js), no para una respuesta en
// vivo (esa pasa por citiesSpectatorResolvePick, que también fija
// state.score pero deja que render() anime la subida). Acá se fija también
// displayedScore para que aparezca directo, sin un salto animado desde 0
// apenas se conecta.
window.citiesSpectatorUpdateScore = function (score, dots) {
  if (!_citiesSpecMode || !state) return;
  state.score = score;
  state.displayedScore = score;
  scoreValueEl.textContent = (score + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
  // dots: progreso YA acumulado del trencito de puntitos al momento de
  // conectarse — sin esto, alguien que se unía a mitad de partida veía el
  // trencito vacío hasta la PRÓXIMA respuesta correcta del jugador real, en
  // vez del progreso real que ya llevaba acumulado.
  if (typeof dots === 'number') {
    state.dots = Math.max(0, Math.min(dots, DOTS_NEEDED - 1));
    updateDotsUI();
  }
};

// Tarjeta única en #leaderboard con el jugador REAL espectado — mismo patrón
// que flagsSpectatorSetPlayerCard/shapesSpectatorSetPlayerCard, pero acá el
// leaderboard real ya viene con el guard `if (window._isSpectating) return;`
// en initLeaderboard() (puesto ahí mismo pensando en este caso). #leaderboard
// SÍ es compartido con la lógica normal de resize/zoom de Cities/Monuments
// (ver window.addEventListener('resize', ...) más abajo en el archivo, que
// ahora llama a citiesSpectatorReposition() en vez de positionLeaderboard()
// mientras se espectea) — por eso se cachean name/avatar/score, para poder
// reaplicar la altura de 1 fila correcta sin necesitar esos datos de nuevo.
let _citiesSpecLastCard = null;
// oppName/oppAvatar/oppScore (opcionales): en versus, el rival del amigo
// espectado — antes esta función solo mostraba al amigo (redundante con el
// marcador principal, que YA lo muestra), y el rival no aparecía en ningún
// lado. Ahora arma una SEGUNDA fila (mismo estilo lb-vsopp que usa el
// jugador real para el suyo), para que el espectador vea las dos casillas
// actualizándose en vivo, igual que ven los jugadores reales.
window.citiesSpectatorSetPlayerCard = function (name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode) {
  if (!_citiesSpecMode) return;
  _citiesSpecLastCard = { name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode };
  const lb = document.getElementById('leaderboard');
  if (!lb) return;
  const rowH = getLbRowHeight();
  const showOpp = !!oppName;
  // #leaderboard recorta todo lo que quede fuera de su propio alto con
  // clip-path:inset(0 -300px) (0 arriba/abajo — CSS lo aclara: "corta solo en
  // vertical, deja pasar el globo a la izquierda"). El emote-bubble de
  // wrongEffect se dibuja POR ENCIMA de su fila (bottom:calc(80%-...), "encima
  // del entry" dice el propio CSS) — si la fila de arriba queda pegada
  // exactamente en top:0 del contenedor (como quedaba acá, sin margen extra),
  // ese globo nace ya recortado por el clip-path antes de llegar a
  // mostrarse. TOP_MARGIN reserva aire arriba para que tenga dónde
  // dibujarse — el leaderboard real no lo sufre porque su ventana de varias
  // filas normalmente deja margen de sobra arriba de la fila que emota.
  const TOP_MARGIN = Math.round(rowH * 0.4);
  lb.style.height = (showOpp ? rowH * 2 + LB_GAP + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';
  let el = document.getElementById('cities-spec-lb-entry');
  if (!el) {
    el = document.createElement('div');
    el.className = 'lb-entry lb-player';
    el.id = 'cities-spec-lb-entry';
    el.style.top = TOP_MARGIN + 'px';
    el.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" id="cities-spec-lb-avatar" src="images/profilepic/ppdefault.png"></div>`
      + `<span class="lb-name" id="cities-spec-lb-name"></span>`
      + `<span class="lb-score" id="cities-spec-lb-score">0</span>`;
    lb.appendChild(el);
  }
  const nameEl = document.getElementById('cities-spec-lb-name');
  if (nameEl) nameEl.textContent = name || 'Jugador';
  const avatarEl = document.getElementById('cities-spec-lb-avatar');
  if (avatarEl && avatar) avatarEl.src = avatar;
  const scoreEl = document.getElementById('cities-spec-lb-score');
  if (scoreEl) scoreEl.textContent = (score || 0).toLocaleString();
  window.CustomizeAssets?.applyCard(el, cardCode || '0001');

  let oppEl = document.getElementById('cities-spec-lb-opp');
  if (showOpp) {
    if (!oppEl) {
      oppEl = document.createElement('div');
      oppEl.className = 'lb-entry lb-vsopp';
      oppEl.id = 'cities-spec-lb-opp';
      oppEl.style.top = (TOP_MARGIN + rowH + LB_GAP) + 'px';
      oppEl.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" id="cities-spec-lb-opp-avatar" src="images/profilepic/ppdefault.png"></div>`
        + `<span class="lb-name" id="cities-spec-lb-opp-name"></span>`
        + `<span class="lb-score" id="cities-spec-lb-opp-score">0</span>`;
      lb.appendChild(oppEl);
    }
    window.CustomizeAssets?.applyCard(oppEl, oppCardCode || '0001');
    const oppNameEl = document.getElementById('cities-spec-lb-opp-name');
    if (oppNameEl) oppNameEl.textContent = oppName || 'Rival';
    const oppAvatarEl = document.getElementById('cities-spec-lb-opp-avatar');
    if (oppAvatarEl && oppAvatar) oppAvatarEl.src = oppAvatar;
    const oppScoreEl = document.getElementById('cities-spec-lb-opp-score');
    if (oppScoreEl) oppScoreEl.textContent = (oppScore || 0).toLocaleString();
    // Reordenar según puesto actual — mismo criterio que positionLeaderboard()
    // real (mayor puntaje arriba), aprovechando la misma transition:top del
    // CSS de .lb-entry para que el cambio de puesto se vea animado, no de
    // golpe. Antes las dos filas quedaban SIEMPRE en el mismo orden fijo
    // (amigo arriba, rival abajo) sin importar quién iba ganando.
    const friendOnTop = (score || 0) >= (oppScore || 0);
    el.style.top    = (TOP_MARGIN + (friendOnTop ? 0 : rowH + LB_GAP)) + 'px';
    oppEl.style.top = (TOP_MARGIN + (friendOnTop ? rowH + LB_GAP : 0)) + 'px';
  } else if (oppEl) {
    oppEl.remove();
  } else {
    el.style.top = TOP_MARGIN + 'px';
  }
};

// Flash de "wrong" en la fila del espectador — target: 'friend' | 'opponent'.
// Mismo mecanismo visual que _lbWrongEffect (animación lb-wrong-flash/
// lb-shake + emote), pero sobre las filas propias del espectador en vez de
// lbElements (esas ni existen mientras se espectea, initLeaderboard() está
// bloqueada con el guard window._isSpectating).
window.citiesSpectatorWrongEffect = function (target) {
  if (!_citiesSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'cities-spec-lb-opp' : 'cities-spec-lb-entry');
  if (!el) return;
  el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // z-index elevado mientras dura el emote — ambas filas (.lb-player/
  // .lb-vsopp) comparten el mismo z-index base, así que cuál queda "arriba"
  // en un empate depende del orden en el DOM, no de quién tiene el emoji
  // activo. Sin este boost temporal, la fila con el emoji podía quedar
  // tapada por la otra durante la animación de reordenar puestos (top
  // transition), que las hace superponerse un instante.
  const prevZ = el.style.zIndex;
  el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 1800);
  if (typeof spawnEmoteBubble === 'function') spawnEmoteBubble(el);
};

// Reaplica altura/posición de la tarjeta tras un resize/zoom — ver el
// addEventListener('resize', ...) de más abajo. No hace falta si nunca se
// llegó a mostrar ninguna tarjeta (_citiesSpecLastCard null).
window.citiesSpectatorReposition = function () {
  if (!_citiesSpecMode || !_citiesSpecLastCard) return;
  window.citiesSpectatorSetPlayerCard(_citiesSpecLastCard.name, _citiesSpecLastCard.avatar, _citiesSpecLastCard.score);
};

window.citiesSpectatorShowTimesUp = function () {
  if (!_citiesSpecMode) return;
  clearTimeout(_citiesSpecTimesUpT1);
  clearTimeout(_citiesSpecTimesUpT2);
  if (typeof playMusic === 'function') playMusic(null);
  if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
  countdownImg.style.animationPlayState = 'paused';
  timeupOverlay.style.display = 'flex';
  timeupOverlay.classList.remove('timeup-out');
  timeupOverlay.classList.add('timeup-in');
  _citiesSpecTimesUpT1 = setTimeout(() => {
    if (!_citiesSpecMode) return;
    timeupOverlay.classList.remove('timeup-in');
    timeupOverlay.classList.add('timeup-out');
    _citiesSpecTimesUpT2 = setTimeout(() => {
      if (!_citiesSpecMode) return;
      timeupOverlay.style.display = 'none';
      timeupOverlay.classList.remove('timeup-out');
    }, 400);
  }, 1800);
};

// Pantalla de resultados (solo camino solo/campaña — versus tiene su propia
// pantalla W/L, no cubierta acá). Solo-lectura: pointer-events:none + confirm
// oculto, igual que flags/shapes.
window.citiesSpectatorShowPostgame = function (payload) {
  if (!_citiesSpecMode) return;
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'none';
  gameoverScreen.classList.remove('mode-flags', 'mode-shapes', 'mode-monuments');
  gameoverScreen.style.pointerEvents = 'none';
  // Mismo swap de sprites que hace loading-play-btn del jugador real —
  // elementos COMPARTIDOS entre modos.
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level3complete.png');
  // Mismo swap para los íconos grandes de correctas/incorrectas — faltaba
  // del todo acá (a diferencia de los sprites de arriba, que sí se
  // actualizaban), así que quedaban con lo último que dejó OTRO modo
  // (ej. check2/wrong2 de Siluetas) en vez de check3/wrong3 de Ciudades.
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check3.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong3.png');
  if (typeof window.hideGameoverConfirm === 'function') window.hideGameoverConfirm();
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = 'none';
  gameoverScreen.style.display = 'flex';
  const label = gameoverScreen.querySelector('.gameover-text1-label');
  if (label) label.textContent = (typeof t === 'function') ? t('gameover.cities') : 'City Blitz';
  if (finalScoreEl) finalScoreEl.textContent = (payload.totalScore || 0).toLocaleString();
  if (newHighscoreBanner) newHighscoreBanner.style.display = payload.isNewHighscore ? 'flex' : 'none';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'none';
  // Reconstruye las filas de íconos individuales (correctas/incorrectas) con
  // los conteos reales del jugador espectado — buildChecksRow()/
  // buildWrongsRow() reales usan gradeCounts/wrongCount (estado LOCAL del
  // jugador, que acá no existe), así que se arma una versión simple propia
  // reusando getModeCheckImg()/getModeWrongImg() (ya devuelven check3/wrong3
  // para 'game' vía window.pendingGameMode). Sin esto, las filas quedaban
  // con la cantidad Y el ícono de la ÚLTIMA vez que se armaron de verdad.
  {
    const nCorrect = payload.correctCount || 0;
    const checksEndTime = _specBuildCountRow(
      document.getElementById('gameover-checks-row'),
      gameoverScreen.querySelector('.game-bg-check3'),
      gameoverScreen.querySelector('.grade-count-total'),
      nCorrect, (typeof getModeCheckImg === 'function') ? getModeCheckImg() : 'images/check3.png', 0);
    _specBuildCountRow(
      document.getElementById('gameover-wrongs-row'),
      gameoverScreen.querySelector('.game-bg-wrong3'),
      gameoverScreen.querySelector('.wrong-count-total'),
      payload.wrongCount || 0, (typeof getModeWrongImg === 'function') ? getModeWrongImg() : 'images/wrong3.png',
      // Igual que endGame() real: las incorrectas arrancan recién cuando
      // termina de entrar la fila de correctas, no las dos a la vez.
      (nCorrect > 0 ? (nCorrect - 1) * 0.1 + 0.2 : 0) + 0.4);
  }
  const wrongTotalEl = document.getElementById('gameover-wrong-total');
  if (wrongTotalEl) wrongTotalEl.textContent = payload.wrongCount || 0;
  const splashWrongEl = document.getElementById('splash-wrong-total');
  if (splashWrongEl) splashWrongEl.textContent = payload.wrongCount || 0;
  // Contraparte de correctas — mismo elemento que actualiza updateGradeCountsUI()
  // en el jugador real (gradeCounts.perfect+good+fair, estado LOCAL que acá no
  // existe) — faltaba del todo, se quedaba con el número de la ÚLTIMA partida
  // real jugada en esta pestaña en vez del conteo del jugador espectado.
  const correctTotalEl = document.getElementById('gameover-count-total');
  if (correctTotalEl) correctTotalEl.textContent = payload.correctCount || 0;
  const splashCorrectEl = document.getElementById('splash-count-total');
  if (splashCorrectEl) splashCorrectEl.textContent = payload.correctCount || 0;
  // Igual que endGame() real: el marcador tampoco tiene sentido en la
  // pantalla de resultados — sin esto quedaba pegado, visible de fondo.
  scoreDisplayEl.style.display = 'none';
  if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
};

window.citiesSpectatorHidePostgame = function () {
  if (gameoverScreen) { gameoverScreen.style.display = 'none'; gameoverScreen.style.pointerEvents = ''; }
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = '';
};
// ═════════════════════════════════════════════════════════════════════════════

// ── MONUMENTS SPECTATOR (espectador de partida individual) ────────────────────
// Mismo patrón exacto que el bloque de Cities de arriba — misma pantalla real
// (#game-wrapper/canvas/leaderboard), mismo `state` mínimo, misma reutilización
// de render()/advanceDot(). Lo único que cambia es la revelación de la ronda
// (slideMonumentIn en vez de slideTagIn — imagen del monumento en vez de
// nombre de ciudad+bandera), los assets (check4/wrong4/countdown4/
// countdownred4, fondo level4complete/level4complete2) y el texto de
// resultados ('gameover.monuments').
let _monumentsSpecMode = false;
let _monumentsSpecTimesUpT1 = null, _monumentsSpecTimesUpT2 = null;
let _monumentsSpecIsFirstRound = true;
let _monumentsSpecPregameSeen  = false;
let _monumentsSpecLastTick = null;
let _monumentsSpecLastTickSoundAt = 0;

window.monumentsSpectatorEnter = function () {
  _monumentsSpecMode = true;
  window._isSpectating = true;
  _monumentsSpecLastTick = null;
  _monumentsSpecLastTickSoundAt = 0;
  _monumentsSpecIsFirstRound = true;
  _monumentsSpecPregameSeen  = false;
  window.pendingGameMode = 'monuments';
  _monumentsSpecLastCard = null;
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';
  if (typeof loadGameSFX === 'function') loadGameSFX();
  if (typeof loadBadges === 'function') loadBadges();
  // Restos de otros modos espectados antes en esta misma pestaña sin pasar
  // por su propio Exit — mismo caso ya resuelto en flags.js/shapes.js/cities.
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
  document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
  document.getElementById('shapes-countdown-widget')?.remove();
  document.getElementById('flags-wrapper')?.style.setProperty('display', 'none');
  document.getElementById('flags-luggage-wrap')?.style.setProperty('display', 'none');
  document.getElementById('flags-flagid-wrap')?.style.setProperty('display', 'none');
  ['flags-machine', 'flags-machine2', 'flags-machine3', 'flags-machine3b'].forEach(id => {
    const m = document.getElementById(id);
    if (m) { m.style.display = 'none'; m.style.animationPlayState = ''; m.classList.remove('scrolling'); }
  });
  document.getElementById('flags-countdown-widget')?.style.setProperty('display', 'none');
  document.getElementById('flags-right-panel')?.style.setProperty('display', 'none');

  mapGameOver = false;
  gameAborted = false;
  clearInterval(timerIntervalId); timerIntervalId = null;
  clearTimeout(pregameTimeout);
  clearTimeout(_monumentsSpecTimesUpT1); clearTimeout(_monumentsSpecTimesUpT2);
  canvas.style.pointerEvents = 'none'; // solo-lectura: no hay click que resolver
  if (canvas.width < DISPLAY_W) { canvas.width = DISPLAY_W; canvas.height = DISPLAY_H; }
  if (badgeOverlay.width < DISPLAY_W) { badgeOverlay.width = DISPLAY_W; badgeOverlay.height = DISPLAY_H; }

  scoreDisplayEl.style.display = 'block';
  scoreValueEl.textContent = '0';
  speedBonusText.style.display = '';
  speedBonusText.classList.remove('visible');
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) { cwEl.style.display = 'block'; cwEl.style.visibility = ''; }
  const rpEl = document.getElementById('right-panel');
  if (rpEl) { rpEl.style.display = 'flex'; rpEl.style.visibility = ''; }
  const lb = document.getElementById('leaderboard');
  if (lb) lb.innerHTML = '';
  timeupOverlay.style.display = 'none';
  timeupOverlay.classList.remove('timeup-in', 'timeup-out');
  resultLabel.className = '';
  resultLabel.classList.remove('visible');

  // Construye un `state` MÍNIMO propio (no resetState(), que arma pools de
  // ciudades/monumentos/práctica pensados para partida REAL) — render() solo
  // necesita estos campos.
  state = {
    phase: 'waiting',
    timeLeft: GAME_DURATION,
    score: 0, displayedScore: 0, dots: 0,
    currentCity: null, cityShownAt: 0,
    placedDots: [], pin1Anim: null, pin2Anim: null,
    starParticles: [], sunburst: null, badgeAnim: null,
    lastTimestamp: null, streak: 0, mapDrawn: false,
  };
  // updateDotsUI() lee state.dots (recién en 0) para des-rellenar los
  // puntitos del trencito — sin esto quedaban "filled" con lo último que
  // dejó otro modo/partida espectada antes en esta misma pestaña.
  progressContainer.classList.remove('train-animation', 'dots-fade-out');
  updateDotsUI();
  timerNumberEl.textContent = GAME_DURATION;
  timerNumberEl.classList.remove('timer-number-infinity');
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown4.png';
  countdownImg.style.animationPlayState = 'running';

  // Visible desde ya, haya o no un 3-2-1 en curso — mismo motivo que en
  // citiesSpectatorEnter (#pregame-countdown es transparente).
  gameWrapper.style.display = 'block';
  // Ver comentario largo en citiesSpectatorEnter: redimensionarJuego() no
  // hace nada si gameWrapper todavía está en display:none, así que tiene que
  // ir DESPUÉS de mostrarlo — con el orden viejo el mapa quedaba mal
  // posicionado durante todo el 3-2-1.
  redimensionarJuego();
  cityTagEl.style.visibility = 'hidden';
  monumentImgEl.style.display = 'none';

  if (animFrameId) cancelAnimationFrame(animFrameId);
  animFrameId = requestAnimationFrame(render);

  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// switchingMode=true: la campaña del espectado encadenó a OTRO modo — ver
// comentario largo en flagsSpectatorExit (mismo mecanismo acá).
window.monumentsSpectatorExit = function (switchingMode) {
  _monumentsSpecMode = false;
  if (!switchingMode) window._isSpectating = false;
  // Ver comentario largo en flagsSpectatorExit.
  document.getElementById('monuments-spec-lb-entry')?.remove();
  document.getElementById('monuments-spec-lb-opp')?.remove();
  pregameAborted = true;
  clearTimeout(pregameTimeout); pregameTimeout = null;
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  _monumentsSpecLastCard = null;
  mapGameOver = true;
  clearTimeout(_monumentsSpecTimesUpT1); clearTimeout(_monumentsSpecTimesUpT2);
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  window.monumentsSpectatorHidePostgame();
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  // window._vsShowingResult — ver el mismo guard en citiesSpectatorExit/
  // flagsSpectatorExit/shapesSpectatorExit (el "se quitan los assets de
  // fondo si pierdo" reportado).
  if (!window._vsShowingResult) {
    gameWrapper.style.display = 'none';
    monumentImgEl.style.display = 'none';
    state = null;
  }
  scoreDisplayEl.style.display = 'none';
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'none';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'none';
  const lb = document.getElementById('leaderboard');
  if (lb) lb.innerHTML = '';
  cityTagEl.style.visibility = 'hidden';
  timeupOverlay.style.display = 'none';
  timeupOverlay.classList.remove('timeup-in', 'timeup-out');
  pregameCountdownEl.style.display = 'none';
  if (!switchingMode) {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'flex';
  }
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

window.monumentsSpectatorShowPregame = function (payload) {
  if (!_monumentsSpecMode) return;
  _monumentsSpecPregameSeen = true;
  window.monumentsSpectatorHidePostgame();
  cityTagEl.style.visibility = 'hidden';
  if (payload) {
    timerNumberEl.classList.toggle('timer-number-infinity', !!payload.infinite);
    timerNumberEl.textContent = payload.infinite ? '∞' : (payload.duration != null ? payload.duration : '');
  }
  timerNumberEl.style.color = '';
  countdownImg.src = 'images/countdown4.png';
  countdownImg.style.animationPlayState = 'paused';
  if (typeof playMusic === 'function') playMusic(null);
  if (payload && typeof payload.campaignBaseAtStart === 'number' && state) {
    state.score = payload.campaignBaseAtStart;
    state.displayedScore = payload.campaignBaseAtStart;
    scoreValueEl.textContent = payload.campaignBaseAtStart.toLocaleString();
  }
  let elapsedMs = (payload && typeof payload.startedAt === 'number') ? (Date.now() - payload.startedAt) : 0;
  const _pregameTotalMs = PREGAME_STEPS.reduce((s, x) => s + x.hold, 0);
  if (elapsedMs > _pregameTotalMs - 400) elapsedMs = Math.max(0, _pregameTotalMs - 400);
  runPregameCountdown(() => {
    const cwPost = document.getElementById('countdown-widget');
    if (cwPost) cwPost.style.visibility = '';
    countdownImg.style.animationPlayState = 'running';
    if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
    redimensionarJuego();
    gameWrapper.style.display = 'block';
  }, elapsedMs);
};

// payload = { mode:'monuments', index, monumentName, img, lat, lon, timeLeft }
window.monumentsSpectatorShowRound = function (payload) {
  if (!_monumentsSpecMode || !state) return;
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  // Mismo motivo que citiesSpectatorShowRound: no tocar pin1Anim/pin2Anim acá,
  // se limpian solos cuando su propio fade termina (ver render()).
  state.phase = 'waiting';
  state.cityShownAt = Date.now();
  state.currentCity = { name: payload.monumentName, img: payload.img, lat: payload.lat, lon: payload.lon };
  slideMonumentIn(state.currentCity);
  if (typeof payload.timeLeft === 'number') {
    state.timeLeft = payload.timeLeft;
    timerNumberEl.textContent = payload.timeLeft;
    timerNumberEl.classList.remove('timer-number-infinity');
  }
  if (_monumentsSpecIsFirstRound) {
    _monumentsSpecIsFirstRound = false;
    setTimeout(() => {
      if (!_monumentsSpecPregameSeen && typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') {
        playMusic(sfxGameMusic);
      }
    }, 400);
  }
};

// payload = { correct, score, grade, clickX, clickY, correctX, correctY, distKm, totalGained, bonusAmt }
window.monumentsSpectatorResolvePick = function (payload) {
  if (!_monumentsSpecMode || !state || !state.currentCity) return;
  const { grade, clickX, clickY, correctX, correctY, distKm, totalGained, bonusAmt } = payload;
  if (typeof clickX !== 'number' || typeof correctX !== 'number') return;
  state.phase = 'animating';
  if (typeof sfxPin !== 'undefined' && typeof sfxPlay === 'function') { sfxPin.currentTime = 0; sfxPlay(sfxPin); }

  if (typeof payload.score === 'number') state.score = payload.score;

  // "+puntos" flotante — SOLO lo del acierto, SIN el inRowBonus (que va aparte
  // en el badge "IN A ROW"), igual que el jugador real (que ya muestra el
  // popup sin el inRowBonus).
  const _acierto = totalGained - (payload.inRowBonus || 0);
  if (typeof totalGained === 'number' && _acierto > 0 && typeof showScorePopup === 'function') {
    showScorePopup(_acierto);
  }
  if (typeof bonusAmt === 'number' && bonusAmt > 0) {
    clearTimeout(speedBonusHideId);
    speedBonusText.classList.remove('visible');
    void speedBonusText.offsetWidth;
    speedBonusText.classList.add('visible');
    speedBonusHideId = setTimeout(() => speedBonusText.classList.remove('visible'), 1600);
  }

  let _dotFontSize = 11;
  ctx.font = `bold ${_dotFontSize}px Georgia`;
  const _dotLabel = (typeof tMonument === 'function') ? tMonument(state.currentCity.name) : state.currentCity.name;
  while (_dotFontSize > 7 && ctx.measureText(_dotLabel).width > 90) {
    _dotFontSize--;
    ctx.font = `bold ${_dotFontSize}px Georgia`;
  }
  state.placedDots.push({
    x: correctX, y: correctY, name: state.currentCity.name,
    labelOpacity: 1, labelBorn: Date.now(),
    permanent: grade === 'perfect', fontSize: _dotFontSize,
  });

  // payload.dots trae el valor REAL post-incremento del jugador espectado —
  // se pisa el contador local antes de advanceDot() (que hace state.dots++
  // internamente) para que el trencito llene/vacíe en el mismo momento que
  // ve el jugador real, sin importar en qué punto de la partida se unió.
  if (grade !== 'wayoff' && typeof advanceDot === 'function') {
    if (typeof payload.dots === 'number') state.dots = payload.dots - 1;
    advanceDot();
  }

  state.pin1Anim = { x: clickX, y: clickY, targetX: correctX, targetY: correctY,
    distKm, grade, progress: 0, lineProgress: 0, opacity: 1, fading: false,
    wobbleTime: 0, sunburstSpawned: false };
  const capturedPin1 = state.pin1Anim;

  setTimeout(() => {
    if (!_monumentsSpecMode || state.pin1Anim !== capturedPin1) return; // ronda ya cambió
    state.pin2Anim = { x: correctX, y: correctY, progress: 0, opacity: 1, fading: false,
      wobbleTime: 0, starsSpawned: false,
      onLanded: () => {
        spawnStars(correctX, correctY);
        setTimeout(() => {
          if (!_monumentsSpecMode) return;
          showResultLabel(correctX, correctY, grade, 0, 0);
          // Racha ("in row") — badgeColor real es un <img> del jugador, no
          // serializable por broadcast; payload.streak sí viaja (número), y
          // getBadgeImg() es una función pura de ese streak — el espectador
          // reconstruye la misma imagen localmente. render() ya sabe dibujar
          // state.badgeAnim solo (mismo overlay que usa el jugador real).
          if (typeof payload.streak === 'number' && typeof getBadgeImg === 'function') {
            const badgeColor = getBadgeImg(payload.streak);
            if (badgeColor) {
              state.badgeAnim = { t: 0, img: badgeColor, streak: payload.streak, inRowBonus: payload.inRowBonus || 0 };
              setTimeout(() => { if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); } }, 800);
            }
          }
        }, 200);
      },
    };
    const capturedPin2 = state.pin2Anim;
    setTimeout(() => { if (state.pin2Anim === capturedPin2) capturedPin2.fading = true; }, 1000);
  }, 300);
  setTimeout(() => { if (state.pin1Anim === capturedPin1) capturedPin1.fading = true; }, 1000);
};

window.monumentsSpectatorUpdateTimer = function (timeLeft) {
  if (!_monumentsSpecMode || !state) return;
  state.timeLeft = timeLeft;
  timerNumberEl.textContent = timeLeft;
  timerNumberEl.classList.remove('timer-number-infinity');
  if (timeLeft <= 10) {
    timerNumberEl.style.color = '#ffffff';
    countdownImg.src = 'images/countdownred4.png';
    const _nowTick = Date.now();
    if (timeLeft > 0 && timeLeft !== _monumentsSpecLastTick && (_nowTick - _monumentsSpecLastTickSoundAt) > 700
        && typeof sfxTickdown !== 'undefined') {
      sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown);
      _monumentsSpecLastTickSoundAt = _nowTick;
    }
  } else {
    timerNumberEl.style.color = '';
    countdownImg.src = 'images/countdown4.png';
  }
  _monumentsSpecLastTick = timeLeft;
};

window.monumentsSpectatorUpdateScore = function (score, dots) {
  if (!_monumentsSpecMode || !state) return;
  state.score = score;
  state.displayedScore = score;
  scoreValueEl.textContent = (score + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
  // dots: mismo motivo que citiesSpectatorUpdateScore.
  if (typeof dots === 'number') {
    state.dots = Math.max(0, Math.min(dots, DOTS_NEEDED - 1));
    updateDotsUI();
  }
};

let _monumentsSpecLastCard = null;
// oppName/oppAvatar/oppScore: ver comentario largo en citiesSpectatorSetPlayerCard.
window.monumentsSpectatorSetPlayerCard = function (name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode) {
  if (!_monumentsSpecMode) return;
  _monumentsSpecLastCard = { name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode };
  const lb = document.getElementById('leaderboard');
  if (!lb) return;
  const rowH = getLbRowHeight();
  const showOpp = !!oppName;
  // TOP_MARGIN: ver comentario largo en citiesSpectatorSetPlayerCard (mismo
  // clip-path recorta el emote-bubble de wrongEffect si la fila de arriba
  // queda pegada a top:0 del contenedor).
  const TOP_MARGIN = Math.round(rowH * 0.4);
  lb.style.height = (showOpp ? rowH * 2 + LB_GAP + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';
  let el = document.getElementById('monuments-spec-lb-entry');
  if (!el) {
    el = document.createElement('div');
    el.className = 'lb-entry lb-player';
    el.id = 'monuments-spec-lb-entry';
    el.style.top = TOP_MARGIN + 'px';
    el.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" id="monuments-spec-lb-avatar" src="images/profilepic/ppdefault.png"></div>`
      + `<span class="lb-name" id="monuments-spec-lb-name"></span>`
      + `<span class="lb-score" id="monuments-spec-lb-score">0</span>`;
    lb.appendChild(el);
  }
  const nameEl = document.getElementById('monuments-spec-lb-name');
  if (nameEl) nameEl.textContent = name || 'Jugador';
  const avatarEl = document.getElementById('monuments-spec-lb-avatar');
  if (avatarEl && avatar) avatarEl.src = avatar;
  const scoreEl = document.getElementById('monuments-spec-lb-score');
  if (scoreEl) scoreEl.textContent = (score || 0).toLocaleString();
  window.CustomizeAssets?.applyCard(el, cardCode || '0001');

  let oppEl = document.getElementById('monuments-spec-lb-opp');
  if (showOpp) {
    if (!oppEl) {
      oppEl = document.createElement('div');
      oppEl.className = 'lb-entry lb-vsopp';
      oppEl.id = 'monuments-spec-lb-opp';
      oppEl.style.top = (TOP_MARGIN + rowH + LB_GAP) + 'px';
      oppEl.innerHTML = `<div class="lb-avatar"><img class="lb-avatar-img" id="monuments-spec-lb-opp-avatar" src="images/profilepic/ppdefault.png"></div>`
        + `<span class="lb-name" id="monuments-spec-lb-opp-name"></span>`
        + `<span class="lb-score" id="monuments-spec-lb-opp-score">0</span>`;
      lb.appendChild(oppEl);
    }
    window.CustomizeAssets?.applyCard(oppEl, oppCardCode || '0001');
    const oppNameEl = document.getElementById('monuments-spec-lb-opp-name');
    if (oppNameEl) oppNameEl.textContent = oppName || 'Rival';
    const oppAvatarEl = document.getElementById('monuments-spec-lb-opp-avatar');
    if (oppAvatarEl && oppAvatar) oppAvatarEl.src = oppAvatar;
    const oppScoreEl = document.getElementById('monuments-spec-lb-opp-score');
    if (oppScoreEl) oppScoreEl.textContent = (oppScore || 0).toLocaleString();
    // Reordenar según puesto — ver comentario largo en citiesSpectatorSetPlayerCard.
    const friendOnTop = (score || 0) >= (oppScore || 0);
    el.style.top    = (TOP_MARGIN + (friendOnTop ? 0 : rowH + LB_GAP)) + 'px';
    oppEl.style.top = (TOP_MARGIN + (friendOnTop ? rowH + LB_GAP : 0)) + 'px';
  } else if (oppEl) {
    oppEl.remove();
  } else {
    el.style.top = TOP_MARGIN + 'px';
  }
};

window.monumentsSpectatorWrongEffect = function (target) {
  if (!_monumentsSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'monuments-spec-lb-opp' : 'monuments-spec-lb-entry');
  if (!el) return;
  el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // z-index elevado mientras dura el emote — ver comentario largo en citiesSpectatorWrongEffect.
  const prevZ = el.style.zIndex;
  el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 1800);
  if (typeof spawnEmoteBubble === 'function') spawnEmoteBubble(el);
};

// "Se acabó el tiempo" en la cartilla del espectador 1v1 (cities/monuments) —
// mismo mecanismo que *SpectatorWrongEffect pero con el cronómetro.
window.citiesSpectatorTimesUpEffect = function (target) {
  if (!_citiesSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'cities-spec-lb-opp' : 'cities-spec-lb-entry');
  if (!el) return;
  const prevZ = el.style.zIndex; el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
};
window.monumentsSpectatorTimesUpEffect = function (target) {
  if (!_monumentsSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'monuments-spec-lb-opp' : 'monuments-spec-lb-entry');
  if (!el) return;
  const prevZ = el.style.zIndex; el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
};

window.monumentsSpectatorReposition = function () {
  if (!_monumentsSpecMode || !_monumentsSpecLastCard) return;
  window.monumentsSpectatorSetPlayerCard(_monumentsSpecLastCard.name, _monumentsSpecLastCard.avatar, _monumentsSpecLastCard.score);
};

window.monumentsSpectatorShowTimesUp = function () {
  if (!_monumentsSpecMode) return;
  clearTimeout(_monumentsSpecTimesUpT1);
  clearTimeout(_monumentsSpecTimesUpT2);
  if (typeof playMusic === 'function') playMusic(null);
  if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
  countdownImg.style.animationPlayState = 'paused';
  timeupOverlay.style.display = 'flex';
  timeupOverlay.classList.remove('timeup-out');
  timeupOverlay.classList.add('timeup-in');
  _monumentsSpecTimesUpT1 = setTimeout(() => {
    if (!_monumentsSpecMode) return;
    timeupOverlay.classList.remove('timeup-in');
    timeupOverlay.classList.add('timeup-out');
    _monumentsSpecTimesUpT2 = setTimeout(() => {
      if (!_monumentsSpecMode) return;
      timeupOverlay.style.display = 'none';
      timeupOverlay.classList.remove('timeup-out');
    }, 400);
  }, 1800);
};

window.monumentsSpectatorShowPostgame = function (payload) {
  if (!_monumentsSpecMode) return;
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'none';
  gameoverScreen.classList.remove('mode-flags', 'mode-shapes');
  gameoverScreen.classList.add('mode-monuments');
  gameoverScreen.style.pointerEvents = 'none';
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women1.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women1.png');
  // Selectores propios (game-bg-city-monuments/2), NO .game-bg-city genérico
  // (ese es el de Cities) — así no se pisa el fondo de Cities por error.
  document.querySelectorAll('.game-bg-city-monuments').forEach(el => el.src = 'images/bg/level4complete.png');
  document.querySelectorAll('.game-bg-city-monuments2').forEach(el => el.src = 'images/bg/level4complete2.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check4.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong4.png');
  if (typeof window.hideGameoverConfirm === 'function') window.hideGameoverConfirm();
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = 'none';
  gameoverScreen.style.display = 'flex';
  const label = gameoverScreen.querySelector('.gameover-text1-label');
  if (label) label.textContent = (typeof t === 'function') ? t('gameover.monuments') : 'Landmark Loco';
  if (finalScoreEl) finalScoreEl.textContent = (payload.totalScore || 0).toLocaleString();
  if (newHighscoreBanner) newHighscoreBanner.style.display = payload.isNewHighscore ? 'flex' : 'none';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) rpEl.style.display = 'none';
  {
    const nCorrect = payload.correctCount || 0;
    _specBuildCountRow(
      document.getElementById('gameover-checks-row'),
      gameoverScreen.querySelector('.game-bg-check3'),
      gameoverScreen.querySelector('.grade-count-total'),
      nCorrect, (typeof getModeCheckImg === 'function') ? getModeCheckImg() : 'images/check4.png', 0);
    _specBuildCountRow(
      document.getElementById('gameover-wrongs-row'),
      gameoverScreen.querySelector('.game-bg-wrong3'),
      gameoverScreen.querySelector('.wrong-count-total'),
      payload.wrongCount || 0, (typeof getModeWrongImg === 'function') ? getModeWrongImg() : 'images/wrong4.png',
      (nCorrect > 0 ? (nCorrect - 1) * 0.1 + 0.2 : 0) + 0.4);
  }
  const wrongTotalEl = document.getElementById('gameover-wrong-total');
  if (wrongTotalEl) wrongTotalEl.textContent = payload.wrongCount || 0;
  const splashWrongEl = document.getElementById('splash-wrong-total');
  if (splashWrongEl) splashWrongEl.textContent = payload.wrongCount || 0;
  // Contraparte de correctas — mismo elemento que actualiza updateGradeCountsUI()
  // en el jugador real (gradeCounts.perfect+good+fair, estado LOCAL que acá no
  // existe) — faltaba del todo, se quedaba con el número de la ÚLTIMA partida
  // real jugada en esta pestaña en vez del conteo del jugador espectado.
  const correctTotalEl = document.getElementById('gameover-count-total');
  if (correctTotalEl) correctTotalEl.textContent = payload.correctCount || 0;
  const splashCorrectEl = document.getElementById('splash-count-total');
  if (splashCorrectEl) splashCorrectEl.textContent = payload.correctCount || 0;
  scoreDisplayEl.style.display = 'none';
  if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
};

window.monumentsSpectatorHidePostgame = function () {
  if (gameoverScreen) { gameoverScreen.style.display = 'none'; gameoverScreen.style.pointerEvents = ''; gameoverScreen.classList.remove('mode-monuments'); }
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = '';
};
// ═════════════════════════════════════════════════════════════════════════════

// ── Monuments lobby hooks (idéntico al patrón de cities) ─────────────────────
let _monumentsSeededRand = null;
function monumentsRand() { return _monumentsSeededRand ? _monumentsSeededRand() : Math.random(); }
window.monumentsSetSeed = function(seed) {
  let s = seed >>> 0; if (!s) s = 1;
  _monumentsSeededRand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
};
window.monumentsClearSeed = function() { _monumentsSeededRand = null; };

window.monumentsHardReset = function() {
  try { gameAborted = true; } catch(e) {}
  try { pregameAborted = true; clearTimeout(pregameTimeout); pregameTimeout = null; } catch(e) {}
  try { clearTimeout(endGameTimeout1); clearTimeout(endGameTimeout2); } catch(e) {}
  try { clearInterval(timerIntervalId); timerIntervalId = null; } catch(e) {}
  try { if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; } } catch(e) {}
  const _sbt = document.getElementById('speed-bonus-text');
  if (_sbt) _sbt.classList.remove('visible');
  const _tuo = document.getElementById('timeup-overlay');
  if (_tuo) { _tuo.style.display = 'none'; _tuo.classList.remove('timeup-in','timeup-out'); }
};

window.monumentsSetLobbyScores = function(members) {
  if (!Array.isArray(members) || typeof window._lbUpdateEntry !== 'function') return;
  members.forEach(m => window._lbUpdateEntry('lob' + m.id, m.score || 0));
  // Ver comentario en citiesSetVsOpponentScore — mismo motivo.
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  if (typeof positionLeaderboard === 'function' && state) positionLeaderboard(state.score, true);
};
window.monumentsSetLobbyWrongFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'player' : ('lob' + uid);
  if (typeof window._lbWrongEffect === 'function') window._lbWrongEffect(key);
};
window.monumentsSetLobbyDisconnected = function(uid, disconnected) {
  const el = typeof lbElements !== 'undefined' ? lbElements['lb-lob' + uid] : null;
  if (!el) return;
  el.classList.toggle('is-disconnected', !!disconnected);
};

let mockPlayers = buildFriendPlayers();

// Highscore global = mejor total de campaña (suma de los 4 modos), guardado por
// results.js en localStorage 'totalHighscore'. La barra es universal, así que la
// entrada ★ best usa ese total, no el highscore de un modo individual.
function getTotalHighscore() {
  if (window._sbProfile && window._accountLoggedIn) {
    const p = window._sbProfile;
    return (p.hs_flags||0) + (p.hs_shapes||0) + (p.hs_cities||0) + (p.hs_monuments||0);
  }
  return parseInt(localStorage.getItem('totalHighscore') || '0', 10) || 0;
}
const highscorePlayer = { id: 'best', score: getTotalHighscore(), color: '#6a0dad', initial: '★' };

const LB_WINDOW  = 5;
const LB_PIN_ROW = 2;
const LB_GAP     = 4;
let lbElements   = {};

const EMOTE_SRCS = [
  'images/emotes/1.png',
  'images/emotes/2.png',
  'images/emotes/3.png',
  'images/emotes/4.png',
  'images/emotes/5.png',
  'images/emotes/6.png',
];

function spawnEmoteBubble(entryEl) {
  const bubble = document.createElement('div');
  bubble.className = 'emote-bubble';

  const img = document.createElement('img');
  img.src = EMOTE_SRCS[Math.floor(Math.random() * EMOTE_SRCS.length)];
  img.className = 'emote-img';
  bubble.appendChild(img);

  entryEl.appendChild(bubble);
  bubble.addEventListener('animationend', () => bubble.remove());
}

let lastPlayerRank = -1;

function getLbRowHeight() {
  const panel = document.getElementById('right-panel');
  if (!panel) return 84;
  // offsetWidth (no getBoundingClientRect): el rect viene escalado por el transform
  // del #app-stage y, al usarse como px de layout, se re-escalaría (entradas apretadas).
  return Math.round(panel.offsetWidth * 1.5) + LB_GAP;
}

function initLeaderboard() {
  // #leaderboard es compartido con el espectador de siluetas/etc. — sin este
  // guard, cualquier actualización de la lista de amigos (onFriendsUpdate,
  // que dispara seguido mientras se espeta a un amigo cuyo score/estado
  // cambia en vivo) pisaba la tarjeta armada por
  // shapesSpectatorSetPlayerCard/flagsSpectatorSetPlayerCard con esta
  // reconstrucción genérica — que SIEMPRE agrega una tarjeta "Tú" con el
  // perfil del espectador. Ese era el "sale mi cartilla" reportado.
  if (window._isSpectating) return;
  const lb = document.getElementById('leaderboard');
  lb.innerHTML = '';
  lb.classList.toggle('vs-active', !!(window._vsActive || window._lobbyActive));
  lbElements = {};
  mockPlayers = buildFriendPlayers(); // refrescar; en VS devuelve solo al rival
  highscorePlayer.score = getTotalHighscore(); // ★ best = highscore global de campaña

  if (!window.practiceConfig || !window.practiceConfig.active) {
    mockPlayers.forEach(p => {
      const el = document.createElement('div');
      el.className = 'lb-entry' + (p.id === 'vsopp' ? ' lb-vsopp' : '');
      el.id = `lb-${p.id}`;
      const avatarHTML = p.avatar
        ? `<div class="lb-avatar lb-avatar-img-wrap"><img class="lb-avatar-img" src="${p.avatar}" onerror="this.parentNode.innerHTML='${p.initial || '?'}';this.parentNode.style.background='${p.color || '#888'}'"></div>`
        : `<div class="lb-avatar" style="background:${p.color}">${p.initial}</div>`;
      el.innerHTML = `<span class="lb-rank rank-other"></span>` + avatarHTML + `<span class="lb-name">${p.name}</span>` + `<span class="lb-score">${p.score.toLocaleString()}</span>`;
      el.style.transition = 'none';
      el.style.top = '-9999px';
      // Todas las filas traen su cardCode real ahora (ver buildFriendPlayers:
      // rival de VS 1v1, cada rival de lobby grupal, Y los amigos reales de
      // la barra ingame en Gira Mundial solo — antes esto último se
      // quedaba afuera, con la carta default sin importar qué tuviera
      // equipado de verdad cada amigo). applyCard ya cae a '0001' si no hay
      // cardCode, así que aplicarlo siempre es seguro.
      window.CustomizeAssets?.applyCard(el, p.cardCode || '0001');
      lbElements[el.id] = el;
      lb.appendChild(el);
    });
  }

  // ── Helpers for shapes VS to update shared leaderboard from outside ──────────
  window._lbUpdateEntry = function(id, score) {
    const p = mockPlayers.find(x => x.id === id);
    if (p) p.score = score;
    const el = lbElements['lb-' + id];
    if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = score.toLocaleString(); }
  };
  window._lbWrongEffect = function(id) {
    const el = lbElements['lb-' + id];
    if (!el) return;
    el.style.animation = 'none'; void el.offsetWidth;
    el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
    setTimeout(() => { el.style.animation = ''; }, 820);
    const srcs = ['images/emotes/1.png','images/emotes/2.png','images/emotes/3.png',
                  'images/emotes/4.png','images/emotes/5.png','images/emotes/6.png'];
    const bubble = document.createElement('div');
    bubble.className = 'emote-bubble';
    const img = document.createElement('img');
    img.src = srcs[Math.floor(Math.random() * srcs.length)];
    img.className = 'emote-img';
    bubble.appendChild(img);
    el.appendChild(bubble);
    bubble.addEventListener('animationend', () => bubble.remove(), { once: true });
  };

  const playerEl = document.createElement('div');
  playerEl.className = 'lb-entry lb-player';
  playerEl.id = 'lb-player';
  const _myName = window._sbProfile?.name || localStorage.getItem('playerName') || 'Tú';
  playerEl.innerHTML = `<span class="lb-rank rank-other"></span>`
                     + `<div class="lb-avatar"><img class="lb-avatar-img" src="${localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png'}"></div>`
                     + `<span class="lb-name">${_myName}</span>`
                     + `<span class="lb-score" id="lb-player-score">0</span>`;
  playerEl.style.transition = 'none';
  playerEl.style.top = '-9999px';
  lbElements['lb-player'] = playerEl;
  lb.appendChild(playerEl);
  if (typeof window._applyFounderFrame === 'function') window._applyFounderFrame();

  requestAnimationFrame(() => {
    positionLeaderboard(0, false);
    requestAnimationFrame(() => {
      Object.values(lbElements).forEach(el => {
        el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)';
      });
    });
  });
}

function positionLeaderboard(playerScore, animate) {
  // La barra es universal para toda la campaña: el jugador compite con el puntaje
  // acumulado (base de modos previos + modo actual), no con el de cada juego.
  playerScore += (window.campaignBase ? window.campaignBase() : 0);
  const lb   = document.getElementById('leaderboard');
  const rowH = getLbRowHeight();

  lb.style.height = (LB_WINDOW * rowH - LB_GAP) + 'px';

  const all = [...mockPlayers, { id: 'player', score: playerScore }];
  all.sort((a, b) => b.score - a.score);

  const playerRank = all.findIndex(p => p.id === 'player');

  if (animate && lastPlayerRank !== -1 && playerRank < lastPlayerRank && !window._vsActive && !window._lobbyActive) {
    let bubbleIndex = 0;
    for (let r = lastPlayerRank; r >= playerRank + 1; r--) {
      const overtaken = all[r];
      if (overtaken && overtaken.id !== 'player') {
        const overtakenEl = lbElements[`lb-${overtaken.id}`];
        if (overtakenEl) {
          setTimeout(() => spawnEmoteBubble(overtakenEl), 200 + bubbleIndex * 100);
          bubbleIndex++;
        }
      }
    }
  }
  lastPlayerRank = playerRank;

  let windowStart = Math.max(0, playerRank - LB_PIN_ROW);
  let windowEnd   = Math.min(all.length, windowStart + LB_WINDOW);
  windowStart     = Math.max(0, windowEnd - LB_WINDOW);

  const visibleRows  = windowEnd - windowStart;
  const bottomOffset = Math.max(0, LB_WINDOW - visibleRows) * rowH;

  if (!animate) {
    Object.values(lbElements).forEach(el => { el.style.transition = 'none'; });
  }

  all.forEach((p, rank) => {
    const el = lbElements[`lb-${p.id}`];
    if (el) el.style.top = ((rank - windowStart) * rowH + bottomOffset) + 'px';
  });

  // Número de posición en cada fila (1°/2°/…) — mismo mecanismo que
  // flagsPositionLeaderboard. Faltaba acá, así que en versus/lobby de
  // cities/monuments/shapes (todos usan #leaderboard) el número de puesto en
  // vivo no aparecía; solo funcionaba en banderas (reportado). El CSS
  // #leaderboard.vs-active .lb-rank lo hace visible en versus.
  all.forEach((p, rank) => {
    const el = lbElements[`lb-${p.id}`];
    if (!el) return;
    const rankEl = el.querySelector('.lb-rank');
    if (!rankEl) return;
    rankEl.textContent = rank + 1;
    rankEl.className = 'lb-rank ' + (rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : 'rank-other');
  });

  const scoreEl = lbElements['lb-player'].querySelector('.lb-score');
  if (scoreEl) scoreEl.textContent = playerScore.toLocaleString();
}

let lastLbScore = -1;
function sortLeaderboard(playerScore) {
  if (playerScore === lastLbScore) return;
  lastLbScore = playerScore;
  if (window.practiceConfig && window.practiceConfig.active) {
    const sc = playerScore + (window.campaignBase ? window.campaignBase() : 0);
    const scoreEl = lbElements['lb-player']?.querySelector('.lb-score');
    if (scoreEl) scoreEl.textContent = sc.toLocaleString();
    return;
  }
  positionLeaderboard(playerScore, true);
}

initLeaderboard();
// Cuando la capa de datos refresque la lista (p.ej. al llegar amigos reales del
// servidor vía loadFriends), reconstruir la barra automáticamente.
// Guard: durante una Vuelta Mundial en curso, un evento de red (status/score
// de un amigo cambiando en tiempo real) puede llegar en CUALQUIER momento,
// incluso justo en medio de una transición entre modos — y esta reconstrucción
// tira TODA la barra y la vuelve a armar (imágenes/tarjetas Founder incluidas),
// sumando trabajo de golpe justo donde ya hay más carga por el cambio de modo.
// No hace falta precisión en vivo ahí: cada modo ya llama a initLeaderboard()
// por su cuenta al arrancar, así que alcanza con saltear el rebuild reactivo
// mientras la campaña está activa y dejar que el próximo modo la refresque.
if (typeof onFriendsUpdate === 'function') onFriendsUpdate(() => {
  if (window.campaign && window.campaign.active) return;
  initLeaderboard();
});
if (typeof loadFriends === 'function') loadFriends();

function practiceGetCityPool() {
  const pc = window.practiceConfig;
  if (!pc.active || pc.mode !== 'game') return [...CITIES];
  const ok   = c => pc.continents.has(CITY_COUNTRY_CONTINENT[c.country]);
  // Cities mode: always include all difficulty tiers (diff radio is monuments-only)
  const ALL_DIFFS = ['inicio', 'facil', 'medio', 'dificil'];
  const seen = new Set(); const pool = [];
  const add = c => { if (!seen.has(c.name)) { seen.add(c.name); pool.push(c); } };
  // Step 1: all tiers + continent filter
  for (const d of ALL_DIFFS) CITIES.filter(c => c.diff === d && ok(c)).forEach(add);
  // Step 2: final fallback — drop continent filter if still thin
  if (pool.length < 4) for (const d of ALL_DIFFS) CITIES.filter(c => c.diff === d).forEach(add);
  return pool;
}

// Practice city picker: progressive tier gating like flags/shapes.
// inicio+facil always unlocked; medio at 5 correct; dificil at 15 correct.
function practiceCityPickNext() {
  const pc = window.practiceConfig;
  const continents = (pc && pc.continents && pc.continents.size > 0) ? pc.continents : null;
  const ok = c => !continents || continents.has(CITY_COUNTRY_CONTINENT[c.country]);

  const TIERS = ['inicio'];
  if (correctCount >= 1)  TIERS.push('facil');
  if (correctCount >= 5)  TIERS.push('medio');
  if (correctCount >= 15) TIERS.push('dificil');

  const fullPool   = state.practiceCityFullPool;
  const notPerfect = fullPool.filter(c => !state.citiesPerfect.has(c.name));
  const lastName   = state.currentCity ? state.currentCity.name : null;

  // Build pool from unlocked tiers, continent-filtered
  let pool = (notPerfect.length ? notPerfect : fullPool)
    .filter(c => TIERS.includes(c.diff) && ok(c) && c.name !== lastName);

  // Supplement from next harder tier if thin
  if (pool.length < 4) {
    const NEXT_TIERS = ['inicio', 'facil', 'medio', 'dificil'];
    pool = (notPerfect.length ? notPerfect : fullPool)
      .filter(c => NEXT_TIERS.includes(c.diff) && ok(c) && c.name !== lastName);
  }

  // Final fallback: drop continent filter
  if (!pool.length) {
    pool = (notPerfect.length ? notPerfect : fullPool)
      .filter(c => c.name !== lastName);
  }
  if (!pool.length) pool = fullPool;

  return pool[Math.floor(Math.random() * pool.length)];
}
function practiceGetMonumentPool() {
  const pc = window.practiceConfig;
  if (!pc.active || pc.mode !== 'monuments') return [...MONUMENTS_EASY];
  const diff = pc.difficulty;
  const allowed = diff === 'facil' ? new Set(['facil'])
                : diff === 'medio' ? new Set(['facil', 'medio'])
                : null; // dificil = todos
  const pool = allowed
    ? MONUMENTS.filter(m => allowed.has(MONUMENT_DIFF[m.img] || 'medio'))
    : [...MONUMENTS];
  return pool.length ? pool : [...MONUMENTS_EASY];
}
function practiceGetDuration() {
  const pc = window.practiceConfig;
  if (!pc.active) return GAME_DURATION;
  return pc.timer > 0 ? pc.timer : 0;
}

function resetState() {
  state = {
    phase: 'idle',
    timeLeft: practiceGetDuration(),
    // timerDuration/timerStartedAt: fuente de verdad real del cronómetro (ver
    // startTimer) — timeLeft es solo el valor derivado que se muestra.
    timerDuration: practiceGetDuration(),
    timerStartedAt: 0,
    score: 0,
    displayedScore: 0,
    dots: 0,
    cityPool: shuffle(practiceGetCityPool()),
    cityQueues: makeCityQueues(null),     // weighted random for normal mode
    practiceCityFullPool: practiceGetCityPool(), // fixed reference for practice exhaustion + picking
    monumentPool: shuffle(practiceGetMonumentPool(), monumentsRand),
    monumentsCorrectCount: 0,
    monumentsUnlocked: false,
    monumentsSeen: new Set(),
    citiesPerfect: new Set(),
    poolIndex: 0,
    currentCity: null,
    cityShownAt: 0,
    placedDots: [],
    pin1Anim: null,
    pin2Anim: null,
    starParticles: [],
    sunburst: null,
    badgeAnim: null,
    lastTimestamp: null,
    streak: 0,
    // El idle-skip de render() asume que el canvas ya tiene un frame dibujado
    // para retener tal cual — en una ronda/partida recién arrancada (sin
    // dots/animaciones todavía) esa condición de idle se cumple DESDE EL
    // primer frame, así que sin esta bandera el mapa nunca llegaba a
    // dibujarse hasta el primer click (que recién ahí generaba algo
    // "activo" que rompía el idle-skip).
    mapDrawn: false,
  };
  resetMapZoom();
}

// ── HELPERS ──────────────────────────────────────────────────────────────────
function latLonToCanvas(lat, lon) {
  const x = ((lon - MAP_LON_LEFT) / (MAP_LON_RIGHT - MAP_LON_LEFT)) * DISPLAY_W;
  const y = ((MERC_TOP - mercatorY(lat)) / (MERC_TOP - MERC_BOT)) * DISPLAY_H;
  return { x, y };
}

function canvasToLatLon(x, y) {
  const lon = MAP_LON_LEFT + (x / DISPLAY_W) * (MAP_LON_RIGHT - MAP_LON_LEFT);
  const mercY = MERC_TOP - (y / DISPLAY_H) * (MERC_TOP - MERC_BOT);
  const lat = (2 * Math.atan(Math.exp(mercY)) - Math.PI / 2) * (180 / Math.PI);
  return { lat, lon };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
          * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}


function dist(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function classify(px) {
  if (px <= PERFECT_PX) return 'perfect';
  if (px <= GOOD_PX)    return 'good';
  if (px <= FAIR_PX)    return 'fair';
  return 'wayoff';
}

function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1 / d1)      return n1 * t * t;
  if (t < 2 / d1)      return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1)    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

// ── TAG ANIMATION ────────────────────────────────────────────────────────────
function slideTagIn(cityName, countryCode) {
  const wasVisible = cityTagEl.style.left !== '' && cityTagEl.style.left !== tpx(-525);
  if (wasVisible) {
    const ghost = cityTagEl.cloneNode(true);
    ghost.className = 'city-tag-ghost';
    ghost.style.visibility = 'visible';
    ghost.style.zIndex = '9';
    ghost.style.transition = 'none';
    ghost.style.top  = cityTagEl.style.top  || tpx(10);
    ghost.style.left = cityTagEl.style.left || tpx(-90);
    gameWrapper.appendChild(ghost);
    setTimeout(() => {
      ghost.style.transition = 'opacity 0.3s';
      ghost.style.opacity = '0';
      setTimeout(() => ghost.remove(), 350);
    }, 450);
  }

  if (slideTagIn._countryTimer) clearTimeout(slideTagIn._countryTimer);

  function setTagText(text) {
    cityTagText.textContent = text;
    const baseSize = 26 * TAG_SCALE;
    const maxWidth = 230 * TAG_SCALE;
    const minSize  = 14 * TAG_SCALE;
    cityTagText.style.fontSize = baseSize + 'px';
    let fs = baseSize;
    while (fs > minSize && cityTagText.scrollWidth > maxWidth) {
      fs -= TAG_SCALE;
      cityTagText.style.fontSize = fs + 'px';
    }
  }

  const dispCity = (typeof tCity === 'function') ? tCity(cityName) : cityName;
  setTagText(dispCity);
  // Pista visual: a los 5s sin responder, se revela el país. Ya NO penaliza
  // el puntaje (ver hintMult removido del cálculo más abajo) — es solo
  // una ayuda, no un castigo.
  if (countryCode) {
    slideTagIn._countryTimer = setTimeout(() => {
      const countryName = (typeof getCityCountryName === 'function') ? getCityCountryName(countryCode) : countryCode;
      setTagText(`${dispCity}, ${countryName}`);
    }, 5000);
  }

  cityTagEl.style.visibility = 'hidden';
  cityTagEl.style.transition = 'none';
  cityTagEl.style.top  = tpx(-163);
  cityTagEl.style.left = tpx(-525);
  setTimeout(() => { sfxTag.currentTime = 0; sfxPlay(sfxTag); }, 200);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cityTagEl.style.visibility = 'visible';
      cityTagEl.style.transition = 'left 0.45s cubic-bezier(0.22,1,0.36,1), top 0.45s cubic-bezier(0.22,1,0.36,1)';
      cityTagEl.style.left = tpx(-90);
      cityTagEl.style.top  = tpx(-50);
    });
  });
}

// ── DOTS ─────────────────────────────────────────────────────────────────────
function updateDotsUI() {
  progressDots.forEach((d, i) => d.classList.toggle('filled', i < state.dots));
}

// Extra de tiempo "+Ns" bajo el contador al completar 10 dots. Genérico para los
// 4 modos (cities/monuments, flags, shapes). + (0.1s) y Ns (0.2s) hacen pop de
// 0.5x→1.75x→1x; al terminar ambos, 1s quieto y luego fade out de 0.1s.
function playTimeBonus(el, seconds) {
  if (!el) return;
  const num = el.querySelector('.tb-num');
  if (num) num.textContent = seconds + 's';
  if (el._tbT1) clearTimeout(el._tbT1);
  if (el._tbT2) clearTimeout(el._tbT2);
  el.classList.remove('show', 'fade');
  el.style.display = 'block';
  el.style.opacity = '1';
  void el.offsetWidth;            // reinicia las animaciones
  el.classList.add('show');
  el._tbT1 = setTimeout(() => {
    el.classList.add('fade');
    void el.offsetWidth;
    el.style.opacity = '0';
    el._tbT2 = setTimeout(() => {
      el.style.display = 'none';
      el.classList.remove('show', 'fade');
    }, 100);
  }, 550 + 1000);
}
window.playTimeBonus = playTimeBonus;

function showTimeBonus() {
  playTimeBonus(document.getElementById('time-bonus'), BONUS_TIME);
}

function advanceDot() {
  if (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0) return;
  state.dots++;
  updateDotsUI();

  if (state.dots >= DOTS_NEEDED && !progressContainer.classList.contains('train-animation')) {
    progressContainer.classList.add('train-animation');

    const _isInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    if (!_isInfinite) {
      // Ajustar timerDuration (la fuente de verdad real, ver startTimer), no
      // timeLeft directo — si no, el próximo tick lo pisaría con el valor
      // calculado contra timerStartedAt, perdiendo el bonus.
      const elapsed = Math.floor((Date.now() - state.timerStartedAt) / 1000);
      const newTimeLeft = Math.min(state.timeLeft + BONUS_TIME, 99);
      state.timerDuration = elapsed + newTimeLeft;
      state.timeLeft = newTimeLeft;
      timerNumberEl.textContent = state.timeLeft;
    }
    showTimeBonus();

    const originalColor = timerNumberEl.style.color;
    timerNumberEl.style.color = '#00ff88';

    setTimeout(() => {
      progressContainer.classList.add('dots-fade-out');

      setTimeout(() => {
        state.dots = Math.max(0, state.dots - DOTS_NEEDED);
        progressContainer.classList.remove('train-animation', 'dots-fade-out');
        updateDotsUI();

        if (state.timeLeft > 0 && state.timeLeft <= 10) {
          timerNumberEl.style.color = '#ffffff';
          countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdownred4.png' : 'images/countdownred.png';
        } else if (state.timeLeft > 10) {
          timerNumberEl.style.color = originalColor;
          countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdown4.png' : 'images/countdown.png';
        }
      }, 500);

    }, 2000);
  }
}

// ── RESULT LABEL ─────────────────────────────────────────────────────────────
function showResultLabel(cx, cy, grade, base, bonusAmt) {
  if (grade === 'wayoff')        { sfxError.currentTime = 0; sfxPlay(sfxError); }
  else if (grade === 'perfect')  { sfxVeryNice.currentTime = 0; sfxPlay(sfxVeryNice); }
  else                           { sfxAcertar.currentTime = 0; sfxPlay(sfxAcertar); }

  resultLabel.textContent = (typeof t === 'function') ? t('grade.' + grade) : LABEL_MAP[grade];
  resultLabel.className = grade;

  const lx = Math.max(4, Math.min(cx - 70, DISPLAY_W - 200));
  const ly = Math.max(4, cy - 102);
  resultLabel.style.left = `${lx}px`;
  resultLabel.style.top  = `${ly}px`;

  void resultLabel.offsetWidth;
  resultLabel.classList.add('visible');
}

// ── STAR PARTICLES ───────────────────────────────────────────────────────────
function spawnStars(cx, cy) {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2;
    state.starParticles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      opacity: 1,
      size: 14 + Math.random() * 10,
      life: 0,
    });
  }
}

// ── NEXT CITY ─────────────────────────────────────────────────────────────────
function nextCity() {
  // Si se abandonó la partida (volvió al menú), no reactivar nada
  if (!state || document.getElementById('loading-screen')?.style.display !== 'none') return;
  if (mapGameOver) return;
  if (window.pendingGameMode === 'monuments') {
    if (document.body.classList.contains('recording-mode')) {
      state.currentCity = MONUMENTS.find(m => m.name === 'Coliseo Romano') || MONUMENTS_EASY[0];
    } else {
      if (state.poolIndex >= state.monumentPool.length) {
        const isPrac = window.practiceConfig && window.practiceConfig.active;
        const base = isPrac ? practiceGetMonumentPool() : (state.monumentsUnlocked ? MONUMENTS : MONUMENTS_EASY);
        const unseen = base.filter(m => !state.monumentsSeen.has(m.name));
        if (isPrac && unseen.length === 0) {
          mapGameOver = true; canvas.style.pointerEvents = 'none';
          endGame();
          return;
        }
        state.monumentPool = shuffle(unseen.length ? unseen : [...base], monumentsRand);
        state.poolIndex = 0;
      }
      state.currentCity = state.monumentPool[state.poolIndex++];
    }
    state.cityShownAt = Date.now();
    state.phase = 'waiting';
    slideMonumentIn(state.currentCity);
    if (typeof window._specReportRound === 'function') {
      window._specReportRound({
        mode: 'monuments', index: _monumentsSpecRoundIdx++,
        monumentName: state.currentCity.name, img: state.currentCity.img,
        lat: state.currentCity.lat, lon: state.currentCity.lon,
        timeLeft: state.timeLeft,
      });
    }
  } else {
    const isPrac = window.practiceConfig && window.practiceConfig.active;
    if (isPrac) {
      // Use the pool fixed at game start — never re-compute to avoid stale-config bugs
      const fullPool = state.practiceCityFullPool;
      if (fullPool.every(c => state.citiesPerfect.has(c.name))) {
        mapGameOver = true; canvas.style.pointerEvents = 'none'; endGame(); return;
      }
      state.currentCity = practiceCityPickNext();
    } else {
      state.currentCity = pickCity(state.cityQueues, correctCount);
    }
    state.cityShownAt = Date.now();
    state.phase = 'waiting';
    slideTagIn(state.currentCity.name, state.currentCity.country);
    if (typeof window._specReportRound === 'function') {
      window._specReportRound({
        mode: 'game', index: _citiesSpecRoundIdx++,
        cityName: state.currentCity.name, countryCode: state.currentCity.country,
        lat: state.currentCity.lat, lon: state.currentCity.lon,
        timeLeft: state.timeLeft,
      });
    }
  }
}

function slideMonumentIn(monument) {
  const wasVisible = cityTagEl.style.visibility === 'visible';
  if (wasVisible) {
    const ghost = cityTagEl.cloneNode(true);
    ghost.className = 'city-tag-ghost';
    ghost.style.left       = cityTagEl.style.left;
    ghost.style.top        = cityTagEl.style.top;
    ghost.style.visibility = 'visible';
    ghost.style.zIndex     = '9';
    ghost.style.transition = 'none';
    ghost.style.opacity    = '1';
    gameWrapper.appendChild(ghost);
    const ghostImg = ghost.querySelector('img');
    if (ghostImg) ghostImg.classList.add('monument-exit');
    const ghostMonumentImg = ghost.querySelector('#monument-img');
    if (ghostMonumentImg) ghostMonumentImg.classList.add('monument-exit');
    const ghostMonumentName = ghost.querySelector('#monument-name');
    if (ghostMonumentName && ghostMonumentName.textContent) ghostMonumentName.classList.add('monument-exit');
    setTimeout(() => ghost.remove(), 300);
  }

  const tagImg = cityTagEl.querySelector('img');
  tagImg.src = 'images/photo.png';
  tagImg.style.width  = tpx(431);
  tagImg.style.height = 'auto';
  cityTagText.style.display = 'none';
  monumentImgEl.src = `images/places/${monument.img}`;
  if (monumentImgEl.decode) monumentImgEl.decode().catch(() => {});
  monumentImgEl.style.display = 'block';

  // Precargar la imagen del próximo monumento en background
  if (state && state.monumentPool) {
    const nextIdx = state.poolIndex < state.monumentPool.length ? state.poolIndex : 0;
    const nextM   = state.monumentPool[nextIdx];
    if (nextM && nextM.img) {
      const pre = new Image();
      pre.src = `images/places/${nextM.img}`;
      if (pre.decode) pre.decode().catch(() => {});
    }
  }

  cityTagEl.style.transition  = 'none';
  cityTagEl.style.left        = tpx(-50);
  cityTagEl.style.top         = tpx(-55);
  cityTagEl.style.visibility  = 'visible';
  setTimeout(() => { sfxTag.currentTime = 0; sfxPlay(sfxTag); }, 200);

  monumentNameEl.textContent = '';
  monumentNameEl.style.opacity = '0';
  if (slideMonumentIn._nameTimer) clearTimeout(slideMonumentIn._nameTimer);
  slideMonumentIn._nameTimer = setTimeout(() => {
    // GUARD: este timer tiene 3.5s de delay — bien largo. Si en ese lapso el
    // ESPECTADOR ya pasó a Cities (_citiesSpecMode), NO escribir el nombre
    // del monumento: quedaría encima del cartel de la ciudad, pegado (el
    // "sigue mostrando el nombre de monumentos en ciudades" reportado, que
    // los cancels no cubrían porque el timer se agendaba de nuevo o disparaba
    // en un hueco). Mismo problema para el JUGADOR REAL, no solo el
    // espectador: si el último monumento de una partida (versus grupal) se
    // ve justo antes de que la ronda/partida termine, este timer puede
    // sobrevivir al "jugar de nuevo" — si la revancha vuelve a arrancar
    // Ciudades dentro de esos 3.5s, escribía el nombre del monumento VIEJO
    // encima del cartel nuevo de Ciudades apenas entraba (el "tag3.png
    // descolocado con una identificación de monumentos de la partida
    // anterior" reportado). startGame() (real) SÍ cancela este timer, pero
    // solo si ya corrió para cuando este dispara — chequear el modo ACTUAL
    // acá mismo es la garantía real, sin depender de esa carrera de timing.
    if (typeof _citiesSpecMode !== 'undefined' && _citiesSpecMode) return;
    if (window.pendingGameMode !== 'monuments') return;
    monumentNameEl.textContent = (typeof tMonument === 'function') ? tMonument(monument.name) : monument.name;
    monumentNameEl.style.opacity = '1';
  }, 3500);

  tagImg.classList.remove('monument-appear');
  monumentImgEl.classList.remove('monument-appear');
  void tagImg.offsetWidth;
  tagImg.classList.add('monument-appear');
  monumentImgEl.classList.add('monument-appear');
}

// ── CLICK ─────────────────────────────────────────────────────────────────────
canvas.addEventListener('click', (e) => {
  // El 'click' dispara igual al soltar tras arrastrar el mapa (con zoom) —
  // si el gesto fue un drag real, no cuenta como intento de adivinar.
  if (_mapJustDragged) { _mapJustDragged = false; return; }
  if (mapGameOver || !state || state.phase !== 'waiting') return;
  state.phase = 'animating';
  const isRecordingMonuments = document.body.classList.contains('recording-mode') && window.pendingGameMode === 'monuments';
  if (slideTagIn._countryTimer) { clearTimeout(slideTagIn._countryTimer); slideTagIn._countryTimer = null; }
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  sfxPin.currentTime = 0;
  sfxPlay(sfxPin);

  const rect    = canvas.getBoundingClientRect();

  const scaleX  = canvas.width / rect.width;
  const scaleY  = canvas.height / rect.height;
  const screenClickX = (e.clientX - rect.left) * scaleX;
  const screenClickY = (e.clientY - rect.top) * scaleY;
  // El click llega en píxeles de PANTALLA (afectados por el zoom del mapa);
  // se convierte a coordenadas de MUNDO acá mismo así todo lo que sigue
  // (distancia/grade, dot guardado, spectator sync, cálculo de km) sigue
  // funcionando en el mismo sistema de siempre, sin tocar nada más abajo.
  // Esto también es lo que hace que el zoom dé más precisión: la misma
  // tolerancia de PERFECT_PX/GOOD_PX/FAIR_PX en mundo cubre menos pantalla
  // (y por lo tanto menos margen de error de mouse) cuanto más zoom.
  const clickWorld = screenToWorld(screenClickX, screenClickY);
  const clickX = clickWorld.x;
  const clickY = clickWorld.y;

  const correct = latLonToCanvas(state.currentCity.lat, state.currentCity.lon);
  const d       = dist(clickX, clickY, correct.x, correct.y);
  const grade   = classify(d);
  const shownAt = state.cityShownAt;

  saveGradeCount(grade);

  let base, bonusAmt, totalGained, badgeColor, inRowBonus;

  if (window.pendingGameMode === 'game') {
    // ── Cities: multiplicador M + badge de racha "IN A ROW" ──
    const M = getCitiesM(correctCount); // M usa correctCount (total correcto) — leer ANTES de incrementar
    base     = CITIES_SCORE_MAP[grade];
    const elapsed = (Date.now() - shownAt) / 1000;
    const _citiesPracticeInf = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    const gotBonus = !_citiesPracticeInf && base > 0 && elapsed < SPEED_BONUS_WIN;
    bonusAmt      = gotBonus ? Math.round(base * (CITIES_SPEED_MULT - 1)) : 0;
    // Racha CONSECUTIVA (state.streak) para el badge "IN A ROW" — se resetea
    // en wayoff, igual que Monuments. Antes Cities no la rastreaba y el badge
    // nunca salía (los hitos 3/5/10/… quedaban invisibles, reportado — en
    // versus Y en práctica). correctCount (total correcto, para el
    // multiplicador M) mantiene su propia cuenta aparte.
    if (grade === 'wayoff') {
      state.streak = 0;
    } else {
      state.streak++;
      correctCount++;
    }
    badgeColor    = getBadgeImg(state.streak);
    inRowBonus    = getInRowBonus(state.streak);
    totalGained   = Math.round((base + bonusAmt) * M) + inRowBonus;
  } else {
    // ── Monuments: mismo mecanismo que Cities (M + bonus binario de velocidad),
    // reverse-engineered de video: perfect/good dan siempre el mismo puntaje,
    // fair queda en la proporción good/perfect del sistema viejo (2/3). Ver
    // MONUMENTS_M_TABLE.
    const M = getMonumentsM(correctCount); // leer ANTES de incrementar, igual que Cities
    base     = MONUMENTS_SCORE_MAP[grade];
    const elapsed = (Date.now() - shownAt) / 1000;
    const _monPracticeInf = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    const gotBonus = !_monPracticeInf && base > 0 && elapsed < SPEED_BONUS_WIN;
    bonusAmt = gotBonus ? Math.round(base * (MONUMENTS_SPEED_MULT - 1)) : 0;
    if (grade === 'wayoff') {
      state.streak = 0;
    } else {
      state.streak++;
      correctCount++;
    }
    badgeColor  = getBadgeImg(state.streak);
    inRowBonus  = getInRowBonus(state.streak);
    // Math.floor (no round): con M=1.5/2.5/7.5 el producto cae justo en .5 y el
    // video de referencia mostraba el valor de abajo (67, no 68), no el de arriba.
    totalGained = Math.floor((base + bonusAmt) * M) + inRowBonus;
  }

  state.score += totalGained;
  if (window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') {
    if (window._vsActive && typeof window._vsReportAnswer === 'function') window._vsReportAnswer(grade !== 'wayoff', Math.round(state.score));
    if (window._lobbyActive && typeof window._lobbyReportAnswer === 'function') window._lobbyReportAnswer(grade !== 'wayoff', Math.round(state.score));
    if (grade === 'wayoff' && (window._vsActive || window._lobbyActive) && typeof window._lbWrongEffect === 'function') window._lbWrongEffect('player');
  }
  // Popup de "+puntaje": SOLO lo ganado por el acierto (base·bonus·M), SIN el
  // inRowBonus — el bonus de racha va aparte, en el badge "IN A ROW".
  if (window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') {
    const _acierto = totalGained - inRowBonus;
    if (_acierto > 0) showScorePopup(_acierto);
  }
  if (bonusAmt > 0) {
    clearTimeout(speedBonusHideId);
    speedBonusText.classList.remove('visible');
    void speedBonusText.offsetWidth;
    speedBonusText.classList.add('visible');
    speedBonusHideId = setTimeout(() => speedBonusText.classList.remove('visible'), 1600);
  }

  // fontSize se calcula UNA vez acá (no en cada frame del render loop, donde
  // antes corría measureText() en un while por cada dot visible en pantalla,
  // 60 veces por segundo durante los 4s que dura la etiqueta — bastante costo
  // de canvas repetido sin necesidad, ya que el resultado es siempre el mismo
  // para el mismo nombre).
  const _dotLabel = (window.pendingGameMode === 'monuments')
    ? ((typeof tMonument === 'function') ? tMonument(state.currentCity.name) : state.currentCity.name)
    : ((typeof tCity === 'function') ? tCity(state.currentCity.name) : state.currentCity.name);
  let _dotFontSize = 11;
  ctx.font = `bold ${_dotFontSize}px Georgia`;
  while (_dotFontSize > 7 && ctx.measureText(_dotLabel).width > 90) {
    _dotFontSize--;
    ctx.font = `bold ${_dotFontSize}px Georgia`;
  }

  state.placedDots.push({
    x: correct.x, y: correct.y,
    name: state.currentCity.name,
    labelOpacity: 1,
    labelBorn: Date.now(),
    permanent: grade === 'perfect' || isRecordingMonuments,
    fontSize: _dotFontSize,
  });

  const isPractice = window.practiceConfig && window.practiceConfig.active;

  if (grade !== 'wayoff') {
    advanceDot();
    if (window.pendingGameMode === 'monuments') {
      // En práctica: solo marcar como visto si fue PERFECT; si no, vuelve al pool
      if (!isPractice || grade === 'perfect') {
        state.monumentsSeen.add(state.currentCity.name);
      }
      if (!isPractice && !state.monumentsUnlocked) {
        state.monumentsCorrectCount++;
        if (state.monumentsCorrectCount >= 3) {
          state.monumentsUnlocked = true;
          const remaining = MONUMENTS.filter(m => !state.monumentsSeen.has(m.name));
          state.monumentPool = shuffle(remaining.length ? remaining : [...MONUMENTS], monumentsRand);
          state.poolIndex = 0;
        }
      }
    }
  } else if (isPractice && window.pendingGameMode === 'monuments') {
    // wayoff en práctica: no eliminar del pool tampoco
  }

  // En práctica con ciudades: marcar como completada según regiones seleccionadas
  // >1 región → perfecto O bien la sacan del pool; 1 región → solo perfecto
  if (isPractice && window.pendingGameMode === 'game') {
    const multiRegion = window.practiceConfig && window.practiceConfig.continents && window.practiceConfig.continents.size > 1;
    const qualifies = grade === 'perfect' || (multiRegion && grade === 'good');
    if (qualifies) {
      state.citiesPerfect.add(state.currentCity.name);
    }
  }

  const clickLL  = canvasToLatLon(clickX, clickY);
  const correctLL = { lat: state.currentCity.lat, lon: state.currentCity.lon };
  const distKm = haversineKm(clickLL.lat, clickLL.lon, correctLL.lat, correctLL.lon);
  if ((window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._specReportAnswer === 'function') {
    // clickX/clickY/correct.x/correct.y son coordenadas de canvas (DISPLAY_W/H),
    // portables 1:1 al canvas del espectador porque usa la misma calibración.
    // totalGained/bonusAmt viajan para que el espectador pueda mostrar el
    // popup de "+puntos" y el cartel de bonus de velocidad igual que el
    // jugador real — sin esto no había forma de saber cuánto mostrar.
    // + campaignBase(): el espectador no tiene forma propia de saber cuánto
    // acumuló el jugador en modos anteriores de la campaña — sin sumarlo
    // acá, veía el puntaje arrancar de 0 en Ciudades en vez de seguir
    // sumando desde Banderas/Siluetas.
    // streak/inRowBonus: ahora en Monuments Y Cities (ambos rastrean racha
    // consecutiva para el badge "IN A ROW") — van como NÚMERO, no la imagen ya
    // resuelta (badgeColor es un elemento <img> del jugador real, no
    // serializable); el espectador reconstruye la imagen llamando getBadgeImg(streak) él
    // mismo, es una función pura del streak.
    // dots: el "trencito" de +5s (advanceDot) es la MISMA función reusada del
    // lado espectador, pero sus dots LOCALES se cuentan desde que se unió —
    // si entró a mitad de partida, su trencito llenaba/vaciaba en momentos
    // distintos a los del jugador real. state.dots (post-increment, YA pasó
    // por advanceDot() arriba) viaja acá para que el espectador pueda
    // pisar su valor local con el real antes de llamar a su propio
    // advanceDot() (ver citiesSpectatorResolvePick/monumentsSpectatorResolvePick).
    window._specReportAnswer(grade !== 'wayoff', Math.round(state.score + (window.campaignBase ? window.campaignBase() : 0)), {
      grade, clickX, clickY, correctX: correct.x, correctY: correct.y, distKm,
      cityName: state.currentCity.name, totalGained, bonusAmt,
      streak: state.streak, inRowBonus, dots: state.dots,
    });
  }
  state.pin1Anim = { x: clickX, y: clickY,
                    targetX: correct.x, targetY: correct.y,
                    distKm, grade,
                    progress: 0,
                    lineProgress: 0,
                    opacity: 1,
                    fading: false,
                    wobbleTime: 0,
                    sunburstSpawned: false
                  };
  const capturedPin1 = state.pin1Anim;

  setTimeout(() => {
    state.pin2Anim = { x: correct.x, y: correct.y,
                      progress: 0,
                      opacity: 1,
                      fading: false,
                      wobbleTime: 0,
                      starsSpawned: false,
                      onLanded: () => {
                        spawnStars(correct.x, correct.y);
                        if (!isRecordingMonuments) {
                          setTimeout(() => {
                            // showResultLabel posiciona un <div> DOM superpuesto al canvas
                            // (no dibuja en el ctx), así que necesita coordenadas de PANTALLA.
                            const rlPos = worldToScreen(correct.x, correct.y);
                            showResultLabel(rlPos.x, rlPos.y, grade, base, bonusAmt);
                            if (badgeColor) {
                              state.badgeAnim = { t: 0, img: badgeColor, streak: state.streak, inRowBonus };
                              setTimeout(() => { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); }, 800);
                            }
                          }, 200);
                        }
                        setTimeout(() => {
                          if (state.phase === 'idle') return;
                          state.phase = 'waiting';
                          if (!isRecordingMonuments) nextCity();
                        }, 350);
                      }
                    };
    const capturedPin2 = state.pin2Anim;
    if (!isRecordingMonuments) setTimeout(() => { if (state.pin2Anim === capturedPin2) capturedPin2.fading = true; }, 1000);
  }, 300);

  if (!isRecordingMonuments) setTimeout(() => { if (state.pin1Anim === capturedPin1) capturedPin1.fading = true; }, 1000);
});

// ── BADGE ─────────────────────────────────────────────────────────────────────
const MILESTONE_BONUSES = { 3:100, 5:200, 10:400, 15:500, 20:600, 25:800, 30:1200, 35:1500, 40:1800, 45:2000, 50:2500, 55:3000 };
function getInRowBonus(streak) {
  if (MILESTONE_BONUSES[streak]) return MILESTONE_BONUSES[streak];
  if (streak >= 60 && streak % 5 === 0) return 3500 + ((streak - 60) / 5) * 500;
  return 0;
}

const BADGE_STROKE = { 5:'#3d5806', 10:'#5c0000', 20:'#104696', 30:'#6b0015', 40:'#ac7600', 50:'#383838' };
function getBadgeStrokeColor(streak) {
  return BADGE_STROKE[streak] ?? '#623103';
}

let BADGE_IMG = null;
function getBadgeImg(streak) {
  if (!BADGE_IMG) {
    BADGE_IMG = { 3:imgBadgeGold, 5:imgBadgeGreen, 10:imgBadgeRed, 15:imgBadgeGold,
      20:imgBadgeBlue, 25:imgBadgeGold, 30:imgBadgeGarnet, 35:imgBadgeGold,
      40:imgBadgeYellow, 45:imgBadgeGold, 50:imgBadgeSilver };
  }
  if (BADGE_IMG[streak]) return BADGE_IMG[streak];
  if (streak >= 55 && streak % 5 === 0) return imgBadgeGold;
  return null;
}

// ── RENDER ───────────────────────────────────────────────────────────────────
// render() real, renombrada — la versión pública de más abajo la envuelve en
// try/catch. Motivo: si el usuario cambia de pestaña y vuelve, el navegador
// PAUSA requestAnimationFrame por completo mientras está oculta (los
// setTimeout/setInterval del juego NO se pausan, solo se throttlean) — al
// volver, el próximo frame de render() puede recibir un dt gigante (todo el
// tiempo que estuvo la pestaña oculta de un salto). Si eso disparaba una
// excepción en CUALQUIER punto de esta función (antes de llegar a su propio
// requestAnimationFrame(render) del final), el loop entero moría en
// silencio: el mapa quedaba visualmente congelado y con state.phase pegado
// en lo que sea que valía en ese momento — si no era 'waiting', el canvas
// dejaba de reaccionar a los clicks para siempre, exactamente el bug
// reportado ("cambio de pestaña y vuelvo, y el mapa no reacciona a clicks").
function _renderFrame(timestamp) {
  if (!state) return;

  // Clamp defensivo: aunque no haga falta para evitar el crash de más arriba
  // (el catch de abajo ya lo cubre), un dt de varios minutos de un salto
  // igual podía disparar animaciones/tweens a velocidades absurdas por UN
  // frame. 0.25s alcanza y sobra para cualquier frame real a 4fps+.
  let dt = state.lastTimestamp ? (timestamp - state.lastTimestamp) / 1000 : 0;
  if (dt > 0.25) dt = 0.25;
  state.lastTimestamp = timestamp;

  // Nada animándose → no hace falta limpiar ni redibujar el mapa de fondo
  // completo (drawImage de la imagen entera) 60 veces por segundo sin parar;
  // el canvas ya retiene el último frame dibujado tal cual quedó. Antes esto
  // corría SIEMPRE, incluso con el jugador parado mirando el mapa sin hacer
  // nada — el gasto continuo de CPU/GPU era la causa más probable del lag
  // persistente, sobre todo en hardware más modesto.
  // Un dot NO permanente sigue "activo" mientras siga en el array, sin
  // importar la edad exacta — el filtro que lo saca (más abajo) vive DENTRO
  // del bloque que este idle-check saltea, así que si cortáramos por edad
  // exacta (age<4) un dot podía quedar con opacidad ~0 pero nunca EXACTAMENTE
  // 0, sin que el filtro llegue a sacarlo nunca — un "zombie" acumulándose en
  // el array para siempre. Los permanentes sí cortan por edad (age<4): una vez
  // asentada su bandera/label ya no cambian más, quedan estáticos.
  const anyActiveDot = state.placedDots.some(dot =>
    !dot.permanent || (Date.now() - dot.labelBorn) / 1000 < 4
  );
  const isIdle = state.mapDrawn && !anyActiveDot && !state.sunburst && !state.pin1Anim && !state.pin2Anim &&
                 state.starParticles.length === 0 && !state.badgeAnim &&
                 state.displayedScore >= state.score;
  if (isIdle) {
    animFrameId = requestAnimationFrame(render);
    return;
  }

  ctx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
  const activeMap = window.pendingGameMode === 'monuments' ? imgMap2 : imgMap;
  // Zoom del mapa: recorta una porción más chica de la imagen fuente cuanto
  // más zoom (mapCamera.zoom), estirada al canvas completo — así solo el
  // fondo se agranda, sin tocar el tamaño de nada que se dibuje encima.
  {
    const vw   = DISPLAY_W / mapCamera.zoom;
    const vh   = DISPLAY_H / mapCamera.zoom;
    const natW = activeMap.naturalWidth  || DISPLAY_W;
    const natH = activeMap.naturalHeight || DISPLAY_H;
    ctx.drawImage(
      activeMap,
      (mapCamera.x / DISPLAY_W) * natW, (mapCamera.y / DISPLAY_H) * natH,
      (vw / DISPLAY_W) * natW,          (vh / DISPLAY_H) * natH,
      0, 0, DISPLAY_W, DISPLAY_H
    );
  }
  state.mapDrawn = true;

  if (state.displayedScore < state.score) {
    const diff = state.score - state.displayedScore;
    state.displayedScore = Math.min(state.score, state.displayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    scoreValueEl.textContent = (state.displayedScore + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
    // sortLeaderboard() usa positionLeaderboard(), que reposiciona
    // lbElements['lb-player'] con la lógica de leaderboard NORMAL
    // multi-fila — ni existe durante el espectador de Cities (la tarjeta la
    // arma citiesSpectatorSetPlayerCard() a mano). Mismo bug que el fix del
    // resize: pisaba la altura de 1 fila y la tarjeta se veía saltar arriba
    // cada vez que el puntaje del espectado subía. Ver
    // citiesSpectatorReposition() más arriba.
    if (window._isSpectating) {
      // Grupal (N filas, ver GroupSpectate/_renderGroupLeaderboard en
      // spectate.js) es un caso DISTINTO del 1v1 (citiesSpectatorReposition,
      // 2 filas fijas) — llamando siempre a la de 1v1, la cartilla grupal
      // nunca se volvía a posicionar cuando el puntaje del espectado subía,
      // quedando con alturas viejas (el "se rompe la posición de la
      // tablilla" reportado).
      if (typeof window._isGroupSpectating === 'function' && window._isGroupSpectating()) {
        window._refreshGroupSpectatorLeaderboard?.();
      } else if (typeof window.citiesSpectatorReposition === 'function') {
        window.citiesSpectatorReposition();
      }
    } else {
      sortLeaderboard(state.score);
    }
  }

  for (const dot of state.placedDots) {
    const age = (Date.now() - dot.labelBorn) / 1000;
    dot.labelOpacity = age < 3 ? 1 : Math.max(0, 1 - (age - 3));

    // dot.x/y son coordenadas de MUNDO (mismas que latLonToCanvas); se
    // dibujan en su posición de PANTALLA (sigue el zoom del mapa) pero con
    // tamaño fijo — el punto/nombre/banderín no se agrandan con el mapa.
    const { x: sx, y: sy } = worldToScreen(dot.x, dot.y);

    const dotAlpha = dot.permanent ? 1 : dot.labelOpacity;
    ctx.globalAlpha = dotAlpha;
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    const perfectColor = window.pendingGameMode === 'monuments' ? '#000000' : '#ff2222';
    ctx.fillStyle = dot.permanent ? perfectColor : '#666666';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (dot.permanent && age >= 2 && window.pendingGameMode === 'monuments' && !document.body.classList.contains('recording-mode')) {
      const flagAlpha = Math.min(1, (age - 2) / 0.1);
      const fw = (imgFlag.naturalWidth  || 24) * 0.8;
      const fh = (imgFlag.naturalHeight || 24) * 0.8;
      const angle = (60 * (1 - flagAlpha)) * Math.PI / 180;
      ctx.globalAlpha = flagAlpha;
      ctx.save();
      ctx.translate(sx + 6, sy + 4);
      ctx.rotate(angle);
      ctx.drawImage(imgFlag, -fw / 2, -fh, fw, fh);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    if (age < 4) {
      ctx.globalAlpha = dot.labelOpacity;

      // fontSize ya viene calculado desde que se creó el dot (ver placedDots.push) —
      // antes esto corría measureText() en un while todos los frames.
      ctx.font = `bold ${dot.fontSize || 11}px Georgia`;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3;
      const dotLabel = (window.pendingGameMode === 'monuments')
        ? ((typeof tMonument === 'function') ? tMonument(dot.name) : dot.name)
        : ((typeof tCity === 'function') ? tCity(dot.name) : dot.name);
      ctx.strokeText(dotLabel, sx, sy + 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(dotLabel, sx, sy + 8);

      ctx.globalAlpha = 1;
    }
  }

  state.placedDots = state.placedDots.filter(dot =>
    dot.permanent || dot.labelOpacity > 0
  );

// ── SUNBURST ────────────────────────────
if (state.sunburst) {
  const sb = state.sunburst;
  sb.t += dt;
  const dur = 0.35;
  const prog = sb.t / dur;
  if (prog >= 1) {
    state.sunburst = null;
  } else {
    const TAU = Math.PI * 2;
    const alpha = Math.pow(1 - prog, 1.5) * 0.78;

    const sbScreen = worldToScreen(sb.x, sb.y);
    const drawLayer = (rays, innerR, outerR, tipW, rotSpeed) => {
      const angle = sb.t * rotSpeed;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sbScreen.x, sbScreen.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#0a0a0a';
      ctx.beginPath();
      for (let i = 0; i < rays; i++) {
        const aTip = (i / rays) * TAU;
        const aL   = aTip - tipW * TAU;
        const aR   = aTip + tipW * TAU;
        ctx.moveTo(Math.cos(aTip) * outerR, Math.sin(aTip) * outerR);
        ctx.lineTo(Math.cos(aL)   * innerR, Math.sin(aL)   * innerR);
        ctx.lineTo(Math.cos(aR)   * innerR, Math.sin(aR)   * innerR);
        ctx.closePath();
      }
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    drawLayer(12, 4 + prog * 6,  12 + prog * 68, 0.28 / 12,  -4.4);
    drawLayer( 8, 5 + prog * 8,   8 + prog * 50, 0.30 /  8, -2.2);
  }
}

// ── DIBUJO PINS ──────────────────────────
  function drawPin(pinState, img, tip, xDir) {
    const p = pinState;
    const d    = 220 * (1 - p.progress);
    const sc   = 10 - 9 * p.progress;
    const curW = PIN_W * sc;
    const curH = PIN_H * sc;
    // p.x/p.y son coordenadas de MUNDO — se posicionan en pantalla (sigue el
    // zoom), pero "d" (altura del arco de tiro) y el tamaño del pin (curW/curH)
    // son offsets de animación en píxeles de pantalla fijos, sin escalar.
    const pScreen = worldToScreen(p.x, p.y);
    const tipX = pScreen.x + xDir * d;
    const tipY = pScreen.y - d;

    let angle = 0;
    if (p.progress >= 1) {
      p.wobbleTime += dt;
      const duration = 0.08;
      if (p.wobbleTime < duration) {
        const half = duration / 2;
        const maxRad = (3 * Math.PI) / 180;
        angle = p.wobbleTime < half
          ? (p.wobbleTime / half) * maxRad
          : maxRad - ((p.wobbleTime - half) / half) * maxRad;
      }
    }

    const hf = 1 - p.progress;
    const shadowAlpha = Math.max(0, (p.progress - 0.1) / 0.9) * 0.30 * p.opacity;
    if (shadowAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = shadowAlpha;
      ctx.filter = 'brightness(0) blur(1.5px)';
      ctx.translate(tipX, tipY);
      ctx.rotate(angle);
      ctx.transform(1, 0, -hf * 1.2, 0.08, 0, 0);
      ctx.drawImage(img, -curW * tip.x, -curH * tip.y, curW, curH);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = p.opacity;
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    ctx.drawImage(img, -curW * tip.x, -curH * tip.y, curW, curH);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ── Línea animada entre pin del jugador y pin correcto (crece dash a dash) ───
  if (state.pin1Anim && state.pin1Anim.progress >= 1 && state.pin1Anim.grade === 'wayoff') {
    const p1 = state.pin1Anim;
    const p2 = state.pin2Anim;
    if (!p1.fading) p1.lineProgress = Math.min(1, p1.lineProgress + dt / 0.45);
    const lp = p1.lineProgress;
    // p1.x/y, p2.x/y y p1.targetX/Y son coordenadas de MUNDO — la línea y su
    // label se dibujan en pantalla (siguen el zoom) con grosor/font fijos.
    const p1Screen = worldToScreen(p1.x, p1.y);
    const destWorldX = p2 ? p2.x : p1.targetX;
    const destWorldY = p2 ? p2.y : p1.targetY;
    const destScreen = worldToScreen(destWorldX, destWorldY);
    const toX = p1Screen.x + lp * (destScreen.x - p1Screen.x);
    const toY = p1Screen.y + lp * (destScreen.y - p1Screen.y);
    const lineAlpha = p2 ? Math.min(p1.opacity, p2.opacity) : p1.opacity;
    if (lp > 0.001 && lineAlpha > 0.01) {
      const DASH = 14, GAP = 9, PERIOD = DASH + GAP;
      const offset = -(Date.now() * 0.06 % PERIOD);
      ctx.save();
      ctx.globalAlpha = lineAlpha;
      ctx.lineCap = 'round';
      // borde blanco
      ctx.beginPath();
      ctx.moveTo(p1Screen.x, p1Screen.y);
      ctx.lineTo(toX, toY);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 4;
      ctx.setLineDash([DASH, GAP]);
      ctx.lineDashOffset = offset;
      ctx.stroke();
      // línea negra encima
      ctx.beginPath();
      ctx.moveTo(p1Screen.x, p1Screen.y);
      ctx.lineTo(toX, toY);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.setLineDash([DASH, GAP]);
      ctx.lineDashOffset = offset;
      ctx.stroke();
      ctx.setLineDash([]);

      // Label de distancia — solo en "muy lejos", punto medio fijo rotado
      const labelAlpha = Math.max(0, (lp - 0.75) / 0.25);
      if (labelAlpha > 0.01 && p1.grade === 'wayoff' && p1.distKm !== undefined) {
        const km = p1.distKm;
        const label = km < 1
          ? '< 1 km'
          : Math.round(km).toLocaleString() + ' km';
        const midX = (p1Screen.x + destScreen.x) / 2;
        const midY = (p1Screen.y + destScreen.y) / 2;
        let angle = Math.atan2(destScreen.y - p1Screen.y, destScreen.x - p1Screen.x);
        // Mantener el texto siempre legible (nunca boca abajo)
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
        const fs = Math.round(DISPLAY_W * 0.014);
        ctx.save();
        ctx.globalAlpha = lineAlpha * labelAlpha;
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        ctx.font = `bold ${fs}px "VAGRoundBold", "Arial Black", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineWidth = fs * 0.28;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineJoin = 'round';
        ctx.strokeText(label, 0, -6);
        ctx.fillStyle = '#000000';
        ctx.fillText(label, 0, -6);
        ctx.restore();
      }

      ctx.restore();
    }
  }

  if (state.pin1Anim) {
    const p = state.pin1Anim;
    if (p.fading) {
      p.opacity = Math.max(0, p.opacity - dt / 0.1);
      if (p.opacity <= 0) { state.pin1Anim = null; }
    } else {
      p.progress = Math.min(1, p.progress + dt / 0.1);
      if (p.progress >= 1 && !p.sunburstSpawned) {
        p.sunburstSpawned = true;
        state.sunburst = { x: p.x, y: p.y, t: 0 };
      }
    }
    if (state.pin1Anim) drawPin(state.pin1Anim, imgPin1, PIN1_TIP, 1);
  }

  if (state.pin2Anim) {
    const p = state.pin2Anim;
    if (p.fading) {
      p.opacity = Math.max(0, p.opacity - dt / 0.1);
      if (p.opacity <= 0) { state.pin2Anim = null; }
    } else {
      p.progress = Math.min(1, p.progress + dt / 0.1);
      if (p.progress >= 1 && !p.starsSpawned && p.onLanded) {
        p.starsSpawned = true;
        p.onLanded();
      }
    }
    if (state.pin2Anim) drawPin(state.pin2Anim, imgPin2, PIN2_TIP, -1);
  }

  for (let i = state.starParticles.length - 1; i >= 0; i--) {
    const s = state.starParticles[i];
    s.life += dt;
    s.x    += s.vx;
    s.y    += s.vy;
    s.vy   += 0.06;
    s.opacity = Math.max(0, 1 - s.life / 0.8);
    if (s.opacity <= 0) { state.starParticles.splice(i, 1); continue; }
    const sScreen = worldToScreen(s.x, s.y);
    ctx.globalAlpha = s.opacity;
    ctx.drawImage(imgStar, sScreen.x - s.size / 2, sScreen.y - s.size / 2, s.size, s.size);
    ctx.globalAlpha = 1;
  }

  // Limpiar el overlay del badge solo si hay algo dibujado (o lo hubo el frame
  // anterior, para borrarlo), en vez de un clearRect full en cada frame.
  if (state.badgeAnim || render._badgeDirty) {
    badgeOverlayCtx.clearRect(0, 0, DISPLAY_W, DISPLAY_H);
  }
  render._badgeDirty = !!state.badgeAnim;
  if (state.badgeAnim) {
    const ba = state.badgeAnim;
    ba.t += dt;
    const IN_END = 0.2, HOLD_END = 0.60, SHRINK_DUR = 0.22, TOTAL = HOLD_END + SHRINK_DUR;
    if (ba.t >= TOTAL) {
      state.badgeAnim = null;
    } else {
      let alpha, scale;
      if (ba.t < IN_END) {
        const p = ba.t / IN_END;
        alpha = p;
        scale = 0.25 + p * 0.75;
      } else if (ba.t < HOLD_END) {
        alpha = 1; scale = 1;
      } else {
        const p = (ba.t - HOLD_END) / SHRINK_DUR;
        alpha = 1; scale = 1 - p;
      }

      // Escala proporcional a DISPLAY_W (clamp a 1): en desktop queda igual, en
      // pantallas chicas (iOS) el check/IN A ROW dejan de salir gigantes.
      const BADGE_K = Math.min(1, DISPLAY_W / 1190);
      const W = 405 * BADGE_K, H = 333 * BADGE_K;
      const CW = 477 * BADGE_K, CH = 405 * BADGE_K;

      badgeOverlayCtx.save();
      badgeOverlayCtx.globalAlpha = alpha;
      badgeOverlayCtx.translate(DISPLAY_W / 2, DISPLAY_H / 2);
      badgeOverlayCtx.scale(scale, scale);
      badgeOverlayCtx.drawImage(imgCheck, -CW / 2, -CH / 2, CW, CH);
      badgeOverlayCtx.restore();

      const BZ_IN = 0.18, BZ_HOLD = 0.42, BZ_OUT = 0.72;
      let bonusScale;
      if      (ba.t < BZ_IN)   bonusScale = ba.t / BZ_IN;
      else if (ba.t < BZ_HOLD) bonusScale = 1;
      else if (ba.t < BZ_OUT)  bonusScale = 1 - (ba.t - BZ_HOLD) / (BZ_OUT - BZ_HOLD);
      else                     bonusScale = 0;

      if (bonusScale > 0) {
        const bonusLabel = `+${ba.inRowBonus}`;
        const bonusCX = DISPLAY_W / 2;
        const bonusCY = DISPLAY_H / 2 + CH / 2 + 20 * BADGE_K;
        badgeOverlayCtx.save();
        badgeOverlayCtx.globalAlpha = alpha;
        badgeOverlayCtx.translate(bonusCX, bonusCY);
        badgeOverlayCtx.scale(bonusScale, bonusScale);
        badgeOverlayCtx.font = `${104 * BADGE_K}px Dimbo, "Arial Black", sans-serif`;
        badgeOverlayCtx.textAlign = 'center';
        badgeOverlayCtx.textBaseline = 'middle';
        badgeOverlayCtx.strokeStyle = '#073A79';
        badgeOverlayCtx.lineWidth = 14 * BADGE_K;
        badgeOverlayCtx.strokeText(bonusLabel, 0, 0);
        badgeOverlayCtx.strokeStyle = '#FD9C1A';
        badgeOverlayCtx.lineWidth = 7 * BADGE_K;
        badgeOverlayCtx.strokeText(bonusLabel, 0, 0);
        badgeOverlayCtx.fillStyle = '#ffffff';
        badgeOverlayCtx.fillText(bonusLabel, 0, 0);
        badgeOverlayCtx.restore();
      }

      badgeOverlayCtx.save();
      badgeOverlayCtx.globalAlpha = alpha;
      badgeOverlayCtx.translate(DISPLAY_W / 2 + 30 * BADGE_K, DISPLAY_H / 2 - 30 * BADGE_K);
      badgeOverlayCtx.scale(scale, scale);
      badgeOverlayCtx.drawImage(ba.img, -W / 2, -H / 2, W, H);
      badgeOverlayCtx.font = `bold ${67 * BADGE_K}px Fredoka, sans-serif`;
      badgeOverlayCtx.textAlign = 'center';
      badgeOverlayCtx.textBaseline = 'middle';
      badgeOverlayCtx.scale(1, 1.2);
      badgeOverlayCtx.strokeStyle = getBadgeStrokeColor(ba.streak);
      badgeOverlayCtx.lineWidth = 11 * BADGE_K;
      badgeOverlayCtx.strokeText(`${ba.streak} IN A ROW`, 0, 0);
      badgeOverlayCtx.fillStyle = '#ffffff';
      badgeOverlayCtx.fillText(`${ba.streak} IN A ROW`, 0, 0);
      badgeOverlayCtx.restore();
    }
  }

  animFrameId = requestAnimationFrame(render);
}

// Wrapper público — ver comentario largo arriba de _renderFrame(). Si algo
// dentro tira una excepción (dt gigante al volver de una pestaña oculta,
// asset todavía no listo, lo que sea), el catch reprograma el próximo frame
// igual: el loop de animación NUNCA muere del todo, así state.phase siempre
// tiene la chance de volver a 'waiting' y el canvas nunca se queda sordo a
// los clicks de forma permanente.
function render(timestamp) {
  try {
    _renderFrame(timestamp);
  } catch (e) {
    if (state) state.lastTimestamp = null;
    animFrameId = requestAnimationFrame(render);
  }
}

// Evita el salto de dt gigante desde el origen (no solo mitigarlo en el catch
// de arriba) — al volver de una pestaña oculta, requestAnimationFrame estuvo
// pausado todo ese tiempo; el próximo frame real que llegue va a tener un
// timestamp muy adelantado respecto al último guardado. Sin esto, ESE primer
// frame post-regreso computaba un dt de varios segundos/minutos de un salto.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state) return;
  state.lastTimestamp = null;
  // Recalcular el cronómetro YA (no esperar al próximo tick del interval,
  // que puede tardar hasta 1s más) — así el número se autocorrige al
  // instante de volver, en vez de mostrar el valor viejo un momento.
  if (timerIntervalId) _timerTick();
});

// ── TIMER ─────────────────────────────────────────────────────────────────────
// timeLeft se calcula contra timerStartedAt (Date.now()), no restando 1 por
// tick — si el navegador throttlea el setInterval de una pestaña en 2do
// plano (le puede bajar la frecuencia a 1 tick cada varios segundos, o
// menos), un contador que resta 1 por tick pierde ticks reales y queda
// atrasado respecto al tiempo real; acá, en cuanto el interval vuelve a
// tickear (o la pestaña vuelve a primer plano), se autocorrige de una sola
// vez al valor real en vez de arrastrar el atraso (reportado: en salas
// grupales, un jugador con la pestaña minimizada le llegaba tarde su propio
// TIMES UP comparado con el resto).
function _timerTick() {
  if (!state) return;
  // Guarda por fase (no solo "!state"): quitToMenu() reemplaza state por uno
  // nuevo en 'idle' (resetState), no lo anula — así que este chequeo NO
  // frenaba un tick perdido de la ronda anterior si por lo que sea
  // timerIntervalId no se llegó a limpiar a tiempo (ej. una pestaña
  // minimizada mucho rato, donde el navegador puede tardar en aplicar el
  // clearInterval real). Sin esto, ese tick fantasma podía llegar a
  // state.timeLeft<=0 y llamar a endGame(), mostrando el TIMES UP gigante
  // encima del menú (reportado: "salgo un rato minimizado y vuelvo con un
  // times up gigante"). Con la guarda, cualquier tick que dispare estando
  // en 'idle' se autoelimina en vez de actuar.
  if (state.phase === 'idle') { clearInterval(timerIntervalId); timerIntervalId = null; return; }
  const _practiceInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
  if (_practiceInfinite) return;
  const elapsed = Math.floor((Date.now() - state.timerStartedAt) / 1000);
  state.timeLeft = Math.max(0, state.timerDuration - elapsed);
  timerNumberEl.textContent = state.timeLeft;
  timerNumberEl.classList.remove('timer-number-infinity');
  if ((window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._specReportTick === 'function') window._specReportTick(state.timeLeft);

  if (state.timeLeft <= 10) {
    timerNumberEl.style.color = '#ffffff';
    countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdownred4.png' : 'images/countdownred.png';
    if (state.timeLeft > 0) { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
  } else {
    timerNumberEl.style.color = '';
    countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdown4.png' : 'images/countdown.png';
  }

  if (state.timeLeft <= 0) endGame();
}

function startTimer() {
  const _practiceInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
  if (_practiceInfinite) { timerNumberEl.textContent = '∞'; timerNumberEl.classList.add('timer-number-infinity'); }
  else { timerNumberEl.textContent = state.timeLeft; timerNumberEl.classList.remove('timer-number-infinity'); }
  timerNumberEl.style.color = '';
  countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdown4.png' : 'images/countdown.png';
  countdownImg.style.animationPlayState = 'running';

  state.timerStartedAt = Date.now();
  timerIntervalId = setInterval(_timerTick, 1000);
}

let endGameTimeout1 = null, endGameTimeout2 = null;
function endGame() {
  mapGameOver = true;
  gameAborted = false;
  if ((window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._specReportTimesUp === 'function') window._specReportTimesUp();
  clearInterval(timerIntervalId); timerIntervalId = null;
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  monumentNameEl.style.opacity = '0';
  state.phase = 'idle';
  canvas.style.pointerEvents = 'none';
  countdownImg.style.animationPlayState = 'paused';

  playMusic(null);
  sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp);
  timeupOverlay.style.display = 'flex';
  timeupOverlay.classList.remove('timeup-out');
  timeupOverlay.classList.add('timeup-in');

  endGameTimeout1 = setTimeout(() => {
    if (gameAborted) return;
    timeupOverlay.classList.remove('timeup-in');
    timeupOverlay.classList.add('timeup-out');

    endGameTimeout2 = setTimeout(() => {
      if (gameAborted) return;
      timeupOverlay.style.display = 'none';
      timeupOverlay.classList.remove('timeup-out');

      cancelAnimationFrame(animFrameId);
      animFrameId = null;
      if (IS_MOBILE) {
        canvas.width = 1; canvas.height = 1;
        badgeOverlay.width = 1; badgeOverlay.height = 1;
      }
      gameWrapper.style.display = 'none';
      scoreDisplayEl.style.display = 'none';
      const cwHide = document.getElementById('countdown-widget');
      if (cwHide) cwHide.style.display = 'none';

      // ── VERSUS: redirigir al resultado W/L ───────────────
      if (window._vsActive && (window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._vsHandleGameEnd === 'function') {
        window._vsHandleGameEnd(state.score);
        return;
      }
      // ── LOBBY: reportar fin de modo al sistema grupal ─────
      if (window._lobbyActive && (window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._lobbyHandleGameEnd === 'function') {
        window._lobbyHandleGameEnd(state.score);
        return;
      }
      // ── PRÁCTICA: redirigir al panel de práctica ──────────
      if (window.practiceConfig && window.practiceConfig.active) {
        window.endPracticeSession(state.score, correctCount, wrongCount);
        return;
      }
      // ─────────────────────────────────────────────────────
      // Registrar la partida single-player para stats (cities/monuments).
      if (window.Analytics) {
        window.Analytics.logGame(window.pendingGameMode === 'monuments' ? 'monuments' : 'cities', state.score);
      }
      window.lastModeScore = state.score;
      finalScoreEl.textContent = (state.score + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
      // Durante una campaña en curso no se persiste el highscore todavía: se
      // muestra el banner como preview, pero el guardado real (localStorage +
      // var en memoria) se difiere a window._commitCampaignHighscores(),
      // llamado solo cuando se termina la Vuelta Mundial entera.
      const _inCampaign = !!(window.campaign && window.campaign.active);
      let isNewHighscore = false;
      let _bannerScore = 0;
      if (window.pendingGameMode === 'monuments') {
        isNewHighscore = state.score > monumentsHighscore;
        if (isNewHighscore) {
          _bannerScore = state.score;
          if (_inCampaign) {
            window.campaign.pendingHS.monuments = state.score;
          } else {
            monumentsHighscore = state.score;
            localStorage.setItem('monumentsHighscore', monumentsHighscore);
          }
        }
      } else {
        isNewHighscore = state.score > highscore;
        if (isNewHighscore) {
          _bannerScore = state.score;
          if (_inCampaign) {
            window.campaign.pendingHS.game = state.score;
          } else {
            highscore = state.score;
            localStorage.setItem('geochallenge_highscore', highscore);
            highscoreEl.textContent = highscore.toLocaleString();
            updateSplashHighscore();
          }
        }
      }
      newHighscoreBanner.style.display = isNewHighscore ? 'flex' : 'none';
      if (isNewHighscore) {
        newHighscoreScore.textContent = _bannerScore.toLocaleString();
      }
      if ((window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._specReportPostgame === 'function') {
        window._specReportPostgame({
          totalScore: state.score + (window.campaignBase ? window.campaignBase() : 0),
          finalScore: state.score, correctCount, wrongCount, isNewHighscore,
        });
      }
      const gameoverTextLabel = document.querySelector('.gameover-text1-label');
      if (gameoverTextLabel) {
        gameoverTextLabel.textContent = window.pendingGameMode === 'monuments'
          ? t('gameover.monuments')
          : t('gameover.cities');
      }
      if (window.pendingGameMode === 'monuments') {
        gameoverScreen.classList.add('mode-monuments');
      }
      window.hideGameoverConfirm();
      gameoverScreen.style.display = 'flex';
      const rpGO = document.getElementById('right-panel');
      if (rpGO) rpGO.style.display = 'none';
      restartFlightAtt();
      updateGradeCountsUI();
      buildChecksRow();
      const checksTotal = gradeCounts.perfect + gradeCounts.good + gradeCounts.fair;
      const checksEndTime = (checksTotal > 0 ? (checksTotal - 1) * 0.1 + 0.2 : 0) + 0.4;
      buildWrongsRow(checksEndTime);
      playMusic(sfxPostgame);
      // Revelar confirm solo cuando los assets del siguiente modo estén en caché.
      if (window.campaign && window.campaign.active && window.pendingGameMode === 'game' && typeof window.preloadNextModeAssets === 'function') {
        window.preloadNextModeAssets('monuments').then(window.showGameoverConfirm);
      } else {
        // Modo libre o último modo (monuments): no hay preload, confirmar después de un breve delay.
        setTimeout(window.showGameoverConfirm, 800);
      }
    }, 1000);
  }, 400 + 1200);
}

// ── ESCALADO RESPONSIVE ───────────────────────────────────────────────────────
function redimensionarJuego() {
  if (!gameWrapper || gameWrapper.style.display === 'none') return;

  const anchoVentana = window.STAGE_W;
  const altoVentana = window.STAGE_H;

  // Márgenes proporcionales (sin px fijos ni saltos por breakpoint) para que la
  // escala sea 100% proporcional al viewport y no "zoomee" de más al hacer zoom.
  const margenHorizontal = anchoVentana * 0.35;
  const margenVertical = altoVentana * 0.08;

  const escalaW = (anchoVentana - margenHorizontal) / DISPLAY_W;
  const escalaH = (altoVentana - margenVertical) / DISPLAY_H;

  let escalaFinal = Math.min(escalaW, escalaH);
  escalaFinal = escalaFinal * 0.92;

  gameWrapper.style.transform = `translate(-50%, -50%) scale(${escalaFinal})`;
  gameWrapper.style.transformOrigin = 'center center';
}

function showScorePopup(amount) {
  const el = document.createElement('div');
  el.className = 'score-popup';
  el.textContent = '+' + amount.toLocaleString();
  el.dataset.text = '+' + amount.toLocaleString();
  (window.appStage || document.body).appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

window.addEventListener('resize', redimensionarJuego);

// Reposicionar la barra de amigos al hacer zoom/redimensionar (los top se calculan
// en px desde el alto real, así que hay que recalcularlos para que la separación
// no cambie).
window.addEventListener('resize', () => {
  const rp = document.getElementById('right-panel');
  if (!rp || getComputedStyle(rp).display === 'none') return;
  // positionLeaderboard() es la lógica del leaderboard NORMAL multi-fila
  // (lee lbElements['lb-player'], que ni existe durante el espectador de
  // Cities — esa tarjeta la arma citiesSpectatorSetPlayerCard() a mano, en el
  // MISMO #right-panel/#leaderboard compartido). Sin este guard, cualquier
  // resize/zoom mientras se espectaba pisaba la altura de 1 fila que puso
  // citiesSpectatorSetPlayerCard con la altura "ventana de varias filas" del
  // leaderboard normal, dejando la tarjeta pegada arriba en vez de abajo (el
  // panel está anclado por `bottom`, así que una altura de más corre el
  // origen hacia arriba) — el "sale arriba en vez de abajo" reportado.
  if (window._isSpectating) {
    // Mismo motivo que en el render loop de arriba — grupal (N filas) es
    // distinto de 1v1 (2 filas fijas).
    if (typeof window._isGroupSpectating === 'function' && window._isGroupSpectating()) {
      window._refreshGroupSpectatorLeaderboard?.();
    } else if (typeof window.citiesSpectatorReposition === 'function') {
      window.citiesSpectatorReposition();
    }
    return;
  }
  positionLeaderboard(lastLbScore >= 0 ? lastLbScore : 0, false);
  requestAnimationFrame(() => {
    Object.values(lbElements).forEach(el => { el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)'; });
  });
});


// ── PREGAME COUNTDOWN ─────────────────────────────────────────────────────────
const pregameCountdownEl    = document.getElementById('pregame-countdown');
const pregameCountdownImg   = document.getElementById('pregame-countdown-img');
const PREGAME_STEPS = [
  { src: 'images/countdown/3.png', hold: 750,  size: 46 },
  { src: 'images/countdown/2.png', hold: 750,  size: 46 },
  { src: 'images/countdown/1.png', hold: 750,  size: 46 },
  { src: 'images/countdown/go.png', hold: 950, size: 54 },
];

let pregameTimeout = null;
let pregameAborted = false;
// elapsedMs (opcional): cuánto del 3-2-1 ya pasó del lado del jugador REAL —
// lo usa el espectador de cities que se une a mitad de la cuenta (ver
// citiesSpectatorShowPregame) para arrancar en el número que corresponde, en
// vez de siempre desde "3". Mismo patrón que runFlagsPregame/runShapesPregame.
function runPregameCountdown(onDone, elapsedMs) {
  pregameAborted = false;
  pregameCountdownEl.style.display = 'flex';
  // Desbloquear el compositor de Opera al arrancar la cuenta regresiva (ver
  // window.nudgeRepaint). Se repite tras un instante por si el stall ocurre
  // después del primer commit (canvas resize / primer frame del juego).
  if (typeof window.nudgeRepaint === 'function') {
    window.nudgeRepaint();
    setTimeout(window.nudgeRepaint, 120);
  }
  let step = 0;
  let firstStepRemaining = null;
  if (elapsedMs > 0) {
    let acc = 0;
    for (let i = 0; i < PREGAME_STEPS.length; i++) {
      const stepEnd = acc + PREGAME_STEPS[i].hold;
      if (elapsedMs < stepEnd) { step = i; firstStepRemaining = stepEnd - elapsedMs; break; }
      acc = stepEnd;
      step = i + 1;
    }
    if (step >= PREGAME_STEPS.length) { pregameCountdownEl.style.display = 'none'; onDone(); return; }
  }
  sfxCountdown.currentTime = elapsedMs > 0 ? elapsedMs / 1000 : 0;
  sfxCountdown.play().catch(() => {});

  function showStep() {
    if (pregameAborted) return; // se abandonó durante el 3-2-1
    if (step >= PREGAME_STEPS.length) {
      pregameCountdownEl.style.display = 'none';
      onDone();
      return;
    }
    const { src, hold, size } = PREGAME_STEPS[step++];
    const thisHold = firstStepRemaining != null ? firstStepRemaining : hold;
    firstStepRemaining = null;
    pregameCountdownImg.style.animation = 'none';
    pregameCountdownImg.style.width  = size + 'cqmin';
    pregameCountdownImg.style.height = size + 'cqmin';
    pregameCountdownImg.src = src;
    void pregameCountdownImg.offsetWidth;
    pregameCountdownImg.style.animation = '';
    pregameTimeout = setTimeout(showStep, thisHold);
  }

  showStep();
}

// ── START ─────────────────────────────────────────────────────────────────────
function startGame() {
  loadBadges();
  loadGameSFX();
  // Pre-autorizar sfxCountdown en mobile mientras estamos en el contexto del gesto del usuario,
  // antes del canvas resize (que puede tardar y expirar la ventana de gesto).
  if (IS_MOBILE && sfxCountdown) {
    const _pa = sfxPlay(sfxCountdown);
    if (_pa) _pa.catch(() => {});
    sfxCountdown.pause();
    sfxCountdown.currentTime = 0;
  }
  mapGameOver = false;
  clearInterval(timerIntervalId); timerIntervalId = null;
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  canvas.style.pointerEvents = '';
  // Restaurar tamaño del canvas si fue liberado en iOS al final de la ronda anterior.
  if (canvas.width < DISPLAY_W) {
    canvas.width = DISPLAY_W; canvas.height = DISPLAY_H;
  }
  if (badgeOverlay.width < DISPLAY_W) { badgeOverlay.width = DISPLAY_W; badgeOverlay.height = DISPLAY_H; }

  playMusic(null);
  splashScreen.style.display    = 'none';
  gameoverScreen.style.display  = 'none';
  newHighscoreBanner.style.display = 'none';
  gameWrapper.style.display     = 'block';
  scoreDisplayEl.style.display  = 'block';
  speedBonusText.style.display  = '';
  const cwEl = document.getElementById('countdown-widget');
  if (cwEl) cwEl.style.display = 'block';
  const rpEl = document.getElementById('right-panel');
  if (rpEl) { rpEl.style.display = 'flex'; rpEl.style.visibility = ''; }

  redimensionarJuego();

  resetState();
  gradeCounts = { perfect: 0, good: 0, fair: 0 };
  wrongCount = 0;
  correctCount = 0;
  updateGradeCountsUI();
  updateWrongCountUI();
  updateDotsUI();
  scoreValueEl.textContent     = (window.campaignBase ? window.campaignBase() : 0).toLocaleString();
  lastLbScore = -1;
  lastPlayerRank = -1;
  if ((window._vsActive || window._lobbyActive) || (window.practiceConfig && window.practiceConfig.active)) initLeaderboard();
  sortLeaderboard(0);
  resultLabel.className        = '';
  speedBonusText.classList.remove('visible');
  cityTagEl.style.transition   = 'none';
  cityTagEl.style.left         = tpx(-525);
  cityTagEl.style.top          = tpx(-163);
  const tagImg = cityTagEl.querySelector('img');
  tagImg.src = 'images/tag3.png';
  tagImg.style.width  = '';
  tagImg.style.height = '';
  cityTagText.style.display = '';
  cityTagEl.querySelector('img').classList.remove('monument-appear');
  monumentImgEl.classList.remove('monument-appear');
  monumentImgEl.style.display = 'none';
  monumentImgEl.src = '';
  monumentNameEl.textContent = '';
  monumentNameEl.style.opacity = '0';
  if (slideMonumentIn._nameTimer) { clearTimeout(slideMonumentIn._nameTimer); slideMonumentIn._nameTimer = null; }
  gameWrapper.querySelectorAll('.city-tag-ghost').forEach(g => g.remove());

  const tbReset = document.getElementById('time-bonus');
  if (tbReset) {
    if (tbReset._tbT1) clearTimeout(tbReset._tbT1);
    if (tbReset._tbT2) clearTimeout(tbReset._tbT2);
    tbReset.style.display = 'none';
    tbReset.classList.remove('show', 'fade');
  }

  { const _dur = practiceGetDuration(); const _inf = window.practiceConfig && window.practiceConfig.active && _dur === 0; timerNumberEl.textContent = (window.practiceConfig && window.practiceConfig.active) ? (_inf ? '∞' : _dur) : GAME_DURATION; timerNumberEl.classList.toggle('timer-number-infinity', !!_inf); }
  timerNumberEl.style.color = '';
  countdownImg.src = window.pendingGameMode === 'monuments' ? 'images/countdown4.png' : 'images/countdown.png';

  cityTagEl.style.visibility = 'hidden';

  animFrameId = requestAnimationFrame(render);

  countdownImg.style.animationPlayState = 'paused';

  const countdownWidget = document.getElementById('countdown-widget');
  if (document.body.classList.contains('recording-mode') && window.pendingGameMode === 'monuments') {
    if (countdownWidget) countdownWidget.style.visibility = 'hidden';
  } else {
    if (countdownWidget) countdownWidget.style.visibility = '';
  }

  if ((window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._specReportPregame === 'function') {
    const _specDur = (window.practiceConfig && window.practiceConfig.active) ? practiceGetDuration() : GAME_DURATION;
    const _specInf = window.practiceConfig && window.practiceConfig.active && _specDur === 0;
    // mode dinámico (no hardcodeado a 'game') es IMPRESCINDIBLE acá — a
    // diferencia de shapes (donde 'round' llega antes que 'pregame' y ya
    // actualiza _mode del lado espectador) y de flags (que siempre es el
    // primer modo de la campaña, así que el default 'flags' de _mode ya le
    // pega), Cities/Monuments nunca son el primer modo Y su 'pregame' llega
    // ANTES que su 'round' — sin este campo, _mode en spectate.js quedaba
    // pegado en el modo ANTERIOR de la campaña, montando la UI equivocada
    // durante todo el 3-2-1. window.pendingGameMode ya vale 'game' o
    // 'monuments' acá (lo fija el botón de entrada de cada uno) así que
    // sirve directo, sin mapear.
    // campaignBaseAtStart: el jugador real muestra este número desde el
    // arranque del 3-2-1 — el espectador no tiene forma propia de saberlo.
    window._specReportPregame({
      mode: window.pendingGameMode, duration: _specInf ? '∞' : _specDur, infinite: _specInf, startedAt: Date.now(),
      campaignBaseAtStart: window.campaignBase ? window.campaignBase() : 0,
    });
  }
  runPregameCountdown(() => {
    playMusic(sfxGameMusic);
    if (window._practiceStats) window._practiceStats.startTime = Date.now();
    if (!(document.body.classList.contains('recording-mode') && window.pendingGameMode === 'monuments')) {
      startTimer();
    }
    setTimeout(nextCity, 100);
  });
}

btnStart.addEventListener('click', () => { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); startGame(); });

let confirmStep = 0;
let confirmCooldown = false;
function confirmCooldownLock() {
  confirmCooldown = true;
  setTimeout(() => { confirmCooldown = false; }, 600);
}

document.querySelector('.splash-confirm-wrap')?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.querySelector('.splash-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  if (confirmStep === 0) {
    const label = document.querySelector('.splash-text2-label');
    if (window.pendingGameMode === 'flags') {
      if (label) { label.textContent = t('splash.flags.2'); label.classList.add('step2'); }
    } else if (window.pendingGameMode === 'shapes') {
      if (label) { label.textContent = t('splash.shapes.2'); label.classList.add('step2'); }
    } else if (window.pendingGameMode === 'monuments') {
      if (label) { label.textContent = t('splash.monuments.2'); label.classList.add('step2'); }
    } else {
      if (label) { label.textContent = t('splash.cities.2'); label.classList.add('step2'); }
    }
    const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
    if (howtoWrap) howtoWrap.classList.add('slide-down');
    const howtoVideo = document.querySelector('.splash-howtoplay-video');
    if (howtoVideo) howtoVideo.play();
    confirmStep = 1;
    window.waitForHowtoVideo();
    // Avisar a un posible espectador que este primer confirm ya se apretó —
    // sin esto, el mirror de instrucciones del espectador (ver
    // _showSplashMirror en spectate.js) se quedaba siempre pegado en el
    // texto/video del paso 1, aunque el jugador real ya hubiera avanzado al
    // paso 2 (video de ayuda bajando + texto cambiado).
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: window.pendingGameMode, step: 2 });
  } else {
    // Lanzamiento normal (no versus/lobby): asegurar que el leaderboard use amigos,
    // y que la selección de banderas vuelva a Math.random (no la semilla sincronizada).
    window._vsActive = false;
    window._lobbyActive = false;
    // Limpiar restos de un Versus/lobby previo para que no sobreviva una fila de
    // rival en el leaderboard de single-player. (Ver bug barra de amigos.)
    window._vsOpponent = null;
    window._lobbyMembers = null;
    if (typeof initLeaderboard === 'function') { try { initLeaderboard(); } catch (e) {} }
    if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
    window.citiesClearSeed?.();
    if (window.pendingGameMode === 'flags') {
      splashScreen.style.display = 'none';
      if (typeof showFlagsMode !== 'undefined') showFlagsMode();
    } else if (window.pendingGameMode === 'shapes') {
      splashScreen.style.display = 'none';
      if (typeof showShapesMode !== 'undefined') showShapesMode();
    } else if (window.pendingGameMode === 'monuments') {
      splashScreen.style.display = 'none';
      startGame();
    } else {
      startGame();
    }
  }
});
document.querySelector('.gameover-confirm-wrap')?.addEventListener('click', () => {
  if (confirmCooldown) return;
  confirmCooldownLock();
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const wrap = document.querySelector('.gameover-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);

  // ── Encadenamiento de campaña ──
  if (window.campaign && window.campaign.active) {
    const mode = window.pendingGameMode;
    const sc = window.lastModeScore || 0; // puntaje individual de esta ronda
    window.campaign.scores[mode] = sc;
    window.campaign.base = (window.campaign.base || 0) + sc;
    window.campaign.idx++;
    if (window.campaign.idx < window.campaign.btns.length) {
      // Avisar al espectador YA (antes de _fireNext, que puede demorar si el
      // manifest todavía no terminó de precargar) que dejamos el postgame de
      // este modo — sin esto _specReportAdvancing() nunca se llamaba desde
      // NINGÚN lado del código (quedó definida en spectate.js pero muerta),
      // así que el espectador se quedaba viendo el postgame VIEJO congelado
      // hasta que -si acaso- llegaba el 'round'/'pregame' del modo siguiente.
      if (typeof window._specReportAdvancing === 'function') window._specReportAdvancing();
      // Gameover se queda visible e intacto hasta que _fireNext está listo.
      // En ese momento se oculta el gameover y se dispara el siguiente modo
      // en el mismo bloque sincrónico (sin frame intermedio en blanco).
      sfxCheck.volume = 0;
      const _nextBtn = window.campaign.btns[window.campaign.idx];
      const _fireNext = () => {
        // Ocultar gameover + resetear splash + mostrar siguiente — todo de una.
        gameoverScreen.style.display = 'none';
        confirmStep = 0;
        const howtoWrapC = document.querySelector('.splash-howtoplay-wrap');
        if (howtoWrapC) howtoWrapC.classList.remove('slide-down');
        const labelC = document.querySelector('.splash-text2-label');
        if (labelC) { labelC.classList.remove('step2'); labelC.textContent = ''; }
        document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap')
          .forEach(el => el.classList.remove('animate-in'));
        document.getElementById(_nextBtn).click();
        setTimeout(() => { sfxCheck.volume = isMuted ? 0 : 1; }, 150);
      };
      if (window.__loadingReady) {
        _fireNext();
      } else {
        const _pollId = setInterval(() => {
          if (window.__loadingReady) { clearInterval(_pollId); _fireNext(); }
        }, 100);
      }
    } else {
      window.campaign.active = false;
      // Vuelta Mundial completa: recién ahora se confirman en localStorage los
      // highscores por-modo logrados durante esta campaña.
      if (typeof window._commitCampaignHighscores === 'function') window._commitCampaignHighscores();
      if (window.Analytics && typeof window.Analytics.logCampaign === 'function') {
        window.Analytics.logCampaign(window.campaign.base || 0);
      }
      // Requisito para desbloquear GlobeQuiz: haber completado al menos 1 Gira
      // Mundial alguna vez (ver gate en el click de globequiz-btn más abajo).
      if (window._sbUserId && window._sbProfile) {
        window._sbProfile.campaigns_completed = (window._sbProfile.campaigns_completed || 0) + 1;
        window.sbUpdateProfile(window._sbUserId, { campaigns_completed: window._sbProfile.campaigns_completed }).catch(() => {});
      }
      playMusic(null);
      // Ocultar el gameover de monuments antes de mostrar results; si no, queda
      // encima y bloquea el click del confirm para ver el rank.
      gameoverScreen.style.display = 'none';
      // Sin esto, un espectador mirando quedaba con el postgame de Monuments
      // congelado para siempre — _setPlaying(false) es lo único que dispara
      // SoloSpectate.stop(), que a su vez hace que la presencia del jugador
      // "salga" del canal y el espectador reciba el aviso de partida
      // terminada (vuelve solo a la pantalla de carga). El otro camino (no
      // campaña, más abajo) sí lo llama — acá faltaba.
      window._setPlaying(false);
      // Recién acá se completó una Vuelta Mundial entera de verdad (las 4
      // modalidades) — es el único punto donde vale chequear elegibilidad
      // para el popup de Fundador (se consume al volver al menú, ver
      // js/final.js "final-confirm-back-wrap").
      window._pendingFounderPopupCheck = true;
      if (typeof showResultsScreen === 'function') showResultsScreen();
    }
    return;
  }

  gameoverScreen.style.display = 'none';
  window._setPlaying(false);
  // Liberar la RAM del juego recién terminado antes de volver al menú (el video se
  // vuelve a setear más abajo con swapHowtoVideo).
  if (typeof window.releaseGameMemory === 'function') window.releaseGameMemory();
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen').classList.remove('table-shown');
  document.getElementById('loading-table-group')?.classList.add('table-gone');
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof playMusic !== 'undefined') playMusic(window.sfxMenuMusic || sfxMenuMusic);
  document.getElementById('loading-social-group')?.classList.add('table-gone');
  document.getElementById('loading-friend-group')?.classList.add('table-gone');
  document.getElementById('loading-addfriend-group')?.classList.add('table-gone');
  document.getElementById('loading-blocked-group')?.classList.add('table-gone');
  document.getElementById('loading-sent-group')?.classList.add('table-gone');

  const fmt = v => v > 0 ? '🏆 ' + v.toLocaleString() : '';
  const elPlay   = document.getElementById('loading-play-hs');
  const elFlags  = document.getElementById('loading-flags-hs');
  const elShapes = document.getElementById('loading-shapes-hs');
  const elMode4  = document.getElementById('loading-mode4-hs');
  if (elPlay)   elPlay.textContent   = fmt(parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10));
  if (elFlags)  elFlags.textContent  = fmt(parseInt(localStorage.getItem('flagsHighscore')         || '0', 10));
  if (elShapes) elShapes.textContent = fmt(parseInt(localStorage.getItem('shapesHighscore')        || '0', 10));
  if (elMode4)  elMode4.textContent  = fmt(parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10));
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();

  confirmStep = 0;
  const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
  if (howtoWrap) howtoWrap.classList.remove('slide-down');
  const label = document.querySelector('.splash-text2-label');
  if (label) { label.classList.remove('step2'); label.textContent = ''; }
  window.swapHowtoVideo('images/howtoplay/howtoplay3.mp4');
  const animEls = document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
});

// ── LOADING FLIGHT ATTENDANT (flightattpost2) ────────────────────────────────
(function () {
  const TIMELINE_LOADING = [
    [1, 150], [2, 100], [3, 150], [4, 150], [5, 150],
    [6,  50], [7, 150], [8, 200], [7, 200], [8, 200],
    [11,200], [5, 200], [6, 200], [9,  50], [8, 200],
    [11,150], [10,100], [7, 150], [8, 150], [3, 150],
    [2, 150], [1, 1000],
  ];
  const BASE = 'images/characters/flightattpost2/';
  const srcs = Array.from({length: 11}, (_, i) => BASE + (i + 1) + '.png');
  const img  = document.querySelector('#loading-screen .flightatt-loading');
  if (!img) return;
  srcs.forEach((src, i) => { if (i > 0) { const m = new Image(); m.src = src; if (m.decode) m.decode().catch(() => {}); } });
  function showFrame(n) { img.src = srcs[n - 1]; }
  let step = 0;
  function tick() {
    const [frameNum, duration] = TIMELINE_LOADING[step];
    showFrame(frameNum);
    step = (step + 1) % TIMELINE_LOADING.length;
    setTimeout(tick, duration);
  }
  setTimeout(tick, TIMELINE_LOADING[0][1]);
})();

// ── SPLASH FLIGHT ATTENDANT (flightattpost2) ─────────────────────────────────
(function () {
  const TIMELINE2 = [
    [1, 150], [2, 100], [3, 150], [4, 150], [5, 150],
    [6,  50], [7, 150], [8, 200], [7, 200], [8, 200],
    [11,200], [5, 200], [6, 200], [9,  50], [8, 200],
    [11,150], [10,100], [7, 150], [8, 150], [3, 150],
    [2, 150], [1, 1000],
  ];
  const BASE = 'images/characters/flightattpost2/';
  const srcs = Array.from({length: 11}, (_, i) => BASE + (i + 1) + '.png');
  const img  = document.querySelector('#splash-screen .flightatt-splash');
  if (!img) return;
  srcs.forEach((src, i) => { if (i > 0) { const m = new Image(); m.src = src; if (m.decode) m.decode().catch(() => {}); } });
  function showFrame(n) { img.src = srcs[n - 1]; }
  let step = 0;
  function tick() {
    const [frameNum, duration] = TIMELINE2[step];
    showFrame(frameNum);
    step = (step + 1) % TIMELINE2.length;
    setTimeout(tick, duration);
  }
  setTimeout(tick, TIMELINE2[0][1]);
})();

// ── FLIGHT ATTENDANT ANIMATION ───────────────────────────────────────────────
let restartFlightAtt;
(function () {
  const TIMELINE = [
    [1,  150], [2,  100], [3,  150], [4,  100], [5,  100],
    [6,  100], [7,  150], [8,   50], [9,   50], [10,  50],
    [11, 100], [12, 100], [11, 100], [12, 100], [11, 100],
    [12, 100], [13, 100], [14, 100], [15, 100], [6,  100],
    [5,  100], [4,  100], [3,  100], [2,  100],
  ];
  const BASE = 'images/characters/flightattpost/';
  const srcs = Array.from({length: 15}, (_, i) => BASE + (i + 1) + '.png');
  const img  = document.querySelector('.flightatt');
  if (!img) return;
  srcs.forEach((src, i) => { if (i > 0) { const m = new Image(); m.src = src; if (m.decode) m.decode().catch(() => {}); } });
  function showFrame(n) { img.src = srcs[n - 1]; }
  let step = 0;
  let pendingTimeout = null;
  restartFlightAtt = function () {
    if (pendingTimeout) clearTimeout(pendingTimeout);
    step = 0;
    showFrame(1);
    pendingTimeout = setTimeout(tick, TIMELINE[0][1]);
  };
  function tick() {
    const [frameNum, duration] = TIMELINE[step];
    showFrame(frameNum);
    step++;
    if (step >= TIMELINE.length) {
      step = 0;
      showFrame(1);
      pendingTimeout = setTimeout(tick, 2000);
    } else {
      pendingTimeout = setTimeout(tick, duration);
    }
  }

  pendingTimeout = setTimeout(tick, TIMELINE[0][1]);
})();

// ── SPLASH ANIMATE-IN (una sola vez al cargar) ───────────────────────────────
(function () {
  document.querySelectorAll('#splash-screen .flightatt-splash, .splash-text2-wrap').forEach(el => {
    el.classList.add('animate-in');
  });
})();

// ── SPLASH TEXT2 RESPONSIVE ──────────────────────────────────────────────────
// El tamaño del texto de los carteles (text2/text1) se controla en CSS con vw:
// el globo mide 25cqw/21cqw (su width:% sobre #splash-screen, que es full viewport),
// así que la fuente en vw (1.375cqw/1.155cqw = 0.055×ancho) queda SIEMPRE en la
// misma proporción que el globo, sin atascarse con el zoom como el ResizeObserver.

// ── VOLUME TOGGLE ─────────────────────────────────────────────────────────────
let isMuted = localStorage.getItem('muted') === 'true';

// En iOS, currentTime=0 puede resetear el estado muted. Siempre aplicar muted
// justo antes de play() para garantizar que el estado persiste.
function sfxPlay(sfx) {
  sfx.muted = isMuted;
  try { sfx.volume = isMuted ? 0 : 1; } catch(e) {}
  return sfx.play();
}

function getAllSfx() {
  return [sfxCheck, sfxPostgame, sfxPregame, sfxGameMusic, sfxMenuMusic, sfxSelect, sfxPin, sfxCountdown, sfxError, sfxAcertar, sfxVeryNice, sfxTag, sfxBonus, sfxTickdown, sfxTimesUp,
    typeof sfxLevel2  !== 'undefined' ? sfxLevel2        : null,
    window.sfxCheer  || null,
    window.sfxLoop   || null,
  ].filter(Boolean);
}

document.addEventListener('DOMContentLoaded', () => {
  if (isMuted) {
    const img = document.getElementById('vol-img');
    if (img) img.src = 'images/vol2.png';
  }
});

// ── HOVER SOUNDS ──────────────────────────────────────────────────────────────
function playSelect() { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }

[
  document.getElementById('loading-play-btn'),
  document.querySelector('.splash-confirm-wrap'),
  document.querySelector('.gameover-confirm-wrap'),
  document.getElementById('vol-btn'),
].forEach(el => el?.addEventListener('mouseenter', playSelect));

[
  document.querySelector('.splash-confirm-wrap'),
  document.querySelector('.gameover-confirm-wrap'),
].forEach(el => el?.addEventListener('mouseleave', playSelect));

document.getElementById('vol-btn')?.addEventListener('click', () => {
  isMuted = !isMuted;
  localStorage.setItem('muted', isMuted);
  const vol = isMuted ? 0 : 1;
  getAllSfx().forEach(sfx => { sfx.volume = vol; sfx.muted = isMuted; });
  applyMusicMute(); // iOS: la música va por Web Audio (gain); en PC es no-op
  document.getElementById('vol-img').src = isMuted ? 'images/vol2.png' : 'images/vol1.png';
  const _a = new Audio('sfx/check.mp3'); _a.play();
});

// ── FULLSCREEN ────────────────────────────────────────────────────────────────
(function () {
  const btn = document.getElementById('fs-btn');
  if (!btn) return;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true;

  function showIOSToast() {
    let toast = document.getElementById('ios-fs-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ios-fs-toast';
      toast.style.cssText = 'position:fixed;bottom:12%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.82);color:#fff;font-family:sans-serif;font-size:14px;padding:12px 18px;border-radius:12px;z-index:99999;text-align:center;pointer-events:none;transition:opacity 0.4s;white-space:nowrap;';
      toast.innerHTML = 'Toca <b>Compartir</b> → <b>Añadir a inicio</b> para pantalla completa';
      document.body.appendChild(toast);
    }
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
  }

  // Fallbacks con prefijo (Opera, Safari): no todos exponen la API sin prefijo.
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function requestFs(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
    if (fn) { try { const p = fn.call(el); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }
  function exitFs() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) { try { const p = fn.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }

  function updateIcon() {
    btn.textContent = fsElement() ? '✕' : '⛶';
  }
  document.addEventListener('fullscreenchange', updateIcon);
  document.addEventListener('webkitfullscreenchange', updateIcon);

  btn.addEventListener('click', () => {
    if (isIOS) {
      if (!isStandalone) showIOSToast();
      return;
    }
    // Pantalla completa de la página entera (el stage centrado la rellena). En Opera
    // la API suele requerir el prefijo webkit; sin él, el botón no hacía nada.
    if (!fsElement()) {
      requestFs(document.documentElement);
    } else {
      exitFs();
    }
  });
})();

// ── LOCK LOADING SCREEN ZOOM & POSITION ───────────────────────────────────────
// DESACTIVADO: el #app-stage de aspecto fijo ya maneja el escalado/posición. Este
// bloque ponía width/height/transform inline al loading-screen en cada resize del
// visualViewport (= innerWidth), descuadrando todo dentro del stage.
(function () {
  return;
  const el = document.getElementById('loading-screen');
  if (!el || !window.visualViewport) return;
  const vp = window.visualViewport;
  function fix() {
    const s = 1 / vp.scale;
    el.style.left   = vp.offsetLeft + 'px';
    el.style.top    = vp.offsetTop  + 'px';
    el.style.width  = (vp.width  * vp.scale) + 'px';
    el.style.height = (vp.height * vp.scale) + 'px';
    el.style.transform = `scale(${s})`;
  }
  vp.addEventListener('resize', fix);
  vp.addEventListener('scroll', fix);
})();

// ── SCREEN WARNING ────────────────────────────────────────────────────────────
(function () {
  const warning  = document.getElementById('screen-warning');
  const isMobile = navigator.maxTouchPoints > 1;
  const MIN_W = 320, MIN_H = 220, MAX_RATIO = 2.8;

  if (isMobile) {
    document.body.classList.add('is-mobile');
    const icon = document.getElementById('screen-warning-icon');
    const msg  = document.getElementById('screen-warning-msg');
    const sub  = document.getElementById('screen-warning-sub');
    if (icon) icon.textContent = '📱';
    if (msg)  msg.textContent  = 'Rotá el teléfono a horizontal para jugar.';
    if (sub)  sub.textContent  = 'Rotate your phone to landscape to play.';
  }

  function check() {
    const vp = window.visualViewport;
    const w  = vp ? vp.width  : window.innerWidth;
    const h  = vp ? vp.height : window.innerHeight;
    let show = false;
    if (isMobile) {
      show = w < h;
    } else {
      show = w < MIN_W || h < MIN_H || w / h > MAX_RATIO || w / h < 1 / MAX_RATIO;
    }
    warning.classList.toggle('visible', show);
  }

  window.addEventListener('resize', check);
  window.addEventListener('orientationchange', () => setTimeout(check, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', check);
  check();
})();

// ── TEST: open gameover screen from loading ───────────────────────────────────
(function () {
  const wrap = document.querySelector('.test-confirm-wrap');
  if (!wrap) return;
  wrap.addEventListener('click', () => {
    if (confirmCooldown) return;
    confirmCooldownLock();
    const a = new Audio('sfx/check.mp3'); a.volume = isMuted ? 0 : 1; a.muted = isMuted; a.play();
    wrap.classList.add('confirm-pressed');
    setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
    document.getElementById('loading-screen').style.display = 'none';
    if (typeof showResultsScreen === 'function') showResultsScreen();
  });
  wrap.addEventListener('mouseenter', playSelect);
  wrap.addEventListener('mouseleave', playSelect);
})();




// ═══════════════════════════════════════════════════════════════
// PRACTICE TOUR — Panel, config, lógica
// ═══════════════════════════════════════════════════════════════
window.practiceConfig = {
  active: false,
  mode: null,        // 'game'|'flags'|'shapes'|'monuments'
  continents: new Set(['america','europa','africa','asia','oceania']),
  timer: 60,         // segundos; 0 = infinito
  difficulty: 'facil', // solo monumentos
};

let _hidePracticeTimer = null;

// Muestra panel práctica, oculta panel 2
function showPracticePanel() {
  // Cancelar timer pendiente de hidePracticePanel para evitar race condition
  clearTimeout(_hidePracticeTimer);
  _hidePracticeTimer = null;
  document.getElementById('loading-screen')?.classList.add('table-shown');
  const lpg = document.getElementById('loading-practice-group');
  lpg.style.display = '';
  lpg.classList.remove('panel-visible', 'table-gone');
  void lpg.offsetWidth;
  lpg.classList.add('panel-visible');
  // Resetear a sección de modos
  document.getElementById('practice-mode-section').style.display = '';
  document.getElementById('practice-config-section').style.display = 'none';
  document.getElementById('practice-score-popup').style.display = 'none';
}

// Vuelve de práctica al panel 2
function hidePracticePanel() {
  const lpg = document.getElementById('loading-practice-group');
  document.getElementById('loading-screen')?.classList.remove('table-shown');
  lpg.classList.remove('panel-visible');
  lpg.classList.add('table-gone');
  clearTimeout(_hidePracticeTimer);
  _hidePracticeTimer = setTimeout(() => {
    _hidePracticeTimer = null;
    lpg.style.display = 'none';
    lpg.classList.remove('table-gone');
  }, 400);
}

// Muestra popup de score al terminar sesión
function buildPracticeImgRow(rowId, count, imgSrc, startDelay) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.innerHTML = '';
  row.style.gap = '0px';
  if (count === 0) {
    const none = document.createElement('span');
    none.textContent = 'None';
    none.style.cssText = 'font-family:VAGRoundBold,"Arial Black",sans-serif;font-size:1.8cqmin;color:#888;';
    row.appendChild(none);
    return;
  }
  // Squeeze logic: IMG_W en cqmin; MAX_W = espacio disponible dentro del panel fijo (46cqmin − padding − label)
  const IMG_W = 3.5;   // cqmin, coincide con .practice-score-imgs-row img
  const BASE_GAP = 0.2; // cqmin gap normal
  const MAX_W = 28;
  const gap = count > 1 ? (count > 12 ? (MAX_W - count * IMG_W) / (count - 1) : BASE_GAP) : 0;
  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = '';
    img.style.animationDelay = `${startDelay + i * 0.08}s`;
    img.style.zIndex = 16 + i;
    if (i < count - 1) img.style.marginRight = gap + 'cqmin';
    row.appendChild(img);
  }
}

window.showPracticeScore = function(score) {
  // Mostrar panel sin animación de entrada (venimos del game over)
  document.getElementById('loading-screen')?.classList.add('table-shown');
  const lpg = document.getElementById('loading-practice-group');
  lpg.style.display = '';
  lpg.classList.remove('table-gone');
  lpg.classList.add('panel-visible');
  // Restaurar config del modo jugado
  const mode = window.practiceConfig.mode;
  document.getElementById('practice-mode-section').style.display = 'none';
  const cfg = document.getElementById('practice-config-section');
  cfg.style.display = '';
  cfg.classList.toggle('practice-mode-monuments', mode === 'monuments');
  document.getElementById('practice-continents').style.display = mode !== 'monuments' ? '' : 'none';
  document.getElementById('practice-difficulty').style.display = mode === 'monuments' ? '' : 'none';

  const popup = document.getElementById('practice-score-popup');
  document.getElementById('practice-score-val').textContent = score.toLocaleString();
  const stats = window._practiceStats || {};
  const elapsed = stats.startTime ? Math.round((Date.now() - stats.startTime) / 1000) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const timeEl = document.getElementById('practice-score-time');
  if (timeEl) timeEl.textContent = mm + ':' + ss;

  const correct = stats.correct || 0;
  const wrong   = stats.wrong   || 0;
  const checkSrc = mode === 'flags' ? 'images/check1.png'
                 : mode === 'shapes' ? 'images/check2.png'
                 : mode === 'monuments' ? 'images/check4.png'
                 : 'images/check3.png';
  const wrongSrc = mode === 'flags' ? 'images/wrong1.png'
                 : mode === 'shapes' ? 'images/wrong2.png'
                 : mode === 'monuments' ? 'images/wrong4.png'
                 : 'images/wrong3.png';
  buildPracticeImgRow('practice-score-checks-row', correct, checkSrc, 0);
  buildPracticeImgRow('practice-score-wrongs-row', wrong, wrongSrc, correct * 0.08 + 0.1);
  const correctEl = document.getElementById('practice-score-correct');
  if (correctEl) correctEl.textContent = 'x' + correct;
  const wrongEl = document.getElementById('practice-score-wrong');
  if (wrongEl) wrongEl.textContent = 'x' + wrong;

  popup.style.display = 'flex';
};

// Cierra una sesión de práctica (timeout natural o quit manual) y vuelve al panel
// de práctica con el score. Único punto de esta secuencia — antes estaba duplicada
// casi idéntica en monuments.js (x2), flags.js y shapes.js, lo que la hacía propensa
// a que las copias se desincronizaran entre sí (ver bug mezcla panel1/panel2).
window.endPracticeSession = function (score, correct, wrong) {
  window.practiceConfig.active = false;
  document.body.classList.remove('practice-mode');
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; }
  try { if (typeof playMusic !== 'undefined') playMusic(window.sfxMenuMusic || sfxMenuMusic); } catch (e) {}
  if (typeof window.showEntranceElementsStatic === 'function') window.showEntranceElementsStatic();
  if (window._practiceStats) {
    window._practiceStats.correct = correct || 0;
    window._practiceStats.wrong   = wrong   || 0;
  }
  window.showPracticeScore(score);
};

// ── Click en es-practice button
document.getElementById('loading-panel2-versus')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (!window._accountLoggedIn) {
    document.getElementById('social-lock-popup')?.classList.add('open');
    return;
  }
  if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
});

document.getElementById('loading-panel2-practice')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (window._lobbyCountingDown) {
    window.showGlobalToast(t('lobby.cdBlocked'));
    return;
  }
  showPracticePanel();
});

// ── Back desde práctica: si está en config vuelve a modos, si está en modos vuelve al panel 2
document.getElementById('practice-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const configVisible = document.getElementById('practice-config-section')?.style.display !== 'none';
  if (configVisible) { backFromConfig(); } else { hidePracticePanel(); }
});

// ── Botones de modo
const PRACTICE_MODE_LABELS = { flags: 'Suitcase Shuffle', shapes: 'Map Mayhem', game: 'City Blitz', monuments: 'Landmark Loco' };
const PRACTICE_MODE_VIDEOS = { flags: 'images/howtoplay/howtoplay1.mp4', shapes: 'images/howtoplay/howtoplay2.mp4', game: 'images/howtoplay/howtoplay3.mp4', monuments: 'images/howtoplay/howtoplay4.mp4' };
document.querySelectorAll('.practice-mode-item').forEach(btn => {
  btn.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const mode = btn.dataset.mode;
    window.practiceConfig.mode = mode;
    // Ocultar "Elige un modo"
    const chooseLabel = document.querySelector('.practice-choose-label');
    if (chooseLabel) chooseLabel.style.display = 'none';
    // Mostrar config
    document.getElementById('practice-mode-section').style.display = 'none';
    const cfg = document.getElementById('practice-config-section');
    cfg.style.display = '';
    cfg.classList.toggle('practice-mode-monuments', mode === 'monuments');
    // Nombre del modo
    document.getElementById('practice-config-title').textContent = PRACTICE_MODE_LABELS[mode] || mode;
    // Video howtoplay
    const vid = document.getElementById('practice-config-video');
    if (vid) { vid.src = PRACTICE_MODE_VIDEOS[mode]; vid.load(); vid.play().catch(() => {}); }
    // Mostrar continentes o dificultad según el modo
    const showCont = mode !== 'monuments';
    document.getElementById('practice-continents').style.display  = showCont ? '' : 'none';
    document.getElementById('practice-difficulty').style.display  = showCont ? 'none' : '';
  });
});

// ── Continente toggle
document.querySelectorAll('.practice-continent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const activos = document.querySelectorAll('.practice-continent-btn.active');
    if (btn.classList.contains('active') && activos.length <= 1) {
      btn.classList.add('continent-error');
      setTimeout(() => btn.classList.remove('continent-error'), 350);
      return;
    }
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    btn.classList.toggle('active');
  });
});

// ── Timer pills
const TIMER_IDX_TO_SEC = { 1: 30, 2: 60, 3: 120, 4: 180, 5: 0 };

function updateTimerUI(idx) {
  // imagen
  document.querySelectorAll('.practice-time-img').forEach(img => {
    img.classList.toggle('active', parseInt(img.dataset.timeidx, 10) === idx);
  });
  // fill del range (webkit via background gradient)
  const range = document.getElementById('practice-timeline-range');
  if (range) {
    const pct = (idx - 1) / 4 * 100;
    range.style.background = `linear-gradient(to right, #073A79 ${pct}%, rgba(7,58,121,0.25) ${pct}%)`;
  }
}

const practiceRange = document.getElementById('practice-timeline-range');
if (practiceRange) {
  let _lastRangeIdx = 2;
  practiceRange.addEventListener('input', () => {
    const idx = parseInt(practiceRange.value, 10);
    if (idx !== _lastRangeIdx) {
      const s = new Audio('sfx/select.mp3');
      if (localStorage.getItem('muted') !== 'true') s.play().catch(() => {});
      _lastRangeIdx = idx;
    }
    window.practiceConfig.timer = TIMER_IDX_TO_SEC[idx];
    updateTimerUI(idx);
  });

  // En móvil (iOS/Android) el range dentro de un padre con transform:scale pierde
  // la relación entre touch y posición del thumb. getBoundingClientRect devuelve
  // coords visuales correctas, así que calculamos el valor manualmente.
  ['touchstart', 'touchmove'].forEach(evt => {
    practiceRange.addEventListener(evt, e => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect  = practiceRange.getBoundingClientRect();
      const min   = parseInt(practiceRange.min,  10);
      const max   = parseInt(practiceRange.max,  10);
      const step  = parseInt(practiceRange.step, 10) || 1;
      const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      const val   = Math.round((min + ratio * (max - min)) / step) * step;
      if (parseInt(practiceRange.value, 10) !== val) {
        practiceRange.value = val;
        practiceRange.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { passive: false });
  });
}
// init con el default (idx 2 → 60s)
updateTimerUI(2);

// ── Dificultad (monuments) — radio: solo uno activo
document.querySelectorAll('.practice-diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    document.querySelectorAll('.practice-diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function backFromConfig() {
  document.getElementById('practice-config-section').style.display = 'none';
  document.getElementById('practice-mode-section').style.display = '';
  const chooseLabel = document.querySelector('.practice-choose-label');
  if (chooseLabel) chooseLabel.style.display = '';
  const vid = document.getElementById('practice-config-video');
  if (vid) { vid.pause(); vid.src = ''; }
}

// ── OK en popup score
document.getElementById('practice-score-btn')?.addEventListener('click', function() {
  this.classList.add('confirm-pressed');
  setTimeout(() => this.classList.remove('confirm-pressed'), 200);
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('practice-score-popup').style.display = 'none';
});

// ── Start
document.getElementById('practice-start-btn')?.addEventListener('click', function() {
  this.classList.add('confirm-pressed');
  setTimeout(() => this.classList.remove('confirm-pressed'), 200);
  window._autoDismissVsInvites?.();

  const mode = window.practiceConfig.mode;
  if (!mode) return;

  // Validar continentes (solo para modos con filtro)
  const continents = new Set(
    [...document.querySelectorAll('.practice-continent-btn.active')].map(b => b.dataset.continent)
  );
  if (mode !== 'monuments' && continents.size === 0) {
    alert('Selecciona al menos un continente.');
    return;
  }
  const activeD = document.querySelector('.practice-diff-btn.active');

  window.practiceConfig.active      = true;
  window.practiceConfig.continents  = continents;
  // difficulty solo aplica a monuments; los demás modos usan 'dificil' (sin restricción)
  window.practiceConfig.difficulty  = mode === 'monuments' ? (activeD ? activeD.dataset.diff : 'facil') : 'dificil';
  window._practiceStats = { correct: 0, wrong: 0, startTime: null };
  document.body.classList.add('practice-mode');

  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);

  { const lpg = document.getElementById('loading-practice-group'); lpg.classList.remove('panel-visible'); lpg.classList.add('table-gone'); }
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'flex';

  const btnMap = {
    'game':      'loading-play-btn',
    'monuments': 'loading-mode4-btn',
    'flags':     'loading-flags-btn',
    'shapes':    'loading-shapes-btn',
  };
  const btnId = btnMap[mode];
  if (btnId) document.getElementById(btnId)?.click();
});
