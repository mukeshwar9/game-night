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

  it('is decorative: both layers hidden from assistive tech', () => {
    expect(html).toMatch(/^<div class="beach-backdrop" aria-hidden="true"/)
    expect(html).toContain('<div class="beach-surf" aria-hidden="true"')
  })

  it('has no header band: the waves are the top edge', () => {
    expect(html).not.toContain('beach-sea')
  })

  it('draws the wet sand, and a back and front wave on the surf layer', () => {
    for (const cls of ['beach-wet', 'beach-wave is-back', 'beach-wave is-front']) expect(html).toContain(`class="${cls}"`)
    const surf = html.slice(html.indexOf('class="beach-surf"'))
    expect(surf.match(/class="beach-wave /g)).toHaveLength(2)
    expect(html).not.toMatch(/NaN|Infinity/)
  })

  it('dresses the sand with damp patches, shells and crabs', () => {
    expect(html.match(/class="beach-patch"/g).length).toBeGreaterThanOrEqual(2)
    expect(html.match(/class="beach-item"/g).length).toBeGreaterThanOrEqual(2)
    expect(html.match(/class="beach-item beach-crab"/g).length).toBeGreaterThanOrEqual(1)
    // Some pieces line the water on every screen size, inside the group that
    // slides away with the header.
    const shoreline = html.slice(html.indexOf('class="beach-shoreline"'), html.indexOf('class="beach-surf"'))
    expect(shoreline).toContain('beach-crab')
    expect(shoreline).toContain('beach-patch')
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
