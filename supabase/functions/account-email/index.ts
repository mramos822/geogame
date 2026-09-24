// account-email — lets a CrazyGames account (created with an internal
// cg_<hash>@crazygames.mygeochallenge.internal address, see crazygames-auth)
// attach a REAL email, verified with a 6-digit code, so it can recover its
// password later. Called from the official web (js/profile/crazygames-web.js)
// with the player's session: Authorization: Bearer <access token>.
//   { action: 'send',    email } -> emails a code (1/min, valid 30 min)
//   { action: 'confirm', code  } -> sets the auth email (confirmed); the
//                                   on_auth_email_sync trigger mirrors it
//                                   into profiles.email
// Only accounts still on the internal address can use it (normal accounts
// already verified a real email at signup).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const INTERNAL_DOMAIN = '@crazygames.mygeochallenge.internal';
const CODE_TTL_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

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

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EMAIL_HTML = (code: string, username: string) => `
<div style="background:#0a1628;padding:40px 20px;font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#111d35;border-radius:16px;padding:36px 32px;border:1px solid #1e3a5f;">
    <img src="https://mygeochallenge.com/images/logo.png" alt="myGeoChallenge" style="width:140px;margin-bottom:16px;">
    <h1 style="color:#ffe066;font-size:24px;margin:0 0 8px;">myGeoChallenge</h1>
    <p style="color:#cce0ff;font-size:15px;line-height:1.6;margin:0 0 20px;">
      Hi <b>${username}</b>! Your verification code is:<br>
      ¡Hola <b>${username}</b>! Tu código de verificación es:
    </p>
    <div style="display:inline-block;background:#ffe066;color:#0a1628;font-weight:700;font-size:30px;letter-spacing:0.3em;padding:12px 28px;border-radius:8px;">${code}</div>
    <p style="color:#4a6a8a;font-size:12px;margin:28px 0 0;line-height:1.6;">
      This code expires in 30 minutes. If you didn't request it, ignore this email.<br>
      Este código vence en 30 minutos. Si no lo pediste, ignora este correo.
    </p>
  </div>
</div>`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return cors({});
  if (req.method !== 'POST') return cors({ error: 'method not allowed' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Identify the caller from their own session token, never from the body.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: authData } = await admin.auth.getUser(jwt);
  const user = authData?.user;
  if (!user) return cors({ error: 'not_authenticated' }, 401);
  if (!(user.email || '').endsWith(INTERNAL_DOMAIN)) return cors({ error: 'not_allowed' }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return cors({ error: 'invalid JSON body' }, 400); }

  if (body.action === 'send') {
    const email = String(body.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email) || email.endsWith(INTERNAL_DOMAIN)) {
      return cors({ error: 'invalid_email' }, 400);
    }
    const { data: taken } = await admin.from('profiles').select('id').ilike('email', email).neq('id', user.id).limit(1);
    if (taken && taken.length) return cors({ error: 'email_taken' }, 409);

    const { data: prev } = await admin.from('email_verifications').select('created_at').eq('user_id', user.id).maybeSingle();
    if (prev && Date.now() - new Date(prev.created_at).getTime() < RESEND_COOLDOWN_MS) {
      return cors({ error: 'too_soon' }, 429);
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const { error: upErr } = await admin.from('email_verifications').upsert({
      user_id: user.id, email, code_hash: await sha256(code + user.id), attempts: 0,
      created_at: new Date().toISOString(),
    });
    if (upErr) return cors({ error: upErr.message }, 500);

    const { data: p } = await admin.from('profiles').select('username').eq('id', user.id).maybeSingle();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'myGeoChallenge <noreply@mygeochallenge.com>',
        to: [email],
        subject: `myGeoChallenge — ${code}`,
        html: EMAIL_HTML(code, (p?.username || '').replace(/[<>&"']/g, '')),
      }),
    });
    if (!res.ok) return cors({ error: 'send_failed' }, 502);
    return cors({ ok: true });
  }

  if (body.action === 'confirm') {
    const code = String(body.code || '').trim();
    const { data: row } = await admin.from('email_verifications').select('*').eq('user_id', user.id).maybeSingle();
    if (!row || Date.now() - new Date(row.created_at).getTime() > CODE_TTL_MS) return cors({ error: 'expired' }, 410);
    if (row.attempts >= MAX_ATTEMPTS) return cors({ error: 'too_many_attempts' }, 429);
    if (!/^\d{6}$/.test(code) || (await sha256(code + user.id)) !== row.code_hash) {
      await admin.from('email_verifications').update({ attempts: row.attempts + 1 }).eq('user_id', user.id);
      return cors({ error: 'wrong_code' }, 400);
    }
    // Re-check: someone may have claimed the address meanwhile.
    const { data: taken } = await admin.from('profiles').select('id').ilike('email', row.email).neq('id', user.id).limit(1);
    if (taken && taken.length) return cors({ error: 'email_taken' }, 409);

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { email: row.email, email_confirm: true });
    if (updErr) return cors({ error: updErr.message }, 500);
    await admin.from('email_verifications').delete().eq('user_id', user.id);
    return cors({ ok: true, email: row.email });
  }

  return cors({ error: 'invalid_action' }, 400);
});
