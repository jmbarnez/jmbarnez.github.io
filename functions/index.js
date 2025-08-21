const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { cleanupChat } = require("./cleanup");
exports.cleanupChat = cleanupChat;
// The spawner functions have been deprecated and moved to the dedicated server.
const { onValueWritten } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");

// Lazily initialize the admin SDK to prevent deployment issues.
let app;
function getAdminApp() {
    if (!app) {
        app = admin.initializeApp();
    }
    return app;
}

// DB Health Check
exports.healthDb = onRequest({ cors: true }, async (request, response) => {
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method not allowed' });
    }
    try {
        // A simple check to see if the function can be invoked
        return response.status(200).json({ ok: true });
    } catch (error) {
        logger.error('DB health check failed:', error?.message || error);
        return response.status(500).json({ ok: false });
    }
});

// Removed username/reCAPTCHA callables. Email-only auth now.

// Mirror RTDB presence to Firestore players/{uid}.isOnline for robust presence
exports.mirrorPresenceToFirestore = onValueWritten({ ref: "/status/{uid}" }, async (event) => {
  try {
    const uid = event.params.uid;
    const after = event.data?.after?.val() || {};
    const isOnline = after?.state === 'online';

    const db = admin.firestore();
    await db.collection('players').doc(uid).set(
      {
        isOnline,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (e) {
    logger.error('mirrorPresenceToFirestore error', e?.message || e);
  }
});
