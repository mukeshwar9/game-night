// @ts-check
// Arrows TUTORIAL track: the lessons in campaign order with a per-device done
// list. Pure: no DOM, no storage (the component reads and writes the key).

import { ARROWS_LESSONS } from './arrowsLessonsLogic.js'

export const TUTORIAL_DONE_KEY = 'arrows-tutorial-done'

/** Lesson kinds in tutorial order. */
export const tutorialKinds = () => ARROWS_LESSONS.map((l) => l.kind)

/**
 * Done kinds from a stored JSON string; anything unreadable or unknown is dropped.
 * @param {string | null | undefined} raw
 * @returns {string[]}
 */
export function parseTutorialDone(raw) {
  let list
  try { list = JSON.parse(raw ?? '[]') } catch { return [] }
  if (!Array.isArray(list)) return []
  const known = new Set(tutorialKinds())
  return tutorialKinds().filter((k) => known.has(k) && list.includes(k))
}

/** @param {string[]} done @param {string} kind @returns {string[]} */
export function markTutorialDone(done, kind) {
  if (!tutorialKinds().includes(kind) || done.includes(kind)) return done
  return tutorialKinds().filter((k) => k === kind || done.includes(k))
}

/** The lesson after `kind`, or null at the end of the track. */
export function nextTutorialKind(kind) {
  const kinds = tutorialKinds()
  const i = kinds.indexOf(kind)
  return i >= 0 && i + 1 < kinds.length ? kinds[i + 1] : null
}

/** The first lesson not yet done (null when all are). */
export function firstUndoneKind(done) {
  return tutorialKinds().find((k) => !done.includes(k)) ?? null
}
