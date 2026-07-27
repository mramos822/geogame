// ── FILTRO DE MALAS PALABRAS (username / nombre de jugador) ───────────────────
// Bloquea insultos/lenguaje explícito en inglés y español (con variantes
// regionales) al elegir nombre de usuario o nombre de invitado. No es
// exhaustivo ni perfecto — ningún filtro por lista lo es (siempre hay
// falsos negativos con ofuscación creativa, y algún falso positivo posible
// con palabras legítimas que contengan una de estas como substring) — pero
// cubre el caso normal: alguien escribiendo la palabra directamente, con
// mayúsculas/acentos/leetspeak simple (0->o, 1->i, 3->e, etc.) de por medio.
//
// API pública: window.containsBadWord(str) -> boolean
(function () {
  const WORDS = [
    // ── Inglés ──
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'pussy',
    'whore', 'slut', 'faggot', 'nigger', 'nigga', 'retard', 'cock', 'twat',
    'motherfucker', 'wanker', 'bollocks', 'douchebag', 'jackass', 'prick',
    'cumshot', 'blowjob', 'handjob', 'rapist',
    // ── Español (neutro + variantes regionales AR/MX/ES/etc.) ──
    'puta', 'puto', 'putita', 'putito', 'mierda', 'pendejo', 'pendeja',
    'cabron', 'cabrona', 'verga', 'chingada', 'chingado', 'chingar',
    'culero', 'culera', 'maricon', 'marica', 'joto', 'panocha', 'concha',
    'gilipollas', 'subnormal', 'retrasado', 'retrasada', 'imbecil',
    'zorra', 'perra', 'mamaguevo', 'mamahuevo', 'malparido', 'malparida',
    'hijueputa', 'hijodeputa', 'hijoputa', 'pelotudo', 'pelotuda',
    'forro', 'pajero', 'pajera', 'cogelona', 'cogelon', 'cojudo', 'cojuda',
    'putazo', 'chupapija', 'chupapito', 'negrodemierda',
  ];

  // Ofuscación básica: mapea sustituciones típicas de leetspeak/símbolos a
  // la letra que representan ANTES de tirar todo lo que no sea a-z0-9, así
  // "p3nd3j0" o "sh1t" también matchean.
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
  // Solo los caracteres especiales de regex necesitan backslash acá (\$ \| \!)
  // — escapar también los dígitos los rompe (\0/\1/\3.. son escapes de
  // octal/backreference dentro de una clase de caracteres, no el dígito literal).
  const LEET_RE = new RegExp('[' + Object.keys(LEET).map((k) => /[a-z0-9]/i.test(k) ? k : '\\' + k).join('') + ']', 'g');

  // Marcas diacríticas combinantes (lo que separa NFD de una vocal con
  // tilde) — mismo patrón que normalize() en globequiz.js, armado con
  // fromCharCode en vez de un literal ̀-ͯ para evitar que el
  // rango se guarde como caracteres Unicode crudos en el archivo.
  const DIACRITICS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

  function normalize(s) {
    let t = String(s || '').normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();
    t = t.replace(LEET_RE, (c) => LEET[c] || c);
    return t.replace(/[^a-z0-9]/g, '');
  }

  function containsBadWord(str) {
    const norm = normalize(str);
    if (!norm) return false;
    return WORDS.some((w) => norm.includes(w));
  }

  window.containsBadWord = containsBadWord;
})();
