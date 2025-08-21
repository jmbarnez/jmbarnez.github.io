import { database as db } from '../utils/firebaseClient.js';
import { ref, onChildAdded, push, remove, set } from 'firebase/database';

/**
 * Subscribes to new projectiles in a given area.
 * @param {string} areaId - The ID of the area.
 * @param {function} callback - The function to call with new projectile data.
 * @returns {function} The unsubscribe function.
 */
export function subscribeToProjectiles(areaId, callback) {
    const projectilesRef = ref(db, `areas/${areaId}/projectiles`);
    return onChildAdded(projectilesRef, (snapshot) => {
        callback(snapshot.val());
        // Remove the projectile after it has been processed
        remove(snapshot.ref);
    });
}

/**
 * Creates a new projectile in the database.
 * @param {string} areaId - The ID of the area.
 * @param {object} data - The projectile data.
 */
export function createProjectile(areaId, data) {
    const projectilesRef = ref(db, `areas/${areaId}/projectiles`);
    const newProjectileRef = push(projectilesRef);
    return set(newProjectileRef, data);
}