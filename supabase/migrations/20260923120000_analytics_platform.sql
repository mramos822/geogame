-- Which build the event came from: 'web' (mygeochallenge.com), 'crazygames'
-- or 'gd' (GameDistribution). Set client-side by js/analytics.js (see
-- detectPlatform). Separate from `source`, which is first-touch campaign
-- attribution (?src=yt) and only lives on 'visit' events.
-- Rows before this migration stay NULL (unknown — all of them are web in
-- practice, the portal builds weren't live yet).
alter table public.analytics_events add column if not exists platform text;
alter table public.guest_presence  add column if not exists platform text;

create index if not exists analytics_events_platform_idx
  on public.analytics_events (platform, created_at);
