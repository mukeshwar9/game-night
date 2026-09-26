// One-off content-safety pass over the Word Hunt dictionary (G-01).
//
// Removes every word `isBannedWord` rejects (slurs and unambiguous vulgarity,
// see src/lib/wordDenylist.js) from public/wordhunt-dict.txt, keeping the file
// format: one lowercase word per line, sorted as before, trailing newline.
// The dictionary lookup (createDictionary in src/lib/wordhuntLogic.js) rejects
// banned words again as a guard, so a stale cached copy of the old file can
// never accept one either.
//
// Run: node scripts/clean-wordhunt-dict.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isBannedWord } from '../src/lib/wordDenylist.js'

const path = fileURLToPath(new URL('../public/wordhunt-dict.txt', import.meta.url))
const words = readFileSync(path, 'utf8').split('\n').filter(Boolean)
const kept = words.filter(word => !isBannedWord(word))
writeFileSync(path, kept.join('\n') + '\n')
console.log(`wordhunt-dict.txt: ${words.length} → ${kept.length} (removed ${words.length - kept.length})`)
