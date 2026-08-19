-- Desde qué tipo de dispositivo (celular/PC) se generó cada evento de juego/
-- visita — ver deviceType() en js/analytics.js. Permite mostrar el
-- dispositivo también en el panel de detalle "partidas de este día" de
-- /stats (click en el gráfico de actividad), no solo en la lista de
-- conectados ahora (que usa profiles.device).
alter table public.analytics_events add column if not exists device text;
