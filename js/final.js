// ── FINAL ────────────────────────────────────────────────────────────────────

const finalScreen = document.getElementById('final-screen');

function fitRankLabel(id, maxWidthVmin) {
  const el = document.getElementById(id);
  if (!el) return;
  // Todo en vmin para que escale con el viewport. maxWidthVmin en vmin → px.
  const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
  const maxW = maxWidthVmin * vminPx;
  el.style.fontSize = '';
  let size = 4.39; // vmin (= 40px ref)
  el.style.fontSize = size + 'cqmin';
  while (el.scrollWidth > maxW && size > 1.54) {
    size -= 0.11;
    el.style.fontSize = size + 'cqmin';
  }
}

let finalBackTimeout = null;
let _finalRanking = null;
let _finalPos = 0;
let _finalTotal = 0;
let _guestRankPromise = null;

function _onFinalResize() {
  if (!finalScreen || finalScreen.style.display === 'none') return;
  if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
}

function showFinalScreen() {
  finalScreen.style.display = 'block';
  if (typeof window._setPlaying === 'function') window._setPlaying(false);
  // Espejo local SIEMPRE (con cuenta o sin ella): si falla el guardado en el
  // servidor (sin conexión), el perfil no debe mostrar 0 — cae a este respaldo.
  localStorage.setItem('playCount', String(parseInt(localStorage.getItem('playCount') || '0', 10) + 1));
  const backWrap = document.getElementById('final-confirm-back-wrap');
  if (backWrap) {
    backWrap.classList.remove('visible');
    clearTimeout(finalBackTimeout);
    finalBackTimeout = setTimeout(() => backWrap.classList.add('visible'), 3000);
  }
  const cs = (window.campaign && window.campaign.scores) ? window.campaign.scores : {};
  const hs1  = (cs.flags     != null) ? cs.flags     : (parseInt(localStorage.getItem('flagsHighscore'))         || 0);
  const hs2  = (cs.shapes    != null) ? cs.shapes    : (parseInt(localStorage.getItem('shapesHighscore'))        || 0);
  const hs3  = (cs.game      != null) ? cs.game      : (parseInt(localStorage.getItem('geochallenge_highscore')) || 0);
  const hs4  = (cs.monuments != null) ? cs.monuments : (parseInt(localStorage.getItem('monumentsHighscore'))     || 0);
  // Acumular para promedios por modo (segunda columna del loading) — espejo
  // local siempre, misma razón que playCount arriba.
  [['flags', hs1], ['shapes', hs2], ['game', hs3], ['monuments', hs4]].forEach(([k, v]) => {
    localStorage.setItem('avgSum_' + k,   String(parseInt(localStorage.getItem('avgSum_' + k)   || '0', 10) + v));
    localStorage.setItem('avgCount_' + k, String(parseInt(localStorage.getItem('avgCount_' + k) || '0', 10) + 1));
  });
  const total = hs1 + hs2 + hs3 + hs4;
  // Precarga la posición en el ranking real ni bien se muestra la pantalla final
  // (no cuando se abre el popup): así, para cuando el jugador toca "atrás" —que
  // suele tardar unos segundos por las animaciones— el dato ya está listo y el
  // popup no se abre con el mensaje en blanco esperando la consulta a Supabase.
  if (!window._accountLoggedIn) _guestRankPromise = _guestRankPosition(total);
  const rank  = typeof getRank === 'function' ? getRank(total) : null;
  const label = document.getElementById('final-rank-label');
  if (label && rank) { label.textContent = rank.name; fitRankLabel('final-rank-label', 52.7); }
  const scoreEl = document.getElementById('final-points-score');
  if (scoreEl) scoreEl.textContent = total.toLocaleString();
  const playerName = localStorage.getItem('playerName') || 'John';
  const profilePhoto = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
  const avatarImg = document.querySelector('.final-avatar-img');
  if (avatarImg) avatarImg.src = profilePhoto;
  const nameEl = document.getElementById('final-player-name');
  if (nameEl) {
    nameEl.textContent = playerName;
    nameEl.style.fontSize = '';
    requestAnimationFrame(() => {
      const avatarEl = document.querySelector('.final-avatar');
      if (!avatarEl) return;
      const group  = document.getElementById('final-group');
      const groupW = group ? group.offsetWidth : (window.STAGE_W || window.innerWidth);
      const maxNameW = groupW * 0.52;
      let fs = parseFloat(getComputedStyle(nameEl).fontSize);
      while (nameEl.scrollWidth > maxNameW && fs > 8) {
        fs -= 0.5;
        nameEl.style.fontSize = fs + 'px';
      }
      const avatarRect = avatarEl.getBoundingClientRect();
      const nameRect   = nameEl.getBoundingClientRect();
      const GAP = 36; // px de separación entre foto y nombre
      const overlap = avatarRect.right - nameRect.left + GAP;
      if (overlap > 0) {
        const pct = overlap / groupW * 100;
        const cur = parseFloat(getComputedStyle(avatarEl).left) / groupW * 100;
        avatarEl.style.left = Math.max(10, cur - pct) + '%';
      }
    });
  }

  const friends = (window._accountLoggedIn && typeof getFriends === 'function') ? getFriends() : [];
  const ranking = [...friends, { name: playerName, score: total }]
    .sort((a, b) => b.score - a.score);
  const pos = ranking.findIndex(p => p.name === playerName && p.score === total) + 1;
  const posEl = document.getElementById('final-position');
  if (posEl) posEl.textContent = pos;

  _finalRanking = ranking;
  _finalPos     = pos;
  _finalTotal   = total;
  window.removeEventListener('resize', _onFinalResize);
  window.addEventListener('resize', _onFinalResize);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', _onFinalResize);
    window.visualViewport.addEventListener('resize', _onFinalResize);
  }

  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (typeof window.letterboxRefresh === 'function') {
      window.letterboxRefresh();
      getComputedStyle(document.documentElement).getPropertyValue('--app-fit');
    }
    buildFriendClouds(ranking, pos);
    // iOS: visualViewport puede estar desactualizado en el primer render.
    // Segundo refresh a 300ms garantiza que el viewport está estabilizado.
    setTimeout(() => {
      if (finalScreen.style.display === 'none') return;
      if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
      buildFriendClouds(ranking, pos);
    }, 300);
  }));
}

