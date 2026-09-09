// ── FIXED-ASPECT STAGE ──────────────────────────────────────────────────────
// The whole game lives inside #app-stage, a FIXED-SIZE container (DESIGN_W ×
// DESIGN_H = the reference viewport). Internal units are container units
// (cqmin/cqh/cqw) computed against that fixed size, so the layout is FROZEN.
// Here we only compute the scale to fit the stage into the window (contain) and
// center it; the body's white fills the rest (real letterbox/pillarbox on all 4
// sides).
(function () {
  // VISIBLE area = central playable zone (70% of the design width). The
  // fit/letterbox is computed against this, so the surrounding white replaces
  // the old bars.
  var VISIBLE_W = 1344; // 1920 * 0.70
  var VISIBLE_H = 911;

  // Size of the CONTENT coordinate system (for canvas, etc.).
  window.STAGE_W = 1920;
  window.STAGE_H = 911;
  window.GAME_DURATION = 60;

  var stage = null;
  var outer = null;

  // Largest dimensions seen — used so keyboard-open events don't shrink the stage.
  var baseW = 0, baseH = 0;
  var isMobileLB = navigator.maxTouchPoints > 1;

  function buildStage() {
    stage = document.getElementById('app-stage');
    if (stage) return;
    outer = document.createElement('div');
    outer.id = 'app-stage-outer';
    stage = document.createElement('div');
    stage.id = 'app-stage';
    outer.appendChild(stage);

    // Move <body>'s direct children into the stage, except scripts/styles,
    // the screen warning and the temporary resolution readout.
    var keepOut = { 'screen-warning': 1, 'temp-res-readout': 1, 'app-stage': 1, 'app-stage-outer': 1, 'init-cover': 1, 'test-founder-popup-btn': 1 };
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
    // Exposed so runtime-created content is added INSIDE the stage.
    window.appStage = stage;

    // The temp readout may be nested inside #loading-screen → move it out.
    var tr = document.getElementById('temp-res-readout');
    if (tr) document.body.appendChild(tr);
  }

  function update() {
    if (!stage) buildStage();
    var vp = window.visualViewport;
    // Use the MIN of visualViewport and innerWidth/Height: if browser chrome
    // (Opera/Edge search bar) overlaps the viewport, this avoids over-scaling
    // and the stage isn't clipped.
    var w = vp ? Math.min(vp.width,  window.innerWidth)  : window.innerWidth;
    var h = vp ? Math.min(vp.height, window.innerHeight) : window.innerHeight;
    var fitW = w, fitH = h;
    // On mobile (iOS & Android), track the largest dimensions seen so the
    // keyboard-open event (which shrinks visualViewport.height) doesn't rescale the stage.
    if (isMobileLB) {
      if (w > baseW || h > baseH) { baseW = w; baseH = h; }
      fitW = baseW; fitH = baseH;
    }
    var fit = Math.min(fitW / VISIBLE_W, fitH / VISIBLE_H);
    var root = document.documentElement;
    root.style.setProperty('--app-fit', fit);

    // Center against the VISIBLE viewport, not the layout one. #app-stage-outer
    // is position:fixed with top/left:50% (layout viewport center). When
    // browser chrome overlaps the page (offsetTop/Left > 0, e.g. Opera GX), the
    // layout center sits partly under the chrome and the stage "clips" at the
    // top. We shift the center to the visible area's. On desktop with no
    // overlap the offset is 0 → no change.
    var shiftX = 0, shiftY = 0;
    if (vp && !isMobileLB) {
      shiftX = (vp.offsetLeft || 0) + vp.width  / 2 - window.innerWidth  / 2;
      shiftY = (vp.offsetTop  || 0) + vp.height / 2 - window.innerHeight / 2;
    }
    root.style.setProperty('--app-shift-x', shiftX + 'px');
    root.style.setProperty('--app-shift-y', shiftY + 'px');
  }

  function init() {
    buildStage();
    update();
  }

  function revealAfterLayout() {
    var cover = document.getElementById('init-cover');
    if (!cover) return;
    setTimeout(function () {
      cover.remove();
    }, 100);
  }

  if (document.body && document.readyState !== 'loading') {
    init();
    revealAfterLayout();
  } else {
    document.addEventListener('DOMContentLoaded', function () { init(); revealAfterLayout(); });
  }
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', function () { baseW = 0; baseH = 0; update(); });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
    // visualViewport scroll changes offsetTop/Left (chrome showing/hiding).
    window.visualViewport.addEventListener('scroll', update);
  }
  // Exposed so other screens can force a fit re-computation.
  // On iOS Safari, position:fixed can have a wrong Y on first render; calling
  // this after showing a screen forces the correction.
  window.letterboxRefresh = update;
})();
