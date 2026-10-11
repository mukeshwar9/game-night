// CUT PAPER scenes — word games and dice games.

SCENES.hangwoman = (p) => {
  world(PAL.night, { pat: pat.dots('rgba(255,255,255,0.16)', 3, 26) });
  paperDisc(430, 100, 42, PAL.cream, 'moon', { glint: false }); blob(446, 90, 38, 38, PAL.night, 'moonbite', { shadow: false, tear: 0.4, grain: false });
  ground(440, PAL.lamp, { pat: pat.dots('rgba(255,255,255,0.15)', 3, 20) });
  stroke([90, 470], [300, 470], 22, PAL.wood, 'g1', { crayon: PAL.woodL }); stroke([130, 470], [130, 80], 24, PAL.wood, 'g2', { crayon: PAL.woodL });
  stroke([130, 80], [350, 80], 22, PAL.wood, 'g3', { crayon: PAL.woodL }); stroke([130, 160], [210, 80], 16, PAL.woodD, 'g4');
  ctx.save(); ctx.translate(350, 92); ctx.rotate(wave(p, 1, 0.07)); ctx.translate(-350, -92);
  ink([[350, 90], [350, 170]], { w: 6, color: PAL.tweed, amt: 0.5, key: 'rope' });
  critter(350, 215, 56, PAL.pink, 'wow', 'hg', { fs: 0.9, crayon: PAL.pinkL });
  stroke([350, 268], [350, 360], 40, PAL.pink, 'hgb', { shadow: false });
  [[-30, 285, -48, 335], [30, 285, 48, 335], [-14, 360, -24, 420], [14, 360, 24, 420]].forEach(([a, b, c, d], i) => stroke([350 + a, b], [350 + c, d], 16, PAL.pinkL, 'hl' + i, { shadow: false }));
  ctx.restore();
  [['G', 0], ['A', 1], ['', 2]].forEach(([ch, i]) => letterTile(54 + i * 80, 28, 66, ch, CREAM, 'ht' + i));
  twinkle(480, 220, 14, p);
};

SCENES.twotruths = (p) => {
  world(PAL.yellow, { pat: pat.stripes('rgba(255,255,255,0.28)', 20, 60, 0.4) });
  const one = (x, kind, shirt, key, ph) => {
    const y = wave(p, 1, 6, ph);
    card(x, 130 + y, 140, 140, 0, CREAM, key + 'c');
    if (kind === 'x') { ink([[x - 36, 94 + y], [x + 36, 166 + y]], { w: 16, color: RED, amt: 0.5, key: key + 'x1' }); ink([[x + 36, 94 + y], [x - 36, 166 + y]], { w: 16, color: RED, amt: 0.5, key: key + 'x2' }); }
    else ink([[x - 40, 132 + y], [x - 10, 164 + y], [x + 42, 96 + y]], { w: 16, color: PAL.green, amt: 0.5, key: key + 'k' });
    stroke([x, 200 + y], [x, 290], 10, PAL.woodD, key + 's', { shadow: false });
    person(x, 400, 0.4, { key, shirt, skin: PAL.skin1, mood: kind === 'x' ? 'smile' : 'happy' });
  };
  one(100, 'v', PAL.blue, 'tt1', 0); one(270, 'v', PAL.teal, 'tt2', 0.33); one(440, 'x', PAL.purple, 'tt3', 0.66);
  twinkle(60, 40, 14, p);
};

SCENES.wordduel = (p) => {
  world(PAL.mint, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 34) });
  const cols = [[PAL.charcoal, PAL.mustard, PAL.charcoal, PAL.charcoal, PAL.mustard], [PAL.green, PAL.charcoal, PAL.mustard, PAL.charcoal, PAL.green], [PAL.green, PAL.green, PAL.green, PAL.green, PAL.green]];
  const marks = ['W', 'A', 'R', 'D', 'S'];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) letterTile(40 + c * 92, 60 + r * 92, 84, r === 2 ? 'WORDS'[c] : '', cols[r][c], 'wd' + r + c, 0, CREAM);
  critter(90, 440, 52, RED, 'grin', 'wc1', { fs: 0.8, crayon: REDD }); critter(450, 440 + hopY(p, 16, 2), 52, PAL.blue, 'sad', 'wc2', { fs: 0.8, crayon: '#2f4a8a' });
  twinkle(490, 36, 15, p); twinkle(40, 360, 12, p, 0.5);
};

