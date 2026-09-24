-- Server-timed campaigns (2026-09-24)
--
-- The server now knows when a game started without any extra request: the
-- client already sets profiles.is_playing = true when every mode starts
-- (sbSetPlaying), and protect_stat_columns records the first of those in
-- stat_guard.play_started_at. add_game_score then requires the real elapsed
-- time to fit the score: at least 60 s and at most 300 points per second
-- (the fastest real campaigns reach ~230 pts/s even measured WITHOUT their
-- first mode). The mark is consumed by each saved score and goes stale after
-- 3 h, so a leftover mark from an old session can't be reused.

alter table public.stat_guard add column if not exists play_started_at timestamptz;

create or replace function public._stat_guard_play_start()
returns void
language sql
security definer
set search_path = public
as $function$
  insert into public.stat_guard (user_id, play_started_at) values (auth.uid(), now())
  on conflict (user_id) do update
    set play_started_at = now()
    where stat_guard.play_started_at is null
       or stat_guard.play_started_at < now() - interval '3 hours';
$function$;
revoke all on function public._stat_guard_play_start() from public, anon;
grant execute on function public._stat_guard_play_start() to authenticated;

-- Same function as in 20260924130000_score_integrity.sql plus the start mark.
create or replace function public.protect_stat_columns()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_ok boolean;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if new.is_playing and auth.uid() is not null then
    perform public._stat_guard_play_start();
  end if;

  new.hs_flags := old.hs_flags;   new.hs_shapes := old.hs_shapes;
  new.hs_cities := old.hs_cities; new.hs_monuments := old.hs_monuments;
  new.hs_total := old.hs_total;
  new.avg_sum_flags := old.avg_sum_flags;   new.avg_sum_shapes := old.avg_sum_shapes;
  new.avg_sum_cities := old.avg_sum_cities; new.avg_sum_monuments := old.avg_sum_monuments;
  new.play_count := old.play_count;
  new.play_count_flags := old.play_count_flags;   new.play_count_shapes := old.play_count_shapes;
  new.play_count_cities := old.play_count_cities; new.play_count_monuments := old.play_count_monuments;
  new.gq_restores_month := old.gq_restores_month;
  new.gq_restores_used  := old.gq_restores_used;
  new.gq_lost_notice_for := old.gq_lost_notice_for;

  if new.vs_wins is distinct from old.vs_wins or new.vs_losses is distinct from old.vs_losses then
    v_ok := (new.vs_wins = coalesce(old.vs_wins, 0) + 1 and new.vs_losses is not distinct from old.vs_losses)
         or (new.vs_losses = coalesce(old.vs_losses, 0) + 1 and new.vs_wins is not distinct from old.vs_wins);
    if not v_ok or not public._stat_guard_vs() then
      new.vs_wins := old.vs_wins; new.vs_losses := old.vs_losses;
    end if;
  end if;

  if new.campaigns_completed is distinct from old.campaigns_completed then
    if new.campaigns_completed <> coalesce(old.campaigns_completed, 0) + 1
       or not public._stat_guard_campaign() then
      new.campaigns_completed := old.campaigns_completed;
    end if;
  end if;

  if new.gq_streak_count is distinct from old.gq_streak_count
     or new.gq_streak_last_date is distinct from old.gq_streak_last_date then
    v_ok := new.gq_streak_last_date is not null
        and new.gq_streak_last_date between v_today - 1 and v_today + 1
        and (old.gq_streak_last_date is null or new.gq_streak_last_date > old.gq_streak_last_date)
        and (new.gq_streak_count = 1
             or (old.gq_streak_last_date = new.gq_streak_last_date - 1
                 and new.gq_streak_count = coalesce(old.gq_streak_count, 0) + 1));
    if not v_ok then
      new.gq_streak_count := old.gq_streak_count;
      new.gq_streak_last_date := old.gq_streak_last_date;
      new.gq_today_time_ms := old.gq_today_time_ms;
    end if;
  elsif new.gq_today_time_ms is distinct from old.gq_today_time_ms then
    new.gq_today_time_ms := old.gq_today_time_ms;
  end if;
  if new.gq_today_time_ms is not null and new.gq_today_time_ms < 1000 then
    new.gq_today_time_ms := old.gq_today_time_ms;
  end if;

  if not (coalesce(new.is_founder, false) and coalesce(new.founder_popup_seen, false)) then
    if new.frame_code is distinct from old.frame_code and coalesce(new.frame_code, '0001') not in ('0001', '0003') then
      new.frame_code := old.frame_code;
    end if;
    if new.card_code is distinct from old.card_code and coalesce(new.card_code, '0001') <> '0001' then
      new.card_code := old.card_code;
    end if;
    if new.panel_code is distinct from old.panel_code and coalesce(new.panel_code, '0001') <> '0001' then
      new.panel_code := old.panel_code;
    end if;
    if new.cell_code is distinct from old.cell_code and coalesce(new.cell_code, '0001') <> '0001' then
      new.cell_code := old.cell_code;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.add_game_score(p_user_id uuid, p_session_id text, p_flags integer, p_shapes integer, p_cities integer, p_monuments integer, p_total integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  c_max_mode    constant integer := 45000;
  c_max_pts_sec constant integer := 300;
  c_min_secs    constant integer := 60;
  v_started timestamptz;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception '__not_allowed__';
  end if;
  p_flags := coalesce(p_flags, 0); p_shapes := coalesce(p_shapes, 0);
  p_cities := coalesce(p_cities, 0); p_monuments := coalesce(p_monuments, 0);
  p_total := coalesce(p_total, 0);
  if least(p_flags, p_shapes, p_cities, p_monuments, p_total) < 0
     or greatest(p_flags, p_shapes, p_cities, p_monuments) > c_max_mode
     or p_total > p_flags + p_shapes + p_cities + p_monuments then
    raise exception '__invalid_score__';
  end if;
  if p_session_id is null or length(p_session_id) > 100 then
    raise exception '__invalid_session__';
  end if;
  if exists (select 1 from game_logs where user_id = p_user_id and played_at > now() - interval '120 seconds') then
    raise exception '__too_fast__';
  end if;

  -- Real play time, measured by the server (see header).
  select play_started_at into v_started from stat_guard where user_id = p_user_id for update;
  if v_started is null or v_started < now() - interval '3 hours'
     or extract(epoch from now() - v_started) < greatest(c_min_secs, p_total::numeric / c_max_pts_sec) then
    raise exception '__too_fast__';
  end if;

  insert into game_logs (user_id, session_id, played_at)
  values (p_user_id, p_session_id, now())
  on conflict (user_id, session_id) do nothing;
  if not found then return; end if;
  update stat_guard set play_started_at = null where user_id = p_user_id;

  update profiles set
    avg_sum_flags        = avg_sum_flags        + p_flags,
    avg_sum_shapes       = avg_sum_shapes       + p_shapes,
    avg_sum_cities       = avg_sum_cities       + p_cities,
    avg_sum_monuments    = avg_sum_monuments    + p_monuments,
    play_count_flags     = play_count_flags     + 1,
    play_count_shapes    = play_count_shapes    + 1,
    play_count_cities    = play_count_cities    + 1,
    play_count_monuments = play_count_monuments + 1,
    play_count           = play_count           + 1,
    hs_flags      = greatest(hs_flags,     p_flags),
    hs_shapes     = greatest(hs_shapes,    p_shapes),
    hs_cities     = greatest(hs_cities,    p_cities),
    hs_monuments  = greatest(hs_monuments, p_monuments),
    hs_total      = greatest(hs_total,     p_total)
  where id = p_user_id;
end;
$function$;
