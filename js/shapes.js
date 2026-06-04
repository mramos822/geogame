let _shapeGroupCount = 0;
const sfxLevel2 = new Audio('sfx/level2.mp3');
if (typeof isMuted !== 'undefined' && isMuted) sfxLevel2.volume = 0;
let shapesStreak = 0;
let shapesRoundStartTime = null;
let shapesTimeLeft = 60;
let shapesTimerIntervalId = null;
let shapesRunning = false;
let shapesDots = 0;
let shapesTrainTimeouts = [];
let shapesCurrentImg = null, shapesCurrentImg2 = null, shapesCurrentClip = null;
let shapesCurrentBoard = null, shapesCurrentSvg = null;
let shapesCurrentAnimTimeout = null, shapesCurrentClipFadeTimeout = null;
let shapesWrongAnswerCount = 0;
let shapesSpeedBonusHideId = null;
const SHAPES_SPEED_WIN  = 2.0;
const SHAPES_SPEED_MULT = 1.5;
const SHAPES_GRACE      = 0.8;
let shapesScore = 0;
let shapesDisplayedScore = 0;
let shapesScoreRafId = null;
let shapesAnsweredSet = new Set();
let shapesWrongCooldown = new Map(); // country name → remaining questions before re-entry
let shapesCorrectCount = 0;

function positionShapesCountdown() {
  const cwEl = document.getElementById('shapes-countdown-widget');
  if (!cwEl) return;
  const gw = document.getElementById('game-wrapper');
  if (!gw) return;
  const prev = gw.style.display;
  gw.style.display = 'block';
  gw.style.opacity = '0';
  gw.style.pointerEvents = 'none';
  const rect = gw.getBoundingClientRect();
  gw.style.display = prev || 'none';
  gw.style.opacity = '';
  gw.style.pointerEvents = '';
  cwEl.style.position      = 'fixed';
  cwEl.style.top           = (rect.top - 50) + 'px';
  cwEl.style.right         = (window.innerWidth - rect.right - 18) + 'px';
  cwEl.style.width         = '240px';
  cwEl.style.height        = '132px';
  cwEl.style.pointerEvents = 'none';
  cwEl.style.zIndex        = '200';
}

window.addEventListener('resize', positionShapesCountdown);

function shapesAnimateScore() {
  if (shapesScoreRafId) return;
  const el = document.getElementById('score-value');
  let last = null;
  function tick(ts) {
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    const diff = shapesScore - shapesDisplayedScore;
    if (diff <= 0) { shapesScoreRafId = null; return; }
    shapesDisplayedScore = Math.min(shapesScore, shapesDisplayedScore + Math.max(1, Math.round(diff * 8 * dt)));
    if (el) el.textContent = shapesDisplayedScore.toLocaleString();
    shapesScoreRafId = requestAnimationFrame(tick);
  }
  shapesScoreRafId = requestAnimationFrame(tick);
}

