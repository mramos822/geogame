-- claim_anonymous_events() solo vinculaba analytics_events — currency_ledger
-- (agregado después, ver create_currency_ledger) tiene su propio visitor_id
-- y se quedaba sin reclamar: si alguien ganaba monedas/XP como invitado y
-- después creaba cuenta, esas monedas quedaban huérfanas para siempre (esa
-- cuenta arrancaría en 0 aunque ya hubiera jugado y ganado algo). Misma
-- protección que la tabla original: solo toca filas con user_id is null,
-- nunca reasigna algo que ya pertenece a otra cuenta.
create or replace function public.claim_anonymous_events(p_visitor_id text, p_window_hours integer default 48)
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
