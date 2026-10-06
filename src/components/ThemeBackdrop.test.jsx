import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ThemeBackdrop from './ThemeBackdrop'
import BeachBackdrop from './BeachBackdrop'

// No DOM here: the markup is rendered to a string. On the server the theme
// snapshot is null, so ThemeBackdrop itself draws nothing; BeachBackdrop is
// checked directly.
describe('ThemeBackdrop', () => {
  it('draws nothing without a backdrop theme or when inactive', () => {
    expect(renderToStaticMarkup(<ThemeBackdrop active />)).toBe('')
    expect(renderToStaticMarkup(<ThemeBackdrop active={false} />)).toBe('')
  })
})

describe('BeachBackdrop', () => {
  const html = renderToStaticMarkup(<BeachBackdrop />)
  const scene = html.slice(0, html.indexOf('class="beach-sand"'))

  it('is decorative: both layers hidden from assistive tech', () => {
    expect(html).toMatch(/^<div class="beach-backdrop" aria-hidden="true"/)
    expect(html).toContain('<div class="beach-sand" aria-hidden="true"')
  })

  it('draws the sea: deep water, a back and front wave, foam glints and wet sand', () => {
    for (const cls of ['beach-deep', 'beach-wet', 'beach-wave is-back', 'beach-wave is-front']) expect(scene).toContain(`class="${cls}"`)
    expect(scene.match(/class="beach-wave /g)).toHaveLength(2)
    expect(scene.match(/class="beach-glint"/g).length).toBeGreaterThanOrEqual(4)
    expect(html).not.toMatch(/NaN|Infinity/)
  })

  it('dresses the sand with damp patches, shells and crabs', () => {
    expect(html.match(/class="beach-patch"/g).length).toBeGreaterThanOrEqual(2)
    expect(html.match(/class="beach-item"/g).length).toBeGreaterThanOrEqual(2)
    expect(html.match(/class="beach-item beach-crab"/g).length).toBeGreaterThanOrEqual(1)
    // Some pieces lie in the wash on every screen size, under the waves.
    const wash = scene.slice(0, scene.indexOf('class="beach-wave '))
    expect(wash).toContain('beach-crab')
    expect(wash).toContain('beach-patch')
  })

  it('starts the waves on the shared wave clock', () => {
    expect(html).toMatch(/--wash-delay:-\d+\.\d{3}s/)
  })

  it('colours every layer from theme tokens, with unique gradient ids', () => {
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i)
    const ids = [...html.matchAll(/linearGradient id="([^"]+)"/g)].map(m => m[1])
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    for (const id of ids) expect(html).toContain(`url(#${id})`)
  })
})