SCENES.wordcoop = (p) => {
  world(PAL.pinkL, { pat: pat.gingham('rgba(255,255,255,0.4)', 24) });
  ground(400, PAL.wood, { pat: pat.grainWood('rgba(100,60,25,0.3)') });
  paperStar(270, 90, 1, PAL.yellow, 'x');
  const s = 1 + wave(p, 1, 0.08);
  cut([[270, 150 + 30 * s], [214, 100 + 10 * s], [226, 66], [270, 86], [314, 66], [326, 100 + 10 * s]].map(([x, y]) => [x, y]), RED, { key: 'hrt', sb: 8, sy: 5, tear: 0.8 });
  ['W', 'O', 'R', 'D'].forEach((ch, i) => letterTile(40 + i * 118, 200 + wave(p, 1, 6, i * 0.2), 106, ch, [PAL.yellow, PAL.sky, PAL.mint, PAL.cream][i], 'cw' + i));
  critter(130, 440 + hopY(p, 20, 2), 60, PAL.blue, 'happy', 'a1', { fs: 0.9, crayon: '#2f4a8a' });
  critter(410, 440 + hopY(p, 20, 2, 0.25), 60, PAL.purple, 'grin', 'a2', { fs: 0.9, crayon: '#5f4fb0' });
  twinkle(60, 60, 15, p); twinkle(490, 60, 13, p, 0.5);
};

SCENES.converge = (p) => {
  world(PAL.sky, { pat: pat.stripes('rgba(255,255,255,0.3)', 22, 62, -0.4) });
  const bub = (x, y, mirror, color, key, ph) => {
    ctx.save(); ctx.translate(x, y + wave(p, 1, 6, ph));
    cut(rect(-110, -48, 220, 96, 30), CREAM, { key, sb: 10, sy: 7 });
    cut(mirror ? [[-60, 40], [-40, 86], [-14, 40]] : [[60, 40], [40, 86], [14, 40]], CREAM, { key: key + 't', shadow: false, tear: 0.4 });
    letters('SUN', 0, 0, 56, color, key + 'w');
    ctx.restore();
  };
  bub(150, 130, false, PAL.blue, 'b1', 0); bub(390, 160, true, RED, 'b2', 0.4);
  critter(130, 380, 78, PAL.blue, 'wow', 'p1', { fs: 1.1, crayon: '#2f4a8a' }); critter(410, 380, 78, RED, 'wow', 'p2', { fs: 1.1, crayon: REDD });
  const s = 1 + wave(p, 1, 0.1);
  cut([[270, 400], [226, 356], [236, 326], [270, 342], [304, 326], [314, 356]], GOLD, { key: 'hr', sb: 6, sy: 4, tear: 0.7 });
  twinkle(270, 220, 16 * s, p);
};

SCENES.wordrace = (p) => {
  world(PAL.teal, { pat: pat.stripes('rgba(255,255,255,0.14)', 18, 52, 0.2) });
  [0, 1, 2].forEach(i => slab(30, 50 + i * 155, 480, 130, i % 2 ? PAL.cream : PAL.paper, 'lane' + i, { r: 14, sb: 8, sy: 5 }));
  for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) if ((r + c) % 2 === 0) cut(rect(470 + c * 20, 50 + r * 23, 20, 23, 0), COAL, { key: 'fl' + r + c, shadow: false, tear: 0.3 });
  const run = (y, fill, mood, key, ph, ch, tc) => {
    const dx = Math.abs(wave(p, 1, 1, ph)) * 26;
    critter(100 + dx, y + hopY(p, 10, 4, ph), 46, fill, mood, key, { fs: 0.72 });
    letterTile(250, y - 40, 80, ch, tc, key + 't');
  };
  run(115, RED, 'grin', 'r1', 0.25, 'W', PAL.yellow); run(270, PAL.blue, 'happy', 'r2', 0.5, 'O', PAL.yellow); run(425, PAL.green, 'focus', 'r3', 0.75, 'R', PAL.yellow);
  twinkle(40, 30, 14, p);
};

