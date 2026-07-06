-- ── Estado "practicando" (para ocultar el botón de espectador) ─────────────────
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (o vía `supabase db push`).
--
-- is_playing ya existía y no distingue partida real de práctica — el botón de
-- ojo en el panel de amigos usaba solo is_playing, así que aparecía también
-- cuando el amigo estaba practicando (sesión sin canal de espectador real,
-- SoloSpectate no arranca en modo práctica). Esta columna nueva permite al
-- panel de amigos ocultar el ojo específicamente en ese caso.

alter table public.profiles
  add column if not exists is_practicing boolean not null default false;
