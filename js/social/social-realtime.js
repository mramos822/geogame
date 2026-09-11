// ============================================================================
// social/social-realtime.js — Supabase Realtime channels for friends
// (online/playing status, friendship changes) + backup polls (5s) + requests
// badge + live patching of social-panel rows.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

let _friendRealtimeChannel = null;
let _friendshipsChannel    = null;
let _knownRequestIds       = null; // null = first load, don't show notif
let _socialReloadTimer     = null;
function _debouncedLoadSocial() {
  clearTimeout(_socialReloadTimer);
  _socialReloadTimer = setTimeout(() => loadSocialData(false), 400);
}
let _socialListPollInterval = null;

function _patchFriendStatusInDOM(friendId) {
  const f = socialData.friends.find(x => x.id === friendId);
  if (!f) return;
  const st = getStatusObj(f);
  const rk = (typeof getRank === 'function') ? getRank(f.score) : null;
  document.querySelectorAll(`.loading-social-row[data-friend-id="${friendId}"]`).forEach(row => {
    if (row.querySelector('.loading-social-status')) {
      const prevCls = (row.className.match(/status-(\w+)/) || [])[1];
      row.className = row.className.replace(/status-\w+/, 'status-' + st.cls);
      if (prevCls !== st.cls) window.CustomizeAssets.applyCellForStatus(row, f.cellCode, st.cls);
      const statusEl = row.querySelector('.loading-social-status');
      if (statusEl && prevCls !== st.cls) {
        statusEl.innerHTML = `<span class="dot ${st.cls}"></span>${socialStatusText(f)}`;
      } else if (statusEl) {
        // Only update the text, don't touch the dot (doesn't restart the animation)
        const textNode = statusEl.lastChild;
        const newText = socialStatusText(f);
        if (textNode && textNode.nodeType === Node.TEXT_NODE) textNode.textContent = newText;
        else if (textNode && textNode.nodeType !== Node.ELEMENT_NODE) statusEl.innerHTML = `<span class="dot ${st.cls}"></span>${newText}`;
      }
    }
    const avatarEl = row.querySelector('.loading-social-avatar');
    if (avatarEl && f.avatar) avatarEl.src = f.avatar;
    const scoreVal = row.querySelector('.loading-social-score-val');
    if (scoreVal) scoreVal.textContent = f.score.toLocaleString();
    const rankName = row.querySelector('.loading-social-rankname');
    if (rankName && rk) rankName.textContent = rk.name;
    const rankImg = row.querySelector('.loading-social-emote');
    if (rankImg && rk) rankImg.src = rk.img;
    // Spectate eye: add/remove live when is_playing/is_practicing changes while
    // the row is already on screen (otherwise it stayed stale until the next
    // full renderSocialFriends()). Lives INSIDE .loading-social-score (left of
    // points.png, see CSS) rather than next to the name.
    const scoreBox = row.querySelector('.loading-social-score');
    if (scoreBox) {
      const shouldShowEye = st.cls === 'playing' && !f.is_practicing;
      let eyeEl = scoreBox.querySelector('.social-spectate-eye');
      if (shouldShowEye && !eyeEl) {
        eyeEl = document.createElement('img');
        eyeEl.className = 'social-spectate-eye';
        eyeEl.src = 'images/spectate.png';
        eyeEl.alt = '';
        eyeEl.draggable = false;
        eyeEl.oncontextmenu = () => false;
        eyeEl.title = 'Ver partida';
        eyeEl.addEventListener('click', (e) => { e.stopPropagation(); openSpectatorForFriend(f); });
        scoreBox.insertBefore(eyeEl, scoreBox.firstChild);
      } else if (!shouldShowEye && eyeEl) {
        eyeEl.remove();
      }
    }
  });
  // If that friend's detail panel is open, update it too
  if (currentFriendProfile?.id === friendId) {
    currentFriendProfile.last_active = f.last_active;
    currentFriendProfile.is_playing  = f.is_playing;
    _applyFriendPanelStatus(currentFriendProfile);
  }
}

