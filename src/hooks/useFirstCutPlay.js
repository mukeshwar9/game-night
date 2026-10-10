import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { JUICE } from '../lib/firstCutFx'
import {
  entryAt, indexAt, katanaPhase, normalizeFcConfig, planTap, resolveRound, ruleDef,
} from '../lib/firstCutLogic'
import { sounds } from '../lib/sounds'

// The play loop shared by First Cut's one-phone page, the bot page and the
// online race. The game is a pure function of the reports and the clock
// (firstCutLogic.js), so this hook only has to:
//   * keep the current timetable index (a rAF loop that sets state on a change);
//   * score the reports (resolveRound);
//   * turn *changes* in that score into things you see and hear: a swing, the
//     split fruit and juice, a blade stopping on a twin, a new rule card.
// Because effects follow the derived state, a bot's cut, a rival online and
// your own tap all play through one path. Your own tap is answered at once
// (the swing starts on the pointer-down), the rest follows a frame later.

/** The fruit splits when the blade reaches it, not at the instant of the tap. */
export const IMPACT_MS = 150
const LAND_MS = 230
const FLOAT_MS = 820
const BLADE_OFFSET_DEG = 21.8

const bladeAngle = (a) => ((a + BLADE_OFFSET_DEG) * Math.PI) / 180

const blankSeat = () => ({ act: 'idle', n: 0, nope: 0, bump: 0 })
const blankVis = (key) => ({
  key, seats: {}, cut: null, thud: null, splash: null, shake: { n: 0, small: false }, floats: [], ghost: null,
})

/**
 * @param {object} p
 * @param {number} p.seed
 * @param {unknown} p.config
 * @param {{ id: string, slot: number, name: string, bot?: boolean }[]} p.seats  pads on this screen, in layout order
 * @param {number[]} p.angles                          katana angle per displayed seat
 * @param {string[]} p.racers                          everyone who scores (seats first)
 * @param {(id: string) => number} p.slotOf            theme player colour of anyone
 * @param {Record<string, unknown>} p.reports
 * @param {number} p.target
 * @param {() => number | null} p.getTime              ms into play, or null before it starts
 * @param {boolean} p.active                           accepting taps and advancing the clock
 * @param {{ current: { fx: any } | null }} p.tableRef
 * @param {string | number} [p.resetKey]               change to start a fresh game's visuals
 */
