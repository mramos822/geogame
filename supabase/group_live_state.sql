-- ── Estado en vivo por miembro de lobby (para GroupSpectate) ───────────────────
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (o vía `supabase db push`).
--
-- Mismo mecanismo que host_state/guest_state en matches (ver spectator_mode.sql,
-- 1v1) pero para lobby_members: sin esto, un espectador que recién se conecta
-- (o que cambia de POV con las flechas) no tiene forma de saber en qué fase
-- está CADA miembro hasta que llegue su PRÓXIMO broadcast en vivo (tick/round/
-- pregame/postgame) — se quedaba viendo la pantalla vieja/nada hasta que esa
-- persona hiciera algo. Con esto, LB.sendRound/sendPregame/sendPostgame
-- (lobby.js) también persisten acá, y GroupSpectate puede leerlo de una sola
-- consulta REST al conectar o cambiar de POV.

alter table public.lobby_members
  add column if not exists live_state jsonb null;
