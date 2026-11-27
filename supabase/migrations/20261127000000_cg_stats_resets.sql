-- Restart points for the "Categoría CG" panel in /stats. The panel only counts
-- events after the latest row; analytics_events is never modified, so deleting
-- a row restores the previous window.
create table if not exists public.cg_stats_resets (
  id       bigint generated always as identity primary key,
  reset_at timestamptz not null default now()
);

-- No policies on purpose: only the admin-stats function (service role) uses it.
alter table public.cg_stats_resets enable row level security;
