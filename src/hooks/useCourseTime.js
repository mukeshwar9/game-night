import { useEffect, useRef, useState } from 'react'

// Course time for a PULP RUSH field: `clock()` (course ms) sampled every
// animation frame while `running`, once otherwise. The arcs are closed-form
// (pulpLogic positionAt), so the frame rate only changes smoothness.
export default function useCourseTime(clock, running) {
  const [t, setT] = useState(() => clock())
  const clockRef = useRef(clock)
  useEffect(() => { clockRef.current = clock })
  useEffect(() => {
    let raf = 0
    const loop = () => {
      setT(clockRef.current())
      if (running) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running])
  return t
}
