// CUT PAPER scenes — reflex and skill games, part two.

function ghostShape(x, y, s, fill, key, mood = 'happy') {
  const P = [[x - 50 * s, y + 50 * s], [x - 50 * s, y - 10 * s], ...arcPts(x, y - 10 * s, 50 * s, Math.PI, TAU, 12), [x + 50 * s, y + 50 * s], [x + 25 * s, y + 30 * s], [x, y + 50 * s], [x - 25 * s, y + 30 * s]];
  cut(P, fill, { key, sb: 8, sy: 5, crayon: 'rgba(255,255,255,0.25)' });
  face(x, y - 4 * s, 0.7 * s, mood);
}

SCENES.snake = (p) => {
  world(PAL.mint, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  slab(40, 50, 460, 460, PAL.green, 'bd', { r: 22, sb: 14, sy: 9, pat: pat.gingham('rgba(255,255,255,0.1)', 30), crayon: PAL.greenD });
  ink([[100, 450], [300, 450], [300, 290], [170, 290], [170, 150], [380, 150]], { w: 70, color: '#8ed47c', amt: 1.2, key: 'body' });
  ink([[100, 450], [300, 450], [300, 290], [170, 290], [170, 150], [380, 150]], { w: 12, color: PAL.greenD, amt: 1.2, key: 'stripe' });
  hero(410, 204, () => {
    blob(410, 150, 62, 54, '#8ed47c', 'head', { crayon: PAL.greenD }); face(412, 150, 0.95, 'wow');
    cut([[460, 150], [500, 138], [492, 158]], RED, { key: 'tongue', shadow: false, tear: 0.4 });
  }, 44);
  hero(430, 446, () => { paperDisc(430, 410, 36, RED, 'apple', { crayon: REDD }); stroke([430, 380], [444, 356], 8, PAL.wood, 'stem', { shadow: false }); }, 56, 0.08);
  impact(430, 440, 26);
  twinkle(80, 90, 15, p); twinkle(480, 60, 12, p, 0.5);
};

SCENES.tron = (p) => {
  world(PAL.night, { pat: pat.dots('rgba(255,255,255,0.12)', 3, 28) });
  slab(40, 50, 460, 460, '#141c40', 'bd', { r: 22, sb: 14, sy: 9, crayon: '#3a4690' });
  for (let i = 1; i < 4; i++) { stroke([60, 50 + i * 115], [480, 50 + i * 115], 4, '#3a4690', 'gh' + i, { shadow: false }); stroke([40 + i * 115, 70], [40 + i * 115, 490], 4, '#3a4690', 'gv' + i, { shadow: false }); }
  ink([[80, 440], [80, 340], [250, 340], [250, 190], [380, 190]], { w: 36, color: PAL.sky, amt: 0.8, key: 't1' }); ink([[460, 100], [460, 250], [340, 250], [340, 400], [180, 400]], { w: 36, color: '#f08a4e', amt: 0.8, key: 't2' });
  const d = Math.sin(Math.PI * p) * 120;   // both cycles dash along their trails
  slab(380 - d, 160, 90, 62, PAL.sky, 'c1', { r: 22 }); face(430 - d, 192, 0.6, 'grin');
  slab(110 + d, 372, 90, 62, '#f08a4e', 'c2', { r: 22 });
  impact(250, 190, 26);
  twinkle(490, 60, 14, p); twinkle(50, 500, 12, p, 0.5);
};

SCENES.sumo = (p) => {
  world(PAL.mustard, { pat: pat.stripes('rgba(255,255,255,0.2)', 20, 60, -0.4) });
  blob(270, 400, 240, 100, PAL.wood, 'dojo', { crayon: PAL.woodL, sb: 14, sy: 9 }); blob(270, 392, 200, 76, CREAM, 'ring', { shadow: false, tear: 1.0 });
  const d = Math.sin(Math.PI * p) * 70;   // the red wrestler charges
  critter(190 + d, 270, 100, RED, 'grin', 's1', { fs: 1.4, crayon: REDD }); critter(360 + d * 0.4, 280, 86, PAL.blue, 'wow', 's2', { fs: 1.2, crayon: '#2f4a8a' });
  ink([[262 + d, 220], [286 + d, 250], [262 + d, 280]], { w: 12, color: GOLD, amt: 0.4, key: 'imp' });
  impact(300 + d, 250, 34);
  paperStar(480, 70, 26, PAL.yellow, 'st', p * 0.4); twinkle(60, 100, 14, p);
};

SCENES.spaceduel = (p) => {
  world(PAL.night, { pat: pat.dots('rgba(255,255,255,0.18)', 3, 22) });
  const R = RNG('sdsky'); for (let i = 0; i < 12; i++) dot(R.r(20, 520), R.r(20, 520), R.r(1.5, 3.5), 'rgba(255,255,255,0.9)');
  paperDisc(270, 290, 112, '#f08a4e', 'planet', { crayon: '#c4542e', glint: false }); ink([[170, 270], [270, 310], [370, 260]], { w: 12, color: '#c4542e', amt: 0.8, key: 'pb1' }); ink([[180, 340], [270, 355], [370, 330]], { w: 12, color: '#c4542e', amt: 0.8, key: 'pb2' });
  face(270, 296, 1.5, 'wow');
  const ship = (x, y, a, fill, key) => { ctx.save(); ctx.translate(x, y); ctx.rotate(a); cut([[-50, -34], [50, 0], [-50, 34], [-30, 0]], fill, { key, sb: 8, sy: 5 }); dot(-6, 0, 10, '#fff'); ctx.restore(); };
  const sw = Math.sin(Math.PI * p);
  ship(100 + sw * 120, 110 + sw * 70, 0.5 + wave(p, 1, 0.08), PAL.sky, 's1'); ship(440 - sw * 120, 460 - sw * 70, Math.PI + 0.4 + wave(p, 1, 0.08), PAL.pink, 's2');
  impact(235, 200, 28);
  stroke([150, 135], [220, 200], 10, GOLD, 'beam', { shadow: false });
  twinkle(480, 80, 15, p); twinkle(60, 480, 12, p, 0.5);
};

SCENES.paint = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const v = c + (4 - r), f = v < 4 ? '#e8645e' : v > 4 ? PAL.blue : CREAM;
    cut(rect(50 + c * 88, 60 + r * 88, 88, 88, 0), f, { key: 'pt' + r + c, shadow: false, tear: 0.9, crayon: 'rgba(255,255,255,0.2)' });
  }
  cut(rect(46, 56, 448, 448, 6), 'rgba(0,0,0,0.001)', { key: 'pf', sb: 14, sy: 9, grain: false, shade: false, line: PAL.charcoal, lw: 10 });
  const d = Math.sin(Math.PI * p) * 100;
  critter(170 + d, 390, 50, '#f08a4e', 'grin', 'p1', { fs: 0.8 }); critter(380 - d, 170, 50, PAL.purple, 'smile', 'p2', { fs: 0.8, crayon: '#5f4fb0' });
  [[110, 120, 14], [430, 440, 16], [250, 250, 12]].forEach(([x, y, r], i) => paperDisc(x, y, r, '#fff', 'sp' + i, { glint: false, cut: { shadow: false } }));
  twinkle(490, 40, 14, p);
};

