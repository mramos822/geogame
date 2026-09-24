// ── GloboReto menu popups ────────────────────────────────────────────────────
// Two popups shown when the player gets back to the menu (web + portal builds):
//
// 1) "Try GloboReto" invite — after playing any OTHER mode, to players who
//    never played GloboReto (no streak ever on the account/device and never
//    opened it here). Once per session; "Not now" snoozes it for a day.
//
// 2) "You started a streak!" — the first time in their life a player secures
//    a GloboReto streak day (gqStreakUpdated event with first=true, fired by
//    updateStreak in js/globequiz.js), shown on leaving GloboReto. Once per
//    device (localStorage).
//
// Both use the cream .account-modal look (same as #gq-guest-popup, whose
// streak flame they reuse), pop-in animation and the menu click sound, and
// wait for the menu to be free of other popups before opening.
(function () {
  const INVITE_SNOOZE_KEY = '_gqInviteSnoozedAt';
  const EVER_OPENED_KEY = '_gqEverOpened';
  const STREAK_START_SHOWN_KEY = '_gqStreakStartShown';

  const TEXT = {
    es: {
      inviteTitle: '¿Ya probaste GloboReto?',
      inviteDesc: 'Cada día hay un país secreto nuevo. Adivínalo en el globo 3D con pistas de distancia y dirección, y juega todos los días para armar tu racha.',
      inviteGo: 'Jugar GloboReto', later: 'Ahora no',
      streakTitle: '¡Iniciaste una racha!',
      streakDesc: 'Tu racha cuenta los días seguidos que ganas el GloboReto. Vuelve mañana a adivinar el nuevo país para que siga creciendo: si un día no juegas, vuelve a cero.',
      streakOk: '¡Entendido!',
    },
    en: {
      inviteTitle: 'Have you tried GloboReto?',
      inviteDesc: 'Every day there is a new secret country. Guess it on the 3D globe with distance and direction hints, and play every day to build your streak.',
      inviteGo: 'Play GloboReto', later: 'Not now',
      streakTitle: 'You started a streak!',
      streakDesc: "Your streak counts the days in a row you win GloboReto. Come back tomorrow to guess the new country so it keeps growing: miss a day and it goes back to zero.",
      streakOk: 'Got it!',
    },
  };
  function tx(key) {
    const lang = (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'es';
    return TEXT[lang][key];
  }
  function click() { try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {} }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function visible(el) { return !!el && getComputedStyle(el).display !== 'none'; }

  // Builds an .account-modal next to #account-modal (same container, so the
  // cqmin sizing and stacking match the rest of the menu popups).
  function makeModal(id, inner) {
    const modal = document.createElement('div');
    modal.className = 'account-modal';
    modal.id = id;
    modal.innerHTML = '<div class="account-modal-box">' + inner + '</div>';
    const ref = document.getElementById('account-modal');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(modal, ref);
    else document.body.appendChild(modal);
    return modal;
  }
  function openModal(modal) {
    const box = modal.querySelector('.account-modal-box');
    if (box) { box.style.animation = 'none'; box.offsetWidth; box.style.animation = ''; }
    click();
    modal.classList.add('open');
  }

  // Menu showing and nothing else on top of it.
  function menuIsClear() {
    if (!visible(document.getElementById('loading-screen'))) return false;
    if (document.querySelector('.account-modal.open')) return false;
    for (const id of ['founder-popup', 'ad-panel-overlay', 'name-prompt']) {
      const el = document.getElementById(id);
      if (el && visible(el) && (id !== 'name-prompt' || el.classList.contains('visible'))) return false;
    }
    if (document.querySelector('#welcome-popup.visible')) return false;
    return true;
  }
  async function waitMenuClear(maxMs) {
    for (let t = 0; t < maxMs && !menuIsClear(); t += 500) await new Promise((r) => setTimeout(r, 500));
    return menuIsClear();
  }

  function neverPlayedGloboReto() {
    if (lsGet(EVER_OPENED_KEY)) return false;
    const p = window._sbProfile;
    if (p && (p.gq_streak_last_date || (p.gq_streak_count || 0) > 0)) return false;
    if (lsGet('gq_streak_last_date')) return false;
    return true;
  }

  // ── 1) Invite ─────────────────────────────────────────────────────────────
  let inviteModal = null, invitedThisSession = false;
  function showInvite() {
    if (!inviteModal) {
      inviteModal = makeModal('gq-invite-popup',
        '<button class="account-modal-close" type="button" data-act="close">✕</button>' +
        '<span class="account-modal-title" data-t="inviteTitle" style="text-align:center"></span>' +
        '<img data-img="btn" alt="" draggable="false" oncontextmenu="return false" style="width:22cqmin;height:auto;pointer-events:none">' +
        '<p class="account-modal-desc" data-t="inviteDesc"></p>' +
        '<button class="account-modal-opt account-modal-login" type="button" data-act="go"></button>' +
        '<button class="account-modal-back" type="button" data-act="later"></button>');
      const close = () => { click(); inviteModal.classList.remove('open'); };
      inviteModal.querySelector('[data-act="close"]').addEventListener('click', close);
      inviteModal.querySelector('[data-act="later"]').addEventListener('click', () => {
        lsSet(INVITE_SNOOZE_KEY, String(Date.now()));
        close();
      });
      inviteModal.querySelector('[data-act="go"]').addEventListener('click', () => {
        click();
        inviteModal.classList.remove('open');
        document.getElementById('globequiz-btn')?.click();
      });
    }
    inviteModal.querySelector('[data-t="inviteTitle"]').textContent = tx('inviteTitle');
    inviteModal.querySelector('[data-t="inviteDesc"]').textContent = tx('inviteDesc');
    inviteModal.querySelector('[data-act="go"]').textContent = tx('inviteGo');
    inviteModal.querySelector('[data-act="later"]').textContent = tx('later');
    // Same (localized) art as the menu's GloboReto button.
    const btnImg = document.querySelector('#globequiz-btn > img');
    inviteModal.querySelector('[data-img="btn"]').src = btnImg ? btnImg.src : 'images/buttons/es-globequiz.png';
    openModal(inviteModal);
  }
  async function maybeInvite() {
    if (invitedThisSession || !neverPlayedGloboReto()) return;
    const snoozed = Number(lsGet(INVITE_SNOOZE_KEY) || 0);
    if (snoozed && Date.now() - snoozed < 24 * 3600 * 1000) return;
    if (!(await waitMenuClear(20000)) || !neverPlayedGloboReto() || invitedThisSession) return;
    invitedThisSession = true;
    showInvite();
  }

  // ── 2) Streak started ─────────────────────────────────────────────────────
  let pendingFirstStreak = null, streakModal = null;
  window.addEventListener('gqStreakUpdated', (e) => {
    const d = e.detail || {};
    if (d.first && !lsGet(STREAK_START_SHOWN_KEY)) pendingFirstStreak = d.streak || 1;
  });
  function showStreakStart(streak) {
    if (!streakModal) {
      streakModal = makeModal('gq-streak-start-popup',
        '<button class="account-modal-close" type="button" data-act="close">✕</button>' +
        '<span class="account-modal-title" data-t="streakTitle" style="text-align:center"></span>' +
        '<div class="gq-guest-popup-streak">' +
        '  <img class="gq-guest-popup-streak-img" src="images/streak.png" alt="" draggable="false" oncontextmenu="return false">' +
        '  <span class="gq-guest-popup-streak-num" data-t="num"></span>' +
        '</div>' +
        '<span class="account-modal-title" data-t="name" style="font-size:3cqmin"></span>' +
        '<p class="account-modal-desc" data-t="streakDesc"></p>' +
        '<button class="account-modal-opt account-modal-login" type="button" data-act="ok"></button>');
      const close = () => { click(); streakModal.classList.remove('open'); };
      streakModal.querySelector('[data-act="close"]').addEventListener('click', close);
      streakModal.querySelector('[data-act="ok"]').addEventListener('click', close);
    }
    streakModal.querySelector('[data-t="streakTitle"]').textContent = tx('streakTitle');
    streakModal.querySelector('[data-t="num"]').textContent = String(streak);
    const name = window._sbProfile?.username || lsGet('playerName') || '';
    const nameEl = streakModal.querySelector('[data-t="name"]');
    nameEl.textContent = name;
    nameEl.style.display = name ? '' : 'none';
    streakModal.querySelector('[data-t="streakDesc"]').textContent = tx('streakDesc');
    streakModal.querySelector('[data-act="ok"]').textContent = tx('streakOk');
    openModal(streakModal);
  }
  async function maybeShowStreakStart() {
    if (pendingFirstStreak == null) return false;
    if (!(await waitMenuClear(20000)) || pendingFirstStreak == null) return false;
    const streak = pendingFirstStreak;
    pendingFirstStreak = null;
    lsSet(STREAK_START_SHOWN_KEY, '1');
    showStreakStart(streak);
    return true;
  }

  // ── Menu button tag ────────────────────────────────────────────────────────
  // A small "NEW" tag centered above the GloboReto button until it's been
  // opened once. It only bobs gently (no glow) so it draws the eye without
  // being pushy; the invite popup above stays the only interruption.
  (function injectNudgeCss() {
    const st = document.createElement('style');
    st.textContent =
      '@keyframes gqNewBob { 0%,100% { transform: translateX(-50%) translateY(0) rotate(-3deg); } 50% { transform: translateX(-50%) translateY(-0.9cqmin) rotate(3deg); } }' +
      '#globequiz-btn .gq-new-badge { position: absolute; top: -3.6cqmin; left: 50%; z-index: 5; pointer-events: none; white-space: nowrap;' +
      " font-family: 'VAGRoundBold', 'Arial Black', sans-serif; font-size: 2.6cqmin; letter-spacing: 0.05em; color: #fff;" +
      ' background: #e8504a; border: 0.4cqmin solid #a32a26; border-radius: 1.4cqmin; padding: 0.4cqmin 1.5cqmin;' +
      ' box-shadow: 0 0.3cqmin 0.8cqmin rgba(0,0,0,0.25); animation: gqNewBob 1.3s ease-in-out infinite; }';
    document.head.appendChild(st);
  })();
  function updateNudge() {
    const btn = document.getElementById('globequiz-btn');
    if (!btn) return;
    const on = neverPlayedGloboReto();
    let badge = btn.querySelector('.gq-new-badge');
    if (on && !badge) { badge = document.createElement('div'); badge.className = 'gq-new-badge'; btn.appendChild(badge); }
    if (badge) {
      if (on) badge.textContent = (typeof window.getLang === 'function' && window.getLang() === 'en') ? 'NEW!' : '¡NUEVO!';
      else badge.remove();
    }
  }

  // ── Back-to-menu detection ────────────────────────────────────────────────
  // #loading-screen hidden = a game/screen is up; shown again = back at the
  // menu. #globequiz-screen being visible in between = that round was
  // GloboReto (then no invite, and it's where the streak popup belongs).
  function init() {
    const loading = document.getElementById('loading-screen');
    const gqScreen = document.getElementById('globequiz-screen');
    if (!loading) return;
    updateNudge();
    window.addEventListener('gqStreakUpdated', updateNudge);
    document.getElementById('globequiz-btn')?.addEventListener('click', () => { lsSet(EVER_OPENED_KEY, '1'); updateNudge(); });
    if (typeof window.onLangChange === 'function') window.onLangChange(updateNudge);
    let inGame = !visible(loading), gqThisRound = false;
    if (gqScreen) {
      new MutationObserver(() => {
        if (visible(gqScreen)) { gqThisRound = true; lsSet(EVER_OPENED_KEY, '1'); }
      }).observe(gqScreen, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    new MutationObserver(() => {
      const nowInGame = !visible(loading);
      if (nowInGame === inGame) return;
      inGame = nowInGame;
      if (nowInGame) { gqThisRound = visible(gqScreen); return; }
      const wasGq = gqThisRound;
      gqThisRound = false;
      setTimeout(updateNudge, 500);
      // Let end-of-game popups (results, founder, CrazyGames offer) go first.
      setTimeout(async () => {
        if (await maybeShowStreakStart()) return;
        if (!wasGq) maybeInvite();
      }, 3500);
    }).observe(loading, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
