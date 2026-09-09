// ============================================================================
// modes/mapgame-play.js — Cities and Monuments game engine: practice pools,
// resetState, projection/geometry helpers, sign animation (slideTagIn /
// slideMonumentIn), dots, result label, particles, nextCity, map click handling,
// streak badges, render loop, pin drawing, timer, endGame, showScorePopup,
// responsive resize, pregame countdown, startGame, and the map-game gameStopper.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
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
                : null; // dificil = all
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
    // timerDuration/timerStartedAt: the timer's real source of truth (see
    // startTimer) — timeLeft is just the derived value that's displayed.
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
    // render()'s idle-skip assumes the canvas already has a frame drawn to keep
    // as-is — on a just-started round/game (no dots/animations yet) the idle
    // condition holds FROM the first frame, so without this flag the map never
    // got drawn until the first click (which only then produced something
    // "active" that broke the idle-skip).
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
  // Visual hint: after 5s with no answer, the country is revealed. It no longer
  // penalizes the score (see hintMult removed from the calc below) — just a
  // help, not a punishment.
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

// "+Ns" time bonus below the counter on completing 10 dots. Generic for all 4
// modes (cities/monuments, flags, shapes). "+" (0.1s) and "Ns" (0.2s) pop
// 0.5x→1.75x→1x; when both finish, 1s still and then a 0.1s fade out.
function playTimeBonus(el, seconds) {
  if (!el) return;
  const num = el.querySelector('.tb-num');
  if (num) num.textContent = seconds + 's';
  if (el._tbT1) clearTimeout(el._tbT1);
  if (el._tbT2) clearTimeout(el._tbT2);
  el.classList.remove('show', 'fade');
  el.style.display = 'block';
  el.style.opacity = '1';
  void el.offsetWidth;            // restart the animations
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
      // Adjust timerDuration (the real source of truth, see startTimer), not
      // timeLeft directly — otherwise the next tick would overwrite it with the
      // value computed against timerStartedAt, losing the bonus.
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
  // If the game was abandoned (back to menu), don't reactivate anything
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

  // Preload the next monument's image in the background
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
    // GUARD: this timer has a 3.5s delay — quite long. If within that window the
    // SPECTATOR already moved to Cities (_citiesSpecMode), do NOT write the
    // monument name: it would land on the city sign (the reported "still shows
    // the monument name in cities", which the cancels didn't cover because the
    // timer got rescheduled or fired in a gap). Same problem for the REAL
    // PLAYER, not just the spectator: if the last monument of a game (group
    // versus) shows right before the round/game ends, this timer can survive
    // "play again" — if the rematch starts Cities again within those 3.5s, it
    // wrote the OLD monument name onto the new Cities sign as it entered (the
    // reported "tag3.png misplaced with a monument label from the previous
    // game"). startGame() (real) DOES cancel this timer, but only if it already
    // ran by the time this fires — checking the CURRENT mode right here is the
    // real guarantee, without depending on that timing race.
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
  // 'click' fires anyway on release after dragging the map (with zoom) — if the
  // gesture was a real drag, it doesn't count as a guess.
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
  // The click arrives in SCREEN pixels (affected by the map zoom); it's
  // converted to WORLD coordinates right here so everything that follows
  // (distance/grade, stored dot, spectator sync, km calc) keeps working in the
  // usual system, without touching anything below. This is also what makes zoom
  // more precise: the same PERFECT_PX/GOOD_PX/FAIR_PX tolerance in world space
  // covers less screen (and so less mouse error margin) the more zoom.
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
    // ── Cities: M multiplier + "IN A ROW" streak badge ──
    const M = getCitiesM(correctCount); // M uses correctCount (total correct) — read BEFORE incrementing
    base     = CITIES_SCORE_MAP[grade];
    const elapsed = (Date.now() - shownAt) / 1000;
    const _citiesPracticeInf = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    const gotBonus = !_citiesPracticeInf && base > 0 && elapsed < SPEED_BONUS_WIN;
    bonusAmt      = gotBonus ? Math.round(base * (CITIES_SPEED_MULT - 1)) : 0;
    // CONSECUTIVE streak (state.streak) for the "IN A ROW" badge — resets on
    // wayoff, like Monuments. Cities didn't track it before and the badge never
    // showed (the 3/5/10/… milestones were invisible, reported — in versus AND
    // practice). correctCount (total correct, for the M multiplier) keeps its
    // own separate count.
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
    // ── Monuments: same mechanism as Cities (M + binary speed bonus),
    // reverse-engineered from video: perfect/good always give the same score,
    // fair sits at the old system's good/perfect ratio (2/3). See
    // MONUMENTS_M_TABLE.
    const M = getMonumentsM(correctCount); // read BEFORE incrementing, like Cities
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
    // Math.floor (not round): with M=1.5/2.5/7.5 the product lands exactly on .5
    // and the reference video showed the lower value (67, not 68).
    totalGained = Math.floor((base + bonusAmt) * M) + inRowBonus;
  }

  state.score += totalGained;
  if (window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') {
    if (window._vsActive && typeof window._vsReportAnswer === 'function') window._vsReportAnswer(grade !== 'wayoff', Math.round(state.score));
    if (window._lobbyActive && typeof window._lobbyReportAnswer === 'function') window._lobbyReportAnswer(grade !== 'wayoff', Math.round(state.score));
    if (grade === 'wayoff' && (window._vsActive || window._lobbyActive) && typeof window._lbWrongEffect === 'function') window._lbWrongEffect('player');
  }
  // "+score" popup: ONLY what the hit earned (base·bonus·M), WITHOUT the
  // inRowBonus — the streak bonus goes separately, in the "IN A ROW" badge.
  if (window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') {
    const _hitPoints = totalGained - inRowBonus;
    if (_hitPoints > 0) showScorePopup(_hitPoints);
  }
  if (bonusAmt > 0) {
    clearTimeout(speedBonusHideId);
    speedBonusText.classList.remove('visible');
    void speedBonusText.offsetWidth;
    speedBonusText.classList.add('visible');
    speedBonusHideId = setTimeout(() => speedBonusText.classList.remove('visible'), 1600);
  }

  // fontSize is computed ONCE here (not every render-loop frame, where it used
  // to run measureText() in a while per visible dot, 60 times a second for the
  // 4s the label lasts — a lot of needless repeated canvas cost, since the
  // result is always the same for the same name).
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
      // In practice: only mark as seen if it was PERFECT; otherwise it goes back to the pool
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
    // wayoff in practice: don't remove from the pool either
  }

  // Practice cities: mark as completed based on selected regions.
  // >1 region → perfect OR good removes it from the pool; 1 region → perfect only
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
    // clickX/clickY/correct.x/correct.y are canvas coordinates (DISPLAY_W/H),
    // portable 1:1 to the spectator's canvas because it uses the same calibration.
    // totalGained/bonusAmt travel so the spectator can show the "+points" popup
    // and the speed-bonus sign like the real player — without them there was no
    // way to know how much to show.
    // + campaignBase(): the spectator has no way of its own to know how much the
    // player accumulated in earlier campaign modes — without adding it here, it
    // saw the score start from 0 in Cities instead of continuing from
    // Flags/Shapes.
    // streak/inRowBonus: now in Monuments AND Cities (both track a consecutive
    // streak for the "IN A ROW" badge) — sent as a NUMBER, not the resolved
    // image (badgeColor is the real player's <img> element, not serializable);
    // the spectator rebuilds the image by calling getBadgeImg(streak) itself, a
    // pure function of the streak.
    // dots: the +5s "train" (advanceDot) is the SAME function reused on the
    // spectator side, but its LOCAL dots count from when it joined — if it
    // joined mid-game, its train filled/emptied at different moments than the
    // real player's. state.dots (post-increment, ALREADY through advanceDot()
    // above) travels here so the spectator can overwrite its local value with
    // the real one before calling its own advanceDot() (see
    // citiesSpectatorResolvePick/monumentsSpectatorResolvePick).
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
                            // showResultLabel positions a DOM <div> over the canvas
                            // (doesn't draw in ctx), so it needs SCREEN coordinates.
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
// The real render(), renamed — the public version below wraps it in try/catch.
// Reason: if the user switches tabs and comes back, the browser fully PAUSES
// requestAnimationFrame while hidden (the game's setTimeout/setInterval are NOT
// paused, only throttled) — on return, render()'s next frame can get a huge dt
// (all the hidden time in one jump). If that threw at ANY point in this function
// (before reaching its own requestAnimationFrame(render) at the end), the whole
// loop died silently: the map froze visually with state.phase stuck at whatever
// it was — if not 'waiting', the canvas stopped reacting to clicks forever,
// exactly the reported bug ("switch tabs and come back, and the map doesn't
// react to clicks").
function _renderFrame(timestamp) {
  if (!state) return;

  // Defensive clamp: even though it's not needed to avoid the crash above (the
  // catch below covers it), a dt of several minutes in one jump could still run
  // animations/tweens at absurd speeds for ONE frame. 0.25s is plenty for any
  // real frame at 4fps+.
  let dt = state.lastTimestamp ? (timestamp - state.lastTimestamp) / 1000 : 0;
  if (dt > 0.25) dt = 0.25;
  state.lastTimestamp = timestamp;

  // Nothing animating → no need to clear or redraw the full background map
  // (drawImage of the whole image) 60 times a second nonstop; the canvas
  // already retains the last frame as drawn. This used to run ALWAYS, even with
  // the player idle staring at the map — the continuous CPU/GPU cost was the
  // most likely cause of the persistent lag, especially on modest hardware.
  // A NON-permanent dot stays "active" as long as it's in the array, regardless
  // of exact age — the filter that removes it (below) lives INSIDE the block
  // this idle-check skips, so cutting by exact age (age<4) could leave a dot at
  // opacity ~0 but never EXACTLY 0, with the filter never removing it — a
  // "zombie" piling up in the array forever. Permanent ones do cut by age
  // (age<4): once their flag/label settles they don't change, they're static.
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
  // Map zoom: crops a smaller portion of the source image the more zoom
  // (mapCamera.zoom), stretched to the full canvas — so only the background
  // enlarges, without touching the size of anything drawn on top.
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
    // sortLeaderboard() uses positionLeaderboard(), which repositions
    // lbElements['lb-player'] with the NORMAL multi-row leaderboard logic — it
    // doesn't even exist during the Cities spectator (the card is built by hand
    // by citiesSpectatorSetPlayerCard()). Same bug as the resize fix: it
    // overwrote the 1-row height and the card visibly jumped up every time the
    // spectated player's score rose. See citiesSpectatorReposition() above.
    if (window._isSpectating) {
      // Group (N rows, see GroupSpectate/_renderGroupLeaderboard in spectate.js)
      // is a DIFFERENT case from 1v1 (citiesSpectatorReposition, 2 fixed rows) —
      // always calling the 1v1 one, the group card was never repositioned when
      // the spectated score rose, keeping old heights (the reported "the card
      // position breaks").
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

    // dot.x/y are WORLD coordinates (same as latLonToCanvas); drawn at their
    // SCREEN position (follows the map zoom) but at fixed size — the
    // dot/name/flag don't enlarge with the map.
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

      // fontSize is already computed from when the dot was created (see
      // placedDots.push) — this used to run measureText() in a while every frame.
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

// ── PIN DRAWING ──────────────────────────
  function drawPin(pinState, img, tip, xDir) {
    const p = pinState;
    const d    = 220 * (1 - p.progress);
    const sc   = 10 - 9 * p.progress;
    const curW = PIN_W * sc;
    const curH = PIN_H * sc;
    // p.x/p.y are WORLD coordinates — positioned on screen (follows the zoom),
    // but "d" (throw arc height) and the pin size (curW/curH) are animation
    // offsets in fixed screen pixels, unscaled.
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

  // ── Animated line between the player's pin and the correct pin (grows dash by dash) ───
  if (state.pin1Anim && state.pin1Anim.progress >= 1 && state.pin1Anim.grade === 'wayoff') {
    const p1 = state.pin1Anim;
    const p2 = state.pin2Anim;
    if (!p1.fading) p1.lineProgress = Math.min(1, p1.lineProgress + dt / 0.45);
    const lp = p1.lineProgress;
    // p1.x/y, p2.x/y and p1.targetX/Y are WORLD coordinates — the line and its
    // label draw on screen (follow the zoom) with fixed thickness/font.
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
      // white outline
      ctx.beginPath();
      ctx.moveTo(p1Screen.x, p1Screen.y);
      ctx.lineTo(toX, toY);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 4;
      ctx.setLineDash([DASH, GAP]);
      ctx.lineDashOffset = offset;
      ctx.stroke();
      // black line on top
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
        // Keep the text always readable (never upside down)
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

  // Clear the badge overlay only if something's drawn (or was last frame, to
  // erase it), instead of a full clearRect every frame.
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

      // Scale proportional to DISPLAY_W (clamp to 1): same on desktop, and on
      // small screens (iOS) the check/IN A ROW stop coming out huge.
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

// Public wrapper — see the long comment above _renderFrame(). If anything
// inside throws (huge dt on return from a hidden tab, asset not ready yet,
// whatever), the catch reschedules the next frame anyway: the animation loop
// NEVER fully dies, so state.phase always has the chance to return to 'waiting'
// and the canvas never goes permanently deaf to clicks.
function render(timestamp) {
  try {
    _renderFrame(timestamp);
  } catch (e) {
    if (state) state.lastTimestamp = null;
    animFrameId = requestAnimationFrame(render);
  }
}

// Prevent the huge dt jump at the source (not just mitigate it in the catch
// above) — on return from a hidden tab, requestAnimationFrame was paused all
// that time; the next real frame will have a timestamp far ahead of the last
// saved one. Without this, THAT first frame back computed a dt of several
// seconds/minutes in one jump.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state) return;
  state.lastTimestamp = null;
  // Recompute the timer NOW (don't wait for the next interval tick, which can
  // take up to 1s more) — so the number self-corrects the instant you return,
  // instead of showing the old value for a moment.
  if (timerIntervalId) _timerTick();
});

// ── TIMER ─────────────────────────────────────────────────────────────────────
// timeLeft is computed against timerStartedAt (Date.now()), not by subtracting
// 1 per tick — if the browser throttles a background tab's setInterval (can drop
// to 1 tick every several seconds, or less), a counter that subtracts 1 per tick
// loses real ticks and falls behind real time; here, as soon as the interval
// ticks again (or the tab returns to the foreground), it self-corrects in one
// step to the real value instead of dragging the lag (reported: in group rooms,
// a player with a minimized tab got their own TIMES UP late vs. the rest).
function _timerTick() {
  if (!state) return;
  // Phase guard (not just "!state"): quitToMenu() replaces state with a fresh
  // 'idle' one (resetState), doesn't null it — so this check did NOT stop a
  // stray tick from the previous round if timerIntervalId somehow wasn't
  // cleared in time (e.g. a long-minimized tab, where the browser can be slow
  // to apply the real clearInterval). Without this, that ghost tick could reach
  // state.timeLeft<=0 and call endGame(), showing the giant TIMES UP over the
  // menu (reported: "I minimize for a while and come back to a giant times up").
  // With the guard, any tick firing while in 'idle' self-removes instead of acting.
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

      // ── VERSUS: redirect to the W/L result ───────────────
      if (window._vsActive && (window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._vsHandleGameEnd === 'function') {
        window._vsHandleGameEnd(state.score);
        return;
      }
      // ── LOBBY: report mode end to the group system ───────
      if (window._lobbyActive && (window.pendingGameMode === 'game' || window.pendingGameMode === 'monuments') && typeof window._lobbyHandleGameEnd === 'function') {
        window._lobbyHandleGameEnd(state.score);
        return;
      }
      // ── PRACTICE: redirect to the practice panel ─────────
      if (window.practiceConfig && window.practiceConfig.active) {
        window.endPracticeSession(state.score, correctCount, wrongCount);
        return;
      }
      // ─────────────────────────────────────────────────────
      // Log the single-player game for stats (cities/monuments).
      if (window.Analytics) {
        window.Analytics.logGame(window.pendingGameMode === 'monuments' ? 'monuments' : 'cities', state.score);
      }
      window.lastModeScore = state.score;
      finalScoreEl.textContent = (state.score + (window.campaignBase ? window.campaignBase() : 0)).toLocaleString();
      // During an in-progress campaign the highscore isn't persisted yet: the
      // banner shows as a preview, but the real save (localStorage + in-memory
      // var) is deferred to window._commitCampaignHighscores(), called only
      // when the whole Gira Mundial finishes.
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
      // Reveal confirm only once the next mode's assets are cached.
      if (window.campaign && window.campaign.active && window.pendingGameMode === 'game' && typeof window.preloadNextModeAssets === 'function') {
        window.preloadNextModeAssets('monuments').then(window.showGameoverConfirm);
      } else {
        // Free mode or last mode (monuments): no preload, confirm after a brief delay.
        setTimeout(window.showGameoverConfirm, 800);
      }
    }, 1000);
  }, 400 + 1200);
}

