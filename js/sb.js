// ── SUPABASE CLIENT (global, no ES modules) ─────────────────────────────────
const _SB_URL  = 'https://xituwurshmaqsnnnrdhx.supabase.co';
const _SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHV3dXJzaG1hcXNubm5yZGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMjU0OTUsImV4cCI6MjA5NjgwMTQ5NX0.jlT6O8dkuYXc8F3fOK_QXgH4Sqw6dAbhi2EIkvcS7Mk';

const sb = supabase.createClient(_SB_URL, _SB_ANON);
window.sb = sb;

// ── CUSTOMIZATION (items by code, ready for the future shop) ─────────────────
// images/customize/{frames,cards,panels,emotes,cells}/<code>.png — '0001' is
// the free default for everyone. frame_code/card_code/panel_code/cell_code live
// in profiles (see migrations customize_item_codes and customize_cell_code).
// One place to build the URLs and apply the frame/card/cell, so the pattern
// isn't repeated in every file.
// frame = the photo ring (both the profile's LARGE PHOTO and the circle in each
// Rankings/Friends row). cell = the background of the WHOLE ROW
// (.loading-social-row) where it appears in Rankings/Friends — not just the
// avatar circle, the whole card with name/score/etc.
// NOTE: _abs() returns a full absolute URL (protocol+host+path), resolved
// against document.baseURI (which already includes <base href="../">) — NOT a
// relative path nor a bare leading-"/" one. Needed because these codes are used
// two ways: (a) as <img src>, which respects <base>, and (b) inside
// var(--cust-frame) consumed by background-image in css/style.css, where a
// relative url() resolves against the STYLESHEET's location (css/), ignoring
// <base> — it ended up requesting css/images/... (404, invisible frame). A bare
// leading-"/" path fixes (b) but breaks (a) if the site isn't served at the
// domain root (subfolder deploys). A pre-resolved absolute URL in JS works for
// both without assuming where the domain lives.
// How far the frame's ::after box must overhang the wrap (see
// .cust-frame-wrap::after in style.css) so the INNER edge of each PNG's ring
// sits flush with the photo edge, without covering it or floating too far in.
// Each code has its own ring ratio within the canvas (measured by radial
// sampling, not by eye — see images/customize/frames/):
//   0001.png (129×129): simple even ring, inner radius 50 of 64.5 half-canvas
//     (~77.5%) → inset -14.5%.
//   0002.png (152×148, Founder): inner radius ~47.5 of 74 (~64.2%) → minimum
//     -27.9%, bumped to -30% on request (a touch bigger).
// If a new frame code is added, measure its ring inner radius the same way and
// add its entry here — don't reuse another asset's value.
window.CUSTOMIZE_FRAME_INSET = {
  '0001': '-14.5%',
  '0002': '-30%',
};

// Cells (images/customize/cells/<code>.png) in "dark mode": a background dark
// or "busy" enough (texture, gradient) that the position/name text in its
// normal color (brown #8b6a00/#4a3b00) gets lost — for those, the name turns
// white with an outline in the color it would normally be (see .cell-light-text
// in style.css and _swatchPreview in js/menu/customize-panel.js). '0001'
// (light/beige background) is not dark mode. If a new dark-background cell code
// is added, add it here — no CSS or per-renderer JS change needed, they all
// read from this list.
window.CUSTOMIZE_CELL_LIGHT_TEXT = new Set(['0002', '0009']);

// Same "dark mode" but for cards (images/customize/cards/<code>.png, the
// in-game leaderboard card): when the card background is dark, the name/score
// turn white with an outline in the color they would normally be (see
// .card-light-text in style.css). applyCard() below adds the class itself, so
// the 3 places that call applyCard (#lb-player, #flags-lb-player,
// #customize-preview-lb-card) get it for free; the only place that does NOT go
// through applyCard is the grid swatch (_swatchPreview 'leaderboard' in
// js/modes/mapgame-leaderboard.js, builds the HTML by hand), which checks this
// same set directly.
window.CUSTOMIZE_CARD_LIGHT_TEXT = new Set(['0002']);

