import { useEffect, useRef } from 'react'
import { ref, runTransaction, update } from 'firebase/database'
import { toast } from 'sonner'
import { db } from '../lib/firebase'
import { getServerNow } from './useServerClock'

// Room plumbing shared by the UPDRAFT versus and co-op pages.

const SYNC_MS = 200   // ~5 Hz progress for the rival's ghost and rail
const HIDDEN_FALL_MS = 3000

/**
 * Stamp the round's shared start (server clock) once both seats are in and
 * the rival is online. The transaction makes a double start a no-op.
 */
export function useUpdraftAutoStart({ gameId, game, isSpectator, opponentOnline }) {
  const startedAt = game.updraft?.startedAt ?? null
  const bothSeated = !!game.players?.X && !!game.players?.O
  useEffect(() => {
    if (isSpectator || game.status !== 'playing' || startedAt != null) return
    if (!bothSeated || !opponentOnline) return
    runTransaction(ref(db, `games/${gameId}`), (current) => {
      if (!current || current.status !== 'playing' || current.updraft?.startedAt != null) return
      if (current.updraft?.seed == null) return
      return { ...current, updraft: { ...current.updraft, startedAt: getServerNow() }, lastActivityAt: getServerNow() }
    }).catch(() => toast.error('COULD NOT START ROUND — CHECK CONNECTION'))
  }, [isSpectator, game.status, startedAt, bothSeated, opponentOnline, gameId])
  return { startedAt, bothSeated }
}

const SETTLE_TRIES = 3

/**
 * A guarded whole-room transaction that settles a round. `step(current)`
 * returns the next room, or undefined to leave it (already settled, another
 * round). A failed attempt (e.g. too many concurrent writes) retries after a
 * beat before giving up with a toast.
 */
export async function settleRoom(gameId, step, failText = 'ROUND RESULT FAILED — CHECK CONNECTION') {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runTransaction(ref(db, `games/${gameId}`), (current) => (current ? step(current) : undefined))
    } catch {
      if (attempt >= SETTLE_TRIES) {
        toast.error(failText)
        return null
      }
      await new Promise(r => setTimeout(r, 600 * attempt))
    }
  }
}

/** Fire-and-forget room patch with one toast per burst of failures. */
export function useRoomWriter(gameId) {
  const errorAt = useRef(0)
  return (updates) => update(ref(db, `games/${gameId}`), updates).catch(() => {
    if (Date.now() - errorAt.current > 4000) toast.error('SYNC FAILED — CHECK CONNECTION')
    errorAt.current = Date.now()
  })
}

const seatPayload = (run) => ({
  x: Math.round(run.x), y: Math.max(0, Math.round(run.y)), best: Math.max(0, Math.round(run.best)),
  dead: run.dead, top: run.top,
})

/**
 * Stream my climber's progress to `updraft/{me}` at ~5 Hz while it changes,
 * and at once when it falls or tops out. `quiet` (the round is decided)
 * keeps only those urgent writes, so the settling transaction is not racing
 * a stream of seat updates for the room node.
 */
export function useSeatSync({ write, me, run, active, quiet = false }) {
  const last = useRef({ at: 0, key: '' })
  useEffect(() => {
    if (!active || !me) return
    const payload = seatPayload(run)
    const key = `${payload.x}|${payload.y}|${payload.best}|${payload.dead}|${payload.top}`
    if (key === last.current.key) return
    const now = Date.now()
    const urgent = run.dead || run.top
    if (!urgent && (quiet || now - last.current.at < SYNC_MS)) return
    last.current = { at: now, key }
    write({ [`updraft/${me}`]: payload })
  }, [write, me, run, active, quiet])
}

/**
 * A climber whose tab stays hidden for HIDDEN_FALL_MS falls (the sim cannot
 * run in the background, and a frozen climber must not hold a round open).
 */
export function useHiddenFall({ active, onFall }) {
  const cb = useRef(onFall)
  useEffect(() => { cb.current = onFall })
  useEffect(() => {
    if (!active) return
    let timer = null
    const onVis = () => {
      clearTimeout(timer)
      if (document.visibilityState === 'hidden') timer = setTimeout(() => cb.current(), HIDDEN_FALL_MS)
    }
    document.addEventListener('visibilitychange', onVis)
    onVis()
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearTimeout(timer)
    }
  }, [active])
}
