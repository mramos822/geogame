-- The daily-bonus popup waits for a brand-new player's first game. "Played" used to be decided on the
-- client from the local Gira Mundial counter, which never counts GloboReto / versus / a single mode
-- (a player who only did GloboReto never got the popup). It is now answered by the server: the state
-- returned by daily_bonus_state() includes `played` = the account/visitor has any finished game event.

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
                   where user_id = p_uid and type in ('game', 'campaign', 'versus', 'globequiz'))
      into v_played;
  else
    select claim_date, day_number into v_last from daily_bonus_claims
      where visitor_id = p_visitor and user_id is null order by claim_date desc limit 1;
    select exists (select 1 from analytics_events
                   where visitor_id = p_visitor and type in ('game', 'campaign', 'versus', 'globequiz'))
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
