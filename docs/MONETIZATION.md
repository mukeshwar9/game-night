# Monetization: how it is built (Phase 1, web)

The plan is in the audit's `how-game-night-makes-money.md`. This page is what the code does. Three promises hold everywhere: every game that is free stays free, nothing sold changes who wins, and there are no random paid rewards.

## Launch switch

Everything that sells sits behind one switch, **off by default** (`src/lib/monetization.js`, read by `monetizationEnabled()`).

| | Off (launch) | On |
|---|---|---|
| Client | `VITE_MONETIZATION_ENABLED` unset or not `1` | `VITE_MONETIZATION_ENABLED=1` at build time |
| Server | `MONETIZATION_ENABLED` unset or not `1` in `functions/.env` | `MONETIZATION_ENABLED=1` |
| Premium themes, fonts, avatar items, buddies, emotes | open to everyone | gated by the entitlement check |
| Locks, paywall, pass and pack badges, Pass strings | not shown | shown |
| `/shop`, `/pass`, Settings and Profile shop entries | not routed, not linked | live |
| `createCheckout`, `createPortalSession`, `paddleWebhook`, `syncAdminAccess`, `createRazorpayOrder`, `verifyRazorpayPayment`, `razorpayWebhook` | refuse (`monetization-disabled`, webhooks 503) | work (Razorpay also needs its keys, below) |
| Admin emails, local dev bypass | not needed | apply |

To go live: finish the captain steps below, set both switches, then deploy functions and hosting together. A dev server or the emulators can flip the client switch for a session with `localStorage['gn-monetization'] = 'on' | 'off'`; a production build ignores that.

## What is sold

All prices live in one file, `src/lib/premiumCatalog.js` (`PRICES` in US cents, `PRICES_INR` in paise, `PACKS`, `PRODUCTS`). The shop, the paywall, both checkouts and both webhooks read it. Rupee prices are set for Indian purchasing power, not converted, and are GST-inclusive.

| Product | Price (Paddle, USD) | Price (Razorpay, INR) | Notes |
|---|---|---|---|
| Game Night Pass | $2.99 a month or $19.99 a year | ₹99 for 30 days or ₹699 for 365 days | Unlocks every premium item. In USD a subscription with a 7-day trial (set on the Paddle price); in INR a prepaid period that never renews. Host perks (room banner, playlists) are listed as "coming" and not built yet. |
| Cosmetic packs | $1.99 to $2.99 | ₹49 (avatar, emote packs) or ₹99 (theme packs) | `themes-seasonal`, `themes-arcade`, `avatars-royal`, `avatars-party`, `avatars-dragon`, `emotes-pixel` |
| Supporter | $4.99 | ₹299 | A badge; changes nothing else. |

## Two processors: Razorpay for India, Paddle for everyone else

Indian buyers pay in rupees through **Razorpay** (UPI, Indian cards, netbanking, wallets; about 2.36% all in, no setup or monthly fee). Everyone else pays in dollars through **Paddle**, the merchant of record that files foreign VAT and sales tax. The reasoning and fee comparison are in the payments research report (2026-10-01).

**Who gets which.** Firebase Hosting has no geo-IP, so the device picks a default (`src/lib/payRegionLogic.js`, tests beside it): the buyer's own choice from the **PAY IN ₹ / PAY IN $** switch in the purchase sheet (remembered on the device as `gn-pay-currency`), then the device time zone (`Asia/Kolkata`), then a browser language with the `IN` region (`en-IN`, `hi-IN`, …), else dollars. The switch is always there, so a wrong guess costs nothing; every price on the shop, paywall and Pass page follows it (`usePayCurrency`). The app has no country setting on the profile; the switch is that setting.

**Native apps.** Nothing changes: the shop, Pass and every checkout stay hidden inside the iOS/Android shell (`monetization.js`), so neither Paddle nor Razorpay ever opens there.

**The Pass in rupees is prepaid.** Razorpay sells orders, not subscriptions, so an INR Pass is one payment for 30 or 365 days (`PREPAID_PASS_DAYS`). It is stored as `pass: { status: 'canceled', plan, currentPeriodEnd, provider: 'razorpay', paymentId }`; `canceled` means "does not renew", so the Pass page shows "Ends <date>" and offers ADD MORE TIME. Buying again stacks the days on the time left. A prepaid purchase never overwrites a live Paddle subscription (`createRazorpayOrder` refuses with `has-subscription`, and `applyPlan` skips it), and `createCheckout` refuses a Paddle Pass while a prepaid one runs (`has-prepaid-pass`). Razorpay Subscriptions (UPI AutoPay) could replace this later.

