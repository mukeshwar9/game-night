// BONK BUGGIES prototype sim. Page code for the design board, not app code.
// Pure simulation on planck.js (the repo's vendored deterministic build): no DOM.
// Every tuning number here is a STARTING VALUE (see the board's numbers table).
var BonkSim = (function (pl) {
  'use strict'
  var V = function (x, y) { return new pl.Vec2(x, y) }

  var VIEW = { x0: -7, x1: 7, y0: -0.6, y1: 8.4, w: 14 }   // what the camera shows at zoom 1
  var T = {
    gravity: 13,          // m/s^2
    wheelSpeed: 21,       // rad/s motor target
    wheelTorque: 2.7,     // N*m while a button is held
    brakeTorque: 2.2,     // N*m with no button (engine brake)
    airTorque: 4.6,       // N*m tilt while no wheel touches
    groundTilt: 2.0,      // N*m tilt while driving (lets you pop a wheelie)
    hopSpeed: 6.4,        // m/s along the buggy's own "up"
    hopCooldown: 2.2,     // s
    water0: 0.45,         // resting water line (m)
    tideStart: 10,        // s of play before the tide moves
    tideRate: 0.3,        // m/s
    shieldGrace: 0.7,     // s of safety after a spare lid pops
    readyBrake: 40,
  }

  var MUTATORS = {
    none:    { id: 'none',    label: 'CLEAN ROUND', g: 1,    grip: 1,    head: 1,   speed: 1 },
    moon:    { id: 'moon',    label: 'MOON GRAVITY', g: 0.45, grip: 1,    head: 1,   speed: 1 },
    ice:     { id: 'ice',     label: 'BLACK ICE',   g: 1,    grip: 0.22, head: 1,   speed: 1 },
    bighead: { id: 'bighead', label: 'BIG HEADS',   g: 1,    grip: 1,    head: 1.7, speed: 1 },
    turbo:   { id: 'turbo',   label: 'TURBO',       g: 1,    grip: 1.1,  head: 1,   speed: 1.55 },
  }

  // ── arenas ───────────────────────────────────────────────────────────────
  function sample(fn, a, b, n) {
    var pts = []
    for (var i = 0; i <= n; i++) { var x = a + (b - a) * i / n; pts.push([x, fn(x)]) }
    return pts
  }
  // An island: a top profile closed with a rounded belly underneath.
  function island(top, depth) {
    var l = top[0], r = top[top.length - 1], pts = top.slice(), n = 14
    var base = Math.min.apply(null, top.map(function (p) { return p[1] }))
    for (var k = 1; k < n; k++) {
      var t = k / n
      var w = Math.pow(Math.sin(Math.PI * t), 0.6)
      pts.push([r[0] + (l[0] - r[0]) * t, (t < 0.5 ? r[1] : l[1]) * (1 - w) + (base - 0.35 - depth) * w])
    }
    pts.top = top.length
    return pts
  }
  function slab(x0, x1, yTop, th, tilt) {
    var pts = [], n = 6, i
    for (i = 0; i <= n; i++) { var x = x0 + (x1 - x0) * i / n; pts.push([x, yTop + (tilt || 0) * (x - (x0 + x1) / 2)]) }
    pts.push([x1 - 0.18, yTop - th + (tilt || 0) * (x1 - (x0 + x1) / 2)])
    pts.push([x0 + 0.18, yTop - th + (tilt || 0) * (x0 - (x0 + x1) / 2)])
    return pts
  }

  // Arenas are about 18 m wide: roughly ten buggy lengths between the start marks.
  var ARENAS = [
    {
      id: 'halfpipe', name: 'HALFPIPE', blurb: 'Roll in from the shoulders and meet in the bowl.',
      build: function () {
        var f = function (x) { var a = Math.abs(x); return a > 6.3 ? 4.7 : 2.0 + 2.7 * Math.pow(a / 6.3, 2.2) + 0.35 * Math.exp(-Math.pow(x / 0.9, 2)) }
        return { solids: [{ pts: island(sample(f, -8.8, 8.8, 64), 1.5) }], ground: f, spawns: [-7.5, 7.5, -3.2, 3.2], half: 8.8 }
      },
    },
    {
      id: 'humps', name: 'THREE HUMPS', blurb: 'Crests to launch from, dips that flood first.',
      build: function () {
        var f = function (x) { return 2.85 - 0.6 * Math.cos(2 * Math.PI * x / 5.8) + 0.6 * Math.pow(Math.abs(x) / 9, 8) }
        return { solids: [{ pts: island(sample(f, -9, 9, 72), 1.4) }], ground: f, spawns: [-5.8, 5.8, -2.9, 2.9], half: 9 }
      },
    },
    {
      id: 'kicker', name: 'KICKER', blurb: 'One big ramp, two small ones. Whoever times it lands on top.',
      build: function () {
        var f = function (x) { return 2.3 + 1.5 * Math.exp(-Math.pow(x / 1.7, 2)) + 0.55 * Math.exp(-Math.pow((Math.abs(x) - 5) / 0.9, 2)) + 1.5 * Math.pow(Math.abs(x) / 9, 8) }
        return { solids: [{ pts: island(sample(f, -9, 9, 72), 1.3) }], ground: f, spawns: [-7.4, 7.4, -3.2, 3.2], half: 9 }
      },
    },
    {
      id: 'seesaw', name: 'SEESAW', blurb: 'A loose plank bridges the pit. Your weight is their launch pad.',
      build: function () {
        var step = function (a) { var t = Math.max(0, Math.min(1, (a - 3.3) / 0.9)); return t * t * (3 - 2 * t) }
        var f = function (x) { return 2.4 + 0.62 * step(Math.abs(x)) + 1.5 * Math.pow(Math.abs(x) / 9.4, 8) }
        return {
          solids: [{ pts: island(sample(f, -9.4, 9.4, 72), 1.3) }, { pts: [[-0.5, 2.38], [0, 2.95], [0.5, 2.38]], post: true }],
          // a plank bridges the pit between two plateaus and tips under whoever drives onto it
          planks: [{ x: 0, y: 3.08, len: 7.4, th: 0.2, limit: 0.17 }],
          ground: f, spawns: [-7.4, 7.4, -5.2, 5.2], half: 9.4,
        }
      },
    },
    {
      id: 'decks', name: 'SPLIT DECKS', blurb: 'Two decks and a sunken stepping stone. Mind the gaps.',
      build: function () {
        var g = function (x) { var a = Math.abs(x); return a < 2.1 ? 2.95 : 3.45 }
        return {
          solids: [{ pts: slab(-9.4, -2.45, 3.45, 0.6, 0) }, { pts: slab(2.45, 9.4, 3.45, 0.6, 0) }, { pts: slab(-2.1, 2.1, 2.95, 0.55, 0) }],
          ground: g, spawns: [-7.6, 7.6, -4.6, 4.6], half: 9.4,
        }
      },
    },
    {
      id: 'drum', name: 'THE DRUM', blurb: 'A closed drum: enough speed takes you up the wall and over.',
      build: function () {
        var pts = [], n = 84, cx = 0, cy = 4.5, a = 9.4, b = 3.6
        var bump = function (x) { return 0.34 * Math.exp(-Math.pow(x / 0.9, 2)) + 0.3 * Math.exp(-Math.pow((Math.abs(x) - 4.6) / 0.8, 2)) }
        for (var i = 0; i < n; i++) {
          var th = -Math.PI / 2 + 2 * Math.PI * i / n
          var c = Math.cos(th), s = Math.sin(th), e = 2 / 3.4
          var x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), e)
          var y = cy + b * Math.sign(s) * Math.pow(Math.abs(s), e)
          if (s < -0.6) y += bump(x)
          pts.push([x, y])
        }
        var f = function (x) { return 0.95 + bump(x) + 0.5 * Math.pow(Math.abs(x) / 9.4, 5) }
        return { solids: [{ pts: pts, cave: true }], ground: f, spawns: [-6.6, 6.6, -2.4, 2.4], closed: true, half: 9.4 }
      },
    },
  ]
  function arenaById(id) { for (var i = 0; i < ARENAS.length; i++) if (ARENAS[i].id === id) return ARENAS[i]; return ARENAS[0] }

  // ── a buggy ──────────────────────────────────────────────────────────────
  var HULL = [[-0.86, -0.1], [0.84, -0.1], [0.93, 0.08], [0.42, 0.22], [-0.82, 0.24]]
  var HEAD = { x: -0.14, y: 0.5, r: 0.2 }
  var WHEEL = { x: 0.58, y: -0.3, r: 0.3 }

  function makeCar(world, i, x, y, dir, mut) {
    var grp = -(i + 1)
    var chassis = world.createBody({ type: 'dynamic', position: V(x, y), angularDamping: 0.6 })
    chassis.createFixture({
      shape: new pl.Polygon(HULL.map(function (p) { return V(p[0] * dir, p[1]) })),
      density: 1.5, friction: 0.35, restitution: 0.12, filterGroupIndex: grp, userData: { car: i, part: 'hull' },
    })
    var hr = HEAD.r * mut.head
    chassis.createFixture({
      shape: new pl.Circle(V(HEAD.x * dir, HEAD.y + (hr - HEAD.r)), hr),
      density: 0.35, friction: 0.3, restitution: 0.2, filterGroupIndex: grp, userData: { car: i, part: 'head' },
    })
    var wheels = [], joints = []
    ;[-1, 1].forEach(function (s) {
      var w = world.createBody({ type: 'dynamic', position: V(x + s * WHEEL.x, y + WHEEL.y), angularDamping: 0.3 })
      w.createFixture({
        shape: new pl.Circle(WHEEL.r), density: 1.0, friction: 1.7 * mut.grip, restitution: 0.08,
        filterGroupIndex: grp, userData: { car: i, part: 'wheel' },
      })
      var j = world.createJoint(new pl.WheelJoint({
        motorSpeed: 0, maxMotorTorque: T.readyBrake, enableMotor: true, frequencyHz: 4.6, dampingRatio: 0.62,
      }, chassis, w, w.getPosition(), V(0, 1)))
      wheels.push(w); joints.push(j)
    })
    return {
      i: i, dir: dir, chassis: chassis, wheels: wheels, joints: joints, headR: hr,
      alive: true, shield: 0, grace: 0, hopCd: 0, hopFx: 0, ground: 0, headTouch: [], out: null, d: 0,
    }
  }

  // ── a round ──────────────────────────────────────────────────────────────
  function createRound(opt) {
    opt = opt || {}
    var mut = MUTATORS[opt.mutator] || MUTATORS.none
    var arena = arenaById(opt.arena)
    var world = new pl.World({ gravity: V(0, -T.gravity * mut.g) })
    var geo = arena.build()
    var ground = world.createBody({ type: 'static' })
    geo.solids.forEach(function (s) {
      ground.createFixture({
        shape: new pl.Chain(s.pts.map(function (p) { return V(p[0], p[1]) }), true),
        friction: 0.9, restitution: 0.05, userData: { terrain: true },
      })
    })
    var planks = (geo.planks || []).map(function (p) {
      var b = world.createBody({ type: 'dynamic', position: V(p.x, p.y), angularDamping: 0.8 })
      b.createFixture({ shape: new pl.Box(p.len / 2, p.th / 2), density: 1.1, friction: 0.95, userData: { terrain: true, plank: true } })
      world.createJoint(new pl.RevoluteJoint({ enableLimit: true, lowerAngle: -p.limit, upperAngle: p.limit }, ground, b, V(p.px != null ? p.px : p.x, p.y)))
      return { body: b, len: p.len, th: p.th, px: p.px != null ? p.px : p.x, py: p.y }
    })
    var n = opt.n || 2
    var cars = []
    // Bodies are created in alternating seat order from round to round: the solver
    // resolves a perfectly mirrored head-on in favour of creation order.
    for (var q = 0; q < n; q++) {
      var i = opt.flip ? n - 1 - q : q
      var sx = geo.spawns[opt.swap && n === 2 ? 1 - i : i], gy = geo.ground(sx)
      planks.forEach(function (pk) { if (Math.abs(sx - pk.body.getPosition().x) < pk.len / 2) gy = Math.max(gy, pk.body.getPosition().y + 0.1) })
      var c = makeCar(world, i, sx, gy + 0.72, sx < 0 ? 1 : -1, mut)
      c.shield = (opt.shields && opt.shields[i]) ? 1 : 0
      cars[i] = c
    }
    var st = {
      world: world, arena: arena, geo: geo, planks: planks, cars: cars, mut: mut, hop: !!opt.hop,
      phase: 'ready', t: 0, water: T.water0, events: [], outcome: null, n: n,
    }
    world.on('begin-contact', function (c) { touch(st, c, 1) })
    world.on('end-contact', function (c) { touch(st, c, -1) })
    world.on('post-solve', function (c, imp) {
      var p = imp.normalImpulses[0] || 0
      if (p < 0.9 || st.events.length > 24) return
      var a = c.getFixtureA().getUserData() || {}, b = c.getFixtureB().getUserData() || {}
      var wm = c.getWorldManifold(null)
      if (!wm || !wm.points || !wm.points[0]) return
      st.events.push({
        type: 'hit', x: wm.points[0].x, y: wm.points[0].y, power: p,
        cars: a.car != null && b.car != null, wheel: a.part === 'wheel' || b.part === 'wheel',
      })
    })
    return st
  }

  function touch(st, c, sign) {
    var fa = c.getFixtureA(), fb = c.getFixtureB()
    var a = fa.getUserData() || {}, b = fb.getUserData() || {}
    one(st, a, b, sign); one(st, b, a, sign)
  }
  function one(st, me, other, sign) {
    if (me.car == null || me.car === other.car) return
    var car = st.cars[me.car]
    if (me.part === 'wheel') car.ground = Math.max(0, car.ground + sign)
    if (me.part === 'head') {
      var by = other.car != null ? other.car : -1
      if (sign > 0) car.headTouch.push(by)
      else { var k = car.headTouch.indexOf(by); if (k >= 0) car.headTouch.splice(k, 1) }
    }
  }

  function start(st) { st.phase = 'play' }

  function step(st, inputs, dt) {
    var playing = st.phase === 'play', i, c
    for (i = 0; i < st.cars.length; i++) {
      c = st.cars[i]
      var inp = (playing && c.alive && inputs && inputs[i]) || { d: 0, hop: false }
      var d = inp.d || 0
      c.d = d
      for (var k = 0; k < 2; k++) {
        c.joints[k].setMotorSpeed(-d * T.wheelSpeed * st.mut.speed)
        c.joints[k].setMaxMotorTorque(st.phase === 'ready' ? T.readyBrake : d ? T.wheelTorque * st.mut.speed : (c.alive ? T.brakeTorque : 0.4))
      }
      if (d) c.chassis.applyTorque(d * (c.ground ? T.groundTilt : T.airTorque), true)
      c.hopCd = Math.max(0, c.hopCd - dt); c.hopFx = Math.max(0, c.hopFx - dt); c.grace = Math.max(0, c.grace - dt)
      if (st.hop && inp.hop && c.hopCd <= 0) {
        var up = c.chassis.getWorldVector(V(0, 1))
        ;[c.chassis, c.wheels[0], c.wheels[1]].forEach(function (b) {
          b.applyLinearImpulse(V(up.x * T.hopSpeed * b.getMass(), up.y * T.hopSpeed * b.getMass()), b.getWorldCenter(), true)
        })
        c.hopCd = T.hopCooldown; c.hopFx = 0.28
        var p = c.chassis.getPosition()
        st.events.push({ type: 'hop', x: p.x, y: p.y, car: i, ux: up.x, uy: up.y })
      }
    }
    // water: drag and lift on anything below the line
    if (playing || st.phase === 'over') {
      if (playing) {
        st.t += dt
        if (st.t > T.tideStart) st.water = Math.min(VIEW.y1 + 0.5, st.water + T.tideRate * dt)
      }
    }
    for (var b = st.world.getBodyList(); b; b = b.getNext()) {
      if (b.isStatic()) continue
      var bp = b.getPosition()
      if (bp.y < st.water) {
        var depth = Math.min(1, (st.water - bp.y) / 0.5), m = b.getMass(), v = b.getLinearVelocity()
        b.applyForceToCenter(V(-v.x * m * 2.6 * depth, (T.gravity * st.mut.g * 1.35 - v.y * 3.2) * m * depth), true)
        b.setAngularVelocity(b.getAngularVelocity() * (1 - 2.5 * dt * depth))
        if (!b._wet && v.y < -1.2) st.events.push({ type: 'splash', x: bp.x, y: st.water, power: Math.min(8, -v.y) })
        b._wet = true
      } else b._wet = false
    }
    st.world.step(dt, 8, 3)
    if (!playing) return st

    var fell = []
    for (i = 0; i < st.cars.length; i++) {
      c = st.cars[i]
      if (!c.alive) continue
      var pos = c.chassis.getPosition()
      if (pos.y < st.water - 0.12 || Math.abs(pos.x) > st.geo.half + 3.5 || pos.y < -2) { fell.push({ i: i, reason: 'sunk', by: -1 }); continue }
      if (c.headTouch.length && c.grace <= 0) {
        var by = -1
        for (var h = 0; h < c.headTouch.length; h++) if (c.headTouch[h] >= 0) by = c.headTouch[h]
        var hp = c.chassis.getWorldPoint(V(HEAD.x * c.dir, HEAD.y))
        if (c.shield > 0) {
          c.shield = 0; c.grace = T.shieldGrace
          st.events.push({ type: 'shield', x: hp.x, y: hp.y, car: i })
          if (by >= 0) {
            var o = st.cars[by].chassis, op = o.getPosition(), dx = op.x - pos.x, dy = op.y - pos.y, L = Math.hypot(dx, dy) || 1
            o.applyLinearImpulse(V(dx / L * 3.2, dy / L * 3.2 + 1.5), o.getWorldCenter(), true)
          }
        } else fell.push({ i: i, reason: by >= 0 ? 'bonk' : 'self', by: by, x: hp.x, y: hp.y })
      }
    }
    if (fell.length) {
      fell.forEach(function (f) {
        var car = st.cars[f.i]; car.alive = false; car.out = f
        st.events.push({ type: f.reason, x: f.x != null ? f.x : car.chassis.getPosition().x, y: f.y != null ? f.y : st.water, car: f.i, by: f.by })
      })
      var alive = st.cars.filter(function (q) { return q.alive })
      if (alive.length <= 1) {
        st.phase = 'over'
        st.outcome = {
          winner: alive.length ? alive[0].i : -1, reason: fell[fell.length - 1].reason,
          double: !alive.length, loser: fell[fell.length - 1].i, t: st.t, x: fell[0].x, y: fell[0].y,
        }
      }
    }
    return st
  }

  // ── bot ──────────────────────────────────────────────────────────────────
  var BOT = {
    easy:   { think: 0.34, slip: 0.26, hop: 0.25, guard: 0.5 },
    normal: { think: 0.17, slip: 0.1,  hop: 0.6,  guard: 0.8 },
    hard:   { think: 0.07, slip: 0.02, hop: 0.9,  guard: 1 },
  }
  function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }
  function makeBot(level, rng) {
    var L = BOT[level] || BOT.normal, hold = { d: 0, hop: false }, wait = 0, jam = 0, backoff = 0
    rng = rng || Math.random
    return function (st, i, dt) {
      wait -= dt; backoff -= dt
      // nose to nose and going nowhere: back off, then charge again
      var mc = st.cars[i].chassis, sp = Math.abs(mc.getLinearVelocity().x)
      jam = (st.cars[i].ground && sp < 0.7 && hold.d) ? jam + dt : 0
      if (jam > 0.5 + 0.5 * (1 - L.guard)) { jam = 0; backoff = 0.35 + 0.5 * rng(); hold = { d: -hold.d, hop: false }; wait = backoff }
      if (wait > 0) return { d: hold.d, hop: false }
      wait = L.think * (0.7 + 0.6 * rng())
      var me = st.cars[i], p = me.chassis.getPosition(), a = norm(me.chassis.getAngle()), w = me.chassis.getAngularVelocity()
      var foe = null, best = 1e9
      st.cars.forEach(function (c) { if (c.i !== i && c.alive) { var dd = Math.abs(c.chassis.getPosition().x - p.x); if (dd < best) { best = dd; foe = c } } })
      var d = 0, hop = false
      if (!foe) return (hold = { d: 0, hop: false })
      var fp = foe.chassis.getPosition(), dx = fp.x - p.x, dy = fp.y - p.y
      var lean = a + 0.22 * w
      if (!me.ground) d = Math.abs(lean) > 0.12 ? (lean > 0 ? -1 : 1) : 0
      else if (Math.abs(lean) > 0.85 * L.guard + (1 - L.guard)) d = lean > 0 ? -1 : 1
      else {
        d = dx > 0 ? 1 : -1
        if (dy > 0.55 && Math.abs(dx) < 1.7 && rng() < L.guard) d = -d                 // they are above me: get out from under
        var vx = me.chassis.getLinearVelocity().x
        if (!st.geo.closed && Math.abs(p.x) > st.geo.half - 1.3 && (Math.sign(p.x) === d || vx * p.x > 4)) d = p.x > 0 ? -1 : 1   // do not drive off the end
        if (st.water > p.y - 1.1) { var hx = (p.x > 0 ? 1 : -1) * st.geo.half * 0.84; if (st.geo.ground(hx) > st.geo.ground(p.x) + 0.4) d = hx > p.x ? 1 : -1 }
      }
      if (st.hop && me.hopCd <= 0 && Math.abs(lean) < 0.5 && rng() < L.hop) {
        if (Math.abs(dx) < 2.3 && Math.abs(dx) > 0.7 && dy > -0.4 && dy < 0.9 && me.ground) hop = true
        if (st.water > p.y - 0.5) hop = true
      }
      if (rng() < L.slip) d = [-1, 0, 1][Math.floor(rng() * 3)]
      hold = { d: d, hop: hop }
      return hold
    }
  }

  return {
    VIEW: VIEW, T: T, MUTATORS: MUTATORS, ARENAS: ARENAS, HULL: HULL, HEAD: HEAD, WHEEL: WHEEL,
    createRound: createRound, start: start, step: step, makeBot: makeBot, arenaById: arenaById, norm: norm,
  }
})(planck)
