-- Ledger append-only de XP/monedas, mismo patrón que analytics_events: el
-- cliente (anon) solo puede insertar, nunca leer/editar; el balance real se
-- calcula sumando este historial (o se cachea en profiles más adelante).
-- Arranca antes de que exista la UI de XP/monedas para no perder datos: cada
-- Gira Mundial completa y cada día de racha de GlobeQuiz ya quedan logueados
-- acá, así que cuando se lance el sistema real, el saldo se puede calcular
-- retroactivo sumando todo lo acumulado hasta ese momento.
create table if not exists public.currency_ledger (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id),
  coins integer not null default 0,
  xp integer not null default 0,
  reason text not null, -- 'campaign_complete' | 'globequiz_win' | ...
  ref_value integer,     -- score de la campaña, o racha del momento, según reason (auditoría)
  visitor_id text,
  created_at timestamptz not null default now()
);

alter table public.currency_ledger enable row level security;

create policy "currency_insert_anon" on public.currency_ledger
  for insert to anon, authenticated
  with check (true);

create index if not exists currency_ledger_user_id_idx on public.currency_ledger(user_id);
