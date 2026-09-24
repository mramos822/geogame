-- Daily cleanup of ghost CrazyGames accounts (2026-09-24)
--
-- Replaces cleanup_unplayed_crazygames_accounts with stricter checks.
-- ONLY accounts auto-created by the CrazyGames build (crazygames_user_id set)
-- are ever deleted: accounts created on the web always stay, played or not.
-- A CrazyGames account is deleted once it's been inactive for 24 h without
-- any game/score/streak/versus/coins/friendship/match.
-- Kept (never deleted): a claimed Founder pack, dev admins, and CrazyGames
-- players who set a web password (they chose to keep the account).

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
                    where e.user_id = p.id and e.type in ('game', 'campaign', 'versus', 'globequiz'))
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

select cron.unschedule('cleanup-unplayed-crazygames-accounts');
select cron.schedule('cleanup-unplayed-accounts', '30 4 * * *', 'select public.cleanup_unplayed_accounts();');
drop function if exists public.cleanup_unplayed_crazygames_accounts();
