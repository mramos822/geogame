// ── Manual emotes (Versus 1v1 + group rooms) ─────────────────────────────────
// Until now the emote bubbles only appeared on their own (random image when
// someone was overtaken or missed, see spawnEmoteBubble in
// js/modes/mapgame-leaderboard.js). This lets a player pick one of the six
// emotes and send it during a Versus 1v1 or a group room:
//
//  • A small button (bottom-left of the game frame) opens a 6-emote panel
//    beside it; visible only while a match/room is active and the player is
//    not spectating.
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
  // Manual set: 1-9. The automatic card bubbles only use 1-6 (EMOTE_SRCS in
  // js/modes/mapgame-leaderboard.js), so 7-9 are exclusive to this picker. Files that
  // don't exist yet are dropped from the panel automatically (see buildPicker).
  const SRCS = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => 'images/emotes/' + n + '.png');
  const COOLDOWN_MS = 2000;
  const SHOW_MS = 2800;
  const MAX_FEED = 4;

  let lastSent = 0, btn = null, panel = null, feed = null, panelOpen = false;

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
  function push(name, avatar, idx) {
    if (!validIdx(idx)) return;
    const f = ensureFeed();
    while (f.children.length >= MAX_FEED) f.firstChild.remove();
    const item = document.createElement('div');
    item.className = 'emote-shout';
    item.title = safeName(name);
    const im = document.createElement('img');
    im.className = 'emote-shout-photo';
    im.src = safeAvatar(avatar);
    im.draggable = false;
    item.appendChild(im);
    const em = document.createElement('img');
    em.className = 'emote-shout-bubble';
    em.src = SRCS[idx - 1];
    em.draggable = false;
    item.appendChild(em);
    f.appendChild(item);
    setTimeout(() => item.classList.add('out'), SHOW_MS - 350);
    setTimeout(() => item.remove(), SHOW_MS);
  }

  // Emote received by a PLAYER: name/avatar come from local data.
  function show(o) { if (o) push(o.name, o.avatar, o.idx); }
  // Emote received by a SPECTATOR: name comes from the payload (text only).
  function showSpectator(payload) {
    if (!payload) return;
    const idx = Number(payload.e);
    push(payload.n || '', payload.a || null, idx);
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
    if (ok !== false) push(name || (lang() === 'en' ? 'You' : 'Tú'), avatar, idx);
    return true;
  }

  // ── Picker UI ──────────────────────────────────────────────────────────────
  function buildPicker() {
    if (btn) return;
    const st = document.createElement('style');
    st.textContent =
      /* The visible game frame is the middle 70% of #app-stage, so everything is anchored at 15% + margin. */
      '#emote-picker-btn{position:absolute;left:calc(15% + 1.6cqmin);bottom:1.6cqmin;width:6.6cqmin;height:6.6cqmin;z-index:1400;display:none;' +
      'align-items:center;justify-content:center;cursor:pointer;border:0.35cqmin solid #1d6fd6;border-radius:50%;background:rgba(255,255,255,.95);' +
      'box-shadow:0 0.5cqmin 1.4cqmin rgba(0,0,0,.35);padding:0.5cqmin;transition:transform .12s;}' +
      '#emote-picker-btn:hover{transform:scale(1.08);}#emote-picker-btn:active{transform:scale(.94);}' +
      '#emote-picker-btn img{width:100%;height:100%;object-fit:contain;pointer-events:none;}' +
      '#emote-picker-panel{position:absolute;left:calc(15% + 9.4cqmin);bottom:1.6cqmin;z-index:1400;display:none;gap:0.8cqmin;align-items:center;' +
      'padding:0.9cqmin 1.2cqmin;background:rgba(10,22,40,.92);border:0.3cqmin solid #1e3a5f;border-radius:3.4cqmin;box-shadow:0 1cqmin 3cqmin rgba(0,0,0,.45);' +
      'animation:emotePanelIn .16s ease-out;}' +
      '#emote-picker-panel.open{display:flex;}' +
      '#emote-picker-panel button{background:transparent;border:none;padding:0.2cqmin;cursor:pointer;border-radius:1.6cqmin;width:6.4cqmin;transition:transform .1s,background .1s;}' +
      '#emote-picker-panel button:hover{background:rgba(255,255,255,.14);transform:scale(1.12);}' +
      '#emote-picker-panel button:disabled{opacity:.45;cursor:default;transform:none;}' +
      '#emote-picker-panel img{width:100%;display:block;pointer-events:none;}' +
      '@keyframes emotePanelIn{from{opacity:0;transform:translateX(-1cqmin) scale(.96);}to{opacity:1;transform:none;}}' +
      '#emote-feed{position:absolute;left:calc(15% + 1.6cqmin);bottom:9.6cqmin;z-index:1400;display:flex;flex-direction:column-reverse;gap:1cqmin;pointer-events:none;}' +
      '.emote-shout{position:relative;width:8.4cqmin;height:8.4cqmin;animation:emoteShoutIn .25s ease-out;transition:opacity .3s,transform .3s;}' +
      '.emote-shout.out{opacity:0;transform:translateY(-1.2cqmin);}' +
      '.emote-shout-photo{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#fff;border:0.4cqmin solid #fff;box-shadow:0 0.5cqmin 1.4cqmin rgba(0,0,0,.4);}' +
      '.emote-shout-bubble{position:absolute;left:5.4cqmin;top:-4.6cqmin;width:9.4cqmin;height:auto;transform-origin:20% 90%;animation:emoteBubblePop 2.6s ease-out both;' +
      'filter:drop-shadow(0 0.4cqmin 0.8cqmin rgba(0,0,0,.35));}' +
      '@keyframes emoteShoutIn{from{opacity:0;transform:scale(.7);}to{opacity:1;transform:none;}}' +
      '@keyframes emoteBubblePop{0%{opacity:0;transform:scale(.2) rotate(-12deg);}12%{opacity:1;transform:scale(1.18) rotate(6deg);}22%{transform:scale(.96) rotate(-3deg);}' +
      '32%{transform:scale(1) rotate(0);}82%{opacity:1;transform:translateY(-0.6cqmin) scale(1);}100%{opacity:0;transform:translateY(-1.6cqmin) scale(1);}}';
    document.head.appendChild(st);

    btn = document.createElement('button');
    btn.id = 'emote-picker-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Emotes');
    btn.innerHTML = '<img src="' + SRCS[2] + '" alt="" draggable="false">';
    btn.addEventListener('click', (e) => { e.stopPropagation(); click(); panelOpen = !panelOpen; refresh(); });

    panel = document.createElement('div');
    panel.id = 'emote-picker-panel';
    SRCS.forEach((src, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<img src="' + src + '" alt="" draggable="false">';
      // Skip emotes whose image isn't there (yet).
      const probe = new Image();
      probe.onerror = () => b.remove();
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

  function init() {
    buildPicker();
    setInterval(refresh, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.Emotes = { show, showSpectator, send, refresh, _push: push };
})();
