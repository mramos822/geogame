// ── SOLO SPECTATE (broadcaster) ─────────────────────────────────────────────
// The side of the player playing SOLO (World Tour / solo mode, not versus).
// There is no `matches` row for a solo match, so instead of a per-match
// channel we use a fixed per-user channel: 'solo-{uid}'. Started/stopped from
// window._setPlaying (js/core/campaign.js) and broadcasts round/click exactly
// like vs.js, so the watcher's Spectate.watchSolo() receives the same thing
// whether the match is versus or solo.
window.SoloSpectate = (() => {
  let _channel = null;
  let _active  = false;

  function _myId() { return window._sbUserId || null; }

  function start() {
    // Idempotent: each mode (flags/shapes/cities/monuments) calls
    // window._setPlaying(true) → SoloSpectate.start() in its own splash
    // handler — when the campaign chains from one mode to another (same user,
    // same session), this is called again even though the 'solo-{uid}'
    // channel was already active. This used to do an unconditional stop()
    // (unsubscribe + resubscribe), which showed the spectator a player
    // presence 'leave' (interpreted as "the match ended") followed by a
    // 'join' — but by the time the join arrived again, the spectator had
    // already closed itself from the leave. If the channel is already
    // active, there's nothing to restart.
    if (_active && _channel) return;
    const uid = _myId();
    if (!uid) return; // no account, no one to authorize to spectate
    _active = true;
    _channel = window.sb
      // Not private — see the long comment in vs.js _subscribe: a private
      // channel's JOIN loses a race against the realtime auth token for
      // far-from-region clients and silently never joins.
      .channel('solo-' + uid, { config: { presence: { key: uid } } })
      // 'sync' (not join/leave): the only event that guarantees
      // presenceState() is already consistent — reading it in the 'leave'
      // handler sometimes still included whoever left (timing race), which is
      // why the counter didn't drop when a spectator left.
      .on('presence', { event: 'sync' }, _updateSpectatorCount)
      // A spectator joining mid-round receives no new 'round' until I move to
      // the next one — without this they're stuck on the loading screen if I
      // haven't picked anything yet. On detecting their join, the last known
      // round/tick is resent.
      .on('presence', { event: 'join' }, ({ key }) => {
        if (key && key.indexOf('spectator-') === 0) setTimeout(_resendStateTo, 150);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { try { await _channel.track({ t: Date.now() }); } catch (e) {} }
      });
  }

  function _updateSpectatorCount() {
    if (!_channel) return;
    try {
      const state = _channel.presenceState();
      const n = Object.keys(state).filter(k => k !== _myId()).length;
      window._vsSpectatorCount = n;
      if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(n);
    } catch (e) {}
  }

  function stop() {
    if (_channel) { try { _channel.unsubscribe(); } catch (e) {} _channel = null; }
    _active = false;
    window._vsSpectatorCount = 0;
    _lastPhase = null;
    _lastRoundPayload = null;
    _lastTick = null;
    _lastSplashPayload = null;
    _lastPregamePayload = null;
    _lastPostgamePayload = null;
    _lastScore = null;
    _lastDots = null;
    _lastGqGuesses = null;
    if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(0);
  }

  // _lastPhase: which of the four mutually exclusive states is current now
  // (instructions splash / round / 3-2-1 countdown / results) — see the long
  // comment in the vs.js version (same pattern here for solo matches).
  let _lastPhase           = null; // 'splash' | 'round' | 'pregame' | 'postgame'
  let _lastRoundPayload    = null;
  let _lastTick            = null;
  let _lastSplashPayload   = null;
  let _lastPregamePayload  = null;
  let _lastPostgamePayload = null;
  // Last live score seen (ALREADY with campaignBase() added, see
  // _specReportAnswer in flags/shapes/monuments) — 'answer' isn't cached for
  // a full resend (it would replay a stale play's animations/sounds to a
  // late joiner), but the NUMBER is needed: without this, someone joining
  // mid-match saw 0 until the real player's NEXT answer.
  let _lastScore = null;
  // Same reason as _lastScore — the dot streak (state.dots, Cities/Monuments
  // only) showed 0 for someone joining mid-match until the real player's NEXT
  // correct answer, instead of reflecting the progress ALREADY accumulated
  // from the start.
  let _lastDots = null;
  // FULL list (not just the last) of guesses already made in GlobeQuiz —
  // unlike _lastScore/_lastDots (one number sums up all progress), here each
  // attempt is a different country with its own distance, and the spectator
  // needs to see them ALL on joining mid-match, not just those made from
  // then on (the reported "the already-typed countries don't show"). No
  // animation/sound on resend (see globequizSpectatorSyncGuesses, separate
  // from globequizSpectatorResolvePick which is the LIVE route) — replaying
  // the sound of every old attempt at once would be chaos. null for any
  // other mode (they never fill it).
  let _lastGqGuesses = null;
  // ONLY updates the cache, broadcasts nothing — the real player calls this
  // on EVERY guess (together with reportAnswer, which is the live broadcast
  // anyone watching already receives). This used to also send its OWN
  // 'gqguesses' broadcast on every guess, so an already-connected spectator
  // received the SAME play twice (the live 'answer' + this "full" sync) and
  // ended up painting the globe/list TWICE per guess — the reported lag/jank.
  // Now the only thing that actually fires the broadcast is _resendStateTo()
  // (joining mid-match), below.
  function updateGqGuessesCache(list) { _lastGqGuesses = list; }
  function reportGqGuesses(list) {
    _lastGqGuesses = list;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'gqguesses', payload: { list } }); } catch (e) {} }
  }
  function reportRound(payload) {
    _lastPhase = 'round';
    _lastRoundPayload = payload;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'round', payload }); } catch (e) { console.warn('[spec] reportRound send failed', e); } }
  }
  function reportScoreSync(score, dots) {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'scoresync', payload: { score, dots } }); } catch (e) {} }
  }
  function reportAnswer(payload) {
    if (payload && typeof payload.score === 'number') _lastScore = payload.score;
    if (payload && typeof payload.dots === 'number') _lastDots = payload.dots;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'answer', payload }); } catch (e) {} }
  }
  function reportTick(timeLeft) {
    _lastTick = timeLeft;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'tick', payload: { timeLeft } }); } catch (e) {} }
  }
  function reportTimesUp() {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'timesup', payload: {} }); } catch (e) {} }
  }
  // Fires at the exact instant the real player confirms leaving the postgame
  // to move to the next mode's splash (campaign chaining) — BEFORE that mode
  // sends its own round/pregame (which only arrives if/when the player
  // finishes navigating THEIR splash, which can take a while). Without this
  // the spectator kept seeing the OLD postgame all that time, as if the
  // player were still there when they already left. Not cached for resend:
  // it's a transient notice, not a state.
  function reportAdvancing() {
    _lastPhase = null; // no more "current phase" to resend to someone joining right now
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'advancing', payload: {} }); } catch (e) { console.warn('[spec] reportAdvancing send failed', e); } }
  }
  // Fires as soon as the real player enters a mode's instructions screen
  // (splash) — before the 3-2-1, even before they confirm and the real
  // pregame starts. Unlike reportAdvancing() (transient notice), THIS state
  // IS cached for resend: a spectator can join at any time while the player
  // is reading the instructions (they can take as long as they want there),
  // and without this cached state there was NOTHING to resend — they were
  // left on the stuck connection screen until the real 3-2-1 finally started.
  function reportSplash(payload) {
    _lastPhase = 'splash';
    _lastSplashPayload = payload || {};
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'splash', payload: payload || {} }); } catch (e) { console.warn('[spec] reportSplash send failed', e); } }
  }
  function reportPregame(payload) {
    _lastPhase = 'pregame';
    _lastPregamePayload = payload || {};
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'pregame', payload: payload || {} }); } catch (e) { console.warn('[spec] reportPregame send failed', e); } }
  }
  function reportPostgame(payload) {
    _lastPhase = 'postgame';
    _lastPostgamePayload = payload;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'postgame', payload }); } catch (e) {} }
  }
  function _resendStateTo() {
    // splash first and alone: if the player is still on the instructions
    // there are no real round/pregame to resend yet (it could be from a
    // PREVIOUS mode, already stale) — showing the wait is the only correct
    // thing here.
    if (_lastPhase === 'splash' && _lastSplashPayload) {
      reportSplash(_lastSplashPayload);
      return;
    }
    // Same fix as vs.js: 'round' is the only one carrying `mode`, and the
    // spectator-side _mode starts at 'flags' by default — resending it first
    // ensures whoever joins during the 3-2-1/results mounts the correct real
    // UI from the start, not only when the next round arrives.
    if (_lastPhase === 'pregame' && _lastPregamePayload) {
      if (_lastRoundPayload) reportRound(_lastRoundPayload);
      reportPregame(_lastPregamePayload);
      return;
    }
    if (_lastPhase === 'postgame' && _lastPostgamePayload) {
      if (_lastRoundPayload) reportRound(_lastRoundPayload);
      reportPostgame(_lastPostgamePayload);
      return;
    }
    if (_lastRoundPayload) reportRound(_lastRoundPayload);
    if (_lastTick != null) reportTick(_lastTick);
    // Joining mid-round, with no pregame in between: 'round' carries no score
    // or dots, so without this the scoreboard and dot streak stayed at 0
    // until the real player's NEXT answer.
    if (_lastScore != null || _lastDots != null) reportScoreSync(_lastScore, _lastDots);
    // Same reason as above but for GlobeQuiz: resends ALL guesses already
    // made, not just the next one that arrives live.
    if (_lastGqGuesses != null) reportGqGuesses(_lastGqGuesses);
  }

  return { start, stop, reportRound, reportAnswer, reportTick, reportTimesUp, reportSplash, reportPregame, reportPostgame, reportAdvancing, reportGqGuesses, updateGqGuessesCache, isActive: () => _active };
})();

// ── DISPATCHER ───────────────────────────────────────────────────────────────
// Called from flags.js/shapes.js instead of touching VS/SoloSpectate directly
// — decides where to broadcast based on the current context (versus vs. solo).
window._specReportRound = function (payload) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportRound === 'function') {
    window._vsReportRound(payload);
    return;
  }
  // Group (lobby of up to 10) — see GroupSpectate below. Like VS, LB.sendRound
  // tags the broadcast with THIS player's uid (not a binary host/guest role),
  // so a spectator can watch ANY member's real board.
  if (window._lobbyActive && window.LB && typeof window.LB.sendRound === 'function') {
    window.LB.sendRound(payload);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportRound(payload);
  }
};
window._specReportAnswer = function (correct, score, detail) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportAnswer === 'function') {
    window._vsReportAnswer(correct, score, detail);
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendAnswer === 'function') {
    window.LB.sendAnswer({ ...(detail || {}), correct, score });
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportAnswer({ ...(detail || {}), correct, score });
  }
};
// GlobeQuiz-only (always solo, never VS/lobby) — updates the CACHE of the
// full guess list (to resend it if someone joins mid-match, see
// reportGqGuesses/_resendStateTo in SoloSpectate), broadcasting nothing live
// — the normal 'answer' (_specReportAnswer, called alongside this on every
// guess) is already the live broadcast any connected spectator sees;
// duplicating the send here made each guess paint TWICE on the spectator
// side (the reported lag).
window._specReportGqGuesses = function (list) {
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.updateGqGuessesCache(list);
  }
};
window._specReportTick = function (timeLeft) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportTick === 'function') {
    window._vsReportTick(timeLeft);
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendTick === 'function') {
    window.LB.sendTick(timeLeft);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportTick(timeLeft);
  }
};
window._specReportTimesUp = function () {
  // Effect (shake + timer) on MY OWN leaderboard card — the 'timesup'
  // broadcast is for the OTHERS (doesn't echo to me), so I fire mine locally
  // here. Using the mode's *SetLobbyTimesUpFor function with my own uid →
  // lands on the 'player' cell (exists in versus AND lobby).
  try {
    if (window._vsActive || window._lobbyActive) {
      const m = window.pendingGameMode;
      const fn = m === 'flags' ? window.flagsTriggerLobbyTimesUpFor
               : m === 'shapes' ? window.shapesSetLobbyTimesUpFor
               : window.citiesSetLobbyTimesUpFor; // 'game' (cities) and 'monuments' share it
      if (typeof fn === 'function') fn(window._sbUserId);
    }
  } catch (e) {}
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportTimesUp === 'function') {
    window._vsReportTimesUp();
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendTimesUp === 'function') {
    window.LB.sendTimesUp();
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportTimesUp();
  }
};
// Group: like solo, the room's campaign chains modes (see
// _currentModeIdx/_lobbyModes in lobby.js), so the instructions screen IS a
// real state a spectator can "miss" — unlike 1v1, which goes straight into
// the synced round.
window._specReportSplash = function (payload) {
  if (window._lobbyActive && window.LB && typeof window.LB.sendSplash === 'function') {
    window.LB.sendSplash(payload);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportSplash(payload);
  }
};
window._specReportPregame = function (payload) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportPregame === 'function') {
    window._vsReportPregame(payload);
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendPregame === 'function') {
    window.LB.sendPregame(payload);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportPregame(payload);
  }
};
window._specReportPostgame = function (payload) {
  if (window._vsActive && !window._lobbyActive && typeof window._vsReportPostgame === 'function') {
    window._vsReportPostgame(payload);
    return;
  }
  if (window._lobbyActive && window.LB && typeof window.LB.sendPostgame === 'function') {
    window.LB.sendPostgame(payload);
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportPostgame(payload);
  }
};
// Group: like solo, it does chain modes — see the comment in
// _specReportSplash. 1v1 never calls this (each match ends with its own W/L
// screen, without chaining).
window._specReportAdvancing = function () {
  if (window._lobbyActive && window.LB && typeof window.LB.sendAdvancing === 'function') {
    window.LB.sendAdvancing();
    return;
  }
  if (!window._vsActive && !window._lobbyActive && window.SoloSpectate && window.SoloSpectate.isActive()) {
    window.SoloSpectate.reportAdvancing();
  }
};

// ── SPECTATOR MODE (Versus 1v1, Flags/Shapes) ─────────────────────────────────
// Read-only mirror of vs.js: joins the same realtime channel `match-{id}`
// host/guest use, but with a distinct 'spectator-{uid}' presence key (so the
// players' HUD can count spectators without seeing them as an opponent).
// Reports no score and listens to no clicks — just observes.
window.Spectate = (() => {
  let _matchId = null;
  let _channel = null;
  let _match   = null;
  let _isSolo  = false; // true = watching a solo match (World Tour), not versus
  let _watchOpts = null; // opts passed to watch(matchId, opts) — see suppressPresenceGone
  let _onSnapshot = null; // cb(match) — initial state when starting to watch
  let _onScore    = null; // cb(hostScore, guestScore)
  let _onAnswer   = null; // cb({ role, index, correct }) — a player's exact selection
  let _onWrong    = null; // cb(role)
  let _onEnd      = null; // cb(reason) — 'finished' | 'abandoned' | 'gone'
  let _onRound    = null; // cb({ role, index, country/label, correctSlot, options })
  let _onTick     = null; // cb(timeLeft) — the player's real time remaining
  let _onTimesUp  = null; // cb() — the game round's time ran out
  let _onSplash    = null; // cb(payload) — the player is on a mode's instructions screen, before the 3-2-1
  let _onPregame   = null; // cb(payload) — 3-2-1 countdown before the round
  let _onPostgame  = null; // cb(payload) — results screen
  let _onAdvancing = null; // cb() — the real player confirmed leaving the postgame toward the next mode (still no new round/pregame)
  let _onGameEnd   = null; // cb({role, score}) — versus ONLY: one of the two players finished their timer (see reportGameEnd in vs.js). Consumed by _enterWaitAsSpectator (vs.js) when the player who finished first watches the opponent on loan — see the long comment there.
  let _onScoreSync = null; // cb(score) — already-known score resent to whoever joins mid-round (see SoloSpectate.reportScoreSync)
  let _onSpectatorCount = null; // cb(n) — how many spectators are watching (this one included), see watchSolo
  let _onGqGuesses = null; // cb(list) — GlobeQuiz: ALL guesses already made, resent to whoever joins mid-match (see reportGqGuesses)

  function _myId() { return window._sbUserId || null; }

  // Fetches the match. The RLS policy "matches_select_friends" decides
  // whether I can see this row (accepted friend of host or guest); if I'm
  // not a friend, `data` comes back null/[] and there's nothing more to do.
  async function _getMatch(id) {
    const { data, error } = await window.sb
      .from('matches').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async function watch(matchId, opts) {
    await stop(); // in case another match was being watched
    const match = await _getMatch(matchId);
    if (!match) throw new Error('match_not_found');
    _matchId = matchId;
    _match   = match;
    _watchOpts = opts || null;

    const uid = _myId();
    _channel = window.sb
      .channel('match-' + matchId, { config: { presence: { key: 'spectator-' + (uid || Math.random().toString(36).slice(2)) } } }) // not private — see vs.js _subscribe
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: 'id=eq.' + matchId,
      }, payload => {
        const m = payload.new;
        _match = m;
        if (_onScore) _onScore(m.host_score, m.guest_score);
        if (m.status === 'finished')  { if (_onEnd) _onEnd('finished');  stop(); }
        if (m.status === 'abandoned') { if (_onEnd) _onEnd('abandoned'); stop(); }
      })
      .on('broadcast', { event: 'score' }, ({ payload }) => {
        if (!payload || !_match) return;
        // The score broadcast doesn't directly say whose it is (each player
        // sends it with their own role) — refreshing from the most recent
        // known state via postgres_changes is enough; to not lose real time
        // we still reflect the incoming value on both sides if it matches
        // what each player would report (host/guest resolved by payload.role
        // when included from vs.js reportScore).
        if (payload.role === 'host') _match.host_score = payload.score;
        else if (payload.role === 'guest') _match.guest_score = payload.score;
        if (_onScore) _onScore(_match.host_score, _match.guest_score);
      })
      .on('broadcast', { event: 'wrong' }, ({ payload }) => { if (_onWrong) _onWrong(payload && payload.role); })
      .on('broadcast', { event: 'answer' }, ({ payload }) => { if (payload && _onAnswer) _onAnswer(payload); })
      .on('broadcast', { event: 'round' }, ({ payload }) => { if (payload && _onRound) _onRound(payload); })
      .on('broadcast', { event: 'tick' }, ({ payload }) => { if (payload && _onTick) _onTick(payload.timeLeft, payload.role); })
      .on('broadcast', { event: 'timesup' }, ({ payload }) => { if (_onTimesUp) _onTimesUp(payload && payload.role); })
      .on('broadcast', { event: 'pregame' }, ({ payload }) => { if (_onPregame) _onPregame(payload); })
      .on('broadcast', { event: 'postgame' }, ({ payload }) => { if (payload && _onPostgame) _onPostgame(payload); })
      .on('broadcast', { event: 'gameend' }, ({ payload }) => { if (payload && _onGameEnd) _onGameEnd(payload); })
      // Spectator counter — same mechanism as watchSolo() (see that long
      // comment), but it was missing entirely here: a VERSUS spectator never
      // learned how many others were watching them too, so the eye+counter
      // (_applySpectatorBadge) never activated in this session.
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = _channel.presenceState();
          const n = Object.keys(state).filter(k => k.indexOf('spectator-') === 0).length;
          if (_onSpectatorCount) _onSpectatorCount(n);
        } catch (e) {}
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        // Only close if NO player (host/guest) remains in the channel — one
        // side disconnecting doesn't mean the match ended (vs.js already
        // handles the real abandonment via status='abandoned' with its own
        // grace period); this is just a backup in case both left before the
        // status updated.
        // suppressPresenceGone (see _enterWaitAsSpectator in vs.js): when the
        // spectator is THE PLAYER THEMSELVES watching their opponent on
        // loan, their old VS channel was just released (releaseChannel) RIGHT
        // before creating this one — there's a real race window where this
        // new channel can see the "leave" of that old presence (MINE, not the
        // opponent's) before the initial sync reflects the opponent still
        // present, and "playersLeft" reads 0 for an instant — detecting an
        // abandonment that never happened (the reported "I detect the
        // opponent abandoned"). With this flag active, that presence
        // heuristic detection is disabled entirely — the real abandonment
        // still arrives via status='abandoned' (postgres_changes), which
        // doesn't depend on presence and doesn't have this race.
        if (_watchOpts && _watchOpts.suppressPresenceGone) return;
        if (!key || key.indexOf('spectator-') === 0) return;
        try {
          const state = _channel.presenceState();
          const playersLeft = Object.keys(state).filter(k => k.indexOf('spectator-') !== 0).length;
          if (playersLeft === 0) { if (_onEnd) _onEnd('gone'); stop(); }
        } catch (e) {}
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await _channel.track({ t: Date.now() }); } catch (e) {}
          if (_onSnapshot) _onSnapshot(_match);
        }
      });
  }

  // Watch a friend's SOLO match (World Tour / solo mode) — there is no
  // `matches` row, so we join directly the fixed 'solo-{userId}' channel
  // SoloSpectate opens on the player's side. No DB snapshot: if the friend
  // is already mid-round, we only see the next round that gets broadcast.
  //
  // Unlike watch() (VS 1v1), this Realtime channel has no RLS in the way
  // (there's no `matches` row to query first) — without this check, anyone
  // logged in could open the browser console and call
  // Spectate.watchSolo('<anyone's userId>') to watch someone's live match
  // without being their friend, bypassing the eye button entirely (which
  // only hides the option in the UI, protects nothing). Same criterion as
  // the 'matches_select_friends' policy: accepted friends only, or oneself.
  async function _isFriendOf(userId) {
    const uid = _myId();
    if (!uid) return false;
    if (uid === userId) return true;
    try {
      const { data } = await window.sb.from('friendships').select('id')
        .or(`and(user_a.eq.${uid},user_b.eq.${userId}),and(user_a.eq.${userId},user_b.eq.${uid})`)
        .eq('status', 'accepted').maybeSingle();
      return !!data;
    } catch (e) { return false; }
  }
  async function watchSolo(userId) {
    await stop();
    if (!(await _isFriendOf(userId))) throw new Error('not_friends');
    _isSolo  = true;
    _matchId = userId;
    _match   = { mode: null, score: 0, solo: true };

    const uid = _myId();
    _channel = window.sb
      .channel('solo-' + userId, { config: { presence: { key: 'spectator-' + (uid || Math.random().toString(36).slice(2)) } } }) // not private — see vs.js _subscribe; app-level _isFriendOf() still gates access
      // Same channel the real player sees (owner of 'solo-{userId}') — the
      // spectator also receives these presence events, so it can show how
      // many people are watching (this one included) without needing a
      // separate message from the player. 'sync' (not join/leave) for the
      // same reason as in SoloSpectate._updateSpectatorCount: the only event
      // that guarantees presenceState() is already consistent.
      // Uses the SAME icon/badge the player sees of themselves
      // (#vs-spectator-badge/#flags-vs-spectator-badge, same fixed on-screen
      // position) — not a separate one: the spectator sees exactly what the
      // player would if THEY were being spectated. This module (watchSolo) is
      // a DIFFERENT closure from the one building the real UI further down in
      // the file (loadingEl/_hideLoading/etc don't exist here) — hence it
      // signals via a registered callback (_onSpectatorCount) instead of
      // touching the DOM directly.
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = _channel.presenceState();
          const n = Object.keys(state).filter(k => k.indexOf('spectator-') === 0).length;
          if (_onSpectatorCount) _onSpectatorCount(n);
        } catch (e) {}
      })
      .on('broadcast', { event: 'round' }, ({ payload }) => { if (payload && _onRound) { _match.mode = payload.mode || _match.mode; _onRound(payload); } })
      .on('broadcast', { event: 'answer' }, ({ payload }) => {
        if (!payload) return;
        if (typeof payload.score === 'number') _match.score = payload.score;
        if (_onAnswer) _onAnswer(payload);
        if (_onScore) _onScore(_match.score, null);
      })
      .on('broadcast', { event: 'tick' }, ({ payload }) => { if (payload && _onTick) _onTick(payload.timeLeft, payload.role); })
      .on('broadcast', { event: 'timesup' }, ({ payload }) => { if (_onTimesUp) _onTimesUp(payload && payload.role); })
      .on('broadcast', { event: 'splash' }, ({ payload }) => { if (_onSplash) _onSplash(payload || {}); })
      .on('broadcast', { event: 'pregame' }, ({ payload }) => { if (_onPregame) _onPregame(payload); })
      .on('broadcast', { event: 'postgame' }, ({ payload }) => { if (payload && _onPostgame) _onPostgame(payload); })
      .on('broadcast', { event: 'advancing' }, () => { if (_onAdvancing) _onAdvancing(); })
      .on('broadcast', { event: 'gqguesses' }, ({ payload }) => { if (payload && _onGqGuesses) _onGqGuesses(payload.list); })
      .on('broadcast', { event: 'scoresync' }, ({ payload }) => { if (payload && _onScoreSync) _onScoreSync(payload.score, payload.dots); })
      .on('presence', { event: 'leave' }, ({ key }) => {
        // The only possible "player" in this channel is the owner (userId, no
        // 'spectator-' prefix); if they leave, they stopped playing.
        if (key && key.indexOf('spectator-') !== 0) { if (_onEnd) _onEnd('finished'); stop(); }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await _channel.track({ t: Date.now() }); } catch (e) {}
          if (_onSnapshot) _onSnapshot(_match);
          // There's no DB snapshot for solo matches: if a few seconds in the
          // channel owner hasn't appeared in presence, they're not actually
          // playing (stale badge) — notify and close.
          setTimeout(() => {
            if (!_channel) return;
            try {
              const state = _channel.presenceState();
              const hasOwner = Object.keys(state).some(k => k.indexOf('spectator-') !== 0);
              if (!hasOwner) { if (_onEnd) _onEnd('gone'); stop(); }
            } catch (e) {}
          }, 4000);
        }
      });
  }

  // Returns a promise that resolves only once the old channel has actually
  // finished leaving (untrack + unsubscribe) — watchSolo() awaits it before
  // opening the new channel. This used to be fire-and-forget: watchSolo()
  // carried on while the untrack() was still in flight, so if the spectator
  // re-entered quickly, the NEW channel (same 'spectator-{uid}' key)
  // subscribed while the OLD one hadn't finished announcing it was leaving —
  // the player could see both overlapping for an instant, or get stuck at 2
  // if the old one's 'leave' was processed on the server AFTER the new one's
  // 'join' (the reported "the eye icon duplicates").
  // It can never hang waiting: if the old channel's
  // untrack()/unsubscribe() don't respond (broken connection, dead socket,
  // whatever), watchSolo() below does `await stop()` BEFORE opening the new
  // channel — if stop() hangs forever, the spectator was stuck at "Loading
  // match..." with neither error nor success ever (neither connects nor
  // fails), as reported. With a timeout, at 2s it carries on anyway.
  function _withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise(resolve => { timer = setTimeout(resolve, ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }
  async function stop() {
    if (_channel) {
      const chToClose = _channel;
      _channel = null;
      try { await _withTimeout(chToClose.untrack(), 2000); } catch (e) {}
      try { await _withTimeout(chToClose.unsubscribe(), 2000); } catch (e) {}
    }
    _matchId = _match = null;
    _isSolo = false;
    _watchOpts = null;
  }

  return {
    watch,
    watchSolo,
    stop,
    onSnapshot: cb => { _onSnapshot = cb; },
    onScore:    cb => { _onScore = cb; },
    onAnswer:   cb => { _onAnswer = cb; },
    onWrong:    cb => { _onWrong = cb; },
    onEnd:      cb => { _onEnd = cb; },
    onRound:    cb => { _onRound = cb; },
    onTick:     cb => { _onTick = cb; },
    onTimesUp:  cb => { _onTimesUp = cb; },
    onSplash:   cb => { _onSplash = cb; },
    onPregame:  cb => { _onPregame = cb; },
    onPostgame: cb => { _onPostgame = cb; },
    onAdvancing: cb => { _onAdvancing = cb; },
    onGameEnd:  cb => { _onGameEnd = cb; },
    onScoreSync: cb => { _onScoreSync = cb; },
    onSpectatorCount: cb => { _onSpectatorCount = cb; },
    onGqGuesses: cb => { _onGqGuesses = cb; },
    getMatch:   () => _match,
    getMatchId: () => _matchId,
    isSolo:     () => _isSolo,
  };
})();

