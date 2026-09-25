const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

initializeApp();

// Server-authoritative match results -> leaderboard (see results.js, README.md).
exports.creditMatchResults = require('./results').creditMatchResults;
const { errorsCutoffKey, isExpiredErrorDay } = require('./lib/core.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
// Query page size and a per-run ceiling, so a backlog (e.g. the first run after
// this is deployed) is worked off over a few days instead of timing out.
const PAGE = 500;
const MAX_PAGES = 40;
// Keys per multi-path delete, well under RTDB's per-write limits.
const DELETE_CHUNK = 500;

// Pages through `ref` ordered by `child`, from the first numeric value (or from
// the very start, where children lacking `child` sort first, when
// `includeMissing`) up to `endAt`, and returns the keys `pick` accepts. Paging
// uses a (value, key) cursor so rows `pick` rejects can't stall the loop.
async function collectKeys(ref, child, endAt, { includeMissing = false, pick }) {
  const keys = [];
  let cursor = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    let q = ref.orderByChild(child);
    if (cursor) q = q.startAfter(cursor.value, cursor.key);
    else if (!includeMissing) q = q.startAt(0);
    const snap = await q.endAt(endAt).limitToFirst(PAGE).get();
    let rows = 0;
    snap.forEach(row => {
      rows++;
      cursor = { value: row.child(child).val(), key: row.key };
      if (pick(row.val() || {})) keys.push(row.key);
    });
    if (rows < PAGE) break;
  }
  return keys;
}

async function deleteKeys(ref, keys) {
  for (let i = 0; i < keys.length; i += DELETE_CHUNK) {
    const updates = {};
    for (const key of keys.slice(i, i + DELETE_CHUNK)) updates[key] = null;
    await ref.update(updates);
  }
}

// Requires Blaze (pay-as-you-go) plan. Runs daily and deletes:
//  - games with no activity in the last 24 hours. Keying off lastActivityAt
//    (falling back to createdAt for older rooms that never got one) lets a
//    recurring "crew room" survive as long as it gets played at least once a
//    day; only truly abandoned rooms are removed. Both are indexed queries
//    (games/.indexOn: createdAt, lastActivityAt), so only stale rooms are read,
//    not the whole games tree.
//  - public matchmaking listings that expired or whose room is gone/started.
//  - game invites older than 24 hours, or pointing at a room deleted this run.
//  - the results/ record (match epochs, see results.js) of every room deleted
//    this run.
//  - error-telemetry buckets (errors/{UTC day}) older than the last 14 days.
exports.cleanupStaleGames = onSchedule({ schedule: 'every 24 hours', timeoutSeconds: 540 }, async () => {
  const db = getDatabase();
  const now = Date.now();
  const cutoff = now - DAY_MS;
  const gamesRef = db.ref('games');

  // Rooms with a numeric lastActivityAt at or before the cutoff: all stale.
  const idle = await collectKeys(gamesRef, 'lastActivityAt', cutoff, { pick: () => true });
  // Legacy rooms without lastActivityAt: stale by createdAt. Rooms lacking both
  // sort first here and are removed too (as before). Crew rooms created long ago
  // but still active are read and skipped.
  const legacy = await collectKeys(gamesRef, 'createdAt', cutoff, {
    includeMissing: true,
    pick: g => typeof g.lastActivityAt !== 'number',
  });
  const deletedGames = new Set([...idle, ...legacy]);
  await deleteKeys(gamesRef, [...deletedGames]);
  await deleteKeys(db.ref('results'), [...deletedGames]);

  // Listings are few (the lobby shows at most 100), so read them all and check
  // each one's room status directly.
  const listingsRef = db.ref('matchmaking');
  const listings = await listingsRef.get();
  const listingKeys = [];
  if (listings.exists()) {
    const checks = [];
    listings.forEach(child => {
      const listing = child.val() || {};
      if (!listing.expiresAt || listing.expiresAt < now || deletedGames.has(child.key)) {
        listingKeys.push(child.key);
        return;
      }
      checks.push(db.ref(`games/${child.key}/status`).get().then(status => {
        // Missing room (null) or a room that has already started.
        if (status.val() !== 'waiting') listingKeys.push(child.key);
      }));
    });
    await Promise.all(checks);
  }
  await deleteKeys(listingsRef, listingKeys);

  // Invites live under invites/{uid}/{inviteId} with an `at` timestamp. The
  // tree only ever holds about a day of pending invites once this runs, so one
  // read of it is cheap.
  const invitesRef = db.ref('invites');
  const invites = await invitesRef.get();
  const invitePaths = [];
  if (invites.exists()) {
    invites.forEach(inbox => {
      inbox.forEach(invite => {
        const inv = invite.val() || {};
        if (typeof inv.at !== 'number' || inv.at < cutoff || deletedGames.has(inv.gameId)) {
          invitePaths.push(`${inbox.key}/${invite.key}`);
        }
      });
    });
  }
  await deleteKeys(invitesRef, invitePaths);

  // Error reports: keep the last ERROR_RETENTION_DAYS UTC days. Day keys sort
  // in date order, so the key-ordered query reads only the expired buckets.
  const errorsRef = db.ref('errors');
  const cutoffKey = errorsCutoffKey(now);
  const oldErrors = await errorsRef.orderByKey().endAt(cutoffKey).get();
  const errorDays = [];
  oldErrors.forEach(day => {
    if (isExpiredErrorDay(day.key, cutoffKey)) errorDays.push(day.key);
  });
  await deleteKeys(errorsRef, errorDays);

  logger.info(`Deleted ${deletedGames.size} stale games, ${listingKeys.length} public listings, ${invitePaths.length} invites, ${errorDays.length} error-report days`);
});
