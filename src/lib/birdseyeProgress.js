// BIRDSEYE solo progress: stars and best score per fort, on this device
// (localStorage, like soloBest.js). Every access is wrapped because storage
// can be blocked or throw in private windows. The merge rules (only ever
// upward) live in birdseyeCore.js and are tested there.
import { normalizeProgress, recordFort } from './birdseyeCore'

const KEY = 'birdseye-solo-v1'

export function readBirdseyeProgress() {
  try { return normalizeProgress(JSON.parse(localStorage.getItem(KEY))) } catch { return {} }
}

/** Record a finished fort and return the updated progress. */
export function saveBirdseyeFort(fortId, stars, score) {
  const next = recordFort(readBirdseyeProgress(), fortId, stars, score)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
  return next
}
