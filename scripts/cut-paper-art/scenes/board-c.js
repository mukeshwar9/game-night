// CUT PAPER scenes — board games part three and the memory games.

SCENES.hex = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 36) });
  cut([[40, 150], [250, 50], [320, 100], [110, 200]], RED, { key: 'hr1', sb: 8, sy: 5 });
  cut([[220, 430], [430, 330], [500, 380], [290, 480]], RED, { key: 'hr2', sb: 8, sy: 5 });
  cut([[40, 150], [110, 200], [290, 480], [220, 430]], PAL.blue, { key: 'hb1', sb: 8, sy: 5 });
  cut([[250, 50], [320, 100], [500, 380], [430, 330]], PAL.blue, { key: 'hb2', sb: 8, sy: 5 });
  const st = { '0,0': RED, '1,1': RED, '2,1': RED, '3,2': RED, '1,2': PAL.blue, '2,3': PAL.blue, '0,2': PAL.blue };
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x = 160 + c * 78 + r * 38, y = 135 + r * 70;
    cut(hexPoly(x, y, 42), PAL.cream, { key: 'hx' + r + c, sb: 4, sy: 3, tear: 0.7, grain: 0.4 });
    if (st[r + ',' + c]) paperDisc(x, y, 27, st[r + ',' + c], 'hs' + r + c, { crayon: 'rgba(0,0,0,0.12)' });
  }
  const y = hopY(p, 22, 2);
  critter(160 + 3 * 78 + 76 - 78 + 0, 135 + 2 * 70 + y, 28, RED, 'grin', 'hc', { fs: 0.45, crayon: REDD });
  cloud(120, 70, 0.6); twinkle(480, 80, 15, p);
};

SCENES.battleship = (p) => {
  world(PAL.sky, { pat: pat.stripes('rgba(255,255,255,0.3)', 22, 64, 0.2) });
  paperDisc(110, 100, 46, PAL.yellow, 'sun', { glint: false }); cloud(380, 90, 0.8);
  ground(300, PAL.teal, { pat: pat.lines('rgba(255,255,255,0.28)', 26, 8), crayon: '#2f857f' });
  ground(400, PAL.blue, { pat: pat.lines('rgba(255,255,255,0.22)', 26, 14), crayon: '#2d4a8a' });
  const y = wave(p, 1, 7), sx = 150, sy = 300 + y;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(wave(p, 1, 0.03));
  cut([[0, 0], [230, 0], [200, 70], [30, 70]], PAL.charcoal, { key: 'hull', sb: 8, sy: 5, pat: pat.stripes('rgba(255,255,255,0.12)', 5, 30, Math.PI / 2) });
  cut(rect(40, -50, 120, 56, 10), PAL.grey, { key: 'cab', sb: 6, sy: 4 });
  cut(rect(78, -96, 36, 52, 8), RED, { key: 'fun', sb: 5, sy: 4 });
  cut(rect(138, -26, 70, 18, 9), COAL, { key: 'gun', sb: 4, sy: 3 });
  face(100, -20, 0.7, 'wow');
  ctx.restore();
  paperStar(450, 250, 70, PAL.orange, 'boom1', p * 0.4); paperStar(450, 250, 42, PAL.yellow, 'boom2', -p * 0.4);
  [0, 1, 2].forEach(i => paperDisc(446 + i * 14, 168 - i * 38 - (p * 30) % 30, 20 - i * 3, PAL.grey, 'smoke' + i, { glint: false, cut: { shadow: false } }));
  [[70, 450], [200, 470], [420, 440], [330, 490]].forEach(([x, yy], i) => stroke([x - 36, yy], [x + 36, yy], 8, 'rgba(255,255,255,0.5)', 'wv' + i, { shadow: false }));
  twinkle(60, 230, 14, p);
};

