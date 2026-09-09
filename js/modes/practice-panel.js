// ============================================================================
// modes/practice-panel.js — Practice mode (Practice Tour): window.practiceConfig,
// config panel (pick mode / continents / timer pills / monuments difficulty),
// showPracticePanel/hidePracticePanel/backFromConfig, buildPracticeImgRow + score
// popup (showPracticeScore), endPracticeSession, and the Start button.
//
// Classic <script>s sharing one global scope, loaded in order in play/index.html.
// ============================================================================

// ═══════════════════════════════════════════════════════════════
// PRACTICE TOUR — panel, config, logic
// ═══════════════════════════════════════════════════════════════
window.practiceConfig = {
  active: false,
  mode: null,        // 'game'|'flags'|'shapes'|'monuments'
  continents: new Set(['america','europa','africa','asia','oceania']),
  timer: 60,         // seconds; 0 = infinite
  difficulty: 'facil', // monuments only
};

let _hidePracticeTimer = null;

// Show the practice panel, hide panel 2
function showPracticePanel() {
  // Cancel any pending hidePracticePanel timer to avoid a race condition
  clearTimeout(_hidePracticeTimer);
  _hidePracticeTimer = null;
  document.getElementById('loading-screen')?.classList.add('table-shown');
  const lpg = document.getElementById('loading-practice-group');
  lpg.style.display = '';
  lpg.classList.remove('panel-visible', 'table-gone');
  void lpg.offsetWidth;
  lpg.classList.add('panel-visible');
  // Reset to the modes section
  document.getElementById('practice-mode-section').style.display = '';
  document.getElementById('practice-config-section').style.display = 'none';
  document.getElementById('practice-score-popup').style.display = 'none';
}

// Return from practice to panel 2
function hidePracticePanel() {
  const lpg = document.getElementById('loading-practice-group');
  document.getElementById('loading-screen')?.classList.remove('table-shown');
  lpg.classList.remove('panel-visible');
  lpg.classList.add('table-gone');
  clearTimeout(_hidePracticeTimer);
  _hidePracticeTimer = setTimeout(() => {
    _hidePracticeTimer = null;
    lpg.style.display = 'none';
    lpg.classList.remove('table-gone');
  }, 400);
}

// Show the score popup when the session ends
function buildPracticeImgRow(rowId, count, imgSrc, startDelay) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.innerHTML = '';
  row.style.gap = '0px';
  if (count === 0) {
    const none = document.createElement('span');
    none.textContent = 'None';
    none.style.cssText = 'font-family:VAGRoundBold,"Arial Black",sans-serif;font-size:1.8cqmin;color:#888;';
    row.appendChild(none);
    return;
  }
  // Squeeze logic: IMG_W in cqmin; MAX_W = space available inside the fixed panel (46cqmin − padding − label)
  const IMG_W = 3.5;   // cqmin, matches .practice-score-imgs-row img
  const BASE_GAP = 0.2; // cqmin normal gap
  const MAX_W = 28;
  // Squeeze when the natural width (imgs + gaps) exceeds MAX_W. The threshold
  // used to be a fixed `count > 12`, but with IMG_W=3.5 overflow starts around
  // count≈8 (8·3.5 = 28): between 9 and 12 checks the PNGs spilled out of the card.
  const naturalW = count * IMG_W + Math.max(0, count - 1) * BASE_GAP;
  const gap = count <= 1 ? 0
            : (naturalW > MAX_W ? (MAX_W - count * IMG_W) / (count - 1) : BASE_GAP);
  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = '';
    img.style.animationDelay = `${startDelay + i * 0.08}s`;
    img.style.zIndex = 16 + i;
    if (i < count - 1) img.style.marginRight = gap + 'cqmin';
    row.appendChild(img);
  }
}

window.showPracticeScore = function(score) {
  // Show the panel without an entrance animation (coming from the game over)
  document.getElementById('loading-screen')?.classList.add('table-shown');
  const lpg = document.getElementById('loading-practice-group');
  lpg.style.display = '';
  lpg.classList.remove('table-gone');
  lpg.classList.add('panel-visible');
  // Restore the config of the mode played
  const mode = window.practiceConfig.mode;
  document.getElementById('practice-mode-section').style.display = 'none';
  const cfg = document.getElementById('practice-config-section');
  cfg.style.display = '';
  cfg.classList.toggle('practice-mode-monuments', mode === 'monuments');
  document.getElementById('practice-continents').style.display = mode !== 'monuments' ? '' : 'none';
  document.getElementById('practice-difficulty').style.display = mode === 'monuments' ? '' : 'none';

  const popup = document.getElementById('practice-score-popup');
  document.getElementById('practice-score-val').textContent = score.toLocaleString();
  const stats = window._practiceStats || {};
  const elapsed = stats.startTime ? Math.round((Date.now() - stats.startTime) / 1000) : 0;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const timeEl = document.getElementById('practice-score-time');
  if (timeEl) timeEl.textContent = mm + ':' + ss;

  const correct = stats.correct || 0;
  const wrong   = stats.wrong   || 0;
  const checkSrc = mode === 'flags' ? 'images/check1.png'
                 : mode === 'shapes' ? 'images/check2.png'
                 : mode === 'monuments' ? 'images/check4.png'
                 : 'images/check3.png';
  const wrongSrc = mode === 'flags' ? 'images/wrong1.png'
                 : mode === 'shapes' ? 'images/wrong2.png'
                 : mode === 'monuments' ? 'images/wrong4.png'
                 : 'images/wrong3.png';
  buildPracticeImgRow('practice-score-checks-row', correct, checkSrc, 0);
  buildPracticeImgRow('practice-score-wrongs-row', wrong, wrongSrc, correct * 0.08 + 0.1);
  const correctEl = document.getElementById('practice-score-correct');
  if (correctEl) correctEl.textContent = 'x' + correct;
  const wrongEl = document.getElementById('practice-score-wrong');
  if (wrongEl) wrongEl.textContent = 'x' + wrong;

  popup.style.display = 'flex';
};