// ── RESPONSIVE SCALING ──────────────────────────────────────────────────────
function redimensionarJuego() {
  if (!gameWrapper || gameWrapper.style.display === 'none') return;

  const winW = window.STAGE_W;
  const winH = window.STAGE_H;

  // Proportional margins (no fixed px or breakpoint jumps) so the scale is 100%
  // proportional to the viewport and doesn't "zoom" too much on zoom.
  const marginH = winW * 0.35;
  const marginV = winH * 0.08;

  const scaleW = (winW - marginH) / DISPLAY_W;
  const scaleH = (winH - marginV) / DISPLAY_H;

  let finalScale = Math.min(scaleW, scaleH);
  finalScale = finalScale * 0.92;

  gameWrapper.style.transform = `translate(-50%, -50%) scale(${finalScale})`;
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

// Reposition the friends bar on zoom/resize (the tops are computed in px from
// the real height, so they must be recomputed so the spacing doesn't change).
window.addEventListener('resize', () => {
  const rp = document.getElementById('right-panel');
  if (!rp || getComputedStyle(rp).display === 'none') return;
  // positionLeaderboard() is the NORMAL multi-row leaderboard logic (reads
  // lbElements['lb-player'], which doesn't exist during the Cities spectator —
  // that card is built by hand by citiesSpectatorSetPlayerCard(), in the SAME
  // shared #right-panel/#leaderboard). Without this guard, any resize/zoom while
  // spectating overwrote the 1-row height set by citiesSpectatorSetPlayerCard
  // with the normal leaderboard's "multi-row window" height, leaving the card
  // pinned to the top instead of the bottom (the panel is anchored by `bottom`,
  // so extra height shifts the origin up) — the reported "shows up top instead
  // of bottom".
  if (window._isSpectating) {
    // Same reason as in the render loop above — group (N rows) is different
    // from 1v1 (2 fixed rows).
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
// elapsedMs (optional): how much of the 3-2-1 already passed on the REAL
// player's side — used by the cities spectator that joins mid-count (see
// citiesSpectatorShowPregame) to start at the right number instead of always
// from "3". Same pattern as runFlagsPregame/runShapesPregame.
function runPregameCountdown(onDone, elapsedMs) {
  pregameAborted = false;
  pregameCountdownEl.style.display = 'flex';
  // Unblock the Opera compositor when the countdown starts (see
  // window.nudgeRepaint). Repeated a moment later in case the stall happens
  // after the first commit (canvas resize / first game frame).
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
    if (pregameAborted) return; // abandoned during the 3-2-1
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
  // Pre-authorize sfxCountdown on mobile while still in the user-gesture
  // context, before the canvas resize (which can take long and expire the
  // gesture window).
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
  // Restore the canvas size if it was freed on iOS at the end of the previous round.
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
    // A dynamic mode (not hardcoded to 'game') is ESSENTIAL here — unlike shapes
    // (where 'round' arrives before 'pregame' and already updates the
    // spectator's _mode) and flags (always the campaign's first mode, so _mode's
    // 'flags' default is already right), Cities/Monuments are never the first
    // mode AND their 'pregame' arrives BEFORE their 'round' — without this
    // field, _mode in spectate.js stayed stuck on the PREVIOUS campaign mode,
    // mounting the wrong UI through the whole 3-2-1. window.pendingGameMode is
    // already 'game' or 'monuments' here (set by each mode's entry button) so it
    // works directly, no mapping.
    // campaignBaseAtStart: the real player shows this number from the start of
    // the 3-2-1 — the spectator has no way of its own to know it.
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

// ── map-game gameStopper (teardown of timers/canvas/overlays on mode switch
//    or abandon) ──────────────────────────────────────────────────────────
// Each mode registers here how to stop its loops (timers/animations)
window.gameStoppers = window.gameStoppers || [];
window.gameStoppers.push(() => {
  try { pregameAborted = true; clearTimeout(pregameTimeout); pregameTimeout = null; } catch (e) {}
  try { gameAborted = true; clearTimeout(endGameTimeout1); clearTimeout(endGameTimeout2); } catch (e) {}
  try { clearInterval(timerIntervalId); timerIntervalId = null; } catch (e) {}
  try { if (animFrameId) cancelAnimationFrame(animFrameId); animFrameId = null; } catch (e) {}
  if (window._powerQuitOverlay) {
    // Block the canvas during the practice game-over overlay
    try { mapGameOver = true; } catch (e) {}
    try { if (state) state.phase = 'idle'; } catch (e) {}
    try { if (canvas) canvas.style.pointerEvents = 'none'; } catch (e) {}
    // Stop the countdown blink
    try { if (countdownImg) countdownImg.style.animationPlayState = 'paused'; } catch (e) {}
  } else {
    // Without this else, a legit endGame() (timeLeft really reached 0,
    // recomputed on return from a background tab, see visibilitychange below)
    // leaves canvas.style.pointerEvents='none' set — startGame() only restores
    // it when a new round starts, so if something was left mid-way (TIMES UP
    // sequence interrupted by the quit itself) the canvas went deaf to clicks
    // forever with no visual cue (reported: "I come back from another tab and
    // can't click anything, everything looks normal"). mapGameOver was also
    // only reset in startGame().
    try { mapGameOver = false; } catch (e) {}
    try { if (canvas) canvas.style.pointerEvents = ''; } catch (e) {}
  }
  try { if (typeof pregameCountdownEl !== 'undefined' && pregameCountdownEl) pregameCountdownEl.style.display = 'none'; } catch (e) {}
  try { if (typeof timeupOverlay !== 'undefined' && timeupOverlay) { timeupOverlay.style.display = 'none'; timeupOverlay.classList.remove('timeup-in','timeup-out'); } } catch (e) {}
  // Hide the Cities/Monuments game container (#game-wrapper: canvas, map, city
  // sign, monument name, etc.) — the gameStopper only stopped timers, didn't
  // hide the assets; chaining to ANOTHER mode (e.g. cities→shapes) left those
  // assets stuck in the background (reported). Not touched if _vsShowingResult
  // (assets deliberately visible under the results table, as the *HardReset
  // ones respect) or _powerQuitOverlay (the map must stay in the background
  // during the practice game-over on power-quit; only hidden in quitToMenu() on
  // return to the menu).
  try {
    if (!window._vsShowingResult && !window._powerQuitOverlay) {
      const gw = document.getElementById('game-wrapper');
      if (gw) gw.style.display = 'none';
    }
  } catch (e) {}
});
