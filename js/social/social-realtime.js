// ============================================================================
// social/social-realtime.js — canales de Supabase Realtime para amigos
// (estados online/jugando, cambios de friendship) + polls de respaldo (5s) +
// badge de solicitudes + parcheo en vivo de filas del panel social.
// Extraído de monuments.js (fase 5). Se carga antes que monuments.js.
// loadSocialData / socialData / renderSocial / getStatusObj / currentFriendProfile
// / socialSort / socialActiveTab siguen en monuments.js; acá se usan sólo en
// runtime (callbacks de realtime / poll / handlers), con monuments.js ya cargado.
// ============================================================================

let _friendRealtimeChannel = null;
let _friendshipsChannel    = null;
let _knownRequestIds       = null; // null = primera carga, no mostrar notif
let _socialReloadTimer     = null;
function _debouncedLoadSocial() {
  clearTimeout(_socialReloadTimer);
  _socialReloadTimer = setTimeout(() => loadSocialData(false), 400);
}
let _socialListPollInterval = null;

function _patchFriendStatusInDOM(friendId) {
  const f = socialData.friends.find(x => x.id === friendId);
  if (!f) return;
  const st = getStatusObj(f);
  const rk = (typeof getRank === 'function') ? getRank(f.score) : null;
  document.querySelectorAll(`.loading-social-row[data-friend-id="${friendId}"]`).forEach(row => {
    if (row.querySelector('.loading-social-status')) {
      const prevCls = (row.className.match(/status-(\w+)/) || [])[1];
      row.className = row.className.replace(/status-\w+/, 'status-' + st.cls);
      if (prevCls !== st.cls) window.CustomizeAssets.applyCellForStatus(row, f.cellCode, st.cls);
      const statusEl = row.querySelector('.loading-social-status');
      if (statusEl && prevCls !== st.cls) {
        statusEl.innerHTML = `<span class="dot ${st.cls}"></span>${socialStatusText(f)}`;
      } else if (statusEl) {
        // Solo actualizar el texto, sin tocar el dot (no reinicia la animación)
        const textNode = statusEl.lastChild;
        const newText = socialStatusText(f);
        if (textNode && textNode.nodeType === Node.TEXT_NODE) textNode.textContent = newText;
        else if (textNode && textNode.nodeType !== Node.ELEMENT_NODE) statusEl.innerHTML = `<span class="dot ${st.cls}"></span>${newText}`;
      }
    }
    const avatarEl = row.querySelector('.loading-social-avatar');
    if (avatarEl && f.avatar) avatarEl.src = f.avatar;
    const scoreVal = row.querySelector('.loading-social-score-val');
    if (scoreVal) scoreVal.textContent = f.score.toLocaleString();
    const rankName = row.querySelector('.loading-social-rankname');
    if (rankName && rk) rankName.textContent = rk.name;
    const rankImg = row.querySelector('.loading-social-emote');
    if (rankImg && rk) rankImg.src = rk.img;
    // Ojo de espectar: agregar/quitar en vivo si cambia is_playing/is_practicing
    // mientras la fila ya está en pantalla (si no, quedaba desactualizado hasta
    // el próximo renderSocialFriends() completo). Vive DENTRO de
    // .loading-social-score (a la izquierda de points.png, ver CSS) en vez
    // de al lado del nombre.
    const scoreBox = row.querySelector('.loading-social-score');
    if (scoreBox) {
      const shouldShowEye = st.cls === 'playing' && !f.is_practicing;
      let eyeEl = scoreBox.querySelector('.social-spectate-eye');
      if (shouldShowEye && !eyeEl) {
        eyeEl = document.createElement('img');
        eyeEl.className = 'social-spectate-eye';
        eyeEl.src = 'images/spectate.png';
        eyeEl.alt = '';
        eyeEl.draggable = false;
        eyeEl.oncontextmenu = () => false;
        eyeEl.title = 'Ver partida';
        eyeEl.addEventListener('click', (e) => { e.stopPropagation(); openSpectatorForFriend(f); });
        scoreBox.insertBefore(eyeEl, scoreBox.firstChild);
      } else if (!shouldShowEye && eyeEl) {
        eyeEl.remove();
      }
    }
  });
  // Si el panel de detalle de ese amigo está abierto, actualizarlo también
  if (currentFriendProfile?.id === friendId) {
    currentFriendProfile.last_active = f.last_active;
    currentFriendProfile.is_playing  = f.is_playing;
    _applyFriendPanelStatus(currentFriendProfile);
  }
}

