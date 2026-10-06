import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ThemeBackdrop, { BeachBackdrop } from './ThemeBackdrop'

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

  it('is decorative: hidden from assistive tech', () => {
    expect(html).toMatch(/^<div class="beach-backdrop" aria-hidden="true"/)
  })

  it('draws the sea, the wet sand, and a back and front wave', () => {
    for (const cls of ['beach-sea', 'beach-wet', 'beach-wave is-back', 'beach-wave is-front']) expect(html).toContain(`class="${cls}"`)
    expect(html.match(/<svg /g)).toHaveLength(2)
    expect(html).not.toMatch(/NaN|Infinity/)
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