let _lastSubscribedFriendIds = '';
function _subscribeFriendStatuses(friendIds) {
  const key = [...friendIds].sort().join(',');
  if (_friendRealtimeChannel && key === _lastSubscribedFriendIds) return; // no change
  if (_friendRealtimeChannel) { window.sb.removeChannel(_friendRealtimeChannel); _friendRealtimeChannel = null; }
  _lastSubscribedFriendIds = key;
  if (!friendIds.length) return;
  _friendRealtimeChannel = window.sb
    .channel('friend-statuses')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles',
      filter: `id=in.(${friendIds.join(',')})`,
    }, (payload) => {
      const updated = payload.new;
      const f = socialData.friends.find(x => x.id === updated.id);
      if (!f) return;
      f.last_active   = updated.last_active;
      f.is_playing    = updated.is_playing;
      f.is_practicing = updated.is_practicing;
      // gq_streak_last_date/gq_today_time_ms: so if a friend finishes today's
      // GlobeQuiz WHILE the social panel is already open (or realtime already
      // subscribed), their card can show in your next game without waiting for a
      // full loadSocialData.
      f.gqStreakCount    = updated.gq_streak_count || 0;
      f.gqStreakLastDate = updated.gq_streak_last_date || null;
      f.gqTodayTimeMs    = (typeof updated.gq_today_time_ms === 'number') ? updated.gq_today_time_ms : null;
      // Sync the friends.js cache (used by the lobby invite panel and the
      // in-game GlobeQuiz friends bar, see buildGqFriendRows)
      if (typeof getFriends === 'function') {
        const fc = getFriends().find(x => x.id === updated.id);
        if (fc) {
          fc.last_active = updated.last_active; fc.is_playing = updated.is_playing; fc.is_practicing = updated.is_practicing;
          fc.gqStreakCount = f.gqStreakCount; fc.gqStreakLastDate = f.gqStreakLastDate; fc.gqTodayTimeMs = f.gqTodayTimeMs;
        }
      }
      // Live-refresh the room's friends panel if open
      window._refreshLobbyInviteList?.();
      // Update avatar if it changed
      if (updated.avatar_url && updated.avatar_url !== f.avatar) {
        f.avatar = updated.avatar_url;
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.avatar = updated.avatar_url;
          const pic = document.getElementById('loading-friend-pic');
          if (pic) pic.src = updated.avatar_url;
        }
        // Patch avatar in the requests/sent/blocked panels
        document.querySelectorAll(`.loading-social-row[data-friend-id="${updated.id}"] .loading-social-avatar`)
          .forEach(el => { el.src = updated.avatar_url; });
      }
      // Update play_count if it changed
      if (updated.play_count != null && updated.play_count !== f.play_count) {
        f.play_count = updated.play_count;
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.play_count = f.play_count;
          const pcEl = document.getElementById('loading-friend-play-count');
          if (pcEl) pcEl.textContent = tn('profile.friendPlayed', f.play_count);
        }
      }
      // Update score if it changed (friend finished a game). The score is the
      // friend's single best game, not the sum of the 4 modes' highscores —
      // same formula as toEntry() (sb.js) — hs_total is a campaign-run sum, a
      // different stat that must not leak into this display.
      const newScore = Math.max(updated.hs_flags||0, updated.hs_shapes||0, updated.hs_cities||0, updated.hs_monuments||0);
      if (newScore !== f.score) {
        f.score       = newScore;
        f.hs_flags    = updated.hs_flags    || 0;
        f.hs_shapes   = updated.hs_shapes   || 0;
        f.hs_cities   = updated.hs_cities   || 0;
        f.hs_monuments= updated.hs_monuments|| 0;
        // If this friend's detail panel is open, update stats
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.score        = f.score;
          currentFriendProfile.hs_flags     = f.hs_flags;
          currentFriendProfile.hs_shapes    = f.hs_shapes;
          currentFriendProfile.hs_cities    = f.hs_cities;
          currentFriendProfile.hs_monuments = f.hs_monuments;
          const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
          const modeHs2   = [f.hs_flags, f.hs_shapes, f.hs_cities, f.hs_monuments];
          const avgSums2  = [f.avg_sum_flags||0, f.avg_sum_shapes||0, f.avg_sum_cities||0, f.avg_sum_monuments||0];
          const avgCounts2= [f.play_count_flags||0, f.play_count_shapes||0, f.play_count_cities||0, f.play_count_monuments||0];
          modeHs2.forEach((hs, k) => {
            setText('loading-friend-avg'+(k+1), hs.toLocaleString());
            const avg = avgCounts2[k] > 0 ? Math.round(avgSums2[k] / avgCounts2[k]) : hs;
            setText('loading-friend-hs'+(k+1), avg.toLocaleString());
          });
          setText('loading-friend-total', f.score.toLocaleString());
          const rk = (typeof getRank === 'function') ? getRank(f.score) : null;
          const rankImg = document.getElementById('loading-friend-rank');
          if (rankImg && rk) rankImg.src = rk.img;
          const rankLabel = document.getElementById('loading-friend-rank-label');
          if (rankLabel && rk) rankLabel.textContent = rk.name;
        }
      }
      // If sorting by connection, re-render the list to re-order in realtime
      if (socialSort === 'conn') {
        const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
        const friendDetailOpen = !document.getElementById('loading-friend-group')?.classList.contains('table-gone');
        if (panelOpen && !friendDetailOpen && socialActiveTab === 'friends') {
          renderSocial(document.getElementById('loading-social-search-input')?.value || '');
        }
      } else {
        _patchFriendStatusInDOM(updated.id);
      }
      // If this friend's detail panel is open, update status
      if (currentFriendProfile?.id === updated.id) {
        currentFriendProfile.last_active = updated.last_active;
        currentFriendProfile.is_playing  = updated.is_playing;
        if (typeof _applyFriendPanelStatus === 'function') _applyFriendPanelStatus(currentFriendProfile);
      }
    })
    .subscribe();
}

