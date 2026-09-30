import { describe, expect, it } from 'vitest'
import { CATALOG_VIEWS, readCatalogView } from './gameFilters'

describe('catalog views', () => {
  it('reads every stored view back and defaults anything else to detailed', () => {
    for (const v of CATALOG_VIEWS) expect(readCatalogView(v)).toBe(v)
    expect(readCatalogView(null)).toBe('detailed')
    expect(readCatalogView('huge')).toBe('detailed')
  })

  it('falls back to detailed for the retired large view', () => {
    expect(readCatalogView('large')).toBe('detailed')
  })
})
