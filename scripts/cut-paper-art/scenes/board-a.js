// CUT PAPER scenes — classic board games, part one.

SCENES.tictactoe = (p) => {
  world(PAL.mint, { pat: pat.dots('rgba(255,255,255,0.4)', 5, 34) });
  const bx = 270, by = 296, a = -0.035, cell = (i, j) => pt([bx + (j - 1) * 118, by + (i - 1) * 118], bx, by, a);
  cut(rot(rect(bx - 190, by - 190, 380, 380, 16), bx, by, a), PAL.paper, { key: 'ttb', sb: 16, sy: 9, pat: pat.lines('rgba(76,111,181,0.18)', 30) });
  [-1, 1].forEach((k, i) => {
    cut(rot(rect(bx + k * 59 - 5, by - 168, 10, 336, 4), bx, by, a), PAL.woodD, { key: 'ttv' + i, shadow: false, tear: 0.6 });
    cut(rot(rect(bx - 168, by + k * 59 - 5, 336, 10, 4), bx, by, a), PAL.woodD, { key: 'tth' + i, shadow: false, tear: 0.6 });
  });
  const X = (c, key) => { const [x, y] = cell(...c); stroke([x - 34, y - 34], [x + 34, y + 34], 20, RED, key + 'a', { sb: 4 }); stroke([x + 34, y - 34], [x - 34, y + 34], 20, RED, key + 'b', { sb: 4, shadow: false }); };
  const O = (c, key) => { const [x, y] = cell(...c); paperDisc(x, y, 44, PAL.blue, key, { glint: false }); blob(x, y, 24, 24, PAL.paper, key + 'h', { shadow: false, tear: 0.6, pat: pat.lines('rgba(76,111,181,0.18)', 30) }); };
  O([0, 2], 'o1'); O([2, 0], 'o2'); O([1, 2], 'o3'); X([0, 0], 'x1'); X([1, 1], 'x2'); X([2, 2], 'x3');
  stroke(pt([bx - 150, by - 150], bx, by, a), pt([bx + 150, by + 150], bx, by, a), 9, GOLD, 'ttw', { shadow: false });
  // a pencil that has done the drawing
  const py = wave(p, 1, 7);
  ctx.save(); ctx.translate(452, 160 + py); ctx.rotate(0.5 + wave(p, 1, 0.05));
  cut(rect(-26, -120, 52, 190, 8), PAL.yellow, { key: 'pen', sb: 8, sy: 5, pat: pat.stripes('rgba(180,120,20,0.35)', 6, 17, Math.PI / 2) });
  cut([[-26, 70], [26, 70], [0, 118]], PAL.skin1, { key: 'pt', shadow: false });
  cut([[-9, 100], [9, 100], [0, 118]], COAL, { key: 'pt2', shadow: false });
  cut(rect(-26, -150, 52, 36, 10), PAL.pink, { key: 'pe', sb: 4 });
  face(0, -38, 0.7, 'happy');
  ctx.restore();
  twinkle(88, 84, 16, p); twinkle(470, 470, 12, p, 0.5);
};

SCENES.sim = (p) => {
  world(PAL.sky, { pat: pat.stripes('rgba(255,255,255,0.28)', 26, 70, 0.4) });
  cut(rect(46, 56, 448, 448, 18), PAL.wood, { key: 'cork', sb: 16, sy: 10, pat: pat.dots('rgba(120,70,30,0.35)', 3, 15), crayon: PAL.woodL });
  const C = [270, 280], R = 150, N = [];
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * TAU / 6; N.push([C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R]); }
  const E = [[0, 2, 'r'], [2, 4, 'r'], [4, 0, 'r'], [1, 3, 'b'], [3, 5, 'b'], [5, 1, 'b'], [0, 3, 'r'], [1, 4, 'b']];
  E.forEach(([a, b, c], i) => yarn(N[a][0], N[a][1], N[b][0], N[b][1], c === 'r' ? RED : PAL.blue, 9, 'ye' + i));
  [[0, 1], [1, 2], [2, 3]].forEach(([a, b], i) => yarn(N[a][0], N[a][1], N[b][0], N[b][1], 'rgba(255,255,255,0.55)', 5, 'yd' + i));
  const bounce = hopY(p, 14, 2);
  N.forEach(([x, y], i) => paperDisc(x, y + (i === 0 ? bounce : 0), 30, [PAL.yellow, PAL.paper, PAL.paper, PAL.paper, PAL.paper, PAL.paper][i], 'pin' + i, { crayon: 'rgba(0,0,0,0.12)' }));
  face(N[0][0], N[0][1] + bounce + 2, 0.72, 'wow');
  face(N[3][0], N[3][1], 0.62, 'happy');
  twinkle(440, 96, 14, p); confetti(7, [60, 60, 480, 500], [PAL.pink, PAL.mint, PAL.yellow], 'simcf', 8);
};

