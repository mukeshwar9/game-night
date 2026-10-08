// Guest -> Google account merge, and the cosmetic sign-up reward.
//
//  mergeGuestAccount  callable  a Google caller sends the ID token of the guest uid it
//                               just left; the guest's safe progress (stats, match
//                               history, Arrows and Memory bests, friends) is folded
//                               into the caller's existing account. Identity (name,
//                               avatar, friend code), purchases and anything else
//                               stay with the existing account.
//  claimSavedBadge    callable  grants unlocks/{uid}/savedBadge (cosmetic only).
//
// Both write nodes the client cannot (database.rules.json). The pure merge rules
// live in mergeGuest.js; mergeGuest() below takes the database as an
// argument and is unit-tested in test/accountMerge.test.js.
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const logger = require('firebase-functions/logger')
const { getDatabase, ServerValue } = require('firebase-admin/database')
const { getAuth } = require('firebase-admin/auth')
const {
  mergeStats, mergeMatches, mergeArrows, mergeMemoryBests, friendsToAdd,
} = require('./mergeGuest')

const providerOf = (token) => token?.firebase?.sign_in_provider

/** The caller's uid, refusing signed-out and anonymous callers. */
function requireSignedInAccount(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (providerOf(request.auth.token) === 'anonymous') {
    throw new HttpsError('permission-denied', 'Sign in with Google first.')
  }
  return request.auth.uid
}

/**
 * Merge the guest's progress into the target account. Idempotent per guest uid.
 * @param {import('firebase-admin/database').Database} db
 * @returns {Promise<{ merged: boolean, reason?: string }>}
 */
async function mergeGuest(db, guestUid, targetUid) {
  const root = db.ref()
  // Claim the guest first so two concurrent calls cannot both add the stats.
  const claim = await root.child(`accountMerges/${guestUid}`).transaction((cur) => (cur ? undefined : { into: targetUid, at: ServerValue.TIMESTAMP }))
  if (!claim.committed) return { merged: false, reason: 'already-merged' }
  try {
    const read = async (path) => (await root.child(path).get()).val()
    const [gStats, tStats, gMatches, tMatches, gArrows, tArrows, gMem, tMem, gFriends, tFriends, tBlocks] = await Promise.all([
      read(`users/${guestUid}/stats`), read(`users/${targetUid}/stats`),
      read(`users/${guestUid}/matches`), read(`users/${targetUid}/matches`),
      read(`users/${guestUid}/arrowsSolo`), read(`users/${targetUid}/arrowsSolo`),
      read(`users/${guestUid}/memoryBests`), read(`users/${targetUid}/memoryBests`),
      read(`friends/${guestUid}`), read(`friends/${targetUid}`), read(`blocks/${targetUid}`),
    ])
    const updates = {}
    if (gStats) updates[`users/${targetUid}/stats`] = mergeStats(tStats, gStats)
    if (gMatches) {
      const list = mergeMatches(tMatches, gMatches)
      if (list.length) updates[`users/${targetUid}/matches`] = list
    }
    if (gArrows) {
      const merged = mergeArrows(tArrows, gArrows)
      updates[`users/${targetUid}/arrowsSolo`] = { ...merged, updatedAt: ServerValue.TIMESTAMP }
    }
    if (gMem) {
      const merged = mergeMemoryBests(tMem, gMem)
      if (Object.keys(merged).length) updates[`users/${targetUid}/memoryBests`] = merged
    }

    const adds = friendsToAdd(gFriends, tFriends, tBlocks, { guestUid, targetUid })
    for (const [uid, since] of Object.entries(adds)) {
      const row = { since: since ?? Date.now() }
      updates[`friends/${targetUid}/${uid}`] = row
      updates[`friends/${uid}/${targetUid}`] = row
    }
    // Every friend of the guest drops the dead reverse row, merged or not.
    for (const uid of Object.keys(gFriends && typeof gFriends === 'object' ? gFriends : {})) {
      updates[`friends/${uid}/${guestUid}`] = null
    }
    await root.update(updates)
    logger.info('guest account merged', { guestUid, targetUid, friendsAdded: Object.keys(adds).length })
    return { merged: true }
  } catch (err) {
    // Release the claim so the client can retry.
    await root.child(`accountMerges/${guestUid}`).remove().catch(() => {})
    throw err
  }
}

exports.mergeGuestAccount = onCall({ maxInstances: 5 }, async (request) => {
  const targetUid = requireSignedInAccount(request)
  const idToken = request.data?.guestIdToken
  if (typeof idToken !== 'string' || !idToken) throw new HttpsError('invalid-argument', 'guestIdToken is required.')
  let guest
  try {
    guest = await getAuth().verifyIdToken(idToken)
  } catch (err) {
    logger.warn('mergeGuestAccount: bad guest token', { targetUid, code: err?.code })
    throw new HttpsError('invalid-argument', 'The guest token is not valid.')
  }
  if (providerOf(guest) !== 'anonymous') throw new HttpsError('invalid-argument', 'The token is not a guest account.')
  if (guest.uid === targetUid) throw new HttpsError('invalid-argument', 'Cannot merge an account into itself.')
  return mergeGuest(getDatabase(), guest.uid, targetUid)
})

exports.claimSavedBadge = onCall({ maxInstances: 5 }, async (request) => {
  const uid = requireSignedInAccount(request)
  const ref = getDatabase().ref(`unlocks/${uid}/savedBadge`)
  const result = await ref.transaction((cur) => (cur ? undefined : { at: ServerValue.TIMESTAMP }))
  const at = result.committed ? (await ref.child('at').get()).val() : result.snapshot.child('at').val()
  return { granted: true, at }
})

exports._test = { mergeGuest, requireSignedInAccount }
