// @ts-check
// Press feedback for `.press` / `.press-card` controls (index.css). CSS :active
// alone misses two cases: a quick tap releases before the dip is visible, and
// iOS WebKit does not apply :active on touch at all without a touch listener.
// One delegated listener marks the pressed element with [data-pressed] and
// holds it for a minimum dip (pressReleaseDelay); a scroll that starts under
// the finger cancels it, since that was never a press.

import { pressReleaseDelay } from './spring'

const SELECTOR = '.press, .press-card'

/** @param {Document} [doc] */
export function installPressFeedback(doc = document) {
  /** @type {Element | null} */
  let pressed = null
  let downAt = 0
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer

  /** @param {Element | null} el */
  const clear = (el) => { el?.removeAttribute('data-pressed') }

  doc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const target = /** @type {Element | null} */ (e.target)
    const el = typeof target?.closest === 'function' ? target.closest(SELECTOR) : null
    if (!el || el.matches(':disabled')) return
    clearTimeout(timer)
    if (pressed && pressed !== el) clear(pressed)
    pressed = el
    downAt = performance.now()
    el.setAttribute('data-pressed', '')
  }, { capture: true, passive: true })

  const release = () => {
    const el = pressed
    if (!el) return
    pressed = null
    const wait = pressReleaseDelay(performance.now() - downAt)
    if (wait) timer = setTimeout(() => clear(el), wait)
    else clear(el)
  }
  for (const type of ['pointerup', 'pointercancel', 'dragstart']) {
    doc.addEventListener(type, release, { capture: true, passive: true })
  }
  doc.addEventListener('scroll', () => {
    if (!pressed) return
    clear(pressed)
    pressed = null
  }, { capture: true, passive: true })
}
