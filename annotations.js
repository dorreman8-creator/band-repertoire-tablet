/* Personal handwriting layers. Source files and Dropbox snapshots remain intact. */
(function (root) {
  'use strict';
  const COLORS = ['#e53935', '#2563eb', '#111827', '#15803d', '#ca8a04'];
  const round = value => Math.round(value * 10000) / 10000;
  const clamp = value => Math.max(0, Math.min(1, value));
  function point(event, rect) {
    return [round(clamp((event.clientX - rect.left) / rect.width)), round(clamp((event.clientY - rect.top) / rect.height)), round(clamp(event.pressure > 0 ? event.pressure : 0.5))];
  }
  function distanceToSegment(point, a, b, aspect = 1) {
    const px = point[0], py = point[1] * aspect, ax = a[0], ay = a[1] * aspect;
    const dx = b[0] - ax, dy = b[1] * aspect - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function erase(strokes, from, to, aspect = 1, radius = 0.015) {
    return strokes.filter(stroke => {
      const points = stroke.points;
      // Check both segment endpoints and segment intersections along the eraser path.
      for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)], b = points[i];
        if (distanceToSegment(a, from, to, aspect) <= radius + stroke.width / 2 ||
            distanceToSegment(b, from, to, aspect) <= radius + stroke.width / 2 ||
            distanceToSegment(from, a, b, aspect) <= radius + stroke.width / 2 ||
            distanceToSegment(to, a, b, aspect) <= radius + stroke.width / 2) return false;
        const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
        if (cross(a, b, from) * cross(a, b, to) < 0 && cross(from, to, a) * cross(from, to, b) < 0) return false;
      }
      return true;
    });
  }
  function textPages(text, columns = 40, rows = 25) {
    const lines = [];
    for (const raw of String(text).normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
      let rest = Array.from(raw);
      while (rest.length > columns) {
        let split = rest.slice(0, columns + 1).lastIndexOf(' ');
        if (split <= 0) split = columns;
        lines.push(rest.slice(0, split).join(''));
        rest = rest.slice(split + (rest[split] === ' ' ? 1 : 0));
      }
      lines.push(rest.join(''));
    }
    const pages = [];
    for (let i = 0; i < lines.length; i += rows) pages.push(lines.slice(i, i + rows));
    return pages;
  }
  function validateLayer(layer) {
    if (!layer || layer.version !== 1 || typeof layer.key !== 'string' || layer.key.length > 400 ||
        !/^(pdf|image|text|txt):/.test(layer.key) || !Array.isArray(layer.strokes) || layer.strokes.length > 5000 ||
        !Number.isFinite(Date.parse(layer.updatedAt))) throw Error('Ongeldige aantekeningenlaag.');
    let count = 0;
    for (const stroke of layer.strokes) {
      if (!['pen', 'marker'].includes(stroke.tool) || !COLORS.includes(stroke.color) || !Number.isFinite(stroke.width) ||
          stroke.width < 0.0001 || stroke.width > 0.1 || !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > 30000) throw Error('Ongeldige penstreek.');
      count += stroke.points.length;
      if (count > 500000) throw Error('Deze aantekeningenlaag is te groot.');
      for (const p of stroke.points) if (!Array.isArray(p) || p.length !== 3 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw Error('Ongeldige penpositie.');
    }
    return layer;
  }
  const model = { point, erase, textPages, validateLayer };
  if (typeof module !== 'undefined' && module.exports) { module.exports = model; return; }

  const $ = id => document.getElementById(id);
  let dbPromise, mode = false, tool = 'pen', active = null, session = 0, penDown = false, lastPen = 0;
  let saveChain = Promise.resolve(), saveFailed = false, pendingWrites = 0;
  const sheets = new Set(), records = new Map(), dirtyRecords = new Map();
  const status = (text, error = false) => { $('inkStatus').textContent = text; $('inkStatus').classList.toggle('status-warn', error); };
  function database() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('BandRepertoireInk', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('layers', { keyPath: 'key' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }
  async function read(key) {
    if (records.has(key)) return records.get(key);
    const db = await database();
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('layers').objectStore('layers').get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }) || { version: 1, key, updatedAt: new Date().toISOString(), strokes: [] };
    validateLayer(record); records.set(key, record); return record;
  }
  function save(record) {
    record.updatedAt = new Date().toISOString();
    records.set(record.key, record);
    // Snapshot before queuing: later drawing may replace this layer's stroke array.
    const snapshot = { ...record, strokes: record.strokes };
    dirtyRecords.set(record.key, snapshot);
    pendingWrites++; status('Aantekeningen opslaan…');
    const job = saveChain.then(async () => {
      const db = await database();
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('layers', 'readwrite');
        transaction.objectStore('layers').put(snapshot);
        transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || Error('Opslaan afgebroken.'));
      });
      if (dirtyRecords.get(record.key) === snapshot) dirtyRecords.delete(record.key);
      saveFailed = dirtyRecords.size > 0;
    });
    saveChain = job.catch(() => { saveFailed = true; status('Opslaan mislukt. Exporteer je back-up voordat je afsluit.', true); }).finally(() => {
      pendingWrites--;
      if (!pendingWrites && !saveFailed) status('Aantekeningen op dit apparaat opgeslagen');
    });
    return saveChain;
  }
  async function hash(value) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : await value.arrayBuffer();
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function updateButtons() {
    $('inkToggle').setAttribute('aria-pressed', String(mode));
    $('inkToggle').textContent = mode ? '✓ Aantekenen' : '✎ Aantekenen';
    $('inkTools').hidden = !mode;
    $('inkUndo').disabled = !active?.undo.length;
    $('inkRedo').disabled = !active?.redo.length;
    $('inkClear').disabled = !active?.record?.strokes.length;
    for (const sheet of sheets) sheet.overlay.style.pointerEvents = mode && sheet.ready ? 'auto' : 'none';
    $('inkHint').textContent = tool === 'eraser' ? 'Gum: raak een penstreek aan om die te verwijderen.' : 'Schrijf met de Pencil. Met je vinger kun je schuiven. Kies de pagina voor ongedaan maken.';
    updateViewerHeight();
  }
  function select(sheet) {
    active?.wrapper.classList.remove('ink-active'); active = sheet;
    sheet.wrapper.classList.add('ink-active'); updateButtons();
  }
  function drawStroke(ctx, stroke, width, height) {
    ctx.save(); ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const points = stroke.points;
    if (stroke.tool === 'marker') {
      ctx.globalAlpha = 0.28; ctx.lineWidth = stroke.width * width * 4;
      ctx.beginPath(); ctx.moveTo(points[0][0] * width, points[0][1] * height);
      for (const p of points.slice(1)) ctx.lineTo(p[0] * width, p[1] * height);
      if (points.length === 1) ctx.lineTo(points[0][0] * width + 0.1, points[0][1] * height);
      ctx.stroke();
    } else if (points.length === 1) {
      ctx.beginPath(); ctx.arc(points[0][0] * width, points[0][1] * height, stroke.width * width * (0.35 + points[0][2] * 0.65) / 2, 0, Math.PI * 2); ctx.fill();
    } else {
      for (let i = 1; i < points.length; i++) {
        ctx.lineWidth = stroke.width * width * (0.35 + (points[i - 1][2] + points[i][2]) * 0.325);
        ctx.beginPath(); ctx.moveTo(points[i - 1][0] * width, points[i - 1][1] * height); ctx.lineTo(points[i][0] * width, points[i][1] * height); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function paint(sheet) {
    const rect = sheet.wrapper.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio);
    if (sheet.overlay.width !== width || sheet.overlay.height !== height) { sheet.overlay.width = width; sheet.overlay.height = height; }
    const ctx = sheet.overlay.getContext('2d'); ctx.clearRect(0, 0, width, height);
    for (const stroke of sheet.record?.strokes || []) drawStroke(ctx, stroke, width, height);
    if (sheet.stroke) drawStroke(ctx, sheet.stroke, width, height);
  }
  function remember(sheet, strokes) { sheet.undo.push(strokes); if (sheet.undo.length > 30) sheet.undo.shift(); sheet.redo.length = 0; }
  function finishSheet(sheet) {
    if (sheet.pointer === undefined) return;
    if (sheet.pointerType === 'pen') { penDown = false; lastPen = performance.now(); }
    if (sheet.stroke) {
      remember(sheet, sheet.before);
      sheet.record.strokes = [...sheet.before, sheet.stroke]; sheet.stroke = null; save(sheet.record);
    } else if (sheet.changed) { remember(sheet, sheet.before); save(sheet.record); }
    sheet.pointer = undefined; sheet.changed = false; paint(sheet); updateButtons();
  }
  async function attach(base, key, title, expected = session) {
    if (expected !== session) return;
    const wrapper = document.createElement('div'); wrapper.className = 'ink-sheet';
    base.replaceWith(wrapper); wrapper.appendChild(base);
    const overlay = document.createElement('canvas'); overlay.className = 'ink-overlay'; overlay.setAttribute('aria-label', 'Schrijflaag voor ' + title);
    wrapper.appendChild(overlay);
    const sheet = { base, wrapper, overlay, undo: [], redo: [], ready: false, record: null, stroke: null };
    sheets.add(sheet);
    base.addEventListener('pointerdown', () => { if (sheet.ready) select(sheet); });
    try { sheet.record = await read(key); }
    catch { status('Aantekeningen konden niet worden geladen. Open het bestand opnieuw voordat je schrijft.', true); return; }
    if (expected !== session || !wrapper.isConnected) return;
    sheet.ready = true;
    if (window.ResizeObserver) { sheet.observer = new ResizeObserver(() => paint(sheet)); sheet.observer.observe(wrapper); }
    else window.addEventListener('resize', sheet.resize = () => paint(sheet));
    overlay.addEventListener('contextmenu', event => event.preventDefault());
    overlay.addEventListener('pointerdown', event => {
      if (!mode || !sheet.ready || sheet.pointer !== undefined || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (event.pointerType === 'touch' && (!$('inkFinger').checked || penDown || performance.now() - lastPen < 450)) {
        if (!penDown && performance.now() - lastPen >= 450 && event.width < 40 && event.height < 40) {
          sheet.pan = { id: event.pointerId, y: event.clientY, pane: wrapper.closest('#documentPane, #lyricsPane') };
          overlay.setPointerCapture(event.pointerId);
        }
        return;
      }
      event.preventDefault(); select(sheet); sheet.pointer = event.pointerId; sheet.pointerType = event.pointerType;
      if (sheet.record.strokes.length >= 5000 && tool !== 'eraser' && !(event.buttons & 32)) {
        sheet.pointer = undefined; status('Deze pagina bevat te veel penstreken. Gebruik een andere pagina of wis eerst streken.', true); return;
      }
      if (event.pointerType === 'pen') penDown = true;
      overlay.setPointerCapture(event.pointerId);
      sheet.before = sheet.record.strokes; sheet.changed = false;
      const p = point(event, wrapper.getBoundingClientRect()); sheet.last = p;
      if (tool === 'eraser' || (event.buttons & 32)) {
        sheet.erasing = true; sheet.record.strokes = erase(sheet.record.strokes, p, p, wrapper.clientHeight / wrapper.clientWidth);
        sheet.changed = sheet.record.strokes.length !== sheet.before.length;
      } else {
        sheet.erasing = false; sheet.stroke = { tool, color: $('inkColor').value, width: Number($('inkWidth').value) / 900, points: [p] };
      }
      paint(sheet);
    });
    overlay.addEventListener('pointermove', event => {
      if (sheet.pan?.id === event.pointerId) {
        if (!penDown) sheet.pan.pane.scrollTop += sheet.pan.y - event.clientY;
        sheet.pan.y = event.clientY; return;
      }
      if (sheet.pointer !== event.pointerId) return;
      event.preventDefault();
      const rect = wrapper.getBoundingClientRect();
      const events = event.getCoalescedEvents?.() || [];
      for (const sample of events.length ? events : [event]) {
        const p = point(sample, rect);
        if (sheet.erasing) {
          const previous = sheet.record.strokes;
          sheet.record.strokes = erase(previous, sheet.last, p, rect.height / rect.width);
          sheet.changed = sheet.changed || previous.length !== sheet.record.strokes.length;
        } else if (sheet.stroke.points.length < 30000) {
          const last = sheet.stroke.points.at(-1);
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.0002) sheet.stroke.points.push(p);
        }
        sheet.last = p;
      }
      if (!sheet.frame) sheet.frame = requestAnimationFrame(() => { sheet.frame = null; paint(sheet); });
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) overlay.addEventListener(name, event => {
      if (sheet.pan?.id === event.pointerId) sheet.pan = null;
      if (sheet.pointer === event.pointerId) finishSheet(sheet);
    });
    paint(sheet); if (!active) select(sheet); else updateButtons();
    if (!pendingWrites && !saveFailed) status('Aantekeningen worden op dit apparaat bewaard');
    return wrapper;
  }
  async function renderText(text, pane, source, expected = session) {
    const pages = textPages(text);
    const fingerprint = await hash('text-layout-v1:' + text);
    if (expected !== session) return;
    pane.textContent = '';
    const container = document.createElement('div'); container.className = 'ink-pages'; pane.appendChild(container);
    for (const [index, lines] of pages.entries()) {
      if (expected !== session) return;
      const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1273; canvas.dataset.textPage = index + 1;
      canvas.className = 'ink-paper'; canvas.setAttribute('aria-label', lines.join('\n')); const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 900, 1273); ctx.fillStyle = '#111827'; ctx.font = '32px monospace';
      lines.forEach((line, row) => Array.from(line).forEach((character, column) => ctx.fillText(character, 48 + column * 20, 66 + row * 46)));
      ctx.fillStyle = '#64748b'; ctx.font = '18px sans-serif'; ctx.fillText('Tekst · ' + (index + 1) + ' / ' + pages.length, 48, 1243);
      container.appendChild(canvas);
      await attach(canvas, source + ':' + fingerprint + ':' + (index + 1), 'tekstpagina ' + (index + 1), expected);
    }
  }
  async function finish() {
    for (const sheet of sheets) finishSheet(sheet);
    await saveChain;
    if (saveFailed && dirtyRecords.size) {
      for (const key of [...dirtyRecords.keys()]) save(records.get(key));
      await saveChain;
    }
  }
  function begin() {
    session++;
    for (const sheet of sheets) { sheet.observer?.disconnect(); if (sheet.resize) window.removeEventListener('resize', sheet.resize); if (sheet.frame) cancelAnimationFrame(sheet.frame); }
    sheets.clear(); active = null; penDown = false; updateButtons(); return session;
  }
  async function exportLayers() {
    await finish(); const db = await database();
    const stored = await new Promise((resolve, reject) => { const request = db.transaction('layers').objectStore('layers').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const combined = new Map(stored.map(record => [record.key, record])); for (const [key, record] of records) combined.set(key, record);
    return [...combined.values()];
  }
  async function importLayers(layers) {
    if (!Array.isArray(layers) || layers.length > 3000) throw Error('Ongeldige aantekeningenback-up.');
    layers.forEach(validateLayer); await finish(); const db = await database();
    const existing = new Map((await exportLayers()).map(record => [record.key, record]));
    const imported = layers.filter(layer => !existing.has(layer.key) || Date.parse(layer.updatedAt) > Date.parse(existing.get(layer.key).updatedAt));
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('layers', 'readwrite'); const store = transaction.objectStore('layers');
      imported.forEach(layer => store.put(layer)); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || Error('Importeren afgebroken.'));
    });
    imported.forEach(layer => records.set(layer.key, layer));
  }
  $('inkToggle').onclick = async () => { await finish(); mode = !mode; updateButtons(); if (mode) navigator.storage?.persist?.().catch(() => {}); };
  $('inkTool').onchange = async event => { await finish(); tool = event.target.value; updateButtons(); };
  $('inkUndo').onclick = () => { if (!active?.undo.length) return; finishSheet(active); active.redo.push(active.record.strokes); active.record.strokes = active.undo.pop(); save(active.record); paint(active); updateButtons(); };
  $('inkRedo').onclick = () => { if (!active?.redo.length) return; active.undo.push(active.record.strokes); active.record.strokes = active.redo.pop(); save(active.record); paint(active); updateButtons(); };
  $('inkClear').onclick = () => { if (!active?.record.strokes.length || !confirm('Alle aantekeningen op deze pagina wissen? Je kunt dit met Ongedaan maken terugdraaien.')) return; remember(active, active.record.strokes); active.record.strokes = []; save(active.record); paint(active); updateButtons(); };
  window.addEventListener('pagehide', () => { finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  root.BandInk = { ...model, hash, attach, renderText, begin, finish, exportLayers, importLayers, current: expected => expected === session };
})(typeof window === 'undefined' ? globalThis : window);
