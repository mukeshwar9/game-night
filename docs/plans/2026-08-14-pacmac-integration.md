# Plan: Land PAC-MAC + pending UX batch (branch `main`, ~39 files dirty)

> You invoked `/plan` with no explicit scope. This plan assumes you want a decision-complete path to ship the work currently dirty on `main` — the new real-time game PAC-MAC plus the emote / chain-reaction / dots-and-boxes / shell refinements. If your intent was different, treat Open Questions as the correction hook.

## Goal
Ship the uncommitted batch on `main` without regressing the game-agnostic room layer, mobile-first guarantees, or the pure-logic test contract. PAC-MAC should be playable solo (`/demo` + `/solo/pacmac`) and as a P2P real-time room (`pong`-style), with invites, presence, scoring, and `recordMatch` working via the existing `games/{gameId}` machinery.

## Success Criteria
- `npm test` passes (Vitest) — `src/lib/pacmacLogic.test.js`, `src/lib/emotes.test.js`, plus existing suites — and `npm run lint` is clean.
- PAC-MAC appears in `GAME_TYPES` (`src/lib/games.js`) with `custom: true, realtime: true`, is discoverable via `GamePicker`/search/favorites, and `freshGameState('pacmac')` clears sibling keys via `FIELD_NULLS`.
- Solo PAC-MAC runs locally without Firebase or WebRTC (human vs AI).
- Two-player PAC-MAC reuses `src/lib/realtime/rtc.js` signaling (`games/$id/signaling`) with X=host / O=guest, host-authoritative `step()` loop, ~30 Hz snapshots, and Firebase `pongScoreX/O`-style per-point writes (new keys `pacmacScoreX/O` if needed). Failure surfaces as CONNECTION FAILED + RETRY (no TURN dependency).
- Emote system (`src/lib/emotes.js`, `src/components/EmoteBar.jsx`) is wired in-room without spamming RTDB.
- No hard-coded hex in `src/`; theming via `--c-*` vars (`src/index.css`).

## Context And Current Facts
- **Repo:** React + Vite PWA, Firebase RTDB only, no backend (`CLAUDE.md`, `src/lib/firebase.js`). Game registry is the single source (`src/lib/games.js`, `getGameConfig`, `freshGameState`).
- **Branch state:** `main`, 39 files `M` + 11 `??`. Last commit `0ecf2c2 feat(game): add shh emoji reaction…`. Hosting cache file also dirty — `git status` shows `.firebase/hosting…` modified (should be reverted, not committed).
- **Untracked new game:** `src/lib/pacmacLogic.js` (582 lines, 19×17 maze, `MAZE_ROWS` validated, `createState`/`step`/`computeAI`/`getWinner`/`packPellets` etc.), `src/lib/pacmacLogic.test.js`, `src/components/PacmacArena.jsx` (170 lines, DOM/CSS arena, no canvas), `src/hooks/usePacmacControls.js` — none yet referenced from `src/lib/games.js` (grep for `pacmac` in `games.js` is empty). Indicates integration is the pending step.
- **Other untracked:** `src/lib/emotes.js` + `src/lib/emotes.test.js` + `src/components/EmoteBar.jsx` (reaction picker), `src/components/FirstMoverModal.jsx`, `src/lib/sha256.js` / `src/lib/rules.test.js` etc. — part of the same batch.
- **Modified registry/games:** `src/lib/games.js` (+144/-), `src/lib/chainReactionLogic.js` (93 lines), `src/lib/dotsAndBoxesLogic.js` (120), `src/lib/demoBots.js` (79) — suggests balancing / variant work alongside PAC-MAC.
- **Shell changes:** `src/App.jsx` (60), `src/components/NavBar.jsx` (109), `src/components/BottomTabBar.jsx`, `src/pages/Game.jsx` (288), `src/pages/Home.jsx` (43), `src/index.css` (30) — previous audits (`UX-IMPROVEMENTS.md`, `MOBILE-UX-AUDIT.md` — 92 findings, 60 Low effort) drove these; they need regression checks.
- **Real-time precedent:** Pong (`src/lib/pongLogic.js`, `src/lib/realtime/rtc.js`, `src/components/PongCourt.jsx`, `src/pages/PongGame.jsx`) is the template for PAC-MAC. Pong notes: `currentTurn` omitted, signaling at `games/$id/signaling/{X|O}`, STUN-only (no TURN), `requestAnimationFrame` host loop, guest dead-reckons.
- **No `.agents/plans/` convention:** project has no durable plan dir; `docs/plans/` exists via docs, so this file is saved there per skill fallback order.

