// Pure helpers for the room listener. Some races (Side Kick, Dust Kick) write a
// position report ten times a second per rider under `round/stats`; the page that
// draws them listens to that node itself, so the room tree only needs to hear about
// those writes now and then (finish and ranking read them).

/** Games whose `round/stats` carries high-rate position reports. */
export const HOT_STATS_GAMES = ['sidekick', 'dustkick']
/** The room tree sees a stats-only change at most this often. */
export const HOT_STATS_INTERVAL_MS = 400

function same(a, b) {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  for (const k of ka) if (!(k in b) || !same(a[k], b[k])) return false
  return true
}

/** True when `next` differs from `prev` only inside `round.stats`. */
export function isStatsOnlyChange(prev, next) {
  if (!prev || !next || typeof prev !== 'object' || typeof next !== 'object') return false
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  for (const k of keys) {
    if (k === 'round') continue
    if (!same(prev[k], next[k])) return false
  }
  const pr = prev.round; const nr = next.round
  if (!pr || !nr || typeof pr !== 'object' || typeof nr !== 'object') return same(pr, nr)
  const rk = new Set([...Object.keys(pr), ...Object.keys(nr)])
  for (const k of rk) {
    if (k === 'stats') continue
    if (!same(pr[k], nr[k])) return false
  }
  return true
}

/**
 * Hand room snapshots to `apply`, holding back a stats-only change in a hot-stats
 * game until `intervalMs` has passed since the last delivery (the newest one is
 * kept and delivered when the timer fires). Any other change goes through at once
 * and discards what was held.
 * @param {(game: any) => void} apply
 * @param {{ intervalMs?: number, now?: () => number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} [o]
 */
export function createRoomFeed(apply, o = {}) {
  const { intervalMs = HOT_STATS_INTERVAL_MS, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = o
  let delivered = null
  let lastAt = -Infinity
  let held = null
  let timer = null
  const deliver = (game) => {
    if (timer != null) { clearTimer(timer); timer = null }
    held = null
    delivered = game
    lastAt = now()
    apply(game)
  }
  return {
    push(game) {
      const hot = HOT_STATS_GAMES.includes(game?.gameType)
      if (!hot || !isStatsOnlyChange(delivered, game)) return deliver(game)
      const wait = lastAt + intervalMs - now()
      if (wait <= 0) return deliver(game)
      held = game
      if (timer == null) timer = setTimer(() => { timer = null; if (held) deliver(held) }, wait)
    },
    cancel() {
      if (timer != null) clearTimer(timer)
      timer = null; held = null
    },
  }
}