// Cells that have their own "-green" variant (images/customize/cells/
// <code>-green.png) for the "playing" state — when it exists, that image is
// used as-is instead of the generic animated tint (::before + mix-blend in
// style.css, see .status-playing). Any code NOT listed here still works with
// the usual tint — a variant per new cell is optional.
window.CUSTOMIZE_CELL_GREEN_VARIANTS = new Set(['0002']);

window.CustomizeAssets = {
  _abs(path) { return new URL(path, document.baseURI).href; },
  frameUrl(code) { return this._abs(`images/customize/frames/${code || '0001'}.png`); },
  cardUrl(code)  { return this._abs(`images/customize/cards/${code || '0001'}.png`); },
  panelUrl(code) { return this._abs(`images/customize/panels/${code || '0001'}.png`); },
  emoteUrl(code) { return this._abs(`images/customize/emotes/${code || '0001'}.png`); },
  cellUrl(code)  { return this._abs(`images/customize/cells/${code || '0001'}.png`); },
  // Cell URL to use when the row is "playing": the dedicated -green variant if
  // it exists for that code, otherwise the usual normal cell (with the CSS tint
  // taking over, see applyCellForStatus below).
  cellUrlPlaying(code) {
    return window.CUSTOMIZE_CELL_GREEN_VARIANTS.has(code)
      ? this._abs(`images/customize/cells/${code}-green.png`)
      : this.cellUrl(code);
  },
  // Sets --cust-cell (normal art, always) and --cust-cell-green (-green
  // variant, only meaningful if it exists for that code) + the
  // cell-green-asset class that tells style.css whether to blink BETWEEN the
  // two (see @keyframes cell-green-blink) instead of the generic tint. One
  // place for this decision — avoids repeating it everywhere a row is rendered
  // (renderRankings, loadSocialData render, _patchFriendStatusInDOM, etc., see
  // js/social/social-realtime.js).
  applyCellForStatus(el, code, statusCls) {
    if (!el) return;
    const playing = statusCls === 'playing';
    const hasGreenAsset = playing && window.CUSTOMIZE_CELL_GREEN_VARIANTS.has(code);
    el.style.setProperty('--cust-cell', `url('${this.cellUrl(code)}')`);
    if (hasGreenAsset) el.style.setProperty('--cust-cell-green', `url('${this.cellUrlPlaying(code)}')`);
    el.classList.toggle('cell-green-asset', hasGreenAsset);
  },
  // Global fallback for rows that never call applyCard (leaderboard bots, which
  // aren't real accounts and have no card_code of their own) — without this,
  // --cust-card is left unset on those rows and the card shows blank (see
  // .lb-entry in style.css, which no longer has a fallback background-color).
  // Set once here on :root, via JS so _abs() can be used (a relative url() in
  // the static CSS resolves against the stylesheet location, not the site root
  // — see note above about frameUrl/cardUrl).
  _initDefaultCardVar() {
    document.documentElement.style.setProperty('--cust-card-default', `url('${this.cardUrl('0001')}')`);
  },
  // Same reason, for --cust-cell: rows that show a CELL but not a person with
  // their own cell_code (e.g. the public rooms list in .versus-friend-row, see
  // _renderPublicRooms in js/lobby.js) never call applyCell/applyCellForStatus
  // — without this default they had no visible background ("plain text only"
  // reported) once .versus-friend-row lost its hardcoded fallback
  // background-color.
  _initDefaultCellVar() {
    document.documentElement.style.setProperty('--cust-cell-default', `url('${this.cellUrl('0001')}')`);
  },
  // The frame is an ::after (see .cust-frame-wrap in style.css) so it can
  // overhang the container if the design calls for it; applied via CSS var
  // instead of a new <img> so each avatar's HTML structure stays untouched.
  // --cust-frame-inset travels separately from --cust-frame because each PNG
  // has its own ring ratio (see CUSTOMIZE_FRAME_INSET above) — one shared inset
  // for all codes doesn't work.
  applyFrame(el, code) {
    if (!el) return;
    el.classList.add('cust-frame-wrap');
    el.style.setProperty('--cust-frame', `url('${this.frameUrl(code)}')`);
    el.style.setProperty('--cust-frame-inset', window.CUSTOMIZE_FRAME_INSET[code] || '-14.5%');
  },
  applyCard(el, code) {
    if (!el) return;
    el.style.setProperty('--cust-card', `url('${this.cardUrl(code)}')`);
    el.classList.toggle('card-light-text', window.CUSTOMIZE_CARD_LIGHT_TEXT.has(code));
  },
  applyCell(el, code) {
    if (!el) return;
    el.classList.add('cust-cell-wrap');
    el.style.setProperty('--cust-cell', `url('${this.cellUrl(code)}')`);
  },
};
window.CustomizeAssets._initDefaultCardVar();
window.CustomizeAssets._initDefaultCellVar();

