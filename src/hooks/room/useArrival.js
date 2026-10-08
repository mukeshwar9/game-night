import { useEffect, useState } from 'react'
import { getGameConfig } from '../../lib/games'
import { arrivalState, countdownEligible } from '../../lib/arrivalLogic'
import { getServerNow } from '../useServerClock'

// The arrival beat for a 2P turn-based duel (arrivalLogic.js): `state` is
// { count, msLeft, showBanner } while the 3·2·1 runs, null otherwise. It is
// derived from the room's `startsAt` server timestamp against the server
// clock, so both phones show the same number; a rematch has no `startsAt`.
// Only an eligible game that is playing counts; a spectator or a reload in the
// middle of it sees the same thing.
export default function useArrival(game) {
  const eligible = !!game && game.status === 'playing' && countdownEligible(getGameConfig(game.gameType), game)
  const startsAt = eligible && typeof game.startsAt === 'number' ? game.startsAt : null
  const [now, setNow] = useState(() => getServerNow())

  useEffect(() => {
    if (startsAt == null) return undefined
    const tick = () => {
      const t = getServerNow()
      setNow(t)
      if (arrivalState({ startsAt, now: t }) === null) clearInterval(id)
    }
    const id = setInterval(tick, 150)
    return () => clearInterval(id)
  }, [startsAt])

  return startsAt == null ? null : arrivalState({ startsAt, now })
}
