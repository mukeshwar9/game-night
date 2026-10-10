/* Six in-app designs. Each game is one render function over a small state object; the big
   phone on the left is live (tap to try), the small frames beside it are the same render
   with a different fixed state. Design mockups only: no networking, bots are random.
   Shared art rule (round 6): every play object has a 2px ink outline, a top-left highlight
   and a hard shadow under it; every input answers with a press, a pop or a fly-up. */
(function () {
  'use strict';
  var K = window.KIT || { faces: [], players: [] }, P = K.players, F = K.faces;
  var rnd = Math.random, G = {};
  var NAMES = ['YOU', 'MAYA', 'ARJUN', 'ZOE'];
  var c = function (v, a) { return 'rgb(var(--c-' + v + ')' + (a ? ' / ' + a : '') + ')'; };
  var mix = function (v, w, pct) { return 'color-mix(in srgb, rgb(var(--c-' + v + ')) ' + pct + '%, rgb(var(--c-' + w + ')))'; };
  var ri = function (n) { return Math.floor(rnd() * n); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function sprite(rows, pal, cls) {
    var s = '<svg class="' + (cls || '') + '" viewBox="0 0 ' + rows[0].length + ' ' + rows.length + '" shape-rendering="crispEdges" width="100%">';
    rows.forEach(function (r, y) {
      for (var x = 0; x < r.length; x++) if (r[x] !== '.') s += '<rect x="' + x + '" y="' + y + '" width="1.02" height="1.02" style="fill:' + pal[r[x]] + '"/>';
    });
    return s + '</svg>';
  }

  var TOP = '<div class="top"><svg viewBox="0 0 12 12"><path d="M8 1 3 6l5 5" style="fill:none;stroke:currentColor;stroke-width:2"/></svg><span class="logo">#</span><span>GAME NIGHT</span><span class="r">' +
    '<svg viewBox="0 0 12 12"><path d="M4 9V2l6-1v7" style="fill:none;stroke:currentColor;stroke-width:1.6"/><rect x="1" y="8" width="4" height="3" style="fill:currentColor"/><rect x="7" y="7" width="4" height="3" style="fill:currentColor"/></svg>' +
    '<svg viewBox="0 0 12 12"><path d="M1 3h10M1 6h10M1 9h10" style="fill:none;stroke:currentColor;stroke-width:1.4"/><rect x="3" y="1.5" width="2" height="3" style="fill:currentColor"/><rect x="7" y="4.5" width="2" height="3" style="fill:currentColor"/><rect x="4" y="7.5" width="2" height="3" style="fill:currentColor"/></svg></span></div>';

  function shell(title, body, pill, wait) {
    return TOP + '<div class="room"><div class="title">' + title + '</div>' + body +
      (pill ? '<div class="pill' + (wait ? ' wait' : '') + '"><span data-pill>' + pill + '</span></div>' : '') + '</div>';
  }
  function seat(i, o) {
    o = o || {};
    var av = o.av === '?' ? '<span class="av">?</span>' : '<img src="' + (o.av || (P[i] && P[i].bust) || '') + '" alt="">';
    return '<div class="seat s' + (i + 1) + (o.on ? ' on' : '') + (o.turn ? ' tb' : '') + '">' + av + '<span class="nm">' + NAMES[i] + (o.sub ? '<small>' + o.sub + '</small>' : '') + '</span>' +
      (o.score != null ? '<b><span data-score="' + i + '">' + o.score + '</span>' + (o.lab ? '<small>' + o.lab + '</small>' : '') + '</b>' : '') +
      (o.bar != null ? '<i class="sbar"><i style="transform:scaleX(' + clamp(o.bar, 0, 1) + ')"></i></i>' : '') + '</div>';
  }
  function endPanel(o) {
    return '<div class="endp' + (o.win === false ? ' lost' : '') + '">' + (o.html || '<div class="podium"><img src="' + (P[o.who || 0] ? P[o.who || 0][o.win === false && !o.who ? 'idle' : 'cheer'] : '') + '" alt=""></div>') +
      '<div class="eh' + (o.win === false ? ' lose' : '') + '">' + o.head + '</div>' + (o.score ? '<div class="es">' + o.score + '</div>' : '') +
      (o.note ? '<div class="en">' + o.note + '</div>' : '') +
      '<div class="btns"><button class="btn go fill" data-act="again">PLAY AGAIN</button><button class="btn" data-act="noop">SWITCH GAME</button></div></div>';
  }
  function wire(el, fn) {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || b.disabled || !el.contains(b)) return;
      fn(b.dataset.act, b.dataset);
    });
  }
  /* pointer position in an element's own CSS pixels (survives CSS zoom) */
  function local(el, e, border) {
    var r = el.getBoundingClientRect(), k = r.width / el.offsetWidth;
    return { x: (e.clientX - r.left) / k - border, y: (e.clientY - r.top) / k - border };
  }

  /* ---- shared feedback: every input answers ---- */
  function pos(n, root) { var x = 0, y = 0; while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x: x, y: y }; }
  function centre(n, root) { var p = pos(n, root); return { x: p.x + n.offsetWidth / 2, y: p.y + n.offsetHeight / 2 }; }
  function bump(n) { if (!n) return; n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); }
  function shake(n) { if (!n || RM) return; n.classList.remove('shake'); void n.offsetWidth; n.classList.add('shake'); }
  /* a number lifts off where it was earned and lands on the score it changes */
  function fly(el, from, to, text, cls) {
    var room = el.querySelector('.room');
    if (!room || !from || !to) return;
    if (RM || !room.animate) return bump(to);
    var a = centre(from, room), b = centre(to, room), s = document.createElement('span');
    s.className = 'fly ' + (cls || ''); s.textContent = text; s.style.left = a.x + 'px'; s.style.top = a.y + 'px'; room.appendChild(s);
    s.animate([{ transform: 'translate(-50%,-50%) scale(.6)' }, { transform: 'translate(-50%,-50%) translateY(-14px) scale(1.5)', offset: .3 },
      { transform: 'translate(-50%,-50%) translate(' + (b.x - a.x) + 'px,' + (b.y - a.y) + 'px) scale(.8)' }], { duration: 640, easing: 'cubic-bezier(.5,0,.3,1)' })
      .onfinish = function () { s.remove(); bump(to); };
  }
  /* pixel debris: dust, splash, sparks, confetti */
  function burst(par, x, y, cols, n, sp, up) {
    if (RM || !par || !par.animate) return;
    for (var i = 0; i < n; i++) (function () {
      var d = document.createElement('i'), a = rnd() * 6.28, r = (sp || 30) * (.45 + rnd() * .75), dx = Math.cos(a) * r, dy = Math.sin(a) * r - (up || 0);
      d.className = 'bit'; d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.background = cols[i % cols.length]; par.appendChild(d);
      d.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px)', opacity: 1, offset: .65 }, { transform: 'translate(' + dx * 1.15 + 'px,' + (dy + 12) + 'px)', opacity: 0 }],
        { duration: 380 + rnd() * 240, easing: 'steps(6)' }).onfinish = function () { d.remove(); };
    })();
  }
  function celebrate(el, lost) {
    var p = el.querySelector('.endp'); if (!p || lost) return;
    burst(p, p.offsetWidth / 2, p.offsetHeight / 2 - 70, [c('p1'), c('cta'), c('p2'), c('p3'), c('p4')], 26, 96, 26);
  }

  /* ================= YACHT ================= */
  var YB = [['ones', 'ONES'], ['twos', 'TWOS'], ['threes', 'THREES'], ['fours', 'FOURS'], ['fives', 'FIVES'], ['sixes', 'SIXES'],
    ['k3', '3 OF A KIND'], ['k4', '4 OF A KIND'], ['fh', 'FULL HOUSE'], ['sr', 'SHORT RUN'], ['lr', 'LONG RUN'], ['y', 'YACHT'], ['ch', 'CHANCE']];
  var PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function yScore(id, d) {
    var n = [0, 0, 0, 0, 0, 0, 0], sum = 0;
    d.forEach(function (v) { n[v]++; sum += v; });
    var up = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'].indexOf(id);
    if (up >= 0) return n[up + 1] * (up + 1);
    var mx = Math.max.apply(null, n), has = function (a) { return a.every(function (v) { return n[v]; }); };
    if (id === 'k3') return mx >= 3 ? sum : 0;
    if (id === 'k4') return mx >= 4 ? sum : 0;
    if (id === 'fh') return n.indexOf(3) > 0 && n.indexOf(2) > 0 ? 25 : 0;
    if (id === 'sr') return has([1, 2, 3, 4]) || has([2, 3, 4, 5]) || has([3, 4, 5, 6]) ? 30 : 0;
    if (id === 'lr') return has([1, 2, 3, 4, 5]) || has([2, 3, 4, 5, 6]) ? 40 : 0;
    if (id === 'y') return mx === 5 ? 50 : 0;
    return sum;
  }
  var pipsHtml = function (v) { return PIPS[v].map(function (k) { return '<i style="grid-area:' + (Math.ceil(k / 3)) + '/' + ((k - 1) % 3 + 1) + '"></i>'; }).join(''); };
  function miniDie(v) {
    var s = '<svg class="md" viewBox="0 0 9 9" shape-rendering="crispEdges"><rect width="9" height="9" style="fill:currentColor"/><rect x="1" y="1" width="7" height="7" style="fill:' + c('card') + '"/>';
    PIPS[v].forEach(function (k) { s += '<rect x="' + (((k - 1) % 3) * 2 + 2) + '" y="' + ((Math.ceil(k / 3) - 1) * 2 + 2) + '" width="1" height="1" style="fill:currentColor"/>'; });
    return s + '</svg>';
  }
  G.yacht = function (el, st, live) {
    var S, five = function () { return [0, 0, 0, 0, 0].map(function () { return 1 + ri(6); }); };
    function fresh() { return { dice: five(), held: [0, 0, 0, 0, 0], left: 2, sheet: {}, osheet: {}, sel: null, opp: 0, turn: 'you', burst: '' }; }
    S = { dice: [4, 4, 2, 4, 6], held: [1, 1, 0, 1, 0], left: 1, sheet: { ones: 3, twos: 6, fives: 15, fh: 25, sr: 30, ch: 22 }, osheet: {}, sel: 'fours', opp: 96, turn: 'you', burst: '' };
    if (st === 'yacht') { S.dice = [6, 6, 6, 6, 6]; S.held = [1, 1, 1, 1, 1]; S.left = 0; S.sel = 'y'; S.burst = 'YACHT! +50'; }
    if (st === 'end') { S.sheet = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18, k3: 20, k4: 0, fh: 25, sr: 30, lr: 40, y: 0, ch: 22 }; S.opp = 198; S.sel = null; }
    function total() {
      var up = 0, lo = 0;
      YB.forEach(function (b, i) { var v = S.sheet[b[0]]; if (v == null) return; if (i < 6) up += v; else lo += v; });
      return { up: up, t: up + (up >= 63 ? 35 : 0) + lo };
    }
    var full = function () { return YB.every(function (b) { return S.sheet[b[0]] != null; }); };
    function draw() {
      var t = total(), done = full(), my = S.turn === 'you' && !done, best = null, bv = 0;
      if (my && !S.rolling) YB.forEach(function (b) { if (S.sheet[b[0]] == null) { var v = yScore(b[0], S.dice); if (v > bv) { bv = v; best = b[0]; } } });
      var box = function (b, i) {
        var id = b[0], v = S.sheet[id], ic = i < 6 ? miniDie(i + 1) : '';
        if (v != null) return '<button class="box done' + (S.just === id ? ' just' : '') + '" data-box="' + id + '" disabled><span>' + ic + b[1] + '</span><b>' + v + '</b></button>';
        var p = my && !S.rolling ? yScore(id, S.dice) : null;
        return '<button class="box open' + (p === 0 ? ' zero' : '') + (S.sel === id ? ' pick' : '') + (best === id ? ' best' : '') + '" data-act="sel" data-id="' + id + '" data-box="' + id + '"' + (my ? '' : ' disabled') + '><span>' + ic + b[1] + '</span>' +
          (best === id && S.sel !== id ? '<em>BEST</em>' : '') + '<b>' + (p == null ? '' : p ? '+' + p : '0') + '</b></button>';
      };
      var dice = S.dice.map(function (v, i) {
        return '<span class="slot"><button class="die' + (S.held[i] ? ' held' : '') + (S.rolling && !S.held[i] ? ' roll' : '') + (S.land && !S.held[i] ? ' land' : '') + '" style="--i:' + i + '" data-act="hold" data-i="' + i + '"' + (my ? '' : ' disabled') + '>' + pipsHtml(v) + '</button></span>';
      }).join('');
      var used = 3 - S.left, selv = S.sel ? yScore(S.sel, S.dice) : 0, sell = S.sel ? YB.filter(function (b) { return b[0] === S.sel; })[0][1] : '';
      var body = '<div class="seats">' + seat(0, { on: S.turn === 'you', turn: 1, score: t.t }) + seat(1, { on: S.turn !== 'you', turn: 1, score: S.opp }) + '</div>' +
        '<div class="panel">' +
        '<div class="tray' + (S.turn === 'you' ? '' : ' opp') + '"><div class="trayhd"><span>' + (S.turn === 'you' ? 'YOUR DICE' : 'MAYA\'S DICE') + '</span>' +
        '<span class="rolls">ROLL ' + used + '/3<i class="' + (used > 0 ? 'u' : '') + '"></i><i class="' + (used > 1 ? 'u' : '') + '"></i><i class="' + (used > 2 ? 'u' : '') + '"></i></span></div>' +
        '<div class="dice">' + dice + '</div></div>' +
        '<div class="sheet"><div class="col"><div class="hd"><span>NUMBERS</span><span>ADD THAT FACE</span></div>' + YB.slice(0, 6).map(box).join('') +
        '<div class="bonus' + (t.up >= 63 ? ' got' : '') + '"><span>BONUS +35</span><div class="bar"><i style="transform:scaleX(' + Math.min(1, t.up / 63) + ')"></i></div><span>' + Math.min(t.up, 63) + '/63</span></div>' +
        '</div><div class="col"><div class="hd"><span>COMBOS</span><span></span></div>' + YB.slice(6).map(function (b, i) { return box(b, i + 6); }).join('') + '</div></div>' +
        '<div class="btns"><button class="btn go" data-act="roll"' + (my && S.left > 0 && !S.rolling ? '' : ' disabled') + '>ROLL<small>' + (S.left ? S.left + ' LEFT' : 'NONE LEFT') + '</small></button>' +
        '<button class="btn go fill' + (my && S.sel ? ' ready' : '') + '" data-act="score"' + (my && S.sel && !S.rolling ? '' : ' disabled') + '>' + (S.sel ? 'SCORE +' + selv : 'SCORE') + '<small>' + (sell || 'PICK A BOX') + '</small></button></div>' +
        '</div>' +
        (S.burst ? '<div class="burst' + (S.turn === 'you' || done ? '' : ' b2') + '">' + S.burst + '</div>' : '') +
        (done ? endPanel({ win: t.t >= S.opp, head: t.t >= S.opp ? 'YOU WIN!' : 'MAYA WINS', score: t.t + ' — ' + S.opp, who: t.t >= S.opp ? 0 : 1, note: 'ALL 13 BOXES FILLED' }) : '');
      el.innerHTML = shell('YACHT', body, done ? '' : my ? (S.sel ? 'TAP SCORE TO BANK IT' : S.left ? 'HOLD DICE, ROLL OR SCORE' : 'NO ROLLS LEFT · PICK A BOX') : 'MAYA IS ROLLING…', !my);
      S.land = false; S.just = null;
    }
    function tumble(then) {
      S.rolling = true; draw();
      var n = 0, iv = setInterval(function () {
        if (!RM) el.querySelectorAll('.die.roll').forEach(function (d) { d.innerHTML = pipsHtml(1 + ri(6)); });
        if (++n > 5) { clearInterval(iv); S.rolling = false; S.land = true; then(); }
      }, 75);
    }
    function oppTurn() {
      S.dice = five(); S.held = [0, 0, 0, 0, 0]; S.left = 0; S.burst = '';
      tumble(function () {
        var best = null, bv = -1;
        YB.forEach(function (b) { if (S.osheet[b[0]] == null) { var v = yScore(b[0], S.dice); if (v > bv) { bv = v; best = b; } } });
        if (best) { S.osheet[best[0]] = bv; S.opp += bv; S.burst = 'MAYA · ' + best[1] + ' +' + bv; }
        draw(); bump(el.querySelector('[data-score="1"]'));
        setTimeout(function () { S.turn = 'you'; S.dice = five(); S.left = 2; S.burst = ''; tumble(draw); }, 1300);
      });
    }
    draw();
    if (!live) return;
    wire(el, function (a, d) {
      if (a === 'again') { S = fresh(); return tumble(draw); }
      if (S.turn !== 'you' || S.rolling) return;
      if (a === 'hold') { S.held[+d.i] = S.held[+d.i] ? 0 : 1; S.burst = ''; draw(); }
      if (a === 'sel') { S.sel = d.id; S.burst = ''; draw(); }
      if (a === 'roll' && S.left > 0) {
        S.dice = S.dice.map(function (v, i) { return S.held[i] ? v : 1 + ri(6); }); S.left--; S.sel = null; S.burst = ''; tumble(draw);
      }
      if (a === 'score' && S.sel) {
        var id = S.sel, v = yScore(id, S.dice), y = id === 'y' && v; S.sheet[id] = v; S.just = id; S.burst = y ? 'YACHT! +50' : ''; S.sel = null; S.turn = 'opp'; draw();
        fly(el, el.querySelector('[data-box="' + id + '"]'), el.querySelector('[data-score="0"]'), '+' + v, 'p1');
        if (y) { var tr = el.querySelector('.tray'), room = el.querySelector('.room'), cc = centre(tr, room); burst(room, cc.x, cc.y, [c('cta'), c('p1'), c('p2'), c('p3')], 28, 110, 20); }
        if (full()) return celebrate(el, total().t < S.opp);
        setTimeout(oppTurn, y ? 1500 : 950);
      }
    });
  };

  /* ================= FACE OFF ================= */
  var FQ = [['hat', 'HAT?'], ['gl', 'GLASSES?'], ['be', 'BEARD?'], ['lg', 'LONG HAIR?'], ['dk', 'DARK HAIR?'], ['sm', 'SMILING?']];
  var FI = {
    hat: ['..kkkkk..', '..kkkkk..', '..kkkkk..', 'kkkkkkkkk'],
    gl: ['kkkk.kkkk', 'k..kkk..k', 'k..k.k..k', 'kkkk.kkkk'],
    be: ['k.......k', 'kk.....kk', '.kkkkkkk.', '..kkkkk..', '...kkk...'],
    lg: ['.kkkkkkk.', 'kk.....kk', 'kk.....kk', 'kk.....kk', 'kk.....kk'],
    dk: ['.kkkkkkk.', 'kkkkkkkkk', 'kkkkkkkkk', 'kk.....kk'],
    sm: ['.k.....k.', '.........', 'k.......k', '.kk...kk.', '...kkk...']
  };
  var fql = function (k) { return FQ.filter(function (q) { return q[0] === k; })[0][1]; };
  G.faceoff = function (el, st, live) {
    var S = { secret: 16, mine: 8, asked: [['hat', 0]], sel: 'gl', oppLeft: 14, oppAsked: ['gl'], oppTalk: ['gl', 0], naming: false, cand: null, end: null, flip: {}, turn: 'you' };
    if (st === 'name') { S.asked.push(['lg', 0], ['gl', 1]); S.sel = null; S.naming = true; S.cand = 16; S.oppLeft = 6; }
    if (st === 'end') { S.asked.push(['lg', 0], ['gl', 1]); S.sel = null; S.end = 'win'; }
    var isDown = function (i) { return S.asked.some(function (q) { return F[i][q[0]] !== q[1]; }); };
    function draw() {
      var left = 0, yes = 0, my = S.turn === 'you', prev = my && S.sel && !S.naming && !S.end, fk = 0;
      F.forEach(function (f, i) { if (!isDown(i)) { left++; if (S.sel && f[S.sel]) yes++; } });
      var grid = F.map(function (f, i) {
        var d = isDown(i), has = prev && !d && f[S.sel];
        return '<button class="face' + (d ? ' down' : '') + (S.flip[i] ? ' flip' : '') + (S.cand === i ? ' cand' : '') + (has ? ' has' : prev && !d ? ' hasnt' : '') + '"' +
          (S.flip[i] ? ' style="animation-delay:' + (fk++ * 45) + 'ms"' : '') + ' data-act="face" data-i="' + i + '"><img src="' + f.src + '" alt=""><span>' + f.n + '</span></button>';
      }).join('');
      var lastQ = S.asked[S.asked.length - 1];
      var line = function (who, cls, q, isNew) { return '<div class="' + (isNew ? 'new' : '') + '"><img src="' + (P[who] ? P[who].bust : '') + '" alt=""><span class="' + cls + '">' + NAMES[who] + '</span><span>' + fql(q[0]) + '</span><span class="a' + (q[1] ? '' : ' no') + '">' + (q[1] ? 'YES' : 'NO') + '</span></div>'; };
      var talk = '<div class="talk">' + (lastQ ? line(0, 'p1', lastQ, S.stamp) : '<div><span class="dim">ASK ABOUT MAYA\'S SECRET FACE</span></div>') + (S.oppTalk ? line(1, 'p2', S.oppTalk, S.oppNew) : '') + '</div>';
      var split = S.naming ? '<div class="split"><b class="warn">ONE GUESS.</b> RIGHT WINS · WRONG LOSES</div>'
        : prev ? '<div class="split"><b class="y">YES</b> KEEPS ' + yes + ' · <b class="n">NO</b> KEEPS ' + (left - yes) + '</div>'
          : '<div class="split dim">' + (my ? 'TAP A QUESTION TO SEE ITS SPLIT' : 'MAYA IS THINKING…') + '</div>';
      var qs = '<div class="qs">' + FQ.map(function (q) {
        var u = S.asked.filter(function (a) { return a[0] === q[0]; })[0];
        return '<button class="q' + (u ? ' used' : '') + (S.sel === q[0] ? ' sel' : '') + '" data-act="q" data-k="' + q[0] + '"' + (u || !my || S.naming ? ' disabled' : '') + '>' + sprite(FI[q[0]], { k: 'currentColor' }) + '<span>' + q[1] + '</span>' + (u ? '<em class="' + (u[1] ? '' : 'no') + '">' + (u[1] ? 'YES' : 'NO') + '</em>' : '') + '</button>';
      }).join('') + '</div>';
      var btns = S.naming
        ? '<div class="btns"><button class="btn go fill' + (S.cand == null ? '' : ' ready') + '" data-act="confirm"' + (S.cand == null ? ' disabled' : '') + '>' + (S.cand == null ? 'TAP A FACE' : 'IT\'S ' + F[S.cand].n + '!') + '</button><button class="btn" data-act="name">BACK</button></div>'
        : '<div class="btns"><button class="btn go fill' + (my && S.sel ? ' ready' : '') + '" data-act="ask"' + (my && S.sel ? '' : ' disabled') + '>ASK' + (S.sel ? '<small>' + fql(S.sel) + '</small>' : '') + '</button><button class="btn go" data-act="name"' + (my ? '' : ' disabled') + '>NAME THE FACE<small>' + left + ' LEFT</small></button></div>';
      var body = '<div class="seats">' + seat(0, { on: my, turn: 1, av: F[S.mine].src, sub: 'SECRET: ' + F[S.mine].n, score: left, lab: 'LEFT', bar: 1 - (left - 1) / 23 }) + seat(1, { on: !my, turn: 1, av: '?', sub: 'HER SECRET', score: S.oppLeft, lab: 'LEFT', bar: 1 - (S.oppLeft - 1) / 23 }) + '</div>' +
        '<div class="facewrap' + (S.naming ? ' naming' : '') + '"><div class="faces">' + grid + '</div>' + (S.stamp ? '<div class="stamp' + (S.stamp[1] ? '' : ' no') + '">' + (S.stamp[1] ? 'YES!' : 'NO!') + '</div>' : '') + '</div>' + talk + qs + split + btns +
        (S.end ? endPanel({ win: S.end === 'win', head: S.end === 'win' ? 'GOT IT!' : 'WRONG FACE', note: S.end === 'win' ? 'YOU NAMED MAYA\'S FACE' : 'A WRONG GUESS LOSES THE ROUND',
          html: '<div class="reveal"><div class="s1"><img src="' + F[S.mine].src + '" alt="">YOU: ' + F[S.mine].n + '</div><div class="s2"><img src="' + F[S.secret].src + '" alt="">MAYA: ' + F[S.secret].n + '</div></div>' }) : '');
      el.innerHTML = shell('FACE OFF', body, S.end ? '' : S.naming ? 'TAP THE FACE YOU THINK IT IS' : my ? (S.sel ? 'ASK IT, OR TRY ANOTHER' : 'YOUR TURN · PICK A QUESTION') : 'MAYA IS ASKING…', !my);
      S.stamp = null; S.oppNew = false;
    }
    draw();
    if (!live) return;
    wire(el, function (a, d) {
      if (a === 'again') { S = { secret: ri(24), mine: ri(24), asked: [], sel: null, oppLeft: 24, oppAsked: [], oppTalk: null, naming: false, cand: null, end: null, flip: {}, turn: 'you' }; return draw(); }
      if (S.end || S.turn !== 'you') return;
      if (a === 'q') { S.sel = S.sel === d.k ? null : d.k; S.flip = {}; draw(); }
      if (a === 'name') { S.naming = !S.naming; S.cand = null; S.sel = null; S.flip = {}; draw(); }
      if (a === 'face' && S.naming && !isDown(+d.i)) { S.cand = +d.i; draw(); }
      if (a === 'confirm' && S.cand != null) { S.end = S.cand === S.secret ? 'win' : 'lose'; S.naming = false; draw(); celebrate(el, S.end !== 'win'); }
      if (a === 'ask' && S.sel) {
        var before = F.map(function (f, i) { return isDown(i); }), ans = [S.sel, F[S.secret][S.sel]];
        S.asked.push(ans); S.sel = null; S.flip = {}; S.stamp = ans;
        F.forEach(function (f, i) { if (!before[i] && isDown(i)) S.flip[i] = 1; });
        S.turn = 'opp'; draw(); bump(el.querySelector('[data-score="0"]'));
        setTimeout(function () {
          var open = FQ.filter(function (q) { return S.oppAsked.indexOf(q[0]) < 0; });
          if (open.length) { var q = open[ri(open.length)][0]; S.oppAsked.push(q); S.oppTalk = [q, F[S.mine][q]]; S.oppNew = true; S.oppLeft = Math.max(2, Math.round(S.oppLeft * (0.5 + rnd() * 0.25))); }
          S.turn = 'you'; S.flip = {}; draw(); bump(el.querySelector('[data-score="1"]'));
        }, 1500);
      }
    });
  };

  /* ================= SPOT KICK ================= */
  var KEEP = ['kk...kkkkk...kk', 'kgk.khhhhhk.kgk', 'kgk.kfffffk.kgk', 'kbk.kfefefk.kbk', 'kbk.kfffffk.kbk', 'kbkk.kkkkk.kkbk', '.kbbkbbbbbkbbk.', '..kbbbbbbbbbk..', '...kblbbbbbk...',
    '...kblbbbbdk...', '...kbbbbbbdk...', '...kkkkkkkkk...', '...kddkkkddk...', '...kddk.kddk...', '...kffk.kffk...', '...kffk.kffk...', '...kwwk.kwwk...', '..kkssk.ksskk..', '..kkkkk.kkkkk..'];
  var ZX = [75.7, 149, 222.3], ZY = [58, 106];
  function pitchSvg(aim, keep) {
    var s = '<svg viewBox="0 0 298 258" preserveAspectRatio="none"><defs>' +
      '<pattern id="skcrowd" width="12" height="8" patternUnits="userSpaceOnUse"><rect x="1" y="1" width="3" height="3" style="fill:' + c('p1', .6) + '"/><rect x="7" y="1" width="3" height="3" style="fill:' + c('p2', .6) + '"/><rect x="4" y="5" width="3" height="3" style="fill:' + c('p3', .55) + '"/><rect x="10" y="5" width="3" height="3" style="fill:' + c('p4', .55) + '"/></pattern>' +
      '<pattern id="sknet" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 0H7M0 0V7" style="stroke:' + c('text', .2) + ';stroke-width:1;fill:none"/></pattern></defs>' +
      /* stands, shaded toward the top so the goal sits in front */
      '<rect width="298" height="62" style="fill:' + c('deep') + '"/><rect width="298" height="62" fill="url(#skcrowd)"/><rect width="298" height="20" style="fill:' + c('text', .16) + '"/><rect y="20" width="298" height="14" style="fill:' + c('text', .07) + '"/>' +
      '<rect y="56" width="298" height="15" style="fill:' + c('card') + ';stroke:' + c('text') + ';stroke-width:1.5"/>' +
      '<text x="149" y="67" text-anchor="middle" style="font:6px \'Press Start 2P\';fill:' + c('cta') + '">GAME NIGHT  ·  GAME NIGHT  ·  GAME NIGHT</text>' +
      '<rect y="71" width="298" height="187" style="fill:' + c('tint-p1') + '"/>';
    /* mown stripes get taller toward the camera: cheap depth */
    var y = 71, h = 12, k = 0;
    while (y < 258) { if (k++ % 2 === 0) s += '<rect y="' + y + '" width="298" height="' + h + '" style="fill:' + c('p1', .15) + '"/>'; y += h; h += 5; }
    s += '<path d="M0 131H298M24 131 4 186H294L274 131M98 131 90 154H208L200 131" style="fill:none;stroke:' + c('card') + ';stroke-width:3"/>' +
      '<path d="M112 258 Q149 224 186 258" style="fill:none;stroke:' + c('card') + ';stroke-width:3"/>' +
      /* goal: back net is smaller than the mouth, so it reads as a box, not a sticker */
      '<path d="M39 131V34H259V131L243 123V44H55V123Z" style="fill:' + c('card', .9) + '"/><path d="M39 131V34H259V131L243 123V44H55V123Z" fill="url(#sknet)"/>' +
      '<rect x="55" y="44" width="188" height="79" style="fill:' + mix('card', 'text', 90) + '"/><rect x="55" y="44" width="188" height="79" fill="url(#sknet)"/>' +
      '<path d="M39 34 55 44M259 34 243 44M55 44H243M55 44V123M243 44V123" style="fill:none;stroke:' + c('text', .3) + ';stroke-width:1.5"/>' +
      '<path d="M39 131 55 123H243L259 131Z" style="fill:' + c('p1', .32) + '"/>' +
      '<path d="M39 133V34H259V133" style="fill:none;stroke:' + c('text') + ';stroke-width:10;stroke-linejoin:miter"/><path d="M39 133V34H259V133" style="fill:none;stroke:' + c('card') + ';stroke-width:6"/>' +
      '<path d="M41 131V36H257" style="fill:none;stroke:' + c('text', .16) + ';stroke-width:2"/>' +
      '<ellipse cx="149" cy="133" rx="23" ry="4" style="fill:' + c('text', .22) + '"/>' +
      '<ellipse cx="149" cy="226" rx="8" ry="3" style="fill:' + c('card') + '"/><ellipse class="bsh" cx="149" cy="236" rx="13" ry="4" style="fill:' + c('text', .25) + '"/>';
    if (aim != null && !keep) {
      var zx = ZX[aim % 3], zy = ZY[aim / 3 | 0];
      s += '<path class="aimline" d="M149 208 Q' + (149 + (zx - 149) * .25) + ' ' + (zy + 76) + ' ' + zx + ' ' + (zy + 14) + '" style="fill:none;stroke:' + c('cta') + ';stroke-width:3;stroke-dasharray:4 6"/>';
    }
    return s + '</svg>';
  }
  var BALL = '<svg viewBox="0 0 22 22"><circle cx="11" cy="11" r="9.5" style="fill:' + c('card') + ';stroke:' + c('text') + ';stroke-width:2.5"/><path d="M8 8h6v5h-6zM3 10h2v3H3zM17 10h2v3h-2zM9 17h4v2H9zM9 3h4v2H9z" style="fill:' + c('text') + '"/><path d="M5 7a7 7 0 0 1 4-3" style="fill:none;stroke:' + c('card') + ';stroke-width:1.5"/><path d="M15 18a8 8 0 0 0 4-6" style="fill:none;stroke:' + c('text', .25) + ';stroke-width:2"/></svg>';
  function keeperTf(z) { var col = z % 3, row = z / 3 | 0; return col === 1 ? (row ? 'translateY(6px) scaleY(.88)' : 'translateY(-24px)') : 'translate(' + (col ? 64 : -64) + 'px,' + (row ? 14 : -22) + 'px) rotate(' + (col ? 70 : -70) + 'deg)'; }
  function ballTf(z, over) { return over ? 'translate(' + ((z % 3 - 1) * 80) + 'px,-212px) scale(.4)' : 'translate(' + (ZX[z % 3] - 149) + 'px,' + (ZY[z / 3 | 0] - 221) + 'px) scale(.58)'; }
  G.spotkick = function (el, st, live) {
    var S = { role: 'kick', aim: 0, mine: [1, 1, 0], theirs: [1, 0, 1], hist: [3, 2, 3], phase: 'aim', power: .7, res: null, kz: null };
    if (st === 'goal') { S.phase = 'res'; S.kz = 5; S.res = { t: 'GOAL!', ok: 1 }; S.power = .68; }
    if (st === 'keep') { S.role = 'keep'; S.aim = 5; S.mine = [1, 1, 0, 1]; S.hist = [0, 5, 2]; }
    if (st === 'end') { S.mine = [1, 1, 0, 1, 1]; S.theirs = [1, 0, 1, 1, 0]; S.end = true; }
    var raf = 0, t0 = 0;
    function dots(a, w) { var h = ''; for (var i = 0; i < 5; i++) h += '<i data-d="' + w + i + '" class="' + (a[i] == null ? (i === a.length ? 'next' : '') : a[i] ? 'in' : 'out') + '"></i>'; return '<span class="dots">' + h + '</span>'; }
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    var pz = function (p) { return p < .52 ? 0 : p > .8 ? 2 : 1; };
    function draw() {
      var kick = S.role === 'kick', resd = S.phase === 'res', stat = resd && !live;
      var zones = ''; for (var i = 0; i < 6; i++) zones += '<button class="zone' + (S.aim === i && !resd ? ' sel' : '') + '" data-act="zone" data-i="' + i + '"></button>';
      var kc = kick ? 'p2' : 'p1';
      var pal = { k: c('text'), h: c('text', .8), f: c('tint-cta'), e: c('text'), b: c(kc), l: c('tint-' + kc), d: mix(kc, 'text', 72), g: c('card'), w: c('card'), s: c('dim') };
      var tells = S.hist.map(function (z, n) { var h = ''; for (var i = 0; i < 6; i++) h += '<i class="' + (i === z ? 'h' : '') + '"></i>'; return '<span class="tell t' + n + '">' + h + '</span>'; }).join('');
      var n = Math.min(5, (kick ? S.mine.length : S.theirs.length) + 1), z = pz(S.power);
      var lean = !kick && !resd ? 'transform:translateX(' + ((S.aim % 3 - 1) * 12) + 'px)' : stat ? 'transform:' + keeperTf(S.kz) : '';
      var body = '<div class="score5"><span class="p1">YOU' + dots(S.mine, 'm') + '<b>' + sum(S.mine) + '</b></span><span class="vs">' + n + '/5</span><span class="p2"><b>' + sum(S.theirs) + '</b>' + dots(S.theirs, 't') + 'MAYA</span></div>' +
        '<div class="pitch arena' + (kick ? '' : ' keep') + (resd ? ' res' : '') + '">' + pitchSvg(resd ? null : S.aim, !kick) + '<div class="zones">' + zones + '</div>' +
        '<div class="keeper' + (resd ? '' : ' idle') + '"' + (lean ? ' style="' + lean + '"' : '') + '><span class="ktag s' + (kick ? 2 : 1) + '">' + (kick ? 'MAYA' : 'YOU') + '</span>' + sprite(KEEP, pal) + '</div>' +
        '<div class="ball"' + (stat ? ' style="transform:' + ballTf(S.aim) + '"' : '') + '>' + BALL + '</div>' +
        '<span class="role s' + (kick ? 1 : 2) + '">' + (kick ? 'YOU SHOOT' : 'MAYA SHOOTS') + '</span>' +
        (stat && S.res ? '<div class="verdict ' + (S.res.ok ? 'good' : 'bad') + '">' + S.res.t + '</div>' : '') +
        (live && !S.touched ? '<span class="hint" style="left:14px;top:142px">TAP A CORNER TO AIM</span>' : '') + '</div>' +
        (kick ? '<div class="pow"><div class="meter" data-z="' + z + '"><i></i><i></i><i></i><b style="left:' + (S.power * 100) + '%"></b></div><div class="zl" data-z="' + z + '"><span>SOFT</span><span>ON TARGET</span><span>OVER</span></div></div>'
          : '<div class="pow keepmsg"><span class="p2">MAYA SHOOTS THE MOMENT YOU LOCK IN</span><span class="dim">TAP A CORNER · YOUR KEEPER LEANS THERE</span></div>') +
        '<div class="tells"><span>' + (kick ? 'MAYA\'S LAST DIVES' : 'MAYA\'S LAST SHOTS') + '</span>' + tells + '</div>' +
        '<div class="btns"><button class="btn go big fill ready" data-act="lock"' + (resd ? ' disabled' : '') + '>' + (kick ? 'SHOOT!' : 'DIVE!') + '<small>' + (kick ? 'STOPS THE POWER BAR' : 'LOCKS YOUR CORNER') + '</small></button></div>' +
        (S.end ? endPanel({ win: sum(S.mine) >= sum(S.theirs), who: sum(S.mine) >= sum(S.theirs) ? 0 : 1, head: sum(S.mine) > sum(S.theirs) ? 'YOU WIN!' : sum(S.mine) === sum(S.theirs) ? 'LEVEL!' : 'MAYA WINS', score: sum(S.mine) + ' — ' + sum(S.theirs), note: 'BEST OF FIVE KICKS EACH' }) : '');
      el.innerHTML = shell('SPOT KICK', body, S.end ? '' : resd ? 'BOTH LOCKED IN' : kick ? 'PICK A CORNER, TIME THE BAR' : 'YOU ARE IN GOAL · PICK A DIVE', false);
    }
    function sweep(t) {
      if (!t0) t0 = t;
      var m = el.querySelector('.meter b');
      if (m && S.role === 'kick' && S.phase === 'aim' && !S.end) {
        var p = ((t - t0) / 900) % 2, z; S.power = p > 1 ? 2 - p : p; z = pz(S.power);
        m.style.left = (S.power * 100) + '%'; m.parentNode.dataset.z = z; m.parentNode.nextSibling.dataset.z = z;
      }
      raf = requestAnimationFrame(sweep);
    }
    draw();
    if (!live) return;
    wire(el, function (a, d) {
      if (a === 'again') { S = { role: 'kick', aim: 1, mine: [], theirs: [], hist: [ri(6), ri(6), ri(6)], phase: 'aim', power: .5, touched: true }; return draw(); }
      if (S.phase !== 'aim' || S.end) return;
      S.touched = true;
      if (!raf && !RM) raf = requestAnimationFrame(sweep);
      if (a === 'zone') { S.aim = +d.i; draw(); }
      if (a === 'lock') {
        var kick = S.role === 'kick', res, bz, over = false, kz;
        if (kick) {
          kz = ri(6); bz = S.aim; over = S.power > .8;
          var weak = S.power < .52;
          res = over ? { t: 'OVER THE BAR!', ok: 0 } : kz === bz || (weak && kz % 3 === bz % 3) ? { t: 'SAVED!', ok: 0 } : { t: 'GOAL!', ok: 1 };
          S.hist = S.hist.slice(1).concat(kz);
        } else {
          kz = S.aim; bz = ri(6); over = rnd() < .12;
          res = over ? { t: 'OVER THE BAR!', ok: 1 } : kz === bz ? { t: 'WHAT A SAVE!', ok: 1 } : { t: 'GOAL', ok: 0 };
          S.hist = S.hist.slice(1).concat(bz);
        }
        S.phase = 'res'; draw();
        var kp = el.querySelector('.keeper'), bl = el.querySelector('.ball'), pt = el.querySelector('.pitch'), sh = el.querySelector('.bsh');
        if (sh) sh.style.opacity = 0;
        requestAnimationFrame(function () { requestAnimationFrame(function () { kp.style.transform = keeperTf(kz); bl.style.transform = ballTf(bz, over); }); });
        setTimeout(function () {
          var goal = res.t.indexOf('GOAL') === 0, saved = !over && !goal;
          pt.insertAdjacentHTML('beforeend', '<div class="verdict ' + (res.ok ? 'good' : 'bad') + '">' + res.t + '</div>');
          if (goal) { pt.insertAdjacentHTML('beforeend', '<i class="netpop" style="left:' + ZX[bz % 3] + 'px;top:' + ZY[bz / 3 | 0] + 'px"></i>'); burst(pt, ZX[bz % 3], ZY[bz / 3 | 0], [c('card'), c('text', .5)], 10, 26); }
          if (saved) { burst(pt, ZX[bz % 3], ZY[bz / 3 | 0], [c('cta'), c('card')], 12, 30); }
          shake(pt);
        }, 330);
        setTimeout(function () {
          var w = kick ? 'm' : 't', idx = (kick ? S.mine : S.theirs).length;
          if (kick) S.mine.push(res.ok); else S.theirs.push(res.ok ? 0 : 1);
          S.role = kick ? 'keep' : 'kick'; S.phase = 'aim';
          if (S.mine.length >= 5 && S.theirs.length >= 5) S.end = true;
          draw(); bump(el.querySelector('[data-d="' + w + idx + '"]'));
          if (S.end) celebrate(el, sum(S.mine) < sum(S.theirs));
        }, 1650);
      }
    });
  };

  /* ================= PUCK RUSH ================= */
  G.puckrush = function (el, st, live) {
    var W = 294, H = 386, R = 14, WY = 193, G0 = 111, G1 = 183, BT = 22, BB = 364, BW = 4;
    var pk, drag = null, run = false, last = 0, botAt = 0, ended = null, rink, round = 1, ev = [], lastCn = '';
    function stage() {
      return [[60, 318], [150, 338], [236, 312], [120, 372], [70, 58], [150, 44], [230, 62], [108, 128], [196, 112], [56, 150]].map(function (p) { return { x: p[0], y: p[1], vx: 0, vy: 0 }; });
    }
    function kickoff() {
      var a = [];
      for (var i = 0; i < 5; i++) { a.push({ x: 47 + i * 50, y: 330, vx: 0, vy: 0 }); a.push({ x: 47 + i * 50, y: 56, vx: 0, vy: 0 }); }
      return a;
    }
    function counts() { var m = 0; pk.forEach(function (p) { if (p.y > WY) m++; }); return [m, pk.length - m]; }
    function bandPath(y, p) { return 'M13 ' + y + (p ? ' L' + p.x + ' ' + (p.y + (y > WY ? 12 : -12)) : '') + ' L281 ' + y; }
    function arrow(x1, y1, x2, y2) {
      var a = Math.atan2(y2 - y1, x2 - x1), h = 9;
      return ['M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2, 'M' + (x2 - Math.cos(a - .5) * h) + ' ' + (y2 - Math.sin(a - .5) * h) + ' L' + x2 + ' ' + y2 + ' L' + (x2 - Math.cos(a + .5) * h) + ' ' + (y2 - Math.sin(a + .5) * h)];
    }
    var pips = function (n) { var h = ''; for (var i = 0; i < n; i++) h += '<i></i>'; return h; };
    function draw() {
      var cn = counts(), staged = !run && !ended && !st;
      var pull = staged ? pk[3] : null, peg = function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="6" style="fill:' + c('text') + '"/><circle cx="' + (x - 1.5) + '" cy="' + (y - 1.5) + '" r="2" style="fill:' + c('card', .7) + '"/>'; };
      var band = function (cls, y, col, p) { return '<path class="' + cls + 'o" d="' + bandPath(y, p) + '" style="fill:none;stroke:' + c('text') + ';stroke-width:7;stroke-linejoin:round"/><path class="' + cls + '" d="' + bandPath(y, p) + '" style="fill:none;stroke:' + c(col) + ';stroke-width:3.5;stroke-linejoin:round"/>'; };
      var svg = '<svg viewBox="0 0 294 386"><defs><pattern id="prdot" width="14" height="14" patternUnits="userSpaceOnUse"><rect x="6" y="6" width="2" height="2" style="fill:' + c('text', .09) + '"/></pattern></defs>' +
        '<rect width="294" height="193" style="fill:' + c('tint-p2') + '"/><rect y="193" width="294" height="193" style="fill:' + c('tint-p1') + '"/><rect width="294" height="386" fill="url(#prdot)"/>' +
        '<rect width="294" height="7" style="fill:' + c('text', .1) + '"/><rect width="6" height="386" style="fill:' + c('text', .07) + '"/>' +
        '<circle cx="147" cy="193" r="46" style="fill:none;stroke:' + c('card') + ';stroke-width:3"/>' +
        /* the gap: chevrons run through it so it reads as the only way across */
        '<rect x="' + G0 + '" y="183" width="' + (G1 - G0) + '" height="20" style="fill:' + c('card', .75) + '"/>' +
        '<g class="chev" style="fill:none;stroke:' + c('cta') + ';stroke-width:2.5"><path d="M135 199 147 191 159 199"/><path d="M135 191 147 183 159 191" style="opacity:.5"/></g>' +
        /* wall: lit top edge, shadow on the ice below */
        '<rect x="-4" y="198" width="' + (G0 + 4) + '" height="5" style="fill:' + c('text', .18) + '"/><rect x="' + G1 + '" y="198" width="' + (W - G1 + 4) + '" height="5" style="fill:' + c('text', .18) + '"/>' +
        '<rect x="-4" y="187" width="' + (G0 + 4) + '" height="12" rx="2" style="fill:' + c('text') + '"/><rect x="' + G1 + '" y="187" width="' + (W - G1 + 4) + '" height="12" rx="2" style="fill:' + c('text') + '"/>' +
        '<rect x="0" y="189" width="' + (G0 - 6) + '" height="2" style="fill:' + c('card', .35) + '"/><rect x="' + (G1 + 6) + '" y="189" width="' + (W - G1 - 6) + '" height="2" style="fill:' + c('card', .35) + '"/>' +
        '<rect x="' + (G0 - 6) + '" y="183" width="10" height="20" rx="2" style="fill:' + c('cta') + ';stroke:' + c('text') + ';stroke-width:2"/><rect x="' + (G1 - 4) + '" y="183" width="10" height="20" rx="2" style="fill:' + c('cta') + ';stroke:' + c('text') + ';stroke-width:2"/>' +
        '<rect x="' + (G0 - 4) + '" y="185" width="2" height="8" style="fill:' + c('card', .5) + '"/><rect x="' + (G1 - 2) + '" y="185" width="2" height="8" style="fill:' + c('card', .5) + '"/>' +
        band('bt', BT, 'p2') + band('bb', BB, 'p1', pull) + peg(13, BT) + peg(281, BT) + peg(13, BB) + peg(281, BB) +
        '<circle class="ghost" cx="0" cy="0" r="14" style="fill:none;stroke:' + c('text', .35) + ';stroke-width:2;stroke-dasharray:3 4;display:none"/>' +
        '<path class="aim" d="' + (pull ? arrow(120, 356, 145, 214)[0] : '') + '" style="fill:none;stroke:' + c('cta') + ';stroke-width:3;stroke-dasharray:5 6"/>' +
        '<path class="aimh" d="' + (pull ? arrow(120, 356, 145, 214)[1] : '') + '" style="fill:none;stroke:' + c('cta') + ';stroke-width:3.5;stroke-linejoin:round;stroke-linecap:round"/></svg>';
      var body = '<div class="hud"><span class="cnt p1"><b data-c="0">' + cn[0] + '</b><span>YOU · LEFT<i class="pips" data-pips="0">' + pips(cn[0]) + '</i></span></span><span class="vs">R' + round + '</span>' +
        '<span class="cnt p2 r"><span>MAYA · LEFT<i class="pips" data-pips="1">' + pips(cn[1]) + '</i></span><b data-c="1">' + cn[1] + '</b></span></div>' +
        '<div class="rink arena" data-lavish-action="true">' + svg + '<span class="side p2" style="top:168px">MAYA\'S HALF</span><span class="side p1" style="top:210px">YOUR HALF</span>' +
        pk.map(function (p, i) { return '<div class="puck' + (p.y < WY ? ' b' : '') + '" data-p="' + i + '" style="transform:translate(' + p.x + 'px,' + p.y + 'px)"></div>'; }).join('') +
        (live && staged ? '<span class="hint" style="left:30px;top:262px">DRAG A GREEN PUCK BACK, LET GO</span>' : '') + '</div>' +
        (ended ? endPanel({ win: ended === 'you', who: ended === 'you' ? 0 : 1, head: ended === 'you' ? 'YOU WIN!' : 'MAYA WINS', score: ended === 'you' ? 'YOUR HALF IS CLEAR' : 'HER HALF IS CLEAR', note: 'FIRST TO EMPTY THEIR HALF TAKES THE ROUND' }) : '');
      el.innerHTML = shell('PUCK RUSH', body, ended ? '' : run ? 'EMPTY YOUR HALF FIRST!' : st === 'start' ? '3 · 2 · 1 · GO!' : 'GREEN PUCKS ARE YOURS TO FLING');
      rink = el.querySelector('.rink'); lastCn = cn.join();
      pk.forEach(function (p, i) { p.el = rink.querySelector('[data-p="' + i + '"]'); });
    }
    function step(dt) {
      var i, j, p, q;
      for (i = 0; i < pk.length; i++) {
        p = pk[i]; if (p === drag) continue;
        var py = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
        var f = Math.pow(.42, dt); p.vx *= f; p.vy *= f;
        if (Math.abs(p.vx) + Math.abs(p.vy) < 5) { p.vx = 0; p.vy = 0; }
        if (p.x < R) { p.x = R; p.vx = Math.abs(p.vx) * .82; } if (p.x > W - R) { p.x = W - R; p.vx = -Math.abs(p.vx) * .82; }
        if (p.y < R) { p.y = R; p.vy = Math.abs(p.vy) * .82; } if (p.y > H - R) { p.y = H - R; p.vy = -Math.abs(p.vy) * .82; }
        if (Math.abs(p.y - WY) < R + 6) {
          if (p.x < G0 || p.x > G1) { var up = py < WY; if (Math.abs(p.vy) > 320) ev.push({ t: 'w', x: p.x, y: WY + (up ? -6 : 6) }); p.y = up ? WY - R - 6 : WY + R + 6; p.vy = (up ? -1 : 1) * Math.abs(p.vy) * .82; }
          else [G0, G1].forEach(function (gx) {
            var dx = p.x - gx, dy = p.y - WY, d = Math.sqrt(dx * dx + dy * dy), m = R + 5;
            if (d < m && d > 0) { var nx = dx / d, ny = dy / d, vn = p.vx * nx + p.vy * ny; p.x = gx + nx * m; p.y = WY + ny * m; if (vn < 0) { p.vx -= 1.8 * vn * nx; p.vy -= 1.8 * vn * ny; } }
          });
        }
        if ((py - WY) * (p.y - WY) < 0) ev.push({ t: 'g', x: p.x, up: p.y < WY });
      }
      for (i = 0; i < pk.length; i++) for (j = i + 1; j < pk.length; j++) {
        p = pk[i]; q = pk[j];
        var dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 2 * R || d === 0) continue;
        var nx = dx / d, ny = dy / d, ov = 2 * R - d;
        if (p === drag) { q.x += nx * ov; q.y += ny * ov; } else if (q === drag) { p.x -= nx * ov; p.y -= ny * ov; } else { p.x -= nx * ov / 2; p.y -= ny * ov / 2; q.x += nx * ov / 2; q.y += ny * ov / 2; }
        var rv = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
        if (rv < 0 && p !== drag && q !== drag) { var k = rv * .95; p.vx += k * nx; p.vy += k * ny; q.vx -= k * nx; q.vy -= k * ny; }
      }
    }
    function bot(t) {
      if (t < botAt) return;
      botAt = t + 1200 + rnd() * 1300;
      var c0 = pk.filter(function (p) { return p.y < WY - R - 6 && Math.abs(p.vx) + Math.abs(p.vy) < 30; });
      if (!c0.length) return;
      var p = c0[ri(c0.length)], tx = 147 + (rnd() - .5) * 120, dx = tx - p.x, dy = WY - p.y, d = Math.sqrt(dx * dx + dy * dy), sp = 560 + rnd() * 380;
      p.vx = dx / d * sp; p.vy = dy / d * sp;
    }
    function frame(t) {
      if (!run) return;
      var dt = Math.min(.034, (t - last) / 1000 || .016); last = t;
      bot(t); step(dt / 2); step(dt / 2);
      pk.forEach(function (p) { p.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; p.el.classList.toggle('b', p.y < WY); });
      ev.splice(0).forEach(function (e) {
        if (e.t === 'w') return burst(rink, e.x, e.y, [c('text'), c('card')], 4, 14);
        burst(rink, e.x, WY, [c(e.up ? 'p1' : 'p2'), c('cta'), c('card')], 9, 26);
      });
      var cn = counts();
      if (cn.join() !== lastCn) {
        var old = lastCn.split(','); lastCn = cn.join();
        [0, 1].forEach(function (i) { var b = el.querySelector('[data-c="' + i + '"]'); b.textContent = cn[i]; el.querySelector('[data-pips="' + i + '"]').innerHTML = pips(cn[i]); if (+old[i] !== cn[i]) bump(b); });
      }
      if (!drag && (cn[0] === 0 || cn[1] === 0)) { run = false; ended = cn[0] === 0 ? 'you' : 'maya'; draw(); celebrate(el, ended !== 'you'); return; }
      requestAnimationFrame(frame);
    }
    pk = stage();
    if (st === 'start') pk = kickoff();
    if (st === 'end') { pk = stage(); pk.forEach(function (p, i) { if (p.y > WY) { p.y = 40 + i * 30; p.x = 40 + (i * 67) % 220; } }); ended = 'you'; }
    draw();
    if (!live) return;
    wire(el, function (a) { if (a === 'again') { pk = kickoff(); ended = null; round++; run = true; draw(); botAt = performance.now() + 1200; last = performance.now(); requestAnimationFrame(frame); } });
    var start = null;
    el.addEventListener('pointerdown', function (e) {
      if (ended || !e.target.closest('.rink')) return;
      var m = local(rink, e, BW), best = null, bd = 36;
      pk.forEach(function (p) { var d = Math.hypot(p.x - m.x, p.y - m.y); if (p.y > WY + R && d < bd) { bd = d; best = p; } });
      if (!best) return;
      e.preventDefault();
      if (!run) { run = true; var bi = pk.indexOf(best); draw(); best = pk[bi]; botAt = performance.now() + 1400; last = performance.now(); requestAnimationFrame(frame); }
      drag = best; drag.vx = drag.vy = 0; start = { x: drag.x, y: drag.y }; drag.el.classList.add('drag');
      var g = rink.querySelector('.ghost'); g.setAttribute('cx', start.x); g.setAttribute('cy', start.y); g.style.display = '';
      try { rink.setPointerCapture(e.pointerId); } catch (x) { /* older engines */ }
    });
    el.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var m = local(rink, e, BW);
      drag.x = clamp(m.x, R, W - R); drag.y = clamp(m.y, WY + R + 6, H - R);
      var dx = start.x - drag.x, dy = start.y - drag.y, d = Math.hypot(dx, dy), near = drag.y > BB - 44 ? drag : null;
      var ar = d > 6 ? arrow(start.x, start.y, start.x + dx * 1.6, start.y + dy * 1.6) : ['', ''];
      rink.querySelector('.aim').setAttribute('d', ar[0]); rink.querySelector('.aimh').setAttribute('d', ar[1]);
      rink.querySelector('.bb').setAttribute('d', bandPath(BB, near)); rink.querySelector('.bbo').setAttribute('d', bandPath(BB, near));
    });
    function release() {
      if (!drag) return;
      var dx = start.x - drag.x, dy = start.y - drag.y, d = Math.hypot(dx, dy);
      if (d > 6) { var sp = Math.min(1150, d * 11); drag.vx = dx / d * sp; drag.vy = dy / d * sp; burst(rink, drag.x, drag.y, [c('p1'), c('card')], 5, 16); }
      drag.el.classList.remove('drag'); drag = null;
      rink.querySelector('.ghost').style.display = 'none';
      rink.querySelector('.aim').setAttribute('d', ''); rink.querySelector('.aimh').setAttribute('d', ''); rink.querySelector('.bb').setAttribute('d', bandPath(BB)); rink.querySelector('.bbo').setAttribute('d', bandPath(BB));
      rink.classList.remove('snap'); void rink.offsetWidth; rink.classList.add('snap');
    }
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release);
  };

  /* ================= CHOP CHOP ================= */
  var MALLET = ['.kkkkkkkkkk.', 'khhhhhhhhhhk', 'khllhhhhhhdk', 'khhhhhhhhhdk', 'khhhhhhhdddk', '.kkkkkkkkkk.', '....kwwk....', '....kwwk....', '....kwwk....', '....kwwk....', '....kwwk....', '....kwwk....', '....kkkk....'];
  function crate(alt, i) {
    var base = alt ? c('card') : c('tint-cta'), pl = c('cta', alt ? .38 : .5), s = '<svg class="crate" style="bottom:' + (i * 40) + 'px" viewBox="0 0 34 20" shape-rendering="crispEdges" preserveAspectRatio="none">' +
      '<rect width="34" height="20" style="fill:' + c('text') + '"/><rect x="1" y="1" width="32" height="18" style="fill:' + base + '"/>';
    for (var k = 0; k < 13; k++) s += '<rect x="' + (4 + k * 2) + '" y="' + (4 + k) + '" width="3" height="1" style="fill:' + pl + '"/><rect x="' + (27 - k * 2) + '" y="' + (4 + k) + '" width="3" height="1" style="fill:' + pl + '"/>';
    return s + '<rect x="1" y="1" width="32" height="3" style="fill:' + pl + '"/><rect x="1" y="16" width="32" height="3" style="fill:' + pl + '"/><rect x="1" y="1" width="3" height="18" style="fill:' + pl + '"/><rect x="30" y="1" width="3" height="18" style="fill:' + pl + '"/>' +
      '<rect x="1" y="1" width="32" height="1" style="fill:' + c('card', .85) + '"/><rect x="1" y="1" width="1" height="18" style="fill:' + c('card', .6) + '"/><rect x="1" y="18" width="32" height="1" style="fill:' + c('text', .28) + '"/><rect x="32" y="1" width="1" height="18" style="fill:' + c('text', .2) + '"/>' +
      '<rect x="2" y="2" width="1" height="1" style="fill:' + c('text') + '"/><rect x="31" y="2" width="1" height="1" style="fill:' + c('text') + '"/><rect x="2" y="17" width="1" height="1" style="fill:' + c('text') + '"/><rect x="31" y="17" width="1" height="1" style="fill:' + c('text') + '"/></svg>';
  }
  var CITY = '<svg class="bg" viewBox="0 0 298 332" preserveAspectRatio="none">' +
    '<rect width="298" height="70" style="fill:' + c('p4', .1) + '"/><rect y="70" width="298" height="60" style="fill:' + c('p4', .05) + '"/>' +
    '<rect x="222" y="58" width="30" height="30" style="fill:' + c('tint-cta') + '"/><rect x="226" y="54" width="22" height="38" style="fill:' + c('tint-cta') + '"/><rect x="218" y="62" width="38" height="22" style="fill:' + c('tint-cta') + '"/>' +
    '<g style="fill:' + c('structure', .32) + '"><rect x="16" y="150" width="30" height="158"/><rect x="92" y="170" width="24" height="138"/><rect x="176" y="140" width="28" height="168"/><rect x="262" y="176" width="36" height="132"/></g>' +
    '<g style="fill:' + c('structure', .62) + '"><rect x="0" y="212" width="34" height="96"/><rect x="38" y="176" width="28" height="132"/><rect x="70" y="230" width="30" height="78"/><rect x="204" y="196" width="26" height="112"/><rect x="234" y="160" width="32" height="148"/><rect x="270" y="222" width="28" height="86"/></g>' +
    '<g style="fill:' + c('text', .1) + '"><rect x="62" y="176" width="4" height="132"/><rect x="262" y="160" width="4" height="148"/><rect x="30" y="212" width="4" height="96"/><rect x="226" y="196" width="4" height="112"/></g>' +
    '<g style="fill:' + c('card', .75) + '"><rect x="44" y="186" width="5" height="6"/><rect x="54" y="186" width="5" height="6"/><rect x="44" y="200" width="5" height="6"/><rect x="54" y="214" width="5" height="6"/><rect x="240" y="170" width="5" height="6"/><rect x="252" y="170" width="5" height="6"/><rect x="240" y="186" width="5" height="6"/><rect x="252" y="202" width="5" height="6"/><rect x="8" y="222" width="5" height="6"/><rect x="18" y="238" width="5" height="6"/><rect x="210" y="208" width="5" height="6"/><rect x="278" y="234" width="5" height="6"/></g></svg>' +
    '<i class="cloud c1"></i><i class="cloud c2"></i>';
  G.chop = function (el, st, live) {
    var S = { tower: ['', 'R', '', 'L', '', 'R', '', 'L'], side: 'L', score: 42, streak: 12, opp: 38, time: .62, bonk: false, end: null };
    if (st === 'bonk') { S.tower = ['', '', 'R', '', 'L', '', 'R', '']; S.bonk = true; S.streak = 0; S.score = 43; S.opp = 41; S.time = .55; }
    if (st === 'end') { S.score = 61; S.opp = 54; S.time = 0; S.end = true; S.streak = 0; }
    var run = false, last = 0, stunTo = 0, oppF = 0, secs = 30;
    function grow() { while (S.tower.length < 9) { var prev = S.tower[S.tower.length - 1], r = rnd(); S.tower.push(prev ? '' : r < .3 ? 'L' : r < .6 ? 'R' : ''); } }
    function stackHtml() {
      return S.tower.slice(0, 6).map(function (b, i) {
        return crate((i + S.score) % 2, i) + (b ? '<div class="beam ' + b + (i < 2 ? ' next' : '') + '" style="bottom:' + (i * 40 + 11) + 'px"></div>' : '');
      }).join('');
    }
    var leadTxt = function () { var d = S.score - S.opp; return d > 0 ? '+' + d + ' AHEAD' : d < 0 ? Math.abs(d) + ' BEHIND' : 'LEVEL'; };
    var clockTxt = function () { return '0:' + ('0' + Math.ceil(Math.max(0, S.time) * secs)).slice(-2); };
    var pillTxt = function () { return S.bonk ? 'STUNNED! SHAKE IT OFF…' : !run && live ? 'TAP A SIDE TO START' : S.streak > 9 ? 'ON FIRE! KEEP GOING' : 'DODGE THE STRIPED BEAMS'; };
    function draw() {
      var d = S.score - S.opp, dg = S.tower[0] || S.tower[1];
      var btn = function (s, lab) { return '<button class="btn go big' + (S.side === s ? ' fill' : '') + (dg === s ? ' warn' : '') + '" data-act="' + s + '"' + (S.bonk ? ' disabled' : '') + '>' + lab + '<small>' + (dg === s ? 'BEAM!' : 'CLEAR') + '</small></button>'; };
      var body = '<div class="seats">' + seat(0, { on: true, score: S.score }) + seat(1, { score: S.opp }) + '</div>' +
        '<div class="scene arena" data-lavish-action="true">' + CITY +
        '<div class="tbar' + (S.time < .2 ? ' low' : '') + '"><div><i style="transform:scaleX(' + S.time + ')"></i></div><span data-clock>' + clockTxt() + '</span></div>' +
        '<div class="chud"><div><div class="bigc"><span data-n>' + S.score + '</span><small>CRATES</small></div><div class="streak' + (S.streak > 2 ? '' : ' off') + (S.streak > 9 ? ' hot' : '') + '">STREAK ×<span data-s>' + S.streak + '</span></div></div>' +
        '<div class="lead ' + (d >= 0 ? 'up' : 'dn') + '"><img src="' + (P[1] ? P[1].bust : '') + '" alt=""><span><small>VS MAYA</small><b data-lead>' + leadTxt() + '</b></span></div></div>' +
        '<i class="stsh"></i><div class="stack">' + stackHtml() + '</div>' +
        '<div class="hero ' + S.side + (S.bonk ? ' bonk' : '') + '">' + (S.bonk ? '<span class="stars">* * *</span>' : '') + '<i class="hsh"></i><img src="' + (P[0] ? P[0].idle : '') + '" alt=""><span class="mal">' + sprite(MALLET, { k: c('text'), h: c('cta'), l: c('tint-cta'), d: mix('cta', 'text', 68), w: c('tint-cta') }) + '</span></div>' +
        (S.bonk ? '<div class="bonkmsg">BONK!</div>' : '') +
        '<div class="ground"></div>' +
        '</div>' +
        '<div class="btns">' + btn('L', '◀ LEFT') + btn('R', 'RIGHT ▶') + '</div>' +
        (S.end ? endPanel({ win: S.score >= S.opp, who: S.score >= S.opp ? 0 : 1, head: S.score >= S.opp ? 'YOU WIN!' : 'MAYA WINS', score: S.score + ' — ' + S.opp, note: 'MOST CRATES IN 30 SECONDS' }) : '');
      el.innerHTML = shell('CHOP CHOP', body, S.end ? '' : pillTxt(), S.bonk);
    }
    function q(s) { return el.querySelector(s); }
    function hud() {
      var d = S.score - S.opp, dg = S.tower[0] || S.tower[1];
      q('[data-n]').textContent = S.score; q('[data-s]').textContent = S.streak;
      q('.streak').classList.toggle('off', S.streak < 3); q('.streak').classList.toggle('hot', S.streak > 9);
      q('[data-score="0"]').textContent = S.score; q('[data-score="1"]').textContent = S.opp;
      q('[data-lead]').textContent = leadTxt(); q('.lead').className = 'lead ' + (d >= 0 ? 'up' : 'dn');
      q('[data-pill]').textContent = pillTxt(); q('.pill').classList.toggle('wait', S.bonk);
      el.querySelectorAll('.btn.big').forEach(function (b) { var w = dg === b.dataset.act; b.classList.toggle('warn', w); b.disabled = S.bonk; b.querySelector('small').textContent = w ? 'BEAM!' : 'CLEAR'; });
    }
    function bonk(t) {
      S.bonk = true; S.streak = 0; stunTo = t + 1100; S.tower[0] = '';
      var h = q('.hero'), sc = q('.scene'); h.classList.add('bonk'); h.insertAdjacentHTML('afterbegin', '<span class="stars">* * *</span>');
      sc.insertAdjacentHTML('beforeend', '<div class="bonkmsg">BONK!</div><i class="redflash"></i>'); q('.stack').innerHTML = stackHtml(); shake(sc);
    }
    function chop(side) {
      var t = performance.now();
      if (S.end) return;
      if (!run) { S = { tower: [''], side: side, score: 0, streak: 0, opp: 0, time: 1, bonk: false, end: null }; grow(); run = true; last = t; oppF = 0; draw(); requestAnimationFrame(frame); }
      if (S.bonk) return;
      S.side = side;
      var h = q('.hero'); h.className = 'hero ' + side;
      el.querySelectorAll('.btn.big').forEach(function (b) { b.classList.toggle('fill', b.dataset.act === side); });
      if (S.tower[0] === side) { bonk(t); return hud(); }
      S.tower.shift(); grow(); S.score++; S.streak++;
      var sc = q('.scene'), stk = q('.stack');
      stk.innerHTML = stackHtml(); stk.classList.remove('drop'); void stk.offsetWidth; stk.classList.add('drop');
      void h.offsetWidth; h.classList.add('swing');
      sc.insertAdjacentHTML('beforeend', '<div class="flyc ' + (side === 'L' ? 'toR' : 'toL') + '">' + crate(!(S.score % 2), 0) + '</div><div class="wham" style="left:calc(50% ' + (side === 'L' ? '- 56px' : '+ 20px') + ')"></div>');
      burst(sc, sc.offsetWidth / 2 + (side === 'L' ? -34 : 34), sc.offsetHeight - 34, [c('structure'), c('card'), c('tint-cta')], 5, 20, 6);
      bump(q('[data-n]')); if (S.streak % 10 === 0) { bump(q('.streak')); burst(sc, 60, 92, [c('cta'), c('danger'), c('tint-cta')], 12, 30, 8); }
      setTimeout(function () { sc.querySelectorAll('.flyc, .wham').forEach(function (n, i, all) { if (i < all.length - 2) n.remove(); }); }, 340);
      if (S.tower[0] === side) bonk(t);
      hud();
    }
    function frame(t) {
      if (!run) return;
      var dt = Math.min(.05, (t - last) / 1000); last = t;
      S.time -= dt / secs; oppF += dt * (2.5 + rnd() * 1.6);
      if (oppF >= 1) { S.opp += 1; oppF -= 1; }
      if (S.bonk && t > stunTo) { S.bonk = false; q('.hero').classList.remove('bonk'); el.querySelectorAll('.stars, .bonkmsg, .redflash').forEach(function (n) { n.remove(); }); }
      q('.tbar i').style.transform = 'scaleX(' + Math.max(0, S.time) + ')'; q('.tbar').classList.toggle('low', S.time < .2); q('[data-clock]').textContent = clockTxt();
      hud();
      if (S.time <= 0) { run = false; S.end = true; S.time = 0; S.bonk = false; draw(); celebrate(el, S.score < S.opp); return; }
      requestAnimationFrame(frame);
    }
    draw();
    if (!live) return;
    wire(el, function (a) { if (a === 'again') { S.end = null; run = false; chop('L'); } if (a === 'L' || a === 'R') chop(a); });
    window.addEventListener('keydown', function (e) {
      if (!run || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault(); chop(e.key === 'ArrowLeft' ? 'L' : 'R');
    });
  };

  /* ================= GULP ================= */
  var FROG = ['....kkk....kkk....', '...kwwwk..kwwwk...', '...kwkwkkkkwkwk...', '...kwwwbbbbwwwk...', '..kkkkbbbbbbkkkk..', '.kbbbbbbbbbbbbbbk.', 'kbblbbbbbbbbblbbbk', 'kbbbbbbblbbbbbbbbk',
    'kbbbbbbbbbbbbbbdbk', '.kbbblbbbbbbbbddk.', 'kkkbbbbbbbbbbddkkk', 'kbbkkbbbbbbddkkbbk', 'kbbbkkkkkkkkkkbbbk', 'kddbk........kbddk', '.kkkk........kkkk.'];
  var FLY = ['..ww.....ww..', '.wwww...wwww.', '.wwwwkkkwwww.', '..ww.kkk.ww..', '....kkkkk....', '.....ggg.....', '....ggggg....', '.....ggg.....'];
  var WASP = ['..ww.....ww..', '.wwww...wwww.', '.wwwwkkkwwww.', '..ww.rrr.ww..', '....kkkkk....', '....rrrrr....', '.....kkk.....', '......r......'];
  var BUGS = {
    n: sprite(FLY, { w: c('card'), k: c('text'), g: c('win') }),
    g: sprite(FLY, { w: c('card'), k: mix('cta', 'text', 60), g: c('cta') }),
    w: sprite(WASP, { w: c('card'), k: c('text'), r: c('danger') })
  };
  var PTS = { n: 1, g: 3, w: -2 }, RIM = 2 * Math.PI * 131;
  G.gulp = function (el, st, live) {
    var CX = 149, PD = 117, MD = 90, REACH = 80, LW = 13, phone = st === 'phone';
    var ang = phone ? [135, 315, 225, 45] : [90, 270, 180, 0]; /* screen angles, y down: you sit at the bottom */
    var fr = ang.map(function (a, i) {
      var r = a * Math.PI / 180, ux = -Math.cos(r), uy = -Math.sin(r);
      return { i: i, x: CX - ux * PD, y: CX - uy * PD, mx: CX - ux * MD, my: CX - uy * MD, ux: ux, uy: uy, deg: Math.atan2(ux, -uy) * 180 / Math.PI, ready: 0, tg: null };
    });
    var S = { score: [11, 9, 7, 12], time: 24, end: null };
    var bugs = [['n', 96, 96], ['n', 204, 88], ['n', 78, 168], ['n', 212, 188], ['n', 118, 226], ['g', 149, 190], ['w', 180, 168], ['w', 112, 138], ['n', 172, 120], ['n', 66, 122], ['n', 232, 148]].map(function (b) { return { t: b[0], x: b[1], y: b[2], a: rnd() * 6.28, hide: 0 }; });
    if (phone) bugs[5].x = 122, bugs[5].y = 176;
    if (st === 'end') { S.score = [17, 14, 9, 19]; S.time = 0; S.end = true; }
    var run = false, last = 0, staticTongue = !phone && st !== 'end', cue = '';
    function pondSvg() {
      var s = '<svg viewBox="0 0 298 298"><circle cx="149" cy="152" r="146" style="fill:' + c('text', .16) + '"/><circle cx="149" cy="149" r="146" style="fill:' + c('tint-p1') + ';stroke:' + c('text') + ';stroke-width:2"/>';
      for (var k = 0; k < 20; k++) { var a = k * Math.PI / 10 + .16, x = 149 + Math.cos(a) * 139, y = 149 + Math.sin(a) * 139; s += '<rect x="' + (x - 1.5) + '" y="' + (y - 4) + '" width="3" height="7" style="fill:' + c('p1', .75) + '"/><rect x="' + (x + 2.5) + '" y="' + (y - 1) + '" width="2" height="4" style="fill:' + c('p1', .45) + '"/>'; }
      s += '<circle cx="149" cy="149" r="131" style="fill:' + c('tint-p4') + ';stroke:' + c('text', .55) + ';stroke-width:2"/>' +
        '<circle cx="149" cy="149" r="96" style="fill:' + c('p4', .09) + '"/><circle cx="149" cy="149" r="56" style="fill:' + c('p4', .09) + '"/>' +
        '<path d="M34 104A124 124 0 0 1 104 34" style="fill:none;stroke:' + c('card', .8) + ';stroke-width:4;stroke-linecap:round"/>' +
        '<g class="rip">';
      [104, 70, 36].forEach(function (r, i) { s += '<circle cx="149" cy="149" r="' + r + '" style="fill:none;stroke:' + c('card', .95) + ';stroke-width:2;stroke-dasharray:' + (10 + i * 4) + ' ' + (16 - i * 2) + '"/>'; });
      s += '</g><circle data-rim cx="149" cy="149" r="131" transform="rotate(-90 149 149)" style="fill:none;stroke:' + c('p4') + ';stroke-width:5;stroke-dasharray:' + RIM + ';stroke-dashoffset:' + (RIM * (1 - S.time / 30)) + '"/>';
      fr.forEach(function (f) {
        var nx = -f.uy, ny = f.ux, me = !f.i, a = [f.mx + nx * LW, f.my + ny * LW], b = [f.mx - nx * LW, f.my - ny * LW], e = [f.mx + f.ux * REACH, f.my + f.uy * REACH];
        /* the lit strip is the real catch zone: anything inside it gets grabbed */
        s += '<path ' + (me ? 'data-lane ' : '') + 'd="M' + a + ' L' + (e[0] + nx * LW) + ' ' + (e[1] + ny * LW) + ' L' + (e[0] - nx * LW) + ' ' + (e[1] - ny * LW) + ' L' + b + 'Z" style="fill:' + c(me ? 'card' : 'p' + (f.i + 1), me ? .6 : .1) + ';stroke:' + c('p' + (f.i + 1), me ? .9 : .3) + ';stroke-width:' + (me ? 2 : 1) + ';stroke-dasharray:' + (me ? '5 4' : '2 5') + '"/>' +
          '<circle cx="' + (f.x + 2) + '" cy="' + (f.y + 4) + '" r="31" style="fill:' + c('text', .18) + '"/>' +
          '<circle cx="' + f.x + '" cy="' + f.y + '" r="31" style="fill:' + mix('win', 'tint-p1', 38) + ';stroke:' + c('text') + ';stroke-width:2"/>' +
          '<circle cx="' + f.x + '" cy="' + f.y + '" r="24" style="fill:none;stroke:' + c('card', .28) + ';stroke-width:3;stroke-dasharray:24 70"/>' +
          '<path d="M' + f.x + ' ' + f.y + ' L' + (f.x - f.ux * 33 - f.uy * 9) + ' ' + (f.y - f.uy * 33 + f.ux * 9) + ' L' + (f.x - f.ux * 33 + f.uy * 9) + ' ' + (f.y - f.uy * 33 - f.ux * 9) + 'Z" style="fill:' + c('tint-p1') + '"/>' +
          '<path data-tgo="' + f.i + '" d="" style="stroke:' + c('text') + ';stroke-width:8;stroke-linecap:round;fill:none"/><path data-tg="' + f.i + '" d="" style="stroke:' + c('p3') + ';stroke-width:4.5;stroke-linecap:round;fill:none"/>';
      });
      return s + '</svg>';
    }
    function frogPal(i) { return { k: c('text'), w: c('card'), e: c('text'), b: c('p' + (i + 1)), l: c('tint-p' + (i + 1)), d: mix('p' + (i + 1), 'text', 70) }; }
    function clockTxt() { return '0:' + ('0' + Math.ceil(S.time)).slice(-2); }
    function tongue(f, d) { el.querySelector('[data-tg="' + f.i + '"]').setAttribute('d', d); el.querySelector('[data-tgo="' + f.i + '"]').setAttribute('d', d); }
    function draw() {
      var lead = S.score.indexOf(Math.max.apply(null, S.score));
      var pond = '<div class="pond">' + pondSvg() + '<span class="clock' + (phone ? ' mid' : '') + (S.time <= 5 && !S.end ? ' low' : '') + '" data-clock>' + clockTxt() + '</span>' +
        bugs.map(function (b, i) { return '<span class="bug ' + b.t + '" data-b="' + i + '" style="transform:translate(' + b.x + 'px,' + b.y + 'px)"><i>' + BUGS[b.t] + '</i></span>'; }).join('') +
        fr.map(function (f) { return '<span class="frog" data-f="' + f.i + '" style="left:' + f.x + 'px;top:' + f.y + 'px;rotate:' + f.deg + 'deg">' + sprite(FROG, frogPal(f.i)) + '</span>'; }).join('') +
        (phone ? '' : fr.map(function (f) { var side = Math.abs(f.ux) > .5; return '<span class="ftag s' + (f.i + 1) + '" style="left:' + (f.x + (side ? 0 : 54)) + 'px;top:' + (f.y + (side ? 40 : f.i ? -4 : 6)) + 'px">' + NAMES[f.i] + '</span>'; }).join('')) +
        (staticTongue && !run ? '<span class="popn still cta" style="left:' + bugs[5].x + 'px;top:' + bugs[5].y + 'px">+3</span>' : '') +
        '</div>';
      var body;
      if (phone) {
        var cb = function (i, flip) { return '<button class="btn go big s' + (i + 1) + '" style="border-color:' + c('p' + (i + 1)) + ';color:' + c('p' + (i + 1)) + ';background:' + c('tint-p' + (i + 1)) + ';box-shadow:0 4px 0 ' + c('p' + (i + 1), .5) + (flip ? ';rotate:180deg' : '') + '">GULP!<small style="color:inherit">' + NAMES[i] + ' · ' + S.score[i] + '</small></button>'; };
        body = '<div class="btns" style="margin:0 0 8px">' + cb(1, 1) + cb(3, 1) + '</div>' + pond + '<div class="btns">' + cb(2) + cb(0) + '</div>';
      } else {
        body = '<div class="seats four">' + [0, 1, 2, 3].map(function (i) { return seat(i, { on: i === 0, score: S.score[i] }); }).join('') + '</div>' + pond +
          '<div class="legend"><span><i class="bug n"><i>' + BUGS.n + '</i></i>+1</span><span><i class="bug g"><i>' + BUGS.g + '</i></i>+3 GOLD</span><span class="bad"><i class="bug w"><i>' + BUGS.w + '</i></i>-2 WASP</span></div>' +
          '<div class="btns"><button class="btn go big fill gulpb" data-act="gulp">GULP!<small data-cue>' + (run ? 'WAIT FOR IT…' : staticTongue ? 'GOLD IN YOUR LANE!' : 'PRESS WHEN YOUR LANE LIGHTS UP') + '</small><span class="charge"><i></i></span></button></div>' +
          (S.end ? endPanel({ win: lead === 0, who: lead, head: lead === 0 ? 'YOU WIN!' : NAMES[lead] + ' WINS', score: S.score.slice().sort(function (a, b) { return b - a; }).join(' · '), note: 'MOST POINTS WHEN THE CLOCK HITS ZERO' }) : '');
      }
      el.innerHTML = shell(phone ? 'GULP · ONE PHONE' : 'GULP', body, phone ? 'ONE BUTTON IN EACH CORNER' : S.end ? '' : run ? 'FIREFLIES GOOD · WASPS BAD' : 'YOU ARE THE GREEN FROG');
      if (staticTongue && !run) { var f = fr[0]; tongue(f, 'M' + f.mx + ' ' + f.my + ' L' + bugs[5].x + ' ' + (bugs[5].y + 8)); el.querySelector('[data-b="5"]').classList.add('tgt'); }
      bugs.forEach(function (b, i) { b.el = el.querySelector('[data-b="' + i + '"]'); });
      cue = '';
    }
    function inLane(f) {
      var best = null, bt = 1e9;
      bugs.forEach(function (b) {
        if (b.hide) return;
        var rx = b.x - f.mx, ry = b.y - f.my, t = rx * f.ux + ry * f.uy, pr = Math.abs(rx * f.uy - ry * f.ux);
        if (t > 4 && t < REACH && pr < LW && t < bt) { bt = t; best = b; }
      });
      return best ? { b: best, t: bt } : null;
    }
    function gulp(f, t) {
      if (t < f.ready || f.tg) return;
      var hit = inLane(f);
      f.ready = t + 650; f.tg = { t0: t, len: hit ? hit.t : REACH, b: hit && hit.b, done: false };
      var fe = el.querySelector('[data-f="' + f.i + '"]'); fe.classList.remove('gulp'); void fe.offsetWidth; fe.classList.add('gulp');
    }
    function frame(t) {
      if (!run) return;
      var dt = Math.min(.05, (t - last) / 1000); last = t; S.time -= dt;
      var pond = el.querySelector('.pond');
      bugs.forEach(function (b) {
        if (b.hide) { if (t > b.hide) { b.hide = 0; var a = rnd() * 6.28, r = 40 + rnd() * 70; b.x = CX + Math.cos(a) * r; b.y = CX + Math.sin(a) * r; b.el.style.display = ''; } else return; }
        var sp = b.t === 'w' ? 58 : b.t === 'g' ? 52 : 40;
        b.a += (rnd() - .5) * 3 * dt; b.x += Math.cos(b.a) * sp * dt; b.y += Math.sin(b.a) * sp * dt;
        var dx = b.x - CX, dy = b.y - CX, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 110) { b.a = Math.atan2(-dy, -dx) + (rnd() - .5); b.x = CX + dx / d * 110; b.y = CX + dy / d * 110; }
        b.el.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
      });
      /* the cue: your lane and the button tell you what a press would catch right now */
      var mine = inLane(fr[0]), nc = !mine ? '' : mine.b.t;
      if (nc !== cue) {
        cue = nc;
        var gb = el.querySelector('.gulpb'), ln = el.querySelector('[data-lane]');
        gb.classList.toggle('hot', nc === 'n' || nc === 'g'); gb.classList.toggle('bad', nc === 'w');
        el.querySelector('[data-cue]').textContent = nc === 'w' ? 'WASP FIRST · HOLD!' : nc === 'g' ? 'GOLD! NOW!' : nc === 'n' ? 'NOW!' : 'WAIT FOR IT…';
        ln.style.fill = nc === 'w' ? c('tint-danger', .85) : nc ? c('tint-cta', .95) : c('card', .6);
      }
      bugs.forEach(function (b) { b.el.classList.toggle('tgt', !!mine && mine.b === b); });
      fr.forEach(function (f) {
        if (f.i && !f.tg && t > f.ready) { var h = inLane(f); if (h && rnd() < (h.b.t === 'w' ? .5 : h.b.t === 'g' ? 9 : 4.5) * dt) gulp(f, t); }
        if (!f.tg) return;
        var e = (t - f.tg.t0) / 1000, k = e < .09 ? e / .09 : 1 - (e - .09) / .13;
        if (e >= .09 && !f.tg.done) {
          f.tg.done = true; var b = f.tg.b;
          if (b && !b.hide) {
            b.hide = t + 700; b.el.style.display = 'none'; S.score[f.i] = Math.max(0, S.score[f.i] + PTS[b.t]);
            var sc = el.querySelector('[data-score="' + f.i + '"]'); sc.textContent = S.score[f.i]; bump(sc);
            pond.insertAdjacentHTML('beforeend', '<span class="popn ' + (b.t === 'w' ? 'bad' : 'p' + (f.i + 1)) + '" style="left:' + b.x + 'px;top:' + b.y + 'px">' + (PTS[b.t] > 0 ? '+' : '-') + Math.abs(PTS[b.t]) + '</span>');
            burst(pond, b.x, b.y, b.t === 'w' ? [c('danger'), c('card')] : b.t === 'g' ? [c('cta'), c('tint-cta'), c('card')] : [c('card'), c('p4', .6)], b.t === 'g' ? 12 : 7, b.t === 'g' ? 30 : 20);
            if (!f.i) { el.querySelector('[data-pill]').textContent = b.t === 'w' ? 'OUCH! A WASP · -2' : b.t === 'g' ? 'GOLD! +3' : 'GULP! +1'; if (b.t === 'w') shake(pond); }
          } else if (!f.i) el.querySelector('[data-pill]').textContent = 'MISSED · WAIT FOR YOUR LANE';
        }
        if (k <= 0) { f.tg = null; tongue(f, ''); return; }
        var L = f.tg.len * k; tongue(f, 'M' + f.mx + ' ' + f.my + ' L' + (f.mx + f.ux * L) + ' ' + (f.my + f.uy * L));
      });
      var ch = el.querySelector('.charge i'); if (ch) ch.style.transform = 'scaleX(' + clamp(1 - (fr[0].ready - t) / 650, 0, 1) + ')';
      var ck = el.querySelector('[data-clock]'); ck.textContent = clockTxt(); ck.classList.toggle('low', S.time <= 5);
      el.querySelector('[data-rim]').style.strokeDashoffset = RIM * (1 - Math.max(0, S.time) / 30);
      el.querySelectorAll('.popn').forEach(function (n, i, all) { if (i < all.length - 6) n.remove(); });
      if (S.time <= 0) { run = false; S.time = 0; S.end = true; draw(); celebrate(el, S.score.indexOf(Math.max.apply(null, S.score)) !== 0); return; }
      requestAnimationFrame(frame);
    }
    draw();
    if (!live) return;
    function go(t) { S = { score: [0, 0, 0, 0], time: 30, end: null }; bugs.forEach(function (b) { b.hide = 0; }); fr.forEach(function (f) { f.ready = 0; f.tg = null; }); run = true; last = t; draw(); requestAnimationFrame(frame); }
    wire(el, function (a) {
      var t = performance.now();
      if (a === 'again') return go(t);
      if (a !== 'gulp' || S.end) return;
      if (!run) go(t);
      gulp(fr[0], t);
    });
  };

  document.querySelectorAll('[data-game]').forEach(function (el) {
    var g = G[el.dataset.game];
    if (!g) return;
    try { g(el, el.dataset.state || '', !el.classList.contains('mini')); } catch (e) { el.textContent = 'mockup failed: ' + e.message; }
  });
})();
