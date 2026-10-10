// firstCutFx.js — First Cut's particle layer: juice, seeds, sparks, dust, shock
// rings, slash flashes and confetti on one canvas laid over the table.
//
// Not pure (it owns a canvas and a requestAnimationFrame loop), so it lives
// apart from firstCutLogic.js. The loop runs only while particles are alive.
// Particles are capped, and the canvas is drawn at no more than 2x device
// pixels, so a burst costs a few hundred small arcs, never layout.
//
// A canvas cannot read CSS variables, so the theme's tokens are read once from
// computed style (`readPalette`) and again whenever the theme changes.

/** Juice colours per fruit (fixed: item colours are gameplay information). */
export const JUICE = {
  melon: [232, 52, 70],
  orange: [250, 160, 44],
  apple: [246, 236, 196],
  lemon: [250, 228, 96],
}
const SEED = [50, 26, 14]
const GOLD = [255, 214, 80]
const MAX_PARTICLES = 260

/** Read the theme tokens the canvas needs, from an element inside the themed tree. */
export function readPalette(el) {
  const cs = getComputedStyle(el)
  const triplet = (name, fallback) => {
    const parts = cs.getPropertyValue(name).trim().split(/\s+/).map(Number)
    return parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback
  }
  const cta = triplet('--c-cta', [255, 190, 60])
  const text = triplet('--c-text', [255, 255, 255])
  const p = [1, 2, 3, 4].map(n => triplet(`--c-p${n}`, [255, 255, 255]))
  return { spark: [[255, 255, 255], cta], ring: text, players: p }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ reduced?: () => boolean, palette?: ReturnType<typeof readPalette> }} [opts]
 */
