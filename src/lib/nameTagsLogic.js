// @ts-check
// Name Tags: faces from the avatar kit are shown with names, then shuffled without
// them; match every name to its face. Pure.
import { randomLook, encodeAvatar } from './avatarKit'

// Short, common, family-safe first names (no real players: using friends' names
// would need their consent).
export const NAME_POOL = [
  'ADA', 'ALEX', 'AMIR', 'ANNA', 'ARJUN', 'BEA', 'BEN', 'CHEN', 'DANI', 'ELLA',
  'EMIL', 'FARAH', 'GUS', 'HANA', 'IVY', 'JADE', 'JUAN', 'KAI', 'KENJI', 'LENA',
  'LEO', 'LILA', 'LUCA', 'MAYA', 'MILO', 'NIA', 'NOAH', 'OMAR', 'PIA', 'RAJ',
  'RITA', 'ROSA', 'SAM', 'SANA', 'TARA', 'TEO', 'UMA', 'VIK', 'YARA', 'ZOE',
]

export function tagCount(level) { return Math.min(8, 2 + level) }
// Study time (posture B): 2 s per face, at least 5 s.
export function tagStudyMs(level) { return Math.max(5000, tagCount(level) * 2000) }

function shuffled(arr, rand) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/**
 * @returns {{ people: Array<{ id: number, avatar: string, name: string }>, studyOrder: number[], recallOrder: number[], names: string[] }}
 * The recall grid shows the same faces in a different order; names come shuffled.
 */
export function dealNameTags(level, rand = Math.random) {
  const n = tagCount(level)
  const names = shuffled(NAME_POOL, rand).slice(0, n)
  const avatars = new Set()
  const people = names.map((name, id) => {
    let avatar = encodeAvatar(randomLook(rand))
    for (let k = 0; k < 5 && avatars.has(avatar); k++) avatar = encodeAvatar(randomLook(rand))
    avatars.add(avatar)
    return { id, avatar, name }
  })
  const ids = people.map(p => p.id)
  const studyOrder = shuffled(ids, rand)
  let recallOrder = shuffled(ids, rand)
  // Never hand back the study layout: the faces must move.
  if (n > 1 && recallOrder.every((v, i) => v === studyOrder[i])) recallOrder = [...recallOrder.slice(1), recallOrder[0]]
  return { people, studyOrder, recallOrder, names: shuffled(names, rand) }
}

/** True when `name` belongs to the person `id`. */
export function tagMatches(deal, id, name) {
  return deal.people.find(p => p.id === id)?.name === name
}
