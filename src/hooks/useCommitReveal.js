import { useCallback, useState } from 'react'
import { commit as makeCommit, verifyReveal } from '../lib/commit'

// Tab-local secret storage for salted commit-reveal (Hangwoman, Fibbage,
// Wavelength, Herd Mind…). The plaintext + salt live ONLY in sessionStorage
// until the reveal; Firebase sees just the SHA-256 commitment. sessionStorage
// survives a reload of the same tab, but not a new tab — a player who loses
// the secret cannot reveal and the page must treat them as a non-answer.
//
// Storage key convention (matches the existing pages):
//   `${key}-${gameId}`            e.g. hangwoman-word-ABC123
//   `${key}-${gameId}-${round}`   e.g. fibbage-lie-ABC123-7
// Stored value: `{ ...fields, salt, hash }` — callers put the plaintext in
// `fields` under their own name ({ text }, { target }, { word }).

export { verifyReveal }

export const secretKey = (key, gameId, round) =>
  (round == null ? `${key}-${gameId}` : `${key}-${gameId}-${round}`)

export function readSecret(storageKey) {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') } catch { return null }
}

export function writeSecret(storageKey, value) {
  try { sessionStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* private mode */ }
}

export function clearSecret(storageKey) {
  try { sessionStorage.removeItem(storageKey) } catch { /* private mode */ }
}

/**
 * @param {string} gameId
 * @param {string} key - storage prefix, e.g. 'herd-answer'
 * @param {string|number} [round] - per-round suffix (omit for one secret per room)
 * @returns {{
 *   secret: object|null,            // stored { ...fields, salt, hash } for this key, or null
 *   commit: (plaintext: string, fields?: object) => Promise<{ hash: string, salt: string }>,
 *   read: () => object|null,        // fresh read (for effects that must not trust render state)
 *   clear: () => void,
 *   verify: (hash: string, plaintext: string, salt: string) => Promise<boolean>,
 *   storageKey: string,
 * }}
 */
export default function useCommitReveal(gameId, key, round) {
  const storageKey = secretKey(key, gameId, round)
  const [secret, setSecret] = useState(() => readSecret(storageKey))
  // Re-read when the round (and so the key) changes — render-phase derive, no
  // effect round-trip.
  const [prevKey, setPrevKey] = useState(storageKey)
  if (prevKey !== storageKey) {
    setPrevKey(storageKey)
    setSecret(readSecret(storageKey))
  }

  // Stores the secret BEFORE returning the hash, so the caller's Firebase
  // write can never publish a commitment this tab is unable to reveal.
  const commit = useCallback(async (plaintext, fields = {}) => {
    const { hash, salt } = await makeCommit(String(plaintext))
    const value = { ...fields, salt, hash }
    writeSecret(storageKey, value)
    setSecret(value)
    return { hash, salt }
  }, [storageKey])

  const read = useCallback(() => readSecret(storageKey), [storageKey])

  const clear = useCallback(() => {
    clearSecret(storageKey)
    setSecret(null)
  }, [storageKey])

  return { secret, commit, read, clear, verify: verifyReveal, storageKey }
}
