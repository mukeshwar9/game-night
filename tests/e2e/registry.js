// Reads the GAME_TYPES registry as text. games.js imports JSX components, so
// Node can't import it directly; the registry's layout is regular enough to
// scan instead: every entry starts with a 4-space-indented `type: '…'` line
// and declares `solo: true` when it has a /solo/<type> bot page.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const GAMES_JS = fileURLToPath(new URL('../../src/lib/games.js', import.meta.url))

export function readGameTypes() {
  const source = fs.readFileSync(GAMES_JS, 'utf8')
  const starts = [...source.matchAll(/^ {4}type: '([a-z0-9-]+)'/gm)]
  return starts.map((match, i) => {
    const entry = source.slice(match.index, starts[i + 1]?.index ?? source.length)
    return { type: match[1], solo: /\bsolo:\s*true\b/.test(entry) }
  })
}

export function soloGameTypes() {
  return readGameTypes().filter(g => g.solo).map(g => g.type)
}
