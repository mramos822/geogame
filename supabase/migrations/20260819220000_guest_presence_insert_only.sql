-- El modelo de upsert (visitor_id PK + ON CONFLICT DO UPDATE) falla con RLS:
-- confirmado con un insert real como rol anon, "new row violates row-level
-- security policy" -- Postgres necesita más que solo policies de INSERT/UPDATE
-- para resolver el conflicto. Se cambia a append-only (mismo modelo que
-- analytics_events, ya probado en producción): cada latido inserta una fila
-- nueva en vez de actualizar la existente.
drop policy if exists "anon can update guest presence" on guest_presence;
drop policy if exists "anon can upsert guest presence" on guest_presence;

alter table guest_presence drop constraint if exists guest_presence_pkey;
alter table guest_presence add column if not exists id bigserial primary key;

create index if not exists guest_presence_visitor_last_active_idx
  on guest_presence (visitor_id, last_active desc);
create index if not exists guest_presence_last_active_idx
  on guest_presence (last_active desc);

create policy "anon can insert guest presence"
  on guest_presence for insert
  to anon
  with check (true);

-- Limpieza diaria: es un log de latidos (una fila cada ~15-25s por invitado
-- activo), sin esto crece sin límite. Mismo patrón que el cron existente
-- "clear-stale-is-playing" sobre profiles.
select cron.schedule(
  'cleanup-guest-presence',
  '0 4 * * *',
  $$delete from guest_presence where last_active < now() - interval '2 days'$$
);
