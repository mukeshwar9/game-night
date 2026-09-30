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
  // Hosted init (Firebase Hosting reserved URL). Local dev without Hosting:
  // background push is skipped, foreground still works via src/lib/push.js.
  importScripts('/__/firebase/init.js')
  firebase.initializeApp()
  const messaging = firebase.messaging()

  messaging.onBackgroundMessage((payload) => {
    const { title, body, icon } = payload.notification || {}
    const data = payload.data || {}
    self.registration.showNotification(title || 'Game Night', {
      body: body || 'Your turn — tap to play!',
      icon: icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url || '/' },
    })
  })

  self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = event.notification?.data?.url || '/'
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
        for (const w of wins) {
          if (w.url.includes(self.location.origin)) {
            w.navigate(url)
            return w.focus()
          }
        }
        return clients.openWindow(url)
      })
    )
  })
} catch (e) {
  // No Hosting init locally — background push disabled, app still runs.
  console.warn('FCM background SW skipped:', e?.message || e)
}
