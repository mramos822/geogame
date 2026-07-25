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

  function loadCountries() {
    if (countries) return Promise.resolve(countries);
    // Embebido como window.GQ_COUNTRIES_DATA (ver js/globequiz-countries-data.js)
    // en vez de fetch('data/countries.geo.json') — fetch() de un archivo local
    // no funciona abriendo el juego con file:// (bloqueado por CORS), solo con
    // un servidor. Un <script> normal sí carga bajo file://.
    const geo = window.GQ_COUNTRIES_DATA;
    return Promise.resolve().then(() => {
      countries = geo.features.map(f => {
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
    if (country) focusOnCountry(country);
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

  function clampZoom(z) {
    return Math.max(MIN_Z, Math.min(MAX_Z, z));
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
      sphere.rotation.x = Math.max(-1.3, Math.min(1.3, sphere.rotation.x + dy * sens));
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
  async function updateStreak() {
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
      if (lastStr === todayStr) return streak; // ya contaba hoy
      streak = (lastStr === yesterdayStr) ? streak + 1 : 1;
      profile.gq_streak_count = streak;
      profile.gq_streak_last_date = todayStr;
      try {
        await window.sbUpdateProfile(userId, { gq_streak_count: streak, gq_streak_last_date: todayStr });
      } catch (e) {}
      if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
      if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
      return streak;
    }

    const lastStr = localStorage.getItem('gq_streak_last_date');
    let streak = parseInt(localStorage.getItem('gq_streak_count') || '0', 10) || 0;
    if (lastStr === todayStr) return streak; // ya contaba hoy
    streak = (lastStr === yesterdayStr) ? streak + 1 : 1;
    try {
      localStorage.setItem('gq_streak_count', String(streak));
      localStorage.setItem('gq_streak_last_date', todayStr);
    } catch (e) {}
    if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
    if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
    return streak;
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
    const streakEl = document.getElementById('gq-endgame-streak-num');
    if (streakEl) streakEl.textContent = String(await updateStreak());
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
      if (typeof sfxGameMusic !== 'undefined') { sfxGameMusic.pause(); sfxGameMusic.currentTime = 0; }
      if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); }
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
  }
  function startTimer() {
    stopTimer();
    gqTimerStart = Date.now();
    updateTimerDisplay();
    updateCardTime();
    gqTimerInterval = setInterval(updateTimerDisplay, 1000);
    gqCardInterval = setInterval(updateCardTime, 30);
  }
  function stopTimer() {
    if (gqTimerInterval) clearInterval(gqTimerInterval);
    if (gqCardInterval) clearInterval(gqCardInterval);
    gqTimerInterval = null;
    gqCardInterval = null;
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
    // Se corta la música del menú apenas se entra (no hay que esperar a que
    // termine el 3-2-1-GO para esto, solo gamemusic espera al onDone).
    if (typeof sfxMenuMusic !== 'undefined') { sfxMenuMusic.pause(); sfxMenuMusic.currentTime = 0; }
    // sfxBonus (y el resto de los sfx de partida) recién se instancian acá —
    // sin esto, sfxBonus quedaba `undefined` toda la partida si nunca se
    // había jugado otro modo antes en la sesión, y el "if" de abajo lo
    // saltaba en silencio.
    if (typeof loadGameSFX === 'function') loadGameSFX();
    const spinner = document.getElementById('gq-loading-spinner');
    if (spinner) spinner.style.display = 'block';
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
      startAutoRotate();
      loadState();
      pickDailyCountry();
      // El cronómetro arranca recién con el primer guess (ver submitGuess),
      // no apenas entrás a la pantalla — acá solo se resetea la muestra a 0.
      stopTimer();
      gqTimerStart = Date.now();
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
          document.getElementById('gq-quit-confirm')?.click();
        });
      }
    }).catch(err => {
      console.error('GlobeQuiz init failed', err);
      if (spinner) spinner.style.display = 'none';
    });
  };
})();
