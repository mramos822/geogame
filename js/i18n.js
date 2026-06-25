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
    'panel2.welcome1': '¡Bienvenido/a a myGeoChallenge!', 'panel2.welcome2': '¿Qué modo quieres jugar?',
    'practice.title': 'Gira de Práctica', 'practice.chooseMode': 'Elige un modo', 'practice.continents': 'Continentes',
    'practice.america': 'América', 'practice.europa': 'Europa', 'practice.africa': 'África',
    'practice.asia': 'Asia', 'practice.oceania': 'Oceanía',
    'practice.difficulty': 'Dificultad', 'practice.easy': 'Fácil', 'practice.medium': 'Medio', 'practice.hard': 'Difícil',
    'practice.time': 'Tiempo', 'practice.start': 'Confirmar', 'practice.back': '← Volver',
    'practice.sessionOver': 'Sesión terminada', 'practice.points': 'puntos', 'practice.playAgain': 'Jugar de nuevo',
    'name.welcome': '¡Bienvenido!', 'name.askName': '¿Cómo te llamas?',
    'name.ph': 'Tu nombre...', 'name.confirm': 'Confirmar',
    'name.orDivider': 'o', 'name.hasAccount': '¿Tienes cuenta? Inicia sesión o regístrate',
    'name.greet': '¡Hola, {name}!', 'name.greetSub': '¡Demuestra quién sabe más países, banderas y ciudades del mundo. Consigue tu ranking y supera a tus amigos!',
    // Social
    // Rankings
    'rankings.title': 'Rankings', 'rankings.loading': 'Cargando...', 'rankings.noData': 'Sin datos',
    'rankings.desc': '¿Cómo te comparas contra el resto del mundo?',
    'rankings.noFriends': 'Aún no tienes amigos con cuenta.', 'rankings.notLoggedIn': 'Inicia sesión para ver esto.',
    'rankings.tab.top100': 'Top 100', 'rankings.tab.global': 'Top Global', 'rankings.tab.friends': 'Top Friends',
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
    'social.profileUnavailable': 'No se ha podido cargar el perfil, por favor inténtalo más tarde',
    'social.requestSent': '¡Solicitud enviada a {name}!', 'social.alreadyInList': 'Ya está en tu lista',
    'social.typeName': 'Escribe un nombre',
    'social.online': 'En línea', 'social.playing': 'Jugando', 'social.offline': 'Sin conexión',
    'social.ago': 'Hace {n} {unit}',
    'social.unitMin': 'minuto', 'social.unitMins': 'minutos',
    'social.unitHour': 'hora',  'social.unitHours': 'horas',
    'social.unitDay': 'día',    'social.unitDays': 'días',
    'social.unitMonth': 'mes',  'social.unitMonths': 'meses',
    'social.unitYear': 'año',   'social.unitYears': 'años',
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
    'splash.practice.cities.1': '¡Modo práctica! Ubica ciudades en el mapa a tu ritmo y mejora tu precisión sin presión.',
    'splash.practice.flags.1': '¡Modo práctica! Identifica banderas del mundo y entrena tu memoria sin competencia.',
    'splash.practice.shapes.1': '¡Modo práctica! Reconoce países por su silueta y aprende a tu propio ritmo.',
    'splash.practice.monuments.1': '¡Modo práctica! Ubica monumentos famosos en el mapa y desafía tu memoria.',
    // Mensajes de gameover por modo
    'gameover.cities': '¡Buen intento! ¡Todos llegaron a sus ciudades de destino!',
    'gameover.monuments': '¡Buen trabajo! ¡Lo conseguimos!',
    'gameover.flags': '¡Buen trabajo! ¡Llevemos a los turistas a la puerta de embarque!',
    'gameover.shapes': '¡Increíble! ¡Los turistas están de camino!',
    // Versus
    'vs.result.win': '¡GANASTE!', 'vs.result.lose': 'PERDISTE', 'vs.result.draw': '¡EMPATE!',
    'vs.result.abandoned': 'QUEDASTE SOLO', 'vs.result.solo': 'Todos abandonaron la partida',
    'vs.result.you': 'Tú', 'vs.result.abandon': 'Tu rival abandonó la partida',
    'vs.guestUnavailable': 'No está disponible ahora', 'vs.inviteExpired': 'El reto expiró sin respuesta',
    'vs.challengedYou': 'te retó a Suitcase Shuffle 1v1',
    'vs.challengedShapes': 'te retó a Map Mayhem 1v1',
    'vs.challengedCities': 'te retó a City Blitz 1v1',
    'vs.challengedMonuments': 'te retó a Landmark Loco 1v1',
    'vs.chooseMode': '¿Qué modo quieren jugar?',
    'profile.vsRecord': 'Versus: {w}V · {l}D',
    'versus.subtitle': 'Reta a un amigo conectado',
    'versus.online': 'Conectado', 'versus.challenge': 'Retar',
    'versus.noneOnline': 'No hay amigos conectados ahora.',
    'versus.friendly': 'Versus Amistoso', 'versus.friendlyDesc': 'Juega con amigos o gente al azar',
    'versus.competitive': 'Versus Competitivo', 'versus.soon': 'Próximamente',
    'versus.lobbyTitle': 'Gira Competitiva',
    'versus.friends': 'Amigos', 'versus.friendsDesc': 'Reta a un amigo conectado (1v1)',
    'versus.group': 'Grupo', 'versus.groupDesc': 'Sala privada de hasta 10',
    'versus.random': 'Aleatorio', 'versus.randomDesc': 'Únete a salas públicas',
    'versus.subRoot': 'Elige un modo de versus', 'versus.subFriendly': '¿Con quién querés jugar?',
    'versus.subGroup': 'Sala privada de hasta 10 jugadores', 'versus.subRandom': 'Únete a una sala pública',
    'versus.subLobby': 'Sala de juego',
    'lobby.createPrivate': 'Crear sala privada', 'lobby.createPrivateDesc': 'Obtené un código e invitá amigos',
    'lobby.createRoom': 'Crear sala', 'lobby.createRoomDesc': 'Pública por defecto · podés privatizarla adentro',
    'lobby.joinByCode': 'Unirse con un código', 'lobby.join': 'Unirse', 'lobby.joined': 'Unido',
    'lobby.createPublic': 'Crear sala pública', 'lobby.noRooms': 'No hay salas abiertas ahora.',
    'lobby.code': 'Código:', 'lobby.invite': '+ Invitar', 'lobby.start': 'Empezar', 'lobby.leave': 'Salir',
    'lobby.waitingHost': 'Esperando que el host empiece…', 'lobby.you': 'tú', 'lobby.host': 'HOST',
    'lobby.players': 'jugadores', 'lobby.roomOf': 'Sala de', 'lobby.roomName': 'Sala de {name}', 'lobby.loading': 'Cargando salas…',
    'lobby.joinError': 'No se pudo unir a la sala', 'lobby.createError': 'No se pudo crear la sala',
    'lobby.kicked': 'Te expulsaron de la sala', 'lobby.closed': 'El host cerró la sala', 'lobby.leftRoom': 'Has abandonado la sala',
    'lobby.copied': '¡Código copiado!', 'lobby.placed': 'Quedaste #{n}',
    'lobby.cancel': 'Cancelar', 'lobby.notReady': 'No estoy listo',
    'lobby.starting': 'Empezando en', 'lobby.cancelled': 'Cuenta regresiva cancelada',
    'lobby.notReadyMsg': 'no está listo', 'lobby.someone': 'Alguien',
    'lobby.myRoom': 'Mi sala', 'lobby.public': '🌐 Pública', 'lobby.private': '🔒 Privada',
    'lobby.nowPublic': 'Sala ahora PÚBLICA', 'lobby.nowPrivate': 'Sala ahora PRIVADA',
    'lobby.creating': 'Creando sala…',
    'lobby.waitingOthers': 'Esperando a los otros miembros…',
    'lobby.inviteTitle': 'Invitar amigos', 'lobby.copyLink': 'Copiar link',
    'lobby.linkCopied': '¡Link copiado!', 'lobby.sharedWith': 'Compartí el link con {name}',
    'lobby.notFound': 'Sala no encontrada', 'lobby.started': 'La partida ya empezó',
    'lobby.kick': 'Expulsar', 'lobby.makeHost': 'Hacer host', 'lobby.hostTransferred': 'Host transferido',
    'lobby.disabled': 'Inhabilitado', 'lobby.sentInvite': 'Invitación enviada a {name}',
    'lobby.invitedYou': 'te invitó a su sala', 'lobby.inRoom': 'En la sala',
    'lobby.memberJoined': 'se unió a la sala', 'lobby.memberLeft': 'salió de la sala',
    'lobby.alreadyHave': 'Ya tenés una sala creada. ¿Abandonarla y crear una nueva?',
    'lobby.namePlaceholder': 'Nombre de la sala', 'lobby.joinFailed': 'No pudiste unirte, intentá de nuevo',
    'lobby.unnamed': 'Sala',
    'lobby.pickMode': 'Modos de juego', 'lobby.modeSet': 'seleccionado', 'lobby.close': 'Cerrar', 'lobby.soon': 'Próx.',
    'lobby.playOrder': 'Orden de juego', 'lobby.saveMode': 'Guardar', 'lobby.nextMode': 'Siguiente:',
    'lobby.cdBlocked': 'La sala está por empezar — espera o cancela la cuenta regresiva',
    'lobby.someoneIsPlaying': 'Un miembro está en una partida',
    'lobby.allLeft': 'Todos abandonaron la partida',
    'lobby.alone.title': 'QUEDASTE SOLO',
    'nav.flags': 'Banderas', 'nav.shapes': 'Siluetas', 'nav.cities': 'Ciudades', 'nav.monuments': 'Monumentos',
    // Notification inbox
    'notif.inbox': 'Invitaciones', 'notif.empty': 'Sin invitaciones pendientes',
    'notif.vs1v1': 'Reto 1v1', 'notif.lobbyInvite': 'Invitación a sala',
    'notif.timeNow': 'Ahora', 'notif.timeMin': 'Hace {n} min',
    // Results
    'results.newRecordMsg': '¡Excelente trabajo {name}! ¡Acabas de batir un nuevo récord personal!',
    'results.notBestMsg': 'No está mal, {name}. ¡Pero no es tu mejor puntaje! {record} es el puntaje a superar, que te deja en el puesto {pos} entre tus amigos{friendMsg}.',
    'results.friendAbove': ', justo detrás de {name}', 'results.friendBelow': ', justo delante de {name}',
    // Cuenta
    'nav.account': 'Cuenta',
    'account.title': 'Mi Cuenta', 'account.desc': 'Conecta tu cuenta para guardar tu progreso y competir con amigos online.',
    'account.login': 'Iniciar sesión', 'account.register': 'Crear cuenta',
    'account.loginTitle': 'Iniciar sesión', 'account.userOrEmail': 'Usuario o correo', 'account.password': 'Contraseña', 'account.enter': 'Entrar',
    'account.registerTitle': 'Crear cuenta', 'account.username': 'Nombre de usuario', 'account.email': 'Correo electrónico', 'account.confirmPass': 'Confirmar contraseña', 'account.registerBtn': 'Registrarme',
    'account.errUserChars': 'Entre 4 y 12 caracteres.', 'account.errUserInvalid': 'Solo letras y números.', 'account.errEmailInvalid': 'Correo inválido.',
    'account.errPassShort': 'Mínimo 6 caracteres.', 'account.errPassMismatch': 'Las contraseñas no coinciden.',
    'account.errLoginUser': 'Ingresa tu usuario.', 'account.errLoginUserInvalid': 'Solo letras y números, mín. 4 caracteres.',
    'account.errUserNotFound': 'Este usuario no existe.', 'account.errWrongPass': 'Contraseña incorrecta.',
    'account.passWeak': 'Débil', 'account.passMedium': 'Medio', 'account.passStrong': 'Segura',
    'account.verifyTitle': '¡Cuenta creada!', 'account.verifyDesc': 'Tu cuenta fue creada exitosamente. Ya puedes iniciar sesión.', 'account.verifyBtn': 'Iniciar sesión',
    'account.understood': 'Entendido',
    'account.expiredTitle': 'Link expirado', 'account.expiredDesc': 'El enlace ha expirado. Pide uno nuevo desde la pantalla de inicio de sesión.', 'account.expiredBtn': 'Entendido',
    'account.forgotLink': 'Olvidé mi contraseña',
    'account.forgotTitle': 'Recuperar contraseña', 'account.forgotBtn': 'Enviar enlace', 'account.back': 'Volver',
    'account.forgotSentTitle': 'Revisa tu correo', 'account.forgotSentDesc': 'Te enviamos un enlace para restablecer tu contraseña.',
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
    'panel2.welcome1': 'Welcome to myGeoChallenge!', 'panel2.welcome2': 'Which mode do you want to play?',
    'practice.title': 'Practice Tour', 'practice.chooseMode': 'Choose a mode', 'practice.continents': 'Continents',
    'practice.america': 'America', 'practice.europa': 'Europe', 'practice.africa': 'Africa',
    'practice.asia': 'Asia', 'practice.oceania': 'Oceania',
    'practice.difficulty': 'Difficulty', 'practice.easy': 'Easy', 'practice.medium': 'Medium', 'practice.hard': 'Hard',
    'practice.time': 'Time', 'practice.start': 'Confirm', 'practice.back': '← Back',
    'practice.sessionOver': 'Session over', 'practice.points': 'points', 'practice.playAgain': 'Play again',
    'name.welcome': 'Welcome!', 'name.askName': "What's your name?",
    'name.ph': 'Your name...', 'name.confirm': 'Confirm',
    'name.orDivider': 'or', 'name.hasAccount': 'Have an account? Sign in / Register',
    'name.greet': 'Hello, {name}!', 'name.greetSub': 'Prove once and for all who knows the most countries, flags and cities in the world. Get your ranking and beat your friends!',
    // Rankings
    'rankings.title': 'Rankings', 'rankings.loading': 'Loading...', 'rankings.noData': 'No data',
    'rankings.desc': 'How do you compare against the rest of the world?',
    'rankings.noFriends': 'No friends with an account yet.', 'rankings.notLoggedIn': 'Sign in to see this.',
    'rankings.tab.top100': 'Top 100', 'rankings.tab.global': 'Top Global', 'rankings.tab.friends': 'Top Friends',
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
    'social.profileUnavailable': 'Could not load this profile, please try again later',
    'social.requestSent': 'Request sent to {name}!', 'social.alreadyInList': 'Already in your list',
    'social.typeName': 'Type a name',
    'social.online': 'Online', 'social.playing': 'Playing', 'social.offline': 'Offline',
    'social.ago': '{n} {unit} ago',
    'social.unitMin': 'minute', 'social.unitMins': 'minutes',
    'social.unitHour': 'hour',  'social.unitHours': 'hours',
    'social.unitDay': 'day',    'social.unitDays': 'days',
    'social.unitMonth': 'month','social.unitMonths': 'months',
    'social.unitYear': 'year',  'social.unitYears': 'years',
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
    'splash.practice.cities.1': 'Practice mode! Place cities on the map at your own pace and sharpen your geography skills.',
    'splash.practice.flags.1': 'Practice mode! Identify world flags and train your memory without competition.',
    'splash.practice.shapes.1': 'Practice mode! Recognize countries by their shape and learn at your own pace.',
    'splash.practice.monuments.1': 'Practice mode! Place famous monuments on the map and challenge your memory.',
    'gameover.cities': 'Incredible! Everyone made it to their destination cities!',
    'gameover.monuments': 'Great job! We did it!',
    'gameover.flags': "Great job! Now let's take our tourists to the gate!",
    'gameover.shapes': 'Incredible! Our tourists are almost on their way!',
    'vs.result.win': 'YOU WON!', 'vs.result.lose': 'YOU LOST', 'vs.result.draw': "IT'S A TIE!",
    'vs.result.abandoned': 'YOU\'RE ALONE', 'vs.result.solo': 'Everyone left the match',
    'vs.result.you': 'You', 'vs.result.abandon': 'Your opponent left the match',
    'vs.guestUnavailable': 'Not available right now', 'vs.inviteExpired': 'The challenge expired',
    'vs.challengedYou': 'challenged you to Suitcase Shuffle 1v1',
    'vs.challengedShapes': 'challenged you to Map Mayhem 1v1',
    'vs.challengedCities': 'challenged you to City Blitz 1v1',
    'vs.challengedMonuments': 'challenged you to Landmark Loco 1v1',
    'vs.chooseMode': 'What mode do you want to play?',
    'profile.vsRecord': 'Versus: {w}W · {l}L',
    'versus.subtitle': 'Challenge a friend who is online',
    'versus.online': 'Online', 'versus.challenge': 'Challenge',
    'versus.noneOnline': 'No friends online right now.',
    'versus.friendly': 'Friendly Versus', 'versus.friendlyDesc': 'Play with friends or random people',
    'versus.competitive': 'Competitive Versus', 'versus.soon': 'Coming soon',
    'versus.lobbyTitle': 'Competitive Tour',
    'versus.friends': 'Friends', 'versus.friendsDesc': 'Challenge an online friend (1v1)',
    'versus.group': 'Group', 'versus.groupDesc': 'Private room up to 10',
    'versus.random': 'Random', 'versus.randomDesc': 'Join public rooms',
    'versus.subRoot': 'Choose a versus mode', 'versus.subFriendly': 'Who do you want to play with?',
    'versus.subGroup': 'Private room up to 10 players', 'versus.subRandom': 'Join a public room',
    'versus.subLobby': 'Game room',
    'lobby.createPrivate': 'Create private room', 'lobby.createPrivateDesc': 'Get a code and invite friends',
    'lobby.createRoom': 'Create room', 'lobby.createRoomDesc': 'Public by default · you can make it private inside',
    'lobby.joinByCode': 'Join with a code', 'lobby.join': 'Join', 'lobby.joined': 'Joined',
    'lobby.createPublic': 'Create public room', 'lobby.noRooms': 'No open rooms right now.',
    'lobby.code': 'Code:', 'lobby.invite': '+ Invite', 'lobby.start': 'Start', 'lobby.leave': 'Leave',
    'lobby.waitingHost': 'Waiting for the host to start…', 'lobby.you': 'you', 'lobby.host': 'HOST',
    'lobby.players': 'players', 'lobby.roomOf': "Room of", 'lobby.roomName': "{name}'s Room", 'lobby.loading': 'Loading rooms…',
    'lobby.joinError': 'Could not join the room', 'lobby.createError': 'Could not create the room',
    'lobby.kicked': 'You were kicked from the room', 'lobby.closed': 'The host closed the room', 'lobby.leftRoom': 'You left the room',
    'lobby.copied': 'Code copied!', 'lobby.placed': 'You placed #{n}',
    'lobby.cancel': 'Cancel', 'lobby.notReady': "I'm not ready",
    'lobby.starting': 'Starting in', 'lobby.cancelled': 'Countdown cancelled',
    'lobby.notReadyMsg': 'is not ready', 'lobby.someone': 'Someone',
    'lobby.myRoom': 'My room', 'lobby.public': '🌐 Public', 'lobby.private': '🔒 Private',
    'lobby.nowPublic': 'Room is now PUBLIC', 'lobby.nowPrivate': 'Room is now PRIVATE',
    'lobby.creating': 'Creating room…',
    'lobby.waitingOthers': 'Waiting for other members…',
    'lobby.inviteTitle': 'Invite friends', 'lobby.copyLink': 'Copy link',
    'lobby.linkCopied': 'Link copied!', 'lobby.sharedWith': 'Shared the link with {name}',
    'lobby.notFound': 'Room not found', 'lobby.started': 'The match already started',
    'lobby.kick': 'Kick', 'lobby.makeHost': 'Make host', 'lobby.hostTransferred': 'Host transferred',
    'lobby.disabled': 'Disabled', 'lobby.sentInvite': 'Invite sent to {name}',
    'lobby.memberJoined': 'joined the room', 'lobby.memberLeft': 'left the room',
    'lobby.invitedYou': 'invited you to their room', 'lobby.inRoom': 'In the room',
    'lobby.alreadyHave': 'You already have a room. Leave it and create a new one?',
    'lobby.namePlaceholder': 'Room name', 'lobby.joinFailed': "Couldn't join, try again",
    'lobby.unnamed': 'Room',
    'lobby.pickMode': 'Game modes', 'lobby.modeSet': 'selected', 'lobby.close': 'Close', 'lobby.soon': 'Soon',
    'lobby.playOrder': 'Play order', 'lobby.saveMode': 'Save', 'lobby.nextMode': 'Next:',
    'lobby.cdBlocked': 'The room is about to start — wait or cancel the countdown',
    'lobby.someoneIsPlaying': 'A member is currently in a game',
    'lobby.allLeft': 'Everyone abandoned the match',
    'lobby.alone.title': 'YOU\'RE ALONE',
    'nav.flags': 'Flags', 'nav.shapes': 'Silhouettes', 'nav.cities': 'Cities', 'nav.monuments': 'Monuments',
    // Notification inbox
    'notif.inbox': 'Invitations', 'notif.empty': 'No pending invitations',
    'notif.vs1v1': '1v1 Challenge', 'notif.lobbyInvite': 'Room Invite',
    'notif.timeNow': 'Just now', 'notif.timeMin': '{n} min ago',
    'results.newRecordMsg': 'Fantastic work {name}, you just hit a new high score!',
    'results.notBestMsg': "Not bad, {name}. But it's not your best score! {record} is the score to beat, which puts you in position {pos} among your friends{friendMsg}.",
    'results.friendAbove': ', just behind {name}', 'results.friendBelow': ', just ahead of {name}',
    // Account
    'nav.account': 'Account',
    'account.title': 'My Account', 'account.desc': 'Connect your account to save your progress and compete with friends online.',
    'account.login': 'Log in', 'account.register': 'Create account',
    'account.loginTitle': 'Log in', 'account.userOrEmail': 'Username or email', 'account.password': 'Password', 'account.enter': 'Sign in',
    'account.registerTitle': 'Create account', 'account.username': 'Username', 'account.email': 'Email address', 'account.confirmPass': 'Confirm password', 'account.registerBtn': 'Register',
    'account.errUserChars': 'Between 4 and 12 characters.', 'account.errUserInvalid': 'Letters and numbers only.', 'account.errEmailInvalid': 'Invalid email.',
    'account.errPassShort': 'At least 6 characters.', 'account.errPassMismatch': 'Passwords do not match.',
    'account.errLoginUser': 'Enter your username.', 'account.errLoginUserInvalid': 'Letters and numbers only, min. 4 characters.',
    'account.errUserNotFound': 'This user does not exist.', 'account.errWrongPass': 'Incorrect password.',
    'account.passWeak': 'Weak', 'account.passMedium': 'Medium', 'account.passStrong': 'Strong',
    'account.verifyTitle': 'Account created!', 'account.verifyDesc': 'Your account was created successfully. You can now log in.', 'account.verifyBtn': 'Log in',
    'account.understood': 'Got it',
    'account.expiredTitle': 'Link expired', 'account.expiredDesc': 'The link has expired. Request a new one from the login screen.', 'account.expiredBtn': 'Got it',
    'account.forgotLink': 'Forgot my password',
    'account.forgotTitle': 'Reset password', 'account.forgotBtn': 'Send link', 'account.back': 'Go back',
    'account.forgotSentTitle': 'Check your email', 'account.forgotSentDesc': 'We sent a link to reset your password.',
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
