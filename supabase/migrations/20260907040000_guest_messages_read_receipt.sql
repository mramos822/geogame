-- Read receipt: se marca cuando el jugador cierra la viñeta con el check.
alter table public.guest_messages add column if not exists read_at timestamptz;

-- El cliente (anon/authenticated) no tiene UPDATE sobre la tabla; marca por
-- esta funcion SECURITY DEFINER, que solo puede setear read_at una vez.
-- Para mensajes dirigidos a una cuenta exige que sea esa cuenta; para los de
-- dispositivo/broadcast se permite (no hay forma de verificar el visitor_id).
create or replace function public.mark_guest_message_read(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.guest_messages
     set read_at = now()
   where id = p_id
     and read_at is null
     and (user_id is null or user_id = auth.uid());
end;
$$;

revoke all on function public.mark_guest_message_read(bigint) from public;
grant execute on function public.mark_guest_message_read(bigint) to anon, authenticated;
