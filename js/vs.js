// ── VERSUS MODE ───────────────────────────────────────────────────────────────
// Matchmaking, Realtime channel, and 1v1 match logic.
let _vsCurrentMode = 'flags';
function _startSeededRandom(seed, mode) {
  _vsCurrentMode = mode || 'flags';
  if (_vsCurrentMode === 'shapes') {
    if (typeof window.shapesSetSeed === 'function') window.shapesSetSeed(seed);
  } else if (_vsCurrentMode === 'cities') {
    window.citiesSetSeed?.(seed);
  } else if (_vsCurrentMode === 'monuments') {
    window.monumentsSetSeed?.(seed);
  } else if (_vsCurrentMode === 'globequiz') {
    window.globequizSetSeed?.(seed);
  } else {
    if (typeof window.flagsSetSeed === 'function') window.flagsSetSeed(seed);
  }
}
function _restoreRandom() {
  if (_vsCurrentMode === 'shapes') {
    if (typeof window.shapesClearSeed === 'function') window.shapesClearSeed();
  } else if (_vsCurrentMode === 'cities') {
    window.citiesClearSeed?.();
  } else if (_vsCurrentMode === 'monuments') {
    window.monumentsClearSeed?.();
  } else if (_vsCurrentMode === 'globequiz') {
    window.globequizClearSeed?.();
  } else {
    if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
  }
}