**Flow** (`functions/razorpay.js`, tests in `functions/test/razorpay.test.js`):

1. `createRazorpayOrder` (callable): the same Google-account and 13+ checks as Paddle, then a Razorpay order for the product's `paise` price with `notes: { uid, product }`. The order is also stored server-side at `razorpayOrders/{orderId}` (`{ uid, product, amount, currency, at }`, no client access in `database.rules.json`). Returns the order id and the public key id.
2. The client loads `checkout.razorpay.com/v1/checkout.js` (allowed in the CSP in `firebase.json`) and opens Razorpay Checkout on the page (`payWithRazorpay` in `src/lib/entitlements.js`).
3. `verifyRazorpayPayment` (callable): checks Checkout's signature (HMAC-SHA256 of `order_id|payment_id` with the key secret), that the order belongs to the caller, and fetches the payment: only a `captured` payment with the order's exact amount in INR is granted. An `authorized` one returns `pending` and the webhook grants it once captured.
4. `razorpayWebhook` (HTTPS): verifies `X-Razorpay-Signature` (HMAC-SHA256 of the raw body with the webhook secret). `payment.captured` and `order.paid` grant; `refund.processed` for a **full** refund revokes (a partial refund changes nothing). The stored order record, never the payment's notes, says who bought what.
5. Both paths call billing.js's `applyPlan`, so a rupee purchase writes exactly what the Paddle purchase writes (`entitlements/{uid}`, `entitlementsPublic/{uid}`, `entitlementPurchases/{paymentId}` with `provider: 'razorpay'`). They claim the same key, `entitlementEvents/rzp-paid-<paymentId>` (refunds: `rzp-refund-<paymentId>`), so a payment is granted once whichever arrives first, and a retried webhook does nothing. A failure after the claim releases it so the provider's retry applies.

**Optional keys.** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are read from the environment, not bound with `defineSecret`, so a project without them still deploys every function. Without them the Razorpay callables fail with `unavailable` (HTTP 503) and message `razorpay-not-configured`, the webhook answers 503, and the purchase sheet tells the buyer to switch to $. Live keys (`rzp_live_…`) are refused the same way unless `RAZORPAY_ENV=production` is set on purpose, the counterpart of `PADDLE_ENV`.

## The entitlement record

`entitlements/{uid}` is readable by its owner and **never writable from a client** (`database.rules.json`, tests in `tests/rules/entitlements.test.js`). Only Cloud Functions write it:

```
entitlements/{uid}: {
  pass: { status, plan, currentPeriodEnd, subscriptionId, customerId },   // Paddle subscription, or
        // { status: 'canceled', plan, currentPeriodEnd, provider: 'razorpay', paymentId } for a prepaid INR Pass
  packs: { [packId]: true },
  supporter: true,
  admin: true,          // admin email allowlist, set by syncAdminAccess
  updatedAt
}
entitlementsPublic/{uid}: { pass: bool, supporter: bool }   // badge copy any signed-in user may read
entitlementPurchases/{transactionId | paymentId}             // server-only; lets a refund take a pack (or prepaid Pass days) back
entitlementEvents/{eventId | rzp-paid-… | rzp-refund-…}      // server-only; makes the webhooks idempotent
razorpayOrders/{orderId}: { uid, product, amount, currency, at }  // server-only; who an INR order belongs to
ageGate/{uid}: { year, at }                                  // neutral birth-year answer, write-once, owner-only
```

## The premium flag contract

A registry entry becomes premium with two fields: `premium: true` and `pack: '<PACKS id>'`. Its item key is `${kind}:${id}` (`kind` is `theme`, `font`, `avatar` or `emote`). Nothing else is needed:

- `isUnlocked(item, { ent, bypass })` in `src/lib/premium.js` is the one check. Free items are always open; premium ones open for the bypass, the admin flag, an active Pass, or the item's pack.
- In React: `const access = useAccess(); access.isUnlocked(item)` (`src/hooks/useAccess.js`).
- Outside React: `isUnlockedNow(item)` from `src/lib/entitlements.js`.
- A locked tap calls `openPaywall(item)` (`src/lib/premiumUi.js`); `<PremiumHost/>` in `App.jsx` renders the sheet.
- Avatars: the kit marks each part and colour ramp with a tier (`src/lib/avatarKit/`). `src/lib/avatarGate.js` turns `pass` (Pass only) and `pack` (sold as `avatars-<kit pack>`) options into gate items with id `<field>:<option>`. `earn` items are unlocked by play, never sold, and are left open. The avatar picker refuses a locked pick and opens the paywall; SHUFFLE never rolls paid items unless asked. A look already saved keeps rendering for everyone if a Pass lapses (the picker just will not let it be re-picked).
- Themes (`THEMES`) and fonts (`FONTS`) carry the two fields directly. The shop collects them in `src/lib/premiumItems.js`.
- Emotes: `EMOTES_PREMIUM` in `src/lib/emotes.js` (the PIXEL EMOTES pack).

