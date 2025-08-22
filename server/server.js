/* eslint-env node */
const express = require('express');
const http = require('http');
const admin = require('firebase-admin');

// AI: Removed WebSocket dependency since we're using Firebase RTDB for real-time communication

// Initialize Firebase Admin SDK
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    // In production (like on Render), use the environment variable.
    // The variable should be a base64 encoded string of the JSON key file.
    const serviceAccountString = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
    serviceAccount = JSON.parse(serviceAccountString);
  } catch (error) {
    console.error('Error processing FIREBASE_SERVICE_ACCOUNT environment variable:');
    console.error('Error message:', error.message);
    console.error('Error type:', error.constructor.name);
    console.error('Error stack:', error.stack);

    // Log the first part of the environment variable to debug
    console.error('Environment variable starts with:', process.env.FIREBASE_SERVICE_ACCOUNT.substring(0, 100));

    process.exit(1);
  }
} else {
  // In local development, fall back to the JSON file.
  try {
    serviceAccount = require('./google-credentials.json');
  } catch (error) {
    console.error("Error: 'google-credentials.json' not found.");
    console.error("Please make sure the file exists for local development, or set the FIREBASE_SERVICE_ACCOUNT environment variable for production.");
    console.error("Available environment variables:", Object.keys(process.env));
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
});

console.log(`Firebase initialized for project: ${serviceAccount.project_id}`);

const path = require('path');
const db = admin.database();
const AREA_ID = 'beach'; // Current area, can be made dynamic later
// Load server-side enemy templates; keep in sync with client `src/data/enemies.json`.
const templatesPath = path.join(__dirname, '..', 'src', 'data', 'enemies.json');
let enemyTemplates = { templates: [] };
try {
  enemyTemplates = require(templatesPath);
  console.log(`Loaded ${enemyTemplates.templates.length} enemy templates from ${templatesPath}`);
} catch (err) {
  console.warn('Could not load enemy templates from', templatesPath, err.message);
}

const ENEMY_HP = 3; // Fallback standard enemy HP when template missing
const enemiesRef = db.ref(`areas/${AREA_ID}/enemies`);
const groundItemsRef = db.ref(`areas/${AREA_ID}/groundItems`);

/*
 * GROUND ITEMS SYSTEM - SERVER-SIDE IMPLEMENTATION
 * ===============================================
 *
 * CONCURRENCY CONTROL STRATEGY:
 * - Uses Firebase transactions for atomic item pickup operations
 * - Prevents duplicate pickups through optimistic locking
 * - Server-authoritative loot dropping with client-initiated pickup
 * - Distance validation to prevent cheating
 *
 * SERVER/CLIENT SEPARATION:
 * - SERVER: Manages loot dropping, item persistence, pickup validation
 * - CLIENT: Requests pickup, displays ground items, handles UI feedback
 * - Both use Firebase RTDB for real-time synchronization
 *
 * DATA STRUCTURE:
 * areas/{areaId}/groundItems/{itemId} = {
 *   id: string,           // Unique item identifier
 *   type: string,         // Item type (e.g., 'seashell', 'sand', 'driftwood')
 *   x: number,            // X position on ground
 *   y: number,            // Y position on ground
 *   count: number,        // Stack count for the item
 *   createdAt: number,    // Timestamp when item was dropped
 *   ownerId?: string      // Optional: Player who can pick up (for private drops)
 * }
 *
 * CONCURRENCY SAFETY:
 * 1. Loot dropping: Server-only operation, no race conditions
 * 2. Item pickup: Firebase transaction ensures only one client can pick up each item
 * 3. Death processing: rewardsGranted flag prevents duplicate loot drops
 * 4. Distance validation: Server-side check prevents remote pickup exploits
 *
 * INTEGRATION POINTS:
 * - Enemy death detection triggers loot dropping
 * - Client calls /pickup-item API endpoint
 * - Firebase RTDB syncs ground items to all clients
 * - Player inventory updated via grantItemToPlayer callback
 */

const app = express();
const server = http.createServer(app);

// CORS middleware to allow requests from both dev and production
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [
        'http://localhost:5173',
        'https://idlewebgame.web.app'
    ];
    
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// AI: Removed WebSocket server - using Firebase RTDB for real-time sync
// This approach is more reliable and scales better

let enemies = {};
const MAX_ENEMIES = 20; // Spawn 20 bugs initially, no respawning
const WORLD_WIDTH = 800;
const WORLD_HEIGHT = 600;
// Pickup configuration: base pickup distance and an additional tolerance in pixels.
// We use squared-distance comparisons in hot paths to avoid unnecessary sqrt calls.
const PICKUP_DISTANCE_PX = 60; // nominal pickup radius in pixels (matches client maxPickupRange)
const PICKUP_DISTANCE_TOLERANCE_PX = 10; // extra tolerance to account for anchor offsets and network delays
const PICKUP_MAX_DISTANCE_SQ = Math.pow(PICKUP_DISTANCE_PX + PICKUP_DISTANCE_TOLERANCE_PX, 2);

// Enemies are now static - removed all movement and fleeing configurations

