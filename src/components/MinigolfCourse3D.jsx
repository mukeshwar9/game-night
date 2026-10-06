import { useEffect, useRef } from 'react'
import { GolfStage } from './minigolf3d/GolfStage'

// 3D render of one Minigolf hole — a drop-in for MinigolfCourse (same hole / t /
// balls / aim / trail / flashBumper / burst props) plus `sink`, `cam` and
// `reduced`. This wrapper only owns the stage's lifecycle: the renderer, the
// camera rigs and the draw-on-change loop live in minigolf3d/GolfStage.js, and
// three.js is only ever pulled in through this lazy chunk.
//
// `onSurface({ el, toCourse })` hands the pointer surface to the aim hook (the
// 3D stand-in for the SVG's getScreenCTM); `onFail()` is called when WebGL
// cannot start or its context is lost, so the caller can fall back to 2D.

const BIG_FONT = "800 120px 'Big Shoulders Display'"

export default function MinigolfCourse3D({
  hole, t = 0, balls = [], aim = null, trail = null, flashBumper = -1, burst = null, sink = null,
  cam = null, landscape = false, reduced = false, className = '', label, onSurface, onFail,
}) {
  const hostRef = useRef(null)
  const stageRef = useRef(null)
  const latest = useRef(null)
  const callbacks = useRef({ onSurface, onFail })

  useEffect(() => {
    latest.current = { hole, t, balls, aim, trail, flashBumper, burst, sink, cam, landscape, reduced }
    callbacks.current = { onSurface, onFail }
  })

  // Create the stage once; tear it down (and free the GL context) on unmount.
  useEffect(() => {
    const host = hostRef.current
    let stage
    try {
      stage = new GolfStage(host, { onFail: () => callbacks.current.onFail?.() })
    } catch {
      callbacks.current.onFail?.()
      return undefined
    }
    stageRef.current = stage
    const ro = new ResizeObserver(() => stage.resize(host.clientWidth, host.clientHeight))
    ro.observe(host)
    stage.resize(host.clientWidth, host.clientHeight)
    // Theme switches rebuild the scene from the new --c-* tokens.
    const mo = new MutationObserver(() => stage.retheme())
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    // The flag numerals are painted with the self-hosted display face; repaint once it is ready.
    let gone = false
    try {
      if (!document.fonts.check(BIG_FONT)) document.fonts.load(BIG_FONT).then(() => { if (!gone) stage.retheme() }, () => {})
    } catch { /* no FontFaceSet */ }
    stage.update(latest.current)
    callbacks.current.onSurface?.({ el: stage.canvas, toCourse: stage.toCourse })
    return () => {
      gone = true
      ro.disconnect()
      mo.disconnect()
      callbacks.current.onSurface?.(null)
      stage.dispose()
      stageRef.current = null
    }
  }, [])

  // Every render feeds the stage; it redraws only if something visible changed.
  useEffect(() => {
    stageRef.current?.update({ hole, t, balls, aim, trail, flashBumper, burst, sink, cam, landscape, reduced })
  })

  return (
    <div
      ref={hostRef}
      className={className}
      role="img"
      aria-label={label ?? `${hole.name}, par ${hole.par}`}
    />
  )
}
