// CUT PAPER scenes — reflex and skill games, part one.

SCENES.reaction = (p) => {
  world(PAL.navy, { pat: pat.stripes('rgba(255,255,255,0.1)', 18, 52, 0.5) });
  const bolt = (x, y, s, fill, key) => cut([[x, y - 60 * s], [x - 40 * s, y + 10 * s], [x - 6 * s, y + 6 * s], [x - 22 * s, y + 70 * s], [x + 36 * s, y - 14 * s], [x + 4 * s, y - 10 * s]], fill, { key, sb: 6, sy: 4, tear: 0.7 });
  bolt(440, 140, 1.1, GOLD, 'b1'); bolt(100, 100, 0.7, GOLD, 'b2');
  slab(60, 380, 420, 100, PAL.charcoal, 'base', { r: 30, sb: 14, sy: 9 }); slab(110, 350, 320, 60, PAL.grey, 'rim', { r: 26 });
  const sq = Math.sin(Math.PI * p) * 70;   // the button is slammed down on the beat
  cut([[130, 370], [150, 250 + sq], [200, 210 + sq], [340, 210 + sq], [390, 250 + sq], [410, 370]], RED, { key: 'btn', sb: 10, sy: 7, crayon: REDD });
  blob(270, 250 + sq, 120, 46, '#ef7f78', 'btop', { shadow: false, tear: 0.8 });
  face(270, 300 + sq, 1.5, 'wow');
  letters('GO', 120, 220, 70, GOLD, 'go', { w: 14 });
  impact(270, 215, 36);
  twinkle(480, 60, 15, p); twinkle(50, 420, 12, p, 0.5);
};

SCENES.aim = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  [[250, RED], [190, CREAM], [128, RED], [66, CREAM]].forEach(([r, f], i) => paperDisc(250, 290, r, f, 'ring' + i, { glint: false, crayon: 'rgba(0,0,0,0.08)' }));
  face(250, 292, 0.9, 'wow');
  const a = p * TAU, e = Math.min(1, Math.sin(Math.PI * p) * 1.2);   // the crosshair swoops onto the bullseye
  ctx.save(); ctx.translate(lerp(410, 250, e), lerp(120, 290, e)); ctx.rotate(a);
  ink(arcPts(0, 0, 66, 0, TAU, 24), { w: 8, color: PAL.blue, amt: 0.5, key: 'cross' });
  [[0, -92, 0, -44], [0, 44, 0, 92], [-92, 0, -44, 0], [44, 0, 92, 0]].forEach(([x1, y1, x2, y2], i) => ink([[x1, y1], [x2, y2]], { w: 8, color: PAL.blue, amt: 0.4, key: 'cr' + i }));
  ctx.restore();
  impact(250, 290, 40);
  paperDisc(90, 100, 40, GOLD, 'b1', { crayon: 'rgba(0,0,0,0.1)' }); paperDisc(450, 460, 34, PAL.pink, 'b2', { crayon: 'rgba(0,0,0,0.1)' });
  twinkle(60, 440, 14, p);
};

SCENES.chopchop = (p) => {
  world(PAL.purple, { pat: pat.stripes('rgba(255,255,255,0.14)', 18, 52, 0.4) });
  ground(450, PAL.woodD, { pat: pat.grainWood('rgba(255,220,170,0.15)') });
  const crate = (x, y, key, mood) => { slab(x, y, 150, 130, PAL.wood, key, { r: 10, pat: pat.grainWood('rgba(100,60,25,0.35)'), crayon: PAL.woodL }); stroke([x + 10, y + 10], [x + 140, y + 120], 12, PAL.woodD, key + 'a', { shadow: false }); stroke([x + 140, y + 10], [x + 10, y + 120], 12, PAL.woodD, key + 'b', { shadow: false }); };
  crate(70, 320, 'c1'); crate(300, 320, 'c2');
  hero(270, 330, () => { slab(185, 190, 170, 140, PAL.tweed, 'c3', { r: 10, crayon: PAL.wood }); face(270, 262, 1.3, 'wow'); }, 74);
  impact(270, 326, 32);
  const k = Math.abs(wave(p, 1, 1, 0.25));
  stroke([30, 110], [510, 110], 18 + 4 * k, 'rgba(217,82,78,0.85)', 'beam', { shadow: false });
  stroke([30, 110], [510, 110], 6, '#ffd6d2', 'beam2', { shadow: false });
  slab(10, 80, 40, 60, COAL, 'em1', { r: 8 }); slab(490, 80, 40, 60, COAL, 'em2', { r: 8 });
  twinkle(120, 200, 14, p); twinkle(430, 220, 12, p, 0.5);
};

SCENES.bamboozle = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  paperDisc(100, 90, 44, PAL.yellow, 'sun', { glint: false }); cloud(380, 90, 0.8);
  ground(340, PAL.green, { pat: pat.stripes('rgba(255,255,255,0.12)', 10, 36, 0.6), crayon: PAL.greenD }); ground(450, PAL.greenD, { crayon: '#2c5e38' });
  const s = 1 + wave(p, 2, 0.04);
  cut([[90, 430], [70, 330], [130, 240], [250, 210], [370, 250], [420, 340], [400, 430]], PAL.grey, { key: 'rock', sb: 12, sy: 8, crayon: PAL.charcoal, crAl: 0.35 });
  blob(200, 262, 60, 24, '#b4aeb9', 'rockhi', { shadow: false, tear: 0.8 });
  face(250, 340, 1.5 * s, 'smug');
  impact(300, 300, 30);
  ctx.save(); ctx.translate(480, 470); ctx.rotate(-0.4 + wave(p, 1, 0.35));
  cut([[-18, 0], [18, 0], [30, -250], [-6, -250]], PAL.wood, { key: 'bat', sb: 8, sy: 5, crayon: PAL.woodL });
  ctx.restore();
  blob(110, 470, 50, 14, 'rgba(255,255,255,0.7)', 'dust1', { shadow: false }); blob(420, 482, 60, 12, 'rgba(255,255,255,0.7)', 'dust2', { shadow: false });
  twinkle(60, 230, 14, p);
};

