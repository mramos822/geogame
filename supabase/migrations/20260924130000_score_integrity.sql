-- Score integrity (2026-09-24)
--
-- Every stat column on profiles (highscores, averages, play counts, versus
-- W/L, GloboReto streak, campaigns completed, cosmetics) could be set to any
-- value with a plain UPDATE from the browser console. Now:
--  * hs_* / avg_sum_* / play_count* only change through add_game_score and
--    merge_local_stats (SECURITY DEFINER, with caps and rate limits).
--  * vs_wins / vs_losses go through record_versus_result (rate limited).
--  * Direct UPDATEs that older builds still send (CrazyGames build) are
--    validated by protect_stat_columns: only a legal +1 / next-day step is
--    kept, anything else is silently reverted to the old value.
-- Caps: best real single-mode score is ~26k and best campaign ~76k, so 45k
-- per mode leaves plenty of headroom; the fastest real gap between two
-- campaigns of one player is 153 s.

-- Private per-user rate-limit state (no policies: server only).
create table if not exists public.stat_guard (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  vs_last_at       timestamptz,
  vs_day           date,
  vs_day_count     integer not null default 0,
  campaign_last_at timestamptz,
  merge_last_at    timestamptz
);
alter table public.stat_guard enable row level security;
revoke all on public.stat_guard from anon, authenticated;

-- Returns true (and records it) if a versus result of the caller may be
-- counted now: at least 15 s apart and at most 100 per New York day. Callable
-- by players, but it only ever spends their own quota.
create or replace function public._stat_guard_vs()
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  p_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/New_York')::date;
  g public.stat_guard;
begin
  if p_uid is null then return false; end if;
  insert into public.stat_guard (user_id) values (p_uid) on conflict do nothing;
  select * into g from public.stat_guard where user_id = p_uid for update;
  if g.vs_last_at is not null and g.vs_last_at > now() - interval '15 seconds' then return false; end if;
  if g.vs_day = v_today and g.vs_day_count >= 100 then return false; end if;
  update public.stat_guard
     set vs_last_at = now(),
         vs_day_count = case when vs_day = v_today then vs_day_count + 1 else 1 end,
         vs_day = v_today
   where user_id = p_uid;
  return true;
end;
$function$;

create or replace function public._stat_guard_campaign()
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  p_uid uuid := auth.uid();
  g public.stat_guard;
begin
  if p_uid is null then return false; end if;
  insert into public.stat_guard (user_id) values (p_uid) on conflict do nothing;
  select * into g from public.stat_guard where user_id = p_uid for update;
  if g.campaign_last_at is not null and g.campaign_last_at > now() - interval '120 seconds' then return false; end if;
  update public.stat_guard set campaign_last_at = now() where user_id = p_uid;
  return true;
end;
$function$;
revoke all on function public._stat_guard_vs()       from public, anon;
revoke all on function public._stat_guard_campaign() from public, anon;
grant execute on function public._stat_guard_vs()       to authenticated;
grant execute on function public._stat_guard_campaign() to authenticated;

-- ── Direct-UPDATE validation ───────────────────────────────────────────────
create or replace function public.protect_stat_columns()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_ok boolean;
begin
  -- Only requests straight from the public API: SECURITY DEFINER RPCs run as
  -- the function owner, so their writes pass untouched.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  -- Highscores / averages / play counts: RPC only.
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

  -- Versus W/L (older builds): a single +1 on one of them, rate limited.
  if new.vs_wins is distinct from old.vs_wins or new.vs_losses is distinct from old.vs_losses then
    v_ok := (new.vs_wins = coalesce(old.vs_wins, 0) + 1 and new.vs_losses is not distinct from old.vs_losses)
         or (new.vs_losses = coalesce(old.vs_losses, 0) + 1 and new.vs_wins is not distinct from old.vs_wins);
    if not v_ok or not public._stat_guard_vs() then
      new.vs_wins := old.vs_wins; new.vs_losses := old.vs_losses;
    end if;
  end if;

  -- Completed Gira Mundial: +1 at most every 2 minutes.
  if new.campaigns_completed is distinct from old.campaigns_completed then
    if new.campaigns_completed <> coalesce(old.campaigns_completed, 0) + 1
       or not public._stat_guard_campaign() then
      new.campaigns_completed := old.campaigns_completed;
    end if;
  end if;

  -- GloboReto streak: only moving to "today" (NY date, ±1 day of clock skew),
  -- forward, and either +1 from yesterday or a restart at 1.
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
    -- The day's time is only written together with the day's streak step.
    new.gq_today_time_ms := old.gq_today_time_ms;
  end if;
  if new.gq_today_time_ms is not null and new.gq_today_time_ms < 1000 then
    new.gq_today_time_ms := old.gq_today_time_ms;
  end if;

  -- Cosmetics: anything but the default is Founder-only ('0003' frame is
  -- Top 1, guarded by protect_top1).
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
revoke all on function public.protect_stat_columns() from public, anon, authenticated;

