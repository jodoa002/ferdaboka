// Genererer et håndtegnet kart over Trondheim og omegn i Tolkien-stil (SVG).
// Geografien er sporet omtrentlig i et 1094 x 836 koordinatsystem (ca. 23 m per enhet)
// og skaleres med S. Kjør: node tools/generate-map.js
const fs = require('fs');
const path = require('path');

const S = 2;                       // skalering fra sporingskoordinater
const W = 1094 * S, H = 836 * S;
const INK = '#3b2a17';
const INK_SOFT = '#5a4127';
const WATER = '#d4d3b6';
const metrics = require('./metrics.json');

// ---------- tilfeldighet med frø ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(1981);
const r = (a, b) => a + (b - a) * rnd();
const f = (n) => Math.round(n * 10) / 10;

// ---------- geometri ----------
const sc = (pts) => pts.map(([x, y]) => [x * S, y * S]);
function pointInPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function distToLine(p, pts) { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSeg(p, pts[i - 1], pts[i])); return d; }

// Deler opp og legger på "håndskjelv" så linjene ser tegnet ut
function wobble(pts, closed, amp = 3 * S, step = 6 * S) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [];
  let phase = rnd() * 100;
  for (let i = 0; i < src.length - 1; i++) {
    const [x1, y1] = src[i], [x2, y2] = src[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.round(len / step));
    const nx = -(y2 - y1) / (len || 1), ny = (x2 - x1) / (len || 1);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      phase += len / n / (14 * S);
      const off = amp * (0.6 * Math.sin(phase * 2.1) + 0.4 * Math.sin(phase * 5.3 + 1.7)) + (rnd() - 0.5) * amp * 0.5;
      const edge = (!closed && i === 0 && k === 0) ? 0 : off;
      out.push([x1 + (x2 - x1) * t + nx * edge, y1 + (y2 - y1) * t + ny * edge]);
    }
  }
  if (!closed) out.push(src[src.length - 1]);
  return out;
}
// Catmull-Rom -> Bezier
function smooth(pts, closed) {
  const p = pts, n = p.length;
  const get = (i) => closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

// ---------- geografi (sporingskoordinater) ----------
// Vann hentet ut fra referansekart (se tools/extract-water.py)
const geo = require('./geo.json');
const munkholmen = sc([[401, 88], [409, 85], [415, 90], [412, 96], [404, 97]]);
const urban = sc([[332, 178], [380, 172], [440, 160], [472, 148], [506, 96], [548, 70], [584, 104], [600, 142], [640, 166], [700, 196], [760, 196], [764, 258], [700, 262], [640, 300], [600, 312], [560, 350], [540, 400], [522, 440], [492, 440], [474, 470], [474, 600], [424, 622], [400, 682], [330, 682], [262, 642], [272, 560], [308, 470], [262, 432], [270, 322], [318, 272], [330, 210]]);
const forests = [
  sc([[0, 104], [60, 98], [150, 94], [240, 100], [300, 116], [320, 152], [326, 192], [300, 240], [270, 300], [256, 380], [250, 430], [232, 480], [200, 520], [140, 540], [80, 552], [20, 562], [0, 560]]),
  sc([[540, 330], [600, 320], [660, 300], [700, 280], [724, 312], [746, 352], [740, 420], [722, 480], [700, 540], [660, 560], [600, 560], [560, 540], [540, 500], [530, 450], [546, 400]]),
  sc([[780, 250], [860, 240], [940, 228], [1094, 226], [1094, 500], [1040, 482], [990, 470], [960, 420], [900, 400], [850, 390], [800, 350], [772, 300]]),
  sc([[700, 600], [760, 622], [820, 664], [900, 682], [1000, 682], [1094, 640], [1094, 836], [600, 836], [588, 760], [620, 680], [660, 630]]),
  sc([[0, 768], [60, 760], [110, 780], [150, 800], [160, 836], [0, 836]]),
  sc([[540, 560], [590, 570], [600, 640], [580, 700], [560, 640]]),
];
const road = sc([[1104, 214], [1050, 212], [980, 213], [940, 226], [900, 236], [850, 230], [800, 228], [740, 226], [700, 216], [640, 190], [600, 222], [560, 252], [530, 304], [500, 312], [470, 320], [440, 340], [410, 380], [392, 430], [386, 500], [380, 600], [362, 660], [334, 720], [310, 780], [296, 846]]);
const road2 = sc([[-10, 718], [60, 714], [130, 712], [200, 714], [250, 712], [300, 700], [338, 704]]);

// Høyder i Tolkien-stil: [x, y, størrelse]
const hills = [
  [129, 247, 1.6], [48, 316, 1.3], [92, 205, 1.0], [170, 192, 1.1], [205, 262, 1.0], [62, 252, 1.0], [160, 322, 0.9], [42, 402, 1.0], [110, 456, 0.9], [190, 470, 0.9], [230, 360, 0.8], [26, 470, 0.9], [250, 200, 0.8],
  [604, 430, 1.1], [648, 390, 0.9], [684, 452, 1.0], [640, 492, 0.8], [700, 345, 0.8],
  [446, 812, 1.3], [490, 822, 1.1], [410, 820, 0.9],
  [1004, 384, 1.0], [1052, 428, 1.1], [1068, 300, 0.9], [940, 300, 0.8], [880, 330, 0.8],
  [880, 742, 1.0], [960, 770, 1.1], [1040, 744, 1.0], [1000, 710, 0.8], [800, 760, 0.9], [740, 790, 0.9], [660, 720, 0.9], [700, 680, 0.8], [636, 790, 0.8],
];

// Steder: [navn, x, y, type, tekstplassering]
const places = [
  ['Trolla', 250, 97, 'village', 'below'],
  ['Lade', 548, 92, 'village', 'right'],
  ['Ranheim', 727, 208, 'village', 'below'],
  ['Vikhammer', 935, 160, 'village', 'below'],
  ['Malvik', 1036, 178, 'village', 'below'],
  ['Moholt', 515, 282, 'hamlet', 'right'],
  ['Byåsen', 335, 338, 'hamlet', 'right'],
  ['Lian', 228, 366, 'village', 'below'],
  ['Flatåsen', 300, 455, 'hamlet', 'right'],
  ['Tiller', 440, 540, 'hamlet', 'right'],
  ['Heimdal', 330, 582, 'village', 'right'],
  ['Leinstrand', 240, 706, 'village', 'below'],
  ['Øysand', 38, 740, 'hamlet', 'right'],
  ['Bratsberg', 622, 592, 'village', 'below'],
  ['Tanem', 512, 782, 'village', 'right'],
  ['Charlottenlund', 640, 232, 'hamlet', 'below'],
];

// ---------- font-mål ----------
function measure(text, font, size, spacing = 0) {
  const m = metrics[font]; let w = 0;
  for (const ch of text) w += (m[ch] ?? 0.5) * size + spacing;
  return w - spacing;
}
const FONTS = { uncial: "'Uncial Antiqua'", fell: "'IM FELL English'", fellit: "'IM FELL English'", fellsc: "'IM FELL English SC'" };
function text(str, x, y, { font = 'fell', size = 16, anchor = 'middle', spacing = 0, rot = 0, fill = INK, italic = false, opacity = 1, halo = true } = {}) {
  const style = `font-family:${FONTS[font]};font-size:${size}px;letter-spacing:${spacing}px;${(italic || font === 'fellit') ? 'font-style:italic;' : ''}`;
  const tr = rot ? ` transform="rotate(${rot} ${f(x)} ${f(y)})"` : '';
  const common = `x="${f(x)}" y="${f(y)}" text-anchor="${anchor}" style="${style}"${tr}`;
  let out = '';
  if (halo) out += `<text ${common} fill="none" stroke="#ead8aa" stroke-width="${f(size * 0.28)}" stroke-linejoin="round" opacity="0.85">${esc(str)}</text>`;
  out += `<text ${common} fill="${fill}" opacity="${opacity}">${esc(str)}</text>`;
  return out;
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Tekst som følger en linje, bokstav for bokstav (fungerer i alle SVG-motorer)
function textAlong(str, pts, { font = 'fellit', size = 18, spacing = 2, start = 0.5, fill = INK_SOFT, offset = 0 } = {}) {
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l; }
  const tw = measure(str, font, size, spacing);
  let s = total * start - tw / 2;
  const at = (d) => {
    let i = 0; while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
    const t = Math.max(0, Math.min(1, d / segs[i]));
    const a = pts[i], b = pts[i + 1];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return [a[0] + (b[0] - a[0]) * t - Math.sin(ang) * offset, a[1] + (b[1] - a[1]) * t + Math.cos(ang) * offset, ang * 180 / Math.PI];
  };
  let out = '';
  for (const ch of str) {
    const cw = (metrics[font][ch] ?? 0.5) * size;
    const [x, y, ang] = at(s + cw / 2);
    out += text(ch, x, y, { font, size, rot: ang, fill, halo: false });
    s += cw + spacing;
  }
  return out;
}

// ---------- symboler ----------
function tree(x, y, s) {
  // liten løvtrekrone med stamme, i blekk
  const h = 11 * s, w = 7 * s;
  const lean = r(-0.6, 0.6) * s;
  const top = `M${f(x - w / 2)},${f(y - h * 0.35)} C${f(x - w * 0.75)},${f(y - h * 0.8)} ${f(x - w * 0.2 + lean)},${f(y - h * 1.15)} ${f(x + lean)},${f(y - h)} C${f(x + w * 0.3 + lean)},${f(y - h * 1.15)} ${f(x + w * 0.8)},${f(y - h * 0.75)} ${f(x + w / 2)},${f(y - h * 0.35)} C${f(x + w * 0.3)},${f(y - h * 0.15)} ${f(x - w * 0.3)},${f(y - h * 0.15)} ${f(x - w / 2)},${f(y - h * 0.35)}Z`;
  return `<path d="${top}" fill="#e3cf9c" stroke="${INK}" stroke-width="${f(0.9 * s)}"/><path d="M${f(x)},${f(y - h * 0.22)}L${f(x)},${f(y)}" stroke="${INK}" stroke-width="${f(0.9 * s)}"/>` +
    `<path d="M${f(x + w * 0.12)},${f(y - h * 0.4)} q${f(w * 0.2)},${f(-h * 0.15)} ${f(w * 0.18)},${f(-h * 0.4)}" fill="none" stroke="${INK}" stroke-width="${f(0.6 * s)}" opacity="0.7"/>`;
}
function pine(x, y, s) {
  const h = 13 * s, w = 7 * s;
  return `<path d="M${f(x)},${f(y - h)} L${f(x - w * 0.35)},${f(y - h * 0.62)} L${f(x - w * 0.18)},${f(y - h * 0.62)} L${f(x - w / 2)},${f(y - h * 0.25)} L${f(x + w / 2)},${f(y - h * 0.25)} L${f(x + w * 0.18)},${f(y - h * 0.62)} L${f(x + w * 0.35)},${f(y - h * 0.62)}Z" fill="#dcc690" stroke="${INK}" stroke-width="${f(0.9 * s)}" stroke-linejoin="round"/><path d="M${f(x)},${f(y - h * 0.25)}L${f(x)},${f(y)}" stroke="${INK}" stroke-width="${f(0.9 * s)}"/>`;
}
function hill(x, y, size) {
  const s = size * S;
  const w = r(30, 38) * s, h = r(15, 20) * s;
  const peak = r(-0.15, 0.15) * w;
  const left = [x - w / 2, y], right = [x + w / 2, y], top = [x + peak, y - h];
  let out = `<path d="M${f(left[0])},${f(left[1])} C${f(left[0] + w * 0.2)},${f(y - h * 0.4)} ${f(top[0] - w * 0.2)},${f(top[1])} ${f(top[0])},${f(top[1])} C${f(top[0] + w * 0.18)},${f(top[1])} ${f(right[0] - w * 0.15)},${f(y - h * 0.45)} ${f(right[0])},${f(right[1])}" fill="#e6d3a2" stroke="${INK}" stroke-width="${f(1.3 * S)}" stroke-linecap="round"/>`;
  // skygge-skravering på høyre side
  const n = Math.round(5 * size + 2);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const sx = top[0] + (right[0] - top[0]) * t * 0.95, sy = top[1] + (right[1] - top[1]) * Math.pow(t, 0.8) + h * 0.06;
    const len = (h * 0.75) * (1 - t * 0.7);
    out += `<path d="M${f(sx)},${f(sy)} l${f(-len * 0.25)},${f(len * 0.7)}" stroke="${INK}" stroke-width="${f(0.8 * S)}" stroke-linecap="round" opacity="0.75"/>`;
  }
  // små tuer ved foten
  out += `<path d="M${f(left[0] - 4 * s)},${f(y + 1)} q${f(3 * s)},${f(-3 * s)} ${f(6 * s)},0 M${f(right[0] - 2 * s)},${f(y + 1)} q${f(3 * s)},${f(-3 * s)} ${f(6 * s)},0" fill="none" stroke="${INK}" stroke-width="${f(0.7 * S)}" opacity="0.6"/>`;
  return out;
}
function village(x, y, big) {
  const s = (big ? 1.25 : 1) * S;
  const house = (hx, hy, k) => `<path d="M${f(hx - 4 * k)},${f(hy)} v${f(-5 * k)} l${f(4 * k)},${f(-4 * k)} l${f(4 * k)},${f(4 * k)} v${f(5 * k)}Z" fill="#efe0b4" stroke="${INK}" stroke-width="${f(0.9 * S)}" stroke-linejoin="round"/><path d="M${f(hx - 1 * k)},${f(hy)} v${f(-3 * k)} h${f(2 * k)} v${f(3 * k)}" fill="${INK}"/>`;
  return house(x - 5 * s, y + 2 * s, s * 0.9) + house(x + 5 * s, y + 3 * s, s * 0.75) + house(x, y, s);
}
function hamlet(x, y) {
  return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(3.2 * S)}" fill="#efe0b4" stroke="${INK}" stroke-width="${f(1.1 * S)}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(1 * S)}" fill="${INK}"/>`;
}
function city(x, y, k = 1.25) {
  // Nidaros: bymur med tårn og domkirke
  const s = S * k;
  let o = `<g stroke="${INK}" stroke-width="${f(1.1 * S)}" stroke-linejoin="round" fill="#efe0b4">`;
  o += `<path d="M${f(x - 24 * s)},${f(y + 8 * s)} L${f(x - 24 * s)},${f(y - 2 * s)} L${f(x + 24 * s)},${f(y - 2 * s)} L${f(x + 24 * s)},${f(y + 8 * s)}Z"/>`;
  for (let i = -24; i <= 24; i += 6) o += `<rect x="${f(x + i * s - 1.5 * s)}" y="${f(y - 5 * s)}" width="${f(3 * s)}" height="${f(3 * s)}"/>`;
  for (const tx of [-24, 24]) o += `<path d="M${f(x + tx * s - 4 * s)},${f(y + 8 * s)} v${f(-16 * s)} l${f(4 * s)},${f(-6 * s)} l${f(4 * s)},${f(6 * s)} v${f(16 * s)}Z"/>`;
  // domkirken
  o += `<path d="M${f(x - 12 * s)},${f(y - 2 * s)} v${f(-10 * s)} l${f(5 * s)},${f(-5 * s)} h${f(10 * s)} l${f(5 * s)},${f(5 * s)} v${f(10 * s)}Z"/>`;
  o += `<path d="M${f(x - 3 * s)},${f(y - 17 * s)} v${f(-8 * s)} l${f(3 * s)},${f(-9 * s)} l${f(3 * s)},${f(9 * s)} v${f(8 * s)}Z"/>`;
  o += `<path d="M${f(x)},${f(y - 34 * s)} v${f(-5 * s)} M${f(x - 2 * s)},${f(y - 37 * s)} h${f(4 * s)}" fill="none"/>`;
  o += `<circle cx="${f(x)}" cy="${f(y - 8 * s)}" r="${f(2.5 * s)}"/>`;
  o += `<path d="M${f(x - 3 * s)},${f(y + 8 * s)} v${f(-5 * s)} a${f(3 * s)},${f(3 * s)} 0 0 1 ${f(6 * s)},0 v${f(5 * s)}" fill="${INK}"/>`;
  o += `</g>`;
  return o;
}
function compass(cx, cy, R) {
  let o = `<g stroke="${INK}" stroke-width="${f(1 * S)}" fill="none">`;
  o += `<circle cx="${cx}" cy="${cy}" r="${f(R)}"/><circle cx="${cx}" cy="${cy}" r="${f(R * 0.88)}" stroke-width="${f(0.6 * S)}"/>`;
  for (let i = 0; i < 32; i++) { const a = i * Math.PI / 16; o += `<path d="M${f(cx + Math.cos(a) * R * 0.88)},${f(cy + Math.sin(a) * R * 0.88)}L${f(cx + Math.cos(a) * R)},${f(cy + Math.sin(a) * R)}" stroke-width="${f(0.6 * S)}"/>`; }
  o += `</g>`;
  const ray = (ang, len, wd, dark) => {
    const a = ang * Math.PI / 180, p = a + Math.PI / 2;
    const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len];
    const l = [cx + Math.cos(p) * wd, cy + Math.sin(p) * wd], rr = [cx - Math.cos(p) * wd, cy - Math.sin(p) * wd];
    return `<path d="M${f(cx)},${f(cy)}L${f(l[0])},${f(l[1])}L${f(tip[0])},${f(tip[1])}Z" fill="${dark ? INK : '#efe0b4'}" stroke="${INK}" stroke-width="${f(0.8 * S)}"/><path d="M${f(cx)},${f(cy)}L${f(rr[0])},${f(rr[1])}L${f(tip[0])},${f(tip[1])}Z" fill="${dark ? '#efe0b4' : INK}" stroke="${INK}" stroke-width="${f(0.8 * S)}"/>`;
  };
  for (const a of [45, 135, 225, 315]) o += ray(a, R * 0.6, R * 0.09, false);
  for (const a of [0, 90, 180, 270]) o += ray(a - 90, R * 0.95, R * 0.13, true);
  o += `<circle cx="${cx}" cy="${cy}" r="${f(R * 0.07)}" fill="#efe0b4" stroke="${INK}" stroke-width="${f(0.8 * S)}"/>`;
  o += text('N', cx, cy - R - 5 * S, { font: 'uncial', size: 16 * S, halo: false });
  return o;
}

