import { initializeApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
  isTestingMode, devSlot,
} from './devTesting';
import {
  TESTING_PROJECT_ID, TESTING_DB_HOST, TESTING_DB_PORT, TESTING_AUTH_URL,
} from './devTestingLogic';

let db = null;
let auth = null;
export let configError = null;

try {
  if (isTestingMode) {
    // F-51: per-slot Firebase app bound to local emulators — a tab playing
    // slot P2 gets its own named app + Auth instance + Realtime Database,
    // all pointed at the demo-* emulator project. It NEVER touches the live
    // project configured via .env.local, and missing emulators surface as
    // connection failures (never a silent fallback to live Firebase).
    const app = initializeApp({
      apiKey: 'demo-testing-key',
      authDomain: 'localhost',
      databaseURL: `http://${TESTING_DB_HOST}:${TESTING_DB_PORT}?ns=${TESTING_PROJECT_ID}`,
      projectId: TESTING_PROJECT_ID,
      appId: `1:0:web:${TESTING_PROJECT_ID}`,
    }, `gn-dev-${devSlot ?? 'launcher'}`);
    db = getDatabase(app);
    auth = getAuth(app);
    connectDatabaseEmulator(db, TESTING_DB_HOST, TESTING_DB_PORT);
    connectAuthEmulator(auth, TESTING_AUTH_URL, { disableWarnings: true });
  } else {
    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };
    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    auth = getAuth(app);
  }
} catch (e) {
  configError = isTestingMode
    ? `Testing mode failed to initialize (${e?.message}). Start the emulators: npm run test:emulators`
    : 'Firebase is not configured. Copy .env.local.example to .env.local and fill in your Firebase project credentials.';
}

export { db, auth };