SCENES.chomp = (p) => {
  world(PAL.pinkL, { pat: pat.gingham('rgba(255,255,255,0.35)', 22) });
  ground(430, PAL.wood, { pat: pat.grainWood('rgba(100,60,25,0.3)') });
  const cs = 66, x0 = 80, y0 = 92;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    if ((r === 3 && c >= 3) || (r === 2 && c === 4)) continue;
    const poison = r === 0 && c === 0;
    slab(x0 + c * cs, y0 + r * cs, cs - 4, cs - 4, poison ? PAL.green : '#7a4a2b', 'cb' + r + c, { r: 7, sb: 5, sy: 3, pat: poison ? undefined : pat.lines('rgba(255,220,170,0.22)', 20, 6), crayon: poison ? PAL.greenD : '#5a3520' });
  }
  face(x0 + 31, y0 + 33, 0.62, 'sad');
  // crumbs
  const R = RNG('crumbs');
  for (let i = 0; i < 6; i++) blob(330 + R.n(60), 290 + R.n(40), 7, 5, '#7a4a2b', 'cr' + i, { sb: 2, sy: 2, sx: 1, grain: 0.1 });
  // the chomper
  const open = 0.55 + 0.45 * Math.abs(wave(p, 1, 1, 0.25));
  const cx = 380, cy = 380;
  blob(cx, cy, 86, 78, PAL.purple, 'chomper', { crayon: '#5f4fb0', sy: 8 });
  ctx.save(); ctx.fillStyle = COAL; ctx.beginPath(); ctx.ellipse(cx - 6, cy + 24, 44, 14 + 26 * open, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8707a'; ctx.beginPath(); ctx.ellipse(cx - 6, cy + 38, 26, 8 * open + 4, 0, 0, TAU); ctx.fill(); ctx.restore();
  [[-34, -34], [20, -40]].forEach(([dx, dy], i) => { paperDisc(cx + dx, cy + dy, 17, PAL.paper, 'ce' + i, { glint: false }); dot(cx + dx + 3, cy + dy + 1, 7, PAL.ink); });
  [[-32, 4], [18, 4]].forEach(([dx, dy], i) => cut([[cx + dx - 8, cy + dy], [cx + dx + 8, cy + dy], [cx + dx, cy + dy + 15]], '#fffaf0', { key: 'ct' + i, shadow: false, tear: 0.4 }));
  paperStar(80, 60, 20, PAL.yellow, 'cs1', 0.2); twinkle(470, 80, 14, p);
};

SCENES.breakthrough = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.4)', 6, 38) });
  cloud(110, 70, 0.8); cloud(430, 50, 0.7, 'clb');
  const x0 = 70, y0 = 110, s = 100;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cut(rect(x0 + c * s, y0 + r * s, s, s, 0), (r + c) % 2 ? PAL.wood : PAL.cream, { key: 'bt' + r + c, shadow: false, tear: 0.8, pat: (r + c) % 2 ? pat.grainWood('rgba(100,60,25,0.25)') : undefined });
  cut(rect(x0 - 6, y0 - 6, 412, 412, 4), 'rgba(0,0,0,0.001)', { key: 'btf', sb: 14, sy: 9, grain: false, shade: false, line: PAL.woodD, lw: 10 });
  const pawn = (x, y, fill, key, mood) => {
    blob(x, y, 32, 12, fill, key + 'b', { sb: 4, sy: 3 });
    cut([[x - 22, y], [x - 12, y - 42], [x + 12, y - 42], [x + 22, y]], fill, { key: key + 'c', sb: 3, sy: 3, shadow: false });
    paperDisc(x, y - 56, 22, fill, key + 'h', { glint: false });
    if (mood) face(x, y - 56, 0.5, mood);
  };
  [0, 1, 2, 3].forEach(c => pawn(x0 + c * s + 50, y0 + 74, PAL.blue, 'pb' + c, 'smile'));
  [0, 3].forEach(c => pawn(x0 + c * s + 50, y0 + 374, RED, 'pr' + c));
  const y = hopY(p, 36, 2);
  pawn(x0 + 2 * s + 50, y0 + 274 + y, RED, 'prh', 'happy');
  paperStar(470, 96, 24, PAL.yellow, 'bs1', p * 0.4); twinkle(60, 480, 14, p, 0.3);
};

