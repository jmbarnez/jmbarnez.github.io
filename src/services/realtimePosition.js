import { database } from '../utils/firebaseClient.js';
import { ref, onDisconnect, update, set, serverTimestamp, onChildAdded, onChildChanged, onChildRemoved, runTransaction } from 'firebase/database';
import { showPlayerMessage, hidePlayerBubble, showPlayerTyping } from '../game/character.js'; // AI: Import functions for displaying and hiding player chat bubbles, and showing typing indicators.

function playerRef(areaId, uid) {
  return ref(database, `areas/${areaId}/players/${uid}`);
}

export async function joinArea(areaId, uid, initial) {
  try {
    const r = playerRef(areaId, uid);
    // Explicitly remove any existing stale data first to avoid duplicates
    await set(r, null);
    // Set up disconnect cleanup so RTDB will remove the presence when the client disconnects
    await onDisconnect(r).remove();
    // Set initial presence data for this player in the area
    await set(r, { ...(initial || {}), ts: serverTimestamp() });
  } catch (_) {}
}

export async function updateAreaPlayer(areaId, uid, data) {
  try {
    const r = playerRef(areaId, uid);
    await update(r, { ...(data || {}), ts: serverTimestamp() });
  } catch (_) {}
}

export function subscribeAreaPlayers(areaId, onEvent) {
  const base = ref(database, `areas/${areaId}/players`);
  const added = onChildAdded(base, (snap) => {
    const uid = snap.key;
    const val = snap.val() || {};
    onEvent && onEvent({ type: 'added', uid, data: val });
  });
  const changed = onChildChanged(base, (snap) => {
    const uid = snap.key;
    const val = snap.val() || {};

    // AI: Enhanced change handling with better session and message tracking
    // Only pass through changes that are meaningful for the multiplayer system
    // Consider projectileEvent changes relevant so remote clients receive projectile events
    const hasRelevantChange = val.chat || val.typing !== undefined ||
                             (val.ax !== undefined && val.ay !== undefined) ||
                             val.action !== undefined || val.angle !== undefined ||
                             (val.projectileEvent !== undefined);

    if (hasRelevantChange) {
      // AI: Add session tracking to help with stale detection
      if (!val.sessionStart && val.lastUpdate) {
        val.sessionStart = val.lastUpdate; // Fallback for older data
      }

      // AI: For chat messages, add additional validation
      if (val.chat) {
        const messageAge = Date.now() - (val.lastUpdate || 0);
        const isRecent = messageAge < 10000; // 10 seconds (reasonable window)

        if (!isRecent) {
          console.debug(`Firebase: Ignoring old chat message from ${uid} (${messageAge}ms old)`);
          return; // Don't process old chat messages at Firebase level
        }

        // AI: Ensure message ID exists for deduplication
        if (!val.messageId) {
          val.messageId = `${uid}_${val.chat}_${val.lastUpdate || Date.now()}`;
        }
      }

      onEvent && onEvent({ type: 'changed', uid, data: val });
    }
  });
  const removed = onChildRemoved(base, (snap) => {
    const uid = snap.key;
    onEvent && onEvent({ type: 'removed', uid });
  });
  return () => { try { added(); } catch (_) {}; try { changed(); } catch (_) {}; try { removed(); } catch (_) {}; };
}

/**
 * Clear the ephemeral chat fields only if the current messageId matches the one provided.
 * This avoids races where a generic 'clear chat' update could remove a newer message
 * or trigger client-side echo loops.
 */
export async function clearAreaChatIfMatches(areaId, uid, messageId) {
  try {
    const r = playerRef(areaId, uid);
    const res = await runTransaction(r, (current) => {
      if (!current) return current; // nothing to do
      // If messageId doesn't match, abort - someone else updated it
      if (!current.messageId || current.messageId !== messageId) return;
      // Clear the ephemeral fields
      current.chat = null;
      current.messageId = null;
      current.ts = serverTimestamp();
      return current;
    });
    return res.committed;
  } catch (e) {
    console.warn('clearAreaChatIfMatches failed', e);
    return false;
  }
}