// Close a practice session (natural timeout or manual quit) and return to the
// practice panel with the score. The single point for this sequence — it used
// to be duplicated almost identically in mapgame-play.js (x2), flags.js and
// shapes.js, which made the copies prone to drifting apart.
window.endPracticeSession = function (score, correct, wrong) {
  window.practiceConfig.active = false;
  document.body.classList.remove('practice-mode');
  if (typeof window.resetEntranceElements === 'function') window.resetEntranceElements();
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.display = 'flex'; ls.style.opacity = '1'; }
  try { if (typeof playMusic !== 'undefined') playMusic(window.sfxMenuMusic || sfxMenuMusic); } catch (e) {}
  if (typeof window.showEntranceElementsStatic === 'function') window.showEntranceElementsStatic();
  if (window._practiceStats) {
    window._practiceStats.correct = correct || 0;
    window._practiceStats.wrong   = wrong   || 0;
  }
  window.showPracticeScore(score);
};

// ── Versus / practice buttons
document.getElementById('loading-panel2-versus')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (!window._accountLoggedIn) {
    document.getElementById('social-lock-popup')?.classList.add('open');
    return;
  }
  if (typeof window.showVersusPanel === 'function') window.showVersusPanel();
});

document.getElementById('loading-panel2-practice')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  if (window._lobbyCountingDown) {
    window.showGlobalToast(t('lobby.cdBlocked'));
    return;
  }
  showPracticePanel();
});

// ── Back from practice: from config → modes, from modes → panel 2
document.getElementById('practice-back-wrap')?.addEventListener('click', () => {
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  const configVisible = document.getElementById('practice-config-section')?.style.display !== 'none';
  if (configVisible) { backFromConfig(); } else { hidePracticePanel(); }
});

// ── Mode buttons
const PRACTICE_MODE_LABELS = { flags: 'Suitcase Shuffle', shapes: 'Map Mayhem', game: 'City Blitz', monuments: 'Landmark Loco' };
const PRACTICE_MODE_VIDEOS = { flags: 'images/howtoplay/howtoplay1.mp4', shapes: 'images/howtoplay/howtoplay2.mp4', game: 'images/howtoplay/howtoplay3.mp4', monuments: 'images/howtoplay/howtoplay4.mp4' };
document.querySelectorAll('.practice-mode-item').forEach(btn => {
  btn.addEventListener('click', () => {
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    const mode = btn.dataset.mode;
    window.practiceConfig.mode = mode;
    // Hide "Pick a mode"
    const chooseLabel = document.querySelector('.practice-choose-label');
    if (chooseLabel) chooseLabel.style.display = 'none';
    // Show config
    document.getElementById('practice-mode-section').style.display = 'none';
    const cfg = document.getElementById('practice-config-section');
    cfg.style.display = '';
    cfg.classList.toggle('practice-mode-monuments', mode === 'monuments');
    // Mode name
    document.getElementById('practice-config-title').textContent = PRACTICE_MODE_LABELS[mode] || mode;
    // Howtoplay video
    const vid = document.getElementById('practice-config-video');
    if (vid) {
      // Chrome-iOS: same decode crash as the real splash (see IS_CHROME_IOS) —
      // static poster, no load()/play().
      if (IS_CHROME_IOS) { vid.poster = PRACTICE_MODE_VIDEOS[mode].replace(/howtoplay(\d)\.mp4$/, 'howtoplay$1-poster.jpg'); }
      else { vid.src = PRACTICE_MODE_VIDEOS[mode]; vid.load(); vid.play().catch(() => {}); }
    }
    // Show continents or difficulty depending on the mode
    const showCont = mode !== 'monuments';
    document.getElementById('practice-continents').style.display  = showCont ? '' : 'none';
    document.getElementById('practice-difficulty').style.display  = showCont ? 'none' : '';
  });
});

