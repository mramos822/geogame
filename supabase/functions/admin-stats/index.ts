// ── admin-stats ───────────────────────────────────────────────────────────────
// Edge Function privada que devuelve estadísticas en vivo del juego para la página
// admin (/stats). Corre con el SERVICE ROLE (bypassa RLS) y exige un usuario+clave
// admin que se validan acá; el secreto NUNCA llega al navegador.
//
// Secrets requeridos (supabase secrets set ...):
//   ADMIN_USER, ADMIN_PASS
// Auto-provistos por la plataforma: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADMIN_USER           = Deno.env.get('ADMIN_USER') || '';
const ADMIN_PASS           = Deno.env.get('ADMIN_PASS') || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const DAYS = 30;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Etiquetas de los últimos DAYS días (incluye hoy), en orden cronológico.
function dayLabels(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

// Cuenta por día (rows con created_at) alineado a labels.
function bucketByDay(rows: { created_at: string }[], labels: string[]): number[] {
  const map: Record<string, number> = {};
  for (const r of rows) {
    const k = r.created_at.slice(0, 10);
    map[k] = (map[k] || 0) + 1;
  }
  return labels.map((l) => map[l] || 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { user, pass } = body || {};

    if (!ADMIN_USER || !ADMIN_PASS) {
      return new Response(JSON.stringify({ error: 'server_not_configured' }), { status: 500, headers: CORS });
    }
    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const now = new Date();
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();
    const windowISO = new Date(now.getTime() - DAYS * 86400000).toISOString();
    const onlineISO = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const labels = dayLabels();

    const cnt = async (q: any): Promise<number> => {
      const { count } = await q;
      return count || 0;
    };

    // ── Totales (count head) ──────────────────────────────────────────────────
    const [
      totalUsers, onlineNow, playingNow, newToday,
      totalGames, gamesToday, totalVisits, visitsToday,
      versusTotal, versusToday,
    ] = await Promise.all([
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true })),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', onlineISO)),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).eq('is_playing', true)),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', todayISO)),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'game')),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'game').gte('created_at', todayISO)),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'visit')),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'visit').gte('created_at', todayISO)),
      cnt(sb.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'finished')),
      cnt(sb.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'finished').gte('created_at', todayISO)),
    ]);

    // ── Filas crudas de la ventana de 30 días (para series y breakdowns) ──────
    const [regsRes, gamesRes, visitsRes, versusRes, topRes] = await Promise.all([
      sb.from('profiles').select('created_at').gte('created_at', windowISO).limit(50000),
      sb.from('analytics_events').select('created_at, mode').eq('type', 'game').gte('created_at', windowISO).limit(50000),
      sb.from('analytics_events').select('created_at, visitor_id, country_code').eq('type', 'visit').gte('created_at', windowISO).limit(50000),
      sb.from('matches').select('created_at').eq('status', 'finished').gte('created_at', windowISO).limit(50000),
      sb.from('profiles').select('username, hs_total').order('hs_total', { ascending: false }).limit(10),
    ]);

    const regRows   = regsRes.data   || [];
    const gameRows  = gamesRes.data  || [];
    const visitRows = visitsRes.data || [];
    const versRows  = versusRes.data || [];

    // Series por día
    const seriesRegs   = bucketByDay(regRows, labels);
    const seriesGames  = bucketByDay(gameRows, labels);
    const seriesVersus = bucketByDay(versRows, labels);

    // Visitantes ÚNICOS por día (distinct visitor_id)
    const visMap: Record<string, Set<string>> = {};
    for (const r of visitRows) {
      const k = (r.created_at as string).slice(0, 10);
      (visMap[k] = visMap[k] || new Set()).add(r.visitor_id || '?');
    }
    const seriesVisitors = labels.map((l) => (visMap[l] ? visMap[l].size : 0));

    // Partidas por modo
    const byMode: Record<string, number> = { flags: 0, shapes: 0, cities: 0, monuments: 0 };
    for (const r of gameRows) {
      const m = (r.mode as string) || 'otro';
      byMode[m] = (byMode[m] || 0) + 1;
    }

    // Top países (visitantes únicos por country_code en la ventana)
    const countryVisitors: Record<string, Set<string>> = {};
    for (const r of visitRows) {
      const cc = (r.country_code as string) || 'XX';
      (countryVisitors[cc] = countryVisitors[cc] || new Set()).add(r.visitor_id || '?');
    }
    const topCountries = Object.entries(countryVisitors)
      .map(([code, set]) => ({ code, count: set.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    return new Response(JSON.stringify({
      ok: true,
      generated_at: now.toISOString(),
      totals: {
        totalUsers, onlineNow, playingNow, newToday,
        totalGames, gamesToday, totalVisits, visitsToday,
        versusTotal, versusToday,
      },
      series: {
        labels,
        registrations: seriesRegs,
        games: seriesGames,
        visitors: seriesVisitors,
        versus: seriesVersus,
      },
      gamesByMode: byMode,
      topCountries,
      topPlayers: (topRes.data || []).map((p: any) => ({ username: p.username, hs_total: p.hs_total || 0 })),
    }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
