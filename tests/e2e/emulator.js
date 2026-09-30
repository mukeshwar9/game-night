// Where the emulators and the app under test listen. Defaults match
// firebase.json and playwright.config.js; set E2E_DB_PORT / E2E_AUTH_PORT /
// E2E_PORT (and VITE_EMULATOR_DB_PORT / VITE_EMULATOR_AUTH_PORT for the app)
// to run next to another lane's emulators, see scripts/with-emulators.mjs.
export const DB_PORT = Number(process.env.E2E_DB_PORT) || 9000
export const AUTH_PORT = Number(process.env.E2E_AUTH_PORT) || 9099
export const APP_PORT = Number(process.env.E2E_PORT) || 5190
export const DB_ORIGIN = `http://127.0.0.1:${DB_PORT}`