// ── GROUP SPECTATOR MODE (lobby of up to 10) ────────────────────────────────
// Read-only mirror of the 'lobby-{id}' channel LB (lobby.js) uses to
// broadcast each member's round/tick/pregame/postgame (see the sendRound/
// sendTick/etc added there). Unlike Spectate (1v1, a binary host/guest role
// fixed per session), here there can be up to 10 different senders on the
// SAME channel — instead of "friend/opponent" it tracks _currentPovMemberId
// (which of the N members is being watched right now), which the UI arrows
// (see openSpectatorGroup below) switch on the fly WITHOUT reconnecting the
// channel, because all members already broadcast to the same topic —
// switching POV is simply starting to accept ANOTHER uid's broadcasts.
window.GroupSpectate = (() => {
  let _lobbyId = null;
  let _channel = null;
  let _members = []; // [{id,name,avatar}]
  let _currentPovMemberId = null;
  let _onMembers        = null; // cb(members)
  let _onRoomEmpty      = null; // cb() — no player left in the room (everyone left)
  let _onRound          = null;
  let _onTick           = null;
  let _onPregame        = null;
  let _onPostgame       = null;
  let _onAnswer         = null;
  let _onTimesUp        = null;
  let _onTimesUpAny     = null; // cb(memberId) — ANY member ran out of time (not filtered by POV, like _onWrong)
  let _onSplash         = null;
  let _onAdvancing      = null;
  let _onWrong          = null; // cb(memberId) — ANY member missed (not filtered by POV)
  let _onSpectatorCount = null;
  let _onPovChanged     = null; // cb(memberId) — the arrows changed POV
  let _onScore          = null; // cb(memberId, score) — live side card
  let _onFinished       = null; // cb(memberId, score) — relay of LB's 'finished', see _enterGroupWaitAsSpectator in lobby.js
  let _onReveal         = null; // cb(revealAt, isFinal) — shared wall clock, see LB.sendReveal/onReveal in lobby.js
  let _onAnyActivity    = null; // cb(memberId) — ANY round/tick from ANY member (not just the POV), for lobby.js's lifeline heartbeat
  const _scores = {}; // uid → score, so the side card survives a _fetchMembers() in between
  const _dots   = {}; // uid → dot streak, same reason as _scores but for the main scoreboard
  // Last known state of EACH member (not just the current POV) — all their
  // broadcasts already pass through this same channel even when not shown, so
  // caching them is free. Without this, switching POV with the arrows left
  // the old screen frozen until the NEW person did something (the next tick,
  // up to 1s later) instead of reflecting their current state right away —
  // the reported "it doesn't switch instantly". Same pattern as
  // _resendStateTo in vs.js/SoloSpectate, but per member instead of a
  // single one.
  const _lastState = {}; // uid → { phase: 'round'|'pregame'|'postgame', round, tick, pregame, postgame }
  function _stateFor(uid) { return _lastState[uid] || (_lastState[uid] = { phase: null, round: null, tick: null, pregame: null, postgame: null }); }
  // Members who ALREADY finished their timer for THIS mode (broadcast
  // 'timesup') — there's nothing to spectate from them until the next
  // mode/match starts (a new splash/pregame/round removes them from here
  // again). The arrows (switchPov) skip them; if the current POV happens to
  // fall here (the member you're watching finished), it auto-jumps to the
  // next available — the reported "at the exact moment times up appears,
  // their availability to be spectated must be removed".
  const _finishedUids = new Set();
  let _trackDebounceTimer = null;
  // Automatic reconnection: the Supabase Realtime WebSocket can close on its
  // own (server closes it for inactivity/limit, network glitch) — the
  // channel goes to CLOSED/CHANNEL_ERROR/TIMED_OUT and the spectator was
  // left "reconnecting with User" forever, never recovering (reported). With
  // this, if the close was NOT intentional (_stopping), it re-subscribes on
  // its own with backoff, preserving who was being watched. _stopping
  // distinguishes a deliberate close (stop()) from an unexpected one.
  let _stopping = false;
  let _reconnectTimer = null;
  let _reconnectAttempts = 0;
  let _reconnecting = false;
  let _onReconnecting = null; // cb() — the channel dropped, reconnecting
  let _onReconnected  = null; // cb() — back to SUBSCRIBED after a drop
  let _postgameFallbackTimer = null; // see _armPostgameFinalFallback (lifeline if the final postgame is lost)
  // Lifeline: if after the final 'reveal' the 'postgame' broadcast doesn't
  // arrive within ~3.5s, it rebuilds the FINAL table from the scores cached
  // in _members (.score, fed by 'lbscore') and fires it as if it were the
  // real postgame. So the spectator never freezes from losing THAT
  // broadcast.
  function _armPostgameFinalFallback() {
    if (_postgameFallbackTimer) return;
    _postgameFallbackTimer = setTimeout(() => {
      _postgameFallbackTimer = null;
      if (!_onPostgame) return;
      const members = _members.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
      _onPostgame({ kind: 'final', members, _fallback: true });
    }, 3500);
  }
  // Sends the presence track() (current pov) only 400ms AFTER the last POV
  // change, not on each one — see the long comment in _movePov. Coalesces
  // any burst of clicks into a single message to the server with the final
  // value.
  let _lastTrackAt = 0;
  let _lastTrackedPov = null;
  let _advancePovTimer = null; // margin before forcing a POV change when the current one finishes (see 'timesup')
  // HARD THROTTLE: max 1 track() every 2s, and only if the POV actually
  // changed since the last one. The presence track() (spectator counter)
  // doesn't need to be instant, and sending it repeatedly — even at ~1/sec
  // switching POV calmly — seems to be what the Realtime server cuts (CLOSED
  // → reconnection). Switching POV every 1-1.5s previously sent ~1 track/sec;
  // now, at most 1 every 2s with the final value.
  function _scheduleTrack() {
    clearTimeout(_trackDebounceTimer);
    const doTrack = () => {
      if (!_channel || _currentPovMemberId === _lastTrackedPov) return;
      _lastTrackedPov = _currentPovMemberId;
      _lastTrackAt = Date.now();
      _channel.track({ pov: _currentPovMemberId, t: Date.now() }).catch(() => {});
    };
    const since = Date.now() - _lastTrackAt;
    if (since >= 2000) doTrack();
    else _trackDebounceTimer = setTimeout(doTrack, 2000 - since);
  }

  function _myId() { return window._sbUserId || null; }
  function _isFromPov(uid) { return !!uid && uid === _currentPovMemberId; }

  async function _fetchMembers(lobbyId) {
    const { data, error } = await window.sb.from('lobby_members')
      .select('user_id, score, live_state, p:user_id(username, avatar_url, frame_code, card_code)').eq('lobby_id', lobbyId).order('joined_at');
    if (error) console.warn('[spec] GroupSpectate._fetchMembers error', error);
    if (error || !data) return [];
    return data.map(m => {
      // _scores (live, via the 'lbscore' broadcast) overrides the DB score if
      // something more recent already arrived — the row can be slow to
      // reflect the last UPDATE, the broadcast is immediate.
      if (typeof _scores[m.user_id] !== 'number') _scores[m.user_id] = m.score || 0;
      // live_state (see group_live_state.sql + LB._persistLiveState in
      // lobby.js): the last phase/round/pregame/postgame this member had
      // BEFORE this channel connected — without this, connecting or switching
      // POV to someone already mid-match showed nothing until their NEXT
      // live broadcast (the reported "it only works once they do an
      // action"). Don't overwrite a more recent _lastState that arrived via
      // broadcast in the meantime.
      if (m.live_state && !_lastState[m.user_id]) {
        _lastState[m.user_id] = {
          phase: m.live_state.phase || null,
          round: m.live_state.round || null,
          tick: (m.live_state.round && typeof m.live_state.round.timeLeft === 'number') ? m.live_state.round.timeLeft : null,
          pregame: m.live_state.pregame || null,
          postgame: m.live_state.postgame || null,
        };
      }
      // Only ADDS to _finishedUids, never removes based on this —
      // _fetchMembers re-runs every time ANY lobby_members row changes
      // (someone joins/leaves), and that read can arrive with the live_state
      // UPDATE still in flight (slower than the live broadcast that would
      // have cleared it long ago) — "removing" here based on stale data
      // would reintroduce the member as excluded from the rotation after
      // they had already gone back to actually playing.
      if (m.live_state && m.live_state.finished) _finishedUids.add(m.user_id);
      return {
        id: m.user_id,
        name: (m.p && m.p.username) || '?',
        avatar: (m.p && m.p.avatar_url) || 'images/profilepic/ppdefault.png',
        score: _scores[m.user_id] || 0,
        // frameCode: used by the mini-HUD (spectator-mini-avatar) when
        // watching this member by POV. cardCode: used by
        // _renderGroupLeaderboardInner for each member's chip in the
        // leaderboard — neither was fetched here before, so the group
        // spectator always saw everything in default regardless of what each
        // player had actually equipped.
        frameCode: (m.p && m.p.frame_code) || '0001',
        cardCode: (m.p && m.p.card_code) || '0001',
      };
    });
  }

  // initialMemberId: which member to start the POV on (e.g. the one whose
  // eye was clicked) — if not passed, the first in the room.
  // opts.preFinishedUids: uids that ALREADY finished this round of modes
  // before this channel connected (see _enterGroupWaitAsSpectator in
  // lobby.js — the player who finishes first and starts watching on loan
  // those still playing needs to know, from the start, who else already
  // finished BEFORE them, not just learn of future 'timesup' — otherwise the
  // arrows could offer to watch someone with nothing left to show).
  async function watch(lobbyId, initialMemberId, opts) {
    await stop();          // stop() leaves _stopping=true
    _stopping = false;     // starting/reconnecting this session — reconnection allowed from here on
    if (!(opts && opts._isReconnect)) _reconnectAttempts = 0; // new session (not a reconnect) → clean backoff
    _lobbyId = lobbyId;
    _members = await _fetchMembers(lobbyId);
    if (opts && Array.isArray(opts.preFinishedUids)) {
      opts.preFinishedUids.forEach(uid => _finishedUids.add(uid));
    }
    // Filter by _finishedUids here TOO — same criterion as _movePov()
    // (below), which would never pick someone already finished. Without this
    // filter, if the suggested initialMemberId (see
    // _enterGroupWaitAsSpectator in lobby.js) turned out to be someone who
    // ALREADY finished (e.g. two players finish almost together and one
    // hasn't yet learned of the other's 'finished' from the race of
    // releasing channels at the same time), the POV started fixed on a
    // member who sends NOTHING more (they already sent their 'timesup'
    // before this channel connected) — with no new round/tick,
    // _advanceToNextAvailable() never fired (it depends on receiving the
    // 'timesup' AGAIN) and it was stuck there forever — the reported "the
    // two who finish early freeze".
    const _availInitial = _members.filter(m => !_finishedUids.has(m.id));
    _currentPovMemberId = (initialMemberId && _availInitial.some(m => m.id === initialMemberId))
      ? initialMemberId : (_availInitial[0] && _availInitial[0].id) || (_members[0] && _members[0].id) || null;
    if (_onMembers) _onMembers(_members);
    // _fetchMembers already seeded _lastState from live_state (DB) for anyone
    // with nothing cached yet — resend it NOW instead of waiting for the
    // initial POV's next live broadcast (same reason as in switchPov, see
    // _resendState).
    if (_currentPovMemberId) _resendState(_currentPovMemberId);

    const uid = _myId();
    _channel = window.sb
      .channel('lobby-' + lobbyId, { config: { presence: { key: 'spectator-' + (uid || Math.random().toString(36).slice(2)) } } })
      // Same event names LB sends (lobby.js sendRound/sendTick/etc) — each
      // payload carries `uid`, we filter here by _currentPovMemberId instead
      // of by host/guest role.
      .on('broadcast', { event: 'round' },     ({ payload }) => {
        if (!payload || !payload.uid) return;
        const st = _stateFor(payload.uid);
        st.phase = 'round'; st.round = payload; st.tick = null; st.pregame = null; st.postgame = null;
        _finishedUids.delete(payload.uid); // back to playing (new mode) — spectatable again
        // "Someone is STILL playing" heartbeat — fires for ANY member, NOT
        // just the current POV (see _onAnyActivity). CRITICAL for lobby.js's
        // 12s lifeline: if I'm watching on loan a player who already
        // finished (e.g. 2 finish almost together and I ended up watching the
        // other one who's done, not the one still playing), that player
        // sends nothing, so the POV's _onRound/_onTick never fire — but the
        // one who IS still playing sends ticks/rounds that reach here anyway
        // (same topic), and THIS not-filtered-by-POV heartbeat reschedules
        // the lifeline so it does NOT fire early (the reported "the 2 who
        // finish early freeze").
        if (_onAnyActivity) _onAnyActivity(payload.uid);
        if (_isFromPov(payload.uid) && _onRound) _onRound(payload);
      })
      .on('broadcast', { event: 'gtick' },     ({ payload }) => {
        if (!payload || !payload.uid) return;
        const st = _stateFor(payload.uid);
        st.tick = payload.timeLeft;
        // A real tick only arrives AFTER that member's 3-2-1 already ended —
        // without this, st.phase stayed at 'pregame' (left by that round's
        // 'pregame' broadcast) through the WHOLE of round 1, until round 2's
        // 'round' arrived. _resendState() checks st.phase BEFORE st.round —
        // so switching POV in the middle of round 1 replayed the 3-2-1/GO
        // (and its music) every time, instead of showing the board already
        // in progress (the reported "in the first round every POV switch
        // plays the GO again, fixed in the second round" — from then on that
        // round's 'round' had already set phase='round').
        if (st.phase === 'pregame') st.phase = 'round';
        if (_onAnyActivity) _onAnyActivity(payload.uid); // see comment in 'round'
        if (_isFromPov(payload.uid) && _onTick) _onTick(payload.timeLeft);
      })
      .on('broadcast', { event: 'pregame' },   ({ payload }) => {
        if (!payload || !payload.uid) return;
        const st = _stateFor(payload.uid);
        st.phase = 'pregame'; st.pregame = payload;
        _finishedUids.delete(payload.uid);
        if (_isFromPov(payload.uid) && _onPregame) _onPregame(payload);
      })
      .on('broadcast', { event: 'postgame' },  ({ payload }) => {
        if (!payload || !payload.uid) return;
        // kind:'intermediate'/'final' is the WHOLE ROOM's RANKING (see
        // _presentIntermediateResult/_showLobbyResult in lobby.js) — not a
        // member's individual postgame (a real one is never sent in room
        // matches, see _lobbyHandleGameEnd), so it's NEVER filtered by POV
        // (everyone must see the table as soon as it's ready) NOR cached in
        // _lastState[uid]: whoever sent this broadcast (typically the last to
        // finish) isn't "marked" with it as if it were THEIR game state —
        // without this guard, _resendState() could replay this OLD ranking to
        // a spectator who later switched POV toward that person in a next
        // mode, covering a new match already in progress with the previous
        // round's result.
        if (payload.kind === 'intermediate' || payload.kind === 'final') {
          // The REAL postgame arrived — cancel the fallback (see reveal handler).
          clearTimeout(_postgameFallbackTimer); _postgameFallbackTimer = null;
          // intermediate = the room moves to the NEXT mode — reset the pool
          // of blocked POVs: in the new mode EVERYONE plays again, so the
          // spectator must be able to see them all again. Without this, those
          // who finished early in the previous mode stayed blocked from the
          // rotation in the next mode too (reported). Each one's
          // round/pregame unblock them one by one anyway, but clearing here
          // does it at once without waiting.
          if (payload.kind === 'intermediate') {
            _finishedUids.clear();
            // Clear the cached state of ALL members — it's from the PREVIOUS
            // mode (old round, low timer=red, cities/etc assets). Without
            // this, when the next mode started _resendState replayed that old
            // state BEFORE the new data arrived: you saw the red countdown
            // in the initial 60s and assets/text from the previous mode
            // mixed with the new one (monuments↔cities, reported). Each one's
            // next real round/pregame repopulates it cleanly.
            Object.keys(_lastState).forEach(k => delete _lastState[k]);
            // The bonus dots (streak) are also from the previous mode — they
            // start at 0 each mode. Without clearing, the new mode showed the
            // old dots until the first answer. (_scores is NOT cleared: the
            // score is CUMULATIVE across modes.)
            Object.keys(_dots).forEach(k => delete _dots[k]);
          }
          if (_onPostgame) _onPostgame(payload);
          return;
        }
        const st = _stateFor(payload.uid);
        st.phase = 'postgame'; st.postgame = payload;
        if (_isFromPov(payload.uid) && _onPostgame) _onPostgame(payload);
      })
      .on('broadcast', { event: 'ganswer' },   ({ payload }) => {
        if (!payload || !payload.uid) return;
        // Cache score/dots of ANY member (not just the current POV) — same
        // reason as _scores: without this, switching POV with the arrows left
        // the PREVIOUS member's scoreboard and dot streak stuck until the new
        // one answered something (the reported "the dots don't turn on/off
        // live, it only reacts once they do an action").
        if (typeof payload.score === 'number') { _scores[payload.uid] = payload.score; const m = _members.find(x => x.id === payload.uid); if (m) m.score = payload.score; }
        if (typeof payload.dots === 'number') _dots[payload.uid] = payload.dots;
        if (_isFromPov(payload.uid) && _onAnswer) _onAnswer(payload);
      })
      .on('broadcast', { event: 'timesup' },   ({ payload }) => {
        if (!payload || !payload.uid) return;
        const wasCurrentPov = _isFromPov(payload.uid);
        _finishedUids.add(payload.uid);
        // "Time ran out" effect on THAT member's card (shake + timer) — NOT
        // filtered by POV: shown for ANY member who runs out of time, like
        // the 'wrong' flash (see _onWrong).
        if (_onTimesUpAny) _onTimesUpAny(payload.uid);
        if (wasCurrentPov && _onTimesUp) _onTimesUp();
        // If I happened to be watching THIS member, jump to the next
        // available — but with a MARGIN, not instantly. The timesups arrive
        // staggered: if EVERYONE finished nearly at once, at the moment of
        // the current POV's timesup the others hadn't reported theirs yet, so
        // they seemed to "still be playing" and a jump to one of them was
        // forced (who had actually already finished) — the reported "forces a
        // POV change even though everyone finished at once". Waiting ~600ms:
        // if by then everyone finished, _advanceToNextAvailable has nowhere
        // to jump (does nothing); if some are really still playing, then it
        // jumps. Only runs if the POV is still this member.
        if (wasCurrentPov) {
          clearTimeout(_advancePovTimer);
          _advancePovTimer = setTimeout(() => {
            if (_isFromPov(payload.uid)) _advanceToNextAvailable();
          }, 600);
        }
      })
      .on('broadcast', { event: 'splash' },    ({ payload }) => {
        if (!payload || !payload.uid) return;
        const st = _stateFor(payload.uid);
        st.phase = 'splash'; st.splash = payload;
        _finishedUids.delete(payload.uid);
        if (_isFromPov(payload.uid) && _onSplash) _onSplash(payload);
      })
      .on('broadcast', { event: 'advancing' }, ({ payload }) => { if (payload && _isFromPov(payload.uid) && _onAdvancing) _onAdvancing(); })
      // Missed a question — same 'wrong' event LB already uses (lobby.js,
      // sendWrong/onWrong) for the flash the real player sees on their own
      // leaderboard when ANOTHER member misses. Unlike the other events,
      // THIS one isn't filtered by POV: the real player sees the flash of
      // ANY member who misses on their side card, whether watching them or
      // not right now — before, it only signaled here if it matched the
      // current POV, so a miss by someone you weren't watching was mute (the
      // reported "it only works when you see that person, not the room in
      // general"). The uid is sent so the UI decides WHICH card row to
      // flash.
      .on('broadcast', { event: 'wrong' }, ({ payload }) => { if (payload && payload.uid && _onWrong) _onWrong(payload.uid); })
      // Live score of ANY member (not just the current POV) — for the side
      // card with all scores, same as the real player sees (see LB.onScore
      // in lobby.js, same 'lbscore' event).
      .on('broadcast', { event: 'lbscore' }, ({ payload }) => {
        if (!payload || !payload.uid) return;
        _scores[payload.uid] = payload.score || 0;
        const m = _members.find(x => x.id === payload.uid);
        if (m) m.score = _scores[payload.uid];
        if (_onScore) _onScore(payload.uid, _scores[payload.uid]);
      })
      // Someone joined/left the room while spectating — refresh the list so
      // the arrows don't offer someone no longer there.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, () => {
        _fetchMembers(_lobbyId).then(m => {
          _members = m;
          if (_onMembers) _onMembers(_members);
          // Backup for the presence 'leave' handler (covers the real
          // abandonment, which deletes the lobby_members row): with 1 or 0
          // real members there's no match left to actually spectate (same
          // threshold as the player-side "I'm alone", see _onAlone in
          // lobby.js) → kick; current POV gone → advance to the next
          // available.
          if (_members.length <= 1) { if (_onRoomEmpty) _onRoomEmpty(); return; }
          if (_currentPovMemberId && !_members.some(x => x.id === _currentPovMemberId)) _advanceToNextAvailable();
        });
      })
      // 'finished' (LB.sendFinished) — relayed as-is so
      // _enterGroupWaitAsSpectator (lobby.js) can keep feeding its OWN
      // _checkAllFinished() while the "on loan" lasts, even though its real
      // LB channel is released (releaseChannel) and so would never receive
      // this same event that way. Without this, that player depended
      // ENTIRELY on another client sending them the ready-made ranking
      // (kind:'intermediate'/'final') — if THAT broadcast was lost for any
      // reason, they were left waiting with no other path but the 30s
      // lifeline (the reported "they stay frozen... the panel never shows").
      .on('broadcast', { event: 'finished' }, ({ payload }) => {
        if (!payload || !payload.uid) return;
        // A player can finish WITHOUT the clock running out (answers
        // everything early) — there only this 'finished' arrives, never
        // 'timesup'. _finishedUids used to only be filled from 'timesup', so
        // for this player the presence 'leave' handler (below) didn't
        // recognize it as a normal finish when they released their channel to
        // start spectating the others: it removed them from _members as if
        // they had genuinely disconnected, and with no other event to
        // restore them they were left "lost" (no wrong flash, no live score)
        // for the rest of the mode and dragged into the next one (the
        // reported "those who finish early seem to disconnect from the
        // versus").
        _finishedUids.add(payload.uid);
        if (_onFinished) _onFinished(payload.uid, payload.score);
      })
      // Shared wall clock (see LB.sendReveal/_checkAllFinished in lobby.js)
      // — same topic, so it arrives here regardless of the own LB channel
      // being released while spectating on loan.
      .on('broadcast', { event: 'reveal' }, ({ payload }) => {
        if (!payload || typeof payload.revealAt !== 'number') return;
        if (_onReveal) _onReveal(payload.revealAt, !!payload.isFinal);
        // Spectator FALLBACK: the 'reveal' means EVERYONE finished. The real
        // ranking arrives via the 'postgame' broadcast (kind:'final'), but
        // the spectator has NO other path if that broadcast is lost (channel
        // blip in that window) — they froze with no table (reported, rare
        // but "in theory should never happen"). Here we arm a lifeline: if
        // the postgame doesn't arrive within ~3.5s, we rebuild the final
        // table from the ALREADY-cached scores (_members have .score from the
        // 'lbscore' broadcasts). Only for the FINAL — the intermediate
        // recovers on its own when the next mode starts. It's cancelled as
        // soon as the real postgame arrives (see above).
        if (payload.isFinal) _armPostgameFinalFallback();
      })
      // Room-wide GLOBAL spectator count — in a group they're treated as
      // global: the "spectating" symbol appears on all members equally while
      // there's at least one spectator. Every 'spectator-*' key is counted,
      // without filtering by who they watch. It used to be filtered by pov,
      // which forced a re-track on every POV change — and THAT disconnected
      // the channel (the reported "switching POV disconnects me").
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = _channel.presenceState();
          let n = 0;
          Object.keys(state).forEach(k => { if (k.indexOf('spectator-') === 0) n++; });
          if (_onSpectatorCount) _onSpectatorCount(n);
        } catch (e) {}
      })
      // A PLAYER left/disconnected from the room while spectating (their
      // presence drops). Two things: (1) if it was WHO the spectator was
      // watching, jump the POV to the next available (don't stay frozen on a
      // dead card); (2) if NO player with presence remains (the room
      // emptied — everyone abandoned/disconnected), signal to take the
      // spectator out with the "room abandoned" screen, same as the player
      // is kicked for being alone. 'spectator-*' keys are ignored (they're
      // other spectators, not players).
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!key || key.indexOf('spectator-') === 0) return;
        // Presence is NOT the source of truth for "the room emptied": a
        // player switching to spectate on loan (see _enterGroupWaitAsSpectator
        // in lobby.js) also releases their real PLAYER presence for an
        // instant, without having abandoned — counting it by presence
        // confused "they're elsewhere in the game" (normal internal
        // transition) with a real abandonment, kicking the external spectator
        // with "room empty" mid-round (reported). The lobby_members table IS
        // the source of truth: it's re-queried here and the real kick goes
        // through the same threshold as the player-side "I'm alone" (_onAlone
        // in lobby.js) — 1 or 0 genuinely real members in the room.
        _fetchMembers(_lobbyId).then(freshMembers => {
          _members = freshMembers;
          if (_onMembers) _onMembers(_members);
          if (_members.length <= 1) { if (_onRoomEmpty) _onRoomEmpty(); return; }
          delete _lastState[key]; _finishedUids.delete(key);
          if (_currentPovMemberId && !_members.some(m => m.id === _currentPovMemberId)) _advanceToNextAvailable();
        }).catch(() => {});
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          _reconnectAttempts = 0; // healthy connection — reset the backoff
          if (_reconnecting) { _reconnecting = false; if (_onReconnected) { try { _onReconnected(); } catch (e) {} } }
          // Track presence ONCE here (on connect/reconnect) — no longer
          // re-tracked on every POV change (the count is global, see the
          // sync above). No pov: the count doesn't need it.
          try { await _channel.track({ t: Date.now() }); } catch (e) {}
        } else if ((status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !_stopping && _lobbyId) {
          // UNEXPECTED close (we didn't request it) — retry reconnecting.
          _scheduleReconnect();
        }
      });
  }
  function _scheduleReconnect() {
    if (_reconnectTimer || _stopping) return;
    _reconnecting = true;
    if (_onReconnecting) { try { _onReconnecting(); } catch (e) {} }
    const lobbyId = _lobbyId;
    const povId   = _currentPovMemberId;
    const finished = Array.from(_finishedUids);
    if (!lobbyId) return;
    _reconnectAttempts++;
    const delay = Math.min(300 * _reconnectAttempts, 4000); // backoff (300,600,900...), cap 4s
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      if (_stopping || !lobbyId) return;
      // watch() re-subscribes (re-fetch members + rebuild channel),
      // preserving who was being watched (povId) and who already finished.
      watch(lobbyId, povId, { preFinishedUids: finished, _isReconnect: true });
    }, delay);
  }

  // Same mechanism as the equivalent in lobby.js (LB): browsers throttle a
  // background tab's timers, which the Realtime heartbeat depends on — if
  // it's delayed too long, the spectator's channel can hang without this
  // client noticing until the next natural reconnection attempt (or never,
  // if the CLOSED/TIMED_OUT doesn't fire). On returning to the foreground,
  // force the reconnection NOW if the channel isn't actually connected,
  // instead of waiting.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (_stopping || _reconnecting || !_lobbyId) return;
    if (_channel && _channel.state === 'joined') return; // healthy connection
    _reconnectAttempts = 0; // returning from background doesn't count as a repeated failure — clean backoff
    _scheduleReconnect();
  });

  // direction: +1 (next) / -1 (previous), circular — ONLY among members who
  // still have something to show (see _finishedUids: one who already had
  // their 'timesup' for this mode is out of the rotation until the next
  // mode/match starts). Returns the new memberId, or null if nobody is
  // available (everyone finished this round of modes).
  function _movePov(direction) {
    if (!_members.length) return null;
    const available = _members.filter(m => !_finishedUids.has(m.id));
    if (!available.length) return null;
    const idx = available.findIndex(m => m.id === _currentPovMemberId);
    const nextIdx = ((idx < 0 ? 0 : idx) + direction + available.length) % available.length;
    const newId = available[nextIdx].id;
    if (newId === _currentPovMemberId) return _currentPovMemberId; // it was the only one available
    _currentPovMemberId = newId;
    // Presence is NOT re-tracked on a POV change. Confirmed by logs: if you
    // NEVER switch POV the channel never drops; as soon as you make changes,
    // the repeated presence track()s (even throttled) keep dropping the
    // WebSocket (CLOSED). track() is sent ONLY once, on connect (see
    // subscribe below) — enough for the spectator counter to exist. The
    // downside: that counter stays fixed on the initial POV and doesn't
    // follow the arrow changes — an acceptable trade-off for the connection
    // not dropping. (If you want the counter to follow the POV, do it via a
    // lightweight broadcast instead of a presence re-track — pending.)
    // _onPovChanged IMMEDIATE — it's cheap (name + throttled leaderboard +
    // score + bonus DOTS) and sends NOTHING to the server (the track is
    // already disabled), so there's no reason to delay it: without this, on
    // a POV change the colored bonus dots took 450ms to update (the reported
    // "they don't update in real time on transition"). It also resets the
    // _lastRoundKey/_lastPregameKey dedup, which must be reset BEFORE
    // _resendState (below).
    try { if (_onPovChanged) _onPovChanged(_currentPovMemberId); } catch (e) { console.warn('[spec] _onPovChanged failed:', e); }
    // ONLY the HEAVY board render (_resendState → _onRound) is debounced to
    // 450ms (> the arrows' 350ms cooldown) — spamming coalesces into a
    // single final render, without blocking the thread. The expensive part
    // is this, not the score/dots above.
    clearTimeout(_povUiTimer);
    _povUiTimer = setTimeout(_applyPovResend, 450);
    // Loading circle NOW — immediate visual feedback while the board
    // resolves on release. onRound/onTick hide it when the new data arrives.
    if (typeof window._showVsWaitSpinner === 'function') window._showVsWaitSpinner();
    return _currentPovMemberId;
  }
  let _povUiTimer = null;
  // Only the state resend (board) — _onPovChanged already ran immediately in
  // _movePov. try/catch: _resendState touches fragile DOM/geometry.
  function _applyPovResend() {
    try { _resendState(_currentPovMemberId); } catch (e) { console.warn('[spec] _resendState failed:', e); }
  }
  function switchPov(direction) { return _movePov(direction); }

  // Emits the shared wall clock (see LB.sendReveal in lobby.js) over THIS
  // channel — used when whoever first detects "everyone finished" while
  // spectating on loan is this same player, whose own LB channel is released
  // (LB.sendReveal there would be a silent no-op). Same topic as LB, so any
  // genuinely connected player receives it anyway.
  function sendReveal(revealAt, isFinal) {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'reveal', payload: { revealAt, isFinal: !!isFinal } }); } catch (e) {} }
  }
  // Called ONLY when the member being watched just finished their timer
  // (see 'timesup' above) — jump to any other available one, the exact
  // direction doesn't matter.
  function _advanceToNextAvailable() { _movePov(1); }

  // Resends the new member's last KNOWN state (cached in _lastState since
  // they joined, whether they had focus or not) — without this, switching
  // POV left the old screen frozen until the new person did something (the
  // next tick, up to 1s later) instead of reflecting their current state
  // right away (the reported "it doesn't switch instantly").
  function _resendState(uid) {
    const st = _lastState[uid];
    if (!st) return;
    if (st.phase === 'postgame' && st.postgame && _onPostgame) { _onPostgame(st.postgame); return; }
    if (st.phase === 'pregame'  && st.pregame  && _onPregame)  { _onPregame(st.pregame);  return; }
    if (st.phase === 'splash'   && st.splash   && _onSplash)   { _onSplash(st.splash);    return; }
    if (st.phase === 'round'    && st.round    && _onRound) {
      _onRound(st.round);
      if (typeof st.tick === 'number' && _onTick) _onTick(st.tick);
    }
  }

  function getCurrentMember() { return _members.find(m => m.id === _currentPovMemberId) || null; }
  function getMembers()       { return _members; }

  async function stop() {
    _stopping = true; // INTENTIONAL close — so the status callback doesn't trigger reconnection
    _reconnecting = false;
    clearTimeout(_trackDebounceTimer);
    clearTimeout(_povUiTimer); _povUiTimer = null;
    clearTimeout(_advancePovTimer); _advancePovTimer = null;
    clearTimeout(_postgameFallbackTimer); _postgameFallbackTimer = null;
    clearTimeout(_reconnectTimer); _reconnectTimer = null;
    if (_channel) {
      const ch = _channel; _channel = null;
      try { await ch.untrack(); } catch (e) {}
      // removeChannel (not just unsubscribe): unsubscribe() leaves the
      // 'lobby-{id}' channel still registered in the Supabase client for
      // this topic — when lobby.js re-called sb.channel('lobby-{id}',...) to
      // reconnect its own channel, the SDK reused this SAME instance
      // (already subscribed before) instead of creating a new one, and
      // calling .on('postgres_changes', ...) on an already-subscribe()d
      // channel blows up ("cannot add postgres_changes callbacks ... after
      // subscribe()") — leaving the player's channel broken right on
      // returning from spectate-on-loan (scores/wrong never reached anyone
      // again, reported).
      try { await window.sb.removeChannel(ch); } catch (e) {}
    }
    _lobbyId = null; _members = []; _currentPovMemberId = null;
    _lastTrackedPov = null; _lastTrackAt = 0;
    Object.keys(_scores).forEach(k => delete _scores[k]);
    Object.keys(_dots).forEach(k => delete _dots[k]);
    Object.keys(_lastState).forEach(k => delete _lastState[k]);
    _finishedUids.clear();
    // _renderGroupLeaderboardInner (below) puts 'group-spec-lb-{uid}' rows
    // INSIDE the mode's real leaderboard (#flags-leaderboard / #leaderboard)
    // — not a separate overlay — and they only auto-clean by comparing
    // against the current set on EACH re-render while still spectating. On
    // stop() that function stops running, so the last render's rows were
    // left orphaned in there forever: static, unanimated, behind/among the
    // real rows of the player who goes back to playing (the reported "the
    // tables stay still in the back"). They must be swept here, outside both
    // possible leaderboards (one per mode, flags separate).
    ['flags-leaderboard', 'leaderboard'].forEach(id => {
      const lb = document.getElementById(id);
      if (lb) Array.from(lb.querySelectorAll('[id^="group-spec-lb-"]')).forEach(el => el.remove());
    });
  }

  return {
    watch, stop, switchPov, getCurrentMember, getMembers, sendReveal,
    getDots: uid => _dots[uid],
    onMembers:        cb => { _onMembers = cb; },
    onRoomEmpty:      cb => { _onRoomEmpty = cb; },
    onRound:          cb => { _onRound = cb; },
    onTick:           cb => { _onTick = cb; },
    onPregame:        cb => { _onPregame = cb; },
    onPostgame:       cb => { _onPostgame = cb; },
    onAnswer:         cb => { _onAnswer = cb; },
    onTimesUp:        cb => { _onTimesUp = cb; },
    onTimesUpAny:     cb => { _onTimesUpAny = cb; },
    onSplash:         cb => { _onSplash = cb; },
    onAdvancing:      cb => { _onAdvancing = cb; },
    onSpectatorCount: cb => { _onSpectatorCount = cb; },
    onPovChanged:     cb => { _onPovChanged = cb; },
    onScore:          cb => { _onScore = cb; },
    onWrong:          cb => { _onWrong = cb; },
    onFinished:       cb => { _onFinished = cb; },
    onReveal:         cb => { _onReveal = cb; },
    onAnyActivity:    cb => { _onAnyActivity = cb; },
    onReconnecting:   cb => { _onReconnecting = cb; },
    onReconnected:    cb => { _onReconnected = cb; },
    isReconnecting:   () => _reconnecting,
    getLobbyId:       () => _lobbyId,
  };
})();