// ---------- bygg SVG ----------
let svg = '';
const add = (s) => { svg += s + '\n'; };

const fontFace = ['UncialAntiqua-Regular.ttf|Uncial Antiqua|normal', 'IMFeENrm28P.ttf|IM FELL English|normal', 'IMFeENit28P.ttf|IM FELL English|italic', 'IMFeENsc28P.ttf|IM FELL English SC|normal']
  .map(s => { const [file, fam, st] = s.split('|'); return `@font-face{font-family:'${fam}';font-style:${st};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(__dirname, '../assets/fonts', file)).toString('base64')}) format('truetype');}`; }).join('');

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
add(`<defs><style>${fontFace}</style>
<filter id="paper" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.0022" numOctaves="4" seed="7" result="n"/>
  <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.45  0 0 0 0 0.30  0 0 0 0 0.12  0 0 0 -1.4 0.95" result="blot"/>
  <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="g"/>
  <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0 0.1  0 0 0 -2.2 1.25" result="grain"/>
  <feMerge><feMergeNode in="blot"/><feMergeNode in="grain"/></feMerge>
</filter>
<radialGradient id="vig" cx="50%" cy="50%" r="72%"><stop offset="0.6" stop-color="#7a5326" stop-opacity="0"/><stop offset="1" stop-color="#5c3a14" stop-opacity="0.55"/></radialGradient>
</defs>`);

