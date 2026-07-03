# Game PRDs — wild-games wave

Product requirement docs for seven twist-heavy games. Each PRD is self-contained, but three
games (Footsteps, Goofspiel, Liar's Dice) share the **simultaneous-move protocol** specced
below — build it once as `src/lib/simul.js`, then those games get dramatically cheaper.

| Game | Category | Netcode | New primitive | Effort |
|---|---|---|---|---|
| [Chain Reaction](chain-reaction.md) | board | RTDB turn-based | none (registry `applyMove`) | S |
| [Goofspiel](goofspiel.md) | bluff | RTDB + commit-reveal | simultaneous moves | M (S after simul.js) |
| [Footsteps](footsteps.md) | bluff | RTDB + commit-reveal | simultaneous moves | S (after simul.js) |
| [Liar's Dice](liars-dice.md) | bluff | RTDB + commit-reveal | committed hidden state | M |
| [Quantum Tic-Tac-Toe](quantum-tictactoe.md) | board | RTDB turn-based | collapse phase | M |
| [Breakout Duel](breakout-duel.md) | reflex | WebRTC P2P | destructible shared terrain | M |
| [Paint Territory](paint-territory.md) | reflex | WebRTC P2P | grid-delta snapshots | M/L |

**Recommended build order:** Chain Reaction → Goofspiel (builds simul.js) → Footsteps →
Liar's Dice → Breakout Duel → Quantum TTT → Paint Territory.

---

## Shared platform integration (applies to every PRD)

- Registry entry in `GAME_TYPES` (`src/lib/games.js`): `badge`, `desc`, `maxWidth`, `Icon`
  (add to `src/components/GameIcons.jsx`), plus either the standard
  `boardSize`/`getMoveIndex`/`getWinner` trio, the `applyMove`/`boardProps` hooks, or
  `custom: true` with a dedicated page dispatched from `Game.jsx`'s custom ladder.
- `freshGameState()` derives initial state from the registry; every new Firebase key must be
  listed in `FIELD_NULLS` so switching games clears it.
- Score/rematch/switch/presence/win-effect/`recordMatch` come free. Custom pages must use
  **`onPlayAgain` (keeps score)** for round-continue, not `onNewMatch` (resets) — see the
  Pong/Snake pages for the pattern.
- Pure game logic lives in `src/lib/<game>Logic.js` with a vitest suite; no DOM, no network.
- Theming: `retro-*` tokens and `--c-*` vars only, no hex. Sounds via semantic `sounds.*`
  calls. Demo mode (`/demo`) plays vs a local bot straight off the logic module.

---

## Simultaneous-move protocol (`src/lib/simul.js`) — new shared primitive

Both players act **at the same time** with no server and no trust, using the salted SHA-256
commitment scheme already proven by Hangwoman (`src/lib/commit.js` — generalize its
hash/salt helpers rather than duplicating).

### Round node shape (under `games/{id}/round`)

```
round: {
  n: 1,                      // monotonically increasing round number
  phase: 'commit' | 'reveal' | 'resolved',
  commits: { X: <sha256(move:salt)>, O: ... },   // written during 'commit'
  reveals: { X: { move, salt }, O: ... },        // written during 'reveal'
}
```

### Flow

1. **Commit** — each client picks a move, generates a salt, stores `{ move, salt }` in
   sessionStorage (key `simul-{gameId}-{n}`), writes only the hash to `commits/{mySymbol}`.
2. When **both commits** exist, either client flips `phase: 'reveal'` via `runTransaction`
   (idempotent — guard on phase).
3. **Reveal** — each client writes its `{ move, salt }` to `reveals/{mySymbol}`.
4. When both reveals exist, **each client independently verifies** the opponent's reveal
   hashes to their commitment. Mismatch → write `cheatFlag: <symbol>`; the honest player
   wins the match (same trust model as Hangwoman's reveal verification).
5. **Resolve** — both clients compute the identical next state from the two revealed moves
   (pure function in the game's logic module) and write it with a `runTransaction` guarded
   on `round.n` (first writer wins; the write is deterministic so it doesn't matter who).
   Resolution bumps `n`, resets phase to `'commit'`, nulls commits/reveals.

### Shared randomness (needed by Goofspiel)

Neither player may control or predict random draws. Derive entropy from both salts:
`seed_n = sha256(saltX_n + saltO_n + gameId + n)`. Neither player knows the other's salt
before committing their own move, so neither can steer the outcome.

### Edge cases (uniform across simul games)

- **Refresh, same tab**: sessionStorage survives reload — client re-reads its pending
  `{ move, salt }` and resumes the phase. **New tab / other device**: the pending salt is
  gone; if already committed, the client must **concede the round** (UI: "YOUR MOVE WAS
  LOST — ROUND CONCEDED"), mirroring Hangwoman's lost-word concession.
- **Opponent commits then stalls** (never reveals): show the standard presence banner
  ("OPPONENT DISCONNECTED"); no auto-forfeit in v1 — players already have New Match/Switch
  as the escape hatch.
- **Spectators** see commits (hashes only, meaningless) and reveals as they land — safe.
