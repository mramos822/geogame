// ============================================================================
// profile/profile-stats.js — Sincronización de stats local <-> Supabase y pintado del panel de perfil del
// loading (nombre, veces jugadas, promedios, highscores, rango, copa de puesto
// global, bandera del país, badge de supporter, record de versus).
// Dependencias externas (getRank de ranks.js, getGlobalRankForId/_cupForRank de
// menu/rankings-panel.js, COUNTRY_CODE_TO_FLAG, i18n) se usan sólo en runtime.
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

// Sincroniza los datos locales (scores/averages/plays) a la cuenta de Supabase al iniciar sesión.
// Es idempotente: si ya estaban sincronizados (local=0 tras el último logout), no hace nada.
async function syncLocalDataToAccount(userId) {
  try {
    const profile = await window.sbGetProfile(userId);
    const localHs = {
      flags:     parseInt(localStorage.getItem('flagsHighscore')          || '0', 10),
      shapes:    parseInt(localStorage.getItem('shapesHighscore')         || '0', 10),
      cities:    parseInt(localStorage.getItem('geochallenge_highscore')  || '0', 10),
      monuments: parseInt(localStorage.getItem('monumentsHighscore')      || '0', 10),
    };
    const modeToLsKey = { flags: 'flags', shapes: 'shapes', cities: 'game', monuments: 'monuments' };
    const updates = {};
    Object.entries(localHs).forEach(([k, v]) => {
      if (v > (profile['hs_' + k] || 0)) updates['hs_' + k] = v;
    });
    Object.entries(modeToLsKey).forEach(([dbKey, lsKey]) => {
      const sum   = parseInt(localStorage.getItem('avgSum_'   + lsKey) || '0', 10);
      const count = parseInt(localStorage.getItem('avgCount_' + lsKey) || '0', 10);
      if (sum > 0 && count > 0) {
        updates['avg_sum_'    + dbKey] = (profile['avg_sum_'    + dbKey] || 0) + sum;
        updates['play_count_' + dbKey] = (profile['play_count_' + dbKey] || 0) + count;
      }
    });
    const localPlays = parseInt(localStorage.getItem('playCount') || '0', 10);
    if (localPlays > 0) updates.play_count = (profile.play_count || 0) + localPlays;
    if (Object.keys(updates).length > 0) await window.sbUpdateProfile(userId, updates);
  } catch(e) { console.warn('[sync] error:', e.message); }
}

// Copia los hs de Supabase a localStorage (toma el máximo) para que el display
// en partida muestre el récord correcto sin necesidad de llegar al final.
function syncHsFromProfile(profile) {
  const map = {
    flagsHighscore:          profile.hs_flags     || 0,
    shapesHighscore:         profile.hs_shapes    || 0,
    geochallenge_highscore:  profile.hs_cities    || 0,
    monumentsHighscore:      profile.hs_monuments || 0,
    totalHighscore:          profile.hs_total     || 0,
  };
  Object.entries(map).forEach(([k, v]) => {
    const cur = parseInt(localStorage.getItem(k) || '0', 10);
    if (v > cur) localStorage.setItem(k, String(v));
  });
}

window.syncHsFromProfile = syncHsFromProfile;

// Fuente de verdad para los trofeos 🏆 de cada modo en la pantalla principal:
// con cuenta logueada usa el perfil de Supabase (server truth), igual que
// refreshProfileStats — si no, cae a localStorage. Antes estos badges leían
// localStorage siempre, sin importar la sesión: un reset de stats en la base
// (o jugar highscore nuevo en otro dispositivo) no se reflejaba acá hasta
// que se jugaba localmente de nuevo.
function _loadingHsValues() {
  const p = window._sbProfile;
  if (p && window._accountLoggedIn) {
    return { play: p.hs_cities || 0, flags: p.hs_flags || 0, shapes: p.hs_shapes || 0, mode4: p.hs_monuments || 0 };
  }
  return {
    play:   parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10),
    flags:  parseInt(localStorage.getItem('flagsHighscore')         || '0', 10),
    shapes: parseInt(localStorage.getItem('shapesHighscore')        || '0', 10),
    mode4:  parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10),
  };
}
window._loadingHsValues = _loadingHsValues;

// Ruta de la bandera del país (código ISO2) para el circulito de perfil.
function flagUrlForCountryCode(cc) {
  const file = cc && window.COUNTRY_CODE_TO_FLAG ? window.COUNTRY_CODE_TO_FLAG[cc.toUpperCase()] : null;
  return file ? `images/flags/${file}.png` : null;
}
window.flagUrlForCountryCode = flagUrlForCountryCode;