// Pergament
add(`<rect width="${W}" height="${H}" fill="#ecdcae"/>`);

// ---------- vann ----------
function shape(pts, amp) {
  const w = wobble(pts, true, amp, 4 * S);
  const xs = w.map(p => p[0]), ys = w.map(p => p[1]);
  let a = 0; for (let i = 0; i < w.length; i++) { const j = (i + w.length - 1) % w.length; a += w[j][0] * w[i][1] - w[i][0] * w[j][1]; }
  return { w, ring: [...w, w[0]], box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], area: Math.abs(a / 2) / (S * S) };
}
const seaShapes = geo.seas.map(p => shape(sc(p), 0.8 * S));
const lakeShapes = geo.lakes.map(p => shape(sc(p), 0.45 * S));
const riverShapes = geo.rivers.map(r => ({ name: r.name, parts: r.polys.map(p => shape(sc(p), 0.5 * S)) }));
const mouths = geo.mouths.map(([x, y]) => [x * S, y * S]);

const nearBox = (p, b, m) => p[0] > b[0] - m && p[0] < b[2] + m && p[1] > b[1] - m && p[1] < b[3] + m;
const inShape = (p, sh) => nearBox(p, sh.box, 0) && pointInPoly(p, sh.w);
const nearEdge = (p, sh, m) => nearBox(p, sh.box, m) && distToLine(p, sh.ring) < m;
const inSea = (p) => seaShapes.some(sh => inShape(p, sh));
const inLake = (p) => lakeShapes.some(sh => inShape(p, sh));
const inRiver = (p) => riverShapes.some(r => r.parts.filter(sh => inShape(p, sh)).length % 2 === 1);
const nearWater = (p, m) => seaShapes.some(sh => nearEdge(p, sh, m)) || lakeShapes.some(sh => nearEdge(p, sh, m * 0.8)) || riverShapes.some(r => r.parts.some(sh => nearEdge(p, sh, m)));

