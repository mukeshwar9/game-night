import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../focusRing.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

describe('global focus ring', () => {
  it('draws one outline from the theme CTA token on every :focus-visible', () => {
    expect(css).toMatch(/^:focus-visible\s*\{[^}]*outline:\s*2px solid rgb\(var\(--c-cta\)\)/m)
  })

  it('is loaded after index.css, where the theme tokens it reads are defined', () => {
    const main = readFileSync(new URL('../main.jsx', import.meta.url), 'utf8')
    expect(main.indexOf("./focusRing.css")).toBeGreaterThan(main.indexOf("./index.css"))
  })

  it('never hardcodes a colour in a focus-visible rule', () => {
    const rules = css.match(/[^{}]*:focus-visible[^{}]*\{[^}]*\}/g) || []
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) expect(r).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
