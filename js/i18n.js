// ── i18n (ES / EN) ────────────────────────────────────────────────────────────
// Sistema simple de traducción. Uso:
//   t('key')                      -> string en el idioma actual (fallback a ES, luego a la key)
//   data-i18n="key"               -> en HTML estático: textContent se traduce
//   data-i18n-ph="key"            -> traduce el placeholder de un input
//   onLangChange(cb)              -> re-render de texto que se arma en JS
//   setLanguage('en'|'es')        -> cambia idioma, persiste y re-aplica
// Este archivo se carga ANTES que el resto, así t() ya está disponible.

const I18N = {
  es: {
    // Modos
    'mode.shapes': 'Países', 'mode.cities': 'Ciudades', 'mode.flags': 'Banderas', 'mode.monuments': 'Monumentos',
    'mode.flags.title': 'Suitcase Shuffle', 'mode.shapes.title': 'Map Mayhem',
    'mode.cities.title': 'City Blitz', 'mode.monuments.title': 'Landmark Loco',
    // Comunes
    'common.average': 'Promedio', 'common.highscore': 'Highscore', 'common.bestscore': 'Mejor puntaje',
    'common.play': 'Jugar', 'common.total': 'Puntuación total', 'common.city': 'Ciudad',
    'common.speedBonus': '¡Bonus velocidad!', 'common.continue': 'Continuar',
    // Primer ingreso (nombre)
    'name.welcome': '¡Bienvenido!', 'name.askName': '¿Cómo te llamas?',
    'name.ph': 'Tu nombre...', 'name.confirm': 'Confirmar',
    'name.greet': '¡Hola, {name}!', 'name.greetSub': '¡Demuestra quién sabe más países, banderas y ciudades del mundo. Consigue tu ranking y supera a tus amigos!',
    // Social
    'social.title': 'Panel de Amigos', 'social.sort.conn': 'Conexión',
    'social.tab.friends': 'Mis Amigos', 'social.tab.requests': 'Solicitudes',
    'social.addFriend': 'Añadir Amigo', 'social.searchFriends': 'Buscar Amigos...',
    'social.typeUsername': 'Escribe el nombre de usuario', 'social.usernamePh': 'Nombre de usuario...',
    'social.sendRequest': 'Enviar Solicitud',
    'social.blocked': 'Bloqueados', 'social.sentRequests': 'Solicitudes Enviadas',
    'social.searchBlocked': 'Buscar Bloqueados...', 'social.searchSent': 'Buscar Enviadas...',
    'social.noBlocked': 'No tienes a nadie bloqueado.', 'social.noSent': 'No tienes solicitudes pendientes.',
    'social.noResults': 'Sin resultados.', 'social.blockedStatus': 'Bloqueado',
    'social.pendingStatus': 'Solicitud pendiente', 'social.sentYouRequest': 'Te envió una solicitud',
    'social.requestSent': '¡Solicitud enviada a {name}!', 'social.alreadyInList': 'Ya está en tu lista',
    'social.typeName': 'Escribe un nombre',
    'social.online': 'En línea', 'social.playing': 'Jugando',
    'social.lastSeen2h': 'Última vez hace 2h', 'social.lastSeenYesterday': 'Última vez ayer', 'social.lastSeen5h': 'Última vez hace 5h',
    'sort.conn': 'Conexión', 'sort.scoreDesc': 'Puntaje ↓', 'sort.scoreAsc': 'Puntaje ↑', 'sort.nameAsc': 'Nombre A-Z', 'sort.nameDesc': 'Nombre Z-A',
    // Perfil (propio y de amigo)
    'profile.playedTimes.one': '¡Has jugado {n} vez!', 'profile.playedTimes.other': '¡Has jugado {n} veces!',
    'profile.friendPlayed.one': '¡Ha jugado {n} vez!', 'profile.friendPlayed.other': '¡Ha jugado {n} veces!',
    'profile.none': 'None',
    // Confirmaciones de relación
    'confirm.removeFriend': '¿Seguro que quieres eliminar a {name} de tus amigos?',
    'confirm.acceptRequest': '¿Aceptar la solicitud de amistad de {name}?',
    'confirm.cancelSent': '¿Cancelar tu solicitud de amistad a {name}?',
    'confirm.block': '¿Quieres bloquear a {name}?', 'confirm.unblock': '¿Quieres desbloquear a {name}?',
    // Splash / gameover / results
    'splash.timeUp': '¡Tiempo!', 'results.finalScore': 'Puntaje final', 'results.newRecord': '¡Nuevo récord!',
    'final.worldTour': 'Gira mundial',
    // Etiquetas de resultado (cities/monuments)
    'grade.perfect': 'Perfecto', 'grade.good': 'Bien', 'grade.fair': 'Regular', 'grade.wayoff': 'Muy lejos',
    // Diálogos del splash por modo (paso 1 y paso 2)
    'splash.cities.1': '¡Veamos a qué ciudad va cada uno! Aquí es donde tú entras a formar parte.',
    'splash.cities.2': 'Coloca un pin en el mapa donde creas que cada ciudad se ubica. ¡Haz click en el botón VERDE cuando estes listo!',
    'splash.flags.1': '¡Eh, Tú! ¿Crees que podrías echarme una mano ordenando el equipaje de los turistas?',
    'splash.flags.2': 'Haz clic sobre la bandera del país, estado o unión que corresponda al nombre que aparece arriba. ¿Todo listo? ¡Entonces haz clic sobre el icono VERDE para empezar!',
    'splash.shapes.1': '¿Adónde? Usando un mapa de cada país, veamos adónde vuelan nuestros turistas.',
    'splash.shapes.2': 'Observa la forma del país y haz click en el nombre correcto, ¡pero no te olvides de que cada segundo cuenta! ¡Haz click en el icono VERDE y comenzamos!',
    'splash.monuments.1': '¡Vale, es hora de hacer un poco de turismo! ¿Qué tal es tu conocimiento de monumentos famosos?',
    'splash.monuments.2': 'Pon un pin en el mapa allí donde crees que están. ¡Haz click en el icono VERDE cuando creas que estes listo!',
    // Mensajes de gameover por modo
    'gameover.cities': '¡Buen intento! ¡Todos llegaron a sus ciudades de destino!',
    'gameover.monuments': '¡Buen trabajo! ¡Lo conseguimos!',
    'gameover.flags': '¡Buen trabajo! ¡Llevemos a los turistas a la puerta de embarque!',
    'gameover.shapes': '¡Increíble! ¡Los turistas están de camino!',
    // Results
    'results.newRecordMsg': '¡Excelente trabajo {name}! ¡Acabas de batir un nuevo récord personal!',
    'results.notBestMsg': 'No está mal, {name}. ¡Pero no es tu mejor puntaje! {record} es el puntaje a superar, que te deja en el puesto {pos} entre tus amigos{friendMsg}.',
    'results.friendAbove': ', justo detrás de {name}', 'results.friendBelow': ', justo delante de {name}',
    // Cuenta
    'account.title': 'Mi Cuenta', 'account.desc': 'Conecta tu cuenta para guardar tu progreso y competir con amigos online.',
    'account.login': 'Iniciar sesión', 'account.register': 'Crear cuenta',
    'account.loginTitle': 'Iniciar sesión', 'account.userOrEmail': 'Usuario o correo', 'account.password': 'Contraseña', 'account.enter': 'Entrar',
    'account.registerTitle': 'Crear cuenta', 'account.username': 'Nombre de usuario', 'account.email': 'Correo electrónico', 'account.confirmPass': 'Confirmar contraseña', 'account.registerBtn': 'Registrarme',
    'account.errUserChars': 'Entre 4 y 12 caracteres.', 'account.errUserInvalid': 'Solo letras y números.', 'account.errEmailInvalid': 'Correo inválido.',
    'account.errPassShort': 'Mínimo 6 caracteres.', 'account.errPassMismatch': 'Las contraseñas no coinciden.',
    'account.errLoginUser': 'Ingresa tu usuario.', 'account.errLoginUserInvalid': 'Solo letras y números, mín. 4 caracteres.',
    'account.errUserNotFound': 'Este usuario no existe.', 'account.errWrongPass': 'Contraseña incorrecta.',
    'account.passWeak': 'Débil', 'account.passMedium': 'Medio', 'account.passStrong': 'Segura',
    'account.verifyTitle': '¡Casi listo!', 'account.verifyDesc': 'Tu cuenta necesita verificarse. Revisa tu correo y haz click en el enlace de confirmación.',
    'account.understood': 'Entendido',
    'account.welcomePrefix': '¡Bienvenido, ', 'account.welcomeDesc': 'Tus datos guardados han sido aplicados.<br>Ya puedes ver tus amigos, comparar rankings y añadir nuevos contactos.',
    'account.play': '¡Jugar!',
    'account.socialLockTitle': 'Función bloqueada', 'account.socialLockDesc': 'Inicia sesión para ver y competir contra tus amigos, comparar rankings y añadir nuevos contactos.',
    'account.verifiedTitle': '¡Correo verificado!', 'account.verifiedDesc': 'Tu cuenta ha sido confirmada. Ya puedes iniciar sesión.', 'account.verifiedBtn': 'Iniciar sesión',
    'account.linkedTitle': 'Cuenta vinculada', 'account.changePass': 'Cambiar contraseña', 'account.changeEmail': 'Cambiar correo', 'account.logout': 'Cerrar sesión',
    'account.logoutConfirmTitle': '¿Cerrar sesión?', 'account.logoutConfirmDesc': 'Se cerrará tu sesión en este dispositivo.', 'account.logoutYes': 'Cerrar sesión', 'account.logoutNo': 'Cancelar',
    'account.changePassTitle': 'Cambiar contraseña', 'account.currentPass': 'Contraseña actual', 'account.newPass': 'Nueva contraseña', 'account.confirmNewPass': 'Confirmar nueva contraseña', 'account.saveChanges': 'Guardar',
    'account.passChangedTitle': '¡Contraseña actualizada!', 'account.passChangedDesc': 'Tu contraseña fue cambiada exitosamente.',
    'account.changeEmailTitle': 'Cambiar correo', 'account.newEmail': 'Nuevo correo electrónico', 'account.changeEmailBtn': 'Enviar verificación',
    'account.changeEmailSentTitle': 'Revisa tu correo', 'account.changeEmailSentDesc': 'Te enviamos un enlace al nuevo correo. Confirma el cambio desde ahí.',
    'account.errNewPassSame': 'La nueva contraseña debe ser diferente.',
    'account.emailChangedTitle': '¡Correo actualizado!', 'account.emailChangedDesc': 'Tu correo fue confirmado. Ya puedes iniciar sesión.', 'account.emailChangedBtn': 'Iniciar sesión',
    // Quit popup
    'quit.text': '¿Quieres terminar la partida y volver al menú principal?',
    // Aviso de pantalla
    'screen.tooSmall': 'La pantalla no es suficiente para mostrar el juego.',
    'screen.resize': 'Redimensiona la ventana para una experiencia óptima.',
    'screen.tooWide': 'La pantalla es demasiado ancha. Redimensiona la ventana verticalmente.',
    'screen.tooTall': 'La pantalla es demasiado alta. Redimensiona la ventana horizontalmente.',
  },
  en: {
    'mode.shapes': 'Countries', 'mode.cities': 'Cities', 'mode.flags': 'Flags', 'mode.monuments': 'Monuments',
    'mode.flags.title': 'Suitcase Shuffle', 'mode.shapes.title': 'Map Mayhem',
    'mode.cities.title': 'City Blitz', 'mode.monuments.title': 'Landmark Loco',
    'common.average': 'Average', 'common.highscore': 'Highscore', 'common.bestscore': 'Best score',
    'common.play': 'Play', 'common.total': 'Total score', 'common.city': 'City',
    'common.speedBonus': 'Speed bonus!', 'common.continue': 'Continue',
    'name.welcome': 'Welcome!', 'name.askName': "What's your name?",
    'name.ph': 'Your name...', 'name.confirm': 'Confirm',
    'name.greet': 'Hello, {name}!', 'name.greetSub': 'Prove once and for all who knows the most countries, flags and cities in the world. Get your ranking and beat your friends!',
    'social.title': 'Friends Panel', 'social.sort.conn': 'Connection',
    'social.tab.friends': 'My Friends', 'social.tab.requests': 'Requests',
    'social.addFriend': 'Add Friend', 'social.searchFriends': 'Search Friends...',
    'social.typeUsername': 'Type the username', 'social.usernamePh': 'Username...',
    'social.sendRequest': 'Send Request',
    'social.blocked': 'Blocked', 'social.sentRequests': 'Sent Requests',
    'social.searchBlocked': 'Search Blocked...', 'social.searchSent': 'Search Sent...',
    'social.noBlocked': "You haven't blocked anyone.", 'social.noSent': 'You have no pending requests.',
    'social.noResults': 'No results.', 'social.blockedStatus': 'Blocked',
    'social.pendingStatus': 'Pending request', 'social.sentYouRequest': 'Sent you a request',
    'social.requestSent': 'Request sent to {name}!', 'social.alreadyInList': 'Already in your list',
    'social.typeName': 'Type a name',
    'social.online': 'Online', 'social.playing': 'Playing',
    'social.lastSeen2h': 'Last seen 2h ago', 'social.lastSeenYesterday': 'Last seen yesterday', 'social.lastSeen5h': 'Last seen 5h ago',
    'sort.conn': 'Connection', 'sort.scoreDesc': 'Score ↓', 'sort.scoreAsc': 'Score ↑', 'sort.nameAsc': 'Name A-Z', 'sort.nameDesc': 'Name Z-A',
    'profile.playedTimes.one': "You've played {n} time!", 'profile.playedTimes.other': "You've played {n} times!",
    'profile.friendPlayed.one': 'Played {n} time!', 'profile.friendPlayed.other': 'Played {n} times!',
    'profile.none': 'None',
    'confirm.removeFriend': 'Remove {name} from your friends?',
    'confirm.acceptRequest': "Accept {name}'s friend request?",
    'confirm.cancelSent': 'Cancel your friend request to {name}?',
    'confirm.block': 'Block {name}?', 'confirm.unblock': 'Unblock {name}?',
    'splash.timeUp': "Time's up!", 'results.finalScore': 'Final score', 'results.newRecord': 'New record!',
    'final.worldTour': 'World tour',
    'grade.perfect': 'Perfect', 'grade.good': 'Good', 'grade.fair': 'Fair', 'grade.wayoff': 'Way Off',
    'splash.cities.1': "So, let's find out which city everyone is heading to! This is where you come in.",
    'splash.cities.2': "Stick a pin right in the map wherever you think each city is located. Click the GREEN button when you're ready!",
    'splash.flags.1': "Well hey there! Think you could give me a hand sorting our tourists' luggage?",
    'splash.flags.2': 'Click the flag for the country, state or union name shown at the top. All set? Then click the GREEN button to start!',
    'splash.shapes.1': "So where to? Let's see where our tourists are flying using a map of each country!",
    'splash.shapes.2': "Look at the shape of the country and click the right name but don't forget, every second counts! Click the GREEN button and we'll get started!",
    'splash.monuments.1': "OK, time for a little sightr seeing! How's your knowledge of famous landmarks?",
    'splash.monuments.2': "Stick a pin right in the map wherever you think they are. Click the GREEN button when you think you're ready!",
    'gameover.cities': 'Incredible! Everyone made it to their destination cities!',
    'gameover.monuments': 'Great job! We did it!',
    'gameover.flags': "Great job! Now let's take our tourists to the gate!",
    'gameover.shapes': 'Incredible! Our tourists are almost on their way!',
    'results.newRecordMsg': 'Fantastic work {name}, you just hit a new high score!',
    'results.notBestMsg': "Not bad, {name}. But it's not your best score! {record} is the score to beat, which puts you in position {pos} among your friends{friendMsg}.",
    'results.friendAbove': ', just behind {name}', 'results.friendBelow': ', just ahead of {name}',
    // Account
    'account.title': 'My Account', 'account.desc': 'Connect your account to save your progress and compete with friends online.',
    'account.login': 'Log in', 'account.register': 'Create account',
    'account.loginTitle': 'Log in', 'account.userOrEmail': 'Username or email', 'account.password': 'Password', 'account.enter': 'Sign in',
    'account.registerTitle': 'Create account', 'account.username': 'Username', 'account.email': 'Email address', 'account.confirmPass': 'Confirm password', 'account.registerBtn': 'Register',
    'account.errUserChars': 'Between 4 and 12 characters.', 'account.errUserInvalid': 'Letters and numbers only.', 'account.errEmailInvalid': 'Invalid email.',
    'account.errPassShort': 'At least 6 characters.', 'account.errPassMismatch': 'Passwords do not match.',
    'account.errLoginUser': 'Enter your username.', 'account.errLoginUserInvalid': 'Letters and numbers only, min. 4 characters.',
    'account.errUserNotFound': 'This user does not exist.', 'account.errWrongPass': 'Incorrect password.',
    'account.passWeak': 'Weak', 'account.passMedium': 'Medium', 'account.passStrong': 'Strong',
    'account.verifyTitle': 'Almost there!', 'account.verifyDesc': 'Your account needs to be verified. Check your email and click the confirmation link.',
    'account.understood': 'Got it',
    'account.welcomePrefix': 'Welcome, ', 'account.welcomeDesc': 'Your saved data has been applied.<br>You can now view your friends, compare rankings and add new contacts.',
    'account.play': 'Play!',
    'account.socialLockTitle': 'Feature locked', 'account.socialLockDesc': 'Log in to view and compete against your friends, compare rankings and add new contacts.',
    'account.verifiedTitle': 'Email verified!', 'account.verifiedDesc': 'Your account has been confirmed. You can now log in.', 'account.verifiedBtn': 'Log in',
    'account.linkedTitle': 'Linked account', 'account.changePass': 'Change password', 'account.changeEmail': 'Change email', 'account.logout': 'Log out',
    'account.logoutConfirmTitle': 'Log out?', 'account.logoutConfirmDesc': 'Your session will be closed on this device.', 'account.logoutYes': 'Log out', 'account.logoutNo': 'Cancel',
    'account.changePassTitle': 'Change password', 'account.currentPass': 'Current password', 'account.newPass': 'New password', 'account.confirmNewPass': 'Confirm new password', 'account.saveChanges': 'Save',
    'account.passChangedTitle': 'Password updated!', 'account.passChangedDesc': 'Your password was changed successfully.',
    'account.changeEmailTitle': 'Change email', 'account.newEmail': 'New email address', 'account.changeEmailBtn': 'Send verification',
    'account.changeEmailSentTitle': 'Check your email', 'account.changeEmailSentDesc': 'We sent a link to your new email. Confirm the change from there.',
    'account.errNewPassSame': 'New password must be different.',
    'account.emailChangedTitle': 'Email updated!', 'account.emailChangedDesc': 'Your email was confirmed. You can now log in.', 'account.emailChangedBtn': 'Log in',
    'quit.text': 'Do you want to end the game and return to the main menu?',
    'screen.tooSmall': 'The screen is not big enough to display the game.',
    'screen.resize': 'Resize the window for the best experience.',
    'screen.tooWide': 'The screen is too wide. Resize the window vertically.',
    'screen.tooTall': 'The screen is too tall. Resize the window horizontally.',
  },
};

