// ── RANKS ────────────────────────────────────────────────────────────────────

const RANKS = [
  // 0 – 11,999 (18 rangos, ~667 c/u)
  { min:     0, max:   935, name: 'Agorafóbico', desc: 'Parece que el mundo todavía te parece un lugar muy grande. ¡No te preocupes, con práctica irás perdiendo el miedo a explorarlo!', img: 'images/ranks/1.png'  },
  { min:   936, max:  1871, name: 'Explorador del Jardín', desc: 'Tu aventura geográfica está apenas comenzando. El mundo es grande, pero con cada paso que das lo vas conociendo un poco mejor.', img: 'images/ranks/2.png'  },
  { min:  1872, max:  2807, name: 'Colegial', desc: 'Estás aprendiendo los fundamentos del mundo. Con la misma dedicación que en el aula, pronto dominarás el mapa completo.', img: 'images/ranks/3.png'  },
  { min:  2808, max:  3743, name: 'Conductor de autobuses', desc: 'Conoces las rutas mejor que nadie. Aunque tu recorrido es local, tu curiosidad por el mundo te llevará mucho más lejos.', img: 'images/ranks/4.png'  },
  { min:  3744, max:  4499, name: 'Recepcionista de hotel', desc: 'Recibes viajeros de todo el mundo con una sonrisa. Tu conocimiento geográfico te ayuda a conectar con cada huésped que llega a tu mostrador.', img: 'images/ranks/5.png'  },
  { min:  4500, max:  5335, name: 'Maletero', desc: 'Cargas con el peso del mundo en tus manos, y lo haces bien. Cada maleta que mueves te lleva un paso más cerca de conocerlo todo.', img: 'images/ranks/6.png'  },
  { min:  5336, max:  6002, name: 'Tripulación de tierra', desc: 'Mantienes todo en movimiento desde el suelo. Tu conocimiento geográfico es la base que sostiene cada vuelo hacia nuevos destinos.', img: 'images/ranks/7.png'  },
  { min:  6003, max:  6669, name: 'Guia de ciudad', desc: 'Conoces las calles y rincones de las ciudades como pocos. ¡Cualquier turista estaría encantado de tenerte como guía!', img: 'images/ranks/8.png'  },
  { min:  5336, max:  6002, name: 'Estudiante de Geografía', desc: 'Estás en el buen camino. Cada país que aprendes te acerca más a dominar el mapa completo. ¡Sigue estudiando!', img: 'images/ranks/9.png'  },
  { min:  6003, max:  6669, name: 'Diplomado en Geografía', desc: 'Tu nivel geográfico ya es académico. Tienes el conocimiento de alguien que ha dedicado años al estudio del mundo. ¡Bien merecido!', img: 'images/ranks/10.png' },
  { min:  6670, max:  7336, name: 'Controlador aéreo', desc: 'Con tus paletas en mano guías cada avión a su sitio exacto. Tu sentido de orientación en la pista refleja lo que ya sabes del mundo entero.', img: 'images/ranks/11.png' },
  { min:  7337, max:  8003, name: 'Tripulación de cabina', desc: 'Te sientes más cómodo encontrando tu camino a traves de un avión en vez del mundo, pero tienes lo necesario para llegar lejos.', img: 'images/ranks/12.png' },
  { min:  8004, max:  8670, name: 'Agente de viajes', desc: 'Sabes planificar rutas por el mundo como nadie. ¡Tus clientes estarían en las mejores manos con alguien que conoce el planeta tan bien!', img: 'images/ranks/13.png' },
  { min:  8671, max:  9337, name: 'Explorador de parques', desc: 'Tu conocimiento geográfico te lleva más allá del parque local. ¡Ya estás listo para explorar territorios mucho más grandes!', img: 'images/ranks/14.png' },
  { min:  9338, max: 10004, name: 'Aventurero', desc: 'El espíritu explorador te define. Conoces suficiente del mundo para lanzarte a cualquier aventura sin miedo a perderte.', img: 'images/ranks/15.png' },
  { min: 10005, max: 10671, name: 'Presentador de noticias', desc: 'Conoces el mundo lo suficientemente bien como para informar sobre él con confianza. ¡Podrías hablar de cualquier país sin que se te trabe la lengua!', img: 'images/ranks/16.png' },
  { min: 10672, max: 11338, name: 'Viajero', desc: 'Has recorrido el mundo en tu mente con una precisión envidiable. ¡Con este nivel, cada viaje que hagas será una aventura bien planificada!', img: 'images/ranks/17.png' },
  { min: 11339, max: 11999, name: 'Miembro de la alta sociedad', desc: 'Tu refinado conocimiento del mundo te abre puertas en cualquier círculo. Conversas de geografía con la misma soltura que de arte o moda.', img: 'images/ranks/18.png' },

  // 12,000 – 24,999 (10 rangos, ~1300 c/u)
  { min: 12000, max: 13299, name: 'Hombre del tiempo', desc: 'Conoces el mundo tan bien que podrías predecir dónde sopla el viento. ¡Tu sentido de orientación global es digno de cualquier pantalla de noticias!', img: 'images/ranks/19.png' },
  { min: 13300, max: 14599, name: 'Profesor de Geografía', desc: 'Tu dominio geográfico es tan sólido que podrías enseñarle al mundo. ¡Más de uno aprendería mucho sentándose en tu clase!', img: 'images/ranks/20.png' },
  { min: 14600, max: 15899, name: 'Explorador', desc: 'Tu curiosidad por el mundo no tiene límites. Como un verdadero explorador, siempre encuentras nuevos territorios que conquistar en el mapa.', img: 'images/ranks/21.png' },
  { min: 15900, max: 17199, name: 'Marinero', desc: 'Navegas el conocimiento geográfico como un marinero los mares. Conoces las rutas del mundo mejor que muchos que lo han recorrido.', img: 'images/ranks/22.png' },
  { min: 17200, max: 18499, name: 'Trotamundos', desc: 'El mundo es tu hogar. Conoces tantos rincones del planeta que sería difícil encontrar un lugar que te sorprenda.', img: 'images/ranks/23.png' },
  { min: 18500, max: 19799, name: 'Rastreador', desc: 'Tu instinto geográfico te permite encontrar cualquier lugar en el mapa. ¡Podrías seguir la pista de cualquier destino sin perderte!', img: 'images/ranks/24.png' },
  { min: 19800, max: 21099, name: 'Aprendíz de Piloto', desc: 'Estás aprendiendo a navegar el mundo con destreza. Con un poco más de práctica, estarás listo para despegar hacia nuevos horizontes.', img: 'images/ranks/25.png' },
  { min: 21100, max: 22399, name: 'Topógrafo', desc: 'Captar puntos precisos geográficamente es muy importante para un topógrafo, y es exactamente lo que tú tienes.', img: 'images/ranks/26.png' },
  { min: 22400, max: 23699, name: 'Cartógrafo', desc: 'Podrías crear un mapa del mundo con solo tu memoria. ¡No hay muchas personas que puedan realizar eso!', img: 'images/ranks/27.png' },
  { min: 23700, max: 24999, name: 'Co-Piloto', desc: 'Estás a solo un paso del mando. Tu conocimiento geográfico ya es digno de los cielos, ¡sigue así y pronto liderarás la ruta!', img: 'images/ranks/28.png' },

  // 25,000 – 39,999 (3 rangos, ~5000 c/u)
  { min: 25000, max: 26499, name: 'Piloto de Aerolínea', desc: 'Los pilotos de aerolínea son extremadamente buenos viajeros con un excelente conocimiento del mundo alrededor de ellos, ¡Así como tú!', img: 'images/ranks/29.png' },
  { min: 26500, max: 27999, name: 'Escritor de Viajes', desc: 'Tu conocimiento del mundo sería suficiente para llenar páginas enteras. ¡Tendrías mucho que contar y el mundo estaría encantado de escucharte!', img: 'images/ranks/30.png' },
  { min: 28000, max: 39999, name: 'Corresponsal Extranjero', desc: 'Podrías ser alguien muy seguro de ti mismo para informar de eventos globales de cualquier país con tu conocimiento. Excelente trabajo.', img: 'images/ranks/31.png' },

  // 40,000 – 79,999 (3 rangos, ~13333 c/u)
  { min: 40000, max: 49999, name: 'Diplomático', desc: 'Con tu gran conocimiento de los países, podrías ser un excelente diplomático, capaz de identificarte con cualquiera en el mundo.', img: 'images/ranks/32.png' },
  { min: 50000, max: 59999, name: 'Embajador', desc: 'Tus conocimientos en geografía son un orgullo para tu país. ¡Estarías muy comodo trabajando en cualquier embajada en el mundo!', img: 'images/ranks/33.png' },
  { min: 60000, max: 79999, name: 'Gurú de la Geografía', desc: 'No hay muchas personas en el mundo que tengan un conocimiento global como el tuyo. ¡Deberías sentirte orgulloso!', img: 'images/ranks/34.png' },

  // 80,000+
  { min: 80000, max: Infinity, name: 'Superhumano', desc: '¡Tus habilidades en geografía están fuera de alcance! ¡Como si todo un atlas hubiera sido descargado directamente a tu cabeza!', img: 'images/ranks/35.png' },
];

function getRank(totalScore) {
  return RANKS.find(r => totalScore >= r.min && totalScore <= r.max) || RANKS[0];
}
