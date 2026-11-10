// Off unless the page is opened with ?netdebug=1. Collects the numbers that tell
// whether ghost bikes are smooth (arrival gaps, frame times, how jerky a ghost moves,
// how often the room tree renders) and hands them to the console:
//   window.__netdebug.report()   // JSON summary
//   window.__netdebug.reset()
import { onValue, ref } from 'firebase/database'
import { db } from './firebase'

const ON = typeof window !== 'undefined' && /[?&]netdebug=1\b/.test(window.location.search)

const pct = (arr, p) => {
  if (!arr.length) return null
  const a = arr.slice().sort((x, y) => x - y)
  return Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))] * 100) / 100
}
const summary = (arr) => ({ n: arr.length, p50: pct(arr, 0.5), p95: pct(arr, 0.95), max: pct(arr, 1) })

let S = null
const fresh = () => ({ t0: performance.now(), frameDt: [], arrivalGap: {}, lastArrival: {}, lastAt: {}, jerkZ: [], stepX: [], prev: {}, counts: {} })
if (ON) { S = fresh(); window.__netdebug = { reset: () => { S = fresh() }, report: () => report() } }

function report() {
  const gaps = {}
  for (const [id, g] of Object.entries(S.arrivalGap)) gaps[id] = { ...summary(g), under20ms: g.filter((x) => x < 20).length }
  return {
    seconds: Math.round((performance.now() - S.t0) / 1000),
    frameDtMs: summary(S.frameDt), framesOver32ms: S.frameDt.filter((x) => x > 32).length,
    arrivalGapMs: gaps, ghostJerkZ: summary(S.jerkZ), ghostStepX: summary(S.stepX), counts: S.counts,
  }
}

export const netDbg = {
  on: ON,
  count(name) { if (S) S.counts[name] = (S.counts[name] || 0) + 1 },
  frame(dtMs) { if (S && dtMs > 0 && dtMs < 1000) S.frameDt.push(dtMs) },
  /** Per frame: how much each ghost's per-frame z step changed, and how far it moved sideways. */
  ghosts(riders) {
    if (!S) return
    for (const r of riders) {
      if (r.local) continue
      const p = S.prev[r.id]
      if (p) {
        const dz = r.z - p.z
        if (p.dz != null) S.jerkZ.push(Math.abs(dz - p.dz))
        S.stepX.push(Math.abs(r.x - p.x))
        p.dz = dz
      }
      S.prev[r.id] = { z: r.z, x: r.x, dz: p ? r.z - p.z : null, id: r.id }
    }
  },
  /** Watch a round's stats node and record the gap between a rider's consecutive reports arriving. */
  watch(statsRoot) {
    if (!S || !db || !statsRoot) return undefined
    return onValue(ref(db, statsRoot), (snap) => {
      const now = performance.now()
      for (const [id, raw] of Object.entries(snap.val() || {})) {
        const key = `${raw?.at}|${raw?.z}`
        if (S.lastAt[id] === key) continue
        S.lastAt[id] = key
        if (S.lastArrival[id] != null) (S.arrivalGap[id] ||= []).push(now - S.lastArrival[id])
        S.lastArrival[id] = now
      }
    })
  },
}
