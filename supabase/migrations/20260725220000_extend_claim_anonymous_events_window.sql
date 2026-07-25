-- Antes la ventana por defecto era 48hs: si alguien jugaba de invitado y
-- tardaba más en crearse la cuenta, perdía las monedas/XP ganadas antes de
-- esa ventana. Se extiende a ~10 años (en la práctica, "todo lo que
-- consiguió", sin importar cuánto tardó en registrarse) — la protección
-- real sigue siendo "user_id is null" (nunca reclama algo de otra cuenta).
create or replace function public.claim_anonymous_events(p_visitor_id text, p_window_hours integer default 87600)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_count2 integer;
begin
  if v_uid is null or p_visitor_id is null or p_visitor_id = '' then
    return 0;
  end if;

  update analytics_events
  set user_id = v_uid
  where visitor_id = p_visitor_id
    and user_id is null
    and created_at > now() - (p_window_hours || ' hours')::interval;

  get diagnostics v_count = row_count;

  update currency_ledger
  set user_id = v_uid
  where visitor_id = p_visitor_id
    and user_id is null
    and created_at > now() - (p_window_hours || ' hours')::interval;

  get diagnostics v_count2 = row_count;

  return v_count + v_count2;
end;
$function$;