const seaD = seaShapes.map(sh => smooth(sh.w, true));
const lakeD = lakeShapes.map(sh => smooth(sh.w, true));
const riverD = riverShapes.map(r => r.parts.map(sh => smooth(sh.w, true)).join(' '));

// 1) blekkstrek langs alle bredder (dobbel bredde: innerste halvdel dekkes av vannet)
for (const d of seaD) add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(4 * S)}" stroke-linejoin="round"/>`);
for (const d of lakeD) add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(3.2 * S)}" stroke-linejoin="round"/>`);
for (const d of riverD) add(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="${f(3 * S)}" stroke-linejoin="round"/>`);
// 2) alt vann fylles med samme farge, så elver, innsjøer og fjord flyter sammen uten skillestreker
for (const d of seaD) add(`<path d="${d}" fill="${WATER}"/>`);
for (const d of lakeD) add(`<path d="${d}" fill="${WATER}"/>`);
for (const d of riverD) add(`<path d="${d}" fill="${WATER}" fill-rule="evenodd"/>`);

// 3) bølgeringer langs kysten (Tolkien-stil), med åpning ved elvemunningene
function ripples(dPath, clipId, rings, gap) {
  let o = `<g clip-path="url(#${clipId})" fill="none" stroke-linejoin="round">`;
  for (let k = rings; k >= 1; k--) {
    o += `<path d="${dPath}" stroke="${INK}" stroke-opacity="${f(0.55 - k * 0.06)}" stroke-width="${f(k * gap * 2)}"/>`;
    o += `<path d="${dPath}" stroke="${WATER}" stroke-width="${f(k * gap * 2 - 1.1 * S)}"/>`;
  }
  return o + '</g>';
}
add(`<clipPath id="seaClip">${seaD.map(d => `<path d="${d}"/>`).join('')}</clipPath>`);
add(`<mask id="mouthMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${mouths.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(16 * S)}" fill="#000"/>`).join('')}</mask>`);
add(`<g mask="url(#mouthMask)">${ripples(seaD.join(' '), 'seaClip', 5, 4.5 * S)}</g>`);
lakeShapes.forEach((sh, i) => {
  const rings = sh.area > 2500 ? 3 : sh.area > 300 ? 1 : 0;
  if (!rings) return;
  add(`<clipPath id="lake${i}"><path d="${lakeD[i]}"/></clipPath>`);
  add(ripples(lakeD[i], `lake${i}`, rings, 3.5 * S));
});
// Munkholmen
const mW = wobble(munkholmen, true, 0.6 * S, 3 * S);
add(`<path d="${smooth(mW, true)}" fill="#ecdcae" stroke="${INK}" stroke-width="${f(1.3 * S)}"/>`);
add(`<rect x="${f(406 * S)}" y="${f(86 * S)}" width="${f(5 * S)}" height="${f(6 * S)}" fill="#efe0b4" stroke="${INK}" stroke-width="${f(0.8 * S)}"/>`);