function showCountryShape(country, ext1, ext2, startDelay) {
  ext1 = ext1 || 'png';
  ext2 = ext2 || 'jpg';
  startDelay = startDelay || 0;

  document.getElementById('loading-screen').style.display = 'none';
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'block';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'flex'; rightPanel.style.zIndex = '120'; }

  if (!document.getElementById('shapes-countdown-widget')) {
    const cw = document.createElement('div');
    cw.id = 'shapes-countdown-widget';

    const cwImg = document.createElement('img');
    cwImg.id = 'shapes-timer-img';
    cwImg.src = 'images/countdown3.png';
    cwImg.draggable = false;
    cwImg.style.cssText = 'width:100%;height:100%;object-fit:fill;display:block;animation:pulse-img-shadow 1s infinite paused;';

    const cwNum = document.createElement('div');
    cwNum.id = 'shapes-timer-number';
    cwNum.textContent = '60';
    cwNum.style.color = 'white';

    const dotsEl = document.createElement('div');
    dotsEl.id = 'shapes-progress-dots';
    for (let d = 0; d < 10; d++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      dotsEl.appendChild(dot);
    }

    cw.appendChild(cwImg);
    cw.appendChild(cwNum);
    cw.appendChild(dotsEl);
    document.body.appendChild(cw);
  }

  positionShapesCountdown();

  const clipId = 'archedShape_' + (_shapeGroupCount++);

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const clipPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
  clipPathEl.setAttribute('id', clipId);
  clipPathEl.setAttribute('clipPathUnits', 'objectBoundingBox');
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', 'M 0.028,0 Q 0.5,0.005 0.995,0 Q 1.01,0 1.01,0.018 Q 0.99,0.5 1,0.973 Q 1,0.99 0.982,0.99 Q 0.5,0.972 0.008,0.995 Q -0.01,0.991 -0.01,0.983 Q 0.008,0.5 0.008,0.02 Q 0.008,0 0.028,0 Z');
  clipPathEl.appendChild(pathEl);
  defs.appendChild(clipPathEl);
  svgEl.appendChild(defs);
  document.body.appendChild(svgEl);
  shapesCurrentSvg = svgEl;

  const board = document.createElement('img');
  board.src = 'images/countryboard.png';
  board.style.cssText = 'position:fixed;top:50%;left:36%;transform:translate(-50%,-50%) scaleX(0.96);width:85.15vmin;height:auto;z-index:99;';
  board.draggable = false;
  document.body.appendChild(board);
  shapesCurrentBoard = board;


  const img = document.createElement('img');
  img.src = 'images/countries/' + country + '1.' + ext1;
  img.style.cssText = 'position:fixed;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4vmin;height:59.4vmin;z-index:103;transition:transform 3s linear;display:none;';
  img.draggable = false;
  document.body.appendChild(img);

  const clip = document.createElement('div');
  clip.style.cssText = 'position:fixed;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4vmin;height:59.4vmin;clip-path:url(#' + clipId + ');z-index:102;opacity:0;transition:opacity 2s ease;display:none;';
  document.body.appendChild(clip);

  const img2 = document.createElement('img');
  img2.src = 'images/countries/' + country + '2.' + ext2;
  img2.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)' + (country === 'Rusia' ? ' scale(0.5)' : '') + ';width:118.8vmin;height:118.8vmin;transition:transform 3s linear;';
  img2.draggable = false;
  clip.appendChild(img2);


  const clipFadeTimeout = setTimeout(() => { clip.style.opacity = '1'; }, 3000 + startDelay);
  shapesCurrentImg = img; shapesCurrentImg2 = img2; shapesCurrentClip = clip;
  shapesCurrentClipFadeTimeout = clipFadeTimeout;

  if (!document.getElementById('shape-tag-style')) {
    const st = document.createElement('style');
    st.id = 'shape-tag-style';
    st.textContent = `
      #shapes-timer-number {
        position: absolute;
        top: 45%; left: 69%;
        transform: translate(-50%, -50%);
        font-size: 67px; font-weight: 900;
        font-family: 'Arial Black', Impact, sans-serif;
        color: white;
        -webkit-text-stroke: 2.5px black;
        text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
        pointer-events: none; min-width: 44px; text-align: center; transition: color 0.3s;
      }
      #shapes-progress-dots {
        position: absolute; bottom: 10px; left: 9px; width: 100%;
        display: flex; justify-content: center; gap: 4px; padding: 0 6px;
        pointer-events: none; z-index: 11; transition: opacity 0.5s ease; opacity: 1;
      }
      #shapes-progress-dots.dots-fade-out { opacity: 0; }
      #shapes-progress-dots.train-animation .dot {
        animation: trencito-colors 0.8s linear infinite !important;
        transition: none !important;
        transform: scale(1.2);
      }
      #shapes-progress-dots.train-animation .dot:nth-child(1)  { animation-delay: -0.9s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(2)  { animation-delay: -0.8s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(3)  { animation-delay: -0.7s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(4)  { animation-delay: -0.6s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(5)  { animation-delay: -0.5s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(6)  { animation-delay: -0.4s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(7)  { animation-delay: -0.3s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(8)  { animation-delay: -0.2s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(9)  { animation-delay: -0.1s !important; }
      #shapes-progress-dots.train-animation .dot:nth-child(10) { animation-delay: 0s !important; }
      @keyframes shapeTagSwingOut {
        0%   { transform: translateX(0)    scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
        100% { transform: translateX(300%) scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
      }
      .shape-tag-exit { animation: shapeTagSwingOut 0.2s ease-in forwards; transition: none !important; }
      @keyframes shapeTagSwing {
        0%   { transform: translateX(300%) scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
        60%  { transform: translateX(-6%)  scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
        80%  { transform: translateX(3%)   scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
        100% { transform: translateX(0)    scaleX(1.05) scaleY(0.95) rotate(var(--tag-rot)); }
      }
      .shape-tag-enter { animation: shapeTagSwing 0.35s cubic-bezier(0.22,1,0.36,1) forwards; transition: none !important; }
    `;
    document.head.appendChild(st);
  }

  let options, correctIdx;
  if (document.body.classList.contains('recording-mode')) {
    options    = ['China', 'Germany', 'Spain', 'Egypt'];
    correctIdx = 0;
  } else {
    const correctLabel = SHAPE_COUNTRIES.find(c => c.name === country).label;
    const shuffled = getActiveShapesPool()
      .filter(c => c.name !== country && c.label !== correctLabel)
      .sort(() => Math.random() - 0.5);
    const usedLabels = new Set([correctLabel]);
    const distractors = [];
    for (const c of shuffled) {
      if (!usedLabels.has(c.label)) {
        usedLabels.add(c.label);
        distractors.push(c.label);
        if (distractors.length === 3) break;
      }
    }
    correctIdx = Math.floor(Math.random() * 4);
    options    = [...distractors];
    options.splice(correctIdx, 0, correctLabel);
  }

  const animTimeout = country !== 'Rusia' ? setTimeout(() => {
    img.style.transform  = 'translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01) scale(0.52)';
    img2.style.transform = 'translate(-50%,-50%) scale(0.52)';
    shapesCurrentAnimTimeout = null;
  }, 6000 + startDelay) : null;
  shapesCurrentAnimTimeout = animTimeout;

  const tagConfigs = [
    { top: '18%', right: '27%', rot: '-5deg' },
    { top: '37%', right: '27%', rot: '2deg'  },
    { top: '57%', right: '26%', rot: '-4deg' },
    { top: '76%', right: '26%', rot: '3deg'  },
  ];

  let anyClicked = false;
  const tagEls = [];

  setTimeout(() => {
  const tImgStart = document.getElementById('shapes-timer-img');
  if (tImgStart) tImgStart.style.animationPlayState = 'running';

  const whiteBg = document.createElement('div');
  whiteBg.style.cssText = 'position:fixed;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:62vmin;height:62vmin;background:#FCFAF4;clip-path:url(#' + clipId + ');z-index:100;opacity:1;transition:opacity 0.5s ease;pointer-events:none;';
  document.body.appendChild(whiteBg);
  setTimeout(() => { whiteBg.style.opacity = '0'; }, 60);
  setTimeout(() => { whiteBg.remove(); }, 660);

  img.style.display  = '';
  clip.style.display = '';

  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;top:52%;left:36.3%;transform:translate(-50%,-50%) rotate(-3.5deg) scaleX(1.072) scaleY(1.01);width:59.4vmin;height:59.4vmin;background:white;clip-path:url(#' + clipId + ');z-index:104;opacity:1;transition:opacity 0.5s ease;pointer-events:none;';
  document.body.appendChild(flash);
  requestAnimationFrame(() => requestAnimationFrame(() => { flash.style.opacity = '0'; }));
  setTimeout(() => { flash.remove(); }, 600);
  sfxLevel2.currentTime = 0;
  sfxLevel2.play();

  tagConfigs.forEach((cfg, i) => {
    const isCorrect = (i === correctIdx);
    const base = `scaleX(1.05) scaleY(0.95) rotate(${cfg.rot})`;
    const tag = document.createElement('div');
    tag.style.cssText = `position:fixed;top:${cfg.top};right:${cfg.right};width:368px;z-index:110;pointer-events:auto;transform:translateX(300%) scaleX(1.05) scaleY(0.95) rotate(${cfg.rot});transform-origin:center center;transition:transform 0.15s ease;cursor:pointer;--tag-rot:${cfg.rot};`;
    tag.classList.add('shape-tag-enter', 'shapes-tag');
    tag.style.animationDelay = `${i * 80}ms`;
    tag.style.pointerEvents = 'none';
    tag.addEventListener('animationend', () => {
      tag.style.transform = base;
      tag.classList.remove('shape-tag-enter');
      tag.style.animationDelay = '';
      tag.style.pointerEvents = 'auto';
      if (i === tagConfigs.length - 1) shapesRoundStartTime = performance.now();
    });

    const tagImg = document.createElement('img');
    tagImg.src = 'images/tag2.png';
    tagImg.draggable = false;
    tagImg.style.cssText = 'display:block;width:100%;';

    const tagLabel = document.createElement('span');
    tagLabel.textContent = options[i];
    tagLabel.style.cssText = 'position:absolute;top:50%;left:52%;transform:translate(-50%,-50%);font-family:"VAGRoundBold","Arial Black",sans-serif;font-size:34px;color:#2a1a00;font-weight:bold;white-space:nowrap;pointer-events:none;';

    tag.addEventListener('mouseenter', () => {
      if (anyClicked || !shapesRunning) return;
      tagImg.src = 'images/tag2yellow.png';
      tag.style.transform = base + ' scale(1.1)';
      if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxSelect.play(); }
    });
    tag.addEventListener('mouseleave', () => {
      if (anyClicked || !shapesRunning) return;
      tagImg.src = 'images/tag2.png';
      tag.style.transform = base;
    });
    tag.addEventListener('click', () => {
      if (anyClicked || !shapesRunning) return;
      anyClicked = true;
      tag.style.transform = base + ' scale(1.1)';
      tag.style.cursor = 'default';
      tagImg.src = isCorrect ? 'images/tag2green.png' : 'images/tag2red.png';
      tagLabel.style.color = '#ffffff';
      if (!isCorrect) {
        const correctTag = tagEls[correctIdx];
        if (correctTag) {
          correctTag.querySelector('img').src = 'images/tag2green.png';
          correctTag.querySelector('span').style.color = '#ffffff';
        }
      }

      if (document.body.classList.contains('recording-mode')) {
        tagEls.forEach(t => { t.style.pointerEvents = 'none'; t.style.cursor = 'default'; });
        return;
      }

      const overlayId = isCorrect ? 'flags-check-overlay' : 'flags-wrong-overlay';
      const overlay = document.getElementById(overlayId);
      if (overlay) {
        overlay.style.zIndex = '999';
        overlay.style.left = '39%';
        overlay.style.top = '44%';
        overlay.style.zoom = '0.85';
        overlay.style.display = '';
        overlay.classList.remove('animate');
        void overlay.offsetWidth;
        overlay.classList.add('animate');
        setTimeout(() => { overlay.classList.remove('animate'); overlay.style.display = 'none'; overlay.style.zIndex = ''; overlay.style.left = ''; overlay.style.top = ''; overlay.style.zoom = ''; }, 820);
      }

      if (typeof loadGameSFX  !== 'undefined') loadGameSFX();
      if (typeof loadBadges   !== 'undefined') loadBadges();
      if (isCorrect) {
        shapesAnsweredSet.add(country);
        shapesCorrectCount++;
        shapesStreak++;
        if (sfxAcertar) { sfxAcertar.currentTime = 0; sfxAcertar.play(); }
        const pts        = typeof getFlagsRoundPoints !== 'undefined' ? getFlagsRoundPoints(shapesCorrectCount) : 10;
        const badgeImg   = typeof getBadgeImg         !== 'undefined' ? getBadgeImg(shapesStreak)         : null;
        const inRowBonus = typeof getInRowBonus       !== 'undefined' ? getInRowBonus(shapesStreak)       : 0;
        const elapsed    = shapesRoundStartTime ? Math.max(0, (performance.now() - shapesRoundStartTime) / 1000) : SHAPES_SPEED_WIN;
        const ratio      = elapsed <= SHAPES_GRACE ? 1 : Math.max(0, 1 - (elapsed - SHAPES_GRACE) / (SHAPES_SPEED_WIN - SHAPES_GRACE));
        const speedBonus = ratio > 0 ? Math.round(pts * (SHAPES_SPEED_MULT - 1) * ratio) : 0;
        shapesScore += pts + speedBonus + inRowBonus;
        shapesAnimateScore();
        if (typeof positionLeaderboard !== 'undefined') positionLeaderboard(shapesScore, true);
        shapesDots++;
        const dotsContainer = document.getElementById('shapes-progress-dots');
        if (dotsContainer) {
          dotsContainer.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < shapesDots));
          if (shapesDots >= 10 && !dotsContainer.classList.contains('train-animation')) {
            dotsContainer.classList.add('train-animation');
            shapesTimeLeft = Math.min(shapesTimeLeft + 5, 99);
            const tEl = document.getElementById('shapes-timer-number');
            const tImg = document.getElementById('shapes-timer-img');
            if (tEl) { const orig = tEl.style.color; tEl.textContent = shapesTimeLeft; tEl.style.color = '#00ff88';
              const t1 = setTimeout(() => {
                dotsContainer.classList.add('dots-fade-out');
                const t2 = setTimeout(() => {
                  shapesTrainTimeouts = shapesTrainTimeouts.filter(t => t !== t1 && t !== t2);
                  shapesDots = Math.max(0, shapesDots - 10);
                  dotsContainer.classList.remove('train-animation', 'dots-fade-out');
                  dotsContainer.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('filled', i < shapesDots));
                  if (shapesTimeLeft <= 10) { tEl.style.color = '#ffffff'; if (tImg) tImg.src = 'images/countdownred3.png'; }
                  else { tEl.style.color = orig; if (tImg) tImg.src = 'images/countdown3.png'; }
                }, 500);
                shapesTrainTimeouts.push(t2);
              }, 2000);
              shapesTrainTimeouts.push(t1);
            }
          }
        }
        if (typeof showScorePopup !== 'undefined') showScorePopup(pts + speedBonus);
        if (speedBonus > 0) {
          const sbt = document.getElementById('speed-bonus-text');
          if (sbt) {
            sbt.style.zIndex = '120';
            clearTimeout(shapesSpeedBonusHideId);
            sbt.classList.remove('visible');
            void sbt.offsetWidth;
            sbt.classList.add('visible');
            shapesSpeedBonusHideId = setTimeout(() => { sbt.classList.remove('visible'); sbt.style.zIndex = ''; }, 1600);
          }
        }
        if (badgeImg && typeof showFlagsBadge !== 'undefined') {
          const bc = document.getElementById('flags-badge-canvas');
          if (bc) bc.style.zIndex = '999';
          showFlagsBadge(badgeImg, inRowBonus, shapesStreak, window.innerWidth * 0.39, 0.85);
        }
      } else {
        shapesWrongCooldown.set(country, 5);
        shapesWrongAnswerCount++;
        shapesStreak = 0;
        if (sfxError) { sfxError.currentTime = 0; sfxError.play(); }
      }
      tagEls.forEach(t => { t.style.pointerEvents = 'none'; t.style.cursor = 'default'; });
      setTimeout(() => {
        tagEls.forEach(t => { t.style.transform = getComputedStyle(t).transform; t.classList.add('shape-tag-exit'); });
        setTimeout(() => {
          tagEls.forEach(t => t.remove());
          if (!shapesRunning) return;
          svgEl.remove();
          board.remove();
          img.remove();
          clip.remove();
          for (const [name, remaining] of shapesWrongCooldown) {
            if (remaining <= 1) shapesWrongCooldown.delete(name);
            else shapesWrongCooldown.set(name, remaining - 1);
          }
          const activePool = getActiveShapesPool();
          const pool = activePool.filter(c => !shapesAnsweredSet.has(c.name) && !shapesWrongCooldown.has(c.name));
          const src  = pool.length > 0 ? pool : activePool.filter(c => !shapesAnsweredSet.has(c.name));
          const next = (src.length > 0 ? src : activePool)[Math.floor(Math.random() * (src.length > 0 ? src : activePool).length)];
          showCountryShape(next.name, next.ext1, next.ext2);
        }, 200);
      }, 500);
      clearTimeout(animTimeout);
      clearTimeout(clipFadeTimeout);
      const frozenImg     = getComputedStyle(img).transform;
      const frozenImg2    = getComputedStyle(img2).transform;
      const frozenOpacity = getComputedStyle(clip).opacity;
      img.style.transition  = 'none';
      img2.style.transition = 'none';
      clip.style.transition = 'none';
      img.style.transform   = frozenImg;
      img2.style.transform  = frozenImg2;
      clip.style.opacity    = frozenOpacity;
    });

    tag.appendChild(tagImg);
    tag.appendChild(tagLabel);
    document.body.appendChild(tag);

    let fs = 34;
    while (tagLabel.scrollWidth > 290 && fs > 16) {
      fs -= 2;
      tagLabel.style.fontSize = fs + 'px';
      if (fs < 26) tagLabel.style.letterSpacing = '-1px';
      if (fs < 20) tagLabel.style.letterSpacing = '-2px';
    }

    tagEls.push(tag);
  });
  }, startDelay);
}