// La copa (izquierda del "Has jugado X veces") y la bandera (derecha del
// nombre) viven fuera de esos textos, como elementos absolutos aparte, para
// no tener que tocar el flex interno del name-wrap. Pero eso significa que
// si solo se pega el badge al costado del texto YA centrado (left:50%), el
// conjunto [badge+texto] queda descentrado — el texto sigue en el medio y el
// badge cuelga para un lado. Acá se centra el PAR como si fuera un solo
// bloque: se corre el texto la mitad del ancho del badge (+gap) hacia el
// lado contrario, y el badge se pega justo al lado de esa nueva posición.
const BADGE_TEXT_GAP = 40; // px, separación entre el badge y el texto
function _centerBadgeWithText(textEl, badgeEl, side) {
  if (!textEl || !badgeEl) return;
  const parent = badgeEl.offsetParent;
  if (!parent) return;

  // Centro NATURAL del texto: el que le da su propio CSS sin ningún corrimiento
  // nuestro (no siempre es el 50% del panel — el name-wrap del amigo, por
  // ejemplo, se centra un poco más a la izquierda que el propio para quedar
  // entre el back y la foto). Se limpia el left inline y se mide en vivo, así
  // esto funciona sea cual sea ese centro sin tener que hardcodearlo acá.
  textEl.style.left = '';
  if (badgeEl.style.display === 'none') return;

  // getBoundingClientRect() da coordenadas de PANTALLA (post transform/zoom del
  // #app-stage, ver letterbox.js), pero `left` inline se mide en el espacio
  // LOCAL sin escalar del stage (1920×911, contra el que se calculan las cq).
  // Sin dividir por --app-fit, esta cuenta solo daba bien con la ventana al
  // tamaño de referencia exacto y se desalineaba (nombre/bandera/copa
  // "reaccionando" al resize/zoom) en cualquier otro tamaño. offsetWidth/
  // offsetHeight ya están en local (los transforms no afectan al layout), así
  // que esos no se tocan — solo los deltas que salen de getBoundingClientRect().
  const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-fit')) || 1;

  const parentRect      = parent.getBoundingClientRect();
  const naturalRect     = textEl.getBoundingClientRect();
  const naturalCenterX  = (naturalRect.left - parentRect.left) / fit + textEl.offsetWidth / 2;
  const badgeW  = badgeEl.offsetWidth;
  const textW   = textEl.offsetWidth;
  const shift   = (badgeW + BADGE_TEXT_GAP) / 2;

  let textCenterX, badgeLeftPx;
  if (side === 'before') { // badge a la izquierda del texto (la copa)
    textCenterX = naturalCenterX + shift;
    const textLeftEdge = textCenterX - textW / 2;
    badgeLeftPx = textLeftEdge - BADGE_TEXT_GAP; // badge usa translate(-100%,-50%): left = su borde derecho
  } else { // side === 'after' — badge a la derecha del texto (la bandera)
    textCenterX = naturalCenterX - shift;
    const textRightEdge = textCenterX + textW / 2;
    badgeLeftPx = textRightEdge + BADGE_TEXT_GAP; // badge usa translate(0,-50%): left = su borde izquierdo
  }
  // El transform:translate(-50%,...) que ya trae el CSS del texto termina de
  // centrarlo sobre este punto (mismo mecanismo que su 'left:50%' original).
  textEl.style.left = textCenterX + 'px';
  badgeEl.style.left = badgeLeftPx + 'px';
  const textRect = textEl.getBoundingClientRect(); // ya en su posición final (pantalla)
  badgeEl.style.top = (textRect.top - parentRect.top) / fit + textEl.offsetHeight / 2 + 'px';
}
window._centerBadgeWithText = _centerBadgeWithText;

function _repositionVisibleRankBadges() {
  // La copa vive en el renglón de "Has jugado X veces" (no en el del nombre).
  const ownBadge = document.getElementById('profile-rank-badge');
  const ownPlayCount = document.getElementById('loading-play-count');
  if (ownBadge && ownPlayCount) _centerBadgeWithText(ownPlayCount, ownBadge, 'before');
  const friendBadge = document.getElementById('loading-friend-rank-badge');
  const friendPlayCount = document.getElementById('loading-friend-play-count');
  if (friendBadge && friendPlayCount) _centerBadgeWithText(friendPlayCount, friendBadge, 'before');

  const ownWrap = document.getElementById('loading-name-wrap');
  const ownFlag = document.getElementById('profile-flag-badge');
  if (ownFlag && ownWrap) _centerBadgeWithText(ownWrap, ownFlag, 'after');
  const friendWrap = document.querySelector('#loading-friend-group .loading-name-wrap');
  const friendFlag = document.getElementById('loading-friend-flag-badge');
  if (friendFlag && friendWrap) _centerBadgeWithText(friendWrap, friendFlag, 'after');
}
window.addEventListener('resize', () => requestAnimationFrame(_repositionVisibleRankBadges));

