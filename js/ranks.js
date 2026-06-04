// ── RANKS ────────────────────────────────────────────────────────────────────

const RANKS = [
  // 0 – 11,999 (18 rangos, ~667 c/u)
  { min:     0, max:   666, name: 'Agorafóbico',             img: 'images/ranks/1.png'  },
  { min:   667, max:  1333, name: 'Explorador del Jardín',   img: 'images/ranks/2.png'  },
  { min:  1334, max:  2000, name: 'Colegial',                img: 'images/ranks/3.png'  },
  { min:  2001, max:  2667, name: 'Conductor de autobuses',  img: 'images/ranks/4.png'  },
  { min:  2668, max:  3334, name: 'Recepcionista de hotel',  img: 'images/ranks/5.png'  },
  { min:  3335, max:  4001, name: 'Maletero',                img: 'images/ranks/6.png'  },
  { min:  4002, max:  4668, name: 'Tripulación de tierra',   img: 'images/ranks/7.png'  },
  { min:  4669, max:  5335, name: 'Guia de ciudad',          img: 'images/ranks/8.png'  },
  { min:  5336, max:  6002, name: 'Estudiante de Geografía', img: 'images/ranks/9.png'  },
  { min:  6003, max:  6669, name: 'Diplomado en Geografía',  img: 'images/ranks/10.png' },
  { min:  6670, max:  7336, name: 'Controlador aéreo',       img: 'images/ranks/11.png' },
  { min:  7337, max:  8003, name: 'Tripulación de cabina',   img: 'images/ranks/12.png' },
  { min:  8004, max:  8670, name: 'Agente de viajes',        img: 'images/ranks/13.png' },
  { min:  8671, max:  9337, name: 'Explorador de parques',   img: 'images/ranks/14.png' },
  { min:  9338, max: 10004, name: 'Aventurero',              img: 'images/ranks/15.png' },
  { min: 10005, max: 10671, name: 'Presentador de noticias', img: 'images/ranks/16.png' },
  { min: 10672, max: 11338, name: 'Viajero',                 img: 'images/ranks/17.png' },
  { min: 11339, max: 11999, name: 'Miembro de la alta sociedad', img: 'images/ranks/18.png' },

  // 12,000 – 24,999 (10 rangos, ~1300 c/u)
  { min: 12000, max: 13299, name: 'Hombre del tiempo',       img: 'images/ranks/19.png' },
  { min: 13300, max: 14599, name: 'Profesor de Geografía',   img: 'images/ranks/20.png' },
  { min: 14600, max: 15899, name: 'Explorador',              img: 'images/ranks/21.png' },
  { min: 15900, max: 17199, name: 'Marinero',                img: 'images/ranks/22.png' },
  { min: 17200, max: 18499, name: 'Trotamundos',             img: 'images/ranks/23.png' },
  { min: 18500, max: 19799, name: 'Rastreador',              img: 'images/ranks/24.png' },
  { min: 19800, max: 21099, name: 'Aprendíz de Piloto',      img: 'images/ranks/25.png' },
  { min: 21100, max: 22399, name: 'Topógrafo',               img: 'images/ranks/26.png' },
  { min: 22400, max: 23699, name: 'Cartógrafo',              img: 'images/ranks/27.png' },
  { min: 23700, max: 24999, name: 'Co-Piloto',               img: 'images/ranks/28.png' },

  // 25,000 – 39,999 (3 rangos, ~5000 c/u)
  { min: 25000, max: 26499, name: 'Piloto de Aerolínea',     img: 'images/ranks/29.png' },
  { min: 26500, max: 27999, name: 'Escritor de Viajes',      img: 'images/ranks/30.png' },
  { min: 28000, max: 39999, name: 'Corresponsal Extranjero', img: 'images/ranks/31.png' },

  // 40,000 – 79,999 (3 rangos, ~13333 c/u)
  { min: 40000, max: 49999, name: 'Diplomático',             img: 'images/ranks/32.png' },
  { min: 50000, max: 59999, name: 'Embajador',               img: 'images/ranks/33.png' },
  { min: 60000, max: 79999, name: 'Gurú de la Geografía',    img: 'images/ranks/34.png' },

  // 80,000+
  { min: 80000, max: Infinity, name: 'Superhumano',          img: 'images/ranks/35.png' },
];

function getRank(totalScore) {
  return RANKS.find(r => totalScore >= r.min && totalScore <= r.max) || RANKS[0];
}
