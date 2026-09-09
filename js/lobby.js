// ── LOBBY (group versus, up to 10 players) ─────────────────────────────────────
// Rooms for 2-to-10-player matches. Supports:
//   • Private: with a shareable code + friend invites.
//   • Public: appear in the open-rooms list (random).
// The HOST controls the room: sees the roster, kicks, and decides when to start.
// Everyone plays the SAME questions (seeded RNG, like 1v1) and competes on the
// live leaderboard. A ranking is shown at the end.

// ── Backend (Supabase) ────────────────────────────────────────────────────────
window.LB = (() => {
  let _lobbyId  = null;
  let _hostId   = null;
  let _channel  = null;
  let _members  = [];     // [{id, name, avatar, score, isHost, is_playing}]
  let _memberProfilesChannel = null;
  let _publicSignalCh = null;      // channel to SEND update signals to public-panel viewers (host)
  let _publicSignalChReady = false; // true when the channel is in the SUBSCRIBED state

  // Reconnect on returning from the background — browsers throttle a
  // background tab's timers (sometimes to 1/min), which the Realtime
  // library's heartbeat depends on to keep the WebSocket alive; if it's
  // delayed too long, the server may close the socket or this client's
  // presence appears to "drop" for the others (the reported "it kicked me
  // out of nowhere", same origin). Instead of waiting for Realtime to
  // notice on its own (may be slow or never happen), the channel state is
  // checked as soon as the tab returns to the foreground and a resubscribe
  // is forced if it's not actually connected.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!_lobbyId) return;
    if (!(_channel && _channel.state === 'joined')) _subscribe();
    // Start countdown: the countdown itself is already computed against the
    // real clock (until - Date.now()), not by counting ticks, so the
    // displayed NUMBER always self-corrects as soon as the setInterval fires
    // again. The problem is DIFFERENT: the actual match start
    // (window.LB.start()) is done only by the HOST, and can only happen
    // INSIDE that same _cdInterval — if the host's tab is backgrounded, the
    // browser may throttle that timer to well over 200ms, so start() isn't
    // called until the timer finally fires (could take a while) even though
    // everyone else's time is long past — the reported "it desyncs from the
    // rest": everyone else already hit 0 and is waiting for the lagging host
    // to finally start. Forcing the check NOW on returning to the
    // foreground avoids that wait.
    if (_counting && _cdTick) _cdTick();
  });

  // Sends a room-update to the public channel; if the channel isn't ready yet, retries for up to 3s
  function _sendRoomUpdate(payload) {
    if (!_publicSignalCh) return;
    if (_publicSignalChReady) { _publicSignalCh.send({ type: 'broadcast', event: 'room-update', payload }); return; }
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      if (_publicSignalChReady && _publicSignalCh) {
        _publicSignalCh.send({ type: 'broadcast', event: 'room-update', payload });
        clearInterval(iv);
      } else if (attempts >= 6) clearInterval(iv); // 6 × 500ms = 3s max
    }, 500);
  }
  let _lobby    = null;   // row from the lobbies table
  let _seed     = null;
  let _onMembers   = null;
  let _onStart     = null;
  let _onClosed    = null;  // I was kicked ('kicked') or the host closed it ('closed')
  let _onCountdown = null;  // host started the countdown
  let _onCancel    = null;  // the countdown was cancelled
  let _onNotReady  = null;  // someone flagged "not ready"
  let _onWrong      = null;  // someone missed a question → visual cue
  let _onVisibility = null;  // host switched the room public↔private
  let _onName       = null;  // host changed the room name
  let _onModes      = null;  // host changed the game mode
  let _onFinished   = null;  // a member finished their match → group-end coordination
  let _onReveal     = null;  // {revealAt, isFinal} — shared wall clock to show results to EVERYONE at once (see _checkAllFinished)
  let _onScore      = null;  // another member's live score → update leaderboard
  let _onPlayerGone = null;  // member lost presence during an active match
  let _onPlayerBack = null;  // member regained presence during an active match
  let _onAlone      = null;  // everyone else left during an active match → I'm alone
  let _aloneCalledThisGame = false; // guard: _onAlone fires only once per match
  // ── Round-by-round broadcast for GROUP spectator mode (see GroupSpectate
  // in spectate.js) — same mechanism VS already uses for 1v1 (reportRound/
  // reportTick/reportPregame/reportPostgame/reportAnswer), but here each
  // member sends THEIR own uid instead of a binary host/guest role, because
  // there can be up to 10 players in the same room. This didn't exist
  // before: _specReportRound/etc (spectate.js) had no branch for
  // window._lobbyActive, so a group spectator could only see the
  // accumulated score (lbscore), never each member's real round/board.
  let _onRound      = null;  // {uid, ...payload} — a member started a new round
  let _onTick       = null;  // {uid, timeLeft}
  let _onPregame    = null;  // {uid, ...payload} — a member's 3-2-1
  let _onPostgame   = null;  // {uid, ...payload} — a member's results
  let _onAnswer     = null;  // {uid, ...detail} — a member answered
  let _onTimesUp    = null;  // {uid}
  let _onSplash     = null;  // {uid, ...payload} — a member is on the instructions
  let _onAdvancing  = null;  // {uid} — a member confirmed leaving the postgame toward the next mode
  let _resubTime    = 0;     // timestamp of the last _subscribe(); guard against false kicks
  const _pendingKicks = new Set(); // members who disconnected during the match
  // uids whose NEXT presence 'leave' is expected/intentional (see
  // markExpectedLeave, called from _enterGroupWaitAsSpectator in lobby.js
  // right before releasing its own channel to spectate-on-loan the members
  // still playing) — without this, the 'leave' handler below treated that
  // temporary disconnect as if the member had ACTUALLY abandoned the match:
  // it added them to _pendingKicks, and _checkAllFinished() (window.Lobby)
  // subtracts pendingKicksCount from the total of people to wait for — with
  // a still-playing player subtracted from the total by mistake, the room
  // could end (show the ranking) BEFORE that player actually finished (the
  // reported "they had time left and it jumped straight to YOU WON").
  const _expectedLeaves = new Set();

  function _myId() { return window._sbUserId || null; }
  function isHost()      { return !!_hostId && _hostId === _myId(); }
  function getMembers()  { return _members; }
  function getLobby()    { return _lobby; }
  function getCode()     { return _lobby ? _lobby.code : null; }
  function getId()       { return _lobbyId; }
  function getSeed()     { return _seed; }

  function _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 (ambiguous)
    let c = '';
    for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  }

  // is_playing is only reliable if last_active is recent — if the flag got
  // stuck true (browser closed/crashed mid-match without the final UPDATE),
  // last_active stops updating and this treats it as "not playing" anyway.
  function _isActuallyPlaying(p) {
    if (!p || !p.is_playing || !p.last_active) return false;
    return (Date.now() - new Date(p.last_active)) / 1000 < 120;
  }

  async function _fetchMembers() {
    if (!_lobbyId) return;
    const { data, error } = await window.sb.from('lobby_members')
      .select('user_id, score, joined_at, p:user_id(username, avatar_url, is_playing, last_active, frame_code, card_code, cell_code)')
      .eq('lobby_id', _lobbyId).order('joined_at');
    if (error) { console.warn('[LB] fetchMembers:', error.message); return; }
    _members = (data || []).map(m => ({
      id:        m.user_id,
      name:      (m.p && m.p.username) || '?',
      avatar:    (m.p && m.p.avatar_url) || 'images/profilepic/ppdefault.png',
      score:     m.score || 0,
      isHost:    m.user_id === _hostId,
      is_playing: _isActuallyPlaying(m.p),
      joined_at: m.joined_at,
      // Each member's real customization (frame=pfp ring, card=in-game
      // leaderboard chip, cell=row background in the waiting room) — see
      // _renderMembers and buildFriendPlayers/buildFlagsFriendPlayers.
      frameCode: (m.p && m.p.frame_code) || '0001',
      cardCode:  (m.p && m.p.card_code)  || '0001',
      cellCode:  (m.p && m.p.cell_code)  || '0001',
    }));
    // If the room ended up completely empty (everyone left without notice), close it.
    if (_members.length === 0 && _lobbyId && !window._lobbyActive) {
      try { await window.sb.from('lobbies').update({ status: 'closed' }).eq('id', _lobbyId); } catch (e) {}
      cleanup();
      return;
    }
    // If I'm no longer among the members (and the match hasn't started) → I was kicked.
    const uid = _myId();
    if (uid && _lobbyId && !window._lobbyActive && !_members.some(m => m.id === uid)) {
      const cb = _onClosed; cleanup(); if (cb) cb('kicked');
      return;
    }
    if (_onMembers) _onMembers(_members);
    _subscribeToMemberProfiles();
  }

  function _subscribeToMemberProfiles() {
    if (_memberProfilesChannel) {
      try { window.sb.removeChannel(_memberProfilesChannel); } catch (e) {}
      _memberProfilesChannel = null;
    }
    const ids = _members.map(m => m.id).filter(Boolean);
    if (!ids.length || !_lobbyId) return;
    _memberProfilesChannel = window.sb
      .channel('lobby-profiles-' + _lobbyId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'profiles',
        filter: `id=in.(${ids.join(',')})`,
      }, (payload) => {
        const updated = payload.new;
        const m = _members.find(x => x.id === updated.id);
        if (!m) return;
        m.is_playing = _isActuallyPlaying(updated);
        if (_onMembers) _onMembers(_members);
      })
      .subscribe();
  }

  // Purges ANY channel (on this client) with the same topic 'lobby-{id}'
  // still registered — not just our own _channel reference. GroupSpectate
  // (spectate.js) subscribes to the SAME topic while this player spectates
  // on loan (see _enterGroupWaitAsSpectator in this file); even calling
  // GroupSpectate.stop()→removeChannel() and awaiting its promise,
  // supabase-js can be slow to reflect the removal in its internal channel
  // registry — if _subscribe() creates a new channel for that same topic
  // BEFORE the registry is actually cleared, the SDK returns the OLD
  // instance (already subscribed once) instead of a new one, and any
  // `.on('postgres_changes', ...)` on it blows up ("cannot add
  // postgres_changes callbacks ... after subscribe()") — leaving the
  // channel broken for the rest of the mode (scores/wrong never reached
  // anyone, reported). EVERYTHING matching the topic is purged, with a
  // brief retry, before creating the real channel.
  async function _purgeStaleChannel(lid) {
    const topic = 'realtime:lobby-' + lid;
    for (let attempt = 0; attempt < 10; attempt++) {
      const stale = (typeof window.sb.getChannels === 'function' ? window.sb.getChannels() : [])
        .filter(c => c && c.topic === topic);
      if (!stale.length) return;
      await Promise.all(stale.map(c => { try { return window.sb.removeChannel(c); } catch (e) { return Promise.resolve(); } }));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  async function _subscribe() {
    if (_channel) { try { await window.sb.removeChannel(_channel); } catch (e) {} _channel = null; }
    await _purgeStaleChannel(_lobbyId);
    // Subscribe to the public channel to be able to emit update signals to viewers
    if (_publicSignalCh) { try { _publicSignalCh.unsubscribe(); } catch(e) {} }
    // Different name from 'public-lobbies-watch' so it doesn't interfere with the viewer's _publicChannel
    _publicSignalCh = window.sb.channel('pub-room-signals', { config: { broadcast: { self: false } } })
      .subscribe((status) => { if (status === 'SUBSCRIBED') _publicSignalChReady = true; });
    _publicSignalChReady = false;
    _resubTime = Date.now();
    const lid = _lobbyId;
    const uid = _myId();
    _channel = window.sb.channel('lobby-' + lid, { config: { broadcast: { self: true }, presence: { key: uid || 'anon' } } })
      // See the long comment in markExpectedLeave — must be registered BEFORE
      // the real presence 'leave' for that same uid arrives.
      .on('broadcast', { event: 'expectleave' }, ({ payload }) => { if (payload && payload.uid) _expectedLeaves.add(payload.uid); })
      // Synced countdown (ephemeral, doesn't touch the DB)
      .on('broadcast', { event: 'cd' },       ({ payload }) => { if (_onCountdown) _onCountdown(payload || {}); })
      .on('broadcast', { event: 'cancel' },   () => { if (_onCancel) _onCancel(); })
      .on('broadcast', { event: 'notready' }, ({ payload }) => { if (_onNotReady) _onNotReady(payload || {}); })
      .on('broadcast', { event: 'wrong' },      ({ payload }) => { if (_onWrong) _onWrong(payload?.uid || null); })
      .on('broadcast', { event: 'visibility' }, ({ payload }) => {
        if (_lobby) _lobby.is_public = !!payload?.isPublic;
        if (_onVisibility) _onVisibility(payload?.isPublic);
      })
      .on('broadcast', { event: 'name' }, ({ payload }) => {
        if (_lobby) _lobby.name = payload?.name || _lobby.name;
        if (_onName) _onName(payload?.name);
      })
      .on('broadcast', { event: 'modes' }, ({ payload }) => {
        if (_lobby && payload) {
          if (payload.mode)  _lobby.mode  = payload.mode;
          if (payload.modes !== undefined) _lobby.modes = payload.modes;
        }
        if (_onModes) _onModes(payload?.modes || [payload?.mode || 'flags'], !!payload?.changed);
      })
      .on('broadcast', { event: 'finished' }, ({ payload }) => {
        if (_onFinished) _onFinished(payload?.uid, payload?.score);
      })
      // Shared wall clock for the round-end ranking — see the long comment
      // in _checkAllFinished/lobby.js. Without this, each client presented
      // the result as soon as it FOUND OUT (locally) that everyone finished,
      // and whoever found out via a slower path (e.g. a spectator on loan,
      // with more hops in between) saw it late — the reported "it worked
      // before, adding the spectator broke it".
      .on('broadcast', { event: 'reveal' }, ({ payload }) => {
        if (_onReveal && payload && typeof payload.revealAt === 'number') _onReveal(payload.revealAt, !!payload.isFinal);
      })
      .on('broadcast', { event: 'lbscore' }, ({ payload }) => {
        if (_onScore && payload?.uid !== _myId()) _onScore(payload?.uid, payload?.score ?? 0);
      })
      // See the long comment on the _on* declared above — same mechanism as
      // VS (vs.js) but tagged by uid instead of host/guest role, so
      // GroupSpectate (spectate.js) can show ANY member's real board, not
      // just their accumulated score.
      .on('broadcast', { event: 'round' },     ({ payload }) => { if (payload && _onRound) _onRound(payload); })
      .on('broadcast', { event: 'gtick' },     ({ payload }) => { if (payload && _onTick) _onTick(payload); })
      .on('broadcast', { event: 'pregame' },   ({ payload }) => { if (payload && _onPregame) _onPregame(payload); })
      .on('broadcast', { event: 'postgame' },  ({ payload }) => { if (payload && _onPostgame) _onPostgame(payload); })
      .on('broadcast', { event: 'ganswer' },   ({ payload }) => { if (payload && _onAnswer) _onAnswer(payload); })
      .on('broadcast', { event: 'timesup' },   ({ payload }) => { if (payload && _onTimesUp) _onTimesUp(payload); })
      .on('broadcast', { event: 'splash' },    ({ payload }) => { if (payload && _onSplash) _onSplash(payload); })
      .on('broadcast', { event: 'advancing' }, ({ payload }) => { if (payload && _onAdvancing) _onAdvancing(payload); })
      // Any member change (join/leave/score) → re-query the room. _fetchMembers
      // detects if I was kicked (no longer in the list). We don't filter by
      // lobby_id on the client because the DELETE payload doesn't always carry the columns.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, () => {
        _fetchMembers();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lobbies',
        filter: 'id=eq.' + lid }, payload => {
        if (!payload.new) return;
        _hostId = payload.new.host_id;
        _lobby  = payload.new;
        // Only launch the game if the seed changed (a host_id change must not relaunch)
        if (payload.new.status === 'active' && _onStart && payload.new.seed !== _seed) { _seed = payload.new.seed; _onStart(payload.new); }
        else if (payload.new.status === 'closed' && _onClosed) { const cb = _onClosed; cleanup(); cb('closed'); }
        else { _fetchMembers(); } // host (or another field) changed → re-render with the new host
      })
      // Presence: if someone refreshes or closes the tab, their presence "drops".
      // key.indexOf('spectator-')===0: an external SPECTATOR (GroupSpectate,
      // see spectate.js) disconnected/switched rooms — never a real member
      // of THIS room. Without this filter, closing a spectator session fired
      // all the "a member left" logic (kick, host inheritance, "I'm alone"
      // check) as if a real PLAYER had abandoned — a bug exposed only now
      // that spectators share this same 'lobby-{id}' channel.
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!key || key === uid || key.indexOf('spectator-') === 0) return;
        if (_expectedLeaves.delete(key)) return; // intentional disconnect (see markExpectedLeave) — not a real abandonment
        clearTimeout(_graceTimers[key]);
        if (window._lobbyActive || window._lobbyInTransition) {
          // ACTIVE_GAME_GRACE_MS (not 300ms) before treating this as a real
          // abandonment. This margin used to be only 300ms — meant just for
          // the network race of the 'expectleave' broadcast (see
          // markExpectedLeave, intentional disconnect when switching to
          // spectate on loan) — but that also left NO real margin for a
          // simple presence blip from wifi or the tab backgrounding (browser
          // throttling delays the Realtime heartbeat): a player who
          // minimizes and returns a few seconds later would reconnect only
          // AFTER this timeout had already committed them to _pendingKicks —
          // left "kicked out of nowhere" and spectating forever, with no way
          // back into the match (reported). Storing the timer in
          // _graceTimers (like the waiting room) lets the 'join' handler
          // below cancel it if the 'join' arrives in time.
          _graceTimers[key] = setTimeout(() => {
            if (_expectedLeaves.delete(key)) return; // arrived late but arrived — not a real abandonment
            delete _graceTimers[key];
            _pendingKicks.add(key);
            if (_onPlayerGone) _onPlayerGone(key);
            // If the HOST left, promote the heir (same algorithm as _handleMemberGone)
            if (key === _hostId) {
              const myId2 = _myId();
              const heir = _members.find(m => m.id !== key && !_pendingKicks.has(m.id));
              if (heir && heir.id === myId2) {
                // Only the heir does the UPDATE to avoid race conditions
                _hostId = myId2;
                window.sb.from('lobbies').update({ host_id: myId2 }).eq('id', _lobbyId).then(() => {}).catch(() => {});
              }
            }
            // Check if I'm alone — two complementary methods:
            // 1) presenceState: the presence key IS the uid, use Object.keys directly
            const state = _channel?.presenceState?.() || {};
            const presentNow = new Set(Object.keys(state));
            presentNow.delete(key); // already left
            presentNow.delete(uid); // I don't count myself
            // 2) pendingKicks as fallback: everyone else already on the drop list
            const myId = _myId();
            const othersKicked = _members.length > 0 && _members.filter(m => m.id !== myId)
              .every(m => m.id === key || _pendingKicks.has(m.id));
            if (!_aloneCalledThisGame && (presentNow.size === 0 || othersKicked)) {
              _aloneCalledThisGame = true;
              if (_onAlone) _onAlone();
            }
          }, ACTIVE_GAME_GRACE_MS);
          return;
        }
        _graceTimers[key] = setTimeout(() => _handleMemberGone(key), GRACE_MS);
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (!key || key === uid || key.indexOf('spectator-') === 0) return;
        if (_graceTimers[key]) { clearTimeout(_graceTimers[key]); delete _graceTimers[key]; }
        // Safety net: if the 'join' arrives late (the kick was already
        // committed to _pendingKicks before they reconnected), remove them
        // anyway — they came back, so they weren't really gone.
        _pendingKicks.delete(key);
        if (window._lobbyActive && _onPlayerBack) _onPlayerBack(key);
      })
      // Room-wide GLOBAL spectator counter — in a group, spectated players
      // are treated as global: the "you're being spectated" symbol appears
      // on ALL members equally while there's at least one spectator watching
      // the room, and disappears on all when they leave. Every 'spectator-*'
      // presence key is counted, without filtering by who they watch
      // (previously filtered by pov===my uid, which also forced the
      // spectator to re-track on every POV change — that disconnected the
      // channel, see GroupSpectate). Now the spectator tracks its presence
      // ONCE and touches nothing else on a POV change.
      .on('presence', { event: 'sync' }, () => {
        try { _applySpectatorBadge(); } catch (e) {}
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        try { await _channel.track({ uid: uid, t: Date.now() }); } catch (e) {}
        // Give 5s for everyone connected to track presence, then purge the absent
        const snapLobbyId = _lobbyId;
        setTimeout(async () => {
          if (!_channel || _lobbyId !== snapLobbyId || window._lobbyActive) return;
          const state = _channel.presenceState();
          const presentIds = new Set(Object.values(state).flat().map(p => p.uid).filter(Boolean));
          if (!presentIds.size) return; // presence not received yet
          // Exclude anyone who joined very recently (< 10s): their presence
          // may not have reached THIS client's snapshot YET (propagation
          // isn't instant, and this check can be triggered by a
          // re-subscription of THIS client — e.g. returning from the
          // background — just as someone else is joining) — without this
          // margin, a friend joining at that instant could be marked
          // "absent" and kicked from the room within a second of joining
          // (reported).
          const now = Date.now();
          const absent = _members.filter(m => {
            if (m.id === uid || presentIds.has(m.id)) return false;
            const joinedMs = m.joined_at ? new Date(m.joined_at).getTime() : 0;
            return !joinedMs || (now - joinedMs) > 10000;
          });
          if (!absent.length) return;
          await Promise.all(absent.map(m =>
            Promise.resolve(window.sb.from('lobby_members').delete()
              .eq('lobby_id', snapLobbyId).eq('user_id', m.id)).catch(() => {})
          ));
          _fetchMembers();
        }, 5000);
      });
  }

  // Cleanup on disconnect (refresh/tab close) during the wait.
  const GRACE_MS = 5000;
  // Longer margin specific to a 'leave' DURING the match (see the presence
  // 'leave' handler above) — must survive the typical throttling of a
  // minimized tab reconnecting its Realtime WebSocket, not just the network
  // race of the 'expectleave' broadcast.
  const ACTIVE_GAME_GRACE_MS = 8000;
  const _graceTimers = {};
  async function _handleMemberGone(goneId) {
    delete _graceTimers[goneId];
    if (window._lobbyActive) { _pendingKicks.add(goneId); return; } // presence.leave already handled it
    if (!_lobbyId) return;
    if (!_lobby || _lobby.status !== 'waiting') return;
    // Don't kick during the start countdown (sendCountdown, 10s before
    // going 'active') — a simple presence blip (wifi, tab backgrounding and
    // throttling the heartbeat) of barely more than GRACE_MS was enough for
    // the host to ACTUALLY delete them from lobby_members even though their
    // real connection was fine and came back right away (the reported "it
    // kicked me out of nowhere mid-countdown"). Retry the same check later
    // instead of deciding now — when the countdown ends (match starts →
    // _lobbyActive catches it above; or it's cancelled → back to the normal
    // wait flow) this resolves itself with the usual criterion.
    if (window._lobbyCountingDown) {
      _graceTimers[goneId] = setTimeout(() => _handleMemberGone(goneId), GRACE_MS);
      return;
    }
    if (Date.now() - _resubTime < 9000) return;            // ignore false drops post-resubscription
    // If the member has active presence, they rejoined before the timer expired → don't kick
    if (_channel) {
      const ps = _channel.presenceState?.() || {};
      if (ps[goneId] && ps[goneId].length > 0) return;
    }
    const present = _members.map(m => m.id);
    if (!present.includes(goneId)) return;                  // already gone (another process removed them)
    if (goneId === _hostId) {
      // The HOST left: promoted by the earliest-joined live member (excluding the one gone).
      const heir = _members.filter(m => m.id !== goneId)[0];
      if (heir && heir.id === _myId()) {
        try {
          await window.sb.from('lobbies').update({ host_id: _myId() }).eq('id', _lobbyId);
          await window.sb.from('lobby_members').delete().eq('lobby_id', _lobbyId).eq('user_id', goneId);
        } catch (e) {}
      } else if (!heir) {
        // no one alive left → close it (anyone attempts it)
        try { await window.sb.from('lobbies').update({ status: 'closed' }).eq('id', _lobbyId); } catch (e) {}
      }
    } else if (isHost()) {
      // A normal member left: the host removes them.
      try {
        await window.sb.from('lobby_members').delete().eq('lobby_id', _lobbyId).eq('user_id', goneId);
        _fetchMembers(); // force immediate re-render without waiting for postgres_changes
      } catch (e) {}
    }
  }

  // Deletes/closes abandoned rooms:
  //  • my previous "waiting" ones (one host = max 1 waiting room)
  //  • any global "waiting" more than 2h without starting
  //  • any global "active" more than 45 min (zombie match from a tab close)
  async function _cleanupStale() {
    const uid = _myId();
    const cutoff30m = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const cutoff45m = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    try {
      // Delete my own old rooms — RLS always allows it
      if (uid) {
        let q = window.sb.from('lobbies').delete().eq('host_id', uid).in('status', ['waiting', 'closed', 'active']);
        if (_lobbyId) q = q.neq('id', _lobbyId);
        await q;
        // Delete my own terminal matches (with the same 30-min cutoff as the
        // global fallback below, so as not to destroy recent history right
        // when the next room is created — stat counts no longer depend on
        // this table, but it's best not to be more aggressive than needed).
        await window.sb.from('matches').delete().eq('player1_id', uid)
          .in('status', ['abandoned', 'declined', 'expired', 'finished', 'cancelled'])
          .lt('created_at', cutoff30m);
        await window.sb.from('matches').delete().eq('player2_id', uid)
          .in('status', ['abandoned', 'declined', 'expired', 'finished', 'cancelled'])
          .lt('created_at', cutoff30m);
      }
      // Attempt global deletion via RPC (SECURITY DEFINER, bypasses RLS)
      try { await window.sb.rpc('cleanup_stale_lobbies'); } catch (_) {}
      // Direct lobbies fallback (may fail due to RLS on others' rooms)
      await window.sb.from('lobbies').delete().in('status', ['waiting', 'closed']).lt('created_at', cutoff30m);
      // Very old active rooms → close
      await window.sb.from('lobbies').update({ status: 'closed' }).eq('status', 'active').lt('created_at', cutoff45m);
      // Terminal or very old active matches (global, may fail due to RLS)
      await window.sb.from('matches').delete()
        .in('status', ['abandoned', 'declined', 'expired', 'finished', 'cancelled'])
        .lt('created_at', cutoff30m);
      await window.sb.from('matches').update({ status: 'abandoned' })
        .eq('status', 'active').lt('created_at', cutoff45m);
    } catch (e) {}
  }

  async function create(isPublic) {
    const uid = _myId();
    if (!uid) throw new Error('not logged in');
    await _cleanupStale();
    const { data, error } = await window.sb.from('lobbies')
      .insert({ host_id: uid, code: _genCode(), is_public: !!isPublic, mode: 'flags', status: 'waiting', max_players: 10 })
      .select().single();
    if (error) throw error;
    _lobbyId = data.id; _hostId = uid; _lobby = data; _seed = null;
    await window.sb.from('lobby_members').insert({ lobby_id: _lobbyId, user_id: uid, score: 0 });
    // We don't store a localized name in the DB: it's built from i18n at display time (lobby.roomName)
    _subscribe();
    await _fetchMembers();
    return data;
  }

  // Restores a waiting room I'm still a member of (after reload/return).
  async function restoreActive() {
    const uid = _myId();
    if (!uid || _lobbyId) return null;
    const { data, error } = await window.sb.from('lobby_members')
      .select('lobby_id, l:lobby_id(*)').eq('user_id', uid).limit(10);
    if (error) return null;
    const row = (data || []).find(r => r.l && r.l.status === 'waiting');
    if (!row) return null;
    const lobby = row.l;
    _lobbyId = lobby.id; _hostId = lobby.host_id; _lobby = lobby; _seed = null;
    _subscribe();
    await _fetchMembers();
    return lobby;
  }

  // On (re)login: clean up waiting rooms I hosted in a previous session
  // (e.g. I refreshed the page). If they had people, transfer the host; if not, close.
  async function cleanupMine() {
    const uid = _myId();
    if (!uid) return;
    try {
      const { data: hosted } = await window.sb.from('lobbies')
        .select('id').eq('host_id', uid).eq('status', 'waiting');
      for (const lob of (hosted || [])) {
        const { data: mems } = await window.sb.from('lobby_members')
          .select('user_id, joined_at').eq('lobby_id', lob.id).order('joined_at');
        const others = (mems || []).filter(m => m.user_id !== uid);
        if (others.length) await window.sb.from('lobbies').update({ host_id: others[0].user_id }).eq('id', lob.id);
        else               await window.sb.from('lobbies').update({ status: 'closed' }).eq('id', lob.id);
        await window.sb.from('lobby_members').delete().eq('lobby_id', lob.id).eq('user_id', uid);
      }
    } catch (e) {}
  }

  async function setPublic(isPublic) {
    if (!isHost() || !_lobbyId) return;
    try {
      await window.sb.from('lobbies').update({ is_public: !!isPublic }).eq('id', _lobbyId);
      if (_lobby) _lobby.is_public = !!isPublic;
      sendVisibility(!!isPublic);
      _sendRoomUpdate({ id: _lobbyId });
    } catch (e) {}
  }
  function isPublic() { return !!(_lobby && _lobby.is_public); }

  async function setName(name) {
    if (!isHost() || !_lobbyId) return;
    try {
      await window.sb.from('lobbies').update({ name: name }).eq('id', _lobbyId);
      if (_lobby) _lobby.name = name;
      sendName(name);
      _sendRoomUpdate({ id: _lobbyId, name });
    } catch (e) {}
  }
  function getName() { return (_lobby && _lobby.name) || ''; }

  async function joinByCode(code) {
    if (!_myId()) throw new Error('not logged in');
    const { data, error } = await window.sb.from('lobbies')
      .select('*').eq('code', (code || '').toUpperCase())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) throw new Error('not_found');
    if (data.status !== 'waiting') throw new Error('started');
    return _joinLobby(data);
  }

  async function joinById(id) {
    const { data, error } = await window.sb.from('lobbies')
      .select('*').eq('id', id).eq('status', 'waiting').maybeSingle();
    if (error || !data) throw new Error('not found');
    return _joinLobby(data);
  }

  async function _joinLobby(lobby) {
    const uid = _myId();
    const { count } = await window.sb.from('lobby_members')
      .select('*', { count: 'exact', head: true }).eq('lobby_id', lobby.id);
    if (count != null && count >= (lobby.max_players || 10)) throw new Error('full');
    _lobbyId = lobby.id; _hostId = lobby.host_id; _lobby = lobby; _seed = null;
    await window.sb.from('lobby_members').upsert({ lobby_id: lobby.id, user_id: uid, score: 0 });
    _subscribe();
    await _fetchMembers();
    return lobby;
  }

  async function leave() {
    const uid = _myId();
    const lid = _lobbyId;
    if (!lid) return;
    const wasHost = isHost();
    // The earliest-joined among those remaining (members come ordered by joined_at)
    const heir = _members.filter(m => m.id !== uid)[0] || null;
    cleanup(); // clear local state NOW: hides "My room" without waiting for the network
    try {
      if (wasHost) {
        if (heir) await window.sb.from('lobbies').update({ host_id: heir.id }).eq('id', lid); // transfer host
        else      await window.sb.from('lobbies').update({ status: 'closed' }).eq('id', lid);  // empty room → close
      }
      await window.sb.from('lobby_members').delete().eq('lobby_id', lid).eq('user_id', uid);
    } catch (e) {}
  }

  // Transfer the host to another member (manual, 👑 button)
  async function transferHost(userId) {
    if (!isHost() || !_lobbyId || userId === _myId()) return;
    try {
      await window.sb.from('lobbies').update({ host_id: userId }).eq('id', _lobbyId);
      _hostId = userId; if (_lobby) _lobby.host_id = userId;
      _fetchMembers();
    } catch (e) {}
  }

  async function kick(userId) {
    if (!isHost() || !_lobbyId) return;
    try { await window.sb.from('lobby_members').delete().eq('lobby_id', _lobbyId).eq('user_id', userId); } catch (e) {}
    _fetchMembers();
  }

  async function start() {
    if (!isHost() || !_lobbyId) return;
    if (_members.length < 2) return; // need at least 2
    const seed = Math.floor(Math.random() * 1_000_000);
    await window.sb.from('lobbies').update({ status: 'active', seed }).eq('id', _lobbyId);
    _sendRoomUpdate({ id: _lobbyId, started: true });
    // The host itself starts via the realtime UPDATE, like everyone else.
  }

  async function reportScore(score) {
    if (!_lobbyId) return;
    try { await window.sb.from('lobby_members').update({ score }).eq('lobby_id', _lobbyId).eq('user_id', _myId()); } catch (e) {}
  }

  // Counts GLOBAL spectators ('spectator-*' presence keys) and applies the
  // "you're being spectated" badge. Called on every presence 'sync' AND
  // explicitly when each mode starts (refreshSpectatorCount, below) —
  // because refreshVsSpectatorBadge points at the ACTIVE mode's badge, and
  // on a mode transition there's no 'sync' to reapply it, so the new mode's
  // badge started off even if there were spectators (reported, "the symbol
  // is removed on every transition").
  function _applySpectatorBadge() {
    if (!_channel) return;
    const state = _channel.presenceState();
    let n = 0;
    Object.keys(state).forEach(k => { if (k.indexOf('spectator-') === 0) n++; });
    if (typeof window.refreshVsSpectatorBadge === 'function') window.refreshVsSpectatorBadge(n);
  }

  // ── Ephemeral broadcast (countdown / not ready) ───────────────────────────────
  function _bcast(event, payload) {
    // Returns the send() promise (instead of fire-and-forget) — needed for
    // markExpectedLeave/'expectleave', which must finish being queued on the
    // socket BEFORE releaseChannel() unsubscribes it (see the long comment
    // there). For every other _bcast use (which never awaits the result),
    // nothing changes.
    if (_channel) { try { return _channel.send({ type: 'broadcast', event, payload: payload || {} }); } catch (e) { return Promise.resolve(); } }
    return Promise.resolve();
  }
  function sendCountdown(until) { _bcast('cd', { until }); }
  function sendCancel()         { _bcast('cancel'); }
  function sendNotReady(name)   { _bcast('notready', { name }); }
  function sendWrong()          { _bcast('wrong', { uid: _myId() }); }
  function sendVisibility(pub)  { _bcast('visibility', { isPublic: !!pub }); }
  function sendName(name)       { _bcast('name', { name }); }
  function sendFinished(score)  { _bcast('finished', { uid: _myId(), score }); }
  function sendReveal(revealAt, isFinal) { _bcast('reveal', { revealAt, isFinal: !!isFinal }); }
  function sendScore(score)     { _bcast('lbscore',  { uid: _myId(), score }); }
  function sendModes(modes, changed = true) { _bcast('modes', { modes, mode: modes && modes.length > 1 ? modes.join('+') : ((modes && modes[0]) || 'flags'), changed: !!changed }); }

  // ── Persisted live state (see group_live_state.sql) ───────────────────────
  // Same mechanism as _persistLiveState in vs.js (1v1): without this, a
  // spectator just connecting to GroupSpectate OR switching POV with the
  // arrows had no way to know what phase EACH member is in until their NEXT
  // live broadcast arrived — left seeing nothing/stale until that person did
  // something (the reported "it only works once they do an action, it has
  // to be instant like in 1v1").
  let _lastPhase          = null; // 'round' | 'pregame' | 'postgame' | 'splash' | 'timesup'
  let _lastRoundPayload   = null;
  let _lastPregamePayload = null;
  let _lastPostgamePayload = null;
  // Deliberately separate from _lastPhase — see the long comment in
  // _persistLiveState. sendPostgame() is ALSO used for the WHOLE room's
  // ranking (kind:'intermediate'/'final', see _showLobbyResult), sent AFTER
  // my own sendTimesUp() — if "finished" derived from `_lastPhase ===
  // 'timesup'` on every persist, THAT later sendPostgame overwrote
  // _lastPhase to 'postgame' and the just-saved finished:true went back to
  // false in the DB, right when the backup poll (_startGroupWaitPoll in
  // lobby.js) needed it most — the "they stay frozen, the panel never
  // shows" kept happening even with the poll added.
  let _finishedFlag = false;
  function _persistLiveState() {
    if (!_lobbyId) return;
    // finished:true is what lets GroupSpectate (spectate.js _fetchMembers)
    // AND the backup poll (lobby.js) know, from a single REST query, that
    // this member has NOTHING left to spectate until the next mode —
    // without this, if the ephemeral 'timesup' broadcast was lost
    // (reconnection window when entering/leaving spectate-on-loan, see
    // _enterGroupWaitAsSpectator in lobby.js), another spectator's arrows
    // kept offering to watch them indefinitely (the reported "it still lets
    // them switch to POVs of people who already finished").
    const snapshot = {
      phase: _lastPhase, round: _lastRoundPayload, pregame: _lastPregamePayload, postgame: _lastPostgamePayload,
      finished: _finishedFlag, ts: Date.now(),
    };
    window.sb.from('lobby_members').update({ live_state: snapshot }).eq('lobby_id', _lobbyId).eq('user_id', _myId()).then(() => {}, () => {});
  }

  // ── Round-by-round broadcast for GroupSpectate (see the _on* above) ───────────
  // Same pattern as VS.reportRound/reportTick/etc (vs.js), but tagged by uid
  // instead of role — any member may be being watched.
  function sendRound(payload)     { _lastPhase = 'round'; _lastRoundPayload = payload; _finishedFlag = false; _bcast('round', { uid: _myId(), ...(payload || {}) }); _persistLiveState(); }
  function sendTick(timeLeft)     { _bcast('gtick',      { uid: _myId(), timeLeft }); }
  function sendPregame(payload)   { _lastPhase = 'pregame'; _lastPregamePayload = payload || {}; _finishedFlag = false; _bcast('pregame', { uid: _myId(), ...(payload || {}) }); _persistLiveState(); }
  // Does NOT touch _finishedFlag — see the long comment above (sendPostgame
  // also carries the room ranking, sent AFTER finishing).
  function sendPostgame(payload)  {
    _lastPhase = 'postgame'; _lastPostgamePayload = payload;
    const full = { uid: _myId(), ...(payload || {}) };
    _bcast('postgame', full);
    _persistLiveState();
    // The room ranking (kind intermediate/final) is the ONLY thing that
    // tells the EXTERNAL spectator to show the table — and they get it via a
    // single broadcast. If the spectator's channel had a blip at that
    // instant, they lost it and stayed FROZEN with no table (reported,
    // "that time it wasn't shown"). Players don't depend on this (they
    // compute their local result). Resending it a couple more times greatly
    // raises the chance it arrives, without complex fallback logic.
    if (payload && (payload.kind === 'intermediate' || payload.kind === 'final')) {
      setTimeout(() => _bcast('postgame', full), 500);
      setTimeout(() => _bcast('postgame', full), 1500);
    }
  }
  function sendAnswer(detail)     { _bcast('ganswer',    { uid: _myId(), ...(detail || {}) }); }
  function sendTimesUp()          { _lastPhase = 'timesup'; _finishedFlag = true; _bcast('timesup', { uid: _myId() }); _persistLiveState(); }
  function sendSplash(payload)    { _lastPhase = 'splash'; _finishedFlag = false; _bcast('splash', { uid: _myId(), ...(payload || {}) }); _persistLiveState(); }
  function sendAdvancing()        { _bcast('advancing', { uid: _myId() }); }

  async function setModes(modes) {
    if (!isHost() || !_lobbyId) return;
    const mode = (modes && modes[0]) || 'flags';
    // Encode the list in `mode` as "flags+shapes" — persists even if the `modes` column doesn't exist
    const modeEncoded = modes && modes.length > 1 ? modes.join('+') : mode;
    // Supabase returns { error } instead of throwing — must be checked explicitly
    const { error } = await window.sb.from('lobbies').update({ mode: modeEncoded, modes }).eq('id', _lobbyId);
    if (error) {
      // `modes` column doesn't exist (42703) or another error → only update `mode`
      await window.sb.from('lobbies').update({ mode: modeEncoded }).eq('id', _lobbyId);
    }
    // Local state and broadcast always, even if the DB fails
    if (_lobby) { _lobby.mode = modeEncoded; _lobby.modes = modes; }
    sendModes(modes);
    _sendRoomUpdate({ id: _lobbyId });
  }

  function getModes() {
    if (!_lobby) return ['flags'];
    if (_lobby.modes) {
      const arr = Array.isArray(_lobby.modes) ? _lobby.modes : String(_lobby.modes).split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) return arr;
    }
    if (!_lobby.mode) return ['flags'];
    if (_lobby.mode.includes('+')) return _lobby.mode.split('+').map(s => s.trim()).filter(Boolean);
    return [_lobby.mode];
  }

  // ── Push invite to a friend (broadcast to their personal channel) ─────────────
  function sendInvite(toUser, payload) {
    if (!toUser) return;
    const ch = window.sb.channel('lobbyinv-' + toUser);
    ch.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'invite', payload: payload || {} })
          .finally(() => setTimeout(() => { try { ch.unsubscribe(); } catch (e) {} }, 1500));
      }
    });
  }

  let _inviteChannel = null;
  function listenForInvites(onInvite) {
    const uid = _myId();
    if (!uid) return;
    if (_inviteChannel) _inviteChannel.unsubscribe();
    _inviteChannel = window.sb.channel('lobbyinv-' + uid)
      .on('broadcast', { event: 'invite' }, ({ payload }) => { if (onInvite) onInvite(payload || {}); })
      .subscribe();
  }

  async function listPublic() {
    _cleanupStale().catch(() => {}); // close zombie rooms in the background
    let lobbies = null, error = null;
    ({ data: lobbies, error } = await window.sb.from('lobbies')
      .select('id, code, name, host_id, max_players, mode, modes, created_at')
      .eq('is_public', true).eq('status', 'waiting')
      .order('created_at', { ascending: false }).limit(30));
    // Fallback: if a column doesn't exist in the schema
    if (error && error.code === '42703') {
      ({ data: lobbies, error } = await window.sb.from('lobbies')
        .select('id, code, host_id, max_players, mode, created_at')
        .eq('is_public', true).eq('status', 'waiting')
        .order('created_at', { ascending: false }).limit(30));
    }
    if (error) { console.warn('[LB] listPublic:', error.message); return []; }
    if (!lobbies || !lobbies.length) return [];
    const ids = lobbies.map(l => l.id);
    const counts = {};
    const hostNames = {};
    try {
      const { data: mems } = await window.sb.from('lobby_members').select('lobby_id').in('lobby_id', ids);
      (mems || []).forEach(m => { counts[m.lobby_id] = (counts[m.lobby_id] || 0) + 1; });
    } catch (e) {}
    try {
      const hostIds = [...new Set(lobbies.map(l => l.host_id))];
      const { data: hosts } = await window.sb.from('profiles').select('id, username').in('id', hostIds);
      (hosts || []).forEach(h => { hostNames[h.id] = h.username; });
    } catch (e) {}
    const result = lobbies.map(l => ({
      id: l.id, code: l.code, name: l.name ?? '',
      hostName: hostNames[l.host_id] || '?',
      count: counts[l.id] || 0,
      max: l.max_players || 10,
      mode: l.mode || 'flags', modes: l.modes || null,
    }));
    // Silently delete empty rooms (everyone disconnected without closing)
    const emptyIds = result.filter(l => l.count === 0).map(l => l.id);
    if (emptyIds.length) Promise.resolve(window.sb.from('lobbies').delete().in('id', emptyIds)).catch(() => {});
    return result.filter(l => l.count > 0 && l.count < l.max);
  }

  function cleanup() {
    window._lobbyCountingDown = false;
    if (_memberProfilesChannel) { try { window.sb.removeChannel(_memberProfilesChannel); } catch (e) {} _memberProfilesChannel = null; }
    if (_channel) { try { window.sb.removeChannel(_channel); } catch (e) {} _channel = null; }
    if (_publicSignalCh) { try { window.sb.removeChannel(_publicSignalCh); } catch(e) {} _publicSignalCh = null; _publicSignalChReady = false; }
    Object.values(_graceTimers).forEach(clearTimeout);
    for (const k in _graceTimers) delete _graceTimers[k];
    _pendingKicks.clear();
    _aloneCalledThisGame = false;
    _lobbyId = _hostId = _lobby = _seed = null;
    _members = [];
    _onMembers = _onStart = _onClosed = _onCountdown = _onCancel = _onNotReady = _onWrong = _onVisibility = _onName = _onModes = _onFinished = _onScore = _onPlayerGone = _onPlayerBack = _onAlone = null;
  }

  // Releases ONLY this client's realtime connection to the 'lobby-{id}'
  // channel, without touching _lobbyId/_members/etc — used by
  // _enterGroupWaitAsSpectator (lobby.js) before GroupSpectate.watch()
  // subscribes to the SAME topic from this same client: Supabase Realtime
  // doesn't allow two channels subscribed to the same topic from the same
  // client (same reason as VS.releaseChannel in vs.js, 1v1). The existing
  // resubscribeChannel() is the counterpart to restore the connection on return.
  async function releaseChannel() {
    if (_channel) {
      const ch = _channel;
      _channel = null;
      try { await window.sb.removeChannel(ch); } catch (e) {}
    }
  }

  // See the long comment in _expectedLeaves — ALWAYS call right before
  // releaseChannel() when the reason is "I'm going to spectate on loan", not
  // a real abandonment. _expectedLeaves is a LOCAL variable per client —
  // adding my own uid here does nothing for the OTHER clients, who are the
  // ones that will actually receive and evaluate MY presence 'leave'. So
  // this also broadcasts the notice: everyone (myself included, broadcast
  // self:true) adds it to their own _expectedLeaves before the real 'leave'
  // arrives — without this broadcast, every player entering spectate-on-loan
  // made whoever was left playing see "everyone abandoned the match"
  // (_onAlone firing falsely, reported). Deliberately async: the broadcast
  // must finish being queued on the socket BEFORE the caller moves on to
  // releaseChannel() — marked with `await` (see _enterGroupWaitAsSpectator
  // in lobby.js). It used to be fire-and-forget: if the broadcast hadn't
  // gone out yet when the channel unsubscribed an instant later
  // (synchronous, the next line), the notice was lost silently — the OTHER
  // clients never added this uid to their own _expectedLeaves, so they saw
  // its presence 'leave' as a REAL abandonment. With several players
  // finishing almost together (all entering spectate-on-loan at once, see
  // the 600ms margin in _lobbyHandleGameEnd), this race was lost for
  // several at once — inflating _pendingKicks, which corrupted
  // _checkAllFinished's total (or directly triggered _onAlone's "I'm
  // alone", hiding the whole match) — the reported "the panels didn't show
  // for anyone".
  async function markExpectedLeave(memberUid) {
    _expectedLeaves.add(memberUid);
    await _bcast('expectleave', { uid: memberUid });
  }

  return {
    create, joinByCode, joinById, leave, kick, start, reportScore, listPublic, cleanup, releaseChannel, markExpectedLeave,
    sendCountdown, sendCancel, sendNotReady, sendWrong, sendVisibility, sendName, sendFinished, sendReveal, sendScore, setPublic, isPublic, restoreActive, transferHost, cleanupMine,
    sendRound, sendTick, sendPregame, sendPostgame, sendAnswer, sendTimesUp, sendSplash, sendAdvancing,
    sendInvite, listenForInvites, setName, getName, setModes, getModes, sendModes,
    isHost, getMembers, getLobby, getCode, getId, getSeed,
    refreshMembers: () => _fetchMembers(),
    // _subscribe() alone only resumes LISTENING for future changes — it
    // doesn't fetch the ones that happened WHILE the channel was released
    // (see releaseChannel, used by _enterGroupWaitAsSpectator). Without this
    // _fetchMembers() here, whoever came back from "spectate on loan" kept
    // seeing their opponents' scores frozen at what they were BEFORE
    // releasing the channel (e.g. mid-round of what they were watching) —
    // stuck that way until the next real change in lobby_members, which
    // might not arrive before the next mode started (the reported "score and
    // cards at 0 when entering the next mode").
    resubscribeChannel: () => { if (_lobbyId) { _subscribe(); _fetchMembers(); } },
    refreshSpectatorCount: () => { try { _applySpectatorBadge(); } catch (e) {} },
    getPendingKicksCount: () => _pendingKicks.size,
    clearPendingKicks: () => { _pendingKicks.clear(); },
    processPendingKicks: async () => {
      if (_pendingKicks.size && isHost()) {
        const toKick = new Set(_pendingKicks);
        _pendingKicks.clear();
        const lid = _lobbyId;
        toKick.forEach(async uid => {
          try { await window.sb.from('lobby_members').delete().eq('lobby_id', lid).eq('user_id', uid); } catch (e) {}
        });
        setTimeout(() => _fetchMembers(), 500);
      } else { _pendingKicks.clear(); }
    },
    resetToWaiting: async () => {
      if (!_lobbyId || !_myId()) return;
      try {
        await window.sb.from('lobbies')
          .update({ status: 'waiting', seed: null })
          .eq('id', _lobbyId)
          .eq('host_id', _myId());
        if (_lobby) { _lobby.status = 'waiting'; _lobby.seed = null; }
      } catch (e) { console.warn('[LB] resetToWaiting failed:', e); }
    },
    onMembers:   cb => { _onMembers = cb; },
    onStart:     cb => { _onStart = cb; },
    onClosed:    cb => { _onClosed = cb; },
    onCountdown: cb => { _onCountdown = cb; },
    onCancel:    cb => { _onCancel = cb; },
    onNotReady:  cb => { _onNotReady = cb; },
    onWrong:      cb => { _onWrong = cb; },
    onVisibility: cb => { _onVisibility = cb; },
    onName:       cb => { _onName = cb; },
    onModes:      cb => { _onModes = cb; },
    onFinished:   cb => { _onFinished = cb; },
    onReveal:     cb => { _onReveal = cb; },
    onScore:      cb => { _onScore = cb; },
    onPlayerGone: cb => { _onPlayerGone = cb; },
    onPlayerBack: cb => { _onPlayerBack = cb; },
    onAlone:      cb => { _onAlone = cb; if (cb) _aloneCalledThisGame = false; },
    resetAloneGuard: () => { _aloneCalledThisGame = false; },
    onRound:      cb => { _onRound = cb; },
    onTick:       cb => { _onTick = cb; },
    onPregame:    cb => { _onPregame = cb; },
    onPostgame:   cb => { _onPostgame = cb; },
    onAnswer:     cb => { _onAnswer = cb; },
    onTimesUp:    cb => { _onTimesUp = cb; },
    onSplash:     cb => { _onSplash = cb; },
    onAdvancing:  cb => { _onAdvancing = cb; },
  };
})();