SCENES.faceoff = (p) => {
  world(PAL.purple, { pat: pat.dots('rgba(255,255,255,0.2)', 4, 32) });
  const head = (x, y, hair, beard, key) => {
    paperDisc(x, y, 38, PAL.skin1, key, { glint: false, crayon: PAL.skin2, cut: { shadow: false } });
    cut(ellipsePts(x, y - 14, 40, 22, 0, 18, Math.PI, TAU), hair, { key: key + 'h', shadow: false, tear: 0.5 });
    if (beard) cut([[x - 30, y + 6], [x - 18, y + 44], [x + 18, y + 44], [x + 30, y + 6], [x, y + 24]], hair, { key: key + 'b', shadow: false, tear: 0.5 });
    dot(x - 14, y, 5); dot(x + 14, y, 5);
    ink(arcPts(x, y + 14, 12, 0.3, Math.PI - 0.3, 8), { w: 4, color: COAL, amt: 0.3, key: key + 'm' });
  };
  const faceCard = (x, y, fill, hair, beard, key) => { card(x, y, 138, 176, 0, fill, key); head(x, y + 6, hair, beard, key + 'f'); };
  const backCard = (x, y, key) => { card(x, y, 138, 176, 0, PAL.blue, key, { pat: pat.dots('rgba(255,255,255,0.3)', 6, 26) }); paperDisc(x, y, 34, PAL.navy, key + 'q', { glint: false, cut: { shadow: false } }); };
  faceCard(96, 160, PAL.cream, '#5a3a24', true, 'f1'); backCard(270, 160, 'f2'); faceCard(444, 160, PAL.cream, GOLD, false, 'f3');
  backCard(96, 380, 'f4'); card(270, 380 + hopY(p, 14, 2), 138, 176, 0, PAL.yellow, 'f5'); head(270, 386 + hopY(p, 14, 2), RED, false, 'f5f'); faceCard(444, 380, PAL.cream, COAL, true, 'f6');
  twinkle(500, 60, 15, p); twinkle(40, 510, 12, p, 0.5);
};

SCENES.mancala = (p) => {
  world(PAL.mustard, { pat: pat.stripes('rgba(255,255,255,0.2)', 20, 58, -0.3) });
  slab(30, 150, 480, 260, PAL.wood, 'mb', { r: 80, sb: 16, sy: 10, pat: pat.grainWood('rgba(100,60,25,0.3)'), crayon: PAL.woodL });
  slab(54, 178, 72, 204, PAL.woodD, 'ms1', { r: 36, shadow: false }); slab(414, 178, 72, 204, PAL.woodD, 'ms2', { r: 36, shadow: false });
  const seeds = [PAL.pink, PAL.sky, PAL.yellow, PAL.mint, PAL.purple, RED];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) {
    const x = 180 + c * 60, y = 215 + r * 100;
    blob(x, y, 28, 32, PAL.woodD, 'mp' + c + r, { shadow: false, tear: 0.6, crayon: '#5a3a24' });
    [[-6, -6], [8, 4], [-4, 10]].slice(0, 1 + ((c + r * 2) % 3)).forEach(([dx, dy], i) => paperDisc(x + dx, y + dy, 9, seeds[(c * 2 + r + i) % 6], 'sd' + c + r + i, { glint: false, cut: { sb: 2, sy: 2 } }));
  }
  [0, 1, 2, 3].forEach(i => paperDisc(90 + (i % 2) * 16, 230 + i * 18, 11, seeds[i], 'ss' + i, { glint: false, cut: { sb: 2, sy: 2 } }));
  [0, 1, 2].forEach(i => paperDisc(450 + (i % 2) * 16, 240 + i * 22, 11, seeds[i + 3], 'st' + i, { glint: false, cut: { sb: 2, sy: 2 } }));
  critter(270, 92 + hopY(p, 30, 2), 44, PAL.yellow, 'grin', 'mc', { fs: 0.68, crayon: PAL.mustard });
  twinkle(80, 90, 15, p); twinkle(470, 90, 12, p, 0.5);
};