const SHAPE_COUNTRIES = [
  { name: 'China',          label: 'China',            ext1: 'png', ext2: 'jpg' },
  { name: 'Italia',         label: 'Italia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Chile',          label: 'Chile',            ext1: 'png', ext2: 'jpg' },
  { name: 'Japon',          label: 'Japón',            ext1: 'png', ext2: 'jpg' },
  { name: 'Australia',      label: 'Australia',        ext1: 'png', ext2: 'jpg' },
  { name: 'EstadosUnidos',  label: 'Estados Unidos',   ext1: 'png', ext2: 'jpg' },
  { name: 'Brasil',         label: 'Brasil',           ext1: 'png', ext2: 'jpg' },
  { name: 'China',          label: 'China',            ext1: 'png', ext2: 'jpg' },
  { name: 'India',          label: 'India',            ext1: 'png', ext2: 'jpg' },
  { name: 'Noruega',        label: 'Noruega',          ext1: 'png', ext2: 'jpg' },
  { name: 'NuevaZelanda',   label: 'Nueva Zelanda',    ext1: 'png', ext2: 'jpg' },
  { name: 'Mexico',         label: 'México',           ext1: 'png', ext2: 'jpg' },
  { name: 'Argentina',      label: 'Argentina',        ext1: 'png', ext2: 'jpg' },
  { name: 'Indonesia',      label: 'Indonesia',        ext1: 'png', ext2: 'jpg' },
  { name: 'Finlandia',      label: 'Finlandia',        ext1: 'png', ext2: 'jpg' },
  { name: 'ReinoUnido',     label: 'Reino Unido',      ext1: 'png', ext2: 'jpg' },
  { name: 'Espana',         label: 'España',           ext1: 'png', ext2: 'jpg' },
  { name: 'Francia',        label: 'Francia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Sudafrica',      label: 'Sudáfrica',        ext1: 'png', ext2: 'jpg' },
  { name: 'Egipto',         label: 'Egipto',           ext1: 'png', ext2: 'jpg' },
  { name: 'Madagascar',     label: 'Madagascar',       ext1: 'png', ext2: 'jpg' },
  { name: 'Rusia',          label: 'Rusia',            ext1: 'png', ext2: 'jpg' },
  { name: 'Canada',         label: 'Canadá',           ext1: 'png', ext2: 'jpg' },
  { name: 'Alaska',         label: 'Alaska',           ext1: 'png', ext2: 'jpg' },
  { name: 'Islandia',       label: 'Islandia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Suecia',         label: 'Suecia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Portugal',       label: 'Portugal',         ext1: 'png', ext2: 'jpg' },
  { name: 'Grecia',         label: 'Grecia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Somalia',        label: 'Somalia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Ucrania',        label: 'Ucrania',          ext1: 'png', ext2: 'jpg' },
  { name: 'Alemania',       label: 'Alemania',         ext1: 'png', ext2: 'jpg' },
  { name: 'Polonia',        label: 'Polonia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Irlanda',        label: 'Irlanda',          ext1: 'png', ext2: 'jpg' },
  { name: 'Dinamarca',      label: 'Dinamarca',        ext1: 'png', ext2: 'jpg' },
  { name: 'Rumania',        label: 'Rumanía',          ext1: 'png', ext2: 'jpg' },
  { name: 'Croacia',        label: 'Croacia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Iran',           label: 'Irán',             ext1: 'png', ext2: 'jpg' },
  { name: 'Turquia',        label: 'Turquía',          ext1: 'png', ext2: 'jpg' },
  { name: 'ArabiaSaudita',  label: 'Arabia Saudita',   ext1: 'png', ext2: 'jpg' },
  { name: 'Tailandia',      label: 'Tailandia',        ext1: 'png', ext2: 'jpg' },
  { name: 'Vietnam',        label: 'Vietnam',          ext1: 'png', ext2: 'jpg' },
  { name: 'Mongolia',       label: 'Mongolia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Kazajistan',     label: 'Kazajistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Pakistan',       label: 'Pakistán',         ext1: 'png', ext2: 'jpg' },
  { name: 'Afganistan',     label: 'Afganistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Myanmar',        label: 'Myanmar',          ext1: 'png', ext2: 'jpg' },
  { name: 'Filipinas',      label: 'Filipinas',        ext1: 'png', ext2: 'jpg' },
  { name: 'CoreaDelSur',    label: 'Corea del Sur',    ext1: 'png', ext2: 'jpg' },
  { name: 'CoreaDelNorte',  label: 'Corea del Norte',  ext1: 'png', ext2: 'jpg' },
  { name: 'Irak',           label: 'Irak',             ext1: 'png', ext2: 'jpg' },
  { name: 'Yemen',          label: 'Yemen',            ext1: 'png', ext2: 'jpg' },
  { name: 'Oman',           label: 'Omán',             ext1: 'png', ext2: 'jpg' },
  { name: 'Peru',           label: 'Perú',             ext1: 'png', ext2: 'jpg' },
  { name: 'Colombia',       label: 'Colombia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Venezuela',      label: 'Venezuela',        ext1: 'png', ext2: 'jpg' },
  { name: 'Cuba',           label: 'Cuba',             ext1: 'png', ext2: 'jpg' },
  { name: 'Bolivia',        label: 'Bolivia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Ecuador',        label: 'Ecuador',          ext1: 'png', ext2: 'jpg' },
  { name: 'Nicaragua',      label: 'Nicaragua',        ext1: 'png', ext2: 'jpg' },
  { name: 'Honduras',       label: 'Honduras',         ext1: 'png', ext2: 'jpg' },
  { name: 'Guatemala',      label: 'Guatemala',        ext1: 'png', ext2: 'jpg' },
  { name: 'Uruguay',        label: 'Uruguay',          ext1: 'png', ext2: 'jpg' },
  { name: 'Paraguay',       label: 'Paraguay',         ext1: 'png', ext2: 'jpg' },
  { name: 'Mauritania',     label: 'Mauritania',       ext1: 'png', ext2: 'jpg' },
  { name: 'Marruecos',      label: 'Marruecos',        ext1: 'png', ext2: 'jpg' },
  { name: 'Nigeria',        label: 'Nigeria',          ext1: 'png', ext2: 'jpg' },
  { name: 'Niger',          label: 'Niger',            ext1: 'png', ext2: 'jpg' },
  { name: 'Mali',           label: 'Mali',             ext1: 'png', ext2: 'jpg' },
  { name: 'Libia',          label: 'Libia',            ext1: 'png', ext2: 'jpg' },
  { name: 'Argelia',        label: 'Argelia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Etiopia',        label: 'Etiopia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Sudan',          label: 'Sudán',            ext1: 'png', ext2: 'jpg' },
  { name: 'Angola',         label: 'Angola',           ext1: 'png', ext2: 'jpg' },
  { name: 'Tanzania',       label: 'Tanzania',         ext1: 'png', ext2: 'jpg' },
  { name: 'Mozambique',     label: 'Mozambique',       ext1: 'png', ext2: 'jpg' },
  { name: 'Kenia',          label: 'Kenia',            ext1: 'png', ext2: 'jpg' },
  { name: 'RepDemCongo',    label: 'República Democrática del Congo', ext1: 'png', ext2: 'jpg' },
  { name: 'Zimbabue',       label: 'Zimbabue',         ext1: 'png', ext2: 'jpg' },
  { name: 'Namibia',        label: 'Namibia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Botsuana',       label: 'Botsuana',         ext1: 'png', ext2: 'jpg' },
  { name: 'Camerun',        label: 'Camerún',          ext1: 'png', ext2: 'jpg' },
  { name: 'Chad',           label: 'Chad',             ext1: 'png', ext2: 'jpg' },
  { name: 'PapGuinea',      label: 'Papúa Nueva Guinea', ext1: 'png', ext2: 'jpg' },
  { name: 'Groenlandia',    label: 'Groenlandia',      ext1: 'png', ext2: 'jpg' },
  { name: 'Luxemburgo',     label: 'Luxemburgo',       ext1: 'png', ext2: 'jpg' },
  { name: 'PaisesBajos',    label: 'Países Bajos',     ext1: 'png', ext2: 'jpg' },
  { name: 'Belgica',        label: 'Bélgica',          ext1: 'png', ext2: 'jpg' },
  { name: 'Hungria',        label: 'Hungría',          ext1: 'png', ext2: 'jpg' },
  { name: 'Eslovaquia',     label: 'Eslovaquia',       ext1: 'png', ext2: 'jpg' },
  { name: 'RepCheca',       label: 'Chequia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Austria',        label: 'Austria',          ext1: 'png', ext2: 'jpg' },
  { name: 'Suiza',          label: 'Suiza',            ext1: 'png', ext2: 'jpg' },
  { name: 'Kosovo',         label: 'Kosovo',           ext1: 'png', ext2: 'jpg' },
  { name: 'Albania',        label: 'Albania',          ext1: 'png', ext2: 'jpg' },
  { name: 'Bosnia',         label: 'Bosnia y Herzegovina', ext1: 'png', ext2: 'jpg' },
  { name: 'Serbia',         label: 'Serbia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Moldavia',       label: 'Moldavia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Macedonia',      label: 'Macedonia del Norte', ext1: 'png', ext2: 'jpg' },
  { name: 'Eslovenia',      label: 'Eslovenia',        ext1: 'png', ext2: 'jpg' },
  { name: 'Letonia',        label: 'Letonia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Bulgaria',       label: 'Bulgaria',         ext1: 'png', ext2: 'jpg' },
  { name: 'Estonia',        label: 'Estonia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Bielorrusia',    label: 'Bielorrusia',      ext1: 'png', ext2: 'jpg' },
  { name: 'Lituania',       label: 'Lituania',         ext1: 'png', ext2: 'jpg' },
  { name: 'Chipre',         label: 'Chipre',           ext1: 'png', ext2: 'jpg' },
  { name: 'Malta',          label: 'Malta',            ext1: 'png', ext2: 'jpg' },
  { name: 'Andorra',        label: 'Andorra',          ext1: 'png', ext2: 'jpg' },
  { name: 'Liechtenstein',  label: 'Liechtenstein',    ext1: 'png', ext2: 'jpg' },
  { name: 'Jordania',       label: 'Jordania',         ext1: 'png', ext2: 'jpg' },
  { name: 'Libano',         label: 'Líbano',           ext1: 'png', ext2: 'jpg' },
  { name: 'Siria',          label: 'Siria',            ext1: 'png', ext2: 'jpg' },
  { name: 'Israel',         label: 'Israel',           ext1: 'png', ext2: 'jpg' },
  { name: 'Tayikistan',     label: 'Tayikistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Emiratos',       label: 'Emiratos Árabes Unidos', ext1: 'png', ext2: 'jpg' },
  { name: 'Catar',          label: 'Catar',            ext1: 'png', ext2: 'jpg' },
  { name: 'Turkmenistan',   label: 'Turkmenistán',     ext1: 'png', ext2: 'jpg' },
  { name: 'Kuwait',         label: 'Kuwait',           ext1: 'png', ext2: 'jpg' },
  { name: 'Azerbaijan',     label: 'Azerbaiján',       ext1: 'png', ext2: 'jpg' },
  { name: 'Armenia',        label: 'Armenia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Palestina',      label: 'Palestina',        ext1: 'png', ext2: 'jpg' },
  { name: 'Kirguistan',     label: 'Kirguistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Uzbekistan',     label: 'Uzbekistán',       ext1: 'png', ext2: 'jpg' },
  { name: 'Georgia',        label: 'Georgia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Nepal',          label: 'Nepal',            ext1: 'png', ext2: 'jpg' },
  { name: 'Butan',          label: 'Bután',            ext1: 'png', ext2: 'jpg' },
  { name: 'Bangladesh',     label: 'Bangladesh',       ext1: 'png', ext2: 'jpg' },
  { name: 'SriLanka',       label: 'Sri Lanka',        ext1: 'png', ext2: 'jpg' },
  { name: 'Malasia',        label: 'Malasia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Laos',           label: 'Laos',             ext1: 'png', ext2: 'jpg' },
  { name: 'Cambodia',       label: 'Cambodia',         ext1: 'png', ext2: 'jpg' },
  { name: 'Brunei',         label: 'Brunei',           ext1: 'png', ext2: 'jpg' },
  { name: 'Timor',          label: 'Timor Oriental',   ext1: 'png', ext2: 'jpg' },
  { name: 'Taiwan',         label: 'Taiwan',           ext1: 'png', ext2: 'jpg' },
  { name: 'Panama',         label: 'Panamá',           ext1: 'png', ext2: 'jpg' },
  { name: 'CostaRica',      label: 'Costa Rica',       ext1: 'png', ext2: 'jpg' },
  { name: 'Belice',         label: 'Belice',           ext1: 'png', ext2: 'jpg' },
  { name: 'ElSalvador',     label: 'El Salvador',      ext1: 'png', ext2: 'jpg' },
  { name: 'Trinidad',       label: 'Trinidad y Tobago', ext1: 'png', ext2: 'jpg' },
  { name: 'Surinam',        label: 'Surinam',          ext1: 'png', ext2: 'jpg' },
  { name: 'Guyana',         label: 'Guyana',           ext1: 'png', ext2: 'jpg' },
  { name: 'Jamaica',        label: 'Jamaica',          ext1: 'png', ext2: 'jpg' },
  { name: 'Guayana',        label: 'Guayana Francesa', ext1: 'png', ext2: 'jpg' },
  { name: 'Bahamas',        label: 'Bahamas',          ext1: 'png', ext2: 'jpg' },
  { name: 'Dominicana',     label: 'República Dominicana', ext1: 'png', ext2: 'jpg' },
  { name: 'Haiti',          label: 'Haití',            ext1: 'png', ext2: 'jpg' },
  { name: 'PuertoRico',     label: 'Puerto Rico',      ext1: 'png', ext2: 'jpg' },
  { name: 'Hawaii',         label: 'Hawaii',           ext1: 'png', ext2: 'jpg' },
  { name: 'Tunez',          label: 'Túnez',            ext1: 'png', ext2: 'jpg' },
  { name: 'Guinea',         label: 'Guinea',           ext1: 'png', ext2: 'jpg' },
  { name: 'CostaDeMarfil',  label: 'Costa de Marfil',  ext1: 'png', ext2: 'jpg' },
  { name: 'Ghana',          label: 'Ghana',            ext1: 'png', ext2: 'jpg' },
  { name: 'Liberia',        label: 'Liberia',          ext1: 'png', ext2: 'jpg' },
  { name: 'SierraLeona',    label: 'Sierra Leona',     ext1: 'png', ext2: 'jpg' },
  { name: 'GuineaBisau',    label: 'Guinea-Bisáu',     ext1: 'png', ext2: 'jpg' },
  { name: 'Gambia',         label: 'Gambia',           ext1: 'png', ext2: 'jpg' },
  { name: 'BurkinaFaso',    label: 'Burkina Faso',     ext1: 'png', ext2: 'jpg' },
  { name: 'Senegal',        label: 'Senegal',          ext1: 'png', ext2: 'jpg' },
  { name: 'Benin',          label: 'Benín',            ext1: 'png', ext2: 'jpg' },
  { name: 'Togo',           label: 'Togo',             ext1: 'png', ext2: 'jpg' },
  { name: 'Uganda',         label: 'Uganda',           ext1: 'png', ext2: 'jpg' },
  { name: 'SudanDelSur',    label: 'Sudán del Sur',    ext1: 'png', ext2: 'jpg' },
  { name: 'Congo',          label: 'República del Congo', ext1: 'png', ext2: 'jpg' },
  { name: 'Gabon',          label: 'Gabón',            ext1: 'png', ext2: 'jpg' },
  { name: 'GuineaEcuator',  label: 'Guinea Ecuatorial', ext1: 'png', ext2: 'jpg' },
  { name: 'Burundi',        label: 'Burundi',          ext1: 'png', ext2: 'jpg' },
  { name: 'Ruanda',         label: 'Ruanda',           ext1: 'png', ext2: 'jpg' },
  { name: 'Sahara',         label: 'Sahara Occidental', ext1: 'png', ext2: 'jpg' },
  { name: 'CaboVerde',      label: 'Cabo Verde',       ext1: 'png', ext2: 'jpg' },
  { name: 'IslasCanarias',  label: 'Islas Canarias',   ext1: 'png', ext2: 'jpg' },
  { name: 'Yibuti',         label: 'Yibuti',           ext1: 'png', ext2: 'jpg' },
  { name: 'Eritrea',        label: 'Eritrea',          ext1: 'png', ext2: 'jpg' },
  { name: 'Esuatini',       label: 'Esuatini',         ext1: 'png', ext2: 'jpg' },
  { name: 'Malaui',         label: 'Malaui',           ext1: 'png', ext2: 'jpg' },
  { name: 'Lesoto',         label: 'Lesoto',           ext1: 'png', ext2: 'jpg' },
  { name: 'Seychelles',     label: 'Seychelles',       ext1: 'png', ext2: 'jpg' },
  { name: 'IslasSalomon',   label: 'Islas Salomón',    ext1: 'png', ext2: 'jpg' },
  { name: 'Vanuatu',        label: 'Vanuatu',          ext1: 'png', ext2: 'jpg' },
  { name: 'NuevaCaledonia', label: 'Nueva Caledonia',  ext1: 'png', ext2: 'jpg' },
  { name: 'Fiji',           label: 'Fiji',             ext1: 'png', ext2: 'jpg' },
  { name: 'Samoa',          label: 'Samoa',            ext1: 'png', ext2: 'jpg' },
];