// ── AUTH ──────────────────────────────────────────────────────────────────────

// Country by IP to store on the account from creation (see handle_new_user in
// the DB, which reads it from raw_user_meta_data). Uses the value already
// cached by analytics.js if available; otherwise fetches it now.
//
// Resolved via the get-country Edge Function (server, not the browser) — this
// used to hit ipinfo.io directly from here, and any tracker blocker (uBlock
// Origin, Firefox/Zen protection) silently cut the fetch, leaving country_code
// null forever (no later retry). Nobody blocks the server.
async function _getCountryCodeForSignup() {
  const cached = localStorage.getItem('_an_country');
  if (cached) return cached || null;
  try {
    const r = await fetch(_SB_URL + '/functions/v1/get-country', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': _SB_ANON, 'Authorization': 'Bearer ' + _SB_ANON },
      body: '{}',
    });
    const d = await r.json();
    if (d && d.country) { localStorage.setItem('_an_country', d.country); return d.country; }
  } catch (e) {}
  return null;
}

window.sbRegister = async function(username, email, password) {
  const country_code = await _getCountryCodeForSignup();
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { username, country_code } }
  });
  if (error) throw error;
  return data;
};

window.sbLogin = async function(username, password) {
  const { data: profile, error: pe } = await sb
    .from('profiles').select('email').eq('username', username).single();
  if (pe || !profile || !profile.email) throw new Error('__user_not_found__');
  const { data, error } = await sb.auth.signInWithPassword({ email: profile.email, password });
  if (error) throw new Error('__wrong_password__');
  return data;
};

const _AUTH_REDIRECT = 'https://mygeochallenge.com/play/';

