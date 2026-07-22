// ── MODO BANDERAS ─────────────────────────────────────────────────────────────
document.addEventListener('contextmenu', e => {
  if (e.target.closest('#flags-luggage-wrap')) e.preventDefault();
});

['flags-luggage-group', 'flags-luggage-left-group', 'flags-luggage-right-group',
 'flags-luggage-bl-group', 'flags-luggage-bc-group', 'flags-luggage-br-group'].forEach(id => {
  document.getElementById(id)?.addEventListener('mouseenter', () => {
    if (!flagsRunning) return;
    if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
  });
});

const FLAGS_GAME_DURATION = window.GAME_DURATION;

const flagsWrapper       = document.getElementById('flags-wrapper');
const flagsScoreDisplay  = document.getElementById('flags-score-display');
const flagsRightPanel    = document.getElementById('flags-right-panel');
const mainRightPanel     = document.getElementById('right-panel');
const flagsMachine       = document.getElementById('flags-machine');
const flagsMachine2      = document.getElementById('flags-machine2');
const flagsMachine3      = document.getElementById('flags-machine3');
const flagsMachine3b     = document.getElementById('flags-machine3b');
const flagsFindLuggage   = document.getElementById('flags-findluggage');
flagsFindLuggage.addEventListener('dragstart', e => e.preventDefault());
const flagsLuggageWrap   = document.getElementById('flags-luggage-wrap');
flagsLuggageWrap.addEventListener('dragstart', e => e.preventDefault());

// El maletín y sus banderas usan un sistema de coordenadas en px (offsets de los
// grupos, clip-path: path(...) y matrix3d) que NO se puede expresar en vmin. Para
// que escale con el viewport como el resto, se escala el wrap completo como unidad.
// Factor = min(vw,vh)/911 → 1.0 en el viewport de referencia (9.11px por vmin).
function flagsLuggageScale() {
  return Math.min(window.STAGE_W, window.STAGE_H) / 911;
}
function scaleFlagsLuggage() {
  flagsLuggageWrap.style.transform = `translate(-50%, -50%) scale(${flagsLuggageScale()})`;
}
window.addEventListener('resize', scaleFlagsLuggage);
scaleFlagsLuggage();
const flagsFlagImg       = document.getElementById('flags-flag-img');
const flagsFlagidWrap    = document.getElementById('flags-flagid-wrap');
const flagsFlagidLabel   = document.getElementById('flags-flagid-label');
const flagsPregameEl     = document.getElementById('flags-pregame-countdown');
const flagsPregameImg    = document.getElementById('flags-pregame-countdown-img');
const flagsTimeupEl      = document.getElementById('flags-timeup-overlay');
const flagsTimerEl       = document.getElementById('flags-timer-number');
const flagsTimerImg      = document.querySelector('#flags-countdown-widget > img');
const flagsScoreEl       = document.getElementById('flags-score-value');
const flagsResultLabel   = document.getElementById('flags-result-label');

let flagsTimerIntervalId = null;
let flagsTimeLeft        = FLAGS_GAME_DURATION;
// Fuente de verdad real del cronómetro (ver startFlagsTimer) — flagsTimeLeft
// es solo el valor derivado que se muestra.
let flagsTimerDuration   = FLAGS_GAME_DURATION;
let flagsTimerStartedAt  = 0;
let flagsScore           = 0;
let flagsDisplayedScore  = 0;
let flagsScoreRafId      = null;
let flagsRunning         = false;
let flagsWrongCount      = 0;

const FLAGS_PREGAME_STEPS = [
  { src: 'images/countdown/3.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/2.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/1.png',  hold: 800,  size: 46 },
  { src: 'images/countdown/go.png', hold: 950,  size: 54 },
];

