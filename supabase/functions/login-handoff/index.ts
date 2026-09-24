// login-handoff — one-click login on mygeochallenge.com for a player coming
// from the CrazyGames build ("Ir a la web" button, crazygames-link.js).
//
// The CrazyGames build (logged in) calls the create_login_handoff() RPC and
// opens https://mygeochallenge.com/play/?handoff=<code>. The web
// (js/profile/crazygames-web.js) then calls this function:
//   { action: 'peek',   code } -> { username }     (code NOT consumed; lets the
//                                                   web show "Log in as X")
//   { action: 'redeem', code } -> { tokenHash }    (code consumed; the web
//                                                   exchanges it with
//                                                   supabase.auth.verifyOtp)
// Codes are single-use and expire after 10 minutes. No password ever travels
// in the URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TTL_MS = 10 * 60 * 1000;

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

  let action = '', code = '';
  try {
    const body = await req.json();
    action = String(body.action || '');
    code = String(body.code || '');
  } catch {
    return cors({ error: 'invalid JSON body' }, 400);
  }
  if (!/^[0-9a-f]{48}$/.test(code)) return cors({ error: 'invalid_code' }, 400);
  if (action !== 'peek' && action !== 'redeem') return cors({ error: 'invalid_action' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const minCreated = new Date(Date.now() - TTL_MS).toISOString();
  const { data: row } = await admin.from('login_handoffs')
    .select('user_id')
    .eq('code', code).is('used_at', null).gte('created_at', minCreated)
    .maybeSingle();
  if (!row) return cors({ error: 'expired_or_used' }, 404);

  if (action === 'peek') {
    const { data: p } = await admin.from('profiles').select('username').eq('id', row.user_id).maybeSingle();
    return cors({ username: p?.username || null });
  }

  // Consume atomically: only the request that flips used_at wins.
  const { data: consumed } = await admin.from('login_handoffs')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code).is('used_at', null)
    .select('user_id').maybeSingle();
  if (!consumed) return cors({ error: 'expired_or_used' }, 404);

  const { data: u, error: uErr } = await admin.auth.admin.getUserById(consumed.user_id);
  if (uErr || !u?.user?.email) return cors({ error: 'user_not_found' }, 404);
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: u.user.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return cors({ error: 'generateLink failed: ' + (linkErr?.message || 'unknown') }, 500);
  }
  return cors({ tokenHash: linkData.properties.hashed_token });
});