// Genera un cloud5 por cada puesto en diagonal 2:1, dejando un hueco en mi puesto.
// El trail entra desde la derecha y se detiene cuando mi hueco llega al centro.
function buildFriendClouds(ranking, playerPos) {
  const container = document.getElementById('final-clouds5');
  if (!container) return;
  container.innerHTML = '';
  const CQW = window.STAGE_W / 100; // 1cqw en px (19.2 en diseño 1920)
  const STEP_X = 22 * CQW;  // px por puesto
  const STEP_Y = -11 * CQW; // px por puesto (2:1)
  const playerName = localStorage.getItem('playerName') || 'John';

  // Ventana de 10 posiciones (yo incluido como hueco): 4 por encima + yo + 5 por debajo.
  // En los bordes se desplaza para mantener 10 (si hay suficientes).
  const WINDOW = 10;
  const fullN = ranking.length;
  let start = playerPos - Math.floor((WINDOW - 1) / 2); // 4 por encima
  let end   = start + WINDOW - 1;
  if (start < 1)      { end += (1 - start);     start = 1; }
  if (end > fullN)    { start -= (end - fullN); end = fullN; }
  if (start < 1)      start = 1;
  const windowed = ranking.slice(start - 1, end); // sigue ordenado desc
  const N = windowed.length;                       // <= 10
  const localPlayerPos = playerPos - start + 1;    // mi puesto dentro de la ventana

  for (let i = N - 1; i >= 0; i--) {
    const entry = windowed[i];
    const realPos = start + i; // puesto real en el ranking completo
    // dejar hueco en mi puesto
    if ((i + 1) === localPlayerPos && entry.name === playerName) continue;
    const k = (N - 1) - i; // 0 = más bajo
    const rk = typeof getRank === 'function' ? getRank(entry.score) : null;
    const labelId = `final-fc-label-${i}`;

    const group = document.createElement('div');
    group.className = 'final-group5';
    group.style.transform = `translate(${k * STEP_X}px, ${k * STEP_Y}px) scale(0.9)`;

    group.innerHTML =
      `<img class="final-cloud5" src="images/bg/cloud5.png" alt="" draggable="false" oncontextmenu="return false">` +
      `<span class="final2-position">${realPos}</span>` +
      `<span class="final2-player-name">${entry.name}</span>` +
      `<span class="final2-rank-label" id="${labelId}">${rk ? rk.name : ''}</span>` +
      `<div class="final2-avatar"><img class="final2-avatar-img" src="${entry.avatar || 'images/profilepic/ppdefault.png'}" alt="" draggable="false" oncontextmenu="return false"></div>` +
      `<div class="final2-points-wrap">` +
        `<img class="final2-points-img" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="final2-points-score">${entry.score.toLocaleString()}</span>` +
      `</div>`;
    container.appendChild(group);
    fitRankLabel(labelId, 39.5);
    group.dataset.k = k;
    const cloudImg = group.querySelector('.final-cloud5');
    if (cloudImg) {
      const dur = 6 + Math.random() * 5;       // 6–11s
      const delay = -Math.random() * dur;      // arranca en fase aleatoria
      cloudImg.style.animationDuration = dur.toFixed(2) + 's';
      cloudImg.style.animationDelay = delay.toFixed(2) + 's';
    }
  }

  // mi puesto desde abajo (0 = más bajo), relativo a la ventana
  const playerK = N - localPlayerPos;
  const endX = -(playerK * STEP_X);
  const endY = -(playerK * STEP_Y);
  const startX = endX + 240 * CQW;
  const startY = endY - 120 * CQW;

  // CSS transition en lugar de Web Animations API — en iOS el WAAPI pone el
  // elemento bajo el compositor antes de que el layout del display:block esté
  // comprometido, causando posición incorrecta. CSS transition + rAF es más
  // confiable: el rAF garantiza que el transform inicial ya fue pintado antes
  // de que se añada la transición.
  container.style.transform = `translate(${startX}px, ${startY}px)`;

  const ANIM_DUR   = 7500;
  const ANIM_DELAY = 3000;
  const groups = Array.from(container.querySelectorAll('.final-group5'));
  function easeOutQ(t) { return 1 - (1 - t) * (1 - t); }
  function checkPassMath(ep) {
    groups.forEach(g => {
      if (g.classList.contains('passed')) return;
      const gk = parseInt(g.dataset.k);
      if (isNaN(gk) || gk >= playerK) return;
      const threshold = 1 - (playerK - gk - 0.5) * STEP_X / (240 * CQW);
      if (ep >= threshold) g.classList.add('passed');
    });
  }

  let loopActive = false;
  let loopStart  = null;
  function loop(ts) {
    if (!loopStart) loopStart = ts;
    const f = Math.min(1, (ts - loopStart) / ANIM_DUR);
    checkPassMath(easeOutQ(f));
    if (f < 1 && loopActive) requestAnimationFrame(loop);
    else checkPassMath(1);
  }

  // rAF para que iOS commitee el transform inicial antes de añadir la transición
  requestAnimationFrame(() => {
    const tid = setTimeout(() => {
      container.style.transition = `transform ${ANIM_DUR}ms ease-out`;
      container.style.transform  = `translate(${endX}px, ${endY}px)`;
      container.addEventListener('transitionend', () => {
        container.style.transition = '';
      }, { once: true });
      loopActive = true;
      requestAnimationFrame(loop);
    }, ANIM_DELAY);
    // exponer para cleanup si se oculta el final antes de que acabe
    container._animTid = tid;
  });
}

