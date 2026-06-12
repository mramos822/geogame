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

window.sbSaveScores = async function(userId, scores) {
  const profile = await window.sbGetProfile(userId);
  const updates = {};
  ['flags','shapes','cities','monuments'].forEach(k => {
    if (scores[k] == null) return;
    if (scores[k] > (profile['hs_' + k] || 0)) updates['hs_' + k] = scores[k];
    updates['avg_sum_' + k]     = (profile['avg_sum_' + k]     || 0) + scores[k];
    updates['play_count_' + k]  = (profile['play_count_' + k]  || 0) + 1;
  });
  if (Object.keys(updates).length) {
    updates.play_count = (profile.play_count || 0) + 1;
    await window.sbUpdateProfile(userId, updates);
  }
};

// ── AMIGOS ────────────────────────────────────────────────────────────────────

window.sbGetFriends = async function(userId) {
  const { data, error } = await sb
    .from('friendships')
    .select(`id, status, initiated_by,
      profile_a:user_a(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments),
      profile_b:user_b(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments)`)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data || []).map(f => {
    const p = f.profile_a.id === userId ? f.profile_b : f.profile_a;
    return {
      id:     p.id,
      name:   p.username,
      score:  (p.hs_flags||0) + (p.hs_shapes||0) + (p.hs_cities||0) + (p.hs_monuments||0),
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

window.sbDeleteFriendship = async function(friendshipId) {
  const { error } = await sb.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
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
      pa:user_a(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments,play_count,last_active,is_playing),
      pb:user_b(id,username,avatar_url,hs_flags,hs_shapes,hs_cities,hs_monuments,play_count,last_active,is_playing)`)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`);
  if (error) throw error;
  function toEntry(row) {
    const p = row.pa.id === userId ? row.pb : row.pa;
    const total = (p.hs_flags||0)+(p.hs_shapes||0)+(p.hs_cities||0)+(p.hs_monuments||0);
    return {
      friendshipId: row.id,
      id: p.id, name: p.username || '?',
      score: total,
      avatar: p.avatar_url || 'images/profilepic/ppdefault.png',
      hs_flags: p.hs_flags||0, hs_shapes: p.hs_shapes||0,
      hs_cities: p.hs_cities||0, hs_monuments: p.hs_monuments||0,
      play_count: p.play_count||0,
      last_active: p.last_active || null,
      is_playing: p.is_playing || false,
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
(async function() {
  const session = await window.sbGetSession();
  // Detectar redirección de verificación de email (signup o email_change)
  const hash = window.location.hash;
  const isSignupVerify     = hash.includes('type=signup')       && hash.includes('access_token');
  const isEmailChange      = hash.includes('type=email_change') && hash.includes('access_token');
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
  // Notificar a monuments.js que la sesión está lista (sync de datos locales, etc.)
  window._sessionReady = true;
  document.dispatchEvent(new CustomEvent('sbSessionReady', { detail: { userId: session.user.id } }));
  // Heartbeat: mantener last_active fresco mientras la página esté abierta
  setInterval(() => {
    if (window._sbUserId) window.sbUpdateLastActive(window._sbUserId).catch(() => {});
  }, 10 * 1000);
})();
