// Per-recipient sealed delivery over the world-readable room node.
//
// Every field under `games/$id` is readable by every client (and spectator),
// so a secret that only SOME players may see (Heads Up's prompt — everyone but
// the guesser; Chameleon's secret word — everyone but the Chameleon) cannot
// sit there in plaintext, and a salted commitment alone only hides it from
// EVERYONE. Sealing fixes that without a server: each player publishes an
// ECDH public key (`games/$id/sealKeys/{uid}`) and keeps the private key in
// its own tab; the dealing client encrypts one entry per recipient
// (ECIES: an ephemeral P-256 key per entry, ECDH → HKDF-SHA-256 → AES-GCM),
// so a client can only open the entry addressed to its own key. A player
// with no entry (the guesser) has nothing to decrypt, even from devtools.
//
// Reveal: `seal`/`openWithPrivate` both hand back the entry's derived AES key.
// Publishing that key later lets EVERY client open that one entry and check
// it (AES-GCM authenticates the ciphertext, so a forged key or plaintext
// fails to open) without exposing any private key or any other entry.
//
// Trust limit: the DEALING client chooses the plaintexts, so it knows every
// entry it sealed. Pages pick a dealer who is allowed to know (Heads Up) or
// document it (Chameleon).
//
// Plaintexts are padded to a fixed bucket before encryption so ciphertext
// length can't tell entries apart ('CHAMELEON' vs 'WORD:7').
//
// Pure — no DOM/Firebase/React; Web Crypto only (browsers and Node >= 19).

const CURVE = { name: 'ECDH', namedCurve: 'P-256' }
const INFO_PREFIX = 'game-night-seal-v1'
const PAD_BUCKET = 64

const subtle = () => globalThis.crypto.subtle
const utf8 = (s) => new TextEncoder().encode(s)

export function toB64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function fromB64(b64) {
  const s = atob(String(b64 || ''))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/**
 * Short stable id for a public key, stored beside each sealed entry so a
 * recipient (or the dealer) can tell the entry was sealed to an older key —
 * e.g. the player reopened the room in a new tab and published a fresh key.
 */
export function sealKeyId(pub) {
  return typeof pub === 'string' ? pub.slice(-16) : ''
}

/** @returns {Promise<{ pub: string, privJwk: JsonWebKey }>} base64 raw public key + private JWK. */
export async function generateSealKeyPair() {
  const kp = await subtle().generateKey(CURVE, true, ['deriveBits'])
  const pub = toB64(await subtle().exportKey('raw', kp.publicKey))
  const privJwk = await subtle().exportKey('jwk', kp.privateKey)
  return { pub, privJwk }
}

const importPub = (b64) => subtle().importKey('raw', fromB64(b64), CURVE, false, [])
const importPriv = (jwk) => subtle().importKey('jwk', jwk, CURVE, false, ['deriveBits'])

// ECDH shared secret → HKDF → 32 raw AES key bytes. `info` binds the key to
// this entry's ephemeral key and recipient.
async function deriveKeyBytes(privateKey, publicKey, epk, recipientPub) {
  const shared = await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const hkdf = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveBits'])
  const bits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8(`${INFO_PREFIX}|${epk}|${recipientPub}`) },
    hkdf, 256,
  )
  return new Uint8Array(bits)
}

const aesKey = (bytes, usage) => subtle().importKey('raw', bytes, 'AES-GCM', false, [usage])

// Fixed-size buckets: payload bytes, then a 0x00 terminator, then zero fill.
function pad(text) {
  const body = utf8(String(text))
  const size = Math.ceil((body.length + 1) / PAD_BUCKET) * PAD_BUCKET
  const out = new Uint8Array(size)
  out.set(body)
  return out
}

function unpad(bytes) {
  const b = new Uint8Array(bytes)
  const end = b.indexOf(0)
  return new TextDecoder().decode(end === -1 ? b : b.subarray(0, end))
}

/**
 * Seal `plaintext` so only the holder of `recipientPub`'s private key can
 * open it. `aad` (e.g. `${roundId}|${uid}`) binds the entry to its slot so it
 * can't be replayed into another round or seat.
 *
 * @returns {Promise<{ box: { epk: string, iv: string, ct: string, kid: string }, key: string }>}
 *   `box` goes to Firebase; `key` (base64 AES key) is the dealer's reveal key.
 */
export async function seal(recipientPub, plaintext, aad = '') {
  const eph = await subtle().generateKey(CURVE, true, ['deriveBits'])
  const epk = toB64(await subtle().exportKey('raw', eph.publicKey))
  const keyBytes = await deriveKeyBytes(eph.privateKey, await importPub(recipientPub), epk, recipientPub)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad) },
    await aesKey(keyBytes, 'encrypt'), pad(plaintext),
  )
  return {
    box: { epk, iv: toB64(iv), ct: toB64(ct), kid: sealKeyId(recipientPub) },
    key: toB64(keyBytes),
  }
}

/** A fresh random symmetric key (base64, 32 bytes) for `encryptWithKey`. */
export function newSymmetricKey() {
  return toB64(globalThis.crypto.getRandomValues(new Uint8Array(32)))
}

/**
 * Encrypt under a shared symmetric key (e.g. one per-round key sealed to
 * several players) with the same padding + AES-GCM as `seal`, so
 * `openWithKey(key, { iv, ct }, aad)` opens it.
 *
 * @returns {Promise<{ iv: string, ct: string }>}
 */
export async function encryptWithKey(key, plaintext, aad = '') {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad) },
    await aesKey(fromB64(key), 'encrypt'), pad(plaintext),
  )
  return { iv: toB64(iv), ct: toB64(ct) }
}

/**
 * Open a box with the reveal key (published by the recipient or the dealer).
 * @returns {Promise<string|null>} null when the key/box/aad don't match.
 */
export async function openWithKey(key, box, aad = '') {
  if (!key || !box?.iv || !box?.ct) return null
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromB64(box.iv), additionalData: utf8(aad) },
      await aesKey(fromB64(key), 'decrypt'), fromB64(box.ct),
    )
    return unpad(pt)
  } catch {
    return null
  }
}

/**
 * Open a box addressed to me.
 * @returns {Promise<{ plaintext: string, key: string }|null>} `key` is this
 *   entry's reveal key; null when the box was sealed to another key.
 */
export async function openWithPrivate(privJwk, myPub, box, aad = '') {
  if (!privJwk || !myPub || !box?.epk) return null
  try {
    const keyBytes = await deriveKeyBytes(await importPriv(privJwk), await importPub(box.epk), box.epk, myPub)
    const key = toB64(keyBytes)
    const plaintext = await openWithKey(key, box, aad)
    return plaintext == null ? null : { plaintext, key }
  } catch {
    return null
  }
}

/**
 * Normalize the room's `sealKeys` node into `{ [uid]: pub }`, dropping
 * malformed entries.
 */
export function normalizeSealKeys(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [uid, v] of Object.entries(raw)) {
    const pub = typeof v === 'string' ? v : v?.pub
    if (typeof pub === 'string' && pub.length > 0) out[uid] = pub
  }
  return out
}

/**
 * Which recipients still need a (re)sealed entry: every id with a published
 * key whose current entry is missing or was sealed to a different key.
 */
export function staleRecipients(ids, sealKeys, sealed) {
  const keys = sealKeys || {}
  return (ids || []).filter(id => keys[id] && sealed?.[id]?.kid !== sealKeyId(keys[id]))
}
