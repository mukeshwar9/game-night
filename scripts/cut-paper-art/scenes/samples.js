// CUT PAPER scenes — the eight sample games, as the approved design drew them.
// Each is a 1 s loop of 12 drawings (the paper re-wobbles every drawing, motion plays on 2s at 24 fps):
// `u` is the point in the loop, and the story beats are placed on it — anticipation, the hit (with a
// burst), the settle. The still is drawing 6 (CUT_PAPER_STILL_AT in src/lib/gameArtLogic.js).
// Names stay inside this block so they cannot clash with the shared helpers.
(() => {
const wall = (k, c, p) => cut(rect(-30, -30, 600, 600, 0), c, { key: k, shadow: false, tear: 0, shade: false, pat: p });
const disc = (x, y, r, c, k, o = {}) => cut(ellipsePts(x, y, r, r * (o.ry ?? 1), o.rot ?? 0, 30), c, { key: k, ...o });
const pips = (x, y, s, n, rot) => {
  const at = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[n];
  const c = Math.cos(rot), si = Math.sin(rot);
  for (const [a, b] of at) { const dx = a * s * 0.27, dy = b * s * 0.27; dot(x + dx * c - dy * si, y + dx * si + dy * c, s * 0.085, PAL.ink); }
};
function die(x, y, s, rot, n, k) {
  cut(rot === 0 ? rect(x - s / 2, y - s / 2, s, s, s * 0.18) : rotPts(rect(x - s / 2, y - s / 2, s, s, s * 0.18), x, y, rot), PAL.paper, { key: k, sb: 8, sy: 6 });
  pips(x, y, s, n, rot);
}
const rotPts = (P, cx, cy, a) => rot(P, cx, cy, a);
function coin(x, y, r, k, tilt = 1) { disc(x, y, r, PAL.yellow, k, { ry: tilt, crayon: PAL.mustard, crAl: 0.5, sb: 5, sy: 4 }); if (tilt > 0.5) ink(ellipsePts(x, y, r * 0.62, r * 0.62 * tilt, 0, 20), { closed: true, w: 3, color: PAL.mustard, amt: 0.4, key: k + 'i' }); }

// 1 PUCK RUSH: sling the puck through the gap
function tPuck(u) {
  wall('pr-w', PAL.sky, pat.dots('rgba(255,255,255,0.35)', 5, 46));
  cut(rect(34, 34, 472, 472, 26), PAL.woodD, { key: 'pr-rim', pat: pat.grainWood('rgba(80,40,10,0.22)') });
  cut(rect(58, 58, 424, 424, 16), PAL.mint, { key: 'pr-felt', shadow: false, pat: pat.stripes('rgba(255,255,255,0.18)', 3, 38) });
  // the divider and its gap
  cut(rect(46, 252, 186, 30, 8), PAL.woodL, { key: 'pr-d1', sy: 5 });
  cut(rect(308, 252, 186, 30, 8), PAL.woodL, { key: 'pr-d2', sy: 5 });
  // pucks already across (they rattle on the boil)
  disc(150, 140, 38, PAL.blue, 'pr-p1', { sb: 6, sy: 5 });
  disc(395, 118, 38, PAL.blue, 'pr-p2', { sb: 6, sy: 5 });
  disc(130, 405, 38, PAL.orange, 'pr-p3', { sb: 6, sy: 5 });
  // the shot: pull back (0-.45), release through the gap (.45-.7), coast (.7-1)
  let py;
  if (u < 0.45) py = 395 + 58 * EZ.o2(u / 0.45);
  else if (u < 0.7) py = lerp(453, 128, EZ.o2((u - 0.45) / 0.25));
  else py = 128 - 22 * EZ.o2((u - 0.7) / 0.3);
  const by = u < 0.45 ? py + 40 : lerp(493, 440, EZ.o3((u - 0.45) / 0.12));
  ink([[78, 440], [270, Math.min(by, 495)], [462, 440]], { w: 7, color: PAL.ink, amt: 0.6, key: 'pr-band' });
  dot(78, 440, 9, PAL.charcoal); dot(462, 440, 9, PAL.charcoal);
  if (u >= 0.45 && u < 0.72) for (let i = 1; i < 4; i++) ink([[244 + i * 12, py + 40 + i * 22], [244 + i * 12, py + 70 + i * 26]], { w: 4, color: 'rgba(255,255,255,0.9)', amt: 0.3, key: 'pr-sp' + i });
  disc(270, py, 42, PAL.orange, 'pr-shot', { crayon: PAL.orangeD, crAl: 0.35, sb: 8, sy: 6 });
  face(270, py - 4, 0.62, u >= 0.45 && u < 0.75 ? 'wow' : 'focus');
}

// 2 YACHT: five dice tumble and land on five sixes
function tYacht(u) {
  wall('ya-w', PAL.navy, pat.dots('rgba(255,230,180,0.10)', 4, 54));
  cut([[-20, 210], [560, 170], [560, 560], [-20, 560]], PAL.green, { key: 'ya-felt', sy: -5, pat: pat.gingham('rgba(255,255,255,0.08)', 14) });
  // the cup, tipped, with a face
  cut(rotPts(rect(366, 52, 150, 120, 24), 441, 112, -0.5), PAL.pink, { key: 'ya-cup', pat: pat.stripes('rgba(255,255,255,0.25)', 10, 34) });
  face(450, 112, 0.55, u < 0.55 ? 'wow' : 'happy');
  const home = [[96, 330], [190, 268], [286, 330], [380, 278], [452, 382]];
  home.forEach(([hx, hy], i) => {
    const d = clamp((u - i * 0.04) / 0.55), k = 1 - EZ.o3(d);
    const x = hx + k * (170 - i * 30), y = hy - Math.abs(Math.sin(d * Math.PI * 2.2)) * 70 * k - k * 40;
    const r = k * (2.6 + i * 0.7);
    const n = d >= 1 ? 6 : 1 + ((B + i * 2) % 6);
    die(x, y, 92, d >= 1 ? (i - 2) * 0.06 : r, n, 'ya-d' + i);
  });
  const s = popS(0.62);
  if (s > 0) {   // the paper tag, lettered from the stroke table (no installed-font text)
    ctx.save(); ctx.translate(150, 470); ctx.rotate(-0.05); ctx.scale(s, s);
    cut(rect(-124, -44, 248, 88, 10), PAL.yellow, { key: 'ya-tag', sb: 8, sy: 5, pat: pat.stripes('rgba(200,140,40,0.25)', 8, 26) });
    cut(rect(-34, -56, 68, 22, 4), 'rgba(255,255,255,0.55)', { key: 'ya-tape', shadow: false, shade: false });
    letters('YACHT', -14, 4, 44, PAL.ink, 'ya-tl', { w: 7 });
    ink([[104, -16], [104, 6]], { w: 7, color: PAL.ink, amt: 0.4, key: 'ya-bang' }); dot(104, 24, 5.5, PAL.ink);
    ctx.restore();
  }
}

// 3 STICKY FINGERS: two grips tug the loot
function tSticky(u) {
  wall('sf-w', PAL.night, pat.stripes('rgba(255,255,255,0.05)', 22, 60, 0.3));
  // the spotlight
  cut(ellipsePts(270, 300, 230, 210, 0, 40), PAL.mustard, { key: 'sf-spot', shadow: false, shade: false, grain: 0.6 });
  const sway = Math.sin(u * TAU) * 26;
  // coins hop out of the bag
  for (let i = 0; i < 3; i++) {
    const v = (u + i / 3) % 1, x = 270 + sway + (i - 1) * 70 * v, y = 200 - Math.sin(v * Math.PI) * 140;
    if (v < 0.9) coin(x, y, 22, 'sf-c' + i, 0.4 + 0.6 * Math.abs(Math.cos(v * 9)));
  }
  // the bag
  ctx.save(); ctx.translate(270 + sway, 300); ctx.rotate(sway * 0.004);
  cut([[-110, 30], [-70, -70], [-30, -96], [30, -96], [70, -70], [110, 30], [90, 120], [-90, 120]], PAL.wood, { key: 'sf-bag', crayon: PAL.woodD, crAl: 0.4, pat: pat.dots('rgba(255,255,255,0.10)', 4, 30) });
  cut(rect(-52, -112, 104, 30, 10), PAL.woodD, { key: 'sf-tie' });
  { // a paper-cut dollar sign: an S stroke and a bar
    ink([[27, 30], [14, 20], [-6, 22], [-16, 34], [-4, 46], [14, 52], [26, 62], [16, 76], [-6, 80], [-20, 70]], { w: 11, color: PAL.ink, amt: 0.6, key: 'sf-s' });
    ink([[4, 10], [4, 94]], { w: 7, color: PAL.ink, amt: 0.5, key: 'sf-bar' });
  }
  ctx.restore();
  // the rival grips, pulling in turn
  const l = Math.max(0, -sway) * 0.6, r = Math.max(0, sway) * 0.6;
  hand(120 + sway - l, 330, 0.8, -0.15, PAL.skin1, PAL.teal, { key: 'sf-hl', sleevePat: pat.stripes('rgba(255,255,255,0.2)', 8, 28) });
  hand(420 + sway + r, 330, 0.8, Math.PI + 0.15, PAL.skin3, PAL.purple, { key: 'sf-hr' });
  for (let i = 0; i < 4; i++) { const R = RNG('sf-st', i); sparkle(R.r(40, 500), R.r(30, 120), R.r(6, 11) * (0.5 + 0.5 * ((B + i) % 2))); }
}

// 4 FENDER BENDER: a ram, a bump, a shove off the road
function car(x, y, a, c, k, mood) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  for (const [wx, wy] of [[-46, -44], [46, -44], [-46, 44], [46, 44]]) cut(rect(wx - 18, wy - 12, 36, 24, 8), PAL.charcoal, { key: k + 'w' + wx + wy, sb: 4, sy: 3 });
  cut(rect(-76, -54, 152, 108, 30), c, { key: k + 'b', crayon: 'rgba(0,0,0,0.25)', crAl: 0.25 });
  cut(rect(-14, -42, 52, 84, 14), PAL.sky, { key: k + 'gl', shadow: false });
  cut(rect(-86, -44, 18, 88, 8), PAL.grey, { key: k + 'fb', sb: 4 });
  ctx.save(); ctx.translate(-42, 0); ctx.rotate(Math.PI / 2); face(0, 0, 0.5, mood); ctx.restore();
  ctx.restore();
}
function tFender(u) {
  wall('fb-w', PAL.green, pat.dots('rgba(255,255,255,0.10)', 5, 40));
  cut(rect(-30, 90, 600, 360, 0), PAL.charcoal, { key: 'fb-road', tear: 0.6, sy: 4 });
  for (let i = -1; i < 6; i++) cut(rect(i * 120 - ((u * 120) % 120) + 0, 262, 66, 14, 4), PAL.yellow, { key: 'fb-dash' + i, shadow: false });
  cut([[40, 470], [70, 400], [100, 470]], PAL.orange, { key: 'fb-cone', pat: pat.stripes('rgba(255,255,255,0.8)', 10, 30, Math.PI / 2) });
  // red rams blue: approach .0-.42, hit .42, blue shoved .42-.85
  const hit = 0.42, after = clamp((u - hit) / 0.43);
  const rx = u < hit ? lerp(-60, 196, EZ.i2(u / hit)) : 196 - 26 * EZ.o2(after);
  const bx = u < hit ? 330 : 330 + 140 * EZ.o3(after), by = u < hit ? 300 : 300 - 60 * EZ.o3(after), ba = u < hit ? 0 : -0.5 * EZ.o3(after);
  car(bx, by, ba + Math.PI, PAL.blue, 'fb-b', u < hit ? 'smile' : 'wow');
  car(rx, 220 + (u < hit ? 0 : 6 * Math.sin(after * 20)), 0.08, '#d84a3a', 'fb-r', u < hit ? 'focus' : 'happy');
  if (u >= hit && u < hit + 0.25) { ctx.save(); burst(270, 262, 30, 92, { key: 'fb-bu', w: 6, c: PAL.ink, n: 12 }); star4(270, 262, 30, PAL.yellow); ctx.restore(); }
}

// 5 FIRST CUT: one clean slash; the lookalike sweats
function tCut(u) {
  wall('fc-w', PAL.pink, pat.gingham('rgba(255,255,255,0.28)', 22));
  cut(rect(40, 150, 460, 330, 40), PAL.woodL, { key: 'fc-board', pat: pat.grainWood('rgba(120,60,20,0.18)') });
  dot(470, 190, 12, PAL.woodD);
  // the lookalike: a painted ball with a fuse, nervous
  disc(418, 96, 54, PAL.greenD, 'fc-fake', { pat: pat.stripes('rgba(20,60,20,0.5)', 9, 26, 0.2) });
  ink([[440, 46], [452, 22], [470, 14]], { w: 5, color: PAL.ink, amt: 0.5, key: 'fc-fuse' });
  sparkle(474, 12, 10 + 5 * (B % 2), PAL.yellow);
  face(418, 96, 0.5, 'sad');
  // the melon: pops in, gets slashed, halves part and fall
  const s = u < 0.12 ? EZ.back(u / 0.12) : 1;   // the melon pops in
  const part = EZ.o3(clamp((u - 0.32) / 0.4)), drop = EZ.i2(clamp((u - 0.82) / 0.18)) * 340;
  const a = -0.75, nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
  for (const side of [-1, 1]) {
    if (u < 0.32 && side === 1) continue;
    ctx.save();
    ctx.translate(250 + side * nx * 40 * part + side * 20 * part, 320 + side * ny * 40 * part + drop);
    ctx.rotate(side * 0.25 * part);
    if (u < 0.32) ctx.scale(Math.max(0.01, s), Math.max(0.01, s));
    ctx.beginPath();
    if (u >= 0.32) { const L = 400; ctx.moveTo(-L * Math.cos(a) , -L * Math.sin(a)); ctx.lineTo(L * Math.cos(a), L * Math.sin(a)); ctx.lineTo(L * Math.cos(a) + side * nx * L, L * Math.sin(a) + side * ny * L); ctx.lineTo(-L * Math.cos(a) + side * nx * L, -L * Math.sin(a) + side * ny * L); ctx.closePath(); ctx.clip(); }
    disc(0, 0, 112, PAL.greenD, 'fc-rind', { pat: pat.stripes('rgba(30,80,30,0.55)', 14, 40, 0.5) });
    if (u >= 0.32) {
      disc(0, 0, 96, '#e5484d', 'fc-flesh', { shadow: false, crayon: '#c4303a', crAl: 0.3 });
      const R = RNG('seeds'); for (let i = 0; i < 9; i++) { const sa = R.r(0, TAU), sd = R.r(20, 72); cut(ellipsePts(Math.cos(sa) * sd, Math.sin(sa) * sd, 6, 10, sa, 10), PAL.ink, { key: 'fc-s' + i, shadow: false, grain: false, shade: false }); }
    } else face(0, -6, 0.8, 'smile');
    ctx.restore();
  }
  // the blade's streak
  if (u >= 0.22 && u < 0.42) { const k = EZ.o2((u - 0.22) / 0.14); ink([[250 - 230 * Math.cos(a), 320 - 230 * Math.sin(a)], [250 + (-230 + 460 * k) * Math.cos(a), 320 + (-230 + 460 * k) * Math.sin(a)]], { w: 12, color: '#ffffff', amt: 0.5, key: 'fc-sl' }); }
  if (u >= 0.34 && u < 0.8) for (let i = 0; i < 4; i++) { const R = RNG('fc-j', i); dot(250 + R.n(110), 330 + R.r(40, 90) + (u - 0.34) * 260, R.r(6, 10), '#e5484d'); }
}

// 6 QUIVER: the wheel spins, an arrow thunks in
function arrow(x, y, a, k, len = 150) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ink([[0, 0], [-len, 0]], { w: 8, color: PAL.woodD, amt: 0.4, key: k + 's' });
  cut([[-len + 6, 0], [-len - 22, -18], [-len - 34, -18], [-len - 14, 0], [-len - 34, 18], [-len - 22, 18]], PAL.pink, { key: k + 'f', sb: 3, sy: 2 });
  ctx.restore();
}
function tQuiver(u) {
  wall('qv-w', PAL.teal, pat.stripes('rgba(255,255,255,0.10)', 26, 70, 0.6));
  cut(rect(256, 300, 28, 240, 6), PAL.woodD, { key: 'qv-post' });
  const spin = u * TAU / 3;
  ctx.save(); ctx.translate(270, 250); ctx.rotate(spin);
  const rings = [[178, PAL.cream], [146, PAL.blue], [112, PAL.cream], [80, '#d84a3a'], [44, PAL.yellow]];
  rings.forEach(([r, c], i) => disc(0, 0, r, c, 'qv-r' + i, i ? { shadow: false, grain: 0.5 } : { sb: 14, sy: 8 }));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ink([[Math.cos(a) * 150, Math.sin(a) * 150], [Math.cos(a) * 176, Math.sin(a) * 176]], { w: 3, color: PAL.ink, amt: 0.3, key: 'qv-t' + i }); }
  // arrows already in: shafts point out of the face, toward the viewer
  for (const [ax, ay, i] of [[-62, -88, 1], [92, 46, 2], [-30, 104, 3]]) arrow(ax, ay, Math.atan2(ay, ax) + Math.PI + 0.5, 'qv-a' + i, 92);
  ctx.restore();
  // the new arrow: flight .0-.28, thunk, then it rides the wheel
  const fl = clamp(u / 0.28);
  if (u < 0.28) arrow(lerp(620, 300, EZ.i2(fl)), lerp(120, 236, EZ.i2(fl)), 2.8, 'qv-new', 160);
  else {
    const ang = (u - 0.28) * TAU / 3, wob = Math.sin((u - 0.28) * 60) * 0.12 * Math.exp(-(u - 0.28) * 10);
    ctx.save(); ctx.translate(270, 250); ctx.rotate(ang); arrow(30, -14, 2.8 + wob, 'qv-new', 160); ctx.restore();
    if (u < 0.4) burst(300, 236, 26, 70, { key: 'qv-b', w: 5, c: PAL.ink, n: 9 });
  }
  // the quiver
  cut(rotPts(rect(26, 330, 84, 190, 20), 68, 425, -0.2), PAL.wood, { key: 'qv-q', pat: pat.stripes('rgba(0,0,0,0.12)', 8, 30) });
  for (let i = 0; i < 3; i++) cut([[48 + i * 20, 340], [38 + i * 20, 300], [60 + i * 20, 300]], PAL.pink, { key: 'qv-qf' + i, sb: 3 });
}

