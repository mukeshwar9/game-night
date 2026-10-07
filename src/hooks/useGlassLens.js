import { useEffect, useSyncExternalStore } from 'react'
import { browserLens } from '../lib/glassLens'
import { MAX_LENS_SIDE } from '../lib/glassLogic'

// The liquid lens. Every element marked `data-lens` (the .glass surfaces the
// GLASS theme draws) gets its own SVG displacement-map filter, sized from the
// element's box and corner radius and cached per shape (lib/glassLens.js), and
// the filter's id goes on the element as --lens, which index.css feeds to
// backdrop-filter. The hook only works while <html data-glass-lens="on">, which
// lib/glassRuntime.js sets on a Blink engine, in a GLASS theme, with no reduced
// transparency and no low-end step-down; everywhere else this does nothing and
// the surfaces stay clear glass.
//
// `ref` scopes it to a subtree; omitted, it covers the whole document, which is
// how App uses it. Re-measures on resize and picks up elements that mount later.

const ATTR = 'data-glass-lens'

function getSnapshot() {
  return typeof document !== 'undefined' && document.documentElement.getAttribute(ATTR) === 'on'
}

function subscribe(onChange) {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] })
  return () => observer.disconnect()
}

/** Whether the lens is currently allowed (the runtime's verdict, observed live). */
export function useGlassLensOn() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export default function useGlassLens(ref) {
  const on = useGlassLensOn()

  useEffect(() => {
    if (!on) return undefined
    const root = ref?.current ?? document.body
    const lens = browserLens()
    /** @type {Map<Element, string>} */
    const attached = new Map()

    function attach(el) {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h) return
      if (w > MAX_LENS_SIDE || h > MAX_LENS_SIDE) { detach(el); return }
      const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
      const next = lens.acquire(w, h, radius)
      const prev = attached.get(el)
      if (prev === next.key) { lens.release(next.key); return }
      if (prev) lens.release(prev)
      attached.set(el, next.key)
      el.style.setProperty('--lens', next.url)
    }

    function detach(el) {
      const key = attached.get(el)
      if (!key) return
      lens.release(key)
      attached.delete(el)
      el.style.removeProperty('--lens')
    }

    const resize = new ResizeObserver(entries => { for (const e of entries) attach(e.target) })

    function watch(node) {
      if (node.nodeType !== 1) return
      if (node.matches('[data-lens]')) resize.observe(node)
      node.querySelectorAll('[data-lens]').forEach(el => resize.observe(el))
    }

    function sweep() {
      for (const [el, key] of attached) {
        if (el.isConnected) continue
        lens.release(key)
        attached.delete(el)
        resize.unobserve(el)
      }
    }

    // Batched to one pass per frame: a chat or a game re-rendering must not
    // cost a scan per mutation.
    let frame = 0
    let pending = []
    const mutations = new MutationObserver(records => {
      for (const r of records) pending.push(...r.addedNodes)
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const added = pending
        pending = []
        sweep()
        added.forEach(watch)
      })
    })

    watch(root)
    mutations.observe(root, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(frame)
      mutations.disconnect()
      resize.disconnect()
      for (const [el, key] of attached) {
        lens.release(key)
        el.style.removeProperty('--lens')
      }
      attached.clear()
    }
  }, [on, ref])
}
