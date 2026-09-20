-- GloboReto streak recovery.
-- A streak counts as lost once gq_streak_last_date < yesterday (America/New_York).
-- The first missed day is D = last_date + 1. The player can recover it until
-- 48h after the END of D, i.e. today (NY) <= last_date + 3. Up to 3 recoveries
-- per calendar month (NY); the counter resets each new month. After the window
-- closes the streak is gone for good (a final notice is shown once).
alter table public.profiles
  add column if not exists gq_restores_month text,
  add column if not exists gq_restores_used integer not null default 0,
  add column if not exists gq_lost_notice_for date;

-- state: none | restorable | no_quota | expired
create or replace function public.get_gq_streak_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/New_York')::date;
  v_month text := to_char(now() at time zone 'America/New_York', 'YYYY-MM');
  r record;
  v_used integer;
begin
  if v_uid is null then
    return jsonb_build_object('state', 'none');
  end if;
  select gq_streak_count, gq_streak_last_date, gq_restores_month, gq_restores_used, gq_lost_notice_for
    into r from public.profiles where id = v_uid;
  if r.gq_streak_last_date is null or coalesce(r.gq_streak_count, 0) < 2
     or r.gq_streak_last_date >= v_today - 1 then
    return jsonb_build_object('state', 'none');
  end if;
  v_used := case when r.gq_restores_month = v_month then r.gq_restores_used else 0 end;
  if v_today <= r.gq_streak_last_date + 3 then
    return jsonb_build_object(
      'state', case when v_used < 3 then 'restorable' else 'no_quota' end,
      'streak', r.gq_streak_count,
      'restores_left', greatest(3 - v_used, 0),
      'deadline', ((r.gq_streak_last_date + 4)::timestamp at time zone 'America/New_York')
    );
  end if;
  if r.gq_lost_notice_for is distinct from r.gq_streak_last_date then
    return jsonb_build_object('state', 'expired', 'streak', r.gq_streak_count);
  end if;
  return jsonb_build_object('state', 'none');
end;
$$;

create or replace function public.restore_gq_streak()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/New_York')::date;
  v_month text := to_char(now() at time zone 'America/New_York', 'YYYY-MM');
  r record;
  v_used integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false);
  end if;
  select gq_streak_count, gq_streak_last_date, gq_restores_month, gq_restores_used
    into r from public.profiles where id = v_uid for update;
  if r.gq_streak_last_date is null or coalesce(r.gq_streak_count, 0) < 2
     or r.gq_streak_last_date >= v_today - 1
     or v_today > r.gq_streak_last_date + 3 then
    return jsonb_build_object('ok', false);
  end if;
  v_used := case when r.gq_restores_month = v_month then r.gq_restores_used else 0 end;
  if v_used >= 3 then
    return jsonb_build_object('ok', false);
  end if;
  update public.profiles
     set gq_streak_last_date = v_today - 1,
         gq_restores_month = v_month,
         gq_restores_used = v_used + 1
   where id = v_uid;
  return jsonb_build_object('ok', true, 'streak', r.gq_streak_count,
                            'last_date', v_today - 1, 'restores_left', 3 - (v_used + 1));
end;
$$;

create or replace function public.ack_gq_streak_lost()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set gq_lost_notice_for = gq_streak_last_date where id = auth.uid();
$$;

grant execute on function public.get_gq_streak_status() to authenticated;
grant execute on function public.restore_gq_streak() to authenticated;
grant execute on function public.ack_gq_streak_lost() to authenticated;
