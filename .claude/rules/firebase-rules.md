# Firebase Rules

- **Firebase deletes any key set to `null`.** Use this deliberately for state you want removed (e.g. `freshGameState()` nulls out the previous game's keys); never set `null` on a value you expect to still read back.
- Empty board cells are stored as `''`, never `null` — this keeps array length stable across writes. `normalizeBoard()` (`src/lib/gameLogic.js`) converts whatever Firebase returns into a guaranteed fixed-length string array; game-specific normalizers (e.g. Mancala's `normalizePits`) must follow the same pattern.
- `winner` and `winningLine` are absent from the node until the game ends — always read them as `game.winner ?? null` / `game.winningLine ?? null`.
- **Always normalize on read.** Firebase returns either a real array or a numeric-keyed object depending on sparsity, so any array-shaped field needs a normalizer that maps by explicit key (`Object.entries(raw).forEach(([k, v]) => arr[parseInt(k)] = v)`), never `Object.values(raw)` — `Object.values` returns entries in key order with gaps compacted, which silently shifts values to the wrong index on a sparse write (see Mancala's `normalizePits` bug for what this looks like when done wrong).
- Firebase deletes empty arrays too — an append-only field with nothing in it yet (e.g. `sosLines`) will read back `undefined`, not `[]`; normalize that case explicitly.
- Seat/slot claims (X/O assignment) go through a Firebase `runTransaction` to prevent race conditions between two players joining simultaneously. Any new claim-once resource (friend codes, room seats) should use the same pattern.
