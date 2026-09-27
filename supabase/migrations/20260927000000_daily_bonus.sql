-- Daily login bonus (coins). One claim per account per UTC day; the streak of consecutive days
-- decides the amount: 10, 15, 20, 30, 40, 50, then 75 from day 7 on (day 7+ always pays the same).
-- Missing a day resets the streak to day 1.
--
-- Clients can neither read nor write daily_bonus_claims (RLS on, no policies): everything goes
-- through the SECURITY DEFINER functions below, so amounts can't be forged from the console.
-- economy_for() (the coin/XP total shown in the HUD) is extended to include these coins.

create table if not exists public.daily_bonus_claims (
  user_id     uuid    not null,
  claim_date  date    not null,
  day_number  integer not null,   -- consecutive-day streak this claim belonged to (1, 2, 3 …)
  coins       integer not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, claim_date)
);
alter table public.daily_bonus_claims enable row level security;

create or replace function public.daily_bonus_coins(p_day integer)
returns integer
language sql
immutable
as $$
  select case least(greatest(p_day, 1), 7)
    when 1 then 10 when 2 then 15 when 3 then 20 when 4 then 30
    when 5 then 40 when 6 then 50 else 75 end;
$$;

-- State for the popup: can the player claim today, and which streak day would it be.
create or replace function public.daily_bonus_state_for(p_uid uuid)
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
begin
  if p_uid is null then
    return jsonb_build_object('claimable', false, 'day', 1, 'coins', 0);
  end if;
  select claim_date, day_number into v_last
    from daily_bonus_claims where user_id = p_uid order by claim_date desc limit 1;
  if v_last.claim_date = v_today then
    v_claimable := false;  v_day := v_last.day_number;                -- already claimed today
  elsif v_last.claim_date = v_today - 1 then
    v_claimable := true;   v_day := v_last.day_number + 1;            -- streak continues
  else
    v_claimable := true;   v_day := 1;                                -- first time, or a day was missed
  end if;
  return jsonb_build_object(
    'claimable', v_claimable,
    'day', v_day,
    'coins', public.daily_bonus_coins(v_day)
  );
end;
$$;

create or replace function public.claim_daily_bonus_for(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb := public.daily_bonus_state_for(p_uid);
  v_day   integer := (v_state->>'day')::int;
  v_coins integer := (v_state->>'coins')::int;
begin
  if p_uid is null or not (v_state->>'claimable')::boolean then
    return v_state || jsonb_build_object('claimed', false);
  end if;
  insert into daily_bonus_claims (user_id, claim_date, day_number, coins)
    values (p_uid, (now() at time zone 'utc')::date, v_day, v_coins)
    on conflict (user_id, claim_date) do nothing;
  if not found then
    return public.daily_bonus_state_for(p_uid) || jsonb_build_object('claimed', false);
  end if;
  return jsonb_build_object('claimed', true, 'claimable', false, 'day', v_day, 'coins', v_coins);
end;
$$;

revoke all on function public.daily_bonus_state_for(uuid) from public, anon, authenticated;
revoke all on function public.claim_daily_bonus_for(uuid) from public, anon, authenticated;

create or replace function public.get_daily_bonus()
returns jsonb language sql security definer set search_path = public as $$
  select public.daily_bonus_state_for(auth.uid());
$$;
create or replace function public.claim_daily_bonus()
returns jsonb language sql security definer set search_path = public as $$
  select public.claim_daily_bonus_for(auth.uid());
$$;
revoke all on function public.get_daily_bonus() from public, anon;
revoke all on function public.claim_daily_bonus() from public, anon;
grant execute on function public.get_daily_bonus() to authenticated;
grant execute on function public.claim_daily_bonus() to authenticated;

-- economy_for: coins now also include the daily bonus claims.
create or replace function public.economy_for(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coins numeric := 0;
  v_xp    numeric := 0;
  v_level int;
  v_bonus numeric := 0;
begin
  if p_uid is null then
    return jsonb_build_object('xp', 0, 'coins', 0, 'level', 1);
  end if;

  select coalesce(sum(10 + floor(coalesce(score, 0) / 250.0)), 0),
         coalesce(sum(50 + floor(coalesce(score, 0) / 250.0) * 3), 0)
    into v_coins, v_xp
    from analytics_events where type = 'campaign' and user_id = p_uid;

  select v_coins + coalesce(sum(round((10 * power(1.15, least(floor(coalesce(streak, 0) / 10.0), 10)))::numeric)), 0),
         v_xp    + coalesce(sum(round((20 * power(1.15, least(floor(coalesce(streak, 0) / 10.0), 10)))::numeric)), 0)
    into v_coins, v_xp
    from analytics_events where type = 'globequiz' and user_id = p_uid;

  select v_coins + coalesce(sum(coins), 0), v_xp + coalesce(sum(xp), 0)
    into v_coins, v_xp
    from currency_ledger where user_id = p_uid and reason in ('versus_win', 'versus_loss');

  select v_coins + coalesce(sum(coins), 0) into v_coins
    from daily_bonus_claims where user_id = p_uid;

  v_level := least(floor((25 + sqrt(625 + 100 * v_xp)) / 50), 100)::int;

  select coalesce(sum(
           case when l = 100 then 10000
                when l % 10 = 0 then round(((20 + power(l - 1, 1.6) * 2) * 1.25)::numeric)
                else round((20 + power(l - 1, 1.6) * 2)::numeric) end), 0)
    into v_bonus
    from generate_series(2, v_level) l;

  return jsonb_build_object('xp', v_xp, 'coins', v_coins + v_bonus, 'level', v_level);
end;
$$;
revoke all on function public.economy_for(uuid) from public, anon, authenticated;
