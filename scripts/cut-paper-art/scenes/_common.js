// Shared building blocks for the scene files (plain script, same scope as the vendored kit).
// Tile space is 540×540. A scene is SCENES.<type> = (p) => { … } where p in [0,1) is the point
// of its loop: p = 0 is the key pose (the still), and every motion is a whole number of cycles
// per loop so the strip wraps cleanly.
const RED = '#d9524e', REDD = '#a83a3a', CREAM = '#fff4dc', BROWN = '#8a5a34', COAL = '#3a3340', GOLD = '#f2c14e';

const wave = (p, k = 1, amp = 1, ph = 0) => Math.sin((p * k + ph) * TAU) * amp;               // 0 at p = 0
const hopY = (p, amp, k = 1, ph = 0) => -Math.abs(Math.sin((p * k + ph) * Math.PI)) * amp;      // 0 at p = 0
const pt = (P, cx, cy, a) => rot([P], cx, cy, a)[0];

// full-bleed paper world
function world(bg, o = {}) {
  cut(rect(-30, -30, 600, 600, 0), bg, { key: o.key ?? 'world', shadow: false, tear: 0, pat: o.pat, crayon: o.crayon, crAl: 0.3, grain: 0.8, shade: false });
}
// a torn strip along the bottom (table, grass, sea)
function ground(y, fill, o = {}) {
  cut(rect(-30, y, 600, 600 - y, 0), fill, { key: o.key ?? 'ground' + y, tear: 2.2, sx: 0, sy: -3, sb: 8, pat: o.pat, crayon: o.crayon, grain: o.grain });
}
const blob = (x, y, rx, ry, fill, key, o = {}) => cut(ellipsePts(x, y, rx, ry, o.rot ?? 0, o.n ?? 28), fill, { key, sb: 8, sy: 5, sx: 2, ...o });
const slab = (x, y, w, h, fill, key, o = {}) => cut(rect(x, y, w, h, o.r ?? 8), fill, { key, sb: 8, sy: 5, sx: 2, ...o });
// a round character: body blob with a face
function critter(x, y, r, fill, mood, key, o = {}) {
  blob(x, y, r, r * (o.sq ?? 0.95), fill, key, { crayon: o.crayon, crAl: 0.35, ...o.cut });
  face(x, y + r * 0.04, o.fs ?? r / 62, mood);
}
function cloud(x, y, s, key = 'cl', fill = '#fffaf0') {
  [[0, 0, 58, 36], [-50, 12, 40, 26], [52, 14, 44, 28]].forEach(([dx, dy, rx, ry], i) => blob(x + dx * s, y + dy * s, rx * s, ry * s, fill, key + i, { sb: 5, sy: 3, grain: 0.4 }));
}
function confetti(n, box, cols, key = 'cf', size = 9) {
  const R = RNG('confetti', key);
  for (let i = 0; i < n; i++) {
    const x = R.r(box[0], box[2]), y = R.r(box[1], box[3]), a = R.r(0, TAU);
    cut(rot(rect(x - size / 2, y - size / 3, size, size * 0.66, 1), x, y, a), cols[i % cols.length], { key: key + i, sb: 3, sy: 2, sx: 1, tear: 0.5, grain: 0.2, shade: false });
  }
}
function paperStar(x, y, r, fill, key, rotA = 0) {
  const P = [];
  for (let i = 0; i < 10; i++) { const a = rotA - Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.48 : r; P.push([x + Math.cos(a) * d, y + Math.sin(a) * d]); }
  cut(P, fill, { key, sb: 5, sy: 3, sx: 1, tear: 0.8, grain: 0.4 });
}
function paperDisc(x, y, r, fill, key, o = {}) {
  cut(ellipsePts(x, y, r, r * (o.sq ?? 1), 0, 24), fill, { key, sb: 6, sy: 4, sx: 2, tear: 0.8, crayon: o.crayon, grain: 0.5, ...o.cut });
  if (o.glint !== false) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.38 * (o.sq ?? 1), r * 0.3, r * 0.15, -0.5, 0, TAU); ctx.fill(); }
}
// a line of yarn / string
const yarn = (x1, y1, x2, y2, color, w, key) => ink([[x1, y1], [(x1 + x2) / 2 + 2, (y1 + y2) / 2 - 2], [x2, y2]], { w, color, amt: 0.8, key });
const stroke = (a, b, w, fill, key, o = {}) => cut(capsulePts(a[0], a[1], b[0], b[1], w), fill, { key, sb: 5, sy: 3, sx: 1, tear: 0.7, grain: 0.4, ...o });
// a cylinder-ish paper tower / pillar
function pillar(x, y, w, h, fill, cap, key) {
  slab(x - w / 2, y - h, w, h, fill, key, { r: w * 0.28 });
  blob(x, y - h, w / 2, w * 0.2, cap, key + 'c', { shadow: false, tear: 0.5 });
}
// 4-point sparkle that twinkles with the loop
function twinkle(x, y, s, p, ph = 0, c = '#fff8dc') { sparkle(x, y, s * (0.55 + 0.45 * Math.abs(wave(p, 1, 1, ph))), c); }
// one 7-segment digit made of paper strips, h tall, centred on x
const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digit7(x, y, h, n, color, key) {
  const w = h * 0.55, hh = h / 2;
  const L = { a: [[-w / 2, -hh], [w / 2, -hh]], b: [[w / 2, -hh], [w / 2, 0]], c: [[w / 2, 0], [w / 2, hh]], d: [[-w / 2, hh], [w / 2, hh]], e: [[-w / 2, 0], [-w / 2, hh]], f: [[-w / 2, -hh], [-w / 2, 0]], g: [[-w / 2, 0], [w / 2, 0]] };
  [...SEG7[n]].forEach(k => stroke([x + L[k][0][0], y + L[k][0][1]], [x + L[k][1][0], y + L[k][1][1]], h * 0.15, color, key + k, { shadow: false, tear: 0.4, grain: 0.2, shade: false }));
}
// dice-style pips (1–6) on a face centred at (x, y)
function pips(x, y, n, d, r, color = COAL, key = 'pip') {
  const at = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n];
  at.forEach(([dx, dy], i) => paperDisc(x + dx * d, y + dy * d, r, color, key + i, { glint: false, cut: { shadow: false } }));
}
// a playing card, centre (x, y), tilted by a
function card(x, y, w, h, a, fill, key, o = {}) {
  cut(rot(rect(x - w / 2, y - h / 2, w, h, 12), x, y, a), fill, { key, sb: 10, sy: 6, ...o });
}
// stroke letters (the same glyph table as the TOON art, src/lib/artGlyphs.js), centred on (x, y), h tall
function letters(text, x, y, h, color, key, o = {}) {
  const w = h * ART_GLYPH_ASPECT, gap = o.gap ?? 0.28, total = w * ((1 + gap) * text.length - gap);
  [...text].forEach((ch, i) => {
    const g = ART_GLYPHS[ch.toUpperCase()]; if (!g) return;
    const ox = x - total / 2 + i * w * (1 + gap);
    g.forEach((line, j) => ink(line.map(([u, v]) => [ox + u * w, y - h / 2 + v * h]), { w: o.w ?? h * 0.2, color, amt: o.amt ?? 0.5, key: key + i + '_' + j }));
  });
}
// a paper die, top-left corner (x, y), s wide, showing n pips, tilted by a
function dieShape(x, y, s, n, a, key, fill = CREAM) {
  const cx = x + s / 2, cy = y + s / 2;
  cut(rot(rect(x, y, s, s, s * 0.18), cx, cy, a), fill, { key, sb: 8, sy: 5 });
  const at = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n];
  at.forEach(([dx, dy], i) => { const q = pt([cx + dx * s * 0.25, cy + dy * s * 0.25], cx, cy, a); dot(q[0], q[1], s * 0.085, COAL); });
}
// a lettered paper tile, top-left corner (x, y), s wide
function letterTile(x, y, s, ch, fill, key, a = 0, color = COAL) {
  const cx = x + s / 2, cy = y + s / 2;
  cut(rot(rect(x, y, s, s, s * 0.16), cx, cy, a), fill, { key, sb: 8, sy: 5 });
  if (ch) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); letters(ch, 0, 0, s * 0.5, color, key + 'l', { w: s * 0.1 }); ctx.restore(); }
}
