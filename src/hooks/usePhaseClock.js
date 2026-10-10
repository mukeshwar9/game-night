import { useEffect, useState } from 'react'

// Phase clock for a memory level: before `startAt` it is 'countdown'; then each
// [name, ms] phase in turn; after the last timed phase it stays in `rest` (usually
// 'recall', which has no time limit of its own). `clock` returns now in ms — the
// server clock in duels, Date.now in solo runs. Ticks every 100 ms while running.
export default function usePhaseClock(startAt, phases, clock = Date.now, rest = 'recall') {
  const [now, setNow] = useState(() => clock())
  const total = phases.reduce((s, [, ms]) => s + ms, 0)
  const running = startAt != null && now < startAt + total
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(() => setNow(clock()), 100)
    return () => clearInterval(t)
  }, [running, clock, startAt])
  if (startAt == null || now < startAt) return { phase: 'countdown', left: startAt == null ? null : startAt - now, now }
  let t = startAt
  for (const [name, ms] of phases) {
    if (now < t + ms) return { phase: name, left: t + ms - now, now, ms }
    t += ms
  }
  return { phase: rest, left: null, now }
}
