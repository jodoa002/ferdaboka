'use strict';
/* Ferdaboka – grensesnitt */

const CATEGORIES = ['Fottur', 'Fjelltur', 'Skitur', 'Sykkeltur', 'Løpetur', 'Padletur', 'Annet'];
const INKS = ['#8b1e1e', '#2b1d10', '#2f5d2a', '#1f3f6e', '#b8860b', '#5b2a6e'];
const $ = (id) => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';

const state = {
  data: { maps: [], trips: [] },
  map: null,              // aktivt kart
  selectedId: null,       // valgt tur
  tool: 'pan',
  color: INKS[0],
  width: 4,
  view: { x: 0, y: 0, s: 1 },
  undo: [], redo: [],
  filterCat: 'alle',
  sort: 'date-desc',
  calib: null,
};

// ---------------- hjelpere ----------------
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const today = () => new Date().toISOString().slice(0, 10);
const mediaUrl = (rel) => 'ferd://' + rel;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtKm = (km) => km == null ? '–' : (km < 10 ? km.toFixed(2) : km.toFixed(1)).replace('.', ',') + ' km';
const clone = (o) => JSON.parse(JSON.stringify(o));

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => window.ferd.save(state.data), 350);
}
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); window.ferd.save(state.data); });

function toast(msg, ms = 2400) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function hint(msg) {
  const h = $('hint');
  if (msg) { h.textContent = msg; h.classList.add('show'); } else h.classList.remove('show');
}

function tripLengthPx(trip) {
  let L = 0;
  for (const s of trip.strokes) for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return L;
}
function tripKm(trip, map = mapOf(trip)) { return map && map.kmPerPx ? tripLengthPx(trip) * map.kmPerPx : null; }
const mapOf = (trip) => state.data.maps.find(m => m.id === trip.mapId);
const tripsOf = (mapId) => state.data.trips.filter(t => t.mapId === mapId);
const selected = () => state.data.trips.find(t => t.id === state.selectedId) || null;

// ---------------- dialoger ----------------
function modal({ title, body, actions }) {
  return new Promise((resolve) => {
    $('modalTitle').textContent = title;
    const b = $('modalBody'); b.innerHTML = '';
    if (typeof body === 'string') b.innerHTML = body; else if (body) b.append(body);
    const a = $('modalActions'); a.innerHTML = '';
    const close = (v) => { $('modal').classList.add('hidden'); document.removeEventListener('keydown', onKey); resolve(v); };
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (act.cls || ''); btn.textContent = act.label;
      btn.onclick = async () => { if (act.validate && !(await act.validate())) return; close(act.value); };
      a.append(btn);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { const p = actions.find(x => x.primary); if (p) a.children[actions.indexOf(p)].click(); }
    };
    document.addEventListener('keydown', onKey);
    $('modal').classList.remove('hidden');
    setTimeout(() => b.querySelector('input')?.focus(), 30);
  });
}
const confirmBox = (title, text, okLabel = 'Slett') => modal({
  title, body: `<p>${esc(text)}</p>`,
  actions: [{ label: 'Avbryt', value: false }, { label: okLabel, value: true, cls: 'danger', primary: true }],
});

// ================================================================
//  STARTMENY
// ================================================================
const ICON_EDIT = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/></svg>';
const ICON_DEL = '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>';

function renderStart() {
  const grid = $('mapGrid'); grid.innerHTML = '';
  let allKm = 0, allTrips = 0;
  for (const m of state.data.maps) {
    const trips = tripsOf(m.id);
    const km = trips.reduce((a, t) => a + (tripKm(t, m) || 0), 0);
    allKm += km; allTrips += trips.length;
    const card = document.createElement('div');
    card.className = 'map-card';
    card.innerHTML = `
      <div class="thumb"><img src="${mediaUrl(m.image)}" alt="" loading="lazy"></div>
      <h4>${esc(m.name)}</h4>
      <div class="sub">${esc(m.subtitle || (m.builtin ? '' : 'Eget kart'))}</div>
      <div class="stats"><span>${trips.length} ${trips.length === 1 ? 'tur' : 'turer'}</span><span>${m.kmPerPx ? fmtKm(km) : 'uten målestokk'}</span></div>
      <div class="card-menu">
        <button data-act="rename" title="Gi nytt navn">${ICON_EDIT}</button>
        ${m.builtin ? '' : `<button data-act="delete" title="Slett kart">${ICON_DEL}</button>`}
      </div>`;
    card.onclick = (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'rename') return renameMap(m);
      if (act === 'delete') return deleteMap(m);
      openMap(m.id);
    };
    grid.append(card);
  }
  const add = document.createElement('div');
  add.className = 'map-card add';
  add.innerHTML = `<div class="plus">+</div><h4>Legg til nytt kart</h4><div class="sub">Last opp et kartbilde du har</div>`;
  add.onclick = addMapDialog;
  grid.append(add);
  $('totalStats').textContent = allTrips ? `${allTrips} ${allTrips === 1 ? 'tur' : 'turer'} nedtegnet – til sammen ${fmtKm(allKm)}` : 'Ingen turer nedtegnet ennå. Velg et kart for å begynne.';
}