SCENES.wordhunt = (p) => {
  world(PAL.mustard, { pat: pat.dots('rgba(255,255,255,0.25)', 4, 30) });
  slab(46, 56, 448, 448, PAL.paper, 'hp', { r: 20, sb: 14, sy: 9, pat: pat.lines('rgba(76,111,181,0.14)', 36, 4) });
  const rows = ['CATS', 'ORDW', 'NEIU', 'HOLY'];
  stroke([110, 128], [430, 128], 70, 'rgba(217,82,78,0.35)', 'hl', { shadow: false });
  rows.forEach((row, r) => [...row].forEach((ch, c) => letters(ch, 112 + c * 105, 128 + r * 105, 54, r === 0 ? RED : COAL, 'wh' + r + c)));
  ctx.save(); ctx.translate(380, 360); ctx.rotate(wave(p, 1, 0.08));
  cut(rect(30, 40, 20, 140, 8), PAL.woodD, { key: 'hdl', sb: 5, sy: 4 }); ctx.rotate(-0.8);
  ctx.restore();
  ctx.save(); ctx.translate(380, 360); ctx.rotate(wave(p, 1, 0.08));
  stroke([40, 50], [110, 130], 24, PAL.woodD, 'hdl2', { sb: 5 });
  paperDisc(0, 0, 92, 'rgba(207,226,238,0.55)', 'lens', { glint: false, cut: { crayon: PAL.skyD } });
  cut(ellipsePts(0, 0, 92, 92, 0, 28), 'rgba(0,0,0,0.001)', { key: 'lensr', shadow: false, grain: false, shade: false, line: PAL.charcoal, lw: 16 });
  face(0, 4, 1.2, 'wow');
  ctx.restore();
  twinkle(490, 70, 15, p);
};

SCENES.password = (p) => {
  world(PAL.purple, { pat: pat.dots('rgba(255,255,255,0.22)', 4, 30) });
  slab(50, 70, 440, 330, PAL.charcoal, 'mon', { r: 24, sb: 14, sy: 9 });
  slab(76, 96, 388, 278, PAL.night, 'scr', { r: 12, shadow: false, crayon: '#2a3070' });
  const y = wave(p, 1, 6);
  ink(arcPts(270, 200 + y, 60, Math.PI, TAU, 14), { w: 22, color: PAL.grey, amt: 0.5, key: 'shackle' });
  slab(190, 200 + y, 160, 112, GOLD, 'lock', { r: 22, sb: 8, sy: 5 });
  face(270, 258 + y, 1, 'smile');
  [0, 1, 2, 3, 4].forEach(i => paperDisc(160 + i * 55, 345, 11, '#7be08a', 'dot' + i, { glint: false, cut: { shadow: false } }));
  slab(236, 400, 68, 44, PAL.grey, 'stand', { r: 6 }); slab(170, 440, 200, 40, PAL.charcoal, 'base', { r: 14 });
  letterTile(400, 420, 86, 'S', RED, 'sh1', 0.1, CREAM);
  twinkle(60, 480, 15, p); twinkle(490, 60, 13, p, 0.5);
};

SCENES.anagrams = (p) => {
  world(PAL.sky, { pat: pat.stripes('rgba(255,255,255,0.3)', 22, 62, 0.4) });
  const T = [['C', 50, 150, -0.2, PAL.yellow], ['A', 150, 80, 0.14, PAL.pink], ['T', 270, 160, -0.1, PAL.mint], ['S', 380, 90, 0.2, PAL.purple]];
  T.forEach(([ch, x, y, a, f], i) => letterTile(x, y + hopY(p, 22, 2, i * 0.25), 120, ch, f, 'an' + i, a, COAL));
  ink(arcPts(270, 360, 110, 0.15, Math.PI - 0.15, 14), { w: 14, color: RED, amt: 0.5, key: 'arr' });
  cut([[150, 440], [120, 380], [190, 392]], RED, { key: 'ah', shadow: false, tear: 0.4 });
  critter(270, 440, 54, PAL.pinkL, 'grin', 'an9', { fs: 0.8 });
  twinkle(490, 300, 15, p); twinkle(50, 330, 12, p, 0.5);
};

SCENES.dice = (p) => {
  world(PAL.mustard, { pat: pat.dots('rgba(255,255,255,0.25)', 4, 30) });
  ground(440, PAL.green, { pat: pat.dots('rgba(255,255,255,0.18)', 3, 22) });
  const y = hopY(p, 30, 2), cx = 270, cy = 330 + y;
  blob(cx - 120, cy - 100, 32, 40, PAL.pink, 'ear1', { rot: -0.5 }); blob(cx + 120, cy - 100, 32, 40, PAL.pink, 'ear2', { rot: 0.5 });
  blob(cx, cy, 150, 130, PAL.pink, 'pig', { crayon: PAL.pinkL, crAl: 0.4, sb: 14, sy: 9 });
  blob(cx, cy + 40, 66, 48, '#e38aa8', 'snout', { shadow: false, tear: 0.6 });
  dot(cx - 20, cy + 40, 9, COAL); dot(cx + 20, cy + 40, 9, COAL);
  face(cx, cy - 18, 1.3, 'grin');
  dieShape(30, 80 + hopY(p, 20, 2, 0.25), 110, 1, -0.2, 'd1'); dieShape(400, 70 + hopY(p, 20, 2, 0.5), 110, 1, 0.2, 'd2');
  twinkle(270, 60, 18, p);
};

