// ============================================================================
// menu/rankings-panel.js — loading-screen Rankings panel (Top 100 / Friends /
// Nearby / Guests), with realtime and global-rank computation. Exposes
// window.getGlobalRankForId, window._cupForRank and window._socialAvatarHtml
// (used by profile-stats / social-panel / mapgame-leaderboard at runtime).
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// ── Rankings panel ─────────────────────────────────────────────────────────────
(function () {
  let _activeRTab = 'top100';
  let _rankingsCache = {};       // tab → rows[]
  let _rankingsRawMap = {};      // tab → { id → raw profile object } for live updates
  let _rankingsRTChannel = null; // realtime channel
  let _allGlobalRows = null;     // full sorted list for rank computation

  // 4th "Guests" tab (games from people without an account, see
  // analytics_events) — visible ONLY to this account (admin). Real security
  // lives in the get_guest_rankings RPC (SECURITY DEFINER with the same uid
  // check inside) — analytics_events has no SELECT policy for anyone, so hiding
  // the button here is just cosmetic, not what protects the data.
  const ADMIN_GUEST_RANKINGS_UID = '530cb816-8562-4e7e-a538-15c6713fcc8d';
  function _escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const SEL = 'id, username, avatar_url, hs_flags, hs_shapes, hs_cities, hs_monuments, hs_total, play_count, vs_wins, vs_losses, is_supporter, avg_sum_flags, avg_sum_shapes, avg_sum_cities, avg_sum_monuments, play_count_flags, play_count_shapes, play_count_cities, play_count_monuments, country_code, is_founder, cell_code, frame_code, panel_code, last_active, is_playing, is_practicing';

  // The ranking score is the best Gira Mundial (campaign) result: hs_flags/
  // hs_shapes/hs_cities/hs_monuments are each mode's own best game, which can
  // come from 4 different sessions never actually played together — summing
  // them would fabricate a total that was never really scored. hs_total is
  // the real sum from one completed campaign run (see js/results.js and
  // add_game_score in sb.js), so it's the only valid source for this stat.
  function _totalScore(p) {
    return p.hs_total || 0;
  }
  function _toRow(p) {
    return {
      id: p.id, name: p.username || '?',
      avatar: p.avatar_url || 'images/profilepic/ppdefault.png',
      score: _totalScore(p),
      hs_flags: p.hs_flags||0, hs_shapes: p.hs_shapes||0,
      hs_cities: p.hs_cities||0, hs_monuments: p.hs_monuments||0,
      avg_sum_flags: p.avg_sum_flags||0, avg_sum_shapes: p.avg_sum_shapes||0,
      avg_sum_cities: p.avg_sum_cities||0, avg_sum_monuments: p.avg_sum_monuments||0,
      play_count_flags: p.play_count_flags||0, play_count_shapes: p.play_count_shapes||0,
      play_count_cities: p.play_count_cities||0, play_count_monuments: p.play_count_monuments||0,
      play_count: p.play_count||0, vs_wins: p.vs_wins||0, vs_losses: p.vs_losses||0,
      is_supporter: p.is_supporter||false, country_code: p.country_code || null,
      cellCode: p.cell_code || '0001',
      frameCode: p.frame_code || '0001',
      panelCode: p.panel_code || '0001',
      // Presence: so opening this row's profile shows "last seen" like the
      // friends panel does, instead of always "Sin conexión" (the row object is
      // passed straight to openFriendProfile).
      last_active: p.last_active || null,
      is_playing: p.is_playing || false,
      is_practicing: p.is_practicing || false,
    };
  }
  function _sortAndRank(profiles) {
    return profiles
      .map(p => _toRow(p))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // ── fetchers ──────────────────────────────────────────────────────────────────
  // window.withConnCheck (final.js) wraps the request with a timeout: if it
  // takes too long or there's no internet, it shows the connection-error bubble
  // and returns null here, instead of leaving the Rankings panel loading forever.
  async function fetchTop100() {
    if (_rankingsCache.top100) return _rankingsCache.top100;
    if (!window.sb) return [];
    const res = typeof window.withConnCheck === 'function'
      ? await window.withConnCheck(window.sb.from('profiles').select(SEL).eq('hidden_from_rankings', false), 6000)
      : await window.sb.from('profiles').select(SEL).eq('hidden_from_rankings', false);
    if (!res) return [];
    const data = res.data;
    const rows = _sortAndRank(data || []).slice(0, 100);
    _rankingsCache.top100 = rows;
    _rankingsRawMap.top100 = Object.fromEntries((data||[]).map(p => [p.id, p]));
    return rows;
  }

  async function fetchTopGlobal() {
    if (_rankingsCache.global) return _rankingsCache.global;
    if (!window.sb) return [];
    const myId = window._sbProfile?.id;
    const res = typeof window.withConnCheck === 'function'
      ? await window.withConnCheck(window.sb.from('profiles').select(SEL).eq('hidden_from_rankings', false), 6000)
      : await window.sb.from('profiles').select(SEL).eq('hidden_from_rankings', false);
    if (!res) return [];
    const all = res.data;
    _allGlobalRows = _sortAndRank(all || []);
    const allRows = _allGlobalRows;
    let start = 0, end = 30;
    if (myId) {
      const myIdx = allRows.findIndex(r => r.id === myId);
      if (myIdx !== -1) {
        start = Math.max(0, myIdx - 15);
        end   = Math.min(allRows.length, start + 31);
        start = Math.max(0, end - 31);
      }
    }
    _rankingsCache.global = allRows.slice(start, end);
    _rankingsRawMap.global = Object.fromEntries((all||[]).map(p => [p.id, p]));
    return _rankingsCache.global;
  }

  async function fetchTopFriends() {
    if (_rankingsCache.friends) return _rankingsCache.friends;
    if (!window.sb || !window._accountLoggedIn) return null;
    const friends = (typeof getFriends === 'function' ? getFriends() : []);
    const friendIds = friends.map(f => f.id).filter(Boolean);
    const myId = window._sbProfile?.id;
    const allIds = myId ? [...new Set([...friendIds, myId])] : friendIds;
    if (!allIds.length) { _rankingsCache.friends = []; return []; }
    const res = typeof window.withConnCheck === 'function'
      ? await window.withConnCheck(window.sb.from('profiles').select(SEL).in('id', allIds), 6000)
      : await window.sb.from('profiles').select(SEL).in('id', allIds);
    if (!res) return [];
    const data = res.data;
    const rows = _sortAndRank(data || []);
    _rankingsCache.friends = rows;
    _rankingsRawMap.friends = Object.fromEntries((data||[]).map(p => [p.id, p]));
    return rows;
  }

  // Account-less guests, best campaign score per visitor_id — see
  // get_guest_rankings (RPC, Supabase). No real profile id (isGuest flags this
  // so renderRankings paints them differently: no custom frame/cell, no click to
  // a profile that doesn't exist).
  async function fetchTopGuests() {
    if (_rankingsCache.guests) return _rankingsCache.guests;
    if (!window.sb || window._sbUserId !== ADMIN_GUEST_RANKINGS_UID) return [];
    const { data, error } = await window.sb.rpc('get_guest_rankings', { p_limit: 100 });
    if (error) { console.warn('[rankings] guests:', error.message); return []; }
    const rows = (data || []).map((g, i) => ({
      isGuest: true,
      id: null,
      name: g.guest_name || '?',
      score: g.best_score || 0,
      country_code: g.country_code || null,
      play_count: g.play_count || 0,
      rank: i + 1,
    }));
    _rankingsCache.guests = rows;
    return rows;
  }

  // Global rank of any id (for the cup badge in profile panels). Reuses the
  // full sorted list from fetchTopGlobal.
  async function getGlobalRankForId(id) {
    if (!id) return null;
    if (!_allGlobalRows) await fetchTopGlobal();
    if (!_allGlobalRows) return null;
    const row = _allGlobalRows.find(r => r.id === id);
    return row ? row.rank : null;
  }
  window.getGlobalRankForId = getGlobalRankForId;

  // ── cup by rank ───────────────────────────────────────────────────────────────
  function _cupForRank(rank) {
    if (rank === 1) return 'cup1';
    if (rank === 2) return 'cup2';
    if (rank === 3) return 'cup3';
    if (rank <= 9) return 'cup4';
    if (rank <= 49) return 'cup5';
    if (rank <= 99) return 'cup6';
    if (rank <= 499) return 'cup7';
    if (rank <= 999) return 'cup8';
    if (rank <= 1999) return 'cup9';
    return 'cup10';
  }
  window._cupForRank = _cupForRank;

  // Circular avatar with customization frame for the Rankings/Friends rows
  // (.loading-social-avatar) — unlike the in-game .lb-avatar (see
  // _refreshLeftPreview), here the frame each user has equipped IS shown, like
  // in the large profile photo.
  function _socialAvatarHtml(avatarUrl, frameCode) {
    const CA = window.CustomizeAssets;
    const code = frameCode || '0001';
    const inset = (window.CUSTOMIZE_FRAME_INSET && window.CUSTOMIZE_FRAME_INSET[code]) || '-14.5%';
    return `<span class="loading-social-avatar-wrap cust-frame-wrap" style="--cust-frame:url('${CA.frameUrl(code)}');--cust-frame-inset:${inset}">` +
      `<img class="loading-social-avatar" src="${avatarUrl}" onerror="this.src='images/profilepic/ppdefault.png'" alt="" draggable="false" oncontextmenu="return false">` +
      `</span>`;
  }
  window._socialAvatarHtml = _socialAvatarHtml;

  // ── renderer ──────────────────────────────────────────────────────────────────
  function renderRankings(rows, tab) {
    const list = document.getElementById('loading-rankings-list');
    if (!list) return;
    if (rows === null) { list.innerHTML = '<div class="rankings-msg">' + t('rankings.notLoggedIn') + '</div>'; return; }
    if (!rows.length) {
      list.innerHTML = '<div class="rankings-msg">' + (tab === 'guests' ? 'Sin partidas de invitados todavía.' : t(tab === 'friends' ? 'rankings.noFriends' : 'rankings.noData')) + '</div>';
      return;
    }
    const myId = window._sbProfile?.id;
    list.innerHTML = '';
    rows.forEach(r => {
      const rk   = (typeof getRank === 'function') ? getRank(r.score) : { name: '', img: 'images/ranks/1.png' };
      const medalCls = r.rank === 1 ? ' rk-gold' : r.rank === 2 ? ' rk-silver' : r.rank === 3 ? ' rk-bronze' : '';
      const el = document.createElement('div');
      const flagUrl = window.flagUrlForCountryCode?.(r.country_code);
      // Guests (tab "guests", admin only): no real account — no custom
      // frame/cell (don't exist for them) and no click to a nonexistent
      // profile. guest_name is free text without the validation pipeline a real
      // username goes through, so it's escaped here (not needed on the other
      // rows, r.name comes from profiles.username validated at registration).
      if (r.isGuest) {
        el.className = 'loading-social-row';
        el.innerHTML =
          `<span class="rankings-pos${medalCls}">#${r.rank}</span>` +
          _socialAvatarHtml('images/profilepic/ppdefault.png', '0001') +
          `<div class="loading-social-info"><span class="loading-social-name">${_escapeHtml(r.name)}</span></div>` +
          `<div class="loading-social-score">` +
            (flagUrl ? `<img class="loading-social-flag" src="${flagUrl}" alt="" draggable="false" oncontextmenu="return false">` : '') +
            `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
            `<span class="loading-social-score-val">${r.score.toLocaleString()}</span>` +
          `</div>` +
          `<span class="loading-social-rankname">${rk.name}</span>` +
          `<img class="loading-social-emote" src="${rk.img}" alt="" draggable="false" oncontextmenu="return false">`;
        list.appendChild(el);
        return;
      }
      const isMe = myId && r.id === myId;
      el.className = 'loading-social-row' + (isMe ? ' is-me-row' : '') + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(r.cellCode) ? ' cell-light-text' : '');
      el.style.setProperty('--cust-cell', `url('${window.CustomizeAssets.cellUrl(r.cellCode)}')`);
      el.innerHTML =
        `<span class="rankings-pos${medalCls}">#${r.rank}</span>` +
        _socialAvatarHtml(r.avatar, r.frameCode) +
        `<div class="loading-social-info"><span class="loading-social-name">${r.name}</span></div>` +
        `<div class="loading-social-score">` +
          (flagUrl ? `<img class="loading-social-flag" src="${flagUrl}" alt="" draggable="false" oncontextmenu="return false">` : '') +
          `<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">` +
          `<span class="loading-social-score-val">${r.score.toLocaleString()}</span>` +
        `</div>` +
        `<span class="loading-social-rankname">${rk.name}</span>` +
        `<img class="loading-social-emote" src="${rk.img}" alt="" draggable="false" oncontextmenu="return false">`;
      el.addEventListener('click', async () => {
        const myId = window._sbProfile?.id;
        if (myId && r.id === myId) {
          sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
          const tg = document.getElementById('loading-table-group');
          tg?.classList.remove('table-gone');
          tg?.classList.add('above-rankings');
        } else if (typeof window.openFriendProfile === 'function') {
          // Ensure social data (friend list) is loaded before relStatus() is called inside openFriendProfile
          if (window._accountLoggedIn && !window._socialDataFetched) {
            await loadSocialData(false);
          }
          window.openFriendProfile(r);
        }
      });
      list.appendChild(el);
    });
  }

  // ── realtime ──────────────────────────────────────────────────────────────────
  function _subscribeRealtime(ids) {
    if (_rankingsRTChannel) { window.sb?.removeChannel(_rankingsRTChannel); _rankingsRTChannel = null; }
    if (!window.sb || !ids.length) return;
    _rankingsRTChannel = window.sb
      .channel('rankings-rt-' + ids.slice(0, 5).join('-'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=in.(${ids.join(',')})` }, payload => {
        const upd = payload.new;
        // Patch raw map for all tabs that contain this id
        ['top100', 'global', 'friends'].forEach(tab => {
          if (!_rankingsRawMap[tab] || !_rankingsRawMap[tab][upd.id]) return;
          Object.assign(_rankingsRawMap[tab][upd.id], upd);
          // Re-sort and re-rank from updated raw map
          const rawArr = Object.values(_rankingsRawMap[tab]);
          const newRows = _sortAndRank(rawArr);
          // For top100 slice to 100; for global re-compute window
          if (tab === 'top100') {
            _rankingsCache[tab] = newRows.slice(0, 100);
          } else if (tab === 'global') {
            const myId = window._sbProfile?.id;
            let start = 0, end = 30;
            if (myId) {
              const myIdx = newRows.findIndex(r => r.id === myId);
              if (myIdx !== -1) {
                start = Math.max(0, myIdx - 15);
                end   = Math.min(newRows.length, start + 31);
                start = Math.max(0, end - 31);
              }
            }
            _rankingsCache[tab] = newRows.slice(start, end);
          } else {
            _rankingsCache[tab] = newRows;
          }
          if (_activeRTab === tab) renderRankings(_rankingsCache[tab], tab);
        });
      })
      .subscribe();
  }

  function _unsubscribeRealtime() {
    if (_rankingsRTChannel) { window.sb?.removeChannel(_rankingsRTChannel); _rankingsRTChannel = null; }
  }

  // ── load tab ──────────────────────────────────────────────────────────────────
  async function loadTab(tab) {
    _activeRTab = tab;
    const list = document.getElementById('loading-rankings-list');
    if (list) list.innerHTML = '<div class="rankings-msg">' + t('rankings.loading') + '</div>';
    let rows;
    if (tab === 'top100')       rows = await fetchTop100();
    else if (tab === 'global')  rows = await fetchTopGlobal();
    else if (tab === 'guests')  rows = await fetchTopGuests();
    else                        rows = await fetchTopFriends();
    if (_activeRTab !== tab) return;
    renderRankings(rows, tab);
    // Subscribe realtime to IDs now visible — guests have no row in profiles,
    // nothing to subscribe to.
    if (tab !== 'guests' && rows && rows.length) _subscribeRealtime(rows.map(r => r.id));
  }

  // ── open / close ──────────────────────────────────────────────────────────────
  document.getElementById('loading-rankings-btn')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    document.getElementById('loading-rankings-group')?.classList.remove('table-gone');
    document.getElementById('loading-screen').classList.add('table-shown');
    const guestsTab = document.getElementById('loading-rankings-tab-guests');
    if (guestsTab) guestsTab.style.display = (window._sbUserId === ADMIN_GUEST_RANKINGS_UID) ? '' : 'none';
    _rankingsCache = {};
    _rankingsRawMap = {};
    _allGlobalRows = null;
    loadTab(_activeRTab);
  });

  document.querySelectorAll('[data-rtab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-rtab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      loadTab(btn.dataset.rtab);
    });
  });

  document.getElementById('loading-rankings-back-wrap')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const wrap = document.getElementById('loading-rankings-back-wrap');
    wrap.classList.add('confirm-pressed');
    setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
    document.getElementById('loading-rankings-group')?.classList.add('table-gone');
    document.getElementById('loading-screen').classList.remove('table-shown');
    _unsubscribeRealtime();
  });

  // ── lang change ───────────────────────────────────────────────────────────────
  if (typeof onLangChange === 'function') onLangChange(() => {
    const group = document.getElementById('loading-rankings-group');
    if (!group || group.classList.contains('table-gone')) return;
    const cached = _rankingsCache[_activeRTab];
    if (cached !== undefined) renderRankings(cached, _activeRTab);
  });
})();