SCENES.ataxx = (p) => {
  world(PAL.mint, { pat: pat.stripes('rgba(255,255,255,0.3)', 24, 60, -0.5) });
  cut(rect(50, 80, 440, 440, 18), PAL.teal, { key: 'ab', sb: 16, sy: 10, crayon: '#2f857f' });
  for (let i = 1; i < 5; i++) {
    cut(rect(50 + i * 88 - 3, 90, 6, 420, 2), '#2f857f', { key: 'av' + i, shadow: false, tear: 0.5 });
    cut(rect(60, 80 + i * 88 - 3, 420, 6, 2), '#2f857f', { key: 'ah' + i, shadow: false, tear: 0.5 });
  }
  const g = (i, j) => [94 + j * 88, 124 + i * 88];
  const put = (i, j, fill, mood, key, r = 34) => { const [x, y] = g(i, j); critter(x, y, r, fill, mood, key, { fs: 0.56, crayon: 'rgba(0,0,0,0.18)' }); };
  put(0, 0, PAL.blue, 'smile', 'a1'); put(0, 1, PAL.blue, 'happy', 'a2'); put(1, 0, PAL.blue, 'wow', 'a3'); put(1, 1, PAL.blue, 'smile', 'a4');
  put(4, 4, RED, 'happy', 'a5'); put(3, 4, RED, 'wow', 'a6'); put(4, 3, RED, 'smile', 'a7');
  const s = 1 + wave(p, 1, 0.06);
  const [mx, my] = g(2, 2), [nx, ny] = g(2, 3);
  critter(mx, my, 38 * s, RED, 'happy', 'a8', { fs: 0.66, crayon: 'rgba(0,0,0,0.18)' });
  ink([[mx + 36, my - 30], [(mx + nx) / 2, my - 62 + wave(p, 1, 4)], [nx - 30, ny - 30]], { w: 7, color: GOLD, amt: 0.5, key: 'arc' });
  critter(nx, ny, 34 * (2 - s), RED, 'grin', 'a9', { fs: 0.56, crayon: 'rgba(0,0,0,0.18)' });
  twinkle(496, 70, 15, p); twinkle(40, 500, 12, p, 0.5);
};

SCENES.kamisado = (p) => {
  world(PAL.lamp, { pat: pat.dots('rgba(255,255,255,0.2)', 5, 36) });
  const cols = [PAL.yellow, PAL.blue, PAL.pink, PAL.purple, PAL.green, PAL.mustard, PAL.skin2, PAL.teal, PAL.pinkL, PAL.sky, PAL.mint, PAL.brick, PAL.paper, PAL.lamp, PAL.wood, '#d98a4e'];
  const x0 = 80, y0 = 120, s = 95;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cut(rect(x0 + c * s, y0 + r * s, s, s, 0), cols[(r * 5 + c * 3) % cols.length], { key: 'kt' + r + c, shadow: false, tear: 0.8, crayon: 'rgba(255,255,255,0.25)' });
  cut(rect(x0 - 6, y0 - 6, 392, 392, 4), 'rgba(0,0,0,0.001)', { key: 'kf', sb: 14, sy: 9, grain: false, shade: false, line: PAL.charcoal, lw: 10 });
  const tower = (c, r, body, cap, key, lift = 0) => pillar(x0 + c * s + 47, y0 + r * s + 82 + lift, 54, 78, body, cap, key);
  tower(0, 3, COAL, PAL.yellow, 'kt1'); tower(1, 3, COAL, PAL.blue, 'kt2'); tower(3, 3, COAL, PAL.pink, 'kt3'); tower(2, 0, CREAM, PAL.purple, 'kt4'); tower(0, 0, CREAM, PAL.green, 'kt5');
  const hy = hopY(p, 34, 2);
  tower(2, 2, CREAM, PAL.mustard, 'kth', hy);
  face(x0 + 2 * s + 47, y0 + 2 * s + 38 + hy, 0.58, 'happy');
  twinkle(468, 80, 16, p); twinkle(60, 70, 12, p, 0.4);
};

