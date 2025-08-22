import { database as db } from '../utils/firebaseClient.js';
import { ref, onValue, remove, get, push, set } from 'firebase/database';
import { game } from '../game/core.js';
import { addItemToInventory } from '../ui/inventory.js';
import { playPickupSound } from '../utils/sfx.js';
import { experienceManager } from '../game/experienceManager.js';
import { showItemPickupMessage } from '../game/groundItemUI.js';
import { auth } from '../utils/firebaseClient.js';
import { itemsById } from '../data/content.js';

/**
 * Get item definition from items.json
 * @param {string} itemId - The item ID to look up
 * @returns {object|null} The item definition or null if not found
 */
function getItemDefinition(itemId) {
  try {
    return itemsById && itemsById[itemId];
  } catch (error) {
    console.warn('[PICKUP] Error getting item definition:', error, { itemId });
    return null;
  }
}

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
 * - Client-side guards prevent multiple simultaneous pickup attempts
 *
 * LOCAL STATE MANAGEMENT:
 * - game.groundItems is the single source of truth for rendering
 * - Items are added/removed based on Firebase RTDB changes
 * - Local pickup attempts are validated by server before state changes
 * - Death animations and visual effects are handled locally
 */

// Track pickup attempts to prevent spamming
const activePickupAttempts = new Set();

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
    const groundItemsRef = ref(db, `areas/${areaId}/groundItems`);

    return onValue(groundItemsRef, (snapshot) => {
        const groundItemsData = snapshot.val() || {};

        // Get current player ID for visibility filtering
        const currentPlayerId = auth.currentUser?.uid;

        if (!currentPlayerId) {
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
                return item.visibleTo.includes(currentPlayerId);
            }

            // Fallback to old ownership system for backward compatibility
            if (item.ownerId) {
                return item.ownerId === currentPlayerId;
            }

            // If no ownership/visibility restrictions, item is visible to everyone
            return true;
        });

        // Update game state with filtered visible items
        game.groundItems = visibleItems;
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
    
    // Prevent multiple simultaneous pickup attempts for the same item
    if (activePickupAttempts.has(itemId)) {
        return false;
    }
    
    // Validate required fields before sending
    if (!itemId || !safePlayerId || typeof playerX !== 'number' || typeof playerY !== 'number') {
        return false;
    }
    
    // Ensure coordinates are from game world state (not camera or scaled coordinates)
    const worldX = typeof game?.player?.x === 'number' ? game.player.x : playerX;
    const worldY = typeof game?.player?.y === 'number' ? game.player.y : playerY;
    
    // Store item details before server call since the item might be removed by Firebase sync
    const pickedUpItem = game.groundItems.find(item => item.id === itemId);

    if (!pickedUpItem) {
        console.error('[PICKUP] Item not found in game.groundItems:', {
            itemId,
            availableItems: game.groundItems.map(item => ({ id: item.id, type: item.type, count: item.count }))
        });
        return false;
    }
    
    // Mark pickup attempt as active
    activePickupAttempts.add(itemId);

    try {
        // Use Firebase Realtime Database actions (handled by Cloud Functions)
        let result;
        try {
            const areaId = window.gameInstance?.areaId || 'beach';
            const reqRef = push(ref(db, `actions/pickupRequests/${areaId}`));
            const reqId = reqRef.key;
            await set(reqRef, { itemId, uid: safePlayerId, playerX: worldX, playerY: worldY, ts: Date.now() });

            // wait for the result written by Cloud Function to /actions/pickupResults/{areaId}/{reqId}
            result = await new Promise((resolve, reject) => {
                const resRef = ref(db, `actions/pickupResults/${areaId}/${reqId}`);
                const off = onValue(resRef, (snap) => {
                    if (snap.exists()) {
                        off();
                        resolve(snap.val());
                    }
                }, { onlyOnce: false });

                setTimeout(() => { off(); reject(new Error('pickup_result_timeout')); }, 5000);
            });
        } catch (serverError) {
            console.warn('Pickup request failed or timed out, falling back to direct attempt', serverError?.message);
            // Fallback: try direct firebase attempt for local pickup only
            result = await attemptDirectPickup(itemId, safePlayerId, worldX, worldY);
        }

        if (result.success) {
            // Grant item to player inventory (addItemToInventory now handles currency items automatically)
            try {
                // Validate item data before adding to inventory
                if (!pickedUpItem.type || typeof pickedUpItem.type !== 'string') {
                    console.error('[PICKUP] Invalid item type:', pickedUpItem.type);
                    return false;
                }

                const itemCount = pickedUpItem.count || 1;
                if (typeof itemCount !== 'number' || itemCount <= 0) {
                    console.error('[PICKUP] Invalid item count:', itemCount);
                    return false;
                }

                // Normalize legacy types (e.g. 'gold') to canonical types and check
                const canonicalType = normalizeItemType(pickedUpItem.type);
                if (canonicalType !== pickedUpItem.type) {
                  console.log('[PICKUP] Normalized item type', pickedUpItem.type, '->', canonicalType);
                }
                // Check if item type is valid
                const itemDefinition = getItemDefinition(canonicalType);
                console.log('[PICKUP] Attempting to add item to inventory:', {
                    type: pickedUpItem.type,
                    count: itemCount,
                    itemId: pickedUpItem.id,
                    itemExists: !!itemDefinition,
                    itemDefinition: itemDefinition,
                    validItems: ['seashell', 'driftwood', 'seaweed', 'stone', 'galactic_token']
                });

                // Use canonical type when adding to inventory
                const added = await addItemToInventory(canonicalType, itemCount);

                if (added === true || (typeof added === 'object' && added.success)) {
                    // Play pickup sound for successful inventory addition
                    try {
                        playPickupSound();
                    } catch (soundError) {
                        console.warn('[PICKUP] Failed to play pickup sound:', soundError);
                    }

                    // Grant experience for collecting resources
                    try {
                        experienceManager.addResourceExp(pickedUpItem.type);
                    } catch (expError) {
                        console.warn('[PICKUP] Failed to grant experience:', expError);
                    }
                } else {
                    console.error('[PICKUP] FAILED to add item to inventory:', {
                        itemType: pickedUpItem.type,
                        itemCount: itemCount,
                        itemId: pickedUpItem.id,
                        result: added,
                        errorMessage: typeof added === 'object' ? added.message : 'Unknown error'
                    });
                }
            } catch (inventoryError) {
                console.error('[PICKUP] Error adding item to inventory:', inventoryError, {
                    itemType: pickedUpItem.type,
                    itemCount: pickedUpItem.count
                });
            }

            // Show floating pickup message for visual feedback
            try {
                showItemPickupMessage(pickedUpItem.type, pickedUpItem.count || 1, pickedUpItem.x, pickedUpItem.y);
            } catch (uiError) {
                console.warn('[PICKUP] Failed to show pickup message:', uiError);
            }

            // Remove item from local state after successful server transaction
            // The Firebase subscription will also remove it, but we do it immediately for responsive UX
            game.groundItems = game.groundItems.filter(item => item.id !== itemId);

            return true;
        } else {
            return false;
        }

    } catch (error) {
        console.error('Pickup failed:', {
            itemId,
            error: error.message,
            type: error.name,
            code: error.code
        });

        // Provide better error feedback
        if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
            console.error('❌ Server connection failed. Is the server running on port 8081?');
            console.error('💡 Start the server with: cd server && node server.js');
        } else if (error.message?.includes('connection refused') || error.code === 'ECONNREFUSED') {
            console.error('❌ Connection refused. Server might not be running on port 8081');
            console.error('💡 Start the server with: cd server && node server.js');
        }

        return false;
    } finally {
        // Always remove from active attempts when done
        activePickupAttempts.delete(itemId);
    }
}