export default function useFirstCutPlay({
  seed, config, seats, angles, racers, slotOf, reports, target, getTime, active, tableRef, resetKey = 0,
}) {
  const cfg = useMemo(() => normalizeFcConfig(config), [config])
  const cfgKey = `${cfg.flip ? 1 : 0}${cfg.gold ? 1 : 0}${cfg.pace}`
  const racersKey = racers.join('|')
  const gameKey = `${resetKey}|${seed}|${cfgKey}`
  const [index, setIndex] = useState(-1)
  const [vis, setVis] = useState(() => blankVis(gameKey))
  // A new game starts from a blank table (adjusted during render, not in an effect).
  if (vis.key !== gameKey) {
    setVis(blankVis(gameKey))
    setIndex(-1)
  }

  const res = useMemo(
    () => resolveRound({ seed, config: cfg, stats: reports, racers, target }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- racersKey stands for racers
    [seed, cfg, reports, racersKey, target],
  )

  // Latest values for timers and event handlers.
  const live = useRef({})
  useEffect(() => {
    live.current = { res, index, active, getTime, seed, cfg, seats, angles, slotOf }
  })
  const timers = useRef(new Set())
  const shown = useRef({ cut: new Set(), stop: new Set(), swing: new Set(), item: -1 })
  const floatId = useRef(0)

  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => { timers.current.delete(t); fn() }, ms)
    timers.current.add(t)
  }, [])

  // A new game: forget what was shown and drop pending effects.
  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
    shown.current = { cut: new Set(), stop: new Set(), swing: new Set(), item: -1 }
    tableRef.current?.fx?.clear?.()
  }, [gameKey, tableRef])
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  // The clock: sets state only when the item on the plate changes.
  useEffect(() => {
    if (!active) return undefined
    let raf = 0
    const loop = () => {
      const t = live.current.getTime?.()
      const i = t == null ? -1 : indexAt(seed, cfg, t)
      setIndex(prev => (prev === i ? prev : i))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, seed, cfg])

  const patchSeat = useCallback((id, fn) => {
    setVis(v => ({ ...v, seats: { ...v.seats, [id]: fn(v.seats[id] ?? blankSeat()) } }))
  }, [])
  const addFloat = useCallback((text, slot, a) => {
    const id = ++floatId.current
    setVis(v => ({ ...v, floats: [...v.floats, { id, text, slot, a }] }))
    later(() => setVis(v => ({ ...v, floats: v.floats.filter(f => f.id !== id) })), FLOAT_MS)
  }, [later])

  const angleOf = (id) => {
    const i = live.current.seats.findIndex(s => s.id === id)
    return i >= 0 ? live.current.angles[i] : 270
  }

  // ── the sequences ────────────────────────────────────────────────────

  const swingNow = useCallback((id, k) => {
    const key = `${id}:${k}`
    if (shown.current.swing.has(key)) return
    shown.current.swing.add(key)
    const onScreen = live.current.seats.some(s => s.id === id)
    if (onScreen) patchSeat(id, s => ({ ...s, act: 'cut', n: s.n + 1 }))
    else setVis(v => ({ ...v, ghost: { slot: live.current.slotOf(id), n: (v.ghost?.n ?? 0) + 1 } }))
    sounds.cutSwish()
  }, [patchSeat])

  const cutSequence = useCallback((id, k) => {
    const L = live.current
    const e = entryAt(L.seed, L.cfg, k)
    swingNow(id, k)
    later(() => {
      if (live.current.index !== k) return // the item has already gone
      const a = angleOf(id)
      const ang = bladeAngle(a)
      const color = JUICE[e.id] ?? [255, 255, 255]
      tableRef.current?.fx?.juice(color, ang, e.gold)
      sounds.cutChop()
      if (e.gold) sounds.cutGold()
      const slot = live.current.slotOf(id)
      setVis(v => ({
        ...v,
        cut: { k, ang, slot, gold: e.gold, id: e.id },
        splash: { n: (v.splash?.n ?? 0) + 1, color, rot: Math.round(Math.random() * 360) },
        shake: { n: v.shake.n + 1, small: false },
        seats: v.seats[id] ? { ...v.seats, [id]: { ...v.seats[id], bump: v.seats[id].bump + 1 } } : v.seats,
      }))
      addFloat(e.gold ? '+3' : '+1', slot, a)
    }, IMPACT_MS)
  }, [addFloat, later, swingNow, tableRef])

  const stopSequence = useCallback((id, k) => {
    const L = live.current
    const e = entryAt(L.seed, L.cfg, k)
    const onScreen = L.seats.some(s => s.id === id)
    if (onScreen) patchSeat(id, s => ({ ...s, act: 'stop', n: s.n + 1 }))
    sounds.cutSwish()
    later(() => {
      if (live.current.index !== k) return
      const a = angleOf(id)
      if (onScreen) {
        const [x, y] = tableRef.current?.fx?.contact?.(a) ?? [0, 0]
        tableRef.current?.fx?.sparks(x, y, ((a + 90) * Math.PI) / 180)
      }
      sounds.cutClang()
      setVis(v => ({
        ...v,
        thud: { k, n: (v.thud?.k === k ? v.thud.n : 0) + 1 },
        shake: { n: v.shake.n + 1, small: true },
        seats: v.seats[id] ? { ...v.seats, [id]: { ...v.seats[id], nope: v.seats[id].nope + 1 } } : v.seats,
      }))
      if (e.rotten) addFloat('-1', live.current.slotOf(id), a)
    }, IMPACT_MS)
  }, [addFloat, later, patchSeat, tableRef])

  // ── a new item on the plate ──────────────────────────────────────────
  useEffect(() => {
    if (index < 0 || shown.current.item === index) return
    shown.current.item = index
    const e = entryAt(seed, cfg, index)
    if (e.kind === 'beat') {
      sounds.cutRule()
    } else {
      later(() => {
        if (live.current.index !== index) return
        tableRef.current?.fx?.dust()
        sounds.cutLand()
      }, LAND_MS)
    }
  }, [index, seed, cfg, later, tableRef])

  // ── changes in the score become sequences ────────────────────────────
  useEffect(() => {
    for (const [kStr, owner] of Object.entries(res.owners)) {
      const k = Number(kStr)
      if (!owner || shown.current.cut.has(k)) continue
      shown.current.cut.add(k)
      if (k === live.current.index || k === index) cutSequence(owner, k)
    }
    for (const [id, b] of Object.entries(res.blocked)) {
      if (!b) continue
      const key = `${id}:${b.at}`
      if (shown.current.stop.has(key)) continue
      shown.current.stop.add(key)
      if (b.at === live.current.index || b.at === index) stopSequence(id, b.at)
    }
  }, [res, index, cutSequence, stopSequence])

  // ── taps ─────────────────────────────────────────────────────────────
  /**
   * A tap by `id` now. Answers at once (the swing or the stop starts here) and
   * returns the plan so the page can record the report.
   */
  const tap = useCallback((id) => {
    const L = live.current
    if (!L.active) return { kind: 'ignored', reason: 'inactive' }
    const t = L.getTime?.()
    if (t == null) return { kind: 'ignored', reason: 'early' }
    const plan = planTap({ seed: L.seed, config: L.cfg, res: L.res, id, t })
    if (plan.kind === 'ignored' && plan.reason === 'blocked') {
      patchSeat(id, s => ({ ...s, nope: s.nope + 1 }))
    } else if (plan.kind === 'cut') {
      swingNow(id, plan.k)
    } else if (plan.kind === 'block') {
      shown.current.stop.add(`${id}:${plan.k}`)
      stopSequence(id, plan.k)
    }
    return plan
  }, [patchSeat, stopSequence, swingNow])

  // ── what the table shows ─────────────────────────────────────────────
  const entry = index >= 0 ? entryAt(seed, cfg, index) : null
  const tableSeats = seats.map((s) => {
    const v = vis.seats[s.id] ?? blankSeat()
    const b = res.blocked[s.id]
    const phase = index >= 0 ? katanaPhase(b, index) : 'ready'
    let drawMs = 0
    if (b && phase === 'drawing') drawMs = Math.max(400, entryAt(seed, cfg, b.until).start - entryAt(seed, cfg, b.at + 1).start)
    return { ...s, score: res.scores[s.id] ?? 0, phase, drawMs, act: v.act, n: v.n, nope: v.nope, bump: v.bump }
  })
  const cutNow = vis.cut && entry && vis.cut.k === entry.i ? vis.cut : null
  const rule = cfg.flip && entry ? ruleDef(entry.rule) : null
  // The card flashes once per rule change; alternating animation names replay it.
  let ruleFlash = 0
  if (cfg.flip && entry) for (let i = 0; i <= entry.i; i++) if (entryAt(seed, cfg, i).kind === 'beat') ruleFlash += 1

  return {
    index,
    entry,
    res,
    cfg,
    tap,
    tableProps: {
      seats: tableSeats,
      entry,
      cut: cutNow,
      thud: vis.thud,
      splash: vis.splash,
      rule,
      ruleFlash,
      shake: vis.shake,
      floats: vis.floats,
      ghost: vis.ghost,
    },
  }
}
