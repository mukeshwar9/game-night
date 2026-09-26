import { useCallback, useEffect, useRef, useState } from 'react'
import { advanceRun, createRun } from '../lib/updraftLogic'

// The local climb loop shared by the UPDRAFT room pages and the demo: a
// requestAnimationFrame driver that feeds the pure sim in fixed STEP_DT steps
// (advanceRun) so a 120 Hz phone and a 60 Hz one jump the same heights.
//
//   useUpdraftRun({ tower, active, readInput, envFor, onEvents, onFrame })
//     → { run, runRef, setRun }
//
// `active` false freezes the sim (countdown, round over, hidden tab). The
// latest `readInput` / `envFor` / `onEvents` are read through refs, so the
// loop never restarts when the page re-renders. `onEvents(events, run)` runs
// after each frame that produced sim events (sfx, Firebase writes);
// `onFrame(run)` after every frame.
export function useUpdraftRun({ tower, active, readInput, envFor, onEvents, onFrame }) {
  const [run, setRunState] = useState(createRun)
  const runRef = useRef(run)
  const cb = useRef({ readInput, envFor, onEvents, onFrame })
  useEffect(() => { cb.current = { readInput, envFor, onEvents, onFrame } })

  const setRun = useCallback((next) => {
    runRef.current = next
    setRunState(next)
  }, [])

  useEffect(() => {
    if (!active || !tower) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const frame = (now) => {
      const elapsed = (now - last) / 1000
      last = now
      const out = advanceRun(
        runRef.current, tower,
        () => cb.current.readInput?.(runRef.current) ?? 0,
        acc, elapsed,
        (r) => cb.current.envFor?.(r) ?? {},
      )
      acc = out.acc
      runRef.current = out.run
      setRunState(out.run)
      if (out.events.length) cb.current.onEvents?.(out.events, out.run)
      cb.current.onFrame?.(out.run)
      if (!out.run.dead && !out.run.top) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [active, tower, run.dead, run.top])

  return { run, runRef, setRun }
}

/** Local sound for one frame's sim events (the room plays the round-end fanfare). */
export function playRunSounds(events, sounds) {
  for (const e of events) {
    if (e.type === 'bounce') {
      if (e.kind === 'spring') sounds.join()
      else if (e.kind === 'crumble') sounds.wall()
      else sounds.step()
    } else if (e.type === 'pickup') sounds.hit(3)
    else if (e.type === 'key') sounds.go()
    else if (e.type === 'fall') sounds.miss()
  }
}
