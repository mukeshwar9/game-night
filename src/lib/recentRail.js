import { getRooms, getStats } from './profile'
import { GAME_TYPES } from './games'
import { buildRecentPlays, getRecentPlays } from './recentPlays'

// The games this browser has played, newest first: rooms, solo and pass-and-play
// runs, and recorded matches. Shared by Home's JUMP BACK IN rail and the
// first-visit headline strip (which shows only while this is empty).
export function readRecent() {
  return buildRecentPlays({
    plays: getRecentPlays(),
    rooms: getRooms(),
    statsTypes: Object.keys(getStats()?.byGame ?? {}),
    known: new Set(GAME_TYPES.map(t => t.type)),
  })
}
