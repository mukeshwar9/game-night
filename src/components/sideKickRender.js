// SIDE KICK's road scene: a pseudo-3D chase view on one canvas. Rendering only;
// the rules are in lib/sideKickLogic.js and every colour comes from the selected
// theme's tokens (lib/sideKickPalette.js).
//
// One light: the sun sits up and to the right, so every object is lit on its
// right side, shaded on its left, and drops a soft shadow to the left. Static
// scenery (trees, houses, signs, cars, clouds) is painted once per theme into a
// small offscreen image and reused; riders, cloth and effects are drawn fresh
// each frame. Riders are the players' avatars seen from behind (the avatar kit's
// `back` view), stood up with a darker side for thickness.

import { mulberry32 as mulberry } from '../lib/detMath'
import { buildPalette, readSideKickTokens, css, mx, BLACK, WHITE } from '../lib/sideKickPalette'
import { SEG, MAXSPD, LANEX, DT, KICK_T, DOWN_T, BOOST_MIN, segAt as trackSegAt, roadY as trackRoadY, kickTarget, inWake } from '../lib/sideKickLogic'
import { renderPixels, resolveAvatar } from '../lib/avatarKit'
import { canvasPixelRatio } from '../lib/platform'

export const W = 360
export const H = 470
const HORIZ = 178
const YS = 250
const ROAD = 2000
const CAMH = 1000
const DRAW = 150
const CAMD = 1 / Math.tan((100 / 2) * Math.PI / 180)
const PLAYERZ = CAMH * CAMD
// First person: the camera sits at the rider's eyes, low and a little behind the bike's z so a rider
// alongside is still in view; a slightly wider lens keeps the next lane on screen.
const CAMD_FIRST = 0.72
const FP_H = 560
const FP_BACK = 140
const WHITE_CSS = css(WHITE)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t

/** Most common colour in a box of a 24x24 pixel grid, or `fallback`. */
function dominant(px, x0, x1, y0, y1, fallback) {
  const counts = new Map()
  let best = null
  let bn = 0
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = px[y * 24 + x]
      if (!c) continue
      const k = c.map((v) => Math.round(v)).join(',')
      const n = (counts.get(k) || 0) + 1
      counts.set(k, n)
      if (n > bn) { bn = n; best = c }
    }
  }
  return best ? best.map((v) => Math.round(v)) : fallback
}

/**
 * @param {HTMLCanvasElement} canvas  sized by the renderer to W × H logical px
 * @param {{ dust?: boolean }} [opts]  `dust` paints DUST KICK's trail: horses, hay, the Western roadside and a ranch gate
 */
