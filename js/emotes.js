// ── Manual emotes (Versus 1v1 + group rooms) ─────────────────────────────────
// Until now the emote bubbles only appeared on their own (random image when
// someone was overtaken or missed, see spawnEmoteBubble in
// js/modes/mapgame-leaderboard.js). This lets a player pick one of the six
// emotes and send it during a Versus 1v1 or a group room:
//
//  • A small smiley button (bottom-left of the game frame) opens the emote panel
//    beside it; visible only while a match/room is active and the player is
//    not spectating.
//  • Hotkeys: 1-9 send emotes 1-9 and 0 sends emote 10 (not while typing).
//  • The emote travels as a broadcast ('emote') on the channel the match
//    already uses (vs.js / lobby.js), so it adds no database traffic.
//  • Everyone in the match — and spectators, who can only WATCH — sees it
//    above that button: the sender's photo in a circle with the emote bubble
//    animating next to it. Separate from the automatic bubbles on the cards.
//
// Only the emote NUMBER (1-6) is trusted from the network. Players are named
// from local data (opponent / room members); spectators get the sender's name
// from the payload, shown as plain text and capped in length.
(function () {
  // Manual set: 1-10. The automatic card bubbles use 1-6 and 10 (EMOTE_SRCS in
  // js/modes/mapgame-leaderboard.js), so 7-9 are exclusive to this picker. Files that
  // don't exist yet are dropped from the panel automatically (see buildPicker).
  const SRCS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => 'images/emotes/' + n + '.png');
  const COOLDOWN_MS = 1500;
  const SHOW_MS = 3000;
  const MAX_FEED = 4;

  let lastSent = 0, btn = null, panel = null, feed = null, panelOpen = false;
  const missing = new Set(); // emote numbers whose image file isn't there (yet)

  const lang = () => ((typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'es');
  const validIdx = (i) => Number.isInteger(i) && i >= 1 && i <= SRCS.length;
  const safeName = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').slice(0, 14);
  const safeAvatar = (a) => (typeof a === 'string' && /^(images\/|https:\/\/)/.test(a)) ? a : 'images/profilepic/ppdefault.png';
  const stage = () => document.getElementById('app-stage') || document.body;
  const click = () => { try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {} };

  function inMatch() {
    const loading = document.getElementById('loading-screen');
    if (!loading || getComputedStyle(loading).display !== 'none') return false; // at the menu
    if (window._isSpectating) return false;
    const inVs = !!(window._vsActive && window.VS && window.VS.sendEmote);
    const inLobby = !!(window._lobbyActive && window.LB && window.LB.sendEmote && window.LB.getId && window.LB.getId());
    return inVs || inLobby;
  }

  function myAvatar() {
    const a = (window._sbProfile && window._sbProfile.avatar_url) || localStorage.getItem('profilePhoto') || '';
    return safeAvatar(a) === a ? a : '';
  }
  function myName() {
    return safeName((window._sbProfile && window._sbProfile.username) || localStorage.getItem('playerName') || '');
  }

  // ── Feed (incoming emotes) ─────────────────────────────────────────────────
  function ensureFeed() {
    if (feed && feed.isConnected) return feed;
    feed = document.createElement('div');
    feed.id = 'emote-feed';
    stage().appendChild(feed);
    return feed;
  }
  // One photo per sender: sending another emote while the previous one is still on
  // screen keeps the SAME photo and only swaps (and restarts) the bubble.
  const active = new Map(); // sender key -> .emote-shout element
  function makeBubble(idx) {
    // The bubble art has its tail on the right; shown mirrored so the tail points back
    // at the sender's photo. The wrapper animates, the inner image carries the flip.
    const em = document.createElement('div');
    em.className = 'emote-shout-bubble';
    const emImg = document.createElement('img');
    emImg.src = SRCS[idx - 1];
    emImg.draggable = false;
    em.appendChild(emImg);
    return em;
  }
  function push(name, avatar, idx, key) {
    if (!validIdx(idx)) return;
    const f = ensureFeed();
    const k = key || (safeName(name) + '|' + (avatar || ''));
    let item = active.get(k);
    if (item && item.isConnected) {
      const old = item.querySelector('.emote-shout-bubble');
      if (old) old.remove();
      item.appendChild(makeBubble(idx));   // fresh element => the pop animation restarts
      item.classList.remove('out');
      item.classList.remove('pulse'); void item.offsetWidth; item.classList.add('pulse');
      clearTimeout(item._tOut); clearTimeout(item._tGone);
    } else {
      while (f.children.length >= MAX_FEED) {
        const first = f.firstChild;
        for (const [kk, el] of active) if (el === first) active.delete(kk);
        clearTimeout(first._tOut); clearTimeout(first._tGone);
        first.remove();
      }
      item = document.createElement('div');
      item.className = 'emote-shout';
      item.title = safeName(name);
      const im = document.createElement('img');
      im.className = 'emote-shout-photo';
      im.src = safeAvatar(avatar);
      im.draggable = false;
      item.appendChild(im);
      item.appendChild(makeBubble(idx));
      f.appendChild(item);
      active.set(k, item);
    }
    item._tOut = setTimeout(() => item.classList.add('out'), SHOW_MS - 350);
    item._tGone = setTimeout(() => { item.remove(); if (active.get(k) === item) active.delete(k); }, SHOW_MS);
  }

  // Emote received by a PLAYER: name/avatar come from local data.
  function show(o) { if (o) push(o.name, o.avatar, o.idx, o.key); }
  // Emote received by a SPECTATOR: name comes from the payload (text only).
  function showSpectator(payload) {
    if (!payload) return;
    const idx = Number(payload.e);
    const key = payload.uid ? 'u:' + payload.uid : payload.role ? 'r:' + payload.role : 'n:' + (payload.n || '');
    push(payload.n || '', payload.a || null, idx, key);
  }

  // ── Sending ────────────────────────────────────────────────────────────────
  function send(idx) {
    if (!validIdx(idx) || !inMatch()) return false;
    const now = Date.now();
    if (now - lastSent < COOLDOWN_MS) return false;
    lastSent = now;
    const name = myName();
    const avatar = myAvatar();
    let ok = false;
    try {
      if (window._vsActive && window.VS && window.VS.sendEmote) ok = window.VS.sendEmote(idx, name, avatar);
      else if (window._lobbyActive && window.LB && window.LB.sendEmote) ok = window.LB.sendEmote(idx, name, avatar);
    } catch (e) {}
    if (ok !== false) push(name || (lang() === 'en' ? 'You' : 'Tú'), avatar, idx, 'me');
    return true;
  }

  // ── Picker UI ──────────────────────────────────────────────────────────────
  function buildPicker() {
    if (btn) return;
    const st = document.createElement('style');
    st.textContent =
      /* The visible game frame is the middle 70% of #app-stage, so everything is anchored at 15% + margin. */
      '#emote-picker-btn{position:absolute;left:calc(15% + 1.6cqmin);bottom:1.6cqmin;width:7.2cqmin;height:7.2cqmin;z-index:1400;display:none;' +
      'align-items:center;justify-content:center;cursor:pointer;border:none;background:transparent;padding:0;' +
      'filter:drop-shadow(0 0.5cqmin 0.9cqmin rgba(0,0,0,.4));transition:transform .12s;}' +
      '#emote-picker-btn:hover{transform:scale(1.1);}#emote-picker-btn:active{transform:scale(.94);}' +
      '#emote-picker-btn svg{width:100%;height:100%;pointer-events:none;}' +
      '#emote-picker-panel{position:absolute;left:calc(15% + 9.4cqmin);bottom:1.6cqmin;z-index:1400;display:none;gap:0.8cqmin;align-items:center;' +
      'padding:0.9cqmin 1.2cqmin;background:rgba(10,22,40,.92);border:0.3cqmin solid #1e3a5f;border-radius:3.4cqmin;box-shadow:0 1cqmin 3cqmin rgba(0,0,0,.45);' +
      'animation:emotePanelIn .16s ease-out;}' +
      '#emote-picker-panel.open{display:flex;}' +
      '#emote-picker-panel button{position:relative;background:transparent;border:none;padding:0.2cqmin;cursor:pointer;border-radius:1.6cqmin;width:6.4cqmin;transition:transform .1s,background .1s;}' +
      '#emote-picker-panel button:hover{background:rgba(255,255,255,.14);transform:scale(1.12);}' +
      '#emote-picker-panel button:disabled{opacity:.45;cursor:default;transform:none;}' +
      '#emote-picker-panel img{width:100%;display:block;pointer-events:none;transform:scaleX(-1);}' +
      '@keyframes emotePanelIn{from{opacity:0;transform:translateX(-1cqmin) scale(.96);}to{opacity:1;transform:none;}}' +
      '#emote-feed{position:absolute;left:calc(15% + 1.6cqmin);bottom:9.6cqmin;z-index:1400;display:flex;flex-direction:column-reverse;gap:1cqmin;pointer-events:none;}' +
      '.emote-shout{position:relative;width:8.4cqmin;height:8.4cqmin;animation:emoteShoutIn .22s ease-out;transition:opacity .3s,transform .3s;}' +
      '.emote-shout.out{opacity:0;transform:translateY(-1.2cqmin);}' +
      '.emote-shout.pulse{animation:emoteShoutPulse .24s ease-out;}' +
      '.emote-shout-photo{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#fff;border:0.4cqmin solid #fff;box-shadow:0 0.5cqmin 1.4cqmin rgba(0,0,0,.4);}' +
      '.emote-shout-bubble{position:absolute;left:5.6cqmin;top:-4.6cqmin;width:9.4cqmin;transform-origin:15% 90%;animation:emoteBubblePop 3s ease-out both;' +
      'filter:drop-shadow(0 0.4cqmin 0.8cqmin rgba(0,0,0,.35));}' +
      '.emote-shout-bubble img{width:100%;height:auto;display:block;transform:scaleX(-1);}' +
      '.emote-shout-bubble::before{content:"";position:absolute;left:8%;top:12%;width:84%;height:70%;border-radius:50%;border:0.6cqmin solid rgba(255,255,255,.95);' +
      'box-shadow:0 0 1.2cqmin rgba(80,170,255,.8);pointer-events:none;animation:emoteBurst .42s ease-out both;}' +
      '@keyframes emoteShoutIn{0%{opacity:0;transform:scale(.4);}55%{opacity:1;transform:scale(1.16);}100%{opacity:1;transform:scale(1);}}' +
      '@keyframes emoteShoutPulse{0%{transform:scale(1);}35%{transform:scale(1.14);}100%{transform:scale(1);}}' +
      '@keyframes emoteBubblePop{0%{opacity:0;transform:scale(0) rotate(-24deg);}' +
      '6%{opacity:1;transform:scale(1.4) rotate(9deg);}' +
      '11%{transform:scale(.86) rotate(-5deg);}' +
      '16%{transform:scale(1.1) rotate(3deg);}' +
      '21%{transform:scale(1) rotate(0);}' +
      '55%{transform:scale(1.04) rotate(-1.5deg);}' +
      '88%{opacity:1;transform:scale(1) rotate(0);}' +
      '100%{opacity:0;transform:scale(.85) translateY(-1cqmin);}}' +
      '@keyframes emoteBurst{0%{opacity:.95;transform:scale(.3);}100%{opacity:0;transform:scale(1.7);}}';
    document.head.appendChild(st);

    btn = document.createElement('button');
    btn.id = 'emote-picker-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Emotes');
    btn.innerHTML =
      '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 8C27 8 8 22 8 42c0 12 7 22 18 29-1 8-5 14-9 18 10-1 19-5 26-11 2 0 4 0 7 0 23 0 42-14 42-36S73 8 50 8z" ' +
      'fill="#fff" stroke="#1d6fd6" stroke-width="6" stroke-linejoin="round"/>' +
      '<circle cx="37" cy="38" r="5.5" fill="#15233b"/><circle cx="63" cy="38" r="5.5" fill="#15233b"/>' +
      '<path d="M34 53c8 9 24 9 32 0" fill="none" stroke="#15233b" stroke-width="5.5" stroke-linecap="round"/></svg>';
    btn.addEventListener('click', (e) => { e.stopPropagation(); click(); panelOpen = !panelOpen; refresh(); });

    panel = document.createElement('div');
    panel.id = 'emote-picker-panel';
    SRCS.forEach((src, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<img src="' + src + '" alt="" draggable="false">';
      // Skip emotes whose image isn't there (yet).
      const probe = new Image();
      probe.onerror = () => { missing.add(i + 1); b.remove(); };
      probe.src = src;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (send(i + 1)) { panelOpen = false; refresh(); }
      });
      panel.appendChild(b);
    });
    stage().appendChild(btn);
    stage().appendChild(panel);
    document.addEventListener('pointerdown', (e) => {
      if (panelOpen && !panel.contains(e.target) && !btn.contains(e.target)) { panelOpen = false; refresh(); }
    });
  }

  function refresh() {
    if (!btn) return;
    const on = inMatch();
    btn.style.display = on ? 'flex' : 'none';
    if (!on) panelOpen = false;
    panel.classList.toggle('open', on && panelOpen);
    const cooling = Date.now() - lastSent < COOLDOWN_MS;
    panel.querySelectorAll('button').forEach((b) => { b.disabled = cooling; });
  }

  // Hotkeys: 1-9 send emotes 1-9 and 0 sends emote 10 — only during a match/room, never
  // while typing in an input, and never with a modifier held.
  function onKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !/^[0-9]$/.test(e.key)) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    const idx = e.key === '0' ? 10 : Number(e.key);
    if (missing.has(idx) || !inMatch()) return;
    if (send(idx)) { e.preventDefault(); panelOpen = false; refresh(); }
  }

  function init() {
    buildPicker();
    setInterval(refresh, 500);
    document.addEventListener('keydown', onKey);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.Emotes = { show, showSpectator, send, refresh, _push: push };
})();
