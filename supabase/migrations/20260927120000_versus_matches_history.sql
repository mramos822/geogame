-- Historial permanente de cada partida de versus (1v1 o grupo), con jugadores,
-- puntajes, ganador y monedas/XP otorgadas. Hasta ahora esto no se guardaba en
-- ningún lado: `matches` (1v1) se borra al limpiar salas, `analytics_events`
-- tipo 'versus' es 1 fila por sala sin puntajes, y currency_ledger no dice con
-- quién jugó. Cada jugador graba SU PROPIA fila (mismo patrón de confianza que
-- analytics_events/currency_ledger: insert abierto, sin validar el monto del
-- lado del cliente) — las filas que comparten `match_key` son la misma partida.
--
-- match_key: '1v1:' || matches.id (uuid ya compartido por host/guest antes de
-- que la sala se borre) para 1v1, o 'grp:' || lobby_id || ':' || seed para
-- grupo (un lobby puede jugar muchas rondas — cada ronda tiene su propio seed).
create table if not exists public.versus_matches (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  match_key  text not null,
  kind       text not null check (kind in ('1v1', 'group')),
  mode       text,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  score      integer not null default 0,
  is_winner  boolean not null default false,
  coins      integer not null default 0,
  xp         integer not null default 0
);

create index if not exists versus_matches_match_key_idx on public.versus_matches (match_key);
create index if not exists versus_matches_user_id_idx   on public.versus_matches (user_id);
create index if not exists versus_matches_created_at_idx on public.versus_matches (created_at);

alter table public.versus_matches enable row level security;

drop policy if exists "versus_matches insert own" on public.versus_matches;
create policy "versus_matches insert own" on public.versus_matches
  for insert to authenticated
  with check (user_id = auth.uid());
-- Sin policy de select: solo se lee con el service role (panel /stats).

-- Reemplaza a grant_versus_currency (que queda sin uso pero no se borra, por
-- si algo viejo lo sigue llamando): hace lo mismo (moneda/XP con tope de
-- 10 otorgamientos/día) Y ADEMÁS deja la fila en versus_matches en el mismo
-- paso — así el historial y el ledger nunca pueden desincronizarse. Si el tope
-- diario ya se alcanzó, la partida se sigue grabando (coins/xp en 0) para que
-- el historial no pierda esa partida.
create or replace function public.record_versus_result(
  p_match_key text, p_kind text, p_mode text, p_score integer, p_won boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today_count integer;
  v_coins integer := 0;
  v_xp integer := 0;
  v_granted boolean := false;
begin
  if v_uid is null or p_match_key is null or p_kind is null then
    return jsonb_build_object('granted', false, 'coins', 0, 'xp', 0);
  end if;

  select count(*) into v_today_count
  from public.currency_ledger
  where user_id = v_uid
    and reason in ('versus_win', 'versus_loss')
    and (created_at at time zone 'America/New_York')::date
        = (now() at time zone 'America/New_York')::date;

  if v_today_count < 10 then
    v_coins := case when p_won then 20 else 5 end;
    v_xp    := case when p_won then 10 else 2 end;
    insert into public.currency_ledger (user_id, coins, xp, reason, ref_value)
    values (v_uid, v_coins, v_xp, case when p_won then 'versus_win' else 'versus_loss' end, v_today_count + 1);
    v_granted := true;
  end if;

  insert into public.versus_matches (match_key, kind, mode, user_id, score, is_winner, coins, xp)
  values (p_match_key, p_kind, p_mode, v_uid, coalesce(p_score, 0), coalesce(p_won, false), v_coins, v_xp);

  return jsonb_build_object('granted', v_granted, 'coins', v_coins, 'xp', v_xp);
end;
$$;

grant execute on function public.record_versus_result(text, text, text, integer, boolean) to authenticated;