window.VS = (() => {
  let _matchId   = null;
  let _role      = null; // 'host' | 'guest'
  let _channel   = null;
  let _match     = null;
  let _onInvite  = null; // cb(match) — notify the guest of an incoming invite
  let _onInviteCancel = null; // cb(match) — host cancelled/expired the challenge
  let _onStart   = null; // cb(match) — both players start
  let _onScore   = null; // cb(hostScore, guestScore)
  let _onEnd     = null; // cb(winnerId)
  let _onOppLeft = null; // cb() — opponent disconnected/abandoned
  let _onWrong   = null; // cb() — opponent missed a question
  let _onGameEnd = null; // cb({role, score}) — opponent finished THEIR timer (see reportGameEnd)
  let _onAnswer  = null; // cb(detail) — own 'answer' broadcast (not the spectator one, see window._onVsAnswer). Only used by GlobeQuiz today.
  let _onReady   = null; // cb({role}) — opponent finished loading their heavy assets (see reportReady). Only used by GlobeQuiz today.
  let _onGqAbort = null; // cb() — GlobeQuiz: one side couldn't finish loading the 3D globe in time; both return to menu with NO winner or loss recorded (see _handleGqSyncFailed).
  let _onGqPhase = null; // cb({role, phase}) — GlobeQuiz: opponent load milestone ('start'|'assets'|'scene'), for the sync bar.
  // cb(status) — the Realtime channel NEVER got authorized (typically a
  // broken RLS policy on the server, see the sep-2026 one: an invalid cast
  // made ANY attempt to join 'match-{id}'/'solo-{id}' throw CHANNEL_ERROR).
  // This wasn't handled at all before: the .subscribe() below only reacted to
  // 'SUBSCRIBED', so a failure left _vsLaunching/_vsActive stuck true forever
  // (nothing went back to false) — the player was left with the game hung,
  // no error message, unable to start ANOTHER duel until manually reloading
  // the page, and the matches row stayed 'active' forever in the DB.
  // Registered ONCE at login (see "VERSUS UI" below), not per match.
  let _onSubscribeError = null;
  let _pollId    = null;
  let _started   = false; // prevents _onStart from firing more than once
  let _oppGoneTimer = null; // grace period before declaring abandonment by presence
  const OPP_GRACE_MS = 6000;
  // The opponent announced (broadcast 'gameend', see reportGameEnd) that they
  // finished THEIR timer and are about to release their channel to spectate
  // me on loan (_enterWaitAsSpectator) — that disconnect on their side is
  // EXPECTED, not an abandonment. Without this flag, the presence 'leave'
  // handler below can't tell "opponent closed the tab" from "opponent
  // switched channels to spectate me", and would start the abandonment
  // countdown anyway (the reported "still treats it as an abandonment", seen
  // from the side of whoever is still playing).
  let _oppFinishedGameEnd = false;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _myId() { return window._sbUserId || null; }

  async function _getMatch(id) {
    const { data, error } = await window.sb
      .from('matches').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  // Counts connected spectators (presence keys 'spectator-*') and exposes the
  // total for the eye icon + counter in the spectated player's HUD.
  function _updateSpectatorCount() {
    if (!_channel) return;
    try {
      const state = _channel.presenceState();
      const n = Object.keys(state).filter(k => k.indexOf('spectator-') === 0).length;
      window._vsSpectatorCount = n;
      if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(n);
    } catch (e) {}
  }

  // ── Realtime channel ───────────────────────────────────────────────────────

  function _subscribe(matchId) {
    if (_channel) _channel.unsubscribe();
    const uid = _myId();
    // NOT a private channel (was `private: true`). A private channel makes the
    // JOIN depend on the realtime socket already carrying a valid JWT and on a
    // `realtime.messages` RLS round-trip — for a client far from the realtime
    // region (Chile/Argentina → us-east-1) that join loses a race against the
    // auth token being set and silently never reaches 'joined' (no CHANNEL_ERROR
    // fires). The channel then falls back to REST for `.send()` (one-way: the
    // opponent receives, this client receives nothing), so GlobeQuiz's start
    // handshake hangs on one side while the other starts alone (reported: "only
    // I load"). The match id is an unguessable UUID and the `matches` row data
    // is still gated by table RLS on postgres_changes; only the ephemeral
    // broadcasts (live score/answers) become readable to someone who already
    // knows the UUID — an acceptable trade for a reliable join.
    _channel = window.sb
      .channel('match-' + matchId, { config: { presence: { key: uid || 'anon' } } })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: 'id=eq.' + matchId,
      }, payload => {
        const m = payload.new;
        _match = m;
        if (m.status === 'active' && _onStart && !_started) { _started = true; _onStart(m); }
        if (m.status === 'finished' && _onEnd)  _onEnd(m.winner_id);
        // Explicit opponent abandonment (wrote status=abandoned with winner=us)
        if (m.status === 'abandoned' && _onOppLeft) { clearTimeout(_oppGoneTimer); _onOppLeft(); }
        if (m.status === 'active' && _onScore) _onScore(m.host_score, m.guest_score);
        // Guest declined / not available → notify the host
        if ((m.status === 'declined' || m.status === 'expired') && _role === 'host' && !_started) {
          _hideOutgoingPopup();
          const T2 = (k, d) => (typeof t === 'function' ? t(k) : d);
          if (typeof window.showVersusToast === 'function') {
            window.showVersusToast(m.status === 'declined'
              ? T2('vs.guestUnavailable', 'No está disponible ahora')
              : T2('vs.inviteExpired',    'El reto expiró sin respuesta'));
          }
          cleanup();
        }
      })
      // Opponent's real-time score: immediate broadcast (doesn't wait for the postgres_changes WAL)
      .on('broadcast', { event: 'score' }, ({ payload }) => {
        if (!payload || !_match) return;
        if (_role === 'host') _match.guest_score = payload.score || 0;
        else                  _match.host_score  = payload.score || 0;
        if (_onScore) _onScore(_match.host_score, _match.guest_score);
      })
      // Opponent missed → visual cue on my screen
      .on('broadcast', { event: 'wrong' }, () => { if (_onWrong) _onWrong(); })
      // Opponent finished THEIR timer (see reportGameEnd/_vsHandleGameEnd) —
      // the "+5s" dot bonus runs independently on each player, so the two
      // clocks can desync: one can finish before the other. Without this
      // signal, the first to finish showed the result RIGHT AWAY (with the
      // opponent still playing their bonus seconds) — or worse, marked the
      // match 'finished' in the DB and cut those seconds off the opponent
      // abruptly (the reported "5 more seconds, but it ends in post"). Now
      // each side waits for BOTH to have announced they finished before
      // showing the result.
      .on('broadcast', { event: 'gameend' }, ({ payload }) => {
        if (!payload) return;
        _oppFinishedGameEnd = true;
        if (_onGameEnd) _onGameEnd(payload);
      })
      // Opponent's exact selection (index/chosen option) — consumed by
      // spectator mode to recreate the click in real time; doesn't affect the game.
      .on('broadcast', { event: 'answer' }, ({ payload }) => {
        if (window._onVsAnswer && payload) window._onVsAnswer(payload);
        if (_onAnswer && payload) _onAnswer(payload);
      })
      // Opponent finished loading their heavy assets (today only GlobeQuiz:
      // three.js + GeoJSON, see reportReady/_vsGqAwaitBothReady) — not
      // persisted to the matches row (it's ephemeral, like 'score'), no need:
      // this listener is registered BEFORE starting our own load (see
      // _launchVersus), so it arrives in time regardless of who loads first.
      .on('broadcast', { event: 'ready' }, ({ payload }) => {
        if (_onReady && payload) _onReady(payload);
      })
      // GlobeQuiz: opponent reports they COULDN'T finish loading the 3D globe
      // within the margin (three.js CDN hung, WebGL blocked, network down).
      // The mode is won by being first to guess right, so starting without
      // them would be unfair and would leave them frozen on the spinner —
      // the match is cancelled for both, no winner (see _handleGqSyncFailed).
      .on('broadcast', { event: 'gqabort' }, () => { if (_onGqAbort) _onGqAbort(); })
      // GlobeQuiz: opponent load milestone — feeds the sync bar.
      .on('broadcast', { event: 'gqphase' }, ({ payload }) => { if (_onGqPhase && payload) _onGqPhase(payload); })
      // Presence: detects tab close / connection loss of the opponent.
      .on('presence', { event: 'leave' }, ({ key }) => {
        // A spectator disconnecting (key 'spectator-{uid}', see
        // Spectate.watch()) shares this SAME channel — without this filter,
        // any spectator closing their session fired this same "leave" here,
        // and this code treated it as if the real OPPONENT had left: it
        // started the OPP_GRACE_MS countdown and ended up declaring a false
        // abandonment/win, cutting off a match that was actually still going
        // between the two real players (the reported "the spectator left and
        // the game ends").
        if (!key || key === uid || key.indexOf('spectator-') === 0) return;
        // See _oppFinishedGameEnd above: if the opponent already announced
        // they finished their timer, this disconnect is them releasing their
        // channel to spectate me on loan — not a real abandonment. Nothing to
        // declare here.
        if (_oppFinishedGameEnd) return;
        clearTimeout(_oppGoneTimer);
        // Permanent grey: show the disconnect visually right away
        if (typeof window.flagsSetVsDisconnected === 'function') window.flagsSetVsDisconnected(true);
        if (typeof window.shapesSetVsDisconnected === 'function') window.shapesSetVsDisconnected(true);
        if (typeof window.citiesSetVsDisconnected === 'function') window.citiesSetVsDisconnected(true);
        _oppGoneTimer = setTimeout(() => { if (_onOppLeft) _onOppLeft(); }, OPP_GRACE_MS);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (!key) return;
        if (key.indexOf('spectator-') === 0) {
          // Small delay: they just joined, give their own broadcast listeners
          // time to finish registering before resending. It was 150ms before
          // — their listeners (_wireCommonCallbacks) are registered BEFORE
          // even attempting the connection, so that margin was more than
          // needed; shrunk so _enterWaitAsSpectator (vs.js) doesn't feel this
          // delay on top of the others (release channel + reconnect) as
          // "takes forever" to show the opponent.
          setTimeout(_resendStateTo, 40);
          return;
        }
        if (key !== uid) clearTimeout(_oppGoneTimer); // opponent came back in time; grey stays permanent
      })
      // Spectator counter: 'sync' (not join/leave) because it's the only
      // event that guarantees presenceState() is already consistent — reading
      // it inside the 'leave' handler sometimes still included whoever left
      // (timing race), which is why the counter didn't drop when someone left.
      .on('presence', { event: 'sync' }, () => { _updateSpectatorCount(); })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try { await _channel.track({ uid: uid, t: Date.now() }); } catch (e) {}
          // Catch-up: if the opponent accepted while the subscription was
          // confirming, the realtime event already passed; check the current
          // state in the DB.
          if (_matchId && _onStart && !_started) {
            try {
              const m = await _getMatch(_matchId);
              if (m && m.status === 'active') { _match = m; _started = true; _onStart(m); }
            } catch (e) {}
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (_onSubscribeError) _onSubscribeError(status);
        }
      });
  }

  // ── Listen for incoming invites (guest) ────────────────────────────────────
  // Subscribes the user to changes on matches where they are guest and status=pending.

  let _inviteChannel = null;

  function listenForInvites(onInvite, onInviteCancel) {
    _onInvite = onInvite;
    _onInviteCancel = onInviteCancel || null;
    const uid = _myId();
    if (!uid) return;
    if (_inviteChannel) _inviteChannel.unsubscribe();
    _inviteChannel = window.sb
      .channel('invites-' + uid)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'matches',
        filter: 'guest_id=eq.' + uid,
      }, payload => {
        const m = payload.new;
        if (m.status === 'pending' && _onInvite) _onInvite(m);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matches',
        filter: 'guest_id=eq.' + uid,
      }, payload => {
        const m = payload.new;
        // Host cancelled/expired the challenge before I answered → dismiss the notif
        if ((m.status === 'expired' || m.status === 'declined' || m.status === 'cancelled') && _onInviteCancel) _onInviteCancel(m);
      })
      .subscribe();
  }

  function stopListeningForInvites() {
    if (_inviteChannel) { _inviteChannel.unsubscribe(); _inviteChannel = null; }
  }

  // ── Create invite (host) ───────────────────────────────────────────────────

  async function invite(guestId, mode = 'flags') {
    const uid = _myId();
    if (!uid) throw new Error('not logged in');
    const seed = Math.floor(Math.random() * 1_000_000);
    const { data, error } = await window.sb
      .from('matches')
      .insert({ host_id: uid, guest_id: guestId, seed, mode, status: 'pending' })
      .select().single();
    if (error) throw error;
    _matchId = data.id;
    _role    = 'host';
    _match   = data;
    _subscribe(_matchId);
    if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('sent', mode);
    // Auto-expire if the guest doesn't answer within 30s
    setTimeout(() => expire(), 30000);
    return data;
  }

  // ── Accept invite (guest) ──────────────────────────────────────────────────

  // started_at is written here for the record (analytics / DB debugging) but
  // is NOT used for start timing any more — comparing a guest-clock timestamp
  // against the host's Date.now() broke on clock skew. The actual start delay
  // is a fixed local wait on each side, see VS_START_DELAY_MS / the long
  // comment on _scheduleVersusStart.
  const START_DELAY_MS = 1500;

  async function accept(matchId) {
    try {
      _matchId = matchId;
      _role    = 'guest';
      _match   = await _getMatch(matchId);
      if (!_match || _match.status !== 'pending') throw new Error('match_not_available');
      _subscribe(matchId);
      const startedAt = new Date(Date.now() + START_DELAY_MS).toISOString();
      // Only updates if still pending; expired/cancelled returns 0 rows
      const { data: updated, error } = await window.sb
        .from('matches').update({ status: 'active', started_at: startedAt }).eq('id', matchId).eq('status', 'pending').select();
      if (error) throw error;
      if (!updated || !updated.length) throw new Error('match_not_available');
      _match = updated[0];
      if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('accepted', _match.mode);
    } catch (e) {
      if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('accept_failed');
      cleanup(); // clean up dirty state if it failed midway
      throw e;
    }
  }

  // ── Decline invite (guest) ─────────────────────────────────────────────────

  async function decline(matchId) {
    await window.sb.from('matches')
      .update({ status: 'declined' }).eq('id', matchId || _matchId);
    if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('declined');
    cleanup();
  }

  // ── Expire (host, no response) ─────────────────────────────────────────────

  async function expire() {
    if (!_matchId) return;
    const current = await _getMatch(_matchId);
    if (current.status === 'pending') {
      await window.sb.from('matches')
        .update({ status: 'expired' }).eq('id', _matchId);
      if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('expired', current.mode);
      cleanup();
    }
  }

  // ── Cancel the challenge (host, via the back button of the "waiting" popup) ─
  // Marks the match expired so the guest's notification gets dismissed.
  async function cancelInvite() {
    const id = _matchId;
    cleanup();
    if (id) { try { await window.sb.from('matches').update({ status: 'expired' }).eq('id', id); } catch (e) {} }
  }

  // ── Report score (both) ────────────────────────────────────────────────────
  // `detail` (optional) is this round's exact selection —
  // { index, pick, correct } — used only by spectator mode to recreate the
  // click in real time. Doesn't affect scoring and doesn't require the caller
  // to pass it (flags/shapes/monuments still work the same if omitted).

  async function reportScore(score, detail) {
    if (!_matchId || !_role) return;
    const scoreField = _role === 'host' ? 'host_score' : 'guest_score';
    const stateField = _role === 'host' ? 'host_state'  : 'guest_state';
    // Immediate broadcast so the opponent (and spectators) see the score
    // without waiting for the postgres_changes WAL. 'role' was missing here —
    // the spectator handler (Spectate.watch()) decides which field
    // (host_score/guest_score) to apply this score to by checking
    // payload.role; without it, NO branch ever matched and the fast
    // broadcast was mute (the score only updated when the slower
    // postgres_changes arrived, or the change wasn't noticed at all).
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'score', payload: { role: _role, score } }); } catch (e) {} }
    const update = { [scoreField]: score };
    if (detail) {
      update[stateField] = { ...detail, ts: Date.now() };
      if (_channel) { try { _channel.send({ type: 'broadcast', event: 'answer', payload: { role: _role, ...detail } }); } catch (e) {} }
    }
    await window.sb.from('matches').update(update).eq('id', _matchId);
  }

  function sendWrong() {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'wrong', payload: { role: _role } }); } catch (e) {} }
  }

  // Announces that THIS client finished loading its heavy assets and can
  // start (see _vsGqAwaitBothReady, "GlobeQuiz: instant win").
  function reportReady() {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'ready', payload: { role: _role } }); } catch (e) {} }
  }

  // GlobeQuiz: tells the opponent that THIS client failed to sync the 3D
  // globe load — both abandon the match with no result.
  function reportGqAbort() {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'gqabort', payload: { role: _role } }); } catch (e) {} }
  }

  // GlobeQuiz: own load milestone ('start'|'assets'|'scene') for the sync
  // bar the opponent sees.
  function reportGqPhase(phase) {
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'gqphase', payload: { role: _role, phase } }); } catch (e) {} }
  }

  // Closes the match row with no winner or loss (unlike abandon()/finish()):
  // the match never actually started because one side couldn't load.
  // Best-effort, only if still 'active'.
  async function cancelMatchNoResult() {
    const id = _matchId;
    if (!id) return;
    try { await window.sb.from('matches').update({ status: 'expired' }).eq('id', id).eq('status', 'active'); } catch (e) {}
  }

  // Releases THIS player's Realtime channel (without touching _matchId/_role
  // — reportScore/reportGameEnd/finish still write fine to the DB, only the
  // broadcast .send() goes mute, see the try/catch above) — used by
  // _enterWaitAsSpectator (vs.js, "VERSUS UI") when the player finishes
  // before the opponent and wants to watch them live on loan via
  // openSpectator: Supabase Realtime doesn't allow TWO channels subscribed
  // to the same topic 'match-{id}' from the same client (throws "cannot add
  // postgres_changes callbacks... after subscribe()" if attempted) — this
  // channel must be released so Spectate.watch()'s can take that same topic.
  // async + actually awaiting the unsubscribe: this used to be "fire and
  // forget" (awaited nothing), so Spectate.watch() could try to subscribe to
  // the SAME topic 'match-{id}' BEFORE the Realtime server finished
  // processing this channel leaving — the race depended on network timing,
  // so it sometimes worked (as in testing) and sometimes not (in real play,
  // with less incidental delay) — when it failed, Spectate.watch() threw the
  // same "cannot add postgres_changes callbacks... after subscribe()" error
  // already diagnosed, openSpectator(..., {instant:true}) swallowed it
  // silently without re-subscribing anything, and the player was left unable
  // to see their opponent — stuck until the 12s lifeline, which then showed
  // a result with incomplete data and sent them straight to the result
  // screen instead of letting them watch the opponent (the reported "it
  // kicks me straight to the menu").
  async function releaseChannel() {
    if (_channel) {
      const ch = _channel;
      _channel = null;
      try { await ch.unsubscribe(); } catch (e) {}
    }
  }

  // Announces that MY timer hit 0 — see the long comment on the .on(
  // 'broadcast', {event:'gameend'}...) above. Also persists it to
  // host_state/guest_state (same mechanism as reportScore with `detail`) so
  // someone arriving late (reconnect) can read it from the row instead of
  // relying only on the ephemeral broadcast.
  // revealAt (optional): wall clock at which EVERYONE (both players and any
  // spectator) must show the result — see the long comment in
  // _tryShowVsResultWhenBothDone (vs.js, "VERSUS UI"). Only sent by whoever
  // ALREADY KNOWS both finished at the moment of calling this function (the
  // second to finish, who learns the first had already announced as soon as
  // they call this) — the other side receives it right here, in the same
  // broadcast that confirms the opponent finished.
  function reportGameEnd(score, revealAt) {
    if (!_matchId || !_role) return;
    const payload = { role: _role, score };
    if (revealAt) payload.revealAt = revealAt;
    if (_channel) { try { _channel.send({ type: 'broadcast', event: 'gameend', payload }); } catch (e) {} }
    const stateField = _role === 'host' ? 'host_state' : 'guest_state';
    window.sb.from('matches').update({ [stateField]: { finished: true, score, ts: Date.now() } }).eq('id', _matchId).then(() => {}, () => {});
  }

  // ── Announce the start of a round (spectator mode only) ────────────────────
  // Not persisted to DB (it's ephemeral, like 'score'/'wrong') — the spectator
  // uses it to show the same options before the player answers.
  // The last round/tick broadcast is cached: if a spectator joins mid-round
  // (the player is already thinking, hasn't clicked anything yet) there's no
  // new 'round' event coming — without this cache they'd be stuck on the
  // loading screen until the NEXT round. On detecting a spectator 'join' the
  // last known round is resent.
  // _lastPhase is which of the three mutually exclusive states is current
  // right now (round in progress / 3-2-1 countdown / results) — a spectator
  // joining late needs to know WHICH of the three to resend, not just the
  // last round: if they join while the player is looking at their results
  // screen (which can last several seconds), they used to get nothing until
  // the NEXT round instead of seeing the current results right away.
  let _lastPhase         = null; // 'round' | 'pregame' | 'postgame'
  let _lastRoundPayload  = null;
  let _lastTick          = null;
  let _lastPregamePayload  = null;
  let _lastPostgamePayload = null;

  // Saves a full SNAPSHOT of the current state (phase + round + pregame +
  // postgame) into host_state/guest_state — this used to live ONLY in THIS
  // client's memory, and anyone wanting to see it (a new spectator) had to
  // wait for a presence "join" + a live resend from the opponent (with real
  // network latency, on top of releasing/reconnecting the own channel in
  // _enterWaitAsSpectator) — now anyone querying the match row (a single
  // REST call, no real-time waiting) can reconstruct the current state right
  // away. Also intended for the future POV carousel in group versus:
  // switching players there will need exactly this same mechanism.
  function _persistLiveState() {
    if (!_matchId || !_role) return;
    const stateField = _role === 'host' ? 'host_state' : 'guest_state';
    const snapshot = {
      phase: _lastPhase,
      round: _lastRoundPayload,
      pregame: _lastPregamePayload,
      postgame: _lastPostgamePayload,
      ts: Date.now(),
    };
    window.sb.from('matches').update({ [stateField]: snapshot }).eq('id', _matchId).then(() => {}, () => {});
  }

  function reportRound(payload) {
    if (!_channel || !_role) return;
    _lastPhase = 'round';
    _lastRoundPayload = payload;
    try { _channel.send({ type: 'broadcast', event: 'round', payload: { role: _role, ...payload } }); } catch (e) {}
    _persistLiveState();
  }

  // Time remaining (1x/sec) — only so spectator mode shows the same counter
  // the player sees; not persisted, ephemeral like 'score'.
  function reportTick(timeLeft) {
    if (!_channel || !_role) return;
    _lastTick = timeLeft;
    try { _channel.send({ type: 'broadcast', event: 'tick', payload: { role: _role, timeLeft } }); } catch (e) {}
  }

  // Resends ONLY the current phase to whoever just joined as a spectator (not
  // to the opponent, who is already synced by their own game).
  function _resendStateTo() {
    // 'round' is the only one carrying `mode` — the spectator side's
    // onPregame/onRound use `_mode` to decide which real UI to mount (flags
    // vs shapes), and that variable starts at 'flags' by default until a real
    // round arrives. If someone joins right during the 3-2-1 (or while
    // watching results) and only pregame/postgame was resent here without
    // that same question's round, `_mode` stayed wrong (at 'flags') until the
    // REAL round arrived seconds later — the player saw flag textures during
    // the entire shapes 3-2-1. _lastRoundPayload always corresponds to the
    // SAME question as the current pregame/postgame (cached just before, in
    // the same real broadcast), so resending it first is safe.
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
  }

  // This game round's time ran out (not the full versus match) — the
  // spectator shows the same "TIME'S UP" banner with its sound.
  function reportTimesUp() {
    if (!_channel || !_role) return;
    try { _channel.send({ type: 'broadcast', event: 'timesup', payload: { role: _role } }); } catch (e) {}
  }

  // 3-2-1 countdown before the round starts — the spectator plays the SAME
  // animation (runFlagsPregame) on their client; the payload only carries
  // the total duration (to show the right number from the start, before the
  // first 'tick' arrives).
  function reportPregame(payload) {
    if (!_channel || !_role) return;
    _lastPhase = 'pregame';
    _lastPregamePayload = payload || {};
    try { _channel.send({ type: 'broadcast', event: 'pregame', payload: { role: _role, ...(payload || {}) } }); } catch (e) {}
    _persistLiveState();
  }

  // Results screen — the duel's final W/L, called from _showVsResult() at
  // the moment each client decides its outcome locally (see there for the
  // host/guest payload detail).
  function reportPostgame(payload) {
    if (!_channel || !_role) return;
    _lastPhase = 'postgame';
    _lastPostgamePayload = payload;
    try { _channel.send({ type: 'broadcast', event: 'postgame', payload: { role: _role, ...payload } }); } catch (e) {}
    _persistLiveState();
  }

  // ── Finish match (host closes, decides winner) ─────────────────────────────

  async function finish() {
    if (!_matchId) return;
    const m = await _getMatch(_matchId);
    const winnerId = m.host_score >= m.guest_score ? m.host_id : m.guest_id;
    await window.sb.from('matches')
      .update({ status: 'finished', winner_id: winnerId }).eq('id', _matchId);
    if (window.Analytics && typeof window.Analytics.logVersus === 'function') {
      window.Analytics.logVersus(m.mode || null);
    }
  }

  // ── Abandon (I leave → the opponent wins) ──────────────────────────────────
  // best-effort: notifies the opponent via DB; channel presence covers it anyway.
  async function abandon() {
    if (!_matchId || !_role) { cleanup(); return; }
    const winnerId = _role === 'host' ? (_match && _match.guest_id) : (_match && _match.host_id);
    try {
      await window.sb.from('matches')
        .update({ status: 'abandoned', winner_id: winnerId || null }).eq('id', _matchId);
      if (window.Analytics && typeof window.Analytics.logVersusFunnel === 'function') window.Analytics.logVersusFunnel('abandoned', _match && _match.mode);
    } catch (e) {}
    cleanup();
  }

  // ── Clean up state ─────────────────────────────────────────────────────────

  function cleanup() {
    if (_channel) { _channel.unsubscribe(); _channel = null; }
    clearInterval(_pollId);
    clearTimeout(_oppGoneTimer);
    _oppFinishedGameEnd = false;
    _matchId = _role = _match = null;
    _onStart = _onScore = _onEnd = _onOppLeft = _onWrong = _onGameEnd = _onAnswer = _onReady = _onGqAbort = _onGqPhase = null;
    _started = false;
    _lastPhase = null;
    _lastRoundPayload = null;
    _lastTick = null;
    _lastPregamePayload = null;
    _lastPostgamePayload = null;
    _restoreRandom();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    invite,
    accept,
    decline,
    finish,
    abandon,
    cancelInvite,
    reportScore,
    sendWrong,
    reportReady,
    reportGqAbort,
    reportGqPhase,
    cancelMatchNoResult,
    reportGameEnd,
    releaseChannel,
    reportRound,
    reportTick,
    reportTimesUp,
    reportPregame,
    reportPostgame,
    listenForInvites,
    stopListeningForInvites,
    cleanup,
    onStart:   cb => {
      _onStart = cb;
      // invite() calls _subscribe() NON-blockingly (doesn't wait for the
      // channel to become 'SUBSCRIBED') and only AFTERWARD does the inviter
      // register this callback — with real network latency (e.g. opponent in
      // Chile accepting almost instantly), _subscribe()'s 'SUBSCRIBED'/catch-up
      // could arrive and find _onStart STILL null, losing the only real
      // notification that the duel started — the host never entered the match
      // while the guest (who starts via its own accept(), no Realtime
      // dependence) always worked (reported). Closes the other half of that
      // race: if the match is ALREADY active by the time this registers,
      // fire right away.
      if (_match && _match.status === 'active' && !_started) { _started = true; cb(_match); }
    },
    onScore:   cb => { _onScore = cb; },
    onEnd:     cb => { _onEnd = cb; },
    onOppLeft: cb => { _onOppLeft = cb; },
    onWrong:   cb => { _onWrong = cb; },
    onGameEnd: cb => { _onGameEnd = cb; },
    onAnswer:  cb => { _onAnswer = cb; },
    onReady:   cb => { _onReady = cb; },
    onGqAbort: cb => { _onGqAbort = cb; },
    onGqPhase: cb => { _onGqPhase = cb; },
    onSubscribeError: cb => { _onSubscribeError = cb; },
    getMatch: () => _match,
    getRole:  () => _role,
    getMatchId: () => _matchId,
    getSeed:  () => _match ? _match.seed : null,
    isHost:   () => _role === 'host',
  };
})();

