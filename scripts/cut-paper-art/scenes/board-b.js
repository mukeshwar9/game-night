// CUT PAPER scenes — classic board games, part two.

function hexPoly(x, y, r) { const P = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; P.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return P; }
function arrowPoly(x, y, a, s) {
  const P = [[-30, -11], [4, -11], [4, -28], [32, 0], [4, 28], [4, 11], [-30, 11]].map(([u, v]) => [u * s, v * s]);
  return rot(P.map(([u, v]) => [x + u, y + v]), x, y, a);
}
function sGlyph(x, y, s, color, key) {
  ink([[x + 22 * s, y - 26 * s], [x + 6 * s, y - 40 * s], [x - 18 * s, y - 30 * s], [x - 14 * s, y - 8 * s], [x + 14 * s, y + 6 * s], [x + 20 * s, y + 30 * s], [x - 4 * s, y + 42 * s], [x - 24 * s, y + 28 * s]], { w: 17 * s, color, amt: 0.8, key });
}

SCENES.yavalath = (p) => {
  world(PAL.purple, { pat: pat.dots('rgba(255,255,255,0.22)', 4, 32) });
  cut(rect(30, 50, 480, 450, 22), PAL.navy, { key: 'yb', sb: 16, sy: 10, crayon: '#3a4690' });
  const rows = [3, 4, 5, 4, 3], R = 44;
  const H = [];
  rows.forEach((n, r) => { for (let c = 0; c < n; c++) { const x = 270 + (c - (n - 1) / 2) * R * 1.78, y = 110 + r * R * 1.55; H.push([x, y, r, c]); cut(hexPoly(x, y, R * 0.98), PAL.cream, { key: 'yh' + r + c, sb: 4, sy: 3, tear: 0.7, grain: 0.4 }); } });
  const at = (r, c) => H.find(h => h[2] === r && h[3] === c);
  const st = (r, c, fill, key) => { const [x, y] = at(r, c); paperDisc(x, y, 30, fill, key, { crayon: 'rgba(0,0,0,0.12)' }); };
  st(2, 0, PAL.yellow, 'y1'); st(2, 1, PAL.yellow, 'y2'); st(2, 2, PAL.yellow, 'y3'); st(1, 1, RED, 'r1'); st(1, 2, RED, 'r2'); st(0, 1, RED, 'r3');
  const [bx, by] = at(3, 2);
  critter(bx, by, 32, PAL.pink, 'wow', 'yc', { fs: 0.5, hop: 58 });
  impact(bx, by + 26, 26);
  twinkle(486, 70, 15, p); twinkle(50, 480, 12, p, 0.5);
};

SCENES.connectfour = (p) => {
  world(PAL.sky, { pat: pat.stripes('rgba(255,255,255,0.28)', 22, 66, 0.5) });
  cloud(100, 70, 0.7);
  slab(50, 170, 440, 330, PAL.blue, 'c4', { r: 22, sb: 16, sy: 10, crayon: PAL.navy, crAl: 0.25 });
  const disc = { '3,0': RED, '3,1': PAL.yellow, '3,2': RED, '3,3': RED, '2,2': PAL.yellow, '2,3': PAL.yellow, '1,3': RED, '3,4': PAL.yellow, '2,1': RED };
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const x = 114 + c * 78, y = 232 + r * 78, d = disc[r + ',' + c];
    paperDisc(x, y, 31, d || '#e8dfc6', 'c4d' + r + c, { glint: !!d, cut: d ? {} : { shadow: false } });
  }
  critter(192, 106, 42, RED, 'wow', 'c4f', { fs: 0.62, crayon: REDD, hop: 48 });
  impact(192, 150, 28);
  cut(rect(70, 496, 70, 36, 6), PAL.navy, { key: 'c4l1', shadow: false }); cut(rect(400, 496, 70, 36, 6), PAL.navy, { key: 'c4l2', shadow: false });
  twinkle(440, 90, 16, p);
};

