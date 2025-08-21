import { database as db } from '../utils/firebaseClient.js';
import { ref, onValue, set, remove, update } from 'firebase/database';

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