-- ── analytics_events ──────────────────────────────────────────────────────────
-- Tabla append-only de eventos para la página admin de stats.
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (o vía `supabase db push`).
--
-- Diseño: el rol anon/authenticated SOLO puede INSERTAR (no leer). Únicamente la
-- Edge Function `admin-stats` (service role, que bypassa RLS) lee y agrega los datos.

create table if not exists public.analytics_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  type          text        not null,            -- 'visit' | 'game'
  user_id       uuid        null,
  mode          text        null,                -- 'flags' | 'shapes' | 'cities' | 'monuments'
  score         integer     null,
  country_code  text        null,                -- ISO alpha-2, p.ej. 'US'
  country       text        null,                -- reservado (nombre); hoy se resuelve en el cliente admin
  visitor_id    text        null                 -- id anónimo por dispositivo
);

create index if not exists analytics_events_created_at_idx on public.analytics_events (created_at);
create index if not exists analytics_events_type_created_idx on public.analytics_events (type, created_at);

alter table public.analytics_events enable row level security;

-- INSERT permitido a cualquiera (anon + authenticated); NO hay policy de SELECT,
-- así que nadie con la clave pública puede leer la tabla.
drop policy if exists "analytics_insert_anon" on public.analytics_events;
create policy "analytics_insert_anon"
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (true);
