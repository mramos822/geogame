-- Head-to-head versus record: per (me, opponent, mode) win/loss tally.
-- Each client writes ONLY its own row (user_id = auth.uid()), same pattern
-- as sbRecordVersusResult on profiles.vs_wins/vs_losses.
create table if not exists public.versus_h2h (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  mode        text not null,
  wins        integer not null default 0,
  losses      integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, opponent_id, mode)
);

alter table public.versus_h2h enable row level security;

drop policy if exists "versus_h2h own select" on public.versus_h2h;
create policy "versus_h2h own select" on public.versus_h2h
  for select using (auth.uid() = user_id);

-- One RPC does the upsert+increment so the client never needs a read first.
create or replace function public.record_versus_h2h(p_opponent uuid, p_mode text, p_won boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_opponent is null or p_mode is null then
    return;
  end if;
  insert into public.versus_h2h (user_id, opponent_id, mode, wins, losses, updated_at)
  values (
    auth.uid(), p_opponent, p_mode,
    case when p_won then 1 else 0 end,
    case when p_won then 0 else 1 end,
    now()
  )
  on conflict (user_id, opponent_id, mode) do update
    set wins       = versus_h2h.wins   + case when p_won then 1 else 0 end,
        losses     = versus_h2h.losses + case when p_won then 0 else 1 end,
        updated_at = now();
end;
$$;

grant execute on function public.record_versus_h2h(uuid, text, boolean) to authenticated;
