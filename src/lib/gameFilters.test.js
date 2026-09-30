import { describe, expect, it } from 'vitest'
import { CATALOG_VIEWS, effectiveCatalogView, readCatalogView } from './gameFilters'

describe('catalog views', () => {
  it('reads every stored view back and defaults anything else to detailed', () => {
    for (const v of CATALOG_VIEWS) expect(readCatalogView(v)).toBe(v)
    expect(readCatalogView(null)).toBe('detailed')
    expect(readCatalogView('huge')).toBe('detailed')
  })

  it('shows LARGE only on phone widths, as DETAILED elsewhere', () => {
    expect(effectiveCatalogView('large', true)).toBe('large')
    expect(effectiveCatalogView('large', false)).toBe('detailed')
    for (const v of ['detailed', 'compact', 'mini']) {
      expect(effectiveCatalogView(v, true)).toBe(v)
      expect(effectiveCatalogView(v, false)).toBe(v)
    }
  })
})
