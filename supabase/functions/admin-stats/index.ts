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

// Rangos soportados por el selector del dashboard. 'all' usa la fecha real del
// primer registro/evento en vez de un número fijo de días.
const RANGE_DAYS: Record<string, number | null> = {
  '1d': 1, '7d': 7, '30d': 30, '90d': 90, '365d': 365, 'all': null,
};

function hourKey(d: Date): string { return d.toISOString().slice(0, 13); } // YYYY-MM-DDTHH
function dayKey(d: Date): string  { return d.toISOString().slice(0, 10); } // YYYY-MM-DD
function monthKey(d: Date): string{ return d.toISOString().slice(0, 7); }  // YYYY-MM

// Elige la granularidad del gráfico de actividad según el ancho de la ventana:
// 1 día -> por hora, hasta ~4 meses -> por día, más que eso -> por mes. Evita
// graficar 365 puntos diarios ilegibles cuando se pide "TODO" o "365D".
function chooseGranularity(spanMs: number): 'hour' | 'day' | 'month' {
  if (spanMs <= 2 * 86400000) return 'hour';
  if (spanMs <= 120 * 86400000) return 'day';
  return 'month';
}

function buildLabels(granularity: 'hour' | 'day' | 'month', startMs: number, nowMs: number): string[] {
  const out: string[] = [];
  if (granularity === 'hour') {
    for (let i = 23; i >= 0; i--) out.push(hourKey(new Date(nowMs - i * 3600000)));
    return out;
  }
  if (granularity === 'day') {
    const days = Math.max(1, Math.ceil((nowMs - startMs) / 86400000));
    for (let i = days - 1; i >= 0; i--) out.push(dayKey(new Date(nowMs - i * 86400000)));
    return out;
  }
  // month
  const start = new Date(startMs); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const cursor = new Date(start);
  const end = new Date(nowMs);
  let guard = 0;
  while (cursor.getUTCFullYear() < end.getUTCFullYear() ||
         (cursor.getUTCFullYear() === end.getUTCFullYear() && cursor.getUTCMonth() <= end.getUTCMonth())) {
    out.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    if (++guard > 240) break; // tope de seguridad (20 años)
  }
  return out;
}

function keyFor(granularity: 'hour' | 'day' | 'month', iso: string): string {
  if (granularity === 'hour') return iso.slice(0, 13);
  if (granularity === 'day') return iso.slice(0, 10);
  return iso.slice(0, 7);
}

