// CUT PAPER scenes — reflex and skill games, part three.

SCENES.bonkbuggies = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  cloud(110, 80, 0.8); paperDisc(450, 80, 40, PAL.yellow, 'sun', { glint: false });
  ground(380, PAL.mustard, { pat: pat.dots('rgba(255,255,255,0.2)', 4, 26), crayon: PAL.skin2 });
  const d = wave(p, 1, 10);
  const buggy = (x, fill, helm, key, mood, dir) => {
    slab(x - 80, 300, 160, 70, fill, key + 'b', { r: 28, crayon: 'rgba(0,0,0,0.12)' });
    [-48, 48].forEach((dx, i) => paperDisc(x + dx, 380, 34, COAL, key + 'w' + i, { glint: false }));
    paperDisc(x, 240, 54, helm, key + 'h', { crayon: 'rgba(0,0,0,0.1)' }); face(x, 244, 0.85, mood);
  };
  buggy(130 + d, RED, PAL.yellow, 'b1', 'grin', 1); buggy(410 - d, PAL.blue, PAL.sky, 'b2', 'wow', -1);
  paperStar(270, 300, 52, PAL.yellow, 'bonk', p * 0.3); paperStar(270, 300, 30, '#fff', 'bonk2', -p * 0.3);
  twinkle(60, 200, 14, p);
};

SCENES.quiver = (p) => {
  world(PAL.mint, { pat: pat.stripes('rgba(255,255,255,0.3)', 22, 62, 0.5) });
  ctx.save(); ctx.translate(270, 290); ctx.rotate(p * TAU * 0.25);
  [[210, RED], [160, CREAM], [112, RED], [66, CREAM], [30, GOLD]].forEach(([r, f], i) => paperDisc(0, 0, r, f, 'q' + i, { glint: false }));
  ctx.restore();
  face(270, 292, 0.8, 'wow');
  [[70, 90, 230, 250], [470, 100, 330, 240], [90, 480, 220, 340]].forEach(([x, y, tx, ty], i) => {
    const k = 1 - 0.06 * Math.abs(wave(p, 1, 1, i * 0.3));
    const ex = tx + (x - tx) * 0.0, ey = ty;
    stroke([x, y], [tx, ty], 10, PAL.woodD, 'sh' + i, { shadow: false }); dot(tx, ty, 8, COAL);
    cut(rot([[-20, -16], [20, 0], [-20, 16], [-8, 0]].map(([u, v]) => [x + u, y + v]), x, y, Math.atan2(ty - y, tx - x)), PAL.green, { key: 'fl' + i, sb: 4, sy: 3 });
  });
  twinkle(490, 40, 14, p); twinkle(50, 330, 12, p, 0.5);
};

SCENES.fenderbender = (p) => {
  world(PAL.mustard, { pat: pat.stripes('rgba(255,255,255,0.2)', 20, 60, 0.4) });
  slab(30, 120, 480, 300, PAL.charcoal, 'road', { r: 30, sb: 14, sy: 9 });
  [0, 1, 2, 3, 4].forEach(i => slab(60 + i * 96, 262, 60, 14, GOLD, 'dash' + i, { r: 5, shadow: false }));
  const car = (x, y, a, fill, key, mood) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    slab(-92, -56, 184, 112, fill, key + 'b', { r: 40, crayon: 'rgba(0,0,0,0.12)' }); slab(-24, -42, 80, 84, PAL.sky, key + 'w', { r: 22, shadow: false });
    [[-60, -66], [38, -66], [-60, 52], [38, 52]].forEach(([dx, dy], i) => slab(dx, dy, 34, 20, COAL, key + 't' + i, { r: 8, shadow: false }));
    ctx.restore();
    face(x, y, 0.8, mood);
  };
  const d = Math.abs(wave(p, 1, 1, 0.25)) * 12;
  car(160 + d, 270, -0.15, RED, 'c1', 'grin'); car(390 - d, 262, Math.PI + 0.1, PAL.blue, 'c2', 'wow');
  paperStar(275, 268, 56, PAL.yellow, 'boom', p * 0.3); paperStar(275, 268, 32, '#fff', 'boom2', -p * 0.3);
  twinkle(60, 60, 14, p); twinkle(480, 480, 12, p, 0.5);
};

