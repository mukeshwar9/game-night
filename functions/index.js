const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

initializeApp();

// Requires Blaze (pay-as-you-go) plan. Runs daily and deletes games older than 24 hours.
exports.cleanupStaleGames = onSchedule('every 24 hours', async () => {
  const db = getDatabase();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;

  const snapshot = await db.ref('games')
    .orderByChild('createdAt')
    .endAt(cutoff)
    .get();

  if (!snapshot.exists()) return;

  const deletions = {};
  snapshot.forEach(child => { deletions[child.key] = null; });
  await db.ref('games').update(deletions);

  console.log(`Deleted ${Object.keys(deletions).length} stale games`);
});
