-- Security hardening, part 2 (2026-09-24)
--
-- 1) profiles.crazygames_user_id held the raw CrazyGames id and profiles are
--    publicly readable: while crazygames-auth still accepts tokenless
--    requests (old builds), that id alone was enough to log in as the player.
--    It now holds sha256(id)[0:40] (same idHash crazygames-auth computes), and
--    players can no longer write it (or other server-owned columns) directly.
-- 2) currency_ledger / analytics_events accepted rows for ANY user_id: anyone
--    could credit coins/XP to (or fake games for) any account.
-- 3) friendships: the ALL policy had no WITH CHECK, so a user could insert an
--    already-'accepted' friendship with anyone (unlocking DMs, spectating,
--    lobbies) or accept their own request.
-- 4) lobbies / lobby_members were fully open (even signed out): anyone could
--    delete, take over or edit any room and anyone's score.
-- 5) site_visits exposed every visitor_id (usable with
--    claim_anonymous_events to take a guest's coins); the table is only
--    written by the gitignored devstats.js.
-- 6) matches UPDATE had no WITH CHECK; mutable search_path on a few functions.

-- ── 1) CrazyGames id hashed + server-owned profile columns ─────────────────
update public.profiles
   set crazygames_user_id = left(encode(sha256(convert_to(crazygames_user_id, 'UTF8')), 'hex'), 40)
 where crazygames_user_id is not null
   and crazygames_user_id !~ '^[0-9a-f]{40}$';

create or replace function public.protect_server_columns()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  -- Only requests coming straight from the public API; SECURITY DEFINER
  -- RPCs and the service role (Edge Functions) run as another role.
  if current_user in ('anon', 'authenticated') then
    new.crazygames_user_id := old.crazygames_user_id;
    new.is_supporter       := old.is_supporter;
    if coalesce(current_setting('app.allow_founder_change', true), '') <> 'on' then
      new.founder_popup_seen := old.founder_popup_seen;
      new.founder_claimed_at := old.founder_claimed_at;
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.protect_server_columns() from public, anon, authenticated;

drop trigger if exists protect_server_columns_trigger on public.profiles;
create trigger protect_server_columns_trigger
  before update on public.profiles
  for each row execute function public.protect_server_columns();

-- ── 2) Ledger / analytics rows only for yourself (or as a guest) ───────────
drop policy if exists currency_insert_anon on public.currency_ledger;
create policy currency_insert_own on public.currency_ledger
  for insert to anon, authenticated
  with check (
    (user_id is null or user_id = auth.uid())
    and reason in ('campaign_complete', 'globequiz_win')
    and coins between 0 and 1000
    and xp between 0 and 3000
  );

drop policy if exists analytics_insert_anon on public.analytics_events;
create policy analytics_insert_own on public.analytics_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- ── 3) Friendships ─────────────────────────────────────────────────────────
drop policy if exists "Users manage their own friendships" on public.friendships;

create policy friendships_insert_own on public.friendships
  for insert to authenticated
  with check (user_a = auth.uid() and initiated_by = auth.uid() and status in ('pending', 'blocked'));

create policy friendships_update_own on public.friendships
  for update to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- A blocked player can't delete the block to get around it.
create policy friendships_delete_own on public.friendships
  for delete to authenticated
  using ((auth.uid() = user_a or auth.uid() = user_b)
         and (status <> 'blocked' or initiated_by = auth.uid()));

-- Allowed transitions from the API: the RECEIVER accepts a pending request;
-- either side blocks (and becomes initiated_by). Nothing else.
create or replace function public.friendships_guard_update()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if new.user_a <> old.user_a or new.user_b <> old.user_b then
    raise exception '__not_allowed__';
  end if;
  if old.status = 'blocked' and old.initiated_by is distinct from auth.uid() then
    raise exception '__not_allowed__';
  end if;
  if new.status = 'blocked' then
    if new.initiated_by is distinct from auth.uid() then raise exception '__not_allowed__'; end if;
  elsif new.status = 'accepted' and old.status is distinct from 'accepted' then
    if old.status is distinct from 'pending' or old.initiated_by = auth.uid()
       or new.initiated_by is distinct from old.initiated_by then
      raise exception '__not_allowed__';
    end if;
  elsif new.status is distinct from old.status or new.initiated_by is distinct from old.initiated_by then
    raise exception '__not_allowed__';
  end if;
  return new;
end;
$function$;
revoke all on function public.friendships_guard_update() from public, anon, authenticated;

drop trigger if exists friendships_guard_update_trigger on public.friendships;
create trigger friendships_guard_update_trigger
  before update on public.friendships
  for each row execute function public.friendships_guard_update();

-- ── 4) Lobbies: signed-in only, writes limited to host / members ───────────
create or replace function public.is_lobby_member(p_lobby uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (select 1 from public.lobby_members where lobby_id = p_lobby and user_id = auth.uid())
$function$;
revoke all on function public.is_lobby_member(uuid) from public, anon;
grant execute on function public.is_lobby_member(uuid) to authenticated;

drop policy if exists lobbies_all on public.lobbies;
create policy lobbies_select on public.lobbies
  for select to authenticated using (true);
create policy lobbies_insert on public.lobbies
  for insert to authenticated with check (host_id = auth.uid());
create policy lobbies_update on public.lobbies
  for update to authenticated
  using (host_id = auth.uid() or public.is_lobby_member(id))
  with check (host_id = auth.uid() or public.is_lobby_member(id));
-- Empty rooms and stale waiting/closed rooms can still be swept by anyone
-- (lobby.js list/cleanup does that).
create policy lobbies_delete on public.lobbies
  for delete to authenticated
  using (host_id = auth.uid()
         or not exists (select 1 from public.lobby_members m where m.lobby_id = lobbies.id)
         or (status in ('waiting', 'closed') and created_at < now() - interval '30 minutes'));

drop policy if exists lobby_members_all on public.lobby_members;
create policy lobby_members_select on public.lobby_members
  for select to authenticated using (true);
create policy lobby_members_insert on public.lobby_members
  for insert to authenticated with check (user_id = auth.uid());
create policy lobby_members_update on public.lobby_members
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Members remove players who dropped (host or heir, see lobby.js _onGone).
create policy lobby_members_delete on public.lobby_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_lobby_member(lobby_id));

alter function public.cleanup_stale_lobbies() set search_path = public;
revoke all on function public.cleanup_stale_lobbies() from public, anon;
grant execute on function public.cleanup_stale_lobbies() to authenticated;

-- ── 5) site_visits: no public reads / edits ────────────────────────────────
drop policy if exists "anon select" on public.site_visits;
drop policy if exists "anon update" on public.site_visits;
drop policy if exists auth_upsert on public.site_visits;

-- ── 6) matches + search_path ───────────────────────────────────────────────
drop policy if exists "players can update own matches" on public.matches;
create policy "players can update own matches" on public.matches
  for update
  using (auth.uid() = host_id or auth.uid() = guest_id)
  with check (auth.uid() = host_id or auth.uid() = guest_id);

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('trg_recompute_top1', 'protect_username_change', 'safe_uuid',
                        'direct_messages_lock_immutable_fields', 'log_email_change',
                        'protect_top1', 'protect_is_founder', 'recompute_top1')
  loop
    execute format('alter function %s set search_path = public', f);
  end loop;
end $$;
