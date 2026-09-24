-- Security hardening (2026-09-23)
--
-- 1) Emails were public: profiles.email was readable by anyone with the anon
--    key (the "Users can read all profiles" policy + the username login
--    looking the email up client-side), and realtime profile updates carried
--    it too. The column is dropped; emails now live only in auth.users and
--    are resolved server-side (account-auth Edge Function) through the
--    service-role-only helpers below.
-- 2) add_game_score / claim_founder_pack took any user id: anyone (even
--    signed out) could add scores to, or burn the founder claim of, ANY
--    account. Both now only act on the caller.
-- 3) Internal functions (triggers, cron jobs) are no longer callable through
--    the public API.

-- ── 1) Server-side login / email helpers (service_role only) ─────────────
create or replace function public.verify_login_password(p_username text, p_password text)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public, extensions
as $function$
  select u.id, u.email::text
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.username = p_username
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until < now())
    and coalesce(u.encrypted_password, '') <> ''
    and u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
$function$;

create or replace function public.auth_email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $function$
  select u.email::text from auth.users u join public.profiles p on p.id = u.id
  where p.username = p_username and u.deleted_at is null
$function$;

create or replace function public.auth_email_in_use(p_email text, p_exclude uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select exists (select 1 from auth.users where lower(email) = lower(p_email) and id <> p_exclude)
$function$;

create or replace function public.auth_user_id_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $function$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$function$;

revoke all on function public.verify_login_password(text, text) from public, anon, authenticated;
revoke all on function public.auth_email_for_username(text)      from public, anon, authenticated;
revoke all on function public.auth_email_in_use(text, uuid)      from public, anon, authenticated;
revoke all on function public.auth_user_id_for_email(text)       from public, anon, authenticated;
grant execute on function public.verify_login_password(text, text) to service_role;
grant execute on function public.auth_email_for_username(text)      to service_role;
grant execute on function public.auth_email_in_use(text, uuid)      to service_role;
grant execute on function public.auth_user_id_for_email(text)       to service_role;

-- Brute-force throttle for account-auth (login / reset code attempts).
create table if not exists public.auth_attempts (
  id         bigserial primary key,
  kind       text not null,          -- 'login' | 'reset_verify' | 'reset_request'
  username   text,
  ip         text,
  ok         boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_user_idx on public.auth_attempts (kind, username, created_at);
create index if not exists auth_attempts_ip_idx   on public.auth_attempts (kind, ip, created_at);
alter table public.auth_attempts enable row level security; -- no policies: service role only

-- ── Drop profiles.email and everything that fed it ───────────────────────
drop trigger if exists on_auth_email_sync on auth.users;
drop function if exists public.sync_profile_email();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_is_founder boolean;
begin
  select count(*) < 100 into v_is_founder from public.profiles where founder_popup_seen = true;
  if new.raw_user_meta_data ? 'crazygames_user_id' then
    v_is_founder := false;
  end if;
  insert into public.profiles (id, username, country_code, is_founder)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'country_code', v_is_founder)
  on conflict (id) do nothing;
  insert into public.email_history (user_id, email, recorded_at)
  values (new.id, new.email, now());
  return new;
end;
$function$;

create or replace function public.protect_admin_columns()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if auth.uid() is not null
     and coalesce(current_setting('app.allow_admin_change', true), '') <> 'on' then
    new.hidden_from_rankings := old.hidden_from_rankings;
  end if;
  return new;
end;
$function$;

alter table public.profiles drop column if exists email;

-- ── 2) Only act on the caller ─────────────────────────────────────────────
create or replace function public.add_game_score(p_user_id uuid, p_session_id text, p_flags integer, p_shapes integer, p_cities integer, p_monuments integer, p_total integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception '__not_allowed__';
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

create or replace function public.claim_founder_pack(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_claimed_count int;
  v_updated boolean;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception '__not_allowed__';
  end if;
  perform pg_advisory_xact_lock(hashtext('founder_claim'));
  perform set_config('app.allow_founder_change', 'on', true);

  update public.profiles
    set founder_popup_seen = true, founder_claimed_at = now()
    where id = p_user_id and is_founder = true and founder_popup_seen = false;
  v_updated := found;

  if not v_updated then
    return false;
  end if;

  select count(*) into v_claimed_count from public.profiles where founder_popup_seen = true;

  if v_claimed_count >= 100 then
    update public.profiles
      set is_founder = false
      where is_founder = true and founder_popup_seen = false;
  end if;

  return true;
end;
$function$;

revoke all on function public.add_game_score(uuid, text, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.add_game_score(uuid, text, integer, integer, integer, integer, integer) to authenticated;
revoke all on function public.claim_founder_pack(uuid) from public, anon;
grant execute on function public.claim_founder_pack(uuid) to authenticated;

-- ── 3) Internal functions: not part of the public API ────────────────────
revoke all on function public.handle_new_user()        from public, anon, authenticated;
revoke all on function public.log_email_change()       from public, anon, authenticated;
revoke all on function public.recompute_top1()         from public, anon, authenticated;
revoke all on function public.clear_stale_is_playing() from public, anon, authenticated;
revoke all on function public.protect_admin_columns()  from public, anon, authenticated;
