const CITIES = [
  // ── América del Sur ─────────────────────────────────────────────────────────
  { name: "Buenos Aires",          country: "ARG", lat: -34.61, lon:  -58.38, diff: "inicio" },
  { name: "Rosario",               country: "ARG", lat: -32.95, lon:  -60.66, diff: "medio"  },
  { name: "Ushuaia",               country: "ARG", lat: -54.00, lon:  -68.30, diff: "medio"  },
  { name: "Corrientes",            country: "ARG", lat: -27.47, lon:  -58.83, diff: "dificil"},

  { name: "São Paulo",             country: "BRA", lat: -23.55, lon:  -46.63, diff: "inicio" },
  { name: "Río de Janeiro",        country: "BRA", lat: -22.91, lon:  -43.17, diff: "inicio" },
  { name: "Brasilia",              country: "BRA", lat: -15.78, lon:  -47.93, diff: "facil"  },
  { name: "Belo Horizonte",        country: "BRA", lat: -19.92, lon:  -43.94, diff: "medio"  },
  { name: "Recife",                country: "BRA", lat:  -8.05, lon:  -34.88, diff: "medio"  },
  { name: "Fortaleza",             country: "BRA", lat:  -3.72, lon:  -38.54, diff: "medio"  },
  { name: "Manaus",                country: "BRA", lat:  -3.12, lon:  -60.02, diff: "medio"  },
  { name: "Salvador",              country: "BRA", lat: -12.97, lon:  -38.50, diff: "medio"  },
  { name: "Curitiba",              country: "BRA", lat: -25.43, lon:  -49.27, diff: "medio"  },
  { name: "Porto Alegre",          country: "BRA", lat: -30.03, lon:  -51.23, diff: "medio"  },
  { name: "Belém",                 country: "BRA", lat:  -1.46, lon:  -48.50, diff: "medio"  },
  { name: "Porto Velho",           country: "BRA", lat:  -8.76, lon:  -63.90, diff: "dificil"},
  { name: "Santarém",              country: "BRA", lat:  -2.44, lon:  -54.71, diff: "dificil"},

  { name: "Santiago",              country: "CHI", lat: -33.45, lon:  -70.67, diff: "inicio" },
  { name: "Valparaíso",            country: "CHI", lat: -33.05, lon:  -71.62, diff: "medio"  },
  { name: "Antofagasta",           country: "CHI", lat: -23.65, lon:  -70.40, diff: "dificil"},
  { name: "Rancagua",              country: "CHI", lat: -34.17, lon:  -70.74, diff: "dificil"},

  { name: "Lima",                  country: "PER", lat: -12.06, lon:  -77.04, diff: "inicio" },
  { name: "Arequipa",              country: "PER", lat: -16.41, lon:  -71.54, diff: "dificil"},
  { name: "Iquitos",               country: "PER", lat:  -3.74, lon:  -73.25, diff: "dificil"},
  { name: "Piura",                 country: "PER", lat:  -5.19, lon:  -80.63, diff: "dificil"},

  { name: "Bogotá",                country: "COL", lat:   4.71, lon:  -74.07, diff: "inicio" },
  { name: "Medellín",              country: "COL", lat:   6.25, lon:  -75.56, diff: "facil"  },
  { name: "Cali",                  country: "COL", lat:   3.43, lon:  -76.52, diff: "facil"  },
  { name: "Barranquilla",          country: "COL", lat:  10.96, lon:  -74.80, diff: "medio"  },

  { name: "Caracas",               country: "VEN", lat:  10.49, lon:  -66.88, diff: "inicio" },
  { name: "Maracaibo",             country: "VEN", lat:  10.63, lon:  -71.64, diff: "medio"  },

  { name: "Quito",                 country: "ECU", lat:  -0.22, lon:  -78.51, diff: "facil"  },
  { name: "Guayaquil",             country: "ECU", lat:  -2.17, lon:  -79.92, diff: "medio"  },

  { name: "Asunción",              country: "PAR", lat: -25.29, lon:  -57.64, diff: "facil"  },
  { name: "Montevideo",            country: "URU", lat: -34.90, lon:  -56.19, diff: "facil"  },

  { name: "La Paz",                country: "BOL", lat: -16.50, lon:  -68.15, diff: "facil"  },
  { name: "Santa Cruz de la Sierra", country: "BOL", lat: -17.79, lon:  -63.18, diff: "medio"},
  { name: "Cochabamba",            country: "BOL", lat: -17.39, lon:  -66.16, diff: "dificil"},

  { name: "Georgetown",            country: "GUY", lat:   6.80, lon:  -58.16, diff: "dificil"},
  { name: "Paramaribo",            country: "SUR", lat:   5.87, lon:  -55.17, diff: "dificil"},

  // ── América Central y Caribe ────────────────────────────────────────────────
  { name: "Ciudad de México",      country: "MEX", lat:  19.43, lon:  -99.13, diff: "inicio" },
  { name: "Guadalajara",           country: "MEX", lat:  20.67, lon: -103.35, diff: "facil"  },
  { name: "Monterrey",             country: "MEX", lat:  25.67, lon: -100.31, diff: "facil"  },
  { name: "Cancún",                country: "MEX", lat:  21.16, lon:  -86.85, diff: "facil"  },
  { name: "Tijuana",               country: "MEX", lat:  32.53, lon: -117.04, diff: "medio"  },
  { name: "Mérida",                country: "MEX", lat:  20.97, lon:  -89.62, diff: "medio"  },

  { name: "La Habana",             country: "CUB", lat:  23.13, lon:  -82.38, diff: "inicio" },
  { name: "Panamá",                country: "PAN", lat:   8.99, lon:  -79.52, diff: "inicio" },
  { name: "Santo Domingo",         country: "DOM", lat:  18.48, lon:  -69.90, diff: "facil"  },
  { name: "Puerto Príncipe",       country: "HAI", lat:  18.54, lon:  -72.34, diff: "facil"  },
  { name: "Kingston",              country: "JAM", lat:  17.99, lon:  -76.79, diff: "medio"  },
  { name: "San José",              country: "CRC", lat:   9.93, lon:  -84.08, diff: "facil"  },
  { name: "Ciudad de Guatemala",   country: "GUA", lat:  14.64, lon:  -90.51, diff: "facil"  },
  { name: "Tegucigalpa",           country: "HON", lat:  14.10, lon:  -87.20, diff: "medio"  },
  { name: "San Salvador",          country: "ESA", lat:  13.69, lon:  -89.19, diff: "medio"  },
  { name: "Managua",               country: "NCA", lat:  12.13, lon:  -86.28, diff: "medio"  },
  { name: "Nassau",                country: "BAH", lat:  25.05, lon:  -77.34, diff: "medio"  },
  { name: "Bridgetown",            country: "BRB", lat:  13.10, lon:  -59.62, diff: "dificil"},
  { name: "Oranjestad",            country: "ARU", lat:  12.52, lon:  -70.03, diff: "dificil"},
  { name: "The Valley",            country: "AIA", lat:  18.22, lon:  -63.05, diff: "dificil"},

  // ── América del Norte ───────────────────────────────────────────────────────
  { name: "Nueva York",            country: "USA", lat:  40.71, lon:  -74.01, diff: "inicio" },
  { name: "Los Ángeles",           country: "USA", lat:  34.05, lon: -118.24, diff: "inicio" },
  { name: "Miami",                 country: "USA", lat:  25.77, lon:  -80.19, diff: "inicio" },
  { name: "Washington D.C.",       country: "USA", lat:  38.91, lon:  -77.04, diff: "inicio" },
  { name: "Chicago",               country: "USA", lat:  41.85, lon:  -87.65, diff: "inicio" },
  { name: "Las Vegas",             country: "USA", lat:  36.17, lon: -115.14, diff: "inicio" },
  { name: "San Francisco",         country: "USA", lat:  37.77, lon: -122.42, diff: "inicio" },

  { name: "Houston",               country: "USA", lat:  29.76, lon:  -95.37, diff: "facil"  },
  { name: "Dallas",                country: "USA", lat:  32.78, lon:  -96.80, diff: "facil"  },
  { name: "Phoenix",               country: "USA", lat:  33.45, lon: -112.07, diff: "facil"  },
  { name: "Seattle",               country: "USA", lat:  47.61, lon: -122.33, diff: "facil"  },
  { name: "Boston",                country: "USA", lat:  42.36, lon:  -71.06, diff: "facil"  },
  { name: "Atlanta",               country: "USA", lat:  33.75, lon:  -84.39, diff: "facil"  },
  { name: "Denver",                country: "USA", lat:  39.74, lon: -104.98, diff: "medio"  },
  { name: "San Diego",             country: "USA", lat:  32.72, lon: -117.16, diff: "medio"  },
  { name: "Orlando",               country: "USA", lat:  28.54, lon:  -81.38, diff: "facil"  },
  { name: "Toronto",               country: "CAN", lat:  43.70, lon:  -79.42, diff: "facil"  },
  { name: "Montreal",              country: "CAN", lat:  45.51, lon:  -73.55, diff: "facil"  },
  { name: "Vancouver",             country: "CAN", lat:  49.25, lon: -123.12, diff: "facil"  },

  { name: "Philadelphia",          country: "USA", lat:  39.95, lon:  -75.17, diff: "medio"  },
  { name: "Salt Lake City",        country: "USA", lat:  40.76, lon: -111.89, diff: "medio"  },
  { name: "Detroit",               country: "USA", lat:  42.33, lon:  -83.05, diff: "medio"  },
  { name: "Baltimore",             country: "USA", lat:  39.29, lon:  -76.61, diff: "medio"  },
  { name: "Nashville",             country: "USA", lat:  36.17, lon:  -86.78, diff: "medio"  },
  { name: "Jacksonville",          country: "USA", lat:  30.33, lon:  -81.66, diff: "medio"  },
  { name: "Oklahoma City",         country: "USA", lat:  35.47, lon:  -97.52, diff: "medio"  },
  { name: "Ottawa",                country: "CAN", lat:  45.42, lon:  -75.69, diff: "medio"  },
  { name: "Calgary",               country: "CAN", lat:  51.04, lon: -114.07, diff: "medio"  },
  { name: "Quebec",                country: "CAN", lat:  46.81, lon:  -71.21, diff: "medio"  },
  { name: "Winnipeg",              country: "CAN", lat:  49.90, lon:  -97.14, diff: "medio"  },

  { name: "Newark",                country: "USA", lat:  40.74, lon:  -74.17, diff: "dificil"},
  { name: "Bridgeport",            country: "USA", lat:  41.18, lon:  -73.19, diff: "dificil"},
  { name: "Wichita",               country: "USA", lat:  37.69, lon:  -97.34, diff: "dificil"},
  { name: "Des Moines",            country: "USA", lat:  41.60, lon:  -93.61, diff: "dificil"},
  { name: "Nuuk",                  country: "GRL", lat:  64.18, lon:  -51.74, diff: "dificil"},

  // ── Europa ──────────────────────────────────────────────────────────────────
  { name: "Londres",               country: "ENG", lat:  51.51, lon:   -0.13, diff: "inicio" },
  { name: "París",                 country: "FRA", lat:  48.85, lon:    2.35, diff: "inicio" },
  { name: "Madrid",                country: "ESP", lat:  40.42, lon:   -3.70, diff: "inicio" },
  { name: "Barcelona",             country: "ESP", lat:  41.39, lon:    2.17, diff: "inicio" },
  { name: "Lisboa",                country: "POR", lat:  38.72, lon:   -9.14, diff: "inicio" },
  { name: "Roma",                  country: "ITA", lat:  41.90, lon:   12.48, diff: "inicio" },
  { name: "Milán",                 country: "ITA", lat:  45.46, lon:    9.19, diff: "inicio" },
  { name: "Berlín",                country: "GER", lat:  52.52, lon:   13.41, diff: "inicio" },
  { name: "Ámsterdam",             country: "NED", lat:  52.37, lon:    4.90, diff: "inicio" },
  { name: "Moscú",                 country: "RUS", lat:  55.75, lon:   37.62, diff: "inicio" },
  { name: "Estambul",              country: "TUR", lat:  41.01, lon:   28.95, diff: "inicio" },
  { name: "Atenas",                country: "GRE", lat:  37.98, lon:   23.73, diff: "inicio" },

  { name: "Venecia",               country: "ITA", lat:  45.44, lon:   12.32, diff: "facil"  },
  { name: "Nápoles",               country: "ITA", lat:  40.85, lon:   14.27, diff: "facil"  },
  { name: "Múnich",                country: "GER", lat:  48.14, lon:   11.58, diff: "facil"  },
  { name: "Hamburgo",              country: "GER", lat:  53.55, lon:   10.00, diff: "facil"  },
  { name: "Bruselas",              country: "BEL", lat:  50.85, lon:    4.35, diff: "facil"  },
  { name: "Viena",                 country: "AUT", lat:  48.21, lon:   16.37, diff: "facil"  },
  { name: "Estocolmo",             country: "SWE", lat:  59.33, lon:   18.07, diff: "facil"  },
  { name: "Oslo",                  country: "NOR", lat:  59.91, lon:   10.75, diff: "facil"  },
  { name: "Copenhague",            country: "DEN", lat:  55.68, lon:   12.57, diff: "facil"  },
  { name: "Helsinki",              country: "FIN", lat:  60.17, lon:   24.94, diff: "facil"  },
  { name: "Varsovia",              country: "POL", lat:  52.23, lon:   21.01, diff: "facil"  },
  { name: "Praga",                 country: "CZE", lat:  50.08, lon:   14.44, diff: "facil"  },
  { name: "Budapest",              country: "HUN", lat:  47.50, lon:   19.04, diff: "facil"  },
  { name: "Dublín",                country: "IRL", lat:  53.33, lon:   -6.25, diff: "facil"  },
  { name: "Kiev",                  country: "UKR", lat:  50.45, lon:   30.52, diff: "facil"  },
  { name: "San Petersburgo",       country: "RUS", lat:  59.95, lon:   30.32, diff: "facil"  },
  { name: "Manchester",            country: "ENG", lat:  53.48, lon:   -2.24, diff: "medio"  },
  { name: "Sevilla",               country: "ESP", lat:  37.39, lon:   -5.99, diff: "facil"  },
  { name: "Valencia",              country: "ESP", lat:  39.47, lon:   -0.38, diff: "medio"  },
  { name: "Lyon",                  country: "FRA", lat:  45.76, lon:    4.84, diff: "facil"  },
  { name: "Niza",                  country: "FRA", lat:  43.70, lon:    7.26, diff: "medio"  },

  { name: "Bucarest",              country: "ROU", lat:  44.44, lon:   26.10, diff: "medio"  },
  { name: "Sofía",                 country: "BUL", lat:  42.70, lon:   23.32, diff: "medio"  },
  { name: "Belgrado",              country: "SRB", lat:  44.82, lon:   20.46, diff: "medio"  },
  { name: "Minsk",                 country: "BLR", lat:  53.90, lon:   27.57, diff: "medio"  },
  { name: "Reikiavik",             country: "ISL", lat:  64.13, lon:  -21.94, diff: "medio"  },
  { name: "Birmingham",            country: "ENG", lat:  52.48, lon:   -1.90, diff: "medio"  },
  { name: "Glasgow",               country: "SCO", lat:  55.86, lon:   -4.25, diff: "medio"  },
  { name: "Sarajevo",              country: "BIH", lat:  43.85, lon:   18.36, diff: "medio"  },
  { name: "Berna",                 country: "SUI", lat:  46.95, lon:    7.45, diff: "medio"  },
  { name: "Zúrich",                country: "SUI", lat:  47.38, lon:    8.54, diff: "medio"  },
  { name: "Toulouse",              country: "FRA", lat:  43.60, lon:    1.44, diff: "medio"  },
  { name: "Cork",                  country: "IRL", lat:  51.90, lon:   -8.47, diff: "medio"  },
  { name: "Ankara",                country: "TUR", lat:  39.93, lon:   32.86, diff: "medio"  },

  { name: "Tallinn",               country: "EST", lat:  59.44, lon:   24.75, diff: "dificil"},
  { name: "Nicosia",               country: "CYP", lat:  35.17, lon:   33.36, diff: "dificil"},
  { name: "Tórshavn",              country: "FRO", lat:  62.01, lon:   -6.77, diff: "dificil"},
  { name: "Vaduz",                 country: "LIE", lat:  47.14, lon:    9.52, diff: "dificil"},
  { name: "Andorra la Vella",      country: "AND", lat:  42.51, lon:    1.52, diff: "dificil"},
  { name: "San Marino",            country: "SMR", lat:  43.94, lon:   12.45, diff: "dificil"},
  { name: "Ljubljana",             country: "SVN", lat:  46.05, lon:   14.51, diff: "dificil"},
  { name: "Brno",                  country: "CZE", lat:  49.20, lon:   16.61, diff: "dificil"},
  { name: "Greenwich",             country: "ENG", lat:  51.48, lon:    0.00, diff: "dificil"},

  // ── África ──────────────────────────────────────────────────────────────────
  { name: "El Cairo",              country: "EGY", lat:  30.06, lon:   31.25, diff: "inicio" },

  { name: "Lagos",                 country: "NGA", lat:   6.46, lon:    3.38, diff: "facil"  },
  { name: "Abuja",                 country: "NGA", lat:   9.07, lon:    7.40, diff: "medio"  },
  { name: "Johannesburgo",         country: "RSA", lat: -26.20, lon:   28.04, diff: "facil"  },
  { name: "Ciudad del Cabo",       country: "RSA", lat: -33.93, lon:   18.42, diff: "facil"  },
  { name: "Casablanca",            country: "MAR", lat:  33.59, lon:   -7.62, diff: "facil"  },
  { name: "Nairobi",               country: "KEN", lat:  -1.29, lon:   36.82, diff: "facil"  },
  { name: "Argel",                 country: "ALG", lat:  36.74, lon:    3.06, diff: "medio"  },
  { name: "Rabat",                 country: "MAR", lat:  34.02, lon:   -6.83, diff: "medio"  },
  { name: "Túnez",                 country: "TUN", lat:  36.82, lon:   10.17, diff: "facil"  },
  { name: "Trípoli",               country: "LBA", lat:  32.90, lon:   13.18, diff: "medio"  },
  { name: "Dakar",                 country: "SEN", lat:  14.72, lon:  -17.47, diff: "facil"  },
  { name: "Addis Abeba",           country: "ETH", lat:   9.03, lon:   38.74, diff: "facil"  },
  { name: "Mogadiscio",            country: "SOM", lat:   2.05, lon:   45.34, diff: "medio"  },

  { name: "Kinshasa",              country: "COD", lat:  -4.32, lon:   15.32, diff: "medio"  },
  { name: "Accra",                 country: "GHA", lat:   5.56, lon:   -0.20, diff: "medio"  },
  { name: "Dar es Salaam",         country: "TAN", lat:  -6.79, lon:   39.21, diff: "medio"  },
  { name: "Luanda",                country: "ANG", lat:  -8.84, lon:   13.23, diff: "medio"  },
  { name: "Kampala",               country: "UGA", lat:   0.32, lon:   32.58, diff: "medio"  },
  { name: "Maputo",                country: "MOZ", lat: -25.97, lon:   32.59, diff: "medio"  },
  { name: "Harare",                country: "ZIM", lat: -17.83, lon:   31.05, diff: "medio"  },
  { name: "Kartum",                country: "SDN", lat:  15.55, lon:   32.53, diff: "medio"  },

  { name: "Antananarivo",          country: "MAD", lat: -18.91, lon:   47.54, diff: "dificil"},
  { name: "Lomé",                  country: "TOG", lat:   6.13, lon:    1.22, diff: "dificil"},
  { name: "Monrovia",              country: "LBR", lat:   6.30, lon:  -10.80, diff: "dificil"},
  { name: "Windhoek",              country: "NAM", lat: -22.56, lon:   17.08, diff: "dificil"},
  { name: "Abiyán",                country: "CIV", lat:   5.35, lon:   -4.02, diff: "dificil"},
  { name: "Mamoudzou",             country: "MAY", lat: -12.78, lon:   45.23, diff: "dificil"},

  // ── Medio Oriente ───────────────────────────────────────────────────────────
  { name: "Dubai",                 country: "UAE", lat:  25.20, lon:   55.27, diff: "inicio" },

  { name: "Abu Dhabi",             country: "UAE", lat:  24.47, lon:   54.37, diff: "facil"  },
  { name: "Riad",                  country: "KSA", lat:  24.69, lon:   46.72, diff: "facil"  },
  { name: "Bagdad",                country: "IRQ", lat:  33.34, lon:   44.40, diff: "facil"  },
  { name: "Teherán",               country: "IRN", lat:  35.69, lon:   51.39, diff: "facil"  },
  { name: "Tel Aviv",              country: "ISR", lat:  32.08, lon:   34.78, diff: "facil"  },
  { name: "Beirut",                country: "LIB", lat:  33.89, lon:   35.50, diff: "facil"  },
  { name: "Doha",                  country: "QAT", lat:  25.29, lon:   51.53, diff: "facil"  },
  { name: "Kuwait",                country: "KUW", lat:  29.37, lon:   47.98, diff: "medio"  },

  { name: "Amán",                  country: "JOR", lat:  31.96, lon:   35.95, diff: "medio"  },
  { name: "Muscat",                country: "OMA", lat:  23.61, lon:   58.59, diff: "medio"  },

  { name: "Al-Manama",             country: "BHR", lat:  26.22, lon:   50.59, diff: "dificil"},

  // ── Asia Central y del Sur ──────────────────────────────────────────────────
  { name: "Delhi",                 country: "IND", lat:  28.61, lon:   77.21, diff: "inicio" },
  { name: "Mumbai",                country: "IND", lat:  19.08, lon:   72.88, diff: "inicio" },

  { name: "Karachi",               country: "PAK", lat:  24.86, lon:   67.01, diff: "medio"  },
  { name: "Dhaka",                 country: "BAN", lat:  23.72, lon:   90.41, diff: "medio"  },
  { name: "Kabul",                 country: "AFG", lat:  34.53, lon:   69.17, diff: "facil"  },
  { name: "Islamabad",             country: "PAK", lat:  33.72, lon:   73.04, diff: "facil"  },
  { name: "Katmandú",              country: "NEP", lat:  27.71, lon:   85.31, diff: "facil"  },

  { name: "Kolkata",               country: "IND", lat:  22.57, lon:   88.36, diff: "dificil"},
  { name: "Lahore",                country: "PAK", lat:  31.55, lon:   74.34, diff: "dificil"},
  { name: "Bangalore",             country: "IND", lat:  12.97, lon:   77.59, diff: "dificil"},
  { name: "Chennai",               country: "IND", lat:  13.08, lon:   80.27, diff: "dificil"},
  { name: "Colombo",               country: "SRI", lat:   6.93, lon:   79.85, diff: "medio"  },
  { name: "Almaty",                country: "KAZ", lat:  43.26, lon:   76.95, diff: "medio"  },

  { name: "Tashkent",              country: "UZB", lat:  41.30, lon:   69.27, diff: "dificil"},
  { name: "Herat",                 country: "AFG", lat:  34.34, lon:   62.20, diff: "dificil"},
  { name: "Petropavl",             country: "KAZ", lat:  54.87, lon:   69.16, diff: "dificil"},

  // ── Asia Oriental y Suroriental ─────────────────────────────────────────────
  { name: "Tokio",                 country: "JPN", lat:  35.68, lon:  139.69, diff: "inicio" },
  { name: "Beijing",               country: "CHN", lat:  39.91, lon:  116.39, diff: "inicio" },
  { name: "Shanghái",              country: "CHN", lat:  31.22, lon:  121.47, diff: "inicio" },
  { name: "Hong Kong",             country: "HKG", lat:  22.32, lon:  114.17, diff: "inicio" },
  { name: "Seúl",                  country: "KOR", lat:  37.57, lon:  126.98, diff: "inicio" },
  { name: "Bangkok",               country: "THA", lat:  13.75, lon:  100.52, diff: "inicio" },
  { name: "Singapur",              country: "SIN", lat:   1.35, lon:  103.82, diff: "inicio" },

  { name: "Ho Chi Minh",           country: "VIE", lat:  10.82, lon:  106.63, diff: "dificil"},
  { name: "Guangzhou",             country: "CHN", lat:  23.13, lon:  113.26, diff: "dificil"},
  { name: "Shenzhen",              country: "CHN", lat:  22.54, lon:  114.06, diff: "dificil"},
  { name: "Chongqing",             country: "CHN", lat:  29.56, lon:  106.55, diff: "dificil"},
  { name: "Tbilisi",               country: "GEO", lat:  41.69, lon:   44.83, diff: "dificil"},
  { name: "Riga",                  country: "LVA", lat:  56.95, lon:   24.11, diff: "dificil"},
  { name: "Osaka",                 country: "JPN", lat:  34.69, lon:  135.50, diff: "facil"  },
  { name: "Hiroshima",             country: "JPN", lat:  34.39, lon:  132.45, diff: "facil"  },
  { name: "Nagasaki",              country: "JPN", lat:  32.74, lon:  129.87, diff: "facil"  },
  { name: "Pyongyang",             country: "PRK", lat:  39.03, lon:  125.75, diff: "facil"  },
  { name: "Taipei",                country: "TPE", lat:  25.04, lon:  121.56, diff: "facil"  },
  { name: "Hanói",                 country: "VIE", lat:  21.03, lon:  105.85, diff: "facil"  },
  { name: "Yakarta",               country: "INA", lat:  -6.21, lon:  106.85, diff: "facil"  },
  { name: "Kuala Lumpur",          country: "MAS", lat:   3.14, lon:  101.69, diff: "facil"  },
  { name: "Manila",                country: "PHI", lat:  14.60, lon:  120.98, diff: "facil"  },

  { name: "Rangún",                country: "MYA", lat:  16.80, lon:   96.16, diff: "dificil"},
  { name: "Nom Pen",               country: "CAM", lat:  11.57, lon:  104.92, diff: "dificil"},
  { name: "Ulán Bator",            country: "MGL", lat:  47.91, lon:  106.90, diff: "dificil"},
  { name: "Vientiane",             country: "LAO", lat:  17.97, lon:  102.60, diff: "dificil"},
  { name: "Kota Kinabalu",         country: "MAS", lat:   5.98, lon:  116.07, diff: "dificil"},
  { name: "Ürümqi",                country: "CHN", lat:  43.82, lon:   87.60, diff: "dificil"},

  // ── Oceanía ─────────────────────────────────────────────────────────────────
  { name: "Sídney",                country: "AUS", lat: -33.87, lon:  151.21, diff: "inicio" },

  { name: "Melbourne",             country: "AUS", lat: -37.81, lon:  144.96, diff: "facil"  },
  { name: "Brisbane",              country: "AUS", lat: -27.47, lon:  153.03, diff: "facil"  },
  { name: "Auckland",              country: "NZL", lat: -36.86, lon:  174.77, diff: "facil"  },

  { name: "Perth",                 country: "AUS", lat: -31.95, lon:  115.86, diff: "medio"  },
  { name: "Canberra",              country: "AUS", lat: -35.28, lon:  149.13, diff: "medio"  },
  { name: "Adelaide",              country: "AUS", lat: -34.93, lon:  138.60, diff: "medio"  },
  { name: "Darwin",                country: "AUS", lat: -12.46, lon:  130.84, diff: "dificil"},
  { name: "Alice Springs",         country: "AUS", lat: -23.70, lon:  133.88, diff: "dificil"},
  { name: "Wellington",            country: "NZL", lat: -41.29, lon:  174.78, diff: "medio"  },

  { name: "Christchurch",          country: "NZL", lat: -43.53, lon:  172.64, diff: "medio"  },
  { name: "Suva",                  country: "FIJ", lat:  -18.14, lon:  178.44, diff: "dificil"},
  { name: "Port Moresby",          country: "PNG", lat:  -9.44, lon:  147.18, diff: "dificil"},
];