// Veier: prikket linje
for (const rd of [road, road2]) {
  const d = smooth(wobble(rd, false, 1.2 * S, 8 * S), false);
  add(`<path d="${d}" fill="none" stroke="${INK_SOFT}" stroke-width="${f(1.4 * S)}" stroke-dasharray="${f(1 * S)} ${f(4 * S)}" stroke-linecap="round" opacity="0.85"/>`);
}

// Etikettbokser som skal holdes fri for trær og høyder
const labelBoxes = [];
const reserve = (x, y, w, h) => labelBoxes.push([x - w / 2, y - h / 2, x + w / 2, y + h / 2]);
for (const [name, x, y, type, pos] of places) {
  const sz = (type === 'village' ? 15 : 13) * S;
  const tw = measure(name, type === 'village' ? 'fell' : 'fellsc', sz);
  reserve(x * S, y * S, 26 * S, 22 * S);
  const lp = labelPos(x * S, y * S, pos, tw, sz);
  reserve(lp.cx, lp.cy, tw + 10 * S, sz * 1.2);
}
function labelPos(x, y, pos, tw, sz) {
  if (pos === 'below') return { x, y: y + sz * 1.45, anchor: 'middle', cx: x, cy: y + sz * 1.1 };
  if (pos === 'right') return { x: x + 10 * S, y: y + sz * 0.33, anchor: 'start', cx: x + 10 * S + tw / 2, cy: y };
  if (pos === 'left') return { x: x - 10 * S, y: y + sz * 0.33, anchor: 'end', cx: x - 10 * S - tw / 2, cy: y };
  return { x, y: y - sz * 0.9, anchor: 'middle', cx: x, cy: y - sz * 1.2 };
}
// områdenavn og spesielle etiketter
const areaLabels = [
  ['BYMARKA', 150, 300, 'uncial', 26, 8, -8],
  ['ESTENSTADMARKA', 640, 410, 'uncial', 16, 4, -62],
  ['MALVIKMARKA', 935, 330, 'uncial', 18, 5, 0],
  ['STRINDAMARKA', 770, 712, 'uncial', 18, 6, -4],
];
for (const [t, x, y, fnt, sz, sp, rot] of areaLabels) {
  const tw = measure(t, fnt, sz * S, sp * S);
  const rad = rot * Math.PI / 180;
  const bw = Math.abs(Math.cos(rad)) * tw + Math.abs(Math.sin(rad)) * sz * S;
  const bh = Math.abs(Math.sin(rad)) * tw + Math.abs(Math.cos(rad)) * sz * S;
  reserve(x * S, y * S - sz * S * 0.35, bw + 8 * S, bh + 8 * S);
}
reserve(129 * S, 272 * S, 90 * S, 20 * S);
reserve(104 * S, 400 * S, 70 * S, 16 * S);       // Lianvatnet
reserve(470 * S, 472 * S, 40 * S, 80 * S);
reserve(200 * S, 776 * S, 30 * S, 50 * S);         // Gråkallen
reserve(865 * S, 520 * S, 150 * S, 40 * S);       // Jonsvatnet
reserve(980 * S, 805 * S, 210 * S, 60 * S);       // målestokk
reserve(421 * S, 196 * S, 60 * S, 50 * S);        // byen
reserve(425 * S, 250 * S, 130 * S, 34 * S);       // «Trondheim / Nidaros»
reserve(500 * S, 206 * S, 26 * S, 22 * S);        // Kristiansten festning