SCENES.dotsandboxes = (p) => {
  world(PAL.pinkL, { pat: pat.lines('rgba(76,111,181,0.14)', 30) });
  cut(rect(46, 56, 448, 448, 18), PAL.paper, { key: 'dp', sb: 14, sy: 9, pat: pat.lines('rgba(76,111,181,0.14)', 30) });
  const g = (i, j) => [110 + j * 160, 120 + i * 160];
  const box = (i, j, fill, mood, key) => { const [x, y] = g(i, j); hero(x + 80, y + 152, () => { cut(rect(x + 8, y + 8, 144, 144, 8), fill, { key, shadow: false, tear: 0.6, crayon: 'rgba(255,255,255,0.3)' }); face(x + 80, y + 80, 0.9, mood); }, 40, i * 0.1); };
  box(0, 0, '#f3a3a0', 'grin', 'b1'); box(1, 1, PAL.sky, 'smile', 'b2');
  const line = (a, b, c, key) => stroke(a, b, 14, c, key, { sb: 4 });
  const [a0, a1, a2] = [g(0, 0), g(0, 1), g(0, 2)], [b0, b1, b2] = [g(1, 0), g(1, 1), g(1, 2)], [c0, c1, c2] = [g(2, 0), g(2, 1), g(2, 2)];
  line(a0, a1, RED, 'l1'); line(a1, b1, RED, 'l2'); line(b1, b0, RED, 'l3'); line(b0, a0, RED, 'l4');
  line(b1, b2, PAL.blue, 'l5'); line(b2, c2, PAL.blue, 'l6'); line(c2, c1, PAL.blue, 'l7'); line(c1, b1, PAL.blue, 'l8');
  line(a1, a2, PAL.grey, 'l9'); line(a2, b2, PAL.grey, 'l10'); line(b0, c0, PAL.grey, 'l11');
  [a0, a1, a2, b0, b1, b2, c0, c1, c2].forEach((q, i) => paperDisc(q[0], q[1], 17 + (i === 4 ? wave(p, 1, 2) : 0), COAL, 'dd' + i, { glint: false }));
  paperStar(468, 84, 22, PAL.yellow, 'ds', p * 0.5);
};

SCENES.sos = (p) => {
  world(PAL.mustard, { pat: pat.dots('rgba(255,255,255,0.25)', 4, 30) });
  cut(rect(50, 60, 440, 440, 16), PAL.paper, { key: 'sb', sb: 14, sy: 9, pat: pat.lines('rgba(76,111,181,0.16)', 36, 4) });
  [1, 2].forEach(i => { cut(rect(50 + i * 147 - 3, 70, 6, 420, 2), PAL.tweed, { key: 'sv' + i, shadow: false, tear: 0.5 }); cut(rect(60, 60 + i * 147 - 3, 420, 6, 2), PAL.tweed, { key: 'sh' + i, shadow: false, tear: 0.5 }); });
  const g = (i, j) => [124 + j * 147, 134 + i * 147];
  const O = (i, j, c, key) => { const [x, y] = g(i, j); paperDisc(x, y, 40, c, key, { glint: false }); blob(x, y, 20, 20, PAL.paper, key + 'h', { shadow: false, tear: 0.5, pat: pat.lines('rgba(76,111,181,0.16)', 36, 4) }); };
  sGlyph(...g(1, 0), 1.1, RED, 'sa'); sGlyph(...g(1, 2), 1.1, RED, 'sc');
  sGlyph(...g(0, 0), 1.1, PAL.green, 'sd'); sGlyph(...g(2, 2), 1.1, PAL.green, 'se'); O(2, 1, PAL.green, 'of');
  stroke([70, g(1, 1)[1]], [470, g(1, 1)[1]], 10, 'rgba(242,193,78,0.9)', 'sw', { shadow: false });
  hero(g(1, 1)[0], g(1, 1)[1] + 40, () => { O(1, 1, PAL.blue, 'ob'); face(g(1, 1)[0], g(1, 1)[1] + 2, 0.55, 'grin'); }, 50);
  impact(g(1, 1)[0], g(1, 1)[1] + 36, 26);
  twinkle(486, 70, 15, p); twinkle(50, 508, 12, p, 0.5);
};

SCENES.arrows = (p) => {
  world(PAL.purple, { pat: pat.stripes('rgba(255,255,255,0.16)', 18, 52, 0.7) });
  cut(rect(50, 70, 440, 440, 20), PAL.navy, { key: 'ab', sb: 16, sy: 10, crayon: '#3a4690' });
  const rots = [0, 1, 2, 3, 1, 0, 3, 2, 2, 3, 0, 1, 3, 2, 1, 0];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (r === 1 && c === 2) continue;
    cut(arrowPoly(120 + c * 100, 140 + r * 100, rots[r * 4 + c] * Math.PI / 2, 1.2), (r + c) % 2 ? PAL.cream : PAL.sky, { key: 'ar' + r + c, sb: 4, sy: 3, tear: 0.6, grain: 0.4 });
  }
  hero(320, 288, () => { paperDisc(320, 240, 48, PAL.yellow, 'ah', { crayon: PAL.mustard }); face(320, 244, 0.7, 'wow'); }, 56);
  impact(320, 284, 28);
  twinkle(496, 76, 16, p); twinkle(50, 512, 12, p, 0.4);
};

