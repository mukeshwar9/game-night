// Launch switches. Code stays in the tree; flipping a flag brings the feature back.

// The public leaderboard (/leaderboard and its entry points) is hidden for the
// launch: credits are trust-based for games the server cannot verify.
export const LEADERBOARD_ENABLED = false

// Native-shell features that need store or console setup first (docs/MOBILE.md).
// Each is off until its credentials exist; the web never reads them.
// Native Google sign-in: needs the iOS/Android OAuth clients and real
// GoogleService-Info.plist / google-services.json.
export const NATIVE_GOOGLE_SIGNIN = import.meta.env?.VITE_NATIVE_GOOGLE_SIGNIN === '1'
// Sign in with Apple (iOS): needs the Apple Developer capability and the
// Firebase Apple provider.
export const NATIVE_APPLE_SIGNIN = import.meta.env?.VITE_NATIVE_APPLE_SIGNIN === '1'
// Native push (FCM on Android, APNs through FCM on iOS): needs the APNs auth
// key uploaded to Firebase and the real native Firebase config files.
export const NATIVE_PUSH = import.meta.env?.VITE_NATIVE_PUSH === '1'
