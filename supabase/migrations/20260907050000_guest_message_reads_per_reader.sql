-- Lectura individual de los mensajes del creador. La fila `read_at` de
-- guest_messages solo servia para los dirigidos (1 destinatario); para un
-- broadcast queremos saber QUIEN lo vio y CUANDO (cada invitado/cuenta que
-- estaba en linea al enviarlo). Esta tabla guarda una fila por lector.
create table if not exists public.guest_message_reads (
  message_id  bigint not null references public.guest_messages(id) on delete cascade,
  reader_key  text   not null,   -- 'u:<uuid>' para cuenta, 'v:<visitor_id>' para invitado
  reader_name text,
  read_at     timestamptz not null default now(),
  primary key (message_id, reader_key)
);

alter table public.guest_message_reads enable row level security;
-- sin policies: solo el service role (panel /stats) y la funcion SECURITY DEFINER

-- La RPC ahora tambien recibe el visitor_id (para atribuir la lectura de un
-- invitado sin cuenta) e inserta en guest_message_reads. Mantiene el read_at
-- legacy en guest_messages para los dirigidos. La firma vieja (1 arg) sigue
-- existiendo para los navegadores con la version cacheada.
create or replace function public.mark_guest_message_read(p_id bigint, p_visitor text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text;
  v_name text;
begin
  update public.guest_messages
     set read_at = now()
   where id = p_id
     and read_at is null
     and (user_id is null or user_id = v_uid);

  if v_uid is not null then
    v_key := 'u:' || v_uid::text;
    select username into v_name from public.profiles where id = v_uid;
  elsif p_visitor is not null and length(p_visitor) between 1 and 200 then
    v_key := 'v:' || p_visitor;
    select guest_name into v_name
      from public.guest_presence
     where visitor_id = p_visitor and guest_name is not null
     order by last_active desc limit 1;
  else
    return;
  end if;

  insert into public.guest_message_reads (message_id, reader_key, reader_name)
  values (p_id, v_key, v_name)
  on conflict (message_id, reader_key) do nothing;
end;
$$;

revoke all on function public.mark_guest_message_read(bigint, text) from public;
grant execute on function public.mark_guest_message_read(bigint, text) to anon, authenticated;
