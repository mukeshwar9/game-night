// One-off and opt-in: deletes the leaderboard/ rows the server never wrote
// (no `verified: true`) — the old client-written mirror, whose numbers nobody
// checked. Nothing runs this automatically: the Leaderboard page already hides
// those rows, so deleting them is a deliberate clean-up for the project owner.
//
//   # dry run — counts and lists the rows it would delete
//   node functions/scripts/purge-legacy-leaderboard.js --database-url https://<project>-default-rtdb.firebaseio.com
//   # delete them
//   node functions/scripts/purge-legacy-leaderboard.js --database-url https://<project>-default-rtdb.firebaseio.com --yes
//
// Credentials: Application Default Credentials for an account with access to
// the project (`gcloud auth application-default login`, or
// GOOGLE_APPLICATION_CREDENTIALS pointing at a service-account key). With
// FIREBASE_DATABASE_EMULATOR_HOST set it talks to the emulator instead.
// Rows a player gets credited for later are server-written and never touched.
const { initializeApp } = require('firebase-admin/app')
const { getDatabase } = require('firebase-admin/database')

const DELETE_CHUNK = 500

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1] ?? null
}

async function main() {
  const databaseURL = arg('--database-url')
  if (!databaseURL) {
    console.error('usage: node purge-legacy-leaderboard.js --database-url <url> [--yes]')
    process.exit(2)
  }
  const apply = process.argv.includes('--yes')
  const app = initializeApp({ databaseURL }, 'purge-legacy-leaderboard')
  const ref = getDatabase(app).ref('leaderboard')

  // One read of the whole node: this runs once, and the node holds one small
  // row per player.
  const snap = await ref.get()
  const legacy = []
  snap.forEach(row => {
    if (row.child('verified').val() !== true) legacy.push(row.key)
  })
  console.log(`${legacy.length} unverified of ${snap.numChildren()} leaderboard rows`)
  if (!apply) {
    if (legacy.length) console.log(legacy.join('\n'))
    console.log('Dry run: nothing deleted. Re-run with --yes to delete them.')
    process.exit(0)
  }
  for (let i = 0; i < legacy.length; i += DELETE_CHUNK) {
    const updates = {}
    for (const key of legacy.slice(i, i + DELETE_CHUNK)) updates[key] = null
    await ref.update(updates)
  }
  console.log(`Deleted ${legacy.length} rows.`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
