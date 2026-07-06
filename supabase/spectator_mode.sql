-- ── Modo espectador (Versus 1v1, Banderas/Siluetas) ────────────────────────────
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (o vía `supabase db push`).
--
-- host_state/guest_state guardan el último estado conocido de cada jugador
-- (índice de pregunta + su última selección) para poder resincronizar a un
-- espectador que entra a mitad de partida, sin necesidad de una tabla de
-- eventos aparte — se actualizan junto al score en el mismo UPDATE.

alter table public.matches
  add column if not exists host_state  jsonb null,
  add column if not exists guest_state jsonb null;

-- Permite leer un match a un amigo aceptado de host_id o guest_id — necesario
-- para que el botón de espectador pueda descubrir matchId/seed/mode/scores de
-- la partida en curso de un amigo. Sin esta policy, solo host/guest pueden
-- leer su propio match (policy existente, no tocada acá). Las policies son
-- permisivas (OR entre sí), así que esta solo AMPLÍA el acceso de lectura,
-- nunca lo restringe.
alter table public.matches enable row level security;
drop policy if exists "matches_select_friends" on public.matches;
create policy "matches_select_friends"
  on public.matches
  for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.user_a = auth.uid() and f.user_b in (host_id, guest_id))
          or (f.user_b = auth.uid() and f.user_a in (host_id, guest_id)))
    )
  );