window.sbResetPassword = async function(email) {
  const res = await fetch(`${_SB_URL}/functions/v1/send-reset-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': _SB_ANON },
    body: JSON.stringify({ email }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error al enviar el correo.');
};

window.sbChangePassword = async function(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
};

window.sbChangeEmail = async function(newEmail) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('No session');
  if (user.email === newEmail) throw new Error('__same_email__');
  const res = await fetch(`${_SB_URL}/functions/v1/send-change-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': _SB_ANON },
    body: JSON.stringify({ userId: user.id, newEmail }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error al enviar el correo.');
};

// Limit of 1 change every 30 days: NOT enforced only here — a trigger
// (protect_username_change) reverts any direct UPDATE of
// username/username_changed_at that doesn't go through this RPC, and the RPC
// itself rejects the change if 30 days haven't passed (see migration
// add_change_username_rpc). Possible errors via error.message:
// __cooldown_active__:ISODATE, __username_taken__, __same_username__,
// __invalid_username__, __not_authenticated__.
window.sbChangeUsername = async function(newUsername) {
  const { data, error } = await sb.rpc('change_username', { p_new_username: newUsername });
  if (error) throw error;
  return data; // timestamptz of this change (new username_changed_at)
};

window.sbLogout = async function() {
  await sb.auth.signOut();
  window._accountLoggedIn = false;
  document.body.classList.remove('account-logged');
};

window.sbGetSession = async function() {
  const { data } = await sb.auth.getSession();
  return data.session;
};

// Links to the just-logged-in user the games/visits played as a guest from
// this same device before creating the account (see claim_anonymous_events in
// the DB). Fire-and-forget: must never interrupt the login flow.
window.sbClaimAnonymousEvents = async function() {
  try {
    const visitorId = localStorage.getItem('_devstats_vid');
    if (!visitorId) return;
    await sb.rpc('claim_anonymous_events', { p_visitor_id: visitorId });
  } catch (e) {}
};

// ── SESSION GUARD (one active device per account) ───────────────────────────

window.sbSetSessionToken = async function(uid, token) {
  try { await window.sb.from('profiles').update({ session_token: token }).eq('id', uid); } catch (e) {}
};

let _sgCh = null, _sgPoll = null;

window.sbStartSessionGuard = function(uid) {
  window.sbStopSessionGuard();
  _sgCh = window.sb.channel('sg-' + uid)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, payload => {
      const mine = localStorage.getItem('_sbSessionToken');
      if (payload.new?.session_token && mine && payload.new.session_token !== mine)
        window._forceSessionLogout?.();
    })
    .subscribe();
  _sgPoll = setInterval(async () => {
    if (!window._sbUserId) { clearInterval(_sgPoll); _sgPoll = null; return; }
    try {
      const { data } = await window.sb.from('profiles').select('session_token').eq('id', uid).single();
      const mine = localStorage.getItem('_sbSessionToken');
      if (data?.session_token && mine && data.session_token !== mine) {
        clearInterval(_sgPoll); _sgPoll = null;
        window._forceSessionLogout?.();
      }
    } catch (e) {}
  }, 60000);
};

window.sbStopSessionGuard = function() {
  if (_sgCh)   { try { window.sb.removeChannel(_sgCh); } catch (e) {} _sgCh = null; }
  if (_sgPoll) { clearInterval(_sgPoll); _sgPoll = null; }
};

// ── PROFILE ─────────────────────────────────────────────────────────────────

window.sbGetProfile = async function(userId) {
  const { data, error } = await sb
    .from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
};

window.sbUpdateProfile = async function(userId, fields) {
  const { error } = await sb.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
};

// Founder pack claim — do NOT use sbUpdateProfile for this: a trigger
// (protect_is_founder) silently blocks any direct client UPDATE of
// is_founder/founder_popup_seen. This RPC is atomic server-side: it marks the
// claim only if the account is still eligible and hadn't claimed before, and if
// this claim reaches 100 total, it closes eligibility for everyone else
// (revokes is_founder from those who didn't claim). Returns true if the claim
// actually applied.
window.sbClaimFounderPack = async function(userId) {
  const { data, error } = await sb.rpc('claim_founder_pack', { p_user_id: userId });
  if (error) throw error;
  return !!data;
};

window.sbSaveScores = async function(userId, scores, sessionId) {
  const { error } = await sb.rpc('add_game_score', {
    p_user_id:    userId,
    p_session_id: sessionId || ('fallback-' + Date.now()),
    p_flags:      scores.flags     ?? 0,
    p_shapes:     scores.shapes    ?? 0,
    p_cities:     scores.cities    ?? 0,
    p_monuments:  scores.monuments ?? 0,
    p_total:      scores.total     ?? 0,
  });
  if (error) throw error;
};

// Records a versus game result in one's own profile (W or L). Each client
// updates ONLY its own record based on its result.
window.sbRecordVersusResult = async function(userId, won) {
  const profile = await window.sbGetProfile(userId);
  const updates = won
    ? { vs_wins:   (profile.vs_wins   || 0) + 1 }
    : { vs_losses: (profile.vs_losses || 0) + 1 };
  await window.sbUpdateProfile(userId, updates);
  // Keep the local cache current so it shows in the profile without a reload
  if (window._sbProfile) Object.assign(window._sbProfile, updates);
  return updates;
};

// ── FRIENDS ─────────────────────────────────────────────────────────────────

window.sbGetFriends = async function(userId) {
  const { data, error } = await sb
    .from('friendships')
    .select(`id, status, initiated_by,
      profile_a:user_a(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments,hs_total),
      profile_b:user_b(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments,hs_total)`)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data || []).map(f => {
    const p = f.profile_a.id === userId ? f.profile_b : f.profile_a;
    return {
      id:     p.id,
      name:   p.username,
      score:  p.hs_total || ((p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0)),
      avatar: p.avatar_url || 'images/profilepic/ppdefault.png',
    };
  });
};

