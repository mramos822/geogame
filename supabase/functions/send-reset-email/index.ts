// send-reset-email — RETIRED (2026-09-23).
//
// It took any email address from the body and mailed it a recovery code, and
// the client got that email by reading profiles.email (public). Password
// recovery now goes through account-auth ({ action: 'reset_request',
// username }), which resolves the email server-side. Kept deployed only to
// answer old cached clients with a clear error instead of a network failure.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  return new Response(JSON.stringify({ error: 'moved', message: 'Reload the page and try again.' }), { status: 410, headers: CORS });
});