// Bydeler og strøk: [navn, x, y]
const districts = [
  ['Ila', 352, 192], ['Bakklandet', 474, 194], ['Lademoen', 505, 162], ['Kristiansten', 500, 226],
  ['Tyholt', 546, 212], ['Strindheim', 572, 190], ['Rotvoll', 622, 170], ['Grilstad', 668, 186],
  ['Leangen', 600, 214], ['Valentinlyst', 505, 258], ['Gløshaugen', 465, 284], ['Dragvoll', 600, 292],
  ['Jakobsli', 655, 280], ['Brundalen', 700, 262], ['Reppe', 748, 250], ['Værestrøa', 842, 182],
  ['Sverresborg', 325, 226], ['Breidablikk', 318, 300], ['Hallset', 382, 372], ['Stavset', 305, 396],
  ['Nardo', 482, 312], ['Nidarvoll', 458, 342], ['Fossegrenda', 452, 402], ['Sjetne', 412, 508],
  ['Saupstad', 300, 522], ['Kolstad', 345, 550], ['Lundåsen', 275, 572], ['Kattem', 300, 614],
];
const DSZ = 10 * S;
for (const [n, x, y] of districts) reserve(x * S, y * S - DSZ * 0.3, measure(n, 'fellsc', DSZ, 0.6 * S) + 6 * S, DSZ * 1.15);

const inLabel = (p) => labelBoxes.some(([x1, y1, x2, y2]) => p[0] > x1 && p[0] < x2 && p[1] > y1 && p[1] < y2);
// Bebyggelse: tett med hus nær sentrum, glissent i ytterkant
const urbanHouses = [];
for (let i = 0; i < 40000 && urbanHouses.length < 1100; i++) {
  const p = [r(250, 780) * S, r(60, 690) * S];
  if (!pointInPoly(p, urban) || inSea(p) || inLake(p) || inRiver(p)) continue;
  if (nearWater(p, 6 * S)) continue;
  const dc = Math.hypot(p[0] - 395 * S, p[1] - 212 * S) / S;
  if (rnd() > 0.28 + 0.72 * Math.exp(-dc / 170)) continue;
  if (inLabel(p)) continue;
  if (urbanHouses.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 7.5 * S)) continue;
  urbanHouses.push(p);
}

// Høyder
const hillSvg = [];
const hillPts = hills.map(([x, y, s]) => [x * S, y * S, s]);
for (const [x, y, s] of hillPts.sort((a, b) => a[1] - b[1])) hillSvg.push([y, hill(x, y, s)]);

// Skog
const treeSvg = [];
const isBlocked = (p, margin) => {
  if (inSea(p) || inLake(p) || inRiver(p)) return true;
  if (nearWater(p, margin)) return true;
  if (pointInPoly(p, urban)) return true;
  if (hillPts.some(([hx, hy, s]) => Math.abs(p[0] - hx) < 22 * S * s && p[1] > hy - 24 * S * s && p[1] < hy + 10 * S)) return true;
  if (inLabel(p)) return true;
  return false;
};
const treePts = [];
for (const poly of forests) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const step = 11 * S;
  for (let y = y0; y < y1; y += step * 0.8) {
    for (let x = x0; x < x1; x += step) {
      const p = [x + r(-4, 4) * S + ((Math.round(y / step) % 2) * step / 2), y + r(-3, 3) * S];
      if (!pointInPoly(p, poly)) continue;
      if (rnd() < 0.22) continue; // lysninger
      if (isBlocked(p, 8 * S)) continue;
      treePts.push(p);
    }
  }
}
// Noen spredte trær utenfor skogene
for (let i = 0; i < 260; i++) {
  const p = [r(0, 1094) * S, r(90, 836) * S];
  if (forests.some(fp => pointInPoly(p, fp)) || isBlocked(p, 8 * S)) continue;
  if (treePts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 10 * S)) continue;
  treePts.push(p);
}
for (const p of treePts) {
  const s = r(0.9, 1.15) * S;
  treeSvg.push([p[1], rnd() < 0.55 ? pine(p[0], p[1], s) : tree(p[0], p[1], s)]);
}

