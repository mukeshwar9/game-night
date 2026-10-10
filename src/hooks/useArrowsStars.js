import { useSyncExternalStore } from 'react'

// Total Arrows campaign stars, `totalStars(readArrowsProgress())`, for the avatar
// gate. Refreshed when another tab saves progress (storage event) and when the
// window regains focus. The progress and level modules are loaded on demand so the
// avatar pickers (which the onboarding screen pulls in eagerly) do not drag the
// level generator into the entry bundle; until they load the count reads 0.
// A progress save in THIS tab does not fire `storage`; the focus refresh covers a
// return from the Arrows page.

let stars = 0
let started = false
const subs = new Set()

async function refresh() {
  try {
    const [{ readArrowsProgress }, { totalStars }] = await Promise.all([
      import('../lib/arrowsProgress'),
      import('../lib/arrowsLevelsLogic'),
    ])
    const next = totalStars(readArrowsProgress())
    if (next !== stars) {
      stars = next
      subs.forEach(f => f())
    }
  } catch { /* chunk failed to load: keep the last known count */ }
}

function subscribe(cb) {
  subs.add(cb)
  const on = () => { refresh() }
  window.addEventListener('storage', on)
  window.addEventListener('focus', on)
  if (!started) {
    started = true
    // Once per session, merge the account copy so a fresh device sees earned items.
    import('../lib/arrowsProgress').then(m => m.syncArrowsProgress()).catch(() => {}).finally(refresh)
  } else refresh()
  return () => {
    subs.delete(cb)
    window.removeEventListener('storage', on)
    window.removeEventListener('focus', on)
  }
}

export default function useArrowsStars() {
  return useSyncExternalStore(subscribe, () => stars, () => 0)
}