SCENES.checkers = (p) => {
  world(PAL.lamp, { pat: pat.stripes('rgba(255,255,255,0.14)', 16, 46, 0.5) });
  const x0 = 50, y0 = 70, s = 88;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) cut(rect(x0 + c * s, y0 + r * s, s, s, 0), (r + c) % 2 ? PAL.woodD : PAL.cream, { key: 'ck' + r + c, shadow: false, tear: 0.8 });
  cut(rect(x0 - 6, y0 - 6, 452, 452, 4), 'rgba(0,0,0,0.001)', { key: 'cf', sb: 14, sy: 9, grain: false, shade: false, line: PAL.charcoal, lw: 10 });
  const g = (i, j) => [x0 + j * s + 44, y0 + i * s + 44];
  const ch = (i, j, f, key) => paperDisc(...g(i, j), 34, f, key, { crayon: 'rgba(0,0,0,0.15)' });
  ch(1, 3, COAL, 'k1'); ch(1, 1, COAL, 'k2'); ch(0, 4, COAL, 'k3'); ch(4, 0, RED, 'k4'); ch(4, 2, RED, 'k5'); ch(3, 1, RED, 'k6');
  const [a, b] = [g(3, 1), g(1, 3)];
  stroke([a[0] + 40, a[1] - 40], [b[0] - 40, b[1] + 40], 6, 'rgba(242,193,78,0.0)', 'kd', { shadow: false });
  [0, 1].forEach(i => dot(a[0] + 56 + i * 28, a[1] - 56 - i * 28, 6, GOLD));
  const [mx, my] = g(2, 2), y = hopY(p, 30, 2);
  paperDisc(mx, my + y, 40, RED, 'kk', { crayon: REDD });
  cut([[mx - 22, my + y - 36], [mx - 14, my + y - 62], [mx, my + y - 44], [mx + 14, my + y - 62], [mx + 22, my + y - 36]], GOLD, { key: 'kcrown', sb: 4, sy: 3 });
  face(mx, my + y + 2, 0.6, 'grin');
  twinkle(496, 54, 15, p);
};

SCENES.lanterns = (p) => {
  world(PAL.night, { pat: pat.dots('rgba(255,255,255,0.18)', 3, 24) });
  paperDisc(440, 90, 36, PAL.cream, 'moon', { glint: false });
  ink([[-10, 80], [270, 150], [550, 80]], { w: 5, color: PAL.mustard, amt: 0.4, key: 'str' });
  const lan = (x, y, fill, mood, key, ph) => {
    ctx.save(); ctx.translate(x, y - 60); ctx.rotate(wave(p, 1, 0.09, ph)); ctx.translate(-x, -(y - 60));
    cut(rect(x - 20, y - 20, 40, 18, 5), PAL.mustard, { key: key + 't', sb: 3, sy: 3 });
    cut(ellipsePts(x, y + 40, 52, 62, 0, 28), fill, { key: key + 'b', sb: 10, sy: 6, crayon: 'rgba(255,255,255,0.3)', pat: pat.stripes('rgba(255,255,255,0.18)', 5, 22, Math.PI / 2) });
    cut(rect(x - 22, y + 96, 44, 16, 5), PAL.mustard, { key: key + 'c', sb: 3, sy: 3 });
    face(x, y + 42, 0.85, mood);
    ctx.restore();
  };
  lan(110, 120, RED, 'happy', 'l1', 0); lan(270, 148, PAL.yellow, 'grin', 'l2', 0.3); lan(430, 120, PAL.pink, 'wow', 'l3', 0.6);
  card(130, 440, 110, 140, -0.14, CREAM, 'lc1'); paperDisc(130, 440, 26, RED, 'lcd1', { glint: false, cut: { shadow: false } });
  card(410, 440, 110, 140, 0.14, CREAM, 'lc2'); paperDisc(410, 440, 26, PAL.blue, 'lcd2', { glint: false, cut: { shadow: false } });
  twinkle(60, 300, 14, p); twinkle(490, 300, 12, p, 0.5);
};

