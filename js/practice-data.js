// practice-data.js — Datos de continente y dificultad para modo práctica

// Código de país (3 letras de cities.js) → continente
const CITY_COUNTRY_CONTINENT = {
  // América
  'ARG':'america','BRA':'america','CHI':'america','PER':'america','COL':'america',
  'VEN':'america','ECU':'america','PAR':'america','URU':'america','BOL':'america',
  'GUY':'america','SUR':'america','MEX':'america','CUB':'america','PAN':'america',
  'DOM':'america','HAI':'america','JAM':'america','CRC':'america','GUA':'america',
  'HON':'america','ESA':'america','NCA':'america','BAH':'america','BRB':'america',
  'TRI':'america','USA':'america','CAN':'america','GRL':'america','PRI':'america',
  // Europa
  'ENG':'europa','FRA':'europa','ESP':'europa','POR':'europa','ITA':'europa',
  'GER':'europa','NED':'europa','RUS':'europa','TUR':'europa','GRE':'europa',
  'BEL':'europa','AUT':'europa','SWE':'europa','NOR':'europa','DEN':'europa',
  'FIN':'europa','POL':'europa','CZE':'europa','HUN':'europa','IRL':'europa',
  'UKR':'europa','SCO':'europa','ROU':'europa','BUL':'europa','SRB':'europa',
  'BLR':'europa','ISL':'europa','BIH':'europa','SUI':'europa','EST':'europa',
  'CYP':'europa','LVA':'europa','LTU':'europa','SVN':'europa','HRV':'europa',
  'ALB':'europa','MDA':'europa','MKD':'europa','MNE':'europa','LUX':'europa',
  'MLT':'europa','AND':'europa','SMR':'europa','LIE':'europa','GIB':'europa',
  // África
  'EGY':'africa','NGA':'africa','RSA':'africa','MAR':'africa','KEN':'africa',
  'ALG':'africa','TUN':'africa','LBA':'africa','SEN':'africa','ETH':'africa',
  'SOM':'africa','COD':'africa','GHA':'africa','TAN':'africa','ANG':'africa',
  'UGA':'africa','MOZ':'africa','ZIM':'africa','SDN':'africa','MAD':'africa',
  'NAM':'africa','CIV':'africa','CMR':'africa','MLI':'africa','NER':'africa',
  'GNB':'africa','GMB':'africa','SLE':'africa','LBR':'africa','GIN':'africa',
  'TGO':'africa','BEN':'africa','RWA':'africa','BDI':'africa','SSD':'africa',
  'DJI':'africa','ERI':'africa','SWZ':'africa','LSO':'africa','BWA':'africa',
  // Asia (incluye Medio Oriente)
  'UAE':'asia','KSA':'asia','IRQ':'asia','IRN':'asia','ISR':'asia','LIB':'asia',
  'QAT':'asia','KUW':'asia','JOR':'asia','OMA':'asia','SYR':'asia','YEM':'asia',
  'IND':'asia','PAK':'asia','BAN':'asia','AFG':'asia','NEP':'asia','SRI':'asia',
  'KAZ':'asia','UZB':'asia','TKM':'asia','KGZ':'asia','TJK':'asia',
  'JPN':'asia','CHN':'asia','HKG':'asia','KOR':'asia','THA':'asia',
  'SIN':'asia','PRK':'asia','TPE':'asia','VIE':'asia','INA':'asia',
  'MAS':'asia','PHI':'asia','MYA':'asia','CAM':'asia','MGL':'asia','LAO':'asia',
  'GEO':'asia','ARM':'asia','AZE':'asia',
  // Oceanía
  'AUS':'oceania','NZL':'oceania','PNG':'oceania','FIJ':'oceania',
};

