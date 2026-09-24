// ── Dev. Panel (dev account only) ───────────────────────────────────────────
// "Dev. Panel" button above the menu logo, drawn only for window.DEV_UID
// (BlueLite, see js/sb.js). Opens a panel with a quick stats summary and who
// is connected right now — accounts in the same rows as the friends list
// (cell, frame, status) plus guests — refreshed every 10s while open.
// Playing accounts get the spectate eye: it opens a STEALTH solo spectate
// (openSpectatorSolo(..., { stealth: true }), js/spectate.js) — no eye badge
// for the player, no "SPECTATING" tag for us. 1v1/group games aren't
// spectatable from here (the stealth key only exists on the solo channel).
//
// The data comes from the dev_panel_summary() RPC, which checks dev_admins
// server-side — the button being hidden for everyone else is only cosmetic.
(function () {
  const REFRESH_MS = 10000;
  // Same windows as the /stats page selector.
  const RANGES = ['1d', '7d', '30d', '90d', '365d', 'all'];
  const RANGE_KEY = '_devpanRange';
  let range = (() => { try { const r = localStorage.getItem(RANGE_KEY); return RANGES.includes(r) ? r : '1d'; } catch (e) { return '1d'; } })();

  const TEXT = {
    es: {
      title: 'Dev. Panel', refresh: 'Actualizar', updated: 'Actualizado',
      ban: 'Ban', unban: 'Quitar ban', banSure: '¿Seguro? Banear', banned: 'Baneados',
      bannedTitle: 'Baneados del ranking', bannedNone: 'No hay cuentas baneadas', banErr: 'No se pudo cambiar el ban.',
      users: 'Cuentas', cg: 'De CrazyGames', founders: 'Fundadores', gamesTotal: 'Partidas (total)',
      period: { '1d': 'Últimas 24 h', '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', '90d': 'Últimos 90 días', '365d': 'Último año', all: 'Desde el inicio' },
      rangeAll: 'TODO', visitors: 'Visitantes', games: 'Partidas', modeGames: 'Modos jugados',
      newAcc: 'Cuentas nuevas', activeAcc: 'Cuentas activas',
      online: 'Conectados ahora', guests: 'Invitados conectados', none: 'Nadie por ahora',
      playing: 'Jugando', practicing: 'Practicando', idle: 'En el menú',
      inMatch: '1v1', inLobby: 'Grupo', noSpectate: 'no espectable',
      guest: 'Invitado', error: 'No se pudo cargar el panel.',
    },
    en: {
      title: 'Dev. Panel', refresh: 'Refresh', updated: 'Updated',
      ban: 'Ban', unban: 'Unban', banSure: 'Sure? Ban', banned: 'Banned',
      bannedTitle: 'Banned from rankings', bannedNone: 'No banned accounts', banErr: "Couldn't change the ban.",
      users: 'Accounts', cg: 'From CrazyGames', founders: 'Founders', gamesTotal: 'Games (total)',
      period: { '1d': 'Last 24 h', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', '365d': 'Last year', all: 'All time' },
      rangeAll: 'ALL', visitors: 'Visitors', games: 'Games', modeGames: 'Modes played',
      newAcc: 'New accounts', activeAcc: 'Active accounts',
      online: 'Online now', guests: 'Guests online', none: 'Nobody right now',
      playing: 'Playing', practicing: 'Practicing', idle: 'In the menu',
      inMatch: '1v1', inLobby: 'Group', noSpectate: 'not spectatable',
      guest: 'Guest', error: "Couldn't load the panel.",
    },
  };
  const PLATFORM = { web: '🌐 Web', crazygames: '🎮 CrazyGames', gd: '🕹️ GD' };
  function tx(k) {
    const lang = (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'es';
    return TEXT[lang][k];
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function click() { try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {} }
  function isDev() { return !!window.DEV_UID && window._sbUserId === window.DEV_UID; }
  // Same round flag images as the rankings/friends rows (emoji flags don't
  // render on Windows).
  function flag(cc) {
    const url = cc && window.flagUrlForCountryCode?.(cc);
    return url ? `<img class="devpan-flag" src="${esc(url)}" alt="" draggable="false" oncontextmenu="return false">` : '';
  }
  function ago(iso) {
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 48 * 3600) return Math.round(s / 3600) + 'h';
    return Math.round(s / 86400) + 'd';
  }

  const style = document.createElement('style');
  style.textContent = `
    #devpan-btn {
      position: absolute; top: 1.2cqmin; left: 50%; transform: translateX(-50%);
      z-index: 205; display: none; cursor: pointer;
      font-family: 'VAGRoundBold', 'Arial Black', sans-serif; font-size: 2cqmin; letter-spacing: 0.15em;
      color: #fff; background: #7b3fd1; border: 0.45cqmin solid #4b2185; border-radius: 1.2cqmin;
      padding: 0.6cqmin 2.2cqmin; box-shadow: 0 0.5cqmin 1.2cqmin rgba(0,0,0,0.35);
      transition: transform 0.1s;
    }
    body.devpan-on #devpan-btn { display: block; }
    #devpan-btn:hover  { transform: translateX(-50%) scale(1.06); }
    #devpan-btn:active { transform: translateX(-50%) scale(0.95); }
    #devpan-modal .account-modal-box { max-width: 88cqmin; width: 84cqmin; gap: 1.1cqmin; padding: 2.4cqmin 3.5cqmin 2.4cqmin; margin-top: 4cqmin; }
    #devpan-modal .devpan-head { display: flex; align-items: center; justify-content: space-between; width: 100%; }
    #devpan-modal .devpan-refresh { width: auto; padding: 0.6cqmin 2cqmin; font-size: 1.8cqmin; }
    #devpan-modal .devpan-meta { font-size: 1.5cqmin; color: #9a8350; }
    #devpan-modal .devpan-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1cqmin; width: 100%; }
    #devpan-modal .devpan-card {
      background: #fff3c4; border: 0.35cqmin solid #e3c56a; border-radius: 1.2cqmin;
      padding: 0.5cqmin 1cqmin; text-align: center; font-family: 'VAGRoundBold', 'Arial Black', sans-serif;
    }
    #devpan-modal .devpan-card b { display: block; font-size: 2.6cqmin; color: #5a4400; }
    #devpan-modal .devpan-card span { font-size: 1.4cqmin; color: #7a6020; }
    #devpan-modal .devpan-sub { align-self: flex-start; font-family: 'VAGRoundBold', 'Arial Black', sans-serif; font-size: 2cqmin; color: #5a4400; }
    #devpan-modal .devpan-ranges { display: flex; gap: 0.8cqmin; align-self: stretch; justify-content: center; }
    #devpan-modal .devpan-range {
      font-family: 'VAGRoundBold', 'Arial Black', sans-serif; font-size: 1.6cqmin; cursor: pointer;
      padding: 0.4cqmin 1.6cqmin; border-radius: 1cqmin; color: #7a6020;
      background: #fff3c4; border: 0.35cqmin solid #e3c56a; transition: transform 0.1s;
    }
    #devpan-modal .devpan-range:hover { transform: scale(1.06); }
    #devpan-modal .devpan-range.active { background: #2bd14b; border-color: #1c8a32; color: #fff; }
    #devpan-modal .devpan-period-row { display: flex; align-items: center; gap: 1.2cqmin; width: 100%; flex-wrap: wrap; }
    #devpan-modal .devpan-chip {
      font-family: 'VAGRoundBold', 'Arial Black', sans-serif; font-size: 1.45cqmin; color: #5a4400;
      background: #fff3c4; border: 0.3cqmin solid #e3c56a; border-radius: 1cqmin; padding: 0.3cqmin 1cqmin;
    }
    #devpan-modal .loading-social-list { height: 22cqmin; width: 100%; border-radius: 1.2cqmin; box-sizing: border-box; }
    #devpan-modal .loading-social-list.devpan-guests { height: auto; max-height: 16cqmin; gap: 0.7cqmin; padding: 0.8cqmin; }
    /* Own right-hand block (not .loading-social-score, which is centered for
       the narrower friends list and ended up covering the status text). */
    #devpan-modal .loading-social-row, #devpan-banned-modal .loading-social-row { position: relative; padding-right: 27cqmin; cursor: pointer; }
    #devpan-modal .loading-social-info, #devpan-banned-modal .loading-social-info { min-width: 0; flex: 1; }
    #devpan-modal .loading-social-name-row, #devpan-banned-modal .loading-social-name-row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #devpan-modal .loading-social-status, #devpan-banned-modal .loading-social-status { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* Same points plaque as the friends rows, but in flow inside our block. */
    .devpan-right .loading-social-score { position: relative; left: auto; top: auto; transform: none; }
    #devpan-banned-modal .account-modal-box { max-width: 80cqmin; width: 74cqmin; }
    #devpan-banned-modal .loading-social-list { height: 44cqmin; width: 100%; border-radius: 1.2cqmin; box-sizing: border-box; }
    #devpan-banned-modal .devpan-right { position: absolute; right: 2cqmin; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 1cqmin; }
    .devpan-unban { width: auto; padding: 0.5cqmin 1.6cqmin; font-size: 1.6cqmin; }
    #devpan-ban-btn {
      position: absolute; top: 88.5%; left: calc(50% - 28cqmin); transform: translate(-50%, -50%);
      z-index: 214; display: none; cursor: pointer;
      font-family: 'VAGRoundBold', 'Arial Black', sans-serif; font-size: 2cqmin; letter-spacing: 0.08em;
      color: #fff; background: #e8504a; border: 0.45cqmin solid #a32a26; border-radius: 1.2cqmin;
      padding: 0.5cqmin 2.4cqmin; box-shadow: 0 0.5cqmin 1.2cqmin rgba(0,0,0,0.3); transition: transform 0.1s;
    }
    #devpan-ban-btn.is-banned { background: #2bd14b; border-color: #1c8a32; }
    #devpan-ban-btn.confirming { background: #a32a26; }
    #devpan-ban-btn:hover  { transform: translate(-50%, -50%) scale(1.06); }
    #devpan-ban-btn:active { transform: translate(-50%, -50%) scale(0.95); }
    body.devpan-on #devpan-ban-btn.for-profile { display: block; }
    #devpan-banned-btn { display: none; }
    body.devpan-on #devpan-banned-btn { display: inline-block; background: #e8504a; color: #fff; }
    #devpan-modal .devpan-right {
      position: absolute; right: 2cqmin; top: 50%; transform: translateY(-50%);
      display: flex; align-items: center; gap: 1cqmin;
      font-family: 'VAGRoundBold', 'Arial Black', sans-serif; font-size: 2cqmin; color: #5a4400;
    }
    #devpan-modal .devpan-right .devpan-eye { width: 3.6cqmin; height: auto; cursor: pointer; transition: transform 0.1s; }
    #devpan-modal .devpan-right .devpan-eye:hover { transform: scale(1.2); }
    #devpan-modal .devpan-guest-row > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #devpan-modal .devpan-guest-row > span:last-child { white-space: nowrap; flex-shrink: 0; }
    .devpan-flag {
      width: 2.2cqmin; height: 2.2cqmin; border-radius: 50%; object-fit: cover;
      vertical-align: middle; margin-right: 0.5cqmin; pointer-events: none;
    }
    #devpan-modal .devpan-tag {
      display: inline-block; margin-left: 0.6cqmin; padding: 0 0.7cqmin; border-radius: 0.8cqmin;
      font-size: 1.3cqmin; background: rgba(0,0,0,0.12);
    }
    #devpan-modal .devpan-guest-row {
      display: flex; justify-content: space-between; gap: 1cqmin; padding: 0.9cqmin 1.2cqmin;
      background: #fffbe6; border-radius: 0.8cqmin; font-family: 'VAGRoundBold', 'Arial Black', sans-serif;
      font-size: 1.7cqmin; color: #5a4400;
    }
    #devpan-modal .devpan-guest-row.is-playing { background: #d4f5dc; color: #14602a; }
  `;
  document.head.appendChild(style);

  let modal = null, timer = null, loading = false;

  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'account-modal';
    modal.id = 'devpan-modal';
    modal.innerHTML =
      '<div class="account-modal-box">' +
      '  <button class="account-modal-close" type="button" data-act="close">✕</button>' +
      '  <div class="devpan-head">' +
      '    <span class="account-modal-title" data-t="title"></span>' +
      '    <span class="devpan-meta" data-t="meta"></span>' +
      '    <button class="account-modal-opt account-modal-login devpan-refresh" type="button" data-act="refresh"></button>' +
      '  </div>' +
      '  <div class="devpan-cards" data-t="totals"></div>' +
      '  <div class="devpan-ranges" data-t="ranges"></div>' +
      '  <div class="devpan-period-row"><span class="devpan-sub" data-t="periodTitle"></span><span data-t="plat" style="display:contents"></span></div>' +
      '  <div class="devpan-cards" data-t="day"></div>' +
      '  <span class="devpan-sub" data-t="onlineTitle"></span>' +
      '  <div class="loading-social-list" data-t="online"></div>' +
      '  <span class="devpan-sub" data-t="guestsTitle"></span>' +
      '  <div class="loading-social-list devpan-guests" data-t="guests"></div>' +
      '</div>';
    const ref = document.getElementById('account-modal');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(modal, ref);
    else document.body.appendChild(modal);
    modal.querySelector('[data-act="close"]').addEventListener('click', () => { click(); close(); });
    modal.querySelector('[data-act="refresh"]').addEventListener('click', () => { click(); load(); });
    const bar = modal.querySelector('[data-t="ranges"]');
    RANGES.forEach((r) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'devpan-range';
      b.dataset.range = r;
      b.addEventListener('click', () => {
        click();
        range = r;
        try { localStorage.setItem(RANGE_KEY, r); } catch (e) {}
        paintRanges();
        load();
      });
      bar.appendChild(b);
    });
    paintRanges();
  }

  function paintRanges() {
    modal.querySelectorAll('.devpan-range').forEach((b) => {
      b.textContent = b.dataset.range === 'all' ? tx('rangeAll') : b.dataset.range.toUpperCase();
      b.classList.toggle('active', b.dataset.range === range);
    });
  }

  function card(value, label) {
    return `<div class="devpan-card"><b>${Number(value || 0).toLocaleString()}</b><span>${esc(label)}</span></div>`;
  }

  // Points plaque exactly like the friends/rankings rows.
  function pointsHtml(n) {
    return '<div class="loading-social-score">' +
      '<img class="loading-social-points" src="images/points.png" alt="" draggable="false" oncontextmenu="return false">' +
      `<span class="loading-social-score-val">${Number(n || 0).toLocaleString()}</span></div>`;
  }

  // Opens any account's profile (the same panel as a rankings row click).
  // fromPanel: reopen the Dev. Panel once that profile is closed (back
  // button), so browsing several accounts doesn't mean reopening it each time.
  let reopenAfterProfile = false;
  async function openProfile(id, fromPanel) {
    if (!id || typeof window.openFriendProfile !== 'function') return;
    if (id === window._sbUserId) return;
    reopenAfterProfile = !!fromPanel;
    try {
      const { data: p, error } = await window.sb.from('profiles').select('*').eq('id', id).single();
      if (error || !p) throw error;
      if (window._accountLoggedIn && !window._socialDataFetched && typeof loadSocialData === 'function') await loadSocialData(false);
      window.openFriendProfile(window._rankingsToRow ? window._rankingsToRow(p) : { id: p.id, name: p.username, avatar: p.avatar_url });
    } catch (e) { console.warn('[devpan] profile', e); }
  }

  // ── Ban (profile panel button + banned list in Rankings) ────────────────
  // dev_set_banned() flips profiles.hidden_from_rankings server-side (dev
  // only). A banned account drops out of every ranking/leaderboard, so it has
  // no position: the cup + "#N" badge vanishes from its profile for everyone.
  async function setBanned(id, banned) {
    const { data, error } = await window.sb.rpc('dev_set_banned', { p_user_id: id, p_banned: banned });
    if (error || !data) throw error || new Error('not found');
    window.resetRankingsCache?.();
    if (typeof loadFriends === 'function') loadFriends(); // in-game leaderboards
  }

  let profileFriend = null, banBtn = null, confirmTimer = null;
  async function refreshBanBtn() {
    if (!banBtn || !profileFriend) return;
    banBtn.classList.remove('confirming');
    let banned = false;
    try {
      const { data } = await window.sb.from('profiles').select('hidden_from_rankings').eq('id', profileFriend.id).single();
      banned = !!data?.hidden_from_rankings;
    } catch (e) {}
    banBtn.dataset.banned = banned ? '1' : '';
    banBtn.classList.toggle('is-banned', banned);
    banBtn.textContent = tx(banned ? 'unban' : 'ban');
    banBtn.classList.add('for-profile');
  }
  function initBanButton() {
    const group = document.getElementById('loading-friend-group');
    if (!group || document.getElementById('devpan-ban-btn')) return;
    banBtn = document.createElement('button');
    banBtn.id = 'devpan-ban-btn';
    banBtn.type = 'button';
    group.appendChild(banBtn);
    // Fired by openFriendProfile (js/social/social-panel.js) for every
    // profile opened, from friends, rankings or this panel.
    new MutationObserver(() => {
      if (reopenAfterProfile && group.classList.contains('table-gone')) { reopenAfterProfile = false; open(); }
    }).observe(group, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('friendProfileOpened', (e) => {
      const friend = e.detail;
      profileFriend = friend && friend.id ? friend : null;
      banBtn.classList.remove('for-profile');
      if (profileFriend && isDev()) refreshBanBtn();
    });
    banBtn.addEventListener('click', async () => {
      if (!profileFriend || !isDev()) return;
      click();
      const banned = !!banBtn.dataset.banned;
      // Banning takes a second click within 3s (no native confirm dialogs).
      if (!banned && !banBtn.classList.contains('confirming')) {
        banBtn.classList.add('confirming');
        banBtn.textContent = tx('banSure');
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(refreshBanBtn, 3000);
        return;
      }
      clearTimeout(confirmTimer);
      try {
        await setBanned(profileFriend.id, !banned);
        // Re-open so the cup/#N badge reflects the new state right away.
        window.openFriendProfile(profileFriend);
      } catch (e) {
        window.showGlobalToast?.(tx('banErr'));
        refreshBanBtn();
      }
    });
  }

  let bannedModal = null;
  async function openBannedList() {
    if (!isDev()) return;
    click();
    if (!bannedModal) {
      bannedModal = document.createElement('div');
      bannedModal.className = 'account-modal';
      bannedModal.id = 'devpan-banned-modal';
      bannedModal.innerHTML =
        '<div class="account-modal-box">' +
        '  <button class="account-modal-close" type="button" data-act="close">✕</button>' +
        '  <span class="account-modal-title" data-t="title" style="text-align:center"></span>' +
        '  <div class="loading-social-list" data-t="list"></div>' +
        '</div>';
      const ref = document.getElementById('account-modal');
      if (ref && ref.parentNode) ref.parentNode.insertBefore(bannedModal, ref);
      else document.body.appendChild(bannedModal);
      bannedModal.querySelector('[data-act="close"]').addEventListener('click', () => { click(); bannedModal.classList.remove('open'); });
    }
    bannedModal.querySelector('[data-t="title"]').textContent = tx('bannedTitle');
    const list = bannedModal.querySelector('[data-t="list"]');
    list.innerHTML = '';
    const box = bannedModal.querySelector('.account-modal-box');
    if (box) { box.style.animation = 'none'; box.offsetWidth; box.style.animation = ''; }
    bannedModal.classList.add('open');
    const { data } = await window.sb.from('profiles')
      .select('id, username, avatar_url, frame_code, cell_code, hs_total, country_code, last_active')
      .eq('hidden_from_rankings', true).order('hs_total', { ascending: false });
    const rows = data || [];
    if (!rows.length) { list.innerHTML = `<div class="loading-social-empty">${esc(tx('bannedNone'))}</div>`; return; }
    rows.forEach((u) => {
      const row = document.createElement('div');
      // 'online' styling on purpose: 'offline' greys the whole row out.
      row.className = 'loading-social-row status-online' + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(u.cell_code) ? ' cell-light-text' : '');
      window.CustomizeAssets?.applyCellForStatus(row, u.cell_code, 'online');
      row.innerHTML =
        (window._socialAvatarHtml ? window._socialAvatarHtml(u.avatar_url, u.frame_code) : '') +
        '<div class="loading-social-info"><div class="loading-social-name-row">' +
        `<span class="loading-social-name">${flag(u.country_code)} ${esc(u.username)}</span></div>` +
        `<span class="loading-social-status">${u.last_active ? ago(u.last_active) : '—'}</span></div>` +
        '<div class="devpan-right">' + pointsHtml(u.hs_total) +
        `<button class="account-modal-opt account-modal-login devpan-unban" type="button">${esc(tx('unban'))}</button></div>`;
      row.addEventListener('click', () => { click(); bannedModal.classList.remove('open'); openProfile(u.id); });
      row.querySelector('.devpan-unban').addEventListener('click', async (e) => {
        e.stopPropagation();
        click();
        try { await setBanned(u.id, false); row.remove(); }
        catch (err) { window.showGlobalToast?.(tx('banErr')); }
        if (!list.querySelector('.loading-social-row')) list.innerHTML = `<div class="loading-social-empty">${esc(tx('bannedNone'))}</div>`;
      });
      list.appendChild(row);
    });
  }
  function initBannedTab() {
    const tabs = document.querySelector('#loading-rankings-group .loading-social-tabs');
    if (!tabs || document.getElementById('devpan-banned-btn')) return;
    const b = document.createElement('button');
    b.id = 'devpan-banned-btn';
    b.type = 'button';
    b.className = 'loading-social-tab';
    b.textContent = tx('banned');
    b.addEventListener('click', openBannedList);
    tabs.appendChild(b);
  }

  function accountRow(u) {
    const status = u.is_playing ? 'playing' : 'online';
    const row = document.createElement('div');
    row.className = 'loading-social-row status-' + status + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(u.cell_code) ? ' cell-light-text' : '');
    window.CustomizeAssets?.applyCellForStatus(row, u.cell_code, status);
    let statusText = u.is_playing ? tx(u.is_practicing ? 'practicing' : 'playing') + (u.playing_mode ? ' · ' + u.playing_mode : '') : tx('idle');
    const tags = [];
    // Where they're connected from right now (profiles.last_platform); an account
    // created on CrazyGames but playing elsewhere keeps a smaller origin tag.
    if (u.platform === 'crazygames') tags.push('🎮 CG');
    else if (u.platform === 'gd') tags.push('🕹️ GD');
    else if (u.crazygames) tags.push('🎮 CG acc');
    if (u.in_match) tags.push(tx('inMatch'));
    if (u.in_lobby) tags.push(tx('inLobby'));
    const canWatch = u.is_playing && !u.in_match && !u.in_lobby;
    row.innerHTML =
      (window._socialAvatarHtml ? window._socialAvatarHtml(u.avatar_url, u.frame_code) : '') +
      '<div class="loading-social-info">' +
      '  <div class="loading-social-name-row">' +
      `    <span class="loading-social-name">${flag(u.country_code)} ${esc(u.username)}</span>` +
           tags.map((t) => `<span class="devpan-tag">${esc(t)}</span>`).join('') +
      '  </div>' +
      `  <span class="loading-social-status"><span class="dot ${status}"></span>${esc(statusText)} · ${esc(u.device || '—')} · ${ago(u.last_active)}</span>` +
      '</div>' +
      '<div class="devpan-right">' +
      (canWatch ? '<img class="devpan-eye" src="images/spectate.png" alt="" draggable="false" oncontextmenu="return false" title="Spectate (stealth)">' : '') +
      pointsHtml(u.hs_total) +
      '</div>';
    row.addEventListener('click', () => { click(); close(); openProfile(u.id, true); });
    if (u.is_playing && !canWatch) row.title = tx('noSpectate');
    row.querySelector('.devpan-eye')?.addEventListener('click', (e) => {
      e.stopPropagation();
      click();
      close();
      if (typeof window.openSpectatorSolo === 'function') {
        window.openSpectatorSolo(u.id, {
          id: u.id, name: u.username, avatar: u.avatar_url,
          frameCode: u.frame_code || '0001', cardCode: '0001',
        }, { stealth: true });
      }
    });
    return row;
  }

  function render(d) {
    const q = (k) => modal.querySelector(`[data-t="${k}"]`);
    q('title').textContent = tx('title');
    modal.querySelector('[data-act="refresh"]').textContent = tx('refresh');
    q('meta').textContent = tx('updated') + ' ' + new Date(d.generated_at).toLocaleTimeString();
    const T = d.totals || {}, D = d.period || {};
    paintRanges();
    q('totals').innerHTML = card(T.users, tx('users')) + card(T.cg_accounts, tx('cg')) + card(T.founders, tx('founders')) + card(T.games_total, tx('gamesTotal'));
    q('periodTitle').textContent = tx('period')[d.range || range] || '';
    q('day').innerHTML = card(D.visitors, tx('visitors')) + card(D.games, tx('games')) + card(D.mode_games, tx('modeGames')) + card(D.new_accounts, tx('newAcc'));
    q('plat').innerHTML = (D.by_platform || [])
      .map((p) => `<span class="devpan-chip">${esc(PLATFORM[p.platform] || p.platform)}: ${Number(p.visitors).toLocaleString()} ${esc(tx('visitors').toLowerCase())} · ${Number(p.games).toLocaleString()} ${esc(tx('games').toLowerCase())}</span>`)
      .join('') + (D.active_accounts != null ? `<span class="devpan-chip">${esc(tx('activeAcc'))}: ${Number(D.active_accounts).toLocaleString()}</span>` : '');

    const online = d.online || [], guests = d.guests || [];
    q('onlineTitle').textContent = `${tx('online')} (${online.length})`;
    const list = q('online');
    list.innerHTML = '';
    if (!online.length) list.innerHTML = `<div class="loading-social-empty">${esc(tx('none'))}</div>`;
    online.forEach((u) => list.appendChild(accountRow(u)));

    q('guestsTitle').textContent = `${tx('guests')} (${guests.length})`;
    const gl = q('guests');
    gl.innerHTML = guests.length ? guests.map((g) =>
      `<div class="devpan-guest-row${g.is_playing ? ' is-playing' : ''}"><span>${flag(g.country_code)} ${esc(g.guest_name || tx('guest'))}</span>` +
      `<span>${g.is_playing ? '🎮 ' + esc(g.playing_mode || tx('playing')) : esc(tx('idle'))} · ${esc(PLATFORM[g.platform] || g.platform)} · ${esc(g.device || '—')} · ${ago(g.last_active)}</span></div>`
    ).join('') : `<div class="loading-social-empty">${esc(tx('none'))}</div>`;
  }

  async function load() {
    if (loading || !modal) return;
    loading = true;
    try {
      const { data, error } = await window.sb.rpc('dev_panel_summary', { p_range: range });
      if (error) throw error;
      render(data || {});
    } catch (e) {
      console.warn('[devpan]', e);
      modal.querySelector('[data-t="meta"]').textContent = tx('error');
    } finally {
      loading = false;
    }
  }

  function open() {
    if (!isDev()) return;
    if (!modal) buildModal();
    const box = modal.querySelector('.account-modal-box');
    if (box) { box.style.animation = 'none'; box.offsetWidth; box.style.animation = ''; }
    click();
    modal.classList.add('open');
    load();
    clearInterval(timer);
    timer = setInterval(() => { if (modal.classList.contains('open')) load(); }, REFRESH_MS);
  }
  function close() {
    modal?.classList.remove('open');
    clearInterval(timer);
    timer = null;
  }

  function init() {
    const logo = document.querySelector('#loading-screen .loading-logo');
    if (!logo || document.getElementById('devpan-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'devpan-btn';
    btn.type = 'button';
    btn.textContent = 'Dev. Panel';
    logo.parentNode.insertBefore(btn, logo);
    btn.addEventListener('click', open);
    initBanButton();
    initBannedTab();
    const sync = () => document.body.classList.toggle('devpan-on', isDev());
    document.addEventListener('sbSessionReady', sync);
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
