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
  if (!snapshot.exists()) return;

  const deletions = {};
  let count = 0;
  snapshot.forEach(child => {
    const g = child.val() || {};
    const lastActive = g.lastActivityAt ?? g.createdAt ?? 0;
    if (lastActive < cutoff) { deletions[child.key] = null; count++; }
  });

  if (count) await db.ref('games').update(deletions);
  console.log(`Deleted ${count} stale games`);
});
