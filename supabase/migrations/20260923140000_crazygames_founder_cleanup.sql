-- CrazyGames accounts (created automatically by the crazygames-auth Edge
-- Function on first load, profiles.crazygames_user_id set):
--   1) are NOT founders at creation — they only become eligible once the
--      account logs into the official web (grant_founder_on_web, called from
--      js/sb.js on the main site only)
--   2) are deleted automatically if they never play a game (daily cron),
--      so players who open the game and leave don't pile up empty accounts.

-- 1a) handle_new_user: same as before, but never marks a CrazyGames account
-- (user_metadata.crazygames_user_id, set by crazygames-auth) as founder.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$
declare
  v_is_founder boolean;
begin
  select count(*) < 100 into v_is_founder from public.profiles where founder_popup_seen = true;
  if new.raw_user_meta_data ? 'crazygames_user_id' then
    v_is_founder := false;
  end if;
  insert into public.profiles (id, username, email, country_code, is_founder)
  values (new.id, new.raw_user_meta_data->>'username', new.email, new.raw_user_meta_data->>'country_code', v_is_founder)
  on conflict (id) do nothing;
  insert into public.email_history (user_id, email, recorded_at)
  values (new.id, new.email, now());
  return new;
end;
$function$;

-- 1b) Called by the official web (js/sb.js) when a CrazyGames account logs in
-- there: grants founder under the same rule as a new web account (fewer than
-- 100 packs claimed). Idempotent; never re-grants after the popup was seen.
-- Same lock as claim_founder_pack so the cap can't be raced.
create or replace function public.grant_founder_on_web()
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_claimed int;
begin
  if v_uid is null then return false; end if;
  perform pg_advisory_xact_lock(hashtext('founder_claim'));
  select count(*) into v_claimed from public.profiles where founder_popup_seen = true;
  if v_claimed >= 100 then return false; end if;
  perform set_config('app.allow_founder_change', 'on', true);
  update public.profiles
    set is_founder = true
    where id = v_uid
      and crazygames_user_id is not null
      and is_founder = false
      and founder_popup_seen = false;
  return found;
end;
$function$;

revoke all on function public.grant_founder_on_web() from public, anon;
grant execute on function public.grant_founder_on_web() to authenticated;

-- 2) Daily cleanup of CrazyGames accounts that never played.
-- "Played" = any finished-game trace: play_count, a completed campaign, a
-- GloboReto streak, or a game/campaign/versus/globequiz analytics event.
-- 24h grace so nobody is deleted in the middle of their first session.
-- Accounts that chose a password (claimed for the web) or that have social
-- ties (friendships, coins) are kept. Their leftover visit events are
-- detached (user_id -> null) so visit counts survive.
create or replace function public.cleanup_unplayed_crazygames_accounts()
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
    and coalesce(p.play_count, 0) = 0
    and coalesce(p.campaigns_completed, 0) = 0
    and coalesce(p.gq_streak_count, 0) = 0
    -- Set by the CrazyGames build when the player chooses a password
    -- (crazygames-link.js). encrypted_password can't be used: Auth fills it
    -- with a random hash for every admin-created user.
    and not (coalesce(u.raw_user_meta_data, '{}'::jsonb) ? 'web_password_set')
    and not exists (select 1 from public.analytics_events e
                    where e.user_id = p.id and e.type in ('game', 'campaign', 'versus', 'globequiz'))
    and not exists (select 1 from public.friendships f
                    where f.user_a = p.id or f.user_b = p.id or f.initiated_by = p.id)
    and not exists (select 1 from public.currency_ledger c where c.user_id = p.id)
    and not exists (select 1 from public.matches m where m.winner_id = p.id);

  if array_length(v_ids, 1) is null then return 0; end if;

  update public.analytics_events set user_id = null where user_id = any(v_ids);
  delete from auth.users where id = any(v_ids); -- cascades to profiles & co.
  return array_length(v_ids, 1);
end;
$function$;

revoke all on function public.cleanup_unplayed_crazygames_accounts() from public, anon, authenticated;

select cron.schedule('cleanup-unplayed-crazygames-accounts', '30 4 * * *',
  'select public.cleanup_unplayed_crazygames_accounts();');
