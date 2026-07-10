// Anonymized play-count instrumentation. Fire-and-forget writes to
// plays/{gameType}/{mode} in RTDB via an atomic increment — never awaited by
// callers, never allowed to break the game it's instrumenting.

import { ref, set, increment } from 'firebase/database'
import { db } from './firebase'

const SAFE_GAME_TYPE = /^[a-zA-Z0-9]+$/

export function recordPlay(gameType, mode) {
  if (!db) return
  if (!SAFE_GAME_TYPE.test(gameType || '')) return
  if (mode !== 'multi' && mode !== 'solo') return
  set(ref(db, `plays/${gameType}/${mode}`), increment(1)).catch(() => {})
}
