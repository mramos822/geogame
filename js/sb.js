// ── SUPABASE CLIENT (global, sin ES modules) ──────────────────────────────────
const _SB_URL  = 'https://xituwurshmaqsnnnrdhx.supabase.co';
const _SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHV3dXJzaG1hcXNubm5yZGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMjU0OTUsImV4cCI6MjA5NjgwMTQ5NX0.jlT6O8dkuYXc8F3fOK_QXgH4Sqw6dAbhi2EIkvcS7Mk';

const sb = supabase.createClient(_SB_URL, _SB_ANON);
window.sb = sb;

// ── AUTH ──────────────────────────────────────────────────────────────────────

window.sbRegister = async function(username, email, password) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { username } }
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

window.sbResetPassword = async function(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
};

window.sbChangePassword = async function(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
};

window.sbChangeEmail = async function(newEmail) {
  const { error } = await sb.auth.updateUser({ email: newEmail });
  if (error) throw error;
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

window.sbSetPlaying = async function(userId, playing) {
  await sb.from('profiles')
    .update({ is_playing: playing, last_active: new Date().toISOString() })
    .eq('id', userId);
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
      pa:user_a(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments,hs_total,play_count,last_active,is_playing,vs_wins,vs_losses,is_supporter),
      pb:user_b(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments,hs_total,play_count,last_active,is_playing,vs_wins,vs_losses,is_supporter)`)
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
      play_count: p.play_count||0,
      last_active: p.last_active || null,
      is_playing: p.is_playing || false,
      vs_wins: p.vs_wins||0, vs_losses: p.vs_losses||0,
      is_supporter: p.is_supporter || false,
    };
  }
  const rows = data || [];
  return {
    friends:  rows.filter(r => r.status === 'accepted').map(toEntry),
    requests: rows.filter(r => r.status === 'pending' && r.user_b === userId).map(toEntry),
    sent:     rows.filter(r => r.status === 'pending' && r.user_a === userId).map(toEntry),
    blocked:  rows.filter(r => r.status === 'blocked' && r.initiated_by === userId).map(toEntry),
  };
};

// ── SESIÓN PERSISTENTE: restaurar al recargar ─────────────────────────────────
// Mostrar modal de nueva contraseña (recovery link)
function _showRecoveryModal() {
  history.replaceState(null, '', window.location.pathname);
  window._isPasswordReset = true;
  function show() {
    const modal = document.getElementById('account-modal');
    const viewChangePass = document.getElementById('account-view-change-pass');
    if (!modal || !viewChangePass) return;
    ['chpass-current','chpass-new','chpass-confirm'].forEach(id => {
      const el = document.getElementById(id); if (el) { el.value = ''; el.classList.remove('input-error'); }
    });
    document.querySelectorAll('[id^="chpass-err"]').forEach(el => { el.textContent = ''; });
    const strengthWrap = document.getElementById('chpass-strength-wrap');
    if (strengthWrap) strengthWrap.style.display = 'none';
    const currentWrap = document.getElementById('chpass-current-wrap');
    if (currentWrap) currentWrap.style.display = 'none';
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
  window._accountLoggedIn = true;
  window._sbUserId = session.user.id;
  document.body.classList.add('account-logged');
  try {
    const profile = await window.sbGetProfile(session.user.id);
    window._sbProfile = profile;
    if (profile.username) localStorage.setItem('playerName', profile.username);
    if (profile.avatar_url) {
      localStorage.setItem('profilePhoto', profile.avatar_url);
      if (typeof window.applyStoredProfilePic === 'function') window.applyStoredProfilePic();
    }
  } catch(e) {}
  window.sbUpdateLastActive(session.user.id).catch(() => {});
  // Session guard: registrar token único para esta sesión (kickea otros dispositivos)
  const _sTok = crypto.randomUUID();
  localStorage.setItem('_sbSessionToken', _sTok);
  window.sbSetSessionToken(session.user.id, _sTok);
  window.sbStartSessionGuard(session.user.id);
  // Notificar a monuments.js que la sesión está lista (sync de datos locales, etc.)
  window._sessionReady = true;
  document.dispatchEvent(new CustomEvent('sbSessionReady', { detail: { userId: session.user.id } }));
  // Heartbeat periódico
  setInterval(() => {
    if (window._sbUserId) window.sbUpdateLastActive(window._sbUserId).catch(() => {});
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