// Eye icon + counter in the spectated player's HUD — updated both by vs.js
// (versus match) and by SoloSpectate (solo/World Tour match) whenever a
// spectator joins/leaves.
window.refreshVsSpectatorBadge = function (n) {
  const isFlags = window.pendingGameMode === 'flags';
  const badge   = document.getElementById(isFlags ? 'flags-vs-spectator-badge' : 'vs-spectator-badge');
  const countEl = document.getElementById(isFlags ? 'flags-vs-spectator-count' : 'vs-spectator-count');
  // The OTHER badge (the one for the mode no longer active) is always turned
  // off, explicitly — the campaign switches mode (flags→shapes→cities)
  // without this function necessarily being called again at that moment (it
  // only reacts to presence changes), so without this the OLD mode's badge
  // stayed visible forever if it had ever been shown — the player kept
  // seeing "you're being spectated" after switching mode, after leaving to
  // the menu (SoloSpectate.stop() calls here with n=0, but only turned off
  // the CURRENT mode's badge), and on the spectator reconnecting two badges
  // showed at once (one per mode).
  const otherBadge = document.getElementById(isFlags ? 'vs-spectator-badge' : 'flags-vs-spectator-badge');
  if (otherBadge) otherBadge.style.display = 'none';
  if (!badge) return;
  const show = n > 0 && window._isPlaying;
  badge.style.display = show ? 'flex' : 'none';
  if (countEl) countEl.textContent = n;
};

// Pupil (eye2.png) of the spectator icon: every so often it "looks" slightly
// right (transform, 0.1s) and comes back — random timing each cycle so it
// doesn't feel mechanical. Always runs in the background (the badges are
// display:none most of the time, so it costs nothing) — each instance
// (vs-spectator-badge/flags-vs-spectator-badge) has its own independent
// loop, not synced with each other.
(function spectatorEyeLook() {
  const pupils = document.querySelectorAll('.spectator-badge-eye-pupil');
  pupils.forEach(pupil => {
    const randMs = (min, max) => min + Math.random() * (max - min);
    function cycle() {
      setTimeout(() => {
        pupil.classList.add('looking-right');
        setTimeout(() => {
          pupil.classList.remove('looking-right');
          cycle();
        }, randMs(1500, 3000));
      }, randMs(1500, 3000));
    }
    cycle();
  });
})();

// Spectator icon blink: squashes the whole eye (container
// .spectator-badge-eye, eye1+eye2 together) for an instant and comes back —
// its own cycle, independent and not synced with spectatorEyeLook() above
// (a real eye doesn't look and blink at the same rhythm).
(function spectatorEyeBlink() {
  const eyes = document.querySelectorAll('.spectator-badge-eye');
  eyes.forEach(eye => {
    const randMs = (min, max) => min + Math.random() * (max - min);
    function cycle() {
      setTimeout(() => {
        eye.classList.add('blinking');
        setTimeout(() => {
          eye.classList.remove('blinking');
          cycle();
        }, 110);
      }, randMs(2000, 5000));
    }
    cycle();
  });
})();

// ── VERSUS UI ─────────────────────────────────────────────────────────────────