// 7 SIDE KICK: two bikes, one boot
function bike(x, y, c, k, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.tilt ?? 0);
  const spin = TT * 30;
  for (const wx of [-62, 62]) { disc(wx, 34, 34, PAL.charcoal, k + 'wh' + wx, { sb: 5, sy: 4 }); dot(wx, 34, 10, PAL.grey); ink([[wx + Math.cos(spin) * 22, 34 + Math.sin(spin) * 22], [wx - Math.cos(spin) * 22, 34 - Math.sin(spin) * 22]], { w: 3, color: PAL.grey, amt: 0.2, key: k + 'sp' + wx }); }
  cut([[-70, 20], [-30, -12], [50, -12], [80, 20], [40, 34], [-40, 34]], c, { key: k + 'fr', crayon: 'rgba(0,0,0,0.2)', crAl: 0.25 });
  // rider
  cut(capsulePts(-6, -20, 10, -82, 40), o.suit ?? PAL.blue, { key: k + 'bd' });
  if (o.kick != null) {   // the leg swings from the foot peg (down-right) to a kick (up-right)
    const ka = lerp(-0.9, 0.55, o.kick), fx = Math.cos(ka) * 100, fy = -30 - Math.sin(ka) * 100;
    cut(capsulePts(0, -30, fx, fy, 26), o.suit ?? PAL.blue, { key: k + 'lg' });
    cut(ellipsePts(fx + Math.cos(ka) * 10, fy - Math.sin(ka) * 10, 22, 15, -ka, 14), PAL.ink, { key: k + 'bt', sb: 4 });
  }
  disc(16, -104, 34, o.helm ?? PAL.yellow, k + 'hm', { sb: 6 });
  cut(rect(22, -116, 30, 18, 8), PAL.ink, { key: k + 'vz', shadow: false });
  ctx.restore();
}
function tSide(u) {
  cut(rect(-30, -30, 600, 330, 0), PAL.orange, { key: 'sk-sky', shadow: false, tear: 0, shade: false, pat: pat.stripes('rgba(255,220,150,0.35)', 18, 46, Math.PI / 2) });
  disc(390, 200, 70, PAL.yellow, 'sk-sun', { shadow: false });
  cut([[-30, 300], [120, 230], [260, 280], [420, 220], [570, 290], [570, 340], [-30, 340]], PAL.purple, { key: 'sk-hill', sy: -3 });
  cut(rect(-30, 320, 600, 260, 0), PAL.charcoal, { key: 'sk-road', tear: 0.6, sy: -4 });
  for (let i = -1; i < 6; i++) cut(rect(i * 130 - ((u * 2 * 130) % 130), 432, 70, 12, 4), PAL.cream, { key: 'sk-l' + i, shadow: false });
  for (let i = 0; i < 2; i++) { const bx = (60 + i * 140 + u * 40) % 540; ink([[bx, 70 + i * 24], [bx + 12, 62 + i * 24], [bx + 24, 70 + i * 24]], { w: 4, color: PAL.ink, amt: 0.3, key: 'sk-bd' + i }); }
  const kick = u < 0.3 ? 0 : u < 0.5 ? EZ.o2((u - 0.3) / 0.2) : 1 - EZ.io(clamp((u - 0.62) / 0.3));
  const hitk = clamp((u - 0.45) / 0.45);
  bike(330 + 30 * EZ.o2(hitk), 330 - 20 * Math.sin(hitk * Math.PI), PAL.green, 'sk-rv', { suit: PAL.purple, helm: PAL.pink, tilt: -0.25 * Math.sin(hitk * Math.PI) });
  bike(170, 420, '#d84a3a', 'sk-me', { kick, suit: PAL.blue, helm: PAL.yellow });
  if (u >= 0.45 && u < 0.62) { star4(296, 340, 34, PAL.yellow); burst(296, 340, 34, 80, { key: 'sk-b', w: 5, c: PAL.ink, n: 10 }); }
}

