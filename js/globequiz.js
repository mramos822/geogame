// ── GLOBEQUIZ: modo "país del día" con globo 3D low-poly ──────────────────────
// three.js se carga lazy (CDN) solo al entrar a esta pantalla. Render-on-demand
// (sin loop de rAF continuo): solo se re-renderiza al arrastrar o al pintar un
// país nuevo tras un guess, para no repetir el patrón que causó los crashes de
// GPU/IOSurface en iOS documentados en otras partes del proyecto.
(function () {
  const TEX_W = 4096, TEX_H = 2048;
  const OCEAN = '#5fb6e0';
  const LAND_DEFAULT = '#ecdfc0';
  const CORRECT_COLOR = '#008000';
  // Escala de calor lejos -> pegado al país, en ese orden exacto.
  const HEAT_STOPS = ['#fff7ec', '#feeed8', '#fddcb0', '#fdd29e', '#fdc993', '#fb9562', '#f67c52', '#ed6444', '#d93826', '#be120c', '#7f0000'];

  // Territorios que se marcan en el mapa junto con el país adivinado (no
  // suman un guess aparte, solo se pintan igual). Nombres = clave EN del
  // dataset a ambos lados.
  const LINKED_TERRITORIES = {
    'Argentina': ['Falkland Is.'],
  };

  let THREE = null;
  let scene, camera, renderer, sphere;
  let canvasTex, texCanvas, texCtx;
  let dragging = false, lastX = 0, lastY = 0;
  let downX = 0, downY = 0, moved = false;
  let lastMoveT = 0, velY = 0, inertiaId = null;
  let raycaster = null;
  let rotY = 0.4, rotX = -0.15;
  // Enfoque default: medio del océano Atlántico (~35°O, 15°N), calculado con
  // la misma fórmula que focusOnCountry (Ry primero, Rx después).
  const BASE_ROT_X = 0.262, BASE_ROT_Y = -0.960;
  let autoRotateId = null;
  // Límites de zoom. El visor (.gq-globe-wrap) ahora recorta en círculo
  // (border-radius:50%), así que aunque la esfera desborde el cuadro del
  // canvas al acercarse mucho, lo único visible sigue siendo un círculo —
  // MIN_Z puede bajar bastante sin que se pierda la silueta esférica.
  let zoomZ = 3.0;
  const MIN_Z = 1.3, MAX_Z = 6;
  const BASE_Z = 3.0, DRAG_SENSITIVITY = 0.005;
  // Límite de inclinación vertical al arrastrar. Antes era ±1.3 rad (~74.5°),
  // que dejaba el polo sur (y Antártida) siempre a ~15° del centro del
  // globo, nunca alcanzable arrastrando — se veía "recortado" en el borde y
  // parecía que Antártida no estaba dibujada. 1.55 rad (~88.8°) permite
  // llevar cualquiera de los dos polos casi al centro sin llegar a los 90°
  // exactos (ahí el yaw se vuelve puro giro sobre el propio polo, válido
  // pero mejor no aterrizar justo en el límite matemático).
  const ROT_X_LIMIT = 1.55;
  const activePointers = new Map();
  let pinchStartDist = 0, pinchStartZ = 0;
  let initialized = false;
  let resizeObs = null;
  let outlineGroup = null; // contorno negro vectorial de los países marcados (no pixela con el zoom)
  let focusAnimId = null;

  let countries = null;           // [{name, geometry, centroid}]
  let countryByName = new Map();  // normalizado -> country
  let dailyCountry = null;
  let guesses = [];               // [{name, km, dir, color}]
  let animatedGuessNames = new Set(); // filas que ya reprodujeron la animación de entrada
  let solved = false;

  function normalize(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function loadThree() {
    if (window.THREE) { THREE = window.THREE; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
      s.onload = () => { THREE = window.THREE; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Micro-territorios del Caribe demasiado oscuros/imposibles de adivinar a
  // ciegas (nadie ubica San Bartolomé de memoria) — se sacan del pool acá en
  // vez de tocar el geojson embebido, así el filtro queda en un solo lugar
  // legible. Los nombres son los del dataset EN (ver globequiz-countries-data.js).
  const EXCLUDED_COUNTRIES = new Set([
    'St-Barthélemy', 'St-Martin', 'Sint Maarten', 'Curaçao', 'Aruba',
    'Cayman Is.', 'Turks and Caicos Is.', 'British Virgin Is.', 'U.S. Virgin Is.',
  ]);

  function loadCountries() {
    if (countries) return Promise.resolve(countries);
    // Embebido como window.GQ_COUNTRIES_DATA (ver js/globequiz-countries-data.js)
    // en vez de fetch('data/countries.geo.json') — fetch() de un archivo local
    // no funciona abriendo el juego con file:// (bloqueado por CORS), solo con
    // un servidor. Un <script> normal sí carga bajo file://.
    const geo = window.GQ_COUNTRIES_DATA;
    return Promise.resolve().then(() => {
      countries = geo.features
        .filter(f => !EXCLUDED_COUNTRIES.has(f.properties.name))
        .map(f => {
          const mainPts = mainRing(f.geometry);
          return {
            name: f.properties.name,
            iso2: f.properties.iso2 || null,
            geometry: f.geometry,
            centroid: computeCentroid(f.geometry),
            border: borderPoints(f.geometry),
            mainRingPts: mainPts, // territorio principal, sin exclaves — ver focusOnCountry
            area: Math.abs(ringArea(mainPts)), // ver countryAtLonLat: desambigua superposiciones (Marruecos/Sahara Occ.)
          };
        });
      countries.forEach(c => {
        countryByName.set(normalize(c.name), c);
        const es = window.GQ_NAMES_ES && window.GQ_NAMES_ES[c.name];
        if (es) countryByName.set(normalize(es), c);
      });
      // Abreviaciones/alias (USA, UK, EEUU...) -> resuelven al país ya
      // indexado por su nombre canónico EN.
      const abbrevs = window.GQ_ABBREVIATIONS || {};
      Object.keys(abbrevs).forEach(abbr => {
        const c = countryByName.get(normalize(abbrevs[abbr]));
        if (c) countryByName.set(normalize(abbr), c);
      });
      return countries;
    });
  }

  // Nombre a mostrar según el idioma actual (ES si hay traducción, si no
  // cae al nombre EN del dataset).
  function displayName(country) {
    const lang = typeof window.getLang === 'function' ? window.getLang() : 'es';
    if (lang === 'es' && window.GQ_NAMES_ES && window.GQ_NAMES_ES[country.name]) {
      return window.GQ_NAMES_ES[country.name];
    }
    return country.name;
  }

  // Distancia de edición (Levenshtein) para sugerir "¿quisiste decir X?"
  // cuando el guess no matchea nada exacto (typos tipo "boilvia").
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        curr[j] = a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
      [prev, curr] = [curr, prev];
    }
    return prev[n];
  }

  // Busca el país cuyo nombre (EN o ES) esté más cerca del texto tipeado,
  // dentro de una tolerancia proporcional al largo (más permisivo con
  // nombres largos, más estricto con cortos, para no sugerir cualquier cosa).
  function findSuggestion(norm) {
    let best = null, bestDist = Infinity;
    countries.forEach(c => {
      const candidates = [c.name, window.GQ_NAMES_ES && window.GQ_NAMES_ES[c.name]].filter(Boolean);
      candidates.forEach(nm => {
        const n2 = normalize(nm);
        const threshold = Math.max(1, Math.floor(n2.length * 0.3));
        const dist = levenshtein(norm, n2);
        if (dist <= threshold && dist < bestDist) { bestDist = dist; best = c; }
      });
    });
    return best;
  }

  // Área con signo (fórmula del shoelace) de un anillo, en grados² — solo
  // sirve para COMPARAR tamaños entre anillos, no como área real.
  function ringArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      area += x1 * y2 - x2 * y1;
    }
    return area / 2;
  }

  // Anillo exterior más grande de la geometría. Para países con exclaves
  // (EE.UU. con Alaska/Hawaii, Francia con territorios de ultramar, etc.,
  // que llegan como MultiPolygon) esto identifica el territorio PRINCIPAL,
  // usado tanto para el centroide como para calcular cuánto zoom hace falta
  // para que el país entre completo en cuadro (focusOnCountry) — ignorando
  // los exclaves en ambos casos.
  function mainRing(geometry) {
    const polyList = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let best = polyList[0][0], bestArea = -1;
    polyList.forEach(rings => {
      const area = Math.abs(ringArea(rings[0]));
      if (area > bestArea) { bestArea = area; best = rings[0]; }
    });
    return best;
  }

  // Centroide (ponderado por área, no promedio simple de vértices) del
  // anillo principal — ver mainRing().
  function computeCentroid(geometry) {
    const ring = mainRing(geometry);
    let cx = 0, cy = 0, a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      const cross = x1 * y2 - x2 * y1;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
      a += cross;
    }
    a /= 2;
    if (a === 0) {
      // Anillo degenerado (área 0, ej. una línea) — cae a promedio simple.
      let sx = 0, sy = 0, n = 0;
      ring.forEach(([lon, lat]) => { sx += lon; sy += lat; n++; });
      return [sx / n, sy / n];
    }
    return [cx / (6 * a), cy / (6 * a)];
  }

  // Puntos de frontera para el cálculo de distancia (no para el dibujo, que
  // usa la geometría completa). Con el mapa de mayor detalle (Natural Earth
  // 50m) países como Canadá/Rusia tienen miles de puntos — comparar todos
  // contra todos sería carísimo (decenas de millones de pares). Se
  // submuestrea parejo a un máximo por país, más que suficiente para una
  // distancia borde-a-borde aproximada en un juego de adivinar.
  // 300x300 = 90.000 comparaciones en el peor caso, sigue siendo instantáneo
  // (medido: <50ms incluso Canadá-Rusia) — 80 era demasiado poco: con países
  // grandes downsampleados tan agresivo, el punto donde DOS fronteras
  // realmente se tocan podía caer justo entre dos muestras y la distancia
  // mínima detectada terminaba dando "8km" o "2km" en vez de 0.
  const MAX_BORDER_PTS = 300;
  // Solo el territorio PRINCIPAL (mismo criterio que mainRing/centroide) —
  // los exclaves/islas lejanas (ej. Alaska/Hawaii de EE.UU., territorios de
  // ultramar) quedaban contando para la distancia mínima, y por estar tan
  // lejos del "país real" daban falsos "muy cerca"/confundían mucho la
  // pista de a qué país se está más cerca.
  function borderPoints(geometry) {
    const all = mainRing(geometry);
    if (all.length <= MAX_BORDER_PTS) return all;
    const step = all.length / MAX_BORDER_PTS;
    const out = [];
    for (let i = 0; i < MAX_BORDER_PTS; i++) out.push(all[Math.floor(i * step)]);
    return out;
  }

  // Un guess "pegado" (0km) requiere que dos muestras caigan justo en el
  // mismo punto exacto, algo que el submuestreo casi nunca garantiza incluso
  // con más puntos. Un umbral chico (ruido de simplificación de las líneas
  // de frontera entre datasets independientes) redondea eso a 0/adyacente —
  // PERO tiene que ser chico de verdad: 25km (versión anterior) llegaba a
  // marcar a Rusia como "pegada" a Japón, que solo están cerca por un
  // estrecho (Kuriles-Hokkaido, ~20km de agua) y NO comparten frontera
  // terrestre. 3km cubre el ruido de simplificación sin colar estrechos
  // marítimos reales.
  const TOUCHING_TOLERANCE_KM = 3;

  // Distancia mínima entre las fronteras de dos países (borde más cercano a
  // borde más cercano), no entre sus centros — así países grandes y vecinos
  // (ej. Rusia-China) dan "muy cerca" aunque sus centroides estén lejos.
  function minBorderDistance(a, b) {
    let min = Infinity;
    for (const pa of a.border) {
      for (const pb of b.border) {
        const d = haversine(pa, pb);
        if (d < min) min = d;
        if (min === 0) return 0;
      }
    }
    return min < TOUCHING_TOLERANCE_KM ? 0 : min;
  }

  function haversine([lon1, lat1], [lon2, lat2]) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function bearing([lon1, lat1], [lon2, lat2]) {
    const toRad = d => d * Math.PI / 180, toDeg = r => r * 180 / Math.PI;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function bearingArrow(deg) {
    const dirs = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
    return dirs[Math.round(deg / 45) % 8];
  }

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function lerpColor(c1, c2, t) {
    const a = hexToRgb(c1), b = hexToRgb(c2);
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }
  // El rojo más fuerte (última parada, #7f0000) queda reservado para el país
  // que realmente toca frontera con el correcto (km===0). Cualquier otro
  // guess, por más cerca que esté, no pasa de la anteúltima parada (#be120c).
  // Escala recalibrada: contra MAX_KM (mitad de circunferencia, ~20015km)
  // en lineal, casi ningún guess real llegaba a verse "caliente" — la
  // enorme mayoría de los países del mundo están a menos de esa distancia,
  // así que todo quedaba apelmazado en el extremo frío/pálido de la escala
  // (de ahí la confusión). COLOR_MAX_KM usa una distancia de referencia más
  // realista, y la curva (pow 0.55) empuja más contraste hacia el rango
  // cercano, que es el que de verdad importa para saber si vas mejorando.
  const COLOR_MAX_KM = 12000;
  function distColor(km) {
    if (km <= 0) return HEAT_STOPS[HEAT_STOPS.length - 1];
    const capped = HEAT_STOPS.slice(0, -1);
    let t = Math.max(0, Math.min(1, 1 - km / COLOR_MAX_KM));
    t = Math.pow(t, 0.55);
    const segs = capped.length - 1;
    const pos = t * segs;
    const i = Math.min(segs - 1, Math.floor(pos));
    return lerpColor(capped[i], capped[i + 1], pos - i);
  }

  function lonLatToXY(lon, lat) {
    return [(lon + 180) / 360 * TEX_W, (90 - lat) / 180 * TEX_H];
  }

  // Misma proyección que lonLatToXY pero llevada a un punto 3D sobre la
  // esfera (radio r), derivada de la fórmula UV real de THREE.SphereGeometry
  // (uv = (u, 1-v), con phi=u*2π, theta=v*π) para que quede alineada con la
  // textura. Se usa tanto para el contorno vectorial como para centrar la
  // cámara en un país.
  function lonLatTo3D(lon, lat, r) {
    const theta = (90 - lat) * Math.PI / 180;
    const phi = (lon + 180) * Math.PI / 180;
    return {
      x: -r * Math.cos(phi) * Math.sin(theta),
      y: r * Math.cos(theta),
      z: r * Math.sin(phi) * Math.sin(theta),
    };
  }

  // Inversa de lonLatTo3D: de un punto 3D unitario (local, sin rotación de
  // la esfera) a lon/lat — se usa para saber qué país tocaste al clickear.
  function xyzToLonLat(x, y, z) {
    const theta = Math.acos(Math.max(-1, Math.min(1, y)));
    const phi = Math.atan2(z, -x);
    const lat = 90 - theta * 180 / Math.PI;
    let lon = phi * 180 / Math.PI - 180;
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;
    return [lon, lat];
  }

  // Point-in-polygon (ray casting) en coordenadas lon/lat. Aproximado (no
  // maneja el antimeridiano especialmente) pero de sobra para saber en qué
  // país cayó un click.
  function pointInRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function pointInGeometry(lon, lat, geometry) {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const rings of polys) {
      if (!pointInRing(lon, lat, rings[0])) continue;
      let inHole = false;
      for (let k = 1; k < rings.length; k++) {
        if (pointInRing(lon, lat, rings[k])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  // Algunos países del dataset se superponen en el dibujo (ej. Marruecos
  // dibuja su territorio incluyendo el área del Sahara Occidental, que
  // también existe como país aparte) — un punto ahí matchea contra los dos.
  // En vez de quedarse con el primero que aparece en el array (arbitrario),
  // se prefiere el de MENOR área: el país más chico/específico es el que
  // realmente corresponde a ese pedazo de mapa.
  function countryAtLonLat(lon, lat) {
    let best = null;
    countries.forEach(c => {
      if (!pointInGeometry(lon, lat, c.geometry)) return;
      if (!best || c.area < best.area) best = c;
    });
    return best;
  }

  // Click (sin arrastrar) sobre el canvas: raycast contra la esfera, punto
  // 3D -> lon/lat -> país bajo el cursor, y centra la cámara ahí.
  function countryAtScreenPoint(clientX, clientY) {
    if (!renderer || !camera || !sphere || !countries) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    if (!raycaster) raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(sphere, false);
    if (!hits.length) return null;
    const local = sphere.worldToLocal(hits[0].point.clone());
    const [lon, lat] = xyzToLonLat(local.x, local.y, local.z);
    return countryAtLonLat(lon, lat);
  }

  function clickOnGlobe(clientX, clientY) {
    const country = countryAtScreenPoint(clientX, clientY);
    if (!country) return;
    // Solo centra la cámara en países YA adivinados (o el correcto, si ya se
    // ganó) — mismo criterio que updateHoverLabel. Sin este chequeo, tocar
    // CUALQUIER país del globo (aunque todavía no se haya escrito/confirmado
    // como guess) ya centraba la cámara ahí, dando la sensación de que el
    // juego "tipeaba" la respuesta solo.
    const isGuessed = (solved && country.name === dailyCountry.name) ||
      guesses.some(g => g.name === country.name);
    if (isGuessed) focusOnCountry(country);
  }

  // Reposiciona el label a las coordenadas del CURSOR (no a un punto fijo):
  // convierte el clientX/clientY de pantalla a coordenadas del stage de
  // diseño (1920x911, ver letterbox.js) usando el rect del propio screen,
  // que ya viene post-transform/escala — así el label sigue al mouse en
  // cualquier tamaño de ventana.
  function updateHoverLabel(clientX, clientY) {
    const el = document.getElementById('gq-hover-name');
    if (!el) return;
    const country = countryAtScreenPoint(clientX, clientY);
    // Solo se muestra si es un país YA escrito/adivinado (o el correcto, si
    // ya se ganó) — nada de spoilear nombres de países sin marcar.
    const isGuessed = country && (
      (solved && country.name === dailyCountry.name) ||
      guesses.some(g => g.name === country.name)
    );
    if (!isGuessed) { el.style.display = 'none'; return; }
    el.textContent = displayName(country);
    el.style.display = 'block';
    // Sigue al mouse: convierte clientX/Y (pantalla) a coordenadas del
    // stage de diseño (1920x911, ver letterbox.js) usando el rect del
    // propio screen, que ya viene post-transform/escala.
    const screenEl = document.getElementById('globequiz-screen');
    const rect = screenEl.getBoundingClientRect();
    const stageW = window.STAGE_W || 1920, stageH = window.STAGE_H || 911;
    const localX = (clientX - rect.left) / rect.width * stageW;
    const localY = (clientY - rect.top) / rect.height * stageH;
    el.style.left = localX + 'px';
    el.style.top = (localY + 20) + 'px'; // debajo del cursor
  }

  // Submuestreo de un anillo para el contorno vectorial (más generoso que el
  // usado para el cálculo de distancia: acá importa que se vea liso).
  const MAX_OUTLINE_PTS = 250;
  function downsampleRing(ring, maxPts) {
    if (ring.length <= maxPts) return ring;
    const step = ring.length / maxPts;
    const out = [];
    for (let i = 0; i < maxPts; i++) out.push(ring[Math.floor(i * step)]);
    return out;
  }

  function clearOutlines() {
    if (!outlineGroup) return;
    outlineGroup.children.slice().forEach(line => {
      outlineGroup.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    });
  }

  // Contorno negro dibujado como líneas 3D reales sobre la esfera (no
  // horneado en la textura de canvas) — así se ve nítido sin importar el
  // zoom, en vez de pixelarse como cualquier trazo raster.
  function addOutline(geometry) {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const mat = new THREE.LineBasicMaterial({ color: 0x000000 });
    polys.forEach(rings => {
      rings.forEach(ring => {
        const pts = downsampleRing(ring, MAX_OUTLINE_PTS)
          .map(([lon, lat]) => lonLatTo3D(lon, lat, 1.003));
        const geo = new THREE.BufferGeometry().setFromPoints(
          pts.map(p => new THREE.Vector3(p.x, p.y, p.z))
        );
        outlineGroup.add(new THREE.LineLoop(geo, mat));
      });
    });
  }

  function updateOutlines() {
    if (!outlineGroup) return;
    clearOutlines();
    if (solved) addOutline(dailyCountry.geometry);
    guesses.forEach(g => {
      const c = countryByName.get(normalize(g.name));
      if (c) addOutline(c.geometry);
      (LINKED_TERRITORIES[g.name] || []).forEach(linkedName => {
        const lc = countryByName.get(normalize(linkedName));
        if (lc) addOutline(lc.geometry);
      });
    });
  }

  function shortestAngleDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Anima la rotación de la esfera (para centrar el país) y, si hace falta,
  // también el zoom — así el jugador se ubica de un vistazo dónde cayó el
  // guess, sin tener que arrastrar/desplazar el zoom a mano.
  function animateCameraTo(targetX, targetY, targetZ, duration) {
    if (focusAnimId) cancelAnimationFrame(focusAnimId);
    const startX = sphere.rotation.x, startY = sphere.rotation.y, startZ = zoomZ;
    const dX = shortestAngleDelta(startX, targetX);
    const dY = shortestAngleDelta(startY, targetY);
    const dZ = targetZ - startZ;
    const t0 = performance.now();
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      sphere.rotation.x = startX + dX * ease;
      sphere.rotation.y = startY + dY * ease;
      zoomZ = startZ + dZ * ease;
      camera.position.z = zoomZ;
      updateSpaceVignette();
      render();
      focusAnimId = t < 1 ? requestAnimationFrame(step) : null;
    }
    focusAnimId = requestAnimationFrame(step);
  }

  // Con Euler order 'XYZ' (el default de Object3D), la matriz de rotación real
  // es Rx(x)·Ry(y) — es decir Ry se aplica PRIMERO al punto y Rx después.
  // (La primera versión de esto asumía el orden al revés — Rx primero, Ry
  // después — por eso a veces apuntaba mal o salía espejado: para la mayoría
  // de los puntos esa suposición da un ángulo distinto al real.)
  //
  // Distancia de cámara necesaria para que un punto a ángulo θ (radianes,
  // sobre la esfera unitaria) del centro de encuadre quede a lo sumo a
  // TARGET_HALF_FOV del eje de vista — derivado de tan(α) = sinθ/(d-cosθ)
  // despejando d, con d = cosθ + sinθ/tan(α). TARGET_HALF_FOV usa un margen
  // (no el medio-FOV real de 22.5°) para que el país no quede pegado al
  // borde del visor circular.
  const TARGET_HALF_FOV = 26 * Math.PI / 180;
  function zoomToFitAngle(theta) {
    return Math.cos(theta) + Math.sin(theta) / Math.tan(TARGET_HALF_FOV);
  }
  // Piso de zoom PROPIO del auto-encuadre (más lejos que MIN_Z, el límite
  // del zoom manual con rueda/pinch) — países muy chicos (Vaticano, Mónaco)
  // igual no deben acercar tanto como permite el zoom manual, se sentía
  // "muchísimo" zoom de golpe al marcarlos.
  const AUTO_FIT_MIN_Z = 2.3;

  function focusOnCountry(country) {
    if (!sphere || !country) return;
    const [lon, lat] = country.centroid;
    const p = lonLatTo3D(lon, lat, 1);
    const r1 = Math.sqrt(p.x * p.x + p.z * p.z);
    const targetRotY = Math.atan2(-p.x, p.z);
    const targetRotX = Math.atan2(p.y, r1);

    // Radio angular del país (territorio principal, sin exclaves — mismo
    // criterio que el centroide) respecto a su propio centro: el mayor
    // ángulo entre el centroide y cualquier punto de su frontera principal.
    const centroidDir = p; // ya es unitario
    let maxTheta = 0;
    country.mainRingPts.forEach(([plon, plat]) => {
      const q = lonLatTo3D(plon, plat, 1);
      const dot = Math.max(-1, Math.min(1, centroidDir.x * q.x + centroidDir.y * q.y + centroidDir.z * q.z));
      const theta = Math.acos(dot);
      if (theta > maxTheta) maxTheta = theta;
    });
    // Siempre encuadra al tamaño real del país: aleja si es grande y no
    // entraba (ej. Rusia con mucho zoom in), y ACERCA si es chico (ej.
    // Vaticano/Singapur), para que no quede como un puntito perdido si
    // veníamos de mirar un país grande. clampZoom ya pone un piso (MIN_Z)
    // para no acercar de más en países minúsculos.
    const targetZ = Math.max(AUTO_FIT_MIN_Z, clampZoom(zoomToFitAngle(maxTheta)));

    animateCameraTo(targetRotX, targetRotY, targetZ, 450);
  }

  function addGeometryToPath(geometry) {
    const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    polys.forEach(rings => {
      rings.forEach(ring => {
        ring.forEach(([lon, lat], i) => {
          const [x, y] = lonLatToXY(lon, lat);
          if (i === 0) texCtx.moveTo(x, y); else texCtx.lineTo(x, y);
        });
        texCtx.closePath();
      });
    });
  }

  function paintGeometry(geometry, fill, stroke) {
    texCtx.beginPath();
    addGeometryToPath(geometry);
    texCtx.fillStyle = fill;
    texCtx.fill('evenodd');
    if (stroke) {
      texCtx.strokeStyle = stroke;
      texCtx.lineWidth = 1.5;
      texCtx.stroke();
    }
  }

  function drawTexture() {
    // texCtx recién existe si initThreeScene() corrió (ver Promise.all en
    // initGlobeQuiz) — si el globo 3D no pudo cargar, submitGuess() igual
    // se ejecuta (input/confirm ahora andan siempre) y esto se llama sin
    // globo; sin este guard tiraba un TypeError acá y cortaba la función
    // antes de llegar a renderGuessList()/updateHint(), o sea el jugador
    // seguía sin ver ningún feedback al confirmar.
    if (!texCtx) return;
    texCtx.fillStyle = OCEAN;
    texCtx.fillRect(0, 0, TEX_W, TEX_H);

    // Toda la tierra default va en UN solo path/fill: al ser un solo trazo
    // continuo no queda ninguna costura entre países vecinos (ni hace falta
    // "engordar" cada uno con un stroke propio para taparla, que era lo que
    // se veía raro/inflado). Los países marcados se pintan aparte, encima.
    const marked = new Map();
    if (solved) marked.set(dailyCountry.name, CORRECT_COLOR);
    guesses.forEach(g => {
      marked.set(g.name, g.color);
      (LINKED_TERRITORIES[g.name] || []).forEach(linked => marked.set(linked, g.color));
    });

    texCtx.beginPath();
    countries.forEach(c => { if (!marked.has(c.name)) addGeometryToPath(c.geometry); });
    texCtx.fillStyle = LAND_DEFAULT;
    texCtx.fill('evenodd');

    countries.forEach(c => {
      const color = marked.get(c.name);
      // Stroke del mismo color que el relleno: solo sella la costura
      // antialiaseada del canvas contra el mapa base, no es el contorno
      // visible (ese ahora es la línea vectorial 3D, ver updateOutlines,
      // que no pixela con el zoom).
      if (color) paintGeometry(c.geometry, color, color);
    });
    if (canvasTex) { canvasTex.needsUpdate = true; }
    updateOutlines();
    render();
  }

  function render() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    // opacity>0 solo pasado BASE_Z de zoom (ver updateSpaceVignette) — en
    // zoom normal/cerca (la mayor parte de una partida) esto se saltea el
    // render pass entero de la segunda escena, no solo lo esconde con CSS.
    if (starRenderer && starGroup && sphere && starMaterial && starMaterial.opacity > 0) {
      starGroup.rotation.x = sphere.rotation.x;
      starGroup.rotation.y = sphere.rotation.y;
      starRenderer.render(starScene, starCamera);
    }
  }

  // Rotación automática lenta mientras el jugador todavía no hizo ningún
  // guess (para orientarlo/mostrar el globo) — única excepción al
  // render-on-demand del resto del módulo, y se corta sola apenas hay un
  // primer guess o el jugador arrastra a mano.
  // rad por update (ver AUTO_ROTATE_FRAME_MS más abajo: ahora corre a ~15
  // updates/seg en vez de los 60 nativos de rAF, así que el incremento sube
  // ~4x para mantener la misma velocidad angular real que antes).
  const AUTO_ROTATE_SPEED = 0.0028;
  // ~15fps en vez de los 60fps de rAF crudo: sigue viéndose fluido girando
  // despacio, pero la GPU deja de estar "siempre activa" en cada frame de
  // pantalla — una laptop con GPU dedicada notaba la actividad constante y
  // la prendía. Basado en tiempo real (no en contar frames) para que la
  // velocidad de giro no dependa de la tasa de refresco del monitor.
  const AUTO_ROTATE_FRAME_MS = 66;
  function startAutoRotate() {
    stopAutoRotate();
    let lastT = 0;
    function step(t) {
      if (!sphere) return;
      if (t - lastT >= AUTO_ROTATE_FRAME_MS) {
        sphere.rotation.y += AUTO_ROTATE_SPEED;
        render();
        lastT = t;
      }
      autoRotateId = requestAnimationFrame(step);
    }
    autoRotateId = requestAnimationFrame(step);
  }
  function stopAutoRotate() {
    if (autoRotateId) cancelAnimationFrame(autoRotateId);
    autoRotateId = null;
  }

  // Inercia al soltar el globo después de arrastrarlo con fuerza: sigue
  // girando con la velocidad que traía y se va frenando de a poco (fricción
  // exponencial), en vez de cortarse en seco — el efecto "globo del canal
  // del clima de la Wii". Se corta sola cuando la velocidad es despreciable,
  // o si el jugador vuelve a agarrar el globo (ver pointerdown).
  const INERTIA_FRICTION = 0.9982; // por ms — más cerca de 1 = frena más despacio
  const INERTIA_MIN_VEL = 0.00002;
  function startInertia() {
    stopInertia();
    if (Math.abs(velY) < INERTIA_MIN_VEL) return;
    let v = velY;
    let lastT = performance.now();
    function step(t) {
      const dt = Math.min(48, t - lastT); // clamp por si hubo un frame lento/tab en background
      lastT = t;
      if (!sphere || Math.abs(v) < INERTIA_MIN_VEL) { inertiaId = null; return; }
      sphere.rotation.y += v * dt;
      render();
      v *= Math.pow(INERTIA_FRICTION, dt);
      inertiaId = requestAnimationFrame(step);
    }
    inertiaId = requestAnimationFrame(step);
  }
  function stopInertia() {
    if (inertiaId) cancelAnimationFrame(inertiaId);
    inertiaId = null;
  }

  // "3, 2, 1, GO" al entrar — MISMOS timings que PREGAME_STEPS (el
  // countdown real del juego, ver monuments.js), overlay propio (no
  // comparte #pregame-countdown con los demás modos para no interferir).
  const GQ_COUNTDOWN_STEPS = [
    { src: 'images/countdown/3.png', hold: 750, size: 46 },
    { src: 'images/countdown/2.png', hold: 750, size: 46 },
    { src: 'images/countdown/1.png', hold: 750, size: 46 },
    { src: 'images/countdown/go.png', hold: 950, size: 54 },
  ];
  let gqCountdownTimeout = null, gqCountdownAborted = false;
  let gqEndgameTimeout = null;
  function runGqPregameCountdown(onDone) {
    const wrap = document.getElementById('gq-pregame-countdown');
    const img = document.getElementById('gq-pregame-countdown-img');
    if (!wrap || !img) { onDone(); return; }
    gqCountdownAborted = false;
    wrap.style.display = 'flex';
    if (typeof sfxCountdown !== 'undefined') { sfxCountdown.currentTime = 0; sfxCountdown.play().catch(() => {}); }
    let step = 0;
    function showStep() {
      if (gqCountdownAborted) return; // se salió con power a mitad del 3-2-1
      if (step >= GQ_COUNTDOWN_STEPS.length) {
        wrap.style.display = 'none';
        onDone();
        return;
      }
      const s = GQ_COUNTDOWN_STEPS[step];
      img.style.width = s.size + 'cqmin';
      img.style.height = s.size + 'cqmin';
      img.src = s.src;
      img.classList.remove('gq-pop');
      void img.offsetWidth; // reinicia la animación en cada paso
      img.classList.add('gq-pop');
      step++;
      gqCountdownTimeout = setTimeout(showStep, s.hold);
    }
    showStep();
  }
  // Corta el 3-2-1-GO en seco (timeout pendiente + sonido + overlay) — se
  // llama al salir con power a mitad de la cuenta, para que no siga sonando
  // countdown.mp3 de fondo ni el onDone (que arranca gamemusic) dispare
  // después de haber vuelto al menú.
  function abortGqPregameCountdown() {
    gqCountdownAborted = true;
    if (gqCountdownTimeout) clearTimeout(gqCountdownTimeout);
    gqCountdownTimeout = null;
    if (typeof sfxCountdown !== 'undefined') { sfxCountdown.pause(); sfxCountdown.currentTime = 0; }
    const wrap = document.getElementById('gq-pregame-countdown');
    if (wrap) wrap.style.display = 'none';
  }
  window.stopGlobeQuizCountdown = abortGqPregameCountdown;
  window.stopGlobeQuizEndgameTimer = function () {
    if (gqEndgameTimeout) clearTimeout(gqEndgameTimeout);
    gqEndgameTimeout = null;
  };

  // Cuenta regresiva hasta la próxima medianoche LOCAL (mismo corte de día
  // que dateKey/gq_streak_last_date) — se muestra en el modal de fin de
  // partida cuando el jugador ya sumó (o re-jugó) la racha de hoy.
  let gqCountdownIntervalId = null;
  function msUntilNextLocalMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return next.getTime() - now.getTime();
  }
  function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    return h + ':' + m + ':' + s;
  }
  function stopGqEndgameCountdown() {
    if (gqCountdownIntervalId) clearInterval(gqCountdownIntervalId);
    gqCountdownIntervalId = null;
  }
  window.stopGlobeQuizEndgameCountdown = stopGqEndgameCountdown;
  function startGqEndgameCountdown() {
    stopGqEndgameCountdown();
    const el = document.getElementById('gq-endgame-countdown-val');
    if (!el) return;
    const tick = () => { el.textContent = formatCountdown(msUntilNextLocalMidnight()); };
    tick();
    gqCountdownIntervalId = setInterval(tick, 1000);
  }

  // Misma cuenta regresiva pero para el panel del MENÚ (loading-globequiz-*,
  // antes de entrar a jugar) — intervalo separado del de fin de partida
  // porque uno puede quedar visible sin el otro según la pantalla.
  let gqMenuCountdownIntervalId = null;
  window.startGlobeQuizMenuCountdown = function () {
    if (gqMenuCountdownIntervalId) clearInterval(gqMenuCountdownIntervalId);
    const el = document.getElementById('loading-globequiz-countdown-val');
    if (!el) return;
    const tick = () => { el.textContent = formatCountdown(msUntilNextLocalMidnight()); };
    tick();
    gqMenuCountdownIntervalId = setInterval(tick, 1000);
  };
  window.stopGlobeQuizMenuCountdown = function () {
    if (gqMenuCountdownIntervalId) clearInterval(gqMenuCountdownIntervalId);
    gqMenuCountdownIntervalId = null;
  };

  function clampZoom(z) {
    return Math.max(MIN_Z, Math.min(MAX_Z, z));
  }

  // Vignette "espacio" (ver .gq-space-vignette en style.css, fondo completo
  // detrás del globo Y de sky3.png): arranca a aparecer recién pasado el
  // zoom por defecto (BASE_Z) — con zoom normal o acercado queda en 0,
  // invisible — y llega a máxima oscuridad en MAX_Z. El radio transparente
  // (--gq-vig-core) sigue el radio REAL en pantalla de la esfera (proyección
  // en perspectiva, cámara a 45° de FOV) — con un radio aproximado a mano
  // (interpolación lineal) quedaba un anillo fino de sky3.png asomando entre
  // el borde del globo y el arranque del negro durante buena parte del zoom,
  // que es justo el "celeste bordeando el globo" que se veía.
  const CAMERA_HALF_FOV_RAD = (45 / 2) * Math.PI / 180; // mismo FOV que new THREE.PerspectiveCamera(45, ...)
  const VISOR_RADIUS_CQMIN = 36; // .gq-globe-wrap: 72cqmin de diámetro
  function sphereScreenRadiusCqmin(z) {
    // Ángulo entre el eje de la cámara y el punto donde la esfera (radio 1)
    // se ve de perfil, visto desde una cámara a distancia z: asin(r/d).
    const theta = Math.asin(Math.min(1, 1 / z));
    const frac = Math.tan(theta) / Math.tan(CAMERA_HALF_FOV_RAD);
    return frac * VISOR_RADIUS_CQMIN;
  }
  // --gq-vig-t/--gq-vig-core se setean en #globequiz-screen — de ahí los
  // hereda .gq-space-vignette (relleno negro, DOM/CSS) por custom property,
  // y también se usan acá para subir starMaterial.opacity (las estrellas,
  // ver initStarfield). t=0 en zoom por defecto/cerca, invisibles.
  function updateSpaceVignette() {
    const screenEl = document.getElementById('globequiz-screen');
    if (!screenEl) return;
    const t = Math.max(0, Math.min(1, (zoomZ - BASE_Z) / (MAX_Z - BASE_Z)));
    // -1cqmin de margen para que el negro arranque pegado al silueta real
    // del globo en vez de dejarle un pixel de aire.
    const core = Math.max(0, sphereScreenRadiusCqmin(zoomZ) - 1);
    screenEl.style.setProperty('--gq-vig-t', t.toFixed(3));
    screenEl.style.setProperty('--gq-vig-core', core.toFixed(2) + 'cqmin');
    if (starMaterial) starMaterial.opacity = t;
    // Las nebulosas se quedan bastante más tenues que las estrellas (0.35
    // tope, no 1) — son detalle de fondo, no el protagonista.
    nebulaMaterials.forEach(mat => { mat.opacity = t * 0.35; });
  }

  // Estrellas: escena de Three.js APARTE (canvas propio, #gq-starfield-
  // canvas, pantalla completa) — no cuelgan de `sphere` como en un intento
  // anterior, porque esa geometría vive DENTRO del canvas del globo, que
  // está recortado al círculo de 72cqmin (.gq-globe-wrap); nunca iba a poder
  // dibujar nada fuera de ese círculo. Acá la cámara queda fija en el CENTRO
  // del cascarón de puntos (radio STARFIELD_RADIUS) — a esa distancia todos
  // los puntos quedan siempre a la misma distancia de la cámara, y lo único
  // que hace falta para que giren en sync con el globo es copiar
  // sphere.rotation.x/y al objeto Points en cada frame (ver render()) — con
  // geometría 3D real, no un rotate()/rotateX/rotateY de CSS fingiendo
  // profundidad, y ahora sin el límite del círculo del visor.
  // Radio variable (no fijo) por estrella: como la cámara de esta escena
  // está fija en el centro exacto del cascarón, la distancia de cada punto
  // A LA CÁMARA es directamente su propio radio — con sizeAttenuation eso ya
  // alcanza para que las más "cercanas" (radio chico) se vean más grandes
  // que las "lejanas" (radio grande), sin necesitar un shader custom con
  // tamaño por vértice.
  const STARFIELD_RADIUS_MIN = 5;
  const STARFIELD_RADIUS_MAX = 9;
  const STARFIELD_COUNT = 300;
  let starScene = null, starCamera = null, starRenderer = null, starPoints = null, starGroup = null;
  let starMaterial = null;
  const nebulaMaterials = [];

  // Sprite circular horneado en un canvas chico (radial gradient blanco ->
  // transparente) — sin esto, THREE.PointsMaterial dibuja cada punto como un
  // cuadrado sólido (el quad de la sprite por defecto, sin textura).
  function buildStarSpriteTexture() {
    const SIZE = 32;
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.95)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, SIZE, SIZE);
    return new THREE.CanvasTexture(c);
  }

  // Nebulosa: SIN mucho detalle a propósito (nada de formas/nubes
  // complejas) — un puñado de manchas de color suaves y grandes,
  // superpuestas, cada una un radial-gradient que se apaga a transparente.
  // Con blending aditivo (ver nebulaMaterial) se ve como un resplandor de
  // gas, no como una textura "pintada". `colors` parametrizable para poder
  // instanciar varias nebulosas con paletas distintas (ver initStarfield).
  function buildNebulaTexture(colors) {
    const SIZE = 256;
    const c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext('2d');
    function blob(cx, cy, r, color) {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    colors.forEach(([cx, cy, r, color]) => blob(SIZE * cx, SIZE * cy, SIZE * r, color));
    return new THREE.CanvasTexture(c);
  }

  function initStarfield() {
    const canvas = document.getElementById('gq-starfield-canvas');
    if (!canvas) return;
    starScene = new THREE.Scene();
    starCamera = new THREE.PerspectiveCamera(60, 1, 0.1, STARFIELD_RADIUS_MAX * 2);
    starCamera.position.set(0, 0, 0);
    // antialias:false — el sprite ya viene suavizado (gradient del canvas de
    // buildStarSpriteTexture), no hace falta MSAA para 300 puntos chicos, y
    // en un canvas de pantalla completa era el gasto más grande de esta capa.
    starRenderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    // Capada a 1 (no devicePixelRatio) por la misma razón: son puntos
    // borrosos de fondo, no necesitan nitidez retina, y renderizar a 2x en
    // pantalla completa es 4x los píxeles por frame.
    starRenderer.setPixelRatio(1);

    // Puntos uniformes sobre la esfera (Marsaglia, normalizando un vector
    // random dentro de la esfera unitaria) — con lat/lon random los puntos
    // se apelmazan en los polos, se nota como dos "manchas" de estrellas.
    // Radio (= distancia a la cámara, ver arriba) y brillo por punto son
    // random e INDEPENDIENTES entre sí: unas quedan grandes Y opacas, otras
    // chicas Y tenues, pero también combinaciones cruzadas — da más variedad
    // que si tamaño y brillo fueran siempre de la mano.
    const positions = new Float32Array(STARFIELD_COUNT * 3);
    const colors = new Float32Array(STARFIELD_COUNT * 3);
    for (let i = 0; i < STARFIELD_COUNT; i++) {
      let x, y, z, d2;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        d2 = x * x + y * y + z * z;
      } while (d2 === 0 || d2 > 1);
      const dist = STARFIELD_RADIUS_MIN + Math.random() * (STARFIELD_RADIUS_MAX - STARFIELD_RADIUS_MIN);
      const inv = dist / Math.sqrt(d2);
      positions[i * 3] = x * inv;
      positions[i * 3 + 1] = y * inv;
      positions[i * 3 + 2] = z * inv;
      // Piso alto (0.6) para que la mayoría se vea bien blanca, con algo de
      // variación (hasta 1.0) para que no todas tengan el mismo brillo/glow.
      const brightness = 0.6 + Math.random() * 0.4;
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starMaterial = new THREE.PointsMaterial({
      size: 0.05, // antes 0.11, quedaban grandes
      sizeAttenuation: true, // junto con el radio variable de arriba, esto es lo que las hace ver "más cerca/lejos"
      map: buildStarSpriteTexture(),
      transparent: true,
      vertexColors: true, // brillo por punto (ver colors arriba), da profundidad
      depthWrite: false,
      opacity: 0, // arranca invisible, updateSpaceVignette lo sube con el zoom
    });
    starPoints = new THREE.Points(geo, starMaterial);

    // Sprites de nebulosa: billboard (siempre de frente a la cámara,
    // comportamiento nativo de THREE.Sprite), repartidos por el cascarón
    // para que no tapen al globo cuando está centrado. Blending aditivo (se
    // suma a lo que ya está dibujado, no lo tapa) para que se vean como un
    // resplandor de gas y no como un parche opaco. Dos nebulosas con
    // paletas distintas — no una sola — para que se sienta más como el
    // espacio de verdad y no un único adorno repetido.
    const NEBULAE = [
      { lon: -40, lat: 25, scale: 13, colors: [
        [0.4, 0.45, 0.5, 'rgba(150,90,220,0.55)'],  // violeta
        [0.62, 0.55, 0.42, 'rgba(60,170,200,0.4)'], // teal
        [0.5, 0.3, 0.3, 'rgba(230,110,180,0.3)'],   // magenta, da más riqueza
      ] },
      { lon: 100, lat: -18, scale: 10, colors: [
        [0.45, 0.5, 0.46, 'rgba(80,120,230,0.45)'],  // azul
        [0.6, 0.4, 0.36, 'rgba(230,140,70,0.3)'],    // ámbar, contraste con la primera
      ] },
    ];
    const nebulaSprites = NEBULAE.map(n => {
      const mat = new THREE.SpriteMaterial({
        map: buildNebulaTexture(n.colors),
        transparent: true,
        opacity: 0, // arranca invisible, updateSpaceVignette lo sube con el zoom
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      nebulaMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(n.scale, n.scale, 1);
      const pos = lonLatTo3D(n.lon, n.lat, 7); // fija en el cascarón, gira junto con las estrellas/el globo
      sprite.position.set(pos.x, pos.y, pos.z);
      return sprite;
    });

    // Grupo: rota como una sola unidad (ver render()), estrellas/nebulosas
    // siempre en sync entre sí y con la rotación real del globo.
    starGroup = new THREE.Group();
    starGroup.add(starPoints);
    nebulaSprites.forEach(s => starGroup.add(s));
    starScene.add(starGroup);

    fitStarfieldCanvas();
    if (window.ResizeObserver) {
      new ResizeObserver(() => fitStarfieldCanvas()).observe(document.getElementById('globequiz-screen'));
    }
  }
  function fitStarfieldCanvas() {
    const screenEl = document.getElementById('globequiz-screen');
    if (!screenEl || !starRenderer || !starCamera) return;
    const rect = screenEl.getBoundingClientRect();
    // pixelRatio fijo en 1, seteado una vez en initStarfield — no hace falta
    // volver a pisarlo acá en cada resize.
    starRenderer.setSize(rect.width, rect.height, false);
    starCamera.aspect = rect.width / Math.max(1, rect.height);
    starCamera.updateProjectionMatrix();
  }

  function pinchDistance() {
    const pts = Array.from(activePointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function fitCanvas() {
    const wrap = document.querySelector('.gq-globe-wrap');
    const canvas = document.getElementById('gq-canvas');
    if (!wrap || !canvas || !renderer) return;
    const rect = wrap.getBoundingClientRect();
    // Forzamos un área cuadrada (el menor de ambos lados) sin importar si el
    // contenedor terminó midiendo distinto por algún redondeo/layout — así la
    // cámara siempre queda a aspect 1:1 y el globo nunca sale ovalado.
    const side = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(side, side, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    render();
  }

  function initThreeScene() {
    initStarfield();
    const canvas = document.getElementById('gq-canvas');
    texCanvas = document.createElement('canvas');
    texCanvas.width = TEX_W; texCanvas.height = TEX_H;
    texCtx = texCanvas.getContext('2d');

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    // z=2.5 dejaba el radio de la esfera (1) apenas AFUERA del frustum (ángulo
    // subtendido 23.6° > medio-FOV 22.5°), recortando el globo en los bordes.
    // z=3.0 baja el ángulo a ~19.5° (vs 22.5° de medio-FOV): el globo llena
    // más el cuadro que con z=3.4 pero sigue con margen de sobra.
    camera.position.z = zoomZ;

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });

    canvasTex = new THREE.CanvasTexture(texCanvas);
    canvasTex.colorSpace = THREE.SRGBColorSpace || canvasTex.colorSpace;
    canvasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    canvasTex.minFilter = THREE.LinearMipmapLinearFilter;
    canvasTex.magFilter = THREE.LinearFilter;

    const geo = new THREE.SphereGeometry(1, 48, 32);
    const mat = new THREE.MeshBasicMaterial({ map: canvasTex });
    sphere = new THREE.Mesh(geo, mat);
    sphere.rotation.y = rotY;
    sphere.rotation.x = rotX;
    scene.add(sphere);

    outlineGroup = new THREE.Group();
    sphere.add(outlineGroup);

    fitCanvas();

    canvas.addEventListener('pointerdown', (e) => {
      // La rotación automática sigue corriendo aunque arrastres/zoomees —
      // solo se corta con el primer guess (ver submitGuess).
      stopInertia(); // agarrar el globo de nuevo corta cualquier giro que seguía por inercia
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (activePointers.size === 2) {
        dragging = false;
        pinchStartDist = pinchDistance();
        pinchStartZ = zoomZ;
      } else {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        downX = e.clientX; downY = e.clientY; moved = false;
        lastMoveT = performance.now(); velY = 0;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size === 2) {
        const dist = pinchDistance();
        if (pinchStartDist > 0) {
          zoomZ = clampZoom(pinchStartZ * (pinchStartDist / dist));
          camera.position.z = zoomZ;
          updateSpaceVignette();
        }
        render();
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) {
        moved = true;
        const hoverEl = document.getElementById('gq-hover-name');
        if (hoverEl) hoverEl.style.display = 'none';
      }
      // La sensibilidad del arrastre escala con el zoom: cerca (zoomZ chico)
      // el mismo desplazamiento en píxeles cubre muchos más grados de
      // superficie visible, así que sin este ajuste el globo giraba
      // "incontrolable" al acercar. Proporcional a zoomZ/BASE_Z (el zoom por
      // defecto), calibrado para sentirse igual que antes a esa distancia.
      const sens = DRAG_SENSITIVITY * (zoomZ / BASE_Z);
      const rotDeltaY = dx * sens;
      sphere.rotation.y += rotDeltaY;
      sphere.rotation.x = Math.max(-ROT_X_LIMIT, Math.min(ROT_X_LIMIT, sphere.rotation.x + dy * sens));
      render();
      // Velocidad angular reciente (rad/ms), para la inercia al soltar —
      // "reciente" porque un arrastre puede frenar justo antes de soltar
      // (no querés que herede la velocidad de hace 3 frames).
      const now = performance.now();
      const dt = now - lastMoveT;
      if (dt > 0) velY = rotDeltaY / dt;
      lastMoveT = now;
    });
    const endPointer = (e) => {
      const wasSingle = activePointers.size === 1;
      activePointers.delete(e.pointerId);
      const wasDragging = dragging;
      dragging = activePointers.size === 1;
      if (dragging) {
        const p = activePointers.values().next().value;
        lastX = p.x; lastY = p.y;
      }
      // Click real (sin arrastrar) sobre el globo: identifica el país bajo
      // el cursor y centra/zoomea la cámara ahí — la misma navegación que ya
      // tiene la lista de guesses, pero clickeando directo sobre el mapa.
      if (wasSingle && !moved) {
        clickOnGlobe(e.clientX, e.clientY);
      } else if (wasSingle && wasDragging) {
        // Soltaste después de arrastrar: si venías con velocidad, el globo
        // sigue girando "como loco" y frenándose de a poco (estilo el globo
        // del canal del clima de la Wii), no se corta en seco. Pero un
        // arrastre chiquito (apenas pasó el umbral de "moved") no debe
        // heredar inercia — solo giros con recorrido real.
        const dragDist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (dragDist > 25) startInertia();
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    // Hover (mouse sin botón apretado, no confundir con el drag de rotar):
    // muestra abajo el nombre del país bajo el cursor.
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons !== 0) return;
      updateHoverLabel(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerleave', () => {
      const el = document.getElementById('gq-hover-name');
      if (el) el.style.display = 'none';
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomZ = clampZoom(zoomZ + e.deltaY * 0.0025);
      camera.position.z = zoomZ;
      updateSpaceVignette();
      render();
      const hoverEl = document.getElementById('gq-hover-name');
      if (hoverEl) hoverEl.style.display = 'none';
    }, { passive: false });

    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(() => fitCanvas());
      resizeObs.observe(document.querySelector('.gq-globe-wrap'));
    }
  }

  // Cada entrada a la pantalla es una partida nueva (por ahora, sin
  // persistencia entre visitas ni país "del día" fijo).
  function loadState() {
    guesses = [];
    solved = false;
    animatedGuessNames = new Set();
  }

  function saveState() { /* sin persistencia por ahora */ }

  function pickDailyCountry() {
    const idx = Math.floor(Math.random() * countries.length);
    dailyCountry = countries[idx];
  }

  // Estilo "bar chart race": el guess más cercano (arriba) se ve más grande,
  // achicándose a medida que baja de posición. Al reordenar (nuevo guess más
  // cerca que uno viejo), las filas que YA estaban se animan con FLIP (First
  // Last Invert Play) desde su posición/tamaño anterior hasta el nuevo, en
  // vez de saltar de golpe — la "pasada" de una fila a otra.
  const RANK_SCALE_STEP = 0.07, RANK_SCALE_MIN = 0.62;
  function renderGuessList() {
    const list = document.getElementById('gq-guess-list');
    if (!list) return;

    const prevRects = new Map();
    list.querySelectorAll('.gq-guess-item').forEach(el => {
      prevRects.set(el.dataset.guessName, el.getBoundingClientRect());
    });

    list.innerHTML = '';
    const sorted = guesses.slice().sort((a, b) => a.km - b.km);
    const flippedRows = [];
    sorted.forEach((g, rank) => {
      const c = countryByName.get(normalize(g.name));
      const row = document.createElement('div');
      row.dataset.guessName = g.name;
      // Solo las filas realmente nuevas animan la entrada — las que ya
      // estaban puestas se re-renderizan (por el re-sort) sin repetirla acá,
      // pero sí hacen FLIP más abajo si cambiaron de posición/tamaño.
      const isNew = !animatedGuessNames.has(g.name);
      if (isNew) animatedGuessNames.add(g.name);
      row.className = 'gq-guess-item' + (isNew ? ' gq-item-new' : '');
      row.title = t('globequiz.clickToFocus');
      const scale = Math.max(RANK_SCALE_MIN, 1 - rank * RANK_SCALE_STEP);
      row.style.setProperty('--rank-scale', scale);
      // Bandera circular grande (mismo patrón que .loading-social-flag /
      // flagUrlForCountryCode, carpeta images/flags).
      const flagUrl = c && c.iso2 && window.flagUrlForCountryCode ? window.flagUrlForCountryCode(c.iso2) : null;
      if (flagUrl) {
        const flag = document.createElement('img');
        flag.className = 'gq-guess-flag';
        flag.src = flagUrl;
        flag.alt = ''; flag.draggable = false;
        row.appendChild(flag);
      }
      const dist = document.createElement('span');
      dist.className = 'gq-guess-dist';
      dist.textContent = Math.round(g.km) + ' km';
      row.appendChild(dist);
      // País ya adivinado seleccionable: clickearlo vuelve a centrar/zoomear
      // la cámara en él, sin gastar un guess nuevo.
      if (c) row.addEventListener('click', () => focusOnCountry(c));
      list.appendChild(row);
      if (!isNew) flippedRows.push({ row, scale });
    });

    // FLIP: por cada fila que ya existía, calcular el delta entre su
    // posición/tamaño VIEJO (capturado arriba) y el nuevo, arrancar ahí sin
    // transición, y animar en el frame siguiente hacia el estado final.
    flippedRows.forEach(({ row, scale }) => {
      const prev = prevRects.get(row.dataset.guessName);
      if (!prev) return;
      const curr = row.getBoundingClientRect();
      const dx = prev.left - curr.left, dy = prev.top - curr.top;
      const prevScale = curr.width > 0 ? prev.width / (curr.width / scale) : scale;
      if (!dx && !dy && Math.abs(prevScale - scale) < 0.01) return;
      row.style.transition = 'none';
      row.style.transform = `translate(${dx}px, ${dy}px) scale(${prevScale})`;
      requestAnimationFrame(() => {
        row.style.transition = 'transform 0.35s ease-out';
        row.style.transform = `scale(${scale})`;
      });
    });
  }

  // Ráfaga de confeti (divs coloreados, sin canvas/librería) desde el
  // centro del globo al acertar. Cada partícula se auto-elimina al terminar
  // su propia animación — nada queda vivo en el DOM después.
  const CONFETTI_COLORS = ['#fde20e', '#2fae4a', '#e8504a', '#4aa8e8', '#ff8ac0', '#ffffff'];
  function spawnConfetti() {
    const container = document.getElementById('gq-confetti');
    if (!container) return;
    const COUNT = 50;
    for (let i = 0; i < COUNT; i++) {
      const p = document.createElement('div');
      p.className = 'gq-confetti-piece';
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 24; // cqmin
      const tx = Math.cos(angle) * dist, ty = Math.sin(angle) * dist - 10; // sesgo hacia arriba
      const duration = 0.8 + Math.random() * 0.6;
      p.style.setProperty('--cx', '0cqmin');
      p.style.setProperty('--cy', '0cqmin');
      p.style.setProperty('--tx', tx.toFixed(2) + 'cqmin');
      p.style.setProperty('--ty', (ty + 30).toFixed(2) + 'cqmin'); // termina cayendo
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      p.style.animationDuration = duration + 's';
      p.style.animationDelay = (Math.random() * 0.15) + 's';
      container.appendChild(p);
      setTimeout(() => p.remove(), (duration + 0.2) * 1000);
    }
  }

  function showWin() {
    spawnConfetti();
    const msg = document.getElementById('gq-win-msg');
    if (!msg) return;
    msg.innerHTML = '';
    msg.style.display = 'block';
    // Casilla verde estilo lista de guesses (bandera + "país correcto"), en
    // vez del texto de "lo lograste en X intentos".
    const row = document.createElement('div');
    row.className = 'gq-guess-item correct';
    const flagUrl = dailyCountry.iso2 && window.flagUrlForCountryCode ? window.flagUrlForCountryCode(dailyCountry.iso2) : null;
    if (flagUrl) {
      const flag = document.createElement('img');
      flag.className = 'gq-guess-flag';
      flag.src = flagUrl; flag.alt = ''; flag.draggable = false;
      row.appendChild(flag);
    }
    const label = document.createElement('span');
    label.className = 'gq-guess-dist';
    label.textContent = t('globequiz.correctBadge');
    row.appendChild(label);
    msg.appendChild(row);
    const input = document.getElementById('gq-guess-input');
    const btn = document.getElementById('gq-guess-btn');
    if (input) input.disabled = true;
    if (btn) btn.classList.add('gq-disabled');
  }

  // Panel de fin de juego: país correcto (con bandera), tiempo, intentos y
  // la tabla de opciones que fuiste probando con su distancia — aparece un
  // toque después del showWin (confeti/celda verde) para que ese festejo se
  // alcance a ver antes de taparlo con el modal.
  // Racha de días jugados: +1 si jugaste AYER (sigue), se reinicia a 1 si
  // hubo un día salteado, y no vuelve a sumar si ya jugaste HOY (ganar dos
  // veces el mismo día no infla la racha). Con cuenta logueada persiste en
  // profiles.gq_streak_count/gq_streak_last_date (Supabase); de invitado
  // sigue en localStorage, mismo criterio que el resto de este modo.
  // Formato ISO con ceros (YYYY-MM-DD) — tiene que calzar exacto con el
  // formato que devuelve la columna `date` de Postgres (gq_streak_last_date),
  // si no la comparación nunca matchea después de recargar la página.
  function dateKey(d) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  // Devuelve { streak, isNewDay } — isNewDay=false cuando hoy ya se había
  // contado (ganar dos veces el mismo día no reotorga XP/monedas, ver
  // showEndgameModal: el ledger de currency solo se llama con isNewDay=true).
  // elapsedMs: tiempo de ESTA partida (solo se persiste como "tiempo del día"
  // cuando es la que efectivamente asegura la racha, ver isNewDay) — lo
  // muestra la barra de amigos de GlobeQuiz (buildGqFriendRows) para comparar
  // contra el tiempo de hoy de cada amigo.
  async function updateStreak(elapsedMs) {
    const userId = window._sbUserId;
    const profile = window._sbProfile;
    const today = new Date();
    const todayStr = dateKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = dateKey(yesterday);

    if (userId && profile) {
      const lastStr = profile.gq_streak_last_date || null;
      let streak = profile.gq_streak_count || 0;
      if (lastStr === todayStr) return { streak, isNewDay: false }; // ya contaba hoy
      streak = (lastStr === yesterdayStr) ? streak + 1 : 1;
      profile.gq_streak_count = streak;
      profile.gq_streak_last_date = todayStr;
      profile.gq_today_time_ms = elapsedMs;
      try {
        await window.sbUpdateProfile(userId, { gq_streak_count: streak, gq_streak_last_date: todayStr, gq_today_time_ms: elapsedMs });
      } catch (e) {}
      if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
      if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
      return { streak, isNewDay: true };
    }

    const lastStr = localStorage.getItem('gq_streak_last_date');
    let streak = parseInt(localStorage.getItem('gq_streak_count') || '0', 10) || 0;
    if (lastStr === todayStr) return { streak, isNewDay: false }; // ya contaba hoy
    streak = (lastStr === yesterdayStr) ? streak + 1 : 1;
    try {
      localStorage.setItem('gq_streak_count', String(streak));
      localStorage.setItem('gq_streak_last_date', todayStr);
      localStorage.setItem('gq_today_time_ms', String(elapsedMs));
    } catch (e) {}
    if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
    if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
    return { streak, isNewDay: true };
  }

  function gqStreakAlive(count, lastStr) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const alive = lastStr === dateKey(today) || lastStr === dateKey(yesterday);
    return alive ? (count || 0) : 0;
  }

  // Lee la racha guardada SIN incrementarla, y la devuelve en 0 si ya se
  // rompió (último día jugado no es hoy ni ayer) — usado por cualquier
  // insignia de racha propia fuera del panel de fin de partida (menú,
  // perfil). Con cuenta logueada SIEMPRE pide el dato fresco al servidor en
  // vez de confiar en window._sbProfile (que puede quedar desactualizado o
  // todavía no estar listo por una carrera con la restauración de sesión) —
  // así la racha queda de verdad conectada al servidor y no a un caché local.
  async function gqReadCurrentStreak() {
    const userId = window._sbUserId;
    if (userId) {
      try {
        const { data } = await window.sb.from('profiles')
          .select('gq_streak_count,gq_streak_last_date').eq('id', userId).single();
        if (data) {
          if (window._sbProfile) {
            window._sbProfile.gq_streak_count = data.gq_streak_count;
            window._sbProfile.gq_streak_last_date = data.gq_streak_last_date;
          }
          return gqStreakAlive(data.gq_streak_count, data.gq_streak_last_date);
        }
      } catch (e) {}
      const p = window._sbProfile;
      return p ? gqStreakAlive(p.gq_streak_count, p.gq_streak_last_date) : 0;
    }
    const count = parseInt(localStorage.getItem('gq_streak_count') || '0', 10) || 0;
    const lastStr = localStorage.getItem('gq_streak_last_date');
    return gqStreakAlive(count, lastStr);
  }

  // A diferencia de gqReadCurrentStreak (racha "viva" si jugaste hoy O ayer),
  // esto es estrictamente "¿ya jugaste HOY?" — usado para la burbuja de
  // saludo/descripción de la azafata en el menú (panel2.globequizGreet*/
  // globequizDesc*), que debe avisar que ya se sumó la racha de hoy en vez
  // de invitar a buscar el país.
  // SÍNCRONA a propósito (antes pedía el dato fresco al server con await) —
  // ese viaje de red hacía que el panel se abriera un instante con el texto
  // default y recién ~200ms después "saltara" al texto correcto. Acá alcanza
  // con window._sbProfile (que updateStreak() ya mantiene al día en cada
  // victoria) para que el texto salga bien de entrada, sin parpadeo.
  window.gqHasPlayedToday = function () {
    const todayStr = dateKey(new Date());
    const userId = window._sbUserId;
    if (userId) {
      const p = window._sbProfile;
      return !!(p && p.gq_streak_last_date === todayStr);
    }
    return localStorage.getItem('gq_streak_last_date') === todayStr;
  };

  // Insignia de racha arriba del botón de GloboReto en el menú principal —
  // acá SÍ se oculta del todo en 0 (no hay "racha rota" que mostrar en el menú).
  window.gqRefreshMenuStreakBadge = async function () {
    const badge = document.getElementById('loading-globequiz-streak');
    const numEl = document.getElementById('loading-globequiz-streak-num');
    if (!badge || !numEl) return;
    const shown = await gqReadCurrentStreak();
    numEl.textContent = String(shown);
    badge.style.display = shown > 0 ? 'block' : 'none';
  };

  // Insignia de racha en el panel de PERFIL PROPIO, al lado del bloque de
  // highscore — siempre visible (a diferencia del menú); en 0 muestra la
  // llama en blanco y negro con un "0" arriba.
  window.gqRefreshProfileStreakBadge = async function () {
    const badge = document.getElementById('loading-profile-streak');
    const numEl = document.getElementById('loading-profile-streak-num');
    if (!badge || !numEl) return;
    const shown = await gqReadCurrentStreak();
    numEl.textContent = String(shown);
    badge.style.display = 'block';
    badge.classList.toggle('streak-inactive', shown === 0);
  };

  // Insignia de racha en el panel de perfil de un AMIGO — recibe la fila ya
  // pedida a Supabase (gq_streak_count/gq_streak_last_date de ESE amigo, no
  // el propio), misma posición/estilo que el perfil propio.
  window.gqRefreshFriendStreakBadge = function (streakRow) {
    const badge = document.getElementById('loading-friend-streak');
    const numEl = document.getElementById('loading-friend-streak-num');
    if (!badge || !numEl) return;
    const shown = streakRow ? gqStreakAlive(streakRow.gq_streak_count, streakRow.gq_streak_last_date) : 0;
    numEl.textContent = String(shown);
    badge.style.display = 'block';
    badge.classList.toggle('streak-inactive', shown === 0);
  };

  async function showEndgameModal() {
    const modal = document.getElementById('gq-endgame-modal');
    if (!modal) return;
    const { streak: currentStreak, isNewDay } = await updateStreak(gqFinalElapsedMs);
    const streakEl = document.getElementById('gq-endgame-streak-num');
    if (streakEl) streakEl.textContent = String(currentStreak);
    // Cuenta como partida propia en los totales del dashboard de stats
    // (junto a campaign/versus) — GlobeQuiz es standalone, no parte de la
    // Gira Mundial. Va acá (no en submitGuess) para mandar la racha ya
    // resuelta en vez de duplicar ese cálculo.
    if (window.Analytics && typeof window.Analytics.logGlobequiz === 'function') {
      window.Analytics.logGlobequiz(guesses.length + 1, gqFinalElapsedMs, currentStreak);
    }
    // XP/monedas: SOLO la primera vez que se gana en el día (isNewDay, ver
    // updateStreak) — ganar de nuevo el mismo día no vuelve a otorgar nada,
    // recién al día siguiente (cuando la racha avance de nuevo).
    if (isNewDay && window.Analytics && typeof window.Analytics.logGlobequizCurrency === 'function') {
      window.Analytics.logGlobequizCurrency(currentStreak);
    }
    const label = document.getElementById('gq-endgame-country-label');
    if (label) label.textContent = displayName(dailyCountry);
    const flag = document.getElementById('gq-endgame-flag');
    if (flag) {
      const flagUrl = dailyCountry.iso2 && window.flagUrlForCountryCode ? window.flagUrlForCountryCode(dailyCountry.iso2) : '';
      flag.style.display = flagUrl ? 'block' : 'none';
      flag.src = flagUrl || '';
    }
    const timeEl = document.getElementById('gq-endgame-time');
    if (timeEl) {
      // Mismo formato "S:CC" (segundos:centésimas) que el resto del modo —
      // NO minutos:segundos.
      const elapsedMs = gqFinalElapsedMs;
      const wholeSec = Math.floor(elapsedMs / 1000);
      const centis = Math.floor((elapsedMs % 1000) / 10);
      timeEl.textContent = wholeSec + ':' + String(centis).padStart(2, '0');
    }
    const attemptsEl = document.getElementById('gq-endgame-attempts');
    if (attemptsEl) attemptsEl.textContent = String(guesses.length + 1); // +1: el guess ganador no se pushea a guesses
    const table = document.getElementById('gq-endgame-table');
    if (table) {
      table.innerHTML = '';
      guesses.slice().sort((a, b) => a.km - b.km).forEach(g => {
        const c = countryByName.get(normalize(g.name));
        const row = document.createElement('div');
        row.className = 'gq-endgame-row';
        const flagUrl = c && c.iso2 && window.flagUrlForCountryCode ? window.flagUrlForCountryCode(c.iso2) : null;
        if (flagUrl) {
          const img = document.createElement('img');
          img.className = 'gq-endgame-row-flag';
          img.src = flagUrl; img.alt = ''; img.draggable = false;
          row.appendChild(img);
        }
        const name = document.createElement('span');
        name.className = 'gq-endgame-row-name';
        name.textContent = c ? displayName(c) : g.name;
        const dist = document.createElement('span');
        dist.className = 'gq-endgame-row-dist';
        dist.textContent = Math.round(g.km) + ' km';
        row.appendChild(name); row.appendChild(dist);
        table.appendChild(row);
      });
    }
    const msgTitle = document.getElementById('gq-endgame-msg-title');
    const msgSub = document.getElementById('gq-endgame-msg-sub');
    if (msgTitle) msgTitle.textContent = t(isNewDay ? 'globequiz.streakGainedTitle' : 'globequiz.streakAlreadyTitle');
    if (msgSub) msgSub.textContent = t(isNewDay ? 'globequiz.streakGainedSub' : 'globequiz.streakAlreadySub');
    const countdownWrap = document.getElementById('gq-endgame-countdown');
    if (countdownWrap) countdownWrap.style.display = 'inline';
    startGqEndgameCountdown();
    modal.style.display = 'flex';
  }

  // Muestra "¿Quisiste decir "X"?" clickeable en el mismo lugar que el hint
  // ("está más caliente/frío" etc.) — al clickear, completa el input con ese
  // país y reintenta el guess (esta vez matchea exacto).
  function showSuggestion(country) {
    const el = document.getElementById('gq-hint');
    if (!el) return;
    el.innerHTML = '';
    const label = displayName(country);
    el.appendChild(document.createTextNode(t('globequiz.didYouMean') + ' "'));
    const link = document.createElement('span');
    link.className = 'gq-suggestion-link';
    link.textContent = label;
    link.addEventListener('click', () => {
      const input = document.getElementById('gq-guess-input');
      if (input) input.value = label;
      submitGuess();
    });
    el.appendChild(link);
    el.appendChild(document.createTextNode('"?'));
  }

  function submitGuess() {
    const input = document.getElementById('gq-guess-input');
    const hintEl = document.getElementById('gq-hint');
    if (!input || solved) return;
    const raw = input.value;
    if (!raw.trim()) return;
    const norm = normalize(raw);
    const country = countryByName.get(norm);
    if (!country) {
      const suggestion = findSuggestion(norm);
      if (suggestion) showSuggestion(suggestion);
      else if (hintEl) hintEl.textContent = t('globequiz.notFound');
      return;
    }
    if (guesses.find(g => g.name === country.name) || (dailyCountry && country.name === dailyCountry.name && solved)) {
      if (hintEl) hintEl.textContent = t('globequiz.alreadyGuessed');
      return;
    }
    input.value = '';
    stopAutoRotate();
    if (country.name === dailyCountry.name) {
      solved = true;
      // Capturado ACÁ, no en showEndgameModal (que corre 2s después por el
      // setTimeout) — si no, esos 2 segundos de más se sumaban al tiempo
      // mostrado.
      gqFinalElapsedMs = Math.max(0, Date.now() - gqTimerStart);
      stopTimer();
      // Repinta la tarjeta con el mismo valor congelado que usará el panel de
      // game over — si no, la última pintura del intervalo de 30ms (gqCardInterval,
      // ya detenido en stopTimer) puede quedar hasta 30ms más vieja que
      // gqFinalElapsedMs y mostrar un dígito distinto entre carta y panel.
      const gqCardEl = document.getElementById('gq-lb-player-time');
      if (gqCardEl) gqCardEl.textContent = formatGqCardTime(gqFinalElapsedMs);
      // playMusic(null) en vez de sfxGameMusic.pause() directo — en iOS el
      // audio real de gamemusic corre por un AudioBufferSourceNode aparte
      // (Web Audio, ver playMusicIOS en monuments.js), no por el <audio>
      // HTML; pausar solo el <audio> no lo corta y el loop sigue sonando.
      if (typeof playMusic === 'function') playMusic(null);
      if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); }
      // El evento de analytics se manda desde showEndgameModal() (2s después),
      // una vez que updateStreak() ya resolvió la racha actual — así el
      // evento sale con duración/racha completas en vez de mandarlas acá y
      // tener que duplicar el cálculo de racha.
      saveState();
      drawTexture();
      renderGuessList();
      showWin();
      updateHint();
      focusOnCountry(country);
      gqEndgameTimeout = setTimeout(() => {
        gqEndgameTimeout = null;
        showEndgameModal();
        if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
      }, 2000);
      return;
    }
    const km = minBorderDistance(country, dailyCountry);
    const dir = bearingArrow(bearing(country.centroid, dailyCountry.centroid));
    guesses.push({ name: country.name, km, dir, color: distColor(km) });
    saveState();
    drawTexture();
    renderGuessList();
    updateHint();
    focusOnCountry(country);
  }

  // Texto de ayuda debajo del input: instrucciones antes del primer guess,
  // "más caliente/frío" (comparado con el guess anterior) o "limita con tu
  // selección" si dio adyacente, y el país correcto al ganar.
  function updateHint() {
    const el = document.getElementById('gq-hint');
    if (!el) return;
    if (solved) {
      // El nombre del país en verde: se arma el HTML a mano en vez de usar
      // t(key, vars) directo (que ya interpola y devuelve solo texto plano).
      const template = t('globequiz.hintCorrect');
      const [before, after] = template.split('{name}');
      el.innerHTML = '';
      el.appendChild(document.createTextNode(before));
      const nameSpan = document.createElement('span');
      nameSpan.className = 'gq-hint-correct-name';
      nameSpan.textContent = displayName(dailyCountry);
      el.appendChild(nameSpan);
      el.appendChild(document.createTextNode(after || ''));
      return;
    }
    if (guesses.length === 0) {
      el.textContent = t('globequiz.hintFirst');
      return;
    }
    const last = guesses[guesses.length - 1];
    const lastCountry = countryByName.get(normalize(last.name));
    const label = lastCountry ? displayName(lastCountry) : last.name;
    if (last.km === 0) {
      el.textContent = t('globequiz.hintBorders', { name: label });
      return;
    }
    if (guesses.length === 1) {
      el.textContent = t('globequiz.hintStart');
      return;
    }
    const prev = guesses[guesses.length - 2];
    const gettingHotter = last.km < prev.km;
    el.textContent = t(gettingHotter ? 'globequiz.hintHotter' : 'globequiz.hintColder', { name: label });
  }

  function restoreUIState() {
    if (solved) showWin();
    renderGuessList();
    updateHint();
  }

  function fillPlayerCard() {
    const nameEl = document.getElementById('gq-lb-player-name');
    const avatarEl = document.getElementById('gq-lb-player-avatar');
    if (nameEl) nameEl.textContent = (window._sbProfile && window._sbProfile.name) || localStorage.getItem('playerName') || 'Tú';
    if (avatarEl) avatarEl.src = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    // Misma carta equipada que el resto del leaderboard (ver _applyFounderFrame
    // en monuments.js, que también la aplica acá cuando corre); esto es un
    // respaldo por si esta pantalla se abre antes de que corra esa función.
    const p = window._sbProfile;
    const cardCode = (p && p.card_code) || localStorage.getItem('cust_card_code') || '0001';
    if (window.CustomizeAssets) window.CustomizeAssets.applyCard(document.getElementById('gq-lb-player'), cardCode);
  }

  // Dispara la descarga de three.js + el GeoJSON sin esperar a que el
  // jugador entre a la pantalla (se llama al abrir el PANEL de GlobeQuiz en
  // el menú, mientras lee la descripción) — así para cuando aprieta "jugar"
  // lo más pesado ya está en caché y el globo tarda menos en aparecer.
  // loadThree/loadCountries son idempotentes (chequean su propio caché), así
  // que llamarlas de nuevo después en initGlobeQuiz no repite trabajo.
  window.preloadGlobeQuiz = function () {
    loadThree().catch(() => {});
    loadCountries().catch(() => {});
  };

  // applyI18n() pisa el textContent de #gq-hint (tiene data-i18n) con el
  // texto default cada vez que cambia el idioma — re-generamos el hint
  // dinámico (y la lista, que también muestra nombres traducidos) después.
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      if (!initialized) return;
      updateHint();
      renderGuessList();
    });
  }

  // Cronómetro (cuenta ARRIBA desde 0:00, formato M:SS) — arranca con cada
  // partida nueva, se detiene al acertar.
  let gqTimerInterval = null, gqCardInterval = null, gqTimerStart = 0, gqFinalElapsedMs = 0;
  // Retriggerea la animación a mano en cada tick del JS (en vez de dejarla
  // correr sola en loop CSS aparte) — así el titileo queda exactamente
  // sincronizado con el segundo que cambia en el número, no dos relojes
  // independientes desfasándose con el tiempo.
  function pulseCountdown() {
    const img = document.querySelector('.gq-countdown-widget img');
    if (!img) return;
    img.style.animation = 'none';
    void img.offsetWidth; // fuerza reflow para reiniciar la animación
    img.style.animation = 'pulse-img-shadow 1s';
  }
  // Countdown grande: solo segundos enteros, un tick por segundo.
  function updateTimerDisplay() {
    const wholeSec = Math.floor((Date.now() - gqTimerStart) / 1000);
    const el = document.getElementById('gq-timer-number');
    if (el) el.textContent = String(wholeSec);
    pulseCountdown();
  }
  // Card del leaderboard: formato "S:CC" (segundos:centésimas — a 1 segundo
  // exacto muestra "1:00"). Va en un intervalo aparte y mucho más frecuente
  // que el del countdown grande — con un tick por segundo las centésimas
  // quedaban siempre pegadas cerca de "00" (recién calculadas justo en el
  // borde del segundo), sin verse correr de verdad.
  function updateCardTime() {
    const cardEl = document.getElementById('gq-lb-player-time');
    if (!cardEl) return;
    const elapsedMs = Date.now() - gqTimerStart;
    const wholeSec = Math.floor(elapsedMs / 1000);
    const centis = Math.floor((elapsedMs % 1000) / 10);
    cardEl.textContent = wholeSec + ':' + String(centis).padStart(2, '0');
    positionGqLeaderboard(elapsedMs, true);
  }

  // Barra de amigos in-game: solo entran los amigos que YA jugaron GlobeQuiz
  // HOY y aseguraron su racha (gq_streak_last_date === hoy), con el tiempo
  // que hicieron ESE día (gq_today_time_ms, ver updateStreak) — no su mejor
  // tiempo histórico. Si nadie jugó hoy, la barra queda con solo tu carta.
  //
  // Mismo mecanismo que positionLeaderboard en monuments.js: las cartas
  // quedan fijas en el DOM, se les pisa el `top` (GQ_LB_ROW_H_CQMIN acá
  // abajo, ver también .gq-friends-bar en style.css), y la transición es la
  // que YA trae .lb-entry de fábrica (`top 0.7s cubic-bezier(...)`) — misma
  // animación real que la Vuelta Mundial, no una parecida. Como el tiempo
  // del jugador solo puede subir (nunca "mejora" a mitad de partida), acá
  // simplifica: el único que puede "caer" de posición sos vos, nunca un
  // amigo (sus tiempos ya están fijos desde que jugaron hoy).
  const GQ_LB_ROW_H_CQMIN = 19.6; // 18.9 (alto de la carta) + 0.7 (gap) — ver comentario en style.css
  const GQ_LB_WINDOW = 4;  // filas visibles a la vez (ver altura fija en .gq-friends-bar)
  const GQ_LB_PIN_ROW = 1; // cuántas filas por encima tuyo se intentan mantener visibles
  let gqFriendPlayers = [];
  let gqLbElements = {};
  let lastGqPlayerRank = -1;
  // setTimeout pendiente del emote (ver más abajo) — stopTimer() lo cancela
  // igual que hace con gqTimerInterval/gqCardInterval. Sin esto, salir del
  // juego justo dentro de la ventana de 200ms (o con el intervalo de 30ms
  // todavía corriendo un instante después de salir) dejaba el timeout vivo:
  // disparaba spawnEmoteBubble sobre #gq-lb-player YA de vuelta en el menú,
  // o recién al entrar de nuevo — el emote "fantasma" que se reportó.
  let gqEmoteTimeout = null;

  function formatGqCardTime(ms) {
    const wholeSec = Math.floor(ms / 1000);
    const centis = Math.floor((ms % 1000) / 10);
    return wholeSec + ':' + String(centis).padStart(2, '0');
  }

  // Reconstruye las filas de amigos desde cero (llamado al arrancar cada
  // partida) — lee el snapshot actual de getFriends() (js/friends.js), así
  // que si loadFriends() todavía no resolvió para cuando arrancás la
  // primera partida, simplemente no hay filas de amigos esa vez (igual que
  // buildFriendPlayers en monuments.js, mismo criterio de "mejor esfuerzo").
  function buildGqFriendRows() {
    const bar = document.getElementById('gq-friends-bar');
    const playerEl = document.getElementById('gq-lb-player');
    if (!bar || !playerEl) return;
    bar.querySelectorAll('.lb-entry[data-gq-friend]').forEach(el => el.remove());
    const todayStr = dateKey(new Date());
    const friends = (typeof getFriends === 'function' ? getFriends() : [])
      .filter(f => f.gqStreakLastDate === todayStr && typeof f.gqTodayTimeMs === 'number');
    gqFriendPlayers = friends.map((f, i) => ({
      id: 'gqf' + i, timeMs: f.gqTodayTimeMs, name: f.name,
      avatar: f.avatar, cardCode: f.cardCode,
    }));
    gqLbElements = { player: playerEl };
    gqFriendPlayers.forEach(f => {
      const el = document.createElement('div');
      el.className = 'lb-entry';
      el.dataset.gqFriend = '1';
      el.id = 'gq-lb-' + f.id;
      const rank = document.createElement('span');
      rank.className = 'lb-rank rank-other';
      const avatarWrap = document.createElement('div');
      avatarWrap.className = 'lb-avatar';
      const avatarImg = document.createElement('img');
      avatarImg.className = 'lb-avatar-img';
      avatarImg.src = f.avatar || 'images/profilepic/ppdefault.png';
      avatarImg.alt = '';
      avatarWrap.appendChild(avatarImg);
      const name = document.createElement('span');
      name.className = 'lb-name';
      name.textContent = f.name || '?';
      const score = document.createElement('span');
      score.className = 'lb-score';
      score.textContent = formatGqCardTime(f.timeMs);
      el.appendChild(rank); el.appendChild(avatarWrap); el.appendChild(name); el.appendChild(score);
      bar.appendChild(el);
      if (window.CustomizeAssets) window.CustomizeAssets.applyCard(el, f.cardCode || '0001');
      gqLbElements[f.id] = el;
    });
  }

  // Ordena por tiempo ascendente (menor tiempo = mejor puesto) y ubica cada
  // carta con `top` dentro de una ventana fija de GQ_LB_WINDOW filas (igual
  // que positionLeaderboard) — así si hay más amigos que la ventana, tu
  // carta nunca se pierde de vista aunque el resto se recorte.
  function positionGqLeaderboard(elapsedMs, animate) {
    const playerEl = gqLbElements.player;
    if (!playerEl) return;
    const all = gqFriendPlayers.map(f => ({ id: f.id, time: f.timeMs }));
    all.push({ id: 'player', time: elapsedMs });
    all.sort((a, b) => a.time - b.time);
    const playerRank = all.findIndex(p => p.id === 'player');

    // Como tu tiempo solo puede subir, el único que "cae" de puesto siempre
    // sos vos (nunca un amigo) — el emote va sobre tu carta, no la de ellos.
    if (animate && lastGqPlayerRank !== -1 && playerRank > lastGqPlayerRank) {
      if (gqEmoteTimeout) clearTimeout(gqEmoteTimeout);
      if (typeof spawnEmoteBubble === 'function') {
        gqEmoteTimeout = setTimeout(() => { gqEmoteTimeout = null; spawnEmoteBubble(playerEl); }, 200);
      }
    }
    lastGqPlayerRank = playerRank;

    let windowStart = Math.max(0, playerRank - GQ_LB_PIN_ROW);
    let windowEnd = Math.min(all.length, windowStart + GQ_LB_WINDOW);
    windowStart = Math.max(0, windowEnd - GQ_LB_WINDOW);

    // Anclado ABAJO (igual que positionLeaderboard): con menos filas que la
    // ventana, se pegan al fondo de la barra en vez de flotar arriba — con
    // nadie más que vos, tu carta va sola en la posición de más abajo, no
    // suelta arriba de un contenedor vacío.
    const visibleRows = windowEnd - windowStart;
    const bottomOffset = Math.max(0, GQ_LB_WINDOW - visibleRows) * GQ_LB_ROW_H_CQMIN;

    if (!animate) {
      Object.values(gqLbElements).forEach(el => { el.style.transition = 'none'; });
    }
    all.forEach((p, rank) => {
      const el = gqLbElements[p.id];
      if (el) el.style.top = ((rank - windowStart) * GQ_LB_ROW_H_CQMIN + bottomOffset) + 'cqmin';
    });
    if (!animate) {
      requestAnimationFrame(() => {
        Object.values(gqLbElements).forEach(el => { el.style.transition = ''; });
      });
    }
  }
  // Vuelve todo a como arranca (jugador arriba, amigos de hoy recién
  // leídos) al empezar una partida nueva, SIN animación (todavía no hay
  // nada que "ver" en ese momento) — mismo patrón de "plantar sin
  // transición, reactivarla en el frame siguiente" que usa buildLeaderboard
  // en monuments.js.
  function resetLeaderboardOrder() {
    if (gqEmoteTimeout) { clearTimeout(gqEmoteTimeout); gqEmoteTimeout = null; }
    buildGqFriendRows();
    lastGqPlayerRank = -1;
    positionGqLeaderboard(0, false);
  }

  function startTimer() {
    stopTimer();
    gqTimerStart = Date.now();
    resetLeaderboardOrder();
    updateTimerDisplay();
    updateCardTime();
    gqTimerInterval = setInterval(updateTimerDisplay, 1000);
    gqCardInterval = setInterval(updateCardTime, 30);
  }
  function stopTimer() {
    if (gqTimerInterval) clearInterval(gqTimerInterval);
    if (gqCardInterval) clearInterval(gqCardInterval);
    if (gqEmoteTimeout) clearTimeout(gqEmoteTimeout);
    gqTimerInterval = null;
    gqCardInterval = null;
    gqEmoteTimeout = null;
  }
  window.stopGlobeQuizTimer = stopTimer;
  window.stopGlobeQuizAutoRotate = stopAutoRotate;
  window.stopGlobeQuizInertia = stopInertia;

  window.initGlobeQuiz = function () {
    const wireOnce = !initialized;
    fillPlayerCard();
    // Marca is_playing para que amigos/grupos vean "Jugando" igual que en
    // el resto de los modos — pero con is_practicing=true así el ojo de
    // espectar queda oculto (mismo mecanismo que el modo práctica; ver
    // shouldShowEye en monuments.js). GlobeQuiz no tiene UI de espectador
    // real, no se puede espectar acá.
    window._isPlaying = true;
    if (window._sbUserId && typeof window.sbSetPlaying === 'function') {
      window.sbSetPlaying(window._sbUserId, true, true).catch(() => {});
    }
    if (window._sbUserId && typeof window.sbSetPlayingMode === 'function') {
      window.sbSetPlayingMode(window._sbUserId, 'GlobeQuiz').catch(() => {});
    }
    // Se corta la música del menú apenas se entra (no hay que esperar a que
    // termine el 3-2-1-GO para esto, solo gamemusic espera al onDone).
    // playMusic(null) en vez de pausar el <audio> a mano — en iOS el sonido
    // real corre por Web Audio (ver playMusicIOS), no por el elemento HTML.
    if (typeof playMusic === 'function') playMusic(null);
    // sfxBonus (y el resto de los sfx de partida) recién se instancian acá —
    // sin esto, sfxBonus quedaba `undefined` toda la partida si nunca se
    // había jugado otro modo antes en la sesión, y el "if" de abajo lo
    // saltaba en silencio.
    if (typeof loadGameSFX === 'function') loadGameSFX();
    const spinner = document.getElementById('gq-loading-spinner');
    if (spinner) spinner.style.display = 'block';
    // El wiring de input/confirm se hace ACÁ, fuera de la promesa del globo
    // 3D — antes vivía dentro del .then() de abajo, así que si loadThree()
    // o initThreeScene() fallaban (WebGL bloqueado/deshabilitado, típico en
    // Firefox con protección de fingerprinting o extensiones de privacidad),
    // el juego quedaba con el input visible pero sin ningún listener: el
    // jugador podía escribir y tocar "confirmar" y no pasaba absolutamente
    // nada, sin ningún error visible. Ahora el input/confirm funcionan
    // siempre, aunque el globo no haya podido cargar.
    if (wireOnce) {
      const btn2 = document.getElementById('gq-guess-btn');
      const input2 = document.getElementById('gq-guess-input');
      const playCheckSfx = () => { if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } };
      if (btn2) btn2.addEventListener('click', () => { playCheckSfx(); submitGuess(); });
      if (input2) input2.addEventListener('keydown', (e) => { if (e.key === 'Enter') { playCheckSfx(); submitGuess(); } });
      // Confirm del panel de fin de juego: mismo camino de salida que el
      // power (cortar todo + animación de entrada típica del menú), solo
      // que sin pasar por el popup de "¿seguro que querés salir?" (ya
      // terminaste la partida, no hace falta confirmar de nuevo).
      document.getElementById('gq-endgame-confirm')?.addEventListener('click', () => {
        const modal = document.getElementById('gq-endgame-modal');
        if (modal) modal.style.display = 'none';
        stopGqEndgameCountdown();
        document.getElementById('gq-quit-confirm')?.click();
      });
    }
    Promise.all([loadThree(), loadCountries()]).then(() => {
      if (!initialized) {
        initThreeScene();
        initialized = true;
      }
      // Posición base siempre al entrar (no la que quedó de una partida
      // anterior), con rotación automática hasta el primer guess.
      if (sphere) { sphere.rotation.x = BASE_ROT_X; sphere.rotation.y = BASE_ROT_Y; }
      zoomZ = BASE_Z;
      if (camera) camera.position.z = zoomZ;
      updateSpaceVignette();
      startAutoRotate();
      loadState();
      pickDailyCountry();
      // El cronómetro arranca recién con el primer guess (ver submitGuess),
      // no apenas entrás a la pantalla — acá solo se resetea la muestra a 0.
      stopTimer();
      gqTimerStart = Date.now();
      resetLeaderboardOrder();
      updateTimerDisplay();
      updateCardTime();
      const input = document.getElementById('gq-guess-input');
      const btn = document.getElementById('gq-guess-btn');
      const msg = document.getElementById('gq-win-msg');
      const guessRow = document.querySelector('.gq-guess-row');
      const hintEl2 = document.getElementById('gq-hint');
      if (input) { input.disabled = false; input.value = ''; }
      if (btn) btn.classList.remove('gq-disabled');
      if (msg) msg.style.display = 'none';
      // El input/check y el hint recién aparecen cuando termina el
      // 3-2-1-GO, no antes.
      if (guessRow) guessRow.style.display = 'none';
      if (hintEl2) hintEl2.style.display = 'none';
      // El globo tampoco es interactivo (click/drag/zoom) hasta que termina
      // el 3-2-1-GO.
      const canvasEl = document.getElementById('gq-canvas');
      if (canvasEl) canvasEl.style.pointerEvents = 'none';
      drawTexture();
      restoreUIState();
      fitCanvas();
      if (spinner) spinner.style.display = 'none';
      // Música recién arranca cuando termina el 3-2-1-GO, igual que en el
      // resto de los modos (ver runPregameCountdown en monuments.js).
      runGqPregameCountdown(() => {
        if (guessRow) guessRow.style.display = '';
        if (hintEl2) hintEl2.style.display = '';
        if (canvasEl) canvasEl.style.pointerEvents = '';
        if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
        startTimer();
      });
    }).catch(err => {
      console.error('GlobeQuiz init failed', err);
      if (spinner) spinner.style.display = 'none';
      // Antes esto fallaba en silencio (solo consola) y el input/confirm
      // ni siquiera tenían listeners todavía, así que el jugador escribía
      // y tocaba confirmar sin que pasara nada, sin ninguna pista de qué
      // estaba mal. El wiring de input/confirm ahora vive fuera de esta
      // promesa (ver más arriba), así que al menos eso sigue andando; acá
      // solo avisamos que el globo 3D no pudo cargar (típicamente WebGL
      // bloqueado o deshabilitado en el navegador).
      const hintEl = document.getElementById('gq-hint');
      if (hintEl) hintEl.textContent = t('globequiz.loadError');
    });
  };
})();
