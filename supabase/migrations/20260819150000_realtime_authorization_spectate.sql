-- Realtime Authorization para los canales de espectador (solo-{userId} y
-- match-{matchId}): hasta ahora estos canales de broadcast/presence eran
-- públicos a nivel de Supabase Realtime — CUALQUIER cuenta logueada podía
-- suscribirse directo con el SDK (sin pasar por la UI ni por watchSolo())
-- y mirar la partida en vivo de cualquiera. El chequeo de amistad agregado
-- en js/spectate.js (watchSolo) solo protege el camino oficial de la app;
-- esto cierra el canal mismo del lado del servidor.
--
-- No toca ningún otro canal del proyecto (friend-statuses, lobby-*,
-- invites-*, etc.) — esos siguen públicos como antes. Ver conversación con
-- el usuario del 2026-08-19 para el resto del análisis (lobby group-spectate
-- se dejó afuera a propósito: lobby_members/lobbies ya tienen una policy
-- "ALL true" que las deja abiertas a nivel de tabla, así que blindar solo el
-- canal ahí sería un arreglo a medias).
-- RLS ya viene habilitado por defecto en realtime.messages en proyectos
-- Supabase (y `alter table realtime.messages enable row level security`
-- falla con "must be owner of table messages" — no somos dueños de esa
-- tabla del sistema, ni hace falta).

-- SOLO (Gira Mundial / modo individual, canal 'solo-{userId}'): puede
-- leer/escribir (broadcast+presence) el propio dueño o un amigo aceptado.
create policy "solo spectate: owner or accepted friend can read"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() ~ '^solo-[0-9a-fA-F-]{36}$'
  and realtime.messages.extension in ('broadcast', 'presence')
  and (
    (substring(realtime.topic() from 6))::uuid = auth.uid()
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and (
          (f.user_a = auth.uid() and f.user_b = (substring(realtime.topic() from 6))::uuid)
          or (f.user_b = auth.uid() and f.user_a = (substring(realtime.topic() from 6))::uuid)
        )
    )
  )
);

create policy "solo spectate: owner or accepted friend can write"
on "realtime"."messages"
for insert
to authenticated
with check (
  realtime.topic() ~ '^solo-[0-9a-fA-F-]{36}$'
  and realtime.messages.extension in ('broadcast', 'presence')
  and (
    (substring(realtime.topic() from 6))::uuid = auth.uid()
    or exists (
      select 1 from friendships f
      where f.status = 'accepted'
        and (
          (f.user_a = auth.uid() and f.user_b = (substring(realtime.topic() from 6))::uuid)
          or (f.user_b = auth.uid() and f.user_a = (substring(realtime.topic() from 6))::uuid)
        )
    )
  )
);

-- VS 1v1 (canal 'match-{matchId}'): pueden leer/escribir los dos jugadores
-- del match, o un amigo aceptado de cualquiera de los dos — mismo criterio
-- que ya usa la policy 'matches_select_friends' sobre la tabla `matches`.
create policy "vs match: players or accepted friends can read"
on "realtime"."messages"
for select
to authenticated
using (
  realtime.topic() ~ '^match-[0-9a-fA-F-]{36}$'
  and realtime.messages.extension in ('broadcast', 'presence')
  and exists (
    select 1 from matches m
    where m.id = (substring(realtime.topic() from 7))::uuid
      and (
        m.host_id = auth.uid() or m.guest_id = auth.uid()
        or exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and (
              (f.user_a = auth.uid() and f.user_b in (m.host_id, m.guest_id))
              or (f.user_b = auth.uid() and f.user_a in (m.host_id, m.guest_id))
            )
        )
      )
  )
);

create policy "vs match: players or accepted friends can write"
on "realtime"."messages"
for insert
to authenticated
with check (
  realtime.topic() ~ '^match-[0-9a-fA-F-]{36}$'
  and realtime.messages.extension in ('broadcast', 'presence')
  and exists (
    select 1 from matches m
    where m.id = (substring(realtime.topic() from 7))::uuid
      and (
        m.host_id = auth.uid() or m.guest_id = auth.uid()
        or exists (
          select 1 from friendships f
          where f.status = 'accepted'
            and (
              (f.user_a = auth.uid() and f.user_b in (m.host_id, m.guest_id))
              or (f.user_b = auth.uid() and f.user_a in (m.host_id, m.guest_id))
            )
        )
      )
  )
);
