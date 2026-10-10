import { useCallback, useEffect, useRef } from 'react'
import { shouldIgnoreGameKey } from '../lib/keyGuard'
import { SEAT_KEYS, keyVector } from '../lib/bamboozleSim'

// Input for BAMBOOZLE: a thumb pad per seat (BamboozlePad writes into it) plus
// the physical keyboard. One mutable store, read once per frame by the page's
// loop, so no input ever goes through React state.
//
//   const controls = useBamboozleControls({ shared })
//   controls.setPad(seat, { x, y })          // from a pad
//   controls.setPad(seat, { grab: true })    // GRAB button or a second finger
//   controls.getInput(seat) => { x, y, grab }
//
// `shared`: one player on the whole keyboard (solo and online), so arrows and
// WASD all steer seat 0 and every grab key grabs. Otherwise each seat has its
// own keys (see SEAT_KEYS), for two people on one keyboard.
export default function useBamboozleControls({ shared = false, enabled = true } = {}) {
  const pads = useRef([])
  const down = useRef(new Set())
  const sharedRef = useRef(shared)
  useEffect(() => { sharedRef.current = shared })

  const setPad = useCallback((seat, patch) => {
    pads.current[seat] = { ...(pads.current[seat] || { x: 0, y: 0, grab: false }), ...patch }
  }, [])

  const clear = useCallback(() => {
    pads.current = []
    down.current.clear()
  }, [])

  useEffect(() => {
    if (!enabled) { clear(); return undefined }
    const held = down.current
    const known = new Set(SEAT_KEYS.flatMap((s) => [...s.move, ...s.grab]))
    const onDown = (e) => {
      if (!known.has(e.code) || shouldIgnoreGameKey(e)) return
      held.add(e.code)
      e.preventDefault()
    }
    const onUp = (e) => { held.delete(e.code) }
    const onBlur = () => { held.clear() }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
      held.clear()
    }
  }, [enabled, clear])

  const getInput = useCallback((seat) => {
    const pad = pads.current[seat] || { x: 0, y: 0, grab: false }
    const layouts = sharedRef.current ? SEAT_KEYS : [SEAT_KEYS[seat]].filter(Boolean)
    let kx = 0
    let ky = 0
    let kgrab = false
    for (const l of layouts) {
      const [x, y] = keyVector(down.current, l.move)
      kx += x
      ky += y
      if (l.grab.some((code) => down.current.has(code))) kgrab = true
    }
    const m = Math.hypot(kx, ky)
    if (m > 1) { kx /= m; ky /= m }
    // The pad wins while a thumb is on it; keys fill in otherwise.
    const usingPad = Math.hypot(pad.x, pad.y) > 0
    return { x: usingPad ? pad.x : kx, y: usingPad ? pad.y : ky, grab: !!pad.grab || kgrab }
  }, [])

  return { setPad, getInput, clear }
}
