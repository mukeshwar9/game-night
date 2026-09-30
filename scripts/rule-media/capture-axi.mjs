// Add carousel scenes through the isolated AXI browser session. This runner
// keeps captures on real demo controls and never writes live room state.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync, renameSync } from 'node:fs'
import path from 'node:path'
import { sourceFiles, sourceHash, mediaHash } from './sourceHash.mjs'
import { SCENES, ORIGINAL_TYPES } from './scenes.mjs'
import { GAME_RULES } from '../../src/lib/rules.js'

const base = process.env.BASE_URL || 'http://127.0.0.1:5173'
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',')
const manifestPath = process.env.MANIFEST_PATH || 'src/lib/ruleMedia.json'
const manifest = JSON.parse(readFileSync('src/lib/ruleMedia.json', 'utf8'))
const env = { ...process.env, CHROME_DEVTOOLS_AXI_SESSION: process.env.CHROME_DEVTOOLS_AXI_SESSION || 'htp-rollout' }
const axi = (...args) => execFileSync('chrome-devtools-axi', args, { env, encoding: 'utf8', timeout: 60000, maxBuffer: 4e6 })
const evaluate = (fn, args) => JSON.parse(execFileSync('chrome-devtools-axi', ['run'], {
  input: `console.log(JSON.stringify(await page.eval(${JSON.stringify(`() => (${fn.toString()})(${JSON.stringify(args)})`)})));`,
  env, encoding: 'utf8', timeout: 60000, maxBuffer: 4e6,
}).trim())
const wait = ms => evaluate(async ms => { await new Promise(r => setTimeout(r, ms)); return true }, ms)