// ── SHOW / HIDE ───────────────────────────────────────────────────────────────
// Pre-decodifica todas las banderas en background al entrar al modo.
// No bloquea el main thread. concurrency más alto (16 en vez de 4) para el
// espectador: a diferencia del jugador real (que llega acá después de rato
// en el loading screen, con el manifest ya precargado de sobra), puede
// entrar en cualquier momento — más streams en paralelo acorta la ventana en
// la que las banderas de la ronda actual todavía no terminaron de bajar.
function prewarmFlagTextures(concurrency) {
  const urls = Object.values(COUNTRY_FLAGS);
  let i = 0;
  function next() {
    if (i >= urls.length) return;
    const img = new Image();
    img.src = urls[i++];
    (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(next);
  }
  for (let k = 0; k < (concurrency || 4); k++) next();
}

function showFlagsMode() {
  prewarmFlagTextures();
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  if (typeof playMusic !== 'undefined') playMusic(null);
  const gameCanvas = document.getElementById('game-canvas');

  flagsWrapper.style.position  = '';
  flagsWrapper.style.left      = '';
  flagsWrapper.style.top       = '';
  flagsWrapper.style.margin    = '';
  flagsWrapper.style.width     = gameCanvas.width  + 'px';
  flagsWrapper.style.height    = gameCanvas.height + 'px';
  flagsWrapper.style.display   = 'block';

  // Aplicar el mismo scale que redimensionarJuego calcula
  const anchoVentana = window.STAGE_W;
  const altoVentana  = window.STAGE_H;
  const margenHorizontal = anchoVentana * 0.35;
  const escalaW = (anchoVentana - margenHorizontal) / gameCanvas.width;
  const escalaH = (altoVentana - altoVentana * 0.08) / gameCanvas.height;
  const escala  = Math.min(escalaW, escalaH) * 0.92;
  flagsWrapper.style.transform       = `translate(-50%, -50%) scale(${escala})`;
  flagsWrapper.style.transformOrigin = 'center center';
  flagsScoreDisplay.style.display = 'block';
  flagsSpeedBonusText.style.display = '';
  document.getElementById('flags-countdown-widget').style.display = 'block';
  flagsRightPanel.style.display   = 'flex';
  mainRightPanel.style.display    = 'none';
  flagsMachine.style.display      = 'block';
  flagsMachine2.style.display     = 'block';
  flagsMachine3.style.display     = 'block';
  flagsMachine3b.style.display    = 'block';
  flagsFindLuggage.style.display  = 'none';
  flagsLuggageWrap.style.display  = 'none';
  flagsFlagidWrap.style.display   = 'none';

  { const _pc = window.practiceConfig; const _inf = _pc && _pc.active && _pc.timer === 0; flagsTimerEl.textContent = _pc && _pc.active ? (_inf ? '∞' : _pc.timer) : FLAGS_GAME_DURATION; flagsTimerEl.classList.toggle('timer-number-infinity', !!_inf); }
  flagsTimerEl.style.color = '';
  flagsTimerImg.src = 'images/countdown2.png';
  flagsTimerImg.style.animationPlayState = 'paused';

  if (typeof loadBadges !== 'undefined') loadBadges();

  // Resetear el puntaje ANTES de la cuenta regresiva para que el widget no
  // muestre el puntaje de la partida anterior durante el conteo.
  flagsScore          = 0;
  flagsDisplayedScore = 0;
  flagsScoreEl.textContent = (((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
  flagsLastLbScore = -1;

  initFlagsLeaderboard();

  if (typeof window._specReportPregame === 'function') {
    // startedAt: para que un espectador que se une a mitad del 3-2-1 pueda
    // calcular cuánto ya pasó y arrancar en el número correcto.
    // mode:'flags' — hasta ahora "zafaba" sin este campo porque _mode en
    // spectate.js arranca en 'flags' por default (siempre es el primer modo
    // de la campaña), pero eso era casualidad de orden, no una garantía real
    // — ver el mismo campo agregado en monuments.js (Cities), donde SÍ hacía
    // falta de verdad.
    // campaignBaseAtStart: el jugador real muestra este número desde el
    // arranque del 3-2-1 (antes de cualquier respuesta) — el espectador no
    // tiene forma propia de saberlo, así que viaja acá para poder arrancar
    // el marcador en el valor correcto en vez de 0.
    window._specReportPregame({
      mode: 'flags',
      duration: flagsTimerEl.textContent,
      infinite: flagsTimerEl.classList.contains('timer-number-infinity'),
      startedAt: Date.now(),
      campaignBaseAtStart: (typeof window.campaignBase === 'function') ? window.campaignBase() : 0,
    });
  }
  runFlagsPregame(() => {
    flagsFindLuggage.style.display  = 'block';
    flagsFindLuggage.classList.remove('scrolling');
    void flagsFindLuggage.offsetWidth;
    flagsFindLuggage.classList.add('scrolling');
    flagsLuggageWrap.style.display  = 'block';
    flagsLuggageWrap.style.pointerEvents = '';
    flagsLuggageWrap.classList.remove('flags-game-ended');
    flagsFlagidWrap.style.display   = 'block';
    flagsFlagidLabel.textContent = '';
    flagsTimerImg.style.animationPlayState = 'running';
    if (typeof playMusic !== 'undefined') playMusic(sfxGameMusic);
    if (window._practiceStats) window._practiceStats.startTime = Date.now();
    flagsMachine3.classList.add('scrolling');
    flagsMachine3b.classList.add('scrolling');
    flagsStreak = 0;
    flagsDots = 0;
    flagsUpdateDotsUI();
    flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
    flagsEasyUnlocked = false;
    flagsSixUnlocked = false;
    flagsMediumUnlocked = false;
    flagsHardUnlocked   = false;
    flagsInsaneUnlocked = false;
    flagsCorrectCount = 0;
    flagsIsFirstRound = true;
    flagsAnswered = new Set();
    flagsLastChosen = null;
    if (_flagsSyncedVersus()) flagsVsIndex = 0;
    if (window.practiceConfig && window.practiceConfig.active) {
      // Reiniciar desbloqueos para que la primera ronda siempre empiece en inicio
      flagsEasyUnlocked = false; flagsMediumUnlocked = false;
      flagsHardUnlocked = false; flagsInsaneUnlocked = false;
      flagsCorrectCount = 0;
      flagsPracticePool = buildFlagsPracticePool(window.practiceConfig.continents, window.practiceConfig.difficulty);
      flagsPracticeRemaining = [...flagsPracticePool];
      flagsPracticeCurrent = flagsPracticePickNext(null);
    }
    flagsGroupIds = flagsTopGroupIds.slice();
    flagsLuggageWrap.classList.remove('flags-six-mode');
    // Reset all group inline styles that may be stuck from a previous game's
    // mid-round cleanup being skipped by the !flagsRunning guard.
    clearFlagsElimination();
    ;[...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
      const g = document.getElementById(id);
      if (!g) return;
      g.style.animation  = '';
      g.style.transition = '';
      g.style.transform  = '';
      g.style.transformOrigin = '';
      g.style.opacity    = '';
      g.style.willChange = '';
      g.classList.remove('flags-faded');
    });
    flagsBottomGroupIds.forEach(id => {
      const g = document.getElementById(id);
      if (g) g.style.display = 'none';
    });
    ['flags-check-overlay','flags-wrong-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('animate'); el.style.display = ''; el.style.opacity = ''; }
    });
    startFlagsRound();
    startFlagsTimer();
  });
}

// ── MODO ESPECTADOR: la MISMA pantalla que ve el jugador ──────────────────────
// En vez de un panelcito aparte, mostramos el #flags-wrapper real (máquina,
// maletines, banderas) y lo manejamos a mano con los datos que llegan por
// broadcast — nunca corre flagsRunning/flagsScore/el timer real, así que no
// puede pisar el estado de una partida real si esta misma pestaña juega después.
let _flagsSpecMode = false;
// Igual mecanismo que shapes.js: la primera ronda tras entrar espera un margen
// corto para confirmar si de verdad viene un pregame (llega poco después,
// mismo orden real de broadcasts) — solo se usa para decidir CUÁNDO arrancar
// sfxGameMusic (si hay pregame, lo arranca su propio onDone al terminar el
// 3-2-1; si no, se confirma que es unión a mitad de ronda y arranca acá).
let _flagsSpecIsFirstRound = true;
let _flagsSpecPregameSeen  = false;
// Gate contra el race de "3-2-1 local termina antes de que llegue el 'round'
// real por la red" (y viceversa): revelar maletines/findluggage/flagid (ver
// _flagsSpecRevealAfterPregame) solo puede pasar una vez que ambas cosas
// pasaron — el countdown local terminó Y ya tenemos datos reales de la
// ronda. _flagsSpecShowRound() sigue poblando el DOM (oculto) apenas llega
// el broadcast sin importar el orden; el reveal lo dispara lo que llegue
// SEGUNDO de las dos condiciones. Ambos arrancan en true (unión a mitad de
// ronda, sin pregame de por medio, ya revelado por flagsSpectatorEnter) —
// flagsSpectatorShowPregame los resetea a false al arrancar el 3-2-1.
let _flagsSpecCountdownDone = true;
let _flagsSpecRevealed      = true;
// true una vez que flagsSpectatorShowRound() populó el DOM (oculto o no) con
// los datos del 'round' actual — se resetea a false al arrancar cada 3-2-1.
let _flagsSpecShowRoundApplied = true;
let _flagsSpecEliminationTimeouts = [];
function _flagsSpecClearElimination() {
  _flagsSpecEliminationTimeouts.forEach(clearTimeout);
  _flagsSpecEliminationTimeouts = [];
}

// Animación de subida del marcador — mismo mecanismo que flagsAnimateScore()
// (arriba, jugador real): interpola _flagsSpecDisplayedScore hacia
// _flagsSpecTargetScore en vez de saltar de golpe. _flagsSpecTargetScore YA
// viene con campaignBase() sumado desde el broadcaster (ver
// _specReportAnswer/_specReportPregame en el jugador real) — acá no hace
// falta sumarlo de nuevo.
let _flagsSpecTargetScore    = 0;
let _flagsSpecDisplayedScore = 0;
let _flagsSpecScoreRafId     = null;
function _flagsSpecAnimateScore() {
  if (_flagsSpecScoreRafId) return;
  let last = null;
  function tick(ts) {
    if (!_flagsSpecMode) { _flagsSpecScoreRafId = null; return; }
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    const diff = _flagsSpecTargetScore - _flagsSpecDisplayedScore;
    if (diff <= 0) { _flagsSpecScoreRafId = null; flagsScoreEl.textContent = _flagsSpecTargetScore.toLocaleString(); return; }
    _flagsSpecDisplayedScore = Math.min(_flagsSpecTargetScore, _flagsSpecDisplayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    flagsScoreEl.textContent = _flagsSpecDisplayedScore.toLocaleString();
    _flagsSpecScoreRafId = requestAnimationFrame(tick);
  }
  _flagsSpecScoreRafId = requestAnimationFrame(tick);
}

window.flagsSpectatorEnter = function () {
  _flagsSpecMode = true;
  window._isSpectating = true;
  _flagsSpecIsFirstRound = true;
  _flagsSpecPregameSeen  = false;
  _flagsSpecCountdownDone = true;
  _flagsSpecRevealed = true;
  _flagsSpecShowRoundApplied = true;
  // getModeCheckImg()/getModeWrongImg() (usadas en la pantalla de resultados)
  // deciden la imagen según window.pendingGameMode — sin esto quedaba con lo
  // último que jugó ESTA pestaña (o sin definir), y el postgame del espectador
  // mostraba check3/wrong3 (el default) en vez de check1/wrong1 de banderas.
  window.pendingGameMode = 'flags';
  // #loading-screen tiene z-index 200 (con fondo opaco) y #flags-wrapper tiene
  // z-index 15 — si no se oculta el loading-screen (con el panel de amigos/menú
  // que esté abierto en ese momento) queda tapando todo el juego por completo.
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'none';
  // sfxError/sfxAcertar/etc. se inicializan recién/perezosamente acá (son
  // `let` sin asignar hasta la primera partida real) — sin esto quedaban
  // undefined y el chequeo typeof en flagsSpectatorResolvePick bloqueaba
  // TODO el sonido en silencio, incluso el check que sí existe siempre.
  if (typeof loadGameSFX === 'function') loadGameSFX();
  // imgBadgeGold/etc. son Image() sin .src hasta acá (carga diferida) — sin
  // esto getBadgeImg(streak) devuelve una imagen en blanco y drawImage no
  // dibuja nada, sin tirar ningún error.
  if (typeof loadBadges === 'function') loadBadges();
  if (typeof prewarmFlagTextures === 'function') prewarmFlagTextures(16);
  flagsWrapper.style.display     = 'block';
  flagsMachine.style.display     = 'block';
  flagsMachine2.style.display    = 'block';
  flagsMachine3.style.display    = 'block';
  flagsMachine3b.style.display   = 'block';
  flagsLuggageWrap.style.display = 'block';
  flagsLuggageWrap.classList.remove('flags-game-ended', 'flags-six-mode');
  // Espectador es solo-lectura: reusa la misma clase que usa el juego real al
  // terminar la partida para apagar hover/cursor de los maletines (no hay
  // click que hacer, no debe parecer clickeable).
  flagsLuggageWrap.classList.add('flags-game-ended');
  // mainRightPanel es el panel de Cities/Monuments, no de banderas — siempre va
  // oculto acá. flagsRightPanel SÍ se muestra, pero con una sola tarjeta armada
  // a mano (flagsSpectatorSetPlayerCard) con los datos del jugador REAL — el
  // leaderboard normal (initFlagsLeaderboard) siempre agrega una tarjeta "vos"
  // con tu propio perfil, que acá sería incorrecta.
  mainRightPanel.style.display  = 'none';
  flagsRightPanel.style.display = 'flex';
  const specLb = document.getElementById('flags-leaderboard');
  if (specLb) specLb.innerHTML = '';
  flagsScoreDisplay.style.display = 'block';
  // Placeholder hasta que llegue el primer dato real (pregame con
  // campaignBaseAtStart, o un answer si es unión a mitad de ronda) —
  // flagsSpectatorShowPregame/flagsSpectatorResolvePick lo corrigen.
  _flagsSpecTargetScore = 0;
  _flagsSpecDisplayedScore = 0;
  flagsScoreEl.textContent = '0';
  // Restos de siluetas si esta pestaña jugó/espectó eso antes en esta misma
  // sesión sin pasar por shapesSpectatorExit — mismo caso que el findluggage
  // de banderas colándose en siluetas, ahora al revés.
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  document.querySelectorAll('.shapes-clip-overlay').forEach(el => el.remove());
  document.querySelectorAll('.shapes-stage-el').forEach(el => { try { el.remove(); } catch (e) {} });
  document.getElementById('shapes-countdown-widget')?.remove();
  // Por si esta pestaña ya jugó una partida real antes: hideIngameHud() deja
  // este cartel con display:none pegado (ver bug del bonus de velocidad que
  // no aparecía después de la primera partida).
  flagsSpeedBonusText.style.display = '';
  const cw = document.getElementById('flags-countdown-widget');
  if (cw) cw.style.display = 'block';
  flagsTimerEl.textContent = '';
  flagsTimerEl.style.color = '';
  flagsTimerImg.src = 'images/countdown2.png';
  flagsTimerImg.style.animationPlayState = 'running';
  // findluggage-scroll es una animación 'forwards' (no infinite) — si el tab ya
  // corrió una partida real antes, puede haber quedado con display:none o la
  // clase 'scrolling' ya aplicada (que entonces NO reinicia sola). Reset limpio
  // con reflow forzado, igual que hace showFlagsMode() con el jugador real.
  // OJO: NO se muestran acá — recién con datos REALES de la ronda (en
  // flagsSpectatorShowRound/ShowPregame). Antes esto los mostraba de una,
  // con lo que hubiera quedado de src en los <img> de una sesión anterior de
  // ESTA MISMA pestaña (o directamente vacío) — un instante de maletines con
  // banderas viejas/vacías antes de que la ronda real del rival llegara por
  // la red y recién ahí los reemplazara (el "flagid vacío y maletines con
  // banderas random, el del medio sin nada" reportado).
  flagsFindLuggage.style.display = 'none';
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  flagsFlagidWrap.style.display = 'none';
  flagsFlagidLabel.textContent  = '';
  flagsGroupIds = flagsTopGroupIds.slice();
  [...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
    const g = document.getElementById(id);
    if (!g) return;
    g.style.pointerEvents = 'none'; // solo mira, no clickea
    g.classList.remove('flags-faded');
    g.style.opacity = '';
    g.style.transform  = '';
    g.style.transition = '';
    g.style.willChange = '';
    // Limpiar cualquier bandera vieja de una sesión anterior de esta pestaña
    // — sin esto, aunque el WRAPPER se ocultara, el <img> interno seguía con
    // el src de la última bandera que esta pestaña haya mostrado alguna vez.
    const imgId = flagsSlotImgIds[id];
    const img = imgId && document.getElementById(imgId);
    if (img) { img.src = ''; img.style.display = 'none'; }
  });
  flagsBottomGroupIds.forEach(id => { const g = document.getElementById(id); if (g) g.style.display = 'none'; });
  // Trencito de puntos: arrancar limpio (si el tab jugó una partida real antes,
  // podía quedar con puntos rellenos o a mitad de la animación de tren).
  const dotsContainer = document.getElementById('flags-progress-dots');
  if (dotsContainer) {
    dotsContainer.classList.remove('train-animation', 'dots-fade-out');
    dotsContainer.querySelectorAll('.dot').forEach(d => d.classList.remove('filled'));
  }
  // OJO: acá NO se arranca sfxGameMusic — Enter() corre mientras todavía se
  // está mostrando la pantalla de carga del espectador, antes de saber si lo
  // que sigue es un pregame (que debe sonar en silencio hasta el GO) o una
  // ronda ya en curso. Se arranca recién en flagsSpectatorShowRound, en el
  // punto exacto donde se confirma que no viene ningún pregame (unión a
  // mitad de ronda) — "entrás a donde corresponde", no antes.
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// switchingMode=true: la campaña del espectado encadenó a OTRO modo (banderas
// → siluetas/etc.) — solo hay que desmontar el DOM de banderas, sin tocar
// _isSpectating ni mostrar el loading-screen (seguimos espectando, solo que
// otro modo está por montarse encima en el mismo instante). Sin esto, cambiar
// de modo cerraba la sesión entera de espectador a mitad de camino.
window.flagsSpectatorExit = function (switchingMode) {
  _flagsSpecMode = false;
  if (!switchingMode) window._isSpectating = false;
  // Filas extra del leaderboard (amigo/rival, ver flagsSpectatorSetPlayerCard)
  // quedaban huérfanas en #flags-leaderboard si nadie las sacaba al cerrar —
  // sin la del rival ni molestaba visualmente (el modo normal no la toca),
  // pero con el "jugador terminó antes y entra de prestado a espectar al
  // rival" (ver vs.js _enterWaitAsSpectator) el MISMO jugador vuelve a jugar
  // otra partida después, y encontraba estas filas viejas todavía puestas.
  document.getElementById('flags-spec-lb-entry')?.remove();
  document.getElementById('flags-spec-lb-opp')?.remove();
  // Igual que flagsHardReset() (el quit REAL): sin esto, el showStep() del
  // 3-2-1 seguía corriendo solo en segundo plano (nunca se abortaba), y
  // eventualmente llegaba a su onDone() — que arranca sfxGameMusic — PISANDO
  // la música de menú que closeSpectator() ya había puesto momentos antes.
  // También el beep del countdown (sfxCountdown) seguía sonando de fondo
  // porque nada lo pausaba.
  flagsAborted = true;
  clearTimeout(flagsPregameTimeout); flagsPregameTimeout = null;
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  _flagsSpecClearElimination();
  _flagsSpecPendingElimination = null;
  _flagsSpecLastTick = null;
  _flagsSpecLastTickSoundAt = 0;
  clearTimeout(_flagsSpecTimesUpTimeout1);
  clearTimeout(_flagsSpecTimesUpTimeout2);
  window.flagsSpectatorHidePostgame();
  if (flagsPregameEl) flagsPregameEl.style.display = 'none';
  flagsTimeupEl.style.display = 'none';
  flagsTimeupEl.classList.remove('timeup-in', 'timeup-out');
  // window._vsShowingResult (ver _exitWaitAsSpectator en vs.js): este exit no
  // es un espectador EXTERNO cerrando su sesión para volver al menú — es EL
  // PROPIO JUGADOR que estaba mirando a su rival de prestado, a punto de ver
  // SU PROPIO resultado del duelo. flagsHardReset() ya respeta esta misma
  // bandera para no borrar los assets de fondo cuando el rival abandona
  // (_onOpponentAbandoned) — sin el mismo respeto acá, el camino normal
  // (ambos terminan su cronómetro) SÍ los borraba, dejando el overlay de
  // resultado sobre un fondo vacío en vez del juego congelado detrás (el "se
  // quitan los assets de fondo si pierdo" reportado).
  if (!window._vsShowingResult) {
    flagsWrapper.style.display     = 'none';
    flagsMachine.style.display     = 'none';
    flagsMachine2.style.display    = 'none';
    flagsMachine3.style.display    = 'none';
    flagsMachine3b.style.display   = 'none';
    flagsLuggageWrap.style.display = 'none';
    flagsFlagidWrap.style.display  = 'none';
  }
  flagsScoreDisplay.style.display = 'none';
  flagsRightPanel.style.display   = 'none';
  const specLb = document.getElementById('flags-leaderboard');
  if (specLb) specLb.innerHTML = '';
  const cw = document.getElementById('flags-countdown-widget');
  if (cw) cw.style.display = 'none';
  if (!switchingMode && !window._vsShowingResult) {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'flex';
  }
  // Resetear TODO estado de animación dejado por la partida espectada — a
  // diferencia de una partida real terminando (flagsHardReset), acá nunca se
  // pasa por ese reset porque no es "mi" partida, así que si no se limpia acá
  // explícitamente queda pegado (trencito con puntos rellenos, machine2
  // pausada/desincronizada, countdown con el titileo negro trabado) cuando
  // arranca la partida real siguiente.
  [flagsMachine, flagsMachine2, flagsMachine3, flagsMachine3b].forEach(m => {
    if (!m) return;
    m.style.animationPlayState = '';
    m.classList.remove('scrolling');
  });
  // findluggage/machine son elementos SUELTOS (hermanos de #flags-wrapper, no
  // hijos — ocultar flagsWrapper no los tapa) — sin este display:none acá
  // quedaban visibles pisando el menú después de salir del espectador. Igual
  // que arriba, si es window._vsShowingResult no corresponde ocultarlo: debe
  // quedar congelado de fondo detrás del overlay de resultado.
  if (!window._vsShowingResult) flagsFindLuggage.style.display = 'none';
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  // Maletines sueltos con transform/transition residual de un pick de ESTA
  // sesión (ver flagsSpectatorResolvePick, que mueve el maletín elegido hacia
  // findluggage con translate3d inline) — flagsSpectatorEnter() ya limpia
  // esto al volver a entrar, pero se limpia también ACÁ, al salir, para no
  // depender de ese orden: si en el futuro algo entra a una UI real sin pasar
  // por flagsSpectatorEnter (ej. el switch de POV entre los dos amigos de un
  // mismo versus, que reabre openSpectator con un friend distinto sobre la
  // MISMA partida), el maletín no debe quedar animando hacia una posición de
  // la SESIÓN ANTERIOR (el "posición de findluggage no coordinada" reportado).
  [...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
    const g = document.getElementById(id);
    if (!g) return;
    g.style.transform    = '';
    g.style.transition   = '';
    g.style.animation    = '';
    g.style.willChange   = '';
    g.classList.remove('luggage-enter-active', 'flags-faded');
  });
  const specConfirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (specConfirmWrap) specConfirmWrap.style.display = '';
  if (flagsProgressDots) flagsProgressDots.forEach(d => d.classList.remove('filled'));
  if (flagsProgressContainer) flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
  flagsDots = 0;
  _flagsSpecDots = 0;
  if (flagsTimerImg) {
    flagsTimerImg.src = 'images/countdown2.png';
    flagsTimerImg.style.animationPlayState = 'running';
  }
  flagsTimerEl.textContent = '';
  flagsTimerEl.style.color = '';
  flagsTimerEl.classList.remove('timer-number-infinity');
  if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
};

// Tarjeta única en el panel derecho con el jugador REAL espectado (nombre,
// avatar, score) — reemplaza al leaderboard normal, que agregaría tu propia
// tarjeta como si estuvieras jugando vos.
// oppName/oppAvatar/oppScore: en versus, el rival del amigo espectado — ver
// comentario largo en citiesSpectatorSetPlayerCard (mismo motivo/patrón).
window.flagsSpectatorSetPlayerCard = function (name, avatar, score, oppName, oppAvatar, oppScore, cardCode, oppCardCode) {
  if (!_flagsSpecMode) return;
  const lb = document.getElementById('flags-leaderboard');
  if (!lb) return;
  // #flags-leaderboard no tiene contenido normal-flow (sus filas son
  // position:absolute), así que sin un height explícito mide 0 — y como
  // #flags-right-panel está anclado por `bottom`, con height:0 su propio
  // origen queda pegado abajo de todo, empujando cualquier fila con top:0
  // fuera de la pantalla. El leaderboard real siempre setea este height
  // (flagsPositionLeaderboard) — acá alcanza con una fila.
  const rowH = getFlagsLbRowHeight();
  const showOpp = !!oppName;
  // TOP_MARGIN: ver comentario largo en citiesSpectatorSetPlayerCard —
  // #flags-leaderboard tiene el mismo clip-path:inset(0 -300px) que recorta
  // el emote-bubble de wrongEffect si la fila de arriba está en top:0.
  const TOP_MARGIN = Math.round(rowH * 0.4);
  lb.style.height = (showOpp ? rowH * 2 + FLAGS_LB_GAP + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';
  let el = document.getElementById('flags-spec-lb-entry');
  if (!el) {
    el = document.createElement('div');
    el.className = 'lb-entry lb-player';
    el.id = 'flags-spec-lb-entry';
    el.style.top = TOP_MARGIN + 'px';
    el.innerHTML = `<span class="lb-rank rank-other"></span>`
      + `<div class="lb-avatar"><img class="lb-avatar-img" id="flags-spec-lb-avatar" src="images/profilepic/ppdefault.png"></div>`
      + `<span class="lb-name" id="flags-spec-lb-name"></span>`
      + `<span class="lb-score" id="flags-spec-lb-score">0</span>`;
    lb.appendChild(el);
  }
  document.getElementById('flags-spec-lb-name').textContent = name || 'Jugador';
  const avatarEl = document.getElementById('flags-spec-lb-avatar');
  if (avatarEl && avatar) avatarEl.src = avatar;
  document.getElementById('flags-spec-lb-score').textContent = (score || 0).toLocaleString();
  window.CustomizeAssets?.applyCard(el, cardCode || '0001');

  let oppEl = document.getElementById('flags-spec-lb-opp');
  if (showOpp) {
    if (!oppEl) {
      oppEl = document.createElement('div');
      oppEl.className = 'lb-entry lb-vsopp';
      oppEl.id = 'flags-spec-lb-opp';
      oppEl.style.top = (TOP_MARGIN + rowH + FLAGS_LB_GAP) + 'px';
      oppEl.innerHTML = `<span class="lb-rank rank-other"></span>`
        + `<div class="lb-avatar"><img class="lb-avatar-img" id="flags-spec-lb-opp-avatar" src="images/profilepic/ppdefault.png"></div>`
        + `<span class="lb-name" id="flags-spec-lb-opp-name"></span>`
        + `<span class="lb-score" id="flags-spec-lb-opp-score">0</span>`;
      lb.appendChild(oppEl);
    }
    window.CustomizeAssets?.applyCard(oppEl, oppCardCode || '0001');
    document.getElementById('flags-spec-lb-opp-name').textContent = oppName || 'Rival';
    const oppAvatarEl = document.getElementById('flags-spec-lb-opp-avatar');
    if (oppAvatarEl && oppAvatar) oppAvatarEl.src = oppAvatar;
    document.getElementById('flags-spec-lb-opp-score').textContent = (oppScore || 0).toLocaleString();
    // Reordenar según puesto — ver comentario largo en citiesSpectatorSetPlayerCard.
    const friendOnTop = (score || 0) >= (oppScore || 0);
    el.style.top    = (TOP_MARGIN + (friendOnTop ? 0 : rowH + FLAGS_LB_GAP)) + 'px';
    oppEl.style.top = (TOP_MARGIN + (friendOnTop ? rowH + FLAGS_LB_GAP : 0)) + 'px';
    // Número de puesto (1°/2°) — mismo mecanismo que el leaderboard real
    // (positionLeaderboard: rankEl.textContent + className rank-1/rank-2).
    // Faltaba del todo acá: el <span class="lb-rank"> quedaba siempre vacío
    // con la clase genérica "rank-other" puesta en la creación, sin importar
    // quién iba ganando. Y AUNQUE se le pusiera el texto, .lb-rank tiene
    // display:none por defecto en el CSS — solo se muestra con la regla
    // "#flags-leaderboard.vs-active .lb-rank", clase que agrega
    // initLeaderboard() (bloqueada mientras se espectea, ver window._isSpectating
    // ahí mismo) — así que en espectador NUNCA se activaba esa clase y el
    // número quedaba invisible aunque el texto/clase estuvieran bien puestos.
    // Se fuerza acá con display inline, sin depender de esa clase.
    const elRankEl  = el.querySelector('.lb-rank');
    const oppRankEl = oppEl.querySelector('.lb-rank');
    if (elRankEl)  { elRankEl.textContent  = friendOnTop ? '1' : '2'; elRankEl.className  = 'lb-rank ' + (friendOnTop ? 'rank-1' : 'rank-2'); elRankEl.style.display  = 'block'; }
    if (oppRankEl) { oppRankEl.textContent = friendOnTop ? '2' : '1'; oppRankEl.className = 'lb-rank ' + (friendOnTop ? 'rank-2' : 'rank-1'); oppRankEl.style.display = 'block'; }
  } else if (oppEl) {
    oppEl.remove();
  } else {
    el.style.top = TOP_MARGIN + 'px';
  }
};

window.flagsSpectatorWrongEffect = function (target) {
  if (!_flagsSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'flags-spec-lb-opp' : 'flags-spec-lb-entry');
  if (!el) return;
  el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // z-index elevado mientras dura el emote — ver comentario largo en citiesSpectatorWrongEffect (monuments.js).
  const prevZ = el.style.zIndex;
  el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 1800);
  if (typeof spawnEmoteBubble === 'function') spawnEmoteBubble(el);
};

// "Se acabó el tiempo" en la cartilla del espectador 1v1 (amigo/rival) — mismo
// mecanismo que flagsSpectatorWrongEffect pero con el cronómetro.
window.flagsSpectatorTimesUpEffect = function (target) {
  if (!_flagsSpecMode) return;
  const el = document.getElementById(target === 'opponent' ? 'flags-spec-lb-opp' : 'flags-spec-lb-entry');
  if (!el) return;
  const prevZ = el.style.zIndex;
  el.style.zIndex = '50';
  setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
};

// dots = flagsDots del jugador real luego de sumar esta ronda — el "trencito"
// de puntos y el bonus de +5s se derivan localmente del mismo umbral
// (FLAGS_DOTS_NEEDED) que usa flagsAdvanceDot(), sin necesitar más datos.
let _flagsSpecDots = 0;
window.flagsSpectatorAdvanceDot = function (dots) {
  if (!_flagsSpecMode) return;
  // Último valor conocido — el reset de más abajo lo relee EN VIVO acá (no el
  // "dots" capturado por closure en el momento en que se armó el setTimeout).
  // Sin esto, si llegaba un punto nuevo MIENTRAS corría la animación del
  // trencito completo (2.5s), el reset lo pisaba con el valor viejo y ese
  // punto se perdía visualmente — flagsAdvanceDot() real relee flagsDots en
  // vivo por la misma razón.
  _flagsSpecDots = dots;
  const container = document.getElementById('flags-progress-dots');
  if (!container) return;
  container.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < dots));
  if (dots >= FLAGS_DOTS_NEEDED && !container.classList.contains('train-animation')) {
    container.classList.add('train-animation');
    if (typeof playTimeBonus === 'function') playTimeBonus(document.getElementById('flags-time-bonus'), FLAGS_BONUS_TIME);
    // Mismo flash verde que hace flagsAdvanceDot() real en el número del
    // cronómetro al ganar el bonus de +tiempo — faltaba acá del todo, el
    // trencito/popup de "+5s" se veían pero el número nunca cambiaba de
    // color, a diferencia de lo que ve el jugador real.
    const origColor = flagsTimerEl.style.color;
    flagsTimerEl.style.color = '#00ff88';
    setTimeout(() => {
      if (!_flagsSpecMode) return;
      container.classList.add('dots-fade-out');
      setTimeout(() => {
        if (!_flagsSpecMode) return;
        container.classList.remove('train-animation', 'dots-fade-out');
        const finalDots = Math.max(0, _flagsSpecDots - FLAGS_DOTS_NEEDED);
        container.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < finalDots));
        // _flagsSpecLastTick: último timeLeft real conocido (ver
        // flagsSpectatorUpdateTimer) — decide si vuelve a blanco (últimos
        // 10s) o al color original, igual que el jugador real.
        if (_flagsSpecLastTick != null && _flagsSpecLastTick > 0 && _flagsSpecLastTick <= 10) {
          flagsTimerEl.style.color = '#ffffff';
        } else {
          flagsTimerEl.style.color = origColor;
        }
      }, 500);
    }, 2000);
  }
};

// Se acabó el tiempo de esta ronda de juego — mismo cartel "TIME'S UP" que ve
// el jugador real (reusa #flags-timeup-overlay), con su sonido y cortando la
// música. A diferencia de endFlagsGame() del jugador real, NO llama a
// hideFlagsMode() — el espectador se queda esperando la próxima ronda (si
// sigue en banderas) o el fin real de la partida/sesión (onEnd).
let _flagsSpecTimesUpTimeout1 = null, _flagsSpecTimesUpTimeout2 = null;
window.flagsSpectatorShowTimesUp = function () {
  if (!_flagsSpecMode) return;
  clearTimeout(_flagsSpecTimesUpTimeout1);
  clearTimeout(_flagsSpecTimesUpTimeout2);
  if (typeof playMusic === 'function') playMusic(null);
  if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
  // Mismo paso que endFlagsGame() del jugador real: parar el titileo rojo/negro
  // del countdown — sin esto sigue parpadeando de fondo detrás del overlay.
  if (flagsTimerImg) flagsTimerImg.style.animationPlayState = 'paused';
  flagsTimeupEl.classList.remove('timeup-out');
  flagsTimeupEl.classList.add('timeup-in');
  flagsTimeupEl.style.display = 'flex';
  _flagsSpecTimesUpTimeout1 = setTimeout(() => {
    if (!_flagsSpecMode) return;
    flagsTimeupEl.classList.remove('timeup-in');
    flagsTimeupEl.classList.add('timeup-out');
    _flagsSpecTimesUpTimeout2 = setTimeout(() => {
      if (!_flagsSpecMode) return;
      flagsTimeupEl.style.display = 'none';
      flagsTimeupEl.classList.remove('timeup-out');
    }, 400);
  }, 1800);
};

