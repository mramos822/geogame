// ============================================================================
// core/campaign.js — Gira Mundial (window.campaign, campaignBase, _commitCampaignHighscores,
// startCampaign) + el helper global _setPlaying (is_playing en Supabase +
// etiqueta de /stats) y preloadNextModeAssets.
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

// Etiqueta legible de "qué está jugando" para /stats (ver sbSetPlayingMode
// en sb.js) — best-effort a partir del contexto disponible en el momento
// del microtask (después de que quien llamó a _setPlaying ya terminó de
// setear pendingGameMode/campaign/_vsActive en su misma función síncrona).
const _MODE_NAME_LABELS = { flags: 'Banderas', shapes: 'Figuras', game: 'Ciudades', monuments: 'Monumentos', globequiz: 'GlobeQuiz' };
function _computePlayingLabel(isPracticing) {
  const modeName = _MODE_NAME_LABELS[window.pendingGameMode] || null;
  if (window._vsActive) return 'VS' + (modeName ? ' · ' + modeName : '');
  if (window.campaign && window.campaign.active) return 'Gira Mundial';
  if (isPracticing) return 'Práctica' + (modeName ? ' · ' + modeName : '');
  return modeName || 'Jugando';
}

// Helper global: actualiza is_playing en Supabase si hay sesión activa
window._setPlaying = function(playing) {
  window._isPlaying = !!playing;
  const isPracticing = !!(window.practiceConfig && window.practiceConfig.active);
  if (window._sbUserId) {
    window.sbSetPlaying(window._sbUserId, playing, playing && isPracticing).catch(() => {});
  } else if (window.Analytics && typeof window.Analytics.guestSetPlaying === 'function') {
    // Invitado (sin cuenta): mismo latido que sbSetPlaying, pero a
    // guest_presence — es lo único que le permite a /stats "En línea
    // ahora"/"Jugando ahora" verlos, ver js/analytics.js.
    window.Analytics.guestSetPlaying(playing, null);
  }
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
      // sbSetPlayingMode va PRIMERO y en su propio try/catch: si SoloSpectate.start()
      // más abajo tirara una excepción, no debe cortar esto a mitad de camino (pasó
      // exactamente eso antes de este cambio — el modo nunca llegaba a /stats).
      try {
        if (window._isPlaying && window._sbUserId && typeof window.sbSetPlayingMode === 'function') {
          window.sbSetPlayingMode(window._sbUserId, _computePlayingLabel(isPracticing)).catch(() => {});
        } else if (window._isPlaying && !window._sbUserId && window.Analytics && typeof window.Analytics.guestSetPlaying === 'function') {
          window.Analytics.guestSetPlaying(true, _computePlayingLabel(isPracticing));
        }
      } catch (e) {}
      try {
        if (window._isPlaying && !window._vsActive && !window._lobbyActive && !isPracticing && typeof window.SoloSpectate !== 'undefined') {
          window.SoloSpectate.start();
        }
      } catch (e) {}
    });
  } else {
    if (typeof window.SoloSpectate !== 'undefined') window.SoloSpectate.stop();
    if (window._sbUserId && typeof window.sbSetPlayingMode === 'function') window.sbSetPlayingMode(window._sbUserId, null).catch(() => {});
    // Al volver de una partida, entregar invitaciones que llegaron mientras jugaba
    if (typeof window.flushQueuedInvite === 'function') window.flushQueuedInvite();
  }
};

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

window.startCampaign = function () {
  window.campaign.active = true;
  window.campaign.idx = 0;
  window.campaign.base = 0;
  window.campaign.scores = {};
  window.campaign.pendingHS = {};
  window.lastModeScore = 0;
  document.getElementById('loading-flags-btn').click();
};