SCENES.typing = (p) => {
  world(PAL.purple, { pat: pat.dots('rgba(255,255,255,0.2)', 4, 30) });
  slab(46, 44, 448, 260, PAL.charcoal, 'mon', { r: 24, sb: 14, sy: 9 }); slab(72, 70, 396, 208, PAL.night, 'scr', { r: 12, shadow: false, crayon: '#2a3070' });
  letters('THE', 138, 134, 54, '#7be08a', 'th'); letters('QUICK', 352, 134, 50, GOLD, 'qk');
  slab(96, 220, 348, 24, '#26315f', 'bar', { r: 12, shadow: false }); slab(96, 220, 150 + 120 * Math.abs(wave(p, 1, 1, 0.25)), 24, '#7be08a', 'barf', { r: 12, shadow: false });
  slab(40, 330, 460, 160, PAL.grey, 'kb', { r: 26, sb: 12, sy: 8 });
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) slab(62 + c * 72, 350 + r * 54 + (r === 0 && c === 3 ? 18 * Math.sin(Math.PI * p) : 0), 62, 44, CREAM, 'k' + r + c, { r: 10, sb: 3, sy: 3 });
  slab(120, 450, 300, 28, CREAM, 'space', { r: 10, sb: 3, sy: 3 });
  face(470, 300, 0.6, 'grin');
  impact(62 + 3 * 72 + 31, 346, 22);
  twinkle(490, 40, 14, p);
};

SCENES.math = (p) => {
  world(PAL.mustard, { pat: pat.stripes('rgba(255,255,255,0.2)', 20, 60, -0.4) });
  slab(36, 60, 468, 330, PAL.lamp, 'bd', { r: 14, sb: 14, sy: 9, crayon: '#58b08a', crAl: 0.2 });
  cut(rect(36, 60, 468, 330, 14), 'rgba(0,0,0,0.001)', { key: 'bdf', shadow: false, grain: false, shade: false, line: PAL.woodD, lw: 18 });
  letters('7X8=', 160, 190, 84, CREAM, 'eq', { w: 14 });
  hero(392, 240, () => letters('56', 392, 190, 84, GOLD, 'ans', { w: 14 }), 44);
  impact(392, 160, 30);
  ink([[90, 290], [270, 296], [450, 286]], { w: 8, color: 'rgba(255,255,255,0.5)', amt: 0.8, key: 'dsh' });
  slab(80, 410, 220, 24, PAL.paper, 'chalk', { r: 10 });
  critter(420, 450, 56, PAL.sky, 'grin', 'mc', { fs: 0.85, hop: 40 });
  twinkle(60, 40, 15, p); twinkle(490, 480, 12, p, 0.5);
};

SCENES.updraft = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  [[100, 450, 1.0], [400, 330, 1.0], [130, 200, 0.9], [380, 90, 0.9]].forEach(([x, y, s], i) => cloud(x, y + wave(p, 1, 3, i * 0.2), s, 'cl' + i));
  critter(400, 270, 48, RED, 'grin', 'jp', { fs: 0.72, crayon: REDD, hop: 68 });
  ink([[170, 430], [270, 380], [360, 310]], { w: 10, color: 'rgba(255,255,255,0.8)', amt: 0.5, key: 'tr1' }); ink([[380, 240], [260, 230], [170, 180]], { w: 10, color: 'rgba(255,255,255,0.8)', amt: 0.5, key: 'tr2' });
  impact(400, 330, 28);
  paperStar(270, 50, 28, PAL.yellow, 'st', p * 0.5); twinkle(480, 450, 15, p); twinkle(40, 320, 12, p, 0.5);
};

SCENES.pong = (p) => {
  world(PAL.teal, { pat: pat.stripes('rgba(255,255,255,0.16)', 18, 52, 0.3) });
  slab(40, 60, 460, 330, PAL.charcoal, 'tv', { r: 56, sb: 16, sy: 10, crayon: PAL.grey, crAl: 0.2 }); slab(78, 98, 384, 254, PAL.night, 'scr', { r: 34, shadow: false, crayon: '#2a3070' });
  for (let i = 0; i < 6; i++) slab(262, 116 + i * 38, 16, 24, '#3a4690', 'net' + i, { r: 3, shadow: false });
  slab(104, 160 + wave(p, 1, 18, 0.1), 20, 90, '#7be08a', 'pl', { r: 10, shadow: false }); slab(416, 200 + wave(p, 1, 18), 20, 90, PAL.pink, 'pr', { r: 10, shadow: false });
  const bx = 270 + wave(p, 1, 110, 0.25);
  paperDisc(bx, 225, 28, CREAM, 'ball', { glint: false, cut: { shadow: false } }); face(bx, 227, 0.4, 'grin');
  stroke([210, 390], [180, 470], 18, PAL.charcoal, 'lg1', { shadow: false }); stroke([330, 390], [360, 470], 18, PAL.charcoal, 'lg2', { shadow: false });
  impact(136, 225, 26);
  paperDisc(420, 450, 20, RED, 'kn1', { glint: false }); paperDisc(470, 450, 20, GOLD, 'kn2', { glint: false });
  twinkle(60, 30, 13, p); twinkle(490, 30, 13, p, 0.5);
};