// 8 TIC TAC TOE: marks pop in, the line strikes through
function tTtt(u) {
  wall('tt-w', PAL.woodL, pat.grainWood('rgba(120,60,20,0.16)'));
  cut(rotPts(rect(52, 44, 420, 452, 6), 262, 270, -0.03), PAL.paper, { key: 'tt-pg', pat: pat.lines('rgba(76,111,181,0.28)', 34, 20) });
  const G = 112, x0 = 100, y0 = 110;
  for (let i = 1; i < 3; i++) { ink([[x0 + i * G, y0 - 10], [x0 + i * G, y0 + 3 * G + 10]], { w: 9, color: PAL.ink, amt: 1.2, key: 'tt-v' + i }); ink([[x0 - 10, y0 + i * G], [x0 + 3 * G + 10, y0 + i * G]], { w: 9, color: PAL.ink, amt: 1.2, key: 'tt-h' + i }); }
  const moves = [[0, 'X', 0.04], [1, 'O', 0.14], [4, 'X', 0.24], [2, 'O', 0.34], [8, 'X', 0.44]];
  for (const [c, m, t0] of moves) {
    const f = clamp((u - t0) / 0.08); if (f <= 0) continue;
    const cx = x0 + (c % 3) * G + G / 2, cy = y0 + Math.floor(c / 3) * G + G / 2, r = 32;
    if (m === 'X') { ink([[cx - r, cy - r], [cx + r, cy + r]], { w: 14, color: '#d84a3a', amt: 1, key: 'tt-x1' + c, frac: clamp(f * 2) }); if (f > 0.5) ink([[cx + r, cy - r], [cx - r, cy + r]], { w: 14, color: '#d84a3a', amt: 1, key: 'tt-x2' + c, frac: clamp(f * 2 - 1) }); }
    else ink(ellipsePts(cx, cy, r, r, -Math.PI / 2, 30), { closed: true, w: 13, color: PAL.teal, amt: 1, key: 'tt-o' + c, frac: f });
  }
  const sf = clamp((u - 0.56) / 0.14);
  if (sf > 0) ink([[x0 + 14, y0 + 14], [x0 + 3 * G - 14, y0 + 3 * G - 14]], { w: 12, color: PAL.ink, amt: 1.6, key: 'tt-win', frac: sf, double: true });
  // the pencil, with a face, watching
  ctx.save(); ctx.translate(470, 430); ctx.rotate(-0.7 + (u < 0.5 ? Math.sin(u * 40) * 0.05 : 0));
  cut(rect(-26, -130, 52, 170, 6), PAL.yellow, { key: 'tt-pc', pat: pat.stripes('rgba(200,140,40,0.35)', 6, 17) });
  cut([[-26, 40], [26, 40], [0, 90]], PAL.woodL, { key: 'tt-tip', sb: 4 });
  cut(rect(-26, -160, 52, 34, 8), PAL.pink, { key: 'tt-er' });
  ctx.rotate(Math.PI / 2); face(-40, 0, 0.42, sf > 0 ? 'happy' : 'focus');
  ctx.restore();
}


SCENES.puckrush = tPuck;
SCENES.yacht = tYacht;
SCENES.stickyfingers = tSticky;
SCENES.fenderbender = tFender;
SCENES.firstcut = tCut;
SCENES.quiver = tQuiver;
SCENES.sidekick = tSide;
SCENES.tictactoe = tTtt;

for (const t of ['puckrush', 'yacht', 'stickyfingers', 'fenderbender', 'firstcut', 'quiver', 'sidekick', 'tictactoe']) OWN_BEAT.add(t);
})();
