import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { inlineScripts, scriptHash, readHostingCsp } from '../../scripts/csp.mjs'

// index.html's inline boot script sets the theme and font before first paint
// and preloads the default font. Run the real script against a stub document.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const [boot] = inlineScripts(html)

function runBoot(stored = {}) {
  const appended = []
  const root = { dataset: {} }
  const document = {
    documentElement: root,
    head: { appendChild: (el) => appended.push(el) },
    createElement: () => ({}),
  }
  const localStorage = {
    getItem: (k) => (k in stored ? stored[k] : null),
    removeItem: () => {},
  }
  new Function('document', 'localStorage', boot)(document, localStorage)
  return { dataset: root.dataset, preloads: appended }
}

describe('index.html boot script', () => {
  it('preloads the default font, anonymous CORS so the font fetch reuses it', () => {
    const { dataset, preloads } = runBoot()
    expect(dataset.font).toBe('press-start')
    expect(preloads).toHaveLength(1)
    expect(preloads[0]).toMatchObject({
      rel: 'preload',
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
      href: '/fonts/press-start-2p-latin.woff2',
    })
  })

  it('skips the preload for a player on another font (it would go unused)', () => {
    const { dataset, preloads } = runBoot({ 'retro-font': 'vt323' })
    expect(dataset.font).toBe('vt323')
    expect(preloads).toHaveLength(0)
  })

  it('has no static font preload that would load regardless of the stored font', () => {
    expect(html).not.toMatch(/<link[^>]*rel="preload"/)
  })

  it('stays covered by the hosting CSP (the hash in firebase.json matches the script)', () => {
    expect(readHostingCsp().value).toContain(scriptHash(boot))
  })
})
