import { useCallback, useEffect, useRef, useState } from 'react'
import { FOG_MS, GUST_DRIFT, GUST_MS, HAZARD_TELEGRAPH_MS, curseAhead, curseTargets } from '../lib/updraftLogic'

// CHAOS-mode hazards landing on one local climber. Each arrives with a
// HAZARD_TELEGRAPH_MS warning (which also hides the network delay of the
// rival's grab) and a draining fuse, then applies:
//   crumble → the platforms outlined during the warning turn cursed: a weak
//             bounce, then they break,
//   gust    → a sideways drift for GUST_MS (read by the sim through `drift()`),
//   fog     → everything but a lantern round the hopper is hidden for FOG_MS
//             (visual only).
// One hazard plays at a time; later ones wait their turn. `took` counts the
// round's hazards for the round-end strip. `reset()` clears everything for a
// new round.
const BANNER = {
  crumble: 'CRUMBLE INCOMING',
  gust: 'GUST INCOMING',
  fog: 'FOG INCOMING',
}

export function useUpdraftHazards({ tower, runRef, setRun }) {
  const [banner, setBanner] = useState(null)
  const [marked, setMarked] = useState([])
  const [took, setTook] = useState(0)
  const [gust, setGust] = useState(0)
  const [fog, setFog] = useState(false)
  const driftRef = useRef(0)
  const queue = useRef([])
  const busy = useRef(false)
  const timers = useRef([])
  const pumpRef = useRef(null)

  const later = (fn, ms) => { timers.current.push(setTimeout(fn, ms)) }

  const pump = useCallback(() => {
    if (busy.current) return
    const h = queue.current.shift()
    if (!h) return
    busy.current = true
    setBanner({ id: String(h.id ?? h.at), text: BANNER[h.k], fuseMs: HAZARD_TELEGRAPH_MS })
    const targets = h.k === 'crumble' && tower && runRef.current ? curseTargets(runRef.current, tower) : []
    setMarked(targets)
    later(() => {
      setBanner(null)
      setMarked([])
      let hold = 400
      if (h.k === 'crumble') {
        if (tower && runRef.current && !runRef.current.dead) setRun(curseAhead(runRef.current, tower, targets))
      } else if (h.k === 'gust') {
        const dir = h.at % 2 === 0 ? 1 : -1
        driftRef.current = dir * GUST_DRIFT
        setGust(dir)
        hold = GUST_MS
        later(() => { driftRef.current = 0; setGust(0) }, GUST_MS)
      } else if (h.k === 'fog') {
        setFog(true)
        hold = FOG_MS
        later(() => setFog(false), FOG_MS)
      }
      later(() => { busy.current = false; pumpRef.current() }, hold)
    }, HAZARD_TELEGRAPH_MS)
  }, [tower, runRef, setRun])

  useEffect(() => { pumpRef.current = pump }, [pump])

  const receive = useCallback((h) => {
    setTook(n => n + 1)
    queue.current.push(h)
    pump()
  }, [pump])

  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    queue.current = []
    busy.current = false
    driftRef.current = 0
    setBanner(null)
    setMarked([])
    setTook(0)
    setGust(0)
    setFog(false)
  }, [])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const drift = useCallback(() => driftRef.current, [])
  return { receive, reset, drift, banner, marked, took, gust, fog }
}