// ── Pool system ──────────────────────────────────────────────────────────────
// Unlock thresholds: 1 correct → fácil | 10 → medio (3 batches) | 30 → difícil

const SHAPES_POOL_INICIO = new Set([
  'Italia','Japon','EstadosUnidos','ReinoUnido','Mexico','Canada','China',
]);

const SHAPES_POOL_FACIL = [
  'India','Noruega','Australia','Francia','NuevaZelanda','Tailandia',
  'Rusia','Brasil','Argentina','Cuba','Irlanda','Chile','Turquia',
  'Vietnam','Polonia','Espana','Iran','Madagascar','Alemania','Suecia',
  'Finlandia','Mongolia','Sudafrica','Egipto',
];

// Ordered from most to least recognizable so the 3-batch unlock makes sense
const SHAPES_POOL_MEDIO = [
  // batch 1 (unlocks at 10 correct)
  'Groenlandia','Indonesia','Kazajistan','ArabiaSaudita','Ucrania','Pakistan',
  'Afganistan','CoreaDelSur','CoreaDelNorte','Myanmar','Filipinas','PapGuinea',
  'Peru','Colombia','Venezuela','Bolivia','Ecuador',
  'PaisesBajos','Austria','Hungria','Suiza','Grecia','Portugal','Rumania','Bulgaria',
  // batch 2 (unlocks at 17 correct)
  'Dinamarca','Islandia','Croacia','Somalia','Irak','Yemen','Oman',
  'Israel','Siria','Nepal','Bangladesh','SriLanka','Malasia','Laos','Cambodia','Taiwan',
  'Alaska','Marruecos','Nigeria','Argelia','Sudan','Etiopia','Angola','Tanzania','Kenia',
  // batch 3 (unlocks at 24 correct)
  'RepDemCongo','Niger','Mali','Libia','Mauritania','Mozambique','Namibia',
  'Zimbabue','Botsuana','Camerun','Chad',
  'Nicaragua','Honduras','Guatemala','Uruguay','Paraguay','Panama','CostaRica',
  'Haiti','Dominicana','Ghana','Senegal','CostaDeMarfil','Uganda','Tunez','SudanDelSur',
];

