import { database as db } from '../utils/firebaseClient.js';
import { ref, onValue } from 'firebase/database';
import { game } from '../game/core.js';
import { addItemToInventory } from '../ui/inventory.js';
import { playPickupSound } from '../utils/sfx.js';
import { experienceManager } from '../game/experienceManager.js';
import { showItemPickupMessage } from '../game/groundItemUI.js';
import { auth } from '../utils/firebaseClient.js';

/**
 * Ground Items Service
 *
 * SERVER-CLIENT SYNCHRONIZATION ARCHITECTURE:
 * ===========================================
 *
 * SERVER RESPONSIBILITIES:
 * - Manages ground item persistence in Firebase RTDB
 * - Handles loot dropping from enemy deaths
 * - Processes pickup transactions with atomic operations
 * - Validates pickup distance and ownership restrictions
 * - Removes items from ground after successful pickup
 *
 * CLIENT RESPONSIBILITIES:
 * - Subscribes to ground items via Firebase RTDB
 * - Maintains local game.groundItems array for rendering
 * - Handles immediate visual feedback for pickup attempts
 * - Updates local state only after server confirms transaction
 * - Provides canvas-based highlighting via highlightManager
 *
 * SYNCHRONIZATION FLOW:
 * 1. Server drops loot → Firebase RTDB updated
 * 2. Client receives update → game.groundItems synchronized
 * 3. Player attempts pickup → Client calls server API
 * 4. Server validates and processes → Firebase transaction
 * 5. Server confirms success → Client removes from local state
 * 6. Client grants item to inventory → Visual/audio feedback
 *
 * CONCURRENCY CONTROL:
 * - Firebase transactions prevent duplicate pickups
 * - Server-side distance validation prevents exploits
 * - Optimistic locking ensures atomic operations
 * - Failed transactions are automatically retried
 *
 * LOCAL STATE MANAGEMENT:
 * - game.groundItems is the single source of truth for rendering
 * - Items are added/removed based on Firebase RTDB changes
 * - Local pickup attempts are validated by server before state changes
 * - Death animations and visual effects are handled locally
 */

/**
 * Subscribes to ground items for the current area.
 * Follows the same pattern as subscribeToEnemies for clean change propagation.
 *
 * SERVER SYNCHRONIZATION:
 * - Listens to areas/{areaId}/groundItems via Firebase RTDB
 * - Automatically syncs local game.groundItems with server state
 * - Handles item additions, updates, and removals
 * - Maintains real-time consistency across all clients
 *
 * @param {string} areaId - The ID of the area to subscribe to (e.g., 'beach')
 * @returns {function} The unsubscribe function to stop listening
 */
export function subscribeGroundItems(areaId) {
    console.log(`[GROUND_ITEMS] Subscribing to ground items for area: ${areaId}`);

    const groundItemsRef = ref(db, `areas/${areaId}/groundItems`);

    return onValue(groundItemsRef, (snapshot) => {
        const groundItemsData = snapshot.val() || {};

        console.log(`[GROUND_ITEMS] Received ${Object.keys(groundItemsData).length} ground items from server`);

        // Get current player ID for visibility filtering
        const currentPlayerId = auth.currentUser?.uid;

        if (!currentPlayerId) {
            console.warn('[GROUND_ITEMS] No authenticated user, cannot filter items by visibility');
            game.groundItems = [];
            return;
        }

        // Convert Firebase data structure to array format for game rendering
        // Only include items that are visible to the current player
        const allGroundItems = Object.entries(groundItemsData).map(([id, item]) => ({
            id,
            ...item
        }));

        // Filter items based on visibility restrictions
        const visibleItems = allGroundItems.filter(item => {
            // If item has visibleTo array, check if current player is included
            if (item.visibleTo && Array.isArray(item.visibleTo)) {
                const isVisible = item.visibleTo.includes(currentPlayerId);
                if (!isVisible) {
                    console.log(`[GROUND_ITEMS] Filtering out item ${item.id} - not visible to player ${currentPlayerId}`);
                }
                return isVisible;
            }

            // Fallback to old ownership system for backward compatibility
            if (item.ownerId) {
                const isVisible = item.ownerId === currentPlayerId;
                if (!isVisible) {
                    console.log(`[GROUND_ITEMS] Filtering out item ${item.id} - owned by ${item.ownerId}, player is ${currentPlayerId}`);
                }
                return isVisible;
            }

            // If no ownership/visibility restrictions, item is visible to everyone
            return true;
        });

        // Update game state with filtered visible items
        game.groundItems = visibleItems;

        console.log(`[GROUND_ITEMS] Updated local game.groundItems: ${game.groundItems.length} visible items (filtered from ${allGroundItems.length} total)`);
    });
}

