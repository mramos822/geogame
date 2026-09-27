// ── Loading-screen top bars (XP / level + coins) ─────────────────────────────
// Presentation only: window.setTopbars({ xp, coins }) paints the bars. Level
// comes from the planned curve in xp_system_config ('level_curve'): total XP
// needed to reach level L = 25 * L * (L - 1), capped at level 100. Fed by
// refreshTopbars() below with the get_my_economy() RPC.
(function () {
  const MAX_LEVEL = 100;
  const need = (L) => 25 * L * (L - 1);
  const whole = (n) => Math.max(0, Math.floor(n || 0));
  const fmtCoins = (n) => whole(n).toLocaleString('en-US'); // 11,320
  const fmtXp = (n) => String(whole(n));                    // 17810, no separator

  function levelFor(xp) {
    let L = 1;
    while (L < MAX_LEVEL && xp >= need(L + 1)) L++;
    return L;
  }

  // Tooltip: how much XP is missing for the next level (re-rendered on language change).
  let _xpState = null;
  function _renderTip() {
    const tip = document.getElementById('topbar-xp-tip');
    if (!tip || !_xpState) return;
    const { xp, L, next } = _xpState;
    tip.textContent = L >= MAX_LEVEL
      ? t('topbar.xpMax')
      : t('topbar.xpNext', { n: Math.max(0, next - xp).toLocaleString('en-US'), lvl: L + 1 });
  }
  if (typeof onLangChange === 'function') onLangChange(_renderTip);

  // Level + fill % for a total XP (also used by the results screen's XP animation).
  window.topbarsXpView = function (xp) {
    const L = levelFor(xp);
    const base = need(L), next = L >= MAX_LEVEL ? base : need(L + 1);
    const pct = L >= MAX_LEVEL ? 100 : Math.min(100, Math.max(0, (xp - base) / Math.max(1, next - base) * 100));
    return { level: L, pct };
  };

  window.setTopbars = function ({ xp = 0, coins = 0 } = {}) {
    window.__topbarsXp = whole(xp);         // starting XP for the results screen's XP animation
    window.__topbarsCoins = whole(coins);   // read by the results coin animation as the starting balance
    const L = levelFor(xp);
    const base = need(L), next = L >= MAX_LEVEL ? base : need(L + 1);
    const into = xp - base, span = Math.max(1, next - base);
    const pct = L >= MAX_LEVEL ? 100 : Math.min(100, Math.max(0, into / span * 100));
    const $ = (id) => document.getElementById(id);
    if ($('topbar-level')) $('topbar-level').textContent = L;
    if ($('topbar-xp-fill')) $('topbar-xp-fill').style.width = pct + '%';
    if ($('topbar-xp-text')) $('topbar-xp-text').textContent = fmtXp(xp);
    _xpState = { xp, L, next };
    _renderTip();
    if ($('topbar-coins-value')) $('topbar-coins-value').textContent = fmtCoins(coins);
  };

  // Real data: get_my_economy() (server-side, same numbers as the admin stats'
  // retroactive economy) for the logged-in account; guests see 0.
  let _pending = false;
  async function refreshTopbars() {
    if (_pending || _rewardPlaying) return;
    if (!window._sbUserId || !window.sb) { window.setTopbars({}); return; }
    _pending = true;
    try {
      const { data, error } = await window.sb.rpc('get_my_economy');
      if (!error && data) {
        let xp = Number(data.xp) || 0, coins = Number(data.coins) || 0;
        const f = window.__topbarsFloor;
        if (f && Date.now() - f.t < 60000) { xp = Math.max(xp, f.xp); coins = Math.max(coins, f.coins); }
        window.setTopbars({ xp, coins });
      }
    } catch (e) { /* keep whatever is shown */ }
    _pending = false;
  }
  // Toggle #loading-screen.gq-menu-panel while the GloboReto menu panel (its scroll board) is on screen.
  (function watchGqPanel() {
    const board = document.getElementById('loading-globequiz-table'), ls = document.getElementById('loading-screen');
    if (!board || !ls) return;
    const sync = () => ls.classList.toggle('gq-menu-panel', board.style.display !== 'none' && board.style.display !== '');
    new MutationObserver(sync).observe(board, { attributes: true, attributeFilter: ['style'] });
    sync();
  })();

  window.refreshTopbars = refreshTopbars;

  // GloboReto reward on returning to the menu: coins and XP burst out of the GloboReto
  // button and fly into the real HUD bars. `__gqPendingReward` is armed when the end
  // panel is shown (see _gqShowEarned in globequiz.js) with the HUD values at that moment.
  let _rewardPlaying = false;
  window.playMenuRewards = async function () {
    const r = window.__gqPendingReward;
    if (!r || _rewardPlaying) return;
    window.__gqPendingReward = null;
    const ls = document.getElementById('loading-screen');
    const src = document.getElementById('globequiz-btn');
    if (!ls || !src || !window.playRewardPair) return;
    _rewardPlaying = true;
    // HUD back to its pre-reward values (a refresh may already have shown the new total)
    const base = r.base || { coins: 0, xp: 0 };
    window.setTopbars({ xp: base.xp, coins: base.coins });
    let res = { xp: base.xp + r.xp, coins: base.coins + r.coins };
    try {
      // playRewardPair also handles level-ups (popup + bonus coins) and returns the final totals
      res = await window.playRewardPair({ screen: ls, fromCoins: src, fromXp: src, coins: r.coins, xp: r.xp,
        coinsStart: base.coins, xpStart: base.xp, hud: true });
    } catch (e) {}
    window.setTopbars({ xp: res.xp, coins: res.coins });
    _rewardPlaying = false;
    if (window._sbUserId) refreshTopbars();   // reconcile with the server's real total
  };
  // A level-up earned on the results screen is shown here, on the menu. The HUD already shows the new
  // level and XP (it was updated on the way back); the "level up" panel opens, and once it is closed
  // the bonus coins burst into the coin bar.
  window.playMenuLevelUp = async function () {
    const p = window.__pendingLevelUp;
    if (!p || _rewardPlaying) return;
    window.__pendingLevelUp = null;
    const ls = document.getElementById('loading-screen');
    if (!ls || !window.showLevelUp || !window.playHudReward) return;
    _rewardPlaying = true;
    window.setTopbars({ xp: p.xpFinal, coins: p.coinsBefore });     // new level already on the star
    let shown = null;
    try { shown = await window.showLevelUp(p.level, p.bonus); } catch (e) {}
    const rect = shown && shown.rect;
    if (rect && p.bonus > 0) {
      try { await window.playHudReward('coins', { screen: ls, from: { getBoundingClientRect: () => rect }, amount: p.bonus, start: p.coinsBefore, radial: true }); } catch (e) {}
    }
    window.setTopbars({ xp: p.xpFinal, coins: p.coinsBefore + p.bonus });
    _rewardPlaying = false;
    if (window._sbUserId) refreshTopbars();
  };
  // While the animation runs a refresh must not overwrite the HUD mid-count.

  // refreshProfileStats already runs on login/logout and after every game, so
  // piggy-back on it instead of touching each of those call sites.
  const _origRefresh = window.refreshProfileStats;
  window.refreshProfileStats = function () {
    const r = typeof _origRefresh === 'function' ? _origRefresh.apply(this, arguments) : undefined;
    refreshTopbars();
    return r;
  };
  document.addEventListener('DOMContentLoaded', () => setTimeout(refreshTopbars, 1500));
})();
