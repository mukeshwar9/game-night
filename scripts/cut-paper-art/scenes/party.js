// CUT PAPER scenes — party games.

function sheep(x, y, s, fill, key, mood = 'happy', head = COAL) {
  [[-50, 4, 40], [50, 4, 40], [0, -24, 44], [-20, 14, 44], [26, 14, 44]].forEach(([dx, dy, r], i) => blob(x + dx * s, y + dy * s, r * s, r * s, fill, key + 'w' + i, { crayon: 'rgba(0,0,0,0.08)', sb: 6, sy: 4, grain: 0.7 }));
  [[-26, 54], [30, 54]].forEach(([dx, dy], i) => slab(x + dx * s - 8 * s, y + dy * s, 16 * s, 34 * s, COAL, key + 'l' + i, { r: 6, sb: 3, sy: 2 }));
  blob(x + 66 * s, y + 8 * s, 34 * s, 38 * s, head, key + 'h', { sb: 5, sy: 3 });
  face(x + 66 * s, y + 8 * s, 0.9 * s, mood);
}

SCENES.herd = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 36) });
  paperDisc(440, 90, 44, PAL.yellow, 'sun', { glint: false }); cloud(120, 80, 0.8);
  ground(310, PAL.green, { pat: pat.stripes('rgba(255,255,255,0.12)', 10, 36, 0.6), crayon: PAL.greenD });
  ground(430, PAL.greenD, { crayon: '#2c5e38' });
  sheep(130, 380 + hopY(p, 8, 2), 1.0, CREAM, 'sh1'); sheep(330, 430 + hopY(p, 8, 2, 0.3), 1.0, CREAM, 'sh2');
  sheep(180, 270 + hopY(p, 6, 2, 0.6), 0.7, CREAM, 'sh3'); sheep(380, 300 + hopY(p, 6, 2, 0.9), 0.7, CREAM, 'sh4');
  sheep(430, 470 + hopY(p, 22, 2, 0.15), 0.8, COAL, 'sh5', 'smile', CREAM);
  twinkle(60, 190, 14, p);
};

SCENES.trivia = (p) => {
  world(PAL.purple, { pat: pat.stripes('rgba(255,255,255,0.16)', 18, 52, 0.4) });
  slab(50, 50, 440, 200, PAL.navy, 'scr', { r: 22, sb: 14, sy: 9, crayon: '#3a4690' });
  letters('?', 270, 150 + wave(p, 1, 5), 120, PAL.yellow, 'q', { w: 22 });
  [[120, RED], [270, PAL.green], [420, PAL.blue]].forEach(([x, c], i) => {
    const y = i === 1 ? hopY(p, 24, 2) : wave(p, 1, 4, i * 0.3);
    slab(x - 68, 350 + y, 136, 160, c, 'pod' + i, { r: 24, crayon: 'rgba(0,0,0,0.15)' });
    paperDisc(x, 330 + y, 52, CREAM, 'tp' + i, { glint: false });
    face(x, 332 + y, 0.8, i === 1 ? 'grin' : 'happy');
  });
  paperStar(480, 280, 22, PAL.yellow, 'ts', p * 0.4); twinkle(50, 300, 13, p);
};

SCENES.wavelength = (p) => {
  world(PAL.pinkL, { pat: pat.dots('rgba(255,255,255,0.4)', 5, 34) });
  const c = [270, 380], R = 220;
  const wedge = (a0, a1, fill, key) => cut([[...c], ...arcPts(c[0], c[1], R, a0, a1, 14)], fill, { key, sb: 10, sy: 6, crayon: 'rgba(255,255,255,0.25)' });
  wedge(Math.PI, Math.PI * 1.35, PAL.sky, 'w1'); wedge(Math.PI * 1.35, Math.PI * 1.5, PAL.mint, 'w2'); wedge(Math.PI * 1.5, Math.PI * 1.62, GOLD, 'w3'); wedge(Math.PI * 1.62, Math.PI * 1.75, PAL.mint, 'w4'); wedge(Math.PI * 1.75, TAU, PAL.pink, 'w5');
  cut([[...c], ...arcPts(c[0], c[1], 130, Math.PI, TAU, 18)], PAL.paper, { key: 'wi', shadow: false, tear: 0.8 });
  const a = Math.PI * 1.55 + wave(p, 1, 0.12);
  stroke(c, [c[0] + Math.cos(a) * 200, c[1] + Math.sin(a) * 200], 16, COAL, 'needle', { sb: 5 });
  paperDisc(270, 380, 50, COAL, 'hub', { glint: false }); face(270, 382, 0.8, 'wow');
  letterTile(40, 420, 90, 'C', PAL.sky, 'tc', -0.08, CREAM); letterTile(410, 420, 90, 'H', RED, 'th', 0.08, CREAM);
  twinkle(490, 60, 15, p); twinkle(50, 80, 12, p, 0.5);
};