/**
 * Attempts to pick up a ground item.
 * Calls server transaction and only removes items from game.groundItems after successful transaction.
 *
 * SERVER TRANSACTION FLOW:
 * 1. Client calls server API with item details
 * 2. Server validates distance and ownership
 * 3. Server uses Firebase transaction for atomic pickup
 * 4. Server removes item from ground if valid
 * 5. Server confirms success to client
 * 6. Client updates local state and grants item
 *
 * @param {string} itemId - The ID of the ground item to pick up
 * @param {string} playerId - The ID of the player attempting pickup
 * @param {number} playerX - Player's current X position for distance validation
 * @param {number} playerY - Player's current Y position for distance validation
 * @returns {Promise<boolean>} Success status of pickup attempt
 */
export async function pickupGroundItem(itemId, playerId, playerX, playerY) {
    // Ensure playerId is never undefined
    const safePlayerId = playerId || 'anonymous';

    console.log(`[PICKUP] Attempting to pick up item ${itemId} for player ${safePlayerId}`);
    console.log(`[PICKUP] Request data:`, { itemId, safePlayerId, playerX, playerY });

    // Validate required fields before sending
    if (!itemId || !safePlayerId || typeof playerX !== 'number' || typeof playerY !== 'number') {
        console.error(`[PICKUP] Invalid parameters:`, { itemId, safePlayerId, playerX, playerY });
        return false;
    }

    try {
        // Call server API for pickup processing
        const response = await fetch('http://localhost:8081/pickup-item', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                itemId,
                playerId: safePlayerId,
                playerX,
                playerY
            })
        });

        console.log(`[PICKUP] Server response status: ${response.status}`);

        const result = await response.json();

        if (result.success) {
            console.log(`[PICKUP] Server confirmed pickup of item ${itemId}`);

            // Find the item in local state to get its details
            const pickedUpItem = game.groundItems.find(item => item.id === itemId);

            if (pickedUpItem) {
                // Grant item to player inventory
                const added = addItemToInventory(pickedUpItem.type, pickedUpItem.count || 1);

                if (added) {
                    // Play pickup sound for successful inventory addition
                    playPickupSound();

                    // Grant experience for collecting resources
                    experienceManager.addResourceExp(pickedUpItem.type);

                    console.log(`[PICKUP] Successfully granted ${pickedUpItem.count || 1}x ${pickedUpItem.type} to player ${safePlayerId}`);
                } else {
                    console.warn(`[PICKUP] Failed to add ${pickedUpItem.type} to inventory - may be full`);
                }

                // Show floating pickup message for visual feedback
                showItemPickupMessage(pickedUpItem.type, pickedUpItem.count || 1, pickedUpItem.x, pickedUpItem.y);

                // Remove item from local state after successful server transaction
                // The Firebase subscription will also remove it, but we do it immediately for responsive UX
                game.groundItems = game.groundItems.filter(item => item.id !== itemId);
                console.log(`[PICKUP] Removed item ${itemId} from local game state`);
            }

            return true;
        } else {
            console.log(`[PICKUP] Server rejected pickup of item ${itemId}: ${result.error}`);
            return false;
        }

    } catch (error) {
        console.error(`[PICKUP] Error picking up item ${itemId}:`, error);
        return false;
    }
}

/**
 * Gets the current ground items for rendering.
 * This is a convenience function that returns the current game.groundItems array.
 *
 * @returns {Array} Array of ground item objects for rendering
 */
export function getGroundItems() {
    return game.groundItems || [];
}

/**
 * Tracks damage dealt by a player to an enemy.
 * This is used to determine if ground items should be shared among multiple contributors.
 *
 * @param {string} enemyId - ID of the enemy that was damaged
 * @param {number} damage - Amount of damage dealt
 * @returns {Promise<boolean>} Success status of damage tracking
 */