SCENES.yacht = (p) => {
  world(PAL.green, { pat: pat.dots('rgba(255,255,255,0.2)', 4, 30) });
  slab(40, 60, 460, 440, PAL.greenD, 'felt', { r: 26, sb: 14, sy: 9, crayon: PAL.green });
  [[70, 100, 6, -0.1], [190, 80, 6, 0.1], [310, 108, 6, -0.08], [420, 76, 6, 0.12], [120, 240, 6, 0.06]].forEach(([x, y, n, a], i) => dieShape(x, y + hopY(p, 16, 2, i * 0.2), 100, n, a, 'yd' + i));
  const s = 1 + wave(p, 1, 0.06);
  paperStar(400, 330, 90 * s, PAL.yellow, 'ys', p * 0.2); face(400, 336, 1.1, 'wow');
  card(170, 440, 240, 76, 0, CREAM, 'ysc'); letters('50', 170, 440, 48, RED, 'y50');
  twinkle(60, 40, 15, p);
};

SCENES.bluff = (p) => {
  world(PAL.blue, { pat: pat.stripes('rgba(255,255,255,0.14)', 18, 52, 0.4) });
  ground(440, PAL.wood, { pat: pat.grainWood('rgba(100,60,25,0.3)') });
  const sh = wave(p, 2, 0.05);
  ctx.save(); ctx.translate(170, 440); ctx.rotate(sh); ctx.translate(-170, -440);
  cut([[90, 440], [120, 150], [220, 150], [250, 440]], PAL.woodD, { key: 'cup', sb: 12, sy: 8, pat: pat.grainWood('rgba(255,220,170,0.18)') });
  cut(rect(104, 130, 132, 40, 18), '#6a3f1f', { key: 'cup2', sb: 6, sy: 4 });
  face(170, 300, 1.1, 'smile');
  ctx.restore();
  dieShape(300, 330, 110, 4, -0.1, 'bd1'); dieShape(410, 250, 90, 2, 0.15, 'bd2');
  const y = wave(p, 1, 6);
  cut(rect(300, 40 + y, 200, 90, 28), CREAM, { key: 'bb', sb: 10, sy: 7 }); cut([[330, 128 + y], [310, 172 + y], [364, 128 + y]], CREAM, { key: 'bbt', shadow: false, tear: 0.4 });
  letters('?', 400, 85 + y, 56, RED, 'bq');
  twinkle(60, 80, 15, p);
};

SCENES.docking = (p) => {
  world(PAL.night, { pat: pat.dots('rgba(255,255,255,0.2)', 3, 22) });
  const R = RNG('docksky'); for (let i = 0; i < 10; i++) { dot(R.r(20, 520), R.r(20, 520), R.r(1.5, 3.5), 'rgba(255,255,255,0.85)'); }
  slab(380, 90, 76, 360, PAL.grey, 'st1', { r: 16, sb: 12, sy: 8 }); slab(300, 220, 230, 96, PAL.charcoal, 'st2', { r: 18, sb: 12, sy: 8 });
  slab(400, 120, 140, 30, PAL.yellow, 'pan1', { r: 4 }); slab(400, 390, 140, 30, PAL.yellow, 'pan2', { r: 4 });
  const dx = Math.abs(wave(p, 1, 1, 0.25)) * 26;
  blob(150 + dx, 268, 110, 66, CREAM, 'ship', { crayon: PAL.skin1, sb: 12, sy: 8 });
  cut([[60 + dx, 240], [20 + dx, 190], [20 + dx, 346], [60 + dx, 296]], RED, { key: 'fin', sb: 6, sy: 4 });
  face(158 + dx, 266, 0.95, 'grin');
  dieShape(60, 60 + hopY(p, 12, 2), 80, 5, -0.2, 'dk');
  twinkle(480, 480, 15, p);
};
