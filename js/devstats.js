// ── DEV STATS OVERLAY ─────────────────────────────────────────────────────────
// Este archivo está en .gitignore y NUNCA sube al repo.
// ──────────────────────────────────────────────────────────────────────────────

(async function () {
  // ── Estilos ──────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #devstats-bar {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: 180px; /* se sobreescribe por JS */
      z-index: 99999;
      background: rgba(0,0,0,0.88);
      color: #fffbe6;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      border-right: 1.5px solid #ffe066;
      user-select: none;
      display: flex;
      flex-direction: column;
      gap: 0;
      overflow-y: auto;
      overflow-x: hidden;
    }
    #devstats-row1 {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 10px 8px;
    }
    #devstats-row2 {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 8px 10px 10px;
      border-top: 1px solid #333;
      font-size: 10.5px;
    }
    #devstats-bar .ds-block {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    #devstats-bar .ds-val  { color: #ffe066; font-weight: bold; font-size: 15px; line-height: 1.2; }
    #devstats-bar .ds-lbl  { color: #888; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
    #devstats-bar .ds-tag  { background: #1a3a1a; color: #6fdf6f; border-radius: 3px; padding: 2px 7px; font-size: 10px; text-align: center; letter-spacing: 0.08em; }
    #devstats-bar .ds-dot  { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #6fdf6f; margin-right: 4px; animation: ds-pulse 1.4s ease-in-out infinite; }
    #devstats-bar .ds-sep  { border: none; border-top: 1px solid #2a2a2a; margin: 2px 0; }
    #devstats-bar .ds-country-row { display: flex; align-items: center; justify-content: space-between; gap: 4px; background: #111; border-radius: 3px; padding: 2px 6px; }
    #devstats-bar .ds-country-row strong { color: #ffe066; }
    #devstats-bar .ds-refresh { cursor: pointer; color: #ffe066; border: 1px solid #ffe066; border-radius: 3px; padding: 3px 0; background: transparent; font-size: 11px; width: 100%; margin-top: 4px; }
    #devstats-bar .ds-refresh:hover { background: #ffe06622; }
    @keyframes ds-pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
    #devstats-toggle {
      position: fixed;
      top: 50%;
      left: 0;
      transform: translateY(-50%);
      z-index: 100000;
      background: rgba(0,0,0,0.88);
      border: 1.5px solid #ffe066;
      border-left: none;
      border-radius: 0 6px 6px 0;
      color: #ffe066;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      cursor: pointer;
      padding: 8px 5px;
      writing-mode: vertical-rl;
      text-orientation: mixed;
      letter-spacing: 0.05em;
      transition: background 0.15s;
      line-height: 1;
    }
    #devstats-toggle:hover { background: #ffe06622; }
  `;
  document.head.appendChild(style);

  // ── HTML del banner ───────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'devstats-bar';
  bar.innerHTML = `
    <div id="devstats-row1">
      <span class="ds-tag">DEV STATS</span>
      <hr class="ds-sep">
      <div class="ds-block">
        <span class="ds-lbl"><span class="ds-dot"></span>En línea ahora</span>
        <span class="ds-val" id="ds-online">…</span>
      </div>
      <hr class="ds-sep">
      <div class="ds-block">
        <span class="ds-lbl">Usuarios registrados</span>
        <span class="ds-val" id="ds-users">…</span>
      </div>
      <div class="ds-block">
        <span class="ds-lbl">Nuevos hoy</span>
        <span class="ds-val" id="ds-today">…</span>
      </div>
      <hr class="ds-sep">
      <div class="ds-block">
        <span class="ds-lbl">Visitas únicas total</span>
        <span class="ds-val" id="ds-visits">…</span>
      </div>
      <div class="ds-block">
        <span class="ds-lbl">Visitas únicas hoy</span>
        <span class="ds-val" id="ds-today-v">…</span>
      </div>
      <hr class="ds-sep">
      <div class="ds-block">
        <span class="ds-lbl">Versus terminados</span>
        <span class="ds-val" id="ds-versus">…</span>
      </div>
      <div class="ds-block">
        <span class="ds-lbl">Versus hoy</span>
        <span class="ds-val" id="ds-versus-today">…</span>
      </div>
      <button class="ds-refresh" id="ds-refresh-btn">↺ Refrescar</button>
    </div>
    <div id="devstats-row2">
      <span class="ds-lbl">Visitas por país</span>
      <div id="ds-countries">…</div>
    </div>
  `;
  document.body.prepend(bar);

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'devstats-toggle';
  toggleBtn.textContent = '📊 DEV';
  document.body.appendChild(toggleBtn);

  // ── Visitor ID anónimo por dispositivo ────────────────────────────────────────
  let visitorId = localStorage.getItem('_devstats_vid');
  if (!visitorId) {
    visitorId = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    localStorage.setItem('_devstats_vid', visitorId);
  }

  // ── Detectar país via IP (solo si no lo tenemos guardado) ────────────────────
  async function getCountry() {
    const cached = localStorage.getItem('_devstats_country');
    if (cached) return JSON.parse(cached);
    try {
      const r = await fetch('https://ipinfo.io/json');
      const d = await r.json();
      if (d && d.country) {
        const result = { name: COUNTRY_NAMES[d.country] || d.country, code: d.country };
        localStorage.setItem('_devstats_country', JSON.stringify(result));
        return result;
      }
    } catch (e) {}
    return null;
  }

  const COUNTRY_NAMES = {
    AF:'Afghanistan',AX:'Åland Islands',AL:'Albania',DZ:'Algeria',AD:'Andorra',AO:'Angola',AG:'Antigua and Barbuda',AR:'Argentina',AM:'Armenia',AU:'Australia',AT:'Austria',AZ:'Azerbaijan',BS:'Bahamas',BH:'Bahrain',BD:'Bangladesh',BB:'Barbados',BY:'Belarus',BE:'Belgium',BZ:'Belize',BJ:'Benin',BT:'Bhutan',BO:'Bolivia',BA:'Bosnia and Herzegovina',BW:'Botswana',BR:'Brazil',BN:'Brunei',BG:'Bulgaria',BF:'Burkina Faso',BI:'Burundi',CV:'Cape Verde',KH:'Cambodia',CM:'Cameroon',CA:'Canada',CF:'Central African Republic',TD:'Chad',CL:'Chile',CN:'China',CO:'Colombia',KM:'Comoros',CG:'Congo',CR:'Costa Rica',HR:'Croatia',CU:'Cuba',CY:'Cyprus',CZ:'Czech Republic',DK:'Denmark',DJ:'Djibouti',DM:'Dominica',DO:'Dominican Republic',EC:'Ecuador',EG:'Egypt',SV:'El Salvador',GQ:'Equatorial Guinea',ER:'Eritrea',EE:'Estonia',SZ:'Eswatini',ET:'Ethiopia',FJ:'Fiji',FI:'Finland',FR:'France',GA:'Gabon',GM:'Gambia',GE:'Georgia',DE:'Germany',GH:'Ghana',GR:'Greece',GD:'Grenada',GT:'Guatemala',GN:'Guinea',GW:'Guinea-Bissau',GY:'Guyana',HT:'Haiti',HN:'Honduras',HU:'Hungary',IS:'Iceland',IN:'India',ID:'Indonesia',IR:'Iran',IQ:'Iraq',IE:'Ireland',IL:'Israel',IT:'Italy',JM:'Jamaica',JP:'Japan',JO:'Jordan',KZ:'Kazakhstan',KE:'Kenya',KI:'Kiribati',KW:'Kuwait',KG:'Kyrgyzstan',LA:'Laos',LV:'Latvia',LB:'Lebanon',LS:'Lesotho',LR:'Liberia',LY:'Libya',LI:'Liechtenstein',LT:'Lithuania',LU:'Luxembourg',MG:'Madagascar',MW:'Malawi',MY:'Malaysia',MV:'Maldives',ML:'Mali',MT:'Malta',MH:'Marshall Islands',MR:'Mauritania',MU:'Mauritius',MX:'Mexico',FM:'Micronesia',MD:'Moldova',MC:'Monaco',MN:'Mongolia',ME:'Montenegro',MA:'Morocco',MZ:'Mozambique',MM:'Myanmar',NA:'Namibia',NR:'Nauru',NP:'Nepal',NL:'Netherlands',NZ:'New Zealand',NI:'Nicaragua',NE:'Niger',NG:'Nigeria',MK:'North Macedonia',NO:'Norway',OM:'Oman',PK:'Pakistan',PW:'Palau',PA:'Panama',PG:'Papua New Guinea',PY:'Paraguay',PE:'Peru',PH:'Philippines',PL:'Poland',PT:'Portugal',QA:'Qatar',RO:'Romania',RU:'Russia',RW:'Rwanda',KN:'Saint Kitts and Nevis',LC:'Saint Lucia',VC:'Saint Vincent and the Grenadines',WS:'Samoa',SM:'San Marino',ST:'Sao Tome and Principe',SA:'Saudi Arabia',SN:'Senegal',RS:'Serbia',SC:'Seychelles',SL:'Sierra Leone',SG:'Singapore',SK:'Slovakia',SI:'Slovenia',SB:'Solomon Islands',SO:'Somalia',ZA:'South Africa',SS:'South Sudan',ES:'Spain',LK:'Sri Lanka',SD:'Sudan',SR:'Suriname',SE:'Sweden',CH:'Switzerland',SY:'Syria',TW:'Taiwan',TJ:'Tajikistan',TZ:'Tanzania',TH:'Thailand',TL:'Timor-Leste',TG:'Togo',TO:'Tonga',TT:'Trinidad and Tobago',TN:'Tunisia',TR:'Turkey',TM:'Turkmenistan',TV:'Tuvalu',UG:'Uganda',UA:'Ukraine',AE:'United Arab Emirates',GB:'United Kingdom',US:'United States',UY:'Uruguay',UZ:'Uzbekistan',VU:'Vanuatu',VE:'Venezuela',VN:'Vietnam',YE:'Yemen',ZM:'Zambia',ZW:'Zimbabwe'
  };

  function countryFlag(code) {
    if (!code || code.length !== 2) return '';
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
  }

  // ── Cargar y renderizar stats ─────────────────────────────────────────────────
  async function loadStats() {
    const sb = window.sb;
    if (!sb) { document.getElementById('ds-users').textContent = '(sb no listo)'; return; }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();
    const activeISO = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // últimos 5 min

    // Usuarios en línea ahora (last_active en los últimos 5 min)
    try {
      const { count } = await sb.from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('last_active', activeISO);
      document.getElementById('ds-online').textContent = count ?? '?';
    } catch { document.getElementById('ds-online').textContent = '?'; }

    // Total usuarios registrados
    try {
      const { count } = await sb.from('profiles')
        .select('*', { count: 'exact', head: true });
      document.getElementById('ds-users').textContent = count ?? '?';
    } catch { document.getElementById('ds-users').textContent = 'err'; }

    // Nuevos hoy
    try {
      const { count } = await sb.from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayISO);
      document.getElementById('ds-today').textContent = count ?? '?';
    } catch { document.getElementById('ds-today').textContent = '?'; }

    // Partidas versus terminadas
    try {
      const { count: total } = await sb.from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'finished');
      document.getElementById('ds-versus').textContent = total ?? '?';
    } catch { document.getElementById('ds-versus').textContent = '(tabla?)'; }

    try {
      const { count: todayV } = await sb.from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'finished')
        .gte('created_at', todayISO);
      document.getElementById('ds-versus-today').textContent = todayV ?? '?';
    } catch { document.getElementById('ds-versus-today').textContent = '?'; }

    // Visitas únicas (tabla site_visits)
    try {
      const country = await getCountry();
      await sb.from('site_visits').upsert(
        {
          visitor_id: visitorId,
          last_seen:  new Date().toISOString(),
          country:      country?.name || null,
          country_flag: country ? countryFlag(country.code) : null,
        },
        { onConflict: 'visitor_id' }
      );

      const { count: total } = await sb.from('site_visits')
        .select('*', { count: 'exact', head: true });
      document.getElementById('ds-visits').textContent = total ?? '?';

      const { count: todayVisits } = await sb.from('site_visits')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen', todayISO);
      document.getElementById('ds-today-v').textContent = todayVisits ?? '?';

      // Top países
      const { data: rows } = await sb.from('site_visits')
        .select('country, country_flag')
        .not('country', 'is', null);
      if (rows && rows.length) {
        const counts = {};
        rows.forEach(r => {
          const key = r.country_flag + ' ' + r.country;
          counts[key] = (counts[key] || 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        document.getElementById('ds-countries').innerHTML = sorted
          .map(([label, n]) => `<div class="ds-country-row"><span>${label}</span><strong>${n}</strong></div>`)
          .join('');
      } else {
        document.getElementById('ds-countries').textContent = 'sin datos aún';
      }
    } catch (e) {
      document.getElementById('ds-visits').textContent = '(crear tabla)';
      document.getElementById('ds-today-v').textContent = '—';
      document.getElementById('ds-countries').textContent = '—';
    }
  }

  // ── Toggle show/hide ─────────────────────────────────────────────────────────
  let _visible = localStorage.getItem('_devstats_open') !== '0';

  function applyVisibility() {
    bar.style.display = _visible ? 'flex' : 'none';
    toggleBtn.textContent = _visible ? '✕ DEV' : '📊 DEV';
    // Mover el botón toggle al borde derecho del panel o al borde de la pantalla
    const stage = document.getElementById('app-stage-outer');
    const stageLeft = stage ? Math.floor(stage.getBoundingClientRect().left) : 0;
    const panelWidth = _visible ? (parseInt(bar.style.width) || 0) : 0;
    toggleBtn.style.left = Math.max(panelWidth, 0) + 'px';
  }

  // ── Ajustar ancho al letterbox izquierdo del juego ──────────────────────────
  function fitToLetterbox() {
    const stage = document.getElementById('app-stage-outer');
    if (!stage) return;
    const left = stage.getBoundingClientRect().left;
    const available = Math.floor(left) - 2;
    if (available < 60) {
      bar.style.width = '0px';
    } else {
      bar.style.width = available + 'px';
    }
    applyVisibility();
  }

  toggleBtn.addEventListener('click', () => {
    _visible = !_visible;
    localStorage.setItem('_devstats_open', _visible ? '1' : '0');
    applyVisibility();
  });

  // ── Guard: solo para BlueLite ─────────────────────────────────────────────
  async function isBlueLite() {
    const sb = window.sb;
    if (!sb) return false;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    const { data } = await sb.from('profiles').select('username').eq('id', user.id).single();
    return data?.username === 'BlueLite';
  }

  // Esperar a que sb esté disponible y verificar usuario
  async function waitForSbAndCheck() {
    for (let i = 0; i < 20; i++) {
      if (window.sb) break;
      await new Promise(r => setTimeout(r, 300));
    }
    if (!await isBlueLite()) {
      bar.remove();
      toggleBtn.remove();
      return;
    }
    fitToLetterbox();
    setTimeout(fitToLetterbox, 500);
    window.addEventListener('resize', fitToLetterbox);
    await loadStats();
    document.getElementById('ds-refresh-btn')?.addEventListener('click', loadStats);
    setInterval(loadStats, 60000);
  }

  waitForSbAndCheck();
})();
