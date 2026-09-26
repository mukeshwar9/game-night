// Animal Stack — prototype engine (design page only, not app code).
// Pure-ish sim + renderer shared by the playable prototype and the mockups.
// Physics: planck.js v1.4.2 with Math.sin/cos rewritten to deterministic
// Taylor trig (det.js). Every drop starts from a quantised "canonical" state,
// so a replay of seed + [{piece, x, rot}] reproduces the tower bit for bit.
(function () {
  'use strict'
  var P = window.planck
  var ds = window.__detSin, dc = window.__detCos

  var DT = 1 / 60, VEL_IT = 8, POS_IT = 3
  var ROT_STEPS = 24, ROT_STEP = (2 * Math.PI) / ROT_STEPS // 15° steps
  var FALL_Y = -1.2 // any animal whose centre sinks below this has left the island
  var STILL_V = 0.06, STILL_W = 0.1, STILL_TICKS = 36, MAX_TICKS = 540
  var AIM_LIMIT = 3.2
  var ISLAND = [[-2.6, 0], [2.6, 0], [2.35, -0.35], [1.9, -1.6], [-1.9, -1.6], [-2.35, -0.35]]

  function B(hw, hh, cx, cy, a) {
    cx = cx || 0; cy = cy || 0; a = a || 0
    var c = dc(a), s = ds(a)
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (p) {
      return [cx + p[0] * c - p[1] * s, cy + p[0] * s + p[1] * c]
    })
  }

  // Shapes are compounds of convex parts (metres). density feeds planck's mass.
  var PIECES = [
    { id: 'elephant', name: 'ELEPHANT', tone: 'dim', density: 1.3, weight: 'HEAVY',
      parts: [B(.75, .42, 0, .12), B(.27, .3, .98, .28), B(.15, .17, -.46, -.46), B(.15, .17, .42, -.46), B(.08, .2, 1.17, -.12)], eyes: [[1.05, .4]] },
    { id: 'giraffe', name: 'GIRAFFE', tone: 'kam3', density: .9, weight: 'LIGHT',
      parts: [B(.5, .24, 0, 0), B(.13, .55, .4, .76), B(.24, .12, .56, 1.36), B(.07, .26, -.36, -.48), B(.07, .26, .36, -.48)], eyes: [[.62, 1.4]] },
    { id: 'penguin', name: 'PENGUIN', tone: 'text', density: 1, weight: 'MID',
      parts: [[[-.32, -.55], [.32, -.55], [.42, -.15], [.36, .3], [.18, .55], [-.18, .55], [-.36, .3], [-.42, -.15]]], eyes: [[.12, .34], [-.12, .34]] },
    { id: 'hippo', name: 'HIPPO', tone: 'kam5', density: 1.4, weight: 'HEAVY',
      parts: [[[-.85, -.35], [.85, -.35], [.97, -.08], [.9, .3], [.6, .42], [-.7, .42], [-.95, .2], [-.95, -.15]]], eyes: [[.55, .24]] },
    { id: 'snake', name: 'SNAKE', tone: 'kam2', density: .8, weight: 'LIGHT',
      parts: [B(.56, .12, -.48, 0), B(.52, .12, .5, .13, .26)], eyes: [[.9, .26]] },
    { id: 'turtle', name: 'TURTLE', tone: 'kam1', density: 1.2, weight: 'MID',
      parts: [[[-.68, 0], [.68, 0], [.55, .32], [.2, .46], [-.2, .46], [-.55, .32]], B(.8, .1, 0, -.08), B(.16, .11, .94, .02)], eyes: [[1.0, .06]] },
    { id: 'frog', name: 'FROG', tone: 'win', density: 1, weight: 'MID',
      parts: [[[-.55, -.3], [.55, -.3], [.4, .3], [-.4, .3]], B(.1, .09, -.24, .37), B(.1, .09, .24, .37)], eyes: [[.24, .38], [-.24, .38]] },
    { id: 'pig', name: 'PIG', tone: 'kam4', density: 1.1, weight: 'MID',
      parts: [B(.55, .34, 0, 0), B(.09, .15, .64, .04), B(.1, .1, -.35, -.43), B(.1, .1, .35, -.43)], eyes: [[.36, .16]] },
    { id: 'croc', name: 'CROC', tone: 'kam1', density: 1, weight: 'MID',
      parts: [[[-1.1, -.18], [1.1, -.14], [1.1, .02], [-.9, .2], [-1.1, .12]]], eyes: [[.6, .08]] },
    { id: 'owl', name: 'OWL', tone: 'kam0', density: .9, weight: 'LIGHT',
      parts: [B(.4, .5, 0, 0), [[-.4, .5], [-.14, .5], [-.34, .74]], [[.14, .5], [.4, .5], [.34, .74]]], eyes: [[.16, .24], [-.16, .24]] },
    { id: 'rhino', name: 'RHINO', tone: 'kam6', density: 1.35, weight: 'HEAVY',
      parts: [B(.65, .38, 0, 0), B(.22, .26, .84, -.02), [[.84, .22], [1.04, .18], [.98, .56]]], eyes: [[.76, .1]] },
    { id: 'chick', name: 'CHICK', tone: 'cta', density: .7, weight: 'LIGHT',
      parts: [[[-.25, -.25], [.25, -.25], [.28, .05], [0, .3], [-.28, .05]]], eyes: [[.1, .08]] },
  ]
  PIECES.forEach(function (p) {
    var r = 0, area = 0
    p.parts.forEach(function (part) {
      part.forEach(function (v) { r = Math.max(r, Math.sqrt(v[0] * v[0] + v[1] * v[1])) })
      for (var i = 0; i < part.length; i++) {
        var a = part[i], b = part[(i + 1) % part.length]
        area += (a[0] * b[1] - b[0] * a[1]) / 2
      }
    })
    p.radius = r
    p.mass = Math.abs(area) * p.density
  })

  function mulberry32(seed) {
    var a = seed | 0
    return function () {
      a = (a + 0x6D2B79F5) | 0
      var t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  // 7-bag style: every animal appears once per 12 drops, order from the seed.
  function pieceSequence(seed, n) {
    var r = mulberry32(seed), out = []
    while (out.length < n) {
      var bag = PIECES.map(function (_, i) { return i })
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(r() * (i + 1)); var t = bag[i]; bag[i] = bag[j]; bag[j] = t
      }
      out.push.apply(out, bag)
    }
    return out.slice(0, n)
  }

  function v2(p) { return P.Vec2(p[0], p[1]) }
  function spawn(w, k, x, y, a) {
    var def = PIECES[k]
    var b = w.createBody({ type: 'dynamic', position: P.Vec2(x, y), angle: a })
    def.parts.forEach(function (part) {
      b.createFixture(P.Polygon(part.map(v2)), { density: def.density, friction: 0.8, restitution: 0.02 })
    })
    b.setUserData({ k: k })
    return b
  }
  function makeWorld(state) {
    var w = new P.World({ gravity: P.Vec2(0, -10) })
    var isl = w.createBody()
    isl.createFixture(P.Polygon(ISLAND.map(v2)), { friction: 0.9 })
    var bodies = state.map(function (s) { return spawn(w, s.k, s.x, s.y, s.a) })
    return { w: w, bodies: bodies }
  }
  function topOfBodies(bodies) {
    var top = 0
    bodies.forEach(function (b) {
      PIECES[b.getUserData().k].parts.forEach(function (part) {
        part.forEach(function (v) { var p = b.getWorldPoint(P.Vec2(v[0], v[1])); if (p.y > top) top = p.y })
      })
    })
    return top
  }
  function stateTop(state) { return topOfBodies(makeWorld(state).bodies) }

  function q4(v) { return Math.round(v * 1e4) / 1e4 }
  function q5(v) { return Math.round(v * 1e5) / 1e5 }
  function canon(bodies) {
    return bodies.map(function (b) {
      var p = b.getPosition()
      return { k: b.getUserData().k, x: q4(p.x), y: q4(p.y), a: q5(b.getAngle()) }
    })
  }
  function hashState(st) {
    var s = st.map(function (o) { return o.k + ',' + o.x + ',' + o.y + ',' + o.a }).join(';')
    var h = 0x811c9dc5
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return (h >>> 0).toString(16).padStart(8, '0')
  }

  // One drop = rebuild from canonical state, spawn the piece above the tower,
  // step at a fixed 1/60 until everything is still (or something falls).
  function startDrop(state, drop, maxTicks) {
    var mw = makeWorld(state)
    var top = topOfBodies(mw.bodies)
    var y = top + PIECES[drop.k].radius + 0.45
    var b = spawn(mw.w, drop.k, drop.x, y, drop.r * ROT_STEP)
    mw.bodies.push(b)
    return { w: mw.w, bodies: mw.bodies, dropBody: b, spawnY: y, ticks: 0, still: 0,
      fell: false, fellBody: null, fellTick: -1, done: false, maxTicks: maxTicks || MAX_TICKS }
  }
  function stepDrop(sim) {
    sim.w.step(DT, VEL_IT, POS_IT)
    sim.ticks++
    var moving = false
    for (var i = 0; i < sim.bodies.length; i++) {
      var b = sim.bodies[i], p = b.getPosition()
      if (p.y < FALL_Y && !sim.fell) { sim.fell = true; sim.fellBody = b; sim.fellTick = sim.ticks }
      var v = b.getLinearVelocity()
      if (Math.abs(v.x) > STILL_V || Math.abs(v.y) > STILL_V || Math.abs(b.getAngularVelocity()) > STILL_W) moving = true
    }
    sim.still = moving ? 0 : sim.still + 1
    if (sim.fell || sim.still >= STILL_TICKS || sim.ticks >= sim.maxTicks) sim.done = true
    return sim
  }
  function runDrop(state, drop, maxTicks) {
    var sim = startDrop(state, drop, maxTicks)
    while (!sim.done) stepDrop(sim)
    return { fell: sim.fell, ticks: sim.ticks, state: sim.fell ? null : canon(sim.bodies), sim: sim }
  }
  function replay(drops) {
    var state = []
    for (var i = 0; i < drops.length; i++) {
      var r = runDrop(state, drops[i])
      if (r.fell) return { fell: true, at: i, state: state, hash: hashState(state) }
      state = r.state
    }
    return { fell: false, state: state, hash: hashState(state) }
  }

  // ---------------------------------------------------------------- bot
  // Monte-Carlo placement search: simulate candidates, keep the one that
  // disturbs the tower least. Difficulty = candidate count + aim noise.
  var BOT_LEVELS = {
    easy: { n: 8, noise: 0.45, cap: 180 },
    normal: { n: 22, noise: 0.12, cap: 240 },
    hard: { n: 44, noise: 0, cap: 300 },
  }
  function botCandidates(level, k) {
    var L = BOT_LEVELS[level], rots = [0, 6, 12, 18, 3, 21, 9, 15], out = []
    for (var i = 0; i < L.n; i++) {
      out.push({ k: k, x: Math.round((Math.random() * 4.4 - 2.2) * 100) / 100, r: rots[Math.floor(Math.random() * (i < L.n / 2 ? 4 : rots.length))] })
    }
    out.push({ k: k, x: 0, r: 0 })
    return out
  }
  function scoreCandidate(state, drop, cap) {
    var r = runDrop(state, drop, cap)
    if (r.fell) return -1e6
    var disp = 0
    for (var i = 0; i < state.length; i++) {
      var a = state[i], b = r.state[i]
      disp += Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.a - b.a) * 0.6
    }
    var me = r.state[r.state.length - 1]
    var tilt = Math.abs(Math.sin(me.a * 2)) // prefer flat-ish resting poses
    return -disp * 10 - tilt * 0.6 - Math.abs(me.x) * 0.25 - me.y * 0.15
  }

  // ---------------------------------------------------------------- render
  var TOKENS = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger',
    'structure', 'deep', 'kam0', 'kam1', 'kam2', 'kam3', 'kam4', 'kam5', 'kam6', 'kam7', 'tint-p1']
  var tok = {}
  function readTokens() {
    var cs = getComputedStyle(document.documentElement)
    TOKENS.forEach(function (n) { tok[n] = cs.getPropertyValue('--c-' + n).trim() || '128 128 128' })
    return tok
  }
  function col(n, a) { return 'rgb(' + tok[n] + (a == null ? '' : ' / ' + a) + ')' }
  var PLAYER_TOKENS = ['p1', 'p2', 'p3', 'p4']

  function polyPath(ctx, pts) {
    ctx.beginPath()
    pts.forEach(function (p, i) { i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]) })
    ctx.closePath()
  }
  // draw one animal in art-pixel space. tx(x,y) maps local metres -> art px.
  function drawAnimal(ctx, k, x, y, a, s, opts) {
    var def = PIECES[k], c = Math.cos(a), sn = Math.sin(a)
    function tr(v) { return [x + (v[0] * c - v[1] * sn) * s, y - (v[0] * sn + v[1] * c) * s] }
    ctx.globalAlpha = opts && opts.alpha != null ? opts.alpha : 1
    def.parts.forEach(function (part) {
      var pts = part.map(tr)
      polyPath(ctx, pts)
      ctx.fillStyle = col(def.tone)
      ctx.fill()
    })
    // shade: darker bottom edge per part
    def.parts.forEach(function (part) {
      polyPath(ctx, part.map(tr))
      ctx.lineWidth = Math.max(1, s * 0.07)
      ctx.strokeStyle = 'rgb(0 0 0 / .38)'
      ctx.stroke()
    })
    var e = Math.max(1, Math.round(s * 0.1))
    def.eyes.forEach(function (ev) {
      var p = tr(ev)
      ctx.fillStyle = 'rgb(10 10 20)'
      ctx.fillRect(Math.round(p[0] - e / 2), Math.round(p[1] - e / 2), e, e)
      if (e > 1) { ctx.fillStyle = 'rgb(255 255 255 / .9)'; ctx.fillRect(Math.round(p[0] - e / 2), Math.round(p[1] - e / 2), 1, 1) }
    })
    if (opts && opts.outline) {
      def.parts.forEach(function (part) {
        polyPath(ctx, part.map(tr))
        ctx.lineWidth = Math.max(1, s * 0.09)
        ctx.strokeStyle = col(opts.outline)
        if (opts.dash) ctx.setLineDash(opts.dash)
        ctx.stroke()
        ctx.setLineDash([])
      })
    }
    ctx.globalAlpha = 1
  }

  // scene: {items:[{k,x,y,a,outline?}], hover?:{k,x,y,a,player}, view:{bottom,ppm},
  //         best?:number, guide?:bool, shake?:[dx,dy], t:ms, particles?:[]}
  function drawScene(canvas, scene) {
    var dpr = window.devicePixelRatio || 1
    var W = canvas.clientWidth, H = canvas.clientHeight
    if (!W || !H) return
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
    }
    var PIX = scene.pix || 2.5
    var aw = Math.ceil(W / PIX), ah = Math.ceil(H / PIX)
    var off = canvas._off || (canvas._off = document.createElement('canvas'))
    if (off.width !== aw || off.height !== ah) { off.width = aw; off.height = ah }
    var o = off.getContext('2d')
    o.imageSmoothingEnabled = false
    var view = scene.view, s = view.ppm / PIX
    var sh = scene.shake || [0, 0]
    function X(x) { return aw / 2 + x * s + sh[0] }
    function Y(y) { return ah - (y - view.bottom) * s + sh[1] }

    o.fillStyle = col('bg'); o.fillRect(0, 0, aw, ah)
    // pixel stars / dust, parallax with camera
    o.fillStyle = col('dim', 0.25)
    for (var i = 0; i < 40; i++) {
      var sx = (i * 97) % aw, sy = ((i * 53 + view.bottom * s * 0.4) % ah + ah) % ah
      o.fillRect(sx, Math.floor(sy), 1, 1)
    }
    // height ruler (every metre)
    o.fillStyle = col('dim', 0.5)
    var y0 = Math.floor(view.bottom), y1 = Math.ceil(view.bottom + ah / s)
    for (var m = Math.max(0, y0); m <= y1; m++) {
      var yy = Math.round(Y(m)); o.fillRect(0, yy, m % 5 === 0 ? 6 : 3, 1)
    }
    if (scene.best) {
      o.fillStyle = col('cta', 0.8)
      var by = Math.round(Y(scene.best))
      for (var bx = 0; bx < aw; bx += 4) o.fillRect(bx, by, 2, 1)
    }
    // water
    var wy = Y(-0.45)
    o.fillStyle = col('kam6', 0.35); o.fillRect(0, Math.round(wy), aw, ah)
    o.fillStyle = col('kam6', 0.7)
    var t = (scene.t || 0) / 400
    for (var wx = 0; wx < aw; wx += 3) o.fillRect(wx, Math.round(wy + Math.sin(wx / 7 + t) * 1.2), 2, 1)
    // island
    polyPath(o, ISLAND.map(function (p) { return [X(p[0]), Y(p[1])] }))
    o.fillStyle = col('kam0'); o.fill()
    o.fillStyle = col('win'); o.fillRect(Math.round(X(-2.6)), Math.round(Y(0)), Math.round(5.2 * s), Math.max(1, Math.round(0.12 * s)))
    // drop guide
    if (scene.hover && scene.guide) {
      o.fillStyle = col(PLAYER_TOKENS[scene.hover.player || 0], 0.55)
      var gx = Math.round(X(scene.hover.x))
      for (var gy = Math.round(Y(scene.hover.y)); gy < Math.round(wy); gy += 4) o.fillRect(gx, gy, 1, 2)
    }
    scene.items.forEach(function (it) {
      drawAnimal(o, it.k, X(it.x), Y(it.y), it.a, s, it.outline ? { outline: it.outline } : null)
    })
    if (scene.hover) {
      var h = scene.hover
      drawAnimal(o, h.k, X(h.x), Y(h.y), h.a, s, { outline: PLAYER_TOKENS[h.player || 0], alpha: 0.92, dash: [2, 1] })
    }
    ;(scene.particles || []).forEach(function (p) {
      o.fillStyle = col(p.c || 'text', Math.max(0, p.life))
      o.fillRect(Math.round(X(p.x)), Math.round(Y(p.y)), 1, 1)
    })

    var ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, aw * PIX * dpr, ah * PIX * dpr)
    // crisp ruler labels on the full-res canvas
    ctx.scale(dpr, dpr)
    ctx.font = '7px "Press Start 2P", monospace'
    ctx.fillStyle = col('dim', 0.9)
    for (var mm = Math.max(5, Math.ceil(y0 / 5) * 5); mm <= y1; mm += 5) {
      ctx.fillText(mm + 'M', 8, (Y(mm) + 3) * PIX)
    }
    if (scene.best) {
      ctx.fillStyle = col('cta')
      ctx.fillText('BEST ' + scene.best.toFixed(1) + 'M', W - 96, (Y(scene.best) - 3) * PIX)
    }
  }

  function thumb(canvas, k, opts) {
    var dpr = window.devicePixelRatio || 1
    var W = canvas.clientWidth || 64, H = canvas.clientHeight || 64
    canvas.width = W * dpr; canvas.height = H * dpr
    var PIX = 2
    var off = document.createElement('canvas'); off.width = Math.ceil(W / PIX); off.height = Math.ceil(H / PIX)
    var o = off.getContext('2d')
    var def = PIECES[k], s = Math.min(off.width, off.height) / (def.radius * 2.3)
    // centre by bbox
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9
    def.parts.forEach(function (p) { p.forEach(function (v) { minx = Math.min(minx, v[0]); maxx = Math.max(maxx, v[0]); miny = Math.min(miny, v[1]); maxy = Math.max(maxy, v[1]) }) })
    s = Math.min(off.width / ((maxx - minx) * 1.15), off.height / ((maxy - miny) * 1.15))
    var cx = off.width / 2 - ((minx + maxx) / 2) * s, cy = off.height / 2 + ((miny + maxy) / 2) * s
    drawAnimal(o, k, cx, cy, (opts && opts.a) || 0, s, opts && opts.outline ? { outline: opts.outline } : null)
    var ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false
    ctx.drawImage(off, 0, 0, off.width * PIX * dpr, off.height * PIX * dpr)
  }

  function viewFor(canvasW, canvasH, top, hoverR) {
    var ppm = canvasW / 6.8
    var Vh = canvasH / ppm
    var hoverY = top + (hoverR || 0.8) + 0.45
    return { ppm: ppm, bottom: Math.max(-2.1, hoverY + 1.4 - Vh) }
  }

  window.AnimalStack = {
    PIECES: PIECES, ROT_STEP: ROT_STEP, ROT_STEPS: ROT_STEPS, AIM_LIMIT: AIM_LIMIT, DT: DT, FALL_Y: FALL_Y,
    STILL_TICKS: STILL_TICKS, MAX_TICKS: MAX_TICKS, BOT_LEVELS: BOT_LEVELS, PLAYER_TOKENS: PLAYER_TOKENS,
    mulberry32: mulberry32, pieceSequence: pieceSequence, makeWorld: makeWorld, stateTop: stateTop,
    topOfBodies: topOfBodies, startDrop: startDrop, stepDrop: stepDrop, runDrop: runDrop, replay: replay,
    canon: canon, hashState: hashState, botCandidates: botCandidates, scoreCandidate: scoreCandidate,
    readTokens: readTokens, col: col, drawScene: drawScene, thumb: thumb, viewFor: viewFor,
  }
})()