// Nombre de país (en countries.js, flags) → continente
const FLAG_COUNTRY_CONTINENT = {
  // inicio
  'Estados Unidos':'america','Reino Unido':'europa','Canadá':'america',
  'Japón':'asia','China':'asia',
  // easy
  'Brasil':'america','Australia':'oceania','Francia':'europa','Alemania':'europa',
  'Italia':'europa','Inglaterra':'europa','España':'europa','México':'america',
  'Argentina':'america','Sudáfrica':'africa','India':'asia','Rusia':'europa',
  'Suiza':'europa','Suecia':'europa','Noruega':'europa','Dinamarca':'europa',
  'Grecia':'europa','Turquía':'europa','Israel':'asia','Arabia Saudita':'asia',
  'Corea del Sur':'asia','Portugal':'europa','Países Bajos':'europa','Jamaica':'america',
  // medium
  'Austria':'europa','Bélgica':'europa','Bolivia':'america','Camerún':'africa',
  'Chile':'america','Colombia':'america','Costa Rica':'america','Croacia':'europa',
  'Cuba':'america','República Checa':'europa','Ecuador':'america','Egipto':'africa',
  'Finlandia':'europa','Ghana':'africa','Guatemala':'america','Hungría':'europa',
  'Islandia':'europa','Indonesia':'asia','Irán':'asia','Irak':'asia',
  'Irlanda':'europa','Jordania':'asia','Líbano':'asia','Malasia':'asia',
  'Marruecos':'africa','Nepal':'asia','Nigeria':'africa','Corea del Norte':'asia',
  'Pakistán':'asia','Perú':'america','Polonia':'europa','Catar':'asia',
  'Rumanía':'europa','Senegal':'africa','Serbia':'europa','Singapur':'asia',
  'Eslovaquia':'europa','Sudán':'africa','Taiwán':'asia','Tailandia':'asia',
  'Túnez':'africa','Ucrania':'europa','Emiratos Árabes Unidos':'asia',
  'Uruguay':'america','Venezuela':'america','Kenia':'africa','Nueva Zelanda':'oceania',
  // hard
  'Afganistán':'asia','Albania':'europa','Argelia':'africa','Bangladés':'asia',
  'Bosnia y Herzegovina':'europa','Botsuana':'africa','Bulgaria':'europa',
  'Camboya':'asia','El Salvador':'america','Honduras':'america','Kazajistán':'asia',
  'Libia':'africa','Nicaragua':'america','Omán':'asia','Panamá':'america',
  'Paraguay':'america','Filipinas':'asia','Sri Lanka':'asia','Siria':'asia',
  'Vietnam':'asia','Costa de Marfil':'africa','Angola':'africa','Azerbaiyán':'asia',
  'República Democrática del Congo':'africa','Etiopía':'africa','Kuwait':'asia',
  'Mozambique':'africa','Myanmar':'asia','Tanzania':'africa','Uganda':'africa',
  'Yemen':'asia','Zimbabue':'africa','Armenia':'asia','Georgia':'asia',
  'Bielorrusia':'europa','Belice':'america','Estonia':'europa','Kirguistán':'asia',
  'Laos':'asia','Letonia':'europa','Lituania':'europa','Luxemburgo':'europa',
  'Madagascar':'africa','Moldavia':'europa','Montenegro':'europa','Namibia':'africa',
  'Ruanda':'africa','Surinam':'america','Tayikistán':'asia','Turkmenistán':'asia',
  'Uzbekistán':'asia','Haití':'america','República Dominicana':'america',
  'Trinidad y Tobago':'america','Somalia':'africa','Sudán del Sur':'africa',
  'Eritrea':'africa','Yibuti':'africa','Baréin':'asia','Kuwait':'asia',
  // insane
  'Mali':'africa','Burkina Faso':'africa','Níger':'africa','Chad':'africa',
  'Guinea':'africa','Liberia':'africa','Sierra Leona':'africa',
  'Guinea-Bisáu':'africa','Gambia':'africa','Togo':'africa','Benín':'africa',
  'Gabón':'africa','Congo':'africa','Guinea Ecuatorial':'africa',
  'Burundi':'africa','Esuatini':'africa','Lesoto':'africa',
  'Fiyi':'oceania','Kiribati':'oceania','Papúa Nueva Guinea':'oceania','Samoa':'oceania',
  'Tonga':'oceania','Vanuatu':'oceania','Islas Salomón':'oceania',
  'Micronesia':'oceania','Palaos':'oceania','Nauru':'oceania',
  'Islas Marshall':'oceania','Tuvalu':'oceania','Islas Cook':'oceania',
  'Niue':'oceania','Guam':'oceania','Samoa Americana':'oceania',
  'Islas Marianas del Norte':'oceania','Tahití':'oceania',
  'Chipre':'europa','Kosovo':'europa','Liechtenstein':'europa',
  'Malta':'europa','Andorra':'europa','San Marino':'europa','Mónaco':'europa',
  'Palestina':'asia','Bután':'asia','Brunéi':'asia','Timor Oriental':'asia',
  'Maldivas':'asia','Mongolia':'asia','Islandia':'europa',
  'Nueva Caledonia':'oceania','Bahamas':'america','Barbados':'america',
};

