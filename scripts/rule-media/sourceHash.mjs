import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

// Follow the demo's own render/logic imports, stopping at routing registries.
// Include the board selected by the registry for generic board demos.
export function sourceFiles(source, type) {
  const files = new Set(['src/index.css', 'src/lib/rules.js'])
  function visit(file) {
    if (files.has(file) || /(?:ruleMedia\.json|RuleMedia\.jsx|RulesModal\.jsx)$/.test(file)) return
    files.add(file)
    if (file === 'src/lib/games.js') return
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:from\s*|import\s*\()['"](\.[^'"]+)['"]/g)) {
      const stem = path.normalize(path.join(path.dirname(file), match[1]))
      for (const extension of ['', '.jsx', '.js']) {
        try { if (statSync(stem + extension).isFile()) { visit(stem + extension); break } } catch { /* optional import */ }
      }
    }
  }
  visit(`src/pages/${source}.jsx`)
  if (source === 'demos/BotBoardDemo') {
    const registry = readFileSync('src/lib/games.js', 'utf8')
    const starts = [...registry.matchAll(/^ {4}type: '([^']+)'/gm)]
    const at = starts.findIndex(m => m[1] === type)
    const entry = registry.slice(starts[at].index, starts[at + 1]?.index ?? registry.length)
    const board = entry.match(/BoardComponent:\s*(\w+)/)?.[1]
    const declaration = registry.split('\n').find(line => line.includes(`const ${board} =`))
    const module = declaration?.match(/import\('([^']+)'\)/)?.[1]
    if (module) visit(path.normalize(path.join('src/lib', module)) + '.jsx')
    // Registry move hooks call pure game logic; the bot imports the same logic.
    visit('src/lib/demoBots.js')
  }
  return [...files].sort()
}

export function sourceHash(files) {
  return createHash('sha256').update(files.map(f => readFileSync(f, 'utf8')).join('\0')).digest('hex').slice(0, 12)
}

export function mediaHash(directory) {
  const hash = createHash('sha256')
  for (const look of ['light', 'dark']) {
    for (let n = 1; n <= 3; n++) hash.update(readFileSync(`${directory}/${look}/step${n}.png`))
  }
  return hash.digest('hex').slice(0, 12)
}