// Si la cuenta todavía no tiene guardado el país donde fue creada (cuentas
// viejas, previas a este feature), lo detecta por IP en este login y lo
// guarda como si fuera el de creación (backfill silencioso, ver memoria).
async function _ensureCountryCode(profile) {
  if (!profile || !profile.id || profile.country_code) return;
  try {
    let cc = localStorage.getItem('_an_country');
    if (!cc) {
      const r = await fetch('https://ipinfo.io/json');
      const d = await r.json();
      cc = (d && d.country) || '';
      localStorage.setItem('_an_country', cc);
    }
    if (!cc) return;
    await window.sbUpdateProfile(profile.id, { country_code: cc });
    profile.country_code = cc;
    if (window._sbProfile && window._sbProfile.id === profile.id) window._sbProfile.country_code = cc;
    if (typeof window.refreshProfileStats === 'function') window.refreshProfileStats();
  } catch (e) {}
}
window._ensureCountryCode = _ensureCountryCode;

// Limpia los scores locales al cerrar sesión (quedan en cero para el perfil guest).
function clearLocalScores(full = false) {
  const keys = ['playCount','avgSum_flags','avgSum_shapes','avgSum_game','avgSum_monuments',
                 'avgCount_flags','avgCount_shapes','avgCount_game','avgCount_monuments'];
  // Solo en logout completo se borran también los hs (vuelven a 0 en modo guest)
  if (full) keys.push('geochallenge_highscore','flagsHighscore','shapesHighscore','monumentsHighscore','totalHighscore');
  keys.forEach(k => localStorage.removeItem(k));
}