// Nombre interno shape (campo `name` en SHAPE_COUNTRIES) → continente
const SHAPE_COUNTRY_CONTINENT = {
  'China':'asia','Italia':'europa','Chile':'america','Japon':'asia',
  'Australia':'oceania','EstadosUnidos':'america','Brasil':'america',
  'India':'asia','Noruega':'europa','NuevaZelanda':'oceania',
  'Mexico':'america','Argentina':'america','Indonesia':'asia',
  'Finlandia':'europa','ReinoUnido':'europa','Espana':'europa',
  'Francia':'europa','Sudafrica':'africa','Egipto':'africa',
  'Madagascar':'africa','Rusia':'europa','Canada':'america',
  'Alaska':'america','Islandia':'europa','Suecia':'europa',
  'Portugal':'europa','Grecia':'europa','Somalia':'africa',
  'Ucrania':'europa','Alemania':'europa','Polonia':'europa',
  'Irlanda':'europa','Dinamarca':'europa','Rumania':'europa',
  'Croacia':'europa','Iran':'asia','Turquia':'europa',
  'ArabiaSaudita':'asia','Tailandia':'asia','Vietnam':'asia',
  'Mongolia':'asia','Kazajistan':'asia','Pakistan':'asia',
  'Afganistan':'asia','Myanmar':'asia','Filipinas':'asia',
  'CoreaDelSur':'asia','CoreaDelNorte':'asia','Irak':'asia',
  'Yemen':'asia','Oman':'asia','Peru':'america','Colombia':'america',
  'Venezuela':'america','Cuba':'america','Bolivia':'america',
  'Ecuador':'america','Nicaragua':'america','Honduras':'america',
  'Guatemala':'america','Uruguay':'america','Paraguay':'america',
  'Panama':'america','CostaRica':'america','Belice':'america',
  'ElSalvador':'america','Trinidad':'america','Surinam':'america',
  'Guyana':'america','Haiti':'america','Dominicana':'america',
  'PuertoRico':'america','Hawaii':'america','Groenlandia':'america',
  'Bahamas':'america',
  'Mauritania':'africa','Marruecos':'africa','Nigeria':'africa',
  'Niger':'africa','Mali':'africa','Libia':'africa','Argelia':'africa',
  'Etiopia':'africa','Sudan':'africa','Angola':'africa','Tanzania':'africa',
  'Mozambique':'africa','Kenia':'africa','RepDemCongo':'africa',
  'Zimbabue':'africa','Namibia':'africa','Botsuana':'africa',
  'Camerun':'africa','Chad':'africa','Madagascar':'africa',
  'Sahara':'africa','Congo':'africa','Gabon':'africa',
  'GuineaEcuator':'africa','Burundi':'africa','Ruanda':'africa',
  'Tunez':'africa','Ghana':'africa','Senegal':'africa',
  'CostaDeMarfil':'africa','Uganda':'africa','SudanDelSur':'africa',
  'Guinea':'africa','Liberia':'africa','SierraLeona':'africa',
  'GuineaBisau':'africa','Gambia':'africa','BurkinaFaso':'africa',
  'Benin':'africa','Togo':'africa','Angola':'africa','Esuatini':'africa',
  'Lesoto':'africa','Malaui':'africa','Seychelles':'africa',
  'CaboVerde':'africa','IslasCanarias':'africa','Yibuti':'africa',
  'Eritrea':'africa','Somalia':'africa',
  'PapGuinea':'oceania','IslasSalomon':'oceania','NuevaCaledonia':'oceania',
  'Samoa':'oceania','Vanuatu':'oceania','Fiji':'oceania',
  'Luxemburgo':'europa','PaisesBajos':'europa','Belgica':'europa',
  'Hungria':'europa','Eslovaquia':'europa','RepCheca':'europa',
  'Austria':'europa','Suiza':'europa','Kosovo':'europa',
  'Albania':'europa','Bosnia':'europa','Serbia':'europa',
  'Moldavia':'europa','Macedonia':'europa','Eslovenia':'europa',
  'Letonia':'europa','Bulgaria':'europa','Estonia':'europa',
  'Bielorrusia':'europa','Lituania':'europa','Chipre':'europa',
  'Malta':'europa','Andorra':'europa','Liechtenstein':'europa',
  'Jordania':'asia','Libano':'asia','Siria':'asia','Israel':'asia',
  'Tayikistan':'asia','Emiratos':'asia','Catar':'asia',
  'Turkmenistan':'asia','Kuwait':'asia','Azerbaijan':'asia',
  'Armenia':'asia','Palestina':'asia','Kirguistan':'asia',
  'Uzbekistan':'asia','Georgia':'asia','Nepal':'asia',
  'Butan':'asia','Bangladesh':'asia','SriLanka':'asia',
  'Malasia':'asia','Laos':'asia','Cambodia':'asia',
  'Brunei':'asia','Timor':'asia','Taiwan':'asia',
  'Guayana':'america',
};