const SHAPES_POOL_DIFICIL = [
  'Luxemburgo','Belgica','Eslovaquia','RepCheca','Kosovo','Albania','Bosnia','Serbia',
  'Moldavia','Macedonia','Eslovenia','Letonia','Estonia','Bielorrusia','Lituania',
  'Chipre','Malta','Andorra','Liechtenstein',
  'Jordania','Libano','Tayikistan','Emiratos','Catar','Turkmenistan','Kuwait',
  'Azerbaijan','Armenia','Palestina','Kirguistan','Uzbekistan','Georgia',
  'Butan','Brunei','Timor',
  'Belice','ElSalvador','Trinidad','Surinam','Guyana','Guayana','Bahamas','PuertoRico','Hawaii','Jamaica',
  'Guinea','Liberia','SierraLeona','GuineaBisau','Gambia','BurkinaFaso','Benin','Togo',
  'Congo','Gabon','GuineaEcuator','Burundi','Ruanda',
  'Sahara','CaboVerde','IslasCanarias','Yibuti','Eritrea','Esuatini','Malaui','Lesoto','Seychelles',
  'IslasSalomon','Vanuatu','NuevaCaledonia','Fiji','Samoa',
];

function getActiveShapesPool() {
  const names = new Set(SHAPES_POOL_INICIO);
  if (shapesCorrectCount >= 1) SHAPES_POOL_FACIL.forEach(n => names.add(n));
  if (shapesCorrectCount >= 10) {
    const batch1End = 25;
    const batch2End = 50;
    const limit = shapesCorrectCount >= 24 ? SHAPES_POOL_MEDIO.length
                : shapesCorrectCount >= 17 ? batch2End
                : batch1End;
    SHAPES_POOL_MEDIO.slice(0, limit).forEach(n => names.add(n));
  }
  if (shapesCorrectCount >= 30) SHAPES_POOL_DIFICIL.forEach(n => names.add(n));
  return SHAPE_COUNTRIES.filter(c => names.has(c.name));
}
// ─────────────────────────────────────────────────────────────────────────────

