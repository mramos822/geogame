-- La policy anterior era solo `to anon`; un jugador logueado (rol
-- authenticated) no podia leer sus propios mensajes. Abrir a ambos roles.
drop policy if exists "anon can read guest messages" on public.guest_messages;

create policy "read guest messages"
  on public.guest_messages for select
  to anon, authenticated
  using (true);
