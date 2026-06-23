import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT_URL          = 'https://mygeochallenge.com/play/';

const EMAIL_HTML = (resetUrl: string) => `
<div style="background:#0a1628;padding:40px 20px;font-family:'Segoe UI',Arial,sans-serif;text-align:center;">
  <div style="max-width:480px;margin:0 auto;background:#111d35;border-radius:16px;padding:36px 32px;border:1px solid #1e3a5f;">
    <img src="https://mygeochallenge.com/images/logo.png" alt="GeoChallenge" style="width:80px;margin-bottom:16px;">
    <h1 style="color:#ffe066;font-size:24px;margin:0 0 8px;">GeoChallenge</h1>
    <p style="color:#8aabcf;font-size:13px;margin:0 0 28px;letter-spacing:0.05em;text-transform:uppercase;">Password Reset</p>
    <p style="color:#cce0ff;font-size:15px;line-height:1.6;margin:0 0 28px;">
      A password reset was requested for your account.<br>
      Click the button below to choose a new one.
    </p>
    <a href="${resetUrl}"
       style="display:inline-block;background:#ffe066;color:#0a1628;font-weight:700;font-size:15px;padding:13px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.04em;">
      Reset Password
    </a>
    <p style="color:#4a6a8a;font-size:12px;margin:28px 0 0;line-height:1.6;">
      If you didn't request this, you can safely ignore this email.<br>
      This link expires in 24 hours.
    </p>
  </div>
</div>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }});
  }

  try {
    const { email } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400 });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: REDIRECT_URL }
    });
    if (error || !data?.properties?.action_link) {
      return new Response(JSON.stringify({ error: error?.message || 'link generation failed' }), { status: 500 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'myGeoChallenge <noreply@mygeochallenge.com>',
        to: [email],
        subject: 'GeoChallenge — Reset your password 🌍',
        html: EMAIL_HTML(data.properties.action_link),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