const SHAPES_PREGAME_STEPS = [
  { src: 'images/countdown/3.png',  hold: 800,  size: 420 },
  { src: 'images/countdown/2.png',  hold: 800,  size: 420 },
  { src: 'images/countdown/1.png',  hold: 800,  size: 420 },
  { src: 'images/countdown/go.png', hold: 950,  size: 490 },
];

function runShapesPregame(onDone) {
  const el  = document.getElementById('pregame-countdown');
  const img = document.getElementById('pregame-countdown-img');
  if (!el || !img) { onDone(); return; }
  el.style.display = 'flex';
  if (typeof sfxCountdown !== 'undefined') { sfxCountdown.currentTime = 0; sfxCountdown.play(); }
  let step = 0;
  function showStep() {
    if (step >= SHAPES_PREGAME_STEPS.length) { el.style.display = 'none'; onDone(); return; }
    const { src, hold, size } = SHAPES_PREGAME_STEPS[step++];
    img.style.animation = 'none';
    img.style.width     = size + 'px';
    img.style.height    = size + 'px';
    img.src = src;
    void img.offsetWidth;
    img.style.animation = '';
    setTimeout(showStep, hold);
  }
  showStep();
}

// ── SHOW / HIDE SHAPES MODE ───────────────────────────────────────────────────
function showShapesMode() {
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  if (typeof playMusic   !== 'undefined') playMusic(null);

  document.getElementById('loading-screen').style.display = 'none';
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'block';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'flex'; rightPanel.style.zIndex = '120'; }

  shapesScore = 0; shapesDisplayedScore = 0; shapesStreak = 0; shapesDots = 0;
  shapesTrainTimeouts.forEach(clearTimeout); shapesTrainTimeouts = [];
  shapesAnsweredSet    = new Set();
  shapesWrongCooldown  = new Map();
  shapesCorrectCount   = 0;
  shapesWrongAnswerCount = 0;

  const scoreEl = document.getElementById('score-value');
  if (scoreEl) scoreEl.textContent = '0';
  if (typeof lastLbScore    !== 'undefined') lastLbScore    = -1;
  if (typeof lastPlayerRank !== 'undefined') lastPlayerRank = -1;
  if (typeof lbElements !== 'undefined') {
    Object.values(lbElements).forEach(el => { el.style.transition = 'none'; });
  }
  requestAnimationFrame(() => {
    if (typeof positionLeaderboard !== 'undefined') positionLeaderboard(0, false);
    requestAnimationFrame(() => {
      if (typeof lbElements !== 'undefined') {
        Object.values(lbElements).forEach(el => {
          el.style.transition = 'top 0.7s cubic-bezier(0.22,1,0.36,1)';
        });
      }
    });
  });

  const PREGAME_DURATION = SHAPES_PREGAME_STEPS.reduce((s, x) => s + x.hold, 0);
  let c;
  if (document.body.classList.contains('recording-mode')) {
    c = SHAPE_COUNTRIES.find(co => co.name === 'China');
  } else {
    const initActive = getActiveShapesPool();
    const initPool   = initActive.filter(co => !shapesAnsweredSet.has(co.name));
    const initSrc    = initPool.length > 0 ? initPool : initActive;
    c = initSrc[Math.floor(Math.random() * initSrc.length)];
  }
  showCountryShape(c.name, c.ext1, c.ext2, PREGAME_DURATION);

  runShapesPregame(() => {
    if (typeof playMusic !== 'undefined') playMusic(sfxGameMusic);
    shapesTimeLeft = 60;
    shapesRunning  = true;

    clearInterval(shapesTimerIntervalId);
    shapesTimerIntervalId = setInterval(() => {
      const tEl  = document.getElementById('shapes-timer-number');
      const tImg = document.getElementById('shapes-timer-img');
      shapesTimeLeft--;
      if (tEl) tEl.textContent = shapesTimeLeft;
      if (shapesTimeLeft <= 10) {
        if (tEl)  tEl.style.color = '#ffffff';
        if (tImg) tImg.src = 'images/countdownred3.png';
        if (shapesTimeLeft > 0 && typeof sfxTickdown !== 'undefined') { sfxTickdown.currentTime = 0; sfxTickdown.play(); }
      } else {
        if (tEl) tEl.style.color = '';
      }
      if (shapesTimeLeft <= 0) {
        clearInterval(shapesTimerIntervalId);
        shapesRunning = false;
        document.querySelectorAll('.shapes-tag').forEach(el => { el.style.cursor = 'default'; el.style.pointerEvents = 'none'; });
        clearTimeout(shapesCurrentAnimTimeout);
        clearTimeout(shapesCurrentClipFadeTimeout);
        if (shapesCurrentImg)  { const f = getComputedStyle(shapesCurrentImg).transform;  shapesCurrentImg.style.transition  = 'none'; shapesCurrentImg.style.transform  = f; }
        if (shapesCurrentImg2) { const f = getComputedStyle(shapesCurrentImg2).transform; shapesCurrentImg2.style.transition = 'none'; shapesCurrentImg2.style.transform = f; }
        if (shapesCurrentClip) { const f = getComputedStyle(shapesCurrentClip).opacity;   shapesCurrentClip.style.transition = 'none'; shapesCurrentClip.style.opacity   = f; }
        if (tImg) tImg.style.animationPlayState = 'paused';
        if (typeof sfxTimesUp !== 'undefined') { sfxTimesUp.currentTime = 0; sfxTimesUp.play(); }
        if (typeof playMusic  !== 'undefined') playMusic(null);
        const timeupEl = document.getElementById('timeup-overlay');
        if (timeupEl) {
          timeupEl.style.zIndex = '300';
          timeupEl.style.display = 'flex';
          timeupEl.classList.remove('timeup-out');
          timeupEl.classList.add('timeup-in');
          setTimeout(() => {
            timeupEl.classList.remove('timeup-in');
            timeupEl.classList.add('timeup-out');
            setTimeout(() => {
              timeupEl.style.display = 'none';
              timeupEl.classList.remove('timeup-out');
              hideShapesMode();
            }, 400);
          }, 1800);
        } else {
          hideShapesMode();
        }
      }
    }, 1000);
  }); // end runShapesPregame
}

