import { commitSeed, deriveSeed, generateSeedHex } from '../../lib/diceLogic'

// Pig anti-cheat: coin-flipping protocol to establish a shared deterministic
// roll seed (see src/lib/diceLogic.js). X commits seedA, O contributes seedB,
// X reveals seedA, both derive diceSeed. Runs for both Pig variants — the
// registry wires it in as their `roomEffect`, which useRoomEffect calls on
// every room snapshot.
//
// `memo` persists across snapshots for the life of the room page
// ({ coinFlipStarted, seedA }); `write(patch)` updates games/{gameId}.
export function runPigSeedProtocol({ game, gameId, mySymbol, memo, write }) {
  if (game.status !== 'playing') return
  if (!mySymbol) return
  const sym = mySymbol
  const SK = `pig-seedA-${gameId}`

  // Reset the one-shot gate when the protocol state has been fully cleared
  // (e.g. a "play again" reset) so the coin flip can run again.
  if (!game.diceSeedCommitX && !game.diceSeedB && !game.diceSeedRevealX && !game.diceSeed) {
    memo.coinFlipStarted = false
  }

  ;(async () => {
    // Step 1 — X commits seedA (once both seats are present).
    if (sym === 'X' && !game.diceSeedCommitX && game.players?.O && !memo.coinFlipStarted) {
      memo.coinFlipStarted = true
      const seedA = generateSeedHex()
      try { sessionStorage.setItem(SK, seedA) } catch { /* private mode */ }
      memo.seedA = seedA
      const hash = await commitSeed(seedA)
      await write({ diceSeedCommitX: hash }).catch(() => {})
      return
    }
    // Step 2 — O contributes seedB once the commit is on the wire.
    if (sym === 'O' && game.diceSeedCommitX && !game.diceSeedB && !memo.coinFlipStarted) {
      memo.coinFlipStarted = true
      const seedB = generateSeedHex()
      await write({ diceSeedB: seedB }).catch(() => {})
      return
    }
    // Step 3 — X reveals seedA once O has contributed.
    if (sym === 'X' && game.diceSeedCommitX && game.diceSeedB && !game.diceSeedRevealX) {
      let seedA = ''
      try { seedA = sessionStorage.getItem(SK) || '' } catch { /* */ }
      if (!seedA) seedA = memo.seedA || ''
      if (seedA) {
        // Verify our local seedA still matches the published commit; if a
        // same-tab reload wiped sessionStorage we cannot soundly reveal.
        const hash = await commitSeed(seedA)
        if (hash !== game.diceSeedCommitX) return
        await write({ diceSeedRevealX: seedA }).catch(() => {})
      }
      return
    }
    // Step 4 — host (X) derives and publishes diceSeed once both halves exist.
    if (sym === 'X' && game.diceSeedRevealX && game.diceSeedB && !game.diceSeed) {
      const seed = await deriveSeed(game.diceSeedRevealX, game.diceSeedB)
      await write({ diceSeed: seed }).catch(() => {})
      return
    }
  })()
}
