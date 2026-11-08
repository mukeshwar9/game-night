import { useCallback, useEffect, useRef, useState } from 'react'
import { appendSample } from '../lib/updraftStageLogic'

// Records a round's two climbs for the result chart: both best heights every
// SAMPLE_MS while `active`, plus a few marks (a hazard sent or taken, a fall).
// Client-side only — nothing is written to the room, and the rival's line is
// what this phone saw of them. `heights()` is read through a ref, so the
// interval never restarts when the page re-renders. A new `resetKey` (the
// tower's seed) starts a fresh trace.
//
//   const trace = useClimbTrace({ active, resetKey, heights: () => ({ me, rival }) })
//   trace.mark('took')   → trace.samples, trace.marks
const SAMPLE_MS = 500
const EMPTY = { samples: [], marks: [] }

export default function useClimbTrace({ active, resetKey, heights }) {
  const read = useRef(heights)
  useEffect(() => { read.current = heights })
  const clock = useRef({ key: resetKey, from: null })
  const [state, setState] = useState({ key: resetKey, ...EMPTY })

  const seconds = useCallback(() => {
    if (clock.current.key !== resetKey) clock.current = { key: resetKey, from: null }
    if (clock.current.from == null) clock.current.from = performance.now()
    return (performance.now() - clock.current.from) / 1000
  }, [resetKey])

  const sample = useCallback(() => {
    const h = read.current?.() ?? { me: 0, rival: 0 }
    const t = seconds()
    setState(s => ({ ...(s.key === resetKey ? s : { key: resetKey, ...EMPTY }), samples: appendSample(s.key === resetKey ? s.samples : [], { t, ...h }) }))
  }, [resetKey, seconds])

  useEffect(() => {
    if (!active) return undefined
    sample()
    const id = setInterval(sample, SAMPLE_MS)
    return () => {
      clearInterval(id)
      sample() // the last heights, as the round ends
    }
  }, [active, sample])

  const mark = useCallback((kind) => {
    if (clock.current.key !== resetKey || clock.current.from == null) return
    const t = (performance.now() - clock.current.from) / 1000
    setState(s => (s.key === resetKey ? { ...s, marks: [...s.marks, { t, kind }] } : s))
  }, [resetKey])

  const cur = state.key === resetKey ? state : EMPTY
  return { samples: cur.samples, marks: cur.marks, mark }
}