function hideShapesMode() {
  // freeze & remove in-progress country display
  document.querySelectorAll('.shapes-tag').forEach(t => t.remove());
  if (shapesCurrentImg)   shapesCurrentImg.remove();
  if (shapesCurrentImg2)  shapesCurrentImg2.parentElement?.remove(); // clip div
  if (shapesCurrentClip)  shapesCurrentClip.remove();
  if (shapesCurrentBoard) shapesCurrentBoard.remove();
  if (shapesCurrentSvg)   shapesCurrentSvg.remove();
  shapesCurrentImg = shapesCurrentImg2 = shapesCurrentClip = null;
  shapesCurrentBoard = shapesCurrentSvg = null;

  // remove countdown widget so it's recreated fresh next game
  document.getElementById('shapes-countdown-widget')?.remove();

  // hide shared UI
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'none';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) rightPanel.style.display = 'none';
  if (shapesScoreRafId) { cancelAnimationFrame(shapesScoreRafId); shapesScoreRafId = null; }
  clearTimeout(shapesSpeedBonusHideId);
  const sbt = document.getElementById('speed-bonus-text');
  if (sbt) sbt.classList.remove('visible');

  // final score & highscore
  const finalScore = Math.round(shapesScore);
  const finalScoreEl = document.getElementById('final-score-value');
  if (finalScoreEl) finalScoreEl.textContent = finalScore.toLocaleString();
  const LS_HS = 'shapesHighscore';
  const prevHS = parseInt(localStorage.getItem(LS_HS) || '0', 10);
  const newHSBanner = document.getElementById('new-highscore-banner');
  const newHSScore  = document.getElementById('new-highscore-score');
  if (finalScore > prevHS) {
    localStorage.setItem(LS_HS, String(finalScore));
    if (newHSBanner) newHSBanner.style.display = 'flex';
    if (newHSScore)  newHSScore.textContent = finalScore.toLocaleString();
  } else {
    if (newHSBanner) newHSBanner.style.display = 'none';
  }

  // gameover screen
  if (typeof setModeCounts !== 'undefined') setModeCounts(shapesCorrectCount, shapesWrongAnswerCount);
  const gameoverScreen = document.getElementById('gameover-screen');
  if (gameoverScreen) {
    gameoverScreen.style.display = 'flex';
    const label = gameoverScreen.querySelector('.gameover-text1-label');
    if (label) label.textContent = '¡Increíble! ¡Los turistas están de camino!';
  }
  if (typeof restartFlightAtt !== 'undefined') restartFlightAtt();
  if (typeof buildChecksRow   !== 'undefined') buildChecksRow();
  const checksEndTime = (shapesCorrectCount > 0 ? (shapesCorrectCount - 1) * 0.1 + 0.2 : 0) + 0.4;
  if (typeof buildWrongsRow   !== 'undefined') buildWrongsRow(checksEndTime);
  if (typeof playMusic        !== 'undefined') playMusic(sfxPostgame);
}
// ─────────────────────────────────────────────────────────────────────────────