// Only ordinary DOM input events and clicks: no React state injection.
async function action(step) {
  if (step.action === 'wait') return wait(step.wait)
  const result = evaluate(async s => {
    const root = document.querySelector('[data-rule-demo]')
    const buttons = selector => [...root.querySelectorAll(selector)].filter(e => !e.disabled && e.getBoundingClientRect().width)
    const mark = e => { root.querySelectorAll('[data-rule-target]').forEach(e => e.removeAttribute('data-rule-target')); e.setAttribute('data-rule-target', ''); return e }
    const name = e => e.getAttribute('aria-label') || e.textContent.trim()
    let target
    if (s.action === 'roll') {
      for (let i = 0; i < 8; i++) {
        target = buttons('button').find(e => /^Roll the dice/i.test(name(e)))
        if (target) mark(target).click()
        await new Promise(r => setTimeout(r, 800))
        if (buttons('button').some(e => /^Bank /i.test(name(e)))) return { ok: true }
      }
    }
    if (s.action === 'remember') {
      const replay = buttons('button').find(e => /WATCH AGAIN/i.test(name(e)))
      if (replay) replay.click()
      for (let i = 0; i < 60; i++) {
        target = root.querySelector('button[aria-label*=", lit"]')
        if (target) { window.ruleRecallPad = name(target).replace(', lit', ''); mark(target); return { ok: true } }
        await new Promise(r => setTimeout(r, 20))
      }
    }
    if (s.action === 'recall') {
      target = buttons('button').find(e => name(e) === window.ruleRecallPad)
    }
    if (s.action === 'anagram' || s.action === 'hunt') {
      let word
      if (s.action === 'anagram') {
        const { getSolutions } = await import('/src/lib/anagramsLogic.js')
        const { ANAGRAM_VALID_WORDS } = await import('/src/lib/decks/anagrams.js')
        const rack = buttons('button[aria-label^="Use letter"]').map(e => e.textContent.trim())
        word = getSolutions(rack, new Set(ANAGRAM_VALID_WORDS)).find(w => w.length >= 3)
      } else {
        const { solveGrid } = await import('/src/lib/wordhuntLogic.js')
        const { loadDictionary } = await import('/src/lib/wordhuntDictionary.js')
        const grid = [...root.querySelectorAll('[data-wh-cell]')].map(e => e.textContent.trim())
        word = solveGrid(grid, await loadDictionary()).find(w => w.length >= 3)
      }
      if (!word) return { ok: false, reason: 'No valid word in this demo deal' }
      s = { ...s, action: 'keys', text: word.toUpperCase() }
    }
    if (s.action === 'text') target = buttons('button').find(e => new RegExp(s.text, 'i').test(name(e)))
    if (s.action === 'cell') {
      for (let i = 0; i < 40 && !buttons(s.selector).length; i++) await new Promise(r => setTimeout(r, 100))
      const candidates = buttons(s.selector)
      target = candidates.find(e => /empty|hidden|face.down|legal move|move here|Column|Roll|Arrow|target/i.test(name(e))) || candidates[0]
      if (/chomp/.test(s.selector)) target = candidates.filter(e => !e.dataset.testid.includes('poison')).at(-2)
    }
    if (s.action === 'select') {
      target = buttons(`${s.selector}[aria-label*="move here"],${s.selector}[aria-label*="clone here"],${s.selector}[aria-label*="build here"],${s.selector}[aria-label*="capture here"]`)[0]
      if (!target) {
        const own = buttons(s.selector).filter(e => /, X(?:\b|\d)/.test(name(e)))
        for (const e of own) {
          e.click(); await new Promise(r => setTimeout(r, 50))
          target = buttons(`${s.selector}[aria-label*="move here"],${s.selector}[aria-label*="clone here"],${s.selector}[aria-label*="build here"],${s.selector}[aria-label*="capture here"]`)[0]
          if (target) break
        }
      }
    }
    if (s.action === 'input') {
      target = root.querySelector('input:not([type="range"]):not([type="checkbox"]):not([disabled])')
      if (target) {
        mark(target)
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(target, s.text)
        target.dispatchEvent(new Event('input', { bubbles: true }))
        target.dispatchEvent(new Event('change', { bubbles: true }))
        return { ok: true }
      }
    }
    if (s.action === 'submit') {
      const form = root.querySelector('form')
      if (form) { mark(form); form.requestSubmit(); return { ok: true } }
      target = buttons('button').find(e => /submit|enter|check/i.test(name(e)))
    }
    if (s.action === 'keys') {
      mark(root)
      for (const k of /^(Enter|Arrow\w+)$/.test(s.text) ? [s.text] : [...s.text]) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))
        await new Promise(r => setTimeout(r, 70))
        window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }))
      }
      return { ok: true }
    }
    if (s.action === 'reaction') {
      for (let i = 0; i < 80; i++) {
        target = buttons('button').find(e => /TAP!/.test(name(e)))
        if (target) break
        await new Promise(r => setTimeout(r, 100))
      }
    }
    if (!target) return { ok: false, reason: `No enabled control for ${s.action}: ${s.selector || s.text || ''}` }
    mark(target)
    if (!s.preview) target.click()
    if (s.complete && s.selector.includes('st-cell')) {
      await new Promise(r => setTimeout(r, 80))
      const build = buttons(`${s.selector}[aria-label*="build here"]`)[0]
      if (build) mark(build).click()
    }
    return { ok: true }
  }, step)
  if (!result.ok) throw new Error(result.reason)
  await wait(step.wait ?? 900)
}

