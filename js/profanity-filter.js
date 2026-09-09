// ── PROFANITY FILTER (username / player name) ────────────────────────────────
// Blocks slurs/explicit language in English and Spanish (with regional
// variants) when choosing a username or guest name. Not exhaustive or perfect —
// no list-based filter is (there are always false negatives with creative
// obfuscation, and some false positives possible with legit words containing
// one of these as a substring) — but it covers the normal case: someone typing
// the word directly, with uppercase/accents/simple leetspeak (0->o, 1->i, 3->e,
// etc.) in the mix.
//
// Public API: window.containsBadWord(str) -> boolean
(function () {
  const WORDS = [
    // ── English ──
    'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick', 'pussy',
    'whore', 'slut', 'faggot', 'nigger', 'nigga', 'retard', 'cock', 'twat',
    'motherfucker', 'wanker', 'bollocks', 'douchebag', 'jackass', 'prick',
    'cumshot', 'blowjob', 'handjob', 'rapist',
    // ── Spanish (neutral + regional variants AR/MX/ES/etc.) ──
    'puta', 'puto', 'putita', 'putito', 'mierda', 'pendejo', 'pendeja',
    'cabron', 'cabrona', 'verga', 'chingada', 'chingado', 'chingar',
    'culero', 'culera', 'maricon', 'marica', 'joto', 'panocha', 'concha',
    'gilipollas', 'subnormal', 'retrasado', 'retrasada', 'imbecil',
    'zorra', 'perra', 'mamaguevo', 'mamahuevo', 'malparido', 'malparida',
    'hijueputa', 'hijodeputa', 'hijoputa', 'pelotudo', 'pelotuda',
    'forro', 'pajero', 'pajera', 'cogelona', 'cogelon', 'cojudo', 'cojuda',
    'putazo', 'chupapija', 'chupapito', 'negrodemierda',
  ];

  // Basic obfuscation: maps typical leetspeak/symbol substitutions to the
  // letter they represent BEFORE dropping everything non-a-z0-9, so "p3nd3j0"
  // or "sh1t" match too.
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
  // Only regex special characters need a backslash here (\$ \| \!) — escaping
  // the digits too breaks them (\0/\1/\3.. are octal/backreference escapes
  // inside a character class, not the literal digit).
  const LEET_RE = new RegExp('[' + Object.keys(LEET).map((k) => /[a-z0-9]/i.test(k) ? k : '\\' + k).join('') + ']', 'g');

  // Combining diacritical marks (what NFD splits off an accented vowel) — same
  // pattern as normalize() in globequiz.js, built with fromCharCode instead of
  // a literal range to avoid storing raw Unicode chars in the file.
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
