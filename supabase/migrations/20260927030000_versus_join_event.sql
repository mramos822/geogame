-- Versus rooms are counted once (host's 'versus' event). The non-host participant now logs a
-- 'versus_join' event so their own account counts as having played. Two server checks that only
-- looked for 'versus' must recognise it: the daily-bonus "played" flag and the ghost-account cleanup.

create or replace function public.daily_bonus_state(p_uid uuid, p_visitor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_last  record;
  v_day   integer;
  v_claimable boolean;
  v_played boolean;
begin
  if p_uid is null and (p_visitor is null or char_length(p_visitor) < 8 or char_length(p_visitor) > 80) then
    return jsonb_build_object('claimable', false, 'day', 1, 'coins', 0, 'played', true);
  end if;
  if p_uid is not null then
    select claim_date, day_number into v_last from daily_bonus_claims
      where user_id = p_uid order by claim_date desc limit 1;
    select coalesce((select play_count from profiles where id = p_uid), 0) > 0
        or exists (select 1 from analytics_events
                   where user_id = p_uid and type in ('game', 'campaign', 'versus', 'versus_join', 'globequiz'))
      into v_played;
  else
    select claim_date, day_number into v_last from daily_bonus_claims
      where visitor_id = p_visitor and user_id is null order by claim_date desc limit 1;
    select exists (select 1 from analytics_events
                   where visitor_id = p_visitor and type in ('game', 'campaign', 'versus', 'versus_join', 'globequiz'))
      into v_played;
  end if;
  if v_last.claim_date = v_today then
    v_claimable := false;  v_day := v_last.day_number;
  elsif v_last.claim_date = v_today - 1 then
    v_claimable := true;   v_day := v_last.day_number + 1;
  else
    v_claimable := true;   v_day := 1;
  end if;
  return jsonb_build_object('claimable', v_claimable, 'day', v_day, 'coins', public.daily_bonus_coins(v_day), 'played', v_played);
end;
$$;
revoke all on function public.daily_bonus_state(uuid, text) from public, anon, authenticated;

create or replace function public.cleanup_unplayed_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(p.id), '{}') into v_ids
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.crazygames_user_id is not null
    and p.created_at < now() - interval '24 hours'
    and coalesce(p.last_active, p.created_at) < now() - interval '24 hours'
    and coalesce(p.play_count, 0) = 0
    and coalesce(p.campaigns_completed, 0) = 0
    and coalesce(p.gq_streak_count, 0) = 0
    and coalesce(p.vs_wins, 0) = 0 and coalesce(p.vs_losses, 0) = 0
    and coalesce(p.hs_total, 0) = 0
    and coalesce(p.hs_flags, 0) + coalesce(p.hs_shapes, 0) + coalesce(p.hs_cities, 0) + coalesce(p.hs_monuments, 0) = 0
    and not coalesce(p.founder_popup_seen, false)
    and not (coalesce(u.raw_user_meta_data, '{}'::jsonb) ? 'web_password_set')
    and not exists (select 1 from public.dev_admins d where d.user_id = p.id)
    and not exists (select 1 from public.analytics_events e
                    where e.user_id = p.id and e.type in ('game', 'campaign', 'versus', 'versus_join', 'globequiz'))
    and not exists (select 1 from public.game_logs g where g.user_id = p.id)
    and not exists (select 1 from public.friendships f
                    where f.user_a = p.id or f.user_b = p.id or f.initiated_by = p.id)
    and not exists (select 1 from public.currency_ledger c where c.user_id = p.id)
    and not exists (select 1 from public.matches m
                    where m.host_id = p.id or m.guest_id = p.id or m.winner_id = p.id);

  if array_length(v_ids, 1) is null then return 0; end if;

  update public.analytics_events set user_id = null where user_id = any(v_ids);
  delete from auth.users where id = any(v_ids);
  return array_length(v_ids, 1);
end;
$function$;
revoke all on function public.cleanup_unplayed_accounts() from public, anon, authenticated;