## Constraints And Non-goals
- **Constraints:** Must keep "no backend server" — no new server, no TURN infrastructure. Must not add per-game branches to `Game.jsx`; use registry hooks (`GAME_TYPES` entry + optional `applyMove`/`boardProps`) or custom-page ladder as Pong does. Must respect `FIELD_NULLS` null-deletion semantics and `vitest run` + `eslint` gates (`package.json`).
- **Non-goals:** New Firebase rules deployment (unless PAC-MAC needs new keys — then out of scope for code PR, tracked separately). Global leaderboard (planned follow-up per `CLAUDE.md`). TURN server for NAT traversal. Canvas rendering.
- **Do not commit:** `.firebase/hosting.ZGlzdA.cache`, `.commandcode/`, `.tmp-friend-test.mjs` — revert or gitignore.

## Key Decisions
| Decision | Recommended | Why | Alternative rejected |
|---|---|---|---|
| Registry entry | Add `pacmac` to `GAME_TYPES` in `src/lib/games.js` as `custom: true, realtime: true, category: 'reflex'` (like `pong`/`snake`/`tron`/`sumo`/`spaceduel`/`paint`) | Reuses lobby/invite/presence/score/win-effect pipeline; `Game.jsx` remounts via `key={game.gameType}` with no per-game branches | Ad-hoc routing outside registry — would fork invite/score logic and diverge from Pong precedent |
| Transport | Reuse `src/lib/realtime/rtc.js` (offer/answer/ice under `games/$id/signaling`) — X host, O guest, STUN-only | Proven for Pong; keeps Firebase as signaling only, gameplay on DataChannel | New signaling path or Firebase-polled positions — would add latency and DB load |
| Sync model | Host-authoritative `requestAnimationFrame` loop calling `pacmacLogic.step()`, host streams snapshots, guest does local prediction + dead-reckon | Matches `pongLogic` contract; keeps pure sim (`src/lib/pacmacLogic.js`) DOM-free and testable | Lockstep or Firebase-state sync — too slow for 5.5 tiles/sec |
| Solo mode | `Demo.jsx` + `/solo/:type` via `computeAI()` (already exported from `pacmacLogic.js`; `AI_DIFFICULTIES` map present) | Parity with `PongDemo` (reaction-handicapped AI) — enables physics iteration without networking | Separate solo page — duplication |
| Emotes | `EmoteBar` as ephemeral UI (DataChannel when connected, otherwise local echo); do not persist to `games/{id}` | Avoids RTDB write spam; consistent with Pong's signaling hygiene | Persisting every reaction to RTDB — cost + fan-out |
| Scoring keys | `pacmacScoreX`/`pacmacScoreO` (per-point, Firebase, human-speed) + transactional `winner`/`scores` at `MATCH_TARGET` | Lets spectators see score via RTDB while gameplay stays P2P; reuses Pong's `runTransaction` win path | Score only in DataChannel — spectators blind |
| Styling | Arena via DOM/CSS + `--c-*` vars, like `PongCourt.jsx` | Theming contract (`src/index.css`, Tailwind semantic tokens) — no canvas | Canvas arena — breaks theme vars, harder to test |

