import * as THREE from 'three'
import { HOLES } from '../../lib/minigolfCourses'
import { BALL_R } from '../../lib/minigolfPhysics'
import {
  K, FOV_DEG, courseToWorld, heightAt, rayToCourse, solveTeeCamera, followCamera, sinkCamera,
  easePose, poseSettled, easeAlpha,
} from '../../lib/minigolf3dLogic'
import { buildHole, readPalette } from './buildHole'

// The imperative half of the 3D Minigolf view: owns the WebGL renderer, the
// scene and the three camera rigs, and draws ONLY when something moved. The
// React wrapper (MinigolfCourse3D) just feeds it the same props the 2D SVG
// takes. Nothing here reads or writes game state.

const R0 = BALL_R * K * 1.6          // ball radius in world units
const MAX_DOTS = 24
const TRAIL_N = 10
const BURST_N = 16
const BURST_MS = 650
const SINK_MS = 700
const EASE_RATE = 7                  // camera easing, 1/s

const mix = (t) => t * t * (3 - 2 * t)
const clamp01 = (v) => Math.max(0, Math.min(1, v))

export class GolfStage {
  /**
   * @param {HTMLElement} host element the canvas is appended to
   * @param {{ onFail?: () => void }} [opts]
   * @throws when WebGL is unavailable (the caller falls back to the 2D course)
   */
  constructor(host, { onFail } = {}) {
    this.host = host
    this.onFail = onFail
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.canvas = this.renderer.domElement
    Object.assign(this.canvas.style, { width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' })
    host.appendChild(this.canvas)
    this.canvas.addEventListener('webglcontextlost', this.onContextLost)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 200)
    this.raycaster = new THREE.Raycaster()
    this.dynamic = new THREE.Group()
    this.scene.add(this.dynamic)

    this.hole = null
    this.built = null
    this.number = 1
    this.p = null
    this.sig = ''
    this.pose = null
    this.target = null
    this.needSnap = true
    this.heading = { vx: 0, vy: -1 }
    this.teeCache = new Map()
    this.raf = 0
    this.lastT = 0
    this.w = 0
    this.h = 0
    this.sinkKey = null
    this.sinkStart = 0
    this.burstKey = null
    this.burstStart = 0
    this.disposed = false

    this.palette = readPalette()
    this.applyPalette()
    this.makeDynamic()
  }

  onContextLost = (e) => {
    e.preventDefault()
    this.onFail?.()
  }

  applyPalette() {
    this.scene.background = this.palette.sky
    this.renderer.toneMappingExposure = this.palette.dark ? 1.3 : 1.0
  }

  /** Re-read the theme tokens and rebuild what depends on them. */
  retheme() {
    this.palette = readPalette()
    this.applyPalette()
    this.teeCache.clear()
    if (this.hole) this.rebuild()
    this.sig = ''
    if (this.p) this.update(this.p)
  }

  // ── dynamic parts: balls, aim, trail, burst, sink ball ──
  makeDynamic() {
    const g = this.dynamic
    this.balls = new Map()
    this.ballGeo = new THREE.SphereGeometry(R0, 32, 20)
    this.ringGeo = new THREE.TorusGeometry(R0 * 1.01, 0.04, 8, 32)

    this.trail = Array.from({ length: TRAIL_N }, () => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(R0 * 0.55, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
      m.rotation.x = -Math.PI / 2; m.visible = false
      g.add(m)
      return m
    })

    const aim = new THREE.Group(); aim.visible = false; g.add(aim)
    const mat = () => new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    this.aimMat = { dot: mat(), end: mat(), arc: mat(), band: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55 }), finger: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, side: THREE.DoubleSide }) }
    const dotGeo = new THREE.CircleGeometry(0.045, 14)
    this.aimDots = Array.from({ length: MAX_DOTS }, () => {
      const d = new THREE.Mesh(dotGeo, this.aimMat.dot)
      d.rotation.x = -Math.PI / 2
      aim.add(d)
      return d
    })
    this.aimEnd = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.2, 32), this.aimMat.end)
    this.aimEnd.rotation.x = -Math.PI / 2
    this.aimBand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 1), this.aimMat.band)
    this.aimFinger = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 32), this.aimMat.finger)
    this.aimFinger.rotation.x = -Math.PI / 2
    this.aimArc = new THREE.Mesh(new THREE.RingGeometry(R0 * 2.2, R0 * 2.2 + 0.045, 48, 1, 0, 1), this.aimMat.arc)
    this.aimArc.rotation.x = -Math.PI / 2
    this.aimArcPower = -1
    aim.add(this.aimEnd, this.aimBand, this.aimFinger, this.aimArc)
    this.aim = aim

    this.burstMat = new THREE.MeshBasicMaterial({ transparent: true })
    const burstGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07)
    this.burst = Array.from({ length: BURST_N }, () => {
      const m = new THREE.Mesh(burstGeo, this.burstMat)
      m.visible = false
      g.add(m)
      return m
    })

    this.sinkBall = this.makeBall()
    this.sinkBall.group.visible = false
  }

  makeBall() {
    const body = new THREE.Mesh(this.ballGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 }))
    body.castShadow = true
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshStandardMaterial({ roughness: 0.5 }))
    ring.rotation.x = Math.PI / 2
    const group = new THREE.Group()
    group.add(body, ring)
    this.dynamic.add(group)
    return { group, body, ring }
  }

  paintBall(ball, seat, dim) {
    const P = this.palette
    ball.body.material.color.copy(P.ball)
    ball.body.material.transparent = dim
    ball.body.material.opacity = dim ? 0.3 : 1
    ball.ring.material.color.copy(P.seat[seat % 4])
    ball.ring.material.transparent = dim
    ball.ring.material.opacity = dim ? 0.3 : 1
  }

  // ── hole ──
  rebuild() {
    if (this.built) {
      this.scene.remove(this.built.group)
      this.built.dispose()
    }
    this.built = buildHole(this.hole, this.number, this.palette)
    this.scene.add(this.built.group)
  }

  setHole(hole, p) {
    this.hole = hole
    this.number = HOLES.indexOf(hole) + 1
    this.rebuild()
    this.needSnap = true
    // Effects of the previous hole must not replay on this one.
    this.sinkKey = p.sink?.key ?? null
    this.burstKey = p.burst?.key ?? null
  }

  resize(w, h) {
    if (w < 2 || h < 2 || (w === this.w && h === this.h)) return
    this.w = w; this.h = h
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.needSnap = true
    this.sig = ''
    if (this.p) this.update(this.p)
    else this.requestDraw()
  }

  /** Client pixel → course coordinates (raycast onto the turf plane), for the aim hook. */
  toCourse = (clientX, clientY) => {
    const r = this.canvas.getBoundingClientRect()
    if (!r.width || !r.height) return null
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1))
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(ndc, this.camera)
    const { origin, direction } = this.raycaster.ray
    return rayToCourse(origin, direction, 0)
  }

  teePose(landscape) {
    const aspect = this.w && this.h ? this.w / this.h : 0.6
    const key = `${this.hole.id}|${aspect.toFixed(3)}|${landscape ? 1 : 0}`
    let pose = this.teeCache.get(key)
    if (!pose) { pose = solveTeeCamera(this.hole, { aspect, landscape }); this.teeCache.set(key, pose) }
    return pose
  }

  /**
   * Feed the latest props. Cheap when nothing visible changed: a signature of
   * everything that is drawn gates the scene update and the draw.
   */
  update(p) {
    if (this.disposed) return
    this.p = p
    if (p.hole !== this.hole) { this.setHole(p.hole, p); this.sig = '' }
    const b = this.built
    const sig = [
      this.w, this.h, p.landscape ? 1 : 0, p.reduced ? 1 : 0,
      b.hasMovers ? Math.round(p.t * 120) : 0,
      p.balls.map(x => `${x.key}:${x.x.toFixed(2)},${x.y.toFixed(2)},${x.seat},${x.dim ? 1 : 0},${x.scale ?? 1}`).join('|'),
      p.aim ? `${p.aim.x},${p.aim.y},${p.aim.angle.toFixed(4)},${p.aim.power.toFixed(3)},${p.aim.length.toFixed(1)}` : '',
      p.trail ? p.trail.map(t => `${t.x.toFixed(1)},${t.y.toFixed(1)}`).join('|') : '',
      p.flashBumper, p.burst?.key ?? '', p.sink?.key ?? '', p.cam?.mode ?? 'tee',
      Math.round((p.cam?.vx ?? 0) * 10), Math.round((p.cam?.vy ?? 0) * 10),
    ].join(';')
    if (sig === this.sig) return
    this.sig = sig
    this.apply(p)
    this.requestDraw()
  }

  apply(p) {
    const { hole, built: b, palette: P } = this
    const hAt = (x, y) => heightAt(hole, x, y)
    const place = (obj, x, y, lift = 0) => { const w = courseToWorld(x, y); obj.position.set(w.x, hAt(x, y) + R0 - lift, w.z) }

    if (b.hasMovers) b.syncMovers(p.t)

    // balls
    const live = new Set()
    for (const x of p.balls) {
      live.add(x.key)
      let ball = this.balls.get(x.key)
      if (!ball) { ball = this.makeBall(); this.balls.set(x.key, ball) }
      this.paintBall(ball, x.seat, !!x.dim)
      place(ball.group, x.x, x.y)
      ball.group.scale.setScalar(x.scale ?? 1)
    }
    for (const [key, ball] of this.balls) {
      if (live.has(key)) continue
      this.dynamic.remove(ball.group)
      ball.body.material.dispose(); ball.ring.material.dispose()
      this.balls.delete(key)
    }

    // trail
    const tr = p.trail || []
    this.trail.forEach((m, i) => {
      const t = tr[i]
      m.visible = !!t
      if (!t) return
      const w = courseToWorld(t.x, t.y)
      m.position.set(w.x, hAt(t.x, t.y) + 0.03, w.z)
      m.material.color.copy(P.seat[t.seat % 4])
      m.material.opacity = ((i + 1) / tr.length) * 0.55
    })

    // bumper flash
    b.bumpers.forEach(({ group, postMat }, i) => {
      const on = p.flashBumper === i
      group.scale.setScalar(on ? 1.12 : 1)
      postMat.emissiveIntensity = on ? 0.7 : 0
    })

    this.applyAim(p.aim)

    // sink: the ball drops in, the flag lifts, rings pulse out
    const sinkKey = p.sink?.key ?? null
    if (sinkKey !== this.sinkKey) {
      this.sinkKey = sinkKey
      this.sinkStart = performance.now()
      if (!sinkKey) this.resetSink()
    }
    // burst
    const burstKey = p.burst?.key ?? null
    if (burstKey !== this.burstKey) {
      this.burstKey = burstKey
      this.burstStart = performance.now()
      if (!burstKey) this.burst.forEach(m => { m.visible = false })
    }

    // camera rig
    const mode = p.cam?.mode ?? 'tee'
    const ball = p.balls[0]
    const speed = Math.hypot(p.cam?.vx ?? 0, p.cam?.vy ?? 0)
    if (speed > 0.4) this.heading = { vx: p.cam.vx, vy: p.cam.vy }
    if (mode === 'follow' && ball) this.target = followCamera(hole, ball.x, ball.y, this.heading.vx, this.heading.vy)
    else if (mode === 'sink') this.target = sinkCamera(hole)
    else this.target = this.teePose(p.landscape)
    if (!this.pose) this.needSnap = true
  }

  applyAim(a) {
    const { hole, palette: P } = this
    this.aim.visible = !!a
    if (!a) return
    const hAt = (x, y) => heightAt(hole, x, y)
    const at = (obj, x, y, lift) => { const w = courseToWorld(x, y); obj.position.set(w.x, hAt(x, y) + lift, w.z) }
    const dx = Math.cos(a.angle), dy = Math.sin(a.angle)
    const color = a.power > 0.85 ? P.danger : P.accent
    for (const m of Object.values(this.aimMat)) m.color.copy(color)
    this.aimDots.forEach((d, i) => {
      const s = 16 + i * 14
      d.visible = s < a.length
      if (d.visible) at(d, a.x + dx * s, a.y + dy * s, 0.025)
    })
    at(this.aimEnd, a.x + dx * a.length, a.y + dy * a.length, 0.03)
    // pull-back band from the ball toward where the finger would be
    const pull = 26 + a.power * 60
    const fx = a.x - dx * pull, fy = a.y - dy * pull
    at(this.aimBand, (a.x + fx) / 2, (a.y + fy) / 2, 0.04)
    this.aimBand.scale.z = pull * K
    this.aimBand.rotation.y = Math.PI / 2 - a.angle
    at(this.aimFinger, fx, fy, 0.04)
    at(this.aimArc, a.x, a.y, 0.03)
    if (Math.abs(a.power - this.aimArcPower) > 0.004) {
      this.aimArcPower = a.power
      const len = Math.max(0.02, a.power) * Math.PI * 2
      this.aimArc.geometry.dispose()
      this.aimArc.geometry = new THREE.RingGeometry(R0 * 2.2, R0 * 2.2 + 0.045, 48, 1, Math.PI / 2 - len, len)
    }
  }

  resetSink() {
    const b = this.built
    this.sinkBall.group.visible = false
    b.flagGroup.position.y = 0
    b.flagGroup.rotation.z = 0
    b.pulses.forEach(m => { m.visible = false })
  }

  /** Advance the timed effects; returns true while any is still running. */
  stepEffects(now) {
    const p = this.p
    let more = false
    const b = this.built
    const reduced = !!p?.reduced

    if (p?.sink && this.sinkKey) {
      const prog = reduced ? 1 : clamp01((now - this.sinkStart) / SINK_MS)
      const e = mix(prog)
      const ball = this.sinkBall
      const seat = p.sink.seat ?? 0
      this.paintBall(ball, seat, false)
      ball.group.visible = true
      ball.group.position.set(b.cupPos.x, b.cupPos.y + R0 * (1 - 2.1 * e), b.cupPos.z)
      b.flagGroup.position.y = 0.32 * e
      b.flagGroup.rotation.z = -0.22 * e
      b.pulses.forEach((m, i) => {
        m.visible = true
        m.material.color.copy(this.palette.accent)
        if (reduced) { m.scale.setScalar(1); m.material.opacity = [0.5, 0.28, 0.12][i]; return }
        const s = clamp01(prog * 1.3 - i * 0.12)
        m.scale.setScalar(0.5 + s * 0.7)
        m.material.opacity = (1 - s) * [0.55, 0.4, 0.3][i] * (prog > 0 ? 1 : 0)
      })
      if (prog < 1) more = true
    }

    if (p?.burst && this.burstKey && !reduced) {
      const prog = clamp01((now - this.burstStart) / BURST_MS)
      const c = b.cupPos
      this.burstMat.color.copy(this.palette.seat[(p.burst.seat ?? 0) % 4])
      this.burstMat.opacity = 1 - prog
      this.burst.forEach((m, i) => {
        const a = (i / BURST_N) * Math.PI * 2
        const r = (46 * K) * (1 - (1 - prog) * (1 - prog))
        m.visible = prog < 1
        m.position.set(c.x + Math.cos(a) * r, c.y + 0.1 + Math.sin(prog * Math.PI) * 0.5, c.z + Math.sin(a) * r)
        m.rotation.set(prog * 6, prog * 4 + i, 0)
      })
      if (prog < 1) more = true
    } else if (this.burst[0].visible) {
      this.burst.forEach(m => { m.visible = false })
    }
    return more
  }

  requestDraw() {
    if (this.raf || this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
  }

  frame = (now) => {
    this.raf = 0
    if (this.disposed || !this.built) return
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 1 / 60
    this.lastT = now
    let more = this.stepEffects(performance.now())

    if (this.target) {
      if (!this.pose || this.needSnap || this.p?.reduced) {
        this.pose = this.target
        this.needSnap = false
      } else {
        this.pose = easePose(this.pose, this.target, easeAlpha(dt, EASE_RATE))
        if (poseSettled(this.pose, this.target)) this.pose = this.target
        else more = true
      }
      const { pos, look, up } = this.pose
      this.camera.position.set(pos.x, pos.y, pos.z)
      this.camera.up.set(up.x, up.y, up.z)
      this.camera.lookAt(look.x, look.y, look.z)
    }
    this.renderer.render(this.scene, this.camera)
    if (more) this.requestDraw()
    else this.lastT = 0
  }

  dispose() {
    this.disposed = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    if (this.built) { this.scene.remove(this.built.group); this.built.dispose() }
    this.dynamic.traverse((o) => {
      o.geometry?.dispose()
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      mats.forEach(m => m.dispose())
    })
    for (const m of [this.ballGeo, this.ringGeo]) m.dispose()
    this.aimArc.geometry.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
