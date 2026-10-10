/* STICKY FINGERS — design prototype for Game Night (study board only, not app code).
   One canvas, one sim. Every colour is read from the frame's --c-* tokens, so
   the theme buttons restyle the whole table. No storage, no network. */
(function () {
  'use strict'
  var W = 360, H = 560, TAU = Math.PI * 2
  var frame = document.getElementById('gn')
  var cv = document.getElementById('table')
  if (!frame || !cv) return
  var ctx = cv.getContext('2d')
  var reduced = false
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) { /* keep full motion */ }

  // ── tokens ────────────────────────────────────────────────────────────────
  var T = {}
  var KEYS = ['bg', 'surface', 'card', 'border', 'text', 'dim', 'p1', 'p2', 'p3', 'p4', 'cta', 'win', 'danger', 'felt1', 'felt2', 'rim', 'metal', 'ink']
  function readTokens() {
    var cs = getComputedStyle(frame)
    KEYS.forEach(function (k) { T[k] = cs.getPropertyValue('--c-' + k).trim() || '128 128 128' })
  }
  function col(k, a) { return 'rgb(' + T[k] + ' / ' + (a == null ? 1 : a) + ')' }
  var PK = ['p1', 'p2', 'p3', 'p4']

  // ── config (the board's controls write here) ─────────────────────────────
  var cfg = { n: 2, humans: 'one', level: 'normal', dye: true, lastcall: true, spot: false, slap: false, sound: true }
  var LEVEL = {
    easy:   { react: 0.75, speed: 250, fool: 0.6, slap: 0.15 },
    normal: { react: 0.45, speed: 370, fool: 0.2, slap: 0.4 },
    hard:   { react: 0.22, speed: 520, fool: 0, slap: 0.8 },
  }
  // Starting values (posture B in the report): tune by playtest.
  var ROUND = 60, LAST = 10, TEAR = 62, GRAB = 13, SAFE_R = 30, MAX_LOOT = 4
  var VAL = { coin: 1, bill: 3, half: 1, gem: 5, dye: -3 }
  var RAD = { coin: 12, bill: 15, half: 10, gem: 13, dye: 15 }

  // ── sound (tiny synth; starts on the first tap) ──────────────────────────
  var ac = null
  function tone(f, d, type, v, slide) {
    if (!cfg.sound || S.attract) return
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)()
      if (ac.state === 'suspended') ac.resume()
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t)
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d)
      g.gain.setValueAtTime(v || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d)
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + 0.02)
    } catch (e) { /* no audio in this frame: the game still plays */ }
  }
  var sfx = {
    grab: function () { tone(520, 0.05, 'square', 0.035, 1.5) },
    land: function () { tone(180, 0.05, 'triangle', 0.05, 0.6) },
    cash: function (v) { tone(880, 0.07, 'square', 0.05); setTimeout(function () { tone(v > 2 ? 1568 : 1318, 0.14, 'square', 0.05) }, 60) },
    rip: function () { tone(900, 0.16, 'sawtooth', 0.06, 0.2) },
    bad: function () { tone(160, 0.3, 'sawtooth', 0.07, 0.5) },
    slip: function () { tone(330, 0.08, 'triangle', 0.05, 0.5) },
    tick: function () { tone(660, 0.05, 'square', 0.04) },
    go: function () { tone(990, 0.2, 'square', 0.05) },
    end: function () { tone(523, 0.12, 'square', 0.05); setTimeout(function () { tone(784, 0.25, 'square', 0.05) }, 130) },
  }
  function buzz(ms) { try { if (!S.attract && navigator.vibrate) navigator.vibrate(ms) } catch (e) { /* no haptics */ } }

  // ── state ────────────────────────────────────────────────────────────────
  var S = { attract: true }
  function seats(n) {
    if (n === 2) return [{ x: 180, y: H - 46 }, { x: 180, y: 46 }]
    if (n === 3) return [{ x: 180, y: H - 46 }, { x: 58, y: 52 }, { x: 302, y: 52 }]
    return [{ x: 62, y: H - 52 }, { x: 298, y: 52 }, { x: 62, y: 52 }, { x: 298, y: H - 52 }]
  }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy) }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
  function rnd(a, b) { return a + Math.random() * (b - a) }

  function newGame(attract) {
    var n = cfg.n, st = seats(n), per = n === 2 ? 2 : 1
    S = {
      attract: !!attract, t: 0, phase: attract ? 'play' : 'count', count: 3.4, time: attract ? 9999 : ROUND,
      players: [], loot: [], fx: [], floats: [], nextSpawn: 0.5, id: 1, shake: 0, flash: 0,
      spot: { x: 180, y: 280, ph: rnd(0, TAU) }, sudden: false, twoHands: false, lastTick: 99, ended: false,
    }
    st.forEach(function (s, i) {
      var far = 0
      st.forEach(function (o) { far = Math.max(far, dist(s.x, s.y, o.x, o.y)) })
      var ang = Math.atan2(H / 2 - s.y, W / 2 - s.x)
      var p = {
        i: i, key: PK[i], safe: s, ang: ang, score: 0, shown: 0, dial: 0, pop: 0, dyed: 0, slapCd: 0,
        reach: far * 0.86, bot: attract || (cfg.humans === 'one' && i > 0), hands: [],
        mouth: { x: s.x + Math.cos(ang) * 24, y: s.y + Math.sin(ang) * 24 },
      }
      for (var k = 0; k < per; k++) {
        var off = per === 2 ? (k ? 1 : -1) * 15 : 0
        var hx = p.mouth.x + Math.cos(ang) * 16 - Math.sin(ang) * off, hy = p.mouth.y + Math.sin(ang) * 16 + Math.cos(ang) * off
        p.hands.push({ p: p, x: hx, y: hy, hx: hx, hy: hy, tx: hx, ty: hy, vx: 0, vy: 0, active: false, loot: null, stun: 0, pid: null, lit: 0, wob: 0, wv: 0, ai: { target: null, wait: 0 } })
      }
      S.players.push(p)
    })
    hideEnd()
  }

  // ── loot ─────────────────────────────────────────────────────────────────
  function spawn(kind, x, y) {
    if (!kind) {
      var r = Math.random()
      kind = S.sudden ? 'coin' : r < 0.52 ? 'coin' : r < 0.82 ? 'bill' : r < 0.9 ? 'gem' : (cfg.dye ? 'dye' : 'coin')
    }
    if (x == null) {
      for (var tries = 0; tries < 20; tries++) {
        x = rnd(46, W - 46); y = rnd(120, H - 120)
        var ok = S.players.every(function (p) { return dist(x, y, p.safe.x, p.safe.y) > 110 }) &&
          S.loot.every(function (l) { return dist(x, y, l.x, l.y) > 44 })
        if (ok) break
      }
    }
    var l = { id: S.id++, kind: kind, x: x, y: y, vx: 0, vy: 0, z: 1, r: RAD[kind], holders: [], ttl: 7.5, contest: 0, strain: 0, rot: rnd(-0.3, 0.3), spin: rnd(0, TAU), fool: {}, dead: false, squash: 0 }
    S.loot.push(l)
    return l
  }
  function release(h, stun) {
    var l = h.loot
    if (l) {
      l.holders = l.holders.filter(function (o) { return o !== h })
      if (!l.holders.length) { l.vx = clamp(h.vx, -900, 900); l.vy = clamp(h.vy, -900, 900) }
      l.contest = 0; l.strain = 0
      h.loot = null
    }
    if (stun) h.stun = stun
  }
  function burst(x, y, kind, key, n, sp) {
    if (reduced) n = Math.ceil(n / 3)
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU), v = rnd(0.3, 1) * (sp || 160)
      S.fx.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.35, 0.8), kind: kind, key: key, size: rnd(2.5, 5.5), rot: rnd(0, TAU), vr: rnd(-8, 8) })
    }
  }
  function floatText(x, y, text, key) { S.floats.push({ x: x, y: y, text: text, key: key, life: 0 }) }
  function shake(v) { if (!reduced) S.shake = Math.max(S.shake, v) }
  function mult() { return cfg.lastcall && !S.attract && !S.sudden && S.time <= LAST ? 2 : 1 }

  function deposit(l, p) {
    l.dead = true
    l.holders.slice().forEach(function (h) { h.loot = null })
    l.holders = []
    p.pop = 1; p.dial += 2.2
    if (l.kind === 'dye') {
      p.score = Math.max(0, p.score + VAL.dye); p.dyed = 1.6
      p.hands.forEach(function (h) { release(h, 0.3) })
      burst(p.safe.x, p.safe.y, 'blob', 'danger', 18, 220); floatText(p.safe.x, p.safe.y, '-3', 'danger')
      shake(7); sfx.bad(); buzz(60)
    } else {
      var v = VAL[l.kind] * mult()
      p.score += v
      burst(p.mouth.x, p.mouth.y, 'star', l.kind === 'gem' ? 'p3' : 'cta', 6 + v * 2, 150)
      floatText(p.safe.x, p.safe.y, '+' + v, p.key)
      sfx.cash(v); if (!p.bot) buzz(12)
    }
  }
  function tear(l) {
    var hs = l.holders.slice()
    l.dead = true; l.holders = []
    hs.forEach(function (h, i) {
      var half = spawn('half', h.x, h.y); half.z = 0; half.side = i; half.holders = [h]; h.loot = half
    })
    burst(l.x, l.y, 'paper', 'win', 14, 190); floatText(l.x, l.y - 6, 'RIP!', 'text')
    shake(5); sfx.rip(); buzz(25)
  }

  // ── hands ────────────────────────────────────────────────────────────────
  function grip(h) { return 1 - 0.7 * clamp(dist(h.x, h.y, h.p.safe.x, h.p.safe.y) / h.p.reach, 0, 1) }
  function stepHand(h, dt) {
    var p = h.p
    if (h.stun > 0) h.stun -= dt
    var tx = h.active ? h.tx : h.hx, ty = h.active ? h.ty : h.hy
    var d = dist(tx, ty, p.safe.x, p.safe.y)
    if (d > p.reach) { tx = p.safe.x + (tx - p.safe.x) * p.reach / d; ty = p.safe.y + (ty - p.safe.y) * p.reach / d }
    tx = clamp(tx, 10, W - 10); ty = clamp(ty, 10, H - 10)
    var speed = p.bot ? LEVEL[cfg.level].speed * (h.loot && h.loot.kind === 'gem' ? 0.7 : 1) : (h.active ? 2600 : 1500)
    if (!h.active) speed = Math.max(speed, 900)
    var ox = h.x, oy = h.y, gap = dist(h.x, h.y, tx, ty), mv = speed * dt
    if (gap <= mv) { h.x = tx; h.y = ty } else { h.x += (tx - h.x) / gap * mv; h.y += (ty - h.y) / gap * mv }
    var k = Math.min(1, dt * 18)
    h.vx += ((h.x - ox) / dt - h.vx) * k; h.vy += ((h.y - oy) / dt - h.vy) * k
    // arm wobble: a damped spring kicked by sideways motion
    var side = (-Math.sin(p.ang) * h.vx + Math.cos(p.ang) * h.vy) * 0.012
    h.wv += (-h.wob * 90 - h.wv * 9 - side * 30) * dt; h.wob += h.wv * dt
    if (h.active && !h.loot && h.stun <= 0 && p.dyed <= 0) {
      for (var i = 0; i < S.loot.length; i++) {
        var l = S.loot[i]
        if (l.dead || l.z > 0.05 || l.holders.length >= 2) continue
        if (l.holders.some(function (o) { return o.p === p })) continue
        if (dist(h.x, h.y, l.x, l.y) < l.r + GRAB) {
          l.holders.push(h); h.loot = l; l.contest = 0
          if (!p.bot) { sfx.grab(); buzz(8) }
          break
        }
      }
    }
  }

  // ── bots: same reach, same rules, no peeking at the future ───────────────
  function stepBot(p, dt) {
    var L = LEVEL[cfg.level]
    p.hands.forEach(function (h, hi) {
      var ai = h.ai
      if (h.stun > 0 || p.dyed > 0) { h.active = false; ai.target = null; return }
      if (hi > 0 && !S.attract && !S.twoHands) { h.active = false; return }
      if (h.loot) {
        h.active = true; h.tx = p.mouth.x; h.ty = p.mouth.y
        if (cfg.spot && cfg.level !== 'easy') {
          var sd = dist(h.x, h.y, S.spot.x, S.spot.y), nd = dist(h.x + (h.tx - h.x) * 0.2, h.y + (h.ty - h.y) * 0.2, S.spot.x, S.spot.y)
          if (sd > 62 && nd < 74) { h.tx = h.x; h.ty = h.y }
        }
        return
      }
      if (ai.wait > 0) { ai.wait -= dt; h.active = false; return }
      var t = ai.target
      if (t && (t.dead || t.holders.some(function (o) { return o.p === p }) || t.holders.length >= 2)) t = ai.target = null
      if (!t) {
        var best = null, bs = 0
        S.loot.forEach(function (l) {
          if (l.dead || l.z > 0.4 || l.holders.length >= 2 || l.kind === 'half') return
          if (p.hands.some(function (o) { return o !== h && (o.ai.target === l || o.loot === l) })) return
          if (l.kind === 'dye') {
            if (l.fool[p.i] == null) l.fool[p.i] = Math.random() < L.fool
            if (!l.fool[p.i]) return
          }
          var d = dist(l.x, l.y, p.safe.x, p.safe.y)
          if (d > p.reach) return
          var v = Math.abs(VAL[l.kind]) / (d + 70)
          if (l.holders.length) v *= l.kind === 'bill' ? 0.5 : (1 - 0.7 * d / p.reach > grip(l.holders[0]) ? 0.7 : 0.05)
          if (v > bs) { bs = v; best = l }
        })
        if (best) { ai.target = best; ai.wait = L.react * rnd(0.7, 1.3); h.active = false; return }
        h.active = false; return
      }
      h.active = true; h.tx = t.x; h.ty = t.y
    })
    if (cfg.slap && p.slapCd <= 0 && Math.random() < L.slap * dt) {
      S.players.forEach(function (o) {
        if (o === p || p.slapCd > 0) return
        o.hands.forEach(function (h) {
          if (!h.loot || p.slapCd > 0) return
          var mx = (o.mouth.x + h.x) / 2, my = (o.mouth.y + h.y) / 2
          if (dist(mx, my, p.safe.x, p.safe.y) < p.reach * 0.55) doSlap(p, h, mx, my)
        })
      })
    }
  }
  function doSlap(p, h, x, y) {
    release(h, 0.7); p.slapCd = 0.9
    S.fx.push({ x: p.mouth.x, y: p.mouth.y, x2: x, y2: y, life: 0, max: 0.18, kind: 'whip', key: p.key })
    burst(x, y, 'star', 'card', 8, 170); floatText(x, y - 8, 'SLAP!', p.key)
    shake(3); sfx.slip(); buzz(15)
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1
    var t = clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1)
    return dist(px, py, ax + dx * t, ay + dy * t)
  }

  // ── step ─────────────────────────────────────────────────────────────────
  function step(dt) {
    S.t += dt
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 22)
    if (S.flash > 0) S.flash -= dt
    S.players.forEach(function (p) {
      p.shown += (p.score - p.shown) * Math.min(1, dt * 10)
      if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 3.2)
      if (p.dyed > 0) p.dyed -= dt
      if (p.slapCd > 0) p.slapCd -= dt
      p.dial *= Math.pow(0.02, dt)
    })
    stepFx(dt)
    if (S.phase === 'count') {
      var before = Math.ceil(S.count - 0.4)
      S.count -= dt
      var after = Math.ceil(S.count - 0.4)
      if (after < before) { if (after >= 1) sfx.tick(); else sfx.go() }
      if (S.count <= 0) S.phase = 'play'
      S.players.forEach(function (p) { p.hands.forEach(function (h) { stepHand(h, dt) }) })
      return
    }
    if (S.phase !== 'play') {
      S.players.forEach(function (p) { p.hands.forEach(function (h) { h.active = false; stepHand(h, dt) }) })
      return
    }
    if (!S.sudden) S.time -= dt
    if (!S.attract && S.time <= LAST && S.time > 0 && Math.ceil(S.time) < S.lastTick) { S.lastTick = Math.ceil(S.time); sfx.tick() }
    // spawn waves: faster as the clock runs down, a spray in the last call
    S.nextSpawn -= dt
    var live = S.loot.filter(function (l) { return !l.dead }).length
    if (S.nextSpawn <= 0 && live < (S.sudden ? 1 : MAX_LOOT + (mult() > 1 ? 2 : 0))) {
      spawn()
      var prog = S.attract ? 0.4 : 1 - S.time / ROUND
      S.nextSpawn = mult() > 1 ? 0.5 : 1.5 - 0.6 * prog
    }
    // spotlight patrol
    if (cfg.spot) {
      S.spot.x = 180 + 112 * Math.sin(S.t * 0.55 + S.spot.ph)
      S.spot.y = 280 + 150 * Math.sin(S.t * 0.83 + S.spot.ph * 0.5)
    }
    S.players.forEach(function (p) {
      if (p.bot) stepBot(p, dt)
      p.hands.forEach(function (h) {
        stepHand(h, dt)
        if (cfg.spot && h.loot && dist(h.x, h.y, S.spot.x, S.spot.y) < 56) {
          h.lit += dt
          if (h.lit > 0.3) {
            var l = h.loot; release(h, 0.9); if (l) { l.vx = 0; l.vy = 0 }
            h.lit = 0; S.flash = 0.25
            burst(h.x, h.y, 'star', 'danger', 10, 180); floatText(h.x, h.y - 10, 'CAUGHT!', 'danger')
            shake(4); sfx.bad(); if (!p.bot) buzz(40)
          }
        } else h.lit = 0
      })
    })
    S.loot.forEach(function (l) {
      if (l.dead) return
      l.spin += dt * 2.4
      if (l.squash > 0) l.squash = Math.max(0, l.squash - dt * 5)
      if (l.z > 0) {
        l.z -= dt / 0.42
        if (l.z <= 0) { l.z = 0; l.squash = 1; burst(l.x, l.y, 'star', l.kind === 'gem' ? 'p3' : 'cta', 5, 90); sfx.land() }
        return
      }
      l.holders = l.holders.filter(function (h) { return h.loot === l })
      var hs = l.holders
      if (hs.length === 1) {
        var h = hs[0], k = Math.min(1, dt * (l.kind === 'gem' ? 9 : 34))
        l.x += (h.x - l.x) * k; l.y += (h.y - l.y) * k; l.vx = h.vx; l.vy = h.vy; l.contest = 0; l.strain = 0
      } else if (hs.length === 2) {
        var a = hs[0], b = hs[1], d = dist(a.x, a.y, b.x, b.y)
        l.x = (a.x + b.x) / 2; l.y = (a.y + b.y) / 2
        if (l.kind === 'bill') {
          l.strain = clamp(d / TEAR, 0, 1)
          if (d > TEAR) tear(l)
        } else {
          l.contest += dt; l.strain = clamp(l.contest / 0.35, 0, 1)
          if (l.contest > 0.35) {
            var loser = grip(a) >= grip(b) ? b : a
            release(loser, 0.3)
            burst(loser.x, loser.y, 'star', 'card', 6, 140); floatText(loser.x, loser.y - 8, 'SLIP!', loser.p.key)
            sfx.slip(); if (!loser.p.bot) buzz(20)
          }
        }
      } else {
        l.x += l.vx * dt; l.y += l.vy * dt
        var f = Math.pow(0.03, dt); l.vx *= f; l.vy *= f
        if (l.x < l.r + 8) { l.x = l.r + 8; l.vx = Math.abs(l.vx) * 0.6 }
        if (l.x > W - l.r - 8) { l.x = W - l.r - 8; l.vx = -Math.abs(l.vx) * 0.6 }
        if (l.y < l.r + 8) { l.y = l.r + 8; l.vy = Math.abs(l.vy) * 0.6 }
        if (l.y > H - l.r - 8) { l.y = H - l.r - 8; l.vy = -Math.abs(l.vy) * 0.6 }
        l.ttl -= dt
        if (l.ttl <= 0) { l.dead = true; burst(l.x, l.y, 'dot', 'dim', 8, 90) }
      }
      if (l.dead) return
      for (var i = 0; i < S.players.length; i++) {
        var p = S.players[i]
        if (dist(l.x, l.y, p.safe.x, p.safe.y) < SAFE_R) { deposit(l, p); break }
      }
    })
    S.loot = S.loot.filter(function (l) { return !l.dead })
    if (!S.attract) {
      var top = Math.max.apply(null, S.players.map(function (p) { return p.score }))
      var leaders = S.players.filter(function (p) { return p.score === top })
      if (S.time <= 0 && !S.sudden) {
        if (leaders.length > 1) { S.sudden = true; S.time = 0; floatText(W / 2, H / 2 - 40, 'TIE: NEXT COIN WINS', 'cta'); S.loot.forEach(function (l) { l.ttl = Math.min(l.ttl, 0.2) }) } else finish()
      } else if (S.sudden && leaders.length === 1) finish()
    }
  }
  function stepFx(dt) {
    S.fx.forEach(function (f) {
      f.life += dt
      if (f.kind === 'whip') return
      f.x += f.vx * dt; f.y += f.vy * dt
      var d = Math.pow(0.04, dt); f.vx *= d; f.vy *= d
      if (f.kind === 'paper') f.vy += 120 * dt
      f.rot += f.vr * dt
    })
    S.fx = S.fx.filter(function (f) { return f.life < f.max })
    S.floats.forEach(function (f) { f.life += dt; f.y -= 26 * dt })
    S.floats = S.floats.filter(function (f) { return f.life < 1.1 })
  }
  function finish() {
    if (S.ended) return
    S.ended = true; S.phase = 'over'
    S.players.forEach(function (p) { p.hands.forEach(function (h) { release(h) }) })
    sfx.end()
    showEnd()
  }

  // ── drawing ──────────────────────────────────────────────────────────────
  var noise = null
  function makeNoise() {
    noise = document.createElement('canvas'); noise.width = noise.height = 96
    var n = noise.getContext('2d')
    for (var i = 0; i < 1400; i++) {
      n.fillStyle = Math.random() < 0.5 ? 'rgb(255 255 255 / .05)' : 'rgb(0 0 0 / .06)'
      n.fillRect(Math.random() * 96, Math.random() * 96, 1, rnd(1, 3))
    }
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
  }
  function star(x, y, r, rot) {
    ctx.beginPath()
    for (var i = 0; i < 8; i++) { var a = rot + i * TAU / 8, q = i % 2 ? r * 0.42 : r; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q) }
    ctx.closePath()
  }
  function drawTable() {
    var g = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 380)
    g.addColorStop(0, col('felt1')); g.addColorStop(1, col('felt2'))
    rr(0, 0, W, H, 22); ctx.fillStyle = g; ctx.fill()
    ctx.save(); rr(0, 0, W, H, 22); ctx.clip()
    if (noise) { ctx.fillStyle = ctx.createPattern(noise, 'repeat'); ctx.fillRect(0, 0, W, H) }
    // each player's home glow
    S.players.forEach(function (p) {
      var hg = ctx.createRadialGradient(p.safe.x, p.safe.y, 10, p.safe.x, p.safe.y, 150)
      hg.addColorStop(0, col(p.key, 0.3)); hg.addColorStop(1, col(p.key, 0))
      ctx.fillStyle = hg; ctx.fillRect(0, 0, W, H)
    })
    // stitched inner line
    ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2; ctx.strokeStyle = col('card', 0.28); rr(9, 9, W - 18, H - 18, 15); ctx.stroke(); ctx.setLineDash([])
    // inner vignette
    var v = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 400)
    v.addColorStop(0, 'rgb(0 0 0 / 0)'); v.addColorStop(1, 'rgb(0 0 0 / .32)')
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H)
    ctx.restore()
    // rim with a top highlight
    ctx.lineWidth = 5; ctx.strokeStyle = col('rim'); rr(2.5, 2.5, W - 5, H - 5, 20); ctx.stroke()
    ctx.lineWidth = 1; ctx.strokeStyle = col('card', 0.55); rr(1, 1, W - 2, H - 2, 21); ctx.stroke()
  }
  function drawClock() {
    var x = W / 2, y = H / 2, r = 34
    ctx.save()
    ctx.beginPath(); ctx.arc(x, y, r + 8, 0, TAU); ctx.fillStyle = 'rgb(0 0 0 / .14)'; ctx.fill()
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col('card', 0.1); ctx.fill()
    ctx.lineWidth = 2; ctx.strokeStyle = col('card', 0.3); ctx.stroke()
    for (var i = 0; i < 12; i++) {
      var a = i * TAU / 12
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4)); ctx.lineTo(x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8))
      ctx.strokeStyle = col('card', 0.35); ctx.lineWidth = 1.5; ctx.stroke()
    }
    if (!S.attract) {
      var frac = S.sudden ? 1 : clamp(S.time / ROUND, 0, 1), hot = mult() > 1 || S.sudden
      ctx.beginPath(); ctx.arc(x, y, r - 1, -Math.PI / 2, -Math.PI / 2 + TAU * frac)
      ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = col(hot ? 'cta' : 'card', hot ? 1 : 0.85); ctx.stroke()
      ctx.fillStyle = col('card', 0.95); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = "14px 'Press Start 2P', ui-monospace, monospace"
      var txt = S.sudden ? 'TIE' : String(Math.max(0, Math.ceil(S.time)))
      ctx.shadowColor = 'rgb(0 0 0 / .45)'; ctx.shadowBlur = 4
      ctx.fillText(txt, x + 1, y + 1)
      if (hot && !S.sudden) { ctx.font = "6px 'Press Start 2P', ui-monospace, monospace"; ctx.fillStyle = col('cta'); ctx.fillText('x2', x + 1, y + 17) }
    }
    ctx.restore()
  }
  function drawSpot() {
    if (!cfg.spot || S.attract) return
    var s = S.spot, g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, 62)
    g.addColorStop(0, col('cta', 0.42)); g.addColorStop(0.75, col('cta', 0.2)); g.addColorStop(1, col('cta', 0))
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 62, 0, TAU); ctx.fill()
    ctx.setLineDash([6, 6]); ctx.lineDashOffset = -S.t * 20; ctx.lineWidth = 1.5; ctx.strokeStyle = col('cta', 0.8)
    ctx.beginPath(); ctx.arc(s.x, s.y, 56, 0, TAU); ctx.stroke(); ctx.setLineDash([])
  }
  function shadow(x, y, rx, ry, a) { ctx.beginPath(); ctx.ellipse(x + 2, y + 5, rx, ry, 0, 0, TAU); ctx.fillStyle = 'rgb(0 0 0 / ' + a + ')'; ctx.fill() }

  function drawCoin(l, s) {
    var r = l.r * s
    ctx.beginPath(); ctx.arc(0, 2.5, r, 0, TAU); ctx.fillStyle = col('ink', 0.55); ctx.fill()
    var g = ctx.createRadialGradient(-r * 0.4, -r * 0.5, 1, 0, 0, r * 1.2)
    g.addColorStop(0, col('card')); g.addColorStop(0.25, col('cta')); g.addColorStop(1, col('cta'))
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = g; ctx.fill()
    ctx.fillStyle = 'rgb(0 0 0 / .16)'; ctx.beginPath(); ctx.arc(0, 0, r, 0.3, Math.PI - 0.3); ctx.fill()
    ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.75); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke()
    ctx.lineWidth = 1; ctx.strokeStyle = col('ink', 0.35); ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, TAU); ctx.stroke()
    star(0, 0, r * 0.42, l.spin * 0.2); ctx.fillStyle = col('ink', 0.6); ctx.fill()
    // travelling glint
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip()
    var gx = ((l.spin * 14) % (r * 6)) - r * 3
    ctx.rotate(-0.6); ctx.fillStyle = 'rgb(255 255 255 / .5)'; ctx.fillRect(gx, -r * 2, 4, r * 4); ctx.fillRect(gx + 7, -r * 2, 1.5, r * 4)
    ctx.restore()
  }
  function drawBillShape(w, h, key, half, side) {
    ctx.beginPath()
    if (half) {
      var s = side ? -1 : 1
      ctx.moveTo(-w / 2 * s, -h / 2); ctx.lineTo(w / 2 * s - 3 * s, -h / 2); ctx.lineTo(w / 2 * s + 2 * s, -h / 4); ctx.lineTo(w / 2 * s - 3 * s, 0)
      ctx.lineTo(w / 2 * s + 2 * s, h / 4); ctx.lineTo(w / 2 * s - 3 * s, h / 2); ctx.lineTo(-w / 2 * s, h / 2); ctx.closePath()
    } else rr(-w / 2, -h / 2, w, h, 3)
    var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
    g.addColorStop(0, col(key)); g.addColorStop(1, col(key))
    ctx.fillStyle = g; ctx.fill()
    ctx.fillStyle = 'rgb(255 255 255 / .16)'; ctx.fillRect(-w / 2 + 2, -h / 2 + 1.5, w - 4, h * 0.36)
    ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.75); ctx.stroke()
    if (!half) {
      ctx.lineWidth = 1; ctx.strokeStyle = col('card', 0.6); rr(-w / 2 + 3.5, -h / 2 + 3.5, w - 7, h - 7, 1.5); ctx.stroke()
      ctx.beginPath(); ctx.arc(0, 0, h * 0.27, 0, TAU); ctx.fillStyle = col('card', 0.85); ctx.fill()
      star(0, 0, h * 0.2, 0); ctx.fillStyle = col(key); ctx.fill()
    }
  }
  function drawLoot(l) {
    if (l.holders.length === 2 && l.kind === 'bill') return drawStretched(l)
    var drop = l.z, s = 1 + drop * 0.9 + (l.squash > 0 ? Math.sin(l.squash * Math.PI) * 0.18 : 0)
    var blink = l.ttl < 1.6 && !l.holders.length ? (Math.sin(l.ttl * 26) > 0 ? 0.35 : 1) : 1
    ctx.save(); ctx.globalAlpha = blink * (1 - drop * 0.25)
    shadow(l.x, l.y + drop * 10, l.r * (1 - drop * 0.5), l.r * 0.55 * (1 - drop * 0.5), 0.3 * (1 - drop * 0.6))
    ctx.translate(l.x, l.y - drop * 46)
    if (l.kind === 'coin') drawCoin(l, s)
    else if (l.kind === 'gem') {
      var r = l.r * s
      ctx.rotate(Math.sin(l.spin * 0.7) * 0.12)
      ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(-r, -r * 0.2); ctx.lineTo(-r * 0.55, -r * 0.8); ctx.lineTo(r * 0.55, -r * 0.8); ctx.lineTo(r, -r * 0.2); ctx.closePath()
      ctx.fillStyle = col('p3'); ctx.fill()
      ctx.fillStyle = 'rgb(255 255 255 / .45)'; ctx.beginPath(); ctx.moveTo(-r * 0.55, -r * 0.8); ctx.lineTo(-r * 0.25, -r * 0.2); ctx.lineTo(-r, -r * 0.2); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgb(255 255 255 / .22)'; ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.2); ctx.lineTo(r * 0.25, -r * 0.2); ctx.lineTo(0, r); ctx.closePath(); ctx.fill()
      ctx.fillStyle = 'rgb(0 0 0 / .2)'; ctx.beginPath(); ctx.moveTo(r * 0.25, -r * 0.2); ctx.lineTo(r, -r * 0.2); ctx.lineTo(0, r); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(0, r); ctx.lineTo(-r, -r * 0.2); ctx.lineTo(-r * 0.55, -r * 0.8); ctx.lineTo(r * 0.55, -r * 0.8); ctx.lineTo(r, -r * 0.2); ctx.closePath()
      ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.8); ctx.stroke()
      var tw = (Math.sin(l.spin * 3) + 1) / 2
      star(r * 0.7, -r * 0.9, 2 + tw * 4, l.spin); ctx.fillStyle = col('card', 0.5 + tw * 0.5); ctx.fill()
    } else {
      ctx.rotate(l.rot + Math.sin(l.spin * 1.3) * 0.07); ctx.scale(s, s)
      if (l.kind === 'half') drawBillShape(17, 20, 'win', true, l.side)
      else if (l.kind === 'bill') drawBillShape(34, 20, 'win')
      else {
        // dye pack: a banded stack with a blinking light, the tell to read before you grab
        drawBillShape(34, 20, 'win'); ctx.fillStyle = col('card'); ctx.fillRect(-5, -10, 10, 20)
        ctx.strokeStyle = col('ink', 0.75); ctx.lineWidth = 1.2; ctx.strokeRect(-5, -10, 10, 20)
        var on = Math.sin(S.t * 14 + l.id) > 0
        ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fillStyle = col('danger', on ? 1 : 0.35); ctx.fill()
        if (on) { ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fillStyle = col('danger', 0.25); ctx.fill() }
        ctx.beginPath(); ctx.moveTo(5, -4); ctx.quadraticCurveTo(13, -14, 15, -5); ctx.strokeStyle = col('danger', 0.9); ctx.lineWidth = 1.3; ctx.stroke()
      }
    }
    ctx.restore()
    if (l.strain > 0 && l.holders.length === 2) {
      ctx.beginPath(); ctx.arc(l.x, l.y, l.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * l.strain)
      ctx.lineWidth = 3; ctx.strokeStyle = col('card', 0.9); ctx.stroke()
    }
  }
  function drawStretched(l) {
    var a = l.holders[0], b = l.holders[1], ang = Math.atan2(b.y - a.y, b.x - a.x), d = Math.max(34, dist(a.x, a.y, b.x, b.y) + 14)
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(ang)
    var jit = l.strain > 0.6 && !reduced ? (Math.random() - 0.5) * 2 * (l.strain - 0.6) * 5 : 0
    ctx.translate(0, jit)
    var h = 20 - l.strain * 5
    drawBillShape(d, h, l.strain > 0.75 ? 'danger' : 'win')
    if (l.strain > 0.35) {
      ctx.beginPath(); ctx.moveTo(0, -h / 2)
      var n = 4
      for (var i = 1; i <= n; i++) ctx.lineTo((i % 2 ? 2.5 : -2.5) * l.strain, -h / 2 + h * l.strain * i / n)
      ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.9); ctx.stroke()
    }
    ctx.restore()
  }
  function drawArm(h) {
    var p = h.p, mx = p.mouth.x, my = p.mouth.y
    var d = dist(mx, my, h.x, h.y)
    if (d < 4 && !h.active) return
    var st = clamp(dist(h.x, h.y, p.safe.x, p.safe.y) / p.reach, 0, 1), w = 12 - st * 6.5
    var nx = -(h.y - my) / (d || 1), ny = (h.x - mx) / (d || 1)
    var cx = (mx + h.x) / 2 + nx * h.wob * 14, cy = (my + h.y) / 2 + ny * h.wob * 14
    function path() { ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(cx, cy, h.x, h.y) }
    ctx.lineCap = 'round'
    ctx.save(); ctx.translate(3, 6); path(); ctx.lineWidth = w + 2; ctx.strokeStyle = 'rgb(0 0 0 / .2)'; ctx.stroke(); ctx.restore()
    path(); ctx.lineWidth = w + 3; ctx.strokeStyle = col('ink', 0.85); ctx.stroke()
    path(); ctx.lineWidth = w; ctx.strokeStyle = col(p.key); ctx.stroke()
    // sleeve stripes slide along the arm so stretch reads as motion
    ctx.setLineDash([3, 9]); ctx.lineDashOffset = -d * 0.5
    path(); ctx.lineWidth = w; ctx.strokeStyle = 'rgb(255 255 255 / .22)'; ctx.stroke(); ctx.setLineDash([])
    path(); ctx.lineWidth = Math.max(1, w * 0.22); ctx.strokeStyle = 'rgb(255 255 255 / .35)'; ctx.stroke()
    // glove
    var ang = d > 6 ? Math.atan2(h.y - cy, h.x - cx) : p.ang
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(ang)
    var closed = !!h.loot, gr = 10.5
    ctx.fillStyle = col('ink', 0.85); ctx.beginPath(); ctx.arc(0, 0, gr + 1.6, 0, TAU); ctx.fill()
    if (!closed) for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(9 + (i === 0 ? 2.5 : 0), i * 6.5, 5.6, 0, TAU); ctx.fill() }
    ctx.fillStyle = col(p.dyed > 0 ? 'danger' : 'card')
    if (!closed) for (var j = -1; j <= 1; j++) { ctx.beginPath(); ctx.arc(9 + (j === 0 ? 2.5 : 0), j * 6.5, 4.2, 0, TAU); ctx.fill() }
    ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill()
    ctx.fillStyle = col(p.key); ctx.fillRect(-gr - 1, -gr * 0.75, 5, gr * 1.5)
    if (closed) { ctx.strokeStyle = col('ink', 0.5); ctx.lineWidth = 1.2; for (var q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(4, q * 4.5); ctx.lineTo(9, q * 4.5); ctx.stroke() } }
    ctx.restore()
    if (h.stun > 0) for (var s = 0; s < 3; s++) { var sa = S.t * 9 + s * TAU / 3; star(h.x + Math.cos(sa) * 15, h.y - 12 + Math.sin(sa) * 5, 3.5, sa); ctx.fillStyle = col('cta'); ctx.fill() }
    if (h.lit > 0) { ctx.beginPath(); ctx.arc(h.x, h.y, 17, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(h.lit / 0.3, 0, 1)); ctx.lineWidth = 3; ctx.strokeStyle = col('danger'); ctx.stroke() }
  }
  function drawSafe(p) {
    var s = p.safe, pop = p.pop > 0 ? Math.sin(p.pop * Math.PI) * 0.14 : 0
    shadow(s.x, s.y + 4, 34, 24, 0.3)
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(p.ang - Math.PI / 2); ctx.scale(1 + pop, 1 + pop)
    var w = 62, h = 50
    // feet + body
    ctx.fillStyle = col('ink', 0.9); rr(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 9); ctx.fill()
    var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
    g.addColorStop(0, col(p.key)); g.addColorStop(1, col(p.key))
    rr(-w / 2, -h / 2, w, h, 7); ctx.fillStyle = g; ctx.fill()
    ctx.fillStyle = 'rgb(255 255 255 / .28)'; rr(-w / 2 + 2, -h / 2 + 2, w - 4, 9, 5); ctx.fill()
    ctx.fillStyle = 'rgb(0 0 0 / .22)'; rr(-w / 2 + 2, h / 2 - 12, w - 4, 10, 5); ctx.fill()
    // door panel + bolts
    ctx.lineWidth = 1.5; ctx.strokeStyle = col('ink', 0.55); rr(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 4); ctx.stroke()
    ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { ctx.beginPath(); ctx.arc(c[0] * (w / 2 - 10), c[1] * (h / 2 - 10), 2, 0, TAU); ctx.fillStyle = col('ink', 0.6); ctx.fill() })
    // the mouth: where loot goes in (faces the table)
    ctx.fillStyle = col('ink', 0.92); rr(-15, h / 2 - 9, 30, 11, 5); ctx.fill()
    ctx.fillStyle = col('cta', 0.25 + pop * 4); rr(-12, h / 2 - 6, 24, 5, 2.5); ctx.fill()
    // dial
    ctx.beginPath(); ctx.arc(0, -3, 12, 0, TAU); ctx.fillStyle = col('metal'); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = col('ink', 0.8); ctx.stroke()
    ctx.save(); ctx.translate(0, -3); ctx.rotate(p.dial)
    for (var i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillStyle = col('card', 0.75); ctx.fillRect(-0.7, -11, 1.4, 3) }
    ctx.fillStyle = col('card'); ctx.fillRect(-1.5, -9, 3, 9); ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, TAU); ctx.fillStyle = col('ink', 0.85); ctx.fill()
    ctx.restore()
    if (p.dyed > 0) { ctx.fillStyle = col('danger', 0.4 + 0.3 * Math.sin(S.t * 22)); rr(-w / 2, -h / 2, w, h, 7); ctx.fill() }
    ctx.restore()
    // score window: upright for the viewer, flipped for a human across the table
    var flip = !p.bot && cfg.humans === 'all' && s.y < H / 2
    var ox = s.x < 120 ? 50 : s.x > 240 ? -50 : 54, oy = cfg.n === 2 ? 0 : (s.y < H / 2 ? 4 : -4)
    ctx.save(); ctx.translate(s.x + ox, s.y + oy); if (flip) ctx.rotate(Math.PI)
    ctx.fillStyle = col('ink', 0.9); rr(-19, -12, 38, 24, 6); ctx.fill()
    ctx.fillStyle = col('card'); rr(-17, -10, 34, 20, 4); ctx.fill()
    ctx.fillStyle = col(p.key); ctx.fillRect(-17, 7, 34, 3)
    ctx.fillStyle = col('text'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = "11px 'Press Start 2P', ui-monospace, monospace"
    ctx.fillText(String(Math.round(p.shown)), 1, -1)
    ctx.restore()
  }
  function drawFx() {
    S.fx.forEach(function (f) {
      var a = 1 - f.life / f.max
      if (f.kind === 'whip') {
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.lineWidth = 4 * a; ctx.lineCap = 'round'; ctx.strokeStyle = col(f.key, a); ctx.stroke(); return
      }
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = a
      ctx.fillStyle = col(f.key)
      if (f.kind === 'star') { star(0, 0, f.size, 0); ctx.fill() }
      else if (f.kind === 'paper') { ctx.fillRect(-f.size, -f.size * 0.6, f.size * 2, f.size * 1.2) }
      else { ctx.beginPath(); ctx.arc(0, 0, f.size * (f.kind === 'blob' ? 1.5 : 0.8), 0, TAU); ctx.fill() }
      ctx.restore()
    })
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    S.floats.forEach(function (f) {
      var a = clamp(1.1 - f.life, 0, 1), sc = 1 + Math.max(0, 0.25 - f.life) * 2
      ctx.save(); ctx.translate(clamp(f.x, 40, W - 40), f.y - 26); ctx.scale(sc, sc); ctx.globalAlpha = a
      ctx.font = "10px 'Press Start 2P', ui-monospace, monospace"
      ctx.lineWidth = 4; ctx.strokeStyle = col('ink', 0.9); ctx.strokeText(f.text, 0, 0)
      ctx.fillStyle = col(f.key === 'text' ? 'card' : f.key); ctx.fillText(f.text, 0, 0)
      ctx.restore()
    })
  }
  function drawOverlay() {
    if (S.phase === 'count') {
      var n = Math.ceil(S.count - 0.4), part = (S.count - 0.4) % 1
      if (part < 0) part += 1
      ctx.fillStyle = 'rgb(0 0 0 / .28)'; rr(0, 0, W, H, 22); ctx.fill()
      ctx.save(); ctx.translate(W / 2, H / 2); var sc = 1 + (reduced ? 0 : part * 0.5); ctx.scale(sc, sc)
      ctx.font = "44px 'Press Start 2P', ui-monospace, monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.lineWidth = 8; ctx.strokeStyle = col('ink', 0.9); var t = n >= 1 ? String(n) : 'GRAB!'
      if (n < 1) ctx.font = "26px 'Press Start 2P', ui-monospace, monospace"
      ctx.strokeText(t, 2, 2); ctx.fillStyle = col('cta'); ctx.fillText(t, 2, 2); ctx.restore()
    }
    if (mult() > 1 && S.phase === 'play') {
      var pulse = 0.25 + 0.2 * Math.sin(S.t * 9)
      ctx.lineWidth = 10; ctx.strokeStyle = col('cta', pulse); rr(5, 5, W - 10, H - 10, 18); ctx.stroke()
      if (S.time > LAST - 1.6) {
        ctx.font = "13px 'Press Start 2P', ui-monospace, monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.lineWidth = 5; ctx.strokeStyle = col('ink', 0.9); ctx.strokeText('LAST CALL x2', W / 2, H / 2 - 62)
        ctx.fillStyle = col('cta'); ctx.fillText('LAST CALL x2', W / 2, H / 2 - 62)
      }
    }
    if (S.flash > 0) { ctx.fillStyle = col('danger', S.flash * 0.9); rr(0, 0, W, H, 22); ctx.fill() }
  }
  function draw() {
    var dpr = Math.min(2.5, window.devicePixelRatio || 1), cw = cv.clientWidth || W
    var pw = Math.round(cw * dpr), ph = Math.round(cw * H / W * dpr)
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph }
    ctx.setTransform(pw / W, 0, 0, ph / H, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.save()
    if (S.shake > 0) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake)
    drawTable(); drawClock(); drawSpot()
    S.loot.forEach(function (l) { if (!l.holders.length) drawLoot(l) })
    S.players.forEach(function (p) { p.hands.forEach(drawArm) })
    S.loot.forEach(function (l) { if (l.holders.length) drawLoot(l) })
    S.players.forEach(drawSafe)
    drawFx(); drawOverlay()
    ctx.restore()
  }

  // ── input ────────────────────────────────────────────────────────────────
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height } }
  function ownerAt(q) {
    if (cfg.humans === 'one') return S.players[0]
    var best = null, bd = 1e9
    S.players.forEach(function (p) { var d = dist(q.x, q.y, p.safe.x, p.safe.y); if (d < bd) { bd = d; best = p } })
    return best
  }
  function handOf(id) {
    for (var i = 0; i < S.players.length; i++) for (var j = 0; j < S.players[i].hands.length; j++) if (S.players[i].hands[j].pid === id) return S.players[i].hands[j]
    return null
  }
  cv.addEventListener('pointerdown', function (e) {
    if (S.attract) return
    e.preventDefault()
    try { cv.setPointerCapture(e.pointerId) } catch (err) { /* capture is a nicety */ }
    if (S.phase !== 'play' && S.phase !== 'count') return
    var q = pos(e), p = ownerAt(q)
    if (!p || p.bot) return
    if (cfg.slap && S.phase === 'play' && p.slapCd <= 0) {
      for (var i = 0; i < S.players.length; i++) {
        var o = S.players[i]; if (o === p) continue
        for (var j = 0; j < o.hands.length; j++) {
          var oh = o.hands[j]
          if (oh.loot && dist(q.x, q.y, oh.x, oh.y) > 24 && segDist(q.x, q.y, o.mouth.x, o.mouth.y, oh.x, oh.y) < 16) { doSlap(p, oh, q.x, q.y); return }
        }
      }
    }
    var free = p.hands.filter(function (h) { return h.pid == null })
    if (!free.length) return
    free.sort(function (a, b) { return dist(a.x, a.y, q.x, q.y) - dist(b.x, b.y, q.x, q.y) })
    var h = free[0]; h.pid = e.pointerId; h.active = true; h.tx = q.x; h.ty = q.y
    if (p.hands.every(function (o) { return o.pid != null }) && p.hands.length > 1) S.twoHands = true
  })
  cv.addEventListener('pointermove', function (e) {
    var h = handOf(e.pointerId); if (!h) return
    var q = pos(e); h.tx = q.x; h.ty = q.y
  })
  function up(e) {
    var h = handOf(e.pointerId); if (!h) return
    h.pid = null; h.active = false; release(h)
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up)
  cv.addEventListener('contextmenu', function (e) { e.preventDefault() })

  // ── end sheet + controls ─────────────────────────────────────────────────
  var endEl = document.getElementById('end'), startEl = document.getElementById('start')
  var NAMES = function (p) { return p.bot ? 'BOT ' + (p.i + (cfg.humans === 'one' ? 0 : 1)) : (cfg.humans === 'one' ? 'YOU' : 'PLAYER ' + (p.i + 1)) }
  function showEnd() {
    var rank = S.players.slice().sort(function (a, b) { return b.score - a.score })
    var rows = rank.map(function (p, i) {
      return '<li style="--sc:var(--c-' + p.key + ')"><i>' + (i + 1) + '</i><b>' + NAMES(p) + '</b><span>' + p.score + '</span></li>'
    }).join('')
    endEl.querySelector('ol').innerHTML = rows
    endEl.querySelector('h4').textContent = NAMES(rank[0]) + (rank[0].bot || cfg.humans === 'all' ? ' WINS' : ' WIN') + (S.sudden ? ' THE TIE-BREAK' : '')
    endEl.hidden = false
  }
  function hideEnd() { if (endEl) endEl.hidden = true }
  function start() { startEl.hidden = true; newGame(false) }
  startEl.querySelector('button').addEventListener('click', start)
  endEl.querySelector('button').addEventListener('click', start)

  function sync() {
    document.querySelectorAll('[data-set]').forEach(function (b) {
      var kv = b.getAttribute('data-set').split(':'), cur = String(cfg[kv[0]])
      b.setAttribute('aria-pressed', cur === kv[1] ? 'true' : 'false')
    })
    document.querySelectorAll('[data-toggle]').forEach(function (b) { b.setAttribute('aria-pressed', cfg[b.getAttribute('data-toggle')] ? 'true' : 'false') })
    document.querySelectorAll('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', frame.getAttribute('data-theme') === b.getAttribute('data-theme-set') ? 'true' : 'false') })
    var note = document.getElementById('touchnote')
    if (note) note.textContent = cfg.humans === 'all'
      ? 'ALL HUMANS needs a touch screen: every finger belongs to the nearest safe. ' + (cfg.n === 2 ? 'Two hands each.' : 'One hand each.')
      : 'You are the safe at the bottom' + (cfg.n === 4 ? ' left' : '') + '. ' + (cfg.n === 2 ? 'Two fingers work as two hands on a touch screen.' : 'One hand each with three or four players.')
  }
  function restartKeepingMode() { if (S.attract) newGame(true); else { startEl.hidden = true; newGame(false) } }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-set],[data-toggle],[data-theme-set],[data-try]') : null
    if (!b) return
    if (b.hasAttribute('data-set')) {
      var kv = b.getAttribute('data-set').split(':'); cfg[kv[0]] = kv[0] === 'n' ? Number(kv[1]) : kv[1]; restartKeepingMode()
    } else if (b.hasAttribute('data-toggle')) {
      var k = b.getAttribute('data-toggle'); cfg[k] = !cfg[k]
      if (k !== 'sound') restartKeepingMode()
    } else if (b.hasAttribute('data-theme-set')) {
      frame.setAttribute('data-theme', b.getAttribute('data-theme-set')); readTokens()
    } else if (b.hasAttribute('data-try')) {
      var t = b.getAttribute('data-try')
      cfg.dye = t === 'dye'; cfg.lastcall = t === 'lastcall'; cfg.spot = t === 'spot'; cfg.slap = t === 'slap'
      if (t === 'four') { cfg.n = 4; cfg.dye = true; cfg.lastcall = true }
      startEl.hidden = true; newGame(false)
      if (t === 'lastcall') S.time = 14
      frame.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    }
    sync()
  })

  // ── loop ─────────────────────────────────────────────────────────────────
  var last = 0, acc = 0, DT = 1 / 120
  function tick(now) {
    var el = Math.min(0.1, (now - last) / 1000 || 0); last = now
    acc += el
    while (acc >= DT) { step(DT); acc -= DT }
    draw()
    requestAnimationFrame(tick)
  }
  readTokens(); makeNoise(); newGame(true); sync()
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { readTokens() })
  requestAnimationFrame(function (t) { last = t; tick(t) })
  window.__sticky = { cfg: cfg, state: function () { return S }, start: start, step: step }
})()
