// ── SUPABASE CLIENT ───────────────────────────────────────────────────────────
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL  = 'https://xituwurshmaqsnnnrdhx.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpdHV3dXJzaG1hcXNubm5yZGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMjU0OTUsImV4cCI6MjA5NjgwMTQ5NX0.jlT6O8dkuYXc8F3fOK_QXgH4Sqw6dAbhi2EIkvcS7Mk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── AUTH ──────────────────────────────────────────────────────────────────────

export async function sbRegister(username, email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });
  if (error) throw error;
  return data;
}

export async function sbLogin(emailOrUser, password) {
  // Supabase solo acepta email; si pasan username lo buscamos primero
  let email = emailOrUser;
  if (!emailOrUser.includes('@')) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', emailOrUser)
      .single();
    if (error || !data) throw new Error('Usuario no encontrado');
    // Necesitamos el email del usuario — lo guardamos en profiles
    const { data: authData, error: authErr } = await supabase
      .from('profiles')
      .select('email')
      .eq('username', emailOrUser)
      .single();
    if (authErr || !authData?.email) throw new Error('Usuario no encontrado');
    email = authData.email;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function sbLogout() {
  await supabase.auth.signOut();
}

export function sbGetSession() {
  return supabase.auth.getSession();
}

// ── PERFIL ────────────────────────────────────────────────────────────────────

export async function sbGetProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function sbUpdateProfile(userId, fields) {
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', userId);
  if (error) throw error;
}

export async function sbSaveScores(userId, scores) {
  // scores = { flags, shapes, cities, monuments }
  const profile = await sbGetProfile(userId);
  const updates = {};
  ['flags','shapes','cities','monuments'].forEach(k => {
    if (scores[k] == null) return;
    const hsKey  = 'hs_' + k;
    const sumKey = 'avg_sum_' + k;
    if (scores[k] > (profile[hsKey] || 0)) updates[hsKey] = scores[k];
    updates[sumKey] = (profile[sumKey] || 0) + scores[k];
    updates['play_count'] = (profile.play_count || 0) + 1;
  });
  if (Object.keys(updates).length) await sbUpdateProfile(userId, updates);
}

// ── AMIGOS ────────────────────────────────────────────────────────────────────

export async function sbGetFriends(userId) {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id, status, initiated_by,
      profile_a:user_a(id, username, avatar_url, hs_flags, hs_shapes, hs_cities, hs_monuments),
      profile_b:user_b(id, username, avatar_url, hs_flags, hs_shapes, hs_cities, hs_monuments)
    `)
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data || []).map(f => {
    const p = f.profile_a.id === userId ? f.profile_b : f.profile_a;
    return {
      id:    p.id,
      name:  p.username,
      score: p.hs_flags + p.hs_shapes + p.hs_cities + p.hs_monuments,
      avatar: p.avatar_url || 'images/profilepic/ppdefault.png',
    };
  });
}

export async function sbGetPendingRequests(userId) {
  const { data, error } = await supabase
    .from('friendships')
    .select(`id, initiated_by, profile_a:user_a(id,username,avatar_url)`)
    .eq('user_b', userId)
    .eq('status', 'pending');
  if (error) throw error;
  return data || [];
}

export async function sbSendFriendRequest(fromId, toUsername) {
  const { data: target, error: fe } = await supabase
    .from('profiles').select('id').eq('username', toUsername).single();
  if (fe || !target) throw new Error('Usuario no encontrado');
  const { error } = await supabase.from('friendships').insert({
    user_a: fromId, user_b: target.id,
    status: 'pending', initiated_by: fromId
  });
  if (error) throw error;
}

export async function sbAcceptRequest(friendshipId) {
  const { error } = await supabase
    .from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
  if (error) throw error;
}

export async function sbRemoveFriend(friendshipId) {
  const { error } = await supabase
    .from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

export async function sbBlockUser(fromId, targetId) {
  const { error } = await supabase.from('friendships').upsert({
    user_a: fromId, user_b: targetId,
    status: 'blocked', initiated_by: fromId
  }, { onConflict: 'user_a,user_b' });
  if (error) throw error;
}
