// ── KO-FI WEBHOOK → SUPABASE ─────────────────────────────────────────────────
// Recibe el webhook de Ko-fi cuando alguien dona y activa is_supporter = true
// en el perfil del jugador que escribió su username en el mensaje de la donación.
//
// Secrets necesarios en Supabase (Settings → Edge Functions → Secrets):
//   KOFI_VERIFICATION_TOKEN  →  el token que te da Ko-fi en su panel de webhooks
//   SUPABASE_URL             →  automático en Edge Functions
//   SUPABASE_SERVICE_ROLE_KEY→  automático en Edge Functions
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KOFI_TOKEN      = Deno.env.get('KOFI_VERIFICATION_TOKEN') ?? '';
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // Ko-fi envía form-data con un campo "data" que contiene el JSON del pago
    const form    = await req.formData();
    const raw     = form.get('data');
    if (!raw) return new Response('No data field', { status: 400 });

    const payload = JSON.parse(raw as string);

    // Verificar token de Ko-fi para descartar requests falsos
    if (KOFI_TOKEN && payload.verification_token !== KOFI_TOKEN) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Solo procesar donaciones (no suscripciones de tienda, etc.)
    if (!['Donation', 'Subscription'].includes(payload.type)) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    // Extraer username del mensaje:
    // El donante debe escribir su nombre de usuario en el mensaje de Ko-fi.
    // Formatos aceptados:  "MiUsuario"  /  "username: MiUsuario"  /  "user: MiUsuario"
    const msg = (payload.message ?? '').trim();
    if (!msg) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'no message' }),
        { status: 200 }
      );
    }

    const match    = msg.match(/(?:username|user|nick)[:\s]+(\S+)/i);
    const username = match ? match[1] : msg.split(/\s+/)[0]; // primera palabra si no hay prefijo

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data, error } = await sb
      .from('profiles')
      .update({ is_supporter: true })
      .eq('username', username)
      .select('id, username')
      .single();

    if (error) throw error;
    if (!data) {
      return new Response(
        JSON.stringify({ ok: false, reason: `username "${username}" not found` }),
        { status: 200 }
      );
    }

    console.log(`[kofi] ✅ is_supporter activado para: ${data.username} (${data.id})`);
    return new Response(
      JSON.stringify({ ok: true, username: data.username }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[kofi] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
