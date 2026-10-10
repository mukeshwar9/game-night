// @ts-check
// The lens filter cache: one SVG displacement-map filter per element size and
// corner radius, shared by every element of that shape (a grid of equal tiles
// builds one). The registry is DOM-free: the SVG and canvas work is injected,
// so the caching is testable without a browser. browserLens() binds it to the
// document. See glassLogic.js for the geometry and the map itself.

import { displacementMap, lensGeometry } from './glassLogic'

/**
 * @typedef {ReturnType<typeof lensGeometry>} LensGeometry
 * @typedef {{
 *   createFilter: (filter: { id: string, geo: LensGeometry, dataUrl: string }) => void,
 *   removeFilter: (id: string) => void,
 *   mapToDataUrl: (geo: LensGeometry, rgba: Uint8ClampedArray) => string,
 *   maxFilters?: number,
 * }} LensDeps
 */

/**
 * @param {LensDeps} deps
 */
export function createLensRegistry({ createFilter, removeFilter, mapToDataUrl, maxFilters = 48 }) {
  /** @type {Map<string, { id: string, url: string, refs: number }>} */
  const entries = new Map()

  function evict() {
    for (const [key, entry] of entries) {
      if (entries.size <= maxFilters) return
      if (entry.refs > 0) continue
      removeFilter(entry.id)
      entries.delete(key)
    }
  }

  return {
    /**
     * Takes a reference on the filter for this shape, building it on first use.
     * @param {number} width
     * @param {number} height
     * @param {number} radius
     * @returns {{ key: string, url: string }}
     */
    acquire(width, height, radius) {
      const geo = lensGeometry(width, height, radius)
      let entry = entries.get(geo.key)
      if (entry) {
        // Most recently used goes last, so eviction drops the stalest first.
        entries.delete(geo.key)
      } else {
        const id = `glass-lens-${geo.key}`
        createFilter({ id, geo, dataUrl: mapToDataUrl(geo, displacementMap(geo)) })
        entry = { id, url: `url(#${id})`, refs: 0 }
      }
      entry.refs++
      entries.set(geo.key, entry)
      evict()
      return { key: geo.key, url: entry.url }
    },

    /** @param {string} key */
    release(key) {
      const entry = entries.get(key)
      if (entry && entry.refs > 0) entry.refs--
    },

    get size() { return entries.size },
    /** @param {string} key */
    has(key) { return entries.has(key) },
  }
}

const NS = 'http://www.w3.org/2000/svg'
/** @type {ReturnType<typeof createLensRegistry> | null} */
let shared = null

/** The document-bound registry: filters live in one hidden <svg> in <body>. */
export function browserLens() {
  if (shared) return shared
  const host = document.createElementNS(NS, 'svg')
  host.setAttribute('width', '0')
  host.setAttribute('height', '0')
  host.setAttribute('aria-hidden', 'true')
  host.setAttribute('style', 'position:absolute;pointer-events:none')
  document.body.appendChild(host)
  const canvas = document.createElement('canvas')

  shared = createLensRegistry({
    mapToDataUrl({ w, h }, rgba) {
      canvas.width = w
      canvas.height = h
      const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'))
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
      return canvas.toDataURL()
    },
    createFilter({ id, geo, dataUrl }) {
      const f = document.createElementNS(NS, 'filter')
      f.setAttribute('id', id)
      f.setAttribute('filterUnits', 'userSpaceOnUse')
      f.setAttribute('primitiveUnits', 'userSpaceOnUse')
      f.setAttribute('x', '0')
      f.setAttribute('y', '0')
      f.setAttribute('width', String(geo.w))
      f.setAttribute('height', String(geo.h))
      f.setAttribute('color-interpolation-filters', 'sRGB')
      // The map is an image the filter samples; a light blur first keeps the
      // bent art from stair-stepping, then the map offsets each pixel.
      f.innerHTML =
        `<feImage href="${dataUrl}" x="0" y="0" width="${geo.w}" height="${geo.h}" preserveAspectRatio="none" result="map"/>` +
        '<feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="soft"/>' +
        `<feDisplacementMap in="soft" in2="map" scale="${geo.scale}" xChannelSelector="R" yChannelSelector="G"/>`
      host.appendChild(f)
    },
    removeFilter(id) {
      host.querySelector(`#${CSS.escape(id)}`)?.remove()
    },
  })
  return shared
}
