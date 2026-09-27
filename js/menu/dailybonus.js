// ── Daily login bonus popup ──────────────────────────────────────────────────
// When a logged-in player reaches the menu and hasn't claimed today's bonus yet, a popup shows a
// 7-day strip (10, 15, 20, 30, 40, 50, then 75 from day 7 on — day 7+ always pays the same).
// Coming back every consecutive day raises the amount; missing a day starts over at day 1.
//
// Everything that matters is server-side (get_daily_bonus / claim_daily_bonus RPCs, table
// daily_bonus_claims — see supabase/migrations/20260927000000_daily_bonus.sql): the amounts shown here
// are only for display, the claimed amount comes from the server. Guests get no bonus.
(function () {
  const REWARDS = [10, 15, 20, 30, 40, 50, 75];
  const tt = (k, v) => (typeof t === 'function' ? t(k, v) : k);
  let _checked = false, _tries = 0;

  function menuIsFree() {
    const ls = document.getElementById('loading-screen');
    if (!window.__loadingReady || !ls || !ls.offsetWidth) return false;
    if (!document.getElementById('loading-topbars')?.classList.contains('topbars-in')) return false;
    if (document.getElementById('name-prompt')?.classList.contains('visible')) return false;
    if (document.getElementById('account-modal')?.classList.contains('open')) return false;
    if (document.querySelector('.levelup-overlay, .daily-overlay, .reward-input-shield')) return false;
    if (window.__gqPendingReward || window.__pendingLevelUp) return false;
    return true;
  }

  function buildDays(day) {
    const today = Math.min(Math.max(day, 1), 7);
    let html = '';
    for (let d = 1; d <= 7; d++) {
      const cls = d < today ? 'claimed' : d === today ? 'today' : 'future';
      html += '<div class="daily-day ' + cls + '">' +
        '<span class="daily-day-name">' + (d === 7 ? tt('daily.day7') : tt('daily.day', { n: d })) + '</span>' +
        '<img class="daily-day-coin" src="images/coins.png" alt="" draggable="false">' +
        '<span class="daily-day-val">+' + REWARDS[d - 1] + '</span>' +
        (d < today ? '<span class="daily-day-check">✓</span>' : '') +
        '</div>';
    }
    return html;
  }

  function showPopup(state) {
    return new Promise((resolve) => {
      const stage = document.getElementById('app-stage') || document.body;
      const el = document.createElement('div');
      el.className = 'levelup-overlay daily-overlay';
      el.innerHTML =
        '<div class="levelup-card daily-card">' +
          '<div class="levelup-rays"></div>' +
          '<span class="levelup-title">' + tt('daily.title') + '</span>' +
          '<span class="levelup-sub">' + tt(state.day > 1 ? 'daily.streak' : 'daily.sub', { n: state.day }) + '</span>' +
          '<div class="daily-days">' + buildDays(state.day) + '</div>' +
          (state.day >= 7 ? '<span class="daily-note">' + tt('daily.max') + '</span>' : '<span class="daily-note">' + tt('daily.keepGoing') + '</span>') +
          '<div class="levelup-confirm daily-claim">' +
            '<img class="levelup-confirm-1" src="images/confirm1.png" alt="" draggable="false">' +
            '<img class="levelup-confirm-2" src="images/confirm2.png" alt="" draggable="false">' +
          '</div>' +
        '</div>';
      stage.appendChild(el);
      try { if (typeof sfxBonus !== 'undefined') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); } } catch (e) {}
      let busy = false;
      el.querySelector('.daily-claim').addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        try { if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } } catch (e) {}
        let res = null;
        try { const r = await window.sb.rpc('claim_daily_bonus'); res = r && r.data; } catch (e) {}
        const coin = el.querySelector('.daily-day.today .daily-day-coin');
        const cr = coin.getBoundingClientRect();
        const rect = { left: cr.left, top: cr.top, width: cr.width, height: cr.height, right: cr.right, bottom: cr.bottom };
        el.classList.add('out');
        setTimeout(() => el.remove(), 250);
        resolve({ res, rect });
      });
    });
  }

  async function run() {
    if (_checked) return;
    if (!window._sbUserId || !window.sb) return;
    _checked = true;
    let state = null;
    try { const r = await window.sb.rpc('get_daily_bonus'); state = r && r.data; } catch (e) {}
    if (!state || !state.claimable) return;
    const { res, rect } = await showPopup(state);
    if (!res || !res.claimed || !(res.coins > 0)) return;
    const ls = document.getElementById('loading-screen');
    const start = window.__topbarsCoins || 0;
    if (ls && window.playHudReward) {
      try { await window.playHudReward('coins', { screen: ls, from: { getBoundingClientRect: () => rect }, amount: res.coins, start, radial: true }); } catch (e) {}
    }
    window.setTopbars({ xp: window.__topbarsXp || 0, coins: start + res.coins });
    window.__topbarsFloor = { xp: window.__topbarsXp || 0, coins: start + res.coins, t: Date.now() };
    if (window.refreshTopbars) window.refreshTopbars();
  }

  // Poll until the menu is on screen and free (loaded, logged in, no other popup on top).
  function poll() {
    if (_checked || _tries++ > 90) return;
    if (window._sbUserId && menuIsFree()) run();
    else setTimeout(poll, 700);
  }
  window.maybeDailyBonus = function () { _tries = 0; poll(); };
  setTimeout(poll, 2500);
})();
