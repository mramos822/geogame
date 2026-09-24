-- CrazyGames -> official web: founder offer, one-click login handoff and
-- real email capture for CrazyGames accounts (which are created with an
-- internal cg_<hash>@crazygames.mygeochallenge.internal address).

-- 1) Keep profiles.email in sync with the auth email. The username login
-- (sbLogin) and password reset look the email up in profiles, and nothing was
-- updating it after an email change (1 account was already out of sync).
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists on_auth_email_sync on auth.users;
create trigger on_auth_email_sync
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

update public.profiles p set email = u.email
  from auth.users u
  where u.id = p.id and p.email is distinct from u.email;

-- 2) Founder offer shown at the end of a game in the CrazyGames build: a
-- CrazyGames account that hasn't chosen a password yet, isn't founder yet and
-- founder slots remain (same cap as claim_founder_pack).
create or replace function public.cg_founder_offer_eligible()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  return exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = v_uid
      and p.crazygames_user_id is not null
      and p.founder_popup_seen = false
      and not (coalesce(u.raw_user_meta_data, '{}'::jsonb) ? 'web_password_set')
  ) and (select count(*) from public.profiles where founder_popup_seen = true) < 100;
end;
$function$;
revoke all on function public.cg_founder_offer_eligible() from public, anon;
grant execute on function public.cg_founder_offer_eligible() to authenticated;

-- 3) One-click login handoff (CrazyGames build -> mygeochallenge.com): the
-- logged-in player gets a single-use code valid for 10 minutes; the web
-- exchanges it (login-handoff Edge Function) for a session. No password ever
-- travels in a URL.
create table if not exists public.login_handoffs (
  code       text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);
alter table public.login_handoffs enable row level security; -- no policies: functions only

create or replace function public.create_login_handoff()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $function$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then raise exception '__not_authenticated__'; end if;
  delete from public.login_handoffs where created_at < now() - interval '1 day';
  v_code := encode(gen_random_bytes(24), 'hex');
  insert into public.login_handoffs (code, user_id) values (v_code, v_uid);
  return v_code;
end;
$function$;
revoke all on function public.create_login_handoff() from public, anon;
grant execute on function public.create_login_handoff() to authenticated;

-- 4) Email capture with a 6-digit code (account-email Edge Function). Used
-- for CrazyGames accounts on the web, which have no real email to recover
-- their password with.
create table if not exists public.email_verifications (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  code_hash  text not null,
  attempts   int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.email_verifications enable row level security; -- no policies: functions only