SCENES.onitama = (p) => {
  world(PAL.navy, { pat: pat.dots('rgba(255,255,255,0.12)', 3, 30) });
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; [[70, 70], [460, 110], [400, 52], [120, 150]].forEach(([x, y], i) => { ctx.beginPath(); ctx.arc(x, y, 3 + (i % 2), 0, TAU); ctx.fill(); });
  paperDisc(440, 100, 44, PAL.paper, 'moon', { glint: false });
  person(270, 258 + wave(p, 1, 4), 0.78, { key: 'sensei', shirt: RED, skin: PAL.skin1, hair: '#2b211d', mood: 'smile' });
  cut(rot(rect(160, 150, 220, 26, 8), 270, 162, 0), RED, { key: 'band', sb: 4, sy: 3, pat: pat.stripes('rgba(255,255,255,0.18)', 4, 20, 0.8) });
  cut([[372, 160], [440, 182], [376, 186]], RED, { key: 'bandtail1', sb: 3, shadow: false }); cut([[372, 166], [430, 214], [372, 190]], REDD, { key: 'bandtail2', shadow: false });
  const card = (x, y, a, dots, tone, key) => {
    cut(rot(rect(x - 78, y - 100, 156, 200, 14), x, y, a), PAL.paper, { key, sb: 12, sy: 8, pat: pat.lines('rgba(76,111,181,0.12)', 28) });
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const on = dots.some(([dx, dy]) => dx === c - 2 && dy === r - 2), mid = r === 2 && c === 2;
      const q = pt([x - 52 + c * 26, y - 40 + r * 26], x, y, a);
      cut(rot(rect(q[0] - 10, q[1] - 10, 20, 20, 3), q[0], q[1], a), mid ? COAL : on ? tone : 'rgba(120,100,80,0.18)', { key: key + r + c, shadow: false, tear: 0.3, grain: 0.1, shade: false });
    }
  };
  card(150, 430, -0.22, [[0, -1], [-1, 1], [1, 1]], RED, 'cd1'); card(390, 430, 0.2, [[-1, -1], [1, -1], [0, 1], [0, 2 - 2]], PAL.blue, 'cd2');
  twinkle(80, 300, 15, p); twinkle(480, 300, 12, p, 0.5);
};

SCENES.quarto = (p) => {
  world(PAL.mustard, { pat: pat.stripes('rgba(255,255,255,0.22)', 22, 64, 0.3) });
  cut(rot(rect(66, 270, 408, 220, 14), 270, 380, 0), PAL.wood, { key: 'qb', sb: 14, sy: 9, pat: pat.grainWood('rgba(100,60,25,0.3)'), crayon: PAL.woodL });
  [1, 2, 3].forEach(i => cut(rect(66 + i * 102 - 3, 270, 6, 220, 2), PAL.woodD, { key: 'qv' + i, shadow: false, tear: 0.5 }));
  [1].forEach(i => cut(rect(66, 270 + i * 110 - 3, 408, 6, 2), PAL.woodD, { key: 'qh' + i, shadow: false, tear: 0.5 }));
  const sq = (x, y, w, h, fill, key, hole) => { slab(x - w / 2, y - h, w, h, fill, key, { r: 6, sb: 5, sy: 3 }); if (hole) blob(x, y - h + 8, w * 0.28, 5, COAL, key + 'h', { shadow: false, tear: 0.3 }); };
  const rd = (x, y, w, h, fill, key, hole) => { slab(x - w / 2, y - h, w, h, fill, key, { r: w / 2, sb: 5, sy: 3 }); if (hole) blob(x, y - h + 10, w * 0.28, 5, COAL, key + 'h', { shadow: false, tear: 0.3 }); };
  rd(118, 336, 46, 96, PAL.woodD, 'q1', true); sq(220, 330, 56, 56, CREAM, 'q2'); sq(322, 340, 56, 100, PAL.woodD, 'q3', true); rd(422, 336, 52, 50, CREAM, 'q4');
  sq(118, 456, 56, 50, CREAM, 'q5', true); rd(220, 458, 46, 100, CREAM, 'q6'); rd(322, 456, 52, 52, PAL.woodD, 'q7'); sq(422, 462, 54, 104, CREAM, 'q8', true);
  const y = wave(p, 1, 9);
  sq(270, 212 + y, 66, 120, CREAM, 'qh', true);
  face(270, 160 + y, 0.62, 'wow');
  cut(capsulePts(222, 56, 262, 100 + y, 40), PAL.skin1, { key: 'qhand', sb: 6, sy: 4 });
  twinkle(100, 120, 16, p); twinkle(440, 150, 12, p, 0.5);
};

