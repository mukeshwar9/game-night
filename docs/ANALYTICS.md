# Monitoring: Sentry (errors) and PostHog (journeys)

Two third-party tools, both optional and both off until their key is set. They sit beside the in-house reporters (`telemetry.js` -> `errors/{day}` for the /notes admin view, `analytics.js` -> `plays/`, `funnelDaily/`), which are unchanged.

| Tool | Answers | Code |
| --- | --- | --- |
| Sentry | What broke, on which build and platform, with a stack and breadcrumbs. Includes native iOS/Android crashes. | `src/lib/monitoring.js` |
| PostHog | Where players drop off: funnels, retention, session replay. | `src/lib/track.js`, `src/lib/trackLogic.js` |

## Keys

| Variable | Where it goes | What it is |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | `.env.local`, and the `VITE_SENTRY_DSN` repository secret for `deploy.yml` | Sentry project DSN. Public by design. |
| `VITE_POSTHOG_KEY` | `.env.local`, and the `VITE_POSTHOG_KEY` secret | PostHog project API key (`phc_...`). Public by design. |
| `VITE_POSTHOG_HOST` | `.env.local`, and the `VITE_POSTHOG_HOST` secret | `https://us.i.posthog.com` (default) or `https://eu.i.posthog.com`. |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | The shell (or CI secrets) that runs `npm run sourcemaps:sentry`. **Never a `VITE_` variable**: those are baked into the public bundle. | Org-scoped auth token with `project:releases` / `org:read`; the org and project slugs. `SENTRY_URL` only for a regional or self-hosted Sentry. |

Native builds read the same `VITE_*` values, because the iOS/Android app bundles the web build. `npx cap sync` has linked `@sentry/capacitor` into `ios/` (Package.swift) and `android/` (gradle); re-run it after upgrading the plugin. The native SDK starts together with the JS init, so a crash before the web view has loaded the Sentry chunk is not captured. The native projects have not been built with the plugin yet: open Xcode and Android Studio once and confirm they resolve it.

## What is collected

- **Sentry**: uncaught errors and rejections, React render crashes (the `ErrorBoundary` forwards them), native crashes. Release = the git commit of the build (`vite.config.js`), environment = `web` | `ios` | `android`. Performance traces are sampled at 10 %. `sendDefaultPii` is off and `beforeSend` (`scrubSentryEvent`) keeps only the Firebase uid as the user and strips cookies, headers and URL query strings.
- **PostHog**: only the events below. Autocapture, page views and heatmaps are off. Session replay is on with every input masked (`maskAllInputs`, so name and chat entry are never recorded) and the chat log excluded (`ph-no-capture`). Guests are identified by their anonymous Firebase uid with `is_anonymous: true`; a signed-in account keeps the same uid. Never an e-mail or a display name.

## Events

All snake_case. Properties outside this list are dropped by `buildEvent` (`trackLogic.js`), so a call site cannot add one by accident.

| Event | Properties | Fired from |
| --- | --- | --- |
| `app_opened` | `platform`, `first_open` | `main.jsx` |
| `game_selected` | `game`, `surface` (catalog, switcher, variant) | `GamePicker.jsx` |
| `game_started` | `game`, `mode` (solo, online, party, local) | `analytics.recordPlay` |
| `game_finished` | `game`, `mode`, `result` (win, loss, draw, abandoned, finished), `duration_s` | `Game.jsx`, `BotBoardDemo.jsx` |
| `room_created` | `game`, `mode`, `visibility` (private, public) | `useCreateGame`, `OnlineLobby`, `Friends`, `ArrowsRaceSetup` |
| `room_joined` | `game`, `mode`, `via` (link, public) | `useRoomSession`, `OnlineLobby`, `ArrowsRaceSetup` |
| `invite_shared` | `surface`, `method` (native_share, copy, friend) | waiting room, lobby, party lobby, friend invite |
| `sign_in_started`, `sign_in_completed` | `provider` (google, apple) | `auth.js` |
| `arrows_level_cleared` | `level`, `stars`, `kind` (campaign, endless_*) | `ArrowsSolo.jsx` |
| `theme_changed` | `theme` | `theme.js` `pickTheme` |
| `error_shown` | `surface`, `code` | `ErrorBoundary` |

Not wired yet: `error_shown` for the ~300 `toast.error` call sites, and `game_finished` for solo pages that do not report a round end through `recordRoundEnd` (Arrows, word games). Add a `track()` call where a page ends a round.

To add an event: add it to `EVENTS` in `trackLogic.js` (with a test), then call `track(name, props)` from `track.js`.

## Opting out

Tracking (PostHog and Sentry) is skipped for a visitor who has Do Not Track or Global Privacy Control on, or who switches off SHARE USAGE DATA in Settings (shown only in builds with a key). That switch stores `gn-analytics = 0` in `localStorage`; remove it to opt back in.

## Bundle and CSP

Neither SDK is in the entry chunk. Sentry loads from `initMonitoring()` and PostHog after the first render, both only when their key is set; calls made before they are ready wait in a small queue. PostHog is imported from `posthog-js/dist/module.full.no-external.js`, the build with the session recorder inside: the default one downloads the recorder from PostHog's CDN, which the Hosting CSP (`script-src 'self'`) forbids. `firebase.json` `connect-src` allows `*.ingest.sentry.io` (also `.us.` and `.de.`) and `*.i.posthog.com`; if the PostHog project is on a different host, add it.

## Source maps

`vite build` already moves the hidden maps into `sourcemaps/<build id>/`. To symbolicate Sentry stacks:

```bash
SENTRY_AUTH_TOKEN=... SENTRY_ORG=... SENTRY_PROJECT=... npm run build && npm run sourcemaps:sentry
```

The step uploads under release = the commit sha and does nothing (exit 0) unless all three variables are set. Run it for every build you ship, from the same commit that was deployed.
