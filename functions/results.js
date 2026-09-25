// Server-authoritative match results: the only writer of leaderboard/{uid}.
// Clients no longer write the leaderboard (profile.js keeps only the private
// users/{uid}/stats mirror); this trigger credits a 2P match once, after
// re-checking the result with the app's own game logic. All decisions live in
// the pure core (src/core.mjs, bundled to lib/core.cjs — see build.js); this
// file only reads the room, runs the core inside transactions and writes.
const { onValueWritten } = require('firebase-functions/v2/database')
const logger = require('firebase-functions/logger')
const core = require('./lib/core.cjs')

// Public name/avatar for a leaderboard row: the public profile first, then
// the users/{uid} profile, then what the player typed into their seat. Reads
// single fields so a big users/{uid} (stats, match history) is never pulled.
// `member` is false when the uid has no profile at all — not a real account
// of this app, so it never gets a leaderboard row.
async function publicIdentity(root, uid) {
  const [pub, name, avatar] = await Promise.all([
    root.child(`profiles/${uid}`).get(),
    root.child(`users/${uid}/displayName`).get(),
    root.child(`users/${uid}/avatar`).get(),
  ])
  const p = pub.val() || {}
  return {
    member: pub.exists() || name.exists(),
    name: p.displayName ?? p.name ?? name.val() ?? null,
    avatar: p.avatar ?? avatar.val() ?? null,
  }
}

// Writes every queued credit of this room to the leaderboard, then marks it
// applied. Safe to run twice (or concurrently): each leaderboard row keeps the
// match keys it has already counted, so a repeat is a no-op.
async function applyPendingCredits(root, gameId, state) {
  for (const credit of core.pendingCredits(state)) {
    const key = core.matchKey(gameId, credit.epoch)
    const seats = [['X', credit.x], ['O', credit.o]]
    const ids = await Promise.all(seats.map(([, uid]) => publicIdentity(root, uid)))
    const members = ids.every(id => id.member)
    if (members) {
      const now = Date.now()
      await Promise.all(seats.map(([sym, uid], i) => root.child(`leaderboard/${uid}`).transaction(row => core.applyCredit(row, {
        key,
        outcome: core.outcomeFor(credit.winner, sym),
        name: ids[i].name ?? credit.names?.[sym] ?? null,
        avatar: ids[i].avatar ?? credit.avatars?.[sym] ?? null,
        now,
      }))))
      logger.info('match credited', { gameId, epoch: credit.epoch, gameType: credit.gameType, winner: credit.winner, verdict: credit.verdict })
    } else {
      logger.warn('match not credited: a seat has no profile', { gameId, epoch: credit.epoch, x: credit.x, o: credit.o })
    }
    await root.child(`results/${gameId}/matches/${credit.epoch}`).update(
      members ? { applied: true } : { applied: true, verdict: 'rejected', reason: 'seat without a profile' },
    )
  }
}

// Runs `reduce` (a pure core reducer: previous state -> next state, or null
// for "no change") as a transaction on results/{gameId}; returns the state
// afterwards and the reducer's last note.
async function transactResults(root, gameId, reduce) {
  let note = null
  const { snapshot } = await root.child(`results/${gameId}`).transaction(cur => {
    const out = reduce(cur)
    note = out.note
    return out.state ?? undefined
  })
  return { state: snapshot.val(), note }
}

// Fires on every change of a room's status: 'playing' may open a new match
// epoch, 'finished' judges the round (and closes the match when it decides
// it). Anything else (waiting, room deleted) is ignored.
exports.creditMatchResults = onValueWritten({ ref: '/games/{gameId}/status' }, async (event) => {
  const before = event.data.before.val()
  const after = event.data.after.val()
  if (before === after || (after !== 'playing' && after !== 'finished')) return
  const { gameId } = event.params
  // The root of the database instance that fired (not necessarily the
  // project's default one).
  const root = event.data.after.ref.root
  const room = (await root.child(`games/${gameId}`).get()).val()
  if (!room || !core.twoPlayerSeats(room)) return
  const now = Date.now()

  let result
  if (after === 'playing') {
    if (room.status !== 'playing') return
    result = await transactResults(root, gameId, cur => {
      const state = core.reduceStart(cur, room, now)
      return { state, note: state ? `epoch ${state.epoch} opened` : 'no new epoch' }
    })
  } else {
    // The room moved on (a quick PLAY AGAIN) before this read: its board is
    // gone, so the round is recorded as one of unknown outcome.
    const staleKey = room.status === 'finished' ? null : `s${core.shortHash(event.id)}`
    const verdict = staleKey ? null : core.verifyRound(room)
    if (verdict?.verdict === 'rejected') {
      logger.warn('round rejected', { gameId, gameType: room.gameType, winner: room.winner, reason: verdict.reason })
    }
    result = await transactResults(root, gameId, cur => core.reduceFinish(cur, room, { now, staleKey, verdict }))
  }
  if (result.note?.startsWith('match rejected')) logger.warn(result.note, { gameId, gameType: room.gameType })
  else if (result.note) logger.debug(result.note, { gameId })
  await applyPendingCredits(root, gameId, result.state)
})
