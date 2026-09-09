// ============================================================================
// menu/customize-panel.js — panel de Personalización del loading (marco de foto,
// tarjeta del leaderboard, recuadro del tablero, celda de fila): tabs + grilla
// de opciones + vista previa en vivo, persistencia en profiles vía sbUpdateProfile.
// Expone window._applyFounderFrame. Extraído de monuments.js (fase 19). Usa
// window.CustomizeAssets (sb.js), sbUpdateProfile, i18n, audio — todo en runtime.
// ============================================================================

// ── Panel de personalización (items por código, preparado para la tienda) ─────
// 3 slots independientes (cada uno su propia columna en profiles, ver
// migración customize_item_codes): marco de foto, tarjeta del leaderboard
// in-game, y el "recuadro" (skin del tablero, antes siempre howtoplaytable.png).
// Cada valor es un código de archivo — images/customize/<categoria>/<code>.png.
// Un solo panel con tabs arriba a la derecha + grilla de opciones, y a la
// izquierda una vista previa fija que se actualiza en vivo.
(function () {
  const CATS = {
    photo:       { field: 'frame_code' },
    leaderboard: { field: 'card_code' },
    table:       { field: 'panel_code' },
    cell:        { field: 'cell_code' },
  };
  // Catálogo de ítems disponibles por categoría. Hoy solo existe el default
  // ('0001', gratis para todos); a futuro se suma acá cada código nuevo a
  // medida que haya arte + se sume la tienda (founderOnly, price, etc.).
  const CATALOG = {
    photo:       [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    leaderboard: [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    table:       [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
    cell:        [{ code: '0001', founderOnly: false }, { code: '0002', founderOnly: true }],
  };
  let _activeCat = 'photo';

  // Aplica los 3 ítems elegidos en los lugares donde se ven en vivo: la foto
  // del panel de perfil, la fila propia del leaderboard in-game (#lb-player
  // se recrea cada partida — ver initLeaderboard acá mismo — y #flags-lb-player,
  // que flags.js maneja aparte porque Banderas no reusa #lb-player) y el
  // tablero del panel de perfil. También refresca la vista previa del panel
  // de personalización si está abierto.
  function _applyFounderFrame() {
    const p = window._sbProfile;
    const CA = window.CustomizeAssets;
    if (!CA) return;
    // Respaldo local: si hay perfil de verdad, se guarda el último código
    // conocido; si no lo hay (sin conexión, todavía no cargó), se usa lo
    // último guardado — y si tampoco hay nada guardado, CustomizeAssets ya
    // cae a '0001' (el default) para que nunca quede vacío/roto.
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

    // El marco (frame) es solo para LA FOTO GRANDE del perfil — la ficha del
    // leaderboard in-game lleva la foto plana, sin marco (ver también
    // _swatchPreview/_refreshLeftPreview, mismo criterio para las vistas
    // previas del panel de Personalizar).
    CA.applyFrame(document.getElementById('loading-profile-pic-wrap'), frameCode);
    CA.applyCard(document.getElementById('lb-player'), cardCode);
    CA.applyCard(document.getElementById('flags-lb-player'), cardCode);
    CA.applyCard(document.getElementById('gq-lb-player'), cardCode);
    const panelImg = document.querySelector('#loading-table-group .loading-howtotable');
    if (panelImg) panelImg.src = CA.panelUrl(panelCode);

    _refreshLeftPreview();
  }
  window._applyFounderFrame = _applyFounderFrame;

  // Extrae el color dominante de un PNG de panel (promedio de píxeles
  // opacos, muestreado en baja resolución) para tematizar las tabs y la
  // grilla de opciones de Personalización acorde al panel equipado.
  // Cacheado por URL porque cada panel no cambia en runtime.
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
        } catch (e) { /* canvas tainted (file://) -> sin tema, se usa el fallback CSS */ }
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
    if (token !== _panelThemeToken) return; // llegó una llamada más nueva mientras cargaba
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
    // El marco (frame) es solo para LA FOTO GRANDE del perfil — la ficha del
    // leaderboard/card lleva la foto plana, sin marco, aunque tenga uno
    // equipado.
    CA?.applyCard(document.getElementById('customize-preview-lb-card'), cardCode);
  }

  // Miniatura representativa de un código, para las tarjetas de la grilla.
  // La de "leaderboard" reusa las clases reales del juego (.lb-entry.lb-player,
  // .lb-avatar, .lb-name, .lb-score) para que sea la ficha de verdad, no una
  // inventada — mismo truco que .customize-lb-preview: se resetea position a
  // relative acá adentro porque .lb-entry es absolute para la animación in-game.
  function _swatchPreview(cat, code) {
    const CA = window.CustomizeAssets;
    const photo = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    const name  = localStorage.getItem('playerName') || 'John';
    if (cat === 'photo') {
      const frameInset = window.CUSTOMIZE_FRAME_INSET[code] || '-14.5%';
      // Tamaño fijo en cqmin, NO en % — el swatch tiene padding-bottom (deja
      // lugar al label) así que su ancho y alto de contenido ya no son
      // iguales; un width/height en % de esa caja da un óvalo en vez de
      // círculo. cqmin es relativo al contenedor de arriba (mismo para
      // ambas dimensiones), así que siempre da un cuadrado real.
      return `<div class="customize-preview-avatar-wrap cust-frame-wrap" style="width:7.5cqmin;height:7.5cqmin;--cust-frame:url('${CA.frameUrl(code)}');--cust-frame-inset:${frameInset}">`
        + `<img src="${photo}"></div>`;
    }
    if (cat === 'leaderboard') {
      // transform:scale (no width%) para que el texto se achique proporcional
      // con el resto de la ficha — igual que se ve en el juego, no una copia
      // aplastada con la misma tipografía de tamaño real metida en una caja chica.
      // Foto PLANA, sin marco — el marco es solo de la foto grande de perfil,
      // no de la ficha del leaderboard/card.
      return `<div class="customize-swatch-lb-scale">`
        + `<div class="lb-entry lb-player${window.CUSTOMIZE_CARD_LIGHT_TEXT?.has(code) ? ' card-light-text' : ''}" style="position:relative;top:auto;left:auto;width:12cqmin;transition:none;--cust-card:url('${CA.cardUrl(code)}')">`
        + `<div class="lb-avatar"><img class="lb-avatar-img" src="${photo}"></div>`
        + `<span class="lb-name">${name}</span><span class="lb-score">1234</span>`
        + `</div></div>`;
    }
    if (cat === 'cell') {
      // Mini maqueta de la fila COMPLETA de Rankings/Amigos (avatar+nombre),
      // no solo el circulito — la celda es toda la tarjeta. Tamaño FIJO
      // (no depende del largo del nombre): mismo ancho/alto para las dos
      // tarjetas de la grilla, con el nombre recortado si no entra.
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
    // No alcanza con is_founder: el paquete queda oculto hasta que confirma
    // el popup de bienvenida (founder_popup_seen, ver showFounderWelcomePopup)
    // — ese click solo DESBLOQUEA, no equipa nada solo; recién ahí puede
    // elegir ponérselo o no acá como cualquier otro ítem.
    const isFounder = !!(p && p.is_founder && p.founder_popup_seen);
    const field = CATS[cat].field;
    const currentCode = p?.[field] || '0001';
    grid.innerHTML = '';

    CATALOG[cat].forEach(item => {
      // Fundador es un caso especial: no es "conseguible" (nadie lo suma
      // después de las primeras 100 cuentas), así que a quien no lo tiene ni
      // se le muestra — no tiene sentido mostrar bloqueado algo que jamás va
      // a poder desbloquear. Los ítems de logro/tienda sí se muestran
      // bloqueados (con 🔒) para generar incentivo a conseguirlos.
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
    if (prev === code) return; // ya está seleccionado
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    window._sbProfile[field] = code; // optimista
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

  // Las etiquetas de la grilla ("Sin personalizar"/"Marco de Fundador") se
  // arman en JS con t(), no son data-i18n estático — el refresco genérico de
  // idioma no las toca. Si el panel está abierto al cambiar de idioma, hay
  // que re-renderizar la tab activa a mano.
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      const group = document.getElementById('loading-customize-group');
      if (!group || group.classList.contains('table-gone')) return;
      _renderGrid(_activeCat);
    });
  }
})();