window.sbGetPendingRequests = async function(userId) {
  const { data, error } = await sb
    .from('friendships')
    .select(`id, initiated_by, profile_a:user_a(id,username,avatar_url)`)
    .eq('user_b', userId).eq('status', 'pending');
  if (error) throw error;
  return data || [];
};

window.sbSendFriendRequest = async function(fromId, toUsername) {
  const { data: target, error: fe } = await sb
    .from('profiles').select('id').eq('username', toUsername).single();
  if (fe || !target) throw new Error('Usuario no encontrado');
  // Verify no relationship exists in either direction
  const { data: existing } = await sb.from('friendships')
    .select('id')
    .or(`and(user_a.eq.${fromId},user_b.eq.${target.id}),and(user_a.eq.${target.id},user_b.eq.${fromId})`)
    .maybeSingle();
  if (existing) throw new Error('Ya existe una relación con este usuario');
  const { error } = await sb.from('friendships').insert({
    user_a: fromId, user_b: target.id,
    status: 'pending', initiated_by: fromId
  });
  if (error) throw error;
};

window.sbAcceptRequest = async function(friendshipId) {
  const { error } = await sb.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
  if (error) throw error;
};

window.sbRemoveFriend = async function(friendshipId) {
  const { error } = await sb.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
};

window.sbBlockUser = async function(fromId, targetId, friendshipId) {
  if (friendshipId) {
    const { error } = await sb.from('friendships')
      .update({ status: 'blocked', initiated_by: fromId }).eq('id', friendshipId);
    if (error) throw error;
  } else {
    const { error } = await sb.from('friendships')
      .insert({ user_a: fromId, user_b: targetId, status: 'blocked', initiated_by: fromId });
    if (error) throw error;
  }
};

window.sbDeleteFriendship = async function(friendshipId, userA, userB) {
  if (friendshipId) {
    const { data, error } = await sb.from('friendships').delete().eq('id', friendshipId).select();
    if (!error && data && data.length > 0) return; // deletion confirmed
  }
  // Fallback: the ID was null, invalid, or the row no longer existed with that ID
  if (userA && userB) {
    await sb.from('friendships').delete()
      .or(`and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`);
  }
};

// navigator.maxTouchPoints > 1 (same rule as isMobile in js/core/audio.js) so
// it doesn't depend on userAgent, which can be spoofed/stale.
function _sbDeviceType() {
  return (navigator.maxTouchPoints > 1) ? 'mobile' : 'pc';
}

window.sbUpdateLastActive = async function(userId) {
  await sb.from('profiles').update({ last_active: new Date().toISOString(), device: _sbDeviceType() }).eq('id', userId);
};

window.sbSetPlaying = async function(userId, playing, practicing) {
  await sb.from('profiles')
    .update({ is_playing: playing, is_practicing: !!practicing, last_active: new Date().toISOString(), device: _sbDeviceType() })
    .eq('id', userId);
};

// Which specific mode is being played (see /stats "Who's online now").
// Separate from sbSetPlaying: called a moment later, once the context
// (campaign/vs/practice/chosen mode) is set — see the microtask comment in
// _setPlaying (js/core/campaign.js).
window.sbSetPlayingMode = async function(userId, label) {
  await sb.from('profiles').update({ playing_mode: label || null }).eq('id', userId);
};

