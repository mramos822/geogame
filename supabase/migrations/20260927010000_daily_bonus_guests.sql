-- Daily bonus for GUESTS (no account) too. A guest is identified by the same anonymous visitor id the
-- analytics use (localStorage _devstats_vid). Same rules as accounts: one claim per UTC day, streak of
-- consecutive days 10, 15, 20, 30, 40, 50 then 75 from day 7 on, a missed day restarts at day 1.
-- When the guest later logs in / registers, claim_anonymous_events() moves their claims to the account.

-- claims may now belong to a visitor instead of a user
alter table public.daily_bonus_claims drop constraint if exists daily_bonus_claims_pkey;
alter table public.daily_bonus_claims add column if not exists id bigint generated always as identity;
alter table public.daily_bonus_claims add primary key (id);
alter table public.daily_bonus_claims alter column user_id drop not null;
alter table public.daily_bonus_claims add column if not exists visitor_id text;
alter table public.daily_bonus_claims drop constraint if exists daily_bonus_owner_chk;
alter table public.daily_bonus_claims add constraint daily_bonus_owner_chk check (user_id is not null or visitor_id is not null);
create unique index if not exists daily_bonus_user_day_uq on public.daily_bonus_claims (user_id, claim_date) where user_id is not null;
create unique index if not exists daily_bonus_visitor_day_uq on public.daily_bonus_claims (visitor_id, claim_date) where user_id is null and visitor_id is not null;

drop function if exists public.claim_daily_bonus_for(uuid);
drop function if exists public.daily_bonus_state_for(uuid);

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
begin
  if p_uid is null and (p_visitor is null or char_length(p_visitor) < 8 or char_length(p_visitor) > 80) then
    return jsonb_build_object('claimable', false, 'day', 1, 'coins', 0);
  end if;
  if p_uid is not null then
    select claim_date, day_number into v_last from daily_bonus_claims
      where user_id = p_uid order by claim_date desc limit 1;
  else
    select claim_date, day_number into v_last from daily_bonus_claims
      where visitor_id = p_visitor and user_id is null order by claim_date desc limit 1;
  end if;
  if v_last.claim_date = v_today then
    v_claimable := false;  v_day := v_last.day_number;
  elsif v_last.claim_date = v_today - 1 then
    v_claimable := true;   v_day := v_last.day_number + 1;
  else
    v_claimable := true;   v_day := 1;
  end if;
  return jsonb_build_object('claimable', v_claimable, 'day', v_day, 'coins', public.daily_bonus_coins(v_day));
end;
$$;

create or replace function public.claim_daily_bonus_impl(p_uid uuid, p_visitor text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb := public.daily_bonus_state(p_uid, p_visitor);
  v_day   integer := (v_state->>'day')::int;
  v_coins integer := (v_state->>'coins')::int;
  v_n     integer;
begin
  if not (v_state->>'claimable')::boolean then
    return v_state || jsonb_build_object('claimed', false);
  end if;
  if p_uid is not null then
    insert into daily_bonus_claims (user_id, claim_date, day_number, coins)
      values (p_uid, (now() at time zone 'utc')::date, v_day, v_coins)
      on conflict (user_id, claim_date) where user_id is not null do nothing;
  else
    insert into daily_bonus_claims (visitor_id, claim_date, day_number, coins)
      values (p_visitor, (now() at time zone 'utc')::date, v_day, v_coins)
      on conflict (visitor_id, claim_date) where user_id is null and visitor_id is not null do nothing;
  end if;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return public.daily_bonus_state(p_uid, p_visitor) || jsonb_build_object('claimed', false);
  end if;
  return jsonb_build_object('claimed', true, 'claimable', false, 'day', v_day, 'coins', v_coins);
end;
$$;

revoke all on function public.daily_bonus_state(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_daily_bonus_impl(uuid, text) from public, anon, authenticated;

-- accounts
create or replace function public.get_daily_bonus()
returns jsonb language sql security definer set search_path = public as $$
  select public.daily_bonus_state(auth.uid(), null);
$$;
create or replace function public.claim_daily_bonus()
returns jsonb language sql security definer set search_path = public as $$
  select public.claim_daily_bonus_impl(auth.uid(), null);
$$;

-- guests (anon key)
create or replace function public.get_daily_bonus_guest(p_visitor text)
returns jsonb language sql security definer set search_path = public as $$
  select public.daily_bonus_state(null, p_visitor);
$$;
create or replace function public.claim_daily_bonus_guest(p_visitor text)
returns jsonb language sql security definer set search_path = public as $$
  select public.claim_daily_bonus_impl(null, p_visitor);
$$;
-- what a guest's HUD shows: only the coins from their own daily-bonus claims
create or replace function public.get_guest_economy(p_visitor text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('xp', 0, 'level', 1,
    'coins', case when p_visitor is null or char_length(p_visitor) < 8 then 0
             else coalesce((select sum(coins) from daily_bonus_claims where visitor_id = p_visitor and user_id is null), 0) end);
$$;

revoke all on function public.get_daily_bonus_guest(text) from public;
revoke all on function public.claim_daily_bonus_guest(text) from public;
revoke all on function public.get_guest_economy(text) from public;
grant execute on function public.get_daily_bonus_guest(text) to anon, authenticated;
grant execute on function public.claim_daily_bonus_guest(text) to anon, authenticated;
grant execute on function public.get_guest_economy(text) to anon, authenticated;

-- logging in / registering: the guest's claims become the account's
create or replace function public.claim_anonymous_events(p_visitor_id text, p_window_hours integer default 87600)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_count2 integer;
  v_count3 integer;
begin
  if v_uid is null or p_visitor_id is null or p_visitor_id = '' then
    return 0;
  end if;

  update analytics_events
  set user_id = v_uid
  where visitor_id = p_visitor_id
    and user_id is null
    and created_at > now() - (p_window_hours || ' hours')::interval;
  get diagnostics v_count = row_count;

  update currency_ledger
  set user_id = v_uid
  where visitor_id = p_visitor_id
    and user_id is null
    and created_at > now() - (p_window_hours || ' hours')::interval;
  get diagnostics v_count2 = row_count;

  -- daily-bonus claims made as a guest (skip days the account already claimed)
  update daily_bonus_claims d
  set user_id = v_uid
  where d.visitor_id = p_visitor_id
    and d.user_id is null
    and not exists (select 1 from daily_bonus_claims x where x.user_id = v_uid and x.claim_date = d.claim_date);
  get diagnostics v_count3 = row_count;

  return v_count + v_count2 + v_count3;
end;
$$;
