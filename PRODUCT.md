# Product

<!-- impeccable:product-schema 1 -->

> Written during the memory-games build (2026-10-02) from the repository and the
> captain's brief, without an interview round (this lane works through a
> supervisor, not directly with the product owner). Every line is inferred from
> code, docs or the brief; correct anything that is wrong.

## Platform

web (a React + Vite PWA, also wrapped in a native iPhone shell that keeps the web design language)

## Users

Friends and families who want a short game together without accounts or installs: one person shares a link, the other taps it and is playing within seconds, usually on a phone and often while on a call. Solo players who open the app for a quick run or the daily puzzle between other things.

## Product Purpose

Game Night is a catalogue of short two-player and party games (board, reflex, memory, word, dice, party) that run in a shareable room, plus solo practice against bots, solo "beat your best" runs and daily challenges. Success is a friend joining from a link and both wanting a rematch.

## Positioning

No account, no install, one link: every game in the catalogue shares the same room, presence, rematch and switch-game layer, so a night can move from one game to the next without anyone leaving.

## Operating Context

- Played mostly on phones in portrait (390 px wide is the reference), sometimes on desktop.
- Rooms live in Firebase Realtime Database; the security rules are the trust boundary. Real-time games use WebRTC.
- Every game is a registry entry in `src/lib/games.js`; pages and boards are lazy-loaded.
- Many themes (`--c-*` tokens), all pixel/retro in character; Matcha is the default.

## Capabilities and Constraints

- Anonymous auth on boot; optional Google upgrade keeps the uid.
- Shared deadlines use the server clock. Hidden information either uses commit/reveal or is documented as honest-client.
- No hardcoded hex colours in `src/` (theme tokens, or a fixed palette block for things that must look the same on every theme, like card faces).
- Each logic module ships with a test; rules changes ship with a rules test; multi-client flows get an e2e spec.

## Brand Commitments

The name Game Night, the pixel lettering (Press Start 2P and the picker fonts), the theme system and the avatar kit. Copy is short, upper-case for controls, and plain.

## Evidence on Hand

The live catalogue (`src/lib/games.js`), the rule texts (`src/lib/rules.js`) and the review history in `docs/reviews/`. There are no testimonials, user counts or ratings in the repository; do not invent them.

## Product Principles

1. A friend can play within seconds of opening a link.
2. Every game is fair to both seats: same information, same clock, same deal.
3. One more round should always be one tap away.
4. Short sessions: a round fits in a few minutes on a phone.

## Accessibility & Inclusion

Colour is never the only cue (shapes, glyphs or labels as well), touch targets stay at least 44 px where the layout allows, controls are labelled for screen readers, and reduced motion is honoured.
