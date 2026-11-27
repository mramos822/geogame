-- One row per game page visit with the time actually played in it, for the
-- CrazyGames-style metrics in /stats (Gameplay Conversion and average playtime).
create table if not exists public.play_sessions (
  id         uuid primary key,
  visitor_id text not null,
  platform   text not null default 'web',
  device     text,
  started_at timestamptz not null default now(),
  play_ms    integer not null default 0
);
create index if not exists play_sessions_started_idx on public.play_sessions (started_at);

-- No policies: clients write only through report_play, admin-stats reads with
-- the service role.
alter table public.play_sessions enable row level security;

-- p_play_ms is the running total, so a lost call is corrected by the next one.
-- It can never go down, nor exceed the time elapsed since the visit started.
create or replace function public.report_play(
  p_id uuid, p_visitor text, p_platform text, p_device text, p_play_ms integer
) returns void language sql security definer set search_path = public as $$
  insert into play_sessions (id, visitor_id, platform, device)
  values (p_id, left(p_visitor, 80), left(p_platform, 20), left(p_device, 10))
  on conflict (id) do update set play_ms = greatest(
    play_sessions.play_ms,
    least(p_play_ms, (extract(epoch from now() - play_sessions.started_at) * 1000)::bigint + 5000)::integer
  );
$$;
revoke all on function public.report_play(uuid, text, text, text, integer) from public;
grant execute on function public.report_play(uuid, text, text, text, integer) to anon, authenticated;
