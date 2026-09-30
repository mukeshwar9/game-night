# Push worker (Cloudflare, free) — invite push without Blaze

Client writes `invites/{uid}` to RTDB as today, then POSTs here. Worker
verifies Firebase ID token, reads recipient `fcmTokens` via RTDB REST, sends
FCM HTTP v1, drops dead tokens. Stays on Spark plan.

## Setup (once)

1. `cd worker && npm install`
2. Firebase console → Project settings → Service accounts → Generate new
   private key (keep secret, never commit).
3. `npx wrangler secret put FIREBASE_SERVICE_ACCOUNT` — paste full JSON.
   `npx wrangler secret put FIREBASE_PROJECT_ID` — `game-night-91464`.
   `npx wrangler secret put FIREBASE_DATABASE_URL` — `https://…-default-rtdb.firebaseio.com`.
4. Edit `wrangler.toml` ALLOWED_ORIGIN to prod domain.
5. `npm run deploy` — copy `https://<worker>.workers.dev` into app
   `.env.local` as `VITE_PUSH_WORKER_URL`, redeploy hosting.

## Test

1. Profile → TURN ON on two devices, grant permission.
2. Send invite device A → B with app B closed.
3. System notification shows, tap opens `/g/{gameId}`.
4. `wrangler tail` shows `{ ok: true, sent: 1 }`; dead tokens cleaned on
   NOT_FOUND / INVALID_ARGUMENT.

## Costs

Workers free tier: 100k requests/day. Invites run ~1 request each — stays
free. No Blaze, no server to keep up.