axi('open', `${base}/demo`)
axi('emulate', '--viewport', '390x844x1,mobile,touch')
manifest.skipped = { ...manifest.skipped }
manifest.commit = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim()
for (const [type, scene] of Object.entries(SCENES)) {
  if (only && !only.includes(type)) continue
  const entries = {}
  try {
    for (const [look, theme] of Object.entries({ light: 'matcha', dark: 'midnight' })) {
      evaluate(theme => { localStorage.setItem('retro-theme', theme); localStorage.setItem('music', 'off'); return true }, theme)
      axi('open', `${base}${scene.route || `/solo/${type}`}`)
      await wait(300)
      evaluate(() => {
        const root = document.querySelector('.scroll-mt-20') || document.querySelector('.pt-3')?.parentElement
        if (!root) throw new Error('Demo did not load')
        root.setAttribute('data-rule-demo', '')
        // The capture is instructional: remove transient toast prompts.
        document.querySelector('[data-sonner-toaster]')?.remove()
        return true
      })
      for (const step of scene.setup) await action(step)
      const dir = `.tmp-rule-media/${type}/${look}`
      mkdirSync(dir, { recursive: true })
      const steps = []
      for (let i = 0; i < 3; i++) {
        if (i) await action(scene.steps[i - 1])
        const cap = i ? scene.steps[i - 1].cap : 'objective'
        const caption = typeof cap === 'number' ? GAME_RULES[type].howToPlay[cap] : GAME_RULES[type][cap]
        if (!caption) throw new Error(`Missing caption ${cap}`)
        const crop = evaluate(selector => {
          const root = document.querySelector('[data-rule-demo]')
          let targets = selector ? [...root.querySelectorAll(selector)] : []
          // Keep game context and the active control in frame.
          if (!targets.length) targets = [...root.children].slice(1)
          const active = root.querySelector('[data-rule-target]')
          if (active && active !== root) targets.push(active)
          const boxes = targets.map(e => e.getBoundingClientRect()).filter(b => b.width && b.height)
          const x = Math.max(0, Math.floor(Math.min(...boxes.map(b => b.x)) - 4))
          const y = Math.max(0, Math.floor(Math.min(...boxes.map(b => b.y + scrollY)) - 4))
          const right = Math.min(innerWidth, Math.ceil(Math.max(...boxes.map(b => b.right)) + 4))
          const bottom = Math.ceil(Math.max(...boxes.map(b => b.bottom + scrollY)) + 4)
          const rect = active && active !== root ? active.getBoundingClientRect() : null
          return { x, y, w: right - x, h: bottom - y,
            box: rect ? { x: 100 * (rect.x - x) / (right - x), y: 100 * (rect.y + scrollY - y) / (bottom - y), w: 100 * rect.width / (right - x), h: 100 * rect.height / (bottom - y) } : { x: 1, y: 1, w: 98, h: 98 } }
        }, scene.crop)
        const raw = `${dir}/raw.png`, file = `${dir}/step${i + 1}.png`
        rmSync(raw, { force: true })
        try { axi('screenshot', path.resolve(raw), '--full-page') } catch (error) {
          // Some AXI versions save the screenshot but fail to parse the server's
          // success message. Accept only a newly written, valid PNG.
          const signature = readFileSync(raw).subarray(0, 8).toString('hex')
          if (signature !== '89504e470d0a1a0a') throw error
        }
        const scale = Math.min(1, 340 / crop.h)
        const w = Math.floor(crop.w * scale / 2) * 2, h = Math.floor(crop.h * scale / 2) * 2
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf',
          `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${w}:${h},split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none`, '-frames:v', '1', file])
        rmSync(raw)
        steps.push({ cap, box: crop.box, w, h, bytes: statSync(file).size })
      }
      entries[look] = steps
    }
    const assetHash = mediaHash(`.tmp-rule-media/${type}`)
    if (!process.env.CAPTURE_STAGED) {
      rmSync(`public/rule-media/${type}`, { recursive: true, force: true })
      renameSync(`.tmp-rule-media/${type}`, `public/rule-media/${type}`)
    }
    const sources = sourceFiles(scene.source, type)
    manifest.types[type] = { w: entries.light[0].w, h: entries.light[0].h,
      steps: entries.light.map(({ cap, box, w, h }, i) => ({ cap, box, w, h, dark: { box: entries.dark[i].box, w: entries.dark[i].w, h: entries.dark[i].h } })),
      bytes: Object.fromEntries(Object.entries(entries).map(([look, steps]) => [look, steps.reduce((n, s) => n + s.bytes, 0)])),
      sources, sourceHash: sourceHash(sources), assetHash }
    delete manifest.skipped[type]
    console.log(`captured ${type}`)
  } catch (error) {
    const detail = error.stdout || error.stderr || error.message
    if (!manifest.types[type]) manifest.skipped[type] = String(detail).trim().slice(0, 800)
    console.log(`skipped ${type}: ${String(detail).trim().slice(0, 800)}`)
    // Do not leave half-captured files or replace a previously good manifest.
    rmSync(`.tmp-rule-media/${type}`, { recursive: true, force: true })
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
}
const registry = [...readFileSync('src/lib/games.js', 'utf8').matchAll(/type: '([^']+)', label:/g)].map(m => m[1])
for (const type of registry) {
  if (!manifest.types[type] && !manifest.skipped[type]) manifest.skipped[type] = ['twotruths', 'bluff', 'sketch'].includes(type)
    ? 'The solo route is a party information card, with no playable controls.'
    : 'No playable solo demo is registered in Demo.jsx.'
}
manifest.types = Object.fromEntries(Object.entries(manifest.types).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`${Object.keys(manifest.types).length} covered, ${Object.keys(manifest.skipped).length} skipped; original scenes: ${ORIGINAL_TYPES.join(', ')}`)
