-- Coins/XP for every versus round (1v1 or group), capped at 10 grants per day
-- (America/New_York day boundary, same as the GlobeQuiz streak). Winner:
-- 20 coins / 10 XP. Loser: 5 coins / 2 XP.
create or replace function public.grant_versus_currency(p_won boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today_count integer;
begin
  if v_uid is null then
    return false;
  end if;
  select count(*) into v_today_count
  from public.currency_ledger
  where user_id = v_uid
    and reason in ('versus_win', 'versus_loss')
    and (created_at at time zone 'America/New_York')::date
        = (now() at time zone 'America/New_York')::date;
  if v_today_count >= 10 then
    return false;
  end if;
  insert into public.currency_ledger (user_id, coins, xp, reason, ref_value)
  values (
    v_uid,
    case when p_won then 20 else 5 end,
    case when p_won then 10 else 2 end,
    case when p_won then 'versus_win' else 'versus_loss' end,
    v_today_count + 1
  );
  return true;
end;
$$;

grant execute on function public.grant_versus_currency(boolean) to authenticated;
