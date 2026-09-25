import { initializeApp } from 'firebase/app';
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

let db = null;
let auth = null;
export let configError = null;

try {
  const app = initializeApp(firebaseConfig);
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
