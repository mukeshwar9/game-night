import type { CapacitorConfig } from '@capacitor/cli'

// The store bundle id / application id. A placeholder until the captain
// registers the real one (docs/MOBILE.md). `npx cap add` copied it into the
// native projects; after changing it, update PRODUCT_BUNDLE_IDENTIFIER in
// ios/App/App.xcodeproj and applicationId + namespace in android/app/build.gradle.
export const APP_ID = 'app.gamenight'

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: 'Game Night',
  // Bundled build: the reviewed binary carries its own web assets and never
  // loads the live site (no server.url), so a Hosting deploy cannot change it.
  webDir: 'dist',
  // Match the default theme (MATCHA) ground so no white flash shows between
  // the splash and the first paint.
  backgroundColor: '#eef0e2',
  ios: {
    contentInset: 'never',
  },
  android: {
    // Chrome's WebView otherwise lets the user long-press to "open in browser".
    allowMixedContent: false,
  },
  experimental: {
    ios: {
      spm: {
        // Package traits need tools 6.1. Only the Google trait of the auth
        // plugin: its default also links the Facebook SDK, which the app
        // never uses.
        swiftToolsVersion: '6.1',
        packageTraits: {
          '@capacitor-firebase/authentication': ['Google'],
        },
      },
    },
  },
  plugins: {
    SplashScreen: {
      // Hidden from JS once auth settles (src/lib/native/shell.js), with a
      // timeout so a hang never keeps it up.
      launchAutoHide: false,
      backgroundColor: '#eef0e2',
      showSpinner: false,
      // The splash images are drawn for centring; FIT_XY would stretch them.
      androidScaleType: 'CENTER',
    },
    Keyboard: {
      // Shrink the web view so a focused input near the bottom (chat, word
      // games) stays above the keyboard, as the browser does.
      resize: 'native',
    },
    SystemBars: {
      // Edge to edge: the page pads itself with env(safe-area-inset-*)
      // (index.html sets viewport-fit=cover). Bar styling follows the theme
      // (src/lib/native/shell.js).
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    FirebaseAuthentication: {
      // Native sign-in only fetches the provider credential; the JS SDK signs
      // in or links with it, so the anonymous uid carries over (src/lib/auth.js).
      skipNativeAuth: true,
      providers: ['google.com', 'apple.com'],
    },
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}

export default config
