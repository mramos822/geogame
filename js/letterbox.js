// ── STAGE DE ASPECTO FIJO ─────────────────────────────────────────────────────
// Todo el juego vive dentro de #app-stage, un contenedor de TAMAÑO FIJO
// (DESIGN_W × DESIGN_H = el viewport de referencia). Las unidades internas son
// container units (cqmin/cqh/cqw) que se calculan contra ese tamaño fijo, así el
// layout queda CONGELADO. Acá solo calculamos la escala para encajar el stage en
// la ventana (contain) y lo centramos; el blanco del body rellena el resto
// (letterbox/pillarbox real en los 4 lados).
(function () {
  // Área VISIBLE = zona jugable central (70% del ancho de diseño). El fit/letterbox
  // se calcula contra esto, así el blanco de alrededor reemplaza a las viejas barras.
  var VISIBLE_W = 1344; // 1920 * 0.70
  var VISIBLE_H = 911;

  // Tamaño del sistema de coordenadas del CONTENIDO (para canvas, etc.).
  window.STAGE_W = 1920;
  window.STAGE_H = 911;

  var stage = null;
  var outer = null;

  function buildStage() {
    stage = document.getElementById('app-stage');
    if (stage) return;
    outer = document.createElement('div');
    outer.id = 'app-stage-outer';
    stage = document.createElement('div');
    stage.id = 'app-stage';
    outer.appendChild(stage);

    // Mover los hijos directos de <body> al stage, salvo scripts/estilos,
    // el aviso de pantalla y el lector temporal de resolución.
    var keepOut = { 'screen-warning': 1, 'temp-res-readout': 1, 'app-stage': 1, 'app-stage-outer': 1 };
    var kids = Array.prototype.slice.call(document.body.childNodes);
    kids.forEach(function (n) {
      if (n.nodeType === 1) {
        var tag = n.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') return;
        if (n.id && keepOut[n.id]) return;
      }
      stage.appendChild(n);
    });
    document.body.appendChild(outer);
    // Expuesto para que el contenido creado en runtime se agregue DENTRO del stage.
    window.appStage = stage;

    // El lector temporal puede estar anidado dentro de #loading-screen → sacarlo.
    var tr = document.getElementById('temp-res-readout');
    if (tr) document.body.appendChild(tr);
  }

  function update() {
    if (!stage) buildStage();
    var w = window.innerWidth;
    var h = window.innerHeight;
    var fit = Math.min(w / VISIBLE_W, h / VISIBLE_H);
    document.documentElement.style.setProperty('--app-fit', fit);
  }

  function init() {
    buildStage();
    update();
  }

  if (document.body && document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
})();