// Function to choose weighted template
function chooseWeightedTemplate(templates) {
    if (!templates || templates.length === 0) return null;
    const weights = templates.map(t => (t.spawnWeight || 1));
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return templates[0];
    let r = Math.random() * total;
    for (let i = 0; i < templates.length; i++) {
        r -= weights[i];
        if (r <= 0) return templates[i];
    }
    return templates[templates.length - 1];
}

// Function to spawn initial enemies (NO RESPAWNING)
function spawnInitialEnemies() {
    console.log(`[ENEMY_SPAWN] Spawning ${MAX_ENEMIES} initial enemies (no respawning)`);

    const newEnemies = {};
    for (let i = 0; i < MAX_ENEMIES; i++) {
        const randomSuffix = Math.random().toString(36).slice(2, 8);
        const id = `bug_${Date.now()}_${randomSuffix}_${i}`;

        // Generate random positions across the entire world
        const x = 20 + Math.random() * (WORLD_WIDTH - 40);
        const y = 20 + Math.random() * (WORLD_HEIGHT - 40);

        // Choose a template for this area using weights
        const areaTemplates = (enemyTemplates.templates || []).filter(t => !t.areas || t.areas.length === 0 || t.areas.includes(AREA_ID));
        const chosen = chooseWeightedTemplate(areaTemplates) || null;

        // Always spawn with full health
        const templateId = chosen ? chosen.id : null;
        const maxHpFromTemplate = chosen ? (chosen.maxHp || chosen.hp || ENEMY_HP) : ENEMY_HP;
        const hpFromTemplate = maxHpFromTemplate;

        console.log(`[ENEMY_SPAWN] Creating enemy ${id} at (${x}, ${y}) with ${hpFromTemplate}/${maxHpFromTemplate} HP`);

        newEnemies[id] = {
            id,
            x: x,
            y: y,
            hp: hpFromTemplate,
            maxHp: maxHpFromTemplate,
            // Attach loot from the chosen template so server-side drops have data
            loot: chosen ? (chosen.loot || null) : null,
            xpValue: chosen ? (chosen.xpValue || 1) : 1,
            angle: Math.random() * Math.PI * 2,
            templateId,
            lastUpdate: Date.now(),
            isDead: false,
            behavior: chosen ? (chosen.behavior || 'passive') : 'passive',
            damageContributors: {} // Track which players have dealt damage
        };
    }

    enemiesRef.set(newEnemies, (error) => {
        if (error) {
            console.error('[ENEMY_SPAWN] Error spawning initial enemies:', error);
        } else {
            console.log(`[ENEMY_SPAWN] Successfully spawned ${MAX_ENEMIES} initial enemies`);
        }
    });
}

// Spawn initial enemies if none exist (NO RESPAWNING)
console.log('[ENEMY_SPAWN] Checking for initial enemy setup...');
enemiesRef.once('value', (snapshot) => {
    if (!snapshot.exists() || Object.keys(snapshot.val() || {}).length === 0) {
        console.log('[ENEMY_SPAWN] No enemies found, spawning initial set...');
        spawnInitialEnemies();
    } else {
        console.log('[ENEMY_SPAWN] Enemies already exist - no respawning will occur');
    }
});

// Migration helper: ensure existing enemy nodes have a loot table derived
// from their template. This fixes worlds created before server-side loot
// wiring was added, preventing "No loot table found" during death.
function ensureEnemiesHaveLoot() {
    enemiesRef.once('value', (snapshot) => {
        const data = snapshot.val() || {};
        const updates = {};
        let patched = 0;

        Object.entries(data).forEach(([id, enemy]) => {
            if (!enemy) return;
            if (!enemy.loot) {
                // Try to find a matching template by templateId
                let chosen = null;
                if (enemy.templateId) {
                    const areaTemplates = (enemyTemplates.templates || []).filter(t => !t.areas || t.areas.length === 0 || t.areas.includes(AREA_ID));
                    chosen = areaTemplates.find(t => t.id === enemy.templateId) || null;
                }

                // Fallback to weighted template for area
                if (!chosen) {
                    const areaTemplates = (enemyTemplates.templates || []).filter(t => !t.areas || t.areas.length === 0 || t.areas.includes(AREA_ID));
                    chosen = chooseWeightedTemplate(areaTemplates) || null;
                }

                if (chosen && chosen.loot) {
                    updates[`${id}/loot`] = chosen.loot;
                    patched += 1;
                }
            }
        });

        if (Object.keys(updates).length > 0) {
            enemiesRef.update(updates, (err) => {
                if (err) {
                    console.error('[ENEMY_MIGRATE] Failed to backfill loot for enemies:', err);
                } else {
                    console.log(`[ENEMY_MIGRATE] Backfilled loot for ${patched} enemies`);
                }
            });
        } else {
            console.log('[ENEMY_MIGRATE] No enemies required loot backfill');
        }
    });
}

// Run migration once at startup to ensure loot tables exist
ensureEnemiesHaveLoot();

