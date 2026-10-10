// Original five board scenes, adapted from the scout's capture script.
import { createRequire } from 'node:module'
import { mkdir, rm, writeFile, stat, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { mediaHash } from './rule-media/sourceHash.mjs'
import { SCENES, openDemo, highlight, LOOKS, MAX_ATTEMPTS } from './rule-media/board-scenes.mjs'
const require = createRequire(`${process.cwd()}/package.json`)
const { chromium } = require('playwright')
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)
const quantize = file => {
  const tmp = `${file}.tmp.png`
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', file,
    '-vf', 'split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none', '-frames:v', '1', tmp])
  execFileSync('mv', [tmp, file])
}
// ─── Runner ─────────────────────────────────────────────────────────────────
const sha = files => createHash('sha256').update(files.map(f => execFileSync('cat', [f]).toString()).join('\0')).digest('hex').slice(0, 12)

const manifestPath = path.resolve('src/lib/ruleMedia.json')
const manifest = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({ types: {} }))
manifest.commit = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim()

const browser = await chromium.launch({ headless: true, channel: 'chrome' })
for (const [type, scene] of Object.entries(SCENES)) {
  if (ONLY.length && !ONLY.includes(type)) continue
  let entry
  for (const [look, theme] of Object.entries(LOOKS)) {
    const outDir = path.resolve('public/rule-media', type, look)
    let ok = false
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !ok; attempt++) {
      await rm(outDir, { recursive: true, force: true })
      await mkdir(outDir, { recursive: true })
      const { ctx, page } = await openDemo(browser, scene.route, theme, 20260930 + attempt * 7919)
      try {
        // the stills must be the board only; hide the game picker below it
        const crop = await scene.crop(page)
        const steps = []
        const snap = async ({ cap, target }) => {
          const file = `step${steps.length + 1}.png`
          const box = target ? await highlight(target, crop).catch(() => null) : null
          await page.screenshot({ path: path.join(outDir, file), clip: crop })
          quantize(path.join(outDir, file))
          steps.push({ cap, box, bytes: (await stat(path.join(outDir, file))).size })
        }
        ok = await scene.play(page, snap)
        if (ok && look === 'light') entry = { w: crop.width, h: crop.height, steps: steps.map(({ cap, box }) => ({ cap, box })) }
        if (ok) entry.bytes = { ...entry.bytes, [look]: steps.reduce((n, s) => n + s.bytes, 0) }
      } catch (e) {
        console.log(`${type}/${look} attempt ${attempt}: ${e.message.split('\n')[0]}`)
      }
      await ctx.close()
    }
    if (!ok) throw new Error(`${type}/${look}: no attempt produced the stills`)
  }
  manifest.types[type] = { ...entry, sourceHash: sha(scene.sources), assetHash: mediaHash(`public/rule-media/${type}`) }
  console.log(type, JSON.stringify(entry))
}
await browser.close()
manifest.types = Object.fromEntries(Object.entries(manifest.types).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log('wrote', manifestPath)
