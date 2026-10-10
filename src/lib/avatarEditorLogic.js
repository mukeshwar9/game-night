// @ts-check
// State and layout rules for the avatar editor (AvatarPicker, AvatarStudio) and the
// pet picker (PetPicker). Pure: no React, no DOM, no Firebase.
//
// The editor groups its tabs under four short headings so every heading fits on a
// phone without sideways scrolling, keeps an undo/redo history of looks, previews a
// locked item without ever committing it ("try-on"), and can shuffle one tab at a
// time. Pets are not an editor tab: they have their own picker and entry point.

import { CATEGORIES } from './avatarKit/categories.js'
import { optionsFor, optionInfo, isPremiumTier, decodeAvatar, encodeAvatar, isKitAvatar } from './avatarKit/catalog.js'
import { RAMP_LABEL } from './avatarKit/palette.js'

/** @typedef {import('./avatarKit/categories.js').Category} Category */
/** @typedef {Record<string, string>} Look */

/** Editor headings in display order; `tabs` are CATEGORIES ids. The pet is not here. */
export const EDITOR_GROUPS = /** @type {const} */ ([
  { id: 'face', label: 'FACE', tabs: ['skin', 'eyes', 'brows', 'nose', 'mouth', 'marks'] },
  { id: 'hair', label: 'HAIR', tabs: ['hair', 'beard'] },
  { id: 'style', label: 'STYLE', tabs: ['hat', 'glasses', 'extra', 'outfit'] },
  { id: 'scene', label: 'SCENE', tabs: ['bg', 'frame'] },
])

/** The pet's look field. */
export const PET_FIELD = 'pet'

/** @param {string} id @returns {Category | undefined} */
export const editorCategory = (id) => CATEGORIES.find((c) => c.id === id)

/** The heading a tab sits under ('face' when unknown). @param {string} tabId */
export function groupOfTab(tabId) {
  return (EDITOR_GROUPS.find((g) => /** @type {readonly string[]} */ (g.tabs).includes(tabId)) || EDITOR_GROUPS[0]).id
}

/** First tab of a heading. @param {string} groupId */
export function firstTabOf(groupId) {
  const g = EDITOR_GROUPS.find((x) => x.id === groupId)
  return g ? g.tabs[0] : EDITOR_GROUPS[0].tabs[0]
}

/**
 * The framing the preview should use for a tab: the full body for outfits, the
 * bust for everything worn on the head.
 * @param {string} tabId @returns {'bust' | 'hero'}
 */
export function previewViewFor(tabId) {
  return editorCategory(tabId)?.thumb === 'hero' ? 'hero' : 'bust'
}

/**
 * The look a thumbnail draws for one option: the current look wearing it. Hair
 * thumbnails take the headwear off, otherwise a cap hides every hairstyle and the
 * whole row looks identical. The pet stays out of every thumbnail: it has its own
 * picker, and in a 48px full-body tile it only crowds the outfit.
 * @param {Look} look @param {string} field @param {string} id @returns {Look}
 */
export function thumbLook(look, field, id) {
  const next = { ...look, [PET_FIELD]: 'none', [field]: id }
  if (field === 'hair' || field === 'hairColor') next.hat = 'none'
  return next
}

/** Short spoken/visible name of what a look wears on a tab, e.g. 'CROP'. @param {Look} look @param {string} tabId */
export function currentChoiceLabel(look, tabId) {
  const cat = editorCategory(tabId)
  if (!cat) return ''
  if (cat.field) return String(optionInfo(cat.field, look[cat.field]).label || look[cat.field]).toUpperCase()
  const key = cat.colours[0]?.key
  if (!key) return ''
  const id = look[key]
  return String(RAMP_LABEL[/** @type {keyof typeof RAMP_LABEL} */ (id)] || id || '').toUpperCase()
}

// ── History ────────────────────────────────────────────────────────────────

export const HISTORY_CAP = 30

/** @typedef {{ past: string[], present: string, future: string[] }} History */

/** @param {string} present @returns {History} */
export function createHistory(present) {
  return { past: [], present, future: [] }
}