// Actualiza el panel de perfil (nombre, veces jugadas, promedios, highscores,
// rango). Se llama al cargar y cada vez que se vuelve al loading screen, para
// que refleje los datos de la última partida (Supabase si está logueado, local si no).
window.refreshProfileStats = function () {
  const p = window._sbProfile;
  let flagsHs, shapesHs, playHs, monumentsHs, plays, avgs;
  if (p && window._accountLoggedIn) {
    flagsHs     = p.hs_flags     || 0;
    shapesHs    = p.hs_shapes    || 0;
    playHs      = p.hs_cities    || 0;
    monumentsHs = p.hs_monuments || 0;
    plays       = p.play_count   || 0;
    avgs = {
      1: p.avg_sum_flags     && (p.play_count_flags     || plays) ? Math.round(p.avg_sum_flags     / (p.play_count_flags     || plays)) : 0,
      2: p.avg_sum_shapes    && (p.play_count_shapes    || plays) ? Math.round(p.avg_sum_shapes    / (p.play_count_shapes    || plays)) : 0,
      3: p.avg_sum_cities    && (p.play_count_cities    || plays) ? Math.round(p.avg_sum_cities    / (p.play_count_cities    || plays)) : 0,
      4: p.avg_sum_monuments && (p.play_count_monuments || plays) ? Math.round(p.avg_sum_monuments / (p.play_count_monuments || plays)) : 0,
    };
  } else {
    flagsHs     = parseInt(localStorage.getItem('flagsHighscore')         || '0', 10);
    shapesHs    = parseInt(localStorage.getItem('shapesHighscore')        || '0', 10);
    playHs      = parseInt(localStorage.getItem('geochallenge_highscore') || '0', 10);
    monumentsHs = parseInt(localStorage.getItem('monumentsHighscore')     || '0', 10);
    plays       = parseInt(localStorage.getItem('playCount')              || '0', 10);
    const avgKeys = { 1: 'flags', 2: 'shapes', 3: 'game', 4: 'monuments' };
    avgs = {};
    [1,2,3,4].forEach(i => {
      const sum   = parseInt(localStorage.getItem('avgSum_'   + avgKeys[i]) || '0', 10);
      const count = parseInt(localStorage.getItem('avgCount_' + avgKeys[i]) || '0', 10);
      avgs[i] = count > 0 ? Math.round(sum / count) : 0;
    });
  }
  const elName = document.getElementById('loading-player-name');
  if (elName) elName.textContent = localStorage.getItem('playerName') || 'John';
  const badgeEl = document.getElementById('loading-supporter-badge');
  if (badgeEl) badgeEl.style.display = (p && p.is_supporter) ? '' : 'none';
  const elPlays = document.getElementById('loading-play-count');
  if (elPlays) elPlays.textContent = tn('profile.playedTimes', plays);
  // Record de versus (solo con cuenta; oculto si nunca jugó versus)
  const vsEl = document.getElementById('loading-vs-record');
  if (vsEl) {
    const w = (p && window._accountLoggedIn) ? (p.vs_wins || 0) : 0;
    const l = (p && window._accountLoggedIn) ? (p.vs_losses || 0) : 0;
    if (p && window._accountLoggedIn && (w > 0 || l > 0)) {
      vsEl.style.display = '';
      vsEl.innerHTML = t('profile.vsRecord', { w: `<span class="vs-w">${w}</span>`, l: `<span class="vs-l">${l}</span>` });
    } else {
      vsEl.style.display = 'none';
    }
  }
  if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
  const gamesHs = { 1: flagsHs, 2: shapesHs, 3: playHs, 4: monumentsHs };
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('loading-games-avg' + i);
    if (el) el.textContent = gamesHs[i].toLocaleString();
  });
  [1,2,3,4].forEach(i => {
    const el = document.getElementById('loading-games-hs' + i);
    if (el) el.textContent = avgs[i].toLocaleString();
  });
  const rankEl = document.getElementById('loading-games-rank');
  if (rankEl && typeof getRank === 'function') {
    const totalHs = flagsHs + shapesHs + playHs + monumentsHs;
    const totalEl = document.getElementById('loading-games-total');
    if (totalEl) totalEl.textContent = totalHs.toLocaleString();
    const rk = getRank(totalHs);
    if (rk) rankEl.src = rk.img;
    const rankLabel = document.getElementById('loading-games-rank-label');
    if (rankLabel && rk) {
      rankLabel.textContent = rk.name;
      const maxWidth = (document.getElementById('loading-games-rank')?.offsetWidth || 240) * 1.15;
      let size = 4;
      rankLabel.style.fontSize = size + 'cqmin';
      while (rankLabel.scrollWidth > maxWidth && size > 1.6) {
        size -= 0.1;
        rankLabel.style.fontSize = size + 'cqmin';
      }
    }
  }

  // Copa + puesto global (solo cuentas registradas: los invitados no están en rankings).
  const rankBadge = document.getElementById('profile-rank-badge');
  if (rankBadge) {
    if (p && window._accountLoggedIn && p.id && typeof window.getGlobalRankForId === 'function') {
      window.getGlobalRankForId(p.id).then(pos => {
        if (!pos) { rankBadge.style.display = 'none'; _centerBadgeWithText(document.getElementById('loading-play-count'), rankBadge, 'before'); return; }
        rankBadge.style.display = '';
        const cupEl = document.getElementById('profile-rank-cup');
        const numEl = document.getElementById('profile-rank-num');
        if (cupEl) cupEl.src = `images/cups/${window._cupForRank(pos)}.png`;
        if (numEl) numEl.textContent = '#' + pos;
        _centerBadgeWithText(document.getElementById('loading-play-count'), rankBadge, 'before');
      }).catch(() => { rankBadge.style.display = 'none'; _centerBadgeWithText(document.getElementById('loading-play-count'), rankBadge, 'before'); });
    } else {
      rankBadge.style.display = 'none';
      _centerBadgeWithText(document.getElementById('loading-play-count'), rankBadge, 'before');
    }
  }

  // Bandera del país de creación de la cuenta.
  const flagBadge = document.getElementById('profile-flag-badge');
  if (flagBadge) {
    const flagUrl = (p && window._accountLoggedIn) ? window.flagUrlForCountryCode?.(p.country_code) : null;
    const nameWrap = document.getElementById('loading-name-wrap');
    if (flagUrl) {
      flagBadge.style.display = '';
      const img = document.getElementById('profile-flag-badge-img');
      if (img) img.src = flagUrl;
      _centerBadgeWithText(nameWrap, flagBadge, 'after');
    } else {
      flagBadge.style.display = 'none';
      _centerBadgeWithText(nameWrap, flagBadge, 'after');
    }
  }

  if (typeof window._applyFounderFrame === 'function') window._applyFounderFrame();
};
