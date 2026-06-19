# Game Night

A browser-based multiplayer games platform. Play with friends in real time — no account needed. Share a link, join instantly.

**Live:** https://game-night-91464.web.app

## Games

- Tic Tac Toe
- Connect Four
- Hangwoman — hidden-word game; a commit–reveal scheme keeps the word secret with no server and catches a cheating word-keeper (design in [`docs/HANGMAN.md`](docs/HANGMAN.md))
- Dots and Boxes — 4×4 grid; completing a box claims it and grants an extra turn; first to 9 of 16 boxes wins the round (design in [`README-dots-and-boxes.md`](README-dots-and-boxes.md))
- SOS — 7×7 grid; each turn place either an S or an O anywhere; completing an S-O-S in a line scores a point and grants another move; most sequences when the board is full wins
- Simon — a memory duel; on your turn the growing pad sequence flashes once and then hides, you replay it from memory (pad colours are concealed except during the flash, so there's no reading the answer off the board), then add one new pad of your choice and pass the turn; the first misremembered pad loses the round
- Typing Race — both players type the same passage simultaneously; a ghost cursor shows the opponent's live position; errors stay highlighted but don't block progress; winner is determined by effective WPM (speed × accuracy) at the finish line; supports a QWERTY on-screen keyboard or the device keyboard
- Mental Math Duel — 2-minute blitz where both players race on the same math question simultaneously; first correct answer wins the round and earns speed-bonus points (1–5 depending on how quickly you answered); ⚡ power questions every 8 rounds double the points and penalty; 🔥 a 3-question correct streak applies a ×2 multiplier to the next correct answer; wrong answers lose points; highest score at the buzzer wins

## How it works

1. Enter your name and pick a game from the grid — you get a 6-character room code
2. Share the link with a friend (or they type the code into **JOIN A FRIEND** at the top of the home page)
3. They open it, enter their name, and the game starts
4. Moves sync in real time via Firebase; each player sees the board update instantly
5. When a game ends, hit **PLAY AGAIN** or **NEW MATCH** — the opponent gets an ACCEPT/DECLINE prompt; both must agree before the game resets. **SWITCH GAME** works the same way. If the opponent is offline or hasn't joined, the action applies immediately.

Players are identified by a stable browser ID stored in `localStorage` — no sign-up, no passwords. The creator is always X; the first person to join is O. A third person who opens the link becomes a spectator. Closing a tab no longer kills the game — reopening the invite link in the same browser reclaims your seat automatically.

## Features

- **Real-time multiplayer** — Firebase Realtime Database keeps both boards in sync
- **Score tracking** — scores persist across rounds; first to 3 wins triggers a match-over screen
- **Shareable result cards** — every end screen has a **SHARE** button that renders a themed pixel-art result card to a canvas and opens the native share sheet (`navigator.share`), with a PNG-download fallback (`src/lib/shareCard.js`)
- **Emote reactions** — a 🔥 😂 😭 😎 👏 💀 bar broadcasts a transient `emote` node that floats over the room for both players, with a soft cue
- **No-login stats & rivalries** — lifetime wins/losses, best streak, and per-game + head-to-head (by opponent name) records kept in `localStorage` (no account required), surfaced as **YOUR STATS** on the home screen (`src/lib/profile.js`)
- **Return to your rooms** — **YOUR ROOMS** lists recent rooms for one-tap rejoin; rooms now persist as long as they're played within 24h (activity-based cleanup, `lastActivityAt`) so a recurring "crew room" survives instead of being deleted nightly
- **Game-feel juice** — mobile **haptics** (wired through the sound engine, shares the mute toggle), a bigger multi-colour confetti + fanfare climax for *match* wins vs. round wins, pop/drop placement animations (Tic Tac Toe marks pop, Connect Four discs drop), and rising-pitch combo sounds for streaks (Aim, Mental Math)
- **Reduced-motion support** — respects `prefers-reduced-motion` (disables animations and the CRT scanlines)
- **Mobile-tuned** — safe-area insets for notches/home indicators (`viewport-fit=cover`), fast taps (no 300ms delay or grey tap-flash), and responsive game areas
- **Link previews** — Open Graph / Twitter card meta so a pasted invite renders a preview instead of a blank blob
- **In-room game switching** — every end-of-game screen has a **SWITCH GAME** button that opens the shared game picker; switching resets the board and scores but keeps players, presence, and the room code
- **Rematch consent** — PLAY AGAIN / NEW MATCH / SWITCH GAME are propose-and-accept: the opponent gets an ACCEPT/DECLINE banner instead of having the room yanked out from under them (applies instantly when they're offline or haven't joined)
- **Seat reclaim** — a stable `playerId` in `localStorage` is stamped into each player slot; closing a tab or re-clicking the invite link reclaims your seat instead of demoting you to spectator
- **Invite landing page** — an invited friend without a name gets a "YOU'RE INVITED" prompt right on the game page, never bounced back to home
- **Colorblind-safe boards** — Connect Four discs carry an X/O letter glyph on top of the player accent colors (cyan/pink in the default theme), and every cell has an aria-label
- **Practice offline** — the home page links to `/demo`, fully playable local versions of every board game with no Firebase and no second player
- **Extra-turn chains** — Dots and Boxes grants another turn on every completed box, with double-box edges, live box counts, and an early clinch at 9 boxes
- **Cheat-proof hidden words** — Hangwoman stores the word only in the setter's browser, committed to Firebase as a salted SHA-256 hash (`src/lib/commit.js`); on reveal the guesser's client verifies the hash and every recorded answer, and a CHEAT DETECTED screen presents the evidence if anything doesn't match
- **Execution drama** — Hangwoman's pixel figure gets a trapdoor drop with thud and funeral bell on the final miss, a blinking DEAD WOMAN GUESSING warning at last life, and a RIP QUEEN memorial with falling roses for the loss screen
- **Presence detection** — green dot on each player card; "OPPONENT DISCONNECTED" warning when the other tab goes offline
- **8-bit sound effects** — move bleeps, win jingle, lose tune, draw buzz, join ping; all generated via Web Audio API (no audio files)
- **Mute toggle** — speaker icon in the game header and home page corner; preference saved in `localStorage`
- **Win animation** — pixel particle burst + screen flash in the winner's colour on game end
- **Retro CRT look** — Press Start 2P pixel font, neon glows, scanline overlay, vignette
- **Six switchable themes** — Midnight Arcade (default), Phosphor, Amber CRT, Synthwave, The Grid, and 1-Bit Mono; the palette picker sits next to the mute button on every screen, applies instantly with no reload, and the choice persists per device. Every color flows through CSS variables, so adding a theme is one CSS block + one registry entry
- **Pixel-art cursors** — hand-drawn arrow, pointing glove, I-beam, and ⊘ cursors (SVG data URIs), plus a theme-colored blinking caret in text inputs
- **PWA** — installable on mobile, offline home screen via Workbox service worker; new deploys surface an UPDATE READY banner at the top of the screen with a RELOAD action instead of auto-reloading mid-game
- **Security rules** — writes blocked outside `games/` (see [Security & correctness](#security--correctness) for known gaps in the per-game rules)

## Tech stack

| | |
|---|---|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS v3 + shadcn utilities |
| Routing | React Router v7 |
| Real-time | Firebase Realtime Database |
| Tests | Vitest (pure game logic + commit–reveal) |
| Toasts | Sonner |
| Fonts | Press Start 2P (Google Fonts) |
| PWA | vite-plugin-pwa (Workbox) |
| Hosting | Firebase Hosting |

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Set up Firebase config
cp .env.local.example .env.local
# Fill in your Firebase project values in .env.local

# 3. Start dev server
npm run dev
# → http://localhost:5173
```

### Firebase setup (one-time)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database** (Build → Realtime Database → Create database → test mode)
3. Register a web app (Project Settings → Your apps → `</>`) and copy the config into `.env.local`
4. Security rules are in `database.rules.json` — deploy with `firebase deploy --only database`

## Commands

```bash
npm run dev       # dev server with HMR
npm run build     # production build → dist/
npm run preview   # serve dist/ locally
npm run lint      # ESLint
npm test          # Vitest (TTT, Connect Four, Dots and Boxes, SOS, hangwoman logic, commit–reveal)
```

## Deploy

```bash
npm install -g firebase-tools
firebase login
npm run build
firebase deploy --only hosting        # hosting only
firebase deploy --only hosting,database  # hosting + security rules
```

The `functions/` directory contains a scheduled Cloud Function that deletes games older than 24 hours. Deploying it requires the **Blaze (pay-as-you-go)** plan:

```bash
firebase deploy --only functions
```

## Adding a new game

The room/invite/Firebase/presence layer is game-agnostic. Each game needs:

1. A logic file in `src/lib/` exporting `getWinner(board)` and any move helpers
2. A board component in `src/components/`
3. An icon component in `src/components/GameIcons.jsx`
4. A single entry in `GAME_TYPES` in `src/lib/games.js` — `boardSize`, `getMoveIndex`, `getWinner`, `BoardComponent`, `badge`, `maxWidth`, `desc`, `Icon`. The entry drives the home-screen grid and the end-of-game **SWITCH GAME** picker (both render from the registry via `GamePicker`), `freshGameState()` initial state, and everything `Game.jsx` renders (`Game.jsx` has no per-game branches)

Games that don't fit the standard place-symbol → flip-turn → check-winner shape supply two optional registry hooks instead of `getWinner`: `applyMove()` (full control of the Firebase write — Dots and Boxes uses it for extra turns and box ownership) and `boardProps()` (extra props for the board component, e.g. `boxes`).

Sounds, presence, score tracking, game switching, and the win effect work automatically for any game type.

## Project structure

```
src/
  components/
    Board.jsx / Cell.jsx          # Tic Tac Toe board
    ConnectFourBoard.jsx          # Connect Four board
    DotsAndBoxesBoard.jsx         # Dots and Boxes edge/box grid with box counts
    SosBoard.jsx                  # SOS 7×7 letter grid with letter picker and SOS-line highlights
    HangmanGallows.jsx            # Pixel gallows + figure, trapdoor drop
    WordDisplay.jsx               # Hangwoman letter slots
    LetterKeyboard.jsx            # Hangwoman A–Z guess keyboard
    TypingKeyboard.jsx            # QWERTY on-screen keyboard for Typing Race (+ physical keydown listener)
    NumberPad.jsx                 # 3×4 numpad for Mental Math (7-8-9 / 4-5-6 / 1-2-3 / ⌫-0-✓)
    WordSetter.jsx                # Hangwoman word entry (setter)
    Gravestone.jsx                # RIP QUEEN memorial pixel art
    RoseFall.jsx                  # Falling-roses mourning overlay
    GameIcons.jsx                 # Per-game SVG icon components
    GamePicker.jsx                # Game card grid (home screen + switch modal)
    GameSwitcher.jsx              # SWITCH GAME button + modal picker
    ProposalBanner.jsx            # Rematch/switch consent banner (accept / decline / cancel)
    PlayerCard.jsx                # Player name, score, presence dot
    GameStatus.jsx                # Turn / win / match-over display
    WaitingRoom.jsx               # Invite link + copy button
    WinEffect.jsx                 # Pixel particle burst on game end
    ui/sonner.jsx                 # Sonner Toaster (retro styled)
  pages/
    Home.jsx                      # Name entry, join-by-code, game selection
    Game.jsx                      # Game room (all game types)
    HangmanGame.jsx               # Hangwoman rounds, commit–reveal, cheat check
    TypingGame.jsx                # Typing Race — passage display, ghost cursor, QWERTY keyboard
    MathGame.jsx                  # Mental Math Duel — question card, speed scoring, NumberPad, transactions
    Demo.jsx                      # Local-only playable demo (no Firebase)
  lib/
    firebase.js                   # Firebase init (reads VITE_FIREBASE_* env vars)
    games.js                      # per-game config registry (GAME_TYPES, getGameConfig) + freshGameState()
    gameLogic.js (+ .test.js)     # TTT win detection + normalizeBoard
    connectFourLogic.js (+ .test.js)  # Connect Four win detection + drop helper
    dotsAndBoxesLogic.js (+ .test.js) # edge/box indexing, applyEdgeMove, clinch detection
    sosLogic.js (+ .test.js)      # SOS line detection, applySosMove, getSosWinner
    hangmanLogic.js (+ .test.js)  # Hangwoman guess/win logic + consistency check
    mathLogic.js                  # Deterministic question generator for Mental Math (seeded LCG, GAME_MS, QUESTION_MS)
    commit.js (+ .test.js)        # Salted SHA-256 commit–reveal primitive
    playerId.js                   # Stable per-browser ID (localStorage) for seat reclaim
    sounds.js                     # Web Audio API sound engine
    utils.js                      # cn() helper (clsx + tailwind-merge)
  hooks/
    useInstallPrompt.js           # PWA beforeinstallprompt hook
functions/
  index.js                        # Scheduled cleanup (Blaze plan required)
database.rules.json               # Firebase Realtime Database security rules
```

The `/demo` route (linked from the home page as **PRACTICE OFFLINE**) renders fully playable local versions of the board games — no Firebase, no second player; also useful for UI testing without credentials.

## Planned improvements

### Security & correctness

Highest-impact fixes — these are the only items where someone other than the two players can ruin a game.

- **Lock down the database rules.** `database.rules.json` grants `.read: true, .write: true` at `games/$gameId`. In Realtime Database rules, permission granted at a parent **cannot be revoked by a child rule**, so the `players/X` / `players/O` `"!data.exists()"` guards are dead code — anyone with a game ID can overwrite the board, scores, status, or steal a player slot with a raw REST call. The client-side `runTransaction` only protects well-behaved clients from racing each other.
  *Fix:* enable **Firebase Anonymous Auth** (invisible to users, keeps the "no account needed" promise), stamp each player slot with `auth.uid`, and write rules so only the player whose turn it is can update the board. At minimum, add `.validate` rules constraining the data shape: board is a 9- or 42-element array of `'' | 'X' | 'O'`, `status` is one of `waiting | playing | finished`, `currentTurn` is `X | O`, etc.

- **Make moves transactional.** `handleMove` in `src/pages/Game.jsx` does a plain `update()` computed from possibly-stale local state. Two near-simultaneous writes (laggy opponent, double-tap, two tabs) can clobber each other — including the read-modify-write score increment (`scores/${winner}`), which can drop a point. Wrap the move in a `runTransaction` on the game node that re-checks `currentTurn` and cell emptiness against actual server state before committing.

- **Guard against game ID collisions.** `createGame` in `Home.jsx` does a blind `set()` on a random 6-character ID (~2.2 billion combinations, but cleanup only runs daily). A collision would silently overwrite someone's live game. Use a transaction that only writes if the node doesn't exist, or `get()` first and regenerate on collision.

- **Let players reclaim their seat — ✅ done (client side).** A random `playerId` in `localStorage` is saved into the player slot on create/join, and a returning browser with a matching ID reclaims its symbol (`src/lib/playerId.js`, slot resolution in `Game.jsx`). The remaining security half: nothing stops a malicious client from writing someone else's `playerId` — fixing that requires the anonymous-auth work above (the `uid` *is* the player ID).

### Architecture & maintainability

- **Game registry — ✅ done.** `GAME_TYPES` in `src/lib/games.js` now carries `boardSize`, `getMoveIndex`, `getWinner`, `BoardComponent`, `badge`, `maxWidth`, `desc`, and `Icon` per game, plus optional `applyMove`/`boardProps` hooks for non-standard turn shapes (Dots and Boxes is the first consumer); `Game.jsx` contains no per-game branches. Adding a board game is a single registry entry plus an icon — the home grid and the SWITCH GAME picker both render from the registry via `GamePicker`.

- **Board-game unit tests — ✅ done.** `npm test` now covers `getWinner`, `normalizeBoard`, `getConnectFourWinner`, `getConnectFourDrop`, and the full Dots and Boxes suite (`applyEdgeMove`, edge/box indexing, `getDotsAndBoxesWinner`) alongside the existing `hangmanLogic` and `commit` suites.

### Polish

- **Deduplicate the mute button.** The speaker toggle with its two inline SVGs is copy-pasted between `Home.jsx` and `Game.jsx` — extract a `MuteButton` component.

### Demo page (`/demo`) — gaps & known bugs

Audit of the 12 single-player demos in `src/pages/Demo.jsx`. Intended model: each demo is **one human vs a bot**. Four already are; eight are "hot-seat" (the lone user has to play both sides), which is the main gap — plus several concrete runtime bugs. *(Documented for later; not yet fixed.)*

**Opponent model**

- ✅ **Bot-driven, work as solo demos:** Reaction, Aim Trainer, Typing, Mental Math.
- ⚠️ **Hot-seat — need a bot opponent:** Tic Tac Toe, Hangman, Dots & Boxes, SOS, Simon, Chimp, Number Memory, Visual Memory. Each forces the user to make both X's and O's moves (Hangman: the user sets the word *and* then guesses it). To convert, drive the opponent side automatically — a random/greedy move for the board games; auto-recall of the flashed pattern for Simon / Visual Memory / Chimp; an auto-generated word (or a letter-frequency AI guesser) for Hangman; a timed bot answer for Number Memory.

**Runtime bugs (independent of the bot conversion)**

- **Chimp — demo is unplayable (critical).** `Demo.jsx:345` shows the "PASS TO BOB/ALICE" button only while the current player is *not* done (`!(seat === 'X' ? doneX : doneO)`). The instant Alice finishes a level her board is disabled *and* the pass button vanishes, so Bob can never take a turn — only RESET works. The condition is inverted; it should show the button once the current player *is* done.
- **Number Memory — both-wrong crowns BOB (high).** `Demo.jsx:394` `setWinner(!xCorrect ? 'O' : 'X')` declares O the winner when *both* players answer wrong; should be a draw / both-lose. (The multiplayer page has the same both-wrong → O logic at `NumberMemoryGame.jsx:99`.)
- **Mental Math — stale bot timer after reset (high).** The bot's `setTimeout` at `Demo.jsx:1243-1251` closes over `phase`; clicking PLAY AGAIN while a bot answer is pending lets the old timer fire and resolve a question against the freshly-reset game. Clear it in `reset()` or guard on a ref.
- **Hangman — stepper preview not reset (medium).** `reset()` (`Demo.jsx:102-104`) doesn't clear `stepperCount`, so after PLAY AGAIN the gallows-preview stepper still shows the previous value.
- **SOS — letter picker carries over (medium).** `SosBoard` keeps its `selectedLetter` across turns, so the S/O choice from the previous mover stays selected for the next player.
- **Aim Trainer — bot "hits" duplicates score (low, cosmetic).** `Demo.jsx:1006` sets the bot's `hits` to `scoreBot`, so the results panel prints the bot's score twice (no separate hit counter). Also, clicking the bot's target never despawns it (`Demo.jsx:988` `// bot target stays`), so a user can farm friendly-fire on a stationary target.
- **Hangman — keyboard listener churn (low).** `LetterKeyboard` re-binds its `keydown` listener on every guess (inline `handleGuess` + changing `guesses`); harmless but inefficient, with a thin stale-closure window during the win/lose transition.

**UX polish** (mostly disappears once the demos go bot-driven): Tic Tac Toe shows "GAME OVER" instead of "BOT WINS!" on a loss; Dots & Boxes has no player cards; Visual Memory's "OPPONENT RECALLING" hint reads oddly when one user controls both sides.

### Requested gameplay changes

Active change requests, grouped for implementation. *(Documented here; not yet built.)*

1. **Mental Math → multiple choice (no typing).** Replace the numeric-entry answer with tappable multiple-choice options (e.g. four buttons, one correct). `generateQuestion(seed, index)` in `src/lib/mathLogic.js` must also emit a **deterministic, seeded** set of plausible distractors so both players see identical options for the same question; `src/pages/MathGame.jsx` and `MathDemo` (`src/pages/Demo.jsx`) render answer buttons and lock on tap instead of using the input + `NumberPad` (`src/components/NumberPad.jsx`). Keep the speed / ⚡power / 🔥streak scoring intact. Removes the digits-only field and the on-screen numpad.

2. **Typing keyboard → full-width, phone-style.** `src/components/TypingKeyboard.jsx` currently centers each row and caps key width (`flex-1 min-w-0 max-w-[2.5rem]`, rows `justify-center`), so it doesn't fill the container. Make it span the **full available width** and mimic a mobile OS keyboard: rows stretch edge-to-edge with proportional key sizing, a wide space bar, and a backspace key. Should look like a phone's built-in keyboard on both mobile and desktop.

3. **Hangwoman → hint + multi-word answers.** (a) Add a free-text **hint** field to `src/components/WordSetter.jsx` that the setter fills in with the word; surface it to the guesser in `src/pages/HangmanGame.jsx` (and `HangmanDemo`). The hint is non-secret, so store it plaintext on the round node at round start (commit it alongside the word in `src/lib/commit.js` if tamper-proofing is desired). (b) Allow the answer to be **multiple words**: `validateWord` in `src/lib/hangmanLogic.js` and `WordSetter`'s `onChange` currently strip everything but A–Z (`replace(/[^A-Z]/g,'')`) — permit spaces; `WordDisplay.jsx` renders word breaks/gaps; and the guess logic (`applyGuess` / `isWordGuessed`) treats spaces as always-revealed non-letters so only A–Z must be guessed. The word still stays in the setter's browser until reveal via the commit–reveal scheme.

4. **How-to-play for every game.** A "HOW TO PLAY" button (on each home-screen card and in the in-game header) that opens a rules overlay for **all 13 games** — Tic Tac Toe, Connect Four, Hangwoman, Dots & Boxes, SOS, Simon, Chimp Test, Number Memory, Visual Memory, Reaction, Aim Trainer, Typing Race, Mental Math. Store the rules text as a `rules` field per entry in the `GAME_TYPES` registry (`src/lib/games.js`) so the overlay and the `GamePicker` cards both read from one place. (Supersedes the older, partial "How-to-play screens" item below.)

5. **Reaction → auto-advance rounds.** After a round result, don't wait for the user to tap to begin the next round — **auto-start it after ~2 s**. In `src/pages/ReactionGame.jsx` the `'result'` phase currently requires a click (`handleClick` case `'result'` → `startRound()`); replace it with a timed transition into the next round (store the timeout in a ref and clear on unmount / reset). Mirror the change in `ReactionDemo` (`src/pages/Demo.jsx`).

6. **Aim Trainer → shared / visible opponent targets.** Today each player gets an independent target (`aimTargetX` for X, `aimTargetO` for O) that only the owner scores on, with crossover handled as friendly fire — so the two players are effectively aiming at different things. Change `src/pages/AimTrainerGame.jsx` so both players compete on the **same live target(s)**, with the opponent's position shown in real time (e.g. one shared target that both race to click — first click scores and respawns it). Reconcile with, or replace, the current friendly-fire scoring.

### Next games — implementation specs

Concrete build specs for the recommended next games (refines the older [Game candidates](#game-candidates) brainstorm below). Sequenced by impact-per-effort and by which empty category each opens. Today every game is strictly 1v1; the party tier is the leap that needs new shared infrastructure.

| # | Game | Effort | Fit | Category it opens | Prereq |
|---|------|--------|-----|-------------------|--------|
| 1 | Gomoku | S | registry drop-in | big-board / async abstract | — |
| 2 | Reversi / Othello | M | registry `applyMove` | capture-and-flip strategy | — |
| 3 | Order & Chaos | S | registry `applyMove` | asymmetric objectives | Gomoku (win-scan), SOS (letter UI) |
| 4 | Push-your-luck dice | S–M | registry `applyMove` | luck / press-your-luck | — |
| 5 | Two Truths & a Lie | S | custom page | social / about-the-people | — |
| 6 | Bluff Battle (Liar's Dice) | M | custom page | bluffing + dice | — |
| 7 | **N-player room model** | M | infra | (enables 8–11) | — |
| 8 | Wavelength | L (incl. infra) | custom page (N-player) | party / 3+ / prompt deck | #7 |
| 9 | Fibbage (lie & vote) | M | custom page (N-player) | bluffing trivia | #7 |
| 10 | Spyfair (hidden role) | M | custom page (N-player) | social deduction | #7 + per-player-private data |
| 11 | Rivalry Series | M | meta wrapper | retention (grudge match) | any new game |
| 12 | Daily Puzzle | M | custom page | retention (daily/async) | reuses existing skill games |

**How a game gets added** (recap): a logic file in `src/lib/`, a board component in `src/components/`, an icon in `GameIcons.jsx`, and a single `GAME_TYPES` entry in `src/lib/games.js` (+ a `freshGameState` branch if its initial state isn't an empty board). Standard place→flip→win games are pure registry; non-standard turns use the `applyMove`/`boardProps` hooks (Dots & Boxes, SOS); bespoke flows are full custom pages dispatched from `Game.jsx` (Hangwoman, the skill duels). Hidden information uses the salted SHA-256 commit-reveal primitive in `src/lib/commit.js`.

#### Tier A — 2-player board games (registry)

**1. Gomoku (5-in-a-row, 15×15)** · S · registry drop-in
- *Data:* `board: string[225]` (`'' | 'X' | 'O'`), `currentTurn`, `winner`, `winningLine: number[5]`. No new state shape — default `freshGameState` works.
- *Files:* `src/lib/gomokuLogic.js` (`getWinner` + `getMoveIndex`), `src/components/GomokuBoard.jsx` (15×15 grid, intersection stones, scrolls/scales on mobile), icon, one `GAME_TYPES` entry.
- *Logic:* `getMoveIndex = (board, i) => (board[i] ? -1 : i)` (identical to TTT). `getWinner` generalizes `connectFourLogic`'s directional scan: for each filled cell scan the 4 directions (→, ↓, ↘, ↙) for a run of ≥5 same marks; return `{ winner, line }` with the 5 indices; draw when full. Add a `gomokuLogic.test.js` modelled on `connectFourLogic.test.js`.
- *Registry:* `boardSize: 225, getMoveIndex, getWinner, BoardComponent: GomokuBoard, maxWidth: 'max-w-md', badge: 'G5'`.
- *Notes:* ship vanilla; if first-move advantage is a problem later, add a swap2 opening as an `applyMove` variant. Decisive 5-line looks great on the share card.

**2. Reversi / Othello** · M · registry `applyMove`
- *Data:* `board: string[64]`, `currentTurn`. Needs a `freshGameState` branch seeding the 4 centre discs (indices 27/36 = one colour, 28/35 = the other).
- *Files:* `src/lib/reversiLogic.js` (`legalMoves(board, symbol)`, `applyDisc(board, index, symbol)` → flipped board, `getReversiWinner`), `src/components/ReversiBoard.jsx` (8×8, disc flip animation reusing the Connect Four `disc-drop`/`place-pop` keyframes), icon, registry entry.
- *Logic (in `applyMove` hook):* reject moves that don't flank ≥1 line; place the disc and flip all bracketed runs in the 8 directions; set `currentTurn` to the opponent **unless** they have no legal move (pass — keep turn); if **neither** side has a legal move, return `result` from `getReversiWinner` (higher disc count wins; equal = draw). `getMoveIndex = (board, i) => (legal ? i : -1)`.
- *Registry:* `boardSize: 64, getMoveIndex, applyMove, BoardComponent: ReversiBoard, maxWidth: 'max-w-sm', badge: 'OTH'`.
- *Notes:* this is the Dots & Boxes pattern (custom `applyMove`, no `getWinner`); the only hard parts are legality + the no-move pass. The 20-disc last-move swing is the strongest rematch driver of any abstract game.

**3. Order & Chaos** · S · registry `applyMove` (build alongside Gomoku)
- *Data:* `board: string[36]` holding **letters** (`'' | 'X' | 'O'`), `currentTurn`. Move payload `{ index, letter }` like SOS.
- *Files:* `src/lib/orderChaosLogic.js` (reuses Gomoku's run-scan, tuned to runs of 5 on a 6×6), a board component that reuses the SOS letter-picker UI (drop the line-drawing), icon, registry entry with `applyMove` + `boardProps`.
- *Logic:* roles fixed by seat — **X = Order** (wins by making 5-in-a-row of *either* letter), **O = Chaos** (wins if the board fills with no 5). `applyMove` writes the chosen letter and flips turn (simpler than SOS — no extra turns). `getOrderChaosWinner`: any 5-run → Order wins; full board, no run → Chaos wins.
- *Notes:* nearly free once Gomoku (win-scan) and SOS (letter UI) exist. High novelty-per-line; lower social wattage, so bundle it as a combo, not a headliner.

**4. Push-your-luck dice (Zombie Dice / Pig+)** · S–M · registry `applyMove` (or small custom page)
- *Data:* `dice: number[]` (current roll), `turnScore`, `scores`, `phase: 'rolling' | 'busted'`, `currentTurn`. First to 100 (or best-of via the existing match shell).
- *Files:* `src/lib/diceLogic.js`, board component showing dice + ROLL / BANK actions, icon, registry entry.
- *Logic:* the roll is authoritative-by-mover — the player whose turn it is rolls in `applyMove` and writes the dice to RTDB so both clients render identical results (same trust model as the rest of the app; no client-rolls-then-claims). ROLL: new dice; on a bust, zero `turnScore` and pass turn. BANK: add `turnScore` to score, pass turn. Win when a banked score hits the target.
- *Notes:* cheapest brand-new category (luck) and the gentlest first test of a multi-turn loop. Symbol dice (Zombie Dice) add decision texture over plain Pig at the same cost.

#### Tier B — 2-player social / bluff (custom pages)

**5. Two Truths & a Lie** · S · custom page
- *Data:* `round: { setter, phase: 'writing' | 'guessing' | 'reveal', statements: string[3], commitment, guess }`. Roles alternate each round; reuse the existing `scores` + best-of-3 shell.
- *Files:* `src/pages/TwoTruthsGame.jsx`, a `Game.jsx` dispatch branch, a registry `custom: true` entry, icon.
- *Flow:* clones the Hangwoman setter/guesser structure. The setter writes 3 statements (public) and which one is the lie; commit the lie index with `commit.js` (keep the index in `sessionStorage` like `hangwoman-word-{gameId}`) so the guesser can't peek via the DB. Guesser picks; setter's client reveals + verifies; **guesser scores** for catching the lie, **setter scores** for fooling. (Plaintext lie-index is acceptable given the trust model, but commit-reveal is ~free here.)
- *Notes:* highest fun-per-line and the cheapest *social* game; extends to 3+ trivially once the N-player model lands.

**6. Bluff Battle (Liar's Dice / Perudo)** · M · custom page
- *Data:* `round: { commitX, commitO, bids: [{ by, qty, face }], turn, revealX, revealO }`, plus a per-player dice count for elimination. Each player's roll is held in `sessionStorage` (`bluff-roll-{gameId}`).
- *Files:* `src/pages/BluffBattleGame.jsx`, dispatch branch, registry entry, icon.
- *Flow:* each player rolls 5 hidden dice locally and publishes a salted `commit.js` hash. Players alternate raising the bid ("there are ≥ N dice showing face F across both cups"); calling **LIAR** makes both clients publish `{ dice, salt }`, verify against the commitments, count the face (1s wild, optional Perudo rule) and award the loser a die-loss; out of dice = out. Provably cheat-proof with no server.
- *Notes:* opens bluffing **and** dice at once and is the perfect showcase for commit-reveal + the new emote bar — the LIAR flip is a guaranteed emote storm.

#### Tier C — party / 3+ players (needs the N-player room model)

**7. N-player room model** · M · infra (prerequisite for 8–10)
- *Today:* strictly `players: { X, O }`, `mySymbol ∈ X|O|null`, `scores: { X, O }`, `currentTurn ∈ X|O`.
- *Add:* a `players` map keyed by `playerId` (seat order derived from `joinedAt`), `scores` keyed by `playerId`, a `maxPlayers` field on the registry entry, and a host-driven **START** (status stays `waiting` until the host starts, instead of auto-flipping to `playing` on the 2nd join). Generalize the `Game.jsx` join transaction to claim the **next free seat** up to `maxPlayers` (rather than only the `O` slot), and relax the spectator/`mySymbol` logic so party pages read the whole players map.
- *Also:* a prompt-deck convention — bundle static content arrays like the existing `PASSAGES` in `games.js`, e.g. `src/lib/decks/{wavelength,fibbage,spyfair}.js`.
- *Notes:* party games are custom pages that ignore X/O. Build this **with** Wavelength (below) so the cost is paid once and amortized across Fibbage, Spyfair, and any future team/co-op modes.

**8. Wavelength** · L (includes #7) · custom page
- *Data:* `round: { clueGiver, phase: 'clue' | 'guessing' | 'reveal', spectrum: { left, right }, commitment, clue, guesses: { [playerId]: 0–100 } }`; `scores` per `playerId`.
- *Files:* `src/pages/WavelengthGame.jsx`, dispatch branch, registry (`custom: true, maxPlayers: 8`), icon, `src/lib/decks/wavelength.js` (spectrum pairs).
- *Flow:* the clue-giver's client picks a hidden target (0–100), commits it (`commit.js`, target in `sessionStorage`), and types a one-word clue; everyone else drags a dial; on reveal the clue-giver publishes target + salt, the client verifies, and each guesser scores inversely to distance. Rotate the clue-giver each round.
- *Notes:* near-zero rules, pure banter — the build that turns this into a real game-night app. Accept the L cost knowing #7 is reused by every party game after it.

**9. Fibbage (lie & vote)** · M · custom page (after #7/#8)
- *Data:* `round: { phase: 'lying' | 'voting' | 'reveal', prompt, realAnswer, lies: { [playerId]: text }, options: [...shuffled], votes: { [playerId]: optionId } }`.
- *Files:* `src/pages/FibbageGame.jsx`, dispatch, registry, icon, `src/lib/decks/fibbage.js` (`[{ prompt, answer }]`).
- *Flow:* everyone secretly submits a fake answer (commit it so nobody copies), reveal shuffles real + fakes, everyone votes; score **+** for picking the real answer and **+** for each player your lie fooled. Mostly Wavelength's phase machine + a vote UI.
- *Notes:* highest party payoff after Wavelength; the real lift is writing a good fact deck.

**10. Spyfair (one-secret-imposter deduction)** · M · custom page (after #7)
- *Data:* `round: { phase: 'reveal' | 'questioning' | 'vote' | 'result', spy: playerId, timerEnds, votes: { [voter]: accused } }`, plus **per-player-private** `round/private/{playerId} = { role, location }`.
- *Files:* `src/pages/SpyfairGame.jsx`, dispatch, registry, icon, `src/lib/decks/spyfair.js` (locations).
- *Flow:* assign the location to everyone except one random spy; each client reads only its own private node (true per-player secrecy ideally needs anon-auth + read rules; until then write each secret to the player's own key on the trust model). Questioning happens out-of-band (friends talking); the app runs a timer, a vote, and a reveal. Spy wins by evading the vote or guessing the location.
- *Notes:* lowest-content deduction game; it hardens the per-player-private-data part of the room model that the other party games don't exercise.

#### Tier D — retention layers (not new boards)

**11. Rivalry Series** · M · meta wrapper
- *Data:* `series: { games: gameType[], legIndex, scores: { [playerId]: n }, target }` + a banner above the existing end-of-game proposal flow.
- *Files:* mostly `Game.jsx` glue (+ optional `src/lib/series.js`); no new game logic.
- *Flow:* reuse the propose/switch handshake to advance to the next leg, roll up a running series score across games, and fire `shareResult` on clinch with the all-time head-to-head line pulled from `profile.js`. Sequence after ≥1 new game ships so there's fresh content to wrap.

**12. Daily Puzzle** · M · custom page
- *Data:* a date-seeded puzzle (reuse `generateSeed`/`mathLogic`) so every client derives an identical board with no server; results stored under the persistent crew node for a fan-out leaderboard read.
- *Files:* `src/pages/DailyGame.jsx` (or a daily mode), reusing existing skill-game logic (start with a daily Mental Math or Number Memory gauntlet), then a daily commit-reveal word round.
- *Flow:* play solo on your own clock against the day's seed; compare on the crew leaderboard; each run calls `shareResult`. The only pick that creates a reason to open the app daily with no opponent online — build it once there's a library worth returning to.

### Game candidates

Two-player games that fit the platform, tiered by how far they stretch the current architecture (shared visible board-as-array, alternating turns, a `getWinner` function per game, score tracking, win-line highlight).

**Tier 1 — drop-in: same model as Tic Tac Toe / Connect Four.** New board size + click handler + win function; pure registry entries once the game-registry refactor lands.

- **Gomoku (5 in a row)** — 15×15 board, same X/O cells, same win-line highlight. Plays like tic-tac-toe but actually deep; threats build up over the game. Probably the cheapest addition with the biggest payoff.
- **Ultimate Tic-Tac-Toe** — nine 3×3 boards in a 3×3 grid; your move dictates which board the opponent must play in next. Far more exciting than regular TTT and thematically perfect next to it. State is still just an array (81 cells + 9 macro cells).
- **Pentago** — 6×6 board in four 3×3 quadrants; place a marble, then rotate a quadrant 90°. Wins appear out of nowhere — the most exciting per line of code in this tier. The two-action turn still commits as a single board write.
- **SOS** — ✅ shipped. 7×7 grid; each turn place *either* an S or an O anywhere; completing "S-O-S" in a line scores a point and grants another move. Every placement risks setting up the opponent. Scoring maps directly onto the existing `scores` node.
- **Order and Chaos** — 6×6; *both* players place X's or O's. "Order" wins by making 5-in-a-row of either symbol; "Chaos" by preventing it. Asymmetric roles make swap-sides rematches naturally compelling.
- **Notakto (misère tic-tac-toe)** — both players place X's on three 3×3 boards; completing three-in-a-row *loses* that board. Sounds trivial, plays mind-bending. Reuses the existing TTT board component almost verbatim.
- **Hex** — 11×11 rhombus of hexagons; connect your two opposite edges. One-sentence rules, no draws possible, tense endgames. Win detection is a flood-fill instead of line-scanning; the hexagonal CSS is the only real work.
- **Reversi / Othello** — 8×8 array, pieces flip; dramatic late-game swings. Win function is a disc count, but move validation (flip logic) is more code than the others in this tier.
- **Mancala** — 14-slot array of *integers* instead of strings; satisfying chain moves and captures. Simple rules, surprisingly tactical.

**Tier 2 — pieces that move instead of being placed.** Same array data model, but `handleMove` becomes select-then-move and needs a legal-move function alongside `getWinner`.

- **Breakthrough** — 8×8, two rows of pawns each, move/capture diagonally forward, first to the far side wins. Chess-like tension with checkers-like rules and zero special cases — best effort-to-fun ratio in this tier, and it paves the way for Checkers.
- **Checkers** — the obvious one; the cost is multi-jump and king logic.
- **Nine Men's Morris** — placement phase then movement phase; forming "mills" removes opponent pieces. Needs a `phase` field on the game node.
- **Quoridor** — pawns race across while players drop walls. Hugely engaging, but wall placement needs a "path still exists" BFS check — best saved until the registry refactor and unit tests exist.

**Tier 3 — simultaneous turns instead of alternating.** Each player writes a hidden choice to their own key; resolve when both exist.

- **Rock Paper Scissors (best of 5/7)** — tiny state, instantly understood; the existing score/match-over UI carries it. Also exercises the simultaneous-move pattern Battleship needs. Great "while we wait" filler game.
- **Memory / Concentration duel** — shared grid of face-down cards, flip two per turn, matches score points.

**Tier 4 — dice (one design decision required).** Push-your-luck dice games are simple and loud, but with no server there must be a fairness story for randomness. Two friend-platform-appropriate options: the player whose turn it is writes their own roll (trust-based, consistent with the current security posture), or the creator writes a random seed at game creation and both clients derive rolls deterministically.

- **Pig** — roll a d6 repeatedly; bank your points or keep rolling, but a 1 wipes the turn. First to 100. Two buttons, one die, maximum table-banging — the smallest possible game that introduces the dice mechanic.
- **Shut the Box (duel)** — same vibe, slightly more board to render.

**Tier 5 — hidden state.** Requires either the commit–reveal scheme (see [`docs/HANGMAN.md`](docs/HANGMAN.md)) or per-player read rules via anonymous auth.

- **Hangwoman** — ✅ shipped. Its commit–reveal module (`src/lib/commit.js`) is the reusable primitive for everything else in this tier.
- **Battleship** — the headline setup-phase game; needs hidden ship placement *and* guess verification, both built on the commit–reveal module Hangwoman produced — now unblocked.
- **Dots and Boxes** — ✅ shipped. No hidden state was needed in the end (it's all public edges); the extra-turn/chain mechanics landed via the registry's `applyMove` hook (design in [`README-dots-and-boxes.md`](README-dots-and-boxes.md)).

**Human Benchmark duels** — head-to-head versions of the solo skill tests on [humanbenchmark.com](https://humanbenchmark.com/). The originals are single-player; these adaptations turn them into two-player games. The first four fit the existing turn-based registry; the last two need a simultaneous-rounds mode (each player writes a result to their own key per round — the same pattern as Rock Paper Scissors in Tier 3, *not* the WebRTC architecture below).

- **Sequence duel (Simon)** — ✅ shipped. A real memory duel: on your turn the growing pad sequence flashes once then hides, you replay it from memory, then append one pad of your choice and pass the turn; first misremembered pad loses. `src/components/SimonBoard.jsx` drives the flash-then-recall phases locally and conceals pad colours except during the flash, so neither player can read the answer off the board. The sequence is an append-only array on the game node with an `applyMove` hook (`src/lib/simonLogic.js`); no RNG and no hidden state.
- **Chimp Test duel** — numbered squares flash, then hide; click them in order. Players alternate attempts, the count grows each survival, first fail loses the round. The layout per level is generated and stored on the game node (public in the DB — same trust level as the rest of the board state).
- **Number Memory duel** — memorize a number shown briefly, type it back, one digit longer each level. A twist that beats the original: the *opponent* sets your number (Hangwoman's setter model), or commit a generated number with the existing commit–reveal module (`src/lib/commit.js`) so neither side can claim foul.
- **Visual Memory duel** — a tile pattern flashes; reproduce it; levels escalate. Same alternating-attempts shape as the Chimp duel — ship one of the two, not both (the Chimp Test is the more iconic).
- **Reaction duel (best of 5)** — both players watch the same wait-for-green screen; each client measures its own reaction time locally and writes the milliseconds; lower wins the round. No latency-sensitive sync is needed — each player measures their own delta — so plain RTDB carries it, unlike the Pong-class games below.
- **Typing race** — ✅ shipped. Both players type the same passage with a ghost cursor showing the opponent's live progress. Errors stay highlighted but don't block advancement; final score is effective WPM (speed × accuracy). Supports both the device keyboard and a QWERTY on-screen keyboard (`src/components/TypingKeyboard.jsx`).
- **Mental Math Duel** — ✅ shipped. 2-minute blitz; both players race on the same deterministic question (derived from a `mathSeed` + index, never stored as a pool in Firebase); first correct answer advances the question and earns speed-bonus points. Three twists: speed scoring (1–5 pts based on response time within 8s), ⚡ power questions (every 8th question, 2× points and 2× penalty), and 🔥 streak multiplier (3 consecutive correct = ×2 on next). Wrong answers deduct points. Highest score at the buzzer wins.

Skipped from the Human Benchmark catalog: **Aim Trainer** (pure mouse skill, weak on mobile, and a duel is just two solo runs compared), **Verbal Memory** (long solo grind with no natural duel structure), **Hearing / Interval Trainer** (audio-dependent and niche — the site itself retired its hearing test).

**Avoid for now:** real-time-reflex games (Pong, air hockey, tap races) — RTDB latency makes them feel mushy; they need the WebRTC architecture described below.

**Suggested next three:** Pentago (excitement per line of code), Gomoku (cheapest big payoff), Breakthrough (first moving-pieces game). Add Pig when introducing dice, RPS as a quick filler-game win.

### New features — medium effort
- **Hot-seat mode (2 players, one device)** — a "PASS & PLAY" entry on the home screen that runs a game entirely against local state: both names entered up front, a "PASS TO \<name\>" prompt between turns, scores and match-over tracked locally. The `/demo` route already proves the pattern (the same board components and pure logic functions running with no Firebase) — this productizes it. No room code, presence, or spectators; works offline, which also makes the PWA install genuinely useful.
- **How-to-play screens** — ⤴ now tracked as request #4 in [Requested gameplay changes](#requested-gameplay-changes), expanded to cover all 13 games. A "HOW TO PLAY" button on each home-screen card and in the game header opens a rules overlay for that game; store the rules text per game as a `rules` field in the `GAME_TYPES` registry (`src/lib/games.js`) so the overlay and the `GamePicker` cards all pull from one place.
- **In-game reactions — ✅ done.** An emote bar (🔥 😂 😭 😎 👏 💀) writes a transient `games/$id/emote` node; the received glyph floats over the room with a soft cue (`Game.jsx`).
- **Tonight's Lineup / party mode — next strategic build (not yet done).** A queue of games to auto-advance through in one room with a cumulative cross-game "night score." Reuses `applySwitchGame`/`freshGameState`; needs a `lineup` + `lineupIndex` node and a cross-game scoreboard. Deferred because it changes the core switching flow and is best built with live two-player testing. (Persistent rooms, no-login stats, recent-rooms list, and shareable result cards already shipped — see below.)
- **Chat** — simple text input per room, messages stored under `games/$id/messages`.
- **Rematch request flow — ✅ done.** PLAY AGAIN / NEW MATCH / SWITCH GAME now write a `proposal` node; the opponent accepts or declines (`src/components/ProposalBanner.jsx`). The handshake is skipped when the opponent is offline or absent.
- **More games** — see the full tiered list in [Game candidates](#game-candidates); with Dots and Boxes and SOS shipped, Battleship (unblocked by Hangwoman's commit–reveal module) is the remaining headline pick, with Pentago / Gomoku / Breakthrough as the cheap wins.

### Real-time games (Pong, air hockey, etc.) — architecture notes

The current stack assumes turn-based play: state changes once per move and syncs through RTDB. Reflex games break that — state changes ~60×/second and continuous physics replaces discrete board cells. Pushing ball positions through RTDB at 30–60Hz would mean 100–300ms perceived latency, heavy bandwidth use, and a teleporting ball. If a Pong-like is ever built, this is the plan:

**Keep Firebase for the room, not the gameplay.**
- *Firebase RTDB*: lobby, invites, presence, score, game-over — everything that changes at human speed. The existing room layer stays as-is.
- *WebRTC DataChannel (peer-to-peer)*: the actual gameplay frames. Firebase doubles as the **signaling channel** — peers exchange WebRTC offer/answer/ICE candidates under `games/$id/signaling/{X|O}` (small, infrequent writes, which RTDB is great at). Once the P2P connection is up, gameplay traffic never touches Firebase. This preserves the "no backend server" property; typical P2P latency is 20–60ms.

**Host-authoritative simulation.** Don't let both clients simulate and reconcile — that's the hard version.
- The creator (X) is the **host**: their browser runs the one true physics simulation.
- The guest (O) sends only **inputs** ("paddle up") over the data channel; the host sends back state snapshots at ~20–30Hz.
- Each client renders its **own paddle locally with zero delay** (client-side prediction — your paddle must never feel laggy) and renders the opponent's paddle and ball by interpolating between the last two snapshots, ~100ms in the past. Smooth beats current.

**The Pong-specific cheat: sync events, not positions.** Between collisions the ball's path is perfectly deterministic, so don't stream its position at all. The host only sends an event when the trajectory changes:

```js
{ type: 'bounce', t: 183421, pos: [0.92, 0.31], vel: [-0.6, 0.4] }
{ type: 'score',  t: 191002, scorer: 'X' }
```

Both clients extrapolate the ball from the last event using their local clock (synced once via a ping/offset handshake). A few messages per second instead of sixty, and the ball is smooth on both ends regardless of jitter. This generalizes to most physics-lite arcade games (air hockey, Breakout-versus, tank duels).

**Code structure** — pure simulation / transport / rendering, mirroring how board games separate `gameLogic.js` from components:

```
src/lib/realtime/
  rtc.js              # WebRTC setup, RTDB signaling, reconnect; exposes send()/onMessage()
  clockSync.js        # ping-based clock offset between peers
src/lib/pongLogic.js  # PURE: createState(), step(state, inputs, dt) — no DOM, no network
src/components/PongCanvas.jsx  # requestAnimationFrame render loop, keyboard/touch input
src/pages/Game.jsx    # game registry gains a kind: 'realtime' branch → RealtimeRoom wrapper
```

Two rules worth enforcing:
1. **Fixed-timestep simulation, interpolated rendering.** `step()` always advances by a constant dt (e.g. 1/120s) in an accumulator loop; `requestAnimationFrame` renders interpolated state. Host and guest physics stay identical, and the logic is unit-testable.
2. **Transport is an interface, not a dependency.** `pongLogic.js` never imports `rtc.js`. A loopback transport lets the `/demo` route run the identical game locally (two paddles, one keyboard) — which is how most development would happen anyway.

**Deliberately descoped:**
- *TURN relay fallback* — WebRTC P2P fails for ~5–10% of peers behind symmetric NATs; a real fix needs a TURN server (which **is** a server, with bandwidth costs). For a friends-and-family platform, detect the failure and show "connection failed — try a different network."
- *Spectators* — streaming gameplay over P2P needs a connection per spectator. v1: spectators see only the live score from Firebase, not the ball.
- *Anti-cheat* — host-authoritative means the host could cheat. Between friends, irrelevant.

**Suggested build order:** clock-sync + RTC module with the loopback demo first, then event-based ball sync, paddle prediction polish last. Note: turn-based registry games (Gomoku, Ultimate Tic-Tac-Toe) are ~10× less code per unit of fun — real-time is a "because it's cool" project, not the next roadmap item.

### New features — larger investments
- **Google sign-in + persistent stats** — a first cut of no-login stats already ships locally (lifetime W/L, best streak, per-game + head-to-head, in `localStorage` via `src/lib/profile.js`). The larger investment is syncing these across devices: add anonymous auth and a `stats/{playerId}` node (the `playerId` primitive already rides in every player slot) to enable cross-device history, leaderboards, and friend lists.
- **Public matchmaking queue** — "Find a random opponent" button that pairs strangers via a Firebase queue.
