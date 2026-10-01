// Native push inside the Capacitor shell: FCM on Android, APNs through FCM on
// iOS, via @capacitor-firebase/messaging. push.js delegates here behind
// isNative + NATIVE_PUSH and imports this file dynamically, and the plugin is
// itself loaded with a dynamic import, so neither is part of the web bundle.
//
// Needs the APNs auth key uploaded to Firebase and the real native Firebase
// config files (docs/MOBILE.md); until then NATIVE_PUSH stays off.
import { nativePlatform } from '../platform'
import { saveTokenRecord, removeTokenRecord } from '../push'
import { pathFromPushData } from '../pushRouteLogic'
import { requestNavigate } from './navigation'

const ENABLED_KEY = 'push-enabled' // same flag the web path uses
const TOKEN_KEY = 'push-native-token'
// sendInvitePush names this channel on Android; created here so it is
// heads-up (importance 4 = high). An unknown channel id falls back to FCM's
// default channel, so a build without it still shows the notification.
export const INVITE_CHANNEL = 'invites'

const read = (key) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key, value) => { try { localStorage.setItem(key, value) } catch { /* ignore */ } }
const drop = (key) => { try { localStorage.removeItem(key) } catch { /* ignore */ } }

async function messaging() {
  return (await import('@capacitor-firebase/messaging')).FirebaseMessaging
}

// The plugin reports 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';
// the UI uses the browser's vocabulary.
export function mapPermission(receive) {
  if (receive === 'granted') return 'granted'
  if (receive === 'denied') return 'denied'
  return 'default'
}

export async function checkNativePermission() {
  try {
    return mapPermission((await (await messaging()).checkPermissions()).receive)
  } catch { return 'unsupported' }
}

async function ensureInviteChannel(fm) {
  if (nativePlatform !== 'android') return
  try {
    await fm.createChannel({
      id: INVITE_CHANNEL,
      name: 'Game invites',
      description: 'Invites from friends',
      importance: 4,
      vibration: true,
    })
  } catch { /* best effort: FCM falls back to its default channel */ }
}

// Records the account's token and retires the previous one this device had.
async function storeToken(token) {
  await saveTokenRecord(token, nativePlatform)
  const previous = read(TOKEN_KEY)
  write(TOKEN_KEY, token)
  if (previous && previous !== token) await removeTokenRecord(previous)
}

let listening = null

// Idempotent. A notification tap can cold-start the app, so the tap listener
// must be in place at boot (initNativePush), not only once a screen mounts;
// requestNavigate holds the path until the router subscribes.
function ensureListeners(fm) {
  if (listening) return listening
  listening = (async () => {
    await fm.addListener('notificationActionPerformed', (event) => {
      const path = pathFromPushData(event?.notification?.data)
      if (path) requestNavigate(path)
    })
    // FCM rotates tokens (restore, reinstall, instance-id reset): rewrite the
    // record so invites keep arriving. Ignored unless notifications are on.
    await fm.addListener('tokenReceived', (event) => {
      if (read(ENABLED_KEY) !== '1' || typeof event?.token !== 'string' || !event.token) return
      storeToken(event.token).catch(() => { /* resyncPush retries on the next boot */ })
    })
  })().catch((e) => { listening = null; throw e })
  return listening
}

/**
 * Call once at boot inside the shell when NATIVE_PUSH is on. Wires notification
 * taps to the router and token refreshes to the account. Never throws.
 */
export async function initNativePush() {
  try {
    const fm = await messaging()
    await ensureListeners(fm)
    await ensureInviteChannel(fm)
  } catch { /* plugin unavailable: push stays off */ }
}

export async function enableNativePush() {
  const fm = await messaging()
  const perm = mapPermission((await fm.requestPermissions()).receive)
  if (perm !== 'granted') throw new Error(`permission-${perm}`)
  await ensureListeners(fm)
  await ensureInviteChannel(fm)
  const { token } = await fm.getToken()
  if (!token) throw new Error('no-token')
  await storeToken(token)
  write(ENABLED_KEY, '1')
  return token
}

// Silent (never prompts): re-reads the token for someone who turned
// notifications on and rewrites the record, which also covers a new account
// on this device.
export async function resyncNativePush() {
  const fm = await messaging()
  if (mapPermission((await fm.checkPermissions()).receive) !== 'granted') return
  await ensureListeners(fm)
  await ensureInviteChannel(fm)
  const { token } = await fm.getToken()
  if (token) await storeToken(token)
}

export async function disableNativePush(token) {
  // Flag first: deleting the token makes FCM mint a new one, and tokenReceived
  // must not write that back.
  drop(ENABLED_KEY)
  const stored = read(TOKEN_KEY)
  drop(TOKEN_KEY)
  let fm = null
  try { fm = await messaging() } catch { /* nothing to delete */ }
  const known = new Set([token, stored].filter(Boolean))
  if (fm) {
    try {
      const current = (await fm.getToken()).token
      if (current) known.add(current)
    } catch { /* no token to find */ }
    try { await fm.deleteToken() } catch { /* best effort */ }
  }
  for (const t of known) await removeTokenRecord(t)
}