// Cuenta 3-2-1 antes de la ronda: reusa el 100% de la animación real
// (runFlagsPregame ya vive en este mismo archivo, sin nada que dependa de
// "mi" partida) — el espectador ve exactamente el mismo conteo que el
// jugador, con su mismo sonido. onDone vacío: el primer 'round' que llegue
// después ya se encarga de mostrar la ronda real.
window.flagsSpectatorShowPregame = function (payload) {
  if (!_flagsSpecMode) return;
  // Sincrónico, apenas llega el broadcast — lo usa el timer de "fallback" de
  // flagsSpectatorShowRound para decidir si de verdad hay un 3-2-1 en curso
  // o si nadie va a mandar un pregame (unión a mitad de ronda).
  _flagsSpecPregameSeen = true;
  _flagsSpecCountdownDone = false;
  _flagsSpecRevealed = false;
  _flagsSpecShowRoundApplied = false;
  window.flagsSpectatorHidePostgame();
  // Igual que showFlagsMode() del jugador real justo antes de runFlagsPregame:
  // maletines/findluggage/flagid ocultos hasta que termine la cuenta — antes
  // quedaban visibles (vacíos) de la ronda anterior durante todo el 3-2-1.
  flagsFindLuggage.style.display = 'none';
  flagsLuggageWrap.style.display = 'none';
  flagsFlagidWrap.style.display  = 'none';
  const cw = document.getElementById('flags-countdown-widget');
  if (cw) cw.style.display = 'block';
  flagsTimerEl.classList.toggle('timer-number-infinity', !!(payload && payload.infinite));
  flagsTimerEl.textContent = (payload && payload.infinite) ? '∞' : (payload && payload.duration) || '';
  flagsTimerEl.style.color = '';
  flagsTimerImg.src = 'images/countdown2.png';
  flagsTimerImg.style.animationPlayState = 'paused';
  // Igual que showFlagsMode() real (línea justo antes de runFlagsPregame): sin
  // música durante el 3-2-1, solo el beep del countdown.
  if (typeof playMusic === 'function') playMusic(null);
  // El jugador real ya muestra su puntaje acumulado de campaña desde el
  // arranque del 3-2-1 (no arranca en 0 salvo que sea el primer modo) — acá
  // sin animación, es el estado base antes de la primera respuesta.
  if (payload && typeof payload.campaignBaseAtStart === 'number') {
    _flagsSpecTargetScore = payload.campaignBaseAtStart;
    _flagsSpecDisplayedScore = payload.campaignBaseAtStart;
    flagsScoreEl.textContent = payload.campaignBaseAtStart.toLocaleString();
  }
  // flagsSpectatorEnter() arranca este scroll de una (para el caso de unirse a
  // mitad de una ronda ya en curso, sin pregame) — durante el 3-2-1 real la
  // máquina de identificación NO se mueve todavía, recién en el onDone. Sin
  // este freno acá, la máquina se veía moviéndose desde el arranque.
  flagsMachine3.classList.remove('scrolling');
  flagsMachine3b.classList.remove('scrolling');
  // Si el espectador se unió a mitad del 3-2-1 (p.ej. el jugador real ya va
  // por el "1"), payload.startedAt permite calcular cuánto ya pasó y
  // arrancar ahí mismo (número Y audio), en vez de mostrar siempre "3".
  let elapsedMs = (payload && typeof payload.startedAt === 'number') ? (Date.now() - payload.startedAt) : 0;
  // Salvaguarda contra desfasaje de reloj entre la máquina del jugador real y
  // la de este cliente (Date.now() no está garantizado sincronizado entre dos
  // computadoras distintas) o contra el resend tardío empujando el cálculo
  // más allá de la duración total del 3-2-1 — sin este clamp, un elapsedMs
  // inflado hacía que runFlagsPregame saltara DIRECTO a onDone sin mostrar
  // nada del conteo (mismo fix aplicado en shapes.js).
  const _pregameTotalMs = FLAGS_PREGAME_STEPS.reduce((s, x) => s + x.hold, 0);
  if (elapsedMs > _pregameTotalMs - 400) elapsedMs = Math.max(0, _pregameTotalMs - 400);
  runFlagsPregame(() => {
    _flagsSpecCountdownDone = true;
    // _flagsSpecShowRoundApplied (seteado dentro de flagsSpectatorShowRound)
    // dice si el 'round' real ya llegó y populó el DOM (oculto) mientras
    // corría este 3-2-1 — caso normal, con margen de sobra. Si todavía no
    // llegó (latencia/resend justo al filo), NO se revela nada acá: hacerlo
    // mostraría los maletines vacíos o con la bandera de la ronda VIEJA.
    // flagsSpectatorShowRound() revela apenas llegue el dato real (mismo
    // chequeo de _flagsSpecCountdownDone+_flagsSpecRevealed al final de esa
    // función).
    if (!_flagsSpecRevealed && _flagsSpecShowRoundApplied) {
      _flagsSpecRevealAfterPregame();
      _flagsSpecRevealed = true;
    }
  }, elapsedMs);
};

// Datos de la eliminación progresiva pendientes de programar — se guardan acá
// en vez de armarse el setTimeout directo en flagsSpectatorShowRound(), que
// puede correr mientras el 3-2-1 local TODAVÍA está en pantalla (los datos ya
// llegaron pero la ronda sigue oculta detrás del conteo). Si se programaran
// ahí, el fade quedaría corriendo "en el fondo" antes de que el espectador
// viera nada, desincronizado del jugador real — se arma recién en
// _flagsSpecRevealAfterPregame(), relativo al momento en que la ronda
// REALMENTE se hace visible, no a cuándo llegó el broadcast.
let _flagsSpecPendingElimination = null; // { slotCount, order }

// Reveal compartido: muestra maletines/findluggage/flagid, arranca música y
// programa la eliminación progresiva — lo dispara flagsSpectatorShowRound()
// la primera vez que hay datos reales para mostrar después de un 3-2-1 (ver
// gate de _flagsSpecCountdownDone).
function _flagsSpecRevealAfterPregame() {
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  // Cuánto tiempo REAL ya pasó desde que la ronda arrancó de verdad (unión a
  // mitad de ronda: _enterWaitAsSpectator, una reconexión, o el snapshot
  // inicial de openSpectator con host_state/guest_state ya en curso) — sin
  // esto, findluggage SIEMPRE arrancaba su recorrido desde el frame 0 (el
  // inicio) sin importar cuánto ya llevaba recorrido el del jugador real,
  // aunque la eliminación progresiva de más abajo SÍ tenga en cuenta este
  // mismo roundStartedAt — quedaban desincronizados entre sí (el "findluggage
  // no está en el lugar correcto, siempre aparece en el inicio" reportado).
  // Un animation-delay NEGATIVO salta la animación directo a ese punto en vez
  // de reiniciarla desde el principio (mismo truco que ya usa
  // flagsSpectatorShowPregame con el 3-2-1, ver elapsedMs ahí).
  const _roundStartedAt = _flagsSpecPendingElimination && _flagsSpecPendingElimination.roundStartedAt;
  const _elapsedMs = _roundStartedAt ? Math.min(FLAGS_ROUND_TIME * 1000, Math.max(0, Date.now() - _roundStartedAt)) : 0;
  const _seekDelay = _elapsedMs ? `-${_elapsedMs}ms` : '';
  flagsFindLuggage.style.display = 'block';
  flagsFindLuggage.classList.remove('scrolling');
  flagsFindLuggage.style.animationDelay = _seekDelay;
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.classList.add('scrolling');
  flagsLuggageWrap.style.display = 'block';
  flagsFlagidWrap.style.display  = 'block';
  flagsMachine3.classList.add('scrolling');
  flagsMachine3b.classList.add('scrolling');
  flagsTimerImg.style.animationPlayState = 'running';
  if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
  _flagsSpecIsFirstRound = false;
  if (_flagsSpecPendingElimination) {
    const { slotCount, order, roundStartedAt } = _flagsSpecPendingElimination;
    _flagsSpecPendingElimination = null;
    const fadeSlot = (slotIdx) => {
      const g = document.getElementById(flagsGroupIds[slotIdx]);
      if (g) g.classList.add('flags-faded');
    };
    const roundMs = FLAGS_ROUND_TIME * 1000;
    // Cuánto tiempo REAL ya pasó desde que la ronda arrancó de verdad (ver
    // roundStartedAt en _specReportRound, flags.js) — si el espectador se
    // conectó a mitad de ronda (ej. _enterWaitAsSpectator, o una
    // reconexión), esto puede ser varios segundos, no cero. Cada umbral de
    // eliminación que YA pasó se aplica DE UNA (sin esperar el setTimeout);
    // los que faltan se agendan con el tiempo restante real, no el completo.
    // Antes esto siempre agendaba desde 0, mostrando las 6 opciones intactas
    // aunque el jugador real ya tuviera solo 2 (el "cuando yo veo 6, mi rival
    // en verdad tiene 2" reportado).
    const elapsed = Math.max(0, Date.now() - roundStartedAt);
    const scheduleFade = (thresholdMs, slots) => {
      if (elapsed >= thresholdMs) { slots.forEach(fadeSlot); return; }
      _flagsSpecEliminationTimeouts.push(setTimeout(() => slots.forEach(fadeSlot), thresholdMs - elapsed));
    };
    if (slotCount >= 6 && order.length) {
      [1, 2].forEach(step => scheduleFade(roundMs * step / 3, order.slice((step - 1) * 2, step * 2)));
    } else if (slotCount === 3 && order.length) {
      scheduleFade(roundMs / 2, [order[0]]);
    }
  }
}

// Pantalla de resultados (solo el camino solo/campaña de hideFlagsMode() —
// versus tiene su propia pantalla W/L, no cubierta acá todavía). Solo-lectura:
// pointer-events:none + confirm1/confirm2 ocultos, porque el espectador no
// puede avanzar la campaña REAL del jugador espectado con ese mismo botón.
window.flagsSpectatorShowPostgame = function (payload) {
  if (!_flagsSpecMode) return;
  const gameoverScreen = document.getElementById('gameover-screen');
  if (!gameoverScreen) return;
  // Igual que hideFlagsMode() real: el countdown no tiene sentido acá.
  const cw = document.getElementById('flags-countdown-widget');
  if (cw) cw.style.display = 'none';
  // Igual que hideFlagsMode() real: el marcador tampoco — sin esto quedaba
  // pegado, visible de fondo en la pantalla de resultados.
  flagsScoreDisplay.style.display = 'none';
  gameoverScreen.classList.add('mode-flags');
  gameoverScreen.classList.remove('mode-shapes', 'mode-monuments');
  gameoverScreen.style.pointerEvents = 'none';
  // Mismo swap de sprites que hace el click en #loading-flags-btn del jugador
  // real — estos personajes son elementos COMPARTIDOS entre modos (shapes/
  // cities/monuments les ponen otra imagen), así que sin este swap acá se ve
  // lo que haya quedado puesto por el último modo que los tocó, no los de
  // banderas.
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men3.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men4.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl3.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl4.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women2.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women3.png');
  document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level1complete.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check1.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong1.png');
  if (typeof window.hideGameoverConfirm === 'function') window.hideGameoverConfirm();
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = 'none';
  gameoverScreen.style.display = 'flex';
  const label = gameoverScreen.querySelector('.gameover-text1-label');
  if (label) label.textContent = (typeof t === 'function') ? t('gameover.flags') : 'Suitcase Shuffle';
  const finalScoreEl = document.getElementById('final-score-value');
  if (finalScoreEl) finalScoreEl.textContent = (payload.totalScore || 0).toLocaleString();
  const newHSBanner = document.getElementById('new-highscore-banner');
  const newHSScore  = document.getElementById('new-highscore-score');
  if (payload.isNewHighscore) {
    if (newHSBanner) newHSBanner.style.display = 'flex';
    if (newHSScore)  newHSScore.textContent = (payload.finalScore || 0).toLocaleString();
  } else if (newHSBanner) {
    newHSBanner.style.display = 'none';
  }
  if (typeof setModeCounts !== 'undefined') setModeCounts(payload.correctCount || 0, payload.wrongCount || 0);
  if (typeof restartFlightAtt !== 'undefined') restartFlightAtt();
  if (typeof buildChecksRow !== 'undefined') buildChecksRow();
  const checksEndTime = ((payload.correctCount || 0) > 0 ? (payload.correctCount - 1) * 0.1 + 0.2 : 0) + 0.4;
  if (typeof buildWrongsRow !== 'undefined') buildWrongsRow(checksEndTime);
  if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
};
window.flagsSpectatorHidePostgame = function () {
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) { gameoverScreen.style.display = 'none'; gameoverScreen.style.pointerEvents = ''; }
  const confirmWrap = document.querySelector('.gameover-confirm-wrap');
  if (confirmWrap) confirmWrap.style.display = '';
};

// tick = tiempo restante real del jugador (broadcast cada 1s desde startFlagsTimer).
let _flagsSpecLastTick = null;
// Además del guard por VALOR de arriba: unirse a mitad de partida dispara un
// resend de 'round'+'tick' (ver _resendStateTo en spectate.js) casi
// inmediatamente, y el PRÓXIMO tick en vivo llega con su cadencia normal de
// 1s — pero medida desde el tick REAL anterior del jugador, no desde este
// resend. Si el resend cae, por ejemplo, 800ms después del último tick real,
// el próximo tick en vivo puede llegar solo ~200ms después del resend — dos
// valores DISTINTOS (7 y 6), ninguno bloqueado por el guard de arriba (que
// solo frena valores IGUALES), sonando el beep dos veces pegado en vez de
// una vez por segundo — el "se corta fuerte, suena repetido" reportado.
let _flagsSpecLastTickSoundAt = 0;
window.flagsSpectatorUpdateTimer = function (timeLeft) {
  if (!_flagsSpecMode) return;
  flagsTimerEl.classList.remove('timer-number-infinity');
  flagsTimerEl.textContent = timeLeft;
  if (timeLeft <= 10) {
    flagsTimerEl.style.color = '#ffffff';
    flagsTimerImg.src = 'images/countdownred2.png';
    // Guard por valor (no solo por llamada): el round trae timeLeft y el
    // tick 1x/seg puede repetir el mismo segundo — sin esto sonaría dos veces.
    // + guard por tiempo real (ver _flagsSpecLastTickSoundAt): cubre el caso
    // de dos valores DISTINTOS llegando pegados por el resend de unión a
    // mitad de partida.
    const _nowTick = Date.now();
    if (timeLeft > 0 && timeLeft !== _flagsSpecLastTick && (_nowTick - _flagsSpecLastTickSoundAt) > 700
        && typeof sfxTickdown !== 'undefined' && typeof sfxPlay === 'function') {
      sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown);
      _flagsSpecLastTickSoundAt = _nowTick;
    }
  } else {
    flagsTimerEl.style.color = '';
    flagsTimerImg.src = 'images/countdown2.png';
  }
  _flagsSpecLastTick = timeLeft;
};

// score = puntaje actual del jugador (viene del broadcast de score existente).
// dots = progreso YA acumulado del trencito al momento de conectarse — sin
// esto, alguien que se unía a mitad de partida veía los puntitos apagados
// hasta la PRÓXIMA respuesta del jugador real, en vez del progreso real que
// ya llevaba acumulado (mismo fix ya aplicado en Cities/Monuments).
window.flagsSpectatorUpdateScore = function (score, dots) {
  if (!_flagsSpecMode) return;
  // Snap directo (sin animar) — se usa para "ponerse al día" al unirse a
  // mitad de ronda, no para una respuesta en vivo (esa pasa por
  // flagsSpectatorResolvePick → _flagsSpecAnimateScore). Sincroniza también
  // el estado de la animación — si no, la PRÓXIMA respuesta real intentaría
  // animar desde el valor viejo (0) en vez de desde acá.
  _flagsSpecTargetScore = score || 0;
  _flagsSpecDisplayedScore = score || 0;
  flagsScoreEl.textContent = (score || 0).toLocaleString();
  // Clamp para no disparar retroactivamente la animación de "llegó a 10" en
  // un simple catch-up — flagsSpectatorAdvanceDot ya hace snap directo
  // (no incrementa), sirve tal cual para esto.
  if (typeof dots === 'number' && typeof window.flagsSpectatorAdvanceDot === 'function') {
    window.flagsSpectatorAdvanceDot(Math.max(0, Math.min(dots, FLAGS_DOTS_NEEDED - 1)));
  }
};

