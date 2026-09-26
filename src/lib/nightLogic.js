// Game-night mode (report 4.3): one room for the whole evening. A room-level
// `night` node adds up match placements across game switches and NEW MATCH,
// and party rooms can drop into a 2P game with winner-stays seating (a
// uid-keyed `queue` of players waiting for a seat).
//
// Pure — no DOM/Firebase/React. The Firebase layer (src/lib/night.js) runs
// these inside transactions / multi-path updates; components only render
// their results.
//
// Room keys (all optional, so rooms created before game-night mode read as an
// empty night with no queue, no host override, unlocked):
//   night:     { startedAt, standings: { [uid]: { name, avatar, points, wins, played } },
//                history: { [id]: { gameType, at, draw, winners: { [uid]: true }, n, hi, lo, hiName, loName } } }
//   nightMark: signature of the finished match already claimed for the night
//              (in FIELD_NULLS, so every fresh round/match/switch clears it)
//   queue:     { [uid]: { name, avatar, playerId, joinedAt, at } } — waiting for a
//              2P seat, in `at` order
//   partyRoom: true once a party room switched into a 2P game (the room can
//              switch back to party games and restore everyone as seats)
//   hostUid:   explicit host override (TRANSFER HOST)
//   kicked:    { [uid]: true } — removed by the host for this match (in FIELD_NULLS)
//   locked:    true — no new seats (spectators still allowed)

import { roomCoordinator } from './coordinator'

// Night points per placement: 1st/2nd/3rd, everyone else 0. Last place never
// scores (a 2P loss is 0, not 2nd-place points), and an all-tied result (a
// draw) is worth DRAW_POINTS to everyone. Winning any match — 2P or party — is
// worth the same, so a night mixing both families still adds up fairly.
export const NIGHT_POINTS = [3, 2, 1]
export const DRAW_POINTS = 1

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback)

// --- Reading -----------------------------------------------------------------

/**
 * Normalize whatever Firebase returned for `game.night` (absent, partial, or
 * with sparse children) into a stable shape. History is sorted oldest-first.
 */
export function normalizeNight(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const standings = {}
  for (const [uid, s] of Object.entries(src.standings || {})) {
    if (!s || typeof s !== 'object') continue
    standings[uid] = {
      uid,
      name: str(s.name, '???'),
      avatar: s.avatar ?? null,
      points: num(s.points),
      wins: num(s.wins),
      played: num(s.played),
    }
  }
  const history = Object.entries(src.history || {})
    .filter(([, h]) => h && typeof h === 'object' && typeof h.gameType === 'string')
    .map(([id, h]) => ({
      id,
      gameType: h.gameType,
      at: num(h.at),
      draw: h.draw === true,
      winners: Object.keys(h.winners || {}).filter(uid => h.winners[uid]),
      n: num(h.n),
      hi: num(h.hi),
      lo: num(h.lo),
      hiName: str(h.hiName),
      loName: str(h.loName),
    }))
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  return { startedAt: num(src.startedAt) || null, standings, history }
}

/** Standings as a list: points, then wins, then fewer games played, then name. */
export function rankStandings(night) {
  const n = normalizeNight(night)
  return Object.values(n.standings)
    .filter(s => s.played > 0)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || a.played - b.played || a.name.localeCompare(b.name))
}

// --- Match results -----------------------------------------------------------

/**
 * Competition ranking ("1224") from a list of { uid, score }: equal scores
 * share a place, the next distinct score skips the shared places.
 */
export function rankByScore(entries) {
  return entries.map(e => ({
    ...e,
    place: 1 + entries.filter(o => o.score > e.score).length,
  }))
}

/**
 * Night points for each ranked entry (see NIGHT_POINTS). `entries` carry a
 * `place` and `score`; returns a new list with `points` and `win` added.
 */
export function placementPoints(entries) {
  if (entries.length === 0) return []
  const draw = entries.length >= 2 && entries.every(e => e.place === 1)
  const minScore = Math.min(...entries.map(e => e.score))
  return entries.map(e => {
    if (draw) return { ...e, points: DRAW_POINTS, win: false }
    const last = e.score === minScore
    return { ...e, points: last ? 0 : (NIGHT_POINTS[e.place - 1] ?? 0), win: e.place === 1 }
  })
}

/** Match winner of a finished 2P room: the leader on round wins, else the last round's winner, else a draw. */
export function matchWinner2P(game) {
  const sx = num(game?.scores?.X)
  const so = num(game?.scores?.O)
  if (sx > so) return 'X'
  if (so > sx) return 'O'
  if (game?.winner === 'X' || game?.winner === 'O') return game.winner
  return 'draw'
}