## Recommended Approach
1. **Ground the registry** — single `GAME_TYPES` entry for `pacmac` that points at `PacmacArena` + `pacmacLogic` helpers. Extend `FIELD_NULLS` / `FRESH_DEFAULTS` for `pacmacScoreX/O` and `signaling` so `freshGameState()` cleanly switches games.
2. **Wire custom page ladder** — add `PacmacGame.jsx` (mirroring `PongGame.jsx` structure) and dispatch it from `Game.jsx`'s `custom` ladder; keep `Demo.jsx` solo path via `usePacmacControls`.
3. **Reuse RTC primitive** — no new transport; import `src/lib/realtime/rtc.js`. Handle STUN-only failure as Pong does (CONNECTION FAILED + RETRY).
4. **Keep pure logic pure** — all physics in `src/lib/pacmacLogic.js` (already 582 lines, tested). No React/Firebase imports there; add `freshGameState` defaults only in `games.js`.
5. **Batch hygiene** — split the 39-file dirty set into reviewable commits (see Work Plan); revert hosting cache.

## Work Plan
**Dependency order:** 1 → 2 → 3 → 4 → 5 (each is a committable unit; publish split, not collapsed).

### 1) Hygiene + registry grounding
- **Files:** `src/lib/games.js` (add `pacmac` entry, import `PacmacArena`/`pacmacLogic` + icon in `src/components/GameIcons.jsx`, update `FRESH_DEFAULTS`/`FIELD_NULLS`), revert `.firebase/hosting.ZGlzdA.cache`, clean `.tmp-friend-test.mjs` / `.commandcode/` from commit set.
- **Touches:** `package.json` unchanged; no rule deploy.
- **Validation:** `npm run lint`, `npm test src/lib/games.test.js`.

### 2) Pure sim hardening (already largely done, verify)
- **Files:** `src/lib/pacmacLogic.js`, `src/lib/pacmacLogic.test.js`, `src/lib/sha256.js` (if used for commitments — keep isolated).
- **Scope:** Confirm `MAZE_W/H`, `CELL_COUNT`, `SPEED`/`GHOST_SPEED` constants, `createState` pellet packing, `step(state, inputs, dt)` fixed-timestep contract, `getWinner()` at `MATCH_TARGET=3` / `MATCH_SECONDS=90`.
- **Validation:** `npm test src/lib/pacmacLogic.test.js` (maze, walls, wrapping, pellets, `advanceActor` wall collision — tests already stubbed).

### 3) Solo + controls
- **Files:** `src/components/PacmacArena.jsx`, `src/hooks/usePacmacControls.js`, `src/pages/Demo.jsx` (add `pacmac` demo route), optional `src/pages/PacmacGame.jsx` solo branch.
- **Scope:** Keyboard (↑↓←→/WASD) + pointer drag via `usePacmacControls`; arena renders walls/pellets/players/ghosts with theme vars; local AI via `computeAI(state, difficulty)`.
- **Validation:** Manual: `npm run dev` → `/demo` and `/solo/pacmac` playable with keyboard + touch drag; no Firebase required.

### 4) Real-time multiplayer (P2P)
- **Files:** `src/pages/PacmacGame.jsx` (new, host-authoritative RAF loop, DataChannel snapshot 30 Hz, Firebase per-point score writes), `src/lib/realtime/rtc.js` (reuse), `src/pages/Game.jsx` (dispatch, no per-game turn logic), `src/components/ProposalBanner.jsx` / `src/components/WaitingRoom.jsx` (if rematch/switch needed).
- **Key behaviors:** X creates offer, O answers; host removes `signaling` on close; guest predicts own muncher, dead-reckons ball/ghosts; `currentTurn` stays absent/null; `pongScoreX/O` analogue keys.
- **Validation:** Manual two-device test (private window ≠ second player — need second browser/device per `CLAUDE.md` auth note); verify RETRY path on ICE failure.

### 5) Emotes + shell polish + docs
- **Files:** `src/lib/emotes.js`, `src/components/EmoteBar.jsx`, `src/lib/sounds.js` (breathy hiss for 🤫 already in last commit), `src/App.jsx`/`src/components/NavBar.jsx`/`BottomTabBar` polish, `CLAUDE.md` + `README.md` updates (add pacmac to game list, data model).
- **Validation:** `npm test src/lib/emotes.test.js src/lib/sounds.test.js` (sound coverage), lint, visual check of tab bar not covering arena controls (`showTabBar` gating in `App.jsx`).

