const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

initializeApp();

// Requires Blaze (pay-as-you-go) plan. Runs daily and deletes games with no
// activity in the last 24 hours. Keying off lastActivityAt (falling back to
// createdAt for older rooms) lets a recurring "crew room" survive as long as it
// gets played at least once a day; only truly abandoned rooms are removed.
exports.cleanupStaleGames = onSchedule('every 24 hours', async () => {
  const db = getDatabase();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  // Scan all games and filter by last activity (a single orderByChild can't
  // express the lastActivityAt-or-createdAt fallback; the room set is small).
  const snapshot = await db.ref('games').get();
  const gameDeletions = {};
  let count = 0;
  snapshot.forEach(child => {
    const g = child.val() || {};
    const lastActive = g.lastActivityAt ?? g.createdAt ?? 0;
    if (lastActive < cutoff) { gameDeletions[child.key] = null; count++; }
  });

  const listings = await db.ref('matchmaking').get();
  let listingCount = 0;
  if (listings.exists()) listings.forEach(child => {
    const listing = child.val() || {};
    if (!listing.expiresAt || listing.expiresAt < Date.now() || gameDeletions[child.key] || !snapshot.child(child.key).exists() || snapshot.child(child.key).child('status').val() !== 'waiting') {
      listingCount++;
    }
  });

  if (count) await db.ref('games').update(gameDeletions);
  const listingDeletions = {};
  if (listings.exists()) listings.forEach(child => {
    const listing = child.val() || {};
    if (!listing.expiresAt || listing.expiresAt < Date.now() || gameDeletions[child.key] || !snapshot.child(child.key).exists() || snapshot.child(child.key).child('status').val() !== 'waiting') listingDeletions[child.key] = null;
  });
  if (listingCount) await db.ref('matchmaking').update(listingDeletions);
  console.log(`Deleted ${count} stale games and ${listingCount} public listings`);
});
