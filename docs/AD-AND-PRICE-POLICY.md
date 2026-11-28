# Ad and price policy

This is the rulebook for any ad, price screen or permission ask in Game Night. It exists so the rules are agreed before money is switched on (see `docs/MONETIZATION.md`). Today the Shop and the Pass are off for guests and no ads exist; this page changes nothing a guest sees. Anyone adding an ad or a price screen later follows it.

It comes from a look at four one-phone mini-games apps. The worst of them showed a video ad straight after the first game with no way to close it for over a minute, opened the Play Store by itself, then showed a second ad with no close button where Back did nothing. Game Night must never behave like that.

## Ads

1. **No full-screen ad between two friends' games.** The moment after a round (result, play again, next game, switch game) belongs to the people in the room. The next game starts straight away.
2. **At most a small banner, and only on menus.** Menus are the home screen, the game lists and the shop. A banner never covers a board, a timer, a result or a button, and never appears during play.
3. **Rewarded ads only where the player taps first.** A reward is something the player asks for, such as a free hint in a solo puzzle, with a small video badge on the button. Nothing plays until the tap, and declining costs nothing.
4. **An ad never opens another app or a store page by itself.**

## Closing things

5. **One clearly labelled way to close anything**, a close button of at least 44 px with an accessible name. Not a tiny cross, not a delayed one, not two competing ones.
6. **Back always works.** The browser Back button and the Android back gesture close a sheet, a price screen or an ad and leave the player where they were. Nothing is shown that Back cannot leave.

## Permissions

7. **Ask for notifications only after the first friend**, when the player has someone to be told about (a friend request or an invite, audit item QW-12). Never on first open, never before the player has seen the app.

## Prices

8. **One price screen with three steps in rupees:** a monthly price, a yearly price marked BEST VALUE, and a forever price. All three on one screen, nothing hidden behind another tap.
9. **Say "cancel anytime" in plain words**, and say that a forever price is paid once and never charged again. No dark patterns: no pre-ticked extras, no countdown, no guilt copy on the close button.
10. **One price per product everywhere.** The same product has the same price on every screen. The competitors showed one offer at two different prices; we keep every price in `src/lib/premiumCatalog.js`.
11. **Existing promises hold:** every free game stays free, nothing sold changes who wins, and there are no random paid rewards.

## Where this is built

- The price screen is `PassPriceLadder` (`src/components/premium/PassPriceLadder.jsx`), with its rules and numbers in `src/lib/passLadder.js`. It is a preview: its prices are placeholder examples (₹99 a month, ₹299 a year, ₹499 forever), not products, and its Continue button is off. It replaces the plan buttons on the Pass page only in a dev build opened with `?ladder=1`. Before it goes live the real prices go into `premiumCatalog.js`, a forever product is added to both checkouts, and `ladderEnabled` is changed to turn it on.
- Which routes exist is unchanged: `/shop` and `/pass` are routed only while the shop shows for the viewer (`src/App.jsx`, `monetization.js`).
- There are no ads in the app and none are added by this policy.