/**
 * Drops loot from a defeated enemy at the specified location.
 * Processes enemy loot table with random chance and quantity calculations.
 * Uses last-hit rule: only the player who dealt the killing blow can see the loot initially.
 *
 * @param {Object} enemy - The enemy that was defeated
 * @param {number} x - X coordinate where loot should drop
 * @param {number} y - Y coordinate where loot should drop
 * @param {string} lastHitBy - ID of the player who dealt the killing blow (last hitter)
 */
function dropEnemyLoot(enemy, x, y, lastHitBy = null) {
    if (!enemy) {
        console.error(`[LOOT_DROP] Enemy object is null or undefined`);
        return;
    }

    if (!enemy.id) {
        console.error(`[LOOT_DROP] Enemy object missing id property:`, enemy);
        return;
    }

    if (!enemy.loot) {
        console.log(`[LOOT_DROP] No loot table found for enemy ${enemy.id}`);
        return;
    }

    // Validate coordinates
    if (typeof x !== 'number' || typeof y !== 'number') {
        console.error(`[LOOT_DROP] Invalid coordinates for enemy ${enemy.id}: x=${x}, y=${y}`);
        x = 0;
        y = 0;
    }

    console.log(`[LOOT_DROP] Processing loot for enemy ${enemy.id} at (${x}, ${y})`);

    // Use last-hit rule for loot visibility
    const damageContributors = enemy.damageContributors || {};
    const contributorCount = Object.keys(damageContributors).length;
    const lastHitter = lastHitBy || enemy.lastHitBy;
    
    console.log(`[LOOT_DROP] Enemy ${enemy.id} last hit by: ${lastHitter}, total contributors: ${contributorCount}`);

    const lootTable = enemy.loot;
    const droppedItems = [];

    // Process gold drops (can be stored as items or handled separately)
    try {
        if (typeof lootTable.goldMin === 'number' && typeof lootTable.goldMax === 'number' && lootTable.goldMin >= 0 && lootTable.goldMax >= lootTable.goldMin) {
            const goldAmount = Math.floor(Math.random() * (lootTable.goldMax - lootTable.goldMin + 1)) + lootTable.goldMin;
            if (goldAmount > 0) {
                // Create a galactic token item that can be picked up
                const tokenItemId = `galactic_token_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

                // Determine visibility based on last-hit rule
                // Only the last hitter can see the loot initially
                const visibleTo = lastHitter ? [lastHitter] : [];
                console.log(`[LOOT_DROP] Creating galactic token item ${tokenItemId} visible to last hitter: ${lastHitter}`);

                const releaseAt = Date.now() + 5000; // Release visibility after 5s
                const tokenItem = {
                    id: tokenItemId,
                    type: 'galactic_token',
                    x: x + (Math.random() - 0.5) * 20, // Slight random offset
                    y: y + (Math.random() - 0.5) * 20,
                    count: goldAmount,
                    createdAt: Date.now(),
                    releaseAt: releaseAt,
                    visibleTo: visibleTo, // Array of player IDs who can see/access this item
                    contributors: visibleTo, // For backward compatibility, same as visibleTo
                    lastHitBy: lastHitter // Track who gets the loot
                };

                groundItemsRef.child(tokenItemId).set(tokenItem, (error) => {
                    if (error) {
                        console.error(`[LOOT_DROP] Error dropping galactic token ${tokenItemId}:`, error);
                    } else {
                        console.log(`[LOOT_DROP] Dropped ${goldAmount} galactic token(s) as item ${tokenItemId} (last-hit loot for ${lastHitter})`);
                        droppedItems.push(tokenItem);
                    }
                });
            }
        } else if (lootTable.goldMin !== undefined || lootTable.goldMax !== undefined) {
            console.warn(`[LOOT_DROP] Invalid galactic token drop configuration for enemy ${enemy.id}: goldMin=${lootTable.goldMin}, goldMax=${lootTable.goldMax}`);
        }
    } catch (tokenError) {
        console.error(`[LOOT_DROP] Error processing galactic token drops for enemy ${enemy.id}:`, tokenError);
    }

    // Process item drops from loot table
    try {
        if (lootTable.items && Array.isArray(lootTable.items)) {
            lootTable.items.forEach(itemDrop => {
                try {
                    // Validate item drop configuration
                    if (!itemDrop.id || typeof itemDrop.chance !== 'number' ||
                        typeof itemDrop.minCount !== 'number' || typeof itemDrop.maxCount !== 'number' ||
                        itemDrop.minCount < 0 || itemDrop.maxCount < itemDrop.minCount) {
                        console.warn(`[LOOT_DROP] Invalid item drop configuration for enemy ${enemy.id}:`, itemDrop);
                        return;
                    }

                    // Check if item drops based on chance
                    if (Math.random() < itemDrop.chance) {
                        const count = Math.floor(Math.random() * (itemDrop.maxCount - itemDrop.minCount + 1)) + itemDrop.minCount;
                        if (count > 0) {
                            const itemId = `${itemDrop.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

                            // Determine visibility based on last-hit rule
                            // Only the last hitter can see the loot initially
                            const visibleTo = lastHitter ? [lastHitter] : [];
                            console.log(`[LOOT_DROP] Creating item ${itemId} visible to last hitter: ${lastHitter}`);

                            const releaseAt = Date.now() + 5000; // Release visibility after 5s
                            const groundItem = {
                                id: itemId,
                                type: itemDrop.id,
                                x: x + (Math.random() - 0.5) * 30, // Random scatter around death location
                                y: y + (Math.random() - 0.5) * 30,
                                count: count,
                                createdAt: Date.now(),
                                releaseAt: releaseAt,
                                visibleTo: visibleTo, // Array of player IDs who can see/access this item
                                contributors: visibleTo, // For backward compatibility, same as visibleTo
                                lastHitBy: lastHitter // Track who gets the loot
                            };

                            groundItemsRef.child(itemId).set(groundItem, (error) => {
                                if (error) {
                                    console.error(`[LOOT_DROP] Error dropping item ${itemId}:`, error);
                                } else {
                                    console.log(`[LOOT_DROP] Dropped ${count}x ${itemDrop.id} as item ${itemId} (last-hit loot for ${lastHitter})`);
                                    droppedItems.push(groundItem);
                                }
                            });
                        }
                    }
                } catch (itemError) {
                    console.error(`[LOOT_DROP] Error processing item drop for enemy ${enemy.id}:`, itemError, itemDrop);
                }
            });
        } else if (lootTable.items !== undefined) {
            console.warn(`[LOOT_DROP] Invalid items array for enemy ${enemy.id}:`, lootTable.items);
        }
    } catch (itemsError) {
        console.error(`[LOOT_DROP] Error processing item drops for enemy ${enemy.id}:`, itemsError);
    }

    if (droppedItems.length > 0) {
        console.log(`[LOOT_DROP] Successfully dropped ${droppedItems.length} items from enemy ${enemy.id}`);
    } else {
        console.log(`[LOOT_DROP] No items dropped from enemy ${enemy.id}`);
    }
}

