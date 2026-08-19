-- Desde qué tipo de dispositivo (celular/PC) se conectó una cuenta la última
-- vez — se setea junto con last_active/is_playing (ver sbUpdateLastActive/
-- sbSetPlaying en js/sb.js), así /stats puede mostrar 📱/💻 junto a cada
-- cuenta conectada.
alter table public.profiles add column if not exists device text;