/**
 * The placements of a finished match, or null when there is nothing to
 * record (fewer than two identifiable players).
 *  - 2P: winner 1st, loser 2nd, draw both 1st (via matchWinner2P).
 *  - party (`nPlayer`): every seated uid ranked by `scores[uid]`; with no scores
 *    at all but a uid `winner` (Chain Reaction 4P), the winner(s) 1st and
 *    everyone else 2nd.
 * @returns {{ entries: {uid,name,avatar,score,place,points,win}[], draw: boolean,
 *   hi: number, lo: number, hiName: string, loName: string } | null}
 */
export function matchResult(game, nPlayer) {
  if (!game) return null
  let entries
  if (nPlayer) {
    const scores = game.scores && typeof game.scores === 'object' ? game.scores : {}
    const seats = Object.entries(game.players || {})
      .filter(([, p]) => p && typeof p === 'object' && p.playerId)
      .map(([id, p]) => ({ uid: p.playerId || id, name: str(p.name, '???'), avatar: p.avatar ?? null }))
    const anyScore = seats.some(s => num(scores[s.uid]) !== 0)
    const winnerIds = new Set(
      Array.isArray(game.winner) ? game.winner
        : typeof game.winner === 'string' ? [game.winner]
        : game.winner && typeof game.winner === 'object' ? Object.keys(game.winner) : [],
    )
    entries = seats.map(s => ({
      ...s,
      score: anyScore ? num(scores[s.uid]) : (winnerIds.has(s.uid) ? 1 : 0),
    }))
  } else {
    const x = game.players?.X
    const o = game.players?.O
    if (!x?.playerId || !o?.playerId || x.playerId === o.playerId) return null
    const w = matchWinner2P(game)
    const sx = num(game.scores?.X)
    const so = num(game.scores?.O)
    // Rank on the match outcome, not the raw round counts (a Password or
    // Arrows finish can decide the match on a tie-break).
    entries = [
      { uid: x.playerId, name: str(x.name, '???'), avatar: x.avatar ?? null, score: w === 'X' ? 1 : 0, shown: sx },
      { uid: o.playerId, name: str(o.name, '???'), avatar: o.avatar ?? null, score: w === 'O' ? 1 : 0, shown: so },
    ]
  }
  if (entries.length < 2) return null
  const ranked = placementPoints(rankByScore(entries))
  const byShown = [...ranked].sort((a, b) => (b.shown ?? b.score) - (a.shown ?? a.score) || a.place - b.place)
  const draw = ranked.every(e => e.place === 1)
  const top = byShown[0]
  const second = byShown[1]
  return {
    entries: ranked.map(e => { const out = { ...e }; delete out.shown; return out }),
    draw,
    hi: top.shown ?? top.score,
    lo: second.shown ?? second.score,
    hiName: top.name,
    loName: second.name,
  }
}

/**
 * Identity of a finished match's result, stored in `nightMark` once recorded.
 * `nightMark` is cleared by freshGameState on every new round/match/switch,
 * so this only has to tell apart two finishes with no reset between them.
 */