function bucketByKey(rows: { created_at: string }[], labels: string[], granularity: 'hour' | 'day' | 'month'): number[] {
  const map: Record<string, number> = {};
  for (const r of rows) {
    const k = keyFor(granularity, r.created_at);
    map[k] = (map[k] || 0) + 1;
  }
  return labels.map((l) => map[l] || 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const { user, pass, range: rawRange } = body || {};
    const range = (typeof rawRange === 'string' && rawRange in RANGE_DAYS) ? rawRange : '30d';

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
    const nowMs = now.getTime();
    const onlineISO = new Date(nowMs - 5 * 60 * 1000).toISOString();
    const dauISO    = new Date(nowMs - 1 * 86400000).toISOString();
    const wauISO    = new Date(nowMs - 7 * 86400000).toISOString();
    const mauISO    = new Date(nowMs - 30 * 86400000).toISOString();

    const cnt = async (q: any): Promise<number> => {
      const { count } = await q;
      return count || 0;
    };

    // ── Ventana seleccionada ──────────────────────────────────────────────────
    // Para 'all' se busca la fecha real del primer registro/evento; para el resto
    // es simplemente "ahora - N días".
    let windowStartMs: number;
    const days = RANGE_DAYS[range];
    if (days != null) {
      windowStartMs = nowMs - days * 86400000;
    } else {
      const [firstProfile, firstEvent] = await Promise.all([
        sb.from('profiles').select('created_at').order('created_at', { ascending: true }).limit(1),
        sb.from('analytics_events').select('created_at').order('created_at', { ascending: true }).limit(1),
      ]);
      const candidates = [firstProfile.data?.[0]?.created_at, firstEvent.data?.[0]?.created_at]
        .filter(Boolean).map((s: string) => new Date(s).getTime());
      windowStartMs = candidates.length ? Math.min(...candidates) : nowMs - 30 * 86400000;
    }
    const windowISO = new Date(windowStartMs).toISOString();
    const granularity = chooseGranularity(nowMs - windowStartMs);
    const labels = buildLabels(granularity, windowStartMs, nowMs);

    // ── Todas las consultas independientes de esta ventana se lanzan juntas en un
    // solo Promise.all: antes iban en tandas secuenciales (totales → dau/wau/mau →
    // filas crudas → leaderboards → cuentas → países → cohortes), y cada tanda
    // sumaba su propio round-trip de red, haciendo el dashboard sensiblemente
    // lento en cualquier rango. Ninguna de estas depende del resultado de otra,
    // así que corren todas en paralelo.
    const [
      totalUsers, onlineNow, playingNow,
      totalCampaigns, totalVisits, versusTotal, totalGlobequiz,
      dau, wau, mau,
      profilesRes, gamesRes, visitsRes, campaignsRes, globequizRes,
      lbFlags, lbShapes, lbCities, lbMonuments, lbTotal, lbVersus,
      allProfilesRes, countryEventsRes, allEventsRes,
      founderEligibleRes, founderClaimedRes,
      versusFunnelRes, friendshipsRes, onlineUsersRes,
      currencyLedgerRes, xpConfigRes,
      allCampaignsForXpRes, allGlobequizForXpRes, allCurrencyLedgerRes,
    ] = await Promise.all([
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true })),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', onlineISO)),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).eq('is_playing', true).gte('last_active', onlineISO)),
      // "Partidas" = Gira Mundial COMPLETA (los 4 modos, evento 'campaign' logueado
      // recién al terminar el último) + partidas versus terminadas + GlobeQuiz
      // ganado ('globequiz', standalone, no es parte de la Gira Mundial). NO se
      // cuenta por modo: jugar los 4 modos de una campaña son eventos 'game'
      // individuales (para el desglose "Partidas por modo"), pero solo 1
      // 'campaign' si se termina, y 0 si el jugador abandona antes de los 4 modos.
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'campaign')),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'visit')),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'versus')),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'globequiz')),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', dauISO)),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', wauISO)),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', mauISO)),
      sb.from('profiles')
        .select('id, username, created_at, last_active, play_count, hs_total, vs_wins, vs_losses, is_supporter')
        .gte('created_at', windowISO).limit(50000),
      sb.from('analytics_events').select('created_at, type, mode, score, user_id, visitor_id, country_code, session_type')
        .in('type', ['game', 'versus']).gte('created_at', windowISO).limit(50000),
      sb.from('analytics_events').select('created_at, visitor_id, country_code, user_id')
        .eq('type', 'visit').gte('created_at', windowISO).limit(50000),
      sb.from('analytics_events').select('created_at, score, user_id, visitor_id, country_code')
        .eq('type', 'campaign').gte('created_at', windowISO).limit(50000),
      sb.from('analytics_events').select('created_at, score, user_id, visitor_id, country_code, duration_ms, streak')
        .eq('type', 'globequiz').gte('created_at', windowISO).limit(50000),
      sb.from('profiles').select('username, hs_flags').order('hs_flags', { ascending: false }).limit(10),
      sb.from('profiles').select('username, hs_shapes').order('hs_shapes', { ascending: false }).limit(10),
      sb.from('profiles').select('username, hs_cities').order('hs_cities', { ascending: false }).limit(10),
      sb.from('profiles').select('username, hs_monuments').order('hs_monuments', { ascending: false }).limit(10),
      sb.from('profiles').select('username, hs_total').order('hs_total', { ascending: false }).limit(10),
      sb.from('profiles').select('username, vs_wins, vs_losses').order('vs_wins', { ascending: false }).limit(10),
      sb.from('profiles')
        .select('id, username, created_at, last_active, play_count, hs_total, vs_wins, vs_losses, is_supporter, country_code')
        .order('last_active', { ascending: false, nullsFirst: false })
        .limit(2000),
      sb.from('analytics_events')
        .select('user_id, country_code, created_at')
        .not('user_id', 'is', null)
        .not('country_code', 'is', null)
        .order('created_at', { ascending: true })
        .limit(50000),
      sb.from('analytics_events')
        .select('created_at, user_id')
        .in('type', ['game', 'versus'])
        .not('user_id', 'is', null)
        .limit(50000),
      // ── Fundador (primeros 100 RECLAMOS, no primeras 100 cuentas) ──────────
      // elegibles = is_founder=true todavía sin reclamar (pueden confirmar el
      // popup y equiparse); claimed = ya confirmaron (founder_popup_seen=true,
      // ver claim_founder_pack). Al llegar a 100 claimed, is_founder se revoca
      // sola del lado del server para quien no llegó a reclamar.
      sb.from('profiles')
        .select('username, created_at')
        .eq('is_founder', true).eq('founder_popup_seen', false)
        .order('created_at', { ascending: true }),
      sb.from('profiles')
        .select('username, founder_claimed_at')
        .eq('founder_popup_seen', true)
        .order('founder_claimed_at', { ascending: true }),
      // ── Funnel de invitaciones VS (ver logVersusFunnel en js/analytics.js) ──
      // session_type acá guarda el outcome (sent/accepted/declined/expired/
      // abandoned), no el tipo de sesión de partida individual como en 'game'.
      sb.from('analytics_events')
        .select('created_at, session_type, mode, user_id')
        .eq('type', 'versus_funnel').gte('created_at', windowISO).limit(50000),
      // ── Amistades: para detectar spam de solicitudes y medir conectividad ──
      sb.from('friendships')
        .select('user_a, user_b, status, initiated_by, created_at'),
      // ── Quién está conectado/jugando AHORA MISMO ─────────────────────────
      // Lista real (no solo el conteo de onlineNow/playingNow arriba) para
      // que el panel pueda mostrar nombres, no solo un número — antes no
      // había forma de saber QUIÉN está online desde /stats.
      sb.from('profiles')
        .select('username, is_playing, last_active')
        .gte('last_active', onlineISO)
        .order('is_playing', { ascending: false })
        .order('last_active', { ascending: false })
        .limit(200),
      // ── Economía (XP/monedas) — sistema todavía en diseño (ver
      // xp_system_config), pero el tracking crudo ya corre en vivo desde
      // js/analytics.js (logCampaignCurrency/logGlobequizCurrency).
      sb.from('currency_ledger')
        .select('user_id, coins, xp, reason, ref_value, created_at')
        .gte('created_at', windowISO).limit(50000),
      sb.from('xp_system_config').select('rule_key, rule_value, description, status').order('id', { ascending: true }),
      // ── Cálculo EN VIVO (no una foto fija) de lo que cada cuenta debería
      // tener según el historial real de partidas — TODO el historial, sin
      // recortar por rango, porque un total acumulado no tiene sentido
      // "por período". Se recalcula en cada carga del panel.
      sb.from('analytics_events').select('score, user_id').eq('type', 'campaign').not('user_id', 'is', null).limit(50000),
      sb.from('analytics_events').select('streak, user_id').eq('type', 'globequiz').not('user_id', 'is', null).limit(50000),
      // Todo lo que currency_ledger tiene acumulado ALGUNA VEZ para cada
      // cuenta (no solo el rango elegido) — para poder comparar contra el
      // esperado y detectar inserts manipulados (alguien pegándose monedas
      // desde la consola del navegador, ya que el insert es anon sin
      // validación de monto del lado del server).
      sb.from('currency_ledger').select('user_id, coins, xp').limit(50000),
    ]);

    const regRows      = profilesRes.data || [];
    const gameRows      = gamesRes.data     || [];
    const visitRows     = visitsRes.data    || [];
    const campaignRows  = campaignsRes.data  || [];
    const globequizRows = globequizRes.data  || [];
    const singleRows    = gameRows.filter((r: any) => r.type === 'game');
    const versusRows    = gameRows.filter((r: any) => r.type === 'versus');
    // "Partidas" reales del período: Giras Mundiales completas + versus terminados
    // + GlobeQuiz ganado (standalone, no es parte de la Gira Mundial de 4 modos).
    const finishedRows  = [...campaignRows, ...versusRows, ...globequizRows];

    // Series por bucket (hora/día/mes según granularidad)
    const seriesRegs     = bucketByKey(regRows, labels, granularity);
    const seriesGames    = bucketByKey(finishedRows, labels, granularity);
    const seriesVersus   = bucketByKey(versusRows, labels, granularity);
    const visMap: Record<string, Set<string>> = {};
    for (const r of visitRows) {
      const k = keyFor(granularity, r.created_at as string);
      (visMap[k] = visMap[k] || new Set()).add(r.visitor_id || '?');
    }
    const seriesVisitors = labels.map((l) => (visMap[l] ? visMap[l].size : 0));

    // Partidas single-player por modo (dentro de la ventana)
    const byMode: Record<string, number> = { flags: 0, shapes: 0, cities: 0, monuments: 0 };
    for (const r of singleRows) {
      const m = (r.mode as string) || 'otro';
      byMode[m] = (byMode[m] || 0) + 1;
    }

    // Versus por modo (dentro de la ventana)
    const versusByMode: Record<string, number> = { flags: 0, shapes: 0, cities: 0, monuments: 0 };
    for (const r of versusRows) {
      const m = (r.mode as string) || 'otro';
      versusByMode[m] = (versusByMode[m] || 0) + 1;
    }

    // Heatmap de actividad por hora del día (UTC): Giras Mundiales completas + versus
    const hourly = new Array(24).fill(0);
    for (const r of finishedRows) {
      const h = new Date(r.created_at as string).getUTCHours();
      hourly[h]++;
    }

    // Top países (visitantes únicos en la ventana)
    const countryVisitors: Record<string, Set<string>> = {};
    for (const r of visitRows) {
      const cc = (r.country_code as string) || 'XX';
      (countryVisitors[cc] = countryVisitors[cc] || new Set()).add(r.visitor_id || '?');
    }
    const topCountries = Object.entries(countryVisitors)
      .map(([code, set]) => ({ code, count: set.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // ── Funnel: visitantes únicos -> registros -> jugaron al menos 1 partida ──
    const uniqueVisitors = new Set(visitRows.map((r: any) => r.visitor_id || '?')).size;
    const registrations = regRows.length;
    const activePlayerIds = new Set(singleRows.map((r: any) => r.user_id).filter(Boolean));
    const activePlayers = activePlayerIds.size;

    // ── Retención "día 1" dentro de la ventana: de las cuentas creadas en el
    // rango, qué % volvió a estar activo en un día calendario posterior al de
    // su registro (aproximación simple con los datos disponibles: no hay log
    // de sesiones, solo last_active puntual).
    let returnedCohort = 0;
    for (const r of regRows) {
      if (!r.last_active) continue;
      if (dayKey(new Date(r.last_active)) > dayKey(new Date(r.created_at))) returnedCohort++;
    }
    const returnRate = registrations > 0 ? Math.round((returnedCohort / registrations) * 100) : 0;

    // ── Cuentas + historial de partidas (dentro de la ventana) ────────────────
    // Trae todas las cuentas (no solo las creadas en la ventana) para poder ver
    // el historial de partidas de cualquier usuario en el período elegido.
    const allProfiles = allProfilesRes.data || [];
    const gamesByUser: Record<string, any[]> = {};
    for (const r of gameRows as any[]) {
      if (!r.user_id) continue;
      (gamesByUser[r.user_id] = gamesByUser[r.user_id] || []).push({
        type: r.type, mode: r.mode, score: r.score, created_at: r.created_at,
      });
    }
    // Giras Mundiales completas y GlobeQuiz ganado también en el historial
    // por cuenta (antes solo entraban las jugadas sueltas por modo/versus).
    for (const r of campaignRows as any[]) {
      if (!r.user_id) continue;
      (gamesByUser[r.user_id] = gamesByUser[r.user_id] || []).push({
        type: 'campaign', mode: null, score: r.score, created_at: r.created_at,
      });
    }
    for (const r of globequizRows as any[]) {
      if (!r.user_id) continue;
      (gamesByUser[r.user_id] = gamesByUser[r.user_id] || []).push({
        type: 'globequiz', mode: null, score: r.score, created_at: r.created_at,
        duration_ms: r.duration_ms ?? null, streak: r.streak ?? null,
      });
    }

    // ── País de creación de cuenta (aproximado) ───────────────────────────────
    // `profiles` no guarda país propio: se toma el país del evento MÁS ANTIGUO
    // con ese user_id (cualquier tipo: visit/game/versus), que en la práctica es
    // la primera visita logueada, es decir muy cerca del momento de registro.
    const countryByUser: Record<string, string> = {};
    for (const r of (countryEventsRes.data || []) as any[]) {
      if (!countryByUser[r.user_id]) countryByUser[r.user_id] = r.country_code; // primera aparición = la más vieja (orden asc)
    }

    // ── Eventos individuales de la ventana (para el panel "partidas de este día") ──
    // Se manda la lista cruda (no solo el conteo agregado) para poder abrir el
    // detalle al hacer clic en un punto del gráfico de actividad: hora exacta,
    // jugador (o "cuenta no registrada" si jugó sin loguearse) y país.
    const usernameById: Record<string, string> = {};
    for (const p of allProfiles as any[]) usernameById[p.id] = p.username;
    const events = [
      ...(gameRows as any[]).map((r) => ({
        created_at: r.created_at, type: r.type, mode: r.mode, score: r.score,
        // 'campaign' (Gira Mundial) | 'practice' | 'standalone' | null (partidas
        // viejas de antes de que existiera esta columna, o eventos 'versus' que
        // no la necesitan porque ya se distinguen por type).
        session_type: r.session_type || null,
        username: r.user_id ? (usernameById[r.user_id] || null) : null,
        country_code: r.country_code || null,
        duration_ms: null, streak: null,
      })),
      // Giras Mundiales completas y partidas de GlobeQuiz ganadas — antes solo
      // contaban para los totales/gráficos (finishedRows), no aparecían acá.
      // duration_ms/streak solo existen para globequiz (null en campaign).
      ...(campaignRows as any[]).map((r) => ({
        created_at: r.created_at, type: 'campaign', mode: null, score: r.score,
        session_type: 'campaign',
        username: r.user_id ? (usernameById[r.user_id] || null) : null,
        country_code: r.country_code || null,
        duration_ms: null, streak: null,
      })),
      ...(globequizRows as any[]).map((r) => ({
        created_at: r.created_at, type: 'globequiz', mode: null, score: r.score,
        session_type: 'standalone',
        username: r.user_id ? (usernameById[r.user_id] || null) : null,
        country_code: r.country_code || null,
        duration_ms: r.duration_ms ?? null, streak: r.streak ?? null,
      })),
    ];
    // Visitas individuales de la ventana (para el mismo panel de detalle: quién
    // entró a la página ese día, esté o no logueado).
    const visits = (visitRows as any[]).map((r) => ({
      created_at: r.created_at,
      username: r.user_id ? (usernameById[r.user_id] || null) : null,
      country_code: r.country_code || null,
    }));
    // Registros (cuentas creadas) de la ventana, para el mismo panel de detalle.
    const registrationsList = (regRows as any[]).map((r) => ({
      created_at: r.created_at, username: r.username,
    }));

    const accounts = allProfiles.map((p: any) => {
      const games = (gamesByUser[p.id] || []).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return {
        id: p.id, username: p.username, created_at: p.created_at, last_active: p.last_active,
        play_count: p.play_count || 0, hs_total: p.hs_total || 0,
        vs_wins: p.vs_wins || 0, vs_losses: p.vs_losses || 0, is_supporter: !!p.is_supporter,
        // `profiles.country_code` es la fuente confiable (se backfillea una sola vez
        // al loguear, ver _ensureCountryCode en monuments.js); countryByUser (evento
        // más viejo con país en analytics_events) es solo fallback para cuentas que
        // por lo que sea todavía no lo tienen seteado ahí.
        country_code: p.country_code || countryByUser[p.id] || null,
        games_in_range: games.length, games,
      };
    });

    // ── Usuarios activos por bucket (dentro del rango) ────────────────────────
    // Distinto de "partidas por bucket": acá interesa gente ÚNICA, no volumen de
    // eventos, para poder ver si la base de usuarios activos crece o se achica.
    const activeUserMap: Record<string, Set<string>> = {};
    for (const r of gameRows as any[]) {
      if (!r.user_id) continue;
      const k = keyFor(granularity, r.created_at as string);
      (activeUserMap[k] = activeUserMap[k] || new Set()).add(r.user_id);
    }
    const seriesActiveUsers = labels.map((l) => (activeUserMap[l] ? activeUserMap[l].size : 0));

    // ── Retención por cohorte de registro (semana a semana, ALL-TIME) ─────────
    // Independiente del rango elegido: usa todo el historial de eventos/cuentas
    // porque la pregunta ("¿la gente que se registra vuelve semana a semana?")
    // no tiene sentido recortada a los últimos N días. Con last_active solo (un
    // único timestamp) no se puede saber si alguien estuvo activo en la semana 2
    // específicamente, así que se reconstruye desde los eventos crudos.
    const WEEK_MS = 7 * 86400000;
    const MAX_COHORT_WEEKS = 6; // columnas W0..W6
    const allEvents = allEventsRes.data || [];
    const signupById: Record<string, number> = {};
    for (const p of allProfiles) signupById[p.id] = new Date(p.created_at).getTime();
    const activeWeeksByUser: Record<string, Set<number>> = {};
    for (const e of allEvents as any[]) {
      const signup = signupById[e.user_id];
      if (signup == null) continue;
      const offset = Math.floor((new Date(e.created_at as string).getTime() - signup) / WEEK_MS);
      if (offset < 0) continue;
      (activeWeeksByUser[e.user_id] = activeWeeksByUser[e.user_id] || new Set()).add(offset);
    }
    const cohortMap: Record<string, string[]> = {};
    for (const p of allProfiles as any[]) {
      const wkStartMs = Math.floor(new Date(p.created_at).getTime() / WEEK_MS) * WEEK_MS;
      const key = dayKey(new Date(wkStartMs));
      (cohortMap[key] = cohortMap[key] || []).push(p.id);
    }
    const cohortKeys = Object.keys(cohortMap).sort().reverse().slice(0, 8); // 8 cohortes más recientes
    const cohortRetention = cohortKeys.map((key) => {
      const ids = cohortMap[key];
      const cohortStartMs = new Date(key).getTime();
      const weeks: (number | null)[] = [];
      for (let w = 0; w <= MAX_COHORT_WEEKS; w++) {
        if (nowMs < cohortStartMs + w * WEEK_MS) { weeks.push(null); continue; } // semana aún no ocurrió
        const activeCount = ids.filter((id) => activeWeeksByUser[id]?.has(w)).length;
        weeks.push(ids.length > 0 ? Math.round((activeCount / ids.length) * 100) : 0);
      }
      return { cohort: key, size: ids.length, weeks };
    });

    // ── Profundidad de enganche: ¿la gente vuelve después de la 1ra partida? ──
    const playBuckets = { one: 0, few: 0, mid: 0, many: 0 };
    for (const p of allProfiles as any[]) {
      const pc = p.play_count || 0;
      if (pc <= 0) continue;
      if (pc === 1) playBuckets.one++;
      else if (pc <= 5) playBuckets.few++;
      else if (pc <= 15) playBuckets.mid++;
      else playBuckets.many++;
    }

    // ── Cuentas en riesgo / perdidas: jugaron alguna vez pero no volvieron ────
    const atRisk = (allProfiles as any[])
      .filter((p) => (p.play_count || 0) > 0 && p.last_active)
      .map((p) => ({
        username: p.username, play_count: p.play_count || 0, hs_total: p.hs_total || 0,
        last_active: p.last_active,
        days_inactive: Math.floor((nowMs - new Date(p.last_active).getTime()) / 86400000),
      }))
      .filter((p) => p.days_inactive >= 7)
      .sort((a, b) => b.days_inactive - a.days_inactive)
      .slice(0, 15);

    // ── Integridad: detectar juego ilegítimo (automatizado o puntaje fuera
    // de rango) cada vez que alguien juega. Se recalcula en cada carga del
    // panel, sobre la ventana de tiempo elegida (mismo período que el resto
    // del dashboard), y sobre TODOS los eventos crudos — así que cubre solo
    // con volver a cargar la página. Heurísticas, no certezas — cada flag
    // trae el motivo para revisar a ojo, no es un ban automático.
    //
    // Incluye partidas de INVITADOS (sin cuenta, identificados por
    // visitor_id): analytics_events guarda visitor_id en cada evento desde
    // antes de crear cuenta, y claim_anonymous_events() les pone user_id
    // recién al vincular. Como este cálculo relee los eventos crudos en
    // cada carga (no una foto vieja), en cuanto alguien reclama sus
    // partidas de invitado, esas partidas empiezan a aparecer acá con su
    // username real sin tocar nada de este código.
    function meanStd(values: number[]): { mean: number; std: number } {
      if (!values.length) return { mean: 0, std: 0 };
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
      return { mean, std: Math.sqrt(variance) };
    }
    // Identidad de un evento: cuenta real si tiene user_id, si no un alias
    // corto de visitor_id ("Invitado abc123…"); null solo si no hay ninguno
    // de los dos (no debería pasar, pero por las dudas no se flaguea).
    function identityOf(r: { user_id?: string | null; visitor_id?: string | null }): string | null {
      if (r.user_id) return usernameById[r.user_id] || r.user_id;
      if (r.visitor_id) return `Invitado (${r.visitor_id.slice(0, 14)}…)`;
      return null;
    }
    function groupKey(r: { user_id?: string | null; visitor_id?: string | null }): string | null {
      return r.user_id || r.visitor_id || null;
    }
    const MIN_SAMPLE = 8; // no confiar en el z-score con muy pocos datos
    const integrityFlags: { username: string; type: string; mode: string | null; score: number | null; reason: string; created_at: string; severity: 'warn' | 'crit' }[] = [];

    // A) Score de un modo suelto muy por encima del promedio de ESE modo
    // (posible trampa client-side, ej. editar el score antes de mandarlo).
    const scoresByMode: Record<string, number[]> = {};
    for (const r of singleRows as any[]) {
      if (r.score == null) continue;
      (scoresByMode[r.mode || 'otro'] = scoresByMode[r.mode || 'otro'] || []).push(r.score);
    }
    const modeStats: Record<string, { mean: number; std: number }> = {};
    for (const [mode, arr] of Object.entries(scoresByMode)) modeStats[mode] = meanStd(arr);
    for (const r of singleRows as any[]) {
      const identity = identityOf(r);
      if (r.score == null || !identity) continue;
      const mode = r.mode || 'otro';
      const st = modeStats[mode];
      if (!st || st.std === 0 || scoresByMode[mode].length < MIN_SAMPLE) continue;
      const z = (r.score - st.mean) / st.std;
      if (z > 4) {
        integrityFlags.push({
          username: identity, type: 'game', mode,
          score: r.score,
          reason: `Score de ${mode} muy por encima del promedio (z=${z.toFixed(1)}, promedio ${Math.round(st.mean)})`,
          created_at: r.created_at, severity: z > 6 ? 'crit' : 'warn',
        });
      }
    }

    // B) Score de Gira Mundial muy por encima del promedio.
    const campaignScores = (campaignRows as any[]).map((r) => r.score).filter((s: any) => s != null);
    const campaignStats = meanStd(campaignScores);
    if (campaignScores.length >= MIN_SAMPLE && campaignStats.std > 0) {
      for (const r of campaignRows as any[]) {
        const identity = identityOf(r);
        if (r.score == null || !identity) continue;
        const z = (r.score - campaignStats.mean) / campaignStats.std;
        if (z > 4) {
          integrityFlags.push({
            username: identity, type: 'campaign', mode: null,
            score: r.score,
            reason: `Score de Gira Mundial muy por encima del promedio (z=${z.toFixed(1)}, promedio ${Math.round(campaignStats.mean)})`,
            created_at: r.created_at, severity: z > 6 ? 'crit' : 'warn',
          });
        }
      }
    }

    // C) GlobeQuiz resuelto demasiado rápido o con demasiados intentos por
    // segundo para ser un humano tipeando/clickeando.
    for (const r of globequizRows as any[]) {
      const identity = identityOf(r);
      if (!identity || r.duration_ms == null) continue;
      const attempts = r.score || 1;
      const seconds = r.duration_ms / 1000;
      if (r.duration_ms < 3000) {
        integrityFlags.push({
          username: identity, type: 'globequiz', mode: null,
          score: attempts,
          reason: `Ganó GlobeQuiz en ${seconds.toFixed(1)}s — demasiado rápido para un humano`,
          created_at: r.created_at, severity: 'crit',
        });
      } else if (attempts / seconds > 2) {
        integrityFlags.push({
          username: identity, type: 'globequiz', mode: null,
          score: attempts,
          reason: `${attempts} intentos en ${seconds.toFixed(1)}s (${(attempts / seconds).toFixed(1)}/seg) — ritmo no humano`,
          created_at: r.created_at, severity: 'warn',
        });
      }
    }

    // D) Misma cuenta (o mismo invitado) completando Giras Mundiales con
    // menos de 3 minutos de diferencia — una Gira Mundial real implica
    // jugar 4 modos completos, no se puede repetir tan seguido jugando de
    // verdad.
    const campaignsByKeyForBot: Record<string, any[]> = {};
    for (const r of campaignRows as any[]) {
      const key = groupKey(r);
      if (!key) continue;
      (campaignsByKeyForBot[key] = campaignsByKeyForBot[key] || []).push(r);
    }
    for (const rows of Object.values(campaignsByKeyForBot)) {
      const sorted = (rows as any[]).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      for (let i = 1; i < sorted.length; i++) {
        const gapMs = new Date(sorted[i].created_at).getTime() - new Date(sorted[i - 1].created_at).getTime();
        if (gapMs < 3 * 60000) {
          integrityFlags.push({
            username: identityOf(sorted[i]) || '—', type: 'campaign', mode: null,
            score: sorted[i].score,
            reason: `Completó 2 Giras Mundiales con solo ${Math.round(gapMs / 1000)}s de diferencia — ritmo no humano`,
            created_at: sorted[i].created_at, severity: 'crit',
          });
        }
      }
    }

    integrityFlags.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // ── Funnel de invitaciones VS: dónde se pierde la gente entre "invitó" y
    // "terminó la partida" (ver logVersusFunnel, js/analytics.js). 'finished'
    // no viene de acá: se reusa el conteo de versusRows (evento 'versus' ya
    // existente, logueado por el host en finish()).
    const funnelCounts = { sent: 0, accepted: 0, accept_failed: 0, declined: 0, expired: 0, abandoned: 0 };
    for (const r of (versusFunnelRes.data || []) as any[]) {
      const k = r.session_type as string;
      if (k && k in funnelCounts) (funnelCounts as any)[k]++;
    }
    const versusFunnel = { ...funnelCounts, finished: versusRows.length };

    // ── Amistades: pendientes vs aceptadas + quién manda solicitudes en masa ──
    // (detecta el patrón "una cuenta le pide amistad a toda la tabla de una",
    // que infla 'pending' sin ser actividad social real).
    const friendshipRows = (friendshipsRes.data || []) as any[];
    const friendCounts: Record<string, number> = { pending: 0, accepted: 0, blocked: 0 };
    const requestsBySender: Record<string, number> = {};
    for (const f of friendshipRows) {
      friendCounts[f.status] = (friendCounts[f.status] || 0) + 1;
      if (f.status === 'pending' && f.initiated_by) {
        requestsBySender[f.initiated_by] = (requestsBySender[f.initiated_by] || 0) + 1;
      }
    }
    const topSenders = Object.entries(requestsBySender)
      .map(([uid, count]) => ({ username: usernameById[uid] || uid, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const social = {
      pending: friendCounts.pending || 0,
      accepted: friendCounts.accepted || 0,
      blocked: friendCounts.blocked || 0,
      topPendingSenders: topSenders,
    };

    // ── Economía (XP/monedas): sistema todavía sin lanzar (ver
    // xp_system_config), esto es solo el historial crudo acumulado hasta
    // ahora para poder ver cómo viene creciendo antes de armar la UI real.
    const currencyRows = (currencyLedgerRes.data || []) as any[];
    const currencyByReason: Record<string, { count: number; coins: number; xp: number }> = {};
    const currencyByUser: Record<string, { coins: number; xp: number }> = {};
    let currencyTotalCoins = 0, currencyTotalXp = 0;
    for (const r of currencyRows) {
      const reason = r.reason || 'otro';
      const bucket = currencyByReason[reason] = currencyByReason[reason] || { count: 0, coins: 0, xp: 0 };
      bucket.count++; bucket.coins += r.coins || 0; bucket.xp += r.xp || 0;
      currencyTotalCoins += r.coins || 0; currencyTotalXp += r.xp || 0;
      if (r.user_id) {
        const u = currencyByUser[r.user_id] = currencyByUser[r.user_id] || { coins: 0, xp: 0 };
        u.coins += r.coins || 0; u.xp += r.xp || 0;
      }
    }
    const currencyTopEarners = Object.entries(currencyByUser)
      .map(([uid, v]) => ({ username: usernameById[uid] || uid, coins: v.coins, xp: v.xp }))
      .sort((a, b) => b.coins - a.coins)
      .slice(0, 15);

    // ── Retroactivo EN VIVO + detección de manipulación ───────────────────
    // Mismas fórmulas que js/analytics.js (coinsFromScore/xpFromScore para
    // Gira Mundial, base+multiplicador de racha para GlobeQuiz) pero
    // recalculadas acá server-side sobre TODO el historial de
    // analytics_events, que el cliente solo puede insertar (nunca leer ni
    // editar) — a diferencia de currency_ledger, cuyo insert es anon sin
    // validar el monto, así que alguien podría abrir la consola del
    // navegador y insertarse coins/xp inventados ahí. Comparando el
    // "esperado" (este cálculo) contra lo que currency_ledger tiene
    // realmente acumulado, cualquier exceso es sospechoso.
    function levelFromXp(xp: number): number {
      return Math.min(Math.floor((25 + Math.sqrt(625 + 100 * xp)) / 50), 100);
    }
    function levelUpBonusCoins(level: number): number {
      let total = 0;
      for (let lvl = 2; lvl <= level; lvl++) {
        if (lvl === 100) total += 10000;
        else if (lvl % 10 === 0) total += Math.round((20 + Math.pow(lvl - 1, 1.6) * 2) * 1.25);
        else total += Math.round(20 + Math.pow(lvl - 1, 1.6) * 2);
      }
      return total;
    }
    const expectedByUser: Record<string, { coins: number; xp: number }> = {};
    for (const r of (allCampaignsForXpRes.data || []) as any[]) {
      const steps = Math.floor((r.score || 0) / 250);
      const u = expectedByUser[r.user_id] = expectedByUser[r.user_id] || { coins: 0, xp: 0 };
      u.coins += 10 + steps; u.xp += 50 + steps * 3;
    }
    for (const r of (allGlobequizForXpRes.data || []) as any[]) {
      const mult = Math.pow(1.15, Math.min(Math.floor((r.streak || 0) / 10), 10));
      const u = expectedByUser[r.user_id] = expectedByUser[r.user_id] || { coins: 0, xp: 0 };
      u.coins += Math.round(10 * mult); u.xp += Math.round(20 * mult);
    }
    const actualLedgerByUser: Record<string, { coins: number; xp: number }> = {};
    for (const r of (allCurrencyLedgerRes.data || []) as any[]) {
      if (!r.user_id) continue;
      const u = actualLedgerByUser[r.user_id] = actualLedgerByUser[r.user_id] || { coins: 0, xp: 0 };
      u.coins += r.coins || 0; u.xp += r.xp || 0;
    }
    const xpRetroactive = Object.entries(expectedByUser)
      .map(([uid, exp]) => {
        const level = levelFromXp(exp.xp);
        const levelBonus = levelUpBonusCoins(level);
        const actual = actualLedgerByUser[uid] || { coins: 0, xp: 0 };
        // El sistema todavía no paga premios de nivel en vivo (no hay UI de
        // niveles), así que lo único que currency_ledger debería tener
        // acumulado es la parte "gameplay" — cualquier cosa por encima de
        // eso (con un margen chico por redondeos) es sospechosa.
        const suspiciousCoins = Math.max(0, actual.coins - exp.coins);
        return {
          username: usernameById[uid] || uid,
          totalXp: exp.xp, level,
          gameplayCoins: exp.coins, levelBonusCoins: levelBonus, totalCoins: exp.coins + levelBonus,
          ledgerActualCoins: actual.coins, ledgerActualXp: actual.xp,
          suspicious: suspiciousCoins > 5, // margen chico por redondeo entre eventos
          suspiciousCoins,
        };
      })
      .sort((a, b) => b.totalXp - a.totalXp);

    const economy = {
      totalCoins: currencyTotalCoins,
      totalXp: currencyTotalXp,
      eventCount: currencyRows.length,
      byReason: currencyByReason,
      topEarners: currencyTopEarners,
      config: (xpConfigRes.data || []).map((r: any) => ({
        key: r.rule_key, value: r.rule_value, description: r.description, status: r.status,
      })),
      // Cálculo EN VIVO (se recalcula en cada carga, no una foto guardada):
      // qué tendría cada cuenta según su historial real de partidas +
      // comparación contra lo que currency_ledger tiene realmente acumulado,
      // para detectar manipulación (inserts que no matchean la fórmula).
      retroactive: xpRetroactive,
    };

    // ── Insights narrativos (todos all-time, sirven para el resumen ejecutivo) ─
    const everPlayed = (allProfiles as any[]).filter((p) => (p.play_count || 0) > 0).length;
    const neverPlayedCount = allProfiles.length - everPlayed;
    const insights = {
      totalUsersAllTime: allProfiles.length,
      everPlayed,
      neverPlayedCount,
      neverPlayedPct: allProfiles.length ? Math.round((neverPlayedCount / allProfiles.length) * 100) : 0,
      oneAndDone: playBuckets.one,
      oneAndDonePct: everPlayed ? Math.round((playBuckets.one / everPlayed) * 100) : 0,
      atRiskCount: atRisk.length,
    };

    return new Response(JSON.stringify({
      ok: true,
      generated_at: now.toISOString(),
      range,
      totals: { totalUsers, onlineNow, playingNow, totalGames: totalCampaigns + versusTotal + totalGlobequiz, totalVisits, versusTotal },
      onlineUsers: (onlineUsersRes.data || []).map((p: any) => ({
        username: p.username, is_playing: !!p.is_playing, last_active: p.last_active,
      })),
      period: {
        newUsers: registrations, games: finishedRows.length,
        visits: uniqueVisitors, versus: versusRows.length,
      },
      retention: { dau, wau, mau, returnedCohort, cohortSize: registrations, returnRate },
      funnel: { visitors: uniqueVisitors, registrations, activePlayers },
      series: {
        labels, granularity,
        registrations: seriesRegs, games: seriesGames, visitors: seriesVisitors, versus: seriesVersus,
        activeUsers: seriesActiveUsers,
      },
      hourly,
      events,
      visits,
      registrationsList,
      gamesByMode: byMode,
      versusByMode,
      versusFunnel,
      social,
      economy,
      integrityFlags,
      topCountries,
      cohortRetention,
      playBuckets,
      atRisk,
      insights,
      leaderboards: {
        total:     (lbTotal.data     || []).map((p: any) => ({ username: p.username, score: p.hs_total     || 0 })),
        flags:     (lbFlags.data     || []).map((p: any) => ({ username: p.username, score: p.hs_flags     || 0 })),
        shapes:    (lbShapes.data    || []).map((p: any) => ({ username: p.username, score: p.hs_shapes    || 0 })),
        cities:    (lbCities.data    || []).map((p: any) => ({ username: p.username, score: p.hs_cities    || 0 })),
        monuments: (lbMonuments.data || []).map((p: any) => ({ username: p.username, score: p.hs_monuments || 0 })),
        versus:    (lbVersus.data    || []).map((p: any) => ({ username: p.username, wins: p.vs_wins || 0, losses: p.vs_losses || 0 })),
      },
      accounts,
      founder: {
        eligible: (founderEligibleRes.data || []).map((p: any) => ({ username: p.username, created_at: p.created_at })),
        claimed: (founderClaimedRes.data || []).map((p: any) => ({ username: p.username, claimed_at: p.founder_claimed_at })),
        claimedCount: (founderClaimedRes.data || []).length,
        cap: 100,
      },
    }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