function hideFinalScreen() {
  finalScreen.style.display = 'none';
  window.removeEventListener('resize', _onFinalResize);
  if (window.visualViewport) window.visualViewport.removeEventListener('resize', _onFinalResize);
  clearTimeout(finalBackTimeout);
  document.getElementById('final-confirm-back-wrap')?.classList.remove('visible');
  const c = document.getElementById('final-clouds5');
  if (c && c._animTid) { clearTimeout(c._animTid); c._animTid = null; }
}

document.getElementById('final-confirm-back-wrap')?.addEventListener('click', () => {
  if (typeof confirmCooldown !== 'undefined' && confirmCooldown) return;
  if (typeof confirmCooldownLock === 'function') confirmCooldownLock();
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  const w = document.getElementById('final-confirm-back-wrap');
  w.classList.add('confirm-pressed');
  setTimeout(() => w.classList.remove('confirm-pressed'), 50);
  if (typeof window.stopResultsMusic === 'function') window.stopResultsMusic();
  hideFinalScreen();
  if (typeof window.startMenuMusic === 'function') window.startMenuMusic();
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen').classList.remove('table-shown');
  document.getElementById('loading-table-group')?.classList.add('table-gone');
  if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  // Liberar la RAM de la campaña recién terminada (fondos/personajes/ranks/canvas/
  // video). Así la app no acumula memoria entre sesiones y la siguiente partida o
  // entrar a social arranca con baseline bajo, sin necesidad de recargar la página.
  if (typeof window.releaseGameMemory === 'function') window.releaseGameMemory();
  if (!window._accountLoggedIn && localStorage.getItem('hideGuestRankPopup') !== '1') {
    showGuestRankPopup(_finalTotal || 0);
  }
  // Popup de Fundador: recién acá, de vuelta en el menú tras terminar una
  // Vuelta Mundial completa (flag puesta en js/monuments.js al cerrar la
  // campaña) — window._sbProfile ya viene fresco del guardado de resultados
  // (ver js/results.js). Solo desbloquea, no equipa nada (ver showFounderWelcomePopup).
  if (window._pendingFounderPopupCheck) {
    window._pendingFounderPopupCheck = false;
    const p = window._sbProfile;
    if (p && p.is_founder && !p.founder_popup_seen && typeof window.showFounderWelcomePopup === 'function') {
      setTimeout(() => window.showFounderWelcomePopup(), 500);
    }
  }
});
document.getElementById('final-confirm-back-wrap')?.addEventListener('mouseenter', () => { if (typeof playSelect === 'function') playSelect(); });
document.getElementById('final-confirm-back-wrap')?.addEventListener('mouseleave', () => { if (typeof playSelect === 'function') playSelect(); });