drop trigger if exists protect_stat_columns_trigger on public.profiles;
create trigger protect_stat_columns_trigger
  before update on public.profiles
  for each row execute function public.protect_stat_columns();

-- ── add_game_score: caps + rate limit ─────────────────────────────────────
create or replace function public.add_game_score(p_user_id uuid, p_session_id text, p_flags integer, p_shapes integer, p_cities integer, p_monuments integer, p_total integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  c_max_mode constant integer := 45000;
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

  insert into game_logs (user_id, session_id, played_at)
  values (p_user_id, p_session_id, now())
  on conflict (user_id, session_id) do nothing;
  if not found then return; end if;

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

-- The client never writes game_logs itself (only add_game_score does); a
-- self-inserted row could pre-empt a session id.
drop policy if exists "users can insert own logs" on public.game_logs;

-- ── Versus W/L ────────────────────────────────────────────────────────────
create or replace function public.record_versus_result(p_won boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then raise exception '__not_authenticated__'; end if;
  if not public._stat_guard_vs() then
    select vs_wins, vs_losses into r from profiles where id = v_uid;
    return jsonb_build_object('ok', false, 'vs_wins', r.vs_wins, 'vs_losses', r.vs_losses);
  end if;
  update profiles
     set vs_wins   = coalesce(vs_wins, 0)   + case when p_won then 1 else 0 end,
         vs_losses = coalesce(vs_losses, 0) + case when p_won then 0 else 1 end
   where id = v_uid
  returning vs_wins, vs_losses into r;
  return jsonb_build_object('ok', true, 'vs_wins', r.vs_wins, 'vs_losses', r.vs_losses);
end;
$function$;
revoke all on function public.record_versus_result(boolean) from public, anon;
grant execute on function public.record_versus_result(boolean) to authenticated;

-- ── Guest stats merged into the account on login ──────────────────────────
-- Replaces the direct UPDATE in syncLocalDataToAccount. localStorage can't be
-- trusted, so everything is capped and it runs at most once every 10 min.
create or replace function public.merge_local_stats(p_hs jsonb, p_sums jsonb, p_counts jsonb, p_plays integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  c_max_mode  constant integer := 45000;
  c_max_count constant integer := 200;
  v_uid uuid := auth.uid();
  g public.stat_guard;
  m text;
  v_hs integer; v_sum integer; v_cnt integer;
begin
  if v_uid is null then raise exception '__not_authenticated__'; end if;
  insert into public.stat_guard (user_id) values (v_uid) on conflict do nothing;
  select * into g from public.stat_guard where user_id = v_uid for update;
  if g.merge_last_at is not null and g.merge_last_at > now() - interval '10 minutes' then return false; end if;
  update public.stat_guard set merge_last_at = now() where user_id = v_uid;

  foreach m in array array['flags', 'shapes', 'cities', 'monuments'] loop
    v_hs  := least(greatest(coalesce((p_hs     ->> m)::integer, 0), 0), c_max_mode);
    v_cnt := least(greatest(coalesce((p_counts ->> m)::integer, 0), 0), c_max_count);
    v_sum := least(greatest(coalesce((p_sums   ->> m)::integer, 0), 0), v_cnt * c_max_mode);
    execute format(
      'update public.profiles set hs_%1$s = greatest(coalesce(hs_%1$s, 0), $1),
              avg_sum_%1$s = coalesce(avg_sum_%1$s, 0) + $2,
              play_count_%1$s = coalesce(play_count_%1$s, 0) + $3
        where id = $4', m)
    using v_hs, case when v_cnt > 0 then v_sum else 0 end, case when v_sum > 0 then v_cnt else 0 end, v_uid;
  end loop;
  update public.profiles
     set play_count = coalesce(play_count, 0) + least(greatest(coalesce(p_plays, 0), 0), c_max_count)
   where id = v_uid;
  return true;
end;
$function$;
revoke all on function public.merge_local_stats(jsonb, jsonb, jsonb, integer) from public, anon;
grant execute on function public.merge_local_stats(jsonb, jsonb, jsonb, integer) to authenticated;
