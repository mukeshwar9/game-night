# Monetization: how it is built (Phase 1, web)

The plan is in the audit's `how-game-night-makes-money.md`. This page is what the code does. Three promises hold everywhere: every game that is free stays free, nothing sold changes who wins, and there are no random paid rewards.

## What is sold

All prices live in one file, `src/lib/premiumCatalog.js` (`PRICES`, `PACKS`, `PRODUCTS`). The shop, the paywall, the checkout function and the webhook all read it.

| Product | Price | Notes |
|---|---|---|
| Game Night Pass | $2.99 a month or $19.99 a year | Unlocks every premium item. 7-day trial (set on the Paddle price). Host perks (room banner, playlists) are listed as "coming" and not built yet. |
| Cosmetic packs | $1.99 to $2.99 | `themes-seasonal`, `themes-arcade`, `avatars-hats`, `avatars-buddies`, `emotes-pixel` |
| Supporter | $4.99 | A badge; changes nothing else. |

## The entitlement record

`entitlements/{uid}` is readable by its owner and **never writable from a client** (`database.rules.json`, tests in `tests/rules/entitlements.test.js`). Only Cloud Functions write it:

```
entitlements/{uid}: {
  pass: { status, plan, currentPeriodEnd, subscriptionId, customerId },
  packs: { [packId]: true },
  supporter: true,
  admin: true,          // admin email allowlist, set by syncAdminAccess
  updatedAt
}
entitlementsPublic/{uid}: { pass: bool, supporter: bool }   // badge copy any signed-in user may read
entitlementPurchases/{transactionId}                         // server-only; lets a refund take a pack back
entitlementEvents/{eventId}                                  // server-only; makes the webhook idempotent
ageGate/{uid}: { year, at }                                  // neutral birth-year answer, write-once, owner-only
```

## The premium flag contract

A registry entry becomes premium with two fields: `premium: true` and `pack: '<PACKS id>'`. Its item key is `${kind}:${id}` (`kind` is `theme`, `font`, `avatar` or `emote`). Nothing else is needed:

- `isUnlocked(item, { ent, bypass })` in `src/lib/premium.js` is the one check. Free items are always open; premium ones open for the bypass, the admin flag, an active Pass, or the item's pack.
- In React: `const access = useAccess(); access.isUnlocked(item)` (`src/hooks/useAccess.js`).
- Outside React: `isUnlockedNow(item)` from `src/lib/entitlements.js`.
- A locked tap calls `openPaywall(item)` (`src/lib/premiumUi.js`); `<PremiumHost/>` in `App.jsx` renders the sheet.
- Avatar items are listed in `PREMIUM_AVATAR_ITEMS` (`src/lib/avatars.js`) as `{ kind: 'avatar', id, label, premium: true, pack, preview }`.
- Themes (`THEMES`) and fonts (`FONTS`) carry the two fields directly. The shop collects them in `src/lib/premiumItems.js`.
- Emotes: `EMOTES_PREMIUM` in `src/lib/emotes.js` (the PIXEL EMOTES pack).

Only the owner sees themes and fonts, and emotes are plain glyphs, so those gates are client-side. Anything other players see should be enforced by the rules before it ships (not part of this phase).

## Bypass

1. **Local development.** `bypassActive` (premium.js) is true on a Vite dev server and in emulator mode, never in a production build. Set `localStorage['gn-premium-bypass'] = 'off'` to see the locked UI while developing; the switch can only turn the bypass off.
2. **Admin emails, in production.** `ADMIN_EMAILS` (a comma-separated list in `functions/.env`, never in the client bundle) lists verified Google emails. After sign-in the client calls the `syncAdminAccess` callable. If the verified email is on the list, or `users/{uid}/admin` is already true (the existing console-set flag), the function writes `entitlements/{uid}/admin = true` and sets a `premiumAdmin` custom claim. Removing an email revokes it the next time that person signs in.

## Checkout and webhook (Paddle, sandbox only)

- `createCheckout` (callable): requires a Google (non-anonymous) account and an age answer of 13 or over (`ageGate`), then creates a Paddle transaction with `custom_data.uid` and returns its hosted checkout URL.
- `paddleWebhook` (HTTPS): verifies `Paddle-Signature` (HMAC-SHA256 over `ts:rawBody`, five-minute window), claims `entitlementEvents/{event_id}` in a transaction so a replay does nothing, then writes: `subscription.*` events to the pass; `transaction.completed` for one-time items to packs and Supporter; an approved full refund removes the pack. It will not recreate the record of a deleted account.
- `createPortalSession` (callable): a link to Paddle's customer portal for cancelling and receipts.
- `cleanupDeletedAccount` cancels the subscription (immediately) before clearing the account's rows.
- `PADDLE_ENV` defaults to the sandbox. Nothing here calls the live API unless `PADDLE_ENV=production` is set on purpose.

## Captain steps before any real money

1. Create a Paddle account (start in the sandbox). Create products and prices matching `PRODUCTS`; put the 7-day trial on the two Pass prices. Set the default payment link to `https://<your-domain>/shop`.
2. Fill `functions/.env` from `functions/.env.example`: `PADDLE_PRICES` (product id to price id) and `ADMIN_EMAILS`.
3. `firebase functions:secrets:set PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` (sandbox values first).
4. In Paddle, add a notification destination pointing at the deployed `paddleWebhook` URL, subscribed to `subscription.*`, `transaction.completed` and `adjustment.updated`.
5. Deploy rules, functions and hosting together. Test a sandbox purchase with Paddle's test card, a cancel and a refund.
6. Before going live: review the updated Terms and Privacy Policy with someone qualified, get Paddle's approval for the domain, then switch `PADDLE_ENV=production` with live keys and prices.