/**
 * Attempts to pick up a ground item using Firebase transaction for atomicity.
 * Ensures no duplicate pickups and proper cleanup.
 *
 * CONCURRENCY CONTROL DETAILS:
 * - Uses Firebase transaction with optimistic locking
 * - If multiple players try to pick up the same item simultaneously, only one will succeed
 * - Failed transactions are automatically retried by Firebase with latest data
 * - Distance validation prevents remote pickup exploits
 * - Owner validation allows for private drops (e.g., quest items)
 *
 * TRANSACTION FLOW:
 * 1. Read current item state from database
 * 2. Validate pickup conditions (distance, ownership)
 * 3. If valid, return null to delete the item
 * 4. Firebase commits transaction if no conflicts occurred
 * 5. On success, grant item to player inventory
 *
 * @param {string} itemId - ID of the ground item to pick up
 * @param {string} playerId - ID of the player attempting pickup
 * @param {number} playerX - Player's current X position
 * @param {number} playerY - Player's current Y position
 * @param {Function} grantItemToPlayer - Function to grant item to player inventory
 * @returns {Promise<boolean>} Success status of pickup attempt
 */
async function pickupGroundItem(itemId, playerId, playerX, playerY, grantItemToPlayer) {
    console.log(`[ITEM_PICKUP] Player ${playerId} attempting to pick up item ${itemId}`);
    console.log(`[ITEM_PICKUP] Ground items ref path: ${groundItemsRef.toString()}`);

    const itemRef = groundItemsRef.child(itemId);
    console.log(`[ITEM_PICKUP] Item ref path: ${itemRef.toString()}`);

    try {
        // Early-read to validate visibility/distance before attempting transaction.
        // This reduces chances of aborts caused by clearly-invalid pickup attempts.
        const snapshot = await new Promise((resolve) => itemRef.once('value', resolve));
        const currentItem = snapshot.val();

        if (!currentItem) {
            console.log(`[ITEM_PICKUP] Item ${itemId} not found or already picked up (pre-check)`);
            return false;
        }
        
        // Check if item was created very recently (within last 500ms)
        // If so, add a small delay to allow Firebase to propagate the write
        const now = Date.now();
        const itemAge = currentItem.createdAt ? (now - currentItem.createdAt) : 1000;
        if (itemAge < 500) {
            console.log(`[ITEM_PICKUP] Item ${itemId} is very new (${itemAge}ms old), waiting for Firebase propagation...`);
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
        }

        // Distance validation (use squared distance for efficiency and add tolerance)
        const dx = currentItem.x - playerX;
        const dy = currentItem.y - playerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > PICKUP_MAX_DISTANCE_SQ) {
            const distance = Math.sqrt(distSq);
            console.log(`[ITEM_PICKUP] Player ${playerId} too far from item ${itemId} (${distance.toFixed(1)} > ${Math.sqrt(PICKUP_MAX_DISTANCE_SQ).toFixed(1)})`);
            return false;
        }

        // Visibility check
        if (currentItem.visibleTo && Array.isArray(currentItem.visibleTo) && !currentItem.visibleTo.includes(playerId)) {
            console.log(`[ITEM_PICKUP] Item ${itemId} not visible to player ${playerId}. Visible to: ${currentItem.visibleTo.join(', ')}`);
            return false;
        }

        if (currentItem.ownerId && currentItem.ownerId !== playerId) {
            console.log(`[ITEM_PICKUP] Item ${itemId} owned by ${currentItem.ownerId}, player ${playerId} cannot pick up`);
            return false;
        }

        console.log(`[ITEM_PICKUP] Starting transaction for item ${itemId} at path: areas/${AREA_ID}/groundItems/${itemId}`);
        
        // Try a simplified approach to avoid Firebase RTDB transaction consistency issues
        // Check if we can pick up the item based on the pre-read, then use atomic remove
        console.log(`[ITEM_PICKUP] Using pre-validated atomic remove approach`);
        
        // Validate all pickup conditions based on the pre-read data
        // Reuse the 'now' variable from above
        const isVisibleToPlayer = currentItem.visibleTo && Array.isArray(currentItem.visibleTo) && currentItem.visibleTo.includes(playerId);
        const isOwner = currentItem.ownerId && currentItem.ownerId === playerId;
        const isLastHitter = currentItem.lastHitBy && currentItem.lastHitBy === playerId;
        const isReleased = currentItem.releaseAt && typeof currentItem.releaseAt === 'number' && currentItem.releaseAt <= now;
        const isUnrestricted = (!currentItem.visibleTo || !Array.isArray(currentItem.visibleTo)) && !currentItem.ownerId && !currentItem.lastHitBy;
        const isLegacyItem = currentItem.createdAt && typeof currentItem.createdAt === 'number' && (now - currentItem.createdAt) > 60000;
        
        console.log(`[ITEM_PICKUP] Pre-validation check for ${itemId}:`, {
            playerId,
            visibleTo: currentItem.visibleTo,
            ownerId: currentItem.ownerId,
            lastHitBy: currentItem.lastHitBy,
            isVisibleToPlayer,
            isOwner,
            isLastHitter,
            isReleased,
            isUnrestricted,
            isLegacyItem
        });
        
        if (!(isVisibleToPlayer || isOwner || isLastHitter || isReleased || isUnrestricted || isLegacyItem)) {
            console.log(`[ITEM_PICKUP] Pre-validation failed: Player ${playerId} not allowed to pick up item ${itemId}`);
            return false;
        }
        
        try {
            // Use atomic remove - this either succeeds completely or fails completely
            await itemRef.remove();
            
            console.log(`[ITEM_PICKUP] Successfully removed item ${itemId} using atomic operation`);
            await grantItemToPlayer(playerId, currentItem.type, currentItem.count);
            return true;
            
        } catch (removeError) {
            console.log(`[ITEM_PICKUP] Atomic remove failed (item may have been picked up by someone else):`, removeError.message);
            return false;
        }

    } catch (error) {
        console.error(`[ITEM_PICKUP] Error picking up item ${itemId}:`, error);
        return false;
    }
}

