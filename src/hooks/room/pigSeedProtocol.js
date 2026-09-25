import { toast } from 'sonner'
import { commitSeed, deriveSeed, generateSeedHex } from '../../lib/diceLogic'

// Pig anti-cheat: coin-flipping protocol to establish a shared deterministic
// roll seed (see src/lib/diceLogic.js). The committer commits seedA, the other
// seat contributes seedB, the committer reveals seedA, and diceSeed is derived
// from both. Runs for both Pig variants — the registry wires it in as their
// `roomEffect`, which useRoomEffect calls on every room snapshot.
//
// The committer is X unless `diceSeedCommitter` says 'O'. The field names
// keep their original `…X` spelling (diceSeedCommitX / diceSeedRevealX) so
// rooms and clients from before the recovery path below read the same keys.
//
// Recovery: seedA lives only in the committer's tab (sessionStorage + memo).
// If they reopen the room in a new tab or device before revealing, it's gone
// and the round could never get a seed — rolls blocked forever. The
// committer's client then restarts the flip with the roles SWAPPED (the other
// seat commits, this one contributes blind), so throwing a seed away after
// learning both halves never lets the same player pick the next one. Every
// restart is counted in `diceSeedResets` and announced to both players.
// Once diceSeed is published it's public, so nothing needs recovering later.

export function seedCommitter(game) {
  return game?.diceSeedCommitter === 'O' ? 'O' : 'X'
}

// The one step this seat should take for the current protocol state:
// 'commit' | 'contribute' | 'reveal' | 'reset' | 'derive' | null.
// `seedMatchesCommit` — does this client hold the seedA behind the published
// commit? Only consulted for the committer once a commit exists.
export function pigSeedStep(game, sym, { seedMatchesCommit = false } = {}) {
  if (!game || game.status !== 'playing' || !sym || game.diceSeed) return null
  // X is the room's creator; the flip starts once the second seat fills.
  if (!game.players?.O) return null
  const committer = seedCommitter(game)
  if (!game.diceSeedCommitX) return sym === committer ? 'commit' : null
  if (!game.diceSeedRevealX) {
    if (sym === committer) {
      if (!seedMatchesCommit) return 'reset'
      return game.diceSeedB ? 'reveal' : null
    }
    return game.diceSeedB ? null : 'contribute'
  }
  // Deterministic and idempotent — either seat may publish it, so a committer
  // who drops right after revealing can't stall the round.
  return game.diceSeedB ? 'derive' : null
}

// The protocol state a step acts on — two snapshots with the same key would
// repeat the same write, so each key runs at most once per room page.
function stepKey(game, step) {
  return [step, game.diceSeedResets || 0, game.diceSeedCommitX || '', game.diceSeedB || '', game.diceSeedRevealX || ''].join('|')
}

// `memo` persists across snapshots for the life of the room page
// ({ busy, queued, lastKey, seedA, checked, seenResets }); `write(patch)`
// updates games/{gameId}.
export function runPigSeedProtocol(args) {
  const { game, gameId, mySymbol, memo, write } = args
  if (game.status !== 'playing') return
  if (!mySymbol) return
  const sym = mySymbol
  const SK = `pig-seedA-${gameId}`

  // Tell both players about a restart they didn't cause (the resetting
  // client has already moved on by the time the count lands).
  const resets = game.diceSeedResets || 0
  if (memo.seenResets === undefined) memo.seenResets = resets
  if (resets > memo.seenResets) {
    memo.seenResets = resets
    if (!memo.resetByMe) toast('DICE SEED RESTARTED — OPPONENT REJOINED')
    memo.resetByMe = false
  }

  // One step at a time; a snapshot that lands meanwhile is replayed once the
  // step settles, so the opponent's half is never missed.
  if (memo.busy) { memo.queued = args; return }
  // A cleared protocol (PLAY AGAIN / NEW MATCH) starts a fresh run.
  if (!game.diceSeedCommitX && !game.diceSeedB && !game.diceSeedRevealX && !game.diceSeed) memo.lastKey = null

  const localSeed = () => {
    let seedA = ''
    try { seedA = sessionStorage.getItem(SK) || '' } catch { /* private mode */ }
    return seedA || memo.seedA || ''
  }

  memo.busy = true
  ;(async () => {
    let key = null
    try {
      const needsSeedCheck = sym === seedCommitter(game) && game.diceSeedCommitX && !game.diceSeedRevealX && !game.diceSeed
      const seedA = needsSeedCheck ? localSeed() : ''
      let seedMatchesCommit = false
      if (needsSeedCheck && seedA) {
        // Hash once per (seed, commit) pair, not on every chat/presence snapshot.
        if (memo.checked?.seedA !== seedA || memo.checked?.commit !== game.diceSeedCommitX) {
          memo.checked = { seedA, commit: game.diceSeedCommitX, ok: (await commitSeed(seedA)) === game.diceSeedCommitX }
        }
        seedMatchesCommit = memo.checked.ok
      }
      const step = pigSeedStep(game, sym, { seedMatchesCommit })
      if (!step) return
      key = stepKey(game, step)
      if (memo.lastKey === key) return
      memo.lastKey = key

      if (step === 'commit') {
        const fresh = generateSeedHex()
        try { sessionStorage.setItem(SK, fresh) } catch { /* private mode */ }
        memo.seedA = fresh
        await write({ diceSeedCommitX: await commitSeed(fresh) })
      } else if (step === 'contribute') {
        await write({ diceSeedB: generateSeedHex() })
      } else if (step === 'reveal') {
        await write({ diceSeedRevealX: seedA })
      } else if (step === 'reset') {
        try { sessionStorage.removeItem(SK) } catch { /* private mode */ }
        memo.seedA = ''
        memo.resetByMe = true
        await write({
          diceSeedCommitX: null,
          diceSeedB: null,
          diceSeedRevealX: null,
          diceSeedCommitter: sym === 'X' ? 'O' : 'X',
          diceSeedResets: resets + 1,
        })
      } else if (step === 'derive') {
        await write({ diceSeed: await deriveSeed(game.diceSeedRevealX, game.diceSeedB) })
      }
    } catch {
      // A failed write may be retried on the next snapshot.
      if (key && memo.lastKey === key) memo.lastKey = null
    } finally {
      memo.busy = false
      const next = memo.queued
      memo.queued = null
      if (next) runPigSeedProtocol(next)
    }
  })()
}
