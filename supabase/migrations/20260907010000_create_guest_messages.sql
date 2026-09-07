-- Mensajes del creador para invitados (sin cuenta). visitor_id NULL = para
-- todos los invitados; con visitor_id = dirigido a ese dispositivo. Los
-- inserta el admin manualmente por SQL (no hay policy de INSERT para anon).
-- El cliente (js/guestmsg.js) los lee por SELECT publico y se suscribe por
-- realtime para mostrarlos al instante.
create table if not exists public.guest_messages (
  id         bigint generated always as identity primary key,
  visitor_id text,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists guest_messages_visitor_idx
  on public.guest_messages (visitor_id, created_at desc);

alter table public.guest_messages enable row level security;

create policy "anon can read guest messages"
  on public.guest_messages for select
  to anon
  using (true);

alter publication supabase_realtime add table public.guest_messages;