// payload = { prompt, correctSlot, options, eliminationOrder } — ya viene
// resuelto por completo desde flags.js del jugador real (mismo seed), no hace
// falta re-derivarlo acá; eliminationOrder es el mismo orden de desvanecido
// progresivo que corre en su pantalla, para que se vea igual y al mismo tiempo
// (el timing es relativo al inicio de la ronda, FLAGS_ROUND_TIME es fijo).
window.flagsSpectatorShowRound = function (payload) {
  if (!_flagsSpecMode) return;
  _flagsSpecClearElimination();
  // Recién ACÁ se revelan (flagsSpectatorEnter los deja ocultos a propósito,
  // ver comentario largo ahí) — hay datos reales para mostrar, así que todo
  // aparece de una vez ya completo, sin el instante de maletines vacíos/con
  // banderas viejas que se veía antes.
  if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
  flagsFindLuggage.style.display = 'block';
  flagsFlagidWrap.style.display  = 'block';
  const options   = payload.options || [];
  const slotCount = options.length;
  flagsGroupIds = slotCount > 3 ? [...flagsTopGroupIds, ...flagsBottomGroupIds] : flagsTopGroupIds.slice();
  flagsLuggageWrap.classList.toggle('flags-six-mode', slotCount > 3);
  flagsBottomGroupIds.forEach(id => {
    const g = document.getElementById(id);
    if (g) g.style.display = slotCount > 3 ? '' : 'none';
  });
  // Retomar el scroll de la cinta — mismo patrón exacto que startFlagsRound()
  // del jugador real: hay que resetear 'animation' completo (no solo
  // 'transition'), porque el pick de la ronda anterior deja
  // animationPlayState:'paused' puesto — sin este reset esa pausa queda pegada
  // y la animación 'scrolling' de la ronda siguiente nunca arranca aunque se
  // vuelva a agregar la clase.
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.classList.add('scrolling');
  flagsMachine2.style.animationPlayState  = 'running';
  flagsMachine3.style.animationPlayState  = 'running';
  flagsMachine3b.style.animationPlayState = 'running';
  flagsFlagidLabel.textContent = (typeof tCountry === 'function') ? tCountry(payload.prompt) : payload.prompt;
  // Ajustar tamaño si el nombre es largo — mismo mecanismo que el juego real
  // (ver flagsShowRound más abajo en el archivo); acá faltaba del todo, así
  // que un nombre largo (ej. "República Dominicana") se salía de la tarjeta
  // flagid en vez de encogerse para entrar.
  {
    const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
    const maxW = 41.7 * vminPx;
    let fs = 4.2;
    flagsFlagidLabel.style.fontSize = fs + 'cqmin';
    flagsFlagidLabel.style.letterSpacing = '';
    while (flagsFlagidLabel.scrollWidth > maxW && fs > 1.8) {
      fs -= 0.22;
      flagsFlagidLabel.style.fontSize = fs + 'cqmin';
      if (fs < 3.3) flagsFlagidLabel.style.letterSpacing = '-1px';
      if (fs < 2.4) flagsFlagidLabel.style.letterSpacing = '-2px';
    }
  }
  flagsGroupIds.forEach((id, i) => {
    const imgId  = flagsSlotImgIds[id];
    const img    = document.getElementById(imgId);
    const group  = document.getElementById(id);
    if (!img || !group) return;
    img.src = COUNTRY_FLAGS[options[i]] || '';
    img.style.display = 'block';
    group.style.display = '';
    group.style.pointerEvents = 'none';
    group.classList.remove('flags-faded', 'luggage-enter-active');
    // Reset completo — si ESTE maletín fue el elegido en una ronda anterior,
    // flagsSpectatorResolvePick le dejó puesto style.animation='none' (inline)
    // para poder animar el vuelo por transición en vez de la animación CSS de
    // entrada. Un animation:'none' inline bloquea CUALQUIER animación por
    // clase para siempre en ese elemento hasta que se limpie acá — por eso la
    // entrada dejaba de funcionar solo en el slot que ya había sido clickeado.
    group.style.animation  = '';
    group.style.opacity    = '';
    group.style.willChange = '';
    group.style.transformOrigin = '';
    group.style.transform  = 'none';
    group.style.transition = 'none';
  });
  // Reflow forzado antes del rAF: garantiza que el navegador registró la clase
  // 'luggage-enter-active' removida ANTES de volver a agregarla.
  void flagsLuggageWrap.offsetWidth;
  requestAnimationFrame(() => {
    if (!_flagsSpecMode) return;
    flagsGroupIds.forEach(id => {
      const g = document.getElementById(id);
      if (g) { g.style.transform = ''; g.style.transition = ''; g.classList.add('luggage-enter-active'); }
    });
  });

  // Eliminación progresiva — mismo patrón visual que el juego real (fadeSlot).
  // NO se programa el setTimeout acá: si el 3-2-1 local todavía está en
  // pantalla cuando llegan estos datos, el fade correría "de fondo" antes de
  // que el espectador viera la ronda, desincronizado del jugador real — se
  // guarda para que _flagsSpecRevealAfterPregame() lo programe recién cuando
  // la ronda de verdad se revela.
  const order = payload.eliminationOrder || [];
  _flagsSpecPendingElimination = { slotCount, order, roundStartedAt: payload.roundStartedAt || Date.now() };

  // Igual mecanismo que shapes.js: solo en la primera ronda tras entrar, un
  // margen corto para confirmar si de verdad viene un pregame (llega poco
  // después, mismo orden real de broadcasts). Si no aparece, es unión a
  // mitad de ronda — recién ahí, con la ronda ya mostrada, arranca la
  // música del juego (si hay pregame, la arranca su propio onDone al
  // terminar el 3-2-1).
  if (_flagsSpecIsFirstRound) {
    _flagsSpecIsFirstRound = false;
    setTimeout(() => {
      if (!_flagsSpecPregameSeen && typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') {
        playMusic(sfxGameMusic);
      }
    }, 400);
  }
  // El DOM ya está poblado con los datos reales de esta ronda (arriba, más
  // allá de que los contenedores estén ocultos o no) — si el 3-2-1 local ya
  // terminó y todavía no se reveló (llegamos acá DESPUÉS del onDone, que se
  // encontró sin datos y esperó), revelar ahora mismo con los datos ya
  // puestos. Si el 3-2-1 sigue corriendo, el reveal lo dispara su propio
  // onDone cuando termine (_flagsSpecShowRoundApplied ya queda en true).
  _flagsSpecShowRoundApplied = true;
  // OJO: antes esto solo revelaba la PRIMERA vez por sesión (gate
  // `!_flagsSpecRevealed`, pensado nada más para la transición 3-2-1→ronda).
  // El pregame (3-2-1) se transmite UNA sola vez al arrancar el modo, no
  // antes de cada pregunta — así que con ese gate, TODAS las rondas después
  // de la primera nunca volvían a llamar _flagsSpecRevealAfterPregame(): la
  // máquina de identificación nunca arrancaba su scroll si esta ronda era la
  // primera que veía el espectador (unión a mitad de partida, sin pregame de
  // por medio) y, aun cuando sí arrancaba, ninguna ronda posterior programaba
  // su PROPIA eliminación progresiva de opciones (quedaba pegada la de la
  // ronda 1) — el "la máquina no se mueve / no desaparecen los maletines
  // incorrectos al entrar a mitad de partida" reportado. Sin ningún 3-2-1
  // corriendo ahora mismo, cada ronda nueva debe revelarse de una.
  if (_flagsSpecCountdownDone) {
    _flagsSpecRevealAfterPregame();
    _flagsSpecRevealed = true;
  }
};

// payload = { index, correct } — el maletín que clickeó el jugador real. Recrea
// el mismo vuelo hacia la cinta que ve el jugador (mismo cálculo que
// handleLuggagePick, midiendo el DOM real acá en vez de ahí).
window.flagsSpectatorResolvePick = function (payload) {
  if (!_flagsSpecMode) return;
  // payload.score YA viene con campaignBase() sumado (ver
  // _specReportAnswer en el jugador real) — anima hacia ese valor en vez de
  // saltar de golpe, igual que ve el propio jugador (flagsAnimateScore()).
  if (typeof payload.score === 'number') {
    _flagsSpecTargetScore = payload.score;
    _flagsSpecAnimateScore();
  }
  _flagsSpecClearElimination();
  const group = document.getElementById(flagsGroupIds[payload.index]);
  // Todo lo de acá adentro es geometría frágil (getBoundingClientRect, DOMMatrix
  // sobre transforms que pueden no estar seteados todavía) — si algo tira una
  // excepción welacá, NO debe frenar lo que viene después (overlay/sonido/
  // puntaje/trencito). Antes, una excepción acá dejaba el trencito sin
  // actualizar hasta la SIGUIENTE respuesta correcta (se veían "dos puntos
  // prendiéndose juntos con un click de atraso").
  try { if (group) {
    flagsGroupIds.forEach(id => { const g = document.getElementById(id); if (g) g.style.pointerEvents = 'none'; });
    // CLAVE: sacar la clase de entrada ANTES de medir/animar. Su animación
    // queda con fill-mode:forwards al terminar, y mientras la clase siga
    // puesta esa animación le sigue "ganando" al transform inline que ponemos
    // más abajo — por eso el maletín nunca se veía viajar hacia findluggage.
    group.classList.remove('luggage-enter-active');
    group.style.animation  = 'none';
    group.style.transition = 'none';
    group.style.transform  = 'none';
    group.style.transformOrigin = '0 0';
    const lugImg   = group.querySelector('#flags-luggage, .flags-luggage-side');
    const lugRect  = (lugImg || group).getBoundingClientRect();
    const grpRect  = group.getBoundingClientRect();
    const findRect = flagsFindLuggage.getBoundingClientRect();
    const lugScale = flagsLuggageWrap.getBoundingClientRect().width / 220;
    const fit  = lugRect.width ? (findRect.width / lugRect.width) : 1;
    const lugCx  = (lugRect.left + lugRect.width  / 2 - grpRect.left) / lugScale;
    const lugCy  = (lugRect.top  + lugRect.height / 2 - grpRect.top)  / lugScale;
    const findCx = (findRect.left + findRect.width  / 2 - grpRect.left) / lugScale;
    const findCy = (findRect.top  + findRect.height / 2 - grpRect.top)  / lugScale;
    const dx = findCx - fit * lugCx;
    const dy = findCy - fit * lugCy;
    group.style.willChange = 'transform';
    requestAnimationFrame(() => {
      group.style.transition = 'transform 0.1s linear';
      group.style.transform  = `translate3d(${dx}px, ${dy}px, 0) scale(${fit})`;
    });
    flagsMachine2.style.animationPlayState  = 'paused';
    flagsMachine3.style.animationPlayState  = 'paused';
    flagsMachine3b.style.animationPlayState = 'paused';
    // Sin pausar a findluggage mismo, su propia animación 'scrolling' seguía
    // corriendo y pisaba el transform que le poníamos acá — por eso nunca se
    // veía el maletín llegar a destino ni el "whoosh" final.
    flagsFindLuggage.style.animationPlayState = 'paused';
    // Trackeado en _flagsSpecEliminationTimeouts (ya se limpia al salir y al
    // arrancar cada ronda nueva) — sin esto, si el espectador salía o llegaba
    // otra ronda ANTES de que pasaran estos 600ms, este callback igual corría
    // después y pisaba animationPlayState/transform de la ronda nueva.
    _flagsSpecEliminationTimeouts.push(setTimeout(() => {
      if (!_flagsSpecMode) return;
      flagsMachine2.style.animationPlayState  = 'running';
      flagsMachine3.style.animationPlayState  = 'running';
      flagsMachine3b.style.animationPlayState = 'running';
      const mat = new DOMMatrix(getComputedStyle(flagsFindLuggage).transform);
      flagsFindLuggage.classList.remove('scrolling');
      flagsFindLuggage.style.transform = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e},${mat.f})`;
      void flagsFindLuggage.offsetWidth;
      flagsFindLuggage.style.transition = 'transform 0.15s linear';
      flagsFindLuggage.style.transform  = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e - 1000},${mat.f})`;
      group.style.transition = 'transform 0.15s linear';
      group.style.transform  = `translate3d(${dx - 1000 / lugScale}px, ${dy}px, 0) scale(${fit})`;
    }, 600));
  } } catch (e) {}
  const overlay = document.getElementById(payload.correct ? 'flags-check-overlay' : 'flags-wrong-overlay');
  if (overlay) {
    overlay.style.display = '';
    overlay.classList.remove('animate');
    void overlay.offsetWidth;
    overlay.classList.add('animate');
    setTimeout(() => { overlay.classList.remove('animate'); overlay.style.display = 'none'; }, 820);
  }
  // Igual que handleLuggagePick real: correcto suena check+acertar juntos,
  // incorrecto solo error.
  if (typeof sfxPlay === 'function') {
    if (payload.correct) {
      if (typeof sfxCheck   !== 'undefined') { sfxCheck.currentTime   = 0; sfxPlay(sfxCheck); }
      if (typeof sfxAcertar !== 'undefined') { sfxAcertar.currentTime = 0; sfxPlay(sfxAcertar); }
    } else if (typeof sfxError !== 'undefined') {
      sfxError.currentTime = 0; sfxPlay(sfxError);
    }
  }
  // "+puntos" flotante y el cartel de bonus de velocidad — mismos que ve el
  // jugador real (viajan en el broadcast de 'answer' junto al índice elegido).
  if (payload.correct && typeof payload.points === 'number' && typeof showScorePopup === 'function') {
    showScorePopup(payload.points);
  }
  if (payload.speedBonus > 0) {
    clearTimeout(flagsSpeedBonusHideId);
    flagsSpeedBonusText.classList.remove('visible');
    requestAnimationFrame(() => flagsSpeedBonusText.classList.add('visible'));
    flagsSpeedBonusHideId = setTimeout(() => flagsSpeedBonusText.classList.remove('visible'), 1600);
  }
  // Racha "X IN A ROW" — getBadgeImg(streak) devuelve un objeto Image ya
  // precargado (no serializable por broadcast), pero como es una función pura
  // del streak, el espectador lo resuelve local con el mismo streak que
  // transmite el jugador — no hace falta mandar la imagen, solo el número.
  if (payload.hasBadge && typeof getBadgeImg === 'function' && typeof showFlagsBadge === 'function') {
    const badgeImg = getBadgeImg(payload.streak || 0);
    if (badgeImg) showFlagsBadge(badgeImg, payload.inRowBonus || 0, payload.streak || 0);
  }
  // Trencito de puntos + bonus de +5s
  if (payload.correct && typeof payload.dots === 'number' && typeof window.flagsSpectatorAdvanceDot === 'function') {
    window.flagsSpectatorAdvanceDot(payload.dots);
  }
};

const FLAGS_SPEED_WIN  = 2.0;   // segundos para conseguir bonus velocidad
const FLAGS_SPEED_MULT = 1.5;   // multiplicador

const flagsSpeedBonusText = document.getElementById('flags-speed-bonus-text');
let flagsSpeedBonusHideId = null;
let flagsRoundStartTime   = null;

// Grupos de banderas visualmente similares — se usan como distractores desde correcta 23
const FLAG_SIMILAR_GROUPS = [
  ["Chad", "Andorra", "Rumanía", "Moldova"],
  ["Italia", "México", "Costa de Marfil", "Irlanda"],
  ["Paraguay", "Países Bajos", "Luxemburgo", "Croacia"],
  ["Rusia", "Eslovenia", "Eslovaquia", "Serbia"],
  ["Catar", "Baréin"],
  ["Indonesia", "Mónaco", "Singapur", "Polonia"],
  ["Bélgica", "Alemania"],
  ["Colombia", "Ecuador", "Venezuela"],
  ["Bolivia", "Colombia", "Ecuador"],
  ["Noruega", "Islandia", "Suecia", "Dinamarca", "Finlandia"],
  ["Australia", "Nueva Zelanda"],
  ["Irak", "Siria", "Sudán", "Yemen", "Egipto"],
  ["Guinea", "Mali", "Senegal", "Ghana", "Costa de Marfil"],
  ["Estonia", "Finlandia", "Eslovenia"],
  ["Corea del Norte", "Corea del Sur"],
  ["China", "Vietnam"],
  ["India", "Níger"],
  ["República Dominicana", "Cuba", "Puerto Rico"],
  ["Grecia", "Uruguay"],
  ["Irlanda", "Costa de Marfil"],
  ["Lituania", "Bolivia", "Ghana"],
  ["Nigeria", "Armenia"],
  ["Israel", "El Salvador"],
  ["Filipinas", "Cuba"],
  ["Perú", "Japón", "Bangladesh", "Georgia"],
  ["Austria", "Letonia"],
  ["Bulgaria", "Hungría"],
  ["Bielorrusia", "Rusia"],
  ["Argelia", "Pakistán"],
  ["Brunéi", "Malasia"],
  ["Camboya", "Sri Lanka"],
  ["Chad", "Rumanía"],
  ["Burkina Faso", "Mali", "Guinea"],
  ["Nicaragua", "Honduras", "El Salvador"],
  ["Costa Rica", "Nicaragua", "Honduras"],
];

// Construir mapa inverso: país → array de similares
const FLAG_SIMILAR = {};
for (const group of FLAG_SIMILAR_GROUPS) {
  for (const country of group) {
    if (!FLAG_SIMILAR[country]) FLAG_SIMILAR[country] = new Set();
    for (const other of group) {
      if (other !== country) FLAG_SIMILAR[country].add(other);
    }
  }
}

const flagsTopGroupIds    = ['flags-luggage-left-group', 'flags-luggage-group', 'flags-luggage-right-group'];
const flagsBottomGroupIds = ['flags-luggage-bl-group', 'flags-luggage-bc-group', 'flags-luggage-br-group'];
let flagsGroupIds = flagsTopGroupIds.slice();

function disableAllLuggageGroups() {
  [...flagsTopGroupIds, ...flagsBottomGroupIds].forEach(id => {
    const g = document.getElementById(id);
    if (g) {
      g.style.pointerEvents = 'none';
      g.style.cursor = 'default';
      g.classList.remove('luggage-enter-active');
      g.style.animation = 'none';
    }
  });
  flagsLuggageWrap.style.pointerEvents = 'none';
  flagsLuggageWrap.style.cursor = 'default';
}
let flagsStreak = 0;
let flagsEasyUnlocked = false;
let flagsSixUnlocked = false;   // 6 maletas desde correcta 3
let flagsMediumUnlocked = false; // pool medium desde correcta 5
let flagsHardUnlocked   = false;
let flagsInsaneUnlocked = false;
let flagsCorrectCount = 0;
let flagsIsFirstRound = true;
let flagsAnswered = new Set();
let flagsLastChosen = null;

// ── RNG SEMBRADO PARA VERSUS ──────────────────────────────────────────────────
// En versus, la selección de bandera/distractores/slots debe ser idéntica para
// ambos jugadores. Para eso usamos un RNG dedicado (solo lo consume la selección),
// independiente de cualquier otra llamada a Math.random (animaciones, emotes, etc.)
// que ocurriría en distinto orden en cada cliente y desincronizaría todo.
let flagsVsIndex = 0;          // índice de ronda compartido (mismo en ambos)
let _flagsSeededRand = null;   // generador determinista (null ⇒ usa Math.random)
function _flagsSyncedVersus() { return window._vsActive || window._lobbyActive; }
// Antes: `(_flagsSyncedVersus() && _flagsSeededRand) ? ... : Math.random()`.
// window._lobbyActive/_vsActive son banderas de ESTADO que cambian en otros
// puntos del código (fin de ronda, transición a espectar de prestado, etc.)
// — shapes.js/monuments.js/cities.js NUNCA chequean un flag de estado acá,
// solo si el generador sembrado (_xSeededRand) está seteado o no, seteado y
// limpiado explícitamente por flagsSetSeed/flagsClearSeed. Si CUALQUIER
// llamada a flagsRand() caía en la ventana donde el seed ya estaba puesto
// pero _lobbyActive todavía no (o ya no) era true, esa llamada consumía
// Math.random() en vez de avanzar el stream sembrado — desincronizando TODO
// el RNG determinista para ese cliente desde ahí en adelante (no solo esa
// ronda): el "a algunos les salen preguntas distintas al resto" reportado.
// _flagsSeededRand ya es null salvo entre flagsSetSeed()/flagsClearSeed(),
// así que este chequeo extra era redundante además de riesgoso.
function flagsRand() { return _flagsSeededRand ? _flagsSeededRand() : Math.random(); }
function flagsShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(flagsRand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
window.flagsSetSeed = function(seed) {
  let s = (seed >>> 0) || 1;
  _flagsSeededRand = function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  flagsVsIndex = 0;
};
window.flagsClearSeed = function() { _flagsSeededRand = null; flagsVsIndex = 0; };

let flagsPracticePool = [];
let flagsPracticeRemaining = [];
let flagsPracticeCurrent = null;

// Picks the next practice country using the same tier-unlock logic as normal mode,
// capped at practiceConfig.difficulty. Excludes `exc` (pass current when wrong, null when correct).
function flagsPracticePickNext(exc) {
  const diff = (window.practiceConfig && window.practiceConfig.difficulty) || 'dificil';
  const pool = exc ? flagsPracticeRemaining.filter(c => c !== exc) : flagsPracticeRemaining;
  const fallback = pool.length ? pool : flagsPracticeRemaining;
  const unlockedTiers = ['inicio'];
  if (flagsEasyUnlocked   && diff !== 'inicio')                          unlockedTiers.push('easy');
  if (flagsMediumUnlocked && (diff === 'medio' || diff === 'dificil'))   unlockedTiers.push('medium');
  if (flagsHardUnlocked   && diff === 'dificil')                         unlockedTiers.push('hard');
  if (flagsInsaneUnlocked && diff === 'dificil')                         unlockedTiers.push('insane');
  // Filter to unlocked tiers; if continent has no countries there, expand progressively
  const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];
  const tierSet = new Set(unlockedTiers.flatMap(t => COUNTRIES[t] || []));
  let tiered = fallback.filter(c => tierSet.has(c));
  if (!tiered.length) {
    for (const tier of ALL_TIERS) {
      if (unlockedTiers.includes(tier)) continue;
      (COUNTRIES[tier] || []).forEach(c => tierSet.add(c));
      tiered = fallback.filter(c => tierSet.has(c));
      if (tiered.length) break;
    }
  }
  const pick = tiered.length ? tiered : fallback;
  return pick[Math.floor(Math.random() * pick.length)] || null;
}

