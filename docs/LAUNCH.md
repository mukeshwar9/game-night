# Launch notes

What the launch-hardening pass changed, the switches it left, and what is still open. Source: the production-readiness audit of 2026-09-30.

## Switches and placeholders

| What | Where | State |
|---|---|---|
| Public leaderboard | `LEADERBOARD_ENABLED` in `src/lib/features.js` | `false`: no `/leaderboard` route, tab or "SEE WHERE YOU RANK" link. The code, the `leaderboard/` rules and the `creditMatchResults` function are kept. |
| Peer-to-peer real-time games in the public lobby | `p2p: true` on the registry entries (Pong, Snake, Tron, Sumo, Space Duel, Paint, Pac Mac, Air Hockey) | Kept out of the public lobby (`matchmaking.js`). Friends and private invite links still work. Remove the flag only when a TURN relay is in place (no TURN is configured). |
| Support address | `CONTACT_EMAIL_TBD` in `src/lib/legal.js`, `public/privacy.html`, `public/terms.html`, `public/.well-known/security.txt` | Placeholder. Replace in all four places. |

## Rules

- Every client-written timestamp is bounded to `now` (one hour of clock slack, five minutes for lobby listing dates), with an accept-unchanged branch so a parent transaction over an old room still passes.
- Lobby listings need a bounded `createdAt`/`expiresAt` and a 1-40 character `hostName`; the client also drops poisoned rows (`normalizePublicRooms`).
- `games/$gameId` accepts only known top-level keys (the `$other` regex in `database.rules.json`). A new game that writes a new room-level key must add it there, or its writes fail with `permission_denied`. `tests/rules/launch.test.js` covers the probes A1-A10 from the audit.
- `users/$uid` and `friendRequests/$uid/$from` take only known keys; error reports are keyed `{uid}-{slot}` (20 per account per day).
- Owners can delete their own `users/{uid}` and `codes/{code}` (Delete my data).
- Chat names are not enforced by the rules (a message can carry any `name`); the room is moderated on read (`moderateRoomNames`), and each chat line is labelled with its sender's recorded seat name.

## Analytics (in-house)

`attribution.js` keeps the first touch (UTM tags, click id, referrer) on the device and, once, on `users/{uid}/attribution`. `analytics.js` counts five steps by source and campaign in `funnelDaily/{day}/{source}/{campaign}/{step}`: landed, named, started, finished, shared. An account counts once per step (`funnelSeen/{uid}/{step}`, written in the same update). The admin view is the FUNNEL tab on `/notes`. Counters are client-written, so new accounts can still be scripted: turn on App Check and compare against the ad platform's click counts.

## Push

The FCM worker registers under its own scope (`/firebase-cloud-messaging-push-scope`), so it no longer replaces the Workbox worker; enabled users are re-registered on boot (`resyncPush`). `sendInvitePush` sends data-only messages linking to `/game/{id}`. The Cloudflare worker in `worker/` is no longer called by the client.

## Still open

- A Cloud Billing budget with alerts could not be verified from the CLI (the Budgets API is not enabled for the CLI's project).
- App Check is not enabled; TURN is not configured; the in-app-browser Google sign-in hint and the iOS auth domain are not changed.
- `functions/` still reports moderate `npm audit` findings (transitive `uuid`).
- The privacy policy and terms are a working draft: read them before ads run.
