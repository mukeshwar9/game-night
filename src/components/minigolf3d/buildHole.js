import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { COURSE_W, COURSE_H } from '../../lib/minigolfCourses'
import { holeSegments, moverGeometry, pointInPoly, CUP_R } from '../../lib/minigolfPhysics'
import { K, courseToWorld, heightAt, zoneAt, zoneDip } from '../../lib/minigolf3dLogic'

// Builds the static scenery of one Minigolf hole as the "course as a sports
// venue": a plinth slab, striped turf, merged rails, obstacles in the player-2
// colour and a pictogram sign. Rendering only — positions come from the shipped
// hole data and heights from minigolf3dLogic.heightAt (cosmetic). Every colour
// is read from the --c-* theme tokens (readPalette), never hardcoded.

export const WALL_H = 0.3
const WALL_T = 0.18
const GRAY = [128, 128, 128]

const raw = (name) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}`).trim().split(/\s+/).map(Number)
  return v.length >= 3 && v.every(Number.isFinite) ? v : GRAY
}
const col = (name) => {
  const [r, g, b] = raw(name)
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
}

/** The theme's colour roles as three Colors. Read again whenever the theme changes. */
export function readPalette() {
  const [r, g, b] = raw('bg')
  const dark = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.4
  const sky = col('bg')
  return {
    dark,
    sky,
    white: new THREE.Color(1, 1, 1),
    turf: col('p1').lerp(col('tint-p1'), dark ? 0.15 : 0.32),
    turf2: col('p1').lerp(col('tint-p1'), dark ? 0.05 : 0.2),
    plinth: col('structure'),
    wall: col('card'),
    cap: col('p4'),
    sand: col('tint-cta').lerp(col('cta'), dark ? 0.35 : 0.12),
    water: col('p4'),
    obstacle: col('p2'),
    roof: col('p3'),
    ball: dark ? col('text') : col('card'),
    cup: col('structure').multiplyScalar(0.2),
    text: col('text'),
    accent: col('cta'),
    danger: col('danger'),
    sign: col('p4'),
    signInk: col('card'),
    seat: ['p1', 'p2', 'p3', 'p4'].map(col),
  }
}

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...o })
const css = (c) => c.getStyle()

function label(text, { w = 256, h = 160, bg, fg }) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  g.fillStyle = css(bg); g.fillRect(0, 0, w, h)
  g.fillStyle = css(fg)
  g.font = "800 120px 'Big Shoulders Display', sans-serif"
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, w / 2, h / 2 + 6)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

// The venue's signage: one pictogram per hole idea.
function pictogram(g, kind, s) {
  g.strokeStyle = g.fillStyle; g.lineWidth = s * 0.07; g.lineCap = 'round'; g.lineJoin = 'round'
  const c = s / 2
  const arc = (x, y, r, fill) => { g.beginPath(); g.arc(x, y, r, 0, 7); fill ? g.fill() : g.stroke() }
  if (kind === 'windmill') {
    g.beginPath()
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; g.moveTo(c, c); g.lineTo(c + Math.cos(a) * s * 0.32, c + Math.sin(a) * s * 0.32) }
    g.stroke(); arc(c, c, s * 0.06, true)
  } else if (kind === 'ramp') {
    g.beginPath(); g.moveTo(s * 0.18, s * 0.78); g.lineTo(s * 0.82, s * 0.3); g.lineTo(s * 0.82, s * 0.78); g.closePath(); g.stroke()
  } else if (kind === 'bumpers') {
    for (const [x, y] of [[0.32, 0.38], [0.68, 0.38], [0.5, 0.66]]) arc(s * x, s * y, s * 0.11)
  } else if (kind === 'sand') {
    for (let i = 0; i < 9; i++) arc(s * (0.3 + (i % 3) * 0.2), s * (0.34 + Math.floor(i / 3) * 0.16), s * 0.035, true)
  } else if (kind === 'moat') {
    for (let k = 0; k < 3; k++) {
      g.beginPath()
      for (let i = 0; i <= 12; i++) { const x = s * (0.18 + i * 0.053), y = s * (0.36 + k * 0.15) + Math.sin(i * 1.2) * s * 0.04; i ? g.lineTo(x, y) : g.moveTo(x, y) }
      g.stroke()
    }
  } else if (kind === 'sliders') {
    g.strokeRect(s * 0.2, s * 0.3, s * 0.35, s * 0.12); g.strokeRect(s * 0.45, s * 0.58, s * 0.35, s * 0.12)
    g.beginPath(); g.moveTo(s * 0.62, s * 0.36); g.lineTo(s * 0.82, s * 0.36); g.moveTo(s * 0.38, s * 0.64); g.lineTo(s * 0.18, s * 0.64); g.stroke()
  } else if (kind === 'portals') {
    arc(s * 0.33, s * 0.62, s * 0.13); arc(s * 0.67, s * 0.38, s * 0.13)
    g.beginPath(); g.moveTo(s * 0.43, s * 0.52); g.lineTo(s * 0.57, s * 0.46); g.stroke()
  } else if (kind === 'dogleg') {
    g.beginPath(); g.moveTo(s * 0.3, s * 0.82); g.lineTo(s * 0.3, s * 0.42); g.lineTo(s * 0.45, s * 0.25); g.lineTo(s * 0.8, s * 0.25); g.stroke()
  } else {
    g.beginPath(); g.moveTo(c, s * 0.82); g.lineTo(c, s * 0.2); g.moveTo(c - s * 0.14, s * 0.34); g.lineTo(c, s * 0.2); g.lineTo(c + s * 0.14, s * 0.34); g.stroke()
  }
}

const merge = (list) => {
  const merged = mergeGeometries(list, false)
  list.forEach(g => g.dispose())
  return merged
}

/**
 * @param {any} hole an entry of HOLES
 * @param {number} number the hole number on the flag
 * @param {ReturnType<typeof readPalette>} C
 */
export function buildHole(hole, number, C) {
  const group = new THREE.Group()
  const wx = (x) => courseToWorld(x, 0).x
  const wz = (y) => courseToWorld(0, y).z
  const hAt = (x, y) => heightAt(hole, x, y)
  const inside = (x, y) => hole.bounds.some(p => pointInPoly(x, y, p))

  // ── lighting ──
  group.add(new THREE.HemisphereLight(C.dark ? C.text : C.white, C.plinth, C.dark ? 1.9 : 1.55))
  const sun = new THREE.DirectionalLight(C.white, 2.6)
  sun.position.set(-6, 14, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 11, bottom: -11, near: 1, far: 40 })
  sun.shadow.radius = 4
  sun.shadow.bias = -0.0008
  group.add(sun)

  // ── plinth: the venue slab the hole stands on ──
  for (const poly of hole.bounds) {
    const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))))
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 14 * K, bevelSegments: 3 })
    g.rotateX(-Math.PI / 2); g.translate(0, -0.69, 0)
    const m = new THREE.Mesh(g, std(C.plinth, { roughness: 0.95 }))
    m.receiveShadow = m.castShadow = true
    group.add(m)
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), std(C.sky.clone().lerp(C.plinth, 0.18), { roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; ground.position.y = -1.6; ground.receiveShadow = true
  group.add(ground)

  // ── turf: a fine grid with smooth normals, mowed bands, sand and water sunk ──
  {
    const STEP = 5, pos = [], colr = [], idx = [], vid = new Map()
    const vert = (x, y, c) => {
      const key = `${x},${y}`
      if (vid.has(key)) return vid.get(key)
      pos.push(wx(x), hAt(x, y) + zoneDip(zoneAt(hole, x, y)), wz(y)); colr.push(c.r, c.g, c.b)
      vid.set(key, pos.length / 3 - 1)
      return pos.length / 3 - 1
    }
    for (let y = 0; y < COURSE_H; y += STEP) for (let x = 0; x < COURSE_W; x += STEP) {
      const cx = x + STEP / 2, cy = y + STEP / 2
      if (!inside(cx, cy)) continue
      const zt = zoneAt(hole, cx, cy)
      const band = Math.floor(y / 30) % 2 ? C.turf : C.turf2
      const c = zt === 'sand' ? C.sand : zt === 'water' ? C.water.clone().lerp(C.sky, 0.25) : band
      const a = vert(x, y, c), b = vert(x + STEP, y, c), d = vert(x, y + STEP, c), e = vert(x + STEP, y + STEP, c)
      idx.push(a, d, b, b, d, e)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3))
    g.setIndex(idx); g.computeVertexNormals()
    const turf = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 }))
    turf.receiveShadow = true
    group.add(turf)
  }
  // Water gets a glassy top plane so it reads as liquid, not paint.
  for (const z of (hole.zones || []).filter(z => z.t === 'water')) {
    const [x, y, w, h] = z.r
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w * K, h * K), std(C.water, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82 }))
    s.rotation.x = -Math.PI / 2; s.position.set(wx(x + w / 2), -0.06, wz(y + h / 2))
    group.add(s)
  }

  // ── rails: rounded boxes along every static segment, merged into two meshes ──
  {
    const wallGeo = [], capGeo = []
    for (const [x1, y1, x2, y2] of holeSegments(hole)) {
      const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(len / 24))
      for (let i = 0; i < n; i++) {
        const ax = x1 + (x2 - x1) * (i / n), ay = y1 + (y2 - y1) * (i / n)
        const bx = x1 + (x2 - x1) * ((i + 1) / n), by = y1 + (y2 - y1) * ((i + 1) / n)
        const mx = (ax + bx) / 2, my = (ay + by) / 2, base = hAt(mx, my)
        const l = (len / n) * K + WALL_T * 0.9
        const rot = -Math.atan2(by - ay, bx - ax)
        const w = new RoundedBoxGeometry(l, WALL_H, WALL_T, 2, 0.05)
        w.rotateY(rot); w.translate(wx(mx), base + WALL_H / 2 - 0.03, wz(my)); wallGeo.push(w)
        const c = new RoundedBoxGeometry(l, 0.05, WALL_T + 0.03, 1, 0.02)
        c.rotateY(rot); c.translate(wx(mx), base + WALL_H, wz(my)); capGeo.push(c)
      }
    }
    if (wallGeo.length) {
      const walls = new THREE.Mesh(merge(wallGeo), std(C.wall, { roughness: 0.6 }))
      walls.castShadow = walls.receiveShadow = true
      group.add(walls)
      group.add(new THREE.Mesh(merge(capGeo), std(C.cap, { roughness: 0.5 })))
    }
  }
  for (const poly of hole.blocks || []) {
    const s = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))))
    const g = new THREE.ExtrudeGeometry(s, { depth: WALL_H + 0.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 })
    g.rotateX(-Math.PI / 2)
    const m = new THREE.Mesh(g, std(C.wall, { roughness: 0.6 }))
    m.castShadow = m.receiveShadow = true
    group.add(m)
  }

  // ── obstacles ──
  const bumpers = []
  for (const [x, y, r] of hole.bumpers || []) {
    const g = new THREE.Group(); g.position.set(wx(x), hAt(x, y), wz(y))
    const postMat = std(C.obstacle, { roughness: 0.45, emissive: C.obstacle, emissiveIntensity: 0 })
    const post = new THREE.Mesh(new THREE.CylinderGeometry(r * K, r * K * 1.06, 0.36, 28), postMat)
    post.position.y = 0.18; post.castShadow = true; g.add(post)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * K * 1.02, 0.035, 10, 32), std(C.wall, { roughness: 0.4 }))
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; g.add(ring)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r * K * 0.5, r * K * 0.5, 0.02, 24), std(C.wall))
    top.position.y = 0.37; g.add(top)
    group.add(g)
    bumpers.push({ group: g, postMat })
  }
  const movers = []
  for (const m of hole.movers || []) {
    if (m.t === 'mill') {
      const g = new THREE.Group(); g.position.set(wx(m.x), hAt(m.x, m.y), wz(m.y))
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.25, 24), std(C.wall, { roughness: 0.55 }))
      tower.position.y = 0.62; tower.castShadow = true; g.add(tower)
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.08, 24), std(C.cap))
      band.position.y = 0.95; g.add(band)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.55, 24), std(C.roof, { roughness: 0.5 }))
      roof.position.y = 1.52; roof.castShadow = true; g.add(roof)
      const rotor = new THREE.Group(); rotor.position.y = 0.13; g.add(rotor)
      for (let i = 0; i < m.n; i++) {
        const a = (i * Math.PI * 2) / m.n
        const blade = new THREE.Mesh(new RoundedBoxGeometry(m.len * K, 0.18, 0.09, 2, 0.03), std(C.obstacle, { roughness: 0.45 }))
        blade.position.set(Math.cos(a) * m.len * K / 2, 0, Math.sin(a) * m.len * K / 2)
        blade.rotation.y = -a; blade.castShadow = true; rotor.add(blade)
      }
      group.add(g)
      movers.push({ m, view: rotor, kind: 'mill' })
    } else {
      const b = new THREE.Mesh(new RoundedBoxGeometry(m.w * K, WALL_H, m.h * K, 2, 0.05), std(C.obstacle, { roughness: 0.45 }))
      b.castShadow = true
      group.add(b)
      movers.push({ m, view: b, kind: 'slide' })
    }
  }
  /** Put the blades and sliders where moverGeometry says they are at clock `t`. */
  const syncMovers = (t) => {
    for (const { m, view, kind } of movers) {
      const g = moverGeometry(m, t)
      if (kind === 'mill') {
        const [x1, y1, x2, y2] = g[0].seg
        view.rotation.y = -Math.atan2(y2 - y1, x2 - x1)
      } else {
        const x0 = Math.min(...g.map(s => s.seg[0]))
        view.position.set(wx(x0 + m.w / 2), hAt(x0, m.y) + WALL_H / 2, wz(m.y + m.h / 2))
      }
    }
  }
  for (const p of hole.portals || []) {
    for (const [pt, strong] of [[p.a, true], [p.b, false]]) {
      const g = new THREE.Group(); g.position.set(wx(pt[0]), hAt(pt[0], pt[1]) + 0.01, wz(pt[1]))
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ color: C.roof, transparent: true, opacity: strong ? 0.55 : 0.25 }))
      disc.rotation.x = -Math.PI / 2; g.add(disc)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 10, 36), std(C.roof, { emissive: C.roof, emissiveIntensity: strong ? 0.6 : 0.2 }))
      ring.rotation.x = Math.PI / 2; g.add(ring)
      group.add(g)
    }
  }

  // ── cup, flag (hole number) ──
  const [cx, cy] = hole.cup, ch = hAt(cx, cy)
  const cupGroup = new THREE.Group(); cupGroup.position.set(wx(cx), ch, wz(cy)); group.add(cupGroup)
  const cupTop = new THREE.Mesh(new THREE.CircleGeometry(CUP_R * K, 32), new THREE.MeshBasicMaterial({ color: C.cup }))
  cupTop.rotation.x = -Math.PI / 2; cupTop.position.y = 0.006; cupGroup.add(cupTop)
  const lip = new THREE.Mesh(new THREE.RingGeometry(CUP_R * K, CUP_R * K + 0.035, 32), std(C.wall))
  lip.rotation.x = -Math.PI / 2; lip.position.y = 0.008; cupGroup.add(lip)
  const flagGroup = new THREE.Group(); cupGroup.add(flagGroup)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.35, 8), std(C.wall, { metalness: 0.4, roughness: 0.3 }))
  pole.position.y = 0.67; pole.castShadow = true; flagGroup.add(pole)
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.32),
    new THREE.MeshStandardMaterial({ map: label(String(number), { bg: C.roof, fg: C.signInk }), side: THREE.DoubleSide, roughness: 0.7 }),
  )
  flag.position.set(0.25, 1.17, 0); flag.castShadow = true; flagGroup.add(flag)

  // Success rings that pulse out of the cup on a sink.
  const pulses = [0.55, 0.95, 1.4].map(r => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.05, 48), new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0, side: THREE.DoubleSide }))
    m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.visible = false
    cupGroup.add(m)
    return m
  })

  // ── tee mat and the hole's sign ──
  const [tx, ty] = hole.tee
  const tee = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.03, 0.62, 2, 0.012), std(C.turf2.clone().lerp(C.text, 0.12)))
  tee.position.set(wx(tx), hAt(tx, ty) + 0.012, wz(ty)); tee.receiveShadow = true
  group.add(tee)
  {
    const s = 256, c = document.createElement('canvas'); c.width = c.height = s
    const g = c.getContext('2d')
    g.fillStyle = css(C.sign); g.beginPath(); g.roundRect(0, 0, s, s, s * 0.12); g.fill()
    g.fillStyle = css(C.signInk); pictogram(g, hole.id, s)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    const plaque = new THREE.Group()
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, transparent: true }))
    face.position.y = 0.95; plaque.add(face)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), std(C.wall))
    post.position.y = 0.3; plaque.add(post)
    const xs = hole.bounds.flat().map(p => p[0])
    const side = tx - Math.min(...xs) > Math.max(...xs) - tx ? -1 : 1
    plaque.position.set(wx(side < 0 ? Math.min(...xs) : Math.max(...xs)) + side * 0.3, hAt(tx, ty) - 0.35, wz(ty) + 0.2)
    plaque.rotation.y = side * 0.25
    plaque.traverse(o => { o.castShadow = true })
    group.add(plaque)
  }

  const dispose = () => {
    group.traverse((o) => {
      o.geometry?.dispose()
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) { m.map?.dispose(); m.dispose() }
    })
  }

  return {
    group, bumpers, movers, syncMovers, flagGroup, pulses, cupPos: { x: wx(cx), y: ch, z: wz(cy) },
    hasMovers: movers.length > 0, dispose,
  }
}
