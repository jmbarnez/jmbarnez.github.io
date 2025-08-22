import { database } from '../utils/firebaseClient.js';
import { ref, get, set, update, onValue, onChildAdded, query, orderByChild, limitToLast, equalTo, serverTimestamp, off } from 'firebase/database';

/**
 * Sets up a real-time listener for a player's document.
 * @param {string} uid - The user's ID.
 * @param {function} callback - The function to call with the player data.
 * @returns {import('firebase/firestore').Unsubscribe} - The unsubscribe function for the listener.
 */
export function onPlayerDataChange(uid, callback) {
  const r = ref(database, `players/${uid}`);
  return onValue(r, (snap) => {
    callback(snap.val() || {});
  });
}

/**
 * Ensures a player document exists in Firestore, creating it if it doesn't.
 * @param {string} uid - The user's ID.
 * @returns {Promise<void>}
 */
export async function ensurePlayerDoc(uid, username) {
  const playerRef = ref(database, `players/${uid}`);
  const snap = await get(playerRef);
  let desiredUsername = (username || '').trim();
  if (!desiredUsername) desiredUsername = 'Anonymous';
  if (!snap.exists()) {
    await set(playerRef, {
      username: desiredUsername,
      hp: 100, hpMax: 100,
      mp: 50, mpMax: 50,
      sta: 100, staMax: 100,
      muted: false,
      inventory: Array(24).fill(null),
      gold: 0,
      isOnline: false,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const current = snap.val() || {};
    const currentUsername = (current.username || '').trim();
    const hasBetterUsername = desiredUsername && desiredUsername !== 'Anonymous';
    const needsUpdate = hasBetterUsername && desiredUsername !== currentUsername;
    if (needsUpdate) {
      await update(playerRef, {
        username: desiredUsername,
        updatedAt: serverTimestamp(),
      });
    }
  }
}

/**
 * Sets up a real-time listener for chat messages.
 * @param {function} callback - The function to call with the array of messages.
 * @returns {import('firebase/firestore').Unsubscribe} - The unsubscribe function for the listener.
 */
export function onChatMessages(callback) {
  const qRef = query(ref(database, 'globalChat/messages'), orderByChild('ts'), limitToLast(50));
  return onValue(qRef, (snap) => {
    const list = [];
    snap.forEach((child) => {
      const v = child.val();
      list.push({ id: child.key, ...v });
    });
    callback(list); // already ascending by ts
  });
}

/**
 * Sends a new chat message to Firestore.
 * @param {string} text - The message content.
 * @param {import('firebase/auth').User} user - The user sending the message.
 * @returns {Promise<void>}
 */
export async function sendChatMessage(text, user, username) {
  const messagesRef = ref(database, 'globalChat/messages');
  const newKey = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await set(ref(database, `globalChat/messages/${newKey}`), {
    text: text,
    uid: user.uid,
    username: username || user.displayName || 'Anonymous',
    ts: serverTimestamp(),
  });
}

/**
 * Creates a user profile document in Firestore upon registration.
 * @param {string} uid - The user's ID.
 * @param {string} email - The user's email.
 * @param {string} username - The user's chosen username.
 * @returns {Promise<void>}
 */
export async function createUserProfile(uid, email, username) {
  await set(ref(database, `users/${uid}`), {
    email: email,
    username: username,
    createdAt: new Date().toISOString()
  });
}

/**
 * Updates a player's online status.
 * @param {string} uid - The user's ID.
 * @param {boolean} isOnline - The player's online status.
 * @returns {Promise<void>}
 */
export function updatePlayerOnlineStatus(uid, isOnline) {
  const playerRef = ref(database, `players/${uid}`);
  return update(playerRef, { isOnline, lastSeen: serverTimestamp(), updatedAt: serverTimestamp() });
}

/**
 * Get player's gold amount.
 * @param {string} uid
 * @returns {Promise<number>}
 */
export async function getPlayerGold(uid) {
  const playerRef = ref(database, `players/${uid}/gold`);
  const snap = await get(playerRef);
  return snap.exists() ? snap.val() : 0;
}

/**
 * Set player's gold amount.
 * @param {string} uid
 * @param {number} amount
 */
export function setPlayerGalacticTokens(uid, amount) {
  const playerRef = ref(database, `players/${uid}`);
  return update(playerRef, { galacticTokens: amount, updatedAt: serverTimestamp() });
}

// Legacy function for backward compatibility
export function setPlayerGold(uid, amount) {
  return setPlayerGalacticTokens(uid, amount);
}

/**
 * Sets up a real-time listener for online players.
 * @param {function} callback - The function to call with the array of online players.
 * @returns {import('firebase/firestore').Unsubscribe} - The unsubscribe function for the listener.
 */
export function onOnlinePlayersChange(callback) {
  const qRef = query(ref(database, 'players'), orderByChild('isOnline'), equalTo(true));
  return onValue(qRef, (snap) => {
    const arr = [];
    snap.forEach((child) => {
      arr.push({ id: child.key, ...(child.val() || {}) });
    });
    callback(arr);
  });
}

/**
 * Update the player's area presence and lightweight state (position/action).
 * @param {string} uid
 * @param {{ areaId?: string, ax?: number, ay?: number, action?: string|null }} data
 */
export function updatePlayerAreaState(uid, data) {
  const playerRef = ref(database, `players/${uid}`);
  const payload = { updatedAt: serverTimestamp() };
  if (data.areaId !== undefined) payload.areaId = data.areaId;
  if (data.ax !== undefined) payload.ax = data.ax;
  if (data.ay !== undefined) payload.ay = data.ay;
  if (data.axn !== undefined) payload.axn = data.axn;
  if (data.ayn !== undefined) payload.ayn = data.ayn;
  if (data.action !== undefined) payload.action = data.action;
  if (data.lastSaved !== undefined) payload.lastSaved = data.lastSaved;
  return update(playerRef, payload);
}

/**
 * Persist full inventory array to the player's document.
 * @param {string} uid
 * @param {Array} inventory
 */
export function setPlayerInventory(uid, inventory) {
  const playerRef = ref(database, `players/${uid}`);
  return update(playerRef, {
    inventory: Array.isArray(inventory) ? inventory : [],
    updatedAt: serverTimestamp(),
  });
}

/**
 * Persist player's skills XP object to their document.
 * We store raw XP values (not levels) so level can be derived via math.
 * @param {string} uid
 * @param {object} skills - e.g. { mining: { experience: 123 }, fishing: { experience: 45 } }
 */
export function setPlayerSkills(uid, skillsData) {
  const playerRef = ref(database, `players/${uid}`);
  // AI: This payload now only stores experience-related data.
  // Levels are calculated on the client-side from this raw experience data.
  const payload = {
    skills: skillsData.skills || {},
    totalExperience: skillsData.experience || 0,
    updatedAt: serverTimestamp(),
  };
  return update(playerRef, payload);
}

/**
 * Fetch player's skills object from their document.
 * @param {string} uid
 */
export async function getPlayerSkills(uid) {
  const playerRef = ref(database, `players/${uid}`);
  const snap = await get(playerRef);
  if (!snap.exists()) return null;

  const playerData = snap.val();
  // AI: Only return experience data. Level is derived on the client.
  return {
    skills: playerData.skills || {},
    totalExperience: playerData.totalExperience || 0,
  };
}

/**
 * AI: Fetches a player's inventory from their document.
 * @param {string} uid - The user's ID.
 * @returns {Promise<Array|null>} - The player's inventory array or null if not found.
 */
export async function getPlayerInventory(uid) {
  const playerRef = ref(database, `players/${uid}/inventory`);
  const snap = await get(playerRef);
  return snap.exists() ? snap.val() : null;
}