window.sbUploadAvatar = async function(userId, blob) {
  const path = `${userId}/avatar.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, {
    contentType: 'image/jpeg', upsert: true
  });
  if (error) throw error;
  const { data } = sb.storage.from('avatars').getPublicUrl(path);
  const url = data.publicUrl + '?t=' + Date.now();
  await sb.from('profiles').update({ avatar_url: url }).eq('id', userId);
  return url;
};

// Loads all social data in a single query.
window.sbLoadSocialData = async function(userId) {
  const { data, error } = await sb.from('friendships')
    .select(`id, status, initiated_by, user_a, user_b,
      pa:user_a(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments,hs_total,play_count,last_active,is_playing,is_practicing,vs_wins,vs_losses,is_supporter,avg_sum_flags,avg_sum_shapes,avg_sum_cities,avg_sum_monuments,play_count_flags,play_count_shapes,play_count_cities,play_count_monuments,country_code,is_founder,cell_code,frame_code,card_code,panel_code,gq_streak_count,gq_streak_last_date,gq_today_time_ms),
      pb:user_b(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments,hs_total,play_count,last_active,is_playing,is_practicing,vs_wins,vs_losses,is_supporter,avg_sum_flags,avg_sum_shapes,avg_sum_cities,avg_sum_monuments,play_count_flags,play_count_shapes,play_count_cities,play_count_monuments,country_code,is_founder,cell_code,frame_code,card_code,panel_code,gq_streak_count,gq_streak_last_date,gq_today_time_ms)`)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if (error) throw error;
  function toEntry(row) {
    const p = row.pa.id === userId ? row.pb : row.pa;
    return {
      friendshipId: row.id,
      id: p.id, name: p.username || '?',
      score: p.hs_total || ((p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0)),
      avatar: p.avatar_url || 'images/profilepic/ppdefault.png',
      hs_flags: p.hs_flags||0, hs_shapes: p.hs_shapes||0,
      hs_cities: p.hs_cities||0, hs_monuments: p.hs_monuments||0,
      avg_sum_flags: p.avg_sum_flags||0, avg_sum_shapes: p.avg_sum_shapes||0,
      avg_sum_cities: p.avg_sum_cities||0, avg_sum_monuments: p.avg_sum_monuments||0,
      play_count_flags: p.play_count_flags||0, play_count_shapes: p.play_count_shapes||0,
      play_count_cities: p.play_count_cities||0, play_count_monuments: p.play_count_monuments||0,
      play_count: p.play_count||0,
      last_active: p.last_active || null,
      is_playing: p.is_playing || false,
      is_practicing: p.is_practicing || false,
      vs_wins: p.vs_wins||0, vs_losses: p.vs_losses||0,
      is_supporter: p.is_supporter || false,
      country_code: p.country_code || null,
      cellCode: p.cell_code || '0001',
      frameCode: p.frame_code || '0001',
      cardCode: p.card_code || '0001',
      panelCode: p.panel_code || '0001',
      gqStreakCount: p.gq_streak_count || 0,
      gqStreakLastDate: p.gq_streak_last_date || null,
      gqTodayTimeMs: (typeof p.gq_today_time_ms === 'number') ? p.gq_today_time_ms : null,
    };
  }
  const rows = data || [];
  return {
    friends:   rows.filter(r => r.status === 'accepted').map(toEntry),
    requests:  rows.filter(r => r.status === 'pending' && r.user_b === userId).map(toEntry),
    sent:      rows.filter(r => r.status === 'pending' && r.user_a === userId).map(toEntry),
    blocked:   rows.filter(r => r.status === 'blocked' && r.initiated_by === userId).map(toEntry),
    blockedMe: rows.filter(r => r.status === 'blocked' && r.initiated_by !== userId).map(toEntry),
  };
};

// ── PERSISTENT SESSION: restore on reload ──────────────────────────────────
// Show the new-password modal (recovery link)
function _showRecoveryModal() {
  history.replaceState(null, '', window.location.pathname);
  function show() {
    if (typeof window._openRecoveryChangePassView === 'function') {
      window._openRecoveryChangePassView();
      return;
    }
    // Fallback if js/menu/loading-boot.js hasn't loaded yet (shouldn't happen, __loadingReady guarantees it)
    window._isPasswordReset = true;
    const modal = document.getElementById('account-modal');
    const viewChangePass = document.getElementById('account-view-change-pass');
    if (!modal || !viewChangePass) return;
    document.querySelectorAll('#account-modal .account-view').forEach(el => { el.style.display = 'none'; });
    viewChangePass.style.display = 'flex';
    modal.classList.add('open');
  }
  // Wait for the preloader to finish (window.__loadingReady) before opening the modal
  function waitAndShow() {
    if (window.__loadingReady) { show(); return; }
    setTimeout(waitAndShow, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAndShow);
  else waitAndShow();
}

// Supabase v2: PASSWORD_RECOVERY event
sb.auth.onAuthStateChange((event, session) => {
  console.log('[auth] event:', event, session?.user?.id);
  if (event === 'PASSWORD_RECOVERY') _showRecoveryModal();
});

// Fallback: detect type=recovery or an error in hash/query params
(function() {
  const hash   = window.location.hash;
  const search = window.location.search;
  const isRecoveryHash  = hash.includes('type=recovery');
  const isRecoveryQuery = search.includes('type=recovery');
  const isExpired = hash.includes('error_code=otp_expired') || search.includes('error_code=otp_expired')
                 || hash.includes('error=access_denied')    || search.includes('error=access_denied');
  if (isExpired) {
    history.replaceState(null, '', window.location.pathname);
    function showExpired() {
      const popup = document.getElementById('expired-popup');
      if (!popup) return;
      if (typeof applyI18n === 'function') applyI18n(popup);
      popup.classList.add('open');
      document.getElementById('expired-ok-btn')?.addEventListener('click', () => {
        popup.classList.remove('open');
        const accountModal = document.getElementById('account-modal');
        const viewLogin    = document.getElementById('account-view-login');
        if (accountModal && viewLogin) {
          document.querySelectorAll('#account-modal .account-view').forEach(el => { el.style.display = 'none'; });
          viewLogin.style.display = 'flex';
          accountModal.classList.add('open');
        }
      }, { once: true });
    }
    function waitAndShowExpired() {
      if (window.__loadingReady) { showExpired(); return; }
      setTimeout(waitAndShowExpired, 200);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitAndShowExpired);
    else waitAndShowExpired();
    return;
  }
  if (isRecoveryHash || isRecoveryQuery) {
    console.log('[auth] recovery detected via URL:', hash || search);
    _showRecoveryModal();
  }
})();

(async function() {
  const session = await window.sbGetSession();
  // Detect the email-verification redirect (signup or email_change)
  const hash = window.location.hash;
  const isSignupVerify = hash.includes('type=signup')       && hash.includes('access_token');
  const isEmailChange  = hash.includes('type=email_change') && hash.includes('access_token');
  if (isSignupVerify || isEmailChange) {
    history.replaceState(null, '', window.location.pathname);
    function showVerifiedPopup() {
      const popup    = document.getElementById('verified-popup');
      const titleEl  = popup?.querySelector('[data-i18n="account.verifiedTitle"]');
      const descEl   = popup?.querySelector('[data-i18n="account.verifiedDesc"]');
      const btnEl    = document.getElementById('verified-login-btn');
      if (!popup) return;
      if (isEmailChange) {
        if (titleEl) { titleEl.removeAttribute('data-i18n'); titleEl.textContent = (typeof t === 'function') ? t('account.emailChangedTitle') : '¡Correo actualizado!'; }
        if (descEl)  { descEl.removeAttribute('data-i18n');  descEl.textContent  = (typeof t === 'function') ? t('account.emailChangedDesc')  : 'Tu correo fue confirmado. Ya puedes iniciar sesión.'; }
        if (btnEl)   { btnEl.removeAttribute('data-i18n');   btnEl.textContent   = (typeof t === 'function') ? t('account.emailChangedBtn')   : 'Iniciar sesión'; }
      } else {
        if (typeof applyI18n === 'function') applyI18n(popup);
      }
      popup.classList.add('open');
      btnEl?.addEventListener('click', () => {
        popup.classList.remove('open');
        const accountModal = document.getElementById('account-modal');
        const viewLogin    = document.getElementById('account-view-login');
        if (accountModal && viewLogin) {
          document.querySelectorAll('#account-modal .account-view').forEach(el => { el.style.display = 'none'; });
          viewLogin.style.display = 'flex';
          accountModal.classList.add('open');
        }
      }, { once: true });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showVerifiedPopup);
    } else {
      setTimeout(showVerifiedPopup, 300);
    }
  }
  if (!session) return;
  // Abandoned password recovery (reload/close without finishing): the recovery
  // session would stay authenticated indefinitely if treated as a normal login.
  if (localStorage.getItem('_pendingPasswordReset')) {
    localStorage.removeItem('_pendingPasswordReset');
    await sb.auth.signOut();
    return;
  }
  window._accountLoggedIn = true;
  window._sbUserId = session.user.id;
  document.body.classList.add('account-logged');
  // Show the locally stored name NOW, without waiting for the server: the
  // button used to show "Cuenta" until the profile fetch resolved (and hang
  // indefinitely with no connection).
  if (typeof window._updateProfileBtnLabel === 'function') window._updateProfileBtnLabel();
  window.sbClaimAnonymousEvents();
  try {
    // With a timeout: a slow/hung profile must not block the rest of session
    // startup (heartbeat, sbSessionReady event) below.
    const profilePromise = window.sbGetProfile(session.user.id);
    const profile = typeof window.withConnTimeout === 'function'
      ? await window.withConnTimeout(profilePromise, 6000)
      : await profilePromise;
    if (profile) {
      window._sbProfile = profile;
      if (profile.username) localStorage.setItem('playerName', profile.username);
      if (profile.avatar_url) {
        localStorage.setItem('profilePhoto', profile.avatar_url);
        if (typeof window.applyStoredProfilePic === 'function') window.applyStoredProfilePic();
      }
      if (typeof window._updateProfileBtnLabel === 'function') window._updateProfileBtnLabel();
      if (typeof window._applyFounderFrame === 'function') window._applyFounderFrame();
    }
  } catch(e) {}
  window.sbUpdateLastActive(session.user.id).catch(() => {});
  // Session guard DISABLED — the account must work on several devices at once
  // without logging each other out (product decision). sbSetSessionToken/
  // sbStartSessionGuard stay defined in this file in case it's revisited, but
  // are no longer called from anywhere.
  // const _sTok = crypto.randomUUID();
  // localStorage.setItem('_sbSessionToken', _sTok);
  // window.sbSetSessionToken(session.user.id, _sTok);
  // window.sbStartSessionGuard(session.user.id);
  // Tell js/profile/profile-account.js the session is ready (local data sync, etc.)
  window._sessionReady = true;
  document.dispatchEvent(new CustomEvent('sbSessionReady', { detail: { userId: session.user.id } }));
  // Periodic heartbeat — only while the tab is visible, otherwise a user who
  // leaves the tab open in the background for hours stays marked "online"
  // indefinitely in /stats (setInterval keeps running in the background).
  setInterval(() => {
    if (window._sbUserId && document.visibilityState === 'visible') window.sbUpdateLastActive(window._sbUserId).catch(() => {});
  }, 25 * 1000);

  // Heartbeat on activity: returning from background or interacting in the menu
  let _lastActivityPing = 0;
  function _activityPing() {
    if (!window._sbUserId) return;
    const now = Date.now();
    if (now - _lastActivityPing < 15000) return; // 15s throttle
    _lastActivityPing = now;
    window.sbUpdateLastActive(window._sbUserId).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _activityPing();
  });
  document.addEventListener('click', _activityPing, { passive: true });
  document.addEventListener('touchstart', _activityPing, { passive: true });
})();
