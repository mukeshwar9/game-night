# Vendored: cth9191/animate cut-paper kit

Two files from <https://github.com/cth9191/animate> (MIT, see `LICENSE`), pinned at commit
`7e5eb56feb2dd573f890e1b7b34748af43d58263` ("Animate 0.4.0: voice-overs timed to the words"):

| here | upstream path | sha-256 |
|---|---|---|
| `core.js` | `plugins/animate/skills/animate/kit/core.js` | `d791e21cdc1396d20bd7f1507a34693c64be9220a0d996cc4688149554967fc9` |
| `cut-paper-kit.js` | `plugins/animate/skills/animate/styles/cut-paper/kit.js` | `f5791c4b6481407d4eba0eab69eca35d227481816b384967f6adf86c1ccd1a1e` |

Unmodified. They are plain-script files that share one global scope (seeded RNG, the torn-paper `cut()`
shape, patterns, faces, grain), so `build.mjs` concatenates them with `head.js`, `scenes/*.js` and
`driver.js` into one page script. animate itself is not a dependency of the app or of this repo; only
these two files are used, at build time, by `npm run art:cutpaper`.