export function createSideKickRenderer(canvas, { dust = false } = {}) {
  const home = canvas.getContext('2d')
  const dpr = Math.min(2, canvasPixelRatio() || 1)
  canvas.width = W * dpr
  canvas.height = H * dpr
  const lo = document.createElement('canvas')
  lo.width = W / 2
  lo.height = H / 2
  const lctx = lo.getContext('2d')

  let P = null
  let themeId = null
  let fontFamily = 'monospace'
  // The world being drawn (set by draw()).
  let track = null
  let riders = []
  let cars = []
  let weeds = []
  let segs = []
  let look = null
  let phase = 'race'
  let viewIdx = 0
  let frameDt = DT
  let clock = 0
  let avatarsOn = true
  let camMode = 'chase'
  let camd = CAMD
  let fovK = 0
  let fovPulse = 0
  const segAt = (z) => trackSegAt(track, z)
  const roadY = (z) => trackRoadY(track, z)

    // ── Drawing helpers ──────────────────────────────────────────────────────
    // One light: the sun sits up and to the right, so every object is lit on
    // its right side, shaded on its left, and drops a soft shadow to the left.
    function rr(c, x, y, w, h, r, fill) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill() }
    function poly(c, pts, fill) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fillStyle = fill; c.fill() }
    function circ(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = fill; c.fill() }
    function limb(c, pts, w, col) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col; c.stroke() }
    function lg(c, x0, y0, x1, y1, ...stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g }
    function rg(c, x, y, r0, r1, ...stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]); return g }
    const li = (a, k) => css(mx(a, P.sunC, k)), da = (a, k) => css(mx(a, P.dkC, k))
    const sideLit = (c, x0, x1, a, k) => lg(c, x0, 0, x1, 0, 0, da(a, k), 0.55, css(a), 1, li(a, k))
    const ease = { outBack: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2), inOut: (t) => t * t * (3 - 2 * t), out: (t) => 1 - Math.pow(1 - t, 3) }
    function softShadow(c, x, w, h, k) {
      const col = P.dark ? BLACK : P.dkC
      c.save(); c.translate(x, 1.5); c.scale(1, h / w); c.fillStyle = rg(c, 0, 0, w * 0.25, w, 0, css(col, (P.dark ? 0.6 : 0.42) * (k || 1)), 1, css(col, 0)); c.beginPath(); c.arc(0, 0, w, 0, 7); c.fill(); c.restore()
    }
    // Static objects are painted once per theme into a sprite, then drawn as images.
    const SS = 2, sprCache = new Map()
    function sprite(key, x0, y0, x1, y1, draw) {
      const k = key; let s = sprCache.get(k)
      if (!s) { const cv = document.createElement('canvas'); cv.width = (x1 - x0) * SS; cv.height = (y1 - y0) * SS; const g = cv.getContext('2d'); g.scale(SS, SS); g.translate(-x0, -y0); draw(g); s = { cv, x0, y0, w: x1 - x0, h: y1 - y0 }; sprCache.set(k, s) }
      return s
    }
    const put = (c, s) => c.drawImage(s.cv, s.x0, s.y0, s.w, s.h)
    const dot = (raw) => sprite('dot' + raw.map(Math.round).join('_'), -16, -16, 16, 16, (g) => { g.fillStyle = rg(g, 0, 0, 0, 16, 0, css(raw, 1), 0.45, css(raw, 0.55), 1, css(raw, 0)); g.fillRect(-16, -16, 32, 32) })

  // ── Player avatars: real avatar-kit sprites, stood up with a darker side for thickness.
  // The rider on the bike is the avatar seen from behind (the kit's `back` view, no helmet);
  // fronts appear wherever the camera sees a face: mirrors, name tags, a fallen rider.
  const AVS = []
  const AVC = []
  const hasAv = (i) => avatarsOn && !!AVS[i]
  function frameOf(px) {
    const mk = (shade) => {
      const cv = document.createElement('canvas'); cv.width = 24; cv.height = 24
      const x = cv.getContext('2d'); const img = x.createImageData(24, 24)
      for (let i = 0; i < 576; i++) {
        const c = px[i]; if (!c) continue
        img.data[i * 4] = c[0] * shade; img.data[i * 4 + 1] = c[1] * shade; img.data[i * 4 + 2] = c[2] * shade; img.data[i * 4 + 3] = 255
      }
      x.putImageData(img, 0, 0); return cv
    }
    return { lit: mk(1), side: mk(0.55) }
  }
  function standee(c, i, frame, x, yBase, hgt) {
    const f = AVS[i][frame], k = hgt / 22
    c.save(); c.translate(x, yBase); c.imageSmoothingEnabled = false
    for (const d of [1.5, 1, 0.5]) c.drawImage(f.side, -12 * k - d * k * 0.7, -23 * k + d * k * 0.3, 24 * k, 24 * k)
    c.drawImage(f.lit, -12 * k, -23 * k, 24 * k, 24 * k)
    c.imageSmoothingEnabled = true; c.restore()
  }
  /** One avatar string (or null for a plain rider) per seat. */
  function setAvatars(list) {
    AVS.length = 0; AVC.length = 0
    list.forEach((id, i) => {
      AVS[i] = null
      if (!id) return
      try {
        const r = resolveAvatar(id)
        if (r.kind !== 'kit') return
        const look = { ...r.look, pet: 'none' }
        const back = renderPixels(look, 'back', { t: 0.35, tile: false })
        const bust = renderPixels(look, 'bust', { t: 0.35, tile: false })
        const idle = renderPixels(look, 'hero', { t: 0.35, tile: false, pose: 'idle' })
        AVS[i] = { back: frameOf(back), bust: frameOf(bust), idle: frameOf(idle) }
        AVC[i] = { top: dominant(back, 4, 19, 18, 22, [120, 120, 120]), skin: dominant(bust, 8, 15, 9, 12, [200, 160, 130]) }
      } catch { AVS[i] = null }
    })
  }

    // ── Rider and bike (live: leans, kicks, rocks on its springs) ────────────
    function kickPose(r) {
      if (r.kickT <= 0) return { ext: 0, tuck: 0 }
      const t = clamp((KICK_T - r.kickT) / KICK_T, 0, 1)
      if (t < 0.18) return { ext: 0, tuck: ease.out(t / 0.18) }
      if (t < 0.42) return { ext: ease.outBack((t - 0.18) / 0.24), tuck: 1 - (t - 0.18) / 0.24 }
      if (t < 0.6) return { ext: 1, tuck: 0 }
      return { ext: 1 - ease.inOut((t - 0.6) / 0.4), tuck: 0 }
    }
    function drawBike(c, r, time) {
      const col = P.seat[r.i], C = P.rs[r.i], R = P.raw, spark = css(P.sunC, 1), sp = r.speed / MAXSPD
      if (r.state === 'down') return drawDown(c, r, time, col, C, R)
      softShadow(c, -12 - r.lean * 6, 40, 9)
      if (P.dark) { c.globalCompositeOperation = 'lighter'; poly(c, [-13, -34, 13, -34, 58, -270, -58, -270], lg(c, 0, -34, 0, -270, 0, css(C, 0.22), 1, css(C, 0))); c.globalCompositeOperation = 'source-over' }
      const kp = kickPose(r), k = kp.ext, ks = r.kickSide
      const vib = Math.sin(time * 61 + r.i) * 0.35 * (0.3 + sp), bob = Math.sin(time * 5.3 + r.i * 2) * 0.7
      c.rotate(r.lean * 0.3 + r.rec * 0.5 + Math.sin(time * 15 + r.i) * 0.07 * Math.min(1, r.strain) + (r.oil > 0 ? Math.sin(time * 19 + r.i) * 0.16 * Math.min(1, r.oil / 0.4) : 0))
      c.scale(1 + r.sq * 0.1, 1 - r.sq * 0.08)
      // Tyre: a rubber cylinder with rolling tread.
      rr(c, -9.5, -38, 19, 38, 7.5, lg(c, -9.5, 0, 9.5, 0, 0, css(mx(R.tire, BLACK, 0.5)), 0.35, css(R.tire), 0.72, css(mx(R.tire, R.metal, 0.35)), 1, css(R.tire)))
      const roll = (r.z / 46) % 1
      for (let i = 0; i < 5; i++) { const ty = -36 + ((i + roll) % 5) * 7; if (ty < -3) { limb(c, [-6, ty + 1.5, 0, ty, 6, ty + 1.5], 1.3, css(mx(R.tire, BLACK, 0.6))) } }
      c.save(); c.translate(vib, -r.susp + bob * 0.4)
      // Chain side and swingarm, rear shocks, twin pipes in brushed metal.
      rr(c, -13, -28, 4, 16, 2, css(mx(R.metal, BLACK, 0.45)))
      for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) limb(c, [s * 12 - 2.5, -40 - i * 3.4, s * 12 + 2.5, -41.6 - i * 3.4], 1.2, css(R.metal)); }
      for (const s of [-1, 1]) {
        rr(c, s * 19 - 4, -38, 8, 20, 3.5, lg(c, s * 19 - 4, 0, s * 19 + 4, 0, 0, da(R.metal, 0.5), 0.45, li(R.metal, 0.6), 0.7, css(R.metal), 1, da(R.metal, 0.4)))
        c.beginPath(); c.ellipse(s * 19, -18.5, 3.2, 1.8, 0, 0, 7); c.fillStyle = css(mx(R.tire, BLACK, 0.6)); c.fill()
      }
      if (r.boosting) { c.globalCompositeOperation = 'lighter'; for (const s of [-1, 1]) { const len = 16 + Math.random() * 12; poly(c, [s * 19 - 3.4, -19, s * 19 + 3.4, -19, s * 19 + (Math.random() - 0.5) * 3, -19 + len], lg(c, 0, -19, 0, -19 + len, 0, css(P.sunC, 0.95), 0.4, css(P.t.cta, 0.8), 1, css(P.t.danger, 0))); circ(c, s * 19, -17, 7, rg(c, s * 19, -17, 1, 7, 0, css(P.sunC, 0.7), 1, css(P.t.cta, 0))) } c.globalCompositeOperation = 'source-over' }
      // Tail unit in the seat colour, mudguard, lamp and plate.
      c.beginPath(); c.moveTo(-17, -35); c.lineTo(17, -35); c.quadraticCurveTo(15, -56, 9, -60); c.lineTo(-9, -60); c.quadraticCurveTo(-15, -56, -17, -35); c.closePath(); c.fillStyle = sideLit(c, -17, 17, mx(C, P.dkC, 0.25), 0.4); c.fill()
      rr(c, -10, -35, 20, 4, 1.5, css(mx(R.tire, R.metal, 0.2)))
      const lampOn = r.brk ? 1 : 0.55
      if (P.dark || r.brk) { c.globalCompositeOperation = 'lighter'; circ(c, 0, -47, 15, rg(c, 0, -47, 1, 15, 0, css(P.t.danger, 0.55 * lampOn), 1, css(P.t.danger, 0))); c.globalCompositeOperation = 'source-over' }
      rr(c, -8.5, -51, 17, 7, 3, lg(c, 0, -51, 0, -44, 0, li(P.t.danger, 0.35 * lampOn + 0.1), 1, da(P.t.danger, 0.35)))
      rr(c, -6, -50, 5, 2, 1, 'rgba(255,255,255,.6)'); rr(c, -6.5, -42, 13, 5.5, 1, css(R.paper)); rr(c, -4.5, -40.4, 9, 1.4, 0.6, css(R.ink, 0.5))
      // Legs: the one that is not kicking stays on its peg.
      for (const s of [-1, 1]) {
        if (kp.ext + kp.tuck > 0 && s === ks) continue
        limb(c, [s * 9, -61, s * 20.5, -48, s * 20.5, -36], 10, s > 0 ? li(R.pants, 0.12) : da(R.pants, 0.3))
        circ(c, s * 20.5, -48, 5.6, rg(c, s * 20.5 + 1.5, -49.5, 0.5, 6, 0, li(R.metal, 0.5), 1, da(R.metal, 0.35)))
        rr(c, s * 20.5 - 6.5, -39, 13, 10, 3, sideLit(c, s * 20.5 - 6.5, s * 20.5 + 6.5, R.tire, 0.3)); rr(c, s * 20.5 - 6.5, -31, 13, 2.3, 1, css(R.sole))
      }
      // Upper body shifts away from a kick and settles with the springs.
      c.save(); c.translate(-ks * (4.5 * k + 2 * kp.tuck), bob * 0.6 - r.susp * 0.35 + (r.boosting ? 4 : 0))
      limb(c, [-32, -75, 32, -75], 4, css(mx(R.tire, R.metal, 0.25)))
      for (const s of [-1, 1]) { rr(c, s * 31.5 - 4.5, -79, 9, 8, 3, sideLit(c, s * 31.5 - 4.5, s * 31.5 + 4.5, R.metal, 0.5)) }
      // With avatars on, the rider is the player's avatar seen from behind: their own top colour, their own hair or hat, no helmet.
      const av = hasAv(r.i), J = av ? AVC[r.i].top : C
      limb(c, [-15, -89, -24.5, -81, -28.5, -76], 9, da(J, 0.34)); limb(c, [15, -89, 24.5, -81, 28.5, -76], 9, li(J, 0.14))
      circ(c, -28.5, -76, 4.8, css(mx(R.tire, BLACK, 0.3))); circ(c, 28.5, -76, 4.8, css(R.tire))
      // Jacket: lit from the right, with a hem that flutters at speed.
      const fl = Math.sin(time * 23 + r.i) * 1.6 * sp
      c.beginPath(); c.moveTo(-15, -97); c.quadraticCurveTo(0, -101, 15, -97); c.quadraticCurveTo(19, -80, 17 + fl * 0.4, -58); c.quadraticCurveTo(8, -54 + fl, 0, -56 - fl * 0.5); c.quadraticCurveTo(-8, -54 - fl, -17 + fl * 0.4, -58); c.quadraticCurveTo(-19, -80, -15, -97); c.closePath()
      c.fillStyle = lg(c, -18, 0, 18, 0, 0, da(J, 0.42), 0.5, css(J), 0.86, li(J, 0.3), 1, li(J, 0.12)); c.fill()
      c.fillStyle = lg(c, 0, -100, 0, -56, 0, css(P.sunC, 0.16), 0.5, css(P.sunC, 0), 1, css(P.dkC, 0.22)); c.fill()
      circ(c, -15.5, -90, 7, rg(c, -14, -92, 1, 7, 0, css(J), 1, da(J, 0.4))); circ(c, 15.5, -90, 7, rg(c, 17.5, -92.5, 1, 7, 0, li(J, 0.5), 1, css(J)))
      rr(c, -5.5, -96, 11, 30, 5, lg(c, -5.5, 0, 5.5, 0, 0, css(P.dkC, 0.2), 0.6, css(P.sunC, 0.1), 1, css(P.sunC, 0.22)))
      rr(c, -9.5, -86, 19, 17, 3.5, av ? css(C) : css(R.paper)); c.fillStyle = av ? css(R.paper) : da(C, 0.3); c.font = '12px ' + fontFamily; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(r.i + 1), 0.5, -76.5)

      rr(c, -16.5, -64, 33, 6, 2.5, da(J, 0.5)); rr(c, -3, -64.5, 6, 7, 1.5, li(R.metal, 0.4))
      // Helmet: a lit sphere that turns toward the kick.
      const hx = r.look * 2.6
      if (av) {
        rr(c, -5, -97, 10, 7, 2.5, css(AVC[r.i].skin))
        const f = AVS[r.i].back, k = 2.15, x0 = hx - 12 * k, y0 = -93 - 16 * k
        c.imageSmoothingEnabled = false
        for (const d of [1.6, 1.1, 0.6]) c.drawImage(f.side, 0, 0, 24, 16, x0 - d * 1.3, y0 + d * 0.5, 24 * k, 16 * k)
        c.drawImage(f.lit, 0, 0, 24, 16, x0, y0, 24 * k, 16 * k); c.imageSmoothingEnabled = true
      } else {
      rr(c, -5.5, -99, 11, 6, 2.5, da(R.pants, 0.2))
      circ(c, hx, -107, 14, rg(c, hx + 5, -112.5, 1.5, 17, 0, li(R.helmet, 0.5), 0.5, css(R.helmet), 1, da(R.helmet, 0.5)))
      c.save(); c.beginPath(); c.arc(hx, -107, 14, 0, 7); c.clip()
      rr(c, hx - 14, -111.5, 28, 6, 0, sideLit(c, hx - 14, hx + 14, C, 0.4)); rr(c, hx - 2.8 + r.look * 4, -122, 5.6, 14, 2, sideLit(c, hx - 3, hx + 3, C, 0.3)); rr(c, hx - 14, -96.5, 28, 5, 0, css(P.dkC, 0.3))
      c.restore()
      c.beginPath(); c.ellipse(hx + 6, -113.5, 3.4, 2, -0.6, 0, 7); c.fillStyle = 'rgba(255,255,255,.75)'; c.fill()
      }
      c.restore()
      if (kp.ext + kp.tuck > 0) {
        const fx = ks * (21 + 37 * k - 5 * kp.tuck), fy = -45 - 7 * k - 8 * kp.tuck, kx = ks * (17 + 13 * k + 3 * kp.tuck), ky = -51 - 5 * k - 9 * kp.tuck
        limb(c, [ks * 9, -61, kx, ky, fx, fy], 14, css(R.ink, 0.55)); limb(c, [ks * 9, -61, kx, ky, fx, fy], 11, li(R.pants, 0.3))
        circ(c, kx, ky, 5.8, rg(c, kx + 1.5, ky - 1.5, 0.5, 6, 0, li(R.metal, 0.5), 1, da(R.metal, 0.35)))
        c.save(); c.translate(fx, fy); c.rotate(ks * (0.25 - 0.5 * k)); rr(c, -9.5, -8, 19, 16, 4.5, sideLit(c, -9.5, 9.5, R.tire, 0.3)); rr(c, ks > 0 ? 5 : -9.5, -8, 4.5, 16, 2, css(R.sole)); c.restore()
        if (k > 0.2) {
          c.globalAlpha *= Math.min(1, k) * 0.85
          c.beginPath(); c.arc(ks * 12, -49, 46 * k + 6, ks > 0 ? -0.55 : Math.PI - 0.45, ks > 0 ? 0.45 : Math.PI + 0.55); c.lineWidth = 4 - 2 * k; c.strokeStyle = spark; c.stroke()
          for (let i = -1; i <= 1; i++) limb(c, [fx + ks * 13, fy + i * 7, fx + ks * (19 + 8 * k), fy + i * 11], 1.8, spark)
          c.globalAlpha = 1
        }
      }
      c.restore()
      if (r.flash > 0) { const f = 1 - r.flash / 0.18; c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - f; c.beginPath(); c.arc(0, -62, 26 + f * 46, 0, 7); c.lineWidth = 7 * (1 - f) + 1; c.strokeStyle = spark; c.stroke(); circ(c, 0, -62, 30 * (1 - f), css(P.sunC, 0.5)); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over' }
    }
    // Off the bike: the bike slides on its side, the rider tumbles, sits, then gets back up.
    function drawDown(c, r, time, col, C, R) {
      const p = 1 - r.t / (r.tMax || DOWN_T), up = clamp((p - 0.74) / 0.26, 0, 1), fall = clamp(p / 0.2, 0, 1)
      softShadow(c, -10, 48, 8)
      c.save(); c.translate(-18 * (1 - up), -4); c.rotate(lerp(ease.out(fall) * 1.42, 0, ease.inOut(up)))
      rr(c, -9.5, -38, 19, 38, 7.5, lg(c, -9.5, 0, 9.5, 0, 0, css(mx(R.tire, BLACK, 0.5)), 0.6, css(R.tire), 1, css(mx(R.tire, R.metal, 0.3))))
      poly(c, [-17, -35, 17, -35, 10, -60, -10, -60], sideLit(c, -17, 17, mx(C, P.dkC, 0.25), 0.4)); rr(c, -8.5, -51, 17, 7, 3, css(P.t.danger))
      for (const s of [-1, 1]) rr(c, s * 19 - 4, -38, 8, 20, 3.5, sideLit(c, s * 19 - 4, s * 19 + 4, R.metal, 0.5))
      limb(c, [-32, -75, 32, -75], 4, css(R.tire)); c.restore()
      if (hasAv(r.i) && p >= 0.55) { c.save(); c.translate(lerp(40, 24, ease.inOut(up)), 0); c.rotate(Math.sin(time * 9) * 0.09 * (1 - up)); standee(c, r.i, 'idle', 0, 0, 64); c.restore(); if (up < 0.5) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; circ(c, 40 + Math.cos(a) * 20, -70 + Math.sin(a) * 6, 3, css(P.sunC)) } return }
      const hop = Math.abs(Math.sin(p * 10)) * 30 * Math.pow(1 - clamp(p / 0.6, 0, 1), 2)
      c.save(); c.translate(lerp(24 + p * 14, 2, ease.inOut(up)), lerp(-12 - hop, -58, ease.inOut(up))); c.rotate(lerp(p < 0.55 ? p * 17 : 1.5, 0, ease.inOut(up)))
      const flail = p < 0.55 ? time * 22 : 0
      limb(c, [-8, 14, -14 + Math.sin(flail) * 6, 30], 9, da(R.pants, 0.2)); limb(c, [8, 14, 15 + Math.cos(flail) * 6, 28], 9, css(R.pants))
      limb(c, [-13, -12, -24 + Math.cos(flail * 1.3) * 6, 2], 8, da(C, 0.3)); limb(c, [13, -12, 24 + Math.sin(flail * 1.3) * 6, 0], 8, li(C, 0.1))
      { const J = hasAv(r.i) ? AVC[r.i].top : C; rr(c, -15, -19, 30, 35, 10, lg(c, -15, 0, 15, 0, 0, da(J, 0.42), 0.5, css(J), 1, li(J, 0.3))) }
      if (hasAv(r.i)) { c.imageSmoothingEnabled = false; c.drawImage(AVS[r.i].back.lit, 0, 0, 24, 16, -21, -52, 42, 28); c.imageSmoothingEnabled = true }
      else { circ(c, 0, -28, 13, rg(c, 4.5, -33, 1.5, 16, 0, li(R.helmet, 0.5), 0.5, css(R.helmet), 1, da(R.helmet, 0.5))); rr(c, -13, -32, 26, 5.5, 2, css(C)) }
      c.restore()
      if (up < 0.5) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; c.save(); c.translate(26 + Math.cos(a) * 21, -58 + Math.sin(a) * 6); c.rotate(a * 2); poly(c, [0, -5, 1.5, -1.5, 5, 0, 1.5, 1.5, 0, 5, -1.5, 1.5, -5, 0, -1.5, -1.5], css(P.sunC)); c.restore() }
    }


    // ── DUST KICK: the horse seen from behind, and the Western scenery ──────────
    // The rider is the same avatar from behind as on the bike, under a hat and a duster; the horse
    // bucks to kick (the rump drops, then a hind leg lashes out to the kick side) and gallops on four
    // hooves. Colours are the theme's: coats and wood are mixes of the tokens (lib/sideKickPalette.js).
    function drawHorse(c, r, time) {
      const R = P.raw, C = P.rs[r.i], sp = r.speed / MAXSPD
      if (r.state === 'down') return drawHorseDown(c, r, time, C, R)
      const coat = mx(mx(R.coat, C, 0.3), R.paper, 0.18), coatD = mx(coat, BLACK, 0.4), spark = css(P.sunC, 1)
      const kp = kickPose(r), k = kp.ext, ks = r.kickSide
      const gal = (r.z / 34) * 6.283, sway = Math.sin(time * 7 + r.i) * (2 + 4 * sp)
      softShadow(c, -8 - r.lean * 5, 52, 10)
      if (P.dark) { c.globalCompositeOperation = 'lighter'; poly(c, [-13, -34, 13, -34, 58, -270, -58, -270], lg(c, 0, -34, 0, -270, 0, css(C, 0.18), 1, css(C, 0))); c.globalCompositeOperation = 'source-over' }
      c.rotate(r.lean * 0.22 + r.rec * 0.5 + (r.oil > 0 ? Math.sin(time * 19 + r.i) * 0.12 * Math.min(1, r.oil / 0.4) : 0) + (r.wob > 0 ? Math.sin(time * 17) * 0.1 : 0))
      c.scale(1 + r.sq * 0.1, 1 - r.sq * 0.08)
      const rise = kp.ext * 7 - kp.tuck * 5 + Math.sin(gal * 2) * 1.6 * Math.min(1, sp * 1.4)
      // Hind legs: the gallop lifts them in turn; on a kick the near one lashes out.
      for (const s of [-1, 1]) {
        const lash = kp.ext + kp.tuck > 0 && s === ks
        const ph = Math.sin(gal + (s > 0 ? 0 : 2.4)), lift = Math.max(0, ph) * 13 * Math.min(1, sp * 1.3)
        const hx = s * 11, hy = -42 - rise
        const fx = lash ? s * (16 + 38 * k) : s * 13 + ph * 2, fy = lash ? -28 - 20 * k : -lift
        limb(c, [hx, hy, s * 15, hy + 20 - lift * 0.4, fx, fy], 11, css(coatD))
        limb(c, [hx, hy, s * 15, hy + 20 - lift * 0.4, fx, fy], 8, css(coat))
        rr(c, fx - 6, fy - 3, 12, 6, 2.5, css(R.mane))
      }
      // Tail: a few swaying strands.
      for (let i = -2; i <= 2; i++) limb(c, [i * 2, -58 - rise, i * 4 + sway * 0.4, -38 - rise, i * 6 + sway * (0.7 + i * 0.05), -14 - rise * 0.5 - Math.abs(i) * 3], 3.4, i & 1 ? css(R.mane) : css(mx(R.mane, coat, 0.3)))
      // Rump and back: a lit barrel with a darker left side.
      c.beginPath(); c.ellipse(0, -60 - rise, 24, 26, 0, 0, 7); c.fillStyle = lg(c, -24, 0, 24, 0, 0, css(coatD), 0.5, css(coat), 1, li(coat, 0.3)); c.fill()
      c.beginPath(); c.ellipse(0, -60 - rise, 24, 26, 0, 0, 7); c.fillStyle = lg(c, 0, -86, 0, -34, 0, css(P.sunC, 0.18), 0.5, css(P.sunC, 0), 1, css(P.dkC, 0.3)); c.fill()
      limb(c, [0, -80 - rise, 0, -44 - rise], 1.4, css(coatD, 0.5))
      // Saddle blanket in the seat colour, then the saddle.
      rr(c, -20, -80 - rise, 40, 22, 5, lg(c, -20, 0, 20, 0, 0, da(C, 0.34), 0.55, css(C), 1, li(C, 0.25))); rr(c, -20, -69 - rise, 40, 3.5, 1, css(R.paper, 0.75))
      rr(c, -13, -86 - rise, 26, 12, 5, sideLit(c, -13, 13, R.wood, 0.35))
      // Rider (the avatar from behind) with a hat and a duster.
      const av = hasAv(r.i), J = av ? AVC[r.i].top : C, by = -rise * 0.8 - r.susp * 0.3
      c.save(); c.translate(-ks * (3.5 * k + 1.5 * kp.tuck), by)
      for (const s of [-1, 1]) { limb(c, [s * 9, -84, s * 25, -64, s * 24, -50], 9, s > 0 ? li(R.pants, 0.12) : da(R.pants, 0.3)); rr(c, s * 24 - 5, -52, 10, 8, 2.5, sideLit(c, s * 24 - 5, s * 24 + 5, R.tire, 0.3)) }
      const fl = Math.sin(time * 14 + r.i) * 2.4 * sp
      c.beginPath(); c.moveTo(-14, -118); c.quadraticCurveTo(0, -122, 14, -118); c.quadraticCurveTo(18, -100, 17 + fl * 0.4, -78); c.lineTo(23 + fl, -62); c.quadraticCurveTo(0, -60 + fl * 0.3, -23 - fl, -62); c.lineTo(-17 - fl * 0.4, -78); c.quadraticCurveTo(-18, -100, -14, -118); c.closePath()
      c.fillStyle = lg(c, -18, 0, 18, 0, 0, da(J, 0.42), 0.5, css(J), 0.86, li(J, 0.3), 1, li(J, 0.12)); c.fill()
      c.fillStyle = lg(c, 0, -122, 0, -62, 0, css(P.sunC, 0.16), 0.5, css(P.sunC, 0), 1, css(P.dkC, 0.22)); c.fill()
      limb(c, [-13, -112, -24, -98, -22, -86], 8, da(J, 0.34)); limb(c, [13, -112, 24, -98, 22, -86], 8, li(J, 0.14))
      rr(c, -9, -108, 18, 14, 3, av ? css(C) : css(R.paper)); c.fillStyle = av ? css(R.paper) : da(C, 0.3); c.font = '11px ' + fontFamily; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(r.i + 1), 0.5, -100.5)
      rr(c, -15, -86, 30, 5, 2, css(R.wood))
      const hx = r.look * 2.4
      if (av) {
        rr(c, -5, -125, 10, 7, 2.5, css(AVC[r.i].skin))
        const f = AVS[r.i].back, kk = 1.9, x0 = hx - 12 * kk, y0 = -121 - 14 * kk
        c.imageSmoothingEnabled = false
        for (const d of [1.4, 1, 0.5]) c.drawImage(f.side, 0, 0, 24, 14, x0 - d * 1.2, y0 + d * 0.4, 24 * kk, 14 * kk)
        c.drawImage(f.lit, 0, 0, 24, 14, x0, y0, 24 * kk, 14 * kk); c.imageSmoothingEnabled = true
      } else { rr(c, -5, -126, 10, 7, 2.5, da(R.pants, 0.2)); circ(c, hx, -134, 10, rg(c, hx + 3, -137, 1, 12, 0, li(R.paper, 0.2), 1, da(R.paper, 0.4))) }
      // The hat: a wide brim with a crown, tipped by the turn of the head.
      c.save(); c.translate(hx, -143 + (av ? 3 : 0)); c.rotate(r.look * 0.08)
      c.beginPath(); c.ellipse(0, 3, 21, 5.4, 0, 0, 7); c.fillStyle = lg(c, -21, 0, 21, 0, 0, da(R.hat, 0.3), 0.6, css(R.hat), 1, li(R.hat, 0.35)); c.fill()
      rr(c, -10, -12, 20, 15, 5, lg(c, -10, 0, 10, 0, 0, da(R.hat, 0.3), 0.6, css(R.hat), 1, li(R.hat, 0.3))); rr(c, -10, -2.6, 20, 3.4, 1, css(C)); c.restore()
      // A lasso being swung: a loop spinning over the rider's head.
      if (r.lassoT > 0) {
        const a = time * 22, rx = 26 + 4 * Math.sin(a * 0.5)
        c.save(); c.translate(0, -156); c.beginPath(); c.ellipse(0, 0, rx, 7, 0, 0, 7); c.lineWidth = 3.4; c.strokeStyle = css(R.rope); c.stroke()
        c.beginPath(); c.ellipse(0, 0, rx, 7, 0, a % 6.283, (a % 6.283) + 1.6); c.lineWidth = 3.4; c.strokeStyle = css(R.hayDark); c.stroke(); c.restore()
      }
      c.restore()
      if (k > 0.2) { c.globalAlpha *= Math.min(1, k) * 0.85; c.beginPath(); c.arc(ks * 14, -40, 40 * k + 6, ks > 0 ? -0.55 : Math.PI - 0.45, ks > 0 ? 0.45 : Math.PI + 0.55); c.lineWidth = 4 - 2 * k; c.strokeStyle = spark; c.stroke(); c.globalAlpha = 1 }
      // A caught rope: a loop drawn tight round the horse.
      if (r.roped > 0) { c.beginPath(); c.ellipse(0, -62, 31, 38, 0, 0, 7); c.lineWidth = 4; c.strokeStyle = css(R.rope); c.stroke(); c.lineWidth = 1.6; c.strokeStyle = css(R.hayDark); c.stroke() }
      if (r.flash > 0) { const f = 1 - r.flash / 0.18; c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - f; c.beginPath(); c.arc(0, -62, 26 + f * 46, 0, 7); c.lineWidth = 7 * (1 - f) + 1; c.strokeStyle = spark; c.stroke(); circ(c, 0, -62, 30 * (1 - f), css(P.sunC, 0.5)); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over' }
    }
    // Off the horse: the horse stumbles onto its side and the rider tumbles, sits, and climbs back on.
    function drawHorseDown(c, r, time, C, R) {
      const p = 1 - r.t / (r.tMax || DOWN_T), up = clamp((p - 0.74) / 0.26, 0, 1), fall = clamp(p / 0.2, 0, 1)
      const coat = mx(R.coat, C, 0.12), coatD = mx(coat, BLACK, 0.4)
      softShadow(c, -10, 54, 8)
      c.save(); c.translate(-18 * (1 - up), -4); c.rotate(lerp(ease.out(fall) * 1.42, 0, ease.inOut(up)))
      for (const s of [-1, 1]) limb(c, [s * 11, -42, s * 15, -24, s * 14 + Math.sin(time * 12 + s) * 4 * (1 - up), -6], 10, css(coatD))
      c.beginPath(); c.ellipse(0, -60, 24, 26, 0, 0, 7); c.fillStyle = lg(c, -24, 0, 24, 0, 0, css(coatD), 0.5, css(coat), 1, li(coat, 0.3)); c.fill()
      rr(c, -20, -80, 40, 20, 5, css(C)); for (let i = -2; i <= 2; i++) limb(c, [i * 2, -58, i * 5, -36, i * 7, -16], 3.2, css(R.mane))
      c.restore()
      if (hasAv(r.i) && p >= 0.55) { c.save(); c.translate(lerp(40, 24, ease.inOut(up)), 0); c.rotate(Math.sin(time * 9) * 0.09 * (1 - up)); standee(c, r.i, 'idle', 0, 0, 64); c.restore(); if (up < 0.5) for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; circ(c, 40 + Math.cos(a) * 20, -70 + Math.sin(a) * 6, 3, css(P.sunC)) } return }
      const hop = Math.abs(Math.sin(p * 10)) * 30 * Math.pow(1 - clamp(p / 0.6, 0, 1), 2)
      c.save(); c.translate(lerp(24 + p * 14, 2, ease.inOut(up)), lerp(-12 - hop, -58, ease.inOut(up))); c.rotate(lerp(p < 0.55 ? p * 17 : 1.5, 0, ease.inOut(up)))
      const flail = p < 0.55 ? time * 22 : 0
      limb(c, [-8, 14, -14 + Math.sin(flail) * 6, 30], 9, da(R.pants, 0.2)); limb(c, [8, 14, 15 + Math.cos(flail) * 6, 28], 9, css(R.pants))
      limb(c, [-13, -12, -24 + Math.cos(flail * 1.3) * 6, 2], 8, da(C, 0.3)); limb(c, [13, -12, 24 + Math.sin(flail * 1.3) * 6, 0], 8, li(C, 0.1))
      { const J = hasAv(r.i) ? AVC[r.i].top : C; rr(c, -15, -19, 30, 35, 10, lg(c, -15, 0, 15, 0, 0, da(J, 0.42), 0.5, css(J), 1, li(J, 0.3))) }
      if (hasAv(r.i)) { c.imageSmoothingEnabled = false; c.drawImage(AVS[r.i].back.lit, 0, 0, 24, 16, -21, -52, 42, 28); c.imageSmoothingEnabled = true }
      else circ(c, 0, -28, 12, rg(c, 4.5, -33, 1.5, 16, 0, li(R.paper, 0.3), 1, da(R.paper, 0.4)))
      c.beginPath(); c.ellipse(0, -46, 20, 5, 0, 0, 7); c.fillStyle = css(R.hat); c.fill(); rr(c, -9, -58, 18, 13, 4, css(R.hat))
      c.restore()
    }
    function drawWeed(c, w, time) {
      const R = P.raw, hop = Math.abs(Math.sin(time * 5 + w.spin * 9)) * 9, a0 = time * 4 * (w.dir || 1) + w.spin * 6
      softShadow(c, 0, 24, 5, 0.9)
      c.save(); c.translate(0, -15 - hop); c.rotate(a0)
      for (let i = 0; i < 9; i++) { const a = i * 0.7 + w.spin; c.beginPath(); c.ellipse(0, 0, 14 + (i % 3) * 2, 6 + (i % 4), a, 0, 7); c.lineWidth = 1.7; c.strokeStyle = i & 1 ? css(mx(R.hay, R.trunk, 0.55)) : css(mx(R.trunk, R.hay, 0.3)); c.stroke() }
      c.restore()
    }
    const DUSTPAINT = {
      saguaro(g, v) {
        const R = P.raw, hgt = 120 + v * 40, arm = 50 + v * 30
        softShadow(g, -14, 44, 8); rr(g, -8, -hgt, 16, hgt, 8, sideLit(g, -8, 8, R.cactus, 0.42))
        limb(g, [-6, -arm, -26, -arm - 2, -26, -arm - 34], 10, sideLit(g, -30, -6, R.cactus, 0.4)); limb(g, [6, -arm - 22, 25, -arm - 24, 25, -arm - 52], 10, css(R.cactus))
        for (const x of [-3, 3]) limb(g, [x, -hgt + 6, x, -6], 1, css(mx(R.cactus, WHITE, 0.3), 0.5))
      },
      mesa(g, v) {
        const R = P.raw, h = 110 + v * 70, w = 74 + v * 22
        softShadow(g, -26, 100, 11)
        poly(g, [-w, 0, -w + 10, -h * 0.55, -w + 22, -h * 0.58, -w + 30, -h, w - 30, -h, w - 22, -h * 0.62, w - 8, -h * 0.5, w, 0], lg(g, -w, 0, w, 0, 0, da(R.mesa, 0.5), 0.5, css(R.mesa), 1, li(R.mesa, 0.4)))
        for (let q = 1; q < 5; q++) limb(g, [-w + 6, -h * q / 5, w - 6, -h * q / 5], 1.6, css(R.mesaDark, 0.4))
        poly(g, [-w + 30, -h, w - 30, -h, w - 22, -h + 9, -w + 22, -h + 9], css(mx(R.mesa, R.paper, 0.35)))
      },
      boulder(g, v) {
        const R = P.raw, w = 30 + v * 16
        softShadow(g, -10, w * 1.7, 7); poly(g, [-w, 0, -w * 0.9, -w * 0.6, -w * 0.3, -w * 1.05, w * 0.45, -w * 0.95, w, -w * 0.4, w * 0.9, 0], lg(g, -w, 0, w, 0, 0, da(R.rockC, 0.4), 0.5, css(R.rockC), 1, li(R.rockC, 0.4)))
        limb(g, [-w * 0.4, -w * 0.8, -w * 0.1, -w * 0.3], 1.4, css(R.rockDark, 0.5))
      },
      pole(g, v) {
        const R = P.raw
        softShadow(g, -6, 24, 4); rr(g, -3.5, -196, 7, 196, 2, sideLit(g, -3.5, 3.5, R.wood, 0.4)); rr(g, -28, -190, 56, 5, 2, css(R.wood)); rr(g, -22, -176, 44, 4, 2, css(R.wood))
        for (const x of [-24, -12, 12, 24]) rr(g, x - 1.6, -197, 3.2, 8, 1.5, li(R.paper, 0.1))
        if (v) limb(g, [-24, -190, -80, -168], 0.9, css(R.rockDark, 0.6)); else limb(g, [24, -190, 80, -168], 0.9, css(R.rockDark, 0.6))
      },
      wagon(g, v) {
        const R = P.raw, col = P.rs[(v | 0) % 4]
        softShadow(g, -10, 96, 8); rr(g, -76, -22, 152, 8, 2, css(R.tire))
        for (const x of [-52, -30, 30, 52]) { circ(g, x, -11, 9, css(mx(R.tire, R.metal, 0.3))); circ(g, x, -11, 3.6, css(R.metal)) }
        rr(g, -74, -76, 148, 58, 4, lg(g, -74, 0, 74, 0, 0, da(col, 0.4), 0.5, css(mx(col, R.wood, 0.4)), 1, li(col, 0.2)))
        for (let x = -70; x < 72; x += 14) limb(g, [x, -74, x, -20], 1, css(R.mesaDark, 0.4))
        rr(g, -78, -82, 156, 7, 2, css(mx(R.wood, BLACK, 0.2))); rr(g, -26, -52, 52, 32, 2, css(R.mesaDark, 0.4))
      },
      shop(g, v) {
        const R = P.raw, wall = v < 0.5 ? R.house : mx(R.house, R.rockC, 0.3)
        softShadow(g, -16, 120, 10)
        rr(g, -56, -112, 112, 112, 2, sideLit(g, -56, 56, wall, 0.35))
        poly(g, [-60, -112, -60, -128, -24, -128, -24, -140, 24, -140, 24, -128, 60, -128, 60, -112], sideLit(g, -60, 60, mx(wall, R.wood, 0.3), 0.35))
        rr(g, -38, -134, 76, 16, 3, css(R.paper)); for (const x of [-26, -10, 8, 22]) rr(g, x, -131, 8, 3, 1, css(R.ink, 0.6))
        for (const x of [-44, 20]) { rr(g, x, -88, 24, 30, 2, lg(g, 0, -88, 0, -58, 0, css(mx(R.sky0, P.dkC, 0.3)), 1, css(R.sky1))); limb(g, [x + 12, -88, x + 12, -58], 1.4, css(R.wood)) }
        rr(g, -12, -62, 24, 62, 2, css(mx(R.wood, BLACK, 0.2))); rr(g, -62, -64, 124, 5, 1, css(mx(R.wood, BLACK, 0.1)))
        for (let x = -60; x < 60; x += 12) rr(g, x, -59, 6, 14, 1, (x / 12) & 1 ? css(R.paper) : css(P.rs[(v * 4) | 0]))
        for (const x of [-56, 52]) rr(g, x, -62, 4, 62, 1, css(R.wood))
      },
      tower(g) {
        const R = P.raw
        softShadow(g, -10, 70, 8)
        for (const x of [-30, -10, 10, 30]) limb(g, [x * 0.5, -88, x, 0], 5, css(R.wood)); limb(g, [-28, -10, 28, -78], 2, css(R.wood)); limb(g, [28, -10, -28, -78], 2, css(R.wood))
        rr(g, -42, -158, 84, 74, 8, lg(g, -42, 0, 42, 0, 0, da(R.wood, 0.4), 0.5, css(R.wood), 1, li(R.wood, 0.3)))
        for (let y = -150; y < -88; y += 14) limb(g, [-42, y, 42, y], 2, css(R.rockDark, 0.7))
        poly(g, [-48, -158, 0, -196, 48, -158], lg(g, -48, 0, 48, 0, 0, da(R.roof, 0.4), 0.5, css(R.roof), 1, li(R.roof, 0.3)))
      },
      hay(g) {
        const R = P.raw
        softShadow(g, -6, 40, 6)
        rr(g, -24, -27, 48, 27, 5, lg(g, -24, 0, 24, 0, 0, da(R.hay, 0.3), 0.55, css(R.hay), 1, li(R.hay, 0.4))); rr(g, -24, -27, 48, 8, 4, li(R.hay, 0.4))
        for (const x of [-10, 10]) rr(g, x - 1.4, -27, 2.8, 27, 1, css(R.hayDark, 0.8))
        for (let i = 0; i < 7; i++) limb(g, [-20 + i * 6.5, -25, -17 + i * 6.5, -6], 0.9, css(R.hayDark, 0.4))
        for (const q of [[-18, -31, -8, -37], [4, -30, 14, -38], [-2, -30, -6, -39]]) limb(g, [q[0], q[1], q[2], q[3]], 1.6, css(R.hay))
        g.globalCompositeOperation = 'lighter'; circ(g, 0, -14, 26, rg(g, 0, -14, 2, 26, 0, css(P.sunC, P.dark ? 0.32 : 0.16), 1, css(P.sunC, 0))); g.globalCompositeOperation = 'source-over'
      },
      coil(g) {
        const R = P.raw
        softShadow(g, -6, 30, 5); rr(g, -5, -84, 10, 84, 3, sideLit(g, -5, 5, R.wood, 0.4)); rr(g, -6, -88, 12, 8, 3, li(R.wood, 0.25))
        for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(0, -50 - i * 5, 24 - i * 1.6, 11 - i * 0.6, 0, 0, 7); g.lineWidth = 3.4; g.strokeStyle = i & 1 ? css(R.rope) : css(mx(R.rope, R.hayDark, 0.5)); g.stroke() }
        limb(g, [20, -48, 28, -26, 24, -14], 2.6, css(R.rope)); circ(g, 0, -92, 3.6, css(P.t.cta))
        g.globalCompositeOperation = 'lighter'; circ(g, 0, -58, 34, rg(g, 0, -58, 2, 34, 0, css(P.t.cta, P.dark ? 0.4 : 0.22), 1, css(P.t.cta, 0))); g.globalCompositeOperation = 'source-over'
      },
      rock(g, v) {
        const R = P.raw, w = 44 + v * 12
        softShadow(g, -12, w * 2, 8)
        poly(g, [-w, 0, -w * 0.92, -w * 0.5, -w * 0.5, -w * 1.0, w * 0.1, -w * 1.18, w * 0.62, -w * 0.9, w, -w * 0.4, w * 0.9, 0], lg(g, -w, 0, w, 0, 0, da(R.rockDark, 0.2), 0.5, css(R.rockC), 1, li(R.rockC, 0.5)))
        poly(g, [-w * 0.5, -w * 1.0, w * 0.1, -w * 1.18, w * 0.62, -w * 0.9, w * 0.2, -w * 0.72], css(mx(R.rockC, WHITE, 0.3), 0.7))
        limb(g, [-w * 0.3, -w * 0.9, -w * 0.15, -w * 0.4, -w * 0.4, -w * 0.15], 1.8, css(R.rockDark, 0.8)); limb(g, [w * 0.3, -w * 0.8, w * 0.5, -w * 0.3], 1.6, css(R.rockDark, 0.7))
      },
      cactus(g, v) {
        const R = P.raw
        softShadow(g, -8, 38, 6)
        g.beginPath(); g.ellipse(0, -22, 19, 23, 0, 0, 7); g.fillStyle = lg(g, -19, 0, 19, 0, 0, da(R.cactus, 0.4), 0.55, css(R.cactus), 1, li(R.cactus, 0.35)); g.fill()
        for (const x of [-10, -3, 4, 11]) limb(g, [x, -42, x * 1.1, -2], 1.2, css(R.rockDark, 0.4))
        for (let i = 0; i < 12; i++) circ(g, -14 + ((i * 7) % 28), -38 + ((i * 11) % 34), 1.1, css(R.paper, 0.9))
        circ(g, 0, -46, 6, css(R.flower)); circ(g, 0, -46, 2.4, css(R.hay)); if (v > 0.5) circ(g, -9, -40, 3.4, css(R.flower))
      },
      log(g) {
        const R = P.raw
        softShadow(g, 0, 150, 9)
        rr(g, -128, -42, 256, 42, 18, lg(g, 0, -42, 0, 0, 0, li(R.wood, 0.4), 0.45, css(R.wood), 1, da(R.wood, 0.5)))
        for (let x = -108; x < 116; x += 26) limb(g, [x, -36, x + 9, -4], 1.5, css(R.rockDark, 0.5))
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 126, -21, 9, 21, 0, 0, 7); g.fillStyle = css(mx(R.wood, R.paper, 0.35)); g.fill(); g.beginPath(); g.ellipse(s * 126, -21, 4.5, 11, 0, 0, 7); g.lineWidth = 1.4; g.strokeStyle = css(R.rockDark, 0.5); g.stroke() }
        rr(g, -128, -42, 256, 8, 4, 'rgba(255,255,255,.18)')
      },
      sign(g) {
        const R = P.raw
        softShadow(g, -8, 30, 5); rr(g, -3.5, -88, 7, 88, 2, sideLit(g, -3.5, 3.5, R.wood, 0.4))
        poly(g, [0, -150, 36, -92, -36, -92], css(R.ink)); poly(g, [0, -141, 28, -97, -28, -97], lg(g, 0, -141, 0, -97, 0, li(R.hay, 0.2), 1, da(R.hay, 0.2)))
        rr(g, -2.6, -130, 5.2, 17, 2, css(R.ink)); circ(g, 0, -105, 3, css(R.ink))
      },
      mud(g) {
        const R = P.raw, rx = 150, ry = 30
        g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7); g.fillStyle = css(mx(R.trunk, BLACK, 0.5), 0.9); g.fill()
        g.beginPath(); g.ellipse(-6, -2, rx * 0.8, ry * 0.7, 0, 0, 7); g.fillStyle = css(mx(R.trunk, R.hayDark, 0.4), 0.85); g.fill()
        g.beginPath(); g.ellipse(rx * 0.28, -ry * 0.3, rx * 0.26, ry * 0.2, 0, 0, 7); g.fillStyle = css(mx(R.sky1, R.paper, 0.4), 0.45); g.fill()
      },
    }
    const DUSTBOX = { saguaro: [-60, -190, 60, 12], mesa: [-110, -200, 110, 14], boulder: [-60, -80, 60, 12], pole: [-90, -210, 90, 8], wagon: [-100, -100, 100, 12], shop: [-100, -150, 100, 14], tower: [-70, -210, 70, 12], hay: [-44, -50, 44, 10], coil: [-50, -110, 50, 8], rock: [-80, -90, 80, 14], cactus: [-48, -60, 48, 10], log: [-170, -60, 170, 12], sign: [-52, -160, 52, 8], mud: [-170, -40, 170, 40] }
    const DUSTUNITS = { saguaro: 11, mesa: 16, boulder: 10, pole: 11, wagon: 12, shop: 13, tower: 14, hay: 5.4, coil: 6, rock: 5.4, cactus: 5.4, log: 5.4, sign: 8, weed: 5.4, horse: 5.4 }
    const dustSprite = (kind, v) => { const b = DUSTBOX[kind]; return sprite(`d-${kind}${v}`, b[0], b[1], b[2], b[3], (g) => DUSTPAINT[kind](g, v)) }

    // ── Traffic and scenery (painted once per theme) ─────────────────────────
    function paintCar(g, B, van) {
      const R = P.raw
      softShadow(g, -10, 78, 12, 1.2)
      for (const s of [-1, 1]) { rr(g, s * 45 - 11, -16, 22, 17, 5, lg(g, 0, -16, 0, 1, 0, css(R.tire), 1, css(mx(R.tire, BLACK, 0.7)))); for (let i = -1; i <= 1; i++) rr(g, s * 45 + i * 6 - 1, -15, 2, 15, 1, css(mx(R.tire, BLACK, 0.55))) }
      rr(g, -52, -20, 104, 10, 3, css(mx(R.tire, BLACK, 0.4)))
      for (const x of [-30, -22]) { circ(g, x, -9, 3.4, li(R.metal, 0.4)); circ(g, x, -9, 2, css(mx(R.tire, BLACK, 0.7))) }
      const paint = (x, y, w, h, r) => { rr(g, x, y, w, h, r, lg(g, 0, y, 0, y + h, 0, li(B, 0.5), 0.14, css(B), 0.62, css(B), 1, da(B, 0.5))); rr(g, x, y, w, h, r, lg(g, x, 0, x + w, 0, 0, css(P.dkC, 0.34), 0.5, css(P.dkC, 0), 1, css(P.sunC, 0.14))) }
      const glass = (pts, y0, y1) => { poly(g, pts, lg(g, 0, y0, 0, y1, 0, css(mx(R.sky0, P.dkC, 0.45)), 0.55, css(mx(R.sky1, P.dkC, 0.2)), 1, css(mx(R.grassA, P.dkC, 0.45)))) }
      if (van) {
        paint(-57, -118, 114, 108, 11)
        rr(g, -50, -124, 6, 8, 2, li(R.metal, 0.3)); rr(g, 44, -124, 6, 8, 2, li(R.metal, 0.3)); rr(g, -54, -126, 108, 3.5, 1.5, lg(g, 0, -126, 0, -122, 0, li(R.metal, 0.6), 1, da(R.metal, 0.3)))
        glass([-47, -106, -4, -106, -4, -68, -47, -68], -106, -68); glass([4, -106, 47, -106, 47, -68, 4, -68], -106, -68)
        poly(g, [-44, -104, -30, -104, -40, -70, -45, -70], 'rgba(255,255,255,.2)'); poly(g, [8, -104, 16, -104, 9, -70, 6, -70], 'rgba(255,255,255,.16)')
        rr(g, -0.8, -112, 1.6, 100, 0.8, css(P.dkC, 0.45)); rr(g, -10, -62, 6, 10, 2, lg(g, -10, 0, -4, 0, 0, da(R.metal, 0.3), 1, li(R.metal, 0.6))); rr(g, 4, -62, 6, 10, 2, lg(g, 4, 0, 10, 0, 0, da(R.metal, 0.3), 1, li(R.metal, 0.6)))
        rr(g, -57, -34, 114, 2, 1, css(P.dkC, 0.3))
      } else {
        poly(g, [-46, -60, -36, -92, 36, -92, 46, -60], lg(g, 0, -92, 0, -60, 0, li(B, 0.5), 0.2, css(B), 1, da(B, 0.25)))
        glass([-39, -62, -31, -86, 31, -86, 39, -62], -86, -62)
        rr(g, -22, -76, 13, 12, 3, css(P.dkC, 0.4)); rr(g, 9, -76, 13, 12, 3, css(P.dkC, 0.4))
        poly(g, [-36, -64, -30, -84, -14, -84, -22, -64], 'rgba(255,255,255,.22)'); poly(g, [14, -64, 19, -84, 24, -84, 20, -64], 'rgba(255,255,255,.14)')
        rr(g, -9, -85, 18, 2.6, 1.3, css(P.t.danger))
        paint(-59, -66, 118, 58, 14)
        limb(g, [-44, -53, 44, -53], 1, css(P.dkC, 0.4)); limb(g, [-38, -64, 38, -64], 1.2, 'rgba(255,255,255,.35)')
        circ(g, 0, -46, 3, lg(g, -3, 0, 3, 0, 0, da(R.metal, 0.3), 1, li(R.metal, 0.7)))
      }
      for (const s of [-1, 1]) { rr(g, s * 44 - 11, -51, 22, 13, 4.5, lg(g, 0, -51, 0, -38, 0, li(P.t.danger, 0.3), 1, da(P.t.danger, 0.45))); rr(g, s * 44 - 9, -49, 8, 3, 1.5, 'rgba(255,255,255,.6)'); rr(g, s * 44 + (s > 0 ? -9 : 3), -43, 6, 3.5, 1.5, css(mx(P.t.cta, P.sunC, 0.4))) }
      rr(g, -15, -37, 30, 13, 2, css(R.paper)); rr(g, -15, -37, 30, 13, 2, lg(g, 0, -37, 0, -24, 0, 'rgba(255,255,255,.3)', 1, css(P.dkC, 0.15))); g.fillStyle = css(R.ink); g.font = '6px ' + fontFamily; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GN42', 0.5, -30)
      rr(g, -61, -23, 122, 12, 5, lg(g, 0, -23, 0, -11, 0, li(R.metal, 0.55), 0.35, css(R.metal), 1, da(R.metal, 0.5))); rr(g, -56, -21.5, 112, 2, 1, 'rgba(255,255,255,.5)')
      rr(g, -58, -18, 8, 4, 1.5, css(P.t.danger)); rr(g, 50, -18, 8, 4, 1.5, css(P.t.danger))
    }
    function blob(g, x, y, r, a) { circ(g, x, y, r, rg(g, x + r * 0.34, y - r * 0.36, r * 0.08, r * 1.05, 0, li(a, 0.42), 0.55, css(a), 1, da(a, 0.42))) }
    const PAINT = {
      pine(g, v) {
        const R = P.raw, t = v ? [R.aut0, R.aut1, R.aut2] : [R.leaf0, R.leaf1, R.leaf2]
        softShadow(g, -16, 50, 9); rr(g, -5, -38, 10, 38, 2, sideLit(g, -5, 5, R.trunk, 0.4))
        const tiers = [[-28, -92, 42], [-60, -124, 34], [-94, -150, 25], [-124, -168, 15]]
        tiers.forEach((q, i) => {
          const base = q[0], top = q[1], hw = q[2]
          g.beginPath(); g.moveTo(0, top); const n = 7
          for (let j = n; j >= -n; j--) g.lineTo((j / n) * hw, base + (j & 1 ? 0 : 7) - Math.abs(j / n) * 3)
          g.closePath(); g.fillStyle = lg(g, -hw, 0, hw, 0, 0, da(t[0], 0.45), 0.5, css(t[Math.min(2, i ? 1 : 0)]), 1, li(t[2], 0.4)); g.fill()
          g.fillStyle = lg(g, 0, top, 0, base + 6, 0, css(P.sunC, 0.18), 0.5, css(P.sunC, 0), 1, css(P.dkC, 0.38)); g.fill()
        })
      },
      tree(g, v) {
        const R = P.raw, t = v ? [R.aut0, R.aut1, R.aut2] : [R.leaf0, R.leaf1, R.leaf2]
        softShadow(g, -18, 58, 10)
        limb(g, [0, 0, 0, -56], 11, sideLit(g, -6, 6, R.trunk, 0.4)); limb(g, [0, -44, -16, -66], 6, da(R.trunk, 0.3)); limb(g, [0, -40, 15, -64], 6, li(R.trunk, 0.15))
        for (const q of [[-26, -72, 26, 0], [24, -76, 25, 0], [-4, -66, 24, 0], [-14, -100, 28, 1], [16, -98, 26, 1], [0, -118, 24, 1], [18, -112, 15, 2], [-22, -86, 14, 1], [6, -82, 17, 2]]) blob(g, q[0], q[1], q[2], t[q[3]])
        const rn = mulberry(v ? 5 : 3); for (let i = 0; i < 22; i++) { const a = rn() * 6.28, d = rn() * 34; circ(g, 2 + Math.cos(a) * d * 1.1, -94 + Math.sin(a) * d, 1.6 + rn() * 1.6, li(t[2], 0.3 + rn() * 0.3)) }
      },
      bush(g) { const R = P.raw; softShadow(g, -8, 40, 7); blob(g, -17, -14, 18, R.leaf0); blob(g, 15, -15, 20, R.leaf1); blob(g, -2, -27, 18, R.leaf2); for (const q of [[-10, -32], [12, -24], [2, -14], [-20, -18]]) { circ(g, q[0], q[1], 3.2, css(R.flower)); circ(g, q[0] + 0.8, q[1] - 0.8, 1.2, 'rgba(255,255,255,.7)') } },
      chev(g, d) { const R = P.raw; softShadow(g, -8, 30, 5); rr(g, -3, -62, 6, 62, 2, sideLit(g, -3, 3, R.post, 0.4)); rr(g, -37, -116, 74, 62, 9, css(R.ink)); rr(g, -33, -112, 66, 54, 6, lg(g, 0, -112, 0, -58, 0, li(R.pow, 0.4), 1, da(R.pow, 0.2))); limb(g, [-d * 12, -99, d * 8, -85, -d * 12, -71], 9, css(R.ink)); rr(g, -33, -112, 66, 10, 5, 'rgba(255,255,255,.22)') },
      lamp(g, d) { const R = P.raw; softShadow(g, -6, 24, 4); rr(g, -5, -8, 10, 8, 2, da(R.post, 0.3)); rr(g, -3, -192, 6, 192, 3, sideLit(g, -3, 3, R.post, 0.45)); limb(g, [0, -190, d * 30, -202, d * 54, -198], 5, css(R.post)); rr(g, d * 54 - 13, -201, 26, 9, 4, lg(g, 0, -201, 0, -192, 0, li(R.metal, 0.5), 1, da(R.metal, 0.4))); rr(g, d * 54 - 9, -193.5, 18, 4, 2, css(P.dark ? P.t.cta : R.lit)) },
      board(g, v) {
        const R = P.raw
        softShadow(g, -16, 70, 8)
        for (const x of [-44, 37]) rr(g, x, -72, 7, 72, 2, sideLit(g, x, x + 7, R.post, 0.4)); limb(g, [-40, -8, 40, -60], 2, css(R.post)); limb(g, [40, -8, -40, -60], 2, css(R.post))
        rr(g, -68, -154, 136, 90, 8, lg(g, -68, 0, 68, 0, 0, da(R.ink, 0), 1, css(mx(R.ink, R.metal, 0.3)))); rr(g, -62, -148, 124, 78, 5, lg(g, 0, -148, 0, -70, 0, li(R.paper, 0.4), 1, da(R.paper, 0.18)))
        for (let i = 0; i < 4; i++) { const a = P.rs[(i + v) % 4]; rr(g, -56 + i * 28.5, -142, 26, 15, 3, lg(g, 0, -142, 0, -127, 0, li(a, 0.3), 1, da(a, 0.2))) }
        g.fillStyle = css(R.ink); g.font = '15px ' + fontFamily; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GAME', 0, -109); g.fillText('NIGHT', 0, -88)
        poly(g, [-62, -148, -20, -148, -52, -70, -62, -70], 'rgba(255,255,255,.12)')
        for (const x of [-40, 0, 40]) { rr(g, x - 5, -162, 10, 5, 2, css(R.metal)); if (P.dark) circ(g, x, -154, 9, css(P.t.cta, 0.35)) }
      },
      house(g, v) {
        const R = P.raw
        if (P.dark) {
          const h = 170 + v * 60; softShadow(g, -14, 60, 8)
          rr(g, -42, -h, 84, h, 3, sideLit(g, -42, 42, R.house, 0.35))
          for (let y = 14; y < h - 16; y += 19) for (let x = -32; x < 28; x += 17) { const on = ((x * 7 + y * 13 + v * 31) % 5 + 5) % 5; if (on > 1) rr(g, x, -h + y, 10, 11, 1, css(on > 3 ? P.t.p1 : P.t.cta, 0.55 + on * 0.1)) ; else rr(g, x, -h + y, 10, 11, 1, css(BLACK, 0.4)) }
          rr(g, -46, -h - 5, 92, 7, 2, da(R.house, 0.4)); rr(g, -1.5, -h - 34, 3, 30, 1, css(R.post))
        } else {
          softShadow(g, -22, 80, 10)
          const wall = v ? mx(R.house, P.t.tintCta, 0.6) : R.house
          rr(g, -46, -64, 92, 64, 2, sideLit(g, -46, 46, wall, 0.3)); rr(g, -46, -64, 92, 12, 0, css(P.dkC, 0.28))
          rr(g, 15, -122, 12, 28, 1, sideLit(g, 15, 27, mx(R.roof, P.dkC, 0.3), 0.3)); rr(g, 13, -125, 16, 5, 1, da(R.roof, 0.5))
          poly(g, [-58, -62, 58, -62, 32, -106, -32, -106], lg(g, -58, 0, 58, 0, 0, da(R.roof, 0.45), 0.55, css(R.roof), 1, li(R.roof, 0.35)))
          for (let y = -98; y < -62; y += 7) limb(g, [-32 - (y + 106) * 0.59, y, 32 + (y + 106) * 0.59, y], 0.8, css(P.dkC, 0.3))
          rr(g, -10, -34, 20, 34, 2, sideLit(g, -10, 10, R.trunk, 0.35)); circ(g, 6, -17, 1.6, li(R.metal, 0.6)); rr(g, -13, -2, 26, 3, 1, da(wall, 0.4))
          for (const x of [-37, 19]) { rr(g, x - 2, -52, 22, 22, 1.5, css(R.paper)); rr(g, x, -50, 18, 18, 1, lg(g, 0, -50, 0, -32, 0, css(mx(R.sky0, P.dkC, 0.4)), 1, css(R.sky1))); rr(g, x + 8.3, -50, 1.4, 18, 0, css(R.paper)); rr(g, x, -41.7, 18, 1.4, 0, css(R.paper)); poly(g, [x + 1, -49, x + 7, -49, x + 2, -34, x + 1, -34], 'rgba(255,255,255,.35)'); rr(g, x - 3, -31, 24, 4, 1, css(R.roof)) }
          for (let x = -66; x <= 66; x += 9) if (Math.abs(x) > 50) rr(g, x - 2, -20, 4, 20, 1, sideLit(g, x - 2, x + 2, R.paper, 0.3))
        }
      },
    }
    const BOX = { pine: [-56, -172, 46, 12], tree: [-80, -146, 56, 14], bush: [-52, -50, 40, 10], chev: [-42, -120, 40, 8], lamp: [-72, -206, 72, 8], board: [-90, -168, 72, 12], house: [-110, -260, 70, 14], car: [-92, -130, 70, 16] }
    const UNITS = { bike: 5.4, car: 6.5, pine: 13, tree: 12, bush: 9, tuft: 6, flag: 6.5, chev: 8, lamp: 9, board: 11, house: 14 }
    function staticSprite(kind, v) { const b = BOX[kind]; return sprite(kind + v, b[0], b[1], b[2], b[3], (g) => PAINT[kind](g, v)) }
    function carSprite(car) { const b = BOX.car; return sprite('car' + car.col + (car.van ? 'v' : 's'), b[0], b[1], b[2], b[3], (g) => paintCar(g, P.rc[car.col], car.van)) }
    // Things that move on their own: cloth, grass.
    function drawFlag(c, q, time) {
      const R = P.raw, a = P.rs[q.v | 0]
      softShadow(c, -4, 16, 3); rr(c, -2, -152, 4, 152, 2, sideLit(c, -2, 2, R.post, 0.45)); circ(c, 0, -154, 4.5, li(R.pow, 0.3))
      for (let i = 0; i < 9; i++) {
        const u0 = i / 9, u1 = (i + 1) / 9, w0 = Math.sin(time * 7.5 - i * 0.8 + q.x * 9) * 4 * u0, w1 = Math.sin(time * 7.5 - (i + 1) * 0.8 + q.x * 9) * 4 * u1
        poly(c, [2 + u0 * 46, -148 + w0 + u0 * 8, 2 + u1 * 46 + 0.6, -148 + w1 + u1 * 8, 2 + u1 * 46 + 0.6, -118 + w1 - u1 * 8, 2 + u0 * 46, -118 + w0 - u0 * 8], w1 - w0 > 0 ? da(a, 0.28) : li(a, 0.22))
      }
    }
    function drawTuft(c, q, time) {
      const R = P.raw, sw = Math.sin(time * 2.4 + q.v * 40) * 3
      for (let i = -3; i <= 3; i++) limb(c, [i * 4, 0, i * 5 + sw * 0.5, -8, i * 7 + sw, -14 - (i & 1) * 6], 2.2, i & 1 ? li(R.leaf1, 0.2) : da(R.leaf0, 0.1))
      if (q.v < 0.5) { circ(c, -10 + sw, -20, 4, css(R.flower)); circ(c, 9 + sw, -24, 4.2, css(R.paper)); circ(c, 9 + sw, -24, 1.7, css(R.pow)) }
    }

    // ── World-space effects: they stay on the road and recede like everything else ─
    const wps = [], skids = []
    function puff(kind, z, x, h, o) { if (wps.length > 170) wps.shift(); wps.push(Object.assign({ kind, z, x, h, vz: 0, vx: 0, vh: 0, life: 0.6, max: 0.6, size: 60, grow: 2 }, o)) }
    function stepEffects(dt) {
      for (let i = wps.length - 1; i >= 0; i--) { const p = wps[i]; p.life -= dt; if (p.life <= 0) { wps.splice(i, 1); continue } p.z += p.vz * dt; p.x += p.vx * dt; p.h += p.vh * dt; if (p.kind === 'spark' || p.kind === 'chip' || p.kind === 'slick') { p.vh -= 2600 * dt; if (p.h < 0) { p.h = 0; p.vh *= -0.4 } } else p.vz *= Math.exp(-2.5 * dt) }
      if (phase === 'count' || phase === 'done') return
      for (const r of riders) {
        const sp = r.speed / MAXSPD
        if (r.state === 'down') {
          if (r.speed > 1500) { if (Math.random() < 0.8) puff('spark', r.z + 40, r.x - 0.012, 20, { vz: r.speed * (0.7 + Math.random() * 0.3), vx: (Math.random() - 0.5) * 0.5, vh: 300 + Math.random() * 600, life: 0.35, max: 0.35, size: 14 }); if (Math.random() < 0.5) puff('dust', r.z, r.x, 30, { vz: r.speed * 0.5, vh: 160, size: 120, grow: 2.5, life: 0.9, max: 0.9 }); skids.push({ z: r.z, x: r.x - 0.012, i: r.i, w: 0.9 }) }
          continue
        }
        if (dust) { if (sp > 0.25 && Math.random() < 0.55 * sp) for (const s of [-1, 1]) puff('dust', r.z - 30, r.x + s * 0.05, 6, { vz: r.speed * 0.5, vx: s * 0.05, vh: 90, size: 38, grow: 3, life: 0.55, max: 0.55 }) }
        else if (!r.brk && sp < 0.97 && Math.random() < 0.3 + (1 - sp) * 0.5) for (const s of [-1, 1]) puff('smoke', r.z - 30, r.x + s * 0.05, 100, { vz: r.speed * 0.72, vx: s * 0.05, vh: 110, size: 34, grow: 3.2, life: 0.5, max: 0.5 })
        if (Math.abs(r.x) > 1.02 && Math.random() < 0.7) { puff('dust', r.z - 20, r.x + (Math.random() - 0.5) * 0.06, 40, { vz: r.speed * 0.6, vh: 220, size: 90, grow: 3, life: 0.7, max: 0.7 }); if (Math.random() < 0.4) puff('chip', r.z, r.x, 30, { vz: r.speed * 0.8, vx: (Math.random() - 0.5) * 0.4, vh: 500 + Math.random() * 500, size: 12, life: 0.5, max: 0.5 }) }
        if (r.cu > 0 || r.boosting) for (const s of [-1, 1]) puff('spark', r.z - 20, r.x + s * 0.05, 95, { vz: r.speed * 0.8, vx: s * 0.1, vh: 40 + Math.random() * 120, life: 0.22, max: 0.22, size: 16 })
        if (r.oil > 0) {
          // Slick: dark droplets flick off the tyres and the bike leaves a dark smear.
          if (Math.random() < 0.75) puff('slick', r.z - 10, r.x + (Math.random() - 0.5) * 0.1, 10, { vz: r.speed * 0.45, vx: (Math.random() - 0.5) * 0.9, vh: 260 + Math.random() * 420, life: 0.5, max: 0.5, size: 12 + Math.random() * 8 })
          skids.push({ z: r.z, x: r.x, i: r.i, w: 0.6 })
        }
        if (r.stag > 0) { if (Math.random() < 0.6) puff('smoke', r.z - 20, r.x, 20, { vz: r.speed * 0.7, vh: 150, size: 70, grow: 2.6, life: 0.6, max: 0.6 }); skids.push({ z: r.z, x: r.x, i: r.i, w: 0.5 }) }
        else if (r.oil <= 0 && skids.length && skids[skids.length - 1].i === r.i && !skids[skids.length - 1].end) skids[skids.length - 1].end = true
        // Wind lines trail a rider that has someone sitting in their wake.
        if (riders.some((o) => inWake(o, r)) && Math.random() < 0.5) puff('wind', r.z - 40, r.x + (Math.random() - 0.5) * 0.14, 40 + Math.random() * 60, { vz: r.speed * 0.8, life: 0.35, max: 0.35, size: 26 + Math.random() * 18 })
      }
      if (skids.length > 260) skids.splice(0, skids.length - 260)
    }

    // ── Render one rider's seat ──────────────────────────────────────────────
    let frame = 0, skyOff = 0, camSm = 0, reducedNow = false
    const parts = [], tags = []
    const peaks = (() => { const r = mulberry(7), a = []; for (let i = 0; i < 24; i++) a.push(16 + r() * 50); return a })()
    const stars = (() => { const r = mulberry(11), a = []; for (let i = 0; i < 46; i++) a.push([r() * W, r() * (HORIZ - 30), 0.6 + r() * 1.1, r() * 6]); return a })()
    function cloudSprite(v) {
      return sprite('cloud' + v, -70, -40, 70, 26, (g) => {
        const R = P.raw, rn = mulberry(31 + v * 7), lit = mx(R.cloud, P.sunC, 0.3), under = mx(mx(R.sky0, R.cloud, 0.55), P.dkC, 0.1)
        const bl = []; for (let i = 0; i < 7; i++) bl.push([-44 + i * 15 + rn() * 6, -4 - rn() * 14 - (i > 1 && i < 5 ? 8 : 0), 13 + rn() * 9])
        for (const b of bl) circ(g, b[0], b[1] + 9, b[2], css(under))
        for (const b of bl) circ(g, b[0] + 2, b[1], b[2], rg(g, b[0] + b[2] * 0.4, b[1] - b[2] * 0.4, b[2] * 0.1, b[2], 0, css(lit), 0.7, css(R.cloud), 1, css(mx(R.cloud, under, 0.6))))
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = lg(g, 0, 8, 0, 26, 0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,1)'); g.fillRect(-70, 8, 140, 18)
      })
    }
    function ridge(c, base, scale, off, front, back, snow) {
      const mo = ((off % 720) + 720) % 720, m0 = Math.floor(mo / 30), pk = (i) => peaks[(((i + m0) % 24) + 24) % 24] * scale, X = (i) => i * 30 - (mo % 30)
      c.beginPath(); c.moveTo(-30, base + 2); for (let i = -1; i <= 14; i++) c.lineTo(X(i), base - pk(i)); c.lineTo(W + 30, base + 2); c.closePath(); c.fillStyle = back; c.fill()
      for (let i = 0; i <= 13; i++) { const h = pk(i); if (h > pk(i - 1) && h > pk(i + 1)) { poly(c, [X(i), base - h, X(i + 1), base - pk(i + 1), X(i) + 9, base + 2, X(i) - 3, base - h * 0.4], front); if (snow && h > 46 * scale) { poly(c, [X(i), base - h, X(i) - 7, base - h + 11, X(i) - 2, base - h + 8, X(i) + 2, base - h + 13, X(i) + 8, base - h + 9], css(P.t.card, 0.95)); poly(c, [X(i), base - h, X(i) - 7, base - h + 11, X(i) - 2, base - h + 8, X(i), base - h + 4], css(P.dkC, 0.18)) } } }
    }
    function hills(c, base, amp, a, off, f) {
      c.beginPath(); c.moveTo(0, HORIZ + 2)
      for (let x = 0; x <= W; x += 6) { const u = (x + off) * f; c.lineTo(x, base - amp * (0.5 + 0.34 * Math.sin(u) + 0.16 * Math.sin(u * 2.7 + 1.3))) }
      c.lineTo(W, HORIZ + 2); c.closePath(); c.fillStyle = lg(c, 0, base - amp, 0, HORIZ, 0, P.dark ? css(a) : li(a, 0.3), 1, da(a, 0.12)); c.fill()
    }
    function backdrop(c, time) {
      if (dust) return dustBackdrop(c, time)
      const R = P.raw
      c.fillStyle = P.dark ? lg(c, 0, 0, 0, HORIZ, 0, P.sky0, 0.6, css(mx(R.sky0, R.sky1, 0.35)), 1, P.sky1) : lg(c, 0, 0, 0, HORIZ, 0, da(R.sky0, 0.22), 0.4, P.sky0, 0.8, P.sky1, 1, css(mx(R.sky1, P.sunC, 0.45)))
      c.fillRect(0, 0, W, HORIZ + 2)
      const sx = 262 - ((skyOff * 0.05) % 40 + 40) % 40
      if (P.dark) {
        for (const s of stars) { c.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(time * 1.3 + s[3])); circ(c, s[0], s[1], s[2], P.paper) } c.globalAlpha = 1
        c.globalCompositeOperation = 'lighter'; c.fillStyle = rg(c, sx, HORIZ - 66, 20, 150, 0, css(P.t.p2, 0.5), 1, css(P.t.p2, 0)); c.fillRect(0, 0, W, HORIZ + 2); c.globalCompositeOperation = 'source-over'
        circ(c, sx, HORIZ - 66, 52, lg(c, 0, HORIZ - 118, 0, HORIZ - 14, 0, P.sun0, 1, P.sun1))
        for (let i = 0; i < 6; i++) { c.fillStyle = css(mx(R.sky0, R.sky1, 0.45 + i * 0.09)); c.fillRect(sx - 56, HORIZ - 72 + i * 11, 112, 1.5 + i * 1.1) }
      } else {
        c.globalCompositeOperation = 'lighter'; c.fillStyle = rg(c, sx, 60, 8, 170, 0, css(P.sunC, 0.6), 0.25, css(P.sunC, 0.18), 1, css(P.sunC, 0)); c.fillRect(0, 0, W, HORIZ + 2); c.globalCompositeOperation = 'source-over'
        circ(c, sx, 60, 22, rg(c, sx, 60, 4, 22, 0, WHITE_CSS, 0.7, css(mx(P.sunC, [255, 255, 255], 0.5)), 1, css(P.sunC, 0.9)))
      }
      for (let i = 0; i < 6; i++) {
        const far = i % 2, cx = ((i * 97 + 30 - skyOff * (far ? 0.07 : 0.14) + time * (far ? 1.5 : 3.5)) % (W + 220) + W + 220) % (W + 220) - 110, cy = (far ? 96 : 34) + (i * 29) % 46, s = far ? 0.45 : 0.75 + (i % 3) * 0.2
        c.save(); c.translate(cx, cy); c.scale(s, s); c.globalAlpha = P.dark ? 0.16 : far ? 0.75 : 0.96; put(c, cloudSprite(i % 3)); c.restore()
      }
      if (!P.dark) for (let i = 0; i < 3; i++) { const bx = ((time * 14 + i * 13 + 40 - skyOff * 0.1) % (W + 80) + W + 80) % (W + 80) - 40, by = 84 + i * 7 + Math.sin(time * 0.7 + i) * 6, f = Math.sin(time * 9 + i * 1.7) * 3; limb(c, [bx - 5, by + f, bx, by, bx + 5, by + f], 1.2, css(P.dkC, 0.55)) }
      ridge(c, HORIZ, 1.15, skyOff * 0.1, P.dark ? css(mx(R.mount, P.t.p3, 0.12)) : css(mx(R.mount, P.sunC, 0.42)), css(mx(R.mount, R.sky1, P.dark ? 0.2 : 0.5)), !P.dark)
      if (P.dark) { c.lineWidth = 1; c.strokeStyle = css(P.t.p3, 0.35); c.stroke() }
      c.fillStyle = lg(c, 0, HORIZ - 60, 0, HORIZ + 2, 0, css(R.fog, 0), 1, css(R.fog, P.dark ? 0.45 : 0.5)); c.fillRect(0, HORIZ - 60, W, 62)
      hills(c, HORIZ, 44, R.hillFar, skyOff * 0.25, 0.021)
      hills(c, HORIZ + 2, 25, R.hillNear, skyOff * 0.55 + 90, 0.034)
      c.fillStyle = lg(c, 0, HORIZ - 16, 0, HORIZ + 3, 0, css(R.fog, 0), 1, css(R.fog, 0.55)); c.fillRect(0, HORIZ - 16, W, 19)
      c.fillStyle = P.grassA; c.fillRect(0, HORIZ, W, H - HORIZ)
    }

    // The Western sky: a low sun, thin cloud, far mesas stepping down to the verge.
    function mesaRidge(c, base, scale, off, fill, shade) {
      const mo = ((off % 1104) + 1104) % 1104, m0 = Math.floor(mo / 46), pk = (i) => (14 + peaks[(((i + m0) % 24) + 24) % 24] * 0.9) * scale, X = (i) => i * 46 - (mo % 46)
      for (let i = -1; i <= 9; i++) {
        const h = pk(i), x0 = X(i), w = 28 + (peaks[(((i + m0) % 24) + 24) % 24] % 18), left = x0, right = x0 + w
        poly(c, [left - 10, base + 2, left, base - h * 0.72, left + 5, base - h, right - 5, base - h, right, base - h * 0.72, right + 10, base + 2], fill)
        poly(c, [right - 5, base - h, right, base - h * 0.72, right + 10, base + 2, right - 2, base + 2], shade)
      }
    }
    function dustBackdrop(c, time) {
      const R = P.raw
      c.fillStyle = lg(c, 0, 0, 0, HORIZ, 0, P.sky0, 0.55, css(mx(R.sky0, R.sky1, 0.55)), 1, P.sky1)
      c.fillRect(0, 0, W, HORIZ + 2)
      const sx = 238 - ((skyOff * 0.05) % 30 + 30) % 30, sy = HORIZ - 40
      c.globalCompositeOperation = 'lighter'; c.fillStyle = rg(c, sx, sy, 6, 190, 0, css(R.sun0, P.dark ? 0.45 : 0.5), 0.4, css(R.sun1, 0.16), 1, css(R.sun1, 0)); c.fillRect(0, 0, W, HORIZ + 2); c.globalCompositeOperation = 'source-over'
      circ(c, sx, sy, 30, lg(c, 0, sy - 30, 0, sy + 30, 0, css(R.sun0), 1, css(R.sun1)))
      if (P.dark) for (const s of stars) { c.globalAlpha = 0.25 + 0.4 * Math.abs(Math.sin(time * 1.3 + s[3])); circ(c, s[0], s[1], s[2], P.paper) }
      c.globalAlpha = 1
      for (let i = 0; i < 4; i++) {
        const far = i % 2, cx = ((i * 131 + 30 - skyOff * (far ? 0.07 : 0.14) + time * (far ? 1.2 : 2.6)) % (W + 220) + W + 220) % (W + 220) - 110, cy = (far ? 88 : 40) + (i * 23) % 36, sc = far ? 0.4 : 0.7
        c.save(); c.translate(cx, cy); c.scale(sc, sc); c.globalAlpha = P.dark ? 0.12 : far ? 0.55 : 0.8; put(c, cloudSprite(i % 3)); c.restore()
      }
      mesaRidge(c, HORIZ, 1.35, skyOff * 0.1, css(mx(R.mount, R.sky1, 0.25)), css(mx(R.mount, P.dkC, 0.3)))
      c.fillStyle = lg(c, 0, HORIZ - 50, 0, HORIZ + 2, 0, css(R.fog, 0), 1, css(R.fog, P.dark ? 0.45 : 0.55)); c.fillRect(0, HORIZ - 50, W, 52)
      mesaRidge(c, HORIZ + 1, 0.8, skyOff * 0.22 + 120, css(mx(R.hillFar, R.rockC, 0.3)), css(mx(R.hillFar, P.dkC, 0.3)))
      hills(c, HORIZ + 2, 22, R.hillNear, skyOff * 0.55 + 90, 0.034)
      c.fillStyle = lg(c, 0, HORIZ - 14, 0, HORIZ + 3, 0, css(R.fog, 0), 1, css(R.fog, 0.55)); c.fillRect(0, HORIZ - 14, W, 17)
      c.fillStyle = P.grassA; c.fillRect(0, HORIZ, W, H - HORIZ)
    }
    function render(c, view, time, main) {
      frame++; tags.length = 0
      const first = main && camMode === 'first'
      const cam = riders[view], camZ = first ? cam.z - FP_BACK : cam.z - PLAYERZ, camX = (main ? camSm : cam.x) * ROAD, camY = (first ? FP_H : CAMH) + roadY(cam.z) + (main ? cam.susp * (first ? 9 : 5) : 0), sp = cam.speed / MAXSPD, R = P.raw
      backdrop(c, time)
      const bi = Math.max(0, Math.floor(camZ / SEG)), bp = camZ > 0 ? (camZ - bi * SEG) / SEG : 0, F = P.fogTab
      let x = 0, dx = -(segs[bi].curve * bp), maxy = H, vanX = W / 2
      for (let n = 0; n < DRAW; n++) {
        const s = segs[bi + n]; if (!s) break
        const cz1 = s.z - camZ, cz2 = cz1 + SEG, X1 = x, X2 = x + dx
        x += dx; dx += s.curve
        if (cz1 <= 30) { s._f = 0; continue }
        const sc1 = camd / cz1, sc2 = camd / cz2
        let x1 = W / 2 + sc1 * (X1 - camX) * W / 2, y1 = HORIZ + sc1 * (camY - s.y1) * YS, w1 = sc1 * ROAD * W / 2
        const x2 = W / 2 + sc2 * (X2 - camX) * W / 2, y2 = HORIZ + sc2 * (camY - s.y2) * YS, w2 = sc2 * ROAD * W / 2
        s._f = frame; s._sc1 = sc1; s._sc2 = sc2; s._x1 = x1; s._y1 = y1; s._x2 = x2; s._y2 = y2; s._clip = maxy
        if (n === 90) vanX = x2
        if (y2 >= maxy || y2 >= y1) continue
        if (y1 > maxy) { const t = (maxy - y2) / (y1 - y2); x1 = lerp(x2, x1, t); w1 = lerp(w2, w1, t); y1 = maxy }
        const q = Math.round((1 - Math.exp(-Math.pow(n / DRAW, 2) * 3.2)) * 24), yb = y1, yt = y2 - 1
        const strip = (l0, l1, col) => poly(c, [x1 + w1 * l0, yb, x1 + w1 * l1, yb, x2 + w2 * l1, yt, x2 + w2 * l0, yt], col)
        c.fillStyle = F[s.dark ? 'grassB' : 'grassA'][q]; c.fillRect(0, yt, W, yb - yt)
        strip(-1.3, 1.3, F.dirt[q])
        strip(-1.09, 1.09, F[s.dark ? 'kerbA' : 'kerbB'][q])
        strip(-1, 1, F[s.dark ? 'roadA' : 'roadB'][q])
        if (n < 60) { const wear = css(P.dark ? BLACK : P.dkC, 0.1 * (1 - n / 60)); for (const l of LANEX) for (const o of [-0.09, 0.09]) poly(c, [x1 + w1 * (l + o - 0.04), yb, x1 + w1 * (l + o + 0.04), yb, x2 + w2 * (l + o + 0.04), y2, x2 + w2 * (l + o - 0.04), y2], wear) }
        if (!dust) {
          strip(-0.967, -0.943, F.edge[q]); strip(0.943, 0.967, F.edge[q])
          if (s.dark) { strip(-0.514, -0.486, F.lane[q]); strip(0.486, 0.514, F.lane[q]); strip(-0.014, 0.014, F.center[q]) }
        }
        maxy = y2
      }
      // The low sun (or the neon horizon) glances off the tarmac.
      c.globalCompositeOperation = 'lighter'
      const gc = P.dark ? P.t.p2 : P.sunC
      c.fillStyle = rg(c, vanX, HORIZ + 4, 4, 190, 0, css(gc, P.dark ? 0.3 : 0.2), 0.5, css(gc, 0.05), 1, css(gc, 0)); c.fillRect(0, HORIZ, W, 200)
      c.globalCompositeOperation = 'source-over'
      const pt = (z, xn) => {
        const s = segAt(z); if (s._f !== frame) return null
        const cz = z - camZ; if (cz < 120) return null
        const sc = camd / cz, t = (sc - s._sc1) / (s._sc2 - s._sc1), cx = lerp(s._x1, s._x2, t)
        return { cx, x: cx + sc * xn * ROAD * W / 2, y: lerp(s._y1, s._y2, t), u: sc * W / 2, sc, clip: s._clip, cz }
      }
      // Skid marks lie on the road.
      c.lineCap = 'round'
      for (let i = 1; i < skids.length; i++) {
        const a = skids[i - 1], b = skids[i]; if (a.i !== b.i || a.end || b.z - a.z > 600 || b.z < a.z) continue
        const p = pt(a.z, a.x), q = pt(b.z, b.x); if (!p || !q || p.y > p.clip || q.y > q.clip) continue
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineWidth = Math.max(0.6, p.u * 70 * b.w); c.strokeStyle = css(P.dark ? BLACK : P.dkC, 0.4); c.stroke()
      }
      // Everything standing on the road, far to near.
      const list = []
      for (let n = Math.min(DRAW, segs.length - bi) - 1; n >= 0; n--) { const s = segs[bi + n]; for (const q of s.spr) list.push({ z: s.z + SEG / 2, x: q.x, q }) }
      for (const car of cars) if (car.z > camZ && car.z < camZ + DRAW * SEG) list.push({ z: car.z, x: car.x, car })
      for (const w of weeds) if (w.z > camZ && w.z < camZ + DRAW * SEG) list.push({ z: w.z, x: w.x, wd: w })
      for (const r of riders) if (!(first && r === cam)) list.push({ z: r.z, x: r.x, r })
      for (const w of wps) list.push({ z: w.z, x: w.x, w })
      list.sort((a, b) => b.z - a.z)
      for (const o of list) {
        if (dust && o.q && (o.q.k === 'hay' || o.q.k === 'coil') && cam.got.has(o.q.id)) continue
        const p = pt(o.z, o.x); if (!p) continue
        const cx = p.cx, sy = p.y, unit = p.u, px = p.x, sc = p.sc
        if (px < -220 || px > W + 220) continue
        const far = clamp((p.cz / (DRAW * SEG) - 0.45) * 2.2, 0, 0.8)
        c.save()
        if (sy > p.clip + 1) { c.beginPath(); c.rect(0, 0, W, p.clip); c.clip() }
        if (o.w) {
          const w = o.w, a = w.life / w.max, size = unit * w.size * (1 + w.grow * (1 - a)), y = sy - unit * w.h
          if (w.kind === 'spark') { c.globalCompositeOperation = 'lighter'; limb(c, [px, y, px + (Math.random() - 0.5) * size * 2, y + size * 1.2], Math.max(1, size * 0.3), css(mx(P.sunC, P.t.cta, 0.4), a)) }
          else if (w.kind === 'slick') { c.globalAlpha = a; circ(c, px, y, size * 0.5, css(P.dark ? BLACK : mx(P.t.text, BLACK, 0.4), 0.92)); circ(c, px - size * 0.15, y - size * 0.18, size * 0.18, css(P.t.p1, 0.75)) }
          else if (w.kind === 'wind') { c.globalAlpha = a * 0.55; limb(c, [px, y, px, y + size * 1.6], Math.max(1, size * 0.07), P.paper) }
          else if (w.kind === 'chip') { c.globalAlpha = a; rr(c, px - size / 2, y - size / 2, size, size, size * 0.2, F.dirt[0]) }
          else { c.globalAlpha = a * (w.kind === 'smoke' ? 0.34 : 0.5); const d = dot(w.kind === 'smoke' ? mx(R.metal, R.paper, 0.5) : mx(R.dirt, R.paper, 0.35)); c.drawImage(d.cv, px - size, y - size, size * 2, size * 2) }
        } else if (o.wd) {
          const k = unit * DUSTUNITS.weed
          c.translate(px, sy); c.scale(k, k); drawWeed(c, o.wd, time)
        } else if (dust && o.q && o.q.k === 'oil') {
          const k = unit * 5.4
          c.translate(px, sy); c.scale(k, k); put(c, dustSprite('mud', 0))
        } else if (o.q && (o.q.k === 'oil' || o.q.k === 'patch')) {
          if (o.q.k === 'patch') { c.beginPath(); c.ellipse(px, sy, unit * (180 + o.q.v * 260), unit * (26 + o.q.v * 22), 0, 0, 7); c.fillStyle = css(P.dark ? BLACK : P.dkC, 0.14 + o.q.v * 0.1); c.fill() }
          else {
            const rx = unit * 330, ry = rx * 0.2
            c.beginPath(); c.ellipse(px, sy, rx, ry, 0, 0, 7); c.fillStyle = css(P.dark ? BLACK : mx(P.t.text, BLACK, 0.4), 0.82); c.fill()
            c.save(); c.translate(px, sy); c.scale(1, 0.2); c.globalCompositeOperation = 'lighter'
            c.fillStyle = rg(c, -rx * 0.25, -rx * 0.5, rx * 0.05, rx * 0.8, 0, css(P.t.p4, 0.5), 0.35, css(P.t.p2, 0.3), 0.7, css(P.t.p1, 0.18), 1, css(P.t.p1, 0)); c.beginPath(); c.arc(0, 0, rx, 0, 7); c.fill(); c.restore()
            c.beginPath(); c.ellipse(px + rx * 0.3, sy - ry * 0.35, rx * 0.25, ry * 0.18, 0, 0, 7); c.fillStyle = css(P.sunC, 0.4); c.fill()
          }
        } else if (o.q && o.q.k === 'gate') {
          const w = sc * ROAD * W / 2 * 1.16, top = sy - unit * 1750, band = unit * 380, pw = unit * 130
          const postC = dust ? R.wood : R.paper
          for (const s of [-1, 1]) { softShadow2(c, cx + s * w - pw, sy, pw * 2.4, pw * 0.5); rr(c, cx + s * w - pw / 2, top, pw, sy - top, pw * 0.25, lg(c, cx + s * w - pw / 2, 0, cx + s * w + pw / 2, 0, 0, da(postC, 0.4), 0.6, css(postC), 1, li(postC, 0.3))) }
          const face = dust ? mx(R.wood, BLACK, 0.2) : o.q.v ? R.ink : P.rs[0]
          rr(c, cx - w - pw / 2, top, 2 * w + pw, band, unit * 50, lg(c, 0, top, 0, top + band, 0, li(face, 0.3), 0.3, css(face), 1, da(face, 0.35)))
          if (o.q.v && !dust) { const n = 14, cw = (2 * w) / n; for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) { c.fillStyle = P.paper; c.fillRect(cx - w + i * cw, top + band * 0.14 + j * band * 0.36, cw, band * 0.36) } }
          else if (band > 9) { c.fillStyle = dust ? css(R.hay) : P.dark ? P.ink : P.paper; c.font = Math.floor(band * (dust ? 0.4 : 0.5)) + 'px ' + fontFamily; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(dust && o.q.v ? 'FINISH' : 'START', cx, top + band * 0.55) }
          if (!dust) for (let i = 0; i < 9; i++) { const bx = cx - w * 0.88 + i * w * 0.22, sw = Math.sin(time * 6 + i * 1.3) * band * 0.08; poly(c, [bx - band * 0.24, top + band, bx + band * 0.24, top + band, bx + sw, top + band * 1.65], P.seat[i % 4].main) }
          c.fillStyle = css(P.dkC, 0.22); c.fillRect(cx - w, top + band, 2 * w, band * 0.18)
        } else {
          const kind = o.r ? 'bike' : o.car ? 'car' : o.q.k, k = unit * ((dust && DUSTUNITS[kind === 'bike' ? 'horse' : kind]) || UNITS[kind])
          c.translate(px, sy); c.scale(k, k)
          if (o.r) {
            if (o.r.shield > 0 && Math.floor(time * 14) % 2 === 0) c.globalAlpha = 0.4
            if (dust) drawHorse(c, o.r, time); else drawBike(c, o.r, time)
            c.globalAlpha = 1
            if (main) { o.r._sx = px; o.r._sy = sy; o.r._k = k }
          } else if (o.car) {
            c.translate(0, Math.sin(time * 5 + o.car.z0) * 0.5); put(c, carSprite(o.car))
            if (P.dark) { c.globalCompositeOperation = 'lighter'; for (const s of [-1, 1]) circ(c, s * 44, -45, 20, rg(c, s * 44, -45, 2, 20, 0, css(P.t.danger, 0.55), 1, css(P.t.danger, 0))) }
          } else {
            if (far > 0) c.globalAlpha = 1 - far
            if (kind === 'flag') drawFlag(c, o.q, time)
            else if (kind === 'tuft') drawTuft(c, o.q, time)
            else if (dust && DUSTPAINT[kind]) {
              const qv = kind === 'pole' || kind === 'wagon' ? (o.q.v | 0) : Math.min(3, Math.floor((o.q.v || 0) * 4)) / 3
              if (kind === 'saguaro') c.transform(1, 0, Math.sin(time * 0.9 + o.q.x * 5) * 0.012, 1, 0, 0)
              put(c, dustSprite(kind, qv))
            }
            else {
              const v = kind === 'pine' ? (o.q.v < 0.5 ? 0 : 1) : kind === 'tree' ? (o.q.v < 0.6 ? 0 : 1) : kind === 'house' ? (P.dark ? Math.floor(o.q.v * 3) : o.q.v < 0.5 ? 0 : 1) : kind === 'board' ? (o.q.v | 0) : kind === 'bush' ? 0 : o.q.v
              if (kind === 'pine' || kind === 'tree' || kind === 'bush') c.transform(1, 0, Math.sin(time * 1.3 + o.q.x * 7 + o.z * 0.001) * (kind === 'bush' ? 0.02 : 0.035), 1, 0, 0)
              put(c, staticSprite(kind, v))
              if (kind === 'lamp' && P.dark) { const d = o.q.v, fl = 0.85 + 0.15 * Math.sin(time * 17 + o.z); c.globalCompositeOperation = 'lighter'; circ(c, d * 54, -190, 40, rg(c, d * 54, -190, 2, 40, 0, css(P.t.cta, 0.6 * fl), 1, css(P.t.cta, 0))); c.save(); c.scale(1, 0.22); circ(c, d * 70, 0, 110, rg(c, d * 70, 0, 6, 110, 0, css(P.t.cta, 0.3 * fl), 1, css(P.t.cta, 0))); c.restore() }
              if (kind === 'house' && P.dark && Math.sin(time * 3 + o.z) > 0) { c.globalCompositeOperation = 'lighter'; circ(c, 0, -(170 + v * 60) - 36, 7, css(P.t.danger, 0.9)) }
            }
          }
        }
        c.restore()
        if (o.r && o.r.i !== view && p.cz < 9000) tags.push({ x: px, y: sy - 136 * unit * UNITS.bike - 6, r: o.r })
      }
      // Lens: a little light leak from the sun side, and a vignette that tightens with speed.
      if (!P.dark) { c.globalCompositeOperation = 'lighter'; c.fillStyle = lg(c, W, 0, W * 0.3, H * 0.6, 0, css(P.sunC, 0.16), 1, css(P.sunC, 0)); c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over' }
      const vc = P.dark ? BLACK : P.dkC, va = 0.2 + (main ? Math.max(0, sp - 0.8) * 1.2 : 0)
      c.fillStyle = rg(c, W / 2, HORIZ + 70, 150, 340, 0, css(vc, 0), 1, css(vc, va)); c.fillRect(0, 0, W, H)
    }
    function softShadow2(c, x, y, w, h) { const col = P.dark ? BLACK : P.dkC; c.save(); c.translate(x, y); c.scale(1, h / w); c.fillStyle = rg(c, 0, 0, w * 0.2, w, 0, css(col, 0.4), 1, css(col, 0)); c.beginPath(); c.arc(0, 0, w, 0, 7); c.fill(); c.restore() }
    // Two small bar-end mirrors: a simplified view of the road behind, so an attacker or a
    // slipstreamer is seen before they arrive. Cheap on purpose: no second render of the world.
    const MIRROR_RANGE = 7000
    function drawMirrors(c, time) {
      const me = riders[viewIdx], R = P.raw, w = 82, h = 46, y0 = 80
      const behind = riders.filter((o) => o !== me && me.z - o.z > 40 && me.z - o.z < MIRROR_RANGE).sort((a, b) => a.z - b.z)
      const close = behind.length ? behind[behind.length - 1] : null
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? 10 : W - 10 - w, hy = y0 + h * 0.4, bot = y0 + h, vx = x0 + w / 2 - side * w * 0.16
        limb(c, [x0 + (side < 0 ? w * 0.7 : w * 0.3), bot + 2, x0 + (side < 0 ? w * 0.95 : w * 0.05), bot + 15], 4, css(mx(R.tire, R.metal, 0.3)))
        rr(c, x0 - 3.5, y0 - 3.5, w + 7, h + 7, 13, lg(c, 0, y0 - 4, 0, bot + 4, 0, css(mx(R.tire, R.metal, 0.45)), 1, css(mx(R.tire, BLACK, 0.4))))
        c.save(); c.beginPath(); c.roundRect(x0, y0, w, h, 10); c.clip()
        c.fillStyle = lg(c, 0, y0, 0, hy, 0, P.sky0, 1, P.sky1); c.fillRect(x0, y0, w, hy - y0)
        c.fillStyle = P.hillNear; c.beginPath(); c.moveTo(x0, hy); for (let i = 0; i <= 8; i++) c.lineTo(x0 + i * w / 8, hy - 3 - 3 * Math.sin(i * 1.7 + side)); c.lineTo(x0 + w, hy); c.fill()
        c.fillStyle = lg(c, 0, hy, 0, bot, 0, css(mx(R.grassA, R.fog, 0.5)), 1, P.grassB); c.fillRect(x0, hy, w, bot - hy)
        const half = (d) => w * 0.8 * d, cx = (d) => vx - me.x * half(d), yy = (d) => hy + (bot - hy) * d
        poly(c, [cx(1) - half(1), bot, cx(1) + half(1), bot, cx(0.04) + half(0.04), yy(0.04), cx(0.04) - half(0.04), yy(0.04)], lg(c, 0, hy, 0, bot, 0, css(mx(R.roadA, R.fog, 0.55)), 1, P.roadB))
        for (const e of [-1, 1]) poly(c, [cx(1) + e * half(1), bot, cx(1) + e * half(1) * 1.09, bot, cx(0.04) + e * half(0.04) * 1.09, yy(0.04), cx(0.04) + e * half(0.04), yy(0.04)], P.kerbB)
        const flow = (me.z / 700) % 1
        for (let k = 0; k < 5; k++) { const d1 = 1 / (1 + (k + flow) * 0.9), d2 = 1 / (1 + (k + flow + 0.4) * 0.9); poly(c, [cx(d1) - half(d1) * 0.02, yy(d1), cx(d1) + half(d1) * 0.02, yy(d1), cx(d2) + half(d2) * 0.02, yy(d2), cx(d2) - half(d2) * 0.02, yy(d2)], P.center) }
        for (const o of behind) {
          const dz = me.z - o.z, d = 1 / (1 + dz / 900), px = vx + (o.x - me.x) * half(d), py = yy(d), s = 0.16 + d * 0.62, C = P.rs[o.i]
          if (px < x0 - 12 || px > x0 + w + 12) continue
          c.save(); c.translate(px, py); c.scale(s, s)
          c.beginPath(); c.ellipse(-2, 1, 16, 3.5, 0, 0, 7); c.fillStyle = css(P.dark ? BLACK : P.dkC, 0.4); c.fill()
          if (o.state === 'down') { rr(c, -14, -8, 28, 8, 3, css(C)); circ(c, 12, -9, 6, css(R.helmet)) }
          else {
            c.rotate(-o.lean * 0.25)
            rr(c, -4, -18, 8, 18, 3.5, css(R.tire)); rr(c, -9, -30, 18, 16, 5, sideLit(c, -9, 9, mx(C, P.dkC, 0.2), 0.35)); limb(c, [-15, -34, 15, -34], 2.5, css(R.tire))
            c.globalCompositeOperation = 'lighter'; circ(c, 0, -26, 9, rg(c, 0, -26, 1, 9, 0, css(P.sunC, 0.9), 1, css(P.sunC, 0))); c.globalCompositeOperation = 'source-over'; circ(c, 0, -26, 3.2, WHITE_CSS)
            if (hasAv(o.i)) { standee(c, o.i, 'idle', 0, -24, 44); rr(c, -8, -30, 16, 9, 4, sideLit(c, -8, 8, mx(C, P.dkC, 0.2), 0.35)); limb(c, [-15, -34, 15, -34], 2.5, css(R.tire)); circ(c, 0, -27, 3, WHITE_CSS) }
            else {
            rr(c, -10, -52, 20, 22, 7, sideLit(c, -10, 10, C, 0.35)); limb(c, [-9, -46, -14, -36], 5, da(C, 0.3)); limb(c, [9, -46, 14, -36], 5, li(C, 0.1))
            circ(c, 0, -58, 8.5, rg(c, 3, -61, 1, 10, 0, li(R.helmet, 0.5), 1, da(R.helmet, 0.4))); rr(c, -6.5, -61, 13, 5.5, 2.5, css(mx(R.ink, R.sky0, 0.25))); rr(c, -5, -60, 5, 1.6, 0.8, 'rgba(255,255,255,.6)')
            }
            if (o.boosting) { c.globalCompositeOperation = 'lighter'; circ(c, 0, -14, 14, rg(c, 0, -14, 1, 14, 0, css(P.t.cta, 0.7), 1, css(P.t.cta, 0))) }
          }
          c.restore()
        }
        c.fillStyle = css(P.dkC, P.dark ? 0.1 : 0.08); c.fillRect(x0, y0, w, h)
        poly(c, [x0 + w * 0.08, y0, x0 + w * 0.34, y0, x0 + w * 0.12, bot, x0 - w * 0.14, bot], 'rgba(255,255,255,.14)'); poly(c, [x0 + w * 0.42, y0, x0 + w * 0.5, y0, x0 + w * 0.28, bot, x0 + w * 0.2, bot], 'rgba(255,255,255,.08)')
        c.restore()
        c.beginPath(); c.roundRect(x0, y0, w, h, 10); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.35)'; c.stroke()
        // A rider close behind on this mirror's side lights its rim in their colour.
        if (close && me.z - close.z < 1100 && (close.x - me.x) * side > -0.12) { c.beginPath(); c.roundRect(x0 - 1.5, y0 - 1.5, w + 3, h + 3, 11); c.lineWidth = 3; c.strokeStyle = css(P.rs[close.i], 0.72 + 0.28 * Math.sin(time * 14)); c.stroke() }
      }
    }
    // ── First person: the bars, the hands and the boot, drawn in screen space ──
    // The rider's own bike is not in the scene from here; what you see is the cockpit. The
    // handlebars lean with your steer, rock when you are hit and wander on oil; the boot swings
    // out on the side you kick. The five lamps on the pod are the boost meter.
    function drawCockpit(c, me, time) {
      const R = P.raw, C = P.rs[me.i], av = hasAv(me.i), J = av ? AVC[me.i].top : C
      const sp = me.speed / MAXSPD, kp = kickPose(me), ks = me.kickSide
      const wob = me.oil > 0 ? Math.sin(time * 19) * 0.07 * Math.min(1, me.oil / 0.4) : 0
      const rot = me.lean * 0.12 + me.rec * 0.35 + wob + Math.sin(time * 61) * 0.004 * sp
      const bob = -me.susp * 1.6 + Math.sin(time * 5.3) * 0.8 + me.sq * 5 + (me.boosting ? 5 : 0)
      const glove = mx(R.tire, C, 0.25)
      c.save()
      c.translate(W / 2 + me.lean * 10 + me.rec * 30, H + bob)
      c.rotate(rot)
      // Forearms in the jacket colour, cuffs, then the bar itself.
      for (const s of [-1, 1]) {
        limb(c, [s * 134, -52, s * 168, 60], 42, s > 0 ? li(J, 0.12) : da(J, 0.32))
        limb(c, [s * 134, -52, s * 168, 60], 18, css(J, 0.35))
        rr(c, s * 134 - 21, -56, 42, 17, 7, da(J, 0.5))
      }
      c.lineCap = 'round'
      c.beginPath(); c.moveTo(-134, -66); c.bezierCurveTo(-98, -55, -52, -42, 0, -40); c.bezierCurveTo(52, -42, 98, -55, 134, -66)
      c.lineWidth = 11; c.strokeStyle = css(da(R.metal, 0.5)); c.stroke()
      c.lineWidth = 6; c.strokeStyle = css(R.metal); c.stroke()
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(-120, -71); c.bezierCurveTo(-90, -61, -48, -49, 0, -47); c.bezierCurveTo(48, -49, 90, -61, 120, -71); c.stroke()
      // Gauge pod on the stem: five lamps, lit left to right as the meter fills.
      rr(c, -17, -42, 34, 40, 6, lg(c, -17, 0, 17, 0, 0, da(R.metal, 0.5), 0.5, css(R.metal), 1, da(R.metal, 0.4)))
      rr(c, -40, -92, 80, 44, 12, lg(c, 0, -92, 0, -48, 0, css(mx(R.tire, R.metal, 0.35)), 1, css(mx(R.tire, BLACK, 0.5))))
      rr(c, -34, -86, 68, 22, 7, css(BLACK, 0.7))
      const lit = Math.floor(me.boost * 5 + 0.001), ready = me.boost >= BOOST_MIN
      for (let i = 0; i < 5; i++) {
        const on = me.boosting ? ((time * 12 + i) % 2 < 1) : i < lit || (i === lit && ready && Math.floor(time * 4) % 2 === 0)
        rr(c, -30 + i * 13.2, -81, 10, 12, 3, on ? css(i < 3 ? P.t.cta : P.t.win) : css(P.t.border, 0.55))
        if (on && P.dark) { c.globalCompositeOperation = 'lighter'; circ(c, -25 + i * 13.2, -75, 12, rg(c, -25 + i * 13.2, -75, 1, 12, 0, css(P.t.cta, 0.5), 1, css(P.t.cta, 0))); c.globalCompositeOperation = 'source-over' }
      }
      circ(c, 0, -57, 3.4, me.stag > 0 || me.oil > 0 ? css(P.t.danger) : css(P.t.border, 0.7))
      // Grips and gloves.
      for (const s of [-1, 1]) {
        const gx = s * 124, gy = -66
        rr(c, gx - 28, gy - 11, 56, 22, 10, lg(c, 0, gy - 11, 0, gy + 11, 0, css(mx(R.tire, R.metal, 0.3)), 1, css(mx(R.tire, BLACK, 0.55))))
        rr(c, gx - 26, gy - 34, 52, 40, 14, sideLit(c, gx - 26, gx + 26, glove, 0.35))
        for (let i = 0; i < 4; i++) circ(c, gx - 17 + i * 11.5, gy - 31, 6, rg(c, gx - 15 + i * 11.5, gy - 33, 1, 6.5, 0, li(glove, 0.3), 1, da(glove, 0.2)))
        for (let i = 0; i < 4; i++) rr(c, gx - 22 + i * 11.5, gy + 1, 10.5, 22, 5.5, i % 2 ? li(glove, 0.06) : da(glove, 0.12))
        rr(c, gx + (s > 0 ? -32 : 14), gy - 20, 18, 26, 8, sideLit(c, gx - 32, gx + 32, glove, 0.3))
        rr(c, gx - 22, gy - 10, 44, 3, 1.5, css(P.dkC, 0.25))
      }
      // The boot swings out on the kicking side, in front of the glove.
      if (kp.ext + kp.tuck > 0) {
        const k = kp.ext, fx = ks * (64 + 66 * k - 10 * kp.tuck), fy = -30 - 34 * k - 16 * kp.tuck, kx = ks * (50 + 34 * k), ky = 44 - 24 * k, bootC = mx(R.tire, C, 0.4)
        limb(c, [ks * 30, 80, kx, ky, fx, fy], 46, css(R.ink, 0.5)); limb(c, [ks * 30, 80, kx, ky, fx, fy], 40, ks > 0 ? li(R.pants, 0.15) : da(R.pants, 0.2))
        c.save(); c.translate(fx, fy); c.rotate(ks * (0.3 - 0.7 * k)); rr(c, -22, -17, 44, 34, 10, sideLit(c, -22, 22, bootC, 0.35)); rr(c, -22, 10, 44, 7, 3, css(R.sole)); c.restore()
        if (k > 0.2) {
          c.globalAlpha = Math.min(1, k) * 0.85; c.lineCap = 'round'
          c.beginPath(); c.arc(ks * 20, 0, 120 * k + 16, ks > 0 ? -0.6 : Math.PI - 0.5, ks > 0 ? 0.5 : Math.PI + 0.6); c.lineWidth = 5 - 3 * k; c.strokeStyle = css(P.sunC, 1); c.stroke()
          c.globalAlpha = 1
        }
      }
      c.restore()
    }
    // A side cue for a kick: the edge of the screen glows in the target's colour and a chevron points
    // out to their side while somebody is in reach; it dims while the kick is cooling down.
    function drawKickCues(c, time) {
      const me = riders[viewIdx]
      if (!me || me.state !== 'ride' || phase === 'count') return
      for (const side of [-1, 1]) {
        const tgt = kickTarget({ riders }, me, side)
        if (!tgt) continue
        const calm = me.cd > 0 || me.stag > 0 ? 0.5 : 1
        const pulse = (0.65 + 0.35 * Math.sin(time * 12)) * calm
        const x0 = side < 0 ? 0 : W, col = P.rs[tgt.i]
        c.fillStyle = lg(c, x0, 0, x0 - side * 84, 0, 0, css(col, 0.6 * pulse), 1, css(col, 0)); c.fillRect(side < 0 ? 0 : W - 84, HORIZ + 30, 84, H - HORIZ - 110)
        const ax = x0 - side * 30, ay = HORIZ + 150
        for (const o of [0, 11]) poly(c, [ax - side * (o - 7), ay - 13, ax - side * (o + 3), ay, ax - side * (o - 7), ay + 13, ax - side * (o - 12), ay + 13, ax - side * (o - 2), ay, ax - side * (o - 12), ay - 13], P.seat[tgt.i].main)
        c.font = '7px ' + fontFamily; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = P.paper
        c.globalAlpha = calm; c.fillText('KICK', ax - side * 4, ay + 25); c.globalAlpha = 1
      }
    }
    // Drawn at full resolution on top, so labels stay crisp in the pixel style.
    function overlay(c, view) {
      for (const g of tags) {
        c.font = '7px ' + fontFamily; c.textAlign = 'center'; c.textBaseline = 'middle'
        const av = hasAv(g.r.i), tw = c.measureText(g.r.name).width + 10 + (av ? 15 : 0)
        rr(c, g.x - tw / 2, g.y - (av ? 9 : 7), tw, av ? 18 : 14, 5, P.seat[g.r.i].main); poly(c, [g.x - 4, g.y + 8.5, g.x + 4, g.y + 8.5, g.x, g.y + 13], P.seat[g.r.i].main)
        if (av) { rr(c, g.x - tw / 2 + 2, g.y - 7, 14, 14, 3, css(P.t.card, 0.9)); c.imageSmoothingEnabled = false; c.drawImage(AVS[g.r.i].bust.lit, g.x - tw / 2 + 2, g.y - 7, 14, 14); c.imageSmoothingEnabled = true }
        c.fillStyle = P.tagText[g.r.i % 4]; c.fillText(g.r.name, g.x + (av ? 7.5 : 0), g.y + 1)
      }
      if (view < 0) return
      const cam = riders[view], sp = cam.speed / MAXSPD
      if (camMode === 'first') { drawKickCues(c, clock); drawCockpit(c, cam, clock) }
      drawMirrors(c, clock)
      const fast = sp > 0.86 ? (sp - 0.86) * 6 : 0, wind = cam.draft > 0.5 && phase !== 'count' ? 1 : 0
      if (Math.random() < fast + wind * 1.4) { const a = Math.random() * 6.28, d = 150 + Math.random() * 60; parts.push({ k: 'line', x: W / 2 + Math.cos(a) * d, y: HORIZ + 60 + Math.sin(a) * d * 0.9, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: 0.22, max: 0.22, warm: wind, long: wind ? 2 : 1 }) }
      // Boost: streaks pour out of the middle of the screen for as long as it lasts.
      if (cam.boosting && !reducedNow) for (let n = 0; n < 3; n++) { const a = Math.random() * 6.28, d = 60 + Math.random() * 100; parts.push({ k: 'line', x: W / 2 + Math.cos(a) * d, y: HORIZ + 60 + Math.sin(a) * d * 0.9, vx: Math.cos(a) * 980, vy: Math.sin(a) * 980, life: 0.28, max: 0.28, warm: 1, long: 2.4 }) }
      // Oil on the lens of a first-person rider: slick droplets fly up off the front wheel.
      if (cam.oil > 0 && camMode === 'first' && !reducedNow && Math.random() < 0.5) parts.push({ k: 'drop', x: W * (0.22 + Math.random() * 0.56), y: H * 0.8, vx: (Math.random() - 0.5) * 260, vy: -140 - Math.random() * 220, life: 0.5, max: 0.5, r: 3 + Math.random() * 4 })
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= frameDt; if (p.life <= 0) { parts.splice(i, 1); continue }
        p.x += p.vx * frameDt; p.y += p.vy * frameDt; const a = p.life / p.max
        if (p.k === 'line') { c.globalAlpha = a * (p.long > 1.5 ? 0.6 : 0.45); limb(c, [p.x, p.y, p.x - p.vx * 0.06 * (p.long || 1), p.y - p.vy * 0.06 * (p.long || 1)], p.long > 1.5 ? 2 : 1.6, p.warm ? P.pow : P.paper) }
        else if (p.k === 'drop') { p.vy += 900 * frameDt; c.globalAlpha = a; c.beginPath(); c.ellipse(p.x, p.y, p.r, p.r * 1.3, 0, 0, 7); c.fillStyle = css(P.dark ? BLACK : mx(P.t.text, BLACK, 0.4), 0.9); c.fill(); circ(c, p.x - p.r * 0.3, p.y - p.r * 0.4, p.r * 0.35, css(P.t.p1, 0.8)) }
        else if (p.k === 'star') { p.vy += 620 * frameDt; c.globalAlpha = a; c.save(); c.translate(p.x, p.y); c.rotate(p.life * 9); rr(c, -3, -3, 6, 6, 1, p.alt ? P.paper : P.pow); c.restore() }
        else if (p.k === 'pow') {
          const s = ease.outBack(Math.min(1, (1 - a) * 4)) * (1 + (1 - a) * 0.25); c.globalAlpha = Math.min(1, a * 2.5); c.save(); c.translate(p.x, p.y - (1 - a) * 18); c.rotate(p.rot); c.scale(s, s)
          c.beginPath(); for (let j = 0; j < 16; j++) { const rad = j % 2 ? 15 : 27, an = j / 16 * 6.283; c.lineTo(Math.cos(an) * rad, Math.sin(an) * rad) } c.closePath(); c.fillStyle = rg(c, 4, -5, 2, 28, 0, li(P.raw.pow, 0.6), 1, css(P.raw.pow)); c.fill(); c.lineWidth = 2; c.strokeStyle = P.ink; c.stroke()
          c.fillStyle = P.ink; c.font = '8px ' + fontFamily; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(p.txt, 0, 1); c.restore()
        }
        c.globalAlpha = 1
      }
    }

  // ── Camera, effects and the public surface ───────────────────────────────
  let shake = 0
  let hitStop = 0
  let punch = 0
  let zoom = 1

  function rebuild() {
    themeId = document.documentElement.getAttribute('data-theme') || ''
    P = buildPalette(readSideKickTokens(), dust ? { dust: true, look } : {})
    sprCache.clear()
    const ff = getComputedStyle(document.documentElement).getPropertyValue('--font-pixel').trim()
    fontFamily = ff ? `${ff}, monospace` : 'monospace'
  }

  function burst(r, txt) {
    if (!r || r._sx == null) return
    const x = r._sx, y = r._sy - 70 * (r._k || 1)
    parts.push({ k: 'pow', x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, txt, rot: (Math.random() - 0.5) * 0.5 })
    for (let i = 0; i < 9; i++) parts.push({ k: 'star', x, y, vx: (Math.random() - 0.5) * 320, vy: -80 - Math.random() * 220, life: 0.55, max: 0.55, alt: i % 2 })
  }

  /** The visual side of a sim event: POW bursts, screen shake, camera punch, hit-stop. */
  function event(ev, world, view) {
    if (!world) return
    const rs = world.riders
    if (ev.t === 'hit') {
      burst(rs[ev.to], ev.ko ? 'OFF!' : 'POW')
      if (ev.by === view) { hitStop = 0.07; shake = 5; punch = 0.035 }
      else if (ev.to === view) { shake = 9; punch = -0.03 }
    }
    if (ev.t === 'down' && ev.to === view) shake = 14
    if (ev.t === 'boost' && ev.by === view) { fovPulse = 1; shake = Math.max(shake, 6) }
    if (ev.t === 'oil' && ev.to === view) shake = Math.max(shake, 5)
    if (ev.t === 'roped') { burst(rs[ev.to], 'ROPED'); if (ev.to === view) shake = Math.max(shake, 8) }
    if ((ev.t === 'rock' || ev.t === 'cactus') && ev.to === view) shake = Math.max(shake, 7)
    if (ev.t === 'hay' && ev.to === view) for (let i = 0; i < 8; i++) parts.push({ k: 'star', x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.6, vx: (Math.random() - 0.5) * 240, vy: -120 - Math.random() * 180, life: 0.5, max: 0.5, alt: i % 2 })
    if (ev.t === 'nearmiss' && ev.to === view) {
      // CLOSE! on the side the car went by, and a rush of lines out to that edge.
      const x = W / 2 + (ev.side || 1) * 84, y = H * 0.56
      parts.push({ k: 'pow', x, y, vx: 0, vy: 0, life: 0.55, max: 0.55, txt: 'CLOSE!', rot: (Math.random() - 0.5) * 0.4 })
      for (let i = 0; i < 9; i++) parts.push({ k: 'star', x, y, vx: (Math.random() - 0.5) * 300, vy: -80 - Math.random() * 200, life: 0.5, max: 0.5, alt: i % 2 })
      for (let i = 0; i < 7; i++) parts.push({ k: 'line', x: W / 2 + (ev.side || 1) * (30 + Math.random() * 40), y: HORIZ + 40 + Math.random() * 160, vx: (ev.side || 1) * (900 + Math.random() * 300), vy: (Math.random() - 0.5) * 80, life: 0.3, max: 0.3, warm: 0, long: 2.4 })
    }
  }

  /** True while the sim should hold for the freeze-frame on a landed kick. */
  function tickHitStop(dt) {
    if (hitStop > 0) { hitStop -= dt; return true }
    return false
  }

  function reset() {
    parts.length = 0; wps.length = 0; skids.length = 0
    shake = 0; hitStop = 0; punch = 0; camSm = 0; fovK = 0; fovPulse = 0
  }

  /**
   * @param {object} world  sim world (lib/sideKickLogic.js)
   * @param {number} view   index of the rider the camera follows
   * @param {number} dt     seconds since the last frame
   * @param {{ pixel?: boolean, avatars?: boolean, reduced?: boolean, paused?: boolean }} [ui]
   */
  function draw(world, view, dt, ui = {}) {
    if (dust && look !== world.track.id) { look = world.track.id; P = null }
    if (!P || themeId !== (document.documentElement.getAttribute('data-theme') || '')) rebuild()
    avatarsOn = ui.avatars !== false
    camMode = !dust && ui.camera === 'first' ? 'first' : 'chase'
    reducedNow = !!ui.reduced
    track = world.track; riders = world.riders; cars = world.cars; weeds = world.weeds || []; segs = track.segs
    phase = world.phase; viewIdx = view; frameDt = dt || DT
    clock += frameDt
    const me = riders[view]
    const sp = me.speed / MAXSPD
    const reduced = !!ui.reduced
    if (!ui.paused) {
      skyOff += segAt(me.z).curve * sp * frameDt * 42
      stepEffects(frameDt)
    }
    camSm = lerp(camSm, me.x, 1 - Math.exp(-9 * frameDt)); if (Math.abs(camSm - me.x) > 0.5) camSm = me.x
    punch *= Math.exp(-7 * frameDt)
    const first = camMode === 'first'
    // Boost kicks the field of view wider: quickly on, slowly off, plus a pulse at the moment of the tap.
    fovK = lerp(fovK, me.boosting ? 1 : 0, 1 - Math.exp(-(me.boosting ? 9 : 3.5) * frameDt))
    fovPulse *= Math.exp(-6 * frameDt)
    camd = (first ? CAMD_FIRST : CAMD) * (1 - (reduced ? 0.07 : 0.2) * fovK - (reduced ? 0 : 0.08) * fovPulse)
    zoom = lerp(zoom, (first ? 1.0 : 1.045) + (me.draft > 0.5 || me.cu > 0 ? 0.03 : 0) + sp * 0.015, 1 - Math.exp(-4 * frameDt))
    const oilSway = me.oil > 0 ? Math.sin(clock * 17) * 0.035 * Math.min(1, me.oil / 0.4) : 0
    const roll = -(me.lean * (first ? 0.05 : 0.028) + me.rec * 0.05) * (reduced ? 0 : 1) + (reduced ? 0 : oilSway)
    const zz = zoom + (reduced ? 0 : punch)
    const jit = reduced ? 0 : Math.sin(clock * 47) * 0.5 * sp
    const ctx = home
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.save()
    if (shake > 0.3 && !reduced) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.exp(-9 * frameDt) } else shake = 0
    ctx.save(); ctx.translate(W / 2, H * 0.66 + jit); ctx.rotate(roll); ctx.scale(zz, zz); ctx.translate(-W / 2, -H * 0.66)
    if (ui.pixel) {
      lctx.setTransform(0.5, 0, 0, 0.5, 0, 0); render(lctx, view, clock, true)
      ctx.imageSmoothingEnabled = false; ctx.drawImage(lo, 0, 0, W, H); ctx.imageSmoothingEnabled = true
    } else render(ctx, view, clock, true)
    ctx.restore()
    for (const g of tags) {
      const dx0 = g.x - W / 2, dy0 = g.y - H * 0.66, cs = Math.cos(roll), sn = Math.sin(roll)
      g.x = W / 2 + (dx0 * cs - dy0 * sn) * zz; g.y = H * 0.66 + jit + (dx0 * sn + dy0 * cs) * zz
    }
    overlay(ctx, view)
    ctx.restore()
  }

  function dispose() {
    sprCache.clear()
    AVS.length = 0
  }

  return { draw, event, setAvatars, tickHitStop, reset, dispose, get ready() { return !!P } }
}
