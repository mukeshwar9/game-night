// Rebuild original and expanded carousel scenes against npm run dev:emu.
// npm run rules:media -- --only=wordrace,wavelength
import { execFileSync } from 'node:child_process'
import { SCENES, ORIGINAL_TYPES } from './rule-media/scenes.mjs'
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',')
if (only?.some(type => !ORIGINAL_TYPES.includes(type) && !SCENES[type])) {
  throw new Error('Unknown or unsupported scene in --only; see docs/RULE-MEDIA.md')
}
const board = ORIGINAL_TYPES.filter(type => !only || only.includes(type))
const expanded = Object.keys(SCENES).filter(type => !only || only.includes(type))
if (board.length) execFileSync(process.execPath, ['scripts/howtoplay-capture.mjs', `--only=${board.join(',')}`], { stdio: 'inherit' })
if (expanded.length) execFileSync(process.execPath, ['scripts/rule-media/capture-axi.mjs', `--only=${expanded.join(',')}`], { stdio: 'inherit' })
