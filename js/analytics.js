// ── ANALYTICS (event logging for the admin stats page) ───────────────────────
// Inserts append-only events into the `analytics_events` table via the anon
// client (window.sb). RLS allows INSERT but NOT SELECT for the anon role: only
// the admin-stats Edge Function (service role) can read and aggregate.
// Fire-and-forget: never throws or blocks the game.
//
// Public API:
//   window.Analytics.logVisit()             -> 1 visit per browser session
//   window.Analytics.logGame(mode, score)   -> 1 event per mode played (for the
//                                              "Games per mode" breakdown; NOT
//                                              "1 game" for the dashboard's total
//                                              metrics)
//   window.Analytics.logVersus(mode)        -> 1 event per finished versus game
//   window.Analytics.logCampaign(score)     -> 1 event per COMPLETE Gira Mundial
//                                              (all 4 modes finished); this is
//                                              what counts as "1 game" in the
//                                              dashboard totals alongside versus
(function () {
  // Stable anonymous per-device ID (reuses the old overlay's if present).
  let visitorId = localStorage.getItem('_devstats_vid');
  if (!visitorId) {
    visitorId = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('_devstats_vid', visitorId);
  }

  // Called on logout (see _doLogout, js/profile/profile-account.js): generates a
  // NEW visitor_id for this device. Without this, two different accounts using
  // the same device as guests (without logging in) would share the same
  // visitor_id, and claim_anonymous_events() could mix both their guest games
  // when linking the first account to log in (the RPC only protects events that
  // ALREADY have a user_id assigned, not the ones still loose as guest).
  function resetVisitorId() {
    visitorId = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    try { localStorage.setItem('_devstats_vid', visitorId); } catch (e) {}
  }

  // Country via IP (cached in localStorage; fetched once per device).
  // Resolved server-side by the get-country Edge Function — it used to hit
  // ipinfo.io directly from the browser, and a tracker blocker (uBlock Origin,
  // Firefox/Zen protection) silently cut the fetch, leaving the country
  // undetected forever (see same note in _getCountryCodeForSignup, js/sb.js).
  async function getCountryCode() {
    const cached = localStorage.getItem('_an_country');
    if (cached) return cached || null;
    try {
      const r = await fetch('https://xituwurshmaqsnnnrdhx.supabase.co/functions/v1/get-country', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHV3dXJzaG1hcXNubm5yZGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMjU0OTUsImV4cCI6MjA5NjgwMTQ5NX0.jlT6O8dkuYXc8F3fOK_QXgH4Sqw6dAbhi2EIkvcS7Mk',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHV3dXJzaG1hcXNubm5yZGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMjU0OTUsImV4cCI6MjA5NjgwMTQ5NX0.jlT6O8dkuYXc8F3fOK_QXgH4Sqw6dAbhi2EIkvcS7Mk',
        },
        body: '{}',
      });
      const d = await r.json();
      if (d && d.country) {
        localStorage.setItem('_an_country', d.country);
        return d.country;
      }
    } catch (e) {}
    localStorage.setItem('_an_country', ''); // avoid retry loops
    return null;
  }

  // Name the guest set locally (name input on the splash, see
  // js/profile/profile-account.js) — only worth sending while they're a guest;
  // once they have an account they're identified by real username from profiles.
  function guestName() {
    if (window._sbUserId) return null;
    try { return localStorage.getItem('playerName') || null; } catch (e) { return null; }
  }

  // navigator.maxTouchPoints > 1 (same rule as _sbDeviceType in js/sb.js) so it
  // doesn't depend on userAgent, which can be spoofed/stale.
  function deviceType() {
    return (navigator.maxTouchPoints > 1) ? 'mobile' : 'pc';
  }

  // Campaign attribution (e.g. play/?src=yt in the YouTube ad).
  // First-touch: once stored in localStorage it isn't overwritten by later
  // visits without the parameter, so we don't lose where this device first came
  // from.
  function getSource() {
    try {
      const fromUrl = new URLSearchParams(location.search).get('src');
      if (fromUrl) { localStorage.setItem('_an_source', fromUrl); return fromUrl; }
      return localStorage.getItem('_an_source') || null;
    } catch (e) { return null; }
  }

  async function insertEvent(row, table) {
    const sb = window.sb;
    if (!sb) return;
    try {
      // 'device' only makes sense for game/visit events (not for
      // currency_ledger, which uses the same insertEvent with table='currency_ledger').
      const full = (table && table !== 'analytics_events') ? row : { ...row, device: deviceType() };
      await sb.from(table || 'analytics_events').insert(full);
    } catch (e) { /* silent: must never affect the game */ }
  }

  async function logVisit() {
    // One visit per tab/browser session.
    if (sessionStorage.getItem('_an_visit')) return;
    sessionStorage.setItem('_an_visit', '1');
    const cc = await getCountryCode();
    insertEvent({
      type: 'visit',
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
      guest_name: guestName(),
      source: getSource(),
    });
  }

  // 'practice' (free practice mode) | 'campaign' (Gira Mundial, chains all 4
  // modes) | 'standalone' (a single mode played outside a campaign). Read here
  // instead of received as a parameter to avoid touching flags/shapes/
  // js/core/campaign.js: both flags are already global and set when the game ends.
  function currentSessionType() {
    if (window.practiceConfig && window.practiceConfig.active) return 'practice';
    if (window.campaign && window.campaign.active) return 'campaign';
    return 'standalone';
  }

  async function logGame(mode, score) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'game',
      mode: mode || null,
      score: (typeof score === 'number' && isFinite(score)) ? Math.round(score) : null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
      session_type: currentSessionType(),
      guest_name: guestName(),
    });
  }

  // 1 event per finished versus game (called by the host when closing the match).
  // Separate from `matches`: that table is ephemeral state and its 'finished'
  // rows are deleted in the room cleanup (see lobby.js _cleanupStale), so it's
  // no use as a history source for the stats panel.
  async function logVersus(mode) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'versus',
      mode: mode || null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
    });
  }

  // 1v1 invite funnel: 1 event per match state transition
  // (sent/accepted/declined/expired/abandoned). `matches` is ephemeral state
  // (deleted in the room cleanup, see logVersus above) so without this there's
  // no way to reconstruct at which step people drop off between "invited" and
  // "finished the game" (see logVersus, which only covers the final outcome).
  // `outcome` is one of:
  //   sent | accepted | accept_failed | declined | expired | abandoned
  async function logVersusFunnel(outcome, mode) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'versus_funnel',
      session_type: outcome,
      mode: mode || null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
    });
  }

  // 1 event per complete Gira Mundial (all 4 modes finished without quitting).
  // Called by js/core/campaign.js right when the campaign reaches the last mode
  // and window.campaign.active goes false. `score` is the total accumulated score.
  async function logCampaign(score) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'campaign',
      score: (typeof score === 'number' && isFinite(score)) ? Math.round(score) : null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
      session_type: 'campaign',
      guest_name: guestName(),
    });
  }

  // 1 event per WON GlobeQuiz game. Counts as its own "1 game" in the dashboard
  // totals (alongside campaign/versus) — it's not part of the 4-mode Gira
  // Mundial, it's an independent standalone mode.
  // `score` = number of attempts, `durationMs` = time to guess right,
  // `streak` = days-played streak at the time of this game (0 if guest or
  // couldn't be read) — so /stats can show who plays this mode, how long they
  // take and how often they come back.
  async function logGlobequiz(score, durationMs, streak) {
    const cc = (localStorage.getItem('_an_country') || null) || null;
    insertEvent({
      type: 'globequiz',
      score: (typeof score === 'number' && isFinite(score)) ? Math.round(score) : null,
      duration_ms: (typeof durationMs === 'number' && isFinite(durationMs)) ? Math.round(durationMs) : null,
      streak: (typeof streak === 'number' && isFinite(streak)) ? Math.round(streak) : null,
      visitor_id: visitorId,
      country_code: cc,
      user_id: window._sbUserId || null,
      guest_name: guestName(),
    });
  }

  // XP/coins ledger (currency_ledger) — started before the real XP/coins UI
  // exists, so no history is lost: when it launches, each account's balance is
  // computed by summing what's already accumulated here.
  // Friendly versus grants NOTHING for now (deliberately, no hook here).
  //
  // Gira Mundial: fixed base + an extra per 250 score points (65 historical
  // campaigns, avg 17418, range 2923-45099 → this formula gives ~21-190 coins
  // and ~83-590 xp).
  const CAMPAIGN_BASE_COINS = 10, CAMPAIGN_BASE_XP = 50;
  const CAMPAIGN_POINTS_STEP = 250, CAMPAIGN_STEP_COINS = 1, CAMPAIGN_STEP_XP = 3;
  function coinsFromScore(score) {
    const steps = Math.floor((score || 0) / CAMPAIGN_POINTS_STEP);
    return CAMPAIGN_BASE_COINS + steps * CAMPAIGN_STEP_COINS;
  }
  function xpFromScore(score) {
    const steps = Math.floor((score || 0) / CAMPAIGN_POINTS_STEP);
    return CAMPAIGN_BASE_XP + steps * CAMPAIGN_STEP_XP;
  }

  // GlobeQuiz: fixed base per win (10 coins / 20 xp), multiplied x1.15 every 10
  // days of active streak, capped at 10 applications (streak >= 100 days stops
  // multiplying, mult stays fixed at 1.15^10 ≈ 4.05x). At x1.5 the multiplier
  // reached ~57.7x and a long streak alone hit level 50 in ~4 months without
  // playing any Gira Mundial — x1.15 keeps it a strong bonus that doesn't
  // replace playing the other modes.
  const GQ_BASE_COINS = 10, GQ_BASE_XP = 20;
  const GQ_MULT_STEP_DAYS = 10, GQ_MULT_FACTOR = 1.15, GQ_MULT_MAX_STEPS = 10;
  function gqMultiplier(streakDays) {
    const steps = Math.min(Math.floor((streakDays || 0) / GQ_MULT_STEP_DAYS), GQ_MULT_MAX_STEPS);
    return Math.pow(GQ_MULT_FACTOR, steps);
  }

  async function logCurrencyEvent(coins, xp, reason, refValue) {
    insertEvent({
      coins: Math.round(coins) || 0,
      xp: Math.round(xp) || 0,
      reason,
      ref_value: (typeof refValue === 'number' && isFinite(refValue)) ? Math.round(refValue) : null,
      visitor_id: visitorId,
      user_id: window._sbUserId || null,
    }, 'currency_ledger');
  }
  function logCampaignCurrency(score) {
    logCurrencyEvent(coinsFromScore(score), xpFromScore(score), 'campaign_complete', score);
  }
  // Called ONLY the first time you win in a day (when the streak just advanced,
  // isNewDay in updateStreak) — see showEndgameModal in globequiz.js. Winning
  // again the same day grants nothing.
  function logGlobequizCurrency(streakDays) {
    const mult = gqMultiplier(streakDays);
    logCurrencyEvent(GQ_BASE_COINS * mult, GQ_BASE_XP * mult, 'globequiz_win', streakDays);
  }

  // ── Live guest presence (no account) ─────────────────────────────────────
  // Minimal mirror of sbUpdateLastActive/sbSetPlaying (js/sb.js), but for those
  // without an account yet: those functions write to `profiles`, which has no
  // row for guests, so /stats "online now" / "playing now" could never see them
  // play live — only one-off events (visit/game) with no continuous heartbeat.
  // Append-only (same model as analytics_events, not upsert): an
  // ON CONFLICT DO UPDATE against RLS with the anon role and no SELECT policy
  // doesn't work (confirmed by a test insert as anon — "new row violates
  // row-level security policy"), so each heartbeat is a new row; the server
  // (admin-stats) keeps the most recent per visitor_id. A daily cron prunes
  // rows older than 2 days so it doesn't grow unbounded.
  let _guestPlaying = false, _guestPlayingMode = null;
  async function guestHeartbeat() {
    if (window._sbUserId || !window.sb) return; // has an account -> profiles
    const cc = localStorage.getItem('_an_country') || null;
    try {
      await window.sb.from('guest_presence').insert({
        visitor_id: visitorId,
        last_active: new Date().toISOString(),
        is_playing: _guestPlaying,
        playing_mode: _guestPlayingMode,
        guest_name: guestName(),
        country_code: cc,
        device: deviceType(),
      });
    } catch (e) { /* silent, like the rest of analytics.js */ }
  }
  // Called from window._setPlaying (js/core/campaign.js) for guests, same point
  // as sbSetPlaying for accounts.
  function guestSetPlaying(playing, mode) {
    _guestPlaying = !!playing;
    _guestPlayingMode = playing ? (mode || null) : null;
    guestHeartbeat();
  }

  // Immediate heartbeat bypassing _guestActivityPing's 15s throttle — for
  // moments that DO matter to show instantly in /stats (just set their name)
  // and that don't always coincide with a 'click' that bubbles to document
  // (confirming with Enter doesn't fire 'click'; and if the throttle was
  // already consumed by an earlier click — e.g. focusing the input — the real
  // "Confirm" click stayed silent until the next background heartbeat, up to
  // 25s later).
  function guestPing() { guestHeartbeat(); }

  window.Analytics = {
    logVisit, logGame, logVersus, logVersusFunnel, logCampaign, logGlobequiz,
    logCampaignCurrency, logGlobequizCurrency, resetVisitorId, guestSetPlaying, guestPing,
  };

  // Log the visit as soon as the sb client is ready.
  function tryVisit(attempt) {
    if (window.sb) { logVisit(); guestHeartbeat(); return; }
    if (attempt > 20) return;
    setTimeout(() => tryVisit(attempt + 1), 300);
  }
  tryVisit(0);

  // Periodic + on-activity heartbeat, same pattern as the accounts one in
  // js/sb.js (25s while visible + ping on interaction, 15s throttle) — but it
  // auto-disables if they ever log in (guestHeartbeat() is a no-op with
  // _sbUserId set).
  setInterval(() => {
    if (!window._sbUserId && document.visibilityState === 'visible') guestHeartbeat();
  }, 25 * 1000);
  let _lastGuestPing = 0;
  function _guestActivityPing() {
    if (window._sbUserId) return;
    const now = Date.now();
    if (now - _lastGuestPing < 15000) return;
    _lastGuestPing = now;
    guestHeartbeat();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') _guestActivityPing(); });
  document.addEventListener('click', _guestActivityPing, { passive: true });
  document.addEventListener('touchstart', _guestActivityPing, { passive: true });
})();
