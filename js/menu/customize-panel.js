// ============================================================================
// menu/customize-panel.js — loading-screen Customize panel (photo frame /
// leaderboard card / board panel / row cell): tabs + options grid + live
// preview, persisted to profiles via sbUpdateProfile. Exposes
// window._applyFounderFrame.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// ── Customize panel (items by code, shop-ready) ──────────────────────────────
// 4 independent slots (each its own profiles column, see migration
// customize_item_codes): photo frame, in-game leaderboard card, the board skin
// (was always howtoplaytable.png), and the row cell. Each value is a file code —
// images/customize/<category>/<code>.png. One panel with tabs top-right + an
// options grid, and a fixed live-updating preview on the left.
(function () {
  const CATS = {
    photo:       { field: 'frame_code' },
    leaderboard: { field: 'card_code' },
    table:       { field: 'panel_code' },
    cell:        { field: 'cell_code' },
  };
  // Catalog of available items per category. Add each new code here as art
  // lands and the shop grows (founderOnly, price, etc.).
  const CATALOG = {
    photo:       [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    leaderboard: [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    table:       [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    cell:        [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
  };
  let _activeCat = 'photo';

  // Apply the chosen items where they show live: the profile-panel photo, the
  // player's own in-game leaderboard row (#lb-player is recreated each game —
  // see initLeaderboard — and #flags-lb-player, handled separately in flags.js
  // because Flags doesn't reuse #lb-player) and the profile-panel board. Also
  // refreshes the Customize panel preview if it's open.
  function _applyFounderFrame() {
    const p = window._sbProfile;
    const CA = window.CustomizeAssets;
    if (!CA) return;
    // Local backup: with a real profile, store the last known code; without one
    // (offline, not loaded yet), use the last stored value — and if nothing is
    // stored, CustomizeAssets falls back to '0001' (default) so it's never
    // empty/broken.
    let frameCode, cardCode, panelCode, cellCode;
    if (p) {
      frameCode = p.frame_code || '0001';
      cardCode  = p.card_code  || '0001';
      panelCode = p.panel_code || '0001';
      cellCode  = p.cell_code  || '0001';
      try {
        localStorage.setItem('cust_frame_code', frameCode);
        localStorage.setItem('cust_card_code',  cardCode);
        localStorage.setItem('cust_panel_code', panelCode);
        localStorage.setItem('cust_cell_code',  cellCode);
      } catch (e) {}
    } else {
      frameCode = localStorage.getItem('cust_frame_code') || '0001';
      cardCode  = localStorage.getItem('cust_card_code')  || '0001';
      panelCode = localStorage.getItem('cust_panel_code') || '0001';
      cellCode  = localStorage.getItem('cust_cell_code')  || '0001';
    }

    // The frame is only for the profile's LARGE photo — the in-game leaderboard
    // card uses the flat photo, no frame (see also
    // _swatchPreview/_refreshLeftPreview, same rule for the Customize previews).
    CA.applyFrame(document.getElementById('loading-profile-pic-wrap'), frameCode);
    CA.applyCard(document.getElementById('lb-player'), cardCode);
    CA.applyCard(document.getElementById('flags-lb-player'), cardCode);
    CA.applyCard(document.getElementById('gq-lb-player'), cardCode);
    const panelImg = document.querySelector('#loading-table-group .loading-howtotable');
    if (panelImg) panelImg.src = CA.panelUrl(panelCode);

    _refreshLeftPreview();
  }
  window._applyFounderFrame = _applyFounderFrame;

  // Extract the dominant color of a panel PNG (average of opaque pixels,
  // sampled at low resolution) to theme the Customize tabs and options grid to
  // match the equipped panel. Cached by URL since panels don't change at runtime.
  const _panelColorCache = {};
  function _extractPanelColor(url) {
    if (_panelColorCache[url] !== undefined) return Promise.resolve(_panelColorCache[url]);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let rgb = null;
        try {
          const w = 24, h = 24;
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, w, h).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 200) continue;
            r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
          }
          if (n > 0) rgb = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
        } catch (e) { /* canvas tainted (file://) -> no theme, CSS fallback is used */ }
        _panelColorCache[url] = rgb;
        resolve(rgb);
      };
      img.onerror = () => { _panelColorCache[url] = null; resolve(null); };
      img.src = url;
    });
  }
  function _mixRgb(rgb, target, amount) {
    return rgb.map((c, i) => Math.round(c + (target[i] - c) * amount));
  }
  let _panelThemeToken = 0;
  async function _applyPanelTheme(panelCode) {
    const CA = window.CustomizeAssets;
    const right = document.querySelector('.customize-right');
    if (!CA || !right) return;
    const token = ++_panelThemeToken;
    const rgb = await _extractPanelColor(CA.panelUrl(panelCode));
    if (token !== _panelThemeToken) return; // a newer call arrived while loading
    if (!rgb) {
      ['--panel-border', '--panel-tab-bg', '--panel-tab-hover-bg', '--panel-tab-active-bg', '--panel-grid-bg', '--panel-tab-text']
        .forEach(v => right.style.removeProperty(v));
      return;
    }
    right.style.setProperty('--panel-border', `rgb(${_mixRgb(rgb, [0, 0, 0], 0.35).join(',')})`);
    right.style.setProperty('--panel-tab-text', `rgb(${_mixRgb(rgb, [0, 0, 0], 0.65).join(',')})`);
    right.style.setProperty('--panel-tab-bg', `rgb(${_mixRgb(rgb, [255, 255, 255], 0.55).join(',')})`);
    right.style.setProperty('--panel-tab-hover-bg', `rgb(${_mixRgb(rgb, [255, 255, 255], 0.4).join(',')})`);
    right.style.setProperty('--panel-tab-active-bg', `rgb(${_mixRgb(rgb, [255, 255, 255], 0.78).join(',')})`);
    right.style.setProperty('--panel-grid-bg', `rgb(${_mixRgb(rgb, [255, 255, 255], 0.78).join(',')})`);
  }

  function _refreshLeftPreview() {
    const p = window._sbProfile;
    const CA = window.CustomizeAssets;
    const name  = localStorage.getItem('playerName') || 'John';
    const photo = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    const frameCode = p?.frame_code || localStorage.getItem('cust_frame_code') || '0001';
    const cardCode  = p?.card_code  || localStorage.getItem('cust_card_code')  || '0001';
    const panelCode = p?.panel_code || localStorage.getItem('cust_panel_code') || '0001';

    const customizePanelImg = document.querySelector('#loading-customize-group .loading-howtotable');
    if (customizePanelImg) customizePanelImg.src = CA?.panelUrl(panelCode);
    _applyPanelTheme(panelCode);

    const avatarImg = document.getElementById('customize-preview-avatar-img');
    if (avatarImg) avatarImg.src = photo;
    CA?.applyFrame(document.getElementById('customize-preview-avatar-wrap'), frameCode);
    const nameEl = document.getElementById('customize-preview-name');
    if (nameEl) nameEl.textContent = name;
    const lbImg = document.getElementById('customize-preview-lb-avatar-img');
    if (lbImg) lbImg.src = photo;
    const lbName = document.getElementById('customize-preview-lb-name');
    if (lbName) lbName.textContent = name;
    // The frame is only for the profile's LARGE photo — the leaderboard/card
    // uses the flat photo, no frame, even if one is equipped.
    CA?.applyCard(document.getElementById('customize-preview-lb-card'), cardCode);
  }

  // Representative thumbnail of a code, for the grid tiles. The "leaderboard"
  // one reuses the real game classes (.lb-entry.lb-player, .lb-avatar, .lb-name,
  // .lb-score) so it's the actual card, not a fake — same trick as
  // .customize-lb-preview: position is reset to relative here because .lb-entry
  // is absolute for the in-game animation.
  function _swatchPreview(cat, code) {
    const CA = window.CustomizeAssets;
    const photo = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    const name  = localStorage.getItem('playerName') || 'John';
    if (cat === 'photo') {
      const frameInset = window.CUSTOMIZE_FRAME_INSET[code] || '-14.5%';
      // Fixed size in cqmin, NOT % — the swatch has padding-bottom (room for
      // the label) so its content width and height aren't equal; a %
      // width/height on that box gives an oval, not a circle. cqmin is relative
      // to the outer container (same for both dimensions), always a real square.
      return `<div class="customize-preview-avatar-wrap cust-frame-wrap" style="width:7.5cqmin;height:7.5cqmin;--cust-frame:url('${CA.frameUrl(code)}');--cust-frame-inset:${frameInset}">`
        + `<img src="${photo}"></div>`;
    }
    if (cat === 'leaderboard') {
      // transform:scale (not width%) so the text shrinks proportionally with
      // the rest of the card — as seen in-game, not a squashed copy with
      // full-size type crammed into a small box. FLAT photo, no frame — the
      // frame is only for the large profile photo, not the leaderboard/card.
      return `<div class="customize-swatch-lb-scale">`
        + `<div class="lb-entry lb-player${window.CUSTOMIZE_CARD_LIGHT_TEXT?.has(code) ? ' card-light-text' : ''}" style="position:relative;top:auto;left:auto;width:12cqmin;transition:none;--cust-card:url('${CA.cardUrl(code)}')">`
        + `<div class="lb-avatar"><img class="lb-avatar-img" src="${photo}"></div>`
        + `<span class="lb-name">${name}</span><span class="lb-score">1234</span>`
        + `</div></div>`;
    }
    if (cat === 'cell') {
      // Mini mockup of the WHOLE Rankings/Friends row (avatar+name), not just
      // the circle — the cell is the entire card. FIXED size (not dependent on
      // name length): same width/height for both grid tiles, name clipped if it
      // doesn't fit.
      return `<div style="width:90%;height:5.4cqmin;box-sizing:border-box;display:flex;align-items:center;gap:0.8cqmin;padding:0 1cqmin;border-radius:0.8cqmin;overflow:hidden;`
        + `background-image:url('${CA.cellUrl(code)}');background-size:100% 100%;background-repeat:no-repeat;">`
        + `<img src="${photo}" style="width:4.2cqmin;height:4.2cqmin;border-radius:50%;object-fit:cover;border:0.3cqmin solid #8b6a00;flex:none;">`
        + `<span style="font-family:'VAGRoundBold','Arial Black',sans-serif;font-size:1.6cqmin;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
          + (window.CUSTOMIZE_CELL_LIGHT_TEXT?.has(code)
            ? `color:#fff;-webkit-text-stroke:0.4cqmin #4a3b00;paint-order:stroke fill;`
            : `color:#5a4400;`)
          + `">${name}</span>`
        + `</div>`;
    }
    return `<img src="${CA.panelUrl(code)}" style="width:100%;height:100%;object-fit:cover;">`;
  }

  function _renderGrid(cat) {
    const grid = document.getElementById('customize-grid');
    if (!grid) return;
    const p = window._sbProfile;
    // is_founder alone isn't enough: the pack stays hidden until the welcome
    // popup is confirmed (founder_popup_seen, see showFounderWelcomePopup) —
    // that click only UNLOCKS, it doesn't equip anything; only then can they
    // choose to wear it here like any other item.
    const isFounder = !!(p && p.is_founder && p.founder_popup_seen);
    const field = CATS[cat].field;
    const currentCode = p?.[field] || '0001';
    grid.innerHTML = '';

    CATALOG[cat].forEach(item => {
      // Founder is a special case: not obtainable (nobody earns it after the
      // first 100 accounts), so it isn't even shown to those who don't have it
      // — no point showing something locked that can never be unlocked.
      // Achievement/shop items ARE shown locked (with 🔒) to create incentive.
      if (item.founderOnly && !isFounder) return;
      const locked   = item.locked && !item.unlocked;
      const selected = currentCode === item.code;
      const sw = document.createElement('div');
      sw.className = 'customize-swatch' + (selected ? ' selected' : '') + (locked ? ' locked' : '');
      sw.innerHTML = _swatchPreview(cat, item.code)
        + `<span class="customize-swatch-label">${item.code === '0001' ? t('customize.optDefault') : (item.code === '0002' ? t('customize.frameFounder') : item.code)}</span>`
        + (locked ? `<span class="customize-swatch-lock">🔒</span>` : `<div class="customize-swatch-check">✓</div>`);
      if (locked) sw.title = t('customize.locked');
      else sw.addEventListener('click', () => _selectOption(cat, item.code));
      grid.appendChild(sw);
    });
  }

  async function _selectOption(cat, code) {
    if (!window._sbProfile || !window._sbUserId) return;
    const field = CATS[cat].field;
    const prev = window._sbProfile[field];
    if (prev === code) return; // already selected
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    window._sbProfile[field] = code; // optimistic
    _applyFounderFrame();
    _renderGrid(cat);
    try {
      await window.sbUpdateProfile(window._sbUserId, { [field]: code });
    } catch (err) {
      window._sbProfile[field] = prev;
      _applyFounderFrame();
      _renderGrid(cat);
    }
  }

  document.querySelectorAll('.customize-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      document.querySelectorAll('.customize-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeCat = btn.dataset.cat;
      _renderGrid(_activeCat);
    });
  });

  document.getElementById('loading-customize-btn')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const btn = document.getElementById('loading-customize-btn');
    btn?.classList.add('confirm-pressed');
    setTimeout(() => btn?.classList.remove('confirm-pressed'), 50);
    if (!window._accountLoggedIn) { if (typeof window.openAccountModal === 'function') window.openAccountModal(); return; }
    _refreshLeftPreview();
    _renderGrid(_activeCat);
    document.getElementById('loading-customize-group')?.classList.remove('table-gone');
  });

  document.getElementById('customize-back-wrap')?.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const wrap = document.getElementById('customize-back-wrap');
    wrap.classList.add('confirm-pressed');
    setTimeout(() => wrap.classList.remove('confirm-pressed'), 50);
    document.getElementById('loading-customize-group')?.classList.add('table-gone');
  });

  // The grid labels are built in JS with t(), not static data-i18n — the
  // generic language refresh doesn't touch them. If the panel is open on a
  // language switch, re-render the active tab manually.
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      const group = document.getElementById('loading-customize-group');
      if (!group || group.classList.contains('table-gone')) return;
      _renderGrid(_activeCat);
    });
  }
})();