SCENES.pacmac = (p) => {
  world(PAL.navy, { pat: pat.dots('rgba(255,255,255,0.14)', 3, 26) });
  slab(40, 50, 460, 440, '#141c40', 'mz', { r: 22, sb: 14, sy: 9 });
  [[[90, 130], [230, 130]], [[310, 130], [450, 130]], [[90, 410], [230, 410]], [[310, 410], [450, 410]], [[160, 200], [160, 340]], [[380, 200], [380, 340]], [[230, 270], [310, 270]]].forEach(([a, b], i) => stroke(a, b, 22, PAL.blue, 'w' + i, { shadow: false }));
  const eaten = 130 + Math.sin(Math.PI * p) * 180;
  [0, 1, 2, 3, 4].forEach(i => { if (110 + i * 70 > eaten + 20) dot(110 + i * 70, 270, 7, '#ffe9a8'); });
  const px = 130 + Math.sin(Math.PI * p) * 180, m = 0.1 + 0.28 * Math.abs(Math.sin(p * Math.PI * 4));   // chomps along the dots toward the ghost
  cut([[px, 270], ...arcPts(px, 270, 62, m * Math.PI, TAU - m * Math.PI, 18)], PAL.yellow, { key: 'pac', sb: 8, sy: 5, crayon: PAL.mustard }); dot(px + 16, 244, 9, COAL);
  impact(px + 66, 270, 30);
  ghostShape(380, 270, 0.9, RED, 'g1', 'wow'); ghostShape(430, 410, 0.6, PAL.pink, 'g2', 'happy');
  twinkle(480, 60, 14, p);
};