Only the owner sees themes and fonts, and emotes are plain glyphs, so those gates are client-side. Anything other players see should be enforced by the rules before it ships (not part of this phase).

## Bypass

1. **Local development.** `bypassActive` (premium.js) is true on a Vite dev server and in emulator mode, never in a production build. Set `localStorage['gn-premium-bypass'] = 'off'` to see the locked UI while developing; the switch can only turn the bypass off.
2. **Admin emails, in production.** `ADMIN_EMAILS` (a comma-separated list in `functions/.env`, never in the client bundle) lists verified Google emails. After sign-in the client calls the `syncAdminAccess` callable. If the verified email is on the list, or `users/{uid}/admin` is already true (the existing console-set flag), the function writes `entitlements/{uid}/admin = true` and sets a `premiumAdmin` custom claim. Removing an email revokes it the next time that person signs in.
3. **View as regular player.** Admins and dev/emulator sessions get an ADMIN TOOLS section in Settings. Its VIEW AS REGULAR PLAYER switch (`localStorage['gn-view-as-player'] = 'on'`) drops the admin allowlist, the dev bypass and any purchases on the client, so the locks, paywall, shop and Pass look the way a signed-in player with no purchases sees them; a badge stays on screen until it is turned off. It only removes access (`viewAsPlayerActive`/`effectiveAccess` in premium.js), and an ineligible account ignores the stored value. On a dev server the same section has a MONETIZATION (DEV PREVIEW) switch that sets `gn-monetization` and reloads; production builds and the native shell never show it.

## Checkout and webhook (Paddle, sandbox only)

- `createCheckout` (callable): requires a Google (non-anonymous) account and an age answer of 13 or over (`ageGate`), then creates a Paddle transaction with `custom_data.uid` and returns its hosted checkout URL.
- `paddleWebhook` (HTTPS): verifies `Paddle-Signature` (HMAC-SHA256 over `ts:rawBody`, five-minute window), claims `entitlementEvents/{event_id}` in a transaction so a replay does nothing, then writes: `subscription.*` events to the pass; `transaction.completed` for one-time items to packs and Supporter; an approved full refund removes the pack. It will not recreate the record of a deleted account.
- `createPortalSession` (callable): a link to Paddle's customer portal for cancelling and receipts.
- `cleanupDeletedAccount` cancels the subscription (immediately) before clearing the account's rows.
- `PADDLE_ENV` defaults to the sandbox. Nothing here calls the live API unless `PADDLE_ENV=production` is set on purpose.

## Secret binding (`PAYMENTS_SECRETS`)

Binding a secret needs Secret Manager on the project, and a deploy that binds one fails (403) without it. So the Paddle secrets are bound only when `functions/.env` has `PAYMENTS_SECRETS=1`; the Firebase CLI reads that file while it analyses the code, so the switch decides what a deploy binds.

| | `PAYMENTS_SECRETS` unset (default) | `PAYMENTS_SECRETS=1` |
|---|---|---|
| Deploy | binds no secrets; works without Secret Manager | binds `PADDLE_API_KEY` (`createCheckout`, `createPortalSession`, `cleanupDeletedAccount`) and `PADDLE_WEBHOOK_SECRET` (`paddleWebhook`) |
| `createCheckout`, `createPortalSession` | after the launch switch and sign-in checks, refuse with `failed-precondition` `payments-not-configured` | work |
| `paddleWebhook` | 503 `payments-not-configured` (after the launch switch check) | verifies and applies events |
| `cleanupDeletedAccount` | clears the account and logs that it skipped the Paddle cancel | cancels the subscription, then clears the account |

To turn it on: enable the Secret Manager API on the project, run `firebase functions:secrets:set PADDLE_API_KEY` and `firebase functions:secrets:set PADDLE_WEBHOOK_SECRET`, add `PAYMENTS_SECRETS=1` to `functions/.env`, then `firebase deploy --only functions`.

