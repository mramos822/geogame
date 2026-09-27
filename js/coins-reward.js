// ── Reward animations (results screen) ───────────────────────────────────────
// window.playCoinsReward({ screen, from, amount, start }) -> Promise
// window.playXpReward({ screen, from, amount, start })    -> Promise
// Particles burst out of `from` (the "+N" earned on the results board), a HUD bar
// slides down into the same spot it has in the menu, the particles fly into it
// one by one (turning white as they approach, like a mask) and its number counts
// up from `start` to `start + amount`; each hit flashes/pops the bar's icon and
// number. When everything has landed the bar slides back up out of the screen.
//   coins: spinning sprite (images/coins1-1..4, 8-step frame loop, some mirrored)
//   xp:    the XP star, spinning, and the bar's fill + level update as it grows.
(function () {
  // [frame, mirrored] — 1, 2, 3, 2↔, 1↔, 4↔, 3, 4
  const FRAMES = [[1, false], [2, false], [3, false], [2, true], [1, true], [4, true], [3, false], [4, false]];
  const FRAME_MS = 110;
  const fmtCoins = (n) => Math.max(0, Math.floor(n || 0)).toLocaleString('en-US');
  const fmtXp = (n) => String(Math.max(0, Math.floor(n || 0)));

  const KINDS = {
    coins: {
      barHtml: (start) =>
        '<div class="loading-topbar loading-topbar-coins results-coinbar">' +
          '<div class="loading-topbar-badge"><img class="loading-topbar-icon" src="images/coins.png" alt="" draggable="false"></div>' +
          '<div class="loading-topbar-track"><span class="loading-topbar-value">' + fmtCoins(start) + '</span></div>' +
        '</div>',
      left: 'calc(50% - 41cqmin)',
      landed: (bar, total) => { bar.querySelector('.loading-topbar-value').textContent = fmtCoins(total); },
    },
    xp: {
      barHtml: (start) => {
        const v = window.topbarsXpView ? window.topbarsXpView(start) : { level: 1, pct: 0 };
        return '<div class="loading-topbar loading-topbar-xp results-coinbar">' +
          '<div class="loading-topbar-badge">' +
            '<img class="loading-topbar-icon" src="images/XP.png" alt="" draggable="false">' +
            '<span class="loading-topbar-level">' + v.level + '</span>' +
          '</div>' +
          '<div class="loading-topbar-track">' +
            '<div class="loading-topbar-fill" style="width:' + v.pct + '%"></div>' +
            '<span class="loading-topbar-value">' + fmtXp(start) + '</span>' +
          '</div>' +
        '</div>';
      },
      left: 'calc(50% + 16cqmin)',
      landed: (bar, total) => {
        bar.querySelector('.loading-topbar-value').textContent = fmtXp(total);
        const v = window.topbarsXpView ? window.topbarsXpView(total) : null;
        if (v) {
          bar.querySelector('.loading-topbar-level').textContent = v.level;
          bar.querySelector('.loading-topbar-fill').style.width = v.pct + '%';
        }
      },
    },
  };

  // `hud: true` -> no bar of its own: the particles fly into the menu's real HUD bar
  // (.loading-topbars inside `screen`), whose number/fill/level are updated in place.
  // Level curve (same as topbars.js / xp_system_config): total XP to reach level L = 25·L·(L-1), cap 100.
  const MAX_LEVEL = 100;
  const needXp = (L) => 25 * L * (L - 1);
  const levelFor = (xp) => { let L = 1; while (L < MAX_LEVEL && xp >= needXp(L + 1)) L++; return L; };
  // Coins granted for reaching level L (same as economy_for / levelUpBonusCoins in the stats).
  const levelBonus = (L) => L >= 100 ? 10000
    : Math.round((20 + Math.pow(L - 1, 1.6) * 2) * (L % 10 === 0 ? 1.25 : 1));
  window.levelUpBonusCoins = levelBonus;

  // `onLevelUp(newLevel) -> Promise` (xp only): when the bar reaches a level boundary it stays
  // full at the old level and the animation pauses until that promise resolves (the level-up
  // popup + bonus coins), then the bar continues at the new level with the leftover XP.
  function run(kind, { screen, from, amount, start = 0, hud: hudOpt = false, onLevelUp = null, radial = false }) {
    return new Promise((resolve) => {
      const K = KINDS[kind];
      if (!screen || !from || !(amount > 0)) { resolve(); return; }

      let hud = hudOpt;
      const overlay = document.createElement('div');
      overlay.className = 'coins-reward-fx';
      let bar;
      if (hud) {
        bar = screen.querySelector('.loading-topbars .loading-topbar-' + kind);
        if (!bar) { resolve(); return; }
        screen.appendChild(overlay);
      } else {
        overlay.innerHTML = K.barHtml(start);
        // Lives on the stage (not inside `screen`) so it survives the screen being hidden — e.g. the
        // results screen giving way to the final screen — and stays above whatever comes next.
        (screen.parentElement || screen).appendChild(overlay);
        overlay.classList.add('floating');
        bar = overlay.firstChild;
        bar.style.left = K.left;
      }
      let badge = bar.querySelector('.loading-topbar-badge');

      // Stage coordinates: the game is scaled inside #app-stage, so convert
      // viewport rects back to the overlay's own CSS pixels.
      const oRect = overlay.getBoundingClientRect();
      const sc = oRect.width / (overlay.offsetWidth || 1) || 1;
      const local = (r) => ({ x: (r.left + r.width / 2 - oRect.left) / sc, y: (r.top + r.height / 2 - oRect.top) / sc });
      const u = Math.min(overlay.offsetWidth, overlay.offsetHeight) / 100;   // 1 cqmin in local px

      const fromRect = from.getBoundingClientRect();
      // (a hidden button has an all-zero rect: fall back to roughly where the GloboReto button sits)
      const origin = fromRect.width ? local(fromRect) : { x: overlay.offsetWidth * 0.88, y: overlay.offsetHeight * 0.55 };
      const spreadX = hud ? (fromRect.width / sc) * 0.3 : 0, spreadY = hud ? (fromRect.height / sc) * 0.3 : 0;   // hud: start spread over the button
      const N = Math.max(8, Math.min(16, Math.round(amount / (kind === 'xp' ? 25 : 8))));
      const base = Math.floor(amount / N);
      let extra = amount - base * N;

      let T_BAR = 350;            // bar slides in
      const T_FLY0 = hud ? 550 : 950;   // first particle leaves for the bar (menu: sooner)
      const GAP = 85;             // ms between particles
      const FLY = 560;            // flight time of each particle

      // hud mode (menu): the burst fans out towards the middle of the screen from the
      // button, instead of the upward fan used on the results board.
      const toMid = hud ? Math.atan2(overlay.offsetHeight / 2 - origin.y, overlay.offsetWidth / 2 - origin.x) : 0;

      const ps = [];
      for (let i = 0; i < N; i++) {
        const el = document.createElement('img');
        el.className = 'coin-particle';
        el.draggable = false;
        if (kind === 'xp') el.src = 'images/XP.png';
        overlay.appendChild(el);
        const frac = (i + 0.15 + Math.random() * 0.7) / N;                   // evenly spread
        const ang = radial ? frac * Math.PI * 2                                 // classic explosion: all directions around the origin
                  : hud ? toMid + (frac - 0.5) * Math.PI * 0.3                 // tight cone towards the middle (cannon shot)
                        : (-Math.PI) + frac * Math.PI * 0.96 + 0.02;           // results board: upper fan, evenly spread
        const spd = (radial ? 30 + Math.random() * 90 : hud ? 55 + Math.random() * 105 : 25 + Math.random() * 75) * u;   // px / s (hud: a strong cannon-like push)
        const share = base + (extra-- > 0 ? 1 : 0);
        ps.push({
          el, x: origin.x + (Math.random() - 0.5) * 2 * spreadX, y: origin.y + (Math.random() - 0.5) * 2 * spreadY,
          vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - (hud || radial ? 0 : 12 * u),
          size: 0.55 + Math.random() * 1.0,          // different sizes (0.55x – 1.55x)
          phase: Math.random() * FRAMES.length * FRAME_MS,
          spin: (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 240),   // deg / s (xp star)
          tl: T_FLY0 + i * GAP, share, state: 'burst', frame: -1, fx: 0, fy: 0, mirror: 1,
        });
      }

      let shown = start;
      let levelShown = levelFor(start);
      let capped = false;          // xp: went past the top of the current level
      let landed = 0;
      let barIn = false;
      const t0 = performance.now();
      let last = t0;

      function tick(now) {
        if (!overlay.isConnected) { resolve(); return; }
        const t = now - t0;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // Menu left mid-animation (a game mode started): the HUD bar is hidden, so carry on
        // with a floating bar (slides down in place, same as on the results screen) and
        // slide it back up when done.
        // (also when the GloboReto screen is still covering the menu: the HUD bars would sit
        // BEHIND its panel, so they float above everything instead)
        const gqCovering = () => { const g = document.getElementById('globequiz-screen'); return !!(g && g.offsetWidth > 0); };
        if (hud && (!screen.offsetWidth || gqCovering())) {
          hud = false;
          bar.classList.remove('hud-hit');
          overlay.remove();
          (screen.parentElement || document.body).appendChild(overlay);
          overlay.classList.add('floating');
          const wrap = document.createElement('div');
          wrap.innerHTML = K.barHtml(shown);
          bar = wrap.firstChild;
          bar.style.left = K.left;
          overlay.insertBefore(bar, overlay.firstChild);
          badge = bar.querySelector('.loading-topbar-badge');
          if (kind === 'xp' && capped) {
            // Same state the menu bar was in: full at the OLD level, number at the running total.
            bar.querySelector('.loading-topbar-level').textContent = levelShown;
            bar.querySelector('.loading-topbar-fill').style.width = '100%';
            bar.querySelector('.loading-topbar-value').textContent = fmtXp(shown);
          }
          barIn = false;
          T_BAR = t;
        }

        if (!hud && !barIn && t >= T_BAR) {
          barIn = true;
          bar.classList.add('in');
          // slides down from above the screen into the HUD spot, with a small overshoot
          bar.animate([{ transform: 'translateY(-16cqmin)' }, { transform: 'translateY(0)' }],
            { duration: 420, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'both' });
        }

        const target = local(badge.getBoundingClientRect());

        for (const p of ps) {
          if (p.state === 'done') continue;
          if (p.state === 'burst' && t >= p.tl) { p.state = 'fly'; p.fx = p.x; p.fy = p.y; }
          if (p.state === 'burst') {
            p.vy += 140 * u * dt * (hud ? 0.35 : 1) * (t < 500 ? 1 : 0.1);   // gravity eases off, particles hang
            const damp = Math.pow(t < 350 ? 0.975 : 0.89, dt * 60);
            p.vx *= damp; p.vy *= damp;
            p.x += p.vx * dt; p.y += p.vy * dt;
          } else {
            const k = Math.min(1, (t - p.tl) / FLY);
            const e = k * k;                                        // ease-in: accelerates towards the bar
            const bend = Math.sin(Math.PI * k) * 9 * u * (p.fx < target.x ? -1 : 1);
            p.x = p.fx + (target.x - p.fx) * e + bend;
            p.y = p.fy + (target.y - p.fy) * e;
            if (k >= 1) {
              p.state = 'done';
              p.el.remove();
              landed++;
              shown = Math.min(shown + p.share, start + amount);
              if (kind === 'xp' && onLevelUp && levelShown < MAX_LEVEL && shown >= needXp(levelShown + 1)) {
                // Past the top of the current level: the bar stays FULL (old level) while the
                // number keeps counting up to the real total and the stars keep flying. The
                // level-up popup comes once everything has landed (see below).
                capped = true;
                bar.querySelector('.loading-topbar-value').textContent = fmtXp(shown);
                bar.querySelector('.loading-topbar-fill').style.width = '100%';
              } else if (capped) {
                bar.querySelector('.loading-topbar-value').textContent = fmtXp(shown);
              } else {
                K.landed(bar, shown);
              }
              const hitCls = hud ? 'hud-hit' : 'hit';
              bar.classList.remove(hitCls); void bar.offsetWidth; bar.classList.add(hitCls);
              continue;
            }
          }
          let rot = 0;
          if (kind === 'coins') {
            // sprite frame + mirror
            const idx = Math.floor((t + p.phase) / FRAME_MS) % FRAMES.length;
            if (idx !== p.frame) {
              p.frame = idx;
              p.el.src = 'images/coins1-' + FRAMES[idx][0] + '.png';
              p.mirror = FRAMES[idx][1] ? -1 : 1;
            }
          } else {
            rot = (t / 1000) * p.spin;
          }
          const grow = p.state === 'burst' ? Math.min(1, t / 160) : 1 - 0.35 * ((t - p.tl) / FLY);
          const s = p.size * grow;
          // The closer to the bar, the whiter: a brightness ramp saturates the sprite
          // to pure white while keeping its alpha (acts like a white mask).
          const w = p.state === 'fly' ? Math.max(0, ((t - p.tl) / FLY - 0.35) / 0.65) : 0;
          p.el.style.filter = w > 0 ? 'brightness(' + (1 + w * w * 14).toFixed(2) + ')' : '';
          p.el.style.transform = 'translate(' + (p.x - 3.4 * u) + 'px,' + (p.y - 3.4 * u) + 'px) rotate(' + rot + 'deg) scale(' + (p.mirror * s) + ',' + s + ')';
        }

        if (landed < N) { requestAnimationFrame(tick); return; }
        if (capped) {
          // Everything has landed and the number reached its total with the bar full. The bar and
          // the star update RIGHT AWAY: it drains to 0 and the level ticks up one by one
          // (27 → 28 → 29 …), refilling to the top between levels; the last level fills to the real
          // leftover progress. Only afterwards the level-up panel opens (one panel, with the level
          // reached and the summed bonus).
          const fromLevel = levelShown, finalLevel = levelFor(start + amount);
          capped = false;
          levelShown = finalLevel;
          const fill = bar.querySelector('.loading-topbar-fill');
          const lvlEl = bar.querySelector('.loading-topbar-level');
          const wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const pulse = () => { const c = hud ? 'hud-hit' : 'hit'; bar.classList.remove(c); void bar.offsetWidth; bar.classList.add(c); };
          (async () => {
            for (let L = fromLevel + 1; L <= finalLevel; L++) {
              fill.style.transition = 'width 0.35s ease-in';
              fill.style.width = '0%';
              await wait(400);
              if (lvlEl) lvlEl.textContent = L;
              pulse();
              if (L < finalLevel) {
                fill.style.transition = 'width 0.35s ease-out';
                fill.style.width = '100%';
                await wait(450);
              }
            }
            fill.style.transition = 'width 0.7s ease-out';
            K.landed(bar, start + amount);        // final level + fill to the leftover progress
            await wait(900);
            fill.style.transition = '';
            try { await onLevelUp(finalLevel, fromLevel); } catch (e) {}
            finishRun();
          })();
          return;
        }
        K.landed(bar, start + amount);
        finishRun();
      }
      function finishRun() {
        if (hud) { setTimeout(() => { bar.classList.remove('hud-hit'); overlay.remove(); resolve(); }, 300); return; }
        // every particle has left and landed: the bar slides back up out of the screen
        setTimeout(() => {
          const out = bar.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-16cqmin)' }],
            { duration: 450, easing: 'cubic-bezier(0.55, 0, 0.9, 0.4)', fill: 'forwards' });
          out.onfinish = () => { overlay.remove(); resolve(); };
        }, 400);
      }
      requestAnimationFrame(tick);
    });
  }

  window.playCoinsReward = (opts) => run('coins', opts);
  window.playXpReward = (opts) => run('xp', opts);
  window.playHudReward = (kind, opts) => run(kind, Object.assign({ hud: true }, opts));

  // Coins + XP together, with level-ups: each level reached freezes the XP bar full, shows the
  // level-up popup (with that level's coin bonus) and, once it is closed, the bonus coins burst
  // out of the popup into the coin bar. Resolves with the final { coins, xp } totals.
  window.playRewardPair = async function ({ screen, fromCoins, fromXp, coins = 0, xp = 0, coinsStart = 0, xpStart = 0, hud = false, deferLevelUp = false }) {
    let coinsNow = coinsStart + coins;      // what the coin bar ends at (grows with level bonuses)
    const coinsJob = coins > 0 ? window.playCoinsReward({ screen, from: fromCoins, amount: coins, start: coinsStart, hud }).catch(() => {}) : Promise.resolve();
    let bonusJob = Promise.resolve();
    // Menu (post-GloboReto) and this reward is going to level up: freeze the menu's input with an
    // invisible shield until the level-up panel is on screen (the panel itself blocks after that).
    let shield = null;
    const dropShield = () => { if (shield) { shield.remove(); shield = null; } };
    if (hud && xp > 0 && levelFor(xpStart + xp) > levelFor(xpStart)) {
      shield = document.createElement('div');
      shield.className = 'reward-input-shield';
      (screen.parentElement || document.body).appendChild(shield);
    }
    const onLevelUp = async (level, fromLevel) => {
      dropShield();
      if (deferLevelUp) {
        // Results screen: no popup in the middle of it. It is queued and shown on the menu
        // (see playMenuLevelUp in menu/topbars.js) together with the bonus coins burst.
        let bonus = 0;
        for (let L = fromLevel + 1; L <= level; L++) bonus += levelBonus(L);
        window.__pendingLevelUp = { level, fromLevel, bonus, coinsBefore: coinsNow, xpFinal: xpStart + xp };
        return;
      }
      let bonus = 0;                         // every level gained in one go adds its bonus
      for (let L = fromLevel + 1; L <= level; L++) bonus += levelBonus(L);
      const shown = await window.showLevelUp(level, bonus);   // resolves when the popup is closed
      const rect = shown.rect;
      coinsNow += bonus;
      // The bonus coins burst NOW, and this returns straight away so the XP bar's drain/refill
      // happens during that explosion (not after it). Never two coin counters at once: the
      // bonus waits for the main coin animation, which is normally long finished.
      if (bonus > 0) bonusJob = coinsJob.then(() => window.playCoinsReward({ screen, from: { getBoundingClientRect: () => rect }, amount: bonus, start: coinsNow - bonus, hud, radial: true })).catch(() => {});
    };
    if (xp > 0) await run('xp', { screen, from: fromXp, amount: xp, start: xpStart, hud, onLevelUp }).catch(() => {});
    dropShield();
    await coinsJob;
    await bonusJob;
    return { coins: coinsNow, xp: xpStart + xp };
  };
})();