// ── Continent toggle
document.querySelectorAll('.practice-continent-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const active = document.querySelectorAll('.practice-continent-btn.active');
    if (btn.classList.contains('active') && active.length <= 1) {
      btn.classList.add('continent-error');
      setTimeout(() => btn.classList.remove('continent-error'), 350);
      return;
    }
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    btn.classList.toggle('active');
  });
});

// ── Timer pills
const TIMER_IDX_TO_SEC = { 1: 30, 2: 60, 3: 120, 4: 180, 5: 0 };

function updateTimerUI(idx) {
  // image
  document.querySelectorAll('.practice-time-img').forEach(img => {
    img.classList.toggle('active', parseInt(img.dataset.timeidx, 10) === idx);
  });
  // range fill (webkit via background gradient)
  const range = document.getElementById('practice-timeline-range');
  if (range) {
    const pct = (idx - 1) / 4 * 100;
    range.style.background = `linear-gradient(to right, #073A79 ${pct}%, rgba(7,58,121,0.25) ${pct}%)`;
  }
}

const practiceRange = document.getElementById('practice-timeline-range');
if (practiceRange) {
  let _lastRangeIdx = 2;
  practiceRange.addEventListener('input', () => {
    const idx = parseInt(practiceRange.value, 10);
    if (idx !== _lastRangeIdx) {
      const s = new Audio('sfx/select.mp3');
      if (localStorage.getItem('muted') !== 'true') s.play().catch(() => {});
      _lastRangeIdx = idx;
    }
    window.practiceConfig.timer = TIMER_IDX_TO_SEC[idx];
    updateTimerUI(idx);
  });

  // On mobile (iOS/Android) a range inside a parent with transform:scale loses
  // the relation between touch and thumb position. getBoundingClientRect returns
  // correct visual coords, so we compute the value manually.
  ['touchstart', 'touchmove'].forEach(evt => {
    practiceRange.addEventListener(evt, e => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect  = practiceRange.getBoundingClientRect();
      const min   = parseInt(practiceRange.min,  10);
      const max   = parseInt(practiceRange.max,  10);
      const step  = parseInt(practiceRange.step, 10) || 1;
      const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      const val   = Math.round((min + ratio * (max - min)) / step) * step;
      if (parseInt(practiceRange.value, 10) !== val) {
        practiceRange.value = val;
        practiceRange.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { passive: false });
  });
}
// init with the default (idx 2 → 60s)
updateTimerUI(2);

// ── Difficulty (monuments) — radio: only one active
document.querySelectorAll('.practice-diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('active')) return;
    sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
    document.querySelectorAll('.practice-diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function backFromConfig() {
  document.getElementById('practice-config-section').style.display = 'none';
  document.getElementById('practice-mode-section').style.display = '';
  const chooseLabel = document.querySelector('.practice-choose-label');
  if (chooseLabel) chooseLabel.style.display = '';
  const vid = document.getElementById('practice-config-video');
  if (vid) { vid.pause(); vid.src = ''; }
}

// ── OK on the score popup
document.getElementById('practice-score-btn')?.addEventListener('click', function() {
  this.classList.add('confirm-pressed');
  setTimeout(() => this.classList.remove('confirm-pressed'), 200);
  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);
  document.getElementById('practice-score-popup').style.display = 'none';
});

// ── Start
document.getElementById('practice-start-btn')?.addEventListener('click', function() {
  this.classList.add('confirm-pressed');
  setTimeout(() => this.classList.remove('confirm-pressed'), 200);
  window._autoDismissVsInvites?.();

  const mode = window.practiceConfig.mode;
  if (!mode) return;

  // Validate continents (only for modes with a filter)
  const continents = new Set(
    [...document.querySelectorAll('.practice-continent-btn.active')].map(b => b.dataset.continent)
  );
  if (mode !== 'monuments' && continents.size === 0) {
    alert('Selecciona al menos un continente.');
    return;
  }
  const activeD = document.querySelector('.practice-diff-btn.active');

  window.practiceConfig.active      = true;
  window.practiceConfig.continents  = continents;
  // difficulty only applies to monuments; other modes use 'dificil' (no restriction)
  window.practiceConfig.difficulty  = mode === 'monuments' ? (activeD ? activeD.dataset.diff : 'facil') : 'dificil';
  window._practiceStats = { correct: 0, wrong: 0, startTime: null };
  document.body.classList.add('practice-mode');

  sfxCheck.currentTime = 0; sfxPlay(sfxCheck);

  { const lpg = document.getElementById('loading-practice-group'); lpg.classList.remove('panel-visible'); lpg.classList.add('table-gone'); }
  const ls = document.getElementById('loading-screen');
  if (ls) ls.style.display = 'flex';

  const btnMap = {
    'game':      'loading-play-btn',
    'monuments': 'loading-mode4-btn',
    'flags':     'loading-flags-btn',
    'shapes':    'loading-shapes-btn',
  };
  const btnId = btnMap[mode];
  if (btnId) document.getElementById(btnId)?.click();
});