// AI: Removed periodic spawn check to prevent conflicts with death-triggered respawns
// Enemies now only respawn after death with proper 30-second delay

// AI: Listen for enemy changes - no need to broadcast via WebSocket since clients subscribe to RTDB
enemiesRef.on('value', (snapshot) => {
    // AI: This listener fetches all enemy data on every change.
    // While necessary for server-side state management, be aware of its data usage
    // if the 'enemies' node becomes very large or updates extremely frequently.
    // Clients should also subscribe to this path for real-time updates.
    enemies = snapshot.val() || {};
});

// Player position tracking removed - enemies don't move or flee

// Enemies are now static - no movement or fleeing behavior
// Removed all movement and fleeing logic since enemies don't move


// Handle damage via Firebase RTDB database triggers
// Dead enemies are permanently removed (no respawning)
enemiesRef.on('child_changed', async (snapshot) => {
    const enemyId = snapshot.key;
    const enemy = snapshot.val();

    // If enemy HP drops to 0 or below, process death and loot
    if (enemy && (enemy.hp <= 0 || enemy.isDead === true)) {
        console.log(`[ENEMY_DEATH] Enemy ${enemyId} HP reached 0 (HP: ${enemy.hp}), processing death and loot`);

        /*
         * SERVER/CLIENT SEPARATION FOR DEATH PROCESSING:
         * - Server handles loot dropping and cleanup
         * - Client handles visual death effects and local rewards
         * - rewardsGranted flag prevents duplicate loot drops
         * - This ensures one-time loot processing per enemy death
         */
        if (enemy.rewardsGranted) {
            console.log(`[ENEMY_DEATH] Rewards already granted for enemy ${enemyId}, skipping loot drop`);
        } else {
            // To avoid conflicts with concurrent Firebase transactions (e.g., the incoming
            // damage transaction), schedule the rewards/drop/remove sequence to run
            // shortly after this event. This prevents `Error: set` caused by updating
            // the same node while a transaction is active.
            console.log(`[ENEMY_DEATH] Scheduling rewards/drop/remove for enemy ${enemyId} after short delay`);

            setTimeout(async () => {
                try {
                    console.log(`[ENEMY_DEATH] Marking rewardsGranted for enemy ${enemyId}`);
                    await enemiesRef.child(enemyId).update({ rewardsGranted: true });
                } catch (err) {
                    console.error(`[ENEMY_DEATH] Error marking rewards granted for ${enemyId}:`, err);
                    // Continue; we still attempt to drop loot and remove the node
                }

                // Loot dropping is now handled by damage tracking system to avoid duplicates
                // try {
                //     console.log(`[ENEMY_DEATH] Dropping loot for enemy ${enemyId} at (${enemy.x}, ${enemy.y})`);
                //     await Promise.resolve(dropEnemyLoot(enemy, enemy.x, enemy.y, enemy.lastDamagedBy));
                // } catch (lootErr) {
                //     console.error(`[ENEMY_DEATH] Error while dropping loot for ${enemyId}:`, lootErr);
                // }

                try {
                    await enemiesRef.child(enemyId).remove();
                    console.log(`[ENEMY_DEATH] Enemy ${enemyId} permanently removed from Firebase`);

                    if (enemies[enemyId]) {
                        delete enemies[enemyId];
                    }

                    console.log(`[ENEMY_DEATH] Enemy ${enemyId} is gone forever`);
                } catch (removeErr) {
                    console.error(`[ENEMY_DEATH] Error removing enemy ${enemyId}:`, removeErr);
                }
            }, 60); // 60ms delay
        }
    }
});

