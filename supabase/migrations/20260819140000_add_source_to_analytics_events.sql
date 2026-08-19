-- Atribución de tráfico pago (ej. ?src=yt en el link del anuncio de YouTube) —
-- ver captura en getSource()/logVisit, js/analytics.js. Permite en /stats
-- separar la conversión real de una campaña específica en vez de adivinar
-- por país/dispositivo.
alter table analytics_events add column if not exists source text;