export function createFx(canvas, opts = {}) {
  const ctx = canvas.getContext('2d')
  let palette = opts.palette ?? { spark: [[255, 255, 255], [255, 190, 60]], ring: [255, 255, 255], players: [] }
  const reduced = opts.reduced ?? (() => false)
  let W = 1
  let H = 1
  let dpr = 1
  let parts = []
  let last = 0
  let raf = 0
  let running = false

  function resize() {
    const r = canvas.getBoundingClientRect()
    dpr = Math.min(2, window.devicePixelRatio || 1)
    W = Math.max(1, r.width)
    H = Math.max(1, r.height)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
  }
  resize()

  const u = () => W / 100
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`

  function add(p) {
    if (!ctx || parts.length > MAX_PARTICLES) return
    parts.push({ t: 0, vx: 0, vy: 0, rot: 0, vr: 0, drag: 0.9, ...p })
    if (!running) {
      running = true
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
  }

  function tick(now) {
    if (!ctx) return
    const dt = Math.min(0.034, (now - last) / 1000)
    last = now
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]
      q.t += dt
      if (q.t >= q.life) { parts.splice(i, 1); continue }
      const k = q.t / q.life
      const f = Math.pow(q.drag, dt * 60)
      q.vx *= f
      q.vy *= f
      q.x += q.vx * dt
      q.y += q.vy * dt
      q.rot += q.vr * dt
      const c = q.c
      if (q.kind === 'drop') {
        const r = q.r * (1 - k * 0.35)
        const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
        ctx.globalAlpha = a * 0.92
        ctx.fillStyle = rgb(c)
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fill()
        ctx.globalAlpha = a * 0.55
        ctx.fillStyle = 'rgb(255,255,255)'
        ctx.beginPath(); ctx.arc(q.x - r * 0.3, q.y - r * 0.35, r * 0.32, 0, 6.283); ctx.fill()
      } else if (q.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 1 - k
        ctx.strokeStyle = rgb(k < 0.35 ? palette.spark[0] : palette.spark[1])
        ctx.lineWidth = q.r * (1 - k)
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.035, q.y - q.vy * 0.035); ctx.stroke()
        ctx.globalCompositeOperation = 'source-over'
      } else if (q.kind === 'seed' || q.kind === 'conf') {
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.rotate(q.rot)
        ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25
        ctx.fillStyle = rgb(c)
        if (q.kind === 'seed') { ctx.beginPath(); ctx.ellipse(0, 0, q.r, q.r * 0.55, 0, 0, 6.283); ctx.fill() }
        else ctx.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r * Math.cos(q.t * 9))
        ctx.restore()
      } else if (q.kind === 'ring') {
        ctx.globalAlpha = (1 - k) * 0.8
        ctx.strokeStyle = rgb(c)
        ctx.lineWidth = 3 * (1 - k) + 0.5
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r + (q.R - q.r) * (1 - Math.pow(1 - k, 3)), 0, 6.283); ctx.stroke()
      } else if (q.kind === 'slash') {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 1 - k
        ctx.strokeStyle = 'rgb(255,255,255)'
        ctx.lineWidth = 5 * (1 - k) + 1
        ctx.lineCap = 'round'
        const L = q.r * (0.4 + 0.6 * Math.min(1, k * 4))
        ctx.beginPath()
        ctx.moveTo(q.x - Math.cos(q.rot) * L, q.y - Math.sin(q.rot) * L)
        ctx.lineTo(q.x + Math.cos(q.rot) * L, q.y + Math.sin(q.rot) * L)
        ctx.stroke()
        ctx.globalCompositeOperation = 'source-over'
      } else if (q.kind === 'dust') {
        ctx.globalAlpha = (1 - k) * 0.13
        ctx.fillStyle = 'rgb(255,236,200)'
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 + k * 1.6), 0, 6.283); ctx.fill()
      }
    }
    ctx.globalAlpha = 1
    if (parts.length) raf = requestAnimationFrame(tick)
    else { running = false; ctx.clearRect(0, 0, W, H) }
  }

  const unit = () => u() / 3.8 // the numbers below were tuned on a 380 px table

  return {
    resize,
    setPalette(p) { palette = p },
    /** The plate's centre in canvas px. */
    center: () => [W / 2, H / 2],
    /** A point on a seat's local axes (cqw-like units; +x toward the player) to canvas px. */
    local(aDeg, lx, ly) {
      const a = (aDeg * Math.PI) / 180
      const c = Math.cos(a)
      const s = Math.sin(a)
      return [W / 2 + (lx * c - ly * s) * u(), H / 2 + (lx * s + ly * c) * u()]
    },
    /** A fruit split along the blade's line (`ang`, radians): droplets, seeds, a flash and a ring. */
    juice(color, ang, gold = false) {
      if (reduced()) return
      const [x, y] = [W / 2, H / 2]
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1
        const a = ang + side * (Math.PI / 2) + (Math.random() - 0.5) * 1.5
        const v = (60 + Math.random() * 260) * unit()
        add({ kind: 'drop', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: (1.2 + Math.random() * 2.6) * unit() * 1.3, life: 0.5 + Math.random() * 0.55, drag: 0.9, c: color })
      }
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * 6.283
        const v = (50 + Math.random() * 120) * unit()
        add({ kind: 'seed', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2.4 * unit(), life: 0.6 + Math.random() * 0.4, drag: 0.9, vr: (Math.random() - 0.5) * 20, c: SEED })
      }
      add({ kind: 'slash', x, y, rot: ang, r: 21 * u(), life: 0.2, c: color })
      add({ kind: 'ring', x, y, r: 8 * u(), R: 26 * u(), life: 0.38, c: palette.ring })
      if (gold) this.confetti(GOLD, 40)
    },
    /** The blade stopped on a twin: a handful of hot sparks and a small ring at the contact. */
    sparks(x, y, ang) {
      if (reduced()) return
      for (let i = 0; i < 18; i++) {
        const a = ang + (Math.random() - 0.5) * 2.4
        const v = (160 + Math.random() * 420) * unit()
        add({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2.6, life: 0.22 + Math.random() * 0.3, drag: 0.88 })
      }
      add({ kind: 'ring', x, y, r: 1 * u(), R: 9 * u(), life: 0.3, c: [255, 226, 140] })
    },
    /** An item landing on the plate. */
    dust() {
      if (reduced()) return
      const [x, y] = [W / 2, H / 2]
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * 6.283
        const v = (30 + Math.random() * 50) * unit()
        add({ kind: 'dust', x: x + Math.cos(a) * 12 * u(), y: y + Math.sin(a) * 12 * u(), vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 3 * unit() * 2, life: 0.5, drag: 0.92 })
      }
    },
    confetti(color, count = 90) {
      if (reduced()) return
      const [x, y] = [W / 2, H / 2]
      const cols = [color, GOLD, [255, 255, 255], [232, 52, 70], [250, 160, 44]]
      for (let i = 0; i < count; i++) {
        const a = Math.random() * 6.283
        const v = (120 + Math.random() * 520) * unit()
        add({ kind: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 3 + Math.random() * 3, life: 1 + Math.random() * 0.9, drag: 0.95, vr: (Math.random() - 0.5) * 14, c: cols[i % cols.length] })
      }
    },
    clear() { parts = []; if (ctx) ctx.clearRect(0, 0, W, H) },
    destroy() { cancelAnimationFrame(raf); running = false; parts = [] },
  }
}
