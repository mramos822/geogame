-- Foto fija del cálculo retroactivo: si el sistema de niveles hubiera estado
-- activo desde siempre, esto es lo que cada cuenta tendría HOY (XP total,
-- nivel, monedas) según el historial real evento por evento de
-- analytics_events (type='campaign' con su score, type='globequiz' con la
-- racha que tenía en cada victoria puntual) + los premios de nivel que
-- hubiera ido cobrando en el camino. NO es saldo real (el sistema todavía
-- no paga nada en vivo, solo currency_ledger acumula desde ahora) — sirve
-- como referencia para cuando se decida lanzar y haya que decidir cómo
-- arrancar a cada cuenta existente.
create table if not exists public.xp_retroactive_snapshot (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id),
  username text not null,
  total_xp integer not null default 0,
  level integer not null default 1,
  gameplay_coins integer not null default 0,
  level_bonus_coins integer not null default 0,
  total_coins integer not null default 0,
  computed_at timestamptz not null default now()
);
alter table public.xp_retroactive_snapshot enable row level security;

insert into public.xp_retroactive_snapshot
  (user_id, username, total_xp, level, gameplay_coins, level_bonus_coins, total_coins)
with campaign_events as (
  select user_id,
    (10 + floor(score/250)) as coins,
    (50 + floor(score/250)*3) as xp
  from analytics_events where type='campaign' and user_id is not null
),
globequiz_events as (
  select user_id,
    round(10 * power(1.15, least(floor(coalesce(streak,0)/10.0),10))) as coins,
    round(20 * power(1.15, least(floor(coalesce(streak,0)/10.0),10))) as xp
  from analytics_events where type='globequiz' and user_id is not null
),
combined as (
  select * from campaign_events
  union all
  select * from globequiz_events
),
per_user_raw as (
  select p.id, p.username,
    coalesce(sum(c.coins),0)::int as gameplay_coins,
    coalesce(sum(c.xp),0)::int as total_xp
  from profiles p left join combined c on c.user_id = p.id
  group by p.id, p.username
),
per_user_level as (
  select *,
    least(floor((25 + sqrt(625 + 100.0*total_xp)) / 50)::int, 100) as level
  from per_user_raw
)
select pul.id, pul.username, pul.total_xp, pul.level, pul.gameplay_coins,
  coalesce((
    select sum(
      case
        when lvl = 100 then 10000
        when lvl % 10 = 0 then round((20 + power(lvl-1,1.6)*2) * 1.25)
        else round(20 + power(lvl-1,1.6)*2)
      end
    )
    from generate_series(2, pul.level) as lvl
  ),0)::int as level_bonus_coins,
  pul.gameplay_coins + coalesce((
    select sum(
      case
        when lvl = 100 then 10000
        when lvl % 10 = 0 then round((20 + power(lvl-1,1.6)*2) * 1.25)
        else round(20 + power(lvl-1,1.6)*2)
      end
    )
    from generate_series(2, pul.level) as lvl
  ),0)::int as total_coins
from per_user_level pul;