let _lastSubscribedFriendIds = '';
function _subscribeFriendStatuses(friendIds) {
  const key = [...friendIds].sort().join(',');
  if (_friendRealtimeChannel && key === _lastSubscribedFriendIds) return; // sin cambios
  if (_friendRealtimeChannel) { window.sb.removeChannel(_friendRealtimeChannel); _friendRealtimeChannel = null; }
  _lastSubscribedFriendIds = key;
  if (!friendIds.length) return;
  _friendRealtimeChannel = window.sb
    .channel('friend-statuses')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles',
      filter: `id=in.(${friendIds.join(',')})`,
    }, (payload) => {
      const updated = payload.new;
      const f = socialData.friends.find(x => x.id === updated.id);
      if (!f) return;
      f.last_active   = updated.last_active;
      f.is_playing    = updated.is_playing;
      f.is_practicing = updated.is_practicing;
      // gq_streak_last_date/gq_today_time_ms: así, si un amigo termina su
      // GlobeQuiz de hoy MIENTRAS ya tenés el panel social abierto (o el
      // realtime ya suscrito), su carta puede aparecer en tu próxima partida
      // sin esperar a un loadSocialData completo.
      f.gqStreakCount    = updated.gq_streak_count || 0;
      f.gqStreakLastDate = updated.gq_streak_last_date || null;
      f.gqTodayTimeMs    = (typeof updated.gq_today_time_ms === 'number') ? updated.gq_today_time_ms : null;
      // Sincronizar caché de friends.js (usada por el panel de invitar del lobby
      // y por la barra de amigos in-game de GlobeQuiz, ver buildGqFriendRows)
      if (typeof getFriends === 'function') {
        const fc = getFriends().find(x => x.id === updated.id);
        if (fc) {
          fc.last_active = updated.last_active; fc.is_playing = updated.is_playing; fc.is_practicing = updated.is_practicing;
          fc.gqStreakCount = f.gqStreakCount; fc.gqStreakLastDate = f.gqStreakLastDate; fc.gqTodayTimeMs = f.gqTodayTimeMs;
        }
      }
      // Refrescar en vivo el panel de amigos de la sala si está abierto
      window._refreshLobbyInviteList?.();
      // Actualizar avatar si cambió
      if (updated.avatar_url && updated.avatar_url !== f.avatar) {
        f.avatar = updated.avatar_url;
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.avatar = updated.avatar_url;
          const pic = document.getElementById('loading-friend-pic');
          if (pic) pic.src = updated.avatar_url;
        }
        // Parchear avatar en paneles de solicitudes/enviadas/bloqueados
        document.querySelectorAll(`.loading-social-row[data-friend-id="${updated.id}"] .loading-social-avatar`)
          .forEach(el => { el.src = updated.avatar_url; });
      }
      // Actualizar play_count si cambió
      if (updated.play_count != null && updated.play_count !== f.play_count) {
        f.play_count = updated.play_count;
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.play_count = f.play_count;
          const pcEl = document.getElementById('loading-friend-play-count');
          if (pcEl) pcEl.textContent = tn('profile.friendPlayed', f.play_count);
        }
      }
      // Actualizar score si cambió (amigo terminó partida)
      // hs_total (columna) nunca queda seteada server-side para algunas
      // cuentas (queda en 0 aunque hs_flags/hs_shapes/hs_cities/hs_monuments
      // sí tengan puntaje real) — mismo fallback que toEntry() (sb.js) y el
      // helper de más abajo en este archivo (línea ~1868, Math.max). Sin
      // este fallback ACÁ, cualquier UPDATE de perfil del amigo (is_playing,
      // avatar, lo que sea — no hace falta que cambie el score) pisaba el
      // valor correcto con 0 hasta el próximo refetch completo — el "los
      // datos van cambiando entre 0 y el detalle actual" reportado.
      const newScore = updated.hs_total || ((updated.hs_flags||0)+(updated.hs_shapes||0)+(updated.hs_cities||0)+(updated.hs_monuments||0));
      if (newScore !== f.score) {
        f.score       = newScore;
        f.hs_flags    = updated.hs_flags    || 0;
        f.hs_shapes   = updated.hs_shapes   || 0;
        f.hs_cities   = updated.hs_cities   || 0;
        f.hs_monuments= updated.hs_monuments|| 0;
        // Si el panel de detalle está abierto para este amigo, actualizar stats
        if (currentFriendProfile?.id === updated.id) {
          currentFriendProfile.score        = f.score;
          currentFriendProfile.hs_flags     = f.hs_flags;
          currentFriendProfile.hs_shapes    = f.hs_shapes;
          currentFriendProfile.hs_cities    = f.hs_cities;
          currentFriendProfile.hs_monuments = f.hs_monuments;
          const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
          const modeHs2   = [f.hs_flags, f.hs_shapes, f.hs_cities, f.hs_monuments];
          const avgSums2  = [f.avg_sum_flags||0, f.avg_sum_shapes||0, f.avg_sum_cities||0, f.avg_sum_monuments||0];
          const avgCounts2= [f.play_count_flags||0, f.play_count_shapes||0, f.play_count_cities||0, f.play_count_monuments||0];
          modeHs2.forEach((hs, k) => {
            setText('loading-friend-avg'+(k+1), hs.toLocaleString());
            const avg = avgCounts2[k] > 0 ? Math.round(avgSums2[k] / avgCounts2[k]) : hs;
            setText('loading-friend-hs'+(k+1), avg.toLocaleString());
          });
          setText('loading-friend-total', f.score.toLocaleString());
          const rk = (typeof getRank === 'function') ? getRank(f.score) : null;
          const rankImg = document.getElementById('loading-friend-rank');
          if (rankImg && rk) rankImg.src = rk.img;
          const rankLabel = document.getElementById('loading-friend-rank-label');
          if (rankLabel && rk) rankLabel.textContent = rk.name;
        }
      }
      // Si el sort es por conexión, re-renderizar la lista para re-ordenar en tiempo real
      if (socialSort === 'conn') {
        const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
        const friendDetailOpen = !document.getElementById('loading-friend-group')?.classList.contains('table-gone');
        if (panelOpen && !friendDetailOpen && socialActiveTab === 'friends') {
          renderSocial(document.getElementById('loading-social-search-input')?.value || '');
        }
      } else {
        _patchFriendStatusInDOM(updated.id);
      }
      // Si el panel de detalle está abierto para este amigo, actualizar status
      if (currentFriendProfile?.id === updated.id) {
        currentFriendProfile.last_active = updated.last_active;
        currentFriendProfile.is_playing  = updated.is_playing;
        if (typeof _applyFriendPanelStatus === 'function') _applyFriendPanelStatus(currentFriendProfile);
      }
    })
    .subscribe();
}