SCENES.hunch = (p) => {
  world(PAL.teal, { pat: pat.gingham('rgba(255,255,255,0.18)', 22) });
  card(140, 330, 170, 236, -0.22, CREAM, 'h1'); pips(140, 330, 3, 36, 14, RED, 'hp1');
  card(400, 330, 170, 236, 0.22, CREAM, 'h3'); pips(400, 330, 6, 32, 12, PAL.blue, 'hp3');
  const y = wave(p, 1, 8);
  card(270, 270 + y, 190, 260, 0, PAL.paper, 'h2'); pips(270, 230 + y, 4, 38, 14, PAL.green, 'hp2');
  face(270, 340 + y, 0.9, 'focus');
  cut(capsulePts(270, 440 + y, 270, 392 + y, 34), PAL.skin2, { key: 'finger', sb: 5, sy: 3 });
  paperStar(480, 80, 24, PAL.yellow, 'hs', p * 0.4); twinkle(60, 100, 15, p);
};

SCENES.simon = (p) => {
  world(PAL.navy, { pat: pat.dots('rgba(255,255,255,0.14)', 3, 28) });
  const c = [270, 270], R = 200;
  const quad = (a0, fill, key, lit) => cut([[...c], ...arcPts(c[0], c[1], R, a0, a0 + Math.PI / 2, 14)], fill, { key, sb: 12, sy: 8, crayon: 'rgba(255,255,255,0.25)', grain: lit ? 0.3 : 1 });
  quad(Math.PI, PAL.green, 'qg'); quad(Math.PI * 1.5, RED, 'qr', true); quad(0, PAL.blue, 'qb'); quad(Math.PI * 0.5, PAL.yellow, 'qy');
  const k = 0.5 + 0.5 * wave(p, 1, 1, 0.25);
  ctx.save(); ctx.globalAlpha = 0.18 + 0.2 * k; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(...c); ctx.arc(c[0], c[1], R - 6, Math.PI * 1.5, Math.PI * 2); ctx.closePath(); ctx.fill(); ctx.restore();
  [[0, -1], [-1, 0], [1, 0], [0, 1]].forEach(([dx, dy], i) => stroke([c[0] + dx * 8, c[1] + dy * 8], [c[0] + dx * R, c[1] + dy * R], 10, PAL.night, 'sep' + i, { shadow: false }));
  paperDisc(270, 270, 62, PAL.charcoal, 'hub', { glint: false });
  face(270, 272 + wave(p, 1, 2), 0.95, 'grin');
  twinkle(60, 60, 15, p); twinkle(490, 490, 13, p, 0.5);
};

SCENES.chimp = (p) => {
  world(PAL.purple, { pat: pat.stripes('rgba(255,255,255,0.15)', 18, 52, -0.3) });
  card(110, 110, 120, 120, -0.1, PAL.yellow, 'c1'); pips(110, 110, 1, 0, 24, COAL, 'cp1');
  card(430, 110, 120, 120, 0.1, CREAM, 'c2'); pips(430, 110, 2, 26, 15, COAL, 'cp2');
  card(440, 420, 120, 120, -0.1, CREAM, 'c3'); pips(440, 420, 3, 26, 12, COAL, 'cp3');
  const y = wave(p, 1, 6), cx = 240, cy = 340 + y;
  blob(cx - 118, cy, 36, 36, PAL.wood, 'ear1', {}); blob(cx + 118, cy, 36, 36, PAL.wood, 'ear2', {});
  blob(cx - 118, cy, 20, 20, PAL.skin2, 'ei1', { shadow: false }); blob(cx + 118, cy, 20, 20, PAL.skin2, 'ei2', { shadow: false });
  blob(cx, cy, 128, 124, PAL.woodD, 'head', { crayon: '#6a3f1f', sb: 12, sy: 8 });
  blob(cx, cy + 30, 78, 64, PAL.skin1, 'muz', { shadow: false });
  face(cx, cy + 4, 1.45, 'grin');
  twinkle(60, 480, 15, p); twinkle(490, 250, 13, p, 0.5);
};