## Captain steps before any real money

1. Create a Paddle account (start in the sandbox). Create products and prices matching `PRODUCTS`; put the 7-day trial on the two Pass prices. Set the default payment link to `https://<your-domain>/shop`.
2. Fill `functions/.env` from `functions/.env.example`: `PADDLE_PRICES` (product id to price id) and `ADMIN_EMAILS`.
3. Enable Secret Manager, `firebase functions:secrets:set PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` (sandbox values first), and set `PAYMENTS_SECRETS=1` (see Secret binding above).
4. In Paddle, add a notification destination pointing at the deployed `paddleWebhook` URL, subscribed to `subscription.*`, `transaction.completed` and `adjustment.updated`.
5. Deploy rules, functions and hosting together. Test a sandbox purchase with Paddle's test card, a cancel and a refund.
6. Before going live: review the updated Terms and Privacy Policy with someone qualified, get Paddle's approval for the domain, then switch `PADDLE_ENV=production` with live keys and prices.

## Razorpay: testing locally with test keys

1. In the Razorpay dashboard switch to **Test Mode** and generate a test key pair (Account & Settings, API Keys). Test keys start `rzp_test_`. Test mode needs no KYC.
2. Put them in `functions/.env.local` (read by the Functions emulator only) or `functions/.env.<project-id>` (a deployed test project); both are git-ignored. Add the launch switch:
   ```
   MONETIZATION_ENABLED=1
   RAZORPAY_KEY_ID=rzp_test_…
   RAZORPAY_KEY_SECRET=…
   RAZORPAY_WEBHOOK_SECRET=any-string-you-also-enter-in-the-dashboard
   ```
3. Run the app with monetization on (`VITE_MONETIZATION_ENABLED=1`, or `localStorage['gn-monetization'] = 'on'` on a dev server) against a project whose functions have these values, open `/pass` or `/shop`, choose **PAY IN ₹** and pay with Razorpay's test UPI ID `success@razorpay` (or `failure@razorpay`) or a test card from Razorpay's docs. The item unlocks when `verifyRazorpayPayment` returns.
4. To test the webhook against a deployed test project, add a webhook in the dashboard's Test Mode (below). Unit tests cover signatures, order creation, event planning, idempotency and grant/revoke without any keys: `npm --prefix functions test`.

## Captain steps for Razorpay (India)

1. **Account and KYC.** Sign up at razorpay.com as an individual or sole proprietor (PAN, bank account, address proof; no GST number is needed below ₹20 lakh a year in turnover). Activation includes a website review: the site must show the Terms (with the refund and cancellation policy), the Privacy Policy, contact details and prices. Before applying, add your **legal name and a contact address** to the Support page and Terms: Razorpay asks for them and this code does not invent them. Have the new refund wording in `public/terms.html` reviewed; it promises a full refund within 7 days for double charges, mistaken charges or an item that did not unlock.
2. **Test first.** Generate Test Mode keys and follow "testing locally" above.
3. **Keys on the server.** Put `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in `functions/.env.<project-id>` (git-ignored) and deploy functions. These become plain environment variables on the function; once Razorpay is permanent, consider moving the two secrets to Secret Manager by binding them with `defineSecret` in `razorpay.js` (that makes them required for deploy).
4. **Webhook.** In the dashboard (Account & Settings, Webhooks) add `https://<region>-<project-id>.cloudfunctions.net/razorpayWebhook` (the URL `firebase deploy` prints for `razorpayWebhook`), the same secret as `RAZORPAY_WEBHOOK_SECRET`, and the events **payment.captured**, **order.paid** and **refund.processed**. Keep payment **auto-capture** on (the default) so payments are captured right away.
5. **International cards.** Leave them off on the Razorpay account: buyers outside India should pay through Paddle, which handles foreign VAT. The ₹ / $ switch still lets anyone choose rupees, so a foreign card in INR would simply be declined.
6. **Go live.** After activation, generate live keys, set `RAZORPAY_ENV=production` with them, add the webhook again in Live Mode, and deploy rules, functions and hosting together (the CSP in `firebase.json` now allows Razorpay Checkout). Refunds are issued from the Razorpay dashboard; a full refund revokes the item automatically through the webhook.
7. **GST.** Below ₹20 lakh a year in aggregate turnover no GST registration is needed. Past it, register, start charging 18% on Indian sales (the INR prices are already GST-inclusive, so the margin drops rather than the price), and file a LUT so the Paddle payouts count as zero-rated exports.