// ── UI + game integration ────────────────────────────────────────────────────────
window.Lobby = (() => {
  const T = (k, d) => (typeof t === 'function' ? t(k) : d);

  // ── Lobby roster ─────────────────────────────────────────────────────────────
  function _buildMemberRow(m, host, myId) {
    const row = document.createElement('div');
    row.className = 'lobby-member-row' + (m.isHost ? ' is-host' : '') + (m.id !== myId ? ' clickable' : '') + (m.is_playing ? ' is-playing' : '')
      + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(m.cellCode) ? ' cell-light-text' : '');
    row.dataset.memberId = m.id;
    row.innerHTML =
      `<div class="lobby-member-avatar-wrap"><img class="lobby-member-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false"></div>` +
      `<span class="lobby-member-name">${m.name}${m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : ''}</span>` +
      (m.isHost    ? `<span class="lobby-member-badge">${T('lobby.host', 'HOST')}</span>` : '') +
      (m.is_playing ? `<span class="lobby-member-playing-badge">${T('social.playing', 'Jugando')}</span>` : '') +
      ((host && !m.isHost) ? `<button class="lobby-host-btn" data-id="${m.id}" title="${T('lobby.makeHost', 'Hacer host')}">👑</button>` : '') +
      ((host && !m.isHost) ? `<button class="lobby-kick-btn" data-id="${m.id}" title="${T('lobby.kick', 'Expulsar')}">✕</button>` : '');
    // Each member's real frame (pfp ring) + real background cell of the row.
    // applyCellForStatus (not applyCell) so it blinks with the -green
    // variant while is_playing, same as in the "Challenge"/invite panel.
    window.CustomizeAssets?.applyFrame(row.querySelector('.lobby-member-avatar-wrap'), m.frameCode || '0001');
    window.CustomizeAssets?.applyCellForStatus(row, m.cellCode || '0001', m.is_playing ? 'playing' : 'online');
    if (m.id !== myId) {
      row.addEventListener('click', async e => {
        if (e.target.closest('.lobby-kick-btn, .lobby-host-btn')) return;
        if (typeof window.openFriendProfile !== 'function' || !window.sbGetProfile) return;
        try {
          const p = await window.sbGetProfile(m.id);
          window.openFriendProfile({
            id: p.id,
            name: p.username || m.name,
            avatar: p.avatar_url || m.avatar || 'images/profilepic/ppdefault.png',
            score: p.hs_total || ((p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0)),
            play_count: p.play_count || 0,
            vs_wins: p.vs_wins || 0,
            vs_losses: p.vs_losses || 0,
            hs_flags: p.hs_flags || 0,
            hs_shapes: p.hs_shapes || 0,
            hs_cities: p.hs_cities || 0,
            hs_monuments: p.hs_monuments || 0,
            last_active: p.last_active || null,
            is_playing: p.is_playing || false,
            frameCode: p.frame_code || '0001',
          });
        } catch (err) {
          console.warn('[lobby] could not open profile:', err);
        }
      });
    }
    const kickBtn = row.querySelector('.lobby-kick-btn');
    if (kickBtn) kickBtn.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.LB.kick(kickBtn.dataset.id);
    });
    const hostBtn = row.querySelector('.lobby-host-btn');
    if (hostBtn) hostBtn.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.LB.transferHost(hostBtn.dataset.id);
      if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.hostTransferred', 'Host transferido'));
    });
    return row;
  }
  function _renderMembers(members) {
    const list = document.getElementById('lobby-members');
    if (!list) return;
    const host = window.LB.isHost();
    const myId = window._sbUserId;

    // Update the name cache before comparing (to recover names of those who leave)
    members.forEach(m => { if (m.id && m.name) _memberNameCache[m.id] = m.name; });

    // Detect who joined/left since the previous render
    if (_prevMemberIds.length > 0 && typeof window.showVersusToast === 'function') {
      const newIds  = members.map(m => m.id);
      const joined  = members.filter(m => !_prevMemberIds.includes(m.id) && m.id !== myId);
      const leftIds = _prevMemberIds.filter(id => !newIds.includes(id) && id !== myId);
      joined.forEach(m => {
        window.showVersusToast((m.name || '?') + ' ' + T('lobby.memberJoined', 'se unió a la sala'));
        delete _inviteCooldowns[m.id]; // joined → re-enable re-invite if they leave
      });
      leftIds.forEach(id => {
        const name = _memberNameCache[id] || T('lobby.someone', 'Alguien');
        window.showVersusToast(name + ' ' + T('lobby.memberLeft', 'salió de la sala'));
      });
      // If someone joins or leaves during the countdown, the host cancels it for everyone
      if (_counting && window.LB.isHost() && (leftIds.length > 0 || joined.length > 0)) {
        window.LB.sendCancel();
      }
      // The host re-emits the modes when someone new joins, in case the guest
      // joined late and missed the original broadcast.
      if (joined.length > 0 && window.LB.isHost()) {
        const modes = window.LB.getModes();
        if (modes.length > 1 || modes[0] !== 'flags') window.LB.sendModes(modes, false);
      }
    }
    _prevMemberIds = members.map(m => m.id);

    // Incremental diff (not list.innerHTML='' + rebuild everything) — same
    // fix as _renderOnlineFriends (js/vs.js): this list re-renders itself
    // often (every score/is_playing/presence change of ANY member), and
    // recreating a row's DOM node resets its CSS animation from 0% even if
    // nothing changed in THAT particular row — the reported "green blink
    // restarts at random intervals".
    const hostChanged = host !== _prevHostFlag;
    _prevHostFlag = host;
    const existingRows = hostChanged ? new Map() : new Map(
      Array.from(list.querySelectorAll('.lobby-member-row[data-member-id]')).map(el => [el.dataset.memberId, el])
    );
    if (hostChanged) list.innerHTML = ''; // the host/kick buttons depend on the global "host", not this particular row

    let prevEl = null;
    members.forEach(m => {
      const key = String(m.id);
      let row = existingRows.get(key);
      if (row) {
        existingRows.delete(key);
        const samePlaying = row.classList.contains('is-playing') === !!m.is_playing;
        const sameHostBadge = row.classList.contains('is-host') === !!m.isHost;
        if (samePlaying && sameHostBadge) {
          // Only update what can change without affecting classes/animation.
          const nameEl = row.querySelector('.lobby-member-name');
          const wantedName = m.name + (m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : '');
          if (nameEl && nameEl.textContent !== wantedName) nameEl.textContent = wantedName;
          const avatarEl = row.querySelector('.lobby-member-avatar');
          if (avatarEl && avatarEl.src !== m.avatar) avatarEl.src = m.avatar;
          const wantsLightText = !!window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(m.cellCode);
          row.classList.toggle('cell-light-text', wantsLightText);
          window.CustomizeAssets?.applyFrame(row.querySelector('.lobby-member-avatar-wrap'), m.frameCode || '0001');
          window.CustomizeAssets?.applyCellForStatus(row, m.cellCode || '0001', m.is_playing ? 'playing' : 'online');
        } else {
          // Real transition (started/stopped playing, or the host changed) —
          // here it's right to recreate, the classes/buttons really change.
          const fresh = _buildMemberRow(m, host, myId);
          list.replaceChild(fresh, row);
          row = fresh;
        }
      } else {
        row = _buildMemberRow(m, host, myId);
        list.appendChild(row);
      }
      // Reorder without recreating: insertBefore of a node ALREADY IN THE DOM
      // doesn't reset its CSS animations.
      const wantedNext = prevEl ? prevEl.nextSibling : list.firstChild;
      if (wantedNext !== row) list.insertBefore(row, wantedNext);
      prevEl = row;
    });
    existingRows.forEach(el => el.remove()); // members no longer present
    // Counter and start-button state
    const cnt = document.getElementById('lobby-count');
    if (cnt) cnt.textContent = members.length + '/10';
    const anyPlaying = members.some(m => m.is_playing);
    const startBtn = document.getElementById('lobby-start-btn');
    if (startBtn) {
      const blocked = members.length < 2 || anyPlaying;
      startBtn.disabled = blocked;
      startBtn.classList.toggle('disabled', blocked);
      startBtn.title = anyPlaying ? T('lobby.someoneIsPlaying', 'A member is currently in a game') : '';
    }
    // Cancel the countdown if any member starts a match during it
    if (_counting && window.LB.isHost() && anyPlaying) {
      window.LB.sendCancel();
    }
    // Show the buttons depending on whether a countdown is in progress
    _applyCountdownButtons(_counting);
    _refreshLobbyName();
    _updateVisibilityBtn();
    _updateInviteBtn();
    // If the invite popup is open, refresh it to reflect who joined/left
    const ip = document.getElementById('lobby-invite-popup');
    if (ip && ip.style.display !== 'none') _openInvitePopup();
  }

  // ── Multi-mode state ─────────────────────────────────────────────────────────
  let _currentModeIdx  = 0;
  let _lobbyModes      = [];  // mode sequence for the current game session
  let _baseSeed        = null;
  let _modeAccScore    = 0;   // local player's accumulated score across all modes
  // The SINGLE-PLAYER campaign uses window.campaignBase (defined in
  // js/core/campaign.js: returns window.campaign.base). Group mode OVERRIDES
  // it with () => _modeAccScore for the duration of the room match, and on
  // finishing restores it to THIS original function — it used to set it to
  // null, DESTROYING the js/core/campaign.js one, so after a group versus a
  // player's campaign was left with no base and the score reset between
  // modes (reported). It's captured the first time it's overridden (still
  // the js/core/campaign.js one at that point).
  let _origCampaignBase = null;
  let _intermediateTimer = null;
  let _pendingModesOrder = []; // picker state before saving
  let _savedLobbyModes  = []; // modes confirmed by broadcast; more reliable than the DB at start

  // ── Start countdown (10s, cancelable) ────────────────────────────────────────
  let _counting = false;
  let _cdInterval = null;
  let _cdUntil = null;
  let _cdTick = null; // reference to the current tick, to force an immediate check (see visibilitychange)

  function _applyCountdownButtons(active) {
    const host    = window.LB.isHost();
    const cd       = document.getElementById('lobby-countdown');
    const startB   = document.getElementById('lobby-start-btn');
    const cancelB  = document.getElementById('lobby-cancel-btn');
    const nrB      = document.getElementById('lobby-notready-btn');
    const wait     = document.getElementById('lobby-wait-msg');
    if (cd)      cd.style.display      = active ? '' : 'none';
    if (startB)  startB.style.display  = (!active && host)  ? '' : 'none';
    if (cancelB) cancelB.style.display = (active && host)   ? '' : 'none';
    if (nrB)     nrB.style.display     = (active && !host)  ? '' : 'none';
    if (wait)    wait.style.display    = (!active && !host) ? '' : 'none';
    // Lock the host's controls during the countdown
    const modeEditBtn  = document.getElementById('lobby-mode-edit-btn');
    const inviteBtn    = document.getElementById('lobby-invite-btn');
    const visibilityBtn = document.getElementById('lobby-visibility-btn');
    if (modeEditBtn)   modeEditBtn.disabled   = active;
    if (inviteBtn)     inviteBtn.disabled     = active;
    if (visibilityBtn) visibilityBtn.disabled = active;
  }

  // ── Global countdown bar (visible outside the group panel) ────────────────────
  let _globalCdEl = null;
  function _showGlobalCdBar(text) {
    if (!_globalCdEl) {
      _globalCdEl = document.createElement('div');
      _globalCdEl.className = 'lobby-cd-global-bar';
      document.body.appendChild(_globalCdEl);
      requestAnimationFrame(() => requestAnimationFrame(() => { if (_globalCdEl) _globalCdEl.style.opacity = '1'; }));
    }
    _globalCdEl.textContent = text;
  }
  function _hideGlobalCdBar() {
    if (!_globalCdEl) return;
    _globalCdEl.style.opacity = '0';
    const el = _globalCdEl;
    _globalCdEl = null;
    setTimeout(() => { try { el.remove(); } catch (e) {} }, 300);
  }

  function _startCountdown(until) {
    _counting = true;
    _cdUntil = until;
    window._lobbyCountingDown = true;
    _applyCountdownButtons(true);
    clearInterval(_cdInterval);
    _cdTick = () => {
      const remain = Math.ceil((until - Date.now()) / 1000);
      const text = T('lobby.starting', 'Empezando en') + ' ' + Math.max(0, remain) + '…';
      const cd = document.getElementById('lobby-countdown');
      if (cd) cd.textContent = text;
      // Only show the global bar if the room panel is NOT visible
      const lobbyPanelVisible = !!document.getElementById('versus-screen-lobby')?.offsetParent;
      if (!lobbyPanelVisible) _showGlobalCdBar(text);
      else _hideGlobalCdBar();
      if (remain <= 0) {
        clearInterval(_cdInterval); _cdInterval = null; _cdTick = null;
        // Don't start if the host is in another game (1v1 versus or any other mode)
        if (window.LB.isHost() && !window._isPlaying) window.LB.start();
      }
    };
    _cdTick();
    _cdInterval = setInterval(_cdTick, 200);
  }

  function _stopCountdown() {
    _counting = false;
    _cdUntil = null; _cdTick = null;
    window._lobbyCountingDown = false;
    clearInterval(_cdInterval); _cdInterval = null;
    _hideGlobalCdBar();
    _applyCountdownButtons(false);
  }

  // Track previous members to detect joins/leaves and show toasts
  let _prevMemberIds = [];
  let _memberNameCache = {}; // id → name, to recover the name of whoever left
  let _prevHostFlag = null; // last "am I host?" — see _renderMembers, forces a full rebuild if it changed

  // ── Enter the lobby (after creating/joining) ─────────────────────────────────
  function _updateInviteBtn() {
    const inviteBtn = document.getElementById('lobby-invite-btn');
    if (!inviteBtn) return;
    // Host can always invite; members only if the room is public
    inviteBtn.disabled = !(window.LB.isHost() || window.LB.isPublic());
  }

  function enterLobby() {
    if (!window.LB.getId()) _savedLobbyModes = []; // reset only if there's no active room
    const codeEl = document.getElementById('lobby-code');
    if (codeEl) codeEl.textContent = window.LB.getCode() || '------';
    _updateInviteBtn();
    _updateVisibilityBtn();
    _refreshLobbyName();

    // Don't reset _counting: if the host returns to the panel with an active countdown, the correct state must show
    _applyCountdownButtons(_counting);
    window.LB.onMembers(_renderMembers);
    window.LB.onStart(lobby => _launchLobbyGame(lobby.seed));
    window.LB.onClosed(reason => {
      // If the match hasn't started yet, notify and go back to the list
      if (!window._lobbyActive) {
        _stopCountdown();
        _backToVersusFromLobby();
        if (typeof window.showVersusToast === 'function') {
          window.showVersusToast(reason === 'kicked'
            ? T('lobby.kicked', 'Te expulsaron de la sala')
            : T('lobby.closed', 'El host cerró la sala'));
        }
      }
    });
    // Synced countdown
    window.LB.onCountdown(p => { if (p && p.until) _startCountdown(p.until); });
    window.LB.onCancel(() => {
      _stopCountdown();
      if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.cancelled', 'Cuenta regresiva cancelada'));
    });
    window.LB.onNotReady(p => {
      if (typeof window.showVersusToast === 'function') {
        window.showVersusToast(((p && p.name) || T('lobby.someone', 'Alguien')) + ' ' + T('lobby.notReadyMsg', 'no está listo'));
      }
    });
    window.LB.onVisibility(isPublic => {
      if (typeof window.showVersusToast === 'function') {
        window.showVersusToast(isPublic ? T('lobby.nowPublic', 'Sala ahora PÚBLICA') : T('lobby.nowPrivate', 'Sala ahora PRIVADA'));
      }
      _updateInviteBtn();
      _updateVisibilityBtn();
      if (!isPublic && !window.LB.isHost()) {
        const pop = document.getElementById('lobby-invite-popup');
        if (pop && pop.style.display !== 'none') pop.style.display = 'none';
      }
    });
    window.LB.onName(() => _refreshLobbyName());
    window.LB.onModes((modes, changed) => {
      if (Array.isArray(modes) && modes.length) _savedLobbyModes = [...modes];
      _refreshLobbyName();
      if (changed && typeof window.showVersusToast === 'function') {
        const names = (Array.isArray(modes) ? modes : window.LB.getModes())
          .map(m => (_MODE_NAMES[m] || (() => m))()).join(' → ');
        window.showVersusToast(T('lobby.pickMode', 'Modos de juego') + ': ' + names);
      }
    });
    // Re-subscribe the channel in case it disconnected during a previous match
    window.LB.resubscribeChannel?.();
    _prevMemberIds = [];
    _memberNameCache = {};
    _renderMembers(window.LB.getMembers()); // immediate render from cache
    // Force a fresh DB fetch to ensure the current post-match state
    window.LB.refreshMembers?.().catch(() => {});
  }

  function _backToVersusFromLobby() {
    if (typeof window.versusGoTo === 'function') window.versusGoTo('amistoso', true);
  }

  // ── Public rooms list (random) ──────────────────────────────────────────────
  // silent=true → skips the "Loading rooms…" spinner (for background updates)
  let _publicListLoading = false; // prevents simultaneous requests
  async function loadPublicList(silent = false) {
    const list  = document.getElementById('versus-public-list');
    const empty = document.getElementById('versus-public-empty');
    if (!list) return;
    if (_publicListLoading) return; // a query is already in flight
    _publicListLoading = true;

    if (!silent) {
      list.innerHTML = `<div class="versus-empty-inline">${T('lobby.loading', 'Cargando salas…')}</div>`;
      if (empty) empty.style.display = 'none';
    }

    let rooms = [];
    try {
      const _p = window.LB.listPublic();
      // Connection bubble only on the initial load (silent=false); background
      // polling must not interrupt the player over a one-off timeout.
      rooms = (!silent && typeof window.withConnCheck === 'function')
        ? (await window.withConnCheck(_p, 6000)) || []
        : await _p;
    } catch (e) {}
    _publicListLoading = false;

    // Build the new content in a fragment for an atomic swap (no flicker)
    const myLobbyId = window.LB.getId();
    const frag = document.createDocumentFragment();
    rooms.forEach(r => {
      const isMine = myLobbyId && myLobbyId === r.id;
      const row = document.createElement('div');
      row.className = 'versus-friend-row';
      row.dataset.lobbyId = r.id;
      const roomModes = _getActiveModes(r);
      const modeIconsHtml = _modeIconsHtml(roomModes, 'public-room-mode-icon');
      const displayName = r.name || _roomNameCache.get(String(r.id)) || (typeof t === 'function' ? t('lobby.roomName', { name: r.hostName }) : ('Sala de ' + r.hostName));
      row.innerHTML =
        `<div class="versus-friend-info">` +
          `<div class="public-room-name-row">` +
            `<span class="versus-friend-name">${displayName}</span>` +
            `<div class="public-room-mode-icons">${modeIconsHtml}</div>` +
          `</div>` +
          `<span class="versus-friend-status">${r.count}/${r.max} ${T('lobby.players', 'jugadores')}</span>` +
        `</div>` +
        `<button class="versus-challenge-btn${isMine ? ' joined' : ''}" data-id="${r.id}"${isMine ? ' disabled' : ''}>${isMine ? T('lobby.joined', 'Unido') : T('lobby.join', 'Unirse')}</button>`;
      frag.appendChild(row);
    });

    // Atomic swap: replaces the content with no intermediate flash
    list.innerHTML = '';
    if (!rooms.length) {
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      list.appendChild(frag);
    }

    list.querySelectorAll('.versus-challenge-btn:not(.joined)').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        try {
          await window.LB.joinById(btn.dataset.id);
          if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
          enterLobby();
        } catch (e) {
          if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.joinError', 'No se pudo unir a la sala'));
        }
      });
    });
  }

  // ── Launch the flags match in lobby mode ─────────────────────────────────────
  function _launchLobbyGame(seed, modeIdx) {
    modeIdx = modeIdx !== undefined ? modeIdx : 0;
    _currentModeIdx = modeIdx;
    // ALWAYS clean up, before starting ANY mode (first or next, new game or
    // transition) — so NOTHING from the previous mode/game is ever left
    // stuck, whatever the combination (monuments→flags, flags from the
    // previous game mixed in, etc. — all reported). Reset
    // window._vsShowingResult FIRST so the hardResets (gameStoppers = all
    // modes) do hide the assets (some preserve them while that flag is
    // true). _modeAccScore/campaignBase are NOT touched here, so the score
    // accumulated across modes is preserved.
    window._vsShowingResult = false;
    if (Array.isArray(window.gameStoppers)) window.gameStoppers.forEach(fn => { try { fn(); } catch (e) {} });
    if (modeIdx === 0) {
      // _savedLobbyModes comes from the broadcast and is more reliable than the DB (which can be stale
      // if start()'s postgres_changes arrived before setModes's, overwriting _lobby.mode)
      _lobbyModes   = _savedLobbyModes.length ? [..._savedLobbyModes] : _getActiveModes(window.LB.getLobby());
      _baseSeed     = seed;
      _modeAccScore = 0;
    }
    // Deterministic per-mode seed (same on every device)
    const modeSeed = Math.floor(Math.abs(_baseSeed + modeIdx * 7919) % 1_000_000);
    const mode = _lobbyModes[modeIdx] || 'flags';

    _stopCountdown();
    _lobbyInTransition = false;
    window.practiceConfig = window.practiceConfig || {};
    window.practiceConfig.active = false;
    window.pendingGameMode = mode === 'cities' ? 'game' : mode;
    if (typeof window._setPlaying === 'function') window._setPlaying(true);

    const _ls = document.getElementById('loading-screen');
    if (_ls) { _ls.style.display = 'none'; _ls.classList.remove('lobby-interim-bg'); }
    document.getElementById('loading-versus-group')?.classList.add('table-gone');
    document.getElementById('loading-versus-group')?.classList.remove('panel-visible');
    document.getElementById('splash-screen').style.display = 'none';

    // Lobby mode state: leaderboard with ALL opponents, seeded RNG.
    window._lobbyActive = true;
    _finishedPlayers = new Map();
    _resultPresented = false;
    // _revealAt/_revealTimer (shared wall clock, see _checkAllFinished) are
    // module variables that survive between matches — the only other place
    // they're cleared is on the step to the NEXT mode within the SAME room
    // (_currentModeIdx = nextIdx) and in _returnFromLobbyResult/_lobbyAbandon.
    // If for any reason they held a value from a PREVIOUS match without
    // going through those paths, _checkAllFinished() self-blocked forever in
    // the NEW match (its guard above is `if (_resultPresented ||
    // _revealTimer) return`) — nobody ever got the results panel, matching
    // the reported "now NOBODY gets the table". Here, at the start of ANY
    // mode (first or next), is the safest place to guarantee a clean state
    // whatever happened before.
    _revealAt = null;
    if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    // At the start of a new campaign, force scores to 0 in the local cache so as not to show
    // residual values from the previous match while the first _fetchMembers arrives
    if (modeIdx === 0) window.LB.getMembers().forEach(m => { m.score = 0; });
    _refreshLobbyOpponents();

    // When the room's scores change (realtime) → update the leaderboard
    window.LB.onMembers(() => {
      _refreshLobbyOpponents();
      const scoresFn = mode === 'monuments' ? window.monumentsSetLobbyScores : mode === 'shapes' ? window.shapesSetLobbyScores : mode === 'cities' ? window.citiesSetLobbyScores : window.flagsSetLobbyScores;
      if (typeof scoresFn === 'function') scoresFn(window._lobbyMembers);
      if (_finishedPlayers.size > 0) _checkAllFinished();
    });
    // When a member finishes their match → record and check if everyone finished
    window.LB.onFinished((uid, score) => {
      if (uid) _finishedPlayers.set(uid, score ?? 0);
      _checkAllFinished();
    });
    // Shared wall clock — see the long comment in _checkAllFinished.
    window.LB.onReveal((revealAt, isFinal) => _handleRevealBroadcast(revealAt, isFinal));
    // Another player's live score → update the leaderboard immediately
    window.LB.onScore((uid, score) => {
      const lm = (window._lobbyMembers || []).find(m => m.id === uid);
      if (lm) lm.score = score;
      const scoresFn = mode === 'monuments' ? window.monumentsSetLobbyScores : mode === 'shapes' ? window.shapesSetLobbyScores : mode === 'cities' ? window.citiesSetLobbyScores : window.flagsSetLobbyScores;
      if (typeof scoresFn === 'function') scoresFn(window._lobbyMembers || []);
    });
    // Someone in the room missed → glow on their specific leaderboard card
    window.LB.onWrong(uid => {
      const wrongFn = mode === 'monuments' ? window.monumentsSetLobbyWrongFor : mode === 'shapes' ? window.shapesSetLobbyWrongFor : mode === 'cities' ? window.citiesSetLobbyWrongFor : window.flagsTriggerLobbyWrongFor;
      if (typeof wrongFn === 'function') wrongFn(uid);
    });
    // Someone in the room ran out of time → shake + timer on their card
    // (SAME system as 'wrong', see _applyTimesUpEffect).
    window.LB.onTimesUp(payload => {
      const uid = payload && payload.uid;
      const tuFn = mode === 'monuments' ? window.monumentsSetLobbyTimesUpFor : mode === 'shapes' ? window.shapesSetLobbyTimesUpFor : mode === 'cities' ? window.citiesSetLobbyTimesUpFor : window.flagsTriggerLobbyTimesUpFor;
      if (typeof tuFn === 'function') tuFn(uid);
    });
    // Someone lost/regained presence → show/hide the disconnected state on their card
    window.LB.onPlayerGone(uid => {
      const goneFn = mode === 'monuments' ? window.monumentsSetLobbyDisconnected : mode === 'shapes' ? window.shapesSetLobbyDisconnected : mode === 'cities' ? window.citiesSetLobbyDisconnected : window.flagsSetLobbyDisconnected;
      if (typeof goneFn === 'function') goneFn(uid, true);
    });
    window.LB.onPlayerBack(uid => {
      const backFn = mode === 'monuments' ? window.monumentsSetLobbyDisconnected : mode === 'shapes' ? window.shapesSetLobbyDisconnected : mode === 'cities' ? window.citiesSetLobbyDisconnected : window.flagsSetLobbyDisconnected;
      if (typeof backFn === 'function') backFn(uid, false);
    });
    // If I'm alone (everyone else abandoned during the match) → back to the room
    window.LB.onAlone(() => {
      if (!window._lobbyActive && !_lobbyInTransition) return;
      // If we're on the inter-mode screen, clear its timer and overlay
      if (_lobbyInTransition) {
        _lobbyInTransition = false;
        clearInterval(_intermediateTimer); _intermediateTimer = null;
        const interScreen = document.getElementById('lobby-intermediate-screen');
        if (interScreen) interScreen.style.display = 'none';
      }
      _stopCountdown();
      _teardownCurrentMode();
      // Hide game HUD that hardReset doesn't clean + the exit-confirmation popup
      ['score-display','flags-score-display','countdown-widget',
       'flags-countdown-widget','pregame-countdown','flags-pregame-countdown',
       'timeup-overlay','flags-timeup-overlay','game-wrapper','ingame-quit-popup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      window._lobbyActive = false;
      window._lobbyMembers = [];
      if (typeof window._setPlaying === 'function') window._setPlaying(false);
      window.LB.onScore(null);
      window.LB.onWrong(null);
      window.LB.onPlayerGone(null);
      window.LB.onPlayerBack(null);
      window.LB.onAlone(null);
      _resultPresented = false;
      _currentModeIdx = 0; _lobbyModes = []; _baseSeed = null; _modeAccScore = 0;
      _savedLobbyModes = [];
      if (_origCampaignBase) window.campaignBase = _origCampaignBase; // restore the js/core/campaign.js one (1-player campaign), do NOT destroy it
      if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
      // Restore the lobby to the waiting state: clear pending kicks + status→waiting
      window.LB.reportScore?.(0).catch?.(() => {});
      window.LB.processPendingKicks?.();
      window.LB.resetToWaiting?.();
      // Restore the loading screen and room panel (same as _presentFinalResult)
      const ls = document.getElementById('loading-screen');
      if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; ls.classList.remove('lobby-interim-bg'); ls.classList.add('table-shown'); }
      try { if (typeof playMusic === 'function' && typeof sfxMenuMusic !== 'undefined') playMusic(sfxMenuMusic); } catch(e) {}
      if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
      if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
      enterLobby();
      window.LB.refreshMembers?.();
      // Show the "you're alone" panel
      const aloneTitle = document.querySelector('#lobby-alone-screen [data-i18n="lobby.alone.title"]');
      const aloneSub   = document.querySelector('#lobby-alone-screen [data-i18n="lobby.allLeft"]');
      if (aloneTitle) aloneTitle.textContent = T('lobby.alone.title', 'QUEDASTE SOLO');
      if (aloneSub)   aloneSub.textContent   = T('lobby.allLeft', 'Todos abandonaron la partida');
      const aloneScreen = document.getElementById('lobby-alone-screen');
      if (aloneScreen) aloneScreen.style.display = 'flex';
    });

    // Accumulated base from previous modes: lets the total score show on screen from the start of the mode
    // Capture the ORIGINAL campaignBase (js/core/campaign.js) the first time, to
    // be able to restore it on finishing (see _origCampaignBase).
    if (_origCampaignBase === null && typeof window.campaignBase === 'function') _origCampaignBase = window.campaignBase;
    window.campaignBase = () => _modeAccScore;

    if (mode === 'shapes') {
      if (typeof window.shapesSetSeed === 'function') window.shapesSetSeed(modeSeed);
      if (typeof showShapesMode === 'function') showShapesMode();
    } else if (mode === 'cities') {
      if (typeof window.citiesSetSeed === 'function') window.citiesSetSeed(modeSeed);
      if (typeof startGame === 'function') startGame();
    } else if (mode === 'monuments') {
      if (typeof window.monumentsSetSeed === 'function') window.monumentsSetSeed(modeSeed);
      if (typeof startGame === 'function') startGame();
    } else {
      if (typeof window.flagsSetSeed === 'function') window.flagsSetSeed(modeSeed);
      if (typeof showFlagsMode === 'function') showFlagsMode();
    }
    // Re-apply the spectator badge for the just-started mode — the badge
    // points at the ACTIVE mode (window.pendingGameMode) and only refreshes
    // on presence 'sync' events; on a mode transition there's none, so the
    // new mode's badge started off even if there were spectators (reported,
    // "the symbol is removed on every transition"). Small delay so the
    // mode's HUD finishes mounting.
    setTimeout(() => { try { window.LB.refreshSpectatorCount?.(); } catch (e) {} }, 300);
  }

  // Builds window._lobbyMembers = opponents (everyone but me)
  function _refreshLobbyOpponents() {
    const myId = window._sbUserId;
    window._lobbyMembers = window.LB.getMembers()
      .filter(m => m.id !== myId)
      .map(m => ({
        id: m.id, name: m.name, avatar: m.avatar, score: m.score || 0,
        cardCode: m.cardCode || '0001',
      }));
  }

  // Answer report from flags.js / shapes.js
  window._lobbyReportAnswer = function(correct, score) {
    if (!window.LB.getId()) return;
    const base = (typeof window.campaignBase === 'function') ? window.campaignBase() : 0;
    const cumScore = score + base;
    window.LB.reportScore(cumScore);
    window.LB.sendScore(cumScore);
    if (!correct) window.LB.sendWrong();
  };

  // ── Group match end: wait for everyone before showing results ─────────────────
  let _finishedPlayers = new Map(); // uid → finalScore
  let _resultPresented   = false;
  let _waitingTimeout    = null;
  let _lobbyInTransition = false; // true between modes (inter screen): alone stays active
  Object.defineProperty(window, '_lobbyInTransition', { get: () => _lobbyInTransition, set: v => { _lobbyInTransition = v; }, configurable: true });

  function _showLobbyWaiting() {
    const el  = document.getElementById('lobby-waiting-overlay');
    const txt = document.getElementById('lobby-waiting-text');
    if (txt) txt.textContent = T('lobby.waitingOthers', 'Esperando a los otros miembros…');
    if (el)  el.style.display = 'flex';
  }
  function _hideLobbyWaiting() {
    const el = document.getElementById('lobby-waiting-overlay');
    if (el) el.style.display = 'none';
  }

  // Shared wall clock for the round-end ranking — each client used to
  // present the result as soon as it FOUND OUT (locally) that everyone
  // finished, without coordinating with anyone else. That already worked
  // "fine" when everyone was connected normally (the 'finished' events
  // reach everyone at nearly the same time), but with the spectator on
  // loan (who finds out via slower paths: GroupSpectate bridge, 3s poll)
  // someone could end up seeing the panel several seconds after the rest —
  // the reported "it worked before, adding the spectator broke it". Now,
  // whoever FIRST detects that everyone finished computes a shared future
  // instant (revealAt) and sends it to everyone (via LB AND GroupSpectate,
  // so it reaches even someone spectating on loan with their own channel
  // released) — each client schedules its own
  // _presentIntermediateResult/_presentFinalResult for THAT same instant,
  // so the panel appears for everyone at once.
  const REVEAL_BUFFER_MS = 700;
  const REVEAL_MAX_WAIT_MS = 2000; // wait cap for clock skew (see _clampRevealAt) — lowered from 4s: the real margin is 700ms + latency, 4s felt "late"
  let _revealAt = null;
  let _revealTimer = null;
  // The revealAt arriving from ANOTHER client (LB.onReveal/GroupSpectate.onReveal)
  // was computed with THAT machine's clock — if system clocks aren't well
  // synced across devices, a foreign revealAt could land several seconds
  // (or more) in the future relative to this clock, making this client wait
  // that whole skew before showing anything — it felt like "frozen forever"
  // without technically being so. No legitimate reveal should need more
  // than REVEAL_BUFFER_MS of spare margin for network latency — if the
  // received value implies waiting more than that, it's clamped to a
  // reasonable max instead of blindly trusting another machine's clock.
  function _clampRevealAt(revealAt) {
    const now = Date.now();
    if (typeof revealAt !== 'number' || !isFinite(revealAt)) return now + REVEAL_BUFFER_MS;
    return Math.min(revealAt, now + REVEAL_MAX_WAIT_MS);
  }
  function _checkAllFinished() {
    try {
      if (_resultPresented || _revealTimer) return; // already presented or already scheduled
      const total = Math.max(1, window.LB.getMembers().length - (window.LB.getPendingKicksCount?.() || 0));
      if (!total) return;
      if (_finishedPlayers.size >= total) {
        const isFinal = _currentModeIdx >= _lobbyModes.length - 1;
        if (!_revealAt) {
          _revealAt = Date.now() + REVEAL_BUFFER_MS;
          window.LB.sendReveal(_revealAt, isFinal);
          if (window.GroupSpectate && typeof window.GroupSpectate.sendReveal === 'function') window.GroupSpectate.sendReveal(_revealAt, isFinal);
        }
        _scheduleReveal(isFinal);
      }
    } catch (e) {
      // Safety net: if ANYTHING above throws (unexpected geometry/state),
      // force the result instead of leaving the room frozen with no panel
      // or assets — _presentFinalResult/_presentIntermediateResult are
      // already idempotent (_resultPresented).
      console.warn('[LB] _checkAllFinished failed, forcing result:', e);
      if (!_resultPresented) {
        if (_currentModeIdx >= _lobbyModes.length - 1) _presentFinalResult(); else _presentIntermediateResult();
      }
    }
  }
  function _scheduleReveal(isFinal) {
    if (_revealTimer || _resultPresented) return;
    const delay = Math.max(0, (_revealAt || Date.now()) - Date.now());
    _revealTimer = setTimeout(() => {
      _revealTimer = null;
      try {
        if (isFinal) _presentFinalResult(); else _presentIntermediateResult();
      } catch (e) {}
    }, delay);
  }
  // Called when ANOTHER client's revealAt arrives (via LB.onReveal or
  // GroupSpectate.onReveal) — the FIRST to arrive wins (a locally-computed
  // _revealAt is not overwritten), so everyone ends up synced to the same
  // instant regardless of who computed it.
  function _handleRevealBroadcast(revealAt, isFinal) {
    if (_resultPresented || _revealTimer) return;
    if (!_revealAt) _revealAt = _clampRevealAt(revealAt);
    _scheduleReveal(isFinal);
  }

  // Cleans up the current game mode (flags or shapes) without closing the lobby
  function _teardownCurrentMode() {
    const teardownMode = _lobbyModes[_currentModeIdx] || 'flags';
    if (teardownMode === 'shapes') {
      window.shapesHardReset?.();
      if (typeof window.shapesClearSeed === 'function') window.shapesClearSeed();
    } else if (teardownMode === 'cities') {
      window.citiesHardReset?.();
      if (typeof window.citiesClearSeed === 'function') window.citiesClearSeed();
    } else if (teardownMode === 'monuments') {
      window.monumentsHardReset?.();
      if (typeof window.monumentsClearSeed === 'function') window.monumentsClearSeed();
    } else {
      // flagsHardReset cancels all timers/intervals/abort flags; hideFlagsMode alone leaves flagsEndTimeout running
      window.flagsHardReset?.();
      if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
    }
  }

  // Inter-mode screen: shows a partial ranking + a 10s countdown
  function _presentIntermediateResult() {
    if (_resultPresented) return;
    _resultPresented = true;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    // _stopGroupWaitPoll() directly here TOO — _exitGroupWaitAsSpectator
    // (below) only stops it if spectate-on-loan was actually entered
    // (_waitingAsGroupSpectator); now the poll also runs for any player just
    // waiting without spectating anyone (see _startGroupWaitPoll), so it
    // must be stopped from here for that case.
    _stopGroupWaitPoll();
    // If they were watching a teammate on loan (see _enterGroupWaitAsSpectator),
    // take them out BEFORE building the results screen — same order as
    // _onOpponentAbandoned in vs.js. In try/catch — same reason as in
    // _presentFinalResult: a failure here must not prevent showing the table.
    try { _exitGroupWaitAsSpectator(); } catch (e) { console.warn('[LB] exitGroupWait failed:', e); }
    _hideLobbyWaiting();
    if (typeof window._setPlaying === 'function') window._setPlaying(false);
    window._lobbyActive = false;
    _lobbyInTransition = true;
    window.LB.resetAloneGuard?.();
    window._lobbyMembers = [];
    window.LB.onScore(null);
    window.LB.onWrong(null);
    window.LB.onPlayerGone(null);
    window.LB.onPlayerBack(null);

    const nextIdx  = _currentModeIdx + 1;
    const nextMode = _lobbyModes[nextIdx];
    const screen   = document.getElementById('lobby-intermediate-screen');
    const list     = document.getElementById('lobby-intermediate-list');
    const modeTag  = document.getElementById('lobby-intermediate-mode-tag');
    const nextEl   = document.getElementById('lobby-intermediate-next');
    const nextIcon = document.getElementById('lobby-intermediate-next-icon');
    const nextName = document.getElementById('lobby-intermediate-next-name');

    if (modeTag) {
      const _activeMode = _lobbyModes[_currentModeIdx] || window.pendingGameMode;
      const modeName = (_MODE_NAMES[_activeMode] || (() => _activeMode))();
      modeTag.textContent = modeName + '  ·  ' + (_currentModeIdx + 1) + '/' + _lobbyModes.length;
    }
    if (nextEl && nextMode) {
      nextEl.style.display = 'flex';
      if (nextIcon) nextIcon.src = _MODE_ICONS[nextMode] || 'images/game1.png';
      if (nextName) nextName.textContent = (_MODE_NAMES[nextMode] || (() => nextMode))();
    } else if (nextEl) {
      nextEl.style.display = 'none';
    }

    // Build the ranking with scores accumulated so far
    const members = window.LB.getMembers().map(m => ({
      ...m,
      score: _finishedPlayers.has(m.id) ? _finishedPlayers.get(m.id) : (m.score || 0),
    }));
    members.sort((a, b) => b.score - a.score);
    // Tell a possible spectator (GroupSpectate in spectate.js) that THIS
    // member is viewing the inter screen — without this, the spectator had
    // nothing to show during the mode transition (the reported "nothing
    // shows"). Called from EVERY client reaching here (all do it
    // independently, see _checkAllFinished) — harmless, same pattern as
    // reportPostgame in vs.js. _MODE_NAMES/_MODE_ICONS are private to this
    // module — resolved HERE and sent ready-made, because spectate.js has no
    // access to those tables.
    window.LB.sendPostgame({
      kind: 'intermediate', members,
      currentModeIdx: _currentModeIdx, totalModes: _lobbyModes.length,
      modeLabel: (_MODE_NAMES[_lobbyModes[_currentModeIdx] || window.pendingGameMode] || (() => ''))(),
      nextModeName: nextMode ? (_MODE_NAMES[nextMode] || (() => nextMode))() : null,
      nextModeIcon: nextMode ? (_MODE_ICONS[nextMode] || 'images/game1.png') : null,
    });
    const myId    = window._sbUserId;
    const medals  = ['🥇', '🥈', '🥉'];
    if (list) {
      list.innerHTML = '';
      members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'lobby-result-row' + (m.id === myId ? ' is-me' : '');
        row.innerHTML =
          `<span class="lobby-result-pos">${medals[i] || (i + 1)}</span>` +
          `<div class="lobby-result-avatar-wrap"><img class="lobby-result-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false"></div>` +
          `<span class="lobby-result-name">${m.name}${m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : ''}</span>` +
          `<span class="lobby-result-score">${(m.score || 0).toLocaleString()}</span>`;
        // Each member's real frame — this row used to always show the
        // hardcoded cream ring (same bug already fixed in
        // .lobby-member-row/.lobby-result-avatar).
        window.CustomizeAssets?.applyFrame(row.querySelector('.lobby-result-avatar-wrap'), m.frameCode || '0001');
        list.appendChild(row);
      });
    }

    // Minimal background: only clouds/planet/gradients (lobby-interim-bg hides unnecessary UI)
    const ls = document.getElementById('loading-screen');
    if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; ls.classList.add('lobby-interim-bg'); }

    if (screen) screen.style.display = 'flex';
    // Hide the round countdown/timer and other game HUD left on top of the
    // inter panel (reported, "the last one left sees the countdown over the
    // temp table"). Same ids as _showLobbyResult.
    ['countdown-widget','flags-countdown-widget','shapes-countdown-widget',
     'pregame-countdown','flags-pregame-countdown','score-display','flags-score-display',
     'timeup-overlay','flags-timeup-overlay'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    try { if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame); } catch(e) {}

    // Teardown AFTER showing the overlay so the game assets stay visible
    // until the transition covers them. In try/catch: called on a player
    // who was spectating on loan, the *HardReset assume a normal game state
    // and may throw — the table already showed above, so a failure here
    // must not break anything.
    try { _teardownCurrentMode(); } catch (e) { console.warn('[LB] intermediate teardown failed:', e); }

    // 10s countdown with an animated bar
    const bar  = document.getElementById('lobby-intermediate-bar');
    const cdEl = document.getElementById('lobby-intermediate-cd');
    const INTER_MS = 10000;
    const start = Date.now();
    if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; }
    if (cdEl) cdEl.textContent = '10';
    requestAnimationFrame(() => {
      if (bar) { bar.style.transition = `width ${INTER_MS}ms linear`; bar.style.width = '0%'; }
    });
    clearInterval(_intermediateTimer);
    _intermediateTimer = setInterval(() => {
      const remain = Math.ceil((INTER_MS - (Date.now() - start)) / 1000);
      if (cdEl) cdEl.textContent = Math.max(0, remain);
      if (remain <= 0) {
        clearInterval(_intermediateTimer); _intermediateTimer = null;
        if (screen) screen.style.display = 'none';
        // The previous mode's assets that the player who spectated on loan
        // left visible behind the inter overlay (flagsSpectatorExit/etc. do
        // NOT hide them while window._vsShowingResult is true — see that
        // guard, it's deliberate so as not to empty the background under the
        // results table) must be cleaned NOW, before starting the next mode
        // — otherwise they stay stuck behind (reported, "exactly for the 2
        // who became spectators"). Reset the flag and redo the OLD mode's
        // teardown (here _currentModeIdx still points at it, before
        // advancing) — now it does hide the assets.
        // The previous mode's asset cleanup is now done by _launchLobbyGame
        // (runs gameStoppers ALWAYS when starting any mode) — see there.
        // Start the next mode
        _currentModeIdx = nextIdx;
        _finishedPlayers = new Map();
        _resultPresented = false;
        _revealAt = null; _revealTimer = null;
        _launchLobbyGame(_baseSeed, _currentModeIdx);
      }
    }, 200);
  }

  function _presentFinalResult() {
    if (_resultPresented) return;
    _resultPresented = true;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    _stopGroupWaitPoll();
    // EACH teardown step in its own try/catch — CRITICAL. This used to run
    // all at once with _showLobbyResult (showing the TABLE) only at the end.
    // _teardownCurrentMode() calls flagsHardReset/monumentsHardReset, which
    // assume a normal GAME state — called on a player who was spectating
    // another on loan (A/B who finished earlier, see
    // _enterGroupWaitAsSpectator), it threw, and since _resultPresented was
    // already true and the table showed AFTER, it never got shown:
    // permanent freeze with no table (the reported "the ones who finish
    // early stay frozen, only the last one and the spectator get the table"
    // — the last one and the external one never go through this
    // "spectating on loan" state). Now a failure in any step is logged but
    // does NOT prevent reaching _showLobbyResult.
    try { _exitGroupWaitAsSpectator(); } catch (e) { console.warn('[LB] exitGroupWait failed:', e); }
    try { _hideLobbyWaiting(); } catch (e) {}
    try { _teardownCurrentMode(); } catch (e) { console.warn('[LB] final teardown failed:', e); }
    try { if (typeof window._setPlaying === 'function') window._setPlaying(false); } catch (e) {}
    window._lobbyActive = false;
    _lobbyInTransition = false;
    window._lobbyMembers = [];
    try {
      // Process disconnects that occurred during the match (uses the LB API to access _pendingKicks)
      window.LB.processPendingKicks?.();
      window.LB.onFinished(null);
      window.LB.onScore(null);
      window.LB.onPlayerGone(null);
      window.LB.onPlayerBack(null);
      window.LB.resetToWaiting?.();
    } catch (e) { console.warn('[LB] final cleanup failed:', e); }
    // Reset multi-mode state for the next match
    _currentModeIdx = 0; _lobbyModes = []; _baseSeed = null; _modeAccScore = 0;
    try {
      // Loading screen background
      const ls = document.getElementById('loading-screen');
      if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; ls.classList.add('table-shown'); }
      if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
      if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
    } catch (e) { console.warn('[LB] final nav failed:', e); }
    // The critical step — outside all the try blocks above, guaranteed to run.
    const members = (window.LB.getMembers() || []).map(m => ({
      ...m,
      score: _finishedPlayers.has(m.id) ? _finishedPlayers.get(m.id) : (m.score || 0),
    }));
    members.sort((a, b) => b.score - a.score);
    _showLobbyResult(members);
  }

  window._lobbyHandleGameEnd = function(myFinalScore) {
    const myId = window._sbUserId;
    // Accumulate the score of every mode played so far
    _modeAccScore += myFinalScore;
    if (window.LB.getId()) window.LB.reportScore(_modeAccScore);
    _finishedPlayers.set(myId, _modeAccScore);
    window.LB.sendFinished(_modeAccScore);
    // Safety timeout: if someone disconnects and doesn't report, advance
    // anyway. Lowered from 30s to 12s — there are now TWO redundant paths
    // to learn that everyone finished while spectating on loan (see
    // GroupSpectate.onFinished and _lobbyReceiveGroupResult, both in
    // _enterGroupWaitAsSpectator), so this lifeline should almost never
    // actually fire — 30s felt like "never" if for some reason both paths
    // failed at once (the reported "they stay frozen").
    _armGroupWaitFallback();
    _showLobbyWaiting();
    _startGroupWaitPoll();
    _checkAllFinished();
    // If _checkAllFinished already determined that everyone finished (I was
    // the last to finish, or everyone finished almost together), there's
    // nobody else playing to watch — don't enter spectate. This used to
    // check ONLY _resultPresented, but since _checkAllFinished started
    // SCHEDULING the result for a shared future instant (revealAt, see
    // _scheduleReveal) instead of showing it right away, _resultPresented
    // was ALWAYS still false at this same instant (it only becomes true
    // when the scheduled timer fires, ms later) — this check never stopped
    // anything, so spectate-on-loan was entered even when everyone was
    // already known to have finished (typically when they finish almost
    // together, see _revealTimer). Inside there was nobody alive to watch
    // and the arrows had nowhere to jump — it got stuck waiting
    // indefinitely instead of showing the table (the reported "if everyone
    // finishes at the same time it shows no table and the session doesn't
    // end").
    //
    // Short margin (600ms) before committing to spectate — SAME pattern as
    // _vsHandleGameEnd in vs.js (1v1), which works well: there, if the "the
    // opponent also finished" check was done RIGHT AWAY (no waiting), an
    // almost-simultaneous finish between BOTH players made the TWO release
    // their channel to spectate each other at the same time — neither was
    // left generating real tick/round, and they were mutually waiting on
    // each other with no signal (documented there as "both want to spectate
    // the other"). In a group EXACTLY the same happens but with more than
    // two: if 3+ players finish almost together, each sees (at the
    // synchronous instant of its own _checkAllFinished, BEFORE the others'
    // 'finished' arrive over the network) that there's STILL "someone else
    // playing" — actually they finished too, their broadcast just hasn't
    // arrived yet — and enters spectate on them. If EVERYONE does this at
    // once, nobody is really left playing and everyone is mutually waiting
    // with no assets or result (the reported "everyone stays frozen with no
    // assets"). Waiting this margin gives the others' 'finished' (and the
    // _revealTimer that triggers) time to arrive BEFORE committing to
    // spectate anyone.
    setTimeout(() => {
      if (!_resultPresented && !_revealTimer) _enterGroupWaitAsSpectator();
    }, 600);
  };

  // ── Spectate teammates still playing, on loan ────────────────────────────────
  // Same mechanism as _enterWaitAsSpectator in vs.js (1v1), but watching ANY
  // of the members who haven't yet finished this round of modes, with
  // arrows to rotate between them (GroupSpectate already excludes from the
  // rotation anyone with their own 'timesup', see _finishedUids). When
  // everyone finishes, _presentIntermediateResult/_presentFinalResult take
  // this player out of here BEFORE showing the results table.
  let _waitingAsGroupSpectator = false;
  async function _enterGroupWaitAsSpectator() {
    if (_waitingAsGroupSpectator || _resultPresented) return;
    if (typeof window.openSpectatorGroup !== 'function') return;
    const lobbyId = window.LB.getId();
    if (!lobbyId) return;
    const myId = window._sbUserId;
    // Any member who isn't me and isn't yet in _finishedPlayers (the ones
    // who finished BEFORE me) — GroupSpectate needs this entry list
    // (preFinishedUids) because it's only connecting now, it never saw
    // those past 'timesup'.
    const stillPlaying = window.LB.getMembers().filter(m => m.id !== myId && !_finishedPlayers.has(m.id));
    if (!stillPlaying.length) return; // nobody else playing (shouldn't happen, _checkAllFinished would have resolved it)
    _waitingAsGroupSpectator = true;
    // Release MY connection to the 'lobby-{id}' channel BEFORE GroupSpectate
    // subscribes to the SAME topic (see releaseChannel in LB, same reason
    // as VS.releaseChannel in vs.js/1v1: Supabase Realtime doesn't allow
    // two channels subscribed to the same topic from the same client).
    // markExpectedLeave FIRST is critical: without it, my own presence
    // 'leave' was interpreted as a REAL abandonment — it landed in
    // _pendingKicks, and _checkAllFinished() subtracts that count from the
    // total of people to wait for, so the room could show results with
    // ANOTHER player still actually playing (the reported "they had time
    // left and it jumped to YOU WON"). With markExpectedLeave, that one-off
    // 'leave' is discarded without touching _pendingKicks or any "they
    // left" state.
    await window.LB.markExpectedLeave(myId);
    // Small extra margin: the await above only guarantees the broadcast
    // finished being QUEUED on the local socket, not that the server
    // already propagated it to the other clients — with several players
    // finishing almost together (all releasing their channel at once), a
    // little spare margin here beats risking this 'leave' reaching someone
    // BEFORE their 'expectleave', which is exactly the race that broke
    // everything (see the long comment in markExpectedLeave/lobby.js).
    await new Promise(resolve => setTimeout(resolve, 150));
    await window.LB.releaseChannel();
    if (_resultPresented) return; // resolved while waiting
    window.openSpectatorGroup(lobbyId, stillPlaying[0], {
      instant: true,
      preFinishedUids: Array.from(_finishedPlayers.keys()),
    });
    // While the "on loan" lasts, this is the MAIN path to learn that
    // someone else finished — my own LB channel is released, so the normal
    // _onFinished (registered below in _launchGroupGame) never fires for
    // me. GroupSpectate relays the same 'finished' event via its separate
    // channel — feeding _finishedPlayers and _checkAllFinished() here, just
    // as a normally-connected client would, instead of depending ONLY on
    // another player sending me the ready-made ranking
    // (kind:'intermediate'/'final', see _lobbyReceiveGroupResult) — if THAT
    // one-off broadcast was lost, there was no other path before but the
    // 30s lifeline (the reported "they stay frozen, the panel never
    // shows").
    // Hook the heartbeat: every tick/round of ANY member still playing (not
    // just the one I watch — see onAnyActivity in spectate.js) reschedules
    // the 12s lifeline forward — see the long comment in
    // _armGroupWaitFallback. CRITICAL that it's "any member" and not just
    // the POV: if I finished almost with another and ended up watching THEM
    // (already done, sending nothing) instead of one still playing, the POV
    // generates no heartbeat — but the one still playing DOES send ticks
    // that reach GroupSpectate anyway, so the lifeline doesn't fire early
    // (the reported "the 2 who finish early freeze").
    window._groupSpectatorHeartbeat = _armGroupWaitFallback;
    window.GroupSpectate.onAnyActivity(() => { if (_waitingAsGroupSpectator && !_resultPresented) _armGroupWaitFallback(); });
    window.GroupSpectate.onFinished((finishedUid, score) => {
      if (!_waitingAsGroupSpectator || _resultPresented) return;
      _finishedPlayers.set(finishedUid, score || 0);
      _checkAllFinished();
    });
    // Shared wall clock — see the long comment in _checkAllFinished. Needed
    // here TOO (not just LB.onReveal): while spectating on loan, the own LB
    // channel is released, so that broadcast would never arrive that way —
    // GroupSpectate relays it via its own channel (same topic).
    window.GroupSpectate.onReveal((revealAt, isFinal) => {
      if (!_waitingAsGroupSpectator) return;
      _handleRevealBroadcast(revealAt, isFinal);
    });
    // REST backup, independent of any real-time broadcast — both paths
    // above (relayed onFinished and _lobbyReceiveGroupResult) depend on an
    // ephemeral message arriving intact, and in practice they still
    // sometimes didn't fire (the reported "they stay frozen, the panel
    // never shows", even after adding those two paths). This poll queries
    // the table directly every 3s — depending on NO realtime channel — and
    // uses live_state.finished (the same field LB.sendTimesUp already
    // persists) to know who else finished.
    _startGroupWaitPoll();
  }

  // 12s lifeline — RE-ARMABLE (same pattern as _armGameEndFallback in
  // vs.js/1v1, which already fixed exactly this bug). It used to be armed
  // ONCE, fixed, counted from the instant I finished, regardless of how
  // much time the player I'm watching on loan actually had left. If that
  // player still had, say, 15s (chained +5s bonus streaks stretch a round
  // quite a bit), this lifeline fired at 12s anyway — calling
  // _presentFinalResult BEFORE the other actually finished, which with the
  // own channel released and GroupSpectate mid-way left the screen stuck
  // with no table (the reported "2s before the times-up of whoever's still
  // playing, everything freezes and the table never shows"). Now every
  // REAL tick/round of the player I watch on loan (see the heartbeat in
  // spectate.js's group callbacks) reschedules this same timer 12s forward
  // — so it only fires if that player truly went silent for 12s straight
  // (real network glitch/disconnect), not just because they had more game
  // time left than the original lifeline.
  function _armGroupWaitFallback() {
    clearTimeout(_waitingTimeout);
    _waitingTimeout = setTimeout(() => {
      _waitingTimeout = null;
      if (!window._lobbyActive && !_resultPresented) return; // already processed
      if (window._lobbyActive) {
        if (_currentModeIdx >= _lobbyModes.length - 1) _presentFinalResult(); else _presentIntermediateResult();
      }
    }, 12000);
  }

  let _groupWaitPollTimer = null;
  // This poll used to run only for whoever was spectating on loan
  // (_waitingAsGroupSpectator) — a player who ALREADY knew (locally) that
  // nobody else was playing (and so never entered spectate, see the 600ms
  // margin in _lobbyHandleGameEnd) depended ENTIRELY on receiving another's
  // 'reveal'/'finished' broadcast via their normal LB channel — if THAT
  // one-off message was lost for any network reason, they had NO other
  // path but the 12s lifeline (much slower than the other players, who if
  // they entered spectate had this same 3s poll as backup) — the reported
  // "one of them desynced and didn't get the screen". Now it runs for ANY
  // player waiting (_lobbyHandleGameEnd starts it for everyone, not just
  // whoever enters spectate), and only stops once the result is presented.
  function _startGroupWaitPoll() {
    clearInterval(_groupWaitPollTimer);
    _groupWaitPollTimer = setInterval(async () => {
      if (_resultPresented) { clearInterval(_groupWaitPollTimer); _groupWaitPollTimer = null; return; }
      try {
        const lobbyId = window.LB.getId();
        if (!lobbyId) return;
        const { data, error } = await window.sb.from('lobby_members').select('user_id, score, live_state').eq('lobby_id', lobbyId);
        if (error || !data) return;
        data.forEach(m => {
          if (m.live_state && m.live_state.finished) _finishedPlayers.set(m.user_id, m.score || 0);
        });
        _checkAllFinished();
      } catch (e) {}
    }, 3000);
  }
  function _stopGroupWaitPoll() {
    clearInterval(_groupWaitPollTimer);
    _groupWaitPollTimer = null;
  }
  async function _exitGroupWaitAsSpectator() {
    if (!_waitingAsGroupSpectator) return;
    _waitingAsGroupSpectator = false;
    if (window._groupSpectatorHeartbeat === _armGroupWaitFallback) window._groupSpectatorHeartbeat = null;
    _stopGroupWaitPoll();
    // Same flag flagsSpectatorExit/shapesSpectatorExit/etc already respect
    // (see _vsShowingResult in vs.js/spectate.js) — don't wipe the game's
    // background assets before the results screen covers them,
    // _teardownCurrentMode() handles the real reset afterward.
    window._vsShowingResult = true;
    // VISUAL spectator teardown FIRST and SYNCHRONOUS — CRITICAL. This
    // function is called (without await) at the start of _presentFinalResult/
    // _presentIntermediateResult, which IMMEDIATELY show the results table.
    // This used to do `await GroupSpectate.stop()` BEFORE closeSpectator —
    // that await yielded the thread, so _presentFinalResult continued and
    // showed the table, and ONLY AFTERWARD (when the await resolved) did
    // closeSpectator run, unmounting the spectator UI ON TOP of the
    // already-shown table — covering it, and the player was left "frozen"
    // without seeing the panel (confirmed by logs: `_presentFinalResult
    // called` came BEFORE `channel CLOSED`). 1v1 (vs.js
    // _exitWaitAsSpectator) does closeSpectator SYNCHRONOUSLY first, which
    // is why it never failed there. closeSpectator (silent branch,
    // _groupMode) already calls GroupSpectate.stop() internally.
    if (typeof window.closeSpectator === 'function') window.closeSpectator(null, true);
    // The REAL channel release + own reconnection goes async (doesn't block
    // the visual part) — waiting for GroupSpectate to actually release its
    // channel BEFORE resubscribeChannel avoids the "two channels on the
    // same topic" race.
    if (window.GroupSpectate) { try { await window.GroupSpectate.stop(); } catch (e) {} }
    window.LB.resubscribeChannel?.();
  }

  // Called from spectate.js (GroupSpectate.onPostgame) when THIS same
  // player is watching on loan and the real round-end ranking arrives
  // (kind:'intermediate'/'final') — replaces the 30s lifeline
  // (_waitingTimeout, below in _lobbyHandleGameEnd) as the way to learn
  // that everyone finished: while the "on loan" lasts, the own LB channel
  // is RELEASED (see releaseChannel in _enterGroupWaitAsSpectator), so the
  // 'finished' that would trigger _checkAllFinished() on its own never
  // reaches it — without this bridge, this player was left seeing
  // spectate.js's NEUTRAL mirror until the 30s lifeline finally showed
  // their real result (the reported "they get USER WINS as spectators,
  // their real result takes 10-15s longer"). _finishedPlayers is synced
  // with the scores already in the payload (computed by whoever sent the
  // broadcast) so the "my place" calculation comes out right, and the
  // matching real function is called — the same personalized screen any
  // player sees.
  window._lobbyReceiveGroupResult = function (payload) {
    if (!_waitingAsGroupSpectator || _resultPresented || !payload) return;
    (payload.members || []).forEach(m => { if (m && m.id) _finishedPlayers.set(m.id, m.score || 0); });
    // Do NOT call _presentFinalResult/_presentIntermediateResult DIRECTLY
    // here — that showed the result as soon as THIS one-off broadcast
    // arrived, without coordinating with the shared wall clock (_revealAt,
    // see _checkAllFinished/_scheduleReveal) that the other two paths do
    // respect (GroupSpectate.onFinished and the backup poll). With that,
    // this player could end up seeing the panel at a DIFFERENT instant
    // (before or after) than the rest of the room — exactly the reported
    // "EVERYONE has to get it at the same time". _checkAllFinished() already
    // has the same "only schedule if one isn't already running" guard.
    _checkAllFinished();
  };

  function _showLobbyResult(members) {
    _hideLobbyWaiting();
    // See the long comment in _presentIntermediateResult — same notice,
    // this time for the room's FINAL ranking.
    window.LB.sendPostgame({ kind: 'final', members });
    const myId   = window._sbUserId;
    const screen = document.getElementById('lobby-result-screen');
    const list   = document.getElementById('lobby-result-list');
    const title  = document.getElementById('lobby-result-title');
    if (!screen || !list) return;
    const myRank = members.findIndex(m => m.id === myId) + 1;
    if (title) {
      title.textContent = myRank === 1
        ? T('vs.result.win', '¡GANASTE!')
        : T('lobby.placed', 'Quedaste #{n}').replace('{n}', myRank);
      title.className = 'vs-result-title ' + (myRank === 1 ? 'win' : 'lose');
    }
    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = '';
    members.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'lobby-result-row' + (m.id === myId ? ' is-me' : '');
      row.innerHTML =
        `<span class="lobby-result-pos">${medals[i] || (i + 1)}</span>` +
        `<div class="lobby-result-avatar-wrap"><img class="lobby-result-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false"></div>` +
        `<span class="lobby-result-name">${m.name}${m.id === myId ? ' (' + T('lobby.you', 'tú') + ')' : ''}</span>` +
        `<span class="lobby-result-score">${(m.score || 0).toLocaleString()}</span>`;
      window.CustomizeAssets?.applyFrame(row.querySelector('.lobby-result-avatar-wrap'), m.frameCode || '0001');
      list.appendChild(row);
    });
    screen.style.display = 'flex';
    // Hide the round countdown/timer widget (and other game HUD) that
    // _teardownCurrentMode/hardReset doesn't always clean — without this
    // the countdown stayed visible ON TOP of the final table and remained
    // stuck even on returning to the start menu (reported by the LAST
    // player to finish, who goes through this real path, not the spectator
    // unmount). Same ids _lobbyAbandon hides.
    ['countdown-widget','flags-countdown-widget','shapes-countdown-widget',
     'pregame-countdown','flags-pregame-countdown','score-display','flags-score-display',
     'timeup-overlay','flags-timeup-overlay'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    try { if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame); } catch (e) {}
  }

  function _returnFromLobbyResult() {
    const screen = document.getElementById('lobby-result-screen');
    if (screen) screen.style.display = 'none';
    // Extra safety on returning to the menu: hide any leftover game HUD
    // (countdown/timer, etc.) — the countdown was reported showing even on
    // the start menu.
    ['countdown-widget','flags-countdown-widget','shapes-countdown-widget',
     'pregame-countdown','flags-pregame-countdown','score-display','flags-score-display',
     'timeup-overlay','flags-timeup-overlay'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    // Same reset as _vsReturnToMenu (vs.js, 1v1) — _exitGroupWaitAsSpectator
    // sets it true and nothing else in the group flow set it back to false,
    // so it stayed stuck forever (over-blocking the NEXT room's results
    // mirror, or even the normal hardReset of a solo/campaign mode in this
    // same tab).
    window._vsShowingResult = false;
    _finishedPlayers = new Map();
    _resultPresented = false;
    _revealAt = null; if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    _currentModeIdx = 0; _lobbyModes = []; _baseSeed = null; _modeAccScore = 0;
    _savedLobbyModes = [];
    if (_origCampaignBase) window.campaignBase = _origCampaignBase; // restore the js/core/campaign.js one (1-player campaign), do NOT destroy it
    clearInterval(_intermediateTimer); _intermediateTimer = null;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    const lid = window.LB.getId();
    if (lid) window.LB.reportScore(0).catch(() => {});
    window.LB.resetToWaiting?.();
    if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
    if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
    enterLobby();
    try { if (typeof playMusic === 'function' && typeof sfxMenuMusic !== 'undefined') playMusic(sfxMenuMusic); } catch(e) {}
  }

  // Leave an in-progress lobby match (power/quit button)
  window._lobbyAbandon = function() {
    _hideLobbyWaiting();
    const intScreen = document.getElementById('lobby-intermediate-screen');
    if (intScreen) intScreen.style.display = 'none';
    clearInterval(_intermediateTimer); _intermediateTimer = null;
    _stopGroupWaitPoll();
    window._vsShowingResult = false; // see the long comment in _returnFromLobbyResult
    _finishedPlayers = new Map();
    _resultPresented = false;
    _revealAt = null; if (_revealTimer) { clearTimeout(_revealTimer); _revealTimer = null; }
    _currentModeIdx = 0; _lobbyModes = []; _baseSeed = null; _modeAccScore = 0;
    if (_waitingTimeout) { clearTimeout(_waitingTimeout); _waitingTimeout = null; }
    window._lobbyActive = false;
    window._lobbyMembers = [];
    window.LB.clearPendingKicks?.();
    _savedLobbyModes = [];
    if (_origCampaignBase) window.campaignBase = _origCampaignBase; // restore the js/core/campaign.js one (1-player campaign), do NOT destroy it
    if (typeof window.flagsClearSeed === 'function') window.flagsClearSeed();
    if (typeof window.shapesClearSeed === 'function') window.shapesClearSeed();
    if (typeof window.monumentsClearSeed === 'function') window.monumentsClearSeed();
    if (window.LB.getId()) { try { window.LB.leave(); } catch (e) {} }
  };

  document.addEventListener('DOMContentLoaded', () => {
    // Start → triggers a 10s countdown (doesn't start immediately); the host can cancel.
    document.getElementById('lobby-start-btn')?.addEventListener('click', () => {
      if (window.LB.getMembers().length < 2) return;
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.LB.sendCountdown(Date.now() + 10000);
    });
    // Cancel the countdown (host)
    document.getElementById('lobby-cancel-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      window.LB.sendCancel();
    });
    // "Not ready" (any player) → notifies everyone; the host decides whether to cancel
    document.getElementById('lobby-notready-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const myName = localStorage.getItem('playerName') || T('lobby.someone', 'Alguien');
      window.LB.sendNotReady(myName);
    });
    document.getElementById('lobby-leave-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _stopCountdown();
      window.LB.leave();
      if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.leftRoom', 'Has abandonado la sala'));
      _backToVersusFromLobby();
    });
    // Room name (host): ✎ edit, ✓ confirm (Enter also confirms)
    document.getElementById('lobby-name-edit-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _beginEditName();
    });
    document.getElementById('lobby-name-confirm-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _confirmEditName();
    });
    document.getElementById('lobby-name-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); _confirmEditName(); }
    });
    // Same button reused for the spectator (see _showGroupResultMirror in
    // spectate.js, same pattern as #vs-result-back in vs.js): if
    // spectating, it closes THAT session instead of _returnFromLobbyResult()
    // (which would reset the state of a REAL room this client doesn't have).
    document.getElementById('lobby-result-back')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (window._isSpectating) {
        if (typeof window.closeSpectator === 'function') window.closeSpectator();
        return;
      }
      _returnFromLobbyResult();
    });
    document.getElementById('lobby-alone-back')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      document.getElementById('lobby-alone-screen').style.display = 'none';
    });
    const _copyCode = () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const code = window.LB.getCode();
      if (code && navigator.clipboard) navigator.clipboard.writeText(code).catch(() => {});
      if (typeof window.showVersusToast === 'function') window.showVersusToast(T('lobby.copied', '¡Código copiado!'));
    };
    document.getElementById('lobby-code-copy')?.addEventListener('click', _copyCode);

    // "+ Invite": opens the popup with online friends + copy link
    document.getElementById('lobby-invite-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _openInvitePopup();
    });
    document.getElementById('lobby-copylink-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _copyJoinLink();
    });
    document.getElementById('lobby-invite-close')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const p = document.getElementById('lobby-invite-popup'); if (p) p.style.display = 'none';
    });

    // Public/private toggle (host only)
    document.getElementById('lobby-visibility-btn')?.addEventListener('click', async () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      await window.LB.setPublic(!window.LB.isPublic());
      _updateVisibilityBtn();
      _updateInviteBtn();
      // Everyone gets the toast via the onVisibility broadcast (including the host with self:true)
    });

    // Deep-link: ?join=CODE → remember to join once there's a session
    try {
      const params = new URLSearchParams(location.search);
      const code = params.get('join');
      if (code) {
        _pendingJoinCode = code.toUpperCase();
        // clean the URL so it doesn't retry on reload
        params.delete('join');
        const qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
      }
    } catch (e) {}
    tryPendingJoin();
  });

  // ── Visibility button (host) ────────────────────────────────────────────────
  function _updateVisibilityBtn() {
    const btn = document.getElementById('lobby-visibility-btn');
    if (!btn) return;
    if (!window.LB.isHost()) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    btn.textContent = window.LB.isPublic() ? T('lobby.public', '🌐 Pública') : T('lobby.private', '🔒 Privada');
    btn.classList.toggle('is-public', window.LB.isPublic());
  }

  // Room name: the host edits it with ✎/✓; for everyone else it's live text.
  let _editingName = false;
  const _MODE_ICONS = { flags: 'images/game1.png', shapes: 'images/game2.png', cities: 'images/game3.png', monuments: 'images/game4.png' };
  const _MODE_NAMES = { flags: () => T('nav.flags', 'Banderas'), shapes: () => T('nav.shapes', 'Siluetas'), cities: () => T('nav.cities', 'Ciudades'), monuments: () => T('nav.monuments', 'Monumentos') };
  const _ALL_MODES  = ['flags', 'shapes', 'cities', 'monuments'];

  // Generates the HTML for the mode icons in match order
  function _modeIconsHtml(modes, cls = '') {
    return modes.map(m => `<img ${cls ? `class="${cls}"` : ''} src="${_MODE_ICONS[m] || 'images/game1.png'}" alt="${m}">`).join('');
  }

  function _getActiveModes(lobby) {
    if (!lobby) return ['flags'];
    // Column `modes` (array in Supabase or CSV string)
    if (lobby.modes) {
      const arr = Array.isArray(lobby.modes) ? lobby.modes : String(lobby.modes).split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) return arr;
    }
    if (!lobby.mode) return ['flags'];
    if (lobby.mode === 'all') return _ALL_MODES;
    // Fallback: modes encoded as "flags+shapes" in the `mode` field
    if (lobby.mode.includes('+')) return lobby.mode.split('+').map(s => s.trim()).filter(Boolean);
    return [lobby.mode];
  }
  function _refreshLobbyName() {
    const text  = document.getElementById('lobby-name-text');
    const edit  = document.getElementById('lobby-name-edit-btn');
    const input = document.getElementById('lobby-name-input');
    const conf  = document.getElementById('lobby-name-confirm-btn');
    if (!text) return;
    const host = window.LB.isHost();
    const storedName = window.LB.getName();
    let name;
    if (storedName) {
      name = storedName;
    } else {
      const hostMember = window.LB.getMembers().find(m => m.isHost);
      const hostN = (hostMember && hostMember.name) || T('lobby.unnamed', 'Sala');
      name = (typeof t === 'function') ? t('lobby.roomName', { name: hostN }) : hostN;
    }
    if (_editingName && host) return; // don't overwrite while editing
    text.textContent = name;
    const iconsEl = document.getElementById('lobby-mode-icons');
    if (iconsEl) {
      const modes = _getActiveModes(window.LB.getLobby());
      iconsEl.innerHTML = _modeIconsHtml(modes);
    }
    text.style.display   = '';
    if (input) input.style.display = 'none';
    if (conf)  conf.style.display  = 'none';
    if (edit)  edit.style.display  = host ? '' : 'none';
    const modeEditBtn = document.getElementById('lobby-mode-edit-btn');
    if (modeEditBtn) modeEditBtn.style.display = host ? '' : 'none';
  }
  function _beginEditName() {
    if (!window.LB.isHost()) return;
    _editingName = true;
    const text  = document.getElementById('lobby-name-text');
    const edit  = document.getElementById('lobby-name-edit-btn');
    const input = document.getElementById('lobby-name-input');
    const conf  = document.getElementById('lobby-name-confirm-btn');
    if (text) text.style.display = 'none';
    if (edit) edit.style.display = 'none';
    if (input) { input.style.display = ''; input.value = window.LB.getName() || ''; input.focus(); input.select(); }
    if (conf) conf.style.display = '';
  }
  async function _confirmEditName() {
    const input = document.getElementById('lobby-name-input');
    const val = input ? (input.value || '').trim() : '';
    _editingName = false;
    if (val) await window.LB.setName(val); // propagates to everyone via realtime
    _refreshLobbyName();
  }

  // ── Mode picker (multi-select + order) ───────────────────────────────────────

  function _renderPickerOrderList() {
    const section = document.getElementById('lobby-mode-order-section');
    const list    = document.getElementById('lobby-mode-order-list');
    if (!section || !list) return;
    section.style.display = _pendingModesOrder.length > 1 ? '' : 'none';
    list.innerHTML = '';
    _pendingModesOrder.forEach((mode, idx) => {
      const item = document.createElement('div');
      item.className = 'lobby-mode-order-item';
      item.dataset.mode = mode;
      item.innerHTML =
        `<span class="lobby-mode-drag-handle">⠿</span>` +
        `<span class="lobby-mode-order-num">${idx + 1}</span>` +
        `<img src="${_MODE_ICONS[mode] || 'images/game1.png'}" alt="${mode}">` +
        `<span class="lobby-mode-order-name">${(_MODE_NAMES[mode] || (() => mode))()}</span>`;
      list.appendChild(item);
    });
  }

  // iOS-style drag-and-drop: the item levitates, siblings slide smoothly
  function _setupOrderListDrag() {
    const list = document.getElementById('lobby-mode-order-list');
    if (!list) return;
    let drag = null;

    list.addEventListener('pointerdown', e => {
      if (drag) return;
      const item = e.target.closest('.lobby-mode-order-item');
      if (!item || !list.contains(item)) return;
      e.preventDefault();
      item.setPointerCapture(e.pointerId);

      const allItems = [...list.querySelectorAll('.lobby-mode-order-item')];
      const fromIdx  = allItems.indexOf(item);
      const rects    = allItems.map(el => el.getBoundingClientRect());

      // Scale factor: #app-stage uses transform:scale(); getBoundingClientRect
      // returns viewport coordinates (post-scale) but translateY operates in
      // local coordinates (pre-scale). All deltas must be divided by scale.
      const scale = rects[0].width / item.offsetWidth || 1;

      const itemH = rects[0].height;
      const gap   = allItems.length > 1 ? rects[1].top - rects[0].bottom : 0;
      // slotH in local coordinates (what translateY understands)
      const slotH = (itemH + gap) / scale;

      // Lift the item with animation
      item.style.transition = 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s';
      item.style.transform  = 'scale(1.06)';
      item.style.boxShadow  = '0 10px 30px rgba(0,0,0,0.55)';
      item.style.zIndex     = '20';
      item.style.position   = 'relative';

      // Enable a smooth transition on the siblings
      allItems.forEach(el => {
        if (el !== item) el.style.transition = 'transform 0.15s cubic-bezier(0.25,0.46,0.45,0.94)';
      });

      drag = { item, allItems, fromIdx, toIdx: fromIdx, rects, slotH, scale, startY: e.clientY, lifted: false };
    });

    list.addEventListener('pointermove', e => {
      if (!drag) return;
      e.preventDefault();
      // deltaY in local coordinates
      const deltaY = (e.clientY - drag.startY) / drag.scale;

      // First move: drop the transform transition to follow the finger without lag
      if (!drag.lifted) {
        drag.lifted = true;
        drag.item.style.transition = 'box-shadow 0.18s';
      }
      drag.item.style.transform = `translateY(${deltaY}px) scale(1.06)`;

      // Compute the target index by comparing e.clientY against the original centers (viewport)
      let toIdx = 0;
      drag.rects.forEach((r, i) => { if (e.clientY > r.top + r.height / 2) toIdx = i; });
      toIdx = Math.max(0, Math.min(drag.allItems.length - 1, toIdx));

      if (toIdx !== drag.toIdx) {
        drag.toIdx = toIdx;
        drag.allItems.forEach((el, i) => {
          if (el === drag.item) return;
          if (drag.fromIdx < toIdx && i > drag.fromIdx && i <= toIdx) {
            el.style.transform = `translateY(-${drag.slotH}px)`;
          } else if (drag.fromIdx > toIdx && i >= toIdx && i < drag.fromIdx) {
            el.style.transform = `translateY(${drag.slotH}px)`;
          } else {
            el.style.transform = '';
          }
        });
      }
    });

    const _finishDrag = () => {
      if (!drag) return;
      const { item, allItems, fromIdx, toIdx } = drag;
      drag = null;
      allItems.forEach(el => {
        el.style.transition = '';
        el.style.transform  = '';
        el.style.zIndex     = '';
        el.style.position   = '';
        el.style.boxShadow  = '';
      });
      if (toIdx !== fromIdx) {
        const [moved] = _pendingModesOrder.splice(fromIdx, 1);
        _pendingModesOrder.splice(toIdx, 0, moved);
      }
      _renderPickerOrderList();
      _renderPickerGridBadges();
    };

    list.addEventListener('pointerup',     _finishDrag);
    list.addEventListener('pointercancel', _finishDrag);
  }

  function _renderPickerGridBadges() {
    document.querySelectorAll('.lobby-mode-pick-btn').forEach(btn => {
      const mode = btn.dataset.mode;
      const idx  = _pendingModesOrder.indexOf(mode);
      const numEl = btn.querySelector('.lobby-mode-pick-num');
      btn.classList.toggle('is-selected', idx >= 0);
      if (numEl) {
        numEl.style.display = idx >= 0 ? 'flex' : 'none';
        numEl.textContent   = idx >= 0 ? String(idx + 1) : '';
      }
    });
  }

  function _showModePicker() {
    const pop = document.getElementById('lobby-mode-picker-popup');
    if (!pop) return;
    _pendingModesOrder = [..._getActiveModes(window.LB.getLobby())];
    _renderPickerGridBadges();
    _renderPickerOrderList();
    pop.style.display = 'flex';
  }

  document.addEventListener('DOMContentLoaded', () => {
    _setupOrderListDrag();

    document.getElementById('lobby-mode-edit-btn')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      _showModePicker();
    });

    // Mode toggle in the grid
    document.getElementById('lobby-mode-picker-popup')?.addEventListener('click', e => {
      const btn = e.target.closest('.lobby-mode-pick-btn');
      if (btn && !btn.disabled) {
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const mode = btn.dataset.mode;
        const idx  = _pendingModesOrder.indexOf(mode);
        if (idx >= 0) {
          _pendingModesOrder.splice(idx, 1); // deselect
        } else {
          _pendingModesOrder.push(mode); // select at the end
        }
        _renderPickerGridBadges();
        _renderPickerOrderList();
        return;
      }
    });

    // Save
    document.getElementById('lobby-mode-picker-save')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (_pendingModesOrder.length === 0) return; // at least 1 mode
      window.LB.setModes([..._pendingModesOrder]);
      document.getElementById('lobby-mode-picker-popup').style.display = 'none';
      if (typeof window.showVersusToast === 'function') {
        const names = _pendingModesOrder.map(m => (_MODE_NAMES[m] || (() => m))()).join(' → ');
        window.showVersusToast(names);
      }
    });

    // Click on the overlay (background) closes without saving
    document.getElementById('lobby-mode-picker-popup')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) {
        document.getElementById('lobby-mode-picker-popup').style.display = 'none';
      }
    });
  });

  // ── Invite link + deep-link ─────────────────────────────────────────────────
  function _buildJoinLink() {
    const code = window.LB.getCode();
    if (!code) return '';
    return location.origin + location.pathname + '?join=' + code;
  }
  function _copyJoinLink(friendName) {
    const link = _buildJoinLink();
    if (link && navigator.clipboard) navigator.clipboard.writeText(link).catch(() => {});
    if (typeof window.showVersusToast === 'function') {
      window.showVersusToast(friendName
        ? T('lobby.sharedWith', 'Compartí el link con {name}').replace('{name}', friendName)
        : T('lobby.linkCopied', '¡Link copiado!'));
    }
  }

  let _pendingJoinCode = null;
  function tryPendingJoin() {
    if (!_pendingJoinCode) return;
    if (!window._accountLoggedIn || !window._sbUserId) return; // retried on login
    const code = _pendingJoinCode;
    _pendingJoinCode = null;
    (async () => {
      try {
        await window.LB.joinByCode(code);
        if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
        if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
        enterLobby();
      } catch (e) {
        const msg = e && e.message === 'started'
          ? T('lobby.started', 'La partida ya empezó')
          : T('lobby.notFound', 'Sala no encontrada');
        if (typeof window.showVersusToast === 'function') window.showVersusToast(msg);
      }
    })();
  }
  window.tryPendingLobbyJoin = tryPendingJoin;

  // Restores my waiting room on login (so "My room" appears)
  async function tryRestore() {
    try {
      const lobby = await window.LB.restoreActive();
      if (lobby) enterLobby(); // wires callbacks and renders (hidden until opened)
    } catch (e) {}
  }
  window.tryRestoreLobby = tryRestore;

  // ── Friend invite popup (with a 30s per-friend cooldown) ─────────────────────
  const INVITE_COOLDOWN_MS = 30000;
  const _inviteCooldowns = {}; // friendId → expiration timestamp

  function _setInviteBtnCooldown(btn, friendId) {
    const until = _inviteCooldowns[friendId] || 0;
    const remain = Math.ceil((until - Date.now()) / 1000);
    if (remain <= 0) {
      btn.disabled = false;
      btn.classList.remove('disabled');
      btn.textContent = T('lobby.invite', '+ Invitar');
      return false;
    }
    btn.disabled = true;
    btn.classList.add('disabled');
    btn.textContent = T('lobby.disabled', 'Inhabilitado') + ' ' + remain + 's';
    clearTimeout(btn._cdT);
    btn._cdT = setTimeout(() => _setInviteBtnCooldown(btn, friendId), 1000);
    return true;
  }

  function _renderInviteList(list, empty) {
    Array.from(list.children).forEach(el => { if (el.id !== 'lobby-invite-empty') el.remove(); });
    const friends = (typeof getFriends === 'function') ? getFriends() : [];
    const memberIds = new Set(window.LB.getMembers().map(m => m.id));
    const statusOf = f => (typeof getStatusObj === 'function')
      ? getStatusObj(f).cls
      : ((f.last_active && (Date.now() - new Date(f.last_active)) / 1000 < 120) ? (f.is_playing ? 'playing' : 'online') : 'offline');
    const shown = friends.filter(f => statusOf(f) !== 'offline');
    if (!shown.length) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    shown.forEach(f => {
      const inRoom  = memberIds.has(f.id);
      const playing = statusOf(f) === 'playing';
      const statusTxt = playing ? T('social.playing', 'Jugando') : T('versus.online', 'Conectado');
      const row = document.createElement('div');
      row.className = 'versus-friend-row' + (playing ? ' playing' : '')
        + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(f.cellCode) ? ' cell-light-text' : '');
      const btnHtml = inRoom
        ? `<button class="versus-challenge-btn disabled" disabled>${T('lobby.inRoom', 'En la sala')}</button>`
        : `<button class="versus-challenge-btn" data-id="${f.id}" data-name="${f.name}">${T('lobby.invite', '+ Invitar')}</button>`;
      row.innerHTML =
        `<div class="versus-friend-avatar-wrap"><img class="versus-friend-avatar" src="${f.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false"></div>` +
        `<div class="versus-friend-info"><span class="versus-friend-name">${f.name}</span>` +
        `<span class="versus-friend-status${playing ? ' playing' : ''}"><span class="versus-friend-dot${playing ? ' playing' : ''}"></span>${statusTxt}</span></div>` +
        btnHtml;
      // Real frame (pfp ring) + real background cell — this row used to
      // always show the hardcoded ring/background (same bug already fixed
      // in _renderMembers/.lobby-member-row). applyCellForStatus (not
      // cellUrl directly) so it blinks with the -green variant if they're
      // playing, same as in the social panel.
      window.CustomizeAssets?.applyFrame(row.querySelector('.versus-friend-avatar-wrap'), f.frameCode || '0001');
      window.CustomizeAssets?.applyCellForStatus(row, f.cellCode || '0001', playing ? 'playing' : 'online');
      list.appendChild(row);
    });
    list.querySelectorAll('.versus-challenge-btn[data-id]').forEach(btn => {
      _setInviteBtnCooldown(btn, btn.dataset.id);
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const fid = btn.dataset.id;
        const myName = localStorage.getItem('playerName') || T('lobby.someone', 'Alguien');
        window.LB.sendInvite(fid, { code: window.LB.getCode(), lobbyId: window.LB.getId(), fromName: myName });
        if (typeof window.showVersusToast === 'function') {
          window.showVersusToast(T('lobby.sentInvite', 'Invitación enviada a {name}').replace('{name}', btn.dataset.name));
        }
        _inviteCooldowns[fid] = Date.now() + INVITE_COOLDOWN_MS;
        _setInviteBtnCooldown(btn, fid);
      });
    });
  }

  function _openInvitePopup() {
    const pop   = document.getElementById('lobby-invite-popup');
    const list  = document.getElementById('lobby-invite-list');
    const empty = document.getElementById('lobby-invite-empty');
    if (!pop || !list) return;
    _renderInviteList(list, empty);
    pop.style.display = 'flex';
  }

  // Called from the realtime handler in js/social/social-realtime.js when a friend's is_playing changes
  window._refreshLobbyInviteList = function() {
    const pop   = document.getElementById('lobby-invite-popup');
    const list  = document.getElementById('lobby-invite-list');
    const empty = document.getElementById('lobby-invite-empty');
    if (!pop || !list || pop.style.display === 'none' || !pop.offsetParent) return;
    _renderInviteList(list, empty);
  };

  // ── NON-blocking notification at the top (generic: room invites and 1v1 challenges) ─
  // The bar counts ONCE (10s) from arrival; entering/leaving panels does NOT
  // reset it. ✓ accepts, ✗ declines, and on expiry the decline runs.
  const NOTIF_MS = 10000;
  let _notifTimer   = null;
  let _notifAccept  = null;
  let _notifDecline = null;
  let _queuedNotif  = null;  // invite received while playing → shown on return

  // Deliver the queued invite when the match ends (called by _setPlaying(false))
  window.flushQueuedInvite = function() {
    if (_queuedNotif && !window._isPlaying && !window._lobbyActive && !window._vsActive) {
      const o = _queuedNotif; _queuedNotif = null; showInviteNotif(o);
    }
  };

  function _setInviteBadges(show) {
    ['play-invite-badge', 'versus-invite-badge'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = show ? 'flex' : 'none';
    });
  }

  // opts: { name, sub, onAccept, onDecline }  (onDecline also runs on expiry)
  function showInviteNotif(opts) {
    opts = opts || {};
    // If I'm playing, queue it and deliver when the match ends.
    if (window._isPlaying || window._lobbyActive || window._vsActive) { _queuedNotif = opts; return; }
    const banner = document.getElementById('lobby-invite-notif');
    const bar    = document.getElementById('lobby-notif-bar');
    if (!banner) return;
    _notifAccept  = opts.onAccept  || null;
    _notifDecline = opts.onDecline || null;
    const nameEl = document.getElementById('lobby-notif-name');
    if (nameEl) nameEl.textContent = opts.name || T('lobby.someone', 'Alguien');
    const subEl = document.getElementById('lobby-notif-sub');
    if (subEl) subEl.textContent = opts.sub || T('lobby.invitedYou', 'te invitó a su sala');
    banner.style.display = 'block';
    _setInviteBadges(true);
    if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '100%';
      void bar.offsetWidth; // force reflow so the 100% is applied before animating
      bar.style.transition = 'width ' + NOTIF_MS + 'ms linear';
      bar.style.width = '0%';
    }
    clearTimeout(_notifTimer);
    if (!opts.persistent) {
      _notifTimer = setTimeout(() => { _dismissNotif(); }, NOTIF_MS);
    }
  }
  function _dismissNotif() {
    const banner = document.getElementById('lobby-invite-notif');
    if (banner) {
      banner.classList.add('leaving');
      setTimeout(() => { banner.style.display = 'none'; banner.classList.remove('leaving'); }, 300);
    }
    _setInviteBadges(false);
    clearTimeout(_notifTimer);
    _notifAccept = _notifDecline = null;
  }
  window.showInviteNotif = showInviteNotif;
  window.dismissInviteNotif = _dismissNotif; // e.g. when the host cancels the challenge

  // ── Notifications inbox ────────────────────────────────────────────────────
  const INBOX_TTL = 5 * 60 * 1000; // 5 minutes; also cleared on close/refresh (sessionStorage)

  function _inboxKey() { return window._sbUserId ? ('vs_inbox_' + window._sbUserId) : null; }

  function _loadInbox() {
    const key = _inboxKey(); if (!key) return [];
    try { return (JSON.parse(sessionStorage.getItem(key) || '[]')).filter(x => x && x.ts && (Date.now() - x.ts < INBOX_TTL)); }
    catch { return []; }
  }

  function _saveInbox(items) {
    const key = _inboxKey(); if (!key) return;
    try { sessionStorage.setItem(key, JSON.stringify(items.filter(x => Date.now() - x.ts < INBOX_TTL).slice(0, 20))); } catch {}
  }

  function _pushToInbox(item) {
    const inbox = _loadInbox();
    if (inbox.find(x => x.id === item.id)) return;
    inbox.unshift(item);
    _saveInbox(inbox);
    _refreshBell();
  }

  function _removeFromInbox(id) {
    _saveInbox(_loadInbox().filter(x => x.id !== id));
    _refreshBell();
  }

  function _refreshBell() {
    const badge = document.getElementById('versus-notif-badge');
    if (!badge) return;
    const count = _loadInbox().length;
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? '' : 'none';
  }

  window.addVersusNotif    = _pushToInbox;
  window.removeVersusNotif = _removeFromInbox;
  window.refreshVersusBell = _refreshBell;

  // Automatically declines all pending 1v1 challenges in the inbox (e.g. when starting to play)
  window._autoDismissVsInvites = function() {
    const inbox = _loadInbox();
    const vsItems = inbox.filter(x => x.type === 'vs');
    if (!vsItems.length) return;
    vsItems.forEach(item => {
      _removeFromInbox(item.id);
      if (window.VS && typeof window.VS.decline === 'function') window.VS.decline(item.matchId).catch(() => {});
    });
    _dismissNotif();
    _closeNotifPanel();
  };

  function _timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 60000);
    if (diff < 1) return T('notif.timeNow', 'Ahora');
    return T('notif.timeMin', 'Hace {n} min').replace('{n}', diff);
  }

  let _notifPanelOpen = false;

  function _closeNotifPanel() {
    const p = document.getElementById('versus-notif-panel');
    if (p) p.style.display = 'none';
    _notifPanelOpen = false;
  }

  function _renderNotifList() {
    const list  = document.getElementById('versus-notif-list');
    const empty = document.getElementById('versus-notif-empty');
    if (!list) return;

    const inbox = _loadInbox();
    list.innerHTML = '';
    if (empty) empty.style.display = inbox.length ? 'none' : '';

    inbox.forEach(item => {
      const typeLabel = item.type === 'vs'
        ? T('notif.vs1v1', 'Reto 1v1')
        : T('notif.lobbyInvite', 'Invitación a sala');
      const row = document.createElement('div');
      row.className = 'versus-notif-item';
      row.innerHTML =
        `<img class="versus-notif-avatar" src="${item.fromAvatar || 'images/profilepic/ppdefault.png'}" onerror="this.src='images/profilepic/ppdefault.png'">` +
        `<div class="versus-notif-info">` +
          `<span class="versus-notif-name">${item.fromName || '?'}</span>` +
          `<span class="versus-notif-type">${typeLabel}</span>` +
          `<span class="versus-notif-time">${_timeAgo(item.ts)}</span>` +
        `</div>` +
        `<div class="versus-notif-btns">` +
          `<button class="versus-notif-btn accept" data-id="${item.id}">✓</button>` +
          `<button class="versus-notif-btn decline" data-id="${item.id}">✗</button>` +
        `</div>`;
      list.appendChild(row);
    });

    list.querySelectorAll('.versus-notif-btn.accept').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const item = _loadInbox().find(x => x.id === btn.dataset.id);
        if (!item) return;
        _removeFromInbox(item.id);
        _dismissNotif(); // also close the popup banner if visible
        _closeNotifPanel();
        if (item.type === 'vs') {
          if (typeof window._vsAcceptFromInbox === 'function') await window._vsAcceptFromInbox(item.matchId);
        } else {
          try {
            await window.LB.joinByCode(item.code);
            if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
            if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
            enterLobby();
          } catch(e2) {
            const msg = (e2 && e2.message === 'started') ? T('lobby.started', 'La partida ya empezó') : T('lobby.notFound', 'Sala no encontrada');
            if (typeof window.showVersusToast === 'function') window.showVersusToast(msg);
          }
        }
      });
    });

    list.querySelectorAll('.versus-notif-btn.decline').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        const item = _loadInbox().find(x => x.id === btn.dataset.id);
        _removeFromInbox(btn.dataset.id);
        if (item && item.type === 'vs' && window.VS) window.VS.decline(item.matchId);
        _renderNotifList();
      });
    });
  }

  // Opens the panel NOW with what's in cache (sessionStorage) — doesn't wait
  // for the server, so the bell button never "does nothing" if the
  // connection is hung. The DB query for new invites runs separately, with
  // a timeout, and updates the list if it arrives in time.
  async function _renderNotifPanel() {
    const panel = document.getElementById('versus-notif-panel');
    if (!panel) return;
    _renderNotifList();
    panel.style.display = '';
    _notifPanelOpen = true;

    const uid = window._sbUserId;
    if (uid && window.sb) {
      try {
        const _p = window.sb.from('matches')
          .select('id, host_id, created_at').eq('guest_id', uid).eq('status', 'pending')
          .order('created_at', { ascending: false }).limit(5);
        const res = typeof window.withConnCheck === 'function' ? await window.withConnCheck(_p, 6000) : await _p;
        const data = res ? res.data : null;
        if (data) {
          data.forEach(m => {
            const friends = (typeof getFriends === 'function') ? getFriends() : [];
            const host = friends.find(f => f.id === m.host_id);
            _pushToInbox({
              type: 'vs', id: m.id, matchId: m.id,
              fromName: host ? host.name : 'Alguien',
              fromAvatar: host ? host.avatar : 'images/profilepic/ppdefault.png',
              ts: new Date(m.created_at).getTime() || Date.now()
            });
          });
          if (_notifPanelOpen) _renderNotifList();
        }
      } catch {}
    }
  }

  // Room (group) invite: uses the generic banner
  function showIncomingInvite(payload) {
    if (!payload || !payload.code) return;
    // Save to inbox
    _pushToInbox({
      type: 'lobby', id: payload.code, code: payload.code,
      fromName: payload.fromName || '?',
      fromAvatar: payload.fromAvatar || 'images/profilepic/ppdefault.png',
      ts: Date.now()
    });
    showInviteNotif({
      name: payload.fromName,
      sub:  T('lobby.invitedYou', 'te invitó a su sala'),
      onAccept: async () => {
        _removeFromInbox(payload.code);
        _closeNotifPanel(); // close the inbox if it was open
        try {
          await window.LB.joinByCode(payload.code);
          if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
          if (typeof window.versusGoTo === 'function') window.versusGoTo('lobby');
          enterLobby();
        } catch (e) {
          const msg = (e && e.message === 'started') ? T('lobby.started', 'La partida ya empezó') : T('lobby.notFound', 'Sala no encontrada');
          if (typeof window.showVersusToast === 'function') window.showVersusToast(msg);
        }
      },
      onDecline: () => { _removeFromInbox(payload.code); },
    });
  }
  window.showLobbyIncomingInvite = showIncomingInvite;

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lobby-notif-accept')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const a = _notifAccept; _dismissNotif(); if (a) a();
    });
    document.getElementById('lobby-notif-decline')?.addEventListener('click', () => {
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      const d = _notifDecline; _dismissNotif(); if (d) d();
    });

    // Versus panel bell: opens/closes the invites inbox
    document.getElementById('versus-notif-bell')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (_notifPanelOpen) { _closeNotifPanel(); return; }
      _renderNotifPanel();
    });
    // Close the panel on click outside it
    document.addEventListener('click', (e) => {
      if (!_notifPanelOpen) return;
      const panel = document.getElementById('versus-notif-panel');
      if (panel && !panel.contains(e.target)) _closeNotifPanel();
    });
  });

  // Keep the invite popup up to date with friends' real status (online/
  // playing/in the room), same as the social panel. Re-rendered on every refresh.
  if (typeof onFriendsUpdate === 'function') {
    onFriendsUpdate(() => {
      const p = document.getElementById('lobby-invite-popup');
      if (p && p.style.display !== 'none') _openInvitePopup();
    });
  }

  // Re-render room names when language switches (names are derived from i18n, not stored in DB)
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      _refreshLobbyName();
      const screen = document.getElementById('versus-screen-aleatorio');
      if (screen && screen.style.display !== 'none') loadPublicList(true);
    });
  }

  // ── Public rooms panel realtime ─────────────────────────────────────────────
  // _publicChannel: postgres_changes (lobby_members/lobbies) → periodic refresh
  // _publicSignalReceiveCh: receives the host's broadcasts (different channel to avoid collision)
  let _publicChannel = null;
  let _publicSignalReceiveCh = null;

  // Local cache of custom names received by broadcast.
  // Survives loadPublicList re-renders so the name isn't lost.
  const _roomNameCache = new Map(); // lobbyId → custom name

  let _publicRefreshTimer = null;
  function _schedulePublicRefresh(msg) {
    const p = msg?.payload;
    if (p?.id && typeof p.name !== 'undefined') {
      // Name updated by the host: cache it and apply to the DOM now
      _roomNameCache.set(String(p.id), p.name);
      const list = document.getElementById('versus-public-list');
      if (list) {
        const rowEl = list.querySelector(`.versus-friend-row[data-lobby-id="${p.id}"]`);
        const nameSpan = rowEl?.querySelector('.versus-friend-name');
        if (nameSpan) nameSpan.textContent = p.name;
      }
      // Don't re-render: the cache ensures loadPublicList also uses the right name
      return;
    }
    clearTimeout(_publicRefreshTimer);
    _publicRefreshTimer = setTimeout(() => loadPublicList(true), 400);
  }

  let _publicPollTimer = null;

  function startPublicRealtime() {
    if (_publicChannel || _publicSignalReceiveCh) return;
    // postgres_changes channel — different name from 'pub-room-signals' to avoid interference
    _publicChannel = window.sb.channel('public-lobbies-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobbies' }, _schedulePublicRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lobby_members' }, _schedulePublicRefresh)
      .subscribe();
    // Host signals channel: receives broadcasts when the host changes name/mode/visibility
    _publicSignalReceiveCh = window.sb.channel('pub-room-signals')
      .on('broadcast', { event: 'room-update' }, _schedulePublicRefresh)
      .subscribe();
    // Backup polling: in case postgres_changes isn't enabled in Supabase
    _publicPollTimer = setInterval(() => loadPublicList(true), 6000);
  }

  function stopPublicRealtime() {
    if (_publicChannel) { try { _publicChannel.unsubscribe(); } catch (e) {} _publicChannel = null; }
    if (_publicSignalReceiveCh) { try { _publicSignalReceiveCh.unsubscribe(); } catch (e) {} _publicSignalReceiveCh = null; }
    clearInterval(_publicPollTimer);
    _publicPollTimer = null;
    // Don't clear _roomNameCache: it survives between panel opens so the name persists
  }

  return { enterLobby, loadPublicList, startPublicRealtime, stopPublicRealtime, tryPendingJoin, tryRestore, showIncomingInvite, showInviteNotif, cancelCountdown: _stopCountdown };
})();