let currentLang = localStorage.getItem('lang') || 'es';

function t(key, vars) {
  let s = (I18N[currentLang] && I18N[currentLang][key]);
  if (s == null) s = (I18N.es[key] != null ? I18N.es[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}
// Plural helper: t.plural('profile.playedTimes', n) → usa .one / .other
function tn(baseKey, n, vars) {
  return t(baseKey + (n === 1 ? '.one' : '.other'), Object.assign({ n }, vars));
}

const _i18nListeners = [];
function onLangChange(cb) { if (typeof cb === 'function') _i18nListeners.push(cb); }

function applyI18n(root) {
  root = root || document;
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
  // Botones con imagen por idioma: images/buttons/es-*.png ↔ en-*.png
  root.querySelectorAll('img[src*="/buttons/es-"], img[src*="/buttons/en-"]').forEach(img => {
    img.src = img.src.replace(/\/buttons\/(?:es|en)-/, '/buttons/' + currentLang + '-');
  });
  _i18nListeners.forEach(cb => { try { cb(currentLang); } catch (e) { /* noop */ } });
}

function getLang() { return currentLang; }
function setLanguage(lang) {
  if (lang !== 'es' && lang !== 'en') return;
  currentLang = lang;
  localStorage.setItem('lang', lang);
  document.documentElement.setAttribute('lang', lang);
  applyI18n();
}

window.t = t; window.tn = tn; window.onLangChange = onLangChange;
window.applyI18n = applyI18n; window.setLanguage = setLanguage; window.getLang = getLang;

const LANG_LABELS = { es: 'Español', en: 'English' };
function _syncLangButtons() {
  document.querySelectorAll('.loading-lang-current').forEach(el => {
    el.textContent = LANG_LABELS[currentLang] || currentLang;
  });
  document.querySelectorAll('.loading-lang-option').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-lang') === currentLang);
  });
}
onLangChange(_syncLangButtons);

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.setAttribute('lang', currentLang);

  // Inicializar todos los selectores de idioma (loading screen + modal de nombre)
  const langWraps = [
    { wrap: document.getElementById('loading-lang'),      toggle: document.getElementById('loading-lang-toggle') },
    { wrap: document.getElementById('name-prompt-lang'),  toggle: document.getElementById('name-prompt-lang-toggle') },
  ];
  langWraps.forEach(({ wrap, toggle }) => {
    if (!toggle || !wrap) return;
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      langWraps.forEach(({ wrap: w }) => { if (w && w !== wrap) w.classList.remove('open'); });
      wrap.classList.toggle('open');
    });
  });
  document.querySelectorAll('.loading-lang-option').forEach(b => {
    b.addEventListener('click', () => {
      const sel = (typeof sfxSelect !== 'undefined') ? sfxSelect : null;
      if (sel) { try { sel.currentTime = 0; sel.play(); } catch (e) {} }
      setLanguage(b.getAttribute('data-lang'));
      langWraps.forEach(({ wrap }) => { if (wrap) wrap.classList.remove('open'); });
    });
  });
  // Cerrar desplegables al hacer click afuera
  document.addEventListener('click', (e) => {
    langWraps.forEach(({ wrap }) => {
      if (wrap && !wrap.contains(e.target)) wrap.classList.remove('open');
    });
  });

  applyI18n();
  _syncLangButtons();
});
