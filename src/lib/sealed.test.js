import { describe, it, expect } from 'vitest'
import {
  generateSealKeyPair, seal, openWithPrivate, openWithKey, encryptWithKey, newSymmetricKey,
  sealKeyId, normalizeSealKeys, staleRecipients, toB64, fromB64,
} from './sealed'

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64])
    expect([...fromB64(toB64(bytes))]).toEqual([...bytes])
  })
})

describe('seal / open', () => {
  it('the addressed recipient opens their entry; the reveal key matches', async () => {
    const alice = await generateSealKeyPair()
    const { box, key } = await seal(alice.pub, 'WORD:7', 'r1|alice')
    const opened = await openWithPrivate(alice.privJwk, alice.pub, box, 'r1|alice')
    expect(opened.plaintext).toBe('WORD:7')
    expect(opened.key).toBe(key)
    expect(box.kid).toBe(sealKeyId(alice.pub))
  })

  it('another player cannot open an entry sealed to someone else', async () => {
    const alice = await generateSealKeyPair()
    const bob = await generateSealKeyPair()
    const { box } = await seal(alice.pub, 'secret', 'aad')
    expect(await openWithPrivate(bob.privJwk, bob.pub, box, 'aad')).toBeNull()
    // Even claiming Alice's public key doesn't help without her private key.
    expect(await openWithPrivate(bob.privJwk, alice.pub, box, 'aad')).toBeNull()
  })

  it('a published reveal key opens exactly that entry for anyone', async () => {
    const alice = await generateSealKeyPair()
    const bob = await generateSealKeyPair()
    const a = await seal(alice.pub, 'CHAMELEON', 'r|a')
    const b = await seal(bob.pub, 'WORD:3', 'r|b')
    expect(await openWithKey(a.key, a.box, 'r|a')).toBe('CHAMELEON')
    expect(await openWithKey(a.key, b.box, 'r|b')).toBeNull()
  })

  it('binds the entry to its aad (no replay into another round or seat)', async () => {
    const alice = await generateSealKeyPair()
    const { box, key } = await seal(alice.pub, 'x', 'round1|alice')
    expect(await openWithPrivate(alice.privJwk, alice.pub, box, 'round2|alice')).toBeNull()
    expect(await openWithKey(key, box, 'round1|bob')).toBeNull()
  })

  it('rejects a tampered ciphertext or a forged key', async () => {
    const alice = await generateSealKeyPair()
    const { box, key } = await seal(alice.pub, 'WORD:1', 'aad')
    const ct = fromB64(box.ct)
    ct[0] ^= 1
    expect(await openWithKey(key, { ...box, ct: toB64(ct) }, 'aad')).toBeNull()
    const forged = fromB64(key)
    forged[5] ^= 1
    expect(await openWithKey(toB64(forged), box, 'aad')).toBeNull()
  })

  it('pads plaintexts so ciphertext length does not reveal the payload', async () => {
    const alice = await generateSealKeyPair()
    const short = await seal(alice.pub, 'WORD:7', 'aad')
    const long = await seal(alice.pub, 'CHAMELEON', 'aad')
    expect(short.box.ct.length).toBe(long.box.ct.length)
  })

  it('round-trips unicode and longer payloads', async () => {
    const alice = await generateSealKeyPair()
    const text = JSON.stringify(Array.from({ length: 60 }, (_, i) => i * 7)) + ' é ✓'
    const { box } = await seal(alice.pub, text, '')
    expect((await openWithPrivate(alice.privJwk, alice.pub, box, '')).plaintext).toBe(text)
  })

  it('tolerates missing inputs', async () => {
    expect(await openWithKey(null, {}, '')).toBeNull()
    expect(await openWithPrivate(null, 'x', {}, '')).toBeNull()
  })
})

describe('encryptWithKey', () => {
  it('encrypts under a shared key that openWithKey opens, bound to its aad', async () => {
    const key = newSymmetricKey()
    expect(fromB64(key)).toHaveLength(32)
    const box = await encryptWithKey(key, 'clue: BANANA', 'r1|clue|a')
    expect(await openWithKey(key, box, 'r1|clue|a')).toBe('clue: BANANA')
    expect(await openWithKey(key, box, 'r1|clue|b')).toBeNull()
    expect(await openWithKey(newSymmetricKey(), box, 'r1|clue|a')).toBeNull()
  })

  it('pads like seal, so lengths within a bucket match', async () => {
    const key = newSymmetricKey()
    const a = await encryptWithKey(key, 'x')
    const b = await encryptWithKey(key, 'a much longer clue text')
    expect(a.ct.length).toBe(b.ct.length)
  })

  it('opens with the reveal key of a sealed entry too', async () => {
    const alice = await generateSealKeyPair()
    const { key } = await seal(alice.pub, 'round key holder', 'aad')
    const box = await encryptWithKey(key, 'payload', 'x')
    expect(await openWithKey(key, box, 'x')).toBe('payload')
  })
})

describe('normalizeSealKeys / staleRecipients', () => {
  it('reads { pub } objects and bare strings, drops junk', () => {
    expect(normalizeSealKeys({ a: { pub: 'AAA' }, b: 'BBB', c: { pub: '' }, d: null })).toEqual({ a: 'AAA', b: 'BBB' })
    expect(normalizeSealKeys(null)).toEqual({})
  })

  it('lists ids with a key but a missing or outdated entry', () => {
    const keys = { a: 'KEY-A-0000000000000000', b: 'KEY-B-0000000000000000', c: 'KEY-C-1111111111111111' }
    const sealed = { a: { kid: sealKeyId(keys.a) }, c: { kid: 'old' } }
    expect(staleRecipients(['a', 'b', 'c', 'd'], keys, sealed)).toEqual(['b', 'c'])
  })
})
