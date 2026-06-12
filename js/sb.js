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
  let playAdded = false;
  ['flags','shapes','cities','monuments'].forEach(k => {
    if (scores[k] == null) return;
    if (scores[k] > (profile['hs_' + k] || 0)) updates['hs_' + k] = scores[k];
    updates['avg_sum_' + k] = (profile['avg_sum_' + k] || 0) + scores[k];
    if (!playAdded) { updates.play_count = (profile.play_count || 0) + 1; playAdded = true; }
  });
  if (Object.keys(updates).length) await window.sbUpdateProfile(userId, updates);
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

window.sbBlockUser = async function(fromId, targetId) {
  const { error } = await sb.from('friendships').upsert({
    user_a: fromId, user_b: targetId,
    status: 'blocked', initiated_by: fromId
  }, { onConflict: 'user_a,user_b' });
  if (error) throw error;
};

// ── SESIÓN PERSISTENTE: restaurar al recargar ─────────────────────────────────
(async function() {
  const session = await window.sbGetSession();
  if (!session) {
    // Detectar redirección de verificación de email
    const hash = window.location.hash;
    if (hash.includes('type=signup') && hash.includes('access_token')) {
      // Limpiar el hash de la URL sin recargar
      history.replaceState(null, '', window.location.pathname);
      // Esperar a que el DOM esté listo para mostrar el popup
      function showVerifiedPopup() {
        const popup = document.getElementById('verified-popup');
        const loginBtn = document.getElementById('verified-login-btn');
        if (!popup) return;
        if (typeof applyI18n === 'function') applyI18n(popup);
        popup.classList.add('open');
        loginBtn?.addEventListener('click', () => {
          popup.classList.remove('open');
          const accountModal = document.getElementById('account-modal');
          const viewLogin    = document.getElementById('account-view-login');
          if (accountModal && viewLogin) {
            ['account-view-main','account-view-login','account-view-register','account-view-loading','account-view-verify','account-view-welcome']
              .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
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
    return;
  }
  window._accountLoggedIn = true;
  window._sbUserId = session.user.id;
  document.body.classList.add('account-logged');
  try {
    const profile = await window.sbGetProfile(session.user.id);
    window._sbProfile = profile;
    if (profile.username && !localStorage.getItem('playerName'))
      localStorage.setItem('playerName', profile.username);
  } catch(e) {}
})();