function buildFlagsPracticePool(continents, difficulty) {
  const sh = a => { for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; };
  const hasFlag = c => !!COUNTRY_FLAGS[c];
  const inCont  = c => !continents || continents.has(FLAG_COUNTRY_CONTINENT[c]);
  const ok      = c => hasFlag(c) && inCont(c);
  const diff = difficulty || 'dificil';
  const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];

  // Tiers allowed by difficulty ceiling (cumulative)
  const allowedTiers = ['inicio'];
  if (diff !== 'inicio') allowedTiers.push('easy');
  if (diff === 'medio' || diff === 'dificil') allowedTiers.push('medium');
  if (diff === 'dificil') { allowedTiers.push('hard'); allowedTiers.push('insane'); }

  const seen = new Set();
  const pool = [];
  const add = c => { if (!seen.has(c)) { seen.add(c); pool.push(c); } };

  // Step 1: add allowed tiers filtered by continent
  for (const tier of allowedTiers) (COUNTRIES[tier] || []).filter(ok).forEach(add);

  // Step 2: if pool is thin (<6), supplement from next harder tiers (still continent-filtered)
  if (pool.length < 6) {
    for (const tier of ALL_TIERS) {
      if (allowedTiers.includes(tier)) continue;
      (COUNTRIES[tier] || []).filter(ok).forEach(add);
      if (pool.length >= 6) break;
    }
  }

  // Step 3: final fallback — drop continent filter if still too few
  if (pool.length < 6) {
    for (const tier of ALL_TIERS) {
      (COUNTRIES[tier] || []).filter(hasFlag).forEach(add);
      if (pool.length >= 6) break;
    }
  }

  return sh(pool);
}

// Ventana de respuesta por ronda, en segundos. Debe coincidir con la duración de
// la animación #flags-findluggage.scrolling (css/style.css) que marca el wrong por demora.
const FLAGS_ROUND_TIME = 8.15;
// Eliminación progresiva de opciones erróneas (se desvanecen y quedan deseleccionables).
let flagsEliminationTimeouts = [];
function clearFlagsElimination() {
  flagsEliminationTimeouts.forEach(clearTimeout);
  flagsEliminationTimeouts = [];
}

const flagsSlotImgIds = {
  'flags-luggage-left-group':  'flags-flag-img-left',
  'flags-luggage-group':       'flags-flag-img',
  'flags-luggage-right-group': 'flags-flag-img-right',
  'flags-luggage-bl-group':    'flags-flag-img-bl',
  'flags-luggage-bc-group':    'flags-flag-img-bc',
  'flags-luggage-br-group':    'flags-flag-img-br',
};

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
const FLAGS_LB_COLORS  = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e8c','#00bcd4','#8bc34a'];
const FLAGS_LB_WINDOW  = 5;
const FLAGS_LB_PIN_ROW = 2;
const FLAGS_LB_GAP     = 4;

// Amigos desde la capa de datos compartida (js/friends.js -> getFriends()),
// la misma que usan la barra de monuments y las pantallas results/final.
function buildFlagsFriendPlayers() {
  // En modo lobby el leaderboard muestra a TODOS los rivales de la sala, en vivo.
  if (window._lobbyActive && Array.isArray(window._lobbyMembers)) {
    return window._lobbyMembers.map((m, i) => ({
      id: 'lob' + m.id,
      name: m.name,
      score: m.score || 0,
      avatar: m.avatar || '',
      color: FLAGS_LB_COLORS[i % FLAGS_LB_COLORS.length],
      initial: (m.name && m.name[0]) ? m.name[0].toUpperCase() : '?',
      cardCode: m.cardCode || '0001',
    }));
  }
  // En modo versus 1v1 el leaderboard compite SOLO contra el oponente, en vivo.
  if (window._vsActive && window._vsOpponent) {
    const o = window._vsOpponent;
    return [{
      id: 'vsopp',
      name: o.name,
      score: window._vsOppScore || 0,
      avatar: o.avatar || '',
      color: FLAGS_LB_COLORS[0],
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
    color: FLAGS_LB_COLORS[i % FLAGS_LB_COLORS.length],
    initial: (f.name && f.name[0]) ? f.name[0].toUpperCase() : '?',
    cardCode: f.cardCode || '0001',
  }));
}
let flagsMockPlayers = buildFlagsFriendPlayers();

let flagsLbElements    = {};
let flagsLastLbScore   = -1;
let flagsLastPlayerRank = -1;

function getFlagsLbRowHeight() {
  const panel = document.getElementById('flags-right-panel');
  if (!panel) return 84;
  // offsetWidth (no getBoundingClientRect): el rect viene escalado por el transform
  // del #app-stage y, al usarse como px de layout, se re-escalaría (entradas apretadas).
  return Math.round(panel.offsetWidth * 1.5) + FLAGS_LB_GAP;
}

function initFlagsLeaderboard() {
  const lb = document.getElementById('flags-leaderboard');
  lb.innerHTML = '';
  lb.classList.toggle('vs-active', _flagsSyncedVersus());
  flagsLbElements = {};
  flagsLastLbScore = -1;
  flagsLastPlayerRank = -1;
  flagsMockPlayers = buildFlagsFriendPlayers(); // refrescar con la lista real de amigos

  if (!window.practiceConfig || !window.practiceConfig.active) {
    flagsMockPlayers.forEach(p => {
      const el = document.createElement('div');
      el.className = 'lb-entry';
      el.id = `flags-lb-${p.id}`;
      el.innerHTML = `<span class="lb-rank rank-other"></span>`
        + (p.avatar
          ? `<div class="lb-avatar lb-avatar-img-wrap"><img class="lb-avatar-img" src="${p.avatar}" onerror="this.parentNode.innerHTML='${p.initial}';this.parentNode.style.background='${p.color}'"></div>`
          : `<div class="lb-avatar" style="background:${p.color}">${p.initial}</div>`)
        + `<span class="lb-name">${p.name}</span>`
        + `<span class="lb-score">${p.score.toLocaleString()}</span>`;
      el.style.transition = 'none';
      el.style.top = '-9999px';
      // Todas las filas traen su cardCode real ahora (mismo fix que
      // buildFriendPlayers/initLeaderboard en monuments.js) — antes los
      // amigos reales de la barra ingame en Gira Mundial solo se quedaban
      // afuera de este chequeo y siempre mostraban la carta default.
      window.CustomizeAssets?.applyCard(el, p.cardCode || '0001');
      flagsLbElements[el.id] = el;
      lb.appendChild(el);
    });
  }

  const playerEl = document.createElement('div');
  playerEl.className = 'lb-entry lb-player';
  playerEl.id = 'flags-lb-player';
  const _myNameFlags = window._sbProfile?.name || localStorage.getItem('playerName') || 'Tú';
  playerEl.innerHTML = `<span class="lb-rank rank-other"></span>`
                     + `<div class="lb-avatar"><img class="lb-avatar-img" src="${localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png'}"></div>`
                     + `<span class="lb-name">${_myNameFlags}</span>`
                     + `<span class="lb-score" id="flags-lb-player-score">0</span>`;
  playerEl.style.transition = 'none';
  playerEl.style.top = '-9999px';
  flagsLbElements['flags-lb-player'] = playerEl;
  lb.appendChild(playerEl);
  if (typeof window._applyFounderFrame === 'function') window._applyFounderFrame();

  requestAnimationFrame(() => {
    flagsPositionLeaderboard(0, false);
    requestAnimationFrame(() => {
      Object.values(flagsLbElements).forEach(el => {
        el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)';
      });
    });
  });
}

// Si la lista de amigos cambia (datos reales del servidor) mientras se juega flags,
// reconstruir su barra. Fuera de flags se reconstruye sola al iniciar la partida.
if (typeof onFriendsUpdate === 'function') {
  onFriendsUpdate(() => { if (flagsRunning && !_flagsSyncedVersus()) initFlagsLeaderboard(); });
}

function flagsPositionLeaderboard(playerScore, animate) {
  // Barra universal: el jugador compite con el puntaje acumulado de la campaña
  // (base de modos previos + modo actual), no solo con el de flags.
  playerScore += ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0);
  const lb   = document.getElementById('flags-leaderboard');
  const rowH = getFlagsLbRowHeight();
  lb.style.height = (FLAGS_LB_WINDOW * rowH - FLAGS_LB_GAP) + 'px';

  const all = [...flagsMockPlayers, { id: 'player', score: playerScore }];
  all.sort((a, b) => b.score - a.score);

  const playerRank = all.findIndex(p => p.id === 'player');

  // Emote automático de adelantamiento solo en modo normal (no en versus/lobby)
  if (!_flagsSyncedVersus() && animate && flagsLastPlayerRank !== -1 && playerRank < flagsLastPlayerRank) {
    let bubbleIndex = 0;
    for (let r = flagsLastPlayerRank; r >= playerRank + 1; r--) {
      const overtaken = all[r];
      if (overtaken && overtaken.id !== 'player') {
        const overtakenEl = flagsLbElements[`flags-lb-${overtaken.id}`];
        if (overtakenEl && typeof spawnEmoteBubble !== 'undefined') {
          setTimeout(() => spawnEmoteBubble(overtakenEl), 200 + bubbleIndex * 100);
          bubbleIndex++;
        }
      }
    }
  }
  flagsLastPlayerRank = playerRank;

  let windowStart = Math.max(0, playerRank - FLAGS_LB_PIN_ROW);
  let windowEnd   = Math.min(all.length, windowStart + FLAGS_LB_WINDOW);
  windowStart     = Math.max(0, windowEnd - FLAGS_LB_WINDOW);

  // Anclar las filas ABAJO: si hay menos filas que la ventana (p.ej. versus = 2),
  // empujarlas hacia el fondo en vez de dejarlas flotando arriba con hueco abajo.
  const visibleRows  = windowEnd - windowStart;
  const bottomOffset = Math.max(0, FLAGS_LB_WINDOW - visibleRows) * rowH;

  if (!animate) Object.values(flagsLbElements).forEach(el => { el.style.transition = 'none'; });

  all.forEach((p, rank) => {
    const el = flagsLbElements[`flags-lb-${p.id}`];
    if (el) el.style.top = ((rank - windowStart) * rowH + bottomOffset) + 'px';
  });

  // Actualizar número de posición en cada fila del leaderboard
  all.forEach((p, rank) => {
    const el = flagsLbElements[`flags-lb-${p.id}`];
    if (!el) return;
    const rankEl = el.querySelector('.lb-rank');
    if (!rankEl) return;
    rankEl.textContent = rank + 1;
    rankEl.className = 'lb-rank ' + (rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : 'rank-other');
  });

  const scoreEl = flagsLbElements['flags-lb-player']?.querySelector('.lb-score');
  if (scoreEl) scoreEl.textContent = playerScore.toLocaleString();
}

function sortFlagsLeaderboard(playerScore) {
  if (playerScore === flagsLastLbScore) return;
  flagsLastLbScore = playerScore;
  if (window.practiceConfig && window.practiceConfig.active) {
    const sc = playerScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0);
    const scoreEl = flagsLbElements['flags-lb-player']?.querySelector('.lb-score');
    if (scoreEl) scoreEl.textContent = sc.toLocaleString();
    return;
  }
  flagsPositionLeaderboard(playerScore, true);
}

// Versus: actualizar el score del oponente en el leaderboard y reordenar con animación
// (misma animación de adelantamiento/emotes que la barra de amigos normal).
function flagsSetVsOpponentScore(score) {
  window._vsOppScore = score;
  const opp = flagsMockPlayers.find(p => p.id === 'vsopp');
  if (!opp) return;
  opp.score = score;
  const el = flagsLbElements['flags-lb-vsopp'];
  if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = score.toLocaleString(); }
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, true);
}
window.flagsSetVsOpponentScore = flagsSetVsOpponentScore;

// Aplica glow + vibración + emote aleatorio a la tarjeta del jugador que falló.
// Ambas animaciones van en un solo style.animation inline; de lo contrario la cascada
// CSS deja correr solo la última, ignorando la otra.
function _applyWrongEffects(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
  setTimeout(() => { el.style.animation = ''; }, 820);
  // Emote aleatorio de los 6 disponibles
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
}

// Glow rojo solo en la tarjeta del rival (1v1).
window.flagsTriggerOpponentWrong = function() {
  _applyWrongEffects(flagsLbElements['flags-lb-vsopp']);
};

// Glow rojo en la tarjeta correcta para lobby: uid del que falló.
window.flagsTriggerLobbyWrongFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'flags-lb-player' : ('flags-lb-lob' + uid);
  _applyWrongEffects(flagsLbElements[key]);
};

// ── "Se acabó el tiempo" (timesup) — MISMO sistema que el "wrong" pero por
// timesup (temblor + cronómetro, ver window._applyTimesUpEffect).
window.flagsTriggerOpponentTimesUp = function() {
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(flagsLbElements['flags-lb-vsopp']);
};
window.flagsTriggerLobbyTimesUpFor = function(uid) {
  const myId = window._sbUserId;
  const key = (!uid || uid === myId) ? 'flags-lb-player' : ('flags-lb-lob' + uid);
  if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(flagsLbElements[key]);
};

// Lobby: refrescar el score en vivo de TODOS los rivales y reordenar con animación.
function flagsSetLobbyScores(members) {
  if (!Array.isArray(members)) return;
  members.forEach(m => {
    const p = flagsMockPlayers.find(x => x.id === 'lob' + m.id);
    if (p) {
      p.score = m.score || 0;
      const el = flagsLbElements['flags-lb-lob' + m.id];
      if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = (m.score || 0).toLocaleString(); }
    }
  });
  // Durante el espectador el leaderboard lo posiciona el renderer de
  // espectador (_renderGroupLeaderboard) — no el normal del jugador, que
  // pelearía por la misma posición y haría saltar las celdas (ver mismo fix
  // en monuments.js/citiesSetVsOpponentScore).
  if (window._isSpectating) { window._refreshGroupSpectatorLeaderboard?.(); return; }
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, true);
}
window.flagsSetLobbyScores = flagsSetLobbyScores;

function flagsSetLobbyDisconnected(uid, disconnected) {
  const el = flagsLbElements['flags-lb-lob' + uid];
  if (!el) return;
  if (disconnected) {
    el.classList.add('is-disconnected');
    if (!el.querySelector('.lb-disconnected-icon')) {
      const icon = document.createElement('div');
      icon.className = 'lb-disconnected-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 2.5 5.09 3.91l2.59 2.59-2.09 2.09A3.003 3.003 0 0 0 6 14.83V17H4v2h2v2h2v-2h2v-2h.17c.93 0 1.76-.37 2.37-.96l-.01-.01 2.06 2.06 1.41-1.41-9.5-9.5zm1.59 9.09A1.003 1.003 0 0 1 8 10.83V9.41l1.5 1.5-.41.68H8.09zm5.72 1.64-.01-.01c.13-.29.2-.61.2-.93V9.17c0-.93-.37-1.76-.96-2.37L11.66 5h2.59L19 9.75l-3.17 3.17.02.01zM19.07 4.93l-1.41 1.42L19 7.68l1.5-1.5-1.43-1.25z"/></svg>';
      el.appendChild(icon);
    }
  } else {
    el.classList.remove('is-disconnected');
    el.querySelector('.lb-disconnected-icon')?.remove();
  }
}
window.flagsSetLobbyDisconnected = flagsSetLobbyDisconnected;

window.flagsSetVsDisconnected = function(disconnected) {
  const el = flagsLbElements['flags-lb-vsopp'];
  if (!el) return;
  if (disconnected) {
    el.classList.add('is-disconnected');
    if (!el.querySelector('.lb-disconnected-icon')) {
      const icon = document.createElement('div');
      icon.className = 'lb-disconnected-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 2.5 5.09 3.91l2.59 2.59-2.09 2.09A3.003 3.003 0 0 0 6 14.83V17H4v2h2v2h2v-2h2v-2h.17c.93 0 1.76-.37 2.37-.96l-.01-.01 2.06 2.06 1.41-1.41-9.5-9.5zm1.59 9.09A1.003 1.003 0 0 1 8 10.83V9.41l1.5 1.5-.41.68H8.09zm5.72 1.64-.01-.01c.13-.29.2-.61.2-.93V9.17c0-.93-.37-1.76-.96-2.37L11.66 5h2.59L19 9.75l-3.17 3.17.02.01zM19.07 4.93l-1.41 1.42L19 7.68l1.5-1.5-1.43-1.25z"/></svg>';
      el.appendChild(icon);
    }
  } else {
    el.classList.remove('is-disconnected');
    el.querySelector('.lb-disconnected-icon')?.remove();
  }
};

const flagsProgressContainer = document.getElementById('flags-progress-dots');
const flagsProgressDots      = flagsProgressContainer ? flagsProgressContainer.querySelectorAll('.dot') : [];
const FLAGS_DOTS_NEEDED = 10;
const FLAGS_BONUS_TIME  = 5;
let flagsDots = 0;

function flagsUpdateDotsUI() {
  flagsProgressDots.forEach((d, i) => d.classList.toggle('filled', i < flagsDots));
}

function flagsAdvanceDot() {
  if (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0) return;
  flagsDots++;
  flagsUpdateDotsUI();

  if (flagsDots >= FLAGS_DOTS_NEEDED && !flagsProgressContainer.classList.contains('train-animation')) {
    flagsProgressContainer.classList.add('train-animation');

    const _flagsInfNow = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
    if (!_flagsInfNow) {
      // Ajustar flagsTimerDuration (fuente de verdad, ver startFlagsTimer), no
      // flagsTimeLeft directo — si no, el próximo tick lo pisaría con el
      // valor calculado contra flagsTimerStartedAt, perdiendo el bonus.
      const elapsed = Math.floor((Date.now() - flagsTimerStartedAt) / 1000);
      const newTimeLeft = Math.min(flagsTimeLeft + FLAGS_BONUS_TIME, 99);
      flagsTimerDuration = elapsed + newTimeLeft;
      flagsTimeLeft = newTimeLeft;
      flagsTimerEl.textContent = flagsTimeLeft;
    }
    if (typeof playTimeBonus === 'function') playTimeBonus(document.getElementById('flags-time-bonus'), FLAGS_BONUS_TIME);
    const prevColor = flagsTimerEl.style.color;
    flagsTimerEl.style.color = '#00ff88';

    setTimeout(() => {
      flagsProgressContainer.classList.add('dots-fade-out');
      setTimeout(() => {
        flagsDots = Math.max(0, flagsDots - FLAGS_DOTS_NEEDED);
        flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
        flagsUpdateDotsUI();
        if (flagsTimeLeft > 0 && flagsTimeLeft <= 10) {
          flagsTimerEl.style.color = '#ffffff';
          flagsTimerImg.src = 'images/countdownred2.png';
        } else if (flagsTimeLeft > 10) {
          flagsTimerEl.style.color = prevColor;
          flagsTimerImg.src = 'images/countdown2.png';
        }
      }, 500);
    }, 2000);
  }
}