SCENES.gomoku = (p) => {
  world(PAL.lamp, { pat: pat.dots('rgba(255,255,255,0.18)', 4, 34) });
  cut(rect(40, 60, 460, 460, 14), PAL.wood, { key: 'gb', sb: 16, sy: 10, pat: pat.grainWood('rgba(100,60,25,0.3)'), crayon: PAL.woodL });
  for (let i = 0; i < 6; i++) { cut(rect(80 + i * 76 - 2.5, 100, 5, 380, 2), PAL.woodD, { key: 'gv' + i, shadow: false, tear: 0.4 }); cut(rect(80, 100 + i * 76 - 2.5, 380, 5, 2), PAL.woodD, { key: 'gh' + i, shadow: false, tear: 0.4 }); }
  const g = (i, j) => [80 + j * 76, 100 + i * 76];
  const st = (i, j, f, key) => paperDisc(...g(i, j), 33, f, key, { crayon: 'rgba(0,0,0,0.15)' });
  [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]].forEach(([i, j], k) => { if (k !== 2) st(i, j, COAL, 'gk' + k); });
  st(0, 3, CREAM, 'gw1'); st(3, 0, CREAM, 'gw2'); st(1, 4, CREAM, 'gw3'); st(4, 1, CREAM, 'gw4');
  stroke(g(0, 0), g(4, 4), 12, 'rgba(242,193,78,0.85)', 'gline', { shadow: false });
  const [fx, fy] = g(2, 2);
  hero(fx, fy + 33, () => { st(2, 2, COAL, 'gk2'); face(fx, fy + 2, 0.62, 'grin'); }, 56);
  impact(fx, fy + 30, 28);
  twinkle(500, 70, 16, p); twinkle(48, 530, 12, p, 0.5);
};

SCENES.reversi = (p) => {
  world(PAL.teal, { pat: pat.stripes('rgba(255,255,255,0.16)', 16, 46, -0.6) });
  cut(rect(50, 70, 440, 440, 16), PAL.green, { key: 'rb', sb: 16, sy: 10, crayon: PAL.greenD, crAl: 0.4 });
  for (let i = 1; i < 4; i++) { cut(rect(50 + i * 110 - 3, 80, 6, 420, 2), PAL.greenD, { key: 'rv' + i, shadow: false, tear: 0.5 }); cut(rect(60, 70 + i * 110 - 3, 420, 6, 2), PAL.greenD, { key: 'rh' + i, shadow: false, tear: 0.5 }); }
  const g = (i, j) => [105 + j * 110, 125 + i * 110];
  const st = (i, j, f, key) => paperDisc(...g(i, j), 40, f, key, { crayon: 'rgba(0,0,0,0.12)' });
  st(1, 1, CREAM, 'v1'); st(2, 2, CREAM, 'v2'); st(1, 2, COAL, 'v3'); st(2, 1, COAL, 'v4'); st(0, 0, COAL, 'v5'); st(3, 3, CREAM, 'v6');
  const k = Math.abs(Math.cos(p * Math.PI * 2)), [fx, fy] = g(0, 2);
  cut(ellipsePts(fx, fy, 40 * Math.max(0.12, k), 40, 0, 24), k > 0.5 ? CREAM : COAL, { key: 'flip', sb: 6, sy: 4, tear: 0.6, grain: 0.5 });
  face(...g(1, 1), 0.62, 'happy'); face(...g(2, 1), 0.62, 'wow');
  twinkle(496, 82, 15, p); twinkle(60, 514, 12, p, 0.4);
};

SCENES.chainreaction = (p) => {
  world(PAL.night, { pat: pat.dots('rgba(255,255,255,0.12)', 3, 28) });
  cut(rect(50, 70, 440, 440, 18), PAL.navy, { key: 'cb', sb: 16, sy: 10, crayon: '#3a4690' });
  for (let i = 1; i < 3; i++) { cut(rect(50 + i * 147 - 3, 80, 6, 420, 2), PAL.purple, { key: 'cv' + i, shadow: false, tear: 0.5 }); cut(rect(60, 70 + i * 147 - 3, 420, 6, 2), PAL.purple, { key: 'ch' + i, shadow: false, tear: 0.5 }); }
  const s = 1 + wave(p, 1, 0.1);
  paperStar(270, 290, 130 * s, PAL.yellow, 'boom', p * 0.3); paperStar(270, 290, 92 * s, '#ffe27a', 'boom2', -p * 0.3);
  critter(270, 290, 54, RED, 'wow', 'core', { fs: 0.8, crayon: REDD, hop: 40 });
  [[124, 144, PAL.blue, 40], [124, 436, PAL.blue, 30], [416, 144, PAL.green, 40], [416, 436, PAL.green, 40], [416, 290, PAL.green, 28], [270, 144, PAL.blue, 28]].forEach(([x, y, f, r], i) => paperDisc(x, y, r, f, 'o' + i, { crayon: 'rgba(0,0,0,0.15)' }));
  twinkle(500, 60, 15, p); twinkle(44, 516, 12, p, 0.5);
};

