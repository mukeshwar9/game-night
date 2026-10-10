(function () {
  'use strict';
  // Rules numbers are STARTING VALUES for playtest, not tuned or sourced (see the report's numbers table).
  var W = 360, H = 540, CX = 180, CY = 270, R = 68, PIN = 44, FLY = 900;
  var CLINK = 0.17, GRAB = 0.16, SHAVE = 0.11, MAXPINS = 16, WHEELS = 3, SHOT_S = 7, STUN_S = 0.8, WHEEL_S = 15;
  var QUIVER = { 2: 8, 3: 6, 4: 5 };
  var PAT = [
    function (t) { return 1.5 * t; },
    function (t) { return 2.0 * t + 0.9 * Math.sin(1.3 * t); },
    function (t) { return 1.2 * t + 2.2 * Math.sin(0.9 * t); }
  ];
  var LEVEL = { easy: 0.13, normal: 0.06, hard: 0.02 };
  var RM = false;
  try { RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { RM = false; }
  var THEMES = __THEMES__, cur = 'matcha', P = {};
  function T(name) { return THEMES[cur].c[name].split(' ').map(Number); }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : a) + ')'; }
  function shade(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }
  function tint(c, f) { return [c[0] + (255 - c[0]) * f, c[1] + (255 - c[1]) * f, c[2] + (255 - c[2]) * f]; }
  function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
  function lum(c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
  function hue(c) { var mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), d = mx - mn; if (d < 12) return null; var h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; return (h * 60 + 360) % 360; }
  var SEAT, GOLD, RED, SKY, INK = [16, 18, 28];
  // fx: pull a fixed "real material" colour (wood, brass, spark) toward the theme. A theme with no colour at
  // all (1-BIT MONO) turns it grey; a one-hue theme (AMBER CRT) soaks it in that hue; other themes tint it lightly.
  function fx(c) {
    var l = lum(c), o;
    if (P.grey) return [l, l, l];
    o = mix(c, [P.key[0] * l / P.keyL, P.key[1] * l / P.keyL, P.key[2] * l / P.keyL].map(function (v) { return Math.min(255, v); }), P.soak);
    return P.light ? shade(o, 0.9) : o;
  }
  function setPalette(id) {
    cur = id; var th = THEMES[id], light = th.light, bg = T('bg'), sf = T('surface'), cta = T('cta'), hs, spread = 0, i, j;
    SEAT = [T('p1'), T('p2'), T('p3'), T('p4')];
    hs = [T('p1'), T('p2'), cta, T('p3')].map(hue).filter(function (h) { return h != null; });
    for (i = 0; i < hs.length; i++) for (j = 0; j < hs.length; j++) spread = Math.max(spread, Math.min(Math.abs(hs[i] - hs[j]), 360 - Math.abs(hs[i] - hs[j])));
    P = { light: light, grey: hs.length === 0, soak: hs.length && spread < 50 ? 0.72 : 0.2, key: cta, keyL: Math.max(40, lum(cta)) };
    P.blend = light ? 'source-over' : 'lighter';
    P.clothA = light ? tint(sf, 0.35) : mix(sf, T('structure'), 0.28); P.clothB = light ? mix(bg, T('border'), 0.1) : mix(bg, sf, 0.6); P.clothC = light ? mix(T('deep'), T('border'), 0.55) : shade(bg, 0.55);
    P.vig = light ? 0.2 : 0.5; P.shadow = light ? 0.36 : 0.62; P.mote = light ? T('dim') : T('text');
    P.wood = fx([224, 180, 122]); P.band1 = T('danger'); P.band2 = light ? T('dim') : mix(T('structure'), T('p1'), 0.4);
    P.star = light ? cta : tint(cta, 0.1); P.gold = light ? T('win') : mix(T('win'), cta, 0.4); P.flip = mix(T('structure'), T('p2'), 0.45);
    P.ol = light ? T('card') : shade(bg, 0.7); P.bannerBg = T('card'); P.bannerInk = cta;
    GOLD = P.star; RED = T('danger'); SKY = P.flip;
    var ph = document.getElementById('phone'), k;
    for (k in th.c) ph.style.setProperty('--c-' + k, th.c[k]);
    ph.style.setProperty('--frame', (light ? T('text') : mix(bg, T('structure'), 0.4)).map(Math.round).join(' '));
    ph.style.setProperty('--bz', (light ? shade(T('text'), 0.5) : shade(bg, 0.45)).map(Math.round).join(' '));
    ph.style.setProperty('--stat', (light ? T('card') : T('text')).join(' '));
  }
  var arena = document.getElementById('arena'), cv = document.getElementById('cv'), g = cv.getContext('2d');
  var over = document.getElementById('over'), ovT = document.getElementById('ovT'), ovS = document.getElementById('ovS');
  var stL = document.getElementById('stL'), stR = document.getElementById('stR');
  var opt = { mode: '2', level: 'normal', shave: true, items: true, turns: false, sight: true, coop: false, sound: true };
  var S = null, pads = [], audio = null, SPR = {}, motes = [], wallT = 0;

  function norm(a) { a = a % (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; }
  function adist(a, b) { return Math.abs(norm(a - b)); }
  function gauss() { var u = 0, i; for (i = 0; i < 6; i++) u += Math.random(); return (u - 3) / 0.7071; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function outBack(x) { x = clamp01(x); var c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
  function outCubic(x) { x = clamp01(x); return 1 - Math.pow(1 - x, 3); }

  // ── sprites: every textured object is painted once to an offscreen canvas ──
  function sprite(w, h, paint) {
    var c = document.createElement('canvas'), k = 3; c.width = Math.ceil(w * k); c.height = Math.ceil(h * k);
    var x = c.getContext('2d'); x.scale(k, k); paint(x, w, h); c.lw = w; c.lh = h; return c;
  }
  function put(s, x, y, ang, sc, alpha) {
    g.save(); g.translate(x, y); if (ang) g.rotate(ang); if (sc != null && sc !== 1) g.scale(sc, sc);
    if (alpha != null) g.globalAlpha = alpha; g.drawImage(s, -s.lw / 2, -s.lh / 2, s.lw, s.lh); g.restore();
  }
  function starPath(x, n, ro, ri) { var i, a; x.beginPath(); for (i = 0; i < n * 2; i++) { a = Math.PI * i / n - Math.PI / 2; x.lineTo(Math.cos(a) * (i % 2 ? ri : ro), Math.sin(a) * (i % 2 ? ri : ro)); } x.closePath(); }

  function buildSprites() {
    SPR.table = sprite(W, H, function (x) {
      var gr = x.createRadialGradient(CX - 50, CY - 120, 20, CX, CY, 420);
      gr.addColorStop(0, rgba(P.clothA)); gr.addColorStop(0.5, rgba(P.clothB)); gr.addColorStop(1, rgba(P.clothC));
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      var i; // woven cloth grain
      for (i = 0; i < 5200; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.07)'; x.fillRect(Math.random() * W, Math.random() * H, 1.2, 0.6); }
      x.strokeStyle = rgba(P.mote, 0.12); x.lineWidth = 1; x.setLineDash([2, 5]);
      x.beginPath(); x.arc(CX, CY, R + PIN + 22, 0, 7); x.stroke(); x.setLineDash([]);
      var v = x.createRadialGradient(CX, CY, 150, CX, CY, 360); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,' + P.vig + ')');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    });
    var D = R * 2 + 16;
    SPR.wheel = sprite(D, D, function (x) {
      var i, k, a, r, rr; x.translate(D / 2, D / 2);
      x.fillStyle = rgba(shade(P.wood, 0.3)); x.beginPath();              // bark, slightly ragged
      for (i = 0; i <= 72; i++) { a = i / 72 * Math.PI * 2; rr = R + Math.sin(i * 2.7) * 0.9 + Math.sin(i * 0.9) * 0.8; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      x.closePath(); x.fill();
      var wd = x.createRadialGradient(-6, -4, 2, 0, 0, R - 4);
      wd.addColorStop(0, rgba(tint(P.wood, 0.12))); wd.addColorStop(0.6, rgba(shade(P.wood, 0.93))); wd.addColorStop(1, rgba(shade(P.wood, 0.76)));
      x.fillStyle = wd; x.beginPath(); x.arc(0, 0, R - 4.5, 0, 7); x.fill();
      x.save(); x.beginPath(); x.arc(0, 0, R - 4.5, 0, 7); x.clip();
      for (r = 5; r < R - 5; r += 3.1 + Math.random() * 2.4) {    // growth rings, each a wobbly loop
        var p1 = Math.random() * 6, p2 = Math.random() * 6, am = 0.5 + Math.random() * 1.3;
        x.strokeStyle = rgba(shade(P.wood, 0.48), 0.18 + Math.random() * 0.3); x.lineWidth = 0.6 + Math.random() * 1.1; x.beginPath();
        for (i = 0; i <= 64; i++) { a = i / 64 * Math.PI * 2; rr = r + Math.sin(a * 3 + p1) * am + Math.sin(a * 7 + p2) * am * 0.4; x.lineTo(Math.cos(a) * rr - 2, Math.sin(a) * rr - 1); }
        x.closePath(); x.stroke();
      }
      for (k = 0; k < 4; k++) {                                   // drying cracks
        a = Math.random() * 7; x.strokeStyle = rgba(shade(P.wood, 0.26), 0.55); x.lineWidth = 1.1; x.beginPath(); x.moveTo(Math.cos(a) * 3, Math.sin(a) * 3);
        for (r = 8; r < 26 + Math.random() * 30; r += 6) { a += (Math.random() - 0.5) * 0.16; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.stroke();
      }
      x.globalCompositeOperation = 'multiply';                    // paint soaks into the grain
      x.strokeStyle = rgba(P.band1, 0.85); x.lineWidth = R * 0.14; x.beginPath(); x.arc(0, 0, R * 0.7, 0, 7); x.stroke();
      x.strokeStyle = rgba(P.band2, 0.75); x.lineWidth = R * 0.1; x.beginPath(); x.arc(0, 0, R * 0.36, 0, 7); x.stroke();
      x.fillStyle = rgba(P.band1, 0.5); x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R * 0.62, -0.22, 0.22); x.closePath(); x.fill();
      x.globalCompositeOperation = 'source-over';
      for (k = 0; k < 90; k++) { x.fillStyle = 'rgba(255,240,210,' + Math.random() * 0.12 + ')'; a = Math.random() * 7; r = Math.random() * R; x.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2.5, 0.7); }
      x.restore();
      for (k = 0; k < 12; k++) { a = k / 12 * Math.PI * 2; x.strokeStyle = rgba(shade(P.wood, 0.2), 0.6); x.lineWidth = 1.4; x.beginPath(); x.moveTo(Math.cos(a) * (R - 9), Math.sin(a) * (R - 9)); x.lineTo(Math.cos(a) * (R - 5), Math.sin(a) * (R - 5)); x.stroke(); }
    });
    SPR.light = sprite(D, D, function (x) {                       // fixed lighting laid over the turning wood
      x.translate(D / 2, D / 2); x.beginPath(); x.arc(0, 0, R + 1, 0, 7); x.clip();
      var hi = x.createRadialGradient(-R * 0.45, -R * 0.55, 0, -R * 0.45, -R * 0.55, R * 1.25);
      hi.addColorStop(0, 'rgba(255,250,235,0.34)'); hi.addColorStop(0.55, 'rgba(255,250,235,0.04)'); hi.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = hi; x.fillRect(-D, -D, D * 2, D * 2);
      var lo = x.createRadialGradient(R * 0.5, R * 0.6, 0, R * 0.5, R * 0.6, R * 1.2);
      lo.addColorStop(0, 'rgba(20,8,0,0.34)'); lo.addColorStop(1, 'rgba(20,8,0,0)'); x.fillStyle = lo; x.fillRect(-D, -D, D * 2, D * 2);
      var bev = x.createLinearGradient(-R, -R, R, R); bev.addColorStop(0, 'rgba(255,236,200,0.75)'); bev.addColorStop(0.5, 'rgba(255,236,200,0)'); bev.addColorStop(1, 'rgba(0,0,0,0.6)');
      x.strokeStyle = bev; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, R - 1.5, 0, 7); x.stroke();
    });
    SPR.shadow = sprite(D + 60, D + 60, function (x, w) {
      var s = x.createRadialGradient(w / 2, w / 2, R * 0.55, w / 2, w / 2, R + 26);
      s.addColorStop(0, 'rgba(0,0,0,' + P.shadow + ')'); s.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = s; x.fillRect(0, 0, w, w);
    });
    SPR.hub = sprite(26, 26, function (x) {
      x.translate(13, 13);
      var m = x.createRadialGradient(-3, -4, 1, 0, 0, 11); m.addColorStop(0, 'rgb(255,255,255)'); m.addColorStop(0.35, 'rgb(186,192,204)'); m.addColorStop(1, 'rgb(58,62,74)');
      x.fillStyle = m; x.beginPath(); x.arc(0, 0, 10.5, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1; x.stroke();
    });
    SPR.dart = SEAT.map(function (c) { return dartSprite(c, false); });
    SPR.dartShadow = dartSprite(INK, true);
    SPR.star = sprite(34, 34, function (x) { x.translate(17, 17); gem(x, 5, 12.5, 5.6, GOLD); });
    SPR.gold = sprite(52, 52, function (x) {
      x.translate(26, 26); gem(x, 8, 19, 11.5, P.gold);
      x.fillStyle = rgba(shade(P.gold, 0.3)); x.font = '9px "Press Start 2P", monospace'; x.textAlign = 'center'; x.fillText('3', 1, 5);
      x.fillStyle = 'rgba(255,246,210,0.9)'; x.fillText('3', 0.4, 4.2);
    });
    SPR.bomb = sprite(40, 44, function (x) {
      x.translate(20, 25);
      var b = x.createRadialGradient(-4, -5, 1, 0, 0, 13); b.addColorStop(0, 'rgb(150,156,172)'); b.addColorStop(0.3, 'rgb(58,60,72)'); b.addColorStop(1, 'rgb(8,8,12)');
      x.fillStyle = b; x.beginPath(); x.arc(0, 0, 12, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.ellipse(-4.5, -5.5, 2.6, 1.5, -0.7, 0, 7); x.fill();
      var cap = x.createLinearGradient(-4, 0, 4, 0); cap.addColorStop(0, 'rgb(120,84,26)'); cap.addColorStop(0.5, 'rgb(244,206,112)'); cap.addColorStop(1, 'rgb(104,70,20)');
      x.fillStyle = cap; x.fillRect(-4, -15.5, 8, 5);
      x.strokeStyle = 'rgb(214,196,160)'; x.lineWidth = 1.8; x.lineCap = 'round'; x.beginPath(); x.moveTo(0, -15); x.quadraticCurveTo(2, -22, 9, -20); x.stroke();
    });
    SPR.flip = sprite(34, 34, function (x) {
      x.translate(17, 17);
      var t = x.createRadialGradient(-4, -5, 1, 0, 0, 14); t.addColorStop(0, 'rgb(255,255,255)'); t.addColorStop(0.3, rgba(tint(P.flip, 0.35))); t.addColorStop(1, rgba(shade(P.flip, 0.5)));
      x.fillStyle = t; x.beginPath(); x.arc(0, 0, 12.5, 0, 7); x.fill(); x.strokeStyle = rgba(shade(P.flip, 0.25)); x.lineWidth = 1.4; x.stroke();
      x.strokeStyle = 'rgb(255,255,255)'; x.lineWidth = 2.6; x.lineCap = 'round'; x.beginPath(); x.arc(0, 0, 6.5, 0.7, 5.1); x.stroke();
      x.fillStyle = 'rgb(255,255,255)'; x.beginPath(); x.moveTo(6.5, -7.5); x.lineTo(-1, -9); x.lineTo(4, -1.5); x.closePath(); x.fill();
    });
    SPR.glint = sprite(24, 24, function (x) {
      x.translate(12, 12); var q = x.createRadialGradient(0, 0, 0, 0, 0, 11); q.addColorStop(0, 'rgba(255,255,255,1)'); q.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = q; x.beginPath(); x.moveTo(0, -11); x.quadraticCurveTo(1.4, -1.4, 11, 0); x.quadraticCurveTo(1.4, 1.4, 0, 11); x.quadraticCurveTo(-1.4, 1.4, -11, 0); x.quadraticCurveTo(-1.4, -1.4, 0, -11); x.fill();
    });
  }
  function gem(x, n, ro, ri, c) {                                 // bevelled metal star
    x.save(); x.translate(1.2, 1.8); starPath(x, n, ro, ri); x.fillStyle = 'rgba(0,0,0,0.45)'; x.fill(); x.restore();
    starPath(x, n, ro, ri); var o = x.createLinearGradient(-ro, -ro, ro, ro);
    o.addColorStop(0, rgba(tint(c, 0.65))); o.addColorStop(0.5, rgba(c)); o.addColorStop(1, rgba(shade(c, 0.5))); x.fillStyle = o; x.fill();
    x.strokeStyle = rgba(shade(c, 0.36)); x.lineWidth = 1.2; x.lineJoin = 'round'; x.stroke();
    starPath(x, n, ro * 0.62, ri * 0.62); var i2 = x.createLinearGradient(-ro, -ro, ro, ro);
    i2.addColorStop(0, rgba(tint(c, 0.85))); i2.addColorStop(1, rgba(shade(c, 0.78))); x.fillStyle = i2; x.fill();
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.ellipse(-ro * 0.28, -ro * 0.34, ro * 0.16, ro * 0.08, -0.7, 0, 7); x.fill();
  }
  // An arrow drawn pointing left: steel head at the left end, fletching at the right.
  function dartSprite(c, flat) {
    var L = PIN + 20, Hh = 22;
    return sprite(L, Hh, function (x) {
      var m = Hh / 2, q, k;
      q = x.createLinearGradient(0, m - 5, 0, m + 5); q.addColorStop(0, 'rgb(250,252,255)'); q.addColorStop(0.5, 'rgb(170,178,194)'); q.addColorStop(1, 'rgb(70,76,92)');
      x.fillStyle = flat ? 'rgb(0,0,0)' : q; x.beginPath(); x.moveTo(0, m); x.lineTo(13, m - 4.6); x.lineTo(10.5, m); x.lineTo(13, m + 4.6); x.closePath(); x.fill();   // broadhead
      q = x.createLinearGradient(0, m - 2, 0, m + 2); q.addColorStop(0, rgba(shade(P.wood, 0.5))); q.addColorStop(0.35, rgba(tint(P.wood, 0.2))); q.addColorStop(1, rgba(shade(P.wood, 0.4)));
      x.fillStyle = flat ? 'rgb(0,0,0)' : q; x.fillRect(10, m - 1.7, L - 13, 3.4);                                    // wooden shaft
      if (!flat) { x.fillStyle = rgba(shade(P.wood, 0.28)); x.fillRect(10, m - 2, 3, 4); x.fillStyle = rgba(shade(c, 0.5)); x.fillRect(L - 24, m - 2, 2.2, 4); x.fillRect(L - 5, m - 2, 2.2, 4); }
      x.fillStyle = flat ? 'rgb(0,0,0)' : rgba(tint(c, 0.28)); x.beginPath(); x.moveTo(L - 22, m - 1.6); x.quadraticCurveTo(L - 17, m - 10, L - 6, m - 8.5); x.lineTo(L - 4, m - 1.6); x.closePath(); x.fill();   // upper vane
      x.fillStyle = flat ? 'rgb(0,0,0)' : rgba(shade(c, 0.68)); x.beginPath(); x.moveTo(L - 22, m + 1.6); x.quadraticCurveTo(L - 17, m + 10, L - 6, m + 8.5); x.lineTo(L - 4, m + 1.6); x.closePath(); x.fill();   // lower vane
      if (flat) return;
      x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 0.6;
      for (k = 0; k < 5; k++) { x.beginPath(); x.moveTo(L - 19 + k * 3, m - 2); x.lineTo(L - 15 + k * 3, m - 7.6); x.stroke(); }
      x.strokeStyle = 'rgba(0,0,0,0.3)';
      for (k = 0; k < 5; k++) { x.beginPath(); x.moveTo(L - 19 + k * 3, m + 2); x.lineTo(L - 15 + k * 3, m + 7.6); x.stroke(); }
      x.fillStyle = rgba(tint(c, 0.6)); x.fillRect(L - 3.5, m - 2.2, 3.5, 4.4);                                       // nock
    });
  }
  // tipX,tipY is where the point is; ang is the direction from tip towards the flights.
  function drawDart(s, tipX, tipY, ang, alpha, sc) {
    g.save(); g.translate(tipX, tipY); g.rotate(ang); if (sc) g.scale(sc, sc); if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(s, 0, -s.lh / 2, s.lw, s.lh); g.restore();
  }

  function seats(n) {
    if (n === 2) return [{ x: 180, y: 486, r: 0 }, { x: 180, y: 54, r: 1 }];
    if (n === 3) return [{ x: 56, y: 486, r: 0 }, { x: 304, y: 486, r: 0 }, { x: 180, y: 54, r: 1 }];
    return [{ x: 56, y: 486, r: 0 }, { x: 304, y: 486, r: 0 }, { x: 304, y: 54, r: 1 }, { x: 56, y: 54, r: 1 }];
  }

  function tone(f, d, type, vol, slide) {
    if (!opt.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), v = audio.createGain(), t = audio.currentTime;
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      v.gain.setValueAtTime(vol || 0.05, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(v); v.connect(audio.destination); o.start(); o.stop(t + d);
    } catch (e) { /* no audio in this frame */ }
  }
  function thunk() { tone(190, 0.09, 'triangle', 0.12, 70); tone(900, 0.03, 'square', 0.02); }

  function theta(t) { return S.off + S.dir * PAT[S.pat](t); }

  // ── particles ──
  function emit(kind, x, y, n, o) {
    o = o || {}; if (RM) n = Math.ceil(n * 0.3);
    for (var i = 0; i < n && S.parts.length < 220; i++) {
      var a = (o.dir == null ? Math.random() * 6.283 : o.dir + (Math.random() - 0.5) * (o.spread || 1.2)), sp = (o.speed || 120) * (0.35 + Math.random());
      S.parts.push({ k: kind, x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: (o.life || 0.5) * (0.6 + Math.random() * 0.7),
        s: (o.size || 2) * (0.6 + Math.random() * 0.9), c: fx(o.color || GOLD), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, grav: o.grav == null ? 420 : o.grav });
    }
  }
  function ring(x, y, c, r1) { S.parts.push({ k: 'ring', x: x, y: y, vx: 0, vy: 0, t: 0, life: 0.38, s: r1 || 34, c: c, rot: 0, vr: 0, grav: 0 }); }

  function deal() {
    var n = S.players.length, count = n > 2 ? 6 : 5, items = [], tries = 0, a, ok, i, kinds = [];
    for (i = 0; i < count; i++) kinds.push('star');
    if (opt.items) kinds.push('gold', 'bomb', 'flip');
    while (items.length < kinds.length && tries++ < 4000) {
      a = (Math.random() * 2 - 1) * Math.PI; ok = true;
      for (i = 0; i < items.length; i++) if (adist(a, items[i].a) < 0.52) ok = false;
      if (ok) items.push({ a: a, kind: kinds[items.length], ph: Math.random() * 6 });
    }
    S.items = items; S.pins = []; S.intro = 0;
  }

  function newMatch() {
    var n = opt.mode === 'bot' ? 2 : +opt.mode, st = seats(n), i;
    S = { players: [], tau: 0, off: 0, dir: 1, pat: 0, wheel: 0, turn: 0, starter: 0, fly: [], fx: [], parts: [], pins: [], items: [],
      hearts: 3, clock: SHOT_S, wt: WHEEL_S, pause: 1.1, banner: 'WHEEL 1', bannerT: 0, done: false, shake: 0, stop: 0, bot: null,
      kx: 0, ky: 0, kvx: 0, kvy: 0, intro: 0, flash: 0 };
    for (i = 0; i < n; i++) {
      S.players.push({ x: st[i].x, y: st[i].y, r: opt.mode === 'bot' ? 0 : st[i].r, phi: Math.atan2(st[i].y - CY, st[i].x - CX),
        score: 0, cool: 0, stun: 0, ammo: QUIVER[n], bot: opt.mode === 'bot' && i === 1 });
    }
    if (opt.coop) S.banner = 'TEAM UP!';
    deal(); buildPads(); over.classList.remove('on');
  }

  function buildPads() {
    pads.forEach(function (b) { b.remove(); }); pads = [];
    S.players.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pad' + (p.r ? ' r' : '');
      b.style.left = (p.x / W * 100) + '%'; b.style.top = (p.y / H * 100) + '%';
      b.style.setProperty('--pc', SEAT[i].join(' ')); b.style.setProperty('--pt', lum(SEAT[i]) > 150 ? '20 22 30' : '255 255 255'); b.style.setProperty('--ps', lum(SEAT[i]) > 150 ? '255 255 255' : '0 0 0');
      b.setAttribute('aria-label', 'Player ' + (i + 1) + ' throw');
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); if (!p.bot) tryThrow(i); });
      b.addEventListener('click', function (e) { e.preventDefault(); });
      arena.insertBefore(b, over); pads.push(b);
    });
  }

  function reach(p) { return Math.hypot(p.x - CX, p.y - CY) - 34; }
  function flight(p) { return (reach(p) - R) / FLY; }

  function canThrow(i) {
    var p = S.players[i];
    if (S.done || S.pause > 0) return false;
    if (!opt.turns) return p.cool <= 0 && p.stun <= 0 && p.ammo > 0;
    return S.turn === i && S.fly.length === 0;
  }

  function tryThrow(i) {
    if (!canThrow(i)) return;
    var p = S.players[i];
    S.fly.push({ o: i, d: reach(p), d0: reach(p) });
    p.cool = 0.4; S.clock = SHOT_S; if (!opt.turns) p.ammo--; tone(620, 0.11, 'sawtooth', 0.03, 180);
    emit('dust', p.x - Math.cos(p.phi) * 30, p.y - Math.sin(p.phi) * 30, 5, { dir: p.phi + Math.PI, spread: 1.4, speed: 60, life: 0.3, size: 1.6, color: tint(SEAT[i], 0.5), grav: 0 });
  }

  function float(txt, a, c, big) { S.fx.push({ t: 0, txt: txt, x: CX + Math.cos(a) * (R + 70), y: CY + Math.sin(a) * (R + 70), c: c, big: big }); }
  function kick(a, f) { if (RM) return; S.kvx -= Math.cos(a) * f; S.kvy -= Math.sin(a) * f; }
  function fling(o, a, out) { S.fx.push({ t: 0, bounce: true, o: o, a: a, vx: (Math.random() - 0.5) * 260, s: Math.random() < 0.5 ? -1 : 1, out: out }); }

  function land(f) {
    var p = S.players[f.o], a = norm(p.phi - theta(S.tau)), i, near = 9, hit = -1, gain = 0;
    var ix = CX + Math.cos(p.phi) * R, iy = CY + Math.sin(p.phi) * R;
    for (i = 0; i < S.pins.length; i++) near = Math.min(near, adist(a, S.pins[i].a));
    if (near < CLINK) {
      fling(f.o, p.phi, false); S.shake = 0.28; if (!RM) S.stop = 0.06; kick(p.phi, 260);
      emit('spark', ix + Math.cos(p.phi) * 30, iy + Math.sin(p.phi) * 30, 22, { speed: 260, life: 0.35, size: 2.2, color: [255, 226, 150], grav: 300 });
      ring(ix + Math.cos(p.phi) * 30, iy + Math.sin(p.phi) * 30, [255, 240, 200], 30);
      tone(1800, 0.05, 'square', 0.05, 900); tone(140, 0.2, 'sawtooth', 0.06, 60);
      for (i = 0; i < S.pins.length; i++) if (adist(a, S.pins[i].a) < CLINK) S.pins[i].w = 0;   // the struck dart shivers too
      if (opt.coop) { S.hearts--; float('CLINK! -1 HEART', p.phi, RED, true); }
      else { if (p.score > 0) p.score--; float('CLINK -1', p.phi, RED, true); }
      if (!opt.turns) p.stun = STUN_S;
      return;
    }
    kick(p.phi, 150); thunk();
    emit('chip', ix, iy, 9, { dir: p.phi, spread: 1.7, speed: 150, life: 0.5, size: 2.4, color: [206, 160, 104] });
    emit('dust', ix, iy, 6, { dir: p.phi, spread: 2.2, speed: 50, life: 0.6, size: 3, color: [230, 210, 180], grav: -20 });
    for (i = 0; i < S.items.length; i++) if (adist(a, S.items[i].a) < GRAB) hit = i;
    var ex = CX + Math.cos(p.phi) * (R + 16), ey = CY + Math.sin(p.phi) * (R + 16);
    if (hit >= 0) {
      var k = S.items.splice(hit, 1)[0].kind;
      if (k === 'star') { gain = 1; float('+1', p.phi, GOLD, true); tone(880, 0.09, 'square', 0.05); tone(1320, 0.14, 'square', 0.04); emit('spark', ex, ey, 16, { speed: 190, life: 0.5, size: 2.4, color: GOLD, grav: 240 }); ring(ex, ey, GOLD); }
      if (k === 'gold') { gain = 3; float('GOLD +3', p.phi, [255, 190, 80], true); tone(784, 0.1, 'square', 0.05); tone(1175, 0.12, 'square', 0.05); tone(1568, 0.3, 'square', 0.05); emit('spark', ex, ey, 40, { speed: 280, life: 0.8, size: 3, color: [255, 200, 90], grav: 260 }); ring(ex, ey, [255, 220, 140], 60); S.flash = 0.25; }
      if (k === 'flip') { var th = theta(S.tau); S.dir = -S.dir; S.off = th - S.dir * PAT[S.pat](S.tau); float('REVERSE', p.phi, SKY, true); tone(330, 0.2, 'triangle', 0.08, 660); emit('spark', ex, ey, 14, { speed: 160, life: 0.5, size: 2.2, color: SKY, grav: 0 }); ring(CX, CY, SKY, R + 30); }
      if (k === 'bomb') {
        S.pins.forEach(function (q) { fling(q.o, norm(q.a + theta(S.tau)), true); });
        S.pins = []; float('BOOM!', p.phi, RED, true); S.shake = 0.45; S.flash = 0.35; if (!RM) S.stop = 0.08; kick(p.phi, 520);
        tone(110, 0.45, 'sawtooth', 0.12, 30); tone(60, 0.5, 'square', 0.1, 25);
        emit('spark', ex, ey, 44, { speed: 380, life: 0.6, size: 3, color: [255, 170, 70], grav: 200 });
        emit('smoke', ex, ey, 12, { speed: 70, life: 1.0, size: 12, color: [70, 70, 80], grav: -40 });
        ring(ex, ey, [255, 220, 170], 120); fling(f.o, p.phi, false); return;
      }
    } else if (opt.shave && near < CLINK + SHAVE) { gain = 1; float('CLOSE SHAVE +1', p.phi, [200, 160, 255], true); tone(700, 0.08, 'square', 0.05); tone(990, 0.14, 'square', 0.05); emit('spark', ix, iy, 12, { speed: 150, life: 0.4, size: 2, color: [210, 180, 255], grav: 0 }); }
    p.score += gain;
    S.pins.push({ a: a, o: f.o, w: 0, sg: Math.random() < 0.5 ? -1 : 1 });
  }

  function left() { var n = 0; S.items.forEach(function (it) { if (it.kind === 'star' || it.kind === 'gold') n++; }); return n; }

  function finish() {
    S.done = true;
    var best = -1, who = [];
    if (opt.coop) {
      ovT.textContent = S.hearts > 0 ? 'WHEELS CLEARED!' : 'OUT OF HEARTS';
      ovS.textContent = 'TEAM STARS ' + S.players.reduce(function (s, p) { return s + p.score; }, 0);
    } else {
      S.players.forEach(function (p, j) { if (p.score > best) { best = p.score; who = [j]; } else if (p.score === best) who.push(j); });
      ovT.textContent = who.length > 1 ? 'DRAW' : (S.players[who[0]].bot ? 'BOT WINS' : 'P' + (who[0] + 1) + ' WINS');
      ovS.textContent = S.players.map(function (p, j) { return (p.bot ? 'BOT' : 'P' + (j + 1)) + ' ' + p.score; }).join(' · ');
    }
    over.classList.add('on'); tone(660, 0.12, 'square', 0.05); tone(990, 0.3, 'square', 0.05);
  }

  function clearPins() { var th = theta(S.tau); S.pins.forEach(function (q) { fling(q.o, norm(q.a + th), true); }); }

  function nextWheel() {
    clearPins(); tone(240, 0.25, 'triangle', 0.07, 520);
    S.wheel++;
    if (S.wheel >= WHEELS) { S.pins = []; finish(); return; }
    var th = theta(S.tau); S.pat = S.wheel; S.off = th - S.dir * PAT[S.pat](S.tau);
    S.starter = (S.starter + 1) % S.players.length; S.turn = S.starter; S.clock = SHOT_S;
    S.banner = 'WHEEL ' + (S.wheel + 1); S.bannerT = 0; S.pause = 1.1; deal(); S.bot = null;
    S.players.forEach(function (q) { q.ammo = QUIVER[S.players.length]; q.stun = 0; }); S.wt = WHEEL_S;
  }

  function planBot(i) {
    var p = S.players[i], fl = flight(p), t, a, k, near, best = null, safe = null, ok;
    for (t = 0.3; t < (opt.turns ? 5 : 1.6); t += 1 / 120) {
      a = norm(p.phi - theta(S.tau + t + fl)); near = 9;
      for (k = 0; k < S.pins.length; k++) near = Math.min(near, adist(a, S.pins[k].a));
      if (near < CLINK + 0.07) continue;
      ok = false;
      for (k = 0; k < S.items.length; k++) if (S.items[k].kind !== 'bomb' && adist(a, S.items[k].a) < 0.04) ok = true;
      if (ok) { best = t; break; }
      if (safe == null && near > 0.45) safe = t;
    }
    t = best != null ? best : (safe != null ? safe : 1.2);
    return Math.max(0.2, t + gauss() * LEVEL[opt.level]);
  }

  function visuals(dt) {                                          // runs even during hit-stop and banners
    var i, q;
    for (i = 0; i < S.fx.length; i++) S.fx[i].t += dt;
    S.fx = S.fx.filter(function (f) { return f.t < 1.0; });
    for (i = S.parts.length - 1; i >= 0; i--) {
      q = S.parts[i]; q.t += dt; if (q.t >= q.life) { S.parts.splice(i, 1); continue; }
      q.vy += q.grav * dt; q.vx *= (1 - 1.6 * dt); q.vy *= (1 - 1.6 * dt); q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
    }
    for (i = 0; i < S.pins.length; i++) S.pins[i].w += dt;
    S.kvx += (-420 * S.kx - 17 * S.kvx) * dt; S.kvy += (-420 * S.ky - 17 * S.kvy) * dt; S.kx += S.kvx * dt; S.ky += S.kvy * dt;   // wheel recoil spring
    if (S.shake > 0) S.shake -= dt; if (S.flash > 0) S.flash -= dt;
    S.intro += dt; S.bannerT += dt;
  }

  function step(dt) {
    if (S.done) { visuals(dt); return; }
    visuals(dt);
    if (S.stop > 0) { S.stop -= dt; return; }
    S.tau += dt;
    if (S.pause > 0) { S.pause -= dt; return; }
    var i, p;
    for (i = 0; i < S.players.length; i++) { p = S.players[i]; if (p.cool > 0) p.cool -= dt; if (p.stun > 0) p.stun -= dt; }
    for (i = S.fly.length - 1; i >= 0; i--) {
      var f = S.fly[i]; f.d -= FLY * dt;
      if (f.d <= R) {
        S.fly.splice(i, 1); land(f);
        if (opt.coop && S.hearts <= 0) { finish(); return; }
        if (left() === 0 || (opt.turns && S.pins.length >= MAXPINS)) { nextWheel(); if (S.done) return; }
        else if (opt.turns) { S.turn = (S.turn + 1) % S.players.length; S.clock = SHOT_S; S.bot = null; }
        else S.bot = null;
      }
    }
    if (!opt.turns) {
      S.wt -= dt; if (S.wt <= 0 && S.fly.length === 0) { nextWheel(); if (S.done) return; }
      // everyone's quiver is empty and nothing is in the air: the wheel is over
      if (S.fly.length === 0 && S.players.every(function (q) { return q.ammo <= 0; })) { S.empty = (S.empty || 0) + dt; if (S.empty > 0.7) { S.empty = 0; nextWheel(); if (S.done) return; } }
      else S.empty = 0;
    } else if (S.fly.length === 0) {
      S.clock -= dt;
      if (S.clock <= 0) { float('TOO SLOW', S.players[S.turn].phi, [200, 204, 220]); S.turn = (S.turn + 1) % S.players.length; S.clock = SHOT_S; S.bot = null; }
    }
    for (i = 0; i < S.players.length; i++) {
      p = S.players[i]; if (!p.bot) continue;
      if (canThrow(i)) {
        if (S.bot == null) S.bot = S.tau + planBot(i);
        if (S.tau >= S.bot) { tryThrow(i); S.bot = null; }
      }
    }
  }

  function drawItem(it, th, idx) {
    var a = it.a + th, pop = outBack((S.intro - 0.22 - idx * 0.06) / 0.32); if (pop <= 0) return;
    var bob = 1 + Math.sin(wallT * 3 + it.ph) * 0.05, x = S.wx + Math.cos(a) * (R + 16), y = S.wy + Math.sin(a) * (R + 16);
    g.strokeStyle = rgba(fx([170, 132, 60])); g.lineWidth = 2.5; g.beginPath(); g.moveTo(S.wx + Math.cos(a) * (R - 2), S.wy + Math.sin(a) * (R - 2)); g.lineTo(x, y); g.stroke();   // brass peg
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(x + 5, y + 8, 10 * pop, 5 * pop, 0, 0, 7); g.fill();
    if (it.kind === 'star') put(SPR.star, x, y, Math.sin(wallT * 1.7 + it.ph) * 0.14, pop * bob);
    if (it.kind === 'gold') {
      g.save(); g.globalCompositeOperation = P.blend; g.translate(x, y); g.rotate(wallT * 0.9);
      for (var k = 0; k < 8; k++) { g.rotate(Math.PI / 4); g.fillStyle = rgba(P.gold, P.light ? 0.22 : 0.16); g.beginPath(); g.moveTo(0, 0); g.lineTo(-4, -30 * pop); g.lineTo(4, -30 * pop); g.closePath(); g.fill(); }
      g.restore(); put(SPR.gold, x, y, Math.sin(wallT * 1.3) * 0.1, pop * (1 + Math.sin(wallT * 5) * 0.06));
    }
    if (it.kind === 'bomb') {
      put(SPR.bomb, x, y - 2, Math.sin(wallT * 2.2 + it.ph) * 0.1, pop * bob);
      var ux = x + 9 * pop, fy = y - 22 * pop, fl = 0.6 + Math.random() * 0.4;
      g.save(); g.globalCompositeOperation = P.blend; put(SPR.glint, ux, fy, wallT * 9, 0.55 * fl); g.restore();
      if (!RM && Math.random() < 0.3) emit('spark', ux, fy, 1, { speed: 60, life: 0.3, size: 1.4, color: [255, 190, 90], grav: 160 });
    }
    if (it.kind === 'flip') put(SPR.flip, x, y, -wallT * 1.4 * S.dir, pop * bob);
    var gl = (wallT * 0.55 + it.ph) % 2.6;                         // idle glint sweep
    if (gl < 0.35 && it.kind !== 'bomb') { g.save(); g.globalCompositeOperation = P.blend; put(SPR.glint, x - 4, y - 5, gl * 4, Math.sin(gl / 0.35 * Math.PI) * 0.7); g.restore(); }
  }

  function draw() {
    var th = theta(S.tau), i, p, a, lowest, q;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.drawImage(SPR.table, 0, 0, W, H);
    g.save();
    if (S.shake > 0 && !RM) { var am = 8 * S.shake / 0.3; g.translate((Math.random() - 0.5) * am, (Math.random() - 0.5) * am); }
    // drifting dust in the light: idle life
    for (i = 0; i < motes.length; i++) { q = motes[i]; var mx = (q.x + wallT * q.vx + Math.sin(wallT * q.f) * 8 + W * 4) % W, my = (q.y + wallT * q.vy + H * 4) % H; g.fillStyle = rgba(P.mote, 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(wallT * q.f * 2 + q.x))); g.beginPath(); g.arc(mx, my, q.s, 0, 7); g.fill(); }
    // lanes: chalk dashes that march toward the wheel on the live lane
    for (i = 0; i < S.players.length; i++) {
      p = S.players[i]; var live = !S.done && (opt.turns ? S.turn === i : (p.stun <= 0 && p.ammo > 0));
      g.setLineDash([5, 8]); g.lineDashOffset = live ? wallT * 26 : 0; g.lineWidth = live ? 2.5 : 1.5; g.lineCap = 'round'; g.strokeStyle = rgba(tint(SEAT[i], 0.25), live ? 0.85 : 0.2);
      g.beginPath(); g.moveTo(p.x - Math.cos(p.phi) * 40, p.y - Math.sin(p.phi) * 40); g.lineTo(CX + Math.cos(p.phi) * (R + PIN + 26), CY + Math.sin(p.phi) * (R + PIN + 26)); g.stroke(); g.setLineDash([]);
    }
    if (!opt.turns) for (i = 0; i < S.players.length; i++) {         // quiver: one small arrow per shot left, fanned on the wheel side of the pad
      p = S.players[i]; var nq = QUIVER[S.players.length], back = p.phi + Math.PI;
      for (var z = 0; z < nq; z++) {
        var fa = back + (z - (nq - 1) / 2) * 0.2, qx = p.x + Math.cos(fa) * 52, qy = p.y + Math.sin(fa) * 52;
        if (z < p.ammo) drawDart(SPR.dart[i], qx, qy, fa + Math.PI, 0.95, 0.42);
        else { g.fillStyle = rgba(P.mote, 0.2); g.beginPath(); g.arc(qx + Math.cos(fa) * -8, qy + Math.sin(fa) * -8, 1.6, 0, 7); g.fill(); }
      }
    }
    var sc = outBack(S.intro / 0.5), wx = CX + S.kx, wy = CY + S.ky; S.wx = wx; S.wy = wy;
    put(SPR.shadow, wx + 9, wy + 13, 0, sc);
    for (i = 0; i < S.pins.length; i++) { a = S.pins[i].a + th; drawDart(SPR.dartShadow, wx + Math.cos(a) * (R - 8) + 6, wy + Math.sin(a) * (R - 8) + 9, a, 0.3); }
    put(SPR.wheel, wx, wy, th, sc); put(SPR.light, wx, wy, 0, sc);
    g.save(); g.translate(wx, wy); g.scale(sc, sc); g.drawImage(SPR.hub, -13, -13, 26, 26); g.rotate(th); g.strokeStyle = 'rgba(30,32,40,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke(); g.restore();
    if (S.flash > 0) { g.save(); g.globalCompositeOperation = P.blend; g.fillStyle = 'rgba(255,230,170,' + Math.min(0.5, S.flash * 1.6) + ')'; g.beginPath(); g.arc(wx, wy, R + 60, 0, 7); g.fill(); g.restore(); }
    for (i = 0; i < S.pins.length; i++) {                           // stuck darts shiver, then settle
      q = S.pins[i]; a = q.a + th; var wob = RM ? 0 : q.sg * 0.26 * Math.exp(-8 * q.w) * Math.sin(42 * q.w);
      drawDart(SPR.dart[q.o], wx + Math.cos(a) * (R - 8), wy + Math.sin(a) * (R - 8), a + wob);
    }
    for (i = 0; i < S.items.length; i++) drawItem(S.items[i], th, i);
    // underdog sight
    if (opt.sight && !opt.coop) {
      lowest = Math.min.apply(null, S.players.map(function (z) { return z.score; }));
      var tied = S.players.filter(function (z) { return z.score === lowest; }).length;
      for (i = 0; i < S.players.length; i++) {
        p = S.players[i];
        if (tied === 1 && p.score === lowest && !p.bot && (opt.turns ? S.turn === i : p.ammo > 0)) {
          a = p.phi - (theta(S.tau + flight(p)) - th); var sx = wx + Math.cos(a) * (R + 3), sy = wy + Math.sin(a) * (R + 3), pu = 1 + Math.sin(wallT * 9) * 0.18;
          g.save(); g.globalCompositeOperation = P.blend; g.fillStyle = rgba(SEAT[i], 0.35); g.beginPath(); g.arc(sx, sy, 11 * pu, 0, 7); g.fill(); g.restore();
          g.fillStyle = rgba(tint(SEAT[i], 0.5)); g.strokeStyle = rgba(T('text')); g.lineWidth = 1.5; g.beginPath(); g.arc(sx, sy, 4.5, 0, 7); g.fill(); g.stroke();
        }
      }
    }
    // darts in the air: streak, shrinking as they drop, shadow closing in
    for (i = 0; i < S.fly.length; i++) {
      q = S.fly[i]; p = S.players[q.o]; var u = clamp01((q.d0 - q.d) / (q.d0 - R)), hgt = 1 - u, tx = CX + Math.cos(p.phi) * q.d, ty = CY + Math.sin(p.phi) * q.d;
      drawDart(SPR.dartShadow, tx + 6 + hgt * 16, ty + 9 + hgt * 22, p.phi, 0.22, 1 + hgt * 0.25);
      var ex2 = tx + Math.cos(p.phi) * 120, ey2 = ty + Math.sin(p.phi) * 120, tr = g.createLinearGradient(tx, ty, ex2, ey2);
      tr.addColorStop(0, rgba(tint(SEAT[q.o], 0.5), 0.6)); tr.addColorStop(1, rgba(SEAT[q.o], 0));
      g.save(); g.globalCompositeOperation = P.blend; g.strokeStyle = tr; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(tx + Math.cos(p.phi) * 20, ty + Math.sin(p.phi) * 20); g.lineTo(ex2, ey2); g.stroke(); g.restore();
      drawDart(SPR.dart[q.o], tx, ty, p.phi, 1, 1 + hgt * 0.22);
    }
    // thrown-off darts tumble away under gravity
    for (i = 0; i < S.fx.length; i++) {
      var f = S.fx[i]; if (!f.bounce) continue;
      var rr = R + (f.out ? 0 : 26) + f.t * 260, bx = wx + Math.cos(f.a) * rr + f.vx * f.t, by = wy + Math.sin(f.a) * rr + 520 * f.t * f.t;
      drawDart(SPR.dartShadow, bx + 10, by + 16, f.a + f.s * f.t * 16, 0.18 * (1 - f.t));
      drawDart(SPR.dart[f.o], bx, by, f.a + f.s * f.t * 16, 1 - f.t * f.t);
    }
    // particles
    for (i = 0; i < S.parts.length; i++) {
      q = S.parts[i]; var k = 1 - q.t / q.life;
      if (q.k === 'chip') { g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.fillStyle = rgba(q.c, k); g.fillRect(-q.s, -q.s * 0.4, q.s * 2, q.s * 0.8); g.fillStyle = 'rgba(255,240,210,' + k * 0.6 + ')'; g.fillRect(-q.s, -q.s * 0.4, q.s * 2, 0.6); g.restore(); }
      else if (q.k === 'spark') { g.save(); g.globalCompositeOperation = P.blend; g.strokeStyle = rgba(q.c, k); g.lineWidth = q.s * k + 0.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035); g.stroke(); g.restore(); }
      else if (q.k === 'dust') { g.fillStyle = rgba(q.c, k * 0.4); g.beginPath(); g.arc(q.x, q.y, q.s * (1.6 - k * 0.6), 0, 7); g.fill(); }
      else if (q.k === 'smoke') { g.fillStyle = rgba(q.c, k * 0.4); g.beginPath(); g.arc(q.x, q.y, q.s * (2.4 - k * 1.4), 0, 7); g.fill(); }
      else if (q.k === 'ring') { g.save(); g.globalCompositeOperation = P.blend; g.strokeStyle = rgba(q.c, k * 0.9); g.lineWidth = 5 * k + 0.5; g.beginPath(); g.arc(q.x, q.y, 6 + q.s * outCubic(1 - k), 0, 7); g.stroke(); g.restore(); }
    }
    // score callouts pop in with overshoot, then lift away
    for (i = 0; i < S.fx.length; i++) {
      f = S.fx[i]; if (f.bounce) continue;
      var ps = outBack(f.t / 0.22) * (f.big ? 1.15 : 1), al = 1 - clamp01((f.t - 0.6) / 0.4);
      g.save(); g.translate(Math.max(78, Math.min(W - 78, f.x)), f.y - outCubic(f.t) * 22); g.scale(ps, ps); g.globalAlpha = al;
      g.font = '11px "Press Start 2P", monospace'; g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = rgba(P.ol, 0.95); g.strokeText(f.txt, 0, 0);
      g.fillStyle = rgba(P.light ? shade(fx(f.c), 0.72) : tint(fx(f.c), 0.25)); g.fillText(f.txt, 0, 0); g.restore();
    }
    g.restore();
    if (S.pause > 0 && S.banner && !S.done) {                      // glass banner slides in and out
      var bi = outBack(S.bannerT / 0.3), bo = clamp01(S.pause / 0.2), by2 = CY - 150 - (1 - Math.min(bi, 1)) * 30;
      g.save(); g.globalAlpha = Math.min(1, bi) * bo; g.fillStyle = rgba(P.bannerBg, P.light ? 0.72 : 0.22); g.strokeStyle = rgba(T('border'), 0.9); g.lineWidth = 1;
      g.beginPath(); g.roundRect(CX - 110, by2, 220, 44, 14); g.fill(); g.stroke();
      g.font = '16px "Press Start 2P", monospace'; g.textAlign = 'center'; g.fillStyle = rgba(P.ol, 0.8); g.fillText(S.banner, CX + 1.5, by2 + 31.5); g.fillStyle = rgba(P.bannerInk); g.fillText(S.banner, CX, by2 + 30); g.restore();
    }
    // pads + status (DOM)
    for (i = 0; i < S.players.length; i++) {
      p = S.players[i]; var b = pads[i], on = canThrow(i) && !p.bot;
      var label = opt.coop ? (p.bot ? 'BOT' : 'P' + (i + 1)) : String(p.score);
      var small = opt.turns ? (p.bot ? 'BOT' : (S.turn === i && !S.done ? 'GO ' + Math.ceil(S.clock) : '')) : (p.stun > 0 ? 'STUN' : 'x' + p.ammo);
      var html = '<i>' + label + '</i><small>' + small + '</small>';
      if (b.dataset.h !== html) {
        if (b.dataset.l !== undefined && b.dataset.l !== label) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
        b.innerHTML = html; b.dataset.h = html; b.dataset.l = label;
      }
      b.classList.toggle('off', S.done || !(opt.turns ? S.turn === i : (p.stun <= 0 && p.ammo > 0)));
      b.classList.toggle('go', on && opt.turns);
      b.classList.toggle('stun', p.stun > 0);
    }
    var l = 'WHEEL ' + Math.min(WHEELS, S.wheel + 1) + '/' + WHEELS + (opt.turns || S.done ? '' : '  ' + Math.max(0, Math.ceil(S.wt)) + 's');
    if (opt.coop) l += '  ' + '♥♥♥'.slice(0, Math.max(0, S.hearts)) + '···'.slice(0, 3 - Math.max(0, S.hearts));
    var r = S.done ? 'MATCH OVER' : !opt.turns ? 'EVERYONE SHOOTS' : (S.players[S.turn].bot ? 'BOT' : 'P' + (S.turn + 1)) + ' TO THROW';
    if (opt.coop && !S.done) r = 'STARS ' + S.players.reduce(function (s, z) { return s + z.score; }, 0) + ' · ' + r;
    if (stL.textContent !== l) stL.textContent = l;
    if (stR.textContent !== r) stR.textContent = r;
  }

  var last = 0, acc = 0, frames = 0, slow = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    var el = Math.min(0.05, (ts - (last || ts)) / 1000); last = ts; acc += el; wallT += el;
    frames++; if (el > 0.03) slow++;
    while (acc >= 1 / 120) { acc -= 1 / 120; step(1 / 120); }
    draw();
  }

  function press(group, attr, val) { [].forEach.call(document.querySelectorAll(group + ' .btn'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === val)); }); }
  document.getElementById('modes').addEventListener('click', function (e) {
    var m = e.target.getAttribute('data-mode'); if (!m) return;
    opt.mode = m; press('#modes', 'data-mode', m); document.getElementById('botRow').hidden = m !== 'bot'; newMatch();
  });
  document.getElementById('levels').addEventListener('click', function (e) {
    var m = e.target.getAttribute('data-level'); if (!m) return;
    opt.level = m; press('#levels', 'data-level', m); newMatch();
  });
  ['shave', 'items', 'sight', 'coop', 'sound'].forEach(function (k) {
    var el = document.getElementById('tw-' + k);
    el.addEventListener('change', function () {
      opt[k] = el.checked;
      if (k !== 'sound') newMatch();
    });
  });
  [].forEach.call(document.querySelectorAll('[data-try]'), function (b) {
    b.addEventListener('click', function () {
      var el = document.getElementById('tw-' + b.getAttribute('data-try'));
      if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change')); } else newMatch();
      document.getElementById('play').scrollIntoView({ behavior: 'smooth' });
    });
  });
  var themeRow = document.getElementById('themes');
  Object.keys(THEMES).forEach(function (id) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sw'; b.setAttribute('data-theme-id', id); b.setAttribute('aria-pressed', String(id === cur));
    b.innerHTML = '<span style="background:rgb(' + THEMES[id].c.bg.split(' ').join(',') + ')"></span><span style="background:rgb(' + THEMES[id].c.p1.split(' ').join(',') + ')"></span><span style="background:rgb(' + THEMES[id].c.cta.split(' ').join(',') + ')"></span>' + THEMES[id].label;
    b.addEventListener('click', function () { setPalette(id); buildSprites(); press('#themes', 'data-theme-id', id); newMatch(); });
    themeRow.appendChild(b);
  });
  document.getElementById('restart').addEventListener('click', newMatch);
  document.getElementById('again').addEventListener('click', newMatch);

  var form = document.getElementById('pick');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(form), tw = fd.getAll('tw'), note = String(fd.get('note') || '').trim();
    var answer = 'Players: ' + fd.get('pc') + ' | Name: ' + fd.get('nm') + (note ? ' | Note: ' + note : '');
    answer = answer.slice(0, 500);
    var q = document.getElementById('queued');
    if (window.lavish && window.lavish.queuePrompt) {
      window.lavish.queuePrompt('Captain decisions for the Knife Thrower design (QUIVER): ' + answer, {
        tag: 'choice', text: answer, element: form, queueKey: 'games-jb-knifethrower-s1',
        data: { question: 'games-jb-knifethrower-s1', answer: answer, players: fd.get('pc'), name: fd.get('nm'), note: note }
      });
      q.textContent = 'Queued. Press Send to Agent to deliver.';
    } else q.textContent = 'Open this board in Lavish to send answers.';
  });

  for (var mi = 0; mi < 16; mi++) motes.push({ x: Math.random() * W, y: Math.random() * H, vx: 3 + Math.random() * 6, vy: -2 - Math.random() * 5, f: 0.3 + Math.random() * 0.8, s: 0.7 + Math.random() * 1.3 });
  setPalette(cur); buildSprites();
  newMatch();
  window.__pw = { get S() { return S; }, opt: opt, theme: function (id) { setPalette(id); buildSprites(); newMatch(); }, themes: Object.keys(THEMES), tryThrow: tryThrow, newMatch: newMatch, perf: function () { return { frames: frames, slow: slow }; } };
  requestAnimationFrame(loop);
})();