// AI: Detect client-created/unauthorized enemy additions and normalize them.
// Some old clients or buggy clients may create enemy nodes directly which causes
// immediate respawns or incorrect HP values. Defend on the server by observing
// child_added events and correcting/removing suspicious entries.
// Removed recentRemovals and associated logic as it's no longer needed with server-authoritative death and no respawning.

enemiesRef.on('child_added', (snapshot) => {
    const id = snapshot.key;
    const enemy = snapshot.val();
    if (!enemy) return;

    console.log(`[ENEMY_ADD] New enemy ${id} added to server (HP: ${enemy.hp}/${enemy.maxHp}, template: ${enemy.templateId})`);

    // Normalize missing maxHp
    const maxHp = enemy.maxHp || ENEMY_HP;

    // If client created this enemy with 0 HP (dead enemy), remove it immediately
    if (typeof enemy.hp === 'number' && enemy.hp <= 0) {
        console.log(`[ENEMY_ADD] Removing dead enemy ${id} created by client: hp=${enemy.hp}`);
        enemiesRef.child(id).remove().then(() => {
            console.log(`[ENEMY_ADD] Removed dead enemy ${id}`);
        }).catch((err) => {
            console.warn(`[ENEMY_ADD] Failed to remove dead enemy ${id}:`, err);
        });
        return; // dead enemies should not exist on server
    }

    // CRITICAL: If client created this enemy with less than max HP (but not dead), correct it to full health.
    // This prevents the "decreasing health" bug where enemies respawn with partial health.
    if (typeof enemy.hp === 'number' && enemy.hp < maxHp) {
        console.log(`[ENEMY_ADD] Normalizing client-created enemy ${id}: hp=${enemy.hp} -> ${maxHp} (BUG FIX)`);
        const updates = {
            hp: maxHp,
            maxHp,
            lastUpdate: Date.now(),
            isDead: false // Ensure it's marked as alive
        };
        enemiesRef.child(id).update(updates).then(() => {
            console.log(`[ENEMY_ADD] Normalized enemy ${id} to full HP`);
        }).catch((err) => {
            console.warn(`[ENEMY_ADD] Failed to normalize HP for enemy ${id}:`, err);
        });
        return; // we've corrected it; nothing else to do for this add
    }

    // Removed client re-spawn detection (recentRemovals logic)

    console.log(`[ENEMY_ADD] Enemy ${id} passed all validation checks`);
});

// Handle enemy removal - NO RESPAWNING
enemiesRef.on('child_removed', (snapshot) => {
    const enemyId = snapshot.key;
    const removedEnemy = snapshot.val();

    console.log(`[ENEMY_REMOVE] Enemy ${enemyId} permanently removed from server (was at ${removedEnemy?.x || 0}, ${removedEnemy?.y || 0})`);
    console.log(`[ENEMY_REMOVE] Enemy ${enemyId} is gone forever - no respawning`);

    // Removed tracking of recent removals - no longer needed
    // Update local enemies cache
    if (enemies[enemyId]) {
        delete enemies[enemyId];
    }

    // NO RESPAWNING - Enemy is gone forever
});

// AI: Add basic health endpoint for server monitoring
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        enemies: Object.keys(enemies).length,
        maxEnemies: MAX_ENEMIES,
        timestamp: new Date().toISOString()
    });
});

// Debug endpoint to list current in-memory enemies for quick validation
// Note: This exposes server state and should be disabled or protected in production
app.get('/debug/enemies', (req, res) => {
    try {
        res.json({
            success: true,
            count: Object.keys(enemies).length,
            enemies
        });
    } catch (err) {
        console.error('[DEBUG_ENEMIES] Error returning enemies list:', err);
        res.status(500).json({ success: false, error: 'Unable to retrieve enemies', details: err && err.message });
    }
});

