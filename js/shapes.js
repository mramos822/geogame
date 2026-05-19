// shapes.js — Todos los países soberanos existentes para el modo siluetas
// Dificultad basada en qué tan reconocible es la silueta del país

const SHAPE_COUNTRIES = {

  // ── FÁCIL ─────────────────────────────────────────────────────────────────
  // Siluetas icónicas, únicas o muy conocidas globalmente
  easy: [
    "Italia",           // bota inconfundible
    "Chile",            // franja vertical delgadísima
    "Japón",            // cadena de islas en arco
    "Australia",        // masa continental aislada y única
    "Estados Unidos",   // forma muy conocida
    "Brasil",           // gran masa con curvas reconocibles
    "India",            // triángulo de subcontinente
    "Noruega",          // costa de fiordos extremadamente dentada
    "Nueva Zelanda",    // dos islas alargadas
    "México",           // cuerno hacia el sureste
    "Argentina",        // cono largo apuntando al sur
    "Finlandia",        // forma irregular con muchos lagos
    "Francia",          // hexágono aproximado
    "España",           // bloque ibérico rectangular
    "Reino Unido",      // isla con perfil muy conocido
    "Sudáfrica",        // base plana al extremo sur de África
    "Egipto",           // casi un rectángulo perfecto
    "Madagascar",       // isla grande y alargada
    "Rusia",            // masa enorme inconfundible
    "Canadá",           // enorme con Grandes Lagos al sur
    "Islandia",         // isla volcánica de forma muy particular
    "Suecia",           // alargada con perfil nórdico este
    "Portugal",         // franja rectangular en el extremo oeste ibérico
    "Grecia",           // península + archipiélago muy reconocible
    "Somalia",          // cuerno de África muy distintivo
  ],

  // ── MEDIO ─────────────────────────────────────────────────────────────────
  // Siluetas con rasgos propios pero menos inmediatamente obvios
  medium: [
    // Europa
    "Alemania",
    "Polonia",
    "Ucrania",
    "Irlanda",
    "Dinamarca",
    "Rumanía",
    "Croacia",
    "Noruega",

    // Asia
    "Turquía",
    "Irán",
    "Arabia Saudí",
    "Vietnam",
    "Tailandia",
    "China",
    "Mongolia",
    "Kazajistán",
    "Pakistán",
    "Afganistán",
    "Myanmar",
    "Indonesia",
    "Filipinas",
    "Corea del Norte",
    "Corea del Sur",
    "Irak",
    "Omán",
    "Yemen",

    // América
    "Colombia",
    "Perú",
    "Venezuela",
    "Cuba",
    "Bolivia",
    "Ecuador",
    "Guatemala",
    "Honduras",
    "Nicaragua",
    "Paraguay",
    "Uruguay",

    // África
    "Argelia",
    "Libia",
    "Malí",
    "Marruecos",
    "Mauritania",
    "Níger",
    "Nigeria",
    "Sudán",
    "Etiopía",
    "Angola",
    "Mozambique",
    "Tanzania",
    "Kenia",
    "Zambia",
    "República Democrática del Congo",
    "Namibia",
    "Botsuana",
    "Zimbabue",
    "Camerún",
    "Chad",

    // Oceanía
    "Papúa Nueva Guinea",
  ],

  // ── DIFÍCIL ───────────────────────────────────────────────────────────────
  // Formas muy similares a vecinos, sin rasgos únicos o países muy pequeños
  hard: [
    // Europa
    "Bélgica",
    "Países Bajos",
    "Luxemburgo",
    "Suiza",
    "Austria",
    "República Checa",
    "Eslovaquia",
    "Hungría",
    "Bulgaria",
    "Serbia",
    "Bosnia y Herzegovina",
    "Montenegro",
    "Albania",
    "Macedonia del Norte",
    "Kosovo",
    "Eslovenia",
    "Moldavia",
    "Bielorrusia",
    "Letonia",
    "Lituania",
    "Estonia",
    "Chipre",
    "Malta",
    "Andorra",
    "Liechtenstein",
    "San Marino",
    "Mónaco",
    "Vaticano",

    // Asia
    "Siria",
    "Líbano",
    "Jordania",
    "Israel",
    "Palestina",
    "Armenia",
    "Azerbaiyán",
    "Georgia",
    "Uzbekistán",
    "Turkmenistán",
    "Tayikistán",
    "Kirguistán",
    "Bangladés",
    "Nepal",
    "Bután",
    "Sri Lanka",
    "Laos",
    "Camboya",
    "Malasia",
    "Brunéi",
    "Timor Oriental",
    "Singapur",
    "Kuwait",
    "Baréin",
    "Catar",
    "Emiratos Árabes Unidos",
    "Taiwán",
    "Maldivas",

    // América
    "Belice",
    "El Salvador",
    "Costa Rica",
    "Panamá",
    "Guyana",
    "Surinam",
    "Trinidad y Tobago",
    "Jamaica",
    "Haití",
    "República Dominicana",
    "Cuba",
    "Bahamas",
    "Barbados",
    "Dominica",
    "Granada",
    "Santa Lucía",
    "San Vicente y las Granadinas",
    "Antigua y Barbuda",
    "San Cristóbal y Nieves",

    // África
    "Túnez",
    "Ghana",
    "Costa de Marfil",
    "Senegal",
    "Gambia",
    "Guinea",
    "Guinea-Bisáu",
    "Guinea Ecuatorial",
    "Sierra Leona",
    "Liberia",
    "Togo",
    "Benín",
    "Burkina Faso",
    "República Centroafricana",
    "Congo",
    "Gabón",
    "Uganda",
    "Ruanda",
    "Burundi",
    "Sudán del Sur",
    "Eritrea",
    "Yibuti",
    "Malaui",
    "Lesoto",
    "Suazilandia",
    "Mozambique",
    "Mauritania",
    "Comoras",
    "Cabo Verde",
    "Santo Tomé y Príncipe",
    "Seychelles",
    "Mauricio",

    // Oceanía
    "Fiyi",
    "Vanuatu",
    "Islas Salomón",
    "Samoa",
    "Tonga",
    "Kiribati",
    "Islas Marshall",
    "Micronesia",
    "Palaos",
    "Nauru",
    "Tuvalu",
  ],
};
