/* LAZY SUSAN prototype: a design sketch of the core loop, not app code.
   One canvas, one rAF loop, no storage, no network. Tuning numbers live in T
   and are all starting values (see the report's numbers table). */
(function () {
  'use strict';
  var W = 360, H = 640, CX = 180, CY = 320, RT = 92, RP = 132, RH = 34;
  var TAU = Math.PI * 2;
  var INK = [45, 55, 35], DANGER = [190, 30, 50], GOLD = [214, 160, 28];
  var COLORS = [[70, 121, 47], [129, 89, 180], [175, 55, 115], [25, 100, 150]];
  var FONT = '"Press Start 2P", ui-monospace, monospace';
  var T = {
    target: { 2: 15, 3: 12, 4: 10 },
    window: 0.2,          // rad either side of the gate centre
    speed0: 1.45,         // rad/s on wave 1
    speedStep: 0.14,      // added per wave
    speedMax: 2.5,
    rush: 1.45,           // LAST BITE speed multiplier
    missLock: 0.45, hitLock: 0.22, stun: 0.9, buffer: 0.12,
    bornLock: 0.3,
    bot: [{ sigma: 0.085, skip: 0.45 }, { sigma: 0.055, skip: 0.2 }, { sigma: 0.03, skip: 0.05 }]
  };
  var LAYOUT = {
    2: [{ a: 90, hud: [74, 612, 0] }, { a: -90, hud: [286, 28, 180] }],
    3: [{ a: 90, hud: [74, 612, 0] }, { a: -30, hud: [296, 28, 180] }, { a: 210, hud: [64, 28, 180] }],
    4: [{ a: 135, hud: [64, 612, 0] }, { a: 45, hud: [296, 612, 0] }, { a: -45, hud: [296, 28, 180] }, { a: -135, hud: [64, 28, 180] }]
  };
  var cfg = { n: 2, bot: true, level: 1, turn: true, chili: true, last: true, sound: true };
  var canvas, ctx, bg, S, lastT = 0, audio = null, reduced = false, onState = null;

  function rgb(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }
  function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function backOut(t) { var c = 1.9; t = t - 1; return 1 + (c + 1) * t * t * t + c * t * t; }

  /* ---------- sound: tiny synth, starts on the first tap ---------- */
  function beep(freq, dur, type, vol, slide) {
    if (!cfg.sound || !audio) return;
    try {
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      g.gain.setValueAtTime(vol || 0.08, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* no audio */ }
  }
  function wake() {
    if (audio) { if (audio.state === 'suspended') audio.resume(); return; }
    try { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); } catch (e) { audio = null; }
  }
  var SFX = {
    grab: function (v) { beep(520 + v * 90, 0.09, 'triangle', 0.1, 900 + v * 120); },
    bun: function () { beep(660, 0.08, 'triangle', 0.1); setTimeout(function () { beep(990, 0.14, 'triangle', 0.1); }, 70); },
    miss: function () { beep(170, 0.16, 'square', 0.06, 90); },
    hot: function () { beep(320, 0.4, 'sawtooth', 0.06, 70); },
    turn: function () { beep(1320, 0.5, 'sine', 0.07); beep(1980, 0.7, 'sine', 0.03); },
    last: function () { beep(880, 0.1, 'triangle', 0.08); setTimeout(function () { beep(1175, 0.1, 'triangle', 0.08); }, 90); setTimeout(function () { beep(1568, 0.25, 'triangle', 0.08); }, 180); },
    tick: function () { beep(440, 0.07, 'square', 0.05); },
    go: function () { beep(880, 0.25, 'square', 0.06); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { beep(f, 0.22, 'triangle', 0.09); }, i * 110); }); }
  };

  /* ---------- state ---------- */
  function reset(attract) {
    var n = cfg.n, lay = LAYOUT[n];
    S = {
      n: n, attract: !!attract, target: T.target[n], time: 0,
      phase: 'count', count: attract ? 0.6 : 3.2, lastTick: 4,
      th: Math.random() * TAU, dir: 1, speed: T.speed0, cur: 0, wave: 0, rush: false,
      pieces: [], fly: [], parts: [], pops: [], banner: null, shake: 0, refill: 0,
      winner: -1, overT: 0, id: 0,
      seats: lay.map(function (l, i) {
        return {
          ang: l.a * Math.PI / 180, hud: l.hud, color: COLORS[i], score: 0, shown: 0,
          jab: -1, hit: false, lock: 0, stun: 0, flash: 0, pop: 0, buf: false, plan: null,
          bot: attract ? true : (cfg.bot && i > 0), name: attract ? 'BOT' : (cfg.bot && i > 0 ? 'BOT' : 'P' + (i + 1))
        };
      })
    };
    spawnWave();
    if (onState) onState(S);
  }

  function spawnWave() {
    S.wave++;
    if (cfg.turn && S.wave > 1) {
      S.dir *= -1; S.banner = { text: 'THE TURN', t: 0, color: INK }; SFX.turn();
      S.seats.forEach(function (s) { s.plan = null; });
    }
    S.speed = Math.min(T.speedMax, T.speed0 + T.speedStep * (S.wave - 1));
    S.rush = false;
    var kinds = ['bun', 'dump', 'dump', 'dump'];
    if (S.wave % 2 === 0) kinds.push('dump');
    if (cfg.chili) { kinds.push('chili'); if (S.wave >= 4) kinds.push('chili'); }
    var slots = [0, 1, 2, 3, 4, 5, 6, 7];
    for (var i = slots.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
    var off = Math.random() * TAU;
    kinds.forEach(function (k, idx) {
      S.pieces.push({ id: ++S.id, type: k, a: off + slots[idx] * TAU / 8 + (Math.random() - 0.5) * 0.2, born: -idx * 0.07, gone: false, gold: false, fade: 1, seen: {} });
    });
  }

  function edibleLeft() { return S.pieces.filter(function (p) { return !p.gone && p.type !== 'chili'; }); }
  function stationXY(s, r) { return [CX + Math.cos(s.ang) * r, CY + Math.sin(s.ang) * r]; }

  function burst(x, y, n, color, kind, speed) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = (0.4 + Math.random()) * (speed || 70);
      S.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.35 + Math.random() * 0.4, size: 1.5 + Math.random() * 2.5, color: color, kind: kind });
    }
  }

  function tap(i) {
    var s = S.seats[i];
    if (!s) return;
    if (S.phase === 'over') { if (S.overT > 1.1) reset(false); return; }
    if (S.phase === 'count') return;
    if (s.stun > 0) return;
    if (s.lock > 0) { if (s.lock <= T.buffer) s.buf = true; return; }
    var best = null, bd = T.window;
    S.pieces.forEach(function (p) {
      if (p.gone || p.born < T.bornLock) return;
      var d = Math.abs(wrap(p.a + S.th - s.ang));
      if (d < bd) { bd = d; best = p; }
    });
    s.jab = 0; s.hit = !!best;
    var st = stationXY(s, RT), pt = stationXY(s, RT + 46);
    if (!best) {
      s.score = Math.max(0, s.score - 1); s.lock = T.missLock; s.flash = 1; S.shake = Math.max(S.shake, 0.5);
      S.pops.push({ x: pt[0], y: pt[1], text: '-1', color: DANGER, t: 0, rot: s.hud[2] });
      burst(st[0], st[1], 6, [120, 100, 70], 'spark', 60); SFX.miss();
      return;
    }
    best.gone = true;
    if (best.type === 'chili') {
      s.score = Math.max(0, s.score - 2); s.stun = T.stun; s.lock = T.stun; s.flash = 1; S.shake = Math.max(S.shake, 0.8);
      S.pops.push({ x: pt[0], y: pt[1], text: 'HOT! -2', color: DANGER, t: 0, rot: s.hud[2] });
      burst(st[0], st[1], 14, [226, 74, 34], 'fire', 90); SFX.hot();
      S.fly.push({ type: 'chili', gold: false, seat: i, t: 0 });
      return;
    }
    var v = (best.type === 'bun' ? 3 : 1) * (best.gold ? 2 : 1);
    s.score += v; s.lock = T.hitLock; s.pop = 1;
    S.pops.push({ x: pt[0], y: pt[1], text: '+' + v, color: best.gold ? GOLD : s.color, t: 0, rot: s.hud[2], big: v > 1 });
    burst(st[0], st[1], best.gold ? 18 : 8, best.gold ? [240, 196, 70] : [250, 240, 214], best.gold ? 'star' : 'crumb', 80);
    S.fly.push({ type: best.type, gold: best.gold, seat: i, t: 0 });
    if (v >= 3) SFX.bun(); else SFX.grab(v);
    if (s.score >= S.target) {
      S.phase = 'over'; S.winner = i; S.overT = 0; SFX.win();
      for (var k = 0; k < 60; k++) S.parts.push({ x: CX + (Math.random() - 0.5) * 200, y: CY - 40 + (Math.random() - 0.5) * 60, vx: (Math.random() - 0.5) * 240, vy: -80 - Math.random() * 220, life: 0, max: 1.4 + Math.random(), size: 3 + Math.random() * 3, color: Math.random() < 0.6 ? s.color : [240, 196, 70], kind: 'conf' });
      if (onState) onState(S);
      return;
    }
    var left = edibleLeft();
    if (left.length === 0) { S.phase = 'refill'; S.refill = 0.75; }
    else if (left.length === 1 && cfg.last && !left[0].gold) {
      left[0].gold = true; S.rush = true; S.banner = { text: 'LAST BITE x2', t: 0, color: GOLD }; SFX.last();
    }
  }

  /* ---------- bots ---------- */
  function botThink(s, i, dt) {
    var B = T.bot[S.attract ? 1 : cfg.level];
    if (s.plan) {
      s.plan.t -= dt;
      if (s.plan.t <= 0) { s.plan = null; if (s.lock <= 0 && s.stun <= 0) tap(i); }
      return;
    }
    if (s.lock > 0 || s.stun > 0 || Math.abs(S.cur) < 0.4) return;
    var pick = null, pt = 9;
    S.pieces.forEach(function (p) {
      if (p.gone || p.type === 'chili' || p.born < T.bornLock) return;
      if ((p.seen[i] || 0) > S.time) return;
      var tt = wrap(s.ang - (p.a + S.th)) / S.cur;
      if (tt > 0.14 && tt < 0.5 && tt < pt) { pick = p; pt = tt; }
    });
    if (!pick) return;
    pick.seen[i] = S.time + 1.2;
    if (Math.random() < B.skip) return;
    s.plan = { t: Math.max(0.02, pt + gauss() * B.sigma) };
  }

  /* ---------- update ---------- */
  function update(dt) {
    S.time += dt;
    var target = S.dir * S.speed * (S.rush ? T.rush : 1);
    S.cur += (target - S.cur) * Math.min(1, dt * 3.2);   // the plate has weight: it eases into a reversal
    S.th += S.cur * dt;
    if (S.phase === 'count') {
      S.count -= dt;
      var c = Math.ceil(S.count - 0.2);
      if (!S.attract && c < S.lastTick && c >= 1 && c <= 3) { S.lastTick = c; SFX.tick(); }
      if (S.count <= 0) { S.phase = 'play'; if (!S.attract) SFX.go(); }
    } else if (S.phase === 'refill') {
      S.refill -= dt;
      S.pieces.forEach(function (p) { if (!p.gone) p.fade = Math.max(0, p.fade - dt * 2.4); });
      if (S.refill <= 0) { S.pieces = []; spawnWave(); S.phase = 'play'; }
    } else if (S.phase === 'over') {
      S.overT += dt;
      if (S.attract && S.overT > 2.5) reset(true);
    }
    S.pieces.forEach(function (p) { p.born += dt; });
    S.seats.forEach(function (s, i) {
      if (s.jab >= 0) { s.jab += dt; if (s.jab > 0.32) s.jab = -1; }
      if (s.lock > 0) { s.lock -= dt; if (s.lock <= 0 && s.buf) { s.buf = false; tap(i); } }
      if (s.stun > 0) {
        s.stun -= dt;
        if (Math.random() < dt * 22) { var p = stationXY(s, RT + 70); S.parts.push({ x: p[0] + (Math.random() - 0.5) * 20, y: p[1], vx: (Math.random() - 0.5) * 14, vy: -26, life: 0, max: 0.8, size: 5, color: [255, 255, 255], kind: 'steam' }); }
      }
      s.flash = Math.max(0, s.flash - dt * 2.6);
      s.pop = Math.max(0, s.pop - dt * 4);
      s.shown += (s.score - s.shown) * Math.min(1, dt * 12);
      if (s.bot && S.phase === 'play') botThink(s, i, dt);
    });
    S.fly = S.fly.filter(function (f) { f.t += dt; return f.t < 0.3; });
    S.parts = S.parts.filter(function (p) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'conf') p.vy += 420 * dt; else if (p.kind !== 'steam') { p.vx *= 0.94; p.vy *= 0.94; }
      return p.life < p.max;
    });
    S.pops = S.pops.filter(function (p) { p.t += dt; return p.t < 0.9; });
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 1.5) S.banner = null; }
    S.shake = Math.max(0, S.shake - dt * 3);
  }

  /* ---------- drawing ---------- */
  function makeBackground() {
    bg = document.createElement('canvas'); bg.width = W * 2; bg.height = H * 2;
    var b = bg.getContext('2d'); b.scale(2, 2);
    var g = b.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#e6d6ae'); g.addColorStop(0.55, '#d8c494'); g.addColorStop(1, '#c6ae7c');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var px = 0; px < W; px += 72) {             // planks
      b.fillStyle = 'rgba(120,84,40,' + (0.03 + rnd() * 0.07) + ')'; b.fillRect(px, 0, 72, H);
      b.fillStyle = 'rgba(70,46,20,0.28)'; b.fillRect(px, 0, 1, H);
      b.fillStyle = 'rgba(255,248,225,0.3)'; b.fillRect(px + 1, 0, 1, H);
    }
    for (var i = 0; i < 150; i++) {                  // grain
      var x = rnd() * W, y = rnd() * H, len = 40 + rnd() * 160, wob = (rnd() - 0.5) * 7;
      b.strokeStyle = 'rgba(110,74,34,' + (0.04 + rnd() * 0.1) + ')'; b.lineWidth = 0.5 + rnd() * 0.9;
      b.beginPath(); b.moveTo(x, y); b.bezierCurveTo(x + wob, y + len * 0.33, x - wob, y + len * 0.66, x + wob * 0.4, y + len); b.stroke();
    }
    for (var k = 0; k < 5; k++) {                    // knots
      var kx = rnd() * W, ky = rnd() * H;
      for (var r = 9; r > 1; r -= 2) { b.strokeStyle = 'rgba(96,62,26,' + (0.06 + (9 - r) * 0.02) + ')'; b.lineWidth = 0.8; b.beginPath(); b.ellipse(kx, ky, r * 0.7, r * 1.5, 0, 0, TAU); b.stroke(); }
    }
    var v = b.createRadialGradient(CX - 50, CY - 120, 80, CX, CY, 430);  // warm lamp, top left
    v.addColorStop(0, 'rgba(255,250,232,0.3)'); v.addColorStop(0.5, 'rgba(255,250,232,0)'); v.addColorStop(1, 'rgba(60,40,14,0.34)');
    b.fillStyle = v; b.fillRect(0, 0, W, H);
  }

  function drawPlate() {
    ctx.save(); ctx.translate(CX + 7, CY + 12);                      // contact shadow
    var sh = ctx.createRadialGradient(0, 0, RP - 12, 0, 0, RP + 30);
    sh.addColorStop(0, 'rgba(50,34,12,0.5)'); sh.addColorStop(1, 'rgba(50,34,12,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, RP + 30, 0, TAU); ctx.fill(); ctx.restore();

    ctx.save(); ctx.translate(CX, CY);
    var wd = ctx.createRadialGradient(-40, -50, 20, 0, 0, RP + 12);   // walnut turntable base
    wd.addColorStop(0, '#8a5b34'); wd.addColorStop(1, '#55341b');
    ctx.fillStyle = wd; ctx.beginPath(); ctx.arc(0, 0, RP + 11, 0, TAU); ctx.fill();
    ctx.save(); ctx.rotate(S.th);
    for (var i = 0; i < 9; i++) { ctx.strokeStyle = 'rgba(40,22,8,0.3)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, RP + 2 + i, i * 0.7, i * 0.7 + 1.2 + (i % 3) * 0.5); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,225,180,0.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, RP + 10, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();

    var pc = ctx.createRadialGradient(-26, -34, 10, 0, 0, RP);         // porcelain
    pc.addColorStop(0, '#ffffff'); pc.addColorStop(0.62, '#f3f4ea'); pc.addColorStop(0.9, '#dfe6d2'); pc.addColorStop(1, '#c2cdb2');
    ctx.fillStyle = pc; ctx.beginPath(); ctx.arc(0, 0, RP, 0, TAU); ctx.fill();
    ctx.save(); ctx.rotate(S.th);                                      // painted rim turns with the plate
    ctx.strokeStyle = 'rgba(70,121,47,0.6)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, RP - 6, 0, TAU); ctx.stroke();
    for (var k = 0; k < 16; k++) {
      ctx.save(); ctx.rotate(k * TAU / 16); ctx.translate(0, -(RP - 14));
      ctx.fillStyle = k % 4 === 0 ? 'rgba(175,55,115,0.55)' : 'rgba(70,121,47,0.5)';
      ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 2, 0.5, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.strokeStyle = 'rgba(70,121,47,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, RT + 26, 0, TAU); ctx.stroke();
    ctx.restore();
    var well = ctx.createRadialGradient(0, 0, RH + 4, 0, 0, RT + 24);   // the shallow well the food rides in
    well.addColorStop(0, 'rgba(120,140,100,0.16)'); well.addColorStop(0.25, 'rgba(120,140,100,0)'); well.addColorStop(0.85, 'rgba(120,140,100,0)'); well.addColorStop(1, 'rgba(120,140,100,0.2)');
    ctx.fillStyle = well; ctx.beginPath(); ctx.arc(0, 0, RT + 24, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawGates() {
    S.seats.forEach(function (s) {
      var hot = false;
      S.pieces.forEach(function (p) { if (!p.gone && p.born >= T.bornLock && Math.abs(wrap(p.a + S.th - s.ang)) < T.window) hot = true; });
      ctx.save(); ctx.translate(CX, CY);
      ctx.strokeStyle = rgb(s.color, hot ? 0.42 : 0.17); ctx.lineWidth = 46; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(0, 0, RT, s.ang - T.window, s.ang + T.window); ctx.stroke();
      ctx.strokeStyle = rgb(s.color, 0.9); ctx.lineWidth = 2.5;
      [-1, 1].forEach(function (e) {
        var a = s.ang + e * T.window;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * (RT - 23), Math.sin(a) * (RT - 23)); ctx.lineTo(Math.cos(a) * (RT + 23), Math.sin(a) * (RT + 23)); ctx.stroke();
      });
      ctx.restore();
    });
  }

  function drawHub() {
    ctx.save(); ctx.translate(CX, CY);
    ctx.fillStyle = 'rgba(60,70,40,0.25)'; ctx.beginPath(); ctx.arc(3, 5, RH + 2, 0, TAU); ctx.fill();
    var rim = ctx.createRadialGradient(-10, -12, 4, 0, 0, RH);
    rim.addColorStop(0, '#fbfbf4'); rim.addColorStop(1, '#cfd6c0');
    ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, RH, 0, TAU); ctx.fill();
    var soy = ctx.createRadialGradient(-8, -10, 2, 0, 0, RH - 6);
    soy.addColorStop(0, '#6b3a1a'); soy.addColorStop(0.5, '#2c1508'); soy.addColorStop(1, '#120803');
    ctx.fillStyle = soy; ctx.beginPath(); ctx.arc(0, 0, RH - 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, RH - 11, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-13, -3, 1.6, 0, TAU); ctx.fill();
    // three chevrons on the hub rim show which way the plate is turning
    var d = S.cur >= 0 ? 1 : -1, strength = clamp(Math.abs(S.cur) / 1.2, 0, 1);
    ctx.rotate(S.th);
    ctx.strokeStyle = rgb(INK, 0.25 + 0.5 * strength); ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    for (var i = 0; i < 3; i++) {
      ctx.save(); ctx.rotate(i * TAU / 3); ctx.translate(0, -(RH + 9)); ctx.scale(d, 1);
      ctx.beginPath(); ctx.moveTo(-4, -4.5); ctx.lineTo(3, 0); ctx.lineTo(-4, 4.5); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function shapeDumpling() {
    var g = ctx.createLinearGradient(0, -12, 0, 12);
    g.addColorStop(0, '#fffaf0'); g.addColorStop(0.55, '#f6e7c4'); g.addColorStop(1, '#dcbb7c');
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(120,84,40,0.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-18, 5); ctx.bezierCurveTo(-18, -12, 18, -12, 18, 5); ctx.bezierCurveTo(10, 11, -10, 11, -18, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
    var sear = ctx.createLinearGradient(0, 3, 0, 11);                  // pan-fried underside
    sear.addColorStop(0, 'rgba(190,120,40,0)'); sear.addColorStop(1, 'rgba(170,96,28,0.75)');
    ctx.fillStyle = sear; ctx.beginPath(); ctx.moveTo(-18, 5); ctx.bezierCurveTo(-10, 11, 10, 11, 18, 5); ctx.bezierCurveTo(10, 7, -10, 7, -18, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(150,110,60,0.6)'; ctx.lineWidth = 0.9;      // pleats
    for (var i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 4.2, -7.6 + Math.abs(i) * 0.9); ctx.quadraticCurveTo(i * 4.2 + 2.4, -4, i * 4.4 + 1, -1.5); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-11, -1); ctx.quadraticCurveTo(-4, -6, 4, -5); ctx.stroke();
  }
  function shapeBun() {
    ctx.fillStyle = '#b98a4a'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.fill();          // bamboo steamer ring
    ctx.strokeStyle = 'rgba(80,50,20,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,180,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 18, Math.PI, Math.PI * 1.6); ctx.stroke();
    ctx.fillStyle = '#e9dcb8'; ctx.beginPath(); ctx.arc(0, 0, 16.5, 0, TAU); ctx.fill();
    var g = ctx.createRadialGradient(-5, -6, 2, 0, 0, 15);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f4f0e4'); g.addColorStop(1, '#d6cfbb');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(150,140,115,0.7)'; ctx.lineWidth = 0.9;                              // twisted top
    for (var i = 0; i < 7; i++) { ctx.save(); ctx.rotate(i * TAU / 7); ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.quadraticCurveTo(5, -5, 3.5, -10.5); ctx.stroke(); ctx.restore(); }
    ctx.fillStyle = '#c3312f'; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-6, -7, 3.4, 1.8, -0.7, 0, TAU); ctx.fill();
  }
  function shapeChili() {
    var g = ctx.createLinearGradient(-6, -8, 8, 8);
    g.addColorStop(0, '#ff6a4a'); g.addColorStop(0.5, '#d6201c'); g.addColorStop(1, '#8e0f12');
    ctx.fillStyle = g; ctx.strokeStyle = 'rgba(90,10,10,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-15, -4); ctx.bezierCurveTo(-8, -13, 9, -9, 19, 6); ctx.bezierCurveTo(8, 3, -4, 6, -14, 5); ctx.bezierCurveTo(-18, 3, -18, -1, -15, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9, -4.5); ctx.quadraticCurveTo(0, -7.5, 8, -2.5); ctx.stroke();
    ctx.fillStyle = '#3f8a2c'; ctx.strokeStyle = '#245a18'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-13, -5); ctx.quadraticCurveTo(-17, -3, -15, 3); ctx.lineTo(-18, 2); ctx.quadraticCurveTo(-22, -4, -24, -9); ctx.lineTo(-21, -10); ctx.quadraticCurveTo(-18, -7, -13, -5); ctx.fill(); ctx.stroke();
  }
  function drawFood(type, gold) {
    if (gold) {
      var halo = ctx.createRadialGradient(0, 0, 6, 0, 0, 30);
      halo.addColorStop(0, 'rgba(250,206,70,0.85)'); halo.addColorStop(1, 'rgba(250,206,70,0)');
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(S.time * 10) * 2, 0, TAU); ctx.fill();
    }
    if (type === 'bun') shapeBun(); else if (type === 'chili') shapeChili(); else shapeDumpling();
    if (gold) {
      for (var i = 0; i < 4; i++) {
        var a = S.time * 2.4 + i * TAU / 4, r = 24 + Math.sin(S.time * 6 + i) * 3;
        ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(S.time * 3);
        ctx.fillStyle = 'rgba(255,224,110,0.95)';
        ctx.beginPath(); ctx.moveTo(0, -4.5); ctx.lineTo(1.2, -1.2); ctx.lineTo(4.5, 0); ctx.lineTo(1.2, 1.2); ctx.lineTo(0, 4.5); ctx.lineTo(-1.2, 1.2); ctx.lineTo(-4.5, 0); ctx.lineTo(-1.2, -1.2); ctx.closePath(); ctx.fill(); ctx.restore();
      }
    }
  }

  function drawPieces() {
    S.pieces.forEach(function (p) {
      if (p.gone || p.born <= 0) return;
      var a = p.a + S.th, x = CX + Math.cos(a) * RT, y = CY + Math.sin(a) * RT;
      var sc = p.born < 0.3 ? backOut(clamp(p.born / 0.3, 0, 1)) : 1;
      ctx.save(); ctx.globalAlpha = p.fade;
      ctx.fillStyle = 'rgba(40,50,30,0.3)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 17 * sc, 12 * sc, a + Math.PI / 2, 0, TAU); ctx.fill();
      ctx.translate(x, y); ctx.rotate(a + Math.PI / 2); ctx.scale(sc, sc);
      if (p.type === 'chili') {                                         // heat shimmer keeps the hazard readable without colour
        ctx.strokeStyle = 'rgba(190,30,50,' + (0.3 + 0.2 * Math.sin(S.time * 9)) + ')'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(0, 0, 23, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      drawFood(p.type, p.gold);
      ctx.restore();
    });
  }

  function stickPath(tx, ty, bx, by, wt, wb) {
    var dx = bx - tx, dy = by - ty, l = Math.sqrt(dx * dx + dy * dy), nx = -dy / l, ny = dx / l;
    ctx.beginPath(); ctx.moveTo(tx + nx * wt, ty + ny * wt); ctx.lineTo(bx + nx * wb, by + ny * wb); ctx.lineTo(bx - nx * wb, by - ny * wb); ctx.lineTo(tx - nx * wt, ty - ny * wt); ctx.closePath();
  }
  function drawSticks(s, i) {
    var j = 0;
    if (s.jab >= 0) j = s.jab < 0.08 ? easeOut(s.jab / 0.08) : 1 - easeOut(clamp((s.jab - 0.08) / 0.24, 0, 1));
    var rest = RT + 60, reach = s.hit ? 50 : 40;
    var tipY = rest - j * reach + Math.sin(S.time * 2.2 + i * 1.7) * 1.2;
    var spread = 10 - j * 6.5, jit = s.stun > 0 ? Math.sin(S.time * 70) * 2 : 0;
    var rot = s.ang - Math.PI / 2, c = Math.cos(-rot), sn = Math.sin(-rot), ox = 4 * c - 7 * sn, oy = 4 * sn + 7 * c;
    ctx.save(); ctx.translate(CX, CY); ctx.rotate(rot);
    [-1, 1].forEach(function (e) {                                       // shadows first
      ctx.fillStyle = 'rgba(40,30,10,0.28)'; stickPath(e * spread + jit + ox, tipY + oy, e * 23 + jit + ox, tipY + 150 + oy, 2.2, 5); ctx.fill();
    });
    [-1, 1].forEach(function (e) {
      var tx = e * spread + jit, bx = e * 23 + jit, by = tipY + 150;
      var g = ctx.createLinearGradient(tx, tipY, bx, by);
      g.addColorStop(0, '#5a3a22'); g.addColorStop(0.16, '#2a1a12'); g.addColorStop(1, '#17100c');
      ctx.fillStyle = g; stickPath(tx, tipY, bx, by, 2.2, 5.2); ctx.fill();
      var f0 = 0.56, f1 = 0.68;                                          // lacquer band in the seat colour
      ctx.fillStyle = rgb(s.color); stickPath(tx + (bx - tx) * f0, tipY + (by - tipY) * f0, tx + (bx - tx) * f1, tipY + (by - tipY) * f1, 2.2 + 3 * f0, 2.2 + 3 * f1); ctx.fill();
      ctx.fillStyle = 'rgba(232,196,96,0.95)';
      [f0 - 0.012, f1].forEach(function (f) { stickPath(tx + (bx - tx) * f, tipY + (by - tipY) * f, tx + (bx - tx) * (f + 0.012), tipY + (by - tipY) * (f + 0.012), 2.2 + 3 * f, 2.2 + 3 * f); ctx.fill(); });
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.9;      // lacquer highlight
      ctx.beginPath(); ctx.moveTo(tx - 0.6, tipY + 4); ctx.lineTo(bx - 1.6, by - 4); ctx.stroke();
      if (s.stun > 0) { ctx.fillStyle = 'rgba(220,40,30,0.35)'; stickPath(tx, tipY, bx, by, 2.2, 5.2); ctx.fill(); }
    });
    ctx.restore();
  }

  function drawFly() {
    S.fly.forEach(function (f) {
      var s = S.seats[f.seat], k = clamp((f.t - 0.06) / 0.24, 0, 1), e = easeOut(k);
      ctx.save(); ctx.translate(CX, CY); ctx.rotate(s.ang - Math.PI / 2); ctx.translate(0, RT + 8 + e * 44);
      ctx.globalAlpha = 1 - k * k; ctx.scale(1 - e * 0.35, 1 - e * 0.35); ctx.rotate(Math.PI);
      drawFood(f.type, f.gold); ctx.restore();
    });
  }

  function drawFlash() {
    S.seats.forEach(function (s) {
      if (s.flash <= 0) return;
      ctx.save(); ctx.translate(CX, CY); ctx.rotate(s.ang - Math.PI / 2);
      var g = ctx.createLinearGradient(0, RT - 10, 0, RT + 260);
      g.addColorStop(0, rgb(DANGER, 0)); g.addColorStop(1, rgb(DANGER, 0.5 * s.flash));
      ctx.fillStyle = g; ctx.fillRect(-420, RT - 10, 840, 520); ctx.restore();
    });
  }

  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function glass(x, y, w, h, r, a) {
    ctx.save(); ctx.shadowColor = 'rgba(40,50,30,0.22)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
    ctx.fillStyle = 'rgba(255,255,255,' + (a || 0.42) + ')'; rr(x, y, w, h, r); ctx.fill(); ctx.restore();
    var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; rr(x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
  }

  function drawHud() {
    S.seats.forEach(function (s) {
      var sc = 1 + s.pop * 0.12;
      ctx.save(); ctx.translate(s.hud[0], s.hud[1]); ctx.rotate(s.hud[2] * Math.PI / 180); ctx.scale(sc, sc);
      glass(-56, -20, 112, 40, 12, 0.5);
      ctx.fillStyle = rgb(s.color); ctx.beginPath(); ctx.arc(-40, -3, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = rgb(INK); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.font = '7px ' + FONT; ctx.fillText(s.name, -27, -3);
      ctx.textAlign = 'right'; ctx.font = '15px ' + FONT; ctx.fillText(String(s.score), 34, -2);
      ctx.font = '6px ' + FONT; ctx.fillStyle = rgb(INK, 0.75); ctx.textAlign = 'left'; ctx.fillText('/' + S.target, 36, 1);
      ctx.fillStyle = rgb(INK, 0.14); rr(-48, 10, 96, 4, 2); ctx.fill();
      ctx.fillStyle = rgb(s.color); rr(-48, 10, Math.max(4, 96 * clamp(s.shown / S.target, 0, 1)), 4, 2); ctx.fill();
      ctx.restore();
    });
  }

  function label(text, x, y, size, color, rot, alpha) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot * Math.PI / 180);
    ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.font = size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(3, size * 0.32); ctx.strokeText(text, 0, 0);
    ctx.fillStyle = rgb(color); ctx.fillText(text, 0, 0); ctx.restore();
  }

  function drawOverlays() {
    S.parts.forEach(function (p) {
      var k = 1 - p.life / p.max;
      ctx.save(); ctx.globalAlpha = p.kind === 'steam' ? k * 0.4 : k;
      ctx.fillStyle = rgb(p.color);
      if (p.kind === 'conf') { ctx.translate(p.x, p.y); ctx.rotate(p.life * 9); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.kind === 'steam' ? p.size * (1.6 - k) : p.size * k, 0, TAU); ctx.fill(); }
      ctx.restore();
    });
    S.pops.forEach(function (p) {
      var k = p.t / 0.9, rise = easeOut(clamp(k * 1.6, 0, 1)) * 16, s = stationDir(p);
      label(p.text, p.x + s[0] * rise, p.y + s[1] * rise, p.big ? 14 : 11, p.color, p.rot, k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    });
    if (S.banner) {
      var b = S.banner, a = b.t < 1.1 ? 1 : 1 - (b.t - 1.1) / 0.4;
      label(b.text, CX, CY - 60, 11, b.color, 0, a);
      if (S.n >= 2 && !S.seats[1].bot) label(b.text, CX, CY + 60, 11, b.color, 180, a);
    }
    if (S.phase === 'count' && !S.attract) {
      var c = Math.ceil(S.count - 0.2), txt = c >= 1 ? String(Math.min(3, c)) : 'GO!';
      label(txt, CX, CY, c >= 1 ? 34 : 22, INK, 0, 1);
      S.seats.forEach(function (s) { if (!s.bot) { var p = stationXY(s, 215); label('TAP', p[0], p[1], 9, s.color, s.hud[2], 0.9); } });
    }
    if (S.phase === 'over' && !S.attract) {
      var w = S.seats[S.winner];
      glass(CX - 128, CY - 56, 256, 112, 18, 0.72);
      label(w.name + ' WINS', CX, CY - 22, 16, w.color, 0, 1);
      label(S.seats.map(function (s) { return s.score; }).join(' - '), CX, CY + 6, 11, INK, 0, 1);
      if (S.overT > 1.1) label('TAP TO PLAY AGAIN', CX, CY + 32, 7, INK, 0, 0.6 + 0.4 * Math.sin(S.time * 5));
    }
    if (S.attract) {
      glass(CX - 104, H - 86, 208, 44, 14, 0.74);
      label('TAP TO PLAY', CX, H - 64, 11, INK, 0, 0.75 + 0.25 * Math.sin(S.time * 4));
    }
  }
  function stationDir(p) { var r = p.rot === 180 ? -1 : 1; return [0, -r]; }

  function draw() {
    ctx.save();
    if (S.shake > 0 && !reduced) ctx.translate((Math.random() - 0.5) * S.shake * 7, (Math.random() - 0.5) * S.shake * 7);
    ctx.drawImage(bg, 0, 0, W, H);
    drawPlate(); drawGates(); drawHub(); drawPieces();
    S.seats.forEach(drawSticks); drawFly(); drawFlash();
    ctx.restore();
    drawHud(); drawOverlays();
  }

  function frame(t) {
    var dt = Math.min(0.033, (t - lastT) / 1000 || 0); lastT = t;
    if (!document.hidden) { update(dt); draw(); }
    requestAnimationFrame(frame);
  }

  /* ---------- input ---------- */
  function seatAt(x, y) {
    if (S.seats.length > 1 && S.seats[1].bot) return 0;
    if (S.n === 2) return y > CY ? 0 : 1;
    if (S.n === 3) return y > CY ? 0 : (x > CX ? 1 : 2);
    return y > CY ? (x < CX ? 0 : 1) : (x > CX ? 2 : 3);
  }
  function onPointer(e) {
    e.preventDefault(); wake();
    if (S.attract) { reset(false); return; }
    var r = canvas.getBoundingClientRect();
    tap(seatAt((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H));
  }
  var KEYS = { 2: { ' ': 0, ArrowDown: 0, Enter: 1, ArrowUp: 1 }, 3: { ' ': 0, ArrowDown: 0, p: 1, q: 2 }, 4: { z: 0, m: 1, p: 2, q: 3 } };
  function onKey(e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key, map = KEYS[S.n], i = map[k];
    if (i == null || e.repeat) return;
    e.preventDefault(); wake();
    if (S.attract) { reset(false); return; }
    if (S.seats.length > 1 && S.seats[1].bot) i = 0;
    if (!S.seats[i].bot) tap(i);
  }

  function mount(el, opts) {
    canvas = el; ctx = canvas.getContext('2d'); onState = opts && opts.onState;
    var dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduced = false; }
    makeBackground(); reset(true);
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('keydown', onKey);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    requestAnimationFrame(frame);
  }

  function legend() {
    var saved = ctx;
    [['lg-dump', 'dump', 0], ['lg-bun', 'bun', 0], ['lg-chili', 'chili', 0], ['lg-gold', 'bun', 1]].forEach(function (d) {
      var el = document.getElementById(d[0]); if (!el) return;
      ctx = el.getContext('2d'); ctx.save(); ctx.clearRect(0, 0, 88, 88); ctx.translate(44, 44); ctx.scale(1.5, 1.5); drawFood(d[1], !!d[2]); ctx.restore();
    });
    ctx = saved;
  }

  window.LazySusan = {
    mount: mount, legend: legend, cfg: cfg, T: T,
    set: function (patch, keepAttract) { for (var k in patch) cfg[k] = patch[k]; reset(keepAttract ? S.attract : false); },
    restart: function () { reset(false); },
    state: function () { return S; },
    tap: function (i) { if (S.attract) reset(false); else tap(i); }
  };
})();
