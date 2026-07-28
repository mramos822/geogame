import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY        = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT_URL          = 'https://mygeochallenge.com/play/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EMAIL_HTML = (code: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1628;padding:40px 20px;font-family:'Segoe UI',Arial,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#111d35;border-radius:16px;border:1px solid #1e3a5f;">
      <tr><td style="padding:36px 32px;text-align:center;">
        <img src="https://mygeochallenge.com/images/logo.png" alt="GeoChallenge" width="140" style="width:140px;margin-bottom:16px;">
        <h1 style="color:#ffe066;font-size:24px;margin:0 0 8px;">myGeoChallenge</h1>
        <p style="color:#8aabcf;font-size:13px;margin:0 0 24px;letter-spacing:0.05em;text-transform:uppercase;">Password Reset</p>
        <p style="color:#cce0ff;font-size:15px;line-height:1.6;margin:0 0 20px;">
          A password reset was requested for your account. Enter this code in the app to choose a new password:
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
          <tr><td style="background:#0a1628;border:1px solid #ffe066;border-radius:8px;padding:16px 28px;">
            <span style="color:#ffe066;font-weight:700;font-size:32px;letter-spacing:0.3em;">${code}</span>
          </td></tr>
        </table>
        <p style="color:#cce0ff;font-size:13px;line-height:1.6;margin:0;">
          This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { email } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'email required' }), { status: 400, headers: CORS });

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: REDIRECT_URL }
    });
    if (error || !data?.properties?.email_otp) {
      return new Response(JSON.stringify({ error: error?.message || 'code generation failed' }), { status: 500, headers: CORS });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'myGeoChallenge <noreply@mygeochallenge.com>',
        to: [email],
        subject: 'myGeoChallenge — Your password reset code',
        html: EMAIL_HTML(data.properties.email_otp),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), { status: 500, headers: CORS });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
