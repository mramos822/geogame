-- Distingue en qué contexto se jugó una partida single-player: Gira Mundial
-- (campaña, encadena los 4 modos), Práctica (modo práctica libre) o Individual
-- (un modo suelto fuera de campaña). Las partidas versus ya se distinguen por
-- analytics_events.type = 'versus', así que no necesitan este campo.
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS session_type text;
