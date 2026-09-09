// ============================================================================
// modes/cities-spectate.js — modo espectador de Ciudades (VS 1v1, lobby grupal
// y "esperando al rival" del propio jugador). Reutiliza la pantalla real
// (#game-wrapper/canvas/state/render/advanceDot/leaderboard) y solo repuebla
// los datos del jugador espectado. window.citiesSpectator* + _specBuildCountRow
// (compartido con monuments-spectate.js, que carga después) + estado
// _citiesSpec*. Extraído de monuments.js (fase 12). Carga antes que monuments.js;
// todo lo que toca de monuments.js (state, render, slideTagIn, positionLeaderboard)
// es runtime, por el scope global.
// ============================================================================

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
      // Guard contra el "sigue sonando la música de juego" reportado en VS:
      // si para cuando dispara este timer ya se salió del modo espectador
      // (ej. el jugador que esperaba de prestado ya vio el resultado final,
      // ver _exitWaitAsSpectator en vs.js), no hay que pisar el postgameloop
      // que _showVsResult() ya puso sonando.
      if (!_citiesSpecMode) return;
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