document.getElementById('loading-shapes-btn').addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.play(); }
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  window.pendingGameMode = 'shapes';
  document.getElementById('splash-screen').classList.add('mode-flags', 'mode-shapes');
  document.getElementById('gameover-screen').classList.add('mode-flags', 'mode-shapes');
  const howtoplayVideo = document.querySelector('.splash-howtoplay-video');
  if (howtoplayVideo) { howtoplayVideo.src = 'images/howtoplay/howtoplay2.mp4'; howtoplayVideo.load(); }
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men5.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men6.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl5.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl6.png');
  document.querySelectorAll('.game-bg-women1').forEach(el => el.src = 'images/characters/women4.png');
  document.querySelectorAll('.game-bg-women2').forEach(el => el.src = 'images/characters/women5.png');
  document.querySelectorAll('.game-bg-city').forEach(el => el.src = 'images/bg/level2complete.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check2.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong2.png');
  const label = document.querySelector('.splash-text2-label');
  if (label) { label.textContent = '¿Adónde? Usando un mapa de cada país, veamos adónde vuelan nuestros turistas.'; label.classList.remove('step2'); }
  const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
  if (howtoWrap) howtoWrap.classList.remove('slide-down');
  const howtoTitle = document.querySelector('.splash-howtoplay-title');
  if (howtoTitle) howtoTitle.textContent = 'Map Mayhem';
  document.getElementById('loading-screen').style.display = 'none';
  const splashEl = document.getElementById('splash-screen');
  splashEl.style.display = 'flex';
  const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
  void splashEl.offsetWidth;
  animEls.forEach(el => el.classList.add('animate-in'));
  if (typeof playMusic !== 'undefined') playMusic(sfxPostgame);
});

document.getElementById('loading-shapes-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxSelect.play(); }
});

// ── MODO MONUMENTOS (placeholder) ────────────────────────────────────────────
document.getElementById('loading-mode4-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxSelect.play(); }
});

document.getElementById('loading-mode4-btn').addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.play(); }
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();
  window.pendingGameMode = 'monuments';
  document.getElementById('splash-screen').classList.remove('mode-flags', 'mode-shapes');
  document.getElementById('splash-screen').classList.add('mode-monuments');
  document.getElementById('gameover-screen').classList.remove('mode-flags', 'mode-shapes');
  document.querySelectorAll('.game-bg-men1').forEach(el => el.src = 'images/characters/men1.png');
  document.querySelectorAll('.game-bg-men2').forEach(el => el.src = 'images/characters/men2.png');
  document.querySelectorAll('.game-bg-girl1').forEach(el => el.src = 'images/characters/girl1.png');
  document.querySelectorAll('.game-bg-girl2').forEach(el => el.src = 'images/characters/girl2.png');
  document.querySelectorAll('.game-bg-check3').forEach(el => el.src = 'images/check4.png');
  document.querySelectorAll('.game-bg-wrong3').forEach(el => el.src = 'images/wrong4.png');
  const label = document.querySelector('.splash-text2-label');
  if (label) { label.textContent = '¡Vale, es hora de hacer un poco de turismo! ¿Qué tal es tu conocimiento de monumentos famosos?'; label.classList.remove('step2'); }
  const howtoWrap = document.querySelector('.splash-howtoplay-wrap');
  if (howtoWrap) howtoWrap.classList.remove('slide-down');
  const howtoTitle = document.querySelector('.splash-howtoplay-title');
  if (howtoTitle) howtoTitle.textContent = 'Landmark Loco';
  const howtoVideo = document.querySelector('.splash-howtoplay-video');
  if (howtoVideo) { howtoVideo.pause(); howtoVideo.src = 'images/howtoplay/howtoplay4.mp4'; howtoVideo.load(); }
  document.getElementById('loading-screen').style.display = 'none';
  const splashEl = document.getElementById('splash-screen');
  splashEl.style.display = 'flex';
  const animEls = splashEl.querySelectorAll('.flightatt-splash, .splash-text2-wrap');
  animEls.forEach(el => el.classList.remove('animate-in'));
  void splashEl.offsetWidth;
  animEls.forEach(el => el.classList.add('animate-in'));
  if (typeof playMusic !== 'undefined') playMusic(sfxPostgame);
});
