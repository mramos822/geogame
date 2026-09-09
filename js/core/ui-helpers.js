// ============================================================================
// core/ui-helpers.js — helpers de UI globales reutilizables desde cualquier
// pantalla: confirms de splash/gameover, video de howtoplay, reset del splash,
// ocultar HUD ingame, nudge de repaint (Opera), toast global. Extraído de
// monuments.js (fase 2 de la modularización). Se carga antes que monuments.js.
// Depende de IS_MOBILE / IS_CHROME_IOS (js/core/audio.js, carga antes) y de
// `confirmStep` (monuments.js, sólo se lee en runtime bajo try/catch).
// ============================================================================

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
  // Chrome-iOS nunca reproduce el video (poster estático, ver IS_CHROME_IOS)
  // así que no tiene sentido esperar eventos de carga que no van a llegar.
  if (!v || v.readyState >= 3 || IS_CHROME_IOS) { window.showSplashConfirm(); return; }
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
    // Chrome-iOS (ver IS_CHROME_IOS más arriba): nunca se llama .play() sobre
    // este elemento (ver confirm handler), así que sin poster quedaría en
    // blanco — un frame estático del tutorial en vez del video animado.
    if (IS_CHROME_IOS) fresh.poster = newSrc.replace(/howtoplay(\d)\.mp4$/, 'howtoplay$1-poster.jpg');
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
