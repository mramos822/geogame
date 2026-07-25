-- Reemplazada por cálculo EN VIVO dentro de la edge function admin-stats
-- (se recalcula en cada carga del panel a partir de analytics_events +
-- currency_ledger, con detección de manipulación). La foto fija ya no
-- se consulta desde ningún lado.
drop table if exists public.xp_retroactive_snapshot;
