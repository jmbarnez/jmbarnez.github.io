import { database as db } from '../utils/firebaseClient.js';
import { ref, onValue, set, remove, update, push } from 'firebase/database';

// Local dev server toggle (set VITE_LOCAL_SERVER_URL to e.g. http://localhost:8081)
const LOCAL_SERVER_URL = (import.meta.env && import.meta.env.VITE_LOCAL_SERVER_URL) ? String(import.meta.env.VITE_LOCAL_SERVER_URL).replace(/\/$/, '') : null;

/**
 * Subscribes to enemy data for the current area.
 * @param {string} areaId - The ID of the area to subscribe to.
 * @param {function} callback - The function to call with enemy data.
 * @returns {function} The unsubscribe function.
 */
export function subscribeToEnemies(areaId, callback) {
    const enemiesRef = ref(db, `areas/${areaId}/enemies`);
    return onValue(enemiesRef, (snapshot) => {
        callback(snapshot.val());
    });
}

/**
 * Updates an enemy's data in the database.
 * Note: Server manages enemies via WebSocket, client should not directly update.
 * @param {string} areaId - The ID of the area.
 * @param {string} enemyId - The ID of the enemy.
 * @param {object} data - The data to update.
 */
export function updateEnemy(areaId, enemyId, data) {
    // Server manages enemy updates via WebSocket, client should not directly update
    // This function is kept for compatibility but should not be used in server-authoritative model
    const enemyRef = ref(db, `areas/${areaId}/enemies/${enemyId}`);
    return update(enemyRef, data);
}

/**
 * Send an authoritative damage request. Writes a request under /actions/damageRequests/{areaId}/{reqId}
 * and returns a promise that resolves when a result is written to /actions/damageResults/{areaId}/{reqId}.
 * @param {string} areaId
 * @param {string} enemyId
 * @param {string} uid
 * @param {number} damage
 */
export function sendDamageRequest(areaId, enemyId, uid, damage) {
    // If a local server URL is configured, POST to its /track-damage endpoint for local dev
    if (LOCAL_SERVER_URL) {
        const url = `${LOCAL_SERVER_URL}/track-damage`;
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enemyId, playerId: uid, damage })
        }).then(async (res) => {
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json && json.error ? json.error : `status_${res.status}`);
            return json;
        });
    }

    const reqRef = push(ref(db, `actions/damageRequests/${areaId}`));
    const reqId = reqRef.key;
    const payload = { enemyId, uid, damage, ts: Date.now() };
    return set(reqRef, payload).then(() => {
        // wait for result at /actions/damageResults/{areaId}/{reqId}
        return new Promise((resolve, reject) => {
            const resRef = ref(db, `actions/damageResults/${areaId}/${reqId}`);
            const off = onValue(resRef, (snap) => {
                if (snap.exists()) {
                    off();
                    resolve(snap.val());
                }
            }, { onlyOnce: false });

            // timeout after 5s
            setTimeout(() => {
                off();
                reject(new Error('damage_result_timeout'));
            }, 5000);
        });
    });
}

/**
 * Removes an enemy from the database.
 * Note: Server manages enemy removal via WebSocket, client should not directly remove.
 * @param {string} areaId - The ID of the area.
 * @param {string} enemyId - The ID of the enemy.
 */
export function removeEnemy(areaId, enemyId) {
    // Server manages enemy removal via WebSocket, client should not directly remove
    // This function is kept for compatibility but should not be used in server-authoritative model
    const enemyRef = ref(db, `areas/${areaId}/enemies/${enemyId}`);
    return remove(enemyRef);
}