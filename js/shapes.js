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
let shapesCurrentAnimTimeout = null, shapesCurrentClipFadeTimeout = null;
let shapesSpeedBonusHideId = null;
const SHAPES_SPEED_WIN  = 2.0;
const SHAPES_SPEED_MULT = 1.5;
const SHAPES_GRACE      = 0.8;
let shapesScore = 0;
let shapesDisplayedScore = 0;
let shapesScoreRafId = null;

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
    if (el) el.textContent = shapesDisplayedScore;
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

  const board = document.createElement('img');
  board.src = 'images/countryboard.png';
  board.style.cssText = 'position:fixed;top:50%;left:36%;transform:translate(-50%,-50%) scaleX(0.96);width:85.15vmin;height:auto;z-index:99;';
  board.draggable = false;
  document.body.appendChild(board);


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

  const correctLabel = SHAPE_COUNTRIES.find(c => c.name === country).label;
  const distractors = SHAPE_COUNTRIES
    .filter(c => c.name !== country)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(c => c.label);
  const correctIdx = Math.floor(Math.random() * 4);
  const options = [...distractors];
  options.splice(correctIdx, 0, correctLabel);

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
        shapesStreak++;
        if (sfxAcertar) { sfxAcertar.currentTime = 0; sfxAcertar.play(); }
        const pts        = typeof getFlagsRoundPoints !== 'undefined' ? getFlagsRoundPoints(shapesStreak) : 10;
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
          const next = SHAPE_COUNTRIES[Math.floor(Math.random() * SHAPE_COUNTRIES.length)];
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
  { name: 'Italia',         label: 'Italia',           ext1: 'png', ext2: 'jpg' },
  { name: 'Chile',          label: 'Chile',            ext1: 'png', ext2: 'jpg' },
  { name: 'Japon',          label: 'Japón',            ext1: 'png', ext2: 'jpg' },
  { name: 'Australia',      label: 'Australia',        ext1: 'png', ext2: 'jpg' },
  { name: 'EstadosUnidos',  label: 'Estados Unidos',   ext1: 'png', ext2: 'jpg' },
  { name: 'Brasil',         label: 'Brasil',           ext1: 'png', ext2: 'jpg' },
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
  { name: 'RepDemCongo',    label: 'República Democrática del Congo',         ext1: 'png', ext2: 'jpg' },
  { name: 'Zimbabue',       label: 'Zimbabue',         ext1: 'png', ext2: 'jpg' },
  { name: 'Namibia',        label: 'Namibia',          ext1: 'png', ext2: 'jpg' },
  { name: 'Botsuana',       label: 'Botsuana',         ext1: 'png', ext2: 'jpg' },
  { name: 'Camerun',        label: 'Camerún',          ext1: 'png', ext2: 'jpg' },
  { name: 'Chad',           label: 'Chad',             ext1: 'png', ext2: 'jpg' },
  { name: 'PapGuinea',      label: 'Papúa Nueva Guinea',         ext1: 'png', ext2: 'jpg' },
  { name: 'Groenlandia',    label: 'Groenlandia',      ext1: 'png', ext2: 'jpg' },

];

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

document.getElementById('loading-shapes-btn').addEventListener('click', () => {
  if (typeof sfxCheck !== 'undefined') { sfxCheck.currentTime = 0; sfxCheck.play(); }
  if (typeof loadGameSFX !== 'undefined') loadGameSFX();

  document.getElementById('loading-screen').style.display = 'none';
  const scoreDisplay = document.getElementById('score-display');
  if (scoreDisplay) scoreDisplay.style.display = 'block';
  const rightPanel = document.getElementById('right-panel');
  if (rightPanel) { rightPanel.style.display = 'flex'; rightPanel.style.zIndex = '120'; }

  shapesScore = 0; shapesDisplayedScore = 0; shapesStreak = 0; shapesDots = 0;
  shapesTrainTimeouts.forEach(clearTimeout); shapesTrainTimeouts = [];

  const PREGAME_DURATION = SHAPES_PREGAME_STEPS.reduce((s, x) => s + x.hold, 0);
  const c = SHAPE_COUNTRIES[Math.floor(Math.random() * SHAPE_COUNTRIES.length)];
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
      if (typeof playMusic !== 'undefined') playMusic(null);
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
          }, 400);
        }, 1800);
      }
    }
  }, 1000);

  }); // end runShapesPregame
});

document.getElementById('loading-shapes-btn').addEventListener('mouseenter', () => {
  if (typeof sfxSelect !== 'undefined') { sfxSelect.currentTime = 0; sfxSelect.play(); }
});