export function matchSignature(game) {
  const scores = Object.entries(game?.scores || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${num(v)}`)
    .join(',')
  const winner = typeof game?.winner === 'string' ? game.winner : JSON.stringify(game?.winner ?? null)
  return `${game?.gameType || ''}|${winner}|${scores}`
}

/**
 * What a finished room still has to record: its result plus the signature to
 * claim in `nightMark`, or null when the room isn't finished, the match was
 * already claimed, or there is nothing to record. `isMatchOver` (optional)
 * gates games that finish every round. The Firebase layer claims
 * `nightMark` in one transaction and adds the result to `night` in a second
 * (never one transaction on the whole room: that would re-validate every
 * chat message in it and fail as soon as two people have chatted).
 */
export function pendingNightResult(room, nPlayer, { isMatchOver } = {}) {
  if (!room || room.status !== 'finished') return null
  // Games whose 'finished' marks a round, not the match (N-player races go
  // 'finished' after every round): record only the match-deciding finish.
  if (isMatchOver && !isMatchOver(room)) return null
  const sig = matchSignature(room)
  if (room.nightMark === sig) return null
  const result = matchResult(room, nPlayer)
  return result ? { sig, result } : null
}

/**
 * The `night` node after adding one claimed result — for a transaction on
 * `games/{id}/night`. `undefined` (abort) when history `id` is already there,
 * so a retried transaction can never count the match twice.
 */
export function addToNight(rawNight, result, { gameType, now, id }) {
  if (rawNight?.history?.[id]) return undefined
  return applyResultToNight(rawNight, result, { gameType, now, id })
}

/** Add one match result to a raw `night` node (returns a new raw node). */
export function applyResultToNight(rawNight, result, { gameType, now, id }) {
  const night = rawNight && typeof rawNight === 'object' ? rawNight : {}
  const standings = { ...(night.standings || {}) }
  for (const e of result.entries) {
    const prev = standings[e.uid] || {}
    standings[e.uid] = {
      name: e.name,
      avatar: e.avatar ?? null,
      points: num(prev.points) + e.points,
      wins: num(prev.wins) + (e.win ? 1 : 0),
      played: num(prev.played) + 1,
    }
  }
  const winners = {}
  for (const e of result.entries) if (e.win) winners[e.uid] = true
  return {
    ...night,
    startedAt: num(night.startedAt) || now,
    standings,
    history: {
      ...(night.history || {}),
      [id]: {
        gameType,
        at: now,
        draw: result.draw,
        winners: Object.keys(winners).length ? winners : null,
        n: result.entries.length,
        hi: result.hi,
        lo: result.lo,
        hiName: result.hiName,
        loName: result.loName,
      },
    },
  }
}

/** A fresh night (START A NEW NIGHT). */
export function freshNight(now) {
  return { startedAt: now, standings: null, history: null }
}

// --- Recap -------------------------------------------------------------------

/**
 * End-of-night recap: MVP (most points), most wins, closest game (smallest
 * winning margin relative to the top score; draws are the closest), games
 * played, and the most-played game. Fields are null when the night is empty.
 */
export function nightRecap(rawNight) {
  const night = normalizeNight(rawNight)
  const ranked = rankStandings(rawNight)
  const mvp = ranked.find(s => s.points > 0) || null
  const byWins = [...ranked].sort((a, b) => b.wins - a.wins || b.points - a.points || a.name.localeCompare(b.name))
  const mostWins = byWins[0] && byWins[0].wins > 0 ? byWins[0] : null
  let closest = null
  let closestMargin = Infinity
  for (const h of night.history) {
    if (h.n < 2) continue
    const margin = h.draw ? 0 : (h.hi > 0 ? (h.hi - h.lo) / h.hi : 1)
    if (margin <= closestMargin) { closestMargin = margin; closest = h }
  }
  const counts = {}
  for (const h of night.history) counts[h.gameType] = (counts[h.gameType] || 0) + 1
  const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return {
    gamesPlayed: night.history.length,
    mvp,
    mostWins,
    closest,
    favoriteGame: favorite ? { gameType: favorite[0], count: favorite[1] } : null,
  }
}

// --- Seating: queue, winner-stays, party <-> 2P -------------------------------

/** The queue as a list in arrival order. */
export function normalizeQueue(raw) {
  return Object.entries(raw && typeof raw === 'object' ? raw : {})
    .filter(([, q]) => q && typeof q === 'object')
    .map(([uid, q]) => ({
      uid: q.playerId || uid,
      name: str(q.name, '???'),
      avatar: q.avatar ?? null,
      joinedAt: num(q.joinedAt),
      at: num(q.at),
    }))
    .sort((a, b) => a.at - b.at || a.uid.localeCompare(b.uid))
}

const seatRecord = (p, extra = {}) => ({
  name: p.name,
  playerId: p.uid ?? p.playerId,
  joinedAt: p.joinedAt || 0,
  avatar: p.avatar ?? null,
  ...extra,
})

const queueRecord = (p, at) => ({
  name: p.name,
  playerId: p.uid ?? p.playerId,
  avatar: p.avatar ?? null,
  joinedAt: p.joinedAt || 0,
  at,
})

/**
 * Who sits down when a party room switches into a 2P game: the top two in
 * tonight's standings (by points) when at least two present players have
 * scored, otherwise the host and the next player to have joined. Everyone
 * else queues in join order.
 * @param {{uid,name,avatar,joinedAt}[]} seats - present players in join order
 */
export function pickTwoSeats(seats, rawNight, hostUid) {
  const standings = normalizeNight(rawNight).standings
  const scored = seats.filter(s => (standings[s.uid]?.points || 0) > 0)
  let chosen
  if (scored.length >= 2) {
    chosen = [...seats]
      .sort((a, b) => (standings[b.uid]?.points || 0) - (standings[a.uid]?.points || 0)
        || (standings[b.uid]?.wins || 0) - (standings[a.uid]?.wins || 0)
        || seats.indexOf(a) - seats.indexOf(b))
      .slice(0, 2)
  } else {
    const host = seats.find(s => s.uid === hostUid) || seats[0]
    chosen = [host, seats.find(s => s !== host)].filter(Boolean)
  }
  return { seated: chosen, queued: seats.filter(s => !chosen.includes(s)) }
}

/**
 * Night-aware seating for a game switch, layered over the room's plain switch
 * patch (buildSwitchUpdates). Plain 2P rooms (never a party room) pass through
 * unchanged.
 *  - party -> 2P: two seats via pickTwoSeats, everyone else into `queue`,
 *    `partyRoom: true` so the room can switch back.
 *  - 2P -> 2P in a party room: seats and queue stay as they are.
 *  - 2P -> party in a party room: seats + queue all become party seats.
 * Kicked players are never reseated.
 * @param {object} game - the room before the switch
 * @param {object} updates - buildSwitchUpdates(game, newType)
 * @param {{ fromParty: boolean, toParty: boolean, now: number, hostUid?: string|null }} opts
 */
export function nightSwitchSeating(game, updates, { fromParty, toParty, now, hostUid = null }) {
  const kicked = game?.kicked || {}
  const notKicked = (p) => !kicked[p.uid]
  if (fromParty && !toParty) {
    const seats = Object.values(game.players || {})
      .filter(p => p && p.playerId)
      .map(p => ({ uid: p.playerId, name: p.name, avatar: p.avatar ?? null, joinedAt: p.joinedAt || 0 }))
      .sort((a, b) => a.joinedAt - b.joinedAt || a.uid.localeCompare(b.uid))
      .filter(notKicked)
    const { seated, queued } = pickTwoSeats(seats, game.night, hostUid)
    const players = {}
    if (seated[0]) players.X = seatRecord(seated[0], { seatedAt: now })
    if (seated[1]) players.O = seatRecord(seated[1], { seatedAt: now })
    const queue = {}
    queued.forEach((p, i) => { queue[p.uid] = queueRecord(p, now + i) })
    return {
      ...updates,
      players,
      queue: Object.keys(queue).length ? queue : null,
      partyRoom: true,
      // Pin the party's host so the X seat rotating (winner stays) never
      // moves the host controls around.
      hostUid: game.hostUid || hostUid || null,
      // A switch from the party lobby stays 'waiting' (lobbySwitchOverrides);
      // the lobby flag gives that 2P waiting room its START / WHO GOES FIRST.
      lobby: true,
      status: seated.length >= 2 ? 'playing' : 'waiting',
    }
  }
  if (!game?.partyRoom || fromParty) return updates
  if (!toParty) {
    // 2P -> 2P inside a party room: keep who sits where (winner stays).
    const players = {}
    for (const sym of ['X', 'O']) {
      const p = game.players?.[sym]
      if (p?.playerId) players[sym] = { name: p.name, playerId: p.playerId, joinedAt: p.joinedAt || 0, avatar: p.avatar ?? null, seatedAt: p.seatedAt ?? null }
    }
    return { ...updates, players, status: players.X && players.O ? updates.status : 'waiting' }
  }
  // 2P -> party: seats plus everyone waiting in the queue.
  const members = []
  for (const sym of ['X', 'O']) {
    const p = game.players?.[sym]
    if (p?.playerId) members.push({ uid: p.playerId, name: p.name, avatar: p.avatar ?? null, joinedAt: p.joinedAt || 0 })
  }
  for (const q of normalizeQueue(game.queue)) {
    if (!members.some(m => m.uid === q.uid)) members.push(q)
  }
  const players = {}
  for (const m of members.filter(notKicked)) {
    players[m.uid] = { name: m.name, playerId: m.uid, joinedAt: m.joinedAt, online: true, avatar: m.avatar ?? null }
  }
  return { ...updates, players, queue: null }
}

/**
 * Winner stays: the multi-path patch that, at the start of a NEW MATCH in a
 * room with a queue, sends the previous match's loser to the back of the
 * queue and seats the next waiting player in their place. On a draw the
 * player who has held their seat longer rotates out. Returns {} when there is
 * no one waiting (or no decided seats), so it is safe to spread into any
 * 2P new-match update.
 */
export function rotateWinnerStays(game, now) {
  const queue = normalizeQueue(game?.queue)
  const x = game?.players?.X
  const o = game?.players?.O
  if (!queue.length || !x?.playerId || !o?.playerId) return {}
  const w = matchWinner2P(game)
  let outSym
  if (w === 'X') outSym = 'O'
  else if (w === 'O') outSym = 'X'
  else outSym = (x.seatedAt ?? x.joinedAt ?? 0) <= (o.seatedAt ?? o.joinedAt ?? 0) ? 'X' : 'O'
  const out = game.players[outSym]
  const next = queue[0]
  return {
    [`players/${outSym}`]: seatRecord(next, { seatedAt: now }),
    [`queue/${next.uid}`]: null,
    [`queue/${out.playerId}`]: queueRecord({ uid: out.playerId, name: out.name, avatar: out.avatar, joinedAt: out.joinedAt }, now),
  }
}

// --- Host --------------------------------------------------------------------

/** uids of everyone holding a place in the room: seats (either family) and the queue. */
export function roomMemberIds(game, nPlayer) {
  const ids = []
  if (nPlayer) {
    for (const p of Object.values(game?.players || {})) if (p?.playerId) ids.push(p.playerId)
  } else {
    for (const sym of ['X', 'O']) if (game?.players?.[sym]?.playerId) ids.push(game.players[sym].playerId)
  }
  for (const q of normalizeQueue(game?.queue)) if (!ids.includes(q.uid)) ids.push(q.uid)
  return ids
}

/**
 * The room's host uid. Party rooms: the coordinator (coordinator.js
 * roomCoordinator — an explicit `hostUid` while that player is seated and
 * online, else the first online seat in join order), so host controls and the
 * party pages' phase driver always agree. 2P rooms: `hostUid` while that
 * player is still in the room (a seat or the queue), else the X seat.
 */
export function roomHostUid(game, nPlayer) {
  if (nPlayer) return roomCoordinator(game?.players, game?.hostUid ?? null)
  const override = game?.hostUid
  if (override && roomMemberIds(game, false).includes(override)) return override
  return game?.players?.X?.playerId || null
}

/**
 * Everyone the host can act on, for the host controls list: seats first (X, O
 * or party join order), then the queue.
 * @returns {{ uid, name, avatar, where: 'X'|'O'|'seat'|'queue' }[]}
 */
export function roomMembers(game, nPlayer) {
  const out = []
  if (nPlayer) {
    const seats = Object.values(game?.players || {})
      .filter(p => p?.playerId)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.playerId).localeCompare(String(b.playerId)))
    for (const p of seats) out.push({ uid: p.playerId, name: str(p.name, '???'), avatar: p.avatar ?? null, where: 'seat' })
  } else {
    for (const sym of ['X', 'O']) {
      const p = game?.players?.[sym]
      if (p?.playerId) out.push({ uid: p.playerId, name: str(p.name, '???'), avatar: p.avatar ?? null, where: sym })
    }
  }
  for (const q of normalizeQueue(game?.queue)) {
    if (!out.some(m => m.uid === q.uid)) out.push({ uid: q.uid, name: q.name, avatar: q.avatar, where: 'queue' })
  }
  return out
}

/**
 * The patch that removes `uid` from the room for this match (KICK). The
 * player is marked in `kicked` (cleared by the next fresh match) so their
 * client can't reclaim the seat.
 *  - party seat or queue entry: removed.
 *  - 2P seat: refilled from the queue head; when X leaves with nobody queued,
 *    O moves up to X. The caller resets the board (`reset: true`) — the match
 *    in progress can't continue with a different opponent.
 * @returns {{ updates: object, reset: boolean, seated: boolean }}
 */
export function kickPatch(game, uid, nPlayer, now) {
  const updates = { [`kicked/${uid}`]: true }
  if (nPlayer) {
    if (game?.players?.[uid]) updates[`players/${uid}`] = null
    if (game?.queue?.[uid]) updates[`queue/${uid}`] = null
    return { updates, reset: false, seated: false }
  }
  const sym = game?.players?.X?.playerId === uid ? 'X' : game?.players?.O?.playerId === uid ? 'O' : null
  if (game?.queue?.[uid]) updates[`queue/${uid}`] = null
  if (!sym) return { updates, reset: false, seated: false }
  const queue = normalizeQueue(game.queue).filter(q => q.uid !== uid)
  const next = queue[0]
  if (next) {
    updates[`players/${sym}`] = seatRecord(next, { seatedAt: now })
    updates[`queue/${next.uid}`] = null
    return { updates, reset: true, seated: true }
  }
  const other = sym === 'X' ? game.players.O : null
  if (other?.playerId) {
    updates['players/X'] = { name: other.name, playerId: other.playerId, joinedAt: other.joinedAt || 0, avatar: other.avatar ?? null, seatedAt: other.seatedAt ?? null }
  } else if (sym === 'X') {
    updates['players/X'] = null
  }
  updates['players/O'] = null
  return { updates, reset: true, seated: false }
}

/** Whether `uid` may take a new seat or queue place right now. */
export function canTakeSeat(game, uid) {
  return !game?.locked && !game?.kicked?.[uid]
}
