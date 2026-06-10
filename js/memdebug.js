// ── OVERLAY DE DIAGNÓSTICO DE MEMORIA (solo debug) ───────────────────────────
// Activar agregando ?mem=1 a la URL (ej: .../index.html?mem=1). No aparece para
// jugadores normales.
//
// IMPORTANTE: iOS Safari NO expone el uso real de RAM del proceso (performance.memory
// solo existe en Chrome/PC). Lo que mostramos es un ESTIMADO de NUESTRO footprint:
//   IMG  = suma de bytes decodificados de todas las <img> cargadas (nW×nH×4)
//   CNV  = suma de los buffers de canvas (w×h×4)
//   TOT  = IMG + CNV  (≈ memoria gráfica que mantiene viva la app)
//   HEAP = performance.memory.usedJSHeapSize (solo PC/Chrome)
// El número absoluto no es el límite real de iOS, pero los PICOS y su evolución en
// las transiciones son fieles y sirven para ver dónde se dispara la memoria.
(function () {
  // Visible desde el inicio durante el beta (el usuario avisa cuándo deshabilitarlo).
  // Para apagarlo: abrir con ?mem=0 o volver a poner el guard de ?mem=1.
  if (new URLSearchParams(location.search).get('mem') === '0') return;

  const box = document.createElement('div');
  box.style.cssText = [
    'position:fixed', 'top:6px', 'left:6px', 'z-index:2147483647',
    'background:rgba(0,0,0,0.78)', 'color:#0f0', 'font:12px/1.35 monospace',
    'padding:6px 8px', 'border-radius:6px', 'white-space:pre', 'pointer-events:none',
    'text-shadow:0 1px 1px #000', 'min-width:180px',
  ].join(';');
  document.documentElement.appendChild(box);

  const MB = b => (b / 1048576).toFixed(1);
  let peakTot = 0;
  // Forense de crash: SIEMPRE mostramos la última lectura de la sesión anterior.
  // Como la app no recarga sola, cualquier reinicio = el crash de iOS, así que el
  // último valor guardado es el de justo antes de morir la pestaña. (No usamos
  // bandera de "salida limpia" porque iOS dispara pagehide hasta en los crashes.)
  let crashLine = '';
  try {
    const prev = JSON.parse(localStorage.getItem('memdbg_last') || 'null');
    if (prev) {
      crashLine = `⚠ SESION ANTERIOR (antes del reinicio):\n  TOT ${MB(prev.tot)}  pico ${MB(prev.peak)}\n  modo ${prev.mode} ${prev.step}\n`;
    }
  } catch (e) {}
  let lastT = performance.now();
  let frames = 0, fps = 0;

  // Contador de FPS (caídas de FPS suelen acompañar presión de memoria/GPU).
  (function loop() {
    frames++;
    const now = performance.now();
    if (now - lastT >= 1000) { fps = Math.round(frames * 1000 / (now - lastT)); frames = 0; lastT = now; }
    requestAnimationFrame(loop);
  })();

  function measure() {
    // El navegador decodifica UNA vez por URL y comparte el bitmap entre <img>
    // iguales, así que sumamos por URL única (no por elemento) para reflejar la RAM
    // real. imgCount = elementos cargados; uniq = URLs distintas decodificadas.
    let imgBytes = 0, imgCount = 0, imgVis = 0;
    const seen = new Set();
    document.querySelectorAll('img').forEach(im => {
      const w = im.naturalWidth, h = im.naturalHeight;
      if (w > 0 && h > 0 && im.currentSrc) {
        imgCount++;
        if (im.offsetParent !== null && getComputedStyle(im).visibility !== 'hidden') imgVis++;
        if (!seen.has(im.currentSrc)) { seen.add(im.currentSrc); imgBytes += w * h * 4; }
      }
    });
    const imgUniq = seen.size;
    let cnvBytes = 0, cnvCount = 0;
    document.querySelectorAll('canvas').forEach(c => {
      if (c.width > 1 && c.height > 1) { cnvBytes += c.width * c.height * 4; cnvCount++; }
    });
    const tot = imgBytes + cnvBytes;
    if (tot > peakTot) peakTot = tot;

    const heap = (performance && performance.memory) ? performance.memory.usedJSHeapSize : null;
    const mode = window.pendingGameMode || '—';
    const step = (typeof window.confirmStep !== 'undefined') ? ('step' + window.confirmStep) : '';

    // Persistir cada tick para forense de crash (sobrevive al reinicio de la pestaña).
    try { localStorage.setItem('memdbg_last', JSON.stringify({ tot, peak: peakTot, mode, step })); } catch (e) {}

    const live =
      `TOT ${MB(tot)} MB  (pico ${MB(peakTot)})\n` +
      `IMG ${MB(imgBytes)} MB  (${imgUniq} unicas, ${imgCount} tags, ${imgVis} vis)\n` +
      `CNV ${MB(cnvBytes)} MB  (${cnvCount})\n` +
      (heap != null ? `HEAP ${MB(heap)} MB (JS)\n` : `HEAP n/d (iOS no expone)\n`) +
      `FPS ${fps}   modo: ${mode} ${step}`;
    box.innerHTML = (crashLine ? `<span style="color:#ffd24a">${crashLine}</span>` : '') + live;
  }

  // Muestreo rápido (120ms) para acercarnos al pico transitorio de la transición.
  setInterval(measure, 120);
  measure();

  // Reset del pico con doble-tap en el overlay (por si querés medir una transición).
  let lastTap = 0;
  box.style.pointerEvents = 'auto';
  box.addEventListener('click', () => {
    const n = Date.now();
    if (n - lastTap < 400) { peakTot = 0; }
    lastTap = n;
  });
})();
