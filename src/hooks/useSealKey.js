import { useEffect, useMemo, useState } from 'react'
import { ref, runTransaction } from 'firebase/database'
import { db } from '../lib/firebase'
import { generateSealKeyPair, normalizeSealKeys } from '../lib/sealed'

// This tab's sealing key pair for a room (see src/lib/sealed.js). The private
// key lives only in sessionStorage — it survives a reload of the same tab,
// not a new tab — and the public half is published at
// `games/$id/sealKeys/{uid}` as `{ pub, at }` so a dealer can seal entries
// to it. The node is room-level (not under `round`) and deliberately NOT in
// games.js FIELD_NULLS: keys stay valid across NEW MATCH and switches
// between sealed party games.
//
// A player with two tabs open would otherwise ping-pong their published key;
// the newest key (highest `at`) wins, so the older tab stops republishing
// and simply can't open entries sealed after the newer tab took over.

const storageKey = (gameId) => `sealed-ecdh-${gameId}`

// Web Crypto (crypto.subtle) exists only in secure contexts: HTTPS or localhost.
const cryptoSupported = () => !!globalThis.crypto?.subtle

function readPair(gameId) {
  try {
    const v = JSON.parse(sessionStorage.getItem(storageKey(gameId)) || 'null')
    return v?.pub && v?.privJwk ? v : null
  } catch {
    return null
  }
}

/**
 * @param {string} gameId
 * @param {string|null} mySeat - my uid when seated; pass null for spectators
 *   (nothing is generated or published).
 * @param {unknown} rawSealKeys - the room's `sealKeys` node as read.
 * @returns {{ pair: { pub: string, privJwk: JsonWebKey, at: number }|null,
 *   sealKeys: Record<string, string>, published: boolean, supported: boolean }}
 *   `supported` is false without Web Crypto (plain-HTTP LAN address): no key,
 *   so the page should say why it can't deal.
 */
export default function useSealKey(gameId, mySeat, rawSealKeys) {
  const [pair, setPair] = useState(() => readPair(gameId))
  const sealKeys = useMemo(() => normalizeSealKeys(rawSealKeys), [rawSealKeys])
  const publishedAt = mySeat ? (rawSealKeys?.[mySeat]?.at ?? 0) : 0

  useEffect(() => {
    if (!mySeat || pair || !cryptoSupported()) return
    let alive = true
    generateSealKeyPair().then(({ pub, privJwk }) => {
      const next = { pub, privJwk, at: Date.now() }
      try { sessionStorage.setItem(storageKey(gameId), JSON.stringify(next)) } catch { /* private mode */ }
      if (alive) setPair(next)
    }).catch(() => { /* no Web Crypto: sealed games show a notice */ })
    return () => { alive = false }
  }, [gameId, mySeat, pair])

  const mine = mySeat ? sealKeys[mySeat] : null
  useEffect(() => {
    if (!mySeat || !pair || mine === pair.pub) return
    // Only a newer key may replace the published one (see the two-tab note).
    if (publishedAt > (pair.at || 0)) return
    runTransaction(ref(db, `games/${gameId}/sealKeys/${mySeat}`), cur => {
      if (cur?.pub === pair.pub) return
      if ((cur?.at || 0) > (pair.at || 0)) return
      return { pub: pair.pub, at: pair.at || Date.now() }
    }).catch(() => { /* retried on the next render that still sees it missing */ })
  }, [gameId, mySeat, pair, mine, publishedAt])

  return { pair, sealKeys, published: !!pair && mine === pair.pub, supported: cryptoSupported() }
}
