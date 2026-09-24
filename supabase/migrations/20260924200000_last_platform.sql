-- Which build (web / crazygames / gd) an ACCOUNT is connected from right now.
-- Guests already carry it in guest_presence.platform; accounts only had
-- profiles rows, so the online lists could not tell them apart. The client
-- writes it with every presence heartbeat (sbHeartbeat / sbSetPlaying).
alter table public.profiles add column if not exists last_platform text;

CREATE OR REPLACE FUNCTION public.dev_panel_summary(p_range text DEFAULT '1d'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_online timestamptz := now() - interval '5 minutes';
  v_since  timestamptz := case p_range
    when '7d'   then now() - interval '7 days'
    when '30d'  then now() - interval '30 days'
    when '90d'  then now() - interval '90 days'
    when '365d' then now() - interval '365 days'
    when 'all'  then '-infinity'::timestamptz
    else now() - interval '24 hours' end;
  v_result jsonb;
begin
  if not exists (select 1 from public.dev_admins where user_id = auth.uid()) then
    raise exception '__not_allowed__';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'range', coalesce(nullif(p_range, ''), '1d'),
    'totals', jsonb_build_object(
      'users',        (select count(*) from public.profiles),
      'cg_accounts',  (select count(*) from public.profiles where crazygames_user_id is not null),
      'founders',     (select count(*) from public.profiles where founder_popup_seen),
      'games_total',  (select count(*) from public.analytics_events where type in ('campaign', 'versus', 'globequiz'))
    ),
    'period', jsonb_build_object(
      'visitors',     (select count(distinct visitor_id) from public.analytics_events where type = 'visit' and created_at >= v_since),
      'games',        (select count(*) from public.analytics_events where type in ('campaign', 'versus', 'globequiz') and created_at >= v_since),
      'mode_games',   (select count(*) from public.analytics_events where type = 'game' and coalesce(session_type, '') <> 'practice' and created_at >= v_since),
      'new_accounts', (select count(*) from public.profiles where created_at >= v_since),
      'active_accounts', (select count(*) from public.profiles where last_active >= v_since),
      'by_platform', coalesce((
        select jsonb_agg(x order by x->>'platform') from (
          select jsonb_build_object(
            'platform', coalesce(platform, 'web'),
            'visitors', count(distinct visitor_id) filter (where type = 'visit'),
            'games',    count(*) filter (where type in ('campaign', 'versus', 'globequiz'))
          ) as x
          from public.analytics_events
          where created_at >= v_since
          group by coalesce(platform, 'web')
        ) s), '[]'::jsonb)
    ),
    'online', coalesce((
      select jsonb_agg(o order by (o->>'is_playing')::boolean desc, o->>'last_active' desc) from (
        select jsonb_build_object(
          'id', p.id, 'username', p.username, 'avatar_url', p.avatar_url,
          'frame_code', p.frame_code, 'cell_code', p.cell_code,
          'is_playing', coalesce(p.is_playing, false), 'playing_mode', p.playing_mode,
          'is_practicing', coalesce(p.is_practicing, false),
          'last_active', p.last_active, 'device', p.device, 'country_code', p.country_code,
          'hs_total', coalesce(p.hs_total, 0),
          'crazygames', p.crazygames_user_id is not null,
          'platform', coalesce(p.last_platform, 'web'),
          'in_match', exists (select 1 from public.matches m
                              where (m.host_id = p.id or m.guest_id = p.id) and m.status = 'active'
                                and m.created_at > now() - interval '20 minutes'),
          'in_lobby', exists (select 1 from public.lobby_members lm join public.lobbies l on l.id = lm.lobby_id
                              where lm.user_id = p.id and l.status = 'active')
        ) as o
        from public.profiles p
        where p.last_active >= v_online
        limit 200
      ) s), '[]'::jsonb),
    'guests', coalesce((
      select jsonb_agg(g order by (g->>'is_playing')::boolean desc, g->>'last_active' desc) from (
        select distinct on (gp.visitor_id) jsonb_build_object(
          'visitor_id', gp.visitor_id, 'guest_name', gp.guest_name,
          'is_playing', coalesce(gp.is_playing, false), 'playing_mode', gp.playing_mode,
          'last_active', gp.last_active, 'device', gp.device,
          'country_code', gp.country_code, 'platform', coalesce(gp.platform, 'web')
        ) as g
        from public.guest_presence gp
        where gp.last_active >= v_online
        order by gp.visitor_id, gp.last_active desc
      ) s), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;
