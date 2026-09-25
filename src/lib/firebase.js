import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Local emulator mode (`npm run dev:emu`, Playwright): set only by
// .env.emulator, which Vite loads for `--mode emulator` and never for a
// normal dev server or production build. That file also swaps in a `demo-`
// project ID, so even a missing emulator can never reach live Firebase — the
// SDK just fails to connect.
export const usingEmulators = import.meta.env.VITE_USE_EMULATORS === '1';
const EMULATOR_HOST = '127.0.0.1';
const AUTH_EMULATOR_PORT = 9099;
const DATABASE_EMULATOR_PORT = 9000;

// App Check (reCAPTCHA Enterprise) attests that requests come from this app,
// not a script replaying the public config. Off unless VITE_APPCHECK_SITE_KEY
// is set, and never against the emulators. To turn it on:
//  1. Google Cloud console → Security → reCAPTCHA Enterprise: create a
//     website key (score-based) listing the hosting domains (and any preview
//     channel domains). Copy its site key.
//  2. Firebase console → App Check → Apps: register the web app with the
//     reCAPTCHA Enterprise provider and that site key.
//  3. Set VITE_APPCHECK_SITE_KEY (.env.local and the CI build secrets) and
//     deploy. The CSP must also allow https://www.google.com and
//     https://www.gstatic.com for scripts, and https://www.google.com frames.
//  4. Watch App Check → APIs → Realtime Database until nearly every request
//     is verified (old cached clients send none), then click Enforce. Do the
//     same for Authentication if you want it covered too.
//  Local dev against a real project with enforcement on: set
//  VITE_APPCHECK_DEBUG_TOKEN to a debug token registered under the app's
//  "Manage debug tokens" in the App Check console.
const APPCHECK_SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY;
const APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;

let db = null;
let auth = null;
export let configError = null;

try {
  const app = initializeApp(firebaseConfig);
  // Before any other service is used, so every request carries a token.
  if (APPCHECK_SITE_KEY && !usingEmulators) {
    if (APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = APPCHECK_DEBUG_TOKEN;
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(APPCHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      // Unenforced, the app still works without a token; enforced, requests
      // fail and the error reporter will show it.
      console.error('App Check init failed:', err);
    }
  }
  db = getDatabase(app);
  auth = getAuth(app);
  // Must run before any auth call or database read/write touches the instances.
  if (usingEmulators) {
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });
    connectDatabaseEmulator(db, EMULATOR_HOST, DATABASE_EMULATOR_PORT);
  }
} catch {
  configError = 'Firebase is not configured. Copy .env.local.example to .env.local and fill in your Firebase project credentials.';
}

export { db, auth };
