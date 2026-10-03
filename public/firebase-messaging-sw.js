// FCM background handler. Lives in public/ so it ships at
// /firebase-messaging-sw.js beside the VitePWA workbox SW (sw.js).
// Firebase web config is public — Hosting also serves it at
// /__/firebase/init.js, so no secrets are hardcoded here.
/* global importScripts, firebase, clients */
importScripts(
  'https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js'
)

try {
  // Hosted init (Firebase Hosting reserved URL). It already calls
  // firebase.initializeApp(config), and a bare initializeApp() throws
  // `app/no-options` before it ever checks for that existing app — so only
  // initialize when nothing exists yet. Local dev without Hosting: the
  // importScripts above throws, background push is skipped, foreground
  // still works via src/lib/push.js.
  importScripts('/__/firebase/init.js')
  if (!firebase.apps.length) firebase.initializeApp()
  const messaging = firebase.messaging()

  // Messages from sendInvitePush are data-only, so this is the only place a
  // notification is drawn (a `notification` payload would be shown by the
  // browser as well, twice). `payload.notification` is still read as a fallback
  // for messages sent by hand from the Firebase console.
  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {}
    const legacy = payload.notification || {}
    self.registration.showNotification(data.title || legacy.title || 'Game Night', {
      body: data.body || legacy.body || 'Your turn — tap to play!',
      icon: legacy.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: data.url || undefined,
      data: { url: data.url || '/' },
    })
  })

  // This worker has its own scope, so open app windows are not controlled by
  // it and WindowClient.navigate() may refuse them; fall back to a new window.
  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = event.notification?.data?.url || '/'
    event.waitUntil((async () => {
      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of wins) {
        if (!w.url.startsWith(self.location.origin)) continue
        try { await w.focus(); await w.navigate(url); return } catch { /* not controllable */ }
      }
      await clients.openWindow(url)
    })())
  })
} catch (e) {
  // No Hosting init locally — background push disabled, app still runs.
  console.warn('FCM background SW skipped:', e?.message || e)
}
