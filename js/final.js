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
      const avatarEl = document.querySelector('.final-avatar');
      if (!avatarEl) return;
      const group = document.getElementById('final-group');
      const groupW = group ? group.offsetWidth : (window.STAGE_W || window.innerWidth);
      // Achica el nombre hasta que quepa en el 55% derecho de la nube
      const maxNameW = groupW * 0.52;
      let fs = parseFloat(getComputedStyle(nameEl).fontSize);
      while (nameEl.scrollWidth > maxNameW && fs > 8) {
        fs -= 0.5;
        nameEl.style.fontSize = fs + 'px';
      }
      // Mueve la foto según cuánto se extiende el nombre a la izquierda
      const avatarRect = avatarEl.getBoundingClientRect();
      const nameRect   = nameEl.getBoundingClientRect();
      const overlap    = avatarRect.right - nameRect.left + 4; // 4px de margen
      if (overlap > 0) {
        const pct = overlap / groupW * 100;
        const cur = parseFloat(avatarEl.style.left) || 40;
        avatarEl.style.left = Math.max(10, cur - pct) + '%';
      } else {
        avatarEl.style.left = '40%';
      }
    });
  }

  const friends = (typeof getFriends === 'function' ? getFriends() : []);
  const ranking = [...friends, { name: playerName, score: total }]
    .sort((a, b) => b.score - a.score);
  const pos = ranking.findIndex(p => p.name === playerName && p.score === total) + 1;
  const posEl = document.getElementById('final-position');
  if (posEl) posEl.textContent = pos;

  buildFriendClouds(ranking, pos);
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
      `<span class="final2-player-name">${entry.name}</span>` +
      `<span class="final2-rank-label" id="${labelId}">${rk ? rk.name : ''}</span>` +
      `<div class="final2-avatar"><img class="final2-avatar-img" src="images/profilepic/ppdefault.png" alt="" draggable="false" oncontextmenu="return false"></div>` +
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

  // Setear la posición inicial directamente en el estilo — en iOS el compositor
  // no aplica el from-keyframe durante el delay de fill:both, dejando el
  // container en (0,0) hasta que la animación arranca. Así queda correcto
  // desde el primer frame aunque la animación tarde 3s en empezar.
  container.style.transform = `translate(${startX}px, ${startY}px)`;

  const anim = container.animate(
    [
      { transform: `translate(${startX}px, ${startY}px)` },
      { transform: `translate(${endX}px, ${endY}px)` },
    ],
    { duration: 7500, delay: 3000, easing: 'ease-out', fill: 'forwards' }
  );

  // Poner gris las nubes que el container arrastra más allá del centro.
  // No se usa getBoundingClientRect porque en iOS el compositor anima el
  // container en un thread separado y getBCR devuelve la posición layout
  // (pre-animación), causando marcado incorrecto. Se calcula la posición
  // matemáticamente a partir del progreso de la animación.
  //
  // Cloud k cruza el centro cuando easeOut(f) == 1 - (playerK-k)*STEP_X/240.
  // Solo nubes con k < playerK cruzan (las de k > playerK quedan a la derecha).
  const groups = Array.from(container.querySelectorAll('.final-group5'));
  let animRunning = true;
  let animStartTime = null;
  const ANIM_DUR = 7500;
  const ANIM_DELAY = 3000;
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
  function loop(ts) {
    if (!animStartTime) animStartTime = ts;
    const f = Math.min(1, (ts - animStartTime) / ANIM_DUR);
    checkPassMath(easeOutQ(f));
    if (animRunning) requestAnimationFrame(loop);
  }
  anim.addEventListener('finish', () => { animRunning = false; checkPassMath(1); });
  setTimeout(() => requestAnimationFrame(loop), ANIM_DELAY);
}

function hideFinalScreen() {
  finalScreen.style.display = 'none';
  clearTimeout(finalBackTimeout);
  document.getElementById('final-confirm-back-wrap')?.classList.remove('visible');
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
