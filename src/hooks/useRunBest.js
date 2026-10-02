import { useEffect, useState } from 'react'
import { sounds } from '../lib/sounds'
import { readSoloBest, recordSoloBest } from '../lib/soloBest'
import { mirrorMemoryBest, syncMemoryBests } from '../lib/memoryProgress'

// Personal best for a run type. `finish(score)` is called from the tap handler that
// ended the run; it saves the score if it beats the best and plays the matching sound.
export default function useRunBest(type, onFinish) {
  const [best, setBest] = useState(() => readSoloBest(type))
  const [isNewBest, setIsNewBest] = useState(false)
  // Pull the account's best in (another device may hold a higher one).
  useEffect(() => {
    let live = true
    syncMemoryBests().then(b => { if (live && b[type] != null) setBest(cur => Math.max(cur, b[type])) })
    return () => { live = false }
  }, [type])
  const finish = (score) => {
    const beat = recordSoloBest(type, score)
    setIsNewBest(beat)
    if (beat) { setBest(score); mirrorMemoryBest(type, score); sounds.win() } else sounds.lose()
    onFinish?.(score)
  }
  const reset = () => setIsNewBest(false)
  return { best, isNewBest, finish, reset }
}
