-- Documenta el diseño completo del futuro sistema de XP/monedas/niveles
-- (charla de planificación, mediano plazo). status='planned': todavía NO
-- hay lógica de niveles ni pagos de premios corriendo en el juego, solo se
-- está trackeando el historial crudo en currency_ledger para no perder
-- datos mientras se termina de diseñar/implementar la UI real.
create table if not exists public.xp_system_config (
  id bigint generated always as identity primary key,
  rule_key text not null unique,
  rule_value jsonb not null,
  description text not null,
  status text not null default 'planned' check (status in ('planned','active')),
  updated_at timestamptz not null default now()
);

alter table public.xp_system_config enable row level security;
-- Solo lectura vía service role (igual que analytics_events/currency_ledger);
-- nadie necesita leer esto desde el cliente del juego todavía.

insert into public.xp_system_config (rule_key, rule_value, description) values
('campaign_reward',
  '{"base_coins":10,"base_xp":50,"points_step":250,"step_coins":1,"step_xp":3}',
  'Gira Mundial completa: 10 monedas + 50 XP base, +1 moneda y +3 XP por cada 250 puntos de score. Ya trackeado en vivo (logCampaignCurrency, js/analytics.js).'),
('globequiz_reward',
  '{"base_coins":10,"base_xp":20,"mult_step_days":10,"mult_factor":1.15,"mult_max_steps":10}',
  'Victoria de GlobeQuiz: 10 monedas + 20 XP base, x1.15 por cada 10 días de racha activa, tope en 10 aplicaciones (racha>=100 días => x1.15^10 ≈ 4.05 fijo). Ya trackeado en vivo (logGlobequizCurrency, js/analytics.js).'),
('versus_reward',
  '{"coins":0,"xp":0}',
  'VS amistoso NO otorga monedas/XP por ahora (decisión deliberada, sin hook en el código).'),
('level_curve',
  '{"formula":"25 * L * (L-1)","description":"XP acumulado necesario para llegar al nivel L","max_level":100}',
  'Curva cuadrática de niveles, tope real en nivel 100 (no 1000 — un contador que nadie mueve en años se siente muerto, no aspiracional). Nivel 100 = 247,500 XP acumulado ≈ 1.3 años jugando fuerte (10 giras/semana + racha).'),
('level_up_reward',
  '{"formula":"20 + (L-1)^1.6 * 2","milestone_multiplier":1.25,"milestone_every":10,"note":"redondear al entero más cercano"}',
  'Premio en monedas al subir de nivel (2-99). +25% extra en niveles múltiplos de 10 para que se sientan como un hito. Ej: nivel 10=109, nivel 50=1290, nivel 90≈3400.'),
('level_100_bonus',
  '{"coins":10000,"overrides_formula":true}',
  'Nivel 100 (tope) NO sigue la fórmula de level_up_reward — es un premio especial fijo de 10,000 monedas como agradecimiento por llegar al final del sistema.')
on conflict (rule_key) do update set
  rule_value = excluded.rule_value,
  description = excluded.description,
  updated_at = now();
