// ── SUPABASE CLIENT (global, sin ES modules) ──────────────────────────────────
const _SB_URL  = 'https://xituwurshmaqsnnnrdhx.supabase.co';
const _SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHV3dXJzaG1hcXNubm5yZGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMjU0OTUsImV4cCI6MjA5NjgwMTQ5NX0.jlT6O8dkuYXc8F3fOK_QXgH4Sqw6dAbhi2EIkvcS7Mk';

const sb = supabase.createClient(_SB_URL, _SB_ANON);
window.sb = sb;

// ── PERSONALIZACIÓN (items por código, preparado para la futura tienda) ───────
// images/customize/{frames,cards,panels,emotes,cells}/<code>.png — '0001' es
// el default gratis para todos. frame_code/card_code/panel_code/cell_code
// viven en profiles (ver migraciones customize_item_codes y
// customize_cell_code). Un solo lugar para construir las URLs y aplicar el
// marco/tarjeta/celda, para no repetir el patrón en cada archivo.
// frame = anillo de la foto (tanto la FOTO GRANDE del perfil propio como el
// circulito de cada fila en Rankings/Amigos). cell = el fondo de TODA LA FILA
// (.loading-social-row) donde aparece en Rankings/Amigos — no solo el
// circulito del avatar, toda la tarjeta con nombre/puntaje/etc.
// NOTA: _abs() devuelve una URL absoluta completa (protocolo+host+path),
// resuelta contra document.baseURI (que ya incluye el <base href="../">) —
// NO una ruta relativa ni una con "/" inicial a secas. Es necesario porque
// estos códigos se usan de dos formas distintas: (a) como <img src>, que
// respeta <base>, y (b) dentro de var(--cust-frame) consumida por
// background-image en css/style.css, donde un url() relativo se resuelve
// contra la ubicación DE LA HOJA DE ESTILOS (css/), ignorando <base> —
// terminaba pidiendo css/images/... (404, marco invisible). Una ruta con "/"
// inicial a secas arregla (b) pero rompe (a) si el sitio no está servido
// justo en la raíz del dominio (deploys en subcarpeta). Una URL absoluta ya
// resuelta en JS sirve para ambos casos sin asumir dónde vive el dominio.
// Cuánto tiene que sobresalir la caja del ::after del marco respecto al wrap
// (ver .cust-frame-wrap::after en style.css) para que el borde INTERNO del
// aro de cada PNG quede al ras del borde de la foto, sin pisarla ni flotar
// de más adentro. Cada código tiene su propia proporción de aro dentro del
// canvas (medida con muestreo radial, no a ojo — ver images/customize/frames/):
//   0001.png (129×129): aro simple parejo, radio interno 50 de 64.5 de
//     semi-lienzo (~77.5%) → inset -14.5%.
//   0002.png (152×148, Founder): radio interno ~47.5 de 74 (~64.2%) →
//     mínimo -27.9%, subido a -30% a pedido (un toque más grande).
// Si se agrega un frame code nuevo, medirle el radio interno del aro de la
// misma forma y sumar su entrada acá — no reusar un valor de otro asset.
window.CUSTOMIZE_FRAME_INSET = {
  '0001': '-14.5%',
  '0002': '-30%',
};

// Cells (images/customize/cells/<code>.png) en "modo oscuro": fondo lo
// bastante oscuro u "ocupado" (textura, degradé) como para que el texto de
// posición/nombre en su color normal (marrón #8b6a00/#4a3b00) se pierda —
// para esas, el nombre pasa a blanco con contorno del color que tendría
// normalmente (ver .cell-light-text en style.css y _swatchPreview en
// monuments.js). '0001' (fondo claro/beige) no es modo oscuro. Si se agrega
// un cell code nuevo de fondo oscuro, sumarlo acá — no hace falta tocar CSS
// ni el JS de cada renderer, todos leen de esta lista.
window.CUSTOMIZE_CELL_LIGHT_TEXT = new Set(['0002', '0009']);