SCENES.minesweeper = (p) => {
  world(PAL.mustard, { pat: pat.dots('rgba(255,255,255,0.25)', 4, 30) });
  const cols = [PAL.blue, PAL.green, RED, PAL.blue];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const open = (r + c) % 3 !== 0 && !(r === 3 && c === 3);
    slab(46 + c * 115, 56 + r * 115, 108, 108, open ? CREAM : PAL.grey, 'mt' + r + c, { r: 14, sb: 5, sy: 4, crayon: open ? undefined : 'rgba(255,255,255,0.25)' });
  }
  letters('1', 46 + 115 * 1 + 54, 56 + 54 + 0, 60, PAL.blue, 'n1', { w: 11 }); letters('2', 46 + 115 * 2 + 54, 56 + 115 + 54, 60, PAL.green, 'n2', { w: 11 }); letters('3', 100, 56 + 345 - 8 + 8 - 115 * 0 - 8 + 1, 60, RED, 'n3', { w: 11 }); letters('1', 46 + 115 * 3 + 54, 56 + 54, 60, PAL.blue, 'n4', { w: 11 });
  ctx.save(); ctx.translate(100, 112); ctx.rotate(wave(p, 1, 0.1));
  stroke([0, 40], [0, -34], 8, COAL, 'pole', { shadow: false }); cut([[0, -34], [46, -16], [0, 4]], RED, { key: 'flag', sb: 4, sy: 3 });
  ctx.restore();
  critter(46 + 115 * 3 + 54, 56 + 115 * 3 + 54, 40, COAL, 'wow', 'mine', { fs: 0.6, hop: 58 });
  impact(46 + 115 * 3 + 54, 56 + 115 * 3 + 80, 30);
  twinkle(490, 40, 14, p);
};

SCENES.airhockey = (p) => {
  world(PAL.sky, { pat: pat.stripes('rgba(255,255,255,0.3)', 22, 62, 0.5) });
  slab(80, 40, 380, 460, CREAM, 'rink', { r: 70, sb: 16, sy: 10, crayon: '#cfe2ee', crAl: 0.3 });
  ink([[90, 270], [450, 270]], { w: 8, color: PAL.blue, amt: 0.6, key: 'mid' }); ink(arcPts(270, 270, 62, 0, TAU, 22), { w: 8, color: PAL.blue, amt: 0.6, key: 'circ' });
  slab(190, 28, 160, 24, COAL, 'g1', { r: 10 }); slab(190, 488, 160, 24, COAL, 'g2', { r: 10 });
  const d = Math.sin(Math.PI * p) * 44;
  critter(240 + d, 130, 56, PAL.blue, 'grin', 'm1', { fs: 0.85, crayon: '#2f4a8a' }); critter(300 - d, 410, 56, RED, 'focus', 'm2', { fs: 0.85, crayon: REDD });
  paperDisc(270, 270 - Math.sin(Math.PI * p) * 120, 28, COAL, 'puck', { crayon: PAL.charcoal });
  impact(272, 178, 28);
  twinkle(60, 60, 14, p); twinkle(490, 480, 12, p, 0.5);
};
