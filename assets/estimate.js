/* Holiday Knight Lights — shared instant-estimate tool.
   Any element with [data-estimate] opens it. Leaflet loads on first open.
   Free services: Esri satellite tiles, Photon address search, OpenStreetMap outlines (Overpass). */
(function () {
  const RATE = 5;                       // dollars per foot
  const FT_PER_M = 3.28084;
  const HOME = [44.9778, -93.2650];     // default view (Minneapolis area)
  const PHONE = '+16127566991';
  const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
  const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';

  /* ---------- copy helper (shared) ---------- */
  function copyText(text, btn, fallbackEl) {
    const label = btn.textContent;
    const flash = t => { btn.textContent = t; setTimeout(() => (btn.textContent = label), 1600); };
    const fallback = () => {
      if (fallbackEl) { const r = document.createRange(); r.selectNodeContents(fallbackEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      flash('Select & copy');
    };
    try { navigator.clipboard.writeText(text).then(() => flash('Copied'), fallback); } catch (e) { fallback(); }
  }
  window.HKL = { copyText };
  document.querySelectorAll('[data-copy]').forEach(b =>
    b.addEventListener('click', () => copyText(b.dataset.copy, b, document.getElementById(b.dataset.copyTarget || ''))));

  /* ---------- markup ---------- */
  const sheet = document.createElement('div');
  sheet.className = 'q-sheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', 'qTitle');
  sheet.innerHTML = `
    <div class="q-head">
      <button class="q-icon" data-q="close" type="button" aria-label="Back to home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>
      </button>
      <h2 id="qTitle">Instant Estimate</h2>
      <span class="q-rate">$${RATE} / ft</span>
    </div>
    <div class="q-mapwrap">
      <div class="q-map" data-q="map" aria-label="Satellite map of your home"></div>
      <div class="q-search">
        <input id="qAddr" type="search" placeholder="Enter your home address" aria-label="Your home address" autocomplete="street-address" enterkeyhint="search">
        <ul class="q-sugg" data-q="sugg" role="listbox" hidden></ul>
      </div>
      <div class="q-hint" data-q="hint">Search your address to start</div>
    </div>
    <div class="q-panel">
      <div class="q-seg" role="group" aria-label="What to light">
        <button type="button" data-mode="front" aria-pressed="true">Front only</button>
        <button type="button" data-mode="full" aria-pressed="false">Whole house</button>
        <button type="button" data-mode="trace" aria-pressed="false">Trace it</button>
      </div>
      <div class="q-tools" data-q="tools" hidden>
        <button class="q-tool" data-q="undo" type="button">Undo</button>
        <button class="q-tool" data-q="newline" type="button">+ Add a side</button>
        <button class="q-tool" data-q="clear" type="button">Clear</button>
      </div>
      <div class="q-total" aria-live="polite">
        <div class="q-ft"><b data-q="ft">0</b> ft of lights</div>
        <div class="q-price" data-q="price">$0</div>
      </div>
      <p class="q-fine">Estimate based on satellite outlines. Ryan confirms the final price before install.</p>
      <div class="q-ctas">
        <a class="q-btn solid" data-q="send" href="sms:${PHONE}" aria-disabled="true">Text quote to Ryan</a>
        <button class="q-btn line" data-q="copy" type="button">Copy quote</button>
      </div>
    </div>`;
  document.body.appendChild(sheet);
  const $ = k => sheet.querySelector(`[data-q="${k}"]`);
  const addr = sheet.querySelector('#qAddr');
  const sugg = $('sugg'), hint = $('hint'), tools = $('tools'), ftOut = $('ft'), priceOut = $('price'), sendBtn = $('send');
  const segBtns = [...sheet.querySelectorAll('.q-seg button')];

  let L, map, outlineLayer, frontLayer, traceGroup, pinMarker, opener;
  let mode = 'front', auto = { front: 0, full: 0 }, address = '', lines = [[]];

  /* ---------- Leaflet loader ---------- */
  let leafletPromise;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LEAFLET_CSS; document.head.appendChild(css);
    leafletPromise = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = LEAFLET_JS;
      s.onload = () => res(window.L); s.onerror = rej; document.head.appendChild(s);
    });
    return leafletPromise;
  }

  /* ---------- open / close ---------- */
  function open(e) {
    opener = e && e.currentTarget;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    loadLeaflet().then(lib => {
      L = lib;
      if (!map) initMap(); else map.invalidateSize();
    }).catch(() => setHint('The map could not load. Check your connection and try again.', true));
    setTimeout(() => addr.focus({ preventScroll: true }), 250);
  }
  function close() {
    sheet.hidden = true;
    document.body.classList.remove('sheet-open');
    if (opener) opener.focus();
  }
  document.querySelectorAll('[data-estimate]').forEach(b => b.addEventListener('click', open));
  $('close').addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  function setHint(text, warn) { hint.textContent = text; hint.classList.toggle('warn', !!warn); hint.hidden = !text; }

  function initMap() {
    map = L.map($('map'), { zoomControl: false }).setView(HOME, 12);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxNativeZoom: 19, maxZoom: 21,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics · Outlines © OpenStreetMap contributors'
    }).addTo(map);
    traceGroup = L.layerGroup();
    map.on('click', onMapTap);
    setTimeout(() => map.invalidateSize(), 50);
  }

  /* ---------- address search (Photon) ---------- */
  let searchTimer, searchCtl, results = [], activeIdx = -1;
  addr.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = addr.value.trim();
    if (q.length < 4) { sugg.hidden = true; return; }
    searchTimer = setTimeout(() => search(q), 300);
  });
  addr.addEventListener('keydown', e => {
    if (sugg.hidden || !results.length) return;
    if (e.key === 'ArrowDown') { activeIdx = (activeIdx + 1) % results.length; paintSugg(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { activeIdx = (activeIdx - 1 + results.length) % results.length; paintSugg(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(results[Math.max(activeIdx, 0)]); e.preventDefault(); }
  });
  async function search(q) {
    if (searchCtl) searchCtl.abort();
    searchCtl = new AbortController();
    const c = map ? map.getCenter() : { lat: HOME[0], lng: HOME[1] };
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=${c.lat}&lon=${c.lng}`, { signal: searchCtl.signal });
      const data = await res.json();
      results = (data.features || [])
        .filter(f => !f.properties.countrycode || f.properties.countrycode === 'US')
        .map(f => {
          const p = f.properties;
          const line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(' ') || p.name || '';
          const line2 = [p.city || p.town || p.village || p.county, p.state, p.postcode].filter(Boolean).join(', ');
          return { line1, line2, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], hasNumber: !!p.housenumber };
        })
        .sort((a, b) => b.hasNumber - a.hasNumber);
      activeIdx = -1;
      paintSugg();
    } catch (err) {
      if (err.name !== 'AbortError') setHint('Address search is unavailable right now. Try again in a moment.', true);
    }
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function paintSugg() {
    sugg.innerHTML = '';
    if (!results.length) { sugg.innerHTML = '<li style="cursor:default">No matches. Try adding your city.</li>'; sugg.hidden = false; return; }
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      if (i === activeIdx) li.classList.add('active');
      li.innerHTML = `${esc(r.line1)}<small>${esc(r.line2)}</small>`;
      li.addEventListener('click', () => pick(r));
      sugg.appendChild(li);
    });
    sugg.hidden = false;
  }
  function pick(r) {
    if (!r || !map) return;
    address = [r.line1, r.line2].filter(Boolean).join(', ');
    addr.value = address;
    sugg.hidden = true;
    addr.blur();
    map.setView([r.lat, r.lon], 20);
    if (pinMarker) pinMarker.remove();
    pinMarker = L.circleMarker([r.lat, r.lon], { radius: 6, color: '#111', weight: 2, fillColor: '#f2c35b', fillOpacity: 1 }).addTo(map);
    resetTrace();
    findBuilding(r.lat, r.lon);
  }

  /* ---------- building outline (Overpass) ---------- */
  async function findBuilding(lat, lon) {
    clearOutline();
    auto = { front: 0, full: 0 };
    setHint('Finding your roof outline…');
    update();
    const q = `[out:json][timeout:20];way(around:45,${lat},${lon})["building"];out geom;`;
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q)
      });
      const data = await res.json();
      const ways = (data.elements || []).filter(e => e.geometry && e.geometry.length > 3);
      if (!ways.length) return noOutline();
      const pt = [lat, lon];
      let best = ways.find(w => inside(pt, w.geometry));
      if (!best) {
        best = ways.slice().sort((a, b) => distTo(pt, a.geometry) - distTo(pt, b.geometry))[0];
        if (distTo(pt, best.geometry) > 35) return noOutline();
      }
      const ring = best.geometry.map(g => L.latLng(g.lat, g.lon));
      outlineLayer = L.polygon(ring, { color: '#f2c35b', weight: 2, dashArray: '6 6', fillColor: '#f2c35b', fillOpacity: .08 }).addTo(map);
      let per = 0;
      for (let i = 0; i < ring.length - 1; i++) per += map.distance(ring[i], ring[i + 1]);
      const side = longestSide(ring);
      auto = { full: per * FT_PER_M, front: side.len * FT_PER_M };
      frontLayer = L.polyline(side.pts, { color: '#ffd977', weight: 6, opacity: .95 }).addTo(map);
      map.fitBounds(outlineLayer.getBounds(), { padding: [70, 70], maxZoom: 20 });
      setMode(mode === 'trace' ? 'front' : mode);
      setHint('Not quite right? Tap "Trace it" to draw your roofline');
    } catch (err) {
      noOutline('We could not reach the outline service. Tap along your roofline to trace it.');
    }
  }
  function noOutline(msg) { setMode('trace'); setHint(msg || 'No outline found for this home. Tap along your roofline to trace it.', true); }
  function clearOutline() { if (outlineLayer) outlineLayer.remove(); if (frontLayer) frontLayer.remove(); outlineLayer = frontLayer = null; }
  function inside(p, geom) {
    let c = false;
    for (let i = 0, j = geom.length - 1; i < geom.length; j = i++) {
      const xi = geom[i].lon, yi = geom[i].lat, xj = geom[j].lon, yj = geom[j].lat;
      if (((yi > p[0]) !== (yj > p[0])) && (p[1] < (xj - xi) * (p[0] - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  function distTo(p, geom) { const ll = L.latLng(p[0], p[1]); return Math.min(...geom.map(g => map.distance(ll, [g.lat, g.lon]))); }
  function longestSide(ring) {
    const k = Math.cos(ring[0].lat * Math.PI / 180);
    const bearing = (a, b) => Math.atan2(b.lat - a.lat, (b.lng - a.lng) * k) * 180 / Math.PI;
    const segs = [];
    for (let i = 0; i < ring.length - 1; i++) segs.push({ a: ring[i], b: ring[i + 1], br: bearing(ring[i], ring[i + 1]), len: map.distance(ring[i], ring[i + 1]) });
    const total = segs.reduce((t, s) => t + s.len, 0);
    const diff = (x, y) => { let d = Math.abs(x - y) % 360; return d > 180 ? 360 - d : d; };
    let best = { len: 0, pts: [] }, cur = null;
    segs.concat(segs).forEach(s => {
      if (cur && diff(cur.br, s.br) < 18) { cur.len += s.len; cur.pts.push(s.b); }
      else cur = { br: s.br, len: s.len, pts: [s.a, s.b] };
      if (cur.len > best.len && cur.len <= total / 2 + 1) best = { len: cur.len, pts: cur.pts.slice() };
    });
    return best;
  }

  /* ---------- modes ---------- */
  segBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  function setMode(m) {
    mode = m;
    segBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    tools.hidden = m !== 'trace';
    if (frontLayer) frontLayer.setStyle({ opacity: m === 'front' ? .95 : 0 });
    if (outlineLayer) outlineLayer.setStyle({ weight: m === 'full' ? 4 : 2, dashArray: m === 'full' ? null : '6 6' });
    if (map && traceGroup) { m === 'trace' ? traceGroup.addTo(map) : traceGroup.remove(); }
    if (m === 'trace' && address) setHint(tracedFt() ? 'Tap to keep adding points' : 'Tap each corner along the roofline you want lit');
    else if (address && auto.full) setHint('Not quite right? Tap "Trace it" to draw your roofline');
    update();
  }

  /* ---------- tracing ---------- */
  function onMapTap(e) {
    if (mode !== 'trace') return;
    if (!address) { setHint('Search your address first', true); return; }
    lines[lines.length - 1].push(e.latlng);
    drawTrace();
  }
  function drawTrace() {
    if (!traceGroup) return;
    traceGroup.clearLayers();
    lines.forEach(line => {
      if (line.length > 1) {
        L.polyline(line, { color: '#f2c35b', weight: 5 }).addTo(traceGroup);
        for (let i = 0; i < line.length - 1; i++) {
          const ft = map.distance(line[i], line[i + 1]) * FT_PER_M;
          const mid = L.latLng((line[i].lat + line[i + 1].lat) / 2, (line[i].lng + line[i + 1].lng) / 2);
          L.tooltip({ permanent: true, direction: 'center', className: 'q-len' }).setLatLng(mid).setContent(Math.round(ft) + ' ft').addTo(traceGroup);
        }
      }
      line.forEach(p => L.marker(p, { icon: L.divIcon({ className: 'q-vtx', iconSize: [14, 14] }), interactive: false }).addTo(traceGroup));
    });
    if (tracedFt()) setHint('Tap "+ Add a side" to start a separate roofline');
    update();
  }
  function tracedFt() {
    if (!map) return 0;
    let m = 0;
    lines.forEach(line => { for (let i = 0; i < line.length - 1; i++) m += map.distance(line[i], line[i + 1]); });
    return m * FT_PER_M;
  }
  function resetTrace() { lines = [[]]; if (traceGroup) traceGroup.clearLayers(); }
  $('undo').addEventListener('click', () => {
    let line = lines[lines.length - 1];
    if (!line.length && lines.length > 1) { lines.pop(); line = lines[lines.length - 1]; }
    line.pop(); drawTrace();
  });
  $('newline').addEventListener('click', () => { if (lines[lines.length - 1].length) lines.push([]); setHint('Tap the first corner of the next roofline'); });
  $('clear').addEventListener('click', () => { resetTrace(); drawTrace(); });

  /* ---------- totals + quote ---------- */
  const modeLabel = { front: 'front of house', full: 'whole house', trace: 'traced roofline' };
  const currentFt = () => Math.round(mode === 'trace' ? tracedFt() : auto[mode]);
  function quoteText() {
    const ft = currentFt();
    return `Hi Ryan! I'd like a holiday lights quote.\nAddress: ${address || '(not entered)'}\nArea: ${modeLabel[mode]}\nEstimate: ${ft} ft x $${RATE}/ft = $${(ft * RATE).toLocaleString()}`;
  }
  function update() {
    const ft = currentFt();
    ftOut.textContent = ft.toLocaleString();
    priceOut.textContent = '$' + (ft * RATE).toLocaleString();
    sendBtn.setAttribute('aria-disabled', String(!(ft > 0 && address)));
    sendBtn.href = 'sms:' + PHONE + '?&body=' + encodeURIComponent(quoteText());
  }
  $('copy').addEventListener('click', e => copyText(quoteText(), e.currentTarget));
  update();
})();