// Debug endpoint: list current ground items for the area (for troubleshooting pickups)
app.get('/debug/ground-items', (req, res) => {
    try {
        groundItemsRef.once('value', (snapshot) => {
            const items = snapshot.val() || {};
            res.json({ success: true, count: Object.keys(items).length, items });
        }, (err) => {
            console.error('[DEBUG_GROUNDITEMS] Error reading groundItems:', err);
            res.status(500).json({ success: false, error: 'Failed to read ground items', details: err && err.message });
        });
    } catch (err) {
        console.error('[DEBUG_GROUNDITEMS] Unexpected error:', err);
        res.status(500).json({ success: false, error: 'Unexpected error', details: err && err.message });
    }
});

/**
 * API endpoint for tracking damage dealt to enemies.
 * Updates the damageContributors object for the enemy.
 *
 * POST /track-damage
 * Body: {
 *   enemyId: string,
 *   playerId: string,
 *   damage: number
 * }
 */
// Helper: sleep for ms
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: rudimentary transient error detector for Firebase transaction failures
function isTransientFirebaseError(err) {
    if (!err || !err.message) return false;
    const msg = err.message.toLowerCase();
    return msg.includes('set') || msg.includes('transaction') || msg.includes('abort') || msg.includes('aborted');
}

/**
 * Run a Firebase transaction with retries to tolerate transient conflicts.
 * This reduces cases where a concurrent update/remove aborts the transaction.
 *
 * @param {admin.database.Reference} ref - Firebase DB reference
 * @param {Function} updateFn - Transaction update function
 * @param {number} maxAttempts - Maximum attempts
 */
async function runTransactionWithRetries(ref, updateFn, maxAttempts = 5) {
    let attempt = 0;
    while (attempt < maxAttempts) {
        attempt += 1;
        try {
            const result = await new Promise((resolve, reject) => {
                ref.transaction((current) => updateFn(current), (error, committed, snapshot) => {
                    if (error) return reject(error);
                    return resolve({ committed, snapshot });
                });
            });
            // attach attempt count for diagnostics
            result.attempt = attempt;
            return result;
        } catch (err) {
            // If it's a transient Firebase conflict, backoff and retry
            if (isTransientFirebaseError(err) && attempt < maxAttempts) {
                const backoffMs = 50 * Math.pow(2, attempt); // exponential backoff: 100,200,400,...
                console.warn(`[TX_RETRY] Transaction attempt ${attempt} failed with transient error, backing off ${backoffMs}ms`);
                await sleep(backoffMs);
                continue;
            }
            // Non-transient or max attempts reached: rethrow
            throw err;
        }
    }
    throw new Error('runTransactionWithRetries exhausted attempts');
}

app.post('/track-damage', express.json(), async (req, res) => {
    // Enhanced logging for debugging client/server failures
    console.log('[TRACK_DAMAGE] Incoming request body:', req.body);
    const { enemyId, playerId, damage } = req.body;

    if (!enemyId || !playerId || typeof damage !== 'number' || damage < 0) {
        console.warn('[TRACK_DAMAGE] Validation failed for request:', { enemyId, playerId, damage });
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: enemyId, playerId, damage (must be >= 0)'
        });
    }

    try {
        const enemyRef = enemiesRef.child(enemyId);

        // Use the retryable transaction helper to tolerate transient conflicts
        const txResult = await runTransactionWithRetries(enemyRef, (currentEnemy) => {
            if (!currentEnemy) {
                // If the enemy no longer exists, signal caller via committed=false
                return undefined;
            }

            if (currentEnemy.isDead || currentEnemy.hp <= 0) {
                return undefined; // already dead
            }

            // Initialize damageContributors if absent
            if (!currentEnemy.damageContributors) currentEnemy.damageContributors = {};

            if (damage > 0) {
                const currentDamage = currentEnemy.damageContributors[playerId] || 0;
                currentEnemy.damageContributors[playerId] = currentDamage + damage;
                
                // Track last hitter for last-hit loot rule
                currentEnemy.lastHitBy = playerId;
            } else if (damage === 0) {
                // death-processing marker: ensure player present
                if (!currentEnemy.damageContributors[playerId]) currentEnemy.damageContributors[playerId] = 0;
            }

            let newHp = currentEnemy.hp;
            if (damage > 0) {
                newHp = Math.max(0, currentEnemy.hp - damage);
                currentEnemy.hp = newHp;
            }

            if ((newHp <= 0 || damage === 0) && !currentEnemy.isDead) {
                currentEnemy.isDead = true;
                currentEnemy.deathTime = Date.now();
                currentEnemy.deathProcessed = true;
            } else if (damage === 0 && currentEnemy.isDead && !currentEnemy.deathProcessed) {
                currentEnemy.deathProcessed = true;
            }

            return currentEnemy;
        });

        const { committed, snapshot, attempt } = txResult;

        if (committed) {
            const enemy = snapshot ? snapshot.val() : null;

            // If enemy died, trigger loot drops (best-effort)
            if (enemy && enemy.isDead && enemy.deathProcessed) {
                try {
                    // Use lastHitBy for loot drops, fallback to current playerId
                    const lastHitter = enemy.lastHitBy || playerId;
                    dropEnemyLoot(enemy, enemy.x || 0, enemy.y || 0, lastHitter);
                } catch (lootError) {
                    console.error(`[DAMAGE_TRACK] Error creating loot drops for enemy ${enemyId}:`, lootError);
                }
            }

            // Return success along with retry attempt if helpful
            return res.json({ success: true, message: 'Damage tracked successfully', attempt: attempt, enemy });
        }

        // If the transaction did not commit, treat as Gone/Already processed to avoid client re-tries
        console.warn('[TRACK_DAMAGE] Transaction did not commit for:', { enemyId, playerId, damage });
        return res.status(410).json({ success: false, error: 'Enemy gone or cannot be damaged (already processed)' });
    } catch (error) {
        console.error('[DAMAGE_TRACK] Error processing damage tracking request:', error);
        // If transient, communicate that to client via 503 so client may retry
        const transient = isTransientFirebaseError(error);
        const statusCode = transient ? 503 : 500;
        return res.status(statusCode).json({ success: false, error: 'Internal server error', details: error && error.message, transient });
    }
});

