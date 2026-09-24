// ── Friends nudges (web) ────────────────────────────────────────────────────
// Light version of the CrazyGames build's cg-engage.js: web players are more
// committed, so this is deliberately quiet:
//
// 1) A "Play with friends" popup on getting back to the menu after a few
//    games (max once per week, never on top of another popup), only for
//    players with no friends yet. Its button opens the friends panel.
// 2) A small static "Friends!" tag (no animation) on the menu's social button
//    until the player opens the friends panel or has a friend.
//
// Copy stresses that they can play with friends whenever they want (1v1,
// private room or group), not only when both are online at a fixed time.
(function () {
  const SNOOZE_KEY = '_webFriendsInviteAt';
  const SOCIAL_OPENED_KEY = '_webSocialOpened';
  const SNOOZE_MS = 7 * 24 * 3600 * 1000;
  const MIN_RETURNS = 3;       // menu returns (after a game) before the first popup
  const FEW_FRIENDS = 1;       // popup/tag only for players with fewer friends than this

  const TEXT = {
    es: {
      title: '¡Juega con tus amigos!',
      desc: 'Añade amigos y rétalos cuando quieras: duelos 1 contra 1, salas privadas o en grupo. Ve sus puntajes en el ranking y demuestra quién sabe más geografía.',
      go: 'Añadir amigos', later: 'Ahora no',
      tag: '¡Amigos!',
    },
    en: {
      title: 'Play with your friends!',
      desc: 'Add friends and challenge them whenever you want: 1 vs 1 duels, private rooms or groups. See their scores on the leaderboard and prove who knows more geography.',
      go: 'Add friends', later: 'Not now',
      tag: 'Friends!',
    },
  };
  const lang = () => ((typeof window.getLang === 'function' && window.getLang() === 'en') ? 'en' : 'es');
  const tx = (k) => TEXT[lang()][k];
  const click = () => { try { sfxCheck.currentTime = 0; sfxPlay(sfxCheck); } catch (e) {} };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const visible = (el) => !!el && getComputedStyle(el).display !== 'none';
  const friendCount = () => { try { return (window.Friends?.getFriends() || []).length; } catch (e) { return 0; } };

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

  // ── Popup ─────────────────────────────────────────────────────────────────
  let modal = null, shownThisSession = false;
  function buildModal() {
    modal = document.createElement('div');
    modal.className = 'account-modal';
    modal.id = 'friends-invite-popup';
    modal.innerHTML =
      '<div class="account-modal-box">' +
      '<button class="account-modal-close" type="button" data-act="close">✕</button>' +
      '<span class="account-modal-title" data-t="title" style="text-align:center"></span>' +
      '<p class="account-modal-desc" data-t="desc"></p>' +
      '<button class="account-modal-opt account-modal-login" type="button" data-act="go"></button>' +
      '<button class="account-modal-back" type="button" data-act="later"></button>' +
      '</div>';
    const ref = document.getElementById('account-modal');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(modal, ref); else document.body.appendChild(modal);
    const close = () => { click(); modal.classList.remove('open'); };
    modal.querySelector('[data-act="close"]').addEventListener('click', close);
    modal.querySelector('[data-act="later"]').addEventListener('click', () => { lsSet(SNOOZE_KEY, String(Date.now())); close(); });
    modal.querySelector('[data-act="go"]').addEventListener('click', () => {
      click();
      modal.classList.remove('open');
      lsSet(SNOOZE_KEY, String(Date.now()));
      document.getElementById('loading-social-btn')?.click();
    });
  }
  function showInvite() {
    if (!modal) buildModal();
    modal.querySelector('[data-t="title"]').textContent = tx('title');
    modal.querySelector('[data-t="desc"]').textContent = tx('desc');
    modal.querySelector('[data-act="go"]').textContent = tx('go');
    modal.querySelector('[data-act="later"]').textContent = tx('later');
    const box = modal.querySelector('.account-modal-box');
    box.style.animation = 'none'; box.offsetWidth; box.style.animation = '';
    click();
    modal.classList.add('open');
  }
  async function maybeInvite() {
    if (shownThisSession || !window._sbUserId) return;
    const last = Number(lsGet(SNOOZE_KEY) || 0);
    if (last && Date.now() - last < SNOOZE_MS) return;
    try { await window.Friends?.loadFriends?.(); } catch (e) {}
    if (friendCount() >= FEW_FRIENDS) return;
    if (!(await waitMenuClear(20000)) || shownThisSession) return;
    shownThisSession = true;
    showInvite();
  }

  // ── Tag on the social button ──────────────────────────────────────────────
  (function injectCss() {
    const st = document.createElement('style');
    st.textContent =
      '#loading-social-btn .friends-nudge-tag { position: absolute; top: -1.6cqmin; right: -1.6cqmin; z-index: 5; pointer-events: none;' +
      " font-family: 'VAGRoundBold', 'Arial Black', sans-serif; font-size: 1.5cqmin; letter-spacing: 0.05em; color: #fff;" +
      ' background: #2bb24c; border: 0.35cqmin solid #1c7a33; border-radius: 1.1cqmin; padding: 0.3cqmin 1cqmin;' +
      ' box-shadow: 0 0.3cqmin 0.8cqmin rgba(0,0,0,0.25); }';
    document.head.appendChild(st);
  })();
  function updateTag() {
    const btn = document.getElementById('loading-social-btn');
    if (!btn) return;
    const on = !!window._sbUserId && !lsGet(SOCIAL_OPENED_KEY) && friendCount() < FEW_FRIENDS;
    let tag = btn.querySelector('.friends-nudge-tag');
    if (on && !tag) { tag = document.createElement('div'); tag.className = 'friends-nudge-tag'; btn.appendChild(tag); }
    if (tag) { if (on) tag.textContent = tx('tag'); else tag.remove(); }
  }

  function init() {
    const loading = document.getElementById('loading-screen');
    if (!loading) return;
    const social = document.getElementById('loading-social-btn');
    if (social) {
      if (getComputedStyle(social).position === 'static') social.style.position = 'relative';
      social.addEventListener('click', () => { lsSet(SOCIAL_OPENED_KEY, '1'); updateTag(); });
    }
    if (window.Friends?.onFriendsUpdate) window.Friends.onFriendsUpdate(updateTag);
    if (typeof window.onLangChange === 'function') window.onLangChange(updateTag);
    setTimeout(updateTag, 1500);
    setInterval(updateTag, 15000); // login can finish after init
    let inGame = !visible(loading), returns = 0;
    new MutationObserver(() => {
      const nowInGame = !visible(loading);
      if (nowInGame === inGame) return;
      inGame = nowInGame;
      if (nowInGame) return;
      returns++;
      setTimeout(updateTag, 500);
      // Let the other end-of-game popups go first.
      if (returns >= MIN_RETURNS) setTimeout(maybeInvite, 7000);
    }).observe(loading, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
