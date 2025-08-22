import { sendDamageRequest } from './enemyService.js';

/**
 * Projectile service - lightweight helper for guaranteed-hit attacks.
 *
 * Projectiles are rendered client-side. For authoritative damage apply,
 * call `sendGuaranteedHit` which writes a damage request via the enemy service.
 */

/**
 * Send an authoritative guaranteed-hit attack (server processes damage).
 * @param {string} areaId
 * @param {string} enemyId
 * @param {string} uid
 * @param {number} damage
 * @returns {Promise<object>} Resolves with damage result from server function
 */
export function sendGuaranteedHit(areaId, enemyId, uid, damage) {
    return sendDamageRequest(areaId, enemyId, uid, damage);
}

/**
 * Legacy stub: subscribeToProjectiles is no longer recommended.
 * Use client-side visuals instead.
 */
export function subscribeToProjectiles(areaId, callback) {
    console.warn('subscribeToProjectiles is deprecated; use client-side projectile rendering.');
    return () => {};
}

/**
 * Legacy stub: createProjectile is deprecated. Spawn visuals locally via game/projectiles.js
 */
export function createProjectile(/* areaId, data */) {
    console.warn('createProjectile (service) deprecated; spawn projectiles locally in game code');
    return Promise.resolve(false);
}