## Validation Plan
| Unit | Command / Check | Expected Evidence |
|---|---|---|
| Pure logic | `npm test` (Vitest) | All suites pass — `pacmacLogic`, `emotes`, `chainReaction`, `dotsAndBoxes`, `games`, existing |
| Lint | `npm run lint` | 0 errors (scoped `globals` for tests already configured) |
| Build | `npm run build` | Vite build succeeds, `dist/` outputs |
| Registry | `npm test src/lib/games.test.js` + manual `freshGameState('pacmac')` probe | No stray keys, `board` absent/null as intended, switching clears via `FIELD_NULLS` |
| Solo | `npm run dev` → `/demo`, `/solo/pacmac` | Playable, AI moves, scoring, timer at 90s, no console errors |
| P2P | Two real devices on different networks | Host/guest sync, score mirrored in Firebase (`games/{id}/pacmacScoreX/O`), rematch works, disconnect → RETRY |
| Emotes | In-room picker | Glyphs render, no RTDB spam (check Firebase console), sound plays per `src/lib/sounds.js` registry |
| Mobile | Phone (375×667) + 360×800 | Arena full-width, controls thumb-reachable, no overlay under BottomTabBar, `touch-none` on arena |

Highest-risk validation: **P2P on real NATs** (STUN-only, no TURN — ~5–10% fail as with Pong). Must test on two networks, not two tabs.

## Risks / Rollback
- **NAT failure (STUN-only):** same as Pong — surface clearly, no silent hang. Mitigation: reuse Pong's CONNECTION FAILED copy; no TURN until product decision.
- **Dirty-batch regression:** 39 files risks silent breakage. Mitigation: publish as 5 split commits (plan structure is binding at publish — do not collapse); each commit independently passes `npm test` + `lint`.
- **Firebase key leakage:** new `pacmacScoreX/O` keys must be in `FIELD_NULLS` or switching games leaves stale score. Verify in unit test.
- **Hosting cache commit:** revert `.firebase/hosting.ZGlzdA.cache` — committing it pollutes diff and breaks cache invalidation.
- **Rollback:** revert commits in reverse order; `freshGameState` null-deletion is idempotent, no data migration needed. RTDB nodes for in-flight games can be deleted manually.

## Open Questions
- **Q1 — Scope confirmation:** Is PAC-MAC the intended next ship, or did you invoke `/plan` for a different surface (e.g., mobile-audit sweep, leaderboard)? This plan assumes PAC-MAC; say if you meant another track and I'll re-scope without code changes.
- **Q2 — Scoring target:** `MATCH_TARGET=3` and `MATCH_SECONDS=90` are taken from the current `pacmacLogic.js` constants — confirm finals or adjust?
- **Q3 — Emote transport:** Should emotes ride the DataChannel (ephemeral, P2P only) or also write a transient `games/{id}/emotes` node for spectators? Current recommendation is DataChannel-only.
- **Q4 — Publish split:** OK to publish the 5-commit split as described, or do you prefer a different grouping (e.g., separate PRs for logic vs networking)?

---
*Evidence:* `CLAUDE.md` (architecture, realtime/Pong pattern, FIELD_NULLS, `freshGameState`), `src/lib/games.js:1-120,350-540`, `src/lib/pacmacLogic.js:1-120,582 lines`, `src/lib/pacmacLogic.test.js:1-60`, `src/components/PacmacArena.jsx:1-40`, `src/lib/emotes.js` + `src/components/EmoteBar.jsx`, `MOBILE-UX-AUDIT.md` (92 findings), `UX-IMPROVEMENTS.md`, `src/App.jsx:19-58`, `git status` (39 M + 11 ??), `git log --oneline -12`, `database.rules.json` (social nodes precedent).

*No file was created under `.agents/plans/` (sandbox denies `mkdir .agents`); this plan is saved durably at `docs/plans/2026-08-14-pacmac-integration.md` instead.*