// ── Spectator panel UI ─────────────────────────────────────────────────────
// It's an overlay over the loading-screen (like the versus/lobby result) —
// it doesn't touch splash/pregame because the spectator isn't "playing", just
// watching. If the mode has a reusable "real" screen (window.flagsSpectatorEnter,
// today only Flags) we show THAT — the real #flags-wrapper, with the real
// machine/suitcases/flags — instead of the generic panel below, which is a
// fallback for the modes that don't have that integration yet
// (Shapes/Cities/Monuments).
(function () {
  const screen      = document.getElementById('spectator-screen');
  if (!screen) return;
  const titleEl      = document.getElementById('spectator-title');
  const hostPic      = document.getElementById('spectator-host-pic');
  const hostPicWrap  = document.getElementById('spectator-host-pic-wrap');
  const hostNameEl   = document.getElementById('spectator-host-name');
  const hostScoreEl  = document.getElementById('spectator-host-score');
  const guestPic     = document.getElementById('spectator-guest-pic');
  const guestPicWrap = document.getElementById('spectator-guest-pic-wrap');
  const guestNameEl  = document.getElementById('spectator-guest-name');
  const guestScoreEl = document.getElementById('spectator-guest-score');
  const promptEl     = document.getElementById('spectator-prompt');
  const optionsEl    = document.getElementById('spectator-options');
  const statusEl     = document.getElementById('spectator-status');
  const closeBtn     = document.getElementById('spectator-close');

  const miniHud       = document.getElementById('spectator-mini-hud');
  const miniAvatarEl  = document.getElementById('spectator-mini-avatar');
  const miniAvatarWrap = document.getElementById('spectator-mini-avatar-wrap');
  const miniNameEl    = document.getElementById('spectator-mini-name');

  const loadingEl      = document.getElementById('spectator-loading');
  const loadingBarFill = document.getElementById('spectator-loading-bar-fill');

  // Idle watchdog: if the spectated player moves to a pre/post-game (splash,
  // results, mode change within the campaign, etc.) NO 'round'/'tick'/'answer'
  // arrives — without this the spectator keeps staring at the last frozen
  // frame with no indication of what's going on. Reuses the same loading
  // transition as a lightweight notice: nothing is unmounted, it's just
  // covered until there's real activity again.
  const IDLE_MS = 3500;
  let _idleWatchdogId = null;
  let _idleShown       = false;
  let _reconnectNoticeTimer = null; // see onReconnecting: delays the "Reconnecting..." notice so it doesn't bother on quick blips

  // Stops the watchdog and hides the notice if it was showing, but does NOT
  // re-arm it — for pregame/postgame/onEnd, where we already know what's
  // going on and a generic notice on top isn't warranted.
  function _clearIdleWatchdog() {
    clearTimeout(_idleWatchdogId);
    clearTimeout(_reconnectNoticeTimer); _reconnectNoticeTimer = null;
    if (_idleShown) {
      _idleShown = false;
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading();
    }
  }
  function _resetIdleWatchdog() {
    _clearIdleWatchdog();
    if (_usingRealUI) _idleWatchdogId = setTimeout(_showIdleNotice, IDLE_MS);
  }
  function _showIdleNotice() {
    if (!_usingRealUI || _idleShown) return;
    _idleShown = true;
    // If the group channel is reconnecting (the WebSocket dropped, see
    // _scheduleReconnect in GroupSpectate), the player is NOT "elsewhere in
    // the game" — they're going through a connection outage; show
    // "Reconnecting..." instead of the generic idle notice.
    const reconnecting = _groupMode && window.GroupSpectate && typeof window.GroupSpectate.isReconnecting === 'function' && window.GroupSpectate.isReconnecting();
    // t() returns the key itself if it can't find it (e.g. stale cached
    // i18n.js) — explicit fallback so it doesn't show "spectator.reconnecting".
    if (loadingTextEl) loadingTextEl.textContent = reconnecting
      ? ((typeof t === 'function' && t('spectator.reconnecting') !== 'spectator.reconnecting') ? t('spectator.reconnecting') : 'Reconectando...')
      : ((typeof t === 'function') ? t('spectator.idle', { name: _friendName || t('spectator.defaultPlayer') })
                                   : (_friendName || 'El jugador') + ' está en otra parte del juego...');
    _showLoading();
  }

  let _mode = 'flags';
  // true while spectating a GROUP duel (openSpectatorGroup) instead of
  // 1v1/solo — controls whether the POV arrows show and whether
  // closeSpectator() should stop GroupSpectate instead of Spectate.
  let _groupMode = false;
  // true when the group "spectator" is THE PLAYER THEMSELVES watching their
  // room mates on loan (openSpectatorGroup(...,{instant:true}), see
  // _enterGroupWaitAsSpectator in lobby.js) — unlike a real EXTERNAL
  // spectator. The round-end ranking (kind:'intermediate'/'final') for this
  // case must not be shown here with the neutral mirror: lobby.js must be
  // told to show ITS OWN personalized result (YOU WON/You placed #2) instead
  // of the generic "so-and-so WINS".
  let _groupInstant = false;
  // true between the moment closeSpectator() decides to close and the moment
  // the session actually ends — lets the _wireCommonCallbacks handlers
  // ignore any event already in flight (arrived just when Spectate.stop()
  // was called) during that window.
  let _closing = false;
  // Identity of the last already-processed round (mode+prompt+options+correctSlot)
  // — the same spectator can receive the SAME 'round' twice: once live (if
  // they connect right as it starts) and again via the resend triggered by
  // their own presence 'join' 150ms later (SoloSpectate doesn't know whether
  // this particular spectator already saw it, so resend always sends the
  // last known state). Without this check, showRound() was called again for
  // the SAME round — replaying the tags/suitcases entrance animation and the
  // sound, the reported "it duplicates".
  let _lastRoundKey = null;
  let _lastPregameKey = null; // ditto, for the 3-2-1 (see comment in onPregame)
  let _usingRealUI = false;
  // Which mode is mounted NOW in the real UI — separate from _mode, which
  // can change as soon as a 'round' from a different mode arrives (the
  // campaign chains flags→shapes→cities→monuments). Without this separate
  // tracking, _enterRealUIIfPossible('shapes') saw _usingRealUI already true
  // (from flags) and did NOTHING — neither left flags nor entered shapes —
  // so the shapes functions were called without ever going through
  // shapesSpectatorEnter(), and all their `if (!_shapesSpecMode) return`
  // guards left them as silent no-ops (the reported "it doesn't react").
  let _activeRealUIMode = null;
  let _friendName   = '';
  let _friendAvatar = '';
  // Card code (images/customize/cards/<code>.png) of the spectated friend —
  // used by *SpectatorSetPlayerCard (flags/shapes/cities/monuments) so the
  // REAL leaderboard chip the spectator sees shows the card that player has
  // actually equipped, not the default. The frame is deliberately NOT here
  // (established rule: frame only on the large profile photo, never on a
  // card/leaderboard-style avatar).
  let _friendCardCode = '0001';
  // Frame code (images/customize/frames/<code>.png) of the spectated friend
  // — this one IS used in the mini-HUD (spectator-mini-avatar), unlike
  // _friendCardCode: here it's the "who am I watching" identity photo, not a
  // card/leaderboard-style avatar, so the real frame applies as on the large
  // profile photo.
  let _friendFrameCode = '0001';
  let _friendIsHost = true; // in solo always "host" (sole player); in versus resolved on connect
  let _lastHost = 0, _lastGuest = 0;
  // Identity of the spectated friend's OPPONENT (versus only) — resolved once
  // on connect (see openSpectator/onSnapshot), querying profiles by the side
  // of the match that isn't the friend. null in solo mode (doesn't apply).
  let _oppName = null, _oppAvatar = null;
  let _oppCardCode = '0001';
  // true when the "spectator" is THE PLAYER THEMSELVES watching their
  // opponent on loan (vs.js _enterWaitAsSpectator, opts.instant in
  // openSpectator) — see the long comment in _wireCommonCallbacks's onEnd:
  // without this, the status='finished' the OPPONENT writes (inside THEIR
  // OWN _showVsResult, via VS.finish()) reached this player over this same
  // Spectate channel and triggered the generic "the friend stopped playing
  // → return to the menu" (meant for an EXTERNAL spectator) — racing and
  // beating vs.js's synced _revealAt and sending the player straight to the
  // menu instead of letting them see THEIR OWN result (the reported "it
  // kicks me to the menu").
  let _suppressGenericEnd = false;

  // Clash Royale-style loading transition: shown on tapping the eye (covers
  // the panel/mini-hud already built behind) and fades out once we're
  // connected to the live channel. Minimum duration so it isn't an
  // imperceptible flash even if the connection is near-instant.
  const LOADING_MIN_MS = 550;
  let _loadingShownAt   = 0;
  let _loadingTickId    = null;
  let _loadingPct       = 0;
  // IDs of _hideLoading's two chained setTimeouts (minimum wait + 350ms
  // fade) — see the long comment in _hideLoading below.
  let _hideLoadingT1 = null, _hideLoadingT2 = null;

  function _showLoading() {
    // Cancels any old _hideLoading() still in flight — without this, that
    // pending callback could fire later and abruptly cover THIS new
    // transition mid-way (see the long comment in _hideLoading).
    clearTimeout(_hideLoadingT1); clearTimeout(_hideLoadingT2);
    _loadingPct = 15;
    loadingBarFill.style.width = _loadingPct + '%';
    loadingEl.style.display = 'flex';
    void loadingEl.offsetWidth;
    loadingEl.classList.add('visible');
    _loadingShownAt = Date.now();
    // Simulated progress: we don't know how long until the player finishes
    // their 3-2-1 or starts the next round, so the bar grows gradually (cap
    // 85%) instead of jumping straight to 100% — it looks genuinely
    // "loading" instead of completing instantly.
    clearInterval(_loadingTickId);
    _loadingTickId = setInterval(() => {
      if (_loadingPct >= 85) return;
      _loadingPct = Math.min(85, _loadingPct + 4);
      loadingBarFill.style.width = _loadingPct + '%';
    }, 180);
  }
  // immediate=true skips the minimum display time (LOADING_MIN_MS) — used on
  // entering the pregame: that minimum (550ms) + the 350ms fade covered up
  // to 900ms of the real 3-2-1 (the "3" and part of the "2" were never seen,
  // the spectator only saw something when the count was already advanced).
  // Without tracking/cancelling these IDs, an OLD _hideLoading() call (e.g.
  // from the normal onRound/onPregame of a round already past) could fire
  // its callback AFTER closeSpectator() had re-shown the loading screen for
  // its OWN close transition — abruptly covering it
  // (classList.remove('visible') + display:none) before its own time was up,
  // the reported "it disappears instantly".
  function _hideLoading(immediate) {
    clearInterval(_loadingTickId);
    clearTimeout(_hideLoadingT1); clearTimeout(_hideLoadingT2);
    loadingBarFill.style.width = '100%';
    const wait = immediate ? 0 : Math.max(0, LOADING_MIN_MS - (Date.now() - _loadingShownAt));
    _hideLoadingT1 = setTimeout(() => {
      loadingEl.classList.remove('visible');
      _hideLoadingT2 = setTimeout(() => {
        loadingEl.style.display = 'none';
        loadingBarFill.style.width = '0%';
        // Only now, with the loading screen fully gone, is the spectator
        // count that arrived in the meantime applied — see
        // _applySpectatorBadge().
        _applySpectatorBadge();
      }, 350);
    }, wait);
  }

  // How many spectators are watching (this one included) — same icon the
  // player sees of themselves. _lastSpectatorN updates as soon as the
  // presence 'sync' arrives (can happen at any time, even while
  // #spectator-loading is still covering the screen, just connecting or
  // mid loading transition) but the DOM is NOT touched until the load
  // actually finishes — without this brake, the badge appeared BEFORE the
  // real screen was uncovered, floating over the transition.
  let _lastSpectatorN = 0;
  function _applySpectatorBadge() {
    if (loadingEl.classList.contains('visible')) return;
    const isFlags = window.pendingGameMode === 'flags';
    const badge   = document.getElementById(isFlags ? 'flags-vs-spectator-badge' : 'vs-spectator-badge');
    const countEl = document.getElementById(isFlags ? 'flags-vs-spectator-count' : 'vs-spectator-count');
    // The OTHER badge (the one not matching the current mode) is always
    // turned off, explicitly — the campaign switches mode
    // (flags→shapes→cities) without necessarily a presence 'sync' arriving
    // again at that instant (the presence state didn't change, only the
    // mode), so without this the OLD mode's badge stayed visible forever if
    // it had ever been shown — the reported "it duplicates" (two eyes on
    // screen, one per badge, in two different positions).
    const otherBadge = document.getElementById(isFlags ? 'vs-spectator-badge' : 'flags-vs-spectator-badge');
    if (otherBadge) otherBadge.style.display = 'none';
    if (badge) badge.style.display = _lastSpectatorN > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = _lastSpectatorN;
  }

  // ── INSTRUCTIONS SCREEN MIRROR (splash) ───────────────────────────────────
  // Reuses the REAL #splash-screen (the same one the player actually playing
  // in this tab sees) in read-only mode, instead of the generic loading
  // screen — so the spectator sees the same text/characters/video as the
  // spectated player, not just a "Loading...". Same class/text the real
  // handlers of loading-flags-btn/loading-shapes-btn/loading-play-btn/
  // loading-mode4-btn (step 1) and the .splash-confirm-wrap handler in
  // js/core/ui-helpers.js (step 2, after the first real confirm — see the
  // window._specReportSplash({mode, step:2}) added there) set — check those
  // same blocks if this desyncs in the future. .game-bg-men1/men2/girl1/
  // girl2/women1/women2 are elements SHARED across the 4 modes (each sets
  // its own sprite) — without this swap here, the spectator saw the
  // characters left by whatever THIS tab last played/spectated, not those of
  // the mode actually being watched.
  const SPLASH_MODE_CLASSES = {
    flags: {
      add: ['mode-flags'], remove: ['mode-shapes', 'mode-monuments'], key1: 'splash.flags.1', key2: 'splash.flags.2',
      sprites: { men1: 'men3', men2: 'men4', girl1: 'girl3', girl2: 'girl4', women1: 'women2', women2: 'women3' },
      video: 'images/howtoplay/howtoplay1.mp4',
      bg: [['game-bg-city', 'images/bg/level1complete.png']],
    },
    shapes: {
      add: ['mode-flags', 'mode-shapes'], remove: ['mode-monuments'], key1: 'splash.shapes.1', key2: 'splash.shapes.2',
      sprites: { men1: 'men5', men2: 'men6', girl1: 'girl5', girl2: 'girl6', women1: 'women4', women2: 'women5' },
      video: 'images/howtoplay/howtoplay2.mp4',
      bg: [['game-bg-city', 'images/bg/level2complete.png']],
    },
    game: {
      add: [], remove: ['mode-flags', 'mode-shapes', 'mode-monuments'], key1: 'splash.cities.1', key2: 'splash.cities.2',
      sprites: { men1: 'men1', men2: 'men2', girl1: 'girl1', girl2: 'girl2', women1: 'women1', women2: 'women1' },
      video: 'images/howtoplay/howtoplay3.mp4',
      bg: [['game-bg-city', 'images/bg/level3complete.png']],
    },
    monuments: {
      add: ['mode-monuments'], remove: ['mode-flags', 'mode-shapes'], key1: 'splash.monuments.1', key2: 'splash.monuments.2',
      sprites: { men1: 'men1', men2: 'men2', girl1: 'girl1', girl2: 'girl2', women1: 'women1', women2: 'women1' },
      video: 'images/howtoplay/howtoplay4.mp4',
      // monuments releases .game-bg-city (cities' background) before setting
      // its own, in two layers — same order as its real handler
      // (loading-mode4-btn in shapes.js).
      bg: [['game-bg-city', ''], ['game-bg-city-monuments', 'images/bg/level4complete.png'], ['game-bg-city-monuments2', 'images/bg/level4complete2.png']],
    },
  };
  let _splashMirrorShown = false;
  // Mode currently mounted in the mirror — if a 'splash' from the same mode
  // arrives but step:2 (the real player already hit the first confirm), we
  // need to distinguish "change step" from "change mode" so as not to touch
  // the <video> (src swap + load()) unnecessarily on every tick.
  let _splashMirrorMode = null;

  function _showSplashMirror(mode, step) {
    const splashEl = document.getElementById('splash-screen');
    if (!splashEl) return;
    const cfg = SPLASH_MODE_CLASSES[mode] || SPLASH_MODE_CLASSES.flags;
    const isNewMode = _splashMirrorMode !== mode;
    _splashMirrorMode = mode;
    _hideLoading(true);
    screen.style.display = 'none';
    // #loading-screen (this tab's real menu) has z-index:200, higher than
    // #splash-screen (z-index:100) — if it stayed visible from when the
    // spectator panel was opened from there, it would cover the mirror
    // entirely. flagsSpectatorEnter/shapesSpectatorEnter already hide it
    // when they mount the real UI, but a 'splash' can be the FIRST event of
    // the session (the spectator joined while the player was just on the
    // instructions), before any *Enter() ever ran — it must be hidden here
    // too, not assumed to already be.
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'none';
    cfg.add.forEach(c => splashEl.classList.add(c));
    cfg.remove.forEach(c => splashEl.classList.remove(c));
    Object.keys(cfg.sprites).forEach(key => {
      document.querySelectorAll('.game-bg-' + key).forEach(el => { el.src = 'images/characters/' + cfg.sprites[key] + '.png'; });
    });
    // Background (.game-bg-city / .game-bg-city-monuments) — same element
    // SHARED across the 4 modes as the sprites above: without this swap here
    // the one from the LAST time this tab spectated or played something
    // stayed, not the mode being watched now — the reported "the pre
    // background bugs out and shows a wrong one, especially entering several
    // times".
    (cfg.bg || []).forEach(([cls, src]) => {
      document.querySelectorAll('.' + cls).forEach(el => { el.src = src; });
    });
    const label = splashEl.querySelector('.splash-text2-label');
    const howtoWrap  = splashEl.querySelector('.splash-howtoplay-wrap');
    const howtoVideo = splashEl.querySelector('.splash-howtoplay-video');
    if (isNewMode && howtoVideo && cfg.video) { try { howtoVideo.src = cfg.video; howtoVideo.load(); } catch (e) {} }
    if (step === 2) {
      // Same visual change as the real step 2: the help video "slides down"
      // (slide-down) and the text moves to the gameplay instructions message.
      if (label) { label.textContent = (typeof t === 'function') ? t(cfg.key2) : ''; label.classList.add('step2'); }
      if (howtoWrap) howtoWrap.classList.add('slide-down');
      // Autoplay may be blocked without a user gesture in this tab (normal
      // for the spectator) — like sfxPlay elsewhere in the code, it's tried
      // and the rejection ignored; the video still stays there, paused on
      // its first frame, which is better than nothing.
      // Chrome-iOS (see IS_CHROME_IOS, js/core/audio.js): never decode here
      // either — same crash reported in the real flow, see Ver.3.5.41.
      if (howtoVideo && !(typeof IS_CHROME_IOS !== 'undefined' && IS_CHROME_IOS)) {
        try { howtoVideo.play().catch(() => {}); } catch (e) {}
      }
    } else {
      if (label) { label.textContent = (typeof t === 'function') ? t(cfg.key1) : ''; label.classList.remove('step2'); }
      if (howtoWrap) howtoWrap.classList.remove('slide-down');
      if (howtoVideo) { try { howtoVideo.pause(); } catch (e) {} }
    }
    // Read-only: neither the confirm nor any other element in here should
    // react to a spectator click (it would start/overwrite THIS tab's REAL
    // game state, e.g. if the spectator later wants to play).
    splashEl.style.pointerEvents = 'none';
    // The parent's pointer-events:none is NOT enough for the confirm:
    // .splash-confirm-wrap has its OWN rule `.confirm-ready {
    // pointer-events: auto; }` that OVERRIDES it as soon as
    // showSplashConfirm() adds that class — a spectator could click it
    // anyway and trigger THIS tab's REAL match advancing (typical: the
    // player just quit THEIR own half-played match and enters to spectate
    // another). An inline style (confirmWrap.style.pointerEvents='none')
    // isn't quite enough either: if the campaign's next mode calls
    // showSplashConfirm() again (THAT mode's instructions video finishes
    // loading) the class is reapplied and with it pointer-events:auto — the
    // reported bug reappeared in the next mode's "pre". The
    // .spectator-locked class with !important (see CSS) is the only way to
    // win that fight whatever happens after.
    const confirmWrap = splashEl.querySelector('.splash-confirm-wrap');
    if (confirmWrap) confirmWrap.classList.add('spectator-locked');
    splashEl.style.display = 'flex';
    _splashMirrorShown = true;
    // Flight attendant entrance animation — same pattern as the real
    // loading-play-btn/loading-mode4-btn/_fireNext() (campaign chaining):
    // remove the class, force reflow, add it back. It was missing entirely
    // here, so the spectator never saw it — the splash appeared "abruptly"
    // instead of with the animated entrance the real player sees. ONLY on
    // isNewMode (this mode's first dialog, same criterion the real player
    // uses): otherwise, moving from the first to the second dialog (step:2,
    // same `mode`) restarted the entrance animation every time the spectator
    // hit "confirm" — the real player NEVER repeats it there, only on
    // STARTING a new mode.
    if (isNewMode) {
      const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
      animEls.forEach(el => el.classList.remove('animate-in'));
      void splashEl.offsetWidth;
      animEls.forEach(el => el.classList.add('animate-in'));
    }
  }

  function _hideSplashMirror() {
    if (!_splashMirrorShown) return;
    _splashMirrorShown = false;
    _splashMirrorMode = null;
    const splashEl = document.getElementById('splash-screen');
    if (splashEl) {
      splashEl.style.display = 'none';
      splashEl.style.pointerEvents = '';
      // Restore the confirm too — see .spectator-locked added in
      // _showSplashMirror. If not cleared, it stayed blocked (with
      // !important) even if this same tab later started a REAL match (the
      // player could never confirm their own splash).
      const confirmWrap = splashEl.querySelector('.splash-confirm-wrap');
      if (confirmWrap) confirmWrap.classList.remove('spectator-locked');
    }
    // Restore #loading-screen unconditionally: if what follows is a mode's
    // real UI, its own *Enter() hides it again (redundant but harmless); if
    // what follows is closing the session entirely (nothing else will hide
    // it — closeSpectator's _exitRealUI() does nothing here because
    // _usingRealUI never became true), it needs to stay visible so the
    // spectator isn't left with a blank screen.
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'flex';
  }

  // Modes with a reusable real screen — Flags, Shapes, Cities and Monuments.
  // The 'game' key matches window.pendingGameMode==='game' (that's how
  // js/modes/mapgame-play.js sends it in _specReportRound/_specReportSplash)
  // — not 'cities', to avoid mapping between names anywhere. 'monuments'
  // matches pendingGameMode==='monuments' the same way.
  const REAL_UI_MODES = {
    flags: {
      enter: 'flagsSpectatorEnter', exit: 'flagsSpectatorExit',
      showRound: 'flagsSpectatorShowRound', resolvePick: 'flagsSpectatorResolvePick',
      updateTimer: 'flagsSpectatorUpdateTimer', updateScore: 'flagsSpectatorUpdateScore',
      setPlayerCard: 'flagsSpectatorSetPlayerCard', showTimesUp: 'flagsSpectatorShowTimesUp',
      showPregame: 'flagsSpectatorShowPregame', wrongEffect: 'flagsSpectatorWrongEffect',
      timesUpEffect: 'flagsSpectatorTimesUpEffect',
      showPostgame: 'flagsSpectatorShowPostgame', hidePostgame: 'flagsSpectatorHidePostgame',
    },
    shapes: {
      enter: 'shapesSpectatorEnter', exit: 'shapesSpectatorExit',
      showRound: 'shapesSpectatorShowRound', resolvePick: 'shapesSpectatorResolvePick',
      updateTimer: 'shapesSpectatorUpdateTimer', updateScore: 'shapesSpectatorUpdateScore',
      setPlayerCard: 'shapesSpectatorSetPlayerCard', showTimesUp: 'shapesSpectatorShowTimesUp',
      showPregame: 'shapesSpectatorShowPregame', wrongEffect: 'shapesSpectatorWrongEffect',
      timesUpEffect: 'shapesSpectatorTimesUpEffect',
      showPostgame: 'shapesSpectatorShowPostgame', hidePostgame: 'shapesSpectatorHidePostgame',
    },
    game: {
      enter: 'citiesSpectatorEnter', exit: 'citiesSpectatorExit',
      showRound: 'citiesSpectatorShowRound', resolvePick: 'citiesSpectatorResolvePick',
      updateTimer: 'citiesSpectatorUpdateTimer', updateScore: 'citiesSpectatorUpdateScore',
      setPlayerCard: 'citiesSpectatorSetPlayerCard', showTimesUp: 'citiesSpectatorShowTimesUp',
      showPregame: 'citiesSpectatorShowPregame', wrongEffect: 'citiesSpectatorWrongEffect',
      timesUpEffect: 'citiesSpectatorTimesUpEffect',
      showPostgame: 'citiesSpectatorShowPostgame', hidePostgame: 'citiesSpectatorHidePostgame',
    },
    monuments: {
      enter: 'monumentsSpectatorEnter', exit: 'monumentsSpectatorExit',
      showRound: 'monumentsSpectatorShowRound', resolvePick: 'monumentsSpectatorResolvePick',
      updateTimer: 'monumentsSpectatorUpdateTimer', updateScore: 'monumentsSpectatorUpdateScore',
      setPlayerCard: 'monumentsSpectatorSetPlayerCard', showTimesUp: 'monumentsSpectatorShowTimesUp',
      showPregame: 'monumentsSpectatorShowPregame', wrongEffect: 'monumentsSpectatorWrongEffect',
      timesUpEffect: 'monumentsSpectatorTimesUpEffect',
      showPostgame: 'monumentsSpectatorShowPostgame', hidePostgame: 'monumentsSpectatorHidePostgame',
    },
    // GlobeQuiz v1: no 3D globe — simple panel (guess list + timer).
    // Deliberately omits updateTimer/updateScore/wrongEffect/timesUpEffect/
    // showTimesUp — all the call-sites below already check
    // `typeof window[fns.x] === 'function'` before invoking, so a missing
    // key is a safe no-op. They don't apply here: no traditional numeric
    // score, no "wrong" that cuts a turn, no time limit. setPlayerCard DOES
    // apply (spectated friend's identity, no score/opponent).
    globequiz: {
      enter: 'globequizSpectatorEnter', exit: 'globequizSpectatorExit',
      showRound: 'globequizSpectatorShowRound', resolvePick: 'globequizSpectatorResolvePick',
      showPregame: 'globequizSpectatorShowPregame', showPostgame: 'globequizSpectatorShowPostgame',
      hidePostgame: 'globequizSpectatorHidePostgame',
      setPlayerCard: 'globequizSpectatorSetPlayerCard',
    },
  };

  function _label(val) {
    return (typeof tCountry === 'function') ? tCountry(val) : val;
  }

  // In versus, host AND guest broadcast their own rounds/answers/ticks to
  // the SAME channel — without filtering by role, the spectator's board
  // ended up showing a MIX of both players instead of only the friend being
  // spectated (the reported "it detects both users' result"). In solo mode
  // it doesn't apply (a single broadcaster, always passes).
  function _isFromFriendSide(role) {
    if (window.Spectate.isSolo()) return true;
    if (!role) return true; // shouldn't happen in versus, but don't block if missing
    return role === (_friendIsHost ? 'host' : 'guest');
  }

  // The score is already shown on the right-panel card (flagsSpectatorSetPlayerCard)
  // — the bar below (Fortnite style) is identity only, no numbers.
  function _updateMiniScores() {
    // The REAL spectated player's score (in versus it can be host or guest
    // depending on which side the friend is on; in solo it's always the sole
    // score).
    const friendScore = _friendIsHost ? _lastHost : _lastGuest;
    const fns = REAL_UI_MODES[_mode];
    if (fns && typeof window[fns.updateScore] === 'function') window[fns.updateScore](friendScore);
    // Versus: besides the friend, the OPPONENT's score is passed — before
    // only the friend was shown (already redundant with the main scoreboard
    // above), and the opponent appeared nowhere. Now both cells (friend +
    // opponent) update live, same as the real players see (each sees their
    // own scoreboard + the opponent's row in the leaderboard).
    const oppScore = window.Spectate.isSolo() ? null : (_friendIsHost ? _lastGuest : _lastHost);
    if (fns && typeof window[fns.setPlayerCard] === 'function') {
      window[fns.setPlayerCard](_friendName, _friendAvatar, friendScore, _oppName, _oppAvatar, oppScore, _friendCardCode, _oppCardCode);
    }
  }

  function _enterRealUIIfPossible(mode) {
    if (!mode) return;
    if (_usingRealUI && _activeRealUIMode === mode) return; // already mounted, nothing to do
    const fns = REAL_UI_MODES[mode];
    if (!fns || typeof window[fns.enter] !== 'function') return;
    // If we were coming from ANOTHER mode (campaign chaining
    // flags→shapes→etc.), it must be unmounted first — otherwise its
    // DOM/state stays stuck and mixes with the new mode's.
    if (_usingRealUI && _activeRealUIMode && _activeRealUIMode !== mode) {
      const prevFns = REAL_UI_MODES[_activeRealUIMode];
      // switchingMode=true: it's not a real spectator close, just unmounting
      // the previous mode to mount the new one on top — without this flag,
      // exit() turned off _isSpectating and showed the loading-screen
      // mid-transition between campaign modes.
      if (prevFns && typeof window[prevFns.exit] === 'function') window[prevFns.exit](true);
    }
    _usingRealUI = true;
    _activeRealUIMode = mode;
    screen.style.display = 'none';
    window[fns.enter]();
    miniNameEl.textContent = _friendName || 'Jugador';
    if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
    window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
    // _updateMiniScores() builds the fixed 2-row friend/opponent card
    // (flagsSpectatorSetPlayerCard) — meant only for 1v1/solo. In GROUP
    // mode that card ended up coexisting with the N rows
    // _renderGroupLeaderboard() builds in the SAME container
    // (#flags-leaderboard/#leaderboard) — the reported "the friend template
    // duplicates and stays there". Each path populates the leaderboard its
    // own way, never both.
    if (_groupMode) { _renderGroupLeaderboard(); } else { _updateMiniScores(); }
    miniHud.style.display = 'flex';
    // window[fns.enter]() already left window.pendingGameMode pointing at
    // the new mode — reapply the spectator badge HERE, not just wait for the
    // next presence 'sync' (which may never arrive on this mode change, if
    // nobody joined/left in the meantime) — without this, switching from
    // flags to shapes/cities could leave the OLD badge visible (the reported
    // "it duplicates": two eyes on screen at once).
    _applySpectatorBadge();
  }

  // switchingMode=true: we keep spectating (e.g. going to the next mode's
  // splash mirror), only the previous mode's DOM is unmounted — passes
  // straight to flagsSpectatorExit/shapesSpectatorExit(switchingMode), which
  // with that do NOT turn off _isSpectating or uncover the real
  // #loading-screen below (that only applies when the spectator actually
  // closes the session, see closeSpectator, which calls this WITHOUT the
  // flag).
  function _exitRealUI(switchingMode) {
    if (!_usingRealUI) return;
    // NOTE: uses _activeRealUIMode (what's MOUNTED), not _mode (which may
    // have already changed to a new mode whose enter() hasn't run) —
    // otherwise the WRONG mode's exit() was called.
    const fns = REAL_UI_MODES[_activeRealUIMode];
    if (fns && typeof window[fns.exit] === 'function') window[fns.exit](switchingMode);
    // switchingMode=true: we keep spectating (going to the campaign's next
    // mode's splash mirror) — the "SPECTATING"/name/counter badge must stay
    // there. This used to be turned off always, so it disappeared as soon as
    // the real player entered a new mode's instructions, and only reappeared
    // with the next real 'round'/'pregame' — a visible gap through the whole
    // splash. It's only actually turned off on closing the session
    // (switchingMode falsy, see closeSpectator).
    if (!switchingMode) miniHud.style.display = 'none';
    _usingRealUI = false;
    _activeRealUIMode = null;
  }

  function renderOptions(payload) {
    optionsEl.innerHTML = '';
    (payload.options || []).forEach((val) => {
      const box = document.createElement('div');
      box.className = 'spectator-option';
      if (_mode === 'flags' && typeof COUNTRY_FLAGS !== 'undefined' && COUNTRY_FLAGS[val]) {
        const img = document.createElement('img');
        img.src = COUNTRY_FLAGS[val];
        img.alt = '';
        box.appendChild(img);
      } else {
        const label = document.createElement('span');
        label.textContent = _label(val);
        box.appendChild(label);
      }
      optionsEl.appendChild(box);
    });
  }

  function highlightPick(payload) {
    const boxes = optionsEl.children;
    Array.prototype.forEach.call(boxes, b => b.classList.remove('picked-correct', 'picked-wrong'));
    const box = boxes[payload.index];
    if (box) box.classList.add(payload.correct ? 'picked-correct' : 'picked-wrong');
    if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined' && typeof sfxError !== 'undefined') {
      const sfx = payload.correct ? sfxCheck : sfxError;
      sfx.currentTime = 0; sfxPlay(sfx);
    }
  }

  const loadingTextEl = document.getElementById('spectator-loading-text');

  const CLOSE_TEARDOWN_DELAY_MS = 500;
  // When the close carries a reason (match cut short/player left), the
  // message is kept on screen longer than a normal close — there's something
  // to read.
  const CLOSE_MESSAGE_HOLD_MS = 1400;

  // silent=true: SYNCHRONOUS teardown with no loading screen or "return to
  // menu" — used by vs.js when A PLAYER (not an external spectator) finished
  // their own timer before the opponent and entered here on loan to watch
  // them live while waiting (see _enterWaitAsSpectator); when the opponent
  // also finishes, this player must not return to the menu like a real
  // spectator would — they go straight back to THEIR OWN result screen,
  // which vs.js shows as soon as this teardown finishes.
  function closeSpectator(message, silent) {
    if (_closing) return; // already closing — avoids a double teardown if called twice
    // MANUAL "return to menu" click (#ingame-power) while spectating the room
    // on loan (_groupInstant) — unlike a real external spectator, there's NO
    // "my own match" to return to here: the generic teardown below only
    // stops GroupSpectate and shows the menu, but leaves the own LB channel
    // (lobby.js) RELEASED forever (releaseChannel, see
    // _enterGroupWaitAsSpectator) — nobody reconnects it because
    // _exitGroupWaitAsSpectator() (the only one that calls
    // resubscribeChannel) never runs on this path. The player was left with
    // the "return to menu" icon having no real effect (the reported "stuck
    // forever in spectator mode") because, with no channel of their own,
    // they also never learn anything about the room again. The only real
    // exit here is to actually leave the room.
    if (!silent && _groupMode && _groupInstant && typeof window._lobbyAbandon === 'function') {
      _closing = true;
      if (window.GroupSpectate) window.GroupSpectate.stop();
      _hideGroupPovArrows();
      _hideGroupResultMirror();
      _groupMode = false;
      _groupInstant = false;
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      _exitRealUI();
      // _exitRealUI() only turns off the HUD if _usingRealUI was true — if
      // the spectated player was in pregame/splash (a real round UI was
      // never mounted), that function bails with an early return and this
      // line never runs, leaving "SPECTATING..." stuck even back in the
      // menu. It's turned off here too, unconditionally.
      if (miniHud) miniHud.style.display = 'none';
      _hideSplashMirror();
      screen.style.display = 'none';
      window._isSpectating = false;
      // _lobbyAbandon (lobby.js) does the real LB.leave() and returns to the
      // versus/lobby panel — unlike the generic teardown below, which would
      // only show the menu without actually leaving the room.
      window._lobbyAbandon();
      _closing = false;
      return;
    }
    _closing = true;
    if (silent) {
      clearTimeout(_idleWatchdogId);
      _idleShown = false;
      _lastSpectatorN = 0;
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      if (_groupMode) {
        // _exitGroupWaitAsSpectator (lobby.js) already stopped GroupSpectate
        // before calling here — this just cleans the visual/flags that were
        // missing on this path (the arrows/mirror/_groupMode used to stay
        // stuck).
        if (window.GroupSpectate) window.GroupSpectate.stop();
        _hideGroupPovArrows();
        _hideGroupResultMirror();
        _groupMode = false;
        _groupInstant = false;
      } else if (window.Spectate) {
        window.Spectate.stop();
      }
      _exitRealUI();
      if (miniHud) miniHud.style.display = 'none'; // see the long comment further down on the main path
      // The SILENT close (silent=true) is only used by vs.js
      // (_exitWaitAsSpectator/_onOpponentAbandoned) to take the player out of
      // "watching the opponent on loan" mode RIGHT before showing THEIR OWN
      // result screen (_showVsResult) — never to actually return to the
      // menu. flagsSpectatorExit()/etc. (called inside _exitRealUI()) still
      // reopens #loading-screen unconditionally when it's not a mode change
      // — without this re-hide, that player saw the main menu in the
      // background for an instant (the reported "it kicks me to the menu")
      // instead of being covered straight away by the result overlay that
      // arrives next.
      const ls = document.getElementById('loading-screen');
      if (ls) ls.style.display = 'none';
      _hideSplashMirror();
      screen.style.display = 'none';
      window._isSpectating = false;
      if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
      _closing = false;
      return;
    }
    // Stop the idle watchdog: if it kept running and fired _showIdleNotice()
    // after this close, it would reopen the loading screen with nothing to
    // hide it again — it stayed "stuck" there.
    clearTimeout(_idleWatchdogId);
    _idleShown = false;
    // This spectator is no longer watching ANYONE — the "how many are
    // watching me" icon shown to THEM (see _applySpectatorBadge, the same
    // screen the spectated player sees) makes no sense once the session
    // closes, and _applySpectatorBadge() isn't called again on its own until
    // the next event — without this it stayed stuck, visible even back in
    // the menu.
    _lastSpectatorN = 0;
    const vsBadge = document.getElementById('vs-spectator-badge');
    const flagsBadge = document.getElementById('flags-vs-spectator-badge');
    if (vsBadge) vsBadge.style.display = 'none';
    if (flagsBadge) flagsBadge.style.display = 'none';
    // Same reason — the duel result panel (versus) must not stay visible
    // once the session closes, nor keep blocking the real back button if
    // this tab later starts its OWN match.
    if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
    // The channel unsubscribes NOW, not in the setTimeout below (which only
    // delays the VISUAL teardown behind the loading screen) — before it kept
    // living through the whole teardownDelay (up to 1900ms), so a late
    // broadcast (round/pregame/tick already in flight) could still arrive
    // and fire _hideLoading(true) mid-window, making the loading screen
    // close itself as soon as its fade-in finished. The _wireCommonCallbacks
    // handlers also check _closing in case something was already in flight
    // at the same instant.
    if (_groupMode) {
      if (window.GroupSpectate) window.GroupSpectate.stop();
      _hideGroupPovArrows();
      _hideGroupResultMirror();
      _groupMode = false;
      _groupInstant = false;
      // In case the session closed right in the middle of a POV change (see
      // onPovChanged), with the small spinner still on screen.
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
    } else if (window.Spectate) {
      window.Spectate.stop();
    }
    // #ingame-power has z-index:1600, DELIBERATELY above #spectator-loading
    // (1500) — needed while actually spectating (e.g. the idle notice), to
    // be able to leave even if the notice covers the screen. But here a full
    // close is already decided (teardown in progress, see below) — leaving
    // it floating above the "the player stopped playing"/"returning to menu"
    // banner through the whole teardownDelay (up to 1900ms) looked like a
    // stuck/extra button over the loading screen. _isSpectating is only
    // turned off (and refreshIngamePower only called again) at the end of
    // the teardown, so it must be hidden by hand HERE, now, instead of
    // waiting for that.
    const powerEl = document.getElementById('ingame-power');
    if (powerEl) powerEl.style.display = 'none';
    // Same Clash Royale-style transition as on entry, also on exit — the
    // whole teardown happens BEHIND the loading screen instead of a hard cut
    // straight to the menu. If a reason is given (e.g. "the player stopped
    // playing"), that text is shown instead of the generic "returning".
    if (loadingTextEl) loadingTextEl.textContent = message || ((typeof t === 'function') ? t('spectator.returning') : 'Volviendo al menú...');
    _showLoading();
    // #spectator-loading takes 0.35s to fade in (see CSS .visible) — if the
    // real game unmounts at the same instant the fade is requested, you see
    // the "jump" of the match disappearing through the still-semi-transparent
    // overlay. It waits for it to be fully opaque before touching any game
    // DOM. With a reason, it also waits a bit longer so it can be read
    // before the teardown triggers the fade-out.
    const teardownDelay = CLOSE_TEARDOWN_DELAY_MS + (message ? CLOSE_MESSAGE_HOLD_MS : 0);
    setTimeout(() => {
      // Spectate.stop() already ran above, as soon as the close was decided
      // — here only the VISUAL teardown remains, deliberately delayed behind
      // the loading screen.
      _exitRealUI();
      // _exitRealUI() begins with "if (!_usingRealUI) return" — if the
      // spectated player was in pregame/splash when the session closed (a
      // real round UI was never mounted, _usingRealUI stayed false), that
      // function bails right there WITHOUT turning off miniHud (that line
      // lives inside, after the guard). The "SPECTATING..." badge stayed
      // stuck on screen even back in the main menu. It's turned off here
      // too, not depending on that guard.
      if (miniHud) miniHud.style.display = 'none';
      _hideSplashMirror();
      screen.style.display = 'none';
      // _exitRealUI() already turns this off as a side effect when a real
      // UI WAS mounted (via flagsSpectatorExit/shapesSpectatorExit) — but if
      // the close happened while only the splash mirror or the initial load
      // was showing (_usingRealUI never became true), that function does
      // nothing and this stayed on forever. Turning it off here too,
      // unconditionally, covers that case.
      window._isSpectating = false;
      if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
      if (typeof playMusic === 'function' && typeof sfxMenuMusic !== 'undefined') playMusic(sfxMenuMusic);
      // _hideLoading() computes its minimum wait (LOADING_MIN_MS) from
      // _loadingShownAt, set in the _showLoading() above — without this
      // reset, the delay here already ate almost that whole budget (550ms)
      // and the bar at 100% only showed a near-instant flash. Resetting it
      // here gives it the full 550ms starting from this point.
      _loadingShownAt = Date.now();
      _hideLoading();
    }, teardownDelay);
    setTimeout(() => { if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...'; }, teardownDelay + LOADING_MIN_MS + 400);
  }
  window.closeSpectator = closeSpectator;

  function _showEndMessage(text) {
    // Reuses the same close transition, with the reason as text — this used
    // to show the flat generic panel and ONLY THEN the close transition (two
    // different screens in a row); now it's one.
    closeSpectator(text);
  }

  // We don't show the "Connecting..." panel on its own — it starts COVERED
  // by the loading transition (_showLoading, called right after this) and is
  // only revealed once we know which view applies (real UI or fallback), so
  // no independent panel flickers before the fade.
  function _resetPanel(friend, title) {
    _closing = false;
    _lastRoundKey = null;
    _lastPregameKey = null;
    // openSpectatorGroup turns it on explicitly AFTER calling here — every
    // new session (1v1/solo/group) starts with no arrows until it's known
    // which of the three it is.
    _groupMode = false;
    _groupInstant = false;
    _hideGroupPovArrows();
    // If a real UI was already mounted (e.g. we were spectating ANOTHER
    // friend of this same match and this new session opened without waiting
    // for closeSpectator() to finish its async teardown) it must be ACTUALLY
    // unmounted here — this used to only do `_usingRealUI = false` by hand,
    // without calling flagsSpectatorExit/etc. or resetting _activeRealUIMode,
    // so the new session's _enterRealUIIfPossible() thought nothing was
    // mounted and called *SpectatorEnter() ON TOP of the previous friend's
    // still-live DOM/state — pending setTimeouts (flagsSpectatorResolvePick's
    // 600ms whoosh, the times-up, the running 3-2-1) survived the switch and
    // later overwrote the new session's transforms (the reported
    // "machine/findluggage desynced on POV change").
    _exitRealUI();
    _hideSplashMirror();
    _friendName   = friend && friend.name   ? friend.name   : '';
    _friendAvatar = friend && friend.avatar ? friend.avatar : '';
    _friendCardCode = (friend && friend.cardCode) || '0001';
    _friendFrameCode = (friend && friend.frameCode) || '0001';
    _friendIsHost = true;
    _lastHost = _lastGuest = 0;
    _oppName = null; _oppAvatar = null; _oppCardCode = '0001';
    _suppressGenericEnd = false;
    miniHud.style.display = 'none';
    // vs.js (_enterWaitAsSpectator) overwrites this text with "waiting for
    // the other players" when the watcher is THE PLAYER THEMSELVES waiting
    // for the opponent — it must be reset to the generic "SPECTATING" here,
    // on starting any NEW session (real friend), so it doesn't stay stuck
    // from a previous session.
    const tagEl = document.getElementById('spectator-mini-tag');
    if (tagEl) tagEl.textContent = (typeof t === 'function') ? t('spectator.watchingTag', 'ESPECTANDO') : 'ESPECTANDO';
    screen.style.display = 'none';
    screen.classList.remove('spectator-solo');
    titleEl.textContent  = title;
    statusEl.textContent = '';
    promptEl.textContent = '';
    optionsEl.innerHTML  = '';
    hostNameEl.textContent  = 'Host';
    guestNameEl.textContent = 'Guest';
    hostScoreEl.textContent  = '0';
    guestScoreEl.textContent = '0';
    hostPic.src  = 'images/profilepic/ppdefault.png';
    guestPic.src = 'images/profilepic/ppdefault.png';
    // Starts on the default frame — each side overwrites it with its own
    // (friend.frameCode / the opponent's, resolved via oppId below) as soon
    // as it's known who is who.
    if (window.CustomizeAssets) {
      window.CustomizeAssets.applyFrame(hostPicWrap, '0001');
      window.CustomizeAssets.applyFrame(guestPicWrap, '0001');
    }
  }

  function _wireCommonCallbacks() {
    window.Spectate.onRound(payload => {
      if (_closing) return; // see the long comment in closeSpectator
      // Versus: this round is the spectated friend's OPPONENT's, not theirs
      // — see _isFromFriendSide. The opponent keeps advancing rounds on
      // their own; the next one that IS the friend's arrives via their own
      // broadcast.
      if (!_isFromFriendSide(payload && payload.role)) return;
      // See the long comment in onTick below / _armGameEndFallback (vs.js) —
      // same "the opponent is genuinely still playing" signal.
      if (typeof window._vsSpectatorHeartbeat === 'function') window._vsSpectatorHeartbeat();
      _hideSplashMirror();
      _mode = payload.mode || _mode;
      _enterRealUIIfPossible(_mode);
      // Only now can _usingRealUI be true (the line above decides it) — if
      // called earlier, the watchdog never armed on the first round because
      // it still saw _usingRealUI as false.
      _resetIdleWatchdog();
      // Only now is there something real to show (before it could be the
      // player's pregame/3-2-1, no round yet) — this is when the loading
      // screen fades, not as soon as the channel connects. immediate=true
      // (like onPregame/onPostgame): the round content is ALREADY built in
      // the DOM at this point — the artificial minimum wait (LOADING_MIN_MS,
      // meant for transitions with no real content behind) only added up to
      // ~550ms+fade on top of something already ready to show (the reported
      // "it takes 1s to load").
      // Reset the text in case we came from onSplash (which overwrites it
      // with "about to start...") — without this, the NEXT time the overlay
      // shows for another reason (onAdvancing sets no text of its own) that
      // stale message showed.
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading(true);
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        // In case we came from a postgame (a previous campaign match) still
        // on screen — the new round already started, showing old results is
        // no longer right.
        if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
        // Same reason but for the versus result panel (see onPostgame below)
        // — cheap to call even if it wasn't showing (just touches
        // display:none).
        if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
        // Deduplicate: same identity as the last shown round = the same
        // 'round' arrived twice (live + resend). Rebuilding tags/suitcases/
        // board again replayed the entrance animation and sound — see the
        // long comment in _lastRoundKey. payload.index is included
        // (flags/shapes ALREADY send it; cities too) alongside
        // prompt/correctSlot/options because cities has none of those last
        // three — without index, ALL cities rounds would collide on the same
        // key and showRound() would never be called again after the first.
        const roundKey = payload.mode + '|' + payload.index + '|' + payload.prompt + '|' + payload.cityName + '|' + payload.correctSlot + '|' + JSON.stringify(payload.options || []);
        const isDuplicate = roundKey === _lastRoundKey;
        _lastRoundKey = roundKey;
        if (!isDuplicate && fns && typeof window[fns.showRound] === 'function') window[fns.showRound](payload);
        // The 'tick' broadcast is 1x/sec — without this the counter is blank
        // until the first tick arrives (up to 1s after entering). The round
        // already carries the timeLeft from the moment it started, so we
        // show it right away.
        if (typeof payload.timeLeft === 'number' && fns && typeof window[fns.updateTimer] === 'function') {
          window[fns.updateTimer](payload.timeLeft);
        }
        return;
      }
      screen.style.display = 'flex';
      statusEl.textContent = '';
      promptEl.textContent = _mode === 'flags' ? _label(payload.prompt) : '¿Cuál es este país?';
      renderOptions(payload);
    });
    window.Spectate.onAnswer(payload => {
      if (_closing) return;
      // Versus: this answer is the OPPONENT's, not the spectated friend's —
      // the board (picks/reveals) should only react to the friend's plays.
      // The opponent's score is updated separately anyway, via onScore
      // (postgres_changes/broadcast:score, which does carry both sides
      // correctly separated by column, not via this same payload).
      if (!_isFromFriendSide(payload && payload.role)) return;
      _resetIdleWatchdog();
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns && typeof window[fns.resolvePick] === 'function') window[fns.resolvePick](payload);
        // GlobeQuiz has no more rounds — payload.win=true is LITERALLY the
        // end of the friend's match (unlike any correct answer in
        // flags/shapes/cities/monuments, which just advances to the next
        // round), so here the session closes itself after 3s instead of
        // waiting for the friend, already back in the menu, to cut it
        // themselves (the reported "it doesn't disconnect on its own").
        // window._setPlaying(false) (see submitGuess in globequiz.js, 2s
        // after this same correct guess) also ends up disconnecting via the
        // generic presence path ("stopped playing") if it arrives first —
        // this timeout here is what guarantees the cut at a fixed,
        // predictable time (3s) without depending on the real propagation
        // latency, and with the right message ("finished the match", not the
        // generic abandonment one).
        if (_mode === 'globequiz' && payload && payload.win) {
          setTimeout(() => {
            if (_closing) return;
            const who = _friendName || ((typeof t === 'function') ? t('spectator.defaultPlayer') : 'El jugador');
            const msg = (typeof t === 'function') ? t('spectator.finished', { name: who }) : `¡${who} terminó la partida!`;
            _showEndMessage(msg);
          }, 3000);
        }
        return;
      }
      highlightPick(payload);
    });
    // "Missed" signal for the corresponding leaderboard row (friend or
    // opponent, depending on which side it came from) — same flash/emote
    // each real player sees on the OTHER's row when they miss. Nothing was
    // ever registered here before (defined in spectate.js but dead, same
    // pattern as _specReportAdvancing at the time).
    window.Spectate.onWrong(role => {
      if (_closing || !_usingRealUI || window.Spectate.isSolo()) return;
      const fns = REAL_UI_MODES[_mode];
      if (!fns || typeof window[fns.wrongEffect] !== 'function') return;
      window[fns.wrongEffect](_isFromFriendSide(role) ? 'friend' : 'opponent');
    });
    window.Spectate.onEnd(reason => {
      // See the long comment in _suppressGenericEnd — vs.js
      // (_enterWaitAsSpectator/_tryShowVsResultWhenBothDone) decides when and
      // how to exit this session when the "spectator" is the player
      // themselves; this generic handler (meant for an external friend)
      // stays out entirely in that case, whatever the reason.
      if (_suppressGenericEnd) return;
      clearTimeout(_idleWatchdogId);
      const who = _friendName || ((typeof t === 'function') ? t('spectator.defaultPlayer') : 'El jugador');
      const msg = (typeof t === 'function')
        ? t(reason === 'finished' ? 'spectator.finished' : 'spectator.left', { name: who })
        : (reason === 'finished' ? `¡${who} terminó la partida!` : `${who} dejó de jugar`);
      _showEndMessage(msg);
    });
    window.Spectate.onTick((timeLeft, role) => {
      if (_closing) return;
      if (!_isFromFriendSide(role)) return; // the opponent's clock isn't the one shown
      // See the long comment in _armGameEndFallback (vs.js): when the
      // "spectator" is THE PLAYER THEMSELVES watching their opponent on loan
      // (_enterWaitAsSpectator), this real tick is the signal the opponent
      // is genuinely still playing — it re-arms the 12s lifeline so it
      // doesn't fire just because the opponent still has match time left.
      // For an external spectator this is undefined (no-op).
      if (typeof window._vsSpectatorHeartbeat === 'function') window._vsSpectatorHeartbeat();
      _resetIdleWatchdog();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.updateTimer] === 'function') window[fns.updateTimer](timeLeft);
    });
    window.Spectate.onTimesUp(role => {
      if (_closing || !_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      // Effect (shake + timer) on the card of whoever ran out of time — for
      // BOTH sides (friend or opponent), like the 'wrong' flash.
      if (fns && typeof window[fns.timesUpEffect] === 'function') window[fns.timesUpEffect](_isFromFriendSide(role) ? 'friend' : 'opponent');
      // The big "TIME'S UP" overlay only when the FRIEND's round ends (which
      // is the match shown on screen).
      if (!_isFromFriendSide(role)) return;
      if (fns && typeof window[fns.showTimesUp] === 'function') window[fns.showTimesUp]();
    });
    // 3-2-1 countdown before the round starts — it can be the FIRST thing to
    // arrive if the spectator connects right as the player starts a new
    // match (no 'round' yet), so it also tries to enter the real UI here,
    // not just in onRound.
    window.Spectate.onPregame(payload => {
      if (_closing) return;
      // Like onRound: this 3-2-1 is the opponent's, not the spectated friend's.
      if (!_isFromFriendSide(payload && payload.role)) return;
      _hideSplashMirror();
      // CRITICAL: update _mode HERE, before _enterRealUIIfPossible — without
      // this _mode stayed stuck at whatever 'round' last left (the
      // PREVIOUS campaign mode, or the default 'flags' if this is the first
      // 'pregame' of the whole session), mounting the WRONG mode's UI
      // through the entire 3-2-1 — the reported "it shows flag assets in
      // Cities' 3-2-1". This used to "get away with it" for flags (first
      // campaign mode, matches the default) and for shapes (its 'round'
      // ALREADY arrives before its 'pregame' and updates _mode) — but Cities
      // has neither of those coincidences in its favor.
      _mode = (payload && payload.mode) || _mode;
      _enterRealUIIfPossible(_mode);
      // No _resetIdleWatchdog() (which re-arms the timer): pregame/postgame
      // are already a known and shown state — arming the watchdog here fired
      // the generic "they're elsewhere in the game" notice ON TOP of the
      // just-shown 3-2-1/results, pointless when we know exactly what's
      // going on. Only the pending one is cleared.
      _clearIdleWatchdog();
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading(true);
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      // Deduplicate like onRound: same startedAt = the same already-processed
      // 3-2-1 (live + resend) — calling showPregame() again recalculated a
      // larger elapsedMs the second time (more time passed) and the count
      // jumped to a more advanced number.
      const pregameKey = payload && payload.startedAt;
      const isDuplicatePregame = pregameKey != null && pregameKey === _lastPregameKey;
      _lastPregameKey = pregameKey != null ? pregameKey : _lastPregameKey;
      if (!isDuplicatePregame) {
        // Same sound the real player hears on clicking their own splash
        // step-2 confirm (starts the 3-2-1) — gated like showPregame() with
        // isDuplicatePregame so it isn't repeated on a resend of the same
        // already-seen pregame (joining mid-3-2-1).
        if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        if (fns && typeof window[fns.showPregame] === 'function') window[fns.showPregame](payload);
      }
    });
    // Already-known score (and dot streak, Cities/Monuments only) resent
    // ONLY to whoever joins mid-round already in progress (with no pregame in
    // between) — see SoloSpectate.reportScoreSync in _resendStateTo().
    // 'round' carries neither, so without this the scoreboard and dot streak
    // stayed at 0 until the real player's NEXT answer.
    window.Spectate.onScoreSync((score, dots) => {
      if (_closing || !_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.updateScore] === 'function') window[fns.updateScore](score, dots);
    });
    // How many spectators are watching (this one included) — same icon the
    // player sees of themselves. The value is always stored (even with
    // _closing/loading still covering) — _applySpectatorBadge() decides
    // whether to touch the DOM now or wait for the load to finish (see its
    // own comment).
    window.Spectate.onSpectatorCount(n => {
      _lastSpectatorN = n;
      _applySpectatorBadge();
    });
    // The spectated player's results screen — only makes sense if we were
    // already in some mode's real UI (if there was never a round, there are
    // no "results" to show coherently either).
    window.Spectate.onPostgame(payload => {
      if (_closing) return;
      // See the long comment in _suppressGenericEnd — when the "spectator"
      // is THE PLAYER THEMSELVES watching their opponent on loan
      // (_enterWaitAsSpectator in vs.js), this same 'postgame' broadcast (the
      // OPPONENT running THEIR OWN _showVsResult, which calls
      // VS.reportPostgame) also reaches this client over the still-open
      // Spectate.watch channel — without this guard, vsSpectatorShowResult()
      // was called (NEUTRAL panel, no "YOU LOST"/"YOU WON", with host/guest
      // names instead of "you"/opponent) overwriting the real result this
      // player's own _tryShowVsResultWhenBothDone/_showVsResult is about to
      // show (or already showed) on the SAME #vs-result-screen — the
      // reported "I lose the YOU LOST and the opponent's status".
      if (_suppressGenericEnd) return;
      _hideSplashMirror();
      _clearIdleWatchdog();
      _hideLoading(true);
      // Versus: 'postgame' here is the duel's FINAL result (see
      // VS.reportPostgame in vs.js, called from _showVsResult), not a
      // solo/campaign mode's results screen — payload carries host/guest
      // instead of correctCount/wrongCount, so it needs its own neutral
      // panel (who won the duel), not the per-mode dispatch.
      if (!window.Spectate.isSolo()) {
        if (typeof window.vsSpectatorShowResult === 'function') window.vsSpectatorShowResult(payload);
        return;
      }
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.showPostgame] === 'function') window[fns.showPostgame](payload);
    });
    // Only GlobeQuiz uses it (see reportGqGuesses in SoloSpectate) — the
    // FULL list of guesses already made, resent on joining mid-match (the
    // reported "the already-typed countries don't show"). Deliberately no
    // animation/sound (globequizSpectatorSyncGuesses, separate from
    // resolvePick which is the live route).
    window.Spectate.onGqGuesses(list => {
      if (_closing || _mode !== 'globequiz' || !_usingRealUI) return;
      if (typeof window.globequizSpectatorSyncGuesses === 'function') window.globequizSpectatorSyncGuesses(list);
    });
    // The real player confirmed leaving the postgame toward the campaign's
    // next mode — there's no new round/pregame yet (can take a while as they
    // navigate THEIR instructions splash) but showing the old postgame, as
    // if the player were still there, no longer makes sense. It's covered
    // with the same loading transition used on connect — it fades on its own
    // as soon as the next real round/pregame arrives ('immediate' in those
    // handlers).
    window.Spectate.onAdvancing(() => {
      if (_closing) return;
      _clearIdleWatchdog();
      // Same sound the real player hears on clicking their own postgame
      // confirm (gameover-confirm-wrap) — reportAdvancing() fires ONLY from
      // THAT click, never as a generic resend, so here it always corresponds
      // to a real transition, not someone catching up. Without this, every
      // screen change in spectator mode passed in silence — it felt "off"
      // compared to what the player hears.
      if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _hideSplashMirror();
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      }
      _showLoading();
    });
    // The FRIEND being spectated finished their timer and (if the opponent
    // is still playing) switches on loan to spectator mode OF THEIR OWN
    // OPPONENT (see _enterWaitAsSpectator in vs.js) — they stop generating
    // their own rounds/ticks. Without this, an EXTERNAL spectator watching
    // THEM was left with no new signal (the friend no longer plays, just
    // watches) until the idle watchdog ended up showing "the player is
    // elsewhere" — instead, here we simply follow them: we switch to showing
    // the OPPONENT (who's still playing) as the new "spectated person",
    // using the identity already resolved for them (_oppName/_oppAvatar).
    // Doesn't apply in solo mode (no opponent).
    //
    // NOTE: if _suppressGenericEnd is active, this same 'gameend' event is
    // ALREADY handled by vs.js (_enterWaitAsSpectator/_launchVersus
    // registered ITS OWN window.Spectate.onGameEnd BEFORE calling
    // openSpectator here) — that's the case where the "spectator" is the
    // player themselves waiting for the opponent to finish, not an external
    // spectator. If it were registered here anyway, this onGameEnd call
    // (which only stores ONE callback at a time) would overwrite that
    // registration and break the synced _revealAt mechanism. It's skipped
    // entirely in that case.
    if (!_suppressGenericEnd) {
      window.Spectate.onGameEnd(payload => {
        if (_closing || window.Spectate.isSolo()) return;
        if (!_isFromFriendSide(payload && payload.role)) return; // not the friend I'm watching, nothing to follow
        _friendIsHost = !_friendIsHost;
        const swapName = _oppName, swapAvatar = _oppAvatar;
        _oppName = _friendName || _oppName;
        _oppAvatar = _friendAvatar || _oppAvatar;
        _friendName = swapName || _friendName;
        _friendAvatar = swapAvatar || _friendAvatar;
        miniNameEl.textContent = _friendName || 'Jugador';
        if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
        window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
        _resetIdleWatchdog();
        if (_usingRealUI) _updateMiniScores();
      });
    }
    // The real player is on a mode's instructions screen (splash), not yet
    // confirmed — they can take as long as they want there. Unlike
    // onAdvancing (transient notice, only meaningful if someone was already
    // watching), this IS cached on the broadcaster side (reportSplash) and
    // so can be the first event a spectator joining right now receives. It
    // shows the REAL #splash-screen in read-only mode (see _showSplashMirror)
    // instead of just a "Loading..." banner — before this, a spectator
    // joining while the player was reading the instructions was left on the
    // "Connecting..." screen with no real content until the 3-2-1 started.
    window.Spectate.onSplash(payload => {
      if (_closing) return;
      _clearIdleWatchdog();
      // Same sound the real player hears on clicking the mode button
      // (starts a new mode) or their own splash step-1 confirm (advances to
      // instructions) — reportSplash() fires only from those two real
      // clicks (plus the resend to a fresh joiner, which is anyway the first
      // time THIS spectator sees that transition). Same reason as
      // onAdvancing: without this, silence.
      if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      // Unlike onAdvancing/onPregame/onPostgame (which just hide the old
      // postgame and leave the rest of the real UI mounted, covered by the
      // overlay), here it must be UNMOUNTED entirely: flags/shapes have
      // pieces with very high z-index (e.g. #flags-countdown-widget:1000) —
      // well above #splash-screen's z-index:100 — that would float ON TOP of
      // the instructions mirror if only covered by the overlay instead of
      // actually unmounted. switchingMode=true: we keep spectating.
      _exitRealUI(true);
      // Same reason as in onPregame: update _mode now, not just pass it as a
      // local parameter to _showSplashMirror — so any other code reading
      // _mode during this time (e.g. if a 'pregame' with a stale/duplicate
      // startedAt arrived before a real 'round') sees the right mode, not
      // the previous campaign's.
      _mode = (payload && payload.mode) || _mode;
      // Show the "SPECTATING"/name/counter badge here directly (not just let
      // _exitRealUI(true) NOT turn it off) — covers the case of a spectator
      // joining during the FIRST splash of the session, before ever entering
      // a real UI (_usingRealUI still false, _exitRealUI doesn't even run
      // because of the guard above).
      miniNameEl.textContent = _friendName || 'Jugador';
      if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
      window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
      miniHud.style.display = 'flex';
      _showSplashMirror(payload && payload.mode, payload && payload.step);
      // Same music that plays on the real instructions screen (see the
      // loading-flags-btn/loading-shapes-btn/etc. handlers, which start
      // sfxPregame there) — before, no music was touched here at all, and
      // the initial onSnapshot had already left sfxGameMusic (the GAME loop)
      // playing from the start, regardless of which screen the player was on.
      if (typeof playMusic === 'function' && typeof sfxPregame !== 'undefined') playMusic(sfxPregame);
    });
  }

  // matchId: `matches` row (Versus 1v1) to watch. friend: { id, name, avatar }
  // — the friend who opened the eye (to know which side of the scoreboard is
  // "them"). opts.instant (see _enterWaitAsSpectator in vs.js): the
  // "spectator" here is THE PLAYER THEMSELVES watching their opponent on
  // loan as soon as their timer finishes — for them there's NO new
  // connection to wait for, they were playing a second ago. Showing the
  // "Loading match..." screen as if just connecting felt like an extra
  // jump/cut — that overlay is skipped entirely, the game screen (the last
  // one seen, after their own TIME'S UP) stays as is until the opponent's
  // first real 'round'/'pregame' arrives and replaces it.
  window.openSpectator = function (matchId, friend, opts) {
    if (!window.Spectate) return;
    const instant = !!(opts && opts.instant);
    _resetPanel(friend, (typeof t === 'function')
      ? (friend && friend.name ? t('spectator.watchingFriend', { name: friend.name }) : t('spectator.watchingMatch'))
      : (friend && friend.name ? ('Mirando a ' + friend.name) : 'Mirando partida'));
    // See the long comment in _suppressGenericEnd — must go AFTER _resetPanel
    // (which sets it to false by default for every new session).
    _suppressGenericEnd = instant;
    // See the long comment in openSpectatorSolo — same fix here just in case
    // (versus resolves _enterRealUIIfPossible almost immediately in
    // onSnapshot, so the window without this was small, but there's no
    // reason to leave it).
    window._isSpectating = true;
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    // instant: the wait circle (#vs-wait-spinner) was already turned on by
    // _vsHandleGameEnd (vs.js) as soon as my own timer finished, BEFORE
    // reaching here — and flags.js/shapes.js turn it off on their own at the
    // same point where they reveal the opponent's real round. Nothing else
    // needs touching here, just avoiding the full-screen "Loading match..."
    // (it felt like a jump/reset — see the comment above).
    if (!instant) _showLoading();

    window.Spectate.onSnapshot(match => {
      _mode = match.mode || 'flags';
      _friendIsHost = !!(friend && friend.id === match.host_id);
      if (friend) {
        if (_friendIsHost) {
          hostNameEl.textContent = friend.name || 'Host';
          if (friend.avatar) hostPic.src = friend.avatar;
          window.CustomizeAssets?.applyFrame(hostPicWrap, friend.frameCode || '0001');
        } else {
          guestNameEl.textContent = friend.name || 'Guest';
          if (friend.avatar) guestPic.src = friend.avatar;
          window.CustomizeAssets?.applyFrame(guestPicWrap, friend.frameCode || '0001');
        }
      }
      _lastHost = match.host_score  || 0;
      _lastGuest = match.guest_score || 0;
      hostScoreEl.textContent  = _lastHost;
      guestScoreEl.textContent = _lastGuest;
      // Opponent identity — the match only carries host_id/guest_id (ids),
      // not name/photo (nor frame_code, see applyFrame below); without this
      // the spectator never knew who the other person was (see
      // citiesSpectatorSetPlayerCard etc., which now also show their row).
      // Resolved once per session.
      const oppId = _friendIsHost ? match.guest_id : match.host_id;
      if (oppId && window.sb) {
        window.sb.from('profiles').select('username, avatar_url, frame_code, card_code').eq('id', oppId).single()
          .then(({ data }) => {
            if (!data || _closing) return;
            const oppWrap = _friendIsHost ? guestPicWrap : hostPicWrap;
            window.CustomizeAssets?.applyFrame(oppWrap, data.frame_code || '0001');
            _oppName = data.username || 'Rival';
            _oppAvatar = data.avatar_url || null;
            _oppCardCode = data.card_code || '0001';
            if (_usingRealUI) _updateMiniScores();
          })
          .catch(() => {});
      }
      // Note: we do NOT hide the load here — the snapshot only confirms
      // we're connected, but the player may still be in pregame/3-2-1 with
      // no round yet. That's resolved in the first 'onRound'.
      // NOTE: we don't start music here either — the snapshot doesn't know
      // which real phase the player is in (splash/pregame/round), so always
      // starting sfxGameMusic right away sounded wrong (gameloop in the
      // background while the player was still on the instructions or the
      // 3-2-1). Each phase starts the music that fits it
      // (onSplash→pregameloop, onPregame→silence, onRound's reveal→gameloop).
      _enterRealUIIfPossible(_mode);
      if (_usingRealUI) _updateMiniScores();
      // SAVED live state (see _persistLiveState in vs.js) — before, the only
      // thing that existed was the opponent's LIVE resend on detecting my
      // presence join (with real network latency, on top of the
      // channel release/reconnect in _enterWaitAsSpectator) — now this same
      // snapshot (current phase + round/pregame/postgame) already came with
      // the match in this SINGLE REST query, so it can be applied NOW,
      // without waiting for anything real-time. The live resend still
      // arrives shortly after — redundant but harmless (same payload).
      const friendState = _friendIsHost ? match.host_state : match.guest_state;
      if (friendState && friendState.phase && _usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns) {
          if (friendState.round && typeof window[fns.showRound] === 'function') window[fns.showRound](friendState.round);
          if (friendState.phase === 'pregame' && friendState.pregame && typeof window[fns.showPregame] === 'function') window[fns.showPregame](friendState.pregame);
          if (friendState.phase === 'postgame' && friendState.postgame && typeof window[fns.showPostgame] === 'function') window[fns.showPostgame](friendState.postgame);
        }
      }
    });
    window.Spectate.onScore((h, g) => {
      _lastHost = h || 0; _lastGuest = g || 0;
      hostScoreEl.textContent  = _lastHost;
      guestScoreEl.textContent = _lastGuest;
      if (_usingRealUI) _updateMiniScores();
    });
    _wireCommonCallbacks();

    window.Spectate.watch(matchId, instant ? { suppressPresenceGone: true } : undefined).catch(() => {
      if (!instant) {
        _hideLoading();
        screen.style.display = 'flex';
        statusEl.textContent = (typeof t === 'function') ? t('spectator.failedToOpen') : 'No se pudo abrir la partida.';
        setTimeout(closeSpectator, 1500);
        return;
      }
      // instant (THE PLAYER THEMSELVES watching their opponent on loan, see
      // _enterWaitAsSpectator in vs.js): this used to swallow the error
      // silently and retry nothing — if Spectate.watch() failed from the
      // real Supabase race (two channels subscribed nearly at once to the
      // same 'match-{id}' topic, see releaseChannel), this player was left
      // with NO live data from the opponent (no tick, no real gameend) for
      // the WHOLE rest of the wait, blindly depending on vs.js's 12s
      // lifeline whatever happened — regardless of how much time the
      // opponent actually had left (the reported "it always kicks me at
      // 12s"). A short retry covers that case without risking anything if
      // there's really nothing to retry (match already closed, etc. — the
      // second attempt also fails silently, no infinite loop).
      setTimeout(() => {
        if (_closing) return;
        window.Spectate.watch(matchId, { suppressPresenceGone: true }).catch(() => {});
      }, 400);
    });
  };

  // userId: owner of a SOLO match (World Tour/solo mode, no `matches` row)
  // to watch. friend: { id, name, avatar }. Single-sided layout.
  window.openSpectatorSolo = function (userId, friend) {
    if (!window.Spectate) return;
    _resetPanel(friend, (typeof t === 'function')
      ? (friend && friend.name ? t('spectator.watchingFriend', { name: friend.name }) : t('spectator.watchingMatch'))
      : (friend && friend.name ? ('Mirando a ' + friend.name) : 'Mirando partida'));
    screen.classList.add('spectator-solo');
    hostNameEl.textContent = friend && friend.name ? friend.name : 'Jugador';
    if (friend && friend.avatar) hostPic.src = friend.avatar;
    window.CustomizeAssets?.applyFrame(hostPicWrap, (friend && friend.frameCode) || '0001');
    // This used to stay false until flagsSpectatorEnter/shapesSpectatorEnter
    // turned it on (only on mounting the real round) — if the spectated
    // player was on the instructions or the 3-2-1 for a while, the
    // #ingame-power icon kept showing "power" (quit of a nonexistent real
    // match) instead of "back" (leave spectating), leaving the spectator
    // with no way back to the menu all that time. It's turned on HERE, as
    // soon as the session opens — closeSpectator turns it back off.
    window._isSpectating = true;
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    _showLoading();

    window.Spectate.onSnapshot(() => {
      // Like in openSpectator: connected isn't the same as "there's something
      // to show" — they may be in splash/pregame. The load hides on the
      // first round. Don't start music here (see the long comment in
      // openSpectator) — each phase starts the one that fits it.
    });
    window.Spectate.onScore((s) => {
      _lastHost = s || 0;
      hostScoreEl.textContent = _lastHost;
      if (_usingRealUI) _updateMiniScores();
    });
    _wireCommonCallbacks();

    window.Spectate.watchSolo(userId).catch(() => {
      _hideLoading();
      screen.style.display = 'flex';
      statusEl.textContent = (typeof t === 'function') ? t('spectator.failedToOpen') : 'No se pudo abrir la partida.';
      setTimeout(closeSpectator, 1500);
    });
  };

  // ── GROUP SPECTATOR (lobby of up to 10) ────────────────────────────────────
  const groupPovPrevEl = document.getElementById('spectator-mini-pov-prev');
  const groupPovNextEl = document.getElementById('spectator-mini-pov-next');
  const groupMiniRowEl = document.getElementById('spectator-mini-row');
  function _hideGroupPovArrows() {
    if (groupPovPrevEl) { groupPovPrevEl.style.display = 'none'; groupPovPrevEl.classList.remove('disabled'); }
    if (groupPovNextEl) { groupPovNextEl.style.display = 'none'; groupPovNextEl.classList.remove('disabled'); }
    // .group-pov (see CSS) is what fixes the arrows by absolute position
    // instead of letting them flow in the flex — removing it here restores
    // the normal layout (no min width/extra padding) for 1v1/solo.
    if (groupMiniRowEl) groupMiniRowEl.classList.remove('group-pov');
    // Remove the small font-size _fitGroupPovName() may have left — 1v1/solo
    // have no width reserved by arrows, so the name returns to its normal
    // CSS size.
    if (miniNameEl) miniNameEl.style.fontSize = '';
  }
  function _showGroupPovArrows() {
    if (groupPovPrevEl) groupPovPrevEl.style.display = 'flex';
    if (groupPovNextEl) groupPovNextEl.style.display = 'flex';
    if (groupMiniRowEl) groupMiniRowEl.classList.add('group-pov');
  }
  // Updates the mini-HUD's name/avatar to the currently watched member —
  // switching POV (arrows) reuses the SAME channel (all members already
  // broadcast to the same 'lobby-{id}' topic), so nothing needs
  // reconnecting, just refreshing the displayed identity.
  function _applyGroupPovMember(member) {
    _friendName   = member && member.name   ? member.name   : '';
    _friendAvatar = member && member.avatar ? member.avatar : '';
    _friendFrameCode = (member && member.frameCode) || '0001';
    miniNameEl.textContent = _friendName || 'Jugador';
    if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
    window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
    _fitGroupPovName();
  }

  // Shrinks the name's font-size until it fits the width reserved between
  // the arrows (see .group-pov .spectator-mini-name in CSS) — before it was
  // cut with an ellipsis ("Nam...") so as not to overlap the arrows; now it
  // shows in FULL always, smaller if needed, instead of truncated. Same
  // mechanism flagsFlagidLabel (flags.js) already uses for long country
  // names in a fixed-width banner.
  //
  // Measured with canvas.measureText() instead of setting the style and
  // reading scrollWidth on each loop step: the latter forces a SYNCHRONOUS
  // DOM reflow per iteration (up to ~15 per POV change), and since it's
  // called on EVERY switchPov() with no debounce, spamming the arrows
  // blocked the main thread enough to delay the Supabase Realtime
  // WebSocket's heartbeat — the server ended up closing the connection over
  // it (the reported "constantly switching POV... kicks the spectator").
  // Measuring in a canvas is 100% in memory, without touching the layout
  // tree — the real DOM is only touched ONCE, at the end, with the
  // font-size already computed.
  let _measureCanvas = null;
  function _fitGroupPovName() {
    if (!miniNameEl || !_groupMode) return;
    const vminPx = Math.min(window.STAGE_W, window.STAGE_H) / 100;
    const maxW = 24 * vminPx; // same value as the max-width of .group-pov .spectator-mini-name
    const text = miniNameEl.textContent || '';
    if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
    const ctx = _measureCanvas.getContext('2d');
    const fontFamily = getComputedStyle(miniNameEl).fontFamily || 'sans-serif';
    let fs = 6.3; // base size, see .spectator-mini-name in CSS
    ctx.font = (fs * vminPx) + 'px ' + fontFamily;
    while (ctx.measureText(text).width > maxW && fs > 2.6) {
      fs -= 0.25;
      ctx.font = (fs * vminPx) + 'px ' + fontFamily;
    }
    miniNameEl.style.fontSize = fs + 'cqmin';
  }

  // Side card with ALL room members (not just the current POV) — same
  // request as "how it usually works in versus"
  // (flagsSpectatorSetPlayerCard/etc, but those only support 2 fixed
  // friend/opponent rows). Reuses the same CSS classes
  // .lb-entry/.lb-rank/.lb-avatar/.lb-name/.lb-score already styled (real
  // leaderboard + 1v1 card), building a row per member by hand instead of
  // calling *SpectatorSetPlayerCard (meant for exactly 2 fixed rows).
  // Everything in here is fragile DOM (geometry, ids, lists that may not be
  // as expected) — wrapped in try/catch so an exception here NEVER
  // propagates upward: this is called from inside Supabase Realtime
  // broadcast handlers (onRound/onScore/onPovChanged in _wireGroupCallbacks)
  // — an uncaught exception there could break the processing of further
  // channel events (the reported "it breaks... and stays frozen",
  // coinciding exactly with POV changes).
  function _renderGroupLeaderboard() {
    if (!_groupMode || !window.GroupSpectate) return;
    try { _renderGroupLeaderboardInner(); } catch (e) { console.warn('[spec] _renderGroupLeaderboard failed:', e); }
  }
  // Throttled (150ms) — unlike the fixed 1v1 card (2 rows, only updates
  // text/src of elements that ALREADY exist), here it walks querySelectorAll,
  // creates/deletes rows and reads offsetWidth (forces reflow) on EACH call
  // — called unthrottled from onScore (fires on EVERY answer of ANY member
  // still playing, several times a second near the end if the one still
  // playing answers fast) it blocked the main thread enough to delay the
  // WebSocket heartbeat and cut the connection — same mechanism as the POV
  // arrow spam bug, but triggered by ANOTHER player's activity instead of
  // one's own click (the reported "everything freezes, 2s before their own
  // times up" — coincides with when the one still playing answers more
  // often). onRound/onPregame/onPovChanged still call
  // _renderGroupLeaderboard() directly (unthrottled): they're much less
  // frequent and there it's best to show instantly.
  let _renderLbThrottleTimer = null;
  let _renderLbThrottlePending = false;
  function _scheduleRenderGroupLeaderboard() {
    if (_renderLbThrottleTimer) { _renderLbThrottlePending = true; return; }
    _renderGroupLeaderboard();
    _renderLbThrottleTimer = setTimeout(() => {
      _renderLbThrottleTimer = null;
      if (_renderLbThrottlePending) { _renderLbThrottlePending = false; _renderGroupLeaderboard(); }
    }, 150);
  }
  function _renderGroupLeaderboardInner() {
    const isFlags = _mode === 'flags';
    const lb = document.getElementById(isFlags ? 'flags-leaderboard' : 'leaderboard');
    if (!lb) return;
    const rowH = isFlags
      ? (typeof getFlagsLbRowHeight === 'function' ? getFlagsLbRowHeight() : 84)
      : (typeof getLbRowHeight === 'function' ? getLbRowHeight() : 60);
    const gap = isFlags
      ? (typeof FLAGS_LB_GAP !== 'undefined' ? FLAGS_LB_GAP : 4)
      : (typeof LB_GAP !== 'undefined' ? LB_GAP : 4);
    // Same reason as citiesSpectatorSetPlayerCard/etc: the leaderboard has
    // clip-path:inset(0 -300px) that clips the emote bubble if the top row
    // is at top:0.
    const TOP_MARGIN = Math.round(rowH * 0.4);
    const curId = window.GroupSpectate.getCurrentMember()?.id;
    const members = window.GroupSpectate.getMembers().slice()
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    lb.style.height = (members.length ? members.length * rowH + (members.length - 1) * gap + TOP_MARGIN : rowH + TOP_MARGIN) + 'px';

    const keepIds = new Set();
    members.forEach((m, i) => {
      const rowId = 'group-spec-lb-' + m.id;
      keepIds.add(rowId);
      let el = document.getElementById(rowId);
      if (!el) {
        el = document.createElement('div');
        el.className = 'lb-entry';
        el.id = rowId;
        el.innerHTML = `<span class="lb-rank"></span>`
          + `<div class="lb-avatar"><img class="lb-avatar-img"></div>`
          + `<span class="lb-name"></span>`
          + `<span class="lb-score"></span>`;
      }
      // CRITICAL: ensure the row is INSIDE the CURRENT mode's leaderboard.
      // getElementById searches the WHOLE document — if a previous match of
      // ANOTHER mode (e.g. flags → #flags-leaderboard) left the row there,
      // without this it updated in the OLD (hidden) leaderboard and the new
      // mode's stayed empty (the reported "in the 2nd match with other modes
      // no friend shows in the leaderboard"). appendChild MOVES it if it's
      // elsewhere (or adds it if it's new).
      if (el.parentNode !== lb) lb.appendChild(el);
      el.style.top = (TOP_MARGIN + i * (rowH + gap)) + 'px';
      el.classList.toggle('lb-group-pov', m.id === curId);
      const rankEl = el.querySelector('.lb-rank');
      if (rankEl) {
        rankEl.textContent = String(i + 1);
        rankEl.className   = 'lb-rank ' + (i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : 'rank-other');
        rankEl.style.display = 'block';
      }
      const avatarImg = el.querySelector('.lb-avatar-img');
      if (avatarImg) avatarImg.src = m.avatar || 'images/profilepic/ppdefault.png';
      const nameEl = el.querySelector('.lb-name');
      if (nameEl) nameEl.textContent = m.name || '?';
      const scoreEl = el.querySelector('.lb-score');
      if (scoreEl) scoreEl.textContent = (m.score || 0).toLocaleString();
      // Each member's real cardCode (see _fetchMembers above) — without
      // this, anyone spectating a group room from outside saw everyone's
      // default card, regardless of what each had equipped.
      window.CustomizeAssets?.applyCard(el, m.cardCode || '0001');
    });
    // Members no longer in the room (left mid-match).
    Array.from(lb.querySelectorAll('[id^="group-spec-lb-"]')).forEach(el => {
      if (!keepIds.has(el.id)) el.remove();
    });
  }

  // "Missed" flash on the row of WHOEVER it applies to in the side card —
  // same effect as *SpectatorWrongEffect (flags/shapes/cities/monuments),
  // but those target fixed ids (e.g. #flags-spec-lb-entry/-opp) that don't
  // exist here: the group row uses a per-member id (see
  // _renderGroupLeaderboard). It receives the uid of whoever missed (may not
  // be the current POV — see the long comment in GroupSpectate's 'wrong'
  // listener: the flash must show for ANY room member, not just while you're
  // watching them). Reuses the same CSS classes/animation
  // (lb-wrong-flash/lb-shake) and spawnEmoteBubble
  // (js/modes/mapgame-leaderboard.js, global).
  function _groupWrongEffect(uid) {
    if (!_groupMode || !uid) return;
    const el = document.getElementById('group-spec-lb-' + uid);
    if (!el) return;
    el.style.animation = 'none'; void el.offsetWidth;
    el.style.animation = 'lb-wrong-flash 0.75s ease-out, lb-shake 0.45s ease-in-out';
    setTimeout(() => { el.style.animation = ''; }, 820);
    const prevZ = el.style.zIndex;
    el.style.zIndex = '50';
    setTimeout(() => { el.style.zIndex = prevZ; }, 1800);
    if (typeof spawnEmoteBubble === 'function') spawnEmoteBubble(el);
  }

  // "Time ran out" on the card of the member it applies to — SAME mechanism
  // as _groupWrongEffect (shake + high z-index), but with the timer
  // (window._applyTimesUpEffect) instead of the "wrong" emote.
  function _groupTimesUpEffect(uid) {
    if (!_groupMode || !uid) return;
    const el = document.getElementById('group-spec-lb-' + uid);
    if (!el) return;
    const prevZ = el.style.zIndex;
    el.style.zIndex = '50';
    setTimeout(() => { el.style.zIndex = prevZ; }, 2600);
    if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
  }

  // Read-only mirror of the real GROUP ranking screens
  // (#lobby-intermediate-screen between modes, #lobby-result-screen when the
  // room ends entirely) — see LB.sendPostgame({kind:...}) added in
  // _presentIntermediateResult/_showLobbyResult (lobby.js). This didn't
  // exist before: on a mode transition the spectator was left with nothing
  // on screen through the whole real inter screen (the reported "nothing
  // shows"), because _specReportPostgame never fires for lobby matches
  // (flags/shapes/cities/monuments cut off BEFORE, see window._lobbyActive
  // in hideFlagsMode/etc, and go straight to _lobbyHandleGameEnd instead of
  // the individual postgame).
  function _showGroupResultMirror(payload) {
    const isFinal  = payload.kind === 'final';
    const members  = payload.members || [];
    // Hide the round countdown/timer + spectated game's scoreboard — for
    // BOTH panels. Before it was only done at the end, so in the
    // intermediate one the game's countdown stayed on top of the panel
    // (reported). Here the spectator's mini-HUD/arrows are NOT touched (only
    // shown once at the start, see openSpectatorGroup — if hidden they
    // wouldn't return in the next mode); the final one hides them separately
    // (session ending).
    _hideGameRoundHud();
    // Same sound the real players hear on this same panel (see
    // _presentIntermediateResult/_showLobbyResult in lobby.js) — nothing
    // played here.
    try { if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame); } catch (e) {}
    const medals   = ['🥇', '🥈', '🥉'];
    const rowsHtml = (m, i) => `<span class="lobby-result-pos">${medals[i] || (i + 1)}</span>`
      + `<img class="lobby-result-avatar" src="${m.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false">`
      + `<span class="lobby-result-name">${m.name || '?'}</span>`
      + `<span class="lobby-result-score">${(m.score || 0).toLocaleString()}</span>`;
    if (isFinal) {
      const screen = document.getElementById('lobby-result-screen');
      const list   = document.getElementById('lobby-result-list');
      const title  = document.getElementById('lobby-result-title');
      if (!screen || !list) return;
      const winner = members[0];
      if (title) {
        // Unlike the real player (who sees YOU WON/You placed #N based on
        // THEIR own place), there's no "me" here — same neutral criterion as
        // vsSpectatorShowResult (1v1): show who won, nothing more.
        title.textContent = winner
          ? ((typeof t === 'function') ? t('vs.result.spectatorWins', { name: winner.name }) : ('¡GANA ' + winner.name + '!'))
          : '';
        title.className = 'vs-result-title win';
      }
      list.innerHTML = '';
      members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'lobby-result-row';
        row.innerHTML = rowsHtml(m, i);
        list.appendChild(row);
      });
      // #lobby-result-back IS clickable here (unlike the intermediate
      // screen, which has no button of its own) — its handler in lobby.js
      // checks window._isSpectating and closes the spectator instead of
      // firing _returnFromLobbyResult() (real room reset), same pattern as
      // #vs-result-back in 1v1.
      screen.style.display = 'flex';
      // Hide the spectated game's HUD (timer/countdown, scoreboard,
      // spectator's mini-HUD) + refresh the power/back — the external
      // spectator (mirror) never unmounts the game UI, just overlays this
      // panel on top, so without this the countdown and the back that
      // replaces power stayed visible ON TOP of the final results table
      // (reported). refreshIngamePower already hides the back when
      // lobby-result-screen is visible, but it has to be CALLED.
      _hideSpectatorHudForResult();
    } else {
      const screen   = document.getElementById('lobby-intermediate-screen');
      const list     = document.getElementById('lobby-intermediate-list');
      const modeTag  = document.getElementById('lobby-intermediate-mode-tag');
      const nextEl   = document.getElementById('lobby-intermediate-next');
      const nextIcon = document.getElementById('lobby-intermediate-next-icon');
      const nextName = document.getElementById('lobby-intermediate-next-name');
      if (!screen || !list) return;
      if (modeTag) modeTag.textContent = (payload.modeLabel || '') + '  ·  ' + ((payload.currentModeIdx || 0) + 1) + '/' + (payload.totalModes || 1);
      if (payload.nextModeName) {
        if (nextEl) nextEl.style.display = 'flex';
        if (nextIcon) nextIcon.src = payload.nextModeIcon || 'images/game1.png';
        if (nextName) nextName.textContent = payload.nextModeName;
      } else if (nextEl) {
        nextEl.style.display = 'none';
      }
      list.innerHTML = '';
      members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'lobby-result-row';
        row.innerHTML = rowsHtml(m, i);
        list.appendChild(row);
      });
      // The spectator doesn't run lobby.js's real timer (that lives on the
      // player client) — before the number stayed FROZEN at 10 and the bar
      // full the whole time (reported). Run a DECORATIVE 10s countdown here
      // (same INTER_MS as _presentIntermediateResult) so it looks the same
      // as for the players; it closes the same way when the next mode's
      // pregame/round arrives (see _hideGroupResultMirror).
      _startMirrorInterCountdown();
      screen.style.pointerEvents = 'none';
      screen.style.display = 'flex';
    }
  }
  let _mirrorInterTimer = null;
  function _startMirrorInterCountdown() {
    clearInterval(_mirrorInterTimer);
    const bar  = document.getElementById('lobby-intermediate-bar');
    const cdEl = document.getElementById('lobby-intermediate-cd');
    const INTER_MS = 10000; // same as _presentIntermediateResult in lobby.js
    const start = Date.now();
    if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; }
    if (cdEl) cdEl.textContent = '10';
    requestAnimationFrame(() => { if (bar) { bar.style.transition = 'width ' + INTER_MS + 'ms linear'; bar.style.width = '0%'; } });
    _mirrorInterTimer = setInterval(() => {
      const remain = Math.ceil((INTER_MS - (Date.now() - start)) / 1000);
      if (cdEl) cdEl.textContent = Math.max(0, remain);
      if (remain <= 0) { clearInterval(_mirrorInterTimer); _mirrorInterTimer = null; }
    }, 200);
  }
  function _hideGroupResultMirror() {
    clearInterval(_mirrorInterTimer); _mirrorInterTimer = null;
    const s1 = document.getElementById('lobby-result-screen');
    const s2 = document.getElementById('lobby-intermediate-screen');
    if (s1) s1.style.display = 'none';
    if (s2) s2.style.display = 'none';
  }
  // Hides the spectated game's HUD when the FINAL results table appears —
  // the round's timer/countdown, the scoreboard and the spectator's mini-HUD
  // (name/POV/arrows) stayed visible on top of the panel. The back that
  // replaces power is hidden by refreshIngamePower (already blocks with
  // lobby-result-screen), but it has to be called.
  // Only the round's GAME HUD (countdown/timer + scoreboard) — used in BOTH
  // panels (intermediate and final), see _showGroupResultMirror. Does NOT
  // touch the spectator's mini-HUD/arrows (those are only shown once at the
  // start; if hidden they wouldn't return in the next mode).
  function _hideGameRoundHud() {
    ['countdown-widget','flags-countdown-widget','shapes-countdown-widget',
     'pregame-countdown','flags-pregame-countdown','score-display','flags-score-display']
      .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  }
  // Final (session ending): the game HUD + ALSO the spectator's
  // mini-HUD/arrows + the back that replaces power (via refreshIngamePower,
  // which already blocks with lobby-result-screen visible).
  function _hideSpectatorHudForResult() {
    _hideGameRoundHud();
    if (miniHud) miniHud.style.display = 'none';
    _hideGroupPovArrows();
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
  }

  function _wireGroupCallbacks() {
    // Channel dropped → do NOT show "Reconnecting..." instantly (annoying on
    // every blip). Only if the outage PERSISTS (>2s); a quick reconnect (the
    // norm, ~300-600ms) stays invisible, with the last frame frozen.
    window.GroupSpectate.onReconnecting(() => {
      clearTimeout(_reconnectNoticeTimer);
      _reconnectNoticeTimer = setTimeout(() => {
        if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function' && t('spectator.reconnecting') !== 'spectator.reconnecting') ? t('spectator.reconnecting') : 'Reconectando...';
        _idleShown = true; // evita que el watchdog pise el texto con "en otra parte"
        _showLoading();
      }, 2000);
    });
    window.GroupSpectate.onReconnected(() => {
      clearTimeout(_reconnectNoticeTimer); _reconnectNoticeTimer = null;
      // Don't hide blindly — the first real data (onRound/onTick) does it,
      // so there's no flash of an old board. Just reset the watchdog.
      _idleShown = false;
    });
    window.GroupSpectate.onMembers(() => {
      // Name/avatar may have changed (e.g. edited username) or someone left
      // the room — refresh the mini-HUD with the current POV.
      const cur = window.GroupSpectate.getCurrentMember();
      if (cur) _applyGroupPovMember(cur);
      _scheduleRenderGroupLeaderboard();
    });
    window.GroupSpectate.onScore(() => _scheduleRenderGroupLeaderboard());
    window.GroupSpectate.onWrong(uid => { if (_usingRealUI) _groupWrongEffect(uid); });
    window.GroupSpectate.onTimesUpAny(uid => { if (_usingRealUI) _groupTimesUpEffect(uid); });
    // The room emptied (all players left/disconnected) → take the spectator
    // out with the "room abandoned" screen, same as the player is kicked for
    // being alone. _showEndMessage closes the session showing the reason.
    // _closing guard in case it's already closing some other way.
    window.GroupSpectate.onRoomEmpty(() => {
      if (_closing) return;
      // _groupInstant = it's THE PLAYER THEMSELVES spectating on loan (not
      // an external spectator): they have THEIR OWN end flow
      // (_presentFinalResult/_exitGroupWaitAsSpectator in lobby.js) — the
      // "room empty" kick doesn't apply here, lobby.js handles it.
      if (_groupInstant) return;
      _showEndMessage((typeof t === 'function') ? t('spectator.roomEmpty') : 'La sala se vació');
    });
    window.GroupSpectate.onRound(payload => {
      if (_closing) return;
      // Heartbeat: each round of the member I'm watching on loan tells
      // lobby.js that player is STILL ALIVE, to reschedule its 12s lifeline
      // forward — without this, the lifeline (armed when I finished) fired
      // at 12s even if the one I watch had more time left, showing me the
      // result early (same bug 1v1 already fixed with _armGameEndFallback +
      // heartbeat, see vs.js).
      if (typeof window._groupSpectatorHeartbeat === 'function') window._groupSpectatorHeartbeat();
      _hideSplashMirror();
      _hideGroupResultMirror();
      _mode = payload.mode || _mode;
      _enterRealUIIfPossible(_mode);
      _resetIdleWatchdog();
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading(true);
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      // *SpectatorEnter() (called inside _enterRealUIIfPossible if the mode
      // just mounted) empties the leaderboard with innerHTML='' — it must be
      // repopulated with all members after that, not before.
      _renderGroupLeaderboard();
      // Same dedup as 1v1/solo — see _lastRoundKey there.
      const roundKey = payload.mode + '|' + payload.index + '|' + payload.prompt + '|' + payload.cityName + '|' + payload.correctSlot + '|' + JSON.stringify(payload.options || []);
      const isDuplicate = roundKey === _lastRoundKey;
      _lastRoundKey = roundKey;
      if (!isDuplicate && fns && typeof window[fns.showRound] === 'function') window[fns.showRound](payload);
      if (typeof payload.timeLeft === 'number' && fns && typeof window[fns.updateTimer] === 'function') window[fns.updateTimer](payload.timeLeft);
    });
    window.GroupSpectate.onAnswer(payload => {
      if (_closing) return;
      _resetIdleWatchdog();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.resolvePick] === 'function') window[fns.resolvePick](payload);
    });
    window.GroupSpectate.onTick(timeLeft => {
      if (_closing) return;
      // Heartbeat — see the long comment in onRound. The tick is the most
      // frequent "the player I watch is still alive" signal, so it's the one
      // that pushes the lifeline forward the most.
      if (typeof window._groupSpectatorHeartbeat === 'function') window._groupSpectatorHeartbeat();
      _resetIdleWatchdog();
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.updateTimer] === 'function') window[fns.updateTimer](timeLeft);
    });
    window.GroupSpectate.onTimesUp(() => {
      if (_closing || !_usingRealUI) return;
      // Stop (without re-arming) the idle watchdog here — after a TIMES UP
      // NO 'round'/'tick'/'answer' arrives until the room ranking (which
      // now, with the shared wall clock, can take well more than the
      // watchdog's 3.5s: the sync margin
      // plus, worst case, the 3s backup poll). Without this brake, the
      // watchdog fired on its own (same generic notice as "the spectated
      // player sends nothing") covering the screen with "they're elsewhere
      // in the game" while the synced result was awaited — the reported "it
      // thinks they're in another room".
      _clearIdleWatchdog();
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.showTimesUp] === 'function') window[fns.showTimesUp]();
    });
    window.GroupSpectate.onPregame(payload => {
      if (_closing) return;
      _hideSplashMirror();
      _hideGroupResultMirror();
      _mode = (payload && payload.mode) || _mode;
      _enterRealUIIfPossible(_mode);
      _clearIdleWatchdog();
      if (loadingTextEl) loadingTextEl.textContent = (typeof t === 'function') ? t('spectator.loading') : 'Cargando partida...';
      _hideLoading(true);
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      if (typeof window.vsSpectatorHideResult === 'function') window.vsSpectatorHideResult();
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      _renderGroupLeaderboard();
      const pregameKey = payload && payload.startedAt;
      const isDuplicatePregame = pregameKey != null && pregameKey === _lastPregameKey;
      _lastPregameKey = pregameKey != null ? pregameKey : _lastPregameKey;
      if (!isDuplicatePregame) {
        if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        if (fns && typeof window[fns.showPregame] === 'function') window[fns.showPregame](payload);
      }
    });
    window.GroupSpectate.onPostgame(payload => {
      if (_closing || !payload) return;
      _hideSplashMirror();
      _clearIdleWatchdog();
      _hideLoading(true);
      if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
      // kind:'intermediate'/'final' → real GROUP ranking (see
      // _showGroupResultMirror), NOT a mode's individual postgame — the
      // lobby flow (_lobbyHandleGameEnd in lobby.js) never fires THAT other
      // path for room matches.
      if (payload.kind === 'intermediate' || payload.kind === 'final') {
        // _groupInstant: THE PLAYER THEMSELVES watching their room mates on
        // loan (not a real external spectator) — while that lasts, their LB
        // (lobby.js) has the channel RELEASED (see releaseChannel in
        // _enterGroupWaitAsSpectator), so they NEVER learn on their own that
        // everyone finished (the 'finished' that would fire _checkAllFinished
        // doesn't reach a disconnected channel) — they depended ONLY on the
        // 30s lifeline (_waitingTimeout in lobby.js) to show their real
        // result, meanwhile seeing this same NEUTRAL mirror ("so-and-so
        // WINS") — the reported "they get USER WINS as spectators, their
        // real result takes 10-15s longer". Instead of showing the mirror
        // here, tell lobby.js to show ITS OWN personalized result NOW (YOU
        // WON/You placed #2), using the scores already in the payload.
        if (_groupInstant) {
          if (typeof window._lobbyReceiveGroupResult === 'function') window._lobbyReceiveGroupResult(payload);
          return;
        }
        // window._vsShowingResult=true → THE PLAYER THEMSELVES who
        // spectated on loan is already showing THEIR personalized result
        // (YOU WON/You placed #N, via _presentFinalResult/_showLobbyResult
        // in lobby.js). Their closeSpectator (called synchronously BEFORE
        // showing the table, see _exitGroupWaitAsSpectator) already reset
        // _groupInstant to false — so this same postgame, still arriving
        // over the channel a moment longer, landed here and covered their
        // real result with the NEUTRAL "so-and-so WINS" mirror (reported).
        // The real EXTERNAL spectator does have _vsShowingResult=false and
        // sees the mirror normally.
        if (window._vsShowingResult) return;
        _showGroupResultMirror(payload);
        return;
      }
      if (!_usingRealUI) return;
      const fns = REAL_UI_MODES[_mode];
      if (fns && typeof window[fns.showPostgame] === 'function') window[fns.showPostgame](payload);
    });
    window.GroupSpectate.onAdvancing(() => {
      if (_closing) return;
      _clearIdleWatchdog();
      if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _hideSplashMirror();
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns && typeof window[fns.hidePostgame] === 'function') window[fns.hidePostgame]();
      }
      _showLoading();
    });
    window.GroupSpectate.onSplash(payload => {
      if (_closing) return;
      _clearIdleWatchdog();
      if (typeof sfxPlay === 'function' && typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _exitRealUI(true);
      _mode = (payload && payload.mode) || _mode;
      miniNameEl.textContent = _friendName || 'Jugador';
      if (_friendAvatar) miniAvatarEl.src = _friendAvatar;
      window.CustomizeAssets?.applyFrame(miniAvatarWrap, _friendFrameCode);
      miniHud.style.display = 'flex';
      _showSplashMirror(payload && payload.mode, payload && payload.step);
      if (typeof playMusic === 'function' && typeof sfxPregame !== 'undefined') playMusic(sfxPregame);
    });
    window.GroupSpectate.onSpectatorCount(n => {
      _lastSpectatorN = n;
      _applySpectatorBadge();
    });
    // The arrows changed POV — same criterion as opening a new session on
    // the SAME member: clear the round/pregame dedup and show the loading
    // transition until that member's next real event arrives (there's no,
    // for now, per-member persisted "last known state" like VS/SoloSpectate
    // have via host_state/guest_state — so a POV change can take up to ~1s,
    // the next tick, to show real content).
    window.GroupSpectate.onPovChanged(() => {
      const newMember = window.GroupSpectate.getCurrentMember();
      _applyGroupPovMember(newMember);
      // Throttled — it used to be _renderGroupLeaderboard() directly on
      // EVERY POV change; switching POV fast and sustained for a while, each
      // change forced a full leaderboard render (reflow), and the saturated
      // main thread delayed the WebSocket heartbeat until the server cut the
      // connection (the reported "switching POVs kicks me after a while").
      // See _scheduleRenderGroupLeaderboard.
      _scheduleRenderGroupLeaderboard();
      // The BIG scoreboard (top, not the side card row) is separate from
      // _renderGroupLeaderboard — it only updates via
      // flagsSpectatorResolvePick when the watched person answers something
      // (ganswer). Without this, switching POV left the PREVIOUS person's
      // number stuck until the new one's NEXT answer (the reported "their
      // score doesn't update in real time on a POV change") — here it jumps
      // straight to the ALREADY-known value (see _scores in GroupSpectate,
      // fed by the usual 'lbscore').
      if (_usingRealUI) {
        const fns = REAL_UI_MODES[_mode];
        if (fns && newMember && typeof window[fns.updateScore] === 'function') {
          // dots: the dot streak — same reason as the score, cached in
          // GroupSpectate via ANY member's 'ganswer' broadcast (before it
          // only turned on/off when the current POV answered something).
          window[fns.updateScore](newMember.score || 0, window.GroupSpectate.getDots(newMember.id));
        }
      }
      _lastRoundKey = null;
      _lastPregameKey = null;
      // Switching POV with the arrows is NOT "reconnecting" (the channel is
      // already open, all members broadcast to the same topic) — the heavy
      // Clash Royale-style transition (_showLoading/_hideLoading, with its
      // ~550ms minimum + fade) felt like a full load when really you just
      // wait for the new person's next tick/round. It's replaced here by the
      // same small transparent spinner vs.js uses while waiting for the
      // opponent (#vs-wait-spinner) — the game screen stays visible in the
      // background, no black cover, and the spinner disappears on its own as
      // soon as the first real data arrives (see _hideVsWaitSpinner in
      // onRound/onPregame above).
      if (typeof window._showVsWaitSpinner === 'function') window._showVsWaitSpinner();
    });
  }

  // Exposed so cities/monuments (and any other module) can check "am I
  // spectating a GROUP right now?" and, if so, refresh MY card (not the 1v1
  // one) — see the call sites of window._isSpectating +
  // citiesSpectatorReposition() in js/modes/cities-spectate.js (score
  // animation render loop + resize/zoom). Before, those two sites ALWAYS
  // called the 1v1 reposition (which in group mode does nothing,
  // _citiesSpecLastCard is never set), so the N-row card was never
  // repositioned when the score went up or on zoom — it kept the old
  // positions (the reported "the friends strip position breaks").
  window._isGroupSpectating = () => _groupMode;
  // Throttled — called by the monuments/cities render loop (per frame while
  // the score animates) and by resize; unthrottled it saturated the thread
  // and cut the WebSocket (see _scheduleRenderGroupLeaderboard).
  window._refreshGroupSpectatorLeaderboard = () => { try { _scheduleRenderGroupLeaderboard(); } catch (e) {} };

  // lobbyId: `lobbies` row. initialMember: {id,name,avatar} — which member
  // to start the POV on (e.g. the one whose eye was clicked in the roster).
  // opts.instant (see openSpectator 1v1, same reason): THE PLAYER THEMSELVES
  // who finishes before the rest of the room enters here on loan (see
  // _enterGroupWaitAsSpectator in lobby.js) — there's no new connection to
  // wait for (they were playing), so the "Loading match..." screen is
  // skipped and it stays on the last thing seen until a room mate's first
  // real data arrives. opts.preFinishedUids is passed as-is to
  // GroupSpectate.watch().
  window.openSpectatorGroup = function (lobbyId, initialMember, opts) {
    if (!window.GroupSpectate) return;
    const instant = !!(opts && opts.instant);
    _resetPanel(initialMember, (typeof t === 'function')
      ? (initialMember && initialMember.name ? t('spectator.watchingFriend', { name: initialMember.name }) : t('spectator.watchingMatch'))
      : (initialMember && initialMember.name ? ('Mirando a ' + initialMember.name) : 'Mirando partida'));
    _groupMode = true;
    _groupInstant = instant;
    window._isSpectating = true;
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    if (!instant) _showLoading();
    // instant: same wait circle 1v1 uses (#vs-wait-spinner, see
    // _showVsWaitSpinner/_hideVsWaitSpinner in vs.js) instead of the
    // full-screen "Loading match..." banner (it felt like a jump/reset here
    // too) — flags.js/shapes.js turn it off on their own, unconditionally,
    // at the same point where they reveal the room mate's real round, so
    // turning it on here is enough.
    else if (typeof window._showVsWaitSpinner === 'function') window._showVsWaitSpinner();
    _wireGroupCallbacks();
    window.GroupSpectate.watch(lobbyId, initialMember && initialMember.id, opts).then(() => {
      if (!window.GroupSpectate.getMembers().length) throw new Error('empty_lobby');
      _showGroupPovArrows();
      _applyGroupPovMember(window.GroupSpectate.getCurrentMember());
      _renderGroupLeaderboard();
    }).catch((e) => {
      console.warn('[spec] openSpectatorGroup watch failed', e);
      if (instant) return; // see _enterGroupWaitAsSpectator: no error popup here, there was no "connection" to show as failed
      _hideLoading();
      screen.style.display = 'flex';
      statusEl.textContent = (typeof t === 'function') ? t('spectator.failedToOpen') : 'No se pudo abrir la partida.';
      setTimeout(closeSpectator, 1500);
    });
  };

  // Small cooldown between arrow clicks — without this, spamming the button
  // fired many switchPov()/channel.track() nearly overlapping at the same
  // instant; the state resend (_resendState) is already instant (comes from
  // local cache), so this is NOT "waiting for the server", it's braking the
  // spam itself — which also coincided with GroupSpectate's own channel
  // disconnecting (the reported "you spam the POV switch and it disconnects
  // you"). 200ms is plenty for the normal case (already-cached data); if
  // there happened to be nothing cached for the new POV, the small spinner
  // already wired in onPovChanged stays put until the next real data
  // anyway.
  // Raised from 200 to 350ms: "bored" arrow spam switched POV up to 5
  // times/sec, and that sustained rate of re-subscriptions/presence +
  // incoming broadcasts from all players seems to be what the Realtime
  // server cuts (CLOSED). At 350ms the rate drops to ~2.8/sec — quite a bit
  // less load — and the automatic reconnection covers the extreme case if
  // it drops anyway. 350ms still feels responsive for an intentional click.
  const GROUP_POV_COOLDOWN_MS = 350;
  let _groupPovCooldown = false;
  function _handleGroupPovClick(direction) {
    if (_groupPovCooldown) return;
    _groupPovCooldown = true;
    if (groupPovPrevEl) groupPovPrevEl.classList.add('disabled');
    if (groupPovNextEl) groupPovNextEl.classList.add('disabled');
    if (typeof sfxSelect !== 'undefined' && typeof sfxPlay === 'function') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
    window.GroupSpectate?.switchPov(direction);
    setTimeout(() => {
      _groupPovCooldown = false;
      if (groupPovPrevEl) groupPovPrevEl.classList.remove('disabled');
      if (groupPovNextEl) groupPovNextEl.classList.remove('disabled');
    }, GROUP_POV_COOLDOWN_MS);
  }
  groupPovPrevEl?.addEventListener('click', () => _handleGroupPovClick(-1));
  groupPovNextEl?.addEventListener('click', () => _handleGroupPovClick(1));

  // Close from the fallback panel (modes with no real screen yet). In real
  // UI (flags) the close goes through the back button that replaces power.
  closeBtn?.addEventListener('click', () => {
    if (typeof sfxSelect !== 'undefined' && typeof sfxPlay === 'function') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
    closeSpectator();
  });
})();