export async function trackDamage(enemyId, damage) {
    const playerId = auth.currentUser?.uid;
    if (!playerId) {
        console.warn('[DAMAGE_TRACK] No authenticated user, skipping damage tracking');
        return false;
    }

    if (!enemyId || typeof damage !== 'number' || damage < 0) {
        console.error('[DAMAGE_TRACK] Invalid parameters:', { enemyId, damage });
        return false;
    }

    // Resilient client tracking: retry transient failures, avoid retrying on 410/404
    const maxAttempts = 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
        attempt += 1;
        try {
            console.log(`[DAMAGE_TRACK] Attempt ${attempt}: tracking ${damage} damage from player ${playerId} to enemy ${enemyId}`);

            const response = await fetch('http://localhost:8081/track-damage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enemyId, playerId, damage })
            });

            // parse JSON safely
            let result;
            try { result = await response.json(); } catch (e) { result = { success: false, error: 'invalid_json' }; }

            if (response.status === 200 && result && result.success) {
                console.log(`[DAMAGE_TRACK] Successfully tracked damage for enemy ${enemyId} (attempt ${attempt})`);
                return true;
            }

            // Non-retriable: enemy gone/processed
            if (response.status === 410 || response.status === 404) {
                console.warn(`[DAMAGE_TRACK] Enemy ${enemyId} gone/processed (status ${response.status}):`, result.error || '');
                return false;
            }

            // Transient server error: retry with exponential backoff
            if (response.status === 503 || response.status === 500) {
                const backoff = 50 * Math.pow(2, attempt);
                console.warn(`[DAMAGE_TRACK] Transient server error (status ${response.status}), backing off ${backoff}ms`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }

            // Other responses: treat as rejection
            console.warn(`[DAMAGE_TRACK] Server rejected damage tracking for enemy ${enemyId}:`, result.error || response.status);
            return false;

        } catch (err) {
            // Network/fetch error: retry
            const backoff = 50 * Math.pow(2, attempt);
            console.error(`[DAMAGE_TRACK] Network error on attempt ${attempt}:`, err, `backing off ${backoff}ms`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
        }
    }

    console.error(`[DAMAGE_TRACK] Exhausted ${maxAttempts} attempts to track damage for enemy ${enemyId}`);
    return false;
}

/**
 * Checks if a ground item can be picked up by a player.
 * This is a client-side validation for UI feedback before attempting server pickup.
 *
 * @param {Object} item - The ground item to check
 * @param {number} playerX - Player's current X position
 * @param {number} playerY - Player's current Y position
 * @param {number} maxDistance - Maximum pickup distance (default: 50)
 * @returns {boolean} Whether the item can be picked up
 */
export function canPickupItem(item, playerX, playerY, maxDistance = 50) {
    if (!item) return false;

    const distance = Math.hypot(item.x - playerX, item.y - playerY);
    return distance <= maxDistance;
}

/**
 * Checks if a specific ground item is visible to the current player.
 * Used for interaction validation before attempting pickup.
 *
 * VISIBILITY LOGIC:
 * - Items with `visibleTo` array are only visible to players in that array
 * - Items with `ownerId` are only visible to that specific player (backward compatibility)
 * - Items without restrictions are visible to everyone
 *
 * @param {Object} item - The ground item to check
 * @param {string} playerId - The player ID to check visibility for
 * @returns {boolean} Whether the item is visible to the specified player
 */
export function isItemVisibleToPlayer(item, playerId) {
    if (!item || !playerId) {
        return false;
    }

    // If item has visibleTo array, check if player is included
    if (item.visibleTo && Array.isArray(item.visibleTo)) {
        return item.visibleTo.includes(playerId);
    }

    // Fallback to old ownership system for backward compatibility
    if (item.ownerId) {
        return item.ownerId === playerId;
    }

    // If no ownership/visibility restrictions, item is visible to everyone
    return true;
}

/**
 * Gets ground items that are visible to a specific player.
 * Used for filtering items before display or interaction.
 *
 * @param {string} playerId - The player ID to filter for
 * @param {Array} items - Array of ground items to filter (defaults to game.groundItems)
 * @returns {Array} Array of items visible to the specified player
 */
export function getItemsVisibleToPlayer(playerId, items = null) {
    const itemArray = items || game.groundItems || [];

    return itemArray.filter(item => isItemVisibleToPlayer(item, playerId));
}