function flagsAnimateScore() {
  if (flagsScoreRafId) return;
  let last = null;
  function tick(ts) {
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    const diff = flagsScore - flagsDisplayedScore;
    if (diff <= 0) { flagsScoreRafId = null; return; }
    flagsDisplayedScore = Math.min(flagsScore, flagsDisplayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    flagsScoreEl.textContent = (flagsDisplayedScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
    flagsScoreRafId = requestAnimationFrame(tick);
  }
  flagsScoreRafId = requestAnimationFrame(tick);
}

function getFlagsRoundPoints(streak) {
  if (streak >= 15) return 120;
  if (streak >= 10) return 60;
  if (streak >= 5)  return 35;
  if (streak >= 2)  return 15;
  return 10;
}

function showFlagsBadge(badgeImg, bonus, streak, cxOverride, scaleOverride) {
  const canvas = document.getElementById('flags-badge-canvas');
  if (!canvas) return;
  canvas.width  = window.STAGE_W;
  canvas.height = window.STAGE_H;
  canvas.style.display = 'block';
  const ctx2 = canvas.getContext('2d');
  const CX = cxOverride !== undefined ? cxOverride : canvas.width / 2, CY = (scaleOverride !== undefined ? canvas.height * 0.44 : canvas.height / 2);
  // Medidas en vmin (px = valor_vmin * vmin) para que escale con el viewport.
  const vmin = Math.min(window.STAGE_W, window.STAGE_H) / 100;
  const W = 44.5 * vmin, H = 36.6 * vmin, CW = 52.4 * vmin, CH = 44.5 * vmin;
  const IN_END = 0.2, HOLD_END = 0.60, SHRINK_DUR = 0.22, TOTAL = HOLD_END + SHRINK_DUR;
  const BZ_IN = 0.18, BZ_HOLD = 0.42, BZ_OUT = 0.72;
  const strokeColor = typeof getBadgeStrokeColor !== 'undefined' ? getBadgeStrokeColor(streak) : '#623103';
  const bonusLabel = bonus > 0 ? `+${bonus}` : '';
  let t = 0, last = null, rafId;

  setTimeout(() => { if (typeof sfxBonus !== 'undefined') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); } }, 800);

  function frame(ts) {
    if (!last) last = ts;
    t += (ts - last) / 1000;
    last = ts;
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    if (t >= TOTAL) { canvas.style.display = 'none'; return; }

    const sxMult = scaleOverride !== undefined ? scaleOverride : 1;
    let alpha, scale;
    if      (t < IN_END)   { scale = (0.25 + (t / IN_END) * 0.75) * sxMult; alpha = 1; }
    else if (t < HOLD_END) { scale = 1 * sxMult; alpha = 1; }
    else                   { const p = (t - HOLD_END) / SHRINK_DUR; scale = (1 - p) * sxMult; alpha = 1; }

    // El check ya lo muestra flags-check-overlay en cada respuesta; aquí solo
    // dibujamos el badge + "IN A ROW" + bonus para no duplicar el check.

    // +bonus
    let bonusScale = 0;
    if      (t < BZ_IN)   bonusScale = t / BZ_IN;
    else if (t < BZ_HOLD) bonusScale = 1;
    else if (t < BZ_OUT)  bonusScale = 1 - (t - BZ_HOLD) / (BZ_OUT - BZ_HOLD);
    if (bonusScale > 0 && bonusLabel) {
      const bCY = CY + CH / 2 + 2.2 * vmin;
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.translate(CX, bCY);
      ctx2.scale(bonusScale, bonusScale);
      ctx2.font = `${11.4 * vmin}px Dimbo, "Arial Black", sans-serif`;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.strokeStyle = '#073A79'; ctx2.lineWidth = 1.54 * vmin;
      ctx2.strokeText(bonusLabel, 0, 0);
      ctx2.strokeStyle = '#FD9C1A'; ctx2.lineWidth = 0.77 * vmin;
      ctx2.strokeText(bonusLabel, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillText(bonusLabel, 0, 0);
      ctx2.restore();
    }

    // badge + IN A ROW
    if (badgeImg) {
      ctx2.save();
      ctx2.globalAlpha = alpha;
      ctx2.translate(CX + 3.3 * vmin, CY - 3.3 * vmin);
      ctx2.scale(scale, scale);
      ctx2.drawImage(badgeImg, -W / 2, -H / 2, W, H);
      ctx2.font = `bold ${7.4 * vmin}px Fredoka, sans-serif`;
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.scale(1, 1.2);
      ctx2.strokeStyle = strokeColor; ctx2.lineWidth = 1.21 * vmin;
      ctx2.strokeText(`${streak} IN A ROW`, 0, 0);
      ctx2.fillStyle = '#ffffff'; ctx2.fillText(`${streak} IN A ROW`, 0, 0);
      ctx2.restore();
    }

    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

function startFlagsRoundRecording() {
  const REC_SLOTS = ['Reino Unido', 'Brasil', 'Italia'];

  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.classList.add('scrolling');

  flagsFlagidLabel.textContent         = 'Italy';
  flagsFlagidLabel.style.fontSize      = '4.2cqmin';
  flagsFlagidLabel.style.letterSpacing = '';

  flagsTopGroupIds.forEach((id, i) => {
    const group = document.getElementById(id);
    if (!group) return;
    group.style.display       = '';
    group.style.opacity       = '';
    group.style.pointerEvents = 'auto';
    group.style.cursor        = 'pointer';
    group.classList.remove('luggage-enter-active');
    void group.offsetWidth;
    group.classList.add('luggage-enter-active');

    const imgId = flagsSlotImgIds[id];
    const img   = document.getElementById(imgId);
    if (img) { img.src = COUNTRY_FLAGS[REC_SLOTS[i]] || ''; img.style.display = 'block'; }
  });

  let picked = false;
  flagsTopGroupIds.forEach(id => {
    const group = document.getElementById(id);
    if (!group) return;
    group.onclick = () => {
      if (!flagsRunning || picked) return;
      picked = true;
      // Disable further clicks
      flagsTopGroupIds.forEach(gid => {
        const g = document.getElementById(gid);
        if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
      });
      // Igual que el juego real: freeze inmediato + translate hacia findluggage
      group.classList.remove('luggage-enter-active');
      group.style.animation = 'none';
      group.style.transition = 'none';
      group.style.transform  = 'none';
      group.style.transformOrigin = '0 0';
      void group.offsetWidth;
      // Ver handler real: centrar el maletín sobre findluggage e igualar su tamaño.
      const lugImg    = group.querySelector('#flags-luggage, .flags-luggage-side');
      const lugRect   = (lugImg || group).getBoundingClientRect();
      const grpRect   = group.getBoundingClientRect();
      const findRect  = flagsFindLuggage.getBoundingClientRect();
      const lugScale  = flagsLuggageWrap.getBoundingClientRect().width / 220;
      const fit = lugRect.width ? (findRect.width / lugRect.width) : 1;
      const lugCx  = (lugRect.left + lugRect.width  / 2 - grpRect.left) / lugScale;
      const lugCy  = (lugRect.top  + lugRect.height / 2 - grpRect.top)  / lugScale;
      const findCx = (findRect.left + findRect.width  / 2 - grpRect.left) / lugScale;
      const findCy = (findRect.top  + findRect.height / 2 - grpRect.top)  / lugScale;
      const dx = findCx - fit * lugCx;
      const dy = findCy - fit * lugCy;
      group.style.willChange = 'transform';                 // capa GPU (suaviza iOS)
      group.style.transformOrigin = '0 0';
      group.style.transition = 'transform 0.1s linear';
      group.style.transform  = `translate3d(${dx}px, ${dy}px, 0) scale(${fit})`;
      flagsMachine2.style.animationPlayState     = 'paused';
      flagsMachine3.style.animationPlayState     = 'paused';
      flagsMachine3b.style.animationPlayState    = 'paused';
      flagsFindLuggage.style.animationPlayState  = 'paused';
    };
  });
}

function startFlagsRound() {
  if (document.body.classList.contains('recording-mode')) {
    return startFlagsRoundRecording();
  }
  // Versus: la dificultad/desbloqueos se rigen por el índice de ronda COMPARTIDO,
  // no por los aciertos individuales, así ambos jugadores ven la MISMA bandera en
  // la misma ronda aunque uno vaya ganando.
  if (_flagsSyncedVersus()) {
    flagsIsFirstRound   = flagsVsIndex === 0;
    flagsEasyUnlocked   = flagsVsIndex >= 1;
    flagsSixUnlocked    = flagsVsIndex >= 3;
    flagsMediumUnlocked = flagsVsIndex >= 10;
    flagsHardUnlocked   = flagsVsIndex >= 20;
    flagsInsaneUnlocked = flagsVsIndex >= 30;
    flagsGroupIds = flagsSixUnlocked
      ? [...flagsTopGroupIds, ...flagsBottomGroupIds]
      : flagsTopGroupIds.slice();
  }
  // Reset findluggage to initial position and restart scroll animation
  flagsFindLuggage.style.transition = '';
  flagsFindLuggage.style.animation  = 'none';
  flagsFindLuggage.style.transform  = '';
  flagsFindLuggage.classList.remove('scrolling');
  void flagsFindLuggage.offsetWidth;
  flagsFindLuggage.style.animation  = '';
  flagsFindLuggage.classList.add('scrolling');

  // Si la animación termina sin que se haya seleccionado nada → wrong
  const onFindLuggageEnd = () => {
    flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
    clearTimeout(flagsRoundFallbackTimeout);
    clearFlagsElimination();
    if (!flagsRunning) return;
    flagsPicked = true; // bloquear clicks hasta la siguiente pregunta
    // Simular wrong: misma lógica que click incorrecto
    flagsGroupIds.forEach(gid => {
      const g = document.getElementById(gid);
      if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
    });
    flagsStreak = 0;
    flagsIsFirstRound = false;
    flagsWrongCount++;
    if (typeof sfxError !== 'undefined') { sfxError.currentTime = 0; sfxPlay(sfxError); }
    // Wrong automático por tiempo (no hubo click) — el espectador no tiene un
    // índice de maletín para animar, solo el flash de error.
    // + campaignBase(): el espectador no tiene forma propia de saber cuánto
    // acumuló el jugador en modos anteriores de la campaña — sin sumarlo acá,
    // veía el puntaje arrancar de 0 en cada modo en vez de seguir sumando.
    if (typeof window._specReportAnswer === 'function') window._specReportAnswer(false, Math.round(flagsScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)), { index: -1, timeout: true });
    if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(false, Math.round(flagsScore));
    const overlay = document.getElementById('flags-wrong-overlay');
    if (overlay) {
      overlay.classList.remove('animate');
      void overlay.offsetWidth;
      overlay.classList.add('animate');
      setTimeout(() => {
        overlay.classList.remove('animate');
        if (!flagsRunning) return;
        const allGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
        allGroupIds.forEach(gid => {
          const g = document.getElementById(gid);
          if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.transformOrigin = ''; g.style.opacity = '0'; g.style.willChange = ''; }
        });
        setTimeout(() => {
          if (!flagsRunning) return;
          if (document.body.classList.contains('recording-mode')) return;
          allGroupIds.forEach(gid => {
            const g = document.getElementById(gid);
            if (g) g.style.opacity = '';
          });
          if (!flagsSixUnlocked) {
            flagsBottomGroupIds.forEach(id => {
              const g = document.getElementById(id);
              if (g) g.style.display = 'none';
            });
          }
          if (window.practiceConfig && window.practiceConfig.active && flagsPracticeRemaining.length > 1) {
            const others = flagsPracticeRemaining.filter(x => x !== flagsPracticeCurrent);
            flagsPracticeCurrent = others[Math.floor(Math.random() * others.length)];
          }
          startFlagsRound();
        }, 50);
      }, 750);
    }
  };
  flagsFindLuggage.addEventListener('animationend', onFindLuggageEnd);
  // Respaldo por reloj real (mismo patrón que _flagsTimerTick con
  // Date.now()): esta ventana de 8.15s por pregunta depende ÚNICAMENTE del
  // evento animationend de findluggage-scroll para avanzar — a diferencia
  // del timer general del juego, no tenía ningún respaldo. Si ese evento no
  // llega bien al volver de una pestaña en 2do plano (reanudación de
  // animaciones CSS/compositor), la pregunta quedaba congelada para siempre
  // sin ningún aviso visual (reportado: "vuelvo y el juego no responde, se
  // ve todo normal"). Con este timeout de respaldo, si por lo que sea el
  // evento nunca llega, se fuerza el mismo camino de "wrong por tiempo" a
  // los pocos ms de que debería haber terminado.
  clearTimeout(flagsRoundFallbackTimeout);
  flagsRoundFallbackTimeout = setTimeout(() => {
    flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
    onFindLuggageEnd();
  }, FLAGS_ROUND_TIME * 1000 + 600);

  const _practiceContFilter = c => {
    if (!window.practiceConfig || !window.practiceConfig.active) return true;
    return window.practiceConfig.continents.has(FLAG_COUNTRY_CONTINENT[c]);
  };
  let inicioCountries  = (COUNTRIES.inicio  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  let easyCountries    = (COUNTRIES.easy    || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const mediumCountries  = (COUNTRIES.medium  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const hardCountries    = (COUNTRIES.hard    || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  const insaneCountries  = (COUNTRIES.insane  || []).filter(c => COUNTRY_FLAGS[c] && _practiceContFilter(c));
  // Fallback: si el continente tiene pocas banderas inicio, rellenar con easy sin filtro
  if (window.practiceConfig && window.practiceConfig.active && inicioCountries.length < 3) {
    const easyAll = (COUNTRIES.easy || []).filter(c => COUNTRY_FLAGS[c] && !inicioCountries.includes(c));
    inicioCountries = [...inicioCountries, ...easyAll].slice(0, Math.max(inicioCountries.length + easyAll.length, 6));
  }
  if (window.practiceConfig && window.practiceConfig.active && easyCountries.length < 3) {
    const easyAll = (COUNTRIES.easy || []).filter(c => COUNTRY_FLAGS[c] && !easyCountries.includes(c));
    easyCountries = [...easyCountries, ...easyAll];
  }

  const easyInitPool = [...inicioCountries, ...easyCountries];
  const fullPool = flagsIsFirstRound
    ? inicioCountries
    : flagsInsaneUnlocked
      ? [...easyInitPool, ...mediumCountries, ...hardCountries, ...insaneCountries]
      : flagsHardUnlocked
        ? [...easyInitPool, ...mediumCountries, ...hardCountries]
        : flagsMediumUnlocked
          ? [...easyInitPool, ...mediumCountries]
          : flagsEasyUnlocked
            ? easyInitPool
            : inicioCountries;

  const excluded = c => flagsAnswered.has(c) || c === flagsLastChosen;

  function weightedPick(partsA, poolA, partsB, poolB) {
    const avA = poolA.filter(c => !excluded(c));
    const avB = poolB.filter(c => !excluded(c));
    let wp = [...Array(partsA).fill(avA).flat(), ...Array(partsB).fill(avB).flat()];
    if (!wp.length) {
      flagsAnswered.clear();
      const rA = poolA.filter(c => c !== flagsLastChosen);
      const rB = poolB.filter(c => c !== flagsLastChosen);
      wp = [...Array(partsA).fill(rA).flat(), ...Array(partsB).fill(rB).flat()];
    }
    if (!wp.length) wp = fullPool;
    return wp[Math.floor(flagsRand() * wp.length)];
  }

  // En versus/lobby la curva de dificultad la marca el índice de ronda compartido.
  const selCount = _flagsSyncedVersus() ? flagsVsIndex : flagsCorrectCount;

  let chosen;
  if (window.practiceConfig && window.practiceConfig.active) {
    if (!flagsPracticeCurrent || flagsPracticeRemaining.length === 0) {
      clearInterval(flagsTimerIntervalId);
      flagsRunning = false;
      clearFlagsElimination();
      disableAllLuggageGroups();
      flagsLuggageWrap.classList.add('flags-game-ended');
      if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
      if (typeof window._specReportTimesUp === 'function') window._specReportTimesUp();
      endFlagsGame();
      return;
    }
    chosen = flagsPracticeCurrent;
  } else if (flagsInsaneUnlocked) {
    // insane vs hard+lower — 1:5 at 30 → 5:1 at 50
    const insaneParts = Math.min(Math.floor((selCount - 30) / 5) + 1, 5);
    const lowerParts  = Math.max(6 - insaneParts, 1);
    const lowerPool   = [...easyInitPool, ...mediumCountries, ...hardCountries];
    chosen = weightedPick(insaneParts, insaneCountries, lowerParts, lowerPool);
  } else if (flagsHardUnlocked) {
    // hard vs medium+easy+inicio — 1:5 at 20 → 5:1 at 40
    const hardParts  = Math.min(Math.floor((selCount - 20) / 5) + 1, 5);
    const lowerParts = Math.max(6 - hardParts, 1);
    const lowerPool  = [...easyInitPool, ...mediumCountries];
    chosen = weightedPick(hardParts, hardCountries, lowerParts, lowerPool);
  } else if (flagsMediumUnlocked) {
    // medium vs easy+inicio
    // 1:5 at 10 correct → 5:1 at 22 correct
    const mediumParts = Math.min(Math.floor((selCount - 10) / 3) + 1, 5);
    const easyParts   = Math.max(6 - mediumParts, 1);
    chosen = weightedPick(mediumParts, mediumCountries, easyParts, easyInitPool);
  } else {
    let chosenPool = fullPool.filter(c => !excluded(c));
    if (!chosenPool.length) { flagsAnswered.clear(); chosenPool = fullPool.filter(c => c !== flagsLastChosen); }
    if (!chosenPool.length) chosenPool = fullPool;
    // Fallback final: si el continente no tiene nada, usar easy global
    if (!chosenPool.length) {
      chosenPool = [...(COUNTRIES.inicio || []), ...(COUNTRIES.easy || [])].filter(c => COUNTRY_FLAGS[c]);
    }
    chosen = chosenPool[Math.floor(flagsRand() * chosenPool.length)];
  }
  if (!chosen) return; // pool completamente vacía, no iniciar ronda
  flagsLastChosen = chosen;
  // Versus: registrar la bandera mostrada y avanzar el índice compartido, así la
  // lista de exclusión y la dificultad quedan idénticas en todos los clientes.
  const _flagsRoundIdx = flagsVsIndex;
  if (_flagsSyncedVersus()) { flagsAnswered.add(chosen); flagsVsIndex++; }
  flagsFlagidLabel.textContent = (typeof tCountry === 'function') ? tCountry(chosen) : chosen;
  // Ajustar tamaño si el nombre es largo. Todo en vmin para escalar con el
  // viewport igual que la imagen de flagid (49.4cqmin); maxW = 41.7cqmin en px.
  const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
  const maxW = 41.7 * vminPx;
  let fs = 4.2;
  flagsFlagidLabel.style.fontSize = fs + 'cqmin';
  flagsFlagidLabel.style.letterSpacing = '';
  while (flagsFlagidLabel.scrollWidth > maxW && fs > 1.8) {
    fs -= 0.22;
    flagsFlagidLabel.style.fontSize = fs + 'cqmin';
    if (fs < 3.3) flagsFlagidLabel.style.letterSpacing = '-1px';
    if (fs < 2.4) flagsFlagidLabel.style.letterSpacing = '-2px';
  }

  // Distractors: prefer visually similar flags from correcta 23 onward
  const _inPractice = window.practiceConfig && window.practiceConfig.active;
  const _practiceContFilter2 = _inPractice
    ? c => COUNTRY_FLAGS[c] && window.practiceConfig.continents.has(FLAG_COUNTRY_CONTINENT[c])
    : () => true;
  const useSimilar = !_inPractice && selCount >= 35 && FLAG_SIMILAR[chosen];
  const similarAvailable = useSimilar
    ? [...(FLAG_SIMILAR[chosen] || [])].filter(c => COUNTRY_FLAGS[c] && c !== chosen)
    : [];
  // Build distractor base: in practice, limit to unlocked tiers (same as pick logic)
  let _distractorBase;
  if (_inPractice) {
    const _dUnlocked = ['inicio'];
    const _diff2 = (window.practiceConfig && window.practiceConfig.difficulty) || 'dificil';
    if (flagsEasyUnlocked   && _diff2 !== 'inicio')                          _dUnlocked.push('easy');
    if (flagsMediumUnlocked && (_diff2 === 'medio' || _diff2 === 'dificil')) _dUnlocked.push('medium');
    if (flagsHardUnlocked   && _diff2 === 'dificil')                         _dUnlocked.push('hard');
    if (flagsInsaneUnlocked && _diff2 === 'dificil')                         _dUnlocked.push('insane');
    const _dSet = new Set(_dUnlocked.flatMap(t => COUNTRIES[t] || []));
    _distractorBase = flagsPracticePool.filter(c => _dSet.has(c));
    // Expand to next tiers if too few for slot count
    const ALL_TIERS = ['inicio', 'easy', 'medium', 'hard', 'insane'];
    for (const tier of ALL_TIERS) {
      if (_distractorBase.length >= flagsGroupIds.length + 2) break;
      if (_dUnlocked.includes(tier)) continue;
      (COUNTRIES[tier] || []).forEach(c => { if (COUNTRY_FLAGS[c] && !_dSet.has(c)) { _dSet.add(c); if (flagsPracticePool.includes(c)) _distractorBase.push(c); } });
    }
    if (_distractorBase.length < flagsGroupIds.length) _distractorBase = flagsPracticePool;
  } else {
    _distractorBase = fullPool;
  }
  const nonsimilar = flagsShuffle(_distractorBase.filter(c => c !== chosen && !similarAvailable.includes(c)));
  flagsShuffle(similarAvailable);
  // Fill distractors with similars first, then pad with filtered pool, then pad with easy (continent-filtered in practice)
  let distractorPool = [...similarAvailable, ...nonsimilar];
  if (distractorPool.length < flagsGroupIds.length - 1) {
    const fallbackBase = _inPractice
      ? _distractorBase
      : [...(COUNTRIES.inicio || []), ...(COUNTRIES.easy || [])];
    const globalEasy = flagsShuffle(fallbackBase
      .filter(c => COUNTRY_FLAGS[c] && c !== chosen && !distractorPool.includes(c) && _practiceContFilter2(c)));
    distractorPool = [...distractorPool, ...globalEasy];
  }

  const slotCount = flagsGroupIds.length;
  const correctSlot = Math.floor(flagsRand() * slotCount);
  // Orden de eliminación progresiva — calculado ACÁ (no más abajo) para poder
  // incluirlo en el broadcast de ronda y que el espectador desvanezca las
  // mismas opciones en el mismo momento que el jugador real.
  const wrongSlots = [];
  for (let s = 0; s < slotCount; s++) if (s !== correctSlot) wrongSlots.push(s);
  flagsShuffle(wrongSlots);

  // Apply six-mode layout before animations so positions are correct when luggages drop
  if (flagsSixUnlocked) flagsLuggageWrap.classList.add('flags-six-mode');

  // Preparar grupos y asignar banderas
  const activeGroupIds = flagsSixUnlocked
    ? [...flagsTopGroupIds, ...flagsBottomGroupIds]
    : flagsTopGroupIds;

  // Assign flags to slots primero — src antes de la animación para que el decode
  // ocurra concurrente con la caída (200ms de animación es suficiente margen).
  const _flagsSlotCountries = [];
  flagsGroupIds.forEach((id, i) => {
    const imgId = flagsSlotImgIds[id];
    const img = document.getElementById(imgId);
    const country = i === correctSlot ? chosen : (distractorPool[i < correctSlot ? i : i - 1] || '');
    _flagsSlotCountries[i] = country;
    if (!img) return;
    img.src = COUNTRY_FLAGS[country] || '';
    img.style.display = 'block';
    if (img.decode) img.decode().catch(() => {}); // fire-and-forget: precalienta textura GPU
  });
  // Modo espectador: anunciar la ronda (opciones + respuesta correcta) antes de
  // que el jugador conteste, para que quien mira vea lo mismo en tiempo real.
  if (typeof window._specReportRound === 'function') {
    // roundStartedAt: reloj de pared de cuando arranca ESTA ronda — el
    // espectador lo usa para calcular cuánto tiempo de la ventana de 8.15s
    // ya pasó al momento de recibir/reprocesar este round (ver
    // flagsSpectatorShowRound), y aplicar la eliminación progresiva ya
    // avanzada en vez de arrancarla de cero. Sin esto, alguien que entra a
    // mitad de ronda (ej. _enterWaitAsSpectator, o VS._resendStateTo
    // reenviando este mismo payload a un espectador que se conectó tarde)
    // veía las 6 opciones intactas aunque el jugador real ya tuviera solo 2
    // por lo poco que quedaba de ronda (el "cuando yo veo 6, mi rival en
    // verdad tiene 2" reportado).
    window._specReportRound({ index: _flagsRoundIdx, mode: 'flags', prompt: chosen, correctSlot, options: _flagsSlotCountries, eliminationOrder: wrongSlots.slice(), timeLeft: flagsTimeLeft, roundStartedAt: Date.now() });
  }

  // Iniciar animación en el siguiente frame: el browser commitió la remoción de
  // luggage-enter-active en el frame anterior (no se necesita void offsetWidth).
  activeGroupIds.forEach(id => {
    const group = document.getElementById(id);
    if (!group) return;
    group.style.display = '';
    group.style.pointerEvents = 'auto';
    group.style.cursor = 'pointer';
    group.classList.remove('flags-faded', 'luggage-enter-active');
  });
  requestAnimationFrame(() => {
    if (!flagsRunning) return;
    activeGroupIds.forEach(id => {
      const group = document.getElementById(id);
      if (group) group.classList.add('luggage-enter-active');
    });
  });

  flagsRoundStartTime = performance.now() + 200; // empieza a contar tras la animación de entrada

  let flagsPicked = false;
  // findluggage scrollea en X. En iOS el click llega ~300ms tarde (lag de toque) y
  // para entonces findluggage ya se corrió → el maletín caía a una X posterior. Lo
  // congelamos en pointerdown (toque real, inmediato). Solo afecta X; la Y no cambia
  // porque findluggage no se mueve en vertical.
  let flagsTapFindRect = null;

  // ── Eliminación progresiva de opciones erróneas ───────────────────────────────
  // 6 opciones: cada 1/3 del tiempo se desvanecen 2 erróneas (0.3s) y quedan
  //             deseleccionables, hasta dejar solo 2 (correcta + 1 errónea).
  // 3 opciones: a la 1/2 del tiempo se desvanece 1 errónea, dejando 2.
  clearFlagsElimination();
  const fadeSlot = (slotIdx) => {
    const g = document.getElementById(flagsGroupIds[slotIdx]);
    if (g) { g.classList.add('flags-faded'); g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
  };
  const roundMs = FLAGS_ROUND_TIME * 1000;
  if (slotCount >= 6) {
    [1, 2].forEach(step => {
      const slice = wrongSlots.slice((step - 1) * 2, step * 2);
      flagsEliminationTimeouts.push(setTimeout(() => {
        if (!flagsRunning || flagsPicked) return;
        slice.forEach(fadeSlot);
      }, roundMs * step / 3));
    });
  } else if (slotCount === 3) {
    flagsEliminationTimeouts.push(setTimeout(() => {
      if (!flagsRunning || flagsPicked) return;
      fadeSlot(wrongSlots[0]);
    }, roundMs / 2));
  }

  flagsGroupIds.forEach((id, i) => {
    const group = document.getElementById(id);
    if (!group) return;
    // pointerup = al SOLTAR el maletín, inmediato en iOS (sin los 300ms del click).
    // Congela findluggage Y ejecuta la acción en el mismo evento.
    group.onpointerup = (ev) => {
      if (!flagsRunning || flagsPicked || group.classList.contains('flags-faded')) return;
      ev.preventDefault(); // evita que dispare click posterior en iOS
      // En iOS el compositor anima findluggage de forma asíncrona: pausar la animación
      // y forzar reflow no es suficiente para sincronizar la posición visual cuando el
      // usuario responde muy rápido (el layout devuelve la X base, no la X animada).
      // Solución: capturar la matrix exacta del compositor con getComputedStyle ANTES
      // de tocar nada, luego fijar el transform inline → getBCR refleja la X real.
      const _fmat = new DOMMatrix(window.getComputedStyle(flagsFindLuggage).transform);
      flagsFindLuggage.classList.remove('scrolling');
      flagsFindLuggage.style.animation  = 'none';
      flagsFindLuggage.style.transition = 'none';
      flagsFindLuggage.style.transform  = `matrix(${_fmat.a},${_fmat.b},${_fmat.c},${_fmat.d},${_fmat.e},${_fmat.f})`;
      flagsMachine2.style.animationPlayState  = 'paused';
      flagsMachine3.style.animationPlayState  = 'paused';
      flagsMachine3b.style.animationPlayState = 'paused';
      flagsTapFindRect = flagsFindLuggage.getBoundingClientRect(); // getBCR fuerza layout — void offsetWidth innecesario
      // Diferir el trabajo pesado al siguiente frame: el browser pinta el estado
      // congelado inmediatamente y el main thread queda libre para el compositor.
      requestAnimationFrame(handleLuggagePick);
    };
    function handleLuggagePick() {
      if (!flagsRunning || flagsPicked || group.classList.contains('flags-faded')) return;
      flagsPicked = true;
      clearFlagsElimination();
      flagsFindLuggage.removeEventListener('animationend', onFindLuggageEnd);
      // Animate selected luggage toward findluggage position
      // Resetear a posición BASE (sin transform/transición) ANTES de medir: en iOS
      // la animación de entrada dejaba un transform residual y medíamos corrido →
      // el maletín quedaba descolocado "a veces". Así medimos siempre la base real.
      group.classList.remove('luggage-enter-active');
      group.style.animation  = 'none';
      group.style.transition = 'none';
      group.style.transform  = 'none';
      group.style.transformOrigin = '0 0';
      // getBCR fuerza layout y commitea el reset (sin void offsetWidth).
      // Las medidas se calculan aquí; la transición se aplica en el siguiente rAF
      // para que el browser haya pintado transform:none antes de arrancar la animación.
      const lugImg    = group.querySelector('#flags-luggage, .flags-luggage-side');
      const lugRect   = (lugImg || group).getBoundingClientRect();
      const grpRect   = group.getBoundingClientRect();
      const findRect  = flagsTapFindRect || flagsFindLuggage.getBoundingClientRect();
      flagsTapFindRect = null;
      const lugScale  = flagsLuggageWrap.getBoundingClientRect().width / 220;
      const fit = lugRect.width ? (findRect.width / lugRect.width) : 1;
      const lugCx  = (lugRect.left + lugRect.width  / 2 - grpRect.left) / lugScale;
      const lugCy  = (lugRect.top  + lugRect.height / 2 - grpRect.top)  / lugScale;
      const findCx = (findRect.left + findRect.width  / 2 - grpRect.left) / lugScale;
      const findCy = (findRect.top  + findRect.height / 2 - grpRect.top)  / lugScale;
      let dx = findCx - fit * lugCx;
      let dy = findCy - fit * lugCy;
      group.style.willChange = 'transform';
      group.style.transformOrigin = '0 0';
      // Siguiente frame: transform:none ya está pintado → la transition anima limpio
      requestAnimationFrame(() => {
        group.style.transition = 'transform 0.1s linear';
        group.style.transform  = `translate3d(${dx}px, ${dy}px, 0) scale(${fit})`;
      });
      flagsMachine2.style.animationPlayState = 'paused';
      flagsMachine3.style.animationPlayState = 'paused';
      flagsMachine3b.style.animationPlayState = 'paused';
      flagsFindLuggage.style.animationPlayState = 'paused';
      setTimeout(() => {
        if (document.body.classList.contains('recording-mode')) return;
        flagsMachine2.style.animationPlayState = 'running';
        flagsMachine3.style.animationPlayState = 'running';
        flagsMachine3b.style.animationPlayState = 'running';
        // Freeze findluggage at its current paused position then whoosh -900px
        const mat = new DOMMatrix(window.getComputedStyle(flagsFindLuggage).transform);
        flagsFindLuggage.classList.remove('scrolling');
        flagsFindLuggage.style.transform = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e},${mat.f})`;
        void flagsFindLuggage.offsetWidth;
        flagsFindLuggage.style.transition = 'transform 0.15s linear';
        flagsFindLuggage.style.transform  = `matrix(${mat.a},${mat.b},${mat.c},${mat.d},${mat.e - 1000},${mat.f})`;
        // Whoosh selected group -1000px from findluggage position
        if (!document.body.classList.contains('recording-mode')) {
          group.style.transition = 'transform 0.15s linear';
          group.style.transform  = `translate3d(${dx - 1000 / lugScale}px, ${dy}px, 0) scale(${fit})`;
        }
      }, 600);
      flagsGroupIds.forEach(gid => {
        const g = document.getElementById(gid);
        if (g) { g.style.pointerEvents = 'none'; g.style.cursor = 'default'; }
      });
      const correct = i === correctSlot;
      if (correct) {
        flagsStreak++;
        flagsCorrectCount++;
        flagsAnswered.add(chosen);
        flagsEasyUnlocked = true;
        flagsIsFirstRound = false;
        if (flagsCorrectCount >= 3 && !flagsSixUnlocked) {
          flagsSixUnlocked = true;
          flagsGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
        }
        if (flagsCorrectCount >= 10 && !flagsMediumUnlocked) {
          flagsMediumUnlocked = true;
        }
        if (flagsCorrectCount >= 20) flagsHardUnlocked = true;
        if (flagsCorrectCount >= 30) flagsInsaneUnlocked = true;
        flagsAdvanceDot();
        if (typeof sfxCheck   !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        if (typeof sfxAcertar !== 'undefined') { sfxAcertar.currentTime = 0; sfxPlay(sfxAcertar); }
        const badgeImg   = typeof getBadgeImg    !== 'undefined' ? getBadgeImg(flagsStreak)   : null;
        const inRowBonus = typeof getInRowBonus  !== 'undefined' ? getInRowBonus(flagsStreak) : 0;
        const pts = getFlagsRoundPoints(flagsCorrectCount);
        const elapsed = Math.max(0, (performance.now() - flagsRoundStartTime) / 1000);
        const GRACE = 0.8;
        const ratio = elapsed <= GRACE ? 1 : Math.max(0, 1 - (elapsed - GRACE) / (FLAGS_SPEED_WIN - GRACE));
        const _flagsPracticeInf = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
        const speedBonus = (!_flagsPracticeInf && ratio > 0) ? Math.round(pts * (FLAGS_SPEED_MULT - 1) * ratio) : 0;
        flagsScore += pts + speedBonus + inRowBonus;
        flagsAnimateScore();
        sortFlagsLeaderboard(flagsScore);
        // + campaignBase(): ver comentario en el timeout de arriba.
        if (typeof window._specReportAnswer === 'function') window._specReportAnswer(true, Math.round(flagsScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)), { index: i, points: pts + speedBonus, speedBonus, hasBadge: !!badgeImg, inRowBonus, streak: flagsStreak, dots: flagsDots });
        if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(true, Math.round(flagsScore));
        if (typeof showScorePopup !== 'undefined') showScorePopup(pts + speedBonus);
        if (speedBonus > 0) {
          clearTimeout(flagsSpeedBonusHideId);
          flagsSpeedBonusText.classList.remove('visible');
          requestAnimationFrame(() => flagsSpeedBonusText.classList.add('visible'));
          flagsSpeedBonusHideId = setTimeout(() => flagsSpeedBonusText.classList.remove('visible'), 1600);
        }
        if (badgeImg) showFlagsBadge(badgeImg, inRowBonus, flagsStreak);
      } else {
        flagsStreak = 0;
        flagsIsFirstRound = false;
        flagsWrongCount++;
        if (typeof sfxError !== 'undefined') { sfxError.currentTime = 0; sfxPlay(sfxError); }
        // + campaignBase(): ver comentario en el timeout de arriba.
        if (typeof window._specReportAnswer === 'function') window._specReportAnswer(false, Math.round(flagsScore + ((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)), { index: i });
        if (typeof window._lobbyReportAnswer === 'function' && window._lobbyActive) window._lobbyReportAnswer(false, Math.round(flagsScore));
        // En 1v1: efectos en mi propia tarjeta (lobby lo maneja por broadcast self:true)
        if (window._vsActive) _applyWrongEffects(flagsLbElements['flags-lb-player']);
      }
      const overlay = document.getElementById(correct ? 'flags-check-overlay' : 'flags-wrong-overlay');
      if (overlay) {
        overlay.classList.remove('animate');
        void overlay.offsetWidth;
        overlay.classList.add('animate');
        setTimeout(() => {
          overlay.classList.remove('animate');
          if (!flagsRunning) return;
          // Hide all current groups
          const allGroupIds = [...flagsTopGroupIds, ...flagsBottomGroupIds];
          const _practiceLastOne = window.practiceConfig && window.practiceConfig.active && correct && flagsPracticeRemaining.length === 1;
          if (!document.body.classList.contains('recording-mode') && !_practiceLastOne) {
            allGroupIds.forEach(gid => {
              const g = document.getElementById(gid);
              if (g) { g.classList.remove('luggage-enter-active'); g.style.animation = ''; g.style.transition = ''; g.style.transform = ''; g.style.transformOrigin = ''; g.style.opacity = '0'; g.style.willChange = ''; }
            });
          }
          setTimeout(() => {
            if (!flagsRunning) return;
            if (document.body.classList.contains('recording-mode')) return;
            if (window.practiceConfig && window.practiceConfig.active) {
              if (correct) {
                flagsPracticeRemaining = flagsPracticeRemaining.filter(x => x !== flagsPracticeCurrent);
                flagsPracticeCurrent = flagsPracticeRemaining.length ? flagsPracticePickNext(null) : null;
              } else if (flagsPracticeRemaining.length > 1) {
                flagsPracticeCurrent = flagsPracticePickNext(flagsPracticeCurrent);
              }
              // wrong + 1 remaining: keep flagsPracticeCurrent as-is
              // If pool exhausted, don't restore luggage visibility — let startFlagsRound end the game
              if (!flagsPracticeCurrent) {
                startFlagsRound();
                return;
              }
            }
            allGroupIds.forEach(gid => {
              const g = document.getElementById(gid);
              if (g) g.style.opacity = '';
            });
            // Hide bottom row if not yet unlocked
            if (!flagsSixUnlocked) {
              flagsBottomGroupIds.forEach(id => {
                const g = document.getElementById(id);
                if (g) g.style.display = 'none';
              });
            }
            startFlagsRound();
          }, 50);
        }, 750);
      }
    }
    group.onclick = handleLuggagePick;
  });
}

function _flagsCleanupVisuals() {
  flagsWrapper.style.display      = 'none';
  flagsMachine.style.display      = 'none';
  flagsMachine2.style.display     = 'none';
  flagsMachine3.style.display     = 'none';
  flagsMachine3b.style.display    = 'none';
  flagsMachine3.classList.remove('scrolling');
  flagsMachine3b.classList.remove('scrolling');
  flagsFindLuggage.style.display  = 'none';
  flagsFindLuggage.classList.remove('scrolling');
  flagsLuggageWrap.style.display  = 'none';
  flagsLuggageWrap.classList.remove('flags-six-mode');
  flagsFlagImg.style.display      = 'none';
  flagsFlagImg.src                = '';
  flagsFlagidWrap.style.display   = 'none';
  flagsBottomGroupIds.forEach(id => {
    const g = document.getElementById(id);
    if (g) g.style.display = 'none';
  });
}

function hideFlagsMode() {
  // Always: hide score/UI/overlays and stop timers
  flagsScoreDisplay.style.display = 'none';
  document.getElementById('flags-countdown-widget').style.display = 'none';
  flagsRightPanel.style.display   = 'none';
  mainRightPanel.style.display    = 'none';
  flagsTimeupEl.style.display     = 'none';
  if (flagsScoreRafId) { cancelAnimationFrame(flagsScoreRafId); flagsScoreRafId = null; }
  clearTimeout(flagsSpeedBonusHideId);
  flagsSpeedBonusText.classList.remove('visible');
  clearInterval(flagsTimerIntervalId);
  flagsRunning = false;
  clearFlagsElimination();

  const finalScore = Math.round(flagsScore);
  window.lastModeScore = finalScore;

  if (window._suppressGameover) { window._suppressGameover = false; _flagsCleanupVisuals(); return; }

  // ── LOBBY (grupal): ranking en vez del gameover normal ──
  if (window._lobbyActive && typeof window._lobbyHandleGameEnd === 'function') {
    _flagsCleanupVisuals();
    window._lobbyHandleGameEnd(finalScore);
    return;
  }
  // ── VERSUS 1v1: pantalla de resultado W/L en vez del gameover normal ──
  // Keep visual assets (machines, flag, luggage) alive as background during W/L result.
  // flagsHardReset (via quitToMenu) handles cleanup when user exits.
  if (window._vsActive && typeof window._vsHandleGameEnd === 'function') {
    window._vsHandleGameEnd(finalScore);
    return;
  }

  _flagsCleanupVisuals();

  // ── PRÁCTICA: redirigir al panel ──────────────────────────
  if (window.practiceConfig && window.practiceConfig.active) {
    window.endPracticeSession(finalScore, flagsCorrectCount, flagsWrongCount);
    return;
  }
  // ──────────────────────────────────────────────────────────

  // Registrar la partida single-player de banderas para stats.
  if (window.Analytics) window.Analytics.logGame('flags', finalScore);

  const base = (typeof window.campaignBase === 'function') ? window.campaignBase() : 0;
  const finalScoreEl = document.getElementById('final-score-value');
  if (finalScoreEl) finalScoreEl.textContent = (finalScore + base).toLocaleString();

  const LS_HIGHSCORE = 'flagsHighscore';
  const prevHighscore = parseInt(localStorage.getItem(LS_HIGHSCORE) || '0', 10);
  const newHSBanner = document.getElementById('new-highscore-banner');
  const newHSScore  = document.getElementById('new-highscore-score');
  if (finalScore > prevHighscore) {
    localStorage.setItem(LS_HIGHSCORE, String(finalScore));
    if (newHSBanner) newHSBanner.style.display = 'flex';
    if (newHSScore)  newHSScore.textContent = finalScore.toLocaleString();
  } else {
    if (newHSBanner) newHSBanner.style.display = 'none';
  }

  if (typeof window._specReportPostgame === 'function') {
    window._specReportPostgame({
      totalScore: finalScore + base,
      finalScore,
      correctCount: flagsCorrectCount,
      wrongCount: flagsWrongCount,
      isNewHighscore: finalScore > prevHighscore,
    });
  }

  if (typeof setModeCounts !== 'undefined') setModeCounts(flagsCorrectCount, flagsWrongCount);
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) {
    window.hideGameoverConfirm?.();
    gameoverScreen.style.display = 'flex';
    const label = gameoverScreen.querySelector('.gameover-text1-label');
    if (label) label.textContent = t('gameover.flags');
  }
  if (typeof restartFlightAtt !== 'undefined') restartFlightAtt();
  if (typeof buildChecksRow !== 'undefined') buildChecksRow();
  const checksEndTime = (flagsCorrectCount > 0 ? (flagsCorrectCount - 1) * 0.1 + 0.2 : 0) + 0.4;
  if (typeof buildWrongsRow !== 'undefined') buildWrongsRow(checksEndTime);
  if (typeof playMusic !== 'undefined') playMusic(sfxPostgame);
  if (window.campaign && window.campaign.active && typeof window.preloadNextModeAssets === 'function') {
    window.preloadNextModeAssets('shapes').then(() => window.showGameoverConfirm?.());
  } else {
    setTimeout(() => window.showGameoverConfirm?.(), 800);
  }
}

// ── PREGAME COUNTDOWN ─────────────────────────────────────────────────────────
let flagsPregameTimeout = null;
let flagsRoundFallbackTimeout = null;
let flagsAborted = false;

// elapsedMs (opcional): cuánto del 3-2-1 ya pasó del lado del jugador REAL —
// lo usa el espectador que se une a mitad de la cuenta (ver
// flagsSpectatorShowPregame) para arrancar en el número/audio que
// corresponde, en vez de siempre desde "3".
function runFlagsPregame(onDone, elapsedMs) {
  flagsAborted = false;
  flagsPregameEl.style.display = 'flex';
  // Desbloquear el compositor de Opera al arrancar la cuenta regresiva (ver
  // window.nudgeRepaint en monuments.js).
  if (typeof window.nudgeRepaint === 'function') {
    window.nudgeRepaint();
    setTimeout(window.nudgeRepaint, 120);
  }
  // Ubicar en qué paso (3/2/1/GO) y cuánto le queda a ESE paso corresponde
  // arrancar, sumando los "hold" hasta encontrar dónde cae elapsedMs.
  let step = 0;
  let firstStepRemaining = null;
  if (elapsedMs > 0) {
    let acc = 0;
    for (let i = 0; i < FLAGS_PREGAME_STEPS.length; i++) {
      const stepEnd = acc + FLAGS_PREGAME_STEPS[i].hold;
      if (elapsedMs < stepEnd) { step = i; firstStepRemaining = stepEnd - elapsedMs; break; }
      acc = stepEnd;
      step = i + 1;
    }
    if (step >= FLAGS_PREGAME_STEPS.length) { flagsPregameEl.style.display = 'none'; onDone(); return; }
  }
  if (typeof sfxCountdown !== 'undefined') {
    try { sfxCountdown.currentTime = elapsedMs > 0 ? elapsedMs / 1000 : 0; } catch (e) {}
    sfxPlay(sfxCountdown);
  }

  function showStep() {
    if (flagsAborted) return; // se abandonó la partida durante el 3-2-1
    if (step >= FLAGS_PREGAME_STEPS.length) {
      flagsPregameEl.style.display = 'none';
      onDone();
      return;
    }
    const { src, hold, size } = FLAGS_PREGAME_STEPS[step++];
    const thisHold = firstStepRemaining != null ? firstStepRemaining : hold;
    firstStepRemaining = null;
    flagsPregameImg.style.animation = 'none';
    flagsPregameImg.style.width     = size + 'cqmin';
    flagsPregameImg.style.height    = size + 'cqmin';
    flagsPregameImg.src = src;
    void flagsPregameImg.offsetWidth;
    flagsPregameImg.style.animation = '';
    flagsPregameTimeout = setTimeout(showStep, thisHold);
  }

  showStep();
}

// Detiene y resetea TODO el modo banderas (sin scoring ni gameover). Lo usa quitToMenu.
function flagsHardReset() {
  flagsAborted = true;
  flagsRunning = false;
  flagsDots = 0;
  clearTimeout(flagsEndTimeout1); clearTimeout(flagsEndTimeout2);
  clearTimeout(flagsRoundFallbackTimeout); flagsRoundFallbackTimeout = null;
  if (flagsProgressDots) flagsProgressDots.forEach(d => d.classList.remove('filled'));
  if (flagsProgressContainer) flagsProgressContainer.classList.remove('train-animation', 'dots-fade-out');
  clearTimeout(flagsPregameTimeout); flagsPregameTimeout = null;
  clearInterval(flagsTimerIntervalId);
  if (flagsScoreRafId) { cancelAnimationFrame(flagsScoreRafId); flagsScoreRafId = null; }
  clearTimeout(flagsSpeedBonusHideId);
  try { clearFlagsElimination(); } catch (e) {}
  if (typeof sfxCountdown !== 'undefined') { try { sfxCountdown.pause(); sfxCountdown.currentTime = 0; } catch (e) {} }
  if (window._powerQuitOverlay) {
    // Solo pausar animaciones; dejar la UI visible detrás del overlay
    [flagsMachine, flagsMachine2, flagsMachine3, flagsMachine3b, flagsFindLuggage].forEach(m => {
      if (m) m.style.animationPlayState = 'paused';
    });
    // Deshabilitar maletines: sin hover ni click durante el overlay de game over
    disableAllLuggageGroups();
    if (flagsLuggageWrap) flagsLuggageWrap.classList.add('flags-game-ended');
    // Detener el titilo del countdown
    if (flagsTimerImg) flagsTimerImg.style.animationPlayState = 'paused';
  } else if (!window._vsShowingResult) {
    // Ocultar/parar máquina, equipaje, banderas, overlays y countdown
    [flagsMachine, flagsMachine2, flagsMachine3, flagsMachine3b].forEach(m => {
      if (!m) return;
      m.style.display = 'none';
      m.style.animationPlayState = '';
      m.classList.remove('scrolling');
    });
    flagsFindLuggage.style.display = 'none';
    flagsFindLuggage.classList.remove('scrolling');
    flagsLuggageWrap.style.display = 'none';
    flagsLuggageWrap.classList.remove('flags-six-mode');
    flagsFlagImg.style.display = 'none'; flagsFlagImg.src = '';
    flagsFlagidWrap.style.display = 'none';
    flagsPregameEl.style.display = 'none';
    flagsTimeupEl.style.display = 'none';
    flagsSpeedBonusText.classList.remove('visible');
    ['flags-check-overlay','flags-wrong-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('animate'); el.style.display = ''; el.style.opacity = ''; }
    });
    flagsBottomGroupIds.forEach(id => { const g = document.getElementById(id); if (g) g.style.display = 'none'; });
  }
}
window.gameStoppers = window.gameStoppers || [];
window.gameStoppers.push(flagsHardReset);
window.flagsHardReset = flagsHardReset;

// ── TIMER ─────────────────────────────────────────────────────────────────────
// flagsTimeLeft se calcula contra flagsTimerStartedAt (Date.now()), no
// restando 1 por tick — un setInterval throttleado en 2do plano pierde ticks
// reales y un contador que resta 1 por tick queda atrasado respecto al
// tiempo real; acá se autocorrige de una sola vez en cuanto vuelve a
// tickear (o la pestaña vuelve a primer plano), en vez de arrastrar el
// atraso.
function _flagsTimerTick() {
  // Guarda defensiva — mismo motivo que la de _timerTick en monuments.js: si
  // por lo que sea flagsTimerIntervalId no se limpió a tiempo (pestaña
  // minimizada mucho rato, etc.), un tick fantasma de una ronda ya
  // terminada podía disparar endFlagsGame() y el TIMES UP gigante encima
  // del menú. flagsRunning ya se pone en false al terminar/salir de la
  // ronda real.
  if (!flagsRunning) { clearInterval(flagsTimerIntervalId); return; }
  const _flagsInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
  if (_flagsInfinite) return;
  const elapsed = Math.floor((Date.now() - flagsTimerStartedAt) / 1000);
  flagsTimeLeft = Math.max(0, flagsTimerDuration - elapsed);
  flagsTimerEl.textContent = flagsTimeLeft;
  flagsTimerEl.classList.remove('timer-number-infinity');

  if (flagsTimeLeft <= 10) {
    flagsTimerEl.style.color = '#ffffff';
    flagsTimerImg.src = 'images/countdownred2.png';
    if (flagsTimeLeft > 0 && typeof sfxTickdown !== 'undefined') { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
  }
  if (typeof window._specReportTick === 'function') window._specReportTick(flagsTimeLeft);
  if (flagsTimeLeft <= 0) {
    clearInterval(flagsTimerIntervalId);
    flagsRunning = false;
    clearFlagsElimination();
    disableAllLuggageGroups();
    flagsLuggageWrap.classList.add('flags-game-ended');
    if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
    if (typeof window._specReportTimesUp === 'function') window._specReportTimesUp();
    endFlagsGame();
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && flagsRunning && flagsTimerIntervalId) _flagsTimerTick();
});

function startFlagsTimer() {
  clearInterval(flagsTimerIntervalId); // defensivo: evita timer doble si se llama dos veces
  const _flagsInfinite = window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer === 0;
  flagsTimeLeft = _flagsInfinite ? 0 : (window.practiceConfig && window.practiceConfig.active && window.practiceConfig.timer > 0)
    ? window.practiceConfig.timer
    : FLAGS_GAME_DURATION;
  flagsTimerDuration  = flagsTimeLeft;
  flagsTimerStartedAt = Date.now();
  flagsScore          = 0;
  flagsDisplayedScore = 0;
  flagsWrongCount     = 0;
  if (typeof setModeCounts !== 'undefined') setModeCounts(0, 0);
  flagsScoreEl.textContent = (((typeof window.campaignBase === 'function') ? window.campaignBase() : 0)).toLocaleString();
  flagsRunning  = true;
  if (_flagsInfinite) { flagsTimerEl.textContent = '∞'; flagsTimerEl.classList.add('timer-number-infinity'); }

  flagsTimerIntervalId = setInterval(_flagsTimerTick, 1000);
}

// ── GAME OVER ─────────────────────────────────────────────────────────────────
let flagsEndTimeout1 = null, flagsEndTimeout2 = null;
function endFlagsGame() {
  flagsAborted = false;
  flagsTimerImg.style.animationPlayState = 'paused';
  if (typeof playMusic !== 'undefined') playMusic(null);
  flagsTimeupEl.classList.remove('timeup-out');
  flagsTimeupEl.classList.add('timeup-in');
  flagsTimeupEl.style.display = 'flex';

  flagsEndTimeout1 = setTimeout(() => {
    if (flagsAborted) return;
    flagsTimeupEl.classList.remove('timeup-in');
    flagsTimeupEl.classList.add('timeup-out');
    flagsEndTimeout2 = setTimeout(() => { if (!flagsAborted) hideFlagsMode(); }, 400);
  }, 1800);
}

// ── BOTÓN DE INICIO ───────────────────────────────────────────────────────────
document.getElementById('loading-flags-btn').addEventListener('click', () => {
  window._autoDismissVsInvites?.();
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
  if (typeof window._setPlaying === 'function') window._setPlaying(true);
  window.pendingGameMode = 'flags';
  // Avisar a un posible espectador que entramos a las instrucciones de este
  // modo — puede quedarse leyendo ahí lo que quiera antes de confirmar; sin
  // este aviso, un espectador que se une durante ese rato se quedaba viendo
  // la pantalla de "Conectando..." trabada hasta recién el 3-2-1 real.
  // Diferido a microtask: _setPlaying(true) recién arranca SoloSpectate en SU
  // PROPIO Promise.resolve().then() (para esperar a que _vsActive/_lobbyActive
  // ya estén seteados) — llamando esto en el mismo tick síncrono todavía
  // vería SoloSpectate.isActive()===false y el aviso se perdía en silencio.
  // Encolando el nuestro DESPUÉS (mismo patrón), el de _setPlaying corre primero.
  Promise.resolve().then(() => {
    if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: 'flags' });
  });
  // Resetear estado del splash con el splash AÚN oculto (evita saltear step2 y la
  // mesa "subiendo" si veníamos de una campaña previa). Ver window.resetSplashEntry.
  window.resetSplashEntry?.();
  // Transición visual inmediata
  document.getElementById('loading-screen').style.display = 'none';
  const splashEl = document.getElementById('splash-screen');
  splashEl.style.display = 'flex';
  window.showSplashConfirm?.();
  const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
  void splashEl.offsetWidth;
  animEls.forEach(el => el.classList.add('animate-in'));
  if (typeof playMusic !== 'undefined') playMusic(sfxPregame);
  // Setup no visual diferido
  requestAnimationFrame(() => {
    document.getElementById('splash-screen').classList.add('mode-flags');
    document.getElementById('splash-screen').classList.remove('mode-shapes', 'mode-monuments');
    document.getElementById('gameover-screen').classList.add('mode-flags');
    document.getElementById('gameover-screen').classList.remove('mode-shapes', 'mode-monuments');
    window.swapHowtoVideo?.('images/howtoplay/howtoplay1.mp4');
    document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men3.png');
    document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men4.png');
    document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl3.png');
    document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl4.png');
    document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women2.png');
    document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women3.png');
    document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level1complete.png');
    document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check1.png');
    document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong1.png');
    const label = document.querySelector('.splash-text2-label');
    { const _pk = (window.practiceConfig && window.practiceConfig.active) ? 'splash.practice.flags.1' : 'splash.flags.1'; if (label) { label.textContent = t(_pk); label.classList.remove('step2'); } }
    const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
    if (howtoWrap) howtoWrap.classList.remove('slide-down');
    const howtoTitle = document.querySelector('.splash-howtoplay-title');
    if (howtoTitle) howtoTitle.textContent = 'Suitcase Shuffle';
  });
});

document.getElementById('loading-flags-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
});


// Reposicionar la barra de amigos de banderas al hacer zoom/redimensionar
window.addEventListener('resize', () => {
  const rp = document.getElementById('flags-right-panel');
  if (!rp || getComputedStyle(rp).display === 'none') return;
  flagsPositionLeaderboard(flagsLastLbScore >= 0 ? flagsLastLbScore : 0, false);
  requestAnimationFrame(() => {
    Object.values(flagsLbElements).forEach(el => { el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)'; });
  });
});
