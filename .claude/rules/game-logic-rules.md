# Game Logic Rules

- Pure game logic lives in `src/lib/*Logic.js` — no DOM, no Firebase, no React. Exports functions like `getWinner(board)`, `applyMove(...)`, `computeAI(...)`.
- **Every logic module ships with a `.test.js` file beside it.** This is the single most-repeated coverage gap across review passes (`tictactoe4Logic.js`, `mathLogic.js`, and Two Truths' inline-only logic all shipped without one, and in the 4×4 case the untested bot was silently wrong against the wrong board geometry).
- Components (boards, pages) never contain game rules — they call into the logic module and render its result. If you find win-detection, move validation, or scoring logic inside a `.jsx` file, it belongs in a `*Logic.js` module instead.
- When a bot/AI shares logic with another game's geometry (e.g. a board wrapping another board's win-checker), pass the real board size/geometry through explicitly rather than reusing a same-named helper that assumes different dimensions.
- Doc comments describing AI behavior (e.g. "retreats toward center near the edge") must match what the code actually does — a stale comment is worse than no comment when the next agent trusts it over reading the implementation.
