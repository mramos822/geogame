// ── FINAL ────────────────────────────────────────────────────────────────────

const finalScreen = document.getElementById('final-screen');

function fitRankLabel(id, maxWidth) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.fontSize = '';
  let size = 40;
  el.style.fontSize = size + 'px';
  while (el.scrollWidth > maxWidth && size > 14) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}

let finalBackTimeout = null;

function showFinalScreen() {
  finalScreen.style.display = 'block';
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
  const total = hs1 + hs2 + hs3 + hs4;
  const rank  = typeof getRank === 'function' ? getRank(total) : null;
  const label = document.getElementById('final-rank-label');
  if (label && rank) { label.textContent = rank.name; fitRankLabel('final-rank-label', 480); }
  const scoreEl = document.getElementById('final-points-score');
  if (scoreEl) scoreEl.textContent = total.toLocaleString();
  const playerName = localStorage.getItem('playerName') || 'John';
  const nameEl = document.getElementById('final-player-name');
  if (nameEl) nameEl.textContent = playerName;

  const friends = (typeof MOCK_FRIENDS !== 'undefined' ? MOCK_FRIENDS : []);
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
  const STEP_X = 22;  // vw por puesto
  const STEP_Y = -11; // vw por puesto (2:1)
  const N = ranking.length;
  const playerName = localStorage.getItem('playerName') || 'John';

  for (let i = N - 1; i >= 0; i--) {
    const entry = ranking[i];
    // dejar hueco en mi puesto
    if (entry.name === playerName && (i + 1) === playerPos) continue;
    const k = (N - 1) - i; // 0 = más bajo
    const rk = typeof getRank === 'function' ? getRank(entry.score) : null;
    const labelId = `final-fc-label-${i}`;

    const group = document.createElement('div');
    group.className = 'final-group5';
    group.style.transform = `translate(${k * STEP_X}vw, ${k * STEP_Y}vw) scale(0.9)`;

    group.innerHTML =
      `<img class="final-cloud5" src="images/bg/cloud5.png" alt="" draggable="false" oncontextmenu="return false">` +
      `<span class="final2-position">${i + 1}</span>` +
      `<span class="final2-player-name">${entry.name}</span>` +
      `<span class="final2-rank-label" id="${labelId}">${rk ? rk.name : ''}</span>` +
      `<div class="final2-avatar"><img class="final2-avatar-img" src="images/ppdefault.png" alt="" draggable="false" oncontextmenu="return false"></div>` +
      `<div class="final2-points-wrap">` +
        `<img class="final2-points-img" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
        `<span class="final2-points-score">${entry.score.toLocaleString()}</span>` +
      `</div>`;
    container.appendChild(group);
    fitRankLabel(labelId, 360);
    const cloudImg = group.querySelector('.final-cloud5');
    if (cloudImg) {
      const dur = 6 + Math.random() * 5;       // 6–11s
      const delay = -Math.random() * dur;      // arranca en fase aleatoria
      cloudImg.style.animationDuration = dur.toFixed(2) + 's';
      cloudImg.style.animationDelay = delay.toFixed(2) + 's';
    }
  }

  // mi puesto desde abajo (0 = más bajo)
  const playerK = N - playerPos;
  const endX = -(playerK * STEP_X);
  const endY = -(playerK * STEP_Y);
  const startX = endX + 240;
  const startY = endY - 120;

  const anim = container.animate(
    [
      { transform: `translate(${startX}vw, ${startY}vw)` },
      { transform: `translate(${endX}vw, ${endY}vw)` },
    ],
    { duration: 7500, delay: 3000, easing: 'ease-out', fill: 'both' }
  );

  // poner gris las nubes que mi avión va pasando (cruzan el centro)
  const groups = Array.from(container.querySelectorAll('.final-group5'));
  const centerX = window.innerWidth / 2;
  let running = true;
  anim.addEventListener('finish', () => { running = false; checkPass(); });
  function checkPass() {
    groups.forEach(g => {
      if (g.classList.contains('passed')) return;
      const cloud = g.querySelector('.final-cloud5');
      if (!cloud) return;
      const r = cloud.getBoundingClientRect();
      if (r.left + r.width / 2 < centerX) g.classList.add('passed');
    });
  }
  function loop() {
    checkPass();
    if (running) requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

function hideFinalScreen() {
  finalScreen.style.display = 'none';
  clearTimeout(finalBackTimeout);
  document.getElementById('final-confirm-back-wrap')?.classList.remove('visible');
}

document.getElementById('final-confirm-back-wrap')?.addEventListener('click', () => {
  if (typeof confirmCooldown !== 'undefined' && confirmCooldown) return;
  if (typeof confirmCooldownLock === 'function') confirmCooldownLock();
  const a = new Audio('sfx/check.mp3');
  a.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1;
  a.play();
  const w = document.getElementById('final-confirm-back-wrap');
  w.classList.add('confirm-pressed');
  setTimeout(() => w.classList.remove('confirm-pressed'), 50);
  if (typeof window.stopResultsMusic === 'function') window.stopResultsMusic();
  hideFinalScreen();
  document.getElementById('loading-screen').style.display = '';
});
document.getElementById('final-confirm-back-wrap')?.addEventListener('mouseenter', () => { if (typeof playSelect === 'function') playSelect(); });
document.getElementById('final-confirm-back-wrap')?.addEventListener('mouseleave', () => { if (typeof playSelect === 'function') playSelect(); });

document.getElementById('final-confirm-wrap')?.addEventListener('click', () => {
  if (typeof confirmCooldown !== 'undefined' && confirmCooldown) return;
  if (typeof confirmCooldownLock === 'function') confirmCooldownLock();
  const a = new Audio('sfx/check.mp3');
  a.volume = (typeof isMuted !== 'undefined' && isMuted) ? 0 : 1;
  a.play();
  const wrap = document.getElementById('final-confirm-wrap');
  wrap.classList.add('confirm-pressed');
  setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
  document.getElementById('loading-screen').style.display = 'none';
  showFinalScreen();
});
