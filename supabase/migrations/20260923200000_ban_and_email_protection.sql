-- 1) Ban (dev panel): reuses profiles.hidden_from_rankings (already filtered
--    out of the global/top-100 rankings, the guest rank estimate and
--    recompute_top1). A banned account has no global position, so the cup +
--    "#N" badge disappears from its profile for everyone, itself included.
-- 2) Protect hidden_from_rankings and email from client-side updates: the
--    "Users can update own profile" policy let anyone un-ban themselves, and
--    sync_profile_email_to_auth copied a client-written profiles.email into
--    auth.users.email WITHOUT verification. Email changes now go through the
--    send-change-email Edge Function (verified link) and flow auth -> profiles
--    via on_auth_email_sync.

drop trigger if exists sync_profile_email_to_auth_trigger on public.profiles;
drop function if exists public.sync_profile_email_to_auth();

-- Client sessions (a user JWT) can't change these columns; server-side code
-- (service role / SECURITY DEFINER functions that set app.allow_admin_change)
-- still can.
create or replace function public.protect_admin_columns()
returns trigger
language plpgsql
as $function$
begin
  if auth.uid() is not null
     and coalesce(current_setting('app.allow_admin_change', true), '') <> 'on' then
    new.hidden_from_rankings := old.hidden_from_rankings;
    new.email := old.email;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_admin_columns_trigger on public.profiles;
create trigger protect_admin_columns_trigger
  before update on public.profiles
  for each row execute function public.protect_admin_columns();

-- The auth -> profiles email mirror runs inside the user's own request when
-- Auth itself updates auth.users, so it has to be allowed explicitly.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.email is distinct from old.email then
    perform set_config('app.allow_admin_change', 'on', true);
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.dev_set_banned(p_user_id uuid, p_banned boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (select 1 from public.dev_admins where user_id = auth.uid()) then
    raise exception '__not_allowed__';
  end if;
  perform set_config('app.allow_admin_change', 'on', true);
  update public.profiles set hidden_from_rankings = p_banned where id = p_user_id;
  if not found then return false; end if;
  perform public.recompute_top1(); -- a banned #1 loses the crown right away
  return true;
end;
$function$;
revoke all on function public.dev_set_banned(uuid, boolean) from public, anon;
grant execute on function public.dev_set_banned(uuid, boolean) to authenticated;

-- Email-change links (send-change-email): token looked up by its hash.
create index if not exists email_verifications_code_hash_idx on public.email_verifications (code_hash);