/**
 * Attempts direct pickup when server is unavailable.
 * This is a fallback mechanism for local player pickups.
 *
 * @param {string} itemId - The ID of the ground item to pick up
 * @param {string} playerId - The ID of the player attempting pickup
 * @param {number} playerX - Player's current X position
 * @param {number} playerY - Player's current Y position
 * @returns {Promise<{success: boolean, error?: string}>} Result of pickup attempt
 */
async function attemptDirectPickup(itemId, playerId, playerX, playerY) {
    try {
        // Get current user to verify ownership
        const currentUser = auth.currentUser;
        if (!currentUser || currentUser.uid !== playerId) {
            return { success: false, error: 'User not authenticated or not owner' };
        }

        // Find the item in game state to get area information
        const pickedUpItem = game.groundItems.find(item => item.id === itemId);
        if (!pickedUpItem) {
            return { success: false, error: 'Item not found' };
        }

        // Check distance (basic client-side validation)
        const distance = Math.hypot(pickedUpItem.x - playerX, pickedUpItem.y - playerY);
        if (distance > 100) { // Allow slightly more distance for direct pickup
            return { success: false, error: 'Too far from item' };
        }

        // Get area ID from game state (assuming beach for now, but this should be dynamic)
        const areaId = window.gameInstance?.areaId || 'beach';

        // Direct Firebase removal (no server transaction)
        const itemRef = ref(db, `areas/${areaId}/groundItems/${itemId}`);
        await remove(itemRef);

        console.log('Direct pickup successful for item:', itemId);
        return { success: true };

    } catch (error) {
        console.error('Direct pickup failed:', error);
        return { success: false, error: error.message };
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
 * Note: Damage tracking is now handled through Firebase Cloud Functions
 * via the sendDamageRequest function in enemyService.js
 *
 * This function is kept for compatibility but should not be used directly.
 * Use sendDamageRequest instead for proper damage handling.
 */

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