function _subscribeFriendshipChanges(userId) {
  if (_friendshipsChannel) return; // ya suscrito — no recrear
  if (!userId) return;
  _friendshipsChannel = window.sb
    .channel('friendship-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => {
      // Supabase no garantiza el payload completo sin REPLICA IDENTITY FULL,
      // así que recargamos siempre que llegue cualquier evento de la tabla.
      _debouncedLoadSocial();
    })
    .subscribe();
}

// Chequeo ligero del badge cuando el panel está cerrado (solo cuenta pendientes).
async function _checkRequestsBadge() {
  if (!window._accountLoggedIn || !window._sbUserId) return;
  const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
  if (panelOpen) return;
  try {
    const { data } = await window.sb.from('friendships')
      .select('id').eq('user_b', window._sbUserId).eq('status', 'pending');
    const ids = (data || []).map(r => r.id);
    const badge = document.getElementById('social-notif-badge');
    if (badge) badge.style.display = ids.length > 0 ? 'flex' : 'none';
    // Si el Realtime de `friendships` se pierde por latencia/red (ej. rival en
    // Singapur), este poll de 5s era el único que se enteraba de una solicitud
    // nueva con el panel cerrado — pero solo pintaba el badge, nunca la
    // notificación banner. Si aparece un id que no estaba en _knownRequestIds,
    // hacemos el load completo, que sí arma la notif (_updateSocialBadge).
    if (_knownRequestIds !== null && ids.some(id => !_knownRequestIds.has(id))) {
      loadSocialData(false);
    }
  } catch (e) {}
}

// Poll: re-renderiza si panel abierto; actualiza badge si cerrado.
function _startSocialListPoll() {
  clearInterval(_socialListPollInterval);
  _socialListPollInterval = setInterval(() => {
    const panelOpen = !document.getElementById('loading-social-group')?.classList.contains('table-gone');
    if (!panelOpen) { _checkRequestsBadge(); return; }
    const friendDetailOpen = !document.getElementById('loading-friend-group')?.classList.contains('table-gone');
    // Resync completo cada 5s: captura cambios de friendships que Realtime perdió
    // y re-ordena la lista si el sort es por conexión.
    loadSocialData(false);
  }, 5000);
}
function _stopSocialListPoll() {
  clearInterval(_socialListPollInterval);
  _socialListPollInterval = null;
}