function _subscribeFriendshipChanges(userId) {
  if (_friendshipsChannel) return; // already subscribed — don't recreate
  if (!userId) return;
  _friendshipsChannel = window.sb
    .channel('friendship-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
      // Supabase doesn't guarantee the full payload without REPLICA IDENTITY
      // FULL, so we reload on any event from the table.
      _debouncedLoadSocial();
    })
    .subscribe();
}

// Light badge check when the panel is closed (only counts pending).
async function _checkRequestsBadge() {
  if (!window._accountLoggedIn || !window._sbUserId) return;
  const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
  if (panelOpen) return;
  try {
    const { data } = await window.sb.from('friendships')
      .select('id').eq('user_b', window._sbUserId).eq('status', 'pending');
    const ids = (data || []).map(r => r.id);
    const badge = document.getElementById('social-notif-badge');
    if (badge) badge.style.display = ids.length > 0 ? 'flex' : 'none';
    // If `friendships` Realtime is lost to latency/network (e.g. rival in
    // Singapore), this 5s poll was the only thing noticing a new request with
    // the panel closed — but it only painted the badge, never the banner notif.
    // If an id appears that wasn't in _knownRequestIds, do the full load, which
    // does build the notif (_updateSocialBadge).
    if (_knownRequestIds !== null && ids.some(id => !_knownRequestIds.has(id))) {
      loadSocialData(false);
    }
  } catch (e) {}
}

// Poll: re-render if panel open; update badge if closed.
function _startSocialListPoll() {
  clearInterval(_socialListPollInterval);
  _socialListPollInterval = setInterval(() => {
    const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
    if (!panelOpen) { _checkRequestsBadge(); return; }
    const friendDetailOpen = !document.getElementById('loading-friend-group')?.classList.contains('table-gone');
    // Full resync every 5s: catches friendship changes Realtime missed and
    // re-orders the list if sorting by connection.
    loadSocialData(false);
  }, 5000);
}
function _stopSocialListPoll() {
  clearInterval(_socialListPollInterval);
  _socialListPollInterval = null;
}

// ── RESYNC ON RETURN TO FOREGROUND ──────────────────────────────────────────
// On mobile the OS suspends the Realtime WebSocket AND throttles/pauses timers
// while the tab is backgrounded (screen locked, app switched). Realtime does not
// replay what was missed on reconnect, so friend requests / 1v1 challenges / DMs
// that landed while away would only surface on the next slow poll tick — or not
// at all. This forces an immediate full catch-up the moment the tab is visible
// again (and on `focus` / `online`), so a notification always arrives.
let _lastResyncAt = 0;
function _resyncNotificationsNow(force) {
  if (!window._accountLoggedIn || !window._sbUserId) return;
  const now = Date.now();
  if (!force && now - _lastResyncAt < 2500) return; // collapse duplicate events
  _lastResyncAt = now;
  // Kick the Realtime socket if it dropped while backgrounded.
  try {
    const rt = window.sb && window.sb.realtime;
    if (rt && typeof rt.isConnected === 'function' && !rt.isConnected() && typeof rt.connect === 'function') {
      rt.connect();
    }
  } catch (e) {}
  // Friend requests (badge + banner) + friend list / statuses.
  try { if (typeof loadSocialData === 'function') loadSocialData(false); } catch (e) {}
  // Pending 1v1 challenges that were INSERTed while the socket was asleep.
  try { if (typeof window._vsCheckPendingInvites === 'function') window._vsCheckPendingInvites(); } catch (e) {}
  // Unread DM bubble.
  try { if (window.Chat && typeof window.Chat.refreshUnreadBadge === 'function') window.Chat.refreshUnreadBadge(); } catch (e) {}
}
window._resyncNotificationsNow = _resyncNotificationsNow;

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _resyncNotificationsNow(false);
});
window.addEventListener('focus', () => _resyncNotificationsNow(false));
window.addEventListener('online', () => _resyncNotificationsNow(true));
