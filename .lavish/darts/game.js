/* STEADY HAND — playable prototype of the darts core loop for the Game Night
   design board. Self-contained: one canvas for the stage, DOM for the HUD.
   Nothing here is shipped code; the real build would split this into
   dartsLogic.js (pure, tested) and a page. Distances are board millimetres. */
(() => {
  'use strict'
  const TAU = Math.PI * 2
  const SECT = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
  // Arcade board: same layout as a real clock board, with the treble, double
  // and bull widened so a thumb can hit them (real: 8 mm rings, 6.35 mm bull).
  const R = { bull: 9, obull: 22, ti: 92, to: 110, di: 154, dbl: 170, edge: 226 }
  const SEATS = [
    { name: 'P1', rgb: [86, 168, 62], tint: 'p1' },
    { name: 'P2', rgb: [158, 112, 222], tint: 'p2' },
    { name: 'P3', rgb: [222, 84, 150], tint: 'p3' },
    { name: 'P4', rgb: [52, 150, 214], tint: 'p4' },
  ]
  // The stage is drawn from the active Game Night theme's tokens, so the board
  // changes with the theme like every other screen. The sisal grain, wire
  // glints and brass barrels are material, and stay the same on every theme.
  const THEMES = window.GN_THEMES || []
  let T = THEMES.find(t => t.id === 'matcha') || THEMES[0]
  const rgbs = (a) => `rgb(${a.join(',')})`
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
  const lum = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
  const isLight = () => lum(T.bg) > 140
  const AIM_START_MM = 45 // starting value: how far from the touch the aim may begin
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  const $ = (s) => document.querySelector(s)
  const cv = $('#stage'), ctx = cv.getContext('2d')
  const screenEl = $('#screen'), seatsEl = $('#seats'), statusEl = $('#status'), chipsEl = $('#chips')
  const lobbyEl = $('#lobby'), overEl = $('#over'), bannerEl = $('#banner'), throwBtn = $('#throwBtn')
  let W = 348, H = 420, dpr = 1
  const VC = { x: 174, y: 176 }
  const S_MM = 0.69 // screen px per mm at zoom 1

  // ---------- pure rules ----------
  function segmentAt(x, y) {
    const r = Math.hypot(x, y)
    if (r <= R.bull) return { v: 50, ring: 'B', n: 25, key: 'B', label: 'BULL' }
    if (r <= R.obull) return { v: 25, ring: 'O', n: 25, key: 'O', label: '25' }
    if (r > R.dbl) return { v: 0, ring: 'M', n: 0, key: 'M', label: 'MISS' }
    const a = (Math.atan2(x, -y) + TAU + TAU / 40) % TAU
    const idx = Math.floor(a / (TAU / 20)), n = SECT[idx]
    if (r >= R.ti && r <= R.to) return { v: n * 3, ring: 'T', n, idx, key: 'T' + n, label: 'T' + n }
    if (r >= R.di) return { v: n * 2, ring: 'D', n, idx, key: 'D' + n, label: 'D' + n }
    return { v: n, ring: 'S', n, idx, key: 'S' + n, label: '' + n }
  }
  function finishers(rem) {
    const out = []
    if (rem === 50) out.push({ ring: 'B' })
    if (rem === 25) out.push({ ring: 'O' })
    SECT.forEach((n, idx) => {
      if (n === rem) out.push({ ring: 'S', idx, n })
      if (n * 2 === rem) out.push({ ring: 'D', idx, n })
      if (n * 3 === rem) out.push({ ring: 'T', idx, n })
    })
    return out
  }
  const finLabel = (f) => f.ring === 'B' ? 'BULL' : f.ring === 'O' ? '25' : (f.ring === 'S' ? '' : f.ring) + f.n
  function targetPoint(f) {
    if (f.ring === 'B' || f.ring === 'O') return f.ring === 'B' ? [0, 0] : [0, -15]
    const a = f.idx * TAU / 20
    const r = f.ring === 'T' ? (R.ti + R.to) / 2 : f.ring === 'D' ? (R.di + R.dbl) / 2 : (R.to + R.di) / 2
    return [Math.sin(a) * r, -Math.cos(a) * r]
  }
  const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += Math.random(); return (u - 2) * 1.73 }

  // ---------- state ----------
  const opts = { theme: 'matcha', n: 2, bot: false, mode: 'x01', start: 101, ctrl: 'aim', table: 'pass', nerves: true, knock: false, balloon: false, botLevel: 1 }
  const G = {}
  const cam = { x: 0, y: 0, z: 1 }, camT = { x: 0, y: 0, z: 1 }
  let shake = 0, particles = [], popups = [], confetti = [], lobbyOpen = true
  let boardImg = null

  function reset() {
    G.players = SEATS.slice(0, opts.n).map((s, i) => ({ ...s, name: opts.bot && i === 1 ? 'BOT' : s.name, bot: opts.bot && i === 1, score: opts.mode === 'x01' ? opts.start : 0, thrown: 0, bonus: 0 }))
    G.cur = 0; G.dartsLeft = 3; G.visit = []; G.visitStart = G.players[0].score
    G.round = 1; G.maxRounds = 5; G.stuck = []; G.ghosts = []
    G.turf = Array.from({ length: 20 }, () => null)
    G.phase = lobbyOpen ? 'lobby' : 'idle'; G.aim = { x: 0, y: 0 }; G.t0 = 0; G.fly = null; G.winner = null
    G.steady = false; G.balloon = null; G.lock = null; G.wob = { x: 0, y: 0, r: 0 }
    particles = []; popups = []; confetti = []
    overEl.hidden = true; bannerEl.classList.remove('on')
    camT.x = camT.y = 0; camT.z = 1
    screenEl.classList.remove('flip')
    lobbyEl.hidden = !lobbyOpen
    spawnBalloon(); renderHud(); setStatus()
    if (G.players[0].bot && !lobbyOpen) botTurn()
  }
  const me = () => G.players[G.cur]
  function nervesMul(i) {
    if (!opts.nerves || G.players.length < 2) return 1
    const key = (p) => opts.mode === 'x01' ? -p.score : turfScore(G.players.indexOf(p))
    const ranked = [...G.players].sort((a, b) => key(b) - key(a))
    const top = key(ranked[0]), low = key(ranked[ranked.length - 1])
    if (top === low) return 1
    const lead = (key(G.players[i]) - low) / (top - low) // 1 = leading, 0 = last
    return 0.85 + 0.4 * lead
  }
  const turfScore = (i) => G.turf.filter(t => t && t.owner === i).length + G.players[i].bonus

  // ---------- audio ----------
  let ac = null, muted = false
  function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)() } catch (e) { ac = null } } if (ac && ac.state === 'suspended') ac.resume(); return ac }
  function tone(f, d, type = 'sine', g = 0.12, slide = 0) {
    const a = audio(); if (!a || muted) return
    const o = a.createOscillator(), v = a.createGain(), t = a.currentTime
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d)
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0008, t + d)
    o.connect(v).connect(a.destination); o.start(t); o.stop(t + d + 0.02)
  }
  function noise(d, freq, g = 0.25) {
    const a = audio(); if (!a || muted) return
    const b = a.createBuffer(1, a.sampleRate * d, a.sampleRate), ch = b.getChannelData(0)
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length) ** 2
    const s = a.createBufferSource(), f = a.createBiquadFilter(), v = a.createGain()
    s.buffer = b; f.type = 'lowpass'; f.frequency.value = freq; v.gain.value = g
    s.connect(f).connect(v).connect(a.destination); s.start()
  }
  const sfx = {
    whoosh: () => noise(0.16, 2600, 0.07),
    thunk: (big) => { noise(0.09, big ? 900 : 1500, 0.4); tone(big ? 110 : 150, 0.14, 'sine', 0.3, -70) },
    miss: () => { noise(0.12, 500, 0.3); tone(90, 0.2, 'triangle', 0.15, -40) },
    bust: () => { tone(196, 0.16, 'square', 0.08); setTimeout(() => tone(147, 0.3, 'square', 0.08), 140) },
    lock: () => tone(660, 0.05, 'square', 0.05),
    nice: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.06), i * 70)),
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'square', 0.07), i * 110)),
    pop: () => { noise(0.07, 4000, 0.35); tone(880, 0.08, 'square', 0.05, 500) },
  }
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms) } catch (e) { /* no haptics */ } }

  // ---------- board texture (drawn once) ----------
  function sector(g, i, r0, r1) {
    const a0 = -Math.PI / 2 + (i - 0.5) * TAU / 20, a1 = a0 + TAU / 20
    g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath()
  }
  function buildBoard() {
    const k = S_MM * 1.75 * Math.min(dpr, 2.5), pad = 34, size = Math.ceil((R.edge + pad) * 2 * k)
    const c = document.createElement('canvas'); c.width = c.height = size
    const g = c.getContext('2d'); g.translate(size / 2, size / 2); g.scale(k, k)
    // rubber surround
    let gr = g.createRadialGradient(-60, -80, 40, 0, 0, R.edge + pad)
    const light = isLight(), rim = light ? T.text : mix(T.card, T.border, 0.35), numCol = light ? T.card : T.text
    const C = { a: T.text, b: T.card, red: T.danger, green: T.win }
    gr.addColorStop(0, rgbs(mix(rim, [255, 255, 255], 0.12))); gr.addColorStop(1, rgbs(mix(rim, [0, 0, 0], 0.45)))
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R.edge + pad - 4, 0, TAU); g.fill()
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, R.edge + pad - 6, 0, TAU); g.stroke()
    // number ring
    gr = g.createRadialGradient(-50, -70, 20, 0, 0, R.edge)
    gr.addColorStop(0, rgbs(mix(rim, [255, 255, 255], 0.06))); gr.addColorStop(1, rgbs(mix(rim, [0, 0, 0], 0.3)))
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R.edge, 0, TAU); g.fill()
    for (let i = 0; i < 20; i++) {
      const dark = i % 2 === 0
      g.fillStyle = rgbs(dark ? C.red : C.green); sector(g, i, R.di, R.dbl); g.fill(); sector(g, i, R.ti, R.to); g.fill()
      g.fillStyle = rgbs(dark ? C.a : C.b); sector(g, i, R.to, R.di); g.fill(); sector(g, i, R.obull, R.ti); g.fill()
    }
    g.fillStyle = rgbs(C.green); g.beginPath(); g.arc(0, 0, R.obull, 0, TAU); g.fill()
    g.fillStyle = rgbs(C.red); g.beginPath(); g.arc(0, 0, R.bull, 0, TAU); g.fill()
    // sisal: fine radial fibres and speckle, clipped to the playing face
    g.save(); g.beginPath(); g.arc(0, 0, R.dbl, 0, TAU); g.clip()
    for (let i = 0; i < 5200; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * R.dbl, l = 1.5 + Math.random() * 4
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.055)' : 'rgba(0,0,0,.09)'; g.lineWidth = 0.35
      g.beginPath(); g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(Math.cos(a + 0.004 * gauss()) * (r + l), Math.sin(a + 0.004 * gauss()) * (r + l)); g.stroke()
    }
    // old dart holes around the trebles
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * TAU, r = 40 + Math.random() * 125
      g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.5 + Math.random() * 0.5, 0, TAU); g.fill()
    }
    gr = g.createRadialGradient(-70, -95, 10, 0, 0, R.dbl * 1.15)
    gr.addColorStop(0, 'rgba(255,244,214,.20)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.34)')
    g.fillStyle = gr; g.fillRect(-R.dbl, -R.dbl, R.dbl * 2, R.dbl * 2)
    g.restore()
    // wire spider: shadow, steel, glint
    const wires = (dx, dy, col, w) => {
      g.save(); g.translate(dx, dy); g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'
      for (const r of [R.bull, R.obull, R.ti, R.to, R.di, R.dbl]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke() }
      for (let i = 0; i < 20; i++) { const a = (i - 0.5) * TAU / 20; g.beginPath(); g.moveTo(Math.sin(a) * R.obull, -Math.cos(a) * R.obull); g.lineTo(Math.sin(a) * (R.dbl + 3), -Math.cos(a) * (R.dbl + 3)); g.stroke() }
      g.restore()
    }
    wires(0.9, 1.3, 'rgba(0,0,0,.55)', 1.5); wires(0, 0, rgbs(mix(T.structure, [200, 205, 210], 0.55)), 1.25); wires(-0.25, -0.3, 'rgba(255,255,255,.75)', 0.45)
    // numbers
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = '300 31px "Helvetica Neue", Helvetica, Arial, sans-serif'
    SECT.forEach((n, i) => {
      const a = i * TAU / 20; g.save(); g.translate(Math.sin(a) * 198, -Math.cos(a) * 198); g.rotate(a)
      g.fillStyle = light ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.8)'; g.fillText(n, 1, 1.4); g.fillStyle = rgbs(numCol); g.fillText(n, 0, 0); g.restore()
    })
    g.strokeStyle = col(light ? T.card : T.border, 0.6); g.lineWidth = 1; g.beginPath(); g.arc(0, 0, R.edge - 5, 0, TAU); g.stroke()
    boardImg = c; boardImg._half = R.edge + pad
  }

  // ---------- drawing ----------
  const col = (rgb, a = 1, l = 0) => `rgba(${rgb.map(v => Math.round(v + (255 - v) * l)).join(',')},${a})`
  function world(fn) {
    const k = S_MM * cam.z, ox = VC.x - cam.x * k + (Math.random() - 0.5) * shake, oy = VC.y - cam.y * k + (Math.random() - 0.5) * shake
    ctx.save(); ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy); fn(); ctx.restore()
  }
  const w2s = (x, y) => { const k = S_MM * cam.z; return [VC.x + (x - cam.x) * k, VC.y + (y - cam.y) * k] }

  function dartShape(g, L, rgb, shadow) {
    // drawn along +x from the tip at the origin
    if (shadow) { g.strokeStyle = 'rgba(0,0,0,.34)'; g.lineCap = 'round'; g.lineWidth = L * 0.07; g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.94, 0); g.stroke(); g.lineWidth = L * 0.2; g.beginPath(); g.moveTo(L * 0.76, 0); g.lineTo(L * 0.95, 0); g.stroke(); return }
    g.lineCap = 'butt'
    g.strokeStyle = '#dfe4e8'; g.lineWidth = Math.max(1, L * 0.022); g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.2, 0); g.stroke()
    const bw = L * 0.085, gr = g.createLinearGradient(0, -bw / 2, 0, bw / 2)
    gr.addColorStop(0, '#f6e3a4'); gr.addColorStop(0.35, '#c79a3d'); gr.addColorStop(1, '#6d4f17')
    g.fillStyle = gr; g.beginPath(); g.roundRect(L * 0.18, -bw / 2, L * 0.33, bw, bw * 0.3); g.fill()
    g.strokeStyle = 'rgba(60,40,8,.55)'; g.lineWidth = Math.max(0.6, L * 0.008)
    for (let i = 0; i < 6; i++) { const x = L * (0.23 + i * 0.045); g.beginPath(); g.moveTo(x, -bw / 2); g.lineTo(x, bw / 2); g.stroke() }
    g.strokeStyle = '#2a2a2c'; g.lineWidth = L * 0.03; g.beginPath(); g.moveTo(L * 0.5, 0); g.lineTo(L * 0.74, 0); g.stroke()
    const f = () => { g.beginPath(); g.moveTo(L * 0.66, 0); g.lineTo(L * 0.79, -L * 0.115); g.lineTo(L, -L * 0.115); g.lineTo(L * 0.93, 0); g.lineTo(L, L * 0.115); g.lineTo(L * 0.79, L * 0.115); g.closePath() }
    f(); g.fillStyle = col(rgb); g.fill()
    g.save(); f(); g.clip(); g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(L * 0.6, -L * 0.13, L * 0.5, L * 0.13); g.restore()
    f(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = Math.max(0.7, L * 0.012); g.stroke()
    g.beginPath(); g.moveTo(L * 0.68, 0); g.lineTo(L * 0.95, 0); g.stroke()
  }
  function drawDart(tx, ty, ang, L, rgb, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha
    ctx.save(); ctx.translate(tx + L * 0.1, ty + L * 0.14); ctx.rotate(ang + 0.12); dartShape(ctx, L, rgb, true); ctx.restore()
    ctx.translate(tx, ty); ctx.rotate(ang); dartShape(ctx, L, rgb, false); ctx.restore()
  }
  const glyph = (g, i, x, y, r) => { // seat shape, so colour is never the only cue
    g.beginPath()
    if (i === 0) g.arc(x, y, r, 0, TAU)
    else if (i === 1) g.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7)
    else if (i === 2) { g.moveTo(x, y - r * 1.1); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath() }
    else { g.moveTo(x, y - r * 1.15); g.lineTo(x + r * 1.05, y); g.lineTo(x, y + r * 1.15); g.lineTo(x - r * 1.05, y); g.closePath() }
  }

  function wobble(t) {
    if (opts.ctrl !== 'aim' || G.phase !== 'aim') return { x: 0, y: 0, r: 0 }
    const breath = 0.26 + 0.74 * (0.5 + 0.5 * Math.cos(TAU * t / 1.5))
    const tired = t > 4.5 ? 1 + (t - 4.5) * 0.5 : 1
    const r = 30 * breath * tired * nervesMul(G.cur) * (G.steady ? 0.3 : 1)
    return { x: Math.sin(t * 5.3 + 1.2) * r * 0.86, y: Math.sin(t * 3.9 + 0.3) * r * 0.86, r }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - (frame.last || now)) / 1000); frame.last = now
    update(now, dt)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // wall and spotlight
    let gr = ctx.createRadialGradient(VC.x - cam.x * 4, VC.y - 70, 30, VC.x, VC.y, 360)
    const wl = isLight()
    gr.addColorStop(0, rgbs(mix(T.surface, [255, 255, 255], wl ? 0.5 : 0.1))); gr.addColorStop(0.5, rgbs(T.deep)); gr.addColorStop(1, rgbs(mix(T.bg, [0, 0, 0], wl ? 0.3 : 0.55)))
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 0.06; ctx.fillStyle = rgbs(T.text)
    for (let x = -20 - (cam.x * 0.2 % 29); x < W; x += 29) ctx.fillRect(x, 0, 1.5, H)
    ctx.globalAlpha = 1
    world(() => {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.filter = 'blur(10px)'; ctx.beginPath(); ctx.arc(10, 18, R.edge + 26, 0, TAU); ctx.fill(); ctx.filter = 'none'
      const h = boardImg._half; ctx.drawImage(boardImg, -h, -h, h * 2, h * 2)
      drawOverlays(now)
    })
    // stuck darts and ghosts in screen space so their size stays readable
    for (const g of G.ghosts) { const [x, y] = w2s(g.x, g.y); drawDart(x, y, g.ang, 30 * Math.sqrt(cam.z), G.players[g.p].rgb, 0.5) }
    for (const d of G.stuck) { const [x, y] = w2s(d.x, d.y); const j = d.t ? Math.sin((now - d.t) / 28) * Math.exp(-(now - d.t) / 120) * 0.09 : 0; drawDart(x, y, d.ang + j, 46 * Math.sqrt(cam.z), G.players[d.p].rgb) }
    drawBalloon(now)
    drawReticle(now)
    drawFly(now)
    // particles
    particles = particles.filter(p => now - p.t0 < p.life)
    for (const p of particles) { const a = 1 - (now - p.t0) / p.life, t = (now - p.t0) / 1000; const [x, y] = w2s(p.x, p.y); ctx.fillStyle = p.c.replace('A', a.toFixed(2)); ctx.fillRect(x + p.vx * t, y + p.vy * t + 60 * t * t, p.s, p.s) }
    // vignette + oche shelf
    gr = ctx.createRadialGradient(VC.x, VC.y, 150, VC.x, VC.y, 330); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, wl ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.6)')
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H)
    drawHand(now)
    // popups
    popups = popups.filter(p => now - p.t0 < 1100)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const p of popups) {
      const t = (now - p.t0) / 1100; const [x, y] = w2s(p.x, p.y); const sc = t < 0.12 ? 0.6 + t / 0.12 * 0.5 : 1.1 - Math.min(0.1, (t - 0.12))
      ctx.save(); ctx.translate(Math.max(50, Math.min(W - 50, x)), Math.max(26, y - 28 - t * 26)); ctx.scale(sc, sc); ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1
      ctx.font = `${p.big ? 17 : 12}px "Press Start 2P", monospace`; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(8,12,9,.92)'; ctx.lineJoin = 'round'
      ctx.strokeText(p.text, 0, 0); ctx.fillStyle = p.c; ctx.fillText(p.text, 0, 0)
      if (p.sub) { ctx.font = '8px "Press Start 2P", monospace'; ctx.strokeText(p.sub, 0, 18); ctx.fillStyle = '#f4f1e4'; ctx.fillText(p.sub, 0, 18) }
      ctx.restore()
    }
    // confetti
    for (const c of confetti) { c.y += c.vy * dt; c.x += c.vx * dt; c.vy += 260 * dt; c.r += c.vr * dt; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-3, -2, 6, 4); ctx.restore() }
    confetti = confetti.filter(c => c.y < H + 20)
    requestAnimationFrame(frame)
  }

  function drawOverlays(now) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 170)
    if (opts.mode === 'turf') {
      G.turf.forEach((t, i) => {
        if (!t) return
        const rgb = G.players[t.owner].rgb
        ctx.fillStyle = col(rgb, 0.5); sector(ctx, i, R.obull, R.dbl); ctx.fill()
        const a = i * TAU / 20, x = Math.sin(a) * 132, y = -Math.cos(a) * 132
        glyph(ctx, t.owner, x, y, 7); ctx.fillStyle = col(rgb, 1, 0.25); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke()
        if (t.lock) { ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 5; const a0 = -Math.PI / 2 + (i - 0.5) * TAU / 20; ctx.beginPath(); ctx.arc(0, 0, R.dbl + 5, a0 + 0.03, a0 + TAU / 20 - 0.03); ctx.stroke() }
      })
    } else if (G.phase !== 'over' && G.phase !== 'lobby' && !me().bot) {
      const fins = finishers(me().score)
      ctx.fillStyle = col(lum(T.cta) > 110 ? T.cta : [255, 214, 90], 0.3 + pulse * 0.45)
      for (const f of fins) {
        if (f.ring === 'B') { ctx.beginPath(); ctx.arc(0, 0, R.bull, 0, TAU); ctx.fill() }
        else if (f.ring === 'O') { ctx.beginPath(); ctx.arc(0, 0, R.obull, 0, TAU); ctx.arc(0, 0, R.bull, 0, TAU, true); ctx.fill() }
        else if (f.ring === 'T') { sector(ctx, f.idx, R.ti, R.to); ctx.fill() }
        else if (f.ring === 'D') { sector(ctx, f.idx, R.di, R.dbl); ctx.fill() }
        else { sector(ctx, f.idx, R.to, R.di); ctx.fill(); sector(ctx, f.idx, R.obull, R.ti); ctx.fill() }
      }
    }
    if (G.flash && now - G.flash.t0 < 420) {
      const f = G.flash, a = 1 - (now - f.t0) / 420; ctx.fillStyle = `rgba(255,255,255,${a * 0.55})`
      const s = f.seg
      if (s.ring === 'B') { ctx.beginPath(); ctx.arc(0, 0, R.bull, 0, TAU); ctx.fill() }
      else if (s.ring === 'O') { ctx.beginPath(); ctx.arc(0, 0, R.obull, 0, TAU); ctx.fill() }
      else if (s.ring === 'T') { sector(ctx, s.idx, R.ti, R.to); ctx.fill() }
      else if (s.ring === 'D') { sector(ctx, s.idx, R.di, R.dbl); ctx.fill() }
      else if (s.ring === 'S') { sector(ctx, s.idx, R.obull, R.dbl); ctx.fill() }
    }
    // knockback targets: a dashed ring on each ghost so it reads as a target
    for (const g of G.ghosts) { ctx.strokeStyle = col(G.players[g.p].rgb, 0.9, 0.3); ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.lineDashOffset = -now / 60; ctx.beginPath(); ctx.arc(g.x, g.y, 9, 0, TAU); ctx.stroke(); ctx.setLineDash([]) }
  }

  function drawBalloon(now) {
    const b = G.balloon; if (!b) return
    const [x, y] = w2s(b.x, b.y), r = 20 * S_MM * cam.z
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + r); ctx.quadraticCurveTo(x + 6 * Math.sin(now / 300), y + r * 1.8, x - 3, y + r * 2.6); ctx.stroke()
    const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1); gr.addColorStop(0, '#ffd9a8'); gr.addColorStop(0.35, '#f08a2c'); gr.addColorStop(1, '#a8480c')
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y, r * 0.88, r, 0, 0, TAU); ctx.fill()
    ctx.fillStyle = '#a8480c'; ctx.beginPath(); ctx.moveTo(x - 3, y + r + 4); ctx.lineTo(x + 3, y + r + 4); ctx.lineTo(x, y + r - 1); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.16, r * 0.26, -0.5, 0, TAU); ctx.fill()
  }

  function drawReticle(now) {
    const rgb = me().rgb
    if (G.phase === 'aim' || G.phase === 'botaim') {
      const w = G.wob, [x, y] = w2s(G.aim.x + w.x, G.aim.y + w.y), [ax, ay] = w2s(G.aim.x, G.aim.y), k = S_MM * cam.z
      if (G.phase === 'aim') {
        ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(ax, ay, 30 * 0.26 * k, 0, TAU); ctx.stroke(); ctx.setLineDash([])
        ctx.strokeStyle = col(rgb, 0.95, 0.35); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ax, ay, Math.max(4, w.r * k), 0, TAU); ctx.stroke()
      }
      ctx.strokeStyle = 'rgba(8,12,9,.9)'; ctx.lineWidth = 4; cross(x, y); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; cross(x, y)
      ctx.fillStyle = col(rgb, 1, 0.3); ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill()
    } else if (G.phase === 'sweepX' || G.phase === 'sweepY') {
      const l = G.lock, k = S_MM * cam.z
      ctx.lineWidth = 2
      const [sx] = w2s(l.x, 0), [, sy] = w2s(0, l.y)
      ctx.strokeStyle = 'rgba(8,12,9,.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, VC.y - 185 * k); ctx.lineTo(sx, VC.y + 185 * k); ctx.stroke()
      ctx.strokeStyle = G.phase === 'sweepX' ? '#fff' : col(rgb, 1, 0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, VC.y - 185 * k); ctx.lineTo(sx, VC.y + 185 * k); ctx.stroke()
      if (G.phase === 'sweepY') { ctx.strokeStyle = 'rgba(8,12,9,.8)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(VC.x - 185 * k, sy); ctx.lineTo(VC.x + 185 * k, sy); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(VC.x - 185 * k, sy); ctx.lineTo(VC.x + 185 * k, sy); ctx.stroke(); ctx.fillStyle = col(rgb, 1, 0.3); ctx.beginPath(); ctx.arc(sx, sy, 4, 0, TAU); ctx.fill() }
    }
  }
  function cross(x, y) { ctx.beginPath(); ctx.moveTo(x - 11, y); ctx.lineTo(x - 4, y); ctx.moveTo(x + 4, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 4); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 11); ctx.stroke() }

  const HAND = () => ({ x: VC.x, y: H - 88 })
  function drawHand(now) {
    if (G.phase === 'over' || G.phase === 'lobby') return
    const rgb = me().rgb, h = HAND()
    // spare darts on the shelf
    for (let i = 0; i < G.dartsLeft - (G.phase === 'settle' || G.phase === 'handoff' ? 0 : 1); i++) drawDart(W - 30 - i * 18, H - 62, Math.PI / 2 - 0.08 + i * 0.05, 58, rgb, 0.9)
    if (G.phase === 'fly' || G.phase === 'settle' || G.phase === 'handoff') return
    const bob = Math.sin(now / 420) * 2, w = G.wob
    drawDart(h.x + w.x * 0.5, h.y + bob + w.y * 0.5 - (G.phase === 'aim' ? 8 : 0), Math.PI / 2 + w.x * 0.004, 124, rgb)
  }
  function drawFly(now) {
    const f = G.fly; if (!f) return
    const t = Math.min(1, (now - f.t0) / f.dur), e = 1 - (1 - t) ** 1.6, h = HAND()
    const [ex, ey] = w2s(f.x, f.y)
    const x = h.x + (ex - h.x) * e, y = h.y + (ey - h.y) * e - Math.sin(Math.PI * t) * 46
    const L = 124 + (46 * Math.sqrt(cam.z) - 124) * e, ang = Math.PI / 2 + (f.ang - Math.PI / 2) * e
    for (let i = 3; i >= 1; i--) { const tt = Math.max(0, t - i * 0.05), ee = 1 - (1 - tt) ** 1.6; drawDart(h.x + (ex - h.x) * ee, h.y + (ey - h.y) * ee - Math.sin(Math.PI * tt) * 46, ang, 124 + (46 * Math.sqrt(cam.z) - 124) * ee, me().rgb, 0.1) }
    drawDart(x, y, ang, L, me().rgb)
    if (t >= 1) { G.fly = null; land(f.x, f.y, f.ang, now) }
  }

  // ---------- game flow ----------
  function update(now, dt) {
    const t = (now - G.t0) / 1000
    G.wob = wobble(t)
    if (G.phase === 'sweepX') G.lock.x = 176 * Math.sin(t * 2.3 * nervesMul(G.cur))
    if (G.phase === 'sweepY') G.lock.y = 176 * Math.sin(t * 2.3 * nervesMul(G.cur) + 1.1)
    if (G.phase === 'botaim') { const e = Math.min(1, t / 0.75), s = e * e * (3 - 2 * e); G.aim.x = G.botFrom.x + (G.botTo.x - G.botFrom.x) * s; G.aim.y = G.botFrom.y + (G.botTo.y - G.botFrom.y) * s; if (e >= 1) throwAt(G.botTo.x, G.botTo.y) }
    if (G.balloon) { G.balloon.x += G.balloon.vx * dt; G.balloon.y = G.balloon.y0 + Math.sin(now / 700) * 14; if (Math.abs(G.balloon.x) > 215) G.balloon.vx *= -1 }
    const zAim = reduced ? 1.15 : 1.5
    if (G.phase === 'aim' || G.phase === 'botaim') { camT.z = zAim; camT.x = G.aim.x * 0.72; camT.y = G.aim.y * 0.72 }
    else if (G.phase === 'fly' || G.phase === 'settle') { /* set on throw */ }
    else if (G.phase === 'sweepX' || G.phase === 'sweepY') { camT.z = 1; camT.x = camT.y = 0 }
    else { camT.z = 1; camT.x = 0; camT.y = 0 }
    const f = 1 - Math.exp(-dt * (reduced ? 30 : 7.5))
    cam.x += (camT.x - cam.x) * f; cam.y += (camT.y - cam.y) * f; cam.z += (camT.z - cam.z) * f
    shake *= Math.exp(-dt * 14); if (shake < 0.1) shake = 0
  }

  function throwAt(x, y) {
    x += gauss() * 2.2; y += gauss() * 2.2
    G.phase = 'fly'; G.fly = { x, y, t0: performance.now(), dur: reduced ? 200 : 360, ang: Math.PI / 2 - 0.42 + Math.random() * 0.5 }
    camT.z = reduced ? 1.15 : 1.75; camT.x = x * 0.86; camT.y = y * 0.86
    me().thrown++; sfx.whoosh(); setStatus()
  }

  function land(x, y, ang, now) {
    const p = me(), seg = segmentAt(x, y)
    G.stuck.push({ x, y, ang, p: G.cur, t: now, key: seg.key })
    G.flash = { seg, t0: now }
    shake = reduced ? 0 : seg.ring === 'T' || seg.ring === 'B' ? 9 : 5
    for (let i = 0; i < 12; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 90, t0: now, life: 420 + Math.random() * 200, s: 1.5 + Math.random() * 2, c: 'rgba(226,208,160,A)' })
    seg.v ? sfx.thunk(seg.ring === 'T' || seg.ring === 'B') : sfx.miss(); buzz(seg.v ? 18 : 40)
    G.dartsLeft--; G.visit.push(seg)
    let ended = false
    // carnival balloon: pop it for a steady next dart
    G.steady = false
    if (G.balloon && Math.hypot(x - G.balloon.x, y - G.balloon.y) < 23) {
      for (let i = 0; i < 16; i++) particles.push({ x: G.balloon.x, y: G.balloon.y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.7) * 220, t0: now, life: 500, s: 3, c: 'rgba(240,138,44,A)' })
      G.balloon = null; G.steady = true; sfx.pop(); pop(x, y - 34, 'POP! STEADY NEXT', '#ffd65a')
    }
    if (opts.mode === 'x01') {
      if (opts.knock && seg.v) {
        const gi = G.ghosts.findIndex(g => g.p !== G.cur && g.key === seg.key)
        if (gi >= 0) { const g = G.ghosts[gi], v = G.players[g.p]; v.score = Math.min(opts.start, v.score + seg.v); G.ghosts.splice(gi, 1); pop(x, y + 36, `KNOCKBACK ${v.name} +${seg.v}`, col(v.rgb, 1, 0.45)); sfx.bust() }
      }
      const left = p.score - seg.v
      if (left < 0) { p.score = G.visitStart; pop(x, y, 'BUST', '#ff6b5e', true, 'BACK TO ' + G.visitStart); sfx.bust(); ended = true; G.visit.bust = true }
      else {
        p.score = left
        const big = seg.ring === 'T' ? 'TREBLE ' + seg.n : seg.ring === 'D' ? 'DOUBLE ' + seg.n : seg.ring === 'B' ? 'BULLSEYE' : null
        pop(x, y, seg.v ? '' + seg.v : 'MISS', seg.v ? '#fff' : '#b9c0b4', seg.v >= 40, big)
        if (seg.v >= 40) sfx.nice()
        if (left === 0) return win(G.cur)
      }
    } else {
      turfHit(seg, x, y)
    }
    renderHud(); setStatus()
    if (G.dartsLeft === 0) ended = true
    G.phase = 'settle'
    setTimeout(() => ended ? endVisit() : nextDart(), ended ? 1250 : 720)
  }
  const pop = (x, y, text, c, big, sub) => popups.push({ x, y, text, c, big, sub, t0: performance.now() })

  function turfHit(seg, x, y) {
    const p = me()
    if (seg.ring === 'M') return pop(x, y, 'MISS', '#b9c0b4')
    if (seg.ring === 'B' || seg.ring === 'O') { const b = seg.ring === 'B' ? 2 : 1; p.bonus += b; sfx.nice(); return pop(x, y, '+' + b + ' BONUS', '#ffd65a', true) }
    const take = (i) => { const t = G.turf[i]; if (t && t.lock && t.owner !== G.cur) return false; G.turf[i] = { owner: G.cur, lock: t && t.owner === G.cur ? t.lock : false }; return true }
    if (seg.ring === 'S') { pop(x, y, take(seg.idx) ? 'CLAIMED ' + seg.n : 'LOCKED!', '#fff') }
    else if (seg.ring === 'D') { if (take(seg.idx)) { G.turf[seg.idx].lock = true; pop(x, y, 'LOCKED IN', '#f2c14e', true, 'NOBODY CAN STEAL ' + seg.n); sfx.nice() } else pop(x, y, 'LOCKED!', '#fff') }
    else { let c = 0; for (const d of [-1, 0, 1]) c += take((seg.idx + d + 20) % 20) ? 1 : 0; pop(x, y, 'SPREAD ×' + c, '#7ee0a1', true, 'TREBLE TAKES NEIGHBOURS'); sfx.nice() }
    p.score = turfScore(G.cur)
    G.players.forEach((q, i) => { q.score = turfScore(i) })
  }

  function nextDart() { if (G.phase !== 'settle') return; G.phase = 'idle'; G.aim = { x: G.aim.x * 0.5, y: G.aim.y * 0.5 }; setStatus(); if (me().bot) botTurn() }

  function endVisit() {
    if (G.phase === 'over') return
    const total = G.visit.bust ? 0 : G.visit.reduce((s, v) => s + v.v, 0)
    if (opts.mode === 'x01' && !G.visit.bust && total >= 100) { pop(0, -40, 'TON+ ' + total, '#ffd65a', true); sfx.nice() }
    // this visit's darts stay on the board as knockback targets until the thrower's next visit
    G.ghosts = G.ghosts.filter(g => g.p !== G.cur)
    if (opts.knock && opts.mode === 'x01' && !G.visit.bust) for (const d of G.stuck) if (d.key !== 'M') G.ghosts.push({ ...d })
    G.stuck = []
    G.cur = (G.cur + 1) % G.players.length
    if (G.cur === 0) G.round++
    if (opts.mode === 'turf' && G.round > G.maxRounds) {
      const best = Math.max(...G.players.map((_, i) => turfScore(i))), who = G.players.map((_, i) => i).filter(i => turfScore(i) === best)
      return win(who.length === 1 ? who[0] : -1)
    }
    G.dartsLeft = 3; G.visit = []; G.visitStart = me().score; G.steady = false; G.aim = { x: 0, y: 0 }
    spawnBalloon()
    G.phase = 'handoff'
    screenEl.classList.toggle('flip', opts.table === 'f2f' && G.players.length === 2 && !opts.bot && G.cur === 1)
    bannerEl.textContent = me().bot ? 'BOT THROWS' : me().name + ' · YOUR THROW'
    bannerEl.style.setProperty('--sc', me().rgb.join(' ')); bannerEl.classList.add('on')
    renderHud(); setStatus()
    setTimeout(() => { bannerEl.classList.remove('on'); if (G.phase !== 'handoff') return; G.phase = 'idle'; setStatus(); if (me().bot) botTurn() }, 950)
  }
  function spawnBalloon() { G.balloon = opts.balloon ? { x: -200, y0: -40 + Math.random() * 110, y: 0, vx: 48 + Math.random() * 24 } : null }

  function win(i) {
    G.phase = 'over'; G.winner = i; G.fly = null; camT.z = 1; camT.x = camT.y = 0
    renderHud(); setStatus(); sfx.win(); buzz([30, 40, 30, 40, 80])
    if (!reduced) for (let n = 0; n < 90; n++) confetti.push({ x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.45, vx: (Math.random() - 0.5) * 380, vy: -160 - Math.random() * 300, r: 0, vr: (Math.random() - 0.5) * 12, c: col(SEATS[n % 4].rgb, 1, 0.2) })
    const p = i >= 0 ? G.players[i] : null
    $('#overTitle').textContent = !p ? 'DEAD HEAT' : opts.mode === 'x01' ? p.name + ' CHECKS OUT!' : p.name + ' OWNS THE BOARD'
    $('#overTitle').style.color = p ? col(p.rgb, 1, 0.35) : '#fff'
    $('#overSub').textContent = opts.mode === 'x01'
      ? G.players.map(q => `${q.name} ${q.thrown} DARTS · ${q.score} LEFT`).join('   ')
      : G.players.map((q, n) => `${q.name} ${turfScore(n)}`).join('   ')
    setTimeout(() => { overEl.hidden = false }, 900)
  }

  function botTurn() {
    setTimeout(() => {
      if (G.phase !== 'idle' || !me().bot) return
      const p = me(); let pt
      if (opts.mode === 'turf') { const free = G.turf.map((t, i) => t && (t.owner === G.cur || t.lock) ? -1 : i).filter(i => i >= 0); const i = free[Math.floor(Math.random() * free.length)] ?? 0; pt = targetPoint({ ring: 'S', idx: i }) }
      else {
        const fin = finishers(p.score)
        if (fin.length) pt = targetPoint(fin.find(f => f.ring === 'S') || fin[0])
        else if (p.score > 60) pt = targetPoint({ ring: 'T', idx: 0 })
        else { const want = p.score > 40 ? p.score - 40 : p.score - 20 > 0 && p.score - 20 <= 20 ? p.score - 20 : 1; pt = targetPoint({ ring: 'S', idx: SECT.indexOf(Math.min(20, Math.max(1, want))) }) }
      }
      const sd = [26, 17, 9][opts.botLevel]
      G.botFrom = { x: G.aim.x, y: G.aim.y }; G.botTo = { x: pt[0] + gauss() * sd, y: pt[1] + gauss() * sd }
      G.phase = 'botaim'; G.t0 = performance.now(); setStatus()
    }, 520)
  }

  // ---------- input ----------
  let ptr = null
  cv.addEventListener('pointerdown', (e) => {
    audio(); e.preventDefault()
    if (G.phase === 'over' || G.phase === 'lobby' || me().bot) return
    if (opts.ctrl === 'one') return oneButton()
    if (G.phase !== 'idle') return
    try { cv.setPointerCapture(e.pointerId) } catch (err) { /* pointer already gone */ }
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY }
    // The aim does not start under the finger: it starts at a random point
    // within AIM_START_MM of the touch, so every dart begins with a correction.
    const rect = cv.getBoundingClientRect(), sc = W / rect.width, flip = screenEl.classList.contains('flip')
    let px = (e.clientX - rect.left) * sc, py = (e.clientY - rect.top) * sc
    if (flip) { px = W - px; py = H - py }
    const k = S_MM * cam.z, a = Math.random() * TAU, d = AIM_START_MM * (0.45 + 0.55 * Math.sqrt(Math.random()))
    G.aim = { x: cam.x + (px - VC.x) / k + Math.cos(a) * d, y: cam.y + (py - VC.y) / k + Math.sin(a) * d }
    const r0 = Math.hypot(G.aim.x, G.aim.y); if (r0 > 190) { G.aim.x *= 190 / r0; G.aim.y *= 190 / r0 }
    G.aimKey = null
    G.phase = 'aim'; G.t0 = performance.now(); setStatus()
  })
  cv.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id || G.phase !== 'aim') return
    const flip = screenEl.classList.contains('flip') ? -1 : 1, rect = cv.getBoundingClientRect(), sc = W / rect.width
    const g = 1.15 * sc / (S_MM * cam.z)
    G.aim.x += (e.clientX - ptr.x) * g * flip; G.aim.y += (e.clientY - ptr.y) * g * flip
    const r = Math.hypot(G.aim.x, G.aim.y); if (r > 190) { G.aim.x *= 190 / r; G.aim.y *= 190 / r }
    ptr.x = e.clientX; ptr.y = e.clientY
    const s = segmentAt(G.aim.x, G.aim.y); if (s.key !== G.aimKey) { G.aimKey = s.key; setStatus() }
  })
  const release = (e) => {
    if (!ptr || e.pointerId !== ptr.id) return
    ptr = null
    if (G.phase !== 'aim') return
    if (e.type === 'pointercancel') { G.phase = 'idle'; return setStatus() }
    if (performance.now() - G.t0 < 220) { G.phase = 'idle'; statusEl.textContent = 'HOLD TO AIM, LET GO TO THROW'; return }
    throwAt(G.aim.x + G.wob.x, G.aim.y + G.wob.y)
  }
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release)
  function oneButton() {
    if (G.phase === 'over' || G.phase === 'lobby' || me().bot) return
    if (G.phase === 'idle') { G.phase = 'sweepX'; G.t0 = performance.now(); G.lock = { x: 0, y: 0 }; sfx.lock() }
    else if (G.phase === 'sweepX') { G.phase = 'sweepY'; G.t0 = performance.now(); sfx.lock() }
    else if (G.phase === 'sweepY') throwAt(G.lock.x, G.lock.y)
    setStatus()
  }
  throwBtn.addEventListener('click', () => { audio(); oneButton() })
  $('#again').addEventListener('click', reset)
  $('#mute').addEventListener('click', (e) => { muted = !muted; e.currentTarget.setAttribute('aria-pressed', muted); e.currentTarget.textContent = muted ? 'SOUND OFF' : 'SOUND ON' })

  // ---------- HUD ----------
  function renderHud() {
    seatsEl.className = 'seats n' + G.players.length
    seatsEl.innerHTML = G.players.map((p, i) => {
      const on = i === G.cur && G.phase !== 'over', nv = nervesMul(i)
      const pips = on ? `<span class="pips" aria-label="${G.dartsLeft} darts left">${[0, 1, 2].map(n => `<i class="${n < G.dartsLeft ? 'on' : ''}"></i>`).join('')}</span>` : ''
      const nerves = opts.nerves ? `<span class="nv" title="hand shake">${nv > 1.08 ? 'SHAKY' : nv < 0.95 ? 'CALM' : 'EVEN'}</span>` : ''
      return `<div class="seat s${i + 1}${on ? ' on' : ''}${G.winner === i ? ' won' : ''}" style="--sc:${p.rgb.join(' ')}"><span class="gl g${i}"></span><span class="nm">${p.name}${nerves}</span><b>${p.score}</b>${pips}</div>`
    }).join('')
    chipsEl.innerHTML = [0, 1, 2].map(n => { const v = G.visit[n]; return `<span class="chip${v ? ' hit' : ''}">${v ? v.label : '·'}</span>` }).join('') +
      `<span class="tot">${opts.mode === 'x01' ? (G.visit.bust ? 'BUST' : G.visit.reduce((s, v) => s + v.v, 0)) : 'RD ' + Math.min(G.round, G.maxRounds) + '/' + G.maxRounds}</span>`
  }
  function setStatus() {
    const p = me(); let t = ''
    throwBtn.hidden = opts.ctrl !== 'one' || p.bot || G.phase === 'over' || G.phase === 'lobby'
    if (G.phase === 'lobby') t = 'PICK HOW YOU THROW, THEN START'
    else if (G.phase === 'over') t = 'GOOD DARTS'
    else if (p.bot) t = 'BOT IS LINING UP'
    else if (G.phase === 'aim') { const s = segmentAt(G.aim.x, G.aim.y); t = 'AIMING ' + (s.ring === 'M' ? 'OFF BOARD' : s.label) + ' · LET GO WHEN THE RING IS SMALL' }
    else if (G.phase === 'sweepX') t = 'TAP TO LOCK LEFT / RIGHT'
    else if (G.phase === 'sweepY') t = 'TAP AGAIN TO THROW'
    else if (G.phase === 'idle') {
      const fin = opts.mode === 'x01' ? finishers(p.score) : []
      t = fin.length ? `${p.score} LEFT · FINISH ON ${[...new Set(fin.map(finLabel))].join(' / ')}` : opts.ctrl === 'one' ? 'TAP THROW TO START THE SWEEP' : opts.mode === 'turf' ? 'HIT A WEDGE TO CLAIM IT' : 'HOLD, DRAG TO AIM, LET GO'
    } else t = statusEl.textContent
    statusEl.textContent = t
    throwBtn.textContent = G.phase === 'sweepY' ? 'THROW' : G.phase === 'sweepX' ? 'LOCK' : 'THROW'
  }

  // ---------- settings ----------
  function apply(next, restart = true) {
    Object.assign(opts, next)
    document.querySelectorAll('[data-opt]').forEach(el => {
      const k = el.dataset.opt, v = opts[k]
      if (el.type === 'checkbox') el.checked = !!v
      else if (el.type === 'radio') el.checked = String(v) === el.value
    })
    document.body.dataset.mode = opts.mode
    document.querySelectorAll('[data-opt="theme"]').forEach(el => { el.value = opts.theme })
    if (next.theme) setTheme(opts.theme)
    if (restart) reset(); else { renderHud(); setStatus() }
  }
  document.querySelectorAll('[data-opt]').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.opt
    const v = el.type === 'checkbox' ? el.checked : (k === 'n' || k === 'start' ? Number(el.value) : el.value === 'true' ? true : el.value === 'false' ? false : el.value)
    apply({ [k]: v }, lobbyOpen ? k !== 'theme' : !['nerves', 'theme'].includes(k))
  }))
  const toLobby = () => { lobbyOpen = true; reset() }
  $('#restart').addEventListener('click', toLobby); $('#setup').addEventListener('click', toLobby)
  $('#start').addEventListener('click', () => { audio(); lobbyOpen = false; reset() })
  document.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => {
    lobbyOpen = false; apply(JSON.parse(b.dataset.try)); $('#play').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }))

  function setTheme(id) {
    T = THEMES.find(t => t.id === id) || T
    const ph = $('.phone'), map = { bg: 'bg', surface: 'surface', card: 'card', border: 'line', text: 'ink', dim: 'dim', cta: 'cta', win: 'win', danger: 'danger', 'tint-cta': 'tint-cta', deep: 'deep' }
    for (const k in map) ph.style.setProperty('--' + map[k], T[k].join(' '))
    ph.dataset.scheme = isLight() ? 'light' : 'dark'
    ;['p1', 'p2', 'p3', 'p4'].forEach((k, i) => { const c = isLight() ? T[k] : T[k]; SEATS[i].rgb.splice(0, 3, ...c) })
    if (dpr) buildBoard()
    if (G.players) renderHud()
  }
  const themeSel = $('#theme')
  if (themeSel) themeSel.innerHTML = THEMES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')
  function size() {
    dpr = Math.min(3, window.devicePixelRatio || 1)
    W = cv.clientWidth || 348; H = cv.clientHeight || 440
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
    VC.x = W / 2; VC.y = Math.min(176, H * 0.41)
    buildBoard()
  }
  window.addEventListener('resize', size)
  setTheme(opts.theme)
  window.DARTS = { apply, G, opts, segmentAt, finishers, throwAt: (x, y) => { if (G.phase === 'idle') throwAt(x, y) } }
  size(); apply({}, true)
  ;(document.fonts && document.fonts.load ? document.fonts.load('12px "Press Start 2P"').catch(() => {}) : Promise.resolve()).then(() => requestAnimationFrame(frame))
})()