SCENES.fibbage = (p) => {
  world(PAL.mustard, { pat: pat.stripes('rgba(255,255,255,0.22)', 20, 60, 0.4) });
  const y = wave(p, 1, 6);
  blob(190, 430 + y, 130, 90, PAL.purple, 'body', { crayon: '#5f4fb0' });
  blob(190, 290 + y, 92, 100, PAL.skin1, 'head', { crayon: PAL.skin2 });
  cut([[250, 290 + y], [460, 320 + y], [254, 336 + y]], PAL.skin1, { key: 'nose', sb: 6, sy: 4, crayon: PAL.skin2 });
  face(170, 276 + y, 1.25, 'smug');
  cut(rect(210, 40, 300, 120, 34), CREAM, { key: 'bb', sb: 10, sy: 7 }); cut([[236, 156], [210, 206], [280, 156]], CREAM, { key: 'bbt', shadow: false, tear: 0.4 });
  letters('TRUE', 360, 100, 60, PAL.green, 'tr');
  critter(450, 450 + hopY(p, 12, 2), 46, PAL.sky, 'wow', 'wit', { fs: 0.7 });
  twinkle(60, 80, 15, p);
};

SCENES.spyfair = (p) => {
  world(PAL.purple, { pat: pat.dots('rgba(255,255,255,0.22)', 4, 30) });
  person(90, 330, 0.5, { key: 'p1', shirt: PAL.sky, skin: PAL.skin1, mood: 'smile' }); person(450, 330, 0.5, { key: 'p3', shirt: PAL.pink, skin: PAL.skin2, mood: 'wow' });
  const y = wave(p, 1, 6);
  person(270, 330 + y, 0.74, { key: 'spy', shirt: COAL, skin: PAL.skin1, hair: '#2b211d', mood: 'smile' });
  cut(rect(160, 180 + y, 220, 28, 12), COAL, { key: 'brim', sb: 6, sy: 4 }); cut([[200, 184 + y], [220, 120 + y], [320, 120 + y], [340, 184 + y]], COAL, { key: 'hat', sb: 6, sy: 4 });
  stroke([208, 190 + y], [208, 190 + y], 1, COAL, 'x', { shadow: false });
  cut(rect(200, 234 + y, 140, 36, 16), COAL, { key: 'shade', sb: 4, sy: 3 });
  dot(236, 246 + y, 4, '#fff'); dot(304, 246 + y, 4, '#fff');
  letters('?', 270, 56, 70, PAL.yellow, 'qm', { w: 14 });
  twinkle(60, 60, 14, p); twinkle(490, 470, 12, p, 0.5);
};

SCENES.headsup = (p) => {
  world(PAL.mustard, { pat: pat.stripes('rgba(255,255,255,0.2)', 20, 60, -0.4) });
  const y = wave(p, 1, 5);
  blob(270, 470 + y, 190, 110, PAL.sky, 'body', { crayon: '#4a7da8' });
  stroke([140, 470 + y], [90, 330 + y], 40, PAL.skin1, 'arm1', { crayon: PAL.skin2 }); stroke([400, 470 + y], [450, 330 + y], 40, PAL.skin1, 'arm2', { crayon: PAL.skin2 });
  blob(270, 330 + y, 108, 118, PAL.skin1, 'head', { crayon: PAL.skin2 });
  face(270, 330 + y, 1.5, 'grin');
  ctx.save(); ctx.translate(270, 130 + y); ctx.rotate(-0.12 + wave(p, 1, 0.03));
  cut(rect(-130, -62, 260, 124, 18), CREAM, { key: 'card', sb: 10, sy: 7 }); letters('CAT', 0, 0, 70, RED, 'cat');
  ctx.restore();
  twinkle(70, 100, 15, p); twinkle(480, 90, 13, p, 0.5);
};

SCENES.chameleon = (p) => {
  world(PAL.sky, { pat: pat.dots('rgba(255,255,255,0.35)', 5, 36) });
  stroke([30, 440], [510, 440], 40, PAL.wood, 'branch', { crayon: PAL.woodL });
  blob(150, 160, 60, 40, PAL.greenD, 'leaf1', { rot: -0.5 }); blob(440, 120, 60, 40, PAL.greenD, 'leaf2', { rot: 0.5 });
  const t = wave(p, 1, 0.12);
  ctx.save(); ctx.translate(480, 340); ctx.rotate(t); ctx.translate(-480, -340);
  ink(arcPts(470, 340, 56, -0.4, Math.PI * 1.5, 18), { w: 34, color: PAL.green, amt: 0.6, key: 'tail' });
  ctx.restore();
  blob(250, 300, 210, 130, PAL.green, 'cb', { crayon: PAL.greenD, crAl: 0.5, sb: 12, sy: 8 });
  [[200, 230, PAL.yellow], [290, 220, PAL.sky], [340, 290, PAL.pink], [180, 340, PAL.yellow]].forEach(([x, y, c], i) => paperDisc(x, y, 22, c, 'sp' + i, { glint: false, cut: { shadow: false } }));
  paperDisc(120, 250, 56, CREAM, 'eye', { glint: false }); dot(114, 252, 26, COAL); dot(106, 242, 8, '#fff');
  const tongue = 60 + Math.abs(wave(p, 1, 1, 0.25)) * 30;
  stroke([60, 330], [60 - tongue * 0.5, 350 + tongue * 0.15], 16, PAL.pink, 'tg', { shadow: false });
  face(250, 340, 1.0, 'smug');
  [[160, 410], [330, 410]].forEach(([x, y], i) => stroke([x, y], [x + 10, 440], 26, PAL.greenD, 'lg' + i, { shadow: false }));
  twinkle(60, 80, 14, p); twinkle(490, 220, 12, p, 0.5);
};