(function() {
  const TIMEOUT_MS = 30000;
  let _resultShown = false;    // prevents showing the result screen twice
  let _gqLoseHandled = false;  // GloboReto: prevents processing the opponent's win broadcast twice
  let _matchResultRecorded = false; // prevents counting the same match in vs_wins/vs_losses twice
  let _endedByAbandon = false; // the match ended by opponent abandonment
  // Waits for BOTH players to finish their own timer before showing the
  // result — see the long comment in _vsHandleGameEnd. The "+5s" bonus runs
  // independently on each client, so one can finish before the other.
  let _myGameEnded = false, _oppGameEnded = false;
  let _myFinalScoreCache = null, _oppFinalScoreCache = null;
  let _gameEndFallbackTimer = null;
  let _waitingAsSpectator = false; // see _enterWaitAsSpectator
  // Re-arms the 12s lifeline — see the long comment in _vsHandleGameEnd.
  // This used to be armed ONCE, fixed, counted from the moment I finished,
  // regardless of how much time the opponent actually had left — if the
  // opponent still had, say, 15s of match (chained +5s bonus streaks stretch
  // a round quite a bit), this lifeline fired at 12s anyway, showing MY
  // result with the opponent's score MID-play, still active — not lost/stuck
  // as intended (the reported "it kicks me to my result early, with the
  // opponent 1-2s from finishing"). Every REAL signal that the opponent is
  // still playing (a tick/round that did arrive, via Spectate while
  // _enterWaitAsSpectator watches them on loan) reschedules this same timer
  // 12s forward — so it only fires if the opponent truly went silent for
  // that long (network glitch/disconnect), not just because they had more
  // game time left than the original lifeline.
  function _armGameEndFallback() {
    clearTimeout(_gameEndFallbackTimer);
    _gameEndFallbackTimer = setTimeout(() => _tryShowVsResultWhenBothDone(true), 12000);
  }
  // Shared wall clock at which the result must be shown — see the long
  // comment in _tryShowVsResultWhenBothDone. Each client used to show the
  // result as soon as it FOUND OUT (locally) that both had finished, and
  // since that news reaches each side at a different moment (the second to
  // finish knows immediately; the first only when the second's broadcast
  // arrives, with network latency in between), the two result screens — and
  // the spectator's — appeared at different instants (the reported "the
  // 'I lost' screen came up before the other one").
  let _revealAt = null;
  let _revealTimer = null;
  const REVEAL_BUFFER_MS = 700;
  let _vsLaunching = false;    // prevents double launch of the versus match
  let _vsStartScheduled = false; // see _scheduleVersusStart — prevents scheduling the start setTimeout twice
  let _outTimer = null;
  let _inTimer  = null;
  let _pendingOppName   = null; // opponent name kept for both sides
  let _pendingOppAvatar = null;
  let _pendingOppFrameCode = null; // opponent's real frame, see _showDuelAcceptedPopup

  // ── Panel screen navigation ───────────────────────────────────────────────
  const T = (k, d) => (typeof t === 'function' ? t(k) : d);
  const VERSUS_SCREENS = ['root', 'amistoso', 'amigos', 'grupo', 'aleatorio', 'lobby'];
  const VERSUS_SUBTITLES = {
    root:      () => T('versus.subRoot', 'Elige un modo de versus'),
    amistoso:  () => T('versus.subFriendly', '¿Con quién querés jugar?'),
    amigos:    () => T('versus.subtitle', 'Reta a un amigo conectado'),
    grupo:     () => T('versus.subGroup', 'Sala privada de hasta 10 jugadores'),
    aleatorio: () => T('versus.subRandom', 'Únete a una sala pública'),
    lobby:     () => T('versus.subLobby', 'Sala de juego'),
  };
  // Navigation stack for the "back" button
  let _versusStack = ['root'];

  // Refresh subtitle when language changes (textContent is set via JS, not data-i18n)
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      const cur = _versusStack[_versusStack.length - 1];
      if (!cur) return;
      const sub = document.getElementById('versus-subtitle');
      if (sub) sub.textContent = (VERSUS_SUBTITLES[cur] || (() => ''))();
    });
  }

  function _showScreen(name) {
    VERSUS_SCREENS.forEach(s => {
      const el = document.getElementById('versus-screen-' + s);
      if (el) el.style.display = (s === name) ? 'flex' : 'none';
    });
    if (window.Lobby) {
      if (name === 'aleatorio') window.Lobby.startPublicRealtime?.();
      else                      window.Lobby.stopPublicRealtime?.();
    }
    const sub = document.getElementById('versus-subtitle');
    if (sub) sub.textContent = (VERSUS_SUBTITLES[name] || (() => ''))();
    // "Return to my room" button: visible if I have an active room and am not viewing it
    const ret = document.getElementById('versus-return-lobby');
    if (ret) ret.style.display = (name !== 'lobby' && window.LB && window.LB.getId()) ? 'flex' : 'none';
  }

  // Navigates to a screen and pushes it (for back). reset=true resets the stack.
  function versusGoTo(name, reset) {
    if (reset) _versusStack = ['root'];
    if (_versusStack[_versusStack.length - 1] !== name) _versusStack.push(name);
    _showScreen(name);
    if (name === 'amigos') {
      if (typeof loadFriends === 'function') loadFriends().then(_renderOnlineFriends).catch(_renderOnlineFriends);
      else _renderOnlineFriends();
    } else if (name === 'aleatorio') {
      if (window.Lobby && typeof window.Lobby.loadPublicList === 'function') window.Lobby.loadPublicList();
    }
  }
  window.versusGoTo = versusGoTo;

  function _versusBack() {
    // In the lobby, "back" leaves the SCREEN but does NOT leave the room: you can
    // come back with the "My room" button. To actually leave there's the "Exit" button.
    if (_versusStack[_versusStack.length - 1] === 'lobby') {
      _versusStack = ['root', 'amistoso'];
      _showScreen('amistoso');
      return;
    }
    _versusStack.pop();
    if (_versusStack.length === 0) { hideVersusPanel(); return; }
    _showScreen(_versusStack[_versusStack.length - 1]);
  }

  // ── Panel: Competitive Tour ───────────────────────────────────────────────

  function showVersusPanel() {
    const panel = document.getElementById('loading-versus-group');
    if (!panel) return;
    panel.classList.remove('table-gone');
    panel.classList.add('panel-visible');
    document.getElementById('loading-screen')?.classList.add('table-shown');
    versusGoTo('root', true);
  }

  function hideVersusPanel() {
    const panel = document.getElementById('loading-versus-group');
    if (!panel) return;
    panel.classList.remove('panel-visible');
    panel.classList.add('table-gone');
    document.getElementById('loading-screen')?.classList.remove('table-shown');
    _versusStack = ['root'];
    window.Lobby?.stopPublicRealtime?.();
  }

  // Toast stack reusable by lobby.js — max 6 messages, staggered opacity
  const _TOAST_MAX = 6;
  const _TOAST_DURATION = 2800;
  const _TOAST_DURATION_ERROR = 7000; // error toasts (with a code) linger so the code can be read
  let _toastEntries = [];

  function _updateToastOpacities() {
    const n = _toastEntries.length;
    _toastEntries.forEach((e, i) => { e.el.style.opacity = ((i + 1) / n).toFixed(4); });
  }

  // opts.code: shown on a second line as "Código: <code>" and makes the toast
  // an error toast (red-ish, stays up longer). opts.sticky: also uses the
  // long duration without a code.
  window.showVersusToast = function(msg, opts) {
    const stack = document.getElementById('versus-toast-stack');
    if (!stack) return;
    opts = opts || {};
    const item = document.createElement('div');
    item.className = 'versus-toast-item' + (opts.code ? ' versus-toast-error' : '');
    const msgEl = document.createElement('div');
    msgEl.className = 'versus-toast-msg';
    msgEl.textContent = msg;
    item.appendChild(msgEl);
    if (opts.code) {
      const codeEl = document.createElement('div');
      codeEl.className = 'versus-toast-code';
      codeEl.textContent = 'Código: ' + opts.code;
      item.appendChild(codeEl);
    }
    item.style.opacity = '0';
    stack.appendChild(item);
    const entry = { el: item, fadeTimer: null, removeTimer: null };
    _toastEntries.push(entry);
    // drop overflow from the top
    while (_toastEntries.length > _TOAST_MAX) {
      const old = _toastEntries.shift();
      clearTimeout(old.fadeTimer); clearTimeout(old.removeTimer);
      old.el.remove();
    }
    _updateToastOpacities();
    // auto-remove
    const dur = (opts.code || opts.sticky) ? _TOAST_DURATION_ERROR : _TOAST_DURATION;
    entry.fadeTimer = setTimeout(() => {
      item.style.opacity = '0';
      entry.removeTimer = setTimeout(() => {
        item.remove();
        _toastEntries = _toastEntries.filter(e => e !== entry);
        _updateToastOpacities();
      }, 320);
    }, dur);
  };

  // Generic modal confirmation (Yes/No)
  let _confirmYes = null;
  window.versusConfirm = function(msg, onYes) {
    const pop = document.getElementById('versus-confirm-popup');
    const m   = document.getElementById('versus-confirm-msg');
    if (!pop) { if (onYes) onYes(); return; }
    if (m) m.textContent = msg;
    _confirmYes = onYes || null;
    pop.style.display = 'flex';
  };
  function _hideConfirm() { const p = document.getElementById('versus-confirm-popup'); if (p) p.style.display = 'none'; _confirmYes = null; }

  // ── Mode selector popup wiring ────────────────────────────────────────────
  document.addEventListener('click', e => {
    const msel = document.getElementById('vs-mode-select-popup');
    if (!msel || msel.style.display === 'none') return;
    const guestId     = msel.dataset.guestId;
    const guestName   = msel.dataset.guestName;
    const guestAvatar = msel.dataset.guestAvatar;
    if (e.target.closest('#vs-mode-btn-flags')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'flags');
    } else if (e.target.closest('#vs-mode-btn-shapes')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'shapes');
    } else if (e.target.closest('#vs-mode-btn-cities')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'cities');
    } else if (e.target.closest('#vs-mode-btn-monuments')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'monuments');
    } else if (e.target.closest('#vs-mode-btn-globequiz')) {
      msel.style.display = 'none';
      _sendInvite(guestId, guestName, guestAvatar, 'globequiz');
    } else if (e.target.closest('#vs-mode-cancel')) {
      msel.style.display = 'none';
    }
  });

  function _setBtnLoading(btn, loading) {
    if (!btn) return;
    const titleEl = btn.querySelector('.versus-menu-title');
    if (loading) {
      btn.disabled = true;
      btn.style.opacity = '0.65';
      btn.style.cursor = 'not-allowed';
      btn._origTitle = titleEl ? titleEl.textContent : null;
      if (titleEl) titleEl.textContent = T('lobby.creating', 'Creando sala…');
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
      if (titleEl && btn._origTitle != null) titleEl.textContent = btn._origTitle;
      delete btn._origTitle;
    }
  }

  // Create room: if I already have an active one, ask for confirmation to leave it
  async function _doCreateRoom(isPublic, btn) {
    _setBtnLoading(btn, true);
    try {
      const _p = window.LB.create(isPublic);
      const result = typeof window.withConnTimeout === 'function' ? await window.withConnTimeout(_p, 6000) : await _p;
      if (result === undefined) return; // timeout: the connection-error bubble was already shown
      versusGoTo('lobby'); window.Lobby.enterLobby();
    }
    catch (e) { window.showVersusToast(T('lobby.createError', 'No se pudo crear la sala')); }
    finally { _setBtnLoading(btn, false); }
  }
  function _createRoomGuarded(isPublic, btn) {
    if (window.LB && window.LB.getId()) {
      window.versusConfirm(T('lobby.alreadyHave', 'Ya tenés una sala creada. ¿Abandonarla y crear una nueva?'), async () => {
        await window.LB.leave();
        _doCreateRoom(isPublic, null);
      });
    } else {
      _doCreateRoom(isPublic, btn);
    }
  }

  // Incremental diff (doesn't destroy/recreate everything each time, see the
  // long comment below in _renderOnlineFriends) — reuses a friend's existing
  // row if their "playing" state didn't change, only updating text/photo.
  // Recreating it from scratch reset the green-blink CSS animation from 0%
  // on every refresh (the reported "it cuts off abruptly and restarts" — the
  // list refreshes itself every few seconds via onFriendsUpdate/setInterval,
  // so the cut showed like a "heartbeat").
  function _buildFriendRow(f, playing, T) {
    const statusTxt = playing ? T('social.playing', 'Jugando') : T('versus.online', 'Conectado');
    const row = document.createElement('div');
    row.dataset.friendId = f.id;
    row.innerHTML =
      `<div class="versus-friend-avatar-wrap"><img class="versus-friend-avatar" src="${f.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false"></div>` +
      `<div class="versus-friend-info">` +
        `<span class="versus-friend-name">${f.name}</span>` +
        `<span class="versus-friend-status${playing ? ' playing' : ''}"><span class="versus-friend-dot${playing ? ' playing' : ''}"></span>${statusTxt}</span>` +
      `</div>` +
      `<button class="versus-challenge-btn${playing ? ' disabled' : ''}" ${playing ? 'disabled' : ''} data-id="${f.id}" data-name="${f.name}" data-avatar="${f.avatar || ''}">${playing ? T('social.playing', 'Jugando') : T('versus.challenge', 'Retar')}</button>`;
    row.querySelector('.versus-challenge-btn').addEventListener('click', function () {
      if (this.disabled) return;
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (window._lobbyCountingDown) {
        window.showGlobalToast?.(typeof t === 'function' ? t('lobby.cdBlocked') : 'The room is about to start — wait or cancel the countdown');
        return;
      }
      _showModeSelector(this.dataset.id, this.dataset.name, this.dataset.avatar);
    });
    _applyFriendRowCustomize(row, f, playing);
    return row;
  }
  function _applyFriendRowCustomize(row, f, playing) {
    row.className = 'versus-friend-row' + (playing ? ' playing' : '')
      + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(f.cellCode) ? ' cell-light-text' : '');
    // Real frame (pfp ring) + real background cell. applyCellForStatus (not
    // cellUrl directly) so that if they're playing and the cell has a -green
    // variant (see CUSTOMIZE_CELL_GREEN_VARIANTS in js/sb.js) it blinks the
    // same as in the social panel.
    window.CustomizeAssets?.applyFrame(row.querySelector('.versus-friend-avatar-wrap'), f.frameCode || '0001');
    window.CustomizeAssets?.applyCellForStatus(row, f.cellCode || '0001', playing ? 'playing' : 'online');
  }
  function _renderOnlineFriends() {
    const list    = document.getElementById('versus-friends-list');
    const emptyEl = document.getElementById('versus-empty-msg');
    if (!list) return;

    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const statusOf = f => (typeof getStatusObj === 'function')
      ? getStatusObj(f).cls
      : ((f.last_active && (Date.now() - new Date(f.last_active)) / 1000 < 120) ? (f.is_playing ? 'playing' : 'online') : 'offline');
    const online = friends.filter(f => statusOf(f) !== 'offline'); // online AND playing

    if (online.length === 0) {
      list.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const T = (k, d) => (typeof t === 'function' ? t(k) : d);
    const existingRows = new Map();
    list.querySelectorAll('.versus-friend-row[data-friend-id]').forEach(el => existingRows.set(el.dataset.friendId, el));

    let prevEl = null;
    online.forEach(f => {
      const playing = statusOf(f) === 'playing';
      let row = existingRows.get(String(f.id));
      if (row) {
        existingRows.delete(String(f.id));
        const wasPlaying = row.classList.contains('playing');
        // Name/photo/cell can change without the "playing" state changing
        // (e.g. equipped another cell) — always updated, but className/
        // animation is only touched if the state actually changed, so as not
        // to cut the running animation for nothing.
        const nameEl = row.querySelector('.versus-friend-name');
        if (nameEl && nameEl.textContent !== f.name) nameEl.textContent = f.name;
        const avatarEl = row.querySelector('.versus-friend-avatar');
        const newAvatar = f.avatar || 'images/profilepic/ppdefault.png';
        if (avatarEl && avatarEl.src !== newAvatar) avatarEl.src = newAvatar;
        if (wasPlaying !== playing) {
          // Real state transition (started or stopped playing) — here it IS
          // right to recreate the row (btn/text/classes really change), the
          // animation starts from scratch because it's a "new" row in that
          // state, not a refresh of the same.
          const fresh = _buildFriendRow(f, playing, T);
          list.replaceChild(fresh, row);
          row = fresh;
        } else {
          _applyFriendRowCustomize(row, f, playing);
        }
      } else {
        row = _buildFriendRow(f, playing, T);
        list.appendChild(row);
      }
      // Reorder without recreating: insertBefore of a node ALREADY IN THE DOM
      // doesn't reset its CSS animations (only recreating the node does).
      const wantedNext = prevEl ? prevEl.nextSibling : list.firstChild;
      if (wantedNext !== row) list.insertBefore(row, wantedNext);
      prevEl = row;
    });
    // Friends no longer online/existing — remove them.
    existingRows.forEach(el => el.remove());
  }

  // Live friend status in the 1v1 duel panel (same as the social panel)
  if (typeof onFriendsUpdate === 'function') {
    onFriendsUpdate(() => {
      const sc = document.getElementById('versus-screen-amigos');
      if (sc && sc.style.display !== 'none') _renderOnlineFriends();
    });
  }

  // The social poll only runs with the social panel open. Here we refresh
  // friends while the versus panel or the invite popup are open, so the
  // "Playing"/"Online" status updates live in competitive too.
  setInterval(() => {
    if (!window._accountLoggedIn || typeof loadFriends !== 'function') return;
    const panel = document.getElementById('loading-versus-group');
    const versusOpen = panel && !panel.classList.contains('table-gone');
    const inviteOpen = document.getElementById('lobby-invite-popup')?.style.display === 'flex';
    if (versusOpen || inviteOpen) loadFriends();
  }, 5000);

  // ── Mode selector ─────────────────────────────────────────────────────────

  function _showModeSelector(guestId, guestName, guestAvatar) {
    const pop = document.getElementById('vs-mode-select-popup');
    if (!pop) { _sendInvite(guestId, guestName, guestAvatar, 'flags'); return; }
    document.getElementById('vs-mode-sel-name').textContent = guestName;
    document.getElementById('vs-mode-sel-pic').src = guestAvatar || 'images/profilepic/ppdefault.png';
    // Invited friend's real frame — it always stayed at the default before.
    const guestFriend = (typeof getFriends === 'function') ? getFriends().find(f => f.id === guestId) : null;
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-mode-sel-pic-wrap'), guestFriend?.frameCode || '0001');
    pop.style.display = 'flex';
    pop.dataset.guestId     = guestId;
    pop.dataset.guestName   = guestName;
    pop.dataset.guestAvatar = guestAvatar || '';
  }

  // ── Outgoing invite (host) ────────────────────────────────────────────────

  async function _sendInvite(guestId, guestName, guestAvatar, mode) {
    mode = mode || 'flags';
    // GloboReto → begin the three.js download while we wait for the guest to
    // accept (see the preload note in _scheduleVersusStart).
    if (mode === 'globequiz' && typeof window.preloadGlobeQuiz === 'function') {
      try { window.preloadGlobeQuiz(); } catch (e) {}
    }
    const guestFriend = (typeof getFriends === 'function') ? getFriends().find(f => f.id === guestId) : null;
    _pendingOppName   = guestName;
    _pendingOppAvatar = guestAvatar;
    _pendingOppFrameCode = guestFriend?.frameCode || '0001';
    try {
      await window.VS.invite(guestId, mode);
    } catch(e) { console.warn('[VS] invite error:', e); return; }

    // Do NOT close the competitive panel: the "waiting" popup shows on top and
    // on cancel/expire you return to the friends panel, not panel 2.
    _showOutgoingPopup(guestName, guestAvatar, _pendingOppFrameCode);

    window.VS.onStart(match => {
      _hideOutgoingPopup();
      _scheduleVersusStart(match);
    });
  }

  function _showOutgoingPopup(name, avatar, frameCode) {
    const pop  = document.getElementById('vs-outgoing-popup');
    const bar  = document.getElementById('vs-out-bar');
    if (!pop) return;
    document.getElementById('vs-out-name').textContent = name;
    document.getElementById('vs-out-pic').src = avatar || 'images/profilepic/ppdefault.png';
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-out-pic-wrap'), frameCode || '0001');
    pop.style.display = 'flex';
    // Countdown bar
    bar.style.transition = 'none';
    bar.style.width = '100%';
    requestAnimationFrame(() => {
      bar.style.transition = `width ${TIMEOUT_MS}ms linear`;
      bar.style.width = '0%';
    });
    clearTimeout(_outTimer);
    _outTimer = setTimeout(() => { _hideOutgoingPopup(); }, TIMEOUT_MS);
  }

  function _hideOutgoingPopup() {
    const pop = document.getElementById('vs-outgoing-popup');
    if (pop) pop.style.display = 'none';
    clearTimeout(_outTimer);
  }

  // ── Incoming invite (guest) ───────────────────────────────────────────────

  function _showIncomingPopup(match) {
    // GloboReto invite → start the three.js download while the guest is still
    // deciding whether to accept (see the preload note in _scheduleVersusStart).
    if (match && match.mode === 'globequiz' && typeof window.preloadGlobeQuiz === 'function') {
      try { window.preloadGlobeQuiz(); } catch (e) {}
    }
    // Look up the host's data in the friends list
    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const host    = friends.find(f => f.id === match.host_id);
    const name    = host ? host.name   : 'Alguien';
    const avatar  = host ? host.avatar : 'images/profilepic/ppdefault.png';
    // Save for the versus leaderboard (the guest may not have the cache loaded)
    _pendingOppName   = name;
    _pendingOppAvatar = avatar;
    _pendingOppFrameCode = host?.frameCode || '0001';
    document.getElementById('vs-in-name').textContent = name;
    document.getElementById('vs-in-pic').src = avatar;
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-in-pic-wrap'), _pendingOppFrameCode);

    // Save to inbox so the user can recover the invite if they missed the banner
    if (typeof window.addVersusNotif === 'function') {
      window.addVersusNotif({ type: 'vs', id: match.id, matchId: match.id, fromName: name, fromAvatar: avatar, ts: Date.now() });
    }

    // 1v1 challenge → same NON-blocking notification as room invites
    if (typeof window.showInviteNotif === 'function') {
      window.showInviteNotif({
        persistent: true,
        name,
        sub: match.mode === 'shapes'    ? T('vs.challengedShapes',    'te retó a Map Mayhem 1v1')
           : match.mode === 'cities'    ? T('vs.challengedCities',    'te retó a City Blitz 1v1')
           : match.mode === 'monuments' ? T('vs.challengedMonuments', 'te retó a Landmark Loco 1v1')
           : match.mode === 'globequiz' ? T('vs.challengedGlobequiz', 'te retó a GloboReto 1v1')
           : T('vs.challengedYou', 'te retó a Suitcase Shuffle 1v1'),
        onAccept: async () => {
          if (typeof window.removeVersusNotif === 'function') window.removeVersusNotif(match.id);
          try {
            await window.VS.accept(match.id);
            const m = window.VS.getMatch();
            if (m) _scheduleVersusStart(m);
            else throw new Error('no match');
          } catch (e) {
            console.warn('[VS] accept error:', e);
            window.showVersusToast(T('lobby.joinFailed', 'No pudiste unirte, intentá de nuevo'));
          }
        },
        onDecline: () => {
          if (typeof window.removeVersusNotif === 'function') window.removeVersusNotif(match.id);
          window.VS.decline(match.id);
        },
      });
    }
  }

  function _hideIncomingPopup() {
    const pop = document.getElementById('vs-incoming-popup');
    if (pop) pop.style.display = 'none';
    clearTimeout(_inTimer);
  }

  // ── Button events ─────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const _sfx = () => { if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } };

    // Versus panel back (navigates back through the screen stack)
    document.getElementById('versus-back-wrap')?.addEventListener('click', () => {
      _sfx(); _versusBack();
    });

    // ── ROOT ──
    document.getElementById('versus-btn-amistoso')?.addEventListener('click', () => { _sfx(); versusGoTo('amistoso'); });
    // versus-btn-competitivo is disabled (coming soon)

    // ── AMISTOSO ──
    document.getElementById('versus-btn-amigos')?.addEventListener('click', () => { _sfx(); versusGoTo('amigos'); });
    document.getElementById('versus-btn-grupo')?.addEventListener('click', () => { _sfx(); versusGoTo('grupo'); });
    document.getElementById('versus-btn-aleatorio')?.addEventListener('click', () => { _sfx(); versusGoTo('aleatorio'); });

    // ── GRUPO ──
    document.getElementById('versus-btn-create-private')?.addEventListener('click', function() {
      _sfx(); _createRoomGuarded(true, this);
    });

    // Confirmation (Yes/No)
    document.getElementById('versus-confirm-yes')?.addEventListener('click', () => {
      _sfx(); const cb = _confirmYes; _hideConfirm(); if (cb) cb();
    });
    document.getElementById('versus-confirm-no')?.addEventListener('click', () => {
      _sfx(); _hideConfirm();
    });
    document.getElementById('versus-btn-join-code')?.addEventListener('click', async () => {
      _sfx();
      const code = (document.getElementById('versus-join-code')?.value || '').trim();
      if (!code) return;
      try {
        const _p = window.LB.joinByCode(code);
        const result = typeof window.withConnTimeout === 'function' ? await window.withConnTimeout(_p, 6000) : await _p;
        if (result === undefined) return; // timeout: the connection-error bubble was already shown
        versusGoTo('lobby'); window.Lobby.enterLobby();
      }
      catch (e) {
        const msg = (e && e.message === 'started') ? T('lobby.started', 'La partida ya empezó')
                  : (e && e.message === 'not_found') ? T('lobby.notFound', 'Sala no encontrada')
                  : T('lobby.joinError', 'No se pudo unir a la sala');
        window.showVersusToast(msg);
      }
    });

    // ── ALEATORIO ──
    document.getElementById('versus-btn-create-public')?.addEventListener('click', function() {
      _sfx(); _createRoomGuarded(true, this);
    });

    // Return to my room (when I navigated away from the lobby without leaving it)
    document.getElementById('versus-return-lobby')?.addEventListener('click', () => {
      _sfx();
      if (window.LB && window.LB.getId()) { versusGoTo('lobby'); window.Lobby.enterLobby(); }
    });

    // Cancel outgoing invite (notifies the guest so their notif gets dismissed)
    document.getElementById('vs-out-cancel')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.VS.cancelInvite();
      _hideOutgoingPopup();
    });

    // Accept invite
    document.getElementById('vs-in-accept')?.addEventListener('click', async () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const matchId = document.getElementById('vs-in-accept').dataset.matchId;
      _hideIncomingPopup();
      try {
        await window.VS.accept(matchId);
        // The guest starts directly with the already-known match data
        const match = window.VS.getMatch();
        if (match) _scheduleVersusStart(match);
        else throw new Error('no match');
      } catch(e) {
        console.warn('[VS] accept error:', e);
        if (typeof window.showVersusToast === 'function')
          window.showVersusToast(T('lobby.joinFailed', 'No pudiste unirte, intentá de nuevo'));
      }
    });

    // Decline invite
    document.getElementById('vs-in-decline')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const matchId = document.getElementById('vs-in-decline').dataset.matchId;
      window.VS.decline(matchId);
      _hideIncomingPopup();
    });

    // Return to menu from the versus result screen — same button reused for
    // the spectator (see vsSpectatorShowResult): if spectating, it closes
    // THAT session instead of _vsReturnToMenu() (which would finish/clean up
    // a REAL match this client doesn't have).
    document.getElementById('vs-result-back')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (window._isSpectating) {
        if (typeof window.closeSpectator === 'function') window.closeSpectator();
        return;
      }
      _vsReturnToMenu();
    });
  });

  // ── Opponent in the real flags leaderboard ─────────────────────────────────
  // No separate widget: the opponent enters as the single "friend row" in
  // the flags leaderboard, with their live score and the same overtake/emote
  // animation as the normal friends bar (see flags.js).

  function _setupVsOpponent(match) {
    const isHost   = window.VS.isHost();
    const oppId    = isHost ? match.guest_id : match.host_id;
    const friends  = (typeof getFriends === 'function') ? getFriends() : [];
    const opp      = friends.find(f => f.id === oppId);
    window._vsOpponent = {
      id:     oppId,
      name:   opp ? opp.name   : (_pendingOppName   || 'Rival'),
      avatar: opp ? opp.avatar : (_pendingOppAvatar || 'images/profilepic/ppdefault.png'),
      // Used by openSpectator (js/spectate.js) to apply their real frame
      // when spectating them from here (_armSpectatorFallback below) —
      // without this it always stayed at the default, regardless of what
      // they actually had equipped.
      frameCode: opp ? opp.frameCode : '0001',
      cardCode:  opp ? opp.cardCode  : '0001',
    };
    window._vsOppScore = 0;
  }

  function _teardownVsOpponent() {
    window._vsActive   = false;
    window._vsOpponent = null;
    window._vsOppScore = 0;
    _vsLaunching = false;
    window._vsSpectatorCount = 0;
    if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(0);
    _clearGqLoseAnim();
    _gqReadyReset();
    _hideGqSyncPanel();
  }

  // Called from flags.js/shapes.js when the player answers right/wrong.
  // `detail` (optional) = { index, pick } — this round's exact selection, so
  // spectator mode can recreate it in real time.
  window._vsReportAnswer = function(correct, score, detail) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportScore(score, detail ? { ...detail, correct } : undefined);
    if (!correct) window.VS.sendWrong();
  };

  // Called from flags.js/shapes.js when a new round starts (before the player
  // answers) — only so spectator mode can show the same options in real
  // time. `payload` = { index, country/label, correctSlot, options }.
  window._vsReportRound = function(payload) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportRound(payload);
  };

  // Called 1x/sec from startFlagsTimer() with the real time remaining, so
  // spectator mode shows the same counter as the player.
  window._vsReportTick = function(timeLeft) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportTick(timeLeft);
  };

  window._vsReportTimesUp = function() {
    if (!window.VS.getMatchId()) return;
    window.VS.reportTimesUp();
  };

  window._vsReportPregame = function(payload) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportPregame(payload);
  };

  window._vsReportPostgame = function(payload) {
    if (!window.VS.getMatchId()) return;
    window.VS.reportPostgame(payload);
  };

  // See the long comment on #vs-wait-spinner (css/style.css) — covers the
  // network gap between "I finished, already cleaned my assets" and "the
  // opponent's data arrived". _showVsWaitSpinner is called as soon as we
  // decide to wait; _hideVsWaitSpinner runs from flags.js/shapes.js at the
  // same point where real content is revealed (flagsSpectatorShowRound/
  // _flagsSpecRevealAfterPregame and equivalents), and as a lifeline right
  // here when showing the result or leaving the wait due to abandonment.
  window._showVsWaitSpinner = function () {
    const el = document.getElementById('vs-wait-spinner');
    if (el) el.style.display = 'flex';
  };
  window._hideVsWaitSpinner = function () {
    const el = document.getElementById('vs-wait-spinner');
    if (el) el.style.display = 'none';
  };

  // ── Match end → W/L result screen ─────────────────────────────────────────
  // Called from flags.js (hideFlagsMode) when time runs out in versus.
  // The "+5s" dot bonus runs independently on each client (depends on HOW
  // MANY consecutive correct answers each had), so the two clocks can desync
  // — whoever finishes first NO LONGER shows the result right away: it
  // announces it finished and WAITS for the opponent to announce too (see
  // window.VS.onGameEnd above, in _launchVersus). This used to show the
  // result immediately (with the opponent still playing their bonus) and on
  // top of that marked the match 'finished' as soon as someone decided their
  // result — cutting those extra seconds off the opponent abruptly (the
  // reported "5 more seconds, but it ends in post").
  window._vsHandleGameEnd = function(myFinalScore) {
    if (_resultShown) return;
    _myGameEnded = true;
    _myFinalScoreCache = myFinalScore;
    // NOTE: this used to call _flagsCleanupVisuals()/_shapesCleanupVisuals()
    // to wipe my own assets (machine/suitcases/board) as soon as my timer
    // ends, meant for the transition into _enterWaitAsSpectator() — but it
    // ran WHENEVER `!_oppGameEnded` at this point, even on an almost
    // simultaneous finish where 600ms later it goes straight to the result
    // without spectating anything (see the setTimeout below), and even on the
    // normal wait path, the player wanted to see their own board still there
    // (frozen) behind the result spinner/overlay, not an empty screen — the
    // reported "the game assets get removed". Nothing is wiped here anymore:
    // the board stays as is until, if applicable, flagsSpectatorEnter/
    // shapesSpectatorEnter repopulate it with the opponent's data (same
    // elements, no flicker).
    if (!_oppGameEnded && typeof window._showVsWaitSpinner === 'function') window._showVsWaitSpinner();
    if (window.VS.getMatchId()) {
      window.VS.reportScore(myFinalScore);
      // If I ALREADY know the opponent finished (I'm the second to finish), I
      // now compute the shared reveal instant and send it in the same
      // announcement — see the long comment in _revealAt/reportGameEnd.
      const revealAt = _oppGameEnded ? (Date.now() + REVEAL_BUFFER_MS) : null;
      if (revealAt) _revealAt = revealAt;
      window.VS.reportGameEnd(myFinalScore, revealAt);
    }
    // Lifeline: if the opponent's broadcast/state is lost for whatever
    // reason (network glitch), don't leave this player waiting forever — at
    // 12s WITH NO signal that the opponent is still active the result is
    // shown anyway with the last known data from them (see
    // _armGameEndFallback, which is what actually re-arms this timer each
    // time a real signal does arrive while watching them on loan).
    _armGameEndFallback();
    // Short margin before deciding whether to spectate the opponent on loan
    // — covers both "in case the opponent ALREADY announced before I
    // finished" (see _revealAt/REVEAL_BUFFER_MS) AND the near-simultaneous
    // finish case: if the opponent finishes their timer almost the same
    // instant as me, their 'gameend' can arrive a few hundred ms after mine
    // due to normal network latency. This used to enter _enterWaitAsSpectator()
    // RIGHT AWAY, without waiting — if the opponent did the same with me at
    // the same time, BOTH released their channel to "watch on loan" the other
    // simultaneously, and neither generated tick/round again (both had
    // stopped playing) — they were left mutually waiting on each other with
    // no real signal until the 12s lifeline (the reported "both want to
    // spectate the other"). Waiting this margin before committing to
    // spectate covers that case: if the opponent's announcement arrives in
    // that little while, we go straight to the result without going through
    // spectator mode at all.
    setTimeout(() => {
      if (_resultShown) return;
      if (_oppGameEnded) { _tryShowVsResultWhenBothDone(); return; }
      // The opponent is genuinely still playing; instead of leaving the
      // player staring at a frozen screen / the already-off TIME'S UP
      // overlay, we drop them on loan into spectator mode OF THEIR OWN
      // OPPONENT (same pipeline friends already use to spectate) until the
      // opponent also finishes.
      _enterWaitAsSpectator();
    }, 600);
  };

  async function _enterWaitAsSpectator() {
    if (_waitingAsSpectator || _resultShown) return;
    const matchId = window.VS.getMatchId();
    if (typeof window.openSpectator !== 'function' || !matchId || !window._vsOpponent) return;
    _waitingAsSpectator = true;
    // Supabase Realtime doesn't allow two channels subscribed to the same
    // topic 'match-{id}' from the same client (confirmed live: throws
    // "cannot add postgres_changes callbacks... after subscribe()") — THIS
    // player's channel (VS, connected since the match started) must be
    // released so Spectate.watch() can take that same topic and render the
    // opponent. reportScore/reportGameEnd were already sent above in
    // _vsHandleGameEnd, before this — nothing of our own is lost.
    // WAIT for the unsubscribe to actually finish (see the long comment in
    // releaseChannel) before Spectate.watch() tries to take the same topic —
    // otherwise it's a race that sometimes failed in real play (the reported
    // "it kicks me straight to the menu", because Spectate.watch() threw and
    // openSpectator swallowed it silently without retrying).
    await window.VS.releaseChannel();
    if (_resultShown) return; // resolved while we were waiting (e.g. abandonment)
    // Detecting "the opponent also finished" can no longer come from the VS
    // channel (just released) — it's replaced by the same 'gameend' event,
    // but received through the channel Spectate.watch() opens.
    window.Spectate.onGameEnd(payload => {
      if (!payload || _resultShown) return;
      _oppGameEnded = true;
      _oppFinalScoreCache = payload.score || 0;
      if (payload.revealAt) _revealAt = payload.revealAt;
      _tryShowVsResultWhenBothDone();
    });
    // (Own assets were already cleaned above in _vsHandleGameEnd, as soon as
    // we knew we had to wait — see that long comment.)
    // While this watch-on-loan lasts, every real tick/round arriving from the
    // opponent (spectate.js processes them to draw the UI, and also calls
    // this hook — see _wireCommonCallbacks) reschedules the 12s lifeline —
    // see _armGameEndFallback. Without this the original lifeline (armed ONCE
    // in _vsHandleGameEnd, counted from MY finish) fired anyway even if the
    // opponent was still playing normally with more than 12s ahead.
    window._vsSpectatorHeartbeat = _armGameEndFallback;
    window.openSpectator(matchId, window._vsOpponent, { instant: true });
    // The "SPECTATING" tag (miniHud, see spectator-mini-tag in index.html)
    // is for an EXTERNAL spectator watching a friend — here the one watching
    // is THE PLAYER THEMSELVES, waiting for the opponent to finish their
    // timer to see the result. "SPECTATING" makes no sense in that context —
    // it's overwritten with a waiting message.
    const tagEl = document.getElementById('spectator-mini-tag');
    if (tagEl) tagEl.textContent = (typeof t === 'function') ? t('vs.waitingForOthers', 'Esperando a los otros jugadores...') : 'Esperando a los otros jugadores...';
  }

  // Takes the player out of "on loan" spectator mode without going through
  // the menu screen (see closeSpectator(message, silent) in spectate.js) —
  // unlike an external spectator, this player goes straight back to THEIR
  // OWN result screen, not the menu.
  function _exitWaitAsSpectator() {
    if (!_waitingAsSpectator) return;
    _waitingAsSpectator = false;
    if (window._vsSpectatorHeartbeat === _armGameEndFallback) window._vsSpectatorHeartbeat = null;
    // About to show MY OWN duel result — same flag _onOpponentAbandoned
    // already uses before its hardReset. flagsSpectatorExit() (called inside
    // closeSpectator, see below) now also respects it: without this it wiped
    // the game's background assets (machine/suitcases/flags) before the
    // result overlay appeared, leaving it on an empty background instead of
    // the frozen match behind (the reported "the background assets get
    // removed if I lose").
    window._vsShowingResult = true;
    if (typeof window.closeSpectator === 'function') window.closeSpectator(null, true);
  }

  // This used to call _showVsResult() directly, as soon as THIS client
  // found out (locally) that both had finished — and that news reaches each
  // side at a different moment (the second to finish knows immediately; the
  // first only when the second's broadcast arrives). Now both (and any
  // spectator, via the same 'gameend' relayed by Spectate.watch) wait for
  // the SAME wall-clock _revealAt before showing anything — see _revealAt
  // above.
  function _tryShowVsResultWhenBothDone(force) {
    if (_resultShown || !_myGameEnded) return;
    if (!_oppGameEnded && !force) return; // keep waiting for the opponent
    clearTimeout(_gameEndFallbackTimer);
    // No revealAt (the opponent's broadcast was lost and we got here via the
    // 12s lifeline, or for some reason it was never computed) — no point
    // waiting more, show it now with the last known data.
    const delay = _revealAt ? Math.max(0, _revealAt - Date.now()) : 0;
    clearTimeout(_revealTimer);
    _revealTimer = setTimeout(() => {
      if (_resultShown) return;
      window._hideVsWaitSpinner();
      _exitWaitAsSpectator();
      const isHost = window.VS.isHost();
      const m = window.VS.getMatch() || {};
      const oppScoreFromMatch = isHost ? (m.guest_score || 0) : (m.host_score || 0);
      const oppScore = _oppGameEnded ? Math.max(_oppFinalScoreCache || 0, oppScoreFromMatch) : oppScoreFromMatch;
      const myScore  = Math.max(_myFinalScoreCache || 0, isHost ? (m.host_score || 0) : (m.guest_score || 0));
      const outcome  = myScore > oppScore ? 'win' : (myScore < oppScore ? 'lose' : 'draw');
      _showVsResult(outcome, myScore, oppScore);
    }, delay);
  }

  // The opponent disconnected or abandoned → I win by abandonment.
  function _onOpponentAbandoned() {
    if (_resultShown) return;
    window._hideVsWaitSpinner();
    // If they were watching the opponent on loan (see _enterWaitAsSpectator)
    // they must be taken out of there BEFORE touching the real mode's hard
    // reset — the spectator UI is mounted on the same elements as the real
    // game, so doing both at once would clobber the DOM.
    _exitWaitAsSpectator();
    _endedByAbandon = true;
    // Mark the VS result as visible so the hardResets don't clean assets
    window._vsShowingResult = true;
    // Stop the current mode's timers/RAF without wiping assets or hiding game
    // elements (the result overlay covers everything with its dark background)
    if (_vsCurrentMode === 'shapes') {
      if (typeof window.shapesHardReset === 'function') { try { window.shapesHardReset(); } catch(e) {} }
    } else if (_vsCurrentMode === 'cities' || _vsCurrentMode === 'monuments') {
      (_vsCurrentMode === 'monuments' ? window.monumentsHardReset : window.citiesHardReset)?.();
    } else if (_vsCurrentMode === 'globequiz') {
      window.globequizHardReset?.();
    } else {
      if (typeof window.flagsHardReset === 'function') { try { window.flagsHardReset(); } catch(e) {} }
    }
    const m = window.VS.getMatch() || {};
    const isHost   = window.VS.isHost();
    // MY own score is NOT read only from m.host_score/guest_score — that
    // value comes from the postgres_changes echo of my LAST reportScore(),
    // which takes a while to arrive (real WAL, not instant); if the opponent
    // abandons right after I scored points, that echo may not have arrived
    // yet and the cache is left at 0 or stale — the reported "my final score
    // shows 0". The live source (the current mode's own counter) is
    // immediate, without that delay.
    const liveScore = _getLiveScore();
    const myScoreFromMatch = isHost ? (m.host_score || 0) : (m.guest_score || 0);
    const myScore  = Math.max(liveScore, myScoreFromMatch);
    const oppScore = isHost ? (m.guest_score || 0) : (m.host_score || 0);
    _showVsResult('win', myScore, oppScore, 'abandon');
    // GlobeQuiz has no comparable numeric score — overwrite the spans with my
    // best km achieved (or "—" if I didn't guess any) and "—" for the
    // opponent, who abandoned.
    if (_vsCurrentMode === 'globequiz') {
      const summary = window.globequizGetVsSummary?.() || {};
      _patchGqResultScores(
        summary.bestKm != null ? Math.round(summary.bestKm) + ' km' : '—',
        '—'
      );
    }
  }

  // Overwrites the two numeric spans of #vs-result-screen with GlobeQuiz's
  // own text (time/km instead of a score with toLocaleString()) — always
  // called AFTER _showVsResult(), which already did everything else (hide
  // HUD, record win/lose, reportPostgame/finish).
  function _patchGqResultScores(meText, oppText) {
    const meEl  = document.getElementById('vs-result-me-score');
    const oppEl = document.getElementById('vs-result-opp-score');
    if (meEl)  meEl.textContent  = meText;
    if (oppEl) oppEl.textContent = oppText;
  }

  // Revealed country + own attempts, below the avatars — same text the
  // 1-player end-of-game modal uses (globequiz.hintCorrect/attempts, see
  // gq-endgame-country-label/gq-endgame-attempts in globequiz.js), here
  // placed in the W/L panel instead of a separate modal.
  function _patchGqResultExtra(countryName, guessCount) {
    const wrap        = document.getElementById('vs-result-gq-extra');
    const countryEl   = document.getElementById('vs-result-gq-country');
    const attemptsEl  = document.getElementById('vs-result-gq-attempts');
    if (!wrap) return;
    const T = (k, d, vars) => (typeof t === 'function' ? t(k, vars) : d);
    if (countryEl) {
      countryEl.textContent = countryName
        ? T('globequiz.hintCorrect', 'El país correcto es ' + countryName + '.', { name: countryName })
        : '';
    }
    if (attemptsEl) {
      attemptsEl.textContent = T('globequiz.attempts', 'Intentos', {}) + ': ' + (guessCount != null ? guessCount : '—');
    }
    wrap.style.display = 'flex';
  }

  // ── GlobeQuiz VS: wait for BOTH to load the 3D globe ──────────────────────
  // Each client runs its own Promise.all([loadThree(), loadCountries()])
  // (see initGlobeQuiz in globequiz.js). Without a gate, the 3-2-1 started as
  // soon as EACH ONE finished loading separately, so whoever loaded faster
  // (better network/CPU) started their timer first — a real advantage in a
  // mode won by being first to guess right.
  //
  // The gate is dead simple now — the same shape the other modes use, no
  // host/guest asymmetry, no ack round-trip (that extra layer was what left
  // one side stuck while the other started): each client broadcasts 'ready'
  // when its own globe is loaded, and starts its LOCAL 3-2-1 the moment it
  // has BOTH its own 'ready' and the opponent's. Both sides trigger on the
  // same event (receiving the 2nd 'ready'), skewed only by one network hop —
  // exactly like the local 3-2-1 in flags/shapes. 'ready' is re-broadcast
  // every RESEND_MS while waiting so a single dropped packet doesn't hang a
  // side.
  //
  // GQ_READY_TIMEOUT_MS: if the opponent's 'ready' never arrives within this,
  // the match is cancelled for BOTH (never started solo — see
  // _handleGqSyncFailed). Must cover the worst legit case (slow mobile
  // pulling three.min.js down the 3-CDN fallback chain, see globequiz.js);
  // _scheduleVersusStart also pre-warms that download.
  const GQ_READY_TIMEOUT_MS = 30000;
  const GQ_READY_RESEND_MS = 1500; // re-broadcast 'ready' this often while waiting
  const GQ_GO_DELAY_MS = 900;      // small settle after "both ready" so the bar is seen, then the 3-2-1
  let _gqReadyMe = false, _gqReadyOpp = false, _gqReadyDone = false;
  let _gqReadyTimer = null, _gqReadyResolveCb = null, _gqReadyResendTimer = null;
  let _gqSyncFailed = false;
  // 0..1 progress of each side for the sync bar.
  let _gqMyProg = 0, _gqOppProg = 0;

  // ── Sync panel (inside #vs-duel-accepted-popup) ───────────────────────────
  const GQ_PHASE_PROG = { start: 0.14, assets: 0.48, scene: 0.74, ready: 0.95, go: 1 };

  function _gqSyncSetState(elId, key, isReady) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = T(key, key === 'vs.syncReady' ? '¡Listo!' : key === 'vs.syncAlmost' ? 'Casi listo…' : 'Cargando…');
    el.classList.toggle('ready', !!isReady);
  }
  function _gqSyncRenderBar() {
    const bar = document.getElementById('vs-sync-bar');
    if (!bar) return;
    const pct = Math.round(((_gqMyProg + _gqOppProg) / 2) * 100);
    bar.style.width = Math.max(8, Math.min(100, pct)) + '%';
  }
  function _gqPhaseToText(phase) {
    if (phase === 'ready' || phase === 'go') return 'vs.syncReady';
    if (phase === 'scene') return 'vs.syncAlmost';
    return 'vs.syncLoading';
  }
  function _showGqSyncPanel() {
    const block = document.getElementById('vs-sync-block');
    const sub   = document.getElementById('vs-duel-accepted-sub');
    if (sub) sub.textContent = T('vs.syncTitle', 'Sincronizando la partida…');
    const meWho  = document.getElementById('vs-sync-me-who');
    const oppWho = document.getElementById('vs-sync-opp-who');
    if (meWho)  meWho.textContent  = T('vs.syncYou', 'Tú');
    if (oppWho) oppWho.textContent = _pendingOppName || (window._vsOpponent && window._vsOpponent.name) || 'Rival';
    _gqMyProg = _gqOppProg = 0;
    _gqSyncSetState('vs-sync-me-state', 'vs.syncLoading', false);
    _gqSyncSetState('vs-sync-opp-state', 'vs.syncLoading', false);
    _gqSyncRenderBar();
    if (block) block.style.display = 'flex';
    _showDuelAcceptedPopup();
  }
  function _hideGqSyncPanel() {
    const block = document.getElementById('vs-sync-block');
    if (block) block.style.display = 'none';
    // Restore the subtitle in case the next duel is NOT GloboReto.
    const sub = document.getElementById('vs-duel-accepted-sub');
    if (sub) sub.textContent = T('vs.duelAccepted', '¡Duelo aceptado! Redirigiéndote a la partida…');
    _hideDuelAcceptedPopup();
  }
  function _gqSyncAllReady() {
    _gqMyProg = _gqOppProg = 1;
    _gqSyncSetState('vs-sync-me-state', 'vs.syncReady', true);
    _gqSyncSetState('vs-sync-opp-state', 'vs.syncReady', true);
    _gqSyncRenderBar();
    const sub = document.getElementById('vs-duel-accepted-sub');
    if (sub) sub.textContent = T('vs.syncStarting', '¡Empezando!');
  }

  // OWN load milestone (called from globequiz.js) — updates my row + bar and
  // tells the opponent.
  window._vsGqLoadPhase = function (phase) {
    if (!window._vsActive || _gqSyncFailed) return;
    _gqMyProg = Math.max(_gqMyProg, GQ_PHASE_PROG[phase] || 0);
    _gqSyncSetState('vs-sync-me-state', _gqPhaseToText(phase), phase === 'ready' || phase === 'go');
    _gqSyncRenderBar();
    if (window.VS && typeof window.VS.reportGqPhase === 'function') window.VS.reportGqPhase(phase);
  };
  function _gqOnOppPhase(phase) {
    _gqOppProg = Math.max(_gqOppProg, GQ_PHASE_PROG[phase] || 0);
    _gqSyncSetState('vs-sync-opp-state', _gqPhaseToText(phase), phase === 'ready' || phase === 'go');
    _gqSyncRenderBar();
  }

  // GlobeQuiz VS: one side couldn't get the 3D globe ready in time (three.js
  // CDN hung, WebGL blocked, network down, or simply never confirmed). Since
  // the mode is won by being FIRST to guess right, starting desynced is
  // unfair and starting solo leaves the other frozen on the loading spinner
  // with no warning (the reported "one gets frozen and the other loads
  // fine"). It's cancelled for BOTH, no winner or loss recorded, with a
  // banner and return to the menu.
  // reason (optional): { code, msg } — a specific failure cause + error code
  // shown in the toast on the way back to the menu. Falls back to a generic
  // message when omitted.
  function _handleGqSyncFailed(fromOpponent, reason) {
    if (_gqSyncFailed || _resultShown) return;
    _gqSyncFailed = true;
    _gqReadyReset();
    if (!fromOpponent && window.VS) {
      if (typeof window.VS.reportGqAbort === 'function') window.VS.reportGqAbort();
      if (typeof window.VS.cancelMatchNoResult === 'function') window.VS.cancelMatchNoResult();
    }
    if (typeof window.showVersusToast === 'function') {
      const msg = (reason && reason.msg) || T('vs.gqSyncFailed', 'No se pudo sincronizar el globo 3D con el rival. Prueben de nuevo.');
      window.showVersusToast(msg, { code: (reason && reason.code) || 'GLB-00' });
    }
    const spinner = document.getElementById('gq-loading-spinner');
    if (spinner) spinner.style.display = 'none';
    _hideGqSyncPanel();
    // Clean exit WITHOUT going through _showVsResult/_vsAbandon (there was no
    // real match, nobody wins or loses). _endedByAbandon/_resultShown true
    // cut off any late finish()/echo; _teardownVsOpponent clears _vsActive
    // before quitToMenu so its guard doesn't fire _vsAbandon.
    _endedByAbandon = true;
    _resultShown    = true;
    try { window.globequizHardReset?.(); } catch (e) {}
    _teardownVsOpponent();
    _restoreRandom();
    if (window.VS && typeof window.VS.cleanup === 'function') window.VS.cleanup();
    if (typeof window.quitToMenu === 'function') window.quitToMenu();
    _resultShown = false;
    _gqLoseHandled = false;
    _matchResultRecorded = false;
  }
  // Called from globequiz.js when its Promise.all([loadThree, loadCountries])
  // rejects while in a duel (see initGlobeQuiz's .catch). `err` (optional)
  // lets us tell a blocked-WebGL browser apart from an unreachable CDN.
  window._vsGqSyncFailed = function (err) {
    const isWebgl = /error creating webgl context|webgl/i.test(String((err && err.message) || err || ''));
    _handleGqSyncFailed(false, isWebgl
      ? { code: 'GLB-05', msg: 'Tu navegador tiene WebGL bloqueado o deshabilitado' }
      : { code: 'GLB-01', msg: 'Error de conexión: no se pudo descargar el globo 3D' });
  };

  // Registered in _launchVersus BEFORE calling initGlobeQuiz() — so the
  // 'ready' listener is already hooked to the channel whatever happens with
  // each side's load order.
  function _gqReadySetup() {
    _gqReadyMe = false; _gqReadyOpp = false; _gqReadyDone = false;
    clearTimeout(_gqReadyTimer); _gqReadyTimer = null; _gqReadyResolveCb = null;
    clearInterval(_gqReadyResendTimer); _gqReadyResendTimer = null;
    const myRole = () => (window.VS.isHost() ? 'host' : 'guest');
    window.VS.onReady(payload => {
      if (!payload || payload.role === myRole()) return; // own echo, same filter as 'answer'
      _gqReadyOpp = true;
      _gqOnOppPhase('ready');
      _gqMaybeStart();
    });
    window.VS.onGqPhase(payload => {
      if (!payload || payload.role === myRole()) return;
      _gqOnOppPhase(payload.phase);
    });
  }
  // Both sides land here on the same trigger — the moment they hold both their
  // own 'ready' and the opponent's — so the two local 3-2-1s are skewed only
  // by one network hop, same as flags/shapes. GQ_GO_DELAY_MS is just a settle
  // so the "ready!" bar is seen.
  function _gqMaybeStart() {
    if (_gqReadyDone || !_gqReadyResolveCb) return;
    if (!(_gqReadyMe && _gqReadyOpp)) return;
    _gqReadyDone = true;
    clearTimeout(_gqReadyTimer); _gqReadyTimer = null;
    clearInterval(_gqReadyResendTimer); _gqReadyResendTimer = null;
    const cb = _gqReadyResolveCb; _gqReadyResolveCb = null;
    // One last 'ready' — if the opponent missed ours they get this one and
    // start too (their _gqMaybeStart already has _gqReadyMe by then).
    try { window.VS.reportReady(); } catch (e) {}
    _gqSyncAllReady();
    setTimeout(() => { _hideGqSyncPanel(); cb(); }, GQ_GO_DELAY_MS);
  }
  // Cutoff (abandonment/quitToMenu while waiting) — without this, a stale
  // timeout could fire the 3-2-1 over a screen that already returned to the
  // menu.
  function _gqReadyReset() {
    clearTimeout(_gqReadyTimer); _gqReadyTimer = null;
    clearInterval(_gqReadyResendTimer); _gqReadyResendTimer = null;
    _gqReadyMe = _gqReadyOpp = _gqReadyDone = false;
    _gqReadyResolveCb = null;
  }

  // Called from globequiz.js as soon as THIS client finishes loading three.js
  // + the GeoJSON — broadcasts 'ready' (repeating until start or timeout) and
  // calls onBothReady() once BOTH sides have announced, or bounces both after
  // GQ_READY_TIMEOUT_MS if the opponent never does.
  window._vsGqAwaitBothReady = function (onBothReady) {
    if (_gqSyncFailed) return; // the duel is already closing due to sync failure
    if (!window._vsActive || !window.VS.getMatchId()) { onBothReady(); return; }
    _gqReadyResolveCb = onBothReady;
    _gqReadyMe = true;
    _gqMyProg = Math.max(_gqMyProg, GQ_PHASE_PROG.ready);
    _gqSyncSetState('vs-sync-me-state', 'vs.syncReady', true);
    _gqSyncRenderBar();
    window.VS.reportReady();
    // Keep re-announcing until we start or time out — a single dropped 'ready'
    // broadcast would otherwise hang this side until GQ_READY_TIMEOUT_MS.
    clearInterval(_gqReadyResendTimer);
    _gqReadyResendTimer = setInterval(() => {
      if (_gqReadyDone) { clearInterval(_gqReadyResendTimer); _gqReadyResendTimer = null; return; }
      try { window.VS.reportReady(); } catch (e) {}
    }, GQ_READY_RESEND_MS);
    _gqReadyTimer = setTimeout(() => {
      if (_gqReadyDone) return;
      _gqReadyDone = true;
      _gqReadyResolveCb = null;
      clearInterval(_gqReadyResendTimer); _gqReadyResendTimer = null;
      // The opponent never confirmed their 3D globe finished loading. We do
      // NOT start solo (see _handleGqSyncFailed) — it's cancelled for both.
      _handleGqSyncFailed(false, { code: 'GLB-02', msg: 'Error de conexión: Timeout — el rival no respondió' });
    }, GQ_READY_TIMEOUT_MS);
    _gqMaybeStart();
  };

  // ── GlobeQuiz: instant win ─────────────────────────────────────────────────
  // Unlike flags/shapes/cities/monuments (a score that climbs with each
  // correct answer, compared only when a timer ends), here there's only ONE
  // possible winner: the first to guess right. There's nothing to wait for
  // from the opponent — neither _vsHandleGameEnd nor the shared "revealAt"
  // apply, it ends right away on both sides (I know immediately because I
  // guessed right; the opponent finds out via the broadcast below, see
  // _handleGqOpponentWin).

  // Called from globequiz.js (submitGuess) as soon as THIS client guesses
  // right — sends the broadcast RIGHT AWAY (without waiting for the local
  // celebration) so the opponent sees the game over as soon as possible.
  // Does NOT touch this client's UI yet (see _vsShowGqWinResult, called 2s
  // later once the celebration has been seen).
  window._vsReportGqWin = function(elapsedMs, countryName, iso2) {
    if (_resultShown) return;
    if (!window.VS.getMatchId()) return;
    // Reuses the existing 'answer' broadcast (VS.reportScore with detail) —
    // the opponent already listens via VS.onAnswer (see _launchVersus,
    // globequiz branch).
    window.VS.reportScore(1, { win: true, elapsedMs, countryName, iso2, correct: true });
  };

  // Called from globequiz.js TOGETHER with _vsReportGqWin (same instant) —
  // the winner sees their "YOU WON" at the same time the opponent receives
  // the broadcast and sees their "YOU LOST" (see _handleGqOpponentWin
  // below), with no celebration delay in between.
  window._vsShowGqWinResult = function(elapsedMs) {
    if (_resultShown) return;
    _showVsResult('win', 0, 0);
    _patchGqResultScores(window.formatGqCardTime ? window.formatGqCardTime(elapsedMs) : String(elapsedMs), '—');
    const summary = window.globequizGetVsSummary?.() || {};
    _patchGqResultExtra(summary.countryName, summary.guessCount);
  };

  // Called from VS.onAnswer (see _launchVersus) when the opponent announced
  // they won — nothing is ever decided here, only reflected. Same approach
  // as 1-player: while the winner sees their celebration (showWin, see
  // submitGuess in globequiz.js), here the gameover.png animation plays
  // (same overlay/timing #powerquit-overlay uses for "you quit in practice"
  // — timeup-in/timeup-out) for GQ_VS_ANIM_MS, and only once that animation
  // ends does the "YOU LOST" banner appear.
  let _gqLoseAnimT1 = null, _gqLoseAnimT2 = null, _gqLoseResultT = null;
  function _handleGqOpponentWin(payload) {
    // _resultShown only turns on ~2s later (in _gqLoseResultT), so a second
    // 'answer' broadcast with win:true (Realtime echo/duplicate, common with
    // high latency) reentered and fired the loss animation again — the
    // reported "you lost twice". Own guard, immediate.
    if (_resultShown || _gqLoseHandled) return;
    _gqLoseHandled = true;
    window.globequizVsShowLoss?.();
    const animMs = window._GQ_VS_ANIM_MS || 2000;
    const goOverlay = document.getElementById('powerquit-overlay');
    if (goOverlay) {
      goOverlay.style.display = 'flex';
      goOverlay.classList.remove('timeup-out');
      goOverlay.classList.add('timeup-in');
      _gqLoseAnimT1 = setTimeout(() => {
        goOverlay.classList.remove('timeup-in');
        goOverlay.classList.add('timeup-out');
        _gqLoseAnimT2 = setTimeout(() => {
          goOverlay.style.display = 'none';
          goOverlay.classList.remove('timeup-out');
        }, 400);
      }, Math.max(0, animMs - 400));
    }
    _gqLoseResultT = setTimeout(() => {
      _showVsResult('lose', 0, 0);
      const oppText = window.formatGqCardTime ? window.formatGqCardTime(payload.elapsedMs || 0) : String(payload.elapsedMs || 0);
      const summary = window.globequizGetVsSummary?.() || {};
      const meText = summary.bestKm != null ? Math.round(summary.bestKm) + ' km' : '—';
      _patchGqResultScores(meText, oppText);
      _patchGqResultExtra(summary.countryName, summary.guessCount);
    }, animMs);
  }
  // Cutoff for the animation above (opponent abandonment, generic quitToMenu)
  // — without this, the gameover.png overlay or the timeout could fire over
  // a screen that already returned to the menu.
  function _clearGqLoseAnim() {
    if (_gqLoseAnimT1) { clearTimeout(_gqLoseAnimT1); _gqLoseAnimT1 = null; }
    if (_gqLoseAnimT2) { clearTimeout(_gqLoseAnimT2); _gqLoseAnimT2 = null; }
    if (_gqLoseResultT) { clearTimeout(_gqLoseResultT); _gqLoseResultT = null; }
    const goOverlay = document.getElementById('powerquit-overlay');
    if (goOverlay) { goOverlay.style.display = 'none'; goOverlay.classList.remove('timeup-in', 'timeup-out'); }
  }

  // Reads the LIVE score of the mode currently in progress, straight from
  // each game's global variable (flags/shapes/cities/monuments share the
  // same global scope, no build step) — doesn't depend on reportScore()
  // having already round-tripped to the DB.
  function _getLiveScore() {
    if (_vsCurrentMode === 'shapes')    return Math.round(typeof shapesScore !== 'undefined' ? shapesScore : 0);
    if (_vsCurrentMode === 'cities' || _vsCurrentMode === 'monuments') {
      return Math.round((typeof state !== 'undefined' && state && typeof state.score === 'number') ? state.score : 0);
    }
    if (_vsCurrentMode === 'globequiz') return 0; // no numeric score — see _patchGqResultScores
    return Math.round(typeof flagsScore !== 'undefined' ? flagsScore : 0);
  }

  // Called from quitToMenu when I leave an in-progress versus match.
  window._vsAbandon = function() {
    // Whoever abandons loses: record a loss on my own record.
    // sbRecordVersusResult is NOT idempotent (does vs_losses+1 with
    // read-modify-write), and is also called from _showVsResult('lose') —
    // without this guard, losing and then firing quitToMenu with _vsActive
    // still alive counted the loss twice.
    if (!_matchResultRecorded && window._sbUserId && typeof window.sbRecordVersusResult === 'function') {
      _matchResultRecorded = true;
      window.sbRecordVersusResult(window._sbUserId, false).catch(() => {});
    }
    if (window.VS && typeof window.VS.abandon === 'function') window.VS.abandon();
    _teardownVsOpponent();
    _restoreRandom();
  };

  function _showVsResult(outcome, myScore, oppScore, reason) {
    if (_resultShown) return;
    _resultShown = true;
    // Turn off is_playing NOW (not only on returning to the menu) — without
    // this, the spectate icon on this player's cell in the friends panel
    // stayed visible/clickable for the WHOLE time they sit looking at their
    // own result screen, even though the match already ended (matches.status
    // is also advanced below, with VS.finish() — same reason, two different
    // flags to turn off at once). Called on BOTH clients (not just host):
    // each turns off its OWN is_playing, not the opponent's.
    if (typeof window._setPlaying === 'function') window._setPlaying(false);
    // Tell a possible spectator the final result — this never happened
    // before (reportPostgame() was defined in vs.js but nobody called it for
    // versus, see the old comment right there), so the spectator was left
    // with the last round frozen until the host returned to the menu (only
    // then did matches.status become 'finished' and the spectator closed the
    // session with a generic message, never seeing the real result). Called
    // from BOTH clients (host and guest, each runs _showVsResult
    // independently) — harmless, the spectator receives the same result
    // twice.
    if (window.VS && window.VS.getMatchId() && typeof window.VS.reportPostgame === 'function') {
      const isHost = window.VS.isHost();
      const myName   = localStorage.getItem('playerName')  || 'Jugador';
      const myAvatar = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
      const opp = window._vsOpponent || {};
      const oppName   = opp.name   || 'Rival';
      const oppAvatar = opp.avatar || 'images/profilepic/ppdefault.png';
      window.VS.reportPostgame({
        hostName:   isHost ? myName   : oppName,
        hostAvatar: isHost ? myAvatar : oppAvatar,
        hostScore:  isHost ? myScore  : oppScore,
        guestName:   isHost ? oppName   : myName,
        guestAvatar: isHost ? oppAvatar : myAvatar,
        guestScore:  isHost ? oppScore  : myScore,
        reason: reason || null,
      });
      // Mark the match as finished NOW (not only when the host returns to the
      // menu, which is when _vsReturnToMenu() used to call this) — without
      // this, a spectator could keep "entering" this match (matches.status
      // still 'active') for the whole time the winner sat looking at their
      // own result screen, seeing the same already-decided result instead of
      // being denied access, as befits an already-finished match.
      // _endedByAbandon is false here (if it were an abandonment, whoever
      // abandoned already wrote status='abandoned' directly — this code isn't
      // even called in that case with _resultShown still false). isHost: same
      // owner that already had write permission in _vsReturnToMenu, the
      // criterion isn't duplicated.
      if (isHost && !_endedByAbandon && typeof window.VS.finish === 'function') {
        try { window.VS.finish(); } catch (e) {}
      }
    }
    // Hide all HUD elements that could appear above the result overlay
    ['score-display','countdown-widget','flags-score-display','flags-countdown-widget',
     'shapes-countdown-widget','pregame-countdown','flags-pregame-countdown',
     'right-panel','flags-right-panel','timeup-overlay','flags-timeup-overlay',
     'speed-bonus-text','flags-speed-bonus-text','game-wrapper',
     // GlobeQuiz country/attempts: hidden by default, re-enabled by
     // _patchGqResultExtra() only when the mode is globequiz — so other
     // modes never carry over stale text from a previous duel.
     'vs-result-gq-extra'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // Record the result on my own record (the tables don't count draws).
    // Idempotency guard: see the comment in _vsAbandon.
    if (!_matchResultRecorded && (outcome === 'win' || outcome === 'lose') && window._sbUserId
        && typeof window.sbRecordVersusResult === 'function') {
      _matchResultRecorded = true;
      window.sbRecordVersusResult(window._sbUserId, outcome === 'win').catch(() => {});
    }
    const T = (k, d) => (typeof t === 'function' ? t(k) : d);
    const screen = document.getElementById('vs-result-screen');
    const title  = document.getElementById('vs-result-title');
    if (title) {
      title.className = 'vs-result-title ' + outcome;
      title.textContent = outcome === 'win'       ? T('vs.result.win',       '¡GANASTE!')
                        : outcome === 'lose'      ? T('vs.result.lose',      'PERDISTE')
                        : outcome === 'abandoned' ? T('vs.result.abandoned',  'QUEDASTE SOLO')
                        :                          T('vs.result.draw',       '¡EMPATE!');
    }
    const sub = document.getElementById('vs-result-sub');
    if (sub) {
      const subText = outcome === 'abandoned' ? T('vs.result.solo', 'Todos abandonaron la partida')
                    : reason === 'abandon'    ? T('vs.result.abandon', 'Tu rival abandonó la partida')
                    : '';
      sub.textContent = subText;
      sub.style.display = subText ? 'block' : 'none';
    }
    document.getElementById('vs-result-me-name').textContent  = localStorage.getItem('playerName') || T('vs.result.you', 'Tú');
    document.getElementById('vs-result-me-pic').src           = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    document.getElementById('vs-result-me-score').textContent = (myScore || 0).toLocaleString();
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-result-me-pic-wrap'), window._sbProfile?.frame_code || '0001');
    const opp = window._vsOpponent || {};
    document.getElementById('vs-result-opp-name').textContent  = opp.name || 'Rival';
    document.getElementById('vs-result-opp-pic').src           = opp.avatar || 'images/profilepic/ppdefault.png';
    document.getElementById('vs-result-opp-score').textContent = (oppScore || 0).toLocaleString();
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-result-opp-pic-wrap'), opp.frameCode || '0001');
    if (screen) screen.style.display = 'flex';
    try {
      if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
    } catch (e) {}
  }

  function _vsReturnToMenu() {
    window._vsShowingResult = false;
    const screen = document.getElementById('vs-result-screen');
    if (screen) screen.style.display = 'none';
    // Record the match as finished in the DB (normal matches only; an
    // abandonment was already marked by whoever left). Before cleanup (which
    // clears the matchId).
    if (!_endedByAbandon && window.VS && window.VS.isHost() && typeof window.VS.finish === 'function') {
      try { window.VS.finish(); } catch (e) {}
    }
    _resultShown = false;
    _gqLoseHandled = false;
    _matchResultRecorded = false;
    _endedByAbandon = false;
    _vsLaunching = false;
    if (window.VS && typeof window.VS.cleanup === 'function') window.VS.cleanup();
    // Important: clear the versus state BEFORE quitToMenu, so its abandonment
    // guard (if window._vsActive) doesn't fire (the match already ended
    // normally).
    _teardownVsOpponent();
    _restoreRandom();
    // If the host's lobby was left 'active' by the countdown that ran while
    // they were in the versus, reset it to 'waiting' so others can join again.
    try {
      const lid = window.LB?.getId?.();
      if (lid && window.LB?.isHost?.() && window.LB?.getLobby?.()?.status === 'active') {
        window.sb?.from('lobbies').update({ status: 'waiting', seed: null }).eq('id', lid).catch(() => {});
      }
    } catch (e) {}
    // Return to the MAIN MENU (panel 1) via the tested quitToMenu flow, which
    // resets all the loading panels. We used to use showEntranceElementsStatic
    // (panel 2), which left panels 1 and 2 mixed.
    if (typeof window.quitToMenu === 'function') {
      window.quitToMenu();
    } else if (typeof window.resetEntranceElements === 'function') {
      window.resetEntranceElements();
      const ls = document.getElementById('loading-screen');
      if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; }
      if (typeof window.replayEntranceAnimations === 'function') window.replayEntranceAnimations();
    }
  }

  // ── Duel result, spectator version ────────────────────────────────────────
  // Reuses the same #vs-result-screen the real players see, but in neutral
  // mode (host vs guest, no "you"/"opponent") and read-only (the return-to-
  // menu button must not react — it would close/restart THIS client's
  // session, which makes no sense for a spectator). payload comes from
  // _showVsResult() via VS.reportPostgame(): {hostName, hostAvatar,
  // hostScore, guestName, guestAvatar, guestScore, reason}.
  window.vsSpectatorShowResult = function (payload) {
    if (!payload) return;
    const screen = document.getElementById('vs-result-screen');
    const title  = document.getElementById('vs-result-title');
    const hostScore  = payload.hostScore  || 0;
    const guestScore = payload.guestScore || 0;
    const outcome = hostScore > guestScore ? 'host' : (hostScore < guestScore ? 'guest' : 'draw');
    const winnerName = outcome === 'host' ? (payload.hostName || 'Host') : (payload.guestName || 'Guest');
    const T = (k, d, vars) => (typeof t === 'function' ? t(k, vars) : d);
    if (title) {
      title.className = 'vs-result-title win'; // neutral color (green) — there's no "you lost" for a spectator
      title.textContent = outcome === 'draw'
        ? T('vs.result.draw', '¡EMPATE!')
        : T('vs.result.spectatorWins', `¡GANA ${winnerName}!`, { name: winnerName });
    }
    const sub = document.getElementById('vs-result-sub');
    if (sub) {
      const subText = payload.reason === 'abandon' ? T('vs.result.abandonNeutral', 'El rival abandonó la partida') : '';
      sub.textContent = subText;
      sub.style.display = subText ? 'block' : 'none';
    }
    const meNameEl  = document.getElementById('vs-result-me-name');
    const mePicEl   = document.getElementById('vs-result-me-pic');
    const meScoreEl = document.getElementById('vs-result-me-score');
    const oppNameEl  = document.getElementById('vs-result-opp-name');
    const oppPicEl   = document.getElementById('vs-result-opp-pic');
    const oppScoreEl = document.getElementById('vs-result-opp-score');
    if (meNameEl)  meNameEl.textContent  = payload.hostName || 'Host';
    if (mePicEl)   mePicEl.src           = payload.hostAvatar || 'images/profilepic/ppdefault.png';
    if (meScoreEl) meScoreEl.textContent = hostScore.toLocaleString();
    if (oppNameEl)  oppNameEl.textContent  = payload.guestName || 'Guest';
    if (oppPicEl)   oppPicEl.src           = payload.guestAvatar || 'images/profilepic/ppdefault.png';
    if (oppScoreEl) oppScoreEl.textContent = guestScore.toLocaleString();
    // Same reason as the real _showVsResult(): without this, the countdown
    // widgets (z-index:1000) were DRAWN ON TOP of the result panel
    // (.vs-popup-overlay, z-index:400) — the real player never notices
    // because their own _showVsResult() already hides them, but here it was
    // missing entirely.
    ['score-display','countdown-widget','flags-score-display','flags-countdown-widget',
     'shapes-countdown-widget','pregame-countdown','flags-pregame-countdown',
     'right-panel','flags-right-panel','timeup-overlay','flags-timeup-overlay',
     'speed-bonus-text','flags-speed-bonus-text','game-wrapper'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    // The real return button fires _vsReturnToMenu() (finishes ITS match,
    // clears THIS client's VS state) — makes no sense for a spectator.
    // Instead of hiding it with no replacement (leaving the spectator with
    // no way out of this screen, the reported "add a back button"), the same
    // visual button is reused but with closeSpectator() as its action — see
    // the guard at the start of the real listener, below.
    const backBtn = document.getElementById('vs-result-back');
    if (backBtn) { backBtn.style.pointerEvents = ''; backBtn.style.visibility = ''; }
    if (screen) screen.style.display = 'flex';
    try {
      if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
    } catch (e) {}
  };

  window.vsSpectatorHideResult = function () {
    const screen = document.getElementById('vs-result-screen');
    if (screen) screen.style.display = 'none';
  };

  // ── Start versus match ────────────────────────────────────────────────────

  // How long the "Duel accepted!" popup shows before the real 3-2-1, on BOTH
  // sides.
  //
  // This used to compare match.started_at (a timestamp the guest wrote using
  // ITS OWN wall clock, = guest_now + 1500ms) against the host's Date.now().
  // That only works if the two devices' clocks agree — they don't. With the
  // host's clock even a couple of seconds ahead, `started_at - host_now`
  // came out <= 0, so the host skipped the popup entirely AND reached the
  // 3-2-1 up to a full second and a half before the guest — the exact
  // unfairness the delay was meant to remove (reported: "it took me straight
  // to the 3-2-1, my friend got the 'duel accepted' screen").
  //
  // Now each side just waits this fixed amount locally from the moment it
  // learns the match is active. The guest learns instantly (its own accept()
  // write); the host learns one realtime message later, so the host starts
  // ~that latency after the guest — a ~100-400ms guest edge on a normal
  // connection instead of 1500ms+, and the host ALWAYS sees the popup.
  const VS_START_DELAY_MS = 1500;

  // Short popup ("Duel accepted!") shown to BOTH players (host and guest) as
  // soon as the duel is known to be starting — visually fills the
  // VS_START_DELAY_MS margin between "the guest accepted" and the real 3-2-1.
  function _showDuelAcceptedPopup() {
    const pop = document.getElementById('vs-duel-accepted-popup');
    if (!pop) return;
    const nameEl = document.getElementById('vs-duel-accepted-name');
    const picEl  = document.getElementById('vs-duel-accepted-pic');
    if (nameEl) nameEl.textContent = _pendingOppName || 'Rival';
    if (picEl) picEl.src = _pendingOppAvatar || 'images/profilepic/ppdefault.png';
    window.CustomizeAssets?.applyFrame(document.getElementById('vs-duel-accepted-pic-wrap'), _pendingOppFrameCode || '0001');
    pop.style.display = 'flex';
  }
  function _hideDuelAcceptedPopup() {
    const pop = document.getElementById('vs-duel-accepted-popup');
    if (pop) pop.style.display = 'none';
  }

  function _scheduleVersusStart(match) {
    // _vsLaunching (set by _launchVersus) and _vsStartScheduled (our own flag)
    // stop two near-simultaneous triggers — e.g. the onStart callback AND a
    // late resend, or the inbox accept AND the banner accept — from scheduling
    // the start twice.
    if (_vsLaunching || _vsStartScheduled) return;
    _vsStartScheduled = true;
    _showDuelAcceptedPopup();
    // GloboReto is the only mode that pulls a runtime <script> (three.js) at
    // match start — start that download NOW, during the "duel accepted"
    // popup, so neither side is waiting on a cold CDN fetch when the 3D globe
    // sync gate kicks in. Idempotent (checks its own cache).
    if ((match.mode || 'flags') === 'globequiz' && typeof window.preloadGlobeQuiz === 'function') {
      try { window.preloadGlobeQuiz(); } catch (e) {}
    }
    setTimeout(() => { _vsStartScheduled = false; _launchVersus(match); }, VS_START_DELAY_MS);
  }

  function _launchVersus(match) {
    if (_vsLaunching) return;
    _vsLaunching = true;
    const mode = match.mode || 'flags';
    // Ensures quitToMenu doesn't call _lobbyAbandon (which would do LB.leave()) on return
    window._lobbyActive = false;
    const seed = match.seed;
    // Cancel the lobby countdown if it was running
    if (window.Lobby?.cancelCountdown) window.Lobby.cancelCountdown();
    if (window.LB?.isHost?.() && window.LB.getId()) window.LB.sendCancel?.();

    window.practiceConfig = window.practiceConfig || {};
    window.practiceConfig.active = false;
    window.pendingGameMode = mode;
    if (typeof window._setPlaying === 'function') window._setPlaying(true);

    // Hide loading/versus/splash, leave only the game
    document.getElementById('loading-screen').style.display      = 'none';
    document.getElementById('loading-versus-group')?.classList.add('table-gone');
    document.getElementById('loading-versus-group')?.classList.remove('panel-visible');
    document.getElementById('splash-screen').style.display       = 'none';
    document.getElementById('vs-outgoing-popup').style.display   = 'none';
    document.getElementById('vs-incoming-popup').style.display   = 'none';
    document.getElementById('vs-mode-select-popup').style.display = 'none';
    _hideDuelAcceptedPopup();

    window._vsActive = true;
    _resultShown = false;
    _gqLoseHandled = false;
    _matchResultRecorded = false;
    _endedByAbandon = false;
    _myGameEnded = false; _oppGameEnded = false;
    _myFinalScoreCache = null; _oppFinalScoreCache = null;
    _waitingAsSpectator = false;
    _gqSyncFailed = false;
    _gqMyProg = _gqOppProg = 0;
    _revealAt = null;
    clearTimeout(_gameEndFallbackTimer);
    clearTimeout(_revealTimer);
    if (typeof window._hideVsWaitSpinner === 'function') window._hideVsWaitSpinner();
    _setupVsOpponent(match);

    window.VS.onOppLeft(_onOpponentAbandoned);
    // The opponent announced THEIR timer hit 0 (see reportGameEnd) — if I've
    // also finished mine, now the result can be shown.
    window.VS.onGameEnd(payload => {
      if (!payload || _resultShown) return;
      _oppGameEnded = true;
      _oppFinalScoreCache = payload.score || 0;
      if (payload.revealAt) _revealAt = payload.revealAt;
      // The opponent's time ran out (their timer ended) → shake + timer on
      // their card (same system as the 'wrong' flash).
      if (mode === 'shapes') window.shapesTriggerOpponentTimesUp?.();
      else if (mode === 'cities') window.citiesTriggerOpponentTimesUp?.();
      else if (mode === 'monuments') window.monumentsTriggerOpponentTimesUp?.();
      else window.flagsTriggerOpponentTimesUp?.();
      _tryShowVsResultWhenBothDone();
    });

    // Update the opponent's leaderboard per mode
    window.VS.onScore((hostScore, guestScore) => {
      const isHost   = window.VS.isHost();
      const oppScore = isHost ? guestScore : hostScore;
      if (mode === 'shapes') {
        if (typeof window.shapesSetVsOpponentScore === 'function') window.shapesSetVsOpponentScore(oppScore);
      } else if (mode === 'cities') {
        window.citiesSetVsOpponentScore?.(oppScore);
      } else if (mode === 'monuments') {
        window.monumentsSetVsOpponentScore?.(oppScore);
      } else if (mode === 'globequiz') {
        // No-op — GlobeQuiz has no numeric score, the opponent's progress
        // travels via the 'answer' broadcast (see VS.onAnswer below).
      } else {
        if (typeof window.flagsSetVsOpponentScore === 'function') window.flagsSetVsOpponentScore(oppScore);
      }
    });

    // Red flash on the opponent's leaderboard when they miss
    window.VS.onWrong(() => {
      if (mode === 'shapes') {
        if (typeof window.shapesTriggerOpponentWrong === 'function') window.shapesTriggerOpponentWrong();
      } else if (mode === 'cities') {
        window.citiesTriggerOpponentWrong?.();
      } else if (mode === 'monuments') {
        window.monumentsTriggerOpponentWrong?.();
      } else if (mode === 'globequiz') {
        // No-op — GlobeQuiz has no "wrong" concept with a flash, only guesses
        // closer/farther (see VS.onAnswer).
      } else {
        if (typeof window.flagsTriggerOpponentWrong === 'function') window.flagsTriggerOpponentWrong();
      }
    });

    // GlobeQuiz: opponent progress (km/dir) and instant win — see
    // "GlobeQuiz: instant win" above in this file.
    if (mode === 'globequiz') {
      window.VS.onAnswer(payload => {
        if (!payload) return;
        // The 'answer' broadcast also comes back to whoever sent it (echo
        // from the own Supabase Realtime channel) — without this filter, the
        // one who just won received their OWN win notice as if it were the
        // opponent's, and ended up seeing the "you lost"/timesup screen over
        // their own celebration (the reported "the winner gets the
        // game-over screen as if it were 1v1... and not the you-won panel").
        const myRole = window.VS.isHost() ? 'host' : 'guest';
        if (payload.role === myRole) return;
        if (payload.win) _handleGqOpponentWin(payload);
        else if (typeof payload.km === 'number') window.globequizSetVsOpponentGuess?.(payload.km);
      });
    }

    window.VS.onEnd(() => {
      _restoreRandom();
      _teardownVsOpponent();
    });

    // Start with seeded RNG → same questions for both
    _startSeededRandom(seed, mode);
    if (mode === 'shapes') {
      if (typeof showShapesMode === 'function') showShapesMode();
    } else if (mode === 'cities') {
      window.pendingGameMode = 'game';
      if (typeof startGame === 'function') startGame();
    } else if (mode === 'monuments') {
      if (typeof startGame === 'function') startGame();
    } else if (mode === 'globequiz') {
      document.getElementById('globequiz-screen').style.display = 'block';
      if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
      window.globequizVsPrepareOpponentRow?.();
      // Registered BEFORE initGlobeQuiz() (which triggers the async load of
      // three.js/GeoJSON) — see _gqReadySetup, so the 'ready' listener is
      // already hooked regardless of who loads first.
      _gqReadySetup();
      // The opponent announced their 3D globe didn't load → both return to the menu.
      window.VS.onGqAbort(() => _handleGqSyncFailed(true, { code: 'GLB-04', msg: 'El rival no pudo conectarse al duelo' }));
      // Sync panel: bar + each side's status + when it starts (sits over the
      // game screen loading behind it).
      _showGqSyncPanel();
      if (typeof window.initGlobeQuiz === 'function') window.initGlobeQuiz();
    } else {
      if (typeof showFlagsMode === 'function') showFlagsMode();
    }
  }

  // ── Listen for invites on login ──────────────────────────────────────────

  // Recovery of a duel channel that never got authorized (see
  // _onSubscribeError in the window.VS definition above) — registered ONCE
  // per session, not per match, because the failure can happen at any point
  // in the flow (waiting for the opponent to accept, loading the 3-2-1,
  // already playing). quitToMenu() already knows how to do EVERYTHING needed
  // when window._vsActive is true (calls _vsAbandon(), runs gameStoppers,
  // returns to the loading screen) — before this, a CHANNEL_ERROR left
  // _vsLaunching/_vsActive stuck true forever, with no error message,
  // blocking any new duel until manually reloading the page.
  window.VS.onSubscribeError((status) => {
    if (typeof window.showVersusToast === 'function') {
      const timedOut = status === 'TIMED_OUT';
      window.showVersusToast(
        timedOut ? 'Error de conexión: Timeout al conectar al duelo'
                 : 'Error de conexión: no se pudo conectar al duelo',
        { code: timedOut ? 'NET-02' : 'NET-01' }
      );
    }
    _hideOutgoingPopup();
    _hideIncomingPopup();
    _hideDuelAcceptedPopup();
    if (window._vsActive) {
      if (typeof window.quitToMenu === 'function') window.quitToMenu();
    } else {
      if (typeof window.VS.cleanup === 'function') window.VS.cleanup();
      _vsLaunching = false;
    }
  });

  window._vsStartListening = function() {
    window.VS.listenForInvites(
      match => _showIncomingPopup(match),
      m => {
        if (m && typeof window.removeVersusNotif === 'function') window.removeVersusNotif(m.id);
        if (typeof window.dismissInviteNotif === 'function') window.dismissInviteNotif();
      } // host cancelled / expired
    );
    // Immediate query for pending invites that arrived before connecting.
    // Only shown once per match (localStorage prevents it reappearing on reload).
    const uid = window._sbUserId;
    if (uid && window.sb) {
      window.sb.from('matches')
        .select('id, host_id, guest_id, status, seed')
        .eq('guest_id', uid).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => {
          if (!data || !data[0]) return;
          const match = data[0];
          const seenKey = '_seenMatchInvite_' + uid;
          const seen = JSON.parse(localStorage.getItem(seenKey) || '[]');
          if (seen.includes(match.id)) return; // already shown before
          seen.unshift(match.id);
          localStorage.setItem(seenKey, JSON.stringify(seen.slice(0, 10)));
          _showIncomingPopup(match);
        }).catch(() => {});
    }
  };

  // Accept a 1v1 invite directly from the inbox (without going through the banner)
  window._vsAcceptFromInbox = async function(matchId) {
    try {
      await window.VS.accept(matchId);
      const m = window.VS.getMatch();
      if (m) _scheduleVersusStart(m);
      else throw new Error('no match');
    } catch(e) {
      console.warn('[VS] inbox accept error:', e);
      if (typeof window.showVersusToast === 'function')
        window.showVersusToast(T('lobby.joinFailed', 'No pudiste unirte, intentá de nuevo'));
    }
  };

  // Expose functions for the map modes (js/modes/)
  window.showVersusPanel = showVersusPanel;
  window.hideVersusPanel = hideVersusPanel;
})();
