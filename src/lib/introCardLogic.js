// @ts-check
// Pure text and seat helpers for the shared intro card (components/IntroCard.jsx).
// No DOM, Firebase or React: the card only renders what these return.

/**
 * One-line pitch for a game: the registry `desc` as a sentence ("four in a row
 * wins" becomes "Four in a row wins."). Empty when the game has no desc.
 * @param {{ desc?: string } | null | undefined} cfg
 */
export function introPitch(cfg) {
  const raw = String(cfg?.desc ?? '').trim().replace(/[.!?]+$/, '')
  if (!raw) return ''
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)}.`
}

/**
 * "2 players · about 4 min". `players` (how many seats this start screen will
 * fill) wins over the registry range, so a party table of 1 + 3 bots reads
 * "4 players".
 * @param {{ nPlayer?: boolean, minPlayers?: number, maxPlayers?: number, durationMin?: number } | null | undefined} cfg
 * @param {{ players?: number }} [opts]
 */
export function introMeta(cfg, opts = {}) {
  const parts = []
  const { players } = opts
  if (Number.isInteger(players) && players > 0) {
    parts.push(`${players} ${players === 1 ? 'player' : 'players'}`)
  } else if (cfg?.nPlayer && cfg.minPlayers && cfg.maxPlayers) {
    parts.push(cfg.minPlayers === cfg.maxPlayers
      ? `${cfg.minPlayers} players`
      : `${cfg.minPlayers}–${cfg.maxPlayers} players`)
  } else {
    parts.push('2 players')
  }
  if (cfg?.durationMin && cfg.durationMin > 0) parts.push(`about ${cfg.durationMin} min`)
  return parts.join(' · ')
}

/**
 * The seat row: you first, then everyone else, each with a stable key and a
 * tone the card maps onto the P1/P2 accents (you = p1, the rest = p2, then
 * dim past the second seat so a long table stays calm).
 * @param {{ name?: string, avatar?: string }} you
 * @param {Array<{ id?: string, name?: string, avatar?: string }>} [others]
 */
export function introSeats(you, others = []) {
  const seats = [{ key: 'you', name: you?.name || 'You', avatar: you?.avatar, tone: 'p1', you: true }]
  others.forEach((o, i) => {
    seats.push({
      key: o?.id ?? `seat-${i + 1}`,
      name: o?.name || `Player ${i + 2}`,
      avatar: o?.avatar,
      tone: i === 0 ? 'p2' : 'dim',
      you: false,
    })
  })
  return seats
}
