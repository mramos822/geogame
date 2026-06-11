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

function showFinalScreen() {
  finalScreen.style.display = 'block';
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
  // Acumular para promedios por modo (segunda columna del loading)
  [['flags', hs1], ['shapes', hs2], ['game', hs3], ['monuments', hs4]].forEach(([k, v]) => {
    localStorage.setItem('avgSum_' + k,   String(parseInt(localStorage.getItem('avgSum_' + k)   || '0', 10) + v));
    localStorage.setItem('avgCount_' + k, String(parseInt(localStorage.getItem('avgCount_' + k) || '0', 10) + 1));
  });
  const total = hs1 + hs2 + hs3 + hs4;
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
      const group  = document.getElementById('final-group');
      const groupW = group ? group.offsetWidth : (window.STAGE_W || window.innerWidth);
      // Achica el nombre si es muy largo (avatar+nombre viven en flex row centrado)
      const maxNameW = groupW * 0.40;
      let fs = parseFloat(getComputedStyle(nameEl).fontSize);
      while (nameEl.scrollWidth > maxNameW && fs > 8) {
        fs -= 0.5;
        nameEl.style.fontSize = fs + 'px';
      }
    });
  }

  const friends = (typeof getFriends === 'function' ? getFriends() : []);
  const ranking = [...friends, { name: playerName, score: total }]
    .sort((a, b) => b.score - a.score);
  const pos = ranking.findIndex(p => p.name === playerName && p.score === total) + 1;
  const posEl = document.getElementById('final-position');
  if (posEl) posEl.textContent = pos;

  // Doble rAF: iOS batea display:block + transform en el mismo frame JS y el
  // compositor ignora el transform hasta que hay un repaint externo. Deferir
  // la construcción de nubes garantiza que el elemento ya está pintado.
  requestAnimationFrame(() => requestAnimationFrame(() => buildFriendClouds(ranking, pos)));
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

  // Ventana "top 11": yo + 5 por encima + 5 por debajo. En los bordes se
  // desplaza para mantener 11 (si hay suficientes), sin sobrecargar de nubes.
  const HALF = 5;
  const fullN = ranking.length;
  let start = playerPos - HALF;          // puesto real (1-based) del tope de la ventana
  let end   = playerPos + HALF;
  if (start < 1)      { end += (1 - start);     start = 1; }
  if (end > fullN)    { start -= (end - fullN); end = fullN; }
  if (start < 1)      start = 1;
  const windowed = ranking.slice(start - 1, end); // sigue ordenado desc
  const N = windowed.length;                       // <= 11
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
      `<div class="final2-name-group">` +
        `<div class="final2-avatar"><img class="final2-avatar-img" src="images/profilepic/ppdefault.png" alt="" draggable="false" oncontextmenu="return false"></div>` +
        `<span class="final2-player-name">${entry.name}</span>` +
      `</div>` +
      `<span class="final2-rank-label" id="${labelId}">${rk ? rk.name : ''}</span>` +
      `<div class="final2-points-wrap">` +
        `<img class="final2-points-img" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="final2-points-score">${entry.score.toLocaleString()}</span>` +
      `</div>`;
    container.appendChild(group);
    fitRankLabel(labelId, 31.6); // 39.5 / 1.25
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

  // Flush de layout antes del transform inicial.
  void container.offsetHeight; // eslint-disable-line no-void

  // translateZ(0) fuerza al container a tener su propia capa compositor en iOS.
  // Sin esto, el container hereda la capa del #app-stage-outer (position:fixed)
  // cuya posición Y puede estar desincronizada hasta que el browser recibe un
  // resize/orientationchange. Con su propia capa, el transform se aplica de forma
  // independiente y se ve correcto desde el primer frame.
  container.style.transform = `translate(${startX}px, ${startY}px) translateZ(0)`;
  void container.offsetHeight;

  const ANIM_DUR   = 7500;
  const ANIM_DELAY = 3000;
  const groups = Array.from(container.querySelectorAll('.final-group5'));
  function easeOutQ(t) { return 1 - (1 - t) * (1 - t); }
  function checkPassMath(ep) {
    groups.forEach(g => {
      if (g.classList.contains('passed')) return;
      const gk = parseInt(g.dataset.k);
      if (isNaN(gk) || gk >= playerK) return;
      const threshold = 1 - (playerK - gk) * STEP_X / (240 * CQW);
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
      container.style.transform  = `translate(${endX}px, ${endY}px) translateZ(0)`;
      container.addEventListener('transitionend', () => {
        container.style.transition = '';
        container.style.transform  = `translate(${endX}px, ${endY}px)`; // liberar capa Z
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
  document.getElementById('loading-screen').style.display = '';
  document.getElementById('loading-screen').classList.remove('table-shown');
  document.getElementById('loading-table-group')?.classList.add('table-gone');
  if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  // Liberar la RAM de la campaña recién terminada (fondos/personajes/ranks/canvas/
  // video). Así la app no acumula memoria entre sesiones y la siguiente partida o
  // entrar a social arranca con baseline bajo, sin necesidad de recargar la página.
  if (typeof window.releaseGameMemory === 'function') window.releaseGameMemory();
});
document.getElementById('final-confirm-back-wrap')?.addEventListener('mouseenter', () => { if (typeof playSelect === 'function') playSelect(); });
document.getElementById('final-confirm-back-wrap')?.addEventListener('mouseleave', () => { if (typeof playSelect === 'function') playSelect(); });

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
