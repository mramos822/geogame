// ============================================================================
// modes/monuments-spectate.js — Modo espectador de Monumentos (VS 1v1, lobby grupal, 'esperando al rival').
// Mismo patrón que cities-spectate.js, cambia la revelación de ronda
// (slideMonumentIn) y los assets. Incluye también citiesSpectatorTimesUpEffect.
// Carga DESPUÉS de cities-spectate.js (usa _specBuildCountRow).
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

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
      // Mismo guard que citiesSpectatorShowRound — ver comentario ahí.
      if (!_monumentsSpecMode) return;
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
