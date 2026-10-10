/* BAMBOOZLE prototype — core loop of the Game Night take on the "hide behind
   cover while stakes fire across the yard" mechanic. One canvas, no assets,
   no storage. The pure rules (lanes, cover, strike schedule) are kept apart
   from drawing so they can move to src/lib/bamboozleLogic.js as they are. */
(function () {
  'use strict'

  // ---------- tuning (every number here is a STARTING VALUE, see report §6) ----------
  const T = {
    hearts: 3, maxHearts: 4,
    speed: 2.7,            // cells per second
    reach: 0.7,            // share of the warning a fair walk to cover may use
    radius: 0.2,           // dodger radius in cells
    stakeW: 0.7,           // stake width as a share of its lane
    warnStart: 1.15, warnFloor: 0.5, warnStep: 0.045,
    gapStart: 0.9, gapFloor: 0.35, gapStep: 0.04,
    out: 0.14, hold: 0.45, back: 0.45,
    doubleFrom: 6, doubleAlways: 14,
    invuln: 1.3,
    stoneHp: 3,
    rise: 1.0,             // seconds a new boulder is announced before it lands
    dashTime: 0.16, dashMul: 3.1, dashCd: 2.2,
    grabReach: 0.14, grabMax: 1.4, grabBreak: 0.5, grabCd: 3, grabSlow: 0.7, fling: 6,
    coinsPerHeart: 3,
    roundsToWin: 2,
  }
  const SEATS = [
    { name: 'P1', rgb: [210, 110, 50], pad: 'br', keys: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], dash: ['Space', 'ShiftRight', 'Enter'] },
    { name: 'P2', rgb: [129, 89, 180], pad: 'tl', keys: ['KeyW', 'KeyD', 'KeyS', 'KeyA'], dash: ['KeyQ', 'ShiftLeft'] },
    { name: 'P3', rgb: [30, 150, 140], pad: 'tr', keys: ['KeyI', 'KeyL', 'KeyK', 'KeyJ'], dash: ['KeyU'] },
    { name: 'P4', rgb: [175, 55, 115], pad: 'bl', keys: ['KeyT', 'KeyH', 'KeyG', 'KeyF'], dash: ['KeyR'] },
  ]
  const BOT = {
    easy: { react: [0.45, 0.7], freeze: 0.18, speed: 0.82 },
    normal: { react: [0.24, 0.4], freeze: 0.06, speed: 0.92 },
    hard: { react: [0.1, 0.2], freeze: 0, speed: 1 },
  }

  // ---------- pure rules ----------
  /** Cell k steps into lane i from a side (0 top, 1 right, 2 bottom, 3 left). */
  function cellAt(n, side, i, k) {
    if (side === 0) return [i, k]
    if (side === 2) return [i, n - 1 - k]
    if (side === 3) return [k, i]
    return [n - 1 - k, i]
  }
  /** How far a cell is into its lane, and which lane, seen from a side. */
  function laneOf(n, side, c, r) {
    if (side === 0) return [c, r]
    if (side === 2) return [c, n - 1 - r]
    if (side === 3) return [r, c]
    return [r, n - 1 - c]
  }
  /** Cells a stake travels before the first boulder stops it (n = nothing in the way). */
  function laneLen(n, blocked, side, i) {
    for (let k = 0; k < n; k++) {
      const [c, r] = cellAt(n, side, i, k)
      if (blocked(c, r)) return k
    }
    return n
  }
  /** Free cells that no stake from any of `sides` can reach. */
  function safeCells(n, blocked, sides) {
    const out = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (blocked(c, r)) continue
      const ok = sides.every(s => { const [i, k] = laneOf(n, s, c, r); return k > laneLen(n, blocked, s, i) })
      if (ok) out.push([c, r])
    }
    return out
  }
  /** The longest walk, in tiles, from any free tile to its nearest safe tile (Infinity if some tile has none). */
  function worstWalk(n, blocked, sides) {
    const dist = new Map(), q = []
    for (const [c, r] of safeCells(n, blocked, sides)) { dist.set(r * n + c, 0); q.push([c, r]) }
    while (q.length) {
      const [c, r] = q.shift(), d = dist.get(r * n + c)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c2 = c + dc, r2 = r + dr
        if (c2 < 0 || r2 < 0 || c2 >= n || r2 >= n || blocked(c2, r2) || dist.has(r2 * n + c2)) continue
        dist.set(r2 * n + c2, d + 1); q.push([c2, r2])
      }
    }
    let worst = 0
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!blocked(c, r)) worst = Math.max(worst, dist.has(r * n + c) ? dist.get(r * n + c) : Infinity)
    return worst
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0
      let t = Math.imul(a ^ a >>> 15, 1 | a)
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
      return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
  }

  // ---------- state ----------
  const cv = document.getElementById('bz')
  if (!cv) return
  const ctx = cv.getContext('2d')
  const W = 360, H = 640
  const ARENA = { x: 42, y: 182, s: 276 }, RAIL = 38
  const opts = { players: 2, mode: 'solo', avatars: true, skill: 'normal', crumble: true, coins: false, shove: false, grab: false, haunt: false, sound: true, hints: true }
  let G = null, rng = Math.random, active = false, started = false, last = 0
  const sticks = new Map() // pointerId -> { seat, ox, oy, x, y, t0, moved }
  const keys = new Set()

  // Real avatar-kit output (full-body "hero" view), rendered at build time by gen_sprites.mjs.
  const SPR = /*SPRITES*/[]
  const SPRITES = SPR.map(a => {
    const frames = {}
    for (const name in a.frames) {
      const mk = (shade) => {
        const c = document.createElement('canvas'); c.width = 24; c.height = 24
        const x = c.getContext('2d'), img = x.createImageData(24, 24), f = a.frames[name]
        for (let i = 0; i < 576; i++) {
          const h = f.substr(i * 2, 2); if (h === '..') continue
          const col = a.pal[parseInt(h, 16)].split(',')
          img.data[i * 4] = col[0] * shade; img.data[i * 4 + 1] = col[1] * shade; img.data[i * 4 + 2] = col[2] * shade; img.data[i * 4 + 3] = 255
        }
        x.putImageData(img, 0, 0); return c
      }
      frames[name] = { lit: mk(1), side: mk(0.55), dark: mk(0) }
    }
    return frames
  })

  function newMatch() {
    G = { wins: SEATS.map(() => 0), round: 0, over: false, claimed: G ? G.claimed : [false, false, false, false] }
    newRound()
  }
  function newRound() {
    const n = opts.players > 2 ? 5 : 4
    rng = mulberry32((Math.random() * 2 ** 31) | 0)
    const R = {
      n, cell: ARENA.s / n, stones: [], pending: [], coin: null, parts: [],
      phase: 'count', t: 3.2, strike: 0, sides: [], lanes: [], ext: 0, shake: 0,
      haunt: null, banner: '', bannerT: 0, players: [], done: false, time: 0, crumbled: new Set(),
    }
    G.R = R; G.round++
    const want = n === 4 ? 3 : 5
    let guard = 0
    while (R.stones.length < want && guard++ < 200) {
      const c = (rng() * n) | 0, r = (rng() * n) | 0
      if (stoneAt(c, r)) continue
      if (R.stones.length === 0 && (c === 0 || r === 0 || c === n - 1 || r === n - 1)) continue // one inner boulder: every side leaves cover
      R.stones.push(mkStone(c, r, opts.crumble ? 2 + (R.stones.length % 3) : 99, 1))
    }
    for (let i = 0; i < opts.players; i++) {
      let c, r, g2 = 0
      do { c = (rng() * n) | 0; r = (rng() * n) | 0 } while ((stoneAt(c, r) || R.players.some(p => p.sc === c && p.sr === r)) && g2++ < 99)
      R.players.push({
        i, seat: SEATS[i], sc: c, sr: r, x: c + 0.5, y: r + 0.5, vx: 0, vy: 0, kx: 0, ky: 0, fx: 0, fy: 1,
        hp: T.hearts, inv: 0, out: false, outT: 0, coins: 0, squash: 0, walk: 0, dashT: 0, dashCd: 0,
        bot: { react: 0, target: null, path: [], frozen: false, idleT: 0, grab: false, mean: false }, sx: 0, sy: 0,
        grab: null, heldBy: null, grabT: 0, grabCd: 0, struggle: 0,
      })
    }
  }
  function mkStone(c, r, hp, rise) { return { c, r, hp, max: hp, rise, seed: (rng() * 1e6) | 0, gone: false, hitT: 0 } }
  function stoneAt(c, r) { return G.R.stones.find(s => !s.gone && s.c === c && s.r === r) }
  const blockedNow = (c, r) => !!stoneAt(c, r)
  const blockedSoon = (c, r) => !!stoneAt(c, r) || G.R.pending.some(p => p.c === c && p.r === r)
  const alive = () => G.R.players.filter(p => !p.out)

  // ---------- strike machine ----------
  /** Walls for the next volley. Only walls whose worst walk to cover fits the warning are fair game; when none fits, the kindest one fires. */
  function chooseSides() {
    const R = G.R, n = R.n, k = R.strike
    const warn = Math.max(T.warnFloor, T.warnStart - T.warnStep * k)
    const budget = Math.max(1, Math.floor(T.speed * warn * T.reach))
    const pick = (options) => {
      const scored = options.map(o => ({ o, w: worstWalk(n, blockedSoon, o) })).filter(x => x.w < Infinity)
      if (!scored.length) return null
      const best = Math.min(...scored.map(x => x.w)), ok = scored.filter(x => x.w <= Math.max(budget, best))
      return ok[(rng() * ok.length) | 0].o
    }
    let sides = pick([[0], [1], [2], [3]]) || [(rng() * 4) | 0]
    if (opts.haunt && R.haunt && worstWalk(n, blockedSoon, [R.haunt.side]) < Infinity) sides = [R.haunt.side]
    const wantTwo = k >= T.doubleAlways || (k >= T.doubleFrom && rng() < 0.25 + 0.06 * (k - T.doubleFrom))
    if (wantTwo) { const two = pick([0, 1, 2, 3].filter(s => s !== sides[0]).map(s => [sides[0], s])); if (two) sides = two }
    return sides
  }
  function startWarn() {
    const R = G.R
    R.sides = chooseSides(); R.hauntUsed = R.haunt; R.haunt = null
    R.phase = 'warn'; R.t = Math.max(T.warnFloor, T.warnStart - T.warnStep * R.strike)
    R.warnLen = R.t; R.ext = 0
    sfx('warn')
    for (const p of R.players) if (!p.out && !G.claimed[p.i]) {
      const b = BOT[opts.skill]
      p.bot.react = b.react[0] + rng() * (b.react[1] - b.react[0])
      p.bot.frozen = rng() < b.freeze
      p.bot.target = null; p.bot.mean = rng() < (opts.skill === 'easy' ? 0.2 : opts.skill === 'hard' ? 0.75 : 0.5)
    }
  }
  function fire() {
    const R = G.R
    R.lanes = []
    for (const s of R.sides) for (let i = 0; i < R.n; i++) R.lanes.push({ side: s, i, len: laneLen(R.n, blockedNow, s, i) })
    R.phase = 'out'; R.t = T.out
  }
  function impact() {
    const R = G.R
    R.shake = 1; sfx('thunk')
    R.crumbled = new Set()
    for (const L of R.lanes) {
      const [tx, ty] = tipPoint(L, 1)
      puff(tx, ty, 7, KA(226, 214, 180))
      if (L.len < R.n) {
        const [c, r] = cellAt(R.n, L.side, L.i, L.len)
        const st = stoneAt(c, r)
        if (st && !R.crumbled.has(st)) {
          R.crumbled.add(st); st.hitT = 0.3
          if (opts.crumble) st.hp--
          puff(tx, ty, 5, KA(120, 128, 110))
        }
      }
    }
  }
  function retract() {
    const R = G.R
    R.phase = 'back'; R.t = T.back
    for (const st of R.stones) if (!st.gone && st.hp <= 0) {
      st.gone = true; sfx('crack')
      puff(st.c + 0.5, st.r + 0.5, 16, KA(120, 128, 110))
      const free = []
      for (let r = 0; r < R.n; r++) for (let c = 0; c < R.n; c++) if (!blockedSoon(c, r) && !(c === st.c && r === st.r)) free.push([c, r])
      const inner = free.filter(([c, r]) => c > 0 && r > 0 && c < R.n - 1 && r < R.n - 1)
      const needInner = !R.stones.some(s => !s.gone && s.c > 0 && s.r > 0 && s.c < R.n - 1 && s.r < R.n - 1) && !R.pending.some(p => p.c > 0 && p.r > 0 && p.c < R.n - 1 && p.r < R.n - 1)
      const from = needInner && inner.length ? inner : free
      if (from.length) { const [c, r] = from[(rng() * from.length) | 0]; R.pending.push({ c, r, t: T.rise }) }
    }
    R.stones = R.stones.filter(s => !s.gone)
  }
  function tipPoint(L, ext) {
    const R = G.R, e = L.len * ext, m = L.i + 0.5
    if (L.side === 0) return [m, e]
    if (L.side === 2) return [m, R.n - e]
    if (L.side === 3) return [e, m]
    return [R.n - e, m]
  }
  function stakeRect(L, ext) {
    const R = G.R, e = Math.max(0, L.len * ext - 0.04), a = L.i + 0.5 - T.stakeW / 2, b = L.i + 0.5 + T.stakeW / 2
    if (L.side === 0) return [a, 0, b, e]
    if (L.side === 2) return [a, R.n - e, b, R.n]
    if (L.side === 3) return [0, a, e, b]
    return [R.n - e, a, R.n, b]
  }

  // ---------- update ----------
  function update(dt) {
    const R = G.R
    R.time += dt
    R.shake = Math.max(0, R.shake - dt * 4)
    if (R.bannerT > 0) R.bannerT -= dt
    for (const st of R.stones) { st.rise = Math.min(1, st.rise + dt * 3.5); st.hitT = Math.max(0, st.hitT - dt) }
    for (const pd of R.pending) {
      pd.t -= dt
      if (pd.t <= 0) { R.stones.push(mkStone(pd.c, pd.r, opts.crumble ? T.stoneHp : 99, 0)); sfx('land'); puff(pd.c + 0.5, pd.r + 0.5, 8, KA(226, 214, 180)) }
    }
    R.pending = R.pending.filter(p => p.t > 0)
    for (const q of R.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92 }
    R.parts = R.parts.filter(q => q.life > 0)

    if (R.done) {
      R.t -= dt
      if (R.t <= 0 && !G.over) newRound()
      movePlayers(dt)
      return
    }
    R.t -= dt
    if (R.phase === 'count') {
      if (R.t <= 0) { R.phase = 'idle'; R.t = T.gapStart; sfx('go') }
    } else if (R.phase === 'idle') {
      if (opts.coins && !R.coin && R.t < 0.5 * T.gapStart) spawnCoin()
      if (R.t <= 0) startWarn()
    } else if (R.phase === 'warn') {
      if (R.t <= 0) fire()
    } else if (R.phase === 'out') {
      R.ext = 1 - Math.pow(Math.max(0, R.t / T.out), 2)
      if (R.t <= 0) { R.ext = 1; impact(); R.phase = 'hold'; R.t = T.hold }
    } else if (R.phase === 'hold') {
      if (R.t <= 0) retract()
    } else if (R.phase === 'back') {
      const u = Math.max(0, R.t / T.back)
      R.ext = u * u * (3 - 2 * u)
      if (R.t <= 0) { R.ext = 0; R.lanes = []; R.strike++; R.phase = 'idle'; R.t = Math.max(T.gapFloor, T.gapStart - T.gapStep * R.strike); botHaunt() }
    }
    if (R.phase !== 'count') movePlayers(dt)
    if (R.phase === 'out' || R.phase === 'hold') hitTest()
    const left = alive()
    if (left.length <= 1 && R.phase !== 'count') endRound(left[0] || null)
  }
  function spawnCoin() {
    const R = G.R, free = []
    for (let r = 0; r < R.n; r++) for (let c = 0; c < R.n; c++) {
      if (blockedSoon(c, r)) continue
      if (R.players.some(p => !p.out && Math.floor(p.x) === c && Math.floor(p.y) === r)) continue
      free.push([c, r])
    }
    if (!free.length) return
    const [c, r] = free[(rng() * free.length) | 0]
    R.coin = { x: c + 0.5, y: r + 0.5, t: 0 }
  }
  function botHaunt() {
    const R = G.R
    if (!opts.haunt) return
    const ghosts = R.players.filter(p => p.out && !G.claimed[p.i])
    if (ghosts.length && !R.haunt && rng() < 0.6) R.haunt = { side: (rng() * 4) | 0, by: ghosts[(rng() * ghosts.length) | 0].i }
  }
  function endRound(winner) {
    const R = G.R
    R.done = true; R.t = 2.6
    if (winner) {
      G.wins[winner.i]++
      R.banner = winner.seat.name + ' SURVIVES'; R.bannerRgb = winner.seat.rgb
      if (G.wins[winner.i] >= T.roundsToWin) { G.over = true; R.banner = winner.seat.name + ' WINS THE MATCH' }
      sfx('win')
    } else { R.banner = 'DRAW · NOBODY SCORES'; R.bannerRgb = KA(95, 107, 81) }
    R.bannerT = 99
  }
  function stickOf(p) {
    let x = 0, y = 0
    for (const s of sticks.values()) if (s.seat === p.i && !s.grab) { x = (s.x - s.ox) / 40; y = (s.y - s.oy) / 40 }
    for (const k of (opts.mode === 'solo' ? SEATS.map(q => q.keys) : [p.seat.keys])) {
      if (keys.has(k[0])) y -= 1
      if (keys.has(k[2])) y += 1
      if (keys.has(k[3])) x -= 1
      if (keys.has(k[1])) x += 1
    }
    const m = Math.hypot(x, y)
    if (m > 1) { x /= m; y /= m }
    return m < 0.12 ? [0, 0] : [x, y]
  }
  function grabInput(p) {
    if (!opts.grab) return false
    if (!G.claimed[p.i]) return p.bot.grab
    for (const s of sticks.values()) if (s.seat === p.i && s.grab) return true
    const sets = opts.mode === 'solo' ? SEATS.map(q => q.dash) : [p.seat.dash]
    return sets.some(d => d.some(k => keys.has(k)))
  }
  function letGo(p, thrown) {
    const R = G.R, q = R.players[p.grab]
    p.grab = null; p.grabCd = T.grabCd
    if (!q) return
    q.heldBy = null
    if (thrown && !q.out) { q.kx += p.fx * T.fling; q.ky += p.fy * T.fling; sfx('dash'); puff(q.x, q.y, 5, KA(226, 214, 180)) }
    else if (!q.out) { p.kx -= p.fx * 3; p.ky -= p.fy * 3; sfx('bump'); puff(p.x, p.y, 4, [255, 255, 255]) }
  }
  function updateGrabs(dt) {
    const R = G.R
    for (const p of R.players) {
      p.grabCd = Math.max(0, p.grabCd - dt)
      const want = !p.out && !R.done && R.phase !== 'count' && grabInput(p)
      if (p.grab == null) {
        if (!want || p.grabCd > 0 || p.heldBy != null) continue
        let best = null, bd = T.radius * 2 + T.grabReach
        for (const q of R.players) {
          if (q === p || q.out || q.heldBy != null || q.grab != null) continue
          const d = Math.hypot(q.x - p.x, q.y - p.y)
          if (d < bd) { bd = d; best = q }
        }
        if (best) {
          p.grab = best.i; best.heldBy = p.i; p.grabT = 0; best.struggle = 0
          const d = Math.hypot(best.x - p.x, best.y - p.y) || 1; p.fx = (best.x - p.x) / d; p.fy = (best.y - p.y) / d
          sfx('grab')
        } else if (G.claimed[p.i]) p.grabCd = 0.25 // a miss costs a beat, not the full recharge
      } else {
        const q = R.players[p.grab]
        p.grabT += dt; q.struggle += Math.hypot(q.sx, q.sy) * dt
        if (q.out || p.out) letGo(p, false)
        else if (q.struggle >= T.grabBreak) letGo(p, false)
        else if (!want || p.grabT >= T.grabMax) letGo(p, true)
      }
    }
  }
  function movePlayers(dt) {
    const R = G.R, n = R.n
    updateGrabs(dt)
    for (const p of R.players) {
      p.inv = Math.max(0, p.inv - dt); p.squash = Math.max(0, p.squash - dt * 3)
      p.dashCd = Math.max(0, p.dashCd - dt); p.dashT = Math.max(0, p.dashT - dt)
      let [sx, sy] = G.claimed[p.i] ? stickOf(p) : botStick(p, dt)
      p.sx = sx; p.sy = sy
      if (p.out) {
        p.outT += dt
        if (opts.haunt && G.claimed[p.i] && Math.hypot(sx, sy) > 0.6 && !R.done) {
          const side = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 1 : 3) : (sy > 0 ? 2 : 0)
          R.haunt = { side, by: p.i }
        }
        continue
      }
      if (R.done && R.players.length > 1 && alive().length === 1) { sx *= 0.5; sy *= 0.5 }
      const sp = T.speed * (p.dashT > 0 ? T.dashMul : 1) * (G.claimed[p.i] ? 1 : BOT[opts.skill].speed) * (p.grab != null ? T.grabSlow : 1)
      if (p.heldBy != null) { sx = 0; sy = 0 }
      if (p.dashT > 0) { sx = p.fx; sy = p.fy }
      const a = Math.min(1, dt * 16)
      p.vx += (sx * sp - p.vx) * a; p.vy += (sy * sp - p.vy) * a
      p.kx *= Math.pow(0.0006, dt); p.ky *= Math.pow(0.0006, dt)
      p.x += (p.vx + p.kx) * dt; p.y += (p.vy + p.ky) * dt
      const v = Math.hypot(p.vx, p.vy)
      if (v > 0.3) { p.fx = p.vx / v; p.fy = p.vy / v; p.walk += dt * v * 3.2 }
    }
    const live = alive()
    for (const p of live) if (p.grab != null) {
      const q = R.players[p.grab], tx = p.x + p.fx * (T.radius * 2 + 0.02), ty = p.y + p.fy * (T.radius * 2 + 0.02), a = Math.min(1, dt * 22)
      q.x += (tx - q.x) * a; q.y += (ty - q.y) * a; q.vx = p.vx; q.vy = p.vy; q.fx = -p.fx; q.fy = -p.fy
    }
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const p = live[a], q = live[b]
      if (p.grab === q.i || q.grab === p.i) continue
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.001, min = T.radius * 2
      if (d >= min) continue
      const ux = dx / d, uy = dy / d, ov = min - d
      const pw = p.dashT > 0 ? 1 : 0, qw = q.dashT > 0 ? 1 : 0
      const share = pw === qw ? 0.5 : pw ? 0.05 : 0.95
      p.x -= ux * ov * share; p.y -= uy * ov * share; q.x += ux * ov * (1 - share); q.y += uy * ov * (1 - share)
      if (pw && !qw) { q.kx += ux * 5; q.ky += uy * 5; if (!q.bumpT || R.time - q.bumpT > 0.3) { sfx('bump'); q.bumpT = R.time; puff(q.x, q.y, 4, [255, 255, 255]) } }
      if (qw && !pw) { p.kx -= ux * 5; p.ky -= uy * 5; if (!p.bumpT || R.time - p.bumpT > 0.3) { sfx('bump'); p.bumpT = R.time; puff(p.x, p.y, 4, [255, 255, 255]) } }
    }
    for (const p of live) {
      for (const st of R.stones) if (!st.gone) pushOutOfBox(p, st.c + 0.06, st.r + 0.06, st.c + 0.94, st.r + 0.94)
      p.x = Math.min(n - T.radius, Math.max(T.radius, p.x)); p.y = Math.min(n - T.radius, Math.max(T.radius, p.y))
      if (R.coin && Math.hypot(R.coin.x - p.x, R.coin.y - p.y) < T.radius + 0.18) {
        R.coin = null; p.coins++; sfx('coin'); puff(p.x, p.y, 6, KA(240, 200, 60))
        if (p.coins >= T.coinsPerHeart && p.hp < T.maxHearts) { p.coins -= T.coinsPerHeart; p.hp++; sfx('heal') }
      }
    }
    if (R.coin) R.coin.t += dt
  }
  function pushOutOfBox(p, x0, y0, x1, y1) {
    const r = T.radius
    const cx = Math.min(x1, Math.max(x0, p.x)), cy = Math.min(y1, Math.max(y0, p.y))
    let dx = p.x - cx, dy = p.y - cy
    const d = Math.hypot(dx, dy)
    if (d >= r) return
    if (d > 0.0001) { p.x = cx + dx / d * r; p.y = cy + dy / d * r; return }
    const l = p.x - x0, rr = x1 - p.x, t = p.y - y0, b = y1 - p.y, m = Math.min(l, rr, t, b)
    if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.y = y0 - r; else p.y = y1 + r
  }
  function hitTest() {
    const R = G.R
    for (const p of alive()) {
      if (p.inv > 0) continue
      for (const L of R.lanes) {
        const [x0, y0, x1, y1] = stakeRect(L, R.ext)
        if (x1 - x0 < 0.02 || y1 - y0 < 0.02) continue
        const cx = Math.min(x1, Math.max(x0, p.x)), cy = Math.min(y1, Math.max(y0, p.y))
        if (Math.hypot(p.x - cx, p.y - cy) < T.radius * 0.92) { hurt(p); break }
      }
    }
  }
  function hurt(p) {
    const R = G.R
    if (p.grab != null) letGo(p, false)
    p.hp--; p.inv = T.invuln + T.hold; p.squash = 1; sfx('ouch'); R.shake = Math.max(R.shake, 0.7)
    if (active && G.claimed[p.i]) { try { navigator.vibrate && navigator.vibrate(p.hp <= 0 ? 120 : 40) } catch (e) { /* optional */ } }
    for (let i = 0; i < 8; i++) { const a = rng() * 6.283; R.parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, life: 0.5, max: 0.5, rgb: [255, 236, 130], star: true, s: 0.09 }) }
    if (p.hp <= 0) { p.out = true; p.outT = 0; sfx('out') }
  }
  function tryDash(i) {
    const p = G.R.players[i]
    if (!opts.shove || !p || p.out || p.dashCd > 0 || G.R.phase === 'count') return
    p.dashT = T.dashTime; p.dashCd = T.dashCd; sfx('dash'); puff(p.x - p.fx * 0.2, p.y - p.fy * 0.2, 5, KA(226, 214, 180))
  }
  function puff(x, y, k, rgb) {
    const R = G.R
    for (let i = 0; i < k; i++) { const a = rng() * 6.283, v = 0.6 + rng() * 2.2; R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + rng() * 0.3, max: 0.65, rgb, s: 0.05 + rng() * 0.08 }) }
  }

  // ---------- bots ----------
  function pathTo(n, from, goals) {
    const key = (c, r) => r * n + c, goalSet = new Set(goals.map(([c, r]) => key(c, r)))
    const prev = new Map([[key(from[0], from[1]), -1]]), q = [from]
    while (q.length) {
      const [c, r] = q.shift()
      if (goalSet.has(key(c, r))) {
        const path = []
        let k = key(c, r)
        while (k !== -1) { path.unshift([k % n, (k / n) | 0]); k = prev.get(k) }
        return path
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c2 = c + dc, r2 = r + dr
        if (c2 < 0 || r2 < 0 || c2 >= n || r2 >= n || blockedNow(c2, r2) || prev.has(key(c2, r2))) continue
        prev.set(key(c2, r2), key(c, r)); q.push([c2, r2])
      }
    }
    return null
  }
  function botStick(p, dt) {
    const R = G.R, n = R.n, b = p.bot
    if (p.out || R.done) { b.grab = false; return [0, 0] }
    if (R.phase !== 'warn') b.grab = false
    const here = [Math.min(n - 1, Math.floor(p.x)), Math.min(n - 1, Math.floor(p.y))]
    let goal = null
    if (R.phase === 'warn' || R.phase === 'out' || R.phase === 'hold') {
      if (b.frozen) return [0, 0]
      b.react -= dt
      if (b.react > 0) return [0, 0]
      const safe = safeCells(n, blockedSoon, R.sides)
      if (safe.some(([c, r]) => c === here[0] && r === here[1])) goal = [here]
      else goal = pathTo(n, here, safe)
      if (opts.shove && goal && goal.length > 1 && p.dashCd <= 0 && R.t < 0.35 && R.phase === 'warn') tryDash(p.i)
      if (opts.grab && R.phase === 'warn' && b.mean && p.heldBy == null) {
        // drag a neighbour out of cover: aim at the nearest exposed tile, let go just before the poles fire
        if (p.grab != null) {
          const q = R.players[p.grab]; b.grab = R.t > 0.1
          let best = null, bd = 99
          for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!blockedNow(c, r) && !safe.some(([sc, sr]) => sc === c && sr === r)) { const d = Math.hypot(c + 0.5 - q.x, r + 0.5 - q.y); if (d < bd) { bd = d; best = [c, r] } }
          if (best) { const dx = best[0] + 0.5 - p.x, dy = best[1] + 0.5 - p.y, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d] }
        } else if (p.grabCd <= 0 && R.t < 0.8 && R.t > 0.25) {
          b.grab = R.players.some(q => q !== p && !q.out && q.heldBy == null && Math.hypot(q.x - p.x, q.y - p.y) < T.radius * 2 + T.grabReach && safe.some(([sc, sr]) => sc === Math.floor(q.x) && sr === Math.floor(q.y)))
        } else b.grab = false
      } else b.grab = false
    } else {
      b.idleT -= dt
      if (R.coin) goal = pathTo(n, here, [[Math.floor(R.coin.x), Math.floor(R.coin.y)]])
      else if (b.idleT <= 0 || !b.roam) {
        b.idleT = 0.8 + rng() * 1.2
        const near = []
        for (const st of R.stones) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = st.c + dc, r = st.r + dr
          if (c >= 0 && r >= 0 && c < n && r < n && !blockedNow(c, r)) near.push([c, r])
        }
        b.roam = near.length ? near[(rng() * near.length) | 0] : here
      }
      if (!goal && b.roam) goal = pathTo(n, here, [b.roam])
    }
    if (!goal || !goal.length) return [0, 0]
    const next = goal.length > 1 ? goal[1] : goal[0]
    const tx = next[0] + 0.5, ty = next[1] + 0.5, dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy)
    if (d < 0.06) return [0, 0]
    return [dx / d, dy / d]
  }

  // ---------- sound ----------
  let ac = null
  function sfx(kind) {
    if (!opts.sound || !active) return
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)()
      if (ac.state === 'suspended') ac.resume()
      const t = ac.currentTime
      const tone = (type, f0, f1, dur, vol, at = 0) => {
        const o = ac.createOscillator(), g = ac.createGain()
        o.type = type; o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + at + dur)
        g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur)
        o.connect(g).connect(ac.destination); o.start(t + at); o.stop(t + at + dur + 0.02)
      }
      const noise = (dur, vol, freq) => {
        const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = buf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
        const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain()
        s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol
        s.connect(f).connect(g).connect(ac.destination); s.start(t)
      }
      if (kind === 'warn') { tone('triangle', 520, 500, 0.07, 0.12); tone('triangle', 520, 500, 0.07, 0.12, 0.14); noise(0.25, 0.08, 500) }
      else if (kind === 'thunk') { tone('sine', 130, 40, 0.22, 0.5); noise(0.16, 0.35, 900) }
      else if (kind === 'ouch') { tone('square', 420, 110, 0.22, 0.14) }
      else if (kind === 'out') { tone('square', 300, 60, 0.5, 0.14, 0.1) }
      else if (kind === 'coin') { tone('square', 880, 880, 0.06, 0.1); tone('square', 1320, 1320, 0.1, 0.1, 0.06) }
      else if (kind === 'heal') { tone('triangle', 520, 1040, 0.25, 0.16, 0.1) }
      else if (kind === 'crack') { noise(0.3, 0.3, 1600) }
      else if (kind === 'land') { tone('sine', 90, 50, 0.15, 0.4) }
      else if (kind === 'dash') { noise(0.12, 0.15, 2400) }
      else if (kind === 'bump') { tone('sine', 220, 120, 0.1, 0.3) }
      else if (kind === 'grab') { tone('square', 180, 360, 0.08, 0.14) }
      else if (kind === 'go') { tone('square', 660, 660, 0.18, 0.12) }
      else if (kind === 'win') { [523, 659, 784, 1046].forEach((f, i) => tone('square', f, f, 0.14, 0.11, i * 0.12)) }
    } catch (e) { /* sound is optional */ }
  }

  // ---------- drawing ----------
  const rgb = (c, a = 1) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'
  const mix = (c, d, t) => [0, 1, 2].map(i => Math.round(c[i] + (d[i] - c[i]) * t))
  // Every colour goes through the board's theme (window.BZT): K() retints a matcha-baseline colour, KA() the same as a triplet.
  const K = (r, g, b, a) => window.BZT.K(r, g, b, a), KA = (r, g, b) => window.BZT.KA(r, g, b)
  let INK, CARD, DANGER, BORDER
  function themeChanged() {
    const t = window.BZT.pal()
    INK = t.text; CARD = t.card; DANGER = t.danger; BORDER = t.border
    SEATS.forEach((s, i) => { s.rgb = t['p' + (i + 1)] })
  }
  themeChanged(); window.BZT.onChange(themeChanged)
  function px(u) { return u * G.R.cell }
  function ax(x) { return ARENA.x + x * G.R.cell }
  function ay(y) { return ARENA.y + y * G.R.cell }

  function draw() {
    const R = G.R, t = R.time
    ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0)
    ctx.fillStyle = K(238,240,226); ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = rgb(BORDER, 0.2)
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 1)
    drawPads()
    ctx.save()
    if (R.shake > 0) ctx.translate((Math.random() - 0.5) * 9 * R.shake * R.shake, (Math.random() - 0.5) * 9 * R.shake * R.shake)
    drawYard(t)
    drawStakes(t)
    drawFrameLip()
    ctx.restore()
    drawBanner()
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r) }

  function drawYard(t) {
    const R = G.R, n = R.n, c = R.cell, o = ARENA
    // frame
    const fx = o.x - RAIL, fs = o.s + RAIL * 2
    ctx.fillStyle = K(40,50,30,.22); rr(fx + 3, o.y - RAIL + 6, fs, fs, 12); ctx.fill()
    let g = ctx.createLinearGradient(fx, 0, fx + fs, 0)
    g.addColorStop(0, K(86,66,44)); g.addColorStop(0.5, K(112,88,58)); g.addColorStop(1, K(78,60,40))
    ctx.fillStyle = g; rr(fx, o.y - RAIL, fs, fs, 12); ctx.fill()
    ctx.strokeStyle = K(40,28,16,.35); ctx.lineWidth = 1
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(fx + 8, o.y - RAIL + 6 + i * (fs / 9)); ctx.bezierCurveTo(fx + fs * 0.3, o.y - RAIL + i * (fs / 9), fx + fs * 0.7, o.y - RAIL + 10 + i * (fs / 9), fx + fs - 8, o.y - RAIL + 4 + i * (fs / 9)); ctx.stroke() }
    // slots the poles rest in
    for (let s = 0; s < 4; s++) for (let i = 0; i < n; i++) {
      ctx.save(); sideXf(s, i)
      ctx.fillStyle = K(30,20,10,.55); rr(-c * 0.4, -RAIL + 3, c * 0.8, RAIL - 3, 5); ctx.fill()
      ctx.restore()
    }
    // warning rail
    if (R.phase === 'warn') {
      const u = 1 - R.t / R.warnLen, pulse = 0.5 + 0.5 * Math.sin(t * (16 + 22 * u))
      for (const s of R.sides) {
        ctx.save(); sideXf(s, (n - 1) / 2)
        ctx.fillStyle = rgb(DANGER, 0.3 + 0.5 * pulse); rr(-o.s / 2, -RAIL + 2, o.s, RAIL - 4, 6); ctx.fill()
        ctx.fillStyle = rgb(CARD, 0.9)
        for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 38 - 7, -RAIL + 8); ctx.lineTo(k * 38 + 7, -RAIL + 8); ctx.lineTo(k * 38, -RAIL + 19); ctx.fill() }
        ctx.restore()
      }
    }
    // sand floor
    ctx.save(); rr(o.x, o.y, o.s, o.s, 4); ctx.clip()
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      const x = o.x + q * c, y = o.y + r * c, odd = (q + r) % 2
      ctx.fillStyle = odd ? K(226,216,186) : K(234,226,198); ctx.fillRect(x, y, c, c)
      ctx.strokeStyle = K(150,130,90,.16); ctx.lineWidth = 1
      for (let k = 1; k < 6; k++) { ctx.beginPath(); if (odd) { ctx.moveTo(x + 4, y + k * c / 6); ctx.lineTo(x + c - 4, y + k * c / 6) } else { ctx.moveTo(x + k * c / 6, y + 4); ctx.lineTo(x + k * c / 6, y + c - 4) } ctx.stroke() }
      ctx.strokeStyle = K(120,104,70,.28); ctx.strokeRect(x + 0.5, y + 0.5, c - 1, c - 1)
    }
    // lane threat wash + cover shade (the read the game is about)
    if (R.phase === 'warn' && opts.hints && R.strike < 3) {
      const u = 1 - R.t / R.warnLen
      const safe = safeCells(n, blockedSoon, R.sides)
      ctx.fillStyle = rgb(DANGER, 0.1 + 0.1 * u)
      for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (!blockedSoon(q, r) && !safe.some(([a, b]) => a === q && b === r)) ctx.fillRect(o.x + q * c, o.y + r * c, c, c)
      ctx.fillStyle = K(38,123,66,.26)
      for (const [q, r] of safe) { rr(o.x + q * c + 5, o.y + r * c + 5, c - 10, c - 10, 8); ctx.fill() }
    }
    g = ctx.createLinearGradient(0, o.y, 0, o.y + 16); g.addColorStop(0, K(60,44,20,.35)); g.addColorStop(1, K(60,44,20,0))
    ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.s, 16)
    g = ctx.createLinearGradient(o.x, 0, o.x + 14, 0); g.addColorStop(0, K(60,44,20,.28)); g.addColorStop(1, K(60,44,20,0))
    ctx.fillStyle = g; ctx.fillRect(o.x, o.y, 14, o.s)
    // landing marks for new boulders
    for (const pd of R.pending) {
      const u = 1 - pd.t / T.rise, cx = ax(pd.c + 0.5), cy = ay(pd.r + 0.5)
      ctx.fillStyle = K(40,50,30,(0.12 + 0.3 * u)); ctx.beginPath(); ctx.ellipse(cx, cy, c * 0.42 * (0.4 + 0.6 * u), c * 0.36 * (0.4 + 0.6 * u), 0, 0, 6.283); ctx.fill()
      ctx.strokeStyle = rgb(INK, 0.55); ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -t * 30
      ctx.beginPath(); ctx.arc(cx, cy, c * 0.4, 0, 6.283); ctx.stroke(); ctx.setLineDash([])
    }
    if (R.coin) {
      const cx = ax(R.coin.x), cy = ay(R.coin.y), w = Math.abs(Math.cos(R.coin.t * 5)), bob = Math.sin(R.coin.t * 4) * 2
      ctx.fillStyle = K(40,50,30,.25); ctx.beginPath(); ctx.ellipse(cx, cy + 9, 8, 3.5, 0, 0, 6.283); ctx.fill()
      ctx.fillStyle = K(176,128,20); ctx.beginPath(); ctx.ellipse(cx, cy + bob, 9 * w + 1.5, 9, 0, 0, 6.283); ctx.fill()
      ctx.fillStyle = K(244,204,70); ctx.beginPath(); ctx.ellipse(cx, cy + bob - 1, 7.5 * w + 1, 7.5, 0, 0, 6.283); ctx.fill()
      ctx.fillStyle = K(255,250,210,.9); ctx.fillRect(cx - 1.5 * w, cy + bob - 5, 2 * w + 0.5, 7)
    }
    const ents = []
    for (const st of R.stones) ents.push([st.r + 0.5, 0, st])
    for (const p of R.players) if (!p.out || p.outT < 0.7) ents.push([p.y, 1, p])
    ents.sort((a, b) => a[0] - b[0])
    for (const [, kind, e] of ents) kind ? (opts.avatars && SPRITES[e.i] ? drawAvatar(e, t) : (e.out || drawDodger(e, t))) : drawBoulder(e, t)
    for (const p of R.players) if (p.grab != null && !p.out) {
      const q = R.players[p.grab], x0 = ax(p.x), y0 = ay(p.y) - px(0.16), x1 = ax(q.x), y1 = ay(q.y) - px(0.16), nx = -(y1 - y0), ny = x1 - x0, m = Math.hypot(nx, ny) || 1
      ctx.lineCap = 'round'
      for (const sgn of [-1, 1]) {
        ctx.strokeStyle = K(30,34,24,.85); ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(x0 + nx / m * 4 * sgn, y0 + ny / m * 4 * sgn); ctx.lineTo(x1 + nx / m * 5 * sgn, y1 + ny / m * 5 * sgn); ctx.stroke()
        ctx.strokeStyle = rgb(p.seat.rgb); ctx.lineWidth = 3; ctx.stroke()
      }
      const need = 1 - Math.min(1, q.struggle / T.grabBreak), left = 1 - p.grabT / T.grabMax, mx = ax(q.x), my = ay(q.y) - px(0.75)
      ctx.fillStyle = K(252,253,246,.95); rr(mx - 17, my - 5, 34, 9, 3); ctx.fill(); ctx.strokeStyle = rgb(INK, 0.6); ctx.lineWidth = 1; ctx.stroke()
      ctx.fillStyle = rgb(DANGER); ctx.fillRect(mx - 15, my - 3, 30 * need, 2.5)
      ctx.fillStyle = rgb(p.seat.rgb); ctx.fillRect(mx - 15, my + 0.5, 30 * Math.max(0, left), 1.8)
    }
    for (const q of R.parts) {
      const a = Math.max(0, q.life / q.max), x = ax(q.x), y = ay(q.y), s = px(q.s)
      ctx.fillStyle = rgb(q.rgb, a)
      if (q.star) { ctx.save(); ctx.translate(x, y); ctx.rotate(q.life * 9); ctx.fillRect(-s, -s * 0.3, s * 2, s * 0.6); ctx.fillRect(-s * 0.3, -s, s * 0.6, s * 2); ctx.restore() }
      else { ctx.beginPath(); ctx.arc(x, y, s * (1.6 - a * 0.6), 0, 6.283); ctx.fill() }
    }
    ctx.restore()
  }
  /** Local frame for a lane: origin on the yard edge at the lane centre, +y pointing into the yard. */
  function sideXf(side, i) {
    const o = ARENA, c = G.R.cell, m = (i + 0.5) * c
    if (side === 0) ctx.translate(o.x + m, o.y)
    else if (side === 1) { ctx.translate(o.x + o.s, o.y + m); ctx.rotate(Math.PI / 2) }
    else if (side === 2) { ctx.translate(o.x + m, o.y + o.s); ctx.rotate(Math.PI) }
    else { ctx.translate(o.x, o.y + m); ctx.rotate(-Math.PI / 2) }
  }
  function drawStakes(t) {
    const R = G.R, n = R.n, c = R.cell, o = ARENA
    ctx.save(); rr(o.x - RAIL + 3, o.y - RAIL + 3, o.s + RAIL * 2 - 6, o.s + RAIL * 2 - 6, 10); ctx.clip()
    const warnU = R.phase === 'warn' ? 1 - R.t / R.warnLen : 0
    for (let pass = 0; pass < 2; pass++) for (let s = 0; s < 4; s++) for (let i = 0; i < n; i++) {
      const L = R.lanes.find(l => l.side === s && l.i === i)
      const hot = R.phase === 'warn' && R.sides.includes(s)
      let tip = -3
      if (L) tip = -3 + (L.len * c - (L.len < n ? 1 : 3) + 3) * R.ext
      if (L && R.phase === 'hold') tip += Math.sin(R.t * 70) * 1.6 * (R.t / T.hold)
      if (hot) tip = -3 - 9 * Math.min(1, warnU * 1.6) + Math.sin(t * 60 + i * 2) * 1.5 * warnU
      ctx.save(); sideXf(s, i)
      if (pass === 0) { if (tip > 4) { ctx.fillStyle = K(40,50,30,.26); ctx.fillRect(-c * T.stakeW / 2 + 5, 0, c * T.stakeW, tip - 6) } }
      else pole(c * T.stakeW, tip)
      ctx.restore()
    }
    ctx.restore()
  }
  function pole(w, tip) {
    const h = w * 0.44, base = -RAIL - 8, body = tip - h
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
    g.addColorStop(0, K(84,108,40)); g.addColorStop(0.18, K(128,156,62)); g.addColorStop(0.42, K(190,208,116))
    g.addColorStop(0.52, K(214,226,150)); g.addColorStop(0.7, K(150,176,76)); g.addColorStop(1, K(72,96,36))
    ctx.fillStyle = g; ctx.fillRect(-w / 2, base, w, body - base)
    ctx.fillStyle = K(255,255,230,.35); ctx.fillRect(-w * 0.06, base, w * 0.07, body - base)
    for (let y = body - 14; y > base; y -= 52) {
      ctx.fillStyle = K(52,72,24,.85); ctx.fillRect(-w / 2 - 1, y, w + 2, 2.4)
      ctx.fillStyle = K(226,236,170,.7); ctx.fillRect(-w / 2 - 1, y + 2.4, w + 2, 1.4)
      ctx.fillStyle = K(52,72,24,.3); ctx.fillRect(-w / 2, y - 3, w, 3)
    }
    // cut point: a slanted, fire-hardened tip
    const tg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0)
    tg.addColorStop(0, K(176,160,104)); tg.addColorStop(0.5, K(240,230,186)); tg.addColorStop(1, K(150,134,84))
    ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-w / 2, body); ctx.lineTo(w / 2, body); ctx.lineTo(w * 0.06, tip); ctx.lineTo(-w * 0.06, tip); ctx.closePath(); ctx.fill()
    ctx.fillStyle = K(86,62,34); ctx.beginPath(); ctx.moveTo(-w * 0.2, tip - h * 0.34); ctx.lineTo(w * 0.2, tip - h * 0.34); ctx.lineTo(w * 0.06, tip); ctx.lineTo(-w * 0.06, tip); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = K(40,52,20,.7); ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(-w / 2, base); ctx.lineTo(-w / 2, body); ctx.lineTo(-w * 0.06, tip); ctx.lineTo(w * 0.06, tip); ctx.lineTo(w / 2, body); ctx.lineTo(w / 2, base); ctx.stroke()
  }
  function drawFrameLip() {
    const o = ARENA, fx = o.x - RAIL, fy = o.y - RAIL, fs = o.s + RAIL * 2
    ctx.save()
    ctx.beginPath(); ctx.roundRect(fx, fy, fs, fs, 12); ctx.roundRect(fx + 7, fy + 7, fs - 14, fs - 14, 7); ctx.clip('evenodd')
    const g = ctx.createLinearGradient(0, fy, 0, fy + fs)
    g.addColorStop(0, K(126,100,66)); g.addColorStop(1, K(72,54,36))
    ctx.fillStyle = g; ctx.fillRect(fx, fy, fs, fs)
    ctx.fillStyle = K(255,240,210,.22); ctx.fillRect(fx, fy, fs, 2.5)
    ctx.restore()
    ctx.strokeStyle = K(46,34,22); ctx.lineWidth = 1.5; rr(fx, fy, fs, fs, 12); ctx.stroke()
  }
  function drawBoulder(st, t) {
    const R = G.R, c = R.cell, cx = ax(st.c + 0.5), cy = ay(st.r + 0.5)
    const e = st.rise < 1 ? 1 + 0.25 * Math.sin(st.rise * Math.PI) * (1 - st.rise) : 1
    const sc = (0.2 + 0.8 * Math.min(1, st.rise * 1.3)) * e
    const jx = st.hitT > 0 ? Math.sin(t * 90) * 2 * (st.hitT / 0.3) : 0
    const rnd = mulberry32(st.seed), pts = []
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, r = c * (0.38 + rnd() * 0.07); pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.94]) }
    const shape = () => { ctx.beginPath(); for (let i = 0; i <= 9; i++) { const p = pts[i % 9], q = pts[(i + 1) % 9], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my) } ctx.closePath() }
    ctx.save(); ctx.translate(cx + jx, cy)
    ctx.save(); ctx.translate(5, 7); ctx.scale(sc, sc); ctx.fillStyle = K(40,50,30,.3); shape(); ctx.fill(); ctx.restore()
    ctx.scale(sc, sc)
    const g = ctx.createRadialGradient(-c * 0.14, -c * 0.16, c * 0.04, 0, 0, c * 0.5)
    g.addColorStop(0, K(196,200,184)); g.addColorStop(0.55, K(142,150,134)); g.addColorStop(1, K(92,100,90))
    ctx.fillStyle = g; shape(); ctx.fill()
    ctx.save(); shape(); ctx.clip()
    ctx.fillStyle = K(86,132,54,.9); ctx.beginPath(); ctx.ellipse(-c * 0.16, -c * 0.26, c * 0.3, c * 0.17, -0.5, 0, 6.283); ctx.fill()
    ctx.fillStyle = K(126,170,80,.8); ctx.beginPath(); ctx.ellipse(-c * 0.2, -c * 0.29, c * 0.16, c * 0.08, -0.5, 0, 6.283); ctx.fill()
    ctx.fillStyle = K(40,50,40,.22); ctx.beginPath(); ctx.ellipse(c * 0.12, c * 0.3, c * 0.4, c * 0.14, 0.2, 0, 6.283); ctx.fill()
    const lost = st.max > 9 ? 0 : Math.max(0, Math.min(3, T.stoneHp - st.hp))
    ctx.strokeStyle = K(30,36,30,.85); ctx.lineWidth = 1.6; ctx.lineJoin = 'round'
    const cracks = [[[-0.02, -0.4], [0.05, -0.16], [-0.06, 0.02], [0.04, 0.2]], [[0.4, -0.05], [0.18, 0], [0.1, 0.14], [-0.12, 0.18]], [[-0.4, 0.12], [-0.2, 0.06], [-0.1, -0.12]]]
    for (let k = 0; k < lost; k++) { ctx.beginPath(); cracks[k].forEach(([x, y], i) => i ? ctx.lineTo(x * c, y * c) : ctx.moveTo(x * c, y * c)); ctx.stroke() }
    ctx.restore()
    ctx.strokeStyle = K(40,46,40,.8); ctx.lineWidth = 1.6; shape(); ctx.stroke()
    ctx.restore()
  }
  function drawDodger(p, t) {
    const R = G.R, x = ax(p.x), y = ay(p.y), r = px(T.radius), col = p.seat.rgb
    if (p.inv > 0 && Math.floor(t * 14) % 2 === 0 && p.squash <= 0) ctx.globalAlpha = 0.4
    const sq = p.squash, sx = 1 + 0.35 * sq, sy = 1 - 0.3 * sq
    const moving = Math.hypot(p.vx, p.vy) > 0.3, step = Math.sin(p.walk * 2.4)
    ctx.fillStyle = K(40,50,30,.28); ctx.beginPath(); ctx.ellipse(x + 3, y + r * 0.75, r * 1.02, r * 0.5, 0, 0, 6.283); ctx.fill()
    ctx.save(); ctx.translate(x, y + (moving ? Math.abs(step) * -1.5 : Math.sin(t * 3 + p.i) * 0.6)); ctx.scale(sx, sy)
    // feet
    const ang = Math.atan2(p.fy, p.fx)
    ctx.save(); ctx.rotate(ang)
    ctx.fillStyle = rgb(mix(col, [20, 20, 20], 0.55))
    ctx.beginPath(); ctx.ellipse((moving ? step : 0) * r * 0.45, -r * 0.62, r * 0.34, r * 0.24, 0, 0, 6.283); ctx.fill()
    ctx.beginPath(); ctx.ellipse((moving ? -step : 0) * r * 0.45, r * 0.62, r * 0.34, r * 0.24, 0, 0, 6.283); ctx.fill()
    ctx.restore()
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.05)
    g.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.5))); g.addColorStop(0.5, rgb(col)); g.addColorStop(1, rgb(mix(col, [0, 0, 0], 0.35)))
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill()
    ctx.strokeStyle = rgb(mix(col, [0, 0, 0], 0.6)); ctx.lineWidth = 1.6; ctx.stroke()
    if (p.dashT > 0 || (opts.shove && p.dashCd <= 0)) { ctx.strokeStyle = rgb(CARD, p.dashT > 0 ? 0.95 : 0.55); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r + 2.5, 0, 6.283); ctx.stroke() }
    // eyes look where the dodger is heading
    const ex = p.fx * r * 0.36, ey = p.fy * r * 0.36, nx = -p.fy, ny = p.fx
    for (const sgn of [-1, 1]) {
      const cx2 = ex + nx * sgn * r * 0.36, cy2 = ey + ny * sgn * r * 0.36
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx2, cy2, r * 0.26, 0, 6.283); ctx.fill()
      ctx.fillStyle = K(30,34,24); ctx.beginPath()
      if (sq > 0.2) { ctx.fillRect(cx2 - r * 0.2, cy2 - 0.8, r * 0.4, 1.6) } else { ctx.arc(cx2 + p.fx * r * 0.09, cy2 + p.fy * r * 0.09, r * 0.13, 0, 6.283); ctx.fill() }
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }
  /** The player's own profile avatar as a standing figure: lit front, a darker side for thickness, a cast shadow. */
  function drawAvatar(p, t) {
    const R = G.R, S = SPRITES[p.i], k = R.cell * 0.62 / 22, r = px(T.radius), col = p.seat.rgb
    const x = ax(p.x), y = ay(p.y) + r * 0.55
    const moving = !p.out && Math.hypot(p.vx, p.vy) > 0.3
    if (p.fx < -0.25) p.flip = -1; else if (p.fx > 0.25) p.flip = 1
    const flip = p.flip || 1
    const won = R.done && !p.out && alive().length === 1
    const f = won ? S[Math.floor(t * 6) % 2 ? 'cheer1' : 'cheer0'] : moving ? S[['idle', 'hop1', 'hop2', 'hop1'][Math.floor(p.walk * 1.7) % 4]] : S.idle
    let alpha = 1
    if (p.out) alpha = Math.max(0, 1 - p.outT / 0.7)
    else if (p.inv > 0 && Math.floor(t * 14) % 2 === 0 && p.squash <= 0) alpha = 0.45
    ctx.save(); ctx.translate(x, y); ctx.imageSmoothingEnabled = false
    // seat ring and contact shadow on the sand
    ctx.fillStyle = K(40,50,30,0.3 * alpha); ctx.beginPath(); ctx.ellipse(1, 0, r * 1.05, r * 0.5, 0, 0, 6.283); ctx.fill()
    ctx.strokeStyle = rgb(col, alpha); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * 0.6, 0, 0, 6.283); ctx.stroke()
    if (p.dashT > 0 || (opts.shove && p.dashCd <= 0 && !p.out)) { ctx.strokeStyle = rgb(CARD, p.dashT > 0 ? 0.95 : 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.45, r * 0.75, 0, 0, 6.283); ctx.stroke() }
    // cast shadow: the silhouette laid over on the ground
    ctx.save(); ctx.globalAlpha = 0.2 * alpha; ctx.transform(1, 0, -0.75, 0.42, 0, 0); ctx.scale(flip, 1); ctx.drawImage(f.dark, -12 * k, -23 * k, 24 * k, 24 * k); ctx.restore()
    ctx.globalAlpha = alpha
    const sq = p.squash, breathe = moving ? 0 : Math.sin(t * 3 + p.i * 2) * 0.02
    if (p.out) ctx.rotate(Math.min(1, p.outT / 0.25) * 1.45 * flip)
    else if (sq > 0) ctx.rotate(Math.sin(t * 40) * 0.25 * sq)
    else if (moving) ctx.rotate(p.fx * 0.1)
    ctx.scale(flip * (1 + 0.3 * sq - breathe), 1 - 0.35 * sq + breathe)
    for (const d of [1.5, 1, 0.5]) ctx.drawImage(f.side, -12 * k + d * k * flip, -23 * k + d * k * 0.35, 24 * k, 24 * k)
    ctx.drawImage(f.lit, -12 * k, -23 * k, 24 * k, 24 * k)
    ctx.restore(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 1
  }
  function drawPads() {
    const R = G.R
    const spots = PAD_SPOTS
    for (const p of R.players) {
      const two = R.players.length === 2
      const [cx0, cy] = spots[p.seat.pad], cx = two ? W / 2 : cx0, top = cy < 300, col = p.seat.rgb
      ctx.save(); ctx.translate(cx, cy); if (top) ctx.rotate(Math.PI)
      const w = two ? 336 : 168
      ctx.fillStyle = rgb(mix(col, CARD, 0.84)); rr(-w / 2, -58, w, 116, 10); ctx.fill()
      ctx.strokeStyle = rgb(col, 0.9); ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = rgb(col, 0.35); ctx.fillRect(-w / 2 + 6, 58, w - 12, 3)
      // stick
      const px0 = two ? 96 : 34, st = [...sticks.values()].find(s => s.seat === p.i && !s.grab)
      let kx = p.sx * 20, ky = p.sy * 20
      if (top) { kx = -kx; ky = -ky }
      ctx.fillStyle = rgb(col, 0.16); ctx.beginPath(); ctx.arc(px0, 4, 38, 0, 6.283); ctx.fill()
      ctx.strokeStyle = rgb(col, 0.7); ctx.lineWidth = 2; ctx.setLineDash(st ? [] : [4, 4]); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = K(40,50,30,.25); ctx.beginPath(); ctx.arc(px0 + kx + 2, 4 + ky + 3, 17, 0, 6.283); ctx.fill()
      const g = ctx.createRadialGradient(px0 + kx - 5, ky - 2, 2, px0 + kx, 4 + ky, 18)
      g.addColorStop(0, rgb(mix(col, [255, 255, 255], 0.45))); g.addColorStop(1, rgb(mix(col, [0, 0, 0], 0.15)))
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px0 + kx, 4 + ky, 17, 0, 6.283); ctx.fill()
      // labels
      const lx = two ? -150 : -72
      ctx.fillStyle = rgb(INK); ctx.font = "9px 'Press Start 2P', ui-monospace, monospace"; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'
      ctx.fillText(G.claimed[p.i] ? (opts.mode === 'solo' ? 'YOU' : p.seat.name) : p.seat.name + ' BOT', lx, -40)
      if (opts.avatars && SPRITES[p.i]) { ctx.imageSmoothingEnabled = false; ctx.drawImage(SPRITES[p.i].bust.lit, two ? 120 : 48, -52, 30, 30); ctx.imageSmoothingEnabled = true }
      ctx.fillStyle = rgb(col); ctx.fillText('★'.repeat(G.wins[p.i]) || '', lx + (two ? 90 : 0), two ? -40 : -22)
      for (let h = 0; h < Math.max(T.hearts, p.hp); h++) heart(lx + 7 + h * 17, two ? -14 : -2, 6.5, h < p.hp ? (h >= T.hearts ? KA(200, 150, 20) : DANGER) : null)
      if (opts.coins) for (let k = 0; k < T.coinsPerHeart; k++) { ctx.fillStyle = k < p.coins ? K(226,180,40) : rgb(BORDER, 0.7); ctx.beginPath(); ctx.arc(lx + 6 + k * 13, two ? 8 : 18, 4.5, 0, 6.283); ctx.fill() }
      if (opts.grab && !p.out) {
        const bx = two ? -8 : -50, by = two ? 6 : 34, on = p.grab != null, ready = p.grabCd <= 0
        ctx.fillStyle = on ? rgb(col) : rgb(mix(col, CARD, ready ? 0.55 : 0.85)); ctx.beginPath(); ctx.arc(bx, by + (on ? 2 : 0), two ? 24 : 19, 0, 6.283); ctx.fill()
        ctx.strokeStyle = rgb(col); ctx.lineWidth = 2; ctx.stroke()
        if (!ready && !on) { ctx.strokeStyle = rgb(col, 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, (two ? 24 : 19) - 4, -1.57, -1.57 + 6.283 * (1 - p.grabCd / T.grabCd)); ctx.stroke() }
        ctx.fillStyle = on ? rgb(CARD) : rgb(INK, ready ? 1 : 0.45); ctx.font = "6px 'Press Start 2P', ui-monospace, monospace"; ctx.textAlign = 'center'; ctx.fillText(on ? 'THROW' : 'GRAB', bx + 0.5, by + (on ? 2 : 0)); ctx.textAlign = 'left'
      }
      ctx.font = "6px 'Press Start 2P', ui-monospace, monospace"; ctx.fillStyle = rgb(KA(95, 107, 81))
      if (opts.grab && !two && !p.out) { /* the button sits where the hint line would be */ }
      else if (p.heldBy != null) { ctx.fillStyle = rgb(DANGER); ctx.fillText('HELD! WRIGGLE!', lx, two ? 30 : 36) }
      else if (p.out) ctx.fillText(opts.haunt ? 'PUSH A WAY: HAUNT' : 'OUT', lx, two ? 30 : 36)
      else if (opts.shove) ctx.fillText(p.dashCd > 0 ? 'SHOVE ' + '▪'.repeat(Math.ceil(p.dashCd * 2)) : 'TAP: SHOVE', lx, two ? 30 : 36)
      else if (!G.claimed[p.i]) ctx.fillText(opts.mode === 'solo' && started ? opts.skill.toUpperCase() + ' BOT' : 'TOUCH TO TAKE OVER', lx, two ? 30 : 36)
      else if (opts.mode === 'solo') ctx.fillText('DRAG ANYWHERE', lx, two ? 30 : 36)
      ctx.restore()
    }
    // ghost marks on the rails
    if (opts.haunt && R.haunt) {
      const o = ARENA, m = o.s / 2, spot = [[o.x + m, o.y - RAIL / 2], [o.x + o.s + RAIL / 2, o.y + m], [o.x + m, o.y + o.s + RAIL / 2], [o.x - RAIL / 2, o.y + m]][R.haunt.side]
      R.ghostAt = spot; R.ghostBy = R.haunt.by
    } else R.ghostAt = null
  }
  function heart(x, y, s, col) {
    ctx.save(); ctx.translate(x, y)
    ctx.beginPath(); ctx.moveTo(0, s * 0.9); ctx.bezierCurveTo(-s * 1.5, -s * 0.2, -s * 0.7, -s * 1.2, 0, -s * 0.35); ctx.bezierCurveTo(s * 0.7, -s * 1.2, s * 1.5, -s * 0.2, 0, s * 0.9)
    if (col) { ctx.fillStyle = rgb(col); ctx.fill(); ctx.fillStyle = K(255,255,255,.5); ctx.fillRect(-s * 0.55, -s * 0.5, s * 0.3, s * 0.3) }
    else { ctx.strokeStyle = rgb(BORDER); ctx.lineWidth = 1.5; ctx.stroke() }
    ctx.restore()
  }
  function drawBanner() {
    const R = G.R, o = ARENA, cx = o.x + o.s / 2, cy = o.y + o.s / 2
    if (R.ghostAt) {
      const [gx, gy] = R.ghostAt, col = SEATS[R.ghostBy].rgb, b = Math.sin(R.time * 6) * 2
      ctx.fillStyle = rgb(mix(col, [255, 255, 255], 0.55), 0.95); ctx.beginPath(); ctx.arc(gx, gy + b - 2, 9, Math.PI, 0); ctx.lineTo(gx + 9, gy + b + 8); ctx.lineTo(gx + 4.5, gy + b + 5); ctx.lineTo(gx, gy + b + 8); ctx.lineTo(gx - 4.5, gy + b + 5); ctx.lineTo(gx - 9, gy + b + 8); ctx.closePath(); ctx.fill()
      ctx.strokeStyle = rgb(mix(col, [0, 0, 0], 0.4)); ctx.lineWidth = 1.4; ctx.stroke()
      ctx.fillStyle = rgb(INK); ctx.fillRect(gx - 4, gy + b - 3, 2.5, 3); ctx.fillRect(gx + 1.5, gy + b - 3, 2.5, 3)
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const plate = (text, sub, col) => {
      ctx.fillStyle = K(252,253,246,.94); rr(cx - 132, cy - 34, 264, sub ? 78 : 60, 8); ctx.fill()
      ctx.strokeStyle = rgb(col); ctx.lineWidth = 3; ctx.stroke()
      ctx.fillStyle = K(160,170,140,1); ctx.fillRect(cx - 126, cy + (sub ? 44 : 26), 252, 3)
      ctx.fillStyle = rgb(col); ctx.font = "11px 'Press Start 2P', ui-monospace, monospace"; ctx.fillText(text, cx, cy - 6)
      if (sub) { ctx.fillStyle = rgb(KA(95, 107, 81)); ctx.font = "7px 'Press Start 2P', ui-monospace, monospace"; ctx.fillText(sub, cx, cy + 22) }
    }
    if (!started) { ctx.save(); ctx.translate(0, 112); plate(opts.mode === 'solo' ? 'TAP TO PLAY THE BOT' : 'TAP TO PLAY', opts.mode === 'solo' ? 'DRAG ANYWHERE · OR ARROW KEYS' : 'A STRIP EACH · ARROWS + WASD', KA(130, 95, 14)); ctx.restore() }
    else if (!active) plate('PAUSED · TAP', 'ARROWS + WASD ON A KEYBOARD', KA(130, 95, 14))
    else if (R.phase === 'count') {
      const k = Math.ceil(R.t - 0.2), s = 1 + (R.t % 1) * 0.5
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s)
      ctx.font = "46px 'Press Start 2P', ui-monospace, monospace"; ctx.fillStyle = K(252,253,246,.9); ctx.fillText(k > 3 ? '' : String(Math.max(1, k)), 3, 3)
      ctx.fillStyle = rgb(INK); ctx.fillText(k > 3 ? '' : String(Math.max(1, k)), 0, 0); ctx.restore()
      ctx.font = "8px 'Press Start 2P', ui-monospace, monospace"; ctx.fillStyle = rgb(INK)
      ctx.fillStyle = K(252,253,246,.9); rr(cx - 110, o.y + 12, 220, 22, 5); ctx.fill()
      ctx.fillStyle = rgb(INK); ctx.fillText('ROUND ' + G.round + ' · GET BEHIND A ROCK', cx, o.y + 24)
      if (opts.mode === 'solo') { const me = R.players[0], mx = ax(me.x), my = ay(me.y) - px(0.62) - 14 + Math.sin(R.time * 8) * 3; ctx.fillStyle = K(252,253,246,.95); rr(mx - 20, my - 9, 40, 16, 4); ctx.fill(); ctx.fillStyle = rgb(me.seat.rgb); ctx.font = "8px 'Press Start 2P', ui-monospace, monospace"; ctx.fillText('YOU', mx + 1, my); ctx.beginPath(); ctx.moveTo(mx - 5, my + 7); ctx.lineTo(mx + 5, my + 7); ctx.lineTo(mx, my + 13); ctx.fill() }
    } else if (R.done) plate(R.banner, G.over ? 'TAP FOR A REMATCH' : 'NEXT ROUND…', R.bannerRgb)
  }

  // ---------- input ----------
  function logical(e) { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / b.width * W, (e.clientY - b.top) / b.height * H] }
  const PAD_SPOTS = { br: [270, 572], bl: [90, 572], tl: [90, 68], tr: [270, 68] }
  /** Centre of a seat's GRAB button in canvas space. */
  function grabSpot(i) {
    const two = G.R.players.length === 2, seat = SEATS[i], [cx0, cy] = PAD_SPOTS[seat.pad], cx = two ? W / 2 : cx0, top = cy < 300
    const lx = two ? -8 : -50, ly = two ? 6 : 34
    return top ? [cx - lx, cy - ly] : [cx + lx, cy + ly]
  }
  function seatAt(x, y) {
    const n = G.R.players.length, top = y < 140, bottom = y > 500
    if (!top && !bottom) return -1
    if (n === 2) return bottom ? 0 : 1
    const leftHalf = x < W / 2
    const i = bottom ? (leftHalf ? 3 : 0) : (leftHalf ? 1 : 2)
    return i < n ? i : -1
  }
  cv.addEventListener('pointerdown', e => {
    e.preventDefault()
    const [x, y] = logical(e)
    if (!started) { started = true; active = true; cv.focus({ preventScroll: true }); G = { claimed: [true, false, false, false] }; newMatch(); return }
    if (!active) { active = true; cv.focus({ preventScroll: true }); return }
    if (G.over && G.R.t <= 0.8) { newMatch(); return }
    const seat = opts.mode === 'solo' ? 0 : seatAt(x, y)
    if (seat < 0) return
    G.claimed[seat] = true
    if (opts.grab) {
      const [gx, gy] = grabSpot(seat)
      const second = opts.mode === 'solo' && [...sticks.values()].some(q => q.seat === 0 && !q.grab)
      if (Math.hypot(x - gx, y - gy) < 30 || e.button === 2 || second) {
        try { cv.setPointerCapture(e.pointerId) } catch (err) { /* fine */ }
        sticks.set(e.pointerId, { seat, grab: true, ox: x, oy: y, x, y, t0: performance.now(), moved: true }); return
      }
    }
    try { cv.setPointerCapture(e.pointerId) } catch (err) { /* fine */ }
    sticks.set(e.pointerId, { seat, ox: x, oy: y, x, y, t0: performance.now(), moved: false })
  })
  cv.addEventListener('pointermove', e => {
    const s = sticks.get(e.pointerId); if (!s || s.grab) return
    const [x, y] = logical(e); s.x = x; s.y = y
    if (Math.hypot(x - s.ox, y - s.oy) > 9) s.moved = true
    const d = Math.hypot(x - s.ox, y - s.oy)
    if (d > 44) { s.ox = x - (x - s.ox) / d * 44; s.oy = y - (y - s.oy) / d * 44 } // the pad follows a thumb that drifts
  })
  const up = e => {
    const s = sticks.get(e.pointerId); if (!s) return
    sticks.delete(e.pointerId)
    if (!s.moved && performance.now() - s.t0 < 220) tryDash(s.seat)
  }
  cv.addEventListener('contextmenu', e => e.preventDefault())
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up)
  window.addEventListener('pointerdown', e => { if (e.target !== cv && active && !e.target.closest('.bz-ui')) { active = false; keys.clear() } })
  window.addEventListener('keydown', e => {
    if (!active || (e.target.matches && e.target.matches('input, textarea, select'))) return
    for (let i = 0; i < SEATS.length; i++) {
      const seat = opts.mode === 'solo' ? 0 : i
      if (SEATS[i].keys.includes(e.code)) { keys.add(e.code); if (G.R.players[seat]) G.claimed[seat] = true; e.preventDefault() }
      if (SEATS[i].dash.includes(e.code)) { keys.add(e.code); if (!e.repeat) tryDash(seat); e.preventDefault() }
    }
    if (G.over && e.code === 'Enter') newMatch()
  })
  window.addEventListener('keyup', e => keys.delete(e.code))
  window.addEventListener('blur', () => { keys.clear(); sticks.clear() })

  // ---------- controls outside the canvas ----------
  function bind() {
    document.querySelectorAll('[data-bz-players]').forEach(b => b.addEventListener('click', () => { opts.players = +b.dataset.bzPlayers; sync(); restart() }))
    document.querySelectorAll('[data-bz-skill]').forEach(b => b.addEventListener('click', () => { opts.skill = b.dataset.bzSkill; sync() }))
    document.querySelectorAll('[data-bz-mode]').forEach(b => b.addEventListener('click', () => { opts.mode = b.dataset.bzMode; sync(); restart() }))
    document.querySelectorAll('[data-bz-go]').forEach(b => b.addEventListener('click', () => {
      opts.mode = 'solo'; opts.players = +b.dataset.bzGo; started = true; active = true; sync(); restart()
      cv.focus({ preventScroll: true }); cv.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }))
    document.querySelectorAll('[data-bz-opt]').forEach(c => c.addEventListener('change', () => {
      opts[c.dataset.bzOpt] = c.checked
      document.querySelectorAll('[data-bz-opt="' + c.dataset.bzOpt + '"]').forEach(o => { o.checked = c.checked })
      if (!['sound', 'hints', 'avatars'].includes(c.dataset.bzOpt)) restart()
    }))
    document.querySelectorAll('[data-bz-try]').forEach(b => b.addEventListener('click', () => {
      const on = b.dataset.bzTry.split(',')
      for (const k of ['crumble', 'coins', 'shove', 'grab', 'haunt']) { opts[k] = on.includes(k); document.querySelectorAll('[data-bz-opt="' + k + '"]').forEach(o => { o.checked = opts[k] }) }
      if (b.dataset.bzPlayersSet) opts.players = +b.dataset.bzPlayersSet
      started = true; active = true; sync(); restart()
      document.getElementById('play').scrollIntoView({ behavior: 'smooth', block: 'start' })
    }))
    sync()
  }
  function sync() {
    document.querySelectorAll('[data-bz-players]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.bzPlayers === opts.players)))
    document.querySelectorAll('[data-bz-skill]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bzSkill === opts.skill)))
    document.querySelectorAll('[data-bz-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bzMode === opts.mode)))
  }
  function restart() { const c = G.claimed; G = { claimed: started ? [true, opts.mode !== 'solo' && c[1], false, false] : [false, false, false, false] }; newMatch() }

  function size() {
    const dpr = Math.min(3, window.devicePixelRatio || 1), b = cv.getBoundingClientRect()
    const w = Math.round(b.width * dpr), h = Math.round(b.width * dpr * H / W)
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
  }
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0); last = now
    size()
    if (active || !started) { const steps = 2; for (let i = 0; i < steps; i++) update(dt / steps); if (!started && G.over && G.R.t <= 0) newMatch() } else { G.R.time += dt }
    draw(); drawFigure(now / 1000)
    requestAnimationFrame(frame)
  }
  newMatch(); bind()
  // Section 3b figure: the same kit sprites, flat, stood up, and moving.
  const av = document.getElementById('bz-av')
  function drawFigure(t) {
    if (!av || !SPRITES.length) return
    const dpr = Math.min(3, window.devicePixelRatio || 1), b = av.getBoundingClientRect(), w = Math.round(b.width * dpr)
    if (!w) return
    if (av.width !== w) { av.width = w; av.height = Math.round(w * 200 / 720) }
    const c = av.getContext('2d'); c.setTransform(av.width / 720, 0, 0, av.width / 720, 0, 0); c.imageSmoothingEnabled = false
    c.fillStyle = K(246,248,236); c.fillRect(0, 0, 720, 200)
    const label = (x, text) => { c.fillStyle = K(95,107,81); c.font = "8px 'Press Start 2P', ui-monospace, monospace"; c.textAlign = 'center'; c.fillText(text, x, 188) }
    const sand = (x) => { c.fillStyle = K(232,222,192); c.beginPath(); c.roundRect(x - 104, 96, 208, 64, 8); c.fill(); c.strokeStyle = K(120,104,70,.3); c.strokeRect(x - 104.5, 96.5, 208, 64) }
    // 1 flat kit art on a pixel grid
    for (let i = 0; i < 4; i++) {
      const x = 22 + i * 50
      c.fillStyle = K(252,253,246); c.fillRect(x, 64, 48, 48); c.strokeStyle = K(185,195,165); c.strokeRect(x + .5, 64.5, 47, 47)
      c.drawImage(SPRITES[i].idle.lit, x, 64, 48, 48)
    }
    label(120, '1 · PROFILE AVATAR, FLAT')
    c.fillStyle = K(130,95,14); c.font = "16px 'Press Start 2P', ui-monospace, monospace"; c.textAlign = 'center'; c.fillText('>', 240, 96); c.fillText('>', 480, 96)
    // 2 stood up: side + cast shadow
    sand(360)
    for (let i = 0; i < 4; i++) {
      const x = 285 + i * 50, y = 140, k = 2, f = SPRITES[i].idle
      c.fillStyle = K(40,50,30,.3); c.beginPath(); c.ellipse(x + 1, y, 15, 7, 0, 0, 6.283); c.fill()
      c.save(); c.translate(x, y); c.globalAlpha = .2; c.transform(1, 0, -0.75, 0.42, 0, 0); c.drawImage(f.dark, -24, -46, 48, 48); c.restore()
      for (const d of [1.5, 1, 0.5]) c.drawImage(f.side, x - 24 + d * k, y - 46 + d * k * 0.35, 48, 48)
      c.drawImage(f.lit, x - 24, y - 46, 48, 48)
    }
    label(360, '2 · STOOD UP, WITH DEPTH')
    // 3 alive: hop, flip, squash, cheer
    sand(600)
    const acts = ['run', 'cheer', 'hit', 'run']
    for (let i = 0; i < 4; i++) {
      const y = 140, k = 2, S = SPRITES[i], act = acts[i]
      let x = 525 + i * 50, f = S.idle, flip = 1, sq = 0
      if (act === 'run') { const ph = (t * 0.6 + i * 0.4) % 2; x += (ph < 1 ? ph : 2 - ph) * 30 - 15; flip = ph < 1 ? 1 : -1; f = S[['idle', 'hop1', 'hop2', 'hop1'][Math.floor(t * 8) % 4]] }
      if (act === 'cheer') f = S[Math.floor(t * 6) % 2 ? 'cheer1' : 'cheer0']
      if (act === 'hit') sq = Math.max(0, 1 - ((t * 0.7) % 1) * 2.2)
      c.fillStyle = K(40,50,30,.3); c.beginPath(); c.ellipse(x + 1, y, 15, 7, 0, 0, 6.283); c.fill()
      c.save(); c.translate(x, y); c.globalAlpha = .2; c.transform(1, 0, -0.75, 0.42, 0, 0); c.scale(flip, 1); c.drawImage(f.dark, -24, -46, 48, 48); c.restore()
      c.save(); c.translate(x, y); if (sq > 0) c.rotate(Math.sin(t * 40) * 0.25 * sq); else if (act === 'run') c.rotate(flip * 0.1)
      c.scale(flip * (1 + 0.3 * sq), 1 - 0.35 * sq)
      for (const d of [1.5, 1, 0.5]) c.drawImage(f.side, -24 + d * k * flip, -46 + d * k * 0.35, 48, 48)
      c.drawImage(f.lit, -24, -46, 48, 48); c.restore()
    }
    label(600, '3 · RUN, CHEER, GET HIT')
  }
  window.__bz = { freeze(v) { started = true; active = !v }, get G() { return G }, opts, start() { started = true; active = true; newMatch() }, step(dt) { update(dt) }, rules: { cellAt, laneLen, safeCells } }
  requestAnimationFrame(frame)
})()
