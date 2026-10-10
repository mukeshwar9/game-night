// The GLASS theme's runtime: decides, from the engine and the device, what the
// material may do, and writes the verdict to <html> where CSS and useGlassLens
// read it. Started while a GLASS theme is active (hooks/useGlassRuntime.js).
//
//   data-glass-lens="on|off"   the lens is drawn (Blink only; see glassMode)
//   data-glass-step="0|1|2"    low-end ladder: 0 full, 1 art frozen, 2 lens off
//   --mx / --my                where the specular highlight sits
//
// Reduced transparency is read here only for the lens: index.css handles the
// blur and the tint itself through prefers-reduced-transparency. Reduced motion
// freezes the art in CSS and stops the highlight from moving here.

import {
  STEP, glassMode, highlightFromPointer, highlightFromTilt, initialStep, isBlinkEngine, isLowEndAndroid, nextStep,
} from './glassLogic'

const STEP_KEY = 'retro-glass-step'
const RT_QUERY = '(prefers-reduced-transparency: reduce)'
// First probe waits for the first screen to settle; later ones for the previous
// step to take effect.
const PROBE_DELAY_MS = 3000
const PROBE_WINDOW_MS = 2500

function read(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key, value) {
  try { localStorage.setItem(key, String(value)) } catch { /* storage unavailable */ }
}

/** What this browser is, as glassLogic's detectors want it. */
export function readEnv() {
  const nav = typeof navigator === 'undefined' ? {} : navigator
  const userAgent = nav.userAgent ?? ''
  const android = /Android/.test(userAgent)
  return {
    android,
    blink: isBlinkEngine({
      userAgent,
      brands: nav.userAgentData?.brands,
      platform: nav.platform,
      maxTouchPoints: nav.maxTouchPoints,
    }),
    lowEnd: isLowEndAndroid({ android, deviceMemory: nav.deviceMemory, hardwareConcurrency: nav.hardwareConcurrency }),
  }
}

function reducedMotion(root) {
  const attr = root.dataset.motion
  if (attr === 'reduced') return true
  if (attr === 'full') return false
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/**
 * Starts the runtime for the active GLASS theme; returns the stop function.
 * @param {HTMLElement} [root]
 */
export function startGlassRuntime(root = document.documentElement) {
  const env = readEnv()
  const saved = read(STEP_KEY)
  let step = initialStep({ lowEnd: env.lowEnd, saved: saved === null ? null : Number(saved) })

  let rt = false
  let mq = null
  try { mq = window.matchMedia(RT_QUERY); rt = mq.matches } catch { /* no matchMedia */ }

  function apply() {
    root.dataset.glassStep = String(step)
    root.dataset.glassLens = glassMode({ blink: env.blink, glassTheme: true, reducedTransparency: rt, step }) === 'lens' ? 'on' : 'off'
  }
  const onRt = () => { rt = !!mq?.matches; apply() }
  mq?.addEventListener?.('change', onRt)
  apply()

  // Low-end Android: watch frame times in short windows after launch; a janky
  // one takes a step (freeze the art, then drop the lens) and the next window
  // checks again. The step is remembered, so the next launch starts there.
  let stopped = false
  let probeTimer = 0
  let probeFrame = 0
  function probe() {
    probeTimer = 0
    if (stopped || step >= STEP.CLEAR || document.hidden) return
    /** @type {number[]} */
    const times = []
    let last = 0
    const startedAt = performance.now()
    const tick = (now) => {
      if (stopped) return
      if (last) times.push(now - last)
      last = now
      if (now - startedAt < PROBE_WINDOW_MS) { probeFrame = requestAnimationFrame(tick); return }
      const next = nextStep(step, times)
      if (next !== step) {
        step = next
        write(STEP_KEY, step)
        apply()
        probeTimer = window.setTimeout(probe, PROBE_DELAY_MS / 2)
      }
    }
    probeFrame = requestAnimationFrame(tick)
  }
  if (env.android && step < STEP.CLEAR) probeTimer = window.setTimeout(probe, PROBE_DELAY_MS)

  // The specular highlight follows the pointer (mouse and pen) and, on phones
  // that expose motion without a permission prompt (Android), the tilt. iOS asks
  // for permission, which a theme must not trigger on its own, so it keeps the
  // resting highlight.
  let hlFrame = 0
  let pos = null
  let painted = ''
  function paint() {
    hlFrame = 0
    if (!pos) return
    // Custom properties inherit, so each write restyles the tree: skip repeats.
    const key = `${pos.mx},${pos.my}`
    if (key === painted) return
    painted = key
    root.style.setProperty('--mx', `${pos.mx}%`)
    root.style.setProperty('--my', `${pos.my}%`)
  }
  function steer(next) {
    if (reducedMotion(root)) return
    pos = next
    if (!hlFrame) hlFrame = requestAnimationFrame(paint)
  }
  const onPointer = (e) => {
    if (e.pointerType === 'touch') return
    steer(highlightFromPointer(e.clientX, e.clientY, window.innerWidth, window.innerHeight))
  }
  const onTilt = (e) => {
    if (e.beta == null || e.gamma == null) return
    steer(highlightFromTilt(e.beta, e.gamma))
  }
  window.addEventListener('pointermove', onPointer, { passive: true })
  const tiltOk = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function'
  if (tiltOk) window.addEventListener('deviceorientation', onTilt, { passive: true })

  return () => {
    stopped = true
    clearTimeout(probeTimer)
    cancelAnimationFrame(probeFrame)
    cancelAnimationFrame(hlFrame)
    mq?.removeEventListener?.('change', onRt)
    window.removeEventListener('pointermove', onPointer)
    if (tiltOk) window.removeEventListener('deviceorientation', onTilt)
    delete root.dataset.glassLens
    delete root.dataset.glassStep
    root.style.removeProperty('--mx')
    root.style.removeProperty('--my')
  }
}
