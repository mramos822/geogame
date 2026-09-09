// ============================================================================
// modes/mapgame-play.js — Motor de juego de Ciudades y Monumentos: pools de práctica, resetState, helpers
// de proyección/geometría, animación del cartel (slideTagIn / slideMonumentIn), dots,
// result label, partículas, nextCity, manejo del click en el mapa, badges de racha,
// render loop, dibujo de pins, timer, endGame, showScorePopup, redimensionado
// responsive, pregame countdown, startGame, y el gameStopper del map-game.
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

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

// ── gameStopper del map-game (teardown de timers/canvas/overlays al cambiar
//    de modo o abandonar) — movido acá al desmantelar monuments.js ──────────
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