// Pool ordenada por dificultad para modo práctica (respeta filtro de continentes)
// Desbloqueo y pesos por tramo de respuestas correctas:
//   0–2   → solo inicio (100%)
//   3–9   → inicio 55%, facil 45%
//   10–19 → inicio 25%, facil 45%, medio 30%
//   20+   → inicio 15%, facil 35%, medio 35%, dificil 15%
const CITY_UNLOCK_TIERS = [
  { at:  0, weights: { inicio: 1.00 } },
  { at:  3, weights: { inicio: 0.55, facil: 0.45 } },
  { at: 10, weights: { inicio: 0.25, facil: 0.45, medio: 0.30 } },
  { at: 20, weights: { inicio: 0.15, facil: 0.35, medio: 0.35, dificil: 0.15 } },
];

// continents: Set de strings (o null para sin filtro)
function makeCityQueues(continents) {
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const ok = c => !continents || continents.has(CITY_COUNTRY_CONTINENT[c.country]);
  const fallback = d => {
    // Si el continente no tiene ciudades en este tier, rellenar con el siguiente tier
    let list = CITIES.filter(c => c.diff === d && ok(c));
    if (list.length < 2) list = CITIES.filter(c => c.diff === d); // sin filtro
    return shuffle(list);
  };
  return {
    inicio:  { list: fallback('inicio'),  i: 0 },
    facil:   { list: fallback('facil'),   i: 0 },
    medio:   { list: fallback('medio'),   i: 0 },
    dificil: { list: fallback('dificil'), i: 0 },
    _shuffle: shuffle,
  };
}

function pickCity(queues, correctCount) {
  // Buscar el tramo activo más alto desbloqueado
  let weights = CITY_UNLOCK_TIERS[0].weights;
  for (const tier of CITY_UNLOCK_TIERS) {
    if (correctCount >= tier.at) weights = tier.weights;
  }
  // Selección ponderada
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  let chosen = Object.keys(weights)[0];
  for (const [name, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) { chosen = name; break; }
  }
  const q = queues[chosen];
  if (q.i >= q.list.length) { queues._shuffle(q.list); q.i = 0; }
  return q.list[q.i++];
}