SCENES.numbermemory = (p) => {
  world(PAL.mustard, { pat: pat.dots('rgba(255,255,255,0.25)', 4, 30) });
  slab(50, 70, 440, 300, PAL.charcoal, 'mon', { r: 24, sb: 14, sy: 9 });
  slab(76, 96, 388, 232, PAL.night, 'scr', { r: 12, shadow: false, crayon: '#2a3070' });
  [8, 3, 9, 1, 5].forEach((n, i) => digit7(140 + i * 66, 192, 92, n, i === 4 ? PAL.yellow : '#7be08a', 'dg' + i));
  slab(110, 288, 320, 18, '#26315f', 'bar', { r: 9, shadow: false }); slab(110, 288, 130 + 70 * Math.abs(wave(p, 1, 1, 0.25)), 18, PAL.yellow, 'barf', { r: 9, shadow: false });
  slab(236, 370, 68, 44, PAL.grey, 'stand', { r: 6 }); slab(170, 410, 200, 34, PAL.charcoal, 'base', { r: 14 });
  critter(430, 450 + hopY(p, 14, 2), 42, PAL.pink, 'wow', 'nc', { fs: 0.62 });
  twinkle(80, 480, 15, p); twinkle(480, 60, 13, p, 0.5);
};

SCENES.visualmemory = (p) => {
  world(PAL.purple, { pat: pat.dots('rgba(255,255,255,0.22)', 4, 30) });
  slab(46, 66, 448, 448, PAL.navy, 'vb', { r: 22, sb: 16, sy: 10, crayon: '#3a4690' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const lit = (r === 0 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 0);
    slab(70 + c * 142, 90 + r * 142, 130, 130, lit ? PAL.yellow : PAL.blue, 'vt' + r + c, { r: 16, sb: 5, sy: 4, crayon: lit ? PAL.mustard : '#34548f' });
  }
  const k = wave(p, 1, 6);
  face(70 + 142 + 65, 90 + 65 + k, 0.95, 'wow'); face(70 + 284 + 65, 90 + 142 + 65 - k, 0.95, 'happy'); face(70 + 65, 90 + 284 + 65, 0.95, 'smile');
  twinkle(496, 56, 15, p); twinkle(46, 520, 13, p, 0.5);
};

SCENES.pairs = (p) => {
  world(PAL.pinkL, { pat: pat.gingham('rgba(255,255,255,0.4)', 24) });
  const back = (x, y, key) => { card(x, y, 140, 180, 0, PAL.blue, key, { pat: pat.dots('rgba(255,255,255,0.28)', 6, 26) }); paperStar(x, y, 38, 'rgba(255,255,255,0.7)', key + 's'); };
  const heart = (x, y, s, key, fill = RED) => { cut(rot([[x, y + 34 * s], [x - 40 * s, y - 2 * s], [x - 36 * s, y - 28 * s], [x - 12 * s, y - 34 * s], [x, y - 16 * s], [x + 12 * s, y - 34 * s], [x + 36 * s, y - 28 * s], [x + 40 * s, y - 2 * s]], x, y, 0), fill, { key, shadow: false, tear: 0.6 }); };
  const jy = hopY(p, 18, 2);
  back(100, 150, 'pa'); back(270, 150, 'pb'); card(440, 150 + jy, 140, 180, 0, CREAM, 'pc'); heart(440, 150 + jy, 1.1, 'ph1'); face(440, 150 + jy - 4, 0.7, 'happy');
  back(100, 380, 'pd'); card(270, 380 + jy, 140, 180, 0, CREAM, 'pe'); heart(270, 380 + jy, 1.1, 'ph2'); face(270, 380 + jy - 4, 0.7, 'happy'); back(440, 380, 'pf');
  twinkle(496, 56, 15, p); twinkle(46, 520, 13, p, 0.5);
};