async function addMapDialog() {
  let image = null;
  const body = document.createElement('div');
  body.innerHTML = `
    <label>Navn på kartet<input type="text" id="mName" maxlength="60" placeholder="F.eks. Oppdal og Trollheimen"></label>
    <label>Undertittel (valgfritt)<input type="text" id="mSub" maxlength="80" placeholder="F.eks. Sommerturer i fjellet"></label>
    <div class="modal-preview" id="mPrev">Klikk for å velge et kartbilde</div>
    <p class="modal-note">Tips: Etterpå kan du bruke <b>Målestokk</b>-verktøyet for å få turlengder i kilometer.</p>`;
  body.querySelector('#mPrev').onclick = async () => {
    const [rel] = await window.ferd.pickImages(false);
    if (!rel) return;
    if (image) window.ferd.deleteMedia(image);
    image = rel;
    body.querySelector('#mPrev').innerHTML = `<img src="${mediaUrl(rel)}" alt="">`;
    const nameInput = body.querySelector('#mName');
    if (!nameInput.value) nameInput.focus();
  };
  const ok = await modal({
    title: 'Nytt kart', body,
    actions: [
      { label: 'Avbryt', value: false },
      {
        label: 'Legg til', value: true, cls: 'primary', primary: true,
        validate: () => {
          if (!body.querySelector('#mName').value.trim()) { toast('Gi kartet et navn'); return false; }
          if (!image) { toast('Velg et kartbilde først'); return false; }
          return true;
        },
      },
    ],
  });
  if (!ok) { if (image) window.ferd.deleteMedia(image); return; }
  const dims = await new Promise((res) => { const im = new Image(); im.onload = () => res([im.naturalWidth, im.naturalHeight]); im.onerror = () => res([2000, 1500]); im.src = mediaUrl(image); });
  const m = { id: uid(), name: body.querySelector('#mName').value.trim(), subtitle: body.querySelector('#mSub').value.trim(), image, width: dims[0], height: dims[1], kmPerPx: null, createdAt: Date.now() };
  state.data.maps.push(m);
  save(); renderStart();
  toast(`«${m.name}» er lagt til i kartboka`);
}

async function renameMap(m) {
  const body = document.createElement('div');
  body.innerHTML = `<label>Navn<input type="text" id="rn" maxlength="60" value="${esc(m.name)}"></label>` +
    (m.builtin ? '' : `<label>Undertittel<input type="text" id="rs" maxlength="80" value="${esc(m.subtitle || '')}"></label>`);
  const ok = await modal({ title: 'Gi nytt navn', body, actions: [{ label: 'Avbryt', value: false }, { label: 'Lagre', value: true, cls: 'primary', primary: true }] });
  if (!ok) return;
  const n = body.querySelector('#rn').value.trim(); if (n) m.name = n;
  if (!m.builtin) m.subtitle = body.querySelector('#rs').value.trim();
  save(); renderStart();
}

