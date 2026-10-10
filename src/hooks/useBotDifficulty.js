import { useState } from 'react'

// The CPU level a solo demo plays at, remembered per game in localStorage
// under the same `bot-difficulty-<type>` key the board-game demos use. A
// stored value outside `levels` (or no storage at all) reads as `fallback`.
export default function useBotDifficulty(type, levels, fallback = 'normal') {
  const key = `bot-difficulty-${type}`
  const [level, setLevel] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return levels.includes(stored) ? stored : fallback
    } catch {
      return fallback
    }
  })
  const choose = (next) => {
    setLevel(next)
    try { localStorage.setItem(key, next) } catch { /* private mode */ }
  }
  return [level, choose]
}
