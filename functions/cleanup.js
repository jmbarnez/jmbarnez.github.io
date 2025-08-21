// AI: This file contains the logic for a scheduled Cloud Function that cleans up old chat messages.
// This is the standard approach for handling data retention in the Firebase Realtime Database,
// as it does not have a built-in TTL (Time-to-Live) feature like Firestore.

// AI: Updated to use 2nd generation Firebase Functions syntax for scheduled functions.
// AI: Updated to use 2nd generation Firebase Functions syntax for scheduled functions.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

// AI: Removed admin.initializeApp() from here as it's already initialized in functions/index.js.

// AI: This function is scheduled to run frequently to enforce a short chat retention policy.
// Be careful: running this every 2 minutes and deleting messages older than 2 minutes
// is aggressive and will remove chat history quickly. Adjust RETENTION_MS as needed.
// AI: Increased retention to 10 minutes to reduce the frequency of database write operations
// and Cloud Function invocations, optimizing Firebase data usage.
const RETENTION_MINUTES = 10; // retention window in minutes
const RETENTION_MS = RETENTION_MINUTES * 60 * 1000;

// Schedule: run every 2 minutes. The scheduler supports human-readable intervals.
// If your deployment environment requires a cron expression, replace the string
// with the appropriate cron (e.g. '*/2 * * * *').
exports.cleanupChat = onSchedule("every 10 minutes", async (event) => {
  const now = Date.now();
  const cutoff = now - RETENTION_MS; // messages older than this will be removed

  const messagesRef = admin.database().ref("/globalChat/messages");

  // Query for messages with a timestamp older than cutoff.
  const oldMessagesQuery = messagesRef.orderByChild("ts").endAt(cutoff);

  try {
    const snapshot = await oldMessagesQuery.once("value");
    const updates = {};
    snapshot.forEach(child => {
      // Mark for deletion
      updates[child.key] = null; // setting to null removes the key
    });

    // If there are items to delete, perform a single multi-path update
    if (Object.keys(updates).length > 0) {
      await messagesRef.update(updates);
    }

    console.log(`Chat cleanup completed. Removed ${Object.keys(updates).length} messages older than ${RETENTION_MINUTES} minutes.`);
    return null;
  } catch (error) {
    console.error("Error during chat cleanup:", error);
    return null;
  }
});