SCENES.blockade = (p) => {
  world(PAL.lamp, { pat: pat.stripes('rgba(255,255,255,0.14)', 16, 46, 0.3) });
  const x0 = 70, y0 = 90, s = 100;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cut(rect(x0 + c * s, y0 + r * s, s, s, 0), (r + c) % 2 ? PAL.wood : PAL.cream, { key: 'kb' + r + c, shadow: false, tear: 0.8, pat: (r + c) % 2 ? pat.grainWood('rgba(100,60,25,0.25)') : undefined });
  cut(rect(x0 - 6, y0 - 6, 412, 412, 4), 'rgba(0,0,0,0.001)', { key: 'kf', sb: 14, sy: 9, grain: false, shade: false, line: PAL.woodD, lw: 10 });
  slab(x0 + 80, y0 + 190, 220, 22, PAL.woodD, 'w1', { r: 10, sb: 5 }); slab(x0 + 280, y0 + 220, 22, 150, PAL.woodD, 'w2', { r: 10, sb: 5 });
  slab(x0 + 98, y0 + 20, 22, 140, PAL.woodD, 'w3', { r: 10, sb: 5 });
  const dash = Math.sin(Math.PI * p) * 150;   // runs along its row and back
  critter(x0 + 50 + dash, y0 + 350, 40, RED, 'grin', 'rr', { fs: 0.56, crayon: REDD });
  [0, 1, 2].forEach(i => dot(x0 + 130 + i * 36, y0 + 350, 6, GOLD));
  critter(x0 + 350, y0 + 50, 38, PAL.blue, 'smile', 'bb', { fs: 0.52, crayon: '#2f4a8a' });
  impact(x0 + 250, y0 + 350, 24);
  twinkle(486, 60, 15, p); twinkle(40, 506, 12, p, 0.5);
};

SCENES.orderchaos = (p) => {
  world(PAL.mint, { pat: pat.gingham('rgba(255,255,255,0.35)', 20) });
  cut(rect(50, 70, 440, 440, 16), PAL.paper, { key: 'ob', sb: 14, sy: 9, pat: pat.lines('rgba(76,111,181,0.14)', 36, 4) });
  for (let i = 1; i < 4; i++) { cut(rect(50 + i * 110 - 3, 80, 6, 420, 2), PAL.tweed, { key: 'ov' + i, shadow: false, tear: 0.5 }); cut(rect(60, 70 + i * 110 - 3, 420, 6, 2), PAL.tweed, { key: 'oh' + i, shadow: false, tear: 0.5 }); }
  const g = (i, j) => [105 + j * 110, 125 + i * 110];
  const O = (i, j, key) => { const [x, y] = g(i, j); paperDisc(x, y, 38, PAL.blue, key, { glint: false }); blob(x, y, 20, 20, PAL.paper, key + 'h', { shadow: false, tear: 0.5 }); };
  const X = (i, j, key) => { const [x, y] = g(i, j); stroke([x - 32, y - 32], [x + 32, y + 32], 18, RED, key + 'a', { sb: 4 }); stroke([x + 32, y - 32], [x - 32, y + 32], 18, RED, key + 'b', { sb: 4, shadow: false }); };
  [0, 2, 3].forEach(i => O(i, i, 'oo' + i)); X(0, 2, 'x1'); X(2, 0, 'x2'); X(1, 3, 'x3'); X(3, 1, 'x4');
  stroke(g(0, 0), g(3, 3), 10, 'rgba(242,193,78,0.9)', 'ow', { shadow: false });
  const [fx, fy] = g(1, 1);
  hero(fx, fy + 38, () => { O(1, 1, 'oo1'); face(fx, fy, 0.7, 'smug'); }, 56);
  impact(fx, fy + 34, 28);
  twinkle(496, 60, 15, p); twinkle(44, 516, 12, p, 0.5);
};
