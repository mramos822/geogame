// crazygames-auth — links a CrazyGames user (identified by their
// CrazyGames userId, obtained client-side from the CrazyGames SDK) to a
// myGeoChallenge Supabase account, WITHOUT ever showing our own login UI —
// this is what CrazyGames' "linked to a game account associated with the
// CrazyGames User" submission option requires.
//
// Flow: client (crazy-build only) gets the CrazyGames userId from
// window.CrazyGames.SDK.user, POSTs it here. We look up (or create) an
// auth.users row keyed by a deterministic internal email derived from that
// id, then mint a one-time magiclink token with the admin API and hand back
// its `hashed_token`. The client calls supabase.auth.verifyOtp({ token_hash,
// type: 'magiclink' }) with it to get a REAL session (access+refresh token),
// so every existing RLS-gated code path (sbUpdateProfile, sbSaveScores,
// friends, etc.) keeps working completely unmodified for these accounts.
// Later, the player can turn this into a normal login (usable on the main
// site too) by setting a password from inside the game — reuses the existing
// sbChangePassword flow, see crazy-build's crazygames-link.js.
//
// PROFILE CREATION: the `on_auth_user_created` trigger (handle_new_user)
// inserts the profiles row itself, taking username from
// raw_user_meta_data->>'username'. profiles.username is NOT NULL + UNIQUE, so
// the username MUST travel in user_metadata — without it the trigger fails and
// createUser returns "Database error creating new user" (that was the bug that
// kept every CrazyGames login as a guest). A taken username also fails inside
// the trigger with that same generic error, so we just retry createUser with a
// fresh suffix. The CrazyGames-specific columns are then set with an UPDATE.
//
// SECURITY NOTE: this trusts the crazygamesUserId the client sends as-is.
// CrazyGames' SDK only exposes that id to code running inside their own
// iframe/sandbox, so spoofing requires running outside it — acceptable risk
// for a casual leaderboard/friends game. If that's ever a concern, add
// server-side verification of the CrazyGames user token here before trusting
// the id (check current CrazyGames SDK docs for their token-verification
// endpoint — not wired in yet).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function cors(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return cors({});
  if (req.method !== 'POST') return cors({ error: 'method not allowed' }, 405);

  let crazygamesUserId: string | undefined;
  let username: string | undefined;
  let avatarUrl: string | undefined;
  try {
    const body = await req.json();
    crazygamesUserId = String(body.crazygamesUserId || '').trim();
    username = body.username ? String(body.username).slice(0, 20) : undefined;
    avatarUrl = body.avatarUrl ? String(body.avatarUrl) : undefined;
  } catch {
    return cors({ error: 'invalid JSON body' }, 400);
  }
  if (!crazygamesUserId) return cors({ error: 'crazygamesUserId is required' }, 400);
  // It's interpolated into an email and a PostgREST or() filter below — only
  // allow id-like characters so it can't alter either.
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(crazygamesUserId)) return cors({ error: 'invalid crazygamesUserId' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Internal-only address — never emailed to anyone, just an Auth identity key.
  // Built from a hash of the id, NOT the raw id: Auth lowercases emails, and
  // CrazyGames ids are case-sensitive, so two ids differing only in case
  // would otherwise share one email (and findExisting would hand the second
  // player the first one's account).
  const idHash = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(crazygamesUserId)),
  )).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  const internalEmail = `cg_${idHash}@crazygames.mygeochallenge.internal`;

  // 1) Existing link? By crazygames_user_id, or by the internal email in case
  // an earlier attempt created the user but died before tagging the profile
  // (or a concurrent request is creating it right now).
  const findExisting = async () => {
    const { data } = await admin
      .from('profiles')
      .select('id, email')
      .or(`crazygames_user_id.eq.${crazygamesUserId},email.eq.${internalEmail}`)
      .limit(1)
      .maybeSingle();
    return data as { id: string; email: string | null } | null;
  };

  // The magic link must target the account's REAL auth email: accounts
  // created before the hashed format keep their old cg_<lowercased id>@...
  // address, so it's taken from the profile instead of recomputed.
  let loginEmail = internalEmail;
  const found = await findExisting();
  let userId = found?.id;
  if (found?.email) loginEmail = found.email;

  if (!userId) {
    // 2) First time this CrazyGames user shows up. The trigger creates the
    // profile from user_metadata.username (see header). Same rules as the web
    // register form (profile-account.js): 4-12 chars, letters/digits only.
    // Their CrazyGames name is used as-is when free; digits are added only
    // if it's already taken (case-insensitive, so "juan" doesn't sit next to
    // an existing "Juan").
    let cleanName = (username || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    if (cleanName.length < 4) cleanName = 'Player';
    const { data: taken } = await admin
      .from('profiles').select('id').ilike('username', cleanName).limit(1);
    const cleanFree = !taken || taken.length === 0;
    const MAX_ATTEMPTS = 8;
    let lastErr = 'unknown';
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !userId; attempt++) {
      // 1st try: the clean name (if free); then base (8 chars) + 4 digits,
      // which still fits in 12; last resort: effectively unique.
      const candidate = (attempt === 0 && cleanFree) ? cleanName
        : attempt < MAX_ATTEMPTS - 1 ? `${cleanName.slice(0, 8)}${Math.floor(1000 + Math.random() * 9000)}`
        : `cg${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: internalEmail,
        email_confirm: true, // they never touch email/password unless they choose to later
        user_metadata: { username: candidate, crazygames_user_id: crazygamesUserId },
      });
      if (created?.user) { userId = created.user.id; break; }
      lastErr = createErr?.message || 'unknown';
      // Email already registered = a concurrent request (or an earlier
      // partial run) got there first — adopt that account instead of retrying.
      const existing = await findExisting();
      if (existing) {
        userId = existing.id;
        if (existing.email) loginEmail = existing.email;
        break;
      }
    }
    if (!userId) return cors({ error: 'createUser failed: ' + lastErr }, 500);
  }

  // 3) Tag the profile as a CrazyGames account (idempotent — also repairs a
  // profile left untagged by an interrupted earlier attempt).
  const patch: Record<string, unknown> = { crazygames_user_id: crazygamesUserId };
  if (avatarUrl) patch.avatar_url = avatarUrl;
  const { error: tagErr } = await admin.from('profiles').update(patch).eq('id', userId).is('crazygames_user_id', null);
  if (tagErr) return cors({ error: 'profile update failed: ' + tagErr.message }, 500);

  // 4) Mint a one-time magiclink and hand back its hashed_token — the client
  // exchanges it via supabase.auth.verifyOtp() to get a real session.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: loginEmail,
  });
  if (linkErr || !linkData) {
    return cors({ error: 'generateLink failed: ' + (linkErr?.message || 'unknown') }, 500);
  }

  return cors({
    userId,
    email: loginEmail,
    tokenHash: linkData.properties?.hashed_token,
  });
});
