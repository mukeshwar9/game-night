import { describe, expect, it } from 'vitest'
import { createLensRegistry } from './glassLens'

function setup(maxFilters) {
  const log = { created: [], removed: [], maps: [] }
  const registry = createLensRegistry({
    maxFilters,
    mapToDataUrl: (geo, rgba) => { log.maps.push(rgba.length); return `data:map/${geo.key}` },
    createFilter: f => log.created.push(f),
    removeFilter: id => log.removed.push(id),
  })
  return { registry, log }
}

describe('lens registry', () => {
  it('builds one filter per shape and shares it between equal elements', () => {
    const { registry, log } = setup()
    const a = registry.acquire(120, 44, 22)
    const b = registry.acquire(120, 44, 22)
    expect(log.created).toHaveLength(1)
    expect(b).toEqual(a)
    expect(a.url).toBe('url(#glass-lens-120x44r22)')
    expect(log.created[0]).toMatchObject({ id: 'glass-lens-120x44r22', dataUrl: 'data:map/120x44r22' })
  })

  it('treats a different size or radius as a new shape', () => {
    const { registry, log } = setup()
    registry.acquire(120, 44, 22)
    registry.acquire(121, 44, 22)
    registry.acquire(120, 44, 12)
    expect(log.created).toHaveLength(3)
    expect(registry.size).toBe(3)
  })

  it('snaps fractional sizes so sub-pixel layout does not rebuild the map', () => {
    const { registry, log } = setup()
    registry.acquire(120.2, 43.9, 22)
    registry.acquire(119.8, 44.1, 22)
    expect(log.created).toHaveLength(1)
  })

  it('builds the map from the real pixel loop', () => {
    const { registry, log } = setup()
    registry.acquire(30, 20, 8)
    expect(log.maps).toEqual([30 * 20 * 4])
  })

  it('keeps a released filter cached and reuses it without rebuilding', () => {
    const { registry, log } = setup()
    const a = registry.acquire(80, 40, 12)
    registry.release(a.key)
    registry.acquire(80, 40, 12)
    expect(log.created).toHaveLength(1)
    expect(registry.has(a.key)).toBe(true)
  })

  it('evicts the stalest unused filters over the cap and never one in use', () => {
    const { registry, log } = setup(2)
    const keep = registry.acquire(50, 50, 4)
    const stale = registry.acquire(60, 60, 4)
    registry.release(stale.key)
    registry.acquire(70, 70, 4)
    expect(log.removed).toEqual([`glass-lens-${stale.key}`])
    expect(registry.has(keep.key)).toBe(true)
    expect(registry.has(stale.key)).toBe(false)
    expect(registry.size).toBe(2)
  })

  it('lets the cache overshoot rather than drop a filter an element still uses', () => {
    const { registry, log } = setup(1)
    registry.acquire(50, 50, 4)
    registry.acquire(60, 60, 4)
    expect(log.removed).toEqual([])
    expect(registry.size).toBe(2)
  })

  it('ignores a release for a shape it never built', () => {
    const { registry } = setup()
    expect(() => registry.release('nope')).not.toThrow()
  })
})