// Mismo "modo oscuro" pero para cards (images/customize/cards/<code>.png,
// la ficha del leaderboard in-game): cuando el fondo de la carta es oscuro,
// el nombre/puntaje pasan a blanco con contorno del color que tendrían
// normalmente (ver .card-light-text en style.css). applyCard() abajo agrega
// la clase sola, así que los 3 lugares que llaman a applyCard (#lb-player,
// #flags-lb-player, #customize-preview-lb-card) la reciben gratis; el único
// lugar que NO pasa por applyCard es el swatch de la grilla
// (_swatchPreview 'leaderboard' en monuments.js, arma el HTML a mano), que
// chequea este mismo set directamente.
window.CUSTOMIZE_CARD_LIGHT_TEXT = new Set(['0002']);

// Cells que tienen una variante "-green" propia (images/customize/cells/
// <code>-green.png) para el estado "jugando" — cuando existe, se usa esa
// imagen tal cual en vez del tinte animado genérico (::before + mix-blend
// en style.css, ver .status-playing). Cualquier código NO listado acá sigue
// funcionando con el tinte de siempre — no hace falta pintar una variante
// para cada cell nueva, es opcional.
window.CUSTOMIZE_CELL_GREEN_VARIANTS = new Set(['0002']);

window.CustomizeAssets = {
  _abs(path) { return new URL(path, document.baseURI).href; },
  frameUrl(code) { return this._abs(`images/customize/frames/${code || '0001'}.png`); },
  cardUrl(code)  { return this._abs(`images/customize/cards/${code || '0001'}.png`); },
  panelUrl(code) { return this._abs(`images/customize/panels/${code || '0001'}.png`); },
  emoteUrl(code) { return this._abs(`images/customize/emotes/${code || '0001'}.png`); },
  cellUrl(code)  { return this._abs(`images/customize/cells/${code || '0001'}.png`); },
  // URL de celda a usar cuando la fila está "jugando": la variante -green
  // dedicada si existe para ese código, si no la celda normal de siempre
  // (con el tinte CSS haciéndose cargo, ver applyCellForStatus más abajo).
  cellUrlPlaying(code) {
    return window.CUSTOMIZE_CELL_GREEN_VARIANTS.has(code)
      ? this._abs(`images/customize/cells/${code}-green.png`)
      : this.cellUrl(code);
  },
  // Setea --cust-cell (arte normal, siempre) y --cust-cell-green (variante
  // -green, solo tiene sentido si existe para ese código) + la clase
  // cell-green-asset que le dice a style.css si hay que titilar ENTRE las
  // dos (ver @keyframes cell-green-blink) en vez del tinte genérico. Un
  // solo lugar para esta decisión — evita repetirla en cada sitio que
  // renderiza una fila (renderRankings, loadSocialData render,
  // _patchFriendStatusInDOM, etc., ver monuments.js).
  applyCellForStatus(el, code, statusCls) {
    if (!el) return;
    const playing = statusCls === 'playing';
    const hasGreenAsset = playing && window.CUSTOMIZE_CELL_GREEN_VARIANTS.has(code);
    el.style.setProperty('--cust-cell', `url('${this.cellUrl(code)}')`);
    if (hasGreenAsset) el.style.setProperty('--cust-cell-green', `url('${this.cellUrlPlaying(code)}')`);
    el.classList.toggle('cell-green-asset', hasGreenAsset);
  },
  // Fallback global para filas que nunca llaman a applyCard (bots del
  // leaderboard, que no son cuentas reales y no tienen card_code propio) —
  // sin esto, --cust-card queda sin setear en esas filas y la tarjeta se ve
  // en blanco (ver .lb-entry en style.css, que ya no tiene background-color
  // de respaldo). Seteado una sola vez acá en :root, vía JS para poder usar
  // _abs() (un url() relativo en el CSS estático se resuelve contra la
  // ubicación de la hoja de estilos, no contra la raíz del sitio — ver nota
  // más abajo en este archivo sobre frameUrl/cardUrl).
  _initDefaultCardVar() {
    document.documentElement.style.setProperty('--cust-card-default', `url('${this.cardUrl('0001')}')`);
  },
  // Mismo motivo, para --cust-cell: filas que muestran una CELDA pero no una
  // persona con cell_code propio (ej. la lista de salas públicas en
  // .versus-friend-row, ver _renderPublicRooms en js/lobby.js) nunca llaman
  // a applyCell/applyCellForStatus — sin este default quedaban sin fondo
  // visible ("solo texto plano" reportado) apenas .versus-friend-row dejó
  // de tener un background-color hardcodeado de respaldo.
  _initDefaultCellVar() {
    document.documentElement.style.setProperty('--cust-cell-default', `url('${this.cellUrl('0001')}')`);
  },
  // El marco es un ::after (ver .cust-frame-wrap en style.css) para poder
  // sobresalir del contenedor si el diseño lo pide; se aplica vía CSS var
  // en vez de <img> nuevo para no tocar la estructura HTML de cada avatar.
  // --cust-frame-inset viaja aparte de --cust-frame porque cada PNG tiene su
  // propia proporción de aro (ver CUSTOMIZE_FRAME_INSET arriba) — un solo
  // inset compartido para todos los códigos no sirve.
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

// País por IP para guardarlo en la cuenta desde su creación (ver handle_new_user
// en la DB, que lo lee de raw_user_meta_data). Usa el valor ya cacheado por
// analytics.js si está disponible; si no, lo pide en el momento.
//
// Se resuelve vía la Edge Function get-country (servidor, no el navegador) —
// antes esto pegaba directo a ipinfo.io desde acá mismo, y cualquier
// bloqueador de trackers (uBlock Origin, protección de Firefox/Zen) cortaba
// el fetch en silencio dejando country_code en null para siempre (sin
// reintento posterior). Al servidor nadie lo bloquea.
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

window.sbLogout = async function() {
  await sb.auth.signOut();
  window._accountLoggedIn = false;
  document.body.classList.remove('account-logged');
};

window.sbGetSession = async function() {
  const { data } = await sb.auth.getSession();
  return data.session;
};

// Vincula al usuario recién logueado las partidas/visitas que jugó como invitado
// desde este mismo dispositivo antes de crear la cuenta (ver claim_anonymous_events
// en la DB). Fire-and-forget: nunca debe interrumpir el flujo de login.
window.sbClaimAnonymousEvents = async function() {
  try {
    const visitorId = localStorage.getItem('_devstats_vid');
    if (!visitorId) return;
    await sb.rpc('claim_anonymous_events', { p_visitor_id: visitorId });
  } catch (e) {}
};

// ── SESSION GUARD (un solo dispositivo activo por cuenta) ─────────────────────

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

// ── PERFIL ────────────────────────────────────────────────────────────────────

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

// Reclamo del paquete de Fundador — NO usar sbUpdateProfile para esto: hay un
// trigger (protect_is_founder) que bloquea en silencio cualquier UPDATE directo
// de is_founder/founder_popup_seen desde el cliente. Este RPC es atómico del
// lado del server: marca el reclamo solo si la cuenta sigue elegible y no había
// reclamado antes, y si este reclamo llega a 100 en total, cierra la
// elegibilidad para todo el resto (revoca is_founder a quien no llegó a
// reclamar). Devuelve true si el reclamo se aplicó de verdad.
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

// Registra el resultado de una partida versus en el perfil propio (W o L).
// Cada cliente actualiza SOLO su propio record según su resultado.
window.sbRecordVersusResult = async function(userId, won) {
  const profile = await window.sbGetProfile(userId);
  const updates = won
    ? { vs_wins:   (profile.vs_wins   || 0) + 1 }
    : { vs_losses: (profile.vs_losses || 0) + 1 };
  await window.sbUpdateProfile(userId, updates);
  // Mantener la caché local al día para reflejarlo en el perfil sin recargar
  if (window._sbProfile) Object.assign(window._sbProfile, updates);
  return updates;
};

// ── AMIGOS ────────────────────────────────────────────────────────────────────

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
  // Verificar que no existe relación en ninguna dirección
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
    if (!error && data && data.length > 0) return; // borrado confirmado
  }
  // Fallback: el ID era nulo, inválido o la fila ya no existía con ese ID
  if (userA && userB) {
    await sb.from('friendships').delete()
      .or(`and(user_a.eq.${userA},user_b.eq.${userB}),and(user_a.eq.${userB},user_b.eq.${userA})`);
  }
};

