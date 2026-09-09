// ============================================================================
// menu/rankings-panel.js — Panel de Rankings del loading (Top 100 / Amigos / Cercanos / Invitados),
// con realtime y cálculo de puesto global. Expone window.getGlobalRankForId,
// window._cupForRank y window._socialAvatarHtml (usados por profile-stats /
// social-panel / mapgame-leaderboard en runtime).
//
// Antes todo esto vivía en el god-file js/monuments.js; ahora está partido en
// js/{core,menu,modes,profile,social}/, cargados en orden en play/index.html.
// Son <script> clásicos que comparten un mismo scope global.
// ============================================================================

// ── Rankings panel ─────────────────────────────────────────────────────────────
(function () {
  let _activeRTab = 'top100';
  let _rankingsCache = {};       // tab → rows[]
  let _rankingsRawMap = {};      // tab → { id → raw profile object } for live updates
  let _rankingsRTChannel = null; // realtime channel
  let _allGlobalRows = null;     // full sorted list for rank computation

  // 4ta pestaña "Invitados" (partidas de gente sin cuenta, ver
  // analytics_events) — visible SOLO para esta cuenta (BlueLite/admin). La
  // seguridad real vive en el RPC get_guest_rankings (SECURITY DEFINER con
  // el mismo chequeo de uid adentro) — analytics_events no tiene policy de
  // SELECT para nadie, así que ocultar el botón acá es solo para que no
  // aparezca a la vista, no lo único que protege el dato.
  const ADMIN_GUEST_RANKINGS_UID = '530cb816-8562-4e7e-a538-15c6713fcc8d';
  function _escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const SEL = 'id, username, avatar_url, hs_flags, hs_shapes, hs_cities, hs_monuments, hs_total, play_count, vs_wins, vs_losses, is_supporter, avg_sum_flags, avg_sum_shapes, avg_sum_cities, avg_sum_monuments, play_count_flags, play_count_shapes, play_count_cities, play_count_monuments, country_code, is_founder, cell_code, frame_code, panel_code';

  function _totalScore(p) {
    const fromCols = (p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0);
    return Math.max(p.hs_total||0, fromCols);
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
    };
  }
  function _sortAndRank(profiles) {
    return profiles
      .map(p => _toRow(p))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // ── fetchers ──────────────────────────────────────────────────────────────────
  // window.withConnCheck (final.js) envuelve el pedido con timeout: si tarda
  // demasiado o no hay internet, muestra la viñeta de error de conexión sola y
  // devuelve null acá, en vez de dejar el panel de Rankings cargando para siempre.
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

  // Invitados sin cuenta, mejor puntaje de campaña por visitor_id — ver
  // get_guest_rankings (RPC, Supabase). No hay id de perfil real (isGuest
  // marca esto para que renderRankings los pinte distinto: sin marco/celda
  // personalizada, sin click a un perfil que no existe).
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

  // Puesto global de un id cualquiera (para el badge de copa en los paneles
  // de perfil). Reusa el listado completo ya ordenado por fetchTopGlobal.
  async function getGlobalRankForId(id) {
    if (!id) return null;
    if (!_allGlobalRows) await fetchTopGlobal();
    if (!_allGlobalRows) return null;
    const row = _allGlobalRows.find(r => r.id === id);
    return row ? row.rank : null;
  }
  window.getGlobalRankForId = getGlobalRankForId;

  // ── copa según puesto ─────────────────────────────────────────────────────────
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

  // Avatar circular con marco de personalización para las filas de Rankings/
  // Amigos (.loading-social-avatar) — a diferencia del .lb-avatar in-game
  // (ver _refreshLeftPreview), acá SÍ se muestra el marco equipado por cada
  // usuario, del mismo modo que en la foto grande del perfil.
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
      // Invitados (tab "guests", solo admin): sin cuenta real de por medio
      // — nada de marco/celda personalizada (no existen para ellos) ni
      // click a un perfil que no existe. guest_name es texto libre sin el
      // pipeline de validación que sí pasa un username real, por eso se
      // escapa acá (en el resto de las filas no hace falta, r.name viene
      // de profiles.username ya validado en el registro).
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
    // Subscribe realtime to IDs now visible — los invitados no tienen fila
    // en profiles, no hay nada a lo que suscribirse.
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
