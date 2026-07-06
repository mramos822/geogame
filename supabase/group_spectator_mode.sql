-- ── Modo espectador GRUPAL (duelos de lobby, hasta 10 jugadores) ────────────────
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (o vía `supabase db push`).
--
-- Mismo mecanismo que spectator_mode.sql (1v1), pero para las tablas
-- `lobbies`/`lobby_members`: un espectador externo necesita poder:
--   1) descubrir si un amigo está en un lobby activo (openSpectatorForFriend)
--   2) leer la lista de miembros + su perfil (GroupSpectate._fetchMembers,
--      para poblar el carrusel de flechas de POV)
-- Sin estas policies, solo los propios miembros de la sala podían leer estas
-- filas — un amigo externo mirando desde afuera se quedaba sin datos.
-- Las policies son permisivas (OR entre sí), así que esto solo AMPLÍA el
-- acceso de lectura existente, nunca lo restringe.

alter table public.lobbies enable row level security;
drop policy if exists "lobbies_select_friends" on public.lobbies;
create policy "lobbies_select_friends"
  on public.lobbies
  for select
  to authenticated
  using (
    exists (
      select 1 from public.lobby_members lm
      join public.friendships f
        on f.status = 'accepted'
       and ((f.user_a = auth.uid() and f.user_b = lm.user_id)
         or (f.user_b = auth.uid() and f.user_a = lm.user_id))
      where lm.lobby_id = lobbies.id
    )
  );

alter table public.lobby_members enable row level security;
drop policy if exists "lobby_members_select_friends" on public.lobby_members;
create policy "lobby_members_select_friends"
  on public.lobby_members
  for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.user_a = auth.uid() and f.user_b = lobby_members.user_id)
          or (f.user_b = auth.uid() and f.user_a = lobby_members.user_id))
    )
  );