window.sbUpdateLastActive = async function(userId) {
  await sb.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', userId);
};

window.sbSetPlaying = async function(userId, playing, practicing) {
  await sb.from('profiles')
    .update({ is_playing: playing, is_practicing: !!practicing, last_active: new Date().toISOString() })
    .eq('id', userId);
};

// Qué modo específico está jugando (ver /stats "Quién está conectado ahora").
// Separado de sbSetPlaying: se llama un instante después, una vez que el
// contexto (campaña/vs/práctica/modo elegido) ya quedó seteado — ver el
// comentario del microtask en _setPlaying (monuments.js).
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

// Carga todos los datos sociales en una sola consulta.
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

// ── SESIÓN PERSISTENTE: restaurar al recargar ─────────────────────────────────
// Mostrar modal de nueva contraseña (recovery link)
function _showRecoveryModal() {
  history.replaceState(null, '', window.location.pathname);
  function show() {
    if (typeof window._openRecoveryChangePassView === 'function') {
      window._openRecoveryChangePassView();
      return;
    }
    // Fallback si monuments.js todavía no cargó (no debería pasar, __loadingReady lo garantiza)
    window._isPasswordReset = true;
    const modal = document.getElementById('account-modal');
    const viewChangePass = document.getElementById('account-view-change-pass');
    if (!modal || !viewChangePass) return;
    document.querySelectorAll('#account-modal .account-view').forEach(el => { el.style.display = 'none'; });
    viewChangePass.style.display = 'flex';
    modal.classList.add('open');
  }
  // Esperar a que el preloader termine (window.__loadingReady) antes de abrir el modal
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

// Fallback: detectar type=recovery o error en hash/query params
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
    console.log('[auth] recovery detectado via URL:', hash || search);
    _showRecoveryModal();
  }
})();

