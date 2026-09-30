// Account deletion, server side. The app's "Delete my data" removes the rows
// the user owns and then their Auth account (src/lib/social.js deleteMyData);
// this trigger runs when the Auth account goes away and clears what clients
// cannot write — the leaderboard row — plus anything the client did not get to
// (a closed tab, a failed write), so a deleted account leaves nothing behind.
const functionsV1 = require('firebase-functions/v1')
const logger = require('firebase-functions/logger')
const { getDatabase } = require('firebase-admin/database')

// Every path that belongs to `uid`, given the friend uids and friend code read
// from the account before it is cleared. Pure, so it is unit-tested.
function accountPaths(uid, { friendUids = [], code = null } = {}) {
  const paths = [
    `leaderboard/${uid}`, `users/${uid}`, `profiles/${uid}`, `presence/${uid}`,
    `friends/${uid}`, `friendRequests/${uid}`, `invites/${uid}`,
  ]
  if (code) paths.push(`codes/${code}`)
  for (const friend of friendUids) paths.push(`friends/${friend}/${uid}`)
  return paths
}

exports.cleanupDeletedAccount = functionsV1.runWith({ maxInstances: 5 }).auth.user().onDelete(async (user) => {
  const uid = user.uid
  const root = getDatabase().ref()
  const [friends, code] = await Promise.all([
    root.child(`friends/${uid}`).get(),
    root.child(`users/${uid}/code`).get(),
  ])
  const friendUids = friends.exists() ? Object.keys(friends.val() || {}) : []
  const codeValue = typeof code.val() === 'string' ? code.val() : null
  const updates = {}
  for (const path of accountPaths(uid, { friendUids, code: codeValue })) updates[path] = null
  await root.update(updates)
  logger.info('account data removed', { uid, friends: friendUids.length })
})

exports._test = { accountPaths }
