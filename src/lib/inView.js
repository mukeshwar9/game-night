// One shared IntersectionObserver for every animated game-art tile: a catalogue
// holds dozens of tiles and each needs to know only "on screen or not". The
// callback runs on every change (and once on observe); without
// IntersectionObserver every tile counts as visible.
const callbacks = new Map()
let observer = null

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting)
    }, { rootMargin: '80px' })
  }
  return observer
}

export function observeInView(el, onChange) {
  if (!el) return () => {}
  if (typeof IntersectionObserver === 'undefined') {
    onChange(true)
    return () => {}
  }
  callbacks.set(el, onChange)
  getObserver().observe(el)
  return () => {
    callbacks.delete(el)
    observer?.unobserve(el)
  }
}