SCENES.sketch = (p) => {
  world(PAL.pinkL, { pat: pat.dots('rgba(255,255,255,0.4)', 5, 34) });
  stroke([170, 520], [210, 120], 18, PAL.woodD, 'e1'); stroke([370, 520], [330, 120], 18, PAL.woodD, 'e2'); stroke([270, 520], [270, 150], 14, PAL.wood, 'e3');
  slab(80, 80, 380, 300, CREAM, 'cv', { r: 10, sb: 14, sy: 9 });
  const y = wave(p, 1, 5);
  cut([[188, 208 + y], [180, 130 + y], [236, 172 + y]], PAL.paper, { key: 'ear1', shadow: false, line: COAL, lw: 6 }); cut([[352, 208 + y], [360, 130 + y], [304, 172 + y]], PAL.paper, { key: 'ear2', shadow: false, line: COAL, lw: 6 });
  cut(ellipsePts(270, 240 + y, 100, 84, 0, 24), PAL.paper, { key: 'cat', shadow: false, line: COAL, lw: 6 });
  face(270, 240 + y, 1.1, 'happy');
  ctx.save(); ctx.translate(420, 330); ctx.rotate(0.9 + wave(p, 1, 0.08));
  cut(rect(-14, -80, 28, 130, 4), PAL.yellow, { key: 'pen', sb: 6, sy: 4, pat: pat.stripes('rgba(180,120,20,0.35)', 4, 12, Math.PI / 2) });
  cut([[-14, 50], [14, 50], [0, 80]], PAL.skin1, { key: 'pt', shadow: false }); cut([[-5, 68], [5, 68], [0, 80]], COAL, { key: 'pt2', shadow: false });
  cut(rect(-14, -100, 28, 24, 6), PAL.pink, { key: 'pe', sb: 3 });
  ctx.restore();
  twinkle(60, 480, 15, p); twinkle(490, 460, 12, p, 0.5);
};

SCENES.codewords = (p) => {
  world(PAL.teal, { pat: pat.stripes('rgba(255,255,255,0.14)', 18, 52, 0.4) });
  const cols = [RED, PAL.blue, CREAM, CREAM, PAL.blue, CREAM, COAL, RED, CREAM, PAL.blue, CREAM, RED];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const i = r * 4 + c, x = 44 + c * 115, y = 56 + r * 108;
    slab(x, y, 104, 94, cols[i], 'cw' + i, { r: 14, sb: 6, sy: 4, crayon: 'rgba(255,255,255,0.2)' });
    stroke([x + 22, y + 40], [x + 82, y + 40], 10, cols[i] === CREAM ? 'rgba(90,70,50,0.45)' : 'rgba(255,255,255,0.6)', 'cl' + i, { shadow: false });
  }
  const y = hopY(p, 14, 2);
  critter(270, 440 + y, 52, PAL.yellow, 'smug', 'spy', { fs: 0.8 });
  cut(rect(210, 392 + y, 120, 24, 10), COAL, { key: 'brim', sb: 4, sy: 3 }); cut([[236, 394 + y], [250, 350 + y], [290, 350 + y], [304, 394 + y]], COAL, { key: 'hat', sb: 4, sy: 3 });
  twinkle(490, 480, 14, p); twinkle(50, 480, 12, p, 0.5);
};

SCENES.justone = (p) => {
  world(PAL.mustard, { pat: pat.stripes('rgba(255,255,255,0.2)', 20, 60, 0.4) });
  card(150, 110, 220, 110, -0.05, CREAM, 'j1'); letters('SEA', 150, 110, 56, PAL.grey, 'js1'); ink([[60, 150], [240, 70]], { w: 12, color: RED, amt: 0.5, key: 'jx1' });
  card(390, 110, 220, 110, 0.05, CREAM, 'j2'); letters('SEA', 390, 110, 56, PAL.grey, 'js2'); ink([[300, 150], [480, 70]], { w: 12, color: RED, amt: 0.5, key: 'jx2' });
  const s = 1 + wave(p, 1, 0.05);
  card(270, 270, 260 * s, 130 * s, 0, PAL.yellow, 'j3'); letters('WET', 270, 270, 72 * s, COAL, 'js3');
  critter(140, 430 + hopY(p, 18, 2), 62, PAL.sky, 'happy', 'c1', { fs: 0.95 }); critter(400, 430 + hopY(p, 18, 2, 0.25), 62, PAL.pink, 'grin', 'c2', { fs: 0.95 });
  twinkle(490, 300, 15, p); twinkle(40, 300, 12, p, 0.5);
};