async function deleteMap(m) {
  const n = tripsOf(m.id).length;
  if (!(await confirmBox('Slette kartet?', `«${m.name}» og ${n} ${n === 1 ? 'tur' : 'turer'} med bilder blir slettet for godt.`))) return;
  for (const t of tripsOf(m.id)) for (const p of t.photos) window.ferd.deleteMedia(p);
  window.ferd.deleteMedia(m.image);
  state.data.trips = state.data.trips.filter(t => t.mapId !== m.id);
  state.data.maps = state.data.maps.filter(x => x.id !== m.id);
  save(); renderStart();
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

// ================================================================
//  KARTVISNING
// ================================================================
const viewport = $('viewport'), stage = $('stage'), overlay = $('overlay'), mapImg = $('mapImg');
const eraserCursor = document.createElement('div'); eraserCursor.className = 'eraser-cursor'; viewport.append(eraserCursor);
const ERASER_PX = 14;

function openMap(id) {
  state.map = state.data.maps.find(m => m.id === id);
  state.selectedId = null; state.undo = []; state.redo = []; state.filterCat = 'alle';
  $('catFilter').value = 'alle';
  const m = state.map;
  $('mapTitle').textContent = m.name;
  mapImg.src = mediaUrl(m.image);
  mapImg.width = m.width; mapImg.height = m.height;
  overlay.setAttribute('width', m.width); overlay.setAttribute('height', m.height);
  overlay.setAttribute('viewBox', `0 0 ${m.width} ${m.height}`);
  showScreen('mapScreen');
  setTool('pan');
  showList();
  requestAnimationFrame(() => { fitView(); renderTrips(); });
}

// ---------- visning (zoom og panorering) ----------
function applyView() {
  const { x, y, s } = state.view;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  updateScaleBar();
}
function fitView() {
  const r = viewport.getBoundingClientRect(), m = state.map;
  const s = Math.min(r.width / m.width, r.height / m.height) * 0.98;
  state.view = { s, x: (r.width - m.width * s) / 2, y: (r.height - m.height * s) / 2 };
  state.minScale = s * 0.5;
  applyView();
}
function zoomAt(cx, cy, factor) {
  const v = state.view;
  const ns = Math.max(state.minScale || 0.05, Math.min(4, v.s * factor));
  const k = ns / v.s;
  v.x = cx - (cx - v.x) * k; v.y = cy - (cy - v.y) * k; v.s = ns;
  applyView();
  renderTrips();
}
function toMap(e) {
  const r = viewport.getBoundingClientRect();
  return [(e.clientX - r.left - state.view.x) / state.view.s, (e.clientY - r.top - state.view.y) / state.view.s];
}
function updateScaleBar() {
  const m = state.map, el = $('scaleBar');
  if (!m || !m.kmPerPx) { el.innerHTML = ''; return; }
  const kmPerScreenPx = m.kmPerPx / state.view.s;
  const target = kmPerScreenPx * 140;
  const nice = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100].find(n => n >= target * 0.6) || 100;
  const w = nice / kmPerScreenPx;
  el.innerHTML = `${String(nice).replace('.', ',')} km<div class="bar" style="width:${w}px"></div>`;
}

viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = viewport.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
}, { passive: false });
$('zoomIn').onclick = () => { const r = viewport.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.3); };
$('zoomOut').onclick = () => { const r = viewport.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.3); };
$('zoomFit').onclick = () => { fitView(); renderTrips(); };
window.addEventListener('resize', () => { if (state.map && $('mapScreen').classList.contains('active')) updateScaleBar(); });

