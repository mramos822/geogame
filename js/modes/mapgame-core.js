// ============================================================================
// modes/mapgame-core.js — Núcleo compartido de los modos de mapa (Ciudades y Monumentos): quitToMenu +
// botón power.png ingame, constantes de juego y scoring, proyección Mercator +
// calibración, refs DOM, cámara/zoom/arrastre del mapa, assets Image(), estado del
// juego (state, highscore, gradeCounts, correctCount/wrongCount, canvas, ctx...),
// badge overlay, releaseGameMemory, buildChecksRow/buildWrongsRow.
// DEBE cargar DESPUÉS de letterbox.js (window.STAGE_W/H, GAME_DURATION) y de
// places.js (MONUMENTS).
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

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
    // globequiz-screen NUNCA participa de esto para el JUGADOR REAL (tiene su
    // propio #gq-power-btn) — solo se suma acá cuando _isSpectating, para el
    // espectador de GlobeQuiz, que no tiene ningún otro back visible (el
    // "no aparece el botón de back" reportado: #gq-power-btn queda oculto a
    // propósito para el espectador, ver globequizSpectatorEnter).
    const gqSpecIngame = window._isSpectating && isVisible('globequiz-screen');
    const ingame  = prepost || isVisible('game-wrapper') || isVisible('flags-wrapper') ||
                    isVisible('score-display') || isVisible('flags-score-display') || gqSpecIngame;
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
   'flags-score-display','vs-result-screen','globequiz-screen'].forEach(id => {
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
    const gqQuitPopup = document.getElementById('gq-quit-popup');
    const _modeSelPop = document.getElementById('vs-mode-select-popup');
    if (_modeSelPop && _modeSelPop.style.display !== 'none') {
      sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
      _modeSelPop.style.display = 'none';
    } else if (gqQuitPopup && gqQuitPopup.style.display === 'flex') {
      _clickBack('gq-quit-cancel');
    } else if (document.getElementById('globequiz-screen')?.style.display === 'block') {
      _clickBack('gq-power-btn');
    } else if (quitPopup && quitPopup.style.display === 'flex') {
      sfxSelect.currentTime = 0; sfxPlay(sfxSelect);
      quitPopup.style.display = 'none';
      document.body.classList.remove('quit-open');
    } else if (_panelVisible('loading-customize-group')) {
      // Personalización se abre COMO SUB-panel del modal de perfil (ver
      // loading-customize-btn) — sin este check, _closeOpenModal() de abajo
      // cerraba directo el modal de perfil entero y se saltaba este paso.
      _clickBack('customize-back-wrap');
    } else if (_closeOpenModal()) {
      // modal de cuenta cerrado
    } else if (_panelVisible('loading-friend-group'))    { _clickBack('loading-friend-back-wrap'); }
    else if (_hasClass('chat-conversation-modal', 'open')) { _clickBack('loading-chat-back'); }
    else if (_panelVisible('loading-addfriend-group'))   { _clickBack('loading-addfriend-back-wrap'); }
    else if (_panelVisible('loading-blocked-group'))     { _clickBack('loading-blocked-back-wrap'); }
    else if (_panelVisible('loading-sent-group'))        { _clickBack('loading-sent-back-wrap'); }
    else if (_panelVisible('loading-rankings-group'))    { _clickBack('loading-rankings-back-wrap'); }
    else if (_panelVisible('loading-social-group'))      { _clickBack('loading-social-back-wrap'); }
    else if (_hasClass('chat-inbox-modal', 'open'))      { _clickBack('chat-inbox-close'); }
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

