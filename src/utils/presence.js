import { auth, database } from './firebaseClient.js';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onDisconnect, set, serverTimestamp, update } from 'firebase/database';

/**
 * Initialize robust presence using Firebase Realtime Database.
 * - Writes to both `/status/{uid}` and `/players/{uid}` for compatibility.
 * - Registers onDisconnect handler to flip to offline if the tab dies.
 * - Sets up heartbeat to keep presence fresh.
 */
export function initRealtimePresence() {
  try {
    let heartbeatInterval = null;
    
    onAuthStateChanged(auth, async (user) => {
      try {
        // Clear any existing heartbeat
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        if (!user) return;

        const myStatusRef = ref(database, `status/${user.uid}`);
        const myPlayerRef = ref(database, `players/${user.uid}`);

        // What to set while online
        const onlinePayload = {
          state: 'online',
          last_changed: serverTimestamp(),
        };
        const playerOnlinePayload = {
          isOnline: true,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // What to set when offline (via onDisconnect)
        const offlinePayload = {
          state: 'offline',
          last_changed: serverTimestamp(),
        };
        const playerOfflinePayload = {
          isOnline: false,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // Ensure onDisconnect is set first, then set current state to online
        await onDisconnect(myStatusRef).set(offlinePayload);
        await onDisconnect(myPlayerRef).update(playerOfflinePayload);
        
        await update(myStatusRef, onlinePayload);
        await update(myPlayerRef, playerOnlinePayload);

        // Set up heartbeat to refresh presence every 10 seconds
        heartbeatInterval = setInterval(async () => {
          try {
            await update(myPlayerRef, {
              lastSeen: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch (_) {
            // Ignore heartbeat errors
          }
        }, 10000);

      } catch (_) {
        // Presence is best-effort; ignore errors
      }
    });
  } catch (_) {
    // Ignore if auth/database not available (SSR or test)
  }
}