// ---------- verktøy ----------
function setTool(tool) {
  if (state.tool === 'calibrate' && tool !== 'calibrate') endCalibration();
  state.tool = tool;
  viewport.dataset.tool = tool;
  document.querySelectorAll('.tb-btn.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  eraserCursor.style.display = 'none';
  if (tool === 'calibrate') startCalibration(); else updateHint();
  renderTrips();
}
function updateHint() {
  const tool = state.tool, t = selected();
  if (tool === 'draw') hint(t ? `Tegner på «${t.title}». Hold venstre museknapp og tegn. Høyreklikk og dra for å flytte kartet.` : 'Tegn med musa – en ny tur opprettes automatisk.');
  else if (tool === 'erase') hint(t ? `Visker på «${t.title}». Dra over streken for å fjerne deler av den.` : 'Velg en tur i lista først, så kan du viske på den.');
  else hint(null);
}
document.querySelectorAll('.tb-btn.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));

function renderSwatches() {
  const box = $('swatches'); box.innerHTML = '';
  for (const c of INKS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === state.color ? ' active' : '');
    b.style.background = c; b.title = 'Blekkfarge';
    b.onclick = () => pickColor(c);
    box.append(b);
  }
  const custom = document.createElement('label');
  custom.className = 'swatch custom' + (INKS.includes(state.color) ? '' : ' active');
  custom.title = 'Egen farge';
  custom.innerHTML = `<input type="color" value="${state.color}">`;
  custom.querySelector('input').oninput = (e) => pickColor(e.target.value);
  box.append(custom);
}
function pickColor(c) {
  state.color = c; renderSwatches();
  const t = selected();
  if (t) { t.color = c; $('tripColor').value = c; touch(t); }
}
$('widthRange').oninput = (e) => {
  state.width = +e.target.value;
  const t = selected();
  if (t) { t.width = state.width; $('tripWidth').value = state.width; touch(t); }
};

// ---------- tegning av turer ----------
const unit = () => state.map.width / 1600;   // strektykkelse skaleres etter kartets oppløsning
function strokeD(pts) {
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}l0.01,0`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return d + `L${l[0].toFixed(1)},${l[1].toFixed(1)}`;
}
function dashArray(trip) {
  const w = trip.width * unit();
  if (trip.dash === 'dash') return `${w * 3} ${w * 2}`;
  if (trip.dash === 'dot') return `0.1 ${w * 2}`;
  return null;
}
function visibleTrips() {
  return tripsOf(state.map.id).filter(t => state.filterCat === 'alle' || t.category === state.filterCat || t.id === state.selectedId);
}
function renderTrips() {
  if (!state.map) return;
  overlay.innerHTML = '';
  const sel = state.selectedId;
  const trips = visibleTrips().sort((a, b) => (a.id === sel) - (b.id === sel));
  for (const t of trips) {
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'trip-g' + (t.id === sel ? ' selected' : sel ? ' dim' : ''));
    g.dataset.id = t.id;
    const w = t.width * unit();
    const d = t.strokes.filter(s => s.length).map(strokeD).join(' ');
    if (!d) { overlay.append(g); continue; }
    // lys kant under streken for lesbarhet på kartet
    const under = document.createElementNS(svgNS, 'path');
    under.setAttribute('d', d); under.setAttribute('class', 'trip-path');
    under.setAttribute('stroke', 'rgba(250,240,210,.75)'); under.setAttribute('stroke-width', w + 2.5 * unit());
    if (dashArray(t)) under.setAttribute('stroke-dasharray', dashArray(t));
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', d); p.setAttribute('class', 'trip-path');
    p.setAttribute('stroke', t.color); p.setAttribute('stroke-width', w);
    if (dashArray(t)) p.setAttribute('stroke-dasharray', dashArray(t));
    const hit = document.createElementNS(svgNS, 'path');
    hit.setAttribute('d', d); hit.setAttribute('class', 'trip-hit');
    hit.setAttribute('stroke-width', Math.max(w, 14 / state.view.s));
    g.append(under, p, hit);
    // startpunkt
    const s0 = t.strokes.find(s => s.length);
    if (s0) {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', s0[0][0]); c.setAttribute('cy', s0[0][1]); c.setAttribute('r', w * 1.1);
      c.setAttribute('fill', t.color); c.setAttribute('stroke', 'rgba(250,240,210,.9)'); c.setAttribute('stroke-width', unit() * 1.5);
      g.append(c);
    }
    overlay.append(g);
  }
  if (state.calib) renderCalibration();
}

// Hover-tips og klikk for å velge tur
overlay.addEventListener('mousemove', (e) => {
  const g = e.target.closest?.('.trip-g');
  const tip = $('tooltip');
  if (!g || state.tool !== 'pan' || state.drag) { tip.style.display = 'none'; return; }
  const t = state.data.trips.find(x => x.id === g.dataset.id);
  const r = viewport.getBoundingClientRect();
  tip.innerHTML = `<b>${esc(t.title)}</b> · ${fmtKm(tripKm(t))}${t.date ? ' · ' + fmtDate(t.date) : ''}`;
  tip.style.display = 'block'; tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
});
overlay.addEventListener('mouseleave', () => { $('tooltip').style.display = 'none'; });

// ---------- pekerhendelser ----------
let current = null; // stroke som tegnes nå
viewport.addEventListener('contextmenu', (e) => e.preventDefault());
viewport.addEventListener('pointerdown', (e) => {
  viewport.setPointerCapture(e.pointerId);
  const panButton = e.button === 1 || e.button === 2 || (e.button === 0 && (state.tool === 'pan' || spaceDown));
  if (panButton) {
    state.drag = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y, moved: false, target: e.target };
    viewport.classList.add('panning');
    return;
  }
  if (e.button !== 0) return;
  if (state.tool === 'draw') beginStroke(e);
  else if (state.tool === 'erase') beginErase(e);
  else if (state.tool === 'calibrate') calibClick(e);
});
viewport.addEventListener('pointermove', (e) => {
  if (state.tool === 'erase') {
    const r = viewport.getBoundingClientRect();
    Object.assign(eraserCursor.style, { display: 'block', width: ERASER_PX * 2 + 'px', height: ERASER_PX * 2 + 'px', left: (e.clientX - r.left - ERASER_PX) + 'px', top: (e.clientY - r.top - ERASER_PX) + 'px' });
  }
  if (state.drag) {
    const dx = e.clientX - state.drag.x, dy = e.clientY - state.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) state.drag.moved = true;
    state.view.x = state.drag.vx + dx; state.view.y = state.drag.vy + dy;
    applyView();
    return;
  }
  if (current) extendStroke(e);
  if (erasing) eraseAt(e);
  if (state.calib && state.calib.a && !state.calib.b) { state.calib.hover = toMap(e); renderCalibration(); }
});
viewport.addEventListener('pointerup', (e) => {
  if (state.drag) {
    const { moved, target } = state.drag;
    state.drag = null; viewport.classList.remove('panning');
    if (!moved && state.tool === 'pan' && e.button === 0) {
      const g = target.closest?.('.trip-g');
      if (g) selectTrip(g.dataset.id); else if (state.selectedId) { state.selectedId = null; showList(); renderTrips(); }
    }
    return;
  }
  if (current) endStroke();
  if (erasing) endErase();
});
viewport.addEventListener('pointerleave', () => { eraserCursor.style.display = 'none'; });

let spaceDown = false;

function beginStroke(e) {
  let t = selected();
  if (!t) t = createTrip(false);
  current = { trip: t, before: clone(t.strokes), pts: [toMap(e)] };
  t.strokes.push(current.pts);
  renderTrips();
  current.pathEls = [...overlay.querySelectorAll(`.trip-g[data-id="${t.id}"] path`)];
}
function extendStroke(e) {
  // bruk alle sammenslåtte musebevegelser for en jevn strek
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of (evs.length ? evs : [e])) {
    const p = toMap(ev), last = current.pts[current.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) * state.view.s >= 1.5) current.pts.push(p);
  }
  const d = current.trip.strokes.filter(s => s.length).map(strokeD).join(' ');
  for (const el of current.pathEls) el.setAttribute('d', d);
}
function endStroke() {
  const t = current.trip;
  const tol = 0.9 / state.view.s;
  const idx = t.strokes.indexOf(current.pts);
  t.strokes[idx] = simplify(current.pts, tol).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  pushUndo(t, current.before);
  current = null;
  touch(t);
}

// Ramer–Douglas–Peucker
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) { const d = segDist(pts[i], pts[a], pts[b]); if (d > maxD) { maxD = d; idx = i; } }
    if (maxD > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// ---------- viskelær ----------
let erasing = null;
function beginErase(e) {
  const t = selected();
  if (!t) { toast('Velg en tur i lista før du visker'); return; }
  erasing = { trip: t, before: clone(t.strokes) };
  eraseAt(e);
}
function eraseAt(e) {
  const t = erasing.trip, [cx, cy] = toMap(e), R = ERASER_PX / state.view.s;
  const out = [];
  for (const s of t.strokes) {
    // del streken opp der den går inn i viskelærsirkelen (med interpolerte punkter for presisjon)
    const dense = densify(s, R / 3);
    let seg = [];
    for (const p of dense) {
      if (Math.hypot(p[0] - cx, p[1] - cy) <= R) { if (seg.length > 1) out.push(seg); seg = []; }
      else seg.push(p);
    }
    if (seg.length > 1) out.push(seg);
  }
  t.strokes = out.map(s => simplify(s, 0.5 / state.view.s));
  renderTrips();
}
function densify(s, maxStep) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (i > 0) {
      const a = s[i - 1], b = s[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(L / maxStep);
      for (let k = 1; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    out.push(s[i]);
  }
  return out;
}
function endErase() {
  const t = erasing.trip;
  if (JSON.stringify(t.strokes) !== JSON.stringify(erasing.before)) { pushUndo(t, erasing.before); touch(t); }
  erasing = null;
}

// ---------- angre / gjør om ----------
function pushUndo(t, before) {
  state.undo.push({ id: t.id, strokes: before });
  if (state.undo.length > 200) state.undo.shift();
  state.redo = [];
  updateUndoButtons();
}
function undoRedo(from, to) {
  const step = from.pop(); if (!step) return;
  const t = state.data.trips.find(x => x.id === step.id);
  if (!t) return undoRedo(from, to);
  to.push({ id: t.id, strokes: clone(t.strokes) });
  t.strokes = step.strokes;
  if (state.selectedId !== t.id) selectTrip(t.id, true);
  touch(t);
  updateUndoButtons();
}
function updateUndoButtons() { $('undoBtn').disabled = !state.undo.length; $('redoBtn').disabled = !state.redo.length; }
$('undoBtn').onclick = () => undoRedo(state.undo, state.redo);
$('redoBtn').onclick = () => undoRedo(state.redo, state.undo);

// ---------- målestokk ----------
function startCalibration() {
  state.calib = { a: null, b: null };
  hint('Klikk på to punkter på kartet der du vet avstanden mellom dem.');
}
function endCalibration() { state.calib = null; hint(null); renderTrips(); }
function calibClick(e) {
  const c = state.calib; const p = toMap(e);
  if (!c.a) { c.a = p; hint('Klikk på det andre punktet.'); renderCalibration(); return; }
  c.b = p; renderCalibration(); askCalibration();
}
function renderCalibration() {
  overlay.querySelector('.calib')?.remove();
  const c = state.calib; if (!c || !c.a) return;
  const b = c.b || c.hover || c.a;
  const g = document.createElementNS(svgNS, 'g'); g.setAttribute('class', 'calib');
  const u = 1 / state.view.s;
  g.innerHTML = `<line x1="${c.a[0]}" y1="${c.a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#8b1e1e" stroke-width="${3 * u}" stroke-dasharray="${8 * u} ${5 * u}"/>
    <circle cx="${c.a[0]}" cy="${c.a[1]}" r="${6 * u}" fill="#8b1e1e" stroke="#f4e8c6" stroke-width="${2 * u}"/>
    <circle cx="${b[0]}" cy="${b[1]}" r="${6 * u}" fill="#8b1e1e" stroke="#f4e8c6" stroke-width="${2 * u}"/>`;
  overlay.append(g);
}
async function askCalibration() {
  const c = state.calib, m = state.map;
  const px = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
  const cur = m.kmPerPx ? (px * m.kmPerPx).toFixed(2) : '';
  const body = `<p>Hvor langt er det mellom de to punktene i virkeligheten?</p>
    <label>Avstand i kilometer<input type="number" id="calKm" min="0.01" step="0.01" value="${cur}" placeholder="F.eks. 2,5"></label>
    ${m.builtin ? '<p class="modal-note">Dette kartet har allerede en målestokk. Du trenger bare å endre den om du vil gjøre den mer nøyaktig.</p>' : ''}`;
  const ok = await modal({ title: 'Sett målestokk', body, actions: [{ label: 'Avbryt', value: false }, { label: 'Lagre målestokk', value: true, cls: 'primary', primary: true }] });
  const km = parseFloat(String(document.getElementById('calKm')?.value || '').replace(',', '.'));
  if (ok && km > 0 && px > 2) {
    m.kmPerPx = km / px; save();
    toast('Målestokken er lagret. Alle turlengder er oppdatert.');
    refreshSidebar();
  }
  setTool('pan');
}

// ---------- turer ----------
function createTrip(select = true) {
  const t = {
    id: uid(), mapId: state.map.id, title: 'Ny tur', date: today(), category: 'Fottur',
    color: state.color, width: state.width, dash: 'solid', description: '', photos: [], strokes: [], createdAt: Date.now(),
  };
  state.data.trips.push(t);
  selectTrip(t.id, true);
  if (select) setTool('draw');
  save();
  return t;
}
$('newTripBtn').onclick = () => { createTrip(true); $('tripTitle').select(); };

function selectTrip(id, keepTool) {
  state.selectedId = id;
  const t = selected();
  if (t) { state.color = t.color; state.width = t.width; $('widthRange').value = t.width; renderSwatches(); }
  showDetail();
  if (state.tool === 'draw' || state.tool === 'erase') setTool(state.tool); else renderTrips();
}

function touch(t) {
  t.updatedAt = Date.now();
  if (state.tool === 'draw' || state.tool === 'erase') updateHint();
  save(); renderTrips(); refreshSidebar();
}

function refreshSidebar() {
  if (state.selectedId) { $('tripLength').textContent = fmtKm(tripKm(selected())); }
  else renderList();
}

function showList() {
  state.selectedId = null;
  $('tripDetailPanel').classList.add('hidden');
  $('tripListPanel').classList.remove('hidden');
  renderList();
  if (state.tool === 'draw' || state.tool === 'erase') setTool(state.tool);
}
$('closeDetailBtn').onclick = () => { showList(); renderTrips(); };

function renderList() {
  const list = $('tripList'); list.innerHTML = '';
  let trips = tripsOf(state.map.id);
  const total = trips.length;
  if (state.filterCat !== 'alle') trips = trips.filter(t => t.category === state.filterCat);
  const s = state.sort;
  trips.sort((a, b) =>
    s === 'date-asc' ? (a.date || '').localeCompare(b.date || '') :
      s === 'len-desc' ? tripLengthPx(b) - tripLengthPx(a) :
        s === 'title' ? a.title.localeCompare(b.title, 'nb') :
          (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  if (!trips.length) {
    list.innerHTML = total
      ? `<li class="empty">Ingen turer i kategorien «${esc(state.filterCat)}».</li>`
      : `<li class="empty">Ingen turer på dette kartet ennå.<br>Trykk <b>+ Ny tur</b> eller velg <b>Tegn</b> og tegn ruta rett på kartet.</li>`;
  }
  for (const t of trips) {
    const li = document.createElement('li');
    li.className = 'trip-item';
    li.innerHTML = `<span class="dot" style="background:${esc(t.color)}"></span>
      <span class="t">${esc(t.title)}</span><span class="km">${fmtKm(tripKm(t))}</span>
      <span class="meta">${esc(t.category)}${t.date ? ' · ' + fmtDate(t.date) : ''}${t.photos.length ? ` · ${t.photos.length} bilde${t.photos.length > 1 ? 'r' : ''}` : ''}</span>`;
    li.onclick = () => selectTrip(t.id);
    li.onmouseenter = () => overlay.querySelector(`.trip-g[data-id="${t.id}"]`)?.classList.add('hover');
    list.append(li);
  }
  const km = trips.reduce((a, t) => a + (tripKm(t) || 0), 0);
  $('listSummary').textContent = trips.length ? `${trips.length} ${trips.length === 1 ? 'tur' : 'turer'}${state.map.kmPerPx ? ' · ' + fmtKm(km) + ' totalt' : ' · sett målestokk for å se km'}` : '';
}
$('catFilter').onchange = (e) => { state.filterCat = e.target.value; renderList(); renderTrips(); };
$('sortSel').onchange = (e) => { state.sort = e.target.value; renderList(); };

function showDetail() {
  const t = selected(); if (!t) return showList();
  $('tripListPanel').classList.add('hidden');
  $('tripDetailPanel').classList.remove('hidden');
  $('tripTitle').value = t.title;
  $('tripDate').value = t.date || '';
  $('tripCat').value = t.category;
  $('tripDash').value = t.dash || 'solid';
  $('tripColor').value = t.color;
  $('tripWidth').value = t.width;
  $('tripDesc').value = t.description || '';
  $('tripLength').textContent = fmtKm(tripKm(t));
  renderPhotos();
}

const bind = (id, key, ev = 'input', tf = (v) => v) => $(id).addEventListener(ev, (e) => {
  const t = selected(); if (!t) return;
  t[key] = tf(e.target.value);
  if (key === 'color') { state.color = t.color; renderSwatches(); }
  if (key === 'width') { state.width = t.width; $('widthRange').value = t.width; }
  touch(t);
});
bind('tripTitle', 'title', 'input', (v) => v || 'Uten navn');
bind('tripDate', 'date', 'change');
bind('tripCat', 'category', 'change');
bind('tripDash', 'dash', 'change');
bind('tripColor', 'color');
bind('tripWidth', 'width', 'input', Number);
bind('tripDesc', 'description');

$('drawMoreBtn').onclick = () => setTool('draw');
$('deleteTripBtn').onclick = async () => {
  const t = selected(); if (!t) return;
  if (!(await confirmBox('Slette turen?', `«${t.title}» med beskrivelse og ${t.photos.length} bilde(r) blir slettet for godt.`))) return;
  for (const p of t.photos) window.ferd.deleteMedia(p);
  state.data.trips = state.data.trips.filter(x => x.id !== t.id);
  state.undo = state.undo.filter(u => u.id !== t.id); state.redo = state.redo.filter(u => u.id !== t.id);
  updateUndoButtons();
  save(); showList(); renderTrips();
};

// ---------- bilder ----------
function renderPhotos() {
  const t = selected(), grid = $('photoGrid'); grid.innerHTML = '';
  if (!t.photos.length) { grid.innerHTML = '<div class="empty">Ingen bilder ennå.</div>'; return; }
  t.photos.forEach((rel, i) => {
    const d = document.createElement('div'); d.className = 'photo';
    d.innerHTML = `<img src="${mediaUrl(rel)}" alt="" loading="lazy"><button class="rm" title="Fjern bilde">&times;</button>`;
    d.onclick = (e) => {
      if (e.target.classList.contains('rm')) { e.stopPropagation(); removePhoto(i); return; }
      openLightbox(t.photos, i);
    };
    grid.append(d);
  });
}
$('addPhotosBtn').onclick = async () => {
  const t = selected(); if (!t) return;
  const rels = await window.ferd.pickImages(true);
  if (!rels.length) return;
  t.photos.push(...rels);
  touch(t); renderPhotos();
};
async function removePhoto(i) {
  const t = selected();
  if (!(await confirmBox('Fjerne bildet?', 'Bildet fjernes fra turen.', 'Fjern'))) return;
  const [rel] = t.photos.splice(i, 1);
  window.ferd.deleteMedia(rel);
  touch(t); renderPhotos();
}

let lb = null;
function openLightbox(list, i) { lb = { list, i }; showLb(); $('lightbox').classList.remove('hidden'); }
function showLb() {
  $('lbImg').src = mediaUrl(lb.list[lb.i]);
  $('lbCount').textContent = `${lb.i + 1} av ${lb.list.length}`;
  $('lbPrev').style.visibility = $('lbNext').style.visibility = lb.list.length > 1 ? 'visible' : 'hidden';
}
const lbStep = (d) => { lb.i = (lb.i + d + lb.list.length) % lb.list.length; showLb(); };
const closeLb = () => { $('lightbox').classList.add('hidden'); lb = null; };
$('lbPrev').onclick = () => lbStep(-1); $('lbNext').onclick = () => lbStep(1); $('lbClose').onclick = closeLb;
$('lightbox').onclick = (e) => { if (e.target.id === 'lightbox') closeLb(); };

// ---------- tastatur ----------
document.addEventListener('keydown', (e) => {
  if (lb) { if (e.key === 'Escape') closeLb(); if (e.key === 'ArrowLeft') lbStep(-1); if (e.key === 'ArrowRight') lbStep(1); return; }
  if (!$('modal').classList.contains('hidden') || !$('mapScreen').classList.contains('active')) return;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'color';
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? undoRedo(state.redo, state.undo) : undoRedo(state.undo, state.redo); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); undoRedo(state.redo, state.undo); return; }
  if (typing) return;
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); }
  const k = e.key.toLowerCase();
  if (k === 'v') setTool('pan');
  if (k === 'b' || k === 't') setTool('draw');
  if (k === 'e') setTool('erase');
  if (k === '+' || k === '=') $('zoomIn').click();
  if (k === '-') $('zoomOut').click();
  if (k === '0') $('zoomFit').click();
  if (e.key === 'Escape') { if (state.tool !== 'pan') setTool('pan'); else if (state.selectedId) { showList(); renderTrips(); } }
});
document.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

$('backBtn').onclick = () => {
  setTool('pan');
  state.map = null; renderStart(); showScreen('start');
};
$('openDataBtn').onclick = () => window.ferd.openDataFolder();

// ---------- oppdateringer ----------
let manualCheck = false, bannerDismissed = false;
function onUpdate(s) {
  const btn = $('checkUpdateBtn');
  btn.disabled = false;
  if (s.state === 'disabled') { btn.style.display = 'none'; return; }
  if (s.state === 'checking') { btn.textContent = 'Ser etter oppdateringer …'; btn.disabled = true; return; }
  if (s.state === 'downloading') { btn.textContent = `Laster ned versjon ${s.version || ''} … ${s.percent || 0} %`; btn.disabled = true; return; }
  btn.textContent = 'Se etter oppdateringer';
  if (s.state === 'none' && manualCheck) toast('Du har den nyeste versjonen.');
  if (s.state === 'error' && manualCheck) toast('Fikk ikke sjekket etter oppdateringer. Er du på nett?');
  if (s.state === 'ready') {
    btn.textContent = `Versjon ${s.version} er klar`;
    $('updateText').innerHTML = `Ny versjon av Ferdaboka (<b>${esc(s.version)}</b>) er lastet ned.`;
    if (!bannerDismissed) $('updateBanner').classList.remove('hidden');
  }
  manualCheck = false;
}
window.ferd.onUpdate(onUpdate);
$('checkUpdateBtn').onclick = async () => {
  manualCheck = true;
  const s = await window.ferd.checkUpdate();
  if (s.state === 'ready') { bannerDismissed = false; onUpdate(s); }
};
$('updateNowBtn').onclick = () => { clearTimeout(saveTimer); window.ferd.save(state.data).then(() => window.ferd.installUpdate()); };
$('updateLaterBtn').onclick = () => {
  bannerDismissed = true; $('updateBanner').classList.add('hidden');
  toast('Oppdateringen installeres neste gang du lukker Ferdaboka.', 3500);
};

// ---------- oppstart ----------
(async function init() {
  const opts = ['<option value="alle">Alle kategorier</option>', ...CATEGORIES.map(c => `<option>${c}</option>`)].join('');
  $('catFilter').innerHTML = opts;
  $('tripCat').innerHTML = CATEGORIES.map(c => `<option>${c}</option>`).join('');
  state.data = await window.ferd.load();
  renderSwatches(); updateUndoButtons();
  renderStart();
  $('versionInfo').textContent = 'Versjon ' + await window.ferd.version();
  onUpdate(await window.ferd.updateStatus());
})();
