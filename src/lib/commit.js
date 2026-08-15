import { sha256hex } from './sha256'

export async function commit(secret) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('')
  const hash = await sha256hex(secret + salt)
  return { hash, salt }
}

export async function verifyReveal(hash, secret, salt) {
  const computed = await sha256hex(secret + salt)
  return computed === hash
}