// Jordbruksland: små åkerstreker i de åpne områdene sør
let fields = '';
for (let i = 0; i < 90; i++) {
  const p = [r(130, 600) * S, r(600, 800) * S];
  if (isBlocked(p, 10 * S) || forests.some(fp => pointInPoly(p, fp))) continue;
  const a = r(-0.4, 0.4), len = r(6, 12) * S;
  for (let k = 0; k < 3; k++) {
    const ox = k * 3 * S * Math.sin(a), oy = k * 3 * S;
    fields += `<path d="M${f(p[0] + ox)},${f(p[1] + oy)} l${f(len * Math.cos(a))},${f(len * Math.sin(a))}" stroke="${INK}" stroke-width="${f(0.6 * S)}" opacity="0.45"/>`;
  }
}
add(fields);
// Gress-tuer spredt
let tufts = '';
for (let i = 0; i < 300; i++) {
  const p = [r(0, 1094) * S, r(90, 836) * S];
  if (isBlocked(p, 6 * S)) continue;
  if (treePts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 9 * S)) continue;
  tufts += `<path d="M${f(p[0] - 3 * S)},${f(p[1])} l${f(1.5 * S)},${f(-3 * S)} M${f(p[0])},${f(p[1])} l0,${f(-4 * S)} M${f(p[0] + 3 * S)},${f(p[1])} l${f(-1.5 * S)},${f(-3 * S)}" stroke="${INK}" stroke-width="${f(0.6 * S)}" opacity="0.5" fill="none"/>`;
}
add(tufts);

// Urbane hus
let uh = '';
for (const [x, y] of urbanHouses.sort((a, b) => a[1] - b[1])) {
  const k = r(0.5, 0.75) * S, v = rnd();
  const st = `fill="#efe0b4" stroke="${INK}" stroke-width="${f(0.55 * S)}" stroke-linejoin="round" opacity="0.85"`;
  if (v < 0.6) {          // vanlig hus
    uh += `<path d="M${f(x - 3 * k)},${f(y)} v${f(-3 * k)} l${f(3 * k)},${f(-3 * k)} l${f(3 * k)},${f(3 * k)} v${f(3 * k)}Z" ${st}/>`;
  } else if (v < 0.85) {  // langhus / rekke
    uh += `<path d="M${f(x - 5 * k)},${f(y)} v${f(-3 * k)} l${f(2.5 * k)},${f(-2.5 * k)} h${f(5 * k)} l${f(2.5 * k)},${f(2.5 * k)} v${f(3 * k)}Z" ${st}/><path d="M${f(x - 2.5 * k)},${f(y - 5.5 * k)} v${f(2.5 * k)}" stroke="${INK}" stroke-width="${f(0.4 * S)}" opacity="0.7"/>`;
  } else {                // to hus i klynge
    uh += `<path d="M${f(x - 5 * k)},${f(y)} v${f(-2.5 * k)} l${f(2.5 * k)},${f(-2.5 * k)} l${f(2.5 * k)},${f(2.5 * k)} v${f(2.5 * k)}Z" ${st}/><path d="M${f(x)},${f(y + 1.5 * k)} v${f(-3 * k)} l${f(3 * k)},${f(-3 * k)} l${f(3 * k)},${f(3 * k)} v${f(3 * k)}Z" ${st}/>`;
  }
}
add(uh);

// Tegn trær og høyder sortert ovenfra og ned så de overlapper riktig
for (const [, s] of [...treeSvg, ...hillSvg].sort((a, b) => a[0] - b[0])) add(s);

// Byen og landsbyer
add(city(421 * S, 207 * S, 0.8));
// Kristiansten festning: stjerneskanse
{
  const cx = 500 * S, cy = 206 * S, R = 9 * S;
  let d = '';
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.55 : R; d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ',' + f(cy + Math.sin(a) * rr * 0.75); }
  add(`<path d="${d}Z" fill="#e6d3a2" stroke="${INK}" stroke-width="${f(1.1 * S)}" stroke-linejoin="round"/>`);
  add(`<rect x="${f(cx - 2.5 * S)}" y="${f(cy - 4 * S)}" width="${f(5 * S)}" height="${f(5 * S)}" fill="#efe0b4" stroke="${INK}" stroke-width="${f(0.8 * S)}"/><path d="M${f(cx)},${f(cy - 4 * S)} v${f(-6 * S)} l${f(4 * S)},${f(1.5 * S)} l${f(-4 * S)},${f(1.5 * S)}" fill="${INK}" stroke="${INK}" stroke-width="${f(0.6 * S)}"/>`);
}
for (const [name, x, y, type] of places) add(type === 'village' ? village(x * S, y * S, false) : hamlet(x * S, y * S));

