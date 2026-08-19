-- Latido en vivo para invitados (sin cuenta) — sin esto, /stats "En línea
-- ahora"/"Jugando ahora" solo puede ver profiles.last_active/is_playing,
-- que no existe para nadie sin cuenta. Espejo minimalista de esas dos
-- columnas de `profiles`, pero keyed por visitor_id (ver js/analytics.js)
-- en vez de user id.
create table if not exists guest_presence (
  visitor_id text primary key,
  last_active timestamptz not null default now(),
  is_playing boolean not null default false,
  playing_mode text,
  guest_name text,
  country_code text,
  device text
);

alter table guest_presence enable row level security;

-- Mismo modelo de confianza que analytics_events: el rol anon puede
-- insertar/actualizar su propio latido (no hay auth.uid() para invitados,
-- así que no se puede acotar más sin cuentas), pero nunca puede LEER --
-- solo el service role (admin-stats) lee esta tabla.
create policy "anon can upsert guest presence"
  on guest_presence for insert
  to anon
  with check (true);

create policy "anon can update guest presence"
  on guest_presence for update
  to anon
  using (true)
  with check (true);