// Dificultad de monumentos (campo img como key)
const MONUMENT_DIFF = {
  // ── FÁCIL: iconos que reconoce cualquier persona de LATAM/España de primera ──
  '1.jpg':'facil',   // Torre Eiffel
  '2.jpg':'facil',   // Estatua de la Libertad
  '4.jpg':'facil',   // Ópera de Sídney
  '6.jpg':'facil',   // Monte Fuji
  '7.jpeg':'facil',  // Taj Mahal
  '9.jpg':'facil',   // Torre de Pisa
  '11.jpg':'facil',  // Arco del Triunfo
  '13.jpg':'facil',  // Cataratas del Niágara
  '14.jpg':'facil',  // Golden Gate
  '17.jpg':'facil',  // Gran Cañón
  '20.jpg':'facil',  // Venecia
  '22.jpg':'facil',  // Coliseo Romano
  '25.jpg':'facil',  // Pirámides de Giza
  '31.jpg':'facil',  // Cristo Redentor
  '46.jpeg':'facil', // Cataratas del Iguazú
  '47.jpg':'facil',  // Empire State Building
  '61.jpg':'facil',  // Machu Picchu
  '63.jpg':'facil',  // Chichén Itzá
  '67.jpg':'facil',  // Partenón
  '68.jpg':'facil',  // Sagrada Família
  '74.jpg':'facil',  // Hollywood Sign
  '75.jpg':'facil',  // Museo del Louvre
  '82.jpg':'facil',  // Stonehenge
  '85.jpg':'facil',  // Gran Muralla China
  '86.jpg':'facil',  // Burj Khalifa
  '89.jpg':'facil',  // Big Ben
  // ── MEDIO: famosos pero requieren algo de conocimiento geográfico ─────────────
  '3.jpg':'medio',   // National Mall
  '5.jpg':'medio',   // Templo del Cielo
  '8.jpg':'medio',   // Pabellón de Oro (Kioto)
  '10.jpg':'medio',  // London Eye
  '12.jpg':'medio',  // Templo Dorado (Amritsar)
  '15.jpg':'medio',  // Angkor Wat
  '18.jpg':'medio',  // Plaza de Tiananmen
  '26.jpg':'medio',  // Brandenburg Gate
  '28.jpg':'medio',  // St. Peter's Square
  '32.jpeg':'medio', // Palacio de Versalles
  '42.jpg':'medio',  // Neuschwanstein
  '71.jpg':'medio',  // Tower Bridge
  '73.jpg':'medio',  // Times Square
  '77.jpg':'medio',  // Catedral de San Basilio
  '81.jpg':'medio',  // Uluru / Ayers Rock
  '87.jpeg':'medio', // Monte Everest
  '19.jpg':'medio',  // Yellowstone
  '21.jpg':'medio',  // Hyde Park
  '23.jpg':'medio',  // Little Mermaid (Copenhague)
  '24.jpg':'medio',  // Oia (Santorini)
  '27.jpg':'medio',  // Canal de Panamá
  '29.jpg':'medio',  // Sacré-Cœur
  '33.jpg':'medio',  // Grand Place (Bruselas)
  '35.jpg':'medio',  // Terracotta Warriors
  '38.jpg':'medio',  // Gran Barrera de Coral
  '40.jpg':'medio',  // Monte Kilimanjaro
  '45.jpg':'medio',  // Cape of Good Hope
  '48.jpg':'medio',  // Cataratas Victoria
  '49.jpg':'medio',  // Museo del Hermitage
  '50.jpg':'medio',  // Matterhorn
  '53.jpg':'medio',  // Pompeii
  '56.jpg':'medio',  // Trafalgar Square
  '59.jpg':'medio',  // Islas Galápagos
  '60.jpg':'medio',  // Isla de Pascua
  '65.jpg':'medio',  // Petra
  '69.jpg':'medio',  // Abu Simbel
  '70.jpg':'medio',  // Wat Phra Kaew
  '72.jpg':'medio',  // Alhambra
  '76.jpg':'medio',  // Petronas Towers
  '79.jpg':'medio',  // Salar de Uyuni
  '83.jpg':'medio',  // Hagia Sophia
  '84.jpg':'medio',  // Borobudur
  '90.jpg':'medio',  // Teotihuacán
  // ── DIFÍCIL: lugares específicos o menos reconocibles ────────────────────────
  '16.jpg':'dificil',// Molino de Lisse (Holanda)
  '30.jpg':'dificil',// Melrose Abbey (Escocia)
  '34.jpg':'dificil',// Fisherman's Wharf (San Francisco)
  '36.jpg':'dificil',// Cambridge
  '37.jpg':'dificil',// Tivoli Gardens (Copenhague)
  '39.jpg':'dificil',// Isla del Sur (Nueva Zelanda)
  '41.jpeg':'dificil',// Torre de Belém (Lisboa)
  '43.jpg':'dificil',// Great Smoky Mountains
  '44.jpg':'dificil',// Pine Barrens (Nueva Jersey)
  '51.jpg':'dificil',// Monte Cook (NZ)
  '52.jpg':'dificil',// Torres del Paine (Patagonia)
  '54.jpg':'dificil',// Ciudad de las Artes y las Ciencias (Valencia)
  '55.jpg':'dificil',// Bratislava Castle
  '57.jpg':'dificil',// Merlion (Singapur)
  '58.jpg':'dificil',// Templo de Philae (Egipto)
  '62.jpg':'dificil',// Líneas de Nazca
  '64.jpg':'dificil',// Cancún
  '66.jpg':'dificil',// Avenida 9 de Julio (Buenos Aires)
  '78.jpg':'dificil',// Roman Baths (Bath, UK)
  '80.jpg':'dificil',// Hong Kong skyline
  '88.jpg':'dificil',// Huascarán (Perú)
};