(async function() {
  const session = await window.sbGetSession();
  // Detectar redirección de verificación de email (signup o email_change)
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
  // Recuperación de contraseña abandonada (recarga/cierre sin terminar): la sesión
  // de recovery quedaría autenticada indefinidamente si la tratáramos como login normal.
  if (localStorage.getItem('_pendingPasswordReset')) {
    localStorage.removeItem('_pendingPasswordReset');
    await sb.auth.signOut();
    return;
  }
  window._accountLoggedIn = true;
  window._sbUserId = session.user.id;
  document.body.classList.add('account-logged');
  // Mostrar el nombre guardado localmente YA, sin esperar la respuesta del
  // servidor: antes el botón se quedaba mostrando "Cuenta" hasta que el fetch
  // del perfil resolvía (y colgado indefinidamente si no había conexión).
  if (typeof window._updateProfileBtnLabel === 'function') window._updateProfileBtnLabel();
  window.sbClaimAnonymousEvents();
  try {
    // Con timeout: un perfil que tarda/cuelga no debe frenar el resto del
    // arranque de sesión (heartbeat, evento sbSessionReady) más abajo.
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
  // Session guard DESACTIVADO — la cuenta debe poder usarse en varios
  // dispositivos a la vez sin cerrar sesión entre sí (decisión del producto).
  // Quedan sbSetSessionToken/sbStartSessionGuard definidas en este archivo
  // por si se retoma más adelante, pero ya no se llaman desde ningún lado.
  // const _sTok = crypto.randomUUID();
  // localStorage.setItem('_sbSessionToken', _sTok);
  // window.sbSetSessionToken(session.user.id, _sTok);
  // window.sbStartSessionGuard(session.user.id);
  // Notificar a monuments.js que la sesión está lista (sync de datos locales, etc.)
  window._sessionReady = true;
  document.dispatchEvent(new CustomEvent('sbSessionReady', { detail: { userId: session.user.id } }));
  // Heartbeat periódico — solo si la pestaña está visible, si no un usuario
  // que deja la pestaña abierta en 2do plano por horas queda marcado como
  // "conectado" indefinidamente en /stats (setInterval sigue corriendo aunque
  // esté en background).
  setInterval(() => {
    if (window._sbUserId && document.visibilityState === 'visible') window.sbUpdateLastActive(window._sbUserId).catch(() => {});
  }, 25 * 1000);

  // Heartbeat en actividad: volver de background o interacción en el menú
  let _lastActivityPing = 0;
  function _activityPing() {
    if (!window._sbUserId) return;
    const now = Date.now();
    if (now - _lastActivityPing < 15000) return; // throttle 15s
    _lastActivityPing = now;
    window.sbUpdateLastActive(window._sbUserId).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _activityPing();
  });
  document.addEventListener('click', _activityPing, { passive: true });
  document.addEventListener('touchstart', _activityPing, { passive: true });
})();