/** Record a new look; clears redo. A no-op when nothing changed. @param {History} h @param {string} next */
export function pushHistory(h, next, cap = HISTORY_CAP) {
  if (next === h.present) return h
  return { past: [...h.past, h.present].slice(-cap), present: next, future: [] }
}

/** @param {History} h */
export function undoHistory(h) {
  if (!h.past.length) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

/** @param {History} h */
export function redoHistory(h) {
  if (!h.future.length) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}

export const canUndo = (/** @type {History} */ h) => h.past.length > 0
export const canRedo = (/** @type {History} */ h) => h.future.length > 0

// ── Try-on ─────────────────────────────────────────────────────────────────

/** @typedef {{ field: string, id: string }} TryOn */

/**
 * What a tap on an option does: wear it (commit), take a try-on off again
 * ('clear'), or preview a locked item without wearing it ('try-on').
 * @param {{ locked: boolean, tryOn: TryOn | null, field: string, id: string }} s
 * @returns {'commit' | 'try-on' | 'clear'}
 */
export function pickAction({ locked, tryOn, field, id }) {
  if (!locked) return 'commit'
  if (tryOn && tryOn.field === field && tryOn.id === id) return 'clear'
  return 'try-on'
}

/** The avatar string the preview shows: the draft, plus a try-on if there is one. @param {string} current @param {TryOn | null} tryOn */
export function previewAvatar(current, tryOn) {
  if (!tryOn || !isKitAvatar(current)) return current
  return encodeAvatar({ ...decodeAvatar(current), [tryOn.field]: tryOn.id })
}

// ── Shuffle one tab ────────────────────────────────────────────────────────

/**
 * Re-roll only the parts and colours of one tab, never to a locked option and,
 * where there is a choice, never to what is already worn.
 * @param {() => number} rand @param {Look} look @param {string} tabId
 * @param {(field: string, id: string) => boolean} isOpen
 * @returns {Look}
 */
export function shuffleTab(rand, look, tabId, isOpen) {
  const cat = editorCategory(tabId)
  if (!cat) return look
  const next = { ...look }
  const keys = [cat.field, ...cat.colours.map((r) => r.key)].filter(Boolean)
  for (const key of /** @type {string[]} */ (keys)) {
    const open = optionsFor(key).filter((id) => isOpen(key, id))
    const fresh = open.filter((id) => id !== look[key])
    const pool = fresh.length ? fresh : open
    if (pool.length) next[key] = pool[Math.floor(rand() * pool.length)]
  }
  return next
}

// ── Pets ───────────────────────────────────────────────────────────────────

/** @typedef {{ id: string, label: string, tier: string, pack?: string, note?: string }} PetOption */

/** Every pet in catalog order, 'none' first. @returns {PetOption[]} */
export function petOptions() {
  return optionsFor(PET_FIELD).map((id) => {
    const info = optionInfo(PET_FIELD, id)
    return { id, label: String(info.label), tier: info.tier, pack: info.pack, note: info.note }
  })
}

/** The pet an avatar string carries ('none' for critters and pet-less looks). @param {string} avatar */
export function petOf(avatar) {
  return isKitAvatar(avatar) ? decodeAvatar(avatar)[PET_FIELD] : 'none'
}

/** The same avatar with another pet. Critters have no pet slot and come back unchanged. @param {string} avatar @param {string} pet */
export function withPet(avatar, pet) {
  if (!isKitAvatar(avatar)) return avatar
  return encodeAvatar({ ...decodeAvatar(avatar), [PET_FIELD]: pet })
}

/** Spoken tier note for a pet card, e.g. 'PASS ITEM', or '' for a free pet. @param {PetOption} pet */
export function petTierText(pet) {
  if (pet.tier === 'earn') return pet.note ? `EARNED: ${pet.note.toUpperCase()}` : 'EARNED'
  if (isPremiumTier(pet.tier)) return pet.tier === 'pack' ? 'PACK ITEM' : 'PASS ITEM'
  return ''
}
