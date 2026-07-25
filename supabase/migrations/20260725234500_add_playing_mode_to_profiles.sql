-- Qué está jugando cada cuenta ahora mismo (ej: "Gira Mundial", "GlobeQuiz",
-- "VS · Banderas") — antes solo había is_playing (booleano), así que /stats
-- podía ver que alguien estaba "Jugando" pero no en qué modo. Se limpia a
-- null junto con is_playing al terminar la partida (ver sbSetPlaying).
alter table public.profiles add column if not exists playing_mode text;