// ── Popup: puesto en el ranking para invitados ────────────────────────────────
// Los invitados no entran al ranking real (visitor_id no es una identidad
// confiable, ver conversación de diseño), así que en vez de eso se les muestra
// dónde caerían + un CTA a crear cuenta. Se dispara cada vez que vuelven al menú
// tras terminar una Gira Mundial, salvo que hayan marcado "no mostrar de nuevo".
async function _guestRankPosition(total) {
  if (!window.sb) return null;
  try {
    const { data } = await window.sb.from('profiles')
      .select('hs_flags,hs_shapes,hs_cities,hs_monuments,hs_total')
      .eq('hidden_from_rankings', false);
    if (!data) return null;
    const scores = data.map(p => Math.max(p.hs_total || 0, (p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0)));
    return { pos: scores.filter(s => s > total).length + 1, total: scores.length + 1 };
  } catch (e) { return null; }
}

// Corta la espera si el pedido tarda demasiado (sin internet, servidor caído, etc.):
// sin esto un fetch colgado dejaría el popup esperando indefinidamente antes de
// poder abrirse, ya que ahora se espera el dato antes de mostrar la viñeta.
function _withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function showConnErrorPopup() {
  const popup = document.getElementById('conn-error-popup');
  if (!popup || popup.classList.contains('open')) return; // no duplicar si ya está abierta
  popup.classList.add('open');
}
window.showConnErrorPopup = showConnErrorPopup;
document.getElementById('conn-error-popup-close')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  document.getElementById('conn-error-popup')?.classList.remove('open');
});

// Utilidad reusable: envuelve cualquier pedido a Supabase con el mismo timeout +
// viñeta de error de conexión que ya usa el popup de invitado. Cualquier otra
// parte del juego que cargue algo del servidor puede usarla:
//   const data = await window.withConnCheck(window.sb.from(...).select(...), 6000);
//   if (data === null) return; // ya se mostró la viñeta de error, no seguir
// IMPORTANTE: en ambas variantes de abajo hay que cancelar el setTimeout una vez
// que la carrera termina. Si el pedido real resuelve rápido (ej. "usuario no
// encontrado" en unos ms) pero el timer de 6s sigue vivo sin cancelar, dispara
// solo más tarde y muestra la viñeta de error igual — aunque ya haya terminado
// bien. Con varios clics seguidos, esos timers "fantasma" se van acumulando y
// la viñeta termina apareciendo sola, de la nada, varias veces.
const _CONN_TIMEOUT = Symbol('conn-timeout');
window.withConnCheck = function (promise, ms = 6000) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(() => resolve(_CONN_TIMEOUT), ms); });
  return Promise.race([Promise.resolve(promise).catch(() => _CONN_TIMEOUT), timeout])
    .then(result => {
      clearTimeout(timer);
      if (result === _CONN_TIMEOUT) { showConnErrorPopup(); return null; }
      return result;
    });
};