SCENES.artillery = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  paperDisc(460, 80, 40, PAL.yellow, 'sun', { glint: false }); cloud(130, 80, 0.8);
  cut([[-30, 600], [-30, 400], [100, 330], [240, 400], [300, 600]], PAL.green, { key: 'h1', sb: 10, sy: 6, tear: 2, crayon: PAL.greenD });
  cut([[300, 600], [330, 420], [440, 330], [570, 380], [570, 600]], PAL.greenD, { key: 'h2', sb: 10, sy: 6, tear: 2, crayon: '#2c5e38' });
  ctx.save(); ctx.translate(130, 330); ctx.rotate(-0.5 + wave(p, 1, 0.07));
  cut(rect(0, -24, 150, 48, 22), COAL, { key: 'barrel', sb: 8, sy: 5 });
  ctx.restore();
  paperDisc(120, 370, 60, PAL.grey, 'cb', { crayon: PAL.charcoal }); face(120, 372, 0.9, 'grin');
  ink(arcPts(260, 360, 150, Math.PI * 1.15, Math.PI * 1.85, 20, 1.05), { w: 8, color: 'rgba(255,255,255,0.9)', amt: 0.5, key: 'arc' });
  paperDisc(270, 190 + wave(p, 1, 8), 26, COAL, 'ball', { crayon: PAL.charcoal });
  [[420, 60, RED], [420, 38, CREAM], [420, 18, RED]].forEach(([x, y, f], i) => paperDisc(430, 380, 52 - i * 18, f, 'tg' + i, { glint: false }));
  twinkle(60, 200, 14, p);
};

SCENES.darts = (p) => {
  world(PAL.purple, { pat: pat.dots('rgba(255,255,255,0.2)', 4, 30) });
  const c = [250, 290], R = 210;
  paperDisc(c[0], c[1], R + 20, COAL, 'rim', { glint: false });
  for (let i = 0; i < 8; i++) cut([[...c], ...arcPts(c[0], c[1], R, i * Math.PI / 4, (i + 1) * Math.PI / 4, 8)], i % 2 ? CREAM : PAL.green, { key: 'sg' + i, shadow: false, tear: 0.8 });
  paperDisc(250, 290, 100, RED, 'r2', { glint: false, cut: { shadow: false } }); paperDisc(250, 290, 52, CREAM, 'r3', { glint: false, cut: { shadow: false } });
  face(250, 292, 0.85, 'focus');
  const d = Math.abs(wave(p, 1, 1, 0.25)) * 14;
  ctx.save(); ctx.translate(380 + d, 160 - d); ctx.rotate(0.8);
  stroke([-120, 0], [10, 0], 14, PAL.sky, 'dart', { sb: 5 }); cut([[-120, 0], [-150, -26], [-90, -8]], RED, { key: 'f1', shadow: false }); cut([[-120, 0], [-150, 26], [-90, 8]], RED, { key: 'f2', shadow: false });
  ctx.restore();
  twinkle(490, 480, 15, p); twinkle(50, 50, 12, p, 0.5);
};

SCENES.animalstack = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  cloud(420, 90, 0.8); cloud(110, 130, 0.6, 'clb');
  slab(60, 470, 420, 50, PAL.wood, 'base', { r: 16, pat: pat.grainWood('rgba(100,60,25,0.3)') });
  const sw = wave(p, 1, 6);
  slab(120, 360, 300, 112, PAL.pink, 'a1', { r: 50, crayon: PAL.pinkL }); face(270, 420, 1.1, 'grin');
  slab(160, 258, 220, 104, PAL.sky, 'a2', { r: 44, crayon: '#a9c8dc' }); face(270, 308, 0.9, 'happy');
  slab(200 + sw, 168, 140, 92, PAL.mint, 'a3', { r: 40 });
  blob(270 + sw, 100, 64, 60, PAL.yellow, 'cat', { crayon: PAL.mustard }); cut([[222 + sw, 70], [214 + sw, 20], [256 + sw, 54]], PAL.yellow, { key: 'e1', shadow: false }); cut([[318 + sw, 70], [326 + sw, 20], [284 + sw, 54]], PAL.yellow, { key: 'e2', shadow: false });
  face(270 + sw, 104, 0.9, 'wow');
  twinkle(60, 300, 14, p); twinkle(490, 300, 12, p, 0.5);
};

