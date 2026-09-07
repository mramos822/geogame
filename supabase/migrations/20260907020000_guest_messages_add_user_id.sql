-- Permitir dirigir un mensaje a una cuenta registrada (no solo a un
-- dispositivo/invitado). Reglas de destino en el cliente (js/guestmsg.js):
--   user_id    no nulo -> solo esa cuenta
--   visitor_id no nulo -> solo ese dispositivo
--   ambos nulos        -> todos
alter table public.guest_messages add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists guest_messages_user_idx
  on public.guest_messages (user_id, created_at desc);
