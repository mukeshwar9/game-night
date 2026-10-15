# Party shell (release 1)

A persistent header of P1–P4 faces and a footer of chat, reactions and the mic/camera, around whatever game a party room is playing. It is the same element across game switches, BACK TO PARTY and the picker.

## Where it lives

| Piece | File |
|---|---|
| Rules: who gets the shell, the tile model, header views, ticker line, landscape | `src/lib/partyShellLogic.js` (+ test) |
| Header, footer, the three views | `src/components/PartyShell.jsx` |
| Footer row (ticker, two quick reactions, picker) | `src/components/EmoteBar.jsx`, `variant="footer"` |
| Mic, camera, sheets, tile faces | `src/components/voice/VoiceShell.jsx`, `TileVideo.jsx` |
| Mount point | `src/pages/Game.jsx` (`withShell`, around both render branches, outside the `key={game.gameType}` tree) |
| Camera rules shared with the server | `src/lib/voiceLogic.js` (camera section) |
| Camera on the SFU | `src/lib/voice/sfuSession.js`, `voiceController.js`, `functions/voice.js` (`camOn`, `camOff`, video pulls) |
| E2E | `tests/e2e/party-shell.spec.js` (voice UI: `voice-ui.spec.js` with `VITE_VOICE_ENABLED=1`) |

The shell is active when `game.partyRoom === true`. In those rooms the in-page `EmoteBar` dock and `VoicePanel` strip are not drawn (the shell replaces them). Plain 2P rooms and non-party N-player rooms are unchanged.

## Behaviour decisions (captain's picks)

- Header has two views, big tiles and a 64 pt face strip, flipped by the player with the toggle at any moment. Nothing switches by itself. The pick is remembered per device (`gn-party-shell-view`). A minimise folds the strip to a 30 pt row of dots.
- Exception: a phone turned sideways (`(orientation: landscape) and (max-height: 500px)`) has no height for faces, so it draws the dots row until upright. The stored pick is not changed. Tablets and upright phones use the picked view.
- Voice: open mic, **muted on join**. A resume after the app was in the background keeps the player's choice.
- Camera: off every session, started only by the player's tap after an explainer sheet; stops on leave, in the background, on a weak link and when the host turns cameras off. Friends first: your video goes to people on your friends list (`friends/{you}/{viewer}`), others see your avatar unless you tick SHOW MY VIDEO TO EVERYONE (`voice/{gameId}/{uid}/camAll`). Private (non-public) party rooms only, 13+ through the existing birth-year gate, per-viewer HIDE THEIR VIDEO and HIDE ALL VIDEO, host switch `games/{gameId}/camerasOff`.
- Weak link: two weak samples (RTT over 700 ms, send estimate under 120 kbps, or 15% loss) pause video, receiving and sending; three good ones bring receiving back. The camera restarts only when the player taps it. Voice is never dropped for video.
- Not done in release 1 (design only): the landscape left rail for arenas (needs the arena pages and the portrait manifest lock reworked), reaction combos under faces, the one-time "MORE ROOM? SWITCH TO STRIP" tip.

## Config the captain must supply

Voice and video stay off until these exist; with them missing nothing is broken, the controls just do not appear.

1. A Cloudflare Realtime SFU app: create it in the Cloudflare dashboard (Realtime > SFU), note the **App ID** and **App Secret**.
2. Functions secrets (needs Secret Manager, Blaze plan): `firebase functions:secrets:set CF_SFU_APP_ID` and `CF_SFU_APP_SECRET`. Optional TURN for networks that block UDP: `CF_TURN_KEY_ID` and `CF_TURN_TOKEN` (strongly recommended for video; mobile carriers often need it).
3. Functions environment (`functions/.env` or deploy params): `VOICE_ENABLED=1`, `VOICE_SECRETS=1`, and `VOICE_TURN=1` if TURN is set.
4. Client build environment: `VITE_VOICE_ENABLED=1` (`.env.local` or the hosting build).
5. Deploy rules, functions and hosting together (`database.rules.json` gained `voice/{gameId}/{uid}/cam`, `camAll` and `games/{gameId}/camerasOff`).

## Known limits to know about

- `camerasOff` is writable by any party member, like `locked` (the host UI is the gate). Real enforcement of the host flag is in the function (no `camOn`, no video pulls) and the `cam` rule, but a non-host member could flip the flag back by hand. Tighten with a host-only rule if that matters.
- Fixed elements inside games (for example the proposal banner docked at `bottom-3`) can sit under the 56 pt footer in party rooms. The shell pads the page bottom; individual fixed overlays were not audited.
- Per-game height audit (word games on a 375x667 phone with big tiles) was not run; use the strip, or minimise, on small phones.

## Needs real devices (cannot be checked by the unit, rules or e2e tests)

- The Cloudflare SFU camera path end to end: `camOn` offer/answer, retiring a stopped camera section and turning the camera on a second time in the same session, pulling audio and video in one batch, a pull while the publisher turns the camera off.
- Four phones, two networks: voice and video together, echo, heat, battery and data use (about 0.2–0.5 GB per player-hour at 240p/15 fps by the design estimate).
- Camera permission prompts and the blocked-camera note on iOS Safari/PWA and Android Chrome; the camera ending when the app is backgrounded; weak-signal fallback on a throttled link.
- Reactions floating from tile faces with the shell header sticky on iOS (safe-area insets).
