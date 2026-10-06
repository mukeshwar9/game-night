// Every animation the code names must have a matching @keyframes rule. A CSS
// animation whose name resolves to nothing fails silently: the browser simply
// plays nothing (WordFeedback's rejection shake was dead for a week after its
// keyframe was renamed away). This scans src/ the way a reviewer would grep.
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('..', import.meta.url))

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(js|jsx|css)$/.test(name) && !/\.test\.jsx?$/.test(name)) out.push(p)
  }
  return out
}

// Words the animation shorthand accepts besides a name.
const KEYWORDS = new Set([
  'none', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end',
  'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'forwards', 'backwards',
  'both', 'running', 'paused', 'inherit', 'initial', 'unset', 'revert',
])
// Tailwind's built-in animate-* utilities bring their own keyframes.
const TAILWIND = new Set(['spin', 'ping', 'pulse', 'bounce'])

/** The keyframe name in one animation shorthand (first non-keyword identifier), or null. */
export function animationName(value) {
  for (const raw of value.split(/\s+/)) {
    const t = raw.replace(/[;,]$/, '')
    if (!t || t.includes('${') || t.includes('(') || t.includes('var') || /^[\d.]/.test(t) || /^-?\d/.test(t)) continue
    if (KEYWORDS.has(t)) continue
    if (/^[a-z][a-z0-9-]*$/i.test(t)) return t
    return null
  }
  return null
}

const files = walk(SRC)
const defined = new Set()
const used = []
for (const file of files) {
  // Comments describe animations in prose; only code names them.
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const css = file.endsWith('.css')
  for (const m of text.matchAll(/@keyframes\s+([a-z][\w-]*)/gi)) defined.add(m[1])
  const rel = relative(SRC, file)
  const push = (name, at) => { if (name) used.push({ name, where: `${rel}:${text.slice(0, at).split('\n').length}` }) }
  // CSS declarations (animation: name 0.3s) and, in JS, string style values
  // (animation: 'name 0.3s'); a JS expression after the colon is not a name.
  const decl = css ? /animation(?:-name)?\s*:\s*([^;}\n]+)/g : /animation(?:Name)?\s*:\s*['"`]([^'"`\n]+)/g
  for (const m of text.matchAll(decl)) {
    for (const part of m[1].split(',')) push(animationName(part.trim()), m.index)
  }
  // Tailwind arbitrary values: animate-[name_0.35s_steps(6)_both]
  for (const m of text.matchAll(/animate-\[([a-z][\w-]*)_/g)) push(m[1], m.index)
}

describe('animation names', () => {
  it('parses the name out of a shorthand', () => {
    expect(animationName('shake 380ms ease-out')).toBe('shake')
    expect(animationName('0.3s ease-out both modal-pop')).toBe('modal-pop')
    expect(animationName('none')).toBe(null)
    expect(animationName('${name} 1s')).toBe(null)
  })

  it('finds the definitions it checks against', () => {
    expect(defined.size).toBeGreaterThan(40)
    expect(used.length).toBeGreaterThan(40)
  })

  it('every named animation has a @keyframes rule', () => {
    const missing = used.filter(u => !defined.has(u.name) && !TAILWIND.has(u.name)).map(u => `${u.name} (${u.where})`)
    expect(missing).toEqual([])
  })
})
