// account-auth — username-based auth without ever exposing emails.
//
// The game logs in with USERNAME + password, but Supabase Auth needs the
// email. The client used to read it from profiles.email (public to anyone),
// so every player's email could be downloaded. Now the email only lives in
// auth.users and is resolved here, server-side:
//
//   { action: 'login', username, password }
//       -> password checked in the DB (verify_login_password, bcrypt via
//          pgcrypto) — not against Auth's password endpoint, so all logins
//          don't share this function's IP rate limit — then a one-time
//          magic-link token is returned: the client exchanges it with
//          supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }).
//   { action: 'reset_request', username }
//       -> emails a 6-digit recovery code to the account's email.
//   { action: 'reset_verify', username, code }
//       -> verifies the code and returns { access_token, refresh_token }; the
//          client sets that session and shows the "new password" view.
//
// Errors: user_not_found | wrong_password | wrong_code | too_many_attempts.
// Brute force: at most 8 failed attempts per username and 40 per IP in 15
// minutes, per action (auth_attempts table).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')!;
const WINDOW_MS         = 15 * 60 * 1000;
const MAX_FAILS_USER    = 8;
const MAX_FAILS_IP      = 40;
const MAX_RESET_EMAILS  = 5; // per username per window

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });

const RESET_HTML = (code: string) => `
<div style="background:#0a1628;padding:40px 20px;font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#111d35;border-radius:16px;padding:36px 32px;border:1px solid #1e3a5f;">
    <img src="https://mygeochallenge.com/images/logo.png" alt="myGeoChallenge" style="width:140px;margin-bottom:16px;">
    <h1 style="color:#ffe066;font-size:24px;margin:0 0 8px;">myGeoChallenge</h1>
    <p style="color:#8aabcf;font-size:13px;margin:0 0 28px;letter-spacing:0.05em;text-transform:uppercase;">Password Reset</p>
    <p style="color:#cce0ff;font-size:15px;line-height:1.6;margin:0 0 20px;">
      A password reset was requested for your account. Enter this code in the app to choose a new password:<br>
      <span style="color:#8aabcf;">Pediste restablecer tu contraseña. Ingresa este código en el juego:</span>
    </p>
    <div style="display:inline-block;background:#ffe066;color:#0a1628;font-weight:700;font-size:30px;letter-spacing:0.3em;padding:12px 28px;border-radius:8px;">${code}</div>
    <p style="color:#4a6a8a;font-size:12px;margin:28px 0 0;line-height:1.6;">
      This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
    </p>
  </div>
</div>`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { return reply({ error: 'invalid JSON body' }, 400); }
  const action = String(body.action || '');
  const username = String(body.username || '').trim();
  if (!username || username.length > 40) return reply({ error: 'user_not_found' }, 404);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  async function throttled(kind: string, maxUser: number, onlyFails = true): Promise<boolean> {
    let qu = admin.from('auth_attempts').select('id', { count: 'exact', head: true })
      .eq('kind', kind).eq('username', username).gte('created_at', since);
    let qi = admin.from('auth_attempts').select('id', { count: 'exact', head: true })
      .eq('kind', kind).eq('ip', ip).gte('created_at', since);
    if (onlyFails) { qu = qu.eq('ok', false); qi = qi.eq('ok', false); }
    const [{ count: cu }, { count: ci }] = await Promise.all([qu, qi]);
    return (cu || 0) >= maxUser || (ci || 0) >= MAX_FAILS_IP;
  }
  const record = (kind: string, ok: boolean) =>
    admin.from('auth_attempts').insert({ kind, username, ip, ok });
  // Opportunistic cleanup (no cron needed for a small table).
  if (Math.random() < 0.05) {
    await admin.from('auth_attempts').delete().lt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  }

  // ── Login ────────────────────────────────────────────────────────────────
  if (action === 'login') {
    const password = String(body.password || '');
    if (await throttled('login', MAX_FAILS_USER)) return reply({ error: 'too_many_attempts' }, 429);
    const { data: rows, error } = await admin.rpc('verify_login_password', { p_username: username, p_password: password });
    if (error) return reply({ error: 'server_error' }, 500);
    const row = (rows || [])[0];
    if (!row) {
      await record('login', false);
      const { data: email } = await admin.rpc('auth_email_for_username', { p_username: username });
      return reply({ error: email ? 'wrong_password' : 'user_not_found' }, 401);
    }
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: row.email });
    if (linkErr || !link?.properties?.hashed_token) return reply({ error: 'server_error' }, 500);
    await record('login', true);
    return reply({ tokenHash: link.properties.hashed_token });
  }

  // ── Password reset: send code ───────────────────────────────────────────
  if (action === 'reset_request') {
    if (await throttled('reset_request', MAX_RESET_EMAILS, false)) return reply({ error: 'too_many_attempts' }, 429);
    const { data: email } = await admin.rpc('auth_email_for_username', { p_username: username });
    if (!email) return reply({ error: 'user_not_found' }, 404);
    await record('reset_request', true);
    // CrazyGames accounts that never added a real email can't receive it.
    if (String(email).endsWith('.internal')) return reply({ error: 'no_email' }, 409);
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
    if (error || !data?.properties?.email_otp) return reply({ error: 'server_error' }, 500);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'myGeoChallenge <noreply@mygeochallenge.com>',
        to: [email],
        subject: 'myGeoChallenge — Your password reset code',
        html: RESET_HTML(data.properties.email_otp),
      }),
    });
    if (!res.ok) return reply({ error: 'send_failed' }, 502);
    return reply({ ok: true });
  }

  // ── Password reset: verify code ─────────────────────────────────────────
  if (action === 'reset_verify') {
    const code = String(body.code || '').trim();
    if (await throttled('reset_verify', MAX_FAILS_USER)) return reply({ error: 'too_many_attempts' }, 429);
    const { data: email } = await admin.rpc('auth_email_for_username', { p_username: username });
    if (!email || !/^\d{6}$/.test(code)) { await record('reset_verify', false); return reply({ error: 'wrong_code' }, 400); }
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await anon.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (error || !data?.session) { await record('reset_verify', false); return reply({ error: 'wrong_code' }, 400); }
    await record('reset_verify', true);
    return reply({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }

  return reply({ error: 'invalid_action' }, 400);
});
