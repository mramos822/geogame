-- Nombre que el invitado se puso LOCALMENTE (localStorage.playerName, ver
-- monuments.js) antes de crear cuenta — hasta ahora nunca se mandaba al
-- servidor, así que en /stats un invitado solo se podía identificar por un
-- visitor_id ilegible. Solo se llena para invitados (user_id null); una vez
-- que tiene cuenta ya se identifica por username real, no hace falta acá.
alter table public.analytics_events add column if not exists guest_name text;
