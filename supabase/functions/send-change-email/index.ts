// send-change-email — verified email change for any account.
//
//   { newEmail }                  (Authorization: Bearer <user access token>)
//       -> emails a confirmation link to the NEW address:
//          https://mygeochallenge.com/play/?email_token=<token>
//   { action: 'confirm', token }  (no session needed: the token is the proof)
//       -> sets the auth email (confirmed); the
//          username login (account-auth) resolves it from auth.users.
//
// Before: it took a `userId` from the body (never checked against the
// caller) and asked Auth for an email_change_new link keyed by the NEW
// address, which never matches a user — so every change failed with "User
// with this email not found". The token is single-use, stored hashed in
// email_verifications (one pending change per user), valid 24 h.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CONFIRM_URL           = 'https://mygeochallenge.com/play/?email_token=';
const TOKEN_TTL_MS          = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS    = 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EMAIL_HTML = (confirmUrl: string) => `
<div style="background:#0a1628;padding:40px 20px;font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#111d35;border-radius:16px;padding:36px 32px;border:1px solid #1e3a5f;">
    <img src="https://mygeochallenge.com/images/logo.png" alt="myGeoChallenge" style="width:140px;margin-bottom:16px;">
    <h1 style="color:#ffe066;font-size:24px;margin:0 0 8px;">myGeoChallenge</h1>
    <p style="color:#8aabcf;font-size:13px;margin:0 0 28px;letter-spacing:0.05em;text-transform:uppercase;">Email Change</p>
    <p style="color:#cce0ff;font-size:15px;line-height:1.6;margin:0 0 28px;">
      You requested to change your email address.<br>
      Click the button below to confirm the change.<br>
      <span style="color:#8aabcf;">Pediste cambiar tu correo. Toca el botón para confirmarlo.</span>
    </p>
    <a href="${confirmUrl}"
       style="display:inline-block;background:#ffe066;color:#0a1628;font-weight:700;font-size:15px;padding:13px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.04em;">
      Confirm Email
    </a>
    <p style="color:#4a6a8a;font-size:12px;margin:28px 0 0;line-height:1.6;">
      If you didn't request this, you can safely ignore this email.<br>
      This link expires in 24 hours.
    </p>
  </div>
</div>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Confirm (link clicked) ────────────────────────────────────────────
    if (body.action === 'confirm') {
      const token = String(body.token || '');
      if (!/^[0-9a-f]{64}$/.test(token)) return reply({ error: 'invalid_token' }, 400);
      const { data: row } = await admin.from('email_verifications')
        .select('user_id, email, created_at').eq('code_hash', await sha256(token)).maybeSingle();
      if (!row || Date.now() - new Date(row.created_at).getTime() > TOKEN_TTL_MS) {
        return reply({ error: 'expired_or_used' }, 410);
      }
      const { data: inUse } = await admin.rpc('auth_email_in_use', { p_email: row.email, p_exclude: row.user_id });
      if (inUse) return reply({ error: 'email_taken' }, 409);
      const { error: updErr } = await admin.auth.admin.updateUserById(row.user_id, { email: row.email, email_confirm: true });
      if (updErr) return reply({ error: updErr.message }, 500);
      await admin.from('email_verifications').delete().eq('user_id', row.user_id);
      return reply({ ok: true, email: row.email });
    }

    // ── Request (from the account modal) ──────────────────────────────────
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: authData } = await admin.auth.getUser(jwt);
    const user = authData?.user;
    if (!user) return reply({ error: 'not_authenticated' }, 401);

    const newEmail = String(body.newEmail || '').trim().toLowerCase();
    if (newEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(newEmail) || newEmail.endsWith('.internal')) {
      return reply({ error: 'invalid_email' }, 400);
    }
    if ((user.email || '').toLowerCase() === newEmail) return reply({ error: '__same_email__' }, 400);
    const { data: inUse } = await admin.rpc('auth_email_in_use', { p_email: newEmail, p_exclude: user.id });
    if (inUse) return reply({ error: 'email_taken' }, 409);

    const { data: prev } = await admin.from('email_verifications').select('created_at').eq('user_id', user.id).maybeSingle();
    if (prev && Date.now() - new Date(prev.created_at).getTime() < RESEND_COOLDOWN_MS) return reply({ error: 'too_soon' }, 429);

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const { error: upErr } = await admin.from('email_verifications').upsert({
      user_id: user.id, email: newEmail, code_hash: await sha256(token), attempts: 0,
      created_at: new Date().toISOString(),
    });
    if (upErr) return reply({ error: upErr.message }, 500);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'myGeoChallenge <noreply@mygeochallenge.com>',
        to: [newEmail],
        subject: 'myGeoChallenge — Confirm your new email',
        html: EMAIL_HTML(CONFIRM_URL + token),
      }),
    });
    if (!res.ok) return reply({ error: 'send_failed' }, 502);
    return reply({ ok: true });
  } catch (e) {
    return reply({ error: String(e) }, 500);
  }
});
