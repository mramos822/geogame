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

    // ── Totales globales (all-time, no dependen del rango) ────────────────────
    const [
      totalUsers, onlineNow, playingNow,
      totalGames, totalVisits, versusTotal,
    ] = await Promise.all([
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true })),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', onlineISO)),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).eq('is_playing', true).gte('last_active', onlineISO)),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).in('type', ['game', 'versus'])),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'visit')),
      cnt(sb.from('analytics_events').select('*', { count: 'exact', head: true }).eq('type', 'versus')),
    ]);

    // ── Retención (DAU/WAU/MAU, all-time, no depende del rango) ───────────────
    const [dau, wau, mau] = await Promise.all([
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', dauISO)),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', wauISO)),
      cnt(sb.from('profiles').select('*', { count: 'exact', head: true }).gte('last_active', mauISO)),
    ]);

    // ── Filas crudas de la ventana seleccionada ────────────────────────────────
    const [profilesRes, gamesRes, visitsRes] = await Promise.all([
      sb.from('profiles')
        .select('id, username, created_at, last_active, play_count, hs_total, vs_wins, vs_losses, is_supporter')
        .gte('created_at', windowISO).limit(50000),
      sb.from('analytics_events').select('created_at, type, mode, score, user_id, country_code, session_type')
        .in('type', ['game', 'versus']).gte('created_at', windowISO).limit(50000),
      sb.from('analytics_events').select('created_at, visitor_id, country_code, user_id')
        .eq('type', 'visit').gte('created_at', windowISO).limit(50000),
    ]);

    const regRows      = profilesRes.data || [];
    const gameRows      = gamesRes.data     || [];
    const visitRows     = visitsRes.data    || [];
    const singleRows    = gameRows.filter((r: any) => r.type === 'game');
    const versusRows    = gameRows.filter((r: any) => r.type === 'versus');

    // Series por bucket (hora/día/mes según granularidad)
    const seriesRegs     = bucketByKey(regRows, labels, granularity);
    const seriesGames    = bucketByKey(gameRows, labels, granularity);
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

    // Heatmap de actividad por hora del día (UTC), partidas single-player + versus
    const hourly = new Array(24).fill(0);
    for (const r of gameRows) {
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

    // ── Leaderboards por modo + versus (all-time, no dependen del rango: son highscores) ──
    const [lbFlags, lbShapes, lbCities, lbMonuments, lbTotal, lbVersus] = await Promise.all([
      sb.from('profiles').select('username, hs_flags').order('hs_flags', { ascending: false }).limit(10),
      sb.from('profiles').select('username, hs_shapes').order('hs_shapes', { ascending: false }).limit(10),
      sb.from('profiles').select('username, hs_cities').order('hs_cities', { ascending: false }).limit(10),
      sb.from('profiles').select('username, hs_monuments').order('hs_monuments', { ascending: false }).limit(10),
      sb.from('profiles').select('username, hs_total').order('hs_total', { ascending: false }).limit(10),
      sb.from('profiles').select('username, vs_wins, vs_losses').order('vs_wins', { ascending: false }).limit(10),
    ]);

    // ── Cuentas + historial de partidas (dentro de la ventana) ────────────────
    // Trae todas las cuentas (no solo las creadas en la ventana) para poder ver
    // el historial de partidas de cualquier usuario en el período elegido.
    const allProfilesRes = await sb.from('profiles')
      .select('id, username, created_at, last_active, play_count, hs_total, vs_wins, vs_losses, is_supporter')
      .order('last_active', { ascending: false, nullsFirst: false })
      .limit(2000);
    const allProfiles = allProfilesRes.data || [];
    const gamesByUser: Record<string, any[]> = {};
    for (const r of gameRows as any[]) {
      if (!r.user_id) continue;
      (gamesByUser[r.user_id] = gamesByUser[r.user_id] || []).push({
        type: r.type, mode: r.mode, score: r.score, created_at: r.created_at,
      });
    }

    // ── País de creación de cuenta (aproximado) ───────────────────────────────
    // `profiles` no guarda país propio: se toma el país del evento MÁS ANTIGUO
    // con ese user_id (cualquier tipo: visit/game/versus), que en la práctica es
    // la primera visita logueada, es decir muy cerca del momento de registro.
    const countryEventsRes = await sb.from('analytics_events')
      .select('user_id, country_code, created_at')
      .not('user_id', 'is', null)
      .not('country_code', 'is', null)
      .order('created_at', { ascending: true })
      .limit(50000);
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
    const events = (gameRows as any[]).map((r) => ({
      created_at: r.created_at, type: r.type, mode: r.mode, score: r.score,
      // 'campaign' (Gira Mundial) | 'practice' | 'standalone' | null (partidas
      // viejas de antes de que existiera esta columna, o eventos 'versus' que
      // no la necesitan porque ya se distinguen por type).
      session_type: r.session_type || null,
      username: r.user_id ? (usernameById[r.user_id] || null) : null,
      country_code: r.country_code || null,
    }));
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
        country_code: countryByUser[p.id] || null,
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
    const allEventsRes = await sb.from('analytics_events')
      .select('created_at, user_id')
      .in('type', ['game', 'versus'])
      .not('user_id', 'is', null)
      .limit(50000);
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
      totals: { totalUsers, onlineNow, playingNow, totalGames, totalVisits, versusTotal },
      period: {
        newUsers: registrations, games: singleRows.length + versusRows.length,
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
    }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
