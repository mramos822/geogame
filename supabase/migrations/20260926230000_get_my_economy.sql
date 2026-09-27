-- Player-facing XP / coins / level for the loading-screen top bars.
--
-- Same numbers as the "retroactive" economy in the admin stats panel
-- (admin-stats/index.ts): computed server-side from analytics_events (Gira
-- Mundial + GloboReto) and the trusted versus rows in currency_ledger, plus the
-- level-up bonus coins. currency_ledger is insert-only for clients and its
-- amounts aren't validated, so it is NOT used as the balance for anything but
-- the server-granted versus rows.
--
-- economy_for(uid) is internal (no client grant); get_my_economy() is the
-- authenticated entry point and only ever reads the caller's own row.

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

  -- Gira Mundial: 10 + steps coins, 50 + 3*steps xp (steps = floor(score/250))
  select coalesce(sum(10 + floor(coalesce(score, 0) / 250.0)), 0),
         coalesce(sum(50 + floor(coalesce(score, 0) / 250.0) * 3), 0)
    into v_coins, v_xp
    from analytics_events where type = 'campaign' and user_id = p_uid;

  -- GloboReto: 10 coins / 20 xp scaled by 1.15^min(floor(streak/10), 10)
  select v_coins + coalesce(sum(round((10 * power(1.15, least(floor(coalesce(streak, 0) / 10.0), 10)))::numeric)), 0),
         v_xp    + coalesce(sum(round((20 * power(1.15, least(floor(coalesce(streak, 0) / 10.0), 10)))::numeric)), 0)
    into v_coins, v_xp
    from analytics_events where type = 'globequiz' and user_id = p_uid;

  -- Versus: granted server-side, so the ledger rows are trustworthy.
  select v_coins + coalesce(sum(coins), 0), v_xp + coalesce(sum(xp), 0)
    into v_coins, v_xp
    from currency_ledger where user_id = p_uid and reason in ('versus_win', 'versus_loss');

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

create or replace function public.get_my_economy()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.economy_for(auth.uid());
$$;

revoke all on function public.get_my_economy() from public, anon;
grant execute on function public.get_my_economy() to authenticated;