// Variante para flujos con errores de negocio legítimos (login: contraseña
// incorrecta; registro: usuario ya existe, etc.) que NO deben tratarse como
// falla de conexión. A diferencia de withConnCheck, esta NO atrapa el rechazo
// original — solo corta la espera si nadie respondió (ni éxito ni error) en
// `ms`, mostrando la viñeta y devolviendo undefined; los .then/.catch del
// caller siguen funcionando igual que siempre para errores reales.
window.withConnTimeout = function (promise, ms = 6000) {
  let timer;
  promise.catch(() => {}); // evita "unhandled rejection" si el original rechaza después del timeout
  const timeout = new Promise(resolve => { timer = setTimeout(() => { showConnErrorPopup(); resolve(undefined); }, ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Detección automática: en cuanto el navegador pierde la conexión (evento nativo
// 'offline', no depende de que algo la pida), se muestra la viñeta sola, sin
// esperar a que el jugador dispare alguna acción que necesite internet.
window.addEventListener('offline', () => showConnErrorPopup());

async function showGuestRankPopup(total) {
  // Espera el dato ANTES de decidir qué popup abrir. Usa la precarga arrancada
  // en showFinalScreen() si está lista (lo normal, dado el tiempo que pasa
  // hasta tocar "atrás"); si no, la pide en el momento. Con timeout: si no hay
  // internet o el servidor no responde a tiempo, no se cuelga esperando.
  const r = await _withTimeout(_guestRankPromise || _guestRankPosition(total), 6000);
  if (!r) { showConnErrorPopup(); return; }

  const popup = document.getElementById('guest-rank-popup');
  if (!popup) return;
  const titleEl = document.getElementById('guest-rank-popup-title');
  if (titleEl) titleEl.textContent = t('guestPopup.title', { name: localStorage.getItem('playerName') || 'John' });
  const rank = typeof getRank === 'function' ? getRank(total) : null;
  const imgEl = document.getElementById('guest-rank-popup-rankimg');
  if (imgEl && rank) imgEl.src = rank.img;
  const nameEl = document.getElementById('guest-rank-popup-rankname');
  if (nameEl && rank) nameEl.textContent = rank.name;
  const scoreEl = document.getElementById('guest-rank-popup-score');
  if (scoreEl) scoreEl.textContent = total.toLocaleString();
  const msgEl = document.getElementById('guest-rank-popup-msg');
  if (msgEl) msgEl.textContent = t('guestPopup.msg', { pos: r.pos, total: r.total });
  const dontshow = document.getElementById('guest-rank-popup-dontshow');
  if (dontshow) dontshow.checked = false;
  popup.classList.add('open');
}

function hideGuestRankPopup() {
  const popup = document.getElementById('guest-rank-popup');
  if (document.getElementById('guest-rank-popup-dontshow')?.checked) {
    localStorage.setItem('hideGuestRankPopup', '1');
  }
  popup?.classList.remove('open');
}
window.showGuestRankPopup = showGuestRankPopup;

document.getElementById('guest-rank-popup-close')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  hideGuestRankPopup();
});
document.getElementById('guest-rank-popup-register')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  document.getElementById('guest-rank-popup')?.classList.remove('open');
  if (typeof window.openAccountModal === 'function') window.openAccountModal('register');
});
document.getElementById('guest-rank-popup-login')?.addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  document.getElementById('guest-rank-popup')?.classList.remove('open');
  if (typeof window.openAccountModal === 'function') window.openAccountModal('login');
});

document.getElementById('final-confirm-wrap')?.addEventListener('click', () => {
  if (typeof confirmCooldown !== 'undefined' && confirmCooldown) return;
  if (typeof confirmCooldownLock === 'function') confirmCooldownLock();
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1; sfxCheck.play(); }
  const wrap = document.getElementById('final-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-screen').style.display = 'none';
  if (typeof showResultsScreen === 'function') showResultsScreen();
});