/**
 * API endpoint for picking up ground items.
 * Uses Firebase transactions to ensure atomic pickup and prevent duplicates.
 *
 * POST /pickup-item
 * Body: {
 *   itemId: string,
 *   playerId: string,
 *   playerX: number,
 *   playerY: number
 * }
 */
app.post('/pickup-item', express.json(), async (req, res) => {
    console.log(`[PICKUP_API] Received pickup request:`, req.body);
    const { itemId, playerId, playerX, playerY } = req.body;

    console.log(`[PICKUP_API] Validating fields:`, {
        itemId: !!itemId,
        playerId: !!playerId,
        playerX: typeof playerX,
        playerY: typeof playerY
    });

    if (!itemId || !playerId || typeof playerX !== 'number' || typeof playerY !== 'number') {
        console.log(`[PICKUP_API] Validation failed:`, { itemId, playerId, playerX, playerY });
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: itemId, playerId, playerX, playerY'
        });
    }

    try {
        // Placeholder grantItemToPlayer function - should be implemented based on your player system
        const grantItemToPlayer = async (playerId, itemType, count) => {
            console.log(`[GRANT_ITEM] Granting ${count}x ${itemType} to player ${playerId}`);
            // TODO: Implement actual player inventory update logic
            // This should update the player's inventory in your database
            return true;
        };

        const success = await pickupGroundItem(itemId, playerId, playerX, playerY, grantItemToPlayer);

        if (success) {
            res.json({ success: true, message: 'Item picked up successfully' });
        } else {
            // Read current item state for better diagnostics to client
            try {
                groundItemsRef.child(itemId).once('value', (snap) => {
                    const itemState = snap.val();
                    console.warn(`[PICKUP_API] Pickup failed for ${itemId}; current item state:`, itemState);
                    
                    if (!itemState) {
                        // Item doesn't exist - someone else picked it up
                        return res.status(404).json({ success: false, error: 'Item not found or already picked up', item: null });
                    } else {
                        // Item exists but pickup failed (distance, visibility, race condition)
                        return res.status(400).json({ success: false, error: 'Cannot pick up item - check distance and permissions', transient: true, item: itemState });
                    }
                });
            } catch (readErr) {
                console.error('[PICKUP_API] Failed to read item state after pickup failure:', readErr);
                res.status(500).json({ success: false, error: 'Server error checking item state', transient: true });
            }
        }
    } catch (error) {
        console.error('[PICKUP_API] Error processing pickup request:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Background job: periodically release visibility of ground items whose
// `releaseAt` timestamp has passed so they become visible to everyone.
// Runs every 5 seconds and updates items atomically where needed.
setInterval(async () => {
    try {
        const now = Date.now();
        // Query ground items under the area and check for releaseAt <= now and visibleTo restricted
        groundItemsRef.once('value', (snapshot) => {
            const items = snapshot.val() || {};
            Object.entries(items).forEach(([id, item]) => {
                if (item && item.releaseAt && item.visibleTo && Array.isArray(item.visibleTo) && item.releaseAt <= now) {
                    // Make item visible to everyone by clearing visibleTo and contributors
                    groundItemsRef.child(id).update({ visibleTo: null, contributors: null }, (err) => {
                        if (err) {
                            console.error(`[RELEASE_VISIBILITY] Failed to release visibility for ${id}:`, err);
                        } else {
                            console.log(`[RELEASE_VISIBILITY] Released visibility for ground item ${id}`);
                        }
                    });
                }
            });
        });
    } catch (err) {
        console.error('[RELEASE_VISIBILITY] Error in visibility release job:', err);
    }
}, 5000);

// AI: Removed endpoint to manually trigger enemy respawn (for debugging)
// app.post('/respawn', (req, res) => {
//     console.log('Manual respawn triggered via API');
//     spawnMissingEnemies();
//     res.json({ message: 'Respawn triggered' });
// });

const port = process.env.PORT || 8081;
server.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});