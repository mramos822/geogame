// ============================================================================
// profile/profile-stats.js — local <-> Supabase stats sync and painting of the
// loading-screen profile panel (name, plays, averages, highscores, rank, global
// rank cup, country flag, supporter badge, versus record).
// External deps (getRank from ranks.js, getGlobalRankForId/_cupForRank from
// menu/rankings-panel.js, COUNTRY_CODE_TO_FLAG, i18n) are used only at runtime.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// Sync local data (scores/averages/plays) to the Supabase account on login.
// Idempotent: if already synced (local=0 after last logout), does nothing.
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

// Copy the hs from Supabase to localStorage (takes the max) so the in-game
// display shows the correct record without having to reach the end.
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

// Source of truth for each mode's 🏆 on the main screen: when logged in, uses
// the Supabase profile (server truth), like refreshProfileStats — otherwise
// falls back to localStorage. These badges used to always read localStorage
// regardless of session: a stats reset in the DB (or a new highscore on another
// device) wasn't reflected here until playing locally again.
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

// Country flag path (ISO2 code) for the profile circle.
function flagUrlForCountryCode(cc) {
  const file = cc && window.COUNTRY_CODE_TO_FLAG ? window.COUNTRY_CODE_TO_FLAG[cc.toUpperCase()] : null;
  return file ? `images/flags/${file}.png` : null;
}
window.flagUrlForCountryCode = flagUrlForCountryCode;

// The cup (left of "played X times") and the flag (right of the name) live
// outside those texts, as separate absolute elements, to avoid touching the
// name-wrap's inner flex. But that means pinning the badge next to an
// already-centered text (left:50%) leaves the [badge+text] pair off-center —
// the text stays centered and the badge hangs to one side. Here the PAIR is
// centered as one block: the text is shifted half the badge width (+gap) the
// other way, and the badge is pinned right next to that new position.
const BADGE_TEXT_GAP = 40; // px, gap between badge and text
function _centerBadgeWithText(textEl, badgeEl, side) {
  if (!textEl || !badgeEl) return;
  const parent = badgeEl.offsetParent;
  if (!parent) return;

  // NATURAL center of the text: the one its own CSS gives it without any shift
  // of ours (not always 50% of the panel — the friend's name-wrap, for example,
  // centers a bit further left than one's own to sit between the back button
  // and the photo). Clear the inline left and measure live, so this works
  // whatever that center is without hardcoding it here.
  textEl.style.left = '';
  if (badgeEl.style.display === 'none') return;

  // getBoundingClientRect() gives SCREEN coordinates (after the #app-stage
  // transform/zoom, see letterbox.js), but inline `left` is measured in the
  // stage's unscaled LOCAL space (1920×911, against which cq is computed).
  // Without dividing by --app-fit, this math was only right at the exact
  // reference window size and misaligned (name/flag/cup "reacting" to
  // resize/zoom) at any other size. offsetWidth/offsetHeight are already local
  // (transforms don't affect layout), so those aren't touched — only the deltas
  // from getBoundingClientRect().
  const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-fit')) || 1;

  const parentRect      = parent.getBoundingClientRect();
  const naturalRect     = textEl.getBoundingClientRect();
  const naturalCenterX  = (naturalRect.left - parentRect.left) / fit + textEl.offsetWidth / 2;
  const badgeW  = badgeEl.offsetWidth;
  const textW   = textEl.offsetWidth;
  const shift   = (badgeW + BADGE_TEXT_GAP) / 2;

  let textCenterX, badgeLeftPx;
  if (side === 'before') { // badge left of the text (the cup)
    textCenterX = naturalCenterX + shift;
    const textLeftEdge = textCenterX - textW / 2;
    badgeLeftPx = textLeftEdge - BADGE_TEXT_GAP; // badge uses translate(-100%,-50%): left = its right edge
  } else { // side === 'after' — badge right of the text (the flag)
    textCenterX = naturalCenterX - shift;
    const textRightEdge = textCenterX + textW / 2;
    badgeLeftPx = textRightEdge + BADGE_TEXT_GAP; // badge uses translate(0,-50%): left = its left edge
  }
  // The transform:translate(-50%,...) already in the text's CSS finishes
  // centering it on this point (same mechanism as its original 'left:50%').
  textEl.style.left = textCenterX + 'px';
  badgeEl.style.left = badgeLeftPx + 'px';
  const textRect = textEl.getBoundingClientRect(); // now at its final position (screen)
  badgeEl.style.top = (textRect.top - parentRect.top) / fit + textEl.offsetHeight / 2 + 'px';
}
window._centerBadgeWithText = _centerBadgeWithText;

function _repositionVisibleRankBadges() {
  // The cup lives on the "played X times" line (not the name line).
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

// If the account has no stored creation country (old accounts predating this
// feature), detect it by IP on this login and store it as the creation one
// (silent backfill).
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

// Clear local scores on logout (reset to zero for the guest profile).
function clearLocalScores(full = false) {
  const keys = ['playCount','avgSum_flags','avgSum_shapes','avgSum_game','avgSum_monuments',
                 'avgCount_flags','avgCount_shapes','avgCount_game','avgCount_monuments'];
  // Only a full logout also clears the hs (back to 0 in guest mode)
  if (full) keys.push('geochallenge_highscore','flagsHighscore','shapesHighscore','monumentsHighscore','totalHighscore');
  keys.forEach(k => localStorage.removeItem(k));
}

// Update the profile panel (name, plays, averages, highscores, rank). Called on
// load and every time we return to the loading screen, so it reflects the last
// game's data (Supabase if logged in, local otherwise).
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
  // Versus record (account only; hidden if never played versus)
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
    // Rank/"total" shown here is the best Gira Mundial (campaign) result, not
    // the sum of each mode's own best game (those can come from 4 different
    // sessions never actually played together) — same as rankings-panel.js.
    const totalHs = (p && window._accountLoggedIn) ? (p.hs_total || 0)
      : (parseInt(localStorage.getItem('totalHighscore') || '0', 10) || 0);
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

  // Cup + global rank (registered accounts only: guests aren't in rankings).
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

  // Flag of the account's creation country.
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