// ---------- etiketter ----------
add(text('Trondheim', 425 * S, 246 * S, { font: 'uncial', size: 22 * S, spacing: 1.5 * S }));
add(text('Nidaros', 425 * S, 262 * S, { font: 'fellit', size: 12 * S, fill: INK_SOFT }));
for (const [name, x, y, type, pos] of places) {
  const sz = (type === 'village' ? 15 : 13) * S;
  const fnt = type === 'village' ? 'fell' : 'fellsc';
  const lp = labelPos(x * S, y * S, pos, measure(name, fnt, sz), sz);
  add(text(name, lp.x, lp.y, { font: fnt, size: sz, anchor: lp.anchor }));
}
for (const [t, x, y, fnt, sz, sp, rot] of areaLabels) add(text(t, x * S, y * S, { font: fnt, size: sz * S, spacing: sp * S, rot, fill: INK_SOFT, opacity: 0.9 }));
for (const [n, x, y] of districts) add(text(n, x * S, y * S, { font: 'fellsc', size: DSZ, spacing: 0.6 * S, fill: INK_SOFT }));
add(text('Gråkallen', 129 * S, 272 * S, { font: 'fellit', size: 13 * S }));
add(text('Munkholmen', 410 * S, 112 * S, { font: 'fellit', size: 11 * S, fill: INK_SOFT }));
// vann
add(text('Trondheimsfjorden', 720 * S, 62 * S, { font: 'fellit', size: 30 * S, spacing: 5 * S, fill: INK_SOFT, halo: false, rot: 4 }));
add(text('Jonsvatnet', 868 * S, 525 * S, { font: 'fellit', size: 19 * S, spacing: 3 * S, rot: 48, fill: INK_SOFT, halo: false }));
add(text('Gaulosen', 48 * S, 668 * S, { font: 'fellit', size: 14 * S, spacing: 2 * S, rot: -30, fill: INK_SOFT, halo: false }));
add(text('Lianvatnet', 104 * S, 404 * S, { font: 'fellit', size: 10 * S, fill: INK_SOFT }));
add(text('Nidelva', 470 * S, 472 * S, { font: 'fellit', size: 15 * S, spacing: 2 * S, rot: 62, fill: INK_SOFT }));
add(text('Gaula', 200 * S, 776 * S, { font: 'fellit', size: 13 * S, spacing: 2 * S, rot: 78, fill: INK_SOFT }));

// Tittel
add(text('Trondheim og Omegn', 215 * S, 50 * S, { font: 'uncial', size: 27 * S, spacing: 1.5 * S, halo: false }));
add(text('Kart over Nidaros, markene og vatna', 215 * S, 68 * S, { font: 'fellit', size: 14 * S, fill: INK_SOFT, halo: false }));
add(`<path d="M${f(85 * S)},${f(75 * S)} q${f(65 * S)},${f(-6 * S)} ${f(130 * S)},0 q${f(65 * S)},${f(6 * S)} ${f(130 * S)},0" fill="none" stroke="${INK}" stroke-width="${f(1 * S)}"/>`);

// Kompass
add(compass(1015 * S, 84 * S, 38 * S));

// Målestokk (ca. 23 m per sporingsenhet)
const KM = 1000 / 23 * S;
{
  const x0 = 890 * S, y0 = 800 * S;
  let o = `<rect x="${f(x0 - 14 * S)}" y="${f(y0 - 32 * S)}" width="${f(4 * KM + 28 * S)}" height="${f(54 * S)}" fill="#ecdcae" stroke="${INK}" stroke-width="${f(1 * S)}" opacity="0.92"/>`;
  for (let i = 0; i < 4; i++) o += `<rect x="${f(x0 + i * KM)}" y="${f(y0)}" width="${f(KM)}" height="${f(5 * S)}" fill="${i % 2 ? '#efe0b4' : INK}" stroke="${INK}" stroke-width="${f(0.8 * S)}"/>`;
  for (let i = 0; i <= 4; i++) o += text(String(i), x0 + i * KM, y0 + 17 * S, { font: 'fell', size: 11 * S, halo: false });
  o += text('Målestokk i kilometer', x0 + 2 * KM, y0 - 12 * S, { font: 'fellit', size: 12 * S, halo: false });
  add(o);
}

// Pergamenttekstur og vignett over alt
add(`<rect width="${W}" height="${H}" filter="url(#paper)" opacity="0.55" style="mix-blend-mode:multiply"/>`);
add(`<rect width="${W}" height="${H}" fill="url(#vig)"/>`);

// Ramme
{
  const m = 10 * S, b = 8 * S;
  let o = `<g fill="none" stroke="${INK}">`;
  o += `<rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" stroke-width="${f(2.2 * S)}"/>`;
  o += `<rect x="${m + b}" y="${m + b}" width="${W - 2 * (m + b)}" height="${H - 2 * (m + b)}" stroke-width="${f(1 * S)}"/>`;
  o += '</g>';
  // vekslende felt i rammebåndet
  const seg = 40 * S;
  for (let x = m; x < W - m; x += seg * 2) {
    const w = Math.min(seg, W - m - x);
    o += `<rect x="${f(x)}" y="${m}" width="${f(w)}" height="${b}" fill="${INK}" opacity="0.8"/><rect x="${f(x)}" y="${f(H - m - b)}" width="${f(w)}" height="${b}" fill="${INK}" opacity="0.8"/>`;
  }
  for (let y = m; y < H - m; y += seg * 2) {
    const h = Math.min(seg, H - m - y);
    o += `<rect x="${m}" y="${f(y)}" width="${b}" height="${f(h)}" fill="${INK}" opacity="0.8"/><rect x="${f(W - m - b)}" y="${f(y)}" width="${b}" height="${f(h)}" fill="${INK}" opacity="0.8"/>`;
  }
  // ytre kant mørkere
  o += `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#3a2510" stroke-width="${f(m * 2)}" opacity="0.35"/>`;
  add(o);
}

add('</svg>');
fs.mkdirSync(path.join(__dirname, '../assets/maps'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../assets/trondheim.svg'), svg);
console.log(`Skrev assets/trondheim.svg (${(svg.length / 1024).toFixed(0)} kB), ${treePts.length} trær, ${urbanHouses.length} hus`);