// Código de país (3 letras) → nombre completo, usado en tag de ciudad
const CITY_COUNTRY_NAMES = {
  es: {
    'AFG':'Afganistán','AIA':'Anguila','ALG':'Argelia','AND':'Andorra',
    'ANG':'Angola','ARG':'Argentina','ARU':'Aruba','AUS':'Australia',
    'AUT':'Austria','BAH':'Bahamas','BAN':'Bangladés','BEL':'Bélgica',
    'BHR':'Baréin','BIH':'Bosnia','BLR':'Bielorrusia','BOL':'Bolivia',
    'BRA':'Brasil','BRB':'Barbados','BUL':'Bulgaria','CAM':'Camboya',
    'CAN':'Canadá','CHI':'Chile','CHN':'China','CIV':'Costa de Marfil',
    'COD':'R.D. Congo','COL':'Colombia','CRC':'Costa Rica','CUB':'Cuba',
    'CYP':'Chipre','CZE':'Chequia','DEN':'Dinamarca','DOM':'Rep. Dominicana',
    'ECU':'Ecuador','EGY':'Egipto','ENG':'Inglaterra','ESA':'El Salvador',
    'ESP':'España','EST':'Estonia','ETH':'Etiopía','FIN':'Finlandia',
    'FRA':'Francia','FRO':'Islas Feroe','GER':'Alemania','GHA':'Ghana',
    'GRE':'Grecia','GRL':'Groenlandia','GUA':'Guatemala','GUY':'Guyana',
    'HAI':'Haití','HKG':'Hong Kong','HON':'Honduras','HUN':'Hungría',
    'INA':'Indonesia','IND':'India','IRL':'Irlanda','IRN':'Irán',
    'IRQ':'Irak','ISL':'Islandia','ISR':'Israel','ITA':'Italia',
    'JAM':'Jamaica','JOR':'Jordania','JPN':'Japón','KAZ':'Kazajistán',
    'KEN':'Kenia','KOR':'Corea del Sur','KSA':'Arabia Saudita',
    'KUW':'Kuwait','LAO':'Laos','LBA':'Libia','LBR':'Liberia',
    'LIB':'Líbano','LIE':'Liechtenstein','MAD':'Madagascar',
    'MAR':'Marruecos','MAS':'Malasia','MAY':'Mayotte','MEX':'México',
    'MGL':'Mongolia','MOZ':'Mozambique','MYA':'Myanmar','NAM':'Namibia',
    'NCA':'Nicaragua','NED':'Países Bajos','NEP':'Nepal','NGA':'Nigeria',
    'NOR':'Noruega','NZL':'Nueva Zelanda','OMA':'Omán','PAK':'Pakistán',
    'PAN':'Panamá','PAR':'Paraguay','PER':'Perú','PHI':'Filipinas',
    'PNG':'Papua N.Guinea','POL':'Polonia','POR':'Portugal',
    'PRK':'Corea del Norte','QAT':'Catar','ROU':'Rumanía','RSA':'Sudáfrica',
    'RUS':'Rusia','SCO':'Escocia','SDN':'Sudán','SEN':'Senegal',
    'SIN':'Singapur','SMR':'San Marino','SOM':'Somalia','SRB':'Serbia',
    'SRI':'Sri Lanka','SUI':'Suiza','SUR':'Surinam','SVN':'Eslovenia',
    'SWE':'Suecia','TAN':'Tanzania','THA':'Tailandia','TOG':'Togo',
    'TPE':'Taiwán','TUN':'Túnez','TUR':'Turquía','UAE':'Emiratos Árabes',
    'UGA':'Uganda','UKR':'Ucrania','URU':'Uruguay','USA':'Estados Unidos',
    'UZB':'Uzbekistán','VEN':'Venezuela','VIE':'Vietnam','ZIM':'Zimbabue',
  },
  en: {
    'AFG':'Afghanistan','AIA':'Anguilla','ALG':'Algeria','AND':'Andorra',
    'ANG':'Angola','ARG':'Argentina','ARU':'Aruba','AUS':'Australia',
    'AUT':'Austria','BAH':'Bahamas','BAN':'Bangladesh','BEL':'Belgium',
    'BHR':'Bahrain','BIH':'Bosnia','BLR':'Belarus','BOL':'Bolivia',
    'BRA':'Brazil','BRB':'Barbados','BUL':'Bulgaria','CAM':'Cambodia',
    'CAN':'Canada','CHI':'Chile','CHN':'China','CIV':'Ivory Coast',
    'COD':'DR Congo','COL':'Colombia','CRC':'Costa Rica','CUB':'Cuba',
    'CYP':'Cyprus','CZE':'Czech Rep.','DEN':'Denmark','DOM':'Dominican Rep.',
    'ECU':'Ecuador','EGY':'Egypt','ENG':'England','ESA':'El Salvador',
    'ESP':'Spain','EST':'Estonia','ETH':'Ethiopia','FIN':'Finland',
    'FRA':'France','FRO':'Faroe Islands','GER':'Germany','GHA':'Ghana',
    'GRE':'Greece','GRL':'Greenland','GUA':'Guatemala','GUY':'Guyana',
    'HAI':'Haiti','HKG':'Hong Kong','HON':'Honduras','HUN':'Hungary',
    'INA':'Indonesia','IND':'India','IRL':'Ireland','IRN':'Iran',
    'IRQ':'Iraq','ISL':'Iceland','ISR':'Israel','ITA':'Italy',
    'JAM':'Jamaica','JOR':'Jordan','JPN':'Japan','KAZ':'Kazakhstan',
    'KEN':'Kenya','KOR':'South Korea','KSA':'Saudi Arabia',
    'KUW':'Kuwait','LAO':'Laos','LBA':'Libya','LBR':'Liberia',
    'LIB':'Lebanon','LIE':'Liechtenstein','MAD':'Madagascar',
    'MAR':'Morocco','MAS':'Malaysia','MAY':'Mayotte','MEX':'Mexico',
    'MGL':'Mongolia','MOZ':'Mozambique','MYA':'Myanmar','NAM':'Namibia',
    'NCA':'Nicaragua','NED':'Netherlands','NEP':'Nepal','NGA':'Nigeria',
    'NOR':'Norway','NZL':'New Zealand','OMA':'Oman','PAK':'Pakistan',
    'PAN':'Panama','PAR':'Paraguay','PER':'Peru','PHI':'Philippines',
    'PNG':'Papua N.Guinea','POL':'Poland','POR':'Portugal',
    'PRK':'North Korea','QAT':'Qatar','ROU':'Romania','RSA':'South Africa',
    'RUS':'Russia','SCO':'Scotland','SDN':'Sudan','SEN':'Senegal',
    'SIN':'Singapore','SMR':'San Marino','SOM':'Somalia','SRB':'Serbia',
    'SRI':'Sri Lanka','SUI':'Switzerland','SUR':'Suriname','SVN':'Slovenia',
    'SWE':'Sweden','TAN':'Tanzania','THA':'Thailand','TOG':'Togo',
    'TPE':'Taiwan','TUN':'Tunisia','TUR':'Turkey','UAE':'UAE',
    'UGA':'Uganda','UKR':'Ukraine','URU':'Uruguay','USA':'United States',
    'UZB':'Uzbekistan','VEN':'Venezuela','VIE':'Vietnam','ZIM':'Zimbabwe',
  },
};

function getCityCountryName(code) {
  const lang = (typeof currentLang !== 'undefined') ? currentLang : 'es';
  return (CITY_COUNTRY_NAMES[lang] || CITY_COUNTRY_NAMES.es)[code] || code;
}
