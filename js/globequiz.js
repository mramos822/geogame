// ── GLOBEQUIZ: "country of the day" mode with a low-poly 3D globe ─────────────
// three.js loads lazily (CDN) only on entering this screen. Render-on-demand
// (no continuous rAF loop): it only re-renders on drag or when painting a new
// country after a guess, so as not to repeat the pattern that caused the
// GPU/IOSurface crashes on iOS documented elsewhere in the project.
(function () {
  const TEX_W = 4096, TEX_H = 2048;
  const OCEAN = '#5fb6e0';
  const LAND_DEFAULT = '#ecdfc0';
  const CORRECT_COLOR = '#008000';
  // Heat scale from far -> touching the country, in that exact order.
  const HEAT_STOPS = ['#fff7ec', '#feeed8', '#fddcb0', '#fdd29e', '#fdc993', '#fb9562', '#f67c52', '#ed6444', '#d93826', '#be120c', '#7f0000'];

  // Territories marked on the map along with the guessed country (they don't
  // count as a separate guess, just painted the same). Names = the EN dataset
  // key on both sides.
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
  // Default focus: middle of the Atlantic Ocean (~35°W, 15°N), computed with
  // the same formula as focusOnCountry (Ry first, Rx after).
  const BASE_ROT_X = 0.262, BASE_ROT_Y = -0.960;
  let autoRotateId = null;
  // Zoom limits. The viewport (.gq-globe-wrap) now clips to a circle
  // (border-radius:50%), so even if the sphere overflows the canvas box when
  // zoomed in a lot, all that's visible is still a circle — MIN_Z can go quite
  // low without losing the spherical silhouette.
  let zoomZ = 3.0;
  const MIN_Z = 1.3, MAX_Z = 6;
  const BASE_Z = 3.0, DRAG_SENSITIVITY = 0.005;
  // Vertical tilt limit while dragging. It used to be ±1.3 rad (~74.5°),
  // which kept the south pole (and Antarctica) always ~15° from the globe
  // center, never reachable by dragging — it looked "clipped" at the edge and
  // Antarctica seemed not drawn. 1.55 rad (~88.8°) lets you bring either pole
  // almost to the center without hitting exactly 90° (there the yaw becomes a
  // pure spin on the pole itself, valid but best not to land right on the
  // mathematical limit).
  const ROT_X_LIMIT = 1.55;
  const activePointers = new Map();
  let pinchStartDist = 0, pinchStartZ = 0;
  let initialized = false;
  let resizeObs = null;
  let outlineGroup = null; // vector black outline of the marked countries (doesn't pixelate on zoom)
  let focusAnimId = null;

  let countries = null;           // [{name, geometry, centroid}]
  // Linked territories (see LINKED_TERRITORIES) — name -> geometry. Drawn on
  // the globe and colored together with the country they belong to, but
  // deliberately NEVER added to `countries`/`countryByName`: they can't be
  // picked as the daily country nor typed/guessed on their own (e.g.
  // Falkland Is./Malvinas — disputed territory, "no son algo para escoger").
  let linkedTerritoryGeoms = {};
  let countryByName = new Map();  // normalized -> country
  let dailyCountry = null;
  let guesses = [];               // [{name, km, dir, color}]
  let animatedGuessNames = new Set(); // rows that already played the entrance animation
  let solved = false;
  let _gqSuggestion = null;       // { country, forNorm } — pending "Did you mean X?" (see showSuggestion)

  function normalize(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  // A CDN <script> that hangs mid-download (stalled mobile network, reaching
  // neither onload NOR onerror) left initGlobeQuiz waiting forever: in
  // 1-player the spinner spun eternally, and in a 1v1 duel the opponent
  // started solo after the timeout while this client stayed frozen (the
  // reported "one gets frozen and the other loads fine").
  //
  // Each attempt has its own timeout, and we try SEVERAL CDNs in turn:
  // jsdelivr routes poorly to parts of Latin America (reported: GloboReto
  // stuck loading for a player in Peru — three.js never arrived), Cloudflare
  // (cdnjs) has much better regional coverage, unpkg is a last resort. First
  // one that lands wins.
  const THREE_SRCS = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',
    'https://unpkg.com/three@0.160.0/build/three.min.js',
  ];
  const THREE_ATTEMPT_TIMEOUT_MS = 9000;
  function _loadThreeAttempt(src) {
    return new Promise((resolve, reject) => {
      if (window.THREE) { THREE = window.THREE; resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      let done = false;
      const to = setTimeout(() => {
        if (done) return;
        done = true;
        s.onload = s.onerror = null;
        try { s.remove(); } catch (e) {}
        reject(new Error('three.js load timeout: ' + src));
      }, THREE_ATTEMPT_TIMEOUT_MS);
      s.onload = () => {
        if (done) return;
        done = true; clearTimeout(to);
        if (window.THREE) { THREE = window.THREE; resolve(); }
        else reject(new Error('three.js missing after load: ' + src));
      };
      s.onerror = () => {
        if (done) return;
        done = true; clearTimeout(to);
        try { s.remove(); } catch (e) {}
        reject(new Error('three.js load error: ' + src));
      };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (window.THREE) { THREE = window.THREE; return Promise.resolve(); }
    // Chain the CDNs: each .catch tries the next source. The seed rejection is
    // caught synchronously by the first link, so it never surfaces as an
    // unhandled rejection.
    return THREE_SRCS.reduce(
      (p, src) => p.catch(() => _loadThreeAttempt(src)),
      Promise.reject(new Error('three.js: starting CDN chain'))
    );
  }

  // Caribbean micro-territories too obscure/impossible to guess blind (nobody
  // places St-Barthélemy from memory) — removed from the pool here instead of
  // touching the embedded geojson, so the filter stays in one readable place.
  // The names are the EN dataset ones (see globequiz-countries-data.js).
  const EXCLUDED_COUNTRIES = new Set([
    'St-Barthélemy', 'St-Martin', 'Sint Maarten',
    'Cayman Is.', 'Turks and Caicos Is.', 'British Virgin Is.', 'U.S. Virgin Is.',
    'Saint Helena', // British territory, not a sovereign country
    // Islas Malvinas — excluded from the pickable/guessable pool (not a
    // sovereign country, and "no son algo para escoger"), but still DRAWN on
    // the globe and colored together with Argentina — see LINKED_TERRITORIES/
    // linkedTerritoryGeoms below, which pull its geometry straight from the
    // raw dataset regardless of this exclusion.
    'Falkland Is.',
  ]);

  function loadCountries() {
    if (countries) return Promise.resolve(countries);
    // Embedded as window.GQ_COUNTRIES_DATA (see js/globequiz-countries-data.js)
    // instead of fetch('data/countries.geo.json') — fetch() of a local file
    // doesn't work when opening the game with file:// (blocked by CORS), only
    // with a server. A normal <script> does load under file://.
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
            mainRingPts: mainPts, // main territory, no exclaves — see focusOnCountry
            area: Math.abs(ringArea(mainPts)), // see countryAtLonLat: disambiguates overlaps (Morocco/W. Sahara)
          };
        });
      countries.forEach(c => {
        countryByName.set(normalize(c.name), c);
        const es = window.GQ_NAMES_ES && window.GQ_NAMES_ES[c.name];
        if (es) countryByName.set(normalize(es), c);
      });
      // Abbreviations/aliases (USA, UK, EEUU...) -> resolve to the country
      // already indexed by its canonical EN name.
      const abbrevs = window.GQ_ABBREVIATIONS || {};
      Object.keys(abbrevs).forEach(abbr => {
        const c = countryByName.get(normalize(abbrevs[abbr]));
        if (c) countryByName.set(normalize(abbr), c);
      });
      // Linked territories (Falkland Is./Malvinas, see LINKED_TERRITORIES) —
      // pulled from the RAW feature list (before the EXCLUDED_COUNTRIES
      // filter above, which is what keeps them out of `countries` on
      // purpose) purely for their geometry, so drawTexture()/updateOutlines()
      // can paint them on the globe alongside whichever country they belong
      // to without making them independently pickable/guessable.
      const linkedNames = new Set(Object.values(LINKED_TERRITORIES).flat());
      linkedTerritoryGeoms = {};
      geo.features.forEach(f => {
        if (linkedNames.has(f.properties.name)) linkedTerritoryGeoms[f.properties.name] = f.geometry;
      });
      return countries;
    });
  }

  // Display name for the current language (ES if a translation exists,
  // otherwise falls back to the EN dataset name).
  function displayName(country) {
    const lang = typeof window.getLang === 'function' ? window.getLang() : 'es';
    if (lang === 'es' && window.GQ_NAMES_ES && window.GQ_NAMES_ES[country.name]) {
      return window.GQ_NAMES_ES[country.name];
    }
    return country.name;
  }

  // Edit distance (Levenshtein) to suggest "did you mean X?" when the guess
  // matches nothing exactly (typos like "boilvia").
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

  // Finds the country whose name (EN or ES) is closest to the typed text,
  // within a tolerance proportional to length (more permissive for long
  // names, stricter for short ones, so it doesn't suggest just anything).
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

  // Signed area (shoelace formula) of a ring, in degrees² — only useful to
  // COMPARE sizes between rings, not as a real area.
  function ringArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      area += x1 * y2 - x2 * y1;
    }
    return area / 2;
  }

  // Largest outer ring of the geometry. For countries with exclaves (USA
  // with Alaska/Hawaii, France with overseas territories, etc., which arrive
  // as MultiPolygon) this identifies the MAIN territory, used both for the
  // centroid and to compute how much zoom is needed for the country to fit
  // fully in frame (focusOnCountry) — ignoring the exclaves in both cases.
  function mainRing(geometry) {
    const polyList = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let best = polyList[0][0], bestArea = -1;
    polyList.forEach(rings => {
      const area = Math.abs(ringArea(rings[0]));
      if (area > bestArea) { bestArea = area; best = rings[0]; }
    });
    return best;
  }

  // Centroid (area-weighted, not a simple vertex average) of ONE ring —
  // used both by computeCentroid (main ring) and by borderPoints (each ring
  // of a MultiPolygon, see below).
  function centroidOfRing(ring) {
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
      // Degenerate ring (area 0, e.g. a line) — falls back to a simple average.
      let sx = 0, sy = 0, n = 0;
      ring.forEach(([lon, lat]) => { sx += lon; sy += lat; n++; });
      return [sx / n, sy / n];
    }
    return [cx / (6 * a), cy / (6 * a)];
  }
  function computeCentroid(geometry) {
    return centroidOfRing(mainRing(geometry));
  }

  // Border points for the distance calculation (not for drawing, which uses
  // the full geometry). With the higher-detail map (Natural Earth 50m)
  // countries like Canada/Russia have thousands of points — comparing all
  // against all would be very expensive (tens of millions of pairs). It's
  // downsampled evenly to a per-country max, more than enough for an
  // approximate border-to-border distance in a guessing game.
  // 300x300 = 90,000 comparisons worst case, still instant (measured: <50ms
  // even Canada-Russia) — 80 was too few: with large countries downsampled
  // that aggressively, the point where TWO borders actually touch could fall
  // right between two samples and the detected minimum distance ended up
  // giving "8km" or "2km" instead of 0.
  const MAX_BORDER_PTS = 300;
  // This used to use ONLY the main ring (mainRing, largest area) — meant to
  // discard genuinely distant exclaves (Alaska/Hawaii of the USA vs the rest
  // of continental USA, French Guiana vs European France), which gave false
  // "very close" and confused the hint. But that same criterion broke
  // archipelago countries where NO island is an "exclave": Indonesia
  // (Kalimantan, the largest island, was left as the sole border) measured
  // its distance to East Timor using ONLY Kalimantan instead of also the
  // Indonesian half of Timor island — ~1500km instead of the real ~0km of a
  // shared land border (the reported "East Timor borders Indonesia and it
  // says 1155km"). CORE_CLUSTER_KM groups as "core territory" any ring whose
  // centroid is this distance or less from the main ring — amply covers a
  // real archipelago (Kalimantan-Timor ~1500km, Kalimantan-Papua ~2700km)
  // without reaching real exclaves (Hawaii-continental USA ~6000km centroid
  // to centroid, French Guiana-France quite a bit more).
  const CORE_CLUSTER_KM = 3000;
  // `p[0]` of each polygon is the OUTER ring — the rest (p[1], p[2]...) are
  // HOLES, and in this dataset a hole is exactly the border shared with an
  // enclave country (Italy has one for San Marino and another for the
  // Vatican; South Africa one for Lesotho). This function used to look only
  // at p[0] of each polygon to decide what is "core territory" AND to gather
  // the border points — incidentally discarding those holes entirely, so the
  // real border with the enclave never entered minBorderDistance's
  // comparison: the nearest point ended up being on the outer coast, several
  // km away instead of 0 (the reported "San Marino 15km from Italy"). Now
  // ONLY p[0] is still used to decide which polygons are core vs. distant
  // exclave (same CORE_CLUSTER_KM criterion), but once a polygon qualifies
  // as core, ALL its rings are added, holes included.
  function borderPoints(geometry) {
    const polyList = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (polyList.length === 1) {
      let all = [];
      polyList[0].forEach(ring => { all = all.concat(ring); });
      return _downsampleBorder(all);
    }
    const outerRings = polyList.map(p => p[0]);
    const main = mainRing(geometry);
    const mainCentroid = centroidOfRing(main);
    let all = [];
    polyList.forEach((rings, i) => {
      const outer = outerRings[i];
      if (outer === main || haversine(mainCentroid, centroidOfRing(outer)) <= CORE_CLUSTER_KM) {
        rings.forEach(ring => { all = all.concat(ring); });
      }
    });
    return _downsampleBorder(all);
  }
  function _downsampleBorder(all) {
    if (all.length <= MAX_BORDER_PTS) return all;
    const step = all.length / MAX_BORDER_PTS;
    const out = [];
    for (let i = 0; i < MAX_BORDER_PTS; i++) out.push(all[Math.floor(i * step)]);
    return out;
  }

  // A "touching" guess (0km) requires two samples to land on exactly the
  // same point, which downsampling almost never guarantees even with more
  // points. A small threshold (simplification noise of the border lines
  // between independent datasets) rounds that to 0/adjacent — BUT it must be
  // genuinely small: 25km (previous version) went as far as marking Russia
  // as "touching" Japan, which are only close via a strait
  // (Kurils-Hokkaido, ~20km of water) and do NOT share a land border. 3km
  // covers the simplification noise without letting real maritime straits
  // through.
  const TOUCHING_TOLERANCE_KM = 3;

  // Minimum distance between two countries' borders (nearest edge to
  // nearest edge), not between their centers — so large neighboring
  // countries (e.g. Russia-China) give "very close" even if their centroids
  // are far apart.
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
  // The strongest red (last stop, #7f0000) is reserved for the country that
  // actually touches the correct one's border (km===0). Any other guess,
  // however close, doesn't go past the second-to-last stop (#be120c).
  // Rescaled: against MAX_KM (half the circumference, ~20015km) linearly,
  // almost no real guess ever looked "hot" — the vast majority of the
  // world's countries are less than that distance away, so everything was
  // clumped at the cold/pale end of the scale (hence the confusion).
  // COLOR_MAX_KM uses a more realistic reference distance, and the curve
  // (pow 0.55) pushes more contrast into the near range, which is what
  // actually matters for knowing whether you're improving.
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

  // Same projection as lonLatToXY but taken to a 3D point on the sphere
  // (radius r), derived from THREE.SphereGeometry's real UV formula
  // (uv = (u, 1-v), with phi=u*2π, theta=v*π) so it aligns with the texture.
  // Used both for the vector outline and for centering the camera on a
  // country.
  function lonLatTo3D(lon, lat, r) {
    const theta = (90 - lat) * Math.PI / 180;
    const phi = (lon + 180) * Math.PI / 180;
    return {
      x: -r * Math.cos(phi) * Math.sin(theta),
      y: r * Math.cos(theta),
      z: r * Math.sin(phi) * Math.sin(theta),
    };
  }

  // Inverse of lonLatTo3D: from a unit 3D point (local, no sphere rotation)
  // to lon/lat — used to know which country you touched on a click.
  function xyzToLonLat(x, y, z) {
    const theta = Math.acos(Math.max(-1, Math.min(1, y)));
    const phi = Math.atan2(z, -x);
    const lat = 90 - theta * 180 / Math.PI;
    let lon = phi * 180 / Math.PI - 180;
    if (lon < -180) lon += 360;
    if (lon > 180) lon -= 360;
    return [lon, lat];
  }

  // Point-in-polygon (ray casting) in lon/lat coordinates. Approximate
  // (doesn't handle the antimeridian specially) but plenty for knowing which
  // country a click landed in.
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
  // Some dataset countries overlap in the drawing (e.g. Morocco draws its
  // territory including the Western Sahara area, which also exists as a
  // separate country) — a point there matches both. Instead of keeping the
  // first one in the array (arbitrary), the one with SMALLER area is
  // preferred: the smaller/more specific country is the one that actually
  // corresponds to that piece of map.
  function countryAtLonLat(lon, lat) {
    let best = null;
    countries.forEach(c => {
      if (!pointInGeometry(lon, lat, c.geometry)) return;
      if (!best || c.area < best.area) best = c;
    });
    return best;
  }

  // Click (no drag) on the canvas: raycast against the sphere, 3D point ->
  // lon/lat -> country under the cursor, and center the camera there.
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
    // Only centers the camera on ALREADY-guessed countries (or the correct
    // one, if already won) — same criterion as updateHoverLabel. Without this
    // check, touching ANY country on the globe (even one not yet
    // typed/confirmed as a guess) already centered the camera there, giving
    // the feeling the game "typed" the answer on its own.
    const isGuessed = (solved && country.name === dailyCountry.name) ||
      guesses.some(g => g.name === country.name);
    if (isGuessed) focusOnCountry(country);
  }

  // Repositions the label to the CURSOR coordinates (not a fixed point):
  // converts the screen clientX/clientY to design-stage coordinates
  // (1920x911, see letterbox.js) using the screen's own rect, which is
  // already post-transform/scale — so the label follows the mouse at any
  // window size.
  function updateHoverLabel(clientX, clientY) {
    const el = document.getElementById('gq-hover-name');
    if (!el) return;
    const country = countryAtScreenPoint(clientX, clientY);
    // Only shown if it's an ALREADY typed/guessed country (or the correct
    // one, if already won) — no spoiling names of unmarked countries.
    const isGuessed = country && (
      (solved && country.name === dailyCountry.name) ||
      guesses.some(g => g.name === country.name)
    );
    if (!isGuessed) { el.style.display = 'none'; return; }
    el.textContent = displayName(country);
    el.style.display = 'block';
    // Follows the mouse: converts clientX/Y (screen) to design-stage
    // coordinates (1920x911, see letterbox.js) using the screen's own rect,
    // which is already post-transform/scale.
    const screenEl = document.getElementById('globequiz-screen');
    const rect = screenEl.getBoundingClientRect();
    const stageW = window.STAGE_W || 1920, stageH = window.STAGE_H || 911;
    const localX = (clientX - rect.left) / rect.width * stageW;
    const localY = (clientY - rect.top) / rect.height * stageH;
    el.style.left = localX + 'px';
    el.style.top = (localY + 20) + 'px'; // below the cursor
  }

  // Downsampling a ring for the vector outline (more generous than the one
  // used for the distance calculation: here it matters that it looks smooth).
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

  // Black outline drawn as real 3D lines on the sphere (not baked into the
  // canvas texture) — so it looks crisp regardless of zoom, instead of
  // pixelating like any raster stroke.
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
    if (solved) {
      addOutline(dailyCountry.geometry);
      (LINKED_TERRITORIES[dailyCountry.name] || []).forEach(linkedName => {
        const geom = linkedTerritoryGeoms[linkedName];
        if (geom) addOutline(geom);
      });
    }
    guesses.forEach(g => {
      const c = countryByName.get(normalize(g.name));
      if (c) addOutline(c.geometry);
      // Linked territories (Falkland Is./Malvinas) are NEVER in
      // countryByName on purpose (see linkedTerritoryGeoms) — their geometry
      // lives there instead.
      (LINKED_TERRITORIES[g.name] || []).forEach(linkedName => {
        const geom = linkedTerritoryGeoms[linkedName];
        if (geom) addOutline(geom);
      });
    });
  }

  function shortestAngleDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Animates the sphere's rotation (to center the country) and, if needed,
  // the zoom too — so the player sees at a glance where the guess landed,
  // without dragging/zooming manually.
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

  // With Euler order 'XYZ' (Object3D's default), the real rotation matrix
  // is Rx(x)·Ry(y) — i.e. Ry is applied to the point FIRST and Rx after.
  // (The first version of this assumed the reverse order — Rx first, Ry
  // after — which is why it sometimes pointed wrong or came out mirrored:
  // for most points that assumption gives a different angle from the real
  // one.)
  //
  // Camera distance needed for a point at angle θ (radians, on the unit
  // sphere) from the framing center to sit at most TARGET_HALF_FOV from the
  // view axis — derived from tan(α) = sinθ/(d-cosθ) solving for d, with
  // d = cosθ + sinθ/tan(α). TARGET_HALF_FOV uses a margin (not the real
  // half-FOV of 22.5°) so the country isn't stuck against the edge of the
  // circular viewport.
  const TARGET_HALF_FOV = 26 * Math.PI / 180;
  function zoomToFitAngle(theta) {
    return Math.cos(theta) + Math.sin(theta) / Math.tan(TARGET_HALF_FOV);
  }
  // Auto-framing's OWN zoom floor (farther than MIN_Z, the manual
  // wheel/pinch zoom limit) — very small countries (Vatican, Monaco) still
  // shouldn't zoom in as far as manual zoom allows, it felt like "way too
  // much" zoom all at once when marking them.
  const AUTO_FIT_MIN_Z = 2.3;

  function focusOnCountry(country) {
    if (!sphere || !country) return;
    const [lon, lat] = country.centroid;
    const p = lonLatTo3D(lon, lat, 1);
    const r1 = Math.sqrt(p.x * p.x + p.z * p.z);
    const targetRotY = Math.atan2(-p.x, p.z);
    const targetRotX = Math.atan2(p.y, r1);

    // Angular radius of the country (main territory, no exclaves — same
    // criterion as the centroid) relative to its own center: the largest
    // angle between the centroid and any point of its main border.
    const centroidDir = p; // already a unit vector
    let maxTheta = 0;
    country.mainRingPts.forEach(([plon, plat]) => {
      const q = lonLatTo3D(plon, plat, 1);
      const dot = Math.max(-1, Math.min(1, centroidDir.x * q.x + centroidDir.y * q.y + centroidDir.z * q.z));
      const theta = Math.acos(dot);
      if (theta > maxTheta) maxTheta = theta;
    });
    // Always frames to the country's real size: zooms out if it's large and
    // didn't fit (e.g. Russia while zoomed in), and zooms IN if it's small
    // (e.g. Vatican/Singapore), so it doesn't look like a lost dot if we were
    // coming from a large country. clampZoom already sets a floor (MIN_Z) so
    // as not to over-zoom on tiny countries.
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
    // texCtx only exists if initThreeScene() ran (see Promise.all in
    // initGlobeQuiz) — if the 3D globe couldn't load, submitGuess() still
    // runs (input/confirm now always work) and this is called with no globe;
    // without this guard it threw a TypeError here and cut the function off
    // before reaching renderGuessList()/updateHint(), i.e. the player still
    // saw no feedback on confirming.
    if (!texCtx) return;
    texCtx.fillStyle = OCEAN;
    texCtx.fillRect(0, 0, TEX_W, TEX_H);

    // All default land goes in ONE path/fill: being a single continuous
    // stroke there's no seam between neighboring countries (nor any need to
    // "fatten" each one with its own stroke to hide it, which is what looked
    // odd/bloated). Marked countries are painted separately, on top.
    const marked = new Map();
    if (solved) {
      marked.set(dailyCountry.name, CORRECT_COLOR);
      (LINKED_TERRITORIES[dailyCountry.name] || []).forEach(linked => marked.set(linked, CORRECT_COLOR));
    }
    guesses.forEach(g => {
      marked.set(g.name, g.color);
      (LINKED_TERRITORIES[g.name] || []).forEach(linked => marked.set(linked, g.color));
    });

    texCtx.beginPath();
    countries.forEach(c => { if (!marked.has(c.name)) addGeometryToPath(c.geometry); });
    // Linked territories (Falkland Is./Malvinas) — drawn as ordinary land
    // right alongside everything else, just never part of `countries` (so
    // they're never pickable/guessable on their own).
    Object.keys(linkedTerritoryGeoms).forEach(name => { if (!marked.has(name)) addGeometryToPath(linkedTerritoryGeoms[name]); });
    texCtx.fillStyle = LAND_DEFAULT;
    texCtx.fill('evenodd');

    countries.forEach(c => {
      const color = marked.get(c.name);
      // Stroke the same color as the fill: only seals the canvas's
      // antialiased seam against the base map, it's not the visible outline
      // (that's now the 3D vector line, see updateOutlines, which doesn't
      // pixelate on zoom).
      if (color) paintGeometry(c.geometry, color, color);
    });
    Object.keys(linkedTerritoryGeoms).forEach(name => {
      const color = marked.get(name);
      if (color) paintGeometry(linkedTerritoryGeoms[name], color, color);
    });
    if (canvasTex) { canvasTex.needsUpdate = true; }
    updateOutlines();
    render();
  }

  function render() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    // opacity>0 only past BASE_Z of zoom (see updateSpaceVignette) — at
    // normal/near zoom (most of a match) this skips the entire render pass
    // of the second scene, not just hides it with CSS.
    if (starRenderer && starGroup && sphere && starMaterial && starMaterial.opacity > 0) {
      starGroup.rotation.x = sphere.rotation.x;
      starGroup.rotation.y = sphere.rotation.y;
      starRenderer.render(starScene, starCamera);
    }
  }

  // Slow auto-rotation while the player hasn't made any guess yet (to orient
  // them/show the globe) — the only exception to the rest of the module's
  // render-on-demand, and it stops itself as soon as there's a first guess
  // or the player drags manually.
  // rad per update (see AUTO_ROTATE_FRAME_MS below: it now runs at ~15
  // updates/sec instead of rAF's native 60, so the increment goes up ~4x to
  // keep the same real angular speed as before).
  const AUTO_ROTATE_SPEED = 0.0028;
  // ~15fps instead of raw rAF's 60fps: still looks smooth spinning slowly,
  // but the GPU stops being "always active" on every screen frame — a laptop
  // with a dedicated GPU noticed the constant activity and powered it on.
  // Time-based (not frame-counting) so the spin speed doesn't depend on the
  // monitor's refresh rate.
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

  // Inertia on releasing the globe after dragging it hard: it keeps spinning
  // at the speed it had and slows down gradually (exponential friction),
  // instead of stopping dead — the "Wii weather channel globe" effect. It
  // stops itself when the speed is negligible, or if the player grabs the
  // globe again (see pointerdown).
  const INERTIA_FRICTION = 0.9982; // per ms — closer to 1 = slows down more slowly
  const INERTIA_MIN_VEL = 0.00002;
  function startInertia() {
    stopInertia();
    if (Math.abs(velY) < INERTIA_MIN_VEL) return;
    let v = velY;
    let lastT = performance.now();
    function step(t) {
      const dt = Math.min(48, t - lastT); // clamp in case of a slow frame/backgrounded tab
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

  // "3, 2, 1, GO" on entry — SAME timings as PREGAME_STEPS (the game's real
  // countdown, see js/modes/mapgame-play.js), its own overlay (doesn't share
  // #pregame-countdown with the other modes to avoid interference).
  const GQ_COUNTDOWN_STEPS = [
    { src: 'images/countdown/3.png', hold: 750, size: 46 },
    { src: 'images/countdown/2.png', hold: 750, size: 46 },
    { src: 'images/countdown/1.png', hold: 750, size: 46 },
    { src: 'images/countdown/go.png', hold: 950, size: 54 },
  ];
  let gqCountdownTimeout = null, gqCountdownAborted = false;
  let gqEndgameTimeout = null;
  // VS 1v1: how long each side's animation lasts (winner's celebration here,
  // loser's gameover.png in vs.js) before the you-won/you-lost banner
  // appears — same value in both files so they end roughly together.
  const GQ_VS_ANIM_MS = 2000;
  window._GQ_VS_ANIM_MS = GQ_VS_ANIM_MS;
  // elapsedMs (optional): how much of the 3-2-1 already elapsed on the other
  // side — the spectator uses it (see globequizSpectatorShowPregame) to start
  // at the right number instead of always from "3", if they connect mid-
  // countdown. Same pattern as runPregameCountdown in
  // js/modes/mapgame-play.js/cities. _specReportPregame lives at the CALL
  // SITE (initGlobeQuiz), not inside here — only the real player should
  // broadcast the 3-2-1 start; the spectator calls this same function to
  // SHOW it, never to report it again.
  function runGqPregameCountdown(onDone, elapsedMs) {
    const wrap = document.getElementById('gq-pregame-countdown');
    const img = document.getElementById('gq-pregame-countdown-img');
    if (!wrap || !img) { onDone(); return; }
    gqCountdownAborted = false;
    wrap.style.display = 'flex';
    let step = 0;
    let firstStepRemaining = null;
    if (elapsedMs > 0) {
      let acc = 0;
      for (let i = 0; i < GQ_COUNTDOWN_STEPS.length; i++) {
        const stepEnd = acc + GQ_COUNTDOWN_STEPS[i].hold;
        if (elapsedMs < stepEnd) { step = i; firstStepRemaining = stepEnd - elapsedMs; break; }
        acc = stepEnd;
        step = i + 1;
      }
      if (step >= GQ_COUNTDOWN_STEPS.length) { wrap.style.display = 'none'; onDone(); return; }
    }
    if (typeof sfxCountdown !== 'undefined') {
      sfxCountdown.currentTime = elapsedMs > 0 ? elapsedMs / 1000 : 0;
      sfxCountdown.play().catch(() => {});
    }
    function showStep() {
      if (gqCountdownAborted) return; // quit with power mid-3-2-1
      if (step >= GQ_COUNTDOWN_STEPS.length) {
        wrap.style.display = 'none';
        onDone();
        return;
      }
      const s = GQ_COUNTDOWN_STEPS[step++];
      const thisHold = firstStepRemaining != null ? firstStepRemaining : s.hold;
      firstStepRemaining = null;
      img.style.width = s.size + 'cqmin';
      img.style.height = s.size + 'cqmin';
      img.src = s.src;
      img.classList.remove('gq-pop');
      void img.offsetWidth; // restarts the animation on each step
      img.classList.add('gq-pop');
      gqCountdownTimeout = setTimeout(showStep, thisHold);
    }
    showStep();
  }
  // Cuts the 3-2-1-GO dead (pending timeout + sound + overlay) — called on
  // quitting with power mid-countdown, so countdown.mp3 doesn't keep playing
  // in the background nor does onDone (which starts gamemusic) fire after
  // returning to the menu.
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

  // Countdown to the next LOCAL midnight (same day boundary as
  // dateKey/gq_streak_last_date) — shown in the end-of-match modal once the
  // player has already earned (or replayed) today's streak.
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

  // Same countdown but for the MENU panel (loading-globequiz-*, before
  // starting to play) — a separate interval from the end-of-match one
  // because one can stay visible without the other depending on the screen.
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

  // "Space" vignette (see .gq-space-vignette in style.css, full background
  // behind the globe AND sky3.png): only starts appearing past the default
  // zoom (BASE_Z) — at normal or near zoom it stays 0, invisible — and
  // reaches maximum darkness at MAX_Z. The transparent radius (--gq-vig-core)
  // follows the sphere's REAL on-screen radius (perspective projection,
  // 45° FOV camera) — with a hand-approximated radius (linear interpolation)
  // a thin ring of sky3.png peeked between the globe edge and the start of
  // the black through much of the zoom, which is exactly the "cyan bordering
  // the globe" that was visible.
  const CAMERA_HALF_FOV_RAD = (45 / 2) * Math.PI / 180; // same FOV as new THREE.PerspectiveCamera(45, ...)
  const VISOR_RADIUS_CQMIN = 36; // .gq-globe-wrap: 72cqmin diameter
  function sphereScreenRadiusCqmin(z) {
    // Angle between the camera axis and the point where the sphere (radius 1)
    // is seen edge-on, from a camera at distance z: asin(r/d).
    const theta = Math.asin(Math.min(1, 1 / z));
    const frac = Math.tan(theta) / Math.tan(CAMERA_HALF_FOV_RAD);
    return frac * VISOR_RADIUS_CQMIN;
  }
  // --gq-vig-t/--gq-vig-core are set on #globequiz-screen — .gq-space-vignette
  // (black fill, DOM/CSS) inherits them via custom property, and they're
  // also used here to raise starMaterial.opacity (the stars, see
  // initStarfield). t=0 at default/near zoom, invisible.
  function updateSpaceVignette() {
    const screenEl = document.getElementById('globequiz-screen');
    if (!screenEl) return;
    const t = Math.max(0, Math.min(1, (zoomZ - BASE_Z) / (MAX_Z - BASE_Z)));
    // -1cqmin margin so the black starts flush against the globe's real
    // silhouette instead of leaving a pixel of air.
    const core = Math.max(0, sphereScreenRadiusCqmin(zoomZ) - 1);
    screenEl.style.setProperty('--gq-vig-t', t.toFixed(3));
    screenEl.style.setProperty('--gq-vig-core', core.toFixed(2) + 'cqmin');
    if (starMaterial) starMaterial.opacity = t;
    // The nebulae stay quite a bit fainter than the stars (0.35 cap, not 1)
    // — they're background detail, not the focus.
    nebulaMaterials.forEach(mat => { mat.opacity = t * 0.35; });
  }

  // Stars: a SEPARATE Three.js scene (its own canvas, #gq-starfield-canvas,
  // full screen) — they don't hang off `sphere` as in an earlier attempt,
  // because that geometry lives INSIDE the globe canvas, which is clipped to
  // the 72cqmin circle (.gq-globe-wrap); it could never draw anything
  // outside that circle. Here the camera stays fixed at the CENTER of the
  // point shell (radius STARFIELD_RADIUS) — at that distance all points are
  // always the same distance from the camera, and all that's needed for
  // them to spin in sync with the globe is copying sphere.rotation.x/y to
  // the Points object each frame (see render()) — with real 3D geometry,
  // not a CSS rotate()/rotateX/rotateY faking depth, and now without the
  // viewport circle limit.
  // Variable (not fixed) radius per star: since this scene's camera is fixed
  // at the exact center of the shell, each point's distance TO THE CAMERA is
  // directly its own radius — with sizeAttenuation that's enough for the
  // "nearer" ones (small radius) to look bigger than the "farther" ones
  // (large radius), without needing a custom shader with per-vertex size.
  const STARFIELD_RADIUS_MIN = 5;
  const STARFIELD_RADIUS_MAX = 9;
  const STARFIELD_COUNT = 300;
  let starScene = null, starCamera = null, starRenderer = null, starPoints = null, starGroup = null;
  let starMaterial = null;
  const nebulaMaterials = [];

  // Circular sprite baked into a small canvas (white -> transparent radial
  // gradient) — without this, THREE.PointsMaterial draws each point as a
  // solid square (the default sprite quad, no texture).
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

  // Nebula: deliberately WITHOUT much detail (no complex shapes/clouds) —
  // a handful of soft, large color blobs, overlapping, each a radial-gradient
  // fading to transparent. With additive blending (see nebulaMaterial) it
  // looks like a gas glow, not a "painted" texture. `colors` is
  // parameterizable to instantiate several nebulae with different palettes
  // (see initStarfield).
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
    // antialias:false — the sprite is already smoothed (gradient from
    // buildStarSpriteTexture's canvas), no MSAA needed for 300 small points,
    // and on a full-screen canvas it was this layer's biggest cost.
    starRenderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
    // Capped at 1 (not devicePixelRatio) for the same reason: they're blurry
    // background points, they don't need retina sharpness, and rendering at
    // 2x full-screen is 4x the pixels per frame.
    starRenderer.setPixelRatio(1);

    // Uniform points on the sphere (Marsaglia, normalizing a random vector
    // inside the unit sphere) — with random lat/lon the points clump at the
    // poles, noticeable as two star "blobs". Per-point radius (= distance to
    // the camera, see above) and brightness are random and INDEPENDENT of
    // each other: some come out large AND opaque, others small AND faint,
    // but also cross combinations — more variety than if size and brightness
    // always went together.
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
      // High floor (0.6) so most look nicely white, with some variation (up
      // to 1.0) so they don't all have the same brightness/glow.
      const brightness = 0.6 + Math.random() * 0.4;
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starMaterial = new THREE.PointsMaterial({
      size: 0.05, // was 0.11, came out big
      sizeAttenuation: true, // together with the variable radius above, this is what makes them look "nearer/farther"
      map: buildStarSpriteTexture(),
      transparent: true,
      vertexColors: true, // per-point brightness (see colors above), adds depth
      depthWrite: false,
      opacity: 0, // starts invisible, updateSpaceVignette raises it with zoom
    });
    starPoints = new THREE.Points(geo, starMaterial);

    // Nebula sprites: billboards (always facing the camera, THREE.Sprite's
    // native behavior), spread across the shell so they don't cover the
    // globe when it's centered. Additive blending (adds to what's already
    // drawn, doesn't cover it) so they look like a gas glow and not an
    // opaque patch. Two nebulae with different palettes — not one — so it
    // feels more like real space and not a single repeated ornament.
    const NEBULAE = [
      { lon: -40, lat: 25, scale: 13, colors: [
        [0.4, 0.45, 0.5, 'rgba(150,90,220,0.55)'],  // violet
        [0.62, 0.55, 0.42, 'rgba(60,170,200,0.4)'], // teal
        [0.5, 0.3, 0.3, 'rgba(230,110,180,0.3)'],   // magenta, adds richness
      ] },
      { lon: 100, lat: -18, scale: 10, colors: [
        [0.45, 0.5, 0.46, 'rgba(80,120,230,0.45)'],  // blue
        [0.6, 0.4, 0.36, 'rgba(230,140,70,0.3)'],    // amber, contrast with the first
      ] },
    ];
    const nebulaSprites = NEBULAE.map(n => {
      const mat = new THREE.SpriteMaterial({
        map: buildNebulaTexture(n.colors),
        transparent: true,
        opacity: 0, // starts invisible, updateSpaceVignette raises it with zoom
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      nebulaMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(n.scale, n.scale, 1);
      const pos = lonLatTo3D(n.lon, n.lat, 7); // fixed on the shell, spins along with the stars/globe
      sprite.position.set(pos.x, pos.y, pos.z);
      return sprite;
    });

    // Group: rotates as a single unit (see render()), stars/nebulae always
    // in sync with each other and with the globe's real rotation.
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
    // pixelRatio fixed at 1, set once in initStarfield — no need to override
    // it here on every resize.
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
    // We force a square area (the smaller of the two sides) regardless of
    // whether the container ended up measuring differently from some
    // rounding/layout — so the camera is always at aspect 1:1 and the globe
    // never comes out oval.
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
    // z=2.5 left the sphere radius (1) just OUTSIDE the frustum (subtended
    // angle 23.6° > half-FOV 22.5°), clipping the globe at the edges. z=3.0
    // lowers the angle to ~19.5° (vs 22.5° half-FOV): the globe fills the
    // frame more than at z=3.4 but still with plenty of margin.
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
      // Auto-rotation keeps running even while you drag/zoom — it only stops
      // on the first guess (see submitGuess).
      stopInertia(); // grabbing the globe again stops any spin still going from inertia
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
      // Drag sensitivity scales with zoom: up close (small zoomZ) the same
      // pixel displacement covers many more degrees of visible surface, so
      // without this adjustment the globe spun "uncontrollably" when zoomed
      // in. Proportional to zoomZ/BASE_Z (the default zoom), calibrated to
      // feel the same as before at that distance.
      const sens = DRAG_SENSITIVITY * (zoomZ / BASE_Z);
      const rotDeltaY = dx * sens;
      sphere.rotation.y += rotDeltaY;
      sphere.rotation.x = Math.max(-ROT_X_LIMIT, Math.min(ROT_X_LIMIT, sphere.rotation.x + dy * sens));
      render();
      // Recent angular speed (rad/ms), for the inertia on release —
      // "recent" because a drag can slow down just before releasing (you
      // don't want it to inherit the speed from 3 frames ago).
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
      // Real click (no drag) on the globe: identifies the country under the
      // cursor and centers/zooms the camera there — the same navigation the
      // guess list already has, but clicking directly on the map.
      if (wasSingle && !moved) {
        clickOnGlobe(e.clientX, e.clientY);
      } else if (wasSingle && wasDragging) {
        // Released after dragging: if you had speed, the globe keeps
        // spinning "wildly" and slowing down gradually (Wii weather channel
        // globe style), it doesn't stop dead. But a tiny drag (barely past
        // the "moved" threshold) must not inherit inertia — only spins with
        // real travel.
        const dragDist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (dragDist > 25) startInertia();
      }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    // Hover (mouse with no button held, not to be confused with the rotate
    // drag): shows the name of the country under the cursor below.
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

  // Each entry to the screen is a new match (for now, no persistence between
  // visits nor a fixed "of the day" country).
  function loadState() {
    guesses = [];
    solved = false;
    animatedGuessNames = new Set();
    _gqSuggestion = null;
  }

  function saveState() { /* no persistence for now */ }

  // Picks THIS match's target country at random — it used to come from a
  // deterministic hash of the date (same country for everyone, all day), but
  // that meant replaying the same day ALWAYS gave you the same country (the
  // reported "it doesn't stay the same"): each new match must draw its own,
  // independent per player. The streak (updateStreak/dateKey) doesn't depend
  // on this — it only checks whether you already played TODAY, regardless of
  // which country you got — so it still works the same. The spectator also
  // doesn't need to know the country in advance: each guess already arrives
  // with the distance/direction ALREADY computed by the real player (see
  // submitGuess), and the country itself is only broadcast on winning/
  // finishing (_specReportAnswer win / _specReportPostgame) — none of this
  // depended on the country being predictable by date.
  // GloboReto grupal: nunca repite un país dentro del mismo match — sin esto,
  // reseedear con "baseSeed + ronda*7919" y sacar UN solo valor por ronda
  // podía dar el mismo índice dos rondas seguidas (xorshift32 con un único
  // draw por seed no garantiza buena dispersión entre seeds tan parecidas).
  // Redibuja de la MISMA racha de la PRNG (nunca reseedea a mitad de match,
  // ver _gqGroupBeginRound) hasta encontrar uno nuevo — determinístico e
  // idéntico en todos los clientes, porque todos llaman pickDailyCountry()
  // el mismo número de veces en el mismo orden.
  function pickDailyCountry() {
    let idx = Math.floor(gqRand() * countries.length);
    if (window._gqGroupActive || window._gqGroupTurnsActive) {
      let guard = 0;
      while (_gqGroupUsedCountries.has(countries[idx].name) && guard < 50) {
        idx = Math.floor(gqRand() * countries.length);
        guard++;
      }
      _gqGroupUsedCountries.add(countries[idx].name);
    }
    dailyCountry = countries[idx];
  }

  // VS 1v1: host and guest start with the same seed (see vs.js
  // _startSeededRandom) so pickDailyCountry() above gives them the SAME
  // country without ever transmitting it — same pattern as citiesSetSeed/
  // monumentsSetSeed (deterministic xorshift).
  let _gqSeededRand = null;
  function gqRand() { return _gqSeededRand ? _gqSeededRand() : Math.random(); }
  window.globequizSetSeed = function(seed) {
    let s = seed >>> 0; if (!s) s = 1;
    _gqSeededRand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
  };
  window.globequizClearSeed = function() { _gqSeededRand = null; };

  // "Bar chart race" style: the closest guess (top) looks bigger, shrinking
  // as it drops in position. On reorder (a new guess closer than an old
  // one), the rows that were ALREADY there animate with FLIP (First Last
  // Invert Play) from their previous position/size to the new one, instead
  // of jumping — the "overtake" of one row past another.
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
      // Only genuinely new rows animate the entrance — the ones already
      // there are re-rendered (from the re-sort) without repeating it here,
      // but they do FLIP below if they changed position/size.
      const isNew = !animatedGuessNames.has(g.name);
      if (isNew) animatedGuessNames.add(g.name);
      row.className = 'gq-guess-item' + (isNew ? ' gq-item-new' : '');
      row.title = t('globequiz.clickToFocus');
      const scale = Math.max(RANK_SCALE_MIN, 1 - rank * RANK_SCALE_STEP);
      row.style.setProperty('--rank-scale', scale);
      // Large circular flag (same pattern as .loading-social-flag /
      // flagUrlForCountryCode, images/flags folder).
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
      // Already-guessed country is selectable: clicking it re-centers/zooms
      // the camera on it, without spending a new guess.
      if (c) row.addEventListener('click', () => focusOnCountry(c));
      list.appendChild(row);
      if (!isNew) flippedRows.push({ row, scale });
    });

    // FLIP: for each row that already existed, compute the delta between its
    // OLD position/size (captured above) and the new one, start there with
    // no transition, and animate toward the final state on the next frame.
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

  // Confetti burst (colored divs, no canvas/library) from the globe center
  // on a correct guess. Each particle removes itself when its own animation
  // ends — nothing stays alive in the DOM afterward.
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
      const tx = Math.cos(angle) * dist, ty = Math.sin(angle) * dist - 10; // biased upward
      const duration = 0.8 + Math.random() * 0.6;
      p.style.setProperty('--cx', '0cqmin');
      p.style.setProperty('--cy', '0cqmin');
      p.style.setProperty('--tx', tx.toFixed(2) + 'cqmin');
      p.style.setProperty('--ty', (ty + 30).toFixed(2) + 'cqmin'); // ends up falling
      p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      p.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      p.style.animationDuration = duration + 's';
      p.style.animationDelay = (Math.random() * 0.15) + 's';
      container.appendChild(p);
      setTimeout(() => p.remove(), (duration + 0.2) * 1000);
    }
  }
  // Exposed for the GroupSpectate "por turnos" mirror (spectate.js) — a
  // passive external spectator never runs showWin() themselves (they never
  // guess), so without this they never saw ANY confetti for a round someone
  // else won.
  window._gqSpawnConfetti = spawnConfetti;

  function showWin() {
    spawnConfetti();
    const msg = document.getElementById('gq-win-msg');
    if (!msg) return;
    msg.innerHTML = '';
    msg.style.display = 'block';
    // Green cell in the guess-list style (flag + "correct country"), instead
    // of the "you did it in X attempts" text.
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

  // End-of-game panel: correct country (with flag), time, attempts and the
  // table of options you tried with their distance — appears a beat after
  // showWin (confetti/green cell) so that celebration is seen before the
  // modal covers it.
  // Days-played streak: +1 if you played YESTERDAY (it continues), resets to
  // 1 if a day was skipped, and doesn't add again if you already played
  // TODAY (winning twice the same day doesn't inflate the streak). Logged in,
  // it persists in profiles.gq_streak_count/gq_streak_last_date (Supabase);
  // as a guest it stays in localStorage, same criterion as the rest of this
  // mode. ISO format with zeros (YYYY-MM-DD) — must match exactly the format
  // Postgres's `date` column returns (gq_streak_last_date), otherwise the
  // comparison never matches after a page reload.
  //
  // NOTE: this used to read d.getFullYear()/getMonth()/getDate() — each
  // player's browser LOCAL fields. With that, "the day" (and therefore the
  // country of the day, see pickDailyCountry) changed at different moments
  // per time zone (someone in Argentina saw the new country hours before
  // someone in Spain, say) — the report: the reset must be the SAME instant
  // for everyone, at midnight New York time (America/New_York, DST-aware —
  // EDT in summer/EST in winter, as befits "midnight in NYC" year-round). d
  // is still an absolute instant (epoch ms) — gqStreakAlive/updateStreak's
  // "-1 day" (yesterday.setDate(...)) still works the same, only the time
  // zone the result is read in changes.
  function dateKey(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d);
  }
  // Returns { streak, isNewDay } — isNewDay=false when today was already
  // counted (winning twice the same day doesn't re-grant XP/coins, see
  // showEndgameModal: the currency ledger is only called with isNewDay=true).
  // elapsedMs: THIS match's time (only persisted as "the day's time" when
  // it's the one that actually secures the streak, see isNewDay) — shown by
  // GlobeQuiz's friends bar (buildGqFriendRows) to compare against each
  // friend's time for today.
  // Tells js/menu/globoreto-popups.js a streak day was just secured; `first`
  // = this account/device never had a streak before (shows "you started a
  // streak" on leaving GloboReto).
  function notifyStreak(streak, first) {
    try { window.dispatchEvent(new CustomEvent('gqStreakUpdated', { detail: { streak, first } })); } catch (e) {}
  }

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
      if (lastStr === todayStr) return { streak, isNewDay: false }; // already counted today
      const first = !lastStr && !(streak > 0);
      streak = (lastStr === yesterdayStr) ? streak + 1 : 1;
      profile.gq_streak_count = streak;
      profile.gq_streak_last_date = todayStr;
      profile.gq_today_time_ms = elapsedMs;
      try {
        await window.sbUpdateProfile(userId, { gq_streak_count: streak, gq_streak_last_date: todayStr, gq_today_time_ms: elapsedMs });
      } catch (e) {}
      if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
      if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
      notifyStreak(streak, first);
      return { streak, isNewDay: true };
    }

    const lastStr = localStorage.getItem('gq_streak_last_date');
    let streak = parseInt(localStorage.getItem('gq_streak_count') || '0', 10) || 0;
    if (lastStr === todayStr) return { streak, isNewDay: false }; // already counted today
    const first = !lastStr && !(streak > 0);
    streak = (lastStr === yesterdayStr) ? streak + 1 : 1;
    try {
      localStorage.setItem('gq_streak_count', String(streak));
      localStorage.setItem('gq_streak_last_date', todayStr);
      localStorage.setItem('gq_today_time_ms', String(elapsedMs));
    } catch (e) {}
    if (typeof window.gqRefreshMenuStreakBadge === 'function') window.gqRefreshMenuStreakBadge();
    if (typeof window.gqRefreshProfileStreakBadge === 'function') window.gqRefreshProfileStreakBadge();
    notifyStreak(streak, first);
    return { streak, isNewDay: true };
  }

  function gqStreakAlive(count, lastStr) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const alive = lastStr === dateKey(today) || lastStr === dateKey(yesterday);
    return alive ? (count || 0) : 0;
  }

  // Reads the saved streak WITHOUT incrementing it, and returns 0 if it's
  // already broken (last day played is neither today nor yesterday) — used
  // by any own-streak badge outside the end-of-match panel (menu, profile).
  // Logged in, it ALWAYS asks the server for fresh data instead of trusting
  // window._sbProfile (which can be stale or not ready yet from a race with
  // session restore) — so the streak is genuinely tied to the server and
  // not a local cache.
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
  window.gqReadCurrentStreak = gqReadCurrentStreak;

  // Unlike gqReadCurrentStreak ("live" streak if you played today OR
  // yesterday), this is strictly "did you already play TODAY?" — used for
  // the hostess's greeting/description bubble in the menu
  // (panel2.globequizGreet*/globequizDesc*), which should note that today's
  // streak is already earned instead of inviting you to find the country.
  // Deliberately SYNCHRONOUS (it used to ask the server for fresh data with
  // await) — that network round-trip made the panel open for an instant
  // with the default text and only ~200ms later "jump" to the right text.
  // window._sbProfile (which updateStreak() already keeps current on every
  // win) is enough here for the text to come out right from the start, no
  // flicker.
  window.gqHasPlayedToday = function () {
    const todayStr = dateKey(new Date());
    const userId = window._sbUserId;
    if (userId) {
      const p = window._sbProfile;
      return !!(p && p.gq_streak_last_date === todayStr);
    }
    return localStorage.getItem('gq_streak_last_date') === todayStr;
  };

  // Streak badge above the GloboReto button in the main menu — here it IS
  // hidden entirely at 0 (no "broken streak" to show in the menu).
  window.gqRefreshMenuStreakBadge = async function () {
    const badge = document.getElementById('loading-globequiz-streak');
    const numEl = document.getElementById('loading-globequiz-streak-num');
    if (!badge || !numEl) return;
    const shown = await gqReadCurrentStreak();
    numEl.textContent = String(shown);
    badge.style.display = shown > 0 ? 'block' : 'none';
  };

  // Streak badge in the OWN PROFILE panel, next to the highscore block —
  // always visible (unlike the menu); at 0 it shows the flame in black and
  // white with a "0" on top.
  window.gqRefreshProfileStreakBadge = async function () {
    const badge = document.getElementById('loading-profile-streak');
    const numEl = document.getElementById('loading-profile-streak-num');
    if (!badge || !numEl) return;
    const shown = await gqReadCurrentStreak();
    numEl.textContent = String(shown);
    badge.style.display = 'block';
    badge.classList.toggle('streak-inactive', shown === 0);
  };

  // Streak badge in a FRIEND's profile panel — receives the row already
  // fetched from Supabase (THAT friend's gq_streak_count/gq_streak_last_date,
  // not the own one), same position/style as the own profile.
  window.gqRefreshFriendStreakBadge = function (streakRow) {
    const badge = document.getElementById('loading-friend-streak');
    const numEl = document.getElementById('loading-friend-streak-num');
    if (!badge || !numEl) return;
    const shown = streakRow ? gqStreakAlive(streakRow.gq_streak_count, streakRow.gq_streak_last_date) : 0;
    numEl.textContent = String(shown);
    badge.style.display = 'block';
    badge.classList.toggle('streak-inactive', shown === 0);
  };

  // ── SHARE RESULT ON X ─────────────────────────────────────────────────────
  let _gqShareData = null;
  const _GQ_SHARE_URL = 'https://mygeochallenge.com/globequiz/';

  function _gqBuildShareText() {
    const d = _gqShareData || {};
    const secs = (d.timeMs || 0) / 1000;
    const time = (secs >= 10 ? secs.toFixed(1) : secs.toFixed(2)) + 's';
    const lang = (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'es';
    const s = d.streak || 1;
    const daysWord = lang === 'en' ? (s === 1 ? 'day' : 'days') : (s === 1 ? 'día' : 'días');
    // Deliberately does NOT reveal the country — the point is to tease friends
    // into playing the same daily. Low streak → "just getting started" + a
    // stronger call to play; higher streak → bragging.
    const game = lang === 'en' ? 'GeoChallenge GlobeQuiz' : 'GloboReto de GeoChallenge';
    const V = { time: time, streak: s, days: daysWord, attempts: d.attempts || 1, game: game, url: _GQ_SHARE_URL };
    const START = s <= 3;
    const TPL = {
      es: START ? [
        '🌍 ¡Acerté el país de hoy en {game}! 🤔\n\nIntentos: {attempts}\nTiempo: {time}\n🌱 Apenas arranco mi racha: {streak} {days}.\n\n¿Te animas con la de hoy? 🎯\n{url}',
        '🗺️ Resolví el país de hoy en {game}. ✅\n\n{attempts} intentos, {time}.\n🌱 Racha: {streak} {days}... esto recién empieza.\n\n¿Cuántos días aguantas tú? 👇\n{url}',
        '🎯 Primer país del día en {game}, listo.\n\nIntentos: {attempts} · {time}\n🌱 Racha: {streak} {days}.\n\nUn país nuevo cada día. ¿Jugamos?\n{url}',
      ] : [
        '🌍 ¡Acerté el país de hoy en {game}! 🤔\n\nIntentos: {attempts}\nTiempo: {time}\n🔥 ¡{streak} {days} seguidos!\n\n¿Tú también lo adivinaste? 🎯\n{url}',
        '🗺️ Resolví el país de hoy en {game}. ✅\n\n{attempts} intentos ({time}).\n🔥 Racha: {streak} {days} sin fallar.\n\nTe toca 👇\n{url}',
        '🎯 Otro país que cae en {game}.\n\nIntentos: {attempts} · {time}\n🔥 {streak} {days} de racha, imparable.\n\n¿Cuánto aguantas tú? 🌍\n{url}',
        '🔥 {streak} {days} seguidos adivinando en {game}.\n\nHoy: {attempts} intentos, {time}.\n\n¿Te animas con la de hoy? 🎯\n{url}',
      ],
      en: START ? [
        "🌍 Nailed today's country on {game}! 🤔\n\nGuesses: {attempts}\nTime: {time}\n🌱 Just started my streak: {streak} {days}.\n\nThink you can get today's? 🎯\n{url}",
        "🗺️ Solved today's country on {game}. ✅\n\n{attempts} guesses, {time}.\n🌱 Streak: {streak} {days} — just getting going.\n\nHow many days can you last? 👇\n{url}",
        "🎯 First country of the day on {game}, done.\n\nGuesses: {attempts} · {time}\n🌱 Streak: {streak} {days}.\n\nA new country every day. Play?\n{url}",
      ] : [
        "🌍 Nailed today's country on {game}! 🤔\n\nGuesses: {attempts}\nTime: {time}\n🔥 {streak} {days} in a row!\n\nDid you get it too? 🎯\n{url}",
        "🗺️ Solved today's country on {game}. ✅\n\n{attempts} guesses ({time}).\n🔥 Streak: {streak} {days} without a miss.\n\nYour turn 👇\n{url}",
        '🎯 Another country down on {game}.\n\nGuesses: {attempts} · {time}\n🔥 {streak} {days} streak, unstoppable.\n\nHow long can you last? 🌍\n{url}',
        '🔥 {streak} {days} straight guessing on {game}.\n\nToday: {attempts} guesses, {time}.\n\nThink you can beat me? 🎯\n{url}',
      ],
    };
    const list = TPL[lang];
    const tpl = list[Math.floor(Math.random() * list.length)];
    return tpl.replace(/\{(\w+)\}/g, (m, k) => (V[k] != null ? V[k] : m));
  }

  function _gqOpenShare() {
    const href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(_gqBuildShareText());
    window.open(href, '_blank', 'noopener,noreferrer');
  }
  window._gqOpenShare = _gqOpenShare;

  async function showEndgameModal() {
    const modal = document.getElementById('gq-endgame-modal');
    if (!modal) return;
    const { streak: currentStreak, isNewDay } = await updateStreak(gqFinalElapsedMs);
    const streakEl = document.getElementById('gq-endgame-streak-num');
    if (streakEl) streakEl.textContent = String(currentStreak);
    // Counts as its own match in the stats dashboard totals (alongside
    // campaign/versus) — GlobeQuiz is standalone, not part of the World
    // Tour. It goes here (not in submitGuess) to send the already-resolved
    // streak instead of duplicating that calculation.
    if (window.Analytics && typeof window.Analytics.logGlobequiz === 'function') {
      window.Analytics.logGlobequiz(guesses.length + 1, gqFinalElapsedMs, currentStreak);
    }
    // XP/coins: ONLY the first time you win in a day (isNewDay, see
    // updateStreak) — winning again the same day grants nothing more, only
    // the next day (when the streak advances again).
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
      // Same "S:CC" (seconds:hundredths) format as the rest of the mode — NOT
      // minutes:seconds.
      const elapsedMs = gqFinalElapsedMs;
      const wholeSec = Math.floor(elapsedMs / 1000);
      const centis = Math.floor((elapsedMs % 1000) / 10);
      timeEl.textContent = wholeSec + ':' + String(centis).padStart(2, '0');
    }
    const attemptsEl = document.getElementById('gq-endgame-attempts');
    if (attemptsEl) attemptsEl.textContent = String(guesses.length + 1); // +1: the winning guess isn't pushed to guesses
    // Snapshot for the "Share on X" button.
    _gqShareData = { country: displayName(dailyCountry), streak: currentStreak, attempts: guesses.length + 1, timeMs: gqFinalElapsedMs };
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

  // Shows a clickable "Did you mean \"X\"?" in the same place as the hint
  // ("hotter/colder" etc.) — on click OR a second Enter on the same text, it
  // fills the input with that country and retries the guess (matches exactly).
  function showSuggestion(country, forNorm) {
    _gqSuggestion = { country: country, forNorm: forNorm };
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
      _gqSuggestion = null;
      submitGuess();
    });
    el.appendChild(link);
    el.appendChild(document.createTextNode('"?'));
  }

  function submitGuess() {
    const input = document.getElementById('gq-guess-input');
    const hintEl = document.getElementById('gq-hint');
    if (!input || solved) return;
    // "Por turnos": the input is disabled while it isn't my turn (see
    // globequizSetMyTurn), this is just a defensive backstop.
    if (window._vsActive && _gqTurnsVariant && !window._gqMyTurn) return;
    const raw = input.value;
    if (!raw.trim()) return;
    const norm = normalize(raw);
    const country = countryByName.get(norm);
    if (!country) {
      // Enter (or re-submit) on the SAME near-miss that already has a
      // "Did you mean X?" showing → accept it, same as clicking the name.
      if (_gqSuggestion && _gqSuggestion.forNorm === norm && _gqSuggestion.country) {
        input.value = displayName(_gqSuggestion.country);
        _gqSuggestion = null;
        submitGuess();
        return;
      }
      const suggestion = findSuggestion(norm);
      if (suggestion) showSuggestion(suggestion, norm);
      else if (hintEl) hintEl.textContent = t('globequiz.notFound');
      return;
    }
    _gqSuggestion = null;
    if (guesses.find(g => g.name === country.name) || (dailyCountry && country.name === dailyCountry.name && solved)) {
      // "Por turnos": the list can hold the OPPONENT's attempts too, so "ya
      // LO intentaste" (implying it was me) would be wrong when it was them.
      if (hintEl) hintEl.textContent = t(_gqTurnsVariant ? 'globequiz.alreadyGuessedShared' : 'globequiz.alreadyGuessed');
      return;
    }
    input.value = '';
    stopAutoRotate();
    if (country.name === dailyCountry.name) {
      solved = true;
      // Captured HERE, not in showEndgameModal (which runs 2s later via the
      // setTimeout) — otherwise those extra 2 seconds were added to the
      // displayed time.
      gqFinalElapsedMs = Math.max(0, Date.now() - gqTimerStart);
      stopTimer();
      _gqStopTurnTimer();
      // Repaints the card with the same frozen value the game-over panel
      // will use — otherwise the last paint of the 30ms interval
      // (gqCardInterval, already stopped in stopTimer) can be up to 30ms
      // older than gqFinalElapsedMs and show a different digit between card
      // and panel. In VS, #gq-lb-player-time is not plain text:
      // globequizVsPrepareOpponentRow put two spans inside it (time/km, see
      // gq-lb-vs-score) — overwriting textContent here would wipe them and
      // leave the card on a single line during the celebration (showWin()
      // doesn't hide .gq-friends-bar).
      if (window._vsActive) {
        const gqCardValEl = document.getElementById('gq-lb-player-time-val');
        if (gqCardValEl) gqCardValEl.textContent = formatGqCardTime(gqFinalElapsedMs);
      } else {
        const gqCardEl = document.getElementById('gq-lb-player-time');
        if (gqCardEl) gqCardEl.textContent = formatGqCardTime(gqFinalElapsedMs);
      }
      // playMusic(null) instead of sfxGameMusic.pause() directly — on iOS
      // the real gamemusic audio runs through a separate AudioBufferSourceNode
      // (Web Audio, see playMusicIOS in js/core/audio.js), not the HTML
      // <audio>; pausing only the <audio> doesn't stop it and the loop keeps
      // playing.
      if (typeof playMusic === 'function') playMusic(null);
      if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); }
      // The analytics event is sent from showEndgameModal() (2s later),
      // once updateStreak() has resolved the current streak — so the event
      // goes out with full duration/streak instead of sending them here and
      // having to duplicate the streak calculation.
      saveState();
      drawTexture();
      renderGuessList();
      showWin();
      updateHint();
      focusOnCountry(country);
      // VS 1v1: the win broadcast goes out RIGHT AWAY (so the opponent
      // starts their gameover.png animation as soon as possible, see
      // _handleGqOpponentWin in vs.js), but MY OWN "YOU WON" banner waits the
      // same GQ_VS_ANIM_MS that showWin() needs to be seen (confetti + green
      // cell, like 1-player) — so both sides finish their animation
      // (celebration here, gameover.png there) and only then does the
      // you-won/you-lost appear, roughly together on the two screens (the
      // reported "during that animation... the loser gets the gameover.png").
      if (window._vsActive) {
        gqVsWon = true;
        if (typeof window._vsReportGqWin === 'function') {
          window._vsReportGqWin(gqFinalElapsedMs, dailyCountry.name, dailyCountry.iso2);
        }
        gqEndgameTimeout = setTimeout(() => {
          gqEndgameTimeout = null;
          if (typeof window._vsShowGqWinResult === 'function') window._vsShowGqWinResult(gqFinalElapsedMs);
          // NOT _setPlaying(false) here: GloboReto VS keeps the session alive
          // on the result screen for a possible rematch (badge + spectator
          // discovery). It's turned off for real on leaving (quitToMenu).
        }, GQ_VS_ANIM_MS);
        return;
      }
      if (typeof window._specReportAnswer === 'function') {
        window._specReportAnswer(true, guesses.length + 1, {
          win: true, countryName: dailyCountry.name, iso2: dailyCountry.iso2, elapsedMs: gqFinalElapsedMs,
        });
      }
      gqEndgameTimeout = setTimeout(() => {
        gqEndgameTimeout = null;
        showEndgameModal();
        if (typeof window._specReportPostgame === 'function') {
          window._specReportPostgame({
            countryName: dailyCountry.name, iso2: dailyCountry.iso2, elapsedMs: gqFinalElapsedMs, guessCount: guesses.length,
          });
        }
        if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
        // is_playing used to stay true (and with it the spectate "eye" kept
        // being offered in the friends list) until the player hit "confirm"
        // in this same modal to return to the menu — they could sit looking
        // at the result for a good while, all that time falsely
        // "spectatable" (the reported "it still allows being spectated" with
        // the end-of-game panel already up). Here, as soon as the modal
        // appears, there's nothing more to see — it's cut here, no need to
        // wait for the "confirm" click. _setPlaying(false) also stops the
        // SoloSpectate channel, so anyone ALREADY spectating is disconnected
        // via the same generic path any other mode uses when the real player
        // leaves ("stopped playing").
        if (typeof window._setPlaying === 'function') window._setPlaying(false);
      }, 2000);
      return;
    }
    const km = minBorderDistance(country, dailyCountry);
    const dir = bearingArrow(bearing(country.centroid, dailyCountry.centroid));
    // role travels with the guess (harmless extra field, nothing else reads
    // it) purely so a spectator's synced list (see reportGqGuesses/
    // globequizSpectatorSyncGuesses) can tell the two sides' guesses apart —
    // the real players themselves never needed it, the shared list is a
    // single pool regardless of who tried what.
    const myRole = window._vsActive && window.VS?.isHost ? (window.VS.isHost() ? 'host' : 'guest') : undefined;
    const g = { name: country.name, km, dir, color: distColor(km), role: myRole };
    guesses.push(g);
    if (typeof window._specReportAnswer === 'function') {
      // Full detail (incl. the typed country name) so a spectator can render
      // the friend's guess list with flags. The OPPONENT's own client reads
      // ONLY `km` from this broadcast (globequizSetVsOpponentGuess in vs.js),
      // so the name never reaches honest opponent play — it's just there for
      // whoever is watching.
      const detail = { name: g.name, km: g.km, dir: g.dir, color: g.color };
      // In VS, `score` travels to VS.reportScore and is persisted as-is in
      // the match row's host_score/guest_score (see _vsReportAnswer) —
      // GlobeQuiz has no numeric score, so sending guesses.length there
      // contaminated that field with the attempt count (visible if the
      // opponent abandons: _showVsResultForAbandon reads it from the row and
      // records it in history via reportPostgame). The solo/spectator mode
      // does need guesses.length here (SoloSpectate.reportAnswer uses it).
      window._specReportAnswer(false, window._vsActive ? 0 : guesses.length, detail);
    }
    if (window._vsActive && typeof window.globequizVsUpdateOwnGuess === 'function') {
      window.globequizVsUpdateOwnGuess(km);
    }
    // Full list (not just this guess) so someone joining mid-match receives
    // it entirely on connecting — see reportGqGuesses/
    // globequizSpectatorSyncGuesses. _specReportAnswer above is the LIVE
    // route (with sound/animation) for whoever is already watching; this is
    // just the snapshot cached for the resend.
    if (typeof window._specReportGqGuesses === 'function') window._specReportGqGuesses(guesses.slice());
    saveState();
    drawTexture();
    renderGuessList();
    updateHint();
    focusOnCountry(country);
    // "Por turnos": this attempt was mine and it was wrong — pass the turn
    // to the opponent (mirrors my guess into their guess list via a new
    // broadcast, see globequizReceiveOpponentTurnGuess in vs.js's handler).
    // (_gqTurnsMyGuessCount itself is incremented inside
    // globequizVsUpdateOwnGuess above, the single place that already runs
    // once per own guess in both variants.)
    if (window._vsActive && _gqTurnsVariant) {
      _gqMySkipStreak = 0; // a real answer — my timeout streak resets
      const turnStartedAt = Date.now();
      if (typeof window.VS !== 'undefined' && window.VS && typeof window.VS.reportGqTurnGuess === 'function') {
        window.VS.reportGqTurnGuess({ name: g.name, km: g.km, dir: g.dir, color: g.color, turnStartedAt });
      }
      window.globequizSetMyTurn?.(false, turnStartedAt);
    }
  }

  // VS 1v1: the opponent guessed first — called from vs.js
  // (_handleGqOpponentWin) as soon as the win broadcast arrives. This client
  // already had dailyCountry from the start (same seed, see globequizSetSeed),
  // so nothing from the payload is needed to reveal it — it just stops
  // input/timer and shows where it was, without showWin()'s celebration
  // (this isn't an own correct guess).
  window.globequizVsShowLoss = function () {
    if (solved) return;
    solved = true;
    stopTimer();
    _gqStopTurnTimer();
    stopAutoRotate();
    const input = document.getElementById('gq-guess-input');
    const btn = document.getElementById('gq-guess-btn');
    if (input) input.disabled = true;
    if (btn) btn.classList.add('gq-disabled');
    drawTexture();
    renderGuessList();
    updateHint();
    if (dailyCountry) focusOnCountry(dailyCountry);
    // Instant game over for the loser — same sfx cities/monuments use when
    // their time runs out (sfx/timesup.mp3), fired here as soon as they
    // learn the opponent already guessed right.
    if (typeof playMusic === 'function') playMusic(null);
    if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') {
      sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp);
    }
  };

  // Help text below the input: instructions before the first guess,
  // "hotter/colder" (compared to the previous guess) or "borders your
  // selection" if it came out adjacent, and the correct country on winning.
  function updateHint() {
    const el = document.getElementById('gq-hint');
    if (!el) return;
    if (solved) {
      // The country name in green: the HTML is built by hand instead of
      // using t(key, vars) directly (which already interpolates and returns
      // only plain text).
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
      el.textContent = t(_gqTurnsVariant ? 'globequiz.hintFirstShared' : 'globequiz.hintFirst');
      return;
    }
    const last = guesses[guesses.length - 1];
    const lastCountry = countryByName.get(normalize(last.name));
    const label = lastCountry ? displayName(lastCountry) : last.name;
    if (last.km === 0) {
      el.textContent = t(_gqTurnsVariant ? 'globequiz.hintBordersShared' : 'globequiz.hintBorders', { name: label });
      return;
    }
    if (guesses.length === 1) {
      el.textContent = t(_gqTurnsVariant ? 'globequiz.hintStartShared' : 'globequiz.hintStart');
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
    // Same equipped card as the rest of the leaderboard (see
    // _applyFounderFrame in js/menu/customize-panel.js, which also applies it
    // here when it runs); this is a fallback in case this screen opens
    // before that function runs.
    const p = window._sbProfile;
    const cardCode = (p && p.card_code) || localStorage.getItem('cust_card_code') || '0001';
    if (window.CustomizeAssets) window.CustomizeAssets.applyCard(document.getElementById('gq-lb-player'), cardCode);
  }

  // Kicks off the three.js + GeoJSON download without waiting for the
  // player to enter the screen (called when opening the GlobeQuiz PANEL in
  // the menu, while they read the description) — so by the time they hit
  // "play" the heaviest part is already cached and the globe appears
  // sooner. loadThree/loadCountries are idempotent (check their own cache),
  // so calling them again later in initGlobeQuiz doesn't repeat work.
  window.preloadGlobeQuiz = function () {
    loadThree().catch(() => {});
    loadCountries().catch(() => {});
  };

  // applyI18n() overwrites #gq-hint's textContent (it has data-i18n) with
  // the default text whenever the language changes — we regenerate the
  // dynamic hint (and the list, which also shows translated names)
  // afterward.
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      if (!initialized) return;
      updateHint();
      renderGuessList();
    });
  }

  // Timer (counts UP from 0:00, M:SS format) — starts with each new match,
  // stops on a correct guess.
  let gqTimerInterval = null, gqCardInterval = null, gqTimerStart = 0, gqFinalElapsedMs = 0;
  // Retriggers the animation by hand on each JS tick (instead of letting it
  // run on its own in a separate CSS loop) — so the blink stays exactly in
  // sync with the second changing in the number, not two independent clocks
  // drifting apart over time.
  function pulseCountdown() {
    const img = document.querySelector('.gq-countdown-widget img');
    if (!img) return;
    img.style.animation = 'none';
    void img.offsetWidth; // forces reflow to restart the animation
    img.style.animation = 'pulse-img-shadow 1s';
  }
  // Big countdown: whole seconds only, one tick per second.
  function updateTimerDisplay() {
    const elapsedMs = Date.now() - gqTimerStart;
    const wholeSec = Math.floor(elapsedMs / 1000);
    // "Por turnos" owns #gq-timer-number for its own 15→0 per-turn countdown
    // (see _gqPaintTurnTimer) — writing the elapsed-seconds-up count here too
    // would just race it on the same element every second. Group "tiempo
    // real" does the same once someone solves and the 20s round-end
    // countdown starts (see _gqGroupTickCountdown) — before that, this
    // ascending count is exactly what should show.
    if (!_gqTurnsVariant && !window._gqGroupTurnsActive && !(window._gqGroupActive && _gqGroupCountdownEndsAt)) {
      const el = document.getElementById('gq-timer-number');
      if (el) el.textContent = String(wholeSec);
      // "Por turnos" pulses this from _gqTickTurnTimer instead, exactly when
      // ITS second actually changes — this generic 1s interval isn't synced
      // to that wall-clock-driven tick, so pulsing from here too made the
      // glow flash on its own independent schedule instead of the real one.
      pulseCountdown();
    }
    // GlobeQuiz has no real countdown 'tick' (the timer counts UP with no
    // limit), but the spectator's idle watchdog (_resetIdleWatchdog in
    // spectate.js) needs SOMETHING 1x/sec confirming the player is still in
    // the round even if they take a long time to type a guess — without
    // this, after 3.5s with no guess the spectator showed "they're
    // elsewhere in the game" with the player still thinking about the SAME
    // round (reported). The spectator-side onTick doesn't use this value for
    // anything else (GlobeQuiz has no fns.updateTimer), it just uses it as a
    // heartbeat.
    if (typeof window._specReportTick === 'function') window._specReportTick(elapsedMs);
  }
  // Leaderboard card: "S:CC" format (seconds:hundredths — at exactly 1
  // second it shows "1:00"). It's on a separate, much more frequent interval
  // than the big countdown's — with one tick per second the hundredths were
  // always stuck near "00" (just computed right at the second boundary),
  // never actually seen running.
  function updateCardTime() {
    const cardEl = document.getElementById('gq-lb-player-time');
    if (!cardEl) return;
    const elapsedMs = Date.now() - gqTimerStart;
    // VS 1v1 "por rapidez": both cards (mine and the opponent's) run the SAME
    // shared timer (above, see globequizVsSetTime) — the km below is
    // overwritten separately by globequizVsUpdateOwnGuess/
    // globequizSetVsOpponentGuess per guess. No time-based reorder here
    // (that's only for the daily friends bar, see positionGqLeaderboard
    // below).
    // "Por turnos" doesn't race a clock — both lines show km/attempts
    // instead (see globequizVsUpdateOwnGuess/globequizReceiveOpponentTurnGuess),
    // so the shared-clock line is skipped entirely here.
    if (window._vsActive) { if (!_gqTurnsVariant) globequizVsSetTime(elapsedMs); return; }
    const wholeSec = Math.floor(elapsedMs / 1000);
    const centis = Math.floor((elapsedMs % 1000) / 10);
    cardEl.textContent = wholeSec + ':' + String(centis).padStart(2, '0');
    positionGqLeaderboard(elapsedMs, true);
  }

  // In-game friends bar: only friends who ALREADY played GlobeQuiz TODAY and
  // secured their streak (gq_streak_last_date === today) get in, with the
  // time they made THAT day (gq_today_time_ms, see updateStreak) — not their
  // historical best. If nobody played today, the bar just has your card.
  //
  // Same mechanism as positionLeaderboard in js/modes/mapgame-leaderboard.js:
  // the cards stay fixed in the DOM, their `top` is overwritten
  // (GQ_LB_ROW_H_CQMIN below, see also .gq-friends-bar in style.css), and the
  // transition is the one .lb-entry ships with (`top 0.7s cubic-bezier(...)`)
  // — the same real animation as the World Tour, not a lookalike. Since the
  // player's time can only go up (never "improves" mid-match), this
  // simplifies: the only one who can "drop" position is you, never a friend
  // (their times are fixed since they played today).
  const GQ_LB_ROW_H_CQMIN = 19.6; // 18.9 (card height) + 0.7 (gap) — see comment in style.css
  const GQ_LB_WINDOW = 4;  // rows visible at once (see fixed height in .gq-friends-bar)
  const GQ_LB_PIN_ROW = 1; // how many rows above you it tries to keep visible
  let gqFriendPlayers = [];
  let gqLbElements = {};
  // Last known score per group member row ('lob'+id) — see _gqGroupPositionLb:
  // once someone leaves the room, window._lobbyMembers drops them entirely,
  // so this is what keeps their card counted in the ranking at their last
  // score instead of vanishing from the position math.
  let _gqGroupLastScores = {};
  let lastGqPlayerRank = -1;
  // Pending emote setTimeout (see below) — stopTimer() cancels it just like
  // it does gqTimerInterval/gqCardInterval. Without this, leaving the game
  // right inside the 200ms window (or with the 30ms interval still running
  // an instant after leaving) left the timeout alive: it fired
  // spawnEmoteBubble on #gq-lb-player already back in the menu, or only on
  // re-entering — the "ghost" emote that was reported.
  let gqEmoteTimeout = null;

  function formatGqCardTime(ms) {
    const wholeSec = Math.floor(ms / 1000);
    const centis = Math.floor((ms % 1000) / 10);
    return wholeSec + ':' + String(centis).padStart(2, '0');
  }
  // Exposed so vs.js can format the winner's time on the duel result screen
  // (#vs-result-me-score/opp-score), without duplicating the format here and
  // there.
  window.formatGqCardTime = formatGqCardTime;

  // Puts #gq-friends-bar back to its EXACT static baseline (the single
  // #gq-lb-player row, same markup as play/index.html) — every mode's own
  // builder (_gqGroupBuildLeaderboard, _gqTurnsBuildLeaderboard,
  // globequizVsPrepareOpponentRow, buildGqFriendRows) reshapes this SAME
  // bar its own way: different classes on the bar itself (vs-active,
  // gq-turns-mode), different ids inside the player row (some use
  // #gq-lb-player-time, the group ones don't name it at all), different
  // inline styles (order for the flex "por turnos" layout, top/transition
  // for the absolute-positioned ones). globequizVsPrepareOpponentRow/
  // buildGqFriendRows only ever ADD to or pluck specific rows OUT of
  // whatever's already there — none of them assumed they might be handed a
  // bar reshaped by a COMPLETELY different mode, so without a single
  // "back to a known baseline" step whichever mode ran last left its own
  // shape/classes/inline styles behind for the next one to trip over (the
  // reported "los cards de los contrincantes bugueados de posición" playing
  // 1v1 "por turnos" right after a group "por turnos" match). Called from
  // globequizHardReset() — the shared teardown every GlobeQuiz variant
  // (solo/1v1/group) already runs on the way out, abandoned or not.
  function _gqResetFriendsBar() {
    const bar = document.getElementById('gq-friends-bar');
    if (!bar) return;
    bar.className = 'gq-friends-bar';
    bar.removeAttribute('style');
    const myName = (window._sbProfile && window._sbProfile.name) || localStorage.getItem('playerName') || 'Tú';
    const myAvatar = localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png';
    bar.innerHTML = '<div class="lb-entry lb-player" id="gq-lb-player">'
      + '<span class="lb-rank rank-other"></span>'
      + '<div class="lb-avatar"><img class="lb-avatar-img" id="gq-lb-player-avatar" src="' + myAvatar + '" alt=""></div>'
      + '<span class="lb-name" id="gq-lb-player-name">' + myName + '</span>'
      + '<span class="lb-score" id="gq-lb-player-time">0:00</span>'
      + '</div>';
    gqLbElements = {};
  }

  // Rebuilds the friend rows from scratch (called when each match starts) —
  // reads the current snapshot of getFriends() (js/friends.js), so if
  // loadFriends() hasn't resolved yet by the time you start the first
  // match, there are simply no friend rows that time (like buildFriendPlayers
  // in js/modes/mapgame-leaderboard.js, same "best effort" criterion).
  function buildGqFriendRows() {
    // In VS 1v1 this bar doesn't show the day's friends — it shows the duel
    // opponent (see globequizVsPrepareOpponentRow), based on km, not time.
    if (window._vsActive) return;
    const bar = document.getElementById('gq-friends-bar');
    const playerEl = document.getElementById('gq-lb-player');
    if (!bar || !playerEl) return;
    bar.querySelectorAll('.lb-entry[data-gq-friend]').forEach(el => el.remove());
    // Defensive: this is the one guaranteed entry point for the SOLO bar, so
    // a leftover VS opponent card (normally removed by globequizHardReset()
    // on the way out) never survives into a solo match no matter what path
    // got here — the reported "sale aun la carta de mi contrincante".
    document.getElementById('gq-lb-vsopp')?.remove();
    // Same reasoning, for a leftover GROUP "por turnos" leaderboard (its own
    // .lb-entry rows, id="gq-lb-lob<uid>", plus the gq-turns-mode rotated
    // layout class on the bar) — launching solo GlobeQuiz straight from the
    // menu never goes through window.gameStoppers either (see
    // loading-globequiz-play-wrap in js/menu/menu-launchers.js), so those
    // never got cleared by _gqGroupTurnsTeardown() (the reported "cards que
    // no deberían salir" after a group match).
    bar.querySelectorAll('.lb-entry[id^="gq-lb-lob"]').forEach(el => el.remove());
    bar.classList.remove('gq-turns-mode');
    const playerTimeEl = document.getElementById('gq-lb-player-time');
    if (playerTimeEl && playerTimeEl.classList.contains('gq-lb-vs-score')) {
      playerTimeEl.classList.remove('gq-lb-vs-score');
      playerTimeEl.textContent = '0:00';
    }
    const todayStr = dateKey(new Date());
    const friends = (typeof getRankedFriends === 'function' ? getRankedFriends() : [])
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

  // ── VS 1v1: opponent row in .gq-friends-bar ────────────────────────────────
  // Same lb-vsopp style cities/monuments use for the opponent (see
  // citiesSpectatorSetPlayerCard in js/modes/cities-spectate.js) — here
  // instead of comparing score or time it compares km (closer = better
  // place). gqVsOppBestKm/gqVsMyBestKm are Infinity until each side's first
  // guess.
  let gqVsOppBestKm = Infinity;
  let gqVsMyBestKm = Infinity;
  // Opponent's failed-guess count — the 'answer' broadcast never carries it,
  // but it arrives one per wrong guess (see globequizSetVsOpponentGuess), so
  // counting the calls is enough for the end-of-duel panel (_showGqVsResult).
  let gqVsOppGuessCount = 0;
  // true only when THIS client was the one who guessed right (see the win
  // branch in submitGuess) — distinguishes the winner's attempt count (their
  // failed guesses + the final correct one) from the loser's (only their
  // failed ones, never guessed right), see globequizGetVsSummary.
  let gqVsWon = false;
  // "Por turnos" variant (vs. the default "por rapidez") — see
  // globequizSetTurnsMode/globequizSetMyTurn, called from vs.js.
  let _gqTurnsVariant = false;
  // My own attempt count in turns mode — `guesses` mirrors BOTH players'
  // wrong guesses there (shared "already tried" column), so guesses.length
  // alone can't tell my attempts from the opponent's any more (see
  // globequizGetVsSummary).
  let _gqTurnsMyGuessCount = 0;
  let _gqTypingSendTimer = null; // throttles the live-typing broadcast (see the input listener in initGlobeQuiz)

  // ── "Por turnos": per-turn countdown (20s → 0) + AFK auto-kick ────────────
  const GQ_TURN_TIME_SECONDS = 20;
  let _gqTurnTimerInterval = null;
  let _gqTurnSecondsLeft = GQ_TURN_TIME_SECONDS;
  // Wall-clock moment the CURRENT turn started, on THIS client's own clock.
  // A `turnStartedAt` used to be carried across the wire (see submitGuess/
  // _gqHandleMyTimeout/globequizReceiveOpponentTurnGuess) so both sides would
  // count down from the "same" instant — but that instant was measured on
  // whichever device sent it, and phone/PC clocks aren't synced to each
  // other, so a multi-second clock skew between the two devices showed up
  // directly as a multi-second gap between the two displayed counters
  // (reported: "a mí me dan 13s, a mi rival 18s"). Each side now just starts
  // its own 20s the moment IT learns the turn changed — the only remaining
  // skew is real network latency (well under a second normally), not clock
  // drift.
  let _gqTurnStartedAt = 0;
  // My own consecutive timeouts (no real guess submitted before the clock hit
  // 0) — reset to 0 on any real guess of mine (see submitGuess). Two in a row
  // and I'M considered AFK (see _gqHandleMyTimeout): this only ever compares
  // MY OWN streak, never the opponent's — each side detects its own AFK-ness
  // locally and leaves via the normal abandon flow, which the other side
  // already knows how to react to (_onOpponentAbandoned).
  let _gqMySkipStreak = 0;

  function _gqPaintTurnTimer() {
    const el = document.getElementById('gq-timer-number');
    if (el) el.textContent = String(Math.max(0, _gqTurnSecondsLeft));
  }
  // Blue (globecountdown.png) normally, red (globecountdownred.png) with 5s
  // or less left — same badge, hue-shifted to match the countdownred.png
  // family already used elsewhere.
  function _gqSetCountdownIconRed(isRed) {
    const img = document.querySelector('.gq-countdown-widget img');
    if (img) img.src = isRed ? 'images/globecountdownred.png' : 'images/globecountdown.png';
  }
  function _gqTickTurnTimer() {
    const elapsedSec = Math.floor((Date.now() - _gqTurnStartedAt) / 1000);
    const secondsLeft = Math.max(0, GQ_TURN_TIME_SECONDS - elapsedSec);
    if (secondsLeft === _gqTurnSecondsLeft) return; // no change since the last poll
    _gqTurnSecondsLeft = secondsLeft;
    _gqPaintTurnTimer();
    // The glow pulse now fires from THIS exact tick (the real, wall-clock
    // second passing) instead of the generic 1s interval in
    // updateTimerDisplay(), which used to run on its own unrelated schedule
    // in turns mode.
    pulseCountdown();
    // From 5s down to 1s inclusive: red icon + a tick EVERY second (not
    // just once at the 5s mark).
    if (secondsLeft > 0 && secondsLeft <= 5) {
      _gqSetCountdownIconRed(true);
      if (typeof sfxTickdown !== 'undefined' && typeof sfxPlay === 'function') { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
    }
    if (secondsLeft <= 0) {
      _gqStopTurnTimer();
      if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
      // Only the side whose turn it actually IS declares its own timeout —
      // the waiting side's identical countdown is purely visual.
      if (window._gqMyTurn) _gqHandleMyTimeout();
    }
  }
  // Called every time the turn changes (see globequizSetMyTurn). Always
  // starts from THIS client's own "now" — see _gqTurnStartedAt above for why
  // a cross-device timestamp isn't used any more. The `startedAt` argument
  // some callers still pass along (leftover from the old broadcast payload)
  // is intentionally ignored.
  function _gqStartTurnTimer() {
    _gqStopTurnTimer();
    _gqTurnStartedAt = Date.now();
    _gqTurnSecondsLeft = GQ_TURN_TIME_SECONDS + 1; // force the first poll to paint
    _gqSetCountdownIconRed(false);
    _gqTickTurnTimer();
    // Polls actual elapsed wall-clock time every 250ms (finer than 1s) so the
    // displayed second changes right when it's truly due, not accumulating
    // setInterval's own drift over 15 ticks.
    _gqTurnTimerInterval = setInterval(_gqTickTurnTimer, 250);
  }
  function _gqStopTurnTimer() {
    if (_gqTurnTimerInterval) clearInterval(_gqTurnTimerInterval);
    _gqTurnTimerInterval = null;
  }
  // "Por turnos": aviso de skip por tiempo, EN cqmin dentro de
  // #globequiz-screen (no un toast de pantalla completa) — mismo fade
  // show/hide que .gqvr-toast en vs.js.
  let _gqTurnNoticeFadeT = null, _gqTurnNoticeHideT = null;
  function _gqShowTurnNotice(text) {
    const el = document.getElementById('gq-turn-notice');
    if (!el) return;
    clearTimeout(_gqTurnNoticeFadeT); clearTimeout(_gqTurnNoticeHideT);
    el.textContent = text;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('gq-turn-notice-show'));
    _gqTurnNoticeFadeT = setTimeout(() => {
      el.classList.remove('gq-turn-notice-show');
      _gqTurnNoticeHideT = setTimeout(() => { el.hidden = true; }, 320);
    }, 2200);
  }
  // "Por turnos" ONLY: same notice box a real player sees when either side
  // (them or the opponent) misses the 20s clock — reused as-is for a
  // spectator (see spectate.js's onGqTurnGuess), just with whichever name
  // applies already baked into `text`.
  window.globequizSpectatorShowTurnNotice = function (text) { _gqShowTurnNotice(text); };
  let _gqAfkPopupWired = false;
  // Lives OUTSIDE #globequiz-screen on purpose (see play/index.html) — we
  // kick to the menu FIRST, then show this over the menu, so it must survive
  // quitToMenu() hiding the game screen instead of disappearing with it.
  function _gqShowAfkPopup() {
    const pop = document.getElementById('gq-afk-popup');
    if (!pop) return;
    if (!_gqAfkPopupWired) {
      _gqAfkPopupWired = true;
      document.getElementById('gq-afk-ok')?.addEventListener('click', () => {
        pop.style.display = 'none';
      });
    }
    pop.style.display = 'flex';
  }
  // My own turn's clock hit 0 without me answering — skip it (pass the turn,
  // same as a wrong guess but with no country), or if this is my SECOND skip
  // in a row, I'm AFK: leave the match right away (same as any quit — the
  // opponent finds out and wins via the existing abandon flow), THEN show a
  // small panel over the menu explaining why I got kicked.
  function _gqHandleMyTimeout() {
    if (solved || !window._vsActive || !_gqTurnsVariant || !window._gqMyTurn) return;
    _gqMySkipStreak++;
    if (_gqMySkipStreak >= 2) {
      if (typeof window.quitToMenu === 'function') window.quitToMenu();
      _gqShowAfkPopup();
      return;
    }
    const turnStartedAt = Date.now();
    if (typeof window.VS !== 'undefined' && window.VS && typeof window.VS.reportGqTurnGuess === 'function') {
      window.VS.reportGqTurnGuess({ timeout: true, turnStartedAt });
    }
    window.globequizSetMyTurn?.(false, turnStartedAt);
    _gqShowTurnNotice(t('gq.youTimedOut'));
  }

  function formatGqKm(km) {
    return (km == null || !isFinite(km)) ? '—' : Math.round(km) + ' km';
  }
  // Time on top, last guess's km below — the usual `.lb-score`, but with two
  // of its own lines (gq-lb-vs-score, see style.css) instead of the single
  // value the solo/campaign mode uses. No closer/farther arrow (removed by
  // request: the raw km is enough).
  // "Por turnos" flips what each line means (no shared clock to race): TOP
  // = closest km so far, BOTTOM = attempt count — see globequizVsUpdateOwnGuess
  // (mine) and globequizReceiveOpponentTurnGuess (the opponent's).
  // Relies on globequizSetTurnsMode() having already run for THIS match
  // before this is called (see the call order in vs.js's _launchVersus/
  // _gqvrDoRelaunch) so _gqTurnsVariant isn't stale from the previous match.
  function gqVsScoreInnerHtml(timeId, kmId) {
    const topDefault = _gqTurnsVariant ? '—' : '0:00';
    const bottomDefault = _gqTurnsVariant ? '0' : '—';
    return '<span class="gq-lb-vs-time" id="' + timeId + '">' + topDefault + '</span>'
      + '<span class="gq-lb-vs-km" id="' + kmId + '">' + bottomDefault + '</span>';
  }

  window.globequizVsPrepareOpponentRow = function () {
    const bar = document.getElementById('gq-friends-bar');
    const playerEl = document.getElementById('gq-lb-player');
    if (!bar || !playerEl) return;
    bar.querySelectorAll('.lb-entry[data-gq-friend]').forEach(el => el.remove());
    // Defensive, same criterion as the [data-gq-friend]/#gq-lb-vsopp cleanup
    // above/below: a GROUP "por turnos" match's own leaderboard (one
    // .lb-entry per room member, id="gq-lb-lob<uid>", plus the
    // vs-active/gq-turns-mode classes it puts on the bar for its rotated
    // card layout) is normally cleared by _gqGroupTurnsTeardown() — but that
    // only runs through window.gameStoppers, and a 1v1 duel launched
    // straight from vs.js's _launchVersus never calls those. Without this,
    // a 1v1 "por turnos" started right after a group match kept the whole
    // room's stale cards floating in the bar AND rendered its own
    // player/opponent rows with the group's rotated layout (the reported
    // "leaderboard roto, salen cards que no deberían salir").
    bar.querySelectorAll('.lb-entry[id^="gq-lb-lob"]').forEach(el => el.remove());
    bar.classList.remove('gq-turns-mode');
    gqVsOppBestKm = Infinity;
    gqVsMyBestKm = Infinity;
    gqVsWon = false;
    gqVsOppGuessCount = 0;
    _gqTurnsMyGuessCount = 0;
    _gqMySkipStreak = 0;
    const opp = window._vsOpponent || {};
    let el = document.getElementById('gq-lb-vsopp');
    if (!el) {
      el = document.createElement('div');
      el.className = 'lb-entry lb-vsopp';
      el.id = 'gq-lb-vsopp';
      el.innerHTML = '<div class="lb-avatar"><img class="lb-avatar-img" id="gq-lb-vsopp-avatar" src="images/profilepic/ppdefault.png"></div>'
        + '<span class="lb-name" id="gq-lb-vsopp-name"></span>'
        + '<span class="lb-score gq-lb-vs-score" id="gq-lb-vsopp-score"></span>';
      bar.appendChild(el);
    }
    document.getElementById('gq-lb-vsopp-name').textContent = opp.name || 'Rival';
    document.getElementById('gq-lb-vsopp-avatar').src = opp.avatar || 'images/profilepic/ppdefault.png';
    document.getElementById('gq-lb-vsopp-score').innerHTML = gqVsScoreInnerHtml('gq-lb-vsopp-time', 'gq-lb-vsopp-km');
    window.CustomizeAssets?.applyCard(el, opp.cardCode || '0001');
    const myScoreEl = document.getElementById('gq-lb-player-time');
    if (myScoreEl) {
      myScoreEl.classList.add('gq-lb-vs-score');
      myScoreEl.innerHTML = gqVsScoreInnerHtml('gq-lb-player-time-val', 'gq-lb-player-km');
    }
    gqLbElements = { player: playerEl, vsopp: el };
    lastGqPlayerRank = -1;
    positionGqVsLeaderboard(false);
  };

  // Reorders the two rows (player/opponent) by who has the best (minimum)
  // km achieved so far — same animated `top` mechanism as
  // positionGqLeaderboard, but by distance instead of time. Anchored to the
  // BOTTOM of the GQ_LB_WINDOW-row window (same criterion as
  // positionGqLeaderboard/bottomOffset) — without this the two cards ended
  // up at the top of the bar instead of the bottom (the reported "they went
  // to the middle", since .gq-friends-bar centers its content).
  function positionGqVsLeaderboard(animate) {
    _gqPositionTwoCards(gqLbElements.player, gqLbElements.vsopp, gqVsMyBestKm, gqVsOppBestKm, animate);
  }
  // Shared by the real player's positionGqVsLeaderboard (above, using its own
  // gqVsMyBestKm/gqVsOppBestKm) AND the spectator's own equivalent
  // (_gqSpecPositionVsLeaderboard below, using its own tracked km) — same
  // "reorder by whoever's closest" reshuffle, just fed different state
  // depending on who's watching.
  function _gqPositionTwoCards(playerEl, oppEl, myKm, oppKm, animate) {
    if (!playerEl || !oppEl) return;
    const all = [{ el: playerEl, km: myKm }, { el: oppEl, km: oppKm }];
    all.sort((a, b) => a.km - b.km);
    const bottomOffset = (GQ_LB_WINDOW - all.length) * GQ_LB_ROW_H_CQMIN;
    if (!animate) { [playerEl, oppEl].forEach(el => { el.style.transition = 'none'; }); }
    all.forEach((p, rank) => { p.el.style.top = (rank * GQ_LB_ROW_H_CQMIN + bottomOffset) + 'cqmin'; });
    if (!animate) {
      requestAnimationFrame(() => { [playerEl, oppEl].forEach(el => { el.style.transition = ''; }); });
    }
  }
  // Spectator equivalent of positionGqVsLeaderboard — the real player's
  // version reads gqVsMyBestKm/gqVsOppBestKm (never set for a spectator, who
  // never runs submitGuess()), so without this the two cards' relative
  // ORDER (not just their km/attempts text, already fixed) never updated —
  // the reported "the position of the cards doesn't update live like the
  // real players see".
  function _gqSpecPositionVsLeaderboard(animate) {
    _gqPositionTwoCards(gqLbElements.player, gqLbElements.vsopp, _gqSpecFriendBestKm, _gqSpecOppBestKm, animate);
  }

  // Shared tick (see updateCardTime): both cards run the SAME timer (started
  // in sync by the same 3-2-1, see _scheduleVersusStart in vs.js) — no need
  // to transmit the opponent's time separately, showing both my own
  // elapsedMs is enough.
  function globequizVsSetTime(elapsedMs) {
    const t = formatGqCardTime(elapsedMs);
    const mine = document.getElementById('gq-lb-player-time-val');
    if (mine) mine.textContent = t;
    const opp = document.getElementById('gq-lb-vsopp-time');
    if (opp) opp.textContent = t;
  }

  // Called from submitGuess() with MY own guess (VS) — mirrors the same
  // visual treatment as the opponent's row, so both cards read the same (km
  // of the last attempt).
  window.globequizVsUpdateOwnGuess = function (km) {
    gqVsMyBestKm = Math.min(gqVsMyBestKm, km);
    if (_gqTurnsVariant) {
      // "Por turnos": TOP line = closest km, BOTTOM line = my attempt count
      // (there's no shared clock to show, see updateCardTime).
      _gqTurnsMyGuessCount++;
      const timeEl = document.getElementById('gq-lb-player-time-val');
      const attEl  = document.getElementById('gq-lb-player-km');
      if (timeEl) timeEl.textContent = formatGqKm(gqVsMyBestKm);
      if (attEl)  attEl.textContent  = String(_gqTurnsMyGuessCount);
    } else {
      const el = document.getElementById('gq-lb-player-km');
      // Shows the BEST km so far, not the just-typed guess's — otherwise a
      // guess worse than an earlier one "visually replaced" the closest
      // already achieved (the reported "it has to stay with the closest, not
      // whatever you pick next").
      if (el) el.textContent = formatGqKm(gqVsMyBestKm);
    }
    positionGqVsLeaderboard(true);
  };

  // Called from vs.js (VS.onAnswer) with the opponent's incorrect guess —
  // never carries the name of the country they tried, only km (see submitGuess).
  window.globequizSetVsOpponentGuess = function (km) {
    gqVsOppGuessCount++;
    gqVsOppBestKm = Math.min(gqVsOppBestKm, km);
    const el = document.getElementById('gq-lb-vsopp-km');
    if (el) el.textContent = formatGqKm(gqVsOppBestKm);
    positionGqVsLeaderboard(true);
  };

  // Summary of MY progress at the end of a duel (won or lost) — used by
  // vs.js to complete the result screen (see _showVsResult /
  // _handleGqOpponentWin in vs.js). guessCount adds +1 only if I won (the
  // final correct guess is never pushed to `guesses`, see the win branch in
  // submitGuess) — the loser never guessed right, so their count is only
  // their failed attempts.
  window.globequizGetVsSummary = function () {
    return {
      bestKm: isFinite(gqVsMyBestKm) ? gqVsMyBestKm : null,
      countryName: dailyCountry ? displayName(dailyCountry) : null,
      iso2: dailyCountry ? dailyCountry.iso2 : null,
      guessCount: (_gqTurnsVariant ? _gqTurnsMyGuessCount : guesses.length) + (gqVsWon ? 1 : 0),
      oppGuessCount: gqVsOppGuessCount,
      elapsedMs: gqFinalElapsedMs || (gqTimerStart ? Math.max(0, Date.now() - gqTimerStart) : 0),
    };
  };

  // ── "Por turnos" variant (called from vs.js) ──────────────────────────────

  // Called once per launch/relaunch, right BEFORE globequizVsPrepareOpponentRow
  // (see the call order in vs.js). Hides the countdown widget right away —
  // it only reappears once the 3-2-1-GO ends (see initGlobeQuiz's onDone),
  // showing the 20s per-turn clock instead of sitting there empty/idle
  // through the sync wait + roulette + countdown.
  window.globequizSetTurnsMode = function (isTurns) {
    _gqTurnsVariant = !!isTurns;
    if (_gqTurnsVariant) {
      document.querySelector('.gq-countdown-widget')?.style.setProperty('display', 'none');
    }
  };

  // Enables/locks my own input depending on whose turn it is. Reuses the same
  // disable/enable pair showWin()/globequizVsShowLoss() already use, and also
  // hides the confirm button entirely while it's not my turn (no point
  // showing a button I can't press). No separate "Tu turno" chip any more:
  // - #gq-hint shows a fixed "Esperando respuesta de {name}..." while waiting,
  //   and goes back to the normal contextual hint (updateHint()) once it's mine.
  // - the input's OWN placeholder shows the opponent's live keystrokes (see
  //   globequizShowOpponentTyping), replacing "Escribe un país..." in place.
  window.globequizSetMyTurn = function (mine, startedAt) {
    const wasMine = window._gqMyTurn;
    window._gqMyTurn = !!mine;
    const input = document.getElementById('gq-guess-input');
    const btn = document.getElementById('gq-guess-btn');
    const row = document.querySelector('.gq-guess-row');
    if (input) input.disabled = !mine;
    if (btn) btn.classList.toggle('gq-disabled', !mine);
    if (row) row.classList.toggle('gq-locked', !mine);
    // Every hand-off restarts the 20s clock, for BOTH sides (see
    // _gqStartTurnTimer) — whether it's now mine or the opponent's. Always
    // from THIS client's own Date.now(); `startedAt` (the remote clock's
    // value, when the caller has it) is no longer used — see the comment on
    // _gqTurnStartedAt for why.
    if (_gqTurnsVariant) _gqStartTurnTimer();
    if (mine) {
      // A disabled input can't hold focus — re-focus it now that it's mine,
      // so I can start typing (and Enter-to-submit works) without having to
      // click into the field again first.
      if (input) { input.focus(); input.placeholder = t('globequiz.inputPh'); }
      updateHint();
      // "Your turn" cue — only on a real hand-off (skips the very first
      // silent call some flows may make before anything else has happened).
      if (!wasMine && typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') {
        sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
      }
    } else {
      const hintEl = document.getElementById('gq-hint');
      const oppName = (window._vsOpponent && window._vsOpponent.name) || 'Rival';
      if (hintEl) hintEl.textContent = t('gq.waitingTurnFor', { name: oppName });
      // Placeholder starts back at the default ("Escribe un país...") — it's
      // replaced live by whatever the opponent types, see
      // globequizShowOpponentTyping below.
      if (input) input.placeholder = t('globequiz.inputPh');
    }
  };

  // Called from vs.js (VS.onGqTurnGuess) with the opponent's wrong guess —
  // mirrors it into MY OWN guess list (the shared "already tried" column)
  // and passes me the turn. Also spins the globe to their guess (same
  // focusOnCountry the spectator UI already uses for a watched friend's
  // guesses), so it's visible even though I'm not the one typing.
  window.globequizReceiveOpponentTurnGuess = function (g) {
    if (!g) return;
    // Whoever's turn it was just answered (or ran out the clock) — the
    // auto-rotate stops on BOTH sides, not just the one who typed
    // (submitGuess() already does it locally for the answering side).
    stopAutoRotate();
    if (g.timeout) {
      // They ran out of their 20s without answering — no country to show,
      // just pass the turn back to me.
      window.globequizSetMyTurn?.(true, g.turnStartedAt);
      _gqShowTurnNotice(t('gq.oppTimedOut', { name: (window._vsOpponent && window._vsOpponent.name) || 'Rival' }));
      return;
    }
    if (!g.name) return;
    guesses.push({ name: g.name, km: g.km, dir: g.dir, color: g.color, role: g.role });
    gqVsOppGuessCount++;
    if (_gqTurnsVariant && typeof g.km === 'number') {
      gqVsOppBestKm = Math.min(gqVsOppBestKm, g.km);
      const oppVal = document.getElementById('gq-lb-vsopp-time');
      const oppAtt = document.getElementById('gq-lb-vsopp-km');
      if (oppVal) oppVal.textContent = formatGqKm(gqVsOppBestKm);
      if (oppAtt) oppAtt.textContent = String(gqVsOppGuessCount);
      positionGqVsLeaderboard(true);
    }
    saveState();
    drawTexture();
    renderGuessList();
    updateHint();
    if (typeof sfxSelect !== 'undefined' && typeof sfxPlay === 'function') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
    const country = countryByName.get(normalize(g.name));
    if (country) focusOnCountry(country);
    window.globequizSetMyTurn?.(true, g.turnStartedAt);
    // "Por turnos": a spectator's shared guess list is otherwise only
    // resynced when I submit MY OWN next guess (see _specReportGqGuesses in
    // submitGuess) — without this it lagged a full half-turn behind, only
    // showing the opponent's move once I also answered.
    if (typeof window._specReportGqGuesses === 'function') window._specReportGqGuesses(guesses.slice());
  };

  // Called from vs.js (VS.onGqTyping) with a live preview of what the
  // opponent is currently typing, while it's THEIR turn — shown INSIDE the
  // (disabled) input itself, replacing its placeholder ("Escribe un
  // país...") with their live text, instead of a separate message elsewhere.
  // #gq-hint above keeps its own fixed "Esperando respuesta de {name}...".
  window.globequizShowOpponentTyping = function (text) {
    if (window._gqMyTurn) return; // stale echo / already my turn again
    const input = document.getElementById('gq-guess-input');
    if (!input) return;
    const trimmed = (text || '').trim();
    input.placeholder = trimmed || t('globequiz.inputPh');
  };

  // Sorts by ascending time (lower time = better place) and places each card
  // with `top` within a fixed window of GQ_LB_WINDOW rows (like
  // positionLeaderboard) — so if there are more friends than the window,
  // your card is never lost from view even if the rest is clipped.
  function positionGqLeaderboard(elapsedMs, animate) {
    const playerEl = gqLbElements.player;
    if (!playerEl) return;
    const all = gqFriendPlayers.map(f => ({ id: f.id, time: f.timeMs }));
    all.push({ id: 'player', time: elapsedMs });
    all.sort((a, b) => a.time - b.time);
    const playerRank = all.findIndex(p => p.id === 'player');

    // Since your time can only go up, the only one who "drops" position is
    // always you (never a friend) — the emote goes on your card, not theirs.
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

    // Anchored to the BOTTOM (like positionLeaderboard): with fewer rows
    // than the window, they stick to the bottom of the bar instead of
    // floating at the top — with nobody but you, your card sits alone at the
    // bottommost position, not loose atop an empty container.
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
  // Resets everything to how it starts (player on top, today's friends just
  // read) when a new match begins, WITHOUT animation (there's nothing to
  // "watch" at that moment yet) — same "plant with no transition, re-enable
  // it next frame" pattern buildLeaderboard uses in
  // js/modes/mapgame-leaderboard.js.
  function resetLeaderboardOrder() {
    if (gqEmoteTimeout) { clearTimeout(gqEmoteTimeout); gqEmoteTimeout = null; }
    // VS 1v1 builds/positions its own row separately
    // (globequizVsPrepareOpponentRow, already called by vs.js before
    // initGlobeQuiz) — don't touch here, avoids overwriting the opponent's
    // row with the friends-by-time logic below. Group lobby (up to 10) is
    // the same idea: _gqGroupBuildLeaderboard/_gqGroupPositionLb own the bar.
    if (window._vsActive || window._gqGroupActive || window._gqGroupTurnsActive) return;
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

  // Full mode teardown (VS: opponent abandoned, or generic quitToMenu
  // hitting a duel in progress) — same cleanup criterion gq-quit-confirm
  // already does by hand (js/modes/mapgame-misc.js), gathered here so it can
  // be reused from vs.js (_onOpponentAbandoned) and from window.gameStoppers.
  function globequizHardReset() {
    stopTimer();
    stopAutoRotate();
    stopInertia();
    abortGqPregameCountdown();
    // Cuts any GlobeQuiz sfx that could still be mid-play the instant this
    // runs — quitToMenu()'s own sfx stop-list doesn't cover sfxCheck/
    // sfxSelect (they're generic UI blips used all over, not GlobeQuiz-
    // specific), and this also fires from paths that DON'T go through
    // quitToMenu() at all (e.g. globequizVsShowLoss). Matters most for
    // "por turnos": whoever abandons/gets AFK-kicked mid-turn can have the
    // 5s tick, timesup, or a turn-notification sfx still playing. Also
    // covers sfxBonus/sfxCountdown (correct-guess chime / pregame beep) —
    // missing before, so "quedarse solo" (window.LB.triggerAlone → this
    // same reset) right after someone had just answered right could leave
    // that chime ringing over the menu (the reported "any sfx still
    // playing should get cancelled when going back to the menu").
    [sfxTickdown, sfxTimesUp, sfxCheck, sfxSelect, sfxBonus, sfxCountdown].forEach(s => {
      if (s) { try { s.pause(); s.currentTime = 0; } catch (e) {} }
    });
    if (typeof window.stopGlobeQuizEndgameTimer === 'function') window.stopGlobeQuizEndgameTimer();
    stopGqEndgameCountdown();
    if (gqEndgameTimeout) { clearTimeout(gqEndgameTimeout); gqEndgameTimeout = null; }
    const modal = document.getElementById('gq-endgame-modal');
    if (modal) modal.style.display = 'none';
    if (typeof playMusic === 'function') playMusic(null);
    const screenEl = document.getElementById('globequiz-screen');
    if (screenEl) screenEl.style.display = 'none';
    guesses = [];
    solved = false;
    animatedGuessNames = new Set();
    dailyCountry = null;
    gqVsOppBestKm = Infinity;
    gqVsMyBestKm = Infinity;
    _gqGroupTeardown();
    _gqGroupTurnsTeardown();
    // Full reset of #gq-friends-bar back to its static baseline (single
    // #gq-lb-player row, correct ids, no leftover classes/inline styles) —
    // supersedes the old piecemeal cleanup that used to live here (undo the
    // VS two-line score layout, remove the opponent row): those only
    // patched the ONE known leftover shape from a 1v1 duel, never the group
    // modes' own differently-shaped rows/ids (see _gqResetFriendsBar's own
    // comment for the full "cards bugueados de posición" story).
    _gqResetFriendsBar();
    // "Por turnos" leftovers — a rematch calls globequizSetTurnsMode() again
    // right after this, so this is only load-bearing on a real exit/abandon.
    _gqTurnsVariant = false;
    _gqTurnsMyGuessCount = 0;
    _gqMySkipStreak = 0;
    _gqStopTurnTimer();
    _gqSetCountdownIconRed(false);
    document.querySelector('.gq-countdown-widget')?.style.removeProperty('display');
    document.getElementById('gq-afk-popup')?.style.setProperty('display', 'none');
    clearTimeout(_gqTurnNoticeFadeT); clearTimeout(_gqTurnNoticeHideT);
    const _turnNotice = document.getElementById('gq-turn-notice');
    if (_turnNotice) { _turnNotice.hidden = true; _turnNotice.classList.remove('gq-turn-notice-show'); }
    window._gqMyTurn = null;
    window._gqAmIStarter = null;
    document.getElementById('gq-roulette-overlay')?.style.setProperty('display', 'none');
    // globequizSetMyTurn()/globequizShowOpponentTyping() write straight into
    // #gq-hint's textContent ("Esperando respuesta…"/live preview) — without
    // this, a turns-mode duel that ends mid-wait left that text FROZEN there,
    // and the next match (even a plain solo one) opened showing that stale
    // line until the player's first guess (the reported "seguía con los
    // datos antiguos"). guesses/solved/dailyCountry are already reset above,
    // so this recomputes the correct default ("Coloca el nombre...").
    updateHint();
    // Re-enable the input/button too — globequizSetMyTurn(false) can leave
    // them disabled if the match ended while it wasn't my turn.
    const _hintInput = document.getElementById('gq-guess-input');
    const _hintBtn = document.getElementById('gq-guess-btn');
    if (_hintInput) { _hintInput.disabled = false; _hintInput.placeholder = t('globequiz.inputPh'); }
    if (_hintBtn) _hintBtn.classList.remove('gq-disabled');
    document.querySelector('.gq-guess-row')?.classList.remove('gq-locked');
  }
  window.globequizHardReset = globequizHardReset;
  window.gameStoppers = window.gameStoppers || [];
  window.gameStoppers.push(globequizHardReset);

  // ── GloboReto GRUPAL, variante "tiempo real" (hasta 10 jugadores) ──────────
  // Cada ronda: todos buscan el mismo país (seed compartida) sin límite de
  // tiempo; el primero en acertar dispara un contador de 20s COMPARTIDO (ver
  // .gq-countdown-widget, el mismo widget que "por turnos" reutiliza para su
  // propio countdown) durante el cual el resto todavía puede acertar. Al
  // llegar a 0, cada cliente calcula su propio puntaje de la ronda (por
  // puesto+intentos si acertó, por cercanía+velocidad+intentos si no) y lo
  // suma al leaderboard grupal (window.LB.reportScore/sendScore, igual que
  // Banderas/etc). El orden de acierto (quién es 1°, 2°, 3°...) lo arbitra el
  // HOST (única fuente de verdad — evitar que dos clientes vean un orden
  // distinto por una simple diferencia de latencia de red) vía el canal
  // genérico window.LB.sendGq/onGq (ver lobby.js).
  const GQ_GROUP_COUNTDOWN_MS = 20000;
  // Ver la conversación de diseño: puesto fijo + bonus por intentos (menos
  // intentos = más bonus, con piso en 50 para que nunca llegue a 0), y para
  // quien no llega a tiempo, cercanía(km) + qué tan rápido llegó a esa
  // cercanía + un bonus de intentos más chico — siempre por debajo del peor
  // puesto de quien SÍ acertó.
  // El salto ENTRE CADA PUESTO consecutivo es de 400 (más que el rango
  // completo del bonus por intentos, que va de 50 a 400 → diferencia máxima
  // 350) — así standing NUNCA se invierte por intentos: el peor caso del
  // puesto N (base+50) siempre le gana al mejor caso del puesto N+1
  // (base+400), para cualquier N. Con la curva vieja un 3° con pocos
  // intentos podía superar a un 2° con muchos (reportado, "injusto").
  const GQ_GROUP_RANK_BASE = [3835, 3435, 3035, 2635, 2235, 1835, 1435, 1035, 635, 235];
  function _gqGroupRankScore(rank, attempts) {
    const base = GQ_GROUP_RANK_BASE[Math.min(Math.max(rank, 1), 10) - 1];
    const bonus = Math.max(50, 400 - (attempts - 1) * 40);
    return base + bonus;
  }
  function _gqGroupFailScore(bestKm, bestAtMs, attempts) {
    if (!attempts) return 0;
    const prox = 150 * Math.exp(-bestKm / 4000);
    const speedBonus = Math.max(0, 30 - bestAtMs / 1000);
    const attBonus = Math.max(10, 40 - (attempts - 1) * 5);
    return prox + speedBonus + attBonus;
  }

  // Trailing-edge throttle for the "por rapidez" group typing preview (see
  // its call site's own comment) — at most one 'typing' broadcast every
  // GQ_GROUP_TYPING_THROTTLE_MS per player, but the LAST keystroke always
  // still goes out (via the trailing timer) so nothing typed is silently
  // lost, just coalesced.
  const GQ_GROUP_TYPING_THROTTLE_MS = 200;
  let _gqGroupTypingLastSent = 0;
  let _gqGroupTypingPending  = null;
  let _gqGroupTypingTimer    = null;
  function _gqGroupSendTypingThrottled(text) {
    const now = Date.now();
    _gqGroupTypingPending = text;
    const elapsed = now - _gqGroupTypingLastSent;
    if (elapsed >= GQ_GROUP_TYPING_THROTTLE_MS) {
      _gqGroupTypingLastSent = now;
      _gqGroupTypingPending = null;
      window.LB.sendGq({ t: 'typing', uid: window._sbUserId, text, round: _gqGroupRound });
      return;
    }
    if (_gqGroupTypingTimer) return;
    _gqGroupTypingTimer = setTimeout(() => {
      _gqGroupTypingTimer = null;
      if (_gqGroupTypingPending === null || !window._gqGroupActive || solved) return;
      _gqGroupTypingLastSent = Date.now();
      window.LB.sendGq({ t: 'typing', uid: window._sbUserId, text: _gqGroupTypingPending, round: _gqGroupRound });
      _gqGroupTypingPending = null;
    }, GQ_GROUP_TYPING_THROTTLE_MS - elapsed);
  }
  function _gqGroupStopTypingThrottle() {
    if (_gqGroupTypingTimer) { clearTimeout(_gqGroupTypingTimer); _gqGroupTypingTimer = null; }
    _gqGroupTypingPending = null;
    _gqGroupTypingLastSent = 0;
  }

  window._gqGroupActive = false;
  let _gqGroupBaseSeed      = 0;
  let _gqGroupRound         = 1;
  let _gqGroupRounds        = 1;
  let _gqGroupTotal         = 0;
  let _gqGroupAttempts      = 0;
  let _gqGroupRank          = null;    // my placement this round, once the host confirms it
  // Whether I MYSELF solved THIS round — separate from the shared `solved`
  // var (which _gqGroupRenderWatch deliberately repurposes to reflect
  // whoever I'm watching "on loan" while waiting out the round, see its own
  // comment). Reading `solved` directly in _gqGroupCloseRound to decide
  // whether to send the "ran out of time" clock/shake broadcast made a
  // WINNER who happened to be on loan (watching someone still playing, whose
  // own `solved` is false) send it too, on THEIR OWN uid — the reported
  // "the shake shows on everyone, not just those still missing".
  let _gqGroupIAlreadySolved = false;
  // Who's currently disconnected (presence lost, not yet actually kicked —
  // see LB's _pendingKicks/processPendingKicks in lobby.js, which only
  // removes them for real once the WHOLE match ends) — set by
  // globequizSetLobbyDisconnected, read by the round-result table so it can
  // sort them to the bottom as "DESCALIFICADO" instead of by score, same as
  // their live card going gray (the reported "the card just disappears
  // instead of turning gray, and disconnecting mid-match should send them
  // to last place as disqualified").
  let _gqGroupDisconnectedUids = new Set();
  let _gqGroupBestKm        = Infinity;
  let _gqGroupBestAtMs      = 0;
  let _gqGroupCountdownEndsAt = null;
  let _gqGroupCountdownTimer  = null;
  let _gqGroupHostOrder     = [];      // host-only: uids in solve order, this round
  let _gqGroupRoundScored   = false;   // did MY round score already get added to the total?
  let _gqGroupRoundClosed   = false;   // did _gqGroupCloseRound already run for this round?
  let _gqGroupLastSecondsLeft = null;  // last painted countdown value, see _gqGroupTickCountdown
  let _gqGroupSolvedUids = new Set();  // every uid that solved THIS round (not just me) — who's still playing?
  let _gqGroupOnLoan = false;          // am I currently spectating someone else while waiting out my own 20s?
  let _gqGroupResultTimer   = null;    // 10s round-result table countdown (see _gqGroupShowRoundResultTable)
  let _gqGroupUsedCountries = new Set(); // country names already drawn this MATCH (see pickDailyCountry)
  let _gqGroupAlertTimer    = null;

  function _gqGroupUpdateRoundBadge() {
    const el = document.getElementById('gq-group-round-badge');
    if (!el) return;
    // "Por turnos" en desempate: "Ronda Final" en vez de "Ronda N/N" — ver
    // _gqTurnsIsTiebreak, seteado en _gqTurnsCloseRound cuando hay empate
    // de rondas ganadas al llegar a la última ronda configurada.
    // window._gqGroupTurnsActive is only ever true on a REAL PLAYER's own
    // client (set by showGlobequizGroupTurnsMode) — the external spectator
    // never runs that function, so this guard alone made it fall through to
    // "Ronda N/N" even with _gqTurnsIsTiebreak correctly set from the
    // 'pregame' payload (see globequizSpectatorShowPregame), showing
    // something like "Ronda 3/2" for the extra tiebreak round instead of
    // "Ronda Final" like real players see (reported). _gqTurnsIsTiebreak by
    // itself is exclusively a "por turnos" tiebreak flag — never true
    // outside that context for either a real player or this spectator — so
    // it's enough on its own.
    el.textContent = _gqTurnsIsTiebreak
      ? t('globequiz.finalRoundBadge')
      : t('globequiz.groupRoundBadge', { round: _gqGroupRound, total: _gqGroupRounds });
    el.classList.remove('is-visible');
    el.style.display = '';
    void el.offsetWidth; // forces reflow so the entrance transition actually plays
    requestAnimationFrame(() => el.classList.add('is-visible'));
  }
  // Exit animation before the 3-2-1-GO overlay itself hides — only reachable
  // for rounds 2+ (round 1's countdown is owned by initGlobeQuiz/
  // runGqPregameCountdown internally, so its badge just disappears with the
  // parent — not worth reaching into that shared function for this).
  function _gqGroupHideRoundBadge(onDone) {
    const el = document.getElementById('gq-group-round-badge');
    if (!el) { onDone(); return; }
    el.classList.remove('is-visible');
    setTimeout(() => { el.style.display = 'none'; onDone(); }, 300);
  }
  // "Alguien ya adivinó" banner for whoever hasn't solved yet — the generic
  // window.showVersusToast lives in the versus PANEL, which sits hidden
  // behind #globequiz-screen during an actual match, so it never rendered
  // (reported). This one lives inside the globe screen itself.
  function _gqGroupAlert(text) {
    const el = document.getElementById('gq-group-alert');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
    requestAnimationFrame(() => el.classList.add('is-visible'));
    clearTimeout(_gqGroupAlertTimer);
    _gqGroupAlertTimer = setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => { el.style.display = 'none'; }, 300);
    }, 3500);
  }
  // Exposed so the EXTERNAL group spectator (spectate.js) can show the same
  // "{name} ya adivinó el país!" notice real non-solving players see — it's
  // pure DOM/timer state, no dependency on _gqGroupActive, so it's safe to
  // reuse as-is for a passive spectator.
  window.globequizGroupSpectatorAlert = _gqGroupAlert;

  function _gqGroupPaintCountdown(secondsLeft) {
    const el = document.getElementById('gq-timer-number');
    if (el) el.textContent = String(Math.max(0, secondsLeft));
  }
  // Local wall-clock target: every client counts its OWN 20s from the
  // instant it actually received the 'countdown' signal (_gqGroupStartCountdown
  // recomputes `endsAt` fresh right below), instead of comparing the HOST's
  // stamped endsAt against Date.now() + a ping/pong CLOCK-OFFSET ESTIMATE —
  // that estimate can itself still be off by several seconds (reported, for
  // the same pattern on the lobby's own start countdown: "le sale Empieza en
  // 16, casi 6 segs de diferencia" — even WITH that correction in place).
  // Same fix applied there (window.Lobby's _startCountdown): treat the
  // broadcast as a plain SIGNAL, react the moment it's received, instead of
  // scheduling everyone against a shared clock two devices need to agree on
  // down to the second. Bonus: every player now gets the FULL 20s to answer
  // from the moment THEY learned the window opened, instead of a high-latency
  // player's countdown silently running for less real time than a low-latency
  // one's (both used to share the same absolute endsAt, stamped when the
  // signal left the host).
  function _gqGroupTickCountdown() {
    if (!_gqGroupCountdownEndsAt) return;
    const secondsLeft = Math.ceil((_gqGroupCountdownEndsAt - Date.now()) / 1000);
    // Only repaint/pulse/tick-sound when the displayed SECOND actually
    // changes — same guard _gqTickTurnTimer uses. Without it (this ran on
    // every 250ms poll unconditionally) the countdown icon's glow animation
    // was restarted 4x/sec instead of once, which read as a constant
    // flicker (reported) instead of one clean pulse per second.
    if (secondsLeft === _gqGroupLastSecondsLeft) return;
    _gqGroupLastSecondsLeft = secondsLeft;
    _gqGroupPaintCountdown(secondsLeft);
    if (typeof pulseCountdown === 'function') pulseCountdown();
    if (secondsLeft > 0 && secondsLeft <= 5) {
      _gqSetCountdownIconRed(true);
      if (typeof sfxTickdown !== 'undefined' && typeof sfxPlay === 'function') { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
    }
    // _gqGroupCloseRound() clears _gqGroupCountdownEndsAt itself (first
    // thing it does) — this guard is what actually stops repeat ticks from
    // calling it again: without it, if `endsAt` was already in the past by
    // the time _gqGroupStartCountdown ran (a late 'countdown' broadcast),
    // its OWN immediate tick fired _gqGroupCloseRound() BEFORE
    // _gqGroupCountdownTimer had even been assigned — so _gqGroupStopCountdown
    // found nothing to clear, the interval kept running every 250ms, and
    // every one of those ticks saw the same still-in-the-past endsAt and
    // called _gqGroupCloseRound() all over again (reported: the black
    // times-up flash kept re-firing on a loop).
    if (secondsLeft <= 0) _gqGroupCloseRound();
  }
  function _gqGroupStartCountdown(endsAt) {
    _gqGroupStopCountdown();
    // endsAt (still passed in — kept for API compat, deliberately unused):
    // see the long comment in _gqGroupTickCountdown. Recomputed fresh from
    // THIS client's own Date.now() at the instant the signal is actually
    // received.
    _gqGroupCountdownEndsAt = Date.now() + GQ_GROUP_COUNTDOWN_MS;
    _gqGroupLastSecondsLeft = null;
    _gqSetCountdownIconRed(false);
    document.querySelector('.gq-countdown-widget')?.style.removeProperty('display');
    // Timer assigned BEFORE the immediate tick (not after) — see the long
    // comment in _gqGroupTickCountdown for why this order matters.
    _gqGroupCountdownTimer = setInterval(_gqGroupTickCountdown, 250);
    _gqGroupTickCountdown();
  }
  function _gqGroupStopCountdown() {
    if (_gqGroupCountdownTimer) clearInterval(_gqGroupCountdownTimer);
    _gqGroupCountdownTimer = null;
  }

  // Adds a round score to my running total EXACTLY once — called either in
  // real time (the moment the host confirms my rank, right after I solve)
  // or, as a fallback, when the 20s window closes for whoever never solved.
  // Reports to the shared leaderboard right away (window.LB.reportScore/
  // sendScore, same as flags.js) so everyone sees it update live, not just
  // at the end of the round.
  function _gqGroupApplyRoundScore(score) {
    if (_gqGroupRoundScored) return;
    _gqGroupRoundScored = true;
    _gqGroupTotal += Math.round(score);
    // window._lobbyMembers (onScore/onMembers, lobby.js) only ever carries
    // OPPONENTS' scores — my own row needs this direct call, same as
    // sortFlagsLeaderboard in flags.js.
    _gqGroupPositionLb(_gqGroupTotal, true);
    window.LB.reportScore(_gqGroupTotal);
    window.LB.sendScore(_gqGroupTotal);
  }

  // Reuses the shared #timeup-overlay (cities/shapes/monuments' own
  // end-of-match flash) for the round-end beat — same 1800ms in / 400ms out
  // timing already used everywhere else.
  function _gqGroupShowTimesUp(onDone) {
    const el = document.getElementById('timeup-overlay');
    if (!el) { onDone(); return; }
    el.classList.remove('timeup-out');
    el.classList.add('timeup-in');
    el.style.display = 'flex';
    setTimeout(() => {
      el.classList.remove('timeup-in');
      el.classList.add('timeup-out');
      setTimeout(() => {
        el.style.display = 'none';
        el.classList.remove('timeup-out');
        onDone();
      }, 400);
    }, 1800);
  }
  // Exposed for the GroupSpectate "por turnos" mirror (spectate.js) — see
  // _specGqTurnsShowRoundResult there, which plays this same flash before
  // building its own table, just like the real non-winning players do.
  window._gqShowTimesUpFor = _gqGroupShowTimesUp;
  // "Por turnos" ONLY: the tiebreak ended by abandonment, not a real
  // timeout (see soloWin in _gqTurnsCloseRound) — same #powerquit-overlay
  // (gameover.png)/timing every 1v1 loser already gets
  // (globequizVsShowLoss/globequizSpectatorShowLoss), reused here instead
  // of the "TIMES UP" flash, which implied a clock running out that never
  // actually happened (per request).
  function _gqGroupShowGameOver(onDone) {
    const el = document.getElementById('powerquit-overlay');
    if (!el) { onDone(); return; }
    el.classList.remove('timeup-out');
    el.classList.add('timeup-in');
    el.style.display = 'flex';
    setTimeout(() => {
      el.classList.remove('timeup-in');
      el.classList.add('timeup-out');
      setTimeout(() => {
        el.style.display = 'none';
        el.classList.remove('timeup-out');
        onDone();
      }, 400);
    }, 1800);
  }
  // Exposed for the GroupSpectate "por turnos" mirror (spectate.js) — see
  // the 'tround' handler's soloWin case there.
  window._gqShowGameOverFor = _gqGroupShowGameOver;

  // Same visual as the multi-mode inter screen (_presentIntermediateResult
  // in lobby.js — reuses its exact .lobby-result-row/-pos/-avatar/-name/
  // -score classes, just in GloboReto's own #gq-round-result-screen so as
  // not to disturb that function's mode-transition-specific logic) — a 10s
  // ranking of the current totals, THEN the next round starts. No broadcast
  // needed to advance: same as _presentIntermediateResult's own next-mode
  // step, every client computes the next round's seed the same deterministic
  // way and starts it independently once ITS OWN local 10s timer ends.
  function _gqGroupShowRoundResultTable(onDone) {
    const screen = document.getElementById('gq-round-result-screen');
    const list   = document.getElementById('gq-round-result-list');
    const tag    = document.getElementById('gq-round-result-tag');
    if (!screen || !list) { onDone(); return; }
    const myId = window._sbUserId;
    // window._lobbyMembers' scores come from the 'lbscore' realtime
    // BROADCAST (instant, but fire-and-forget — a dropped message under any
    // network hiccup leaves that member stuck showing an OLDER round's win
    // count here). window.LB.getMembers() is backed by the DB (reportScore
    // + postgres_changes on lobby_members) — slower to land but reliable,
    // eventually catching up. Since "wins" only ever go UP within a match,
    // taking whichever of the two is HIGHER for each member is always safe
    // and self-heals a dropped broadcast instead of leaving the table stuck
    // (the reported "a veces la tabla no se actualiza con el puntaje
    // nuevo").
    const dbScoreById = new Map((window.LB && typeof window.LB.getMembers === 'function' ? window.LB.getMembers() : []).map(m => [m.id, m.score || 0]));
    const all = [{
      id: myId,
      name: (window._sbProfile && window._sbProfile.name) || localStorage.getItem('playerName') || 'Tú',
      avatar: localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png',
      frameCode: (window._sbProfile && window._sbProfile.frame_code) || '0001',
      score: _gqGroupTotal,
    }].concat((window._lobbyMembers || []).map(m => ({
      id: m.id, name: m.name, avatar: m.avatar, frameCode: m.frameCode || '0001',
      score: Math.max(m.score || 0, dbScoreById.get(m.id) || 0),
      disconnected: _gqGroupDisconnectedUids.has(m.id),
    })));
    // Disconnected members sort to the BOTTOM as disqualified, regardless
    // of score — same criterion as their card going gray live (the reported
    // "on disconnect they should drop to last place as disqualified", not
    // just vanish or stay ranked by a score that stopped updating).
    all.sort((a, b) => (!!a.disconnected - !!b.disconnected) || (b.score - a.score));
    // "Por turnos" en desempate: esta tabla muestra el resultado de la
    // última ronda CONFIGURADA (recién empatada, p.ej. "Ronda 2/2") — el
    // "Ronda Final" es para la RONDA EXTRA que sigue (su propio 3-2-1-GO,
    // ver _gqGroupUpdateRoundBadge/_gqTurnsIsTiebreak), no para esta tabla.
    if (tag) tag.textContent = t('globequiz.groupRoundBadge', { round: _gqGroupRound, total: _gqGroupRounds });
    // Same "correct country" reveal as the solo/1v1 endgame modal
    // (.gq-endgame-country/-flag) — dailyCountry is still THIS round's
    // target here, _gqGroupBeginRound(round+1) only overwrites it after
    // this table closes.
    const countryLabel = document.getElementById('gq-round-result-country-label');
    const countryFlag  = document.getElementById('gq-round-result-flag');
    if (countryLabel) countryLabel.textContent = dailyCountry ? t('globequiz.hintCorrect', { name: displayName(dailyCountry) }) : '';
    if (countryFlag) {
      const flagUrl = dailyCountry && dailyCountry.iso2 && window.flagUrlForCountryCode ? window.flagUrlForCountryCode(dailyCountry.iso2) : '';
      countryFlag.src = flagUrl || '';
      countryFlag.style.display = flagUrl ? '' : 'none';
    }
    const medals = ['🥇', '🥈', '🥉'];
    list.innerHTML = '';
    all.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'gq-round-result-row' + (m.id === myId ? ' is-me' : '') + (m.disconnected ? ' is-disconnected' : '');
      const scoreHtml = m.disconnected
        ? `<span class="gq-round-result-score gq-round-result-dq">${t('lobby.disqualified', 'DESCALIFICADO')}</span>`
        : `<span class="gq-round-result-score">${Math.round(m.score || 0).toLocaleString()}</span>`;
      row.innerHTML =
        `<span class="gq-round-result-pos">${medals[i] || (i + 1)}</span>` +
        `<div class="gq-round-result-avatar-wrap"><img class="gq-round-result-avatar" src="${m.avatar}" draggable="false" oncontextmenu="return false"></div>` +
        `<span class="gq-round-result-name">${m.name}${m.id === myId ? ' (' + t('lobby.you') + ')' : ''}</span>` +
        scoreHtml;
      window.CustomizeAssets?.applyFrame(row.querySelector('.gq-round-result-avatar-wrap'), m.frameCode || '0001');
      list.appendChild(row);
    });
    screen.style.display = 'flex';
    if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
    const bar  = document.getElementById('gq-round-result-bar');
    const cdEl = document.getElementById('gq-round-result-cd');
    const DURATION_MS = 10000;
    const start = Date.now();
    if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; }
    if (cdEl) cdEl.textContent = '10';
    requestAnimationFrame(() => { if (bar) { bar.style.transition = `width ${DURATION_MS}ms linear`; bar.style.width = '0%'; } });
    clearInterval(_gqGroupResultTimer);
    _gqGroupResultTimer = setInterval(() => {
      const remain = Math.ceil((DURATION_MS - (Date.now() - start)) / 1000);
      if (cdEl) cdEl.textContent = Math.max(0, remain);
      if (remain <= 0) {
        clearInterval(_gqGroupResultTimer); _gqGroupResultTimer = null;
        screen.style.display = 'none';
        onDone();
      }
    }, 200);
  }

  // My OWN 20s window just closed (whether I solved or not this round).
  // Guarded with _gqGroupRoundClosed — belt-and-suspenders on top of the
  // ordering fix in _gqGroupStartCountdown, so this can NEVER run twice for
  // the same round no matter what re-triggers _gqGroupTickCountdown.
  function _gqGroupCloseRound() {
    if (_gqGroupRoundClosed) return;
    _gqGroupRoundClosed = true;
    // Back to "player" status for everyone before the times-up flash/table
    // — see _gqGroupExitLoan (a no-op for anyone who wasn't on loan).
    _gqGroupExitLoan();
    _gqGroupStopCountdown();
    _gqGroupCountdownEndsAt = null;
    // Stops the ORIGINAL ascending elapsed-timer interval (started by
    // startTimer() at the top of the round) — updateTimerDisplay() only
    // skips painting #gq-timer-number WHILE _gqGroupCountdownEndsAt is set;
    // the instant this round-close nulled it out above, that guard opened
    // back up and the still-running 1s interval started painting the REAL
    // elapsed-seconds-since-round-start count over the frozen "0" (reported:
    // "the counter goes back to 48 49 50"). No reason for that timer to
    // keep running once the round is over anyway.
    stopTimer();
    // gamemusic keeps looping otherwise through the times-up flash and the
    // round-result table (reported) — same as every other mode's own
    // end-of-match/end-of-round beat (endFlagsGame/etc all cut it first).
    if (typeof playMusic === 'function') playMusic(null);
    const input = document.getElementById('gq-guess-input'), btn = document.getElementById('gq-guess-btn');
    if (input) input.disabled = true;
    if (btn) btn.classList.add('gq-disabled');
    // Safety net: whoever never solved (or, in principle, never got a rank
    // confirmation back in time) gets scored now — solvers were already
    // scored live in _gqGroupHandleGqEvent's 'rank' case.
    if (!_gqGroupRoundScored) {
      // _gqGroupIAlreadySolved, NOT the shared `solved` — see its own
      // comment: `solved` gets repurposed to reflect whoever I'm watching
      // "on loan" while waiting out the round, which is false for a winner
      // watching a still-playing member (this safety net would otherwise
      // score them as a fail).
      _gqGroupApplyRoundScore(_gqGroupIAlreadySolved
        ? _gqGroupRankScore(_gqGroupRank || 10, _gqGroupAttempts)
        : _gqGroupFailScore(_gqGroupBestKm, _gqGroupBestAtMs, _gqGroupAttempts));
    }
    const isLastRound = _gqGroupRound >= _gqGroupRounds;
    const afterFlash = () => {
      if (!window._gqGroupActive) return;
      if (isLastRound) {
        // Same generic "I finished this mode" hook every other lobby mode
        // uses (flags.js/etc) — lobby.js takes it from here (waits for
        // everyone, shows the final ranking, ends the room).
        window._lobbyHandleGameEnd(_gqGroupTotal);
        return;
      }
      _gqGroupShowRoundResultTable(() => {
        if (!window._gqGroupActive) return;
        _gqGroupBeginRound(_gqGroupRound + 1);
      });
    };
    // The "TIMES UP" flash + sfx ALWAYS plays for everyone when the round
    // closes — whether it's because time genuinely ran out or everyone
    // raced to solve before the shared 20s even did ('allsolved'), this is
    // a room-wide "the round is over" beat, same for solvers and
    // non-solvers alike (per explicit instruction: don't skip it based on
    // solved status — an earlier version that did desynced round
    // transitions between clients). What's genuinely conditional is ONLY
    // the clock/shake effect on a card — see right below — kept as a
    // SEPARATE step so the two don't accidentally end up gated by the same
    // condition again.
    if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
    // Clock/shake effect on MY OWN leaderboard row (this same client's
    // view) + tells everyone else (other real players' friends-bar rows,
    // and the external spectator's mirrored rows) so it shows there too —
    // ONLY if I genuinely didn't answer. _gqGroupIAlreadySolved, NOT the
    // shared `solved` — see its own comment: a WINNER on loan watching
    // someone still playing has `solved` repurposed to reflect THAT member
    // (false), which made the winner's own client also send this on THEIR
    // OWN uid (the reported "the shake still shows on everyone, not just
    // those still missing"). Separate from the room's generic 'timesup'
    // broadcast (LB.sendTimesUp), which for GlobeQuiz group means "I WON"
    // (drives _finishedUids/POV auto-advance, see the win branch above),
    // the opposite of what this effect is for.
    if (!_gqGroupIAlreadySolved) {
      window.globequizSetLobbyTimesUpFor(window._sbUserId);
      window.LB.sendGq({ t: 'ranout', uid: window._sbUserId, round: _gqGroupRound });
    }
    _gqGroupShowTimesUp(afterFlash);
  }

  // Host-arbitrated round protocol (window.LB.sendGq/onGq, see lobby.js) —
  // 'solved' (any client, on a correct guess) → host assigns rank + opens
  // the 20s window on the FIRST one; 'rank' (host → everyone) → the named
  // uid learns its placement (and, if it's ME, scores right away — see
  // _gqGroupApplyRoundScore); 'countdown' (host → everyone) → shared endsAt
  // + an alert for whoever hasn't solved yet. Both tagged with `round` so a
  // stray/delayed message from a round that already ended is ignored.
  // Advancing to the NEXT round needs no broadcast at all — see
  // _gqGroupShowRoundResultTable.
  function _gqGroupResolveName(uid) {
    if (uid === window._sbUserId) {
      return (window._sbProfile && window._sbProfile.name) || localStorage.getItem('playerName') || 'Alguien';
    }
    const m = (window._lobbyMembers || []).find(x => x.id === uid);
    return (m && m.name) || 'Alguien';
  }

  // Whoever finishes a round early gets bored watching their own already-
  // solved globe for up to 20s — instead they watch whoever's still
  // playing's guess list, rotating automatically as those finish too, until
  // either only one player is left or the round itself closes.
  //
  // Deliberately NOT built on GroupSpectate/openSpectatorGroup (the "spectate
  // on loan" system lobby.js's own _enterGroupWaitAsSpectator uses for the
  // DIFFERENT "wait for the whole mode to end" case): releasing this
  // client's own LB channel (needed so GroupSpectate can subscribe to the
  // same topic) broke the host's ability to arbitrate rank/countdown while
  // on loan, and skipping closeSpectator()'s teardown left the spectator
  // UI's own timer running forever (reported: "the counter goes back to
  // 42 43 44"). My own LB channel now stays connected the whole time
  // instead — round arbitration keeps working untouched, host included.
  //
  // The globe itself IS real, though — dailyCountry is the SAME for every
  // player in a round (shared seed), so there's nothing to swap there; only
  // `guesses` and `solved` need to temporarily reflect whoever I'm watching
  // instead of my own (already-finished) round, painted via the exact same
  // drawTexture/renderGuessList/focusOnCountry the real board uses. Safe to
  // repurpose them this way because MY OWN guesses/solved have nothing left
  // to do until the next round resets them fresh (_gqGroupBeginRound) — the
  // earlier version avoided this on purpose (to dodge
  // globequizSpectatorSyncGuesses's `if (solved) return` guard elsewhere)
  // but that threw out the real globe too; this reimplements just the
  // painting, without that shared function or its guard.
  let _gqGroupWatchUid = null;          // uid whose board I'm currently painting, or null
  let _gqGroupWatchGuesses = new Map(); // uid -> [{name,km,dir,color}], built live from onAnswer
  let _gqGroupWatchTyping  = new Map(); // uid -> last known typed text, so switching POV shows what's ALREADY there instead of waiting for their next keystroke

  function _gqGroupOnPeerAnswer(payload) {
    if (!window._gqGroupActive || !payload || !payload.uid || payload.uid === window._sbUserId) return;
    if (!payload.correct) {
      const list = _gqGroupWatchGuesses.get(payload.uid) || [];
      list.push({ name: payload.name, km: payload.km, dir: payload.dir, color: payload.color });
      _gqGroupWatchGuesses.set(payload.uid, list);
    }
    if (_gqGroupOnLoan && _gqGroupWatchUid === payload.uid) _gqGroupRenderWatch();
  }

  // Everyone in the room still going, in a stable order — recomputed fresh
  // on every nav action since who's still playing changes as people finish.
  function _gqGroupStillPlayingList() {
    return (window._lobbyMembers || []).filter(m => !_gqGroupSolvedUids.has(m.id));
  }

  // Paints the real globe with whoever I'm watching's guesses so far — same
  // pipeline the actual player sees (drawTexture colors the tried countries,
  // renderGuessList builds the side list, focusOnCountry centers the
  // camera on their latest pick). The camera/drag/zoom stay fully
  // interactive on MY side independently — this doesn't mirror their exact
  // viewpoint, just their progress, which is what "seeing their globe live"
  // actually needs.
  function _gqGroupRenderWatch() {
    if (!_gqGroupWatchUid) return;
    guesses = (_gqGroupWatchGuesses.get(_gqGroupWatchUid) || []).slice();
    solved = false; // I only ever watch someone still IN the round — see _gqGroupAdvanceWatch
    drawTexture();
    renderGuessList();
    if (guesses.length) {
      const last = guesses[guesses.length - 1];
      const c = countryByName.get(normalize(last.name || ''));
      if (c) focusOnCountry(c);
    }
  }

  // Same mini-HUD the real group spectator (other 4 modes, see
  // openSpectatorGroup/#spectator-mini-hud in spectate.js) uses: "ESPECTANDO"
  // tag + avatar + name + POV arrows, bottom of the screen — instead of a
  // one-off banner of our own, so this looks/behaves like every other
  // group-spectate surface in the game.
  function _gqGroupShowWatchBanner(member) {
    const hud       = document.getElementById('spectator-mini-hud');
    const row       = document.getElementById('spectator-mini-row');
    const nameEl    = document.getElementById('spectator-mini-name');
    const avatarEl  = document.getElementById('spectator-mini-avatar');
    const avatarWrap = document.getElementById('spectator-mini-avatar-wrap');
    const prevEl    = document.getElementById('spectator-mini-pov-prev');
    const nextEl    = document.getElementById('spectator-mini-pov-next');
    if (nameEl) nameEl.textContent = (member && member.name) || 'Jugador';
    if (avatarEl) avatarEl.src = (member && member.avatar) || 'images/profilepic/ppdefault.png';
    window.CustomizeAssets?.applyFrame(avatarWrap, (member && member.frameCode) || '0001');
    if (row) row.classList.add('group-pov');
    if (prevEl) prevEl.style.display = 'flex';
    if (nextEl) nextEl.style.display = 'flex';
    if (hud) hud.style.display = '';
    // Nothing of MY OWN round is relevant while watching someone else — the
    // "correct country" hint and the (already-disabled anyway) guess input
    // row would just be confusing clutter on top of their board.
    const hintEl = document.getElementById('gq-hint');
    if (hintEl) hintEl.style.display = 'none';
    document.querySelector('.gq-guess-row')?.style.setProperty('display', 'none');
    // Show the locked "what are they typing" bar — prefilled from
    // _gqGroupWatchTyping's cache (whatever they'd already typed by now),
    // not left on the default placeholder until their NEXT keystroke.
    document.getElementById('gq-group-watch-typing-row')?.style.setProperty('display', '');
    _gqGroupUpdateTypingPreview(_gqGroupWatchTyping.get(_gqGroupWatchUid) || '');
  }
  function _gqGroupHideWatchBanner() {
    const hud = document.getElementById('spectator-mini-hud');
    const row = document.getElementById('spectator-mini-row');
    const prevEl = document.getElementById('spectator-mini-pov-prev');
    const nextEl = document.getElementById('spectator-mini-pov-next');
    if (hud) hud.style.display = 'none';
    if (row) row.classList.remove('group-pov');
    if (prevEl) prevEl.style.display = 'none';
    if (nextEl) nextEl.style.display = 'none';
    // Clears the inline overrides from _gqGroupShowWatchBanner — the next
    // round's own flow (_gqGroupBeginRound) decides real visibility from
    // here, this just makes sure nothing stays stuck hidden if exit happens
    // outside that normal path.
    document.getElementById('gq-hint')?.style.removeProperty('display');
    document.querySelector('.gq-guess-row')?.style.removeProperty('display');
    document.getElementById('gq-group-watch-typing-row')?.style.setProperty('display', 'none');
    _gqGroupUpdateTypingPreview('');
  }
  // Live preview of what the currently-watched player is typing — see the
  // 'typing' broadcast (sent from every keystroke, same "no debounce" rule
  // the 1v1 turns-mode preview already uses) and its handling in
  // _gqGroupHandleGqEvent.
  function _gqGroupUpdateTypingPreview(text) {
    // Same trick globequizShowOpponentTyping uses for "por turnos" (1v1):
    // the input stays disabled/empty, its PLACEHOLDER is what shows the
    // live text — falls back to the normal "Escribe un país..." when empty.
    const input = document.getElementById('gq-group-watch-typing-input');
    if (!input) return;
    input.placeholder = (text || '').trim() || t('globequiz.inputPh');
  }
  document.getElementById('spectator-mini-pov-prev')?.addEventListener('click', () => {
    if (!_gqGroupOnLoan) return;
    if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    _gqGroupSwitchWatch(-1);
  });
  document.getElementById('spectator-mini-pov-next')?.addEventListener('click', () => {
    if (!_gqGroupOnLoan) return;
    if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    _gqGroupSwitchWatch(1);
  });

  function _gqGroupEnterLoan() {
    if (_gqGroupOnLoan || !window._gqGroupActive || solved !== true) return;
    const stillPlaying = _gqGroupStillPlayingList();
    if (!stillPlaying.length) return; // nobody left to watch — the round is about to close anyway ('allsolved')
    _gqGroupOnLoan = true;
    _gqGroupWatchUid = stillPlaying[0].id;
    _gqGroupShowWatchBanner(stillPlaying[0]);
    _gqGroupRenderWatch();
  }

  // Manual POV switch (prev/next arrows, see #spectator-mini-hud) — wraps
  // around the current still-playing list.
  function _gqGroupSwitchWatch(direction) {
    if (!_gqGroupOnLoan) return;
    const list = _gqGroupStillPlayingList();
    if (!list.length) { _gqGroupExitLoan(); return; }
    let idx = list.findIndex(m => m.id === _gqGroupWatchUid);
    idx = idx === -1 ? 0 : (idx + direction + list.length) % list.length;
    _gqGroupWatchUid = list[idx].id;
    _gqGroupShowWatchBanner(list[idx]);
    _gqGroupRenderWatch();
  }

  // Called when whoever I'm currently watching solves too — jump to another
  // still-playing member, or stop watching if nobody's left (the round is
  // about to close for everyone via 'allsolved').
  function _gqGroupAdvanceWatch() {
    if (!_gqGroupOnLoan) return;
    const stillPlaying = _gqGroupStillPlayingList();
    if (!stillPlaying.length) { _gqGroupExitLoan(); return; }
    _gqGroupWatchUid = stillPlaying[0].id;
    _gqGroupShowWatchBanner(stillPlaying[0]);
    _gqGroupRenderWatch();
  }

  // Back to normal "player" status — called as soon as MY round closes
  // (whether I was ever on loan or not; a no-op otherwise), so everyone is
  // off the watch UI before the next round's pregame countdown starts.
  function _gqGroupExitLoan() {
    if (!_gqGroupOnLoan) return;
    _gqGroupOnLoan = false;
    _gqGroupWatchUid = null;
    _gqGroupHideWatchBanner();
  }

  function _gqGroupHandleGqEvent(payload) {
    if (!window._gqGroupActive || !payload || payload.round !== _gqGroupRound) return;
    if (payload.t === 'solved') {
      _gqGroupSolvedUids.add(payload.uid);
      // check.png pop-in + check.mp3 over their card, stays until the round
      // ends — for EVERY client that receives this (including MY OWN, via
      // broadcast.self:true), not host-only.
      window.globequizSetLobbySolvedFor(payload.uid);
      // If I'm currently watching this uid on loan, they just finished too
      // — move on to someone else still playing.
      if (_gqGroupOnLoan && payload.uid === _gqGroupWatchUid) _gqGroupAdvanceWatch();
      if (window.LB.isHost()) {
        if (!_gqGroupHostOrder.includes(payload.uid)) _gqGroupHostOrder.push(payload.uid);
        const rank = _gqGroupHostOrder.indexOf(payload.uid) + 1;
        window.LB.sendGq({ t: 'rank', uid: payload.uid, rank, round: _gqGroupRound });
        const totalPlayers = window.LB.getMembers().length;
        if (_gqGroupHostOrder.length >= totalPlayers) {
          // Everyone already solved — end the round right now instead of
          // making the room wait out the rest of the 20s for nothing. A
          // dedicated 'allsolved' message (not a 'countdown' with endsAt=now)
          // so the close happens WITHOUT repainting the counter to 0 first —
          // it just freezes on whatever second was last shown.
          window.LB.sendGq({ t: 'allsolved', round: _gqGroupRound });
        } else if (_gqGroupHostOrder.length === 1) {
          window.LB.sendGq({ t: 'countdown', endsAt: Date.now() + GQ_GROUP_COUNTDOWN_MS, round: _gqGroupRound, solverUid: payload.uid });
        }
      }
      return;
    }
    if (payload.t === 'rank') {
      if (payload.uid === window._sbUserId) {
        _gqGroupRank = payload.rank;
        _gqGroupApplyRoundScore(_gqGroupRankScore(payload.rank, _gqGroupAttempts));
      }
      return;
    }
    if (payload.t === 'countdown') {
      if (!solved) _gqGroupAlert(t('globequiz.groupSomeoneSolved', { name: _gqGroupResolveName(payload.solverUid) }));
      _gqGroupStartCountdown(payload.endsAt);
      return;
    }
    if (payload.t === 'allsolved') { _gqGroupCloseRound(); return; }
    // Someone else's round genuinely ran out without them answering (see
    // the matching broadcast in _gqGroupCloseRound) — shows the clock/shake
    // effect on THEIR row in every other real player's own friends-bar
    // leaderboard (the external spectator gets the same signal separately,
    // see the 'gq' handler in spectate.js).
    if (payload.t === 'ranout') { window.globequizSetLobbyTimesUpFor(payload.uid); return; }
    if (payload.t === 'typing') {
      // Cached regardless of who I'm currently watching — so switching POV
      // to this uid later shows whatever they'd ALREADY typed by then,
      // instead of staying on the default placeholder until their next
      // keystroke (reported).
      _gqGroupWatchTyping.set(payload.uid, payload.text || '');
      if (_gqGroupOnLoan && payload.uid === _gqGroupWatchUid) _gqGroupUpdateTypingPreview(payload.text);
      return;
    }
  }

  // Answers lobby.js's 'staterequest' (see _resendMyState/sendGqGuesses
  // there) with MY current round's guesses/win, for a GlobeQuiz GROUP
  // spectator who (re)connected mid-round — mirrors reportGqGuesses/
  // _lastGqGuesses in SoloSpectate (the solo/VS path, which already had
  // this), never ported over when group mode was added. `guesses`/`solved`/
  // `dailyCountry` are this module's own live round state (same ones
  // read/reset by submitGuess/_gqGroupBeginRound), safe to read directly —
  // this function only ever gets called while _gqGroupActive.
  // Exposes this module's own `solved` (the GROUP SPECTATOR's local replay
  // state, same var the real player uses) — lets spectate.js's 'allsolved'
  // handler avoid double-triggering resolvePick's win effects (confetti/sfx
  // twice) when the normal 'ganswer' broadcast already resolved the win
  // before 'allsolved' arrived (see that handler's own comment).
  window._gqGroupSpecSolvedNow = function () { return solved === true; };

  window._gqGroupSnapshotForResend = function () {
    if (!window._gqGroupActive) return null;
    // Also includes whatever I have typed RIGHT NOW (not just past
    // guesses) — otherwise a spectator who (re)connects mid-keystroke saw
    // nothing in the "Escribe un país" bar until my NEXT character (the
    // reported "leaving and re-entering spectate doesn't show what's typed
    // right now"). Same guard as the live 'input' broadcast: nothing to
    // show once I've already solved.
    const typingEl = solved ? null : document.getElementById('gq-guess-input');
    return {
      guesses: guesses.slice(),
      solved: (solved && dailyCountry) ? { countryName: dailyCountry.name, iso2: dailyCountry.iso2 } : null,
      typing: typingEl ? typingEl.value : '',
      // The shared post-first-solve 20s countdown ('gq' t:'countdown') is a
      // ONE-TIME broadcast the host sends only at the moment of the first
      // solve — a spectator who (re)connects/switches POV AFTER that moment
      // never receives it, so their own mirrored countdown/round-result
      // table never started (the reported "spectator doesn't react when
      // everyone finishes, no coordinated times up"). Piggyback the current
      // value (if any) on this resend so they can catch up.
      round: _gqGroupRound,
      totalRounds: _gqGroupRounds,
      countdownEndsAt: _gqGroupCountdownEndsAt || null,
      // Covers the OTHER way the round can already be over with nothing
      // left to broadcast: everyone solved before the 20s countdown even
      // started, which skips straight to a one-time 'allsolved' (see
      // _gqGroupHandleGqEvent's 'solved' case) — a spectator connecting
      // after THAT moment has no countdown to catch up on either, so
      // without this flag they were just stuck on a frozen board with no
      // times-up/round-result at all until the NEXT round's broadcasts.
      roundClosed: _gqGroupRoundClosed,
    };
  };

  // GROUP spectator only: force-syncs the "Ronda N/N" badge from a
  // 'gqguesses' resend (see the listener in spectate.js), independent of
  // whether a distinct 'round' broadcast also happens to arrive/dedupe
  // correctly. The badge is driven by these SAME `_gqGroupRound`/
  // `_gqGroupRounds` vars a real round-replay would set — this just updates
  // them (and repaints) without touching guesses/solved/dailyCountry, so
  // it's safe to call on every resend without disturbing the board. Without
  // it, a spectator's round number could lag behind whatever the last
  // ACCEPTED (non-duplicate) 'round' broadcast happened to be — worked most
  // of the time, but left a stale/off-by-one badge in exactly the race the
  // rest of this resend protocol exists to close (the reported "the
  // spectator's round shows one behind the real one").
  window.globequizSpectatorSyncRoundBadge = function (round, totalRounds) {
    if (typeof round !== 'number') return;
    _gqGroupRound = round;
    if (typeof totalRounds === 'number') _gqGroupRounds = totalRounds;
    _gqGroupUpdateRoundBadge();
  };

  // Starts (or advances to) round `round` with seed `seed` — called for
  // round 1 from showGlobequizGroupMode (loads the 3D scene via
  // initGlobeQuiz()), and every round after that from _gqGroupCloseRound,
  // once the round-result table closes. Rounds 2+ do NOT call
  // initGlobeQuiz() again — that reruns its loader/spinner/space-vignette
  // reset on an ALREADY-loaded scene, which showed as a repeated black
  // flicker every round (reported); instead this replays just the
  // pregame-countdown+timer beat by hand, same code initGlobeQuiz() itself
  // runs internally (see startGqCountdown there). The PRNG is seeded ONCE,
  // at round 1 — see pickDailyCountry() for why rounds 2+ must keep
  // drawing from that SAME stream instead of reseeding.
  function _gqGroupBeginRound(round) {
    // Defensive: everyone must be back to "player" for the new round — see
    // the long comment on _gqGroupExitLoan. Normally already exited by the
    // time the round-result table closes (_gqGroupCloseRound), this just
    // guards against the round-1 case and any edge case that skipped it.
    _gqGroupExitLoan();
    _gqGroupRound            = round;
    _gqGroupAttempts         = 0;
    _gqGroupRank             = null;
    _gqGroupIAlreadySolved   = false;
    _gqGroupBestKm           = Infinity;
    _gqGroupBestAtMs         = 0;
    _gqGroupHostOrder        = [];
    _gqGroupSolvedUids       = new Set();
    _gqGroupWatchGuesses     = new Map();
    _gqGroupWatchTyping      = new Map();
    _gqGroupCountdownEndsAt  = null;
    _gqGroupRoundScored      = false;
    _gqGroupRoundClosed      = false;
    _gqGroupStopCountdown();
    document.querySelector('.gq-countdown-widget')?.style.setProperty('display', 'none');
    guesses = []; solved = false; animatedGuessNames = new Set(); dailyCountry = null;
    _gqGroupClearSolvedIcons();
    _gqGroupUpdateRoundBadge();
    if (round === 1) {
      window.globequizSetSeed(_gqGroupBaseSeed);
      window.initGlobeQuiz();
      return;
    }
    // Cuts postgameloop.mp3 (still playing from the round-result table)
    // right as the 3-2-1-GO starts — it kept playing straight through the
    // next round otherwise (reported).
    if (typeof playMusic === 'function') playMusic(null);
    // Same base position/zoom/auto-rotate reset initGlobeQuiz() does for
    // round 1 — dropped when round 2+ stopped calling initGlobeQuiz() (to
    // fix the black flicker), which left the globe wherever the previous
    // round's guesses left it instead of a fresh spinning view (reported).
    if (sphere) { sphere.rotation.x = BASE_ROT_X; sphere.rotation.y = BASE_ROT_Y; }
    zoomZ = BASE_Z;
    if (camera) camera.position.z = zoomZ;
    if (typeof updateSpaceVignette === 'function') updateSpaceVignette();
    startAutoRotate();
    pickDailyCountry();
    drawTexture();
    renderGuessList();
    updateHint();
    const msg = document.getElementById('gq-win-msg');
    if (msg) msg.style.display = 'none';
    const input = document.getElementById('gq-guess-input'), btn = document.getElementById('gq-guess-btn');
    if (input) { input.disabled = false; input.value = ''; }
    if (btn) btn.classList.remove('gq-disabled');
    const guessRow = document.querySelector('.gq-guess-row');
    const hintEl2  = document.getElementById('gq-hint');
    const canvasEl = document.getElementById('gq-canvas');
    if (guessRow) guessRow.style.display = 'none';
    if (hintEl2) hintEl2.style.display = 'none';
    if (canvasEl) canvasEl.style.pointerEvents = 'none';
    // Tagged with the round counter (same reason as the 'round' broadcast
    // below) so a spectator's badge is already correct DURING this round's
    // 3-2-1-GO, instead of only once 'round' arrives at the END of it (the
    // reported "starting round 2/5, the spectator still shows 1/5").
    if (typeof window._specReportPregame === 'function') window._specReportPregame({ mode: 'globequiz', startedAt: Date.now(), round: _gqGroupRound, totalRounds: _gqGroupRounds });
    runGqPregameCountdown(() => {
      _gqGroupHideRoundBadge(() => {});
      if (guessRow) guessRow.style.display = '';
      if (hintEl2) hintEl2.style.display = '';
      if (canvasEl) canvasEl.style.pointerEvents = '';
      if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
      startTimer();
      if (typeof window._specReportRound === 'function') window._specReportRound({ mode: 'globequiz', startedAt: gqTimerStart, round: _gqGroupRound, totalRounds: _gqGroupRounds });
    });
  }

  // ── Leaderboard grupal (reusa .gq-friends-bar + .lb-entry, mismo sistema
  // que flagsSetLobbyScores/etc en flags.js — GQ_LB_WINDOW/GQ_LB_ROW_H_CQMIN
  // ya existían para la lista de amigos del modo diario). ──────────────────
  function _gqGroupBuildLeaderboard() {
    const bar = document.getElementById('gq-friends-bar');
    if (!bar) return;
    bar.innerHTML = '';
    // .lb-rank (el numerito 1°/2°/3°) es display:none por defecto — solo se
    // muestra con esta clase (ver #gq-friends-bar.vs-active .lb-rank en
    // style.css), igual que #flags-leaderboard/#leaderboard.
    bar.classList.add('vs-active');
    gqLbElements = {};
    _gqGroupLastScores = {};
    const myName = (window._sbProfile && window._sbProfile.name) || localStorage.getItem('playerName') || 'Tú';
    const playerEl = document.createElement('div');
    playerEl.className = 'lb-entry lb-player';
    playerEl.id = 'gq-lb-player';
    playerEl.innerHTML = `<span class="lb-rank rank-other"></span>`
      + `<div class="lb-avatar"><img class="lb-avatar-img" src="${localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png'}"></div>`
      + `<span class="lb-name">${myName}</span>`
      + `<span class="lb-score" id="gq-lb-player-score">0</span>`;
    playerEl.style.transition = 'none';
    playerEl.style.top = '-9999px';
    gqLbElements['player'] = playerEl;
    bar.appendChild(playerEl);
    if (window.CustomizeAssets) window.CustomizeAssets.applyCard(playerEl, (window._sbProfile && window._sbProfile.card_code) || '0001');
    (window._lobbyMembers || []).forEach(m => {
      const el = document.createElement('div');
      el.className = 'lb-entry';
      el.id = 'gq-lb-lob' + m.id;
      el.innerHTML = `<span class="lb-rank rank-other"></span>`
        + `<div class="lb-avatar"><img class="lb-avatar-img" src="${m.avatar}"></div>`
        + `<span class="lb-name">${m.name}</span>`
        + `<span class="lb-score">0</span>`;
      el.style.transition = 'none';
      el.style.top = '-9999px';
      window.CustomizeAssets?.applyCard(el, m.cardCode || '0001');
      gqLbElements['lob' + m.id] = el;
      bar.appendChild(el);
    });
    requestAnimationFrame(() => {
      _gqGroupPositionLb(0, false);
      requestAnimationFrame(() => {
        Object.values(gqLbElements).forEach(el => { el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)'; });
      });
    });
  }
  // Same pattern as flagsPositionLeaderboard (js/flags.js, the proven one
  // the other 4 modes all share) — NOT excluding disconnected members from
  // the sort/list at all. Their score is simply frozen (they can't answer
  // anymore), so they drift down in rank naturally as everyone else keeps
  // scoring, same as any player who just stops scoring. An earlier attempt
  // specifically excluded/froze their `top` — that put them in a SEPARATE
  // coordinate system from the active window, which re-anchors its
  // bottomOffset against a member count that no longer included them, so
  // the frozen row's stale position drifted out of sync and visually
  // collided with the active window (the reported "everyone keeps dropping
  // position and overlapping"). ALSO dropped the `-9999px` sentinel for
  // out-of-window ranks flags.js never had either — every row always gets
  // a real, continuous `top` from the SAME formula (the container's own
  // clip-path hides whatever falls outside, see .gq-friends-bar); jumping
  // a row between a real coordinate and -9999px was its own source of
  // visible overlap during the 0.7s transition.
  function _gqGroupPositionLb(myScore, animate) {
    const liveById = new Map((window._lobbyMembers || []).map(m => ['lob' + m.id, m.score || 0]));
    // Roster comes from gqLbElements (built ONCE at match start, see the
    // build loop above), not from window._lobbyMembers directly: the moment
    // someone leaves the room, the presence layer drops them from
    // window._lobbyMembers entirely (window.LB.onMembers → _refreshLobbyOpponents
    // in lobby.js), so building `all` from that list straight away made
    // their row disappear from the ranking mid-animation while everyone
    // else's card re-flowed into the freed slot — the departed member's own
    // card, never touched again, sat frozen at its old top/z-index and got
    // buried under whoever moved into it (the reported "the instant someone
    // leaves, the rest shift down and that card ends up underneath").
    // Falling back to their last known score keeps them counted at their
    // frozen rank instead, same as an ordinary disconnect.
    const all = Object.keys(gqLbElements).map(id => {
      if (id === 'player') return { id, score: myScore };
      const score = liveById.has(id) ? liveById.get(id) : (_gqGroupLastScores[id] || 0);
      _gqGroupLastScores[id] = score;
      return { id, score };
    });
    // Disconnected members always sort to the BOTTOM, regardless of score —
    // otherwise someone who left after scoring well would keep sitting near
    // the top of the ranking, greyed out, instead of reading as "out of the
    // match" the way a last-place row does.
    all.sort((a, b) => {
      const da = a.id !== 'player' && _gqGroupDisconnectedUids.has(a.id.slice(3));
      const db = b.id !== 'player' && _gqGroupDisconnectedUids.has(b.id.slice(3));
      if (da !== db) return da ? 1 : -1;
      return b.score - a.score;
    });
    if (!animate) Object.values(gqLbElements).forEach(el => { el.style.transition = 'none'; });
    const playerRank = all.findIndex(p => p.id === 'player');
    let windowStart = Math.max(0, playerRank - 1);
    let windowEnd   = Math.min(all.length, windowStart + GQ_LB_WINDOW);
    windowStart     = Math.max(0, windowEnd - GQ_LB_WINDOW);
    const bottomOffset = Math.max(0, GQ_LB_WINDOW - (windowEnd - windowStart)) * GQ_LB_ROW_H_CQMIN;
    all.forEach((p, rank) => {
      const el = gqLbElements[p.id];
      if (!el) return;
      el.style.top = ((rank - windowStart) * GQ_LB_ROW_H_CQMIN + bottomOffset) + 'cqmin';
      // z-index by CURRENT rank, not DOM order: the rows are created once
      // (player first, then _lobbyMembers in their original join order) and
      // never reordered in the DOM, so with no z-index at all the paint
      // order stayed frozen at that original order forever. A member who
      // disconnects mid-match keeps drifting down in rank (frozen score)
      // while whoever overtakes them animates through their old slot — if
      // that overtaker happened to be LATER in the original DOM order, its
      // card painted on top and fully buried the disconnected member's card
      // (the reported "4 players, one leaves, only 3 cards show — the
      // disconnected one ends up under the one above it").
      el.style.zIndex = String(all.length - rank);
      const rk = el.querySelector('.lb-rank');
      if (rk) rk.className = 'lb-rank ' + (rank === 0 ? 'rank-1' : rank === 1 ? 'rank-2' : rank === 2 ? 'rank-3' : 'rank-other');
      if (rk) rk.textContent = rank + 1;
    });
    if (animate) requestAnimationFrame(() => {
      Object.values(gqLbElements).forEach(el => { el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)'; });
    });
    const s = gqLbElements['player']?.querySelector('.lb-score');
    if (s) s.textContent = Math.round(myScore).toLocaleString();
  }
  window.globequizSetLobbyScores = function(members) {
    if (!window._gqGroupActive || !Array.isArray(members)) return;
    members.forEach(m => {
      const el = gqLbElements['lob' + m.id];
      if (el) { const s = el.querySelector('.lb-score'); if (s) s.textContent = Math.round(m.score || 0).toLocaleString(); }
    });
    _gqGroupPositionLb(_gqGroupTotal, true);
  };
  // Exposed so spectate.js's OWN separate leaderboard renderer
  // (_renderGroupLeaderboardInner, used by real players "on loan" watching
  // each other while waiting AND by the true external spectator) can apply
  // the exact same "exclude from live re-sort" rule _gqGroupPositionLb uses
  // below — that renderer has no disconnected-tracking of its own.
  window._gqGroupIsDisconnected = uid => _gqGroupDisconnectedUids.has(uid);
  window.globequizSetLobbyDisconnected = function(uid, disconnected) {
    if (disconnected) _gqGroupDisconnectedUids.add(uid); else _gqGroupDisconnectedUids.delete(uid);
    const el = gqLbElements['lob' + uid];
    if (!el) return;
    el.classList.toggle('is-disconnected', !!disconnected);
    if (disconnected) {
      if (!el.querySelector('.lb-disconnected-icon')) {
        const icon = document.createElement('div');
        icon.className = 'lb-disconnected-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.5 2.5 5.09 3.91l2.59 2.59-2.09 2.09A3.003 3.003 0 0 0 6 14.83V17H4v2h2v2h2v-2h2v-2h.17c.93 0 1.76-.37 2.37-.96l-.01-.01 2.06 2.06 1.41-1.41-9.5-9.5zm1.59 9.09A1.003 1.003 0 0 1 8 10.83V9.41l1.5 1.5-.41.68H8.09zm5.72 1.64-.01-.01c.13-.29.2-.61.2-.93V9.17c0-.93-.37-1.76-.96-2.37L11.66 5h2.59L19 9.75l-3.17 3.17.02.01zM19.07 4.93l-1.41 1.42L19 7.68l1.5-1.5-1.43-1.25z"/></svg>';
        el.appendChild(icon);
      }
    } else {
      el.querySelector('.lb-disconnected-icon')?.remove();
    }
    // Re-sort right away — otherwise a member who leaves after scoring well
    // stays parked near the top (greyed out) until the next score broadcast
    // happens to trigger a re-sort; _gqGroupPositionLb's own sort now sends
    // disconnected rows straight to the bottom regardless of score. "Por
    // turnos" uses its own separate positioning (sorts by rounds won, no
    // fixed 4-row window — see _gqTurnsPositionLb).
    if (window._gqGroupTurnsActive) _gqTurnsPositionLb();
    else _gqGroupPositionLb(_gqGroupTotal, true);
  };
  // Sin efecto visual de "wrong" por intento en esta variante (v1) — acá
  // casi todo intento salvo el último es técnicamente "wrong", un flash en
  // cada uno sería ruido constante; se deja como no-op.
  window.globequizSetLobbyWrongFor = function() {};
  // Shake + ícono de cronómetro (⏱️, mismo _applyTimesUpEffect universal que
  // usan flags/shapes/monuments) en la fila de quien se quedó SIN
  // responder al cerrarse la ronda — llamado tanto para MI propia fila
  // (uid === yo) como para la de otro jugador (ver 'gq' t:'ranout' en
  // _gqGroupHandleGqEvent). Antes era un no-op puro: nadie — ni el propio
  // jugador que se quedó sin tiempo — veía nunca este efecto (el reportado
  // "ni el jugador ni el espectador ven la animación del cronómetro").
  window.globequizSetLobbyTimesUpFor = function(uid) {
    const el = (uid === window._sbUserId) ? gqLbElements['player'] : gqLbElements['lob' + uid];
    if (typeof window._applyTimesUpEffect === 'function') window._applyTimesUpEffect(el);
  };
  // check.png pop-in (+ check.mp3) over whoever's card just solved — STAYS
  // up (unlike the clock/shake, which fades) until the round ends, see
  // _gqGroupBeginRound's cleanup below. Called for MY OWN card too (the
  // 'gq' t:'solved' broadcast echoes back to its own sender — LB's channel
  // has broadcast.self:true, see _subscribe in lobby.js) — this is what the
  // player who just solved, every OTHER real player in the room, and the
  // external spectator (see the matching 'gq' handler in spectate.js) all
  // see, all from this SAME call.
  window.globequizSetLobbySolvedFor = function(uid) {
    const el = (uid === window._sbUserId) ? gqLbElements['player'] : gqLbElements['lob' + uid];
    if (!el) return;
    if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    let icon = el.querySelector('.lb-check-icon');
    if (!icon) {
      icon = document.createElement('img');
      icon.className = 'lb-check-icon';
      icon.src = 'images/check.png';
      icon.draggable = false;
      el.appendChild(icon);
    }
    icon.classList.remove('show'); void icon.offsetWidth;
    icon.classList.add('show');
  };
  // Clears every check icon left over from the PREVIOUS round — called from
  // _gqGroupBeginRound (real players' own leaderboard), and mirrored for
  // the external spectator in spectate.js's 'round' handler (isNewRound).
  function _gqGroupClearSolvedIcons() {
    Object.values(gqLbElements).forEach(el => el?.querySelector('.lb-check-icon')?.remove());
  }

  // Preload gate for the lobby's pre-match sync panel (see _runLobbySyncGate
  // in lobby.js) — GlobeQuiz group needs three.js (CDN) + the embedded
  // countries geojson parsed before showGlobequizGroupMode can actually
  // start; the other 4 modes' assets are already preloaded up front (see
  // manifest.js) and resolve instantly.
  window._gqGroupPreload = function() {
    return Promise.all([loadThree(), loadCountries()]);
  };

  // Entry point — llamado desde _launchLobbyGame (lobby.js) cuando el modo
  // de la sala es 'globequiz'. La PRNG se seedea UNA sola vez acá (ronda 1,
  // dentro de _gqGroupBeginRound) — nunca se vuelve a reseedear a mitad de
  // match, ver pickDailyCountry().
  window.showGlobequizGroupMode = function(rounds, seed) {
    window._gqGroupActive = true;
    _gqGroupBaseSeed      = seed;
    _gqGroupRounds        = Math.max(1, rounds || 1);
    _gqGroupTotal         = 0;
    _gqGroupUsedCountries = new Set();
    _gqGroupDisconnectedUids = new Set();
    const gqScreen = document.getElementById('globequiz-screen');
    if (gqScreen) gqScreen.style.display = 'block';
    if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
    window.LB.onGq(_gqGroupHandleGqEvent);
    // Feeds _gqGroupWatchGuesses (see _gqGroupOnPeerAnswer) for the
    // "watch whoever's still playing" feature — registered once for the
    // whole match, same lifetime as onGq above.
    window.LB.onAnswer(_gqGroupOnPeerAnswer);
    _gqGroupBuildLeaderboard();
    _gqGroupBeginRound(1);
  };

  // Called from globequizHardReset (mode teardown / quit / abandon) — stops
  // the round-protocol listener and any pending timers so nothing from a
  // finished/abandoned group match keeps firing into the next thing played.
  function _gqGroupTeardown() {
    if (!window._gqGroupActive) return;
    // Hides the watch banner/list if I was mid-loan — my own LB channel was
    // never touched by that (see the long comment on _gqGroupEnterLoan), so
    // there's no channel/spectator system to reconnect here, just local UI.
    _gqGroupExitLoan();
    _gqGroupOnLoan = false;
    _gqGroupWatchGuesses = new Map();
    _gqGroupWatchTyping = new Map();
    window._gqGroupActive = false;
    _gqGroupStopCountdown();
    _gqGroupStopTypingThrottle();
    if (_gqGroupResultTimer) { clearInterval(_gqGroupResultTimer); _gqGroupResultTimer = null; }
    if (window.LB && typeof window.LB.onGq === 'function') window.LB.onGq(null);
    if (window.LB && typeof window.LB.onAnswer === 'function') window.LB.onAnswer(null);
    _gqGroupHostOrder = [];
    _gqGroupCountdownEndsAt = null;
    document.getElementById('gq-round-result-screen')?.style.setProperty('display', 'none');
    document.getElementById('gq-friends-bar')?.classList.remove('vs-active');
    document.getElementById('gq-group-round-badge')?.style.setProperty('display', 'none');
    const alertEl = document.getElementById('gq-group-alert');
    if (alertEl) { alertEl.style.display = 'none'; alertEl.classList.remove('is-visible'); }
    clearTimeout(_gqGroupAlertTimer);
    const tuo = document.getElementById('timeup-overlay');
    if (tuo) { tuo.style.display = 'none'; tuo.classList.remove('timeup-in', 'timeup-out'); }
  }

  // ══════════════════════════════════════════════════════════════════════
  // GloboReto grupal "POR TURNOS" — un jugador a la vez adivina el MISMO
  // país (el resto mira en vivo); al acertar o agotar su reloj, el turno
  // pasa al siguiente jugador CONECTADO; si nadie acierta después de darle
  // la vuelta a todos, se repite la vuelta sobre el mismo país (hot-potato)
  // hasta que alguien acierte. Reutiliza TODO lo genérico de la variante
  // "tiempo real" de arriba (_gqGroupRound/_gqGroupRounds/_gqGroupTotal/
  // _gqGroupBaseSeed/_gqGroupDisconnectedUids/_gqGroupUsedCountries,
  // gqLbElements/_gqGroupBuildLeaderboard/_gqGroupPositionLb/
  // _gqGroupLastScores, _gqGroupRankScore/_gqGroupFailScore/
  // _gqGroupApplyRoundScore, _gqGroupShowRoundResultTable/_gqGroupShowTimesUp,
  // window._lobbyHandleGameEnd) — lo único nuevo es de QUIÉN es el turno y
  // el protocolo de traspaso, arbitrado por el HOST (mismo principio que el
  // 'solved'/'rank'/'countdown' de tiempo real: única fuente de verdad para
  // evitar que dos clientes vean un orden de turno distinto por latencia).
  // ══════════════════════════════════════════════════════════════════════
  window._gqGroupTurnsActive = false;   // true durante todo el match "por turnos" grupal
  window._gqGroupTurnsMyTurn = false;   // ¿me toca a MÍ ahora mismo?
  let _gqTurnsTimeSec      = GQ_TURN_TIME_SECONDS; // leído de getGloboretoConfig().turnTime al arrancar
  let _gqTurnsOrder        = [];        // uids conectados, orden determinístico (ordenado por id), recalculado cada ronda
  let _gqTurnsPointer      = 0;         // índice en _gqTurnsOrder de quien tiene el turno
  let _gqTurnsActiveUid    = null;
  let _gqTurnsMyAttempts   = 0;         // mis intentos ESTA ronda (puede ser >1 si la vuelta se repite y me toca de nuevo)
  let _gqTurnsMyBestKm     = Infinity;
  let _gqTurnsMyBestAtMs   = 0;
  let _gqTurnsTimerInterval = null;
  let _gqTurnsSecondsLeft   = 0;
  let _gqTurnsStartedAt     = 0;
  // Every real client sees every 'ttyping' broadcast (see the 'ttyping' case
  // in _gqTurnsHandleGqEvent below), so ANY of them — not just the active
  // typer — can cache the latest text. Included in the HOST's 'tstate' reply
  // so a GroupSpectate viewer who (re)connects mid-turn sees what's ALREADY
  // typed right away, instead of blank until the NEXT keystroke (the
  // reported "aun no sale con lo que tiene escrito en ese momento"). Reset
  // on every turn hand-off — a new typer never inherits the previous one's
  // leftover text.
  let _gqTurnsLastTypingText = '';
  // Reemplaza al puntaje por cercanía/intentos SOLO en esta variante: acá el
  // leaderboard ordena y decide el ganador final por CANTIDAD DE RONDAS
  // GANADAS (uid -> conteo), no por _gqGroupTotal. Reseteado por match en
  // showGlobequizGroupTurnsMode.
  let _gqTurnsWinsByUid = {};
  // Desempate final: si al cerrar la ÚLTIMA ronda configurada hay empate en
  // la cima de rondas ganadas, se juega UNA ronda extra solo entre quienes
  // empataron — el resto queda afuera del sorteo de turno (espectadores de
  // hecho, ver _gqTurnsComputeOrder) hasta que termine la partida. Quien
  // gane esa ronda extra es el ganador final, sin volver a chequear empate.
  let _gqTurnsIsTiebreak = false;
  let _gqTurnsTiebreakUids = null; // Set<uid> o null

  // Ruleta grupal — generaliza _showGqRoulette (js/vs.js, 1v1) a N jugadores.
  // Igual que ahí, es puramente COSMÉTICA: el que arranca ya está decidido
  // de forma determinística por semilla+ronda (ver _gqTurnsPickStarterIdx,
  // sin broadcast, todos los clientes calculan el mismo valor), la ruleta
  // solo gira y cae en uno de los casilleros que le tocaron a ese jugador.
  // Tres assets reales (mismas cuñas parejas, un jugador por casillero
  // cuando no divide exacto deja casillero(s) en blanco = "gira de nuevo",
  // nunca elegibles como target así que la ruleta jamás cae ahí de verdad):
  // ruleta1.png (10 cuñas: 2/5/9/10 jugadores), ruleta1-2.png (12 cuñas:
  // 3/4/6) y ruleta1-3.png (8 cuñas: 7/8).
  // seamAtTop: ruleta1.png tiene una cuña CENTRADA arriba (0°) — mismo
  // criterio que ya usaba el 1v1 (seat 0 en rotate(0deg)). ruleta1-2.png y
  // ruleta1-3.png en cambio tienen una COSTURA arriba (borde entre dos
  // cuñas justo en 0°), no una cuña centrada — sin corregir esto, los
  // avatares quedaban plantados sobre la línea divisoria en vez de en el
  // medio de cada cuña (el reportado "descoordinada por la mitad" con 4
  // jugadores, que usan ruleta1-2.png).
  const GQ_GROUP_ROULETTE_LAYOUT = {
    2:  { image: 'images/ruleta1.png',   total: 10, seamAtTop: false },
    3:  { image: 'images/ruleta1-2.png', total: 12, seamAtTop: true },
    4:  { image: 'images/ruleta1-2.png', total: 12, seamAtTop: true },
    5:  { image: 'images/ruleta1.png',   total: 10, seamAtTop: false },
    6:  { image: 'images/ruleta1-2.png', total: 12, seamAtTop: true },
    7:  { image: 'images/ruleta1-3.png', total: 8,  seamAtTop: true }, // 1 casillero de sobra
    8:  { image: 'images/ruleta1-3.png', total: 8,  seamAtTop: true },
    9:  { image: 'images/ruleta1.png',   total: 10, seamAtTop: false }, // 1 casillero de sobra
    10: { image: 'images/ruleta1.png',   total: 10, seamAtTop: false },
  };
  // Xorshift32 determinístico, SEPARADO del gqRand() que alimenta
  // pickDailyCountry (nunca comparte su stream — no hay riesgo de
  // desincronizar el país sorteado por consumir de más de esa PRNG). Usado
  // por el sorteo cosmético de la ruleta grupal para que la cantidad de
  // "rebotes" en gira-de-nuevo (y por lo tanto la DURACIÓN de la animación)
  // salga IDÉNTICA en todos los clientes — antes usaba Math.random(), cada
  // cliente tiraba una cantidad distinta de rebotes y por lo tanto el
  // 3-2-1-GO arrancaba en un momento distinto en cada pantalla (el
  // reportado "la ruleta y el 3-2-1-GO inician descoordinados, el ganador
  // arranca antes que el resto").
  function _gqMiniRand(seed) {
    let s = seed >>> 0; if (!s) s = 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 0x100000000; };
  }
  // `seed`: cuando se pasa, TODO el sorteo cosmético (rebotes, casillero
  // final entre los del ganador, vueltas extra, jitter) sale de esa PRNG
  // determinística en vez de Math.random() — mismo seed en todos los
  // clientes (ver _gqTurnsPickOrderAndShowRoulette) da la MISMA secuencia,
  // así que la animación entera (y su duración) queda idéntica para todos.
  // Sin seed (el boceto de ?gqdebug=1, ver _gqTurnsDebugRoulette) sigue
  // siendo puro Math.random() — cada click da un resultado distinto, que es
  // justamente lo que ese botón de prueba necesita.
  function _showGqGroupRoulette(order, starterUid, onDone, seed) {
    const overlay  = document.getElementById('gq-roulette-overlay');
    const content  = document.getElementById('gq-roulette-content');
    const wheel    = document.getElementById('gq-roulette-wheel');
    const wheelBg  = document.getElementById('gq-roulette-wheel-bg');
    const seatsEl  = document.getElementById('gq-roulette-seats');
    const resultEl = document.getElementById('gq-roulette-result');
    if (!overlay || !content || !wheel || !seatsEl || !order.length) { onDone(); return; }
    const layout = GQ_GROUP_ROULETTE_LAYOUT[order.length] || { image: 'images/ruleta1.png', total: order.length, seamAtTop: false };
    if (wheelBg) wheelBg.src = layout.image;
    const seatDeg = 360 / layout.total;
    const angleOffset = layout.seamAtTop ? seatDeg / 2 : 0;
    const identityFor = uid => uid === window._sbUserId
      ? { avatar: localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png',
          name: (window._sbProfile && window._sbProfile.name) || localStorage.getItem('playerName') || t('vs.syncYou') }
      : { avatar: ((window._lobbyMembers || []).find(m => m.id === uid) || {}).avatar || 'images/profilepic/ppdefault.png',
          name: _gqGroupResolveName(uid) };
    seatsEl.innerHTML = '';
    // Si layout.total es múltiplo exacto de la cantidad de jugadores, cada
    // uno se reparte total/N casilleros por igual (round-robin, i%N) — igual
    // que antes. Si NO divide exacto (7 con 8 cuñas, 9 con 10), cada jugador
    // recibe UN casillero fijo (order[i]) y los que sobran quedan en blanco
    // ("gira de nuevo") — la ruleta SÍ puede detenerse ahí de verdad antes
    // de la parada final (ver `landings` más abajo).
    const evenSplit = layout.total % order.length === 0;
    const matching = [];
    const blankIndices = [];
    for (let i = 0; i < layout.total; i++) {
      const ownerUid = evenSplit ? order[i % order.length] : (i < order.length ? order[i] : null);
      const seat = document.createElement('div');
      seat.className = 'gq-roulette-seat' + (ownerUid ? '' : ' gq-roulette-seat-blank');
      seat.style.transform = `rotate(${i * seatDeg + angleOffset}deg) translateY(-22cqmin)`;
      if (ownerUid) {
        const identity = identityFor(ownerUid);
        seat.innerHTML = `<img src="${identity.avatar}" alt="" draggable="false" oncontextmenu="return false">`
          + `<span class="gq-roulette-seat-name">${identity.name}</span>`;
        if (ownerUid === starterUid) matching.push(i);
      } else {
        seat.innerHTML = `<span class="gq-roulette-seat-again">↻</span>`;
        blankIndices.push(i);
      }
      seatsEl.appendChild(seat);
    }
    // "Gira de nuevo" ahora puede caer de verdad — a diferencia de antes
    // (donde el sorteo real solo elegía entre casilleros con jugador y la
    // ruleta solo PASABA de largo por los en blanco), el resultado final
    // (starterUid, ya decidido de forma determinística) puede pasar por 0,
    // 1 o 2 paradas intermedias en un casillero en blanco antes de la
    // parada real — la probabilidad de cada rebote extra se reduce a la
    // mitad, así que nunca se hace pesado. Sin casilleros en blanco (layout
    // parejo), landings queda con un solo elemento, igual que antes.
    const roll = (typeof seed === 'number') ? _gqMiniRand(seed) : Math.random;
    const landings = [];
    let bounceChance = 0.45;
    while (blankIndices.length && landings.length < 2 && roll() < bounceChance) {
      landings.push(blankIndices[Math.floor(roll() * blankIndices.length)]);
      bounceChance *= 0.4;
    }
    landings.push(matching[Math.floor(roll() * matching.length)]);
    if (resultEl) resultEl.textContent = '';
    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(0deg)';
    content.classList.remove('gq-roulette-in', 'gq-roulette-out');
    overlay.style.display = 'flex';
    void overlay.offsetWidth;
    overlay.classList.add('gq-roulette-visible');
    content.classList.add('gq-roulette-in');
    const POPIN_MS = 450, SPIN_MS = 3700, AGAIN_SPIN_MS = 2200, HOLD_MS = 900, AGAIN_HOLD_MS = 700, POPOUT_MS = 350;
    // Rotación absoluta ACUMULADA a través de todas las paradas — cada
    // parada intermedia sigue girando desde donde quedó la anterior (nunca
    // "salta" hacia atrás), y solo la ÚLTIMA usa el mismo largo/vueltas que
    // el giro único de antes.
    let rotation = 0;
    const spinToStep = (stepIdx) => {
      const index = landings[stepIdx];
      const isFinal = stepIdx === landings.length - 1;
      const spins = (isFinal ? 6 : 3) + Math.floor(roll() * 2);
      const jitterDeg = (roll() * 2 - 1) * (seatDeg * 0.35);
      const desiredMod = (((-index * seatDeg - angleOffset) % 360) + 360) % 360;
      const curMod = ((rotation % 360) + 360) % 360;
      const forwardDelta = ((desiredMod - curMod) % 360 + 360) % 360;
      rotation += forwardDelta + spins * 360 + jitterDeg;
      const spinMs = isFinal ? SPIN_MS : AGAIN_SPIN_MS;
      wheel.style.transition = `transform ${spinMs}ms cubic-bezier(0.45, 0, 0.15, 1)`;
      wheel.style.transform = `rotate(${rotation}deg)`;
      setTimeout(() => {
        if (!isFinal) {
          if (resultEl) {
            resultEl.textContent = t('gq.rouletteAgain');
            resultEl.classList.remove('gq-roulette-result-in');
            void resultEl.offsetWidth;
            resultEl.classList.add('gq-roulette-result-in');
          }
          setTimeout(() => {
            if (resultEl) resultEl.classList.remove('gq-roulette-result-in');
            spinToStep(stepIdx + 1);
          }, AGAIN_HOLD_MS);
          return;
        }
        if (resultEl) {
          resultEl.textContent = (starterUid === window._sbUserId)
            ? t('gq.rouletteYouStart')
            : t('gq.rouletteOppStarts', { name: _gqGroupResolveName(starterUid) });
          resultEl.classList.remove('gq-roulette-result-in');
          void resultEl.offsetWidth;
          resultEl.classList.add('gq-roulette-result-in');
        }
        setTimeout(() => {
          content.classList.add('gq-roulette-out');
          overlay.classList.remove('gq-roulette-visible');
          setTimeout(() => {
            overlay.style.display = 'none';
            content.classList.remove('gq-roulette-out');
            onDone();
          }, POPOUT_MS);
        }, HOLD_MS);
      }, spinMs);
    };
    setTimeout(() => {
      content.classList.remove('gq-roulette-in');
      void wheel.offsetWidth;
      spinToStep(0);
    }, POPIN_MS);
  }
  // Exposed so an EXTERNAL GroupSpectate viewer (spectate.js, no local
  // match state of its own) can mirror the exact same roulette a passive
  // "watch the whole room" spectator otherwise never saw at all — the real
  // players only broadcast 'pregame'/'round' AFTER their roulette already
  // finished (see _gqTurnsBeginRound), so this needed its own dedicated
  // 'troulette' broadcast (see _gqTurnsPickOrderAndShowRoulette) to fire
  // BEFORE it starts. No seed passed here (4th arg) — a spectator's copy of
  // the bounce cosmetics doesn't need to match the real players' pixel for
  // pixel, only the final starter does.
  window._gqShowGroupRouletteFor = _showGqGroupRoulette;

  // Orden de turno determinístico — todos los clientes ordenan la MISMA
  // lista (yo + window._lobbyMembers, excluyendo a quien ya esté marcado
  // desconectado) por id, sin necesidad de broadcast, igual que
  // pickDailyCountry() confía en que todos comparten la misma PRNG.
  function _gqTurnsComputeOrder() {
    // window.LB.getMembers() (a diferencia de window._lobbyMembers, que me
    // excluye a MÍ) trae a TODOS — incluido yo — ya ordenados por
    // joined_at (ver _fetchMembers en lobby.js, la misma consulta a la DB
    // que ve todo el mundo), así que el orden de turno sale IDÉNTICO en
    // todos los clientes sin necesidad de sortear nada acá.
    let ids = (window.LB.getMembers() || [])
      .map(m => m.id)
      .filter(id => !_gqGroupDisconnectedUids.has(id));
    // Desempate final: solo quienes empataron en la cima juegan la ronda
    // extra — el resto queda afuera del sorteo (espectadores de hecho, ver
    // _gqTurnsCheckTie/_gqTurnsCloseRound).
    if (_gqTurnsTiebreakUids) ids = ids.filter(id => _gqTurnsTiebreakUids.has(id));
    return ids;
  }
  // Al cerrar la última ronda configurada: ¿hay empate en la cima de rondas
  // ganadas entre dos o más jugadores TODAVÍA conectados? Determinístico —
  // _gqTurnsWinsByUid se incrementa igual en TODOS los clientes al recibir
  // el mismo 'tround' (ver _gqTurnsCloseRound), así que no hace falta
  // arbitraje del host ni broadcast para decidirlo. Devuelve un Set<uid> con
  // los empatados, o null si no hay empate (o solo queda 1 conectado).
  function _gqTurnsCheckTie() {
    const activeUids = (window.LB.getMembers() || [])
      .map(m => m.id)
      .filter(id => !_gqGroupDisconnectedUids.has(id));
    if (activeUids.length < 2) return null;
    const maxWins = Math.max(...activeUids.map(id => _gqTurnsWinsByUid[id] || 0));
    const tied = activeUids.filter(id => (_gqTurnsWinsByUid[id] || 0) === maxWins);
    return tied.length > 1 ? new Set(tied) : null;
  }
  // Generaliza seed%2===0 (1v1) a N jugadores — se suma la ronda para que no
  // arranque siempre el mismo jugador en cada país de la partida.
  function _gqTurnsPickStarterIdx(order) {
    return ((_gqGroupBaseSeed + _gqGroupRound) % order.length + order.length) % order.length;
  }

  function _gqPaintGroupTurnBanner() {
    const hintEl = document.getElementById('gq-hint');
    if (!hintEl || window._gqGroupTurnsMyTurn) return;
    hintEl.textContent = t('gq.waitingTurnFor', { name: _gqGroupResolveName(_gqTurnsActiveUid) });
  }

  // Aviso central gris "es tu turno" — MISMA entrada/salida que
  // _gqGroupAlert (tiempo real, "alguien ya adivinó"): pop con rebote +
  // fade, se muestra un rato y se retira sola. A diferencia de un simple
  // toggle, esto es un AVISO puntual (dispara solo en el hand-off, no se
  // queda pegado mientras dure mi turno — el reportado "se queda eterno").
  let _gqMyTurnAlertTimer = null;
  function _gqShowMyTurnAlert() {
    const el = document.getElementById('gq-myturn-notice');
    if (!el) return;
    el.style.display = 'block';
    void el.offsetWidth; // fuerza el reflow, igual que _gqGroupAlert
    requestAnimationFrame(() => el.classList.add('is-visible'));
    clearTimeout(_gqMyTurnAlertTimer);
    _gqMyTurnAlertTimer = setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => { el.style.display = 'none'; }, 300);
    }, 2200);
  }
  function _gqHideMyTurnAlert() {
    clearTimeout(_gqMyTurnAlertTimer);
    const el = document.getElementById('gq-myturn-notice');
    if (!el) return;
    // Forced early (the player answered before the 2.2s auto-hide above even
    // fired) used to set display:none in this SAME tick as removing
    // 'is-visible' — the fade-out transition never got a frame to play, so
    // the notice just vanished instantly instead of playing its exit
    // animation like it does on its own (the reported "si responde antes de
    // que termine la animación, simplemente desaparece"). Same 300ms the
    // auto-hide path already waits before hiding it for real.
    el.classList.remove('is-visible');
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }

  function _gqTurnsSetActiveTurn(uid) {
    _gqTurnsActiveUid = uid;
    const mine = uid === window._sbUserId;
    const wasMine = window._gqGroupTurnsMyTurn;
    window._gqGroupTurnsMyTurn = mine;
    const input = document.getElementById('gq-guess-input');
    const btn = document.getElementById('gq-guess-btn');
    const row = document.querySelector('.gq-guess-row');
    if (input) input.disabled = !mine;
    if (btn) btn.classList.toggle('gq-disabled', !mine);
    if (row) row.classList.toggle('gq-locked', !mine);
    document.querySelector('.gq-countdown-widget')?.style.removeProperty('display');
    _gqTurnsStartTimer();
    if (mine) {
      if (input) { input.focus(); input.placeholder = t('globequiz.inputPh'); }
      updateHint();
      if (!wasMine && typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
      if (!wasMine) _gqShowMyTurnAlert(); // solo en el hand-off, no en cada repintado
    } else {
      if (input) input.placeholder = t('globequiz.inputPh');
      _gqPaintGroupTurnBanner();
      _gqHideMyTurnAlert();
    }
    // Also refreshes the turn-order queue on every hand-off, not just when
    // wins/tiebreak state change.
    _gqTurnsBuildTurnOrder();
    // TODA la barra celeste de GlobeQuiz (.gq-edge-bar — NO #right-edge-bar,
    // que queda tapado por #globequiz-screen, ver el comentario en
    // style.css) pasa a verde fuerte SOLO mientras es MI propio turno, se
    // apaga en cuanto deja de serlo.
    document.querySelector('.gq-edge-bar')?.classList.toggle('gq-my-turn', mine);
  }
  // Leído por spectate.js (_renderGroupLeaderboardInner) para resaltar la
  // fila de quien tiene el turno — mismo patrón cross-módulo que
  // window._gqGroupIsDisconnected.
  window._gqGroupTurnsActiveUid = () => _gqTurnsActiveUid;

  // Cola de turnos a la izquierda del leaderboard (#gq-turn-order, ver
  // play/index.html) — quien tiene el turno ahora al final/abajo (foto más
  // grande + nombre), y quienes le siguen en _gqTurnsOrder apilados arriba,
  // achicándose con la distancia. Actualizada en CADA hand-off de turno
  // (_gqTurnsSetActiveTurn).
  const GQ_TURN_ORDER_MAX_SZ = 9;   // cqmin — turno actual
  const GQ_TURN_ORDER_MIN_SZ = 3;   // cqmin — piso para que el más lejano no desaparezca
  const GQ_TURN_ORDER_SHRINK = 0.8; // factor de tamaño por cada paso de distancia
  const GQ_TURN_ORDER_OPACITY_STEP = 0.22; // cuánto se apaga cada paso más lejos del turno actual
  const GQ_TURN_ORDER_MIN_OPACITY  = 0.28; // piso — nunca del todo invisible
  // uid -> <div class="gq-turn-order-item"> ya creado — persistidos entre
  // llamadas (a diferencia de un innerHTML='' + reconstruir del todo en cada
  // hand-off) para poder animar el FLIP de abajo: un elemento que sigue en
  // la cola debe DESLIZARSE a su nuevo lugar, no destruirse y reaparecer
  // instantáneo en el nuevo.
  let _gqTurnOrderElements = {};
  function _gqTurnsClearTurnOrder() {
    const wrap = document.getElementById('gq-turn-order');
    if (wrap) { wrap.classList.remove('active'); wrap.innerHTML = ''; }
    _gqTurnOrderElements = {};
  }
  function _gqTurnsBuildTurnOrder() {
    const wrap = document.getElementById('gq-turn-order');
    if (!wrap) return;
    if (!window._gqGroupTurnsActive || !_gqTurnsOrder.length || !_gqTurnsActiveUid) {
      _gqTurnsClearTurnOrder();
      return;
    }
    const myId = window._sbUserId;
    const infoByUid = new Map((window.LB.getMembers() || []).map(m => [m.id, m]));
    const startIdx = _gqTurnsOrder.indexOf(_gqTurnsActiveUid);
    if (startIdx === -1) { _gqTurnsClearTurnOrder(); return; }
    // Orden de "quién sigue" desde el turno actual, dando toda una vuelta a
    // _gqTurnsOrder (mismo hot-potato circular que _gqTurnsAdvance) —
    // salteando desconectados, igual que el turno real nunca se les pasa a
    // ellos tampoco.
    const queue = [];
    for (let step = 0; step < _gqTurnsOrder.length; step++) {
      const uid = _gqTurnsOrder[(startIdx + step) % _gqTurnsOrder.length];
      if (_gqGroupDisconnectedUids.has(uid)) continue;
      queue.push(uid);
    }
    if (!queue.length) { _gqTurnsClearTurnOrder(); return; }
    wrap.classList.add('active');
    // FLIP (First-Last-Invert-Play), mismo patrón que _gqTurnsPositionLb:
    // medir dónde está CADA elemento persistido ANTES de tocar nada.
    const prevTop = {};
    Object.keys(_gqTurnOrderElements).forEach(uid => { prevTop[uid] = _gqTurnOrderElements[uid].offsetTop; });
    // Hijos en orden VISUAL de arriba hacia abajo (columna normal, sin
    // column-reverse) — el más lejano primero, el turno actual (queue[0])
    // último, así queda pegado abajo por el propio flujo del DOM.
    const nextElements = {};
    for (let i = queue.length - 1; i >= 0; i--) {
      const uid = queue[i];
      const isCurrent = i === 0;
      const isMe = uid === myId;
      const m = infoByUid.get(uid);
      const name = isMe ? ((window._sbProfile && window._sbProfile.name) || localStorage.getItem('playerName') || (m && m.name) || 'Tú')
                         : ((m && m.name) || '?');
      const avatar = isMe ? (localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png')
                           : ((m && m.avatar) || 'images/profilepic/ppdefault.png');
      const sz = Math.max(GQ_TURN_ORDER_MIN_SZ, GQ_TURN_ORDER_MAX_SZ * Math.pow(GQ_TURN_ORDER_SHRINK, i));
      const op = Math.max(GQ_TURN_ORDER_MIN_OPACITY, 1 - i * GQ_TURN_ORDER_OPACITY_STEP);
      // Reusa el <div> del uid si ya existía (lo que hace posible el FLIP de
      // abajo) — uno nuevo solo para un uid recién entrado a la cola visible.
      let item = _gqTurnOrderElements[uid];
      if (!item) {
        item = document.createElement('div');
        item.className = 'gq-turn-order-item';
      }
      item.classList.toggle('is-current', isCurrent);
      item.classList.toggle('is-tiebreak-out', !!(window._gqTurnsTiebreakLosers && window._gqTurnsTiebreakLosers.has(uid)));
      item.style.setProperty('--sz', sz + 'cqmin');
      item.style.setProperty('--op', String(op));
      // "Turno de:" label — only above the CURRENT (bottom-most) photo, see
      // .gq-turn-order-item:not(.is-current) .gq-turn-order-label in
      // style.css.
      item.innerHTML = (isCurrent ? `<span class="gq-turn-order-label">${t('gq.turnOf')}</span>` : '')
        + `<div class="gq-turn-order-avatar-wrap"><img class="gq-turn-order-avatar" src="${avatar}"></div>`
        + `<span class="gq-turn-order-name">${name}</span>`;
      // appendChild on an EXISTING node moves it (doesn't clone/duplicate) —
      // this is what re-orders the whole column on every hand-off.
      wrap.appendChild(item);
      nextElements[uid] = item;
    }
    // Whoever dropped out of the visible queue (disconnected, or the room
    // shrank) never got re-appended above — remove their leftover node.
    Object.keys(_gqTurnOrderElements).forEach(uid => {
      if (!nextElements[uid]) _gqTurnOrderElements[uid].remove();
    });
    _gqTurnOrderElements = nextElements;
    // Invert + play: en el frame siguiente (con el nuevo orden/tamaño/
    // opacidad ya aplicados y el layout recalculado), a cada elemento que
    // YA EXISTÍA se le pone un translateY que lo deja exactamente donde
    // estaba antes (sin transición, invisible), y recién ahí se anima ese
    // translateY de vuelta a 0 — se ve deslizar de la posición vieja a la
    // nueva en vez de saltar. Un uid nuevo (no estaba en prevTop) no tiene
    // "posición vieja" de la cual venir, aparece directamente en su lugar.
    requestAnimationFrame(() => {
      Object.keys(nextElements).forEach(uid => {
        if (!(uid in prevTop)) return;
        const el = nextElements[uid];
        const delta = prevTop[uid] - el.offsetTop;
        if (Math.abs(delta) < 0.5) return;
        el.style.transition = 'none';
        el.style.transform = `translateY(${delta}px)`;
        void el.offsetWidth;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.5s cubic-bezier(0.22,1,0.36,1)';
          el.style.transform = '';
        });
      });
    });
  }

  // NO reutiliza _gqPaintTurnTimer (1v1) — ese lee _gqTurnSecondsLeft
  // (singular, variable DISTINTA del 1v1), que nunca se mueve durante un
  // match grupal — pintaba siempre su valor inicial congelado en 20 (el
  // reportado "el contador se queda atascado en 20 y no baja").
  function _gqPaintGroupTurnsTimer() {
    const el = document.getElementById('gq-timer-number');
    if (el) el.textContent = String(Math.max(0, _gqTurnsSecondsLeft));
  }
  function _gqTurnsTick() {
    const elapsedSec = Math.floor((Date.now() - _gqTurnsStartedAt) / 1000);
    const secondsLeft = Math.max(0, _gqTurnsTimeSec - elapsedSec);
    if (secondsLeft === _gqTurnsSecondsLeft) return;
    _gqTurnsSecondsLeft = secondsLeft;
    _gqPaintGroupTurnsTimer();
    pulseCountdown();
    if (secondsLeft > 0 && secondsLeft <= 5) {
      _gqSetCountdownIconRed(true);
      if (typeof sfxTickdown !== 'undefined' && typeof sfxPlay === 'function') { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
    }
    if (secondsLeft <= 0) {
      _gqTurnsStopTimer();
      if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
      // Solo quien tiene el turno declara su propio timeout — el reloj del
      // resto es puramente visual (mismo criterio que el 1v1).
      if (window._gqGroupTurnsMyTurn) _gqTurnsHandleMyTimeout();
    }
  }
  function _gqTurnsStartTimer() {
    _gqTurnsStopTimer();
    _gqTurnsStartedAt = Date.now();
    _gqTurnsSecondsLeft = _gqTurnsTimeSec + 1;
    _gqSetCountdownIconRed(false);
    _gqTurnsTick();
    _gqTurnsTimerInterval = setInterval(_gqTurnsTick, 250);
  }
  function _gqTurnsStopTimer() {
    if (_gqTurnsTimerInterval) clearInterval(_gqTurnsTimerInterval);
    _gqTurnsTimerInterval = null;
  }
  function _gqTurnsHandleMyTimeout() {
    if (!window._gqGroupTurnsActive || !window._gqGroupTurnsMyTurn) return;
    window.LB.sendGq({ t: 'tguess', uid: window._sbUserId, round: _gqGroupRound, timeout: true });
  }

  // HOST-only: elige el próximo uid CONECTADO en _gqTurnsOrder (hot-potato —
  // si le da toda la vuelta sin encontrar uno disponible, window.LB's
  // triggerAlone ya se encarga de "me quedé solo").
  function _gqTurnsAdvance() {
    if (!_gqTurnsOrder.length) return;
    for (let step = 1; step <= _gqTurnsOrder.length; step++) {
      const idx = (_gqTurnsPointer + step) % _gqTurnsOrder.length;
      const uid = _gqTurnsOrder[idx];
      if (_gqGroupDisconnectedUids.has(uid)) continue;
      _gqTurnsPointer = idx;
      // startedAt: GroupSpectate (external, generic viewer) has no local
      // per-turn countdown of its own to start from otherwise — see
      // globequizSpectatorStartTurnTimer in spectate.js's 'tturn' handling.
      window.LB.sendGq({ t: 'tturn', uid, round: _gqGroupRound, startedAt: Date.now(), turnTime: _gqTurnsTimeSec });
      return;
    }
  }
  // Announces the ROUND-OPENING turn (the roulette's own winner, before any
  // hand-off has happened) to GroupSpectate — unlike every later hand-off,
  // this one was never covered by a 'tturn' broadcast (only _gqTurnsAdvance
  // sent those); a spectator who missed the earlier 'troulette' (its own
  // starterUid is only used as a stand-in, consumed by the next 'round') had
  // nothing to fall back on and stayed on a blank hint until the FIRST real
  // guess/timeout finally sent a 'tturn' (the reported "el primer mensaje...
  // no aparece hasta que responde"). Host-only, same convention as every
  // other 'tturn'/'tround' broadcast.
  function _gqTurnsBroadcastFirstTurn(uid) {
    if (!window.LB || typeof window.LB.sendGq !== 'function' || !window.LB.isHost()) return;
    window.LB.sendGq({ t: 'tturn', uid, round: _gqGroupRound, startedAt: Date.now(), turnTime: _gqTurnsTimeSec });
  }
  // Llamada desde lobby.js (onMembers, detección en tiempo real de member-
  // drop) — si quien se desconectó tenía el turno activo, lo pasa AL
  // INSTANTE en vez de esperar a que se le agote el reloj.
  window._gqGroupTurnsHandlePlayerGone = function (uid) {
    if (!window._gqGroupTurnsActive) return;
    // Ronda extra de desempate: por diseño son SOLO 2 jugadores (ver
    // _gqTurnsCheckTie/_gqTurnsIsTiebreak) — si uno de los dos abandona a
    // mitad de esa ronda, _gqTurnsAdvance (más abajo) recorre TODO
    // _gqTurnsOrder salteando desconectados y termina volviendo al ÚNICO
    // conectado una y otra vez, dándole turno tras turno sin que la partida
    // termine nunca (el reportado "sigue eternamente esperando una
    // respuesta" — literalmente nadie declara ganador, solo se le sigue
    // pasando el turno al mismo jugador). Con un único participante
    // conectado del duelo, esa ronda ya no puede jugarse — cada cliente
    // (host o no, a diferencia de _gqTurnsAdvance que es host-only) decide
    // por sí mismo si ES ese sobreviviente y termina la partida ahí mismo,
    // igual que lo haría al acertar la ronda normalmente.
    if (_gqTurnsIsTiebreak && Array.isArray(_gqTurnsOrder) && _gqTurnsOrder.length) {
      const stillIn = _gqTurnsOrder.filter(id => !_gqGroupDisconnectedUids.has(id) && id !== uid);
      if (stillIn.length === 1 && stillIn[0] === window._sbUserId) {
        _gqTurnsStopTimer();
        // NOT a direct window._lobbyHandleGameEnd() call — that only marks
        // MY OWN client as finished. Every other client in the room
        // (already-decided players just watching the tiebreak, plus any
        // external GroupSpectate viewer) only learns a round closed via the
        // 'tround' broadcast (see the 'tguess' correct-answer case right
        // above, normally host-only) — calling _lobbyHandleGameEnd() alone
        // left them with nothing to react to, so _checkAllFinished()
        // (lobby.js) kept waiting on players who were never going to report
        // themselves finished, and "GANASTE" only ever appeared once the
        // unrelated ~12s safety-timeout fallback fired — which, timed
        // against a still-running turn clock, looked exactly like "esperando
        // a que termine el tiempo" (reported). Broadcasting this exactly
        // like a real correct guess makes EVERY client (this one included,
        // via the SAME 'tround' handler) run the normal
        // _gqTurnsCloseRound → _lobbyHandleGameEnd path together,
        // immediately.
        if (window.LB && typeof window.LB.sendGq === 'function') {
          window.LB.sendGq({
            t: 'tround', round: _gqGroupRound, winnerUid: window._sbUserId,
            countryName: dailyCountry?.name, iso2: dailyCountry?.iso2,
            // Flags this 'tround' as ending by abandonment, not a real
            // guess — see soloWin in _gqTurnsCloseRound: nobody's clock
            // "ran out", so the TIMES UP flash is skipped entirely, for
            // every client (winner included), straight to the final result.
            soloWin: true,
          });
        }
        return;
      }
    }
    if (!window.LB.isHost() || uid !== _gqTurnsActiveUid) return;
    _gqTurnsAdvance();
  };

  function _gqTurnsShowTyping(text) {
    if (window._gqGroupTurnsMyTurn) return;
    const input = document.getElementById('gq-guess-input');
    if (!input) return;
    input.placeholder = (text || '').trim() || t('globequiz.inputPh');
  }

  // Protocolo por turnos sobre el mismo canal window.LB.sendGq/onGq —
  // namespacing propio ('tturn'/'tguess'/'tround'/'ttyping') para no pisar
  // el de tiempo real ('solved'/'rank'/'countdown'/'allsolved'/'ranout'/
  // 'typing'), aunque nunca conviven (cada variante registra su propio
  // handler en onGq al arrancar el match).
  function _gqTurnsHandleGqEvent(payload) {
    if (!window._gqGroupTurnsActive || !payload) return;
    // GroupSpectate (generic external viewer) resync — checked BEFORE the
    // round-match guard below, since the whole point is a spectator who
    // doesn't necessarily know the CURRENT round asking for it. Same idea
    // real-time GloboReto already has (window._gqGroupSnapshotForResend/
    // 'staterequest' in lobby.js) — turns mode has no per-uid POV to target
    // though, so this is a broadcast anyone can answer, HOST-only (single
    // source of truth, same convention as 'tround'/'tguess' arbitration)
    // to avoid N duplicate replies.
    if (payload.t === 'treq') {
      if (window.LB.isHost()) {
        window.LB.sendGq({
          t: 'tstate', round: _gqGroupRound, totalRounds: _gqGroupRounds,
          activeUid: _gqTurnsActiveUid, startedAt: _gqTurnsStartedAt,
          isTiebreak: _gqTurnsIsTiebreak,
          guesses: guesses.slice(),
          typingText: _gqTurnsLastTypingText,
          turnTime: _gqTurnsTimeSec,
        });
      }
      return;
    }
    if (payload.round !== _gqGroupRound) return;
    if (payload.t === 'tturn') {
      const idx = _gqTurnsOrder.indexOf(payload.uid);
      if (idx !== -1) _gqTurnsPointer = idx;
      _gqTurnsLastTypingText = '';
      _gqTurnsSetActiveTurn(payload.uid);
      return;
    }
    if (payload.t === 'ttyping') { _gqTurnsLastTypingText = payload.text || ''; _gqTurnsShowTyping(payload.text); return; }
    if (payload.t === 'tguess') {
      // Same as globequizReceiveOpponentTurnGuess in the 1v1 variant: whoever's
      // turn it was just answered (or timed out) — auto-rotate stops for
      // EVERY client in the room, not just the one who typed (that one already
      // stopped it locally in _gqTurnsSubmitGuess). Missing this left every
      // other member's own globe spinning forever through the whole match
      // (the reported "su globo sigue rotando" once the turn moves on).
      stopAutoRotate();
      // Refleja un intento ajeno (correcto o no) en mi propia lista/globo —
      // igual que globequizReceiveOpponentTurnGuess hace en el 1v1 (mi propio
      // intento ya se pintó localmente en _gqTurnsSubmitGuess). Un timeout
      // (sin guess real) no cuenta como "confirmación" — nada que reflejar
      // ni sonar.
      if (payload.uid !== window._sbUserId && !payload.timeout) {
        // Mismo sfxCheck que ya suena en MI PROPIO cliente al confirmar (ver
        // playCheckSfx en el wiring del botón/Enter) — sin esto, el resto de
        // la sala no tenía ninguna señal de audio cuando el jugador activo
        // confirmaba su respuesta (el reportado "tiene que sonar el check
        // cuando alguien haga su confirmación").
        if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
        if (payload.correct === false && payload.name) {
          guesses.push({ name: payload.name, km: payload.km, dir: payload.dir, color: payload.color });
          drawTexture();
          renderGuessList();
          updateHint();
          const country = countryByName.get(normalize(payload.name));
          if (country) focusOnCountry(country);
        }
      }
      if (window.LB.isHost()) {
        if (payload.correct === true) {
          // countryName/iso2: un espectador externo genérico (GroupSpectate)
          // nunca jugó esta ronda, así que no tiene forma propia de conocer
          // el país correcto para su propia tabla de resultados — a
          // diferencia de un jugador real, cuyo dailyCountry ya lo tiene
          // desde que arrancó la ronda (mismo seed compartido).
          window.LB.sendGq({ t: 'tround', round: _gqGroupRound, winnerUid: payload.uid, countryName: dailyCountry?.name, iso2: dailyCountry?.iso2 });
        } else {
          _gqTurnsAdvance();
        }
      }
      return;
    }
    if (payload.t === 'tround') {
      // Reacted to the instant it's RECEIVED — no shared "startAt" to wait
      // for. This used to schedule everyone (winner included) against a
      // future instant stamped with the HOST's own Date.now(), specifically
      // so the winner's own shorter round-trip back to itself didn't start
      // the flash/table/roulette/3-2-1-GO before it reached everyone else
      // (reported: "el ganador de la ronda inicia antes que el resto"). But
      // comparing that timestamp against each OTHER client's own raw
      // Date.now() ignored any clock skew between devices — which can be
      // several whole seconds, unrelated to network latency — so a player
      // whose system clock ran behind the host's still waited several extra
      // REAL seconds after 'tround' arrived before actually closing the
      // round, and everything chained after it (round-result table,
      // roulette, next round) inherited that same delay (reported: "recibe
      // el times up con la tabla 4 segundos tarde... la ruleta la tiene
      // super tarde"). Simpler and more robust than correcting for clock
      // skew (which still depends on a ping/pong estimate converging in
      // time): treat 'tround' as a plain signal, exactly like the live
      // typing preview already does — whatever asymmetry is left is real
      // network latency alone (same order of magnitude the typing preview
      // already tolerates fine), not multi-second clock drift.
      if (window._gqGroupTurnsActive && _gqGroupRound === payload.round) _gqTurnsCloseRound(payload.winnerUid, !!payload.soloWin);
      return;
    }
  }

  // Ronda resuelta (alguien acertó) — el leaderboard "por turnos" ordena y
  // decide el ganador final por CANTIDAD DE RONDAS GANADAS, no por el
  // puntaje de cercanía/intentos de tiempo real (_gqGroupRankScore/
  // _gqGroupFailScore quedan sin usar acá a propósito).
  // See its call site's own comment — fired once, right as the match's
  // final game-over/correct-country reveal begins. Re-enabled by
  // _gqTurnsResetExitButton on the next match (rematch/new room), never here.
  function _gqDisableExitOnMatchEnd() {
    // #gq-power-btn is a <div> (see play/index.html), not a real <button> —
    // there's no native `.disabled` to set. The class alone (see its
    // matching CSS rule) sets pointer-events:none, which fully blocks the
    // click listener in menu-launchers.js from ever firing.
    document.getElementById('gq-power-btn')?.classList.add('gq-disabled');
    const popup = document.getElementById('gq-quit-popup');
    if (popup) popup.style.display = 'none';
  }
  function _gqTurnsResetExitButton() {
    document.getElementById('gq-power-btn')?.classList.remove('gq-disabled');
  }
  function _gqTurnsCloseRound(winnerUid, soloWin) {
    _gqTurnsStopTimer();
    _gqSetCountdownIconRed(false);
    document.querySelector('.gq-countdown-widget')?.style.setProperty('display', 'none');
    stopTimer();
    if (typeof playMusic === 'function') playMusic(null);
    const input = document.getElementById('gq-guess-input'), btn = document.getElementById('gq-guess-btn');
    if (input) input.disabled = true;
    if (btn) btn.classList.add('gq-disabled');
    const amWinner = winnerUid === window._sbUserId;
    if (winnerUid) _gqTurnsWinsByUid[winnerUid] = (_gqTurnsWinsByUid[winnerUid] || 0) + 1;
    const myWins = _gqTurnsWinsByUid[window._sbUserId] || 0;
    // _gqGroupShowRoundResultTable (reutilizada tal cual del modo tiempo
    // real, ver más abajo) arma SU PROPIA fila leyendo _gqGroupTotal
    // directo, no window._lobbyMembers — sin esto, mi puntaje ahí quedaba
    // siempre en 0 aunque el resto (que sí sale de window._lobbyMembers,
    // alimentado por reportScore/sendScore de abajo) se actualizara bien
    // (el reportado "al resto le salió 1-0-0-0 pero a mí 0-0-0-0").
    _gqGroupTotal = myWins;
    // Mismo canal que _gqGroupApplyRoundScore usa para el puntaje de tiempo
    // real — acá simplemente viaja la cantidad de rondas ganadas, así que
    // _gqGroupShowRoundResultTable muestra ese número sin necesitar ningún
    // cambio propio.
    window.LB.reportScore(myWins);
    window.LB.sendScore(myWins);
    _gqTurnsPositionLb();
    const isLastRound = _gqGroupRound >= _gqGroupRounds;
    // Desempate final: si al cerrar la última ronda configurada dos o más
    // siguen empatados en la cima, se juega UNA ronda extra solo entre
    // ellos (_gqTurnsIsTiebreak ya está seteado por esa rama abajo, así que
    // esta ronda extra NUNCA vuelve a chequear empate — su único ganador es
    // el ganador final de la partida, ver el comentario en la declaración
    // de _gqTurnsIsTiebreak más arriba).
    const tiedUids = (isLastRound && !_gqTurnsIsTiebreak) ? _gqTurnsCheckTie() : null;
    // The match is DEFINITELY ending right here, with no further tiebreak
    // (isLastRound covers the tiebreak round too, since _gqGroupRound keeps
    // climbing past the originally configured _gqGroupRounds — see
    // _gqTurnsBeginRound) — right as the game-over/correct-country reveal
    // begins (soloWin's game-over overlay, the winner's own already-shown
    // showWin(), or the loser's times-up flash below), disable the power/
    // quit button so it can't be used to abandon a match that's effectively
    // already decided, and auto-close the "are you sure?" popup if it
    // happened to be open at that exact moment (confirming it now would
    // needlessly abandon-report a match that's over, and leaving it open
    // over an inert button does nothing useful either).
    if (isLastRound && !tiedUids) _gqDisableExitOnMatchEnd();
    const afterFlash = () => {
      if (!window._gqGroupTurnsActive) return;
      if (tiedUids) {
        _gqTurnsIsTiebreak = true;
        _gqTurnsTiebreakUids = tiedUids;
        // Everyone who did NOT tie for first — they take no further part in
        // the match from here on (the extra round is only between
        // _gqTurnsTiebreakUids), grayed out on their live card for every
        // viewer (other players, themselves, and any spectator — see
        // _gqTurnsPositionLb below and _renderGroupLeaderboardInner in
        // spectate.js) per request. Clarified from an earlier
        // misunderstanding — this is about whoever was ALREADY eliminated
        // BEFORE the tiebreak, not whoever loses the tiebreak itself.
        window._gqTurnsTiebreakLosers = new Set(
          (window.LB.getMembers() || []).map(m => m.id).filter(id => !tiedUids.has(id))
        );
        _gqTurnsPositionLb(false);
        _gqGroupShowRoundResultTable(() => {
          if (!window._gqGroupTurnsActive) return;
          _gqTurnsBeginRound(_gqGroupRound + 1);
        });
        return;
      }
      if (isLastRound) { window._lobbyHandleGameEnd(myWins); return; }
      _gqGroupShowRoundResultTable(() => {
        if (!window._gqGroupTurnsActive) return;
        _gqTurnsBeginRound(_gqGroupRound + 1);
      });
    };
    // A diferencia de tiempo real (donde el flash "se acabó el tiempo"
    // aplica a TODOS por igual, ganaron o no, porque ahí "ganar" es solo
    // llegar primero dentro de la misma ventana compartida), acá "ganar" es
    // literalmente acertar — mostrarle el flash de "se acabó tu tiempo" a
    // quien justo acertó es una señal contradictoria (el reportado "al que
    // gana no debe salirle el Times Up").
    // Aun así, no aparece de inmediato — mismo GQ_VS_ANIM_MS que el 1v1
    // espera después de showWin() (llamado en _gqTurnsSubmitGuess al
    // acertar) para que el confeti/celda verde alcancen a verse antes de
    // taparlos con la tabla de resultados (el reportado "no tiene que
    // colocarse inmediatamente").
    // soloWin: the tiebreak ended because everyone else abandoned it (see
    // window._gqGroupTurnsHandlePlayerGone) — nobody "ran out of time"
    // here, there was simply nobody left to keep playing against. Per
    // request, this plays the GAME OVER overlay (same one every 1v1 loser
    // already gets, see globequizSpectatorShowLoss) for EVERYONE — winner
    // included, since it's a shared broadcast event, not "TIMES UP" (which
    // implied a clock running out that never actually happened).
    if (soloWin) {
      // solved/drawTexture: see the matching comment below — without these,
      // only the winner's own client (which already set them locally at
      // guess time, see _gqTurnsSubmitGuess) ever painted the country green;
      // everyone else's globe just got re-centered on it (focusOnCountry)
      // but stayed whatever heat color it had from their own last guess.
      if (dailyCountry) { solved = true; drawTexture(); focusOnCountry(dailyCountry); }
      _gqGroupShowGameOver(afterFlash);
      return;
    }
    if (amWinner) { setTimeout(() => { if (window._gqGroupTurnsActive) afterFlash(); }, GQ_VS_ANIM_MS); return; }
    // Para quien NO ganó: pinta el país correcto de verde y centra el globo
    // ahí antes del flash — el ganador ya hizo ambas cosas (drawTexture()/
    // focusOnCountry corren dentro de su propio _gqTurnsSubmitGuess al
    // acertar), pero el resto nunca corría drawTexture() con `solved` en
    // true, así que su globo seguía mostrando el país sin pintar (el
    // reportado "el país correcto solo se pinta de verde al que acertó pero
    // no al resto").
    if (dailyCountry) { solved = true; drawTexture(); focusOnCountry(dailyCountry); }
    if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
    _gqGroupShowTimesUp(afterFlash);
  }

  // Calcula el orden de esta ronda (solo jugadores CONECTADOS ahora mismo —
  // recalculado siempre, así que si alguien se desconectó entre rondas ya
  // no forma parte del sorteo) y muestra la ruleta. `cb()` se llama recién
  // cuando el giro terminó — el ganador queda en _gqTurnsOrder[_gqTurnsPointer].
  // Reutilizada tanto para la ronda 1 (ver startGqCountdown más abajo) como
  // para rondas 2+ (_gqTurnsBeginRound) — en ambos casos la ruleta gira
  // ANTES del 3-2-1-GO, igual que el 1v1 (_gqMaybeStart en vs.js: ruleta →
  // recién ahí el 3-2-1), no después.
  function _gqTurnsPickOrderAndShowRoulette(cb) {
    const order = _gqTurnsComputeOrder();
    if (!order.length) return; // window.LB.triggerAlone() ya cubre "me quedé solo"
    _gqTurnsOrder = order;
    _gqTurnsPointer = _gqTurnsPickStarterIdx(order);
    const starterUid = order[_gqTurnsPointer];
    // Seed propio (distinto del que usa _gqTurnsPickStarterIdx) para que el
    // sorteo cosmético de la ruleta (rebotes/vueltas/jitter, ver
    // _showGqGroupRoulette) salga IDÉNTICO en todos los clientes — antes
    // tiraba de Math.random() en cada uno por separado, así que la duración
    // de la animación (sobre todo la cantidad de "gira de nuevo") variaba
    // por cliente y el 3-2-1-GO terminaba arrancando en momentos distintos.
    const rouletteSeed = ((_gqGroupBaseSeed + _gqGroupRound * 104729 + 17) >>> 0);
    // Único aviso de "la ruleta está girando AHORA" que le llega a un
    // espectador externo genérico (GroupSpectate) — 'pregame'/'round' recién
    // se mandan DESPUÉS de que la ruleta ya terminó en la pantalla real (ver
    // más abajo), así que sin esto un espectador nunca veía ninguna ruleta.
    // TODOS los clientes reales mandan este mismo broadcast al arrancar la
    // ronda (nadie es "el único emisor") — spectate.js lo deduplica por
    // número de ronda.
    if (window.LB && typeof window.LB.sendGq === 'function') {
      window.LB.sendGq({
        t: 'troulette',
        round: _gqGroupRound,
        starterUid,
        tiebreakUids: _gqTurnsTiebreakUids ? Array.from(_gqTurnsTiebreakUids) : null,
      });
    }
    _showGqGroupRoulette(order, starterUid, () => {
      if (!window._gqGroupTurnsActive) return; // se abandonó/cerró a mitad del giro
      // Pre-pinta el segundero ANTES del 3-2-1-GO — el widget queda visible
      // durante ese countdown y, sin esto, mostraba el placeholder "0:00"
      // del HTML hasta recién arrancar el turno de verdad (el reportado
      // "en el 3-2-1-GO sale 0:00, ahí deben salir los segundos que
      // corresponden").
      const timerEl = document.getElementById('gq-timer-number');
      if (timerEl) timerEl.textContent = String(_gqTurnsTimeSec);
      cb();
    }, rouletteSeed);
  }

  // Arranca (o avanza a) la ronda `round` — misma estructura que
  // _gqGroupBeginRound (tiempo real): ronda 1 pasa por initGlobeQuiz()
  // (bootstrap completo del globo 3D), rondas 2+ repiten a mano el mismo
  // beat de pregame/timer sin volver a llamar initGlobeQuiz() (evita el
  // flicker negro, ver el comentario largo en _gqGroupBeginRound). La
  // ruleta (con quien siga conectado en este momento) es lo PRIMERO que se
  // ve al cerrar la tabla de resultados de la ronda anterior — recién
  // después arranca el beat de cámara/pregame/3-2-1-GO.
  function _gqTurnsBeginRound(round) {
    _gqGroupRound          = round;
    _gqGroupRoundScored    = false;
    _gqTurnsMyAttempts     = 0;
    _gqTurnsMyBestKm       = Infinity;
    _gqTurnsMyBestAtMs     = 0;
    _gqTurnsActiveUid      = null;
    _gqTurnsOrder          = [];
    _gqTurnsLastTypingText = '';
    guesses = []; solved = false; animatedGuessNames = new Set(); dailyCountry = null;
    _gqGroupClearSolvedIcons();
    _gqGroupUpdateRoundBadge();
    if (round === 1) {
      window.globequizSetSeed(_gqGroupBaseSeed);
      window.initGlobeQuiz();
      return;
    }
    const input = document.getElementById('gq-guess-input'), btn = document.getElementById('gq-guess-btn');
    if (input) { input.disabled = true; input.value = ''; }
    if (btn) btn.classList.add('gq-disabled');
    // Corta postgameloop.mp3 (todavía sonando desde la tabla de resultados)
    // ANTES de mostrar la ruleta, no después — si no, seguía de fondo
    // durante todo el giro (el reportado "no corta la música").
    if (typeof playMusic === 'function') playMusic(null);
    _gqTurnsPickOrderAndShowRoulette(() => {
      if (sphere) { sphere.rotation.x = BASE_ROT_X; sphere.rotation.y = BASE_ROT_Y; }
      zoomZ = BASE_Z;
      if (camera) camera.position.z = zoomZ;
      if (typeof updateSpaceVignette === 'function') updateSpaceVignette();
      startAutoRotate();
      pickDailyCountry();
      drawTexture();
      renderGuessList();
      updateHint();
      const msg = document.getElementById('gq-win-msg');
      if (msg) msg.style.display = 'none';
      const guessRow = document.querySelector('.gq-guess-row');
      const hintEl2  = document.getElementById('gq-hint');
      const canvasEl = document.getElementById('gq-canvas');
      if (guessRow) guessRow.style.display = 'none';
      if (hintEl2) hintEl2.style.display = 'none';
      if (canvasEl) canvasEl.style.pointerEvents = 'none';
      if (typeof window._specReportPregame === 'function') window._specReportPregame({ mode: 'globequiz_turns', startedAt: Date.now(), round: _gqGroupRound, totalRounds: _gqGroupRounds, isTiebreak: _gqTurnsIsTiebreak });
      runGqPregameCountdown(() => {
        _gqGroupHideRoundBadge(() => {});
        if (guessRow) guessRow.style.display = '';
        if (hintEl2) hintEl2.style.display = '';
        if (canvasEl) canvasEl.style.pointerEvents = '';
        if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
        startTimer();
        if (typeof window._specReportRound === 'function') window._specReportRound({ mode: 'globequiz_turns', startedAt: gqTimerStart, round: _gqGroupRound, totalRounds: _gqGroupRounds, isTiebreak: _gqTurnsIsTiebreak });
        _gqTurnsSetActiveTurn(_gqTurnsOrder[_gqTurnsPointer]);
        _gqTurnsBroadcastFirstTurn(_gqTurnsOrder[_gqTurnsPointer]);
      });
    });
  }

  function _gqGroupTurnsTeardown() {
    if (!window._gqGroupTurnsActive) return;
    window._gqGroupTurnsActive = false;
    window._gqGroupTurnsMyTurn = false;
    _gqTurnsStopTimer();
    if (window.LB && typeof window.LB.onGq === 'function') window.LB.onGq(null);
    _gqTurnsOrder = [];
    _gqTurnsActiveUid = null;
    _gqTurnsIsTiebreak = false;
    _gqTurnsTiebreakUids = null;
    window._gqTurnsTiebreakLosers = null;
    _gqHideMyTurnAlert();
    document.getElementById('gq-round-result-screen')?.style.setProperty('display', 'none');
    const _gqTurnsBar = document.getElementById('gq-friends-bar');
    if (_gqTurnsBar) {
      _gqTurnsBar.classList.remove('vs-active', 'gq-turns-mode');
      // Removing the classes alone left every room member's OWN row
      // (id="gq-lb-lob<uid>") sitting in the DOM — whatever got built/shown
      // next in this SAME bar (solo, a new group room, or a 1v1 duel) kept
      // rendering them alongside its own cards (the reported "cards que no
      // deberían salir" right after a group match).
      _gqTurnsBar.querySelectorAll('.lb-entry[id^="gq-lb-lob"]').forEach(el => el.remove());
    }
    document.getElementById('gq-group-round-badge')?.style.setProperty('display', 'none');
    document.getElementById('gq-roulette-overlay')?.style.setProperty('display', 'none');
    // Restaura el fondo por defecto — _showGqGroupRoulette lo pisa según la
    // cantidad de jugadores, pero el 1v1 (_showGqRoulette en vs.js) nunca
    // toca este src, asume que siempre es ruleta1.png.
    const wheelBgReset = document.getElementById('gq-roulette-wheel-bg');
    if (wheelBgReset) wheelBgReset.src = 'images/ruleta1.png';
    const tuoT = document.getElementById('timeup-overlay');
    if (tuoT) { tuoT.style.display = 'none'; tuoT.classList.remove('timeup-in', 'timeup-out'); }
    _gqTurnsClearTurnOrder();
    // Sin esto, dejar la sala JUSTO en tu propio turno dejaba la barra en
    // verde para lo próximo que se juegue en esta misma pantalla (solo/1v1
    // GlobeQuiz, tiempo real).
    document.querySelector('.gq-edge-bar')?.classList.remove('gq-my-turn');
  }

  // Guess submission for the group "por turnos" match — mismo patrón que
  // _gqGroupSubmitGuess (tiempo real): separado de submitGuess() (solo/1v1),
  // reutiliza solo los helpers puros de parseo/distancia/dibujo. A
  // diferencia de tiempo real, acá SÍ importa de quién es el turno: un
  // intento (correcto o no) SIEMPRE termina el turno de quien lo hizo.
  function _gqTurnsSubmitGuess() {
    const input = document.getElementById('gq-guess-input');
    const hintEl = document.getElementById('gq-hint');
    if (!input || solved || !window._gqGroupTurnsMyTurn) return;
    const raw = input.value;
    if (!raw.trim()) return;
    const norm = normalize(raw);
    const country = countryByName.get(norm);
    if (!country) {
      if (_gqSuggestion && _gqSuggestion.forNorm === norm && _gqSuggestion.country) {
        input.value = displayName(_gqSuggestion.country);
        _gqSuggestion = null;
        _gqTurnsSubmitGuess();
        return;
      }
      const suggestion = findSuggestion(norm);
      if (suggestion) showSuggestion(suggestion, norm);
      else if (hintEl) hintEl.textContent = t('globequiz.notFound');
      return;
    }
    _gqSuggestion = null;
    if (guesses.find(g => g.name === country.name)) {
      if (hintEl) hintEl.textContent = t('globequiz.alreadyGuessedShared');
      return;
    }
    input.value = '';
    stopAutoRotate();
    _gqTurnsMyAttempts++;
    _gqTurnsStopTimer();
    if (country.name === dailyCountry.name) {
      solved = true;
      if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); }
      drawTexture();
      renderGuessList();
      updateHint();
      focusOnCountry(country);
      showWin();
      if (typeof window._specReportAnswer === 'function') {
        window._specReportAnswer(true, _gqTurnsMyAttempts, { win: true, countryName: dailyCountry.name, iso2: dailyCountry.iso2 });
      }
      window.LB.sendGq({ t: 'tguess', uid: window._sbUserId, round: _gqGroupRound, correct: true });
      return;
    }
    const km = minBorderDistance(country, dailyCountry);
    const dir = bearingArrow(bearing(country.centroid, dailyCountry.centroid));
    const color = distColor(km);
    guesses.push({ name: country.name, km, dir, color });
    if (km < _gqTurnsMyBestKm) { _gqTurnsMyBestKm = km; _gqTurnsMyBestAtMs = Date.now() - gqTimerStart; }
    drawTexture();
    renderGuessList();
    updateHint();
    focusOnCountry(country);
    if (typeof window._specReportAnswer === 'function') {
      window._specReportAnswer(false, guesses.length, { name: country.name, km, dir, color });
    }
    window.LB.sendGq({ t: 'tguess', uid: window._sbUserId, round: _gqGroupRound, correct: false, name: country.name, km, dir, color });
  }

  // ── Leaderboard EXCLUSIVO de "por turnos": misma tarjeta personalizable de
  // siempre (--cust-card) pero ROTADA 90° a panorámico — no la celda, y no
  // estirada/forzada: el arte se pinta a su relación de aspecto real
  // (intercambiando ancho/alto antes de rotar, ver el ::before en
  // style.css) y gira entero, igual que el mockup (nombre arriba, foto +
  // cantidad de RONDAS GANADAS abajo). Apiladas SIN ventana fija — la altura
  // de cada fila se recalcula según cuántos jugadores hay (ver
  // _gqTurnsPositionLb) para que los 10 posibles entren SIEMPRE en el mismo
  // espacio lateral que en tiempo real solo alcanzaba para 4. Deliberadamente
  // separado de _gqGroupBuildLeaderboard/_gqGroupPositionLb (tiempo real):
  // ese sigue con su tarjeta vertical sin rotar + ventana de 4 de siempre.
  function _gqTurnsBuildLeaderboard() {
    const bar = document.getElementById('gq-friends-bar');
    if (!bar) return;
    bar.innerHTML = '';
    bar.classList.add('vs-active', 'gq-turns-mode');
    gqLbElements = {};
    _gqTurnsWinsByUid = {};
    const buildRow = (name, avatar, cardCode) => {
      const el = document.createElement('div');
      el.className = 'lb-entry';
      // .gq-turn-bg es un div APARTE (no ::before de .lb-entry) a propósito:
      // container-type:size tiene que vivir en algo que NO sea ancestro de
      // .lb-name/.lb-score, que usan cqmin asumiendo que miden contra el
      // stage grande del juego (como en todo el resto del código) — puesto
      // en .lb-entry directamente, esas cqmin pasaban a medir contra esta
      // fila diminuta y el texto quedaba invisible (el reportado "no sale
      // el nombre ni el puntaje").
      // .lb-score vive SUELTO acá, no adentro de .lb-turn-row — está
      // anclado al borde IZQUIERDO de toda la carta (ver CSS), lejos de la
      // foto/nombre que quedan del lado derecho.
      el.innerHTML = `<div class="gq-turn-bg"></div>`
        + `<span class="lb-name">${name}</span>`
        + `<span class="lb-score">0</span>`
        + `<div class="lb-turn-row">`
        + `<div class="gq-turn-avatar-wrap"><img class="lb-avatar-img" src="${avatar}"></div>`
        + `</div>`;
      window.CustomizeAssets?.applyCard(el, cardCode || '0001');
      return el;
    };
    // window.LB.getMembers() incluye a TODOS, yo incluido, ya en orden de
    // entrada (ver _gqTurnsComputeOrder).
    (window.LB.getMembers() || []).forEach(m => {
      const isMe = m.id === window._sbUserId;
      const el = buildRow(
        isMe ? ((window._sbProfile && window._sbProfile.name) || localStorage.getItem('playerName') || m.name || 'Tú') : m.name,
        isMe ? (localStorage.getItem('profilePhoto') || 'images/profilepic/ppdefault.png') : m.avatar,
        isMe ? ((window._sbProfile && window._sbProfile.card_code) || '0001') : m.cardCode
      );
      if (isMe) { el.classList.add('lb-player'); el.id = 'gq-lb-player'; gqLbElements['player'] = el; }
      else { el.id = 'gq-lb-lob' + m.id; gqLbElements['lob' + m.id] = el; }
      bar.appendChild(el);
    });
    _gqTurnsPositionLb(false); // fresh build, nothing to slide from yet
  }
  // Ordenamiento vía FLEXBOX (ver #gq-friends-bar.gq-turns-mode en
  // style.css: flex-direction:column + justify-content:flex-end, cada fila
  // flex:0 0 10%) — nada de top/height calculados a mano acá, eso ya dio
  // varias vueltas de bugs de unidades. Esta función solo decide el ORDEN
  // (CSS `order`, ver más abajo) y el texto de cada fila; el motor de layout
  // hace el resto: ancla abajo, deja el hueco arriba si hay menos de 10, y
  // nunca puede desalinearse porque no hay ninguna cuenta propia que
  // desincronizar.
  // `animate`: false for the very first paint right after building the rows
  // from scratch (_gqTurnsBuildLeaderboard/_gqTurnsDebugPreview) — there is
  // no "previous" arrangement to slide from yet, every row is still at its
  // default insertion-order slot, and animating that initial snap-to-rank
  // would look like an unwanted slide-in the instant the board appears.
  function _gqTurnsPositionLb(animate) {
    if (animate === undefined) animate = true;
    const ids = Object.keys(gqLbElements);
    // FLIP (First-Last-Invert-Play): CSS `order` itself can't be
    // transitioned — changing it just snaps every row straight to its new
    // slot (the reported "solo se tpea, falta la animación de subida y
    // bajada"). Measure where each row IS right now BEFORE touching `order`
    // at all — offsetTop (not getBoundingClientRect, see its own comment in
    // getLbRowHeight/mapgame-leaderboard.js: that one is scaled by the
    // #app-stage transform, and a translateY built from it would end up
    // double-scaled). offsetTop is local-CSS-px against the offsetParent —
    // exactly the space a `transform` value on that same element lives in,
    // whatever the stage scale is. Still no manual top/height math of our
    // own, just reading the layout the flex engine already computed.
    const prevTop = {};
    if (animate) {
      ids.forEach(id => {
        const el = gqLbElements[id];
        if (el) prevTop[id] = el.offsetTop;
      });
    }
    const all = ids.map(id => ({
      id,
      wins: _gqTurnsWinsByUid[id === 'player' ? window._sbUserId : id.slice(3)] || 0,
    }));
    all.sort((a, b) => {
      const da = a.id !== 'player' && _gqGroupDisconnectedUids.has(a.id.slice(3));
      const db = b.id !== 'player' && _gqGroupDisconnectedUids.has(b.id.slice(3));
      if (da !== db) return da ? 1 : -1;
      return b.wins - a.wins;
    });
    all.forEach((p, rank) => {
      const el = gqLbElements[p.id];
      if (!el) return;
      // order CSS: rank 0 (más rondas ganadas) queda PRIMERO en el flex —
      // con flex-direction:column normal eso lo pondría arriba del todo,
      // pero justify-content:flex-end empuja TODO el grupo hacia abajo, así
      // que el efecto real es "1° arriba del grupo, último pegado al borde
      // inferior", igual que antes.
      el.style.order = String(rank);
      const scoreEl = el.querySelector('.lb-score');
      if (scoreEl) scoreEl.textContent = String(p.wins);
      // Grayscale for whoever was already eliminated BEFORE the current
      // tiebreak (see window._gqTurnsTiebreakLosers, set in
      // _gqTurnsCloseRound) — visible on THEIR own card too, not just the
      // two still dueling.
      const pUid = p.id === 'player' ? window._sbUserId : p.id.slice(3);
      el.classList.toggle('is-tiebreak-out', !!window._gqTurnsTiebreakLosers && window._gqTurnsTiebreakLosers.has(pUid));
    });
    // Piggybacks on every trigger this function already runs on (score
    // change, tiebreak marked, a fresh build) so the turn-order queue's
    // grayscale/eliminated state stays in sync too, not just on the next
    // turn hand-off.
    _gqTurnsBuildTurnOrder();
    if (!animate) return;
    // Invert + play: en el frame SIGUIENTE (ya con el `order` nuevo
    // aplicado y el layout recalculado), a cada fila que se movió se le
    // pone un translateY que la deja EXACTAMENTE donde estaba antes (sin
    // transición, invisible), y recién ahí se anima ese translateY de
    // vuelta a 0 — el ojo ve la fila deslizarse de la posición vieja a la
    // nueva en vez de saltar. .lb-entry no usa `transform` para nada más
    // (la rotación 90° de la carta vive en .gq-turn-bg::before, un hijo
    // aparte — ver ese comentario), así que es seguro pisarlo acá.
    requestAnimationFrame(() => {
      ids.forEach(id => {
        const el = gqLbElements[id];
        if (!el || !(id in prevTop)) return;
        const delta = prevTop[id] - el.offsetTop;
        if (Math.abs(delta) < 0.5) return;
        el.style.transition = 'none';
        el.style.transform = `translateY(${delta}px)`;
        void el.offsetWidth;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.5s cubic-bezier(0.22,1,0.36,1)';
          el.style.transform = '';
        });
      });
    });
  }

  // ══ TEMPORAL — boceto en vivo para iterar el diseño sin jugar una partida
  // real (ver el botón detrás de ?gqdebug=1 en play/index.html). Arma
  // jugadores FALSOS directamente en gqLbElements/_gqTurnsWinsByUid y
  // reutiliza el mismo _gqTurnsPositionLb/CSS real — es EXACTAMENTE lo que
  // ve un jugador real, ninguna maqueta aparte. Borrar junto con el bloque
  // de play/index.html cuando el diseño quede aprobado. ══
  window._gqTurnsDebugPreview = function (count) {
    count = Math.max(1, Math.min(10, count || 10));
    const gqScreen = document.getElementById('globequiz-screen');
    if (gqScreen) gqScreen.style.display = 'block';
    const bar = document.getElementById('gq-friends-bar');
    if (!bar) return;
    bar.innerHTML = '';
    bar.classList.add('vs-active', 'gq-turns-mode');
    gqLbElements = {};
    _gqTurnsWinsByUid = {};
    const names = ['Nombre', 'mytest', 'sharkite', 'Nacho', 'Pipe', 'Lola', 'Vale', 'Tincho', 'Fede', 'Rulo'];
    for (let i = 0; i < count; i++) {
      const isMe = i === 0;
      const el = document.createElement('div');
      el.className = 'lb-entry' + (isMe ? ' lb-player' : '');
      el.innerHTML = `<div class="gq-turn-bg"></div>`
        + `<span class="lb-name">${names[i] || ('Jugador ' + (i + 1))}</span>`
        + `<span class="lb-score">0</span>`
        + `<div class="lb-turn-row">`
        + `<div class="gq-turn-avatar-wrap"><img class="lb-avatar-img" src="images/profilepic/ppdefault.png"></div>`
        + `</div>`;
      window.CustomizeAssets?.applyCard(el, (i % 2 === 0) ? '0001' : '0002');
      const id = isMe ? 'player' : ('lob' + 'debug' + i);
      gqLbElements[id] = el;
      _gqTurnsWinsByUid[isMe ? window._sbUserId : ('debug' + i)] = Math.floor(Math.random() * 4);
      bar.appendChild(el);
    }
    _gqTurnsPositionLb(false); // fresh build, nothing to slide from yet
  };
  window._gqTurnsDebugPreviewClose = function () {
    const gqScreen = document.getElementById('globequiz-screen');
    if (gqScreen) gqScreen.style.display = 'none';
    document.getElementById('gq-friends-bar')?.classList.remove('vs-active', 'gq-turns-mode');
  };

  // Mismo espíritu TEMPORAL que _gqTurnsDebugPreview, pero para la RULETA
  // sola (ver el botón detrás de ?gqdebug=1 en play/index.html) — arma
  // `count` jugadores FALSOS (yo + fakes con nombre/avatar en
  // window._lobbyMembers, leídos por _showGqGroupRoulette's identityFor tal
  // cual lo haría una partida real) y hace girar la ruleta EXACTA que se ve
  // antes del 3-2-1-GO, con un arrancador al azar cada vez, para poder
  // revisar el layout con 2 a 10 personas sin jugar una partida real ni
  // armar un desempate a mano. Borrar junto con el bloque de
  // play/index.html cuando el diseño quede aprobado.
  window._gqTurnsDebugRoulette = function (count) {
    count = Math.max(2, Math.min(10, count || 10));
    const gqScreen = document.getElementById('globequiz-screen');
    if (gqScreen) gqScreen.style.display = 'block';
    const names = ['mytest', 'sharkite', 'Nacho', 'Pipe', 'Lola', 'Vale', 'Tincho', 'Fede', 'Rulo', 'Bruno'];
    const myId = window._sbUserId || 'debugme';
    const fakeMembers = [];
    const order = [myId];
    for (let i = 0; i < count - 1; i++) {
      const id = 'debugroulette' + i;
      fakeMembers.push({ id, name: names[i % names.length], avatar: 'images/profilepic/ppdefault.png' });
      order.push(id);
    }
    // Baraja el orden (Fisher-Yates) para que "yo" no quede siempre en el
    // mismo casillero — así se ve tanto "arrancás vos" como "arranca fulano".
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    window._lobbyMembers = fakeMembers;
    const starterUid = order[Math.floor(Math.random() * order.length)];
    _showGqGroupRoulette(order, starterUid, () => {});
  };

  // Entry point — llamado desde _launchLobbyGameNow (lobby.js) cuando el
  // modo de la sala es 'globequiz_turns'. turnTime viene de
  // window.LB.getGloboretoConfig() (ajustes del host).
  window.showGlobequizGroupTurnsMode = function (rounds, turnTime, seed) {
    window._gqGroupTurnsActive = true;
    _gqGroupBaseSeed         = seed;
    _gqGroupRounds           = Math.max(1, rounds || 1);
    _gqGroupTotal            = 0;
    _gqGroupUsedCountries    = new Set();
    _gqGroupDisconnectedUids = new Set();
    _gqTurnsWinsByUid        = {};
    _gqTurnsIsTiebreak       = false;
    _gqTurnsTiebreakUids     = null;
    _gqTurnsTimeSec = Math.max(5, turnTime || GQ_TURN_TIME_SECONDS);
    // Undoes _gqDisableExitOnMatchEnd from a PREVIOUS match in the same room
    // (rematch) — otherwise the power/quit button stayed disabled forever
    // after the first match ever ended.
    _gqTurnsResetExitButton();
    // Igual que globequizSetTurnsMode hace para el 1v1: lo oculta ya mismo,
    // recién reaparece cuando el turno arranca de verdad (_gqTurnsSetActiveTurn).
    // Sin esto, la ronda 1 nunca lo ocultaba (a diferencia de las rondas 2+,
    // que sí lo hacen en _gqTurnsBeginRound) y mostraba el "0:00" de
    // placeholder del HTML durante toda la carga/ruleta/3-2-1-GO.
    document.querySelector('.gq-countdown-widget')?.style.setProperty('display', 'none');
    const gqScreen = document.getElementById('globequiz-screen');
    if (gqScreen) gqScreen.style.display = 'block';
    if (typeof window.letterboxRefresh === 'function') window.letterboxRefresh();
    window.LB.onGq(_gqTurnsHandleGqEvent);
    _gqTurnsBuildLeaderboard();
    _gqTurnsBeginRound(1);
  };

  // Guess submission for the group match — deliberately separate from
  // submitGuess() (solo/1v1), which is full of analytics/streak/VS-specific
  // branches that must never fire for a group match. Reuses only the pure
  // helpers (normalize/countryByName/findSuggestion/showSuggestion for
  // parsing, minBorderDistance/bearing/bearingArrow/distColor/drawTexture/
  // renderGuessList/focusOnCountry for the guess itself) and the SAME
  // shared guesses/solved/dailyCountry state submitGuess uses, so the globe
  // rendering behaves identically.
  function _gqGroupSubmitGuess() {
    const input = document.getElementById('gq-guess-input');
    const hintEl = document.getElementById('gq-hint');
    if (!input || solved) return;
    const raw = input.value;
    if (!raw.trim()) return;
    const norm = normalize(raw);
    const country = countryByName.get(norm);
    if (!country) {
      if (_gqSuggestion && _gqSuggestion.forNorm === norm && _gqSuggestion.country) {
        input.value = displayName(_gqSuggestion.country);
        _gqSuggestion = null;
        _gqGroupSubmitGuess();
        return;
      }
      const suggestion = findSuggestion(norm);
      if (suggestion) showSuggestion(suggestion, norm);
      else if (hintEl) hintEl.textContent = t('globequiz.notFound');
      return;
    }
    _gqSuggestion = null;
    if (guesses.find(g => g.name === country.name)) {
      if (hintEl) hintEl.textContent = t('globequiz.alreadyGuessed');
      return;
    }
    input.value = '';
    stopAutoRotate();
    _gqGroupAttempts++;
    if (country.name === dailyCountry.name) {
      solved = true;
      _gqGroupIAlreadySolved = true;
      if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); }
      drawTexture();
      renderGuessList();
      // Same "El país correcto es {name}." hint solo/VS show on a win —
      // reused as-is, it already reads `solved`/`dailyCountry` generically.
      updateHint();
      focusOnCountry(country);
      // Confetti + green "correct country" cell, same as solo/VS — showWin()
      // also disables the input/button, no need to do that by hand here.
      showWin();
      // Generic spectator relay (same call every other mode makes) — lets
      // ANY spectator (external, or another finished player watching me on
      // loan) see my winning guess and the reveal of the target country.
      if (typeof window._specReportAnswer === 'function') {
        window._specReportAnswer(true, _gqGroupAttempts, { win: true, countryName: dailyCountry.name, iso2: dailyCountry.iso2 });
      }
      // Marks me "finished" room-wide (window.LB.sendTimesUp, same generic
      // hook the other 4 modes rely on for GroupSpectate's _finishedUids) —
      // this is what makes a spectator's POV auto-advance PAST me once I
      // solve, instead of leaving them stuck watching my now-idle globe.
      if (typeof window._specReportTimesUp === 'function') window._specReportTimesUp();
      window.LB.sendGq({ t: 'solved', uid: window._sbUserId, round: _gqGroupRound });
      // Once the confetti/celebration has had time to be seen, spectate
      // whoever's still playing instead of sitting idle — see
      // _gqGroupEnterLoan (a no-op if everyone else already solved too).
      setTimeout(() => { if (window._gqGroupActive) _gqGroupEnterLoan(); }, GQ_VS_ANIM_MS);
      return;
    }
    const km = minBorderDistance(country, dailyCountry);
    const dir = bearingArrow(bearing(country.centroid, dailyCountry.centroid));
    guesses.push({ name: country.name, km, dir, color: distColor(km) });
    if (km < _gqGroupBestKm) { _gqGroupBestKm = km; _gqGroupBestAtMs = Date.now() - gqTimerStart; }
    drawTexture();
    renderGuessList();
    updateHint();
    focusOnCountry(country);
    // Generic spectator relay — lets a spectator's guess list mirror this
    // wrong guess live, same as any other mode's board.
    if (typeof window._specReportAnswer === 'function') {
      window._specReportAnswer(false, guesses.length, { name: country.name, km, dir, color: distColor(km) });
    }
  }

  // Fully release the two WebGL contexts (globe + starfield) and their GPU
  // resources. GlobeQuiz keeps `initialized` true for the whole session so the
  // scene is reused on re-entry / rematch / spectate — but that means the WebGL
  // context stays alive after leaving to the menu. On iOS that permanent GPU
  // allocation, stacked under the transformed #app-stage, pushed the following
  // Gira Mundial over the edge (reported crash: GlobeQuiz -> campaign, shapes
  // -> cities). Called on the real exit-to-menu and right before a campaign
  // starts; the scene rebuilds cleanly on the next initGlobeQuiz() because we
  // reset `initialized` and swap in fresh <canvas> nodes (a force-lost context
  // can't be re-acquired on the same element).
  function globequizReleaseGL() {
    if (!initialized && !renderer && !starRenderer) return;
    try { stopAutoRotate(); } catch (e) {}
    try { stopInertia(); } catch (e) {}
    try { if (focusAnimId) cancelAnimationFrame(focusAnimId); } catch (e) {}
    try { clearOutlines(); } catch (e) {}
    try { if (sphere) { sphere.geometry?.dispose(); sphere.material?.dispose(); } } catch (e) {}
    try { canvasTex?.dispose(); } catch (e) {}
    try { starMaterial?.dispose(); starPoints?.geometry?.dispose(); } catch (e) {}
    try { starScene?.traverse(o => { o.geometry?.dispose?.(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); } }); } catch (e) {}
    [renderer, starRenderer].forEach(r => {
      try { r?.dispose(); } catch (e) {}
      try { r?.forceContextLoss(); } catch (e) {}
    });
    // Swap the canvas elements for fresh ones so a new WebGLRenderer can attach.
    ['gq-canvas', 'gq-starfield-canvas'].forEach(id => {
      const old = document.getElementById(id);
      if (old && old.parentNode) {
        const fresh = old.cloneNode(false);
        old.parentNode.replaceChild(fresh, old);
      }
    });
    scene = camera = renderer = sphere = null;
    outlineGroup = null;
    canvasTex = texCanvas = texCtx = null;
    starScene = starCamera = starRenderer = starPoints = starGroup = starMaterial = null;
    initialized = false;
  }
  window.globequizReleaseGL = globequizReleaseGL;

  window.initGlobeQuiz = function () {
    const wireOnce = !initialized;
    fillPlayerCard();
    // Marks is_playing so friends/groups see "Playing" (window._setPlaying
    // is the generic helper from js/core/campaign.js: it also turns on the
    // SoloSpectate channel so a friend can watch, like the rest of the modes
    // — see spectator panel in spectate.js/REAL_UI_MODES.globequiz).
    window.pendingGameMode = 'globequiz';
    window._setPlaying(true);
    Promise.resolve().then(() => {
      if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: _gqTurnsVariant ? 'globequiz_turns' : 'globequiz' });
    });
    // Menu music is cut as soon as you enter (no need to wait for the
    // 3-2-1-GO to finish for this, only gamemusic waits for onDone).
    // playMusic(null) instead of pausing the <audio> by hand — on iOS the
    // real sound runs through Web Audio (see playMusicIOS), not the HTML
    // element.
    if (typeof playMusic === 'function') playMusic(null);
    // sfxBonus (and the rest of the match sfx) are only instantiated here —
    // without this, sfxBonus was left `undefined` for the whole match if no
    // other mode had been played earlier in the session, and the "if" below
    // skipped it silently.
    if (typeof loadGameSFX === 'function') loadGameSFX();
    const spinner = document.getElementById('gq-loading-spinner');
    if (spinner) spinner.style.display = 'block';
    // Hide the input row + hint SYNCHRONOUSLY, right when the screen appears —
    // not inside the loadThree()/loadCountries() .then() below. In versus the
    // sync panel wait (and, if three.js isn't cached, the load itself) can
    // last seconds, and #globequiz-screen is already display:block by then:
    // the "type the name of your first guess" hint and the text field were
    // showing under/around the sync popup before the 3-2-1-GO. They only come
    // back in runGqPregameCountdown's onDone. Also covers re-entry after
    // spectating (globequizSpectatorExit leaves them visible).
    const _guessRow0 = document.querySelector('.gq-guess-row');
    if (_guessRow0) _guessRow0.style.display = 'none';
    const _hint0 = document.getElementById('gq-hint');
    if (_hint0) { _hint0.style.display = 'none'; _hint0.classList.remove('gq-hint-wrap'); }
    // The input/confirm wiring is done HERE, outside the 3D globe promise —
    // it used to live inside the .then() below, so if loadThree() or
    // initThreeScene() failed (WebGL blocked/disabled, typical in Firefox
    // with fingerprinting protection or privacy extensions), the game was
    // left with the input visible but no listeners: the player could type
    // and hit "confirm" and absolutely nothing happened, with no visible
    // error. Now input/confirm always work, even if the globe couldn't load.
    if (wireOnce) {
      const btn2 = document.getElementById('gq-guess-btn');
      const input2 = document.getElementById('gq-guess-input');
      const playCheckSfx = () => { if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } };
      // Grupo (hasta 10, "tiempo real"): usa su propio submit — la mecánica de
      // ronda compartida/ranking/puntaje no tiene nada que ver con el solo/1v1
      // de submitGuess() (ver _gqGroupSubmitGuess más abajo).
      const _gqDispatchSubmit = () => { if (window._gqGroupActive) _gqGroupSubmitGuess(); else if (window._gqGroupTurnsActive) _gqTurnsSubmitGuess(); else submitGuess(); };
      if (btn2) btn2.addEventListener('click', () => { playCheckSfx(); _gqDispatchSubmit(); });
      if (input2) input2.addEventListener('keydown', (e) => { if (e.key === 'Enter') { playCheckSfx(); _gqDispatchSubmit(); } });
      // "Por turnos": broadcast a live preview of what I'm typing while it's
      // my turn. Sent on every keystroke, no debounce — a broadcast message
      // is cheap and a delay here just reads as lag on the opponent's screen
      // for fast typers, and "por turnos" only ever has ONE active typer at
      // a time. Group "tiempo real" does the same for whoever might be
      // watching me on loan (see _gqGroupHandleGqEvent's 'typing' case) —
      // but THERE, with up to several players typing concurrently on the
      // SAME realtime channel (the reported "jugamos seis... recibían las
      // respuestas súper tarde"), one broadcast per keystroke per player can
      // burst well past Supabase Realtime's per-channel message rate,
      // getting messages silently delayed/dropped — including the important
      // solved/rank/round ones queued behind that noise. Throttled via
      // _gqGroupSendTypingThrottled instead (see its own comment). "Por
      // turnos" mirrors this too (see _gqTurnsHandleGqEvent's 'ttyping'
      // case), but only while it's genuinely MY turn — never more than one
      // sender at once there, so no throttle needed.
      if (input2) {
        input2.addEventListener('input', () => {
          if (window._vsActive && _gqTurnsVariant && window._gqMyTurn) {
            window.VS?.reportGqTyping?.(input2.value);
            return;
          }
          if (window._gqGroupActive && !solved) {
            _gqGroupSendTypingThrottled(input2.value);
            return;
          }
          if (window._gqGroupTurnsActive && window._gqGroupTurnsMyTurn) {
            window.LB.sendGq({ t: 'ttyping', uid: window._sbUserId, text: input2.value, round: _gqGroupRound });
          }
        });
      }
      // End-of-game panel confirm: same exit path as power (tear
      // everything down + the menu's typical entrance animation), just
      // without going through the "are you sure you want to quit?" popup
      // (you already finished the match, no need to confirm again).
      document.getElementById('gq-endgame-confirm')?.addEventListener('click', () => {
        const modal = document.getElementById('gq-endgame-modal');
        if (modal) modal.style.display = 'none';
        stopGqEndgameCountdown();
        // End of a standalone GlobeQuiz session. End-of-session ad DISABLED on
        // the main site for now (only wired for the GameDistribution build,
        // in gd-build/) — see window.showEndOfSessionAd's own comment in
        // core/adpanel.js.
        document.getElementById('gq-quit-confirm')?.click();
      });
      document.getElementById('gq-endgame-share')?.addEventListener('click', () => {
        playCheckSfx();
        _gqOpenShare();
      });
    }
    // Load milestones for the duel sync bar (see _vsGqLoadPhase in vs.js) —
    // 'start' as soon as it begins, 'assets' when three.js/GeoJSON have
    // downloaded, 'scene' with the 3D globe built.
    const _gqPhase = p => { if (window._vsActive && typeof window._vsGqLoadPhase === 'function') window._vsGqLoadPhase(p); };
    _gqPhase('start');
    const _pThree = loadThree(), _pCountries = loadCountries();
    Promise.all([_pThree, _pCountries]).then(() => {
      _gqPhase('assets');
      if (!initialized) {
        initThreeScene();
        initialized = true;
      }
      // Base position always on entry (not whatever was left from a
      // previous match), with auto-rotation until the first guess.
      if (sphere) { sphere.rotation.x = BASE_ROT_X; sphere.rotation.y = BASE_ROT_Y; }
      zoomZ = BASE_Z;
      if (camera) camera.position.z = zoomZ;
      updateSpaceVignette();
      startAutoRotate();
      loadState();
      pickDailyCountry();
      // The timer only starts on the first guess (see submitGuess), not as
      // soon as you enter the screen — here it's just reset to 0.
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
      // The input/check and hint only appear when the 3-2-1-GO ends, not
      // before.
      if (guessRow) guessRow.style.display = 'none';
      if (hintEl2) { hintEl2.style.display = 'none'; hintEl2.classList.remove('gq-hint-wrap'); }
      // The globe isn't interactive (click/drag/zoom) either until the
      // 3-2-1-GO ends.
      const canvasEl = document.getElementById('gq-canvas');
      if (canvasEl) canvasEl.style.pointerEvents = 'none';
      drawTexture();
      restoreUIState();
      fitCanvas();
      // Group "por turnos" round 1: the roulette runs BEFORE the 3-2-1-GO
      // (same order as the 1v1's own _gqMaybeStart in vs.js — roulette,
      // then the countdown), so this wraps the rest of startGqCountdown's
      // body and only calls it once the spin resolves. Every other case
      // (solo, "por rapidez", real-time group, 1v1 por turnos which does
      // its OWN roulette earlier in vs.js) proceeds immediately, unchanged.
      const _startGqCountdownBody = () => {
        if (spinner) spinner.style.display = 'none';
        // Reports the 3-2-1 start so the spectator watches it live (see
        // globequizSpectatorShowPregame) — it used to live INSIDE
        // runGqPregameCountdown, which the spectator now also calls to SHOW
        // the countdown, not to re-broadcast it.
        if (typeof window._specReportPregame === 'function') {
          const pregamePayload = { mode: (_gqTurnsVariant || window._gqGroupTurnsActive) ? 'globequiz_turns' : 'globequiz', startedAt: Date.now() };
          // Group round 1: tag with the round counter (same reason as the
          // 'round' broadcast further down, see its own comment) so a
          // spectator's badge is already correct DURING the 3-2-1-GO,
          // instead of only once 'round' arrives at the END of it (the
          // reported "spectator doesn't see Ronda 1/5 during the 3-2-1-GO").
          if (window._gqGroupActive || window._gqGroupTurnsActive) { pregamePayload.round = _gqGroupRound; pregamePayload.totalRounds = _gqGroupRounds; }
          window._specReportPregame(pregamePayload);
        }
        // Music only starts when the 3-2-1-GO ends, same as the rest of the
        // modes (see runPregameCountdown in js/modes/mapgame-play.js).
        runGqPregameCountdown(() => {
          if (guessRow) guessRow.style.display = '';
          if (hintEl2) hintEl2.style.display = '';
          if (canvasEl) canvasEl.style.pointerEvents = '';
          if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
          // "Por turnos": only the player the roulette picked gets to guess
          // first (see window._gqAmIStarter, set in vs.js before the
          // roulette). Every other case (solo, "por rapidez") leaves both
          // sides free, same as before.
          if (window._vsActive && _gqTurnsVariant) {
            document.querySelector('.gq-countdown-widget')?.style.removeProperty('display');
            window.globequizSetMyTurn?.(!!window._gqAmIStarter, Date.now());
          }
          startTimer();
          // A single "round" per session (no repeated rounds) — the target
          // country is never sent, only when the timer started, so the
          // spectator doesn't see the answer before the player.
          if (typeof window._specReportRound === 'function') {
            const roundPayload = { mode: (_gqTurnsVariant || window._gqGroupTurnsActive) ? 'globequiz_turns' : 'globequiz', startedAt: gqTimerStart };
            // Lets a spectator work out who starts without a broadcast of its
            // own: whichever role sent this 'round' says whether ITS OWN
            // client is the starter (both host and guest compute this
            // independently from the same seed, see window._gqAmIStarter in
            // vs.js) — the other role is the starter otherwise.
            if (window._vsActive && _gqTurnsVariant) roundPayload.amIStarter = !!window._gqAmIStarter;
            // Group round 1 goes through this shared 1v1/solo path — tag it
            // with the round counter so an external spectator can show the
            // same "Ronda N/N" badge the real players see (see
            // globequizSpectatorShowRound).
            if (window._gqGroupActive || window._gqGroupTurnsActive) { roundPayload.round = _gqGroupRound; roundPayload.totalRounds = _gqGroupRounds; }
            window._specReportRound(roundPayload);
          }
          if (window._gqGroupTurnsActive) {
            _gqTurnsSetActiveTurn(_gqTurnsOrder[_gqTurnsPointer]);
            _gqTurnsBroadcastFirstTurn(_gqTurnsOrder[_gqTurnsPointer]);
          }
        });
      };
      const startGqCountdown = () => {
        if (window._gqGroupTurnsActive) {
          // Hide the loading spinner right away — _startGqCountdownBody
          // would otherwise only do it AFTER the roulette resolves, leaving
          // it covering the roulette overlay for the whole spin.
          if (spinner) spinner.style.display = 'none';
          _gqTurnsPickOrderAndShowRoulette(_startGqCountdownBody);
          return;
        }
        _startGqCountdownBody();
      };
      // VS 1v1: don't start the 3-2-1 until the OPPONENT also finishes
      // loading their 3D globe (three.js + GeoJSON are heavy and take
      // different times per device/network) — without this, whoever loaded
      // faster started their timer earlier, a real advantage in a mode won
      // by being first to guess right. While waiting, vs.js's sync panel
      // (bar + each side's status) covers the screen. _vsGqAwaitBothReady
      // (vs.js) broadcasts 'ready' and starts the local 3-2-1 once both
      // sides have announced, or bounces both after a timeout.
      if (window._vsActive && typeof window._vsGqAwaitBothReady === 'function') {
        _gqPhase('scene');
        window._vsGqAwaitBothReady(startGqCountdown);
      } else {
        startGqCountdown();
      }
    }).catch(err => {
      console.error('GlobeQuiz init failed', err);
      if (spinner) spinner.style.display = 'none';
      // In a 1v1 duel: if my 3D globe didn't load, I can't play — I notify
      // the opponent so both return to the menu with no winner, instead of
      // letting them start solo while I'm stuck here (see _handleGqSyncFailed
      // in vs.js).
      if (window._vsActive && typeof window._vsGqSyncFailed === 'function') {
        window._vsGqSyncFailed(err); // err lets vs.js pick the right error code (CDN vs WebGL)
        return;
      }
      // This used to fail silently (console only) and input/confirm didn't
      // even have listeners yet, so the player typed and hit confirm with
      // nothing happening, no hint of what was wrong. The input/confirm
      // wiring now lives outside this promise (see above), so at least that
      // keeps working; here we just report that the 3D globe couldn't load
      // (typically WebGL blocked or disabled in the browser).
      // THREE.WebGLRenderer throws "Error creating WebGL context" when the
      // browser refuses to create the context — typical of privacy-hardened
      // forks (LibreWolf, Tor Browser) that disable WebGL by default. The
      // specific reason ("WebGL is currently disabled") only shows as a
      // browser console warning, it doesn't reach here in err.message, so we
      // distinguish by this generic three.js message instead of the exact
      // cause.
      const isWebglDisabled = /error creating webgl context/i.test(String(err && err.message || err));
      const hintEl = document.getElementById('gq-hint');
      if (hintEl) {
        // Both error messages are much longer than a normal hint (see
        // .gq-hint-wrap in style.css) — without this they overflow on a
        // single line and become illegible.
        hintEl.classList.add('gq-hint-wrap');
        hintEl.textContent = t(isWebglDisabled ? 'globequiz.loadErrorWebgl' : 'globequiz.loadError');
      }
    });
  };

  // ── SPECTATOR ──────────────────────────────────────────────────────────────
  // Reuses the SAME #globequiz-screen/gq-panel/gq-guess-list/gq-win-msg/3D
  // globe the real player sees (same pattern as flags/shapes/monuments — see
  // REAL_UI_MODES.globequiz in spectate.js). Unlike the rest of this file,
  // there is NO separate game state of its own here: the spectator writes
  // directly into the same module variables the real player uses
  // (guesses/solved/dailyCountry) and calls the SAME drawing functions
  // (drawTexture/focusOnCountry/renderGuessList/updateHint/showWin) — there
  // is never a real match AND a spectator session active at once in the same
  // tab, so no conflict is possible from sharing the state. This is exactly
  // what allows showing the globe (with the same painted/outlined countries
  // and the same drag/zoom/click-to-focus initThreeScene() already ships,
  // for free) instead of reimplementing a separate renderer.
  // countryByName/normalize/formatGqCardTime are also the same functions/maps
  // above in this file, not a copy.
  let _gqSpecTimerInterval = null;
  let _gqSpecCardInterval = null;
  let _gqSpecStartedAt = 0;
  // VS spectator: best (closest) km each side reached, for the two cards.
  let _gqSpecFriendBestKm = Infinity;
  let _gqSpecOppBestKm = Infinity;

  function _gqSpecResetPanel() {
    if (_gqSpecCardInterval) { clearInterval(_gqSpecCardInterval); _gqSpecCardInterval = null; }
    const win = document.getElementById('gq-win-msg');
    if (win) { win.style.display = 'none'; win.innerHTML = ''; }
    const banner = document.getElementById('gq-spec-postgame-banner');
    if (banner) banner.style.display = 'none';
    // Whole seconds, like the real player's big timer
    // (updateTimerDisplay/String(wholeSec)) — never "M:SS"/"S:CC" (that
    // format is only for the small card, formatGqCardTime).
    const timerEl = document.getElementById('gq-timer-number');
    if (timerEl) timerEl.textContent = '0';
    // Friend card time — the two-line VS layout (globequizSpectatorSetOpponent)
    // keeps its child spans; only the value/km reset, never wipe the container.
    // "Por turnos" flips what each line means (see gqVsScoreInnerHtml) — TOP
    // is the closest km so far ('—' with none yet), BOTTOM is the attempt
    // count ('0') — resetting to the "por rapidez" defaults ('0:00'/'—')
    // here regardless of variant left the wrong text sitting there at the
    // start of every single round (the reported "the cards don't update
    // right"), until the first guess happened to overwrite it.
    const topDefault = _gqTurnsVariant ? '—' : '0:00';
    const bottomDefault = _gqTurnsVariant ? '0' : '—';
    const meVal = document.getElementById('gq-lb-player-time-val');
    if (meVal) meVal.textContent = topDefault;
    else { const c = document.getElementById('gq-lb-player-time'); if (c) c.textContent = topDefault; }
    const meKm = document.getElementById('gq-lb-player-km');
    if (meKm) meKm.textContent = bottomDefault;
    // Rival row — carry it across rounds (same opponent), just reset its values.
    const oTime = document.getElementById('gq-lb-vsopp-time');
    if (oTime) oTime.textContent = topDefault;
    const oKm = document.getElementById('gq-lb-vsopp-km');
    if (oKm) oKm.textContent = bottomDefault;
    _gqSpecFriendBestKm = Infinity;
    _gqSpecOppBestKm = Infinity;
    _gqSpecPositionVsLeaderboard(false);
    // Same reset as the real player's loadState() (guesses/solved) plus
    // dailyCountry null — the spectator never knows it until they win (see
    // globequizSpectatorResolvePick), so drawTexture()/updateOutlines() must
    // start WITHOUT it (their `if (solved)` guard already handles this).
    guesses = [];
    solved = false;
    animatedGuessNames = new Set();
    dailyCountry = null;
    // Clear a leftover game-over overlay (globequizSpectatorShowLoss).
    const _go = document.getElementById('powerquit-overlay');
    if (_go) { _go.style.display = 'none'; _go.classList.remove('timeup-in', 'timeup-out'); }
    if (sphere) {
      sphere.rotation.x = BASE_ROT_X; sphere.rotation.y = BASE_ROT_Y;
      zoomZ = BASE_Z;
      if (camera) camera.position.z = zoomZ;
      updateSpaceVignette();
    }
    // Safe no-ops if the globe hasn't finished loading (see each function's
    // own guards) — they recover on their own as soon as initThreeScene()
    // resolves, in globequizSpectatorEnter. updateHint() (the "hotter/colder"
    // text) is deliberately left out — the spectator doesn't show it
    // (.gq-hint stays hidden, see globequizSpectatorEnter).
    drawTexture();
    renderGuessList();
    startAutoRotate();
  }

  // Single card for the spectated friend, reusing the same #gq-lb-player
  // that in a real match shows the player themselves (fillPlayerCard) — same
  // pattern as citiesSpectatorSetPlayerCard/monumentsSpectatorSetPlayerCard.
  // GlobeQuiz has no traditional score or opponent (always solo), so
  // score/oppName/oppAvatar/oppScore arrive but are deliberately ignored —
  // kept in the signature only because _updateMiniScores (spectate.js) calls
  // ALL fns.setPlayerCard with the same 8 positional arguments.
  window.globequizSpectatorSetPlayerCard = function (name, avatar, score, oppName, oppAvatar, oppScore, cardCode) {
    const playerEl = document.getElementById('gq-lb-player');
    if (!playerEl) return;
    const nameEl = document.getElementById('gq-lb-player-name');
    if (nameEl) nameEl.textContent = name || 'Jugador';
    const avatarEl = document.getElementById('gq-lb-player-avatar');
    if (avatarEl) avatarEl.src = avatar || 'images/profilepic/ppdefault.png';
    if (window.CustomizeAssets) window.CustomizeAssets.applyCard(playerEl, cardCode || '0001');
    // #gq-lb-player has `top: 0` from CSS (see style.css) meant as a
    // starting point for positionGqLeaderboard() to relocate it on each
    // real-match tick — here that function never runs (no "today's friends"
    // to spectate, it's ALWAYS a single card), so without this the card
    // stayed stuck at the top of the 4-row window instead of anchored at
    // the bottom as befits a solo player (same bottom-anchor criterion as
    // positionGqLeaderboard, the reported "it's not aligned").
    playerEl.style.top = ((GQ_LB_WINDOW - 1) * GQ_LB_ROW_H_CQMIN) + 'cqmin';
  };

  window.globequizSpectatorEnter = function () {
    window._isSpectating = true;
    window.pendingGameMode = 'globequiz';
    if (typeof loadCountries === 'function') loadCountries().catch(() => {});
    // sfxBonus (and the rest of sfxPin/sfxError/etc.) are only instantiated
    // here (see loadGameSFX) — the real player's initGlobeQuiz() already
    // calls it, but the spectator never goes through there. If this tab
    // never played a real match before spectating, sfxBonus was left
    // `undefined` for the whole session and
    // globequizSpectatorResolvePick's `typeof sfxBonus !== 'undefined'`
    // guard skipped it silently (the reported "bonus.mp3 doesn't play").
    if (typeof loadGameSFX === 'function') loadGameSFX();
    const ls = document.getElementById('loading-screen');
    if (ls) ls.style.display = 'none';
    const screenEl = document.getElementById('globequiz-screen');
    if (screenEl) screenEl.style.display = '';
    // Hide everything that requires TYPING/acting as a player: guess input,
    // real power/quit (the spectator close uses #ingame-power — see
    // refreshIngamePower in js/modes/mapgame-misc.js, now including
    // #globequiz-screen in spectator mode — not this popup, though this
    // power DOES trigger the real GlobeQuiz exit via _setPlaying(false) for
    // the real player), and the "hotter/colder" hint (.gq-hint, info the
    // spectator doesn't take part in). The 3D globe (.gq-globe-wrap) IS
    // shown — see the block below that loads it.
    const powerBtn2 = document.getElementById('gq-power-btn');
    if (powerBtn2) powerBtn2.style.display = 'none';
    // .gq-friends-bar (with #gq-lb-player inside) is deliberately NOT hidden
    // here, unlike the rest — it's what globequizSpectatorSetPlayerCard
    // reuses to show the spectated friend's card (photo/name/frame), see
    // that function below. The rows of OTHER friends that buildGqFriendRows
    // may have left from a previous real match in this same tab (before
    // switching to spectate) are cleared — here only the spectated friend's
    // single card belongs.
    const friendsBar2 = document.getElementById('gq-friends-bar');
    if (friendsBar2) {
      friendsBar2.querySelectorAll('.lb-entry[data-gq-friend]').forEach(el => el.remove());
      // Same leftover as buildGqFriendRows/globequizVsPrepareOpponentRow: a
      // GROUP "por turnos" match played earlier in this tab left its own
      // rows (gq-lb-lob<uid>) + rotated gq-turns-mode layout on this same
      // bar, never cleared outside window.gameStoppers.
      friendsBar2.querySelectorAll('.lb-entry[id^="gq-lb-lob"]').forEach(el => el.remove());
      friendsBar2.classList.remove('gq-turns-mode');
    }
    const guessRow2 = document.querySelector('.gq-guess-row');
    if (guessRow2) guessRow2.style.display = 'none';
    const hintEl4 = document.querySelector('.gq-hint');
    if (hintEl4) hintEl4.style.display = 'none';
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    // GROUP external spectator only (1v1/solo keep #gq-spec-typing — see
    // globequizSpectatorShowTyping) — same locked typing bar above
    // "ESPECTANDO" the in-game loan feature uses.
    if (window._isGroupSpectating && window._isGroupSpectating()) window.globequizSpectatorShowGroupTyping();
    _gqSpecResetPanel();
    // The spectator used to deliberately never call
    // loadThree()/initThreeScene() ("v1 without globe"). Now it reuses
    // EXACTLY the same globe the real player sees — same
    // canvas/renderer/sphere (initialized avoids re-initializing if this tab
    // already played a real match before), so drag/zoom/click-to-focus
    // (already wired in initThreeScene, without touching game state) work
    // for free for the viewer.
    Promise.all([loadThree(), loadCountries()]).then(() => {
      if (!initialized) {
        initThreeScene();
        initialized = true;
        // `sphere` only exists now — _gqSpecResetPanel() above ran before
        // this Promise resolved and its rotation/zoom reset was no-oped
        // (guard `if (sphere)`). guesses/solved/dailyCountry, on the other
        // hand, may have ALREADY changed (a real guess arrived while three.js
        // loaded from the CDN) — _gqSpecResetPanel() must NOT be called
        // again here, it would overwrite that data with a zero reset.
        sphere.rotation.x = BASE_ROT_X; sphere.rotation.y = BASE_ROT_Y;
        zoomZ = BASE_Z;
        camera.position.z = zoomZ;
        updateSpaceVignette();
      }
      // Repaints with whatever is ALREADY in guesses/solved/dailyCountry
      // (same pattern as restoreUIState(), but without that function's
      // `initialized` guard, and without updateHint() — the spectator
      // doesn't show the hint) — covers both the first guess that arrived
      // during loading and the normal case of entering with nothing yet.
      drawTexture();
      renderGuessList();
      if (solved) showWin();
      fitCanvas();
      // Without this the spinner (visible via CSS until JS turns it off, see
      // initGlobeQuiz) kept spinning forever over the already-loaded globe —
      // nothing else hid it on the spectator path.
      const spinner = document.getElementById('gq-loading-spinner');
      if (spinner) spinner.style.display = 'none';
      // startAutoRotate() from _gqSpecResetPanel() (above, synchronous,
      // before this Promise resolved) starts its own rAF loop but that loop
      // stops itself on the first frame if `sphere` doesn't exist yet (see
      // the `if (!sphere) return` guard inside, which doesn't reschedule
      // itself) — without this second call here, the globe stayed frozen
      // forever if three.js took a while to load. If a guess already arrived
      // in the meantime, do NOT reactivate it (the real player's submitGuess
      // doesn't either past the first guess).
      if (guesses.length === 0 && !solved) startAutoRotate();
    }).catch(() => {
      // three.js couldn't load (WebGL blocked/disabled, same case the real
      // player sees) — the spectator still keeps the list/card, but without
      // this the spinner kept spinning over a globe that would never arrive.
      const spinner = document.getElementById('gq-loading-spinner');
      if (spinner) spinner.style.display = 'none';
    });
  };

  // VS spectator: the rival's row (name + avatar + shared time + best km),
  // and convert the friend's own card to the same two-line time/km layout the
  // real players use.
  window.globequizSpectatorSetOpponent = function (name, avatar, cardCode) {
    const bar = document.getElementById('gq-friends-bar');
    const playerEl = document.getElementById('gq-lb-player');
    if (!bar || !playerEl) return;
    let el = document.getElementById('gq-lb-vsopp');
    if (!el) {
      _gqSpecFriendBestKm = Infinity;
      _gqSpecOppBestKm = Infinity;
      el = document.createElement('div');
      el.className = 'lb-entry lb-vsopp';
      el.id = 'gq-lb-vsopp';
      el.innerHTML = '<div class="lb-avatar"><img class="lb-avatar-img" id="gq-lb-vsopp-avatar" src="images/profilepic/ppdefault.png"></div>'
        + '<span class="lb-name" id="gq-lb-vsopp-name"></span>'
        + '<span class="lb-score gq-lb-vs-score" id="gq-lb-vsopp-score">' + gqVsScoreInnerHtml('gq-lb-vsopp-time', 'gq-lb-vsopp-km') + '</span>';
      bar.appendChild(el);
      el.style.top = ((GQ_LB_WINDOW - 2) * GQ_LB_ROW_H_CQMIN) + 'cqmin';
    }
    document.getElementById('gq-lb-vsopp-name').textContent = name || 'Rival';
    document.getElementById('gq-lb-vsopp-avatar').src = avatar || 'images/profilepic/ppdefault.png';
    if (window.CustomizeAssets) window.CustomizeAssets.applyCard(el, cardCode || '0001');
    // Same shared bookkeeping the real player's globequizVsPrepareOpponentRow
    // sets up for its own two cards — without this, _gqSpecPositionVsLeaderboard
    // had no elements to reorder (the reported "the cards' position never
    // updates"), since this is a completely separate DOM build path from the
    // real player's.
    gqLbElements = { player: playerEl, vsopp: el };
    _gqSpecPositionVsLeaderboard(false);
    // Friend card → same two-line layout (only once).
    const myScoreEl = document.getElementById('gq-lb-player-time');
    if (myScoreEl && !document.getElementById('gq-lb-player-time-val')) {
      myScoreEl.classList.add('gq-lb-vs-score');
      myScoreEl.innerHTML = gqVsScoreInnerHtml('gq-lb-player-time-val', 'gq-lb-player-km');
    }
  };
  window.globequizSpectatorSetOppGuess = function (km) {
    if (typeof km === 'number' && isFinite(km)) _gqSpecOppBestKm = Math.min(_gqSpecOppBestKm, km);
    const el = document.getElementById('gq-lb-vsopp-km');
    if (el) el.textContent = isFinite(_gqSpecOppBestKm) ? Math.round(_gqSpecOppBestKm) + ' km' : '—';
    _gqSpecPositionVsLeaderboard(true);
  };
  window.globequizSpectatorSetFriendGuess = function (km) {
    if (typeof km === 'number' && isFinite(km)) _gqSpecFriendBestKm = Math.min(_gqSpecFriendBestKm, km);
    const el = document.getElementById('gq-lb-player-km');
    if (el) el.textContent = isFinite(_gqSpecFriendBestKm) ? Math.round(_gqSpecFriendBestKm) + ' km' : '—';
    _gqSpecPositionVsLeaderboard(true);
  };

  window.globequizSpectatorExit = function (switchingMode) {
    if (!switchingMode) window._isSpectating = false;
    document.getElementById('gq-lb-vsopp')?.remove();
    const _go2 = document.getElementById('powerquit-overlay');
    if (_go2) { _go2.style.display = 'none'; _go2.classList.remove('timeup-in', 'timeup-out'); }
    if (_gqSpecTimerInterval) { clearInterval(_gqSpecTimerInterval); _gqSpecTimerInterval = null; }
    if (_gqSpecCardInterval) { clearInterval(_gqSpecCardInterval); _gqSpecCardInterval = null; }
    _gqStopTurnTimer();
    // The globe now genuinely runs for the spectator (auto-rotation +
    // release inertia, see initThreeScene) — without stopping them here they
    // stayed alive in the background (rAF loop) with the screen already
    // hidden, exactly the "GPU always active even when nothing is visible"
    // pattern that already caused memory crashes on iOS elsewhere in this
    // project.
    stopAutoRotate();
    stopInertia();
    // Cuts the 3-2-1-GO mirror dead (pending timeout + sfxCountdown) if the
    // spectator closes the session mid-way — same reason abortGqPregameCountdown
    // already covers for the real player quitting with power.
    abortGqPregameCountdown();
    const screenEl = document.getElementById('globequiz-screen');
    if (screenEl) screenEl.style.display = 'none';
    // "Por turnos" GroupSpectate mirror (see _specGqTurnsShowRoundResult in
    // spectate.js) — closing the session mid-table left it stuck visible
    // otherwise, since nothing else hides it on this path.
    document.getElementById('gq-round-result-screen')?.style.setProperty('display', 'none');
    // Restore what was hidden in Enter — if this same tab later starts a
    // REAL GlobeQuiz match, initGlobeQuiz() expects these elements in their
    // normal state.
    const powerBtn = document.getElementById('gq-power-btn');
    if (powerBtn) powerBtn.style.display = '';
    const friendsBar = document.querySelector('.gq-friends-bar');
    if (friendsBar) {
      friendsBar.style.display = '';
      // GROUP spectator (_renderGroupLeaderboardInner in spectate.js) leaves
      // 'vs-active'/'gq-turns-mode' on this SAME shared container, plus its
      // own 'group-spec-lb-{uid}' rows — none of that was ever undone here,
      // so the NEXT thing to use #gq-friends-bar in this tab (a real match
      // this player then starts themselves, or the next spectate session)
      // inherited stale turns-mode CSS/leftover rows and rendered
      // misplaced/duplicated (the reported "la posicion del leaderboard...
      // parece descolocado"). #gq-lb-player is real players' own static row
      // (see play/index.html) — the group spectator hides it outright while
      // it builds its own rows in its place, restored here too.
      friendsBar.classList.remove('vs-active', 'gq-turns-mode');
      friendsBar.querySelectorAll('[id^="group-spec-lb-"]').forEach(el => el.remove());
      const meEl = document.getElementById('gq-lb-player');
      if (meEl) meEl.style.display = '';
    }
    const guessRow = document.querySelector('.gq-guess-row');
    if (guessRow) guessRow.style.display = '';
    const hintEl = document.querySelector('.gq-hint');
    if (hintEl) hintEl.style.display = '';
    window.globequizSpectatorHideGroupTyping();
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    if (!switchingMode) {
      const ls = document.getElementById('loading-screen');
      if (ls) ls.style.display = 'flex';
    }
  };

  // "Por turnos" ONLY: reuses the REAL per-turn countdown's PAINT machinery
  // (_gqTickTurnTimer/_gqPaintTurnTimer, same closure/DOM element) for a
  // spectator too, but NOT _gqStartTurnTimer itself — that one deliberately
  // IGNORES its `startedAt` argument and always sets _gqTurnStartedAt =
  // Date.now() (see its own comment: correct for a REAL player, whose turn
  // genuinely starts "now" on their own device). A spectator's `startedAt`
  // instead comes from a REMOTE broadcast ('tturn'/'tstate') — some of that
  // 20s may have already elapsed before it even arrived (more so on a fresh
  // join/reconnect mid-turn) — routing it through _gqStartTurnTimer silently
  // discarded it and always restarted the visible clock at the full 20s
  // (the reported "el contador... esta en 8 segs, el espectador lo ve en
  // 20"). _specClockOffsetMs corrects for the two devices' clocks
  // disagreeing, same pattern as globequizSpectatorShowPregame. Also
  // unhides the countdown widget, which globequizSetTurnsMode hid on mount
  // (real players only unhide it themselves once THEIR 3-2-1 ends, a
  // spectator never runs that code path).
  // `durationSec`: GROUP "por turnos" rooms have a CONFIGURABLE turn time
  // (see the turnTime stepper in lobby.js, defaults to 20 but not always
  // 20) — the spectator never runs showGlobequizGroupTurnsMode itself (only
  // a real player does), so it never learns the room's actual value unless
  // a caller passes it along (see 'tturn'/'tstate' in spectate.js, both now
  // carry the sender's own _gqTurnsTimeSec). Falls back to the 1v1 constant
  // when omitted (1v1 duels have no such setting).
  window.globequizSpectatorStartTurnTimer = function (startedAt, durationSec) {
    document.querySelector('.gq-countdown-widget')?.style.removeProperty('display');
    _gqStopTurnTimer();
    const offset = typeof window._specClockOffsetMs === 'function' ? window._specClockOffsetMs() : 0;
    _gqTurnStartedAt = (typeof startedAt === 'number' ? startedAt : Date.now()) - offset;
    _gqSpecTurnDurationSec = (typeof durationSec === 'number' && durationSec > 0) ? durationSec : GQ_TURN_TIME_SECONDS;
    _gqTurnSecondsLeft = _gqSpecTurnDurationSec + 1; // force the first poll to paint
    _gqSetCountdownIconRed(false);
    _gqSpecTickTurnTimer();
    _gqTurnTimerInterval = setInterval(_gqSpecTickTurnTimer, 250);
  };
  // Spectator-only twin of _gqTickTurnTimer: same paint/pulse/red-icon/tick
  // sfx behavior, but against _gqSpecTurnDurationSec (settable per room)
  // instead of the 1v1's hardcoded GQ_TURN_TIME_SECONDS, and it never
  // declares a timeout (a spectator has no turn of its own to forfeit — the
  // real timeout is always announced by whoever's turn it actually was, via
  // 'tguess'/'tround').
  let _gqSpecTurnDurationSec = GQ_TURN_TIME_SECONDS;
  function _gqSpecTickTurnTimer() {
    const elapsedSec = Math.floor((Date.now() - _gqTurnStartedAt) / 1000);
    const secondsLeft = Math.max(0, _gqSpecTurnDurationSec - elapsedSec);
    if (secondsLeft === _gqTurnSecondsLeft) return;
    _gqTurnSecondsLeft = secondsLeft;
    _gqPaintTurnTimer();
    pulseCountdown();
    if (secondsLeft > 0 && secondsLeft <= 5) {
      _gqSetCountdownIconRed(true);
      if (typeof sfxTickdown !== 'undefined' && typeof sfxPlay === 'function') { sfxTickdown.currentTime = 0; sfxPlay(sfxTickdown); }
    }
    if (secondsLeft <= 0) _gqStopTurnTimer();
  }
  window.globequizSpectatorStopTurnTimer = function () {
    _gqStopTurnTimer();
  };

  // GROUP spectator only: the same locked "what are they typing" bar the
  // in-game loan feature shows above #spectator-mini-hud (see
  // _gqGroupShowWatchBanner/_gqGroupUpdateTypingPreview) — the external
  // spectator was instead using #gq-spec-typing (the older 1v1 element, a
  // plain floating text, not positioned above "ESPECTANDO" and not styled
  // as the locked input bar) — reused here so both watch-modes look
  // identical, per the user's request.
  window.globequizSpectatorShowGroupTyping = function () {
    document.getElementById('gq-group-watch-typing-row')?.style.setProperty('display', '');
    // The raw markup's placeholder="" is empty until the first live/resent
    // typing text arrives — without this, a freshly-entered spectator saw a
    // blank box instead of the "Escribe un país..." placeholder (the
    // reported "right when entering, it's empty").
    _gqGroupUpdateTypingPreview('');
  };
  window.globequizSpectatorHideGroupTyping = function () {
    document.getElementById('gq-group-watch-typing-row')?.style.setProperty('display', 'none');
    _gqGroupUpdateTypingPreview('');
  };
  window.globequizSpectatorSetGroupTypingText = function (text) {
    _gqGroupUpdateTypingPreview(text || '');
  };

  // "Por turnos" ONLY: mirrors the real players' roulette (see
  // _showGqRoulette in vs.js, reused here via window._vsShowGqRouletteFor)
  // for a spectator — the friend's own identity stands in for "me" since a
  // spectator has no side of their own.
  window.globequizSpectatorShowRoulette = function (friendStarts, friendName, friendAvatar, oppName, oppAvatar) {
    if (typeof window._vsShowGqRouletteFor !== 'function') return;
    window._vsShowGqRouletteFor(!!friendStarts, () => {}, {
      myName: friendName || 'Jugador', myAvatar: friendAvatar || 'images/profilepic/ppdefault.png',
      oppName: oppName || 'Rival', oppAvatar: oppAvatar || 'images/profilepic/ppdefault.png',
    });
  };

  // "Por turnos" ONLY: whose turn it is right now, for a spectator (the real
  // players never see this text — they get the turn-lock disable/enable +
  // #gq-hint's "Esperando respuesta de..." instead, see globequizSetMyTurn).
  // Shown at the TOP of the screen (#gq-spec-turn, see style.css) — the
  // bottom is reserved for the locked input mirroring live typing instead
  // (see globequizSpectatorSetupTurnsUI/globequizSpectatorShowTyping).
  window.globequizSpectatorSetTurn = function (text) {
    const el = document.getElementById('gq-spec-turn');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('gq-spec-turn-show', !!text);
  };

  // "Por turnos" ONLY: resets the turn banner + typing bubble for a
  // spectator — hides both. Called on mount (see _enterRealUIIfPossible in
  // spectate.js, still during the roulette/3-2-1 — neither belongs on
  // screen until gameplay actually starts, see onRound there) and again
  // whenever the match ends (win/loss).
  window.globequizSpectatorSetupTurnsUI = function () {
    window.globequizSpectatorSetTurn('');
    const el = document.getElementById('gq-spec-typing');
    if (el) { el.classList.remove('gq-spec-typing-show'); el.textContent = ''; }
  };

  // GROUP "por turnos" GroupSpectate (the generic external "watch the whole
  // room" viewer) ONLY — unlike every other spectator context (1v1/solo/
  // group "por rapidez", each a genuinely DIFFERENT board per member), this
  // mode has ONE shared board: there's nothing "per member" to show a photo
  // for. Per request, this replaces the generic "Espectando a {name}" +
  // photo mini-hud (spectate.js) with the EXACT #gq-hint/input real
  // non-active players already see, instead of a separate custom banner.
  // enable=false undoes it (leaving #gq-hint/.gq-guess-row hidden again, the
  // default globequizSpectatorEnter leaves them in for every other case).
  window.globequizSpectatorSetupGroupTurnsSharedView = function (enable) {
    const hintEl = document.querySelector('.gq-hint');
    const guessRow = document.querySelector('.gq-guess-row');
    const input = document.getElementById('gq-guess-input');
    const btn = document.getElementById('gq-guess-btn');
    // Real waiting players never see their OWN #gq-hint/.gq-guess-row until
    // their 3-2-1-GO actually ends (initGlobeQuiz hides them synchronously,
    // runGqPregameCountdown's onDone reveals them — see its own comment).
    // Showing them here unconditionally on enable=true left the spectator's
    // mirror visible THROUGH the roulette/3-2-1-GO (the reported "la tabla
    // de escribir esta disponible desde la cuenta regresiva... en el
    // 3-2-1-GO no deberia de estar") — kept hidden here regardless of
    // `enable`; globequizSpectatorSetGroupTurnsWaitingFor (below) is what
    // actually reveals them, at the exact moment a real turn is known,
    // together with the "Esperando respuesta de..." text.
    if (hintEl) hintEl.style.display = 'none';
    if (guessRow) {
      guessRow.style.display = 'none';
      guessRow.classList.toggle('gq-locked', !!enable);
    }
    if (input) {
      input.disabled = !!enable;
      input.value = '';
      // NOT t('globequiz.inputPh') ("Escribe un país...") — that's an
      // INVITATION to type, meaningless for a spectator who can't. Left
      // blank until the first real 'ttyping'/'tturn' fills it in (the
      // reported "el escribe un país que sale desde el inicio").
      input.placeholder = '';
    }
    if (btn) btn.classList.toggle('gq-disabled', !!enable);
    // #gq-hint starts blank too — until the first 'troulette'/'tturn'
    // resolves who actually has the turn, showing "Esperando respuesta de
    // Alguien..." was a worse default than nothing (the reported "obtiene
    // el mensaje default... y no 'Esperando respuesta de tal' de frente").
    if (enable && hintEl) hintEl.textContent = '';
    // #gq-spec-turn/#gq-spec-typing are the 1v1/solo spectator's OWN turn
    // banner + typing bubble (centered ABOVE the guess row, see their
    // comment in play/index.html) — this shared-board view already covers
    // the exact same information via #gq-hint/the disabled input itself, so
    // showing both at once left the spectator with TWO "who's typing what"
    // boxes stacked on screen. Reset/hidden here regardless of enable — this
    // view never uses them.
    if (typeof window.globequizSpectatorSetupTurnsUI === 'function') window.globequizSpectatorSetupTurnsUI();
    // #gq-group-watch-typing-row is the REAL-TIME "por rapidez" per-member
    // watch banner (see _gqGroupShowWatchBanner/globequizSpectatorShowGroupTyping)
    // — it sits ABOVE #gq-hint (bottom:15cqmin vs 13cqmin, see style.css) and
    // is styled identically to #gq-guess-input, so it read as a SECOND
    // "Escribe un país..." box floating above the real one. It leaks in here
    // because the generic per-member POV-switch/'gqguesses' code in
    // spectate.js calls globequizSpectatorSetGroupTypingText (note: no
    // "Turns" in the name — a DIFFERENT function from
    // globequizSpectatorSetGroupTurnsTypingText above) without checking the
    // mode (the reported "sale DOS lugares de escribir... el de arriba en el
    // centro" — confirmed from a screenshot to be THIS element, not
    // #gq-spec-turn/#gq-spec-typing). Force-hidden here as a hard guarantee.
    if (enable && typeof window.globequizSpectatorHideGroupTyping === 'function') window.globequizSpectatorHideGroupTyping();
  };
  // Same "Esperando respuesta de {name}..." text real waiting players get
  // from _gqPaintGroupTurnBanner — this spectator resolves the name itself
  // (GroupSpectate's own roster, see spectate.js) since it never ran that
  // function's _gqGroupResolveName lookup.
  window.globequizSpectatorSetGroupTurnsWaitingFor = function (name) {
    const hintEl = document.getElementById('gq-hint');
    if (hintEl) {
      hintEl.textContent = t('gq.waitingTurnFor', { name: name || 'Alguien' });
      // This is the exact moment a real turn is actually known — reveal the
      // hint AND the locked input TOGETHER here (see
      // globequizSpectatorSetupGroupTurnsSharedView's own comment: both stay
      // hidden through the roulette/3-2-1-GO otherwise, same as real waiting
      // players' own screen).
      hintEl.style.display = '';
    }
    const guessRow = document.querySelector('.gq-guess-row');
    if (guessRow) guessRow.style.display = '';
  };
  // GROUP "por turnos" GroupSpectate ONLY: focuses the shared globe on the
  // round's winning country — the same reveal a real winner's own client
  // shows via showWin(), which this spectator never runs (it never
  // guesses). Deliberately separate from globequizSpectatorResolvePick:
  // that one is the 1v1/solo POV mirror, and its _gqTurnsVariant-gated
  // branches would paint the wrong (elapsed-race) value onto #gq-timer-number,
  // which THIS shared board uses for the per-turn countdown instead (the
  // reported "no se tpea al país correcto cuando lo adivinan").
  window.globequizSpectatorRevealGroupTurnsCountry = function (countryName, iso2) {
    if (!countryName && !iso2) return;
    let country = countryByName.get(normalize(countryName || ''));
    // Fallback by iso2 — same fix as the 1v1 win handler above
    // (globequizSpectatorShowGroupResult): countryByName's keys are
    // normalized EN/ES aliases, so a name that doesn't match any of them
    // exactly (accents/edge cases) left `country` null and silently skipped
    // the reveal entirely (the reported "a veces no se pone en verde el
    // país ganador cuando alguien ve al otro rival").
    if (!country && iso2 && countries) {
      country = countries.find(c => c.iso2 === iso2) || null;
    }
    if (!country) return;
    solved = true;
    dailyCountry = country;
    drawTexture();
    stopAutoRotate();
    focusOnCountry(country);
  };
  // Same spot a real waiting player's own placeholder swaps to (see
  // globequizShowOpponentTyping/_gqTurnsShowTyping) — "lo que escribe en
  // vivo" below the "Esperando respuesta de..." line, on the disabled input
  // itself rather than a separate speech-bubble element.
  window.globequizSpectatorSetGroupTurnsTypingText = function (text) {
    const input = document.getElementById('gq-guess-input');
    if (!input) return;
    // NOT t('globequiz.inputPh') ("Escribe un país...") when there's no live
    // typing to show — same reasoning as globequizSpectatorSetupGroupTurnsSharedView's
    // own blank default: that's an INVITATION to type, meaningless for a
    // spectator. This runs on every turn hand-off ('tturn' clears the
    // previous typer's text) — falling back to the placeholder here
    // silently reintroduced it right after the setup function's own blank
    // default (the reported "el 'escribe un país' sigue saliendo en el
    // espectador").
    input.placeholder = (text || '').trim();
  };

  // "Por turnos" ONLY: live preview of whichever side is currently typing —
  // same live-typing broadcast the real (waiting) opponent sees inside their
  // own disabled input (placeholder swapped for their live keystrokes, see
  // globequizShowOpponentTyping) — shown here as a standalone "speech
  // bubble" below the turn banner instead, since a spectator has no input of
  // their own to repurpose. Unlike the real opponent's input, this bubble
  // never hides: with no text yet (nobody typed this turn, or it's a fresh
  // turn) it just falls back to the same placeholder.
  window.globequizSpectatorShowTyping = function (text) {
    const el = document.getElementById('gq-spec-typing');
    if (!el) return;
    const trimmed = (text || '').trim();
    el.textContent = trimmed || t('globequiz.inputPh');
    el.classList.add('gq-spec-typing-show');
  };

  window.globequizSpectatorShowPregame = function (payload) {
    if (_gqSpecTimerInterval) { clearInterval(_gqSpecTimerInterval); _gqSpecTimerInterval = null; }
    _gqStopTurnTimer();
    _gqSpecResetPanel();
    // GROUP tiempo real tags its pregame payload with round/totalRounds
    // (see _gqGroupBeginRound/initGlobeQuiz's window._specReportPregame) —
    // sync the "Ronda N/N" badge from it right away, DURING the 3-2-1-GO,
    // instead of waiting for the 'round' broadcast that only arrives once
    // it ends (the reported "spectator doesn't see Ronda 1/5 during the
    // 3-2-1-GO" / "starting round 2/5, spectator still shows 1/5"). Also
    // clears the typed-text cache/UI for the new round, same reason as
    // isNewRound's gqTyping reset in spectate.js — a pregame IS always a
    // new round starting.
    if (payload && typeof payload.round === 'number') {
      _gqGroupRound = payload.round;
      _gqGroupRounds = payload.totalRounds;
      // "Por turnos" desempate: propagado desde el jugador real (ver
      // _gqTurnsIsTiebreak/_specReportPregame) — un espectador nunca corre
      // _gqTurnsCloseRound por sí mismo, así que sin esto seguía mostrando
      // "Ronda N/N" durante la ronda extra en vez de "Ronda Final".
      _gqTurnsIsTiebreak = !!payload.isTiebreak;
      _gqGroupUpdateRoundBadge();
      if (typeof window.globequizSpectatorSetGroupTypingText === 'function') window.globequizSpectatorSetGroupTypingText('');
    }
    // Clears the PREVIOUS round's guesses/dailyCountry (and redraws the
    // globe) NOW, hidden behind this same 3-2-1-GO overlay — real players'
    // own globe is reset (rotation/zoom back to base) BEFORE their 3-2-1-GO
    // even starts (see _gqTurnsBeginRound's roulette callback in this same
    // file), so they never see it happen. globequizSpectatorShowRound below
    // used to be the ONLY place this ran, right when the countdown ends and
    // the globe is fully visible again — the spectator watched the board
    // visibly snap/reset at that exact moment (the reported "reinicia la
    // animacion de globo al culmino del 3-2-1-GO"). Left in ShowRound too,
    // as a harmless no-op safety net for a spectator who reconnects mid-
    // round and never saw this pregame.
    window.globequizSpectatorResetForNewPov();
    // The real player cuts the menu music as soon as they enter and stays
    // silent through the whole 3-2-1 (see initGlobeQuiz, playMusic(null)
    // before runGqPregameCountdown) — no audio was touched at any point of
    // the GlobeQuiz spectator before (the reported "the music/sfx isn't
    // carried over").
    if (typeof playMusic === 'function') playMusic(null);
    // Same visual 3-2-1-GO (images/pop) + sfxCountdown the real player
    // sees/hears (runGqPregameCountdown, now reusable with elapsedMs) — the
    // reported "the 3 2 1 GO with coordinated sfx is missing".
    // payload.startedAt is the same instant the real player started THEIR
    // countdown (see _specReportPregame in initGlobeQuiz) — if the spectator
    // connects mid-way, it starts at the right number instead of always
    // from "3" (same criterion as citiesSpectatorShowPregame). Corrected by
    // window._specClockOffsetMs() since `startedAt` is stamped on the
    // PLAYER's own clock, which doesn't necessarily agree with ours (see the
    // long comment on _clockOffsetMs in spectate.js) — without it, a
    // spectator whose clock ran behind the player's saw the 3-2-1 skip
    // straight to "1-GO".
    const offset = typeof window._specClockOffsetMs === 'function' ? window._specClockOffsetMs() : 0;
    let elapsedMs = (payload && typeof payload.startedAt === 'number') ? (Date.now() - payload.startedAt + offset) : 0;
    if (elapsedMs < 0) elapsedMs = 0;
    runGqPregameCountdown(() => {}, elapsedMs);
  };

  // A single "round" per session — starts the local timer from
  // payload.startedAt (the same instant the real player saw their 3-2-1-GO
  // end), without needing per-second ticks from the broadcaster.
  // GROUP spectator only: switching POV with the arrows replays THIS SAME
  // 'round' phase for the newly watched member (see _resendState in
  // spectate.js) — solved/guesses/dailyCountry are the SAME module vars the
  // real player and the 1v1 spectator use, and they carried over from
  // whichever member was watched BEFORE (e.g. solved=true from someone who
  // already won), silently blocking globequizSpectatorSyncGuesses's `if
  // (solved) return` guard and leaving the globe on the wrong
  // country/rotation for the new target (the reported "switching POV, the
  // countries don't load or position correctly"). Exported so spectate.js
  // can call it before replaying the new member's cached guess history.
  window.globequizSpectatorResetForNewPov = function () {
    solved = false;
    guesses = [];
    dailyCountry = null;
    drawTexture();
    renderGuessList();
  };

  // GROUP spectator only: replays the newly watched member's ALREADY-made
  // guesses/win for the current round, INCLUDING camera positioning — unlike
  // globequizSpectatorSyncGuesses's bulk catch-up path (built for a brand
  // new spectator joining mid-match, see its own comment), which never
  // focuses the globe or stops the base auto-rotate for "por rapidez" (that
  // mode normally gets its live per-guess focus from resolvePick instead,
  // one guess at a time) — used bare, a POV switch left the globe spinning
  // at the generic base view/rotation regardless of what the newly watched
  // member had already done (the reported "rotating to another POV forces
  // the base spin animation and initial globe position"). gq is
  // {guesses, solved} from GroupSpectate.getGqState(uid).
  window.globequizSpectatorReplayGroupState = function (gq) {
    solved = false; guesses = []; dailyCountry = null;
    if (gq && gq.solved) {
      if (typeof window.globequizSpectatorResolvePick === 'function') {
        window.globequizSpectatorResolvePick({ win: true, countryName: gq.solved.countryName, iso2: gq.solved.iso2 });
      }
      return;
    }
    const list = (gq && gq.guesses) || [];
    guesses = list.slice();
    drawTexture();
    renderGuessList();
    if (list.length > 0) {
      stopAutoRotate();
      const last = list[list.length - 1];
      const country = countryByName.get(normalize(last.name || ''));
      if (country) focusOnCountry(country);
    } else {
      startAutoRotate();
    }
  };

  // GROUP spectator only: mirrors the shared post-solve 20s countdown real
  // still-playing members see (.gq-countdown-widget/#gq-timer-number, see
  // _gqGroupStartCountdown) — driven purely by the broadcast `endsAt` wall
  // clock, with its OWN interval/state so it never touches the real
  // player-only _gqGroupCountdownEndsAt or calls _gqGroupCloseRound() (round
  // closing for a spectator is just "the next round/pregame arrives",
  // already handled elsewhere). Deliberately NOT tied to _gqGroupActive.
  let _gqSpecCountdownTimer = null;
  let _gqSpecCountdownLastSec = null;
  window.globequizSpectatorShowCountdown = function (endsAt) {
    if (typeof endsAt !== 'number') return;
    if (_gqSpecCountdownTimer) clearInterval(_gqSpecCountdownTimer);
    _gqSpecCountdownLastSec = null;
    _gqSetCountdownIconRed(false);
    document.querySelector('.gq-countdown-widget')?.style.removeProperty('display');
    const tick = () => {
      if (typeof window._specGqKeepAlive === 'function') window._specGqKeepAlive();
      const secondsLeft = Math.ceil((endsAt - Date.now()) / 1000);
      if (secondsLeft === _gqSpecCountdownLastSec) return;
      _gqSpecCountdownLastSec = secondsLeft;
      _gqGroupPaintCountdown(secondsLeft);
      if (typeof pulseCountdown === 'function') pulseCountdown();
      if (secondsLeft > 0 && secondsLeft <= 5) _gqSetCountdownIconRed(true);
      // Freezes at 0 (like the real still-playing player, see
      // _gqGroupTickCountdown's comment), then chains straight into the
      // times-up flash + round-result table — same beat every real member
      // goes through in _gqGroupCloseRound/_gqGroupShowTimesUp, just without
      // any of the real scoring/round-advance side effects (a spectator
      // learns "the round moved on" from the next round/pregame broadcast
      // instead). Without this the round-result table was skipped entirely
      // for external spectators (the reported "don't leave the results
      // table out").
      if (secondsLeft <= 0) {
        clearInterval(_gqSpecCountdownTimer); _gqSpecCountdownTimer = null;
        // The widget itself was left displayed (frozen at "0") through the
        // whole times-up flash + round-result table, only hidden once the
        // NEXT round began (globequizSpectatorShowRound) — for a real
        // player the full-screen times-up overlay covers it either way, but
        // for the external spectator it stayed visibly stuck on screen
        // (the reported "the countdown takes a while to be removed, it
        // stays in place"). Hide it right here instead of waiting.
        document.querySelector('.gq-countdown-widget')?.style.setProperty('display', 'none');
        window.globequizSpectatorShowRoundResult();
      }
    };
    tick();
    _gqSpecCountdownTimer = setInterval(tick, 250);
  };
  window.globequizSpectatorHideCountdown = function () {
    if (_gqSpecCountdownTimer) { clearInterval(_gqSpecCountdownTimer); _gqSpecCountdownTimer = null; }
    _gqSpecCountdownLastSec = null;
    document.querySelector('.gq-countdown-widget')?.style.setProperty('display', 'none');
  };

  // GROUP spectator only: mirrors _gqGroupShowTimesUp + _gqGroupShowRoundResultTable
  // for an external spectator — same 1.8s+0.4s times-up flash, then the
  // country reveal + ranked list for 10s. Built from GroupSpectate's OWN
  // already-live-tracked members/scores (cumulative totals, identical to
  // what _gqGroupShowRoundResultTable shows real players — see its own
  // comment) instead of the real-player-only window._lobbyMembers/
  // _gqGroupTotal, which this client never populates. The revealed country
  // comes from `dailyCountry`, which globequizSpectatorReplayGroupState/
  // resolvePick already set to the round's winner's country as soon as
  // ANYONE solved (spoiler-safe: never set before a win).
  let _gqSpecResultTimer = null;
  window.globequizSpectatorShowRoundResult = function () {
    const buildTable = () => {
      const screen = document.getElementById('gq-round-result-screen');
      const list   = document.getElementById('gq-round-result-list');
      const tag    = document.getElementById('gq-round-result-tag');
      if (!screen || !list || !window.GroupSpectate) return;
      const members = window.GroupSpectate.getMembers().slice().sort((a, b) => (b.score || 0) - (a.score || 0));
      if (tag) tag.textContent = t('globequiz.groupRoundBadge', { round: _gqGroupRound, total: _gqGroupRounds });
      // `dailyCountry` is only ever set on THIS client when the CURRENTLY
      // WATCHED member's own win was replayed (resolvePick/
      // globequizSpectatorReplayGroupState) — if the round closed while
      // watching someone who never won it, it's still null even though the
      // room's real winner (anyone) already revealed it. Fall back to
      // whichever member's cached win (see the 'ganswer' handler in
      // spectate.js, kept for EVERY solver regardless of POV) has it.
      let revealCountry = dailyCountry;
      if (!revealCountry && window.GroupSpectate.getGqState) {
        for (const m of members) {
          const gq = window.GroupSpectate.getGqState(m.id);
          if (gq && gq.solved && gq.solved.countryName) {
            revealCountry = countryByName.get(normalize(gq.solved.countryName));
            if (revealCountry) break;
          }
        }
      }
      const countryLabel = document.getElementById('gq-round-result-country-label');
      const countryFlag  = document.getElementById('gq-round-result-flag');
      if (countryLabel) countryLabel.textContent = revealCountry ? t('globequiz.hintCorrect', { name: displayName(revealCountry) }) : '';
      if (countryFlag) {
        const flagUrl = revealCountry && revealCountry.iso2 && window.flagUrlForCountryCode ? window.flagUrlForCountryCode(revealCountry.iso2) : '';
        countryFlag.src = flagUrl || '';
        countryFlag.style.display = flagUrl ? '' : 'none';
      }
      const medals = ['🥇', '🥈', '🥉'];
      list.innerHTML = '';
      members.forEach((m, i) => {
        const row = document.createElement('div');
        row.className = 'gq-round-result-row';
        row.innerHTML =
          `<span class="gq-round-result-pos">${medals[i] || (i + 1)}</span>` +
          `<div class="gq-round-result-avatar-wrap"><img class="gq-round-result-avatar" src="${m.avatar || 'images/profilepic/ppdefault.png'}" draggable="false" oncontextmenu="return false"></div>` +
          `<span class="gq-round-result-name">${m.name || '?'}</span>` +
          `<span class="gq-round-result-score">${Math.round(m.score || 0).toLocaleString()}</span>`;
        window.CustomizeAssets?.applyFrame(row.querySelector('.gq-round-result-avatar-wrap'), m.frameCode || '0001');
        list.appendChild(row);
      });
      screen.style.display = 'flex';
      if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
      const bar  = document.getElementById('gq-round-result-bar');
      const cdEl = document.getElementById('gq-round-result-cd');
      const DURATION_MS = 10000;
      const start = Date.now();
      if (bar) { bar.style.transition = 'none'; bar.style.width = '100%'; void bar.offsetWidth; }
      if (cdEl) cdEl.textContent = '10';
      // Double rAF (not a single one): `screen.style.display` just flipped
      // from 'none' to 'flex' a few lines up, in this SAME synchronous
      // block — a single requestAnimationFrame can still land before the
      // browser has actually laid out/painted the newly-visible screen at
      // all, so the "100%, no transition" state and the "0%, linear
      // transition" state below get coalesced into one paint with no
      // visible animation in between (the reported "the round-result timer
      // bar doesn't load properly for the spectator" — it just snaps to
      // empty). The forced reflow above closes most of that gap already;
      // this second rAF is the belt-and-suspenders fix for whatever's left.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (bar) { bar.style.transition = `width ${DURATION_MS}ms linear`; bar.style.width = '0%'; }
      }));
      clearInterval(_gqSpecResultTimer);
      _gqSpecResultTimer = setInterval(() => {
        if (typeof window._specGqKeepAlive === 'function') window._specGqKeepAlive();
        const remain = Math.ceil((DURATION_MS - (Date.now() - start)) / 1000);
        if (cdEl) cdEl.textContent = Math.max(0, remain);
        if (remain <= 0) { clearInterval(_gqSpecResultTimer); _gqSpecResultTimer = null; screen.style.display = 'none'; }
      }, 200);
    };
    // Same rule as the real players' own _gqGroupCloseRound: this "TIMES UP"
    // flash ALWAYS plays, regardless of whether the currently watched
    // member solved or not — skipping it for a solve desynced the
    // spectator's round transition from the rest of the room (they reached
    // the round-result table/next round ~2.2s early, the reported "watching
    // whoever's still missing solve skips the times-up animation entirely
    // and shows the results panel/next round early"). The clock/shake CARD
    // effect is the only genuinely conditional piece, and it's handled
    // separately over its own dedicated 'gq' t:'ranout' signal (see the
    // onGq handler in spectate.js) — never gated by this same flash.
    // On the LAST round, real players still see this SAME "TIMES UP" flash
    // (it's unconditional, see _gqGroupCloseRound) but then skip straight to
    // the FINAL ranking panel instead of the per-round table (isLastRound
    // there) — the spectator's own local mirror didn't know this was the
    // last round and built the per-round table anyway, so it flashed
    // briefly (country reveal + per-round ranking, camera mid-zoom from
    // focusOnCountry) right before the incoming 'final' postgame swapped it
    // out for the real "GANA X" panel a beat later (the reported "tries to
    // show the 'country was X' panel first, then GANA X, all zoomed and
    // broken"). Mirror the same branch: flash still plays, but wait for
    // that real postgame instead of building the table.
    const isLastRound = _gqGroupRound >= _gqGroupRounds;
    _gqGroupShowTimesUp(isLastRound ? () => {} : buildTable);
  };
  // Closes the round-result mirror early if a genuinely new round for the
  // watched member arrives before its own 10s finishes (e.g. a POV switch
  // right as the room moves on) — see globequizSpectatorShowRound's
  // isGroupRound branch.
  window.globequizSpectatorHideRoundResult = function () {
    clearInterval(_gqSpecResultTimer); _gqSpecResultTimer = null;
    const screen = document.getElementById('gq-round-result-screen');
    if (screen) screen.style.display = 'none';
  };

  window.globequizSpectatorShowRound = function (payload) {
    // The round is the signal that the 3-2-1-GO already ended on the real
    // side — in case it arrives while the local mirror
    // (globequizSpectatorShowPregame) is still animating (network latency),
    // it's cut here so it isn't left stuck on screen covering the globe.
    abortGqPregameCountdown();
    window.globequizSpectatorResetForNewPov();
    _gqSpecResetPanel();
    // GROUP tiempo real tags its round payload with round/totalRounds (see
    // _gqGroupBeginRound/initGlobeQuiz's window._specReportRound) — real
    // group players NEVER show an ascending elapsed clock (the round is
    // untimed until someone solves, see .gq-countdown-widget display:none in
    // _gqGroupBeginRound), only the shared 20s countdown AFTER a solve. The
    // external spectator was running the 1v1-style ascending tick here
    // unconditionally (the reported "the timer still shows"). Show the same
    // "Ronda N/N" badge the real players see instead.
    const isGroupRound = payload && typeof payload.round === 'number';
    if (isGroupRound) {
      _gqGroupRound = payload.round;
      _gqGroupRounds = payload.totalRounds;
      _gqTurnsIsTiebreak = !!payload.isTiebreak; // see globequizSpectatorShowPregame's comment
      window.globequizSpectatorHideCountdown();
      window.globequizSpectatorHideRoundResult();
      _gqGroupUpdateRoundBadge();
    }
    _gqSpecStartedAt = (payload && typeof payload.startedAt === 'number') ? payload.startedAt : Date.now();
    if (_gqSpecTimerInterval) clearInterval(_gqSpecTimerInterval);
    if (_gqSpecCardInterval) clearInterval(_gqSpecCardInterval);
    // "Por turnos" repurposes #gq-timer-number for its own 15→0 per-turn
    // countdown (see _gqTickTurnTimer) and the small card for km/attempts
    // (not time) — this elapsed-race clock doesn't apply and would overwrite
    // both with the wrong kind of value. The turn indicator
    // (globequizSpectatorSetTurn) covers what a "Por turnos" spectator needs
    // to know instead; a live per-turn countdown mirror is deliberately
    // skipped here (same cosmetic/low-value call as the roulette animation).
    // GROUP tiempo real: same reasoning, see isGroupRound above.
    if (!_gqTurnsVariant && !isGroupRound) {
      // #gq-timer-number is the BIG timer — the real player paints it with
      // updateTimerDisplay() as whole seconds (String(wholeSec)), never "S:CC"
      // (that's only the small leaderboard card's format, formatGqCardTime).
      // Using formatGqCardTime here showed something like "142:15" instead of
      // "142" (the reported bug).
      const tick = () => {
        const elapsedMs = Math.max(0, Date.now() - _gqSpecStartedAt);
        const el = document.getElementById('gq-timer-number');
        if (el) el.textContent = String(Math.floor(elapsedMs / 1000));
      };
      tick();
      _gqSpecTimerInterval = setInterval(tick, 1000);
      // Small card (#gq-lb-player-time, "S:CC" format): the real player runs
      // it on ITS OWN 30ms interval (gqCardInterval), separate from the big
      // 1s timer — so it's actually seen running in hundredths instead of
      // jumping by whole seconds. It's on its own interval here too (not
      // inside `tick`, which only runs 1x/sec) so it behaves the SAME as in
      // the normal player.
      const cardTick = () => {
        if (typeof formatGqCardTime !== 'function') return;
        const t = formatGqCardTime(Math.max(0, Date.now() - _gqSpecStartedAt));
        // Two-line VS layout (globequizSpectatorSetOpponent) or the plain card.
        const meVal = document.getElementById('gq-lb-player-time-val') || document.getElementById('gq-lb-player-time');
        if (meVal) meVal.textContent = t;
        // The rival shares the same clock (both started by the same 3-2-1).
        const oppTime = document.getElementById('gq-lb-vsopp-time');
        if (oppTime) oppTime.textContent = t;
      };
      cardTick();
      _gqSpecCardInterval = setInterval(cardTick, 30);
    }
    // The real gameloop only starts when the 3-2-1-GO ends (onDone of
    // runGqPregameCountdown) — this 'round' is exactly that signal (a single
    // round per session, always after the pregame), so here is the right
    // moment to turn it on. playMusic doesn't restart the loop if the same
    // track is already playing (see playMusicHTML), so it breaks nothing if
    // this repeats ('round' resend on reconnect).
    if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
  };

  // payload.win=true on the winning guess (the target country is never sent
  // BEFORE this moment — see _specReportRound with no countryName). The
  // other guesses do carry the country the friend typed (not a spoiler of
  // the target, it's what makes watching the list live interesting).
  window.globequizSpectatorResolvePick = function (payload) {
    if (!payload) return;
    // "Por turnos": a wrong guess (either side) already arrives through the
    // 'gqguesses' full-resync (globequizSpectatorSyncGuesses, which ALSO now
    // does the live focus/sfx/card-update work — see there) — this 'answer'
    // broadcast fires for wrong guesses too (both variants), but for turns
    // it would just duplicate the same entry a second time. The WIN case
    // below is untouched: it's the only thing turns mode still needs from
    // this path (the shared list has no notion of "who won").
    if (_gqTurnsVariant && !payload.win) return;
    // The real player plays sfxCheck on EVERY submit (confirm click/Enter,
    // see playCheckSfx in initGlobeQuiz) — not just on the final correct one.
    if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    // Same moment as the real player's submitGuess(): any guess (win or
    // not) stops the globe's auto-rotation.
    stopAutoRotate();
    if (payload.win) {
      if (_gqSpecTimerInterval) { clearInterval(_gqSpecTimerInterval); _gqSpecTimerInterval = null; }
      if (_gqSpecCardInterval) { clearInterval(_gqSpecCardInterval); _gqSpecCardInterval = null; }
      _gqStopTurnTimer();
      // Same moment as the real player's submitGuess(): cuts the gameloop
      // (silence) and plays sfxBonus — sfxPostgame only comes in 2s later,
      // with globequizSpectatorShowPostgame's banner.
      if (typeof playMusic === 'function') playMusic(null);
      if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); }
      // The match is over — the turn banner/locked input have nothing left
      // to say.
      if (_gqTurnsVariant) window.globequizSpectatorSetupTurnsUI?.(false);
      // "Por turnos" doesn't use the elapsed-race clock at all (#gq-timer-number
      // is its 15→0 per-turn countdown, the small card shows km/attempts) —
      // painting it here would show a meaningless race time.
      if (!_gqTurnsVariant) {
        const timerEl = document.getElementById('gq-timer-number');
        if (timerEl) timerEl.textContent = String(Math.floor((payload.elapsedMs || 0) / 1000));
        // Freezes the small card at the same final value as the real player
        // (see gqCardEl.textContent = formatGqCardTime(gqFinalElapsedMs) in
        // submitGuess) instead of leaving it at whatever cardTick last
        // painted.
        if (typeof formatGqCardTime === 'function') {
          const _f = formatGqCardTime(payload.elapsedMs || 0);
          const meVal2 = document.getElementById('gq-lb-player-time-val') || document.getElementById('gq-lb-player-time');
          if (meVal2) meVal2.textContent = _f;
          const oTime2 = document.getElementById('gq-lb-vsopp-time');
          if (oTime2) oTime2.textContent = _f;
        }
      }
      // solved/dailyCountry are the SAME module variables the real player
      // uses — with these set, drawTexture()/updateOutlines() already paint
      // the correct country green with its outline, and showWin() builds
      // exactly the same message/confetti the player themselves sees (this
      // used to be rebuilt by hand here, duplicating that HTML with
      // different text — "correctBadge" instead of the name). Without
      // updateHint() — the spectator doesn't show the "hotter/colder" hint.
      solved = true;
      dailyCountry = countryByName.get(normalize(payload.countryName || ''));
      // Fallback by iso2 — countryByName's keys are normalized ENGLISH/
      // Spanish names, but a name that doesn't match ANY of those aliases
      // exactly (accents/edge cases) silently left dailyCountry null, which
      // skipped focusOnCountry/showWin ENTIRELY below (guarded by `if
      // (dailyCountry)`) — the reported "the POV doesn't get TP'd to the
      // correct country and no confetti shows" on a real win.
      if (!dailyCountry && payload.iso2 && countries) {
        dailyCountry = countries.find(c => c.iso2 === payload.iso2) || null;
      }
      if (dailyCountry) {
        drawTexture();
        focusOnCountry(dailyCountry);
        showWin();
      }
      return;
    }
    const country = countryByName.get(normalize(payload.name || ''));
    guesses.push({ name: payload.name, km: payload.km, dir: payload.dir, color: payload.color });
    // "Por rapidez" ONLY — see the matching comment in spectate.js's onAnswer
    // for why this is skipped for "Por turnos" (that bottom slot holds the
    // attempts count there, not a km distance).
    if (!_gqTurnsVariant && typeof payload.km === 'number' && typeof window.globequizSpectatorSetFriendGuess === 'function') {
      window.globequizSpectatorSetFriendGuess(payload.km);
    }
    drawTexture();
    renderGuessList();
    if (country) focusOnCountry(country);
  };

  // The spectated friend LOST — the RIVAL guessed right first. Mirrors
  // globequizVsShowLoss (the real loser's path): reveal the country WITHOUT
  // the win celebration + the same game-over overlay the real loser sees.
  // payload carries countryName/iso2 (from the rival's win broadcast).
  window.globequizSpectatorShowLoss = function (payload) {
    if (solved) return;
    solved = true;
    stopAutoRotate();
    if (_gqSpecTimerInterval) { clearInterval(_gqSpecTimerInterval); _gqSpecTimerInterval = null; }
    if (_gqSpecCardInterval) { clearInterval(_gqSpecCardInterval); _gqSpecCardInterval = null; }
    _gqStopTurnTimer();
    // The match is over — the turn banner/locked input have nothing left to
    // say.
    if (_gqTurnsVariant) window.globequizSpectatorSetupTurnsUI?.(false);
    dailyCountry = countryByName.get(normalize((payload && payload.countryName) || ''));
    drawTexture();
    renderGuessList();
    if (dailyCountry) focusOnCountry(dailyCountry);
    if (typeof playMusic === 'function') playMusic(null);
    if (typeof sfxTimesUp !== 'undefined' && typeof sfxPlay === 'function') { sfxTimesUp.currentTime = 0; sfxPlay(sfxTimesUp); }
    // Same game-over overlay + timing the real loser gets (_handleGqOpponentWin
    // in vs.js) before the result panel comes in ~2s later.
    const animMs = window._GQ_VS_ANIM_MS || 2000;
    const goOverlay = document.getElementById('powerquit-overlay');
    if (goOverlay) {
      goOverlay.style.display = 'flex';
      goOverlay.classList.remove('timeup-out');
      goOverlay.classList.add('timeup-in');
      setTimeout(() => {
        goOverlay.classList.remove('timeup-in');
        goOverlay.classList.add('timeup-out');
        setTimeout(() => { goOverlay.style.display = 'none'; goOverlay.classList.remove('timeup-out'); }, 400);
      }, Math.max(0, animMs - 400));
    }
  };

  // "Por turnos" ONLY: recomputes the friend/opponent km+attempts cards
  // straight from the (role-tagged) shared guesses list — the authoritative
  // source, instead of separate running counters, so a spectator joining
  // mid-match or catching a resync is never out of step with what the real
  // players see on their own cards.
  // "Por turnos" ONLY: bumps one side's card straight from the live
  // 'gqturnguess' broadcast (see spectate.js) the instant a guess happens —
  // independent of (and faster than) the full-list resync
  // (_gqSpecUpdateTurnsCards/globequizSpectatorSyncGuesses below), which
  // still runs too and stays the authoritative source for someone joining
  // mid-match. Skipped on a timeout (no km to record, no extra attempt).
  function _gqSpecBumpTurnCard(isFriend, km) {
    const kmEl = document.getElementById(isFriend ? 'gq-lb-player-time-val' : 'gq-lb-vsopp-time')
      || (isFriend ? document.getElementById('gq-lb-player-time') : null);
    const attEl = document.getElementById(isFriend ? 'gq-lb-player-km' : 'gq-lb-vsopp-km');
    if (isFriend) {
      if (typeof km === 'number') _gqSpecFriendBestKm = Math.min(_gqSpecFriendBestKm, km);
      if (kmEl) kmEl.textContent = formatGqKm(isFinite(_gqSpecFriendBestKm) ? _gqSpecFriendBestKm : null);
      if (attEl) attEl.textContent = String((parseInt(attEl.textContent, 10) || 0) + 1);
    } else {
      if (typeof km === 'number') _gqSpecOppBestKm = Math.min(_gqSpecOppBestKm, km);
      if (kmEl) kmEl.textContent = formatGqKm(isFinite(_gqSpecOppBestKm) ? _gqSpecOppBestKm : null);
      if (attEl) attEl.textContent = String((parseInt(attEl.textContent, 10) || 0) + 1);
    }
    // The real players reorder their two cards by whoever's currently
    // closest (see positionGqVsLeaderboard) on every guess — without this,
    // the spectator's numbers updated but the cards never swapped places to
    // match (the reported "the position of the cards doesn't update").
    _gqSpecPositionVsLeaderboard(true);
  }
  window.globequizSpectatorBumpTurnCard = function (isFriend, km) { _gqSpecBumpTurnCard(!!isFriend, km); };

  // "Por turnos" ONLY: the single LIVE source of truth for a spectator — a
  // real guess (never a timeout) from either side, straight off the
  // 'gqturnguess' broadcast (see spectate.js's onGqTurnGuess). Pushes it
  // into the shared list AND bumps the card in the same call, instead of
  // waiting on the separate 'gqguesses' full-resync (which arrives a beat
  // later over its own broadcast and, if it's ever dropped/delayed, left
  // both the list and the cards stuck — the reported "the cards don't
  // update live like the real players see"). 'gqguesses' still runs (see
  // globequizSpectatorSyncGuesses) but now only matters for someone joining
  // mid-match, not for keeping already-connected spectators in sync.
  window.globequizSpectatorReceiveTurnGuess = function (payload, isFriend) {
    if (!payload || !payload.name) return;
    guesses.push({ name: payload.name, km: payload.km, dir: payload.dir, color: payload.color, role: payload.role });
    if (guesses.length > 0) stopAutoRotate();
    drawTexture();
    renderGuessList();
    const country = countryByName.get(normalize(payload.name || ''));
    if (country) focusOnCountry(country);
    // Same submit sfx the real player hears on every guess (see
    // globequizSpectatorResolvePick for "por rapidez") — this variant's live
    // route never went through resolvePick at all, so it never played.
    if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    if (typeof sfxSelect !== 'undefined' && typeof sfxPlay === 'function') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
    _gqSpecBumpTurnCard(!!isFriend, payload.km);
  };

  function _gqSpecUpdateTurnsCards(friendIsHost) {
    let friendBestKm = Infinity, oppBestKm = Infinity, friendCount = 0, oppCount = 0;
    guesses.forEach(g => {
      if (!g || !g.role) return; // no role = guess made before this field existed (shouldn't happen live)
      const isFriend = (g.role === 'host') === !!friendIsHost;
      if (isFriend) { friendCount++; if (typeof g.km === 'number') friendBestKm = Math.min(friendBestKm, g.km); }
      else { oppCount++; if (typeof g.km === 'number') oppBestKm = Math.min(oppBestKm, g.km); }
    });
    const friendKmEl = document.getElementById('gq-lb-player-time-val') || document.getElementById('gq-lb-player-time');
    const friendAttEl = document.getElementById('gq-lb-player-km');
    const oppKmEl = document.getElementById('gq-lb-vsopp-time');
    const oppAttEl = document.getElementById('gq-lb-vsopp-km');
    if (friendKmEl) friendKmEl.textContent = formatGqKm(isFinite(friendBestKm) ? friendBestKm : null);
    if (friendAttEl) friendAttEl.textContent = String(friendCount);
    if (oppKmEl) oppKmEl.textContent = formatGqKm(isFinite(oppBestKm) ? oppBestKm : null);
    if (oppAttEl) oppAttEl.textContent = String(oppCount);
    // Keep the shared best-km vars (read by _gqSpecPositionVsLeaderboard,
    // also used by the live _gqSpecBumpTurnCard path) in step with this
    // from-scratch recompute — otherwise a resync could correct the TEXT
    // while the cards' relative ORDER kept reflecting stale numbers.
    _gqSpecFriendBestKm = friendBestKm;
    _gqSpecOppBestKm = oppBestKm;
    _gqSpecPositionVsLeaderboard(true);
  }

  // Resend of ALL guesses already made — arrives on joining mid-match (see
  // reportGqGuesses in spectate.js) AND, for "Por turnos", on every single
  // guess too (see the _specReportGqGuesses calls in submitGuess/
  // globequizReceiveOpponentTurnGuess) since that variant's shared list has
  // no other live route once globequizSpectatorResolvePick bows out for it
  // (see the guard there). "Por rapidez" still only ever gets this on join —
  // its live guesses keep going through resolvePick as before, so the
  // isNewGuess focus/sfx below never fires for it.
  window.globequizSpectatorSyncGuesses = function (list, friendIsHost) {
    if (!Array.isArray(list) || solved) return; // already won — postgame/win rules, don't overwrite with a stale list
    const isNewGuess = _gqTurnsVariant && list.length > guesses.length;
    guesses = list.slice();
    if (guesses.length > 0) stopAutoRotate();
    drawTexture();
    renderGuessList();
    if (isNewGuess) {
      // Mirrors what globequizSpectatorResolvePick does live for "Por
      // rapidez" — without this the globe never re-centered on whichever
      // country was just tried (the reported "the globe doesn't position
      // itself when someone submits an input").
      const last = guesses[guesses.length - 1];
      const country = last && countryByName.get(normalize(last.name || ''));
      if (country) focusOnCountry(country);
      if (typeof sfxSelect !== 'undefined' && typeof sfxPlay === 'function') { sfxSelect.currentTime = 0; sfxPlay(sfxSelect); }
    }
    if (_gqTurnsVariant && typeof friendIsHost === 'boolean') _gqSpecUpdateTurnsCards(friendIsHost);
  };

  window.globequizSpectatorShowPostgame = function (payload) {
    if (_gqSpecTimerInterval) { clearInterval(_gqSpecTimerInterval); _gqSpecTimerInterval = null; }
    if (_gqSpecCardInterval) { clearInterval(_gqSpecCardInterval); _gqSpecCardInterval = null; }
    // The "S:CC · N attempts" banner (the reported "36:47 13 attempts") was
    // deliberately removed: the spectator end window is only a few seconds
    // now (see window._setPlaying(false) in submitGuess, which disconnects
    // the spectator shortly after this via the same generic "the player
    // stopped playing" mechanism), so it's no longer worth showing a summary
    // almost nobody gets to read. gq-win-msg (built in resolvePick) already
    // shows the guessed country, which is what matters.
    if (typeof playMusic === 'function' && typeof sfxPostgame !== 'undefined') playMusic(sfxPostgame);
  };

  window.globequizSpectatorHidePostgame = function () {
    const banner = document.getElementById('gq-spec-postgame-banner');
    if (banner) banner.style.display = 'none';
  };
})();