SCENES.santorini = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 36) });
  paperDisc(440, 100, 50, PAL.yellow, 'sun', { glint: false }); face(440, 104, 0.6, 'happy');
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + p * 0.3; stroke([440 + Math.cos(a) * 64, 100 + Math.sin(a) * 64], [440 + Math.cos(a) * 84, 100 + Math.sin(a) * 84], 12, PAL.yellow, 'sr' + i, { shadow: false }); }
  cloud(110, 90, 0.9); cloud(300, 160, 0.6, 'clb');
  ground(420, PAL.teal, { pat: pat.lines('rgba(255,255,255,0.3)', 24, 10), crayon: '#2f857f' });
  blob(270, 430, 250, 60, PAL.skin1, 'isle', { sb: 10, sy: 6, crayon: PAL.skin2 });
  slab(100, 330, 340, 90, CREAM, 't1', { r: 10, pat: pat.lines('rgba(120,100,80,0.18)', 30) });
  slab(150, 250, 240, 84, '#fffaf0', 't2', { r: 10, pat: pat.lines('rgba(120,100,80,0.18)', 28) });
  slab(200, 178, 140, 76, PAL.paper, 't3', { r: 10 });
  cut([[210, 178], [330, 178], [330, 150], [270, 120], [210, 150]].map(([x, y]) => [x, y]), PAL.blue, { key: 'dome', sb: 6, sy: 4 });
  cut(ellipsePts(270, 178, 60, 14, 0, 20, Math.PI, TAU), PAL.blue, { key: 'dome2', shadow: false });
  cut(rect(255, 184, 30, 40, 14), COAL, { key: 'door', shadow: false });
  critter(150, 312 + hopY(p, 30, 2), 36, PAL.pink, 'grin', 'bld', { fs: 0.46 });
  critter(370, 232 + wave(p, 1, 5), 32, PAL.purple, 'wow', 'bld2', { fs: 0.42 });
  twinkle(60, 200, 14, p);
};

SCENES.loa = (p) => {
  world(PAL.lamp, { pat: pat.stripes('rgba(255,255,255,0.14)', 18, 52, -0.4) });
  cut(rect(50, 70, 440, 440, 16), PAL.wood, { key: 'lb', sb: 16, sy: 10, pat: pat.grainWood('rgba(100,60,25,0.3)'), crayon: PAL.woodL });
  for (let i = 1; i < 5; i++) { cut(rect(50 + i * 88 - 3, 80, 6, 420, 2), PAL.woodD, { key: 'lv' + i, shadow: false, tear: 0.5 }); cut(rect(60, 70 + i * 88 - 3, 420, 6, 2), PAL.woodD, { key: 'lh' + i, shadow: false, tear: 0.5 }); }
  const g = (i, j) => [94 + j * 88, 114 + i * 88];
  const stone = (i, j, fill, key) => { const [x, y] = g(i, j); paperDisc(x, y, 34, fill, key, { crayon: 'rgba(0,0,0,0.15)' }); };
  stone(0, 0, COAL, 's1'); stone(2, 0, COAL, 's2'); stone(1, 4, COAL, 's3'); stone(1, 2, COAL, 's4'); stone(4, 3, CREAM, 's5'); stone(4, 2, CREAM, 's6'); stone(4, 4, CREAM, 's7'); stone(3, 0, CREAM, 's8');
  const [x1, y1] = g(1, 0), [x2] = g(1, 1);
  [0, 1, 2, 3].forEach(i => dot(x1 + 80 + i * 40, y1, 5, GOLD));
  const dx = Math.abs(wave(p, 1, 1, 0.25)) * 30;
  paperDisc(x1 + dx, y1, 40, CREAM, 'sm', { crayon: 'rgba(0,0,0,0.12)' }); face(x1 + dx, y1 + 2, 0.66, 'grin');
  twinkle(500, 60, 14, p); twinkle(50, 520, 12, p, 0.5);
};