// ── Level-up popup ───────────────────────────────────────────────────────────
// window.showLevelUp(level, bonusCoins) -> Promise<{ rect }>
// A celebratory card over everything: the XP star with the new level, and that level's
// coin bonus. Resolves when the player closes it with the ✓, giving the on-screen rect of
// the bonus coin icon (the bonus coins burst out of there afterwards).
(function () {
  window.showLevelUp = function (level, bonus) {
    return new Promise((resolve) => {
      const stage = document.getElementById('app-stage') || document.body;
      const tt = (k, v) => (typeof t === 'function' ? t(k, v) : k);
      const el = document.createElement('div');
      el.className = 'levelup-overlay';
      el.innerHTML =
        '<div class="levelup-card">' +
          '<div class="levelup-rays"></div>' +
          '<span class="levelup-title">' + tt('levelup.title') + '</span>' +
          '<div class="levelup-badge">' +
            '<img src="images/XP.png" alt="" draggable="false">' +
            '<span class="levelup-level">' + level + '</span>' +
          '</div>' +
          '<span class="levelup-sub">' + tt('levelup.sub', { lvl: level }) + '</span>' +
          '<div class="levelup-bonus">' +
            '<span class="levelup-bonus-label">' + tt('levelup.bonus') + '</span>' +
            '<div class="levelup-bonus-row">' +
              '<img class="levelup-coin" src="images/coins.png" alt="" draggable="false">' +
              '<span class="levelup-bonus-val">+' + Math.max(0, bonus).toLocaleString('en-US') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="levelup-confirm">' +
            '<img class="levelup-confirm-1" src="images/confirm1.png" alt="" draggable="false">' +
            '<img class="levelup-confirm-2" src="images/confirm2.png" alt="" draggable="false">' +
          '</div>' +
        '</div>';
      stage.appendChild(el);
      try { if (typeof sfxBonus !== 'undefined') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); } } catch (e) {}
      let done = false;
      const confirmBtn = el.querySelector('.levelup-confirm');
      const armedAt = performance.now() + 900;                 // ignore clicks meant for what was under the popup
      setTimeout(() => confirmBtn.classList.add('armed'), 900);
      confirmBtn.addEventListener('click', () => {
        if (done || performance.now() < armedAt) return;
        done = true;
        try { if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } } catch (e) {}
        const r = el.querySelector('.levelup-coin').getBoundingClientRect();
        const rect = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
        el.classList.add('out');
        setTimeout(() => el.remove(), 250);
        resolve({ rect });
      });
    });
  };
})();