SCENES.birdseye = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  paperDisc(440, 80, 42, PAL.yellow, 'sun', { glint: false }); cloud(150, 90, 0.7);
  ground(420, PAL.green, { pat: pat.stripes('rgba(255,255,255,0.12)', 10, 36, 0.6), crayon: PAL.greenD });
  stroke([110, 480], [110, 330], 26, PAL.woodD, 'sl1', { crayon: PAL.wood }); stroke([110, 330], [60, 260], 18, PAL.woodD, 'sl2'); stroke([110, 330], [170, 260], 18, PAL.woodD, 'sl3');
  ink([[60, 260], [100, 320], [170, 260]], { w: 8, color: RED, amt: 0.5, key: 'band' });
  const d = Math.abs(wave(p, 1, 1, 0.25)) * 20;
  blob(130 + d, 300, 62, 54, RED, 'bird', { crayon: REDD }); cut([[184 + d, 290], [226 + d, 302], [184 + d, 318]], PAL.yellow, { key: 'beak', shadow: false }); cut([[80 + d, 280], [40 + d, 250], [100 + d, 262]], REDD, { key: 'tail', shadow: false });
  face(126 + d, 296, 0.9, 'grin');
  ink(arcPts(300, 330, 150, Math.PI * 1.15, Math.PI * 1.85, 20, 1.2), { w: 8, color: 'rgba(255,255,255,0.9)', amt: 0.5, key: 'arc' });
  slab(400, 350, 90, 90, PAL.tan, 'box', { r: 10, pat: pat.grainWood('rgba(100,60,25,0.3)') }); critter(445, 330 + wave(p, 1, 4), 36, PAL.lamp, 'wow', 'pig', { fs: 0.6 });
  twinkle(60, 190, 14, p);
};

SCENES.wirecrossed = (p) => {
  world(PAL.navy, { pat: pat.dots('rgba(255,255,255,0.14)', 3, 26) });
  slab(40, 60, 310, 250, PAL.charcoal, 'bomb', { r: 30, sb: 14, sy: 9 }); slab(66, 86, 258, 110, PAL.night, 'scr', { r: 14, shadow: false, crayon: '#2a3070' });
  const k = 0.7 + 0.3 * Math.abs(wave(p, 1, 1, 0.25));
  [['0', 96], [':', 140], ['0', 172], ['7', 244]].forEach(([ch, x], i) => letters(ch, x, 140, 70, RED, 'dg' + i, { w: 12 * k }));
  [[100, RED], [180, PAL.blue], [260, GOLD]].forEach(([x, c], i) => ink([[x, 310], [x + 14, 380], [x + 60 - i * 10, 430]], { w: 16, color: c, amt: 1.0, key: 'wr' + i }));
  face(195, 250, 0.7, 'wow');
  card(430, 380, 150, 170, 0.14, CREAM, 'man'); [0, 1, 2].forEach(i => stroke([382, 340 + i * 36], [470 - i * 14, 340 + i * 36], 10, 'rgba(100,80,60,0.45)', 'ml' + i, { shadow: false }));
  ctx.save(); ctx.translate(430, 150); ctx.rotate(wave(p, 1, 0.12));
  stroke([-30, 80], [14, -30], 14, PAL.grey, 'sc1', { sb: 4 }); stroke([30, 80], [-14, -30], 14, PAL.grey, 'sc2', { sb: 4 }); paperDisc(-26, 90, 26, RED, 'h1', { glint: false }); paperDisc(26, 90, 26, RED, 'h2', { glint: false });
  ctx.restore();
  twinkle(60, 480, 14, p);
};

SCENES.lazysusan = (p) => {
  world(PAL.pinkL, { pat: pat.gingham('rgba(255,255,255,0.4)', 24) });
  paperDisc(270, 290, 240, PAL.wood, 'table', { glint: false, crayon: PAL.woodL });
  ctx.save(); ctx.translate(270, 290); ctx.rotate(p * TAU * 0.25);
  paperDisc(0, 0, 200, CREAM, 'plate', { glint: false, cut: { shadow: false } });
  [[0, -120, PAL.pink], [104, 60, '#f08a4e'], [-104, 60, PAL.lamp]].forEach(([x, y, f], i) => { blob(x, y, 56, 40, f, 'su' + i, { sb: 4, sy: 3 }); blob(x, y - 6, 40, 14, '#fffaf0', 'ri' + i, { shadow: false, tear: 0.4 }); });
  ctx.restore();
  paperDisc(270, 290, 52, PAL.woodD, 'hub', { glint: false }); face(270, 292, 0.85, 'grin');
  critter(450, 90 + hopY(p, 14, 2), 44, RED, 'wow', 'eater', { fs: 0.7 });
  twinkle(60, 60, 14, p); twinkle(480, 470, 12, p, 0.5);
};
