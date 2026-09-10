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
  let countryByName = new Map();  // normalized -> country
  let dailyCountry = null;
  let guesses = [];               // [{name, km, dir, color}]
  let animatedGuessNames = new Set(); // rows that already played the entrance animation
  let solved = false;

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
    'St-Barthélemy', 'St-Martin', 'Sint Maarten', 'Curaçao', 'Aruba',
    'Cayman Is.', 'Turks and Caicos Is.', 'British Virgin Is.', 'U.S. Virgin Is.',
    'Saint Helena', // British territory, not a sovereign country
    'Falkland Is.', // Islas Malvinas — disputed territory, not a sovereign country
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
      // Stroke the same color as the fill: only seals the canvas's
      // antialiased seam against the base map, it's not the visible outline
      // (that's now the 3D vector line, see updateOutlines, which doesn't
      // pixelate on zoom).
      if (color) paintGeometry(c.geometry, color, color);
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
  function pickDailyCountry() {
    const idx = Math.floor(gqRand() * countries.length);
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
    if (lastStr === todayStr) return { streak, isNewDay: false }; // already counted today
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
  // ("hotter/colder" etc.) — on click, fills the input with that country and
  // retries the guess (this time it matches exactly).
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
      // Captured HERE, not in showEndgameModal (which runs 2s later via the
      // setTimeout) — otherwise those extra 2 seconds were added to the
      // displayed time.
      gqFinalElapsedMs = Math.max(0, Date.now() - gqTimerStart);
      stopTimer();
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
          if (typeof window._setPlaying === 'function') window._setPlaying(false);
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
    const g = { name: country.name, km, dir, color: distColor(km) };
    guesses.push(g);
    if (typeof window._specReportAnswer === 'function') {
      // VS 1v1: only km/dir, NEVER the typed country name (it would spoil the
      // area the opponent is trying) — the solo/spectator mode does get the
      // full detail (rebuilds the row with flag and all).
      const detail = window._vsActive
        ? { km: g.km, dir: g.dir }
        : { name: g.name, km: g.km, dir: g.dir, color: g.color };
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
    const el = document.getElementById('gq-timer-number');
    if (el) el.textContent = String(wholeSec);
    pulseCountdown();
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
    // VS 1v1: both cards (mine and the opponent's) run the SAME shared
    // timer (above, see globequizVsSetTime) — the km below is overwritten
    // separately by globequizVsUpdateOwnGuess/globequizSetVsOpponentGuess per
    // guess. No time-based reorder here (that's only for the daily friends
    // bar, see positionGqLeaderboard below).
    if (window._vsActive) { globequizVsSetTime(elapsedMs); return; }
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

  function formatGqKm(km) {
    return (km == null || !isFinite(km)) ? '—' : Math.round(km) + ' km';
  }
  // Time on top, last guess's km below — the usual `.lb-score`, but with two
  // of its own lines (gq-lb-vs-score, see style.css) instead of the single
  // value the solo/campaign mode uses. No closer/farther arrow (removed by
  // request: the raw km is enough).
  function gqVsScoreInnerHtml(timeId, kmId) {
    return '<span class="gq-lb-vs-time" id="' + timeId + '">0:00</span>'
      + '<span class="gq-lb-vs-km" id="' + kmId + '">—</span>';
  }

  window.globequizVsPrepareOpponentRow = function () {
    const bar = document.getElementById('gq-friends-bar');
    const playerEl = document.getElementById('gq-lb-player');
    if (!bar || !playerEl) return;
    bar.querySelectorAll('.lb-entry[data-gq-friend]').forEach(el => el.remove());
    gqVsOppBestKm = Infinity;
    gqVsMyBestKm = Infinity;
    gqVsWon = false;
    gqVsOppGuessCount = 0;
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
    const playerEl = gqLbElements.player, oppEl = gqLbElements.vsopp;
    if (!playerEl || !oppEl) return;
    const all = [{ id: 'player', km: gqVsMyBestKm }, { id: 'vsopp', km: gqVsOppBestKm }];
    all.sort((a, b) => a.km - b.km);
    const bottomOffset = (GQ_LB_WINDOW - all.length) * GQ_LB_ROW_H_CQMIN;
    if (!animate) { [playerEl, oppEl].forEach(el => { el.style.transition = 'none'; }); }
    all.forEach((p, rank) => { gqLbElements[p.id].style.top = (rank * GQ_LB_ROW_H_CQMIN + bottomOffset) + 'cqmin'; });
    if (!animate) {
      requestAnimationFrame(() => { [playerEl, oppEl].forEach(el => { el.style.transition = ''; }); });
    }
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
    const el = document.getElementById('gq-lb-player-km');
    // Shows the BEST km so far, not the just-typed guess's — otherwise a
    // guess worse than an earlier one "visually replaced" the closest
    // already achieved (the reported "it has to stay with the closest, not
    // whatever you pick next").
    if (el) el.textContent = formatGqKm(gqVsMyBestKm);
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
      guessCount: guesses.length + (gqVsWon ? 1 : 0),
      oppGuessCount: gqVsOppGuessCount,
      elapsedMs: gqFinalElapsedMs || (gqTimerStart ? Math.max(0, Date.now() - gqTimerStart) : 0),
    };
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
    // row with the friends-by-time logic below.
    if (window._vsActive) return;
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
    // Undo the own card's two-line layout (time/km) and remove the
    // opponent's row — otherwise the next SOLO match (which reuses the same
    // #gq-lb-player-time) would start with the VS HTML/class stuck on.
    const myScoreEl = document.getElementById('gq-lb-player-time');
    if (myScoreEl) { myScoreEl.classList.remove('gq-lb-vs-score'); myScoreEl.textContent = '0:00'; }
    document.getElementById('gq-lb-vsopp')?.remove();
  }
  window.globequizHardReset = globequizHardReset;
  window.gameStoppers = window.gameStoppers || [];
  window.gameStoppers.push(globequizHardReset);

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
      if (typeof window._specReportSplash === 'function') window._specReportSplash({ mode: 'globequiz' });
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
      if (btn2) btn2.addEventListener('click', () => { playCheckSfx(); submitGuess(); });
      if (input2) input2.addEventListener('keydown', (e) => { if (e.key === 'Enter') { playCheckSfx(); submitGuess(); } });
      // End-of-game panel confirm: same exit path as power (tear
      // everything down + the menu's typical entrance animation), just
      // without going through the "are you sure you want to quit?" popup
      // (you already finished the match, no need to confirm again).
      document.getElementById('gq-endgame-confirm')?.addEventListener('click', () => {
        const modal = document.getElementById('gq-endgame-modal');
        if (modal) modal.style.display = 'none';
        stopGqEndgameCountdown();
        document.getElementById('gq-quit-confirm')?.click();
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
      const startGqCountdown = () => {
        if (spinner) spinner.style.display = 'none';
        // Reports the 3-2-1 start so the spectator watches it live (see
        // globequizSpectatorShowPregame) — it used to live INSIDE
        // runGqPregameCountdown, which the spectator now also calls to SHOW
        // the countdown, not to re-broadcast it.
        if (typeof window._specReportPregame === 'function') {
          window._specReportPregame({ mode: 'globequiz', startedAt: Date.now() });
        }
        // Music only starts when the 3-2-1-GO ends, same as the rest of the
        // modes (see runPregameCountdown in js/modes/mapgame-play.js).
        runGqPregameCountdown(() => {
          if (guessRow) guessRow.style.display = '';
          if (hintEl2) hintEl2.style.display = '';
          if (canvasEl) canvasEl.style.pointerEvents = '';
          if (typeof playMusic === 'function' && typeof sfxGameMusic !== 'undefined') playMusic(sfxGameMusic);
          startTimer();
          // A single "round" per session (no repeated rounds) — the target
          // country is never sent, only when the timer started, so the
          // spectator doesn't see the answer before the player.
          if (typeof window._specReportRound === 'function') {
            window._specReportRound({ mode: 'globequiz', startedAt: gqTimerStart });
          }
        });
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
    const cardTimeEl = document.getElementById('gq-lb-player-time');
    if (cardTimeEl) cardTimeEl.textContent = '0:00';
    // Same reset as the real player's loadState() (guesses/solved) plus
    // dailyCountry null — the spectator never knows it until they win (see
    // globequizSpectatorResolvePick), so drawTexture()/updateOutlines() must
    // start WITHOUT it (their `if (solved)` guard already handles this).
    guesses = [];
    solved = false;
    animatedGuessNames = new Set();
    dailyCountry = null;
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
    if (friendsBar2) friendsBar2.querySelectorAll('.lb-entry[data-gq-friend]').forEach(el => el.remove());
    const guessRow2 = document.querySelector('.gq-guess-row');
    if (guessRow2) guessRow2.style.display = 'none';
    const hintEl4 = document.querySelector('.gq-hint');
    if (hintEl4) hintEl4.style.display = 'none';
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
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

  window.globequizSpectatorExit = function (switchingMode) {
    if (!switchingMode) window._isSpectating = false;
    if (_gqSpecTimerInterval) { clearInterval(_gqSpecTimerInterval); _gqSpecTimerInterval = null; }
    if (_gqSpecCardInterval) { clearInterval(_gqSpecCardInterval); _gqSpecCardInterval = null; }
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
    // Restore what was hidden in Enter — if this same tab later starts a
    // REAL GlobeQuiz match, initGlobeQuiz() expects these elements in their
    // normal state.
    const powerBtn = document.getElementById('gq-power-btn');
    if (powerBtn) powerBtn.style.display = '';
    const friendsBar = document.querySelector('.gq-friends-bar');
    if (friendsBar) friendsBar.style.display = '';
    const guessRow = document.querySelector('.gq-guess-row');
    if (guessRow) guessRow.style.display = '';
    const hintEl = document.querySelector('.gq-hint');
    if (hintEl) hintEl.style.display = '';
    if (typeof window.refreshIngamePower === 'function') window.refreshIngamePower();
    if (!switchingMode) {
      const ls = document.getElementById('loading-screen');
      if (ls) ls.style.display = 'flex';
    }
  };

  window.globequizSpectatorShowPregame = function (payload) {
    if (_gqSpecTimerInterval) { clearInterval(_gqSpecTimerInterval); _gqSpecTimerInterval = null; }
    _gqSpecResetPanel();
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
    // from "3" (same criterion as citiesSpectatorShowPregame).
    let elapsedMs = (payload && typeof payload.startedAt === 'number') ? Date.now() - payload.startedAt : 0;
    if (elapsedMs < 0) elapsedMs = 0;
    runGqPregameCountdown(() => {}, elapsedMs);
  };

  // A single "round" per session — starts the local timer from
  // payload.startedAt (the same instant the real player saw their 3-2-1-GO
  // end), without needing per-second ticks from the broadcaster.
  window.globequizSpectatorShowRound = function (payload) {
    // The round is the signal that the 3-2-1-GO already ended on the real
    // side — in case it arrives while the local mirror
    // (globequizSpectatorShowPregame) is still animating (network latency),
    // it's cut here so it isn't left stuck on screen covering the globe.
    abortGqPregameCountdown();
    _gqSpecResetPanel();
    _gqSpecStartedAt = (payload && typeof payload.startedAt === 'number') ? payload.startedAt : Date.now();
    if (_gqSpecTimerInterval) clearInterval(_gqSpecTimerInterval);
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
    if (_gqSpecCardInterval) clearInterval(_gqSpecCardInterval);
    const cardTick = () => {
      const cardTimeEl = document.getElementById('gq-lb-player-time');
      if (cardTimeEl && typeof formatGqCardTime === 'function') {
        cardTimeEl.textContent = formatGqCardTime(Math.max(0, Date.now() - _gqSpecStartedAt));
      }
    };
    cardTick();
    _gqSpecCardInterval = setInterval(cardTick, 30);
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
    // The real player plays sfxCheck on EVERY submit (confirm click/Enter,
    // see playCheckSfx in initGlobeQuiz) — not just on the final correct one.
    if (typeof sfxCheck !== 'undefined' && typeof sfxPlay === 'function') { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); }
    // Same moment as the real player's submitGuess(): any guess (win or
    // not) stops the globe's auto-rotation.
    stopAutoRotate();
    if (payload.win) {
      if (_gqSpecTimerInterval) { clearInterval(_gqSpecTimerInterval); _gqSpecTimerInterval = null; }
      if (_gqSpecCardInterval) { clearInterval(_gqSpecCardInterval); _gqSpecCardInterval = null; }
      // Same moment as the real player's submitGuess(): cuts the gameloop
      // (silence) and plays sfxBonus — sfxPostgame only comes in 2s later,
      // with globequizSpectatorShowPostgame's banner.
      if (typeof playMusic === 'function') playMusic(null);
      if (typeof sfxBonus !== 'undefined' && typeof sfxPlay === 'function') { sfxBonus.currentTime = 0; sfxPlay(sfxBonus); }
      const timerEl = document.getElementById('gq-timer-number');
      if (timerEl) timerEl.textContent = String(Math.floor((payload.elapsedMs || 0) / 1000));
      // Freezes the small card at the same final value as the real player
      // (see gqCardEl.textContent = formatGqCardTime(gqFinalElapsedMs) in
      // submitGuess) instead of leaving it at whatever cardTick last
      // painted.
      const cardTimeEl = document.getElementById('gq-lb-player-time');
      if (cardTimeEl && typeof formatGqCardTime === 'function') cardTimeEl.textContent = formatGqCardTime(payload.elapsedMs || 0);
      // solved/dailyCountry are the SAME module variables the real player
      // uses — with these set, drawTexture()/updateOutlines() already paint
      // the correct country green with its outline, and showWin() builds
      // exactly the same message/confetti the player themselves sees (this
      // used to be rebuilt by hand here, duplicating that HTML with
      // different text — "correctBadge" instead of the name). Without
      // updateHint() — the spectator doesn't show the "hotter/colder" hint.
      solved = true;
      dailyCountry = countryByName.get(normalize(payload.countryName || ''));
      if (dailyCountry) {
        drawTexture();
        focusOnCountry(dailyCountry);
        showWin();
      }
      return;
    }
    const country = countryByName.get(normalize(payload.name || ''));
    guesses.push({ name: payload.name, km: payload.km, dir: payload.dir, color: payload.color });
    drawTexture();
    renderGuessList();
    if (country) focusOnCountry(country);
  };

  // Resend (not live) of ALL guesses already made — arrives on joining
  // mid-match (see reportGqGuesses in spectate.js), unlike
  // globequizSpectatorResolvePick which is the LIVE route (one guess at a
  // time, with sfxCheck/camera focus). Replaces the whole `guesses` at once
  // and repaints silently — without this, someone connecting mid-match only
  // saw the countries the player typed FROM THEN ON, not the ones already
  // placed (the reported bug).
  window.globequizSpectatorSyncGuesses = function (list) {
    if (!Array.isArray(list) || solved) return; // already won — postgame/win rules, don't overwrite with a stale list
    guesses = list.slice();
    if (guesses.length > 0) stopAutoRotate();
    drawTexture();
    renderGuessList();
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
